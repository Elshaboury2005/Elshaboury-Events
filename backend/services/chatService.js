const pool = require('../config/database');

const CHAT_HISTORY_LIMIT = 50;
const CHAT_MESSAGE_MAX_LENGTH = 500;
const CHAT_READ_STATE_TABLE = 'event_chat_read_state';

let chatSchemaEnsurePromise = null;

function normalizeEventId(eventId) {
  return String(eventId || '').trim();
}

function isMissingTableError(error, tableName = '') {
  if (!error || error.code !== 'ER_NO_SUCH_TABLE') return false;
  if (!tableName) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes(String(tableName).toLowerCase());
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureChatSchema() {
  if (chatSchemaEnsurePromise) {
    return chatSchemaEnsurePromise;
  }

  chatSchemaEnsurePromise = (async () => {
    try {
      await pool.execute(
        `CREATE TABLE IF NOT EXISTS event_chat_read_state (
           user_id VARCHAR(36) NOT NULL,
           event_id VARCHAR(36) NOT NULL,
           last_read_at TIMESTAMP NULL,
           PRIMARY KEY (user_id, event_id),
           FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
           INDEX idx_chat_read_event (event_id)
         )`
      );

      const hasIsRead = await columnExists('event_chat_messages', 'is_read');
      if (!hasIsRead) {
        await pool.execute(
          'ALTER TABLE event_chat_messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE'
        );
      }

      const hasChatLocked = await columnExists('events', 'chat_locked');
      if (!hasChatLocked) {
        await pool.execute(
          'ALTER TABLE events ADD COLUMN chat_locked BOOLEAN NOT NULL DEFAULT FALSE'
        );
      }
    } catch (error) {
      console.warn('Chat schema ensure warning:', error.message);
    }
  })();

  return chatSchemaEnsurePromise;
}

function sanitizeChatMessage(rawMessage) {
  if (rawMessage == null) return '';
  let message = String(rawMessage)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!message) return '';
  if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
    message = message.slice(0, CHAT_MESSAGE_MAX_LENGTH);
  }
  return message;
}

function resolveDisplayName(userRow, fallbackUsername) {
  const fullName = String(userRow?.full_name || '').trim();
  const username = String(userRow?.username || '').trim();
  const fallback = String(fallbackUsername || '').trim();
  return fullName || username || fallback || 'User';
}

function isEventChatEnded(eventRow) {
  const lifecycleStatus = String(eventRow?.lifecycle_status || '').trim().toLowerCase();
  const eventStatus = String(eventRow?.event_status || eventRow?.status || '').trim().toLowerCase();

  const eventDate = new Date(eventRow?.event_date);
  const hasPastDate = Number.isFinite(eventDate.getTime()) && eventDate.getTime() <= Date.now();

  return (
    lifecycleStatus === 'expired' ||
    eventStatus === 'expired' ||
    eventStatus === 'ended' ||
    hasPastDate
  );
}

