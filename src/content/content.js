/**
 * Phase 1 content script - Freeze MVP.
 *
 * Validated: the innerHTML swap holds (YouTube does not re-render over it).
 * Set CONFIG.debug = true to re-enable per-step logs + the clobber watcher.
 *
 * Freeze flow:
 *   1. On LEAVING Home (yt-navigate-start), snapshot #contents innerHTML + scrollY.
 *   2. On RETURNING / reloading on Home, wait for fresh tiles, swap snapshot in.
 *   3. "Refresh feed" clears the snapshot and reloads.
 */
(() => {
  const { SELECTORS, CONFIG } = window.__PERMAFEED;
  const PREFIX = CONFIG.logPrefix;

  // Timestamped log, gated behind CONFIG.debug so production runs quietly.
  const DEBUG = CONFIG.debug === true;
  const t0 = performance.now();
  const ts = () => `+${(performance.now() - t0).toFixed(0)}ms`;
  const log = DEBUG ? (...args) => console.log(PREFIX, ts(), ...args) : () => {};

  const isHomePath = (path) => path === CONFIG.homePath;

  // --- State ----------------------------------------------------------------

  let mode = 'default';
  let snapshot = null; // { html, scrollY, capturedAt }
  let currentPath = location.pathname;
  let currentlyHome = isHomePath(currentPath);
  let restoreObserver = null;
  let clobberObserver = null;

  log('content script loaded | path =', currentPath, '| home?', currentlyHome, '| readyState =', document.readyState);

  // --- Storage --------------------------------------------------------------

  Promise.all([
    chrome.storage.sync.get(CONFIG.modeKey),
    chrome.storage.local.get(CONFIG.snapshotKey),
  ]).then(([sync, local]) => {
    if (sync[CONFIG.modeKey]) mode = sync[CONFIG.modeKey];
    if (local[CONFIG.snapshotKey]) {
      snapshot = local[CONFIG.snapshotKey];
      log('SNAPSHOT loaded from storage | captured', new Date(snapshot.capturedAt).toLocaleTimeString(),
          '| htmlLen', snapshot.html.length, '| scrollY', snapshot.scrollY);
    } else {
      log('no snapshot in storage');
    }
    log('mode =', mode);
    syncRefreshButton();

    if (currentlyHome) {
      log('init: on Home -> scheduleRestore()');
      scheduleRestore('init-load');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[CONFIG.modeKey]) {
      mode = changes[CONFIG.modeKey].newValue || 'default';
      log('mode changed ->', mode);
      syncRefreshButton();
    }
    if (area === 'local' && changes[CONFIG.snapshotKey]) {
      const nv = changes[CONFIG.snapshotKey].newValue;
      log('storage snapshot changed ->', nv ? `present (htmlLen ${nv.html.length})` : 'cleared');
    }
  });

  function persistSnapshot() {
    return chrome.storage.local.set({ [CONFIG.snapshotKey]: snapshot });
  }
  function clearSnapshot() {
    snapshot = null;
    return chrome.storage.local.remove(CONFIG.snapshotKey);
  }

  // --- DOM helpers ----------------------------------------------------------

  const getFeedContents = () => document.querySelector(SELECTORS.feedContents);
  const feedItemCount = () => document.querySelectorAll(SELECTORS.feedItem).length;

  // --- Capture --------------------------------------------------------------

  function captureFeed(reason) {
    const contents = getFeedContents();
    if (!contents) {
      log(`CAPTURE skipped (${reason}) - #contents not found`);
      return;
    }
    const tiles = feedItemCount();
    snapshot = {
      html: contents.innerHTML,
      scrollY: window.scrollY,
      capturedAt: Date.now(),
    };
    persistSnapshot();
    log(`CAPTURE (${reason}) | ${tiles} tiles | htmlLen ${snapshot.html.length} | scrollY ${snapshot.scrollY}`);
  }

  // --- Restore --------------------------------------------------------------

  function scheduleRestore(reason) {
    log(`scheduleRestore(${reason}) | mode=${mode} | hasSnapshot=${!!snapshot} | tilesNow=${feedItemCount()}`);
    if (mode !== 'freeze') { log('  -> abort: not freeze'); return; }
    if (!snapshot) { log('  -> abort: no snapshot'); return; }

    let done = false;
    let timer = null; // declared before finish() so the early-return path can clear it (TDZ fix)
    const finish = (how) => {
      if (done) return;
      done = true;
      if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; }
      if (timer) clearTimeout(timer);
      log(`  -> restore trigger (${how}) | tilesNow=${feedItemCount()}`);
      performRestore();
    };

    if (feedItemCount() > 0) { finish('tiles-already-present'); return; }

    // At document_start, body may not exist yet - fall back to documentElement.
    const target = document.querySelector(SELECTORS.feedGrid) || document.body || document.documentElement;
    log('  waiting for fresh tiles via MutationObserver on', target.tagName);
    restoreObserver = new MutationObserver(() => {
      const n = feedItemCount();
      if (n > 0) finish(`observer saw ${n} tiles`);
    });
    restoreObserver.observe(target, { childList: true, subtree: true });

    timer = setTimeout(() => finish('TIMEOUT'), CONFIG.restoreRenderTimeoutMs);
  }

  function performRestore() {
    const contents = getFeedContents();
    if (!contents || !snapshot) {
      log('RESTORE skipped - no contents or snapshot');
      return;
    }
    const before = feedItemCount();
    contents.innerHTML = snapshot.html;
    const after = feedItemCount();
    log(`RESTORE swapped | tiles ${before} -> ${after} | scrollY ${snapshot.scrollY}`);

    requestAnimationFrame(() => {
      window.scrollTo(0, snapshot.scrollY);
      requestAnimationFrame(() => window.scrollTo(0, snapshot.scrollY));
    });
    syncRefreshButton();
    if (DEBUG) watchForClobber(contents, after);
  }

  // Diagnostic: after we swap, does YouTube re-render over us? Watch #contents
  // for further mutations and report tile-count drift for a few seconds.
  function watchForClobber(contents, restoredCount) {
    if (clobberObserver) clobberObserver.disconnect();
    let mutations = 0;
    clobberObserver = new MutationObserver(() => { mutations++; });
    clobberObserver.observe(contents, { childList: true, subtree: true });
    log(`CLOBBER-WATCH started | restored ${restoredCount} tiles, watching #contents for 4s...`);

    setTimeout(() => {
      if (clobberObserver) { clobberObserver.disconnect(); clobberObserver = null; }
      const now = feedItemCount();
      const verdict = mutations === 0
        ? 'CLEAN (snapshot held)'
        : `CLOBBERED - ${mutations} mutations, tiles ${restoredCount} -> ${now} (YouTube re-rendered over us)`;
      log('CLOBBER-WATCH result:', verdict);
    }, 4000);
  }

  // --- Refresh action -------------------------------------------------------

  function refreshFeed() {
    log('REFRESH requested - clearing snapshot and reloading');
    clearSnapshot().then(() => location.reload());
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'refresh') refreshFeed();
  });

  // --- Floating refresh button ----------------------------------------------

  function syncRefreshButton() {
    const shouldShow = mode === 'freeze' && currentlyHome;
    const existing = document.getElementById(CONFIG.refreshButtonId);
    if (!shouldShow) { if (existing) existing.remove(); return; }
    if (existing) return;

    // At document_start the body isn't parsed yet; defer until it exists so we
    // never throw (which previously aborted the init -> restore chain).
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => syncRefreshButton(), { once: true });
      return;
    }

    const btn = document.createElement('button');
    btn.id = CONFIG.refreshButtonId;
    btn.textContent = '❄ Refresh feed';
    btn.title = 'Clear the frozen feed and load fresh videos';
    Object.assign(btn.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '9999',
      padding: '10px 16px', borderRadius: '20px', border: 'none',
      background: '#0f0f0f', color: '#fff',
      font: '500 14px/1 Roboto, Arial, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)', cursor: 'pointer',
    });
    btn.addEventListener('click', refreshFeed);
    document.body.appendChild(btn);
  }

  // --- Navigation wiring ----------------------------------------------------

  function evaluateTransition(reason) {
    const newPath = location.pathname;
    const wasHome = currentlyHome;
    const nowHome = isHomePath(newPath);

    if (newPath === currentPath && nowHome === currentlyHome) return;

    log(`NAV (${reason}) | ${currentPath} -> ${newPath} | home ${wasHome} -> ${nowHome}`);
    currentPath = newPath;
    currentlyHome = nowHome;

    if (!wasHome && nowHome) {
      log('  ENTER Home');
      syncRefreshButton();
      scheduleRestore('enter-home');
    } else if (wasHome && !nowHome) {
      log('  LEAVE Home');
      syncRefreshButton();
    }
  }

  document.addEventListener('yt-navigate-start', () => {
    log(`yt-navigate-start | currentlyHome=${currentlyHome} | mode=${mode}`);
    if (currentlyHome && mode === 'freeze') captureFeed('navigate-start');
  });

  document.addEventListener('yt-navigate-finish', () => evaluateTransition('yt-navigate-finish'));
  document.addEventListener('yt-page-data-updated', () => evaluateTransition('yt-page-data-updated'));
  window.addEventListener('popstate', () => evaluateTransition('popstate'));
})();
