const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting users phone_number migration...');

        await pool.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) NULL');
        console.log('Added users.phone_number column if needed');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error running migration:', error);
        process.exit(1);
    }
}

runMigration();
