const pool = require('../config/database');
const { roundMoney, creditWallet } = require('./walletService');

let ensureVaultSchemaPromise = null;
const bookingSeatsExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

function normalizeId(value) {
  return String(value || '').trim();
}

function toMoney(value) {
  return roundMoney(value) || 0;
}

function isEventEnded(eventRow) {
  const lifecycle = String(eventRow?.lifecycle_status || '').trim().toLowerCase();
  const eventDate = new Date(eventRow?.event_date);
  const hasPassed = Number.isFinite(eventDate.getTime()) && eventDate.getTime() <= Date.now();
  return lifecycle === 'expired' || hasPassed;
}

async function ensureVaultSchema() {
  if (ensureVaultSchemaPromise) return ensureVaultSchemaPromise;

  ensureVaultSchemaPromise = (async () => {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS event_vaults (
         id INT AUTO_INCREMENT PRIMARY KEY,
         event_id VARCHAR(36) NOT NULL UNIQUE,
         balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         total_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         total_refunded DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         status ENUM('active', 'locked', 'released', 'withdrawn') NOT NULL DEFAULT 'active',
         withdrawal_requested_at TIMESTAMP NULL,
         withdrawn_at TIMESTAMP NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
         INDEX idx_event_vault_status (status)
       )`
    );

    await pool.execute(
      `CREATE TABLE IF NOT EXISTS event_vault_transactions (
         id INT AUTO_INCREMENT PRIMARY KEY,
         event_id VARCHAR(36) NOT NULL,
         booking_id VARCHAR(36) NULL,
         amount DECIMAL(12,2) NOT NULL,
         type ENUM('booking_payment', 'refund', 'withdrawal') NOT NULL,
         description VARCHAR(500) NULL,
         balance_after DECIMAL(12,2) NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
         FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
         INDEX idx_vault_tx_event_created (event_id, created_at),
         INDEX idx_vault_tx_type (type)
       )`
    );
  })().catch((error) => {
    ensureVaultSchemaPromise = null;
    throw error;
  });

  return ensureVaultSchemaPromise;
}

async function getEventForVault(connection, eventId, forUpdate = false) {
  const db = connection || pool;
  const [rows] = await db.execute(
    `SELECT id, organizer_id, title, event_date,
            COALESCE(lifecycle_status, CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END) AS lifecycle_status
     FROM events
     WHERE id = ?
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [eventId]
  );
  return rows[0] || null;
}

async function getVaultRow(connection, eventId, forUpdate = false) {
  const db = connection || pool;
  const [rows] = await db.execute(
    `SELECT id, event_id, balance, total_collected, total_refunded, total_withdrawn, status,
            withdrawal_requested_at, withdrawn_at, created_at
     FROM event_vaults
     WHERE event_id = ?
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [eventId]
  );
  return rows[0] || null;
}

function vaultLooksUninitialized(vault) {
  if (!vault) return true;
  return (
    toMoney(vault.balance) <= 0 &&
    toMoney(vault.total_collected) <= 0 &&
    toMoney(vault.total_refunded) <= 0 &&
    toMoney(vault.total_withdrawn) <= 0
  );
}

async function getWalletRefundWithdrawTotals(connection, eventId) {
  const db = connection || pool;
  const [[refundedRow]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_refunded
     FROM wallet_transactions
     WHERE related_event_id = ?
       AND source = 'refund'
       AND type = 'credit'`,
    [eventId]
  );
  const [[withdrawnRow]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_withdrawn
     FROM wallet_transactions
     WHERE related_event_id = ?
       AND source = 'event-payout'
       AND type = 'credit'`,
    [eventId]
  );

  return {
    totalRefunded: toMoney(refundedRow?.total_refunded),
    totalWithdrawn: toMoney(withdrawnRow?.total_withdrawn)
  };
}

async function getVaultTransactionStats(connection, eventId) {
  const db = connection || pool;
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total_count,
            COALESCE(SUM(CASE WHEN type = 'booking_payment' THEN 1 ELSE 0 END), 0) AS booking_payment_count
     FROM event_vault_transactions
     WHERE event_id = ?`,
    [eventId]
  );

  return {
    totalCount: Number(row?.total_count || 0),
    bookingPaymentCount: Number(row?.booking_payment_count || 0)
  };
}

async function buildLegacySnapshot(connection, eventId) {
  const db = connection || pool;
  const [[bookingCollectedRow]] = await db.execute(
    `SELECT COALESCE(
        SUM(
          CASE
            WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'vip' THEN
              (${bookingSeatsExpression}) * COALESCE(e.price_vip, 0)
            WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'special' THEN
              (${bookingSeatsExpression}) * COALESCE(e.price_special, 0)
            ELSE
              (${bookingSeatsExpression}) * COALESCE(e.price_standard, 0)
          END
        ),
        0
      ) AS total_collected
     FROM bookings b
     INNER JOIN events e ON e.id = b.event_id
     WHERE b.event_id = ?
       AND b.status IN ('confirmed', 'cancelled')`,
    [eventId]
  );
  const totals = await getWalletRefundWithdrawTotals(db, eventId);

  const totalCollected = toMoney(bookingCollectedRow?.total_collected);
  const totalRefunded = totals.totalRefunded;
  const totalWithdrawn = totals.totalWithdrawn;
  const balance = toMoney(Math.max(0, totalCollected - totalRefunded - totalWithdrawn));

  return {
    totalCollected,
    totalRefunded,
    totalWithdrawn,
    balance
  };
}

async function buildRevenueAlignedSnapshot(connection, eventId) {
  const db = connection || pool;
  const [[confirmedRevenueRow]] = await db.execute(
    `SELECT COALESCE(
        SUM(
          CASE
            WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'vip' THEN
              (${bookingSeatsExpression}) * COALESCE(e.price_vip, 0)
            WHEN LOWER(COALESCE(b.ticket_type, 'standard')) = 'special' THEN
              (${bookingSeatsExpression}) * COALESCE(e.price_special, 0)
            ELSE
              (${bookingSeatsExpression}) * COALESCE(e.price_standard, 0)
          END
        ),
        0
      ) AS confirmed_revenue
     FROM bookings b
     INNER JOIN events e ON e.id = b.event_id
     WHERE b.event_id = ?
       AND b.status = 'confirmed'`,
    [eventId]
  );
  const totals = await getWalletRefundWithdrawTotals(db, eventId);

  const confirmedRevenue = toMoney(confirmedRevenueRow?.confirmed_revenue);
  const totalRefunded = totals.totalRefunded;
  const totalWithdrawn = totals.totalWithdrawn;
  const balance = toMoney(Math.max(0, confirmedRevenue - totalWithdrawn));
  const totalCollected = toMoney(balance + totalRefunded + totalWithdrawn);

  return {
    totalCollected,
    totalRefunded,
    totalWithdrawn,
    balance
  };
}

function hasLegacyDrift(vault, legacy) {
  if (!vault || !legacy) return false;
  const eps = 0.01;
  return (
    Math.abs(toMoney(vault.balance) - toMoney(legacy.balance)) > eps ||
    Math.abs(toMoney(vault.total_collected) - toMoney(legacy.totalCollected)) > eps ||
    Math.abs(toMoney(vault.total_refunded) - toMoney(legacy.totalRefunded)) > eps ||
    Math.abs(toMoney(vault.total_withdrawn) - toMoney(legacy.totalWithdrawn)) > eps
  );
}

async function ensureEventVaultRow(connection, eventIdRaw, options = {}) {
  await ensureVaultSchema();

  const eventId = normalizeId(eventIdRaw);
  if (!eventId) throw new Error('eventId is required');

  const db = connection || pool;
  await db.execute(
    `INSERT INTO event_vaults (event_id)
     VALUES (?)
     ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
    [eventId]
  );

  const forUpdate = Boolean(options.forUpdate);
  let vault = await getVaultRow(db, eventId, forUpdate);
  if (!vault) return null;
  if (forUpdate) return vault;

  const vaultStatus = String(vault.status || '').toLowerCase();
  const shouldReconcile = vaultStatus !== 'withdrawn';
  if (shouldReconcile) {
    const txStats = await getVaultTransactionStats(db, eventId);
    let legacy = null;
    if (txStats.totalCount === 0) {
      legacy = await buildLegacySnapshot(db, eventId);
    } else if (txStats.bookingPaymentCount === 0) {
      // Legacy events may have refund logs but no booking_payment logs.
      // Keep vault balance aligned with the same confirmed-seat pricing model used by Total Revenue.
      legacy = await buildRevenueAlignedSnapshot(db, eventId);
    }

    if (!legacy) {
      return vault;
    }

    const event = await getEventForVault(db, eventId, false);
    if (vaultLooksUninitialized(vault) || hasLegacyDrift(vault, legacy)) {
      let status = String(vault.status || 'active');
      if (legacy.totalWithdrawn > 0 && legacy.balance <= 0) {
        status = 'withdrawn';
      } else if (event && isEventEnded(event) && legacy.balance > 0) {
        status = 'released';
      }

      await db.execute(
        `UPDATE event_vaults
         SET balance = ?,
             total_collected = ?,
             total_refunded = ?,
             total_withdrawn = ?,
             status = ?
         WHERE event_id = ?`,
        [legacy.balance, legacy.totalCollected, legacy.totalRefunded, legacy.totalWithdrawn, status, eventId]
      );

      vault = await getVaultRow(db, eventId, forUpdate);
    }
  }

  return vault;
}

async function insertVaultTransaction(connection, payload) {
  const db = connection || pool;
  await db.execute(
    `INSERT INTO event_vault_transactions
      (event_id, booking_id, amount, type, description, balance_after)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payload.eventId,
      payload.bookingId || null,
      toMoney(payload.amount),
      payload.type,
      payload.description || null,
      toMoney(payload.balanceAfter)
    ]
  );
}

