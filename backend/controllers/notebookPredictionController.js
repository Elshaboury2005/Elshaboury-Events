/**
 * notebookPredictionController.js
 *
 * Handles the ML prediction request for a Notebook.
 * Assembles the 65-feature vector from:
 *   - Category 1: user-submitted ml_fields (manual form inputs)
 *   - Category 2: organizer profile fetched from DB
 *   - Category 3: server-side derived values (dates, calendar, weather placeholder)
 *
 * Calls the Python predict_service (event_ai_decision_system/predict_service.py).
 *
 * NOTE: event_quality_score and event_popularity_index are NOT included in this
 * request until Mohamed confirms their exact computation formula. They are flagged
 * below and omitted from the feature vector payload sent to the model.
 */

const pool = require('../config/database');
const Notebook = require('../models/Notebook');
const http = require('http');

const PREDICT_HOST = process.env.PREDICT_SERVICE_HOST || '127.0.0.1';
const PREDICT_PORT = parseInt(process.env.PREDICT_SERVICE_PORT || '5050', 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

function callPythonPredict(features) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(features);
    const options = {
      hostname: PREDICT_HOST,
      port: PREDICT_PORT,
      path: '/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from predict service')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Predict service timeout')); });
    req.write(body);
    req.end();
  });
}

/** Derive day_of_week, month, season, is_weekend, etc. from a date string. */
function deriveDateFeatures(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return {};
  const month = d.getMonth() + 1; // 1-12
  const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
  const day = d.getDate();

  let season;
  if ([12, 1, 2].includes(month)) season = 'Winter';
  else if ([3, 4, 5].includes(month)) season = 'Spring';
  else if ([6, 7, 8].includes(month)) season = 'Summer';
  else season = 'Fall';

  // Approximate Egyptian holiday / Ramadan flags (best-effort, not exact)
  // is_holiday, is_ramadan, is_eid, school_vacation: simplified logic
  // TODO: plug in a real calendar API or lookup table for production
  const is_weekend = dayOfWeek === 5 || dayOfWeek === 6 ? 1 : 0; // Fri/Sat = Egyptian weekend

  return {
    day_of_week: dayOfWeek,
    month: month,
    event_month_num: month,
    event_year: d.getFullYear(),
    event_day: day,
    season,
    is_weekend,
    is_holiday: 0,     // TODO: real holiday lookup
    is_ramadan: 0,     // TODO: Hijri calendar lookup
    is_eid: 0,         // TODO: Hijri calendar lookup
    school_vacation: 0, // TODO: Egyptian school calendar
  };
}

/** Parse a time string like "14:30" and return start_hour */
function deriveStartHour(timeStr) {
  if (!timeStr) return 12;
  const parts = String(timeStr).split(':');
  return parseInt(parts[0], 10) || 12;
}

/** Derive days_from_registration and days_to_deadline */
function deriveDaysFields(eventDate, regDeadline) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const evtD = new Date(eventDate);
  const regD = regDeadline ? new Date(regDeadline) : null;

  const days_to_event = Math.max(0, Math.round((evtD - today) / 86400000));
  const days_to_deadline = regD ? Math.max(0, Math.round((regD - today) / 86400000)) : days_to_event;
  const days_from_registration = regD ? Math.max(0, Math.round((evtD - regD) / 86400000)) : days_to_event;

  return { days_to_deadline, days_from_registration };
}

/** Compute vip_ticket_ratio from prices */
function deriveVipRatio(ticketPrice, vipTicketPrice) {
  const t = parseFloat(ticketPrice) || 0;
  const v = parseFloat(vipTicketPrice) || 0;
  if (t === 0 && v === 0) return 0;
  if (t === 0) return 1;
  return Math.min(1, parseFloat((v / (t + v)).toFixed(4)));
}

