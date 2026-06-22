(function () {
  let currentPrice = 0;
  let prices = { standard: 0, special: 0, vip: 0 };
  let availability = { standard: 0, special: 0, vip: 0 };
  let seatMapData = { limits: { standard: 0, special: 0, vip: 0 }, taken: { Standard: [], Special: [], Vip: [] } };
  let selectedSeats = [];
  let appliedPromoCode = null;
  let promoData = null;
  let walletBalance = 0;
  let currentStep = 1;
  let currentEvent = null;

  const MAX_SELECTABLE_SEATS = 8;
  const ticketDescriptions = {
    standard: 'General access seating.',
    special: 'Closer viewing area with added perks.',
    vip: 'Premium placement and priority access.'
  };

  const seatTypeSelect = document.getElementById('seatType');
  const seatMapGrid = document.getElementById('seatMapGrid');
  const selectedSeatsInput = document.getElementById('selectedSeatsInput');
  const paymentStatusMsg = document.getElementById('paymentStatusMsg');
  const splitAmountSection = document.getElementById('splitAmountSection');
  const walletSplitAmountInput = document.getElementById('walletSplitAmount');
  const walletSplitRange = document.getElementById('walletSplitRange');
  const walletOnlyHint = document.getElementById('walletOnlyHint');
  const walletOnlyRadio = document.getElementById('paymentOptionWallet');
  const cardOnlyRadio = document.getElementById('paymentOptionCard');
  const splitRadio = document.getElementById('paymentOptionSplit');
  const cardFieldsWrap = document.getElementById('cardFields');
  const goToSeatsBtn = document.getElementById('goToSeatsBtn');
  const backToDetailsBtn = document.getElementById('backToDetailsBtn');
  const proceedToPaymentBtn = document.getElementById('proceedToPaymentBtn');
  const backToSeatsFromPayment = document.getElementById('backToSeatsFromPayment');
  const waitlistBtn = document.getElementById('waitlistBtn');
  const applyPromoBtn = document.getElementById('applyPromoBtn');
  const promoMsg = document.getElementById('promoMsg');
  const promoAppliedBadge = document.getElementById('promoAppliedBadge');
  const maxSeatsWarning = document.getElementById('maxSeatsWarning');
  const seatMapInfo = document.getElementById('seatMapInfo');
  const selectedSeatsList = document.getElementById('selectedSeatsList');
  const orderSeatLines = document.getElementById('orderSeatLines');
  const subtotalValue = document.getElementById('subtotalValue');
  const discountRow = document.getElementById('discountRow');
  const discountValue = document.getElementById('discountValue');
  const finalTotalValue = document.getElementById('finalTotalValue');
  const cancelPaymentLink = document.getElementById('cancelPaymentLink');

  const paymentOptionCards = [
    { radio: walletOnlyRadio, card: document.getElementById('paymentOptionWalletCard') },
    { radio: cardOnlyRadio, card: document.getElementById('paymentOptionCardCard') },
    { radio: splitRadio, card: document.getElementById('paymentOptionSplitCard') }
  ];

  const cardFieldIds = ['cardNumberInput', 'cardNameInput', 'expiryInput', 'cvcInput'];

  const inputs = {
    number: document.getElementById('cardNumberInput'),
    name: document.getElementById('cardNameInput'),
    expiry: document.getElementById('expiryInput'),
    cvc: document.getElementById('cvcInput')
  };

  const displays = {
    number: document.getElementById('displayCardNumber'),
    name: document.getElementById('displayCardName'),
    expiry: document.getElementById('displayExpiry'),
    cvc: document.getElementById('displayCvc'),
    brand: document.getElementById('cardBrandLogo')
  };

  const cardInner = document.getElementById('cardInner');

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
    return `${day} · ${time}`;
  }

  function ticketLabel(type) {
    const map = { standard: 'Standard', special: 'Special', vip: 'VIP' };
    return map[String(type || '').toLowerCase()] || 'Standard';
  }

  function typeToKey(type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  function getEventId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('eventId') || localStorage.getItem('selectedEventId');
  }

  function getAuthToken() {
    return localStorage.getItem('token');
  }

  function setPaymentStatus(message, isError = true) {
    paymentStatusMsg.textContent = message || '';
    paymentStatusMsg.style.color = isError ? '#ffb8b8' : '#98f5ca';
  }

  function setStep(step) {
    currentStep = step;
    document.querySelectorAll('[data-step-panel]').forEach((panel) => {
      panel.classList.toggle('active', Number(panel.getAttribute('data-step-panel')) === step);
    });

    document.querySelectorAll('.progress-step').forEach((item) => {
      const stepValue = Number(item.getAttribute('data-step'));
      const check = item.querySelector('.progress-check');
      item.classList.remove('current', 'completed');
      if (stepValue < step) {
        item.classList.add('completed');
        if (check) check.textContent = String.fromCharCode(10003);
      } else if (stepValue === step) {
        item.classList.add('current');
        if (check) check.textContent = String(stepValue);
      } else if (check) {
        check.textContent = String(stepValue);
      }
    });
  }

  function getSubtotal() {
    const type = seatTypeSelect.value;
    return Number(prices[type] || 0) * selectedSeats.length;
  }

  function computePerSeatPromoDiscount(discountType, discountValue, unitPrice) {
    let perTicketDiscount = 0;
    if (discountType === 'percent') {
      perTicketDiscount = unitPrice * (discountValue / 100);
    } else {
      perTicketDiscount = discountValue;
    }
    return Math.max(0, Math.min(unitPrice, Number(perTicketDiscount.toFixed(2))));
  }

  function getPromoDiscount(subtotal) {
    if (!promoData || !appliedPromoCode) return 0;
    const seatCount = Math.max(1, selectedSeats.length);
    const unitPrice = Number(prices[seatTypeSelect.value] || 0);
    const discountType = String(promoData.discountType || '').toLowerCase();
    const discountValueLocal = Number(promoData.discountValue || 0);
    const perTicketDiscount = computePerSeatPromoDiscount(discountType, discountValueLocal, unitPrice);
    const discount = Number((perTicketDiscount * seatCount).toFixed(2));
    return Math.max(0, Math.min(subtotal, discount));
  }

  function recalculateTotals() {
    const subtotal = getSubtotal();
    const discount = getPromoDiscount(subtotal);
    currentPrice = Math.max(0, Number((subtotal - discount).toFixed(2)));

    subtotalValue.textContent = formatMoney(subtotal);
    finalTotalValue.textContent = formatMoney(currentPrice);
    document.getElementById('summaryTotal').textContent = formatMoney(currentPrice);

    if (discount > 0) {
      discountRow.classList.remove('hidden');
      discountValue.textContent = `-${formatMoney(discount)}`;
      promoAppliedBadge.classList.remove('hidden');
    } else {
      discountRow.classList.add('hidden');
      promoAppliedBadge.classList.add('hidden');
      discountValue.textContent = '-0.00 EGP';
    }

    document.getElementById('summarySeatCount').textContent = String(selectedSeats.length);
    document.getElementById('summaryTicketType').textContent = ticketLabel(seatTypeSelect.value);

    updateOrderLines();
    updateSelectedSeatsList();
    updatePaymentOptionUI();
  }

  function updateSummaryCards() {
    const type = seatTypeSelect.value;
    document.getElementById('eventSummaryTicketType').textContent = ticketLabel(type);
    document.getElementById('eventSummaryPrice').textContent = formatMoney(prices[type] || 0);
    document.getElementById('summaryTicketType').textContent = ticketLabel(type);
  }

  function updateOrderLines() {
    const type = seatTypeSelect.value;
    const unit = Number(prices[type] || 0);

    if (!selectedSeats.length) {
      orderSeatLines.innerHTML = '<p class="order-empty">No seats selected yet.</p>';
      return;
    }

    orderSeatLines.innerHTML = selectedSeats
      .slice()
      .sort((a, b) => a - b)
      .map((seat) => `
        <div class="order-line">
          <span>Seat ${seat} (${ticketLabel(type)})</span>
          <strong>${formatMoney(unit)}</strong>
        </div>
      `)
      .join('');
  }

  function updateSelectedSeatsList() {
    if (!selectedSeats.length) {
      selectedSeatsList.textContent = 'No seats selected yet.';
      return;
    }
    const seats = selectedSeats.slice().sort((a, b) => a - b).join(', ');
    selectedSeatsList.textContent = `Seats: ${seats} · Running Total: ${formatMoney(currentPrice)}`;
  }

  function clearSeatWarning() {
    maxSeatsWarning.classList.add('hidden');
    maxSeatsWarning.textContent = '';
  }

  function showSeatWarning(message) {
    maxSeatsWarning.classList.remove('hidden');
    maxSeatsWarning.textContent = message;
  }

  function setPromoMessage(message, isSuccess = false) {
    promoMsg.textContent = message || '';
    promoMsg.style.color = isSuccess ? '#98f5ca' : '#9fbdcb';
  }

  function renderTicketCards() {
    const currentType = seatTypeSelect.value;
    document.querySelectorAll('.ticket-card').forEach((card) => {
      const type = card.getAttribute('data-type');
      const remaining = Number(availability[type] || 0);
      const priceEl = card.querySelector(`[data-price="${type}"]`);
      const remainingEl = card.querySelector(`[data-remaining="${type}"]`);
      const desc = card.querySelector('.ticket-description');

      if (priceEl) priceEl.textContent = formatMoney(prices[type] || 0);
      if (remainingEl) remainingEl.textContent = `${remaining} seat${remaining === 1 ? '' : 's'} left`;
      if (desc) desc.textContent = ticketDescriptions[type] || '';

      card.classList.toggle('active', type === currentType);
      card.classList.toggle('disabled', remaining <= 0);
    });

    updateSummaryCards();
  }

  function isEventFull() {
    return currentEvent && Number(currentEvent.available_seats || 0) <= 0;
  }

  function updateWaitlistButton() {
    waitlistBtn.classList.toggle('hidden', !isEventFull());
  }
  async function fetchEventAndSeatMap() {
    const eventId = getEventId();
    if (!eventId) return false;

    try {
      const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
      const [eventRes, seatMapRes] = await Promise.all([
        fetch(`${API_BASE}/Events/${eventId}`),
        fetch(`${API_BASE}/Events/${eventId}/seat-map`)
      ]);
      const eventData = await eventRes.json();
      const seatMapResData = await seatMapRes.json();

      if (eventData.success && eventData.event) {
        const event = eventData.event;
        currentEvent = event;
        prices.standard = Number(event.price_standard || 0);
        prices.special = Number(event.price_special || 0);
        prices.vip = Number(event.price_vip || 0);
        availability.standard = Number(event.available_standard || 0);
        availability.special = Number(event.available_special || 0);
        availability.vip = Number(event.available_vip || 0);

        if (event.limit_standard != null) seatMapData.limits.standard = Number(event.limit_standard || 0);
        if (event.limit_special != null) seatMapData.limits.special = Number(event.limit_special || 0);
        if (event.limit_vip != null) seatMapData.limits.vip = Number(event.limit_vip || 0);

        document.getElementById('summaryEventTitle').textContent = event.title || 'Selected Event';
        document.getElementById('eventSummaryTitle').textContent = event.title || '-';
        document.getElementById('eventSummaryDate').textContent = formatDateTime(event.event_date);
        document.getElementById('eventSummaryLocation').textContent = event.location || '-';
        document.getElementById('summaryEventMeta').textContent = `${formatDateTime(event.event_date)} · ${event.location || 'Location TBA'}`;
      }

      if (seatMapResData.success && seatMapResData.limits) {
        seatMapData.limits = Object.assign({}, seatMapData.limits, seatMapResData.limits);
        seatMapData.taken = seatMapResData.taken || { Standard: [], Special: [], Vip: [] };
      }

      renderTicketCards();
      updateWaitlistButton();
      renderSeatMap();
      recalculateTotals();
      return true;
    } catch (error) {
      console.error('Error fetching event / seat map:', error);
      return false;
    }
  }

  function chooseTicketType(type) {
    if (!['standard', 'special', 'vip'].includes(type)) return;
    if (Number(availability[type] || 0) <= 0) return;

    seatTypeSelect.value = type;
    selectedSeats = [];
    selectedSeatsInput.value = '';
    clearSeatWarning();
    renderTicketCards();
    renderSeatMap();
    recalculateTotals();
  }

  function renderSeatMap() {
    const type = seatTypeSelect.value;
    const limit = Number(seatMapData.limits[type] || 0);
    const taken = seatMapData.taken[typeToKey(type)] || [];
    const takenSet = new Set((taken || []).map((value) => Number(value)));

    seatMapGrid.innerHTML = '';
    clearSeatWarning();

    if (limit <= 0) {
      seatMapInfo.textContent = 'No seats available for this ticket type.';
      return;
    }

    seatMapInfo.textContent = `Select up to ${MAX_SELECTABLE_SEATS} seats. Booked seats are disabled.`;

    for (let num = 1; num <= limit; num += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat-btn';
      btn.textContent = String(num);
      btn.dataset.seat = String(num);

      if (takenSet.has(num)) {
        btn.classList.add('taken');
        btn.disabled = true;
      }

      if (selectedSeats.includes(num)) {
        btn.classList.add('selected');
      }

      if (!btn.disabled) {
        btn.addEventListener('click', () => {
          const alreadySelected = selectedSeats.includes(num);

          if (alreadySelected) {
            selectedSeats = selectedSeats.filter((seat) => seat !== num);
            clearSeatWarning();
          } else {
            if (selectedSeats.length >= MAX_SELECTABLE_SEATS) {
              showSeatWarning(`Maximum ${MAX_SELECTABLE_SEATS} seats can be selected in one booking.`);
              return;
            }
            selectedSeats.push(num);
            selectedSeats.sort((a, b) => a - b);
            clearSeatWarning();
          }

          selectedSeatsInput.value = selectedSeats.join(',');
          renderSeatMap();
          recalculateTotals();
        });
      }

      seatMapGrid.appendChild(btn);
    }
  }

  function getSelectedPaymentMethod() {
    const selected = document.querySelector('input[name="paymentOption"]:checked');
    return selected ? selected.value : 'card';
  }

  function setCardFieldsEnabled(enabled) {
    cardFieldIds.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.disabled = !enabled;
      input.required = enabled;
    });
    cardFieldsWrap.classList.toggle('hidden', !enabled);
  }

  function syncSplitInputs(source) {
    const maxAllowed = Math.max(0, Math.min(walletBalance, currentPrice));
    let value = Number(source === 'range' ? walletSplitRange.value : walletSplitAmountInput.value);

    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > maxAllowed) value = maxAllowed;

    walletSplitAmountInput.value = value.toFixed(2);
    walletSplitRange.value = value.toFixed(2);
    updateSplitCalculationLine();
    updatePayButtonLabel();
  }

  function updateSplitCalculationLine() {
    const splitLine = document.getElementById('splitCalculationLine');
    if (!splitLine) return;

    const walletPart = Math.max(0, Math.min(currentPrice, Number(walletSplitAmountInput.value || 0)));
    const cardPart = Math.max(0, Number((currentPrice - walletPart).toFixed(2)));
    splitLine.textContent = `Wallet: ${walletPart.toFixed(2)} EGP + Card: ${cardPart.toFixed(2)} EGP = Total: ${currentPrice.toFixed(2)} EGP`;
  }

  function updatePayButtonLabel() {
    const btnText = document.getElementById('btnText');
    const method = getSelectedPaymentMethod();

    if (method === 'split') {
      const walletPart = Math.max(0, Math.min(currentPrice, Number(walletSplitAmountInput.value || 0)));
      const cardPart = Math.max(0, Number((currentPrice - walletPart).toFixed(2)));
      btnText.textContent = `Pay ${cardPart.toFixed(2)} EGP`;
      return;
    }
    btnText.textContent = `Pay ${currentPrice.toFixed(2)} EGP`;
  }

  function updatePaymentOptionUI() {
    const walletDisplay = document.getElementById('walletBalanceDisplay');
    walletDisplay.textContent = formatMoney(walletBalance);

    const insufficientWallet = walletBalance < currentPrice;
    walletOnlyRadio.disabled = insufficientWallet;
    document.getElementById('paymentOptionWalletCard').classList.toggle('disabled', insufficientWallet);
    walletOnlyHint.classList.toggle('hidden', !insufficientWallet);

    const maxWalletForSplit = Math.max(0, Math.min(walletBalance, currentPrice));
    walletSplitAmountInput.max = maxWalletForSplit.toFixed(2);
    walletSplitRange.max = maxWalletForSplit.toFixed(2);

    if (getSelectedPaymentMethod() === 'wallet' && insufficientWallet) {
      cardOnlyRadio.checked = true;
    }

    syncSplitInputs('number');

    const activeMethod = getSelectedPaymentMethod();
    setCardFieldsEnabled(activeMethod !== 'wallet');
    splitAmountSection.classList.toggle('hidden', activeMethod !== 'split');

    paymentOptionCards.forEach(({ radio, card }) => {
      if (!radio || !card) return;
      card.classList.toggle('active', radio.checked);
    });

    updatePayButtonLabel();
  }
  function detectCardBrand(rawDigits) {
    const digits = String(rawDigits || '');
    if (/^4/.test(digits)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
    if (/^3[47]/.test(digits)) return 'AMEX';
    return 'CARD';
  }

  function attachPaymentPreviewHandlers() {
    inputs.number.addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
      const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
      event.target.value = formatted;
      displays.number.textContent = formatted || '#### #### #### ####';
      displays.brand.textContent = detectCardBrand(digits);
    });

    inputs.name.addEventListener('input', (event) => {
      displays.name.textContent = (event.target.value || 'YOUR NAME').toUpperCase();
    });

    inputs.expiry.addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
      let formatted = digits;
      if (digits.length >= 3) {
        formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      }
      if (formatted.length >= 2) {
        const mm = Number(formatted.slice(0, 2));
        if (Number.isFinite(mm) && mm > 12) {
          formatted = `12${formatted.length > 2 ? formatted.slice(2) : ''}`;
        }
      }
      event.target.value = formatted;
      displays.expiry.textContent = formatted || 'MM/YY';
    });

    inputs.cvc.addEventListener('focus', () => cardInner.classList.add('flip-it'));
    inputs.cvc.addEventListener('blur', () => cardInner.classList.remove('flip-it'));
    inputs.cvc.addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
      displays.cvc.textContent = '*'.repeat(event.target.value.length || 3);
    });
  }

  function validateStepOneDetails() {
    const fullName = document.getElementById('fullname').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();

    if (!fullName || !email || !phone) {
      alert('Please complete full name, email, and phone before continuing.');
      return false;
    }

    if (!seatTypeSelect.value) {
      alert('Please choose a ticket type first.');
      return false;
    }

    return true;
  }

  async function loadWalletBalance() {
    const token = getAuthToken();
    if (!token) {
      walletBalance = 0;
      updatePaymentOptionUI();
      return;
    }

    try {
      const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
      const response = await fetch(`${API_BASE}/wallet`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to load wallet balance');
      }
      walletBalance = Number(data.balance || 0);
    } catch (error) {
      console.error('Wallet load error:', error);
      walletBalance = 0;
      setPaymentStatus('Unable to load wallet balance. Card payment is still available.');
    }

    updatePaymentOptionUI();
  }

  async function applyPromoCode() {
    const eventId = getEventId();
    const code = String(document.getElementById('promoCodeInput').value || '').trim().toUpperCase();
    const subtotal = getSubtotal();

    if (!code) {
      setPromoMessage('Enter a promo code first.');
      return;
    }

    if (subtotal <= 0) {
      setPromoMessage('Select at least one seat before applying promo.');
      return;
    }

    try {
      const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
      const response = await fetch(`${API_BASE}/Events/${eventId}/promo/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          amount: subtotal,
          seatCount: selectedSeats.length,
          unitPrice: Number(prices[seatTypeSelect.value] || 0)
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        appliedPromoCode = null;
        promoData = null;
        setPromoMessage(data.message || 'Invalid promo code');
        recalculateTotals();
        return;
      }

      appliedPromoCode = code;
      promoData = data.promo || null;
      setPromoMessage(`Promo applied. Discount: ${Number(data.discount || 0).toFixed(2)} EGP`, true);
      recalculateTotals();
    } catch (error) {
      console.error('Promo error:', error);
      setPromoMessage('Failed to apply promo code.');
    }
  }

  async function joinWaitlist() {
    const token = getAuthToken();
    const eventId = getEventId();
    if (!token) {
      alert('Please sign in first.');
      return;
    }
    try {
      const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
      const response = await fetch(`${API_BASE}/Events/${eventId}/waitlist`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      alert(data.message || (response.ok ? 'Added to waitlist' : 'Failed to join waitlist'));
    } catch (error) {
      console.error('Waitlist error:', error);
      alert('Error joining waitlist.');
    }
  }

  async function autofillUserProfile() {
    const token = getAuthToken();
    if (!token) return;

    const fullNameInput = document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');

    try {
      const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
      const response = await fetch(`${API_BASE}/Profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success && data.profile) {
        fullNameInput.value = data.profile.fullName || fullNameInput.value || '';
        emailInput.value = data.profile.email || emailInput.value || '';
        phoneInput.value = data.profile.phoneNumber || phoneInput.value || '';
        return;
      }
    } catch (error) {
      console.error('Profile autofill error:', error);
    }

    try {
      const fallback = JSON.parse(localStorage.getItem('user') || '{}');
      if (fallback) {
        fullNameInput.value = fullNameInput.value || fallback.fullName || fallback.username || '';
        emailInput.value = emailInput.value || fallback.email || '';
      }
    } catch (_) {}
  }

  function resetPaymentFormState() {
    document.getElementById('paymentForm').reset();
    cardOnlyRadio.checked = true;
    walletSplitAmountInput.value = '0.00';
    walletSplitRange.value = '0.00';
    setPaymentStatus('');
    displays.number.textContent = '#### #### #### ####';
    displays.name.textContent = 'YOUR NAME';
    displays.expiry.textContent = 'MM/YY';
    displays.cvc.textContent = '***';
    displays.brand.textContent = 'CARD';

    document.getElementById('btnText').style.display = 'inline';
    document.getElementById('btnLoader').style.display = 'none';
    document.getElementById('payButton').disabled = false;
  }

  function resetToBooking(startFromDetails = false) {
    resetPaymentFormState();
    setStep(startFromDetails ? 1 : 2);
    updatePaymentOptionUI();
  }
  async function handlePaymentSubmit(event) {
    event.preventDefault();

    const btn = document.getElementById('payButton');
    const txt = document.getElementById('btnText');
    const ldr = document.getElementById('btnLoader');
    const token = getAuthToken();

    if (!token) {
      alert('Please sign in to complete booking');
      window.location.href = 'signin.html';
      return;
    }

    const eventId = getEventId();
    if (!eventId) {
      alert('Event ID not found. Please select an event first.');
      window.location.href = 'book-event.html';
      return;
    }

    if (!selectedSeats.length) {
      setPaymentStatus('Please go back and select at least one seat.');
      return;
    }

    const paymentMethod = getSelectedPaymentMethod();
    let walletAmountToUse = 0;

    if (paymentMethod === 'wallet') {
      if (walletBalance < currentPrice) {
        setPaymentStatus('Wallet balance is insufficient for wallet-only payment.');
        return;
      }
      walletAmountToUse = currentPrice;
    } else if (paymentMethod === 'split') {
      walletAmountToUse = Number(walletSplitAmountInput.value || 0);
      if (!Number.isFinite(walletAmountToUse) || walletAmountToUse <= 0) {
        setPaymentStatus('Enter a valid wallet amount for split payment.');
        return;
      }
      if (walletAmountToUse > walletBalance) {
        setPaymentStatus('Wallet amount exceeds your available balance.');
        return;
      }
      if (walletAmountToUse >= currentPrice) {
        setPaymentStatus('For full wallet payment, choose "Wallet Only".');
        return;
      }
    }

    setPaymentStatus('');
    txt.style.display = 'none';
    ldr.style.display = 'inline-block';
    btn.disabled = true;

    const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';

    try {
      const payResponse = await fetch(`${API_BASE_URL}/wallet/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          eventId,
          seatNumbers: selectedSeats,
          ticketType: seatTypeSelect.value,
          paymentMethod,
          walletAmountToUse,
          promoCode: appliedPromoCode
        })
      });

      const payData = await payResponse.json().catch(() => ({}));
      if (!payResponse.ok || !payData.success) {
        setPaymentStatus(payData.message || 'Payment failed. Please try again.');
        txt.style.display = 'inline';
        ldr.style.display = 'none';
        btn.disabled = false;
        return;
      }

      const bookingId = (payData.booking && payData.booking.id) ? payData.booking.id : null;
      if (!bookingId) {
        setPaymentStatus('Booking was created but no booking ID was returned. Check My Events.', true);
        txt.style.display = 'inline';
        ldr.style.display = 'none';
        btn.disabled = false;
        return;
      }

      walletBalance = Number(payData.wallet?.balance || walletBalance);
      updatePaymentOptionUI();

      try {
        await fetch(`${API_BASE_URL}/Favorites/${eventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (favError) {
        console.log('Error removing from favorites:', favError);
      }

      window.location.href = `accepted-event.html?bookingId=${bookingId}&eventId=${eventId}`;
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus(`Error processing payment. ${error.message || ''}`);
      txt.style.display = 'inline';
      ldr.style.display = 'none';
      btn.disabled = false;
    }
  }

  function bindEvents() {
    document.getElementById('ticketCards').addEventListener('click', (event) => {
      const card = event.target.closest('.ticket-card[data-type]');
      if (!card || card.classList.contains('disabled')) return;
      chooseTicketType(card.getAttribute('data-type'));
    });

    goToSeatsBtn.addEventListener('click', () => {
      if (!validateStepOneDetails()) return;
      setStep(2);
    });

    backToDetailsBtn.addEventListener('click', () => setStep(1));

    proceedToPaymentBtn.addEventListener('click', async () => {
      if (!selectedSeats.length) {
        alert('Please select at least one seat before continuing to payment.');
        return;
      }
      await loadWalletBalance();
      setStep(3);
    });

    backToSeatsFromPayment.addEventListener('click', () => resetToBooking(false));

    applyPromoBtn.addEventListener('click', applyPromoCode);
    waitlistBtn.addEventListener('click', joinWaitlist);

    document.querySelectorAll('input[name="paymentOption"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        setPaymentStatus('');
        updatePaymentOptionUI();
      });
    });

    walletSplitAmountInput.addEventListener('input', () => syncSplitInputs('number'));
    walletSplitRange.addEventListener('input', () => syncSplitInputs('range'));

    cancelPaymentLink.addEventListener('click', (event) => {
      event.preventDefault();
      resetToBooking(false);
    });

    document.getElementById('makeAnotherBookingBtn').addEventListener('click', () => resetToBooking(true));
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
  }

  async function initializeFlow() {
    const eventId = getEventId();
    if (!eventId) {
      alert('Please select an event first.');
      window.location.href = 'book-event.html';
      return;
    }

    setStep(1);
    await Promise.all([fetchEventAndSeatMap(), autofillUserProfile()]);
    attachPaymentPreviewHandlers();
    bindEvents();
    recalculateTotals();
    updatePaymentOptionUI();
  }

  document.addEventListener('DOMContentLoaded', initializeFlow);
})();


