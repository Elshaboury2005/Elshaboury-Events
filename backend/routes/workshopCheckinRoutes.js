const express = require('express');
const router = express.Router();
const workshopCheckinController = require('../controllers/workshopCheckinController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.post('/', workshopCheckinController.checkInBooking);
router.get('/summary', workshopCheckinController.getCheckInSummary);

module.exports = router;
