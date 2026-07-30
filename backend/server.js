const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('./config/env');

const accountRoutes = require('./routes/accountRoutes');
const eventRoutes = require('./routes/eventRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const profileRoutes = require('./routes/profileRoutes');
const organizerRoutes = require('./routes/organizerRoutes');
const walletRoutes = require('./routes/walletRoutes');
const venuesRoutes = require('./routes/venuesRoutes');
const supportRoutes = require('./routes/supportRoutes');
const chatRoutes = require('./routes/chat');
const faqRoutes = require('./routes/faqRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const notebookRoutes = require('./routes/notebookRoutes');
const workshopRoutes = require('./routes/workshopRoutes');
const workshopTaskRoutes = require('./routes/workshopTaskRoutes');
const workshopChatRoutes = require('./routes/workshopChatRoutes');
const workshopCalendarRoutes = require('./routes/workshopCalendarRoutes');
const workshopFileRoutes = require('./routes/workshopFileRoutes');
const workshopActivityRoutes = require('./routes/workshopActivityRoutes');
const workshopNotificationRoutes = require('./routes/workshopNotificationRoutes');
const workshopProgressRoutes = require('./routes/workshopProgressRoutes');
const workshopCheckinRoutes = require('./routes/workshopCheckinRoutes');
const directChatRoutes = require('./routes/directChatRoutes');
const adminRoutes = require('./routes/admin/adminRoutes');
const venueOwnerRoutes = require('./routes/venueOwnerRoutes');
const marketingController = require('./controllers/marketingController');
const { authenticateToken } = require('./middleware/authMiddleware');
const {
  enforcePlatformWebAccess,
  enforcePlatformApiAccess
} = require('./middleware/platformAccessMiddleware');
const { getPlatformAccessState } = require('./services/platformAccessService');

const aiRoutes = require('./routes/aiRoutes');
const { setupDatabase } = require('./utils/databaseSetup');
const { setupAdminDatabase } = require('./utils/admin/adminSetup');
const { startEventLifecycleJobs } = require('./services/eventLifecycleService');
const { startChatCleanupJob } = require('./services/chatCleanupService');
const { startVenueBookingExpiryJob } = require('./services/venueBookingExpiryService');
const { startVenueBookingFundReleaseJob } = require('./services/venueBookingFundReleaseService');

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const http = require('http');
const { setupSocket } = require('./utils/socketHandler');

const app = express();
const server = http.createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 5000;
const corsOrigin = process.env.CORS_ORIGIN || true;

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(enforcePlatformWebAccess);

app.get('/', (req, res) => {
  res.redirect('/html/signin.html');
});
app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});
app.get('/profile', (req, res) => {
  res.redirect('/html/profile.html');
});
app.get('/organizer/:userId', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/organizer-profile.html'));
});
app.get('/wallet', (req, res) => {
  res.redirect('/html/wallet.html');
});

app.get('/api/platform/access', async (req, res) => {
  try {
    const accessState = await getPlatformAccessState();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        locked: accessState.locked,
        maintenanceMode: accessState.maintenanceMode,
        siteName: accessState.siteName,
        message: accessState.message
      }
    });
  } catch (error) {
    console.error('Platform access status error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to load platform access status'
    });
  }
});

app.use(express.static(path.join(__dirname, '../frontend')));

// Swagger UI — served at /api-docs (before the enforcePlatformApiAccess middleware)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Elshaboury Events API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    docExpansion: 'none',
  }
}));

// Expose the raw OpenAPI spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

app.use('/api', enforcePlatformApiAccess);
app.use('/api/Account', accountRoutes);
app.use('/api/auth', accountRoutes);
app.use('/api/Events', eventRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/Favorites', favoriteRoutes);
app.use('/api/Bookings', bookingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/Notifications', notificationRoutes.router);
app.use('/api/notifications', notificationRoutes.router);
app.use('/api/Payments', paymentRoutes);
app.use('/api/Profile', profileRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/Organizers', organizerRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/venues', venuesRoutes);
app.use('/api/venue-owner', venueOwnerRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/workshop', workshopRoutes);
app.use('/api/workshop/tasks', workshopTaskRoutes);
app.use('/api/workshop/chat', workshopChatRoutes);
app.use('/api/workshop/calendar', workshopCalendarRoutes);
app.use('/api/workshop/files', workshopFileRoutes);
app.use('/api/workshop/activity', workshopActivityRoutes);
app.use('/api/workshop/notifications', workshopNotificationRoutes);
app.use('/api/workshop/progress', workshopProgressRoutes);
app.use('/api/workshop/checkin', workshopCheckinRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/direct-chat', directChatRoutes);
app.use('/api/Admin', adminRoutes);
app.post('/api/generate-marketing-plan', authenticateToken, marketingController.generateMarketingPlan);

app.use('/api/AI', aiRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'OK', message: 'Server is running' } });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Must be defined AFTER all routes. Catches any error passed via next(err) or
// any unhandled synchronous throw inside route handlers.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const statusCode = (typeof err.status === 'number' && err.status >= 100 && err.status < 600)
    ? err.status
    : 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected error occurred'
  });
});

const runMigrations = async () => {
  const migrations = [
    'migration_missing_tables',
    'migration_users_phone',
    'migration_event_team',
    'migration_booking_index',
    'migration_payment_accepted_by_owner',
    'migration_payment_enums',
    'migration_payment_flow',
    'migration_payment_source',
    'migration_payment_transferred',
    'migration_pending_venue',
    'migration_ai_decision_report',
    'migration_faqs',
    'migration_subscriptions',
    'migration_notebooks',
    'migration_workshop',
    'migration_workshop_tasks',
    'migration_workshop_chat',
    'migration_workshop_calendar',
    'migration_workshop_files',
    'migration_workshop_activity',
    'migration_workshop_notifications',
    'migration_booking_checkin',
  ];
  for (const name of migrations) {
    try {
      const mod = require(`./${name}`);
      if (typeof mod.run === 'function') {
        await mod.run();
        console.log(`✅ Migration ${name} done`);
      }
    } catch (err) {
      console.warn(`⚠️ Migration ${name} skipped:`, err.message);
    }
  }
};

runMigrations().then(() => {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, '../frontend')}`);
    console.log('API available at: /api');
    console.log(`Swagger UI available at: http://localhost:${PORT}/api-docs`);

    setupDatabase()
      .then((ready) => {
        if (ready) {
          startEventLifecycleJobs();
          startChatCleanupJob();
          startVenueBookingExpiryJob();
          startVenueBookingFundReleaseJob();
        }
      })
      .catch((err) => {
        console.error('Database setup warning:', err.message);
      });

    setupAdminDatabase().catch((err) => {
      console.error('Admin setup warning:', err.message);
    });
  });
}).catch(err => {
  console.error('Fatal migration error, server not started:', err);
  process.exit(1);

  // console.error('Fatal migration error, server not ended:', err);
  // process.exit(0);
});
