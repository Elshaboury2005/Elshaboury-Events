/**
 * Back-to-Top Button
 * Injects a styled "scroll to top" button that appears after scrolling down 300px.
 * Positioned bottom-left to avoid conflicts with:
 *   - AI chatbot widget     (bottom: 30px, right: 30px)
 *   - Floating event chat   (bottom: 85px, right: 30px)
 *   - Venue floating actions(bottom: 150px, right: 28px)
 */
(function () {
  'use strict';

  // Prevent double-init
  if (document.getElementById('btt-btn')) return;

  /* ── Styles ─────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    #btt-btn {
      position: fixed;
      bottom: 30px;
      left: 30px;
      z-index: 8500;

      width: 50px;
      height: 50px;
      border-radius: 14px;
      border: 1px solid rgba(255, 138, 0, 0.35);
      background: linear-gradient(135deg, rgba(255,138,0,0.18), rgba(231,56,134,0.14));
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow:
        0 4px 20px rgba(255, 138, 0, 0.25),
        0 0 0 1px rgba(255,255,255,0.06) inset;

      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      opacity: 0;
      transform: translateY(12px) scale(0.85);
      pointer-events: none;
      transition:
        opacity 0.35s cubic-bezier(0.4,0,0.2,1),
        transform 0.35s cubic-bezier(0.4,0,0.2,1),
        box-shadow 0.25s ease,
        background 0.25s ease;

      /* remove default button chrome */
      padding: 0;
      outline: none;
    }

    #btt-btn.btt-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    #btt-btn:hover {
      background: linear-gradient(135deg, rgba(255,138,0,0.35), rgba(231,56,134,0.28));
      box-shadow:
        0 8px 28px rgba(255, 138, 0, 0.42),
        0 0 0 1px rgba(255,255,255,0.10) inset;
      transform: translateY(-3px) scale(1.06);
    }

    #btt-btn:active {
      transform: translateY(0) scale(0.96);
      box-shadow: 0 4px 12px rgba(255, 138, 0, 0.3);
    }

    /* Chevron icon */
    #btt-btn svg {
      width: 22px;
      height: 22px;
      display: block;
      flex-shrink: 0;
    }

    /* Tooltip */
    #btt-btn::after {
      content: 'Back to top';
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      background: rgba(7, 25, 32, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 138, 0, 0.3);
      color: #f3f7fb;
      font-family: 'Manrope', 'Segoe UI', sans-serif;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      white-space: nowrap;
      padding: 5px 10px;
      border-radius: 8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    #btt-btn:hover::after {
      opacity: 1;
    }

    @media (max-width: 480px) {
      #btt-btn {
        bottom: 20px;
        left: 16px;
        width: 44px;
        height: 44px;
        border-radius: 12px;
      }
      #btt-btn::after {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);

  /* ── Button HTML ─────────────────────────────────────────── */
  const btn = document.createElement('button');
  btn.id = 'btt-btn';
  btn.setAttribute('aria-label', 'Scroll back to top');
  btn.setAttribute('title', 'Back to top');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 19V5M5 12l7-7 7 7"
        stroke="url(#btt-grad)"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"/>
      <defs>
        <linearGradient id="btt-grad" x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ff8a00"/>
          <stop offset="100%" stop-color="#e73886"/>
        </linearGradient>
      </defs>
    </svg>
  `;
  document.body.appendChild(btn);

  /* ── Scroll visibility logic ─────────────────────────────── */
  const THRESHOLD = 300; // px before button appears

  function onScroll() {
    if (window.scrollY > THRESHOLD) {
      btn.classList.add('btt-visible');
    } else {
      btn.classList.remove('btt-visible');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load

  /* ── Click handler ───────────────────────────────────────── */
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
