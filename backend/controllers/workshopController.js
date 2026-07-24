const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const Workshop = require('../models/Workshop');
const WorkshopCategory = require('../models/WorkshopCategory');
const WorkshopMember = require('../models/WorkshopMember');
const { signWorkshopToken } = require('../middleware/workshopAuthMiddleware');
const logWorkshopActivity = require('../utils/logWorkshopActivity');
const { notifyMember } = require('../utils/createWorkshopNotification');

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Verifies that the given userId is the organizer of the given event.
 * Sends a 403 response and returns false if the check fails.
 * Returns true on success (caller may continue).
 *
 * @param {object} res - Express response object
 * @param {string} eventId - Event ID to check ownership of
 * @param {string} organizerId - User ID claiming to be the organizer
 * @returns {Promise<boolean>}
 */
async function requireEventOwnership(res, eventId, organizerId) {
  const [rows] = await pool.execute(
    `SELECT id FROM events WHERE id = ? AND organizer_id = ? LIMIT 1`,
    [eventId, organizerId]
  );
  if (!rows.length) {
    res.status(403).json({ success: false, message: 'Event not found or access denied' });
    return false;
  }
  return true;
}

/**
 * Verifies that the given category belongs to the given workshop.
 * Sends a 400 response and returns false if the check fails.
 * Returns true on success.
 *
 * @param {object} res - Express response object
 * @param {number} categoryId - Category to check
 * @param {number} workshopId - Workshop the category must belong to
 * @returns {Promise<boolean>}
 */
async function requireCategoryInWorkshop(res, categoryId, workshopId) {
  const catOk = await WorkshopCategory.belongsToWorkshop(categoryId, workshopId);
  if (!catOk) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return false;
  }
  return true;
}

/**
 * Parses and validates a single category entry from createWorkshop input.
 * Returns an error message string if invalid, or null if valid.
 *
 * @param {object} cat - Category input object
 * @returns {string|null}
 */
function validateCategoryInput(cat) {
  if (!cat.name || !String(cat.name).trim()) return 'Each category must have a name';
  if (!cat.head || !String(cat.head).trim()) return `Category "${cat.name}" must have a head email`;
  return null;
}

/**
 * Inserts all members for a single category within a transaction.
 * Returns the list of { email, role } records inserted.
 *
 * @param {object} conn - Active DB connection
 * @param {number} categoryId - ID of the newly created category
 * @param {object} cat - Category definition from request body
 * @returns {Promise<Array<{email: string, role: string}>>}
 */
async function insertCategoryMembers(conn, categoryId, cat) {
  const catMembers = [];
  const headEmail = String(cat.head).trim().toLowerCase();

  await conn.execute(
    `INSERT INTO workshop_members (category_id, email, role) VALUES (?, ?, 'head')`,
    [categoryId, headEmail]
  );
  catMembers.push({ email: headEmail, role: 'head' });

  if (cat.viceHead && String(cat.viceHead).trim()) {
    const vhEmail = String(cat.viceHead).trim().toLowerCase();
    if (vhEmail !== headEmail) {
      await conn.execute(
        `INSERT IGNORE INTO workshop_members (category_id, email, role) VALUES (?, ?, 'vice_head')`,
        [categoryId, vhEmail]
      );
      catMembers.push({ email: vhEmail, role: 'vice_head' });
    }
  }

  if (Array.isArray(cat.members)) {
    for (const mEmail of cat.members) {
      const cleanEmail = String(mEmail).trim().toLowerCase();
      if (cleanEmail && cleanEmail !== headEmail) {
        await conn.execute(
          `INSERT IGNORE INTO workshop_members (category_id, email, role) VALUES (?, ?, 'member')`,
          [categoryId, cleanEmail]
        );
        catMembers.push({ email: cleanEmail, role: 'member' });
      }
    }
  }

  return catMembers;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZER-FACING ENDPOINTS (protected by normal authenticateToken)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/workshop/event/:eventId
 * Returns the workshop for an event (with categories + members), or null.
 * Only the event's organizer may call this.
 */
exports.getWorkshopForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.userId;

    if (!await requireEventOwnership(res, eventId, organizerId)) return;

    const workshop = await Workshop.findByEventId(eventId);
    if (!workshop) {
      return res.json({ success: true, workshop: null });
    }

    const categories = await WorkshopCategory.findByWorkshopId(workshop.id);
    const members = await WorkshopMember.findAllByWorkshopId(workshop.id);

    const categoriesWithMembers = categories.map(cat => ({
      ...cat,
      members: members.filter(m => m.category_id === cat.id)
    }));

    return res.json({
      success: true,
      workshop: {
        id: workshop.id,
        event_id: workshop.event_id,
        username: workshop.username,
        created_at: workshop.created_at,
        categories: categoriesWithMembers
      }
    });
  } catch (error) {
    console.error('[workshopController] getWorkshopForEvent error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch workshop' });
  }
};

