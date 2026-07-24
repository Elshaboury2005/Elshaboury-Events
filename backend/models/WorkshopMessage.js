const pool = require('../config/database');

const WorkshopMessage = {
  create: async ({ categoryId, senderId, message }) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_messages (category_id, sender_id, message) VALUES (?, ?, ?)`,
      [categoryId, senderId, message]
    );
    return result.insertId;
  },

  findByCategoryId: async (categoryId, limit = 50) => {
    const catId = Number(categoryId);
    const lim = Math.max(1, parseInt(limit, 10) || 50);
    // Use pool.query (non-prepared) with an inlined LIMIT integer to avoid
    // mysql2 ER_WRONG_ARGUMENTS with parameterised LIMIT in subqueries.
    const [rows] = await pool.query(
      `SELECT m.*, mem.email AS sender_email, mem.role AS sender_role
       FROM (
         SELECT * FROM workshop_messages
         WHERE category_id = ?
         ORDER BY id DESC
         LIMIT ${lim}
       ) m
       JOIN workshop_members mem ON m.sender_id = mem.id
       ORDER BY m.id ASC`,
      [catId]
    );
    return rows;
  },

  deleteOwn: async (id, senderId) => {
    const [result] = await pool.execute(
      `DELETE FROM workshop_messages 
       WHERE id = ? AND sender_id = ? AND created_at >= NOW() - INTERVAL 5 MINUTE`,
      [id, senderId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = WorkshopMessage;
