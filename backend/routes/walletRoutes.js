const express = require('express');
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, walletController.getWallet);
router.post('/topup', authenticateToken, walletController.topUpWallet);
router.post('/withdraw', authenticateToken, walletController.withdrawToCard);
router.get('/withdrawals', authenticateToken, walletController.getWithdrawals);
router.get('/withdraw/status/:referenceId', authenticateToken, walletController.getWithdrawalStatus);
router.post('/pay', authenticateToken, walletController.payForBooking);

module.exports = router;
