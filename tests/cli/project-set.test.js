import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync, lstatSync, symlinkSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildProject } from '../../server/build/project-build.js';
import { buildProjectSet as buildSet } from '../../server/build/project-set.js';

const exec = promisify(execFile);
let dir, list, a, b;
function snapshotTree(root) {
  return readdirSync(root).sort().flatMap(name => {
    const path = join(root, name), stat = lstatSync(path, { bigint: true });
    return [{ path, size: stat.size, mtime: stat.mtimeNs, bytes: stat.isFile() ? readFileSync(path).toString('hex') : null }, ...(stat.isDirectory() ? snapshotTree(path) : [])];
  });
}
function recordedBytes(output, names) {
  return Object.fromEntries(names.map(file => {
    const bytes = readFileSync(join(output, file));
    return [file, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  }));
}
function project(id, config = {}) {
  const root = join(dir, id); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'ops.json'), JSON.stringify([
    { command: 'new', name: id, size: 8, rows: 1, cols: 1 },
    { command: 'draw', type: 'point', cell: '0,0', name: 'dot', x: 2, y: 2, color: '#ffffff' },
  ]));
  const path = join(root, 'sprite-project.json');
  writeFileSync(path, JSON.stringify({ version: 1, ops: 'ops.json', output: '../../out/' + id, scale: 1, ...config }));
  return path;
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-set-'));
  // Keep both sources and outputs inside the disposable fixture.
  dir = join(dir, 'src'); mkdirSync(dir);
  a = project('a'); b = project('b'); list = join(dir, 'sprite-projects.json');
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json', 'b/sprite-project.json'] }));
});
afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }));

// Two real native builds took 8.06s on hosted Windows, beyond the default 5s budget.
test('builds every listed project in order and then reports both as current', async () => {
  const built = await buildSet(list);
  expect(built).toMatchObject({ ok: true, total: 2, attempted: 2, succeeded: 2, failed: 0 });
  expect(built.projects.map(p => p.status)).toEqual(['built', 'built']);
  const before = snapshotTree(join(dir, '..'));
  const checked = await buildSet(list, { check: true });
  expect(checked).toMatchObject({ ok: true, mode: 'check', attempted: 0, stale: 0 });
  expect(checked.projects.map(p => p.status)).toEqual(['current', 'current']);
  expect(snapshotTree(join(dir, '..'))).toEqual(before);
  expect((await buildSet(list, { check: true })).ok).toBe(true);
  expect(snapshotTree(join(dir, '..'))).toEqual(before);
}, 15000);

test('same-size changes to finalized artifacts cannot be certified as current', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a);
  expect(built.ok).toBe(true);
  expect((await buildSet(list, { check: true })).ok).toBe(true);
  for (const key of ['sheet', 'atlas', 'verification', 'project', 'operations', 'preview']) {
    const path = built.artifacts[key], before = readFileSync(path), changed = Buffer.from(before);
    // JSON stays parseable when its final newline becomes a space; the PNG change corrupts bytes without changing length.
    changed[changed.length - 1] = key === 'sheet' ? changed[changed.length - 1] ^ 1 : changed[changed.length - 1] === 10 ? 32 : changed[changed.length - 1] ^ 1;
    writeFileSync(path, changed);
    const snapshot = snapshotTree(join(dir, '..'));
    const checked = await buildSet(list, { check: true });
    expect(checked.ok, key).toBe(false);
    expect(checked.projects[0].reasons, key).toContainEqual(expect.objectContaining({ code: 'output-changed', file: path.split(/[\\/]/).at(-1) }));
    expect(snapshotTree(join(dir, '..')), key).toEqual(snapshot);
    writeFileSync(path, before);
  }
});

