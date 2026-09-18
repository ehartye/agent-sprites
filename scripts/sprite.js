#!/usr/bin/env node
// scripts/sprite.js — CLI entry point for agent-sprites
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, existsSync, mkdtempSync, openSync, closeSync, fstatSync, readSync, realpathSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.SPRITE_PORT ?? 3377}`;
const runtimeRoot = realpathSync(join(__dirname, '..'));
const managed = existsSync(join(runtimeRoot, 'managed-install.json'));
const packageVersion = () => JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8')).version;

async function health() {
  let response;
  try {
    response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(500), redirect: 'manual' });
  } catch { return 'offline'; }
  try {
    const body = await response.json();
    if (response.ok && body.ok === true && body.service === 'agent-sprites' && body.protocol === 1) {
      const sameRoot = typeof body.runtimeRoot === 'string' && (process.platform === 'win32'
        ? body.runtimeRoot.toLowerCase() === runtimeRoot.toLowerCase()
        : body.runtimeRoot === runtimeRoot);
      if (managed && (body.version !== packageVersion() || !sameRoot)) return 'mismatch';
      return 'ready';
    }
  } catch { /* A response without the identity is an occupied, incompatible port. */ }
  return 'occupied';
}

function occupiedPortError() {
  return new Error(`${BASE_URL} is occupied by an unrelated or older unidentifiable service. Set SPRITE_PORT to a free port, or stop the old server manually before retrying. No commands were sent to that service.`);
}

function versionMismatchError() {
  return new Error(`${BASE_URL} has a sprite server version or installation mismatch. Run sprite-setup's version sync check. Stop the known old server when safe, or set SPRITE_PORT to an unused port. No commands were sent to that server.`);
}

