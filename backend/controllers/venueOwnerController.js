/**
 * venueOwnerController.js
 *
 * All routes for authenticated venue owners (/api/venue-owner/*).
 * Every handler enforces that req.user.userId owns the requested venue/booking.
 */

const pool = require('../config/database');
const Venue = require('../models/Venue');
const VenueBooking = require('../models/VenueBooking');
const Notification = require('../models/Notification');
const {
  holdFundsForVenueOwner,
  refundHeldFundsToHost,
  getWalletOverview,
  roundMoney
} = require('../services/walletService');
const { cancelAndRefundVenueBooking } = require('../services/venueOwnerEscrowService');

// ── Helpers ────────────────────────────────────────────────────────────────

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

function normalizeVenueForOwner(venue) {
  if (!venue) return null;
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
    status: venue.status || 'pending_review',
    venueType: venue.venue_type || 'host_owned',
    contactPhone: venue.contact_phone || null,
    contactEmail: venue.contact_email || null,
    cancellationPolicy: venue.cancellation_policy || '',
    adminNotes: venue.admin_notes || null,
    upcomingBookings: Number(venue.upcoming_bookings || 0),
    totalEarned: Number(venue.total_earned || 0),
    totalHeld: Number(venue.total_held || 0),
    createdAt: venue.created_at
  };
}

function normalizeBookingForOwner(row) {
  return {
    id: row.id,
    venueId: row.venue_id,
    eventId: row.event_id,
    hostId: row.host_id,
    hostName: row.host_name || null,
    hostEmail: row.host_email || null,
    eventDate: row.event_date,
    totalPrice: Number(row.total_price || 0),
    status: row.status,
    paymentStatus: row.payment_status,
    eventTitle: row.event_title || null,
    eventType: row.event_type || null,
    guestCount: Number(row.guest_count || row.max_seats || 0),
    ownerNotes: row.owner_notes || null,
    respondedAt: row.responded_at || null,
    bookedAt: row.booked_at,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      address: row.venue_address,
      governorate: row.governorate,
      pricePerDay: Number(row.price_per_day || 0)
    }
  };
}

// ── Venue Submission ──────────────────────────────────────────────────────

exports.submitVenue = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const {
      name, description, governorate, address,
      latitude, longitude, category,
      totalCapacity, standardSeats, specialSeats, vipSeats,
      pricePerDay, pricePerHour, minHours,
      amenities, images,
      contactPhone, contactEmail, cancellationPolicy
    } = req.body;

    if (!name || !governorate || !address || !totalCapacity || !pricePerDay) {
      return res.status(400).json({
        success: false,
        message: 'name, governorate, address, totalCapacity, and pricePerDay are required'
      });
    }

    const venue = await Venue.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      governorate: String(governorate).trim(),
      address: String(address).trim(),
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      category: category || 'conference_hall',
      totalCapacity: Number(totalCapacity),
      standardSeats: Number(standardSeats || 0),
      specialSeats: Number(specialSeats || 0),
      vipSeats: Number(vipSeats || 0),
      pricePerDay: Number(pricePerDay),
      pricePerHour: pricePerHour != null ? Number(pricePerHour) : null,
      minHours: minHours != null ? Number(minHours) : 4,
      amenities: amenities ? JSON.stringify(parseJsonArray(amenities)) : null,
      images: images ? JSON.stringify(parseJsonArray(images)) : null,
      isFeatured: false,
      isAvailable: true,
      ownerId,
      status: 'pending_review',
      venueType: 'host_owned',
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      contactEmail: contactEmail ? String(contactEmail).trim() : null,
      cancellationPolicy: cancellationPolicy ? String(cancellationPolicy).trim() : null
    });

    await Notification.create(
      ownerId,
      'Venue Submitted for Review',
      `Your venue "${venue.name}" has been submitted and is pending admin review. We'll notify you once it's approved.`,
      'info'
    );

    res.status(201).json({
      success: true,
      message: 'Venue submitted for review. You will be notified once approved.',
      venue: normalizeVenueForOwner(venue)
    });
  } catch (error) {
    console.error('submitVenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit venue' });
  }
};

// ── My Venues ─────────────────────────────────────────────────────────────

exports.getMyVenues = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const rows = await Venue.findByOwnerId(ownerId);
    res.json({
      success: true,
      venues: rows.map(normalizeVenueForOwner)
    });
  } catch (error) {
    console.error('getMyVenues error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venues' });
  }
};

