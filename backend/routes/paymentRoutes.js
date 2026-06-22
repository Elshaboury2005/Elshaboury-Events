const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/', authenticateToken, paymentController.create);
router.put('/:id', authenticateToken, paymentController.update);
router.get('/my', authenticateToken, paymentController.getMy);

module.exports = router;
