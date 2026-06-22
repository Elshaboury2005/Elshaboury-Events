const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const profileController = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../frontend/uploads/profile');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

function uploadPhotoMiddleware(req, res, next) {
  upload.single('photo')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Image must be 5MB or smaller' });
      }
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(400).json({ success: false, message: error.message || 'Invalid image upload' });
  });
}

router.get('/', authenticateToken, profileController.getProfile);
router.put('/personal-info', authenticateToken, profileController.updatePersonalInfo);
router.put('/update', authenticateToken, profileController.updatePersonalInfo);
router.post('/photo', authenticateToken, uploadPhotoMiddleware, profileController.uploadPhoto);
router.delete('/photo', authenticateToken, profileController.removePhoto);
router.post('/change-password', authenticateToken, profileController.changePassword);
router.put('/password', authenticateToken, profileController.changePassword);
router.get('/reviews', authenticateToken, profileController.getMyReviews);
router.put('/reviews/:reviewId', authenticateToken, profileController.updateReview);
router.delete('/reviews/:reviewId', authenticateToken, profileController.deleteReview);
router.get('/notification-preferences', authenticateToken, profileController.getNotificationPreferences);
router.patch('/notification-preferences', authenticateToken, profileController.updateNotificationPreferences);
router.put('/notifications', authenticateToken, profileController.updateNotificationPreferences);
router.delete('/account', authenticateToken, profileController.deleteAccount);
router.delete('/delete', authenticateToken, profileController.deleteAccount);

module.exports = router;
