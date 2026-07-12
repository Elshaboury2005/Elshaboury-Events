const pool = require('../config/database');

const FAQ = {
  findAll: async () => {
    const [rows] = await pool.execute('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC');
    return rows;
  },

  findById: async (id) => {
    const [rows] = await pool.execute('SELECT * FROM faqs WHERE id = ?', [id]);
    return rows[0] || null;
  },

  create: async (data) => {
    const { category, question, answer, sort_order = 0 } = data;
    const [result] = await pool.execute(
      'INSERT INTO faqs (category, question, answer, sort_order) VALUES (?, ?, ?, ?)',
      [category, question, answer, sort_order]
    );
    return { id: result.insertId, ...data };
  },

  update: async (id, data) => {
    const { category, question, answer, sort_order } = data;
    await pool.execute(
      'UPDATE faqs SET category = ?, question = ?, answer = ?, sort_order = ? WHERE id = ?',
      [category, question, answer, sort_order, id]
    );
    return { id, ...data };
  },

  delete: async (id) => {
    await pool.execute('DELETE FROM faqs WHERE id = ?', [id]);
    return true;
  }
};

module.exports = FAQ;