function serializeVault(vault) {
  if (!vault) return null;
  return {
    eventId: normalizeId(vault.event_id),
    balance: toMoney(vault.balance),
    totalCollected: toMoney(vault.total_collected),
    totalRefunded: toMoney(vault.total_refunded),
    totalWithdrawn: toMoney(vault.total_withdrawn),
    status: String(vault.status || 'active'),
    withdrawalRequestedAt: vault.withdrawal_requested_at || null,
    withdrawnAt: vault.withdrawn_at || null,
    createdAt: vault.created_at || null
  };
}

async function addBookingPaymentToVault({
  connection,
  eventId,
  bookingId = null,
  amount,
  description = null
}) {
  const credited = toMoney(amount);
  if (credited <= 0) {
    return { applied: false, amount: 0, vault: serializeVault(await ensureEventVaultRow(connection, eventId)) };
  }

  const vault = await ensureEventVaultRow(connection, eventId, { forUpdate: true });
  if (!vault) {
    throw new Error('Event vault not found');
  }
  if (String(vault.status || '').toLowerCase() === 'withdrawn') {
    throw new Error('Cannot add payment to a withdrawn vault');
  }

  const nextBalance = toMoney(toMoney(vault.balance) + credited);
  const nextCollected = toMoney(toMoney(vault.total_collected) + credited);
  const nextStatus = String(vault.status || 'active').toLowerCase() === 'locked' ? 'locked' : 'active';

  await connection.execute(
    `UPDATE event_vaults
     SET balance = ?,
         total_collected = ?,
         status = ?
     WHERE event_id = ?`,
    [nextBalance, nextCollected, nextStatus, normalizeId(eventId)]
  );

  await insertVaultTransaction(connection, {
    eventId: normalizeId(eventId),
    bookingId: bookingId ? normalizeId(bookingId) : null,
    amount: credited,
    type: 'booking_payment',
    description,
    balanceAfter: nextBalance
  });

  const updated = await getVaultRow(connection, normalizeId(eventId), false);
  return { applied: true, amount: credited, vault: serializeVault(updated) };
}

