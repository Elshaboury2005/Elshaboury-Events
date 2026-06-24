const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireVenueOwner } = require('../middleware/venueOwnerMiddleware');
const venueOwnerController = require('../controllers/venueOwnerController');

const router = express.Router();

// Apply auth + venue owner check to all sub-routes
router.use(authenticateToken);
router.use(requireVenueOwner);

// Venue CRUD
router.post('/venues', venueOwnerController.submitVenue);
router.get('/venues', venueOwnerController.getMyVenues);
router.patch('/venues/:id', venueOwnerController.updateMyVenue);

// Booking Requests (accept/decline)
router.get('/booking-requests', venueOwnerController.getBookingRequests);
router.post('/booking-requests/:id/accept', venueOwnerController.acceptBookingRequest);
router.post('/booking-requests/:id/decline', venueOwnerController.declineBookingRequest);

// Upcoming/Confirmed Bookings and cancel bookings
router.get('/bookings', venueOwnerController.getUpcomingBookings);
router.get('/bookings/history', venueOwnerController.getBookingHistory);
router.post('/bookings/:id/cancel', venueOwnerController.cancelBooking);

// Booking Details (single booking rich view)
router.get('/bookings/:id/details', venueOwnerController.getBookingDetails);

// Venue Bookings Table (all bookings for a specific venue — with full host/event data)
router.get('/venues/:id/bookings-table', venueOwnerController.getVenueBookingsTable);

// Venue Timeline (calendar of booked dates for double-booking prevention)
router.get('/venues/:id/timeline', venueOwnerController.getVenueTimeline);

// Venue availability check (also accessible without venue-owner guard for event creation)
router.get('/venues/:id/availability', venueOwnerController.checkVenueAvailability);

// Wallet and Analytics
router.get('/wallet', venueOwnerController.getWallet);
router.post('/wallet/withdraw', venueOwnerController.withdrawWallet);
router.get('/analytics', venueOwnerController.getAnalytics);

// Reviews
router.get('/reviews', venueOwnerController.getMyReviews);

// Availability Blocks
router.get('/venues/:id/availability-blocks', venueOwnerController.getAvailabilityBlocks);
router.post('/venues/:id/availability-blocks', venueOwnerController.addAvailabilityBlock);
router.patch('/venues/:id/availability-blocks/:blockId/toggle', venueOwnerController.toggleAvailabilityBlock);

// Seat Status & Booking
router.get('/venues/:id/events/:eventId/seats', venueOwnerController.getEventSeatsStatus);
router.post('/book-seat', venueOwnerController.bookSeat);

// Event Team (host + LOC crew details for accepted/confirmed bookings)
router.get('/bookings/:id/event-team', venueOwnerController.getEventTeam);

// Venue Owner Notifications
router.get('/notifications/eligible-hosts/:venueId', venueOwnerController.getEligibleHosts);
router.post('/notifications/send', venueOwnerController.sendVenueOwnerNotification);
router.get('/notifications/sent-log', venueOwnerController.getSentNotificationLog);

module.exports = router;
