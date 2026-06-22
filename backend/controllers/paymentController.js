const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const pool = require('../config/database');
const VenueBooking = require('../models/VenueBooking');
const { roundMoney, creditWallet, debitWallet, getWalletOverview, lockUserWallet } = require('../services/walletService');
const { computePerTicketPromoTotals } = require('../utils/promoPricing');
const { confirmVenueBookingAfterPayment } = require('../services/venueBookingService');

function normalizePaymentMethod(value) {
  const method = String(value || 'card').trim().toLowerCase();
  if (method === 'wallet') return 'wallet';
  if (method === 'split') return 'split';
  return 'card';
}

exports.create = async (req, res) => {
  try {
    const {
      amount,
      paymentMethod,
      eventId,
      promoCode,
      seatCount,
      ticketCount,
      unitPrice,
      walletAmount,
      walletAmountUsed,
      walletAmountToUse,
      venueBookingId
    } = req.body;
    const userId = req.user.userId;

    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    if (numAmount == null || isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    if (!eventId) {
      let connection;
      try {
        const topupAmount = roundMoney(numAmount);
        if (topupAmount == null || topupAmount <= 0) {
          return res.status(400).json({ success: false, message: 'Top-up amount must be greater than 0' });
        }

        const paymentId = uuidv4();
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
          `INSERT INTO payments (id, user_id, event_id, amount, payment_method, status, transaction_id)
           VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
          [paymentId, userId, null, topupAmount, paymentMethod || 'card', transactionId]
        );

        await creditWallet({
          userId,
          amount: topupAmount,
          source: 'top-up',
          description: `Wallet top-up via card. TXN: ${transactionId}`,
          conn: connection
        });

        await connection.commit();
        connection.release();
        connection = null;

        await Notification.create(
          userId,
          'Wallet Top-Up Successful',
          `Your wallet has been topped up by ${topupAmount} EGP. Transaction ID: ${transactionId}`,
          'success',
          'wallet_topup_confirmations'
        );

        return res.status(201).json({
          success: true,
          message: 'Payment processed successfully',
          payment: { id: paymentId, transactionId, amount: topupAmount, status: 'completed' }
        });
      } catch (error) {
        if (connection) {
          try { await connection.rollback(); } catch (_) {}
          connection.release();
        }
        throw error;
      }
    }

    const normalizedMethod = normalizePaymentMethod(paymentMethod);
    const paymentId = uuidv4();
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let amountToStore = numAmount;

    if (eventId && promoCode) {
      const code = String(promoCode).trim().toUpperCase();
      const [rows] = await pool.execute(
        `SELECT * FROM promo_codes
         WHERE event_id = ? AND code = ? AND is_active = TRUE
         LIMIT 1`,
        [eventId, code]
      );
      if (rows.length > 0) {
        const promo = rows[0];
        const isExpired = promo.expires_at && new Date(promo.expires_at) < new Date();
        const reachedMax = promo.max_uses != null && promo.used_count >= promo.max_uses;
        if (!isExpired && !reachedMax) {
          const promoTotals = computePerTicketPromoTotals({
            amount: amountToStore,
            discountType: promo.discount_type,
            discountValue: promo.discount_value,
            seatCount: seatCount || ticketCount,
            unitPrice
          });
          amountToStore = promoTotals.finalAmount;
          await pool.execute('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', [promo.id]);
        }
      }
    }

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      let walletAmountUsedResolved = 0;
      const requestedWalletAmount = roundMoney(
        walletAmountToUse ?? walletAmountUsed ?? walletAmount ?? 0
      ) || 0;

      if (eventId) {
        const [eventRows] = await connection.execute(
          `SELECT id, title, organizer_id, venue_booking_id
           FROM events
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [eventId]
        );

        if (eventRows.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const event = eventRows[0];

        if (normalizedMethod === 'wallet' || normalizedMethod === 'split') {
          const walletRow = await lockUserWallet(userId, connection);
          if (!walletRow) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'User not found' });
          }

          const balance = roundMoney(walletRow.wallet_balance || 0) || 0;
          if (normalizedMethod === 'wallet') {
            walletAmountUsedResolved = amountToStore;
          } else {
            if (requestedWalletAmount <= 0 || requestedWalletAmount >= amountToStore) {
              await connection.rollback();
              connection.release();
              return res.status(400).json({
                success: false,
                message: 'Split payment requires a valid wallet amount smaller than the total'
              });
            }
            walletAmountUsedResolved = requestedWalletAmount;
          }

          if (walletAmountUsedResolved > balance) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
              success: false,
              message: `Insufficient wallet balance. Available: ${balance} EGP`
            });
          }

          if (walletAmountUsedResolved > 0) {
            await debitWallet({
              userId,
              amount: walletAmountUsedResolved,
              source: 'payment',
              description: `Wallet used for event publishing fee "${event.title}"`,
              relatedEventId: eventId,
              conn: connection
            });
          }
        }

        await connection.execute(
          `INSERT INTO payments (id, user_id, event_id, amount, payment_method, status, transaction_id)
           VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
          [paymentId, userId, eventId || null, amountToStore, normalizedMethod, transactionId]
        );

        if (event.organizer_id === userId) {
          await connection.execute(
            "UPDATE events SET payment_status = 'paid' WHERE id = ?",
            [eventId]
          );
        }

        const bookingIdToConfirm = Number(venueBookingId || event.venue_booking_id || 0) || null;
        let paymentVenueBooking = null;
        if (bookingIdToConfirm) {
          const [bookingRows] = await connection.execute(
            `SELECT id, status, host_id
             FROM venue_bookings
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [bookingIdToConfirm]
          );
          const venueBooking = bookingRows[0] || null;
          if (!venueBooking) {
            throw new Error('Venue booking not found');
          }
          if (venueBooking.host_id !== userId) {
            throw new Error('Venue booking does not belong to this host');
          }

          if (venueBooking.status === 'awaiting_event_approval' || venueBooking.status === 'pending_venue_response') {
            await connection.execute(
              `UPDATE venue_bookings
               SET event_id = ?, payment_status = 'paid'
              WHERE id = ?`,
              [eventId, bookingIdToConfirm]
            );
            paymentVenueBooking = await VenueBooking.findById(bookingIdToConfirm, connection);
          } else {
            paymentVenueBooking = await confirmVenueBookingAfterPayment({
              connection,
              venueBookingId: bookingIdToConfirm,
              eventId,
              hostId: userId
            });
          }
        }

        await connection.commit();
        connection.release();
        connection = null;

        const walletSnapshot = walletAmountUsedResolved > 0
          ? await getWalletOverview(userId, 'all')
          : null;

        await Notification.create(
          userId,
          'Payment Successful',
          `Your payment of ${amountToStore} EGP has been processed successfully. Transaction ID: ${transactionId}`,
          'success'
        );

        if (paymentVenueBooking && paymentVenueBooking.status === 'confirmed') {
          await Notification.create(
            userId,
            'Venue Booking Confirmed',
            `Venue ${paymentVenueBooking.venue_name || 'venue'} has been confirmed for ${String(paymentVenueBooking.event_date || '').slice(0, 10)}.`,
            'success'
          );
        }

        return res.status(201).json({
          success: true,
          message: 'Payment processed successfully',
          payment: {
            id: paymentId,
            transactionId,
            amount: amountToStore,
            walletAmountUsed: walletAmountUsedResolved,
            cardAmount: roundMoney(amountToStore - walletAmountUsedResolved) || 0,
            method: normalizedMethod,
            status: 'completed'
          },
          wallet: walletSnapshot ? { balance: walletSnapshot.balance } : null,
          venueBooking: paymentVenueBooking
            ? {
              id: paymentVenueBooking.id,
              status: paymentVenueBooking.status,
              paymentStatus: paymentVenueBooking.payment_status,
              bookedAt: paymentVenueBooking.booked_at
            }
            : null
        });
      }

      await connection.execute(
        `INSERT INTO payments (id, user_id, event_id, amount, payment_method, status, transaction_id)
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
        [paymentId, userId, null, amountToStore, normalizedMethod, transactionId]
      );
      await connection.commit();
      connection.release();
      connection = null;

      res.status(201).json({
        success: true,
        message: 'Payment processed successfully',
        payment: { id: paymentId, transactionId, amount: amountToStore, status: 'completed' }
      });
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
      }
      throw error;
    }
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, message: 'Error processing payment' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { eventId } = req.body;

    const updated = await Payment.updateEventId(id, userId, eventId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    res.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ success: false, message: 'Error updating payment' });
  }
};

exports.getMy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const payments = await Payment.findByUserId(userId);
    res.json({ success: true, payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching payments' });
  }
};
