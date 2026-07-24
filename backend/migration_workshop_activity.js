const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_activity_log table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        actor_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        description VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_activity_log table is ready');
  } catch (error) {
    console.error('Error running workshop_activity_log migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
