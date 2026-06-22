const pool = require('../config/database');

const User = {
  findByUsernameOrEmail: async (usernameOrEmail) => {
    const [rows] = await pool.execute(
      'SELECT id, username, email, full_name, password, is_active, role, COALESCE(wallet_balance,0) AS wallet_balance, COALESCE(frozen_balance,0) AS frozen_balance FROM users WHERE username = ? OR email = ?',
      [usernameOrEmail, usernameOrEmail]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      'SELECT id, username, email, full_name, is_active, role, COALESCE(wallet_balance,0) AS wallet_balance, COALESCE(frozen_balance,0) AS frozen_balance FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  },

  existsByUsername: async (username) => {
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    return rows.length > 0;
  },

  existsByEmail: async (email) => {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    return rows.length > 0;
  },

  create: async (id, fullName, email, username, hashedPassword, role = 'user') => {
    const safeRole = (role === 'venue_owner') ? 'venue_owner' : 'user';
    try {
      await pool.execute(
        'INSERT INTO users (id, full_name, email, username, password, role, wallet_balance, frozen_balance, created_at) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, NOW())',
        [id, fullName, email, username, hashedPassword, safeRole]
      );
    } catch (error) {
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        // Fallback for older schema without role/frozen_balance columns
        try {
          await pool.execute(
            'INSERT INTO users (id, full_name, email, username, password, wallet_balance, created_at) VALUES (?, ?, ?, ?, ?, 0.00, NOW())',
            [id, fullName, email, username, hashedPassword]
          );
        } catch (innerError) {
          if (innerError.code !== 'ER_BAD_FIELD_ERROR') throw innerError;
          await pool.execute(
            'INSERT INTO users (id, full_name, email, username, password, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [id, fullName, email, username, hashedPassword]
          );
        }
      } else {
        throw error;
      }
    }
  }
};

module.exports = User;
