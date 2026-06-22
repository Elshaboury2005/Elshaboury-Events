const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const pool = require('../config/database');
const Notification = require('../models/Notification');

const PROFILE_UPLOAD_PREFIX = '/uploads/profile/';
const PROFILE_UPLOAD_DIR = path.join(__dirname, '../../frontend/uploads/profile');

const GENDER_VALUES = ['Male', 'Female', 'Prefer not to say'];
const EGYPT_GOVERNORATES = [
  'Alexandria',
  'Aswan',
  'Asyut',
  'Beheira',
  'Beni Suef',
  'Cairo',
  'Dakahlia',
  'Damietta',
  'Faiyum',
  'Gharbia',
  'Giza',
  'Ismailia',
  'Kafr El Sheikh',
  'Luxor',
  'Matrouh',
  'Minya',
  'Monufia',
  'New Valley',
  'North Sinai',
  'Port Said',
  'Qalyubia',
  'Qena',
  'Red Sea',
  'Sharqia',
  'Sohag',
  'South Sinai',
  'Suez'
];

const seatsCountExpression = `
CASE
  WHEN b.seat_numbers IS NOT NULL AND b.seat_numbers <> '' THEN
    1 + LENGTH(b.seat_numbers) - LENGTH(REPLACE(b.seat_numbers, ',', ''))
  ELSE COALESCE(NULLIF(b.seat_number, 0), 1)
END
`;

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function normalizePhone(phone) {
  if (phone == null) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  return cleaned;
}

function validatePhone(phone) {
  if (!phone) return true;
  return /^\+?[0-9()\-\s]{7,20}$/.test(phone);
}

function normalizeDateOfBirth(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isFutureDate(dateString) {
  if (!dateString) return false;
  const dob = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dob > today;
}

function parseProfileImagePath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (!imageUrl.startsWith(PROFILE_UPLOAD_PREFIX)) return null;
  const fileName = path.basename(imageUrl);
  if (!fileName || fileName === '.' || fileName === '..') return null;
  return path.join(PROFILE_UPLOAD_DIR, fileName);
}

function removeLocalProfileImage(imageUrl) {
  try {
    const filePath = parseProfileImagePath(imageUrl);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Failed to remove local profile image:', error.message);
  }
}

function formatUserPayload(row) {
  let formattedDob = null;
  if (row.date_of_birth instanceof Date && !Number.isNaN(row.date_of_birth.getTime())) {
    const yyyy = row.date_of_birth.getFullYear();
    const mm = String(row.date_of_birth.getMonth() + 1).padStart(2, '0');
    const dd = String(row.date_of_birth.getDate()).padStart(2, '0');
    formattedDob = `${yyyy}-${mm}-${dd}`;
  } else if (row.date_of_birth) {
    const text = String(row.date_of_birth);
    formattedDob = text.length >= 10 ? text.slice(0, 10) : text;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    phoneNumber: row.phone_number || '',
    dateOfBirth: formattedDob,
    gender: row.gender || '',
    governorate: row.governorate || '',
    profileImageUrl: row.profile_image_url || '',
    memberSince: row.created_at || null,
    walletBalance: Number(row.wallet_balance || 0),
    lastLoginAt: row.last_login_at || null
  };
}

