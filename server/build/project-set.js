import { existsSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildProject } from './project-build.js';
import { checkTilesetRecipe } from '../authoring/tileset.js';
import { resolveBuildSource, snapshotBuildInputs } from './build-provenance.js';
import { acquireBuildTool, compareBuildTool, assertToolStable } from './producer-identity.js';
import { buildManifest, inspectArtifactIntegrity } from './artifact-integrity.js';

const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
const inside = (parent, child) => {
  const path = relative(key(parent), key(child));
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};
const canonical = path => existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));

function readProjects(listPath) {
  listPath = realpathSync(resolve(listPath));
  const manifest = readJSON(listPath);
  if (manifest?.version !== 1 || !Array.isArray(manifest.projects) || !manifest.projects.length || manifest.projects.some(path => typeof path !== 'string' || !path.trim())) {
    throw new Error('Project set requires version: 1 and a nonempty projects array of build config paths.');
  }
  const seen = new Set();
  const projects = manifest.projects.map(path => {
    const configPath = realpathSync(resolve(dirname(listPath), path)), id = key(configPath);
    if (seen.has(id)) throw new Error(`Duplicate build config: ${path}`);
    seen.add(id);
    const config = readJSON(configPath);
    if (config?.version !== 1 || typeof config.output !== 'string' || !config.output.trim()) throw new Error(`Invalid build config: ${path}; requires version: 1 and an output directory.`);
    const declaredOutput = resolve(dirname(configPath), config.output), output = canonical(declaredOutput);
    return { configPath, config, output, declaredOutput };
  });
  for (const [i, project] of projects.entries()) {
    if (inside(project.output, listPath)) throw new Error(`Output contains the project set: ${project.output}`);
    for (const other of projects) {
      if (inside(project.output, dirname(other.configPath))) throw new Error(`Output overlaps a source directory: ${project.output}`);
    }
    for (const other of projects.slice(i + 1)) {
      if (inside(project.output, other.output) || inside(other.output, project.output)) throw new Error(`Overlapping project outputs: ${project.output} and ${other.output}`);
    }
  }
  return projects;
}

function inspectProject({ configPath, config, output, declaredOutput }, tool) {
  const reasons = [], reason = (code, message, details = {}) => reasons.push({ code, message, ...details });
  const result = { config: configPath, output, status: 'stale', reasons };
  let current;
  try {
    const { source } = resolveBuildSource(configPath, config);
    current = snapshotBuildInputs(configPath, config, source, tool);
  } catch (error) {
    result.status = 'invalid'; reason('input-invalid', error.message); return result;
  }
  // Parse-only: a mistyped .pxl row is reported with its file and line instead of waiting for a rebuild to fail.
  if (config.tileset && typeof config.tileset === 'object') {
    const checked = checkTilesetRecipe(config.tileset, dirname(configPath));
    for (const d of checked.diagnostics) reason('source-invalid', d.message, { file: d.file, line: d.line });
    if (reasons.length) { result.status = 'invalid'; return result; }
  }
  const path = join(output, buildManifest);
  try {
    const directory = lstatSync(declaredOutput), file = lstatSync(path);
    if (directory.isSymbolicLink() || !directory.isDirectory() || file.isSymbolicLink() || !file.isFile()) {
      reason('manifest-invalid', 'Build output and manifest must be regular files/directories, not links.'); return result;
    }
  } catch { reason('unbuilt', 'No successful build manifest; rebuild this project.'); return result; }
  let manifest;
  try { manifest = readJSON(path); }
  catch (error) { reason('manifest-invalid', error.message); return result; }
  const omitted = new Set(Array.isArray(config.omit) ? config.omit : []);
  const requiredFiles = ['sheet', 'atlas', 'project', 'contactSheet', 'preview', 'verification', 'operations'].filter(key => !omitted.has(key));
  if (manifest?.format !== 'agent-sprites-build-manifest' || manifest.version !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || requiredFiles.some(key => !Object.hasOwn(manifest.files, key))) {
    reason('manifest-invalid', 'Invalid build manifest; rebuild this project.'); return result;
  }
  const prior = manifest.build;
  if (!prior?.tool || !Array.isArray(prior.inputs)) reason('provenance-missing', 'Legacy output has no build provenance; rebuild to establish freshness.');
  else {
    reasons.push(...compareBuildTool(prior.tool, tool));
    for (const input of current.inputs) {
      if (!prior.inputs.some(old => old?.path === input.path && old.sha256 === input.sha256)) reason('input-changed', `Build input changed or was not recorded: ${input.path}`, { input: input.path });
    }
    if (prior.inputs.length !== current.inputs.length || prior.inputs.some(old => !current.inputs.some(input => input.path === old?.path))) reason('input-list-changed', 'The recorded input list differs from the current build.');
  }
  reasons.push(...inspectArtifactIntegrity(output, manifest));
  if (!reasons.length) result.status = 'current';
  return result;
}

/** Ordered, fail-fast builds; --check is read-only and never runs generators. */
export async function buildProjectSet(listPath, { check = false } = {}) {
  const result = { ok: false, mode: check ? 'check' : 'build', total: 0, attempted: 0, succeeded: 0, failed: 0, stale: 0, projects: [], errors: [] };
  let projects;
  try { projects = readProjects(listPath); }
  catch (error) { result.errors.push({ code: 'project-set', message: error.message }); return result; }
  result.total = projects.length;
  if (check) {
    let tool;
    try {
      tool = acquireBuildTool();
      result.projects = projects.map(project => inspectProject(project, tool));
      assertToolStable(tool, acquireBuildTool(), 'check');
    } catch (error) {
      const reason = { code: tool ? 'tool-changed-during-check' : 'tool-identity-invalid', message: error.message };
      result.errors.push(reason);
      result.projects = projects.map((project, index) => ({ ...(result.projects[index] ?? { config: project.configPath, output: project.output, reasons: [] }), status: 'invalid', reasons: [...(result.projects[index]?.reasons ?? []), reason] }));
    }
    result.stale = result.projects.filter(project => project.status !== 'current').length;
    result.ok = result.stale === 0;
    return result;
  }
  for (const project of projects) {
    const entry = { config: project.configPath, output: project.output, status: 'skipped' };
    result.projects.push(entry);
    if (result.failed) continue;
    result.attempted++;
    const built = await buildProject(project.configPath);
    Object.assign(entry, { status: built.ok ? 'built' : 'failed', artifacts: built.artifacts, errors: built.errors, warnings: built.warnings });
    if (built.ok) result.succeeded++;
    else { result.failed++; result.errors.push(...built.errors.map(error => ({ ...error, config: project.configPath }))); }
  }
  result.ok = result.failed === 0;
  return result;
}
