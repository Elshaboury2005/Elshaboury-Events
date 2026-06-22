const pool = require('../config/database');

const CACHE_TTL_MS = 5000;
const LOCKDOWN_MESSAGE = 'The platform is currently locked by the administrator. Only admin access is available right now.';

let cachedState = null;
let cachedAt = 0;

function parseBooleanSetting(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

async function getPlatformAccessState(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const now = Date.now();

  if (!forceRefresh && cachedState && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedState;
  }

  const [rows] = await pool.execute(
    `SELECT setting_key, setting_value
     FROM site_settings
     WHERE setting_key IN ('platform_lockdown', 'maintenance_mode', 'site_name')`
  );

  const settingsMap = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
  const locked = parseBooleanSetting(settingsMap.get('platform_lockdown'));
  const maintenanceMode = parseBooleanSetting(settingsMap.get('maintenance_mode'));
  const siteName = String(settingsMap.get('site_name') || 'Elshaboury Events').trim() || 'Elshaboury Events';

  cachedState = {
    locked,
    maintenanceMode,
    siteName,
    message: locked ? LOCKDOWN_MESSAGE : ''
  };
  cachedAt = now;
  return cachedState;
}

function clearPlatformAccessCache() {
  cachedState = null;
  cachedAt = 0;
}

module.exports = {
  LOCKDOWN_MESSAGE,
  getPlatformAccessState,
  clearPlatformAccessCache
};
