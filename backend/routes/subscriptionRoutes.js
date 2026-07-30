const express = require('express');
const router = express.Router();
const SubscriptionPlan = require('../models/SubscriptionPlan');

// Public route — returns only enabled plans
/**
 * @swagger
 * /api/subscriptions:
 *   get:
 *     tags: [Subscriptions]
 *     summary: GET /api/subscriptions
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
    const plans = await SubscriptionPlan.findAllEnabled();
    res.json({ success: true, data: { plans } });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscription plans' });
  }
});

module.exports = router;
