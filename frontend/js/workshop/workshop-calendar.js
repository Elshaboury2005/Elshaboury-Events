/**
 * workshop-calendar.js
 * Frontend logic for the category meetings calendar.
 */

(function () {
  const API_CALENDAR = '/api/workshop/calendar';

  let meetings = [];
  let currentDate = new Date();
  let currentYear = currentDate.getFullYear();
  let currentMonth = currentDate.getMonth(); // 0-indexed
  let selectedDateString = null; // YYYY-MM-DD
  
  let currentUserId = window.wsMemberInfo ? window.wsMemberInfo.id : null;
  let currentUserRole = window.wsMemberInfo ? window.wsMemberInfo.role : null;

  // DOM Elements
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const currentMonthYear = document.getElementById('currentMonthYear');
  const calendarDaysGrid = document.getElementById('calendarDaysGrid');
  
  const selectedDateTitle = document.getElementById('selectedDateTitle');
  const meetingsListPane = document.getElementById('meetingsListPane');
  
  const addMeetingBtn = document.getElementById('wsAddMeetingBtn');
  const meetingModal = document.getElementById('meetingModal');
  const meetingForm = document.getElementById('meetingForm');
  const closeMeetingModalBtn = document.getElementById('closeMeetingModalBtn');
  const cancelMeetingModalBtn = document.getElementById('cancelMeetingModalBtn');
  
  const meetingModalTitleText = document.getElementById('meetingModalTitleText');
  const meetingIdField = document.getElementById('meetingIdField');
  const meetingTitle = document.getElementById('meetingTitle');
  const meetingDesc = document.getElementById('meetingDesc');
  const meetingDate = document.getElementById('meetingDate');
  const meetingStartTime = document.getElementById('meetingStartTime');
  const meetingEndTime = document.getElementById('meetingEndTime');
  const meetingLocation = document.getElementById('meetingLocation');
  
  const saveMeetingBtn = document.getElementById('saveMeetingBtn');
  const deleteMeetingBtn = document.getElementById('deleteMeetingBtn');
  const meetingModalMsg = document.getElementById('meetingModalMsg');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  async function init() {
    // Select today by default
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    selectedDateString = `${year}-${month}-${day}`;

    await loadMeetings();
    setupEventListeners();
  }

  async function loadMeetings() {
    try {
      const res = await fetch(API_CALENDAR, { headers: window.wsHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      meetings = data.events || [];
      // Clean dates to YYYY-MM-DD
      meetings.forEach(m => {
        if (m.event_date) {
          m.event_date = m.event_date.substring(0, 10);
        }
      });

      renderCalendar();
      renderMeetingsList();
    } catch (err) {
      console.error('Failed to load meetings:', err);
      meetingsListPane.innerHTML = `<div class="ws-message error show">Error: ${err.message}</div>`;
    }
  }

  function renderCalendar() {
    currentMonthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    calendarDaysGrid.innerHTML = '';

    // First day of month
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    // Days in current month
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Render empty cells for padding
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day-cell empty';
      calendarDaysGrid.appendChild(emptyCell);
    }

    // Today's date string for comparison
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Render days
    for (let day = 1; day <= totalDays; day++) {
      const dayCell = document.createElement('div');
      dayCell.className = 'calendar-day-cell';
      
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`;

      dayCell.setAttribute('data-date', dateStr);
      dayCell.textContent = day;

      // Add special classes
      if (dateStr === todayStr) {
        dayCell.classList.add('today');
      }
      if (dateStr === selectedDateString) {
        dayCell.classList.add('selected');
      }

      // Check if day has meetings
      const dayHasEvents = meetings.some(m => m.event_date === dateStr);
      if (dayHasEvents) {
        const dot = document.createElement('span');
        dot.className = 'event-dot';
        dayCell.appendChild(dot);
      }

      dayCell.addEventListener('click', () => {
        document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('selected'));
        dayCell.classList.add('selected');
        selectedDateString = dateStr;
        renderMeetingsList();
      });

      calendarDaysGrid.appendChild(dayCell);
    }
  }

  function renderMeetingsList() {
    if (!selectedDateString) {
      selectedDateTitle.textContent = 'Select a Day';
      meetingsListPane.innerHTML = `<div class="ws-bell-item-empty">Click on a day to view meetings.</div>`;
      return;
    }

    const dateObj = new Date(selectedDateString);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    selectedDateTitle.textContent = dateObj.toLocaleDateString('en-EG', options);

    const dayMeetings = meetings.filter(m => m.event_date === selectedDateString);

    if (dayMeetings.length === 0) {
      meetingsListPane.innerHTML = `<div class="ws-bell-item-empty">No meetings scheduled for this day.</div>`;
      return;
    }

    meetingsListPane.innerHTML = dayMeetings.map(m => {
      const start = m.start_time.substring(0, 5);
      const end = m.end_time ? m.end_time.substring(0, 5) : null;
      const timeVal = end ? `${start} - ${end}` : `${start}`;
      return `
        <div class="meeting-item-card" data-id="${m.id}">
          <div class="meeting-time-row">
            <span class="meeting-time-val">⏰ ${timeVal}</span>
            <span style="font-size: .68rem;">By ${escapeHtml(m.creator_email)}</span>
          </div>
          <div class="meeting-item-title">${escapeHtml(m.title)}</div>
          ${m.description ? `<div class="meeting-item-desc">${escapeHtml(m.description)}</div>` : ''}
          ${m.location ? `<div class="meeting-item-loc">📍 ${escapeHtml(m.location)}</div>` : ''}
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    meetingsListPane.querySelectorAll('.meeting-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.getAttribute('data-id'), 10);
        const meeting = meetings.find(m => m.id === id);
        if (meeting) openEditModal(meeting);
      });
    });
  }

  // Modals
  function openCreateModal() {
    meetingModalMsg.className = 'ws-message';
    meetingModalMsg.textContent = '';
    
    meetingModalTitleText.textContent = 'Propose Meeting';
    meetingIdField.value = '';
    meetingForm.reset();

    // Default the date input to the selected date
    if (selectedDateString) {
      meetingDate.value = selectedDateString;
    }

    enableFormInputs(true);
    saveMeetingBtn.style.display = 'block';
    deleteMeetingBtn.style.display = 'none';
    meetingModal.style.display = 'flex';
  }

  function openEditModal(meeting) {
    meetingModalMsg.className = 'ws-message';
    meetingModalMsg.textContent = '';

    meetingModalTitleText.textContent = 'Meeting Details';
    meetingIdField.value = meeting.id;
    meetingTitle.value = meeting.title;
    meetingDesc.value = meeting.description || '';
    meetingDate.value = meeting.event_date;
    meetingStartTime.value = meeting.start_time.substring(0, 5);
    meetingEndTime.value = meeting.end_time ? meeting.end_time.substring(0, 5) : '';
    meetingLocation.value = meeting.location || '';

    // Permissions: creator or head/vice_head
    const isCreator = meeting.created_by === currentUserId;
    const isLead = currentUserRole === 'head' || currentUserRole === 'vice_head';

    const canEdit = isCreator || isLead;

    enableFormInputs(canEdit);
    saveMeetingBtn.style.display = canEdit ? 'block' : 'none';
    deleteMeetingBtn.style.display = canEdit ? 'block' : 'none';

    meetingModal.style.display = 'flex';
  }

  function enableFormInputs(enabled) {
    meetingTitle.disabled = !enabled;
    meetingDesc.disabled = !enabled;
    meetingDate.disabled = !enabled;
    meetingStartTime.disabled = !enabled;
    meetingEndTime.disabled = !enabled;
    meetingLocation.disabled = !enabled;
  }

  function closeMeetingModal() {
    meetingModal.style.display = 'none';
  }

  function setupEventListeners() {
    // Navigation
    prevMonthBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
    });

    addMeetingBtn.addEventListener('click', openCreateModal);
    closeMeetingModalBtn.addEventListener('click', closeMeetingModal);
    cancelMeetingModalBtn.addEventListener('click', closeMeetingModal);

    // Save/Update
    meetingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = meetingIdField.value;
      const payload = {
        title: meetingTitle.value,
        description: meetingDesc.value,
        eventDate: meetingDate.value,
        startTime: meetingStartTime.value,
        endTime: meetingEndTime.value || null,
        location: meetingLocation.value || null
      };

      saveMeetingBtn.disabled = true;
      saveMeetingBtn.textContent = 'Submitting…';
      meetingModalMsg.className = 'ws-message';

      try {
        let res, data;
        if (id) {
          res = await fetch(`${API_CALENDAR}/${id}`, {
            method: 'PUT',
            headers: window.wsHeaders(),
            body: JSON.stringify(payload)
          });
        } else {
          res = await fetch(API_CALENDAR, {
            method: 'POST',
            headers: window.wsHeaders(),
            body: JSON.stringify(payload)
          });
        }
        data = await res.json();

        if (!data.success) throw new Error(data.message);

        closeMeetingModal();
        await loadMeetings();
      } catch (err) {
        meetingModalMsg.className = 'ws-message error show';
        meetingModalMsg.textContent = err.message || 'Failed to save meeting';
      } finally {
        saveMeetingBtn.disabled = false;
        saveMeetingBtn.textContent = 'Submit';
      }
    });

    // Delete
    deleteMeetingBtn.addEventListener('click', async () => {
      const id = meetingIdField.value;
      if (!id || !confirm('Are you sure you want to delete this meeting proposal?')) return;

      deleteMeetingBtn.disabled = true;
      deleteMeetingBtn.textContent = 'Deleting…';

      try {
        const res = await fetch(`${API_CALENDAR}/${id}`, {
          method: 'DELETE',
          headers: window.wsHeaders()
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.message);

        closeMeetingModal();
        await loadMeetings();
      } catch (err) {
        meetingModalMsg.className = 'ws-message error show';
        meetingModalMsg.textContent = err.message || 'Failed to delete meeting';
      } finally {
        deleteMeetingBtn.disabled = false;
        deleteMeetingBtn.textContent = '🗑️ Delete';
      }
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
