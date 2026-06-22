const express = require('express');
const venueController = require('../controllers/venueController');
const { authenticateOptional, authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateOptional, venueController.getAvailableVenues);
router.get('/featured', authenticateOptional, venueController.getFeaturedVenues);
router.get('/suggestions', authenticateOptional, venueController.getVenueSuggestions);
router.get('/owner/:ownerId/profile', venueController.getOwnerProfile);
router.get('/wishlist', authenticateToken, venueController.getWishlist);
router.get('/my-bookings', authenticateToken, venueController.getMyBookings);
router.post('/book', authenticateToken, venueController.bookVenue);
router.post('/:id/wishlist', authenticateToken, venueController.toggleWishlist);
router.get('/:id/reviews', venueController.getVenueReviews);
router.post('/:id/reviews', authenticateToken, venueController.submitVenueReview);
router.get('/:id', authenticateOptional, venueController.getVenueDetails);

module.exports = router;
