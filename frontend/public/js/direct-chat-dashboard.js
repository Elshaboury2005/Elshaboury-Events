/**
 * direct-chat-dashboard.js
 * Handles the Direct Messages tab in venue-owner-dashboard.html
 * Reads globals (API_BASE_URL, token, currentUser) set by the inline script.
 */

let directChatSocket = null;
let currentDirectChatId = null;
let currentVenueBookingId = null;

// Helpers that read globals safely
function _apiBase() { return window.API_BASE_URL || window.AuthConfig?.apiBaseUrl || '/api'; }
function _token()   { return window.token || localStorage.getItem('token'); }
function _user()    { return window.currentUser || JSON.parse(localStorage.getItem('user') || 'null'); }

function formatChatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString();
}

async function loadDirectChats() {
  const container = document.getElementById('messagesListContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading messages...</div>';

  try {
    const res = await fetch(`${_apiBase()}/direct-chat/my-chats`, {
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const chats = data.chats || [];
    let totalUnread = 0;

    if (chats.length === 0) {
      container.innerHTML = '<div class="venue-card" style="padding: 20px; text-align: center; grid-column: 1/-1;">No direct messages yet. They will appear here when a venue booking is confirmed.</div>';
    } else {
      container.innerHTML = '';
      chats.forEach(chat => {
        totalUnread += Number(chat.unread_count || 0);
        const isVenueOwner = chat.user_role === 'venue_owner';
        const cardTitle = isVenueOwner ? (chat.event_title || 'Event') : (chat.venue_name || 'Venue');
        const partyLabel = isVenueOwner ? `Host: ${chat.other_party_name || 'Host'}` : `Venue Owner: ${chat.other_party_name || 'Venue Owner'}`;
        const roomLabel = isVenueOwner ? (chat.venue_name || '') : (chat.event_title || 'Event');
        const card = document.createElement('div');
        card.className = 'venue-card';
        card.style.cssText = 'padding: 15px; cursor: pointer; transition: border-color 0.2s;';
        card.onclick = () => openDirectChat(chat.venue_booking_id, chat.other_party_name, chat.event_title, chat.venue_name, chat.user_role);

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <h4 style="margin: 0;">${escapeHTML(cardTitle)} ${isVenueOwner ? '<span style="font-size:0.72rem;background:rgba(14,165,233,0.15);color:#38bdf8;border-radius:999px;padding:2px 8px;margin-left:6px;">Host</span>' : ''}</h4>
            <small style="color: var(--muted-color)">${formatChatDate(chat.last_message_time)}</small>
          </div>
          <div style="font-size: 0.85rem; color: var(--info); margin-bottom: 5px;">${escapeHTML(roomLabel)}</div>
          <div style="font-size: 0.78rem; color: var(--muted-color); margin-bottom: 5px;">${escapeHTML(partyLabel)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="color: var(--muted-color); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">
              ${escapeHTML(chat.last_message || 'No messages')}
            </div>
            ${chat.unread_count > 0 ? `<span style="background: var(--danger); color: white; border-radius: 99px; padding: 2px 8px; font-size: 0.75rem; font-weight: 700;">${chat.unread_count}</span>` : ''}
          </div>
        `;
        container.appendChild(card);
      });
    }

    const badge = document.getElementById('messagesCountBadge');
    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
    const floatBadge = document.getElementById('voFloatChatBadge');
    if (floatBadge) {
      if (totalUnread > 0) {
        floatBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        floatBadge.style.display = 'inline-flex';
      } else {
        floatBadge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading direct chats:', err);
    if (container) container.innerHTML = `<div style="color: var(--danger); padding: 20px;">Failed to load messages: ${escapeHTML(err.message)}</div>`;
  }
}

async function openDirectChat(venueBookingId, otherPartyName, eventTitle, venueName = '', userRole = '') {
  currentVenueBookingId = venueBookingId;

  const titleEl = document.getElementById('directChatTitle');
  const modal = document.getElementById('directChatModal');
  const messagesContainer = document.getElementById('directChatMessages');

  if (!modal || !messagesContainer) return;

  if (titleEl) {
    titleEl.textContent = userRole === 'venue_owner'
      ? `${venueName || 'Venue'} — ${eventTitle || 'Event'} Host`
      : `${venueName || 'Venue'} — Chat with Venue Owner`;
  }
  modal.style.display = 'flex';
  messagesContainer.innerHTML = '<div style="text-align: center; color: var(--muted-color); margin: auto;">Loading...</div>';

  try {
    const res = await fetch(`${_apiBase()}/direct-chat/${venueBookingId}/messages`, {
      headers: { 'Authorization': `Bearer ${_token()}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    messagesContainer.innerHTML = '';
    data.messages.forEach(msg => appendDirectMessage(msg));
    scrollToBottom();

    // Mark as read
    fetch(`${_apiBase()}/direct-chat/${venueBookingId}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_token()}` }
    });

    if (!directChatSocket) initDirectChatSocket();
    directChatSocket.emit('join-direct-chat', { venueBookingId, token: _token() });

  } catch (err) {
    if (messagesContainer) messagesContainer.innerHTML = `<div style="color: var(--danger); margin: auto;">Failed to load chat: ${escapeHTML(err.message)}</div>`;
  }
}

function closeDirectChat() {
  const modal = document.getElementById('directChatModal');
  if (modal) modal.style.display = 'none';
  currentVenueBookingId = null;
  loadDirectChats();
}

function appendDirectMessage(msg) {
  const container = document.getElementById('directChatMessages');
  if (!container) return;

  const user = _user();
  const isMine = msg.sender_id === (user?.id || user?.userId);

  const div = document.createElement('div');
  div.style.cssText = `max-width:80%; padding:10px 15px; border-radius:12px; margin-bottom:4px; word-break:break-word;`;

  if (isMine) {
    div.style.alignSelf = 'flex-end';
    div.style.background = 'var(--primary)';
    div.style.color = 'white';
    div.style.borderBottomRightRadius = '2px';
  } else {
    div.style.alignSelf = 'flex-start';
    div.style.background = 'rgba(255,255,255,0.08)';
    div.style.color = 'var(--text-color)';
    div.style.borderBottomLeftRadius = '2px';
  }

  div.innerHTML = `
    <div style="font-size:0.72rem;opacity:0.75;margin-bottom:3px;">
      ${isMine ? 'You' : escapeHTML(msg.full_name || msg.username || 'Unknown')}
    </div>
    <div style="line-height:1.4;">${escapeHTML(msg.message)}</div>
    <div style="font-size:0.62rem;opacity:0.55;text-align:right;margin-top:4px;">
      ${formatChatDate(msg.created_at)}
    </div>
  `;
  container.appendChild(div);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str == null ? '' : str);
  return div.innerHTML;
}

function scrollToBottom() {
  const container = document.getElementById('directChatMessages');
  if (container) container.scrollTop = container.scrollHeight;
}

async function sendDirectMessage() {
  const input = document.getElementById('directChatInput');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg || !currentVenueBookingId) return;

  if (!directChatSocket) initDirectChatSocket();

  input.value = '';
  directChatSocket.emit('send-direct-chat-message', {
    venueBookingId: currentVenueBookingId,
    token: _token(),
    message: msg
  });
}

function initDirectChatSocket() {
  if (directChatSocket) return;
  directChatSocket = window.io(window.location.origin, { withCredentials: true });

  directChatSocket.on('connect', () => {
    if (currentVenueBookingId) {
      directChatSocket.emit('join-direct-chat', { venueBookingId: currentVenueBookingId, token: _token() });
    }
  });

  directChatSocket.on('new-direct-chat-message', (data) => {
    if (String(data.venueBookingId) === String(currentVenueBookingId)) {
      appendDirectMessage(data);
      scrollToBottom();
      directChatSocket.emit('mark-direct-as-read', { venueBookingId: currentVenueBookingId, token: _token() });
    } else {
      loadDirectChats(); // update badge for other chats
    }
  });

  directChatSocket.on('direct-chat-error', (d) => console.warn('Direct chat error:', d));
}
