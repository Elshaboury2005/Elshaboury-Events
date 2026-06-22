const express = require('express');
const organizerController = require('../controllers/organizerController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:userId/profile', organizerController.getProfile);
router.get('/:userId/follow', authenticateToken, organizerController.toggleFollow);

module.exports = router;
