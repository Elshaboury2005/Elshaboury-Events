const pool = require('./config/database');

async function runMigration() {
    try {
        console.log('Starting missing venue owner tables migration...');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS venue_owner_notification_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                venue_owner_id VARCHAR(36) NOT NULL,
                venue_id INT NOT NULL,
                venue_name VARCHAR(255) NOT NULL,
                target_type ENUM('single', 'all') NOT NULL,
                host_ids_json TEXT NOT NULL,
                title VARCHAR(100) NOT NULL,
                message VARCHAR(500) NOT NULL,
                type ENUM('info', 'warning', 'success') NOT NULL DEFAULT 'info',
                sent_count INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (venue_owner_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
            )
        `);
        console.log('Created venue_owner_notification_logs table if needed');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS event_team (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id VARCHAR(36) NOT NULL,
                name VARCHAR(150) NOT NULL,
                role VARCHAR(100) NOT NULL,
                contact_info VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
            )
        `);
        console.log('Created event_team table if needed');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Error running migration:', error.message);
        throw error;
    }
}

module.exports = { run: runMigration };
