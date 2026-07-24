/**
 * workshop-checkin.js
 * Frontend logic for manual check-in of ticket holders by Booking ID.
 */

(function () {
  const API_CHECKIN = '/api/workshop/checkin';

  // DOM Elements
  const checkInForm = document.getElementById('checkInForm');
  const bookingIdInput = document.getElementById('bookingIdInput');
  const checkInBtn = document.getElementById('checkInBtn');

  const successPanel = document.getElementById('successPanel');
  const successName = document.getElementById('successName');
  const successTicket = document.getElementById('successTicket');
  const successSeat = document.getElementById('successSeat');
  const successEmail = document.getElementById('successEmail');

  const warningPanel = document.getElementById('warningPanel');
  const warningMsg = document.getElementById('warningMsg');
  const warningName = document.getElementById('warningName');
  const warningTicket = document.getElementById('warningTicket');
  const warningSeat = document.getElementById('warningSeat');

  const errorPanel = document.getElementById('errorPanel');
  const errorMsg = document.getElementById('errorMsg');

  const checkInProgressVal = document.getElementById('checkInProgressVal');
  const checkInProgressBar = document.getElementById('checkInProgressBar');
  const progressPercentageText = document.getElementById('progressPercentageText');

  async function init() {
    bookingIdInput.focus();
    setupForm();
    await fetchStats();
    startStatsPolling();
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API_CHECKIN}/summary`, { headers: window.wsHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const checkedIn = data.checkedInCount || 0;
      const total = data.totalCount || 0;
      const percentage = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

      // Update text
      checkInProgressVal.textContent = `${checkedIn} / ${total}`;
      progressPercentageText.textContent = `${percentage}% Complete`;

      // Update progress bar width
      checkInProgressBar.style.width = `${percentage}%`;
    } catch (err) {
      console.error('Failed to load check-in statistics:', err);
    }
  }

  function startStatsPolling() {
    setInterval(fetchStats, 6000);
  }

  function hideAllPanels() {
    successPanel.style.display = 'none';
    warningPanel.style.display = 'none';
    errorPanel.style.display = 'none';
  }

  function setupForm() {
    checkInForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const bookingId = bookingIdInput.value.trim();
      if (!bookingId) return;

      // Disable inputs
      bookingIdInput.disabled = true;
      checkInBtn.disabled = true;
      checkInBtn.textContent = 'Verifying…';
      hideAllPanels();

      try {
        const res = await fetch(API_CHECKIN, {
          method: 'POST',
          headers: window.wsHeaders(),
          body: JSON.stringify({ bookingId })
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          // Success
          successName.textContent = data.attendee.name;
          successTicket.textContent = data.attendee.ticketType;
          successSeat.textContent = formatSeatLabel(data.attendee.seatNumber, data.attendee.seatNumbers);
          successEmail.textContent = data.attendee.email || '—';
          
          successPanel.style.display = 'flex';
          await fetchStats(); // immediate stats update
        } else if (data.alreadyCheckedIn) {
          // Warning (already checked in)
          warningName.textContent = data.attendee.name;
          warningTicket.textContent = data.attendee.ticketType;
          warningSeat.textContent = formatSeatLabel(data.attendee.seatNumber, data.attendee.seatNumbers);
          warningMsg.textContent = data.message;

          warningPanel.style.display = 'flex';
        } else {
          // Error (invalid, cancelled, different event, etc.)
          errorMsg.textContent = data.message || 'Check-in failed. Please verify the ID.';
          errorPanel.style.display = 'flex';
        }

      } catch (err) {
        errorMsg.textContent = err.message || 'An error occurred during verification.';
        errorPanel.style.display = 'flex';
      } finally {
        // Re-enable and refocus
        bookingIdInput.disabled = false;
        bookingIdInput.value = '';
        checkInBtn.disabled = false;
        checkInBtn.textContent = 'Check In Attendee';
        bookingIdInput.focus();
      }
    });
  }

  function formatSeatLabel(seatNumber, seatNumbers) {
    if (seatNumbers) return `Seats: ${seatNumbers}`;
    if (seatNumber) return `Seat: ${seatNumber}`;
    return 'General Entry';
  }

  init();

})();
