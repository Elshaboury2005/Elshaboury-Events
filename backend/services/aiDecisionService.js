/**
 * aiDecisionService.js
 *
 * Calls the Python Flask predict service at http://localhost:5050/predict
 * after a new event is created. Maps event DB fields → ML feature payload,
 * calls the service, then writes the decision back to the events table.
 *
 * The Flask service must be running separately:
 *   cd event_ai_decision_system && python predict_service.py
 */

const pool = require('../config/database');

const PREDICT_URL = process.env.AI_PREDICT_URL || 'http://localhost:5050/predict';
const PREDICT_TIMEOUT_MS = 10000; // 10 s — generous timeout for cold-start

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive the season string from a JS Date.
 * Meteorological seasons (Northern Hemisphere).
 */
function getSeason(date) {
  const month = new Date(date).getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * Derive 'weekday' or 'weekend' from a JS Date.
 */
function getDayType(date) {
  const day = new Date(date).getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 5 || day === 6 ? 'weekend' : 'weekday';
}

/**
 * Days between now and the event date (can be negative for past events).
 */
function getLeadTimeDays(eventDate) {
  const diffMs = new Date(eventDate).getTime() - Date.now();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Simple marketing reach proxy.
 * 70 if the organizer opted in to AI marketing assistance, 30 otherwise.
 */
function getMarketingReachScore(aiMarketingRequested) {
  return aiMarketingRequested ? 70 : 30;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Count the organizer's total past events and how many were cancelled/rejected.
 * Excludes the event just created (by eventId).
 */
async function getOrganizerStats(organizerId, excludeEventId) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_events,
       SUM(CASE WHEN event_status IN ('rejected', 'cancelled') THEN 1 ELSE 0 END) AS cancelled_events
     FROM events
     WHERE organizer_id = ?
       AND id <> ?`,
    [organizerId, excludeEventId]
  );
  const row = rows[0] || {};
  return {
    pastEvents: Number(row.total_events || 0),
    pastCancellations: Number(row.cancelled_events || 0)
  };
}

/**
 * Compute the market average standard ticket price for events of the same type.
 * Falls back to the event's own price if no other events exist.
 */
async function getMarketAvgPrice(eventType, fallbackPrice) {
  const [rows] = await pool.execute(
    `SELECT AVG(price_standard) AS avg_price
     FROM events
     WHERE event_type = ?
       AND price_standard > 0`,
    [eventType || '']
  );
  const avg = parseFloat(rows[0]?.avg_price || 0);
  return avg > 0 ? avg : (Number(fallbackPrice) || 0);
}

// ─── Payload builder ─────────────────────────────────────────────────────────

/**
 * Build the feature payload expected by POST /predict.
 *
 * Feature mapping (see implementation_plan.md for rationale):
 *   event_type              ← events.event_type
 *   season                  ← derived from events.event_date
 *   day_type                ← derived from events.event_date
 *   budget                  ← events.listing_fee (monetary cost proxy)
 *   guest_count             ← events.max_seats
 *   hall_capacity           ← events.max_seats
 *   lead_time_days          ← event_date - now()
 *   organizer_past_events   ← COUNT of organizer's prior events
 *   organizer_past_cancellations ← COUNT of organizer's rejected/cancelled events
 *   ticket_price            ← events.price_standard
 *   market_avg_price        ← AVG(price_standard) for same event_type
 *   marketing_reach_score   ← 70 if ai_marketing_requested, else 30
 */
function buildFeaturePayload(event, organizerStats, marketAvgPrice) {
  return {
    event_type:                    String(event.event_type || 'general'),
    season:                        getSeason(event.event_date),
    day_type:                      getDayType(event.event_date),
    budget:                        Number(event.listing_fee || 0),
    guest_count:                   Number(event.max_seats || 0),
    hall_capacity:                 Number(event.max_seats || 0),
    lead_time_days:                getLeadTimeDays(event.event_date),
    organizer_past_events:         organizerStats.pastEvents,
    organizer_past_cancellations:  organizerStats.pastCancellations,
    ticket_price:                  Number(event.price_standard || 0),
    market_avg_price:              marketAvgPrice,
    marketing_reach_score:         getMarketingReachScore(event.ai_marketing_requested)
  };
}

// ─── Flask call ───────────────────────────────────────────────────────────────

/**
 * POST the feature payload to the Flask service and return the report.
 * Throws on network error or non-2xx response.
 */
async function fetchAiDecision(payload) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable — use Node.js 18+');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREDICT_TIMEOUT_MS);

  try {
    const response = await fetch(PREDICT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        body?.error || body?.message || `Predict service returned HTTP ${response.status}`
      );
    }

    return body; // Full report: { decision, success_probability, expected_attendance_rate, ... }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Main entry point called by the event controller after a new event is created.
 *
 * 1. Fetches the freshly-inserted event row.
 * 2. Queries organizer stats and market average price.
 * 3. Builds the ML feature payload.
 * 4. Calls the Flask predict service.
 * 5. Updates event_status and ai_decision_report in MySQL.
 *
 * On any error: sets event_status = 'pending' and stores an error report.
 * Never throws — all errors are swallowed so the caller's response is unaffected.
 */
async function applyAiDecisionToEvent(eventId) {
  try {
    // 1. Load the freshly-created event
    const [eventRows] = await pool.execute(
      `SELECT id, event_type, event_date, max_seats, listing_fee,
              price_standard, organizer_id, ai_marketing_requested
       FROM events WHERE id = ? LIMIT 1`,
      [eventId]
    );
    if (!eventRows.length) {
      console.warn(`[aiDecisionService] Event ${eventId} not found — skipping AI decision.`);
      return;
    }
    const event = eventRows[0];

    // 2. Fetch organizer history and market avg
    const [organizerStats, marketAvgPrice] = await Promise.all([
      getOrganizerStats(event.organizer_id, eventId),
      getMarketAvgPrice(event.event_type, event.price_standard)
    ]);

    // 3. Build payload
    const payload = buildFeaturePayload(event, organizerStats, marketAvgPrice);

    // 4. Call Flask service
    const report = await fetchAiDecision(payload);

    // 5a. Determine new status from decision field
    const newStatus = report.decision === 'accepted' ? 'approved' : 'rejected';

    // 5b. Write back to DB
    await pool.execute(
      `UPDATE events
       SET event_status       = ?,
           ai_decision_report = ?
       WHERE id = ?`,
      [newStatus, JSON.stringify(report), eventId]
    );

    console.log(
      `[aiDecisionService] Event ${eventId} → ${newStatus} ` +
      `(success_prob=${report.success_probability}, ` +
      `attendance_rate=${report.expected_attendance_rate})`
    );
  } catch (error) {
    // On any failure: leave status as 'pending', store error report
    console.error(`[aiDecisionService] Failed for event ${eventId}:`, error.message);

    const errorReport = {
      decision: 'error',
      error: error.message || 'Unknown error from AI predict service',
      timestamp: new Date().toISOString()
    };

    try {
      await pool.execute(
        `UPDATE events
         SET event_status       = 'pending',
             ai_decision_report = ?
         WHERE id = ?`,
        [JSON.stringify(errorReport), eventId]
      );
    } catch (dbErr) {
      console.error(`[aiDecisionService] Could not write error report for ${eventId}:`, dbErr.message);
    }
  }
}

module.exports = { applyAiDecisionToEvent };
