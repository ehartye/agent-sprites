/**
 * App entry — wires canvas editor, WebSocket, tools, panels, and cell nav.
 */

import { CanvasEditor } from './canvas-editor.js';
import { WebSocketClient } from './websocket.js';
import { ToolManager } from './tools.js';
import { ShapePanel, GroupPanel, ShapeGroupPanel } from './panels.js';
import { CellNavigator } from './cell-nav.js';
import { AnimationPreview } from './animation.js';
import { Workbench } from './workbench.js';
import { cellsForView, isTracedShape } from './view-visibility.js';
import { previewSequences, selectPreviewSequence } from './preview-sequences.js';
import { createRedrawScheduler } from './redraw-scheduler.js';
import { ProjectFrames } from './project-frames.js';
import { LiveMutations } from './live-mutations.js';

const visibility = { trace: true, reference: true };
const viewCells = () => cellsForView(state.project?.cells ?? {}, visibility);
const viewCell = ref => viewCells()[ref] ?? null;

/** Application state */
const state = {
  project: null,
  activeCell: '0,0',
  activeTool: 'point',
  activeColor: null,
  palette: {},
  sessionId: null,
  selectedShape: null,
  previewSequence: 'row',
  previewSequenceKey: null,
};

const editor = new CanvasEditor();
const ws = new WebSocketClient();
const tools = new ToolManager();
const shapePanel = new ShapePanel();
const groupPanel = new GroupPanel();
const shapeGroupPanel = new ShapeGroupPanel();
const cellNav = new CellNavigator();
const animPreview = new AnimationPreview({ mountId: 'anim-panel', size: 128, showOnionSkin: true });
const fullPreview = new AnimationPreview({
  mountId: 'full-preview-mount',
  size: 512,
  showOnionSkin: false,
  responsive: true,
  title: 'Full Preview',
});
const frames = new ProjectFrames({ onChange: onProjectData, refresh: refreshProject });
const mutations = new LiveMutations({ getPins: () => frames.pins, refresh: refreshProject });
let refreshPending = null;
async function refreshProject() {
  if (!refreshPending) {
    const generation = frames.generation;
    // Discovery follows the active session, including our own session/open.
    // A newer live identity wins over an older HTTP snapshot.
    refreshPending = rawRequest('/workbench/project-summary', undefined, { sessionId: null }).then(result => {
      if (generation === frames.generation || (result.data.sessionId === frames.pins.sessionId && result.data.projectId === frames.pins.projectId)) frames.setSummary(result.data);
      return frames.project;
    }).finally(() => { refreshPending = null; });
  }
  return refreshPending;
}
function editable() { return Boolean(state.project && frames.status(state.activeCell).state === 'ready'); }
function sendEdit(message) {
  if (!editable()) { workbench.notify('Wait for the selected frame to finish loading before editing.', true); return; }
  const captured = structuredClone(message);
  void mutations.enqueue(pins => ws.request({ ...captured, ...pins })).catch(error => workbench.notify(error.message, true));
}
const workbench = new Workbench({
  request: requestApi,
  getCell: () => state.activeCell,
  getColor: () => state.palette[state.activeColor] ?? state.activeColor,
  setColor: setActiveColor,
  getShape: () => state.selectedShape,
  refresh: refreshProject,
  preview: sequenceId => {
    if(typeof sequenceId==='string'){state.previewSequence=sequenceId;syncPreviewSequence();}
    document.querySelector('[data-tab="preview"]').click();
  },
});

