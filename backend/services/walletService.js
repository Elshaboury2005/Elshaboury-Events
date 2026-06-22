const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const WalletTransaction = require('../models/WalletTransaction');

const VALID_SOURCES = new Set(['refund', 'top-up', 'payment', 'event-payout', 'withdrawal', 'venue-booking']);

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Number(amount.toFixed(2));
}

function normalizeFilter(rawFilter) {
  const value = String(rawFilter || 'all').trim().toLowerCase();
  if (value === 'all') return 'all';
  if (value === 'refund' || value === 'refunds') return 'refund';
  if (value === 'payment' || value === 'payments') return 'payment';
  if (value === 'top-up' || value === 'topups' || value === 'topup' || value === 'top-ups') return 'top-up';
  if (value === 'event-payout' || value === 'eventpayout' || value === 'payout' || value === 'payouts') return 'event-payout';
  if (value === 'withdrawal' || value === 'withdrawals' || value === 'withdraw') return 'withdrawal';
  if (value === 'venue-booking' || value === 'venuebooking' || value === 'venue_booking') return 'venue-booking';
  return 'all';
}

async function lockUserWallet(userId, conn) {
  const db = conn || pool;
  const [rows] = await db.execute(
    'SELECT id, COALESCE(wallet_balance, 0) AS wallet_balance, COALESCE(frozen_balance, 0) AS frozen_balance FROM users WHERE id = ? FOR UPDATE',
    [userId]
  );
  return rows[0] || null;
}

async function updateWalletBalance(userId, newBalance, conn) {
  const db = conn || pool;
  await db.execute(
    'UPDATE users SET wallet_balance = ? WHERE id = ?',
    [newBalance, userId]
  );
}

async function updateFrozenBalance(userId, newFrozen, conn) {
  const db = conn || pool;
  await db.execute(
    'UPDATE users SET frozen_balance = ? WHERE id = ?',
    [newFrozen, userId]
  );
}

async function createWalletTransaction({
  userId,
  amount,
  type,
  source,
  description = null,
  relatedEventId = null,
  relatedBookingId = null,
  status = 'available',
  relatedVenueBookingId = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) {
    throw new Error('Wallet transaction amount must be a positive number');
  }
  if (type !== 'credit' && type !== 'debit') {
    throw new Error('Wallet transaction type must be credit or debit');
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error('Invalid wallet transaction source');
  }

  const transactionId = uuidv4();
  await WalletTransaction.create(
    conn,
    transactionId,
    userId,
    normalizedAmount,
    type,
    source,
    description,
    relatedEventId,
    relatedBookingId,
    status,
    relatedVenueBookingId
  );

  return { transactionId, amount: normalizedAmount };
}

async function creditWallet({
  userId,
  amount,
  source,
  description = null,
  relatedEventId = null,
  relatedBookingId = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) {
    throw new Error('Credit amount must be greater than 0');
  }

  const walletRow = await lockUserWallet(userId, conn);
  if (!walletRow) {
    throw new Error('User not found');
  }

  const currentBalance = roundMoney(walletRow.wallet_balance || 0) || 0;
  const newBalance = roundMoney(currentBalance + normalizedAmount);

  await updateWalletBalance(userId, newBalance, conn);
  const transaction = await createWalletTransaction({
    userId,
    amount: normalizedAmount,
    type: 'credit',
    source,
    description,
    relatedEventId,
    relatedBookingId,
    conn
  });

  return {
    ...transaction,
    previousBalance: currentBalance,
    newBalance
  };
}

async function debitWallet({
  userId,
  amount,
  source,
  description = null,
  relatedEventId = null,
  relatedBookingId = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) {
    throw new Error('Debit amount must be greater than 0');
  }

  const walletRow = await lockUserWallet(userId, conn);
  if (!walletRow) {
    throw new Error('User not found');
  }

  const currentBalance = roundMoney(walletRow.wallet_balance || 0) || 0;
  if (currentBalance < normalizedAmount) {
    throw new Error('Insufficient wallet balance');
  }

  const newBalance = roundMoney(currentBalance - normalizedAmount);
  await updateWalletBalance(userId, newBalance, conn);

  const transaction = await createWalletTransaction({
    userId,
    amount: normalizedAmount,
    type: 'debit',
    source,
    description,
    relatedEventId,
    relatedBookingId,
    conn
  });

  return {
    ...transaction,
    previousBalance: currentBalance,
    newBalance
  };
}

