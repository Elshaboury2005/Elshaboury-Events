const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { queueEmail } = require('../utils/emailService');
const { roundMoney } = require('../services/walletService');
const { resolveSeatConfig } = require('../utils/eventSeating');
const {
  ensureWalletInfrastructure,
  creditWalletRefundInTransaction,
  insertNotificationInTransaction
} = require('../utils/refundWalletUtils');
const { processRefundFromVault } = require('../services/eventVaultService');

function getTicketLimits(maxSeats) {
  const config = resolveSeatConfig(maxSeats);
  const limitStandard = config.standard;
  const limitSpecial = config.special;
  const limitVip = config.vip;
  return { limitStandard, limitSpecial, limitVip };
}

function parseSeatList(booking) {
  if (!booking) return [1];
  if (booking.seat_numbers && typeof booking.seat_numbers === 'string') {
    const parsed = booking.seat_numbers
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      return Array.from(new Set(parsed)).sort((a, b) => a - b);
    }
  }
  const count = parseInt(booking.seat_number, 10) || 1;
  return Array.from({ length: Math.max(1, count) }, (_, i) => i + 1);
}

function getSeatsCount(booking) {
  return parseSeatList(booking).length;
}

function getTicketUnitPrice(booking) {
  const type = String(booking?.ticket_type || 'standard').trim().toLowerCase();
  if (type === 'vip') return roundMoney(booking?.price_vip || 0) || 0;
  if (type === 'special') return roundMoney(booking?.price_special || 0) || 0;
  return roundMoney(booking?.price_standard || 0) || 0;
}

