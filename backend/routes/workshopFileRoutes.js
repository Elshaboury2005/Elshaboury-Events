const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const workshopFileController = require('../controllers/workshopFileController');
const { authenticateWorkshopToken } = require('../middleware/workshopAuthMiddleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../frontend/uploads/workshop-files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.bin', '.msi', '.jar', '.com', '.vbs', '.scr'];
    if (blockedExtensions.includes(extension)) {
      return cb(new Error('Executable files are blocked for security reasons'));
    }
    cb(null, true);
  }
});

function uploadFileMiddleware(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size must be 20MB or smaller' });
      }
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(400).json({ success: false, message: error.message || 'Invalid file upload' });
  });
}

router.use(authenticateWorkshopToken);

/**
 * @swagger
 * /api/workshop/files:
 *   get:
 *     tags: [Workshop Files]
 *     summary: GET /api/workshop/files
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', workshopFileController.getFiles);
/**
 * @swagger
 * /api/workshop/files:
 *   post:
 *     tags: [Workshop Files]
 *     summary: POST /api/workshop/files
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', uploadFileMiddleware, workshopFileController.uploadFile);
/**
 * @swagger
 * /api/workshop/files/{id}:
 *   delete:
 *     tags: [Workshop Files]
 *     summary: DELETE /api/workshop/files/{id}
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
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
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', workshopFileController.deleteFile);

module.exports = router;
