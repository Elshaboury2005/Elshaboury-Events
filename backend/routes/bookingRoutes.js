const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/', authenticateToken, bookingController.create);
router.get('/my', authenticateToken, bookingController.getMy);
router.get('/event/:eventId', authenticateToken, bookingController.getByEventId);
router.get('/:id/cancel-preview', authenticateToken, bookingController.previewCancel);
router.post('/check-in-ticket', authenticateToken, bookingController.checkInByTicketCode);
router.post('/:id/check-in', authenticateToken, bookingController.checkIn);
router.put('/:id/cancel-seat', authenticateToken, bookingController.cancelSeat);
router.put('/:id/cancel', authenticateToken, bookingController.cancel);
router.post('/:id/cancel', authenticateToken, bookingController.cancel);

module.exports = router;
