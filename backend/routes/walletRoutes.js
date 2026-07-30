const express = require('express');
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet balance
 *     description: Returns the current wallet balance for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticateToken, walletController.getWallet);

/**
 * @swagger
 * /api/wallet/topup:
 *   post:
 *     tags: [Wallet]
 *     summary: Top up wallet
 *     description: Add funds to the wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Topup successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/topup', authenticateToken, walletController.topUpWallet);

/**
 * @swagger
 * /api/wallet/withdraw:
 *   post:
 *     tags: [Wallet]
 *     summary: Withdraw to card
 *     description: Withdraw funds from wallet to a card
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/withdraw', authenticateToken, walletController.withdrawToCard);

/**
 * @swagger
 * /api/wallet/withdrawals:
 *   get:
 *     tags: [Wallet]
 *     summary: Get withdrawals
 *     description: Retrieve all withdrawals for the user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Withdrawals retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/withdrawals', authenticateToken, walletController.getWithdrawals);

/**
 * @swagger
 * /api/wallet/withdraw/status/{referenceId}:
 *   get:
 *     tags: [Wallet]
 *     summary: Get withdrawal status
 *     description: Check the status of a withdrawal by reference ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: referenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/withdraw/status/:referenceId', authenticateToken, walletController.getWithdrawalStatus);

/**
 * @swagger
 * /api/wallet/pay:
 *   post:
 *     tags: [Wallet]
 *     summary: Pay for booking
 *     description: Pay for an event booking using the wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Payment successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/pay', authenticateToken, walletController.payForBooking);

module.exports = router;