async function rawRequest(path, body, { sessionId = state.sessionId, projectId, revision } = {}) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'X-Sprite-Session': sessionId } : {}),
      ...(projectId ? { 'X-Sprite-Project': projectId, 'X-Sprite-Revision': String(revision) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.error ?? `Request failed (${response.status})`), { status: response.status });
  return result;
}
const readOperations = new Set(['/cell/ascii-read', '/cell/compose-plan', '/cell/view', '/view/stack', '/view/sheet', '/workbench/replay', '/workbench/map-operations', '/workbench/build', '/workbench/trace', '/workbench/verify', '/workbench/atlas-proof']);
async function requestApi(path, body, options = {}) {
  if (path === '/workbench/project-summary') return { ok: true, data: await refreshProject() };
  if (body === undefined || readOperations.has(path)) return rawRequest(path, body, options);
  if (/^\/(draw|shape\/|group\/shape\/|cell\/(surface|lighting|layers|ascii-patch|compose|shift|mirror|copy|clear|rotate|reference|undo|redo)(\/|$))/.test(path) && !editable()) {
    throw new Error('Wait for the selected frame to finish loading before editing.');
  }
  const captured = structuredClone(body);
  return mutations.enqueue(async pins => {
    const result = await rawRequest(path, captured, pins);
    await refreshProject();
    return result;
  }, options.sessionId, { allowUnbound: ['/session/new', '/session/open', '/session/open-session'].includes(path) });
}

/* -- Initialization -- */

