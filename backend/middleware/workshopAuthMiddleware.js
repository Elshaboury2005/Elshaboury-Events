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

/**
 * Signs a Workshop-scoped JWT.
 * Payload shape differs from platform tokens by the presence of `workshopMemberId`.
 */
function signWorkshopToken(payload) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

/**
 * Middleware — requires a valid Workshop JWT.
 * Attaches decoded payload to `req.workshopMember`.
 */
const authenticateWorkshopToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Workshop access token required' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server misconfiguration' });
  }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired workshop token' });
    }

    // Distinguish workshop tokens from normal platform tokens
    if (!decoded.workshopMemberId) {
      return res.status(403).json({ success: false, message: 'Not a workshop token' });
    }

    req.workshopMember = decoded;
    next();
  });
};

/**
 * Middleware — only allows members with role = 'head'.
 * Must be used after authenticateWorkshopToken.
 */
const requireHeadRole = (req, res, next) => {
  if (!req.workshopMember || req.workshopMember.role !== 'head') {
    return res.status(403).json({
      success: false,
      message: 'Only category heads can perform this action'
    });
  }
  next();
};

module.exports = { authenticateWorkshopToken, requireHeadRole, signWorkshopToken };
