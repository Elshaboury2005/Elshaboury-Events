const { v4: uuidv4 } = require('uuid');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const VenueBooking = require('../models/VenueBooking');
const Notification = require('../models/Notification');
const pool = require('../config/database');
const { roundMoney } = require('../services/walletService');
const {
  normalizeSeatCount,
  resolveUnitPrice,
  computePerTicketPromoTotals
} = require('../utils/promoPricing');
const {
  ensureWalletInfrastructure,
  creditWalletRefundInTransaction,
  insertNotificationInTransaction
} = require('../utils/refundWalletUtils');
const { resolveSeatConfig } = require('../utils/eventSeating');
const {
  ensureEventVaultRow,
  processRefundFromVault,
  getVaultOverviewForHost,
  getVaultTransactionsForHost,
  withdrawEventVaultToHost
} = require('../services/eventVaultService');
const { cancelAndRefundVenueBooking } = require('../services/venueOwnerEscrowService');

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

function computeTicketLimits(totalSeats) {
  const config = resolveSeatConfig(totalSeats);
  const limitStandard = config.standard;
  const limitSpecial = config.special;
  const limitVip = config.vip;
  return { limitStandard, limitSpecial, limitVip };
}

function normalizeTicketType(ticketType) {
  const type = String(ticketType || 'standard').trim().toLowerCase();
  if (type === 'vip') return 'vip';
  if (type === 'special') return 'special';
  return 'standard';
}

function parseRequestedView(rawValue) {
  const normalized = String(rawValue || 'upcoming').trim().toLowerCase();
  if (normalized === 'past' || normalized === 'all') return normalized;
  return 'upcoming';
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function computeTimeUntilEvent(eventDateValue, now = new Date()) {
  const eventDate = new Date(eventDateValue);
  if (Number.isNaN(eventDate.getTime())) return null;

  const diffMs = eventDate.getTime() - now.getTime();
  const remainingMs = Math.max(0, diffMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    total_ms: remainingMs,
    total_seconds: totalSeconds,
    days,
    hours,
    minutes,
    seconds,
    is_ended: diffMs <= 0
  };
}

function isNewEvent(createdAt, now = new Date()) {
  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;
  const ageMs = now.getTime() - createdDate.getTime();
  return ageMs >= 0 && ageMs < (7 * 24 * 60 * 60 * 1000);
}

function enrichEventUrgency(event, now = new Date()) {
  if (!event || typeof event !== 'object') return event;

  const totalSeats = Math.max(0, toSafeNumber(event.max_seats, 0));
  const seatsRemaining = Math.max(0, toSafeNumber(event.available_seats, 0));
  const seatsSold = Math.max(0, totalSeats - seatsRemaining);
  const soldPercentage = totalSeats > 0
    ? Number(((seatsSold / totalSeats) * 100).toFixed(2))
    : 0;

  event.seats_sold = seatsSold;
  event.seats_remaining = seatsRemaining;
  event.seats_sold_percentage = soldPercentage;
  event.is_selling_fast = soldPercentage >= 70;
  event.is_almost_full = soldPercentage >= 85;
  event.is_last_few_seats = seatsRemaining > 0 && seatsRemaining < 10;
  event.is_new_event = isNewEvent(event.created_at, now);
  event.time_until_event = computeTimeUntilEvent(event.event_date, now);

  return event;
}

function resolveRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const candidate = rawForwarded || req.socket?.remoteAddress || req.ip || '';
  return String(candidate).split(',')[0].trim().slice(0, 64);
}

