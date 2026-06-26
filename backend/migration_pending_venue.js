const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting migration to add pending_venue event status...');

        // Modify events.event_status enum to include pending_venue
        const alterEventStatus = `
            ALTER TABLE events 
            MODIFY COLUMN event_status ENUM('pending', 'approved', 'rejected', 'pending_admin_approval', 'pending_venue') DEFAULT 'approved'
        `;
        await pool.execute(alterEventStatus);
        console.log('✅ Modified events.event_status enum to support pending_venue');

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Error running migration:', error.message);
        throw error;
    }
}

module.exports = { run: runMigration };
