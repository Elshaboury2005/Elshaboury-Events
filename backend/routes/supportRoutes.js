const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const supportController = require('../controllers/supportController');

const router = express.Router();

router.get('/tickets/mine', authenticateToken, supportController.getMySupportTickets);
router.post('/tickets', authenticateToken, supportController.createSupportTicket);

module.exports = router;
