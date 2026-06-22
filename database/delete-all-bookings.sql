-- Delete all bookings so no one has any tickets (fresh start).
-- Run this in MySQL. Events and users are NOT deleted.
USE event_registration_db;

-- Delete all payment records linked to bookings
DELETE FROM payments WHERE event_id IS NOT NULL;

-- Delete all bookings
DELETE FROM bookings;

-- Reset available_seats on every event back to max_seats
UPDATE events
SET available_seats = max_seats;

SELECT 'All bookings deleted. Payments cleared. Event capacities reset.' AS status;
