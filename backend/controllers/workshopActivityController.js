const WorkshopActivityLog = require('../models/WorkshopActivityLog');

exports.getActivityLog = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;
    const catId = Number(categoryId);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;

    const activities = await WorkshopActivityLog.findByCategoryId(catId, limit, offset);
    return res.json({ success: true, activities });
  } catch (error) {
    console.error('getActivityLog error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching activity log' });
  }
};
