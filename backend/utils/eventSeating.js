function toSafeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function deriveSeatCountsFromTotal(totalSeats) {
  const total = toSafeInteger(totalSeats, 0);
  const standard = Math.floor(total * 0.5);
  const special = Math.floor(total * (2 / 6));
  const vip = Math.max(0, total - standard - special);
  return {
    total,
    standard,
    special,
    vip
  };
}

function resolveSeatConfig(source) {
  if (source == null) {
    return deriveSeatCountsFromTotal(0);
  }

  if (typeof source === 'number') {
    return deriveSeatCountsFromTotal(source);
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
    return deriveSeatCountsFromTotal(maxSeats);
  }

  const standard = toSafeInteger(explicitStandard, 0);
  const special = toSafeInteger(explicitSpecial, 0);
  const vip = toSafeInteger(explicitVip, 0);
  const total = standard + special + vip;

  if (total <= 0) {
    return deriveSeatCountsFromTotal(maxSeats);
  }

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
