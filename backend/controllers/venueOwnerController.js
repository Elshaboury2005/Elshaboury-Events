/**
 * venueOwnerController.js
 *
 * All routes for authenticated venue owners (/api/venue-owner/*).
 * Every handler enforces that req.user.userId owns the requested venue/booking.
 */

const pool = require('../config/database');
const Venue = require('../models/Venue');
const { createVenueBookingChat } = require('../services/directChatService');
const VenueBooking = require('../models/VenueBooking');
const Notification = require('../models/Notification');
const {
  holdFundsForVenueOwner,
  refundHeldFundsToHost,
  getWalletOverview,
  roundMoney,
  debitWallet,
  creditWallet
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
    contactPhone: venue.contact_phone || '',
    contactEmail: venue.contact_email || '',
    cancellationPolicy: venue.cancellation_policy || '',
    adminNotes: venue.admin_notes || '',
    upcomingBookings: Number(venue.upcoming_bookings || 0),
    totalEarned: Number(venue.total_earned || 0),
    totalHeld: Number(venue.total_held || 0),
    createdAt: venue.created_at,
    rules: venue.rules || '',
    parkingDetails: venue.parking_details || '',
    cateringPolicy: venue.catering_policy || 'allowed',
    decorationPolicy: venue.decoration_policy || 'allowed',
    musicPolicy: venue.music_policy || 'allowed',
    setupTimeHours: Number(venue.setup_time_hours || 1),
    cleanupTimeHours: Number(venue.cleanup_time_hours || 1),
    minBookingHours: Number(venue.min_booking_hours || 4),
    maxConsecutiveDays: Number(venue.max_consecutive_days || 1),
    floorPlanImage: venue.floor_plan_image || '',
    virtualTourUrl: venue.virtual_tour_url || ''
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
    pendingVenueFee: Number(row.pending_venue_fee || 0),
    pendingPlatformFee: Number(row.pending_platform_fee || 0),
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
      contactPhone, contactEmail, cancellationPolicy,
      // New fields
      rules, parkingDetails, cateringPolicy, decorationPolicy, musicPolicy,
      setupTimeHours, cleanupTimeHours, minBookingHours, maxConsecutiveDays,
      floorPlanImage, virtualTourUrl
    } = req.body;

    // ── Basic required fields ──────────────────────────────────────────────
    if (!name || !governorate || !address || !pricePerDay) {
      return res.status(400).json({
        success: false,
        message: 'name, governorate, address, and pricePerDay are required'
      });
    }

    // ── Strict seat validation: all four values required, whole positive integers ──
    const cap = Number(totalCapacity);
    const std = Number(standardSeats);
    const spc = Number(specialSeats);
    const vip = Number(vipSeats);

    if (!Number.isInteger(cap) || cap <= 0) {
      return res.status(400).json({ success: false, message: 'totalCapacity must be a positive whole number' });
    }
    if (!Number.isInteger(std) || std <= 0) {
      return res.status(400).json({ success: false, message: 'standardSeats must be a positive whole number' });
    }
    if (!Number.isInteger(spc) || spc <= 0) {
      return res.status(400).json({ success: false, message: 'specialSeats must be a positive whole number' });
    }
    if (!Number.isInteger(vip) || vip <= 0) {
      return res.status(400).json({ success: false, message: 'vipSeats must be a positive whole number' });
    }
    if (std + spc + vip !== cap) {
      return res.status(400).json({
        success: false,
        message: `Standard seats + Special seats + VIP seats must equal total capacity exactly. Got ${std + spc + vip}, expected ${cap}.`
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
      totalCapacity: cap,
      standardSeats: std,
      specialSeats: spc,
      vipSeats: vip,
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
      cancellationPolicy: cancellationPolicy ? String(cancellationPolicy).trim() : null,
      // New fields
      rules: rules ? String(rules).trim() : null,
      parkingDetails: parkingDetails ? String(parkingDetails).trim() : null,
      cateringPolicy: cateringPolicy || 'allowed',
      decorationPolicy: decorationPolicy || 'allowed',
      musicPolicy: musicPolicy || 'allowed',
      setupTimeHours: setupTimeHours != null ? Number(setupTimeHours) : 1,
      cleanupTimeHours: cleanupTimeHours != null ? Number(cleanupTimeHours) : 1,
      minBookingHours: minBookingHours != null ? Number(minBookingHours) : 4,
      maxConsecutiveDays: maxConsecutiveDays != null ? Number(maxConsecutiveDays) : 1,
      floorPlanImage: floorPlanImage ? String(floorPlanImage).trim() : null,
      virtualTourUrl: virtualTourUrl ? String(virtualTourUrl).trim() : null
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

    // ── Strict seat validation when any seat field is being updated ──────────
    // If ANY of the four seat/capacity fields is provided, ALL four must be provided and valid.
    const seatFieldsProvided = [
      req.body.totalCapacity, req.body.standardSeats,
      req.body.specialSeats, req.body.vipSeats
    ].some(v => v !== undefined);

    if (seatFieldsProvided) {
      // Fall back to existing venue values for any field not provided
      const cap = Number(req.body.totalCapacity !== undefined ? req.body.totalCapacity : venue.total_capacity);
      const std = Number(req.body.standardSeats !== undefined ? req.body.standardSeats : venue.standard_seats);
      const spc = Number(req.body.specialSeats !== undefined ? req.body.specialSeats : venue.special_seats);
      const vip = Number(req.body.vipSeats !== undefined ? req.body.vipSeats : venue.vip_seats);

      if (!Number.isInteger(cap) || cap <= 0) {
        return res.status(400).json({ success: false, message: 'totalCapacity must be a positive whole number' });
      }
      if (!Number.isInteger(std) || std <= 0) {
        return res.status(400).json({ success: false, message: 'standardSeats must be a positive whole number' });
      }
      if (!Number.isInteger(spc) || spc <= 0) {
        return res.status(400).json({ success: false, message: 'specialSeats must be a positive whole number' });
      }
      if (!Number.isInteger(vip) || vip <= 0) {
        return res.status(400).json({ success: false, message: 'vipSeats must be a positive whole number' });
      }
      if (std + spc + vip !== cap) {
        return res.status(400).json({
          success: false,
          message: `Standard seats + Special seats + VIP seats must equal total capacity exactly. Got ${std + spc + vip}, expected ${cap}.`
        });
      }
    }

    const allowedUpdates = [
      'name', 'description', 'governorate', 'address', 'latitude', 'longitude',
      'category', 'totalCapacity', 'standardSeats', 'specialSeats', 'vipSeats',
      'pricePerDay', 'pricePerHour', 'minHours', 'amenities', 'images',
      'isAvailable', 'contactPhone', 'contactEmail', 'cancellationPolicy',
      'rules', 'parkingDetails', 'cateringPolicy', 'decorationPolicy', 'musicPolicy',
      'setupTimeHours', 'cleanupTimeHours', 'minBookingHours', 'maxConsecutiveDays',
      'floorPlanImage', 'virtualTourUrl'
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
    if (booking.status !== 'pending_venue_response' && booking.status !== 'awaiting_dual_approval') {
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
      status: 'accepted_by_owner',
      paymentStatus: 'paid',
      respondedAt: new Date().toISOString()
    }, connection);

    // 2. Hold funds: debit host → credit venue owner frozen_balance (only for old legacy flows)
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

    // Run check and transfer escrow funds check (wrapped in try-catch as required)
    try {
      const { checkAndTransferVenuePayment } = require('../services/venueOwnerEscrowService');
      await checkAndTransferVenuePayment(bookingId);
    } catch (err) {
      console.error('Failed checkAndTransferVenuePayment in acceptBookingRequest:', err);
    }

    // Notify host
    await Notification.create(
      booking.host_id,
      'Venue Booking Accepted!',
      `Your booking request for "${booking.venue_name}" on ${booking.event_date} has been accepted. ${isVenueFeeAlreadyPaid ? 'The venue fee was already paid during event publishing.' : (venuePrice > 0 ? `${venuePrice.toFixed(2)} EGP has been deducted from your wallet (held in escrow until the event).` : '')}`,
      'success',
      'bookingConfirmations'
    );

    // Check if event is approved, if so, create chat and send chat notifications
    const [events] = await pool.execute('SELECT event_status FROM events WHERE id = ?', [booking.event_id]);
    if (events[0] && events[0].event_status === 'approved') {
      await createVenueBookingChat(bookingId, booking.host_id, ownerId);

      await Notification.create(
        booking.host_id,
        'Direct Chat Available',
        'Your venue booking is confirmed — you can now chat with the venue owner',
        'info'
      );

      await Notification.create(
        ownerId,
        'Direct Chat Available',
        'Booking confirmed — you can now chat with the event host',
        'info'
      );
    }

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
    if (booking.status !== 'pending_venue_response' && booking.status !== 'awaiting_dual_approval') {
      return res.status(400).json({
        success: false,
        message: `Booking is in status '${booking.status}' and cannot be declined`
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check parent event status
    const [[parentEvent]] = await connection.execute(
      'SELECT event_status FROM events WHERE id = ? LIMIT 1',
      [booking.event_id]
    );

    const isEventApproved = parentEvent && parentEvent.event_status === 'approved';

    // If parent event is approved, set event status to pending_venue.
    // Under the new rules, we do NOT refund anything at this point. The host's payment is held.
    if (isEventApproved) {
      await connection.execute(
        "UPDATE events SET event_status = 'pending_venue' WHERE id = ?",
        [booking.event_id]
      );
    }

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
      `Your venue booking for "${booking.venue_name}" was declined by the venue owner. Please select a new venue for your event from your event details page. Your previous venue payment will be applied to your new venue selection.`,
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

exports.getBookingHistory = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const rows = await VenueBooking.findHistoryForOwner(ownerId);
    res.json({
      success: true,
      bookings: rows.map(normalizeBookingForOwner)
    });
  } catch (error) {
    console.error('getBookingHistory error:', error);
    res.status(500).json({ success: false, message: 'Failed to load booking history' });
  }
};

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

exports.withdrawWallet = async (req, res) => {
  let connection;
  try {
    const userId = req.user.userId;
    const amount = roundMoney(req.body.amount);
    const cardLast4 = String(req.body.cardLast4 || '').replace(/\D/g, '').slice(-4);
    const note = String(req.body.note || '').trim();

    if (amount == null || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal amount must be a positive number'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const descriptionParts = [`Venue owner withdrawal of ${amount.toFixed(2)} EGP`];
    if (cardLast4) descriptionParts.push(`to card ending in ${cardLast4}`);
    if (note) descriptionParts.push(`- ${note}`);

    const result = await debitWallet({
      userId,
      amount,
      source: 'withdrawal',
      description: descriptionParts.join(' '),
      conn: connection
    });

    await connection.commit();
    connection.release();
    connection = null;

    res.status(201).json({
      success: true,
      message: 'Withdrawal completed successfully',
      balance: result.newBalance,
      walletTransaction: {
        id: result.transactionId,
        amount,
        type: 'debit',
        source: 'withdrawal',
        status: 'available'
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    if (error.message === 'User not found') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (error.message === 'Insufficient wallet balance') {
      return res.status(400).json({ success: false, message: 'Withdrawal amount exceeds available wallet balance' });
    }
    console.error('venueOwner withdrawWallet error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to withdraw wallet balance' });
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
    const { blockType, date, weekday, reason } = req.body;

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!['specific_date', 'recurring_weekday'].includes(blockType)) {
      return res.status(400).json({ success: false, message: 'Invalid blockType' });
    }

    if (blockType === 'specific_date') {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required for specific_date blocks' });
      }
      if (new Date(date) < new Date(new Date().setHours(0, 0, 0, 0))) {
        return res.status(400).json({ success: false, message: 'Cannot block past dates' });
      }
    } else if (blockType === 'recurring_weekday') {
      if (weekday === undefined || weekday === null || !Number.isInteger(Number(weekday)) || Number(weekday) < 0 || Number(weekday) > 6) {
        return res.status(400).json({ success: false, message: 'Valid weekday (0-6) is required for recurring_weekday blocks' });
      }
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Check for duplicates
    const [existing] = await pool.execute(
      `SELECT id FROM venue_availability_blocks WHERE venue_id = ? AND block_type = ? AND (date = ? OR weekday = ?) AND is_active = TRUE`,
      [venueId, blockType, date || null, weekday != null ? weekday : null]
    );
    res.status(201).json({ success: true, blockId: result.insertId });
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

    const [blocks] = await pool.execute(
      `SELECT id, block_type, date, weekday, is_active, reason, created_at FROM venue_availability_blocks WHERE venue_id = ?`,
      [venueId]
    );

    const specificDates = blocks
      .filter(b => b.block_type === 'specific_date')
      .map(b => ({
        id: b.id,
        date: String(b.date).slice(0, 10),
        isActive: Boolean(b.is_active),
        reason: b.reason || '',
        createdAt: b.created_at
      }));

    const recurringWeekdays = blocks
      .filter(b => b.block_type === 'recurring_weekday')
      .map(b => ({
        id: b.id,
        weekday: b.weekday,
        isActive: Boolean(b.is_active),
        reason: b.reason || '',
        createdAt: b.created_at
      }));

    res.json({
      success: true,
      specificDates,
      recurringWeekdays
    });
  } catch (error) {
    console.error('getAvailabilityBlocks error:', error);
    res.status(500).json({ success: false, message: 'Failed to load availability blocks' });
  }
};

exports.toggleAvailabilityBlock = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);
    const blockId = parseInt(req.params.blockId, 10);

    if (!Number.isFinite(venueId) || !Number.isFinite(blockId)) {
      return res.status(400).json({ success: false, message: 'Invalid venue or block ID' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    const [blocks] = await pool.execute(`SELECT is_active FROM venue_availability_blocks WHERE id = ? AND venue_id = ?`, [blockId, venueId]);
    if (blocks.length === 0) {
      return res.status(404).json({ success: false, message: 'Availability block not found' });
    }

    const newStatus = !blocks[0].is_active;

    await pool.execute(`UPDATE venue_availability_blocks SET is_active = ? WHERE id = ?`, [newStatus, blockId]);
    res.json({ success: true, message: 'Block toggled successfully', isActive: newStatus });
  } catch (error) {
    console.error('toggleAvailabilityBlock error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle availability block' });
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

// ── Venue Bookings Table (full all-status booking list for a specific venue) ─

exports.getVenueBookingsTable = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    // Ownership check
    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    const statusFilter = req.query.status || 'all';

    let whereClause = 'WHERE vb.venue_id = ?';
    const queryParams = [venueId];

    if (statusFilter !== 'all') {
      whereClause += ' AND vb.status = ?';
      queryParams.push(statusFilter);
    }

    const [rows] = await pool.execute(
      `SELECT
         vb.id,
         vb.status,
         vb.payment_status,
         vb.event_date,
         vb.total_price,
         vb.pending_venue_fee,
         vb.pending_platform_fee,
         vb.booked_at,
         vb.responded_at,
         vb.owner_notes,
         e.id AS event_id,
         e.title AS event_title,
         e.event_type,
         e.category AS event_category,
         e.max_seats AS expected_guest_count,
         e.description AS event_description,
         e.agenda AS event_agenda,
         e.event_date AS event_start_datetime,
         u.id AS host_id,
         u.full_name AS host_full_name,
         u.email AS host_email,
          NULL AS host_profile_photo
       FROM venue_bookings vb
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       ${whereClause}
       ORDER BY vb.booked_at DESC, vb.id DESC`,
      queryParams
    );

    const bookings = rows.map((row) => ({
      id: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      eventDate: row.event_date,
      venueFeeAmount: Number(row.pending_venue_fee || 0),
      platformFeeAmount: Number(row.pending_platform_fee || 0),
      totalPrice: Number(row.total_price || 0),
      createdAt: row.booked_at,
      respondedAt: row.responded_at || null,
      ownerNotes: row.owner_notes || null,
      host: {
        id: row.host_id,
        name: row.host_full_name || null,
        email: row.host_email || null,
        profilePhoto: row.host_profile_photo || null
      },
      event: {
        id: row.event_id,
        title: row.event_title || null,
        type: row.event_type || null,
        category: row.event_category || null,
        expectedGuestCount: Number(row.expected_guest_count || 0),
        description: row.event_description || null,
        agenda: row.event_agenda || null,
        startDatetime: row.event_start_datetime || null
      }
    }));

    res.json({ success: true, venueId, bookings });
  } catch (error) {
    console.error('getVenueBookingsTable error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue bookings' });
  }
};

// ── Single Booking Details (for details modal) ────────────────────────────

exports.getBookingDetails = async (req, res) => {
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

    // Fetch additional event/host details not in VenueBooking.findById
    const [eventRows] = await pool.execute(
      `SELECT e.id, e.title, e.event_type, e.category, e.max_seats, e.description, e.agenda, e.event_date
       FROM events e WHERE e.id = ? LIMIT 1`,
      [booking.event_id]
    );
    const event = eventRows[0] || null;

    const [hostRows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.phone_number, NULL AS profile_photo
       FROM users u WHERE u.id = ? LIMIT 1`,
      [booking.host_id]
    );
    const host = hostRows[0] || null;

    let previousBookingsCount = 0;
    let averageRating = null;

    if (host) {
      const [bookingsCountRows] = await pool.execute(
        `SELECT COUNT(*) AS count FROM venue_bookings
         WHERE host_id = ? AND status IN ('accepted', 'confirmed', 'accepted_by_owner')`,
        [host.id]
      );
      previousBookingsCount = bookingsCountRows[0]?.count || 0;

      const [ratingRows] = await pool.execute(
        `SELECT AVG(er.rating) AS avg_rating FROM event_reviews er
         JOIN events e ON e.id = er.event_id
         WHERE e.organizer_id = ?`,
        [host.id]
      );
      averageRating = ratingRows[0]?.avg_rating != null ? Number(Number(ratingRows[0].avg_rating).toFixed(1)) : null;
    }

    res.json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.payment_status,
        eventDate: booking.event_date,
        venueFeeAmount: Number(booking.pending_venue_fee || 0),
        platformFeeAmount: Number(booking.pending_platform_fee || 0),
        totalPrice: Number(booking.total_price || 0),
        ownerNotes: booking.owner_notes || null,
        respondedAt: booking.responded_at || null,
        createdAt: booking.booked_at
      },
      venue: {
        id: booking.venue_id,
        name: booking.venue_name,
        address: booking.venue_address,
        governorate: booking.governorate,
        pricePerDay: Number(booking.price_per_day || 0)
      },
      host: host ? {
        id: host.id,
        name: host.full_name,
        email: host.email,
        phone: host.phone_number || null,
        profilePhoto: host.profile_photo || null,
        previousBookingsCount,
        averageRating
      } : null,
      event: event ? {
        id: event.id,
        title: event.title,
        type: event.event_type,
        category: event.category,
        expectedGuestCount: Number(event.max_seats || 0),
        description: event.description || null,
        agenda: event.agenda || null,
        startDatetime: event.event_date || null
      } : null
    });
  } catch (error) {
    console.error('getBookingDetails error:', error);
    res.status(500).json({ success: false, message: 'Failed to load booking details' });
  }
};

// ── Venue Timeline (calendar array of booked dates, for double-booking UI) ─

exports.getVenueTimeline = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }

    // Ownership check
    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Fetch all non-cancelled, non-declined bookings
    const [rows] = await pool.execute(
      `SELECT
         vb.id,
         vb.event_date,
         vb.status,
         e.title AS event_title,
         u.full_name AS host_name
       FROM venue_bookings vb
       LEFT JOIN events e ON e.id = vb.event_id
       LEFT JOIN users u ON u.id = vb.host_id
       WHERE vb.venue_id = ?
         AND vb.status NOT IN ('cancelled', 'declined', 'declined_auto_expired', 'refunded')
       ORDER BY vb.event_date ASC`,
      [venueId]
    );

    const formatDate = (d) => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    };

    const timeline = rows.map((row) => ({
      bookingId: row.id,
      date: formatDate(row.event_date),
      status: row.status,
      eventTitle: row.event_title || null,
      hostName: row.host_name || null,
      isBlocked: ['accepted', 'accepted_by_owner', 'confirmed'].includes(row.status),
      isPending: ['pending_venue_response', 'awaiting_dual_approval', 'awaiting_event_approval'].includes(row.status)
    }));

    // Also include manual availability blocks
    const [blockRows] = await pool.execute(
      `SELECT id, block_type, date, weekday, is_active, reason, created_at
       FROM venue_availability_blocks
       WHERE venue_id = ? AND is_active = TRUE`,
      [venueId]
    );

    const availabilityBlocks = blockRows.map((b) => ({
      blockId: b.id,
      blockType: b.block_type,
      date: b.date ? formatDate(b.date) : null,
      weekday: b.weekday,
      reason: b.reason || null
    }));

    res.json({
      success: true,
      venueId,
      venueName: venue.name,
      timeline,
      availabilityBlocks
    });
  } catch (error) {
    console.error('getVenueTimeline error:', error);
    res.status(500).json({ success: false, message: 'Failed to load venue timeline' });
  }
};

// ── Check venue availability for a specific date (public-facing) ──────────

exports.checkVenueAvailability = async (req, res) => {
  try {
    const venueId = parseInt(req.params.id, 10);
    const { date } = req.query;

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date query parameter is required (YYYY-MM-DD)' });
    }

    // Check confirmed/accepted bookings on this date
    const conflicts = await VenueBooking.findByVenueAndDate(
      venueId,
      date,
      ['accepted', 'confirmed', 'accepted_by_owner']
    );

    // Check manual availability blocks
    const [blockRows] = await pool.execute(
      `SELECT id, reason
       FROM venue_availability_blocks
       WHERE venue_id = ?
         AND is_active = TRUE
         AND (
           (block_type = 'specific_date' AND date = ?) OR
           (block_type = 'recurring_weekday' AND weekday = (DAYOFWEEK(?) - 1))
         )`,
      [venueId, date, date]
    );

    const isBookedByEvent = conflicts.length > 0;
    const isBlockedManually = blockRows.length > 0;
    const isAvailable = !isBookedByEvent && !isBlockedManually;

    res.json({
      success: true,
      venueId,
      date,
      isAvailable,
      isBookedByEvent,
      isBlockedManually,
      conflictingBookingCount: conflicts.length,
      conflictingBlock: isBlockedManually ? {
        reason: blockRows[0].reason || null
      } : null
    });
  } catch (error) {
    console.error('checkVenueAvailability error:', error);
    res.status(500).json({ success: false, message: 'Failed to check venue availability' });
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

// ── Seat status tracker for venue owner ───────────────────────────────

exports.getEventSeatsStatus = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.id, 10);
    const eventId = req.params.eventId;

    if (!Number.isFinite(venueId) || venueId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID' });
    }
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'Event ID is required' });
    }

    // Ownership check
    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    if (venue.owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own this venue' });
    }

    // Verify the event has a confirmed venue booking at this venue
    const [bookingRows] = await pool.execute(
      `SELECT id FROM venue_bookings
       WHERE venue_id = ? AND event_id = ? AND status = 'confirmed'
       LIMIT 1`,
      [venueId, eventId]
    );
    if (bookingRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No confirmed booking found for this event at this venue.' });
    }

    // Fetch all bookings for this event (not cancelled)
    const [rows] = await pool.execute(
      `SELECT id, ticket_type, seat_number, seat_numbers, status, created_at
       FROM bookings
       WHERE event_id = ? AND status != 'cancelled'`,
      [eventId]
    );

    const individualBookedSeats = [];
    const counts = { Standard: 0, Special: 0, Vip: 0 };

    rows.forEach((row) => {
      const category = (row.ticket_type || 'Standard').charAt(0).toUpperCase() + (row.ticket_type || 'Standard').slice(1).toLowerCase();
      
      const str = row.seat_numbers;
      let seatList = [];
      if (str && typeof str === 'string') {
        seatList = str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      } else {
        const singleSeat = parseInt(row.seat_number, 10);
        if (!isNaN(singleSeat) && singleSeat > 0) {
          seatList = [singleSeat];
        } else {
          seatList = [1];
        }
      }

      seatList.forEach(seatNum => {
        individualBookedSeats.push({
          seatNumber: seatNum,
          category,
          status: row.status,
          bookedAt: row.created_at
        });
        if (counts[category] !== undefined) {
          counts[category]++;
        }
      });
    });

    const totalStandard = venue.standard_seats || 0;
    const totalSpecial = venue.special_seats || 0;
    const totalVip = venue.vip_seats || 0;

    const bookedStandard = counts.Standard;
    const bookedSpecial = counts.Special;
    const bookedVip = counts.Vip;

    const availStandard = Math.max(0, totalStandard - bookedStandard);
    const availSpecial = Math.max(0, totalSpecial - bookedSpecial);
    const availVip = Math.max(0, totalVip - bookedVip);

    const percentStandard = totalStandard > 0 ? Math.round((bookedStandard / totalStandard) * 100) : 0;
    const percentSpecial = totalSpecial > 0 ? Math.round((bookedSpecial / totalSpecial) * 100) : 0;
    const percentVip = totalVip > 0 ? Math.round((bookedVip / totalVip) * 100) : 0;

    const totalCapacity = totalStandard + totalSpecial + totalVip;
    const totalBooked = bookedStandard + bookedSpecial + bookedVip;
    const percentOverall = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

    res.json({
      success: true,
      venueId,
      eventId,
      seatCounts: {
        Standard: { total: totalStandard, booked: bookedStandard, available: availStandard, percentage: percentStandard },
        Special: { total: totalSpecial, booked: bookedSpecial, available: availSpecial, percentage: percentSpecial },
        Vip: { total: totalVip, booked: bookedVip, available: availVip, percentage: percentVip }
      },
      overall: {
        total: totalCapacity,
        booked: totalBooked,
        available: Math.max(0, totalCapacity - totalBooked),
        percentage: percentOverall
      },
      bookedSeats: individualBookedSeats
    });
  } catch (error) {
    console.error('getEventSeatsStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to load seat status' });
  }
};

// ── Book seat in event as a regular attendee for venue owner ──────────────

exports.bookSeat = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { eventId, seatCategory } = req.body;

    if (!eventId || !seatCategory) {
      return res.status(400).json({ success: false, message: 'eventId and seatCategory are required' });
    }

    // Verify the event has a confirmed venue booking for a venue owned by this user
    const [venueBookingRows] = await pool.execute(
      `SELECT vb.id, vb.venue_id, v.owner_id
       FROM venue_bookings vb
       JOIN venues v ON v.id = vb.venue_id
       WHERE vb.event_id = ? AND vb.status = 'confirmed' AND v.owner_id = ?
       LIMIT 1`,
      [eventId, ownerId]
    );
    if (venueBookingRows.length === 0) {
      return res.status(403).json({ success: false, message: 'You do not own the confirmed venue for this event' });
    }

    // Fetch the event seat configurations
    const [eventRows] = await pool.execute(
      `SELECT id, standard_seats, special_seats, vip_seats FROM events WHERE id = ? LIMIT 1`,
      [eventId]
    );
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = eventRows[0];

    // Find taken seats
    const Booking = require('../models/Booking');
    const taken = await Booking.getTakenSeatsByEvent(eventId);

    const category = (seatCategory || 'Standard').charAt(0).toUpperCase() + (seatCategory || 'Standard').slice(1).toLowerCase();
    const takenSet = new Set((taken[category] || []).map(Number));

    let limit = event.standard_seats || 0;
    if (category === 'Special') limit = event.special_seats || 0;
    else if (category === 'Vip') limit = event.vip_seats || 0;

    let selectedSeat = null;
    for (let i = 1; i <= limit; i++) {
      if (!takenSet.has(i)) {
        selectedSeat = i;
        break;
      }
    }

    if (!selectedSeat) {
      return res.status(400).json({ success: false, message: `No available seats in category ${category}` });
    }

    // Mock body for payForBooking
    req.body = {
      eventId,
      seatNumbers: [selectedSeat],
      ticketType: category,
      paymentMethod: 'wallet', // Venue owner pays with wallet
      walletAmountToUse: 0,
      promoCode: null
    };

    const walletController = require('./walletController');
    await walletController.payForBooking(req, res);

  } catch (error) {
    console.error('bookSeat error:', error);
    res.status(500).json({ success: false, message: 'Failed to book seat' });
  }
};

// ── Event Team (host + LOC crew details for accepted/confirmed bookings) ─────

exports.getEventTeam = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const bookingId = parseInt(req.params.id, 10);

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    // Verify booking exists and belongs to a venue owned by this user
    const [bookingRows] = await pool.execute(
      `SELECT
         vb.id, vb.status, vb.event_id, vb.host_id,
         vb.pending_venue_fee, vb.pending_platform_fee, vb.total_price,
         vb.event_date,
         v.owner_id AS venue_owner_id,
         v.name AS venue_name
       FROM venue_bookings vb
       JOIN venues v ON v.id = vb.venue_id
       WHERE vb.id = ? LIMIT 1`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookingRows[0];

    if (booking.venue_owner_id !== ownerId) {
      return res.status(403).json({ success: false, message: 'You do not own the venue for this booking' });
    }

    // Only allow if booking is accepted or confirmed
    const allowedStatuses = ['accepted', 'accepted_by_owner', 'confirmed'];
    if (!allowedStatuses.includes(booking.status)) {
      return res.status(403).json({
        success: false,
        message: 'Event team details are only available after the booking has been accepted.'
      });
    }

    // Fetch host details
    const [hostRows] = await pool.execute(
      `SELECT
         u.id, u.full_name, u.email, u.phone_number, NULL AS profile_photo, u.created_at,
         (SELECT COUNT(*) FROM events e2 WHERE e2.organizer_id = u.id) AS total_events_hosted,
         (SELECT AVG(er.rating) FROM event_reviews er JOIN events e3 ON e3.id = er.event_id WHERE e3.organizer_id = u.id) AS average_event_rating
       FROM users u
       WHERE u.id = ? LIMIT 1`,
      [booking.host_id]
    );
    const host = hostRows[0] || null;

    // Fetch event details
    const [eventRows] = await pool.execute(
      `SELECT
         e.id, e.title, e.event_type, e.category, e.description,
         e.event_date, e.event_time, e.end_time, e.max_seats, e.event_agenda
       FROM events e
       WHERE e.id = ? LIMIT 1`,
      [booking.event_id]
    );
    const event = eventRows[0] || null;

    // Fetch event team members from event_team table (returns empty array if none yet)
    const [teamRows] = await pool.execute(
      `SELECT id, name, role, contact_info, created_at
       FROM event_team
       WHERE event_id = ?
       ORDER BY id ASC`,
      [booking.event_id]
    );

    res.json({
      success: true,
      bookingId,
      venueName: booking.venue_name,
      host: host ? {
        id: host.id,
        fullName: host.full_name,
        email: host.email,
        phone: host.phone_number || null,
        profilePhoto: host.profile_photo || null,
        accountCreatedAt: host.created_at,
        totalEventsHosted: Number(host.total_events_hosted || 0),
        averageEventRating: host.average_event_rating != null
          ? Number(Number(host.average_event_rating).toFixed(1))
          : null
      } : null,
      event: event ? {
        id: event.id,
        title: event.title,
        type: event.event_type,
        category: event.category,
        date: event.event_date,
        startTime: event.event_time || null,
        endTime: event.end_time || null,
        expectedGuests: Number(event.max_seats || 0),
        description: event.description || null,
        agenda: event.event_agenda || null
      } : null,
      teamMembers: teamRows.map(m => ({
        id: m.id,
        name: m.name,
        role: m.role,
        contactInfo: m.contact_info || null
      })),
      financials: {
        agreedVenueFee: Number(booking.pending_venue_fee || 0),
        platformFee: Number(booking.pending_platform_fee || 0),
        totalCharged: Number(booking.total_price || 0)
      }
    });

  } catch (error) {
    console.error('getEventTeam error:', error);
    res.status(500).json({ success: false, message: 'Failed to load event team details' });
  }
};

// ── Venue Owner Notifications ─────────────────────────────────────────────────

/**
 * GET /api/venue-owner/notifications/eligible-hosts/:venueId
 * Returns hosts with non-cancelled/declined bookings for ownership-verified venue.
 */
exports.getEligibleHosts = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const venueId = parseInt(req.params.venueId, 10);

    // Verify ownership
    const [venueRows] = await pool.execute(
      'SELECT id, name FROM venues WHERE id = ? AND owner_id = ? LIMIT 1',
      [venueId, ownerId]
    );
    if (venueRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Venue not found or access denied' });
    }

    const [rows] = await pool.execute(
      `SELECT
         vb.host_id AS userId,
         u.full_name AS fullName,
         u.email,
         vb.status AS bookingStatus,
         vb.event_date AS eventDate,
         vb.id AS bookingId
       FROM venue_bookings vb
       JOIN users u ON u.id = vb.host_id
       WHERE vb.venue_id = ?
         AND vb.status NOT IN ('cancelled', 'declined')
       ORDER BY vb.event_date DESC`,
      [venueId]
    );

    // De-duplicate by userId — keep earliest upcoming booking per host
    const seen = new Map();
    for (const row of rows) {
      if (!seen.has(row.userId)) {
        seen.set(row.userId, {
          userId: row.userId,
          fullName: row.fullName || row.email,
          email: row.email,
          bookingStatus: row.bookingStatus,
          eventDate: row.eventDate
        });
      }
    }

    return res.json({ success: true, hosts: [...seen.values()], venue: { id: venueRows[0].id, name: venueRows[0].name } });
  } catch (error) {
    console.error('getEligibleHosts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load eligible hosts' });
  }
};

/**
 * POST /api/venue-owner/notifications/send
 * Sends a notification to a single host or all active-booking hosts.
 */
exports.sendVenueOwnerNotification = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { targetType, hostId, venueId, title, message, type = 'info' } = req.body;

    // Validate required fields
    if (!targetType || !venueId || !title || !message) {
      return res.status(400).json({ success: false, message: 'targetType, venueId, title, and message are required' });
    }
    if (!['single', 'all'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'targetType must be "single" or "all"' });
    }
    if (!['info', 'warning', 'success'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be info, warning, or success' });
    }
    if (title.length > 100) {
      return res.status(400).json({ success: false, message: 'title must be at most 100 characters' });
    }
    if (message.length > 500) {
      return res.status(400).json({ success: false, message: 'message must be at most 500 characters' });
    }
    if (targetType === 'single' && !hostId) {
      return res.status(400).json({ success: false, message: 'hostId is required when targetType is "single"' });
    }

    // Verify venue ownership
    const [venueRows] = await pool.execute(
      'SELECT id, name FROM venues WHERE id = ? AND owner_id = ? LIMIT 1',
      [venueId, ownerId]
    );
    if (venueRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Venue not found or access denied' });
    }
    const venueName = venueRows[0].name;
    const fullTitle = `[${venueName}] — ${title}`;

    let recipientIds = [];

    if (targetType === 'single') {
      // Verify host has a non-cancelled booking at this venue
      const [checkRows] = await pool.execute(
        `SELECT id FROM venue_bookings
         WHERE venue_id = ? AND host_id = ?
           AND status NOT IN ('cancelled', 'declined')
         LIMIT 1`,
        [venueId, hostId]
      );
      if (checkRows.length === 0) {
        return res.status(403).json({ success: false, message: 'You can only message hosts who have booked your venue' });
      }
      recipientIds = [hostId];
    } else {
      // All distinct hosts with active bookings
      const [hostRows] = await pool.execute(
        `SELECT DISTINCT host_id FROM venue_bookings
         WHERE venue_id = ?
           AND status IN ('accepted', 'confirmed', 'pending_venue_response', 'accepted_by_owner')`,
        [venueId]
      );
      recipientIds = hostRows.map((r) => r.host_id);
    }

    if (recipientIds.length === 0) {
      return res.json({ success: true, sentCount: 0, message: 'No eligible recipients found' });
    }

    // Send notifications using existing Notification.create
    let sentCount = 0;
    for (const uid of recipientIds) {
      try {
        await Notification.create(uid, fullTitle, message, type);
        sentCount++;
      } catch (notifErr) {
        console.error(`Failed to send notification to ${uid}:`, notifErr.message);
      }
    }

    // Insert log row
    await pool.execute(
      `INSERT INTO venue_owner_notification_logs
         (venue_owner_id, venue_id, venue_name, target_type, host_ids_json, title, message, type, sent_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, venueId, venueName, targetType, JSON.stringify(recipientIds), title, message, type, sentCount]
    );

    return res.json({ success: true, sentCount });
  } catch (error) {
    console.error('sendVenueOwnerNotification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
};

/**
 * GET /api/venue-owner/notifications/sent-log
 * Returns the venue owner's full sent notification history, newest first.
 */
exports.getSentNotificationLog = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT
         l.id,
         l.venue_id AS venueId,
         l.venue_name AS venueName,
         l.target_type AS targetType,
         l.host_ids_json AS hostIdsJson,
         l.title,
         l.message,
         l.type,
         l.sent_count AS sentCount,
         l.created_at AS createdAt
       FROM venue_owner_notification_logs l
       WHERE l.venue_owner_id = ?
       ORDER BY l.created_at DESC
       LIMIT 200`,
      [ownerId]
    );

    return res.json({
      success: true,
      logs: rows.map((r) => ({
        id: r.id,
        venueId: r.venueId,
        venueName: r.venueName,
        targetType: r.targetType,
        hostIds: JSON.parse(r.hostIdsJson || '[]'),
        title: r.title,
        message: r.message,
        type: r.type,
        sentCount: r.sentCount,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('getSentNotificationLog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load notification log' });
  }
};
