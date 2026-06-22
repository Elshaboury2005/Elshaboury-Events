const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

function toTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        if (typeof item.channel === 'string') return item.channel.trim();
        if (typeof item.name === 'string') return item.name.trim();
        if (typeof item.title === 'string') return item.title.trim();
        return JSON.stringify(item);
      }
      return toTrimmedString(item);
    })
    .filter(Boolean);
}

function parseJsonObject(content) {
  const raw = toTrimmedString(content);
  if (!raw) throw new Error('Empty AI response');

  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = raw.slice(start, end + 1);
      return JSON.parse(candidate);
    }
    throw new Error('AI response is not valid JSON');
  }
}

function normalizePlanShape(rawPlan) {
  const estimatedRoiValue =
    rawPlan?.estimated_roi ??
    rawPlan?.estimatedRoi ??
    rawPlan?.roi ??
    '';

  return {
    strategy: toTrimmedString(rawPlan?.strategy),
    channels: normalizeStringArray(rawPlan?.channels),
    estimated_roi: toTrimmedString(estimatedRoiValue),
    advantages: normalizeStringArray(rawPlan?.advantages),
    risks: normalizeStringArray(rawPlan?.risks),
    recommendations: normalizeStringArray(rawPlan?.recommendations)
  };
}

function buildSystemPrompt() {
  return [
    'You are a professional event marketing strategist.',
    'Analyze the event data and generate a realistic marketing plan.',
    'Include marketing channels, advantages, risks, estimated ROI, and recommendations.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "strategy": "string",',
    '  "channels": ["string"],',
    '  "estimated_roi": "string",',
    '  "advantages": ["string"],',
    '  "risks": ["string"],',
    '  "recommendations": ["string"]',
    '}',
    'Do not include markdown, code fences, or additional keys.'
  ].join(' ');
}

function buildUserPrompt({ event, setup }) {
  return JSON.stringify(
    {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.event_date,
        location: event.location,
        maxSeats: Number(event.max_seats || 0),
        availableSeats: Number(event.available_seats || 0),
        ticketPrices: {
          standard: Number(event.price_standard || 0),
          special: Number(event.price_special || 0),
          vip: Number(event.price_vip || 0)
        },
        workflowStatus: event.event_status || 'pending'
      },
      marketingInput: {
        marketingBudget: Number(setup.marketingBudget || 0),
        primaryGoal: setup.primaryGoal,
        incomeLevel: setup.incomeLevel,
        audienceInterests: Array.isArray(setup.audienceInterests) ? setup.audienceInterests : [],
        expectedTicketSales: Number(setup.expectedTicketSales || 0),
        estimatedEventCost: Number(setup.estimatedEventCost || 0),
        instagramUrl: setup.instagramUrl || '',
        facebookUrl: setup.facebookUrl || '',
        isFirstEvent: Boolean(setup.isFirstEvent),
        averagePreviousAttendance:
          setup.averagePreviousAttendance == null ? null : Number(setup.averagePreviousAttendance)
      }
    },
    null,
    2
  );
}

async function requestOpenAIPlan({ event, setup }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.statusCode = 500;
    throw err;
  }
  if (typeof fetch !== 'function') {
    const err = new Error('Global fetch is unavailable. Use Node.js 18+');
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt({ event, setup }) }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message || 'OpenAI request failed';
    const err = new Error(apiMessage);
    err.statusCode = response.status === 429 ? 429 : 502;
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('OpenAI response did not include generated content');
    err.statusCode = 502;
    throw err;
  }

  const parsed = parseJsonObject(content);
  return normalizePlanShape(parsed);
}

module.exports = {
  requestOpenAIPlan
};

