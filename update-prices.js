const pool = require('./backend/config/database');

async function updateEventPrices() {
    try {
        // Update events where price is 0 or NULL
        const [result] = await pool.execute(`
      UPDATE events 
      SET 
        price_standard = 150.00,
        price_special = 250.00,
        price_vip = 450.00
      WHERE price_standard = 0 OR price_standard IS NULL
    `);

        console.log(`Updated ${result.affectedRows} events with default prices.`);

        // List events again to verify
        const [events] = await pool.execute('SELECT id, title, price_standard, price_special, price_vip FROM events');
        console.log(JSON.stringify(events, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error updating prices:', error);
        process.exit(1);
    }
}

updateEventPrices();
