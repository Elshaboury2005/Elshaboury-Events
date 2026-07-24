const WorkshopNotification = require('../models/WorkshopNotification');
const WorkshopMember = require('../models/WorkshopMember');

/**
 * Sends a notification to a specific member.
 */
async function notifyMember(memberId, message, link = null) {
  try {
    await WorkshopNotification.create({ memberId, message, link });
  } catch (err) {
    console.error(`Failed to send notification to member ${memberId}:`, err.message);
  }
}

/**
 * Sends a notification to all members of a category, optionally excluding one.
 */
async function notifyCategory(categoryId, message, excludeMemberId = null, link = null) {
  try {
    const members = await WorkshopMember.findByCategoryId(categoryId);
    for (const m of members) {
      if (excludeMemberId && m.id === excludeMemberId) continue;
      await notifyMember(m.id, message, link);
    }
  } catch (err) {
    console.error(`Failed to notify category ${categoryId}:`, err.message);
  }
}

module.exports = {
  notifyMember,
  notifyCategory
};
