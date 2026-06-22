(function () {
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';
  const amountDisplay = document.getElementById('topupAmountDisplay');
  const payBtnText = document.getElementById('payBtnText');
  const payBtn = document.getElementById('payTopupBtn');
  const payBtnLoader = document.getElementById('payBtnLoader');
  const feedback = document.getElementById('paymentFeedback');
  const form = document.getElementById('topupPaymentForm');
  const cardBrandDisplay = document.getElementById('cardBrandDisplay');
  const inlineBrandBadge = document.getElementById('inlineBrandBadge');
  const previewCardNumber = document.getElementById('previewCardNumber');
  const previewCardHolder = document.getElementById('previewCardHolder');
  const previewExpiry = document.getElementById('previewExpiry');

  const cardNumberInput = document.getElementById('cardNumberInput');
  const cardHolderInput = document.getElementById('cardHolderInput');
  const expiryInput = document.getElementById('expiryInput');
  const cvcInput = document.getElementById('cvcInput');

  const BRAND_MAP = {
    visa: { icon: 'fab fa-cc-visa', label: 'Visa' },
    mastercard: { icon: 'fab fa-cc-mastercard', label: 'Mastercard' },
    card: { icon: 'far fa-credit-card', label: 'Card' }
  };

  let topupAmount = 0;

  function getToken() {
    return localStorage.getItem('token');
  }

  function setFeedback(message, type) {
    feedback.textContent = message || '';
    feedback.classList.remove('success', 'error');
    if (type) feedback.classList.add(type);
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  }

  function readAmountFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const amount = Number(params.get('amount') || 0);
    if (!Number.isFinite(amount) || amount < 50 || amount > 10000) {
      return null;
    }
    return Number(amount.toFixed(2));
  }

  function detectCardBrand(cardDigits) {
    if (/^4/.test(cardDigits)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(cardDigits)) return 'mastercard';
    return 'card';
  }

  function renderBrandBadge(targetNode, brandKey) {
    const meta = BRAND_MAP[brandKey] || BRAND_MAP.card;
    targetNode.innerHTML = `<i class="${meta.icon}" aria-hidden="true"></i><span>${meta.label}</span>`;
  }

  function updateBrand(cardDigits) {
    const brandKey = detectCardBrand(cardDigits);
    renderBrandBadge(cardBrandDisplay, brandKey);
    renderBrandBadge(inlineBrandBadge, brandKey);
  }

  function formatCardNumberInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
    event.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
    previewCardNumber.textContent = event.target.value || '#### #### #### ####';
    updateBrand(digits);
  }

  function formatExpiryInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    const month = digits.slice(0, 2);
    const year = digits.slice(2, 4);
    event.target.value = year ? `${month}/${year}` : month;
    previewExpiry.textContent = year ? `${month}/${year}` : (month || 'MM/YY');
  }

  function formatCvcInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    event.target.value = digits;
  }

  function updateCardHolderPreview(event) {
    previewCardHolder.textContent = (event.target.value || 'YOUR NAME').toUpperCase();
  }

  function validateCardFields() {
    const cardNumber = cardNumberInput.value.replace(/\s+/g, '');
    const cardHolder = cardHolderInput.value.trim();
    const expiry = expiryInput.value.trim();
    const cvc = cvcInput.value.trim();

    if (cardNumber.length < 13 || cardNumber.length > 16) {
      return 'Enter a valid card number.';
    }
    if (cardHolder.length < 2) {
      return 'Enter card holder name.';
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      return 'Enter expiry as MM/YY.';
    }
    const [month] = expiry.split('/').map((part) => parseInt(part, 10));
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return 'Expiry month is invalid.';
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      return 'Enter valid CVC.';
    }
    return null;
  }

  async function submitTopup(event) {
    event.preventDefault();

    const token = getToken();
    if (!token) {
      window.location.href = 'signin.html';
      return;
    }

    if (!topupAmount) {
      setFeedback('Top-up amount is invalid. Please return to wallet page.', 'error');
      return;
    }

    const fieldError = validateCardFields();
    if (fieldError) {
      setFeedback(fieldError, 'error');
      return;
    }

    try {
      payBtn.disabled = true;
      payBtnLoader.classList.remove('hidden');
      payBtnText.textContent = 'Processing...';
      setFeedback('Processing payment...', '');

      const response = await fetch(`${API_BASE_URL}/wallet/topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: topupAmount })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Top-up failed');
      }

      const query = new URLSearchParams({
        topup: 'success',
        amount: String(topupAmount)
      });
      window.location.href = `wallet.html?${query.toString()}`;
    } catch (error) {
      setFeedback(error.message || 'Top-up failed', 'error');
      payBtn.disabled = false;
      payBtnLoader.classList.add('hidden');
      payBtnText.textContent = `Pay ${formatMoney(topupAmount)}`;
    }
  }

  function init() {
    topupAmount = readAmountFromQuery();
    if (!topupAmount) {
      setFeedback('Invalid top-up amount. Please return to wallet page.', 'error');
      payBtn.disabled = true;
      payBtnText.textContent = 'Pay';
      return;
    }

    const amountText = formatMoney(topupAmount);
    amountDisplay.textContent = amountText;
    payBtnText.textContent = `Pay ${amountText}`;

    updateBrand('');
    previewCardNumber.textContent = '#### #### #### ####';
    previewCardHolder.textContent = 'YOUR NAME';
    previewExpiry.textContent = 'MM/YY';

    cardNumberInput.addEventListener('input', formatCardNumberInput);
    cardHolderInput.addEventListener('input', updateCardHolderPreview);
    expiryInput.addEventListener('input', formatExpiryInput);
    cvcInput.addEventListener('input', formatCvcInput);
    form.addEventListener('submit', submitTopup);
  }

  document.addEventListener('DOMContentLoaded', init);
})();


