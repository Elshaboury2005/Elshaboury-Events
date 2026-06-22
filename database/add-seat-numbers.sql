-- Store specific seat numbers per booking (comma-separated e.g. "1,3,5")
-- Ensures each seat number can only be booked by one person per event.
-- Run once. If column already exists, ignore the error.
USE event_registration_db;

ALTER TABLE bookings
ADD COLUMN seat_numbers VARCHAR(500) NULL COMMENT 'Comma-separated seat numbers e.g. 1,3,5';