function init() {
  const container = document.getElementById('canvas-container');
  editor.init(container, 16);
  workbench.init();
  for (const [id, key] of [['show-traced-baseline', 'trace'], ['show-reference-image', 'reference']]) {
    document.getElementById(id).addEventListener('change', event => {
      visibility[key] = event.target.checked;
      state.selectedShape = null;
      tools.setTool(state.activeTool);
      editor.setSelectedShape(null);
      shapePanel.setSelected(null);
      const cells = viewCells();
      const context = rasterContext();
      cellNav.setCells(cells, context); cellNav.render();
      animPreview.setCells(cells, context); fullPreview.setCells(cells, context);
      selectCell(state.activeCell);
    });
  }
  document.getElementById('save-project-btn').addEventListener('click', () => workbench.run(async () => {
    const result = await requestApi('/session/save', {}); workbench.notify(result.data);
  }));

  ws.connect();
  ws.on('project', onProjectData);
  ws.on('project_summary', data => frames.setSummary(data));
  ws.on('draw', onDrawUpdate);
  ws.on('shape_update', onShapeUpdate);
  ws.on('cell_update', onCellUpdate);
  ws.on('error', onError);
  ws.on('_session', id => { state.sessionId = id; });

  // Legacy broadcasts use specific event types; resync through metadata only.
  const refreshEvents = [
    'shape_named', 'shape_moved', 'shape_recolored', 'shape_deleted', 'shape_z', 'shape_resized',
    'shape_flipped', 'shape_rotated',
    'cell_shifted', 'cell_mirrored', 'cell_rotated', 'cell_copied', 'cell_cleared', 'cell_named',
    'cell_cloned_fanout', 'cell_reference',
    'group_created', 'group_cells_added', 'group_cells_removed', 'group_deleted',
    'palette', 'undo', 'redo', 'animation_timing',
  ];
  for (const evt of refreshEvents) {
    ws.on(evt, () => {
      void refreshProject().catch(onError);
    });
  }

  tools.init({
    send: sendEdit,
    getCellRef: () => state.activeCell,
    getColor: () => state.activeColor,
    getShapes: () => viewCell(state.activeCell)?.shapes || [],
    getCellSize: () => ({width:state.project?.cellWidth,height:state.project?.cellHeight}),
  });
  tools.onToolChange((toolId) => { state.activeTool = toolId; });
  tools.onSelectionChange((shape) => { state.selectedShape = shape; editor.setSelectedShape(shape); shapePanel.setSelected(shape?.id); });
  tools.onDragPreview((shape, dx, dy) => { editor.setDragPreview(shape, dx, dy); });

  shapePanel.init({
    onSelect: (shapeId) => {
      state.selectedShape = findCell(state.activeCell)?.shapes?.find(shape => shape.id === shapeId) ?? null;
      editor.setSelectedShape(state.selectedShape);
      shapePanel.setSelected(shapeId);
    },
    onAction: (action, shapeId) => {
      handleShapeAction(action, shapeId);
    },
  });

  animPreview.init();
  animPreview.onOnionSkin((data) => {
    editor.setOnionSkin(data);
  });
  fullPreview.init();
  document.getElementById('preview-sequence').addEventListener('change', event => {
    state.previewSequence = event.target.value;
    syncPreviewSequence();
  });
  initTabs();
  initUndoRedo();

  groupPanel.init({
    onSelect: (groupName) => {
      state.previewSequence = groupName ? `group:${groupName}` : 'all';
      syncPreviewSequence();
    },
    onCreate: () => {
      const name = prompt('Group name:');
      if (name) {
        workbench.run(() => requestApi('/group/cell/create', { name, cells: [] }));
      }
    },
    onDelete: (name) => {
      workbench.run(() => requestApi('/group/cell/delete', { name }));
    },
    onAddCell: (name, cell) => {
      apiPost('/api/group/cell/add', { name, cells: [cell] });
    },
    onRemoveCell: (name, cell) => {
      apiPost('/api/group/cell/remove', { name, cells: [cell] });
    },
  });

  shapeGroupPanel.init({
    onCreate: (name, shapes) => {
      apiPost('/api/group/shape/create', { cell: state.activeCell, name, shapes })
        .then(refreshShapeGroups);
    },
    onCreatePattern: (name, pattern) => {
      apiPost('/api/group/shape/create', { all_cells: true, pattern, name })
        .then(refreshShapeGroups);
    },
    onAddShape: (name, shapes) => {
      apiPost('/api/group/shape/add', { cell: state.activeCell, name, shapes })
        .then(refreshShapeGroups);
    },
    onRemoveShape: (name, shapes) => {
      apiPost('/api/group/shape/remove', { cell: state.activeCell, name, shapes })
        .then(refreshShapeGroups);
    },
    onDelete: (name, { allCells }) => {
      if (allCells) {
        // Delete in every cell that has it
        // Enqueue every captured target now; the shared lane advances pins and
        // rejects remaining old-session intent if the project changes midqueue.
        const requests = Object.entries(state.allShapeGroups || {})
          .filter(([_, groups]) => Object.hasOwn(groups, name))
          .map(([cell]) => apiPost('/api/group/shape/delete', { cell, name }));
        Promise.all(requests).then(refreshShapeGroups);
      } else {
        apiPost('/api/group/shape/delete', { cell: state.activeCell, name })
          .then(refreshShapeGroups);
      }
    },
  });

  cellNav.init({
    onSelect: (ref) => selectCell(ref),
  });

  editor.onPixelClick((x, y) => { if (editable()) tools.handleClick(x, y); });
  editor.onPixelMove((x, y) => { if (editable()) tools.handleMove(x, y); });
  editor.onPixelUp((x, y) => { if (editable()) tools.handleUp(x, y); });
  editor.onCursorMove((x, y, inBounds) => {
    document.getElementById('cursor-pos').textContent = inBounds ? `${x}, ${y}` : '—';
  });
  editor.onZoomChange((zoom) => {
    document.getElementById('zoom-level').textContent = `${zoom}x`;
  });

  updateCellRef();
}

/* -- WebSocket handlers -- */

function rasterContext() {
  return { projectId: state.project?.projectId, cellVersions: state.project?.cellVersions,
    viewKey: JSON.stringify(visibility), onMissing: (ref, demand) => frames.demand(ref, demand) };
}

function onProjectData(data) {
  editor.batchUpdate(() => applyProjectData(data));
}

