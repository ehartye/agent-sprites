import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, openSync, closeSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename, relative, isAbsolute, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { Agent, request } from 'node:http';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { SessionDB } from '../db/session.js';
import { CanvasRenderer } from '../engine/canvas-renderer.js';
import { verifyAtlasFile } from '../engine/atlas-verifier.js';
import { captureProjectMetadata } from '../project-state.js';
import { sessionRoutes } from '../web/api/session-routes.js';
import { drawRoutes } from '../web/api/draw-routes.js';
import { shapeRoutes } from '../web/api/shape-routes.js';
import { cellRoutes } from '../web/api/cell-routes.js';
import { groupRoutes } from '../web/api/group-routes.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
import { createPreview } from './preview.js';
import { renderFontProof } from './font-proof.js';
import { exportTrimmed, assertTrimOption } from '../engine/trimmed-export.js';
import { generateCharacterRecipe } from '../authoring/character.js';
import { generateEnvironmentRecipe } from '../authoring/environment.js';
import { generateUIRecipe } from '../authoring/ui.js';
import { generateTilesetRecipe } from '../authoring/tileset.js';
import { resolveBuildSource, snapshotBuildInputs } from './build-provenance.js';

const exec = promisify(execFile);
const marker = '.agent-sprites-build.json';
const json = value => JSON.stringify(value, null, 2) + '\n';
const pathKey = path => process.platform === 'win32' ? path.toLowerCase() : path;
const inside = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

