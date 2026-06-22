const pool = require('../config/database');

const seatsCountExpression = `
CASE
  WHEN seat_numbers IS NOT NULL AND seat_numbers <> '' THEN
    1 + LENGTH(seat_numbers) - LENGTH(REPLACE(seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(seat_number, 0), 1)
END
`;

const Booking = {
  getCountsByEventId: async (eventId) => {
    const [rows] = await pool.execute(`
      SELECT ticket_type,
             SUM(${seatsCountExpression}) as count
      FROM bookings
      WHERE event_id = ? AND status != 'cancelled'
      GROUP BY ticket_type
    `, [eventId]);
    return rows;
  },

  /** Get taken seat numbers per ticket type for an event. Returns e.g. { Standard: [1,3,5], Special: [2], Vip: [] } */
  getTakenSeatsByEvent: async (eventId, conn) => {
    const db = conn || pool;
    const [rows] = await db.execute(
      'SELECT ticket_type, seat_numbers, seat_number FROM bookings WHERE event_id = ? AND status != ?',
      [eventId, 'cancelled']
    );
    const taken = { Standard: [], Special: [], Vip: [] };
    const legacyCount = { Standard: 0, Special: 0, Vip: 0 };
    const normalizeType = (t) => {
      const s = (t || 'Standard').toString().trim().toLowerCase();
      if (s === 'vip') return 'Vip';
      if (s === 'special') return 'Special';
      return 'Standard';
    };
    (rows || []).forEach((row) => {
      const type = normalizeType(row.ticket_type);
      if (!taken[type]) taken[type] = [];
      const str = row.seat_numbers;
      if (str && typeof str === 'string') {
        str.split(',').forEach((s) => {
          const n = parseInt(s.trim(), 10);
          if (!isNaN(n) && n > 0) taken[type].push(n);
        });
      } else {
        const count = parseInt(row.seat_number, 10) || 1;
        legacyCount[type] = (legacyCount[type] || 0) + count;
      }
    });
    Object.keys(legacyCount).forEach((type) => {
      if (!taken[type]) taken[type] = [];
      const set = new Set(taken[type]);
      let next = 1;
      for (let i = 0; i < (legacyCount[type] || 0); i++) {
        while (set.has(next)) next++;
        taken[type].push(next);
        set.add(next);
        next++;
      }
    });
    Object.keys(taken).forEach((t) => { taken[t].sort((a, b) => a - b); });
    return taken;
  },

  countByEventAndTicketType: async (eventId, ticketType, conn) => {
    const db = conn || pool;
    const [rows] = await db.execute(
      `SELECT COALESCE(SUM(${seatsCountExpression}), 0) as count
       FROM bookings
       WHERE event_id = ? AND ticket_type = ? AND status != "cancelled"`,
      [eventId, ticketType]
    );
    return Number(rows[0].count || 0);
  },

  create: async (id, userId, eventId, seatNumberOrSeatNumbers, ticketType = 'Standard', conn) => {
    const db = conn || pool;
    let seatNumber;
    let seatNumbersStr = null;
    if (Array.isArray(seatNumberOrSeatNumbers) && seatNumberOrSeatNumbers.length > 0) {
      seatNumber = seatNumberOrSeatNumbers.length;
      seatNumbersStr = seatNumberOrSeatNumbers.map((n) => Number(n)).filter((n) => !isNaN(n) && n > 0).join(',');
    } else {
      seatNumber = seatNumberOrSeatNumbers == null ? null : parseInt(seatNumberOrSeatNumbers, 10) || null;
    }
    try {
      await db.execute(
        'INSERT INTO bookings (id, user_id, event_id, seat_number, status, ticket_type, seat_numbers) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, userId, eventId, seatNumber || null, 'confirmed', ticketType, seatNumbersStr]
      );
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' && err.message && err.message.includes('seat_numbers')) {
        await db.execute(
          'INSERT INTO bookings (id, user_id, event_id, seat_number, status, ticket_type) VALUES (?, ?, ?, ?, ?, ?)',
          [id, userId, eventId, seatNumber || null, 'confirmed', ticketType]
        );
      } else {
        throw err;
      }
    }
  },

  findByIdWithEvent: async (id) => {
    const [rows] = await pool.execute(`
      SELECT b.*, e.title as event_title, e.event_date, e.location
      FROM bookings b
      INNER JOIN events e ON b.event_id = e.id
      WHERE b.id = ?
    `, [id]);
    return rows[0] || null;
  },

  findByIdAndUserId: async (id, userId) => {
    const [rows] = await pool.execute(
      `SELECT b.id, b.event_id, b.user_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type,
              b.amount_paid, b.payment_method, b.wallet_amount_used,
              e.title as event_title, e.organizer_id,
              e.event_date,
              COALESCE(e.price_standard, 0) AS price_standard,
              COALESCE(e.price_special, 0) AS price_special,
              COALESCE(e.price_vip, 0) AS price_vip,
              COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status,
              b.attended
       FROM bookings b
       LEFT JOIN events e ON e.id = b.event_id
       WHERE b.id = ? AND b.user_id = ?`,
      [id, userId]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      `SELECT b.id, b.event_id, b.user_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type,
              b.amount_paid, b.payment_method, b.wallet_amount_used,
              e.title as event_title, e.organizer_id,
              e.event_date,
              COALESCE(e.price_standard, 0) AS price_standard,
              COALESCE(e.price_special, 0) AS price_special,
              COALESCE(e.price_vip, 0) AS price_vip,
              COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status,
              b.attended
       FROM bookings b
       LEFT JOIN events e ON e.id = b.event_id
       WHERE b.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  findByUserId: async (userId) => {
    try {
      const [rows] = await pool.execute(`
        SELECT b.*, e.title as event_title, e.description, e.event_date, e.location,
               e.max_seats, e.available_seats,
               COALESCE(e.price_standard, 0) AS price_standard,
               COALESCE(e.price_special, 0) AS price_special,
               COALESCE(e.price_vip, 0) AS price_vip,
               u.full_name as organizer_name,
               COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status
        FROM bookings b
        LEFT JOIN events e ON b.event_id = e.id
        LEFT JOIN users u ON e.organizer_id = u.id
        WHERE b.user_id = ?
        ORDER BY COALESCE(b.booking_date, b.created_at) DESC
      `, [userId]);
      return rows.map(r => ({ ...r, booking_date: r.booking_date || r.created_at }));
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('Unknown column')) {
        try {
          const [rows] = await pool.execute(`
            SELECT b.*, e.title as event_title, e.description, e.event_date, e.location,
                   e.max_seats, e.available_seats,
                   COALESCE(e.price_standard, 0) AS price_standard,
                   COALESCE(e.price_special, 0) AS price_special,
                   COALESCE(e.price_vip, 0) AS price_vip,
                   u.full_name as organizer_name,
                   COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status
            FROM bookings b
            LEFT JOIN events e ON b.event_id = e.id
            LEFT JOIN users u ON e.organizer_id = u.id
            WHERE b.user_id = ?
            ORDER BY b.booking_date DESC
          `, [userId]);
          return rows.map(r => ({ ...r, booking_date: r.booking_date || r.created_at }));
        } catch (e2) {
          const [rows] = await pool.execute(`
            SELECT b.*, e.title as event_title, e.description, e.event_date, e.location,
                   e.max_seats, e.available_seats,
                   COALESCE(e.price_standard, 0) AS price_standard,
                   COALESCE(e.price_special, 0) AS price_special,
                   COALESCE(e.price_vip, 0) AS price_vip,
                   u.full_name as organizer_name,
                   COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) AS event_lifecycle_status
            FROM bookings b
            LEFT JOIN events e ON b.event_id = e.id
            LEFT JOIN users u ON e.organizer_id = u.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
          `, [userId]);
          return rows.map(r => ({ ...r, booking_date: r.created_at }));
        }
      }
      throw err;
    }
  },

  findByEventId: async (eventId) => {
    try {
      const [rows] = await pool.execute(`
        SELECT b.id, b.status, b.seat_number, b.seat_numbers, b.booking_date, b.ticket_type, b.attended,
               u.username, u.email, u.full_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.event_id = ?
        ORDER BY b.booking_date DESC
      `, [eventId]);
      return rows.map(r => ({ ...r, ticket_type: r.ticket_type || 'Standard' }));
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('Unknown column')) {
        try {
          const [rows] = await pool.execute(`
            SELECT b.id, b.status, b.seat_number, b.seat_numbers, b.booking_date, b.attended,
                   u.username, u.email, u.full_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.event_id = ?
            ORDER BY b.booking_date DESC
          `, [eventId]);
          return rows.map(r => ({ ...r, ticket_type: 'Standard' }));
        } catch (e) {
          const [rows] = await pool.execute(`
            SELECT b.id, b.seat_number, b.seat_numbers, b.created_at as booking_date, b.attended,
                   u.username, u.email, u.full_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.event_id = ?
            ORDER BY b.created_at DESC
          `, [eventId]);
          return rows.map(r => ({ ...r, status: 'confirmed', ticket_type: 'Standard' }));
        }
      }
      throw err;
    }
  },

  updateStatus: async (id, status) => {
    await pool.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
  },

  cancel: async (id, userId) => {
    const [result] = await pool.execute(
      'UPDATE bookings SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelled', id, userId]
    );
    return result.affectedRows > 0;
  },

  cancelById: async (id, conn) => {
    const db = conn || pool;
    const [result] = await db.execute(
      'UPDATE bookings SET status = ? WHERE id = ?',
      ['cancelled', id]
    );
    return result.affectedRows > 0;
  },

  findConfirmedByEventId: async (eventId, conn) => {
    const db = conn || pool;
    const [rows] = await db.execute(
      `SELECT b.id, b.user_id, b.event_id, b.status, b.seat_number, b.seat_numbers, b.ticket_type,
              b.amount_paid, b.payment_method, b.wallet_amount_used,
              u.full_name, u.email
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.event_id = ? AND b.status = 'confirmed'`,
      [eventId]
    );
    return rows;
  }
};

module.exports = Booking;
