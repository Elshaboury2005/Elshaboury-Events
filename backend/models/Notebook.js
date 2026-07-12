const pool = require('../config/database');

const Notebook = {
  findByUserId: async (userId) => {
    const [rows] = await pool.execute(
      `SELECT id, user_id, name, description, payload, ml_fields, last_prediction, created_at, last_used_at
       FROM notebooks WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => ({
      ...r,
      payload: r.payload ? (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) : null,
      ml_fields: r.ml_fields ? (typeof r.ml_fields === 'string' ? JSON.parse(r.ml_fields) : r.ml_fields) : null,
      last_prediction: r.last_prediction ? (typeof r.last_prediction === 'string' ? JSON.parse(r.last_prediction) : r.last_prediction) : null,
    }));
  },

  findByIdAndUser: async (id, userId) => {
    const [rows] = await pool.execute(
      `SELECT id, user_id, name, description, payload, ml_fields, last_prediction, created_at, last_used_at
       FROM notebooks WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      payload: r.payload ? (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) : null,
      ml_fields: r.ml_fields ? (typeof r.ml_fields === 'string' ? JSON.parse(r.ml_fields) : r.ml_fields) : null,
      last_prediction: r.last_prediction ? (typeof r.last_prediction === 'string' ? JSON.parse(r.last_prediction) : r.last_prediction) : null,
    };
  },

  create: async (userId, name, description, payload) => {
    const [result] = await pool.execute(
      'INSERT INTO notebooks (user_id, name, description, payload) VALUES (?, ?, ?, ?)',
      [userId, name, description || null, payload ? JSON.stringify(payload) : null]
    );
    return { id: result.insertId, user_id: userId, name, description, payload };
  },

  // Save ML fields snapshot + auto-fetched data
  updateMlFields: async (id, userId, ml_fields) => {
    const [result] = await pool.execute(
      'UPDATE notebooks SET ml_fields = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [JSON.stringify(ml_fields), id, userId]
    );
    return result.affectedRows > 0;
  },

  // Save prediction result
  updatePrediction: async (id, userId, last_prediction) => {
    const [result] = await pool.execute(
      'UPDATE notebooks SET last_prediction = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [JSON.stringify(last_prediction), id, userId]
    );
    return result.affectedRows > 0;
  },

  updateLastUsed: async (id, userId) => {
    const [result] = await pool.execute(
      'UPDATE notebooks SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  },

  delete: async (id, userId) => {
    const [result] = await pool.execute(
      'DELETE FROM notebooks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = Notebook;
