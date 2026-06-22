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
  refundHeldFundsToHost
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

      // Notify host that the venue didn't respond — they need to pick another venue
      if (booking.host_id) {
        await Notification.create(
          booking.host_id,
          'Venue Request Expired',
          `The venue "${booking.venue_name}" did not respond to your booking request within ${VENUE_RESPONSE_WINDOW_HOURS} hours. Please choose a different venue for your event.`,
          'warning',
          'eventCancellationAlerts'
        );
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

module.exports = {
  autoExpireVenueRequests,
  releaseCompletedEventFunds,
  cancelAndRefundVenueBooking,
  VENUE_RESPONSE_WINDOW_HOURS,
  ESCROW_RELEASE_GRACE_HOURS
};
