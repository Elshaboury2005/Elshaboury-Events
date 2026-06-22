const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

router.get('/', authenticateToken, notificationController.getAll);
router.put('/read-all', authenticateToken, notificationController.markAllAsRead);
router.put('/:id/read', authenticateToken, notificationController.markAsRead);
router.delete('/:id', authenticateToken, notificationController.deleteOne);
router.delete('/', authenticateToken, notificationController.deleteAll);

// Keep createNotification export for backward compatibility (e.g. if any script uses it)
// Prefer: const Notification = require('../models/Notification'); Notification.create(...)
const createNotification = (userId, title, message, type = 'info', category = null) =>
  Notification.create(userId, title, message, type, category);

module.exports = { router, createNotification };