function estimateBookingAmountFromTicketPrice(booking) {
  const seats = getSeatsCount(booking);
  const unitPrice = getTicketUnitPrice(booking);
  return roundMoney(seats * unitPrice) || 0;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function calculateRefundPolicy(eventDateRaw, amountPaidRaw) {
  const amountPaid = roundMoney(amountPaidRaw || 0) || 0;

  if (amountPaid <= 0) {
    return {
      refundRate: 0,
      refundAmount: 0,
      policyLabel: 'no_refund',
      reason: 'No paid amount found for this ticket.',
      isRefundable: false
    };
  }

  return {
    refundRate: 1,
    refundAmount: amountPaid,
    policyLabel: 'full_refund',
    reason: 'Ticket cancelled successfully. Full amount refunded to your wallet.',
    isRefundable: true
  };
}

async function getBookingForCancellation(id, userId, conn) {
  const [rows] = await conn.execute(
    `SELECT b.id, b.event_id, b.user_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type,
            COALESCE(b.amount_paid, 0) AS amount_paid,
            b.payment_method,
            COALESCE(b.wallet_amount_used, 0) AS wallet_amount_used,
            e.title AS event_title,
            e.event_date,
            e.organizer_id,
            COALESCE(e.price_standard, 0) AS price_standard,
            COALESCE(e.price_special, 0) AS price_special,
            COALESCE(e.price_vip, 0) AS price_vip,
            COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status
     FROM bookings b
     INNER JOIN events e ON e.id = b.event_id
     WHERE b.id = ? AND b.user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [id, userId]
  );
  return rows[0] || null;
}

function buildTicketCode(bookingId, seatNumber) {
  const compact = String(bookingId || '').replace(/-/g, '').toUpperCase();
  const head = compact.slice(0, 12);
  const seat = String(parseInt(seatNumber, 10) || 1).padStart(3, '0');
  return `${head}-${seat}`;
}

async function augmentBookingsWithTicketCheckins(bookings) {
  if (!Array.isArray(bookings) || bookings.length === 0) return bookings || [];
  const bookingIds = bookings.map((b) => b.id).filter(Boolean);
  if (bookingIds.length === 0) return bookings;

  const placeholders = bookingIds.map(() => '?').join(', ');
  const checkinsMap = {};

  try {
    const [rows] = await pool.execute(
      `SELECT booking_id,
              COUNT(*) AS checked_in_seats,
              GROUP_CONCAT(seat_number ORDER BY seat_number) AS checked_in_seat_numbers
       FROM booking_ticket_checkins
       WHERE booking_id IN (${placeholders})
       GROUP BY booking_id`,
      bookingIds
    );
    rows.forEach((row) => {
      checkinsMap[row.booking_id] = {
        checkedInSeats: Number(row.checked_in_seats || 0),
        checkedInSeatNumbers: row.checked_in_seat_numbers || ''
      };
    });
  } catch (_) {
    return bookings;
  }

  return bookings.map((booking) => {
    const seats = parseSeatList(booking);
    const totalSeats = seats.length;
    const info = checkinsMap[booking.id] || { checkedInSeats: booking.attended ? totalSeats : 0, checkedInSeatNumbers: '' };
    const checkedInSeats = Math.max(0, Math.min(totalSeats, Number(info.checkedInSeats || 0)));
    return {
      ...booking,
      total_seats: totalSeats,
      checked_in_seats: checkedInSeats,
      checked_in_seat_numbers: info.checkedInSeatNumbers,
      attended: checkedInSeats >= totalSeats ? 1 : 0
    };
  });
}

async function isSeatAlreadyCheckedIn(bookingId, seatNumber, conn = null) {
  const db = conn || pool;
  const [rows] = await db.execute(
    'SELECT id FROM booking_ticket_checkins WHERE booking_id = ? AND seat_number = ? LIMIT 1',
    [bookingId, seatNumber]
  );
  return rows.length > 0;
}

async function markSeatCheckedIn({ booking, event, organizerId, seatNumber, ticketCode }) {
  await pool.execute(
    `INSERT INTO booking_ticket_checkins (id, booking_id, event_id, seat_number, ticket_code, checked_in_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), booking.id, booking.event_id, seatNumber, ticketCode, organizerId]
  );

  const seatList = parseSeatList(booking);
  const [countRows] = await pool.execute(
    'SELECT COUNT(*) AS checked_count FROM booking_ticket_checkins WHERE booking_id = ?',
    [booking.id]
  );
  const checkedCount = Number(countRows[0]?.checked_count || 0);
  const totalSeats = seatList.length;
  const fullyCheckedIn = checkedCount >= totalSeats;

  await pool.execute(
    'UPDATE bookings SET attended = ? WHERE id = ?',
    [fullyCheckedIn ? 1 : 0, booking.id]
  );

  if (fullyCheckedIn) {
    const [existingCheckin] = await pool.execute('SELECT id FROM event_checkins WHERE booking_id = ? LIMIT 1', [booking.id]);
    if (existingCheckin.length === 0) {
      await pool.execute(
        'INSERT INTO event_checkins (id, event_id, booking_id, checked_in_by) VALUES (?, ?, ?, ?)',
        [uuidv4(), booking.event_id, booking.id, organizerId]
      );
    }
  } else {
    await pool.execute('DELETE FROM event_checkins WHERE booking_id = ?', [booking.id]);
  }

  await Notification.create(
    booking.user_id,
    'Checked In',
    `Seat ${seatNumber} has been checked in for "${booking.event_title || event.title || 'event'}".`,
    'success'
  );

  return {
    seatNumber,
    ticketCode,
    checkedInSeats: checkedCount,
    totalSeats
  };
}

async function resolveTicketCodeToSeat(eventId, ticketCodeRaw) {
  const ticketCode = String(ticketCodeRaw || '').trim().toUpperCase();
  if (!ticketCode) return null;

  const [rows] = await pool.execute(
    `SELECT b.id, b.user_id, b.event_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type, b.attended,
            e.title AS event_title, e.organizer_id
     FROM bookings b
     INNER JOIN events e ON e.id = b.event_id
     WHERE b.event_id = ? AND b.status = 'confirmed'`,
    [eventId]
  );

  const matches = [];
  rows.forEach((booking) => {
    const seats = parseSeatList(booking);
    seats.forEach((seat) => {
      const generated = buildTicketCode(booking.id, seat);
      if (generated.toUpperCase() === ticketCode) {
        matches.push({
          booking,
          seatNumber: seat,
          ticketCode: generated
        });
      }
    });
  });

  if (matches.length === 0) return null;
  if (matches.length > 1) return { ambiguous: true };
  return matches[0];
}

