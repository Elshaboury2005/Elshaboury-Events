/**
 * venueOwnerEscrowService.js
 *
 * Scheduled jobs for the Venue Owner escrow flow:
 *  1. autoExpireVenueRequests — decline booking requests with no response within VENUE_RESPONSE_WINDOW_HOURS
 *  2. releaseCompletedEventFunds — release held wallet funds after event ends + grace period
 */

const pool = require('../config/database');
const Notification = require('../models/Notification');
const VenueBooking = require('../models/VenueBooking');
const {
  releaseFundsToVenueOwner,
  refundHeldFundsToHost,
  holdFundsForVenueOwner,
  creditWallet,
  roundMoney
} = require('./walletService');

// Configurable windows (can be set via .env)
const VENUE_RESPONSE_WINDOW_HOURS = parseInt(process.env.VENUE_RESPONSE_WINDOW_HOURS || '48', 10);
const ESCROW_RELEASE_GRACE_HOURS = parseInt(process.env.ESCROW_RELEASE_GRACE_HOURS || '24', 10);

async function autoExpireVenueRequests() {
  let expired = 0;
  try {
    const timedOutBookings = await VenueBooking.findExpiredPendingRequests(VENUE_RESPONSE_WINDOW_HOURS);

    for (const booking of timedOutBookings) {
      // Atomically update status only if still pending_venue_response
      const [result] = await pool.execute(
        `UPDATE venue_bookings
         SET status = 'declined_auto_expired', responded_at = NOW()
         WHERE id = ? AND status = 'pending_venue_response'`,
        [booking.id]
      );
      if (result.affectedRows === 0) continue;

      expired += 1;

      // Check if parent event is approved by admin
      const [eventRows] = await pool.execute(
        'SELECT event_status FROM events WHERE id = ? LIMIT 1',
        [booking.event_id]
      );
      const event = eventRows[0] || null;
      const isEventApproved = event && event.event_status === 'approved';

      if (isEventApproved) {
        await pool.execute(
          "UPDATE events SET event_status = 'pending_venue' WHERE id = ?",
          [booking.event_id]
        );
      }

      // Notify host that the venue didn't respond — they need to pick another venue
      if (booking.host_id) {
        if (isEventApproved) {
          await Notification.create(
            booking.host_id,
            'Venue Request Expired',
            `Your venue booking for "${booking.venue_name}" has expired due to no response from the venue owner. Please select a new venue for your event from your event details page. Your previous venue payment will be applied to your new venue selection.`,
            'warning',
            'eventCancellationAlerts'
          );
        } else {
          await Notification.create(
            booking.host_id,
            'Venue Request Expired',
            `The venue "${booking.venue_name}" did not respond to your booking request within ${VENUE_RESPONSE_WINDOW_HOURS} hours. Please choose a different venue for your event.`,
            'warning',
            'eventCancellationAlerts'
          );
        }
      }

      // Notify venue owner too (informational)
      if (booking.venue_owner_id) {
        await Notification.create(
          booking.venue_owner_id,
          'Booking Request Expired',
          `A booking request from ${booking.host_name || 'a host'} for ${booking.event_date} was auto-expired after ${VENUE_RESPONSE_WINDOW_HOURS} hours with no response.`,
          'info'
        );
      }
    }

    if (expired > 0) {
      console.log(`Escrow job: auto-expired ${expired} venue request(s).`);
    }
  } catch (error) {
    console.error('autoExpireVenueRequests error:', error.message);
  }
}

