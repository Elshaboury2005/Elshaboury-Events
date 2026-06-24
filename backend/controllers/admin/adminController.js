const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../config/database');
const { getAdminJwtSecret } = require('../../middleware/admin/adminAuthMiddleware');
const {
  ensureWalletInfrastructure,
  creditWalletRefundInTransaction,
  insertNotificationInTransaction,
  roundMoney
} = require('../../utils/refundWalletUtils');
const { processRefundFromVault } = require('../../services/eventVaultService');
const Venue = require('../../models/Venue');
const { Notification } = require('../../models/Notification');
const { createVenueBookingChat } = require('../../services/directChatService');
const VenueBooking = require('../../models/VenueBooking');
const { cancelVenueBooking } = require('../../services/venueBookingService');
const { clearPlatformAccessCache } = require('../../services/platformAccessService');
const { getPostEventSummaryData } = require('../eventController');

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || null;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function normalizeWithdrawalStatus(rawStatus) {
  const value = String(rawStatus || '').trim().toLowerCase();
  if (value === 'pending') return 'pending';
  if (value === 'processing') return 'processing';
  if (value === 'completed') return 'completed';
  if (value === 'failed') return 'failed';
  return null;
}

function parseSettingBoolean(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function isEventEnded(eventDate) {
  const parsed = new Date(eventDate);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

function getSeatsCount(booking) {
  const raw = String(booking?.seat_numbers || '').trim();
  if (raw) {
    const seats = raw
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter((item) => !Number.isNaN(item) && item > 0);
    if (seats.length > 0) return seats.length;
  }
  const fallback = parseInt(booking?.seat_number, 10);
  return !Number.isNaN(fallback) && fallback > 0 ? fallback : 1;
}

function estimateBookingAmountFromTicketPrice(booking) {
  const type = String(booking?.ticket_type || 'standard').trim().toLowerCase();
  let unitPrice = roundMoney(booking?.price_standard || 0) || 0;
  if (type === 'special') unitPrice = roundMoney(booking?.price_special || 0) || 0;
  if (type === 'vip') unitPrice = roundMoney(booking?.price_vip || 0) || 0;
  return roundMoney(getSeatsCount(booking) * unitPrice) || 0;
}

async function cancelBookingAndRefundFromVault({ bookingId, adminId, ipAddress }) {
  let connection;
  try {
    await ensureWalletInfrastructure(pool);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookingRows] = await connection.execute(
      `SELECT b.id, b.user_id, b.event_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type,
              COALESCE(b.amount_paid, 0) AS amount_paid,
              u.full_name AS attendee_name,
              e.title AS event_title,
              e.organizer_id,
              COALESCE(e.price_standard, 0) AS price_standard,
              COALESCE(e.price_special, 0) AS price_special,
              COALESCE(e.price_vip, 0) AS price_vip
       FROM bookings b
       INNER JOIN events e ON e.id = b.event_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      connection.release();
      return { success: false, status: 404, message: 'Booking not found' };
    }

    const booking = bookingRows[0];
    if (String(booking.status || '').toLowerCase() === 'cancelled') {
      await connection.rollback();
      connection.release();
      return { success: false, status: 400, message: 'Booking is already cancelled' };
    }

    const seatsToRestore = getSeatsCount(booking);
    let refundAmount = roundMoney(booking.amount_paid || 0) || 0;
    if (refundAmount <= 0) {
      refundAmount = estimateBookingAmountFromTicketPrice(booking);
    }
    if (refundAmount <= 0) {
      const [paymentRows] = await connection.execute(
        `SELECT amount
         FROM payments
         WHERE user_id = ? AND event_id = ? AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
        [booking.user_id, booking.event_id]
      );
      if (paymentRows.length > 0) {
        refundAmount = roundMoney(paymentRows[0].amount || 0) || 0;
      }
    }

    await connection.execute(
      "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
      [booking.id]
    );
    await connection.execute(
      'UPDATE events SET available_seats = LEAST(available_seats + ?, max_seats) WHERE id = ?',
      [seatsToRestore, booking.event_id]
    );
    await connection.execute('DELETE FROM booking_ticket_checkins WHERE booking_id = ?', [booking.id]);
    await connection.execute('DELETE FROM event_checkins WHERE booking_id = ?', [booking.id]);

    const attendeeName = String(booking.attendee_name || 'an attendee').trim() || 'an attendee';
    let walletBalance = null;
    let vaultBalance = null;

    if (refundAmount > 0) {
      const vaultResult = await processRefundFromVault({
        connection,
        eventId: booking.event_id,
        bookingId: booking.id,
        amount: refundAmount,
        description: `Refund for cancelled booking "${booking.event_title || 'event'}" (${attendeeName}) [admin]`
      });
      vaultBalance = roundMoney(vaultResult?.vault?.balance || 0) || 0;

      const creditResult = await creditWalletRefundInTransaction({
        connection,
        userId: booking.user_id,
        amount: refundAmount,
        description: `Refund for cancelled booking "${booking.event_title || 'event'}"`,
        relatedEventId: booking.event_id,
        relatedBookingId: booking.id
      });
      walletBalance = creditResult.walletBalance;
    }

    if (walletBalance == null) {
      const [walletRows] = await connection.execute(
        'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
        [booking.user_id]
      );
      walletBalance = roundMoney(walletRows[0]?.wallet_balance || 0) || 0;
    }

    const attendeeMessage = refundAmount > 0
      ? `Your booking for "${booking.event_title || 'event'}" was cancelled by admin. ${formatMoney(refundAmount)} EGP has been credited to your wallet.`
      : `Your booking for "${booking.event_title || 'event'}" was cancelled by admin. No wallet credit was issued because amount paid was 0 EGP.`;

    await insertNotificationInTransaction({
      connection,
      userId: booking.user_id,
      title: 'Booking Cancelled',
      message: attendeeMessage,
      type: refundAmount > 0 ? 'warning' : 'info'
    });

    if (booking.organizer_id) {
      const organizerMessage = refundAmount > 0
        ? `A refund of ${formatMoney(refundAmount)} EGP was processed from your event vault for ${attendeeName}.`
        : `A booking for your event "${booking.event_title || 'event'}" was cancelled by admin.`;
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

    await logAdminAction(
      adminId,
      'CANCEL_BOOKING',
      'booking',
      booking.id,
      {
        eventId: booking.event_id,
        userId: booking.user_id,
        refundAmount,
        walletBalance,
        vaultBalance
      },
      ipAddress
    );

    return {
      success: true,
      status: 200,
      message: 'Booking cancelled and refund processed successfully',
      data: {
        bookingId: booking.id,
        eventId: booking.event_id,
        userId: booking.user_id,
        refundAmount,
        walletBalance,
        vaultBalance
      }
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    throw error;
  }
}

async function logAdminAction(adminId, action, targetType, targetId, details, ipAddress) {
  await pool.execute(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), adminId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, ipAddress || null]
  );
}

function parseJsonArray(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch (_) {}
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeVenuePayload(body) {
  const standardSeats = Math.max(0, parseInt(body.standardSeats ?? body.standard_seats, 10) || 0);
  const specialSeats = Math.max(0, parseInt(body.specialSeats ?? body.special_seats, 10) || 0);
  const vipSeats = Math.max(0, parseInt(body.vipSeats ?? body.vip_seats, 10) || 0);
  const totalCapacity = Math.max(
    standardSeats + specialSeats + vipSeats,
    parseInt(body.totalCapacity ?? body.total_capacity, 10) || 0
  );

  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    governorate: String(body.governorate || '').trim(),
    address: String(body.address || '').trim(),
    latitude: body.latitude == null || body.latitude === '' ? null : Number(body.latitude),
    longitude: body.longitude == null || body.longitude === '' ? null : Number(body.longitude),
    category: String(body.category || body.venueCategory || 'conference_hall').trim() || 'conference_hall',
    totalCapacity,
    standardSeats,
    specialSeats,
    vipSeats,
    pricePerDay: Number(body.pricePerDay ?? body.price_per_day ?? 0) || 0,
    rating: Number(body.rating ?? 0) || 0,
    totalReviews: Math.max(0, parseInt(body.totalReviews ?? body.total_reviews, 10) || 0),
    minHours: Math.max(1, parseInt(body.minHours ?? body.min_hours, 10) || 4),
    pricePerHour: body.pricePerHour == null || body.pricePerHour === ''
      ? null
      : Number(body.pricePerHour ?? body.price_per_hour ?? 0) || 0,
    amenities: JSON.stringify(parseJsonArray(body.amenities)),
    images: JSON.stringify(parseJsonArray(body.images)),
    isFeatured: Boolean(body.isFeatured === true || body.isFeatured === 'true' || body.isFeatured === 1 || body.isFeatured === '1'),
    isAvailable: !(body.isAvailable === false || body.isAvailable === 'false' || body.isAvailable === 0 || body.isAvailable === '0')
  };
}