async function processRefundFromVault({
  connection,
  eventId,
  bookingId = null,
  amount,
  description = null
}) {
  const refundAmount = toMoney(amount);
  if (refundAmount <= 0) {
    return { applied: false, amount: 0, vault: serializeVault(await ensureEventVaultRow(connection, eventId)) };
  }

  const vault = await ensureEventVaultRow(connection, eventId, { forUpdate: true });
  if (!vault) {
    throw new Error('Event vault not found');
  }

  const currentBalance = toMoney(vault.balance);
  if (currentBalance < refundAmount) {
    throw new Error('Insufficient event vault balance for refund');
  }

  const nextBalance = toMoney(currentBalance - refundAmount);
  const nextRefunded = toMoney(toMoney(vault.total_refunded) + refundAmount);
  const status = String(vault.status || 'active').toLowerCase();
  const nextStatus = status === 'withdrawn' ? 'withdrawn' : (nextBalance > 0 ? status : (status === 'released' ? 'released' : 'active'));

  await connection.execute(
    `UPDATE event_vaults
     SET balance = ?,
         total_refunded = ?,
         status = ?
     WHERE event_id = ?`,
    [nextBalance, nextRefunded, nextStatus, normalizeId(eventId)]
  );

  await insertVaultTransaction(connection, {
    eventId: normalizeId(eventId),
    bookingId: bookingId ? normalizeId(bookingId) : null,
    amount: refundAmount,
    type: 'refund',
    description,
    balanceAfter: nextBalance
  });

  const updated = await getVaultRow(connection, normalizeId(eventId), false);
  return { applied: true, amount: refundAmount, vault: serializeVault(updated) };
}

