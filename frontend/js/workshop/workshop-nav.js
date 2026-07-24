/**
 * workshop-nav.js
 * Shared navigation builder and notification polling for the Workshop Portal.
 */

(function () {
  const wsToken = localStorage.getItem('workshopToken');
  const wsMember = (() => {
    try { return JSON.parse(localStorage.getItem('workshopMember') || 'null'); }
    catch (_) { return null; }
  })();

  // Auth Guard
  if (!wsToken || !wsMember) {
    window.location.replace('/html/signin.html?wserror=1');
    return;
  }

  // Inject Nav stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../../css/workshop/workshop-nav.css';
  document.head.appendChild(link);

  function renderSharedNav() {
    const navContainer = document.querySelector('.ws-nav') || document.getElementById('wsSharedNav');
    if (!navContainer) return;

    const path = window.location.pathname;

    navContainer.innerHTML = `
      <div class="ws-brand">
        <div class="ws-brand-mark">WS</div>
        <div class="ws-brand-text">
          <strong>Workshop Portal</strong>
          <span>Elshaboury Events — Team Space</span>
        </div>
      </div>

      <div class="ws-nav-links">
        <a href="/html/workshop/workshop-dashboard.html" class="ws-nav-link" id="navDash">Dashboard</a>
        <a href="/html/workshop/workshop-tasks.html" class="ws-nav-link" id="navTasks">Tasks</a>
        <a href="/html/workshop/workshop-chat.html" class="ws-nav-link" id="navChat">Team Chat <span id="wsChatUnreadDot" class="unread-dot" style="display:none;"></span></a>
        <a href="/html/workshop/workshop-calendar.html" class="ws-nav-link" id="navCalendar">Calendar</a>
        <a href="/html/workshop/workshop-files.html" class="ws-nav-link" id="navFiles">Files</a>
        <a href="/html/workshop/workshop-activity.html" class="ws-nav-link" id="navActivity">Activity</a>
        <a href="/html/workshop/workshop-checkin.html" class="ws-nav-link" id="navCheckin">Check-In</a>
      </div>

      <div class="ws-nav-right">
        <!-- Notification Bell -->
        <div class="ws-bell-container" id="wsBellContainer">
          <button id="wsBellBtn" class="ws-bell-btn" type="button" aria-label="Notifications">
            🔔<span id="wsBellCount" class="ws-bell-badge" style="display:none;">0</span>
          </button>
          <div id="wsBellDropdown" class="ws-bell-dropdown" style="display:none;">
            <div class="ws-bell-dropdown-header">
              <h4>Notifications</h4>
              <button id="wsMarkAllReadBtn" class="ws-bell-action-btn" type="button">Mark all read</button>
            </div>
            <div id="wsBellList" class="ws-bell-list">
              <div class="ws-bell-item-empty">No notifications</div>
            </div>
          </div>
        </div>

        <span id="wsNavRole" class="ws-role-badge">Loading…</span>
        <span id="wsNavEmail" style="color:var(--muted);font-size:.82rem;"></span>
        <button id="wsLogoutBtn" class="btn btn-danger btn-sm" type="button" aria-label="Leave workshop">
          ⎋ Leave
        </button>
      </div>
    `;

    // Highlight active link
    if (path.includes('workshop-dashboard.html')) document.getElementById('navDash')?.classList.add('active');
    else if (path.includes('workshop-tasks.html')) document.getElementById('navTasks')?.classList.add('active');
    else if (path.includes('workshop-chat.html')) document.getElementById('navChat')?.classList.add('active');
    else if (path.includes('workshop-calendar.html')) document.getElementById('navCalendar')?.classList.add('active');
    else if (path.includes('workshop-files.html')) document.getElementById('navFiles')?.classList.add('active');
    else if (path.includes('workshop-activity.html')) document.getElementById('navActivity')?.classList.add('active');
    else if (path.includes('workshop-checkin.html')) document.getElementById('navCheckin')?.classList.add('active');

    // Fill profile info
    document.getElementById('wsNavEmail').textContent = wsMember.email || '';
    const roleLabels = { head: '🔑 Head', vice_head: '🧩 Vice Head', member: '👤 Member' };
    document.getElementById('wsNavRole').textContent =
      `${roleLabels[wsMember.role] || wsMember.role} · ${wsMember.categoryName}`;

    // Event Listeners
    document.getElementById('wsLogoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('workshopToken');
      localStorage.removeItem('workshopMember');
      window.location.replace('/html/signin.html');
    });

    setupNotificationsDropdown();
    pollUpdates();
    // Immediate first fetch
    fetchNotifications();
    checkChatUnread();
  }

  function setupNotificationsDropdown() {
    const bellBtn = document.getElementById('wsBellBtn');
    const dropdown = document.getElementById('wsBellDropdown');
    const markAllReadBtn = document.getElementById('wsMarkAllReadBtn');

    if (!bellBtn || !dropdown) return;

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'flex';
      dropdown.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        fetchNotifications();
      }
    });

    document.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    markAllReadBtn?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/workshop/notifications/read-all', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${wsToken}`
          }
        });
        const data = await res.json();
        if (data.success) {
          fetchNotifications();
        }
      } catch (err) {
        console.error('Failed to mark all read:', err);
      }
    });
  }

  async function fetchNotifications() {
    const bellCount = document.getElementById('wsBellCount');
    const bellList = document.getElementById('wsBellList');
    if (!bellList) return;

    try {
      const res = await fetch('/api/workshop/notifications', {
        headers: { 'Authorization': `Bearer ${wsToken}` }
      });
      const data = await res.json();

      if (!data.success) return;

      const notifications = data.notifications || [];
      const unreadCount = notifications.filter(n => !n.is_read).length;

      // Update badge
      if (unreadCount > 0) {
        bellCount.textContent = unreadCount;
        bellCount.style.display = 'flex';
      } else {
        bellCount.style.display = 'none';
      }

      // Render list
      if (notifications.length === 0) {
        bellList.innerHTML = `<div class="ws-bell-item-empty">No notifications</div>`;
        return;
      }

      bellList.innerHTML = notifications.map(n => {
        const itemClass = n.is_read ? 'ws-bell-item' : 'ws-bell-item unread';
        const linkTag = n.link ? `href="${n.link}"` : 'href="#" onclick="return false;"';
        return `
          <a ${linkTag} class="${itemClass}" data-id="${n.id}">
            <div>${n.message}</div>
            <span class="ws-bell-time">${timeAgo(n.created_at)}</span>
          </a>
        `;
      }).join('');

      // Add click listener to mark read
      bellList.querySelectorAll('.ws-bell-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          const id = item.getAttribute('data-id');
          if (item.classList.contains('unread')) {
            try {
              await fetch(`/api/workshop/notifications/${id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${wsToken}` }
              });
              // Refresh
              fetchNotifications();
            } catch (err) {
              console.error('Failed to mark read:', err);
            }
          }
        });
      });

    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }

  async function checkChatUnread() {
    const chatDot = document.getElementById('wsChatUnreadDot');
    if (!chatDot) return;

    // If on chat page, clear unread status instantly
    const isChatPage = window.location.pathname.includes('workshop-chat.html');
    if (isChatPage) {
      localStorage.setItem('wsLastSeenChat', Date.now());
      chatDot.style.display = 'none';
      return;
    }

    try {
      const res = await fetch('/api/workshop/chat?limit=1', {
        headers: { 'Authorization': `Bearer ${wsToken}` }
      });
      const data = await res.json();
      if (!data.success) return;

      const messages = data.messages || [];
      if (messages.length === 0) {
        chatDot.style.display = 'none';
        return;
      }

      const latestMsg = messages[messages.length - 1];
      const latestTime = new Date(latestMsg.created_at).getTime();
      const lastSeen = parseInt(localStorage.getItem('wsLastSeenChat') || '0', 10);

      if (latestTime > lastSeen) {
        chatDot.style.display = 'inline-block';
      } else {
        chatDot.style.display = 'none';
      }
    } catch (err) {
      console.error('Failed to check chat status:', err);
    }
  }

  function pollUpdates() {
    // Poll notifications & chat status every 6 seconds
    setInterval(() => {
      fetchNotifications();
      checkChatUnread();
    }, 6000);
  }

  function timeAgo(dateString) {
    try {
      const now = new Date();
      const past = new Date(dateString);
      const ms = now - past;
      if (isNaN(ms)) return 'some time ago';
      const secs = Math.floor(ms / 1000);
      if (secs < 60) return 'just now';
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch (_) {
      return 'some time ago';
    }
  }

  // Run Nav builder on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSharedNav);
  } else {
    renderSharedNav();
  }

  // Expose helper headers if other files need it
  window.wsHeaders = function () {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('workshopToken')}`
    };
  };

  window.wsMemberInfo = wsMember;

})();
