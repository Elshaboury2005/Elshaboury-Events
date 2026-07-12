const express = require('express');
const router = express.Router();
const SubscriptionPlan = require('../models/SubscriptionPlan');

// Public route — returns only enabled plans
router.get('/', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.findAllEnabled();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
  }
});

module.exports = router;
