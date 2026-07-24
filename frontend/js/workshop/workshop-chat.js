/**
 * workshop-chat.js
 * Frontend logic for the category Team Chat.
 */

(function () {
  const API_CHAT = '/api/workshop/chat';

  let lastMessageId = 0;
  let currentMemberId = window.wsMemberInfo ? window.wsMemberInfo.id : null;
  let activePolling = null;

  const chatMessagesPane = document.getElementById('chatMessagesPane');
  const chatInputForm = document.getElementById('chatInputForm');
  const chatMessageInput = document.getElementById('chatMessageInput');
  const chatCategoryName = document.getElementById('chatCategoryName');

  async function init() {
    if (window.wsMemberInfo) {
      chatCategoryName.textContent = window.wsMemberInfo.categoryName || 'My Team';
    }

    // Set last seen chat to now
    localStorage.setItem('wsLastSeenChat', Date.now());

    await loadInitialMessages();
    setupForm();
    startPolling();
  }

  async function loadInitialMessages() {
    try {
      const res = await fetch(API_CHAT, { headers: window.wsHeaders() });
      const data = await res.json();

      if (!data.success) throw new Error(data.message);

      chatMessagesPane.innerHTML = '';
      const messages = data.messages || [];

      if (messages.length === 0) {
        chatMessagesPane.innerHTML = `<div class="ws-notice"><span>💬</span><span>No messages in this chat room yet. Send the first one!</span></div>`;
        return;
      }

      messages.forEach(msg => {
        appendMessage(msg);
      });

      scrollToBottom();
    } catch (err) {
      chatMessagesPane.innerHTML = `<div class="ws-message error show">Failed to load chat history: ${err.message}</div>`;
    }
  }

  function appendMessage(msg) {
    // Skip duplicates
    if (document.getElementById(`chat-msg-${msg.id}`)) return;

    if (msg.id > lastMessageId) {
      lastMessageId = msg.id;
    }

    const isOwn = msg.sender_id === currentMemberId;
    const initials = msg.sender_email ? msg.sender_email.substring(0, 2).toUpperCase() : '?';

    const row = document.createElement('div');
    row.id = `chat-msg-${msg.id}`;
    row.className = `chat-message-row ${isOwn ? 'msg-right' : 'msg-left'}`;

    const date = new Date(msg.created_at);
    const formattedTime = date.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });

    // Optional delete action for own messages created within 5 minutes
    let deleteHtml = '';
    if (isOwn) {
      const minsDiff = (Date.now() - date.getTime()) / 1000 / 60;
      if (minsDiff < 5) {
        deleteHtml = `
          <div class="chat-message-actions">
            <button class="chat-delete-btn" onclick="deleteMessage(${msg.id})">Delete</button>
          </div>
        `;
      }
    }

    const roleMap = { head: 'Head', vice_head: 'Vice Head', member: 'Member' };
    const roleLabel = roleMap[msg.sender_role] || msg.sender_role;

    row.innerHTML = `
      <div class="chat-message-header">
        <span class="chat-sender-name">${escapeHtml(msg.sender_email)}</span>
        <span class="chat-role-badge ${msg.sender_role}">${roleLabel}</span>
      </div>
      <div class="chat-message-bubble">
        ${escapeHtml(msg.message)}
        ${deleteHtml}
      </div>
      <span class="chat-message-time">${formattedTime}</span>
    `;

    chatMessagesPane.appendChild(row);
  }

  async function checkNewMessages() {
    // Keep clearing last seen since we are on the page actively viewing it
    localStorage.setItem('wsLastSeenChat', Date.now());

    try {
      const res = await fetch(`${API_CHAT}?since=${lastMessageId}`, {
        headers: window.wsHeaders()
      });
      const data = await res.json();
      if (!data.success) return;

      const messages = data.messages || [];
      if (messages.length > 0) {
        // If there was previously a "no messages" notice, clear it
        const emptyNotice = chatMessagesPane.querySelector('.ws-notice');
        if (emptyNotice) emptyNotice.remove();

        messages.forEach(msg => {
          appendMessage(msg);
        });
        scrollToBottom();
      }
    } catch (err) {
      console.error('Failed to poll new messages:', err);
    }
  }

  function startPolling() {
    activePolling = setInterval(checkNewMessages, 5000);
  }

  function scrollToBottom() {
    chatMessagesPane.scrollTop = chatMessagesPane.scrollHeight;
  }

  function setupForm() {
    chatInputForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const text = chatMessageInput.value.trim();
      if (!text) return;

      chatMessageInput.value = '';
      chatMessageInput.focus();

      try {
        const res = await fetch(API_CHAT, {
          method: 'POST',
          headers: window.wsHeaders(),
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        // Immediate fetch rather than waiting for next poll cycle
        await checkNewMessages();
      } catch (err) {
        alert('Failed to send message: ' + err.message);
      }
    });
  }

  window.deleteMessage = async function (id) {
    if (!confirm('Delete this message?')) return;
    try {
      const res = await fetch(`${API_CHAT}/${id}`, {
        method: 'DELETE',
        headers: window.wsHeaders()
      });
      const data = await res.json();
      if (data.success) {
        const element = document.getElementById(`chat-msg-${id}`);
        if (element) {
          element.remove();
        }
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Failed to delete message: ' + err.message);
    }
  };

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
