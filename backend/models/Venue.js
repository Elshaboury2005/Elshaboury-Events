const pool = require('../config/database');

const GOVERNORATE_ALIASES = {
  'faiyum': 'Fayoum',
  'fayoum': 'Fayoum',
  'red sea': 'Hurghada',
  'south sinai': 'Sharm El Sheikh',
  'asyout': 'Asyut',
  'beni sueif': 'Beni Suef',
  'beni-suef': 'Beni Suef',
  'kafr el-sheikh': 'Kafr El Sheikh',
  'portsaid': 'Port Said',
  'monofia': 'Monufia',
  'menoufia': 'Monufia',
  'sharqiya': 'Sharqia',
  'gharbia governorate': 'Gharbia'
};

function normalizeGovernorate(value) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return GOVERNORATE_ALIASES[cleaned.toLowerCase()] || cleaned;
}

function normalizeSort(sortBy) {
  const value = String(sortBy || 'featured_first').trim().toLowerCase();
  if (value === 'price_low_high' || value === 'price_asc') return 'price_low_high';
  if (value === 'price_high_low' || value === 'price_desc') return 'price_high_low';
  if (value === 'capacity') return 'capacity';
  if (value === 'rating') return 'rating';
  return 'featured_first';
}

function buildAmenitiesClause(amenities, where, params) {
  const items = Array.isArray(amenities) ? amenities.filter(Boolean) : [];
  for (const amenity of items) {
    where.push(`JSON_SEARCH(COALESCE(v.amenities, '[]'), 'one', ?) IS NOT NULL`);
    params.push(String(amenity));
  }
}

