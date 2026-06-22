(function () {
  const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
  const BRAND_META = {
    visa: { icon: 'fab fa-cc-visa', label: 'Visa' },
    mastercard: { icon: 'fab fa-cc-mastercard', label: 'Mastercard' },
    unknown: { icon: 'far fa-credit-card', label: 'Card' }
  };

  let draft = null;
  let walletBalance = 0;
  let paymentMethod = 'card';

  function money(value, withDecimals = false) {
    return `${Number(value || 0).toLocaleString('en-US', withDecimals ? {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    } : {})} EGP`;
  }

  function listingFee(totalSeats) {
    const seats = Math.max(0, Number(totalSeats || 0));
    if (seats <= 500) return { tier: 'Small', fee: 5000 };
    if (seats <= 1000) return { tier: 'Medium', fee: 8000 };
    return { tier: 'Large', fee: 12000 };
  }

  function totalDue() {
    return Number((Number(draft?.listingFee || 0) + Number(draft?.venueFee || 0)).toFixed(2));
  }

  function storeVenueConfirmation({ eventId, paymentData }) {
    const payment = paymentData?.payment || {};
    const venueBooking = paymentData?.venueBooking || {};
    const payload = {
      eventId,
      eventName: draft.title || 'Untitled Event',
      venueName: draft.selectedVenue?.name || 'Venue',
      venueGovernorate: draft.selectedVenue?.governorate || draft.governorate || '',
      eventDate: draft.eventDate || '',
      totalPaid: totalDue(),
      bookingReference: venueBooking.id || draft.venueBookingId || payment.transactionId || 'N/A',
      transactionId: payment.transactionId || 'N/A',
      venueBookingId: venueBooking.id || draft.venueBookingId || null,
      listingFee: Number(draft.listingFee || 0),
      venueFee: Number(draft.venueFee || 0),
      manageUrl: eventId ? `manage-event.html?id=${encodeURIComponent(eventId)}` : 'my-events.html',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('venueBookingConfirmation', JSON.stringify(payload));
  }

  function detectCardBrand(cardDigits) {
    if (/^4/.test(cardDigits)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(cardDigits)) return 'mastercard';
    return 'unknown';
  }

  function setCardBrand(brandKey) {
    const meta = BRAND_META[brandKey] || BRAND_META.unknown;
    document.getElementById('cardBrandIndicator').innerHTML = `<i class="${meta.icon}" aria-hidden="true"></i><span class="card-brand-label">${meta.label}</span>`;
    document.getElementById('inlineCardBrand').innerHTML = `<i class="${meta.icon}" aria-hidden="true"></i><span>${meta.label}</span>`;
  }

  function getSelectedWalletAmount() {
    if (paymentMethod === 'wallet') return totalDue();
    if (paymentMethod !== 'split') return 0;
    return Math.max(0, Math.min(totalDue(), Number(document.getElementById('walletSplitAmount').value || 0)));
  }

  function getCardAmount() {
    return Math.max(0, Number((totalDue() - getSelectedWalletAmount()).toFixed(2)));
  }

  async function apiRequest(path, options) {
    const token = localStorage.getItem('token');
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {})
      }
    });
  }

  function updateOptionCards() {
    document.querySelectorAll('[data-payment-option]').forEach((item) => {
      item.classList.toggle('active', item.dataset.paymentOption === paymentMethod);
      item.classList.toggle('disabled', item.dataset.paymentOption === 'wallet' && walletBalance < totalDue());
    });

    const splitSection = document.getElementById('splitAmountSection');
    splitSection.classList.toggle('hidden', paymentMethod !== 'split');
    document.getElementById('cardFieldsWrap').classList.toggle('hidden', paymentMethod === 'wallet');
    document.getElementById('walletOnlyHint').classList.toggle('hidden', !(walletBalance < totalDue() && paymentMethod !== 'card'));
    updateSplitUI();
  }

  function updateSplitUI() {
    const maxWallet = Math.max(0, Math.min(walletBalance, totalDue()));
    const splitRange = document.getElementById('walletSplitRange');
    const splitInput = document.getElementById('walletSplitAmount');
    splitRange.max = maxWallet.toFixed(2);
    splitInput.max = maxWallet.toFixed(2);

    let value = Number(splitInput.value || 0);
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > maxWallet) value = maxWallet;
    splitInput.value = value.toFixed(2);
    splitRange.value = value.toFixed(2);

    document.getElementById('splitCalculationLine').textContent =
      `Wallet: ${money(getSelectedWalletAmount(), true)} + Card: ${money(getCardAmount(), true)} = Total: ${money(totalDue(), true)}`;

    document.getElementById('btnText').textContent = `Pay ${money(totalDue(), true)}`;
    document.getElementById('paymentBreakdownLabel').textContent = paymentMethod === 'split'
      ? `Wallet ${money(getSelectedWalletAmount(), true)} Â· Card ${money(getCardAmount(), true)}`
      : paymentMethod === 'wallet'
        ? 'Wallet only'
        : 'Card only';
  }

  async function loadWalletBalance() {
    try {
      const response = await apiRequest('/wallet', { method: 'GET' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to load wallet balance');
      walletBalance = Number(data.balance || 0);
    } catch (error) {
      walletBalance = 0;
      console.error('Wallet load failed:', error);
    }

    document.getElementById('walletBalanceDisplay').textContent = money(walletBalance, true);
    document.getElementById('paymentOptionWallet').disabled = walletBalance < totalDue();
    if (walletBalance < totalDue() && paymentMethod === 'wallet') paymentMethod = 'card';
    updateOptionCards();
  }

  async function ensureVenueBooking() {
    return null;
  }

  function populateSummary() {
    const listing = listingFee(draft.maxSeats);
    const isOnline = draft.location_type === 'online';
    draft.listingFee = Number(draft.listingFee || listing.fee);
    draft.venueFee = draft.venueType === 'platform_booked'
      ? Number(draft.venueFee || draft.selectedVenue?.pricePerDay || 0)
      : 0;
    localStorage.setItem('eventDraft', JSON.stringify(draft));

    document.getElementById('eventNameSummary').textContent = draft.title || 'Untitled Event';
    document.getElementById('summaryVenueMode').textContent = isOnline ? 'Online Event' : (draft.venueType === 'platform_booked' ? 'Platform Venue' : 'My Venue');
    document.getElementById('summaryTotalPill').textContent = money(totalDue());
    document.getElementById('hostNameDisplay').textContent = draft.hostName || '-';
    document.getElementById('hostEmailDisplay').textContent = draft.hostEmail || '-';
    document.getElementById('hostPhoneDisplay').textContent = draft.hostPhone || '-';
    document.getElementById('venueNameLabel').textContent = isOnline ? (draft.onlinePlatform || 'Online platform') : (draft.selectedVenue?.name || 'Own venue');
    document.getElementById('eventDateLabel').textContent = draft.eventDate || '-';
    document.getElementById('seatBreakdownLabel').textContent = isOnline
      ? `${draft.maxSeats || draft.standardSeats || 0} attendees`
      : `Standard ${draft.standardSeats || 0} · Special ${draft.specialSeats || 0} · VIP ${draft.vipSeats || 0}`;
    document.getElementById('listingFeeAmount').textContent = money(draft.listingFee);
    document.getElementById('orderTotalFee').textContent = money(totalDue());
    document.getElementById('summaryListingFee').textContent = `${listing.tier} listing`;
    document.getElementById('venueFeeRow').classList.toggle('hidden', draft.venueType !== 'platform_booked');
    document.getElementById('venueFeeAmount').textContent = money(draft.venueFee);
    document.getElementById('summaryNote').textContent = isOnline
      ? 'Only the platform listing fee is due because this event is hosted online.'
      : draft.venueType === 'platform_booked'
      ? 'The platform listing fee and selected venue fee are due now. The venue request is sent after admin approval.'
      : 'Only the platform listing fee is due because you are using your own venue.';
    document.getElementById('successMessage').textContent = draft.venueType === 'platform_booked'
      ? 'Your event was submitted. The venue owner request will be sent after admin approval.'
      : isOnline
        ? 'Your online event is live and ready for attendees.'
        : 'Your event is live and ready for attendees.';
  }

  function setupCardPreview() {
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
      cvc: document.getElementById('displayCvc')
    };
    const cardInner = document.getElementById('cardInner');

    inputs.number.addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
      const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
      event.target.value = formatted;
      displays.number.textContent = formatted || '#### #### #### ####';
      setCardBrand(detectCardBrand(digits));
    });
    inputs.name.addEventListener('input', (event) => {
      displays.name.textContent = event.target.value || 'YOUR NAME';
    });
    inputs.expiry.addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
      const month = digits.slice(0, 2);
      const year = digits.slice(2, 4);
      event.target.value = year ? `${month}/${year}` : month;
      displays.expiry.textContent = `${month.padEnd(2, 'M')}/${year.padEnd(2, 'Y')}`;
    });
    inputs.cvc.addEventListener('focus', () => cardInner.classList.add('flip-it'));
    inputs.cvc.addEventListener('blur', () => cardInner.classList.remove('flip-it'));
    inputs.cvc.addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
      event.target.value = digits;
      displays.cvc.textContent = digits ? '*'.repeat(digits.length) : '***';
    });
    setCardBrand('unknown');
  }

  function validateCardFields() {
    if (paymentMethod === 'wallet') return true;
    return ['cardNumberInput', 'cardNameInput', 'expiryInput', 'cvcInput']
      .map((id) => document.getElementById(id))
      .every((input) => {
        if (input.value.trim()) return true;
        input.reportValidity();
        return false;
      });
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'signin.html';
      return;
    }
    if (!validateCardFields()) return;
    if (paymentMethod === 'wallet' && walletBalance < totalDue()) {
      window.alert('Wallet balance is insufficient.');
      return;
    }

    const payButton = document.getElementById('payButton');
    const btnText = document.getElementById('btnText');
    const loader = document.getElementById('btnLoader');
    btnText.style.display = 'none';
    loader.style.display = 'block';
    payButton.disabled = true;

    try {
      let eventId = draft.pendingEventId || null;

      if (!eventId) {
        const createResponse = await apiRequest('/Events', {
          method: 'POST',
          body: JSON.stringify(draft)
        });
        const createData = await createResponse.json();
        if (!createResponse.ok || !createData.success || !createData.event?.id) {
          throw new Error(createData.message || 'Failed to create event');
        }
        eventId = createData.event.id;
        draft.pendingEventId = eventId;
        localStorage.setItem('eventDraft', JSON.stringify(draft));
      }

      const paymentResponse = await apiRequest('/Payments', {
        method: 'POST',
        body: JSON.stringify({
          amount: totalDue(),
          paymentMethod,
          walletAmountToUse: paymentMethod === 'split' ? getSelectedWalletAmount() : 0,
          eventId,
          venueBookingId: draft.venueBookingId
        })
      });
      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.message || 'Payment processing failed');
      }

      document.getElementById('successOverlay').classList.add('success-visible');
      localStorage.removeItem('eventDraft');
    } catch (error) {
      console.error('Publish payment failed:', error);
      window.alert(error.message || 'Payment failed after creating the draft event.');
      btnText.style.display = 'inline';
      loader.style.display = 'none';
      payButton.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const rawDraft = localStorage.getItem('eventDraft');
    if (!rawDraft) {
      window.location.href = 'create-event.html';
      return;
    }

    try {
      draft = JSON.parse(rawDraft);
    } catch (_) {
      window.location.href = 'create-event.html';
      return;
    }

    populateSummary();
    setupCardPreview();

    document.querySelectorAll('[data-payment-option]').forEach((card) => {
      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;
        paymentMethod = card.dataset.paymentOption;
        document.getElementById(`paymentOption${paymentMethod[0].toUpperCase()}${paymentMethod.slice(1)}`).checked = true;
        updateOptionCards();
      });
    });

    document.getElementById('walletSplitRange').addEventListener('input', (event) => {
      document.getElementById('walletSplitAmount').value = Number(event.target.value || 0).toFixed(2);
      updateSplitUI();
    });
    document.getElementById('walletSplitAmount').addEventListener('input', (event) => {
      document.getElementById('walletSplitRange').value = Number(event.target.value || 0).toFixed(2);
      updateSplitUI();
    });
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);

    await ensureVenueBooking();
    await loadWalletBalance();
    updateOptionCards();
  });
})();



