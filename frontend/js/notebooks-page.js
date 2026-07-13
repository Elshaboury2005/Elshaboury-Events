/**
 * notebooks-page.js
 * Manages the Notebooks list page:
 *  - Fetches saved Notebooks from /api/notebooks
 *  - Renders cards with name, description, last prediction risk badge,
 *    success score, last edited date, event category, and city
 *  - Sorting by: last edited, created date, name
 *  - Filtering by prediction risk level
 *  - "Create New Notebook" dialog: POSTs to API, navigates to detail page
 *  - "Open" button navigates to notebook-detail.html?id=<id>
 *  - "Delete" button with window.confirm protection
 *  - "Duplicate" button: POST /api/notebooks/:id/duplicate
 *
 * Does NOT redirect to create-event.html in any way.
 */
(function () {
  'use strict';

  const API_BASE = (window.AuthConfig && window.AuthConfig.apiBaseUrl) || '/api';
  const grid = document.getElementById('notebooksGrid');

  // Loaded notebooks stored for client-side sort/filter
  let _allNotebooks = [];

  // ── Helpers ──────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem('token') || '';
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(isoStr) {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return isoStr; }
  }

  function showToast(msg, type = 'success') {
    let toast = document.querySelector('.nb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'nb-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'nb-toast nb-toast-' + type + ' show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.classList.remove('show'); }, 2800);
  }

  // ── Prediction risk level helper ──────────────────────────
  function getRiskLevel(nb) {
    const pred = nb.last_prediction;
    if (!pred) return 'none';
    const raw = (pred.risk_level || pred.decision || '').toLowerCase();
    if (raw === 'low' || raw === 'accepted') return 'low';
    if (raw === 'high' || raw === 'rejected') return 'high';
    return 'medium';
  }

  // ── Prediction badge on card ──────────────────────────────
  function renderPredBadge(nb) {
    const pred = nb.last_prediction;
    if (!pred) return '<span class="nb-pred-badge none">&#9679; No Prediction</span>';
    const risk = getRiskLevel(nb);
    let label = '&#9679; ';
    if (risk === 'low')    label += '&#10003; Low Risk';
    else if (risk === 'high') label += '&#9888; High Risk';
    else                   label += '&#9889; Medium Risk';

    const score = pred.success_score !== undefined ? pred.success_score
      : (pred.success_probability !== undefined ? Math.round(pred.success_probability * 100) : null);
    const scoreStr = score !== null
      ? `<span class="nb-pred-score">Score: ${score}%</span>`
      : '';

    return `<div style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap;">
      <span class="nb-pred-badge ${risk}">${label}</span>${scoreStr}
    </div>`;
  }

  // ── Extract ml_fields metadata for card display ───────────
  function getCardMeta(nb) {
    let category = '', city = '';
    try {
      const fields = typeof nb.ml_fields === 'string'
        ? JSON.parse(nb.ml_fields)
        : (nb.ml_fields || {});
      category = fields.event_category || fields.category || '';
      city = fields.city || fields.location_city || '';
    } catch (_) {}
    return { category, city };
  }

  // ── Render all cards (with current sort/filter) ───────────
  function renderNotebooks(notebooks) {
    if (!notebooks.length) {
      grid.innerHTML = `
        <div class="nb-empty">
          <span class="nb-empty-icon">&#128213;</span>
          <h3>No Notebooks match</h3>
          <p>Try changing the sort or filter, or click <strong>"Create New Notebook"</strong> to start your first ML experiment.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = notebooks.map(nb => {
      const createdLabel = fmtDate(nb.created_at);
      const lastUsedLabel = nb.last_used_at ? 'Edited ' + fmtDate(nb.last_used_at) : 'Created ' + fmtDate(nb.created_at);
      const predBadge = renderPredBadge(nb);
      const descHtml = nb.description ? `<p class="nb-card-desc">${escHtml(nb.description)}</p>` : '';
      const { category, city } = getCardMeta(nb);
      const metaChips = [
        category ? `<span class="nb-meta-chip">&#127914; ${escHtml(category)}</span>` : '',
        city     ? `<span class="nb-meta-chip">&#128205; ${escHtml(city)}</span>` : '',
      ].filter(Boolean).join('');

      return `
        <article class="nb-card" data-id="${nb.id}">
          <div class="nb-card-header">
            <div class="nb-card-icon">&#128213;</div>
            <div class="nb-card-meta">
              <p class="nb-card-name">${escHtml(nb.name)}</p>
              <p class="nb-card-dates">${escHtml(lastUsedLabel)}</p>
            </div>
          </div>
          ${descHtml}
          ${metaChips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px;">${metaChips}</div>` : ''}
          ${predBadge}
          <div class="nb-card-actions">
            <a class="nb-btn-open" href="/html/notebook-detail.html?id=${nb.id}" title="Open this Notebook to fill in ML data and run predictions">&#9654; Open</a>
            <button class="nb-btn-dup" data-action="duplicate" data-id="${nb.id}" title="Duplicate this Notebook">&#128462; Duplicate</button>
            <button class="nb-btn-delete" data-action="delete" data-id="${nb.id}" title="Delete this Notebook">&#128465;</button>
          </div>
        </article>
      `;
    }).join('');
  }

  // ── Sort + Filter then render ─────────────────────────────
  function applyAndRender() {
    const sortVal   = (document.getElementById('sortSelect')      || {}).value || 'last_used';
    const filterVal = (document.getElementById('filterRiskSelect') || {}).value || 'all';

    // Filter
    let list = _allNotebooks.slice();
    if (filterVal !== 'all') {
      list = list.filter(nb => getRiskLevel(nb) === filterVal);
    }

    // Sort
    list.sort((a, b) => {
      if (sortVal === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortVal === 'created') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      // Default: last_used
      const ta = a.last_used_at || a.updated_at || a.created_at || 0;
      const tb = b.last_used_at || b.updated_at || b.created_at || 0;
      return new Date(tb) - new Date(ta);
    });

    renderNotebooks(list);
  }

  // ── Fetch ─────────────────────────────────────────────────
  async function loadNotebooks() {
    grid.innerHTML = `
      <div class="nb-empty">
        <span class="nb-empty-icon">&#128213;</span>
        <h3>Loading your Notebooks…</h3>
        <p>Please wait while we fetch your saved experiments.</p>
      </div>
    `;
    try {
      const resp = await fetch(`${API_BASE}/notebooks`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (data.success && Array.isArray(data.notebooks)) {
        _allNotebooks = data.notebooks;
        applyAndRender();
      } else {
        grid.innerHTML = `<div class="nb-empty"><span class="nb-empty-icon">&#128679;</span><h3>Failed to load Notebooks</h3><p>${escHtml(data.message || 'Unknown error')}</p></div>`;
      }
    } catch (err) {
      grid.innerHTML = `<div class="nb-empty"><span class="nb-empty-icon">&#128679;</span><h3>Network error</h3><p>Could not connect to the server.</p></div>`;
    }
  }

  // ── Delete a notebook ─────────────────────────────────────
  async function deleteNotebook(id) {
    if (!window.confirm('Delete this Notebook permanently? This cannot be undone.')) return;
    try {
      const resp = await fetch(`${API_BASE}/notebooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (data.success) {
        showToast('Notebook deleted.', 'success');
        const card = grid.querySelector(`[data-id="${id}"]`);
        if (card) {
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => {
            _allNotebooks = _allNotebooks.filter(n => String(n.id) !== String(id));
            applyAndRender();
          }, 320);
        } else {
          loadNotebooks();
        }
      } else {
        showToast(data.message || 'Failed to delete.', 'error');
      }
    } catch (err) {
      showToast('Network error. Try again.', 'error');
    }
  }

  // ── Duplicate a notebook ──────────────────────────────────
  async function duplicateNotebook(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const resp = await fetch(`${API_BASE}/notebooks/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (data.success && data.notebook) {
        showToast('Notebook duplicated!', 'success');
        // Optimistically prepend the new notebook then reload
        await loadNotebooks();
      } else {
        showToast(data.message || 'Failed to duplicate.', 'error');
      }
    } catch (err) {
      showToast('Network error. Try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '&#128462; Duplicate'; }
    }
  }

  // ── Click delegation (grid) ───────────────────────────────
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'delete')    deleteNotebook(id);
    if (action === 'duplicate') duplicateNotebook(id, btn);
  });

  // ── Sort / Filter change handlers ─────────────────────────
  const sortSelect   = document.getElementById('sortSelect');
  const filterSelect = document.getElementById('filterRiskSelect');
  if (sortSelect)   sortSelect.addEventListener('change', applyAndRender);
  if (filterSelect) filterSelect.addEventListener('change', applyAndRender);

  // ── Create Notebook Dialog ────────────────────────────────
  const dialog      = document.getElementById('createDialog');
  const btnCreate   = document.getElementById('btnCreateNotebook');
  const btnClose    = document.getElementById('btnCloseDialog');
  const btnCancel   = document.getElementById('btnCancelDialog');
  const btnConfirm  = document.getElementById('btnConfirmCreate');
  const nbName      = document.getElementById('nbName');
  const nbDesc      = document.getElementById('nbDesc');
  const dialogError = document.getElementById('dialogError');

  function openDialog() {
    dialog.removeAttribute('hidden');
    nbName.value = '';
    nbDesc.value = '';
    dialogError.hidden = true;
    dialogError.textContent = '';
    setTimeout(() => nbName.focus(), 50);
  }

  function closeDialog() {
    dialog.setAttribute('hidden', '');
  }

  if (btnCreate) btnCreate.addEventListener('click', openDialog);
  if (btnClose)  btnClose.addEventListener('click', closeDialog);
  if (btnCancel) btnCancel.addEventListener('click', closeDialog);

  // Close on backdrop click
  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog();
    });
  }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog && !dialog.hasAttribute('hidden')) closeDialog();
  });

  // Submit dialog — create notebook then navigate to detail page
  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      const name = nbName.value.trim();
      if (!name) {
        dialogError.textContent = 'Please enter a Notebook name.';
        dialogError.hidden = false;
        nbName.focus();
        return;
      }
      dialogError.hidden = true;
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Creating…';

      try {
        const resp = await fetch(`${API_BASE}/notebooks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          },
          body: JSON.stringify({ name, description: nbDesc.value.trim() || null })
        });
        const data = await resp.json();
        if (data.success && data.notebook) {
          showToast('Notebook created!', 'success');
          closeDialog();
          // Navigate to the notebook detail page
          setTimeout(() => {
            window.location.href = `/html/notebook-detail.html?id=${data.notebook.id}`;
          }, 300);
        } else {
          dialogError.textContent = data.message || 'Failed to create notebook.';
          dialogError.hidden = false;
        }
      } catch (err) {
        dialogError.textContent = 'Network error. Please try again.';
        dialogError.hidden = false;
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = '✓ Create Notebook';
      }
    });
  }

  // ── Allow Enter key in name field to submit ───────────────
  if (nbName) {
    nbName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); btnConfirm && btnConfirm.click(); }
    });
  }

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', loadNotebooks);
})();