/** Fetch organizer's profile stats from the DB (Category 2) */
async function fetchOrganizerStats(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.created_at AS member_since,
         COALESCE(u.is_verified, 0) AS verified_organizer,
         COUNT(DISTINCT e.id) AS previous_events,
         COALESCE(AVG(r.rating), 0) AS organizer_rating,
         COUNT(DISTINCT f.id) AS followers_count
       FROM users u
       LEFT JOIN events e ON e.organizer_id = u.id
       LEFT JOIN event_reviews r ON r.event_id = e.id
       LEFT JOIN followers f ON f.following_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [userId]
    );
    if (!rows[0]) return {};
    const row = rows[0];

    const prevEvents = parseInt(row.previous_events, 10) || 0;

    // Calculate previous_success_rate: events with avg rating >= 4 / total past events
    const [successRows] = await pool.execute(
      `SELECT COUNT(*) AS sc
       FROM (
         SELECT e.id, COALESCE(AVG(r2.rating), 0) AS avg_r
         FROM events e
         LEFT JOIN event_reviews r2 ON r2.event_id = e.id
         WHERE e.organizer_id = ? AND e.event_date < NOW()
         GROUP BY e.id
         HAVING avg_r >= 4
       ) t`,
      [userId]
    );
    const successCount = parseInt(successRows[0]?.sc, 10) || 0;

    // Determine organizer_tier based on previous events
    let organizer_tier;
    if (prevEvents === 0) organizer_tier = 'Newcomer';
    else if (prevEvents < 5) organizer_tier = 'Regular';
    else if (prevEvents < 20) organizer_tier = 'Established';
    else organizer_tier = 'Legendary';

    // organizer_experience: years since account creation
    const memberSince = new Date(row.member_since);
    const yearsExp = Math.max(0, parseFloat(((Date.now() - memberSince) / (365.25 * 86400000)).toFixed(1)));

    return {
      organizer_rating: parseFloat(parseFloat(row.organizer_rating).toFixed(2)),
      organizer_tier,
      organizer_experience: yearsExp,
      previous_events: prevEvents,
      previous_success_rate: prevEvents > 0 ? parseFloat((successCount / prevEvents).toFixed(4)) : 0,
      followers_count: parseInt(row.followers_count, 10) || 0,
      verified_organizer: parseInt(row.verified_organizer, 10) === 1 ? 1 : 0,
    };
  } catch (err) {
    console.error('[notebookPredictionController] fetchOrganizerStats error:', err.message);
    return {};
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/notebooks/:id/predict
 * Body: { ml_fields: { ...category1 fields } }
 *
 * Assembles full 65-feature vector and calls the Python prediction service.
 * Saves ml_fields snapshot + prediction result to the notebook record.
 */
exports.runPrediction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { ml_fields } = req.body;

    if (!ml_fields || typeof ml_fields !== 'object') {
      return res.status(400).json({ success: false, message: 'ml_fields object is required' });
    }

    // Verify notebook ownership
    const notebook = await Notebook.findByIdAndUser(id, userId);
    if (!notebook) {
      return res.status(404).json({ success: false, message: 'Notebook not found' });
    }

    // ── Category 2: Auto-fetch organizer data ──────────────────
    const orgStats = await fetchOrganizerStats(userId);

    // ── Category 3: Derived / computed values ──────────────────
    const dateFeatures = deriveDateFeatures(ml_fields.event_date);
    const startHour = deriveStartHour(ml_fields.start_time);
    const daysFields = deriveDaysFields(ml_fields.event_date, ml_fields.registration_deadline);
    const vipRatio = deriveVipRatio(ml_fields.ticket_price, ml_fields.vip_ticket_price);

    // Weather: placeholder seasonal average based on city/month
    // TODO: integrate a real weather API (e.g. Open-Meteo) for future dates
    const weatherMap = { 1: 'Cold', 2: 'Cold', 3: 'Sunny', 4: 'Sunny', 5: 'Hot', 6: 'Hot',
                          7: 'Hot', 8: 'Hot', 9: 'Sunny', 10: 'Sunny', 11: 'Cold', 12: 'Cold' };
    const weather_forecast = ml_fields.weather_override || weatherMap[dateFeatures.month] || 'Sunny';
    const tempMap = { 1: 15, 2: 16, 3: 20, 4: 24, 5: 30, 6: 35,
                       7: 36, 8: 35, 9: 30, 10: 25, 11: 20, 12: 16 };
    const expected_temperature_c = tempMap[dateFeatures.month] || 25;

    // ── FLAGGED: event_quality_score & event_popularity_index ──
    // These fields exist in the training dataset but their computation formula
    // has NOT been confirmed by Mohamed yet. They are omitted from the feature
    // vector until the formula is defined. The predict service will either use
    // a default or the Python side should handle missing keys gracefully.
    // DO NOT assign a guessed value here.
    // const event_quality_score = ???;
    // const event_popularity_index = ???;

    // ── Assemble full feature vector ───────────────────────────
    const features = {
      // ── Category 1 (user input) ────────────────────────
      event_category:              ml_fields.event_category || '',
      event_type:                  ml_fields.event_type || '',
      target_audience:             ml_fields.target_audience || '',
      language:                    ml_fields.language || 'Arabic',
      minimum_age:                 parseInt(ml_fields.minimum_age, 10) || 0,
      event_duration_hours:        parseFloat(ml_fields.event_duration_hours) || 2,
      event_date:                  ml_fields.event_date || '',
      registration_deadline:       ml_fields.registration_deadline || ml_fields.event_date || '',
      country:                     ml_fields.country || 'Egypt',
      city:                        ml_fields.city || '',
      indoor_outdoor:              ml_fields.indoor_outdoor || 'Indoor',
      hall_capacity:               parseInt(ml_fields.hall_capacity, 10) || 100,
      venue_cost:                  parseFloat(ml_fields.venue_cost) || 0,
      parking_available:           ml_fields.parking_available ? 1 : 0,
      air_conditioning:            ml_fields.air_conditioning ? 1 : 0,
      accessibility:               ml_fields.accessibility ? 1 : 0,
      ticket_price:                parseFloat(ml_fields.ticket_price) || 0,
      vip_ticket_price:            parseFloat(ml_fields.vip_ticket_price) || 0,
      early_bird_discount_pct:     parseFloat(ml_fields.early_bird_discount_pct) || 0,
      group_discount_pct:          parseFloat(ml_fields.group_discount_pct) || 0,
      marketing_budget:            parseFloat(ml_fields.marketing_budget) || 0,
      facebook_budget:             parseFloat(ml_fields.facebook_budget) || 0,
      instagram_budget:            parseFloat(ml_fields.instagram_budget) || 0,
      tiktok_budget:               parseFloat(ml_fields.tiktok_budget) || 0,
      google_budget:               parseFloat(ml_fields.google_budget) || 0,
      influencer_budget:           parseFloat(ml_fields.influencer_budget) || 0,
      free_food:                   ml_fields.free_food ? 1 : 0,
      free_drinks:                 ml_fields.free_drinks ? 1 : 0,
      networking_session:          ml_fields.networking_session ? 1 : 0,
      certificates:                ml_fields.certificates ? 1 : 0,
      giveaways:                   ml_fields.giveaways ? 1 : 0,
      live_music:                  ml_fields.live_music ? 1 : 0,
      number_of_speakers:          parseInt(ml_fields.number_of_speakers, 10) || 0,
      celebrity_popularity_score:  parseFloat(ml_fields.celebrity_popularity_score) || 0,
      competing_events_nearby:     parseInt(ml_fields.competing_events_nearby, 10) || 0,
      competition_strength:        ml_fields.competition_strength || 'Weak',
      distance_from_city_center_km: parseFloat(ml_fields.distance_from_city_center_km) || 5,
      venue_rating:                parseFloat(ml_fields.venue_rating) || 3.5,

      // ── Category 2 (auto-fetched from DB) ─────────────
      organizer_rating:            orgStats.organizer_rating || 0,
      organizer_tier:              orgStats.organizer_tier || 'Newcomer',
      organizer_experience:        orgStats.organizer_experience || 0,
      previous_events:             orgStats.previous_events || 0,
      previous_success_rate:       orgStats.previous_success_rate || 0,
      followers_count:             orgStats.followers_count || 0,
      verified_organizer:          orgStats.verified_organizer || 0,

      // ── Category 3 (server-derived) ───────────────────
      day_of_week:                 dateFeatures.day_of_week ?? 1,
      month:                       dateFeatures.month ?? 1,
      season:                      dateFeatures.season || 'Spring',
      is_weekend:                  dateFeatures.is_weekend ?? 0,
      event_year:                  dateFeatures.event_year ?? new Date().getFullYear(),
      event_month_num:             dateFeatures.event_month_num ?? 1,
      event_day:                   dateFeatures.event_day ?? 1,
      start_hour:                  startHour,
      days_from_registration:      daysFields.days_from_registration,
      days_to_deadline:            daysFields.days_to_deadline,
      is_holiday:                  dateFeatures.is_holiday ?? 0,
      is_ramadan:                  dateFeatures.is_ramadan ?? 0,
      is_eid:                      dateFeatures.is_eid ?? 0,
      school_vacation:             dateFeatures.school_vacation ?? 0,
      weather_forecast:            weather_forecast,
      expected_temperature_c:      expected_temperature_c,
      vip_ticket_ratio:            vipRatio,
    };

    // ── Call Python predict service ────────────────────────────
    let predictionResult;
    try {
      predictionResult = await callPythonPredict(features);
    } catch (predictErr) {
      console.error('[notebookPredictionController] Predict service error:', predictErr.message);
      return res.status(502).json({
        success: false,
        message: 'Prediction service is unavailable. Please ensure the Python service is running.',
        detail: predictErr.message,
      });
    }

    // ── Save snapshot to notebook ──────────────────────────────
    await Notebook.updateMlFields(id, userId, { category1: ml_fields, auto_fetched: orgStats, derived: { ...dateFeatures, startHour, ...daysFields, vipRatio, weather_forecast, expected_temperature_c } });
    await Notebook.updatePrediction(id, userId, { ...predictionResult, timestamp: new Date().toISOString() });

    return res.json({
      success: true,
      prediction: predictionResult,
      auto_fetched: orgStats,
      flagged_fields: {
        event_quality_score: 'NOT_COMPUTED — formula not confirmed yet. Contact Mohamed.',
        event_popularity_index: 'NOT_COMPUTED — formula not confirmed yet. Contact Mohamed.',
      },
    });
  } catch (err) {
    console.error('[notebookPredictionController] runPrediction error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during prediction' });
  }
};

