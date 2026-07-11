const pool = require('../config/database');

/**
 * Retrieves the current platform fee settings from the database.
 * If settings are not configured yet, it returns the standard defaults.
 * 
 * @returns {Promise<{ type: 'fixed'|'percentage', value: number, fallback: number }>}
 */
async function getPlatformFeeSettings() {
  try {
    const [rows] = await pool.execute(
      `SELECT setting_key, setting_value FROM site_settings 
       WHERE setting_key IN ('platform_fee_type', 'platform_fee_value', 'platform_fee_fallback_fixed')`
    );

    const settings = {
      type: 'fixed',
      value: 500,
      fallback: 200
    };

    for (const row of rows) {
      if (row.setting_key === 'platform_fee_type') {
        settings.type = row.setting_value === 'percentage' ? 'percentage' : 'fixed';
      } else if (row.setting_key === 'platform_fee_value') {
        settings.value = Number(row.setting_value) || 0;
      } else if (row.setting_key === 'platform_fee_fallback_fixed') {
        settings.fallback = Number(row.setting_value) || 0;
      }
    }

    return settings;
  } catch (error) {
    console.error('[platformFeeService] Error fetching platform fee settings:', error);
    // Return standard defaults if retrieval fails
    return {
      type: 'fixed',
      value: 500,
      fallback: 200
    };
  }
}

/**
 * Calculates the platform fee based on settings and venue pricing.
 * 
 * @param {{ type: 'fixed'|'percentage', value: number, fallback: number }} settings
 * @param {number} venuePrice
 * @param {boolean} isPlatformBooked
 * @returns {number}
 */
function calculatePlatformFee(settings, venuePrice = 0, isPlatformBooked = false) {
  const price = Math.max(0, Number(venuePrice || 0));
  if (settings.type === 'percentage') {
    if (isPlatformBooked && price > 0) {
      return Math.round(price * (Number(settings.value) / 100) * 100) / 100;
    }
    return Number(settings.fallback) || 0;
  } else {
    return Number(settings.value) || 0;
  }
}

module.exports = {
  getPlatformFeeSettings,
  calculatePlatformFee
};
