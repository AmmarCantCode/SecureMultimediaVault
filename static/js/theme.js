(function () {
  const KEY = 'smvTheme';
  const root = document.documentElement;

  function label(theme) {
    return theme === 'light' ? '🌞 Light' : '🌙 Neon';
  }

  function apply(theme) {
    const t = (theme === 'light') ? 'light' : 'neon';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch {}
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = label(t);
  }

  function init() {
    // Read current from DOM (pre-init script) or storage; default neon.
    let current = root.getAttribute('data-theme');
    if (current !== 'light' && current !== 'neon') {
      try {
        current = localStorage.getItem(KEY);
      } catch {}
      if (current !== 'light' && current !== 'neon') current = 'neon';
      root.setAttribute('data-theme', current);
    }
    apply(current);

    // Attach click handler safely (no inline onclick needed)
    const btn = document.getElementById('theme-toggle');
    if (btn && !btn.dataset.bound) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const next = (root.getAttribute('data-theme') === 'light') ? 'neon' : 'light';
        apply(next);
      });
      btn.dataset.bound = '1';
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
