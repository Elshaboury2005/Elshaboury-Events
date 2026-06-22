-- Quick fix: Create favorites table only
USE event_registration_db;

-- Drop table if exists (to recreate)
DROP TABLE IF EXISTS favorites;

-- Create favorites table
CREATE TABLE favorites (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_event (user_id, event_id),
    INDEX idx_user (user_id),
    INDEX idx_event (event_id)
);

-- Verify it was created
SELECT 'favorites table created successfully!' as status;
SHOW TABLES LIKE 'favorites';




