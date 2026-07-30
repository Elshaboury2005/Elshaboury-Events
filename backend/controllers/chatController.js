const {
  resolveEventChatAccess,
  setEventChatLockState,
  getEventChatStatus,
  getRecentEventChatMessages,
  markEventChatRead,
  getMyEventChats
} = require('../services/chatService');
const { getIo } = require('../utils/socketHandler');

exports.getMyEvents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const events = await getMyEventChats(userId);
    return res.json({
      success: true,
      data: { events }
    });
  } catch (error) {
    console.error('Get my chat events error:', error);
    return res.status(500).json({ success: false, error: 'Error loading chat events' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const fallbackUsername = req.user.username || '';

    const access = await resolveEventChatAccess(eventId, userId, fallbackUsername);
    if (!access.eventExists) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    if (!access.canAccess) {
      return res.status(403).json({ success: false, error: 'You are not allowed to access this event chat' });
    }

    const messages = await getRecentEventChatMessages(access.eventId || eventId, 50);
    return res.json({
      success: true,
      data: { messages }
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    return res.status(500).json({ success: false, error: 'Error loading chat messages' });
  }
};

exports.canAccess = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const fallbackUsername = req.user.username || '';

    const access = await resolveEventChatAccess(eventId, userId, fallbackUsername);
    if (!access.eventExists) {
      return res.json({
        success: true,
        data: {
          canAccess: false,
          isHost: false
        }
      });
    }

    return res.json({
      success: true,
      data: {
        canAccess: Boolean(access.canAccess),
        isHost: Boolean(access.isHost),
        username: access.username,
        eventId: access.eventId || eventId
      }
    });
  } catch (error) {
    console.error('Can access chat error:', error);
    return res.status(500).json({ success: false, error: 'Error checking chat access' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const fallbackUsername = req.user.username || '';

    const access = await resolveEventChatAccess(eventId, userId, fallbackUsername);
    if (!access.eventExists) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    if (!access.canAccess) {
      return res.status(403).json({ success: false, error: 'You are not allowed to access this event chat' });
    }

    await markEventChatRead(access.eventId, userId);
    return res.json({
      success: true,
      data: { eventId: access.eventId }
    });
  } catch (error) {
    console.error('Mark chat read error:', error);
    return res.status(500).json({ success: false, error: 'Error marking chat as read' });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const fallbackUsername = req.user.username || '';

    const status = await getEventChatStatus(eventId, userId, fallbackUsername);
    if (!status.success) {
      return res.status(status.status || 400).json({
        success: false,
        error: status.message || 'Unable to load chat status'
      });
    }

    return res.json({
      success: true,
      data: {
        eventId: status.eventId,
        chat_locked: Boolean(status.chatLocked),
        is_host: Boolean(status.isHost)
      }
    });
  } catch (error) {
    console.error('Get chat status error:', error);
    return res.status(500).json({ success: false, error: 'Error loading chat status' });
  }
};

async function setLockState(req, res, locked) {
  const { eventId } = req.params;
  const userId = req.user.userId;
  const fallbackUsername = req.user.username || '';

  const result = await setEventChatLockState(eventId, userId, fallbackUsername, locked);
  if (!result.success) {
    return res.status(result.status || 400).json({
      success: false,
      error: result.message || 'Unable to update chat lock state'
    });
  }

  try {
    const io = getIo();
    const lockMessage = result.chatLocked
      ? '\uD83D\uDD12 Chat locked \u2014 Only the host can send messages now.'
      : '\uD83D\uDD13 Chat unlocked \u2014 Everyone can send messages now.';

    io.to(`event-chat-${result.eventId}`).emit('chat-lock-changed', {
      eventId: result.eventId,
      locked: Boolean(result.chatLocked),
      changedBy: result.username,
      message: lockMessage,
      timestamp: new Date().toISOString()
    });
  } catch (socketError) {
    console.warn('Chat lock broadcast warning:', socketError.message);
  }

  return res.json({
    success: true,
    data: {
      eventId: result.eventId,
      chat_locked: Boolean(result.chatLocked)
    }
  });
}

exports.lock = async (req, res) => {
  try {
    return await setLockState(req, res, true);
  } catch (error) {
    console.error('Lock chat error:', error);
    return res.status(500).json({ success: false, error: 'Error locking chat' });
  }
};

exports.unlock = async (req, res) => {
  try {
    return await setLockState(req, res, false);
  } catch (error) {
    console.error('Unlock chat error:', error);
    return res.status(500).json({ success: false, error: 'Error unlocking chat' });
  }
};
