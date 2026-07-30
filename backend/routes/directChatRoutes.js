const express = require('express');
const router = express.Router();
const directChatController = require('../controllers/directChatController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/direct-chat/my-chats:
 *   get:
 *     tags: [Direct Chat]
 *     summary: GET /api/direct-chat/my-chats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/my-chats', authenticateToken, directChatController.getMyDirectChats);
/**
 * @swagger
 * /api/direct-chat/{venueBookingId}/messages:
 *   get:
 *     tags: [Direct Chat]
 *     summary: GET /api/direct-chat/{venueBookingId}/messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: venueBookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:venueBookingId/messages', authenticateToken, directChatController.getMessages);
/**
 * @swagger
 * /api/direct-chat/{venueBookingId}/read:
 *   post:
 *     tags: [Direct Chat]
 *     summary: POST /api/direct-chat/{venueBookingId}/read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: venueBookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:venueBookingId/read', authenticateToken, directChatController.markRead);
/**
 * @swagger
 * /api/direct-chat/{venueBookingId}/canAccess:
 *   get:
 *     tags: [Direct Chat]
 *     summary: GET /api/direct-chat/{venueBookingId}/canAccess
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: venueBookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:venueBookingId/canAccess', authenticateToken, directChatController.canAccess);

module.exports = router;
