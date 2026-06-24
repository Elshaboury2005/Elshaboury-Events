const {
  resolveDirectChatAccess,
  getRecentDirectChatMessages,
  markDirectChatRead,
  getDirectChatsForUser
} = require('../services/directChatService');

exports.getMyDirectChats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const chats = await getDirectChatsForUser(userId);
    return res.json({
      success: true,
      chats
    });
  } catch (error) {
    console.error('Get my direct chats error:', error);
    return res.status(500).json({ success: false, message: 'Error loading direct chats' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { venueBookingId } = req.params;
    const userId = req.user.userId;

    const access = await resolveDirectChatAccess(venueBookingId, userId);
    if (!access.canAccess) {
      return res.status(403).json({ success: false, message: 'You are not allowed to access this chat' });
    }

    const messages = await getRecentDirectChatMessages(access.chatId, 50);
    return res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get direct chat messages error:', error);
    return res.status(500).json({ success: false, message: 'Error loading chat messages' });
  }
};

exports.canAccess = async (req, res) => {
  try {
    const { venueBookingId } = req.params;
    const userId = req.user.userId;

    const access = await resolveDirectChatAccess(venueBookingId, userId);
    if (!access.canAccess) {
      return res.json({
        success: true,
        canAccess: false,
        isHost: false,
        isOwner: false
      });
    }

    return res.json({
      success: true,
      canAccess: true,
      isHost: access.isHost,
      isOwner: access.isOwner,
      chatId: access.chatId,
      eventId: access.eventId
    });
  } catch (error) {
    console.error('Can access direct chat error:', error);
    return res.status(500).json({ success: false, message: 'Error checking chat access' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { venueBookingId } = req.params;
    const userId = req.user.userId;

    const access = await resolveDirectChatAccess(venueBookingId, userId);
    if (!access.canAccess) {
      return res.status(403).json({ success: false, message: 'You are not allowed to access this chat' });
    }

    await markDirectChatRead(access.chatId, userId);
    return res.json({
      success: true,
      chatId: access.chatId
    });
  } catch (error) {
    console.error('Mark direct chat read error:', error);
    return res.status(500).json({ success: false, message: 'Error marking chat as read' });
  }
};
