const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/authMiddleware');
const {
  resolveEventChatAccess,
  sanitizeChatMessage,
  saveEventChatMessage,
  markEventChatRead,
  getUnreadCountForEvent
} = require('../services/chatService');

const CHAT_RATE_LIMIT_MS = 1000;
const CHAT_UNAVAILABLE_MESSAGE = 'This event has ended and its chat is no longer available';
const CHAT_LOCKED_REASON_MESSAGE = 'Chat is in announcement mode. Only the host can send messages.';
const lastMessageAtByUserAndEvent = new Map();

let io;

function normalizeEventId(eventIdRaw) {
  return String(eventIdRaw || '').trim();
}

function getEventChatRoomName(eventId) {
  return `event-chat-${eventId}`;
}

function findJoinedChatRoomByEventId(socket, eventIdRaw) {
  if (!(socket?.data?.eventChatRooms instanceof Map)) return null;
  const normalized = normalizeEventId(eventIdRaw).toLowerCase();
  if (!normalized) return null;

  for (const [roomName, roomInfo] of socket.data.eventChatRooms.entries()) {
    const roomEventId = String(roomInfo?.eventId || '').trim().toLowerCase();
    if (roomEventId === normalized) {
      return { roomName, roomInfo };
    }
  }
  return null;
}

function verifySocketToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  try {
    return jwt.verify(normalizedToken, getJwtSecret());
  } catch (_) {
    return null;
  }
}

function getOnlineCount(roomName) {
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? room.size : 0;
}

function emitOnlineCount(roomName, delayMs = 0) {
  if (!io) return;
  const eventId = String(roomName || '').startsWith('event-chat-') ? String(roomName).slice('event-chat-'.length) : '';
  const send = () => {
    io.to(roomName).emit('chat-online-count', {
      eventId,
      onlineCount: getOnlineCount(roomName)
    });
  };

  if (delayMs > 0) {
    setTimeout(send, delayMs);
    return;
  }
  send();
}

