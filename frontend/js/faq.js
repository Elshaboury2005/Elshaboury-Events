document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('faqCategoriesContainer');
  const searchInput = document.getElementById('faqSearch');
  const noResults = document.getElementById('faqNoResults');
  const API_BASE_URL = window.AuthConfig?.apiBaseUrl || '/api';

  // Category Configuration
  const categoryMeta = {
    booking: { title: 'Booking & Tickets', icon: '🎫' },
    wallet: { title: 'Payments & Wallet', icon: '💳' },
    accounts: { title: 'Accounts & Registration', icon: '👤' },
    organizing: { title: 'Organizing Events', icon: '🎈' },
    venues: { title: 'Venues & Bookings', icon: '🏛️' },
    support: { title: 'Technical Support', icon: '🔧' }
  };

  let allFaqs = [];

  // 1. Fetch FAQs from Backend API
  async function loadFaqs() {
    try {
      const response = await fetch(`${API_BASE_URL}/faq`);
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      if (data.success && Array.isArray(data.faqs)) {
        allFaqs = data.faqs;
        renderFaqs();
      } else {
        renderError('Failed to parse FAQ response');
      }
    } catch (err) {
      console.error('FAQ load error:', err);
      renderError('Unable to connect to service. Please try again.');
    }
  }

  function renderError(message) {
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: #ff4d6d;">
        <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
        <p>${message}</p>
      </div>
    `;
  }

  // 2. Group FAQs by Category and Render
  function renderFaqs() {
    if (!container) return;

    if (allFaqs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--muted, #c3d2dc);">
          <div style="font-size: 2rem; margin-bottom: 12px;">📭</div>
          <p>No FAQ questions available yet.</p>
        </div>
      `;
      return;
    }

    // Group FAQs
    const grouped = {};
    Object.keys(categoryMeta).forEach(key => { grouped[key] = []; });

    allFaqs.forEach(faq => {
      const cat = faq.category || 'support';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(faq);
    });

    // Generate HTML
    container.innerHTML = Object.entries(grouped)
      .filter(([_, list]) => list.length > 0)
      .map(([key, list]) => {
        const meta = categoryMeta[key] || { title: key, icon: '❓' };
        
        const accordionItems = list.map((faq, index) => {
          const uniqueId = `faq-${faq.id || `${key}-${index}`}`;
          return `
            <div class="faq-item" data-faq-id="${faq.id}">
              <button class="faq-question" aria-expanded="false" aria-controls="${uniqueId}">
                <span class="faq-question-text">${escapeHtml(faq.question)}</span>
                <span class="faq-toggle-icon">
                  <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                </span>
              </button>
              <div id="${uniqueId}" class="faq-answer" role="region">
                <p class="faq-answer-content">${escapeHtml(faq.answer)}</p>
              </div>
            </div>
          `;
        }).join('');

        return `
          <article class="faq-category-card" data-category="${key}">
            <div class="faq-category-header">
              <span class="faq-category-icon" aria-hidden="true">${meta.icon}</span>
              <h2 class="faq-category-title">${meta.title}</h2>
            </div>
            <div class="faq-accordion">
              ${accordionItems}
            </div>
          </article>
        `;
      }).join('');

    // Re-initialize Accordion Listeners
    setupAccordionListeners();
  }

  // 3. Accordion Interaction Handlers
  function setupAccordionListeners() {
    const items = container.querySelectorAll('.faq-item');
    items.forEach(item => {
      const questionBtn = item.querySelector('.faq-question');
      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');
        
        // Close siblings inside the same accordion
        const siblingItems = item.parentElement.querySelectorAll('.faq-item');
        siblingItems.forEach(sibling => {
          if (sibling !== item && sibling.classList.contains('is-open')) {
            closeItem(sibling);
          }
        });

        if (isOpen) {
          closeItem(item);
        } else {
          openItem(item);
        }
      });
    });
  }

  function openItem(item) {
    const btn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    item.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    answer.style.maxHeight = answer.scrollHeight + 'px';
    answer.style.opacity = '1';
  }

  function closeItem(item) {
    const btn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    item.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    answer.style.maxHeight = '0';
    answer.style.opacity = '0';
  }

  // 4. Live Search Filtering
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const items = container.querySelectorAll('.faq-item');
      const categories = container.querySelectorAll('.faq-category-card');
      let totalMatches = 0;

      if (!query) {
        // Reset state
        items.forEach(item => {
          item.style.display = 'block';
          closeItem(item);
          removeHighlights(item);
        });
        categories.forEach(cat => {
          cat.style.display = 'block';
        });
        if (noResults) noResults.style.display = 'none';
        return;
      }

      categories.forEach(category => {
        const catItems = category.querySelectorAll('.faq-item');
        let catMatches = 0;

        catItems.forEach(item => {
          const qText = item.querySelector('.faq-question-text').textContent.toLowerCase();
          const aText = item.querySelector('.faq-answer-content').textContent.toLowerCase();

          const matchesQ = qText.includes(query);
          const matchesA = aText.includes(query);

          if (matchesQ || matchesA) {
            item.style.display = 'block';
            openItem(item);
            highlightText(item.querySelector('.faq-question-text'), query);
            highlightText(item.querySelector('.faq-answer-content'), query);
            catMatches++;
            totalMatches++;
          } else {
            item.style.display = 'none';
            closeItem(item);
            removeHighlights(item);
          }
        });

        category.style.display = catMatches > 0 ? 'block' : 'none';
      });

      if (noResults) {
        noResults.style.display = totalMatches === 0 ? 'block' : 'none';
      }
    });
  }

  function highlightText(element, query) {
    const originalText = element.textContent;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    element.innerHTML = originalText.replace(regex, '<mark class="faq-highlight">$1</mark>');
  }

  function removeHighlights(item) {
    const qEl = item.querySelector('.faq-question-text');
    const aEl = item.querySelector('.faq-answer-content');
    qEl.innerHTML = qEl.textContent;
    aEl.innerHTML = aEl.textContent;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Load initially
  loadFaqs();
});
