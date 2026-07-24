const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_notifications table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL,
        message VARCHAR(500) NOT NULL,
        link VARCHAR(255) NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_notifications table is ready');
  } catch (error) {
    console.error('Error running workshop_notifications migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
