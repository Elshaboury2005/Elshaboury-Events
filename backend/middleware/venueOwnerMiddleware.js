/**
 * venueOwnerMiddleware.js
 *
 * Middleware that restricts routes to authenticated users with role = 'venue_owner'.
 * Must be used AFTER authenticateToken so req.user is already populated.
 */
const pool = require('../config/database');

async function requireVenueOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Check role from JWT payload first (fast path)
  if (req.user.role === 'venue_owner') {
    return next();
  }

  // Fall back to database check in case JWT was issued before role column migration
  try {
    const [rows] = await pool.execute(
      'SELECT role FROM users WHERE id = ? LIMIT 1',
      [req.user.userId]
    );
    if (rows.length > 0 && rows[0].role === 'venue_owner') {
      req.user.role = 'venue_owner'; // backfill for downstream use
      return next();
    }
  } catch (_) {
    // If column doesn't exist yet, fall through to 403
  }

  return res.status(403).json({
    success: false,
    message: 'Access restricted to Venue Owners'
  });
}

module.exports = { requireVenueOwner };
