const express = require('express');
const router = express.Router();
const workshopChatController = require('../controllers/workshopChatController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

/**
 * @swagger
 * /api/workshop/chat:
 *   get:
 *     tags: [Workshop - Chat]
 *     summary: Get messages
 *     description: Retrieves workshop chat messages
 *     security:
 *       - workshopBearerAuth: []
 *     responses:
 *       200:
 *         description: Success
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
 *       500:
 *         description: Server Error
 */
router.get('/', workshopChatController.getMessages);

/**
 * @swagger
 * /api/workshop/chat:
 *   post:
 *     tags: [Workshop - Chat]
 *     summary: Send message
 *     description: Sends a new message in the workshop chat
 *     security:
 *       - workshopBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Created
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
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server Error
 */
router.post('/', workshopChatController.sendMessage);

/**
 * @swagger
 * /api/workshop/chat/{id}:
 *   delete:
 *     tags: [Workshop - Chat]
 *     summary: Delete message
 *     description: Deletes an own message
 *     security:
 *       - workshopBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
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
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 */
router.delete('/:id', workshopChatController.deleteOwnMessage);

module.exports = router;
