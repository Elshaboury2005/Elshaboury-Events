function parseStoredUser(storage) {
  try {
    return JSON.parse(storage.getItem('user') || '{}');
  } catch (_) {
    return {};
  }
}

async function parseApiResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.message || fallbackMessage);
  }
  return data;
}

export function createSupportModel(win = window) {
  const apiBaseUrl = win.AuthConfig?.apiBaseUrl || '/api';

  return {
    getSession() {
      const token = win.localStorage.getItem('token');
      const user = parseStoredUser(win.localStorage);
      return {
        token,
        displayName: user.fullName || user.username || 'Signed-in user'
      };
    },

    async fetchMyTickets(token) {
      const response = await win.fetch(`${apiBaseUrl}/support/tickets/mine`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseApiResponse(response, 'Failed to load your support tickets');
      return Array.isArray(data.tickets) ? data.tickets : [];
    },

    async createTicket(token, payload) {
      const response = await win.fetch(`${apiBaseUrl}/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      return parseApiResponse(response, 'Failed to submit support request');
    }
  };
}
