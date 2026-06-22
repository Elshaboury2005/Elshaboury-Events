const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, favoriteController.getAll);
router.get('/check/:eventId', authenticateToken, favoriteController.check);
router.post('/:eventId', authenticateToken, favoriteController.add);
router.delete('/:eventId', authenticateToken, favoriteController.remove);

module.exports = router;
