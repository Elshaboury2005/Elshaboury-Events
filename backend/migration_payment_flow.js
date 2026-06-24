const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting payment flow schema migration...');

        // 1. Add columns to venue_bookings table if they do not exist
        const addColumnsQuery = `
            ALTER TABLE venue_bookings
            ADD COLUMN pending_venue_fee DECIMAL(10, 2) DEFAULT 0.00,
            ADD COLUMN pending_platform_fee DECIMAL(10, 2) DEFAULT 0.00
        `;

        try {
            await pool.execute(addColumnsQuery);
            console.log('✅ Added columns to venue_bookings table');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ Columns pending_venue_fee / pending_platform_fee already exist in venue_bookings.');
            } else {
                throw error;
            }
        }

        // 2. Create admin_wallet_transactions table
        const createAdminTableQuery = `
            CREATE TABLE IF NOT EXISTS admin_wallet_transactions (
                id VARCHAR(36) PRIMARY KEY,
                amount DECIMAL(10, 2) NOT NULL,
                source VARCHAR(50) NOT NULL,
                event_id VARCHAR(36) NULL,
                venue_booking_id INT NULL,
                description VARCHAR(500) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
                FOREIGN KEY (venue_booking_id) REFERENCES venue_bookings(id) ON DELETE SET NULL
            )
        `;

        await pool.execute(createAdminTableQuery);
        console.log('✅ Created admin_wallet_transactions table');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error running migration:', error);
        process.exit(1);
    }
}

runMigration();
