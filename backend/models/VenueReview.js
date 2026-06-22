const pool = require('../config/database');

const VenueReview = {
  async listRecentByVenue(venueId, limit = 5) {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const [rows] = await pool.execute(
      `SELECT vr.id, vr.venue_id, vr.user_id, vr.event_id, vr.rating, vr.review_text, vr.created_at,
              COALESCE(u.full_name, u.username, 'Host') AS reviewer_name,
              e.event_type
       FROM venue_reviews vr
       LEFT JOIN users u ON u.id = vr.user_id
       LEFT JOIN events e ON e.id = vr.event_id
       WHERE vr.venue_id = ?
       ORDER BY vr.created_at DESC
       LIMIT ${safeLimit}`,
      [venueId]
    );
    return rows;
  },

  async create({ venueId, userId, eventId, rating, reviewText }, conn = null) {
    const db = conn || pool;
    const [result] = await db.execute(
      `INSERT INTO venue_reviews (
        venue_id, user_id, event_id, rating, review_text
      ) VALUES (?, ?, ?, ?, ?)`,
      [venueId, userId, eventId, rating, reviewText || null]
    );
    const [rows] = await db.execute(
      `SELECT id, venue_id, user_id, event_id, rating, review_text, created_at
       FROM venue_reviews
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );
    return rows[0] || null;
  },

  async refreshVenueAggregate(venueId, conn = null) {
    const db = conn || pool;
    await db.execute(
      `UPDATE venues v
       LEFT JOIN (
         SELECT venue_id,
                ROUND(AVG(rating), 2) AS avg_rating,
                COUNT(*) AS total_reviews
         FROM venue_reviews
         WHERE venue_id = ?
         GROUP BY venue_id
       ) agg ON agg.venue_id = v.id
       SET v.rating = COALESCE(agg.avg_rating, 0),
           v.total_reviews = COALESCE(agg.total_reviews, 0)
       WHERE v.id = ?`,
      [venueId, venueId]
    );
  },

  async findEligibleBooking({ venueId, userId, eventId }) {
    const [rows] = await pool.execute(
      `SELECT vb.id AS venue_booking_id, vb.event_id, vb.host_id, vb.venue_id,
              e.title AS event_title, e.event_type, e.event_date,
              vr.id AS existing_review_id
       FROM venue_bookings vb
       INNER JOIN events e ON e.id = vb.event_id
       LEFT JOIN venue_reviews vr
         ON vr.venue_id = vb.venue_id
        AND vr.user_id = vb.host_id
        AND vr.event_id = vb.event_id
       WHERE vb.venue_id = ?
         AND vb.host_id = ?
         AND vb.event_id = ?
         AND vb.status = 'confirmed'
       LIMIT 1`,
      [venueId, userId, eventId]
    );
    return rows[0] || null;
  }
};

module.exports = VenueReview;
