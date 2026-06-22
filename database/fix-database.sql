-- Fix Database - Create missing tables
USE event_registration_db;

-- Create notifications table if not exists
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_read (is_read),
    INDEX idx_created (created_at)
);

-- Create payments table if not exists
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36),
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_status (status)
);

-- Update events table with new columns if they don't exist
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS venue_address VARCHAR(500),
ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS host_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS host_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS host_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS host_organization VARCHAR(255),
ADD COLUMN IF NOT EXISTS oc_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS oc_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS oc_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS primary_sponsor VARCHAR(255),
ADD COLUMN IF NOT EXISTS sponsor_packages TEXT,
ADD COLUMN IF NOT EXISTS sponsor_contact VARCHAR(255),
ADD COLUMN IF NOT EXISTS lead_speaker VARCHAR(255),
ADD COLUMN IF NOT EXISTS speaker_topic VARCHAR(255),
ADD COLUMN IF NOT EXISTS speaker_bio TEXT,
ADD COLUMN IF NOT EXISTS price_standard DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS price_special DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS price_vip DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS pricing_notes TEXT,
ADD COLUMN IF NOT EXISTS logistics TEXT;

-- Verify tables exist
SELECT 'notifications' as table_name, COUNT(*) as row_count FROM notifications
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'favorites', COUNT(*) FROM favorites;




