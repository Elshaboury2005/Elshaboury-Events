const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

async function queueEmail({ userId = null, to, subject, body }) {
  if (!to || !subject || !body) return null;

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO email_outbox (id, user_id, email_to, subject, body, status)
     VALUES (?, ?, ?, ?, ?, 'queued')`,
    [id, userId, to, subject, body]
  );

  // Fallback behavior: queue + log. Real SMTP can be attached later.
  console.log(`[EMAIL QUEUED] to=${to} subject=${subject}`);
  return id;
}

module.exports = { queueEmail };
