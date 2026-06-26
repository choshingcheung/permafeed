/**
 * Popup: the Default / Freeze mode switch + a manual "Refresh feed" action.
 *
 * Mode lives in chrome.storage.sync so it syncs across devices and the content
 * script reacts to it live via storage.onChanged. Refresh is forwarded to the
 * active YouTube tab's content script.
 */
const MODE_KEY = 'mode';
const SNAPSHOT_KEY = 'snapshot';

const radios = [...document.querySelectorAll('input[name="mode"]')];
const labels = [...document.querySelectorAll('label.mode')];
const refreshBtn = document.getElementById('refresh');
const statusEl = document.getElementById('status');

function paintActive(mode) {
  labels.forEach((l) => l.classList.toggle('active', l.dataset.mode === mode));
  radios.forEach((r) => (r.checked = r.value === mode));
  // Refresh only makes sense in Freeze mode.
  refreshBtn.disabled = mode !== 'freeze';
}

async function showSnapshotStatus() {
  const r = await chrome.storage.local.get(SNAPSHOT_KEY);
  const snap = r[SNAPSHOT_KEY];
  statusEl.textContent = snap
    ? `Frozen feed saved at ${new Date(snap.capturedAt).toLocaleTimeString()}`
    : 'No frozen feed saved yet.';
}

// Load current mode.
chrome.storage.sync.get(MODE_KEY).then((r) => {
  paintActive(r[MODE_KEY] || 'default');
  showSnapshotStatus();
});

// Switch mode on selection.
radios.forEach((radio) => {
  radio.addEventListener('change', () => {
    const mode = radio.value;
    chrome.storage.sync.set({ [MODE_KEY]: mode });
    paintActive(mode);
  });
});

// Forward a refresh to the active YouTube tab.
refreshBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'refresh' }).catch(() => {
      statusEl.textContent = 'Open a YouTube tab to refresh.';
    });
  }
  window.close();
});
