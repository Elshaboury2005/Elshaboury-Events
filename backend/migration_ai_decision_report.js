/**
 * migration_ai_decision_report.js
 *
 * Adds the `ai_decision_report` JSON column to the `events` table.
 * Safe to run multiple times — skips if the column already exists.
 *
 * Run manually:  node backend/migration_ai_decision_report.js
 * Also auto-runs via server.js runMigrations() on startup.
 */

const pool = require('./config/database');

async function run() {
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'events'
       AND COLUMN_NAME  = 'ai_decision_report'`
  );

  if (columns.length > 0) {
    console.log('✅ ai_decision_report column already exists — skipping.');
    return;
  }

  await pool.execute(
    `ALTER TABLE events
     ADD COLUMN ai_decision_report JSON NULL DEFAULT NULL
     COMMENT 'Stores the full AI decision report from the predict service (decision, probabilities, reasons)'`
  );

  console.log('✅ Added ai_decision_report column to events table.');
}

module.exports = { run };

// Allow running directly: node migration_ai_decision_report.js
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
