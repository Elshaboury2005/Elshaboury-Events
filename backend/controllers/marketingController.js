const Event = require('../models/Event');
const MarketingSetup = require('../models/MarketingSetup');
const { requestOpenAIPlan } = require('../services/openAiMarketingService');

const ALLOWED_GOALS = ['profit', 'brand_awareness', 'community_building', 'lead_generation', 'product_launch'];
const ALLOWED_INCOME_LEVELS = ['low', 'medium', 'high'];

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1') return true;
    if (normalized === '0') return false;
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return null;
}

function isValidHttpUrl(raw) {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isEventPaid(event) {
  return String(event?.payment_status || '').trim().toLowerCase() === 'paid';
}

function deriveWorkflowStatus(event) {
  if (!isEventPaid(event)) return 'Locked';
  if (event.event_status === 'approved') return 'Published';
  return 'Paid';
}

function toBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0' || value == null) return false;
  return Boolean(value);
}

function serializeSetup(setup) {
  if (!setup) return null;
  let interests = [];
  try {
    interests = JSON.parse(setup.audience_interests || '[]');
    if (!Array.isArray(interests)) interests = [];
  } catch (_) {
    interests = [];
  }
  return {
    marketingBudget: Number(setup.marketing_budget || 0),
    primaryGoal: setup.primary_goal,
    incomeLevel: setup.income_level,
    audienceInterests: interests,
    expectedTicketSales: Number(setup.expected_ticket_sales || 0),
    estimatedEventCost: Number(setup.estimated_event_cost || 0),
    instagramUrl: setup.instagram_url || '',
    facebookUrl: setup.facebook_url || '',
    isFirstEvent: toBoolean(setup.is_first_event),
    averagePreviousAttendance:
      setup.average_previous_attendance == null ? null : Number(setup.average_previous_attendance)
  };
}

async function getAuthorizedEvent(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) return { error: { code: 404, message: 'Event not found' } };
  if (event.organizer_id !== userId) {
    return { error: { code: 403, message: 'Only event organizer can access marketing setup' } };
  }
  return { event };
}

function buildMarketingAccessState(event) {
  const paymentCompleted = isEventPaid(event);
  return {
    aiMarketingRequested: true,
    paymentCompleted,
    workflowStatus: deriveWorkflowStatus(event),
    canAccessSetup: paymentCompleted,
    lockedMessage: paymentCompleted
      ? null
      : 'AI Marketing Plan is locked until event payment is completed.'
  };
}

function validateSetup(body) {
  const errors = [];
  const marketingBudget = Number(body.marketingBudget);
  const expectedTicketSales = Number(body.expectedTicketSales);
  const estimatedEventCost = Number(body.estimatedEventCost);
  const primaryGoal = String(body.primaryGoal || '').trim();
  const incomeLevel = String(body.incomeLevel || '').trim().toLowerCase();
  const instagramUrl = String(body.instagramUrl || '').trim();
  const facebookUrl = String(body.facebookUrl || '').trim();
  const isFirstEvent = parseBoolean(body.isFirstEvent);

  const audienceInterests = Array.isArray(body.audienceInterests)
    ? body.audienceInterests.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (!Number.isFinite(marketingBudget) || marketingBudget <= 0) {
    errors.push('Marketing Budget must be a positive number');
  }
  if (!ALLOWED_GOALS.includes(primaryGoal)) errors.push('Primary Goal is invalid');
  if (!ALLOWED_INCOME_LEVELS.includes(incomeLevel)) errors.push('Target Audience Income Level is invalid');
  if (!audienceInterests.length) errors.push('Audience Interests is required');
  if (!Number.isFinite(expectedTicketSales) || expectedTicketSales < 1) {
    errors.push('Expected Ticket Sales must be at least 1');
  }
  if (!Number.isFinite(estimatedEventCost) || estimatedEventCost < 0) {
    errors.push('Estimated Total Event Cost must be zero or greater');
  }
  if (!instagramUrl) errors.push('Instagram URL is required');
  if (!facebookUrl) errors.push('Facebook URL is required');
  if (instagramUrl && !isValidHttpUrl(instagramUrl)) errors.push('Instagram URL must be a valid URL');
  if (facebookUrl && !isValidHttpUrl(facebookUrl)) errors.push('Facebook URL must be a valid URL');
  if (isFirstEvent === null) errors.push('Is this your first event? is required');

  let averagePreviousAttendance = null;
  if (isFirstEvent === false) {
    averagePreviousAttendance = Number(body.averagePreviousAttendance);
    if (!Number.isFinite(averagePreviousAttendance) || averagePreviousAttendance < 0) {
      errors.push('Average previous attendance must be zero or greater when this is not your first event');
    }
  }

  return {
    errors,
    payload: {
      marketingBudget,
      primaryGoal,
      incomeLevel,
      audienceInterests,
      expectedTicketSales,
      estimatedEventCost,
      instagramUrl,
      facebookUrl,
      isFirstEvent,
      averagePreviousAttendance
    }
  };
}

