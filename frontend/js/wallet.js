(function () {
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';
  const MIN_WITHDRAWAL = 100;
  const WITHDRAW_QUICK_AMOUNTS = [100, 200, 500, 1000];

  const state = {
    filter: 'all',
    balance: 0,
    transactions: [],
    withdrawals: [],
    withdraw: {
      isOpen: false,
      step: 1,
      amount: '',
      cardNumber: '',
      cardHolder: '',
      expiry: '',
      feedback: '',
      feedbackType: '',
      submitting: false,
      result: null
    }
  };

  function getToken() {
    return localStorage.getItem('token');
  }

  function authHeaders(isJson = true) {
    const headers = { Authorization: `Bearer ${getToken()}` };
    if (isJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function setFeedback(element, message, type) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.remove('success', 'error');
    if (type) element.classList.add(type);
  }

  function setWithdrawFeedback(message, type = '') {
    state.withdraw.feedback = message || '';
    state.withdraw.feedbackType = type || '';
    renderWithdrawModal();
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function sourceToLabel(source) {
    const value = String(source || '').toLowerCase();
    if (value === 'refund') return 'Refund';
    if (value === 'top-up') return 'Top-Up';
    if (value === 'payment') return 'Payment';
    if (value === 'event-payout') return 'Event Payout';
    if (value === 'withdrawal') return 'Withdrawal';
    return 'Transaction';
  }

  function sourceToFilter(source) {
    const value = String(source || '').toLowerCase();
    if (value === 'refund') return 'refunds';
    if (value === 'payment' || value === 'event-payout') return 'payments';
    if (value === 'top-up') return 'topups';
    if (value === 'withdrawal') return 'withdrawals';
    return 'all';
  }

  function normalizeFilterValue(filter) {
    const value = String(filter || 'all').toLowerCase();
    if (value === 'refunds') return 'refunds';
    if (value === 'payments') return 'payments';
    if (value === 'topups') return 'topups';
    if (value === 'withdrawals') return 'withdrawals';
    return 'all';
  }

  function normalizeStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'pending') return 'pending';
    if (value === 'processing') return 'processing';
    if (value === 'completed') return 'completed';
    if (value === 'failed') return 'failed';
    return 'pending';
  }

  function statusToLabel(status) {
    const value = normalizeStatus(status);
    if (value === 'pending') return 'Pending';
    if (value === 'processing') return 'Processing';
    if (value === 'completed') return 'Completed';
    if (value === 'failed') return 'Failed';
    return 'Pending';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getCardDigits(cardNumber) {
    return String(cardNumber || '').replace(/\D/g, '');
  }

  function maskCardDigits(cardNumber) {
    const digits = getCardDigits(cardNumber);
    if (!digits) return '**** **** **** ****';
    const lastFour = digits.slice(-4).padStart(4, '*');
    return `**** **** **** ${lastFour}`;
  }

  function validExpiry(expiry) {
    const match = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
    if (!match) return false;
    const month = Number(match[1]);
    return Number.isFinite(month) && month >= 1 && month <= 12;
  }

  function parseWithdrawAmount() {
    const amount = Number(state.withdraw.amount);
    return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
  }

  function validateWithdrawalAmount() {
    const amount = parseWithdrawAmount();
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
      return `Minimum withdrawal is ${MIN_WITHDRAWAL} EGP`;
    }
    if (amount > Number(state.balance || 0)) {
      return 'Amount exceeds available wallet balance';
    }
    return '';
  }

  function validateCardStep() {
    const cardDigits = getCardDigits(state.withdraw.cardNumber);
    if (cardDigits.length < 12 || cardDigits.length > 19) {
      return 'Enter a valid card number';
    }
    if (String(state.withdraw.cardHolder || '').trim().length < 2) {
      return 'Enter card holder name';
    }
    if (!validExpiry(state.withdraw.expiry)) {
      return 'Enter expiry in MM/YY format';
    }
    return '';
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();
    if (!token) {
      window.location.href = 'signin.html';
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      const authMessage = String(data?.message || '').toLowerCase();
      const shouldLogout =
        response.status === 401 ||
        (response.status === 403 &&
          (authMessage.includes('invalid') ||
            authMessage.includes('expired') ||
            authMessage.includes('token') ||
            authMessage.includes('access token')));

      if (shouldLogout) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.setItem('isLoggedIn', 'false');
        window.location.href = 'signin.html';
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function setupMenuToggle() {
    const header = document.querySelector('header');
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelectorAll('nav a');
    if (!header || !menuToggle) return;

    const setMenuState = (open) => {
      header.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = header.classList.contains('menu-open');
      setMenuState(!isOpen);
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 860) setMenuState(false);
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) setMenuState(false);
    });
  }

  function setupQuickAmounts() {
    const amountInput = document.getElementById('topupAmount');
    const buttons = document.querySelectorAll('.quick-amount-btn[data-amount]');
    if (!amountInput || !buttons.length) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const amount = Number(button.getAttribute('data-amount'));
        if (!Number.isFinite(amount) || amount <= 0) return;
        amountInput.value = amount.toFixed(2);
      });
    });
  }

  function applyTopupResultFromQuery() {
    const feedback = document.getElementById('topupFeedback');
    if (!feedback) return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('topup');
    if (!status) return;

    if (status === 'success') {
      const amount = Number(params.get('amount') || 0);
      setFeedback(
        feedback,
        amount > 0
          ? `Top-up successful: ${formatMoney(amount)}`
          : 'Top-up successful',
        'success'
      );
    } else if (status === 'error') {
      const message = params.get('message') || 'Top-up failed';
      setFeedback(feedback, message, 'error');
    }

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, '', cleanUrl);
  }

  function updateFilterButtons() {
    const activeFilter = normalizeFilterValue(state.filter);
    const buttons = document.querySelectorAll('.filter-btn[data-filter]');
    buttons.forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-filter') === activeFilter);
    });
  }

  function renderLoadingRow() {
    const tableBody = document.getElementById('transactionsTableBody');
    const emptyState = document.getElementById('transactionsEmptyState');
    if (!tableBody || !emptyState) return;
    emptyState.classList.add('hidden');
    tableBody.innerHTML = `
      <tr class="loading-row">
        <td colspan="5">Loading transactions...</td>
      </tr>
    `;
  }

  function renderTransactions(transactions) {
    const tableBody = document.getElementById('transactionsTableBody');
    const emptyState = document.getElementById('transactionsEmptyState');
    if (!tableBody || !emptyState) return;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      tableBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tableBody.innerHTML = transactions.map((tx) => {
      const source = String(tx.source || '').toLowerCase();
      const amount = Number(tx.amount || 0);
      const isDebit = tx.type === 'debit';
      const amountClass = isDebit ? 'amount-debit' : 'amount-credit';
      const sign = isDebit ? '-' : '+';
      const sourceClass = `source-${source.replace(/[^a-z0-9_-]/g, '-')}`;
      const fallbackDescription = source === 'event-payout'
        ? 'Payout from event vault'
        : `${sourceToLabel(source)} transaction`;
      const amountPrefix = source === 'withdrawal' ? '&#8595; ' : '';

      return `
        <tr>
          <td>${formatDateTime(tx.createdAt)}</td>
          <td>
            <div class="desc-line">${escapeHtml(tx.description || fallbackDescription)}</div>
            <div class="desc-sub">ID: ${escapeHtml(tx.transactionId || '-')}</div>
          </td>
          <td class="${amountClass}">${amountPrefix}${sign}${formatMoney(Math.abs(amount))}</td>
          <td><span class="type-chip ${sourceClass}">${escapeHtml(sourceToLabel(source))}</span></td>
          <td>${formatMoney(tx.runningBalanceAfter)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderWithdrawals(withdrawals) {
    const tableBody = document.getElementById('withdrawalsTableBody');
    const emptyState = document.getElementById('withdrawalsEmptyState');
    if (!tableBody || !emptyState) return;

    if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
      tableBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tableBody.innerHTML = withdrawals.map((withdrawal) => {
      const status = normalizeStatus(withdrawal.status);
      return `
        <tr>
          <td>${formatDateTime(withdrawal.requestedAt)}</td>
          <td>**** **** **** ${escapeHtml(withdrawal.cardLastFour || '****')}</td>
          <td class="amount-debit">&#8595; -${formatMoney(withdrawal.amount || 0)}</td>
          <td><span class="status-chip status-${status}">${escapeHtml(statusToLabel(status))}</span></td>
          <td>${escapeHtml(withdrawal.referenceId || '-')}</td>
        </tr>
      `;
    }).join('');
  }

  function renderSummaryStats(transactions) {
    const totals = (Array.isArray(transactions) ? transactions : []).reduce((acc, tx) => {
      const amount = Number(tx.amount || 0);
      const source = String(tx.source || '').toLowerCase();
      const type = String(tx.type || '').toLowerCase();

      if (source === 'top-up' && type === 'credit') acc.topups += amount;
      if (source === 'refund' && type === 'credit') acc.refunds += amount;
      if ((source === 'payment' || source === 'withdrawal') && type === 'debit') acc.spent += amount;
      return acc;
    }, { topups: 0, spent: 0, refunds: 0 });

    document.getElementById('statTotalTopups').textContent = formatMoney(totals.topups);
    document.getElementById('statTotalSpent').textContent = formatMoney(totals.spent);
    document.getElementById('statTotalRefunds').textContent = formatMoney(totals.refunds);
  }

  function renderWalletMeta() {
    const updatedAt = document.getElementById('walletUpdatedAt');
    if (!updatedAt) return;
    updatedAt.textContent = `Last updated: ${new Date().toLocaleString()}`;
  }

  function renderFilteredTransactions() {
    const filter = normalizeFilterValue(state.filter);
    const filtered = (state.transactions || []).filter((tx) => {
      if (filter === 'all') return true;
      return sourceToFilter(tx.source) === filter;
    });
    renderTransactions(filtered);
  }

  async function loadWalletData() {
    renderLoadingRow();
    const data = await apiRequest('/wallet?type=all', {
      method: 'GET',
      headers: authHeaders(false)
    });

    state.balance = Number(data.balance || 0);
    state.transactions = Array.isArray(data.transactions) ? data.transactions : [];

    document.getElementById('walletBalanceValue').textContent = formatMoney(state.balance);
    renderWalletMeta();
    renderSummaryStats(state.transactions);
    renderFilteredTransactions();
  }

  async function loadWithdrawals() {
    const data = await apiRequest('/wallet/withdrawals', {
      method: 'GET',
      headers: authHeaders(false)
    });
    state.withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
    renderWithdrawals(state.withdrawals);
  }

  async function refreshWallet() {
    await loadWalletData();
    await loadWithdrawals();
  }

  function handleTopupSubmit(event) {
    event.preventDefault();
    const feedback = document.getElementById('topupFeedback');
    const amountInput = document.getElementById('topupAmount');
    const amount = Number(amountInput.value);

    if (!Number.isFinite(amount) || amount < 50 || amount > 10000) {
      setFeedback(feedback, 'Top-up amount must be between 50 and 10,000 EGP', 'error');
      return;
    }

    setFeedback(feedback, 'Redirecting to payment page...', '');
    const query = new URLSearchParams({ amount: amount.toFixed(2) });
    window.location.href = `wallet-topup-payment.html?${query.toString()}`;
  }

  function setupFilters() {
    const buttons = document.querySelectorAll('.filter-btn[data-filter]');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = normalizeFilterValue(button.getAttribute('data-filter'));
        updateFilterButtons();
        renderFilteredTransactions();
      });
    });
  }

  function getStepsMarkup() {
    const labels = ['Amount', 'Card Details', 'Confirm', 'Success'];
    return labels.map((label, idx) => {
      const stepNo = idx + 1;
      let classes = 'withdraw-step-chip';
      if (state.withdraw.step === stepNo) classes += ' active';
      if (state.withdraw.step > stepNo) classes += ' done';
      return `<span class="${classes}">${stepNo}. ${escapeHtml(label)}</span>`;
    }).join('');
  }

  function openWithdrawModal() {
    state.withdraw = {
      isOpen: true,
      step: 1,
      amount: '',
      cardNumber: '',
      cardHolder: '',
      expiry: '',
      feedback: '',
      feedbackType: '',
      submitting: false,
      result: null
    };
    renderWithdrawModal();
    document.getElementById('withdrawModal').classList.remove('hidden');
  }

  function closeWithdrawModal() {
    state.withdraw.isOpen = false;
    document.getElementById('withdrawModal').classList.add('hidden');
  }

  function renderStepFeedback() {
    if (!state.withdraw.feedback) return '';
    const feedbackClass = state.withdraw.feedbackType === 'error'
      ? 'error'
      : state.withdraw.feedbackType === 'success'
        ? 'success'
        : '';
    return `<p class="feedback ${feedbackClass}">${escapeHtml(state.withdraw.feedback)}</p>`;
  }

  function renderStepOne() {
    const amount = state.withdraw.amount;
    return `
      <div class="withdraw-step-content">
        <h3>Withdraw Funds</h3>
        <p class="withdraw-step-subtitle">Available: <strong>${formatMoney(state.balance)}</strong></p>

        <label for="withdrawAmountInput">Amount (EGP)</label>
        <div class="quick-amounts withdraw-quick">
          ${WITHDRAW_QUICK_AMOUNTS.map((value) => `
            <button type="button" class="quick-amount-btn withdraw-quick-btn" data-withdraw-amount="${value}">-${value}</button>
          `).join('')}
        </div>
        <input id="withdrawAmountInput" type="number" min="${MIN_WITHDRAWAL}" step="0.01" placeholder="100.00" value="${escapeHtml(amount)}">

        <small class="hint">Minimum withdrawal: ${MIN_WITHDRAWAL} EGP</small>
        <small class="hint">&#9201; Funds arrive within 3-5 business days</small>
        ${renderStepFeedback()}

        <div class="withdraw-actions">
          <button type="button" class="btn-primary" id="withdrawNextStepBtn">Next</button>
        </div>
      </div>
    `;
  }

  function renderStepTwo() {
    const cardHolder = String(state.withdraw.cardHolder || '').toUpperCase() || 'YOUR NAME';
    const expiry = state.withdraw.expiry || 'MM/YY';
    const previewCard = maskCardDigits(state.withdraw.cardNumber);

    return `
      <div class="withdraw-step-content">
        <h3>Where should we send your money?</h3>
        <p class="withdraw-step-subtitle">Enter the destination card details.</p>

        <div class="withdraw-card-preview">
          <div id="withdrawPreviewCardNumber" class="withdraw-card-number">${escapeHtml(previewCard)}</div>
          <div class="withdraw-card-footer">
            <span id="withdrawPreviewCardHolder">${escapeHtml(cardHolder)}</span>
            <span id="withdrawPreviewExpiry">${escapeHtml(expiry)}</span>
          </div>
        </div>

        <label for="withdrawCardNumberInput">Card Number</label>
        <input id="withdrawCardNumberInput" type="text" inputmode="numeric" maxlength="23" placeholder="0000 0000 0000 0000" value="${escapeHtml(state.withdraw.cardNumber)}">

        <label for="withdrawCardHolderInput">Card Holder Name</label>
        <input id="withdrawCardHolderInput" type="text" placeholder="Name on card" value="${escapeHtml(state.withdraw.cardHolder)}">

        <label for="withdrawCardExpiryInput">Expiry MM/YY</label>
        <input id="withdrawCardExpiryInput" type="text" inputmode="numeric" maxlength="5" placeholder="MM/YY" value="${escapeHtml(state.withdraw.expiry)}">

        <small class="hint">&#128274; Your card details are encrypted and secure</small>
        ${renderStepFeedback()}

        <div class="withdraw-actions">
          <button type="button" class="btn-secondary-action" id="withdrawBackToAmountBtn">Back</button>
          <button type="button" class="btn-primary" id="withdrawToSummaryBtn">Review Withdrawal</button>
        </div>
      </div>
    `;
  }

  function renderStepThree() {
    const amount = parseWithdrawAmount();
    const cardDigits = getCardDigits(state.withdraw.cardNumber);
    const lastFour = cardDigits.slice(-4);

    return `
      <div class="withdraw-step-content">
        <h3>Confirm Withdrawal</h3>
        <div class="withdraw-summary-card">
          <div><span>Withdrawal Amount:</span><strong>${formatMoney(amount)}</strong></div>
          <div><span>Card:</span><strong>**** **** **** ${escapeHtml(lastFour || '****')}</strong></div>
          <div><span>Card Holder:</span><strong>${escapeHtml(state.withdraw.cardHolder || '-')}</strong></div>
          <div><span>Estimated Arrival:</span><strong>3-5 business days</strong></div>
          <div><span>Reference ID:</span><strong>Auto-generated on submit</strong></div>
        </div>
        <p class="withdraw-warning">&#9888;&#65039; This will deduct ${formatMoney(amount)} from your wallet immediately.</p>
        ${renderStepFeedback()}

        <div class="withdraw-actions">
          <button type="button" class="btn-secondary-action" id="withdrawCancelBtn">Cancel</button>
          <button type="button" class="btn-success-action" id="withdrawConfirmBtn" ${state.withdraw.submitting ? 'disabled' : ''}>
            ${state.withdraw.submitting ? '<span class="btn-spinner"></span> Processing...' : 'Confirm & Withdraw'}
          </button>
        </div>
      </div>
    `;
  }

  function renderStepFour() {
    const result = state.withdraw.result || {};
    const referenceId = result.referenceId || '-';
    const amount = parseWithdrawAmount();
    const lastFour = getCardDigits(state.withdraw.cardNumber).slice(-4);

    return `
      <div class="withdraw-step-content withdraw-success">
        <div class="withdraw-success-icon">&#9989;</div>
        <h3>Withdrawal Requested!</h3>
        <p>${formatMoney(amount)} will arrive to your card ending in ${escapeHtml(lastFour || '****')} within 3-5 business days.</p>
        <div class="withdraw-ref-box">
          <span>Reference ID: <strong id="withdrawRefValue">${escapeHtml(referenceId)}</strong></span>
          <button type="button" class="btn-secondary-action small" id="copyWithdrawRefBtn">Copy</button>
        </div>
        ${renderStepFeedback()}
        <div class="withdraw-actions">
          <button type="button" class="btn-primary" id="closeWithdrawSuccessBtn">Close</button>
        </div>
      </div>
    `;
  }

  function renderWithdrawModal() {
    if (!state.withdraw.isOpen) return;
    const stepsNode = document.getElementById('withdrawModalSteps');
    const bodyNode = document.getElementById('withdrawModalBody');
    if (!stepsNode || !bodyNode) return;

    stepsNode.innerHTML = getStepsMarkup();

    if (state.withdraw.step === 1) {
      bodyNode.innerHTML = renderStepOne();
      bindStepOneEvents();
      return;
    }
    if (state.withdraw.step === 2) {
      bodyNode.innerHTML = renderStepTwo();
      bindStepTwoEvents();
      return;
    }
    if (state.withdraw.step === 3) {
      bodyNode.innerHTML = renderStepThree();
      bindStepThreeEvents();
      return;
    }
    bodyNode.innerHTML = renderStepFour();
    bindStepFourEvents();
  }

  function bindStepOneEvents() {
    const amountInput = document.getElementById('withdrawAmountInput');
    const nextBtn = document.getElementById('withdrawNextStepBtn');
    const quickButtons = document.querySelectorAll('.withdraw-quick-btn[data-withdraw-amount]');

    if (amountInput) {
      amountInput.addEventListener('input', () => {
        state.withdraw.amount = amountInput.value;
      });
    }

    quickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const amount = Number(button.getAttribute('data-withdraw-amount'));
        if (!Number.isFinite(amount) || amount <= 0) return;
        state.withdraw.amount = amount.toFixed(2);
        renderWithdrawModal();
      });
    });

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const message = validateWithdrawalAmount();
        if (message) {
          setWithdrawFeedback(message, 'error');
          return;
        }
        state.withdraw.feedback = '';
        state.withdraw.feedbackType = '';
        state.withdraw.step = 2;
        renderWithdrawModal();
      });
    }
  }

  function bindStepTwoEvents() {
    const cardNumberInput = document.getElementById('withdrawCardNumberInput');
    const cardHolderInput = document.getElementById('withdrawCardHolderInput');
    const expiryInput = document.getElementById('withdrawCardExpiryInput');
    const backBtn = document.getElementById('withdrawBackToAmountBtn');
    const nextBtn = document.getElementById('withdrawToSummaryBtn');

    if (cardNumberInput) {
      cardNumberInput.addEventListener('input', () => {
        const digits = getCardDigits(cardNumberInput.value).slice(0, 19);
        state.withdraw.cardNumber = digits.replace(/(.{4})/g, '$1 ').trim();
        cardNumberInput.value = state.withdraw.cardNumber;
        const previewNode = document.getElementById('withdrawPreviewCardNumber');
        if (previewNode) previewNode.textContent = maskCardDigits(state.withdraw.cardNumber);
      });
    }

    if (cardHolderInput) {
      cardHolderInput.addEventListener('input', () => {
        state.withdraw.cardHolder = cardHolderInput.value;
        const previewNode = document.getElementById('withdrawPreviewCardHolder');
        if (previewNode) {
          previewNode.textContent = String(state.withdraw.cardHolder || 'YOUR NAME').toUpperCase();
        }
      });
    }

    if (expiryInput) {
      expiryInput.addEventListener('input', () => {
        const digits = getCardDigits(expiryInput.value).slice(0, 4);
        const month = digits.slice(0, 2);
        const year = digits.slice(2, 4);
        state.withdraw.expiry = year ? `${month}/${year}` : month;
        expiryInput.value = state.withdraw.expiry;
        const previewNode = document.getElementById('withdrawPreviewExpiry');
        if (previewNode) previewNode.textContent = state.withdraw.expiry || 'MM/YY';
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        state.withdraw.step = 1;
        state.withdraw.feedback = '';
        state.withdraw.feedbackType = '';
        renderWithdrawModal();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const cardError = validateCardStep();
        if (cardError) {
          setWithdrawFeedback(cardError, 'error');
          return;
        }
        state.withdraw.feedback = '';
        state.withdraw.feedbackType = '';
        state.withdraw.step = 3;
        renderWithdrawModal();
      });
    }
  }

  async function submitWithdrawal() {
    const amountError = validateWithdrawalAmount();
    if (amountError) {
      setWithdrawFeedback(amountError, 'error');
      return;
    }
    const cardError = validateCardStep();
    if (cardError) {
      setWithdrawFeedback(cardError, 'error');
      return;
    }

    const amount = parseWithdrawAmount();
    const cardDigits = getCardDigits(state.withdraw.cardNumber);
    const cardLastFour = cardDigits.slice(-4);
    const cardHolder = String(state.withdraw.cardHolder || '').trim();
    const expiry = String(state.withdraw.expiry || '').trim();

    try {
      state.withdraw.submitting = true;
      state.withdraw.feedback = '';
      state.withdraw.feedbackType = '';
      renderWithdrawModal();

      const data = await apiRequest('/wallet/withdraw', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          amount,
          cardNumber: cardDigits,
          cardLastFour,
          cardHolder,
          expiry
        })
      });

      state.withdraw.result = data || {};
      state.withdraw.step = 4;
      state.withdraw.submitting = false;
      state.withdraw.feedback = 'Withdrawal request submitted successfully.';
      state.withdraw.feedbackType = 'success';
      renderWithdrawModal();

      await refreshWallet();
    } catch (error) {
      state.withdraw.submitting = false;
      setWithdrawFeedback(error.message || 'Failed to submit withdrawal', 'error');
    }
  }

  function bindStepThreeEvents() {
    const cancelBtn = document.getElementById('withdrawCancelBtn');
    const confirmBtn = document.getElementById('withdrawConfirmBtn');

    if (cancelBtn) cancelBtn.addEventListener('click', closeWithdrawModal);
    if (confirmBtn) confirmBtn.addEventListener('click', submitWithdrawal);
  }

  function bindStepFourEvents() {
    const copyBtn = document.getElementById('copyWithdrawRefBtn');
    const closeBtn = document.getElementById('closeWithdrawSuccessBtn');

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const ref = state.withdraw.result?.referenceId || '';
        if (!ref) return;
        try {
          await navigator.clipboard.writeText(ref);
          setWithdrawFeedback('Reference ID copied.', 'success');
        } catch (_) {
          setWithdrawFeedback('Could not copy reference ID.', 'error');
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeWithdrawModal);
  }

  function setupWithdrawModal() {
    const openBtn = document.getElementById('openWithdrawModalBtn');
    const closeBtn = document.getElementById('closeWithdrawModalBtn');
    const modal = document.getElementById('withdrawModal');

    if (openBtn) openBtn.addEventListener('click', openWithdrawModal);
    if (closeBtn) closeBtn.addEventListener('click', closeWithdrawModal);

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target && event.target.getAttribute('data-close-withdraw-modal') === 'true') {
          closeWithdrawModal();
        }
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.withdraw.isOpen) {
        closeWithdrawModal();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupMenuToggle();
    setupQuickAmounts();
    setupFilters();
    setupWithdrawModal();
    updateFilterButtons();
    applyTopupResultFromQuery();

    const topupForm = document.getElementById('topupForm');
    if (topupForm) topupForm.addEventListener('submit', handleTopupSubmit);

    try {
      await refreshWallet();
    } catch (error) {
      const feedback = document.getElementById('topupFeedback');
      setFeedback(feedback, error.message || 'Failed to load wallet data', 'error');
    }
  });
})();


