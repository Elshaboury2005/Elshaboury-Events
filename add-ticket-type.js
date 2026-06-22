const pool = require('./backend/config/database');

async function updateBookingsTable() {
    try {
        // Check if column exists
        const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'event_registration_db' 
      AND TABLE_NAME = 'bookings' 
      AND COLUMN_NAME = 'ticket_type'
    `);

        if (columns.length === 0) {
            console.log('Adding ticket_type column to bookings table...');
            await pool.execute("ALTER TABLE bookings ADD COLUMN ticket_type VARCHAR(50) DEFAULT 'Standard'");
            console.log('Column added successfully.');
        } else {
            console.log('Column ticket_type already exists.');
        }

        // Update existing bookings to have a random type for demonstration if needed, 
        // or keep default 'Standard'. Let's keep default.

        process.exit(0);
    } catch (error) {
        console.error('Error updating schema:', error);
        process.exit(1);
    }
}

updateBookingsTable();
