const express = require('express');
const { authenticateAdmin } = require('../../middleware/admin/adminAuthMiddleware');
const adminController = require('../../controllers/admin/adminController');

const router = express.Router();

/**
 * @swagger
 * /api/Admin/auth/login:
 *   post:
 *     tags: [Admin]
 *     summary: Admin login
 *     description: Authenticate as an administrator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
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
 *                   properties:
 *                     token:
 *                       type: string
 *                     admin:
 *                       type: object
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/auth/login', adminController.login);

/**
 * @swagger
 * /api/Admin/auth/logout:
 *   post:
 *     tags: [Admin]
 *     summary: Admin logout
 *     description: Logout the authenticated admin
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
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
router.post('/auth/logout', authenticateAdmin, adminController.logout);

/**
 * @swagger
 * /api/Admin/auth/verify:
 *   get:
 *     tags: [Admin]
 *     summary: Verify admin token
 *     description: Verify the validity of the current admin token
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Token verified successfully
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
router.get('/auth/verify', authenticateAdmin, adminController.verify);

/**
 * @swagger
 * /api/Admin/dashboard/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard statistics
 *     description: Retrieve admin dashboard statistics
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
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
router.get('/dashboard/stats', authenticateAdmin, adminController.getDashboardStats);

/**
 * @swagger
 * /api/Admin/dashboard/activity:
 *   get:
 *     tags: [Admin]
 *     summary: Recent activity
 *     description: Retrieve recent activity for the dashboard
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Activity retrieved successfully
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
router.get('/dashboard/activity', authenticateAdmin, adminController.getRecentActivity);

/**
 * @swagger
 * /api/Admin/dashboard/revenue-trend:
 *   get:
 *     tags: [Admin]
 *     summary: Revenue trend data
 *     description: Retrieve revenue trend data for the dashboard
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Revenue trend retrieved successfully
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
router.get('/dashboard/revenue-trend', authenticateAdmin, adminController.getRevenueTrend);

/**
 * @swagger
 * /api/Admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users
 *     description: Retrieve a paginated list of users with optional filtering
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
router.get('/users', authenticateAdmin, adminController.getUsers);

/**
 * @swagger
 * /api/Admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get user details
 *     description: Retrieve details for a specific user
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved successfully
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
router.get('/users/:id', authenticateAdmin, adminController.getUserDetails);

/**
 * @swagger
 * /api/Admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user status
 *     description: Update the active status of a user
 *     security:
 *       - adminBearerAuth: []
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
 *             required: [isActive]
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated successfully
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
router.patch('/users/:id/status', authenticateAdmin, adminController.updateUserStatus);

/**
 * @swagger
 * /api/Admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete user
 *     description: Delete a specific user
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
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
router.delete('/users/:id', authenticateAdmin, adminController.deleteUser);

/**
 * @swagger
 * /api/Admin/events:
 *   get:
 *     tags: [Admin]
 *     summary: List events
 *     description: Retrieve a list of events
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Events retrieved successfully
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
router.get('/events', authenticateAdmin, adminController.getEvents);

/**
 * @swagger
 * /api/Admin/events/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get event details
 *     description: Retrieve details for a specific event
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event details retrieved successfully
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
router.get('/events/:id', authenticateAdmin, adminController.getEventDetails);

/**
 * @swagger
 * /api/Admin/events/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update event
 *     description: Update a specific event
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Event updated successfully
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
router.patch('/events/:id', authenticateAdmin, adminController.updateEvent);

/**
 * @swagger
 * /api/Admin/events/{id}/approval:
 *   patch:
 *     tags: [Admin]
 *     summary: Update event approval
 *     description: Update the approval status of a specific event
 *     security:
 *       - adminBearerAuth: []
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
 *             required: [approved]
 *             properties:
 *               approved:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Event approval updated successfully
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
router.patch('/events/:id/approval', authenticateAdmin, adminController.updateEventApproval);

/**
 * @swagger
 * /api/Admin/events/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete event
 *     description: Delete a specific event
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event deleted successfully
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
router.delete('/events/:id', authenticateAdmin, adminController.deleteEvent);

/**
 * @swagger
 * /api/Admin/events/{id}/report:
 *   get:
 *     tags: [Admin]
 *     summary: Get AI report for event
 *     description: Retrieve an AI generated report for a specific event
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI report retrieved successfully
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
router.get('/events/:id/report', authenticateAdmin, adminController.getEventAiReport);

/**
 * @swagger
 * /api/Admin/venues:
 *   get:
 *     tags: [Admin]
 *     summary: List venues
 *     description: Retrieve a list of venues
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Venues retrieved successfully
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
router.get('/venues', authenticateAdmin, adminController.getVenues);

/**
 * @swagger
 * /api/Admin/venues/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Venue analytics
 *     description: Retrieve analytics for venues
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Venue analytics retrieved successfully
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
router.get('/venues/analytics', authenticateAdmin, adminController.getVenueAnalytics);

/**
 * @swagger
 * /api/Admin/venues:
 *   post:
 *     tags: [Admin]
 *     summary: Create venue
 *     description: Create a new venue
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Venue created successfully
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
 */