function startupFailure(reason, logPath) {
  let tail = '';
  let fd;
  try {
    fd = openSync(logPath, 'r');
    const size = fstatSync(fd).size;
    const bytes = Buffer.alloc(Math.min(size, 4096));
    const length = readSync(fd, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
    tail = bytes.subarray(0, length).toString('utf8').trim();
  } catch { /* The log location still helps if a startup race prevents reading it. */ }
  finally { if (fd !== undefined) closeSync(fd); }
  return new Error(`Server failed to start: ${reason}.\nStartup log: ${logPath}${tail ? `\n${tail}` : ''}\nIf the port is occupied, set SPRITE_PORT to a free port or stop the old server manually.`);
}

async function ensureServer() {
  const current = await health();
  if (current === 'ready') return;
  if (current === 'mismatch') throw versionMismatchError();
  if (current === 'occupied') throw occupiedPortError();
  const root = join(__dirname, '..');
  if (!existsSync(join(root, 'node_modules'))) {
    // Fresh marketplace install: the CLI runs on builtins but the server can't.
    throw new Error(`Server dependencies are not installed.\nRun: npm install --prefix "${root}"`);
  }
  const serverPath = join(root, 'server', 'index.js');
  const logPath = join(mkdtempSync(join(tmpdir(), 'agent-sprites-startup-')), 'server.log');
  const logFd = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, [serverPath], {
      detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    });
  } finally { closeSync(logFd); }
  let failure;
  child.once('error', error => { failure = error.message; });
  child.once('exit', (code, signal) => { failure = signal ? `process exited on ${signal}` : `process exited with code ${code}`; });
  child.unref();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
    if (failure) throw startupFailure(failure, logPath);
    const status = await health();
    if (failure) throw startupFailure(failure, logPath);
    if (status === 'ready') return;
    if (status === 'mismatch') throw versionMismatchError();
    if (status === 'occupied') throw occupiedPortError();
  }
  throw startupFailure('timed out waiting for verified service health', logPath);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE_URL}${path}`, opts);
  return r.json();
}

function parseArgs(argv) {
  const args = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      // A flag followed by another flag (or nothing) is a bare boolean:
      // `view --sheet --scale 2` means sheet=true, not sheet='--scale'.
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
        i += 1;
      } else {
        args[key] = next;
        i += 2;
      }
    } else {
      positional.push(argv[i]);
      i++;
    }
  }
  return { args, positional };
}

function num(v) { return v !== undefined ? Number(v) : undefined; }
function bool(v) { return v === 'true' || v === true; }

function parseVarsFlag(s) {
  // Split on commas that precede "<ident>=", so values like "0,0" are preserved.
  // Null-prototype object so keys like __proto__ become own data, not silent no-ops.
  const out = Object.create(null);
  const str = String(s);
  const parts = [];
  const re = /,(?=\w+=)/g;
  let last = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    parts.push(str.slice(last, m.index));
    last = m.index + 1;
  }
  parts.push(str.slice(last));
  for (const kv of parts) {
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    const k = kv.slice(0, eq).trim();
    const v = kv.slice(eq + 1);
    if (!k) continue;
    const n = Number(v);
    out[k] = (v !== '' && !Number.isNaN(n)) ? n : v;
  }
  return out;
}

function substituteVars(value, vars) {
  if (value == null) return value;
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{(\w+)\}\}$/);
    if (whole) {
      if (!(whole[1] in vars)) throw new Error(`variable "${whole[1]}" not defined`);
      return vars[whole[1]];
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (!(k in vars)) throw new Error(`variable "${k}" not defined`);
      return String(vars[k]);
    });
  }
  if (Array.isArray(value)) return value.map(v => substituteVars(v, vars));
  if (typeof value === 'object') {
    const o = {};
    for (const k of Object.keys(value)) o[k] = substituteVars(value[k], vars);
    return o;
  }
  return value;
}

function describeBatchCommand(cmd) {
  switch (cmd.command) {
    case 'new': return `new ${cmd.name}`;
    case 'clone-cell': return `clone-cell ${cmd.from} -> ${Array.isArray(cmd.to) ? cmd.to.join(' ') : cmd.to}`;
    case 'pivot': return `pivot ${cmd.anchor ?? `${cmd.x},${cmd.y}`}`;
    case 'ref': return `ref ${cmd.sub} (${cmd.cell})`;
    case 'save': return 'save';
    case 'export': return 'export';
    case 'shape-group': return `shape-group ${cmd.sub} ${cmd.name}`;
    case 'duplicate': return `duplicate ${cmd.shape}${cmd.mirror ? ` mirror-${cmd.mirror}` : ''} (${cmd.cell})`;
    case 'tween': return `tween ${cmd.shape} across ${cmd.group}`;
    case 'move-group': return `move-group ${cmd.name} (${cmd.cell})`;
    case 'recolor-group': return `recolor-group ${cmd.name} (${cmd.cell})`;
    case 'draw': return `draw ${cmd.type}${cmd.name ? ` -> ${cmd.name}` : ''} (${cmd.cell})`;
    case 'move': return `move ${cmd.shape} (${cmd.cell})`;
    case 'move-to': return `move-to ${cmd.shape} (${cmd.cell})`;
    case 'resize': return `resize ${cmd.shape} (${cmd.cell})`;
    case 'recolor': return `recolor ${cmd.shape} (${cmd.cell})`;
    case 'delete': return `delete ${cmd.shape} (${cmd.cell})`;
    case 'clone': return `clone ${cmd.shape} ${cmd.from} -> ${cmd.to}`;
    case 'flip': return `flip ${cmd.shape} ${cmd.axis} (${cmd.cell})`;
    case 'rotate': return `rotate ${cmd.shape} ${cmd.deg}deg (${cmd.cell})`;
    case 'mirror': return `mirror ${cmd.axis} (${cmd.cell})`;
    case 'rotate-cell': return `rotate-cell ${cmd.deg}deg (${cmd.cell})`;
    case 'copy': return `copy ${cmd.from} -> ${cmd.to}`;
    case 'clear': return `clear (${cmd.cell})`;
    case 'rename': return `rename ${cmd.shape_id} -> ${cmd.name} (${cmd.cell})`;
    case 'name': return `name ${cmd.cell} -> ${cmd.as}`;
    case 'undo': return `undo (${cmd.cell})`;
    case 'redo': return `redo (${cmd.cell})`;
    case 'group': return `group ${cmd.sub} ${cmd.name}`;
    default: return `${cmd.command}`;
  }
}

const HELP_TEXT = `sprite — CLI for agent-sprites (server at ${BASE_URL})

