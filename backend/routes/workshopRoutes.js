const express = require('express');
const router = express.Router();
const workshopController = require('../controllers/workshopController');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  authenticateWorkshopToken,
  requireHeadRole
} = require('../middleware/workshopAuthMiddleware');

// ── Public (no auth) ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/workshop/login:
 *   post:
 *     tags: [Workshop - Auth]
 *     summary: Workshop login
 *     description: Logs into the workshop and returns a workshop JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, eventId]
 *             properties:
 *               email:
 *                 type: string
 *               eventId:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
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
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
// Workshop login — issues a Workshop-scoped JWT
router.post('/login', workshopController.workshopLogin);

// ── Organizer-facing (normal platform JWT) ────────────────────────────────────

/**
 * @swagger
 * /api/workshop/event/{eventId}:
 *   get:
 *     tags: [Workshop - Dashboard]
 *     summary: Get workshop for event
 *     description: Get the workshop for a specific event (returns null if none exists yet)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
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
 *       500:
 *         description: Server Error
 */
// Get the workshop for a specific event (returns null if none exists yet)
router.get('/event/:eventId', authenticateToken, workshopController.getWorkshopForEvent);

/**
 * @swagger
 * /api/workshop/event/{eventId}:
 *   post:
 *     tags: [Workshop - Dashboard]
 *     summary: Create workshop
 *     description: Create a workshop for a specific event
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
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
// Create a workshop for a specific event
router.post('/event/:eventId', authenticateToken, workshopController.createWorkshop);

/**
 * @swagger
 * /api/workshop/event/{eventId}/members:
 *   post:
 *     tags: [Workshop - Dashboard]
 *     summary: Organizer add member
 *     description: Organizer adds any member (head/vice_head/member) to any category
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
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
 *       500:
 *         description: Server Error
 */
// Organizer adds any member (head/vice_head/member) to any category
router.post('/event/:eventId/members', authenticateToken, workshopController.organizerAddMember);

// ── Workshop-portal-facing (Workshop JWT) ─────────────────────────────────────

/**
 * @swagger
 * /api/workshop/dashboard:
 *   get:
 *     tags: [Workshop - Dashboard]
 *     summary: Workshop dashboard
 *     description: Dashboard for event + venue data + caller's role
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
// Dashboard: event + venue data + caller's role
router.get('/dashboard', authenticateWorkshopToken, workshopController.getWorkshopDashboard);

/**
 * @swagger
 * /api/workshop/my-category:
 *   get:
 *     tags: [Workshop - Dashboard]
 *     summary: My category members
 *     description: My category members list (all roles can view their own category)
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
// My category members list (all roles can view their own category)
router.get('/my-category', authenticateWorkshopToken, workshopController.getMyCategoryMembers);

/**
 * @swagger
 * /api/workshop/my-category/members:
 *   post:
 *     tags: [Workshop - Dashboard]
 *     summary: Head add member
 *     description: Head adds vice-head or member to their own category
 *     security:
 *       - workshopBearerAuth: []
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server Error
 */
// Head adds vice-head or member to their own category
router.post('/my-category/members', authenticateWorkshopToken, requireHeadRole, workshopController.headAddMember);

module.exports = router;
