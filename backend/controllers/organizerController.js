const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { getJwtSecret } = require('../middleware/authMiddleware');

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getOptionalUserIdFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret);
    return payload?.userId || payload?.id || null;
  } catch (_) {
    return null;
  }
}

function eventLifecycleExpression(alias = 'e') {
  return `COALESCE(${alias}.lifecycle_status, CASE WHEN ${alias}.event_date <= NOW() THEN 'expired' ELSE 'active' END)`;
}

exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = getOptionalUserIdFromRequest(req);

    const [userRows] = await pool.execute(
      `SELECT id, full_name, username, created_at, profile_image_url
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );
    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'Organizer not found' });
    }

    const [eventTotalsRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_events_created,
         COALESCE(SUM(CASE WHEN YEAR(event_date) = YEAR(NOW()) THEN 1 ELSE 0 END), 0) AS events_this_year
       FROM events
       WHERE organizer_id = ?`,
      [userId]
    );

    const [seatTotalsRows] = await pool.execute(
      `
      SELECT
        COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN ${seatsCountExpression} ELSE 0 END), 0) AS total_tickets_sold,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'confirmed' THEN
                CASE
                  WHEN tc.checked_in_seats IS NOT NULL THEN LEAST(tc.checked_in_seats, ${seatsCountExpression})
                  WHEN b.attended = TRUE OR c.booking_id IS NOT NULL THEN ${seatsCountExpression}
                  ELSE 0
                END
              ELSE 0
            END
          ),
          0
        ) AS total_attendees
      FROM bookings b
      INNER JOIN events e ON e.id = b.event_id
      LEFT JOIN event_checkins c ON c.booking_id = b.id
      LEFT JOIN (
        SELECT booking_id, COUNT(*) AS checked_in_seats
        FROM booking_ticket_checkins
        GROUP BY booking_id
      ) tc ON tc.booking_id = b.id
      WHERE e.organizer_id = ?
      `,
      [userId]
    );

    const [ratingRows] = await pool.execute(
      `
      SELECT
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS total_reviews
      FROM events e
      LEFT JOIN event_reviews r ON r.event_id = e.id
      WHERE e.organizer_id = ?
      `,
      [userId]
    );

    const [successfulRows] = await pool.execute(
      `
      SELECT COUNT(*) AS successful_events
      FROM (
        SELECT e.id, COALESCE(AVG(r.rating), 0) AS avg_rating
        FROM events e
        LEFT JOIN event_reviews r ON r.event_id = e.id
        WHERE e.organizer_id = ?
          AND (${eventLifecycleExpression('e')} = 'expired' OR e.event_date < NOW())
        GROUP BY e.id
        HAVING avg_rating >= 4
      ) successful_event_rows
      `,
      [userId]
    );

    const [upcomingRows] = await pool.execute(
      `
      SELECT
        e.id,
        e.title,
        e.event_date,
        e.location,
        e.image_url,
        e.event_type,
        e.max_seats,
        e.available_seats,
        COALESCE(rv.avg_rating, 0) AS average_rating,
        COALESCE(rv.review_count, 0) AS review_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
        FROM event_reviews
        GROUP BY event_id
      ) rv ON rv.event_id = e.id
      WHERE e.organizer_id = ?
        AND (e.event_status = 'approved' OR e.event_status IS NULL)
        AND ${eventLifecycleExpression('e')} = 'active'
        AND e.event_date >= NOW()
      ORDER BY e.event_date ASC
      `,
      [userId]
    );

    const [pastRows] = await pool.execute(
      `
      SELECT
        e.id,
        e.title,
        e.event_date,
        e.location,
        e.image_url,
        e.event_type,
        e.max_seats,
        e.available_seats,
        COALESCE(rv.avg_rating, 0) AS average_rating,
        COALESCE(rv.review_count, 0) AS review_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
        FROM event_reviews
        GROUP BY event_id
      ) rv ON rv.event_id = e.id
      WHERE e.organizer_id = ?
        AND (${eventLifecycleExpression('e')} = 'expired' OR e.event_date < NOW())
      ORDER BY e.event_date DESC
      `,
      [userId]
    );

    const [latestReviewRows] = await pool.execute(
      `
      SELECT
        r.id,
        r.rating,
        r.review,
        r.created_at,
        reviewer.full_name AS reviewer_name,
        reviewer.username AS reviewer_username,
        e.id AS event_id,
        e.title AS event_title
      FROM event_reviews r
      INNER JOIN events e ON e.id = r.event_id
      INNER JOIN users reviewer ON reviewer.id = r.user_id
      WHERE e.organizer_id = ?
      ORDER BY r.created_at DESC
      LIMIT 5
      `,
      [userId]
    );

    const [followerCountRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM followers WHERE following_id = ?',
      [userId]
    );
    const followersCount = toSafeNumber(followerCountRows[0]?.total, 0);

    let isFollowing = false;
    if (requesterId) {
      const [followRows] = await pool.execute(
        `SELECT 1
         FROM followers
         WHERE follower_id = ? AND following_id = ?
         LIMIT 1`,
        [requesterId, userId]
      );
      isFollowing = followRows.length > 0;
    }

    const totalEventsCreated = toSafeNumber(eventTotalsRows[0]?.total_events_created, 0);
    const eventsThisYear = toSafeNumber(eventTotalsRows[0]?.events_this_year, 0);
    const totalTicketsSold = toSafeNumber(seatTotalsRows[0]?.total_tickets_sold, 0);
    const totalAttendees = toSafeNumber(seatTotalsRows[0]?.total_attendees, 0);
    const averageRating = Number(toSafeNumber(ratingRows[0]?.average_rating, 0).toFixed(2));
    const totalReviews = toSafeNumber(ratingRows[0]?.total_reviews, 0);
    const successfulEvents = toSafeNumber(successfulRows[0]?.successful_events, 0);
    const reputationScore = Number((averageRating * totalReviews).toFixed(2));
    const isVerified = successfulEvents >= 3 && averageRating >= 4;

    return res.json({
      success: true,
      organizer: {
        id: user.id,
        name: user.full_name || '',
        username: user.username || '',
        member_since: user.created_at,
        profile_picture: user.profile_image_url || '',
        verified: isVerified
      },
      stats: {
        total_events_created: totalEventsCreated,
        total_tickets_sold: totalTicketsSold,
        average_rating: averageRating,
        total_attendees: totalAttendees,
        total_reviews: totalReviews,
        events_this_year: eventsThisYear,
        successful_events: successfulEvents
      },
      followers_count: followersCount,
      is_following: isFollowing,
      reputation_score: reputationScore,
      upcoming_events: upcomingRows,
      past_events: pastRows,
      latest_reviews: latestReviewRows
    });
  } catch (error) {
    console.error('Get organizer profile error:', error);
    return res.status(500).json({ success: false, message: 'Error loading organizer profile' });
  }
};