test('legacy outputs without integrity are explicitly uncertified', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a), manifest = JSON.parse(readFileSync(built.artifacts.manifest, 'utf8'));
  delete manifest.integrity;
  writeFileSync(built.artifacts.manifest, JSON.stringify(manifest));
  const before = snapshotTree(join(dir, '..'));
  const checked = await buildSet(list, { check: true });
  expect(checked.ok).toBe(false);
  expect(checked.projects[0].reasons.map(reason => reason.code)).toContain('output-integrity-missing');
  expect(snapshotTree(join(dir, '..'))).toEqual(before);
});

test('check refuses malformed, incomplete and undeclared integrity records', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a), original = JSON.parse(readFileSync(built.artifacts.manifest, 'utf8'));
  const output = join(dir, '..', 'out', 'a'), file = original.files.sheet;
  // Handcrafted byte records let each refusal control reach its intended defect even on the presence-only predecessor.
  original.integrity = recordedBytes(output, [...Object.values(original.files), '.agent-sprites-build.json']);
  const cases = [
    ['null map', manifest => { manifest.integrity = null; }],
    ['array map', manifest => { manifest.integrity = []; }],
    ['missing artifact', manifest => { delete manifest.integrity[file]; }],
    ['missing marker', manifest => { delete manifest.integrity['.agent-sprites-build.json']; }],
    ['extra artifact', manifest => { manifest.integrity['unlisted.txt'] = manifest.integrity[file]; }],
    ['self certificate', manifest => { manifest.integrity['sprite-manifest.json'] = manifest.integrity[file]; }],
    ['null record', manifest => { manifest.integrity[file] = null; }],
    ['missing digest', manifest => { delete manifest.integrity[file].sha256; }],
    ['short digest', manifest => { manifest.integrity[file].sha256 = '1234'; }],
    ['uppercase digest', manifest => { manifest.integrity[file].sha256 = 'A'.repeat(64); }],
    ['missing size', manifest => { delete manifest.integrity[file].bytes; }],
    ['string size', manifest => { manifest.integrity[file].bytes = String(manifest.integrity[file].bytes); }],
    ['negative size', manifest => { manifest.integrity[file].bytes = -1; }],
    ['fractional size', manifest => { manifest.integrity[file].bytes = 1.5; }],
    ['unsafe size', manifest => { manifest.integrity[file].bytes = Number.MAX_SAFE_INTEGER + 1; }],
    ['duplicate file name', manifest => { manifest.files.atlas = manifest.files.sheet; }],
    ['removed file role', manifest => { delete manifest.files.preview; }],
    ['unlisted finalized file', manifest => { delete manifest.files.preview; delete manifest.integrity['preview.html']; }],
  ];
  for (const [name, mutate] of cases) {
    const manifest = structuredClone(original); mutate(manifest);
    writeFileSync(built.artifacts.manifest, JSON.stringify(manifest));
    const before = snapshotTree(join(dir, '..'));
    const checked = await buildSet(list, { check: true });
    expect(checked.ok, name).toBe(false);
    expect(checked.projects[0].reasons.map(reason => reason.code), name).toContain('manifest-invalid');
    expect(snapshotTree(join(dir, '..')), name).toEqual(before);
  }
});

test('check refuses unsafe portable artifact names without reading outside output', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a), original = JSON.parse(readFileSync(built.artifacts.manifest, 'utf8'));
  const output = join(dir, '..', 'out', 'a');
  original.integrity = recordedBytes(output, [...Object.values(original.files), '.agent-sprites-build.json']);
  for (const file of ['../outside.png', '..\\outside.png', '/outside.png', 'C:outside.png', '', '.', '..', 'nested/art.png', 'bad\0.png', 'bad?.png', 'trailing.', 'trailing ', 'CON.png', 'sprite-manifest.json', '.agent-sprites-build.json']) {
    const manifest = structuredClone(original), record = manifest.integrity[manifest.files.sheet];
    delete manifest.integrity[manifest.files.sheet]; manifest.files.sheet = file; manifest.integrity[file] = record;
    writeFileSync(built.artifacts.manifest, JSON.stringify(manifest));
    const before = snapshotTree(join(dir, '..'));
    const checked = await buildSet(list, { check: true });
    expect(checked.ok, file).toBe(false);
    expect(checked.projects[0].reasons.map(reason => reason.code), file).toContain('manifest-invalid');
    expect(snapshotTree(join(dir, '..')), file).toEqual(before);
  }
});

