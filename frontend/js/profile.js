(function () {
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';

  const state = {
    profile: null,
    quickStats: null,
    activitySummary: null,
    notificationPreferences: null,
    metadata: {
      governorates: [],
      genders: []
    }
  };

  function getToken() {
    return localStorage.getItem('token');
  }

  function authHeaders(isJson = true) {
    const headers = { Authorization: `Bearer ${getToken()}` };
    if (isJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setFeedback(element, message, type) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.remove('success', 'error');
    if (type) element.classList.add(type);
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();
    if (!token) {
      window.location.href = 'signin.html';
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      const authMessage = String(data?.message || '').toLowerCase();
      const shouldLogout =
        response.status === 401 ||
        (response.status === 403 &&
          (authMessage.includes('invalid') ||
            authMessage.includes('expired') ||
            authMessage.includes('token') ||
            authMessage.includes('access token')));

      if (shouldLogout) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('isLoggedIn', 'false');
        window.location.href = 'signin.html';
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function setupMenuToggle() {
    const header = document.querySelector('header');
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelectorAll('nav a');
    if (!header || !menuToggle) return;

    const setMenuState = (open) => {
      header.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = header.classList.contains('menu-open');
      setMenuState(!isOpen);
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 860) setMenuState(false);
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) setMenuState(false);
    });
  }

  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-tab-target');
        if (!target) return;

        tabButtons.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');

        tabPanels.forEach((panel) => {
          panel.classList.toggle('active', panel.getAttribute('data-tab-panel') === target);
        });
      });
    });
  }

  function getInitials(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  function updateAvatar(profile) {
    const avatarImage = document.getElementById('profileAvatar');
    const avatarInitials = document.getElementById('avatarInitials');
    if (!avatarImage || !avatarInitials) return;

    avatarInitials.textContent = getInitials(profile.fullName);

    if (profile.profileImageUrl) {
      avatarImage.src = profile.profileImageUrl;
      avatarImage.style.display = 'block';
      avatarInitials.style.display = 'none';
    } else {
      avatarImage.src = '';
      avatarImage.style.display = 'none';
      avatarInitials.style.display = 'inline';
    }
  }

  function populateMetaOptions(metadata) {
    const genders = metadata?.genders || [];
    const governorates = metadata?.governorates || [];
    const genderSelect = document.getElementById('gender');
    const governorateSelect = document.getElementById('governorate');

    if (genderSelect) {
      const previous = genderSelect.value;
      genderSelect.innerHTML = '<option value="">Select gender</option>';
      genders.forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        genderSelect.appendChild(option);
      });
      genderSelect.value = previous;
    }

    if (governorateSelect) {
      const previous = governorateSelect.value;
      governorateSelect.innerHTML = '<option value="">Select governorate</option>';
      governorates.forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        governorateSelect.appendChild(option);
      });
      governorateSelect.value = previous;
    }
  }

  function renderQuickStats(quickStats) {
    document.getElementById('walletBalanceValue').textContent = formatMoney(quickStats.walletBalance);
    document.getElementById('activeTicketsValue').textContent = Number(quickStats.activeUpcomingTickets || 0).toString();
    document.getElementById('upcomingEventsValue').textContent = Number(quickStats.upcomingEvents || 0).toString();
    document.getElementById('memberSinceValue').textContent = formatDate(quickStats.memberSince);
  }

  function renderActivitySummary(summary) {
    document.getElementById('statEventsBooked').textContent = String(summary.totalEventsBooked || 0);
    document.getElementById('statEventsCreated').textContent = String(summary.totalEventsCreated || 0);
    document.getElementById('statEventsAttended').textContent = String(summary.totalEventsAttended || 0);
    document.getElementById('statReviewsSubmitted').textContent = String(summary.totalReviewsSubmitted || 0);
    document.getElementById('statTicketsPurchased').textContent = String(summary.totalTicketsPurchased || 0);
    document.getElementById('statAmountSpent').textContent = formatMoney(summary.totalAmountSpentEgp || 0);
  }

  function renderNotificationPreferences(preferences) {
    const map = {
      prefEventReminders: 'eventReminders',
      prefBookingConfirmations: 'bookingConfirmations',
      prefRefundNotifications: 'refundNotifications',
      prefEventCancellationAlerts: 'eventCancellationAlerts',
      prefNewEventsMatchingInterests: 'newEventsMatchingInterests',
      prefWalletTopupConfirmations: 'walletTopupConfirmations'
    };

    Object.entries(map).forEach(([inputId, key]) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.checked = preferences[key] !== false;
    });
  }

  function fillPersonalInfoForm(profile) {
    document.getElementById('fullName').value = profile.fullName || '';
    document.getElementById('username').value = profile.username || '';
    document.getElementById('email').value = profile.email || '';
    document.getElementById('phoneNumber').value = profile.phoneNumber || '';
    document.getElementById('dateOfBirth').value = profile.dateOfBirth || '';
    document.getElementById('gender').value = profile.gender || '';
    document.getElementById('governorate').value = profile.governorate || '';
    document.getElementById('lastLoginAtValue').textContent = formatDateTime(profile.lastLoginAt);
    populateSessionDetails();

    const form = document.getElementById('personalInfoForm');
    form.dataset.originalUsername = profile.username || '';
    form.dataset.originalEmail = profile.email || '';
  }

  function detectBrowser(userAgent) {
    const ua = String(userAgent || '');
    if (/edg\//i.test(ua)) return 'Microsoft Edge';
    if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera';
    if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return 'Google Chrome';
    if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'Safari';
    if (/firefox\//i.test(ua)) return 'Mozilla Firefox';
    return 'Unknown Browser';
  }

  function detectDeviceOs(userAgent) {
    const ua = String(userAgent || '');
    if (/windows nt/i.test(ua)) return 'Desktop / Windows';
    if (/mac os x/i.test(ua)) return 'Desktop / macOS';
    if (/android/i.test(ua)) return 'Mobile / Android';
    if (/(iphone|ipad|ipod)/i.test(ua)) return 'Mobile / iOS';
    if (/linux/i.test(ua)) return 'Desktop / Linux';
    return 'Unknown Device';
  }

  function populateSessionDetails() {
    const browserElement = document.getElementById('sessionBrowserValue');
    const deviceElement = document.getElementById('sessionDeviceValue');
    const timezoneElement = document.getElementById('sessionTimezoneValue');
    const userAgent = window.navigator?.userAgent || '';

    if (browserElement) browserElement.textContent = detectBrowser(userAgent);
    if (deviceElement) deviceElement.textContent = detectDeviceOs(userAgent);
    if (timezoneElement) {
      timezoneElement.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '-';
    }
  }

  function syncLocalStorageUser(profile) {
    try {
      const existing = JSON.parse(localStorage.getItem('user') || '{}');
      const merged = {
        ...existing,
        id: profile.id || existing.id,
        username: profile.username,
        email: profile.email,
        fullName: profile.fullName
      };
      localStorage.setItem('user', JSON.stringify(merged));
    } catch (_) {
      localStorage.setItem('user', JSON.stringify({
        id: profile.id,
        username: profile.username,
        email: profile.email,
        fullName: profile.fullName
      }));
    }
  }

  async function loadProfile() {
    const data = await apiRequest('/Profile', {
      method: 'GET',
      headers: authHeaders(false)
    });

    state.profile = data.profile;
    state.quickStats = data.quickStats;
    state.activitySummary = data.activitySummary;
    state.notificationPreferences = data.notificationPreferences || {};
    state.metadata = data.metadata || { governorates: [], genders: [] };

    populateMetaOptions(state.metadata);
    fillPersonalInfoForm(state.profile);
    updateAvatar(state.profile);
    renderQuickStats(state.quickStats);
    renderActivitySummary(state.activitySummary);
    renderNotificationPreferences(state.notificationPreferences);
  }

  function validatePersonalInfo(payload, originalEmail) {
    if (!payload.fullName || payload.fullName.length < 2 || payload.fullName.length > 100) {
      return 'Full name must be between 2 and 100 characters';
    }
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(payload.username)) {
      return 'Username must be 3-30 chars using letters, numbers, dot, underscore';
    }
    if (!payload.email || !payload.email.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (payload.phoneNumber && !/^\+?[0-9()\-\s]{7,20}$/.test(payload.phoneNumber)) {
      return 'Please enter a valid phone number';
    }
    if (payload.dateOfBirth) {
      const dob = new Date(payload.dateOfBirth);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (Number.isNaN(dob.getTime())) return 'Invalid date of birth';
      if (dob > now) return 'Date of birth cannot be in the future';
    }
    if (payload.gender && !(state.metadata.genders || []).includes(payload.gender)) {
      return 'Invalid gender selection';
    }
    if (payload.governorate && !(state.metadata.governorates || []).includes(payload.governorate)) {
      return 'Invalid governorate selection';
    }
    if (payload.email !== originalEmail && !payload.currentPassword) {
      return 'Current password is required to change email';
    }
    return null;
  }

  async function isUsernameAvailable(username) {
    const response = await fetch(`${API_BASE_URL}/Account/checkusername?username=${encodeURIComponent(username)}`);
    const data = await response.json();
    return data.available === true;
  }

  async function handlePersonalInfoSubmit(event) {
    event.preventDefault();
    const feedback = document.getElementById('personalInfoFeedback');
    const form = document.getElementById('personalInfoForm');

    const payload = {
      fullName: document.getElementById('fullName').value.trim(),
      username: document.getElementById('username').value.trim(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      phoneNumber: document.getElementById('phoneNumber').value.trim(),
      dateOfBirth: document.getElementById('dateOfBirth').value,
      gender: document.getElementById('gender').value,
      governorate: document.getElementById('governorate').value,
      currentPassword: document.getElementById('emailChangePassword').value
    };

    const originalUsername = form.dataset.originalUsername || '';
    const originalEmail = form.dataset.originalEmail || '';
    const validationError = validatePersonalInfo(payload, originalEmail);
    if (validationError) {
      setFeedback(feedback, validationError, 'error');
      return;
    }

    try {
      setFeedback(feedback, 'Saving...', '');

      if (payload.username !== originalUsername) {
        const available = await isUsernameAvailable(payload.username);
        if (!available) {
          setFeedback(feedback, 'Username is already taken', 'error');
          return;
        }
      }

      const data = await apiRequest('/Profile/personal-info', {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify(payload)
      });

      state.profile = data.profile;
      fillPersonalInfoForm(state.profile);
      updateAvatar(state.profile);
      syncLocalStorageUser(state.profile);
      document.getElementById('emailChangePassword').value = '';
      setFeedback(feedback, data.message || 'Profile updated successfully', 'success');
    } catch (error) {
      setFeedback(feedback, error.message || 'Failed to update profile', 'error');
    }
  }

  async function handleProfileImageUpload(file) {
    const feedback = document.getElementById('personalInfoFeedback');
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      setFeedback(feedback, 'Please select a valid image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback(feedback, 'Image must be 5MB or smaller', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('photo', file);

    try {
      setFeedback(feedback, 'Uploading image...', '');
      const response = await fetch(`${API_BASE_URL}/Profile/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to upload image');

      state.profile.profileImageUrl = data.profileImageUrl || '';
      updateAvatar(state.profile);
      setFeedback(feedback, 'Profile image updated successfully', 'success');
    } catch (error) {
      setFeedback(feedback, error.message || 'Failed to upload profile image', 'error');
    }
  }

  async function handleRemoveProfileImage() {
    const feedback = document.getElementById('personalInfoFeedback');
    try {
      setFeedback(feedback, 'Removing image...', '');
      const data = await apiRequest('/Profile/photo', {
        method: 'DELETE',
        headers: authHeaders(false)
      });
      state.profile.profileImageUrl = '';
      updateAvatar(state.profile);
      setFeedback(feedback, data.message || 'Profile image removed', 'success');
    } catch (error) {
      setFeedback(feedback, error.message || 'Failed to remove profile image', 'error');
    }
  }

  function calculatePasswordStrength(password) {
    let score = 0;
    if (!password) return { score: 0, width: '0%', label: 'Strength: -', color: '#6b7280', tone: '' };
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 2) return { score, width: '25%', label: 'Strength: Weak', color: '#ef4444', tone: 'weak' };
    if (score <= 4) return { score, width: '60%', label: 'Strength: Medium', color: '#f59e0b', tone: 'medium' };
    return { score, width: '100%', label: 'Strength: Strong', color: '#22c55e', tone: 'strong' };
  }

  function updatePasswordStrengthUI() {
    const newPassword = document.getElementById('newPassword').value;
    const strength = calculatePasswordStrength(newPassword);
    const bar = document.getElementById('passwordStrengthBar');
    const text = document.getElementById('passwordStrengthText');
    bar.style.width = strength.width;
    bar.style.background = strength.color;
    text.textContent = strength.label;
    text.classList.remove('weak', 'medium', 'strong');
    if (strength.tone) text.classList.add(strength.tone);
  }

  async function handleChangePasswordSubmit(event) {
    event.preventDefault();
    const feedback = document.getElementById('passwordFeedback');

    const payload = {
      currentPassword: document.getElementById('currentPassword').value,
      newPassword: document.getElementById('newPassword').value,
      confirmNewPassword: document.getElementById('confirmNewPassword').value
    };

    if (!payload.currentPassword || !payload.newPassword || !payload.confirmNewPassword) {
      setFeedback(feedback, 'All password fields are required', 'error');
      return;
    }
    if (payload.newPassword !== payload.confirmNewPassword) {
      setFeedback(feedback, 'New passwords do not match', 'error');
      return;
    }

    try {
      setFeedback(feedback, 'Updating password...', '');
      const data = await apiRequest('/Profile/change-password', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload)
      });
      document.getElementById('changePasswordForm').reset();
      updatePasswordStrengthUI();
      setFeedback(feedback, data.message || 'Password updated successfully', 'success');
    } catch (error) {
      setFeedback(feedback, error.message || 'Failed to update password', 'error');
    }
  }

    function reviewStars(rating) {
    const safeRating = Math.max(1, Math.min(5, Number(rating) || 0));
    return `${'\u2605'.repeat(safeRating)}${'\u2606'.repeat(5 - safeRating)}`;
  }
function renderReviews(reviews) {
    const container = document.getElementById('reviewsContainer');
    const emptyState = document.getElementById('reviewsEmptyState');

    if (!Array.isArray(reviews) || reviews.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = reviews.map((review) => `
      <article class="review-card" data-review-id="${escapeHtml(review.id)}">
        <div class="review-header">
          <div>
            <strong>${escapeHtml(review.event_name || 'Event')}</strong>
            <p class="meta">
              Event Date: ${formatDate(review.event_date)} |
              Submitted: ${formatDateTime(review.created_at)}
            </p>
          </div>
          <span class="stars">${reviewStars(review.rating)}</span>
        </div>
        <p class="review-text">${escapeHtml(review.review || '')}</p>

        <div class="review-actions">
          <button type="button" class="btn-secondary" data-action="edit-review">Edit</button>
          <button type="button" class="btn-danger" data-action="delete-review">Delete</button>
        </div>

        <form class="review-edit-form" data-edit-form>
          <label>
            Rating
            <select data-field="rating">
              <option value="5" ${Number(review.rating) === 5 ? 'selected' : ''}>5</option>
              <option value="4" ${Number(review.rating) === 4 ? 'selected' : ''}>4</option>
              <option value="3" ${Number(review.rating) === 3 ? 'selected' : ''}>3</option>
              <option value="2" ${Number(review.rating) === 2 ? 'selected' : ''}>2</option>
              <option value="1" ${Number(review.rating) === 1 ? 'selected' : ''}>1</option>
            </select>
          </label>
          <label>
            Review
            <textarea rows="3" data-field="review">${escapeHtml(review.review || '')}</textarea>
          </label>
          <div class="review-actions">
            <button type="button" class="btn-primary" data-action="save-review">Save</button>
            <button type="button" class="btn-secondary" data-action="cancel-edit">Cancel</button>
          </div>
        </form>
      </article>
    `).join('');
  }

  async function loadReviews() {
    const data = await apiRequest('/Profile/reviews', {
      method: 'GET',
      headers: authHeaders(false)
    });
    renderReviews(data.reviews || []);
  }

  async function handleReviewsInteraction(event) {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;

    const card = actionButton.closest('.review-card');
    if (!card) return;

    const reviewId = card.getAttribute('data-review-id');
    const action = actionButton.getAttribute('data-action');
    const editForm = card.querySelector('[data-edit-form]');

    if (action === 'edit-review') {
      editForm.classList.add('active');
      return;
    }

    if (action === 'cancel-edit') {
      editForm.classList.remove('active');
      return;
    }

    if (action === 'save-review') {
      const rating = Number(editForm.querySelector('[data-field="rating"]').value);
      const review = editForm.querySelector('[data-field="review"]').value.trim();

      try {
        await apiRequest(`/Profile/reviews/${encodeURIComponent(reviewId)}`, {
          method: 'PUT',
          headers: authHeaders(true),
          body: JSON.stringify({ rating, review })
        });
        await loadReviews();
      } catch (error) {
        alert(error.message || 'Failed to update review');
      }
      return;
    }

    if (action === 'delete-review') {
      if (!window.confirm('Delete this review permanently?')) return;
      try {
        await apiRequest(`/Profile/reviews/${encodeURIComponent(reviewId)}`, {
          method: 'DELETE',
          headers: authHeaders(false)
        });
        await loadReviews();
      } catch (error) {
        alert(error.message || 'Failed to delete review');
      }
    }
  }

  async function saveNotificationPreference(key, value) {
    const feedback = document.getElementById('preferencesFeedback');
    try {
      setFeedback(feedback, 'Saving preference...', '');
      const payload = {};
      payload[key] = value;
      const data = await apiRequest('/Profile/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(payload)
      });
      state.notificationPreferences = data.preferences || state.notificationPreferences;
      setFeedback(feedback, 'Saved', 'success');
      window.setTimeout(() => setFeedback(feedback, '', ''), 1200);
    } catch (error) {
      setFeedback(feedback, error.message || 'Failed to save preference', 'error');
      renderNotificationPreferences(state.notificationPreferences || {});
    }
  }

  function setupNotificationPreferenceToggles() {
    const toggles = document.querySelectorAll('input[type="checkbox"][data-pref-key]');
    toggles.forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const key = toggle.getAttribute('data-pref-key');
        saveNotificationPreference(key, toggle.checked);
      });
    });
  }

  function setupAccountDeletionModal() {
    const modal = document.getElementById('deleteAccountModal');
    const openBtn = document.getElementById('openDeleteModalBtn');
    const closeBtn = document.getElementById('closeDeleteModalBtn');
    const continueBtn = document.getElementById('continueDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const step1 = document.getElementById('deleteStep1');
    const step2 = document.getElementById('deleteStep2');
    const confirmInput = document.getElementById('deleteConfirmInput');
    const feedback = document.getElementById('deleteFeedback');

    function resetModal() {
      step1.classList.remove('hidden');
      step2.classList.add('hidden');
      confirmInput.value = '';
      setFeedback(feedback, '', '');
    }

    function openModal() {
      resetModal();
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    continueBtn.addEventListener('click', () => {
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      confirmInput.focus();
    });

    confirmBtn.addEventListener('click', async () => {
      const confirmText = confirmInput.value.trim();
      if (confirmText !== 'DELETE') {
        setFeedback(feedback, "You must type 'DELETE' exactly", 'error');
        return;
      }

      try {
        setFeedback(feedback, 'Deleting account...', '');
        await apiRequest('/Profile/account', {
          method: 'DELETE',
          headers: authHeaders(true),
          body: JSON.stringify({ confirmText })
        });
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('isLoggedIn', 'false');
        window.location.href = 'index.html';
      } catch (error) {
        setFeedback(feedback, error.message || 'Failed to delete account', 'error');
      }
    });
  }

  function bindEventHandlers() {
    document.getElementById('personalInfoForm').addEventListener('submit', handlePersonalInfoSubmit);
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePasswordSubmit);
    document.getElementById('newPassword').addEventListener('input', updatePasswordStrengthUI);
    document.getElementById('reviewsContainer').addEventListener('click', handleReviewsInteraction);

    const imageInput = document.getElementById('profileImageInput');
    document.getElementById('uploadImageBtn').addEventListener('click', () => imageInput.click());
    const avatarOverlayBtn = document.getElementById('avatarOverlayBtn');
    if (avatarOverlayBtn) {
      avatarOverlayBtn.addEventListener('click', () => imageInput.click());
    }
    imageInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      handleProfileImageUpload(file);
      event.target.value = '';
    });

    document.getElementById('removeImageBtn').addEventListener('click', handleRemoveProfileImage);
    setupNotificationPreferenceToggles();
    setupAccountDeletionModal();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupMenuToggle();
    setupTabs();
    bindEventHandlers();
    updatePasswordStrengthUI();

    try {
      await loadProfile();
      await loadReviews();
    } catch (error) {
      console.error('Profile page load error:', error);
      alert(error.message || 'Failed to load profile data.');
    }
  });
})();



