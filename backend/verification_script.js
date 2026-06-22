const fetch = require('node-fetch');

const API_BASE_URL = String(process.env.API_BASE_URL || '').trim().replace(/\/$/, '');
if (!API_BASE_URL) {
    throw new Error('Missing API_BASE_URL environment variable.');
}
const TEST_USER = {
    username: 'test_verifier_' + Date.now(),
    password: 'Password123!',
    email: 'test_' + Date.now() + '@example.com',
    fullName: 'Test Verifier'
};

const TEST_EVENT = {
    title: 'Automated Test Event ' + Date.now(),
    description: 'This is a test event created by the verification script.',
    eventDate: '2024-12-25',
    eventTime: '18:00',
    location: 'Test Location',
    maxSeats: 100,
    eventType: 'Workshop'
};

async function runVerification() {
    try {
        console.log('1. Registering test user...');
        const regRes = await fetch(`${API_BASE_URL}/Account/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TEST_USER)
        });
        const regData = await regRes.json();

        if (!regData.success && !regData.message.includes('already exists')) {
            throw new Error(`Registration failed: ${regData.message}`);
        }
        console.log('   User registered or already exists.');

        console.log('2. Logging in...');
        const loginRes = await fetch(`${API_BASE_URL}/Account/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: TEST_USER.username, password: TEST_USER.password })
        });
        const loginData = await loginRes.json();

        if (!loginData.success || !loginData.token) {
            throw new Error(`Login failed: ${loginData.message}`);
        }
        const token = loginData.token;
        console.log('   Login successful.');

        console.log('3. Creating event...');
        const createRes = await fetch(`${API_BASE_URL}/Events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(TEST_EVENT)
        });
        const createData = await createRes.json();

        if (!createData.success) {
            throw new Error(`Event creation failed: ${createData.message}`);
        }
        const eventId = createData.event.id;
        console.log(`   Event created with ID: ${eventId}`);

        console.log('4. Verifying event visibility (GET /Events)...');
        const listRes = await fetch(`${API_BASE_URL}/Events`);
        const listData = await listRes.json();

        if (!listData.success) {
            throw new Error('Failed to fetch events list');
        }

        const foundEvent = listData.events.find(e => e.id === eventId);
        if (!foundEvent) {
            throw new Error('Created event not found in public list!');
        }
        console.log('   Event found in public list.');

        console.log('5. Cleaning up (Deleting event)...');
        const delRes = await fetch(`${API_BASE_URL}/Events/${eventId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const delData = await delRes.json();
        if (!delData.success) {
            console.warn(`   Warning: Failed to delete test event: ${delData.message}`);
        } else {
            console.log('   Event deleted.');
        }

        console.log('\nSUCCESS: Event creation and visibility verified.');

    } catch (error) {
        console.error('\nFAILURE:', error.message);
        process.exit(1);
    }
}

runVerification();

