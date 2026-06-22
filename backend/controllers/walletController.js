const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const {
  roundMoney,
  getWalletOverview,
  lockUserWallet,
  creditWallet,
  debitWallet
} = require('../services/walletService');
const { addBookingPaymentToVault } = require('../services/eventVaultService');
const {
  normalizeSeatCount,
  resolveUnitPrice,
  computePerTicketPromoTotals
} = require('../utils/promoPricing');
const { resolveSeatConfig } = require('../utils/eventSeating');

function normalizeTicketType(ticketType) {
  const value = String(ticketType || 'Standard').trim().toLowerCase();
  if (value === 'vip') return 'Vip';
  if (value === 'special') return 'Special';
  return 'Standard';
}

function getTicketLimits(maxSeats) {
  const config = resolveSeatConfig(maxSeats);
  const limitStandard = config.standard;
  const limitSpecial = config.special;
  const limitVip = config.vip;
  return { limitStandard, limitSpecial, limitVip };
}

function parseSeatSelection({ seatNumbers, seatNumber }) {
  if (Array.isArray(seatNumbers) && seatNumbers.length > 0) {
    const parsed = seatNumbers
      .map((value) => parseInt(value, 10))
      .filter((value) => !Number.isNaN(value) && value > 0);
    const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
    return unique;
  }

  const count = parseInt(seatNumber, 10);
  if (Number.isNaN(count) || count <= 0) return [];
  return Array.from({ length: count }, (_, idx) => idx + 1);
}

