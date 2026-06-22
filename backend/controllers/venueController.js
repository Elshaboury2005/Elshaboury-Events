const Venue = require('../models/Venue');
const VenueBooking = require('../models/VenueBooking');
const VenueWishlist = require('../models/VenueWishlist');
const VenueReview = require('../models/VenueReview');
const Notification = require('../models/Notification');
const pool = require('../config/database');
const {
  confirmVenueBookingAfterPayment
} = require('../services/venueBookingService');

const EVENT_TYPE_SUGGESTIONS = [
  {
    match: ['concert'],
    categories: ['theater', 'outdoor_garden', 'beach_venue']
  },
  {
    match: ['conference', 'workshop', 'summit', 'seminar'],
    categories: ['conference_hall', 'hotel_ballroom']
  },
  {
    match: ['wedding', 'gala', 'private gathering'],
    categories: ['wedding_hall', 'outdoor_garden', 'rooftop', 'hotel_ballroom']
  },
  {
    match: ['sport', 'sports', 'sporting event'],
    categories: ['sports_hall', 'outdoor_garden']
  }
];

function parseJsonArray(rawValue, fallback = []) {
  if (!rawValue) return fallback;
  if (Array.isArray(rawValue)) return rawValue;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function parseList(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const value = String(rawValue || '').trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch (_) {}
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeReview(row) {
  const reviewerName = String(row.reviewer_name || 'Host').trim() || 'Host';
  return {
    id: row.id,
    venueId: Number(row.venue_id),
    userId: row.user_id,
    eventId: row.event_id,
    rating: Number(row.rating || 0),
    reviewText: row.review_text || '',
    createdAt: row.created_at,
    reviewerName,
    reviewerInitial: reviewerName.charAt(0).toUpperCase() || 'H',
    eventType: row.event_type || 'Event'
  };
}

function normalizeVenueForResponse(venue, options = {}) {
  if (!venue) return null;
  const bookedDates = options.bookedDates || [];
  const blockedDates = options.blockedDates || [];
  const reviews = options.reviews || [];
  const selectedDate = options.selectedDate || null;

  const isBookedOnDate = Boolean(venue.is_booked_on_date);
  const isBlockedOnDate = Boolean(venue.is_blocked_on_date);
  const isAvailableOnDate = selectedDate
    ? Boolean(venue.is_available_on_date)
    : Boolean(venue.is_available);

  return {
    id: venue.id,
    name: venue.name,
    description: venue.description || '',
    governorate: venue.governorate,
    address: venue.address,
    latitude: venue.latitude == null ? null : Number(venue.latitude),
    longitude: venue.longitude == null ? null : Number(venue.longitude),
    category: venue.category || 'conference_hall',
    totalCapacity: Number(venue.total_capacity || 0),
    standardSeats: Number(venue.standard_seats || 0),
    specialSeats: Number(venue.special_seats || 0),
    vipSeats: Number(venue.vip_seats || 0),
    pricePerDay: Number(venue.price_per_day || 0),
    pricePerHour: venue.price_per_hour == null ? null : Number(venue.price_per_hour),
    minHours: Number(venue.min_hours || 0),
    rating: Number(venue.rating || 0),
    totalReviews: Number(venue.total_reviews || 0),
    amenities: parseJsonArray(venue.amenities, []),
    images: parseJsonArray(venue.images, []),
    isFeatured: Boolean(venue.is_featured),
    isAvailable: Boolean(venue.is_available),
    ownerId: venue.owner_id || null,
    status: venue.status || 'approved',
    venueType: venue.venue_type || 'platform',
    isInWishlist: Boolean(venue.is_in_wishlist),
    upcomingBookings: Number(venue.upcoming_bookings || 0),
    confirmedBookings: Number(venue.confirmed_bookings || 0),
    totalRevenue: Number(venue.total_revenue || 0),
    createdAt: venue.created_at,
    availability: {
      date: selectedDate,
      isBooked: isBookedOnDate,
      isBlocked: isBlockedOnDate,
      isAvailable: isAvailableOnDate,
      status: isAvailableOnDate ? 'available' : 'booked'
    },
    bookedDates: bookedDates.map((row) => ({
      date: normalizeDate(row.event_date),
      status: row.status
    })),
    blockedDates: blockedDates.map((row) => ({
      id: row.id,
      startDate: normalizeDate(row.start_date),
      endDate: normalizeDate(row.end_date),
      reason: row.reason || ''
    })),
    reviews: reviews.map(normalizeReview)
  };
}

function normalizeVenueBooking(row) {
  return {
    id: row.id,
    venueId: row.venue_id,
    eventId: row.event_id,
    hostId: row.host_id,
    eventDate: normalizeDate(row.event_date),
    totalPrice: Number(row.total_price || 0),
    status: row.status,
    paymentStatus: row.payment_status,
    bookedAt: row.booked_at,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      address: row.venue_address,
      governorate: row.governorate,
      totalCapacity: Number(row.total_capacity || 0),
      standardSeats: Number(row.standard_seats || 0),
      specialSeats: Number(row.special_seats || 0),
      vipSeats: Number(row.vip_seats || 0),
      pricePerDay: Number(row.price_per_day || 0),
      amenities: parseJsonArray(row.amenities, []),
      images: parseJsonArray(row.images, []),
      category: row.category || 'conference_hall'
    },
    eventTitle: row.event_title || null
  };
}

function parseCatalogFilters(req) {
  return {
    userId: req.user?.userId || null,
    date: String(req.query.date || '').trim() || null,
    governorate: String(req.query.governorate || '').trim(),
    search: String(req.query.search || '').trim(),
    category: String(req.query.category || '').trim(),
    capacityMin: req.query.capacityMin == null || req.query.capacityMin === '' ? null : Number(req.query.capacityMin),
    capacityMax: req.query.capacityMax == null || req.query.capacityMax === '' ? null : Number(req.query.capacityMax),
    priceMin: req.query.priceMin == null || req.query.priceMin === '' ? null : Number(req.query.priceMin),
    priceMax: req.query.priceMax == null || req.query.priceMax === '' ? null : Number(req.query.priceMax),
    amenities: parseList(req.query.amenities),
    sortBy: String(req.query.sortBy || 'featured_first').trim(),
    wishlistOnly: String(req.query.wishlistOnly || '').trim().toLowerCase() === 'true'
  };
}

async function getWishlistedIds(userId) {
  if (!userId) return new Set();
  const ids = await VenueWishlist.listVenueIdsByUser(userId);
  return new Set(ids.map((id) => Number(id)));
}

exports.getAvailableVenues = async (req, res) => {
  try {
    const filters = parseCatalogFilters(req);
    const rows = await Venue.searchCatalog(filters);
    res.json({
      success: true,
      filters,
      venues: rows.map((row) => normalizeVenueForResponse(row, { selectedDate: filters.date }))
    });
  } catch (error) {
    console.error('Get venues catalog error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venues' });
  }
};

