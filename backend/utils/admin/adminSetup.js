const bcrypt = require('bcryptjs');
const pool = require('../../config/database');

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows[0].count > 0;
}

async function createAdminTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id VARCHAR(36) PRIMARY KEY,
      admin_id VARCHAR(20) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id VARCHAR(36) PRIMARY KEY,
      admin_id VARCHAR(36) NOT NULL,
      token_id VARCHAR(64) NOT NULL UNIQUE,
      ip_address VARCHAR(64),
      user_agent VARCHAR(255),
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      is_revoked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      INDEX idx_admin (admin_id),
      INDEX idx_expires (expires_at)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id VARCHAR(36) PRIMARY KEY,
      admin_id VARCHAR(36) NOT NULL,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id VARCHAR(64),
      details TEXT,
      ip_address VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      INDEX idx_admin (admin_id),
      INDEX idx_action (action),
      INDEX idx_created (created_at)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'General Inquiry',
      message TEXT NOT NULL,
      status ENUM('open', 'pending', 'closed') DEFAULT 'open',
      is_read BOOLEAN DEFAULT FALSE,
      admin_reply TEXT,
      replied_by_admin_id VARCHAR(36),
      replied_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (replied_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
      INDEX idx_status (status),
      INDEX idx_is_read (is_read),
      INDEX idx_created (created_at)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS site_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT,
      updated_by_admin_id VARCHAR(36),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `);
}

async function ensureUserAndEventColumns() {
  if (!(await columnExists('users', 'is_active'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE');
  }

  if (!(await columnExists('events', 'event_status'))) {
    await pool.execute("ALTER TABLE events ADD COLUMN event_status ENUM('pending','approved','rejected') DEFAULT 'approved'");
    await pool.execute("UPDATE events SET event_status = 'approved' WHERE event_status IS NULL");
  }

  if (!(await columnExists('support_tickets', 'is_read'))) {
    await pool.execute('ALTER TABLE support_tickets ADD COLUMN is_read BOOLEAN DEFAULT FALSE');
  }

  if (!(await columnExists('support_tickets', 'category'))) {
    await pool.execute("ALTER TABLE support_tickets ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'General Inquiry' AFTER subject");
  }
}

async function ensureDefaultAdmin() {
  const defaultAdminId = process.env.DEFAULT_ADMIN_ID || '30509251603574';
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345';
  const defaultAdminName = process.env.DEFAULT_ADMIN_NAME || 'Platform Administrator';

  const [rows] = await pool.execute('SELECT id FROM admins WHERE admin_id = ? LIMIT 1', [defaultAdminId]);
  if (rows.length > 0) {
    return;
  }

  const { v4: uuidv4 } = require('uuid');
  const adminUuid = uuidv4();
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);
  await pool.execute(
    'INSERT INTO admins (id, admin_id, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, TRUE)',
    [adminUuid, defaultAdminId, defaultAdminName, passwordHash]
  );
}

async function setupAdminDatabase() {
  try {
    await createAdminTables();
    await ensureUserAndEventColumns();
    await ensureDefaultAdmin();
    return true;
  } catch (error) {
    console.error('Admin setup error:', error.message);
    return false;
  }
}

module.exports = { setupAdminDatabase };