async function releaseCompletedEventFunds() {
  let released = 0;
  try {
    const readyBookings = await VenueBooking.findCompletedWithHeldFunds(ESCROW_RELEASE_GRACE_HOURS);

    for (const booking of readyBookings) {
      let connection;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await releaseFundsToVenueOwner({
          venueOwnerId: booking.venue_owner_id || booking.held_for_user_id,
          amount: booking.held_amount,
          venueBookingId: booking.id,
          heldTransactionId: booking.held_transaction_id,
          description: `Venue booking funds released for event on ${booking.event_date}`,
          conn: connection
        });

        // Mark booking as completed to prevent re-processing
        await connection.execute(
          `UPDATE venue_bookings SET status = 'confirmed', payment_status = 'paid'
           WHERE id = ? AND status IN ('accepted','confirmed')`,
          [booking.id]
        );

        await connection.commit();
        connection.release();
        connection = null;

        released += 1;

        // Notify venue owner funds are available
        if (booking.venue_owner_id) {
          await Notification.create(
            booking.venue_owner_id,
            'Funds Available to Withdraw',
            `Your booking funds of ${Number(booking.held_amount || 0).toFixed(2)} EGP for the event on ${booking.event_date} have been released and are now available to withdraw.`,
            'success',
            'walletTopupConfirmations'
          );
        }
      } catch (releaseError) {
        if (connection) {
          try { await connection.rollback(); } catch (_) {}
          connection.release();
        }
        console.error(`releaseCompletedEventFunds: failed for booking ${booking.id}:`, releaseError.message);
      }
    }

    if (released > 0) {
      console.log(`Escrow job: released funds for ${released} venue booking(s).`);
    }
  } catch (error) {
    console.error('releaseCompletedEventFunds error:', error.message);
  }
}

/**
 * Cancel a venue booking and refund held funds to host.
 * Used by: host cancellation, admin cancellation, owner cancellation.
 * Structured for a policy engine to be added later without a rewrite.
 */
async function cancelAndRefundVenueBooking({
  venueBookingId,
  hostId,
  forceFullRefund = true, // v1: always full refund
  connection
}) {
  const booking = await VenueBooking.findById(venueBookingId, connection);
  if (!booking) return { refundAmount: 0, reason: 'Booking not found' };

  if (['cancelled', 'declined', 'declined_auto_expired'].includes(booking.status)) {
    return { refundAmount: 0, reason: 'Booking already cancelled/declined' };
  }

  // Find any held transaction for this booking
  const db = connection || pool;
  const heldTx = await db.execute(
    `SELECT transaction_id, amount, user_id
     FROM wallet_transactions
     WHERE related_venue_booking_id = ?
       AND status = 'held'
       AND type = 'credit'
       AND source = 'venue-booking'
     LIMIT 1`,
    [venueBookingId]
  );
  const heldRow = heldTx[0]?.[0] || null;

  let refundAmount = 0;
  let refundTransactionId = null;

  if (heldRow && heldRow.amount > 0) {
    const venueOwnerId = heldRow.user_id;
    const refundResult = await refundHeldFundsToHost({
      venueOwnerId,
      hostId: hostId || booking.host_id,
      amount: heldRow.amount,
      venueBookingId,
      heldTransactionId: heldRow.transaction_id,
      description: `Refund for cancelled venue booking (venue: ${booking.venue_name || 'venue'})`,
      conn: connection
    });
    refundAmount = refundResult.refundAmount || 0;
    refundTransactionId = refundResult.refundTransactionId || null;
  } else if (booking.status === 'awaiting_dual_approval') {
    // Funds were debited from host during event creation payment but not yet held for venue owner.
    // Refund the full combined amount (venue fee + platform fee) directly to the host.
    const pendingVenueFee = Number(booking.pending_venue_fee || 0);
    const pendingPlatformFee = Number(booking.pending_platform_fee || 0);
    const totalRefund = roundMoney(pendingVenueFee + pendingPlatformFee) || 0;
    if (totalRefund > 0) {
      const refundResult = await creditWallet({
        userId: hostId || booking.host_id,
        amount: totalRefund,
        source: 'refund',
        description: `Refund for cancelled venue booking (venue fee ${pendingVenueFee} EGP + platform fee ${pendingPlatformFee} EGP): ${booking.venue_name || 'venue'}`,
        conn: connection
      });
      refundAmount = totalRefund;
      refundTransactionId = refundResult.transactionId;
    }
  }

  // Update booking to cancelled
  await VenueBooking.update(venueBookingId, {
    status: 'cancelled',
    paymentStatus: refundAmount > 0 ? 'refunded' : booking.payment_status,
    respondedAt: new Date().toISOString()
  }, connection);

  return {
    refundAmount,
    refundTransactionId,
    booking
  };
}

