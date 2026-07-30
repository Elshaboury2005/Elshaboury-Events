const express = require('express');
const router = express.Router();
const workshopTaskController = require('../controllers/workshopTaskController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

/**
 * @swagger
 * /api/workshop/tasks:
 *   get:
 *     tags: [Workshop - Tasks]
 *     summary: Get tasks
 *     description: Retrieves tasks
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
router.get('/', workshopTaskController.getTasks);

/**
 * @swagger
 * /api/workshop/tasks:
 *   post:
 *     tags: [Workshop - Tasks]
 *     summary: Create task
 *     description: Creates a new task
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
router.post('/', workshopTaskController.createTask);

/**
 * @swagger
 * /api/workshop/tasks/{id}:
 *   put:
 *     tags: [Workshop - Tasks]
 *     summary: Update task
 *     description: Updates an existing task
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
router.put('/:id', workshopTaskController.updateTask);

/**
 * @swagger
 * /api/workshop/tasks/{id}/status:
 *   put:
 *     tags: [Workshop - Tasks]
 *     summary: Update task status
 *     description: Updates the status of an existing task
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
router.put('/:id/status', workshopTaskController.updateTaskStatus);

/**
 * @swagger
 * /api/workshop/tasks/{id}:
 *   delete:
 *     tags: [Workshop - Tasks]
 *     summary: Delete task
 *     description: Deletes a task
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
router.delete('/:id', workshopTaskController.deleteTask);

module.exports = router;
