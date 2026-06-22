const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../project.env') });

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return secret || 'my-secret-key-12345-change-in-production';
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT_SECRET required' });
  }

  jwt.verify(
    token,
    secret,
    (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }
      req.user = user;
      next();
    }
  );
};

const authenticateOptional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT_SECRET required' });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken, authenticateOptional, getJwtSecret };