exports.toggleFollow = async (req, res) => {
  try {
    const followerId = req.user?.userId;
    const { userId: followingId } = req.params;
    if (!followerId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (String(followerId) === String(followingId)) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const [targetRows] = await pool.execute(
      'SELECT id, full_name, username FROM users WHERE id = ? LIMIT 1',
      [followingId]
    );
    const targetUser = targetRows[0];
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Organizer not found' });
    }

    const [existingRows] = await pool.execute(
      `SELECT 1
       FROM followers
       WHERE follower_id = ? AND following_id = ?
       LIMIT 1`,
      [followerId, followingId]
    );

    let isFollowing;
    let action;
    if (existingRows.length > 0) {
      await pool.execute(
        'DELETE FROM followers WHERE follower_id = ? AND following_id = ?',
        [followerId, followingId]
      );
      isFollowing = false;
      action = 'unfollowed';
    } else {
      await pool.execute(
        'INSERT INTO followers (follower_id, following_id) VALUES (?, ?)',
        [followerId, followingId]
      );
      isFollowing = true;
      action = 'followed';
    }

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM followers WHERE following_id = ?',
      [followingId]
    );
    const followersCount = toSafeNumber(countRows[0]?.total, 0);

    const label = targetUser.full_name || targetUser.username || 'organizer';
    const message = isFollowing
      ? `You are now following ${label}.`
      : `You unfollowed ${label}.`;

    return res.json({
      success: true,
      action,
      is_following: isFollowing,
      followers_count: followersCount,
      message
    });
  } catch (error) {
    console.error('Toggle follow organizer error:', error);
    return res.status(500).json({ success: false, message: 'Error updating follow status' });
  }
};
