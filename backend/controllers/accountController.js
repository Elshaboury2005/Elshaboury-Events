const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../project.env') });
const User = require('../models/User');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const pool = require('../config/database');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return secret || 'my-secret-key-12345-change-in-production';
}

exports.register = async (req, res) => {
  try {
    const { fullName, email, username, password, confirmPassword, role } = req.body;
    const safeRole = (role === 'venue_owner') ? 'venue_owner' : 'user';

    if (!fullName || !email || !username || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const existsByUsername = await User.existsByUsername(username);
    const existsByEmail = await User.existsByEmail(email);
    if (existsByUsername || existsByEmail) {
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    await User.create(userId, fullName, email, username, hashedPassword, safeRole);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please login.',
      user: { id: userId, username, email, fullName, role: safeRole }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findByUsernameOrEmail(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    if (user.is_active === 0 || user.is_active === false) {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Contact support.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    let secret;
    try {
      secret = getJwtSecret();
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT_SECRET required' });
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role || 'user' },
      secret,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // "Event approaching" notification: notify if any organized event is in the next 24 hours (max once per 24h per event)
    try {
      const myEvents = await Event.findByOrganizerId(user.id);
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      for (const ev of myEvents) {
        const eventDate = new Date(ev.event_date);
        if (eventDate >= now && eventDate <= in24h) {
          const alreadyNotified = await Notification.hasRecentEventComing(user.id, ev.title);
          if (!alreadyNotified) {
            const hoursLeft = Math.round((eventDate - now) / (60 * 60 * 1000));
            await Notification.create(
              user.id,
              'Event Coming Up!',
              `${ev.title} starts in about ${hoursLeft} hour(s). Get ready!`,
              'info',
              'event_reminders'
            );
          }
        }
      }
    } catch (e) {
      console.error('Event-approaching notification skip:', e.message);
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || username.length < 3) {
      return res.json({ available: false });
    }
    const exists = await User.existsByUsername(username);
    res.json({ available: !exists });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ available: false });
  }
};

exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !validator.isEmail(email)) {
      return res.json({ available: false });
    }
    const exists = await User.existsByEmail(email);
    res.json({ available: !exists });
  } catch (error) {
    console.error('Email check error:', error);
    res.status(500).json({ available: false });
  }
};

exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

exports.verify = (req, res) => {
  res.json({
    success: true,
    user: { id: req.user.userId, username: req.user.username, role: req.user.role || 'user' }
  });
};
