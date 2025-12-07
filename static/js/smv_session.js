// smv_session.js — v5.8.2
(function () {
  const KEY = 'smv-passphrase';

  function save(p) {
    try { sessionStorage.setItem(KEY, p || ''); } catch {}
  }
  function load() {
    try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
  }
  function clear(allStores=false) {
    try { sessionStorage.removeItem(KEY); } catch {}
    if (allStores) { // clean up any legacy/localStorage leftovers
      try { localStorage.removeItem(KEY); } catch {}
    }
  }

  // PUBLIC API
  window.smvSetPassphrase   = (p) => save(p);
  window.smvClearPassphrase = ()   => clear(true);

  // Prompt once per session.
  window.smvGetPassphrase = function () {
    const cached = load();
    if (cached) return cached;

    // NOTE: use a different text (avoid any past auto-replace scripts)
    const p = window.prompt("Enter passphrase to unlock your private key:");
    if (p) { save(p); return p; }
    return null;
  };

  // --- Robust clearing hooks ---
  function bindLogoutClear() {
    // 1) Links to /logout
    document.querySelectorAll('a[href="/logout"]').forEach(a => {
      a.addEventListener('click', () => clear(true), { capture: true });
    });
    // 2) Any element with data-logout
    document.querySelectorAll('[data-logout]').forEach(el => {
      el.addEventListener('click', () => clear(true), { capture: true });
    });
    // 3) Forms posting to /logout
    document.querySelectorAll('form[action="/logout"]').forEach(f => {
      f.addEventListener('submit', () => clear(true), { capture: true });
    });
  }

  // If we land on an auth page (login/otp/onboarding), clear aggressively.
  function clearOnAuthPages() {
    const path = (location.pathname || '').toLowerCase();
    if (path.includes('/login') || path.includes('/otp') || path.includes('/onboarding')) {
      clear(true);
    }
    // Also clear if a body marker is present
    const bodyClass = document.body && document.body.className || '';
    if (/auth|login|onboarding/.test(bodyClass)) {
      clear(true);
    }
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      clearOnAuthPages();
      bindLogoutClear();
    });
  } else {
    clearOnAuthPages();
    bindLogoutClear();
  }
})();
