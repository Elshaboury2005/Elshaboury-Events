const { v4: uuidv4 } = require('uuid');
const Event = require('../models/Event');
const Favorite = require('../models/Favorite');

exports.add = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const eventExists = await Event.findById(eventId);
    if (!eventExists) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const exists = await Favorite.exists(userId, eventId);
    if (exists) {
      return res.status(400).json({ success: false, message: 'Event already in favorites' });
    }

    const favoriteId = uuidv4();
    await Favorite.add(favoriteId, userId, eventId);

    res.status(201).json({ success: true, message: 'Event added to favorites' });
  } catch (error) {
    console.error('Add favorite error:', error);
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
      return res.status(500).json({
        success: false,
        message: 'Database table not found. Please create the favorites table.'
      });
    }
    res.status(500).json({ success: false, message: error.message || 'Error adding to favorites' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const removed = await Favorite.remove(userId, eventId);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Favorite not found' });
    }

    res.json({ success: true, message: 'Event removed from favorites' });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ success: false, message: 'Error removing from favorites' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const events = await Favorite.findByUserId(userId);
    res.json({ success: true, events });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ success: false, message: 'Error fetching favorites' });
  }
};

exports.check = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const isFavorited = await Favorite.exists(userId, eventId);
    res.json({ success: true, isFavorited });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ success: false, message: 'Error checking favorite status' });
  }
};
