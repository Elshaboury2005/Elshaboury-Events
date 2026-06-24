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
      locked: accessState.locked,
      maintenanceMode: accessState.maintenanceMode,
      siteName: accessState.siteName,
      message: accessState.message
    });
  } catch (error) {
    console.error('Platform access status error:', error);
    res.status(500).json({
      success: false,
      locked: false,
      message: 'Unable to load platform access status'
    });
  }
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', enforcePlatformApiAccess);
app.use('/api/Account', accountRoutes);
app.use('/api/auth', accountRoutes);
app.use('/api/Events', eventRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/Favorites', favoriteRoutes);
app.use('/api/Bookings', bookingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/Notifications', notificationRoutes.router);
app.use('/api/Payments', paymentRoutes);
app.use('/api/Profile', profileRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/Organizers', organizerRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/venues', venuesRoutes);
app.use('/api/venue-owner', venueOwnerRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/direct-chat', directChatRoutes);
app.use('/api/Admin', adminRoutes);
app.post('/api/generate-marketing-plan', authenticateToken, marketingController.generateMarketingPlan);

app.use('/api/AI', aiRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, '../frontend')}`);
  console.log('API available at: /api');

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