test('a declared output directory link cannot certify another directory', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  expect((await buildProject(a)).ok).toBe(true);
  const output = join(dir, '..', 'out', 'a'), target = join(dir, '..', 'retained-output');
  renameSync(output, target);
  try {
    symlinkSync(target, output, process.platform === 'win32' ? 'junction' : 'dir');
    const before = snapshotTree(target);
    expect((await buildSet(list, { check: true })).ok).toBe(false);
    expect(snapshotTree(target)).toEqual(before);
  } finally {
    if (existsSync(output) && lstatSync(output).isSymbolicLink()) rmSync(output, { recursive: true, force: true });
    renameSync(target, output);
  }
});

test('check refuses an unlisted output file and detects changed valid digest or size records', async () => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a), original = JSON.parse(readFileSync(built.artifacts.manifest, 'utf8'));
  const output = join(dir, '..', 'out', 'a'), file = original.files.sheet;
  original.integrity = recordedBytes(output, [...Object.values(original.files), '.agent-sprites-build.json']);
  for (const field of ['bytes', 'sha256']) {
    const manifest = structuredClone(original);
    manifest.integrity[file][field] = field === 'bytes' ? manifest.integrity[file].bytes + 1 : '0'.repeat(64);
    writeFileSync(built.artifacts.manifest, JSON.stringify(manifest));
    const checked = await buildSet(list, { check: true });
    expect(checked.ok, field).toBe(false);
    expect(checked.projects[0].reasons, field).toContainEqual(expect.objectContaining({ code: 'output-changed', file }));
  }
  writeFileSync(built.artifacts.manifest, JSON.stringify(original));
  writeFileSync(join(output, 'unlisted.txt'), 'foreign bytes');
  const before = snapshotTree(join(dir, '..'));
  const checked = await buildSet(list, { check: true });
  expect(checked.ok).toBe(false);
  expect(checked.projects[0].reasons.map(reason => reason.code)).toContain('manifest-invalid');
  expect(snapshotTree(join(dir, '..'))).toEqual(before);
});

test('check refuses byte-identical linked artifacts, marker and manifest', async ({ skip }) => {
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  const built = await buildProject(a), output = join(dir, '..', 'out', 'a');
  for (const path of [built.artifacts.sheet, join(output, '.agent-sprites-build.json'), built.artifacts.manifest]) {
    const bytes = readFileSync(path), target = join(dir, 'linked-target');
    writeFileSync(target, bytes); rmSync(path);
    try {
      try {
        symlinkSync(target, path, 'file');
      } catch (error) {
        if (['EPERM', 'ENOSYS', 'ENOTSUP'].includes(error.code)) return skip(`File symlinks unavailable: ${error.code}`);
        throw error;
      }
      const checked = await buildSet(list, { check: true });
      expect(checked.ok, path).toBe(false);
      expect(checked.projects[0].reasons.map(reason => reason.code), path).toContain('manifest-invalid');
    } finally { rmSync(path, { force: true }); writeFileSync(path, bytes); }
  }
});

