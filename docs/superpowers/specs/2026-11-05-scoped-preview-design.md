# Scoped sprite preview links

The existing server binds all interfaces and has no owner credential. Keep the local editing UI and CLI, but require a loopback peer, loopback Host, and matching Origin for owner HTTP and WebSocket requests. A separate credential would require distributing or persisting a new owner secret; localhost authority avoids that and keeps the existing local workflow. Existing unauthenticated remote editing is intentionally closed.

Add a read-only preview namespace for the current project identity. Use the existing AnimationPreview, progressive ProjectFrames, native raster worker, preview sequence rules, authored timing, and styles. Exclude reference-image paths, review notes, session listings, and editing tools. There is no feedback grant in this iteration.

Issue random 256-bit bearer capabilities in fragments; store only SHA-256 hashes in memory. Exchange by same-origin POST for a per-grant HttpOnly SameSite=Strict cookie scoped to /preview/<id>. Validate that exact grant and active project identity on every data request. Expire after one hour by default, permit integer TTLs from 60 seconds to 24 hours, cap live grants at 128, and support explicit revocation. A project replacement or server exit invalidates access. Data already received cannot be recalled.

Return id, url, localUrl, tailscaleUrl, expiresAt and access. Advertise only an existing named Tailscale IPv4 CGNAT adapter, without configuring network services. CLI preview create/revoke requires an already running compatible server and never starts or replaces one. No release, deployment, branch push or PR is included.

Validation: baseline web/WS tests; HTTP capability, origin, remote-owner, session switch, TTL, revocation, restart, payload privacy and bounded frame tests; CLI roundtrip; real Chromium phone-viewport playback, reload, concurrent grants, URL scrubbing and denial. Phone-to-host reachability remains a separate device check.
