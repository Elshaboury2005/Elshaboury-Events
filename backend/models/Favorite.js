const pool = require('../config/database');

const Favorite = {
  exists: async (userId, eventId) => {
    const [rows] = await pool.execute(
      'SELECT id FROM favorites WHERE user_id = ? AND event_id = ?',
      [userId, eventId]
    );
    return rows.length > 0;
  },

  findByUserId: async (userId) => {
    const [rows] = await pool.execute(`
      SELECT e.*, u.full_name as organizer_name, u.username as organizer_username, f.created_at as favorited_at
      FROM favorites f
      INNER JOIN events e ON f.event_id = e.id
      LEFT JOIN users u ON e.organizer_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId]);
    return rows;
  },

  add: async (id, userId, eventId) => {
    await pool.execute(
      'INSERT INTO favorites (id, user_id, event_id) VALUES (?, ?, ?)',
      [id, userId, eventId]
    );
  },

  remove: async (userId, eventId) => {
    const [result] = await pool.execute(
      'DELETE FROM favorites WHERE user_id = ? AND event_id = ?',
      [userId, eventId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = Favorite;
