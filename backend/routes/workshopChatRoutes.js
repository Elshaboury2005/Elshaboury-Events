const express = require('express');
const router = express.Router();
const workshopChatController = require('../controllers/workshopChatController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

router.use(authenticateWorkshopToken);

router.get('/', workshopChatController.getMessages);
router.post('/', workshopChatController.sendMessage);
router.delete('/:id', workshopChatController.deleteOwnMessage);

module.exports = router;
