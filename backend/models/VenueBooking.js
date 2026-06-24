const pool = require('../config/database');

function formatMysqlDateTime(value) {
  if (value == null || value === '') return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

const VenueBooking = {
  async create(data, conn = null) {
    const db = conn || pool;
    const {
      venueId,
      eventId = null,
      hostId,
      eventDate,
      totalPrice,
      status = 'pending',
      paymentStatus = 'unpaid',
      pendingVenueFee = 0,
      pendingPlatformFee = 0
    } = data;

    const [result] = await db.execute(
      `INSERT INTO venue_bookings (
        venue_id, event_id, host_id, event_date, total_price, status, payment_status, pending_venue_fee, pending_platform_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [venueId, eventId, hostId, eventDate, totalPrice, status, paymentStatus, pendingVenueFee, pendingPlatformFee]
    );

    return result.insertId;
  },

  async findById(id, conn = null) {
    const db = conn || pool;
    const [rows] = await db.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category,
              v.total_capacity, v.standard_seats, v.special_seats, v.vip_seats,
              v.price_per_day, v.images, v.amenities,
              v.owner_id AS venue_owner_id,
              v.contact_phone AS venue_contact_phone,
              v.contact_email AS venue_contact_email,
              e.title AS event_title, e.event_type,
              u.full_name AS host_name, u.email AS host_email
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByVenueAndDate(venueId, eventDate, statuses = ['confirmed'], conn = null) {
    const db = conn || pool;
    const placeholders = statuses.map(() => '?').join(', ');
    const [rows] = await db.execute(
      `SELECT *
       FROM venue_bookings
       WHERE venue_id = ?
         AND event_date = ?
         AND status IN (${placeholders})
       ORDER BY booked_at DESC`,
      [venueId, eventDate, ...statuses]
    );
    return rows;
  },

  async findByHost(hostId) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category,
              v.total_capacity, v.standard_seats, v.special_seats, v.vip_seats,
              v.price_per_day,
              e.title AS event_title
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       LEFT JOIN events e ON e.id = vb.event_id
       WHERE vb.host_id = ?
       ORDER BY vb.booked_at DESC, vb.id DESC`,
      [hostId]
    );
    return rows;
  },

  // All bookings for venues owned by this owner
  async findByVenueOwner(ownerId) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category, v.price_per_day,
              e.title AS event_title, e.event_type,
              e.event_date AS event_start_datetime,
              u.full_name AS host_name, u.email AS host_email
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id AND v.owner_id = ?
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       ORDER BY vb.booked_at DESC, vb.id DESC`,
      [ownerId]
    );
    return rows;
  },

  // Booking requests visible to venue owners, including those awaiting admin approval
  async findPendingForOwner(ownerId) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category, v.price_per_day,
              e.title AS event_title, e.event_type,
              e.max_seats AS guest_count,
              u.full_name AS host_name, u.email AS host_email
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id AND v.owner_id = ?
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.status IN ('awaiting_event_approval', 'pending_venue_response', 'awaiting_dual_approval')
       ORDER BY
         CASE vb.status
           WHEN 'pending_venue_response' THEN 0
           WHEN 'awaiting_dual_approval' THEN 1
           ELSE 2
         END,
         vb.booked_at ASC`,
      [ownerId]
    );
    return rows;
  },

  // Upcoming accepted/confirmed bookings for owner
  async findUpcomingForOwner(ownerId) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category, v.price_per_day,
              e.title AS event_title, e.event_type,
              u.full_name AS host_name, u.email AS host_email
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id AND v.owner_id = ?
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.status IN ('accepted','confirmed')
         AND vb.event_date >= CURDATE()
       ORDER BY vb.event_date ASC`,
      [ownerId]
    );
    return rows;
  },

  // Find requests that have timed out (no response within window)
  async findExpiredPendingRequests(windowHours) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.owner_id AS venue_owner_id,
              v.name AS venue_name,
              u.full_name AS host_name
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.status = 'pending_venue_response'
         AND vb.booked_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [windowHours]
    );
    return rows;
  },

  // Find held-fund bookings for events that ended before cutoff
  async findCompletedWithHeldFunds(graceHours) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.owner_id AS venue_owner_id, v.name AS venue_name,
              wt.transaction_id AS held_transaction_id, wt.amount AS held_amount,
              wt.user_id AS held_for_user_id
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       INNER JOIN wallet_transactions wt
         ON wt.related_venue_booking_id = vb.id
        AND wt.status = 'held'
        AND wt.type = 'credit'
        AND wt.source = 'venue-booking'
       WHERE vb.status IN ('accepted','confirmed')
         AND vb.event_date < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [graceHours]
    );
    return rows;
  },

  // Past/cancelled/declined/completed bookings for owner
  async findHistoryForOwner(ownerId) {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category, v.price_per_day,
              e.title AS event_title, e.event_type,
              u.full_name AS host_name, u.email AS host_email
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id AND v.owner_id = ?
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.status IN ('cancelled','declined','declined_auto_expired','completed')
          OR (vb.status IN ('accepted','confirmed') AND vb.event_date < CURDATE())
       ORDER BY vb.event_date DESC, vb.booked_at DESC, vb.id DESC`,
      [ownerId]
    );
    return rows;
  },

  async findAll() {
    const [rows] = await pool.execute(
      `SELECT vb.*, v.name AS venue_name, v.address AS venue_address, v.governorate,
              v.category,
              v.total_capacity, v.price_per_day,
              u.full_name AS host_name, u.email AS host_email,
              e.title AS event_title,
              ow.full_name AS owner_name
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       LEFT JOIN users u ON u.id = vb.host_id
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users ow ON ow.id = v.owner_id
       ORDER BY vb.booked_at DESC, vb.id DESC`
    );
    return rows;
  },

  async update(id, updates, conn = null) {
    const db = conn || pool;
    const fieldMap = {
      venueId: 'venue_id',
      eventId: 'event_id',
      hostId: 'host_id',
      eventDate: 'event_date',
      totalPrice: 'total_price',
      status: 'status',
      paymentStatus: 'payment_status',
      respondedAt: 'responded_at',
      ownerNotes: 'owner_notes',
      pendingVenueFee: 'pending_venue_fee',
      pendingPlatformFee: 'pending_platform_fee'
    };
    const fields = [];
    const values = [];

    Object.entries(updates || {}).forEach(([key, value]) => {
      if (!(key in fieldMap)) return;
      fields.push(`${fieldMap[key]} = ?`);
      values.push(key === 'respondedAt' ? formatMysqlDateTime(value) : value);
    });

    if (fields.length === 0) return VenueBooking.findById(id, db);

    values.push(id);
    await db.execute(`UPDATE venue_bookings SET ${fields.join(', ')} WHERE id = ?`, values);
    return VenueBooking.findById(id, db);
  }
};

module.exports = VenueBooking;
