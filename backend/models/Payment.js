const pool = require('../config/database');

const Payment = {
  create: async (id, userId, eventId, amount, paymentMethod, status, transactionId) => {
    await pool.execute(
      `INSERT INTO payments (id, user_id, event_id, amount, payment_method, status, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, eventId || null, amount, paymentMethod || 'demo', status, transactionId]
    );
  },

  updateEventId: async (id, userId, eventId) => {
    const [result] = await pool.execute(
      'UPDATE payments SET event_id = ? WHERE id = ? AND user_id = ?',
      [eventId, id, userId]
    );
    return result.affectedRows > 0;
  },

  findByUserId: async (userId) => {
    const [rows] = await pool.execute(`
      SELECT p.*, e.title as event_title
      FROM payments p
      LEFT JOIN events e ON p.event_id = e.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `, [userId]);
    return rows;
  }
};

module.exports = Payment;
