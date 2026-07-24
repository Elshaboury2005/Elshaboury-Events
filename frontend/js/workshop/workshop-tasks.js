/**
 * workshop-tasks.js
 * Frontend logic for the workshop Tasks board.
 */

(function () {
  const API_TASKS = '/api/workshop/tasks';
  const API_MEMBERS = '/api/workshop/my-category';

  let allTasks = [];
  let categoryMembers = [];
  let currentUserId = window.wsMemberInfo ? window.wsMemberInfo.id : null;
  let currentUserRole = window.wsMemberInfo ? window.wsMemberInfo.role : null;

  // DOM Elements
  const colTodo = document.getElementById('colTodo');
  const colProgress = document.getElementById('colProgress');
  const colDone = document.getElementById('colDone');
  
  const todoCount = document.getElementById('todoCount');
  const progressCount = document.getElementById('progressCount');
  const doneCount = document.getElementById('doneCount');

  const addTaskBtn = document.getElementById('wsAddTaskBtn');
  const taskModal = document.getElementById('taskModal');
  const taskForm = document.getElementById('taskForm');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  
  const modalTitleText = document.getElementById('modalTitleText');
  const taskIdField = document.getElementById('taskIdField');
  const taskTitle = document.getElementById('taskTitle');
  const taskDesc = document.getElementById('taskDesc');
  const taskAssignee = document.getElementById('taskAssignee');
  const taskPriority = document.getElementById('taskPriority');
  const taskDueDate = document.getElementById('taskDueDate');
  
  const saveTaskBtn = document.getElementById('saveTaskBtn');
  const deleteTaskBtn = document.getElementById('deleteTaskBtn');
  const modalMsg = document.getElementById('modalMsg');

  // Load Initial Data
  async function init() {
    await fetchMembers();
    await loadTasks();
    setupEventListeners();
  }

  async function fetchMembers() {
    try {
      const res = await fetch(API_MEMBERS, { headers: window.wsHeaders() });
      const data = await res.json();
      if (data.success) {
        categoryMembers = data.members || [];
        populateAssigneesDropdown();
      }
    } catch (err) {
      console.error('Failed to load category members:', err);
    }
  }

  function populateAssigneesDropdown() {
    taskAssignee.innerHTML = '<option value="">Unassigned</option>';
    categoryMembers.forEach(member => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = member.email;
      taskAssignee.appendChild(option);
    });
  }

  async function loadTasks() {
    try {
      // Clear columns
      colTodo.innerHTML = '<div class="ws-loading"><span class="ws-spinner"></span></div>';
      colProgress.innerHTML = '<div class="ws-loading"><span class="ws-spinner"></span></div>';
      colDone.innerHTML = '<div class="ws-loading"><span class="ws-spinner"></span></div>';

      const res = await fetch(API_TASKS, { headers: window.wsHeaders() });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch tasks');
      }

      allTasks = data.tasks || [];
      renderBoard();
    } catch (err) {
      colTodo.innerHTML = `<div class="ws-message error show">${err.message}</div>`;
      colProgress.innerHTML = '';
      colDone.innerHTML = '';
    }
  }

  function renderBoard() {
    // Filter and group
    const todoList = allTasks.filter(t => t.status === 'todo');
    const progressList = allTasks.filter(t => t.status === 'in_progress');
    const doneList = allTasks.filter(t => t.status === 'done');

    // Update counts
    todoCount.textContent = todoList.length;
    progressCount.textContent = progressList.length;
    doneCount.textContent = doneList.length;

    // Render cards
    colTodo.innerHTML = todoList.map(t => renderCardHtml(t)).join('') || '<div class="ws-bell-item-empty">No tasks</div>';
    colProgress.innerHTML = progressList.map(t => renderCardHtml(t)).join('') || '<div class="ws-bell-item-empty">No tasks</div>';
    colDone.innerHTML = doneList.map(t => renderCardHtml(t)).join('') || '<div class="ws-bell-item-empty">No tasks</div>';

    // Hook click on cards
    document.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.getAttribute('data-id'), 10);
        const task = allTasks.find(t => t.id === id);
        if (task) openEditModal(task);
      });
    });
  }

  function getInitials(email) {
    if (!email) return '?';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  }

  function renderCardHtml(task) {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date().setHours(0,0,0,0) && task.status !== 'done';
    const initials = task.assigned_to ? getInitials(task.assignee_email) : '?';
    const assigneeTooltip = task.assigned_to ? `Assigned to: ${task.assignee_email}` : 'Unassigned';
    
    let cardClass = 'task-card';
    if (isOverdue) cardClass += ' overdue';

    const formattedDate = task.due_date ? new Date(task.due_date).toLocaleDateString('en-EG', { month: 'short', day: 'numeric' }) : 'No due date';

    return `
      <div class="${cardClass}" draggable="true" data-id="${task.id}" ondragstart="dragTask(event)">
        ${isOverdue ? '<span class="overdue-badge">Overdue</span>' : ''}
        <div class="task-card-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ''}
        
        <div class="task-card-meta">
          <span class="task-priority-tag ${task.priority}">${task.priority}</span>
          <div style="display:flex; align-items:center; gap: 8px;">
            <span class="task-due-date-label">📅 ${formattedDate}</span>
            <div class="task-assignee-avatar" title="${assigneeTooltip}">${initials}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Drag & Drop Handlers
  window.dragTask = function (e) {
    e.dataTransfer.setData('text/plain', e.target.getAttribute('data-id'));
    // Add dragover styling to columns
    document.querySelectorAll('.kanban-cards-container').forEach(c => c.classList.add('dragover'));
  };

  window.allowDrop = function (e) {
    e.preventDefault();
  };

  window.dropTask = async function (e, targetStatus) {
    e.preventDefault();
    document.querySelectorAll('.kanban-cards-container').forEach(c => c.classList.remove('dragover'));

    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const task = allTasks.find(t => t.id === id);
    if (!task || task.status === targetStatus) return;

    // Check status-change permissions (assignee or lead)
    const isAssignee = task.assigned_to === currentUserId;
    const isLead = currentUserRole === 'head' || currentUserRole === 'vice_head';

    if (!isAssignee && !isLead) {
      alert('You can only move tasks assigned to you or if you are a Category Lead.');
      return;
    }

    // Optimistic Update
    task.status = targetStatus;
    renderBoard();

    try {
      const res = await fetch(`${API_TASKS}/${id}/status`, {
        method: 'PUT',
        headers: window.wsHeaders(),
        body: JSON.stringify({ status: targetStatus })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
    } catch (err) {
      alert('Failed to update task status: ' + err.message);
      loadTasks(); // rollback
    }
  };

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.kanban-cards-container').forEach(c => c.classList.remove('dragover'));
  });

  // Modal Handlers
  function openCreateModal() {
    modalMsg.className = 'ws-message';
    modalMsg.textContent = '';
    
    modalTitleText.textContent = 'Create Task';
    taskIdField.value = '';
    taskForm.reset();
    
    // Enable form elements
    enableFormInputs(true);
    
    saveTaskBtn.style.display = 'block';
    deleteTaskBtn.style.display = 'none';
    taskModal.style.display = 'flex';
  }

  function openEditModal(task) {
    modalMsg.className = 'ws-message';
    modalMsg.textContent = '';

    modalTitleText.textContent = 'Task Details';
    taskIdField.value = task.id;
    taskTitle.value = task.title;
    taskDesc.value = task.description || '';
    taskAssignee.value = task.assigned_to || '';
    taskPriority.value = task.priority;
    taskDueDate.value = task.due_date ? task.due_date.substring(0, 10) : '';

    // Check Permissions
    const isCreator = task.created_by === currentUserId;
    const isAssignee = task.assigned_to === currentUserId;
    const isLead = currentUserRole === 'head' || currentUserRole === 'vice_head';

    const canEdit = isCreator || isAssignee || isLead;
    const canDelete = isCreator || isLead;

    enableFormInputs(canEdit);

    saveTaskBtn.style.display = canEdit ? 'block' : 'none';
    deleteTaskBtn.style.display = canDelete ? 'block' : 'none';
    
    taskModal.style.display = 'flex';
  }

  function enableFormInputs(enabled) {
    taskTitle.disabled = !enabled;
    taskDesc.disabled = !enabled;
    taskAssignee.disabled = !enabled;
    taskPriority.disabled = !enabled;
    taskDueDate.disabled = !enabled;
  }

  function closeTaskModal() {
    taskModal.style.display = 'none';
  }

  function setupEventListeners() {
    addTaskBtn.addEventListener('click', openCreateModal);
    closeModalBtn.addEventListener('click', closeTaskModal);
    cancelModalBtn.addEventListener('click', closeTaskModal);

    // Form Submit (Save/Create)
    taskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const id = taskIdField.value;
      const payload = {
        title: taskTitle.value,
        description: taskDesc.value,
        assignedTo: taskAssignee.value || null,
        priority: taskPriority.value,
        dueDate: taskDueDate.value || null
      };

      saveTaskBtn.disabled = true;
      saveTaskBtn.textContent = 'Saving…';
      modalMsg.className = 'ws-message';

      try {
        let res, data;
        if (id) {
          // Edit
          res = await fetch(`${API_TASKS}/${id}`, {
            method: 'PUT',
            headers: window.wsHeaders(),
            body: JSON.stringify(payload)
          });
        } else {
          // Create
          res = await fetch(API_TASKS, {
            method: 'POST',
            headers: window.wsHeaders(),
            body: JSON.stringify(payload)
          });
        }
        data = await res.json();

        if (!data.success) throw new Error(data.message);

        closeTaskModal();
        loadTasks();
      } catch (err) {
        modalMsg.className = 'ws-message error show';
        modalMsg.textContent = err.message || 'Failed to save task';
      } finally {
        saveTaskBtn.disabled = false;
        saveTaskBtn.textContent = 'Save Task';
      }
    });

    // Delete Task
    deleteTaskBtn.addEventListener('click', async () => {
      const id = taskIdField.value;
      if (!id || !confirm('Are you sure you want to delete this task?')) return;

      deleteTaskBtn.disabled = true;
      deleteTaskBtn.textContent = 'Deleting…';

      try {
        const res = await fetch(`${API_TASKS}/${id}`, {
          method: 'DELETE',
          headers: window.wsHeaders()
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.message);

        closeTaskModal();
        loadTasks();
      } catch (err) {
        modalMsg.className = 'ws-message error show';
        modalMsg.textContent = err.message || 'Failed to delete task';
      } finally {
        deleteTaskBtn.disabled = false;
        deleteTaskBtn.textContent = '🗑️ Delete';
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
