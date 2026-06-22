const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'event_registration_db'
};

async function seedData() {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database.');

    const mohamedId = 'e92a2860-82a2-4b28-bffe-df6ff8c75141';
    const salmaId = uuidv4();

    // 1. Create Salma if not exists
    await connection.execute(
        'INSERT IGNORE INTO users (id, username, password, email, full_name) VALUES (?, ?, ?, ?, ?)',
        [salmaId, 'salma', '$2b$10$hashedpassword', 'salma@example.com', 'Salma Ahmed']
    );

    const events = [
        {
            id: uuidv4(),
            title: 'Cairo Music Festival',
            description: 'A grand night of music in the heart of Cairo.',
            event_date: '2026-05-15 19:00:00',
            location: 'Cairo',
            governorate: 'Cairo',
            organizer_id: mohamedId,
            max_seats: 500,
            available_seats: 500,
            event_type: 'Music',
            latitude: 30.0444,
            longitude: 31.2357,
            host_name: 'Mohamed',
            host_email: 'mohamed@example.com',
            host_phone: '+201012345678'
        },
        {
            id: uuidv4(),
            title: 'Alexandria Tech Summit',
            description: 'The biggest technology workshop in Alexandria.',
            event_date: '2026-06-20 10:00:00',
            location: 'Alexandria',
            governorate: 'Alexandria',
            organizer_id: mohamedId,
            max_seats: 200,
            available_seats: 200,
            event_type: 'Workshop',
            latitude: 31.2001,
            longitude: 29.9187,
            host_name: 'Mohamed',
            host_email: 'mohamed@example.com',
            host_phone: '+201012345678'
        },
        {
            id: uuidv4(),
            title: 'Giza Art Exhibition',
            description: 'Discover local artists in front of the pyramids.',
            event_date: '2026-07-10 17:00:00',
            location: 'Giza',
            governorate: 'Giza',
            organizer_id: salmaId,
            max_seats: 150,
            available_seats: 150,
            event_type: 'Art',
            latitude: 29.9792,
            longitude: 31.1342,
            host_name: 'Salma',
            host_email: 'salma@example.com',
            host_phone: '+201198765432'
        },
        {
            id: uuidv4(),
            title: 'Luxor Historical Tour',
            description: 'A guided night tour of Luxor temple.',
            event_date: '2026-08-05 20:00:00',
            location: 'Luxor',
            governorate: 'Luxor',
            organizer_id: salmaId,
            max_seats: 50,
            available_seats: 50,
            event_type: 'Tour',
            latitude: 25.6872,
            longitude: 32.6396,
            host_name: 'Salma',
            host_email: 'salma@example.com',
            host_phone: '+201198765432'
        }
    ];

    for (const event of events) {
        await connection.execute(
            `INSERT INTO events (
                id, title, description, event_date, location, governorate, 
                organizer_id, max_seats, available_seats, event_type, 
                latitude, longitude, host_name, host_email, host_phone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                event.id, event.title, event.description, event.event_date,
                event.location, event.governorate, event.organizer_id,
                event.max_seats, event.available_seats, event.event_type,
                event.latitude, event.longitude, event.host_name,
                event.host_email, event.host_phone
            ]
        );
        console.log(`Created event: ${event.title}`);
    }

    await connection.end();
    console.log('Completed.');
}

seedData().catch(console.error);
