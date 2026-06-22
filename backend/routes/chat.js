const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/my-events', authenticateToken, chatController.getMyEvents);
router.get('/:eventId/messages', authenticateToken, chatController.getMessages);
router.post('/:eventId/read', authenticateToken, chatController.markRead);
router.get('/:eventId/canAccess', authenticateToken, chatController.canAccess);
router.get('/:eventId/status', authenticateToken, chatController.getStatus);
router.post('/:eventId/lock', authenticateToken, chatController.lock);
router.post('/:eventId/unlock', authenticateToken, chatController.unlock);

module.exports = router;
