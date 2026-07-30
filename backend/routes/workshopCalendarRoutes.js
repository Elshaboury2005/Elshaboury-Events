const express = require('express');
const router = express.Router();
const workshopCalendarController = require('../controllers/workshopCalendarController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

/**
 * @swagger
 * /api/workshop/calendar:
 *   get:
 *     tags: [Workshop - Calendar]
 *     summary: Get events
 *     description: Retrieves workshop calendar events
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
router.get('/', workshopCalendarController.getEvents);

/**
 * @swagger
 * /api/workshop/calendar:
 *   post:
 *     tags: [Workshop - Calendar]
 *     summary: Create event
 *     description: Creates a new workshop calendar event
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
router.post('/', workshopCalendarController.createEvent);

/**
 * @swagger
 * /api/workshop/calendar/{id}:
 *   put:
 *     tags: [Workshop - Calendar]
 *     summary: Update event
 *     description: Updates a workshop calendar event
 *     security:
 *       - workshopBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 */
router.put('/:id', workshopCalendarController.updateEvent);

/**
 * @swagger
 * /api/workshop/calendar/{id}:
 *   delete:
 *     tags: [Workshop - Calendar]
 *     summary: Delete event
 *     description: Deletes a workshop calendar event
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
router.delete('/:id', workshopCalendarController.deleteEvent);

module.exports = router;
