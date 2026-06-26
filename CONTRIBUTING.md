# Contributing to Permafeed

Thanks for your interest in improving the project! This guide covers everything you need
to get a development build running and to land a change cleanly.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

1. Fork and clone the repo.
2. Load the extension unpacked:
   - Open `chrome://extensions` (or `edge://extensions`).
   - Enable **Developer mode**.
   - Click **Load unpacked** and select the project folder.
3. Open [youtube.com](https://www.youtube.com) and start hacking.

There is no build step - it's plain JavaScript, HTML, and CSS loaded directly. After
editing a file, click the **reload** (↻) icon on the extension card, then refresh the
YouTube tab.

## Debugging

Set `debug: true` in [`src/content/selectors.js`](src/content/selectors.js) to enable
verbose, timestamped console logging (and the restore "clobber" watcher). Open DevTools on
a YouTube tab and filter the console for `[Permafeed]`.

Tip: enable **Preserve log** in the DevTools console so logs survive navigation and
reloads.

## Project conventions

- **Centralize selectors.** Every YouTube DOM selector lives in
  [`src/content/selectors.js`](src/content/selectors.js). YouTube changes its markup
  frequently; never hardcode a selector anywhere else. If a selector breaks, fixing it
  should be a one-line change.
- **No important state in the service worker.** MV3 workers are ephemeral - persist
  anything that must survive in `chrome.storage` (`local` for snapshots/logs, `sync` for
  small settings).
- **Console logs are prefixed `[Permafeed]`** and gated behind the `debug` flag.
- **Keep it dependency-free** where reasonable. The extension ships no bundler and no
  runtime dependencies today; please discuss before introducing a build pipeline.
- **Match the surrounding style.** Two-space indentation, semicolons, single quotes.

## Making a change

1. Create a branch off `main`:
   ```sh
   git checkout -b feat/short-description
   ```
2. Make your change. Keep commits focused and write clear commit messages in the
   imperative mood (e.g. "Add freshness timer", not "added timer").
3. Manually test the affected flows. At minimum, verify:
   - Switching Default ⇄ Freeze in the popup takes effect live.
   - Leaving and returning to Home preserves the feed and scroll position.
   - A full reload on Home keeps the frozen feed (and freezes on the first visit,
     without clicking into a video).
   - **Refresh feed** loads a fresh feed.
   - The **Recently seen** list in the popup fills as you scroll Home, search works,
     entries open in a new tab, and the enable toggle / Clear behave.
4. Push and open a Pull Request against `main`, filling out the PR template.

## Reporting bugs & requesting features

Use the GitHub issue templates. For bugs, include your browser + version and the
`[Permafeed]` console output with `debug: true` enabled - it makes diagnosis dramatically
faster.

## Code of Conduct & Security

- Be respectful - see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) rather than opening a
  public issue.
