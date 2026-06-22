document.addEventListener('DOMContentLoaded', function () {
    const header = document.querySelector('header');
    const nav = document.querySelector('header nav');
    if (!header || !nav) return;

    let docClickHandler = null;
    let docKeyHandler = null;
    const MOBILE_BREAKPOINT = 768;

    const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
    const ROUTES = {
        home: '/html/index.html',
        bookEvent: '/html/book-event.html',
        createEvent: '/html/create-event.html',
        support: '/html/support.html',
        notifications: '/html/notification.html',
        profile: '/html/profile.html',
        wallet: '/html/wallet.html',
        myEvents: '/html/my-events.html',
        venueOwnerDashboard: '/html/venue-owner-dashboard.html',
        favorites: '/html/fav-events.html',
        signIn: '/html/signin.html'
    };

    function getToken() {
        return localStorage.getItem('token');
    }

    function getStoredUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch (_) {
            return {};
        }
    }

    function getStoredUserRole() {
        return String(getStoredUser().role || 'user').trim().toLowerCase();
    }

    function isVenueOwner() {
        return getStoredUserRole() === 'venue_owner';
    }

    function getCurrentPage() {
        const path = String(window.location.pathname || '').toLowerCase();
        if (!path || path === '/' || path === '/html' || path === '/html/') return 'index.html';
        if (path === '/profile') return 'profile.html';
        if (path === '/wallet') return 'wallet.html';

        const page = path.split('/').pop();
        if (!page) return 'index.html';
        return page.split('?')[0].split('#')[0];
    }

    function isLoggedIn() {
        if (window.__eeForcePublicPreview) return false;
        if (document.body && document.body.classList.contains('force-public-preview')) return false;
        if (document.body && document.body.classList.contains('is-logged-in')) return true;
        if (document.body && document.body.classList.contains('is-guest')) return false;
        const token = getToken();
        const flag = localStorage.getItem('isLoggedIn');
        return Boolean(token) && flag === 'true';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getInitials(username, fullName) {
        const source = String(fullName || username || 'User').trim();
        if (!source) return 'U';
        const parts = source.split(/\s+/).slice(0, 2);
        return parts.map((part) => part.charAt(0).toUpperCase()).join('');
    }

    function normalizeNavPage(href) {
        const raw = String(href || '').trim();
        if (!raw) return '';

        if (raw === '/' || raw === '/index.html' || raw === '/html/index.html' || raw === '/html/' || raw === '/html') return 'index.html';
        if (raw.startsWith('/profile')) return 'profile.html';
        if (raw.startsWith('/wallet')) return 'wallet.html';
        if (raw.startsWith('#')) return '#';

        let linkPath = raw;
        try {
            linkPath = new URL(raw, window.location.origin).pathname;
        } catch (_) {
            // keep original value when URL parsing fails
        }
        const linkPage = linkPath.split('/').pop().split('?')[0].split('#')[0].toLowerCase();
        if (!linkPage) return '';
        return linkPage.endsWith('.html') ? linkPage : `${linkPage}.html`;
    }

    function syncCompactState() {
        header.classList.toggle('is-compact', window.scrollY > 18);
    }

    function bindCompactScrollState() {
        if (header.dataset.eeCompactBound === 'true') {
            syncCompactState();
            return;
        }
        header.dataset.eeCompactBound = 'true';
        syncCompactState();
        window.addEventListener('scroll', syncCompactState, { passive: true });
    }

    function buildDesktopGuestHtml() {
        return `
            <div class="ee-nav-main">
                <a class="nav-btn ee-nav-link" data-route="home" href="${ROUTES.home}">Home</a>
                <a class="nav-btn ee-nav-link" data-route="book-event" href="${ROUTES.bookEvent}">Book Event</a>
                <a class="nav-btn ee-nav-link" data-route="support" href="${ROUTES.support}">Support</a>
            </div>
            <div class="ee-nav-actions">
                <a class="nav-btn ee-signin-btn" data-action="signin" href="${ROUTES.signIn}">Sign In</a>
            </div>
        `;
    }

    function buildDesktopLoggedInHtml() {
        const venueOwner = isVenueOwner();
        const primaryLinks = venueOwner
            ? `
                <a class="nav-btn ee-nav-link" data-route="home" href="${ROUTES.home}">Home</a>
                <a class="nav-btn ee-nav-link" data-route="venue-owner-dashboard" href="${ROUTES.venueOwnerDashboard}">Venue Dashboard</a>
                <a class="nav-btn ee-nav-link" data-route="support" href="${ROUTES.support}">Support</a>
            `
            : `
                <a class="nav-btn ee-nav-link" data-route="home" href="${ROUTES.home}">Home</a>
                <a class="nav-btn ee-nav-link" data-route="book-event" href="${ROUTES.bookEvent}">Book Event</a>
                <a class="nav-btn ee-nav-link" data-route="create-event" href="${ROUTES.createEvent}">Create Event</a>
                <a class="nav-btn ee-nav-link" data-route="support" href="${ROUTES.support}">Support</a>
            `;
        const roleSpecificDropdownItem = venueOwner
            ? `
                        <a class="ee-dropdown-item" data-route="venue-owner-dashboard" href="${ROUTES.venueOwnerDashboard}">
                            <span class="ee-item-main"><span class="ee-item-icon">V</span>Venue Dashboard</span>
                        </a>
            `
            : `
                        <a class="ee-dropdown-item" data-route="my-events" href="${ROUTES.myEvents}">
                            <span class="ee-item-main"><span class="ee-item-icon">M</span>My Events</span>
                        </a>
                        <a class="ee-dropdown-item" data-route="favorites" href="${ROUTES.favorites}">
                            <span class="ee-item-main"><span class="ee-item-icon">F</span>Favorites</span>
                        </a>
            `;
        return `
            <div class="ee-nav-main">
                ${primaryLinks}
            </div>
            <div class="ee-nav-actions">
                <a class="ee-icon-btn ee-nav-icon" data-route="notifications" href="${ROUTES.notifications}" aria-label="Notifications">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
                        <path d="M9 17a3 3 0 0 0 6 0"></path>
                    </svg>
                    <span class="ee-notif-badge" data-role="notif-badge">0</span>
                </a>
                <div class="ee-profile-wrap">
                    <button class="ee-icon-btn ee-profile-trigger" type="button" data-role="profile-trigger" aria-expanded="false" aria-label="Account menu">
                        <span class="ee-avatar" data-role="profile-avatar">U</span>
                    </button>
                    <div class="ee-profile-dropdown" data-role="profile-dropdown">
                        <div class="ee-dropdown-header">
                            <span class="ee-dropdown-avatar" data-role="dropdown-avatar">U</span>
                            <div class="ee-dropdown-user">
                                <strong data-role="dropdown-username">User</strong>
                                <small data-role="dropdown-handle">@user</small>
                            </div>
                        </div>
                        <a class="ee-dropdown-item" data-route="profile" href="${ROUTES.profile}">
                            <span class="ee-item-main"><span class="ee-item-icon">P</span>Profile</span>
                        </a>
                        <a class="ee-dropdown-item" data-route="wallet" href="${ROUTES.wallet}">
                            <span class="ee-item-main"><span class="ee-item-icon">W</span>Wallet</span>
                        </a>
                        ${roleSpecificDropdownItem}
                        <div class="ee-dropdown-divider"></div>
                        <button class="ee-dropdown-item ee-logout-item" type="button" data-action="logout">
                            <span class="ee-item-main"><span class="ee-item-icon">L</span>Log Out</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function buildMobileMenuHtml(loggedIn) {
        if (!loggedIn) {
            return `
                <div class="ee-mobile-menu" data-role="mobile-menu">
                    <a class="ee-mobile-link" data-route="home" href="${ROUTES.home}">Home</a>
                    <a class="ee-mobile-link" data-route="book-event" href="${ROUTES.bookEvent}">Book Event</a>
                    <a class="ee-mobile-link" data-route="support" href="${ROUTES.support}">Support</a>
                    <a class="ee-mobile-link ee-mobile-signin" data-action="signin" href="${ROUTES.signIn}">Sign In</a>
                </div>
            `;
        }

        if (isVenueOwner()) {
            return `
            <div class="ee-mobile-menu" data-role="mobile-menu">
                <a class="ee-mobile-link" data-route="home" href="${ROUTES.home}">Home</a>
                <a class="ee-mobile-link" data-route="venue-owner-dashboard" href="${ROUTES.venueOwnerDashboard}">Venue Dashboard</a>
                <a class="ee-mobile-link" data-route="support" href="${ROUTES.support}">Support</a>
                <a class="ee-mobile-link" data-route="profile" href="${ROUTES.profile}">My Profile</a>
                <a class="ee-mobile-link" data-route="wallet" href="${ROUTES.wallet}">My Wallet</a>
                <a class="ee-mobile-link" data-route="notifications" href="${ROUTES.notifications}">
                    Notifications <span class="ee-mobile-badge" data-role="mobile-notif-badge">0</span>
                </a>
                <button class="ee-mobile-link ee-mobile-logout" type="button" data-action="logout">Log Out</button>
            </div>
        `;
        }

        return `
            <div class="ee-mobile-menu" data-role="mobile-menu">
                <a class="ee-mobile-link" data-route="home" href="${ROUTES.home}">Home</a>
                <a class="ee-mobile-link" data-route="book-event" href="${ROUTES.bookEvent}">Book Event</a>
                <a class="ee-mobile-link" data-route="create-event" href="${ROUTES.createEvent}">Create Event</a>
                <a class="ee-mobile-link" data-route="support" href="${ROUTES.support}">Support</a>
                <a class="ee-mobile-link" data-route="profile" href="${ROUTES.profile}">My Profile</a>
                <a class="ee-mobile-link" data-route="wallet" href="${ROUTES.wallet}">My Wallet</a>
                <a class="ee-mobile-link" data-route="my-events" href="${ROUTES.myEvents}">My Events</a>
                <a class="ee-mobile-link" data-route="favorites" href="${ROUTES.favorites}">Favorite Events</a>
                <a class="ee-mobile-link" data-route="notifications" href="${ROUTES.notifications}">
                    Notifications <span class="ee-mobile-badge" data-role="mobile-notif-badge">0</span>
                </a>
                <button class="ee-mobile-link ee-mobile-logout" type="button" data-action="logout">Log Out</button>
            </div>
        `;
    }

    function applyActiveStates() {
        const page = getCurrentPage();
        const allLinks = nav.querySelectorAll('.ee-nav-link, .ee-mobile-link, .ee-icon-btn, .ee-dropdown-item');
        allLinks.forEach((link) => link.classList.remove('active'));

        const routeCandidates = nav.querySelectorAll('[data-route]');
        routeCandidates.forEach((item) => {
            const href = item.getAttribute('href') || '';
            const normalized = normalizeNavPage(href);
            if (!normalized) return;

            if (normalized === page) {
                item.classList.add('active');
            }
        });

        const profileScopePages = new Set(['profile.html', 'wallet.html', 'my-events.html', 'fav-events.html', 'venue-owner-dashboard.html']);
        if (profileScopePages.has(page)) {
            const trigger = nav.querySelector('[data-role="profile-trigger"]');
            if (trigger) trigger.classList.add('active');
        }
    }

    async function fetchJson(path) {
        const token = getToken();
        if (!token) return null;

        try {
            const response = await fetch(`${API_BASE}${path}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (_) {
            return null;
        }
    }

    function getApiOrigin() {
        try {
            return new URL(API_BASE).origin;
        } catch (_) {
            return window.location.origin;
        }
    }

    function resolveProfileImageUrl(imageUrl) {
        const raw = String(imageUrl || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
        if (raw.startsWith('/')) return `${getApiOrigin()}${raw}`;
        return `${getApiOrigin()}/${raw}`;
    }

    function updateProfileUiFromData(userData) {
        const username = userData?.username || getStoredUser().username || 'user';
        const fullName = userData?.fullName || getStoredUser().fullName || '';
        const imageUrl = resolveProfileImageUrl(userData?.profileImageUrl || '');
        const initials = getInitials(username, fullName);

        const avatarTargets = nav.querySelectorAll('[data-role="profile-avatar"], [data-role="dropdown-avatar"]');
        avatarTargets.forEach((target) => {
            target.innerHTML = '';
            target.classList.remove('ee-avatar-image');
            if (imageUrl) {
                target.classList.add('ee-avatar-image');
                target.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="Profile avatar">`;
            } else {
                target.textContent = initials;
            }
        });

        const usernameEl = nav.querySelector('[data-role="dropdown-username"]');
        const handleEl = nav.querySelector('[data-role="dropdown-handle"]');
        if (usernameEl) usernameEl.textContent = fullName || username;
        if (handleEl) handleEl.textContent = `@${username}`;
    }

    function updateNotificationBadge(unreadCount) {
        const count = Math.max(0, Number(unreadCount || 0));
        const display = count > 99 ? '99+' : String(count);
        const badges = nav.querySelectorAll('[data-role="notif-badge"], [data-role="mobile-notif-badge"]');
        badges.forEach((badge) => {
            badge.textContent = display;
            badge.classList.toggle('is-zero', count === 0);
        });
    }

    function countUnreadNotifications(payload) {
        const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
        return list.filter((item) => {
            if (item == null) return false;
            const value = item.is_read;
            return value === false || value === 0 || value === '0' || value === 'false';
        }).length;
    }

    async function hydrateLoggedInMeta() {
        const [unreadData, allNotifData] = await Promise.all([
            fetchJson('/Notifications?unreadOnly=true'),
            fetchJson('/Notifications')
        ]);

        const strictUnreadCountFromAll = countUnreadNotifications(allNotifData);
        const unreadOnlyCount = Array.isArray(unreadData?.notifications) ? unreadData.notifications.length : 0;
        const unreadCount = strictUnreadCountFromAll > 0 || unreadOnlyCount === 0
            ? strictUnreadCountFromAll
            : unreadOnlyCount;

        updateNotificationBadge(unreadCount);
    }

    async function handleLogout() {
        const token = getToken();
        try {
            if (token) {
                await fetch(`${API_BASE}${window.AuthConfig.endpoints.logout}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        } catch (_) {
            // keep local logout robust even if backend call fails
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('isLoggedIn', 'false');
        window.location.href = ROUTES.signIn;
    }

    function bindInteractions() {
        const brandEl = header.querySelector('.brand');
        if (brandEl && brandEl.dataset.eeBrandBound !== 'true') {
            brandEl.dataset.eeBrandBound = 'true';
            if (brandEl.tagName.toLowerCase() === 'a') {
                brandEl.setAttribute('href', ROUTES.home);
            } else {
                const link = document.createElement('a');
                link.className = brandEl.className;
                link.href = ROUTES.home;
                link.style.textDecoration = 'none';
                link.style.color = 'inherit';
                link.dataset.eeBrandBound = 'true';
                while (brandEl.firstChild) {
                    link.appendChild(brandEl.firstChild);
                }
                brandEl.replaceWith(link);
            }
        }

        if (docClickHandler) {
            document.removeEventListener('click', docClickHandler);
            docClickHandler = null;
        }
        if (docKeyHandler) {
            document.removeEventListener('keydown', docKeyHandler);
            docKeyHandler = null;
        }

        const profileTrigger = nav.querySelector('[data-role="profile-trigger"]');
        const profileDropdown = nav.querySelector('[data-role="profile-dropdown"]');
        if (profileTrigger && profileDropdown) {
            const closeDropdown = () => {
                profileDropdown.classList.remove('open');
                profileTrigger.setAttribute('aria-expanded', 'false');
            };

            profileTrigger.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                const willOpen = !profileDropdown.classList.contains('open');
                profileDropdown.classList.toggle('open', willOpen);
                profileTrigger.setAttribute('aria-expanded', String(willOpen));
            });

            docClickHandler = function (event) {
                if (!profileDropdown.contains(event.target) && !profileTrigger.contains(event.target)) {
                    closeDropdown();
                }
            };
            docKeyHandler = function (event) {
                if (event.key === 'Escape') closeDropdown();
            };
            document.addEventListener('click', docClickHandler);
            document.addEventListener('keydown', docKeyHandler);
        }

        const logoutButtons = nav.querySelectorAll('[data-action="logout"]');
        logoutButtons.forEach((button) => {
            button.addEventListener('click', function (event) {
                event.preventDefault();
                handleLogout();
            });
        });

        const navLinks = nav.querySelectorAll('a');
        navLinks.forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= MOBILE_BREAKPOINT) {
                    header.classList.remove('menu-open');
                    const menuToggle = header.querySelector('.menu-toggle');
                    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    function renderNav() {
        header.classList.add('ee-navbar');
        nav.classList.add('ee-navbar-nav');
        nav.classList.remove('guest-mode');
        bindCompactScrollState();

        const loggedIn = isLoggedIn();
        const desktop = loggedIn ? buildDesktopLoggedInHtml() : buildDesktopGuestHtml();
        const mobile = buildMobileMenuHtml(loggedIn);
        nav.innerHTML = `${desktop}${mobile}`;

        bindInteractions();
        applyActiveStates();

        if (loggedIn) {
            updateProfileUiFromData(getStoredUser());
            hydrateLoggedInMeta();
        }
    }

    renderNav();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                renderNav();
            }
        });
    });
    observer.observe(document.body, { attributes: true });
});
