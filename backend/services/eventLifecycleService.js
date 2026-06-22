const pool = require('../config/database');
const Notification = require('../models/Notification');
const { releaseEventVaultIfExpired } = require('./eventVaultService');
let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

let schedulerStarted = false;

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

async function buildOrganizerExpirySummary(eventId) {
  const [rows] = await pool.execute(
    `
    SELECT
      SUM(CASE WHEN b.status = 'confirmed' THEN ${seatsCountExpression} ELSE 0 END) AS confirmed_seats,
      SUM(
        CASE
          WHEN b.status = 'confirmed' THEN
            ${seatsCountExpression} *
            CASE
              WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'vip' THEN COALESCE(e.price_vip, 0)
              WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'special' THEN COALESCE(e.price_special, 0)
              ELSE COALESCE(e.price_standard, 0)
            END
          ELSE 0
        END
      ) AS total_revenue
    FROM events e
    LEFT JOIN bookings b ON b.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id
  `,
    [eventId]
  );
  return {
    confirmedSeats: Number(rows[0]?.confirmed_seats || 0),
    totalRevenue: Number(rows[0]?.total_revenue || 0)
  };
}

async function expirePastEvents() {
  const [eventsToExpire] = await pool.execute(
    `
    SELECT id, organizer_id, title, event_date
    FROM events
    WHERE (lifecycle_status = 'active' OR lifecycle_status IS NULL)
      AND event_date <= NOW()
  `
  );

  let expiredCount = 0;
  for (const event of eventsToExpire) {
    const [result] = await pool.execute(
      `
      UPDATE events
      SET lifecycle_status = 'expired',
          expired_at = COALESCE(expired_at, NOW())
      WHERE id = ? AND (lifecycle_status = 'active' OR lifecycle_status IS NULL)
    `,
      [event.id]
    );

    if (result.affectedRows === 0) continue;

    expiredCount += 1;
    await pool.execute(
      `UPDATE event_waitlist
       SET status = 'expired'
       WHERE event_id = ? AND status IN ('waiting', 'notified')`,
      [event.id]
    );

    if (event.organizer_id) {
      let vault = null;
      try {
        vault = await releaseEventVaultIfExpired(event.id);
      } catch (vaultError) {
        console.warn(`Vault release warning for event ${event.id}:`, vaultError.message);
      }

      const summary = await buildOrganizerExpirySummary(event.id);
      await Notification.create(
        event.organizer_id,
        'Event Ended',
        `Your event "${event.title}" has ended. Confirmed seats: ${summary.confirmedSeats}. Revenue: ${summary.totalRevenue.toFixed(2)} EGP. Open /html/post-event-dashboard.html?id=${event.id} for full analytics.`,
        'info'
      );

      await Notification.create(
        event.organizer_id,
        'Vault Withdrawal Available',
        `Your event "${event.title}" has ended — ${formatMoney(vault?.balance || 0)} EGP is ready to withdraw from your vault \uD83C\uDF89`,
        'info'
      );
    }
  }

  if (expiredCount > 0) {
    console.log(`Lifecycle job: marked ${expiredCount} event(s) as expired.`);
  }
}

async function sendUpcomingReminders() {
  const [rows] = await pool.execute(
    `
    SELECT b.id AS booking_id, b.user_id, e.title, e.event_date
    FROM bookings b
    INNER JOIN events e ON e.id = b.event_id
    WHERE b.status = 'confirmed'
      AND b.reminder_sent_at IS NULL
      AND e.event_date > NOW()
      AND e.event_date <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
      AND (e.lifecycle_status = 'active' OR e.lifecycle_status IS NULL)
      AND (e.event_status = 'approved' OR e.event_status IS NULL)
  `
  );

  let sent = 0;
  for (const row of rows) {
    const [updateResult] = await pool.execute(
      'UPDATE bookings SET reminder_sent_at = NOW() WHERE id = ? AND reminder_sent_at IS NULL',
      [row.booking_id]
    );
    if (updateResult.affectedRows === 0) continue;

    const hoursLeft = Math.max(1, Math.round((new Date(row.event_date).getTime() - Date.now()) / (60 * 60 * 1000)));
    await Notification.create(
      row.user_id,
      'Event Reminder',
      `"${row.title}" starts in about ${hoursLeft} hour(s).`,
      'info',
      'event_reminders'
    );
    sent += 1;
  }

  if (sent > 0) {
    console.log(`Lifecycle job: sent ${sent} attendee reminder(s).`);
  }
}

