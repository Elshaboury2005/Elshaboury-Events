const pool = require('../config/database');
const Notification = require('../models/Notification');

const VENUE_BOOKING_RESPONSE_WINDOW_HOURS = 48;

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

let venueBookingExpirySchedulerStarted = false;

async function expirePendingVenueBookings() {
  const [bookings] = await pool.execute(
    `SELECT vb.id, vb.host_id, vb.event_date, v.name AS venue_name
     FROM venue_bookings vb
     INNER JOIN venues v ON v.id = vb.venue_id
     WHERE vb.status = 'pending_venue_response'
       AND vb.booked_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [VENUE_BOOKING_RESPONSE_WINDOW_HOURS]
  );

  let expired = 0;

  for (const booking of bookings) {
    const [result] = await pool.execute(
      `UPDATE venue_bookings
       SET status = 'declined_auto_expired', responded_at = NOW()
       WHERE id = ? AND status = 'pending_venue_response'`,
      [booking.id]
    );

    if (result.affectedRows === 0) continue;

    expired += 1;

    if (booking.host_id) {
      await Notification.create(
        booking.host_id,
        'Venue Request Expired',
        `The venue owner did not respond to your booking request for "${booking.venue_name}" within ${VENUE_BOOKING_RESPONSE_WINDOW_HOURS} hours. Please choose another venue.`,
        'warning',
        'eventCancellationAlerts'
      );
    }
  }

  if (expired > 0) {
    console.log(`Venue booking expiry job: auto-expired ${expired} pending venue booking request(s).`);
  }
}

function startVenueBookingExpiryJob() {
  if (venueBookingExpirySchedulerStarted) return;
  venueBookingExpirySchedulerStarted = true;

  const runExpiry = async () => {
    try {
      await expirePendingVenueBookings();
    } catch (error) {
      console.error('Venue booking expiry job error:', error.message);
    }
  };

  if (cron) {
    cron.schedule('0 * * * *', runExpiry);
  } else {
    setInterval(runExpiry, 60 * 60 * 1000);
    console.warn('node-cron not installed; using setInterval fallback for venue booking expiry job.');
  }

  console.log('Venue booking expiry scheduler started (hourly).');
}

module.exports = {
  startVenueBookingExpiryJob,
  expirePendingVenueBookings
};
