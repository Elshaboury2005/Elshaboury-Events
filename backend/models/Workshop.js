const pool = require('../config/database');

const Workshop = {
  /**
   * Create a new workshop row.
   */
  create: async (eventId, username, codeHash, createdBy) => {
    const [result] = await pool.execute(
      `INSERT INTO workshops (event_id, username, access_code_hash, created_by)
       VALUES (?, ?, ?, ?)`,
      [eventId, username, codeHash, createdBy]
    );
    return { id: result.insertId, event_id: eventId, username };
  },

  /**
   * Find a workshop by its unique username (used during login).
   */
  findByUsername: async (username) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshops WHERE username = ? LIMIT 1`,
      [username]
    );
    return rows[0] || null;
  },

  /**
   * Find a workshop by its primary key.
   */
  findById: async (workshopId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshops WHERE id = ? LIMIT 1`,
      [workshopId]
    );
    return rows[0] || null;
  },

  /**
   * Find the workshop attached to a specific event (if any).
   */
  findByEventId: async (eventId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshops WHERE event_id = ? LIMIT 1`,
      [eventId]
    );
    return rows[0] || null;
  },

  /**
   * Check whether a given username is already taken.
   */
  usernameExists: async (username) => {
    const [rows] = await pool.execute(
      `SELECT id FROM workshops WHERE username = ? LIMIT 1`,
      [username]
    );
    return rows.length > 0;
  }
};

module.exports = Workshop;