function normalizeVenueResponse(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    governorate: row.governorate,
    address: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    category: row.category || 'conference_hall',
    totalCapacity: Number(row.total_capacity || 0),
    standardSeats: Number(row.standard_seats || 0),
    specialSeats: Number(row.special_seats || 0),
    vipSeats: Number(row.vip_seats || 0),
    pricePerDay: Number(row.price_per_day || 0),
    rating: Number(row.rating || 0),
    totalReviews: Number(row.total_reviews || 0),
    minHours: Number(row.min_hours || 0),
    pricePerHour: row.price_per_hour == null ? null : Number(row.price_per_hour),
    amenities: parseJsonArray(row.amenities),
    images: parseJsonArray(row.images),
    isFeatured: Boolean(row.is_featured),
    isAvailable: Boolean(row.is_available),
    status: row.status || 'approved',
    venueType: row.venue_type || 'platform',
    ownerId: row.owner_id || null,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
    contactPhone: row.contact_phone || null,
    contactEmail: row.contact_email || null,
    cancellationPolicy: row.cancellation_policy || null,
    adminNotes: row.admin_notes || null,
    upcomingBookings: Number(row.upcoming_bookings || 0),
    confirmedBookings: Number(row.confirmed_bookings || 0),
    totalRevenue: Number(row.total_revenue || 0),
    createdAt: row.created_at
  };
}

function normalizeVenueBookingResponse(row) {
  return {
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    venueCategory: row.category || 'conference_hall',
    eventId: row.event_id,
    eventTitle: row.event_title || null,
    hostId: row.host_id,
    hostName: row.host_name || '-',
    hostEmail: row.host_email || '-',
    eventDate: row.event_date,
    totalPrice: Number(row.total_price || 0),
    status: row.status,
    paymentStatus: row.payment_status,
    bookedAt: row.booked_at
  };
}

