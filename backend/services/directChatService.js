const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const CHAT_HISTORY_LIMIT = 50;
const CHAT_MESSAGE_MAX_LENGTH = 500;

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

async function createVenueBookingChat(venueBookingId, hostUserId, venueOwnerUserId) {
  try {
    // Check if chat already exists for this booking
    const [existingRows] = await pool.execute(
      'SELECT id FROM direct_chats WHERE venue_booking_id = ? LIMIT 1',
      [venueBookingId]
    );

    if (existingRows.length > 0) {
      return { success: true, chatId: existingRows[0].id };
    }

    const chatId = uuidv4();
    await pool.execute(
      `INSERT INTO direct_chats (id, venue_booking_id, host_user_id, venue_owner_user_id) 
       VALUES (?, ?, ?, ?)`,
      [chatId, venueBookingId, hostUserId, venueOwnerUserId]
    );

    // Add initial system message
    const initialMessage = "Your venue booking has been confirmed. You can now chat directly.";
    await pool.execute(
      `INSERT INTO direct_chat_messages (chat_id, sender_id, message) 
       VALUES (?, ?, ?)`,
      [chatId, venueOwnerUserId, initialMessage] // sending from venue owner conceptually, or system
    );

    return { success: true, chatId };
  } catch (error) {
    console.error('Error creating venue booking chat:', error);
    // Return gracefully so we don't break the main approval flow
    return { success: false, error: error.message };
  }
}

async function resolveDirectChatAccess(venueBookingId, userId) {
  if (!venueBookingId || !userId) {
    return { canAccess: false };
  }

  const bookingId = parseInt(venueBookingId, 10);
  if (!bookingId) return { canAccess: false };

  const [rows] = await pool.execute(
    `SELECT dc.id AS chat_id, dc.venue_booking_id, dc.host_user_id, dc.venue_owner_user_id, vb.event_id 
     FROM direct_chats dc 
     JOIN venue_bookings vb ON dc.venue_booking_id = vb.id
     WHERE dc.venue_booking_id = ? LIMIT 1`,
    [bookingId]
  );

  if (!rows.length) {
    return { canAccess: false };
  }

  const chat = rows[0];
  const canAccess = chat.host_user_id === userId || chat.venue_owner_user_id === userId;
  
  return {
    canAccess,
    chatId: chat.chat_id,
    venueBookingId: chat.venue_booking_id,
    eventId: chat.event_id,
    isHost: chat.host_user_id === userId,
    isOwner: chat.venue_owner_user_id === userId
  };
}

async function getRecentDirectChatMessages(chatId, limit = CHAT_HISTORY_LIMIT) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || CHAT_HISTORY_LIMIT), CHAT_HISTORY_LIMIT));

  const [rows] = await pool.execute(
    `SELECT dcm.id, dcm.chat_id, dcm.sender_id, u.username, u.full_name, dcm.message, dcm.created_at
     FROM direct_chat_messages dcm
     JOIN users u ON dcm.sender_id = u.id
     WHERE dcm.chat_id = ?
     ORDER BY dcm.created_at DESC, dcm.id DESC
     LIMIT ${safeLimit}`,
    [chatId]
  );

  return rows.reverse().map(row => ({
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    username: row.username,
    full_name: row.full_name,
    message: row.message,
    created_at: row.created_at
  }));
}

async function saveDirectChatMessage(chatId, senderId, message) {
  const [result] = await pool.execute(
    `INSERT INTO direct_chat_messages (chat_id, sender_id, message)
     VALUES (?, ?, ?)`,
    [chatId, senderId, message]
  );

  const [rows] = await pool.execute(
    `SELECT dcm.id, dcm.chat_id, dcm.sender_id, u.username, u.full_name, dcm.message, dcm.created_at
     FROM direct_chat_messages dcm
     JOIN users u ON dcm.sender_id = u.id
     WHERE dcm.id = ?
     LIMIT 1`,
    [result.insertId]
  );

  return rows[0] || null;
}

