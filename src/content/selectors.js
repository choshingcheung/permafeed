/**
 * Centralized selector + config object.
 *
 * Selector drift is the #1 risk: YouTube changes its DOM often, so EVERY selector
 * lives here. When something breaks, this is the one file to fix.
 *
 * Content scripts listed together in the manifest share one isolated-world
 * global scope and run in order, so this namespace is visible to content.js.
 */
window.__PERMAFEED = window.__PERMAFEED || {};

window.__PERMAFEED.SELECTORS = {
  // The home feed grid container. Treat as fragile.
  feedGrid: 'ytd-rich-grid-renderer',
  // Inner contents element that actually holds the video tiles. We snapshot and
  // restore THIS element's innerHTML (the tiles), leaving the renderer shell.
  feedContents: 'ytd-rich-grid-renderer #contents',
  // A single video tile within the grid. Used to detect when YouTube has
  // finished rendering a fresh feed (count > 0) before we swap our snapshot in.
  feedItem: 'ytd-rich-item-renderer',
};

window.__PERMAFEED.CONFIG = {
  // Path that counts as "Home".
  homePath: '/',
  // Log prefix so our messages are easy to filter in the console.
  logPrefix: '[Permafeed]',
  // Verbose diagnostics (per-step logs + the clobber watcher). Flip to true
  // when debugging selector drift or restore timing.
  debug: false,

  // Storage keys.
  modeKey: 'mode', // in chrome.storage.sync - 'default' | 'freeze'
  snapshotKey: 'snapshot', // in chrome.storage.local - survives full reload

  // DOM ids for our injected UI (so we never inject twice / can find them).
  refreshButtonId: 'permafeed-refresh-btn',

  // How long to wait for YouTube's fresh feed to render before giving up on
  // gating the restore on a MutationObserver (ms).
  restoreRenderTimeoutMs: 4000,
};