exports.login = async (req, res) => {
  try {
    const { adminId, password } = req.body;
    if (!adminId || !password) {
      return res.status(400).json({ success: false, message: 'Admin ID and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, admin_id, full_name, password_hash, is_active FROM admins WHERE admin_id = ? LIMIT 1',
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const admin = rows[0];
    const isPasswordValid = await bcrypt.compare(String(password), String(admin.password_hash || ''));
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }
    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Admin account is inactive' });
    }

    const sessionId = uuidv4();
    const tokenId = uuidv4();
    await pool.execute(
      `INSERT INTO admin_sessions (id, admin_id, token_id, ip_address, user_agent, last_activity, expires_at, is_revoked)
       VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE)`,
      [sessionId, admin.id, tokenId, getClientIp(req), req.headers['user-agent'] || null]
    );

    const token = jwt.sign(
      { role: 'admin', adminUuid: admin.id, adminId: admin.admin_id, sessionId, tokenId },
      getAdminJwtSecret(),
      { expiresIn: process.env.ADMIN_JWT_EXPIRE || '30m' }
    );

    await logAdminAction(admin.id, 'ADMIN_LOGIN', 'admin', admin.id, { adminId: admin.admin_id }, getClientIp(req));

    res.json({
      success: true,
      token,
      admin: { id: admin.id, adminId: admin.admin_id, fullName: admin.full_name },
      sessionTimeoutMinutes: parseInt(process.env.ADMIN_INACTIVITY_MINUTES || '15', 10)
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Admin login failed' });
  }
};

exports.verify = async (req, res) => {
  res.json({ success: true, admin: req.admin });
};

exports.logout = async (req, res) => {
  try {
    await pool.execute('UPDATE admin_sessions SET is_revoked = TRUE WHERE id = ?', [req.admin.sessionId]);
    await logAdminAction(req.admin.id, 'ADMIN_LOGOUT', 'admin', req.admin.id, null, getClientIp(req));
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const [[users]] = await pool.execute('SELECT COUNT(*) AS totalUsers FROM users');
    const [[events]] = await pool.execute('SELECT COUNT(*) AS totalEvents FROM events');
    const [[bookings]] = await pool.execute('SELECT COUNT(*) AS totalBookings FROM bookings');
    const [[revenue]] = await pool.execute(
      'SELECT COALESCE(SUM(GREATEST(total_collected - total_refunded, 0)), 0) AS totalRevenue FROM event_vaults'
    );

    res.json({
      success: true,
      stats: {
        totalUsers: users.totalUsers,
        totalEvents: events.totalEvents,
        totalBookings: bookings.totalBookings,
        totalRevenue: Number(revenue.totalRevenue || 0)
      }
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
  }
};

exports.getRecentActivity = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, a.admin_id, a.full_name
       FROM admin_audit_logs l
       INNER JOIN admins a ON a.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT 30`
    );
    res.json({ success: true, activities: rows });
  } catch (error) {
    console.error('Admin activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recent activity' });
  }
};

exports.getRevenueTrend = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE(src.created_at) AS day, COALESCE(SUM(src.amount), 0) AS revenue
       FROM (
         SELECT
           vt.event_id,
           vt.created_at,
           CASE
             WHEN vt.type = 'refund' THEN -ABS(vt.amount)
             ELSE ABS(vt.amount)
           END AS amount
         FROM event_vault_transactions vt
         WHERE vt.type IN ('booking_payment', 'refund')

         UNION ALL

         SELECT p.event_id, p.created_at, p.amount
         FROM payments p
         WHERE p.status = 'completed'
           AND p.event_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM event_vault_transactions vt2
             WHERE vt2.event_id = p.event_id
               AND vt2.type = 'booking_payment'
           )
       ) src
       WHERE src.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
       GROUP BY DATE(src.created_at)
       ORDER BY day ASC`
    );

    res.json({
      success: true,
      trend: rows.map((row) => ({
        day: row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day || '').slice(0, 10),
        revenue: Number(row.revenue || 0)
      }))
    });
  } catch (error) {
    console.error('Admin revenue trend error:', error);
    res.status(500).json({ success: false, message: 'Failed to load revenue trend' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, username, email, full_name, is_active, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ success: true, users: rows });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [[user]] = await pool.execute(
      `SELECT id, username, email, full_name, is_active, role, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [bookings] = await pool.execute(
      `SELECT b.id, b.event_id, b.status, b.ticket_type, b.seat_number, b.seat_numbers,
              COALESCE(b.booking_date, b.created_at) AS booking_date,
              e.title AS event_title
       FROM bookings b
       LEFT JOIN events e ON e.id = b.event_id
       WHERE b.user_id = ?
       ORDER BY COALESCE(b.booking_date, b.created_at) DESC`,
      [id]
    );

    const [createdEvents] = await pool.execute(
      `SELECT e.id, e.title, e.event_date, e.location, e.event_status, e.max_seats, e.available_seats,
              COALESCE(COUNT(b.id), 0) AS total_bookings
       FROM events e
       LEFT JOIN bookings b ON b.event_id = e.id AND b.status <> 'cancelled'
       WHERE e.organizer_id = ?
       GROUP BY e.id, e.title, e.event_date, e.location, e.event_status, e.max_seats, e.available_seats
       ORDER BY e.created_at DESC`,
      [id]
    );

    const [payments] = await pool.execute(
      `SELECT p.id, p.amount, p.status, p.payment_method, p.transaction_id, p.created_at,
              e.title AS event_title
       FROM payments p
       LEFT JOIN events e ON e.id = p.event_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [id]
    );

    const [favorites] = await pool.execute(
      `SELECT f.id, f.created_at, e.id AS event_id, e.title AS event_title, e.event_date
       FROM favorites f
       LEFT JOIN events e ON e.id = f.event_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [id]
    );

    const summary = {
      totalBookings: bookings.length,
      totalCreatedEvents: createdEvents.length,
      totalPayments: payments.length,
      totalFavorites: favorites.length
    };

    const security = {
      passwordStored: true,
      passwordViewable: false,
      passwordNote: 'Passwords are stored as secure hashes and cannot be viewed in plaintext.'
    };

    res.json({ success: true, user, summary, security, bookings, createdEvents, payments, favorites });
  } catch (error) {
    console.error('Admin get user details error:', error);
    res.status(500).json({ success: false, message: 'Failed to load user details' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [!!isActive, id]);
    await logAdminAction(req.admin.id, 'UPDATE_USER_STATUS', 'user', id, { isActive: !!isActive }, getClientIp(req));
    res.json({ success: true, message: 'User status updated' });
  } catch (error) {
    console.error('Admin update user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    await logAdminAction(req.admin.id, 'DELETE_USER', 'user', id, null, getClientIp(req));
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

exports.getEvents = async (req, res) => {
  try {
    const { status } = req.query;
    const queryParams = [];
    let whereClause = '';
    if (status && ['pending', 'approved', 'rejected', 'pending_admin_approval'].includes(status)) {
      whereClause = 'WHERE e.event_status = ?';
      queryParams.push(status);
    }

    const [rows] = await pool.execute(
      `SELECT
          e.*,
          u.full_name AS organizer_name,
          u.username AS organizer_username,
          COALESCE(bs.total_bookings, 0) AS total_bookings,
          COALESCE(bs.total_reserved_seats, 0) AS total_reserved_seats,
          COALESCE(v.total_revenue, 0) AS total_revenue
       FROM events e
       LEFT JOIN users u ON u.id = e.organizer_id
       LEFT JOIN (
          SELECT
            b.event_id,
            COUNT(*) AS total_bookings,
            COALESCE(SUM(CASE WHEN b.status <> 'cancelled' THEN ${seatsCountExpression} ELSE 0 END), 0) AS total_reserved_seats
          FROM bookings b
          GROUP BY b.event_id
       ) bs ON bs.event_id = e.id
       LEFT JOIN (
          SELECT event_id, COALESCE(GREATEST(total_collected - total_refunded, 0), 0) AS total_revenue
          FROM event_vaults
       ) v ON v.event_id = e.id
       ${whereClause}
       ORDER BY e.created_at DESC`,
      queryParams
    );

    res.json({ success: true, events: rows });
  } catch (error) {
    console.error('Admin get events error:', error);
    res.status(500).json({ success: false, message: 'Failed to load events' });
  }
};

exports.getEventDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [[event]] = await pool.execute(
      `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username, u.email AS organizer_email
       FROM events e
       LEFT JOIN users u ON u.id = e.organizer_id
       WHERE e.id = ?
       LIMIT 1`,
      [id]
    );

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const ended = isEventEnded(event.event_date);

    const [[bookingStats]] = await pool.execute(
      `SELECT
          COUNT(*) AS total_bookings,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN ${seatsCountExpression} ELSE 0 END), 0) AS total_reserved_seats
       FROM bookings b
       WHERE event_id = ?`,
      [id]
    );

    const [[revenueStats]] = await pool.execute(
      `SELECT COALESCE(GREATEST(total_collected - total_refunded, 0), 0) AS total_revenue
       FROM event_vaults
       WHERE event_id = ?`,
      [id]
    );

    let report = null;
    if (ended) {
      report = await getPostEventSummaryData(id);
    }

    // Fetch venue booking fee breakdown if this event has a venue booking
    let venueBookingFees = null;
    const [[vbFeeRow]] = await pool.execute(
      `SELECT vb.id, vb.status, vb.payment_status,
              vb.pending_venue_fee, vb.pending_platform_fee,
              v.name AS venue_name, v.price_per_day
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       WHERE vb.event_id = ?
       LIMIT 1`,
      [id]
    ).catch(() => [[]]);
    if (vbFeeRow) {
      venueBookingFees = {
        venueBookingId: vbFeeRow.id,
        venueBookingStatus: vbFeeRow.status,
        paymentStatus: vbFeeRow.payment_status,
        venueName: vbFeeRow.venue_name,
        pricePerDay: Number(vbFeeRow.price_per_day || 0),
        pendingVenueFee: Number(vbFeeRow.pending_venue_fee || 0),
        pendingPlatformFee: Number(vbFeeRow.pending_platform_fee || 0),
        totalPaid: Number((vbFeeRow.pending_venue_fee || 0)) + Number((vbFeeRow.pending_platform_fee || 0))
      };
    }

    res.json({
      success: true,
      event,
      ended,
      stats: {
        totalBookings: Number(bookingStats?.total_bookings || 0),
        totalReservedSeats: Number(bookingStats?.total_reserved_seats || 0),
        totalRevenue: Number(revenueStats?.total_revenue || 0)
      },
      report,
      venueBookingFees
    });
  } catch (error) {
    console.error('Admin get event details error:', error);
    res.status(500).json({ success: false, message: 'Failed to load event details' });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'description', 'location', 'venue_address', 'event_date', 'max_seats', 'available_seats', 'event_status'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    values.push(id);

    await pool.execute(`UPDATE events SET ${setClause} WHERE id = ?`, values);
    await logAdminAction(req.admin.id, 'UPDATE_EVENT', 'event', id, req.body, getClientIp(req));
    res.json({ success: true, message: 'Event updated' });
  } catch (error) {
    console.error('Admin update event error:', error);
    res.status(500).json({ success: false, message: 'Failed to update event' });
  }
};

exports.updateEventApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const [[event]] = await pool.execute(
      'SELECT id, organizer_id, title, event_date FROM events WHERE id = ? LIMIT 1',
      [id]
    );

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (isEventEnded(event.event_date)) {
      return res.status(400).json({
        success: false,
        message: 'This event has already ended and can no longer be approved or rejected'
      });
    }

    await pool.execute('UPDATE events SET event_status = ? WHERE id = ?', [status, id]);

    if (event && event.organizer_id) {
      const notifType = status === 'approved' ? 'success' : (status === 'rejected' ? 'warning' : 'info');
      const notifTitle = status === 'approved' ? 'Event Approved' : (status === 'rejected' ? 'Event Rejected' : 'Event Review Pending');
      const notifMessage = status === 'approved'
        ? `Your event "${event.title}" has been approved by the admin.`
        : (status === 'rejected'
          ? `Your event "${event.title}" has been rejected by the admin.`
          : `Your event "${event.title}" is pending admin review.`);
      await pool.execute(
        'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
        [uuidv4(), event.organizer_id, notifTitle, notifMessage, notifType]
      );
    }

    if (status === 'approved') {
      // ── Platform fee collection at admin approval ─────────────────────────
      // Platform fee is collected at admin approval — not at venue owner acceptance.
      // We credit the platform_wallet for every venue booking on this event that
      // carries a pending_platform_fee > 0 and has not already been credited
      // (guard: we only credit bookings whose payment_status is not 'transferred',
      //  since a 'transferred' booking would have already gone through a prior approval
      //  cycle — this prevents double-counting on re-approval edge cases).
      try {
        const { creditPlatformFee } = require('../../services/platformWalletService');
        const [platformFeeBookings] = await pool.execute(
          `SELECT id, pending_platform_fee
           FROM venue_bookings
           WHERE event_id = ?
             AND COALESCE(pending_platform_fee, 0) > 0
             AND payment_status <> 'transferred'`,
          [id]
        );

        if (platformFeeBookings.length > 0) {
          let feeConn;
          try {
            feeConn = await pool.getConnection();
            await feeConn.beginTransaction();

            for (const feeBooking of platformFeeBookings) {
              const feeAmount = Number(feeBooking.pending_platform_fee || 0);
              if (feeAmount > 0) {
                await creditPlatformFee(feeConn, {
                  eventId: id,
                  venueBookingId: feeBooking.id,
                  amount: feeAmount,
                  description: `Platform listing fee for event "${event.title}" (collected at admin approval)`
                });
              }
            }

            await feeConn.commit();
            feeConn.release();
            feeConn = null;
            console.log(`[updateEventApproval] Platform fee credited for event ${id} (${platformFeeBookings.length} booking(s)).`);
          } catch (feeErr) {
            if (feeConn) {
              try { await feeConn.rollback(); } catch (_) {}
              feeConn.release();
            }
            // Log but do not block the approval — fee can be reconciled manually
            console.error(`[updateEventApproval] Failed to credit platform fee for event ${id}:`, feeErr);
          }
        }
      } catch (feeQueryErr) {
        console.error(`[updateEventApproval] Failed to query platform fee bookings for event ${id}:`, feeQueryErr);
      }
      // ─────────────────────────────────────────────────────────────────────
      // Legacy flow: awaiting_event_approval → pending_venue_response
      const [bookings] = await pool.execute(
        `SELECT vb.id, vb.venue_id, v.owner_id, v.name AS venue_name
         FROM venue_bookings vb
         INNER JOIN venues v ON v.id = vb.venue_id
         WHERE vb.event_id = ? AND vb.status = 'awaiting_event_approval'`,
        [id]
      );
      for (const booking of bookings) {
        await pool.execute(
          "UPDATE venue_bookings SET status = 'pending_venue_response' WHERE id = ?",
          [booking.id]
        );
        if (booking.owner_id) {
          await pool.execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
            [
              uuidv4(),
              booking.owner_id,
              'New Venue Booking Request',
              `You have received a new booking request for your venue "${booking.venue_name}" on ${event.event_date}.`,
              'info'
            ]
          );
        }
      }

      // New dual-approval flow: notify venue owners of awaiting_dual_approval bookings
      // that admin has now approved — they can now accept or decline.
      const [dualApprovalBookings] = await pool.execute(
        `SELECT vb.id, vb.venue_id, v.owner_id, v.name AS venue_name, vb.pending_venue_fee
         FROM venue_bookings vb
         INNER JOIN venues v ON v.id = vb.venue_id
         WHERE vb.event_id = ? AND vb.status = 'awaiting_dual_approval'`,
        [id]
      );
      for (const booking of dualApprovalBookings) {
        if (booking.owner_id) {
          await pool.execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
            [
              uuidv4(),
              booking.owner_id,
              'Venue Booking Awaiting Your Approval',
              `The event has been admin-approved. Please accept or decline the booking for your venue "${booking.venue_name}" on ${event.event_date}. You will receive ${Number(booking.pending_venue_fee || 0).toFixed(2)} EGP once you accept.`,
              'info'
            ]
          );
        }
      }

      // Check if there are any already 'accepted' venue bookings for this event
      const [acceptedBookings] = await pool.execute(
        `SELECT vb.id, vb.host_id, v.owner_id
         FROM venue_bookings vb
         INNER JOIN venues v ON v.id = vb.venue_id
         WHERE vb.event_id = ? AND vb.status = 'accepted'`,
        [id]
      );
      for (const booking of acceptedBookings) {
        if (booking.owner_id && booking.host_id) {
          await createVenueBookingChat(booking.id, booking.host_id, booking.owner_id);
          
          // Notify Host
          await pool.execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
            [uuidv4(), booking.host_id, 'Direct Chat Available', 'Your venue booking is confirmed — you can now chat with the venue owner', 'info']
          );
          
          // Notify Venue Owner
          await pool.execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
            [uuidv4(), booking.owner_id, 'Direct Chat Available', 'Booking confirmed — you can now chat with the event host', 'info']
          );
        }
      }

      // Check and transfer venue payments if both approvals are complete
      try {
        const [eventBookings] = await pool.execute(
          'SELECT id FROM venue_bookings WHERE event_id = ?',
          [id]
        );
        const { checkAndTransferVenuePayment } = require('../../services/venueOwnerEscrowService');
        for (const b of eventBookings) {
          try {
            await checkAndTransferVenuePayment(b.id);
          } catch (err) {
            console.error(`Failed checkAndTransferVenuePayment for booking ${b.id}:`, err);
          }
        }
      } catch (err) {
        console.error('Failed querying bookings for admin event approval transfer:', err);
      }
    } else if (status === 'rejected') {
      const { handleAdminEventRejectionRefund } = require('../../services/venueOwnerEscrowService');
      const refundResult = await handleAdminEventRejectionRefund(id, req.admin.id);

      // Cancel any remaining non-prepaid bookings for this event
      await pool.execute(
        "UPDATE venue_bookings SET status = 'cancelled' WHERE event_id = ? AND status IN ('awaiting_event_approval', 'pending_venue_response')",
        [id]
      );

      await logAdminAction(req.admin.id, 'UPDATE_EVENT_APPROVAL', 'event', id, { status }, getClientIp(req));
      return res.json({
        success: true,
        message: `Event ${status}`,
        refunded: refundResult.refunded,
        refundAmount: refundResult.totalRefund || 0
      });
    }

    await logAdminAction(req.admin.id, 'UPDATE_EVENT_APPROVAL', 'event', id, { status }, getClientIp(req));
    res.json({ success: true, message: `Event ${status}` });
  } catch (error) {
    console.error('Admin update event approval error:', error);
    res.status(500).json({ success: false, message: 'Failed to update event status' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    await logAdminAction(req.admin.id, 'DELETE_EVENT', 'event', id, null, getClientIp(req));
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Admin delete event error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete event' });
  }
};

exports.getVenues = async (req, res) => {
  try {
    const allowedStatuses = new Set(['approved', 'pending_review', 'rejected', 'suspended', 'changes_requested']);
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const venues = await Venue.findAll();
    const filteredVenues = allowedStatuses.has(status)
      ? venues.filter((row) => String(row.status || 'approved').toLowerCase() === status)
      : venues;
    res.json({
      success: true,
      venues: filteredVenues.map((row) => normalizeVenueResponse(row))
    });
  } catch (error) {
    console.error('Admin get venues error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venues' });
  }
};

exports.updateVenueStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body.status || '').trim().toLowerCase();
    const allowedStatuses = new Set(['approved', 'pending_review', 'rejected', 'suspended', 'changes_requested']);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid venue status' });
    }

    const [[venue]] = await pool.execute('SELECT id, name FROM venues WHERE id = ? LIMIT 1', [id]);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const updates = { status };
    if (status === 'approved') updates.isAvailable = true;
    if (status === 'suspended') updates.isAvailable = false;
    const updated = await Venue.update(id, updates);

    await logAdminAction(req.admin.id, 'UPDATE_VENUE_STATUS', 'venue', String(id), { name: venue.name, status }, getClientIp(req));
    res.json({ success: true, venue: normalizeVenueResponse({ ...updated, upcoming_bookings: updated.upcoming_bookings || 0 }) });
  } catch (error) {
    console.error('Admin update venue status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update venue status' });
  }
};

exports.createVenue = async (req, res) => {
  try {
    const payload = normalizeVenuePayload(req.body);
    if (!payload.name || !payload.governorate || !payload.address || payload.totalCapacity <= 0 || payload.pricePerDay <= 0) {
      return res.status(400).json({ success: false, message: 'Venue name, governorate, address, capacity, and price are required' });
    }

    const created = await Venue.create({
      ...payload,
      status: 'approved',
      venueType: 'platform'
    });
    await logAdminAction(req.admin.id, 'CREATE_VENUE', 'venue', String(created.id), payload, getClientIp(req));
    res.status(201).json({ success: true, venue: normalizeVenueResponse({ ...created, upcoming_bookings: 0 }) });
  } catch (error) {
    console.error('Admin create venue error:', error);
    res.status(500).json({ success: false, message: 'Failed to create venue' });
  }
};

exports.updateVenue = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const payload = normalizeVenuePayload(req.body);
    const updated = await Venue.update(id, payload);
    await logAdminAction(req.admin.id, 'UPDATE_VENUE', 'venue', String(id), payload, getClientIp(req));
    res.json({ success: true, venue: normalizeVenueResponse({ ...updated, upcoming_bookings: updated.upcoming_bookings || 0 }) });
  } catch (error) {
    console.error('Admin update venue error:', error);
    res.status(500).json({ success: false, message: 'Failed to update venue' });
  }
};

exports.getVenueAnalytics = async (req, res) => {
  try {
    const [totalsResult, bookingTotalsResult, topVenueResult, trendResult] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS total_venues,
                SUM(CASE WHEN is_available = TRUE THEN 1 ELSE 0 END) AS available_venues,
                SUM(CASE WHEN is_featured = TRUE THEN 1 ELSE 0 END) AS featured_venues,
                COALESCE(SUM(total_reviews), 0) AS total_venue_reviews
         FROM venues`
      ),
      pool.execute(
        `SELECT COUNT(*) AS active_bookings,
                COALESCE(SUM(total_price), 0) AS revenue_from_venues
         FROM venue_bookings
         WHERE status = 'confirmed'
           AND payment_status = 'paid'`
      ),
      pool.execute(
        `SELECT v.id, v.name,
                COUNT(vb.id) AS confirmed_bookings,
                COALESCE(SUM(vb.total_price), 0) AS total_revenue
         FROM venues v
         LEFT JOIN venue_bookings vb
           ON vb.venue_id = v.id
          AND vb.status = 'confirmed'
         GROUP BY v.id, v.name
         ORDER BY confirmed_bookings DESC, total_revenue DESC, v.name ASC
         LIMIT 1`
      ),
      pool.execute(
        `SELECT DATE(booked_at) AS day, COALESCE(SUM(total_price), 0) AS revenue
         FROM venue_bookings
         WHERE status = 'confirmed'
           AND payment_status = 'paid'
           AND booked_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY DATE(booked_at)
         ORDER BY day ASC`
      )
    ]);
    const totals = totalsResult[0];
    const bookingTotals = bookingTotalsResult[0];
    const topVenue = topVenueResult[0];
    const trendRows = trendResult[0];

    res.json({
      success: true,
      stats: {
        totalVenues: Number(totals[0]?.total_venues || 0),
        availableVenues: Number(totals[0]?.available_venues || 0),
        featuredVenues: Number(totals[0]?.featured_venues || 0),
        totalVenueReviews: Number(totals[0]?.total_venue_reviews || 0),
        activeBookings: Number(bookingTotals[0]?.active_bookings || 0),
        revenueFromVenues: Number(bookingTotals[0]?.revenue_from_venues || 0),
        mostPopularVenue: topVenue[0]
          ? {
            id: topVenue[0].id,
            name: topVenue[0].name,
            confirmedBookings: Number(topVenue[0].confirmed_bookings || 0),
            totalRevenue: Number(topVenue[0].total_revenue || 0)
          }
          : null
      },
      trend: trendRows.map((row) => ({
        day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day || '').slice(0, 10),
        revenue: Number(row.revenue || 0)
      }))
    });
  } catch (error) {
    console.error('Admin venue analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue analytics' });
  }
};

