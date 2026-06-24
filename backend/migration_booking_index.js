/**
 * migration_booking_index.js
 * Adds a composite index on venue_bookings(venue_id, event_date, status)
 * for fast double-booking detection and timeline queries.
 */

require('dotenv').config({ path: './project.env' });
const pool = require('./config/database');

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log('Checking for existing index idx_vb_venue_date_status...');
    const [existing] = await connection.execute(
      `SELECT COUNT(1) AS cnt
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'venue_bookings'
         AND index_name = 'idx_vb_venue_date_status'`
    );
    if (Number(existing[0].cnt) > 0) {
      console.log('Index idx_vb_venue_date_status already exists. Skipping.');
      return;
    }

    console.log('Creating index idx_vb_venue_date_status on venue_bookings(venue_id, event_date, status)...');
    await connection.execute(
      `CREATE INDEX idx_vb_venue_date_status
       ON venue_bookings (venue_id, event_date, status)`
    );
    console.log('Index created successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
