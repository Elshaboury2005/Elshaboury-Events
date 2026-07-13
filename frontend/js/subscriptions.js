/**
 * subscriptions.js
 * Fetches subscription plans from /api/subscriptions and renders them
 * into #subPlansGrid. All CTA buttons redirect to index.html (no payment yet).
 */
(function () {
  'use strict';

  const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';

  // Icon and button-style map keyed by plan_key
  const planMeta = {
    free_trial: { icon: '&#127381;', btnClass: 'style-free',    btnLabel: 'Start Free Trial' },
    monthly:    { icon: '&#128197;', btnClass: 'style-monthly', btnLabel: 'Subscribe Monthly' },
    annual:     { icon: '&#11088;',  btnClass: 'style-annual',  btnLabel: 'Subscribe Annually' }
  };

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildCard(plan) {
    const meta   = planMeta[plan.plan_key] || { icon: '&#9733;', btnClass: 'style-monthly', btnLabel: 'Get Started' };
    const isFree = plan.plan_key === 'free_trial';
    const featured = plan.plan_key === 'annual';
    const features = Array.isArray(plan.features) ? plan.features : [];

    const badgeHtml = plan.badge
      ? `<span class="sub-badge">${escHtml(plan.badge)}</span>`
      : '';

    let displayPrice = plan.price_label;
    if (plan.price != null) {
      const num = Number(plan.price);
      const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2);
      const period = plan.plan_key === 'monthly' ? '/month' : (plan.plan_key === 'annual' ? '/year' : '');
      displayPrice = `$${formatted}${period}`;
    }

    const priceHtml = isFree
      ? `<div class="sub-plan-price is-free">${escHtml(displayPrice || 'Free')}</div>`
      : `<div class="sub-plan-price">${escHtml(displayPrice || 'Contact us')}</div>`;

    const featuresHtml = features.map(f =>
      `<li><span class="feat-check">&#10003;</span><span>${escHtml(f)}</span></li>`
    ).join('');

    return `
      <article class="sub-plan-card${featured ? ' is-featured' : ''}">
        ${badgeHtml}
        <div>
          <div class="sub-plan-icon" aria-hidden="true">${meta.icon}</div>
          <div class="sub-plan-name">${escHtml(plan.label)}</div>
          ${priceHtml}
        </div>
        <div class="sub-plan-divider"></div>
        <ul class="sub-features">${featuresHtml}</ul>
        <a href="/html/index.html" class="sub-cta-btn ${meta.btnClass}">
          <span>${meta.btnLabel}</span>
          <span aria-hidden="true">&#8594;</span>
        </a>
      </article>
    `;
  }

  async function loadPlans() {
    const grid = document.getElementById('subPlansGrid');
    if (!grid) return;

    try {
      const res  = await fetch(`${API_BASE}/subscriptions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.success || !Array.isArray(data.plans) || data.plans.length === 0) {
        throw new Error('No plans returned');
      }

      grid.innerHTML = data.plans.map(buildCard).join('');
    } catch (err) {
      console.error('Subscriptions load error:', err);
      grid.innerHTML = `
        <div class="sub-loading" style="color:#ff4d6d;">
          <div style="font-size:2rem;margin-bottom:12px;">&#9888;&#65039;</div>
          <p>Unable to load plans right now. Please try again later.</p>
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadPlans);
})();
