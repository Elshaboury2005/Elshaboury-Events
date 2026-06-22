const { getPlatformAccessState } = require('../services/platformAccessService');

function isStaticAssetRequest(pathname) {
  return /\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('.html');
}

function isAdminAllowedPath(pathname) {
  return pathname.startsWith('/admin')
    || pathname.startsWith('/api/admin')
    || pathname.startsWith('/admin/')
    || pathname === '/api/platform/access'
    || pathname === '/platform/access'
    || pathname === '/api/health'
    || pathname === '/health';
}

function isUserHtmlPage(pathname) {
  return pathname === '/'
    || pathname === '/profile'
    || pathname === '/wallet'
    || pathname.startsWith('/organizer/')
    || (pathname.startsWith('/html/') && pathname.endsWith('.html'));
}

async function enforcePlatformWebAccess(req, res, next) {
  const pathname = String(req.path || '').toLowerCase();

  if (isAdminAllowedPath(pathname) || isStaticAssetRequest(pathname) || !isUserHtmlPage(pathname)) {
    return next();
  }

  try {
    const accessState = await getPlatformAccessState();
    if (!accessState.locked) {
      return next();
    }

    if (pathname === '/html/signin.html') {
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }

    return res.redirect('/html/signin.html?platformLocked=1');
  } catch (error) {
    console.error('Platform web access middleware error:', error);
    return next();
  }
}

async function enforcePlatformApiAccess(req, res, next) {
  const pathname = String(req.path || '').toLowerCase();

  if (isAdminAllowedPath(pathname)) {
    return next();
  }

  try {
    const accessState = await getPlatformAccessState();
    if (!accessState.locked) {
      return next();
    }

    return res.status(423).json({
      success: false,
      code: 'PLATFORM_LOCKED',
      message: accessState.message,
      locked: true
    });
  } catch (error) {
    console.error('Platform API access middleware error:', error);
    return next();
  }
}

module.exports = {
  enforcePlatformWebAccess,
  enforcePlatformApiAccess
};
