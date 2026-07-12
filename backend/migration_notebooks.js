const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting notebooks table migration (v2)...');

    // Create table with all new columns if not exists
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        payload JSON NULL,
        ml_fields JSON NULL,
        last_prediction JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP NULL DEFAULT NULL,
        KEY idx_notebooks_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Created notebooks table if needed');

    // Make sure user_id is VARCHAR(36) in case it was created as INT earlier
    try {
      await pool.execute(`ALTER TABLE notebooks MODIFY COLUMN user_id VARCHAR(36) NOT NULL`);
      console.log('Altered user_id column to VARCHAR(36)');
    } catch (e) {
      console.warn('user_id modify:', e.message);
    }

    // Add description column if missing
    try {
      await pool.execute(`ALTER TABLE notebooks ADD COLUMN description TEXT NULL AFTER name`);
      console.log('Added description column');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) console.warn('description column:', e.message);
    }

    // Add ml_fields column if missing
    try {
      await pool.execute(`ALTER TABLE notebooks ADD COLUMN ml_fields JSON NULL AFTER payload`);
      console.log('Added ml_fields column');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) console.warn('ml_fields column:', e.message);
    }

    // Add last_prediction column if missing
    try {
      await pool.execute(`ALTER TABLE notebooks ADD COLUMN last_prediction JSON NULL AFTER ml_fields`);
      console.log('Added last_prediction column');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) console.warn('last_prediction column:', e.message);
    }

    // Allow payload to be NULL (was previously NOT NULL)
    try {
      await pool.execute(`ALTER TABLE notebooks MODIFY COLUMN payload JSON NULL`);
      console.log('Made payload nullable');
    } catch (e) {
      console.warn('payload modify:', e.message);
    }

    console.log('Notebooks migration (v2) completed successfully!');
  } catch (error) {
    console.error('Error running notebooks migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