exports.getVenueCalendar = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const [bookings, blocks] = await Promise.all([
      Venue.getBookedDates(id),
      Venue.getAvailabilityBlocks(id)
    ]);

    res.json({
      success: true,
      bookings: bookings.map((row) => ({
        date: row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : String(row.event_date || '').slice(0, 10),
        status: row.status
      })),
      blocks: blocks.map((row) => ({
        id: row.id,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date || '').slice(0, 10),
        endDate: row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date || '').slice(0, 10),
        reason: row.reason || '',
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Admin venue calendar error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue calendar' });
  }
};

exports.createVenueAvailabilityBlock = async (req, res) => {
  try {
    const venueId = parseInt(req.params.id, 10);
    const startDate = String(req.body.startDate || '').trim();
    const endDate = String(req.body.endDate || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, message: 'End date must be on or after the start date' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const block = await Venue.createAvailabilityBlock({
      venueId,
      startDate,
      endDate,
      reason,
      createdBy: req.admin.id
    });

    await logAdminAction(
      req.admin.id,
      'CREATE_VENUE_AVAILABILITY_BLOCK',
      'venue',
      String(venueId),
      { startDate, endDate, reason },
      getClientIp(req)
    );

    res.status(201).json({
      success: true,
      block: {
        id: block.id,
        startDate: block.start_date instanceof Date ? block.start_date.toISOString().slice(0, 10) : String(block.start_date || '').slice(0, 10),
        endDate: block.end_date instanceof Date ? block.end_date.toISOString().slice(0, 10) : String(block.end_date || '').slice(0, 10),
        reason: block.reason || ''
      }
    });
  } catch (error) {
    console.error('Admin create venue block error:', error);
    res.status(500).json({ success: false, message: 'Failed to block venue availability' });
  }
};

exports.deleteVenueAvailabilityBlock = async (req, res) => {
  try {
    const blockId = parseInt(req.params.blockId, 10);
    if (!Number.isFinite(blockId) || blockId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid block ID' });
    }

    const removed = await Venue.deleteAvailabilityBlock(blockId);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Availability block not found' });
    }

    await logAdminAction(
      req.admin.id,
      'DELETE_VENUE_AVAILABILITY_BLOCK',
      'venue_availability_block',
      String(blockId),
      null,
      getClientIp(req)
    );

    res.json({ success: true, message: 'Availability block removed' });
  } catch (error) {
    console.error('Admin delete venue block error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove availability block' });
  }
};

