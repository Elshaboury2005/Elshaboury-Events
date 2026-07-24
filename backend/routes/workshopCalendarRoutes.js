const express = require('express');
const router = express.Router();
const workshopCalendarController = require('../controllers/workshopCalendarController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopCalendarController.getEvents);
router.post('/', workshopCalendarController.createEvent);
router.put('/:id', workshopCalendarController.updateEvent);
router.delete('/:id', workshopCalendarController.deleteEvent);

module.exports = router;
