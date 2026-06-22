const pool = require('../config/database');
const Notification = require('../models/Notification');
const VenueBooking = require('../models/VenueBooking');
const { roundMoney } = require('./walletService');

const VENUE_BOOKING_FUNDS_RELEASE_GRACE_HOURS = 24;

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

let venueBookingFundReleaseSchedulerStarted = false;

async function releaseHeldVenueBookingFunds() {
  const bookings = await VenueBooking.findCompletedWithHeldFunds(VENUE_BOOKING_FUNDS_RELEASE_GRACE_HOURS);
  let released = 0;

  for (const booking of bookings) {
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [transactionRows] = await connection.execute(
        `SELECT transaction_id, user_id, amount
         FROM wallet_transactions
         WHERE transaction_id = ?
           AND related_venue_booking_id = ?
           AND type = 'credit'
           AND source = 'venue-booking'
           AND status = 'held'
         FOR UPDATE`,
        [booking.held_transaction_id, booking.id]
      );
      const heldTransaction = transactionRows[0] || null;

      if (!heldTransaction) {
        await connection.rollback();
        connection.release();
        connection = null;
        continue;
      }

      const amount = roundMoney(heldTransaction.amount);
      if (amount == null || amount <= 0) {
        await connection.rollback();
        connection.release();
        connection = null;
        continue;
      }

      await connection.execute(
        `UPDATE wallet_transactions
         SET status = 'available'
         WHERE transaction_id = ?
           AND status = 'held'`,
        [heldTransaction.transaction_id]
      );

      await connection.execute(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + ?,
             frozen_balance = COALESCE(frozen_balance, 0) - ?
         WHERE id = ?`,
        [amount, amount, heldTransaction.user_id]
      );

      await connection.commit();
      connection.release();
      connection = null;

      released += 1;

      await Notification.create(
        heldTransaction.user_id,
        'Funds Available to Withdraw',
        `Your venue booking funds of ${amount.toFixed(2)} EGP for "${booking.venue_name}" are now available to withdraw.`,
        'success',
        'walletTopupConfirmations'
      );
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
      }
      console.error(`Venue booking fund release job: failed for booking ${booking.id}:`, error.message);
    }
  }

  if (released > 0) {
    console.log(`Venue booking fund release job: released funds for ${released} venue booking(s).`);
  }
}

function startVenueBookingFundReleaseJob() {
  if (venueBookingFundReleaseSchedulerStarted) return;
  venueBookingFundReleaseSchedulerStarted = true;

  const runRelease = async () => {
    try {
      await releaseHeldVenueBookingFunds();
    } catch (error) {
      console.error('Venue booking fund release job error:', error.message);
    }
  };

  if (cron) {
    cron.schedule('0 0 * * *', runRelease);
  } else {
    setInterval(runRelease, 24 * 60 * 60 * 1000);
    console.warn('node-cron not installed; using setInterval fallback for venue booking fund release job.');
  }

  console.log('Venue booking fund release scheduler started (daily at midnight).');
}

module.exports = {
  startVenueBookingFundReleaseJob,
  releaseHeldVenueBookingFunds
};