exports.getVenueBookings = async (req, res) => {
  try {
    const rows = await VenueBooking.findAll();
    res.json({
      success: true,
      bookings: rows.map((row) => normalizeVenueBookingResponse(row))
    });
  } catch (error) {
    console.error('Admin get venue bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue bookings' });
  }
};

exports.exportVenueBookingsCsv = async (req, res) => {
  try {
    const rows = await VenueBooking.findAll();
    const csvHeader = 'booking_id,venue_name,venue_category,event_title,host_name,host_email,event_date,total_price,status,payment_status,booked_at\n';
    const csvBody = rows.map((row) => [
      row.id,
      `"${String(row.venue_name || '').replace(/"/g, '""')}"`,
      `"${String(row.category || '').replace(/"/g, '""')}"`,
      `"${String(row.event_title || '').replace(/"/g, '""')}"`,
      `"${String(row.host_name || '').replace(/"/g, '""')}"`,
      `"${String(row.host_email || '').replace(/"/g, '""')}"`,
      row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : String(row.event_date || '').slice(0, 10),
      Number(row.total_price || 0),
      row.status,
      row.payment_status,
      row.booked_at instanceof Date ? row.booked_at.toISOString() : String(row.booked_at || '')
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="venue-bookings.csv"');
    res.send(csvHeader + csvBody);
  } catch (error) {
    console.error('Admin export venue bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to export venue bookings' });
  }
};

exports.updateVenueBookingStatus = async (req, res) => {
  let connection;
  try {
    const id = parseInt(req.params.id, 10);
    const nextStatus = String(req.body.status || '').trim().toLowerCase();
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue booking ID' });
    }
    if (!['confirmed', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Status must be confirmed or cancelled' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const booking = await VenueBooking.findById(id, connection);
    if (!booking) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Venue booking not found' });
    }

    let refundAmount = 0;
    let walletBalance = null;

    if (nextStatus === 'cancelled') {
      const result = await cancelVenueBooking({
        connection,
        venueBookingId: id,
        eventId: booking.event_id || null,
        hostId: booking.host_id,
        forceFullRefund: true
      });
      refundAmount = Number(result.refundAmount || 0);
      walletBalance = result.walletBalance == null ? null : Number(result.walletBalance);
    } else {
      await VenueBooking.update(id, {
        status: 'confirmed',
        paymentStatus: booking.payment_status === 'unpaid' ? 'paid' : booking.payment_status
      }, connection);
    }

    const updated = await VenueBooking.findById(id, connection);
    await connection.commit();
    connection.release();
    connection = null;

    await logAdminAction(req.admin.id, 'UPDATE_VENUE_BOOKING_STATUS', 'venue_booking', String(id), {
      status: nextStatus,
      refundAmount,
      walletBalance
    }, getClientIp(req));

    res.json({
      success: true,
      booking: normalizeVenueBookingResponse(updated),
      refund: {
        amount: refundAmount,
        walletBalance
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Admin update venue booking status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update venue booking status' });
  }
};

exports.getBookings = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.id, b.event_id, b.user_id, b.status, b.ticket_type, b.seat_number, b.seat_numbers,
              COALESCE(b.booking_date, b.created_at) AS booking_date,
              u.full_name AS user_name, u.email AS user_email,
              e.title AS event_title
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN events e ON e.id = b.event_id
       ORDER BY COALESCE(b.booking_date, b.created_at) DESC`
    );
    res.json({ success: true, bookings: rows });
  } catch (error) {
    console.error('Admin get bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bookings' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid booking status' });
    }

    if (status === 'cancelled') {
      const result = await cancelBookingAndRefundFromVault({
        bookingId: id,
        adminId: req.admin.id,
        ipAddress: getClientIp(req)
      });

      if (!result.success) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.message || 'Failed to cancel booking'
        });
      }

      return res.json({
        success: true,
        message: result.message,
        refund: {
          amount: Number(result.data?.refundAmount || 0),
          walletBalance: Number(result.data?.walletBalance || 0),
          vaultBalance: Number(result.data?.vaultBalance || 0)
        }
      });
    }

    await pool.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
    await logAdminAction(req.admin.id, 'UPDATE_BOOKING_STATUS', 'booking', id, { status }, getClientIp(req));
    res.json({ success: true, message: 'Booking status updated' });
  } catch (error) {
    console.error('Admin update booking status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update booking status' });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await cancelBookingAndRefundFromVault({
      bookingId: id,
      adminId: req.admin.id,
      ipAddress: getClientIp(req)
    });

    if (!result.success) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || 'Failed to cancel booking'
      });
    }

    return res.json({
      success: true,
      message: result.message,
      refund: {
        amount: Number(result.data?.refundAmount || 0),
        walletBalance: Number(result.data?.walletBalance || 0),
        vaultBalance: Number(result.data?.vaultBalance || 0)
      }
    });
  } catch (error) {
    console.error('Admin cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  }
};

exports.getWalletWithdrawals = async (req, res) => {
  try {
    const normalizedStatus = normalizeWithdrawalStatus(req.query.status || 'pending');
    const statusFilter = normalizedStatus || 'pending';

    const [rows] = await pool.execute(
      `SELECT w.id, w.user_id, w.amount, w.card_last_four, w.card_holder, w.status,
              w.requested_at, w.processed_at, w.reference_id,
              u.full_name AS user_name, u.username AS user_username, u.email AS user_email
       FROM wallet_withdrawals w
       LEFT JOIN users u ON u.id = w.user_id
       WHERE (? = 'all' OR w.status = ?)
       ORDER BY
         CASE w.status
           WHEN 'pending' THEN 0
           WHEN 'processing' THEN 1
           WHEN 'failed' THEN 2
           WHEN 'completed' THEN 3
           ELSE 4
         END,
         w.requested_at ASC,
         w.id ASC`,
      [String(req.query.status || '').trim().toLowerCase() === 'all' ? 'all' : statusFilter, statusFilter]
    );

    res.json({
      success: true,
      withdrawals: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        username: row.user_username,
        userEmail: row.user_email,
        amount: Number(row.amount || 0),
        cardLastFour: row.card_last_four,
        cardHolder: row.card_holder,
        status: row.status,
        requestedAt: row.requested_at,
        processedAt: row.processed_at,
        referenceId: row.reference_id
      }))
    });
  } catch (error) {
    console.error('Admin get wallet withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wallet withdrawals' });
  }
};

exports.updateWalletWithdrawalStatus = async (req, res) => {
  let connection;
  try {
    const id = parseInt(req.params.id, 10);
    const nextStatus = normalizeWithdrawalStatus(req.body.status);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal ID' });
    }
    if (!nextStatus || !['processing', 'completed', 'failed'].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be processing, completed, or failed'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT id, user_id, amount, card_last_four, card_holder, status, requested_at, processed_at, reference_id
       FROM wallet_withdrawals
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = rows[0];
    const currentStatus = normalizeWithdrawalStatus(withdrawal.status) || 'pending';
    if (currentStatus === nextStatus) {
      await connection.commit();
      connection.release();
      return res.json({
        success: true,
        message: `Withdrawal is already marked as ${nextStatus}`,
        withdrawal: {
          id: withdrawal.id,
          userId: withdrawal.user_id,
          amount: Number(withdrawal.amount || 0),
          cardLastFour: withdrawal.card_last_four,
          status: currentStatus,
          referenceId: withdrawal.reference_id
        }
      });
    }

    const allowedTransitions = {
      pending: new Set(['processing', 'completed', 'failed']),
      processing: new Set(['completed', 'failed']),
      completed: new Set([]),
      failed: new Set([])
    };

    if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].has(nextStatus)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Cannot move withdrawal from ${currentStatus} to ${nextStatus}`
      });
    }

    const amount = roundMoney(withdrawal.amount || 0) || 0;
    if (nextStatus === 'failed') {
      if (amount > 0) {
        await creditWalletRefundInTransaction({
          connection,
          userId: withdrawal.user_id,
          amount,
          description: `Withdrawal failed refund (Ref: ${withdrawal.reference_id || withdrawal.id})`
        });
      }

      await connection.execute(
        `UPDATE wallet_withdrawals
         SET status = 'failed', processed_at = NOW()
         WHERE id = ?`,
        [id]
      );

      await insertNotificationInTransaction({
        connection,
        userId: withdrawal.user_id,
        title: 'Withdrawal Failed',
        message: `Your withdrawal of ${formatMoney(amount)} EGP could not be processed. The amount has been returned to your wallet.`,
        type: 'error'
      });
    } else if (nextStatus === 'completed') {
      await connection.execute(
        `UPDATE wallet_withdrawals
         SET status = 'completed', processed_at = NOW()
         WHERE id = ?`,
        [id]
      );

      await insertNotificationInTransaction({
        connection,
        userId: withdrawal.user_id,
        title: 'Withdrawal Completed',
        message: `Your withdrawal of ${formatMoney(amount)} EGP has been processed successfully.`,
        type: 'success'
      });
    } else if (nextStatus === 'processing') {
      await connection.execute(
        `UPDATE wallet_withdrawals
         SET status = 'processing', processed_at = NULL
         WHERE id = ?`,
        [id]
      );
    }

    const [updatedRows] = await connection.execute(
      `SELECT id, user_id, amount, card_last_four, status, requested_at, processed_at, reference_id
       FROM wallet_withdrawals
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    await connection.commit();
    connection.release();
    connection = null;

    await logAdminAction(
      req.admin.id,
      'UPDATE_WALLET_WITHDRAWAL_STATUS',
      'wallet_withdrawal',
      String(id),
      {
        userId: withdrawal.user_id,
        previousStatus: currentStatus,
        nextStatus,
        amount,
        referenceId: withdrawal.reference_id
      },
      getClientIp(req)
    );

    const updated = updatedRows[0] || withdrawal;
    res.json({
      success: true,
      message: `Withdrawal marked as ${nextStatus}`,
      withdrawal: {
        id: updated.id,
        userId: updated.user_id,
        amount: Number(updated.amount || 0),
        cardLastFour: updated.card_last_four,
        status: updated.status,
        requestedAt: updated.requested_at,
        processedAt: updated.processed_at,
        referenceId: updated.reference_id
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Admin update wallet withdrawal status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update wallet withdrawal status' });
  }
};

exports.getRevenueReport = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.id AS event_id, e.title AS event_title,
              COALESCE(GREATEST(v.total_collected - v.total_refunded, 0), 0) AS total_revenue,
              COALESCE(tx.completed_payments, 0) AS completed_payments
       FROM events e
       LEFT JOIN event_vaults v ON v.event_id = e.id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS completed_payments
         FROM event_vault_transactions
         WHERE type = 'booking_payment'
         GROUP BY event_id
       ) tx ON tx.event_id = e.id
       GROUP BY e.id, e.title, v.total_collected, v.total_refunded, tx.completed_payments
       ORDER BY total_revenue DESC`
    );

    const [[overall]] = await pool.execute(
      'SELECT COALESCE(SUM(GREATEST(total_collected - total_refunded, 0)), 0) AS overall_revenue FROM event_vaults'
    );

    res.json({ success: true, overallRevenue: Number(overall.overall_revenue || 0), rows });
  } catch (error) {
    console.error('Admin revenue report error:', error);
    res.status(500).json({ success: false, message: 'Failed to build revenue report' });
  }
};

