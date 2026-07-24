const pool = require('./config/database');

async function runMigration() {
  try {
    console.log('Starting booking check-in columns migration...');

    // Add checked_in
    try {
      await pool.execute(`
        ALTER TABLE bookings
        ADD COLUMN checked_in BOOLEAN NOT NULL DEFAULT FALSE
      `);
      console.log('Added checked_in column to bookings');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) {
        console.warn('checked_in column warning:', e.message);
      }
    }

    // Add checked_in_at
    try {
      await pool.execute(`
        ALTER TABLE bookings
        ADD COLUMN checked_in_at TIMESTAMP NULL
      `);
      console.log('Added checked_in_at column to bookings');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) {
        console.warn('checked_in_at column warning:', e.message);
      }
    }

    // Add checked_in_by
    try {
      await pool.execute(`
        ALTER TABLE bookings
        ADD COLUMN checked_in_by INT NULL
      `);
      console.log('Added checked_in_by column to bookings');
    } catch (e) {
      if (!e.message.includes('Duplicate column')) {
        console.warn('checked_in_by column warning:', e.message);
      }
    }

    // Add Foreign Key constraint for checked_in_by -> workshop_members(id)
    try {
      await pool.execute(`
        ALTER TABLE bookings
        ADD CONSTRAINT fk_bookings_checked_in_by
        FOREIGN KEY (checked_in_by) REFERENCES workshop_members(id)
        ON DELETE SET NULL
      `);
      console.log('Added fk_bookings_checked_in_by foreign key to bookings');
    } catch (e) {
      if (!e.message.includes('Duplicate foreign key') && !e.message.includes('already exists') && !e.message.includes('Duplicate key')) {
        console.warn('fk_bookings_checked_in_by warning:', e.message);
      }
    }

    console.log('Booking check-in migration completed successfully!');
  } catch (error) {
    console.error('Error running booking check-in migration:', error.message);
    throw error;
  }
}

module.exports = { run: runMigration };