/**
 * Debit host wallet and credit venue owner frozen_balance as a 'held' transaction.
 * Called when venue owner accepts a booking request.
 */
async function holdFundsForVenueOwner({
  hostId,
  venueOwnerId,
  amount,
  venueBookingId,
  eventId = null,
  description = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) {
    throw new Error('Hold amount must be greater than 0');
  }

  // 1. Debit host wallet (spendable balance → out)
  await debitWallet({
    userId: hostId,
    amount: normalizedAmount,
    source: 'venue-booking',
    description: description || `Venue booking payment (held in escrow)`,
    relatedEventId: eventId,
    conn
  });

  // 2. Credit venue owner frozen_balance (NOT their spendable wallet_balance)
  const ownerRow = await lockUserWallet(venueOwnerId, conn);
  if (!ownerRow) {
    throw new Error('Venue owner not found');
  }

  const currentFrozen = roundMoney(ownerRow.frozen_balance || 0) || 0;
  const newFrozen = roundMoney(currentFrozen + normalizedAmount);
  await updateFrozenBalance(venueOwnerId, newFrozen, conn);

  // 3. Create 'held' credit transaction on venue owner's record
  const { transactionId } = await createWalletTransaction({
    userId: venueOwnerId,
    amount: normalizedAmount,
    type: 'credit',
    source: 'venue-booking',
    description: description || `Venue booking escrow hold`,
    relatedEventId: eventId,
    relatedVenueBookingId: venueBookingId,
    status: 'held',
    conn
  });

  return {
    transactionId,
    amount: normalizedAmount,
    hostNewBalance: null, // caller can query if needed
    ownerNewFrozen: newFrozen
  };
}

/**
 * Release held funds: move from venue owner's frozen_balance to wallet_balance.
 * Called by scheduled job after event completion + grace period.
 */
async function releaseFundsToVenueOwner({
  venueOwnerId,
  amount,
  venueBookingId,
  heldTransactionId,
  description = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) return;

  const db = conn || pool;

  // 1. Shift frozen → spendable
  const ownerRow = await lockUserWallet(venueOwnerId, db);
  if (!ownerRow) throw new Error('Venue owner not found for fund release');

  const currentFrozen = roundMoney(ownerRow.frozen_balance || 0) || 0;
  const currentBalance = roundMoney(ownerRow.wallet_balance || 0) || 0;
  const newFrozen = roundMoney(Math.max(0, currentFrozen - normalizedAmount));
  const newBalance = roundMoney(currentBalance + normalizedAmount);

  await db.execute(
    'UPDATE users SET frozen_balance = ?, wallet_balance = ? WHERE id = ?',
    [newFrozen, newBalance, venueOwnerId]
  );

  // 2. Mark original held transaction as released
  if (heldTransactionId) {
    await WalletTransaction.updateStatus(heldTransactionId, 'released', db);
  }

  // 3. Create a new 'available' credit transaction for the history record
  const newTxId = uuidv4();
  await WalletTransaction.create(
    db,
    newTxId,
    venueOwnerId,
    normalizedAmount,
    'credit',
    'venue-booking',
    description || 'Venue booking funds released after event completion',
    null,
    null,
    'available',
    venueBookingId
  );

  return { transactionId: newTxId, newBalance, newFrozen };
}

/**
 * Refund held funds back to host on cancellation.
 * Decrements owner's frozen_balance, credits host's wallet_balance.
 */
