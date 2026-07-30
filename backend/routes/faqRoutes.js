const express = require('express');
const router = express.Router();
const FAQ = require('../models/FAQ');

// Public route to fetch all FAQs
/**
 * @swagger
 * /api/faq:
 *   get:
 *     tags: [FAQ]
 *     summary: GET /api/faq
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
router.get('/', async (req, res) => {
  try {
    const faqs = await FAQ.findAll();
    res.json({ success: true, data: { faqs } });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch FAQs' });
  }
});

module.exports = router;