function applyProjectData(data) {
  const changed = state.project?.projectId !== data.projectId || workbench.sessionId !== data.sessionId;
  state.project = data;
  state.sessionId = data.sessionId ?? state.sessionId;
  if (changed) {
    state.previewSequence = 'row'; state.previewSequenceKey = null;
    visibility.trace = true; visibility.reference = true;
    state.activeCell = '0,0'; state.activeColor = null; state.selectedShape = null;
    state.selectedInput = undefined; state.renderContextKey = null;
    tools.setTool(state.activeTool); cellNav.setFilter(null);
    animPreview.stop(); fullPreview.stop();
  }
  document.getElementById('project-name').textContent = data.name || 'Untitled';
  const cellW = data.cellWidth ?? data.cellSize ?? 16, cellH = data.cellHeight ?? data.cellSize ?? cellW;
  const key = JSON.stringify([cellW, cellH, data.palette, data.background]);
  if (key !== state.renderContextKey) {
    state.renderContextKey = key;
    state.palette = Object.fromEntries((data.palette ?? []).map(({ name, color }) => [name, color]));
    // Clear old geometry before any context setter can repaint it.
    editor.batchUpdate(() => {
      editor.setCell(null); state.selectedInput = null;
      editor.setReference(null, state.activeCell); editor.setOnionSkin(null);
      editor.setPalette(state.palette); editor.setBackground(data.background); editor.setCellSize(cellW, cellH);
    });
    shapePanel.setPalette(state.palette);
    cellNav.setBackground(data.background); cellNav.setPalette(state.palette);
    for (const preview of [animPreview, fullPreview]) {
      preview.setPalette(state.palette); preview.setBackground(data.background); preview.setCellSize(cellW, cellH);
    }
    renderPalette();
    if (changed) {
      const container = document.getElementById('canvas-container');
      const fit = Math.min(container.clientWidth / cellW, container.clientHeight / cellH) * 0.85;
      editor.panX = 0; editor.panY = 0;
      editor.setZoom(Math.max(0.125, Math.min(24, fit >= 1 ? Math.floor(fit) : fit)));
    }
  }
  const cells = viewCells(), context = rasterContext();
  cellNav.setGrid(data.grid.rows, data.grid.cols, cellW, cellH);
  cellNav.setCells(cells, context); cellNav.render();
  animPreview.setCells(cells, context); fullPreview.setCells(cells, context);
  groupPanel.setGroups(data.groups || {});
  selectCell(state.activeCell);
  workbench.setProject(data, state.sessionId);
}
// Edits arrive one broadcast per shape; views refresh once per animation frame
// for every cell touched since the last one.
const redraw = createRedrawScheduler(refs => {
  if (!state.project) return;
  for (const ref of refs) state.project.cells?.[ref]?.shapes?.sort((a, b) => a.zIndex - b.zIndex);
  const cells = viewCells();
  if (refs.has(state.activeCell)) {
    editor.setCell(cells[state.activeCell] ?? null);
    shapePanel.setShapes(cells[state.activeCell]?.shapes || []);
  }
  cellNav.setCells(cells);
  cellNav.refresh(refs);
  animPreview.setCells(cells);
  fullPreview.setCells(cells);
  workbench.refreshProjectPanels();
});

function onDrawUpdate(data) {
  if (!state.project) return;
  // Ensure cell exists in local state (empty cells aren't in project JSON)
  if (!state.project.cells) state.project.cells = {};
  if (!state.project.cells[data.cell]) {
    state.project.cells[data.cell] = { shapes: [] };
  }
  const cell = state.project.cells[data.cell];
  if (data.shape) {
    if (!cell.shapes) cell.shapes = [];
    cell.shapes.push(data.shape);
  }
  redraw.mark(data.cell);
}

function onShapeUpdate(data) {
  if (!state.project) return;
  if (!state.project.cells) state.project.cells = {};
  if (data.cell && data.shapes) {
    if (!state.project.cells[data.cell]) {
      state.project.cells[data.cell] = { shapes: [] };
    }
    state.project.cells[data.cell].shapes = data.shapes;
  }
  redraw.mark(data.cell);
}

function onCellUpdate(data) {
  if (!state.project) return;
  if (data.cell && data.cellData) {
    setCellData(data.cell, data.cellData);
  }
  redraw.mark(data.cell);
}

function onError(data) {
  console.error('Server error:', data.message || data);
  workbench.notify(data.message || 'Editing request failed', true);
}