async function notifyFirstWaitlistUser(eventId, eventTitle) {
  const [waitRows] = await pool.execute(
    `SELECT w.id, w.user_id, u.email, u.full_name
     FROM event_waitlist w
     INNER JOIN users u ON u.id = w.user_id
     WHERE w.event_id = ? AND w.status = 'waiting'
     ORDER BY w.created_at ASC
     LIMIT 1`,
    [eventId]
  );

  if (waitRows.length === 0) return;
  const candidate = waitRows[0];
  await pool.execute(
    'UPDATE event_waitlist SET status = "notified", notified_at = NOW() WHERE id = ?',
    [candidate.id]
  );
  await Notification.create(
    candidate.user_id,
    'Seat Available',
    `A seat became available for "${eventTitle || 'an event'}". Book now before it is taken again.`,
    'info'
  );
  if (candidate.email) {
    await queueEmail({
      userId: candidate.user_id,
      to: candidate.email,
      subject: `Seat Available - ${eventTitle || 'Event'}`,
      body: `Hello ${candidate.full_name || ''}, a seat is now available for ${eventTitle || 'an event'}. Please book soon.`
    });
  }
}

exports.create = async (req, res) => {
  let connection;
  try {
    const { eventId, seatNumber, seatNumbers, ticketType } = req.body;
    const userId = req.user.userId;

    if (!eventId) {
      return res.status(400).json({ success: false, message: 'Event ID is required' });
    }

    const useSeatNumbers = Array.isArray(seatNumbers) && seatNumbers.length > 0;
    const requestedSeatList = useSeatNumbers ? seatNumbers.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0) : null;
    const requestedCount = useSeatNumbers ? requestedSeatList.length : (parseInt(seatNumber, 10) || 1);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const event = await Event.findBasicByIdForUpdate(eventId, connection);
    if (!event) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
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
    if (event.available_seats <= 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'No available seats. You can join the waitlist.' });
    }

    const { limitStandard, limitSpecial, limitVip } = getTicketLimits(event);
    let requestedType = (ticketType || 'Standard').charAt(0).toUpperCase() + (ticketType || 'Standard').slice(1).toLowerCase();
    let typeLimit = limitStandard;
    if (requestedType === 'Special') typeLimit = limitSpecial;
    else if (requestedType === 'Vip') typeLimit = limitVip;

    if (useSeatNumbers) {
      const taken = await Booking.getTakenSeatsByEvent(eventId, connection);
      const takenSet = new Set((taken[requestedType] || []).map(Number));
      const outOfRange = requestedSeatList.some((s) => s < 1 || s > typeLimit);
      const alreadyTaken = requestedSeatList.some((s) => takenSet.has(s));
      const duplicate = requestedSeatList.length !== new Set(requestedSeatList).size;
      if (outOfRange) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: `Seat numbers must be between 1 and ${typeLimit} for ${requestedType}` });
      }
      if (alreadyTaken) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'One or more selected seats are already booked' });
      }
      if (duplicate) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Duplicate seat numbers not allowed' });
      }
    } else {
      const currentCount = await Booking.countByEventAndTicketType(eventId, requestedType, connection);
      if (currentCount + requestedCount > typeLimit) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: `Not enough ${requestedType} seats available. Remaining: ${Math.max(0, typeLimit - currentCount)}`
        });
      }
    }

    const bookingId = uuidv4();
    await Booking.create(bookingId, userId, eventId, useSeatNumbers ? requestedSeatList : (requestedCount === 1 ? 1 : requestedCount), requestedType, connection);
    await Event.decrementAvailableSeats(eventId, requestedCount, connection);

    await connection.commit();
    connection.release();
    connection = null;

    const newBooking = await Booking.findByIdWithEvent(bookingId);

    await Notification.create(
      userId,
      'Booking Confirmed',
      `Your booking for "${(newBooking && newBooking.event_title) || event.title}" has been confirmed!`,
      'success',
      'booking_confirmations'
    );
    if (event.organizer_id) {
      await Notification.create(
        event.organizer_id,
        'New Ticket Reserved!',
        `A user has reserved ${requestedCount} seat(s) for your event "${event.title}".`,
        'info',
        'booking_confirmations'
      );
    }

    const [[userRow]] = await pool.execute('SELECT email, full_name FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRow?.email) {
      const seatText = useSeatNumbers ? requestedSeatList.join(', ') : `${requestedCount}`;
      await queueEmail({
        userId,
        to: userRow.email,
        subject: `Booking Confirmation - ${event.title}`,
        body: `Hello ${userRow.full_name || ''}, your booking for ${event.title} is confirmed. Ticket type: ${requestedType}. Seat(s): ${seatText}.`
      });
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: newBooking || { id: bookingId, event_title: event.title, event_date: event.event_date, location: event.location }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Error creating booking' });
  }
};

