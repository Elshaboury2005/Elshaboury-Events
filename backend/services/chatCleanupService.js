const pool = require('../config/database');

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

let cleanupSchedulerStarted = false;

async function cleanupExpiredEventChats() {
  const [result] = await pool.execute(
    `DELETE FROM event_chat_messages
     WHERE event_id IN (
       SELECT id
       FROM events
     WHERE (
         LOWER(COALESCE(event_status, '')) IN ('expired', 'ended')
         OR LOWER(COALESCE(lifecycle_status, '')) IN ('expired', 'ended')
       )
       AND event_date < DATE_SUB(NOW(), INTERVAL 7 DAY)
     )`
  );

  const deleted = Number(result?.affectedRows || 0);
  if (deleted > 0) {
    console.log(`Chat cleanup job: deleted ${deleted} expired event chat message(s).`);
  }
}

function startChatCleanupJob() {
  if (cleanupSchedulerStarted) return;
  cleanupSchedulerStarted = true;

  const runCleanup = async () => {
    try {
      await cleanupExpiredEventChats();
    } catch (error) {
      console.error('Chat cleanup job error:', error.message);
    }
  };

  if (cron) {
    cron.schedule('0 0 * * *', runCleanup);
  } else {
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
    console.warn('node-cron not installed; using setInterval fallback for chat cleanup job.');
  }

  console.log('Chat cleanup scheduler started (daily at midnight).');
}

module.exports = {
  startChatCleanupJob,
  cleanupExpiredEventChats
};
