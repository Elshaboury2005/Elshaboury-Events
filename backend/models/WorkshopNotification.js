const pool = require('../config/database');

const WorkshopNotification = {
  create: async ({ memberId, message, link = null }) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_notifications (member_id, message, link)
       VALUES (?, ?, ?)`,
      [memberId, message, link]
    );
    return result.insertId;
  },

  findByMemberId: async (memberId, limit = 50, offset = 0) => {
    const memId = Number(memberId);
    const lim = Math.max(1, parseInt(limit, 10) || 50);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    // Use pool.query (non-prepared) with inlined LIMIT/OFFSET to avoid
    // mysql2 ER_WRONG_ARGUMENTS on older MySQL server versions.
    const [rows] = await pool.query(
      `SELECT * FROM workshop_notifications
       WHERE member_id = ?
       ORDER BY is_read ASC, created_at DESC, id DESC
       LIMIT ${lim} OFFSET ${off}`,
      [memId]
    );
    return rows;
  },

  markRead: async (id, memberId) => {
    const [result] = await pool.execute(
      `UPDATE workshop_notifications
       SET is_read = TRUE
       WHERE id = ? AND member_id = ?`,
      [id, memberId]
    );
    return result.affectedRows > 0;
  },

  markAllRead: async (memberId) => {
    const [result] = await pool.execute(
      `UPDATE workshop_notifications
       SET is_read = TRUE
       WHERE member_id = ? AND is_read = FALSE`,
      [memberId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = WorkshopNotification;