exports.getFeaturedVenues = async (req, res) => {
  try {
    const filters = parseCatalogFilters(req);
    const rows = await Venue.findFeatured(filters);
    res.json({
      success: true,
      venues: rows.map((row) => normalizeVenueForResponse(row, { selectedDate: filters.date }))
    });
  } catch (error) {
    console.error('Get featured venues error:', error);
    res.status(500).json({ success: false, message: 'Failed to load featured venues' });
  }
};

exports.getOwnerProfile = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || '').trim();
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Owner ID is required' });
    }

    const [[owner]] = await pool.execute(
      `SELECT id, full_name
       FROM users
       WHERE id = ? AND role = 'venue_owner'
       LIMIT 1`,
      [ownerId]
    );

    if (!owner) {
      return res.status(404).json({ success: false, message: 'Venue owner not found' });
    }

    const [venueRows] = await pool.execute(
      `SELECT
         v.*,
         FALSE AS is_booked_on_date,
         FALSE AS is_blocked_on_date,
         TRUE AS is_available_on_date,
         FALSE AS is_in_wishlist,
         (
           SELECT COUNT(*)
           FROM venue_bookings vb
           WHERE vb.venue_id = v.id
             AND vb.status IN ('accepted', 'confirmed')
             AND vb.event_date >= CURDATE()
         ) AS upcoming_bookings,
         (
           SELECT COUNT(*)
           FROM venue_bookings vb
           WHERE vb.venue_id = v.id
             AND vb.status IN ('accepted', 'confirmed')
         ) AS confirmed_bookings,
         (
           SELECT COALESCE(SUM(vb.total_price), 0)
           FROM venue_bookings vb
           WHERE vb.venue_id = v.id
             AND vb.status = 'confirmed'
             AND vb.payment_status = 'paid'
         ) AS total_revenue
       FROM venues v
       WHERE v.owner_id = ?
         AND v.status = 'approved'
       ORDER BY v.is_featured DESC, v.rating DESC, v.price_per_day ASC, v.name ASC`,
      [ownerId]
    );

    const [[bookingStats]] = await pool.execute(
      `SELECT COUNT(*) AS total_confirmed_bookings
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id
       WHERE v.owner_id = ?
         AND v.status = 'approved'
         AND vb.status IN ('accepted', 'confirmed')`,
      [ownerId]
    );

    const approvedVenuesCount = venueRows.length;
    const averageRating = approvedVenuesCount > 0
      ? venueRows.reduce((sum, venue) => sum + Number(venue.rating || 0), 0) / approvedVenuesCount
      : 0;

    res.json({
      success: true,
      owner: {
        id: owner.id,
        fullName: owner.full_name || 'Venue Owner'
      },
      stats: {
        approvedVenuesCount,
        averageRating: Number(averageRating.toFixed(2)),
        totalConfirmedBookings: Number(bookingStats.total_confirmed_bookings || 0)
      },
      venues: venueRows.map((row) => normalizeVenueForResponse(row))
    });
  } catch (error) {
    console.error('Get venue owner profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue owner profile' });
  }
};