async function getVaultTransactions(eventIdRaw, limit = null, connection = null) {
  await ensureVaultSchema();
  const eventId = normalizeId(eventIdRaw);
  if (!eventId) return [];

  const db = connection || pool;
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.trunc(Number(limit)))) : null;
  const limitSql = safeLimit ? `LIMIT ${safeLimit}` : '';
  const [rows] = await db.execute(
    `SELECT id, event_id, booking_id, amount, type, description, balance_after, created_at
     FROM event_vault_transactions
     WHERE event_id = ?
     ORDER BY created_at DESC, id DESC
     ${limitSql}`,
    [eventId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    eventId: normalizeId(row.event_id),
    bookingId: row.booking_id ? normalizeId(row.booking_id) : null,
    amount: toMoney(row.amount),
    type: String(row.type || ''),
    description: String(row.description || ''),
    balanceAfter: toMoney(row.balance_after),
    createdAt: row.created_at
  }));
}

function withdrawalEligibility({ event, vault, hostId }) {
  if (!event) {
    return { allowed: false, reason: 'Event not found' };
  }
  if (normalizeId(event.organizer_id) !== normalizeId(hostId)) {
    return { allowed: false, reason: 'Only the event host can withdraw' };
  }
  if (!isEventEnded(event)) {
    return { allowed: false, reason: 'Event has not ended yet' };
  }
  if (!vault) {
    return { allowed: false, reason: 'Event vault not found' };
  }

  const status = String(vault.status || '').toLowerCase();
  if (status === 'withdrawn') {
    return { allowed: false, reason: 'Already withdrawn' };
  }

  const balance = toMoney(vault.balance);
  if (balance <= 0) {
    return { allowed: false, reason: 'No balance to withdraw' };
  }

  return {
    allowed: true,
    amount: balance
  };
}

async function getVaultOverviewForHost({ eventId, hostId, includeTransactions = true, txLimit = 60 }) {
  await ensureVaultSchema();
  const normalizedEventId = normalizeId(eventId);
  const normalizedHostId = normalizeId(hostId);

  const event = await getEventForVault(pool, normalizedEventId, false);
  if (!event) {
    return { success: false, status: 404, message: 'Event not found' };
  }
  if (normalizeId(event.organizer_id) !== normalizedHostId) {
    return { success: false, status: 403, message: 'Only the event host can view this vault' };
  }

  let vault = await ensureEventVaultRow(pool, normalizedEventId, { forUpdate: false });
  if (!vault) {
    return { success: false, status: 404, message: 'Event vault not found' };
  }

  const ended = isEventEnded(event);
  const currentStatus = String(vault.status || 'active').toLowerCase();
  if (ended && currentStatus === 'active') {
    await pool.execute(
      "UPDATE event_vaults SET status = 'released' WHERE event_id = ? AND status = 'active'",
      [normalizedEventId]
    );
    vault = await getVaultRow(pool, normalizedEventId, false);
  }

  const eligibility = withdrawalEligibility({ event, vault, hostId: normalizedHostId });
  const transactions = includeTransactions ? await getVaultTransactions(normalizedEventId, txLimit, pool) : [];

  return {
    success: true,
    event: {
      id: normalizeId(event.id),
      title: String(event.title || ''),
      eventDate: event.event_date,
      lifecycleStatus: String(event.lifecycle_status || '')
    },
    vault: serializeVault(vault),
    canWithdraw: eligibility.allowed,
    withdrawReason: eligibility.allowed ? '' : eligibility.reason,
    withdrawAmount: eligibility.allowed ? toMoney(eligibility.amount) : 0,
    transactions
  };
}

