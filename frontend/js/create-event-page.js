(function () {
  const STEP_DETAILS = ['Event Format', 'Basic Info', 'Time & Location', 'Ticketing', 'Agenda & Host'];
  const TOTAL_STEPS = STEP_DETAILS.length;
  const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';

  const CATEGORY_META = {
    conference_hall: { label: 'Conference Hall', icon: '&#127970;', shortIcon: '&#127970;', gradient: 'linear-gradient(135deg, #0c4f59, #13808f)' },
    wedding_hall: { label: 'Wedding Hall', icon: '&#128145;', shortIcon: '&#128141;', gradient: 'linear-gradient(135deg, #7a4d20, #d99a52)' },
    outdoor_garden: { label: 'Outdoor Garden', icon: '&#127807;', shortIcon: '&#127807;', gradient: 'linear-gradient(135deg, #22553d, #4aa36f)' },
    rooftop: { label: 'Rooftop', icon: '&#127747;', shortIcon: '&#127747;', gradient: 'linear-gradient(135deg, #15384f, #2f6da5)' },
    theater: { label: 'Theater', icon: '&#127917;', shortIcon: '&#127917;', gradient: 'linear-gradient(135deg, #3f1f4f, #8f5cc5)' },
    sports_hall: { label: 'Sports Hall', icon: '&#9917;', shortIcon: '&#9917;', gradient: 'linear-gradient(135deg, #14532d, #22c55e)' },
    hotel_ballroom: { label: 'Hotel Ballroom', icon: '&#127976;', shortIcon: '&#127976;', gradient: 'linear-gradient(135deg, #21435b, #5293d1)' },
    art_gallery: { label: 'Art Gallery', icon: '&#127912;', shortIcon: '&#127912;', gradient: 'linear-gradient(135deg, #4c1d95, #7c3aed)' },
    beach_venue: { label: 'Beach Venue', icon: '&#127965;', shortIcon: '&#127965;', gradient: 'linear-gradient(135deg, #0c6e84, #1cb4c9)' },
    private_villa: { label: 'Private Villa', icon: '&#127969;', shortIcon: '&#127969;', gradient: 'linear-gradient(135deg, #5f4b32, #b18a54)' }
  };

  const GOVERNORATE_OPTIONS = [
    'Alexandria',
    'Aswan',
    'Asyut',
    'Beheira',
    'Beni Suef',
    'Cairo',
    'Dakahlia',
    'Damietta',
    'Fayoum',
    'Gharbia',
    'Giza',
    'Hurghada',
    'Ismailia',
    'Kafr El Sheikh',
    'Luxor',
    'Mansoura',
    'Minya',
    'Monufia',
    'Port Said',
    'Qena',
    'Sharm El Sheikh',
    'Sharqia',
    'Sohag',
    'Suez',
    'Tanta',
    'Zagazig'
  ];

  const DEFAULT_CAPACITY_MIN = 50;
  const DEFAULT_PRICE_MIN = 2000;
  const DEFAULT_PRICE_MAX = 15000;
  const GOVERNORATE_ALIASES = {
    faiyum: 'Fayoum',
    fayoum: 'Fayoum',
    'red sea': 'Hurghada',
    'south sinai': 'Sharm El Sheikh',
    asyout: 'Asyut',
    'beni sueif': 'Beni Suef',
    monofia: 'Monufia',
    menoufia: 'Monufia',
    sharqiya: 'Sharqia'
  };

  const AMENITY_META = {
    parking: { label: 'Parking', icon: '&#128663;' },
    ac: { label: 'Air Conditioning', icon: '&#10052;' },
    stage: { label: 'Stage & Sound', icon: '&#127908;' },
    projector: { label: 'Projector & Screen', icon: '&#128250;' },
    catering: { label: 'Catering Available', icon: '&#127869;' },
    wheelchair: { label: 'Wheelchair Accessible', icon: '&#9855;' },
    wifi: { label: 'High-Speed WiFi', icon: '&#128246;' },
    photography: { label: 'Photography Allowed', icon: '&#128247;' },
    metro: { label: 'Near Metro', icon: '&#128647;' },
    security: { label: '24/7 Security', icon: '&#128274;' }
  };

  const state = {
    currentStep: 0,
    venueType: null,
    selectedVenue: null,
    detailVenue: null,
    browseVenueResults: [],
    savedVenueResults: [],
    featuredVenues: [],
    venueSuggestions: [],
    activeVenueTab: 'browse',
    viewMode: 'grid',
    compareVenueIds: [],
    detailImageIndex: 0,
    map: null,
    marker: null,
    detailMap: null,
    detailMarker: null,
    activeCategory: null,
    activeAmenities: [],
    didLoadVenueCatalog: false,
    featuredAutoScrollDirection: 1,
    featuredAutoScrollTimer: null
  };

  const form = document.getElementById('createEventForm');
  if (!form) return;

  const sections = Array.from(form.querySelectorAll('.form-section'));
  const prevBtn = document.getElementById('prevStepBtn');
  const nextBtn = document.getElementById('nextStepBtn');
  const createBtn = document.getElementById('createEventBtn');
  const stepLabel = document.getElementById('stepLabel');
  const stepTitle = document.getElementById('stepTitle');
  const progressBar = document.getElementById('wizardProgressBar');
  const wizardSteps = Array.from(document.querySelectorAll('.wizard-step'));

  const ownVenueBtn = document.getElementById('ownVenueBtn');
  const browseVenueBtn = document.getElementById('browseVenueBtn');
  const onlineEventBtn = document.getElementById('onlineEventBtn');
  const venuePathNote = document.getElementById('venuePathNote');
  const venueSearchPanel = document.getElementById('venueSearchPanel');
  const venueSearchGovernorate = document.getElementById('venue-search-governorate');
  const venueSearchFeedback = document.getElementById('venueSearchFeedback');
  const venueSearchInput = document.getElementById('venue-search-input');
  const venueGrid = document.getElementById('venueGrid');
  const venueLoadingSkeleton = document.getElementById('venueLoadingSkeleton');
  const noVenuesState = document.getElementById('noVenuesState');
  const selectedVenueStrip = document.getElementById('selectedVenueStrip');
  const selectedVenueStripLabel = document.getElementById('selectedVenueStripLabel');
  const selectedVenueStripMeta = document.getElementById('selectedVenueStripMeta');
  const changeVenueSelectionBtn = document.getElementById('changeVenueSelectionBtn');
  const featuredVenuesShell = document.getElementById('featuredVenuesShell');
  const featuredVenuesRow = document.getElementById('featuredVenuesRow');
  const featuredPrevBtn = document.getElementById('featuredPrevBtn');
  const featuredNextBtn = document.getElementById('featuredNextBtn');
  const featuredDots = document.getElementById('featuredDots');
  const refreshFeaturedVenuesBtn = document.getElementById('refreshFeaturedVenuesBtn');
  const venueCategoryFilters = document.getElementById('venueCategoryFilters');
  const venueAmenitiesFilters = document.getElementById('venueAmenitiesFilters');
  const capacityMinRange = document.getElementById('capacityMinRange');
  const capacityFilterValue = document.getElementById('capacityFilterValue');
  const priceMinRange = document.getElementById('priceMinRange');
  const priceMaxRange = document.getElementById('priceMaxRange');
  const priceFilterValue = document.getElementById('priceFilterValue');
  const filterCountLabel = document.getElementById('filterCountLabel');
  const clearAllFiltersBtn = document.getElementById('clearAllFiltersBtn');
  const venueSortSelect = document.getElementById('venue-sort-select');
  const gridViewBtn = document.getElementById('gridViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');
  const allVenuesTab = document.getElementById('allVenuesTab');
  const savedVenuesTab = document.getElementById('savedVenuesTab');
  const venueSuggestionBanner = document.getElementById('venueSuggestionBanner');
  const venueSuggestionTitle = document.getElementById('venueSuggestionTitle');
  const venueSuggestionText = document.getElementById('venueSuggestionText');
  const venueSuggestionCards = document.getElementById('venueSuggestionCards');
  const basicInfoVenueSuggestions = document.getElementById('basicInfoVenueSuggestions');
  const basicSuggestionText = document.getElementById('basicSuggestionText');
  const basicSuggestionCards = document.getElementById('basicSuggestionCards');
  const resetCategoryBtn = document.getElementById('resetCategoryBtn');
  const resetAmenitiesBtn = document.getElementById('resetAmenitiesBtn');

  const compareBar = document.getElementById('compareBar');
  const compareBarLabel = document.getElementById('compareBarLabel');
  const compareBarText = document.getElementById('compareBarText');
  const clearCompareBtn = document.getElementById('clearCompareBtn');
  const openCompareModalBtn = document.getElementById('openCompareModalBtn');
  const compareModal = document.getElementById('compareModal');
  const closeCompareModalBtn = document.getElementById('closeCompareModalBtn');
  const compareTableWrap = document.getElementById('compareTableWrap');

  const venueQuickViewModal = document.getElementById('venueQuickViewModal');
  const closeVenueQuickViewBtn = document.getElementById('closeVenueQuickViewBtn');
  const venueModalHero = document.getElementById('venueModalHero');
  const venueModalDots = document.getElementById('venueModalDots');
  const venueModalDescription = document.getElementById('venueModalDescription');
  const venueModalAmenities = document.getElementById('venueModalAmenities');
  const venueModalAddress = document.getElementById('venueModalAddress');
  const venueModalReviews = document.getElementById('venueModalReviews');
  const venueDirectionsLink = document.getElementById('venueDirectionsLink');
  const venueOwnerProfileLink = document.getElementById('venueOwnerProfileLink');
  const venueModalCategoryBadge = document.getElementById('venueModalCategoryBadge');
  const venueModalRatingBadge = document.getElementById('venueModalRatingBadge');
  const venueModalName = document.getElementById('venueModalName');
  const venueModalLocationMeta = document.getElementById('venueModalLocationMeta');
  const venueAvailabilityBadge = document.getElementById('venueAvailabilityBadge');
  const venueCalendarLabel = document.getElementById('venueCalendarLabel');
  const venueCalendarGrid = document.getElementById('venueCalendarGrid');
  const venuePrice = document.getElementById('venuePrice');
  const venueHourlyRow = document.getElementById('venueHourlyRow');
  const venueHourlyPrice = document.getElementById('venueHourlyPrice');
  const venueMinimumHours = document.getElementById('venueMinimumHours');
  const venueCapacity = document.getElementById('venueCapacity');
  const seatCountStandard = document.getElementById('seatCountStandard');
  const seatCountSpecial = document.getElementById('seatCountSpecial');
  const seatCountVip = document.getElementById('seatCountVip');
  const confirmVenueSelectionBtn = document.getElementById('confirmVenueSelectionBtn');
  const toggleWishlistModalBtn = document.getElementById('toggleWishlistModalBtn');

  const eventDateInput = document.getElementById('event-date');
  const eventTimeInput = document.getElementById('event-time');
  const eventGovernorateSelect = document.getElementById('governorate');
  const eventTypeSelect = document.getElementById('event-type');
  const physicalLocationFields = Array.from(document.querySelectorAll('.physical-location-field'));
  const onlineEventFields = document.getElementById('onlineEventFields');
  const onlinePlatformSelect = document.getElementById('online-platform');
  const onlineTimezoneSelect = document.getElementById('online-timezone');
  const onlineUrlInput = document.getElementById('online-url');
  const onlineAccessInput = document.getElementById('online-access');
  const mapSearchWrap = document.getElementById('mapSearchWrap');
  const mapSearchInput = document.getElementById('mapSearchInput');
  const mapSearchBtn = document.getElementById('mapSearchBtn');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const mapCoordinates = document.getElementById('mapCoordinates');
  const venueAddressInput = document.getElementById('venue-address');
  const locationModeNote = document.getElementById('locationModeNote');
  const readonlyVenueCard = document.getElementById('readonlyVenueCard');
  const readonlyVenueName = document.getElementById('readonlyVenueName');
  const readonlyVenueLocation = document.getElementById('readonlyVenueLocation');
  const readonlyVenueCapacity = document.getElementById('readonlyVenueCapacity');

  const standardSeatsInput = document.getElementById('standard-seats');
  const specialSeatsInput = document.getElementById('special-seats');
  const vipSeatsInput = document.getElementById('vip-seats');
  const onlineAttendeesInput = document.getElementById('online-attendees');
  const ticketTierGrid = document.getElementById('ticketTierGrid');
  const onlineCapacityCard = document.getElementById('onlineCapacityCard');
  const totalCapacityPreview = document.getElementById('totalCapacityPreview');
  const totalCapacityMeta = document.getElementById('totalCapacityMeta');
  const ticketingModeNote = document.getElementById('ticketingModeNote');
  const priceStandardLabel = document.getElementById('priceStandardLabel');
  const priceSpecialGroup = document.getElementById('priceSpecialGroup');
  const priceVipGroup = document.getElementById('priceVipGroup');
  const priceSpecialInput = document.getElementById('price-special');
  const priceVipInput = document.getElementById('price-vip');

  const reviewModal = document.getElementById('reviewModal');
  const reviewSummary = document.getElementById('reviewSummary');
  const closeReviewModalBtn = document.getElementById('closeReviewModalBtn');
  const editEventBtn = document.getElementById('editEventBtn');
  const confirmCreateBtn = document.getElementById('confirmCreateBtn');
  const successOverlay = document.getElementById('successOverlay');

  function money(value, withDecimals = false) {
    return `${Number(value || 0).toLocaleString('en-US', withDecimals ? {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    } : {})} EGP`;
  }

  function shortDate(value) {
    if (!value) return 'Not selected';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toLocalDateInputValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function toLocalDateTimeInputValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${toLocalDateInputValue(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function getSelectedEventDateTime() {
    if (!eventDateInput.value || !eventTimeInput.value) return null;
    const date = new Date(`${eventDateInput.value}T${eventTimeInput.value}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // ── Venue Availability Check (double-booking prevention) ──────────────────
  const venueAvailState = { checked: false, isAvailable: true, checking: false };

  function getOrCreateAvailabilityBanner() {
    let banner = document.getElementById('venueAvailabilityWarning');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'venueAvailabilityWarning';
      Object.assign(banner.style, {
        display: 'none',
        marginTop: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: '600',
        borderLeft: '4px solid',
        backdropFilter: 'blur(8px)'
      });
      const dateGroup = eventDateInput.closest('.input-group') || eventDateInput.parentElement;
      if (dateGroup && dateGroup.parentElement) {
        dateGroup.parentElement.insertBefore(banner, dateGroup.nextSibling);
      }
    }
    return banner;
  }

  function showAvailabilityBanner(status, message) {
    const banner = getOrCreateAvailabilityBanner();
    if (status === 'checking') {
      Object.assign(banner.style, { display: 'block', background: 'rgba(14,165,233,0.1)', borderColor: '#0ea5e9', color: '#7dd3fc' });
      banner.textContent = '⏳ Checking venue availability...';
    } else if (status === 'available') {
      Object.assign(banner.style, { display: 'block', background: 'rgba(16,185,129,0.1)', borderColor: '#10b981', color: '#6ee7b7' });
      banner.textContent = '✅ ' + message;
    } else if (status === 'unavailable') {
      Object.assign(banner.style, { display: 'block', background: 'rgba(239,68,68,0.12)', borderColor: '#ef4444', color: '#fca5a5' });
      banner.textContent = '🚫 ' + message;
    } else {
      banner.style.display = 'none';
    }
  }

  function hideAvailabilityBanner() {
    const banner = document.getElementById('venueAvailabilityWarning');
    if (banner) banner.style.display = 'none';
  }

  async function checkVenueAvailability() {
    const btn = document.getElementById('nextStepBtn');
    if (state.venueType !== 'platform_booked' || !state.selectedVenue || !eventDateInput.value) {
      hideAvailabilityBanner();
      venueAvailState.checked = false;
      venueAvailState.isAvailable = true;
      if (btn) btn.disabled = false;
      return;
    }
    const venueId = state.selectedVenue.id;
    const date = eventDateInput.value;
    venueAvailState.checking = true;
    venueAvailState.checked = false;
    showAvailabilityBanner('checking');
    if (btn) btn.disabled = true;
    try {
      const resp = await fetch(`${API_BASE}/venues/${venueId}/check-availability?date=${encodeURIComponent(date)}`);
      if (!resp.ok) throw new Error('Network error');
      const data = await resp.json();
      venueAvailState.checking = false;
      venueAvailState.checked = true;
      if (data.isAvailable) {
        venueAvailState.isAvailable = true;
        showAvailabilityBanner('available', `${state.selectedVenue.name} is available on ${date}`);
        if (btn) btn.disabled = false;
      } else {
        venueAvailState.isAvailable = false;
        let reason = 'This venue is already booked on the selected date. Please choose a different date or select another venue.';
        if (data.isBlockedManually) {
          reason = `This venue is blocked on ${date}${data.conflictingBlock && data.conflictingBlock.reason ? ' (' + data.conflictingBlock.reason + ')' : ''}. Please choose a different date or select another venue.`;
        }
        showAvailabilityBanner('unavailable', reason);
        if (btn) btn.disabled = true;
      }
    } catch (err) {
      console.error(err);
      venueAvailState.checking = false;
      venueAvailState.checked = false;
      venueAvailState.isAvailable = true;
      hideAvailabilityBanner();
      if (btn) btn.disabled = false;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeGovernorateName(value) {
    const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return '';
    return GOVERNORATE_ALIASES[cleaned.toLowerCase()] || cleaned;
  }

  function listingFee(totalSeats) {
    const seats = Math.max(0, Number(totalSeats || 0));
    if (seats <= 500) return { tier: 'Small', fee: 5000 };
    if (seats <= 1000) return { tier: 'Medium', fee: 8000 };
    return { tier: 'Large', fee: 12000 };
  }

  function seatTotals() {
    if (state.venueType === 'online') {
      const attendees = Math.max(0, Number(onlineAttendeesInput.value || 0));
      return { standard: attendees, special: 0, vip: 0, total: attendees };
    }
    const standard = Math.max(0, Number(standardSeatsInput.value || 0));
    const special = Math.max(0, Number(specialSeatsInput.value || 0));
    const vip = Math.max(0, Number(vipSeatsInput.value || 0));
    return { standard, special, vip, total: standard + special + vip };
  }

  function updateCapacityUI() {
    const totals = seatTotals();
    const fee = listingFee(totals.total);
    const unit = state.venueType === 'online' ? 'attendees' : 'seats';
    totalCapacityPreview.textContent = `${totals.total.toLocaleString('en-US')} total ${unit}`;
    totalCapacityMeta.textContent = totals.total > 0
      ? `Listing fee tier: ${fee.tier} · ${money(fee.fee)}`
      : state.venueType === 'online'
        ? 'Add attendee capacity to calculate capacity and listing fee.'
        : 'Add seat quantities to calculate capacity and listing fee.';
  }

  function sectionsForStep(step) {
    return sections.filter((section) => Number(section.dataset.step) === step);
  }

  function setMarker(lat, lng, zoom) {
    const point = L.latLng(lat, lng);
    if (state.marker) {
      state.marker.setLatLng(point);
    } else {
      state.marker = L.marker(point).addTo(state.map);
    }
    state.map.setView(point, zoom || 13);
    latInput.value = Number(lat).toFixed(6);
    lngInput.value = Number(lng).toFixed(6);
    mapCoordinates.textContent = `Selected coordinates: ${latInput.value}, ${lngInput.value}`;
  }

  function initMap() {
    state.map = L.map('map').setView([26.8206, 30.8025], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
    state.map.on('click', (event) => {
      if (state.venueType === 'platform_booked') return;
      setMarker(event.latlng.lat, event.latlng.lng);
    });
  }

  function renderDetailMap(venue) {
    const container = document.getElementById('venueDetailMap');
    if (!container || !venue) return;
    if (!state.detailMap) {
      state.detailMap = L.map(container).setView([venue.latitude || 26.8206, venue.longitude || 30.8025], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(state.detailMap);
    }
    const point = L.latLng(Number(venue.latitude || 26.8206), Number(venue.longitude || 30.8025));
    if (state.detailMarker) {
      state.detailMarker.setLatLng(point);
    } else {
      state.detailMarker = L.marker(point).addTo(state.detailMap);
    }
    state.detailMap.setView(point, 14);
    window.setTimeout(() => state.detailMap.invalidateSize(), 120);
  }

  async function searchMapLocation() {
    const query = mapSearchInput.value.trim();
    if (!query || state.venueType === 'platform_booked') return;
    mapSearchBtn.disabled = true;
    mapSearchBtn.textContent = 'Searching...';
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=eg&q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) {
        window.alert('Location not found. Try a more specific search.');
        return;
      }
      setMarker(Number(data[0].lat), Number(data[0].lon));
    } catch (error) {
      console.error('Map search failed:', error);
      window.alert('Could not search the map right now.');
    } finally {
      mapSearchBtn.disabled = false;
      mapSearchBtn.textContent = 'Search';
    }
  }

  function updateWizard() {
    sections.forEach((section) => {
      const visible = Number(section.dataset.step) === state.currentStep;
      section.classList.toggle('step-hidden', !visible);
      section.classList.toggle('step-visible', visible);
    });

    wizardSteps.forEach((item, index) => {
      const label = state.venueType === 'online' && index === 2 ? 'Time & Access' : STEP_DETAILS[index];
      const labelNode = item.querySelector('.wizard-step-text');
      if (labelNode) labelNode.textContent = label;
      item.classList.toggle('active', index === state.currentStep);
      item.classList.toggle('completed', index < state.currentStep);
    });

    stepLabel.textContent = `Step ${state.currentStep + 1} of ${TOTAL_STEPS}`;
    const currentStepTitle = state.venueType === 'online' && state.currentStep === 2
      ? 'Time & Access'
      : STEP_DETAILS[state.currentStep];
    stepTitle.textContent = currentStepTitle;
    progressBar.style.width = `${(state.currentStep / (TOTAL_STEPS - 1)) * 100}%`;
    prevBtn.style.visibility = state.currentStep === 0 ? 'hidden' : 'visible';
    nextBtn.hidden = state.currentStep === TOTAL_STEPS - 1;
    createBtn.hidden = state.currentStep !== TOTAL_STEPS - 1;
    form.classList.toggle('single-step', sectionsForStep(state.currentStep).length === 1);

    if (state.currentStep === 2 && state.map) window.setTimeout(() => state.map.invalidateSize(), 120);
    if (state.currentStep === 0 && state.detailMap) window.setTimeout(() => state.detailMap.invalidateSize(), 120);
  }

  function setStep(step) {
    state.currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, step));
    updateWizard();
  }

  function currentRawVenueResults() {
    return state.activeVenueTab === 'saved' ? state.savedVenueResults : state.browseVenueResults;
  }

  function filteredBrowseVenueResults() {
    return sortVenues(state.browseVenueResults.filter(venueMatchesFilters));
  }

  function filteredSavedVenueResults() {
    return sortVenues(state.savedVenueResults.filter(venueMatchesFilters));
  }

  function filteredFeaturedVenueResults() {
    return sortVenues(state.featuredVenues.filter(venueMatchesFilters));
  }

  function venueMatchesFilters(venue) {
    const governorate = normalizeGovernorateName(venueSearchGovernorate.value);
    const searchValue = venueSearchInput.value.trim().toLowerCase();
    const capacityMin = Number(capacityMinRange.value || DEFAULT_CAPACITY_MIN);
    const priceMin = Number(priceMinRange.value || DEFAULT_PRICE_MIN);
    const priceMax = Number(priceMaxRange.value || DEFAULT_PRICE_MAX);
    const venueText = `${venue.name || ''} ${venue.address || ''} ${venue.governorate || ''}`.toLowerCase();

    if (governorate && normalizeGovernorateName(venue.governorate) !== governorate) return false;
    if (searchValue && !venueText.includes(searchValue)) return false;
    if (state.activeCategory && venue.category !== state.activeCategory) return false;
    if (Number(venue.totalCapacity || 0) < capacityMin) return false;
    if (Number(venue.pricePerDay || 0) < priceMin || Number(venue.pricePerDay || 0) > priceMax) return false;
    if (!state.activeAmenities.every((amenity) => Array.isArray(venue.amenities) && venue.amenities.includes(amenity))) return false;
    return true;
  }

  function sortVenues(list) {
    const sortBy = venueSortSelect.value || 'featured_first';
    const items = [...list];
    items.sort((left, right) => {
      if (sortBy === 'price_low_high') return Number(left.pricePerDay || 0) - Number(right.pricePerDay || 0);
      if (sortBy === 'price_high_low') return Number(right.pricePerDay || 0) - Number(left.pricePerDay || 0);
      if (sortBy === 'capacity') return Number(right.totalCapacity || 0) - Number(left.totalCapacity || 0);
      if (sortBy === 'rating') {
        const ratingGap = Number(right.rating || 0) - Number(left.rating || 0);
        if (ratingGap !== 0) return ratingGap;
      }
      const featuredGap = Number(Boolean(right.isFeatured)) - Number(Boolean(left.isFeatured));
      if (featuredGap !== 0) return featuredGap;
      const ratingGap = Number(right.rating || 0) - Number(left.rating || 0);
      if (ratingGap !== 0) return ratingGap;
      const priceGap = Number(left.pricePerDay || 0) - Number(right.pricePerDay || 0);
      if (priceGap !== 0) return priceGap;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
    return items;
  }

  function currentVenueResults() {
    return state.activeVenueTab === 'saved'
      ? filteredSavedVenueResults()
      : filteredBrowseVenueResults();
  }

  function getCategoryMeta(category) {
    return CATEGORY_META[category] || CATEGORY_META.conference_hall;
  }

  function getAmenityMeta(key) {
    return AMENITY_META[key] || {
      label: key.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      icon: '&#10003;'
    };
  }

  function getVenueArea(venue) {
    const parts = String(venue.address || '').split(',');
    return escapeHtml((parts[1] || parts[0] || '').trim());
  }

  function buildOptionalHeaders(includeAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (includeAuth && token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function apiJson(path, options = {}, includeAuth = true) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...buildOptionalHeaders(includeAuth),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function getDetailImages(venue) {
    return Array.isArray(venue.images) && venue.images.length ? venue.images : [];
  }

  function buildPlaceholderMarkup(venue, className) {
    const meta = getCategoryMeta(venue.category);
    return `
      <div class="${className} venue-gradient-placeholder" style="background:${meta.gradient}">
        <span class="venue-placeholder-icon">${meta.shortIcon}</span>
        <strong>${escapeHtml(venue.name)}</strong>
        <p>${escapeHtml(meta.label)}</p>
      </div>
    `;
  }

  function topAmenities(venue, limit = 3) {
    return (venue.amenities || []).slice(0, limit).map((key) => {
      const amenity = getAmenityMeta(key);
      return `<span class="amenity-icon-chip" title="${escapeHtml(amenity.label)}"><span class="amenity-icon">${amenity.icon}</span><small>${escapeHtml(amenity.label)}</small></span>`;
    }).join('');
  }

  function renderCategoryFilters() {
    venueCategoryFilters.innerHTML = Object.entries(CATEGORY_META).map(([key, meta]) => `
      <button type="button" class="category-pill ${state.activeCategory === key ? 'active' : ''}" data-category="${key}">
        <span>${meta.icon}</span>
        <strong>${escapeHtml(meta.label)}</strong>
      </button>
    `).join('');
  }

  function renderAmenityFilters() {
    venueAmenitiesFilters.innerHTML = Object.entries(AMENITY_META).map(([key, meta]) => `
      <label class="amenity-check">
        <input type="checkbox" value="${key}" ${state.activeAmenities.includes(key) ? 'checked' : ''} />
        <span>${meta.icon}</span>
        <strong>${escapeHtml(meta.label)}</strong>
      </label>
    `).join('');
  }

  function populateGovernorateSelect(select, placeholder) {
    if (!select) return;
    select.innerHTML = [
      `<option value="">${escapeHtml(placeholder)}</option>`,
      ...GOVERNORATE_OPTIONS.map((governorate) => `<option value="${escapeHtml(governorate)}">${escapeHtml(governorate)}</option>`)
    ].join('');
  }

  function countActiveFilters() {
    let count = 0;
    if (venueSearchGovernorate.value.trim()) count += 1;
    if (venueSearchInput.value.trim()) count += 1;
    if (state.activeCategory) count += 1;
    if (Number(capacityMinRange.value || DEFAULT_CAPACITY_MIN) > DEFAULT_CAPACITY_MIN) count += 1;
    if (
      Number(priceMinRange.value || DEFAULT_PRICE_MIN) !== DEFAULT_PRICE_MIN ||
      Number(priceMaxRange.value || DEFAULT_PRICE_MAX) !== DEFAULT_PRICE_MAX
    ) {
      count += 1;
    }
    count += state.activeAmenities.length;
    return count;
  }

  function renderFilterSummary() {
    if (filterCountLabel) {
      filterCountLabel.textContent = `Filters (${countActiveFilters()})`;
    }
  }

  function updateSavedTabVisibility() {
    const browseMatches = filteredBrowseVenueResults().length;
    let switchedTab = false;
    savedVenuesTab.classList.toggle('hidden', browseMatches === 0);
    if (browseMatches === 0 && state.activeVenueTab === 'saved') {
      state.activeVenueTab = 'browse';
      allVenuesTab.classList.add('active');
      savedVenuesTab.classList.remove('active');
      switchedTab = true;
    }
    return switchedTab;
  }

  function shouldShowWishlistControls(context = 'grid') {
    if (state.activeVenueTab === 'saved' || context === 'saved') return false;
    return filteredBrowseVenueResults().length > 0;
  }

  function featuredScrollStep() {
    const card = featuredVenuesRow.querySelector('.venue-card');
    if (!card) return 292;
    return Math.ceil(card.getBoundingClientRect().width + 12);
  }

  function featuredCards() {
    return Array.from(featuredVenuesRow.querySelectorAll('.venue-card'));
  }

  function activeFeaturedIndex() {
    const cards = featuredCards();
    if (!cards.length) return 0;
    const currentScroll = featuredVenuesRow.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - currentScroll);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    return closestIndex;
  }

  function updateFeaturedRailUI() {
    const cards = featuredCards();
    const maxScroll = Math.max(0, featuredVenuesRow.scrollWidth - featuredVenuesRow.clientWidth);
    const activeIndex = activeFeaturedIndex();

    featuredPrevBtn.disabled = !cards.length || featuredVenuesRow.scrollLeft <= 4;
    featuredNextBtn.disabled = !cards.length || featuredVenuesRow.scrollLeft >= maxScroll - 4;

    featuredDots.innerHTML = cards.map((_, index) => `
      <button
        type="button"
        class="featured-dot ${index === activeIndex ? 'active' : ''}"
        data-featured-index="${index}"
        aria-label="Go to featured venue ${index + 1}"
      ></button>
    `).join('');
  }

  function stopFeaturedAutoScroll() {
    if (!state.featuredAutoScrollTimer) return;
    window.clearInterval(state.featuredAutoScrollTimer);
    state.featuredAutoScrollTimer = null;
  }

  function scrollFeaturedToIndex(index, behavior = 'smooth') {
    const cards = featuredCards();
    if (!cards.length) return;
    const targetIndex = Math.max(0, Math.min(cards.length - 1, index));
    const targetCard = cards[targetIndex];
    if (!targetCard) return;
    featuredVenuesRow.scrollTo({
      left: targetCard.offsetLeft,
      behavior
    });
  }

  function stepFeaturedRail(direction) {
    stopFeaturedAutoScroll();
    const activeIndex = activeFeaturedIndex();
    scrollFeaturedToIndex(activeIndex + direction);
  }

  function updateFilterLabels() {
    capacityFilterValue.textContent = `${Number(capacityMinRange.value || DEFAULT_CAPACITY_MIN).toLocaleString('en-US')}+ seats`;
    const minValue = Number(priceMinRange.value || DEFAULT_PRICE_MIN);
    const maxValue = Number(priceMaxRange.value || DEFAULT_PRICE_MAX);
    priceFilterValue.textContent = `${minValue.toLocaleString('en-US')} - ${maxValue.toLocaleString('en-US')} EGP`;
    renderFilterSummary();
  }

  function buildVenueQuery() {
    const params = new URLSearchParams();
    if (venueSearchGovernorate.value) params.set('governorate', venueSearchGovernorate.value);
    return params.toString();
  }

  function setLoading(isLoading) {
    venueLoadingSkeleton.classList.toggle('hidden', !isLoading);
    venueGrid.classList.toggle('hidden', isLoading);
  }

  function setActiveVenueTab(tab) {
    state.activeVenueTab = tab === 'saved' ? 'saved' : 'browse';
    allVenuesTab.classList.toggle('active', state.activeVenueTab === 'browse');
    savedVenuesTab.classList.toggle('active', state.activeVenueTab === 'saved');
    renderFeaturedVenues();
    renderVenueGrid();
  }

  function setViewMode(mode) {
    state.viewMode = mode === 'list' ? 'list' : 'grid';
    venueGrid.classList.toggle('list-view', state.viewMode === 'list');
    gridViewBtn.classList.toggle('active', state.viewMode === 'grid');
    listViewBtn.classList.toggle('active', state.viewMode === 'list');
  }

  function renderSelectedVenueStrip() {
    if (state.venueType === 'online') {
      selectedVenueStrip.classList.remove('hidden');
      selectedVenueStripLabel.textContent = 'Online event';
      selectedVenueStripMeta.textContent = 'Venue search, map pinning, and physical address details are not required.';
      return;
    }
    if (state.venueType === 'platform_booked' && state.selectedVenue) {
      const meta = getCategoryMeta(state.selectedVenue.category);
      selectedVenueStrip.classList.remove('hidden');
      selectedVenueStripLabel.innerHTML = `${escapeHtml(state.selectedVenue.name)} <span class="mini-inline-chip">${escapeHtml(meta.label)}</span>`;
      selectedVenueStripMeta.textContent = `${state.selectedVenue.governorate} Ã‚Â· ${money(state.selectedVenue.pricePerDay)} Ã‚Â· Rating ${Number(state.selectedVenue.rating || 0).toFixed(1)}`;
      return;
    }
    if (state.venueType === 'host_owned') {
      selectedVenueStrip.classList.remove('hidden');
      selectedVenueStripLabel.textContent = 'Using my own venue';
      selectedVenueStripMeta.textContent = 'You will pin the map location and set ticket quantities manually.';
      return;
    }
    selectedVenueStrip.classList.add('hidden');
  }

  function applyVenueMode() {
    const isPlatform = state.venueType === 'platform_booked' && state.selectedVenue;
    const isOnline = state.venueType === 'online';

    physicalLocationFields.forEach((field) => field.classList.toggle('hidden', isOnline));
    onlineEventFields.classList.toggle('hidden', !isOnline);
    ticketTierGrid.classList.toggle('hidden', isOnline);
    onlineCapacityCard.classList.toggle('hidden', !isOnline);
    priceSpecialGroup.classList.toggle('hidden', isOnline);
    priceVipGroup.classList.toggle('hidden', isOnline);
    priceStandardLabel.textContent = isOnline ? 'Ticket Price (EGP)' : 'Standard Price (EGP)';
    mapSearchWrap.classList.toggle('hidden', isPlatform || isOnline);
    eventDateInput.readOnly = false;
    eventGovernorateSelect.disabled = isPlatform || isOnline;
    eventGovernorateSelect.required = !isOnline;
    venueAddressInput.readOnly = isPlatform;
    mapSearchInput.disabled = isPlatform || isOnline;
    mapSearchBtn.disabled = isPlatform || isOnline;
    onlinePlatformSelect.required = isOnline;
    onlineTimezoneSelect.required = isOnline;
    onlineUrlInput.required = isOnline;
    onlineAttendeesInput.required = isOnline;
    standardSeatsInput.required = false;
    specialSeatsInput.required = false;
    vipSeatsInput.required = false;

    if (isOnline) {
      readonlyVenueCard.classList.add('hidden');
      basicInfoVenueSuggestions.classList.add('hidden');
      venueSuggestionBanner.classList.add('hidden');
      eventGovernorateSelect.value = '';
      venueAddressInput.value = '';
      latInput.value = '';
      lngInput.value = '';
      standardSeatsInput.value = onlineAttendeesInput.value || 0;
      specialSeatsInput.value = 0;
      vipSeatsInput.value = 0;
      priceSpecialInput.value = 0;
      priceVipInput.value = 0;
      mapCoordinates.textContent = 'Online event selected. No physical coordinates are required.';
      locationModeNote.textContent = 'Add the streaming platform, attendee link, timezone, and access instructions.';
      standardSeatsInput.readOnly = false;
      specialSeatsInput.readOnly = false;
      vipSeatsInput.readOnly = false;
      ticketingModeNote.textContent = 'Set the maximum number of online attendees and one ticket price.';
    } else if (isPlatform) {
      const venue = state.selectedVenue;
      eventGovernorateSelect.value = normalizeGovernorateName(venue.governorate);
      venueAddressInput.value = venue.address || '';
      readonlyVenueCard.classList.remove('hidden');
      readonlyVenueName.textContent = venue.name;
      readonlyVenueLocation.textContent = `${venue.governorate} Ã‚Â· ${venue.address}`;
      readonlyVenueCapacity.textContent = `${Number(venue.totalCapacity || 0).toLocaleString('en-US')} seats`;
      locationModeNote.textContent = 'Venue location is locked to the selected platform venue.';
      standardSeatsInput.value = venue.standardSeats;
      specialSeatsInput.value = venue.specialSeats;
      vipSeatsInput.value = venue.vipSeats;
      standardSeatsInput.readOnly = true;
      specialSeatsInput.readOnly = true;
      vipSeatsInput.readOnly = true;
      ticketingModeNote.textContent = 'Seat quantities are locked to the selected venue. You only set prices.';
      setMarker(venue.latitude, venue.longitude, 14);
    } else {
      readonlyVenueCard.classList.add('hidden');
      locationModeNote.textContent = 'Search or pin your own venue location on the map.';
      if (state.venueType === 'host_owned') {
        standardSeatsInput.readOnly = false;
        specialSeatsInput.readOnly = false;
        vipSeatsInput.readOnly = false;
        ticketingModeNote.textContent = 'Define the seat quantities and prices for Standard, Special, and VIP.';
      }
    }

    renderSelectedVenueStrip();
    updateCapacityUI();
  }

  function setVenueType(type) {
    state.venueType = type;
    if (type === 'online') {
      state.selectedVenue = null;
      venueSearchPanel.classList.add('hidden');
      venuePathNote.classList.remove('hidden');
      venuePathNote.textContent = 'Online event selected. Physical venue browsing and map details are removed from this flow.';
    } else if (type === 'host_owned') {
      state.selectedVenue = null;
      venueSearchPanel.classList.add('hidden');
      venuePathNote.classList.remove('hidden');
      venuePathNote.textContent = 'Own venue selected. Continue through the existing flow with editable map and capacities.';
    } else {
      venueSearchPanel.classList.remove('hidden');
      venuePathNote.classList.remove('hidden');
      venuePathNote.textContent = 'Platform venue selected. Browse all venues or narrow the list with governorate, search, and filter controls.';
    }
    onlineEventBtn.closest('.venue-choice-card').classList.toggle('selected', type === 'online');
    ownVenueBtn.closest('.venue-choice-card').classList.toggle('selected', type === 'host_owned');
    browseVenueBtn.closest('.venue-choice-card').classList.toggle('selected', type === 'platform_booked');
    applyVenueMode();
    if (type === 'platform_booked' && !state.didLoadVenueCatalog) {
      searchVenues();
    }
  }

  function venueAvailabilityMarkup(venue) {
    const available = venue.availability?.isAvailable !== false;
    return `<span class="availability-pill ${available ? 'available' : 'booked'}">${available ? '&#128994; Available' : '&#128308; Currently unavailable'}</span>`;
  }

  function venueCardMarkup(venue, options = {}) {
    const meta = getCategoryMeta(venue.category);
    const featured = Boolean(venue.isFeatured);
    const selected = state.selectedVenue && Number(state.selectedVenue.id) === Number(venue.id);
    const compared = state.compareVenueIds.includes(Number(venue.id));
    const showWishlist = options.showWishlist !== false;
    const images = getDetailImages(venue);
    const standardSeats = Number(venue.standardSeats || 0).toLocaleString('en-US');
    const specialSeats = Number(venue.specialSeats || 0).toLocaleString('en-US');
    const vipSeats = Number(venue.vipSeats || 0).toLocaleString('en-US');
    const totalSeats = Number(venue.totalCapacity || 0).toLocaleString('en-US');
    const visualMarkup = images.length
      ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(venue.name)}">`
      : buildPlaceholderMarkup(venue, 'venue-card-visual');
    return `
      <article class="venue-card ${selected ? 'selected' : ''} ${options.featured ? 'featured-card' : ''}" data-venue-id="${venue.id}">
        <div class="venue-card-image">
          ${visualMarkup}
          ${featured ? '<span class="featured-ribbon">FEATURED</span>' : ''}
          <span class="rating-badge">&#11088; ${Number(venue.rating || 0).toFixed(1)}</span>
          ${showWishlist ? `<button type="button" class="wishlist-toggle ${venue.isInWishlist ? 'saved' : ''}" data-action="wishlist" data-venue-id="${venue.id}" aria-label="Toggle venue wishlist">&#10084;</button>` : ''}
          <div class="quick-view-overlay">
            <button type="button" class="secondary-btn" data-action="quick-view" data-venue-id="${venue.id}">Quick View</button>
          </div>
        </div>
        <div class="venue-card-body">
          <div class="venue-card-topline">
            <span class="category-chip">${meta.icon} ${escapeHtml(meta.label)}</span>
            ${venueAvailabilityMarkup(venue)}
          </div>
          <div class="venue-card-head">
            <div>
              <h4>${escapeHtml(venue.name)}</h4>
              <p>${escapeHtml(venue.governorate)} &middot; ${getVenueArea(venue)}</p>
            </div>
          </div>
          <div class="venue-price-line">${money(venue.pricePerDay)}</div>
          <div class="venue-seat-summary" role="text" aria-label="Seat breakdown">
            <span class="venue-seat-item standard">&#127915; ${standardSeats}</span>
            <span class="venue-seat-separator">&middot;</span>
            <span class="venue-seat-item special">&#11088; ${specialSeats}</span>
            <span class="venue-seat-separator">&middot;</span>
            <span class="venue-seat-item vip">&#128081; ${vipSeats}</span>
            <span class="venue-seat-separator">&middot;</span>
            <span class="venue-seat-total">Total: ${totalSeats}</span>
          </div>
          <div class="venue-amenity-preview">${topAmenities(venue, 3)}</div>
          <div class="venue-card-foot">
            <label class="compare-toggle">
              <input type="checkbox" data-action="compare" data-venue-id="${venue.id}" ${compared ? 'checked' : ''}>
              <span>Compare</span>
            </label>
            <div class="venue-card-actions">
              <button type="button" class="secondary-btn" data-action="quick-view" data-venue-id="${venue.id}">Quick View</button>
              <button type="button" class="cta-btn" data-action="select" data-venue-id="${venue.id}" ${venue.availability?.isAvailable === false ? 'disabled' : ''}>Select Venue</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderFeaturedVenues() {
    const venues = filteredFeaturedVenueResults();
    if (!venues.length) {
      featuredVenuesShell.classList.add('hidden');
      featuredVenuesRow.innerHTML = '';
      featuredDots.innerHTML = '';
      return;
    }
    featuredVenuesShell.classList.remove('hidden');
    featuredVenuesRow.scrollLeft = 0;
    featuredVenuesRow.innerHTML = venues.map((venue) => venueCardMarkup(venue, {
      featured: true,
      showWishlist: shouldShowWishlistControls('featured')
    })).join('');
    window.requestAnimationFrame(updateFeaturedRailUI);
  }

  function startFeaturedAutoScroll() {
    if (state.featuredAutoScrollTimer) return;
    state.featuredAutoScrollTimer = window.setInterval(() => {
      if (!featuredVenuesRow || featuredVenuesRow.matches(':hover')) return;
      const maxScroll = Math.max(0, featuredVenuesRow.scrollWidth - featuredVenuesRow.clientWidth);
      if (maxScroll <= 0) return;
      let next = featuredVenuesRow.scrollLeft + (1.1 * state.featuredAutoScrollDirection);
      if (next >= maxScroll || next <= 0) {
        state.featuredAutoScrollDirection *= -1;
        next = Math.max(0, Math.min(maxScroll, next));
      }
      featuredVenuesRow.scrollLeft = next;
    }, 28);
  }

  function renderVenueGrid() {
    const switchedTab = updateSavedTabVisibility();
    if (switchedTab) renderFeaturedVenues();
    const venues = currentVenueResults();
    const totalVisibleSource = currentRawVenueResults().length;
    const activeGovernorate = normalizeGovernorateName(venueSearchGovernorate.value);

    if (!venues.length) {
      venueGrid.innerHTML = '';
      noVenuesState.classList.remove('hidden');
      if (state.activeVenueTab === 'saved' && state.savedVenueResults.length === 0) {
        noVenuesState.innerHTML = `
          <div class="empty-state-icon">&#10084;</div>
          <strong>No saved venues yet.</strong>
          <p>Save venues from the browse tab to keep them here.</p>
        `;
        venueSearchFeedback.textContent = 'You have no saved venues yet.';
        return;
      }
      if (state.activeVenueTab === 'saved') {
        noVenuesState.innerHTML = `
          <div class="empty-state-icon">&#10084;</div>
          <strong>No saved venues match your filters.</strong>
          <p>Try adjusting your filters or browse more venues to save new ones.</p>
          <button type="button" class="secondary-btn" data-action="reset-filters">Reset Filters</button>
        `;
        venueSearchFeedback.textContent = 'No saved venues match the current filter combination.';
        return;
      }
      noVenuesState.innerHTML = `
        <div class="empty-state-icon">&#127963;</div>
        <strong>No venues match your filters${activeGovernorate ? ` in ${escapeHtml(activeGovernorate)}` : ''}.</strong>
        <p>${activeGovernorate ? `Try adjusting your filters or selecting a different governorate.` : 'Try adjusting your filters or selecting a governorate.'}</p>
        <button type="button" class="secondary-btn" data-action="reset-filters">Reset Filters</button>
      `;
      venueSearchFeedback.textContent = totalVisibleSource
        ? `0 venues match the current filter combination${activeGovernorate ? ` in ${activeGovernorate}` : ''}.`
        : `No venues are available${activeGovernorate ? ` in ${activeGovernorate}` : ''}.`;
      return;
    }

    noVenuesState.classList.add('hidden');
    venueGrid.innerHTML = venues.map((venue) => venueCardMarkup(venue, {
      context: state.activeVenueTab,
      showWishlist: shouldShowWishlistControls(state.activeVenueTab)
    })).join('');
    venueSearchFeedback.textContent = `${venues.length} of ${totalVisibleSource} venue(s) shown in ${state.activeVenueTab === 'saved' ? 'Saved Venues' : 'Browse Venues'}.`;
  }

  function uniqueVenues(list) {
    const map = new Map();
    list.forEach((venue) => {
      if (!venue || !venue.id) return;
      map.set(Number(venue.id), { ...(map.get(Number(venue.id)) || {}), ...venue });
    });
    return Array.from(map.values());
  }

  function allKnownVenues() {
    return uniqueVenues([
      ...state.browseVenueResults,
      ...state.savedVenueResults,
      ...state.featuredVenues,
      ...(state.detailVenue ? [state.detailVenue] : []),
      ...(state.venueSuggestions || [])
    ]);
  }

  function findVenueById(venueId) {
    return allKnownVenues().find((venue) => Number(venue.id) === Number(venueId)) || null;
  }

  function updateVenueAcrossCollections(venueId, patch) {
    const apply = (list) => list.map((venue) => (
      Number(venue.id) === Number(venueId) ? { ...venue, ...patch } : venue
    ));
    state.browseVenueResults = apply(state.browseVenueResults);
    state.savedVenueResults = apply(state.savedVenueResults);
    state.featuredVenues = apply(state.featuredVenues);
    state.venueSuggestions = apply(state.venueSuggestions);
    if (state.selectedVenue && Number(state.selectedVenue.id) === Number(venueId)) {
      state.selectedVenue = { ...state.selectedVenue, ...patch };
    }
    if (state.detailVenue && Number(state.detailVenue.id) === Number(venueId)) {
      state.detailVenue = { ...state.detailVenue, ...patch };
    }
  }

  async function loadFeaturedVenues() {
    try {
      const query = new URLSearchParams();
      if (venueSearchGovernorate.value) query.set('governorate', venueSearchGovernorate.value);
      const data = await apiJson(`/venues/featured?${query.toString()}`);
      state.featuredVenues = Array.isArray(data.venues) ? data.venues : [];
      renderFeaturedVenues();
    } catch (error) {
      console.error('Featured venue load failed:', error);
      state.featuredVenues = [];
      renderFeaturedVenues();
    }
  }

  async function searchVenues() {
    setLoading(true);
    noVenuesState.classList.add('hidden');

    try {
      const query = buildVenueQuery();
      const [browseData, savedData] = await Promise.all([
        apiJson(`/venues?${query}`),
        apiJson(`/venues/wishlist?${query}`).catch(() => ({ venues: [] }))
      ]);
      state.browseVenueResults = Array.isArray(browseData.venues) ? browseData.venues : [];
      state.savedVenueResults = Array.isArray(savedData.venues) ? savedData.venues : [];
      state.didLoadVenueCatalog = true;
      await loadFeaturedVenues();
      renderVenueGrid();
    } catch (error) {
      console.error('Venue search failed:', error);
      state.browseVenueResults = [];
      state.savedVenueResults = [];
      venueSearchFeedback.textContent = error.message || 'Could not search venues right now.';
      renderVenueGrid();
    } finally {
      setLoading(false);
    }
  }

  function renderSuggestionCards(target, venues) {
    target.innerHTML = venues.map((venue) => {
      const meta = getCategoryMeta(venue.category);
      return `
        <article class="suggestion-card" data-venue-id="${venue.id}">
          <span class="category-chip">${meta.icon} ${escapeHtml(meta.label)}</span>
          <strong>${escapeHtml(venue.name)}</strong>
          <p>${escapeHtml(venue.governorate)} Ã‚Â· ${money(venue.pricePerDay)}</p>
          <button type="button" class="secondary-btn" data-action="jump-to-venue" data-venue-id="${venue.id}">View Venue</button>
        </article>
      `;
    }).join('');
  }

  async function refreshVenueSuggestions() {
    const eventType = eventTypeSelect.value.trim();
    if (!eventType || state.venueType === 'online') {
      state.venueSuggestions = [];
      venueSuggestionBanner.classList.add('hidden');
      basicInfoVenueSuggestions.classList.add('hidden');
      return;
    }

    try {
      const params = new URLSearchParams({ eventType });
      if (venueSearchGovernorate.value || eventGovernorateSelect.value) {
        params.set('governorate', venueSearchGovernorate.value || eventGovernorateSelect.value);
      }
      if (eventDateInput.value) {
        params.set('date', eventDateInput.value);
      }
      const data = await apiJson(`/venues/suggestions?${params.toString()}`);
      state.venueSuggestions = Array.isArray(data.venues) ? data.venues : [];
      if (!state.venueSuggestions.length) {
        venueSuggestionBanner.classList.add('hidden');
        basicInfoVenueSuggestions.classList.add('hidden');
        return;
      }
      venueSuggestionTitle.textContent = `Based on your event type (${eventType}), we recommend these venues:`;
      venueSuggestionText.textContent = 'These picks align with your category and current date/governorate context.';
      basicSuggestionText.textContent = `Recommended matches for ${eventType}. Jump back to the venue browser to compare or book one.`;
      renderSuggestionCards(venueSuggestionCards, state.venueSuggestions);
      renderSuggestionCards(basicSuggestionCards, state.venueSuggestions);
      venueSuggestionBanner.classList.remove('hidden');
      basicInfoVenueSuggestions.classList.remove('hidden');
    } catch (error) {
      console.error('Venue suggestions failed:', error);
    }
  }

  function compareVenues() {
    return state.compareVenueIds
      .map((id) => findVenueById(id))
      .filter(Boolean);
  }

  function renderCompareBar() {
    const venues = compareVenues();
    compareBar.classList.toggle('hidden', venues.length < 2);
    compareBarLabel.textContent = `Compare ${venues.length} Venue${venues.length === 1 ? '' : 's'}`;
    compareBarText.textContent = venues.length >= 2
      ? venues.map((venue) => venue.name).join(' Ã‚Â· ')
      : 'Review price, capacity, amenities, and rating side by side.';
  }

  function toggleCompareVenue(venueId, shouldCompare) {
    const id = Number(venueId);
    if (shouldCompare) {
      if (!state.compareVenueIds.includes(id) && state.compareVenueIds.length >= 3) {
        window.alert('You can compare up to 3 venues at a time.');
        return false;
      }
      state.compareVenueIds = state.compareVenueIds.includes(id)
        ? state.compareVenueIds
        : [...state.compareVenueIds, id];
    } else {
      state.compareVenueIds = state.compareVenueIds.filter((item) => item !== id);
    }
    renderCompareBar();
    renderVenueGrid();
    renderFeaturedVenues();
    return true;
  }

  function buildCompareTable() {
    const venues = compareVenues();
    if (venues.length < 2) {
      compareTableWrap.innerHTML = '<div class="empty-state">Select at least two venues to compare them.</div>';
      return;
    }

    const allAmenities = Object.keys(AMENITY_META);
    compareTableWrap.innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th>Metric</th>
            ${venues.map((venue) => `<th>${escapeHtml(venue.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr><td>Price per day</td>${venues.map((venue) => `<td>${money(venue.pricePerDay)}</td>`).join('')}</tr>
          <tr><td>Total capacity</td>${venues.map((venue) => `<td>${Number(venue.totalCapacity || 0).toLocaleString('en-US')}</td>`).join('')}</tr>
          <tr><td>Seat breakdown</td>${venues.map((venue) => `<td>Standard ${venue.standardSeats} Ã‚Â· Special ${venue.specialSeats} Ã‚Â· VIP ${venue.vipSeats}</td>`).join('')}</tr>
          <tr><td>Rating</td>${venues.map((venue) => `<td>${Number(venue.rating || 0).toFixed(1)} (${venue.totalReviews || 0} reviews)</td>`).join('')}</tr>
          <tr><td>Category</td>${venues.map((venue) => `<td>${escapeHtml(getCategoryMeta(venue.category).label)}</td>`).join('')}</tr>
          <tr><td>Location</td>${venues.map((venue) => `<td>${escapeHtml(venue.governorate)} Ã‚Â· ${getVenueArea(venue)}</td>`).join('')}</tr>
          ${allAmenities.map((amenityKey) => {
            const amenity = getAmenityMeta(amenityKey);
            return `<tr><td>${amenity.label}</td>${venues.map((venue) => `<td>${venue.amenities?.includes(amenityKey) ? '&#10003;' : '&mdash;'}</td>`).join('')}</tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function openModal(modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay.open')) {
      document.body.classList.remove('modal-open');
    }
  }

  function renderVenueModalGallery(venue) {
    const images = getDetailImages(venue);
    const meta = getCategoryMeta(venue.category);
    if (!images.length) {
      venueModalHero.innerHTML = buildPlaceholderMarkup(venue, 'venue-modal-hero');
      venueModalDots.innerHTML = `<button type="button" class="modal-dot active" data-image-index="0" aria-label="${escapeHtml(meta.label)} placeholder"></button>`;
      return;
    }

    state.detailImageIndex = Math.max(0, Math.min(state.detailImageIndex, images.length - 1));
    venueModalHero.innerHTML = `<img src="${escapeHtml(images[state.detailImageIndex])}" alt="${escapeHtml(venue.name)}">`;
    venueModalDots.innerHTML = images.map((_, index) => `
      <button type="button" class="modal-dot ${index === state.detailImageIndex ? 'active' : ''}" data-image-index="${index}" aria-label="Open image ${index + 1}"></button>
    `).join('');
  }

  function renderMiniCalendar(venue) {
    const sourceDate = eventDateInput.value || toLocalDateInputValue();
    const baseDate = new Date(sourceDate);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const bookedDays = new Set((venue.bookedDates || []).map((item) => item.date));
    const blockedRanges = venue.blockedDates || [];
    const selectedDate = sourceDate;

    venueCalendarLabel.textContent = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const cells = [];
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    for (let index = 0; index < totalCells; index += 1) {
      const dayNumber = index - startOffset + 1;
      if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
        cells.push('<span class="calendar-cell muted"></span>');
        continue;
      }
      const isoDate = toLocalDateInputValue(new Date(year, month, dayNumber));
      const blocked = blockedRanges.some((item) => item.startDate <= isoDate && item.endDate >= isoDate);
      const booked = bookedDays.has(isoDate);
      const selected = isoDate === selectedDate;
      let statusClass = 'available';
      let statusText = 'Available';
      if (blocked || booked) {
        statusClass = 'booked';
        statusText = 'Booked';
      }
      if (selected) statusClass += ' selected';
      cells.push(`<span class="calendar-cell ${statusClass}" title="${statusText}">${dayNumber}</span>`);
    }
    venueCalendarGrid.innerHTML = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
      .map((day) => `<span class="calendar-heading">${day}</span>`)
      .join('') + cells.join('');
  }

  function renderVenueReviews(venue) {
    if (!Array.isArray(venue.reviews) || !venue.reviews.length) {
      venueModalReviews.innerHTML = '<div class="empty-state">No venue reviews yet.</div>';
      return;
    }
    venueModalReviews.innerHTML = venue.reviews.map((review) => `
      <article class="review-card">
        <div class="review-card-head">
          <span class="review-avatar">${escapeHtml(review.reviewerInitial)}</span>
          <div>
            <strong>${escapeHtml(review.reviewerName)}</strong>
            <p>${escapeHtml(review.eventType)} Ã‚Â· ${shortDate(review.createdAt)}</p>
          </div>
          <span class="rating-pill">&#11088; ${Number(review.rating || 0).toFixed(1)}</span>
        </div>
        <p>${escapeHtml(review.reviewText || 'No written feedback provided.')}</p>
      </article>
    `).join('');
  }

  function renderVenueModal() {
    const venue = state.detailVenue;
    if (!venue) return;
    const meta = getCategoryMeta(venue.category);
    venueModalCategoryBadge.innerHTML = `${meta.icon} ${escapeHtml(meta.label)}`;
    venueModalRatingBadge.innerHTML = `&#11088; ${Number(venue.rating || 0).toFixed(1)} Ã‚Â· ${Number(venue.totalReviews || 0)} reviews`;
    venueModalName.textContent = venue.name;
    venueModalLocationMeta.textContent = `${venue.governorate} Ã‚Â· ${venue.address}`;
    venueModalDescription.textContent = venue.description || 'No description provided.';
    venueModalAddress.textContent = `${venue.governorate} Ã‚Â· ${venue.address}`;
    venueDirectionsLink.href = venue.latitude != null && venue.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.latitude},${venue.longitude}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`;
    if (venueOwnerProfileLink) {
      venueOwnerProfileLink.href = venue.ownerId
        ? `/html/venue-owner-profile.html?ownerId=${encodeURIComponent(venue.ownerId)}`
        : '#';
      venueOwnerProfileLink.classList.toggle('hidden', !venue.ownerId);
    }
    venuePrice.textContent = money(venue.pricePerDay);
    venueHourlyRow.classList.toggle('hidden', !(venue.pricePerHour && venue.minHours));
    venueHourlyPrice.textContent = money(venue.pricePerHour || 0);
    venueMinimumHours.textContent = venue.minHours ? `Minimum booking window: ${venue.minHours} hour(s)` : '';
    venueCapacity.textContent = Number(venue.totalCapacity || 0).toLocaleString('en-US');
    seatCountStandard.textContent = Number(venue.standardSeats || 0).toLocaleString('en-US');
    seatCountSpecial.textContent = Number(venue.specialSeats || 0).toLocaleString('en-US');
    seatCountVip.textContent = Number(venue.vipSeats || 0).toLocaleString('en-US');
    venueAvailabilityBadge.innerHTML = venue.availability?.isAvailable !== false ? '&#128994; Available' : '&#128308; Booked';
    toggleWishlistModalBtn.textContent = venue.isInWishlist ? 'Remove from Wishlist' : 'Add to Wishlist';
    venueModalAmenities.innerHTML = (venue.amenities || []).map((item) => {
      const amenity = getAmenityMeta(item);
      return `<div class="amenity-card"><span>${amenity.icon}</span><strong>${escapeHtml(amenity.label)}</strong></div>`;
    }).join('');

    // Policies section
    const policiesEl = document.getElementById('venueModalPolicies');
    const policiesSection = document.getElementById('venueModalPoliciesSection');
    if (policiesEl) {
      const policyLabels = {
        catering: { allowed: 'External Catering Allowed', not_allowed: 'No External Catering', provided_only: 'Venue Catering Only' },
        decoration: { allowed: 'Decoration Allowed', not_allowed: 'No Decoration', approval_required: 'Decoration by Approval' },
        music: { allowed: 'Music Allowed', not_allowed: 'No Music', until_midnight: 'Music Until Midnight', until_10pm: 'Music Until 10 PM' }
      };
      const hasPolicies = venue.cateringPolicy || venue.decorationPolicy || venue.musicPolicy || venue.rules || venue.parkingDetails;
      if (hasPolicies) {
        policiesSection.style.display = '';
        policiesEl.innerHTML = [
          venue.cateringPolicy ? `<div><span style="font-size:1.1rem;">🍽️</span> ${policyLabels.catering[venue.cateringPolicy] || venue.cateringPolicy}</div>` : '',
          venue.decorationPolicy ? `<div><span style="font-size:1.1rem;">🎀</span> ${policyLabels.decoration[venue.decorationPolicy] || venue.decorationPolicy}</div>` : '',
          venue.musicPolicy ? `<div><span style="font-size:1.1rem;">🎵</span> ${policyLabels.music[venue.musicPolicy] || venue.musicPolicy}</div>` : '',
          venue.setupTimeHours ? `<div><span style="font-size:1.1rem;">🔧</span> ${venue.setupTimeHours}h Setup Time</div>` : '',
          venue.minBookingHours ? `<div><span style="font-size:1.1rem;">⏱️</span> Min ${venue.minBookingHours}h Booking</div>` : '',
        ].filter(Boolean).join('');
        if (venue.rules) {
          policiesEl.innerHTML += `<div style="grid-column: 1 / -1; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; margin-top: 5px;"><strong>Rules:</strong> ${escapeHtml(venue.rules)}</div>`;
        }
        if (venue.parkingDetails) {
          policiesEl.innerHTML += `<div style="grid-column: 1 / -1;"><strong>Parking:</strong> ${escapeHtml(venue.parkingDetails)}</div>`;
        }
      } else {
        policiesSection.style.display = 'none';
      }
    }

    renderVenueModalGallery(venue);
    renderMiniCalendar(venue);
    renderVenueReviews(venue);
    renderDetailMap(venue);
  }

  async function openVenueQuickView(venueId) {
    try {
      const data = await apiJson(`/venues/${venueId}`);
      state.detailVenue = data.venue;
      state.detailImageIndex = 0;
      renderVenueModal();
      openModal(venueQuickViewModal);
    } catch (error) {
      console.error('Venue details failed:', error);
      window.alert(error.message || 'Failed to load venue details.');
    }
  }

  function chooseVenue(venue) {
    state.selectedVenue = { ...venue };
    // Reset availability state so new venue+date combination is freshly checked
    venueAvailState.checked = false;
    venueAvailState.isAvailable = true;
    renderSelectedVenueStrip();
    applyVenueMode();
    renderVenueGrid();
    renderFeaturedVenues();
    closeModal(venueQuickViewModal);
    // Trigger availability check if a date is already selected
    if (eventDateInput.value) {
      clearTimeout(eventDateInput._availabilityTimer);
      eventDateInput._availabilityTimer = setTimeout(() => checkVenueAvailability(), 300);
    }
  }

  async function toggleWishlist(venueId) {
    try {
      const data = await apiJson(`/venues/${venueId}/wishlist`, { method: 'POST' }, true);
      updateVenueAcrossCollections(venueId, { isInWishlist: Boolean(data.saved) });
      if (data.saved) {
        const venue = findVenueById(venueId);
        if (venue && !state.savedVenueResults.some((item) => Number(item.id) === Number(venueId))) {
          state.savedVenueResults = [venue, ...state.savedVenueResults];
        }
      } else {
        state.savedVenueResults = state.savedVenueResults.filter((item) => Number(item.id) !== Number(venueId));
      }
      renderVenueGrid();
      renderFeaturedVenues();
      if (state.detailVenue && Number(state.detailVenue.id) === Number(venueId)) {
        renderVenueModal();
      }
    } catch (error) {
      console.error('Wishlist toggle failed:', error);
      window.alert(error.message || 'Could not update wishlist.');
    }
  }

  function reviewValue(value, fallback = 'Not provided') {
    return String(value || '').trim() || fallback;
  }

  function buildPayload() {
    const totals = seatTotals();
    const currentVenueType = state.venueType || 'host_owned';
    const currentVenue = state.selectedVenue;
    const listing = listingFee(totals.total);
    const venueFee = currentVenueType === 'platform_booked' && currentVenue
      ? Number(currentVenue.pricePerDay || 0)
      : 0;
    const isOnline = currentVenueType === 'online';
    const onlinePlatform = onlinePlatformSelect.value;
    const onlineTimezone = onlineTimezoneSelect.value;
    const onlineUrl = onlineUrlInput.value.trim();
    const onlineAccess = onlineAccessInput.value.trim();
    const onlineDetails = [
      onlinePlatform ? `Online platform: ${onlinePlatform}` : '',
      onlineTimezone ? `Timezone: ${onlineTimezone}` : '',
      onlineUrl ? `Access link: ${onlineUrl}` : '',
      onlineAccess ? `Access instructions: ${onlineAccess}` : ''
    ].filter(Boolean).join('\n');
    const baseLogistics = document.getElementById('logistics').value.trim();
    return {
      title: document.getElementById('event-title').value.trim(),
      eventType: eventTypeSelect.value,
      description: document.getElementById('event-description').value.trim(),
      imageUrl: document.getElementById('event-image').value.trim(),
      eventDate: eventDateInput.value,
      eventTime: eventTimeInput.value,
      governorate: isOnline ? null : eventGovernorateSelect.value,
      location: isOnline ? `Online Event${onlinePlatform ? ` - ${onlinePlatform}` : ''}` : (currentVenueType === 'platform_booked' && currentVenue ? currentVenue.name : eventGovernorateSelect.value),
      latitude: isOnline ? null : latInput.value,
      longitude: isOnline ? null : lngInput.value,
      venueAddress: isOnline ? onlineUrl : venueAddressInput.value.trim(),
      location_type: isOnline ? 'online' : 'physical',
      onlinePlatform,
      onlineTimezone,
      onlineUrl,
      onlineAccess,
      venueType: currentVenueType === 'platform_booked' ? 'platform_booked' : 'host_owned',
      venueId: currentVenueType === 'platform_booked' && currentVenue ? currentVenue.id : null,
      venueBookingId: null,
      selectedVenue: currentVenue,
      standardSeats: totals.standard,
      specialSeats: totals.special,
      vipSeats: totals.vip,
      maxSeats: totals.total,
      ageRestriction: document.getElementById('age-restriction').value,
      priceStandard: document.getElementById('price-standard').value || 0,
      priceSpecial: document.getElementById('price-special').value || 0,
      priceVip: document.getElementById('price-vip').value || 0,
      registrationDeadline: document.getElementById('registration-deadline').value,
      eventAgenda: document.getElementById('event-agenda').value.trim(),
      termsConditions: document.getElementById('terms-conditions').value.trim(),
      logistics: isOnline ? [baseLogistics, onlineDetails].filter(Boolean).join('\n\n') : baseLogistics,
      ocName: document.getElementById('oc-name').value.trim(),
      ocEmail: document.getElementById('oc-email').value.trim(),
      ocPhone: document.getElementById('oc-phone').value.trim(),
      hostName: document.getElementById('host-name').value.trim(),
      hostEmail: document.getElementById('host-email').value.trim(),
      hostPhone: document.getElementById('host-phone').value.trim(),
      hostOrganization: document.getElementById('host-organization').value.trim(),
      aiMarketingRequested: true,
      listingFee: listing.fee,
      venueFee,
      totalDueNow: listing.fee + venueFee
    };
  }

  function validateStep(step) {
    if (step === 0) {
      if (!state.venueType) {
        window.alert('Choose a venue path first.');
        return false;
      }
      if (state.venueType === 'platform_booked' && !state.selectedVenue) {
        window.alert('Select a venue before continuing.');
        return false;
      }
      return true;
    }

    for (const section of sectionsForStep(step)) {
      const requiredFields = Array.from(section.querySelectorAll('[required]'));
      for (const field of requiredFields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
    }

    if (step === 2 && state.venueType !== 'online' && (!latInput.value || !lngInput.value)) {
      window.alert(state.venueType === 'platform_booked'
        ? 'Venue coordinates are missing. Re-select the venue.'
        : 'Please pick a location on the map.');
      return false;
    }

    if (step === 2) {
      const selectedDateTime = getSelectedEventDateTime();
      if (!selectedDateTime || selectedDateTime <= new Date()) {
        window.alert('Choose an event date and time in the future.');
        eventTimeInput.reportValidity();
        return false;
      }
    }

    // Double-booking guard: block proceeding if venue is already taken on selected date
    if (step === 2 && state.venueType === 'platform_booked' && state.selectedVenue && eventDateInput.value) {
      if (venueAvailState.checking) {
        window.alert('Still checking venue availability — please wait a moment and try again.');
        return false;
      }
      if (venueAvailState.checked && !venueAvailState.isAvailable) {
        window.alert('This venue is not available on the selected date. Please choose a different date or a different venue.');
        return false;
      }
    }

    if (step === 3 && seatTotals().total <= 0) {
      window.alert(state.venueType === 'online'
        ? 'Add at least one attendee.'
        : 'Add at least one seat across Standard, Special, or VIP.');
      return false;
    }

    if (step === 3) {
      const registrationDeadlineValue = document.getElementById('registration-deadline').value;
      const eventDateTime = getSelectedEventDateTime();
      if (registrationDeadlineValue && eventDateTime) {
        const registrationDeadline = new Date(registrationDeadlineValue);
        if (
          Number.isNaN(registrationDeadline.getTime()) ||
          registrationDeadline <= new Date() ||
          registrationDeadline >= eventDateTime
        ) {
          window.alert('Registration deadline must be in the future and before the event starts.');
          return false;
        }
      }
    }

    return true;
  }

  function validateAll() {
    for (let step = 0; step < TOTAL_STEPS; step += 1) {
      if (!validateStep(step)) {
        setStep(step);
        return false;
      }
    }
    return true;
  }

  function openReviewModal() {
    const payload = buildPayload();
    const venueModeLabel = state.venueType === 'online'
      ? 'Online Event'
      : payload.venueType === 'platform_booked'
        ? 'Book a Venue Through Us'
        : 'I Have My Own Venue';
    const deliveryLabel = state.venueType === 'online'
      ? reviewValue(payload.onlinePlatform, 'Online platform')
      : payload.selectedVenue ? payload.selectedVenue.name : 'Own venue to be pinned manually';
    const locationLabel = state.venueType === 'online'
      ? `${reviewValue(payload.onlineTimezone)}${payload.onlineUrl ? ` - ${reviewValue(payload.onlineUrl)}` : ''}`
      : `${reviewValue(payload.governorate)}${payload.venueAddress ? ` - ${reviewValue(payload.venueAddress)}` : ''}`;
    reviewSummary.innerHTML = `
      <div class="summary-row"><span>Event Mode</span><strong>${escapeHtml(venueModeLabel)}</strong></div>
      <div class="summary-row"><span>Delivery</span><strong>${escapeHtml(deliveryLabel)}</strong></div>
      <div class="summary-row"><span>Title</span><strong>${escapeHtml(reviewValue(payload.title))}</strong></div>
      <div class="summary-row"><span>Date & Time</span><strong>${escapeHtml(reviewValue(payload.eventDate))} ${escapeHtml(reviewValue(payload.eventTime, ''))}</strong></div>
      <div class="summary-row"><span>${state.venueType === 'online' ? 'Online Access' : 'Location'}</span><strong>${escapeHtml(locationLabel)}</strong></div>
      <div class="summary-row"><span>${state.venueType === 'online' ? 'Attendees' : 'Seat Breakdown'}</span><strong>${state.venueType === 'online' ? `${payload.maxSeats} maximum attendees` : `Standard ${payload.standardSeats} - Special ${payload.specialSeats} - VIP ${payload.vipSeats}`}</strong></div>
      <div class="summary-row"><span>Ticket Prices</span><strong>${state.venueType === 'online' ? money(payload.priceStandard) : `${money(payload.priceStandard)} / ${money(payload.priceSpecial)} / ${money(payload.priceVip)}`}</strong></div>
      <div class="summary-row"><span>Payment Due</span><strong>${money(payload.totalDueNow)} now</strong></div>
      ${payload.venueType === 'platform_booked' && payload.selectedVenue ? '<div class="summary-row"><span>Venue Fee</span><strong>Charged after owner accepts</strong></div>' : ''}
    `;
    openModal(reviewModal);
  }

  function closeReviewModal() {
    closeModal(reviewModal);
  }

  function submitDraft() {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('isLoggedIn') === 'guest') {
      window.alert('Please sign in to create an event.');
      window.location.href = 'signin.html';
      return;
    }
    localStorage.setItem('eventDraft', JSON.stringify(buildPayload()));
    closeReviewModal();
    openModal(successOverlay);
    window.setTimeout(() => {
      window.location.href = 'pay-for-event.html';
    }, 1400);
  }

  function bindMenu() {
    const header = document.querySelector('header');
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelectorAll('nav a');
    if (!header || !menuToggle) return;
    const setMenuState = (open) => {
      header.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    };
    menuToggle.addEventListener('click', () => setMenuState(!header.classList.contains('menu-open')));
    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) setMenuState(false);
      });
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) setMenuState(false);
    });
  }

  function handleVenueActionClick(event) {
    const actionButton = event.target.closest('[data-action][data-venue-id]');
    if (!actionButton) return;
    const venueId = Number(actionButton.dataset.venueId);
    const venue = findVenueById(venueId);
    if (!venue) return;

    if (actionButton.dataset.action === 'quick-view') {
      openVenueQuickView(venueId);
      return;
    }
    if (actionButton.dataset.action === 'select') {
      if (venue.availability?.isAvailable === false) {
        window.alert('That venue is not available on the selected date.');
        return;
      }
      chooseVenue(venue);
      return;
    }
    if (actionButton.dataset.action === 'wishlist') {
      toggleWishlist(venueId);
      return;
    }
    if (actionButton.dataset.action === 'jump-to-venue') {
      if (!venueSearchGovernorate.value) venueSearchGovernorate.value = normalizeGovernorateName(venue.governorate);
      setVenueType('platform_booked');
      setStep(0);
      openVenueQuickView(venueId);
    }
  }

  function maybeRefreshSearch() {
    if (state.venueType !== 'platform_booked') return;
    renderFilterSummary();
    renderFeaturedVenues();
    renderVenueGrid();
  }

  function resetVenueFilters() {
    venueSearchGovernorate.value = '';
    venueSearchInput.value = '';
    state.activeCategory = null;
    state.activeAmenities = [];
    capacityMinRange.value = String(DEFAULT_CAPACITY_MIN);
    priceMinRange.value = String(DEFAULT_PRICE_MIN);
    priceMaxRange.value = String(DEFAULT_PRICE_MAX);
    venueSortSelect.value = 'featured_first';
    setViewMode('grid');
    renderCategoryFilters();
    renderAmenityFilters();
    updateFilterLabels();
  }

  async function refreshVenueCatalog() {
    if (state.venueType !== 'platform_booked') return;
    await searchVenues();
  }

  onlineEventBtn.addEventListener('click', () => setVenueType('online'));
  ownVenueBtn.addEventListener('click', () => setVenueType('host_owned'));
  browseVenueBtn.addEventListener('click', () => setVenueType('platform_booked'));
  changeVenueSelectionBtn.addEventListener('click', () => {
    state.selectedVenue = null;
    applyVenueMode();
    renderVenueGrid();
  });

  refreshFeaturedVenuesBtn.addEventListener('click', loadFeaturedVenues);
  allVenuesTab.addEventListener('click', () => setActiveVenueTab('browse'));
  savedVenuesTab.addEventListener('click', () => setActiveVenueTab('saved'));
  gridViewBtn.addEventListener('click', () => setViewMode('grid'));
  listViewBtn.addEventListener('click', () => setViewMode('list'));
  resetCategoryBtn.addEventListener('click', () => {
    state.activeCategory = null;
    renderCategoryFilters();
    maybeRefreshSearch();
  });
  resetAmenitiesBtn.addEventListener('click', () => {
    state.activeAmenities = [];
    renderAmenityFilters();
    maybeRefreshSearch();
  });
  clearAllFiltersBtn.addEventListener('click', async () => {
    resetVenueFilters();
    if (state.venueType === 'platform_booked') {
      await refreshVenueCatalog();
      return;
    }
    renderVenueGrid();
  });

  venueCategoryFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    const category = button.dataset.category;
    state.activeCategory = state.activeCategory === category ? null : category;
    renderCategoryFilters();
    maybeRefreshSearch();
  });

  venueAmenitiesFilters.addEventListener('change', () => {
    state.activeAmenities = Array.from(venueAmenitiesFilters.querySelectorAll('input:checked')).map((input) => input.value);
    maybeRefreshSearch();
  });

  capacityMinRange.addEventListener('input', () => {
    updateFilterLabels();
    maybeRefreshSearch();
  });
  priceMinRange.addEventListener('input', () => {
    if (Number(priceMinRange.value) > Number(priceMaxRange.value)) {
      priceMaxRange.value = priceMinRange.value;
    }
    updateFilterLabels();
    maybeRefreshSearch();
  });
  priceMaxRange.addEventListener('input', () => {
    if (Number(priceMaxRange.value) < Number(priceMinRange.value)) {
      priceMinRange.value = priceMaxRange.value;
    }
    updateFilterLabels();
    maybeRefreshSearch();
  });
  venueSortSelect.addEventListener('change', maybeRefreshSearch);
  venueSearchInput.addEventListener('input', maybeRefreshSearch);
  venueSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      maybeRefreshSearch();
    }
  });

  venueGrid.addEventListener('click', handleVenueActionClick);
  featuredVenuesRow.addEventListener('click', handleVenueActionClick);
  venueSuggestionCards.addEventListener('click', handleVenueActionClick);
  basicSuggestionCards.addEventListener('click', handleVenueActionClick);

  venueGrid.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-action="compare"]');
    if (!checkbox) return;
    const applied = toggleCompareVenue(checkbox.dataset.venueId, checkbox.checked);
    if (!applied) checkbox.checked = false;
  });
  featuredVenuesRow.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-action="compare"]');
    if (!checkbox) return;
    const applied = toggleCompareVenue(checkbox.dataset.venueId, checkbox.checked);
    if (!applied) checkbox.checked = false;
  });
  featuredVenuesRow.addEventListener('scroll', updateFeaturedRailUI, { passive: true });
  featuredPrevBtn.addEventListener('click', () => {
    stepFeaturedRail(-1);
  });
  featuredNextBtn.addEventListener('click', () => {
    stepFeaturedRail(1);
  });
  featuredDots.addEventListener('click', (event) => {
    const button = event.target.closest('[data-featured-index]');
    if (!button) return;
    stopFeaturedAutoScroll();
    scrollFeaturedToIndex(Number(button.dataset.featuredIndex));
  });

  clearCompareBtn.addEventListener('click', () => {
    state.compareVenueIds = [];
    renderCompareBar();
    renderVenueGrid();
    renderFeaturedVenues();
  });
  openCompareModalBtn.addEventListener('click', () => {
    buildCompareTable();
    openModal(compareModal);
  });
  closeCompareModalBtn.addEventListener('click', () => closeModal(compareModal));
  compareModal.addEventListener('click', (event) => {
    if (event.target === compareModal) closeModal(compareModal);
  });

  closeVenueQuickViewBtn.addEventListener('click', () => closeModal(venueQuickViewModal));
  venueQuickViewModal.addEventListener('click', (event) => {
    if (event.target === venueQuickViewModal) closeModal(venueQuickViewModal);
  });
  venueModalDots.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-image-index]');
    if (!dot || !state.detailVenue) return;
    state.detailImageIndex = Number(dot.dataset.imageIndex);
    renderVenueModalGallery(state.detailVenue);
  });
  confirmVenueSelectionBtn.addEventListener('click', () => {
    if (state.detailVenue) chooseVenue(state.detailVenue);
  });
  toggleWishlistModalBtn.addEventListener('click', () => {
    if (state.detailVenue) toggleWishlist(state.detailVenue.id);
  });

  eventTypeSelect.addEventListener('change', refreshVenueSuggestions);
  eventDateInput.addEventListener('change', () => {
    refreshVenueSuggestions();
    if (eventDateInput.value === toLocalDateInputValue()) {
      eventTimeInput.min = toLocalDateTimeInputValue().slice(11);
    } else {
      eventTimeInput.removeAttribute('min');
    }
    // Trigger availability check whenever date changes
    clearTimeout(eventDateInput._availabilityTimer);
    eventDateInput._availabilityTimer = setTimeout(() => checkVenueAvailability(), 400);
  });
  venueSearchGovernorate.addEventListener('change', () => {
    if (!eventGovernorateSelect.value) eventGovernorateSelect.value = normalizeGovernorateName(venueSearchGovernorate.value);
    refreshVenueSuggestions();
    refreshVenueCatalog();
  });

  onlineAttendeesInput.addEventListener('input', () => {
    if (state.venueType === 'online') standardSeatsInput.value = onlineAttendeesInput.value || 0;
    updateCapacityUI();
  });
  [standardSeatsInput, specialSeatsInput, vipSeatsInput].forEach((input) => input.addEventListener('input', updateCapacityUI));
  prevBtn.addEventListener('click', () => setStep(state.currentStep - 1));
  nextBtn.addEventListener('click', () => {
    if (validateStep(state.currentStep)) setStep(state.currentStep + 1);
  });
  createBtn.addEventListener('click', () => {
    if (validateAll()) openReviewModal();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.currentStep === TOTAL_STEPS - 1) {
      if (validateAll()) openReviewModal();
    } else if (validateStep(state.currentStep)) {
      setStep(state.currentStep + 1);
    }
  });
  mapSearchBtn.addEventListener('click', searchMapLocation);
  mapSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchMapLocation();
    }
  });
  closeReviewModalBtn.addEventListener('click', closeReviewModal);
  editEventBtn.addEventListener('click', closeReviewModal);
  confirmCreateBtn.addEventListener('click', submitDraft);
  reviewModal.addEventListener('click', (event) => {
    if (event.target === reviewModal) closeReviewModal();
  });

  noVenuesState.addEventListener('click', (event) => {
    const resetButton = event.target.closest('[data-action="reset-filters"]');
    if (!resetButton) return;
    clearAllFiltersBtn.click();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openModalElement = [compareModal, venueQuickViewModal, reviewModal, successOverlay]
      .find((modal) => modal.classList.contains('open'));
    if (openModalElement) closeModal(openModalElement);
  });
  window.addEventListener('resize', updateFeaturedRailUI);

  document.addEventListener('DOMContentLoaded', async () => {
    bindMenu();
    initMap();
    populateGovernorateSelect(venueSearchGovernorate, 'All Governorates');
    populateGovernorateSelect(eventGovernorateSelect, 'Select Governorate');
    renderCategoryFilters();
    renderAmenityFilters();
    eventDateInput.min = toLocalDateInputValue();
    document.getElementById('registration-deadline').min = toLocalDateTimeInputValue();
    updateFilterLabels();
    updateCapacityUI();
    setViewMode('grid');
    setActiveVenueTab('browse');
    setStep(0);
    startFeaturedAutoScroll();
    await loadFeaturedVenues();
    await refreshVenueSuggestions();
  });
})();