exports.updateMyVenue = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }
    if (['rejected', 'suspended'].includes(venue.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a ${venue.status} venue` });
    }

    // Guard: warn if trying to change price/policy with active bookings
    const hasPriceChange = req.body.pricePerDay != null && Number(req.body.pricePerDay) !== Number(venue.price_per_day);
    const hasPolicyChange = req.body.cancellationPolicy != null && req.body.cancellationPolicy !== venue.cancellation_policy;
    if ((hasPriceChange || hasPolicyChange) && await Venue.hasActiveBookings(venueId)) {
      return res.status(409).json({
        success: false,
        message: 'Cannot change price or cancellation policy while there are active bookings for this venue. Cancel or complete those bookings first.'
      });
    }

    const allowedUpdates = [
      'name', 'description', 'governorate', 'address', 'latitude', 'longitude',
      'category', 'totalCapacity', 'standardSeats', 'specialSeats', 'vipSeats',
      'pricePerDay', 'pricePerHour', 'minHours', 'amenities', 'images',
      'isAvailable', 'contactPhone', 'contactEmail', 'cancellationPolicy'
    ];

    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // If editing after rejection/changes_requested, resubmit for review
    if (['rejected', 'changes_requested'].includes(venue.status)) {
      updates.status = 'pending_review';
    }

    const updated = await Venue.update(venueId, updates);
    res.json({ success: true, venue: normalizeVenueForOwner(updated) });
  } catch (error) {
    console.error('updateMyVenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to update venue' });
  }
};

// ── Booking Requests ──────────────────────────────────────────────────────

exports.getBookingRequests = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const rows = await VenueBooking.findPendingForOwner(ownerId);
    res.json({
      success: true,
      bookingRequests: rows.map(normalizeBookingForOwner)
    });
  } catch (error) {
    console.error('getBookingRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to load booking requests' });
  }
};

exports.acceptBookingRequest = async (req, res) => {
  let connection;
  try {
    const ownerId = req.user.userId;
    const bookingId = parseInt(req.params.id, 10);

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await VenueBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.venue_owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'This booking is not for your venue' });
    }
    if (booking.status !== 'pending_venue_response') {
      return res.status(400).json({
        success: false,
        message: `Booking is in status '${booking.status}' and cannot be accepted`
      });
    }

    const venuePrice = roundMoney(booking.total_price || 0) || 0;
    const isVenueFeeAlreadyPaid = String(booking.payment_status || '').toLowerCase() === 'paid';

    if (!isVenueFeeAlreadyPaid) {
      // Check host has sufficient wallet balance
      const [hostRows] = await pool.execute(
        'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
        [booking.host_id]
      );
      const hostBalance = roundMoney(hostRows[0]?.wallet_balance || 0) || 0;

      if (hostBalance < venuePrice) {
        return res.status(400).json({
          success: false,
          message: `The host's wallet balance (${hostBalance.toFixed(2)} EGP) is insufficient for this venue fee (${venuePrice.toFixed(2)} EGP). The host needs to top up their wallet.`
        });
      }
    }

    // Check for conflicting accepted bookings on the same date (prevent double-book)
    const conflicts = await VenueBooking.findByVenueAndDate(
      booking.venue_id,
      booking.event_date,
      ['accepted', 'confirmed']
    );
    if (conflicts.some((c) => c.id !== bookingId)) {
      return res.status(409).json({
        success: false,
        message: 'Venue is already booked on this date by another event'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Accept the booking
    await VenueBooking.update(bookingId, {
      status: 'accepted',
      paymentStatus: 'paid',
      respondedAt: new Date().toISOString()
    }, connection);

    // 2. Hold funds: debit host → credit venue owner frozen_balance
    if (!isVenueFeeAlreadyPaid && venuePrice > 0) {
      await holdFundsForVenueOwner({
        hostId: booking.host_id,
        venueOwnerId: ownerId,
        amount: venuePrice,
        venueBookingId: bookingId,
        eventId: booking.event_id,
        description: `Venue booking payment for "${booking.venue_name}" on ${booking.event_date} (held in escrow)`,
        conn: connection
      });
    }

    await connection.commit();
    connection.release();
    connection = null;

    // Notify host
    await Notification.create(
      booking.host_id,
      'Venue Booking Accepted!',
      `Your booking request for "${booking.venue_name}" on ${booking.event_date} has been accepted. ${isVenueFeeAlreadyPaid ? 'The venue fee was already paid during event publishing.' : (venuePrice > 0 ? `${venuePrice.toFixed(2)} EGP has been deducted from your wallet (held in escrow until the event).` : '')}`,
      'success',
      'bookingConfirmations'
    );

    const updated = await VenueBooking.findById(bookingId);
    res.json({
      success: true,
      message: 'Booking accepted. Funds are held in escrow until the event.',
      booking: normalizeBookingForOwner(updated)
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('acceptBookingRequest error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to accept booking' });
  }
};

exports.declineBookingRequest = async (req, res) => {
  let connection;
  try {
    const ownerId = req.user.userId;
    const bookingId = parseInt(req.params.id, 10);
    const ownerNotes = String(req.body.reason || req.body.ownerNotes || '').trim();

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await VenueBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.venue_owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'This booking is not for your venue' });
    }
    if (booking.status !== 'pending_venue_response') {
      return res.status(400).json({
        success: false,
        message: `Booking is in status '${booking.status}' and cannot be declined`
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await VenueBooking.update(bookingId, {
      status: 'declined',
      respondedAt: new Date().toISOString(),
      ownerNotes: ownerNotes || null
    }, connection);

    await connection.commit();
    connection.release();
    connection = null;

    // Notify host
    await Notification.create(
      booking.host_id,
      'Venue Booking Declined',
      `Your booking request for "${booking.venue_name}" on ${booking.event_date} was declined${ownerNotes ? `: "${ownerNotes}"` : '.'}  Please choose a different venue.`,
      'warning',
      'eventCancellationAlerts'
    );

    const updated = await VenueBooking.findById(bookingId);
    res.json({
      success: true,
      message: 'Booking declined.',
      booking: normalizeBookingForOwner(updated)
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('declineBookingRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline booking' });
  }
};

// ── Upcoming Bookings ─────────────────────────────────────────────────────

exports.getUpcomingBookings = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const rows = await VenueBooking.findUpcomingForOwner(ownerId);
    res.json({
      success: true,
      bookings: rows.map(normalizeBookingForOwner)
    });
  } catch (error) {
    console.error('getUpcomingBookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load upcoming bookings' });
  }
};

