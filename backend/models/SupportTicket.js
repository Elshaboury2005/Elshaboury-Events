const pool = require('../config/database');

const SupportTicket = {
  findByUserId: async (userId) => {
    const [rows] = await pool.execute(
      `SELECT id, subject, category, status, admin_reply, replied_at, created_at
       FROM support_tickets
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  create: async ({ id, userId, name, email, subject, category, message }) => {
    await pool.execute(
      `INSERT INTO support_tickets (id, user_id, name, email, subject, category, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      [id, userId, name, email, subject, category, message]
    );
  }
};

module.exports = SupportTicket;
