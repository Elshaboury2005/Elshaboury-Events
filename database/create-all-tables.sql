-- Create all required tables for Event Registration System
USE event_registration_db;

-- Create users table if not exists (assuming it exists but good to be explicit for complete setup)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    frozen_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    role ENUM('user','venue_owner') NOT NULL DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    venue_address VARCHAR(255),
    organizer_id VARCHAR(36) NOT NULL,
    max_seats INT NOT NULL,
    available_seats INT NOT NULL,
    standard_seats INT NOT NULL DEFAULT 0,
    special_seats INT NOT NULL DEFAULT 0,
    vip_seats INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    event_type VARCHAR(50),
    host_name VARCHAR(255),
    host_email VARCHAR(255),
    host_phone VARCHAR(50),
    host_organization VARCHAR(255),
    oc_name VARCHAR(255),
    oc_email VARCHAR(255),
    oc_phone VARCHAR(50),
    primary_sponsor VARCHAR(255),
    sponsor_packages TEXT,
    sponsor_contact VARCHAR(255),
    lead_speaker VARCHAR(255),
    speaker_topic VARCHAR(255),
    speaker_bio TEXT,
    price_standard DECIMAL(10, 2) DEFAULT 0,
    price_special DECIMAL(10, 2) DEFAULT 0,
    price_vip DECIMAL(10, 2) DEFAULT 0,
    pricing_notes TEXT,
    logistics TEXT,
    image_url VARCHAR(255),
    location_type VARCHAR(50) DEFAULT 'physical',
    venue_type ENUM('host_owned', 'platform_booked') DEFAULT 'host_owned',
    venue_id INT NULL,
    venue_booking_id INT NULL,
    governorate VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    registration_deadline DATETIME,
    age_restriction VARCHAR(50),
    terms_conditions TEXT,
    event_agenda TEXT,
    listing_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    event_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    payment_status ENUM('unpaid', 'paid') DEFAULT 'unpaid',
    ai_marketing_requested BOOLEAN DEFAULT FALSE,
    lifecycle_status ENUM('active', 'expired') DEFAULT 'active',
    expired_at DATETIME NULL,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    governorate VARCHAR(100) NOT NULL,
    address VARCHAR(500) NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    category ENUM(
        'conference_hall',
        'wedding_hall',
        'outdoor_garden',
        'rooftop',
        'theater',
        'sports_hall',
        'hotel_ballroom',
        'art_gallery',
        'beach_venue',
        'private_villa'
    ) NOT NULL DEFAULT 'conference_hall',
    total_capacity INT NOT NULL,
    standard_seats INT NOT NULL,
    special_seats INT NOT NULL,
    vip_seats INT NOT NULL,
    price_per_day DECIMAL(10,2) NOT NULL,
    rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    total_reviews INT NOT NULL DEFAULT 0,
    min_hours INT NOT NULL DEFAULT 4,
    price_per_hour DECIMAL(10,2),
    amenities TEXT,
    images TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    owner_id VARCHAR(36) NULL,
    status ENUM('pending_review','approved','rejected','changes_requested','suspended') NOT NULL DEFAULT 'approved',
    venue_type ENUM('platform','host_owned') NOT NULL DEFAULT 'platform',
    contact_phone VARCHAR(50) NULL,
    contact_email VARCHAR(255) NULL,
    cancellation_policy TEXT NULL,
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_venues_governorate (governorate)
);

CREATE TABLE IF NOT EXISTS venue_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT NOT NULL,
    event_id VARCHAR(36) NULL,
    host_id VARCHAR(36) NOT NULL,
    event_date DATE NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'awaiting_event_approval', 'pending_venue_response', 'accepted', 'declined', 'declined_auto_expired') DEFAULT 'pending',
    payment_status ENUM('unpaid', 'paid', 'refunded') DEFAULT 'unpaid',
    responded_at DATETIME NULL,
    owner_notes TEXT NULL,
    review_prompt_sent_at DATETIME NULL,
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_venue_bookings_lookup (venue_id, event_date, status),
    INDEX idx_venue_bookings_host (host_id, booked_at),
    INDEX idx_venue_bookings_event (event_id)
);

