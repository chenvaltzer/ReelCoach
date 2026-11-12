# Security policy

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue:

1. Go to this repository's **Security** tab.
2. Click **Report a vulnerability** (GitHub private vulnerability reporting).
3. Describe what you found, how to reproduce it, and which browser and ReelCoach version you used.

You'll get a reply within 7 days. Please give us a reasonable amount of time to release a fix before sharing details publicly.

## Supported versions

Only the latest release receives security fixes.

## Security model

ReelCoach treats everything on the sites it runs on (Instagram, Facebook, TikTok), including scripts running on the page, as untrusted:

- **Real input only.** All controls ignore events that page scripts synthesize (`event.isTrusted` must be true).
- **Isolated state & one-way seek bridge.** All UI, settings, and input handling run in an isolated content script world with Shadow DOM encapsulation (`#igvc-host`), preventing host page scripts from reading or manipulating extension state. A minimal 20-line MAIN-world helper (`src/page-seek.js`) only forwards numeric `video.currentTime` seeks so the host player can clear stale `MediaSource` buffer ranges, and never passes page data back to the extension.
- **Zero network requests.** The extension makes no network requests, executes no downloads, and contacts no external APIs.
- **No dynamic code.** No `eval`, no remote scripts, no third-party dependencies, and zero HTML injection with dynamic data. Dynamic values are only ever rendered using `textContent`.
- **Minimal permissions (Least Privilege).** Exactly one permission (`storage`) to persist user UI settings. No `downloads`, no webRequest, no cookies, no host permissions, no external messaging, and no web-accessible resources.

## Audit history

| Date | Scope | Result |
|---|---|---|
| November 2026 | Full source review with [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (quick profile; 4 reconnaissance agents, 3 hunters, a coverage critic and independent verifiers) | 0 confirmed vulnerabilities. Two leads that needed runtime validation and the hardening notes were fixed in 1.1.0. Version 1.4.0 completely removed all video downloading and network requests for full Chrome Web Store compliance. |
