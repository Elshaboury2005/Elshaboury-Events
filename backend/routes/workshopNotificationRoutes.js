const express = require('express');
const router = express.Router();
const workshopNotificationController = require('../controllers/workshopNotificationController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopNotificationController.getNotifications);
router.put('/read-all', workshopNotificationController.markAllRead);
router.put('/:id/read', workshopNotificationController.markRead);

module.exports = router;