/* -- Shape actions -- */

function handleShapeAction(action, shapeId) {
  if (!editable()) return;
  const cell = state.activeCell;
  switch (action) {
    case 'rename': {
      const name = prompt('New shape name:');
      if (name !== null) {
        sendEdit({ action: 'name_shape', params: { cell, shape_id: shapeId, name } });
      }
      break;
    }
    case 'recolor': {
      const color = prompt('New color (name or #hex):');
      if (color !== null) {
        sendEdit({ action: 'recolor_shape', params: { cell, name: shapeId, color } });
      }
      break;
    }
    case 'z_up':
      sendEdit({ action: 'shape_z', params: { cell, shape: shapeId, direction: 'up' } });
      break;
    case 'z_down':
      sendEdit({ action: 'shape_z', params: { cell, shape: shapeId, direction: 'down' } });
      break;
    case 'delete':
      sendEdit({ action: 'delete_shape', params: { cell, name: shapeId } });
      break;
  }
}

/* -- Cell helpers -- */

function findCell(ref) {
  if (!state.project || !state.project.cells) return null;
  return state.project.cells[ref] || null;
}

function setCellData(ref, data) {
  if (!state.project || !state.project.cells) return;
  state.project.cells[ref] = data;
}

function selectCell(ref) {
  const switched = state.activeCell !== ref;
  state.activeCell = ref;
  frames.select(ref);
  const cell = viewCell(ref);
  const ready = Array.isArray(cell?.shapes);
  const input = ready ? cell : null;
  const version = state.project?.cellVersions?.[ref];
  const selectionKey = JSON.stringify([state.sessionId, state.project?.projectId, ref, version, visibility]);
  if (state.selectedInput !== input || state.selectedKey !== selectionKey) {
    state.selectedInput = input; state.selectedKey = selectionKey;
    state.selectedShape = null;
    editor.batchUpdate(() => {
      tools.setTool(state.activeTool); editor.setSelectedShape(null); editor.setDragPreview(null); editor.setOnionSkin(null);
      editor.setCell(input);
      editor.setReference(ready ? cell.reference ?? null : null, ref, { ...frames.pins, cellVersion: version });
    });
    refreshShapePanel();
  }
  const traceToggle = document.getElementById('show-traced-baseline');
  const referenceToggle = document.getElementById('show-reference-image');
  traceToggle.checked = visibility.trace;
  referenceToggle.checked = visibility.reference;
  traceToggle.disabled = !Object.values(state.project?.cells ?? {}).some(c => c.shapes?.some(isTracedShape));
  referenceToggle.disabled = !findCell(ref)?.reference;
  updateCellRef();
  for (const id of ['undo-btn', 'redo-btn']) document.getElementById(id).disabled = !ready;
  if (switched || state.navActive !== ref) { cellNav.setActive(ref); state.navActive = ref; }
  animPreview.setActiveCell(ref);
  syncPreviewSequence();
  editor.setOnionSkin(animPreview.getOnionSkinData());
  groupPanel.setActiveCell(ref);
  shapeGroupPanel.setActiveCell(ref);
  refreshShapeGroups();
  for (const selector of ['#tool-buttons button', '#shape-items button', '#shape-group-items button', '.group-create-btn', '.group-create-pattern-btn']) {
    document.querySelectorAll(selector).forEach(control => { control.disabled = !ready; });
  }
  workbench.refreshProjectPanels();
}

