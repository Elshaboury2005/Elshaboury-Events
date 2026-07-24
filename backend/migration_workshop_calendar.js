const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_events table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        event_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NULL,
        location VARCHAR(255) NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_events table is ready');
  } catch (error) {
    console.error('Error running workshop_events migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
