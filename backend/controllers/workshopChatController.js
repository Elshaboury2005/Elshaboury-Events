const WorkshopMessage = require('../models/WorkshopMessage');
const pool = require('../config/database');

exports.getMessages = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;
    const catId = Number(categoryId);
    const since = req.query.since ? parseInt(req.query.since, 10) : null;

    let rows;
    if (since && !isNaN(since)) {
      const [data] = await pool.execute(
        `SELECT m.*, mem.email AS sender_email, mem.role AS sender_role
         FROM workshop_messages m
         JOIN workshop_members mem ON m.sender_id = mem.id
         WHERE m.category_id = ? AND m.id > ?
         ORDER BY m.id ASC`,
        [catId, since]
      );
      rows = data;
    } else {
      rows = await WorkshopMessage.findByCategoryId(catId, 50);
    }

    return res.json({ success: true, messages: rows });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching chat messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { categoryId, workshopMemberId } = req.workshopMember;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    const messageId = await WorkshopMessage.create({
      categoryId,
      senderId: workshopMemberId,
      message: message.trim()
    });

    return res.status(201).json({ success: true, messageId });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending message' });
  }
};

exports.deleteOwnMessage = async (req, res) => {
  try {
    const { workshopMemberId } = req.workshopMember;
    const messageId = parseInt(req.params.id, 10);

    const deleted = await WorkshopMessage.deleteOwn(messageId, workshopMemberId);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        message: 'Message not found, unauthorized, or the 5-minute deletion window has expired'
      });
    }

    return res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('deleteOwnMessage error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting message' });
  }
};