async function notifyFollowersForNewEvent({ organizerId, eventTitle, organizerDisplayName, eventId }) {
  try {
    const [followerRows] = await pool.execute(
      'SELECT follower_id FROM followers WHERE following_id = ?',
      [organizerId]
    );
    if (!Array.isArray(followerRows) || followerRows.length === 0) return;

    const title = 'New Event from Organizer';
    const hostLabel = organizerDisplayName || 'An organizer you follow';
    const message = `${hostLabel} created a new event "${eventTitle}". View details now. (Event ID: ${eventId})`;

    await Promise.allSettled(
      followerRows
        .map((row) => row.follower_id)
        .filter(Boolean)
        .map((followerId) => Notification.create(
          followerId,
          title,
          message,
          'info',
          'newEventsMatchingInterests'
        ))
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return;
    console.warn('Follower notification dispatch skipped:', error.message);
  }
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function getBookingSeatCount(booking) {
  if (!booking) return 1;
  if (booking.seat_numbers && typeof booking.seat_numbers === 'string') {
    const seats = booking.seat_numbers
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter((item) => !Number.isNaN(item) && item > 0);
    if (seats.length > 0) return seats.length;
  }
  const fallback = parseInt(booking.seat_number, 10);
  return !Number.isNaN(fallback) && fallback > 0 ? fallback : 1;
}

function attachAvailability(event, bookingCounts) {
  const config = resolveSeatConfig(event);
  const { limitStandard, limitSpecial, limitVip } = computeTicketLimits(event);

  let bookedStandard = 0, bookedSpecial = 0, bookedVip = 0;
  (bookingCounts || []).forEach(row => {
    const type = (row.ticket_type || 'standard').toLowerCase();
    if (type === 'standard') bookedStandard = Number(row.count || 0);
    else if (type === 'special') bookedSpecial = Number(row.count || 0);
    else if (type === 'vip') bookedVip = Number(row.count || 0);
  });

  event.available_standard = Math.max(0, limitStandard - bookedStandard);
  event.available_special = Math.max(0, limitSpecial - bookedSpecial);
  event.available_vip = Math.max(0, limitVip - bookedVip);
  event.limit_standard = limitStandard;
  event.limit_special = limitSpecial;
  event.limit_vip = limitVip;
  event.standard_seats = config.standard;
  event.special_seats = config.special;
  event.vip_seats = config.vip;
  event.max_seats = config.total;
}

function getSeatCountFromBooking(booking) {
  const rawSeatNumbers = booking?.seat_numbers;
  if (rawSeatNumbers && typeof rawSeatNumbers === 'string') {
    const seats = rawSeatNumbers
      .split(',')
      .map((seat) => parseInt(seat.trim(), 10))
      .filter((seat) => !isNaN(seat) && seat > 0);
    if (seats.length > 0) return seats.length;
  }
  const fallback = parseInt(booking?.seat_number, 10);
  return !isNaN(fallback) && fallback > 0 ? fallback : 1;
}

function estimateBookingAmountFromEventPricing(booking, eventPricing) {
  const seatsCount = getSeatCountFromBooking(booking);
  const type = normalizeTicketType(booking?.ticket_type || 'standard');
  let unitPrice = Number(eventPricing?.price_standard || 0);
  if (type === 'special') unitPrice = Number(eventPricing?.price_special || 0);
  if (type === 'vip') unitPrice = Number(eventPricing?.price_vip || 0);
  return roundMoney(seatsCount * unitPrice) || 0;
}

function escapeCsv(value) {
  const str = String(value == null ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapePdfText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
}

function buildSimplePdf(lines) {
  const safeLines = lines.slice(0, 45).map(escapePdfText);
  const textInstructions = ['BT', '/F1 10 Tf', '50 790 Td'];
  safeLines.forEach((line, index) => {
    if (index > 0) textInstructions.push('0 -14 Td');
    textInstructions.push(`(${line}) Tj`);
  });
  textInstructions.push('ET');

  const streamContent = textInstructions.join('\n');
  const objects = [
    null,
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, 'utf8')} >> stream\n${streamContent}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${objects[i]}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function getPostEventSummaryData(eventId) {
  const event = await Event.findById(eventId);
  if (!event) return null;

  const [breakdownRows] = await pool.execute(
    `
    SELECT
      LOWER(COALESCE(b.ticket_type, 'standard')) AS ticket_type,
      SUM(CASE WHEN b.status = 'confirmed' THEN ${seatsCountExpression} ELSE 0 END) AS booked_seats,
      SUM(
        CASE
          WHEN b.status = 'confirmed' THEN
            CASE
              WHEN tc.checked_in_seats IS NOT NULL THEN LEAST(tc.checked_in_seats, ${seatsCountExpression})
              WHEN b.attended = TRUE OR c.booking_id IS NOT NULL THEN ${seatsCountExpression}
              ELSE 0
            END
          ELSE 0
        END
      ) AS attended_seats
    FROM bookings b
    LEFT JOIN event_checkins c ON c.booking_id = b.id
    LEFT JOIN (
      SELECT booking_id, COUNT(*) AS checked_in_seats
      FROM booking_ticket_checkins
      GROUP BY booking_id
    ) tc ON tc.booking_id = b.id
    WHERE b.event_id = ?
    GROUP BY LOWER(COALESCE(b.ticket_type, 'standard'))
  `,
    [eventId]
  );

  let revenueByTypeRows = [];
  let vaultTotals = {
    total_collected: 0,
    total_refunded: 0,
    total_withdrawn: 0,
    balance: 0
  };
  try {
    [revenueByTypeRows] = await pool.execute(
      `
      SELECT
        LOWER(COALESCE(b.ticket_type, 'standard')) AS ticket_type,
        COALESCE(SUM(vt.amount), 0) AS revenue_amount
      FROM event_vault_transactions vt
      LEFT JOIN bookings b ON b.id = vt.booking_id
      WHERE vt.event_id = ?
        AND vt.type = 'booking_payment'
      GROUP BY LOWER(COALESCE(b.ticket_type, 'standard'))
    `,
      [eventId]
    );

    const [vaultRows] = await pool.execute(
      `
      SELECT
        COALESCE(total_collected, 0) AS total_collected,
        COALESCE(total_refunded, 0) AS total_refunded,
        COALESCE(total_withdrawn, 0) AS total_withdrawn,
        COALESCE(balance, 0) AS balance
      FROM event_vaults
      WHERE event_id = ?
      LIMIT 1
    `,
      [eventId]
    );
    if (vaultRows[0]) {
      vaultTotals = vaultRows[0];
    }

    let typeRevenueTotal = revenueByTypeRows.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0);
    if (typeRevenueTotal <= 0) {
      [revenueByTypeRows] = await pool.execute(
        `
        SELECT
          LOWER(COALESCE(ticket_type, 'standard')) AS ticket_type,
          COALESCE(SUM(COALESCE(amount_paid, 0)), 0) AS revenue_amount
        FROM bookings
        WHERE event_id = ?
          AND status IN ('confirmed', 'cancelled')
        GROUP BY LOWER(COALESCE(ticket_type, 'standard'))
      `,
        [eventId]
      );
      typeRevenueTotal = revenueByTypeRows.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0);
    }

    if (typeRevenueTotal <= 0) {
      [revenueByTypeRows] = await pool.execute(
        `
        SELECT
          LOWER(COALESCE(b.ticket_type, 'standard')) AS ticket_type,
          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'vip' THEN (${seatsCountExpression}) * COALESCE(e.price_vip, 0)
                WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'special' THEN (${seatsCountExpression}) * COALESCE(e.price_special, 0)
                ELSE (${seatsCountExpression}) * COALESCE(e.price_standard, 0)
              END
            ),
            0
          ) AS revenue_amount
        FROM bookings b
        INNER JOIN events e ON e.id = b.event_id
        WHERE b.event_id = ?
          AND b.status IN ('confirmed', 'cancelled')
        GROUP BY LOWER(COALESCE(b.ticket_type, 'standard'))
      `,
        [eventId]
      );
      typeRevenueTotal = revenueByTypeRows.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0);
    }

    if (!vaultRows[0] && typeRevenueTotal > 0) {
      vaultTotals = {
        ...vaultTotals,
        total_collected: typeRevenueTotal
      };
    }
  } catch (_) {
    [revenueByTypeRows] = await pool.execute(
      `
      SELECT
        LOWER(COALESCE(ticket_type, 'standard')) AS ticket_type,
        COALESCE(SUM(COALESCE(amount_paid, 0)), 0) AS revenue_amount
      FROM bookings
      WHERE event_id = ?
        AND status IN ('confirmed', 'cancelled')
      GROUP BY LOWER(COALESCE(ticket_type, 'standard'))
    `,
      [eventId]
    );
    vaultTotals = {
      total_collected: revenueByTypeRows.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0),
      total_refunded: 0,
      total_withdrawn: 0,
      balance: 0
    };
  }

  const [reviews] = await pool.execute(
    `SELECT r.id, r.rating, r.review, r.created_at, u.full_name, u.username
     FROM event_reviews r
     INNER JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ?
     ORDER BY r.created_at DESC`,
    [eventId]
  );

  const [avgRows] = await pool.execute(
    `SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS avg_rating
     FROM event_reviews
     WHERE event_id = ?`,
    [eventId]
  );

  const [ratingDistributionRows] = await pool.execute(
    `SELECT rating, COUNT(*) AS rating_count
     FROM event_reviews
     WHERE event_id = ?
     GROUP BY rating`,
    [eventId]
  );

  const [cancellationRows] = await pool.execute(
    `
    SELECT
      COUNT(*) AS cancelled_bookings,
      COALESCE(SUM(${seatsCountExpression}), 0) AS cancelled_seats
    FROM bookings b
    WHERE b.event_id = ?
      AND b.status = 'cancelled'
  `,
    [eventId]
  );

  const [totalBookingsRows] = await pool.execute(
    `SELECT COUNT(*) AS total_bookings
     FROM bookings
     WHERE event_id = ?`,
    [eventId]
  );

  let refundRows = [{ total_refunded: 0 }];
  let cancellationReasonRows = [];
  try {
    [refundRows] = await pool.execute(
      `
      SELECT COALESCE(SUM(w.amount), 0) AS total_refunded
      FROM wallet_transactions w
      INNER JOIN bookings b ON b.id = w.related_booking_id
      WHERE b.event_id = ?
        AND b.status = 'cancelled'
        AND w.source = 'refund'
        AND w.type = 'credit'
    `,
      [eventId]
    );

    [cancellationReasonRows] = await pool.execute(
      `
      SELECT reason_label, COUNT(*) AS reason_count
      FROM (
        SELECT
          b.id,
          CASE
            WHEN COALESCE(SUM(w.amount), 0) <= 0 THEN 'No refund issued'
            WHEN COALESCE(SUM(w.amount), 0) + 0.01 >= COALESCE(MAX(b.amount_paid), 0) THEN 'Full refund'
            ELSE 'Partial refund'
          END AS reason_label
        FROM bookings b
        LEFT JOIN wallet_transactions w
          ON w.related_booking_id = b.id
         AND w.source = 'refund'
         AND w.type = 'credit'
        WHERE b.event_id = ?
          AND b.status = 'cancelled'
        GROUP BY b.id
      ) cancellation_reasons
      GROUP BY reason_label
      ORDER BY reason_count DESC
    `,
      [eventId]
    );
  } catch (_) {
    refundRows = [{ total_refunded: 0 }];
    cancellationReasonRows = [];
  }

  const [bookingTimelineRows] = await pool.execute(
    `
    SELECT
      DATE(COALESCE(b.booking_date, b.created_at)) AS day,
      COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN ${seatsCountExpression} ELSE 0 END), 0) AS booked_seats
    FROM bookings b
    WHERE b.event_id = ?
    GROUP BY DATE(COALESCE(b.booking_date, b.created_at))
    ORDER BY day ASC
  `,
    [eventId]
  );

  let paymentTimelineRows = [];
  try {
    [paymentTimelineRows] = await pool.execute(
      `
      SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS revenue
      FROM event_vault_transactions
      WHERE event_id = ?
        AND type = 'booking_payment'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
      [eventId]
    );
    if (!Array.isArray(paymentTimelineRows) || paymentTimelineRows.length === 0) {
      [paymentTimelineRows] = await pool.execute(
        `
        SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE event_id = ? AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `,
        [eventId]
      );
    }
  } catch (_) {
    [paymentTimelineRows] = await pool.execute(
      `
      SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS revenue
      FROM payments
      WHERE event_id = ? AND status = 'completed'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
      [eventId]
    );
  }

  const seatConfig = resolveSeatConfig(event);
  const limits = computeTicketLimits(event);
  const summaryByType = {
    standard: { booked: 0, attended: 0, empty: limits.limitStandard, revenue: 0, capacity: limits.limitStandard },
    special: { booked: 0, attended: 0, empty: limits.limitSpecial, revenue: 0, capacity: limits.limitSpecial },
    vip: { booked: 0, attended: 0, empty: limits.limitVip, revenue: 0, capacity: limits.limitVip }
  };

  for (const row of breakdownRows) {
    const type = normalizeTicketType(row.ticket_type);
    const booked = Number(row.booked_seats || 0);
    const attended = Number(row.attended_seats || 0);
    summaryByType[type].booked = booked;
    summaryByType[type].attended = attended;
    summaryByType[type].empty = Math.max(0, summaryByType[type].capacity - booked);
  }

  for (const row of revenueByTypeRows) {
    const type = normalizeTicketType(row.ticket_type);
    summaryByType[type].revenue = Number(row.revenue_amount || 0);
  }

  const totalBooked = summaryByType.standard.booked + summaryByType.special.booked + summaryByType.vip.booked;
  const totalAttended = summaryByType.standard.attended + summaryByType.special.attended + summaryByType.vip.attended;
  const totalRevenueFromTypes = summaryByType.standard.revenue + summaryByType.special.revenue + summaryByType.vip.revenue;
  const vaultCollected = roundMoney(vaultTotals.total_collected || 0) || 0;
  const vaultRefunded = roundMoney(vaultTotals.total_refunded || 0) || 0;
  const vaultNet = roundMoney(Math.max(0, vaultCollected - vaultRefunded)) || 0;
  const totalRevenue = (vaultCollected > 0 || vaultRefunded > 0) ? vaultNet : totalRevenueFromTypes;
  const capacity = seatConfig.total;
  const attendanceRate = capacity > 0 ? Number(((totalAttended / capacity) * 100).toFixed(2)) : 0;

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingDistributionRows.forEach((row) => {
    const rating = Number(row.rating || 0);
    if (rating >= 1 && rating <= 5) {
      ratingDistribution[rating] = Number(row.rating_count || 0);
    }
  });

  const cancelledBookings = Number(cancellationRows[0]?.cancelled_bookings || 0);
  const cancelledSeats = Number(cancellationRows[0]?.cancelled_seats || 0);
  const totalBookings = Number(totalBookingsRows[0]?.total_bookings || 0);
  const totalRefunded = roundMoney(refundRows[0]?.total_refunded || 0) || 0;
  const cancellationRate = totalBookings > 0
    ? Number(((cancelledBookings / totalBookings) * 100).toFixed(2))
    : 0;
  const cancellationReasons = cancellationReasonRows.map((row) => ({
    label: row.reason_label || 'Unknown',
    count: Number(row.reason_count || 0)
  }));

  const timelineMap = new Map();
  bookingTimelineRows.forEach((row) => {
    const day = row.day ? String(row.day).slice(0, 10) : '';
    if (!day) return;
    if (!timelineMap.has(day)) timelineMap.set(day, { day, bookings: 0, revenue: 0 });
    timelineMap.get(day).bookings = Number(row.booked_seats || 0);
  });
  paymentTimelineRows.forEach((row) => {
    const day = row.day ? String(row.day).slice(0, 10) : '';
    if (!day) return;
    if (!timelineMap.has(day)) timelineMap.set(day, { day, bookings: 0, revenue: 0 });
    timelineMap.get(day).revenue = Number(row.revenue || 0);
  });
  const timeline = Array.from(timelineMap.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const demographics = {
    byGovernorate: [],
    byGender: []
  };

  try {
    const [governorateRows] = await pool.execute(
      `
      SELECT
        COALESCE(NULLIF(TRIM(u.governorate), ''), 'Unknown') AS label,
        COALESCE(SUM(${seatsCountExpression}), 0) AS value
      FROM bookings b
      INNER JOIN users u ON u.id = b.user_id
      WHERE b.event_id = ? AND b.status = 'confirmed'
      GROUP BY label
      ORDER BY value DESC
    `,
      [eventId]
    );
    demographics.byGovernorate = governorateRows.map((row) => ({
      label: row.label || 'Unknown',
      value: Number(row.value || 0)
    }));
  } catch (_) {
    demographics.byGovernorate = [];
  }

  try {
    const [genderRows] = await pool.execute(
      `
      SELECT
        COALESCE(NULLIF(TRIM(u.gender), ''), 'Unknown') AS label,
        COALESCE(SUM(${seatsCountExpression}), 0) AS value
      FROM bookings b
      INNER JOIN users u ON u.id = b.user_id
      WHERE b.event_id = ? AND b.status = 'confirmed'
      GROUP BY label
      ORDER BY value DESC
    `,
      [eventId]
    );
    demographics.byGender = genderRows.map((row) => ({
      label: row.label || 'Unknown',
      value: Number(row.value || 0)
    }));
  } catch (_) {
    demographics.byGender = [];
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      event_date: event.event_date,
      created_at: event.created_at,
      location: event.location,
      organizer_id: event.organizer_id,
      lifecycle_status: event.lifecycle_status || (new Date(event.event_date) <= new Date() ? 'expired' : 'active'),
      max_seats: capacity,
      standard_seats: seatConfig.standard,
      special_seats: seatConfig.special,
      vip_seats: seatConfig.vip,
      available_seats: Number(event.available_seats || 0)
    },
    seats: {
      byType: summaryByType,
      totalBooked,
      totalEmpty: Math.max(0, capacity - totalBooked),
      confirmedAttendees: totalBooked,
      attendedCount: totalAttended,
      attendanceRate
    },
    revenue: {
      byType: {
        standard: summaryByType.standard.revenue,
        special: summaryByType.special.revenue,
        vip: summaryByType.vip.revenue
      },
      total: totalRevenue,
      gross: vaultCollected > 0 ? vaultCollected : totalRevenueFromTypes,
      refunded: vaultRefunded,
      net: totalRevenue
    },
    chart: [
      { label: 'Standard', value: summaryByType.standard.booked },
      { label: 'Special', value: summaryByType.special.booked },
      { label: 'VIP', value: summaryByType.vip.booked }
    ],
    reviews,
    ratings: {
      count: Number(avgRows[0]?.review_count || 0),
      avg: Number(avgRows[0]?.avg_rating || 0),
      distribution: ratingDistribution
    },
    cancellations: {
      totalBookings,
      count: cancelledBookings,
      seatsCancelled: cancelledSeats,
      refundedAmount: totalRefunded,
      cancellationRate,
      reasons: cancellationReasons
    },
    timeline,
    demographics
  };
}

