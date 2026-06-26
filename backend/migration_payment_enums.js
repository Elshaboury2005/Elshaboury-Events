const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting migration to update status enums...');

        // 1. Modify events.event_status enum
        const alterEventStatus = `
            ALTER TABLE events 
            MODIFY COLUMN event_status ENUM('pending', 'approved', 'rejected', 'pending_admin_approval') DEFAULT 'approved'
        `;
        await pool.execute(alterEventStatus);
        console.log('✅ Modified events.event_status enum to support pending_admin_approval');

        // 2. Modify venue_bookings.status enum
        const alterVenueBookingStatus = `
            ALTER TABLE venue_bookings 
            MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'awaiting_event_approval', 'pending_venue_response', 'accepted', 'declined', 'declined_auto_expired', 'awaiting_dual_approval') DEFAULT 'pending'
        `;
        await pool.execute(alterVenueBookingStatus);
        console.log('✅ Modified venue_bookings.status enum to support awaiting_dual_approval');

        console.log('🎉 Enum migration completed successfully!');
    } catch (error) {
        console.error('❌ Error running enum migration:', error.message);
        throw error;
    }
}

module.exports = { run: runMigration };
