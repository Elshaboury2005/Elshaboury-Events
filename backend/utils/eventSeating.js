function toSafeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function deriveSeatCountsFromTotal(totalSeats) {
  const total = toSafeInteger(totalSeats, 0);
  // Remove all automatic percentage calculations completely as per requirement.
  // Values must come directly from what the venue owner manually entered.
  // If not provided explicitly, they remain 0.
  return {
    total,
    standard: total, // Fallback to all standard if only total is given, to avoid breaking legacy events
    special: 0,
    vip: 0
  };
}

function resolveSeatConfig(source) {
  if (source == null) {
    return { total: 0, standard: 0, special: 0, vip: 0 };
  }

  if (typeof source === 'number') {
    return { total: toSafeInteger(source, 0), standard: toSafeInteger(source, 0), special: 0, vip: 0 };
  }

  const maxSeats = toSafeInteger(source.max_seats ?? source.maxSeats, 0);
  const explicitStandard = source.standard_seats ?? source.standardSeats;
  const explicitSpecial = source.special_seats ?? source.specialSeats;
  const explicitVip = source.vip_seats ?? source.vipSeats;

  const hasExplicitCounts =
    explicitStandard != null ||
    explicitSpecial != null ||
    explicitVip != null;

  if (!hasExplicitCounts) {
    // If no explicit counts exist, default to all standard seats instead of using percentages
    return {
      total: maxSeats,
      standard: maxSeats,
      special: 0,
      vip: 0
    };
  }

  const standard = toSafeInteger(explicitStandard, 0);
  const special = toSafeInteger(explicitSpecial, 0);
  const vip = toSafeInteger(explicitVip, 0);
  
  // Total must be the exact sum of manual entries
  const total = standard + special + vip;

  return {
    total,
    standard,
    special,
    vip
  };
}

function getTicketCapacity(source, ticketType) {
  const config = resolveSeatConfig(source);
  const normalized = String(ticketType || 'standard').trim().toLowerCase();
  if (normalized === 'vip') return config.vip;
  if (normalized === 'special') return config.special;
  return config.standard;
}

module.exports = {
  toSafeInteger,
  deriveSeatCountsFromTotal,
  resolveSeatConfig,
  getTicketCapacity
};