exports.getVenueDetails = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const selectedDate = String(req.query.date || '').trim() || null;
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const venue = await Venue.findById(id);
    if (!venue || venue.status !== 'approved') {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const [bookedDates, blockedDates, reviews, wishlistedIds] = await Promise.all([
      Venue.getBookedDates(id),
      Venue.getAvailabilityBlocks(id),
      VenueReview.listRecentByVenue(id, 5),
      getWishlistedIds(req.user?.userId || null)
    ]);

    if (selectedDate) {
      const normalizedSelected = normalizeDate(selectedDate);
      venue.is_booked_on_date = bookedDates.some((row) => normalizeDate(row.event_date) === normalizedSelected && row.status === 'confirmed');
      venue.is_blocked_on_date = blockedDates.some((row) => (
        normalizeDate(row.start_date) <= normalizedSelected && normalizeDate(row.end_date) >= normalizedSelected
      ));
      venue.is_available_on_date = !venue.is_booked_on_date && !venue.is_blocked_on_date;
    }
    venue.is_in_wishlist = wishlistedIds.has(id);

    res.json({
      success: true,
      venue: normalizeVenueForResponse(venue, {
        bookedDates,
        blockedDates,
        reviews,
        selectedDate
      })
    });
  } catch (error) {
    console.error('Get venue details error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue details' });
  }
};

exports.getVenueReviews = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    const reviews = await VenueReview.listRecentByVenue(id, 10);
    res.json({
      success: true,
      reviews: reviews.map(normalizeReview)
    });
  } catch (error) {
    console.error('Get venue reviews error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue reviews' });
  }
};