const { v4: uuidv4 } = require('uuid');

async function checkAndTransferVenuePayment(venueBookingId) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Query the venue booking
    const booking = await VenueBooking.findById(venueBookingId, connection);
    if (!booking) {
      console.log(`[checkAndTransferVenuePayment] Booking ${venueBookingId} not found.`);
      await connection.rollback();
      connection.release();
      return;
    }

    // 2. Query the parent event
    if (!booking.event_id) {
      console.log(`[checkAndTransferVenuePayment] Booking ${venueBookingId} has no event_id.`);
      await connection.rollback();
      connection.release();
      return;
    }

    const [eventRows] = await connection.execute(
      'SELECT id, event_status, title FROM events WHERE id = ? LIMIT 1',
      [booking.event_id]
    );
    const event = eventRows[0] || null;
    if (!event) {
      console.log(`[checkAndTransferVenuePayment] Event for booking ${venueBookingId} not found.`);
      await connection.rollback();
      connection.release();
      return;
    }

    // Check conditions: accepted_by_owner = true (which means status === 'accepted_by_owner') AND parent event status = approved
    const isAcceptedByOwner = booking.status === 'accepted_by_owner';
    const isEventApproved = event.event_status === 'approved';
    const isAlreadyTransferred = booking.payment_status === 'transferred';

    console.log(`[checkAndTransferVenuePayment] Booking status: ${booking.status}, Event status: ${event.event_status}, Payment status: ${booking.payment_status}`);

    let shouldCreateChat = false;
    if (isAcceptedByOwner && isEventApproved && !isAlreadyTransferred) {
      const pendingVenueFee = Number(booking.pending_venue_fee || 0);
      const pendingPlatformFee = Number(booking.pending_platform_fee || 0);

      // Call the existing holdFundsForVenueOwner function with the stored pending_venue_fee amount
      if (pendingVenueFee > 0) {
        // Temporarily credit the host's wallet to keep ledger balanced
        await creditWallet({
          userId: booking.host_id,
          amount: pendingVenueFee,
          source: 'venue-booking',
          description: `Internal release: pending venue fee from event creation holding`,
          conn: connection
        });

        await holdFundsForVenueOwner({
          hostId: booking.host_id,
          venueOwnerId: booking.venue_owner_id,
          amount: pendingVenueFee,
          venueBookingId: booking.id,
          eventId: booking.event_id,
          description: `Venue booking payment for "${booking.venue_name}" on ${booking.event_date} (held in escrow)`,
          conn: connection
        });
      }

      // Platform fee is collected at admin approval — not at venue owner acceptance.
      // The creditPlatformFee() call has been moved to adminController.js updateEventApproval
      // so the fee is credited the moment admin approves, matching the platform business rule.
      // pending_platform_fee stays on the venue_bookings row as a historical reference.

      // Update venue_booking.payment_status = 'transferred' and status = 'confirmed'
      await connection.execute(
        `UPDATE venue_bookings
         SET payment_status = 'transferred', status = 'confirmed'
         WHERE id = ?`,
        [booking.id]
      );

      shouldCreateChat = true;
    }

    await connection.commit();
    connection.release();
    connection = null;

    if (shouldCreateChat) {
      // Create chat and send chat notifications
      const { createVenueBookingChat } = require('./directChatService');
      if (booking.venue_owner_id && booking.host_id) {
        await createVenueBookingChat(booking.id, booking.host_id, booking.venue_owner_id);

        await Notification.create(
          booking.host_id,
          'Direct Chat Available',
          'Your venue booking is confirmed — you can now chat with the venue owner',
          'info'
        );

        await Notification.create(
          booking.venue_owner_id,
          'Direct Chat Available',
          'Booking confirmed — you can now chat with the event host',
          'info'
        );
      }

      console.log(`[checkAndTransferVenuePayment] Successfully transferred payment for booking ${booking.id}`);
    }
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error(`[checkAndTransferVenuePayment] Error transferring venue payment for booking ${venueBookingId}:`, error);
    throw error;
  }
}

