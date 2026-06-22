const pool = require('../config/database');

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

const lifecycleExpression = `
COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END)
`;

const Event = {
  findAll: async (options = {}) => {
    const {
      approvedOnly = true,
      lifecycleView = 'upcoming',
      organizerId = null
    } = options;

    const where = [];
    const params = [];

    if (approvedOnly) {
      where.push("(e.event_status = 'approved' OR e.event_status IS NULL)");
    }

    if (lifecycleView === 'past') {
      where.push(`(${lifecycleExpression} = 'expired' OR e.event_date < NOW())`);
    } else if (lifecycleView === 'upcoming') {
      where.push(`(${lifecycleExpression} = 'active' AND e.event_date >= NOW())`);
    }

    if (organizerId) {
      where.push('e.organizer_id = ?');
      params.push(organizerId);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderClause = lifecycleView === 'past' ? 'ORDER BY e.event_date DESC' : 'ORDER BY e.event_date ASC';

    const [rows] = await pool.execute(
      `
      SELECT
        e.*,
        ${lifecycleExpression} AS lifecycle_status,
        u.full_name AS organizer_name,
        u.username AS organizer_username,
        COALESCE(att.total_confirmed_attendees, 0) AS final_attendance_count,
        COALESCE(rv.avg_rating, 0) AS average_rating,
        COALESCE(rv.review_count, 0) AS review_count
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      LEFT JOIN (
        SELECT
          b.event_id,
          SUM(
            CASE
              WHEN b.status = 'confirmed' THEN ${seatsCountExpression}
              ELSE 0
            END
          ) AS total_confirmed_attendees
        FROM bookings b
        GROUP BY b.event_id
      ) att ON att.event_id = e.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) AS review_count, AVG(rating) AS avg_rating
        FROM event_reviews
        GROUP BY event_id
      ) rv ON rv.event_id = e.id
      ${whereClause}
      ${orderClause}
    `,
      params
    );

    return rows;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      `
      SELECT
        e.*,
        ${lifecycleExpression} AS lifecycle_status,
        u.full_name AS organizer_name,
        u.username AS organizer_username
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      WHERE e.id = ?
    `,
      [id]
    );
    return rows[0] || null;
  },

  findByOrganizerId: async (organizerId, lifecycleView = 'all') => {
    return Event.findAll({ approvedOnly: false, organizerId, lifecycleView });
  },

  findBasicById: async (id) => {
    const [rows] = await pool.execute(
      `
      SELECT
        id,
        available_seats,
        max_seats,
        standard_seats,
        special_seats,
        vip_seats,
        organizer_id,
        title,
        event_date,
        event_status,
        COALESCE(lifecycle_status, CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END) AS lifecycle_status
      FROM events
      WHERE id = ?
    `,
      [id]
    );
    return rows[0] || null;
  },

  // Lock event row for update (use within transaction).
  findBasicByIdForUpdate: async (id, conn) => {
    const db = conn || pool;
    const [rows] = await db.execute(
      `
      SELECT
        id,
        available_seats,
        max_seats,
        standard_seats,
        special_seats,
        vip_seats,
        organizer_id,
        title,
        event_date,
        event_status,
        COALESCE(lifecycle_status, CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END) AS lifecycle_status
      FROM events
      WHERE id = ?
      FOR UPDATE
    `,
      [id]
    );
    return rows[0] || null;
  },

  getOrganizerId: async (id) => {
    const [rows] = await pool.execute('SELECT organizer_id FROM events WHERE id = ?', [id]);
    return rows[0]?.organizer_id || null;
  },

  create: async (fields, conn = null) => {
    const {
      id, title, description, eventDate, eventTime, location, venueAddress,
      organizerId, maxSeats, standardSeats, specialSeats, vipSeats, eventType,
      hostName, hostEmail, hostPhone, hostOrganization,
      ocName, ocEmail, ocPhone,
      primarySponsor, sponsorPackages, sponsorContact,
      leadSpeaker, speakerTopic, speakerBio,
      priceStandard, priceSpecial, priceVip, pricingNotes,
      logistics, image_url, location_type, governorate, latitude, longitude,
      registration_deadline, age_restriction, terms_conditions, event_agenda,
      aiMarketingRequested, venueType, venueId, venueBookingId, listingFee
    } = fields;

    const eventDateTime = `${eventDate} ${eventTime || '00:00:00'}`;
    const db = conn || pool;
    await db.execute(
      `INSERT INTO events (
        id, title, description, event_date, location, venue_address,
        organizer_id, max_seats, available_seats, standard_seats, special_seats, vip_seats, event_type,
        host_name, host_email, host_phone, host_organization,
        oc_name, oc_email, oc_phone,
        primary_sponsor, sponsor_packages, sponsor_contact,
        lead_speaker, speaker_topic, speaker_bio,
        price_standard, price_special, price_vip, pricing_notes,
        logistics, event_status, lifecycle_status, payment_status, ai_marketing_requested,
        image_url, location_type, venue_type, venue_id, venue_booking_id, governorate, latitude, longitude,
        registration_deadline, age_restriction, terms_conditions, event_agenda, listing_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, title, description || '', eventDateTime, location, venueAddress || '',
        organizerId, maxSeats || 0, maxSeats || 0, standardSeats || 0, specialSeats || 0, vipSeats || 0, eventType || '',
        hostName || '', hostEmail || '', hostPhone || '', hostOrganization || '',
        ocName || '', ocEmail || '', ocPhone || '',
        primarySponsor || '', sponsorPackages || '', sponsorContact || '',
        leadSpeaker || '', speakerTopic || '', speakerBio || '',
        priceStandard || 0, priceSpecial || 0, priceVip || 0, pricingNotes || '',
        logistics || '', 'pending', 'active', 'unpaid', aiMarketingRequested ? 1 : 0,
        image_url || null, location_type || 'physical', venueType || 'host_owned', venueId || null, venueBookingId || null,
        governorate || null, latitude || null, longitude || null, registration_deadline || null,
        age_restriction || null, terms_conditions || null, event_agenda || null, listingFee || 0
      ]
    );
  },

  update: async (id, updates) => {
    const updateFields = [];
    const updateValues = [];
    const fieldMap = {
      title: 'title', description: 'description', eventDate: 'event_date',
      location: 'location', maxSeats: 'max_seats',
      standardSeats: 'standard_seats', specialSeats: 'special_seats', vipSeats: 'vip_seats',
      venueAddress: 'venue_address', image_url: 'image_url', location_type: 'location_type',
      venueType: 'venue_type', venueId: 'venue_id', venueBookingId: 'venue_booking_id', listingFee: 'listing_fee',
      governorate: 'governorate', latitude: 'latitude', longitude: 'longitude',
      registration_deadline: 'registration_deadline', age_restriction: 'age_restriction',
      terms_conditions: 'terms_conditions', event_agenda: 'event_agenda'
    };

    const hasDate = updates.eventDate !== undefined && updates.eventDate !== null;
    const hasTime = updates.eventTime !== undefined && updates.eventTime !== null;

    if (hasDate || hasTime) {
      let newDateTime;
      if (hasDate && hasTime) {
        newDateTime = `${updates.eventDate} ${updates.eventTime}`;
      } else {
        const [existing] = await pool.execute(
          'SELECT event_date FROM events WHERE id = ?',
          [id]
        );
        const current = existing[0] ? (existing[0].event_date && new Date(existing[0].event_date)) : null;
        if (!current) {
          newDateTime = hasDate ? `${updates.eventDate} 00:00:00` : null;
        } else {
          const datePart = current.toISOString().slice(0, 10);
          const timePart = current.toTimeString().slice(0, 8);
          if (hasDate) {
            newDateTime = `${updates.eventDate} ${timePart}`;
          } else {
            newDateTime = `${datePart} ${updates.eventTime}`;
          }
        }
      }
      if (newDateTime) {
        updateFields.push('event_date = ?');
        updateValues.push(newDateTime);
      }
    }

    Object.entries(updates).forEach(([key, val]) => {
      if (key !== 'eventDate' && key !== 'eventTime' && fieldMap[key] !== undefined && val !== undefined) {
        updateFields.push(`${fieldMap[key]} = ?`);
        updateValues.push(val);
      }
    });

    if (updateFields.length === 0) return false;
    updateFields.push("lifecycle_status = CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END");
    updateFields.push("expired_at = CASE WHEN event_date <= NOW() THEN COALESCE(expired_at, event_date) ELSE NULL END");
    updateValues.push(id);

    await pool.execute(
      `UPDATE events SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    return true;
  },

  delete: async (id) => {
    await pool.execute('DELETE FROM events WHERE id = ?', [id]);
  },

  decrementAvailableSeats: async (eventId, count = 1, conn) => {
    const db = conn || pool;
    await db.execute(
      'UPDATE events SET available_seats = GREATEST(available_seats - ?, 0) WHERE id = ?',
      [count, eventId]
    );
  },

  incrementAvailableSeats: async (eventId, count = 1) => {
    await pool.execute(
      'UPDATE events SET available_seats = LEAST(available_seats + ?, max_seats) WHERE id = ?',
      [count, eventId]
    );
  }
};

module.exports = Event;
