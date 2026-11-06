# Contributing to ReelCoach

Thanks for helping dancers practice better.

## Reporting a bug

Open an issue and include:

- your browser and its version (`chrome://version`);
- the ReelCoach version (shown on its card in `chrome://extensions`);
- the kind of page (direct reel link, Reels feed, home feed, profile);
- what you expected and what happened.

Please don't paste links to private accounts or other people's personal information. For security problems, use [SECURITY.md](SECURITY.md) instead of an issue.

## Making a change

1. Fork the repository and load your copy with **Load unpacked** (see the README).
2. Edit the files. There's no build step: click the reload icon on the ReelCoach card, then refresh Instagram.
3. Keep the security model intact (see [SECURITY.md](SECURITY.md)):
   - input handlers check `event.isTrusted`;
   - zero external network requests and no remote code;
   - no `innerHTML` with dynamic data;
   - no new permissions, sites or third-party code without a clear reason in the pull request.
4. Test on a direct reel link and in the scrolling Reels feed.
5. Open a pull request that describes the change and how you tested it.

## Ground rules

Be kind. Screenshots and recordings in issues and pull requests should use your own videos or content you have permission to share.