function normalizePaymentMethod(paymentMethod) {
  const value = String(paymentMethod || '').trim().toLowerCase();
  if (value === 'wallet' || value === 'wallet-only' || value === 'wallet_only') return 'wallet';
  if (value === 'split' || value === 'wallet+card' || value === 'wallet_card') return 'split';
  return 'card';
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function sanitizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCardLastFour(value) {
  const digits = sanitizeDigits(value);
  return digits.slice(-4);
}

function isValidExpiry(value) {
  const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  return Number.isFinite(month) && month >= 1 && month <= 12;
}

function buildWithdrawalReferenceId() {
  return `WDR-${uuidv4()}`;
}

async function insertPaymentRecord(conn, userId, eventId, amount, paymentMethod) {
  const paymentId = uuidv4();
  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await conn.execute(
    `INSERT INTO payments (id, user_id, event_id, amount, payment_method, status, transaction_id)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
    [paymentId, userId, eventId || null, amount, paymentMethod, transactionId]
  );
  return { paymentId, transactionId };
}

async function applyPromoCodeIfValid(conn, eventId, promoCode, totalAmount, options = {}) {
  const cleanCode = String(promoCode || '').trim().toUpperCase();
  const normalizedTotal = roundMoney(totalAmount) || 0;
  const normalizedSeatCount = normalizeSeatCount(options.seatCount);
  const normalizedUnitPrice = resolveUnitPrice({
    unitPrice: options.unitPrice,
    amount: normalizedTotal,
    seatCount: normalizedSeatCount
  });
  if (!cleanCode) {
    return {
      promoApplied: false,
      promoCode: null,
      discountAmount: 0,
      finalAmount: normalizedTotal,
      discountPerTicket: 0,
      seatCount: normalizedSeatCount,
      unitPrice: normalizedUnitPrice
    };
  }

  const [rows] = await conn.execute(
    `SELECT id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active
     FROM promo_codes
     WHERE event_id = ? AND code = ? AND is_active = TRUE
     LIMIT 1`,
    [eventId, cleanCode]
  );

  if (rows.length === 0) {
    throw new Error('Invalid promo code');
  }

  const promo = rows[0];
  const isExpired = promo.expires_at && new Date(promo.expires_at) < new Date();
  if (isExpired) {
    throw new Error('Promo code has expired');
  }
  const reachedMax = promo.max_uses != null && Number(promo.used_count || 0) >= Number(promo.max_uses || 0);
  if (reachedMax) {
    throw new Error('Promo code reached maximum uses');
  }

  const promoTotals = computePerTicketPromoTotals({
    amount: normalizedTotal,
    seatCount: normalizedSeatCount,
    unitPrice: normalizedUnitPrice,
    discountType: promo.discount_type,
    discountValue: promo.discount_value
  });

  await conn.execute(
    'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?',
    [promo.id]
  );

  return {
    promoApplied: true,
    promoCode: promo.code,
    discountAmount: promoTotals.discountAmount,
    finalAmount: promoTotals.finalAmount,
    discountPerTicket: promoTotals.discountPerTicket,
    seatCount: promoTotals.seatCount,
    unitPrice: promoTotals.unitPrice
  };
}

exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const type = req.query.type || req.query.filter || 'all';
    const wallet = await getWalletOverview(userId, type);

    res.json({
      success: true,
      balance: wallet.balance,
      filter: wallet.filter,
      transactions: wallet.transactions
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wallet data' });
  }
};

exports.topUpWallet = async (req, res) => {
  let connection;
  try {
    const userId = req.user.userId;
    const amount = roundMoney(req.body.amount);

    if (amount == null || amount < 50 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Top-up amount must be between 50 and 10,000 EGP'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const topup = await creditWallet({
      userId,
      amount,
      source: 'top-up',
      description: `Wallet top-up of ${formatCurrency(amount)} EGP`,
      conn: connection
    });

    const payment = await insertPaymentRecord(connection, userId, null, amount, 'card');

    await connection.commit();
    connection.release();
    connection = null;

    await Notification.create(
      userId,
      'Wallet Top-Up Successful',
      `Your wallet has been topped up by ${formatCurrency(amount)} EGP.`,
      'success',
      'wallet_topup_confirmations'
    );

    res.status(201).json({
      success: true,
      message: 'Top-up successful',
      balance: topup.newBalance,
      payment: {
        id: payment.paymentId,
        transactionId: payment.transactionId,
        amount
      },
      walletTransaction: {
        id: topup.transactionId,
        amount,
        type: 'credit',
        source: 'top-up'
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Top-up error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to top up wallet' });
  }
};

exports.withdrawToCard = async (req, res) => {
  let connection;
  try {
    const userId = req.user.userId;
    const amount = roundMoney(req.body.amount);
    const cardNumberDigits = sanitizeDigits(req.body.cardNumber || '');
    const cardLastFour = normalizeCardLastFour(req.body.cardLastFour || cardNumberDigits);
    const cardHolder = String(req.body.cardHolder || '').trim();
    const expiry = String(req.body.expiry || '').trim();

    if (amount == null || amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is 100 EGP'
      });
    }
    if (cardNumberDigits.length < 12 || cardNumberDigits.length > 19) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid card number'
      });
    }
    if (cardLastFour.length !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Card last four digits are required'
      });
    }
    if (cardHolder.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Card holder name is required'
      });
    }
    if (!isValidExpiry(expiry)) {
      return res.status(400).json({
        success: false,
        message: 'Expiry must be in MM/YY format'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const walletRow = await lockUserWallet(userId, connection);
    if (!walletRow) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const [pendingRows] = await connection.execute(
      `SELECT id
       FROM wallet_withdrawals
       WHERE user_id = ? AND status IN ('pending', 'processing')
       LIMIT 1`,
      [userId]
    );
    if (pendingRows.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'You already have a pending withdrawal request'
      });
    }

    const currentBalance = roundMoney(walletRow.wallet_balance || 0) || 0;
    if (amount > currentBalance) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Withdrawal amount exceeds wallet balance (${formatCurrency(currentBalance)} EGP)`
      });
    }

    const referenceId = buildWithdrawalReferenceId();

    const debitResult = await debitWallet({
      userId,
      amount,
      source: 'withdrawal',
      description: `Withdrawal to card ending in ${cardLastFour}`,
      conn: connection
    });

    await connection.execute(
      `INSERT INTO wallet_withdrawals
       (user_id, amount, card_last_four, card_holder, status, reference_id)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [userId, amount, cardLastFour, cardHolder, referenceId]
    );

    await connection.commit();
    connection.release();
    connection = null;

    await Notification.create(
      userId,
      'Withdrawal Requested',
      `Your withdrawal of ${formatCurrency(amount)} EGP to card ending in ${cardLastFour} has been submitted. Reference: ${referenceId}`,
      'info'
    );

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      referenceId,
      estimatedProcessingTime: '3-5 business days',
      balance: debitResult.newBalance
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Wallet withdrawal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to request withdrawal' });
  }
};

exports.getWithdrawals = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.execute(
      `SELECT id, user_id, amount, card_last_four, card_holder, status, requested_at, processed_at, reference_id
       FROM wallet_withdrawals
       WHERE user_id = ?
       ORDER BY requested_at DESC, id DESC`,
      [userId]
    );

    res.json({
      success: true,
      withdrawals: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        amount: roundMoney(row.amount || 0) || 0,
        cardLastFour: row.card_last_four,
        cardHolder: row.card_holder,
        status: row.status,
        requestedAt: row.requested_at,
        processedAt: row.processed_at,
        referenceId: row.reference_id
      }))
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to load withdrawal history' });
  }
};

exports.getWithdrawalStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const referenceId = String(req.params.referenceId || '').trim();

    if (!referenceId) {
      return res.status(400).json({
        success: false,
        message: 'Reference ID is required'
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, amount, card_last_four, card_holder, status, requested_at, processed_at, reference_id
       FROM wallet_withdrawals
       WHERE user_id = ? AND reference_id = ?
       LIMIT 1`,
      [userId, referenceId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    const withdrawal = rows[0];
    res.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amount: roundMoney(withdrawal.amount || 0) || 0,
        cardLastFour: withdrawal.card_last_four,
        cardHolder: withdrawal.card_holder,
        status: withdrawal.status,
        requestedAt: withdrawal.requested_at,
        processedAt: withdrawal.processed_at,
        referenceId: withdrawal.reference_id
      }
    });
  } catch (error) {
    console.error('Get withdrawal status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check withdrawal status' });
  }
};

