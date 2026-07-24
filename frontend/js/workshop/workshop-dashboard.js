/**
 * workshop-dashboard.js
 * All JS logic for the isolated Workshop Portal dashboard.
 * Reads from workshopToken + workshopMember in localStorage.
 */

const API = '/api/workshop';

// ── Auth guard ────────────────────────────────────────────────────────────────
const workshopToken  = localStorage.getItem('workshopToken');
const workshopMember = (() => {
  try { return JSON.parse(localStorage.getItem('workshopMember') || 'null'); }
  catch (_) { return null; }
})();

if (!workshopToken || !workshopMember) {
  window.location.replace('/html/signin.html?wserror=1');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${workshopToken}`
  };
}

function fmt(val, fallback = '—') {
  if (val === null || val === undefined || String(val).trim() === '') return fallback;
  return val;
}

function fmtDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return val; }
}

function fmtPrice(val) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  return isNaN(n) ? '—' : `${n.toFixed(2)} EGP`;
}

function rolePillHtml(role) {
  const map = { head: 'Head', vice_head: 'Vice Head', member: 'Member' };
  return `<span class="role-pill ${role}">${map[role] || role}</span>`;
}

function showMsg(el, type, text) {
  el.className = `ws-message ${type} show`;
  el.textContent = text;
  if (type === 'success') {
    setTimeout(() => { el.classList.remove('show'); }, 4000);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
function workshopLogout() {
  localStorage.removeItem('workshopToken');
  localStorage.removeItem('workshopMember');
  window.location.replace('/html/signin.html');
}

// ── Initialise nav ────────────────────────────────────────────────────────────
function initNav() {
  const emailEl = document.getElementById('wsNavEmail');
  const roleEl = document.getElementById('wsNavRole');
  const logoutBtn = document.getElementById('wsLogoutBtn');

  if (emailEl) emailEl.textContent = workshopMember.email || '';
  if (roleEl) {
    const roleMap = { head: '🔑 Head', vice_head: '🧩 Vice Head', member: '👤 Member' };
    roleEl.textContent = `${roleMap[workshopMember.role] || workshopMember.role} · ${workshopMember.categoryName}`;
  }
  if (logoutBtn) logoutBtn.addEventListener('click', workshopLogout);
}

// ── Load dashboard data ───────────────────────────────────────────────────────
async function loadDashboard() {
  const container = document.getElementById('wsDashboardMain');
  container.innerHTML = `<div class="ws-loading"><span class="ws-spinner"></span>Loading workshop data…</div>`;

  let data, progressData, checkinData, calendarData;
  try {
    const headers = apiHeaders();
    const [res, progRes, checkRes, calRes] = await Promise.all([
      fetch(`${API}/dashboard`, { headers }),
      fetch('/api/workshop/progress', { headers }),
      fetch('/api/workshop/checkin/summary', { headers }),
      fetch('/api/workshop/calendar', { headers })
    ]);

    data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load dashboard');

    try { progressData = await progRes.json(); } catch (_) { progressData = null; }
    try { checkinData = await checkRes.json(); } catch (_) { checkinData = null; }
    try { calendarData = await calRes.json(); } catch (_) { calendarData = null; }

  } catch (err) {
    container.innerHTML = `
      <div class="ws-card">
        <div class="ws-message error show">${err.message}</div>
      </div>`;
    if (err.message && (err.message.includes('token') || err.message.includes('expired'))) {
      setTimeout(workshopLogout, 2000);
    }
    return;
  }

  const { event, venue, member } = data;
  const isHead = member.role === 'head';

  const stats = progressData && progressData.success ? progressData.stats : null;
  const checkin = checkinData && checkinData.success ? checkinData : null;
  const meetings = calendarData && calendarData.success ? calendarData.events : [];

  container.innerHTML = `
    ${renderCountdownBanner(event)}
    ${renderRoleBanner(member)}
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 24px; align-items: stretch;">
      ${renderCategoryProgressCard(stats, checkin)}
      ${renderNextMeetingCard(meetings)}
    </div>
    ${renderEventCard(event)}
    ${venue ? renderVenueCard(venue) : renderNoVenue()}
    ${isHead ? renderManageCategoryPanel() : ''}
  `;

  // Start countdown ticker after DOM is ready
  startEventCountdown(event.event_date);

  if (isHead) {
    await loadCategoryMembers(container);
    initAddMemberForm(container);
  }
}

// ── Role banner ───────────────────────────────────────────────────────────────
function renderRoleBanner(member) {
  const roleLabels = { head: 'Head', vice_head: 'Vice Head', member: 'Team Member' };
  const roleIcons  = { head: '🔑', vice_head: '🧩', member: '👤' };
  const icon = roleIcons[member.role] || '👤';
  const label = roleLabels[member.role] || member.role;
  return `
    <div class="ws-role-banner">
      <div class="ws-role-banner-icon">${icon}</div>
      <div>
        <h3>You are: ${label} of <em>${member.categoryName}</em></h3>
        <p>You have access to this event's details and venue information below.</p>
      </div>
    </div>`;
}

// ── Event card ────────────────────────────────────────────────────────────────
function renderEventCard(e) {
  const statusColor = {
    approved: 'var(--success)', pending: 'var(--warning)', rejected: 'var(--danger)',
    cancelled: 'var(--danger)'
  }[e.event_status] || 'var(--muted)';

  return `
  <div class="ws-card" id="wsEventCard">
    <div class="ws-card-header">
      <div class="ws-card-icon orange">📅</div>
      <div>
        <div class="ws-card-title">Event Details</div>
        <div class="ws-card-subtitle">Read-only — sourced live from the platform</div>
      </div>
    </div>

    <div class="ws-field-grid">
      <div class="ws-field ws-full">
        <span class="ws-field-label">Event Title</span>
        <span class="ws-field-value" style="font-size:1.18rem;font-weight:700;">${fmt(e.title)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Category</span>
        <span class="ws-field-value">${fmt(e.event_type)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Date &amp; Time</span>
        <span class="ws-field-value">${fmtDate(e.event_date)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Status</span>
        <span class="ws-field-value">
          <span style="color:${statusColor};font-weight:700;text-transform:capitalize;">
            ${fmt(e.event_status)}
          </span>
        </span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Total Capacity</span>
        <span class="ws-field-value">${fmt(e.max_seats)} seats</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Location</span>
        <span class="ws-field-value">${fmt(e.location)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Governorate</span>
        <span class="ws-field-value">${fmt(e.governorate)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Organizer</span>
        <span class="ws-field-value">${fmt(e.organizer_name)} <span style="color:var(--muted);font-size:.82rem;">(@${fmt(e.organizer_username)})</span></span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Host Name</span>
        <span class="ws-field-value">${fmt(e.host_name)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Host Email</span>
        <span class="ws-field-value">${fmt(e.host_email)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Host Phone</span>
        <span class="ws-field-value">${fmt(e.host_phone)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Host Organization</span>
        <span class="ws-field-value">${fmt(e.host_organization)}</span>
      </div>

      ${e.oc_name ? `
      <div class="ws-field">
        <span class="ws-field-label">Organizing Committee</span>
        <span class="ws-field-value">${fmt(e.oc_name)}</span>
      </div>` : ''}

      ${e.lead_speaker ? `
      <div class="ws-field">
        <span class="ws-field-label">Lead Speaker</span>
        <span class="ws-field-value">${fmt(e.lead_speaker)}</span>
      </div>
      <div class="ws-field">
        <span class="ws-field-label">Speaker Topic</span>
        <span class="ws-field-value">${fmt(e.speaker_topic)}</span>
      </div>` : ''}

      ${e.primary_sponsor ? `
      <div class="ws-field">
        <span class="ws-field-label">Primary Sponsor</span>
        <span class="ws-field-value">${fmt(e.primary_sponsor)}</span>
      </div>` : ''}

      ${e.registration_deadline ? `
      <div class="ws-field">
        <span class="ws-field-label">Registration Deadline</span>
        <span class="ws-field-value">${fmtDate(e.registration_deadline)}</span>
      </div>` : ''}

      ${e.age_restriction ? `
      <div class="ws-field">
        <span class="ws-field-label">Age Restriction</span>
        <span class="ws-field-value">${fmt(e.age_restriction)}</span>
      </div>` : ''}

      <div class="ws-field">
        <span class="ws-field-label">Standard Ticket Price</span>
        <span class="ws-field-value">${fmtPrice(e.price_standard)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Special Ticket Price</span>
        <span class="ws-field-value">${fmtPrice(e.price_special)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">VIP Ticket Price</span>
        <span class="ws-field-value">${fmtPrice(e.price_vip)}</span>
      </div>

      ${e.description ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Description</span>
        <span class="ws-field-value">${e.description}</span>
      </div>` : ''}

      ${e.logistics ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Logistics Notes</span>
        <span class="ws-field-value">${e.logistics}</span>
      </div>` : ''}

      ${e.event_agenda ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Event Agenda</span>
        <span class="ws-field-value" style="white-space:pre-wrap;">${e.event_agenda}</span>
      </div>` : ''}

      ${e.terms_conditions ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Terms &amp; Conditions</span>
        <span class="ws-field-value" style="white-space:pre-wrap;">${e.terms_conditions}</span>
      </div>` : ''}
    </div>
  </div>`;
}

// ── Venue card ────────────────────────────────────────────────────────────────
function renderVenueCard(v) {
  const images  = Array.isArray(v.images)   ? v.images   : [];
  const amenities = Array.isArray(v.amenities) ? v.amenities : [];

  const imagesHtml = images.slice(0, 6).map(img =>
    `<img class="ws-venue-img" src="${img}" alt="Venue image" loading="lazy" onerror="this.style.display='none'">`
  ).join('');

  const amenitiesHtml = amenities.length
    ? `<div class="ws-amenities">${amenities.map(a => `<span class="ws-amenity">${a}</span>`).join('')}</div>`
    : '';

  return `
  <div class="ws-card" id="wsVenueCard">
    <div class="ws-card-header">
      <div class="ws-card-icon teal">🏟️</div>
      <div>
        <div class="ws-card-title">Venue Details</div>
        <div class="ws-card-subtitle">Read-only — venue linked to this event</div>
      </div>
    </div>

    <div class="ws-field-grid">
      <div class="ws-field ws-full">
        <span class="ws-field-label">Venue Name</span>
        <span class="ws-field-value" style="font-size:1.08rem;font-weight:700;">${fmt(v.name)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Location</span>
        <span class="ws-field-value">${fmt(v.location)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Governorate</span>
        <span class="ws-field-value">${fmt(v.governorate)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Capacity</span>
        <span class="ws-field-value">${fmt(v.capacity)} guests</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Price per Day</span>
        <span class="ws-field-value">${fmtPrice(v.price_per_day)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Venue Phone</span>
        <span class="ws-field-value">${fmt(v.phone)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Venue Email</span>
        <span class="ws-field-value">${fmt(v.venue_email)}</span>
      </div>

      <div class="ws-field">
        <span class="ws-field-label">Booking Status</span>
        <span class="ws-field-value">${fmt(v.booking_status)}</span>
      </div>

      ${v.booking_date ? `
      <div class="ws-field">
        <span class="ws-field-label">Booked Date</span>
        <span class="ws-field-value">${fmtDate(v.booking_date)}</span>
      </div>` : ''}

      ${v.description ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Description</span>
        <span class="ws-field-value">${v.description}</span>
      </div>` : ''}

      ${amenitiesHtml ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Amenities</span>
        ${amenitiesHtml}
      </div>` : ''}

      ${imagesHtml ? `
      <div class="ws-field ws-full">
        <span class="ws-field-label">Photos</span>
        <div class="ws-venue-images">${imagesHtml}</div>
      </div>` : ''}
    </div>
  </div>`;
}

function renderNoVenue() {
  return `
  <div class="ws-notice">
    <span>🏟️</span>
    <span>No venue has been linked to this event yet.</span>
  </div>`;
}

// ── Head-only: Manage My Category Team ───────────────────────────────────────
function renderManageCategoryPanel() {
  return `
  <div class="ws-card" id="wsManageCategoryCard">
    <div class="ws-card-header">
      <div class="ws-card-icon violet">👥</div>
      <div>
        <div class="ws-card-title">Manage My Category Team</div>
        <div class="ws-card-subtitle">
          Your category: <strong>${workshopMember.categoryName}</strong> — visible only to you as Head
        </div>
      </div>
    </div>

    <div id="wsMembersContainer">
      <div class="ws-loading"><span class="ws-spinner"></span>Loading team…</div>
    </div>

    <div class="ws-add-form" id="wsAddMemberForm">
      <div class="ws-input-group">
        <label for="wsAddEmail">Member Email</label>
        <input id="wsAddEmail" type="email" class="ws-input" placeholder="team.member@example.com" autocomplete="off">
      </div>
      <div class="ws-input-group" style="max-width:180px;">
        <label for="wsAddRole">Role</label>
        <select id="wsAddRole" class="ws-input">
          <option value="member">Member</option>
          <option value="vice_head">Vice Head</option>
        </select>
      </div>
      <button id="wsAddMemberBtn" class="btn btn-violet" type="button" style="align-self:flex-end;">
        ＋ Add
      </button>
    </div>
    <div id="wsAddMemberMsg" class="ws-message"></div>
  </div>`;
}

async function loadCategoryMembers() {
  const container = document.getElementById('wsMembersContainer');
  if (!container) return;

  try {
    const res = await fetch(`${API}/my-category`, { headers: apiHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const members = data.members;
    if (!members.length) {
      container.innerHTML = `<div class="ws-notice"><span>👤</span><span>No team members in your category yet.</span></div>`;
      return;
    }

    const rows = members.map(m => `
      <tr>
        <td>${m.email}</td>
        <td>${rolePillHtml(m.role)}</td>
        <td style="color:var(--muted);font-size:.8rem;">${fmtDate(m.created_at)}</td>
      </tr>`).join('');

    container.innerHTML = `
      <table class="ws-members-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="ws-message error show">${err.message}</div>`;
  }
}

function initAddMemberForm() {
  const btn    = document.getElementById('wsAddMemberBtn');
  const msgEl  = document.getElementById('wsAddMemberMsg');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const email = document.getElementById('wsAddEmail').value.trim();
    const role  = document.getElementById('wsAddRole').value;

    msgEl.className = 'ws-message';
    if (!email) { showMsg(msgEl, 'error', 'Please enter an email address.'); return; }

    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
      const res = await fetch(`${API}/my-category/members`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.message);

      showMsg(msgEl, 'success', `${email} added as ${role.replace('_', ' ')}!`);
      document.getElementById('wsAddEmail').value = '';
      // Refresh the members list
      await loadCategoryMembers();
    } catch (err) {
      showMsg(msgEl, 'error', err.message || 'Failed to add member.');
    } finally {
      btn.disabled = false;
      btn.textContent = '＋ Add';
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadDashboard();
});

// ── Widget Renderers ─────────────────────────────────────────────────────────
function renderCategoryProgressCard(stats, checkin) {
  const percentage = stats ? stats.completionPercentage : 0;
  const todo = stats ? stats.todo : 0;
  const inProgress = stats ? stats.in_progress : 0;
  const done = stats ? stats.done : 0;
  const overdue = stats ? stats.overdueTasks : 0;
  const members = stats ? stats.memberCount : 0;

  const checkedIn = checkin ? checkin.checkedInCount : 0;
  const totalCheckin = checkin ? checkin.totalCount : 0;

  return `
    <div class="ws-card" id="wsProgressCard" style="flex: 1; display: flex; flex-direction: column;">
      <div class="ws-card-header">
        <div class="ws-card-icon success">📊</div>
        <div>
          <div class="ws-card-title">Category &amp; Event Progress</div>
          <div class="ws-card-subtitle">Live health status of category tasks and event check-in</div>
        </div>
      </div>

      <div class="ws-field-grid" style="margin-bottom: 20px;">
        <div class="ws-field ws-full">
          <span class="ws-field-label">Tasks Completion</span>
          <div class="progress-bar" style="background: rgba(255,255,255,0.07); height: 12px; border-radius: 6px; overflow: hidden; margin: 6px 0; border: 1px solid var(--panel-border);">
            <div class="progress-fill" style="background: var(--teal-grad); height: 100%; width: ${percentage}%; border-radius: 6px; transition: width 0.3s; box-shadow: 0 0 8px rgba(20, 184, 166, 0.3);"></div>
          </div>
          <span class="ws-field-value" style="font-weight: 700; font-size: 0.86rem; color: #5eead4;">${percentage}% Tasks Completed (${done} / ${stats ? stats.totalTasks : 0})</span>
        </div>
      </div>

      <div class="ws-field-grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-top: auto;">
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem;">To Do</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: var(--muted);">${todo}</span>
        </div>
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem;">In Progress</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: var(--warning);">${inProgress}</span>
        </div>
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem;">Done</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: var(--success);">${done}</span>
        </div>
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: ${overdue > 0 ? '1.5px solid var(--danger)' : '1px solid var(--panel-border)'}; text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem; ${overdue > 0 ? 'color: var(--danger); font-weight:700;' : ''}">Overdue</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: ${overdue > 0 ? 'var(--danger)' : 'var(--muted)'};">${overdue}</span>
        </div>
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem;">Team Members</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: var(--info);">${members}</span>
        </div>
        <div class="ws-field" style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); text-align: center;">
          <span class="ws-field-label" style="font-size: 0.65rem;">Checked In</span>
          <span class="ws-field-value" style="font-size: 1.15rem; font-weight: 700; color: #5eead4;">${checkedIn} / ${totalCheckin}</span>
        </div>
      </div>
    </div>
  `;
}

function renderNextMeetingCard(events) {
  if (!events || events.length === 0) {
    return `
      <div class="ws-card" id="wsMeetingWidgetCard" style="flex: 1; display: flex; flex-direction: column;">
        <div class="ws-card-header">
          <div class="ws-card-icon orange">⏰</div>
          <div>
            <div class="ws-card-title">Next Meeting</div>
            <div class="ws-card-subtitle">Upcoming team sync schedules</div>
          </div>
        </div>
        <div class="ws-notice" style="margin-top: auto; margin-bottom: auto;">
          <span>⏰</span>
          <span>No upcoming meetings scheduled.</span>
        </div>
      </div>
    `;
  }

  // Find nearest upcoming meeting
  const now = new Date();
  const upcoming = events
    .filter(e => new Date(e.event_date + 'T' + e.start_time) >= now)
    .sort((a, b) => new Date(a.event_date + 'T' + a.start_time) - new Date(b.event_date + 'T' + b.start_time));

  if (upcoming.length === 0) {
    return `
      <div class="ws-card" id="wsMeetingWidgetCard" style="flex: 1; display: flex; flex-direction: column;">
        <div class="ws-card-header">
          <div class="ws-card-icon orange">⏰</div>
          <div>
            <div class="ws-card-title">Next Meeting</div>
            <div class="ws-card-subtitle">Upcoming team sync schedules</div>
          </div>
        </div>
        <div class="ws-notice" style="margin-top: auto; margin-bottom: auto;">
          <span>⏰</span>
          <span>No upcoming meetings scheduled.</span>
        </div>
      </div>
    `;
  }

  const next = upcoming[0];
  const dateObj = new Date(next.event_date + 'T' + next.start_time);

  // Format nicely
  const timeStr = dateObj.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });
  const dateStr = dateObj.toLocaleDateString('en-EG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  let whenStr = `${dateStr} at ${timeStr}`;
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  if (dateObj.toDateString() === now.toDateString()) {
    whenStr = `Today at ${timeStr}`;
  } else if (dateObj.toDateString() === tomorrow.toDateString()) {
    whenStr = `Tomorrow at ${timeStr}`;
  }

  return `
    <div class="ws-card" id="wsMeetingWidgetCard" style="flex: 1; display: flex; flex-direction: column;">
      <div class="ws-card-header">
        <div class="ws-card-icon orange">⏰</div>
        <div>
          <div class="ws-card-title">Next Meeting</div>
          <div class="ws-card-subtitle">Upcoming team sync schedules</div>
        </div>
      </div>

      <div class="ws-field-grid" style="margin-top: auto; margin-bottom: auto;">
        <div class="ws-field ws-full">
          <span class="ws-field-label" style="color: var(--warning); font-weight:700;">NEXT: ${escapeHtml(next.title)}</span>
          <span class="ws-field-value" style="font-size:1.1rem;font-weight:700;margin-top:4px;">${whenStr}</span>
        </div>
        ${next.location ? `
        <div class="ws-field ws-full" style="margin-top: 6px;">
          <span class="ws-field-label">Location</span>
          <span class="ws-field-value">📍 ${escapeHtml(next.location)}</span>
        </div>` : ''}
        ${next.description ? `
        <div class="ws-field ws-full" style="margin-top: 6px;">
          <span class="ws-field-label">Agenda / Description</span>
          <span class="ws-field-value" style="font-size:0.82rem;color:var(--muted);">${escapeHtml(next.description)}</span>
        </div>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Event Countdown Banner ─────────────────────────────────────────────────────
function renderCountdownBanner(event) {
  if (!event || !event.event_date) return '';

  const eventDate = new Date(event.event_date);
  const now = new Date();
  const isPast = eventDate < now;

  const titleLabel = isPast ? '🎉 Event Has Concluded' : '⏳ Event Countdown';

  return `
    <div class="ws-countdown-banner" id="wsCountdownBanner">
      <div class="ws-countdown-header">
        <span class="ws-countdown-title">${titleLabel}</span>
        <span class="ws-countdown-event-name">${escapeHtml(event.title)}</span>
        <span class="ws-countdown-date">${new Date(event.event_date).toLocaleString('en-EG', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })}</span>
      </div>
      <div class="ws-countdown-segments" id="wsCountdownSegments">
        <div class="ws-countdown-unit">
          <span class="ws-countdown-num" id="cdDays">--</span>
          <span class="ws-countdown-lbl">Days</span>
        </div>
        <div class="ws-countdown-sep">:</div>
        <div class="ws-countdown-unit">
          <span class="ws-countdown-num" id="cdHours">--</span>
          <span class="ws-countdown-lbl">Hours</span>
        </div>
        <div class="ws-countdown-sep">:</div>
        <div class="ws-countdown-unit">
          <span class="ws-countdown-num" id="cdMinutes">--</span>
          <span class="ws-countdown-lbl">Minutes</span>
        </div>
        <div class="ws-countdown-sep">:</div>
        <div class="ws-countdown-unit">
          <span class="ws-countdown-num" id="cdSeconds">--</span>
          <span class="ws-countdown-lbl">Seconds</span>
        </div>
      </div>
    </div>
  `;
}

let _countdownInterval = null;

function startEventCountdown(eventDateStr) {
  if (!eventDateStr) return;

  // Clear any previous ticker
  if (_countdownInterval) clearInterval(_countdownInterval);

  const target = new Date(eventDateStr).getTime();

  const dEl = document.getElementById('cdDays');
  const hEl = document.getElementById('cdHours');
  const mEl = document.getElementById('cdMinutes');
  const sEl = document.getElementById('cdSeconds');
  const banner = document.getElementById('wsCountdownBanner');
  const titleEl = banner ? banner.querySelector('.ws-countdown-title') : null;

  function tick() {
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      // Event in progress or concluded
      if (dEl) dEl.textContent = '00';
      if (hEl) hEl.textContent = '00';
      if (mEl) mEl.textContent = '00';
      if (sEl) sEl.textContent = '00';
      if (titleEl) titleEl.textContent = '🎉 Event Has Concluded';
      if (banner) banner.classList.add('concluded');
      clearInterval(_countdownInterval);
      return;
    }

    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = n => String(n).padStart(2, '0');
    if (dEl) dEl.textContent = pad(days);
    if (hEl) hEl.textContent = pad(hours);
    if (mEl) mEl.textContent = pad(minutes);
    if (sEl) sEl.textContent = pad(seconds);

    // Urgency class
    if (banner) {
      banner.classList.toggle('urgent', diff < 24 * 60 * 60 * 1000); // < 1 day
      banner.classList.toggle('very-urgent', diff < 60 * 60 * 1000); // < 1 hour
    }
  }

  tick(); // Run immediately
  _countdownInterval = setInterval(tick, 1000);
}

