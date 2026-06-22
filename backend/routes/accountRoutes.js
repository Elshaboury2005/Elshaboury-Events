const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/register', accountController.register);
router.post('/login', accountController.login);
router.get('/checkusername', accountController.checkUsername);
router.get('/checkemail', accountController.checkEmail);
router.post('/logout', accountController.logout);
router.get('/verify', authenticateToken, accountController.verify);

module.exports = router;