exports.getMy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const rawBookings = await Booking.findByUserId(userId);
    const bookings = await augmentBookingsWithTicketCheckins(rawBookings);
    const now = Date.now();

    const normalized = bookings.map((booking) => {
      const eventDateMs = booking.event_date ? new Date(booking.event_date).getTime() : null;
      const lifecycle = String(booking.event_lifecycle_status || '').trim().toLowerCase();
      const forcedExpiredFuture = lifecycle === 'expired' && eventDateMs && eventDateMs > now;
      const isPastEvent = !forcedExpiredFuture && (
        lifecycle === 'expired' || (eventDateMs ? eventDateMs <= now : false)
      );
      return {
        ...booking,
        is_past_event: isPastEvent,
        is_active_ticket: !isPastEvent && booking.status === 'confirmed'
      };
    });
    res.json({ success: true, bookings: normalized });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bookings' });
  }
};

exports.cancel = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    await ensureWalletInfrastructure(pool);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const booking = await getBookingForCancellation(id, userId, connection);
    if (!booking) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.status === 'cancelled') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }

    const seatsToRestore = getSeatsCount(booking);
    let actualAmountPaid = roundMoney(booking.amount_paid || 0) || 0;
    if (actualAmountPaid <= 0) {
      actualAmountPaid = estimateBookingAmountFromTicketPrice(booking);
    }
    if (actualAmountPaid <= 0) {
      const [paymentRows] = await connection.execute(
        `SELECT amount
         FROM payments
         WHERE user_id = ? AND event_id = ? AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, booking.event_id]
      );
      if (paymentRows.length > 0) {
        actualAmountPaid = roundMoney(paymentRows[0].amount || 0) || 0;
      }
    }

    const policy = calculateRefundPolicy(booking.event_date, actualAmountPaid);

    await connection.execute(
      'UPDATE bookings SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelled', id, userId]
    );
    await connection.execute(
      'UPDATE events SET available_seats = LEAST(available_seats + ?, max_seats) WHERE id = ?',
      [seatsToRestore, booking.event_id]
    );
    await connection.execute('DELETE FROM booking_ticket_checkins WHERE booking_id = ?', [id]);
    await connection.execute('DELETE FROM event_checkins WHERE booking_id = ?', [id]);

    const attendeeName = String(req.user.full_name || req.user.fullName || req.user.username || 'an attendee').trim() || 'an attendee';
    let walletBalance = null;
    let vaultBalance = null;
    if (policy.refundAmount > 0) {
      const vaultResult = await processRefundFromVault({
        connection,
        eventId: booking.event_id,
        bookingId: booking.id,
        amount: policy.refundAmount,
        description: `Refund for cancelled booking "${booking.event_title || 'event'}" (${attendeeName})`
      });
      vaultBalance = roundMoney(vaultResult?.vault?.balance || 0) || 0;

      const creditResult = await creditWalletRefundInTransaction({
        connection,
        userId,
        amount: policy.refundAmount,
        description: `Refund for cancelled booking "${booking.event_title || 'event'}"`,
        relatedEventId: booking.event_id,
        relatedBookingId: booking.id,
      });
      walletBalance = creditResult.walletBalance;
    }

    if (walletBalance == null) {
      const [walletRows] = await connection.execute(
        'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      walletBalance = roundMoney(walletRows[0]?.wallet_balance || 0) || 0;
    }

    const attendeeMessage = policy.refundAmount > 0
      ? `Your booking for "${booking.event_title || 'event'}" was cancelled. ${formatMoney(policy.refundAmount)} EGP has been credited to your wallet.`
      : `Your booking for "${booking.event_title || 'event'}" was cancelled. ${policy.reason}`;

    await insertNotificationInTransaction({
      connection,
      userId,
      title: 'Booking Cancelled',
      message: attendeeMessage,
      type: policy.refundAmount > 0 ? 'success' : 'warning'
    });

    if (booking.organizer_id) {
      const organizerMessage = policy.refundAmount > 0
        ? `A refund of ${formatMoney(policy.refundAmount)} EGP was processed from your event vault for ${attendeeName}.`
        : `A booking for your event "${booking.event_title || 'event'}" has been cancelled.`;
      await insertNotificationInTransaction({
        connection,
        userId: booking.organizer_id,
        title: 'Booking Cancelled',
        message: organizerMessage,
        type: 'warning'
      });
    }

    await connection.commit();
    connection.release();
    connection = null;
    try {
      await notifyFirstWaitlistUser(booking.event_id, booking.event_title);
    } catch (notifyError) {
      console.error('Waitlist notify error after booking cancellation:', notifyError);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      refund: {
        amountPaid: actualAmountPaid,
        refundRate: policy.refundRate,
        refundAmount: policy.refundAmount,
        policy: policy.policyLabel,
        reason: policy.reason,
        destination: 'wallet'
      },
      wallet_balance: walletBalance,
      vault_balance: vaultBalance,
      wallet: {
        balance: walletBalance
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Error cancelling booking' });
  }
};

exports.previewCancel = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await Booking.findByIdAndUserId(id, userId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }

    let amountPaid = roundMoney(booking.amount_paid || 0) || 0;
    if (amountPaid <= 0) {
      amountPaid = estimateBookingAmountFromTicketPrice(booking);
    }
    if (amountPaid <= 0) {
      const [paymentRows] = await pool.execute(
        `SELECT amount
         FROM payments
         WHERE user_id = ? AND event_id = ? AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, booking.event_id]
      );
      if (paymentRows.length > 0) {
        amountPaid = roundMoney(paymentRows[0].amount || 0) || 0;
      }
    }
    const policy = calculateRefundPolicy(booking.event_date, amountPaid);
    const breakdownLine = `You will receive ${formatMoney(policy.refundAmount)} EGP back to your wallet based on our cancellation policy.`;

    res.json({
      success: true,
      bookingId: booking.id,
      eventTitle: booking.event_title,
      eventDate: booking.event_date,
      amountPaid,
      paymentMethod: booking.payment_method || 'card',
      walletAmountUsed: roundMoney(booking.wallet_amount_used || 0) || 0,
      refund: {
        refundRate: policy.refundRate,
        refundAmount: policy.refundAmount,
        policy: policy.policyLabel,
        reason: policy.reason,
        destination: 'wallet',
        breakdownLine
      }
    });
  } catch (error) {
    console.error('Preview cancel error:', error);
    res.status(500).json({ success: false, message: 'Error preparing cancellation preview' });
  }
};

