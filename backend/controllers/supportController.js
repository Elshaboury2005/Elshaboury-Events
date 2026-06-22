const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');

const SUPPORT_TICKET_CATEGORIES = [
  'General Inquiry',
  'Booking Issue',
  'Payment Issue',
  'Event Issue',
  'Technical Problem',
  'Other'
];

const SUPPORT_TICKET_CATEGORY_MAP = new Map(
  SUPPORT_TICKET_CATEGORIES.map((label) => [label.toLowerCase(), label])
);

function normalizeSupportTicketCategory(rawCategory) {
  const value = String(rawCategory || '').trim().toLowerCase();
  return SUPPORT_TICKET_CATEGORY_MAP.get(value) || 'General Inquiry';
}

exports.getMySupportTickets = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Sign in is required' });
    }

    const tickets = await SupportTicket.findByUserId(userId);
    return res.json({ success: true, tickets });
  } catch (error) {
    console.error('Get my support tickets error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load your support tickets' });
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const category = normalizeSupportTicketCategory(req.body.category);
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Sign in is required' });
    }

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    if (subject.length > 255) {
      return res.status(400).json({ success: false, message: 'Subject must be 255 characters or less' });
    }

    if (message.length > 500) {
      return res.status(400).json({ success: false, message: 'Message must be 500 characters or less' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found' });
    }

    const senderName = String(user.full_name || user.username || 'User').trim();

    await SupportTicket.create({
      id: uuidv4(),
      userId: user.id,
      name: senderName,
      email: user.email,
      subject,
      category,
      message
    });

    return res.status(201).json({ success: true, message: 'Support ticket submitted' });
  } catch (error) {
    console.error('Create support ticket error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit support ticket' });
  }
};
