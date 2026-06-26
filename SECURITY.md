# Security Policy

## Supported Versions

This project is in early development. Security fixes are applied to the latest
version on the `main` branch. There are no long-term-support branches yet.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately using GitHub's [private vulnerability
reporting][advisories]: go to the repository's **Security** tab and click
**Report a vulnerability**.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof of concept.
- The affected version / commit and your browser + version.

You can expect an initial response within a few days. Once the issue is
confirmed, we'll work on a fix and coordinate a disclosure timeline with you.

## Scope

This is a client-side browser extension with no backend and no network calls of
its own. The most relevant concerns are:

- Handling of YouTube page content (the extension stores and re-inserts feed
  HTML via `chrome.storage.local`).
- Extension permissions (`storage`, host access to `youtube.com`).

Thank you for helping keep the project and its users safe.

[advisories]: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability
