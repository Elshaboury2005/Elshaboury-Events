import { bindHeaderMenu } from '../common/headerMenuController.js';
import { createSupportModel } from './supportModel.js';
import { createSupportView } from './supportView.js';

export function initSupportPage(doc = document, win = window) {
  const view = createSupportView(doc);
  if (!view.isReady()) {
    return;
  }

  bindHeaderMenu(doc, win);

  const model = createSupportModel(win);
  const session = model.getSession();

  if (!session.token) {
    win.location.replace('/html/signin.html');
    return;
  }

  const maxMessageLength = view.getMaxMessageLength();

  async function loadTickets() {
    view.renderTicketsLoading();

    try {
      const tickets = await model.fetchMyTickets(session.token);
      view.renderTickets(tickets);
    } catch (_) {
      view.renderTicketsError();
    }
  }

  view.renderIdentity(session.displayName);
  view.updateCounter();
  void loadTickets();

  view.bindMessageInput(() => {
    view.updateCounter();
  });

  view.bindSubmit(async () => {
    view.setMessage('', '');

    const payload = view.getFormPayload();
    if (!payload.subject || !payload.message) {
      view.setMessage('Subject and message are required.', 'error');
      return;
    }

    if (payload.subject.length > 255) {
      view.setMessage('Subject must be 255 characters or less.', 'error');
      return;
    }

    if (payload.message.length > maxMessageLength) {
      view.setMessage(`Message must be ${maxMessageLength} characters or less.`, 'error');
      return;
    }

    view.setSubmitting(true);

    try {
      await model.createTicket(session.token, payload);
      view.resetForm();
      view.updateCounter();
      view.setMessage('Support request submitted successfully. Our admin team will get back to you soon.', 'success');
      await loadTickets();
    } catch (error) {
      view.setMessage(error.message || 'Error submitting support request.', 'error');
    } finally {
      view.setSubmitting(false);
    }
  });
}
