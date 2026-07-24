const pool = require('../config/database');

const WorkshopActivityLog = {
  create: async (categoryId, actorId, actionType, description) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_activity_log (category_id, actor_id, action_type, description)
       VALUES (?, ?, ?, ?)`,
      [categoryId, actorId, actionType, description]
    );
    return result.insertId;
  },

  findByCategoryId: async (categoryId, limit = 20, offset = 0) => {
    const catId = Number(categoryId);
    const lim = Math.max(1, parseInt(limit, 10) || 20);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    // Use pool.query (non-prepared) with inlined LIMIT/OFFSET to avoid
    // mysql2 ER_WRONG_ARGUMENTS on older MySQL server versions.
    const [rows] = await pool.query(
      `SELECT a.*, m.email AS actor_email, m.role AS actor_role
       FROM workshop_activity_log a
       JOIN workshop_members m ON a.actor_id = m.id
       WHERE a.category_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      [catId]
    );
    return rows;
  }
};

module.exports = WorkshopActivityLog;