async function refundHeldFundsToHost({
  venueOwnerId,
  hostId,
  amount,
  venueBookingId,
  heldTransactionId,
  description = null,
  conn = null
}) {
  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount == null || normalizedAmount <= 0) return { refundAmount: 0 };

  const db = conn || pool;

  // 1. Remove from venue owner's frozen_balance
  const ownerRow = await lockUserWallet(venueOwnerId, db);
  if (ownerRow) {
    const currentFrozen = roundMoney(ownerRow.frozen_balance || 0) || 0;
    const newFrozen = roundMoney(Math.max(0, currentFrozen - normalizedAmount));
    await updateFrozenBalance(venueOwnerId, newFrozen, db);
  }

  // 2. Mark the held transaction as refunded
  if (heldTransactionId) {
    await WalletTransaction.updateStatus(heldTransactionId, 'refunded', db);
  }

  // 3. Credit host's spendable wallet
  const hostRow = await lockUserWallet(hostId, db);
  if (!hostRow) throw new Error('Host not found for venue booking refund');

  const currentHostBalance = roundMoney(hostRow.wallet_balance || 0) || 0;
  const newHostBalance = roundMoney(currentHostBalance + normalizedAmount);
  await updateWalletBalance(hostId, newHostBalance, db);

  // 4. Record refund credit transaction for host
  const refundTxId = uuidv4();
  await WalletTransaction.create(
    db,
    refundTxId,
    hostId,
    normalizedAmount,
    'credit',
    'refund',
    description || 'Venue booking refund',
    null,
    null,
    'available',
    venueBookingId
  );

  return {
    refundAmount: normalizedAmount,
    refundTransactionId: refundTxId,
    newHostBalance
  };
}

async function getWalletOverview(userId, rawFilter = 'all') {
  const filter = normalizeFilter(rawFilter);
  const [userResult, allTransactions] = await Promise.all([
    pool.execute(
      'SELECT COALESCE(wallet_balance, 0) AS wallet_balance, COALESCE(frozen_balance, 0) AS frozen_balance FROM users WHERE id = ? LIMIT 1',
      [userId]
    ),
    WalletTransaction.findByUserIdAsc(userId)
  ]);

  const [userRows] = userResult;
  const userRow = userRows[0] || null;

  if (!userRow) {
    throw new Error('User not found');
  }

  const currentBalance = roundMoney(userRow.wallet_balance || 0) || 0;
  const frozenBalance = roundMoney(userRow.frozen_balance || 0) || 0;

  // Running balance computed from available transactions only (held don't affect spendable)
  const availableTxns = allTransactions.filter((tx) => tx.status !== 'held');
  const netDelta = availableTxns.reduce((sum, tx) => {
    const amount = roundMoney(tx.amount || 0) || 0;
    return sum + (tx.type === 'credit' ? amount : -amount);
  }, 0);
  let running = roundMoney(currentBalance - netDelta) || 0;

  const withRunning = allTransactions.map((tx) => {
    const amount = roundMoney(tx.amount || 0) || 0;
    const isHeld = tx.status === 'held';
    if (!isHeld) {
      running = roundMoney(running + (tx.type === 'credit' ? amount : -amount)) || 0;
    }
    return {
      transactionId: tx.transaction_id,
      userId: tx.user_id,
      amount,
      type: tx.type,
      source: tx.source,
      status: tx.status || 'available',
      description: tx.description || '',
      relatedEventId: tx.related_event_id || null,
      relatedBookingId: tx.related_booking_id || null,
      relatedVenueBookingId: tx.related_venue_booking_id || null,
      createdAt: tx.created_at,
      runningBalanceAfter: isHeld ? null : running
    };
  });

  const filtered = filter === 'all'
    ? withRunning
    : withRunning.filter((tx) => tx.source === filter);

  return {
    filter,
    balance: currentBalance,
    frozenBalance,
    transactions: filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  };
}

module.exports = {
  roundMoney,
  normalizeFilter,
  lockUserWallet,
  creditWallet,
  debitWallet,
  holdFundsForVenueOwner,
  releaseFundsToVenueOwner,
  refundHeldFundsToHost,
  getWalletOverview
};