SESSION
  new <name> [--size N | --size WxH] [--rows N --cols N --palette pico8|gameboy|nes|cga|db-16|db-32]
             [--dest <folder>]   parent folder for exports (default: <cwd>/assets/claude-sprites)
  open <path>            open saved project file
  open --session <name|id>  reopen an earlier project from its stored draft
  sessions               list recent projects (id, name, last updated)
  save                   write editable project JSON (drafts already persist automatically)
  export [--dest <folder>]  export gapless sheet PNG + Aseprite JSON atlas (<name>.atlas.json)
                         atlas has frameTags from cell groups, per-group fps durations, pivot slice
  pivot [--x N --y N | --anchor center|top-center|bottom-center|bottom-left|bottom-right]
                         set the sprite pivot/origin exported in the atlas
  status                 show active project info
  restart                graceful shutdown + respawn of sprite server

OFFLINE VERIFICATION (does not start or contact a server)
  build <sprite-project.json> [--json]
                         isolated build of PNG, atlas, editable project and playable preview
  verify <atlas.json> [--expect-tags idle,walk] [--contact-sheet review.png]
                      [--report report.json] [--scale 4] [--json]
                         inspect actual PNG + metadata; nonzero exit on structural failure

DRAWING  (draw <type> --cell R,C --color <hex|name> [--name <shape_name>])
  draw point     --x --y
  draw line      --x1 --y1 --x2 --y2
  draw rect      --x --y --w --h [--filled true]
  draw circle    --cx --cy --r [--filled true]
  draw ellipse   --cx --cy --rx --ry [--filled true]
  draw fill      --x --y                                       flood-fill
  draw polygon   --points "x,y x,y x,y ..." [--filled true]    closed; scanline fill
  draw polyline  --points "x,y x,y ..."                        open stroke
  draw highlight --shape <target> [--direction top-left|top|top-right|left|right|bottom-left|bottom|bottom-right] [--strength N] [--name <base>]
  draw shadow    --shape <target> [--direction ...] [--strength N] [--name <base>]
    highlight/shadow auto-compute lighter/darker color from palette ramps
    and place pixels along the target shape's bounding box edge.
    Requires target color to be in palette ramps (pico8, db-16, db-32).
  draw sphere-shade --shape <target> [--intensity low|med|high|auto] [--name <base>]
    compound 2–5 tier highlight+shadow lighting on a circle/ellipse in one call.
    auto picks by target size (r<=6 low, 7-12 med, >12 high).
  draw arc     --cx --cy (--r | --rx --ry) --from-deg --to-deg --color [--clip-to <mask>] [--name <base>]
    partial ellipse outline (CW, y-down: 0=east, 90=south). emits one point shape per pixel.
  draw ring    --shape <target> --color [--clip-to <mask>] [--name <base>]
    single-target sugar over border — 4-neighbor halo around the target shape.

SHAPES
  shapes      --cell                                list shapes z-ordered
  move    <name> --cell --dx --dy                   relative offset
  move-to <name> --cell --x --y                     absolute (anchor-dependent)
  resize  <name> --cell --updates '{"rx":5,"ry":3}' or --rx --ry --r --w --h
  recolor <name> --cell --color
  clone   <name> --from R,C --to R,C [--as new]
  delete  <name> --cell
  duplicate <name> --cell [--as new] [--mirror horizontal|vertical]   copy in place, e.g. wing_l -> wing_r
  flip    <name> --cell --axis horizontal|vertical [--about self|cell]
  rotate  <name> --cell --deg 90|180|270 [--about self|cell]   CW, y-down

CELLS
  copy  --from R,C --to R,C        clear --cell         name --cell --as <name>
  clone-cell --from R,C --to "R,C R,C ..."  (atomic fan-out; all-or-nothing)
  mirror --cell --axis horizontal|vertical      flip every shape across the cell
  rotate-cell --cell --deg 90|180|270           rotate every shape about cell center
  ref set <image.png> --cell [--opacity 0.35]   attach a tracing reference image
  ref clear --cell                              shown under shapes in view + web UI, never exported
  view  --cell [--png true] [--scale N] [--out f.png]   view --sheet [--scale N] [--out f.png]
  view-anim <group>                undo/redo --cell

TWEEN
  tween <shape> --group <cellgroup> [--to X,Y] [--from X,Y] [--ease linear|in|out|in-out]
                [--to-updates '{"r":1}'] [--from-updates '{"r":4}']
                interpolate a shape's position and/or numeric params across every
                frame of a cell group (draw frame 1, clone-cell fan-out, then tween)