exports.submitVenueReview = async (req, res) => {
  let connection;
  try {
    const venueId = parseInt(req.params.id, 10);
    const userId = req.user.userId;
    const eventId = String(req.body.eventId || '').trim();
    const rating = parseInt(req.body.rating, 10);
    const reviewText = String(req.body.reviewText || req.body.review_text || '').trim();

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'Event ID is required' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const eligible = await VenueReview.findEligibleBooking({ venueId, userId, eventId });
    if (!eligible) {
      return res.status(403).json({
        success: false,
        message: 'You can only review venues that you booked for your completed events'
      });
    }
    if (eligible.existing_review_id) {
      return res.status(409).json({ success: false, message: 'You already reviewed this venue for this event' });
    }

    const eventEnded = eligible.event_date && new Date(eligible.event_date) <= new Date();
    if (!eventEnded) {
      return res.status(400).json({ success: false, message: 'Venue reviews can be submitted after the event ends' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const created = await VenueReview.create({
      venueId,
      userId,
      eventId,
      rating,
      reviewText
    }, connection);

    await VenueReview.refreshVenueAggregate(venueId, connection);

    await connection.commit();
    connection.release();
    connection = null;

    await Notification.create(
      userId,
      'Venue Review Submitted',
      `Thanks for reviewing ${eligible.event_title || 'your venue experience'}.`,
      'success'
    );

    res.status(201).json({
      success: true,
      review: created
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Submit venue review error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit venue review' });
  }
};

exports.toggleWishlist = async (req, res) => {
  try {
    const venueId = parseInt(req.params.id, 10);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue || venue.status !== 'approved') {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const result = await VenueWishlist.toggle(req.user.userId, venueId);
    res.json({
      success: true,
      saved: result.saved
    });
  } catch (error) {
    console.error('Toggle venue wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to update wishlist' });
  }
};

exports.getWishlist = async (req, res) => {
  try {
    const filters = parseCatalogFilters(req);
    filters.userId = req.user.userId;
    filters.wishlistOnly = true;
    const rows = await Venue.searchCatalog(filters);
    res.json({
      success: true,
      venues: rows.map((row) => normalizeVenueForResponse(row, { selectedDate: filters.date }))
    });
  } catch (error) {
    console.error('Get venue wishlist error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wishlist venues' });
  }
};

exports.getVenueSuggestions = async (req, res) => {
  try {
    const eventType = String(req.query.eventType || '').trim().toLowerCase();
    const governorate = String(req.query.governorate || '').trim();
    const date = String(req.query.date || '').trim() || null;

    if (!eventType) {
      return res.status(400).json({ success: false, message: 'Event type is required' });
    }

    const rule = EVENT_TYPE_SUGGESTIONS.find((item) => item.match.some((entry) => eventType.includes(entry)));
    const categories = rule?.categories || ['conference_hall', 'hotel_ballroom', 'outdoor_garden'];

    let rows = await Venue.searchCatalog({
      userId: req.user?.userId || null,
      governorate,
      date,
      sortBy: 'featured_first'
    });

    rows = rows
      .filter((row) => categories.includes(row.category))
      .sort((a, b) => {
        const aIndex = categories.indexOf(a.category);
        const bIndex = categories.indexOf(b.category);
        if (aIndex !== bIndex) return aIndex - bIndex;
        if (Number(b.is_featured) !== Number(a.is_featured)) return Number(b.is_featured) - Number(a.is_featured);
        return Number(b.rating || 0) - Number(a.rating || 0);
      })
      .slice(0, 3);

    res.json({
      success: true,
      categories,
      venues: rows.map((row) => normalizeVenueForResponse(row, { selectedDate: date }))
    });
  } catch (error) {
    console.error('Get venue suggestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue suggestions' });
  }
};

exports.bookVenue = async (req, res) => {
  let connection;
  try {
    const hostId = req.user.userId;
    const venueId = parseInt(req.body.venueId, 10);
    const eventDate = String(req.body.eventDate || '').trim();

    if (!Number.isFinite(venueId) || venueId <= 0 || !eventDate) {
      return res.status(400).json({
        success: false,
        message: 'Venue ID and event date are required'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const venue = await Venue.findById(venueId);
    if (!venue || !venue.is_available || venue.status !== 'approved') {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Venue is not available' });
    }

    const confirmedBookings = await VenueBooking.findByVenueAndDate(venueId, eventDate, ['accepted', 'confirmed'], connection);
    if (confirmedBookings.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({
        success: false,
        message: 'Venue is already booked on this date'
      });
    }

    const [blockedRows] = await connection.execute(
      `SELECT id
       FROM venue_availability_blocks
       WHERE venue_id = ?
         AND start_date <= ?
         AND end_date >= ?
       LIMIT 1`,
      [venueId, eventDate, eventDate]
    );
    if (blockedRows.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({
        success: false,
        message: 'Venue is unavailable on this date'
      });
    }

    const bookingId = await VenueBooking.create({
      venueId,
      hostId,
      eventDate,
      totalPrice: Number(venue.price_per_day || 0),
      status: 'pending',
      paymentStatus: 'unpaid'
    }, connection);

    await connection.commit();
    connection.release();
    connection = null;

    const booking = await VenueBooking.findById(bookingId);
    res.status(201).json({
      success: true,
      message: 'Venue booking created and pending payment',
      booking: normalizeVenueBooking(booking)
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Book venue error:', error);
    res.status(500).json({ success: false, message: 'Failed to create venue booking' });
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const rows = await VenueBooking.findByHost(req.user.userId);
    res.json({
      success: true,
      bookings: rows.map((row) => normalizeVenueBooking(row))
    });
  } catch (error) {
    console.error('Get my venue bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue bookings' });
  }
};

exports.confirmVenueBookingAfterPayment = confirmVenueBookingAfterPayment;