router.post('/venues', authenticateAdmin, adminController.createVenue);

/**
 * @swagger
 * /api/Admin/venues/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update venue
 *     description: Update an existing venue
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Venue updated successfully
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
 */
router.patch('/venues/:id', authenticateAdmin, adminController.updateVenue);

/**
 * @swagger
 * /api/Admin/venues/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update venue status
 *     description: Update the status of a specific venue
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Venue status updated successfully
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
router.patch('/venues/:id/status', authenticateAdmin, adminController.updateVenueStatus);

/**
 * @swagger
 * /api/Admin/venues/{id}/calendar:
 *   get:
 *     tags: [Admin]
 *     summary: Venue calendar
 *     description: Retrieve the calendar for a specific venue
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Venue calendar retrieved successfully
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
router.get('/venues/:id/calendar', authenticateAdmin, adminController.getVenueCalendar);

/**
 * @swagger
 * /api/Admin/venues/{id}/availability-blocks:
 *   post:
 *     tags: [Admin]
 *     summary: Create availability block
 *     description: Create an availability block for a specific venue
 *     security:
 *       - adminBearerAuth: []
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
 *       201:
 *         description: Availability block created successfully
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
router.post('/venues/:id/availability-blocks', authenticateAdmin, adminController.createVenueAvailabilityBlock);

/**
 * @swagger
 * /api/Admin/venues/availability-blocks/{blockId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete availability block
 *     description: Delete a specific availability block
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Availability block deleted successfully
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
router.delete('/venues/availability-blocks/:blockId', authenticateAdmin, adminController.deleteVenueAvailabilityBlock);

/**
 * @swagger
 * /api/Admin/venue-bookings:
 *   get:
 *     tags: [Admin]
 *     summary: List venue bookings
 *     description: Retrieve a list of venue bookings
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Venue bookings retrieved successfully
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
router.get('/venue-bookings', authenticateAdmin, adminController.getVenueBookings);

/**
 * @swagger
 * /api/Admin/venue-bookings/export:
 *   get:
 *     tags: [Admin]
 *     summary: Export venue bookings as CSV
 *     description: Export all venue bookings as a CSV file
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: CSV export retrieved successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/venue-bookings/export', authenticateAdmin, adminController.exportVenueBookingsCsv);

/**
 * @swagger
 * /api/Admin/venue-bookings/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update venue booking status
 *     description: Update the status of a specific venue booking
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Venue booking status updated successfully
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
router.patch('/venue-bookings/:id/status', authenticateAdmin, adminController.updateVenueBookingStatus);

/**
 * @swagger
 * /api/Admin/venue-submissions:
 *   get:
 *     tags: [Admin]
 *     summary: Pending venue submissions
 *     description: Retrieve a list of pending venue submissions
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Pending venue submissions retrieved successfully
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
router.get('/venue-submissions', authenticateAdmin, adminController.getPendingVenueSubmissions);

/**
 * @swagger
 * /api/Admin/venue-submissions/{id}/approve:
 *   patch:
 *     tags: [Admin]
 *     summary: Approve venue submission
 *     description: Approve a specific pending venue submission
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Venue submission approved successfully
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
router.patch('/venue-submissions/:id/approve', authenticateAdmin, adminController.approveVenueSubmission);

/**
 * @swagger
 * /api/Admin/venue-submissions/{id}/reject:
 *   patch:
 *     tags: [Admin]
 *     summary: Reject venue submission
 *     description: Reject a specific pending venue submission
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Venue submission rejected successfully
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
router.patch('/venue-submissions/:id/reject', authenticateAdmin, adminController.rejectVenueSubmission);

/**
 * @swagger
 * /api/Admin/venue-submissions/{id}/request-changes:
 *   patch:
 *     tags: [Admin]
 *     summary: Request changes on venue submission
 *     description: Request changes for a specific pending venue submission
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Venue changes requested successfully
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
router.patch('/venue-submissions/:id/request-changes', authenticateAdmin, adminController.requestVenueChanges);

/**
 * @swagger
 * /api/Admin/bookings:
 *   get:
 *     tags: [Admin]
 *     summary: List all bookings
 *     description: Retrieve a list of all bookings
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
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
router.get('/bookings', authenticateAdmin, adminController.getBookings);

/**
 * @swagger
 * /api/Admin/bookings/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update booking status
 *     description: Update the status of a specific booking
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Booking status updated successfully
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
router.patch('/bookings/:id/status', authenticateAdmin, adminController.updateBookingStatus);

/**
 * @swagger
 * /api/Admin/bookings/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Cancel booking
 *     description: Cancel a specific booking
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
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
router.delete('/bookings/:id', authenticateAdmin, adminController.cancelBooking);

/**
 * @swagger
 * /api/Admin/reports/revenue:
 *   get:
 *     tags: [Admin]
 *     summary: Revenue report
 *     description: Retrieve the revenue report
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Revenue report retrieved successfully
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
router.get('/reports/revenue', authenticateAdmin, adminController.getRevenueReport);

/**
 * @swagger
 * /api/Admin/reports/revenue/export:
 *   get:
 *     tags: [Admin]
 *     summary: Export revenue CSV
 *     description: Export the revenue report as a CSV file
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: CSV export retrieved successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/reports/revenue/export', authenticateAdmin, adminController.exportRevenueCsv);

/**
 * @swagger
 * /api/Admin/wallet-withdrawals:
 *   get:
 *     tags: [Admin]
 *     summary: List wallet withdrawals
 *     description: Retrieve a list of wallet withdrawals
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet withdrawals retrieved successfully
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
router.get('/wallet-withdrawals', authenticateAdmin, adminController.getWalletWithdrawals);

/**
 * @swagger
 * /api/Admin/wallet-withdrawals/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update withdrawal status
 *     description: Update the status of a specific wallet withdrawal
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Withdrawal status updated successfully
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
router.patch('/wallet-withdrawals/:id/status', authenticateAdmin, adminController.updateWalletWithdrawalStatus);

// Platform wallet (admin fee collection & withdrawal)
/**
 * @swagger
 * /api/Admin/platform-wallet:
 *   get:
 *     tags: [Admin]
 *     summary: Platform wallet info
 *     description: Retrieve information about the platform wallet
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Platform wallet info retrieved successfully
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
router.get('/platform-wallet', authenticateAdmin, adminController.getPlatformWallet);

/**
 * @swagger
 * /api/Admin/platform-wallet/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: Platform wallet transactions
 *     description: Retrieve transactions for the platform wallet
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
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
router.get('/platform-wallet/transactions', authenticateAdmin, adminController.getPlatformWalletTransactions);

/**
 * @swagger
 * /api/Admin/platform-wallet/withdraw:
 *   post:
 *     tags: [Admin]
 *     summary: Withdraw from platform wallet
 *     description: Initiate a withdrawal from the platform wallet
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
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
router.post('/platform-wallet/withdraw', authenticateAdmin, adminController.withdrawPlatformWallet);

/**
 * @swagger
 * /api/Admin/notifications/send:
 *   post:
 *     tags: [Admin]
 *     summary: Send notification to user
 *     description: Send a notification to a specific user
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, title, message, type]
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification sent successfully
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
router.post('/notifications/send', authenticateAdmin, adminController.sendNotification);

/**
 * @swagger
 * /api/Admin/support:
 *   get:
 *     tags: [Admin]
 *     summary: Get support tickets
 *     description: Retrieve all support tickets
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Support tickets retrieved successfully
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
router.get('/support', authenticateAdmin, adminController.getSupportTickets);

/**
 * @swagger
 * /api/Admin/support/read-all:
 *   put:
 *     tags: [Admin]
 *     summary: Mark all support tickets as read
 *     description: Mark all available support tickets as read
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: All tickets marked as read
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
router.put('/support/read-all', authenticateAdmin, adminController.markAllSupportTicketsAsRead);

/**
 * @swagger
 * /api/Admin/support/{id}/read:
 *   put:
 *     tags: [Admin]
 *     summary: Mark support ticket as read
 *     description: Mark a specific support ticket as read
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket marked as read
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
router.put('/support/:id/read', authenticateAdmin, adminController.markSupportTicketAsRead);

/**
 * @swagger
 * /api/Admin/support/{id}/reply:
 *   post:
 *     tags: [Admin]
 *     summary: Reply to support ticket
 *     description: Send a reply to a specific support ticket
 *     security:
 *       - adminBearerAuth: []
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
 *         description: Reply sent successfully
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
router.post('/support/:id/reply', authenticateAdmin, adminController.replySupportTicket);

/**
 * @swagger
 * /api/Admin/support/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete support ticket
 *     description: Delete a specific support ticket
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Support ticket deleted successfully
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
router.delete('/support/:id', authenticateAdmin, adminController.deleteSupportTicket);

/**
 * @swagger
 * /api/Admin/support:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete all support tickets
 *     description: Delete all existing support tickets
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: All support tickets deleted successfully
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
router.delete('/support', authenticateAdmin, adminController.deleteAllSupportTickets);

/**
 * @swagger
 * /api/Admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Get platform settings
 *     description: Retrieve platform-wide settings
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
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
router.get('/settings', authenticateAdmin, adminController.getSettings);

/**
 * @swagger
 * /api/Admin/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Update platform settings
 *     description: Update platform-wide settings
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Settings updated successfully
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
router.put('/settings', authenticateAdmin, adminController.updateSettings);

/**
 * @swagger
 * /api/Admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Get audit logs
 *     description: Retrieve audit logs for the platform
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
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
router.get('/audit-logs', authenticateAdmin, adminController.getAuditLogs);

// FAQ management routes
/**
 * @swagger
 * /api/Admin/faq:
 *   get:
 *     tags: [Admin]
 *     summary: List FAQs
 *     description: Retrieve all frequently asked questions
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: FAQs retrieved successfully
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
router.get('/faq', authenticateAdmin, adminController.getFaqs);

/**
 * @swagger
 * /api/Admin/faq:
 *   post:
 *     tags: [Admin]
 *     summary: Create FAQ
 *     description: Create a new frequently asked question
 *     security:
 *       - adminBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *               category:
 *                 type: string
 *               orderIndex:
 *                 type: integer
 *     responses:
 *       201:
 *         description: FAQ created successfully
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
router.post('/faq', authenticateAdmin, adminController.createFaq);

/**
 * @swagger
 * /api/Admin/faq/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update FAQ
 *     description: Update an existing frequently asked question
 *     security:
 *       - adminBearerAuth: []
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
 *         description: FAQ updated successfully
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
router.put('/faq/:id', authenticateAdmin, adminController.updateFaq);

/**
 * @swagger
 * /api/Admin/faq/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete FAQ
 *     description: Delete a specific frequently asked question
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FAQ deleted successfully
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
router.delete('/faq/:id', authenticateAdmin, adminController.deleteFaq);

// Subscription plan management routes
/**
 * @swagger
 * /api/Admin/subscriptions:
 *   get:
 *     tags: [Admin]
 *     summary: List subscription plans
 *     description: Retrieve a list of subscription plans
 *     security:
 *       - adminBearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plans retrieved successfully
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
router.get('/subscriptions', authenticateAdmin, adminController.getSubscriptionPlans);

/**
 * @swagger
 * /api/Admin/subscriptions/{planKey}:
 *   put:
 *     tags: [Admin]
 *     summary: Update subscription plan
 *     description: Update a specific subscription plan
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planKey
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
 *         description: Subscription plan updated successfully
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
router.put('/subscriptions/:planKey', authenticateAdmin, adminController.updateSubscriptionPlan);

module.exports = router;
