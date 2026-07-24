const WorkshopActivityLog = require('../models/WorkshopActivityLog');

/**
 * Helper to log workshop activity without failing the parent request.
 */
async function logWorkshopActivity(categoryId, actorId, actionType, description) {
  try {
    await WorkshopActivityLog.create(categoryId, actorId, actionType, description);
  } catch (err) {
    console.error(`Failed to log workshop activity (type: ${actionType}):`, err.message);
  }
}

module.exports = logWorkshopActivity;
