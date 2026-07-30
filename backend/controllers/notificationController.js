const Notification = require('../models/Notification');

exports.getAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const unreadOnly = req.query.unreadOnly === 'true';
    const notifications = await Notification.findByUserId(userId, unreadOnly);
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('Get notifications error:', error);
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
      return res.status(500).json({
        success: false,
        error: 'Database table "notifications" not found. Please run the database migration script.'
      });
    }
    res.status(500).json({ success: false, error: error.message || 'Error fetching notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const updated = await Notification.markAsRead(id, userId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    res.json({ success: true, data: { message: 'Notification marked as read' } });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, error: 'Error updating notification' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await Notification.markAllAsRead(userId);
    res.json({ success: true, data: { message: 'All notifications marked as read' } });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ success: false, error: 'Error updating notifications' });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const deleted = await Notification.deleteById(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    res.json({ success: true, data: { message: 'Notification deleted' } });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, error: 'Error deleting notification' });
  }
};

exports.deleteAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    await Notification.deleteAllByUserId(userId);
    res.json({ success: true, data: { message: 'All notifications deleted' } });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ success: false, error: 'Error deleting notifications' });
  }
};