// ── Wallet ────────────────────────────────────────────────────────────────

exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.userId;
    const filter = req.query.type || req.query.filter || 'all';
    const wallet = await getWalletOverview(userId, filter);
    res.json({
      success: true,
      balance: wallet.balance,
      frozenBalance: wallet.frozenBalance,
      filter: wallet.filter,
      transactions: wallet.transactions
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.error('venueOwner getWallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wallet data' });
  }
};

// ── Analytics ─────────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const [statsRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT vb.id) AS total_bookings,
         SUM(CASE WHEN vb.status IN ('accepted','confirmed') THEN 1 ELSE 0 END) AS active_bookings,
         SUM(CASE WHEN vb.status = 'declined' OR vb.status = 'declined_auto_expired' THEN 1 ELSE 0 END) AS declined_bookings,
         SUM(CASE WHEN vb.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
         COALESCE(SUM(CASE WHEN vb.status IN ('accepted','confirmed') THEN vb.total_price ELSE 0 END), 0) AS gross_value
       FROM venue_bookings vb
       INNER JOIN venues v ON v.id = vb.venue_id AND v.owner_id = ?`,
      [ownerId]
    );

    const [walletRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN wt.status = 'available' THEN wt.amount ELSE 0 END), 0) AS total_earned,
         COALESCE(SUM(CASE WHEN wt.status = 'held' THEN wt.amount ELSE 0 END), 0) AS total_held
       FROM wallet_transactions wt
       WHERE wt.user_id = ?
         AND wt.type = 'credit'
         AND wt.source = 'venue-booking'`,
      [ownerId]
    );

    const [venueCountRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_venues,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_venues,
         SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending_venues
       FROM venues WHERE owner_id = ?`,
      [ownerId]
    );

    const stats = statsRows[0] || {};
    const walletStats = walletRows[0] || {};
    const venueStats = venueCountRows[0] || {};

    res.json({
      success: true,
      analytics: {
        venues: {
          total: Number(venueStats.total_venues || 0),
          approved: Number(venueStats.approved_venues || 0),
          pending: Number(venueStats.pending_venues || 0)
        },
        bookings: {
          total: Number(stats.total_bookings || 0),
          active: Number(stats.active_bookings || 0),
          declined: Number(stats.declined_bookings || 0),
          cancelled: Number(stats.cancelled_bookings || 0),
          grossValue: Number(stats.gross_value || 0)
        },
        wallet: {
          totalEarned: Number(walletStats.total_earned || 0),
          totalHeld: Number(walletStats.total_held || 0)
        }
      }
    });
  } catch (error) {
    console.error('venueOwner getAnalytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to load analytics' });
  }
};

// ── Availability Blocks ───────────────────────────────────────────────────

exports.addAvailabilityBlock = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);
    const { startDate, endDate, reason } = req.body;

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    const block = await Venue.createAvailabilityBlock({
      venueId,
      startDate,
      endDate,
      reason: reason || null,
      createdBy: ownerId
    });

    res.status(201).json({ success: true, block });
  } catch (error) {
    console.error('addAvailabilityBlock error:', error);
    res.status(500).json({ success: false, message: 'Failed to add availability block' });
  }
};

exports.getAvailabilityBlocks = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    const blocks = await Venue.getAvailabilityBlocks(venueId);
    res.json({
      success: true,
      blocks: blocks.map((block) => ({
        id: block.id,
        venueId: block.venue_id,
        startDate: block.start_date,
        endDate: block.end_date,
        reason: block.reason || '',
        createdAt: block.created_at
      }))
    });
  } catch (error) {
    console.error('getAvailabilityBlocks error:', error);
    res.status(500).json({ success: false, message: 'Failed to load availability blocks' });
  }
};

exports.deleteAvailabilityBlock = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);
    const blockId = parseInt(req.params.blockId, 10);

    if (!Number.isFinite(venueId) || !Number.isFinite(blockId)) {
      return res.status(400).json({ success: false, message: 'Invalid venue or block ID' });
    }

    // Verify ownership
    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Verify block belongs to this venue
    const [blockRows] = await pool.execute(
      'SELECT id FROM venue_availability_blocks WHERE id = ? AND venue_id = ?',
      [blockId, venueId]
    );
    if (!blockRows.length) {
      return res.status(404).json({ success: false, message: 'Availability block not found' });
    }

    const deleted = await Venue.deleteAvailabilityBlock(blockId);
    res.json({ success: deleted, message: deleted ? 'Block removed' : 'Block not found' });
  } catch (error) {
    console.error('deleteAvailabilityBlock error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete availability block' });
  }
};

// ── Cancel a booking (from venue owner side) ──────────────────────────────

exports.cancelBooking = async (req, res) => {
  let connection;
  try {
    const ownerId = req.user.userId;
    const bookingId = parseInt(req.params.id, 10);

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await VenueBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.venue_owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'This booking is not for your venue' });
    }
    if (['cancelled', 'declined', 'declined_auto_expired'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const result = await cancelAndRefundVenueBooking({
      venueBookingId: bookingId,
      hostId: booking.host_id,
      forceFullRefund: true,
      connection
    });

    await connection.commit();
    connection.release();
    connection = null;

    // Notify host
    if (booking.host_id) {
      await Notification.create(
        booking.host_id,
        'Venue Booking Cancelled',
        `The venue owner cancelled the booking for "${booking.venue_name}" on ${booking.event_date}.${result.refundAmount > 0 ? ` A refund of ${result.refundAmount.toFixed(2)} EGP has been credited to your wallet.` : ''}`,
        'warning',
        'refundNotifications'
      );
    }

    res.json({
      success: true,
      message: 'Booking cancelled.' + (result.refundAmount > 0 ? ` Refund of ${result.refundAmount.toFixed(2)} EGP issued to host.` : ''),
      refundAmount: result.refundAmount
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('venueOwner cancelBooking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  }
};

// ── Reviews for owner's venues ────────────────────────────────────────────

exports.getMyReviews = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const [rows] = await pool.execute(
      `SELECT vr.*, v.name AS venue_name, u.full_name AS reviewer_name
       FROM venue_reviews vr
       INNER JOIN venues v ON v.id = vr.venue_id AND v.owner_id = ?
       LEFT JOIN users u ON u.id = vr.user_id
       ORDER BY vr.created_at DESC`,
      [ownerId]
    );
    res.json({ success: true, reviews: rows });
  } catch (error) {
    console.error('getMyReviews error:', error);
    res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
};
