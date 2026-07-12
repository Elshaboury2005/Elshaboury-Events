const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting subscription_plans table migration...');

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plan_key VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(120) NOT NULL,
        price DECIMAL(10,2) NULL,
        price_label VARCHAR(80) NULL COMMENT 'Display string, e.g. "$9/month"',
        features JSON NOT NULL COMMENT 'Array of feature strings',
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        badge VARCHAR(80) NULL COMMENT 'Optional badge text, e.g. "Best Value"',
        sort_order INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Created subscription_plans table if needed');

    const [rows] = await pool.execute('SELECT COUNT(*) AS cnt FROM subscription_plans');
    const count = rows[0]?.cnt || 0;

    if (count === 0) {
      console.log('Seeding default subscription plans...');

      const plans = [
        [
          'free_trial',
          'Free Trial',
          null,
          'Free / 7 days',
          JSON.stringify([
            '7-day free trial',
            'Browse and book up to 2 events',
            'Basic email support',
            'No commission discount'
          ]),
          1,
          null,
          1
        ],
        [
          'monthly',
          'Monthly Plan',
          9.99,
          '$9.99/month',
          JSON.stringify([
            'Unlimited event bookings',
            'Priority customer support',
            'Early access to new events (24h before public)',
            'Reduced service fees on bookings'
          ]),
          1,
          null,
          2
        ],
        [
          'annual',
          'Annual Plan',
          89.99,
          '$89.99/year',
          JSON.stringify([
            'Everything in Monthly Plan',
            '2 months free (best value)',
            'Exclusive VIP & organizer-only events',
            'Free profile verification badge',
            'Priority seat reservation during high-demand events'
          ]),
          1,
          'Best Value',
          3
        ]
      ];

      for (const plan of plans) {
        await pool.execute(
          `INSERT INTO subscription_plans
             (plan_key, label, price, price_label, features, is_enabled, badge, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          plan
        );
      }
      console.log('Seeded default subscription plans');
    }

    console.log('Subscription plans migration completed successfully!');
  } catch (error) {
    console.error('Error running subscriptions migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