exports.getPostEventSummaryData = getPostEventSummaryData;

exports.getAll = async (req, res) => {
  try {
    const lifecycleView = parseRequestedView(req.query.view);
    const events = await Event.findAll({ lifecycleView });
    const now = new Date();
    events.forEach((event) => enrichEventUrgency(event, now));
    res.json({ success: true, events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, message: 'Error fetching events' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const bookingCounts = await Booking.getCountsByEventId(id);
    attachAvailability(event, bookingCounts);
    if (!event.lifecycle_status) {
      event.lifecycle_status = new Date(event.event_date) <= new Date() ? 'expired' : 'active';
    }
    event.is_expired = event.lifecycle_status === 'expired';
    enrichEventUrgency(event);

    res.json({ success: true, event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ success: false, message: 'Error fetching event' });
  }
};

exports.trackView = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const event = await Event.findBasicById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const ipAddress = resolveRequestIp(req) || null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255) || null;
    await pool.execute(
      `INSERT INTO event_views (id, event_id, viewer_user_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), eventId, null, ipAddress, userAgent]
    );

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Track event view error:', error);
    return res.status(500).json({ success: false, message: 'Error tracking event view' });
  }
};

exports.getViewsLast24Hours = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const event = await Event.findBasicById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM event_views
       WHERE event_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [eventId]
    );

    return res.json({
      success: true,
      event_id: eventId,
      views_last_24_hours: Number(rows[0]?.total || 0)
    });
  } catch (error) {
    console.error('Get event views error:', error);
    return res.status(500).json({ success: false, message: 'Error loading event views' });
  }
};

exports.getSeatMap = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const event = await Event.findBasicById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const { limitStandard, limitSpecial, limitVip } = computeTicketLimits(event);
    let taken = { Standard: [], Special: [], Vip: [] };
    try {
      taken = await Booking.getTakenSeatsByEvent(eventId);
    } catch (err) {
      console.warn('getTakenSeatsByEvent failed (e.g. seat_numbers column missing):', err.message);
    }
    res.json({
      success: true,
      limits: { standard: limitStandard, special: limitSpecial, vip: limitVip },
      taken
    });
  } catch (error) {
    console.error('Get seat map error:', error);
    res.status(500).json({ success: false, message: 'Error fetching seat map' });
  }
};

exports.create = async (req, res) => {
  let connection;
  try {
    if (req.user.role === 'venue_owner') {
      return res.status(403).json({
        success: false,
        message: 'Venue Owner accounts cannot create events. Please use a Host account to create and book events.'
      });
    }

    const {
      title, description, eventDate, eventTime, location, venueAddress,
      maxSeats, standardSeats, specialSeats, vipSeats, eventType,
      hostName, hostEmail, hostPhone, hostOrganization,
      ocName, ocEmail, ocPhone,
      primarySponsor, sponsorPackages, sponsorContact,
      leadSpeaker, speakerTopic, speakerBio,
      priceStandard, priceSpecial, priceVip, pricingNotes,
      logistics, image_url, location_type, governorate, latitude, longitude,
      registration_deadline, age_restriction, terms_conditions, event_agenda,
      aiMarketingRequested, venueType, venueId, venueBookingId, listingFee
    } = req.body;

    const aiMarketingRequestedFlag = !(
      aiMarketingRequested === false ||
      aiMarketingRequested === 'false' ||
      aiMarketingRequested === 'no' ||
      aiMarketingRequested === 0 ||
      aiMarketingRequested === '0'
    );

    const normalizedImageUrl = image_url || req.body.imageUrl || null;
    const normalizedRegistrationDeadline = registration_deadline || req.body.registrationDeadline || null;
    const normalizedAgeRestriction = age_restriction || req.body.ageRestriction || null;
    const normalizedTermsConditions = terms_conditions || req.body.termsConditions || null;
    const normalizedEventAgenda = event_agenda || req.body.eventAgenda || null;
    const normalizedStandardSeats = Number(standardSeats ?? req.body.standard_seats ?? 0) || 0;
    const normalizedSpecialSeats = Number(specialSeats ?? req.body.special_seats ?? 0) || 0;
    const normalizedVipSeats = Number(vipSeats ?? req.body.vip_seats ?? 0) || 0;
    const resolvedSeats = resolveSeatConfig({
      max_seats: maxSeats ?? req.body.max_seats ?? 0,
      standard_seats: normalizedStandardSeats,
      special_seats: normalizedSpecialSeats,
      vip_seats: normalizedVipSeats
    });
    const normalizedVenueType = String(venueType || req.body.venue_type || 'host_owned').trim().toLowerCase() === 'platform_booked'
      ? 'platform_booked'
      : 'host_owned';
    const normalizedVenueId = venueId != null ? Number(venueId) : (req.body.venue_id != null ? Number(req.body.venue_id) : null);
    const normalizedVenueBookingId = venueBookingId != null ? Number(venueBookingId) : (req.body.venue_booking_id != null ? Number(req.body.venue_booking_id) : null);
    const normalizedListingFee = Number(listingFee ?? req.body.listing_fee ?? 0) || 0;

    if (!title || !eventDate || !location) {
      return res.status(400).json({ success: false, message: 'Title, date, and location are required' });
    }
    const requestedEventDateTime = new Date(`${eventDate}T${eventTime || '00:00'}`);
    if (Number.isNaN(requestedEventDateTime.getTime()) || requestedEventDateTime <= new Date()) {
      return res.status(400).json({ success: false, message: 'Event date and time must be in the future' });
    }
    if (normalizedRegistrationDeadline) {
      const requestedRegistrationDeadline = new Date(normalizedRegistrationDeadline);
      if (
        Number.isNaN(requestedRegistrationDeadline.getTime()) ||
        requestedRegistrationDeadline <= new Date() ||
        requestedRegistrationDeadline >= requestedEventDateTime
      ) {
        return res.status(400).json({ success: false, message: 'Registration deadline must be in the future and before the event starts' });
      }
    }
    if (resolvedSeats.total <= 0) {
      return res.status(400).json({ success: false, message: 'At least one seat must be configured' });
    }

    const eventId = uuidv4();
    const organizerId = req.user.userId;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let createdVenueBookingId = Number.isFinite(normalizedVenueBookingId) && normalizedVenueBookingId > 0
      ? normalizedVenueBookingId
      : null;
    let pendingVenueBooking = null;

    if (!createdVenueBookingId && normalizedVenueType === 'platform_booked' && Number.isFinite(normalizedVenueId) && normalizedVenueId > 0) {
      const venue = await Venue.findById(normalizedVenueId);
      if (!venue || !venue.is_available || venue.status !== 'approved') {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Selected venue is not available for booking' });
      }

      const eventDateOnly = String(eventDate).slice(0, 10);
      const conflicts = await VenueBooking.findByVenueAndDate(
        normalizedVenueId,
        eventDateOnly,
        ['accepted', 'confirmed', 'accepted_by_owner'],
        connection
      );
      if (conflicts.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(409).json({
          success: false,
          message: `This venue is already booked on ${eventDateOnly}. Please choose a different date or venue.`
        });
      }

      const [blockedRows] = await connection.execute(
        `SELECT id
         FROM venue_availability_blocks
         WHERE venue_id = ?
           AND is_active = TRUE
           AND (
             (block_type = 'specific_date' AND date = ?) OR
             (block_type = 'recurring_weekday' AND weekday = (DAYOFWEEK(?) - 1))
           )
         LIMIT 1`,
        [normalizedVenueId, eventDateOnly, eventDateOnly]
      );
      if (blockedRows.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(409).json({ success: false, message: 'This venue is not available on the selected date. Please choose a different date.' });
      }

      if (venue.owner_id) {
        pendingVenueBooking = {
          venueId: normalizedVenueId,
          eventId,
          hostId: organizerId,
          eventDate: eventDateOnly,
          totalPrice: Number(venue.price_per_day || 0),
          status: 'awaiting_event_approval',
          paymentStatus: 'unpaid'
        };
      }
    }

    await Event.create({
      id: eventId, title, description, eventDate, eventTime, location, venueAddress,
      organizerId, maxSeats: resolvedSeats.total, standardSeats: resolvedSeats.standard, specialSeats: resolvedSeats.special, vipSeats: resolvedSeats.vip, eventType,
      hostName, hostEmail, hostPhone, hostOrganization,
      ocName, ocEmail, ocPhone,
      primarySponsor, sponsorPackages, sponsorContact,
      leadSpeaker, speakerTopic, speakerBio,
      priceStandard, priceSpecial, priceVip, pricingNotes,
      logistics, image_url: normalizedImageUrl, location_type, governorate, latitude, longitude,
      registration_deadline: normalizedRegistrationDeadline,
      age_restriction: normalizedAgeRestriction,
      terms_conditions: normalizedTermsConditions,
      event_agenda: normalizedEventAgenda,
      aiMarketingRequested: aiMarketingRequestedFlag,
      venueType: normalizedVenueType,
      venueId: Number.isFinite(normalizedVenueId) && normalizedVenueId > 0 ? normalizedVenueId : null,
      venueBookingId: createdVenueBookingId,
      listingFee: normalizedListingFee
    }, connection);

    if (pendingVenueBooking) {
      createdVenueBookingId = await VenueBooking.create(pendingVenueBooking, connection);
      await connection.execute(
        'UPDATE events SET venue_booking_id = ? WHERE id = ?',
        [createdVenueBookingId, eventId]
      );
    }

    await ensureEventVaultRow(connection, eventId, { forUpdate: false });

    await connection.commit();
    connection.release();
    connection = null;

    await Notification.create(
      organizerId,
      'Event Submitted',
      `Your event "${title}" was submitted and is waiting for admin approval.`,
      'info'
    );

    const event = await Event.findById(eventId);
    await notifyFollowersForNewEvent({
      organizerId,
      eventTitle: title,
      organizerDisplayName: event?.organizer_name || hostName || 'An organizer you follow',
      eventId
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Create event error:', error);
    res.status(500).json({ success: false, message: 'Error creating event' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const organizerId = await Event.getOrganizerId(id);
    if (!organizerId) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (organizerId !== userId) {
      return res.status(403).json({ success: false, message: 'Only the organizer can update this event' });
    }

    const updates = req.body;
    const updated = await Event.update(id, updates);
    if (!updated) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const event = await Event.findById(id);
    res.json({ success: true, message: 'Event updated successfully', event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, message: 'Error updating event' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const organizerId = await Event.getOrganizerId(id);
    if (!organizerId) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (organizerId !== userId) {
      return res.status(403).json({ success: false, message: 'Only the organizer can delete this event' });
    }

    await Event.delete(id);
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, message: 'Error deleting event' });
  }
};

exports.getMyEvents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const events = await Event.findByOrganizerId(userId);
    res.json({ success: true, events });
  } catch (error) {
    console.error('Get my events error:', error);
    res.status(500).json({ success: false, message: 'Error fetching your events' });
  }
};

exports.getCancellationSummary = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer_id !== organizerId) {
      return res.status(403).json({ success: false, message: 'Only organizer can cancel this event' });
    }

    const [rows] = await pool.execute(
      `SELECT b.id, b.user_id, b.seat_number, b.seat_numbers, COALESCE(b.amount_paid, 0) AS amount_paid,
              COALESCE(b.wallet_amount_used, 0) AS wallet_amount_used,
              COALESCE(b.payment_method, 'card') AS payment_method,
              u.full_name, u.email
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.event_id = ? AND b.status = 'confirmed'
       ORDER BY b.created_at ASC`,
      [eventId]
    );

    const attendees = rows.map((row) => {
      let refundAmount = roundMoney(row.amount_paid || 0) || 0;
      if (refundAmount <= 0) {
        const walletUsed = roundMoney(row.wallet_amount_used || 0) || 0;
        if (walletUsed > 0) {
          refundAmount = walletUsed;
        }
      }
      return {
        bookingId: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        email: row.email,
        seats: getBookingSeatCount(row),
        amountPaid: refundAmount,
        paymentMethod: row.payment_method || 'card'
      };
    });

    const totalRefundAmount = attendees.reduce((sum, attendee) => sum + attendee.amountPaid, 0);

    // Find associated venue booking
    const [venueBookings] = await pool.execute(
      `SELECT id, status, payment_status,
              COALESCE(pending_venue_fee, 0) AS pending_venue_fee,
              COALESCE(pending_platform_fee, 0) AS pending_platform_fee
       FROM venue_bookings
       WHERE event_id = ? AND status <> 'cancelled'`,
      [eventId]
    );

    let venueRefundAmount = 0;
    let platformFee = 0;
    if (venueBookings.length > 0) {
      const vb = venueBookings[0];
      platformFee = Number(vb.pending_platform_fee || 0);
      if (vb.payment_status === 'transferred') {
        const [heldTxRows] = await pool.execute(
          `SELECT amount FROM wallet_transactions
           WHERE related_venue_booking_id = ?
             AND status = 'held'
             AND type = 'credit'
             AND source = 'venue-booking'
           LIMIT 1`,
          [vb.id]
        );
        venueRefundAmount = Number(heldTxRows[0]?.amount || 0);
      } else {
        // Only venue fee is refunded to host, platform fee is never refunded.
        venueRefundAmount = Number(vb.pending_venue_fee || 0);
      }
    }

    res.json({
      success: true,
      summary: {
        eventId: event.id,
        eventTitle: event.title,
        totalBookingsAffected: attendees.length,
        totalRefundAmount: roundMoney(totalRefundAmount) || 0,
        venueRefundAmount: roundMoney(venueRefundAmount) || 0,
        platformFee: roundMoney(platformFee) || 0,
        attendees
      }
    });
  } catch (error) {
    console.error('Get cancellation summary error:', error);
    res.status(500).json({ success: false, message: 'Error loading cancellation summary' });
  }
};

exports.cancelEventWithRefunds = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;

    const { handleHostEventCancellation } = require('../services/venueOwnerEscrowService');

    const result = await handleHostEventCancellation(eventId, organizerId);

    res.json(result);
  } catch (error) {
    console.error('Cancel event with refunds error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error cancelling event and issuing refunds' });
  }
};


exports.getReviews = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const [rows] = await pool.execute(
      `SELECT r.id, r.rating, r.review, r.created_at, u.full_name, u.username
       FROM event_reviews r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ?
       ORDER BY r.created_at DESC`,
      [eventId]
    );
    const [aggRows] = await pool.execute(
      `SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avgRating
       FROM event_reviews WHERE event_id = ?`,
      [eventId]
    );
    res.json({
      success: true,
      reviews: rows,
      summary: { count: aggRows[0].count, avgRating: Number(aggRows[0].avgRating || 0) }
    });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, reviews: [], summary: { count: 0, avgRating: 0 } });
    }
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: 'Error loading reviews' });
  }
};

exports.addReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: eventId } = req.params;
    const rating = parseInt(req.body.rating, 10);
    const review = (req.body.review || '').toString().trim();

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const isExpired = (event.lifecycle_status === 'expired') || (new Date(event.event_date) <= new Date());
    if (!isExpired) {
      return res.status(400).json({ success: false, message: 'Reviews are available only after event ends' });
    }

    const [bookingRows] = await pool.execute(
      `SELECT id FROM bookings
       WHERE event_id = ? AND user_id = ? AND status = 'confirmed'
       LIMIT 1`,
      [eventId, userId]
    );
    if (bookingRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only attendees can review this event' });
    }

    const [existingReview] = await pool.execute(
      `SELECT id FROM event_reviews WHERE event_id = ? AND user_id = ? LIMIT 1`,
      [eventId, userId]
    );
    if (existingReview.length > 0) {
      return res.status(400).json({ success: false, message: 'You already submitted a review for this event' });
    }

    await pool.execute(
      `INSERT INTO event_reviews (id, event_id, user_id, rating, review)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), eventId, userId, rating, review]
    );

    res.json({ success: true, message: 'Review saved successfully' });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ success: false, message: 'Error saving review' });
  }
};