async function resolveEventChatAccess(eventIdRaw, userIdRaw, fallbackUsername = '') {
  const eventId = normalizeEventId(eventIdRaw);
  const userId = String(userIdRaw || '').trim();

  if (!eventId || !userId) {
    return {
      eventExists: false,
      canAccess: false,
      isHost: false,
      hasConfirmedBooking: false,
      username: resolveDisplayName(null, fallbackUsername)
    };
  }

  await ensureChatSchema();

  const [[eventRow]] = await pool.execute(
    'SELECT id, organizer_id, event_date, lifecycle_status, event_status, chat_locked FROM events WHERE id = ? LIMIT 1',
    [eventId]
  );
  if (!eventRow) {
    return {
      eventExists: false,
      canAccess: false,
      isHost: false,
      hasConfirmedBooking: false,
      isEventEnded: false,
      username: resolveDisplayName(null, fallbackUsername)
    };
  }

  const [[userRow]] = await pool.execute(
    'SELECT id, username, full_name FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const username = resolveDisplayName(userRow, fallbackUsername);
  const isEventEnded = isEventChatEnded(eventRow);

  const isHost = String(eventRow.organizer_id || '') === userId;
  let hasConfirmedBooking = false;

  if (!isHost) {
    const [bookingRows] = await pool.execute(
      `SELECT id
       FROM bookings
       WHERE event_id = ? AND user_id = ? AND status = 'confirmed'
       LIMIT 1`,
      [eventId, userId]
    );
    hasConfirmedBooking = bookingRows.length > 0;
  }

  return {
    eventExists: true,
    eventId: String(eventRow.id),
    canAccess: !isEventEnded && (isHost || hasConfirmedBooking),
    isHost,
    hasConfirmedBooking,
    isEventEnded,
    chatLocked: Boolean(eventRow.chat_locked),
    username
  };
}

async function setEventChatLockState(eventIdRaw, userIdRaw, fallbackUsername = '', locked = false) {
  const eventId = normalizeEventId(eventIdRaw);
  const userId = String(userIdRaw || '').trim();
  const nextLocked = Boolean(locked);

  const access = await resolveEventChatAccess(eventId, userId, fallbackUsername);
  if (!access.eventExists) {
    return {
      success: false,
      code: 'EVENT_NOT_FOUND',
      status: 404,
      message: 'Event not found'
    };
  }

  if (!access.isHost) {
    return {
      success: false,
      code: 'FORBIDDEN',
      status: 403,
      message: 'Only the host can change chat settings'
    };
  }

  if (access.isEventEnded) {
    return {
      success: false,
      code: 'EVENT_ENDED',
      status: 400,
      message: 'This event has ended and chat settings can no longer be changed'
    };
  }

  await pool.execute(
    'UPDATE events SET chat_locked = ? WHERE id = ?',
    [nextLocked ? 1 : 0, access.eventId]
  );

  return {
    success: true,
    eventId: access.eventId,
    chatLocked: nextLocked,
    username: access.username
  };
}

async function getEventChatStatus(eventIdRaw, userIdRaw, fallbackUsername = '') {
  const access = await resolveEventChatAccess(eventIdRaw, userIdRaw, fallbackUsername);
  if (!access.eventExists) {
    return {
      success: false,
      code: 'EVENT_NOT_FOUND',
      status: 404,
      message: 'Event not found'
    };
  }

  if (!access.canAccess) {
    return {
      success: false,
      code: 'FORBIDDEN',
      status: 403,
      message: 'You are not allowed to access this event chat'
    };
  }

  return {
    success: true,
    eventId: access.eventId,
    chatLocked: Boolean(access.chatLocked),
    isHost: Boolean(access.isHost),
    username: access.username
  };
}

async function getRecentEventChatMessages(eventIdRaw, limit = CHAT_HISTORY_LIMIT) {
  const eventId = normalizeEventId(eventIdRaw);
  const safeLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || CHAT_HISTORY_LIMIT), CHAT_HISTORY_LIMIT));
  if (!eventId) return [];

  // Keep LIMIT as an inline bounded integer for compatibility with MySQL setups
  // that reject bound parameters in LIMIT within prepared statements.
  const [rows] = await pool.execute(
    `SELECT id, event_id, user_id, username, message, is_host, created_at
     FROM event_chat_messages
     WHERE event_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [eventId]
  );

  return rows.reverse().map((row) => ({
    ...row,
    is_host: Boolean(row.is_host)
  }));
}

async function saveEventChatMessage({ eventId, userId, username, message, isHost }) {
  const [result] = await pool.execute(
    `INSERT INTO event_chat_messages (event_id, user_id, username, message, is_host)
     VALUES (?, ?, ?, ?, ?)`,
    [normalizeEventId(eventId), String(userId || ''), String(username || 'User'), message, isHost ? 1 : 0]
  );

  const [rows] = await pool.execute(
    `SELECT id, event_id, user_id, username, message, is_host, created_at
     FROM event_chat_messages
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    is_host: Boolean(rows[0].is_host)
  };
}

