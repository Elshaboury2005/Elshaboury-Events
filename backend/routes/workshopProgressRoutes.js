const express = require('express');
const router = express.Router();
const workshopProgressController = require('../controllers/workshopProgressController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopProgressController.getProgress);

module.exports = router;
