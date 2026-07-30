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

/**
 * @swagger
 * /api/Profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get profile
 *     description: Returns the user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.get('/', authenticateToken, profileController.getProfile);

/**
 * @swagger
 * /api/Profile/personal-info:
 *   put:
 *     tags: [Profile]
 *     summary: Update personal info
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.put('/personal-info', authenticateToken, profileController.updatePersonalInfo);

/**
 * @swagger
 * /api/Profile/update:
 *   put:
 *     tags: [Profile]
 *     summary: Update personal info (alias)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.put('/update', authenticateToken, profileController.updatePersonalInfo);

/**
 * @swagger
 * /api/Profile/photo:
 *   post:
 *     tags: [Profile]
 *     summary: Upload profile photo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.post('/photo', authenticateToken, uploadPhotoMiddleware, profileController.uploadPhoto);

/**
 * @swagger
 * /api/Profile/photo:
 *   delete:
 *     tags: [Profile]
 *     summary: Delete profile photo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.delete('/photo', authenticateToken, profileController.removePhoto);

/**
 * @swagger
 * /api/Profile/change-password:
 *   post:
 *     tags: [Profile]
 *     summary: Change password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.post('/change-password', authenticateToken, profileController.changePassword);

/**
 * @swagger
 * /api/Profile/password:
 *   put:
 *     tags: [Profile]
 *     summary: Change password (alias)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.put('/password', authenticateToken, profileController.changePassword);

/**
 * @swagger
 * /api/Profile/reviews:
 *   get:
 *     tags: [Profile]
 *     summary: Get user reviews
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reviews retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/reviews', authenticateToken, profileController.getMyReviews);

/**
 * @swagger
 * /api/Profile/reviews/{reviewId}:
 *   put:
 *     tags: [Profile]
 *     summary: Update a review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Review updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.put('/reviews/:reviewId', authenticateToken, profileController.updateReview);

/**
 * @swagger
 * /api/Profile/reviews/{reviewId}:
 *   delete:
 *     tags: [Profile]
 *     summary: Delete a review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.delete('/reviews/:reviewId', authenticateToken, profileController.deleteReview);

/**
 * @swagger
 * /api/Profile/notification-preferences:
 *   get:
 *     tags: [Profile]
 *     summary: Get notification preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.get('/notification-preferences', authenticateToken, profileController.getNotificationPreferences);

/**
 * @swagger
 * /api/Profile/notification-preferences:
 *   patch:
 *     tags: [Profile]
 *     summary: Update notification preferences
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Preferences updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.patch('/notification-preferences', authenticateToken, profileController.updateNotificationPreferences);

/**
 * @swagger
 * /api/Profile/notifications:
 *   put:
 *     tags: [Profile]
 *     summary: Update notification preferences (alias)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Preferences updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.put('/notifications', authenticateToken, profileController.updateNotificationPreferences);

/**
 * @swagger
 * /api/Profile/account:
 *   delete:
 *     tags: [Profile]
 *     summary: Delete account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.delete('/account', authenticateToken, profileController.deleteAccount);

/**
 * @swagger
 * /api/Profile/delete:
 *   delete:
 *     tags: [Profile]
 *     summary: Delete account (alias)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 */
router.delete('/delete', authenticateToken, profileController.deleteAccount);

module.exports = router;
