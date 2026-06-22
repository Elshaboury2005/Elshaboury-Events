(function () {
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';
  const ADMIN_KEY = 'adminToken';
  const ADMIN_LAST_ACTIVITY = 'adminLastActivity';
  const ADMIN_PROFILE_KEY = 'adminProfile';
  const INACTIVITY_MS = 15 * 60 * 1000;

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  function safeParseJson(raw, fallback = null) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.AdminApp = {
    apiBaseUrl: API_BASE_URL,
    getToken() {
      return localStorage.getItem(ADMIN_KEY);
    },
    setToken(token) {
      localStorage.setItem(ADMIN_KEY, token);
      localStorage.setItem(ADMIN_LAST_ACTIVITY, String(Date.now()));
    },
    getAdminProfile() {
      return safeParseJson(localStorage.getItem(ADMIN_PROFILE_KEY), null);
    },
    setAdminProfile(profile) {
      if (!profile) {
        localStorage.removeItem(ADMIN_PROFILE_KEY);
        return;
      }
      localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile));
    },
    clearToken() {
      localStorage.removeItem(ADMIN_KEY);
      localStorage.removeItem(ADMIN_LAST_ACTIVITY);
      localStorage.removeItem(ADMIN_PROFILE_KEY);
    },
    touch() {
      localStorage.setItem(ADMIN_LAST_ACTIVITY, String(Date.now()));
    },
    async request(path, options = {}) {
      const token = this.getToken();
      const headers = Object.assign({}, options.headers || {});
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
      });

      if (response.status === 401 || response.status === 403) {
        this.clearToken();
        if (!window.location.pathname.endsWith('/admin/login.html')) {
          window.location.href = '/admin/login.html';
        }
        throw new Error('Unauthorized');
      }

      return response;
    },
    enforceSessionTimeout() {
      if (this._sessionTimeoutInitialized) return;
      this._sessionTimeoutInitialized = true;

      const check = () => {
        const last = parseInt(localStorage.getItem(ADMIN_LAST_ACTIVITY) || '0', 10);
        if (!last) return;
        if (Date.now() - last > INACTIVITY_MS) {
          this.clearToken();
          alert('Admin session timed out for security. Please login again.');
          window.location.href = '/admin/login.html';
        }
      };

      ['click', 'keydown', 'mousemove', 'scroll'].forEach((evt) => {
        window.addEventListener(evt, () => this.touch(), { passive: true });
      });
      setInterval(check, 30000);
    },
    async requireAuth() {
      const token = this.getToken();
      if (!token) {
        window.location.href = '/admin/login.html';
        return false;
      }
      try {
        const response = await this.request('/Admin/auth/verify');
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error('verify failed');
        this.setAdminProfile(data.admin || null);
        return true;
      } catch (err) {
        this.clearToken();
        window.location.href = '/admin/login.html';
        return false;
      }
    },
    attachLogoutButton() {
      const btn = document.getElementById('adminLogoutBtn');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          await this.request('/Admin/auth/logout', { method: 'POST' });
        } catch (_) {}
        this.clearToken();
        window.location.href = '/admin/login.html';
      });
    },
    escapeHtml,
    parseJson(value, fallback = null) {
      if (typeof value !== 'string') return value ?? fallback;
      return safeParseJson(value, fallback);
    },
    formatDateTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return escapeHtml(value);
      return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
    },
    formatDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return escapeHtml(value);
      return dateFormatter.format(date);
    },
    formatNumber(value) {
      return normalizeNumber(value).toLocaleString('en-US');
    },
    formatCurrency(value, currency = 'EGP') {
      return `${normalizeNumber(value).toLocaleString('en-US', {
        maximumFractionDigits: 0
      })} ${currency}`;
    },
    getInitials(value) {
      const clean = String(value || '').trim();
      if (!clean) return 'NA';
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    },
    debounce(fn, delay = 250) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },
    animateCount(element, target, options = {}) {
      if (!element) return;
      const startValue = normalizeNumber(options.startAt, 0);
      const endValue = normalizeNumber(target, 0);
      const duration = Math.max(300, normalizeNumber(options.duration, 900));
      const formatter = typeof options.formatter === 'function'
        ? options.formatter
        : (value) => Math.round(value).toLocaleString('en-US');
      const prefix = options.prefix || '';
      const suffix = options.suffix || '';

      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (endValue - startValue) * eased;
        element.textContent = `${prefix}${formatter(current)}${suffix}`;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          element.textContent = `${prefix}${formatter(endValue)}${suffix}`;
        }
      };

      requestAnimationFrame(tick);
    },
    getEventLifecycleStatus(eventDate, eventStatus) {
      const normalizedStatus = String(eventStatus || 'pending').toLowerCase();
      if (normalizedStatus === 'approved' && eventDate) {
        const parsedDate = new Date(eventDate);
        if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() < Date.now()) {
          return 'ended';
        }
      }
      return normalizedStatus;
    }
  };
})();



