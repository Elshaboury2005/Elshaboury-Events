(function () {
    let pendingAuthState = null;
    let platformStatusPollStarted = false;
    let pendingForcedPublicPreviewState = null;

    function detectForcedPublicPreview(page) {
        try {
            const currentPage = page || window.AuthConfig?.getCurrentPage?.() || '';
            const publicPages = window.AuthConfig?.pages?.public || [];
            const viewer = new URLSearchParams(window.location.search).get('viewer');
            return publicPages.includes(currentPage) && viewer === 'public';
        } catch (_) {
            return false;
        }
    }

    function setForcedPublicPreviewState(isForced) {
        const apply = () => {
            if (!document.body) return false;
            document.body.classList.toggle('force-public-preview', Boolean(isForced));
            return true;
        };

        if (apply()) return;
        pendingForcedPublicPreviewState = Boolean(isForced);
    }

    function setPlatformAccessState(state) {
        const safeState = {
            locked: Boolean(state?.locked),
            maintenanceMode: Boolean(state?.maintenanceMode),
            siteName: String(state?.siteName || 'Elshaboury Events'),
            message: String(state?.message || '')
        };

        window.__eePlatformAccessState = safeState;
        window.dispatchEvent(new CustomEvent('ee:platform-access-state', {
            detail: safeState
        }));
    }

    function setBodyAuthState(isLoggedIn) {
        const apply = () => {
            if (!document.body) return false;
            document.body.classList.toggle('is-logged-in', Boolean(isLoggedIn));
            document.body.classList.toggle('is-guest', !isLoggedIn);
            return true;
        };

        if (apply()) return;
        pendingAuthState = Boolean(isLoggedIn);
    }

    function applyPendingAuthState() {
        if (pendingAuthState == null) return;
        if (!document.body) return;
        document.body.classList.toggle('is-logged-in', Boolean(pendingAuthState));
        document.body.classList.toggle('is-guest', !pendingAuthState);
        pendingAuthState = null;
    }

    function applyPendingForcedPublicPreviewState() {
        if (pendingForcedPublicPreviewState == null) return;
        if (!document.body) return;
        document.body.classList.toggle('force-public-preview', Boolean(pendingForcedPublicPreviewState));
        pendingForcedPublicPreviewState = null;
    }

    function parseJwtPayload(token) {
        try {
            const raw = String(token || '').split('.')[1] || '';
            if (!raw) return null;
            const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            return JSON.parse(atob(padded));
        } catch (_) {
            return null;
        }
    }

    function isTokenExpired(token) {
        const payload = parseJwtPayload(token);
        const expSeconds = Number(payload?.exp || 0);
        if (!Number.isFinite(expSeconds) || expSeconds <= 0) return false;
        return (Date.now() + 5000) >= (expSeconds * 1000);
    }

    function getStoredUserSafe() {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch (_) {
            return {};
        }
    }

    function ensureFloatingEventChatWidgetLoaded() {
        if (window.__eeFloatingEventChatRequested) return;
        window.__eeFloatingEventChatRequested = true;

        if (document.querySelector('script[data-ee-chat-widget="true"]')) return;

        const script = document.createElement('script');
        script.src = '/public/js/floating-event-chat.js';
        script.defer = true;
        script.setAttribute('data-ee-chat-widget', 'true');
        document.head.appendChild(script);
    }

    async function fetchPlatformAccessState() {
        try {
            const response = await fetch(`${window.AuthConfig.apiBaseUrl}/platform/access`, {
                cache: 'no-store'
            });
            if (!response.ok) return null;
            const data = await response.json().catch(() => null);
            if (!data) return null;
            return {
                locked: Boolean(data.locked),
                maintenanceMode: Boolean(data.maintenanceMode),
                siteName: String(data.siteName || 'Elshaboury Events'),
                message: String(data.message || '')
            };
        } catch (_) {
            return null;
        }
    }

    function clearUserSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('isLoggedIn', 'false');
        setBodyAuthState(false);
    }

    function handlePlatformLocked(page, platformState) {
        clearUserSession();
        setPlatformAccessState(platformState);

        if (page !== 'signin.html') {
            window.location.replace('/html/signin.html?platformLocked=1');
        }
    }

    function startPlatformStatusPolling() {
        if (platformStatusPollStarted) return;
        platformStatusPollStarted = true;

        setInterval(async () => {
            const state = await fetchPlatformAccessState();
            if (!state) return;

            const page = window.AuthConfig.getCurrentPage();
            if (state.locked) {
                handlePlatformLocked(page, state);
                return;
            }

            setPlatformAccessState(state);
        }, 30000);
    }

    async function checkAuth() {
        const page = window.AuthConfig.getCurrentPage();
        const isAuthPage = ['signin.html', 'register.html'].includes(page);
        const token = localStorage.getItem('token');
        const forcedPublicPreview = detectForcedPublicPreview(page);

        window.__eeForcePublicPreview = forcedPublicPreview;
        setForcedPublicPreviewState(forcedPublicPreview);

        const platformState = await fetchPlatformAccessState();
        if (platformState) {
            setPlatformAccessState(platformState);
            startPlatformStatusPolling();

            if (platformState.locked) {
                handlePlatformLocked(page, platformState);
                return;
            }
        } else {
            setPlatformAccessState({ locked: false, maintenanceMode: false, siteName: 'Elshaboury Events', message: '' });
        }

        if (forcedPublicPreview) {
            setBodyAuthState(false);
            return;
        }

        // Define protected pages using config if possible, or fallback
        // The config is loaded before this script, so window.AuthConfig should be available.
        // However, we need to be careful about async loading. 
        // We'll trust the order of scripts in HTML.

        // Strategy:
        // 1. If no token, treat as guest.
        // 2. If token exists, verify it with backend.

        if (!token) {
            handleGuest(page, isAuthPage);
            return;
        }

        if (isTokenExpired(token)) {
            handleInvalidToken();
            return;
        }

        try {
            const response = await fetch(`${window.AuthConfig.apiBaseUrl}${window.AuthConfig.endpoints.verify}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                // Token is valid
                const data = await response.json();
                handleLoggedIn(page, isAuthPage, data.user);
            } else {
                // Treat only explicit auth failures as invalid token.
                if (response.status === 401 || response.status === 403) {
                    handleInvalidToken();
                } else {
                    handleLoggedIn(page, isAuthPage, getStoredUserSafe());
                }
            }
        } catch (error) {
            console.error('Auth verification failed:', error);
            // Keep local session on temporary/network failures.
            handleLoggedIn(page, isAuthPage, getStoredUserSafe());
        }
    }

    function handleGuest(page, isAuthPage) {
        clearUserSession();

        // If trying to access protected page, redirect
        // We need a list of protected pages. 
        // If AuthConfig is loaded:
        if (window.AuthConfig && window.AuthConfig.pages.protected.includes(page)) {
            window.location.replace('/html/signin.html');
        }
    }

    function handleLoggedIn(page, isAuthPage, user) {
        localStorage.setItem('isLoggedIn', 'true');
        // Update user info if needed
        if (user) localStorage.setItem('user', JSON.stringify(user));

        setBodyAuthState(true);

        const role = String(user?.role || getStoredUserSafe().role || 'user').trim().toLowerCase();
        const venueOwnerBlockedPages = new Set([
            'book-event.html',
            'create-event.html',
            'my-events.html',
            'fav-events.html',
            'manage-event.html',
            'event-flow-data.html'
        ]);

        // If on auth page (login/register), redirect to home
        if (isAuthPage) {
            window.location.replace(role === 'venue_owner' ? '/html/venue-owner-dashboard.html' : '/html/index.html');
            return;
        }

        if (role === 'venue_owner' && venueOwnerBlockedPages.has(page)) {
            window.location.replace('/html/venue-owner-dashboard.html');
            return;
        }

        if (role !== 'venue_owner') {
            ensureFloatingEventChatWidgetLoaded();
        }
    }

    function handleInvalidToken() {
        clearUserSession();

        // Redirect to login if on protected page
        const page = window.AuthConfig.getCurrentPage();
        if (window.AuthConfig && window.AuthConfig.pages.protected.includes(page)) {
            window.location.replace('/html/signin.html');
        }
    }

    // Run immediately
    if (window.AuthConfig) {
        checkAuth();
    } else {
        // Wait for config? Or assume it's there. 
        // Best practice: Ensure script order in HTML.
        console.error('AuthConfig not found! Make sure auth-config.js is loaded first.');
    }

    // Re-run on Back/Forward navigation
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            checkAuth();
        }
    });

    document.addEventListener('DOMContentLoaded', applyPendingAuthState);
    document.addEventListener('DOMContentLoaded', applyPendingForcedPublicPreviewState);
})();