function syncPreviewSequence() {
  const choices = previewSequences(state.project, state.activeCell);
  const selected = selectPreviewSequence(choices, state.previewSequence);
  const select = document.getElementById('preview-sequence');
  select.replaceChildren(...choices.map(choice => {
    const option = document.createElement('option');
    option.value = choice.id; option.textContent = `${choice.label} · ${choice.frames.length} frame${choice.frames.length === 1 ? '' : 's'}`;
    return option;
  }));
  if (!selected) return;
  state.previewSequence = selected.id; select.value = selected.id;
  groupPanel.setActiveGroup(selected.group ?? null);
  cellNav.setFilter(selected.group ? selected.frames : null);
  const key = JSON.stringify([selected.id, selected.frames, selected.fps, selected.durations, selected.loop]);
  if (key !== state.previewSequenceKey) {
    animPreview.setFrames(selected.frames, selected); fullPreview.setFrames(selected.frames, selected);
    animPreview.setFps(selected.fps); fullPreview.setFps(selected.fps);
    state.previewSequenceKey = key;
  }
  editor.setOnionSkin(animPreview.getOnionSkinData());
}

/* -- Shape groups -- */

function apiPost(path, body) {
  return requestApi(path.replace(/^\/api/, ''), body).catch(error => {
    workbench.notify(error.message, true);
    return { ok: false, error: error.message };
  });
}

function refreshShapeGroups() {
  const index = state.project?.shapeGroups ?? {};
  state.allShapeGroups = Object.fromEntries(Object.entries(index).map(([ref, names]) =>
    [ref, Array.isArray(names) ? Object.fromEntries(names.map(name => [name, []])) : names]));
  shapeGroupPanel.setAllCellGroups(state.allShapeGroups);
  shapeGroupPanel.setCellGroups(frames.groups(state.activeCell));
}

function updateCellRef() {
  const status = frames.status(state.activeCell);
  document.getElementById('cell-ref').textContent = `Cell ${state.activeCell}${status.state === 'ready' ? '' : status.state === 'error' ? ` · ${status.error}` : ' · Loading…'}`;
  document.getElementById('canvas-container').setAttribute('aria-busy', String(status.state === 'loading'));
}

function refreshShapePanel() {
  const cell = viewCell(state.activeCell);
  shapePanel.setShapes(cell?.shapes || []);
}

/* -- Palette rendering -- */

function renderPalette() {
  const container = document.getElementById('palette-swatches');
  container.innerHTML = '';

  const entries = Object.entries(state.palette);
  if (entries.length === 0) {
    if (!state.activeColor) setActiveColor('#000000', '#000000');
    return;
  }

  if (!state.activeColor && entries.length > 0) {
    setActiveColor(entries[0][0], entries[0][1]);
  }

  for (const [name, color] of entries) {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    if (name === state.activeColor) swatch.classList.add('active');
    swatch.style.backgroundColor = color;
    swatch.title = `${name} (${color})`;
    swatch.dataset.name = name;
    swatch.addEventListener('click', () => setActiveColor(name, color));
    container.appendChild(swatch);
  }
}

function setActiveColor(name, color) {
  state.activeColor = name;
  document.getElementById('active-color-swatch').style.backgroundColor = color;
  document.getElementById('active-color-name').textContent = name;

  document.querySelectorAll('#palette-swatches .swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.name === name);
  });
}

/* -- Theme -- */

function initTheme() {
  const saved = localStorage.getItem('sprites-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sprites-theme', next);
  updateThemeButton(next);
  editor.render();
  cellNav.render();
}

function updateThemeButton(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '◑';
}

/* -- Undo / Redo -- */

function initUndoRedo() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.addEventListener('click', () => doUndo());
  if (redoBtn) redoBtn.addEventListener('click', () => doRedo());

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      doRedo();
    }
  });
}

function doUndo() {
  sendEdit({ action: 'undo', params: { cell: state.activeCell } });
}

function doRedo() {
  sendEdit({ action: 'redo', params: { cell: state.activeCell } });
}

/* -- Tabs -- */

function initTabs() {
  const buttons = document.querySelectorAll('#center-tabs .tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('#center-panel .tab-content').forEach(el => {
        el.classList.toggle('active', el.id === `center-tab-${target}`);
      });
      if (target === 'preview') {
        // Canvas may have laid out at 0 width while hidden — refit now.
        fullPreview.fitToMount();
      }
    });
  });
}

/* -- Boot -- */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  init();
});
