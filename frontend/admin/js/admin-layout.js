(function () {
  const NAV_ITEMS = [
    { href: '/admin/index.html', icon: '&#128202;', label: 'Dashboard' },
    { href: '/admin/users.html', icon: '&#128101;', label: 'Users' },
    { href: '/admin/events.html', icon: '&#127914;', label: 'Events' },
    { href: '/admin/venues.html', icon: '&#127963;&#65039;', label: 'Venues' },
    { href: '/admin/bookings.html', icon: '&#127903;&#65039;', label: 'Bookings' },
    { href: '/admin/reports.html', icon: '&#128176;', label: 'Revenue Reports' },
    { href: '/admin/wallet-withdrawals.html', icon: '&#128179;', label: 'Wallet Withdrawals' },
    { href: '/admin/platform-wallet.html', icon: '&#128184;', label: 'Platform Wallet' },
    { href: '/admin/notifications.html', icon: '&#128276;', label: 'Notifications' },
    { href: '/admin/support.html', icon: '&#128172;', label: 'Support' },
    { href: '/admin/settings.html', icon: '&#9881;&#65039;', label: 'Settings' }
  ];

  window.renderAdminLayout = function (pageTitle) {
    const app = document.getElementById('app');
    if (!app) return;

    const profile = AdminApp.getAdminProfile() || {};
    const adminName = profile.fullName || profile.adminId || 'Admin';
    const adminSecondary = adminName === 'Admin' ? 'Control Center' : adminName;

    app.innerHTML = `
      <div class="accent-bar"></div>
      <div class="admin-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <div class="logo-badge">EE</div>
            <div>
              <div class="brand-title">Elshaboury Admin</div>
              <div class="brand-subtitle">Control Center</div>
            </div>
          </div>
          <nav class="nav-links">
            ${NAV_ITEMS.map((item) => `
              <a href="${item.href}" class="nav-link" data-path="${item.href}">
                <span class="nav-icon" aria-hidden="true">${item.icon}</span>
                <span class="nav-label">${item.label}</span>
              </a>
            `).join('')}
          </nav>
        </aside>

        <main class="content">
          <div class="topbar">
            <div>
              <h1 class="page-title">${AdminApp.escapeHtml(pageTitle)}</h1>
              <p class="page-subtitle">Protected administrator area</p>
            </div>
            <div class="topbar-actions">
              <div class="admin-chip">
                <span class="admin-chip-icon" aria-hidden="true">&#128737;&#65039;</span>
                <div>
                  <div class="admin-chip-label">Signed in as</div>
                  <div class="admin-chip-name">Admin</div>
                  <div class="admin-chip-label">${AdminApp.escapeHtml(adminSecondary)}</div>
                </div>
              </div>
              <button id="adminLogoutBtn" class="btn btn-outline-danger">Logout</button>
            </div>
          </div>
          <div id="pageContent"></div>
        </main>
      </div>
    `;

    const path = window.location.pathname;
    const links = document.querySelectorAll('.nav-link');
    links.forEach((link) => {
      const href = link.getAttribute('data-path');
      if (!href) return;
      if (path === href || (path.endsWith('/admin') && href === '/admin/index.html')) {
        link.classList.add('active');
      }
    });

    AdminApp.attachLogoutButton();
    AdminApp.enforceSessionTimeout();
  };
})();