exports.cancelSeat = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const ticketCodeRaw = String(req.body.ticketCode || '').trim();
    const seatNumberRaw = req.body.seatNumber;

    await ensureWalletInfrastructure(pool);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const booking = await getBookingForCancellation(id, userId, connection);
    if (!booking) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.status !== 'confirmed') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Only confirmed bookings can cancel tickets' });
    }

    const seats = parseSeatList(booking);
    if (seats.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'No seats found for this booking' });
    }

    let targetSeat = null;

    if (ticketCodeRaw) {
      const normalizedCode = ticketCodeRaw.toUpperCase();
      targetSeat = seats.find((seat) => buildTicketCode(booking.id, seat).toUpperCase() === normalizedCode) || null;
      if (!targetSeat) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Ticket code does not match this booking' });
      }
    } else {
      const parsedSeat = parseInt(seatNumberRaw, 10);
      if (isNaN(parsedSeat) || parsedSeat < 1) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Valid seat number is required' });
      }
      if (!seats.includes(parsedSeat)) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Seat number not found in this booking' });
      }
      targetSeat = parsedSeat;
    }

    if (await isSeatAlreadyCheckedIn(booking.id, targetSeat, connection)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Checked-in ticket cannot be cancelled' });
    }

    const totalSeatsBefore = seats.length;
    const remainingSeats = seats.filter((seat) => seat !== targetSeat);

    let bookingAmountPaid = roundMoney(booking.amount_paid || 0) || 0;
    if (bookingAmountPaid <= 0) {
      bookingAmountPaid = estimateBookingAmountFromTicketPrice(booking);
    }
    if (bookingAmountPaid <= 0) {
      const [paymentRows] = await connection.execute(
        `SELECT amount
         FROM payments
         WHERE user_id = ? AND event_id = ? AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, booking.event_id]
      );
      if (paymentRows.length > 0) {
        bookingAmountPaid = roundMoney(paymentRows[0].amount || 0) || 0;
      }
    }

    const bookingWalletAmountUsed = roundMoney(booking.wallet_amount_used || 0) || 0;
    const seatAmountPaid = totalSeatsBefore > 0
      ? (roundMoney(bookingAmountPaid / totalSeatsBefore) || 0)
      : bookingAmountPaid;
    const seatWalletAmountUsed = totalSeatsBefore > 0
      ? (roundMoney(bookingWalletAmountUsed / totalSeatsBefore) || 0)
      : bookingWalletAmountUsed;
    const policy = calculateRefundPolicy(booking.event_date, seatAmountPaid);

    if (remainingSeats.length === 0) {
      await connection.execute(
        'UPDATE bookings SET status = ? WHERE id = ? AND user_id = ?',
        ['cancelled', id, userId]
      );
      await connection.execute('DELETE FROM booking_ticket_checkins WHERE booking_id = ?', [id]);
      await connection.execute('DELETE FROM event_checkins WHERE booking_id = ?', [id]);
    } else {
      const newAmountPaid = roundMoney(Math.max(0, bookingAmountPaid - seatAmountPaid)) || 0;
      const newWalletAmountUsed = roundMoney(Math.max(0, bookingWalletAmountUsed - seatWalletAmountUsed)) || 0;

      await connection.execute(
        `UPDATE bookings
         SET seat_numbers = ?, seat_number = ?, amount_paid = ?, wallet_amount_used = ?
         WHERE id = ?`,
        [remainingSeats.join(','), remainingSeats.length, newAmountPaid, newWalletAmountUsed, id]
      );

      const [countRows] = await connection.execute(
        'SELECT COUNT(*) AS checked_count FROM booking_ticket_checkins WHERE booking_id = ?',
        [id]
      );
      const checkedCount = Number(countRows[0]?.checked_count || 0);
      const fullyCheckedIn = checkedCount >= remainingSeats.length;
      await connection.execute('UPDATE bookings SET attended = ? WHERE id = ?', [fullyCheckedIn ? 1 : 0, id]);

      if (fullyCheckedIn) {
        const [existingCheckin] = await connection.execute(
          'SELECT id FROM event_checkins WHERE booking_id = ? LIMIT 1',
          [id]
        );
        if (existingCheckin.length === 0) {
          await connection.execute(
            'INSERT INTO event_checkins (id, event_id, booking_id, checked_in_by) VALUES (?, ?, ?, ?)',
            [uuidv4(), booking.event_id, id, booking.organizer_id || userId]
          );
        }
      } else {
        await connection.execute('DELETE FROM event_checkins WHERE booking_id = ?', [id]);
      }
    }

    await connection.execute(
      'UPDATE events SET available_seats = LEAST(available_seats + ?, max_seats) WHERE id = ?',
      [1, booking.event_id]
    );

    const attendeeName = String(req.user.full_name || req.user.fullName || req.user.username || 'an attendee').trim() || 'an attendee';
    let walletBalance = null;
    let vaultBalance = null;
    if (policy.refundAmount > 0) {
      const vaultResult = await processRefundFromVault({
        connection,
        eventId: booking.event_id,
        bookingId: booking.id,
        amount: policy.refundAmount,
        description: `Refund for cancelled seat ${targetSeat} in "${booking.event_title || 'event'}" (${attendeeName})`
      });
      vaultBalance = roundMoney(vaultResult?.vault?.balance || 0) || 0;

      const creditResult = await creditWalletRefundInTransaction({
        connection,
        userId,
        amount: policy.refundAmount,
        description: `Refund for cancelled seat ${targetSeat} in "${booking.event_title || 'event'}"`,
        relatedEventId: booking.event_id,
        relatedBookingId: booking.id
      });
      walletBalance = creditResult.walletBalance;
    }

    if (walletBalance == null) {
      const [walletRows] = await connection.execute(
        'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      walletBalance = roundMoney(walletRows[0]?.wallet_balance || 0) || 0;
    }

    const attendeeMessage = policy.refundAmount > 0
      ? `Seat ${targetSeat} from "${booking.event_title || 'event'}" was cancelled. ${formatMoney(policy.refundAmount)} EGP has been credited to your wallet.`
      : `Seat ${targetSeat} from "${booking.event_title || 'event'}" was cancelled. ${policy.reason}`;

    await insertNotificationInTransaction({
      connection,
      userId,
      title: 'Ticket Cancelled',
      message: attendeeMessage,
      type: policy.refundAmount > 0 ? 'success' : 'warning'
    });

    if (booking.organizer_id) {
      const organizerMessage = policy.refundAmount > 0
        ? `A refund of ${formatMoney(policy.refundAmount)} EGP was processed from your event vault for ${attendeeName}.`
        : `Seat ${targetSeat} for "${booking.event_title || 'event'}" was cancelled by attendee.`;
      await insertNotificationInTransaction({
        connection,
        userId: booking.organizer_id,
        title: 'Ticket Cancelled',
        message: organizerMessage,
        type: 'warning'
      });
    }

    await connection.commit();
    connection.release();
    connection = null;

    try {
      await notifyFirstWaitlistUser(booking.event_id, booking.event_title);
    } catch (notifyError) {
      console.error('Waitlist notify error after seat cancellation:', notifyError);
    }

    res.json({
      success: true,
      message: `Seat ${targetSeat} cancelled successfully`,
      remainingSeats,
      refund: {
        amountPaidForSeat: seatAmountPaid,
        refundRate: policy.refundRate,
        refundAmount: policy.refundAmount,
        policy: policy.policyLabel,
        reason: policy.reason,
        destination: 'wallet'
      },
      wallet_balance: walletBalance,
      vault_balance: vaultBalance,
      wallet: {
        balance: walletBalance
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Cancel seat error:', error);
    res.status(500).json({ success: false, message: 'Error cancelling ticket seat' });
  }
};

exports.getByEventId = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event || event.organizer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized or event not found' });
    }

    const rawBookings = await Booking.findByEventId(eventId);
    const bookings = await augmentBookingsWithTicketCheckins(rawBookings);
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching event bookings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.checkInByTicketCode = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const eventId = String(req.body.eventId || '').trim();
    const ticketCode = String(req.body.ticketCode || '').trim().toUpperCase();

    if (!eventId || !ticketCode) {
      return res.status(400).json({ success: false, message: 'eventId and ticketCode are required' });
    }

    const event = await Event.findById(eventId);
    if (!event || event.organizer_id !== organizerId) {
      return res.status(403).json({ success: false, message: 'Only event organizer can check in attendees' });
    }

    const resolved = await resolveTicketCodeToSeat(eventId, ticketCode);
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'Ticket code not found for this event' });
    }
    if (resolved.ambiguous) {
      return res.status(400).json({ success: false, message: 'Ticket code is ambiguous. Use the exact ticket code.' });
    }

    const { booking, seatNumber, ticketCode: normalizedCode } = resolved;
    if (await isSeatAlreadyCheckedIn(booking.id, seatNumber)) {
      return res.status(400).json({ success: false, message: 'This ticket is already checked in' });
    }

    const result = await markSeatCheckedIn({
      booking,
      event,
      organizerId,
      seatNumber,
      ticketCode: normalizedCode
    });

    res.json({
      success: true,
      message: `Seat ${seatNumber} checked in successfully`,
      ticket: {
        bookingId: booking.id,
        seatNumber: result.seatNumber,
        ticketCode: result.ticketCode,
        checkedInSeats: result.checkedInSeats,
        totalSeats: result.totalSeats
      }
    });
  } catch (error) {
    console.error('Check-in by ticket code error:', error);
    res.status(500).json({ success: false, message: 'Error checking in ticket' });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const organizerId = req.user.userId;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const event = await Event.findById(booking.event_id);
    if (!event || event.organizer_id !== organizerId) {
      return res.status(403).json({ success: false, message: 'Only event organizer can check in attendees' });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Only confirmed bookings can be checked in' });
    }

    if (getSeatsCount(booking) > 1) {
      return res.status(400).json({ success: false, message: 'Use ticket code check-in for multi-seat bookings' });
    }

    const seatNumber = parseSeatList(booking)[0] || 1;
    if (await isSeatAlreadyCheckedIn(booking.id, seatNumber)) {
      return res.status(400).json({ success: false, message: 'Attendee already checked in' });
    }

    const result = await markSeatCheckedIn({
      booking,
      event,
      organizerId,
      seatNumber,
      ticketCode: buildTicketCode(booking.id, seatNumber)
    });

    res.json({
      success: true,
      message: 'Attendee checked in successfully',
      ticket: {
        bookingId: booking.id,
        seatNumber: result.seatNumber,
        ticketCode: result.ticketCode,
        checkedInSeats: result.checkedInSeats,
        totalSeats: result.totalSeats
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, message: 'Error checking in attendee' });
  }
};
