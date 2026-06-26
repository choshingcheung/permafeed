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
  // A link wrapping a video thumbnail. Covers both the old (a#thumbnail) and the
  // newer lockup markup, since both point at /watch?v=. We use these to pin
  // thumbnail image sources before snapshotting (see inlineThumbnails).
  thumbAnchor: 'a[href*="/watch?v="]',
  // Best-effort title/channel text within a tile, for the recently-seen log.
  // Multiple candidates because the markup differs across YouTube layouts; the
  // first match that has text wins.
  tileTitle: '#video-title, .yt-lockup-metadata-view-model-wiz__title, h3 a, yt-formatted-string#video-title',
  tileChannel: 'ytd-channel-name a, #channel-name a, #channel-name #text, .yt-content-metadata-view-model-wiz__metadata-text',
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
  logKey: 'seenLog', // in chrome.storage.local - the recently-seen list
  logEnabledKey: 'logEnabled', // in chrome.storage.sync - record on/off

  // Recently-seen log.
  maxLogEntries: 1000, // cap; oldest-seen entries fall off past this
  recordDebounceMs: 800, // how long after the feed settles before we record
  // Thumbnail used in the log list (16:9, always available for a video id).
  logThumbnailTemplate: 'https://i.ytimg.com/vi/{id}/mqdefault.jpg',

  // DOM ids for our injected UI (so we never inject twice / can find them).
  refreshButtonId: 'permafeed-refresh-btn',
  statusBadgeId: 'permafeed-status-badge', // on-page debug readout (debug only)
  hideStyleId: 'permafeed-hide-style', // <style> that hides the feed pre-restore
  hideFeedClass: 'permafeed-hiding', // toggled on <html> to hide the feed grid
  // Failsafe: if a restore never completes, reveal the feed anyway after this
  // long so a bug can never leave the page blank.
  revealFailsafeMs: 4000,

  // Fallback thumbnail URL, derived from a video id, for thumbnails YouTube had
  // not lazy-loaded at capture time. hqdefault.jpg always exists for a video.
  thumbnailUrlTemplate: 'https://i.ytimg.com/vi/{id}/hqdefault.jpg',

  // Restore timing (ms):
  // - settle: how long the fresh feed must stop mutating before we swap in the
  //   snapshot, so we don't restore mid-render and get clobbered.
  // - renderTimeout: hard cap; restore even if the feed never fully settles.
  // - guardDebounce: after restoring, how long to wait past a YouTube re-render
  //   before re-applying the snapshot (let its burst finish, then overwrite).
  restoreSettleMs: 350,
  restoreRenderTimeoutMs: 4000,
  // Scroll restore is re-applied a few times because the restored content grows
  // to full height as thumbnails size, and YouTube/the browser can reset scroll
  // a beat after the swap. We stop early if the position sticks or you scroll.
  scrollRestoreAttempts: 16,
  scrollRestoreIntervalMs: 60,
  freezeGuardDebounceMs: 400,
  // Safety cap: if YouTube keeps re-rendering, stop re-applying after this many
  // times rather than flicker-warring forever.
  freezeGuardMaxReapplies: 20,
  // On a live Home feed with no snapshot yet, how long after you stop
  // scrolling/the feed stops changing before we capture what you've seen.
  progressiveCaptureDebounceMs: 500,
};
