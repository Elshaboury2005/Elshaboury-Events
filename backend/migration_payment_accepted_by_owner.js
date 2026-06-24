const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting migration to add accepted_by_owner status...');

        // Modify venue_bookings.status enum
        const alterVenueBookingStatus = `
            ALTER TABLE venue_bookings 
            MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'awaiting_event_approval', 'pending_venue_response', 'accepted', 'declined', 'declined_auto_expired', 'awaiting_dual_approval', 'accepted_by_owner') DEFAULT 'pending'
        `;
        await pool.execute(alterVenueBookingStatus);
        console.log('✅ Modified venue_bookings.status enum to support accepted_by_owner');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error running migration:', error);
        process.exit(1);
    }
}

runMigration();
