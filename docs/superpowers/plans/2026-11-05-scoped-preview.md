# Scoped Sprite Preview Implementation Plan

> Execute inline with executing-plans; retain the worktree and do not publish.

**Goal:** Share the native sprite animation preview with expiring read-only access.
**Architecture:** Separate preview router and browser entry; reuse bounded frames and animation controls; restrict owner HTTP and WS to localhost.
**Tech Stack:** Node, Express, ws, Vitest, Playwright.

- [x] Add failing integration tests in tests/web/preview-links.test.js for capability exchange, owner-route isolation, resource pinning, expiry/revocation and CLI roundtrip. Run with Node 26 using node_modules/vitest/vitest.mjs.
- [x] Implement server/web/preview-access.js for grants, owner request checks and network URL selection; server/web/preview-routes.js for the limited surface. Mount before existing owner routes and gate WebSocket upgrades.
- [x] Reuse projectFrames with an explicit preview projection that omits reference paths and shape-group metadata; reuse the existing progressive bounds.
- [x] Add server/web/public/preview.html and js/shared-preview.js, reusing AnimationPreview and ProjectFrames. Scrub the fragment before exchanging it; keep the grant ID in the path for separate tabs and reloads.
- [x] Add preview create/revoke CLI commands before ensureServer, rejecting older server protocols without starting or replacing the service. Document commands, remote editing change and transport limits.
- [x] Run HTTP/WS/CLI regressions and a Chromium phone-viewport test, inspect pixels and credential URLs, then commit locally and report exact evidence and remaining device test.