function buildSearchQuery(filters = {}) {
  const {
    userId = null,
    date = null,
    governorate = '',
    search = '',
    category = '',
    capacityMin = null,
    capacityMax = null,
    priceMin = null,
    priceMax = null,
    amenities = [],
    sortBy = 'featured_first',
    featuredOnly = false,
    wishlistOnly = false,
    limit = null
  } = filters;

  const normalizedGovernorate = normalizeGovernorate(governorate);
  const safeSort = normalizeSort(sortBy);
  const where = ['v.is_available = TRUE', "v.status = 'approved'"];
  const params = [
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    date || null,
    userId || null,
    userId || null
  ];

  if (featuredOnly) {
    where.push('v.is_featured = TRUE');
  }
  if (wishlistOnly && userId) {
    where.push('EXISTS (SELECT 1 FROM venue_wishlist vw WHERE vw.venue_id = v.id AND vw.user_id = ?)');
    params.push(userId);
  }
  if (normalizedGovernorate) {
    where.push('LOWER(TRIM(v.governorate)) = LOWER(TRIM(?))');
    params.push(normalizedGovernorate);
  }
  if (category) {
    where.push('v.category = ?');
    params.push(category);
  }
  if (search) {
    where.push('(v.name LIKE ? OR v.address LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (capacityMin != null && Number.isFinite(Number(capacityMin))) {
    where.push('v.total_capacity >= ?');
    params.push(Number(capacityMin));
  }
  if (capacityMax != null && Number.isFinite(Number(capacityMax))) {
    where.push('v.total_capacity <= ?');
    params.push(Number(capacityMax));
  }
  if (priceMin != null && Number.isFinite(Number(priceMin))) {
    where.push('v.price_per_day >= ?');
    params.push(Number(priceMin));
  }
  if (priceMax != null && Number.isFinite(Number(priceMax))) {
    where.push('v.price_per_day <= ?');
    params.push(Number(priceMax));
  }
  buildAmenitiesClause(amenities, where, params);

  let orderBy = 'v.is_featured DESC, v.rating DESC, v.price_per_day ASC, v.name ASC';
  if (safeSort === 'price_low_high') {
    orderBy = 'v.price_per_day ASC, v.rating DESC, v.name ASC';
  } else if (safeSort === 'price_high_low') {
    orderBy = 'v.price_per_day DESC, v.rating DESC, v.name ASC';
  } else if (safeSort === 'capacity') {
    orderBy = 'v.total_capacity DESC, v.rating DESC, v.name ASC';
  } else if (safeSort === 'rating') {
    orderBy = 'v.rating DESC, v.total_reviews DESC, v.is_featured DESC, v.name ASC';
  }

  const limitClause = Number.isFinite(Number(limit)) && Number(limit) > 0 ? ` LIMIT ${Number(limit)}` : '';

  return {
    sql: `
      SELECT
        v.*,
        CASE
          WHEN ? IS NULL OR ? = '' THEN FALSE
          WHEN EXISTS (
            SELECT 1
            FROM venue_bookings vb
            WHERE vb.venue_id = v.id
              AND vb.event_date = ?
              AND vb.status IN ('accepted', 'confirmed')
          ) THEN TRUE
          ELSE FALSE
        END AS is_booked_on_date,
        CASE
          WHEN ? IS NULL OR ? = '' THEN FALSE
          WHEN EXISTS (
            SELECT 1
            FROM venue_availability_blocks vab
            WHERE vab.venue_id = v.id
              AND vab.is_active = TRUE
              AND (
                (vab.block_type = 'specific_date' AND vab.date = ?) OR
                (vab.block_type = 'recurring_weekday' AND vab.weekday = (DAYOFWEEK(?) - 1))
              )
          ) THEN TRUE
          ELSE FALSE
        END AS is_blocked_on_date,
        CASE
          WHEN ? IS NULL OR ? = '' THEN TRUE
          WHEN EXISTS (
            SELECT 1
            FROM venue_bookings vb
            WHERE vb.venue_id = v.id
              AND vb.event_date = ?
              AND vb.status IN ('accepted', 'confirmed')
          ) THEN FALSE
          WHEN EXISTS (
            SELECT 1
            FROM venue_availability_blocks vab
            WHERE vab.venue_id = v.id
              AND vab.is_active = TRUE
              AND (
                (vab.block_type = 'specific_date' AND vab.date = ?) OR
                (vab.block_type = 'recurring_weekday' AND vab.weekday = (DAYOFWEEK(?) - 1))
              )
          ) THEN FALSE
          ELSE TRUE
        END AS is_available_on_date,
        CASE
          WHEN ? IS NULL THEN FALSE
          WHEN EXISTS (
            SELECT 1
            FROM venue_wishlist vw
            WHERE vw.venue_id = v.id
              AND vw.user_id = ?
          ) THEN TRUE
          ELSE FALSE
        END AS is_in_wishlist,
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
      WHERE ${where.join(' AND ')}
      ORDER BY is_available_on_date DESC, ${orderBy}${limitClause}
    `,
    params
  };
}

const Venue = {
  async findAvailable({ governorate, eventDate }) {
    return Venue.searchCatalog({
      governorate,
      date: eventDate,
      sortBy: 'price_low_high'
    });
  },

  async searchCatalog(filters = {}) {
    const { sql, params } = buildSearchQuery(filters);
    const [rows] = await pool.execute(sql, params);
    return rows;
  },

  async findFeatured(filters = {}) {
    return Venue.searchCatalog({
      ...filters,
      featuredOnly: true,
      sortBy: 'featured_first',
      limit: filters.limit || 8
    });
  },

  async findById(id) {
    const [rows] = await pool.execute(
      `SELECT v.*,
              (
                SELECT COUNT(*)
                FROM venue_bookings vb
                WHERE vb.venue_id = v.id
                  AND vb.status IN ('accepted', 'confirmed')
                  AND vb.event_date >= CURDATE()
              ) AS upcoming_bookings,
              (
                SELECT COALESCE(SUM(vb.total_price), 0)
                FROM venue_bookings vb
                WHERE vb.venue_id = v.id
                  AND vb.status = 'confirmed'
                  AND vb.payment_status = 'paid'
              ) AS total_revenue
       FROM venues v
       WHERE v.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      `SELECT
         v.*,
         u.full_name AS owner_name,
         u.email AS owner_email,
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
       LEFT JOIN users u ON u.id = v.owner_id
       ORDER BY v.is_featured DESC, v.created_at DESC, v.id DESC`
    );
    return rows;
  },

  async create(data) {
    const {
      name,
      description,
      governorate,
      address,
      latitude,
      longitude,
      category = 'conference_hall',
      totalCapacity,
      standardSeats,
      specialSeats,
      vipSeats,
      pricePerDay,
      rating = 0,
      totalReviews = 0,
      minHours = 4,
      pricePerHour = null,
      amenities,
      images,
      isFeatured = false,
      isAvailable = true,
      ownerId = null,
      status = ownerId || venueType === 'host_owned' ? 'pending_review' : 'approved',
      venueType = 'platform',
      contactPhone = null,
      contactEmail = null,
      cancellationPolicy = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO venues (
        name, description, governorate, address, latitude, longitude, category,
        total_capacity, standard_seats, special_seats, vip_seats,
        price_per_day, rating, total_reviews, min_hours, price_per_hour,
        amenities, images, is_featured, is_available,
        owner_id, status, venue_type, contact_phone, contact_email, cancellation_policy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        governorate,
        address,
        latitude ?? null,
        longitude ?? null,
        category,
        totalCapacity,
        standardSeats,
        specialSeats,
        vipSeats,
        pricePerDay,
        rating,
        totalReviews,
        minHours,
        pricePerHour ?? null,
        amenities || null,
        images || null,
        isFeatured ? 1 : 0,
        isAvailable ? 1 : 0,
        ownerId || null,
        status,
        venueType,
        contactPhone || null,
        contactEmail || null,
        cancellationPolicy || null
      ]
    );

    return Venue.findById(result.insertId);
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    const fieldMap = {
      name: 'name',
      description: 'description',
      governorate: 'governorate',
      address: 'address',
      latitude: 'latitude',
      longitude: 'longitude',
      category: 'category',
      totalCapacity: 'total_capacity',
      standardSeats: 'standard_seats',
      specialSeats: 'special_seats',
      vipSeats: 'vip_seats',
      pricePerDay: 'price_per_day',
      rating: 'rating',
      totalReviews: 'total_reviews',
      minHours: 'min_hours',
      pricePerHour: 'price_per_hour',
      amenities: 'amenities',
      images: 'images',
      isFeatured: 'is_featured',
      isAvailable: 'is_available',
      status: 'status',
      venueType: 'venue_type',
      contactPhone: 'contact_phone',
      contactEmail: 'contact_email',
      cancellationPolicy: 'cancellation_policy',
      adminNotes: 'admin_notes',
      rules: 'rules',
      parkingDetails: 'parking_details',
      cateringPolicy: 'catering_policy',
      decorationPolicy: 'decoration_policy',
      musicPolicy: 'music_policy',
      setupTimeHours: 'setup_time_hours',
      cleanupTimeHours: 'cleanup_time_hours',
      minBookingHours: 'min_booking_hours',
      maxConsecutiveDays: 'max_consecutive_days',
      floorPlanImage: 'floor_plan_image',
      virtualTourUrl: 'virtual_tour_url'
    };

    Object.entries(updates || {}).forEach(([key, value]) => {
      if (!(key in fieldMap)) return;
      fields.push(`${fieldMap[key]} = ?`);
      if (key === 'isAvailable' || key === 'isFeatured') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    });

    if (fields.length === 0) return Venue.findById(id);

    values.push(id);
    await pool.execute(`UPDATE venues SET ${fields.join(', ')} WHERE id = ?`, values);
    return Venue.findById(id);
  },

  async getBookedDates(id) {
    const [rows] = await pool.execute(
      `SELECT event_date, status
       FROM venue_bookings
       WHERE venue_id = ?
       ORDER BY event_date ASC`,
      [id]
    );
    return rows;
  },

  async getAvailabilityBlocks(id) {
    const [rows] = await pool.execute(
      `SELECT id, block_type, date, weekday, is_active, reason, created_at
       FROM venue_availability_blocks
       WHERE venue_id = ? AND is_active = TRUE`,
      [id]
    );
    return rows;
  },

  async findByOwnerId(ownerId) {
    const [rows] = await pool.execute(
      `SELECT v.*,
              (
                SELECT COUNT(*)
                FROM venue_bookings vb
                WHERE vb.venue_id = v.id
                  AND vb.status IN ('accepted','confirmed')
                  AND vb.event_date >= CURDATE()
              ) AS upcoming_bookings,
              (
                SELECT COALESCE(SUM(wt.amount), 0)
                FROM wallet_transactions wt
                WHERE wt.user_id = ?
                  AND wt.related_venue_booking_id IN (
                    SELECT id FROM venue_bookings WHERE venue_id = v.id
                  )
                  AND wt.status = 'available'
                  AND wt.type = 'credit'
                  AND wt.source = 'venue-booking'
              ) AS total_earned,
              (
                SELECT COALESCE(SUM(wt.amount), 0)
                FROM wallet_transactions wt
                WHERE wt.user_id = ?
                  AND wt.related_venue_booking_id IN (
                    SELECT id FROM venue_bookings WHERE venue_id = v.id
                  )
                  AND wt.status = 'held'
                  AND wt.type = 'credit'
                  AND wt.source = 'venue-booking'
              ) AS total_held
       FROM venues v
       WHERE v.owner_id = ?
       ORDER BY v.created_at DESC`,
      [ownerId, ownerId, ownerId]
    );
    return rows;
  },

  async findPendingSubmissions() {
    const [rows] = await pool.execute(
      `SELECT v.*, u.full_name AS owner_name, u.email AS owner_email
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_id
       WHERE v.status = 'pending_review'
       ORDER BY v.created_at ASC`
    );
    return rows;
  },

  async findAllWithOwner() {
    const [rows] = await pool.execute(
      `SELECT v.*, u.full_name AS owner_name, u.email AS owner_email
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_id
       ORDER BY v.created_at DESC`
    );
    return rows;
  },

  async hasActiveBookings(id) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM venue_bookings
       WHERE venue_id = ?
         AND status IN ('accepted','confirmed','pending_venue_response')
         AND event_date >= CURDATE()`,
      [id]
    );
    return Number(rows[0]?.cnt || 0) > 0;
  }
};

module.exports = Venue;