async function getUserRowWithPassword(userId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, username, email, password, phone_number, date_of_birth, gender, governorate,
            profile_image_url, wallet_balance, created_at, last_login_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function buildActivitySummary(userId) {
  const [
    eventsBookedRows,
    eventsCreatedRows,
    eventsAttendedRows,
    reviewsRows,
    ticketsRows,
    amountRows
  ] = await Promise.all([
    pool.execute(
      `SELECT COUNT(DISTINCT b.event_id) AS count
       FROM bookings b
       WHERE b.user_id = ? AND b.status = 'confirmed'`,
      [userId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS count
       FROM events
       WHERE organizer_id = ?`,
      [userId]
    ),
    pool.execute(
      `SELECT COUNT(DISTINCT b.event_id) AS count
       FROM bookings b
       INNER JOIN events e ON e.id = b.event_id
       WHERE b.user_id = ?
         AND b.status = 'confirmed'
         AND e.event_date <= NOW()`,
      [userId]
    ),
    pool.execute(
      'SELECT COUNT(*) AS count FROM event_reviews WHERE user_id = ?',
      [userId]
    ),
    pool.execute(
      `SELECT COALESCE(SUM(${seatsCountExpression}), 0) AS count
       FROM bookings b
       WHERE b.user_id = ? AND b.status = 'confirmed'`,
      [userId]
    ),
    pool.execute(
      `SELECT COALESCE(SUM(COALESCE(amount_paid, 0)), 0) AS total
       FROM bookings
       WHERE user_id = ? AND status = 'confirmed'`,
      [userId]
    )
  ]);

  return {
    totalEventsBooked: Number(eventsBookedRows[0][0]?.count || 0),
    totalEventsCreated: Number(eventsCreatedRows[0][0]?.count || 0),
    totalEventsAttended: Number(eventsAttendedRows[0][0]?.count || 0),
    totalReviewsSubmitted: Number(reviewsRows[0][0]?.count || 0),
    totalTicketsPurchased: Number(ticketsRows[0][0]?.count || 0),
    totalAmountSpentEgp: Number(amountRows[0][0]?.total || 0)
  };
}

async function buildQuickStats(userId, userRow) {
  const [activeTicketsRows, upcomingEventsRows] = await Promise.all([
    pool.execute(
      `SELECT COALESCE(SUM(${seatsCountExpression}), 0) AS count
       FROM bookings b
       INNER JOIN events e ON e.id = b.event_id
       WHERE b.user_id = ?
         AND b.status = 'confirmed'
         AND e.event_date > NOW()
         AND COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) = 'active'`,
      [userId]
    ),
    pool.execute(
      `SELECT COUNT(DISTINCT b.event_id) AS count
       FROM bookings b
       INNER JOIN events e ON e.id = b.event_id
       WHERE b.user_id = ?
         AND b.status = 'confirmed'
         AND e.event_date > NOW()
         AND COALESCE(e.lifecycle_status, CASE WHEN e.event_date <= NOW() THEN 'expired' ELSE 'active' END) = 'active'`,
      [userId]
    )
  ]);

  return {
    walletBalance: Number(userRow.wallet_balance || 0),
    activeUpcomingTickets: Number(activeTicketsRows[0][0]?.count || 0),
    upcomingEvents: Number(upcomingEventsRows[0][0]?.count || 0),
    memberSince: userRow.created_at || null
  };
}

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await getUserRowWithPassword(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [activitySummary, quickStats, notificationPreferences] = await Promise.all([
      buildActivitySummary(userId),
      buildQuickStats(userId, user),
      Notification.getPreferences(userId)
    ]);

    res.json({
      success: true,
      profile: formatUserPayload(user),
      activitySummary,
      quickStats,
      notificationPreferences,
      metadata: {
        governorates: EGYPT_GOVERNORATES,
        genders: GENDER_VALUES
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Error loading profile' });
  }
};

exports.updatePersonalInfo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentUser = await getUserRowWithPassword(userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const fullName = String(req.body.fullName || '').trim();
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phoneNumber = normalizePhone(req.body.phoneNumber);
    const dateOfBirth = normalizeDateOfBirth(req.body.dateOfBirth);
    const gender = String(req.body.gender || '').trim();
    const governorate = String(req.body.governorate || '').trim();
    const currentPassword = String(req.body.currentPassword || '');

    if (!fullName || fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({ success: false, message: 'Full name must be between 2 and 100 characters' });
    }

    if (!/^[a-zA-Z0-9._]{3,30}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-30 chars using letters, numbers, dot, underscore' });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    if (!validatePhone(phoneNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    if (req.body.dateOfBirth && !dateOfBirth) {
      return res.status(400).json({ success: false, message: 'Invalid date of birth' });
    }

    if (isFutureDate(dateOfBirth)) {
      return res.status(400).json({ success: false, message: 'Date of birth cannot be in the future' });
    }

    if (gender && !GENDER_VALUES.includes(gender)) {
      return res.status(400).json({ success: false, message: 'Invalid gender selection' });
    }

    if (governorate && !EGYPT_GOVERNORATES.includes(governorate)) {
      return res.status(400).json({ success: false, message: 'Invalid governorate selection' });
    }

    if (username !== currentUser.username) {
      const [usernameRows] = await pool.execute(
        'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
        [username, userId]
      );
      if (usernameRows.length > 0) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
    }

    if (email !== currentUser.email) {
      const [emailRows] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
        [email, userId]
      );
      if (emailRows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email is already in use' });
      }

      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change email' });
      }

      const passwordValid = await bcrypt.compare(currentPassword, currentUser.password);
      if (!passwordValid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    await pool.execute(
      `UPDATE users
       SET full_name = ?, username = ?, email = ?, phone_number = ?, date_of_birth = ?, gender = ?, governorate = ?
       WHERE id = ?`,
      [fullName, username, email, phoneNumber, dateOfBirth, gender || null, governorate || null, userId]
    );

    const updatedUser = await getUserRowWithPassword(userId);
    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: formatUserPayload(updatedUser)
    });
  } catch (error) {
    console.error('Update personal info error:', error);
    res.status(500).json({ success: false, message: 'Error updating profile' });
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Profile image file is required' });
    }

    const imageUrl = `${PROFILE_UPLOAD_PREFIX}${req.file.filename}`;
    const [rows] = await pool.execute(
      'SELECT profile_image_url FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const oldImageUrl = rows[0].profile_image_url;
    await pool.execute(
      'UPDATE users SET profile_image_url = ? WHERE id = ?',
      [imageUrl, userId]
    );

    if (oldImageUrl && oldImageUrl !== imageUrl) {
      removeLocalProfileImage(oldImageUrl);
    }

    res.json({
      success: true,
      message: 'Profile image updated successfully',
      profileImageUrl: imageUrl
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    res.status(500).json({ success: false, message: 'Error uploading profile image' });
  }
};

exports.removePhoto = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.execute(
      'SELECT profile_image_url FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const oldImageUrl = rows[0].profile_image_url;
    await pool.execute(
      'UPDATE users SET profile_image_url = NULL WHERE id = ?',
      [userId]
    );

    if (oldImageUrl) {
      removeLocalProfileImage(oldImageUrl);
    }

    res.json({ success: true, message: 'Profile image removed successfully' });
  } catch (error) {
    console.error('Remove profile photo error:', error);
    res.status(500).json({ success: false, message: 'Error removing profile image' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmNewPassword = String(req.body.confirmNewPassword || '');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long' });
    }

    const checks = [
      /[a-z]/.test(newPassword),
      /[A-Z]/.test(newPassword),
      /[0-9]/.test(newPassword),
      /[^A-Za-z0-9]/.test(newPassword)
    ].filter(Boolean).length;

    if (checks < 3) {
      return res.status(400).json({ success: false, message: 'Use a stronger password with mixed character types' });
    }

    const user = await getUserRowWithPassword(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentValid = await bcrypt.compare(currentPassword, user.password);
    if (!currentValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (sameAsCurrent) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Error changing password' });
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.execute(
      `SELECT r.id, r.event_id, r.rating, r.review, r.created_at,
              e.title AS event_name, e.event_date
       FROM event_reviews r
       INNER JOIN events e ON e.id = r.event_id
       WHERE r.user_id = ?
         AND e.event_date <= NOW()
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({ success: true, reviews: rows });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, reviews: [] });
    }
    console.error('Get my reviews error:', error);
    res.status(500).json({ success: false, message: 'Error loading reviews' });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reviewId } = req.params;
    const rating = parseInt(req.body.rating, 10);
    const reviewText = String(req.body.review || '').trim();

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    if (reviewText.length > 2000) {
      return res.status(400).json({ success: false, message: 'Review text is too long' });
    }

    const [existingRows] = await pool.execute(
      `SELECT r.id
       FROM event_reviews r
       INNER JOIN events e ON e.id = r.event_id
       WHERE r.id = ? AND r.user_id = ? AND e.event_date <= NOW()
       LIMIT 1`,
      [reviewId, userId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await pool.execute(
      'UPDATE event_reviews SET rating = ?, review = ? WHERE id = ? AND user_id = ?',
      [rating, reviewText, reviewId, userId]
    );

    res.json({ success: true, message: 'Review updated successfully' });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ success: false, message: 'Error updating review' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reviewId } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM event_reviews WHERE id = ? AND user_id = ?',
      [reviewId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ success: false, message: 'Error deleting review' });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const preferences = await Notification.getPreferences(userId);
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ success: false, message: 'Error loading notification preferences' });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const payload = req.body || {};
    const updates = {};
    const allowedKeys = [
      'eventReminders',
      'bookingConfirmations',
      'refundNotifications',
      'eventCancellationAlerts',
      'newEventsMatchingInterests',
      'walletTopupConfirmations'
    ];

    allowedKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const normalized = toBoolean(payload[key]);
        if (normalized === null) {
          throw new Error(`Invalid boolean value for ${key}`);
        }
        updates[key] = normalized;
      }
    });

    const preferences = await Notification.updatePreferences(userId, updates);
    res.json({ success: true, message: 'Preferences saved', preferences });
  } catch (error) {
    if (error.message && error.message.startsWith('Invalid boolean value')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Update notification preferences error:', error);
    res.status(500).json({ success: false, message: 'Error saving notification preferences' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const confirmText = String(req.body.confirmText || '').trim();

    if (confirmText !== 'DELETE') {
      return res.status(400).json({ success: false, message: "Type 'DELETE' to confirm account deletion" });
    }

    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Error deleting account' });
  }
};