test('check reports unbuilt projects without creating outputs or executing generators', async () => {
  writeFileSync(join(dir, 'a', 'generate.mjs'), "import {writeFileSync} from 'node:fs'; writeFileSync('ran.txt','yes'); throw Error('must not run');");
  writeFileSync(a, JSON.stringify({ version: 1, generator: 'generate.mjs', output: '../../out/a' }));
  const report = await buildSet(list, { check: true });
  expect(report).toMatchObject({ ok: false, attempted: 0, stale: 2 });
  expect(report.projects[0].reasons.map(r => r.code)).toContain('unbuilt');
  expect(existsSync(join(dir, 'a', 'ran.txt'))).toBe(false);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test('check distinguishes changed source, old tool version and legacy provenance', async () => {
  await buildProject(a); const built = await buildProject(b);
  writeFileSync(join(dir, 'a', 'ops.json'), '[]');
  const path = built.artifacts.manifest, manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.build.tool.version = '0.1.0'; writeFileSync(path, JSON.stringify(manifest));
  const report = await buildSet(list, { check: true });
  expect(report.stale).toBe(2);
  expect(report.projects[0].reasons.map(r => r.code)).toContain('input-changed');
  expect(report.projects[1].reasons.map(r => r.code)).toContain('tool-version');
  delete manifest.build; writeFileSync(path, JSON.stringify(manifest));
  expect((await buildSet(list, { check: true })).projects[1].reasons.map(r => r.code)).toContain('provenance-missing');
});

test('declared external inputs and missing output artifacts require a rebuild', async () => {
  writeFileSync(join(dir, 'palette.json'), 'old');
  project('a', { inputs: ['../palette.json'] });
  const built = await buildSet(list); expect(built.ok).toBe(true);
  writeFileSync(join(dir, 'palette.json'), 'new');
  rmSync(built.projects[1].artifacts.sheet);
  const checked = await buildSet(list, { check: true });
  expect(checked.projects[0].reasons).toContainEqual(expect.objectContaining({ code: 'input-changed', input: '../palette.json' }));
  expect(checked.projects[1].reasons.map(r => r.code)).toContain('output-missing');
  rmSync(join(dir, 'palette.json'));
  expect((await buildSet(list, { check: true })).projects[0].status).toBe('invalid');
});

test('a failed project stops the set, preserving its previous output and skipping later projects', async () => {
  const prior = await buildProject(a), bytes = readFileSync(prior.artifacts.sheet);
  writeFileSync(join(dir, 'a', 'ops.json'), '[]');
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 1, succeeded: 0, failed: 1 });
  expect(report.projects.map(p => p.status)).toEqual(['failed', 'skipped']);
  expect(readFileSync(prior.artifacts.sheet).equals(bytes)).toBe(true);
  expect(existsSync(join(dir, '..', 'out', 'b'))).toBe(false);
});

test.each([
  { version: 1, projects: [] },
  { version: 2, projects: ['a/sprite-project.json'] },
  { version: 1, projects: ['a/sprite-project.json', 'a/../a/sprite-project.json'] },
  { version: 1, projects: ['a/sprite-project.json', 42] },
  { version: 1, projects: ['a/sprite-project.json', 'missing.json'] },
])('invalid project lists fail before any build: %j', async manifest => {
  writeFileSync(list, JSON.stringify(manifest));
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 0 });
  expect(report.errors.length).toBeGreaterThan(0);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test.each(['../../out/a', '../../out/a/nested', '../a'])('overlapping outputs or source directories fail before publication: %s', async output => {
  project('b', { output });
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 0 });
  expect(report.errors.length).toBeGreaterThan(0);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test('relative provenance survives relocating the full project tree', async () => {
  expect((await buildSet(list)).ok).toBe(true);
  const moved = join(tmpdir(), 'sprite-set-moved-' + Date.now());
  try {
    cpSync(join(dir, '..'), moved, { recursive: true });
    expect((await buildSet(join(moved, 'src', 'sprite-projects.json'), { check: true })).ok).toBe(true);
  } finally { rmSync(moved, { recursive: true, force: true }); }
});

test('check identifies malformed mixed source declarations as invalid', async () => {
  project('a', { character: null });
  const report = await buildSet(list, { check: true });
  expect(report.projects[0].status).toBe('invalid');
  expect(report.projects[0].reasons[0].message).toContain('exactly one');
});

test('check rejects a manifest that omits a required artifact entry', async () => {
  const built = await buildSet(list);
  const path = built.projects[0].artifacts.manifest, manifest = JSON.parse(readFileSync(path, 'utf8'));
  delete manifest.files.sheet; writeFileSync(path, JSON.stringify(manifest));
  const report = await buildSet(list, { check: true });
  expect(report.projects[0].status).toBe('stale');
  expect(report.projects[0].reasons.map(reason => reason.code)).toContain('manifest-invalid');
});

