/**
 * Permafeed content script.
 *
 * Two features, both driven off the Home feed grid:
 *
 * FREEZE (mode = 'freeze'): preserve the feed you last saw.
 *   - Capture keeps only materialized tiles (those you scrolled past), pinning
 *     each thumbnail, and drops virtualized placeholders so nothing restores blank.
 *   - On a live feed with no snapshot we capture progressively as you scroll, so
 *     it freezes on the first visit without clicking into a video.
 *   - Restore waits for YouTube's render to settle, swaps the snapshot in, then a
 *     guard re-applies it if YouTube re-renders over us.
 *   - "Refresh feed" clears the snapshot and reloads.
 *
 * RECENTLY-SEEN LOG (independent of mode, toggleable): record every video that
 *   appears on Home (id, title, channel, thumbnail, link, timestamps) into
 *   chrome.storage.local, deduped by id, for the popup's searchable list.
 *
 * Set CONFIG.debug = true for verbose [Permafeed] logs and an on-page badge.
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
  let restoreObserver = null; // watches for the fresh feed to settle before restore
  let guardObserver = null; // re-applies the snapshot if YouTube clobbers it
  let guardTimer = null;
  let guardReapplies = 0; // safety cap so we never flicker-war forever
  let applyingSnapshot = false; // true while our own write is in flight
  let progressiveObserver = null; // captures the live feed as you scroll it
  let progressiveTimer = null;
  let progressiveScrollHandler = null;
  let logEnabled = true; // record the recently-seen log (independent of mode)
  let recordObserver = null; // watches Home to log videos as they appear
  let recordTimer = null;
  let recordScrollHandler = null;

  log('content script loaded | path =', currentPath, '| home?', currentlyHome, '| readyState =', document.readyState);

  // On a Home load, hide the feed immediately so YouTube's fresh feed never
  // flashes before we know whether to restore. The storage read below reveals
  // it again if we're not restoring; performRestore reveals it once swapped in.
  if (currentlyHome) {
    hideFeed();
    setTimeout(revealFeed, CONFIG.revealFailsafeMs); // never stay hidden
  }

  // --- Storage --------------------------------------------------------------

  Promise.all([
    chrome.storage.sync.get([CONFIG.modeKey, CONFIG.logEnabledKey]),
    chrome.storage.local.get(CONFIG.snapshotKey),
  ]).then(([sync, local]) => {
    if (sync[CONFIG.modeKey]) mode = sync[CONFIG.modeKey];
    logEnabled = sync[CONFIG.logEnabledKey] !== false; // default on
    if (local[CONFIG.snapshotKey]) {
      snapshot = local[CONFIG.snapshotKey];
      log('SNAPSHOT loaded from storage | captured', new Date(snapshot.capturedAt).toLocaleTimeString(),
          '| htmlLen', snapshot.html.length, '| scrollY', snapshot.scrollY);
    } else {
      log('no snapshot in storage');
    }
    log('mode =', mode, '| logEnabled =', logEnabled);
    syncRefreshButton();
    updateStatus('init loaded');

    if (currentlyHome) {
      log('init: on Home -> activateHome()');
      activateHome('init-load');
      startLogging();
      // If we won't restore (no snapshot, or not Freeze), reveal the feed we
      // optimistically hid. When we will restore, performRestore reveals it.
      if (!(mode === 'freeze' && snapshot)) revealFeed();
    } else {
      revealFeed(); // not Home; nothing to hide
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[CONFIG.modeKey]) {
      mode = changes[CONFIG.modeKey].newValue || 'default';
      log('mode changed ->', mode);
      if (mode === 'freeze') {
        if (currentlyHome) activateHome('mode-change');
      } else {
        // Leaving Freeze: stop defending/capturing so YouTube behaves normally.
        deactivateHome();
      }
      syncRefreshButton();
      updateStatus(`mode -> ${mode}`);
    }
    if (area === 'sync' && changes[CONFIG.logEnabledKey]) {
      logEnabled = changes[CONFIG.logEnabledKey].newValue !== false;
      log('logEnabled changed ->', logEnabled);
      if (logEnabled && currentlyHome) startLogging();
      else stopLogging();
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

  // Build the snapshot HTML from only the tiles the user has actually seen.
  //
  // YouTube virtualizes the feed: tiles below the fold are empty placeholder
  // shells (no /watch link, no thumbnail) until you scroll near them. Capturing
  // those as-is gives blank tiles on restore. So we keep only "materialized"
  // tiles (those with a real video link), pin each thumbnail (persist the loaded
  // URL, or derive one from the video id), and drop the placeholders. The feed
  // you freeze is exactly what you saw; anything you never reached stays fresh
  // and gets frozen on a later capture once you scroll to it.
  function buildSnapshotHtml(contents) {
    const kept = [];
    let derived = 0;
    contents.querySelectorAll(SELECTORS.feedItem).forEach((tile) => {
      const a = tile.querySelector(SELECTORS.thumbAnchor);
      if (!a) return; // unmaterialized placeholder shell - leave it to load fresh
      const img = a.querySelector('img');
      if (!img) return; // thumbnail not built yet - drop so we never restore a blank
      if (img.currentSrc && img.currentSrc.startsWith('http')) {
        img.setAttribute('src', img.currentSrc); // persist what's on screen
      } else {
        const id = (a.href.match(/[?&]v=([\w-]{11})/) || [])[1];
        if (!id) return; // can't resolve a thumbnail - drop rather than show blank
        img.setAttribute('src', CONFIG.thumbnailUrlTemplate.replace('{id}', id));
        img.removeAttribute('srcset'); // force our src over any empty srcset
        derived++;
      }
      kept.push(tile.outerHTML);
    });
    return { html: kept.join(''), kept: kept.length, derived };
  }

  function captureFeed(reason) {
    const contents = getFeedContents();
    if (!contents) {
      log(`CAPTURE skipped (${reason}) - #contents not found`);
      return;
    }
    const total = feedItemCount();
    let built;
    try {
      built = buildSnapshotHtml(contents);
    } catch (e) {
      log('buildSnapshotHtml failed:', e && e.message);
      return; // don't persist a broken snapshot
    }
    if (built.kept === 0) {
      log(`CAPTURE (${reason}) skipped - no materialized tiles yet`);
      return;
    }
    snapshot = {
      html: built.html,
      scrollY: window.scrollY,
      capturedAt: Date.now(),
    };
    persistSnapshot();
    log(`CAPTURE (${reason}) | kept ${built.kept}/${total} tiles | ${built.derived} thumbs derived | htmlLen ${snapshot.html.length} | scrollY ${snapshot.scrollY}`);
    updateStatus(`captured ${built.kept} seen tiles`);
  }

  // --- Restore --------------------------------------------------------------

  // YouTube renders the fresh feed asynchronously and in bursts. If we swap our
  // snapshot in at the first tile, YouTube keeps rendering and overwrites it
  // ("clobber"). So we wait until the feed has rendered AND stopped changing for
  // a short settle window, then swap once, then guard it (see startFreezeGuard).
  function scheduleRestore(reason) {
    log(`scheduleRestore(${reason}) | mode=${mode} | hasSnapshot=${!!snapshot} | tilesNow=${feedItemCount()}`);
    if (mode !== 'freeze') { log('  -> abort: not freeze'); return; }
    if (!snapshot) { log('  -> abort: no snapshot'); return; }

    hideFeed(); // hide the live feed while we wait to swap (covers SPA enter too)

    let done = false;
    let settleTimer = null;
    let maxTimer = null;
    const finish = (how) => {
      if (done) return;
      done = true;
      if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; }
      clearTimeout(settleTimer);
      clearTimeout(maxTimer);
      log(`  -> restore trigger (${how}) | tiles=${feedItemCount()}`);
      performRestore();
    };

    // Each time the feed mutates with tiles present, (re)arm a short settle
    // timer. When YouTube goes quiet, we restore. A hard cap guarantees we
    // restore even if the feed never fully settles.
    const onMutate = () => {
      if (feedItemCount() > 0) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish('settled'), CONFIG.restoreSettleMs);
      }
    };

    const target = document.querySelector(SELECTORS.feedGrid) || document.body || document.documentElement;
    restoreObserver = new MutationObserver(onMutate);
    restoreObserver.observe(target, { childList: true, subtree: true });
    onMutate(); // handle the case where tiles are already present
    maxTimer = setTimeout(() => finish('max-timeout'), CONFIG.restoreRenderTimeoutMs);
  }

  function performRestore() {
    if (!getFeedContents() || !snapshot) {
      log('RESTORE skipped - no contents or snapshot');
      revealFeed(); // don't leave the feed hidden if we bail
      return;
    }
    stopProgressiveCapture(); // we're switching from live to frozen
    applySnapshot(snapshot.scrollY); // initial restore jumps to the saved scroll
    startFreezeGuard();
    syncRefreshButton();
    setFrozen(true); // ambient on-page signal that the feed is held
    revealFeed(); // snapshot is in the DOM now; show it
    log('RESTORE done; freeze guard armed');
    updateStatus('restored + guard armed');
  }

  // Re-apply a scroll position resiliently. The restored content grows to full
  // height as thumbnails size, so a single scrollTo right after the swap often
  // clamps near the top; YouTube/the browser can also reset scroll a beat later.
  // So we re-apply across a short window, stopping early once it sticks or once
  // you scroll yourself (so we never fight your input).
  function restoreScroll(targetY) {
    if (!targetY) return; // 0 / undefined: nothing to do
    let attempts = 0;
    let cancelled = false;
    const onUserScroll = () => { cancelled = true; cleanup(); };
    const cleanup = () => {
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      window.removeEventListener('keydown', onUserScroll);
    };
    ['wheel', 'touchmove', 'keydown'].forEach((e) =>
      window.addEventListener(e, onUserScroll, { passive: true }));

    const tick = () => {
      if (cancelled) return;
      window.scrollTo(0, targetY);
      attempts++;
      // Stop once we've landed (and stayed) or run out of attempts.
      if (attempts >= CONFIG.scrollRestoreAttempts) { cleanup(); return; }
      setTimeout(tick, CONFIG.scrollRestoreIntervalMs);
    };
    // First pass is synchronous so the caller can reveal the feed already at the
    // right position (no visible jump from top); later passes defend it.
    tick();
  }

  // Write the snapshot into the feed. `applyingSnapshot` lets the guard ignore
  // the mutations our own write produces. scrollTarget is the saved scroll on
  // the first restore, or undefined to keep the user's current scroll on a
  // guard re-apply (so re-applying never yanks the page).
  function applySnapshot(scrollTarget) {
    const contents = getFeedContents();
    if (!contents || !snapshot) return;
    const keepScroll = scrollTarget != null ? scrollTarget : window.scrollY;
    const before = feedItemCount();
    applyingSnapshot = true;
    contents.innerHTML = snapshot.html;
    const after = feedItemCount();
    requestAnimationFrame(() => requestAnimationFrame(() => { applyingSnapshot = false; }));
    restoreScroll(keepScroll);
    log(`apply snapshot | tiles ${before} -> ${after} | scrollY ${keepScroll}`);
  }

  // While frozen, the snapshot is the source of truth. If YouTube re-renders the
  // feed (the clobber), re-apply our snapshot. Debounced so we let YouTube's
  // render burst finish, then overwrite it once, instead of fighting every
  // mutation. Our own writes are skipped via the applyingSnapshot flag.
  function startFreezeGuard() {
    stopFreezeGuard();
    guardReapplies = 0;
    const target = document.querySelector(SELECTORS.feedGrid) || getFeedContents();
    if (!target) return;
    guardObserver = new MutationObserver(() => {
      if (applyingSnapshot) return;
      clearTimeout(guardTimer);
      guardTimer = setTimeout(() => {
        if (mode !== 'freeze' || !currentlyHome || !snapshot) return;
        if (guardReapplies >= CONFIG.freezeGuardMaxReapplies) {
          log('guard: re-apply cap reached, standing down to avoid a flicker war');
          stopFreezeGuard();
          return;
        }
        guardReapplies++;
        log(`guard: feed changed under us, re-applying snapshot (#${guardReapplies})`);
        applySnapshot(); // keep current scroll
        updateStatus(`guard re-applied #${guardReapplies}`);
      }, CONFIG.freezeGuardDebounceMs);
    });
    guardObserver.observe(target, { childList: true, subtree: true });
  }

  function stopFreezeGuard() {
    if (guardObserver) { guardObserver.disconnect(); guardObserver = null; }
    clearTimeout(guardTimer);
  }

  // --- Progressive capture (freeze on the first visit) ----------------------

  // When you're on a LIVE Home feed with no snapshot yet (first visit, or after
  // a refresh), keep capturing what you've scrolled past, debounced. This way a
  // snapshot exists without you having to click into a video first - a plain
  // reload or return then restores it. Runs only in the live state; once a feed
  // is restored+guarded we're frozen and don't capture our own static tiles.
  function startProgressiveCapture() {
    stopProgressiveCapture();
    const target = document.querySelector(SELECTORS.feedGrid) || document.body || document.documentElement;
    const onChange = () => {
      clearTimeout(progressiveTimer);
      progressiveTimer = setTimeout(() => {
        if (mode === 'freeze' && currentlyHome) captureFeed('progressive');
      }, CONFIG.progressiveCaptureDebounceMs);
    };
    progressiveObserver = new MutationObserver(onChange);
    progressiveObserver.observe(target, { childList: true, subtree: true });
    progressiveScrollHandler = onChange;
    window.addEventListener('scroll', onChange, { passive: true });
    onChange(); // capture the initial view once it settles
  }

  function stopProgressiveCapture() {
    if (progressiveObserver) { progressiveObserver.disconnect(); progressiveObserver = null; }
    if (progressiveScrollHandler) {
      window.removeEventListener('scroll', progressiveScrollHandler);
      progressiveScrollHandler = null;
    }
    clearTimeout(progressiveTimer);
  }

  // Single entry point for "we're on Home in Freeze mode": restore an existing
  // snapshot, or (first visit) start building one from the live feed.
  function activateHome(reason) {
    if (mode !== 'freeze') return;
    if (snapshot) {
      scheduleRestore(reason);
    } else {
      log(`activateHome(${reason}) - no snapshot yet, progressive capture on`);
      setFrozen(false); // live feed, not frozen
      startProgressiveCapture();
    }
  }

  function deactivateHome() {
    stopFreezeGuard();
    stopProgressiveCapture();
    if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; }
    revealFeed(); // never carry the hidden state off Home
    setFrozen(false);
  }

  // --- Recently-seen log ----------------------------------------------------

  // Pull stable data from a tile for the log. id/url/thumb are always reliable
  // (derived from the watch link); title/channel are best-effort text scrapes.
  function extractTileData(tile) {
    const a = tile.querySelector(SELECTORS.thumbAnchor);
    if (!a) return null;
    const id = (a.href.match(/[?&]v=([\w-]{11})/) || [])[1];
    if (!id) return null;
    const titleEl = tile.querySelector(SELECTORS.tileTitle);
    const channelEl = tile.querySelector(SELECTORS.tileChannel);
    const title = ((titleEl && titleEl.textContent) || a.getAttribute('aria-label') || '').trim();
    const channel = ((channelEl && channelEl.textContent) || '').trim();
    return {
      id,
      title,
      channel,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb: CONFIG.logThumbnailTemplate.replace('{id}', id),
    };
  }

  // Merge the currently-visible videos into the log (dedupe by id, refresh
  // lastSeen, backfill title/channel if they were empty), newest first, capped.
  async function recordSeenTiles() {
    const contents = getFeedContents();
    if (!contents) return;
    const fresh = [];
    contents.querySelectorAll(SELECTORS.feedItem).forEach((tile) => {
      const d = extractTileData(tile);
      if (d) fresh.push(d);
    });
    if (!fresh.length) return;

    const now = Date.now();
    const store = await chrome.storage.local.get(CONFIG.logKey);
    const byId = new Map((store[CONFIG.logKey] || []).map((e) => [e.id, e]));
    let added = 0;
    for (const d of fresh) {
      const existing = byId.get(d.id);
      if (existing) {
        existing.lastSeen = now;
        if (!existing.title && d.title) existing.title = d.title;
        if (!existing.channel && d.channel) existing.channel = d.channel;
      } else {
        byId.set(d.id, { ...d, firstSeen: now, lastSeen: now });
        added++;
      }
    }
    let merged = [...byId.values()].sort((a, b) => b.lastSeen - a.lastSeen);
    if (merged.length > CONFIG.maxLogEntries) merged = merged.slice(0, CONFIG.maxLogEntries);
    await chrome.storage.local.set({ [CONFIG.logKey]: merged });
    if (added) log(`logged ${added} new video(s); ${merged.length} total`);
  }

  // Watch Home and record videos as they appear / as you scroll. Runs whenever
  // you're on Home and logging is enabled, regardless of Freeze mode.
  function startLogging() {
    if (!logEnabled) return;
    stopLogging();
    const target = document.querySelector(SELECTORS.feedGrid) || document.body || document.documentElement;
    const onChange = () => {
      clearTimeout(recordTimer);
      recordTimer = setTimeout(() => {
        if (currentlyHome && logEnabled) recordSeenTiles();
      }, CONFIG.recordDebounceMs);
    };
    recordObserver = new MutationObserver(onChange);
    recordObserver.observe(target, { childList: true, subtree: true });
    recordScrollHandler = onChange;
    window.addEventListener('scroll', onChange, { passive: true });
    onChange();
  }

  function stopLogging() {
    if (recordObserver) { recordObserver.disconnect(); recordObserver = null; }
    if (recordScrollHandler) {
      window.removeEventListener('scroll', recordScrollHandler);
      recordScrollHandler = null;
    }
    clearTimeout(recordTimer);
  }

  // --- Refresh action -------------------------------------------------------

  function refreshFeed() {
    log('REFRESH requested - clearing snapshot and reloading');
    stopFreezeGuard();
    setFrozen(false);
    clearSnapshot().then(() => location.reload());
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'refresh') refreshFeed();
  });

  // --- Flash prevention -----------------------------------------------------

  // To avoid a flash of YouTube's fresh feed before we restore, we hide the feed
  // grid with `visibility: hidden` (keeps layout, so no jump, and YouTube still
  // renders into it so our settle detection works) and reveal it the moment our
  // snapshot is in. visibility (not display:none) matters: display:none can stop
  // YouTube rendering the tiles we wait on.
  function ensureHideStyle() {
    if (document.getElementById(CONFIG.hideStyleId)) return;
    const style = document.createElement('style');
    style.id = CONFIG.hideStyleId;
    style.textContent =
      `html.${CONFIG.hideFeedClass} ${SELECTORS.feedGrid} { visibility: hidden !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }
  function hideFeed() {
    ensureHideStyle();
    document.documentElement.classList.add(CONFIG.hideFeedClass);
  }
  function revealFeed() {
    document.documentElement.classList.remove(CONFIG.hideFeedClass);
  }

  // --- On-page debug status badge -------------------------------------------

  // A live, bottom-left readout of Permafeed's state, so we can diagnose without
  // fishing through YouTube's noisy console. Debug-only.
  function updateStatus(lastAction) {
    if (!DEBUG || !document.body) return;
    let el = document.getElementById(CONFIG.statusBadgeId);
    if (!el) {
      el = document.createElement('div');
      el.id = CONFIG.statusBadgeId;
      Object.assign(el.style, {
        position: 'fixed', left: '12px', bottom: '12px', zIndex: '100000',
        background: 'rgba(0,0,0,.85)', color: '#39ff14',
        font: '12px/1.45 monospace', padding: '6px 10px', borderRadius: '6px',
        whiteSpace: 'pre', pointerEvents: 'none', maxWidth: '320px',
      });
      document.body.appendChild(el);
    }
    el.textContent =
      `Permafeed [${mode}]${currentlyHome ? ' · HOME' : ''}\n` +
      `snapshot: ${snapshot ? `${feedItemCount() ? feedItemCount() + ' tiles · ' : ''}${snapshot.html.length} bytes` : 'NONE'}\n` +
      `guard: armed=${!!guardObserver} reapplies=${guardReapplies}` +
      (lastAction ? `\nlast: ${lastAction}` : '');
  }

  // --- On-page UI (floating button + frozen signal) -------------------------

  // Permafeed's on-page identity: a frosted-cyan refresh pill, and an ambient
  // frost line at the top of the viewport plus a gentle glow on the pill while a
  // frozen feed is showing. Injected once; matches the popup's "cryo" look.
  function ensureOnPageStyle() {
    if (document.getElementById(CONFIG.onPageStyleId)) return;
    const style = document.createElement('style');
    style.id = CONFIG.onPageStyleId;
    style.textContent = `
      #${CONFIG.refreshButtonId} {
        position: fixed; right: 22px; bottom: 22px; z-index: 9999;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 10px 16px; border-radius: 999px;
        font: 600 13px/1 "Roboto", Arial, sans-serif; letter-spacing: .01em;
        color: #dbf3ff; cursor: pointer;
        background: rgba(13, 23, 35, .72);
        -webkit-backdrop-filter: blur(12px) saturate(1.2);
        backdrop-filter: blur(12px) saturate(1.2);
        border: 1px solid rgba(128, 198, 255, .32);
        box-shadow: 0 10px 30px -12px rgba(76, 196, 255, .5), inset 0 1px 0 rgba(255,255,255,.08);
        transition: transform .14s ease, box-shadow .22s ease, background .22s ease;
      }
      #${CONFIG.refreshButtonId}:hover {
        transform: translateY(-2px); background: rgba(20, 34, 50, .85);
        box-shadow: 0 14px 38px -12px rgba(76, 196, 255, .72);
      }
      #${CONFIG.refreshButtonId}:active { transform: translateY(0); }
      #${CONFIG.refreshButtonId} .pf-flake { color: #93eaff; font-size: 15px; line-height: 1; }
      html.${CONFIG.frozenClass} #${CONFIG.refreshButtonId} {
        animation: pf-breathe 3.6s ease-in-out infinite;
      }
      @keyframes pf-breathe {
        0%, 100% { box-shadow: 0 10px 30px -14px rgba(76,196,255,.45), inset 0 1px 0 rgba(255,255,255,.08); border-color: rgba(128,198,255,.28); }
        50% { box-shadow: 0 10px 36px -8px rgba(76,196,255,.8), inset 0 1px 0 rgba(255,255,255,.1); border-color: rgba(147,234,255,.55); }
      }
      html.${CONFIG.frozenClass}::before {
        content: ""; position: fixed; top: 0; left: 0; right: 0; height: 2px; z-index: 100000;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, rgba(147,234,255,.85), rgba(56,182,255,.85), transparent);
      }
      @media (prefers-reduced-motion: reduce) {
        html.${CONFIG.frozenClass} #${CONFIG.refreshButtonId} { animation: none; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setFrozen(on) {
    document.documentElement.classList.toggle(CONFIG.frozenClass, !!on);
  }

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

    ensureOnPageStyle();
    const btn = document.createElement('button');
    btn.id = CONFIG.refreshButtonId;
    btn.title = 'Clear the frozen feed and load fresh videos';
    const flake = document.createElement('span');
    flake.className = 'pf-flake';
    flake.textContent = '❄';
    btn.append(flake, document.createTextNode('Refresh feed'));
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
      updateStatus('entered home');
      activateHome('enter-home');
      startLogging();
    } else if (wasHome && !nowHome) {
      log('  LEAVE Home');
      deactivateHome(); // stop guarding / capturing; we're off Home now
      stopLogging();
      syncRefreshButton();
      updateStatus('left home');
    }
  }

  document.addEventListener('yt-navigate-start', () => {
    log(`yt-navigate-start | currentlyHome=${currentlyHome} | mode=${mode}`);
    // Capture the live feed before YouTube tears it down. The guard keeps the
    // feed equal to the snapshot, so what we capture here is the frozen feed.
    if (currentlyHome && mode === 'freeze') captureFeed('navigate-start');
  });

  document.addEventListener('yt-navigate-finish', () => evaluateTransition('yt-navigate-finish'));
  document.addEventListener('yt-page-data-updated', () => evaluateTransition('yt-page-data-updated'));
  window.addEventListener('popstate', () => evaluateTransition('popstate'));
})();
