function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Number(amount.toFixed(2));
}

function normalizeSeatCount(rawSeatCount) {
  return Math.max(1, parseInt(rawSeatCount, 10) || 1);
}

function resolveUnitPrice({ unitPrice, amount, seatCount }) {
  const normalizedSeatCount = normalizeSeatCount(seatCount);
  const normalizedAmount = roundMoney(amount) || 0;
  const explicitUnitPrice = Number(unitPrice);

  if (Number.isFinite(explicitUnitPrice) && explicitUnitPrice > 0) {
    return Math.max(0, roundMoney(explicitUnitPrice) || 0);
  }

  return Math.max(
    0,
    roundMoney(normalizedSeatCount > 0 ? normalizedAmount / normalizedSeatCount : normalizedAmount) || 0
  );
}

function computePerTicketDiscount({ discountType, discountValue, unitPrice }) {
  const normalizedUnitPrice = Math.max(0, roundMoney(unitPrice) || 0);
  let perTicketDiscount = 0;

  if (String(discountType || '').toLowerCase() === 'percent') {
    perTicketDiscount = normalizedUnitPrice * (Number(discountValue || 0) / 100);
  } else {
    perTicketDiscount = Number(discountValue || 0);
  }

  return Math.max(0, Math.min(normalizedUnitPrice, roundMoney(perTicketDiscount) || 0));
}

function computePerTicketPromoTotals({
  amount,
  discountType,
  discountValue,
  seatCount,
  unitPrice
}) {
  const normalizedAmount = roundMoney(amount) || 0;
  const normalizedSeatCount = normalizeSeatCount(seatCount);
  const normalizedUnitPrice = resolveUnitPrice({
    unitPrice,
    amount: normalizedAmount,
    seatCount: normalizedSeatCount
  });
  const discountPerTicket = computePerTicketDiscount({
    discountType,
    discountValue,
    unitPrice: normalizedUnitPrice
  });

  const discountAmount = Math.max(
    0,
    Math.min(normalizedAmount, roundMoney(discountPerTicket * normalizedSeatCount) || 0)
  );
  const finalAmount = Math.max(0, roundMoney(normalizedAmount - discountAmount) || 0);

  return {
    discountAmount,
    finalAmount,
    discountPerTicket,
    seatCount: normalizedSeatCount,
    unitPrice: normalizedUnitPrice
  };
}

module.exports = {
  normalizeSeatCount,
  resolveUnitPrice,
  computePerTicketDiscount,
  computePerTicketPromoTotals
};