test('CLI JSON checks fail on stale sets, then build and check succeed without a sprite server', async () => {
  const cli = fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  const options = { cwd: dir, env: { ...process.env, SPRITE_PORT: '1' } };
  try {
    await exec(process.execPath, [cli, 'build-set', list, '--check', '--json'], options);
    throw Error('Expected stale exit status');
  } catch (error) {
    expect(error.code).toBe(1);
    expect(JSON.parse(error.stdout)).toMatchObject({ ok: false, stale: 2 });
  }
  const built = JSON.parse((await exec(process.execPath, [cli, 'build-set', list, '--json'], options)).stdout);
  expect(built).toMatchObject({ ok: true, succeeded: 2 });
  expect(JSON.parse((await exec(process.execPath, [cli, 'build-set', list, '--check', '--json'], options)).stdout).ok).toBe(true);
}, 20000);

test('check names a mistyped tileset row by file and line before any rebuild', async () => {
  const root = join(dir, 'tiles'); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'a.pxl'), '@palette\ng #6b7d3a\n@tile one\n' + ['ggg', 'gggg', 'gggg', 'gggg'].join('\n') + '\n');
  writeFileSync(join(root, 'sprite-project.json'), JSON.stringify({ version: 1, output: '../../out/tiles', scale: 1, tileset: { name: 'tiles', cell: 4, sources: ['a.pxl'] } }));
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['tiles/sprite-project.json'] }));
  const report = await buildSet(list, { check: true });
  expect(report).toMatchObject({ ok: false, stale: 1 });
  expect(report.projects[0]).toMatchObject({ status: 'invalid' });
  expect(report.projects[0].reasons[0]).toMatchObject({ code: 'source-invalid', file: 'a.pxl', line: 4 });
  expect(report.projects[0].reasons[0].message).toContain('expected 4');
});

test('build --check exits nonzero on a short row and zero on a clean set', async () => {
  const cli = fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  const root = join(dir, 'tiles'); mkdirSync(root, { recursive: true });
  const config = join(root, 'sprite-project.json');
  writeFileSync(config, JSON.stringify({ version: 1, output: '../../out/tiles', scale: 1, tileset: { name: 'tiles', cell: 4, sources: ['a.pxl'] } }));
  writeFileSync(join(root, 'a.pxl'), '@palette\ng #6b7d3a\n@tile one\ngggg\nggg\ngggg\ngggg\n');
  await expect(exec(process.execPath, [cli, 'build', config, '--check'])).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('a.pxl:5') });
  writeFileSync(join(root, 'a.pxl'), '@palette\ng #6b7d3a\n@tile one\ngggg\ngggg\ngggg\ngggg\n');
  const ok = await exec(process.execPath, [cli, 'build', config, '--check', '--json']);
  expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, tiles: 1 });
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

