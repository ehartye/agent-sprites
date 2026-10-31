// Establish immutable source/package metadata before the renderer graph loads.
import { acquireBuildTool, assertLoadedProducer, assertToolStable } from './producer-identity.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, openSync, closeSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename, relative, isAbsolute, sep } from 'node:path';
import { Agent, request } from 'node:http';
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
import { API_BODY_LIMIT } from '../web/api/policy.js';
import { createPreview } from './preview.js';
import { renderFontProof } from './font-proof.js';
import { assertTrimOption } from '../engine/trimmed-export.js';
import { exportSpriteAtlases } from '../engine/sprite-export.js';
import { generateCharacterRecipe } from '../authoring/character.js';
import { generateEnvironmentRecipe } from '../authoring/environment.js';
import { generateUIRecipe } from '../authoring/ui.js';
import { buildPhaserUi } from './ui-phaser.js';
import { publishUiSoftware } from './ui-software.mjs';
import { isUiReport, validateUiReport } from './ui-report.js';
import { generateCreatureRecipe } from '../authoring/creature.js';
import { generateTilesetRecipe } from '../authoring/tileset.js';
import { generateNativeRecipe } from '../authoring/native-recipe.js';
import { generateAnimationComposition } from '../authoring/animation-composition.js';
import { resolveBuildSource, snapshotBuildInputs } from './build-provenance.js';
import { buildMarker as marker, buildManifest, snapshotArtifactIntegrity } from './artifact-integrity.js';
import { createConstructionRecorder } from '../engine/construction-replay.js';
import { readGeneratorInput } from './generator-input.js';

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
export async function buildProject(configPath, { signal, onProgress, generatorPolicy } = {}) {
  let stage, server, db, lock, lockPath, agent;
  const result = { ok: false, artifacts: {}, errors: [], warnings: [] };
  const checkCanceled = () => { if (signal?.aborted) throw new Error('Build canceled.'); };
  const progress = event => { try { onProgress?.(event); } catch { /* Observation cannot fail a build. */ } };
  const phase = name => { progress({ phase: name }); checkCanceled(); };
  try {
    phase('prepare');
    const tool = assertLoadedProducer();
    configPath = realpathSync(resolve(configPath));
    const config = JSON.parse(readFileSync(configPath, 'utf8')), base = dirname(configPath);
    if (config.version !== 1) throw new Error('Build config requires version: 1.');
    if (typeof config.output !== 'string' || !config.output) throw new Error('Build config requires an explicit output directory.');
    const { sourceKind, inline, source } = resolveBuildSource(configPath, config);
    assertTrimOption(config.trim);
    if(config.normal!==undefined&&typeof config.normal!=='boolean')throw new Error('normal must be true or false');
    if (config.projectFormat !== undefined && !['shared', 'expanded'].includes(config.projectFormat)) throw new Error('projectFormat must be shared or expanded.');
    // Large generated sets can leave out the bulky editable and review artifacts when only the game files are published.
    const OMITTABLE = ['project', 'operations', 'preview', 'contactSheet'];
    if (config.omit !== undefined && (!Array.isArray(config.omit) || config.omit.some(k => !OMITTABLE.includes(k)))) throw new Error(`omit must be an array drawn from: ${OMITTABLE.join(', ')}.`);
    const omit = new Set(config.omit ?? []);
    if (config.expectedTags !== undefined && (!Array.isArray(config.expectedTags) || config.expectedTags.some(t => typeof t !== 'string' || !t))) throw new Error('expectedTags must be an array of animation names.');
    if (config.expectedFrames !== undefined && (!Array.isArray(config.expectedFrames) || config.expectedFrames.some(t => typeof t !== 'string' || !t))) throw new Error('expectedFrames must be an array of frame names.');
    const provenance = snapshotBuildInputs(configPath, config, source, tool);
    const inputPaths = provenance.inputs.flatMap(input => {
      const path = resolve(base, input.path);
      return [path, realpathSync(path)];
    });
    let output = resolve(base, config.output);
    if (inputPaths.some(path => inside(output, path))) throw new Error('Output cannot contain the config or source input files.');
    mkdirSync(dirname(output), { recursive: true });
    output = join(realpathSync(dirname(output)), basename(output));
    if (inputPaths.some(path => inside(output, path))) throw new Error('Output cannot contain the config or source input files through a linked directory.');
    lockPath = output + '.build-lock'; lock = openSync(lockPath, 'wx');
    assertOwnedOutput(output, configPath);
    let operations, recipeReport;
    if (inline) {
      const generate = {character: generateCharacterRecipe, environment: generateEnvironmentRecipe, native: generateNativeRecipe, ui: generateUIRecipe, creature: generateCreatureRecipe, tileset: generateTilesetRecipe, animation: generateAnimationComposition}[sourceKind];
      ({ operations, report: recipeReport } = generate(config[sourceKind], base));
    } else if (config.generator) {
      if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(a => typeof a !== 'string'))) throw new Error('Generator args must be a string array.');
      const generated = await readGeneratorInput({ source, args: config.args ?? [], cwd: base, signal, onProgress: progress, policy: generatorPolicy });
      checkCanceled();
      result.generatorInput = { ...generated.receipt, stderr: generated.stderr };
      const generatedOut = generated.data;
      if (Array.isArray(generatedOut)) operations = generatedOut;
      else {
        // Generators may publish the same UI or character report as a recipe.
        if (!generatedOut || !Array.isArray(generatedOut.operations)) throw new Error('Generator output must be an operations array or { operations, report }.');
        if (generatedOut.report !== undefined && ((!isUiReport(generatedOut.report) && generatedOut.report?.kind !== 'character') || !Array.isArray(generatedOut.report.frames))) throw new Error('Generator report must be a character or UI report with frames.');
        operations = generatedOut.operations;
        recipeReport = generatedOut.report;
      }
    } else operations = JSON.parse(readFileSync(source, 'utf8'));
    checkCanceled();
    if (!Array.isArray(operations) || !operations.length || operations[0]?.command !== 'new') throw new Error('Build operations must start with exactly one new project.');
    const name = operations[0].name;
    if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) throw new Error('Build project names must use letters, digits, hyphens or underscores.');
    const annotatedSources = new Set(operations.map(operation => operation?.replay?.source?.path));
    const replay = config.replay === undefined ? null : createConstructionRecorder(config.replay, {
      operations, inputs:provenance.inputs,
      source:{kind:inline ? 'recipe' : config.generator ? 'generator' : 'ops', path:relative(base,source).split(sep).join('/'), ...(inline ? {pointer:`/${sourceKind}`} : {})},
      sourceContents:Object.fromEntries(provenance.inputs.filter(input => annotatedSources.has(input.path)).map(input => [input.path, readFileSync(resolve(base,input.path),'utf8')])),
    });
    const mapped = operations.map((op, i) => {
      if (!op || typeof op !== 'object' || Array.isArray(op) || ['save', 'export', 'ref'].includes(op.command) || (i > 0 && op.command === 'new')) throw new Error(`Operation ${i + 1}: build owns project lifecycle and output; remove new/save/export/ref operations after initial new.`);
      const { replay: annotation, ...command } = op;
      return mapCommandToApi(command);
    });
    stage = mkdtempSync(output + '.staging-');
    db = new SessionDB(':memory:');
    // Isolated builds cannot resume this in-memory session. Serialize once for
    // the final editable artifact instead of rewriting a growing draft per op.
    const state = { db, project: null, sessionId: null, persistDrafts: false };
    const app = express(); app.use(express.json({ limit: API_BODY_LIMIT }));
    app.use('/api/session', sessionRoutes(state));
    for (const routes of [drawRoutes, shapeRoutes, cellRoutes, groupRoutes]) app.use('/api', routes(state));
    server = await new Promise((accept, reject) => { const s = app.listen(0, '127.0.0.1', () => accept(s)); s.once('error', reject); });
    checkCanceled();
    const url = `http://127.0.0.1:${server.address().port}`;
    agent = new Agent({ keepAlive: true, maxSockets: 1 });
    for (const [i, op] of mapped.entries()) {
      progress({ phase: 'operations', completed: i, total: mapped.length }); checkCanceled();
      const response = await requestOperation(url, op, agent);
      checkCanceled();
      const { value } = response;
      if (!response.ok || !value.ok) throw new Error(`Operation ${i + 1} (${operations[i].command}): ${value.error ?? response.statusText}`);
      replay?.capture(state.project, i);
    }
    progress({ phase: 'operations', completed: mapped.length, total: mapped.length }); checkCanceled();
    captureProjectMetadata(state);
    const project = state.project;
    replay?.finish(project);
    const renderer = new CanvasRenderer(project.palette, { background: project.background });
    phase('render');
    const { png, atlas, normalPng, normalAtlas } = await exportSpriteAtlases(project, renderer, { imageName: `${name}.png`, trim:config.trim, normal:config.normal });
    checkCanceled();
    if (isUiReport(recipeReport)) await validateUiReport(recipeReport, atlas, png);
    checkCanceled();
    // An environment drawn on a coarser source grid tells the game how far to scale the atlas.
    if (recipeReport?.pixelScale !== undefined) {
      atlas.meta.pixelScale = recipeReport.pixelScale;
      if (normalAtlas) normalAtlas.meta.pixelScale = recipeReport.pixelScale;
    }
    writeFileSync(join(stage, `${name}.png`), png);
    writeFileSync(join(stage, `${name}.atlas.json`), json(atlas));
    phase('verify');
    const verified = await verifyAtlasFile(join(stage, `${name}.atlas.json`), { expectedTags: config.expectedTags ?? [], expectedFrames: config.expectedFrames ?? [], outlineColors: config.outlineColors, maxAspect: config.maxAspect ?? (sourceKind === 'ui' ? 3 : undefined), contactPath: join(stage, 'contact.png'), scale: config.scale ?? 4 });
    checkCanceled();
    result.warnings = verified.warnings;
    // Cells that only pad the last grid row are not art: do not ask the author to confirm they are empty.
    if (recipeReport?.kind === 'tileset') result.warnings = verified.warnings = verified.warnings.filter(w => !(w.code === 'empty-frame' && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) >= recipeReport.count && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) < recipeReport.columns * recipeReport.rows));
    if (recipeReport?.kind === 'animation') result.warnings = verified.warnings = verified.warnings.filter(w => !(w.code === 'empty-frame' && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) >= recipeReport.count && Number(/^frames\[(\d+)\]$/.exec(w.path ?? '')?.[1]) < recipeReport.columns * recipeReport.rows));
    // A near-square UI sheet pads its last row with unnamed cells; every named frame is real art.
    if (sourceKind === 'ui') result.warnings = verified.warnings = verified.warnings.filter(w => !(w.code === 'empty-frame' && /^Frame \d+ /.test(w.message)));
    // A native overlay (native.only) is sparse by design: a back view has no facial hair, so empty frames are expected.
    if (sourceKind === 'native' && config.native?.only) result.warnings = verified.warnings = verified.warnings.filter(w => w.code !== 'empty-frame');
    if (!verified.ok) { result.errors = verified.errors; return result; }
    phase('artifacts');
    const artifacts = { sheet: `${name}.png`, atlas: `${name}.atlas.json`, project: `${name}.project.json`, contactSheet: 'contact.png', preview: 'preview.html', verification: 'verification.json', operations: 'operations.json' };
    if(normalPng){
      artifacts.normalSheet=`${name}.normal.png`;artifacts.normalAtlas=`${name}.normal.atlas.json`;
      writeFileSync(join(stage,artifacts.normalSheet),normalPng);writeFileSync(join(stage,artifacts.normalAtlas),json(normalAtlas));
    }
    if (replay) {
      artifacts.constructionReplay = 'construction-replay.json';
      writeFileSync(join(stage,artifacts.constructionReplay), json(project.constructionReplay));
    }
    for (const key of omit) delete artifacts[key];
    if (omit.has('contactSheet')) rmSync(join(stage, 'contact.png'), { force: true });
    // Inline recipes name their report by source; generator reports are character reports.
    const reportKey = inline ? (sourceKind === 'native' ? 'characterReport' : `${sourceKind}Report`) : isUiReport(recipeReport) ? 'uiReport' : recipeReport ? 'characterReport' : null;
    if (reportKey) {
      artifacts[reportKey] = reportKey.replace(/Report$/, '-report.json');
      writeFileSync(join(stage, artifacts[reportKey]), json(recipeReport));
    }
    if (sourceKind === 'character' || sourceKind === 'environment' || sourceKind === 'creature' || recipeReport?.kind === 'character') {
      // Report-driven ground anchoring and walking, so games do not re-derive gait conventions.
      artifacts.playbackRuntime = 'playback-runtime.mjs';
      writeFileSync(join(stage, artifacts.playbackRuntime), readFileSync(new URL('./playback-runtime.mjs', import.meta.url)));
    }
    if (isUiReport(recipeReport)) {
      const software = publishUiSoftware({output:stage});
      for (const file of Object.keys(software.artifacts)) {
        const declaration = file.endsWith('.d.mts');
        const alias = file.replace(/\.(?:d\.mts|mjs)$/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()) + (declaration ? 'Types' : '');
        artifacts[alias] = file;
      }
      artifacts.uiSoftwareManifest = 'ui-software-manifest.json';
      artifacts.uiPhaser = 'ui-phaser.json';
      const phaserUi = buildPhaserUi({ report: recipeReport, atlas, name });
      writeFileSync(join(stage, artifacts.uiPhaser), json(phaserUi));
      if (recipeReport.kind === 'font') {
        const proof = await renderFontProof(png, atlas, recipeReport, { proof: config.proof });
        checkCanceled();
        artifacts.fontProof = 'font-proof.png';
        artifacts.fontProofReport = 'font-proof.json';
        writeFileSync(join(stage, artifacts.fontProof), proof.png);
        writeFileSync(join(stage, artifacts.fontProofReport), json(proof.report));
        artifacts.uiBoot = 'ui-boot.mjs';
        writeFileSync(join(stage, artifacts.uiBoot), `// Generated bitmap bootstrap: no network font or platform text renderer.\nexport const imageDataUrl=${JSON.stringify('data:image/png;base64,' + png.toString('base64'))};\nexport const atlas=${JSON.stringify(atlas)};\nexport const report=${JSON.stringify(recipeReport)};\nexport const phaser=${JSON.stringify(phaserUi)};\n`);
      }
    }
    // Consumers read one portable file instead of guessing names per recipe kind.
    // Names are relative so the manifest survives copying the output directory.
    const manifest = { format: 'agent-sprites-build-manifest', version: 1, name, source: sourceKind, build: provenance };
    if (result.generatorInput) manifest.generatorInput = result.generatorInput;
    if (recipeReport?.kind) manifest.kind = recipeReport.kind;
    if (recipeReport?.pixelScale !== undefined) manifest.pixelScale = recipeReport.pixelScale;
    if (reportKey) manifest.report = artifacts[reportKey];
    manifest.files = { ...artifacts };
    artifacts.manifest = buildManifest;
    verified.artifacts = { atlas: artifacts.atlas, image: artifacts.sheet, ...(artifacts.contactSheet ? { contactSheet: artifacts.contactSheet } : {}) };
    writeFileSync(join(stage, artifacts.verification), json(verified));
    if (artifacts.project) writeFileSync(join(stage, artifacts.project), json(project.toStorageJSON({ format: config.projectFormat })));
    if (artifacts.operations) writeFileSync(join(stage, artifacts.operations), json(operations));
    if (artifacts.preview) writeFileSync(join(stage, artifacts.preview), createPreview(atlas, png, name));
    writeFileSync(join(stage, marker), json({ ...outputOwner(output, configPath), files: Object.values(artifacts) }));
    // All output content, including the ownership marker, is final before the
    // receipt. The marker names the manifest but does not hash it: no cycle.
    manifest.integrity = snapshotArtifactIntegrity(stage, manifest.files);
    writeFileSync(join(stage, artifacts.manifest), json(manifest));
    const finalTool = acquireBuildTool();
    assertToolStable(tool, finalTool, 'generation');
    if (JSON.stringify(snapshotBuildInputs(configPath, config, source, finalTool)) !== JSON.stringify(provenance)) throw new Error('Build inputs changed during generation; retry with stable inputs.');
    assertOwnedOutput(output, configPath);
    phase('prepublication');
    const backup = stage + '.previous';
    const replacing = existsSync(output);
    // Cancellation is cooperative up to this point. Complete the atomic swap or
    // restore its backup once committing starts; never report a committed build as canceled.
    progress({ phase: 'committing' });
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
    progress({ phase: 'committed' });
    if (replacing) {
      try { rmSync(backup, { recursive: true }); }
      catch (error) { result.warnings.push({ code: 'backup-cleanup', message: `Build published; previous output retained at ${backup}: ${error.message}` }); }
    }
    result.ok = true;
    result.artifacts = Object.fromEntries(Object.entries(artifacts).map(([key, file]) => [key, join(output, file)]));
    return result;
  } catch (error) { result.errors.push({ code: 'build', message: error.message }); if (error.generatorStderr) result.generatorStderr = error.generatorStderr; return result; }
  finally {
    const cleanup = async action => {
      try { await action(); }
      catch (error) { (result.ok ? result.warnings : result.errors).push({ code: 'build-cleanup', message: error.message }); }
    };
    await cleanup(() => agent?.destroy());
    if (server) await cleanup(() => new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeAllConnections(); }));
    await cleanup(() => db?.close());
    if (stage) await cleanup(() => rmSync(stage, { recursive: true, force: true }));
    if (lock !== undefined) { await cleanup(() => closeSync(lock)); await cleanup(() => rmSync(lockPath)); }
  }
}
