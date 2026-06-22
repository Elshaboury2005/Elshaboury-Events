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
router.post('/bookings/:id/cancel', venueOwnerController.cancelBooking);

// Wallet and Analytics
router.get('/wallet', venueOwnerController.getWallet);
router.get('/analytics', venueOwnerController.getAnalytics);

// Reviews
router.get('/reviews', venueOwnerController.getMyReviews);

// Availability Blocks
router.get('/venues/:id/availability-blocks', venueOwnerController.getAvailabilityBlocks);
router.post('/venues/:id/availability-blocks', venueOwnerController.addAvailabilityBlock);
router.delete('/venues/:id/availability-blocks/:blockId', venueOwnerController.deleteAvailabilityBlock);

module.exports = router;
