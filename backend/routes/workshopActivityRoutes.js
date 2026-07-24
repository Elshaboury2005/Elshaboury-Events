const express = require('express');
const router = express.Router();
const workshopActivityController = require('../controllers/workshopActivityController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopActivityController.getActivityLog);

module.exports = router;
