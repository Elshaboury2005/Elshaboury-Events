const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting workshop tables migration...');

    // ── workshops ─────────────────────────────────────────────────────────────
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshops (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        event_id      VARCHAR(36)  NOT NULL,
        username      VARCHAR(60)  NOT NULL,
        access_code_hash VARCHAR(255) NOT NULL,
        created_by    VARCHAR(36)  NOT NULL,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_workshop_username (username),
        KEY idx_workshops_event (event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshops table ready');

    // ── workshop_categories ───────────────────────────────────────────────────
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_categories (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id   INT          NOT NULL,
        category_name VARCHAR(120) NOT NULL,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        KEY idx_wcat_workshop (workshop_id),
        CONSTRAINT fk_wcat_workshop
          FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_categories table ready');

    // ── workshop_members ──────────────────────────────────────────────────────
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_members (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        category_id   INT          NOT NULL,
        email         VARCHAR(255) NOT NULL,
        role          ENUM('head','vice_head','member') NOT NULL DEFAULT 'member',
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_member_category (category_id, email),
        KEY idx_wmem_category (category_id),
        CONSTRAINT fk_wmem_category
          FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('workshop_members table ready');

    console.log('Workshop tables migration completed successfully!');
  } catch (error) {
    console.error('Error running workshop migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
