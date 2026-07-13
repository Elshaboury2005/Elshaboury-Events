const express = require('express');
const router = express.Router();
const workshopController = require('../controllers/workshopController');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  authenticateWorkshopToken,
  requireHeadRole
} = require('../middleware/workshopAuthMiddleware');

// ── Public (no auth) ──────────────────────────────────────────────────────────
// Workshop login — issues a Workshop-scoped JWT
router.post('/login', workshopController.workshopLogin);

// ── Organizer-facing (normal platform JWT) ────────────────────────────────────
// Get the workshop for a specific event (returns null if none exists yet)
router.get('/event/:eventId', authenticateToken, workshopController.getWorkshopForEvent);
// Create a workshop for a specific event
router.post('/event/:eventId', authenticateToken, workshopController.createWorkshop);
// Organizer adds any member (head/vice_head/member) to any category
router.post('/event/:eventId/members', authenticateToken, workshopController.organizerAddMember);

// ── Workshop-portal-facing (Workshop JWT) ─────────────────────────────────────
// Dashboard: event + venue data + caller's role
router.get('/dashboard', authenticateWorkshopToken, workshopController.getWorkshopDashboard);
// My category members list (all roles can view their own category)
router.get('/my-category', authenticateWorkshopToken, workshopController.getMyCategoryMembers);
// Head adds vice-head or member to their own category
router.post('/my-category/members', authenticateWorkshopToken, requireHeadRole, workshopController.headAddMember);

module.exports = router;