exports.exportRevenueCsv = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.id AS event_id, e.title AS event_title,
              COALESCE(GREATEST(v.total_collected - v.total_refunded, 0), 0) AS total_revenue,
              COALESCE(tx.completed_payments, 0) AS completed_payments
       FROM events e
       LEFT JOIN event_vaults v ON v.event_id = e.id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS completed_payments
         FROM event_vault_transactions
         WHERE type = 'booking_payment'
         GROUP BY event_id
       ) tx ON tx.event_id = e.id
       GROUP BY e.id, e.title, v.total_collected, v.total_refunded, tx.completed_payments
       ORDER BY total_revenue DESC`
    );

    const csvHeader = 'event_id,event_title,total_revenue,completed_payments\n';
    const csvBody = rows
      .map((r) => `${r.event_id},"${String(r.event_title || '').replace(/"/g, '""')}",${r.total_revenue},${r.completed_payments}`)
      .join('\n');

    const csv = csvHeader + csvBody;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue-report.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Admin export revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to export revenue report' });
  }
};

exports.sendNotification = async (req, res) => {
  try {
    const { title, message, type = 'info', userIds, userEmails } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    let targetUserIds = [];
    const missingEmails = [];

    if (Array.isArray(userIds) && userIds.length > 0) {
      targetUserIds.push(...userIds.map((id) => String(id).trim()).filter(Boolean));
    }

    if (Array.isArray(userEmails) && userEmails.length > 0) {
      const cleanEmails = userEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
      for (const email of cleanEmails) {
        const [rows] = await pool.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
        if (rows.length > 0) {
          targetUserIds.push(rows[0].id);
        } else {
          missingEmails.push(email);
        }
      }
    }

    targetUserIds = [...new Set(targetUserIds)];
    if (targetUserIds.length === 0) {
      const [users] = await pool.execute('SELECT id FROM users WHERE is_active = TRUE');
      targetUserIds = users.map((u) => u.id);
    }

    const values = targetUserIds.map((userId) => [uuidv4(), userId, title, message, type, false]);
    if (values.length > 0) {
      await pool.query(
        'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES ?',
        [values]
      );
    }

    await logAdminAction(
      req.admin.id,
      'SEND_NOTIFICATION',
      'notification',
      null,
      { title, type, toUsers: targetUserIds.length },
      getClientIp(req)
    );
    const missingPart = missingEmails.length > 0 ? ` (${missingEmails.length} email(s) not found)` : '';
    res.json({
      success: true,
      message: `Notification sent to ${targetUserIds.length} user(s)${missingPart}`,
      sentCount: targetUserIds.length,
      missingEmails
    });
  } catch (error) {
    console.error('Admin send notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to send notifications' });
  }
};

