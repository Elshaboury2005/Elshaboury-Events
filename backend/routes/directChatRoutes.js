const express = require('express');
const router = express.Router();
const directChatController = require('../controllers/directChatController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/my-chats', authenticateToken, directChatController.getMyDirectChats);
router.get('/:venueBookingId/messages', authenticateToken, directChatController.getMessages);
router.post('/:venueBookingId/read', authenticateToken, directChatController.markRead);
router.get('/:venueBookingId/canAccess', authenticateToken, directChatController.canAccess);

module.exports = router;
