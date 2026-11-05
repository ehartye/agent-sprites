# Shareable sprite previews

With a project open on a current server, run:

```text
agent-sprites preview create
agent-sprites preview create --seconds 7200
agent-sprites preview revoke --id <share-id>
```

Use the managed launcher specified by sprite-setup in agent workflows. Copy the returned `url` into chat. Output also includes `localUrl` for the serving machine, `tailscaleUrl` when a supported existing adapter is available, `expiresAt`, `access: "read-only"`, and an independent share `id` for revocation. The CLI requires a compatible running server and does not start, replace, restart or rebind it. An older server needs an owner-arranged update and restart after active work ends.

The page reuses the editor's Full Preview controls, native pixel renderer, sequence rules, authored timing and bounded progressive frame loader. Viewers can choose sequences, play, pause and adjust playback speed. It shares artwork from one active project, including subsequent edits to it. Reference underlays, reference file paths, review notes, saved-session listings, exports and editing controls are excluded. Feedback is not supported; `--feedback` is rejected.

Links last one hour by default; `--seconds` accepts integers from 60 through 86400. Each server holds at most 128 live grants. Revocation immediately denies future data requests, including existing cookies. Server exit forgets all grants. Switching or reopening projects invalidates the previous project's links, even if its saved session ID is reused. The page checks for changes every five seconds; a device may keep artwork already fetched or downloaded. This is a live preview, not a frozen export.

## Access boundary

Each link contains an independent random 256-bit capability in its fragment. The server holds only a SHA-256 hash. The browser removes the fragment from its current history entry and exchanges it in a same-origin POST body for an HttpOnly, SameSite=Strict cookie. Each grant has its own cookie name and `/preview/<share-id>` path, allowing independent tabs and revocation. The share ID alone grants no access. Neither API nor asset URLs contain the capability. Preview responses are no-store and no-referrer; every protected request checks expiry and exact project identity again. Grants cannot enumerate or edit projects, import files, export to disk, shut down the server, or use its owner WebSocket.

The editor has no server-wide bearer credential. Owner HTTP routes and the editing WebSocket now require a loopback peer, a loopback Host and a matching Origin when supplied. Existing local CLI and editor workflows remain available. **Unauthenticated remote editing through the bare server address is intentionally closed.** A scoped cookie does not turn a remote peer into an owner. Localhost users retain the existing owner authority; this is not multi-user identity authentication.

A recipient may forward an unexpired link. To replace a compromised link, revoke its ID and create another. Expiry and revocation cannot erase pixels already received. Do not place links in public logs.

## Network and testing limits

The returned `url` prefers an existing named Tailscale IPv4 adapter within `100.64.0.0/10`; otherwise it uses localhost. Arbitrary `100.*` or unnamed VPN interfaces are not advertised as Tailscale. No firewall, ACL, DNS, HTTPS, Serve/Funnel or listener settings are configured. The existing server listener continues to bind all interfaces, but only scoped preview routes and their pure static dependencies are available remotely.

A Tailscale URL is a candidate address, not proof of reachability. The recipient device must already be on the tailnet and permitted by its ACLs and host firewall. Direct HTTP relies on Tailscale transport encryption; cookies do not claim Secure. HTTPS reverse proxies, forwarded headers and custom IPv6 tailnet deployments need separate integration. The server does not trust forwarded headers. Keep the server running while reviewing.

Automated tests use real HTTP/WebSocket clients and Chromium at a phone viewport through a local non-loopback adapter. They check pixels, playback, reload, concurrent grants, URL scrubbing, scoped cookies, management denial, TTL, revocation and resource replacement. This does not establish physical phone reachability or mobile Safari behavior. Verify those from the intended device before claiming them.


For local browser verification, install the declared dependencies and Chromium:
`npm ci` then `npx playwright install chromium`. Run
`node node_modules/vitest/vitest.mjs run tests/web tests/web-ui tests/cli --maxWorkers=2`.
The dedicated scoped-preview CI job installs Chromium and runs the preview/access regressions.
The existing `UI_SOFTWARE_NO_LINKS=1` test mode skips UI publisher link fixtures on
restricted producers; those cases remain unverified when this mode is used.