exports.getSupportTickets = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*, u.username, u.full_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.user_id IS NOT NULL
       ORDER BY t.is_read ASC, t.created_at DESC`
    );
    res.json({ success: true, tickets: rows });
  } catch (error) {
    console.error('Admin support list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load support tickets' });
  }
};

exports.replySupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const reply = String(req.body.reply || '').trim();
    const { status } = req.body;
    if (!reply) {
      return res.status(400).json({ success: false, message: 'Reply is required' });
    }

    const [[ticket]] = await pool.execute(
      `SELECT id, user_id, subject
       FROM support_tickets
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    const normalizedStatus = ['open', 'pending', 'closed'].includes(status) ? status : 'closed';
    await pool.execute(
      'UPDATE support_tickets SET admin_reply = ?, status = ?, is_read = TRUE, replied_by_admin_id = ?, replied_at = NOW() WHERE id = ?',
      [reply, normalizedStatus, req.admin.id, id]
    );

    if (ticket.user_id) {
      await pool.execute(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read)
         VALUES (?, ?, ?, ?, 'info', FALSE)`,
        [
          uuidv4(),
          ticket.user_id,
          'Support Reply Received',
          `Admin replied to your support request "${ticket.subject || 'Support message'}": ${reply}`
        ]
      );
    }

    await logAdminAction(req.admin.id, 'REPLY_SUPPORT_TICKET', 'support_ticket', id, { status: normalizedStatus, userNotified: !!ticket.user_id }, getClientIp(req));
    res.json({ success: true, message: 'Support ticket replied successfully' });
  } catch (error) {
    console.error('Admin support reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to reply to support ticket' });
  }
};

exports.markSupportTicketAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'UPDATE support_tickets SET is_read = TRUE WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }
    await logAdminAction(req.admin.id, 'MARK_SUPPORT_TICKET_READ', 'support_ticket', id, null, getClientIp(req));
    res.json({ success: true, message: 'Support ticket marked as read' });
  } catch (error) {
    console.error('Admin support mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark support ticket as read' });
  }
};

exports.markAllSupportTicketsAsRead = async (req, res) => {
  try {
    await pool.execute(
      'UPDATE support_tickets SET is_read = TRUE WHERE is_read = FALSE'
    );
    await logAdminAction(req.admin.id, 'MARK_ALL_SUPPORT_TICKETS_READ', 'support_ticket', null, null, getClientIp(req));
    res.json({ success: true, message: 'All support tickets marked as read' });
  } catch (error) {
    console.error('Admin support mark all read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all support tickets as read' });
  }
};

exports.deleteSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM support_tickets WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }
    await logAdminAction(req.admin.id, 'DELETE_SUPPORT_TICKET', 'support_ticket', id, null, getClientIp(req));
    res.json({ success: true, message: 'Support ticket deleted' });
  } catch (error) {
    console.error('Admin support delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete support ticket' });
  }
};

exports.deleteAllSupportTickets = async (req, res) => {
  try {
    await pool.execute('DELETE FROM support_tickets');
    await logAdminAction(req.admin.id, 'DELETE_ALL_SUPPORT_TICKETS', 'support_ticket', null, null, getClientIp(req));
    res.json({ success: true, message: 'All support tickets deleted' });
  } catch (error) {
    console.error('Admin support delete all error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete all support tickets' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value, updated_at FROM site_settings ORDER BY setting_key ASC');
    res.json({ success: true, settings: rows });
  } catch (error) {
    console.error('Admin settings get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ success: false, message: 'Settings array is required' });
    }

    const maintenanceSetting = settings.find((item) => item && item.key === 'maintenance_mode');
    let maintenanceStateBefore = false;
    let maintenanceStateAfter = false;

    if (maintenanceSetting) {
      const [[existingMaintenance]] = await pool.execute(
        `SELECT setting_value
         FROM site_settings
         WHERE setting_key = 'maintenance_mode'
         LIMIT 1`
      );
      maintenanceStateBefore = parseSettingBoolean(existingMaintenance?.setting_value);
      maintenanceStateAfter = parseSettingBoolean(maintenanceSetting.value);
    }

    for (const item of settings) {
      if (!item || !item.key) continue;
      await pool.execute(
        `INSERT INTO site_settings (setting_key, setting_value, updated_by_admin_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_admin_id = VALUES(updated_by_admin_id), updated_at = CURRENT_TIMESTAMP`,
        [item.key, item.value == null ? '' : String(item.value), req.admin.id]
      );
    }

    clearPlatformAccessCache();

    let maintenanceNotificationCount = 0;
    let maintenanceNotificationAction = '';
    if (maintenanceSetting && maintenanceStateBefore !== maintenanceStateAfter) {
      const [users] = await pool.execute(
        `SELECT id
         FROM users
         WHERE is_active = TRUE`
      );

      if (users.length > 0) {
        const title = maintenanceStateAfter
          ? 'Maintenance Mode Activated'
          : 'Platform Maintenance Completed';
        const message = maintenanceStateAfter
          ? 'The platform is now under maintenance. Some services may be temporarily unavailable until the administrator reopens the platform.'
          : 'Platform maintenance has been completed. Elshaboury Events is available again and you can continue using the platform normally.';
        const values = users.map((user) => ([
          uuidv4(),
          user.id,
          title,
          message,
          'warning',
          false
        ]));

        await pool.query(
          'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES ?',
          [values]
        );
        maintenanceNotificationCount = users.length;
        maintenanceNotificationAction = maintenanceStateAfter ? 'enabled' : 'disabled';
      }
    }

    await logAdminAction(
      req.admin.id,
      'UPDATE_SITE_SETTINGS',
      'site_settings',
      null,
      {
        count: settings.length,
        maintenanceNotificationSent: maintenanceNotificationCount,
        maintenanceNotificationAction
      },
      getClientIp(req)
    );
    res.json({
      success: true,
      message: maintenanceNotificationCount > 0
        ? `Settings updated and maintenance ${maintenanceNotificationAction} notification sent to ${maintenanceNotificationCount} user(s)`
        : 'Settings updated'
    });
  } catch (error) {
    console.error('Admin settings update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.ip_address, l.created_at,
              a.admin_id, a.full_name
       FROM admin_audit_logs l
       INNER JOIN admins a ON a.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, logs: rows });
  } catch (error) {
    console.error('Admin audit log error:', error);
    res.status(500).json({ success: false, message: 'Failed to load audit logs' });
  }
};

exports.getPendingVenueSubmissions = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.*, u.full_name AS owner_name, u.email AS owner_email
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_id
       WHERE v.status = 'pending_review'
       ORDER BY v.created_at DESC`
    );
    res.json({
      success: true,
      venues: rows.map((row) => ({
        ...normalizeVenueResponse(row),
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        status: row.status,
        venueType: row.venue_type,
        contactPhone: row.contact_phone,
        contactEmail: row.contact_email,
        cancellationPolicy: row.cancellation_policy,
        adminNotes: row.admin_notes
      }))
    });
  } catch (error) {
    console.error('Admin getPendingVenueSubmissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load pending venue submissions' });
  }
};

