import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildProject } from './project-build.js';
import { buildTool, resolveBuildSource, snapshotBuildInputs } from './build-provenance.js';

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
    const output = canonical(resolve(dirname(configPath), config.output));
    return { configPath, config, output };
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

function inspectProject({ configPath, config, output }) {
  const reasons = [], reason = (code, message, details = {}) => reasons.push({ code, message, ...details });
  const result = { config: configPath, output, status: 'stale', reasons };
  let current;
  try {
    const { source } = resolveBuildSource(configPath, config);
    current = snapshotBuildInputs(configPath, config, source);
  } catch (error) {
    result.status = 'invalid'; reason('input-invalid', error.message); return result;
  }
  const path = join(output, 'sprite-manifest.json');
  if (!existsSync(path)) { reason('unbuilt', 'No successful build manifest; rebuild this project.'); return result; }
  let manifest;
  try { manifest = readJSON(path); }
  catch (error) { reason('manifest-invalid', error.message); return result; }
  const requiredFiles = ['sheet', 'atlas', 'verification']; // project, operations, preview and contactSheet may be omitted by the config
  if (manifest?.format !== 'agent-sprites-build-manifest' || manifest.version !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || requiredFiles.some(key => !Object.hasOwn(manifest.files, key))) {
    reason('manifest-invalid', 'Invalid build manifest; rebuild this project.'); return result;
  }
  const prior = manifest.build;
  if (!prior?.tool || !Array.isArray(prior.inputs)) reason('provenance-missing', 'Legacy output has no build provenance; rebuild to establish freshness.');
  else {
    if (prior.tool.name !== buildTool.name || prior.tool.version !== buildTool.version) reason('tool-version', `Built with ${prior.tool.name} ${prior.tool.version}; current tool is ${buildTool.name} ${buildTool.version}.`);
    for (const input of current.inputs) {
      if (!prior.inputs.some(old => old?.path === input.path && old.sha256 === input.sha256)) reason('input-changed', `Build input changed or was not recorded: ${input.path}`, { input: input.path });
    }
    if (prior.inputs.length !== current.inputs.length || prior.inputs.some(old => !current.inputs.some(input => input.path === old?.path))) reason('input-list-changed', 'The recorded input list differs from the current build.');
  }
  for (const file of Object.values(manifest.files)) {
    // Published artifact names are flat, portable basenames. Do not follow an
    // untrusted manifest to files elsewhere on disk.
    if (typeof file !== 'string' || !file || file === '.' || file === '..' || /[\\/:]/.test(file)) { reason('manifest-invalid', 'Invalid artifact filename in build manifest.'); continue; }
    try { if (!statSync(join(output, file)).isFile()) throw new Error('not a file'); }
    catch { reason('output-missing', `Build artifact missing: ${file}`, { file }); }
  }
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
    result.projects = projects.map(inspectProject);
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
