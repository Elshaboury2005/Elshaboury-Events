const express = require('express');
const router = express.Router();
const workshopTaskController = require('../controllers/workshopTaskController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopTaskController.getTasks);
router.post('/', workshopTaskController.createTask);
router.put('/:id', workshopTaskController.updateTask);
router.put('/:id/status', workshopTaskController.updateTaskStatus);
router.delete('/:id', workshopTaskController.deleteTask);

module.exports = router;