async function handleAdminEventRejectionRefund(eventId, adminUserId) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Query the venue_bookings table for any booking where event_id matches the rejected event AND payment_status is NOT already 'refunded'.
    const [bookings] = await connection.execute(
      `SELECT id, host_id, status, payment_status, event_date,
              pending_venue_fee, pending_platform_fee, venue_id
       FROM venue_bookings
       WHERE event_id = ? AND payment_status <> 'refunded'`,
      [eventId]
    );

    let totalRefund = 0;
    let hostRefunded = false;

    for (const booking of bookings) {
      // get the pending_venue_fee and pending_platform_fee. Add them together.
      const pendingVenueFee = Number(booking.pending_venue_fee || 0);
      const pendingPlatformFee = Number(booking.pending_platform_fee || 0);
      const bookingRefund = pendingVenueFee + pendingPlatformFee;
      
      totalRefund += bookingRefund;

      if (bookingRefund > 0) {
        // Add that total amount to the host's wallet balance.
        await connection.execute(
          `UPDATE wallets SET balance = balance + ? WHERE user_id = ?`,
          [bookingRefund, booking.host_id]
        );

        // Insert a new row into wallet_transactions: wallet_id of the host, type 'refund', amount equals the total added, description exactly 'Full refund for venue booking due to admin event rejection'.
        const [walletRows] = await connection.execute(
          `SELECT id FROM wallets WHERE user_id = ? LIMIT 1`,
          [booking.host_id]
        );
        const walletId = walletRows[0].id;
        
        await connection.execute(
          `INSERT INTO wallet_transactions (id, wallet_id, user_id, amount, type, source, status, description, related_event_id, related_venue_booking_id)
           VALUES (?, ?, ?, ?, 'refund', 'refund', 'completed', 'Full refund for venue booking due to admin event rejection', ?, ?)`,
          [uuidv4(), walletId, booking.host_id, bookingRefund, eventId, booking.id]
        );
        
        hostRefunded = true;
      }

      // Update the venue_bookings table: set status to 'cancelled', payment_status to 'refunded', pending_venue_fee to 0, and pending_platform_fee to 0.
      await connection.execute(
        `UPDATE venue_bookings
         SET status = 'cancelled', payment_status = 'refunded', pending_venue_fee = 0, pending_platform_fee = 0
         WHERE id = ?`,
        [booking.id]
      );
      
      // Note: If funds were escrowed for the venue owner, we need to release them from the owner's frozen_balance 
      // otherwise the owner's frozen balance remains stuck. We find any held transaction and release it.
      const [heldTxs] = await connection.execute(
        `SELECT transaction_id, user_id, amount FROM wallet_transactions 
         WHERE related_venue_booking_id = ? AND status = 'held' AND type = 'credit' AND source = 'venue-booking'`,
        [booking.id]
      );
      for (const held of heldTxs) {
        await connection.execute(
          `UPDATE wallets SET frozen_balance = GREATEST(0, frozen_balance - ?) WHERE user_id = ?`,
          [held.amount, held.user_id]
        );
        await connection.execute(
          `UPDATE wallet_transactions SET status = 'cancelled', description = CONCAT(description, ' (Cancelled due to admin rejection)') WHERE transaction_id = ?`,
          [held.transaction_id]
        );
      }
    }

    await connection.commit();
    connection.release();
    connection = null;

    // Send notifications outside transaction
    const Notification = require('../models/Notification');
    if (hostRefunded && totalRefund > 0) {
      await Notification.create(
        booking.host_id,
        'Event Rejected - Refund Issued',
        `Your event was rejected by the admin. A full refund of ${totalRefund.toFixed(2)} EGP (venue fee + platform fee) has been credited to your wallet.`,
        'warning'
      );
    }

    // Notify venue owner if they had accepted
    if (booking.status === 'accepted_by_owner' || booking.status === 'confirmed' || booking.status === 'accepted') {
      const [venueRows] = await pool.execute(
        'SELECT owner_id, name FROM venues WHERE id = ? LIMIT 1',
        [booking.venue_id]
      );
      if (venueRows[0] && venueRows[0].owner_id) {
        const formattedDate = String(booking.event_date || '').slice(0, 10);
        await Notification.create(
          venueRows[0].owner_id,
          'Venue Booking Cancelled',
          `The event booked for your venue "${venueRows[0].name}" on ${formattedDate} was rejected by the admin. The booking has been cancelled.`,
          'info'
        );
      }
    }

    return { success: true, refunded: true, totalRefund };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('[handleAdminEventRejectionRefund] Error:', error);
    throw error;
  }
}

