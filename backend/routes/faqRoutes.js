const express = require('express');
const router = express.Router();
const FAQ = require('../models/FAQ');

// Public route to fetch all FAQs
router.get('/', async (req, res) => {
  try {
    const faqs = await FAQ.findAll();
    res.json({ success: true, faqs });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch FAQs' });
  }
});

module.exports = router;