/**
 * POST /api/workshop/event/:eventId
 * Create a workshop + categories + initial members for an event.
 * Body: { username, accessCode, categories: [{ name, head, viceHead?, members?: [] }] }
 */
exports.createWorkshop = async (req, res) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.userId;
    const { username, accessCode, categories } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!username || !String(username).trim()) {
      return res.status(400).json({ success: false, message: 'Workshop username is required' });
    }
    if (!accessCode || String(accessCode).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Access code must be at least 4 characters' });
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one category is required' });
    }
    for (const cat of categories) {
      const catError = validateCategoryInput(cat);
      if (catError) return res.status(400).json({ success: false, message: catError });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    if (!await requireEventOwnership(res, eventId, organizerId)) return;

    const existing = await Workshop.findByEventId(eventId);
    if (existing) {
      return res.status(409).json({ success: false, message: 'A workshop already exists for this event' });
    }

    const taken = await Workshop.usernameExists(cleanUsername);
    if (taken) {
      return res.status(409).json({ success: false, message: 'Workshop username is already taken' });
    }

    const codeHash = await bcrypt.hash(String(accessCode).trim(), 10);

    // ── Persist in a transaction ───────────────────────────────────────────
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [wResult] = await conn.execute(
        `INSERT INTO workshops (event_id, username, access_code_hash, created_by) VALUES (?, ?, ?, ?)`,
        [eventId, cleanUsername, codeHash, organizerId]
      );
      const workshopId = wResult.insertId;
      const createdCategories = [];

      for (const cat of categories) {
        const catName = String(cat.name).trim();
        const [cResult] = await conn.execute(
          `INSERT INTO workshop_categories (workshop_id, category_name) VALUES (?, ?)`,
          [workshopId, catName]
        );
        const categoryId = cResult.insertId;
        const catMembers = await insertCategoryMembers(conn, categoryId, cat);
        createdCategories.push({ id: categoryId, category_name: catName, members: catMembers });
      }

      await conn.commit();
      conn.release();

      return res.status(201).json({
        success: true,
        message: 'Workshop created successfully',
        workshop: { id: workshopId, event_id: eventId, username: cleanUsername, categories: createdCategories }
      });
    } catch (txErr) {
      await conn.rollback();
      conn.release();
      throw txErr;
    }
  } catch (error) {
    console.error('[workshopController] createWorkshop error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Workshop username is already taken' });
    }
    res.status(500).json({ success: false, message: 'Failed to create workshop' });
  }
};

/**
 * POST /api/workshop/event/:eventId/members
 * Organizer adds a member (any role) to any category of this event's workshop.
 * Body: { categoryId, email, role: 'head'|'vice_head'|'member' }
 */