async function markEventChatRead(eventIdRaw, userIdRaw) {
  const eventId = normalizeEventId(eventIdRaw);
  const userId = String(userIdRaw || '').trim();
  if (!eventId || !userId) return false;

  try {
    await ensureChatSchema();
    await pool.execute(
      `INSERT INTO event_chat_read_state (user_id, event_id, last_read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [userId, eventId]
    );
  } catch (error) {
    if (isMissingTableError(error, CHAT_READ_STATE_TABLE)) {
      return false;
    }
    throw error;
  }

  return true;
}

async function getUnreadCountForEvent(eventIdRaw, userIdRaw) {
  const eventId = normalizeEventId(eventIdRaw);
  const userId = String(userIdRaw || '').trim();
  if (!eventId || !userId) return 0;

  let rows;
  try {
    await ensureChatSchema();
    [rows] = await pool.execute(
      `SELECT COUNT(*) AS unread_count
       FROM event_chat_messages m
       WHERE m.event_id = ?
         AND m.user_id <> ?
         AND m.created_at > COALESCE(
           (
             SELECT rs.last_read_at
             FROM event_chat_read_state rs
             WHERE rs.event_id = ? AND rs.user_id = ?
             LIMIT 1
           ),
           '1970-01-01 00:00:00'
         )`,
      [eventId, userId, eventId, userId]
    );
  } catch (error) {
    if (isMissingTableError(error, CHAT_READ_STATE_TABLE)) {
      return 0;
    }
    throw error;
  }

  return Number(rows[0]?.unread_count || 0);
}

async function getMyEventChatsFallback(userId) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM (
       SELECT
         e.id AS event_id,
         e.title AS event_name,
         e.event_date,
         (
           SELECT m.message
           FROM event_chat_messages m
           WHERE m.event_id = e.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS last_message,
         (
           SELECT m.created_at
           FROM event_chat_messages m
           WHERE m.event_id = e.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS last_message_time,
         0 AS unread_count
       FROM events e
       WHERE e.id IN (
         SELECT b.event_id
         FROM bookings b
         WHERE b.user_id = ? AND b.status = 'confirmed'
         UNION
         SELECT host_events.id
         FROM events host_events
         WHERE host_events.organizer_id = ?
       )
       AND LOWER(COALESCE(e.lifecycle_status, '')) NOT IN ('expired', 'ended')
       AND LOWER(COALESCE(e.event_status, '')) NOT IN ('expired', 'ended')
       AND (e.event_date IS NULL OR e.event_date >= NOW())
     ) chat_events
     ORDER BY COALESCE(chat_events.last_message_time, chat_events.event_date) DESC`,
    [userId, userId]
  );

  return rows.map((row) => ({
    event_id: row.event_id,
    event_name: row.event_name,
    event_date: row.event_date,
    unread_count: Number(row.unread_count || 0),
    last_message: row.last_message || '',
    last_message_time: row.last_message_time || null
  }));
}

async function getMyEventChats(userIdRaw) {
  const userId = String(userIdRaw || '').trim();
  if (!userId) return [];

  let rows;
  try {
    await ensureChatSchema();
    [rows] = await pool.execute(
      `SELECT *
       FROM (
         SELECT
           e.id AS event_id,
           e.title AS event_name,
           e.event_date,
           (
             SELECT m.message
             FROM event_chat_messages m
             WHERE m.event_id = e.id
             ORDER BY m.id DESC
             LIMIT 1
           ) AS last_message,
           (
             SELECT m.created_at
             FROM event_chat_messages m
             WHERE m.event_id = e.id
             ORDER BY m.id DESC
             LIMIT 1
           ) AS last_message_time,
           (
             SELECT COUNT(*)
             FROM event_chat_messages um
             WHERE um.event_id = e.id
               AND um.user_id <> ?
               AND um.created_at > COALESCE(
                 (
                   SELECT rs.last_read_at
                   FROM event_chat_read_state rs
                   WHERE rs.event_id = e.id AND rs.user_id = ?
                   LIMIT 1
                 ),
                 '1970-01-01 00:00:00'
               )
           ) AS unread_count
         FROM events e
         WHERE e.id IN (
           SELECT b.event_id
           FROM bookings b
           WHERE b.user_id = ? AND b.status = 'confirmed'
           UNION
           SELECT host_events.id
         FROM events host_events
         WHERE host_events.organizer_id = ?
        )
         AND LOWER(COALESCE(e.lifecycle_status, '')) NOT IN ('expired', 'ended')
         AND LOWER(COALESCE(e.event_status, '')) NOT IN ('expired', 'ended')
         AND (e.event_date IS NULL OR e.event_date >= NOW())
       ) chat_events
       ORDER BY COALESCE(chat_events.last_message_time, chat_events.event_date) DESC`,
      [userId, userId, userId, userId]
    );
  } catch (error) {
    if (isMissingTableError(error, CHAT_READ_STATE_TABLE)) {
      return getMyEventChatsFallback(userId);
    }
    throw error;
  }

  return rows.map((row) => ({
    event_id: row.event_id,
    event_name: row.event_name,
    event_date: row.event_date,
    unread_count: Number(row.unread_count || 0),
    last_message: row.last_message || '',
    last_message_time: row.last_message_time || null
  }));
}

module.exports = {
  CHAT_HISTORY_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
  sanitizeChatMessage,
  resolveEventChatAccess,
  setEventChatLockState,
  getEventChatStatus,
  getRecentEventChatMessages,
  saveEventChatMessage,
  markEventChatRead,
  getUnreadCountForEvent,
  getMyEventChats
};
