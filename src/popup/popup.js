/**
 * Popup: the Default / Freeze mode switch, manual refresh, and the
 * recently-seen log (search, open, clear, enable toggle).
 *
 * Settings live in chrome.storage.sync; the log lives in chrome.storage.local.
 */
const MODE_KEY = 'mode';
const SNAPSHOT_KEY = 'snapshot';
const LOG_KEY = 'seenLog';
const LOG_ENABLED_KEY = 'logEnabled';

const radios = [...document.querySelectorAll('input[name="mode"]')];
const labels = [...document.querySelectorAll('label.mode')];
const refreshBtn = document.getElementById('refresh');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const countEl = document.getElementById('count');
const clearBtn = document.getElementById('clear');
const logEnabledEl = document.getElementById('log-enabled');

let logEntries = []; // full log, newest first

// --- Mode switch -----------------------------------------------------------

function paintActive(mode) {
  labels.forEach((l) => l.classList.toggle('active', l.dataset.mode === mode));
  radios.forEach((r) => (r.checked = r.value === mode));
  refreshBtn.disabled = mode !== 'freeze';
}

async function showSnapshotStatus() {
  const r = await chrome.storage.local.get(SNAPSHOT_KEY);
  const snap = r[SNAPSHOT_KEY];
  statusEl.textContent = snap
    ? `Frozen feed saved at ${new Date(snap.capturedAt).toLocaleTimeString()}`
    : 'No frozen feed saved yet.';
}

chrome.storage.sync.get([MODE_KEY, LOG_ENABLED_KEY]).then((r) => {
  paintActive(r[MODE_KEY] || 'default');
  logEnabledEl.checked = r[LOG_ENABLED_KEY] !== false;
  showSnapshotStatus();
});

radios.forEach((radio) => {
  radio.addEventListener('change', () => {
    chrome.storage.sync.set({ [MODE_KEY]: radio.value });
    paintActive(radio.value);
  });
});

refreshBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'refresh' }).catch(() => {
      statusEl.textContent = 'Open a YouTube tab to refresh.';
    });
  }
  window.close();
});

// --- Recently-seen log -----------------------------------------------------

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const rows = q
    ? logEntries.filter(
        (e) =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.channel || '').toLowerCase().includes(q)
      )
    : logEntries;

  countEl.textContent = logEntries.length ? `(${logEntries.length})` : '';

  if (!logEntries.length) {
    listEl.replaceChildren(emptyState('Nothing logged yet.<br>Open YouTube Home to start.'));
    return;
  }
  if (!rows.length) {
    listEl.replaceChildren(emptyState('No matches.'));
    return;
  }

  listEl.replaceChildren();
  for (const e of rows) {
    const a = document.createElement('a');
    a.className = 'entry';
    a.href = e.url;
    a.target = '_blank';
    a.rel = 'noopener';

    const img = document.createElement('img');
    img.src = e.thumb;
    img.loading = 'lazy';
    img.alt = '';

    const meta = el('div', 'meta');
    meta.append(el('div', 'title', e.title || e.url));

    const by = el('div', 'by');
    if (e.channel) by.append(document.createTextNode(`${e.channel} · `));
    by.append(el('span', 'time', timeAgo(e.lastSeen)));
    meta.append(by);

    a.append(img, meta);
    listEl.append(a);
  }
}

// A small frosted empty-state card. The message is a trusted literal, so the
// snowflake markup via innerHTML is safe here.
function emptyState(message) {
  const d = el('div', 'empty');
  d.innerHTML = `<span class="flake-sm">❄</span>${message}`;
  return d;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function loadLog() {
  const r = await chrome.storage.local.get(LOG_KEY);
  logEntries = r[LOG_KEY] || [];
  render();
}

searchEl.addEventListener('input', render);

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(LOG_KEY);
  logEntries = [];
  render();
});

logEnabledEl.addEventListener('change', () => {
  chrome.storage.sync.set({ [LOG_ENABLED_KEY]: logEnabledEl.checked });
});

// Keep the list live if the content script logs while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[LOG_KEY]) {
    logEntries = changes[LOG_KEY].newValue || [];
    render();
  }
});

loadLog();