// ── Host-Initiated Event Cancellation Refund Flow ──────────────────

function getSeatCountFromBooking(booking) {
  if (!booking) return 1;
  const rawSeatNumbers = booking.seat_numbers;
  if (rawSeatNumbers && typeof rawSeatNumbers === 'string') {
    const seats = rawSeatNumbers
      .split(',')
      .map((seat) => parseInt(seat.trim(), 10))
      .filter((seat) => !isNaN(seat) && seat > 0);
    if (seats.length > 0) return seats.length;
  }
  const fallback = parseInt(booking.seat_number, 10);
  return !isNaN(fallback) && fallback > 0 ? fallback : 1;
}

function normalizeTicketType(ticketType) {
  const type = String(ticketType || 'standard').trim().toLowerCase();
  if (type === 'vip') return 'vip';
  if (type === 'special') return 'special';
  return 'standard';
}

function estimateBookingAmountFromEventPricing(booking, eventPricing) {
  const seatsCount = getSeatCountFromBooking(booking);
  const type = normalizeTicketType(booking?.ticket_type || 'standard');
  let unitPrice = Number(eventPricing?.price_standard || 0);
  if (type === 'special') unitPrice = Number(eventPricing?.price_special || 0);
  if (type === 'vip') unitPrice = Number(eventPricing?.price_vip || 0);
  return roundMoney(seatsCount * unitPrice) || 0;
}

