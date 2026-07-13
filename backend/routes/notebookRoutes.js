const express = require('express');
const router = express.Router();
const notebookController = require('../controllers/notebookController');
const notebookPredictionController = require('../controllers/notebookPredictionController');
const { authenticateToken } = require('../middleware/authMiddleware');

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, notebookController.getMyNotebooks);
router.get('/:id', authenticateToken, notebookController.getNotebookById);
router.post('/', authenticateToken, notebookController.createNotebook);
router.post('/:id/use', authenticateToken, notebookController.useNotebook);
router.put('/:id', authenticateToken, notebookController.updateNotebook);
router.post('/:id/duplicate', authenticateToken, notebookController.duplicateNotebook);
router.delete('/:id', authenticateToken, notebookController.deleteNotebook);

// ── ML / Prediction ───────────────────────────────────────────────────────────
// GET  /api/notebooks/:id/organizer-stats  → auto-fetch Category 2 data
router.get('/:id/organizer-stats', authenticateToken, notebookPredictionController.getOrganizerStats);
// PUT  /api/notebooks/:id/ml-fields        → autosave Category 1 fields
router.put('/:id/ml-fields', authenticateToken, notebookPredictionController.saveMlFields);
// POST /api/notebooks/:id/predict          → run full prediction
router.post('/:id/predict', authenticateToken, notebookPredictionController.runPrediction);

module.exports = router;
