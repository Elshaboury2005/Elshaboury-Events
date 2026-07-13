/**
 * notebook-detail-page.js
 *
 * Manages the Notebook detail view:
 *  1. Reads ?id=<notebookId> from the URL.
 *  2. Fetches the notebook record from /api/notebooks/:id.
 *  3. Pre-populates all Category 1 form fields from the saved ml_fields snapshot.
 *  4. Fetches auto-filled Category 2 organizer data from /api/notebooks/:id/organizer-stats
 *     and renders it in the read-only panel.
 *  5. Step 1 (Venue Selection): Allows choosing a platform venue, auto-populating capacity, cost, city, AC, parking, accessibility, rating.
 *  6. Step 2 (Configure ML Parameters): Form fields for model inputs and prediction execution.
 *  7. "Save Draft" → PUT /api/notebooks/:id/ml-fields (saves without predicting).
 *  8. "Run Prediction" → POST /api/notebooks/:id/predict (assembles full feature vector server-side,
 *     calls the Python model, returns risk_level + success_score + reasons).
 *  9. Renders the prediction result card inline.
 *
 * Does NOT reference create-event.html, buildPayload(), or any Create Event logic.
 */
(function () {
  'use strict';

  const API_BASE = (window.AuthConfig && window.AuthConfig.apiBaseUrl) || '/api';

  // ── URL param ─────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const NOTEBOOK_ID = params.get('id');

  if (!NOTEBOOK_ID) {
    window.location.href = '/html/notebooks.html';
  }

  // ── State ─────────────────────────────────────────────────
  const state = {
    venues: [],
    selectedVenueId: null,
    selectedVenueName: null,
    currentStep: 0, // 0 = Choose Venue (Step 1), 1 = Config Form (Step 2),
  };

  // ── DOM refs ──────────────────────────────────────────────
  const ndTitle              = document.getElementById('ndTitle');
  const ndDesc               = document.getElementById('ndDesc');
  const ndLoadingState       = document.getElementById('ndLoadingState');
  const ndForm               = document.getElementById('ndForm');
  const ndAutoFillPanel      = document.getElementById('ndAutoFillPanel');
  const ndRunBtn             = document.getElementById('ndRunBtn');
  const ndSaveBtn            = document.getElementById('ndSaveBtn');
  const ndResultArea         = document.getElementById('ndResultArea');

  // Edit Identity refs
  const editIdentityModal    = document.getElementById('editIdentityModal');
  const btnEditIdentity      = document.getElementById('btnEditIdentity');
  const btnCloseEditModal    = document.getElementById('btnCloseEditModal');
  const btnCancelEditModal   = document.getElementById('btnCancelEditModal');
  const btnConfirmEdit       = document.getElementById('btnConfirmEdit');
  const editNbName           = document.getElementById('editNbName');
  const editNbDesc           = document.getElementById('editNbDesc');
  const editDialogError      = document.getElementById('editDialogError');
  const unsavedBadge         = document.getElementById('unsavedBadge');
  const ndDerivedPanel       = document.getElementById('ndDerivedPanel');

  // Step 1 refs
  const ndStep0              = document.getElementById('ndStep0');
  const vCarousel            = document.getElementById('vCarousel');
  const vCarouselPrev        = document.getElementById('vCarouselPrev');
  const vCarouselNext        = document.getElementById('vCarouselNext');
  const vFilterGovernorate   = document.getElementById('vFilterGovernorate');
  const vFilterSearch        = document.getElementById('vFilterSearch');
  const btnUseVenue          = document.getElementById('btnUseVenue');
  const btnSkipVenue         = document.getElementById('btnSkipVenue');
  const btnChangeVenue       = document.getElementById('btnChangeVenue');
  const selectedVenueBanner  = document.getElementById('selectedVenueBanner');
  const selectedVenueName    = document.getElementById('selectedVenueName');
  const selectedVenueDetails = document.getElementById('selectedVenueDetails');

  // Venue Details Modal refs
  const venueDetailsModal    = document.getElementById('venueDetailsModal');
  const btnCloseVModal       = document.getElementById('btnCloseVModal');
  const btnCloseVModalCancel = document.getElementById('btnCloseVModalCancel');
  const vModalTitle          = document.getElementById('vModalTitle');
  const vModalImages         = document.getElementById('vModalImages');
  const vModalDesc           = document.getElementById('vModalDesc');
  const vModalStatsGrid      = document.getElementById('vModalStatsGrid');
  const vModalAmenities     = document.getElementById('vModalAmenities');

  // Steps Indicators
  const stepIndicator0       = document.getElementById('stepIndicator0');
  const stepIndicator1       = document.getElementById('stepIndicator1');
  const step1Dot             = document.getElementById('step1Dot');

  // ── Helpers ───────────────────────────────────────────────
  function getToken() { return localStorage.getItem('token') || ''; }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast(msg, type = 'success') {
    let t = document.querySelector('.nd-toast');
    if (!t) { t = document.createElement('div'); t.className = 'nd-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'nd-toast nd-toast-' + type + ' show';
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ── Edit Identity Modal Logic ─────────────────────────────
  function openEditModal() {
    if (!editIdentityModal) return;
    const currentName = ndTitle.textContent.replace(/^[📓\s]+/, '').trim();
    editNbName.value = currentName;
    editNbDesc.value = ndDesc.style.display === 'none' ? '' : ndDesc.textContent;
    editDialogError.hidden = true;
    editDialogError.textContent = '';
    editIdentityModal.removeAttribute('hidden');
    setTimeout(() => editNbName.focus(), 50);
  }

  function closeEditModal() {
    if (editIdentityModal) editIdentityModal.setAttribute('hidden', '');
  }

  async function saveIdentity() {
    const name = editNbName.value.trim();
    const description = editNbDesc.value.trim();
    if (!name) {
      editDialogError.textContent = 'Please enter a Notebook name.';
      editDialogError.hidden = false;
      editNbName.focus();
      return;
    }
    editDialogError.hidden = true;
    btnConfirmEdit.disabled = true;
    btnConfirmEdit.textContent = 'Saving…';

    try {
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ name, description })
      });
      const data = await resp.json();
      if (data.success) {
        showToast('Notebook identity updated!', 'success');
        ndTitle.textContent = '📓 ' + name;
        document.title = `Notebook: ${name} | Elshaboury Events`;
        if (description) {
          ndDesc.textContent = description;
          ndDesc.style.display = '';
        } else {
          ndDesc.textContent = '';
          ndDesc.style.display = 'none';
        }
        closeEditModal();
      } else {
        editDialogError.textContent = data.message || 'Failed to update notebook.';
        editDialogError.hidden = false;
      }
    } catch (err) {
      editDialogError.textContent = 'Network error. Please try again.';
      editDialogError.hidden = false;
    } finally {
      btnConfirmEdit.disabled = false;
      btnConfirmEdit.textContent = 'Save Changes';
    }
  }

  function updateVenueCarouselUI() {
    if (!vCarousel) return;
    const container = vCarousel.closest('.v-carousel-container');
    const maxScroll = Math.max(0, vCarousel.scrollWidth - vCarousel.clientWidth);
    const canScrollLeft = vCarousel.scrollLeft > 4;
    const canScrollRight = vCarousel.scrollLeft < maxScroll - 4;

    if (vCarouselPrev) vCarouselPrev.disabled = !canScrollLeft;
    if (vCarouselNext) vCarouselNext.disabled = !canScrollRight;
    container?.classList.toggle('can-scroll-left', canScrollLeft);
    container?.classList.toggle('can-scroll-right', canScrollRight);
  }

  function venueCarouselStep() {
    if (!vCarousel) return 266;
    const card = vCarousel.querySelector('.v-card');
    if (!card) return 266;
    const styles = window.getComputedStyle(vCarousel);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
    return Math.ceil(card.getBoundingClientRect().width + gap);
  }

  function scrollVenueCarousel(direction) {
    if (!vCarousel) return;
    vCarousel.scrollBy({
      left: direction * venueCarouselStep(),
      behavior: 'smooth'
    });
  }

  // ── Step Navigation ──────────────────────────────────────
  function setStep(step, immediate = false) {
    const oldStep = state.currentStep;
    state.currentStep = step;

    const oldEl = oldStep === 0 ? ndStep0 : ndForm;
    const newEl = step === 0 ? ndStep0 : ndForm;

    if (immediate) {
      oldEl.style.display = 'none';
      oldEl.classList.remove('fade-out', 'fade-in');
      if (step === 1) {
        newEl.removeAttribute('hidden');
      }
      newEl.style.display = 'block';
      
      // Update sidebar run/save buttons
      if (step === 0) {
        ndRunBtn.disabled = true;
        ndSaveBtn.disabled = true;
      } else {
        ndRunBtn.disabled = false;
        ndSaveBtn.disabled = false;
      }

      // Update indicators
      if (step === 0) {
        stepIndicator0.style.color = 'var(--accent-1)';
        stepIndicator0.firstElementChild.style.background = 'var(--accent-1)';
        stepIndicator0.firstElementChild.style.color = '#fff';
        
        stepIndicator1.style.color = 'rgba(255,255,255,0.25)';
        step1Dot.style.background = 'rgba(255,255,255,0.06)';
        step1Dot.style.color = 'rgba(255,255,255,0.25)';
      } else {
        stepIndicator0.style.color = 'var(--muted)';
        stepIndicator0.firstElementChild.style.background = 'rgba(255,255,255,0.1)';
        stepIndicator0.firstElementChild.style.color = 'var(--muted)';
        
        stepIndicator1.style.color = 'var(--accent-1)';
        step1Dot.style.background = 'var(--accent-1)';
        step1Dot.style.color = '#fff';
      }
      return;
    }

    // Apply fade-out to current step
    oldEl.classList.add('fade-out');

    setTimeout(() => {
      // Hide old step
      oldEl.style.display = 'none';
      oldEl.classList.remove('fade-out');

      // Update form display state (remove hidden if setting step 1)
      if (step === 1) {
        newEl.removeAttribute('hidden');
      }

      // Show new step starting at opacity:0 (fade-in class sets opacity:0)
      newEl.style.display = 'block';
      newEl.classList.add('fade-in');

      // Wait for the browser to paint the opacity:0 state, THEN remove 'fade-in'
      // so the CSS transition plays from 0 → 1
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          newEl.classList.remove('fade-in');
        });
      });

      // Update sidebar run/save buttons
      if (step === 0) {
        ndRunBtn.disabled = true;
        ndSaveBtn.disabled = true;
      } else {
        ndRunBtn.disabled = false;
        ndSaveBtn.disabled = false;
      }

      // Update indicators
      if (step === 0) {
        stepIndicator0.style.color = 'var(--accent-1)';
        stepIndicator0.firstElementChild.style.background = 'var(--accent-1)';
        stepIndicator0.firstElementChild.style.color = '#fff';

        stepIndicator1.style.color = 'rgba(255,255,255,0.25)';
        step1Dot.style.background = 'rgba(255,255,255,0.06)';
        step1Dot.style.color = 'rgba(255,255,255,0.25)';
      } else {
        stepIndicator0.style.color = 'var(--muted)';
        stepIndicator0.firstElementChild.style.background = 'rgba(255,255,255,0.1)';
        stepIndicator0.firstElementChild.style.color = 'var(--muted)';

        stepIndicator1.style.color = 'var(--accent-1)';
        step1Dot.style.background = 'var(--accent-1)';
        step1Dot.style.color = '#fff';
      }
    }, 200);
  }

  // ── Venue Selection Logic ─────────────────────────────────
  async function loadVenues() {
    try {
      const gov = vFilterGovernorate.value || '';
      const query = vFilterSearch.value.trim() || '';
      const params = new URLSearchParams();
      if (gov) params.set('governorate', gov);
      if (query) params.set('search', query);

      vCarousel.innerHTML = '<p style="font-size:0.875rem;color:var(--muted);padding:20px 10px;">Searching venues...</p>';
      updateVenueCarouselUI();
      const resp = await fetch(`${API_BASE}/venues?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (data.success && Array.isArray(data.venues)) {
        state.venues = data.venues;
        renderVenues(data.venues);
      } else {
        vCarousel.innerHTML = '<p style="font-size:0.875rem;color:var(--muted);padding:20px 10px;">No venues found.</p>';
        updateVenueCarouselUI();
      }
    } catch (e) {
      vCarousel.innerHTML = '<p style="font-size:0.875rem;color:var(--muted);padding:20px 10px;">Failed to load venues.</p>';
      updateVenueCarouselUI();
    }
  }

  function renderVenues(venues) {
    if (!venues.length) {
      vCarousel.innerHTML = '<p style="font-size:0.875rem;color:var(--muted);padding:20px 10px;">No venues match your search.</p>';
      updateVenueCarouselUI();
      return;
    }
    vCarousel.scrollLeft = 0;
    vCarousel.innerHTML = venues.map(v => {
      const isSelected = state.selectedVenueId == v.id;
      const selectedCls = isSelected ? 'selected' : '';
      const img = v.images && v.images[0] ? v.images[0] : 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600';
      return `
        <div class="v-card ${selectedCls}" data-id="${v.id}">
          <img class="v-card-img" src="${escHtml(img)}" alt="${escHtml(v.name)}" />
          <p class="v-card-name" title="${escHtml(v.name)}">${escHtml(v.name)}</p>
          <div class="v-card-meta-row">
            <span>&#128101; ${v.totalCapacity || 0} cap</span>
            <span class="v-card-badge">${(v.pricePerDay || 0).toLocaleString()} EGP</span>
          </div>
          <div class="v-card-meta-row" style="margin-top:-2px;">
            <span>📍 ${escHtml(v.governorate || 'Egypt')}</span>
            <span style="color:#fbbf24;">★ ${Number(v.rating || 0).toFixed(1)}</span>
          </div>
          <div class="v-card-actions-row">
            <button class="v-card-btn-view" type="button">View Details</button>
          </div>
        </div>
      `;
    }).join('');
    window.requestAnimationFrame(updateVenueCarouselUI);
  }

  function selectVenue(id, name) {
    state.selectedVenueId = id;
    state.selectedVenueName = name;
    
    // Highlight active card
    Array.from(vCarousel.children).forEach(card => {
      if (card.dataset.id == id) card.classList.add('selected');
      else card.classList.remove('selected');
    });

    btnUseVenue.disabled = false;
  }

  async function showVenueQuickView(venueId) {
    try {
      const resp = await fetch(`${API_BASE}/venues/${venueId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (!data.success || !data.venue) {
        showToast('Failed to load venue details.', 'error');
        return;
      }
      const v = data.venue;

      // Populate Modal
      vModalTitle.textContent = v.name;
      vModalDesc.textContent = v.description || 'No description available.';
      
      // Images
      if (v.images && v.images.length) {
        vModalImages.innerHTML = v.images.map(img => 
          `<img class="v-modal-gallery-img" src="${escHtml(img)}" alt="Venue Image" />`
        ).join('');
        vModalImages.style.display = 'flex';
      } else {
        vModalImages.style.display = 'none';
      }

      // Stats
      const stats = [
        ['City/Governorate', v.governorate],
        ['Capacity', `${(v.totalCapacity || 0).toLocaleString()} guest(s)`],
        ['Price Per Day', `${(v.pricePerDay || 0).toLocaleString()} EGP`],
        ['Rating', `${Number(v.rating || 0).toFixed(1)} ★`],
        ['Address', v.address || 'N/A'],
      ];
      vModalStatsGrid.innerHTML = stats.map(([k, val]) =>
        `<div class="nd-autofill-row">
          <span class="nd-af-key">${escHtml(k)}</span>
          <span class="nd-af-val">${escHtml(String(val))}</span>
        </div>`
      ).join('');

      // Amenities
      if (v.amenities && v.amenities.length) {
        vModalAmenities.innerHTML = v.amenities.map(a => 
          `<span class="nb-chip" style="font-size:0.75rem;">${escHtml(a)}</span>`
        ).join('');
      } else {
        vModalAmenities.innerHTML = '<span style="font-size:0.8rem;color:var(--muted);">No amenities listed.</span>';
      }

      // Show Modal
      venueDetailsModal.removeAttribute('hidden');
    } catch (e) {
      showToast('Network error loading venue quick view.', 'error');
    }
  }

  function closeVModal() {
    venueDetailsModal.setAttribute('hidden', '');
  }

  // ── Auto-Fill Event Form from Selected Venue ──────────────
  async function applyVenueDetailsToForm(venueId) {
    try {
      const resp = await fetch(`${API_BASE}/venues/${venueId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (!data.success || !data.venue) return;
      const v = data.venue;

      // Auto-fill form fields
      document.getElementById('f_hall_capacity').value = v.totalCapacity || 100;
      document.getElementById('f_venue_cost').value = v.pricePerDay || 0;
      document.getElementById('f_city').value = v.governorate || '';
      document.getElementById('f_venue_rating').value = Number(v.rating || 3.5).toFixed(1);

      // Determine indoor/outdoor
      const cat = String(v.category || '').toLowerCase();
      const isOutdoor = cat.includes('garden') || cat.includes('beach') || cat.includes('outdoor');
      document.getElementById('f_indoor_outdoor').value = isOutdoor ? 'Outdoor' : 'Indoor';

      // Amenities parsing (valet/parking/ac/wheelchair etc.)
      const amString = JSON.stringify(v.amenities || []).toLowerCase();
      
      document.getElementById('f_parking_available').checked = amString.includes('park') || amString.includes('garage') || amString.includes('valet');
      document.getElementById('f_air_conditioning').checked = amString.includes('ac') || amString.includes('air') || amString.includes('cooling');
      document.getElementById('f_accessibility').checked = amString.includes('wheel') || amString.includes('access') || amString.includes('ramp');

      // Update banner
      selectedVenueName.textContent = v.name;
      selectedVenueDetails.textContent = `Auto-populated capacity (${(v.totalCapacity || 0).toLocaleString()} guests), cost, and features from selected venue.`;
      selectedVenueBanner.style.display = 'flex';
      
      // Update UI panels & validations
      updateDerivedDataPanel();
      validateMarketingBudgets();
      setUnsavedChanges(true);
      
      showToast(`Applied ${v.name} settings to form.`, 'success');
    } catch (e) {
      showToast('Could not auto-fill venue fields.', 'error');
    }
  }

  // ── Collect all Category 1 form field values ─────────────
  function collectMlFields() {
    const f = id => document.getElementById(id);
    const fVal = id => { const el = f(id); return el ? el.value : null; };
    const fNum = id => { const v = fVal(id); return v !== null ? parseFloat(v) || 0 : 0; };
    const fInt = id => { const v = fVal(id); return v !== null ? parseInt(v, 10) || 0 : 0; };
    const fChk = id => { const el = f(id); return el ? (el.checked ? 1 : 0) : 0; };

    return {
      selected_venue_id:           state.selectedVenueId || null,
      selected_venue_name:         state.selectedVenueName || null,
      event_category:              fVal('f_event_category'),
      event_type:                  fVal('f_event_type'),
      target_audience:             fVal('f_target_audience'),
      language:                    fVal('f_language'),
      minimum_age:                 fInt('f_minimum_age'),
      event_date:                  fVal('f_event_date'),
      start_time:                  fVal('f_start_time'),
      event_duration_hours:        fNum('f_event_duration_hours'),
      registration_deadline:       fVal('f_registration_deadline'),
      country:                     fVal('f_country'),
      city:                        fVal('f_city'),
      indoor_outdoor:              fVal('f_indoor_outdoor'),
      distance_from_city_center_km: fNum('f_distance_from_city_center_km'),
      hall_capacity:               fInt('f_hall_capacity'),
      venue_cost:                  fNum('f_venue_cost'),
      venue_rating:                fNum('f_venue_rating'),
      parking_available:           fChk('f_parking_available'),
      air_conditioning:            fChk('f_air_conditioning'),
      accessibility:               fChk('f_accessibility'),
      ticket_price:                fNum('f_ticket_price'),
      vip_ticket_price:            fNum('f_vip_ticket_price'),
      early_bird_discount_pct:     fInt('f_early_bird_discount_pct'),
      group_discount_pct:          fInt('f_group_discount_pct'),
      marketing_budget:            fNum('f_marketing_budget'),
      facebook_budget:             fNum('f_facebook_budget'),
      instagram_budget:            fNum('f_instagram_budget'),
      tiktok_budget:               fNum('f_tiktok_budget'),
      google_budget:               fNum('f_google_budget'),
      influencer_budget:           fNum('f_influencer_budget'),
      free_food:                   fChk('f_free_food'),
      free_drinks:                 fChk('f_free_drinks'),
      networking_session:          fChk('f_networking_session'),
      certificates:                fChk('f_certificates'),
      giveaways:                   fChk('f_giveaways'),
      live_music:                  fChk('f_live_music'),
      number_of_speakers:          fInt('f_number_of_speakers'),
      celebrity_popularity_score:  fNum('f_celebrity_popularity_score'),
      competing_events_nearby:     fInt('f_competing_events_nearby'),
      competition_strength:        fVal('f_competition_strength'),
      weather_override:            fVal('f_weather_override') || null,
    };
  }

  // ── Unsaved changes indicator ─────────────────────────────
  let isFormDirty = false;
  function setUnsavedChanges(dirty) {
    isFormDirty = dirty;
    if (unsavedBadge) {
      unsavedBadge.style.display = dirty ? 'inline-flex' : 'none';
    }
  }

  // ── Apply Defaults ─────────────────────────────────────────
  function applyDefaultFields() {
    const defaults = {
      'minimum_age': '0',
      'event_duration_hours': '3',
      'country': 'Egypt',
      'language': 'Arabic',
      'start_time': '18:00',
      'venue_rating': '3.5',
      'ticket_price': '0',
      'vip_ticket_price': '0',
      'early_bird_discount_pct': '0',
      'group_discount_pct': '0',
      'number_of_speakers': '1',
      'celebrity_popularity_score': '0',
      'competing_events_nearby': '0',
      'competition_strength': 'Medium',
      'facebook_budget': '0',
      'instagram_budget': '0',
      'tiktok_budget': '0',
      'google_budget': '0',
      'influencer_budget': '0',
      'marketing_budget': '0',
      'indoor_outdoor': 'Indoor'
    };
    
    Object.entries(defaults).forEach(([field, val]) => {
      const el = document.getElementById('f_' + field);
      if (el) {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = val;
      }
    });

    const earlyVal = document.getElementById('early_bird_val');
    if (earlyVal) earlyVal.textContent = '0%';
    const groupVal = document.getElementById('group_disc_val');
    if (groupVal) groupVal.textContent = '0%';
  }

  // ── Validation ────────────────────────────────────────────
  function validateField(id, val) {
    const errSpan = document.getElementById('err_' + id);
    if (!errSpan) return true;
    errSpan.textContent = ''; // Clear error
    
    const required = ['f_event_category', 'f_event_type', 'f_target_audience', 'f_event_date', 'f_start_time', 'f_city', 'f_hall_capacity', 'f_ticket_price'];
    if (required.includes(id) && (!val || String(val).trim() === '')) {
      errSpan.textContent = 'This field is required.';
      return false;
    }
    
    const num = parseFloat(val);
    if (id === 'f_minimum_age') {
      if (isNaN(num) || num < 0 || num > 100) {
        errSpan.textContent = 'Minimum age must be between 0 and 100.';
        return false;
      }
    }
    if (id === 'f_event_duration_hours') {
      if (isNaN(num) || num < 0.5 || num > 72) {
        errSpan.textContent = 'Duration must be between 0.5 and 72 hours.';
        return false;
      }
    }
    if (id === 'f_hall_capacity') {
      if (isNaN(num) || num < 1 || num > 100000) {
        errSpan.textContent = 'Capacity must be between 1 and 100,000.';
        return false;
      }
    }
    if (id === 'f_venue_rating') {
      if (isNaN(num) || num < 1 || num > 5) {
        errSpan.textContent = 'Rating must be between 1.0 and 5.0 stars.';
        return false;
      }
    }
    if (['f_venue_cost', 'f_ticket_price', 'f_vip_ticket_price', 'f_marketing_budget', 'f_facebook_budget', 'f_instagram_budget', 'f_tiktok_budget', 'f_google_budget', 'f_influencer_budget', 'f_number_of_speakers', 'f_celebrity_popularity_score', 'f_competing_events_nearby', 'f_distance_from_city_center_km'].includes(id)) {
      if (isNaN(num) || num < 0) {
        errSpan.textContent = 'Cannot be negative.';
        return false;
      }
    }
    if (id === 'f_celebrity_popularity_score' && num > 100) {
      errSpan.textContent = 'Fame score must be between 0 and 100.';
      return false;
    }
    
    if (id === 'f_event_date') {
      const today = new Date();
      today.setHours(0,0,0,0);
      const evtD = new Date(val);
      if (evtD < today) {
        errSpan.textContent = 'Event date cannot be in the past.';
        return false;
      }
    }
    if (id === 'f_registration_deadline' && val) {
      const evtDateVal = document.getElementById('f_event_date').value;
      if (evtDateVal) {
        const evtD = new Date(evtDateVal);
        const regD = new Date(val);
        if (regD > evtD) {
          errSpan.textContent = 'Deadline must be on or before the event date.';
          return false;
        }
      }
    }
    return true;
  }

  function validateMarketingBudgets() {
    const totalInput = document.getElementById('f_marketing_budget');
    const total = parseFloat(totalInput?.value) || 0;
    
    const fb = parseFloat(document.getElementById('f_facebook_budget')?.value) || 0;
    const ig = parseFloat(document.getElementById('f_instagram_budget')?.value) || 0;
    const tt = parseFloat(document.getElementById('f_tiktok_budget')?.value) || 0;
    const gg = parseFloat(document.getElementById('f_google_budget')?.value) || 0;
    const inf = parseFloat(document.getElementById('f_influencer_budget')?.value) || 0;
    
    const allocated = fb + ig + tt + gg + inf;
    const budgetAllocatedEl = document.getElementById('budgetAllocated');
    const errSpan = document.getElementById('err_f_marketing_budget');
    
    if (budgetAllocatedEl) {
      budgetAllocatedEl.textContent = `Allocated: ${allocated.toLocaleString()} / ${total.toLocaleString()} EGP`;
      if (allocated > total) {
        budgetAllocatedEl.classList.add('nd-budget-warning');
        if (errSpan) errSpan.textContent = 'Allocated budget exceeds total marketing budget.';
      } else {
        budgetAllocatedEl.classList.remove('nd-budget-warning');
        if (errSpan && errSpan.textContent === 'Allocated budget exceeds total marketing budget.') {
          errSpan.textContent = '';
        }
      }
    }
  }

  // ── Derived Data Panel ─────────────────────────────────────
  function updateDerivedDataPanel() {
    const dateVal = document.getElementById('f_event_date')?.value;
    const regVal = document.getElementById('f_registration_deadline')?.value;
    const ticketVal = parseFloat(document.getElementById('f_ticket_price')?.value) || 0;
    const vipVal = parseFloat(document.getElementById('f_vip_ticket_price')?.value) || 0;
    
    if (!dateVal) {
      if (ndDerivedPanel) {
        ndDerivedPanel.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);margin:0;">Enter event date to view derived parameters.</p>';
      }
      return;
    }
    
    const d = new Date(dateVal);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const month = d.getMonth() + 1;
    const dayOfWeekName = dayNames[d.getDay()];
    const isWeekend = d.getDay() === 5 || d.getDay() === 6; // Fri/Sat Egypt
    
    let season;
    if ([12, 1, 2].includes(month)) season = 'Winter ❄️';
    else if ([3, 4, 5].includes(month)) season = 'Spring 🌸';
    else if ([6, 7, 8].includes(month)) season = 'Summer ☀️';
    else season = 'Fall 🍂';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysToEvent = Math.max(0, Math.round((d - today) / 86400000));
    
    let daysToDeadline = 'N/A';
    if (regVal) {
      const regD = new Date(regVal);
      daysToDeadline = Math.max(0, Math.round((regD - today) / 86400000)) + ' day(s)';
    }
    
    const weatherMap = { 1: 'Cold', 2: 'Cold', 3: 'Sunny', 4: 'Sunny', 5: 'Hot', 6: 'Hot',
                          7: 'Hot', 8: 'Hot', 9: 'Sunny', 10: 'Sunny', 11: 'Cold', 12: 'Cold' };
    const tempMap = { 1: 15, 2: 16, 3: 20, 4: 24, 5: 30, 6: 35,
                       7: 36, 8: 35, 9: 30, 10: 25, 11: 20, 12: 16 };
                       
    const override = document.getElementById('f_weather_override')?.value;
    const weather = override || weatherMap[month] || 'Sunny';
    const temp = tempMap[month] || 25;
    
    let vipRatio = 0;
    if (ticketVal > 0 || vipVal > 0) {
      vipRatio = parseFloat((vipVal / (ticketVal + vipVal)).toFixed(4));
    }
    
    const rows = [
      ['Month', `${monthNames[d.getMonth()]} (Month ${month})`],
      ['Day of Week', dayOfWeekName],
      ['Egyptian Weekend', isWeekend ? '✅ Yes (Fri/Sat)' : '— No'],
      ['Derived Season', season],
      ['Days to Event', `${daysToEvent} day(s)`],
      ['Days to Reg Deadline', daysToDeadline],
      ['VIP Ticket Ratio', `${(vipRatio * 100).toFixed(2)}%`],
      ['Weather Forecast', weather],
      ['Expected Temp', `${temp}°C`]
    ];
    
    if (ndDerivedPanel) {
      ndDerivedPanel.innerHTML = rows.map(([k, v]) =>
        `<div class="nd-autofill-row">
          <span class="nd-af-key">${escHtml(k)}</span>
          <span class="nd-af-val">${escHtml(String(v))}</span>
        </div>`
      ).join('');
    }
  }

  // ── Setup Live Form Logic ──────────────────────────────────
  function setupLiveFormLogic() {
    const formFields = ndForm.querySelectorAll('input, select, textarea');
    formFields.forEach(el => {
      el.addEventListener('change', () => {
        validateField(el.id, el.value);
        updateDerivedDataPanel();
        validateMarketingBudgets();
        setUnsavedChanges(true);
      });
      el.addEventListener('input', () => {
        validateField(el.id, el.value);
        updateDerivedDataPanel();
        validateMarketingBudgets();
        setUnsavedChanges(true);
      });
      el.addEventListener('blur', async () => {
        validateField(el.id, el.value);
        if (isFormDirty) {
          await autoSaveDraft();
        }
      });
    });
  }

  // ── Auto-Save Logic ────────────────────────────────────────
  let autoSaveInterval;
  function startAutoSave() {
    autoSaveInterval = setInterval(async () => {
      if (isFormDirty) {
        await autoSaveDraft();
      }
    }, 30000);
  }

  async function autoSaveDraft() {
    try {
      const ml_fields = collectMlFields();
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}/ml-fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ml_fields }),
      });
      const data = await resp.json();
      if (data.success) {
        setUnsavedChanges(false);
      }
    } catch (e) {
      // Fail silently
    }
  }

  // ── Populate form from saved snapshot ─────────────────────
  function populateForm(cat1) {
    if (!cat1) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el || val === null || val === undefined) return;
      if (el.type === 'checkbox') el.checked = Boolean(Number(val));
      else el.value = val;
    };
    const fields = [
      'event_category','event_type','target_audience','language',
      'minimum_age','event_date','start_time','event_duration_hours',
      'registration_deadline','country','city','indoor_outdoor',
      'distance_from_city_center_km','hall_capacity','venue_cost','venue_rating',
      'ticket_price','vip_ticket_price','early_bird_discount_pct','group_discount_pct',
      'marketing_budget','facebook_budget','instagram_budget','tiktok_budget',
      'google_budget','influencer_budget','number_of_speakers',
      'celebrity_popularity_score','competing_events_nearby','competition_strength',
      'weather_override',
    ];
    fields.forEach(k => set('f_' + k, cat1[k]));

    // Checkboxes
    ['parking_available','air_conditioning','accessibility',
     'free_food','free_drinks','networking_session',
     'certificates','giveaways','live_music'].forEach(k => set('f_' + k, cat1[k]));

    // Slider labels
    const earlyEl = document.getElementById('f_early_bird_discount_pct');
    if (earlyEl) document.getElementById('early_bird_val').textContent = (earlyEl.value || 0) + '%';
    const groupEl = document.getElementById('f_group_discount_pct');
    if (groupEl) document.getElementById('group_disc_val').textContent = (groupEl.value || 0) + '%';

    // Populate state venue values
    state.selectedVenueId = cat1.selected_venue_id || null;
    state.selectedVenueName = cat1.selected_venue_name || null;
    
    if (state.selectedVenueId) {
      selectedVenueName.textContent = state.selectedVenueName || 'Venue Selected';
      selectedVenueDetails.textContent = `Auto-populated capacity, cost, and features from selected venue.`;
      selectedVenueBanner.style.display = 'flex';
    } else {
      selectedVenueBanner.style.display = 'none';
    }
  }

  // ── Render auto-fill panel ────────────────────────────────
  function renderAutoFill(stats) {
    if (!stats || !Object.keys(stats).length) {
      ndAutoFillPanel.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);">Could not fetch organizer data.</p>';
      return;
    }
    const rows = [
      ['Organizer Rating',      (Number(stats.organizer_rating || 0).toFixed(1)) + ' ★'],
      ['Organizer Tier',        stats.organizer_tier || 'Newcomer'],
      ['Experience',            (stats.organizer_experience || 0) + ' yr(s)'],
      ['Previous Events',       stats.previous_events ?? 0],
      ['Success Rate',          (((stats.previous_success_rate || 0) * 100).toFixed(0)) + '%'],
      ['Followers',             stats.followers_count ?? 0],
      ['Verified',              stats.verified_organizer ? '✅ Yes' : '— No'],
    ];
    ndAutoFillPanel.innerHTML = rows.map(([k, v]) =>
      `<div class="nd-autofill-row">
        <span class="nd-af-key">${escHtml(k)}</span>
        <span class="nd-af-val">${escHtml(String(v))}</span>
      </div>`
    ).join('');
  }

  // ── Render prediction result ──────────────────────────────
  function renderResult(pred) {
    if (!pred) { ndResultArea.innerHTML = ''; return; }

    // Determine risk level
    const rawRisk = (pred.risk_level || pred.decision || '').toLowerCase();
    let riskClass = 'medium';
    let riskLabel = '⚡ Medium Risk';
    let glowClass = 'warn-glow';
    if (rawRisk === 'low' || rawRisk === 'accepted') {
      riskClass = 'low'; riskLabel = '✅ Low Risk'; glowClass = 'success-glow';
    } else if (rawRisk === 'high' || rawRisk === 'rejected') {
      riskClass = 'high'; riskLabel = '⚠ High Risk'; glowClass = 'danger-glow';
    }

    // Score (0-100 or 0-1 normalized)
    let score = pred.success_score !== undefined ? pred.success_score
      : (pred.success_probability !== undefined ? pred.success_probability : null);
    let scoreDisplay = '—';
    let barWidth = '0%';
    if (score !== null) {
      if (score <= 1) score = Math.round(score * 100);
      score = Math.min(100, Math.max(0, score));
      scoreDisplay = score + '%';
      barWidth = score + '%';
    }

    // Reasons
    const reasons = Array.isArray(pred.reasons) ? pred.reasons : [];
    const reasonsHtml = reasons.length ? `
      <div>
        <div class="nd-section-title" style="font-size:0.7rem;margin-bottom:10px;">Key Factors</div>
        <ul class="nd-reasons-list">
          ${reasons.map(r => `<li>${escHtml(r)}</li>`).join('')}
        </ul>
      </div>` : '';

    // Timestamp
    const ts = pred.timestamp ? `<p style="font-size:0.75rem;color:var(--muted);margin-top:8px;">
      Last run: ${escHtml(new Date(pred.timestamp).toLocaleString())}
    </p>` : '';

    // Attendance estimate (legacy field from predict_service)
    const attendanceRow = pred.expected_visitor_count !== undefined ? `
      <div class="nd-autofill-row" style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.07);margin-top:4px;">
        <span class="nd-af-key" style="font-size:0.8rem;">Est. Visitors</span>
        <span class="nd-af-val" style="font-size:0.88rem;">${Math.round(pred.expected_visitor_count).toLocaleString()}</span>
      </div>` : '';

    ndResultArea.innerHTML = `
      <div class="nd-result-card ${glowClass}">
        <div class="nd-result-title">&#129302; Prediction Result</div>
        <span class="nd-risk-badge ${riskClass}">${riskLabel}</span>
        <div>
          <div class="nd-score-row">
            <span class="nd-score-label">Success Score</span>
            <span class="nd-score-value">${scoreDisplay}</span>
          </div>
          <div class="nd-score-bar-wrap">
            <div class="nd-score-bar" style="width:0%" id="ndScoreBar"></div>
          </div>
        </div>
        ${attendanceRow}
        ${reasonsHtml}
        ${ts}
      </div>`;

    // Animate bar after render
    requestAnimationFrame(() => {
      const bar = document.getElementById('ndScoreBar');
      if (bar) setTimeout(() => { bar.style.width = barWidth; }, 80);
    });
  }

  // ── Validation ────────────────────────────────────────────
  function validateFields(ml) {
    const required = ['event_category','event_type','target_audience','event_date','start_time','city','hall_capacity','ticket_price'];
    for (const k of required) {
      if (!ml[k] && ml[k] !== 0) return `"${k.replace(/_/g,' ')}" is required before running the prediction.`;
    }
    if (!ml.event_date) return 'Event Date is required.';
    return null;
  }

  // ── Save draft ────────────────────────────────────────────
  async function saveDraft() {
    ndSaveBtn.disabled = true;
    ndSaveBtn.textContent = '💾 Saving…';
    try {
      const ml_fields = collectMlFields();
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}/ml-fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ml_fields }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast('Draft saved.', 'success');
        setUnsavedChanges(false);
      }
      else showToast(data.message || 'Save failed.', 'error');
    } catch (e) {
      showToast('Network error. Try again.', 'error');
    } finally {
      ndSaveBtn.disabled = false;
      ndSaveBtn.textContent = '💾 Save Draft (no prediction)';
    }
  }

  // ── Run prediction ────────────────────────────────────────
  async function runPrediction() {
    const ml_fields = collectMlFields();
    const validationErr = validateFields(ml_fields);
    if (validationErr) { showToast(validationErr, 'error'); return; }

    ndRunBtn.disabled = true;
    ndRunBtn.innerHTML = '<span style="animation:spin 0.8s linear infinite;display:inline-block;">&#9696;</span> Running…';
    ndResultArea.innerHTML = `
      <div class="nd-result-card" style="gap:12px;">
        <div class="nd-result-title">&#129302; Running prediction…</div>
        <div class="nd-skeleton" style="height:36px;border-radius:999px;width:55%;"></div>
        <div class="nd-skeleton" style="height:14px;width:80%;"></div>
        <div class="nd-skeleton" style="height:14px;width:65%;"></div>
      </div>`;

    try {
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ml_fields }),
      });
      const data = await resp.json();
      if (data.success && data.prediction) {
        renderResult(data.prediction);
        showToast('Prediction complete!', 'success');
        setUnsavedChanges(false);
      } else {
        const msg = data.message || 'Prediction failed.';
        ndResultArea.innerHTML = `<div class="nd-error-box">&#9888; ${escHtml(msg)}${data.detail ? '<br/><small>' + escHtml(data.detail) + '</small>' : ''}</div>`;
        showToast(msg, 'error');
      }
    } catch (e) {
      ndResultArea.innerHTML = `<div class="nd-error-box">&#9888; Network error. Make sure the prediction service is running.</div>`;
      showToast('Network error.', 'error');
    } finally {
      ndRunBtn.disabled = false;
      ndRunBtn.innerHTML = '<span>&#129302;</span> Run Prediction';
    }
  }

  // ── Fetch organizer stats ─────────────────────────────────
  async function fetchAutoFill() {
    try {
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}/organizer-stats`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (data.success && data.stats) renderAutoFill(data.stats);
      else renderAutoFill(null);
    } catch {
      renderAutoFill(null);
    }
  }

  // ── Load notebook ─────────────────────────────────────────
  async function loadNotebook() {
    try {
      const resp = await fetch(`${API_BASE}/notebooks/${NOTEBOOK_ID}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await resp.json();
      if (!data.success || !data.notebook) {
        ndLoadingState.innerHTML = `<div class="nd-error-box">Notebook not found or you don't have permission to access it.</div>`;
        return;
      }
      const nb = data.notebook;

      // Update page title
      ndTitle.textContent = '📓 ' + nb.name;
      document.title = `Notebook: ${nb.name} | Elshaboury Events`;
      if (nb.description) {
        ndDesc.textContent = nb.description;
        ndDesc.style.display = '';
      }

      // Pre-populate from saved ml_fields or use defaults
      const cat1 = nb.ml_fields && nb.ml_fields.category1 ? nb.ml_fields.category1 : null;
      if (cat1) {
        populateForm(cat1);
      } else {
        applyDefaultFields();
      }

      // Initialize live panels & validations
      updateDerivedDataPanel();
      validateMarketingBudgets();
      setupLiveFormLogic();
      startAutoSave();

      // Show last prediction if any
      if (nb.last_prediction) renderResult(nb.last_prediction);

      // Fetch auto-fill data in background
      fetchAutoFill();

      // Determine starting step
      ndLoadingState.style.display = 'none';
      if (cat1 && (cat1.selected_venue_id || cat1.city || cat1.hall_capacity)) {
        // Already populated form, skip directly to Step 2
        setStep(1, true);
      } else {
        // New template, start on Step 1
        setStep(0, true);
        loadVenues();
      }

    } catch (err) {
      ndLoadingState.innerHTML = `<div class="nd-error-box">Failed to load notebook. Check your connection.</div>`;
    }
  }

  // ── Wire Carousel Event Delegation ─────────────────────────
  if (vCarousel) {
    vCarousel.addEventListener('scroll', updateVenueCarouselUI, { passive: true });
    vCarousel.addEventListener('click', (e) => {
      const card = e.target.closest('.v-card');
      const btnView = e.target.closest('.v-card-btn-view');
      
      if (btnView) {
        e.stopPropagation();
        const vId = btnView.closest('.v-card').dataset.id;
        showVenueQuickView(vId);
        return;
      }
      
      if (card) {
        const vId = card.dataset.id;
        const vName = card.querySelector('.v-card-name').textContent;
        selectVenue(vId, vName);
      }
    });
  }

  // ── Wire Step Navigation Buttons ──────────────────────────
  if (vCarouselPrev) {
    vCarouselPrev.addEventListener('click', () => scrollVenueCarousel(-1));
  }

  if (vCarouselNext) {
    vCarouselNext.addEventListener('click', () => scrollVenueCarousel(1));
  }

  window.addEventListener('resize', updateVenueCarouselUI);

  if (btnUseVenue) {
    btnUseVenue.addEventListener('click', async () => {
      if (!state.selectedVenueId) return;
      btnUseVenue.disabled = true;
      btnUseVenue.textContent = 'Applying...';
      
      await applyVenueDetailsToForm(state.selectedVenueId);
      
      btnUseVenue.disabled = false;
      btnUseVenue.textContent = 'Use Selected Venue & Continue →';
      setStep(1);
    });
  }

  if (btnSkipVenue) {
    btnSkipVenue.addEventListener('click', () => {
      state.selectedVenueId = null;
      state.selectedVenueName = null;
      selectedVenueBanner.style.display = 'none';
      
      // Clear values pre-filled from earlier picks
      document.getElementById('f_hall_capacity').value = 100;
      document.getElementById('f_venue_cost').value = 0;
      document.getElementById('f_venue_rating').value = 3.5;
      
      setStep(1);
    });
  }

  if (btnChangeVenue) {
    btnChangeVenue.addEventListener('click', () => {
      setStep(0);
      loadVenues();
    });
  }

  // ── Wire Step Indicators click events ─────────────────────
  if (stepIndicator0) {
    stepIndicator0.addEventListener('click', () => {
      if (state.currentStep !== 0) {
        setStep(0);
        loadVenues();
      }
    });
  }

  if (stepIndicator1) {
    stepIndicator1.addEventListener('click', () => {
      if (state.currentStep !== 1) {
        setStep(1);
      }
    });
  }

  // ── Wire Filters ──────────────────────────────────────────
  if (vFilterGovernorate) vFilterGovernorate.addEventListener('change', loadVenues);
  
  let searchTmr;
  if (vFilterSearch) {
    vFilterSearch.addEventListener('input', () => {
      clearTimeout(searchTmr);
      searchTmr = setTimeout(loadVenues, 350);
    });
  }

  // ── Wire Details Modal Closers ────────────────────────────
  if (btnCloseVModal) btnCloseVModal.addEventListener('click', closeVModal);
  if (btnCloseVModalCancel) btnCloseVModalCancel.addEventListener('click', closeVModal);
  if (venueDetailsModal) {
    venueDetailsModal.addEventListener('click', (e) => {
      if (e.target === venueDetailsModal) closeVModal();
    });
  }

  // ── Wire Edit Identity Modal ──────────────────────────────
  if (btnEditIdentity) btnEditIdentity.addEventListener('click', openEditModal);
  if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditModal);
  if (btnCancelEditModal) btnCancelEditModal.addEventListener('click', closeEditModal);
  if (btnConfirmEdit) btnConfirmEdit.addEventListener('click', saveIdentity);
  if (editIdentityModal) {
    editIdentityModal.addEventListener('click', (e) => {
      if (e.target === editIdentityModal) closeEditModal();
    });
  }
  if (editNbName) {
    editNbName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveIdentity(); }
    });
  }

  // ── Wire buttons ─────────────────────────────────────────
  if (ndRunBtn)  ndRunBtn.addEventListener('click', runPrediction);
  if (ndSaveBtn) ndSaveBtn.addEventListener('click', saveDraft);

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', loadNotebook);

  // Add a CSS spin animation dynamically for the loading spinner
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
})();
