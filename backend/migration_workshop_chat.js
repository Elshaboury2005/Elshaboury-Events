const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_messages table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        sender_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_messages table is ready');
  } catch (error) {
    console.error('Error running workshop_messages migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
