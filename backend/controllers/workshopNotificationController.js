const WorkshopNotification = require('../models/WorkshopNotification');

exports.getNotifications = async (req, res) => {
  try {
    const { workshopMemberId } = req.workshopMember;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;

    const notifications = await WorkshopNotification.findByMemberId(workshopMemberId, limit, offset);
    return res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('getNotifications error:', error);
    return res.status(500).json({ success: false, error: 'Server error fetching notifications' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { workshopMemberId } = req.workshopMember;
    const notificationId = parseInt(req.params.id, 10);

    const updated = await WorkshopNotification.markRead(notificationId, workshopMemberId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found or unauthorized' });
    }

    return res.json({ success: true, data: { message: 'Notification marked as read' } });
  } catch (error) {
    console.error('markRead error:', error);
    return res.status(500).json({ success: false, error: 'Server error updating notification' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const { workshopMemberId } = req.workshopMember;
    await WorkshopNotification.markAllRead(workshopMemberId);
    return res.json({ success: true, data: { message: 'All notifications marked as read' } });
  } catch (error) {
    console.error('markAllRead error:', error);
    return res.status(500).json({ success: false, error: 'Server error marking notifications read' });
  }
};