async function markDirectChatRead(chatId, userId) {
  if (!chatId || !userId) return false;

  await pool.execute(
    `INSERT INTO direct_chat_read_state (chat_id, user_id, last_read_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
    [chatId, userId]
  );

  return true;
}

async function getUnreadCountForDirectChat(chatId, userId) {
  if (!chatId || !userId) return 0;
  
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS unread_count
     FROM direct_chat_messages dcm
     WHERE dcm.chat_id = ?
       AND dcm.sender_id <> ?
       AND dcm.created_at > COALESCE(
         (
           SELECT drs.last_read_at
           FROM direct_chat_read_state drs
           WHERE drs.chat_id = ? AND drs.user_id = ?
           LIMIT 1
         ),
         '1970-01-01 00:00:00'
       )`,
    [chatId, userId, chatId, userId]
  );
  
  return Number(rows[0]?.unread_count || 0);
}

async function getDirectChatsForUser(userId) {
  if (!userId) return [];

  // Get all direct chats where the user is either the host or the venue owner
  const [rows] = await pool.execute(
    `SELECT 
       dc.id AS chat_id, 
       dc.venue_booking_id, 
       vb.event_date,
       v.name AS venue_name,
       e.title AS event_title,
       e.id AS event_id,
       (
         SELECT message 
         FROM direct_chat_messages dcm 
         WHERE dcm.chat_id = dc.id 
         ORDER BY dcm.created_at DESC, dcm.id DESC 
         LIMIT 1
       ) AS last_message,
       (
         SELECT created_at 
         FROM direct_chat_messages dcm 
         WHERE dcm.chat_id = dc.id 
         ORDER BY dcm.created_at DESC, dcm.id DESC 
         LIMIT 1
       ) AS last_message_time,
       (
         SELECT COUNT(*) 
         FROM direct_chat_messages dcm 
         WHERE dcm.chat_id = dc.id 
           AND dcm.sender_id <> ?
           AND dcm.created_at > COALESCE(
             (
               SELECT last_read_at 
               FROM direct_chat_read_state drs 
               WHERE drs.chat_id = dc.id AND drs.user_id = ?
               LIMIT 1
             ), 
             '1970-01-01 00:00:00'
           )
       ) AS unread_count,
       CASE WHEN dc.host_user_id = ? THEN 'host' ELSE 'venue_owner' END AS user_role,
       CASE WHEN dc.host_user_id = ? THEN u_owner.full_name ELSE u_host.full_name END AS other_party_name
     FROM direct_chats dc
     JOIN venue_bookings vb ON dc.venue_booking_id = vb.id
     JOIN venues v ON vb.venue_id = v.id
     LEFT JOIN events e ON vb.event_id = e.id
     JOIN users u_host ON dc.host_user_id = u_host.id
     JOIN users u_owner ON dc.venue_owner_user_id = u_owner.id
     WHERE dc.host_user_id = ? OR dc.venue_owner_user_id = ?
     ORDER BY COALESCE(last_message_time, dc.created_at) DESC`,
    [userId, userId, userId, userId, userId, userId]
  );

  return rows.map(row => ({
    chat_id: row.chat_id,
    venue_booking_id: row.venue_booking_id,
    venue_name: row.venue_name,
    event_title: row.event_title,
    event_id: row.event_id,
    event_date: row.event_date,
    other_party_name: row.other_party_name,
    user_role: row.user_role,
    last_message: row.last_message || '',
    last_message_time: row.last_message_time || null,
    unread_count: row.unread_count || 0
  }));
}

module.exports = {
  CHAT_MESSAGE_MAX_LENGTH,
  sanitizeChatMessage,
  createVenueBookingChat,
  resolveDirectChatAccess,
  getRecentDirectChatMessages,
  saveDirectChatMessage,
  markDirectChatRead,
  getUnreadCountForDirectChat,
  getDirectChatsForUser
};
