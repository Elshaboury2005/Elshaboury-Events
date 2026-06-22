(function () {
  if (window.__eeFloatingEventChatInitialized) return;
  window.__eeFloatingEventChatInitialized = true;

  const token = localStorage.getItem('token');
  if (!token || localStorage.getItem('isLoggedIn') !== 'true') return;

  const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
  const CHAT_UNAVAILABLE_MESSAGE = '\uD83D\uDD12 This chat is no longer available \u2014 the event has ended';
  const CHAT_LOCKED_ATTENDEE_MESSAGE = '\uD83D\uDD12 Only the host can send messages right now';
  const CHAT_LOCKED_BANNER_MESSAGE = '\uD83D\uDD12 Announcement Mode \u2014 Only the host can send messages';

  const state = {
    token,
    me: { id: '', name: 'You' },
    events: [],
    eventMap: new Map(),
    messageMap: new Map(),
    unavailableMap: new Map(),
    lockMap: new Map(),
    hostMap: new Map(),
    onlineMap: new Map(),
    typingMap: new Map(),
    typingTimers: new Map(),
    readTimers: new Map(),
    activeEventId: '',
    panelOpen: false,
    socket: null,
    query: ''
  };
  let el = {};

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const toId = (v) => String(v || '').trim();

  const rel = (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const ms = Date.now() - d.getTime();
    const m = 60000;
    const h = 3600000;
    const day = 86400000;
    if (ms < m) return 'now';
    if (ms < h) return `${Math.floor(ms / m)}m ago`;
    if (ms < day) return `${Math.floor(ms / h)}h ago`;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dayLabel = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const tLabel = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const isUpcoming = (v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
  };

  function readUser() {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      state.me.id = String(u.id || '').trim();
      state.me.name = String(u.fullName || u.username || 'You').trim() || 'You';
    } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('eeEcStyle')) return;
    const s = document.createElement('style');
    s.id = 'eeEcStyle';
    s.textContent = `
#eeEcRoot { position: fixed; right: 30px; bottom: 85px; z-index: 9300; pointer-events: none; font-family: Manrope, Segoe UI, sans-serif; }
#eeEcFab { pointer-events: auto; width: 62px; height: 62px; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); background: radial-gradient(circle at top left, rgba(255,255,255,.4), transparent 60%), linear-gradient(135deg, #f97316, #e73886, #8b5cf6); background-size: 200% 200%; color: #fff; box-shadow: 0 12px 32px rgba(231,56,134,.4), inset 0 2px 4px rgba(255,255,255,.4); display: grid; place-items: center; font-size: 26px; cursor: pointer; position: relative; transition: all .4s cubic-bezier(0.175, 0.885, 0.32, 1.275); animation: eeGradientShift 4s ease infinite; z-index: 999; }
#eeEcFab:hover { transform: translateY(-6px) scale(1.08) rotate(8deg); box-shadow: 0 20px 40px rgba(231,56,134,.6), 0 0 20px rgba(249,115,22,.4), inset 0 2px 4px rgba(255,255,255,.6); border-color: rgba(255,255,255,.5); }
#eeEcFab:active { transform: translateY(2px) scale(.95); box-shadow: 0 8px 16px rgba(231,56,134,.4); }
#eeEcFab i { filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
#eeEcFab.has-unread { animation: eePulse 1.8s ease-in-out infinite, eeGradientShift 4s ease infinite; }
#eeEcFab::after { content: attr(data-tooltip); position: absolute; right: 76px; top: 50%; transform: translateY(-50%) translateX(10px) scale(0.95); padding: 8px 14px; border-radius: 10px; background: rgba(7,23,29,.98); border: 1px solid rgba(255,255,255,.2); color: #e8f3f7; font-size: .75rem; font-weight: 600; opacity: 0; pointer-events: none; transition: all .25s cubic-bezier(0.175, 0.885, 0.32, 1.275); white-space: nowrap; backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,.4); }
#eeEcFab:hover::after { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
#eeEcFabBadge { position: absolute; top: -5px; right: -5px; min-width: 22px; height: 22px; border-radius: 999px; border: 2px solid #0f2a33; background: #ef4444; color: #fff; font-size: .72rem; font-weight: 700; display: none; align-items: center; justify-content: center; padding: 0 6px; }
#eeEcFabBadge.show { display: inline-flex; }
#eeEcPanel { pointer-events: auto; position: absolute; right: 0; bottom: 72px; width: 360px; height: 500px; border-radius: 18px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(160deg, rgba(16,35,43,.98), rgba(8,23,30,.98)); box-shadow: 0 24px 50px rgba(0,0,0,.42); overflow: hidden; }
#eeEcPanel::before { content: ''; position: absolute; left: 0; top: 0; width: 100%; height: 2px; background: linear-gradient(90deg, #ff8a00, #e73886); z-index: 2; }
#eeEcPanel.hidden, .eeEcView.hidden { display: none; }
.eeEcView { display: flex; flex-direction: column; width: 100%; height: 100%; }
.eeEcHeader, .eeEcThreadHead { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; justify-content: space-between; gap: 10px; background: linear-gradient(180deg, rgba(16,57,68,.62), rgba(12,39,48,.35)); }
.eeEcHeader h3 { margin: 0; color: #f1f7fb; font-size: 1rem; font-weight: 800; }
.eeEcHeader p { margin: 2px 0 0; color: #b6c8d1; font-size: .78rem; }
.eeEcBtn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.05); color: #9ab0bc; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: all .3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.eeEcBtn i, .eeEcBtn svg { pointer-events: none; transition: transform .3s ease; }
.eeEcBtn:hover { background: linear-gradient(135deg, rgba(249,115,22,.15), rgba(231,56,134,.15)); color: #fff; border-color: rgba(255,255,255,.3); transform: translateY(-3px) scale(1.05); box-shadow: 0 8px 24px rgba(231,56,134,.25), inset 0 0 12px rgba(255,255,255,.1); }
.eeEcBtn:hover i, .eeEcBtn:hover svg { transform: scale(1.15); }
.eeEcBtn:active { transform: translateY(0) scale(.95); box-shadow: 0 2px 8px rgba(231,56,134,.15); }
#eeEcBack, #eeEcClose, #eeEcMin { width: 36px; height: 36px; border-radius: 50%; font-size: .95rem; }
.eeEcSearchWrap { padding: 12px; border-bottom: 1px solid rgba(255,255,255,.08); }
#eeEcSearch { width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #f7fbff; padding: 10px 14px; outline: none; transition: all .3s ease; font-family: inherit; }
#eeEcSearch:focus { border-color: rgba(231,56,134,.5); background: rgba(255,255,255,.1); box-shadow: 0 0 0 3px rgba(231,56,134,.15); }
#eeEcSearch::placeholder { color: rgba(255,255,255,.3); }
#eeEcList { flex: 1; overflow-y: auto; padding: 4px 10px; display: flex; flex-direction: column; }
.eeEcRow { width: 100%; border: 1px solid transparent; background: transparent; border-radius: 14px; padding: 11px 8px; display: flex; gap: 11px; cursor: pointer; text-align: left; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
#eeEcList .eeEcRow + .eeEcRow { border-top: 1px solid rgba(156,178,189,.2); }
.eeEcRow:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.08); transform: translateY(-1px); }
.eeEcRow.active { background: rgba(231,56,134,.12); border-color: rgba(231,56,134,.34); }
.eeEcRow.flash { animation: eeFlash .9s ease; }
.eeEcAvatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; color: #fff; background: linear-gradient(135deg, #ff8a00, #e73886); flex: 0 0 40px; }
.eeEcMain { min-width: 0; flex: 1; }
.eeEcTop { display: flex; justify-content: space-between; gap: 8px; }
.eeEcName { color: #ecf6fa; font-size: .88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eeEcTime { color: #9ab0bc; font-size: .72rem; white-space: nowrap; }
.eeEcBottom { display: flex; gap: 8px; align-items: center; }
.eeEcDot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
.eeEcDot.up { background: #22c55e; }
.eeEcDot.end { background: #94a3b8; }
.eeEcPreview { color: #9db1bc; font-size: .75rem; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eeEcUnread { min-width: 20px; height: 20px; border-radius: 999px; background: #f97316; color: #fff; font-size: .72rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
.eeEcEmpty { min-height: 160px; display: grid; place-items: center; color: #b6c8d1; font-size: .86rem; text-align: center; padding: 12px; line-height: 1.6; }
#eeEcTitle { color: #f1f7fb; font-size: 1.04rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#eeEcOnline { color: #a5bbc6; font-size: .73rem; display: inline-flex; gap: 6px; align-items: center; }
.eeEcOnlineDot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18); animation: eeOnlinePulse 1.8s ease-in-out infinite; }
#eeEcLockBanner { margin: 0 12px 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(245,158,11,.4); background: rgba(245,158,11,.18); color: #ffe0bc; font-size: .75rem; line-height: 1.4; position: sticky; top: 0; z-index: 2; }
#eeEcLockBanner.hidden { display: none; }
#eeEcMessages { flex: 1; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; background: rgba(4,14,18,.35); }
.eeEcDate { text-align: center; color: #93a9b4; font-size: .72rem; }
.eeEcSys { text-align: center; color: #9fb0b8; font-size: .74rem; font-style: italic; }
.eeEcMsg { display: flex; align-items: flex-end; gap: 9px; margin-top: 2px; }
.eeEcMsg.grouped { margin-top: -6px; }
.eeEcMsg.me { justify-content: flex-end; }
.eeEcMsgAvatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #ff8a00, #e73886); color: #fff; font-size: .72rem; font-weight: 700; flex: 0 0 30px; }
.eeEcMsgAvatar.placeholder { visibility: hidden; }
.eeEcStack { max-width: 78%; display: grid; gap: 4px; }
.eeEcUser { color: #c9d8de; font-size: .68rem; display: inline-flex; gap: 6px; align-items: center; }
.eeEcHost { border-radius: 999px; border: 1px solid rgba(245,158,11,.55); background: rgba(245,158,11,.2); color: #fde68a; padding: 2px 7px; font-size: .62rem; font-weight: 700; }
.eeEcBubble { border-radius: 18px; padding: 10px 12px; color: #f2f7fb; font-size: .84rem; line-height: 1.46; word-break: break-word; white-space: pre-wrap; background: rgba(20,43,53,.92); border: 1px solid rgba(255,255,255,.12); }
.eeEcBubble.host { background: rgba(245,158,11,.16); border-color: rgba(245,158,11,.35); }
.eeEcMsg.me .eeEcBubble { background: linear-gradient(130deg, #ff8a00, #e73886); border-color: transparent; color: #fff; }
.eeEcStamp { color: rgba(171,193,203,.85); font-size: .62rem; }
.eeEcMsg.me .eeEcStamp { text-align: right; }
#eeEcTyping { min-height: 18px; padding: 0 12px; color: #9ab0bc; font-size: .72rem; }
.eeEcUnavailable { margin: 0 12px 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(245,158,11,.3); background: rgba(245,158,11,.14); color: #ffd9b7; font-size: .75rem; line-height: 1.4; }
.eeEcUnavailable.hidden { display: none; }
.eeEcInputWrap { border-top: 1px solid rgba(255,255,255,.12); padding: 12px 12px 10px; display: grid; gap: 7px; background: rgba(9,24,31,.85); }
.eeEcInputWrap.locked { background: rgba(8,18,24,.95); }
.eeEcInputRow { display: flex; align-items: flex-end; gap: 9px; }
#eeEcInput { flex: 1; min-height: 56px; max-height: 140px; resize: none; border-radius: 20px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.08); color: #f6fbff; padding: 12px 14px; transition: background .2s ease, border-color .2s ease, opacity .2s ease, box-shadow .2s ease; }
#eeEcInput::placeholder { color: rgba(255,255,255,.4); }
#eeEcInput:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,.12); }
#eeEcInput:disabled { background: rgba(255,255,255,.03); border-color: rgba(148,163,184,.32); color: #94a3b8; opacity: .86; }
.eeEcInputMeta { display: grid; gap: 4px; }
#eeEcCounter { color: #95a9b4; font-size: .61rem; text-align: right; }
#eeEcCounter.limit { color: #fecaca; }
.eeEcComposerHint { color: #ffdbb0; font-size: .68rem; line-height: 1.35; min-height: 16px; }
.eeEcComposerHint.hidden { display: none; }
.eeEcHostCrown { color: #fcd34d; font-size: .68rem; font-weight: 700; min-height: 16px; }
.eeEcHostCrown.hidden { display: none; }
.eeEcSend { width: 44px; height: 44px; border-radius: 50%; border: none; background: linear-gradient(135deg, #f97316, #e73886); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 44px; box-shadow: 0 8px 20px rgba(231,56,134,.3), inset 0 2px 4px rgba(255,255,255,.2); transition: all .3s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; overflow: hidden; }
.eeEcSend::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, #e73886, #8b5cf6); opacity: 0; transition: opacity .3s ease; }
.eeEcSend i, .eeEcSend svg { pointer-events: none; position: relative; z-index: 1; transition: transform .3s ease, filter .3s ease; filter: drop-shadow(0 2px 2px rgba(0,0,0,.2)); font-size: 1.1rem; }
.eeEcSend:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 12px 28px rgba(231,56,134,.5), 0 0 15px rgba(249,115,22,.3); }
.eeEcSend:hover::before { opacity: 1; }
.eeEcSend:hover i, .eeEcSend:hover svg { transform: translate(2px, -2px) scale(1.1); filter: drop-shadow(0 4px 6px rgba(0,0,0,.3)); }
.eeEcSend:active { transform: translateY(1px) scale(.95); box-shadow: 0 4px 10px rgba(231,56,134,.3); }
.eeEcSend.locked { background: linear-gradient(135deg, #475569, #334155); box-shadow: none; pointer-events: none; }
.eeEcSend:disabled, .eeEcEmoji:disabled { opacity: .45; cursor: not-allowed; }
.eeEcEmoji { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: #9ab0bc; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 1.2rem; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); transition: all .3s cubic-bezier(0.25, 0.8, 0.25, 1); flex: 0 0 44px; }
.eeEcEmoji:hover { border-color: rgba(249,115,22,.4); background: rgba(249,115,22,.1); color: #f97316; transform: translateY(-2px) rotate(5deg); box-shadow: 0 8px 20px rgba(249,115,22,.15); }
.eeEcEmoji:active { transform: translateY(0) scale(.92); }
@keyframes eePulse { 0% { box-shadow: 0 0 0 0 rgba(231,56,134,.48), 0 16px 30px rgba(0,0,0,.4); } 70% { box-shadow: 0 0 0 11px rgba(231,56,134,0), 0 16px 30px rgba(0,0,0,.4); } 100% { box-shadow: 0 0 0 0 rgba(231,56,134,0), 0 16px 30px rgba(0,0,0,.4); } }
@keyframes eeOnlinePulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.28); } 70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
@keyframes eeFlash { 0% { background: rgba(245,158,11,.28); } 100% { background: rgba(255,255,255,.03); } }
@keyframes eeGradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@media (max-width: 767px) { #eeEcRoot { right: 16px; bottom: 85px; } #eeEcPanel { right: -16px; bottom: -85px; width: 100vw; height: 100dvh; border-radius: 0; border: none; } #eeEcFab { width: 54px; height: 54px; } #eeEcFab::after { display: none; } .eeEcStack { max-width: 82%; } }
`;
    document.head.appendChild(s);
  }
  function ensureMarkup() {
    if (document.getElementById('eeEcRoot')) return;
    const root = document.createElement('div');
    root.id = 'eeEcRoot';
    root.innerHTML = `
<button id="eeEcFab" aria-label="Open event chats" data-tooltip="Event Chats"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span id="eeEcFabBadge">0</span></button>
<section id="eeEcPanel" class="hidden">
  <div id="eeEcListView" class="eeEcView">
    <div class="eeEcHeader"><div><h3>&#x1F4AC; Event Chats</h3><p>Your event conversations</p></div><button id="eeEcClose" class="eeEcBtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="eeEcSearchWrap"><input id="eeEcSearch" type="text" placeholder="Search events..." /></div>
    <div id="eeEcList"></div>
  </div>
  <div id="eeEcThreadView" class="eeEcView hidden">
    <div class="eeEcThreadHead">
      <button id="eeEcBack" class="eeEcBtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
      <div><div id="eeEcTitle">Event</div><div id="eeEcOnline"><span class="eeEcOnlineDot"></span><span>0 online</span></div></div>
      <button id="eeEcMin" class="eeEcBtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg></button>
    </div>
    <div id="eeEcLockBanner" class="hidden">\uD83D\uDD12 Announcement Mode \u2014 Only the host can send messages</div>
    <div id="eeEcMessages"></div>
    <div id="eeEcTyping"></div>
    <div id="eeEcUnavailable" class="eeEcUnavailable hidden">\uD83D\uDD12 This chat is no longer available \u2014 the event has ended</div>
    <div class="eeEcInputWrap">
      <div class="eeEcInputRow">
        <button id="eeEcEmoji" class="eeEcEmoji" type="button"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>
        <textarea id="eeEcInput" maxlength="500" placeholder="Type a message..."></textarea>
        <button id="eeEcSend" class="eeEcSend" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </div>
      <div class="eeEcInputMeta">
        <div id="eeEcHostCrown" class="eeEcHostCrown hidden">\uD83D\uDC51 Host access enabled</div>
        <div id="eeEcComposerHint" class="eeEcComposerHint hidden">\uD83D\uDD12 Only the host can send messages right now</div>
        <div id="eeEcCounter">0/500</div>
      </div>
    </div>
  </div>
</section>`;
    document.body.appendChild(root);
  }

  function cacheDom() {
    el = {
      fab: document.getElementById('eeEcFab'),
      badge: document.getElementById('eeEcFabBadge'),
      panel: document.getElementById('eeEcPanel'),
      listView: document.getElementById('eeEcListView'),
      threadView: document.getElementById('eeEcThreadView'),
      list: document.getElementById('eeEcList'),
      search: document.getElementById('eeEcSearch'),
      close: document.getElementById('eeEcClose'),
      back: document.getElementById('eeEcBack'),
      min: document.getElementById('eeEcMin'),
      title: document.getElementById('eeEcTitle'),
      online: document.getElementById('eeEcOnline'),
      lockBanner: document.getElementById('eeEcLockBanner'),
      messages: document.getElementById('eeEcMessages'),
      typing: document.getElementById('eeEcTyping'),
      unavailable: document.getElementById('eeEcUnavailable'),
      inputWrap: document.querySelector('.eeEcInputWrap'),
      input: document.getElementById('eeEcInput'),
      composerHint: document.getElementById('eeEcComposerHint'),
      hostCrown: document.getElementById('eeEcHostCrown'),
      counter: document.getElementById('eeEcCounter'),
      send: document.getElementById('eeEcSend'),
      emoji: document.getElementById('eeEcEmoji')
    };
  }

  function sortEvents() {
    state.events.sort((a, b) => {
      const at = a.last_message_time
        ? new Date(a.last_message_time).getTime()
        : new Date(a.event_date || 0).getTime();
      const bt = b.last_message_time
        ? new Date(b.last_message_time).getTime()
        : new Date(b.event_date || 0).getTime();
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });
  }

  function rebuildMap() {
    state.eventMap = new Map();
    state.events.forEach((e) => state.eventMap.set(e.event_id, e));
  }

  function getEvent(id) {
    return state.eventMap.get(toId(id)) || null;
  }

  function ensureEvent(id) {
    const k = toId(id);
    let e = getEvent(k);
    if (e) return e;
    e = {
      event_id: k,
      event_name: 'Event',
      event_date: null,
      unread_count: 0,
      last_message: '',
      last_message_time: null
    };
    state.events.push(e);
    rebuildMap();
    return e;
  }

  function totalUnread() {
    return state.events.reduce((s, e) => s + Math.max(0, Number(e.unread_count || 0)), 0);
  }

  function applyBadge() {
    const n = totalUnread();
    el.badge.textContent = n > 99 ? '99+' : String(n);
    el.badge.classList.toggle('show', n > 0);
    el.fab.classList.toggle('has-unread', n > 0);
  }

  function renderList() {
    const q = state.query.trim().toLowerCase();
    const rows = state.events.filter((e) => !q || e.event_name.toLowerCase().includes(q));
    if (!rows.length) {
      el.list.innerHTML = '<div class="eeEcEmpty">&#x1F3AA; No event chats yet. Book a ticket to join a chat!</div>';
      return;
    }

    el.list.innerHTML = rows.map((e) => {
      const unread = Math.max(0, Number(e.unread_count || 0));
      const active = toId(state.activeEventId) === toId(e.event_id);
      return `<button class="eeEcRow${active ? ' active' : ''}" data-event-id="${esc(e.event_id)}" type="button">
<span class="eeEcAvatar">${esc((e.event_name || 'E').charAt(0).toUpperCase() || 'E')}</span>
<span class="eeEcMain">
<span class="eeEcTop"><span class="eeEcName">${esc(e.event_name)}</span><span class="eeEcTime">${esc(e.last_message_time ? rel(e.last_message_time) : rel(e.event_date))}</span></span>
<span class="eeEcBottom"><span class="eeEcDot ${isUpcoming(e.event_date) ? 'up' : 'end'}"></span><span class="eeEcPreview">${esc(e.last_message || 'No messages yet.')}</span></span>
</span>${unread > 0 ? `<span class="eeEcUnread">${unread > 99 ? '99+' : unread}</span>` : ''}</button>`;
    }).join('');
  }

  function isThreadOpen() {
    return !el.panel.classList.contains('hidden') && !el.threadView.classList.contains('hidden');
  }

  function openPanel() {
    state.panelOpen = true;
    el.panel.classList.remove('hidden');
    if (!state.activeEventId) showList();
  }

  function closePanel() {
    state.panelOpen = false;
    el.panel.classList.add('hidden');
    emitStopTyping(state.activeEventId);
  }

  function showList() {
    el.listView.classList.remove('hidden');
    el.threadView.classList.add('hidden');
  }

  function showThread() {
    el.listView.classList.add('hidden');
    el.threadView.classList.remove('hidden');
  }

  function messagesFor(eventId) {
    const k = toId(eventId);
    if (!state.messageMap.has(k)) state.messageMap.set(k, []);
    return state.messageMap.get(k);
  }

  function pushMsg(eventId, raw) {
    const m = {
      id: raw?.id != null ? String(raw.id) : `sys-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      event_id: toId(raw?.eventId || raw?.event_id || eventId),
      user_id: String(raw?.user_id || raw?.userId || ''),
      username: String(raw?.username || 'User').trim() || 'User',
      message: String(raw?.message || '').trim(),
      is_host: Boolean(raw?.is_host || raw?.isHost),
      created_at: raw?.created_at || raw?.createdAt || new Date().toISOString(),
      is_system: Boolean(raw?.is_system || raw?.isSystem)
    };
    const list = messagesFor(m.event_id);
    if (!list.some((x) => x.id === m.id)) list.push(m);
    list.sort((a, b) => {
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return at === bt ? String(a.id).localeCompare(String(b.id)) : at - bt;
    });
    return m;
  }

  function pushSystem(eventId, text, ts) {
    messagesFor(eventId).push({
      id: `system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      event_id: toId(eventId),
      user_id: '',
      username: '',
      message: String(text || '').trim(),
      is_host: false,
      created_at: ts || new Date().toISOString(),
      is_system: true
    });
  }

  function chatUnavailableText(text) {
    const raw = String(text || '').trim();
    return raw || CHAT_UNAVAILABLE_MESSAGE;
  }

  function isChatLocked(eventId) {
    return Boolean(state.lockMap.get(toId(eventId)));
  }

  function isHostForEvent(eventId) {
    return Boolean(state.hostMap.get(toId(eventId)));
  }

  function setEventHost(eventId, isHost) {
    const id = toId(eventId);
    if (!id) return;
    state.hostMap.set(id, Boolean(isHost));
  }

  function setEventLock(eventId, locked) {
    const id = toId(eventId);
    if (!id) return;
    state.lockMap.set(id, Boolean(locked));
  }

  function isInputDisabledForEvent(eventId) {
    const id = toId(eventId);
    if (!id) return true;
    if (state.unavailableMap.has(id)) return true;
    return isChatLocked(id) && !isHostForEvent(id);
  }

  function renderAvailability() {
    const id = toId(state.activeEventId);
    const isUnavailable = Boolean(id) && state.unavailableMap.has(id);
    const isLocked = Boolean(id) && isChatLocked(id);
    const canHostBypassLock = Boolean(id) && isHostForEvent(id);
    const isLockedForCurrentUser = isLocked && !canHostBypassLock;
    const isInputDisabled = isInputDisabledForEvent(id);
    const message = chatUnavailableText(state.unavailableMap.get(id));

    el.lockBanner.textContent = CHAT_LOCKED_BANNER_MESSAGE;
    el.lockBanner.classList.toggle('hidden', !isLocked);

    el.unavailable.textContent = message;
    el.unavailable.classList.toggle('hidden', !isUnavailable);

    el.inputWrap.classList.toggle('locked', isInputDisabled);
    el.input.disabled = isInputDisabled;
    el.send.disabled = isInputDisabled;
    el.emoji.disabled = isInputDisabled;

    el.send.classList.toggle('locked', isLockedForCurrentUser || isUnavailable);
    el.send.innerHTML = isLockedForCurrentUser ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

    el.composerHint.textContent = CHAT_LOCKED_ATTENDEE_MESSAGE;
    el.composerHint.classList.toggle('hidden', !isLockedForCurrentUser || isUnavailable);
    el.hostCrown.classList.toggle('hidden', !(isLocked && canHostBypassLock && !isUnavailable));

    if (isUnavailable) {
      el.input.placeholder = 'Chat unavailable';
    } else if (isLockedForCurrentUser) {
      el.input.placeholder = 'Announcement mode is enabled';
    } else {
      el.input.placeholder = 'Type a message...';
    }
  }

  function msgAvatarInitial(username) {
    const initial = String(username || '').trim().charAt(0).toUpperCase();
    return initial || 'U';
  }

  function renderMessages() {
    const eventId = toId(state.activeEventId);
    if (!eventId) return;

    const list = messagesFor(eventId);
    if (!list.length) {
      el.messages.innerHTML = '<div class="eeEcEmpty">No messages yet. Start the conversation.</div>';
      return;
    }

    let prevDate = '';
    let prevSenderKey = '';
    let prevWasMine = false;
    let prevWasMessage = false;
    const html = [];

    list.forEach((m) => {
      const d = dayLabel(m.created_at);
      if (d && d !== prevDate) {
        html.push(`<div class="eeEcDate">${esc(d)}</div>`);
        prevDate = d;
        prevSenderKey = '';
        prevWasMessage = false;
      }

      if (m.is_system) {
        html.push(`<div class="eeEcSys">${esc(m.message)}</div>`);
        prevSenderKey = '';
        prevWasMessage = false;
        return;
      }

      const mine = state.me.id && m.user_id && String(m.user_id) === String(state.me.id);
      const senderKey = mine
        ? `me:${String(m.user_id || state.me.id || 'me')}`
        : `other:${String(m.user_id || m.username || '').toLowerCase()}`;
      const grouped = prevWasMessage && senderKey === prevSenderKey && mine === prevWasMine;
      const avatarHtml = mine
        ? ''
        : `<span class="eeEcMsgAvatar${grouped ? ' placeholder' : ''}">${grouped ? '' : esc(msgAvatarInitial(m.username))}</span>`;

      html.push(`<div class="eeEcMsg ${mine ? 'me' : 'other'} ${grouped ? 'grouped' : ''}">
${avatarHtml}<div class="eeEcStack">
${!mine && !grouped ? `<div class="eeEcUser">${esc(m.username)} ${m.is_host ? '<span class="eeEcHost">&#x1F451; HOST</span>' : ''}</div>` : ''}
<div class="eeEcBubble ${(!mine && m.is_host) ? 'host' : ''}">${esc(m.message)}</div>
<div class="eeEcStamp">${esc(tLabel(m.created_at))}</div>
</div></div>`);

      prevSenderKey = senderKey;
      prevWasMine = mine;
      prevWasMessage = true;
    });

    el.messages.innerHTML = html.join('');
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function renderTyping() {
    const id = toId(state.activeEventId);
    if (!id) {
      el.typing.textContent = '';
      return;
    }

    const set = state.typingMap.get(id) || new Set();
    const arr = Array.from(set);
    if (!arr.length) {
      el.typing.textContent = '';
      return;
    }

    el.typing.textContent = arr.length === 1 ? `${arr[0]} is typing...` : 'Several people are typing...';
  }

  function renderThreadHeader() {
    const ev = getEvent(state.activeEventId);
    el.title.textContent = ev ? ev.event_name : 'Event';
    const online = Math.max(0, Number(state.onlineMap.get(toId(state.activeEventId)) || 0));
    el.online.innerHTML = `<span class="eeEcOnlineDot"></span><span>${online} online</span>`;
    renderTyping();
    renderAvailability();
  }
  async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function refreshEvents() {
    const { res, data } = await api('/chat/my-events', { method: 'GET' });
    if (!res.ok || !data.success || !Array.isArray(data.events)) {
      state.events = [];
      rebuildMap();
      renderList();
      applyBadge();
      return;
    }

    state.events = data.events
      .map((r) => ({
        event_id: toId(r.event_id || r.eventId || r.id),
        event_name: String(r.event_name || r.eventName || r.title || 'Event').trim() || 'Event',
        event_date: r.event_date || r.eventDate || null,
        unread_count: Number(r.unread_count || r.unreadCount || 0),
        last_message: String(r.last_message || r.lastMessage || '').trim(),
        last_message_time: r.last_message_time || r.lastMessageTime || null
      }))
      .filter((e) => e.event_id);

    sortEvents();
    rebuildMap();
    renderList();
    applyBadge();
  }

  async function refreshChatStatus(eventId) {
    const id = toId(eventId);
    if (!id) return;

    try {
      const { res, data } = await api(`/chat/${encodeURIComponent(id)}/status`, { method: 'GET' });
      if (!res.ok || !data.success) return;

      setEventLock(id, Boolean(data.chat_locked));
      setEventHost(id, Boolean(data.is_host));
      state.unavailableMap.delete(id);
    } catch (_) {}

    if (id === state.activeEventId) {
      renderAvailability();
    }
  }

  async function loadMessages(eventId) {
    const id = toId(eventId);
    if (!id) return;
    const { res, data } = await api(`/chat/${encodeURIComponent(id)}/messages`, { method: 'GET' });
    if (!res.ok || !data.success || !Array.isArray(data.messages)) {
      state.messageMap.set(id, []);
      renderMessages();
      return;
    }

    state.messageMap.set(id, data.messages.map((r) => ({
      id: String(r.id),
      event_id: toId(r.event_id || id),
      user_id: String(r.user_id || ''),
      username: String(r.username || 'User'),
      message: String(r.message || ''),
      is_host: Boolean(r.is_host),
      created_at: r.created_at,
      is_system: false
    })));

    renderMessages();
  }

  function scheduleRead(eventId, delay = 150) {
    const id = toId(eventId);
    if (!id) return;
    clearTimeout(state.readTimers.get(id));
    state.readTimers.set(id, setTimeout(() => markRead(id), delay));
  }

  async function markRead(eventId) {
    const id = toId(eventId);
    if (!id || state.unavailableMap.has(id)) return;
    const ev = ensureEvent(id);
    ev.unread_count = 0;
    renderList();
    applyBadge();
    if (state.socket) state.socket.emit('mark-as-read', { eventId: id, token: state.token });
    try {
      await api(`/chat/${encodeURIComponent(id)}/read`, { method: 'POST' });
    } catch (_) {}
  }

  async function openEvent(eventId) {
    const id = toId(eventId);
    if (!id) return;

    ensureEvent(id);
    state.activeEventId = id;
    showThread();
    openPanel();
    await refreshChatStatus(id);
    renderThreadHeader();
    if (!isInputDisabledForEvent(id)) el.input.focus();

    await loadMessages(id);

    if (!state.unavailableMap.has(id)) scheduleRead(id, 0);
    if (state.socket) {
      state.socket.emit('join-event-chat', {
        eventId: id,
        token: state.token,
        silent: false,
        markRead: true
      });
    }
  }

  function closeEventThread() {
    emitStopTyping(state.activeEventId);
    state.activeEventId = '';
    showList();
    renderList();
    renderAvailability();
  }

  function setCounter() {
    const n = String(el.input.value || '').length;
    el.counter.textContent = `${n}/500`;
    el.counter.classList.toggle('limit', n >= 500);
  }

  function emitTyping(eventId) {
    const id = toId(eventId);
    if (!id || !state.socket || isInputDisabledForEvent(id)) return;
    state.socket.emit('typing', { eventId: id, token: state.token });
  }

  function emitStopTyping(eventId) {
    const id = toId(eventId);
    if (!id || !state.socket || isInputDisabledForEvent(id)) return;
    state.socket.emit('stop-typing', { eventId: id, token: state.token });
  }

  function scheduleStopTyping(eventId) {
    const id = toId(eventId);
    if (!id) return;
    clearTimeout(state.typingTimers.get(`local-${id}`));
    state.typingTimers.set(`local-${id}`, setTimeout(() => emitStopTyping(id), 2000));
  }

  function registerTyping(eventId, username) {
    const id = toId(eventId);
    const name = String(username || '').trim();
    if (!id || !name || name === state.me.name || state.unavailableMap.has(id)) return;

    if (!state.typingMap.has(id)) state.typingMap.set(id, new Set());
    state.typingMap.get(id).add(name);

    const key = `${id}:${name}`;
    clearTimeout(state.typingTimers.get(key));
    state.typingTimers.set(key, setTimeout(() => {
      const set = state.typingMap.get(id);
      if (set) {
        set.delete(name);
        if (!set.size) state.typingMap.delete(id);
      }
      if (id === state.activeEventId) renderTyping();
    }, 2200));
  }

  function unregisterTyping(eventId, username) {
    const id = toId(eventId);
    const name = String(username || '').trim();
    const set = state.typingMap.get(id);
    if (!set || !name) return;
    set.delete(name);
    if (!set.size) state.typingMap.delete(id);
  }

  function sendMessage() {
    const id = toId(state.activeEventId);
    if (!id || !state.socket || isInputDisabledForEvent(id)) return;
    const msg = String(el.input.value || '').trim();
    if (!msg) return;
    state.socket.emit('send-chat-message', { eventId: id, token: state.token, message: msg.slice(0, 500) });
    el.input.value = '';
    setCounter();
    emitStopTyping(id);
  }

  function socketUrl() {
    try {
      const u = new URL(API_BASE);
      return `${u.protocol}//${u.host}`;
    } catch (_) {
      return window.location.origin;
    }
  }

  async function loadSocketClient() {
    if (typeof window.io === 'function') return;

    const scriptCandidates = [];
    const directSrc = '/socket.io/socket.io.js';
    scriptCandidates.push(directSrc);

    const originSrc = `${socketUrl().replace(/\/+$/, '')}/socket.io/socket.io.js`;
    if (!scriptCandidates.includes(originSrc)) {
      scriptCandidates.push(originSrc);
    }

    for (let i = 0; i < scriptCandidates.length; i += 1) {
      const src = scriptCandidates[i];
      const selector = `script[data-ee-sio-src="${src}"]`;
      let script = document.querySelector(selector);

      if (!script) {
        script = document.createElement('script');
        script.src = src;
        script.setAttribute('data-ee-sio', '1');
        script.setAttribute('data-ee-sio-src', src);
        document.head.appendChild(script);
      }

      await new Promise((resolve, reject) => {
        if (typeof window.io === 'function') {
          resolve();
          return;
        }

        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', reject, { once: true });
      }).catch(() => null);

      if (typeof window.io === 'function') {
        return;
      }
    }

    throw new Error('socket-io-client-unavailable');
  }

  function joinAllSilent() {
    if (!state.socket) return;
    state.events.forEach((e) => {
      state.socket.emit('join-event-chat', {
        eventId: e.event_id,
        token: state.token,
        silent: true,
        markRead: false
      });
    });
  }

  async function setupSocket() {
    try {
      await loadSocketClient();
    } catch (_) {
      return;
    }
    if (typeof window.io !== 'function') return;

    state.socket = window.io(socketUrl(), { withCredentials: true });

    state.socket.on('connect', () => {
      joinAllSilent();
      if (state.activeEventId) {
        state.socket.emit('join-event-chat', {
          eventId: state.activeEventId,
          token: state.token,
          silent: false,
          markRead: true
        });
      }
    });

    state.socket.on('chat-authorized', (p = {}) => {
      const id = toId(p.eventId);
      if (!id) return;
      state.unavailableMap.delete(id);
      if (typeof p.isHost !== 'undefined') setEventHost(id, Boolean(p.isHost));
      if (typeof p.chatLocked !== 'undefined') setEventLock(id, Boolean(p.chatLocked));
      if (typeof p.onlineCount !== 'undefined') state.onlineMap.set(id, Number(p.onlineCount || 0));
      if (id === state.activeEventId) renderThreadHeader();
    });

    state.socket.on('chat-online-count', (p = {}) => {
      const id = toId(p.eventId);
      if (!id) return;
      state.onlineMap.set(id, Number(p.onlineCount || 0));
      if (id === state.activeEventId) renderThreadHeader();
    });

    state.socket.on('chat-unavailable', (p = {}) => {
      const id = toId(p.eventId || state.activeEventId);
      if (!id) return;
      const message = chatUnavailableText(p.message);
      state.unavailableMap.set(id, message);
      setEventLock(id, false);
      if (id === state.activeEventId) {
        const exists = messagesFor(id).some((m) => m.is_system && m.message === message);
        if (!exists) pushSystem(id, message, p.timestamp);
        renderMessages();
        renderAvailability();
      }
    });

    state.socket.on('message-blocked', (p = {}) => {
      const id = toId(p.eventId || state.activeEventId);
      if (!id) return;
      const reason = String(p.reason || CHAT_LOCKED_ATTENDEE_MESSAGE).trim() || CHAT_LOCKED_ATTENDEE_MESSAGE;
      setEventLock(id, true);
      if (id === state.activeEventId && isThreadOpen()) {
        pushSystem(id, reason, p.timestamp);
        renderMessages();
        renderAvailability();
      }
    });

    state.socket.on('chat-lock-changed', (p = {}) => {
      const id = toId(p.eventId || p.event_id || state.activeEventId);
      if (!id) return;

      const locked = Boolean(p.locked);
      setEventLock(id, locked);

      const changedBy = String(p.changedBy || '').trim();
      const systemText = changedBy
        ? `${locked ? '\uD83D\uDD12' : '\uD83D\uDD13'} ${changedBy} ${locked ? 'locked' : 'unlocked'} the chat`
        : String(p.message || '').trim();

      if (id === state.activeEventId && isThreadOpen()) {
        if (systemText) pushSystem(id, systemText, p.timestamp);
        renderMessages();
        renderThreadHeader();
      }
    });

    state.socket.on('new-chat-message', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      const ev = ensureEvent(id);
      const m = pushMsg(id, p);
      ev.last_message = m.message;
      ev.last_message_time = m.created_at;
      sortEvents();
      rebuildMap();

      if (id === state.activeEventId && isThreadOpen()) {
        renderMessages();
        if (m.user_id && state.me.id && m.user_id !== state.me.id && !state.unavailableMap.has(id)) {
          scheduleRead(id, 260);
        }
      }

      renderList();
      applyBadge();
    });

    state.socket.on('update-unread', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      const ev = ensureEvent(id);
      if (p.lastMessage) ev.last_message = String(p.lastMessage);
      if (p.lastMessageTime) ev.last_message_time = p.lastMessageTime;

      if (id === state.activeEventId && isThreadOpen() && !state.unavailableMap.has(id)) {
        scheduleRead(id, 120);
      } else {
        ev.unread_count = Math.max(0, Number(ev.unread_count || 0) + Math.max(0, Number(p.incrementBy || 1)));
        if (state.panelOpen && !el.listView.classList.contains('hidden')) {
          const row = el.list.querySelector(`.eeEcRow[data-event-id="${id.replace(/"/g, '\\"')}"]`);
          if (row) {
            row.classList.remove('flash');
            void row.offsetWidth;
            row.classList.add('flash');
            setTimeout(() => row.classList.remove('flash'), 900);
          }
        }
      }

      sortEvents();
      rebuildMap();
      renderList();
      applyBadge();
    });

    state.socket.on('unread-cleared', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      const ev = ensureEvent(id);
      ev.unread_count = Math.max(0, Number(p.unreadCount || 0));
      renderList();
      applyBadge();
    });

    state.socket.on('user-joined', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      if (id === state.activeEventId && isThreadOpen()) {
        pushSystem(id, `${String(p.username || 'User')} joined the chat`, p.timestamp);
        renderMessages();
      }
    });

    state.socket.on('user-left', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      if (id === state.activeEventId && isThreadOpen()) {
        pushSystem(id, `${String(p.username || 'User')} left the chat`, p.timestamp);
        renderMessages();
      }
    });

    state.socket.on('typing', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      registerTyping(id, p.username);
      if (id === state.activeEventId) renderTyping();
    });

    state.socket.on('stop-typing', (p = {}) => {
      const id = toId(p.eventId || p.event_id);
      if (!id) return;
      unregisterTyping(id, p.username);
      if (id === state.activeEventId) renderTyping();
    });
  }
  function bind() {
    el.fab.addEventListener('click', () => {
      if (state.panelOpen) closePanel();
      else openPanel();
    });

    el.close.addEventListener('click', closePanel);
    el.min.addEventListener('click', closePanel);
    el.back.addEventListener('click', closeEventThread);

    el.search.addEventListener('input', () => {
      state.query = String(el.search.value || '');
      renderList();
    });

    el.list.addEventListener('click', (e) => {
      const row = e.target.closest('.eeEcRow');
      if (!row) return;
      const id = toId(row.getAttribute('data-event-id'));
      if (!id) return;
      openEvent(id);
    });

    el.send.addEventListener('click', sendMessage);

    el.emoji.addEventListener('click', () => {
      if (el.input.disabled) return;
      el.input.value = `${el.input.value || ''}\uD83D\uDE0A`;
      setCounter();
      el.input.focus();
    });

    el.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    el.input.addEventListener('input', () => {
      setCounter();
      if (!state.activeEventId || el.input.disabled) return;
      const text = String(el.input.value || '').trim();
      if (!text) {
        emitStopTyping(state.activeEventId);
        return;
      }
      emitTyping(state.activeEventId);
      scheduleStopTyping(state.activeEventId);
    });

    window.addEventListener('beforeunload', () => {
      if (!state.socket) return;
      state.events.forEach((ev) => {
        state.socket.emit('leave-event-chat', {
          eventId: ev.event_id,
          username: state.me.name
        });
      });
    });
  }

  async function init() {
    readUser();
    ensureStyles();
    ensureMarkup();
    cacheDom();
    bind();
    setCounter();
    renderAvailability();
    await refreshEvents();
    await setupSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();