exports.approveVenueSubmission = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const [[venue]] = await pool.execute('SELECT name, owner_id FROM venues WHERE id = ? LIMIT 1', [id]);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    await pool.execute("UPDATE venues SET status = 'approved' WHERE id = ?", [id]);

    if (venue.owner_id) {
      await pool.execute(
        'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
        [
          uuidv4(),
          venue.owner_id,
          'Venue Listing Approved',
          `Your venue "${venue.name}" has been approved and is now active for booking requests.`,
          'success'
        ]
      );
    }

    await logAdminAction(req.admin.id, 'APPROVE_VENUE_SUBMISSION', 'venue', String(id), { name: venue.name }, getClientIp(req));

    res.json({ success: true, message: 'Venue submission approved successfully' });
  } catch (error) {
    console.error('Admin approveVenueSubmission error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve venue submission' });
  }
};

exports.rejectVenueSubmission = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const reason = String(req.body.reason || '').trim();
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const [[venue]] = await pool.execute('SELECT name, owner_id FROM venues WHERE id = ? LIMIT 1', [id]);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    await pool.execute("UPDATE venues SET status = 'rejected', admin_notes = ? WHERE id = ?", [reason, id]);

    if (venue.owner_id) {
      await pool.execute(
        'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
        [
          uuidv4(),
          venue.owner_id,
          'Venue Listing Rejected',
          `Your venue "${venue.name}" was rejected by admin. Reason: "${reason}"`,
          'warning'
        ]
      );
    }

    await logAdminAction(req.admin.id, 'REJECT_VENUE_SUBMISSION', 'venue', String(id), { name: venue.name, reason }, getClientIp(req));

    res.json({ success: true, message: 'Venue submission rejected successfully' });
  } catch (error) {
    console.error('Admin rejectVenueSubmission error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject venue submission' });
  }
};

exports.requestVenueChanges = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const comments = String(req.body.comments || '').trim();
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!comments) {
      return res.status(400).json({ success: false, message: 'Comments/changes list are required' });
    }

    const [[venue]] = await pool.execute('SELECT name, owner_id FROM venues WHERE id = ? LIMIT 1', [id]);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    await pool.execute("UPDATE venues SET status = 'changes_requested', admin_notes = ? WHERE id = ?", [comments, id]);

    if (venue.owner_id) {
      await pool.execute(
        'INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, FALSE)',
        [
          uuidv4(),
          venue.owner_id,
          'Changes Requested for Venue',
          `Admin requested modifications for your venue "${venue.name}": "${comments}"`,
          'info'
        ]
      );
    }

    await logAdminAction(req.admin.id, 'REQUEST_VENUE_CHANGES', 'venue', String(id), { name: venue.name, comments }, getClientIp(req));

    res.json({ success: true, message: 'Changes requested successfully' });
  } catch (error) {
    console.error('Admin requestVenueChanges error:', error);
    res.status(500).json({ success: false, message: 'Failed to request venue changes' });
  }
};

// ── Platform Wallet ────────────────────────────────────────────────────────

/**
 * GET /api/admin/platform-wallet
 * Returns the current platform wallet balance, totals, and recent transactions.
 */
exports.getPlatformWallet = async (req, res) => {
  try {
    const { getPlatformWalletOverview } = require('../../services/platformWalletService');
    const overview = await getPlatformWalletOverview();
    res.json({ success: true, ...overview });
  } catch (error) {
    console.error('Admin getPlatformWallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to load platform wallet' });
  }
};

/**
 * GET /api/admin/platform-wallet/transactions
 * Returns paginated platform wallet transactions.
 * Query: page (default 1), limit (default 20), type ('all'|'credit'|'debit')
 */
exports.getPlatformWalletTransactions = async (req, res) => {
  try {
    const { getPlatformWalletTransactions } = require('../../services/platformWalletService');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const type = ['credit', 'debit'].includes(req.query.type) ? req.query.type : 'all';
    const result = await getPlatformWalletTransactions({ page, limit, type });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Admin getPlatformWalletTransactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load platform wallet transactions' });
  }
};

/**
 * POST /api/admin/platform-wallet/withdraw
 * Withdraws funds from the platform wallet.
 * Body: { amount: number, description?: string }
 */
exports.withdrawPlatformWallet = async (req, res) => {
  try {
    const { withdrawFromPlatformWallet } = require('../../services/platformWalletService');
    const amount = Number(req.body.amount || 0);
    const description = String(req.body.description || '').trim() || `Admin withdrawal`;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Withdrawal amount must be a positive number' });
    }

    const result = await withdrawFromPlatformWallet({
      amount,
      description,
      adminId: req.admin?.admin_id || req.admin?.id || 'admin'
    });

    await logAdminAction(
      req.admin.id,
      'PLATFORM_WALLET_WITHDRAW',
      'platform_wallet',
      '1',
      { amount, description },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: `Successfully withdrew ${amount.toFixed(2)} EGP from the platform wallet`,
      newBalance: result.newBalance,
      transactionId: result.transactionId
    });
  } catch (error) {
    console.error('Admin withdrawPlatformWallet error:', error);
    // Surface balance-check messages directly to the client
    const msg = String(error.message || '');
    if (msg.toLowerCase().includes('insufficient')) {
      return res.status(400).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: 'Failed to process withdrawal' });
  }
};

