const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Number(amount.toFixed(2));
}

async function ensureWalletInfrastructure(db = pool) {
  const [walletColumnRows] = await db.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'wallet_balance'`
  );

  const walletColumnExists = Number(walletColumnRows[0]?.count || 0) > 0;
  if (!walletColumnExists) {
    try {
      await db.execute(
        'ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  await db.execute(
    `CREATE TABLE IF NOT EXISTS wallet_transactions (
      transaction_id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      type ENUM('credit', 'debit') NOT NULL,
      source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal') NOT NULL,
      description VARCHAR(500) NULL,
      related_event_id VARCHAR(36) NULL,
      related_booking_id VARCHAR(36) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL,
      FOREIGN KEY (related_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      INDEX idx_wallet_user_created (user_id, created_at),
      INDEX idx_wallet_source (source)
    )`
  );

  const [sourceTypeRows] = await db.execute(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'wallet_transactions'
       AND COLUMN_NAME = 'source'
     LIMIT 1`
  );
  const sourceColumnType = String(sourceTypeRows[0]?.COLUMN_TYPE || '').toLowerCase();
  if (
    sourceColumnType &&
    (!sourceColumnType.includes("'event-payout'") || !sourceColumnType.includes("'withdrawal'"))
  ) {
    await db.execute(
      "ALTER TABLE wallet_transactions MODIFY COLUMN source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal') NOT NULL"
    );
  }
}

async function creditWalletRefundInTransaction({
  connection,
  userId,
  amount,
  description = null,
  relatedEventId = null,
  relatedBookingId = null
}) {
  const refundAmount = roundMoney(amount);
  if (refundAmount == null || refundAmount <= 0) {
    const [walletRows] = await connection.execute(
      'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (walletRows.length === 0) {
      throw new Error('User not found for wallet credit');
    }
    return {
      walletBalance: roundMoney(walletRows[0].wallet_balance || 0) || 0,
      refundAmount: 0,
      transactionId: null
    };
  }

  const [updateResult] = await connection.execute(
    'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?',
    [refundAmount, userId]
  );
  if (!updateResult.affectedRows) {
    throw new Error('User not found for wallet credit');
  }

  const transactionId = uuidv4();
  await connection.execute(
    `INSERT INTO wallet_transactions
      (transaction_id, user_id, amount, type, source, description, related_event_id, related_booking_id)
     VALUES (?, ?, ?, 'credit', 'refund', ?, ?, ?)`,
    [transactionId, userId, refundAmount, description, relatedEventId, relatedBookingId]
  );

  const [walletRows] = await connection.execute(
    'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const walletBalance = roundMoney(walletRows[0]?.wallet_balance || 0) || 0;

  return {
    walletBalance,
    refundAmount,
    transactionId
  };
}

async function insertNotificationInTransaction({
  connection,
  userId,
  title,
  message,
  type = 'info'
}) {
  const notificationId = uuidv4();
  await connection.execute(
    'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)',
    [notificationId, userId, title, message, type]
  );
  return notificationId;
}

module.exports = {
  roundMoney,
  ensureWalletInfrastructure,
  creditWalletRefundInTransaction,
  insertNotificationInTransaction
};
