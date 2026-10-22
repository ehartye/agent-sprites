// Capture source/package metadata before long-lived renderer modules load.
import './build/producer-identity.js';
import { networkInterfaces, tmpdir } from 'os';
import { join } from 'path';
import { startWebServer } from './web/http.js';
import { SessionDB } from './db/session.js';
import { Project } from './engine/project.js';
import { GroupManager } from './engine/group-manager.js';

// Tailscale assigns 100.64.0.0/10 CGNAT addresses. Scan interfaces for one.
function findTailscaleIp() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && a.address.startsWith('100.')) {
        return a.address;
      }
    }
  }
  return null;
}

const db = new SessionDB();

const state = {
  project: null,
  sessionId: null,
  db,
  // PNG view renders (view --png / view --sheet) are written here
  tmpDir: join(tmpdir(), 'claude-sprites', 'views'),
};

// Restore last session
const lastSession = db.getLastSession();
if (lastSession?.draft_json) {
  try {
    state.project = Project.fromJSON(JSON.parse(lastSession.draft_json));
    state.sessionId = lastSession.id;
    // Restore cell groups from SQLite (not stored in draft_json)
    const savedGroups = db.getCellGroups(lastSession.id);
    state.project.groups = GroupManager.fromJSON(savedGroups);
  } catch (e) {
    console.error('Failed to restore last session:', e.message);
  }
}

const WEB_PORT = parseInt(process.env.SPRITE_PORT ?? '3377', 10);
startWebServer(state, WEB_PORT).then((info) => {
  console.error(`Sprite editor: http://localhost:${info.port}`);
  const tsIp = findTailscaleIp();
  if (tsIp) console.error(`Tailscale:     http://${tsIp}:${info.port}`);
}).catch((err) => {
  console.error(`Web server failed: ${err.message}`);
  process.exit(1);
});

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`Received ${signal}, flushing SQLite and exiting...`);
  try { await state.disposeImports?.(); } catch (e) { console.error('Import cleanup error:', e.message); shuttingDown = false; return; }
  try { db.close(); } catch (e) { console.error('DB close error:', e.message); }
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => gracefulShutdown(sig));
}
