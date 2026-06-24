const express = require('express');
const { authenticateAdmin } = require('../../middleware/admin/adminAuthMiddleware');
const adminController = require('../../controllers/admin/adminController');

const router = express.Router();

router.post('/auth/login', adminController.login);
router.post('/auth/logout', authenticateAdmin, adminController.logout);
router.get('/auth/verify', authenticateAdmin, adminController.verify);

router.get('/dashboard/stats', authenticateAdmin, adminController.getDashboardStats);
router.get('/dashboard/activity', authenticateAdmin, adminController.getRecentActivity);
router.get('/dashboard/revenue-trend', authenticateAdmin, adminController.getRevenueTrend);

router.get('/users', authenticateAdmin, adminController.getUsers);
router.get('/users/:id', authenticateAdmin, adminController.getUserDetails);
router.patch('/users/:id/status', authenticateAdmin, adminController.updateUserStatus);
router.delete('/users/:id', authenticateAdmin, adminController.deleteUser);

router.get('/events', authenticateAdmin, adminController.getEvents);
router.get('/events/:id', authenticateAdmin, adminController.getEventDetails);
router.patch('/events/:id', authenticateAdmin, adminController.updateEvent);
router.patch('/events/:id/approval', authenticateAdmin, adminController.updateEventApproval);
router.delete('/events/:id', authenticateAdmin, adminController.deleteEvent);

router.get('/venues', authenticateAdmin, adminController.getVenues);
router.get('/venues/analytics', authenticateAdmin, adminController.getVenueAnalytics);
router.post('/venues', authenticateAdmin, adminController.createVenue);
router.patch('/venues/:id', authenticateAdmin, adminController.updateVenue);
router.patch('/venues/:id/status', authenticateAdmin, adminController.updateVenueStatus);
router.get('/venues/:id/calendar', authenticateAdmin, adminController.getVenueCalendar);
router.post('/venues/:id/availability-blocks', authenticateAdmin, adminController.createVenueAvailabilityBlock);
router.delete('/venues/availability-blocks/:blockId', authenticateAdmin, adminController.deleteVenueAvailabilityBlock);
router.get('/venue-bookings', authenticateAdmin, adminController.getVenueBookings);
router.get('/venue-bookings/export', authenticateAdmin, adminController.exportVenueBookingsCsv);
router.patch('/venue-bookings/:id/status', authenticateAdmin, adminController.updateVenueBookingStatus);

router.get('/venue-submissions', authenticateAdmin, adminController.getPendingVenueSubmissions);
router.patch('/venue-submissions/:id/approve', authenticateAdmin, adminController.approveVenueSubmission);
router.patch('/venue-submissions/:id/reject', authenticateAdmin, adminController.rejectVenueSubmission);
router.patch('/venue-submissions/:id/request-changes', authenticateAdmin, adminController.requestVenueChanges);

router.get('/bookings', authenticateAdmin, adminController.getBookings);
router.patch('/bookings/:id/status', authenticateAdmin, adminController.updateBookingStatus);
router.delete('/bookings/:id', authenticateAdmin, adminController.cancelBooking);

router.get('/reports/revenue', authenticateAdmin, adminController.getRevenueReport);
router.get('/reports/revenue/export', authenticateAdmin, adminController.exportRevenueCsv);
router.get('/wallet-withdrawals', authenticateAdmin, adminController.getWalletWithdrawals);
router.patch('/wallet-withdrawals/:id/status', authenticateAdmin, adminController.updateWalletWithdrawalStatus);

// Platform wallet (admin fee collection & withdrawal)
router.get('/platform-wallet', authenticateAdmin, adminController.getPlatformWallet);
router.get('/platform-wallet/transactions', authenticateAdmin, adminController.getPlatformWalletTransactions);
router.post('/platform-wallet/withdraw', authenticateAdmin, adminController.withdrawPlatformWallet);

router.post('/notifications/send', authenticateAdmin, adminController.sendNotification);

router.get('/support', authenticateAdmin, adminController.getSupportTickets);
router.put('/support/read-all', authenticateAdmin, adminController.markAllSupportTicketsAsRead);
router.put('/support/:id/read', authenticateAdmin, adminController.markSupportTicketAsRead);
router.post('/support/:id/reply', authenticateAdmin, adminController.replySupportTicket);
router.delete('/support/:id', authenticateAdmin, adminController.deleteSupportTicket);
router.delete('/support', authenticateAdmin, adminController.deleteAllSupportTickets);

router.get('/settings', authenticateAdmin, adminController.getSettings);
router.put('/settings', authenticateAdmin, adminController.updateSettings);

router.get('/audit-logs', authenticateAdmin, adminController.getAuditLogs);

module.exports = router;