async function sendPostEventReviewPrompts() {
  const [rows] = await pool.execute(
    `
    SELECT b.id AS booking_id, b.user_id, e.id AS event_id, e.title
    FROM bookings b
    INNER JOIN events e ON e.id = b.event_id
    WHERE b.status = 'confirmed'
      AND b.review_prompt_sent_at IS NULL
      AND (e.lifecycle_status = 'expired' OR e.event_date <= NOW())
  `
  );

  let sent = 0;
  for (const row of rows) {
    const [updateResult] = await pool.execute(
      'UPDATE bookings SET review_prompt_sent_at = NOW() WHERE id = ? AND review_prompt_sent_at IS NULL',
      [row.booking_id]
    );
    if (updateResult.affectedRows === 0) continue;

    await Notification.create(
      row.user_id,
      'Rate Your Event',
      `"${row.title}" has ended. Please rate and review your experience.`,
      'info'
    );
    sent += 1;
  }

  if (sent > 0) {
    console.log(`Lifecycle job: sent ${sent} post-event review prompt(s).`);
  }
}

async function sendVenueReviewPrompts() {
  const [rows] = await pool.execute(
    `
    SELECT vb.id AS venue_booking_id, vb.host_id, vb.venue_id,
           v.name AS venue_name, e.id AS event_id, e.title AS event_title
    FROM venue_bookings vb
    INNER JOIN venues v ON v.id = vb.venue_id
    INNER JOIN events e ON e.id = vb.event_id
    LEFT JOIN venue_reviews vr
      ON vr.venue_id = vb.venue_id
     AND vr.user_id = vb.host_id
     AND vr.event_id = vb.event_id
    WHERE vb.status = 'confirmed'
      AND vb.review_prompt_sent_at IS NULL
      AND (e.lifecycle_status = 'expired' OR e.event_date <= NOW())
      AND vr.id IS NULL
  `
  );

  let sent = 0;
  for (const row of rows) {
    const [updateResult] = await pool.execute(
      'UPDATE venue_bookings SET review_prompt_sent_at = NOW() WHERE id = ? AND review_prompt_sent_at IS NULL',
      [row.venue_booking_id]
    );
    if (updateResult.affectedRows === 0) continue;

    await Notification.create(
      row.host_id,
      'How was your venue?',
      `How was ${row.venue_name}? Leave a review for your completed event "${row.event_title}".`,
      'info'
    );
    sent += 1;
  }

  if (sent > 0) {
    console.log(`Lifecycle job: sent ${sent} venue review prompt(s).`);
  }
}

async function runLifecycleJobs() {
  try {
    await expirePastEvents();
    await sendUpcomingReminders();
    await sendPostEventReviewPrompts();
    await sendVenueReviewPrompts();
  } catch (error) {
    console.error('Lifecycle job error:', error.message);
  }
}

function startEventLifecycleJobs() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (cron) {
    cron.schedule('0 * * * *', () => {
      runLifecycleJobs();
    });
  } else {
    setInterval(() => {
      runLifecycleJobs();
    }, 60 * 60 * 1000);
    console.warn('node-cron not installed; using setInterval fallback for lifecycle jobs.');
  }

  runLifecycleJobs();
  console.log('Lifecycle scheduler started (hourly).');
}

module.exports = {
  startEventLifecycleJobs,
  runLifecycleJobs
};
