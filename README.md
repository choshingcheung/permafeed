<div align="center">

# ❄ Permafeed

### Keep your YouTube home feed exactly where you left it.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](manifest.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

YouTube rebuilds your home feed on every navigation. You spot an interesting video,
click away without opening it, come back, and it is gone, with no setting to prevent it.

**Permafeed** freezes the feed you last saw and keeps it there, across navigation and full
page reloads, until you decide to refresh.

A Manifest V3 extension for Chrome, Edge, and other Chromium browsers.

> **Status:** early but working. Freeze mode is functional.

## Features

- **Freeze mode.** The home feed you last saw is preserved across in-app navigation and
  full page reloads. It only changes when you ask.
- **Default mode.** A kill switch: vanilla YouTube, nothing touched.
- **Manual refresh.** A floating button (and a popup button) clears the frozen feed and
  loads fresh videos on your terms.
- **Scroll position preserved.** You return exactly where you left off.
- **Private by design.** No tracking and no network calls. Everything stays local to your
  browser.

## Install (from source)

Permafeed is not on the Chrome Web Store yet. To run it now:

1. Clone the repo:
   ```sh
   git clone git@github.com:choshingcheung/permafeed.git
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the cloned folder.
5. Open [youtube.com](https://www.youtube.com), click the Permafeed icon, and choose
   **Freeze**.

## Usage

Open the popup from the toolbar and pick a mode:

| Mode | Behavior |
|------|----------|
| **Default** | Does nothing. Normal YouTube. |
| **❄ Freeze** | Keeps the last home feed you saw until you refresh. |

In Freeze mode, a floating **❄ Refresh feed** button appears on the home page. Click it
(or the button in the popup) whenever you want fresh videos.

## How it works

On leaving the home page, the content script snapshots the feed grid
(`ytd-rich-grid-renderer #contents`), its rendered HTML plus your scroll position, into
`chrome.storage.local`. On returning or reloading, it waits for YouTube to render, then
swaps your snapshot back in. Thumbnails are plain `<a>` links, so the restored static
markup stays fully clickable.

Every YouTube DOM selector is centralized in
[`src/content/selectors.js`](src/content/selectors.js). YouTube changes its markup often,
so a break is a one-line fix.

## Project structure

```
manifest.json                  MV3 manifest
src/
├── content/
│   ├── selectors.js           all YouTube selectors + config (single source of truth)
│   └── content.js             capture / restore / refresh logic
├── background/
│   └── service-worker.js      settings defaults
└── popup/
    ├── popup.html             mode switch UI
    └── popup.js
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick version: load the folder
unpacked (above), edit, then hit the reload icon on the extension card. Set `debug: true`
in [`src/content/selectors.js`](src/content/selectors.js) to enable verbose `[Permafeed]`
console logging.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Permafeed contributors

---

<div align="center">
<sub>Not affiliated with, endorsed by, or sponsored by YouTube or Google.
"YouTube" is a trademark of Google LLC.</sub>
</div>