CREATE TABLE IF NOT EXISTS venue_wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    venue_id INT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wishlist (user_id, venue_id),
    INDEX idx_venue_wishlist_user (user_id, added_at),
    INDEX idx_venue_wishlist_venue (venue_id, added_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    rating INT NOT NULL,
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY one_review_per_booking (venue_id, user_id, event_id),
    INDEX idx_venue_reviews_venue (venue_id, created_at),
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_availability_blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_venue_blocks_lookup (venue_id, start_date, end_date),
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
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

-- Create notifications table
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

-- Create event views table
CREATE TABLE IF NOT EXISTS event_views (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    viewer_user_id VARCHAR(36) NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_event_views_event_created (event_id, created_at),
    INDEX idx_event_views_user (viewer_user_id)
);

-- Create followers table
CREATE TABLE IF NOT EXISTS followers (
    follower_id VARCHAR(36) NOT NULL,
    following_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_followers_follower (follower_id),
    INDEX idx_followers_following (following_id)
);

-- Create payments table
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

-- Create bookings table if not exists (adding for completeness)
CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    seat_number INT,
    seat_numbers VARCHAR(500) NULL COMMENT 'Comma-separated seat numbers e.g. 1,3,5',
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
    ticket_type VARCHAR(50) DEFAULT 'Standard',
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    payment_method ENUM('wallet', 'card', 'split') NULL,
    wallet_amount_used DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    attended BOOLEAN DEFAULT FALSE,
    reminder_sent_at DATETIME NULL,
    review_prompt_sent_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(36) PRIMARY KEY,
    admin_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id VARCHAR(36) PRIMARY KEY,
    admin_id VARCHAR(36) NOT NULL,
    token_id VARCHAR(64) UNIQUE NOT NULL,
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Create admin audit logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    admin_id VARCHAR(36) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(64),
    details TEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Create support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('open', 'pending', 'closed') DEFAULT 'open',
    admin_reply TEXT,
    replied_by_admin_id VARCHAR(36),
    replied_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (replied_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create site settings table
CREATE TABLE IF NOT EXISTS site_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    updated_by_admin_id VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Event reviews
CREATE TABLE IF NOT EXISTS event_reviews (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    rating INT NOT NULL,
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_event_user_review (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    transaction_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type ENUM('credit', 'debit') NOT NULL,
    source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal', 'venue-booking') NOT NULL,
    description VARCHAR(500) NULL,
    related_event_id VARCHAR(36) NULL,
    related_booking_id VARCHAR(36) NULL,
    status ENUM('available','held','released','refunded') NOT NULL DEFAULT 'available',
    related_venue_booking_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (related_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    FOREIGN KEY (related_venue_booking_id) REFERENCES venue_bookings(id) ON DELETE SET NULL,
    INDEX idx_wallet_user_created (user_id, created_at),
    INDEX idx_wallet_source (source),
    INDEX idx_wallet_venue_booking (related_venue_booking_id)
);

-- Event waitlist
CREATE TABLE IF NOT EXISTS event_waitlist (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    status ENUM('waiting', 'notified', 'joined', 'expired') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified_at TIMESTAMP NULL,
    UNIQUE KEY uniq_event_user_waitlist (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Promo codes
CREATE TABLE IF NOT EXISTS promo_codes (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    organizer_id VARCHAR(36) NOT NULL,
    code VARCHAR(50) NOT NULL,
    discount_type ENUM('percent', 'fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INT DEFAULT NULL,
    used_count INT DEFAULT 0,
    expires_at DATETIME NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_event_code (event_id, code),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Event check-in records
CREATE TABLE IF NOT EXISTS event_checkins (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    booking_id VARCHAR(36) NOT NULL,
    checked_in_by VARCHAR(36) NOT NULL,
    checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_booking_checkin (booking_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Per-ticket check-in records
CREATE TABLE IF NOT EXISTS booking_ticket_checkins (
    id VARCHAR(36) PRIMARY KEY,
    booking_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    seat_number INT NOT NULL,
    ticket_code VARCHAR(64) NOT NULL,
    checked_in_by VARCHAR(36) NOT NULL,
    checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_booking_seat_checkin (booking_id, seat_number),
    UNIQUE KEY uniq_ticket_code_checkin (ticket_code),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_event (event_id)
);

-- Email outbox (for booking confirmations)
CREATE TABLE IF NOT EXISTS email_outbox (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    email_to VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status ENUM('queued', 'sent', 'failed') DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Event marketing setup
CREATE TABLE IF NOT EXISTS event_marketing_setups (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    organizer_id VARCHAR(36) NOT NULL,
    marketing_budget DECIMAL(12,2) NOT NULL,
    primary_goal ENUM('profit','brand_awareness','community_building','lead_generation','product_launch') NOT NULL,
    income_level ENUM('low','medium','high') NOT NULL,
    audience_interests TEXT NOT NULL,
    expected_ticket_sales INT NOT NULL,
    estimated_event_cost DECIMAL(12,2) NOT NULL,
    instagram_url VARCHAR(255) NULL,
    facebook_url VARCHAR(255) NULL,
    is_first_event BOOLEAN NOT NULL,
    average_previous_attendance INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_event_marketing_setup (event_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Direct Chats
CREATE TABLE IF NOT EXISTS direct_chats (
    id VARCHAR(36) PRIMARY KEY,
    venue_booking_id INT NOT NULL,
    host_user_id VARCHAR(36) NOT NULL,
    venue_owner_user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_booking_chat (venue_booking_id),
    FOREIGN KEY (venue_booking_id) REFERENCES venue_bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (venue_owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_host_user (host_user_id),
    INDEX idx_owner_user (venue_owner_user_id)
);

CREATE TABLE IF NOT EXISTS direct_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES direct_chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_direct_chat_created (chat_id, created_at)
);

CREATE TABLE IF NOT EXISTS direct_chat_read_state (
    chat_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    last_read_at TIMESTAMP NULL,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES direct_chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Verify tables were created
SHOW TABLES;

SELECT 'Tables created successfully!' as status;
