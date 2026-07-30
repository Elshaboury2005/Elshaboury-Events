const WorkshopTask = require('../models/WorkshopTask');
const WorkshopMember = require('../models/WorkshopMember');
const logWorkshopActivity = require('../utils/logWorkshopActivity');
const { notifyMember } = require('../utils/createWorkshopNotification');

exports.getTasks = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;
    const tasks = await WorkshopTask.findByCategoryId(categoryId);
    return res.json({ success: true, data: { tasks } });
  } catch (error) {
    console.error('getTasks error:', error);
    return res.status(500).json({ success: false, error: 'Server error fetching tasks' });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const { title, description, assignedTo, dueDate, priority } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Task title is required' });
    }

    let finalAssignedTo = assignedTo ? parseInt(assignedTo, 10) : null;

    // Server-side validation of assignee based on role
    if (role === 'member') {
      if (finalAssignedTo !== null && finalAssignedTo !== workshopMemberId) {
        return res.status(403).json({
          success: false,
          error: 'Regular members can only assign tasks to themselves or leave them unassigned'
        });
      }
    } else {
      // For head/vice_head, if assigning, make sure the assignee belongs to the same category
      if (finalAssignedTo !== null) {
        const members = await WorkshopMember.findByCategoryId(categoryId);
        const exists = members.some(m => m.id === finalAssignedTo);
        if (!exists) {
          return res.status(400).json({ success: false, error: 'Assignee must be a member of your category' });
        }
      }
    }

    const taskId = await WorkshopTask.create({
      categoryId,
      title: title.trim(),
      description,
      assignedTo: finalAssignedTo,
      createdBy: workshopMemberId,
      dueDate,
      priority
    });

    // Notify assignee if it's assigned to someone else
    if (finalAssignedTo && finalAssignedTo !== workshopMemberId) {
      await notifyMember(
        finalAssignedTo,
        `You have been assigned a new task: "${title.trim()}"`,
        '/html/workshop/workshop-tasks.html'
      );
    }

    await logWorkshopActivity(categoryId, workshopMemberId, 'task_created', `${email} created task "${title.trim()}"`);

    return res.status(201).json({ success: true, data: { message: 'Task created successfully', taskId } });
  } catch (error) {
    console.error('createTask error:', error);
    return res.status(500).json({ success: false, error: 'Server error creating task' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const taskId = parseInt(req.params.id, 10);
    const { title, description, assignedTo, dueDate, priority } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Task title is required' });
    }

    const task = await WorkshopTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Must belong to the same category
    if (task.category_id !== categoryId) {
      return res.status(403).json({ success: false, error: 'Unauthorized category access' });
    }

    // Permission check: only creator, assignee, or head/vice_head can update details
    const isCreator = task.created_by === workshopMemberId;
    const isAssignee = task.assigned_to === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isCreator && !isAssignee && !isLead) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit this task' });
    }

    let finalAssignedTo = assignedTo ? parseInt(assignedTo, 10) : null;

    // Regular members cannot assign tasks to someone else
    if (!isLead) {
      if (finalAssignedTo !== null && finalAssignedTo !== workshopMemberId) {
        return res.status(403).json({
          success: false,
          error: 'Regular members can only assign tasks to themselves or leave them unassigned'
        });
      }
    } else {
      if (finalAssignedTo !== null) {
        const members = await WorkshopMember.findByCategoryId(categoryId);
        const exists = members.some(m => m.id === finalAssignedTo);
        if (!exists) {
          return res.status(400).json({ success: false, error: 'Assignee must be a member of your category' });
        }
      }
    }

    const oldAssignee = task.assigned_to;
    await WorkshopTask.updateDetails(taskId, {
      title: title.trim(),
      description,
      assignedTo: finalAssignedTo,
      dueDate,
      priority
    });

    // Notify new assignee if changed
    if (finalAssignedTo && finalAssignedTo !== oldAssignee && finalAssignedTo !== workshopMemberId) {
      await notifyMember(
        finalAssignedTo,
        `You have been assigned a task: "${title.trim()}"`,
        '/html/workshop/workshop-tasks.html'
      );
    }

    await logWorkshopActivity(categoryId, workshopMemberId, 'task_updated', `${email} updated task "${title.trim()}"`);

    return res.json({ success: true, data: { message: 'Task updated successfully' } });
  } catch (error) {
    console.error('updateTask error:', error);
    return res.status(500).json({ success: false, error: 'Server error updating task' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const taskId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const task = await WorkshopTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (task.category_id !== categoryId) {
      return res.status(403).json({ success: false, error: 'Unauthorized category access' });
    }

    // Permission: assignee or head/vice_head
    const isAssignee = task.assigned_to === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isAssignee && !isLead) {
      return res.status(403).json({ success: false, error: 'You do not have permission to change this task status' });
    }

    const oldStatus = task.status;
    await WorkshopTask.updateStatus(taskId, status);

    // Notify creator and/or assignee if they didn't make the change
    const msg = `Task "${task.title}" status changed from "${oldStatus}" to "${status}"`;
    if (task.created_by !== workshopMemberId) {
      await notifyMember(task.created_by, msg, '/html/workshop/workshop-tasks.html');
    }
    if (task.assigned_to && task.assigned_to !== workshopMemberId && task.assigned_to !== task.created_by) {
      await notifyMember(task.assigned_to, msg, '/html/workshop/workshop-tasks.html');
    }

    await logWorkshopActivity(
      categoryId,
      workshopMemberId,
      'task_status_changed',
      `${email} marked "${task.title}" as ${status.replace('_', ' ')}`
    );

    return res.json({ success: true, data: { message: 'Task status updated' } });
  } catch (error) {
    console.error('updateTaskStatus error:', error);
    return res.status(500).json({ success: false, error: 'Server error updating task status' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const taskId = parseInt(req.params.id, 10);

    const task = await WorkshopTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (task.category_id !== categoryId) {
      return res.status(403).json({ success: false, error: 'Unauthorized category access' });
    }

    // Permission: creator or head/vice_head
    const isCreator = task.created_by === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isCreator && !isLead) {
      return res.status(403).json({ success: false, error: 'Only the task creator or category leads can delete tasks' });
    }

    await WorkshopTask.delete(taskId);

    await logWorkshopActivity(categoryId, workshopMemberId, 'task_deleted', `${email} deleted task "${task.title}"`);

    return res.json({ success: true, data: { message: 'Task deleted successfully' } });
  } catch (error) {
    console.error('deleteTask error:', error);
    return res.status(500).json({ success: false, error: 'Server error deleting task' });
  }
};
