const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_files table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        uploaded_by INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size_bytes BIGINT NULL,
        file_type VARCHAR(100) NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_files table is ready');
  } catch (error) {
    console.error('Error running workshop_files migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
