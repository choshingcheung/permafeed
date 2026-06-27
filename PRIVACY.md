# Privacy Policy for Permafeed

_Last updated: 2026-06-26_

Permafeed is a browser extension that preserves your YouTube home feed and keeps
a local, searchable list of videos that have appeared on it. Your privacy is
straightforward because the extension is built to keep everything on your own
device.

## What Permafeed stores

All data is stored locally in your browser using the standard extension storage
APIs (`chrome.storage`). Specifically:

- **Settings** (`chrome.storage.sync`): your selected mode (Default or Freeze)
  and whether the recently-seen log is enabled. If you are signed into your
  browser, these small settings may sync across your own devices through your
  browser vendor, the same way other browser settings do.
- **Frozen feed snapshot** (`chrome.storage.local`): the HTML of the home-feed
  tiles you have seen, plus your scroll position, so the feed can be restored.
- **Recently-seen log** (`chrome.storage.local`): for videos that appear on your
  YouTube Home feed, the video id, title, channel name, a thumbnail URL, the
  watch link, and timestamps of when you saw them.

## What Permafeed does NOT do

- It does **not** send any of this data to us or to any third party.
- It has **no** backend server, analytics, tracking, or telemetry.
- It does **not** sell or share your data with anyone.
- It does **not** collect personal information such as your name, email, or
  account credentials.

## Network requests

The only network requests Permafeed makes are to load video **thumbnail images**
from YouTube's image servers (`i.ytimg.com`), the same source the YouTube
website itself uses to display thumbnails. No personal data is sent in these
requests beyond the standard request for a public image.

## Permissions

- **Storage**: to save the settings, snapshot, and log described above.
- **Access to youtube.com**: the extension runs only on YouTube, where it reads
  and restores the home feed and records the videos shown there.

## Your control over your data

- Turn the recently-seen log off at any time from the popup.
- Clear the log at any time with the **Clear** button in the popup.
- Removing the extension deletes its local data.

## Changes

If this policy changes, the updated version will be published in the project
repository with a new "last updated" date.

## Contact

Questions about privacy can be raised via the project's GitHub repository:
https://github.com/choshingcheung/permafeed
