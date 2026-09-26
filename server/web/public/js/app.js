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

/** Application state */
const state = {
  project: null,
  activeCell: '0,0',
  activeTool: 'point',
  activeColor: null,
  palette: {},
  sessionId: null,
  selectedShape: null,
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
const workbench = new Workbench({
  request: requestApi,
  getCell: () => state.activeCell,
  getColor: () => state.palette[state.activeColor] ?? state.activeColor,
  setColor: setActiveColor,
  getShape: () => state.selectedShape,
  refresh: () => ws.send({ action: 'get_project' }),
  preview: () => document.querySelector('[data-tab="preview"]').click(),
});

async function requestApi(path, body) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(state.sessionId ? { 'X-Sprite-Session': state.sessionId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

/* -- Initialization -- */

function init() {
  const container = document.getElementById('canvas-container');
  editor.init(container, 16);
  workbench.init();
  document.getElementById('save-project-btn').addEventListener('click', () => workbench.run(async () => {
    const result = await requestApi('/session/save', {}); workbench.notify(result.data);
  }));

  ws.connect();
  ws.on('project', onProjectData);
  ws.on('draw', onDrawUpdate);
  ws.on('shape_update', onShapeUpdate);
  ws.on('cell_update', onCellUpdate);
  ws.on('error', onError);
  ws.on('_session', id => { state.sessionId = id; });

  // MCP tool broadcasts use specific event types — request full state refresh
  const refreshEvents = [
    'shape_named', 'shape_moved', 'shape_recolored', 'shape_deleted', 'shape_z', 'shape_resized',
    'shape_flipped', 'shape_rotated',
    'cell_shifted', 'cell_mirrored', 'cell_rotated', 'cell_copied', 'cell_cleared', 'cell_named',
    'cell_cloned_fanout', 'cell_reference',
    'group_created', 'group_cells_added', 'group_cells_removed', 'group_deleted',
    'palette', 'undo', 'redo',
  ];
  for (const evt of refreshEvents) {
    ws.on(evt, () => {
      // Request full project state to resync after MCP mutation
      ws.send({ action: 'get_project' });
    });
  }

  tools.init({
    send: (msg) => ws.send(msg),
    getCellRef: () => state.activeCell,
    getColor: () => state.activeColor,
    getShapes: () => findCell(state.activeCell)?.shapes || [],
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
  initTabs();
  initUndoRedo();

  groupPanel.init({
    onSelect: (groupName) => {
      if (groupName && state.project?.groups?.[groupName]) {
        const frames = state.project.groups[groupName];
        cellNav.setFilter(frames);
        animPreview.setFrames(frames);
        fullPreview.setFrames(frames);
      } else {
        cellNav.setFilter(null);
        animPreview.setFrames([]);
        fullPreview.setFrames([]);
      }
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
        Promise.all(Object.entries(state.allShapeGroups || {})
          .filter(([_, groups]) => groups[name])
          .map(([cell]) => apiPost('/api/group/shape/delete', { cell, name }))
        ).then(refreshShapeGroups);
      } else {
        apiPost('/api/group/shape/delete', { cell: state.activeCell, name })
          .then(refreshShapeGroups);
      }
    },
  });

  cellNav.init({
    onSelect: (ref) => selectCell(ref),
  });

  editor.onPixelClick((x, y) => tools.handleClick(x, y));
  editor.onPixelMove((x, y) => tools.handleMove(x, y));
  editor.onPixelUp((x, y) => tools.handleUp(x, y));
  editor.onCursorMove((x, y, inBounds) => {
    document.getElementById('cursor-pos').textContent = inBounds ? `${x}, ${y}` : '—';
  });
  editor.onZoomChange((zoom) => {
    document.getElementById('zoom-level').textContent = `${zoom}x`;
  });

  updateCellRef();
}

/* -- WebSocket handlers -- */

function onProjectData(data) {
  const changed = workbench.sessionId !== state.sessionId;
  state.project = data;
  if (changed) {
    state.activeCell = '0,0'; state.activeColor = null; state.selectedShape = null;
    tools.setTool(state.activeTool);
    cellNav.setFilter(null);
    animPreview.setFrames([]); fullPreview.setFrames([]);
  }
  workbench.setProject(data, state.sessionId);
  document.getElementById('project-name').textContent = data.name || 'Untitled';

  // Set up palette lookup
  state.palette = {};
  if (data.palette) {
    for (const { name, color } of data.palette) {
      state.palette[name] = color;
    }
  }
  const cellW = data.cellWidth ?? data.cellSize ?? 16;
  const cellH = data.cellHeight ?? data.cellSize ?? cellW;
  editor.setPalette(state.palette);
  editor.setBackground(data.background);
  editor.setCellSize(cellW, cellH);
  shapePanel.setPalette(state.palette);
  cellNav.setPalette(state.palette);
  animPreview.setPalette(state.palette);
  animPreview.setCellSize(cellW, cellH);
  animPreview.setCells(data.cells || {});
  fullPreview.setPalette(state.palette);
  fullPreview.setCellSize(cellW, cellH);
  fullPreview.setCells(data.cells || {});

  // Auto-zoom to fit nicely
  const container = document.getElementById('canvas-container');
  if (changed) {
    const fit = Math.min(container.clientWidth / cellW, container.clientHeight / cellH) * 0.85;
    const idealZoom = fit >= 1 ? Math.floor(fit) : fit;
    editor.panX = 0; editor.panY = 0;
    editor.setZoom(Math.max(0.125, Math.min(24, idealZoom)));
  }

  renderPalette();
  cellNav.setGrid(data.grid.rows, data.grid.cols, cellW, cellH);
  cellNav.setCells(data.cells || {});
  cellNav.render();
  groupPanel.setGroups(data.groups || {});
  selectCell(state.activeCell);
  refreshShapeGroups();
}

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
    cell.shapes.sort((a, b) => a.zIndex - b.zIndex);
  }
  if (data.cell === state.activeCell) {
    editor.setCell(cell);
    refreshShapePanel();
  }
  cellNav.setCells(state.project.cells);
  cellNav.render();
  animPreview.setCells(state.project.cells);
  fullPreview.setCells(state.project.cells);
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
  if (data.cell === state.activeCell) {
    editor.setCell(state.project.cells[data.cell]);
    refreshShapePanel();
  }
  cellNav.setCells(state.project.cells);
  cellNav.render();
  animPreview.setCells(state.project.cells);
  fullPreview.setCells(state.project.cells);
}

function onCellUpdate(data) {
  if (!state.project) return;
  if (data.cell && data.cellData) {
    setCellData(data.cell, data.cellData);
  }
  if (data.cell === state.activeCell) {
    editor.setCell(findCell(state.activeCell));
    refreshShapePanel();
  }
  cellNav.setCells(state.project.cells || {});
  cellNav.render();
  animPreview.setCells(state.project.cells || {});
  fullPreview.setCells(state.project.cells || {});
}

function onError(data) {
  console.error('Server error:', data.message || data);
  workbench.notify(data.message || 'Editing request failed', true);
}

/* -- Shape actions -- */

function handleShapeAction(action, shapeId) {
  const cell = state.activeCell;
  switch (action) {
    case 'rename': {
      const name = prompt('New shape name:');
      if (name !== null) {
        ws.send({ action: 'name_shape', params: { cell, shape_id: shapeId, name } });
      }
      break;
    }
    case 'recolor': {
      const color = prompt('New color (name or #hex):');
      if (color !== null) {
        ws.send({ action: 'recolor_shape', params: { cell, name: shapeId, color } });
      }
      break;
    }
    case 'z_up':
      ws.send({ action: 'shape_z', params: { cell, shape: shapeId, direction: 'up' } });
      break;
    case 'z_down':
      ws.send({ action: 'shape_z', params: { cell, shape: shapeId, direction: 'down' } });
      break;
    case 'delete':
      ws.send({ action: 'delete_shape', params: { cell, name: shapeId } });
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
  if (state.activeCell !== ref) { state.selectedShape = null; tools.setTool(state.activeTool); }
  state.activeCell = ref;
  const cell = findCell(ref);
  editor.setCell(cell);
  editor.setReference(cell?.reference ?? null, ref);
  updateCellRef();
  refreshShapePanel();
  cellNav.setActive(ref);
  animPreview.setActiveCell(ref);
  editor.setOnionSkin(animPreview.getOnionSkinData());
  groupPanel.setActiveCell(ref);
  shapeGroupPanel.setActiveCell(ref);
  refreshShapeGroups();
}

/* -- Shape groups -- */

function apiPost(path, body) {
  return requestApi(path.replace(/^\/api/, ''), body).catch(error => {
    workbench.notify(error.message, true);
    return { ok: false, error: error.message };
  });
}

async function refreshShapeGroups() {
  try {
    const all = await fetch('/api/group/shape/list-all').then(r => r.json());
    if (all.ok) {
      state.allShapeGroups = all.data;
      shapeGroupPanel.setAllCellGroups(all.data);
      const cellGroups = (all.data && state.activeCell) ? (all.data[state.activeCell] || {}) : {};
      shapeGroupPanel.setCellGroups(cellGroups);
    }
  } catch (e) {
    console.error('refreshShapeGroups failed:', e);
  }
}

function updateCellRef() {
  document.getElementById('cell-ref').textContent = `Cell ${state.activeCell}`;
}

function refreshShapePanel() {
  const cell = findCell(state.activeCell);
  shapePanel.setShapes(cell?.shapes || []);
}

/* -- Palette rendering -- */

function renderPalette() {
  const container = document.getElementById('palette-swatches');
  container.innerHTML = '';

  const entries = Object.entries(state.palette);
  if (entries.length === 0) return;

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
  ws.send({ action: 'undo', params: { cell: state.activeCell } });
}

function doRedo() {
  ws.send({ action: 'redo', params: { cell: state.activeCell } });
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