exports.joinWaitlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const isExpired = (event.lifecycle_status === 'expired') || (new Date(event.event_date) <= new Date());
    if (isExpired) {
      return res.status(400).json({ success: false, message: 'Event has ended and waitlist is closed' });
    }

    if ((parseInt(event.available_seats, 10) || 0) > 0) {
      return res.status(400).json({ success: false, message: 'Event has available seats. Book directly.' });
    }

    await pool.execute(
      'INSERT INTO event_waitlist (id, event_id, user_id, status) VALUES (?, ?, ?, "waiting")',
      [uuidv4(), eventId, userId]
    );
    res.status(201).json({ success: true, message: 'You joined the waitlist successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'You are already on the waitlist for this event' });
    }
    console.error('Join waitlist error:', error);
    res.status(500).json({ success: false, message: 'Error joining waitlist' });
  }
};

exports.createPromoCode = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;
    const { code, discountType, discountValue, maxUses, expiresAt } = req.body;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can create promo codes' });

    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return res.status(400).json({ success: false, message: 'Promo code is required' });
    const validType = discountType === 'fixed' ? 'fixed' : 'percent';
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Discount value must be positive' });

    await pool.execute(
      `INSERT INTO promo_codes (id, event_id, organizer_id, code, discount_type, discount_value, max_uses, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [uuidv4(), eventId, organizerId, cleanCode, validType, val, maxUses || null, expiresAt || null]
    );

    res.status(201).json({ success: true, message: 'Promo code created successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Promo code already exists for this event' });
    }
    console.error('Create promo code error:', error);
    res.status(500).json({ success: false, message: 'Error creating promo code' });
  }
};

exports.getPromoCodes = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can view promo codes' });

    const [rows] = await pool.execute(
      `SELECT id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active, created_at
       FROM promo_codes WHERE event_id = ? ORDER BY created_at DESC`,
      [eventId]
    );
    res.json({ success: true, promoCodes: rows });
  } catch (error) {
    console.error('Get promo codes error:', error);
    res.status(500).json({ success: false, message: 'Error loading promo codes' });
  }
};

exports.deactivatePromoCode = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId, promoId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can manage promo codes' });

    const [promoRows] = await pool.execute(
      `SELECT id, is_active FROM promo_codes WHERE id = ? AND event_id = ? LIMIT 1`,
      [promoId, eventId]
    );
    if (promoRows.length === 0) return res.status(404).json({ success: false, message: 'Promo code not found' });

    if (Number(promoRows[0].is_active) === 0) {
      return res.json({ success: true, message: 'Promo code is already inactive' });
    }

    await pool.execute(
      `UPDATE promo_codes SET is_active = FALSE WHERE id = ? AND event_id = ?`,
      [promoId, eventId]
    );

    res.json({ success: true, message: 'Promo code deactivated successfully' });
  } catch (error) {
    console.error('Deactivate promo code error:', error);
    res.status(500).json({ success: false, message: 'Error deactivating promo code' });
  }
};

exports.activatePromoCode = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId, promoId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can manage promo codes' });

    const [promoRows] = await pool.execute(
      `SELECT id, is_active FROM promo_codes WHERE id = ? AND event_id = ? LIMIT 1`,
      [promoId, eventId]
    );
    if (promoRows.length === 0) return res.status(404).json({ success: false, message: 'Promo code not found' });

    if (Number(promoRows[0].is_active) === 1) {
      return res.json({ success: true, message: 'Promo code is already active' });
    }

    await pool.execute(
      `UPDATE promo_codes SET is_active = TRUE WHERE id = ? AND event_id = ?`,
      [promoId, eventId]
    );

    res.json({ success: true, message: 'Promo code activated successfully' });
  } catch (error) {
    console.error('Activate promo code error:', error);
    res.status(500).json({ success: false, message: 'Error activating promo code' });
  }
};

exports.deletePromoCode = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId, promoId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can manage promo codes' });

    const [result] = await pool.execute(
      `DELETE FROM promo_codes WHERE id = ? AND event_id = ?`,
      [promoId, eventId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Promo code not found' });
    }

    res.json({ success: true, message: 'Promo code deleted successfully' });
  } catch (error) {
    console.error('Delete promo code error:', error);
    res.status(500).json({ success: false, message: 'Error deleting promo code' });
  }
};

exports.validatePromoCode = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const code = String(req.body.code || '').trim().toUpperCase();
    const amount = parseFloat(req.body.amount);
    const seatCount = normalizeSeatCount(req.body.seatCount || req.body.ticketCount);
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });
    if (isNaN(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Valid amount is required' });

    const [rows] = await pool.execute(
      `SELECT * FROM promo_codes
       WHERE event_id = ? AND code = ? AND is_active = TRUE
       LIMIT 1`,
      [eventId, code]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Invalid promo code' });
    const promo = rows[0];
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'Promo code has expired' });
    }
    if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
      return res.status(400).json({ success: false, message: 'Promo code reached maximum uses' });
    }

    const normalizedAmount = roundMoney(amount) || 0;
    const unitPrice = resolveUnitPrice({
      unitPrice: req.body.unitPrice,
      amount: normalizedAmount,
      seatCount
    });
    const promoTotals = computePerTicketPromoTotals({
      amount: normalizedAmount,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      seatCount,
      unitPrice
    });

    res.json({
      success: true,
      promo: { id: promo.id, code: promo.code, discountType: promo.discount_type, discountValue: Number(promo.discount_value) },
      amount: normalizedAmount,
      seatCount,
      unitPrice,
      discountPerTicket: promoTotals.discountPerTicket,
      discount: promoTotals.discountAmount,
      finalAmount: promoTotals.finalAmount
    });
  } catch (error) {
    console.error('Validate promo code error:', error);
    res.status(500).json({ success: false, message: 'Error validating promo code' });
  }
};

exports.getPostEventSummary = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;

    const summary = await getPostEventSummaryData(eventId);
    if (!summary) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (summary.event.organizer_id !== organizerId) {
      return res.status(403).json({ success: false, message: 'Only organizer can view this summary' });
    }
    if (summary.event.lifecycle_status !== 'expired') {
      return res.status(400).json({ success: false, message: 'Post-event dashboard is available after event ends' });
    }

    const responseSummary = {
      ...summary,
      event: { ...summary.event }
    };
    delete responseSummary.event.organizer_id;
    res.json({ success: true, summary: responseSummary });
  } catch (error) {
    console.error('Post-event summary error:', error);
    res.status(500).json({ success: false, message: 'Error loading post-event summary' });
  }
};

exports.getVault = async (req, res) => {
  try {
    const hostId = req.user.userId;
    const { id: eventId } = req.params;

    const result = await getVaultOverviewForHost({
      eventId,
      hostId,
      includeTransactions: true,
      txLimit: 120
    });
    if (!result.success) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || 'Unable to load event vault'
      });
    }

    return res.json({
      success: true,
      event: result.event,
      vault: result.vault,
      canWithdraw: Boolean(result.canWithdraw),
      withdrawReason: result.withdrawReason || '',
      withdrawAmount: Number(result.withdrawAmount || 0),
      transactions: result.transactions || []
    });
  } catch (error) {
    console.error('Get event vault error:', error);
    return res.status(500).json({ success: false, message: 'Error loading event vault' });
  }
};

exports.getVaultTransactions = async (req, res) => {
  try {
    const hostId = req.user.userId;
    const { id: eventId } = req.params;

    const result = await getVaultTransactionsForHost({ eventId, hostId });
    if (!result.success) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || 'Unable to load vault transactions'
      });
    }

    return res.json({
      success: true,
      event: result.event,
      vault: result.vault,
      transactions: result.transactions || []
    });
  } catch (error) {
    console.error('Get vault transactions error:', error);
    return res.status(500).json({ success: false, message: 'Error loading vault transactions' });
  }
};

exports.withdrawVault = async (req, res) => {
  try {
    const hostId = req.user.userId;
    const { id: eventId } = req.params;

    const result = await withdrawEventVaultToHost({ eventId, hostId });
    if (!result.success) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || 'Unable to withdraw event vault'
      });
    }

    const amountLabel = formatMoney(result.amount);
    await Notification.create(
      hostId,
      'Vault Withdrawal Successful',
      `You have successfully withdrawn ${amountLabel} EGP from ${result.event.title || 'your event'} to your wallet ✅`,
      'success'
    );

    return res.json({
      success: true,
      message: `${amountLabel} EGP has been transferred to your wallet from ${result.event.title || 'event'} vault`,
      event: result.event,
      amount: Number(result.amount || 0),
      walletBalance: Number(result.walletBalance || 0),
      vault: result.vault
    });
  } catch (error) {
    console.error('Withdraw event vault error:', error);
    return res.status(500).json({ success: false, message: 'Error processing vault withdrawal' });
  }
};

exports.exportPostEventReport = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;
    const format = String(req.query.format || 'excel').trim().toLowerCase();

    const summary = await getPostEventSummaryData(eventId);
    if (!summary) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (summary.event.organizer_id !== organizerId) {
      return res.status(403).json({ success: false, message: 'Only organizer can export this report' });
    }
    if (summary.event.lifecycle_status !== 'expired') {
      return res.status(400).json({ success: false, message: 'Report export is available after event ends' });
    }

    const [attendees] = await pool.execute(
      `SELECT b.id, b.ticket_type, b.status, b.seat_number, b.seat_numbers, b.attended,
              b.booking_date, b.created_at, u.full_name, u.username, u.email
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.event_id = ?
       ORDER BY COALESCE(b.booking_date, b.created_at) ASC`,
      [eventId]
    );

    if (format === 'pdf') {
      const lines = [
        `Event Report: ${summary.event.title}`,
        `Date: ${new Date(summary.event.event_date).toLocaleString()}`,
        `Location: ${summary.event.location || 'N/A'}`,
        `Total Confirmed Seats: ${summary.seats.confirmedAttendees}`,
        `Total Attended: ${summary.seats.attendedCount}`,
        `Attendance Rate: ${summary.seats.attendanceRate}%`,
        `Total Revenue: ${summary.revenue.total.toFixed(2)} EGP`,
        `Average Rating: ${summary.ratings.avg.toFixed(1)} (${summary.ratings.count} reviews)`,
        '',
        'Attendees:'
      ];

      attendees.forEach((attendee, index) => {
        const seatCount = getSeatCountFromBooking(attendee);
        lines.push(
          `${index + 1}. ${attendee.full_name || attendee.username || 'User'} | ${attendee.email || 'N/A'} | ${attendee.ticket_type || 'Standard'} | seats: ${seatCount} | status: ${attendee.status}`
        );
      });

      const pdf = buildSimplePdf(lines);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="event-report-${eventId}.pdf"`);
      return res.send(pdf);
    }

    const rows = [
      ['Event Title', summary.event.title],
      ['Event Date', new Date(summary.event.event_date).toLocaleString()],
      ['Location', summary.event.location || 'N/A'],
      ['Total Confirmed Seats', summary.seats.confirmedAttendees],
      ['Total Attended', summary.seats.attendedCount],
      ['Attendance Rate (%)', summary.seats.attendanceRate],
      ['Total Revenue (EGP)', summary.revenue.total.toFixed(2)],
      ['Average Rating', summary.ratings.avg.toFixed(2)],
      ['Review Count', summary.ratings.count],
      [],
      ['Attendees'],
      ['Name', 'Username', 'Email', 'Ticket Type', 'Seat Count', 'Attended', 'Booking Status', 'Booking Date']
    ];

    attendees.forEach((attendee) => {
      rows.push([
        attendee.full_name || '',
        attendee.username || '',
        attendee.email || '',
        attendee.ticket_type || 'Standard',
        getSeatCountFromBooking(attendee),
        attendee.attended ? 'Yes' : 'No',
        attendee.status || '',
        attendee.booking_date || attendee.created_at || ''
      ]);
    });

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="event-report-${eventId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export post-event report error:', error);
    res.status(500).json({ success: false, message: 'Error exporting report' });
  }
};