/**
 * GET /api/notebooks/:id/organizer-stats
 * Returns the auto-fetched organizer stats for display in the notebook form.
 */
exports.getOrganizerStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notebook = await Notebook.findByIdAndUser(id, userId);
    if (!notebook) {
      return res.status(404).json({ success: false, message: 'Notebook not found' });
    }

    const stats = await fetchOrganizerStats(userId);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[notebookPredictionController] getOrganizerStats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch organizer stats' });
  }
};

/**
 * PUT /api/notebooks/:id/ml-fields
 * Saves the current state of Category 1 fields without running a prediction.
 * Body: { ml_fields: { ... } }
 */
exports.saveMlFields = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { ml_fields } = req.body;

    if (!ml_fields) {
      return res.status(400).json({ success: false, message: 'ml_fields is required' });
    }

    const notebook = await Notebook.findByIdAndUser(id, userId);
    if (!notebook) {
      return res.status(404).json({ success: false, message: 'Notebook not found' });
    }

    await Notebook.updateMlFields(id, userId, { category1: ml_fields });
    res.json({ success: true, message: 'Fields saved' });
  } catch (err) {
    console.error('[notebookPredictionController] saveMlFields error:', err);
    res.status(500).json({ success: false, message: 'Failed to save fields' });
  }
};
