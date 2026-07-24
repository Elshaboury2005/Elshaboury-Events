# Backend Architecture Documentation

This document provides a comprehensive, exhaustive overview of the entire backend codebase for the **Elshaboury Events Platform** as it currently exists.

---

## Table of Contents

1. [Overall Architecture Summary](#overall-architecture-summary)
   - [Tech Stack](#tech-stack)
   - [Directory & Folder Structure](#directory--folder-structure)
   - [App Boot Sequence (`server.js`)](#app-boot-sequence-serverjs)
   - [Global Middleware Stack](#global-middleware-stack)
2. [Authentication & Authorization Architecture](#authentication--authorization-architecture)
   - [1. Core Platform JWT Auth (`middleware/authMiddleware.js`)](#1-core-platform-jwt-auth-middlewareauthmiddlewarejs)
   - [2. Workshop Member JWT Auth (`middleware/workshopAuthMiddleware.js`)](#2-workshop-member-jwt-auth-middlewareworkshopauthmiddlewarejs)
   - [3. Admin Token Auth (`middleware/admin/adminAuthMiddleware.js`)](#3-admin-token-auth-middlewareadminadminauthmiddlewarejs)
   - [4. Venue Owner Authorization (`middleware/venueOwnerMiddleware.js`)](#4-venue-owner-authorization-middlewarevenueownermiddlewarejs)
3. [Database Schema & Migrations](#database-schema--migrations)
   - [Database Connection & Pool](#database-connection--pool)
   - [Migration System & History](#migration-system--history)
   - [Complete Database Schema](#complete-database-schema)
4. [Models Layer (`backend/models/`)](#models-layer-backendmodels)
5. [Controllers Layer (`backend/controllers/`)](#controllers-layer-backendcontrollers)
6. [Routes & Endpoint Surface (`backend/routes/`)](#routes--endpoint-surface-backendroutes)
7. [Services Layer (`backend/services/`)](#services-layer-backendservices)
8. [Middleware Layer (`backend/middleware/`)](#middleware-layer-backendmiddleware)
9. [Utilities Layer (`backend/utils/`)](#utilities-layer-backendutils)
10. [Known Issues, Gaps & Technical Debt](#known-issues-gaps--technical-debt)

---

## Overall Architecture Summary

### Tech Stack

| Component / Library | Version / Type | Role / Usage |
| :--- | :--- | :--- |
| **Node.js Environment** | CommonJS (`require` / `module.exports`) | Runtime engine |
| **Express** | `^4.18.2` | Core HTTP Web Application Framework |
| **MySQL Database Client** | `mysql2` `^3.11.0` | Connection pool & SQL execution (`Promise`-based) |
| **Authentication & Security**| `jsonwebtoken` `^9.0.2`, `bcryptjs` `^2.4.3` | JWT generation/verification & password hashing |
| **Real-Time Communication** | `socket.io` `^4.7.5` | WebSockets for live chat, online count & room updates |
| **File Handling** | `multer` `^1.4.5-lts.1` | Multipart disk storage uploads (photos, workshop files) |
| **Validation & Utilities** | `uuid` `^9.0.1`, `validator` `^13.11.0`, `dotenv` `^16.4.5` | Identifiers, input sanitization, environment config |
| **CORS** | `cors` `^2.8.5` | Cross-Origin Resource Sharing controls |

---

### Directory & Folder Structure

```
backend/
├── config/                  # Database pool & environment loader
│   ├── database.js          # mysql2 connection pool creation & connection test
│   └── project.env          # Core environment variables (PORT, DB_*, JWT_SECRET, etc.)
├── controllers/             # Request handlers, business logic, DB orchestration
│   ├── admin/               # Administrative panel API controllers
│   │   └── adminController.js
│   ├── accountController.js # Auth (register, login, check username/email)
│   ├── aiController.js      # Basic AI assistant endpoint
│   ├── bookingController.js # Event seat booking & check-in controller
│   ├── chatController.js    # Public/Attendee event chat history & locking
│   ├── directChatController.js # Host ↔ Venue Owner direct messaging controller
│   ├── eventController.js   # Event CRUD, seating maps, reviews, promo codes, vault
│   ├── favoriteController.js# User bookmarking/favorites
│   ├── marketingController.js # AI Marketing campaign generator & configuration
│   ├── notebookController.js # Saved ML simulation notebooks CRUD
│   ├── notebookPredictionController.js # Custom JS-based ML prediction pipeline
│   ├── notificationController.js # User notifications read/delete operations
│   ├── organizerController.js # Organizer profile & follower toggle
│   ├── paymentController.js # Payment processing & transaction management
│   ├── profileController.js # User profile updates, photo uploads, settings
│   ├── supportController.js # Support ticket submission & listing
│   ├── venueController.js   # Public venue directory, search, wishlist & reviews
│   ├── venueOwnerController.js # Venue owner dashboard, timeline, bookings & wallet
│   ├── walletController.js  # User wallet top-ups, withdrawals & payments
│   ├── workshopActivityController.js # Workshop activity log endpoint
│   ├── workshopCalendarController.js  # Workshop calendar event management
│   ├── workshopChatController.js      # Workshop internal category chat
│   ├── workshopCheckinController.js   # Workshop live check-in scanner
│   ├── workshopController.js        # Workshop setup, login, member management
│   ├── workshopFileController.js      # Workshop internal file repository
│   ├── workshopNotificationController.js # Workshop team notifications
│   ├── workshopProgressController.js  # Workshop team completion statistics
│   └── workshopTaskController.js      # Workshop task board (Kanban style)
├── middleware/              # Authentication & policy enforcement gates
│   ├── admin/
│   │   └── adminAuthMiddleware.js # Admin bearer token validation
│   ├── authMiddleware.js    # Core platform JWT verification & optional auth
│   ├── platformAccessMiddleware.js # Maintenance & lockdown gate keeper
│   ├── venueOwnerMiddleware.js # Role check requiring role === 'venue_owner'
│   └── workshopAuthMiddleware.js # Workshop JWT verification & role authorization
├── models/                  # SQL Data Access Objects & Query Builders
│   ├── Booking.js           # Bookings table queries & seat assignments
│   ├── Event.js             # Event schema queries, filters, revenue summaries
│   ├── FAQ.js               # Frequently Asked Questions queries
│   ├── Favorite.js          # User favorites mapping
│   ├── MarketingSetup.js    # Marketing inputs & AI prompts persistence
│   ├── Notebook.js          # ML notebook state persistence
│   ├── Notification.js      # Platform user notification queries
│   ├── Payment.js           # Payment record tracking
│   ├── SubscriptionPlan.js  # Tiered subscription management
│   ├── SupportTicket.js     # User support tickets
│   ├── User.js              # User profiles, passwords & roles
│   ├── Venue.js             # Venue metadata, capacity, pricing
│   ├── VenueBooking.js      # Host-to-venue booking contracts & status
│   ├── VenueReview.js       # Reviews for physical venues
│   ├── VenueWishlist.js     # User saved venues mapping
│   ├── WalletTransaction.js # Financial audit log transactions
│   ├── Workshop.js          # Workshop instance records
│   ├── WorkshopActivityLog.js # Workshop internal audit trail
│   ├── WorkshopCategory.js  # Workshop committee/department categories
│   ├── WorkshopEvent.js     # Workshop internal calendar items
│   ├── WorkshopFile.js      # Workshop internal attached assets
│   ├── WorkshopMember.js    # Workshop team members & roles
│   ├── WorkshopMessage.js   # Workshop category message history
│   ├── WorkshopNotification.js # Workshop internal alerts
│   └── WorkshopTask.js      # Workshop task items & status
├── routes/                  # Express route routing declarations
│   ├── admin/
│   │   └── adminRoutes.js   # /api/admin endpoints
│   ├── accountRoutes.js     # /api/account
│   ├── bookingRoutes.js     # /api/bookings
│   ├── chat.js              # /api/chat
│   ├── directChatRoutes.js  # /api/direct-chat
│   ├── eventRoutes.js       # /api/events
│   ├── faqRoutes.js         # /api/faqs
│   ├── favoriteRoutes.js    # /api/favorites
│   ├── notebookRoutes.js    # /api/notebooks
│   ├── notificationRoutes.js # /api/notifications
│   ├── organizerRoutes.js   # /api/organizers
│   ├── paymentRoutes.js     # /api/payments
│   ├── profileRoutes.js     # /api/profile
│   ├── subscriptionRoutes.js # /api/subscriptions
│   ├── supportRoutes.js     # /api/support
│   ├── venueOwnerRoutes.js  # /api/venue-owner
│   ├── venuesRoutes.js      # /api/venues
│   ├── walletRoutes.js      # /api/wallet
│   ├── workshopActivityRoutes.js    # /api/workshop/activity
│   ├── workshopCalendarRoutes.js    # /api/workshop/calendar
│   ├── workshopChatRoutes.js        # /api/workshop/chat
│   ├── workshopCheckinRoutes.js     # /api/workshop/checkin
│   ├── workshopFileRoutes.js        # /api/workshop/files
│   ├── workshopNotificationRoutes.js# /api/workshop/notifications
│   ├── workshopProgressRoutes.js    # /api/workshop/progress
│   ├── workshopRoutes.js            # /api/workshop
│   └── workshopTaskRoutes.js        # /api/workshop/tasks
├── services/                # Specialized domain service logic & background processing
│   ├── aiDecisionService.js # Heuristic fallback for ML prediction system
│   ├── chatCleanupService.js# Automated retention purger for chat logs
│   ├── chatService.js       # Public/Attendee event chat persistence & access rules
│   ├── directChatService.js # Venue owner/host chat authorization & retrieval
│   ├── eventLifecycleService.js # Automatic event status updates & cleanup
│   ├── eventVaultService.js # Organizer revenue holding & payout calculation
│   ├── openAiMarketingService.js # OpenAI GPT API integration for marketing
│   ├── platformAccessService.js # Global platform lockdown & maintenance state
│   ├── platformFeeService.js# Platform fee calculation & configuration
│   ├── platformWalletService.js # Central system wallet fee collection
│   ├── venueBookingExpiryService.js # Automatic expiration for unconfirmed bookings
│   ├── venueBookingFundReleaseService.js # Escrow release of venue funds
│   ├── venueBookingService.js # Double-booking checks & venue reservation logic
│   ├── venueOwnerEscrowService.js # Escrow vault logic for venue owner payouts
│   └── walletService.js     # User balance calculations & transaction ledger
├── utils/                   # Shared utility scripts & database initializers
│   ├── admin/
│   │   └── adminSetup.js    # Admin table creation & default admin account seeder
│   ├── createWorkshopNotification.js # Helper for dispatching workshop team alerts
│   ├── databaseSetup.js     # Master schema bootstrapper & venue seed generator
│   ├── emailService.js      # Email outbox queueing service
│   ├── eventSeating.js      # Dynamic seat configuration parser & tier counts
│   ├── logWorkshopActivity.js # Non-blocking workshop audit logger
│   ├── promoPricing.js      # Promo code discount calculation utility
│   ├── refundWalletUtils.js # Automated wallet credit & transaction log utility
│   └── socketHandler.js     # Socket.io connection setup, events & state management
├── migration_add_venue_booking_fees.js # Schema Migration Script 1
├── migration_add_venue_booking_held_funds.js # Schema Migration Script 2
├── migration_venue_governorates.js     # Schema Migration Script 3
├── migration_workshop_system.js        # Schema Migration Script 4
├── package.json             # Dependencies, scripts, and package metadata
└── server.js                # Server entry point, middleware assembly & bootstrapper
```

---

### App Boot Sequence (`server.js`)

The backend follows a strict sequential initialization order when `node server.js` is executed:

```
+-----------------------------------------------------------------------+
| 1. Load Environment Configuration                                     |
|    - Load config/project.env via dotenv                               |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 2. Connect Database & Run Initial Setup                               |
|    - Test pool connection in config/database.js                       |
|    - Execute databaseSetup.js (Tables, Columns, Indexes, Seed data)   |
|    - Execute adminSetup.js (Admin tables, Default Admin, Settings)    |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 3. Run Sequential Database Migrations                                 |
|    - require('./migration_workshop_system') -> runMigration()          |
|    - require('./migration_add_venue_booking_fees') -> runMigration()  |
|    - require('./migration_venue_governorates') -> runMigration()      |
|    - require('./migration_add_venue_booking_held_funds') -> run()     |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 4. Initialize Express App & Global Middleware                          |
|    - Apply CORS (allowed origins configuration)                       |
|    - Apply express.json() & express.urlencoded()                      |
|    - Apply Static File Serving (/uploads, /uploads/profile, etc.)     |
|    - Apply platformAccessMiddleware (Lockdown & Maintenance Check)    |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 5. Mount API Routes                                                   |
|    - Mount /api/account, /api/events, /api/bookings, /api/venues, etc. |
|    - Mount /api/admin, /api/workshop, /api/notebooks, /api/wallet     |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 6. Start HTTP Server & Socket.io WebSockets                            |
|    - Listen on PORT (default: 5000)                                   |
|    - Attach Socket.io server handler via utils/socketHandler.js       |
|    - Start Background Service Timers (Fund Release, Expiration, etc.) |
+-----------------------------------------------------------------------+
```

---

### Global Middleware Stack

The global middleware pipeline applied in `server.js` executes in this order for incoming HTTP requests:

1. **CORS Middleware**: Filters cross-origin requests using configured origins (`CORS_ORIGIN` env or default wildcard `*` with credentials).
2. **Body Parsers**:
   - `express.json()`: Parses incoming JSON payloads.
   - `express.urlencoded({ extended: true })`: Parses URL-encoded data.
3. **Static File Serving**:
   - `/uploads`: Serves files stored in `frontend/uploads`.
   - `/uploads/profile`: Serves profile photos stored in `frontend/uploads/profile`.
   - `/uploads/workshop-files`: Serves workshop documents stored in `frontend/uploads/workshop-files`.
4. **Platform Access Guard (`middleware/platformAccessMiddleware.js`)**:
   - Intercepts requests to `/api/*`.
   - Passes `/api/admin/*` and `/api/account/login` through unconditionally.
   - For all other endpoints, checks `site_settings.platform_lockdown` and `site_settings.maintenance_mode`.
   - Returns HTTP `503 Service Unavailable` if the system is in lockdown or maintenance mode.

---

## Authentication & Authorization Architecture

The platform operates **three completely distinct authentication and authorization systems**, tailored to separate domains of the app:

```
                   +---------------------------------------+
                   | Incoming Request Credentials          |
                   +---------------------------------------+
                                       |
       +-------------------------------+-------------------------------+
       |                               |                               |
       v                               v                               v
[ Standard Authorization ]   [ Workshop Authorization ]     [ Admin Authorization ]
Header: "Bearer <JWT>"       Header: "Bearer <JWT>"         Header: "Bearer <Token>"
Secret: JWT_SECRET           Secret: WORKSHOP_JWT_SECRET    Table: admin_sessions
Payload: { userId, role }    Payload: { workshopMemberId,   Validates token_id
                             role, categoryId, eventId }    & session expiration
       |                               |                               |
       v                               v                               v
  User Context                   Member Context                  Admin Context
 (req.user)                   (req.workshopMember)              (req.admin)
```

---

### 1. Core Platform JWT Auth (`middleware/authMiddleware.js`)

Used for general user, organizer, and attendee routes.

- **Header Format**: `Authorization: Bearer <JWT_TOKEN>`
- **Secret**: `process.env.JWT_SECRET` (fallback: development hardcoded secret).
- **Payload Contents**: `{ userId, username, role }`
- **Attached Object**: `req.user = { userId, username, role }`
- **Key Functions**:
  - `authenticateToken(req, res, next)`: Rejects unauthenticated requests with `401 Unauthorized`.
  - `authenticateOptional(req, res, next)`: Decodes token if present, but continues without error if absent (`req.user` becomes `null`).

---

### 2. Workshop Member JWT Auth (`middleware/workshopAuthMiddleware.js`)

Used exclusively for the internal **Event Workshop Subsystem** (`/api/workshop/*`). It is decoupled from standard user accounts; workshop members log in using a Workshop Username, Member Email, and Access Code.

- **Header Format**: `Authorization: Bearer <WORKSHOP_JWT_TOKEN>`
- **Secret**: `process.env.WORKSHOP_JWT_SECRET || process.env.JWT_SECRET`
- **Payload Contents**:
  ```json
  {
    "workshopMemberId": 12,
    "workshopId": 3,
    "eventId": "uuid-string",
    "categoryId": 5,
    "role": "head",
    "email": "member@example.com",
    "categoryName": "Logistics"
  }
  ```
- **Attached Object**: `req.workshopMember = { workshopMemberId, workshopId, eventId, categoryId, role, email, categoryName }`
- **Key Functions**:
  - `authenticateWorkshopToken(req, res, next)`: Validates workshop JWT token.
  - `requireHeadRole(req, res, next)`: Enforces `req.workshopMember.role === 'head'`. Rejects non-heads with `403 Forbidden`.

---

### 3. Admin Token Auth (`middleware/admin/adminAuthMiddleware.js`)

Used for the system administration panel (`/api/admin/*`).

- **Header Format**: `Authorization: Bearer <ADMIN_SESSION_TOKEN>`
- **Database Lookup**: Token is verified against the `admin_sessions` database table.
- **Session Rules**:
  - Checks if `is_revoked === 0`.
  - Checks if `expires_at > NOW()`.
  - Updates `last_activity = NOW()` upon each successful request.
- **Attached Object**: `req.admin = { id, admin_id, full_name }`

---

### 4. Venue Owner Authorization (`middleware/venueOwnerMiddleware.js`)

Works on top of **Platform JWT Auth** for venue owners.

- **Requirement**: Evaluates `req.user.role === 'venue_owner'`.
- **Enforcement**: Rejects standard users or organizers attempting to modify venues or process venue booking payouts with `403 Forbidden`.

---

## Database Schema & Migrations

### Database Connection & Pool

- **Configuration File**: `backend/config/database.js`
- **Driver**: `mysql2/promise` connection pool.
- **Settings**:
  - `host`: `process.env.DB_HOST` (default: `localhost`)
  - `user`: `process.env.DB_USER` (default: `root`)
  - `password`: `process.env.DB_PASSWORD` (default: `""`)
  - `database`: `process.env.DB_NAME` (default: `events_db`)
  - `port`: `process.env.DB_PORT` (default: `3306`)
  - `waitForConnections`: `true`
  - `connectionLimit`: `10`
  - `queueLimit`: `0`

---

### Migration System & History

The system manages database setup using a dual approach:
1. **Master Initializer (`utils/databaseSetup.js`)**: Executed on boot. Creates baseline tables if they do not exist and alters missing columns idempotently using `INFORMATION_SCHEMA` queries.
2. **Sequential Migration Scripts**: Executed sequentially on boot:
   - `migration_workshop_system.js`: Creates tables `workshops`, `workshop_categories`, `workshop_members`, `workshop_tasks`, `workshop_messages`, `workshop_events`, `workshop_files`, `workshop_activity_log`, `workshop_notifications`.
   - `migration_add_venue_booking_fees.js`: Adds `pending_venue_fee` and `pending_platform_fee` columns to `venue_bookings`.
   - `migration_venue_governorates.js`: Adds `governorate` column to `venues` and populates defaulted values.
   - `migration_add_venue_booking_held_funds.js`: Updates `wallet_transactions` status ENUM to include `held` and adds `related_venue_booking_id`.

---

### Complete Database Schema

Below is the complete database structure defined across all models, initializers, and migrations:

```sql
-- 1. Core Users Table
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'venue_owner') DEFAULT 'user',
  bio TEXT NULL,
  phone VARCHAR(30) NULL,
  location VARCHAR(100) NULL,
  website VARCHAR(255) NULL,
  profile_photo_url VARCHAR(500) NULL,
  wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  event_reminders BOOLEAN DEFAULT TRUE,
  promo_emails BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
);

-- 2. Physical Venues Directory
CREATE TABLE venues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  governorate VARCHAR(100) DEFAULT 'Cairo',
  category ENUM('conference_hall', 'wedding_hall', 'stadium', 'theatre', 'outdoor_park', 'meeting_room', 'other') DEFAULT 'conference_hall',
  total_capacity INT NOT NULL DEFAULT 0,
  standard_seats INT NOT NULL DEFAULT 0,
  special_seats INT NOT NULL DEFAULT 0,
  vip_seats INT NOT NULL DEFAULT 0,
  price_per_day DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INT DEFAULT 0,
  min_booking_hours INT DEFAULT 1,
  amenities JSON NULL,
  images JSON NULL,
  description TEXT NULL,
  contact_phone VARCHAR(30) NULL,
  contact_email VARCHAR(255) NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Events Directory
CREATE TABLE events (
  id VARCHAR(36) PRIMARY KEY,
  organizer_id VARCHAR(36) NOT NULL,
  venue_id INT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(50) DEFAULT 'General',
  event_type ENUM('conference', 'workshop', 'concert', 'seminar', 'exhibition', 'sports', 'other') DEFAULT 'conference',
  event_date DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  governorate VARCHAR(100) DEFAULT 'Cairo',
  max_seats INT NOT NULL DEFAULT 100,
  standard_seats INT NOT NULL DEFAULT 100,
  special_seats INT NOT NULL DEFAULT 0,
  vip_seats INT NOT NULL DEFAULT 0,
  standard_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  special_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  vip_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  image_url VARCHAR(500) NULL,
  status ENUM('draft', 'published', 'cancelled', 'completed') DEFAULT 'published',
  event_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
  chat_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL
);

-- 4. Event Seat Bookings
CREATE TABLE bookings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  event_id VARCHAR(36) NOT NULL,
  ticket_code VARCHAR(20) UNIQUE NOT NULL,
  ticket_type ENUM('standard', 'special', 'vip') DEFAULT 'standard',
  seat_number VARCHAR(20) NULL,
  seat_count INT NOT NULL DEFAULT 1,
  total_price DECIMAL(10,2) NOT NULL,
  original_amount DECIMAL(10,2) NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  promo_code VARCHAR(50) NULL,
  status ENUM('confirmed', 'checked_in', 'cancelled') DEFAULT 'confirmed',
  check_in_time DATETIME NULL,
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 5. Venue Reservations (Host ↔ Venue Owner Contract)
CREATE TABLE venue_bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  event_id VARCHAR(36) NULL,
  host_id VARCHAR(36) NOT NULL,
  event_date DATE NOT NULL,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pending_venue_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pending_platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending', 'pending_venue_response', 'awaiting_event_approval', 'awaiting_dual_approval', 'accepted', 'confirmed', 'accepted_by_owner', 'declined', 'declined_auto_expired', 'cancelled', 'completed') DEFAULT 'pending',
  payment_status ENUM('unpaid', 'paid', 'refunded', 'released') DEFAULT 'unpaid',
  owner_notes TEXT NULL,
  responded_at DATETIME NULL,
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Financial Ledger & Wallet Transactions
CREATE TABLE wallet_transactions (
  transaction_id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type ENUM('credit', 'debit') NOT NULL,
  source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal', 'venue-booking', 'platform-fee') NOT NULL,
  description VARCHAR(500) NULL,
  related_event_id VARCHAR(36) NULL,
  related_booking_id VARCHAR(36) NULL,
  related_venue_booking_id INT NULL,
  status ENUM('available', 'held', 'released', 'refunded') DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (related_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY (related_venue_booking_id) REFERENCES venue_bookings(id) ON DELETE SET NULL
);

-- 7. Workshop Instances
CREATE TABLE workshops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(36) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  access_code_hash VARCHAR(255) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. Workshop Categories/Departments
CREATE TABLE workshop_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workshop_id INT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
);

-- 9. Workshop Team Members
CREATE TABLE workshop_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('head', 'vice_head', 'member') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
  UNIQUE KEY uq_category_email (category_id, email)
);

-- 10. Workshop Task Management
CREATE TABLE workshop_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  assigned_to INT NULL,
  created_by INT NOT NULL,
  due_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES workshop_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES workshop_members(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES workshop_members(id) ON DELETE CASCADE
);

-- 11. Saved Machine Learning Simulation Notebooks
CREATE TABLE notebooks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  payload JSON NULL,
  ml_fields JSON NULL,
  last_prediction JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 12. Administrative Audit Logs & System Tables
CREATE TABLE admins (
  id VARCHAR(36) PRIMARY KEY,
  admin_id VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  id VARCHAR(36) PRIMARY KEY,
  admin_id VARCHAR(36) NOT NULL,
  token_id VARCHAR(64) NOT NULL UNIQUE,
  ip_address VARCHAR(64),
  user_agent VARCHAR(255),
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE site_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT,
  updated_by_admin_id VARCHAR(36) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);
```

---

## Models Layer (`backend/models/`)

| File Name | Primary Purpose / Query Operations |
| :--- | :--- |
| **`User.js`** | Manages user registration, password hashing verification, profile updates, role retrieval, and wallet balance updates. |
| **`Event.js`** | Handlers for creation, dynamic search filtering, seat capacity decrementing, cancellation with ticket refund queries, and post-event analytics. |
| **`Venue.js`** | Handles physical venue directory creation, governorate/category queries, capacity pricing updates, and rating calculations. |
| **`Booking.js`** | Atomic ticket creation, ticket code generation, seat availability validation, ticket check-in tracking, and cancellation refunds. |
| **`VenueBooking.js`** | Orchestrates host-to-venue booking contracts, status transitions (`pending` -> `confirmed` / `cancelled`), and fee calculation persistence. |
| **`WalletTransaction.js`** | Inserts and reads financial audit ledger records (`credit`/`debit`), managing held funds for venue owner escrow payouts. |
| **`Workshop.js`** | Creation and username verification for workshop event management spaces. |
| **`WorkshopCategory.js`** | Sub-department/committee mapping under a workshop. |
| **`WorkshopMember.js`** | Manages members assigned to workshop categories with roles (`head`, `vice_head`, `member`). |
| **`WorkshopTask.js`** | CRUD operations for workshop task boards including assigned member joins. |
| **`WorkshopMessage.js`** | Persistence and retrieval of internal workshop category messaging logs. |
| **`WorkshopEvent.js`** | Internal event calendar management within a workshop. |
| **`WorkshopFile.js`** | Attached file asset tracking per workshop category. |
| **`WorkshopActivityLog.js`** | Non-blocking action logging for workshop committee auditing. |
| **`WorkshopNotification.js`** | Internal alerts for workshop team members. |
| **`Notebook.js`** | Stores machine learning predictive simulation models, snapshots, and saved parameters per user. |
| **`MarketingSetup.js`** | Stores AI marketing campaign parameters, budgets, targets, and generated strategies. |
| **`FAQ.js`** | Stores system FAQs sorted by categories for public & admin management. |
| **`SubscriptionPlan.js`** | Stores tier options, pricing, feature flags, and sort orders. |
| **`SupportTicket.js`** | Manages user contact support tickets and admin reply statuses. |
| **`Notification.js`** | System alerts for user accounts (e.g., event reminders, booking confirmations). |
| **`Favorite.js`** | Stores user-bookmarked events. |
| **`VenueWishlist.js`** | Stores user-bookmarked venues. |
| **`VenueReview.js`** | Handles ratings and reviews left by event hosts for venues. |
| **`Payment.js`** | Logs raw gateway transaction payments. |

---

## Controllers Layer (`backend/controllers/`)

| Controller Name | Primary Responsibilities |
| :--- | :--- |
| **`accountController.js`** | User registration, login, username/email availability checks, JWT issuance, and approaching event reminder alerts on login. |
| **`eventController.js`** | Multi-tiered seat maps, event CRUD, venue linking, revenue trends, cancellation with automated attendee refunds, promo codes, and post-event summaries. |
| **`venueController.js`** | Available venue directory filtering, venue details view, public double-booking availability checks, host venue booking submission, wishlist toggles, and reviews. |
| **`venueOwnerController.js`** | Venue owner portal, venue submission management, booking request accept/decline, timeline calendar, seat-level management, escrow wallet, and host direct messaging logs. |
| **`bookingController.js`** | Ticket purchases, seat allocation verification, ticket code generation, QR check-in scanning, and ticket cancellations with refund logic. |
| **`walletController.js`** | User wallet balance inspection, mock top-ups, withdrawal requests to card, and paying for bookings via wallet balance. |
| **`workshopController.js`** | Workshop setup by event organizers, workshop credential login (returns Workshop JWT), dashboard assembly, and head member management. |
| **`workshopTaskController.js`** | Task board CRUD, state transitions (`todo` -> `in_progress` -> `done`), and member task assignments. |
| **`workshopChatController.js`** | Category chat message retrieval, sending, and self-deletion within a 5-minute window. |
| **`workshopCalendarController.js`**| Workshop team calendar event creation, update, and deletion. |
| **`workshopFileController.js`** | Multipart document file upload handling and security checks (blocks executable extensions). |
| **`workshopCheckinController.js`** | Live event entry scanner allowing workshop team members to validate attendee ticket codes on-site. |
| **`workshopProgressController.js`**| Calculates team task completion metrics and metrics breakdown by status. |
| **`notebookPredictionController.js`**| Custom JS heuristic machine learning predictor engine. Auto-fetches real event metrics (Category 2) and combines them with user-input variables (Category 1) to calculate expected attendance, revenue, risk, and recommendations. |
| **`marketingController.js`** | Calls OpenAI API (or heuristic fallback) to generate step-by-step event marketing campaigns based on budget and target demographics. |
| **`adminController.js`** | Platform administration: dashboard statistics, user ban/unban, event/venue approval pipelines, site settings, platform fee configuration, and financial withdrawal processing. |

---

## Routes & Endpoint Surface (`backend/routes/`)

Below is the complete API surface exposed by the backend Express routes:

### 1. Account & Authentication (`/api/account`)
- `POST /register`: Register user or venue owner account.
- `POST /login`: Authenticate and receive Platform JWT.
- `GET /checkusername`: Query username availability.
- `GET /checkemail`: Query email availability.
- `POST /logout`: Logout user.
- `GET /verify`: Validate current Platform JWT token.

### 2. Events Management (`/api/events`)
- `GET /`: List published events (with search, category, location filters).
- `GET /my/events`: List events organized by the authenticated user.
- `GET /:id`: Fetch event details.
- `POST /`: Create new event.
- `PUT /:id`: Update event details.
- `DELETE /:id`: Delete event.
- `GET /:id/seat-map`: Fetch seat map configuration & availability.
- `GET /:id/reviews`: List event reviews.
- `POST /:id/reviews`: Add review for event.
- `POST /:id/view`: Track event view count.
- `GET /:id/views`: Get 24-hour view metrics.
- `GET /:id/revenue-trend`: Get revenue timeline chart data.
- `GET /:id/post-event-summary`: Get completion stats & final earnings.
- `GET /:id/post-event-report`: Export CSV post-event performance report.
- `GET /:id/vault`: Get organizer holding vault status.
- `GET /:id/vault/transactions`: Get holding vault transaction log.
- `POST /:id/vault/withdraw`: Execute vault payout withdrawal.
- `GET /:id/cancellation-summary`: Preview refund totals prior to event cancellation.
- `POST /:id/cancel`: Cancel event and initiate automated ticket refunds to user wallets.
- `PATCH /:id/select-venue`: Link an approved venue booking to event.
- `GET /:id/marketing/setup`: Get saved AI marketing parameters.
- `PUT /:id/marketing/setup`: Save AI marketing parameters.
- `POST /:id/marketing/generate`: Generate AI marketing strategy.
- `POST /:id/promo-codes`: Create event promo code.
- `GET /:id/promo-codes`: List event promo codes.
- `PATCH /:id/promo-codes/:promoId/deactivate`: Deactivate promo code.
- `PATCH /:id/promo-codes/:promoId/activate`: Activate promo code.
- `DELETE /:id/promo-codes/:promoId`: Delete promo code.
- `POST /:id/promo/validate`: Validate promo code discount for ticket checkout.

### 3. Venues & Booking Directory (`/api/venues`)
- `GET /`: Search available venues.
- `GET /featured`: List featured high-rating venues.
- `GET /suggestions`: Get venue recommendations based on event capacity.
- `GET /wishlist`: Get user saved venues.
- `POST /:id/wishlist`: Toggle venue bookmark.
- `POST /book`: Reserve venue for an event.
- `GET /:id/check-availability`: Check venue availability for date.
- `GET /:id`: Get venue details.

### 4. Venue Owner Management (`/api/venue-owner`)
- `POST /venues`: Submit new venue listing for admin approval.
- `GET /venues`: List owned venues.
- `PATCH /venues/:id`: Update venue details.
- `GET /booking-requests`: List pending reservation requests from hosts.
- `POST /booking-requests/:id/accept`: Accept host booking request.
- `POST /booking-requests/:id/decline`: Decline host booking request.
- `GET /bookings`: List accepted/confirmed upcoming venue bookings.
- `GET /bookings/history`: List past venue bookings.
- `POST /bookings/:id/cancel`: Cancel confirmed venue booking.
- `GET /venues/:id/timeline`: Get venue occupied dates calendar.
- `GET /wallet`: Get venue owner wallet balance & held escrow funds.
- `POST /wallet/withdraw`: Request withdrawal of available balance.
- `GET /analytics`: Get venue utilization & revenue analytics.

### 5. Event Workshop Subsystem (`/api/workshop`)
- `POST /login`: Public login issuing Workshop-scoped JWT.
- `GET /event/:eventId`: (Organizer Platform JWT) Get workshop structure.
- `POST /event/:eventId`: (Organizer Platform JWT) Create workshop & team.
- `POST /event/:eventId/members`: (Organizer Platform JWT) Add member.
- `GET /dashboard`: (Workshop JWT) Get team dashboard, event & venue info.
- `GET /my-category`: (Workshop JWT) Get members in caller's department.
- `POST /my-category/members`: (Workshop JWT Head Only) Add member.
- `GET /tasks`: (Workshop JWT) List department task board.
- `POST /tasks`: (Workshop JWT) Create task item.
- `PUT /tasks/:id`: (Workshop JWT) Update task details.
- `PUT /tasks/:id/status`: (Workshop JWT) Update task progress.
- `DELETE /tasks/:id`: (Workshop JWT) Delete task.
- `GET /chat`: (Workshop JWT) Get department message history.
- `POST /chat`: (Workshop JWT) Post message.
- `DELETE /chat/:id`: (Workshop JWT) Delete message (5 min grace window).
- `GET /files`: (Workshop JWT) List shared team documents.
- `POST /files`: (Workshop JWT) Upload shared team file.
- `POST /checkin`: (Workshop JWT) Live ticket code scanner check-in.

### 6. ML Notebooks (`/api/notebooks`)
- `GET /`: List user ML notebooks.
- `POST /`: Create ML notebook.
- `GET /:id`: Get notebook details.
- `PUT /:id`: Update notebook metadata.
- `POST /:id/duplicate`: Clone existing notebook.
- `DELETE /:id`: Delete notebook.
- `GET /:id/organizer-stats`: Auto-fetch real organizer metrics (Category 2).
- `PUT /:id/ml-fields`: Save user custom inputs (Category 1).
- `POST /:id/predict`: Execute ML prediction algorithm.

### 7. User Wallet & Financials (`/api/wallet`)
- `GET /`: Get wallet balance & transaction ledger.
- `POST /topup`: Top up wallet (Mock payment).
- `POST /withdraw`: Request withdrawal to payment card.
- `GET /withdrawals`: List past withdrawal requests.
- `POST /pay`: Pay for event ticket using wallet balance.

### 8. System Administration (`/api/admin`)
- `POST /auth/login`: Admin login (returns session token).
- `GET /dashboard/stats`: Platform total revenue, users, events, venues metrics.
- `GET /users`: List platform users.
- `PATCH /users/:id/status`: Ban/unban user account.
- `GET /events`: List all platform events.
- `PATCH /events/:id/approval`: Approve or reject event listing.
- `GET /venues`: List all platform venues.
- `PATCH /venue-submissions/:id/approve`: Approve pending venue listing.
- `PATCH /venue-submissions/:id/reject`: Reject pending venue listing.
- `GET /platform-wallet`: View system collected platform fees.
- `POST /platform-wallet/withdraw`: Withdraw collected platform fees.
- `PUT /settings`: Update site settings (Lockdown, Maintenance mode, Fees).

---

## Services Layer (`backend/services/`)

1. **`eventVaultService.js`**: Calculates organizer earnings holding period. Prevents premature payout before event completion.
2. **`venueOwnerEscrowService.js`**: Manages escrow holding for venue owner payments. Holds funds upon host booking confirmation and releases them after event execution.
3. **`platformWalletService.js`**: Tracks and collects service fees per ticket sale and venue reservation into the central platform wallet.
4. **`platformAccessService.js`**: High-performance cached query engine checking platform lockdown/maintenance state from `site_settings`.
5. **`venueBookingExpiryService.js`**: Scheduled task checking for unconfirmed venue booking requests exceeding response window (e.g. 48 hours) and marking them `declined_auto_expired`.
6. **`venueBookingFundReleaseService.js`**: Scheduled task releasing held escrow funds to venue owners after grace period post-event.
7. **`chatService.js` & `directChatService.js`**: Enforces access rules for event live chats and direct host-venue messaging.
8. **`openAiMarketingService.js`**: Communicates with OpenAI GPT API to compile customized marketing strategies.
9. **`aiDecisionService.js`**: Provides fallback calculations when external AI services are unavailable.

---

## Middleware Layer (`backend/middleware/`)

- **`authMiddleware.js`**: Core platform JWT verifier. Standardizes `req.user`.
- **`workshopAuthMiddleware.js`**: Workshop JWT verifier. Standardizes `req.workshopMember` and enforces `requireHeadRole`.
- **`admin/adminAuthMiddleware.js`**: Validates session tokens against `admin_sessions`.
- **`venueOwnerMiddleware.js`**: Enforces venue owner user role.
- **`platformAccessMiddleware.js`**: Intercepts requests during system maintenance or administrative lockdown.

---

## Utilities Layer (`backend/utils/`)

- **`socketHandler.js`**: Manages real-time WebSockets via Socket.io. Handles live attendee room joins (`join-event-chat`), message broadcast, live online user counts (`chat-online-count`), and host direct chat rooms (`join-direct-chat`).
- **`databaseSetup.js`**: Idempotent table & index schema bootstrapper run on server launch.
- **`refundWalletUtils.js`**: Transactional helper function (`creditWalletRefundInTransaction`) that safely credits a user's wallet and inserts a financial log record within a database transaction.
- **`promoPricing.js`**: Pure utility computing exact ticket prices after percentage or fixed promo code discounts.
- **`eventSeating.js`**: Resolves manual seat configurations across tiers (`standard`, `special`, `vip`) without percentage rounding errors.
- **`emailService.js`**: Queueing script inserting outbound emails into the `email_outbox` table.
- **`logWorkshopActivity.js`**: Non-blocking wrapper for logging workshop committee activity.
- **`createWorkshopNotification.js`**: Helper for dispatching team notifications to workshop members.

---

## Known Issues, Gaps & Technical Debt

This section documents verified gaps and incomplete implementations in the codebase for auditing reference:

1. **Unintegrated Database Fields in ML Engine**:
   - `events.event_quality_score` and `events.event_popularity_index` exist in the MySQL schema, but are **not yet queried or integrated** in `notebookPredictionController.js`. The ML simulation engine currently computes synthetic scores based on view count and seat sales ratios instead of referencing these stored database metrics.

2. **Hardcoded Fallbacks in System Settings**:
   - If `site_settings` is unseeded or missing key rows, `platformFeeService.js` and `eventController.getPlatformFeeSettings` fall back to hardcoded default values (e.g., `fixed` fee of `500` EGP or `200` EGP fallback).

3. **Email Outbox Queue Worker Missing**:
   - `utils/emailService.js` successfully inserts queued emails into the `email_outbox` table, but there is **no background worker process or SMTP transport runner** actively polling `email_outbox` to send real emails to external mail servers.

4. **Mock Financial Payout Gateways**:
   - Wallet top-ups (`walletController.topUpWallet`) and card withdrawals (`walletController.withdrawToCard`) operate in **demo/mock mode**, immediately modifying `users.wallet_balance` without connecting to an external banking PSP gateway (such as Stripe or Paymob).

5. **Local Disk Storage for Uploads**:
   - Profile photos (`routes/profileRoutes.js`) and Workshop attachments (`routes/workshopFileRoutes.js`) are saved directly to the local filesystem (`frontend/uploads/`). In a multi-instance or cloud container deployment, this will require migration to shared object storage (e.g. AWS S3).
