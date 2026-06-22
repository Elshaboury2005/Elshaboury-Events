const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const MarketingSetup = {
  findByEventId: async (eventId) => {
    const [rows] = await pool.execute(
      `SELECT *
       FROM event_marketing_setups
       WHERE event_id = ?
       LIMIT 1`,
      [eventId]
    );
    return rows[0] || null;
  },

  upsert: async (payload) => {
    const existing = await MarketingSetup.findByEventId(payload.eventId);
    const params = [
      payload.eventId,
      payload.organizerId,
      payload.marketingBudget,
      payload.primaryGoal,
      payload.incomeLevel,
      JSON.stringify(payload.audienceInterests || []),
      payload.expectedTicketSales,
      payload.estimatedEventCost,
      payload.instagramUrl || null,
      payload.facebookUrl || null,
      payload.isFirstEvent,
      payload.averagePreviousAttendance
    ];

    if (existing) {
      await pool.execute(
        `UPDATE event_marketing_setups
         SET organizer_id = ?,
             marketing_budget = ?,
             primary_goal = ?,
             income_level = ?,
             audience_interests = ?,
             expected_ticket_sales = ?,
             estimated_event_cost = ?,
             instagram_url = ?,
             facebook_url = ?,
             is_first_event = ?,
             average_previous_attendance = ?
         WHERE event_id = ?`,
        [
          payload.organizerId,
          payload.marketingBudget,
          payload.primaryGoal,
          payload.incomeLevel,
          JSON.stringify(payload.audienceInterests || []),
          payload.expectedTicketSales,
          payload.estimatedEventCost,
          payload.instagramUrl || null,
          payload.facebookUrl || null,
          payload.isFirstEvent,
          payload.averagePreviousAttendance,
          payload.eventId
        ]
      );
      return MarketingSetup.findByEventId(payload.eventId);
    }

    const id = uuidv4();
    await pool.execute(
      `INSERT INTO event_marketing_setups (
         id, event_id, organizer_id, marketing_budget, primary_goal, income_level,
         audience_interests, expected_ticket_sales, estimated_event_cost,
         instagram_url, facebook_url, is_first_event, average_previous_attendance
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ...params]
    );
    return MarketingSetup.findByEventId(payload.eventId);
  }
};

module.exports = MarketingSetup;
