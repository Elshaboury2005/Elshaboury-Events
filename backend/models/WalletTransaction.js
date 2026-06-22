const pool = require('../config/database');

const WalletTransaction = {
  create: async (
    db,
    transactionId,
    userId,
    amount,
    type,
    source,
    description = null,
    relatedEventId = null,
    relatedBookingId = null,
    status = 'available',
    relatedVenueBookingId = null
  ) => {
    const connection = db || pool;
    await connection.execute(
      `INSERT INTO wallet_transactions
       (transaction_id, user_id, amount, type, source, description, related_event_id, related_booking_id, status, related_venue_booking_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        userId,
        amount,
        type,
        source,
        description,
        relatedEventId,
        relatedBookingId,
        status,
        relatedVenueBookingId
      ]
    );
  },

  findByUserIdAsc: async (userId) => {
    const [rows] = await pool.execute(
      `SELECT transaction_id, user_id, amount, type, source, description,
              related_event_id, related_booking_id, related_venue_booking_id,
              status, created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY created_at ASC, transaction_id ASC`,
      [userId]
    );
    return rows;
  },

  // Find the held transaction for a specific venue booking
  findHeldByVenueBooking: async (venueBookingId) => {
    const [rows] = await pool.execute(
      `SELECT *
       FROM wallet_transactions
       WHERE related_venue_booking_id = ?
         AND status = 'held'
         AND type = 'credit'
         AND source = 'venue-booking'
       LIMIT 1`,
      [venueBookingId]
    );
    return rows[0] || null;
  },

  // Update transaction status (held → available/released/refunded)
  updateStatus: async (transactionId, newStatus, conn = null) => {
    const db = conn || pool;
    await db.execute(
      'UPDATE wallet_transactions SET status = ? WHERE transaction_id = ?',
      [newStatus, transactionId]
    );
  }
};

module.exports = WalletTransaction;