// Keep shared HTTP route semantics without fetch's per-operation stream overhead.
// One private agent belongs to one build; callers still await every mutation.
function requestOperation(url, op, agent) {
  return new Promise((accept, reject) => {
    const body = op.body ? JSON.stringify(op.body) : undefined;
    const headers = body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = request(url + op.path, { agent, method: op.method, headers }, response => {
      let json = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { json += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { accept({ ok: response.statusCode >= 200 && response.statusCode < 300, statusText: response.statusMessage, value: JSON.parse(json) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Windows readers/watchers can briefly deny a directory rename after files close.
// Keep the output intact: retry the rename itself, never remove its destination.
async function renameForPublication(from, to) {
  const waits = [50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt++) {
    try { renameSync(from, to); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === waits.length) throw error;
      await delay(waits[attempt]);
    }
  }
}

function outputOwner(output, configPath) {
  const config = relative(output, configPath);
  // Different Windows drives have no relative path; keep the existing absolute guard there.
  return isAbsolute(config)
    ? { version: 1, config: configPath }
    : { version: 2, config: config.split(sep).join('/') };
}

function assertOwnedOutput(output, configPath) {
  if (!existsSync(output)) return;
  if (lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory()) throw new Error('Output must be a regular build directory, not a file or link.');
  let prior;
  try { prior = JSON.parse(readFileSync(join(output, marker), 'utf8')); } catch { /* explicit error below */ }
  const expected = outputOwner(output, configPath);
  // Legacy markers prove ownership only at their original location, then migrate on publication.
  const owned = typeof prior?.config === 'string' && (
    (prior.version === 1 && pathKey(prior.config) === pathKey(configPath)) ||
    (prior.version === 2 && expected.version === 2 && pathKey(prior.config) === pathKey(expected.config))
  );
  if (!owned || !Array.isArray(prior?.files)) throw new Error('Output directory is not owned by this build config. Choose a new output directory.');
  const allowed = new Set([...prior.files, marker]);
  if (readdirSync(output).some(file => !allowed.has(file) || !lstatSync(join(output, file)).isFile())) throw new Error('Output contains files outside the previous build; move them before rebuilding.');
}

/** A build uses a fresh in-memory database and loopback-only temporary API. */
export async function buildProject(configPath) {
  let stage, server, db, lock, lockPath, agent;
  const result = { ok: false, artifacts: {}, errors: [], warnings: [] };
  try {
    configPath = realpathSync(resolve(configPath));
    const config = JSON.parse(readFileSync(configPath, 'utf8')), base = dirname(configPath);
    if (config.version !== 1) throw new Error('Build config requires version: 1.');
    if (typeof config.output !== 'string' || !config.output) throw new Error('Build config requires an explicit output directory.');
    const { sourceKind, inline, source } = resolveBuildSource(configPath, config);
    assertTrimOption(config.trim);
    // Large generated sets can leave out the bulky editable and review artifacts when only the game files are published.
    const OMITTABLE = ['project', 'operations', 'preview', 'contactSheet'];
    if (config.omit !== undefined && (!Array.isArray(config.omit) || config.omit.some(k => !OMITTABLE.includes(k)))) throw new Error(`omit must be an array drawn from: ${OMITTABLE.join(', ')}.`);
    const omit = new Set(config.omit ?? []);
    if (config.expectedTags !== undefined && (!Array.isArray(config.expectedTags) || config.expectedTags.some(t => typeof t !== 'string' || !t))) throw new Error('expectedTags must be an array of animation names.');
    if (config.expectedFrames !== undefined && (!Array.isArray(config.expectedFrames) || config.expectedFrames.some(t => typeof t !== 'string' || !t))) throw new Error('expectedFrames must be an array of frame names.');
    const provenance = snapshotBuildInputs(configPath, config, source);
    let output = resolve(base, config.output);
    if (inside(output, configPath) || inside(output, source)) throw new Error('Output cannot contain the config or source files.');
    mkdirSync(dirname(output), { recursive: true });
    output = join(realpathSync(dirname(output)), basename(output));
    if (inside(output, configPath) || inside(output, source)) throw new Error('Output cannot contain the config or source files through a linked directory.');
    lockPath = output + '.build-lock'; lock = openSync(lockPath, 'wx');
    assertOwnedOutput(output, configPath);
    let operations, recipeReport;
    if (inline) {
      const generate = {character: generateCharacterRecipe, environment: generateEnvironmentRecipe, ui: generateUIRecipe, tileset: generateTilesetRecipe}[sourceKind];
      ({ operations, report: recipeReport } = generate(config[sourceKind], base));
    } else if (config.generator) {
      if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(a => typeof a !== 'string'))) throw new Error('Generator args must be a string array.');
      const generated = await exec(process.execPath, [source, ...(config.args ?? [])], { cwd: base, timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      const generatedOut = JSON.parse(generated.stdout);
      if (Array.isArray(generatedOut)) operations = generatedOut;
      else {
        // Generators may publish a character report beside their operations.
        if (!generatedOut || !Array.isArray(generatedOut.operations)) throw new Error('Generator output must be an operations array or { operations, report }.');
        if (generatedOut.report !== undefined && (generatedOut.report?.kind !== 'character' || !Array.isArray(generatedOut.report.frames))) throw new Error('Generator report must be a character report with frames.');
        operations = generatedOut.operations;
        recipeReport = generatedOut.report;
      }
    } else operations = JSON.parse(readFileSync(source, 'utf8'));
    if (!Array.isArray(operations) || !operations.length || operations[0]?.command !== 'new') throw new Error('Build operations must start with exactly one new project.');
    const name = operations[0].name;
    if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) throw new Error('Build project names must use letters, digits, hyphens or underscores.');
    const mapped = operations.map((op, i) => {
      if (!op || typeof op !== 'object' || Array.isArray(op) || ['save', 'export', 'ref'].includes(op.command) || (i > 0 && op.command === 'new')) throw new Error(`Operation ${i + 1}: build owns project lifecycle and output; remove new/save/export/ref operations after initial new.`);
      return mapCommandToApi(op);
    });
    stage = mkdtempSync(output + '.staging-');
    db = new SessionDB(':memory:');
    // Isolated builds cannot resume this in-memory session. Serialize once for
    // the final editable artifact instead of rewriting a growing draft per op.
    const state = { db, project: null, sessionId: null, persistDrafts: false };
    const app = express(); app.use(express.json());
    app.use('/api/session', sessionRoutes(state));
    for (const routes of [drawRoutes, shapeRoutes, cellRoutes, groupRoutes]) app.use('/api', routes(state));
    server = await new Promise((accept, reject) => { const s = app.listen(0, '127.0.0.1', () => accept(s)); s.once('error', reject); });
    const url = `http://127.0.0.1:${server.address().port}`;
    agent = new Agent({ keepAlive: true, maxSockets: 1 });
    for (const [i, op] of mapped.entries()) {
      const response = await requestOperation(url, op, agent);
      const { value } = response;
      if (!response.ok || !value.ok) throw new Error(`Operation ${i + 1} (${operations[i].command}): ${value.error ?? response.statusText}`);
    }
    captureProjectMetadata(state);
    const project = state.project;
    const renderer = new CanvasRenderer(project.palette, { background: project.background });
    const { png, atlas } = config.trim
      ? await exportTrimmed(project, renderer, { imageName: `${name}.png` })
      : { png: renderer.renderSheet(project.cells, { gap: 0 }), atlas: project.exportAseprite({ imageName: `${name}.png` }) };
    // An environment drawn on a coarser source grid tells the game how far to scale the atlas.
    if (recipeReport?.pixelScale !== undefined) atlas.meta.pixelScale = recipeReport.pixelScale;
    writeFileSync(join(stage, `${name}.png`), png);
    writeFileSync(join(stage, `${name}.atlas.json`), json(atlas));
    const verified = await verifyAtlasFile(join(stage, `${name}.atlas.json`), { expectedTags: config.expectedTags ?? [], expectedFrames: config.expectedFrames ?? [], outlineColors: config.outlineColors, contactPath: join(stage, 'contact.png'), scale: config.scale ?? 4 });
    result.warnings = verified.warnings;
    // Cells that only pad the last grid row are not art: do not ask the author to confirm they are empty.
    if (recipeReport?.kind === 'tileset') result.warnings = verified.warnings = verified.warnings.filter(w => !(w.code === 'empty-frame' && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) >= recipeReport.count && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) < recipeReport.columns * recipeReport.rows));
    if (!verified.ok) { result.errors = verified.errors; return result; }
    const artifacts = { sheet: `${name}.png`, atlas: `${name}.atlas.json`, project: `${name}.project.json`, contactSheet: 'contact.png', preview: 'preview.html', verification: 'verification.json', operations: 'operations.json' };
    for (const key of omit) delete artifacts[key];
    if (omit.has('contactSheet')) rmSync(join(stage, 'contact.png'), { force: true });
    // Inline recipes name their report by source; generator reports are character reports.
    const reportKey = inline ? `${sourceKind}Report` : recipeReport ? 'characterReport' : null;
    if (reportKey) {
      artifacts[reportKey] = reportKey.replace(/Report$/, '-report.json');
      writeFileSync(join(stage, artifacts[reportKey]), json(recipeReport));
    }
    if (sourceKind === 'character' || sourceKind === 'environment' || recipeReport?.kind === 'character') {
      // Report-driven ground anchoring and walking, so games do not re-derive gait conventions.
      artifacts.playbackRuntime = 'playback-runtime.mjs';
      writeFileSync(join(stage, artifacts.playbackRuntime), readFileSync(new URL('./playback-runtime.mjs', import.meta.url)));
    }
    if (sourceKind === 'ui') {
      artifacts.uiRuntime = 'ui-runtime.mjs';
      writeFileSync(join(stage, artifacts.uiRuntime), readFileSync(new URL('./ui-runtime.mjs', import.meta.url)));
      if (recipeReport.kind === 'font') {
        const proof = await renderFontProof(png, atlas, recipeReport);
        artifacts.fontProof = 'font-proof.png';
        artifacts.fontProofReport = 'font-proof.json';
        writeFileSync(join(stage, artifacts.fontProof), proof.png);
        writeFileSync(join(stage, artifacts.fontProofReport), json(proof.report));
        artifacts.uiBoot = 'ui-boot.mjs';
        writeFileSync(join(stage, artifacts.uiBoot), `// Generated bitmap bootstrap: no network font or platform text renderer.\nexport const imageDataUrl=${JSON.stringify('data:image/png;base64,' + png.toString('base64'))};\nexport const atlas=${JSON.stringify(atlas)};\nexport const report=${JSON.stringify(recipeReport)};\n`);
      }
    }
    // Consumers read one portable file instead of guessing names per recipe kind.
    // Names are relative so the manifest survives copying the output directory.
    const manifest = { format: 'agent-sprites-build-manifest', version: 1, name, source: sourceKind, build: provenance };
    if (recipeReport?.kind) manifest.kind = recipeReport.kind;
    if (recipeReport?.pixelScale !== undefined) manifest.pixelScale = recipeReport.pixelScale;
    if (reportKey) manifest.report = artifacts[reportKey];
    manifest.files = { ...artifacts };
    artifacts.manifest = 'sprite-manifest.json';
    writeFileSync(join(stage, artifacts.manifest), json(manifest));
    verified.artifacts = { atlas: artifacts.atlas, image: artifacts.sheet, ...(artifacts.contactSheet ? { contactSheet: artifacts.contactSheet } : {}) };
    writeFileSync(join(stage, artifacts.verification), json(verified));
    if (artifacts.project) writeFileSync(join(stage, artifacts.project), json(project.toJSON()));
    if (artifacts.operations) writeFileSync(join(stage, artifacts.operations), json(operations));
    if (artifacts.preview) writeFileSync(join(stage, artifacts.preview), createPreview(atlas, png, name));
    writeFileSync(join(stage, marker), json({ ...outputOwner(output, configPath), files: Object.values(artifacts) }));
    if (JSON.stringify(snapshotBuildInputs(configPath, config, source)) !== JSON.stringify(provenance)) throw new Error('Build inputs changed during generation; retry with stable inputs.');
    assertOwnedOutput(output, configPath);
    const backup = stage + '.previous';
    const replacing = existsSync(output);
    if (replacing) await renameForPublication(output, backup);
    try { await renameForPublication(stage, output); }
    catch (error) {
      if (replacing) {
        try { await renameForPublication(backup, output); }
        catch (restoreError) {
          throw new Error(`${error.message}; previous output retained at ${backup}; restoring it failed: ${restoreError.message}`, { cause: error });
        }
      }
      throw error;
    }
    stage = undefined;
    if (replacing) {
      try { rmSync(backup, { recursive: true }); }
      catch (error) { result.warnings.push({ code: 'backup-cleanup', message: `Build published; previous output retained at ${backup}: ${error.message}` }); }
    }
    result.ok = true;
    result.artifacts = Object.fromEntries(Object.entries(artifacts).map(([key, file]) => [key, join(output, file)]));
    return result;
  } catch (error) { result.errors.push({ code: 'build', message: error.message }); return result; }
  finally {
    agent?.destroy();
    if (server) await new Promise(accept => { server.close(accept); server.closeAllConnections(); });
    db?.close();
    if (stage) rmSync(stage, { recursive: true, force: true });
    if (lock !== undefined) { closeSync(lock); rmSync(lockPath); }
  }
}