exports.getRevenueTrend = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { id: eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (event.organizer_id !== organizerId) return res.status(403).json({ success: false, message: 'Only organizer can view revenue trend' });

    const [rows] = await pool.execute(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS revenue
       FROM payments
       WHERE event_id = ? AND status = 'completed'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [eventId]
    );
    res.json({ success: true, points: rows.map((r) => ({ day: r.day, revenue: Number(r.revenue || 0) })) });
  } catch (error) {
    console.error('Revenue trend error:', error);
    res.status(500).json({ success: false, message: 'Error loading revenue trend' });
  }
};

exports.selectVenue = async (req, res) => {
  let connection;
  try {
    const hostId = req.user.userId;
    const eventId = req.params.id;
    const { venueId, eventDate } = req.body;

    if (!venueId || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ success: false, message: 'venueId and eventDate (YYYY-MM-DD) are required' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer_id !== hostId) {
      return res.status(403).json({ success: false, message: 'Only the event organizer can change the venue' });
    }
    if (event.event_status !== 'pending_venue') {
      return res.status(400).json({ success: false, message: 'Venue can only be changed for events in pending_venue status' });
    }

    const [venueRows] = await pool.execute(
      'SELECT id, name, owner_id, price_per_day, total_capacity, status FROM venues WHERE id = ? LIMIT 1',
      [venueId]
    );
    const venue = venueRows[0] || null;
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Selected venue not found' });
    }
    if (venue.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'The selected venue is not approved' });
    }

    if (event.max_seats > venue.total_capacity) {
      return res.status(400).json({
        success: false,
        message: `The selected venue capacity (${venue.total_capacity}) is smaller than your event capacity (${event.max_seats})`
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const conflicts = await VenueBooking.findByVenueAndDate(
      venueId,
      eventDate,
      ['accepted', 'confirmed', 'accepted_by_owner'],
      connection
    );
    if (conflicts.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'The selected venue is already booked for this date' });
    }

    const [blockRows] = await connection.execute(
      `SELECT id FROM venue_availability_blocks
       WHERE venue_id = ?
         AND is_active = TRUE
         AND (
           (block_type = 'specific_date' AND date = ?) OR
           (block_type = 'recurring_weekday' AND weekday = (DAYOFWEEK(?) - 1))
         )`,
      [venueId, eventDate, eventDate]
    );
    if (blockRows.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'The selected venue is blocked for this date' });
    }

    const [prevBookingRows] = await connection.execute(
      `SELECT id, pending_venue_fee, pending_platform_fee, payment_status, status
       FROM venue_bookings
       WHERE event_id = ? AND status <> 'cancelled'
       ORDER BY id DESC LIMIT 1`,
      [eventId]
    );
    const prevBooking = prevBookingRows[0] || null;
    if (!prevBooking) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'No active or declined venue booking found for this event' });
    }

    const oldVenueFee = Number(prevBooking.pending_venue_fee || 0);
    const oldPlatformFee = Number(prevBooking.pending_platform_fee || 0);
    const newVenueFee = Number(venue.price_per_day || 0);

    const diff = roundMoney(newVenueFee - oldVenueFee);

    const { creditWallet, debitWallet, lockUserWallet } = require('../services/walletService');
    
    const walletRow = await lockUserWallet(hostId, connection);
    if (!walletRow) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Host user not found' });
    }
    const walletBalance = Number(walletRow.wallet_balance || 0);

    if (diff > 0) {
      if (walletBalance < diff) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance to cover the venue price difference of ${diff.toFixed(2)} EGP. Current balance: ${walletBalance.toFixed(2)} EGP. Please top up your wallet first.`
        });
      }

      await debitWallet({
        userId: hostId,
        amount: diff,
        source: 'venue-booking',
        description: `Debit for venue change price difference (event: ${event.title}): old fee ${oldVenueFee.toFixed(2)} EGP, new fee ${newVenueFee.toFixed(2)} EGP`,
        relatedEventId: eventId,
        conn: connection
      });
    } else if (diff < 0) {
      const refundAmount = Math.abs(diff);
      await creditWallet({
        userId: hostId,
        amount: refundAmount,
        source: 'refund',
        description: `Refund for venue change price difference (event: ${event.title}): old fee ${oldVenueFee.toFixed(2)} EGP, new fee ${newVenueFee.toFixed(2)} EGP`,
        conn: connection
      });
    }

    await connection.execute(
      `UPDATE venue_bookings
       SET status = 'cancelled', payment_status = 'refunded', pending_venue_fee = 0, pending_platform_fee = 0
       WHERE id = ?`,
      [prevBooking.id]
    );

    const newBookingId = await VenueBooking.create({
      venueId,
      eventId,
      hostId,
      eventDate,
      totalPrice: roundMoney(newVenueFee + oldPlatformFee),
      status: 'pending_venue_response',
      paymentStatus: 'paid',
      pendingVenueFee: newVenueFee,
      pendingPlatformFee: oldPlatformFee
    }, connection);

    let eventDateTime = `${eventDate} 00:00:00`;
    if (event.event_date) {
      try {
        const timePart = new Date(event.event_date).toTimeString().slice(0, 8);
        eventDateTime = `${eventDate} ${timePart}`;
      } catch (_) {}
    }

    await connection.execute(
      `UPDATE events
       SET event_status = 'approved',
           venue_id = ?,
           venue_booking_id = ?,
           event_date = ?
       WHERE id = ?`,
      [venueId, newBookingId, eventDateTime, eventId]
    );

    await connection.commit();
    connection.release();
    connection = null;

    if (venue.owner_id) {
      await Notification.create(
        venue.owner_id,
        'New Venue Booking Request',
        `New booking request for your venue "${venue.name}" on ${eventDate}.`,
        'info',
        'venueBookingRequests'
      );
    }

    const updatedEvent = await Event.findById(eventId);
    const updatedBooking = await VenueBooking.findById(newBookingId);

    return res.json({
      success: true,
      message: 'New venue selected successfully. Waiting for venue owner confirmation.',
      event: updatedEvent,
      venueBooking: updatedBooking,
      priceDifference: diff
    });

  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('selectVenue error:', error);
    return res.status(500).json({ success: false, message: 'Error selecting new venue' });
  }
};

exports.getVenueDetails = async (req, res) => {
  try {
    const hostId = req.user.userId;
    const eventId = req.params.id;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer_id !== hostId) {
      return res.status(403).json({ success: false, message: 'Only the event organizer can view venue details' });
    }

    const [bookingRows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       WHERE vb.event_id = ? AND vb.status <> 'cancelled'
       ORDER BY vb.id DESC LIMIT 1`,
      [eventId]
    );

    const booking = bookingRows[0] || null;
    if (!booking) {
      return res.json({
        success: true,
        booking: null,
        venue: null,
        needsNewVenue: false
      });
    }

    const [venueRows] = await pool.execute(
      `SELECT v.*, u.full_name AS owner_name, u.email AS owner_email, u.phone_number AS owner_phone
       FROM venues v
       LEFT JOIN users u ON v.owner_id = u.id
       WHERE v.id = ? LIMIT 1`,
      [booking.venue_id]
    );
    const venue = venueRows[0] || null;

    if (!venue) {
      return res.status(404).json({ success: false, message: 'Associated venue not found' });
    }

    if (typeof venue.images === 'string') {
      try {
        venue.images = JSON.parse(venue.images);
      } catch (_) {
        venue.images = venue.images.split(',').map(img => img.trim()).filter(Boolean);
      }
    }
    if (typeof venue.amenities === 'string') {
      try {
        venue.amenities = JSON.parse(venue.amenities);
      } catch (_) {
        venue.amenities = venue.amenities.split(',').map(am => am.trim()).filter(Boolean);
      }
    }

    const [bookedDatesRows] = await pool.execute(
      `SELECT event_date FROM venue_bookings
       WHERE venue_id = ?
         AND status IN ('accepted', 'confirmed', 'accepted_by_owner', 'pending_venue_response', 'awaiting_dual_approval')
         AND event_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 MONTH)`,
      [booking.venue_id]
    );
    const bookedDates = bookedDatesRows.map(row => {
      try {
        return row.event_date.toISOString().slice(0, 10);
      } catch (_) {
        return String(row.event_date).slice(0, 10);
      }
    });

    const [blockedRows] = await pool.execute(
      `SELECT id, block_type, date, weekday, reason FROM venue_availability_blocks
       WHERE venue_id = ? AND is_active = TRUE`,
      [booking.venue_id]
    );

    const needsNewVenue = ['declined', 'declined_auto_expired'].includes(booking.status) || event.event_status === 'pending_venue';

    return res.json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.payment_status,
        pendingVenueFee: Number(booking.pending_venue_fee || 0),
        pendingPlatformFee: Number(booking.pending_platform_fee || 0),
        eventDate: booking.event_date ? (booking.event_date.toISOString ? booking.event_date.toISOString().slice(0, 10) : String(booking.event_date).slice(0, 10)) : null,
        bookedAt: booking.booked_at ? (booking.booked_at.toISOString ? booking.booked_at.toISOString() : String(booking.booked_at)) : null
      },
      venue: {
        id: venue.id,
        name: venue.name,
        description: venue.description,
        address: venue.address,
        governorate: venue.governorate,
        totalCapacity: venue.total_capacity,
        pricePerDay: Number(venue.price_per_day || 0),
        images: venue.images || [],
        amenities: venue.amenities || [],
        rules: venue.rules,
        parkingDetails: venue.parking_details,
        cateringPolicy: venue.catering_policy,
        decorationPolicy: venue.decoration_policy,
        musicPolicy: venue.music_policy,
        setupTimeHours: venue.setup_time_hours,
        cleanupTimeHours: venue.cleanup_time_hours,
        floorPlanImage: venue.floor_plan_image,
        virtualTourUrl: venue.virtual_tour_url,
        owner: {
          name: venue.owner_name,
          email: venue.owner_email,
          phone: venue.owner_phone
        }
      },
      calendar: {
        bookedDates,
        blockedRanges: blockedRows.map(row => {
          const dateStr = row.date ? (row.date.toISOString ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)) : null;
          return {
            id: row.id,
            blockType: row.block_type,
            date: dateStr,
            weekday: row.weekday,
            reason: row.reason || ''
          };
        })
      },
      needsNewVenue
    });

  } catch (error) {
    console.error('getVenueDetails error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching venue details' });
  }
};
