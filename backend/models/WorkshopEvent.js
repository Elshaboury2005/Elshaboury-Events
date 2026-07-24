const pool = require('../config/database');

const WorkshopEvent = {
  create: async ({ categoryId, title, description, eventDate, startTime, endTime, location, createdBy }) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_events (category_id, title, description, event_date, start_time, end_time, location, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [categoryId, title, description || null, eventDate, startTime, endTime || null, location || null, createdBy]
    );
    return result.insertId;
  },

  findByCategoryId: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT e.*, m.email AS creator_email, m.role AS creator_role
       FROM workshop_events e
       JOIN workshop_members m ON e.created_by = m.id
       WHERE e.category_id = ?
       ORDER BY e.event_date ASC, e.start_time ASC`,
      [categoryId]
    );
    return rows;
  },

  findUpcoming: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT e.*, m.email AS creator_email, m.role AS creator_role
       FROM workshop_events e
       JOIN workshop_members m ON e.created_by = m.id
       WHERE e.category_id = ? AND e.event_date >= CURDATE()
       ORDER BY e.event_date ASC, e.start_time ASC
       LIMIT 10`,
      [categoryId]
    );
    return rows;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshop_events WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  update: async (id, { title, description, eventDate, startTime, endTime, location }) => {
    await pool.execute(
      `UPDATE workshop_events
       SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?, location = ?
       WHERE id = ?`,
      [title, description || null, eventDate, startTime, endTime || null, location || null, id]
    );
  },

  delete: async (id) => {
    await pool.execute(
      `DELETE FROM workshop_events WHERE id = ?`,
      [id]
    );
  }
};

module.exports = WorkshopEvent;
