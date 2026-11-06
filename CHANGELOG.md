# Changelog

## 1.4.0 — November 2026

Chrome Web Store preparation & full platform policy compliance.

- **Removed download feature**: All video download functionality, background download handlers, and MAIN-world script injections (`page.js`) have been completely removed.
- **Removed `downloads` permission**: Manifest permissions reduced to only `storage` (minimal privilege).
- **100% client-side & zero network requests**: The extension now purely controls in-page `<video>` playback (scrubbing, frame-stepping, A-B looping, speed adjustment, mirror mode).
- Cleaned up settings popup and updated privacy policy and security policy to reflect zero external network activity.

## 1.3.0 — November 2026

- On/off switch in the toolbar menu. While off, the toolbar icon shows "OFF" and ReelCoach leaves every video alone (no controls, shortcuts, loops or mirroring).
- Facebook: controls now appear only on reels and stories. Regular Facebook videos already have a timeline, and the bar was covering their mute button.
- Facebook stories: Facebook pauses a story whenever the mouse is over it. ReelCoach now keeps it playing while you use the controls, and still respects a pause you ask for (click, key or the play button).
- Practice controls now work on TikTok too: timeline, skip, frame stepping, A–B loop, speed and mirror.
- Pop-up detection now recognises dialogs and screen-pinned layers directly, so the controls work on letterboxed players like TikTok's and still hide under sign-in pop-ups.

## 1.2.0 — November 2026

- Practice controls now work on Facebook reels and videos too: timeline, skip, frame stepping, A–B loop, speed and mirror.
- The download button stays Instagram-only. It's hidden on Facebook, and the extension makes no network requests there.

## 1.1.0 — November 2026

Security hardening after a full source audit, and the public name.

- Renamed to **ReelCoach**, with a new icon.
- Download lookup moved into the extension's isolated world. The page can no longer choose the download URL or filename.
- Downloads are limited to `https` files on Instagram's video servers and saved as `Downloads/Instagram/<safe-name>.mp4`. The background worker re-checks every request.
- All controls ignore events synthesized by page scripts.
- Settings are type-checked and kept within safe ranges.
- The control bar fits on one row on narrow reels.
- Settings popup redesigned, with a one-time personal-use note.
- Added privacy policy, security policy and MIT license.

## 1.0.0 — November 2026

First version.

- Hover controls on Instagram videos: timeline with click and drag, skip back and forward, frame stepping, play and pause.
- A–B looper with draggable markers.
- Playback speed and mirror.
- One-click download.
- Keyboard shortcuts and a settings popup.