exports.organizerAddMember = async (req, res) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.userId;
    const { categoryId, email, role } = req.body;

    if (!categoryId || !email || !role) {
      return res.status(400).json({ success: false, message: 'categoryId, email, and role are required' });
    }
    const allowedRoles = ['head', 'vice_head', 'member'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    if (!await requireEventOwnership(res, eventId, organizerId)) return;

    const workshop = await Workshop.findByEventId(eventId);
    if (!workshop) {
      return res.status(404).json({ success: false, message: 'No workshop for this event' });
    }
    const catOk = await WorkshopCategory.belongsToWorkshop(categoryId, workshop.id);
    if (!catOk) {
      return res.status(400).json({ success: false, message: 'Category does not belong to this event workshop' });
    }

    if (role === 'vice_head') {
      const hasVH = await WorkshopMember.existsViceHead(categoryId);
      if (hasVH) {
        return res.status(409).json({ success: false, message: 'A vice head already exists for this category' });
      }
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const alreadyIn = await WorkshopMember.emailExistsInCategory(categoryId, cleanEmail);
    if (alreadyIn) {
      return res.status(409).json({ success: false, message: 'This email is already in this category' });
    }

    const member = await WorkshopMember.addMember(categoryId, cleanEmail, role);
    return res.status(201).json({ success: true, message: 'Member added', member });
  } catch (error) {
    console.error('[workshopController] organizerAddMember error:', error);
    res.status(500).json({ success: false, message: 'Failed to add member' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKSHOP-FACING ENDPOINTS (public or workshop-JWT protected)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/workshop/login
 * Body: { email, workshopUsername, accessCode }
 * Returns a Workshop-scoped JWT on success.
 */
exports.workshopLogin = async (req, res) => {
  try {
    const { email, workshopUsername, accessCode } = req.body;

    if (!email || !workshopUsername || !accessCode) {
      return res.status(400).json({ success: false, message: 'Invalid workshop credentials' });
    }

    const workshop = await Workshop.findByUsername(String(workshopUsername).trim().toLowerCase());
    if (!workshop) {
      // Constant-time-like delay to prevent user enumeration via timing
      await bcrypt.compare('dummy', '$2a$10$dummyhashfortimingprotection000000000000000000000');
      return res.status(401).json({ success: false, message: 'Invalid workshop credentials' });
    }

    const codeMatch = await bcrypt.compare(String(accessCode).trim(), workshop.access_code_hash);
    if (!codeMatch) {
      return res.status(401).json({ success: false, message: 'Invalid workshop credentials' });
    }

    const member = await WorkshopMember.findByWorkshopAndEmail(workshop.id, String(email).trim());
    if (!member) {
      return res.status(401).json({ success: false, message: 'Invalid workshop credentials' });
    }

    const token = signWorkshopToken({
      workshopMemberId: member.id,
      workshopId: workshop.id,
      eventId: workshop.event_id,
      categoryId: member.category_id,
      role: member.role,
      email: member.email,
      categoryName: member.category_name
    });

    return res.json({
      success: true,
      message: 'Workshop login successful',
      token,
      member: {
        id: member.id,
        email: member.email,
        role: member.role,
        categoryId: member.category_id,
        categoryName: member.category_name,
        workshopId: workshop.id
      }
    });
  } catch (error) {
    console.error('[workshopController] workshopLogin error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

/**
 * GET /api/workshop/dashboard
 * Returns event details, venue details, and the caller's member record.
 * Requires a valid Workshop JWT (authenticateWorkshopToken).
 */
exports.getWorkshopDashboard = async (req, res) => {
  try {
    const { eventId, workshopId, role, categoryId, categoryName, email } = req.workshopMember;

    const [eventRows] = await pool.execute(
      `SELECT e.*,
              u.full_name   AS organizer_name,
              u.username    AS organizer_username
       FROM events e
       LEFT JOIN users u ON u.id = e.organizer_id
       WHERE e.id = ?
       LIMIT 1`,
      [eventId]
    );
    const event = eventRows[0] || null;
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const venue = await fetchVenueForDashboard(eventId, event.venue_id);

    return res.json({
      success: true,
      event,
      venue,
      member: { role, categoryId, categoryName, email }
    });
  } catch (error) {
    console.error('[workshopController] getWorkshopDashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};

/**
 * Fetches linked venue data for the workshop dashboard.
 * Returns null if the event has no associated venue.
 *
 * @param {string} eventId - The event to look up the booking for
 * @param {number|null} venueId - The venue_id from the event row, or null
 * @returns {Promise<object|null>}
 */
async function fetchVenueForDashboard(eventId, venueId) {
  if (!venueId) return null;

  const [venueRows] = await pool.execute(
    `SELECT v.id, v.name, v.address AS location, v.governorate, v.total_capacity AS capacity,
            v.price_per_day, v.amenities, v.images, v.description,
            v.contact_phone AS phone, v.contact_email AS venue_email,
            vb.status AS booking_status, vb.event_date AS booking_date, vb.total_price
     FROM venues v
     LEFT JOIN venue_bookings vb ON vb.venue_id = v.id AND vb.event_id = ?
     WHERE v.id = ?
     LIMIT 1`,
    [eventId, venueId]
  );
  const venue = venueRows[0] || null;
  if (!venue) return null;

  if (venue.amenities && typeof venue.amenities === 'string') {
    try { venue.amenities = JSON.parse(venue.amenities); } catch (_) {}
  }
  if (venue.images && typeof venue.images === 'string') {
    try { venue.images = JSON.parse(venue.images); } catch (_) {}
  }
  return venue;
}

/**
 * GET /api/workshop/my-category
 * Returns all members of the caller's own category.
 * Requires Workshop JWT.
 */
exports.getMyCategoryMembers = async (req, res) => {
  try {
    const { categoryId, workshopId } = req.workshopMember;

    if (!await requireCategoryInWorkshop(res, categoryId, workshopId)) return;

    const members = await WorkshopMember.findByCategoryId(categoryId);
    return res.json({ success: true, members });
  } catch (error) {
    console.error('[workshopController] getMyCategoryMembers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category members' });
  }
};

/**
 * POST /api/workshop/my-category/members
 * Head adds a vice-head or member to their own category.
 * Requires Workshop JWT + role = 'head'.
 * Body: { email, role: 'vice_head'|'member' }
 */
exports.headAddMember = async (req, res) => {
  try {
    const { categoryId, workshopId } = req.workshopMember;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, message: 'email and role are required' });
    }
    if (!['vice_head', 'member'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Head can only add vice_head or member roles' });
    }

    if (!await requireCategoryInWorkshop(res, categoryId, workshopId)) return;

    if (role === 'vice_head') {
      const hasVH = await WorkshopMember.existsViceHead(categoryId);
      if (hasVH) {
        return res.status(409).json({ success: false, message: 'A vice head already exists for your category' });
      }
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const alreadyIn = await WorkshopMember.emailExistsInCategory(categoryId, cleanEmail);
    if (alreadyIn) {
      return res.status(409).json({ success: false, message: 'This email is already in your category' });
    }

    const member = await WorkshopMember.addMember(categoryId, cleanEmail, role);

    // Welcome notification & activity log
    const category = await WorkshopCategory.findById(categoryId);
    const catName = category ? category.category_name : 'Team';
    const roleLabel = role === 'vice_head' ? 'Vice Head' : 'Member';

    await notifyMember(
      member.id,
      `Welcome to the category "${catName}" as ${roleLabel}!`,
      '/html/workshop/workshop-dashboard.html'
    );

    await logWorkshopActivity(
      categoryId,
      req.workshopMember.workshopMemberId,
      'member_added',
      `${req.workshopMember.email} added ${cleanEmail} as ${roleLabel}`
    );

    return res.status(201).json({ success: true, message: 'Member added to your category', member });
  } catch (error) {
    console.error('[workshopController] headAddMember error:', error);
    res.status(500).json({ success: false, message: 'Failed to add member' });
  }
};
