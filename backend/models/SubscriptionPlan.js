const pool = require('../config/database');

const SubscriptionPlan = {
  findAll: async () => {
    const [rows] = await pool.execute(
      'SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC'
    );
    return rows.map(row => ({
      ...row,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features
    }));
  },

  findAllEnabled: async () => {
    const [rows] = await pool.execute(
      'SELECT * FROM subscription_plans WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC'
    );
    return rows.map(row => ({
      ...row,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features
    }));
  },

  findByKey: async (planKey) => {
    const [rows] = await pool.execute(
      'SELECT * FROM subscription_plans WHERE plan_key = ?',
      [planKey]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      ...row,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features
    };
  },

  update: async (planKey, data) => {
    const { label, price, price_label, features, is_enabled, badge, sort_order } = data;
    await pool.execute(
      `UPDATE subscription_plans
       SET label = ?, price = ?, price_label = ?, features = ?, is_enabled = ?, badge = ?, sort_order = ?
       WHERE plan_key = ?`,
      [
        label,
        price != null ? parseFloat(price) : null,
        price_label || null,
        JSON.stringify(Array.isArray(features) ? features : []),
        is_enabled ? 1 : 0,
        badge || null,
        parseInt(sort_order, 10) || 0,
        planKey
      ]
    );
    return SubscriptionPlan.findByKey(planKey);
  }
};

module.exports = SubscriptionPlan;
