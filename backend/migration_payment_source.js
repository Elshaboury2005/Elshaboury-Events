const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting migration to update wallet_transactions source enum...');

        // 1. Modify wallet_transactions.source enum
        const alterWalletSource = `
            ALTER TABLE wallet_transactions 
            MODIFY COLUMN source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal', 'venue-booking', 'event-creation') NOT NULL
        `;
        await pool.execute(alterWalletSource);
        console.log('✅ Modified wallet_transactions.source enum to support event-creation');

        console.log('🎉 Wallet source migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error running wallet source migration:', error);
        process.exit(1);
    }
}

runMigration();