GROUPS (cells)
  group create <name> R,C R,C ... [--fps N]     group add/remove <name> R,C ...
  group delete <name>                 group list
  group fps <name> <N>                set playback fps (exported as frame durations)

SHAPE GROUPS (within a cell)
  shape-group create <name> <shapes...> --cell
  shape-group create <name> --all-cells true --pattern <regex>
                              bulk-group matching shape names across every cell
  shape-group add/remove/delete <name> [--cell]      shape-group list --cell
  move-group    <name> --cell --dx --dy [--all-cells true]
  recolor-group <name> --cell --color [--all-cells true]

BATCH
  batch <path.json>           execute an array of commands; fails fast on first error
                              (stderr: "ERROR at op N/M: <label> — <message>", exit 1)
                              add --continue-on-error true to run all ops and summarize
                              any failed operation exits 1, even when continuing
                              --quiet  summary and artifact paths only
                              --json   one JSON report with counts, failures, session and exports
                              --vars k=v,k2=v2  substitute {{k}} placeholders in ops
                                                (numeric when value parses as a number)
                              --vars-file <json>  array of var dicts; ops replay once per dict

Full reference: skills/sprite-editing/references/tool-reference.md
`;

function emptyBatchReport() {
  return { ok: true, total: 0, attempted: 0, succeeded: 0, failed: 0, errors: [], session: null, artifacts: [], exports: [] };
}

async function run() {
  const cmd = process.argv[2];
  if (cmd === '--version' || cmd === '-v') {
    console.log(packageVersion());
    return;
  }
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP_TEXT);
    return;
  }

  const { args, positional } = parseArgs(process.argv.slice(3));
  if (cmd === 'build') {
    if (!positional[0]) throw new Error('Usage: agent-sprites build <sprite-project.json> [--json]');
    const { buildProject } = await import('../server/build/project-build.js');
    const report = await buildProject(positional[0]);
    if (bool(args.json)) console.log(JSON.stringify(report));
    else {
      console.log(report.ok ? 'Build published' : 'Build failed; previous output preserved');
      for (const item of [...report.errors, ...report.warnings]) console.log(`${item.code}: ${item.message}`);
      for (const [kind, path] of Object.entries(report.artifacts)) console.log(`${kind}: ${path}`);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (cmd === 'verify') {
    if (!positional[0]) throw new Error('Usage: agent-sprites verify <atlas.json> [--expect-tags idle,walk] [--contact-sheet review.png] [--report report.json] [--json]');
    const { verifyAtlasFile } = await import('../server/engine/atlas-verifier.js');
    const report = await verifyAtlasFile(positional[0], {
      expectedTags: args['expect-tags'] ? String(args['expect-tags']).split(',') : [],
      contactPath: args['contact-sheet'], reportPath: args.report, scale: num(args.scale) ?? 4,
    });
    if (bool(args.json)) console.log(JSON.stringify(report));
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'}: ${report.frameCount} atlas frames (structural checks only)`);
      for (const item of [...report.errors, ...report.warnings]) console.log(`${item.code}: ${item.message}`);
      for (const [kind, path] of Object.entries(report.artifacts)) console.log(`${kind}: ${path}`);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }
  try {
    await ensureServer();
  } catch (error) {
    if (cmd === 'batch' && bool(args.json)) {
      const report = emptyBatchReport();
      report.ok = false;
      report.failed = 1;
      report.errors.push({ index: null, command: 'startup', error: error.message });
      console.log(JSON.stringify(report));
    }
    throw error;
  }
  const sub = positional[0];
  const name = positional[1];
  let result;

  switch (cmd) {
    case 'status':
      result = await api('GET', '/api/session/status');
      break;
    case 'restart': {
      try { await api('POST', '/api/control/shutdown'); } catch {}
      const deadline = Date.now() + 3000;
      let stopped = false;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        const status = await health();
        if (status === 'occupied') throw occupiedPortError();
        if (status === 'offline') { stopped = true; break; }
      }
      if (!stopped) throw new Error('Server did not stop after the shutdown request; stop it manually before restarting.');
      await ensureServer();
      console.log('restarted');
      return;
    }
    case 'new': {
      // --size accepts "16" (square) or "16x32" (width x height)
      const sizeMatch = typeof args.size === 'string' ? args.size.match(/^(\d+)x(\d+)$/i) : null;
      result = await api('POST', '/api/session/new', {
        name: sub,
        ...(sizeMatch
          ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
          : { size: num(args.size) }),
        rows: num(args.rows),
        cols: num(args.cols), palette: args.palette,
        cwd: process.cwd(),
        dest: args.dest ? resolve(args.dest) : undefined,
      });
      break;
    }
    case 'open':
      result = args.session
        ? await api('POST', '/api/session/open-session', { ref: args.session })
        : await api('POST', '/api/session/open', { path: sub });
      break;
    case 'cast': {
      if (sub === 'start') {
        const spec = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
        if (args.out) spec.out = resolve(args.out);
        result = await api('POST', '/api/casting', spec);
        if (result.ok) {
          console.log(`casting session ${result.data.id}`);
          console.log(`review at ${BASE_URL}${result.data.url}`);
          return;
        }
      } else if (sub === 'status') {
        result = await api('GET', `/api/casting/${args.id}/verdict`);
        if (result.ok) {
          const v = result.data;
          console.log(`decided ${v.decidedAt} — agreement ${v.agreement.matches}/${v.agreement.total} (${v.agreement.pct}%)`);
          for (const dg of v.agreement.disagreements) console.log(`  ${dg.slot}: predicted ${dg.predicted} -> selected ${dg.selected}`);
          return;
        }
        if (result.error === 'pending') { console.log('pending — selections not saved yet'); return; }
      } else {
        console.error('usage: cast start --file casting.json [--out verdict.json] | cast status --id <id>');
        (process.exitCode = 1);
        return;
      }
      break;
    }
    case 'sessions': {
      result = await api('GET', '/api/session/list');
      if (result.ok) {
        for (const s of result.data) {
          console.log(`${s.id}  ${s.project_name}  ${new Date(s.updated_at).toISOString()}`);
        }
        return;
      }
      break;
    }
    case 'save':
      result = await api('POST', '/api/session/save', {});
      break;
    case 'export':
      result = await api('POST', '/api/session/export', {
        dest: args.dest ? resolve(args.dest) : undefined,
      });
      break;
    case 'pivot':
      result = await api('POST', '/api/session/pivot', { x: num(args.x), y: num(args.y), anchor: args.anchor });
      break;

    case 'draw':
      result = await api('POST', '/api/draw', {
        type: sub, cell: args.cell, color: args.color, shape_name: args.name,
        x: num(args.x), y: num(args.y),
        x1: num(args.x1), y1: num(args.y1), x2: num(args.x2), y2: num(args.y2),
        cx: num(args.cx), cy: num(args.cy),
        r: num(args.r), rx: num(args.rx), ry: num(args.ry),
        w: num(args.w), h: num(args.h),
        points: args.points,
        filled: args.filled !== undefined ? bool(args.filled) : undefined,
        // highlight/shadow params
        shape: args.shape, direction: args.direction,
        strength: num(args.strength),
        count: num(args.count),
        dither: args.dither !== undefined ? bool(args.dither) : undefined,
        span_deg: num(args['span-deg']),
        radius_factor: num(args['radius-factor']),
        intensity: args.intensity,
        from_deg: num(args['from-deg']),
        to_deg: num(args['to-deg']),
        clip_to: args['clip-to'],
        shape_prefix: args['shape-prefix'],
        shapes: args.shapes,
        group: args.group,
        cell_group: args['cell-group'],
      });
      break;

    case 'shapes':
      result = await api('GET', `/api/shapes?cell=${args.cell}`);
      if (result.ok) {
        const lines = result.data.map(s =>
          `  ${s.name ?? s.id}: ${s.type} z=${s.zIndex} color=${s.color}`
        );
        console.log(lines.join('\n'));
        return;
      }
      break;

    case 'rename':
      result = await api('POST', '/api/shape/name', { cell: args.cell, shape_id: sub, name: args.as });
      break;
    case 'move':
      result = await api('POST', '/api/shape/move', { cell: args.cell, name: sub, dx: num(args.dx), dy: num(args.dy) });
      break;
    case 'move-to':
      result = await api('POST', '/api/shape/move-to', { cell: args.cell, shape: sub, x: num(args.x), y: num(args.y) });
      break;
    case 'resize': {
      // Collect individual shape-param flags into an updates object
      const individualFlags = {};
      for (const key of ['r', 'rx', 'ry', 'w', 'h', 'x1', 'y1', 'x2', 'y2']) {
        if (args[key] !== undefined) individualFlags[key] = num(args[key]);
      }
      if (args.filled !== undefined) individualFlags.filled = bool(args.filled);

      // Parse --updates JSON fallback, then merge individual flags on top (individual wins)
      let base = {};
      if (args.updates) {
        try { base = JSON.parse(args.updates); } catch { base = {}; }
      }
      const updates = { ...base, ...individualFlags };

      result = await api('POST', '/api/shape/resize', { cell: args.cell, shape: sub, updates });
      break;
    }
    case 'recolor':
      result = await api('POST', '/api/shape/recolor', { cell: args.cell, name: sub, color: args.color });
      break;
    case 'delete':
      result = await api('POST', '/api/shape/delete', { cell: args.cell, name: sub });
      break;
    case 'clone':
      result = await api('POST', '/api/shape/clone', { from_cell: args.from, to_cell: args.to, shape: sub, new_name: args.as });
      break;
    case 'flip':
      result = await api('POST', '/api/shape/flip', { cell: args.cell, name: sub, axis: args.axis, about: args.about });
      break;
    case 'duplicate':
      result = await api('POST', '/api/shape/duplicate', { cell: args.cell, shape: sub, as: args.as, mirror: args.mirror });
      break;
    case 'rotate':
      result = await api('POST', '/api/shape/rotate', { cell: args.cell, name: sub, deg: num(args.deg), about: args.about });
      break;

    case 'copy':
      result = await api('POST', '/api/cell/copy', { from: args.from, to: args.to });
      break;
    case 'clone-cell': {
      const to = args.to?.split(/\s+/).filter(Boolean) ?? [];
      result = await api('POST', '/api/cell/clone-fanout', { from: args.from, to });
      break;
    }
    case 'clear':
      result = await api('POST', '/api/cell/clear', { cell: args.cell });
      break;
    case 'mirror':
      result = await api('POST', '/api/cell/mirror', { cell: args.cell, axis: args.axis });
      break;
    case 'ref': {
      if (sub === 'set') {
        const refPath = positional[1];
        if (!refPath) { console.error('Usage: ref set <image.png> --cell R,C [--opacity 0.35]'); process.exitCode = 1; return; }
        result = await api('POST', '/api/cell/reference', {
          cell: args.cell, path: resolve(refPath), opacity: num(args.opacity),
        });
      } else if (sub === 'clear') {
        result = await api('POST', '/api/cell/reference', { cell: args.cell, path: null });
      } else {
        console.error('Usage: ref set <image.png> --cell R,C [--opacity 0.35] | ref clear --cell R,C');
        process.exitCode = 1;
        return;
      }
      break;
    }
    case 'rotate-cell':
      result = await api('POST', '/api/cell/rotate', { cell: args.cell, deg: num(args.deg) });
      break;
    case 'name':
      result = await api('POST', '/api/cell/name', { cell: args.cell, name: args.as });
      break;
    case 'view': {
      const out = args.out ? resolve(args.out) : undefined;
      if (bool(args.sheet)) {
        result = await api('POST', '/api/view/sheet', { scale: num(args.scale), out });
        break;
      }
      const format = (args.png || args.out) ? 'png' : 'terminal';
      result = await api('POST', '/api/cell/view', { cell: args.cell, format, scale: num(args.scale), out });
      if (result.ok && result.data?.terminal) {
        console.log(result.data.terminal);
        return;
      }
      break;
    }
    case 'undo':
      result = await api('POST', '/api/cell/undo', { cell: args.cell });
      break;
    case 'redo':
      result = await api('POST', '/api/cell/redo', { cell: args.cell });
      break;

    case 'group':
      switch (sub) {
        case 'create': result = await api('POST', '/api/group/cell/create', { name: name, cells: args.cells?.split(' ') ?? positional.slice(2), fps: num(args.fps) }); break;
        case 'fps':    result = await api('POST', '/api/group/cell/fps', { name: name, fps: num(positional[2]) }); break;
        case 'list':   result = await api('GET', '/api/group/cell/list'); break;
        case 'add':    result = await api('POST', '/api/group/cell/add', { name: name, cells: args.cells?.split(' ') ?? positional.slice(2) }); break;
        case 'remove': result = await api('POST', '/api/group/cell/remove', { name: name, cells: args.cells?.split(' ') ?? positional.slice(2) }); break;
        case 'delete': result = await api('POST', '/api/group/cell/delete', { name: name }); break;
      }
      break;

    case 'shape-group':
      switch (sub) {
        case 'create': result = await api('POST', '/api/group/shape/create', {
          cell: args.cell, name: name,
          shapes: args.shapes?.split(' ') ?? positional.slice(2),
          all_cells: bool(args['all-cells']) || undefined,
          pattern: args.pattern,
        }); break;
        case 'list':   result = await api('GET', `/api/group/shape/list?cell=${args.cell}`); break;
        case 'add':    result = await api('POST', '/api/group/shape/add', { cell: args.cell, name: name, shapes: args.shapes?.split(' ') ?? positional.slice(2) }); break;
        case 'remove': result = await api('POST', '/api/group/shape/remove', { cell: args.cell, name: name, shapes: args.shapes?.split(' ') ?? positional.slice(2) }); break;
        case 'delete': result = await api('POST', '/api/group/shape/delete', { cell: args.cell, name: name }); break;
      }
      break;

    case 'move-group':
      result = await api('POST', '/api/group/shape/move', {
        name: sub, cell: args.cell, all_cells: bool(args['all-cells']),
        dx: num(args.dx), dy: num(args.dy),
      });
      break;

    case 'recolor-group':
      result = await api('POST', '/api/group/shape/recolor', {
        name: sub, cell: args.cell, all_cells: bool(args['all-cells']), color: args.color,
      });
      break;

    case 'tween': {
      const shapeName = sub;
      const groupName = args.group;
      if (!shapeName || !groupName) {
        console.error('Usage: tween <shape> --group <cellgroup> [--to X,Y] [--from X,Y] [--to-updates JSON] [--from-updates JSON] [--ease linear|in|out|in-out]');
        process.exitCode = 1;
        return;
      }
      const parseXY = (s) => {
        const m = String(s).match(/^(-?\d+),(-?\d+)$/);
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
      };
      const to = args.to ? parseXY(args.to) : null;
      if (args.to && !to) { console.error('--to must be "X,Y"'); process.exitCode = 1; return; }
      const from = args.from ? parseXY(args.from) : null;
      if (args.from && !from) { console.error('--from must be "X,Y"'); process.exitCode = 1; return; }
      let toUpdates = null, fromUpdates = null;
      try { if (args['to-updates']) toUpdates = JSON.parse(args['to-updates']); }
      catch { console.error('--to-updates must be a JSON object'); process.exitCode = 1; return; }
      try { if (args['from-updates']) fromUpdates = JSON.parse(args['from-updates']); }
      catch { console.error('--from-updates must be a JSON object'); process.exitCode = 1; return; }

      result = await api('POST', '/api/shape/tween', {
        group: groupName, shape: shapeName,
        to, from, to_updates: toUpdates, from_updates: fromUpdates,
        ease: args.ease,
      });
      if (result.ok) {
        console.log(`Tweened "${shapeName}" across ${result.data.frames} frames of "${groupName}"`);
        return;
      }
      break;
    }

    case 'view-anim': {
      const groupName = sub;
      const groupResult = await api('GET', '/api/group/cell/list');
      if (!groupResult.ok) { console.error(groupResult.error); process.exitCode = 1; return; }
      const cellRefs = groupResult.data[groupName];
      if (!cellRefs || cellRefs.length === 0) {
        console.error(`Group "${groupName}" not found or empty`);
        process.exitCode = 1;
        return;
      }

      const frames = [];
      for (const cellRef of cellRefs) {
        const viewResult = await api('POST', '/api/cell/view', { cell: cellRef, format: 'terminal' });
        if (!viewResult.ok) { console.error(viewResult.error); process.exitCode = 1; return; }
        frames.push(viewResult.data.terminal);
      }

      const fps = num(args.fps) ?? 8;
      const loops = num(args.loops) ?? 3;
      const totalFrames = frames.length;
      const delay = Math.round(1000 / fps);

      let loopsPlayed = 0;
      while (loops === 0 || loopsPlayed < loops) {
        for (let i = 0; i < totalFrames; i++) {
          if (loopsPlayed > 0 || i > 0) {
            process.stdout.write('\x1b[H\x1b[2J');
          }
          process.stdout.write(frames[i]);
          process.stdout.write(`\nFrame ${i + 1}/${totalFrames} — ${groupName} @ ${fps}fps\n`);
          await new Promise(r => setTimeout(r, delay));
        }
        loopsPlayed++;
      }
      return;
    }

    case 'batch': {
      const { mapCommandToApi } = await import('./batch-commands.js');
      const continueOnError = bool(args['continue-on-error']);
      const json = bool(args.json);
      const quiet = json || bool(args.quiet);
      const report = emptyBatchReport();
      const fail = (index, command, error) => {
        report.ok = false;
        report.failed++;
        report.errors.push({ index, command, error: error.message });
        process.exitCode = 1;
        console.error(`ERROR at op ${index ?? 0}/${report.total}: ${command} — ${error.message}`);
      };
      try {
        const inlineVars = args.vars ? parseVarsFlag(args.vars) : null;
        let frames = null;
        if (args['vars-file']) {
          const framesJson = JSON.parse(readFileSync(args['vars-file'], 'utf-8'));
          if (!Array.isArray(framesJson)) {
            throw new Error('--vars-file must contain a JSON array of variable dicts');
          }
          frames = framesJson;
        }
        let commands;

        if (args.stdin) {
          const data = await new Promise((resolve, reject) => {
            const chunks = [];
            process.stdin.on('data', chunk => chunks.push(chunk));
            process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            process.stdin.on('error', reject);
          });
          commands = JSON.parse(data);
        } else {
          const filePath = sub;
          if (!filePath) throw new Error('Usage: agent-sprites batch <file.json> or agent-sprites batch --stdin');
          commands = JSON.parse(readFileSync(filePath, 'utf-8'));
        }

        if (!Array.isArray(commands)) throw new Error('Batch input must be a JSON array');

        const runs = frames ?? [inlineVars];
        const total = commands.length * runs.length;
        report.total = total;

        runsLoop:
        for (const frameVars of runs) {
          for (let i = 0; i < commands.length; i++) {
            const opIndex = ++report.attempted;
            let cmd = commands[i];
            let label = cmd && typeof cmd === 'object' ? describeBatchCommand(cmd) : 'invalid operation';
            try {
              if (frameVars) cmd = substituteVars(cmd, frameVars);
              if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) throw new Error('Batch operation must be an object');
              label = describeBatchCommand(cmd);
              const { method, path, body } = mapCommandToApi(cmd);
              const res = await api(method, path, body);
              if (!res.ok) throw new Error(res.error);
              if (!quiet) console.log(`[${opIndex}/${total}] ${label} -> ok`);
              report.succeeded++;
              if (res.artifacts) report.artifacts.push(...res.artifacts);
              if (res.export) report.exports.push(res.export);
            } catch (e) {
              if (!quiet) console.log(`[${opIndex}/${total}] ${label} -> ERROR: ${e.message}`);
              fail(opIndex, label, e);
              if (!continueOnError) break runsLoop;
            }
          }
        }
      } catch (e) {
        fail(null, 'batch input', e);
      }
      // A report describes this server's active project, never another server's
      // most recently updated SQLite session. Preserve the batch failure if the
      // server became unavailable before we could retrieve this extra context.
      try {
        const status = await api('GET', '/api/session/status');
        if (status.ok) report.session = status.data;
      } catch { /* operation errors above remain authoritative */ }
      if (json) console.log(JSON.stringify(report));
      else {
        console.log(`Done: ${report.succeeded}/${report.total} succeeded${report.failed ? `, ${report.failed} failed` : ''}`);
        for (const artifact of report.artifacts) console.log(`${artifact.type}: ${artifact.path}`);
      }
      return;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      (process.exitCode = 1);
  }

  if (result) {
    if (result.ok) console.log(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    else { console.error(result.error); (process.exitCode = 1); }
  }
}

run().catch(e => { console.error(e.message); (process.exitCode = 1); });
