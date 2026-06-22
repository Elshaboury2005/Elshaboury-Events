USE event_registration_db;

-- Add ticket_type column to bookings table if it implies it doesn't exist
ALTER TABLE bookings
ADD COLUMN ticket_type VARCHAR(50) DEFAULT 'Standard';
