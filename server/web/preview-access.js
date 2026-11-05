import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const hash = token => createHash('sha256').update(token).digest();
export function sameOrigin(req) {
  try {
    const server = new URL(`http://${req.headers.host}`);
    const origin = req.headers.origin;
    return (!origin || new URL(origin).origin === server.origin) && !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
  } catch { return false; }
}
export function ownerRequestAllowed(req) {
  if (!loopback.has(req.socket.remoteAddress)) return false;
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname) && sameOrigin(req);
  } catch { return false; }
}
export function previewLinks(port, resource, interfaces = networkInterfaces()) {
  const localUrl = `http://127.0.0.1:${port}${resource}`;
  let tailscaleUrl = null;
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!/tailscale/i.test(name)) continue;
    const ip = addresses?.find(a => {
      const octets = a.address.split('.').map(Number);
      return a.family === 'IPv4' && !a.internal && octets.length === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
    });
    if (ip) { tailscaleUrl = `http://${ip.address}:${port}${resource}`; break; }
  }
  return { url: tailscaleUrl ?? localUrl, localUrl, tailscaleUrl };
}

/** In-memory capabilities. Neither a raw token nor project contents is retained. */
export class PreviewGrants {
  constructor(now = () => Date.now()) { this.now = now; this.grants = new Map(); }
  prune() { for (const [id, grant] of this.grants) if (grant.expires <= this.now()) this.grants.delete(id); }
  issue(projectId, seconds = 3600) {
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400) throw new Error('seconds must be an integer from 60 to 86400');
    this.prune();
    if (this.grants.size >= 128) throw new Error('Preview limit reached; revoke an existing link');
    const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('base64url');
    const grant = { id, projectId, expires: this.now() + seconds * 1000, hash: hash(token) };
    this.grants.set(id, grant); return { grant, token };
  }
  get(id, token, projectId) {
    this.prune(); const grant = this.grants.get(id);
    if (!grant || grant.projectId !== projectId || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return timingSafeEqual(grant.hash, hash(token)) ? grant : null;
  }
  revoke(id) { return this.grants.delete(id); }
  clear() { this.grants.clear(); }
}
