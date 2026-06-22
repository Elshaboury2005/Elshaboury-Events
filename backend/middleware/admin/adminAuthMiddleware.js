const jwt = require('jsonwebtoken');
const path = require('path');
const pool = require('../../config/database');
require('dotenv').config({ path: path.join(__dirname, '../../project.env') });

function getAdminJwtSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret-change-in-production';
}

const INACTIVITY_MINUTES = parseInt(process.env.ADMIN_INACTIVITY_MINUTES || '15', 10);

async function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getAdminJwtSecret());
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin token' });
    }

    if (decoded.role !== 'admin' || !decoded.sessionId || !decoded.adminUuid) {
      return res.status(403).json({ success: false, message: 'Invalid admin access token payload' });
    }

    const [rows] = await pool.execute(
      `SELECT s.id, s.admin_id, s.token_id, s.is_revoked,
              TIMESTAMPDIFF(MINUTE, s.last_activity, NOW()) AS inactive_minutes,
              s.expires_at, a.admin_id AS admin_login_id, a.full_name, a.is_active
       FROM admin_sessions s
       INNER JOIN admins a ON a.id = s.admin_id
       WHERE s.id = ? AND s.token_id = ?
       LIMIT 1`,
      [decoded.sessionId, decoded.tokenId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Admin session not found' });
    }

    const session = rows[0];
    if (session.is_revoked) {
      return res.status(401).json({ success: false, message: 'Admin session revoked' });
    }

    if (!session.is_active) {
      return res.status(403).json({ success: false, message: 'Admin account is inactive' });
    }

    if (session.inactive_minutes !== null && session.inactive_minutes > INACTIVITY_MINUTES) {
      await pool.execute('UPDATE admin_sessions SET is_revoked = TRUE WHERE id = ?', [decoded.sessionId]);
      return res.status(401).json({ success: false, message: 'Session timed out due to inactivity' });
    }

    await pool.execute(
      'UPDATE admin_sessions SET last_activity = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?',
      [decoded.sessionId]
    );

    req.admin = {
      id: session.admin_id,
      adminId: session.admin_login_id,
      fullName: session.full_name,
      sessionId: decoded.sessionId,
      tokenId: decoded.tokenId
    };

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Error validating admin token' });
  }
}

module.exports = { authenticateAdmin, getAdminJwtSecret, INACTIVITY_MINUTES };
