/**
 * workshop-activity.js
 * Frontend logic for the category Activity log timeline.
 */

(function () {
  const API_ACTIVITY = '/api/workshop/activity';
  const LIMIT = 20;
  
  let currentOffset = 0;
  let lastRenderedDateStr = null;

  // DOM Elements
  const timelineContainer = document.getElementById('timelineContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  const actionIcons = {
    task_created: '📝',
    task_status_changed: '🔄',
    task_updated: '✏️',
    task_deleted: '🗑️',
    member_added: '👥',
    file_uploaded: '📁',
    file_deleted: '🗑️',
    meeting_created: '📅',
    meeting_updated: '✏️',
    meeting_deleted: '🗑️',
    checkin_scanned: '🎫'
  };

  async function init() {
    timelineContainer.innerHTML = '';
    await fetchActivities();
    setupEventListeners();
  }

  async function fetchActivities() {
    try {
      const res = await fetch(`${API_ACTIVITY}?limit=${LIMIT}&offset=${currentOffset}`, {
        headers: window.wsHeaders()
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const activities = data.activities || [];
      renderTimeline(activities);

      if (activities.length < LIMIT) {
        loadMoreBtn.style.display = 'none';
      } else {
        loadMoreBtn.style.display = 'block';
      }
    } catch (err) {
      console.error('Failed to load activities:', err);
      if (currentOffset === 0) {
        timelineContainer.innerHTML = `<div class="ws-message error show">Failed to load activity log: ${err.message}</div>`;
      } else {
        alert('Failed to load more activities: ' + err.message);
      }
    }
  }

  function getDayHeaderLabel(dateObj) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(dateObj, today)) return 'Today';
    if (isSameDay(dateObj, yesterday)) return 'Yesterday';

    return dateObj.toLocaleDateString('en-EG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function renderTimeline(activities) {
    if (currentOffset === 0 && activities.length === 0) {
      timelineContainer.innerHTML = `<div class="ws-notice"><span>⚡</span><span>No activity logged in your category yet.</span></div>`;
      return;
    }

    activities.forEach(act => {
      const date = new Date(act.created_at);
      
      // Check day header grouping
      const dayLabel = getDayHeaderLabel(date);
      if (dayLabel !== lastRenderedDateStr) {
        const header = document.createElement('span');
        header.className = 'timeline-day-header';
        header.textContent = dayLabel;
        timelineContainer.appendChild(header);
        lastRenderedDateStr = dayLabel;
      }

      // Format description with highlighted email/actor
      let descHtml = escapeHtml(act.description);
      // Highlight email prefixes or main details if needed (e.g. bolding text before specific keywords)
      if (act.actor_email) {
        const emailEscaped = escapeHtml(act.actor_email);
        descHtml = descHtml.replace(emailEscaped, `<em>${emailEscaped}</em>`);
      }

      const item = document.createElement('div');
      item.className = 'timeline-item';
      
      const icon = actionIcons[act.action_type] || '🔔';
      const formattedTime = date.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });

      item.innerHTML = `
        <div class="timeline-badge ${act.action_type}" title="${act.action_type}">
          ${icon}
        </div>
        <div class="timeline-desc">${descHtml}</div>
        <span class="timeline-time">🕒 ${formattedTime}</span>
      `;

      timelineContainer.appendChild(item);
    });
  }

  function setupEventListeners() {
    loadMoreBtn.addEventListener('click', async () => {
      currentOffset += LIMIT;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading…';
      await fetchActivities();
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load More Activities';
    });
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

  init();

})();