async function getVaultTransactionsForHost({ eventId, hostId }) {
  const overview = await getVaultOverviewForHost({
    eventId,
    hostId,
    includeTransactions: false
  });
  if (!overview.success) {
    return overview;
  }

  return {
    success: true,
    event: overview.event,
    vault: overview.vault,
    transactions: await getVaultTransactions(eventId, null, pool)
  };
}

async function releaseEventVaultIfExpired(eventIdRaw, connection = null) {
  const eventId = normalizeId(eventIdRaw);
  if (!eventId) return null;

  const db = connection || pool;
  const event = await getEventForVault(db, eventId, Boolean(connection));
  if (!event) return null;

  let vault = await ensureEventVaultRow(db, eventId, { forUpdate: Boolean(connection) });
  if (!vault) return null;

  const status = String(vault.status || '').toLowerCase();
  if (isEventEnded(event) && status === 'active') {
    await db.execute(
      "UPDATE event_vaults SET status = 'released' WHERE event_id = ? AND status = 'active'",
      [eventId]
    );
    vault = await getVaultRow(db, eventId, false);
  }

  return serializeVault(vault);
}

async function withdrawEventVaultToHost({ eventId, hostId }) {
  await ensureVaultSchema();

  const normalizedEventId = normalizeId(eventId);
  const normalizedHostId = normalizeId(hostId);
  if (!normalizedEventId || !normalizedHostId) {
    return { success: false, status: 400, message: 'eventId and hostId are required' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const event = await getEventForVault(connection, normalizedEventId, true);
    if (!event) {
      await connection.rollback();
      return { success: false, status: 404, message: 'Event not found' };
    }

    let vault = await ensureEventVaultRow(connection, normalizedEventId, { forUpdate: true });
    if (!vault) {
      await connection.rollback();
      return { success: false, status: 404, message: 'Event vault not found' };
    }

    if (isEventEnded(event) && String(vault.status || '').toLowerCase() === 'active') {
      await connection.execute(
        "UPDATE event_vaults SET status = 'released' WHERE event_id = ? AND status = 'active'",
        [normalizedEventId]
      );
      vault = await getVaultRow(connection, normalizedEventId, true);
    }

    const eligibility = withdrawalEligibility({
      event,
      vault,
      hostId: normalizedHostId
    });
    if (!eligibility.allowed) {
      await connection.rollback();
      return { success: false, status: 400, message: eligibility.reason };
    }

    const payoutAmount = toMoney(eligibility.amount);
    const payoutResult = await creditWallet({
      userId: normalizedHostId,
      amount: payoutAmount,
      source: 'event-payout',
      description: `Payout from ${event.title || 'Event'} vault`,
      relatedEventId: normalizedEventId,
      conn: connection
    });

    await connection.execute(
      `UPDATE event_vaults
       SET balance = 0.00,
           total_withdrawn = total_withdrawn + ?,
           status = 'withdrawn',
           withdrawal_requested_at = COALESCE(withdrawal_requested_at, NOW()),
           withdrawn_at = NOW()
       WHERE event_id = ?`,
      [payoutAmount, normalizedEventId]
    );

    await insertVaultTransaction(connection, {
      eventId: normalizedEventId,
      bookingId: null,
      amount: payoutAmount,
      type: 'withdrawal',
      description: `Vault payout to host wallet for "${event.title || 'Event'}"`,
      balanceAfter: 0
    });

    const updatedVault = await getVaultRow(connection, normalizedEventId, false);

    await connection.commit();
    connection.release();
    connection = null;

    return {
      success: true,
      event: {
        id: normalizedEventId,
        title: String(event.title || ''),
        eventDate: event.event_date
      },
      amount: payoutAmount,
      walletBalance: toMoney(payoutResult.newBalance),
      vault: serializeVault(updatedVault)
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    throw error;
  }
}

module.exports = {
  ensureVaultSchema,
  ensureEventVaultRow,
  addBookingPaymentToVault,
  processRefundFromVault,
  getVaultTransactions,
  getVaultOverviewForHost,
  getVaultTransactionsForHost,
  releaseEventVaultIfExpired,
  withdrawEventVaultToHost
};