const setupSocket = (server) => {
  const corsOrigin = process.env.CORS_ORIGIN || true;
  io = socketIo(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    socket.data.eventChatRooms = new Map();
    console.log('Client connected:', socket.id);

    socket.on('join_event_room', (eventId) => {
      const safeEventId = normalizeEventId(eventId);
      if (!safeEventId) return;
      socket.join(safeEventId);
      console.log(`Socket ${socket.id} joined room ${safeEventId}`);
    });

    socket.on('join-event-chat', async (payload = {}) => {
      try {
        const eventId = normalizeEventId(payload.eventId);
        const claims = verifySocketToken(payload.token);
        const silentJoin = Boolean(payload.silent);
        const shouldMarkRead = payload.markRead !== false;

        if (!eventId || !claims?.userId) {
          socket.emit('chat-unauthorized');
          return;
        }

        const access = await resolveEventChatAccess(eventId, claims.userId, claims.username || '');
        if (!access.eventExists) {
          socket.emit('chat-unauthorized');
          return;
        }
        if (access.isEventEnded) {
          socket.emit('chat-unavailable', {
            eventId: String(access.eventId || eventId),
            message: CHAT_UNAVAILABLE_MESSAGE
          });
          return;
        }
        if (!access.canAccess) {
          socket.emit('chat-unauthorized');
          return;
        }

        const canonicalEventId = String(access.eventId || eventId);
        const roomName = getEventChatRoomName(canonicalEventId);
        const previousRoom = findJoinedChatRoomByEventId(socket, canonicalEventId);

        if (previousRoom && previousRoom.roomName !== roomName) {
          socket.leave(previousRoom.roomName);
          socket.data.eventChatRooms.delete(previousRoom.roomName);
        }

        const alreadyJoined = socket.data.eventChatRooms.has(roomName);

        socket.join(roomName);
        socket.data.eventChatRooms.set(roomName, {
          eventId: canonicalEventId,
          userId: String(claims.userId),
          username: access.username,
          isHost: Boolean(access.isHost)
        });

        socket.emit('chat-authorized', {
          eventId: canonicalEventId,
          userId: String(claims.userId),
          username: access.username,
          isHost: Boolean(access.isHost),
          chatLocked: Boolean(access.chatLocked),
          onlineCount: getOnlineCount(roomName)
        });

        if (!alreadyJoined && !silentJoin) {
          io.to(roomName).emit('user-joined', {
            eventId: canonicalEventId,
            username: access.username,
            isHost: Boolean(access.isHost),
            timestamp: new Date().toISOString()
          });
        }

        if (shouldMarkRead) {
          await markEventChatRead(canonicalEventId, claims.userId);
          socket.emit('unread-cleared', {
            eventId: canonicalEventId,
            unreadCount: 0
          });
        }

        emitOnlineCount(roomName);
      } catch (error) {
        console.error('join-event-chat error:', error);
        socket.emit('chat-error', { message: 'Unable to join event chat right now' });
      }
    });

    socket.on('send-chat-message', async (payload = {}) => {
      try {
        const eventId = normalizeEventId(payload.eventId);
        const claims = verifySocketToken(payload.token);

        if (!eventId || !claims?.userId) {
          socket.emit('chat-unauthorized');
          return;
        }

        const access = await resolveEventChatAccess(eventId, claims.userId, claims.username || '');
        if (!access.eventExists) {
          socket.emit('chat-unauthorized');
          return;
        }
        if (access.isEventEnded) {
          socket.emit('chat-unavailable', {
            eventId: String(access.eventId || eventId),
            message: CHAT_UNAVAILABLE_MESSAGE
          });
          return;
        }
        if (!access.canAccess) {
          socket.emit('chat-unauthorized');
          return;
        }

        const canonicalEventId = String(access.eventId || eventId);
        if (access.chatLocked && !access.isHost) {
          socket.emit('message-blocked', {
            eventId: canonicalEventId,
            reason: CHAT_LOCKED_REASON_MESSAGE
          });
          return;
        }

        const roomName = getEventChatRoomName(canonicalEventId);
        const existingRoom = findJoinedChatRoomByEventId(socket, canonicalEventId);
        if (!existingRoom) {
          socket.join(roomName);
          socket.data.eventChatRooms.set(roomName, {
            eventId: canonicalEventId,
            userId: String(claims.userId),
            username: access.username,
            isHost: Boolean(access.isHost)
          });
        }

        const message = sanitizeChatMessage(payload.message);
        if (!message) {
          return;
        }

        const rateKey = `${claims.userId}:${canonicalEventId.toLowerCase()}`;
        const now = Date.now();
        const lastSentAt = lastMessageAtByUserAndEvent.get(rateKey) || 0;
        if (now - lastSentAt < CHAT_RATE_LIMIT_MS) {
          return;
        }
        lastMessageAtByUserAndEvent.set(rateKey, now);

        const savedMessage = await saveEventChatMessage({
          eventId: canonicalEventId,
          userId: claims.userId,
          username: access.username,
          message,
          isHost: Boolean(access.isHost)
        });
        if (!savedMessage) return;

        io.to(roomName).emit('new-chat-message', {
          id: savedMessage.id,
          eventId: canonicalEventId,
          user_id: String(savedMessage.user_id || claims.userId),
          username: savedMessage.username,
          message: savedMessage.message,
          isHost: Boolean(savedMessage.is_host),
          created_at: savedMessage.created_at
        });

        socket.to(roomName).emit('update-unread', {
          eventId: canonicalEventId,
          incrementBy: 1,
          lastMessage: savedMessage.message,
          lastMessageTime: savedMessage.created_at
        });
      } catch (error) {
        console.error('send-chat-message error:', error);
        socket.emit('chat-error', { message: 'Unable to send chat message right now' });
      }
    });

    socket.on('leave-event-chat', (payload = {}) => {
      const eventId = normalizeEventId(payload.eventId);
      if (!eventId) return;

      const matched = findJoinedChatRoomByEventId(socket, eventId);
      if (!matched) return;

      const roomName = matched.roomName;
      const roomInfo = matched.roomInfo;

      socket.leave(roomName);
      socket.data.eventChatRooms.delete(roomName);

      const username = String(roomInfo?.username || payload.username || '').trim() || 'User';
      io.to(roomName).emit('user-left', {
        eventId: String(roomInfo?.eventId || eventId),
        username,
        timestamp: new Date().toISOString()
      });

      emitOnlineCount(roomName, 10);
    });

    socket.on('mark-as-read', async (payload = {}) => {
      try {
        const eventId = normalizeEventId(payload.eventId);
        const claims = verifySocketToken(payload.token);
        if (!eventId || !claims?.userId) {
          socket.emit('chat-unauthorized');
          return;
        }

        const access = await resolveEventChatAccess(eventId, claims.userId, claims.username || '');
        if (!access.eventExists) {
          socket.emit('chat-unauthorized');
          return;
        }
        if (access.isEventEnded) {
          socket.emit('chat-unavailable', {
            eventId: String(access.eventId || eventId),
            message: CHAT_UNAVAILABLE_MESSAGE
          });
          return;
        }
        if (!access.canAccess) {
          socket.emit('chat-unauthorized');
          return;
        }

        const canonicalEventId = String(access.eventId || eventId);
        await markEventChatRead(canonicalEventId, claims.userId);
        const unreadCount = await getUnreadCountForEvent(canonicalEventId, claims.userId);

        socket.emit('unread-cleared', {
          eventId: canonicalEventId,
          unreadCount
        });
      } catch (error) {
        console.error('mark-as-read error:', error);
        socket.emit('chat-error', { message: 'Unable to mark messages as read right now' });
      }
    });

    socket.on('typing', async (payload = {}) => {
      try {
        const eventId = normalizeEventId(payload.eventId);
        const claims = verifySocketToken(payload.token);
        if (!eventId || !claims?.userId) return;

        const access = await resolveEventChatAccess(eventId, claims.userId, claims.username || '');
        if (!access.eventExists || !access.canAccess || access.isEventEnded) return;
        if (access.chatLocked && !access.isHost) return;

        const canonicalEventId = String(access.eventId || eventId);
        const roomName = getEventChatRoomName(canonicalEventId);
        socket.to(roomName).emit('typing', {
          eventId: canonicalEventId,
          username: access.username,
          isHost: Boolean(access.isHost)
        });
      } catch (_) {}
    });

    socket.on('stop-typing', async (payload = {}) => {
      try {
        const eventId = normalizeEventId(payload.eventId);
        const claims = verifySocketToken(payload.token);
        if (!eventId || !claims?.userId) return;

        const access = await resolveEventChatAccess(eventId, claims.userId, claims.username || '');
        if (!access.eventExists || !access.canAccess || access.isEventEnded) return;
        if (access.chatLocked && !access.isHost) return;

        const canonicalEventId = String(access.eventId || eventId);
        const roomName = getEventChatRoomName(canonicalEventId);
        socket.to(roomName).emit('stop-typing', {
          eventId: canonicalEventId,
          username: access.username
        });
      } catch (_) {}
    });

    socket.on('disconnecting', () => {
      if (!(socket.data.eventChatRooms instanceof Map) || socket.data.eventChatRooms.size === 0) {
        return;
      }

      const timestamp = new Date().toISOString();
      socket.data.eventChatRooms.forEach((roomInfo, roomName) => {
        socket.to(roomName).emit('user-left', {
          eventId: String(roomInfo?.eventId || ''),
          username: String(roomInfo?.username || 'User'),
          timestamp
        });
        emitOnlineCount(roomName, 10);
      });

      socket.data.eventChatRooms.clear();
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { setupSocket, getIo };
