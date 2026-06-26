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
  // The recently-seen log is passive and local, so it's on by default. Users
  // can turn it off in the popup if they want Default to be a true kill switch.
  logEnabled: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(['mode', 'logEnabled']);
  const seed = {};
  if (existing.mode === undefined) seed.mode = DEFAULTS.mode;
  if (existing.logEnabled === undefined) seed.logEnabled = DEFAULTS.logEnabled;
  if (Object.keys(seed).length) await chrome.storage.sync.set(seed);
  console.log('[Permafeed] service worker installed');
});
