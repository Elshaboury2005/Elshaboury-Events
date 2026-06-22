const pool = require('../config/database');

const VenueWishlist = {
  async toggle(userId, venueId) {
    const [rows] = await pool.execute(
      'SELECT id FROM venue_wishlist WHERE user_id = ? AND venue_id = ? LIMIT 1',
      [userId, venueId]
    );

    if (rows.length > 0) {
      await pool.execute(
        'DELETE FROM venue_wishlist WHERE user_id = ? AND venue_id = ?',
        [userId, venueId]
      );
      return { saved: false };
    }

    await pool.execute(
      'INSERT INTO venue_wishlist (user_id, venue_id) VALUES (?, ?)',
      [userId, venueId]
    );
    return { saved: true };
  },

  async listVenueIdsByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT venue_id FROM venue_wishlist WHERE user_id = ? ORDER BY added_at DESC',
      [userId]
    );
    return rows.map((row) => Number(row.venue_id));
  }
};

module.exports = VenueWishlist;
