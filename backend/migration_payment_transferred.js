const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting migration to add transferred payment_status...');

        // Modify venue_bookings.payment_status enum
        const alterVenueBookingPaymentStatus = `
            ALTER TABLE venue_bookings 
            MODIFY COLUMN payment_status ENUM('unpaid', 'paid', 'refunded', 'transferred') DEFAULT 'unpaid'
        `;
        await pool.execute(alterVenueBookingPaymentStatus);
        console.log('✅ Modified venue_bookings.payment_status enum to support transferred');

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Error running migration:', error.message);
        throw error;
    }
}

module.exports = { run: runMigration };
