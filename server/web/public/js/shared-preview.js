import { AnimationPreview } from './animation.js';
import { ProjectFrames } from './project-frames.js';
import { previewSequences, selectPreviewSequence } from './preview-sequences.js';

const base = location.pathname.replace(/\/$/, '');
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get('preview');
// Scrub before requesting any project data or starting the native raster worker.
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
const status = document.getElementById('preview-status');
const sequence = document.getElementById('preview-sequence');
const row = document.getElementById('preview-row');
const controls = document.getElementById('preview-controls');
const preview = new AnimationPreview({ mountId: 'full-preview-mount', size: 512, showOnionSkin: false, responsive: true, title: 'Full Preview' });
let stopped = false, timer, sequenceKey, contextKey;
function unavailable() {
  if (stopped) return;
  stopped = true; clearInterval(timer); preview.destroy();
  frames.destroy();
  controls.hidden = true;
  document.getElementById('full-preview-mount').replaceChildren();
  status.textContent = 'This preview expired, was revoked, or its project changed. Ask for a new link.';
}
async function request(path, init) {
  const response = await fetch(path, init);
  if (!response.ok && response.status !== 409 && response.status !== 413) { unavailable(); throw new Error('Preview unavailable'); }
  return response;
}
const frames = new ProjectFrames({
  fetch: (path, init) => request(`${base}/frames?${path.split('?')[1]}`, init),
  refresh,
  onChange: render,
});
function options(project) { return previewSequences(project, `${Math.max(0, Number(row.value) - 1)},0`); }
function render(project) {
  if (stopped) return;
  document.querySelector('h1').textContent = project.name || 'Sprite preview';
  row.max = project.grid.rows;
  const nextContext = JSON.stringify([project.cellWidth, project.cellHeight, project.palette, project.background]);
  if (contextKey !== nextContext) {
    contextKey = nextContext;
    preview.setPalette(Object.fromEntries(project.palette.map(({name,color}) => [name,color])));
    preview.setBackground(project.background); preview.setCellSize(project.cellWidth,project.cellHeight);
  }
  preview.setCells(project.cells, { projectId: project.projectId, cellVersions: project.cellVersions, onMissing: (ref, demand) => frames.demand(ref, demand) });
  const choices = options(project), selected = selectPreviewSequence(choices, sequence.value);
  sequence.replaceChildren(...choices.map(choice => Object.assign(document.createElement('option'), { value: choice.id, textContent: choice.label })));
  sequence.value = selected.id;
  const key = JSON.stringify(selected);
  if (sequenceKey !== key) {
    sequenceKey = key; preview.setFrames(selected.frames, selected); preview.setFps(selected.fps);
  }
  preview.fitToMount();
  if (frames.errors.size) status.textContent = 'Some frames could not load. Reload this preview to retry.';
}
async function refresh() {
  if (stopped) return;
  const response = await request(`${base}/summary`);
  const result = await response.json();
  if (!result.ok) { unavailable(); return; }
  if (frames.project?.revision !== result.data.revision) frames.setSummary(result.data);
}
sequence.addEventListener('change', () => render(frames.project));
row.addEventListener('change', () => {
  row.value = String(Math.max(1,Math.min(frames.project.grid.rows,Number(row.value)||1)));
  render(frames.project);
});
try {
  if (token) await request(`${base}/exchange`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({token}) });
  preview.init(); controls.hidden = false;
  status.textContent = 'Shared preview · view only';
  await refresh();
  if (!stopped) timer = setInterval(() => { void refresh().catch(unavailable); }, 5000);
} catch { unavailable(); }
addEventListener('pagehide', () => { clearInterval(timer); preview.pause(); });
addEventListener('pageshow', event => {
  if (!event.persisted || stopped) return;
  void refresh().catch(unavailable);
  clearInterval(timer); timer = setInterval(() => { void refresh().catch(unavailable); }, 5000);
});