exports.payForBooking = async (req, res) => {
  let connection;
  try {
    const userId = req.user.userId;
    const eventId = String(req.body.eventId || '').trim();
    const ticketType = normalizeTicketType(req.body.ticketType);
    const selectedSeats = parseSeatSelection(req.body);
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod || req.body.paymentOption);
    const requestedWalletAmount = roundMoney(req.body.walletAmountToUse || req.body.walletAmount || 0) || 0;
    const promoCode = req.body.promoCode;

    if (!eventId) {
      return res.status(400).json({ success: false, message: 'Event ID is required' });
    }
    if (selectedSeats.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one seat must be selected' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [eventRows] = await connection.execute(
      `SELECT id, title, event_date, location, organizer_id, available_seats, max_seats,
              COALESCE(standard_seats, 0) AS standard_seats,
              COALESCE(special_seats, 0) AS special_seats,
              COALESCE(vip_seats, 0) AS vip_seats,
              event_status, COALESCE(lifecycle_status, CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END) AS lifecycle_status,
              COALESCE(price_standard, 0) AS price_standard,
              COALESCE(price_special, 0) AS price_special,
              COALESCE(price_vip, 0) AS price_vip
       FROM events
       WHERE id = ?
       FOR UPDATE`,
      [eventId]
    );

    if (eventRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = eventRows[0];

    if (event.event_status && event.event_status !== 'approved') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'This event is not open for booking yet' });
    }
    if (event.lifecycle_status === 'expired' || new Date(event.event_date) <= new Date()) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'This event has ended and no longer accepts bookings' });
    }

    const requestedCount = selectedSeats.length;
    if (Number(event.available_seats || 0) < requestedCount) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Not enough available seats' });
    }

    const limits = getTicketLimits(event);
    let typeLimit = limits.limitStandard;
    if (ticketType === 'Special') typeLimit = limits.limitSpecial;
    if (ticketType === 'Vip') typeLimit = limits.limitVip;

    const taken = await Booking.getTakenSeatsByEvent(eventId, connection);
    const takenSet = new Set((taken[ticketType] || []).map(Number));
    const outOfRange = selectedSeats.some((seat) => seat < 1 || seat > typeLimit);
    const alreadyTaken = selectedSeats.some((seat) => takenSet.has(seat));
    const duplicate = selectedSeats.length !== new Set(selectedSeats).size;

    if (outOfRange) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Seat numbers must be between 1 and ${typeLimit} for ${ticketType}`
      });
    }
    if (alreadyTaken) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'One or more selected seats are already booked' });
    }
    if (duplicate) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Duplicate seat numbers are not allowed' });
    }

    let unitPrice = Number(event.price_standard || 0);
    if (ticketType === 'Special') unitPrice = Number(event.price_special || 0);
    if (ticketType === 'Vip') unitPrice = Number(event.price_vip || 0);

    const subtotal = roundMoney(unitPrice * requestedCount) || 0;
    const promo = await applyPromoCodeIfValid(connection, eventId, promoCode, subtotal, {
      seatCount: requestedCount,
      unitPrice
    });
    const amountPaid = promo.finalAmount;

    let walletAmountUsed = 0;
    let cardAmount = amountPaid;

    const walletRow = await lockUserWallet(userId, connection);
    if (!walletRow) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const availableWalletBalance = roundMoney(walletRow.wallet_balance || 0) || 0;

    if (paymentMethod === 'wallet') {
      walletAmountUsed = amountPaid;
      cardAmount = 0;
      if (availableWalletBalance < amountPaid) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ${formatCurrency(availableWalletBalance)} EGP`
        });
      }
    } else if (paymentMethod === 'split') {
      if (requestedWalletAmount <= 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Enter a valid wallet amount for split payment' });
      }
      if (requestedWalletAmount > availableWalletBalance) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: `Wallet amount exceeds available balance (${formatCurrency(availableWalletBalance)} EGP)`
        });
      }
      walletAmountUsed = Math.min(requestedWalletAmount, amountPaid);
      cardAmount = roundMoney(amountPaid - walletAmountUsed) || 0;
      if (cardAmount <= 0 && amountPaid > 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: 'Split payment requires part of the amount to be paid by card'
        });
      }
    } else {
      walletAmountUsed = 0;
      cardAmount = amountPaid;
    }

    const bookingId = uuidv4();
    await Booking.create(bookingId, userId, eventId, selectedSeats, ticketType, connection);
    await connection.execute(
      `UPDATE bookings
       SET amount_paid = ?, payment_method = ?, wallet_amount_used = ?
       WHERE id = ?`,
      [amountPaid, paymentMethod, walletAmountUsed, bookingId]
    );

    await connection.execute(
      'UPDATE events SET available_seats = GREATEST(available_seats - ?, 0) WHERE id = ?',
      [requestedCount, eventId]
    );

    if (walletAmountUsed > 0) {
      await debitWallet({
        userId,
        amount: walletAmountUsed,
        source: 'payment',
        description: `Wallet used for booking "${event.title}"`,
        relatedEventId: eventId,
        relatedBookingId: bookingId,
        conn: connection
      });
    }

    const payment = await insertPaymentRecord(connection, userId, eventId, amountPaid, paymentMethod);

    if (amountPaid > 0) {
      const seatLabel = selectedSeats.join(',');
      const payerName = String(req.user.full_name || req.user.fullName || req.user.username || 'attendee').trim() || 'attendee';
      await addBookingPaymentToVault({
        connection,
        eventId,
        bookingId,
        amount: amountPaid,
        description: `Payment for seat(s) ${seatLabel} by ${payerName}`
      });
    }

    await connection.commit();
    connection.release();
    connection = null;

    const booking = await Booking.findByIdWithEvent(bookingId);
    const walletSnapshot = await getWalletOverview(userId, 'all');

    await Notification.create(
      userId,
      'Booking Confirmed',
      `Your booking for "${event.title}" has been confirmed.`,
      'success',
      'booking_confirmations'
    );

    if (walletAmountUsed > 0) {
      await Notification.create(
        userId,
        'Wallet Used for Booking',
        `${formatCurrency(walletAmountUsed)} EGP was deducted from your wallet for "${event.title}".`,
        'info',
        'booking_confirmations'
      );
    }

    if (event.organizer_id) {
      await Notification.create(
        event.organizer_id,
        'New Ticket Reserved!',
        `A user has reserved ${requestedCount} seat(s) for your event "${event.title}".`,
        'info',
        'booking_confirmations'
      );
    }

    res.status(201).json({
      success: true,
      message: 'Payment and booking completed successfully',
      booking,
      payment: {
        id: payment.paymentId,
        transactionId: payment.transactionId,
        method: paymentMethod,
        subtotal,
        discountAmount: promo.discountAmount,
        amountPaid,
        walletAmountUsed,
        cardAmount
      },
      wallet: {
        balance: walletSnapshot.balance
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Wallet booking payment error:', error);
    const statusCode = error.message && error.message.toLowerCase().includes('promo') ? 400 : 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Failed to process booking payment' });
  }
};
