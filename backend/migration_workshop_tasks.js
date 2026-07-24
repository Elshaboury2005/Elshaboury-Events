const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop_tasks table migration...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        assigned_to INT NULL,
        created_by INT NOT NULL,
        status ENUM('todo','in_progress','done') NOT NULL DEFAULT 'todo',
        due_date DATE NULL,
        priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES workshop_members(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES workshop_members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_tasks table is ready');
  } catch (error) {
    console.error('Error running workshop_tasks migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