async function generatePlanForEvent(eventId, organizerId, body) {
  const { event, error } = await getAuthorizedEvent(eventId, organizerId);
  if (error) return { error };

  const access = buildMarketingAccessState(event);
  if (!access.canAccessSetup) {
    return { error: { code: 403, message: access.lockedMessage } };
  }

  const validated = validateSetup(body || {});
  if (validated.errors.length > 0) {
    return { error: { code: 400, message: validated.errors[0], errors: validated.errors } };
  }

  const saved = await MarketingSetup.upsert({
    eventId,
    organizerId,
    ...validated.payload
  });
  const serializedSetup = serializeSetup(saved);
  const plan = await requestOpenAIPlan({ event, setup: serializedSetup });

  return {
    event,
    setup: serializedSetup,
    plan
  };
}

exports.getAccess = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.userId;
    const { event, error } = await getAuthorizedEvent(eventId, userId);
    if (error) return res.status(error.code).json({ success: false, message: error.message });

    res.json({
      success: true,
      marketing: buildMarketingAccessState(event)
    });
  } catch (error) {
    console.error('Marketing access error:', error);
    res.status(500).json({ success: false, message: 'Error checking marketing access' });
  }
};

exports.getSetup = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.userId;
    const { error } = await getAuthorizedEvent(eventId, userId);
    if (error) return res.status(error.code).json({ success: false, message: error.message });

    const setup = await MarketingSetup.findByEventId(eventId);
    res.json({ success: true, setup: serializeSetup(setup) });
  } catch (error) {
    console.error('Get marketing setup error:', error);
    res.status(500).json({ success: false, message: 'Error loading marketing setup' });
  }
};

exports.saveSetup = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.userId;
    const { event, error } = await getAuthorizedEvent(eventId, userId);
    if (error) return res.status(error.code).json({ success: false, message: error.message });

    const access = buildMarketingAccessState(event);
    if (!access.canAccessSetup) {
      return res.status(403).json({ success: false, message: access.lockedMessage });
    }

    const validated = validateSetup(req.body || {});
    if (validated.errors.length > 0) {
      return res.status(400).json({ success: false, message: validated.errors[0], errors: validated.errors });
    }

    const saved = await MarketingSetup.upsert({
      eventId,
      organizerId: userId,
      ...validated.payload
    });
    res.json({ success: true, setup: serializeSetup(saved) });
  } catch (error) {
    console.error('Save marketing setup error:', error);
    res.status(500).json({ success: false, message: 'Error saving marketing setup' });
  }
};

exports.generatePlan = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.userId;

    const result = await generatePlanForEvent(eventId, userId, req.body || {});
    if (result.error) {
      return res.status(result.error.code).json({
        success: false,
        message: result.error.message,
        errors: result.error.errors || undefined
      });
    }

    res.json({
      success: true,
      message: 'Marketing plan generated successfully',
      setup: result.setup,
      plan: result.plan
    });
  } catch (error) {
    console.error('Generate marketing plan error:', error);
    const statusCode = Number(error.statusCode || 500);
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error generating marketing plan'
    });
  }
};

exports.generateMarketingPlan = async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = String(req.body?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }

    const result = await generatePlanForEvent(eventId, userId, req.body || {});
    if (result.error) {
      return res.status(result.error.code).json({
        success: false,
        message: result.error.message,
        errors: result.error.errors || undefined
      });
    }

    res.json({
      success: true,
      message: 'Marketing plan generated successfully',
      setup: result.setup,
      plan: result.plan
    });
  } catch (error) {
    console.error('Generate marketing plan (global endpoint) error:', error);
    const statusCode = Number(error.statusCode || 500);
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error generating marketing plan'
    });
  }
};

