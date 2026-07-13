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
  document.getElementById('wsNavEmail').textContent = workshopMember.email || '';
  const roleMap = { head: '🔑 Head', vice_head: '🧩 Vice Head', member: '👤 Member' };
  document.getElementById('wsNavRole').textContent =
    `${roleMap[workshopMember.role] || workshopMember.role} · ${workshopMember.categoryName}`;
  document.getElementById('wsLogoutBtn').addEventListener('click', workshopLogout);
}

// ── Load dashboard data ───────────────────────────────────────────────────────
async function loadDashboard() {
  const container = document.getElementById('wsDashboardMain');
  container.innerHTML = `<div class="ws-loading"><span class="ws-spinner"></span>Loading workshop data…</div>`;

  let data;
  try {
    const res = await fetch(`${API}/dashboard`, { headers: apiHeaders() });
    data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load dashboard');
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

  container.innerHTML = `
    ${renderRoleBanner(member)}
    ${renderEventCard(event)}
    ${venue ? renderVenueCard(venue) : renderNoVenue()}
    ${isHead ? renderManageCategoryPanel() : ''}
  `;

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
