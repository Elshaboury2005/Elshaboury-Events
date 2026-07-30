const WorkshopEvent = require('../models/WorkshopEvent');
const logWorkshopActivity = require('../utils/logWorkshopActivity');
const { notifyCategory } = require('../utils/createWorkshopNotification');

exports.getEvents = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;
    const events = await WorkshopEvent.findByCategoryId(categoryId);
    return res.json({ success: true, data: { events } });
  } catch (error) {
    console.error('getEvents error:', error);
    return res.status(500).json({ success: false, error: 'Server error fetching events' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, email } = req.workshopMember;
    const { title, description, eventDate, startTime, endTime, location } = req.body;

    if (!title || !title.trim() || !eventDate || !startTime) {
      return res.status(400).json({ success: false, error: 'Title, date, and start time are required' });
    }

    const eventId = await WorkshopEvent.create({
      categoryId,
      title: title.trim(),
      description,
      eventDate,
      startTime,
      endTime,
      location,
      createdBy: workshopMemberId
    });

    // Notify all other category members
    await notifyCategory(
      categoryId,
      `New meeting proposed: "${title.trim()}" on ${eventDate}`,
      workshopMemberId,
      '/html/workshop/workshop-calendar.html'
    );

    await logWorkshopActivity(categoryId, workshopMemberId, 'meeting_created', `${email} proposed meeting "${title.trim()}"`);

    return res.status(201).json({ success: true, data: { message: 'Meeting created successfully', eventId } });
  } catch (error) {
    console.error('createEvent error:', error);
    return res.status(500).json({ success: false, error: 'Server error proposing meeting' });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const eventId = parseInt(req.params.id, 10);
    const { title, description, eventDate, startTime, endTime, location } = req.body;

    if (!title || !title.trim() || !eventDate || !startTime) {
      return res.status(400).json({ success: false, error: 'Title, date, and start time are required' });
    }

    const event = await WorkshopEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    if (event.category_id !== categoryId) {
      return res.status(403).json({ success: false, error: 'Unauthorized category access' });
    }

    // Permission: creator or head/vice_head
    const isCreator = event.created_by === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isCreator && !isLead) {
      return res.status(403).json({ success: false, error: 'Only the creator or category leads can edit this meeting' });
    }

    await WorkshopEvent.update(eventId, {
      title: title.trim(),
      description,
      eventDate,
      startTime,
      endTime,
      location
    });

    await logWorkshopActivity(categoryId, workshopMemberId, 'meeting_updated', `${email} updated meeting "${title.trim()}"`);

    return res.json({ success: true, data: { message: 'Meeting updated successfully' } });
  } catch (error) {
    console.error('updateEvent error:', error);
    return res.status(500).json({ success: false, error: 'Server error updating meeting' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const eventId = parseInt(req.params.id, 10);

    const event = await WorkshopEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    if (event.category_id !== categoryId) {
      return res.status(403).json({ success: false, error: 'Unauthorized category access' });
    }

    // Permission: creator or head/vice_head
    const isCreator = event.created_by === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isCreator && !isLead) {
      return res.status(403).json({ success: false, error: 'Only the creator or category leads can delete this meeting' });
    }

    await WorkshopEvent.delete(eventId);

    await logWorkshopActivity(categoryId, workshopMemberId, 'meeting_deleted', `${email} deleted meeting "${event.title}"`);

    return res.json({ success: true, data: { message: 'Meeting deleted successfully' } });
  } catch (error) {
    console.error('deleteEvent error:', error);
    return res.status(500).json({ success: false, error: 'Server error deleting meeting' });
  }
};
