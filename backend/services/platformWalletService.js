/**
 * platformWalletService.js
 *
 * Manages the single-row platform_wallet and its transaction log
 * (platform_wallet_transactions).
 *
 * Exports:
 *   creditPlatformFee(conn, { eventId, venueBookingId, amount, description })
 *     — credits the platform wallet inside an existing transaction (no commit).
 *
 *   getPlatformWalletOverview()
 *     — returns { balance, totalCredits, totalDebits, recentTransactions[] }.
 *
 *   withdrawFromPlatformWallet({ amount, description, adminId })
 *     — deducts amount from the platform wallet inside its own transaction.
 */

const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Ensures the platform_wallet singleton row exists (balance = 0).
 * Called inside an already-open connection / transaction so that the
 * surrounding caller can commit or roll back as a unit.
 *
 * @param {import('mysql2').PoolConnection} conn
 */
async function ensurePlatformWalletRow(conn) {
  await conn.execute(`
    INSERT IGNORE INTO platform_wallet (id, balance)
    VALUES (1, 0.00)
  `);
}

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Credit the platform wallet with a platform fee collected during event approval.
 *
 * MUST be called with an open, uncommitted connection so it participates in
 * the caller's transaction (the caller is responsible for commit/rollback).
 *
 * @param {import('mysql2').PoolConnection} conn - open transactional connection
 * @param {{ eventId: string, venueBookingId: number|null, amount: number, description: string }} opts
 */
async function creditPlatformFee(conn, { eventId, venueBookingId, amount, description }) {
  const fee = Number(amount || 0);
  if (fee <= 0) return; // nothing to credit

  await ensurePlatformWalletRow(conn);

  await conn.execute(
    `UPDATE platform_wallet SET balance = balance + ? WHERE id = 1`,
    [fee]
  );

  await conn.execute(
    `INSERT INTO platform_wallet_transactions
       (id, type, amount, event_id, venue_booking_id, description)
     VALUES (?, 'credit', ?, ?, ?, ?)`,
    [uuidv4(), fee, eventId || null, venueBookingId || null, description || 'Platform fee credit']
  );
}

/**
 * Retrieve a summary of the platform wallet.
 *
 * @returns {{ balance: number, totalCredits: number, totalDebits: number, recentTransactions: object[] }}
 */
async function getPlatformWalletOverview() {
  // Ensure the singleton row exists (idempotent)
  const conn = await pool.getConnection();
  try {
    await conn.execute(`INSERT IGNORE INTO platform_wallet (id, balance) VALUES (1, 0.00)`);
    conn.release();
  } catch (err) {
    conn.release();
    throw err;
  }

  const [[wallet]] = await pool.execute(
    `SELECT balance FROM platform_wallet WHERE id = 1 LIMIT 1`
  );

  const [[credits]] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_wallet_transactions WHERE type = 'credit'`
  );

  const [[debits]] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_wallet_transactions WHERE type = 'debit'`
  );

  const [recentTransactions] = await pool.execute(
    `SELECT t.id, t.type, t.amount, t.description, t.event_id, t.venue_booking_id, t.created_at,
            e.title AS event_title
     FROM platform_wallet_transactions t
     LEFT JOIN events e ON e.id = t.event_id
     ORDER BY t.created_at DESC
     LIMIT 50`
  );

  return {
    balance: Number(wallet?.balance || 0),
    totalCredits: Number(credits.total || 0),
    totalDebits: Number(debits.total || 0),
    recentTransactions: recentTransactions.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount || 0),
      description: row.description || '',
      eventId: row.event_id || null,
      eventTitle: row.event_title || null,
      venueBookingId: row.venue_booking_id || null,
      createdAt: row.created_at
    }))
  };
}

/**
 * Withdraw an amount from the platform wallet.
 * Runs inside its own transaction; throws if balance would go negative.
 *
 * @param {{ amount: number, description: string, adminId: string }} opts
 * @returns {{ success: boolean, newBalance: number, transactionId: string }}
 */
async function withdrawFromPlatformWallet({ amount, description, adminId }) {
  const withdrawal = Number(amount || 0);
  if (!Number.isFinite(withdrawal) || withdrawal <= 0) {
    throw new Error('Withdrawal amount must be a positive number');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Ensure the singleton row exists
    await ensurePlatformWalletRow(connection);

    // Lock the row and read current balance
    const [[wallet]] = await connection.execute(
      `SELECT balance FROM platform_wallet WHERE id = 1 FOR UPDATE`
    );
    const currentBalance = Number(wallet?.balance || 0);

    if (withdrawal > currentBalance) {
      throw new Error(
        `Insufficient platform wallet balance. Available: ${currentBalance.toFixed(2)} EGP, Requested: ${withdrawal.toFixed(2)} EGP`
      );
    }

    // Deduct from balance
    await connection.execute(
      `UPDATE platform_wallet SET balance = balance - ? WHERE id = 1`,
      [withdrawal]
    );

    const txId = uuidv4();

    // Log the debit transaction
    await connection.execute(
      `INSERT INTO platform_wallet_transactions
         (id, type, amount, description)
       VALUES (?, 'debit', ?, ?)`,
      [txId, withdrawal, description || `Admin withdrawal by ${adminId}`]
    );

    const [[updated]] = await connection.execute(
      `SELECT balance FROM platform_wallet WHERE id = 1 LIMIT 1`
    );

    await connection.commit();
    connection.release();
    connection = null;

    return {
      success: true,
      newBalance: Number(updated?.balance || 0),
      transactionId: txId
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    throw error;
  }
}

/**
 * Retrieve paginated platform wallet transactions.
 * @param {{ page: number, limit: number, type: 'all'|'credit'|'debit' }} opts
 */
async function getPlatformWalletTransactions({ page = 1, limit = 20, type = 'all' } = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const typeFilter = ['credit', 'debit'].includes(type) ? `AND t.type = '${type}'` : '';

  const [rows] = await pool.execute(
    `SELECT t.id, t.type, t.amount, t.description, t.event_id, t.venue_booking_id, t.created_at,
            e.title AS event_title
     FROM platform_wallet_transactions t
     LEFT JOIN events e ON e.id = t.event_id
     WHERE 1=1 ${typeFilter}
     ORDER BY t.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`
  );

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM platform_wallet_transactions t WHERE 1=1 ${typeFilter}`
  );

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount || 0),
      description: row.description || '',
      eventId: row.event_id || null,
      eventTitle: row.event_title || null,
      venueBookingId: row.venue_booking_id || null,
      createdAt: row.created_at
    })),
    total: Number(total || 0),
    page,
    limit
  };
}

module.exports = {
  creditPlatformFee,
  getPlatformWalletOverview,
  withdrawFromPlatformWallet,
  getPlatformWalletTransactions
};
