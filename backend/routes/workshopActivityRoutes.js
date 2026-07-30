const express = require('express');
const router = express.Router();
const workshopActivityController = require('../controllers/workshopActivityController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

/**
 * @swagger
 * /api/workshop/activity:
 *   get:
 *     tags: [Workshop Activity]
 *     summary: GET /api/workshop/activity
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
router.get('/', workshopActivityController.getActivityLog);

module.exports = router;
