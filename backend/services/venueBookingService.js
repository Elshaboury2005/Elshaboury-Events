const VenueBooking = require('../models/VenueBooking');
const { creditWalletRefundInTransaction } = require('../utils/refundWalletUtils');

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

function calculateListingFee(totalSeats) {
  const seats = Math.max(0, Number(totalSeats || 0));
  if (seats <= 500) {
    return { tier: 'Small', capacity: 500, fee: 5000 };
  }
  if (seats <= 1000) {
    return { tier: 'Medium', capacity: 1000, fee: 8000 };
  }
  return { tier: 'Large', capacity: 2000, fee: 12000 };
}

function calculateVenueRefundPolicy({ eventDate, totalPrice, forceFullRefund = false }) {
  const amount = roundMoney(totalPrice);
  if (amount <= 0) {
    return {
      refundAmount: 0,
      refundRate: 0,
      isRefunded: false,
      reason: 'No paid venue amount found'
    };
  }

  if (forceFullRefund) {
    return {
      refundAmount: amount,
      refundRate: 1,
      isRefunded: true,
      reason: 'Venue booking cancelled with full refund'
    };
  }

  const eventMoment = new Date(eventDate);
  if (Number.isNaN(eventMoment.getTime())) {
    return {
      refundAmount: amount,
      refundRate: 1,
      isRefunded: true,
      reason: 'Venue booking cancelled with full refund'
    };
  }

  const diffHours = (eventMoment.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours < 48) {
    return {
      refundAmount: 0,
      refundRate: 0,
      isRefunded: false,
      reason: 'Venue fee is non-refundable within 48 hours of the event'
    };
  }

  return {
    refundAmount: amount,
    refundRate: 1,
    isRefunded: true,
    reason: 'Venue booking cancelled with full refund'
  };
}

async function confirmVenueBookingAfterPayment({
  connection,
  venueBookingId,
  eventId,
  hostId
}) {
  if (!venueBookingId) return null;

  const booking = await VenueBooking.findById(venueBookingId, connection);
  if (!booking) {
    throw new Error('Venue booking not found');
  }
  if (booking.host_id !== hostId) {
    throw new Error('Venue booking does not belong to this host');
  }

  const conflicts = await VenueBooking.findByVenueAndDate(
    booking.venue_id,
    booking.event_date,
    ['confirmed'],
    connection
  );
  const conflictingRow = conflicts.find((row) => Number(row.id) !== Number(venueBookingId));
  if (conflictingRow) {
    throw new Error('Venue is no longer available on this date');
  }

  return VenueBooking.update(venueBookingId, {
    eventId,
    status: 'confirmed',
    paymentStatus: 'paid'
  }, connection);
}

async function cancelVenueBooking({
  connection,
  venueBookingId,
  eventId = null,
  hostId = null,
  forceFullRefund = false
}) {
  if (!venueBookingId) {
    return {
      booking: null,
      refundAmount: 0,
      walletBalance: null,
      refundIssued: false,
      reason: 'No venue booking linked to this event'
    };
  }

  const booking = await VenueBooking.findById(venueBookingId, connection);
  if (!booking) {
    return {
      booking: null,
      refundAmount: 0,
      walletBalance: null,
      refundIssued: false,
      reason: 'Venue booking not found'
    };
  }

  if (hostId && booking.host_id !== hostId) {
    throw new Error('Venue booking does not belong to this host');
  }

  if (String(booking.status || '').toLowerCase() === 'cancelled') {
    return {
      booking,
      refundAmount: 0,
      walletBalance: null,
      refundIssued: false,
      reason: 'Venue booking already cancelled'
    };
  }

  const policy = calculateVenueRefundPolicy({
    eventDate: booking.event_date,
    totalPrice: booking.total_price,
    forceFullRefund
  });

  let walletBalance = null;
  if (policy.refundAmount > 0 && String(booking.payment_status || '').toLowerCase() === 'paid') {
    const creditResult = await creditWalletRefundInTransaction({
      connection,
      userId: booking.host_id,
      amount: policy.refundAmount,
      description: `Refund for cancelled venue booking "${booking.venue_name || 'venue'}"`,
      relatedEventId: eventId || booking.event_id || null
    });
    walletBalance = creditResult.walletBalance;
  }

  const nextPaymentStatus = policy.refundAmount > 0 && String(booking.payment_status || '').toLowerCase() === 'paid'
    ? 'refunded'
    : booking.payment_status;

  const updated = await VenueBooking.update(booking.id, {
    eventId: eventId || booking.event_id || null,
    status: 'cancelled',
    paymentStatus: nextPaymentStatus
  }, connection);

  return {
    booking: updated,
    refundAmount: policy.refundAmount,
    walletBalance,
    refundIssued: policy.refundAmount > 0,
    reason: policy.reason
  };
}

module.exports = {
  roundMoney,
  calculateListingFee,
  calculateVenueRefundPolicy,
  confirmVenueBookingAfterPayment,
  cancelVenueBooking
};
