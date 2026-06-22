function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSubmittedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveTicketStatus(ticket) {
  const status = String(ticket.status || '').trim().toLowerCase();
  const hasReply = Boolean(String(ticket.admin_reply || '').trim());

  if (status === 'closed') {
    return { label: 'Closed', className: 'status-closed' };
  }

  if (hasReply) {
    return { label: 'Replied', className: 'status-replied' };
  }

  return { label: 'Pending', className: 'status-pending' };
}

export function createSupportView(doc = document) {
  const refs = {
    form: doc.getElementById('supportForm'),
    submitBtn: doc.getElementById('submitSupportBtn'),
    messageBox: doc.getElementById('messageBox'),
    identityLine: doc.getElementById('identityLine'),
    subjectInput: doc.getElementById('subject'),
    messageInput: doc.getElementById('message'),
    categoryInput: doc.getElementById('category'),
    messageCounter: doc.getElementById('messageCounter'),
    ticketsList: doc.getElementById('ticketsList')
  };

  const submitLabel = refs.submitBtn?.querySelector('.btn-label') || null;
  const maxMessageLength = Number(refs.messageInput?.maxLength || 500);

  return {
    isReady() {
      return Boolean(
        refs.form &&
        refs.submitBtn &&
        submitLabel &&
        refs.messageBox &&
        refs.identityLine &&
        refs.subjectInput &&
        refs.messageInput &&
        refs.categoryInput &&
        refs.messageCounter &&
        refs.ticketsList
      );
    },

    getMaxMessageLength() {
      return maxMessageLength;
    },

    bindSubmit(handler) {
      refs.form?.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },

    bindMessageInput(handler) {
      refs.messageInput?.addEventListener('input', handler);
    },

    getFormPayload() {
      return {
        category: refs.categoryInput.value.trim(),
        subject: refs.subjectInput.value.trim(),
        message: refs.messageInput.value.trim()
      };
    },

    resetForm() {
      refs.form.reset();
      refs.categoryInput.value = 'General Inquiry';
    },

    updateCounter() {
      const currentLength = String(refs.messageInput.value || '').length;
      refs.messageCounter.textContent = `${currentLength} / ${maxMessageLength} characters`;
    },

    renderIdentity(displayName) {
      refs.identityLine.innerHTML = `<span class="identity-icon">&#128100;</span><span>Submitting as: <strong>${escapeHtml(displayName)}</strong></span>`;
    },

    setMessage(text, type) {
      refs.messageBox.textContent = text || '';
      refs.messageBox.classList.remove('show', 'success', 'error');
      if (type) {
        refs.messageBox.classList.add('show', type);
      }
    },

    setSubmitting(isSubmitting) {
      refs.submitBtn.disabled = isSubmitting;
      refs.submitBtn.classList.toggle('is-loading', isSubmitting);
      submitLabel.textContent = isSubmitting ? 'Sending...' : 'Send To Administrator';
    },

    renderTicketsLoading() {
      refs.ticketsList.innerHTML = '<div class="tickets-loading">Loading your tickets...</div>';
    },

    renderTicketsError() {
      refs.ticketsList.innerHTML = `
        <div class="tickets-empty error">
          <h3>Unable to load tickets right now</h3>
          <p>Please refresh the page and try again.</p>
        </div>
      `;
    },

    renderTickets(tickets) {
      if (!Array.isArray(tickets) || tickets.length === 0) {
        refs.ticketsList.innerHTML = `
          <div class="tickets-empty">
            <div class="empty-icon">&#128172;</div>
            <h3>No support tickets yet</h3>
            <p>When you submit a request, it will appear here with its latest status.</p>
          </div>
        `;
        return;
      }

      refs.ticketsList.innerHTML = tickets.map((ticket) => {
        const status = resolveTicketStatus(ticket);
        const subject = escapeHtml(ticket.subject || 'Untitled request');
        const category = escapeHtml(ticket.category || 'General Inquiry');
        const submittedDate = formatSubmittedDate(ticket.created_at);

        return `
          <article class="ticket-item">
            <div class="ticket-top">
              <h3>${subject}</h3>
              <span class="status-badge ${status.className}">${status.label}</span>
            </div>
            <p class="ticket-meta">
              <span>Category: ${category}</span>
              <span>Date Submitted: ${submittedDate}</span>
            </p>
          </article>
        `;
      }).join('');
    }
  };
}
