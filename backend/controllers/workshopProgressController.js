const pool = require('../config/database');

exports.getProgress = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;

    // 1. Fetch task status counts
    const [taskCounts] = await pool.execute(
      `SELECT status, COUNT(*) as count FROM workshop_tasks WHERE category_id = ? GROUP BY status`,
      [categoryId]
    );

    let todo = 0;
    let in_progress = 0;
    let done = 0;

    taskCounts.forEach(row => {
      if (row.status === 'todo') todo = parseInt(row.count, 10);
      if (row.status === 'in_progress') in_progress = parseInt(row.count, 10);
      if (row.status === 'done') done = parseInt(row.count, 10);
    });

    const totalTasks = todo + in_progress + done;
    const completionPercentage = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

    // 2. Overdue tasks count
    const [overdueRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM workshop_tasks 
       WHERE category_id = ? AND status != 'done' AND due_date < CURDATE()`,
      [categoryId]
    );
    const overdueTasks = parseInt(overdueRows[0].count, 10) || 0;

    // 3. Member count
    const [memberRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM workshop_members WHERE category_id = ?`,
      [categoryId]
    );
    const memberCount = parseInt(memberRows[0].count, 10) || 0;

    // 4. Upcoming meeting count
    const [meetingRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM workshop_events WHERE category_id = ? AND event_date >= CURDATE()`,
      [categoryId]
    );
    const upcomingMeetings = parseInt(meetingRows[0].count, 10) || 0;

    return res.json({
      success: true,
      stats: {
        totalTasks,
        todo,
        in_progress,
        done,
        completionPercentage,
        overdueTasks,
        memberCount,
        upcomingMeetings
      }
    });
  } catch (error) {
    console.error('getProgress error:', error);
    return res.status(500).json({ success: false, message: 'Server error computing progress report' });
  }
};