// Real producer copies keep causal mutations outside the checkout and managed releases.
// Dependencies are reused through a test-owned link; no install or native metadata mutation.
function copiedProducer() {
  const runtime = join(dir, '..', 'producer'); mkdirSync(runtime);
  const original = fileURLToPath(new URL('../../', import.meta.url));
  for (const name of ['package.json', 'package-lock.json', 'scripts', 'server']) cpSync(join(original, name), join(runtime, name), { recursive: true });
  symlinkSync(join(original, 'node_modules'), join(runtime, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const helper = join(runtime, 'server', 'engine', 'canvas-renderer.js');
  const priorHelper = readFileSync(helper);
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json'] }));
  return { runtime, helper, priorHelper };
}
async function copiedCLI(runtime, ...args) {
  const options = { cwd: dir, windowsHide: true, env: { ...process.env, SPRITE_PORT: '1' } };
  const result = await exec(process.execPath, [join(runtime, 'scripts', 'sprite.js'), ...args, '--json'], options).then(result => ({ ...result, code: 0 }), error => error);
  return { code: result.code, report: JSON.parse(result.stdout) };
}

test('same-version actual producer source changes refuse freshness without touching outputs or running generators', async () => {
  const { runtime, helper, priorHelper } = copiedProducer();
  const counter = join(dir, '..', 'generator-runs.txt');
  writeFileSync(join(dir, 'a', 'generate.mjs'), `import {readFileSync,writeFileSync} from 'node:fs';
    const counter=${JSON.stringify(counter)};
    writeFileSync(counter,String(Number(readFileSync(counter,'utf8'))+1));
    console.log(JSON.stringify(${readFileSync(join(dir, 'a', 'ops.json'), 'utf8')}));`);
  writeFileSync(counter, '0');
  project('a', { ops: undefined, generator: 'generate.mjs' });
  expect((await copiedCLI(runtime, 'build', a)).report.ok).toBe(true);
  expect((await copiedCLI(runtime, 'build-set', list, '--check')).report.ok).toBe(true);
  writeFileSync(join(dir, '..', 'out', 'foreign.txt'), 'retained foreign sibling');
  const before = snapshotTree(join(dir, '..', 'out'));
  const sourcesBefore = snapshotTree(dir);
  const version = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')).version;
  writeFileSync(helper, Buffer.concat([priorHelper, Buffer.from('\n// same-version fixture mutation\n')]));
  const changed = await copiedCLI(runtime, 'build-set', list, '--check');
  expect(changed.code).toBe(1);
  expect(changed.report.projects[0].reasons.map(reason => reason.code)).toContain('tool-source-changed');
  expect(snapshotTree(join(dir, '..', 'out'))).toEqual(before);
  expect(snapshotTree(dir)).toEqual(sourcesBefore);
  expect(readFileSync(counter, 'utf8')).toBe('1');
  expect(JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')).version).toBe(version);
  writeFileSync(helper, priorHelper);
  expect((await copiedCLI(runtime, 'build-set', list, '--check')).report.ok).toBe(true);
  expect(snapshotTree(join(dir, '..', 'out'))).toEqual(before);
  expect(snapshotTree(dir)).toEqual(sourcesBefore);
}, 30000);

test('actual producer mutation during generation fails before replacement and releases staging and lock', async () => {
  const { runtime, helper } = copiedProducer();
  expect((await copiedCLI(runtime, 'build', a)).report.ok).toBe(true);
  const before = snapshotTree(join(dir, '..', 'out'));
  const output = join(dir, '..', 'out', 'a');
  writeFileSync(join(dir, 'a', 'generate.mjs'), `import {appendFileSync} from 'node:fs';
    appendFileSync(${JSON.stringify(helper)},'\\n// generator tool mutation\\n');
    console.log(JSON.stringify(${readFileSync(join(dir, 'a', 'ops.json'), 'utf8')}));`);
  project('a', { ops: undefined, generator: 'generate.mjs' });
  const failed = await copiedCLI(runtime, 'build', a);
  expect(failed.report.ok).toBe(false);
  expect(JSON.stringify(failed.report.errors)).toMatch(/tool.*changed during generation/i);
  expect(snapshotTree(output)).toEqual(before.filter(entry => entry.path.startsWith(output + (process.platform === 'win32' ? '\\' : '/'))));
  expect(readdirSync(join(dir, '..', 'out'))).toEqual(['a']);
}, 30000);

test('long-lived producer refuses changed loaded source and a fresh process records the new identity', async () => {
  const { runtime, helper } = copiedProducer();
  const script = join(dir, '..', 'long-lived.mjs');
  writeFileSync(script, `import {appendFileSync,readFileSync} from 'node:fs';
    const {buildProject}=await import(${JSON.stringify(pathToFileURL(join(runtime, 'server', 'build', 'project-build.js')).href)});
    const first=await buildProject(${JSON.stringify(a)});
    const before=readFileSync(first.artifacts.manifest,'utf8');
    appendFileSync(${JSON.stringify(helper)},'\\n// after module load\\n');
    const second=await buildProject(${JSON.stringify(a)});
    console.log(JSON.stringify({first,second,preserved:before===readFileSync(first.artifacts.manifest,'utf8')}));`);
  const result = JSON.parse((await exec(process.execPath, [script], { windowsHide: true })).stdout);
  expect(result.first.ok).toBe(true);
  expect(result.second.ok).toBe(false);
  expect(JSON.stringify(result.second.errors)).toMatch(/restart.*required/i);
  expect(result.preserved).toBe(true);
  const old = JSON.parse(readFileSync(result.first.artifacts.manifest, 'utf8'));
  expect((await copiedCLI(runtime, 'build', a)).report.ok).toBe(true);
  const current = JSON.parse(readFileSync(result.first.artifacts.manifest, 'utf8'));
  expect(current.build.tool.identity.source.sha256).not.toBe(old.build.tool.identity.source.sha256);
  expect(readFileSync(result.first.artifacts.sheet).length).toBe(old.integrity[old.files.sheet].bytes);
  expect(current.integrity[current.files.sheet]).toEqual(old.integrity[old.files.sheet]);
}, 30000);

test('check fences an actual producer source change between identity acquisition and manifest inspection', async () => {
  const { runtime, helper } = copiedProducer();
  expect((await copiedCLI(runtime, 'build', a)).report.ok).toBe(true);
  const before = snapshotTree(join(dir, '..', 'out'));
  const preload = join(dir, '..', 'mutate-at-manifest.mjs');
  // Test-owned filesystem observation, rather than a production injection seam.
  writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const original=fs.readFileSync; let changed=false;
    fs.readFileSync=function(path,...args){
      if(!changed&&String(path).endsWith('sprite-manifest.json')){
        changed=true;fs.appendFileSync(${JSON.stringify(helper)},'\\n// check tool mutation\\n');
      }
      return original.call(this,path,...args);
    };syncBuiltinESMExports();`);
  const run = await exec(process.execPath, ['--import', pathToFileURL(preload).href, join(runtime, 'scripts', 'sprite.js'), 'build-set', list, '--check', '--json'], { cwd: dir, windowsHide: true }).then(result => ({ ...result, code: 0 }), error => error);
  const report = JSON.parse(run.stdout);
  expect(run.code).toBe(1);
  expect(report.ok).toBe(false);
  expect(report.errors.map(error => error.code)).toContain('tool-changed-during-check');
  expect(report.projects.every(project => project.status === 'invalid')).toBe(true);
  expect(snapshotTree(join(dir, '..', 'out'))).toEqual(before);
}, 30000);

test('check distinguishes missing, malformed, source and bounded toolchain identity without repair', async () => {
  const { runtime } = copiedProducer();
  const built = (await copiedCLI(runtime, 'build', a)).report;
  expect(built.ok).toBe(true);
  const path = built.artifacts.manifest, original = JSON.parse(readFileSync(path, 'utf8'));
  const cases = [
    ['tool-identity-missing', tool => { delete tool.identity; }],
    ['tool-identity-invalid', tool => { tool.identity = null; }],
    ['tool-identity-invalid', tool => { tool.identity.source.sha256 = 'A'.repeat(64); }],
    ['tool-source-changed', tool => { tool.identity.source.sha256 = '0'.repeat(64); }],
    ['toolchain-changed', tool => { tool.identity.node.version = 'v0.0.0'; }],
    ['toolchain-changed', tool => { tool.identity.dependencies.sharp = '0.0.0'; }],
  ];
  for (const [code, mutate] of cases) {
    const manifest = structuredClone(original); mutate(manifest.build.tool);
    writeFileSync(path, JSON.stringify(manifest));
    const before = snapshotTree(join(dir, '..', 'out'));
    const checked = await copiedCLI(runtime, 'build-set', list, '--check');
    expect(checked.report.projects[0].reasons.map(reason => reason.code), code).toContain(code);
    expect(snapshotTree(join(dir, '..', 'out')), code).toEqual(before);
  }
}, 30000);