function formatMoney(value) {
  const num = Number(value);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

async function handleHostEventCancellation(eventId, hostUserId) {
  let connection;
  try {
    const { ensureWalletInfrastructure, creditWalletRefundInTransaction, insertNotificationInTransaction } = require('../utils/refundWalletUtils');
    const { processRefundFromVault } = require('./eventVaultService');

    await ensureWalletInfrastructure(pool);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Get the event and lock it
    const [eventRows] = await connection.execute(
      `SELECT id, title, organizer_id, max_seats, event_date, venue_booking_id,
              COALESCE(price_standard, 0) AS price_standard,
              COALESCE(price_special, 0) AS price_special,
              COALESCE(price_vip, 0) AS price_vip
       FROM events
       WHERE id = ?
       FOR UPDATE`,
      [eventId]
    );

    if (eventRows.length === 0) {
      throw new Error('Event not found');
    }

    const event = eventRows[0];
    if (event.organizer_id !== hostUserId) {
      throw new Error('Only the organizer can cancel this event');
    }

    // 2. Retrieve all confirmed attendee bookings
    const [bookings] = await connection.execute(
      `SELECT b.id, b.user_id, b.event_id, b.seat_number, b.seat_numbers, b.ticket_type,
              COALESCE(b.amount_paid, 0) AS amount_paid,
              COALESCE(b.wallet_amount_used, 0) AS wallet_amount_used,
              COALESCE(b.payment_method, 'card') AS payment_method,
              u.full_name
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.event_id = ? AND b.status = 'confirmed'
       FOR UPDATE`,
      [eventId]
    );

    let totalRefundAmount = 0;
    const attendeeSummaries = [];

    // 3. Process attendee refunds
    for (const booking of bookings) {
      let refundAmount = roundMoney(booking.amount_paid || 0) || 0;
      if (refundAmount <= 0) {
        const walletUsed = roundMoney(booking.wallet_amount_used || 0) || 0;
        if (walletUsed > 0) {
          refundAmount = walletUsed;
        }
      }
      if (refundAmount <= 0) {
        refundAmount = estimateBookingAmountFromEventPricing(booking, event);
      }
      if (refundAmount <= 0) {
        const [paymentRows] = await connection.execute(
          `SELECT amount
           FROM payments
           WHERE user_id = ? AND event_id = ? AND status = 'completed'
           ORDER BY created_at DESC
           LIMIT 1`,
          [booking.user_id, eventId]
        );
        if (paymentRows.length > 0) {
          refundAmount = roundMoney(paymentRows[0].amount || 0) || 0;
        }
      }

      // Update booking to cancelled
      await connection.execute(
        'UPDATE bookings SET status = ? WHERE id = ?',
        ['cancelled', booking.id]
      );
      // Delete checkins
      await connection.execute('DELETE FROM booking_ticket_checkins WHERE booking_id = ?', [booking.id]);
      await connection.execute('DELETE FROM event_checkins WHERE booking_id = ?', [booking.id]);

      let walletBalance = null;
      let vaultBalance = null;

      if (refundAmount > 0) {
        // Process from event vault
        const vaultResult = await processRefundFromVault({
          connection,
          eventId,
          bookingId: booking.id,
          amount: refundAmount,
          description: `Refund for cancelled event "${event.title}" (${booking.full_name || 'attendee'})`
        });
        vaultBalance = roundMoney(vaultResult?.vault?.balance || 0) || 0;

        // Credit attendee wallet
        const creditResult = await creditWalletRefundInTransaction({
          connection,
          userId: booking.user_id,
          amount: refundAmount,
          description: `Refund for cancelled event "${event.title}"`,
          relatedEventId: eventId,
          relatedBookingId: booking.id,
        });
        walletBalance = creditResult.walletBalance;
        totalRefundAmount = roundMoney(totalRefundAmount + refundAmount) || 0;

        // Send vault refund notification to host
        await insertNotificationInTransaction({
          connection,
          userId: hostUserId,
          title: 'Vault Refund Processed',
          message: `A refund of ${formatMoney(refundAmount)} EGP was processed from your event vault for ${booking.full_name || 'an attendee'}.`,
          type: 'warning'
        });
      }

      if (walletBalance == null) {
        const [walletRows] = await connection.execute(
          'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
          [booking.user_id]
        );
        walletBalance = roundMoney(walletRows[0]?.wallet_balance || 0) || 0;
      }

      const attendeeMessage = refundAmount > 0
        ? `Event "${event.title}" was cancelled. ${formatMoney(refundAmount)} EGP has been credited to your wallet.`
        : `Event "${event.title}" was cancelled. No wallet credit was issued because amount paid was 0 EGP.`;

      await insertNotificationInTransaction({
        connection,
        userId: booking.user_id,
        title: 'Event Cancelled',
        message: attendeeMessage,
        type: refundAmount > 0 ? 'warning' : 'info'
      });

      attendeeSummaries.push({
        bookingId: booking.id,
        userId: booking.user_id,
        fullName: booking.full_name || 'Attendee',
        refundAmount,
        paymentMethod: booking.payment_method,
        walletBalance,
        vaultBalance
      });
    }

    // 4. Update the event status
    await connection.execute(
      `UPDATE events
       SET lifecycle_status = 'expired',
           expired_at = COALESCE(expired_at, NOW()),
           available_seats = max_seats
       WHERE id = ?`,
      [eventId]
    );

    // 5. Retrieve the venue booking associated with this event
    const [venueBookings] = await connection.execute(
      `SELECT id, venue_id, host_id, status, payment_status, event_date,
              COALESCE(pending_venue_fee, 0) AS pending_venue_fee,
              COALESCE(pending_platform_fee, 0) AS pending_platform_fee
       FROM venue_bookings
       WHERE event_id = ? AND status <> 'cancelled'`,
      [eventId]
    );

    let venueBookingSummary = null;
    let venueRefundAmount = 0;

    if (venueBookings.length > 0) {
      const venueBooking = venueBookings[0];
      const pendingVenueFee = Number(venueBooking.pending_venue_fee || 0);

      // Check if it's already transferred/confirmed and funds are held in escrow for the venue owner
      if (venueBooking.payment_status === 'transferred') {
        // Look up the held transaction
        const [heldTxRows] = await connection.execute(
          `SELECT transaction_id, amount, user_id
           FROM wallet_transactions
           WHERE related_venue_booking_id = ?
             AND status = 'held'
             AND type = 'credit'
             AND source = 'venue-booking'
           LIMIT 1`,
          [venueBooking.id]
        );
        const heldRow = heldTxRows[0] || null;

        if (heldRow && heldRow.amount > 0) {
          const venueOwnerId = heldRow.user_id;
          const refundResult = await refundHeldFundsToHost({
            venueOwnerId,
            hostId: hostUserId,
            amount: heldRow.amount,
            venueBookingId: venueBooking.id,
            heldTransactionId: heldRow.transaction_id,
            description: `Refund for cancelled venue booking (venue fee)`,
            conn: connection
          });
          venueRefundAmount = refundResult.refundAmount || 0;
        }
      } else {
        // Not transferred/confirmed yet (e.g. awaiting_dual_approval).
        // Refund ONLY the pending_venue_fee to the host's wallet. Do NOT refund pending_platform_fee.
        if (pendingVenueFee > 0) {
          await creditWallet({
            userId: hostUserId,
            amount: pendingVenueFee,
            source: 'refund',
            description: `Refund for cancelled venue booking (venue fee)`,
            conn: connection
          });
          venueRefundAmount = pendingVenueFee;
        }
      }

      // Update venue booking to cancelled, setting payment status to refunded if refunded
      await connection.execute(
        `UPDATE venue_bookings
         SET status = 'cancelled',
             payment_status = ?,
             responded_at = NOW()
         WHERE id = ?`,
        [venueRefundAmount > 0 ? 'refunded' : venueBooking.payment_status, venueBooking.id]
      );

      // Fetch venue details for notification
      const [venueRows] = await connection.execute(
        'SELECT owner_id, name FROM venues WHERE id = ? LIMIT 1',
        [venueBooking.venue_id]
      );

      let venueName = 'venue';
      if (venueRows[0]) {
        venueName = venueRows[0].name;
        if (venueRows[0].owner_id) {
          const formattedDate = String(venueBooking.event_date || '').slice(0, 10);
          await insertNotificationInTransaction({
            connection,
            userId: venueRows[0].owner_id,
            title: 'Venue Booking Cancelled',
            message: `The event booked for your venue "${venueName}" on ${formattedDate} was cancelled by the host.`,
            type: 'info'
          });
        }
      }

      venueBookingSummary = {
        id: venueBooking.id,
        status: 'cancelled',
        paymentStatus: venueRefundAmount > 0 ? 'refunded' : venueBooking.payment_status,
        refundAmount: venueRefundAmount,
        reason: 'Host cancelled event'
      };
    }

    const venueSummaryLine = venueBookingSummary
      ? (venueRefundAmount > 0
        ? ` Venue refund issued: ${formatMoney(venueRefundAmount)} EGP.`
        : ` Venue booking cancelled. No venue refund issued.`)
      : '';

    // 6. Notify host of successful cancellation
    await insertNotificationInTransaction({
      connection,
      userId: hostUserId,
      title: 'Event Cancelled Successfully',
      message: `"${event.title}" was cancelled. ${bookings.length} booking(s) affected, total attendee refunds: ${formatMoney(totalRefundAmount)} EGP.${venueSummaryLine}`,
      type: 'success'
    });

    await connection.commit();
    connection.release();
    connection = null;

    return {
      success: true,
      summary: {
        eventId,
        eventTitle: event.title,
        totalBookingsAffected: attendeeSummaries.length,
        totalRefundAmount: roundMoney(totalRefundAmount) || 0,
        venueRefundAmount,
        venueBooking: venueBookingSummary,
        attendees: attendeeSummaries
      }
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('[handleHostEventCancellation] Error:', error);
    throw error;
  }
}

module.exports = {
  autoExpireVenueRequests,
  releaseCompletedEventFunds,
  cancelAndRefundVenueBooking,
  checkAndTransferVenuePayment,
  handleAdminEventRejectionRefund,
  handleHostEventCancellation,
  VENUE_RESPONSE_WINDOW_HOURS,
  ESCROW_RELEASE_GRACE_HOURS
};

