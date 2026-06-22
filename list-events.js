const pool = require('./backend/config/database');

async function listEvents() {
    try {
        const [events] = await pool.execute('SELECT id, title, price_standard, price_special, price_vip FROM events');
        console.log(JSON.stringify(events, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error listing events:', error);
        process.exit(1);
    }
}

listEvents();
