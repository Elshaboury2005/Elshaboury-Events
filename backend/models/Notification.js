const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PREFERENCE_DEFAULTS = {
  eventReminders: true,
  bookingConfirmations: true,
  refundNotifications: true,
  eventCancellationAlerts: true,
  newEventsMatchingInterests: true,
  walletTopupConfirmations: true
};

const PREFERENCE_COLUMN_MAP = {
  eventReminders: 'event_reminders',
  bookingConfirmations: 'booking_confirmations',
  refundNotifications: 'refund_notifications',
  eventCancellationAlerts: 'event_cancellation_alerts',
  newEventsMatchingInterests: 'new_events_matching_interests',
  walletTopupConfirmations: 'wallet_topup_confirmations'
};

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function mapPreferenceRow(row) {
  if (!row) return { ...PREFERENCE_DEFAULTS };
  return {
    eventReminders: normalizeBoolean(row.event_reminders, true),
    bookingConfirmations: normalizeBoolean(row.booking_confirmations, true),
    refundNotifications: normalizeBoolean(row.refund_notifications, true),
    eventCancellationAlerts: normalizeBoolean(row.event_cancellation_alerts, true),
    newEventsMatchingInterests: normalizeBoolean(row.new_events_matching_interests, true),
    walletTopupConfirmations: normalizeBoolean(row.wallet_topup_confirmations, true)
  };
}

function normalizeCategory(category) {
  const value = String(category || '').trim();
  if (!value) return null;

  const aliases = {
    event_reminders: 'eventReminders',
    eventreminders: 'eventReminders',
    booking_confirmations: 'bookingConfirmations',
    bookingconfirmations: 'bookingConfirmations',
    refund_notifications: 'refundNotifications',
    refundnotifications: 'refundNotifications',
    event_cancellation_alerts: 'eventCancellationAlerts',
    eventcancellationalerts: 'eventCancellationAlerts',
    new_events_matching_interests: 'newEventsMatchingInterests',
    neweventsmatchinginterests: 'newEventsMatchingInterests',
    wallet_topup_confirmations: 'walletTopupConfirmations',
    wallettopupconfirmations: 'walletTopupConfirmations'
  };

  const compact = value.replace(/[\s_-]/g, '').toLowerCase();
  return aliases[value] || aliases[compact] || null;
}

function inferCategory(title, message) {
  const text = `${title || ''} ${message || ''}`.toLowerCase();
  if (!text.trim()) return null;

  if (
    text.includes('event reminder') ||
    text.includes('coming up') ||
    text.includes('starts in')
  ) {
    return 'eventReminders';
  }

  if (
    text.includes('booking confirmed') ||
    text.includes('new ticket reserved')
  ) {
    return 'bookingConfirmations';
  }

  if (text.includes('refund')) {
    return 'refundNotifications';
  }

  if (
    text.includes('event cancelled') ||
    text.includes('event canceled') ||
    text.includes('booking cancelled') ||
    text.includes('booking canceled')
  ) {
    return 'eventCancellationAlerts';
  }

  if (
    text.includes('matching your interests') ||
    text.includes('new events')
  ) {
    return 'newEventsMatchingInterests';
  }

  if (
    text.includes('wallet top-up') ||
    text.includes('wallet top up') ||
    text.includes('top-up confirmation')
  ) {
    return 'walletTopupConfirmations';
  }

  return null;
}

const Notification = {
  ensurePreferenceRow: async (userId) => {
    await pool.execute(
      `INSERT INTO user_notification_preferences (
         user_id,
         event_reminders,
         booking_confirmations,
         refund_notifications,
         event_cancellation_alerts,
         new_events_matching_interests,
         wallet_topup_confirmations
       )
       VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId]
    );
  },

  getPreferences: async (userId) => {
    try {
      await Notification.ensurePreferenceRow(userId);
      const [rows] = await pool.execute(
        `SELECT event_reminders, booking_confirmations, refund_notifications,
                event_cancellation_alerts, new_events_matching_interests, wallet_topup_confirmations
         FROM user_notification_preferences
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
      );
      return mapPreferenceRow(rows[0]);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return { ...PREFERENCE_DEFAULTS };
      }
      throw error;
    }
  },

  updatePreferences: async (userId, updates) => {
    const payload = updates || {};
    const keys = Object.keys(payload).filter((key) => Object.prototype.hasOwnProperty.call(PREFERENCE_COLUMN_MAP, key));

    if (keys.length === 0) {
      return Notification.getPreferences(userId);
    }

    try {
      await Notification.ensurePreferenceRow(userId);
      const fields = [];
      const values = [];

      keys.forEach((key) => {
        fields.push(`${PREFERENCE_COLUMN_MAP[key]} = ?`);
        values.push(payload[key] ? 1 : 0);
      });

      values.push(userId);
      await pool.execute(
        `UPDATE user_notification_preferences
         SET ${fields.join(', ')}
         WHERE user_id = ?`,
        values
      );
      return Notification.getPreferences(userId);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return { ...PREFERENCE_DEFAULTS, ...updates };
      }
      throw error;
    }
  },

  isCategoryEnabled: async (userId, category) => {
    const normalized = normalizeCategory(category);
    if (!normalized) return true;

    const preferences = await Notification.getPreferences(userId);
    return preferences[normalized] !== false;
  },

  findByUserId: async (userId, unreadOnly = false) => {
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];
    if (unreadOnly) {
      query += ' AND is_read = FALSE';
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params);
    // De-duplicate identical repeated notifications (same title + message), keeping the newest.
    const seen = new Set();
    const deduped = [];
    for (const row of rows) {
      const key = `${row.title}::${row.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
      }
    }
    return deduped;
  },

  markAsRead: async (id, userId) => {
    const [result] = await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  },

  markAllAsRead: async (userId) => {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
  },

  deleteById: async (id, userId) => {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  },

  deleteAllByUserId: async (userId) => {
    await pool.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
  },

  hasRecentEventComing: async (userId, eventTitle) => {
    const escaped = String(eventTitle).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const [rows] = await pool.execute(
      `SELECT id FROM notifications 
       WHERE user_id = ? AND title = 'Event Coming Up!' 
       AND message LIKE CONCAT('%', ?, '%')
       AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       LIMIT 1`,
      [userId, escaped]
    );
    return rows.length > 0;
  },

  create: async (userId, title, message, type = 'info', category = null) => {
    const inferredCategory = normalizeCategory(category) || inferCategory(title, message);
    if (inferredCategory) {
      try {
        const enabled = await Notification.isCategoryEnabled(userId, inferredCategory);
        if (!enabled) return null;
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') {
          throw error;
        }
      }
    }

    const id = uuidv4();
    await pool.execute(
      'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)',
      [id, userId, title, message, type]
    );
    return id;
  }
};

module.exports = Notification;
