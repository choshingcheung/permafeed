/**
 * Phase 0 service worker.
 *
 * MV3 workers are ephemeral, so they hold no important state - that lives in
 * chrome.storage (Phase 1+). For now it just confirms the worker boots and
 * seeds a default mode so later phases have something to read.
 */
const DEFAULTS = {
  // 'default' | 'freeze' (| 'newtab' later). Start conservative with vanilla
  // YouTube so the extension is a no-op until the user opts in.
  mode: 'default',
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get('mode');
  if (existing.mode === undefined) {
    await chrome.storage.sync.set({ mode: DEFAULTS.mode });
  }
  console.log('[Permafeed] service worker installed; mode =', existing.mode ?? DEFAULTS.mode);
});
