import { element, button, input, field, status, setStatus, pixelImage } from './components.js';
import { validateSurface, validateLighting, SURFACE_LIMITS } from './shared/surface-model.js';

const json = value => JSON.stringify(value, null, 2);
const object = text => {
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Use a JSON object.');
  return value;
};
const numeric = control => {
  if (!control.value.trim() || !Number.isFinite(Number(control.value))) throw new Error('Use a finite number.');
  return Number(control.value);
};

/** Canonical saved state comes from the project; drafts stay scoped to this panel/session. */
export class SurfacePanel {
  constructor({ request, getProject, getCell, getShape = () => null, getSessionId, refresh, isCurrent = () => true }) {
    Object.assign(this, { request, getProject, getCell, getShape, getSessionId, refresh, isCurrent });
    this.drafts = new Map(); this.selections = new Map(); this.viewSequence = 0;
    this.projectRevision = 0; this.previewSequence = 0; this.pending = false;
  }
  render(mount) {
    this.sessionId = this.getSessionId();
    this.root = element('section', null, 'surface-panel');
    this.target = element('p', '', 'ascii-target'); this.target.dataset.surfaceCell = '';
    const ownership = element('p', 'Normals, materials and attached lamps belong to the selected shape. Lighting belongs to this cell and shades its visible shapes. Hidden shapes disable their lamps; a visible transparent shape can carry a lamp.', 'workbench-hint');
    ownership.dataset.surfaceOwnership = '';
    this.shape = this.select('surface-shape', []);
    this.shape.addEventListener('change', () => {
      this.selections.set(this.cell, this.shape.value); this.viewSequence++; this.invalidatePreview();
      setStatus(this.status, ''); this.paint();
    });
    this.surfaceSection = element('section', null, 'surface-section');
    this.emptyShapes = element('p', 'This cell has no shapes. Add a shape to author a surface or attach lamps.', 'workbench-hint'); this.emptyShapes.dataset.surfaceEmpty = '';
    this.surfaceSection.append(element('h3', 'Shape surface'), field('Selected shape', this.shape), this.emptyShapes);
    this.mode = this.select('normal-mode', [['', 'No authored normal'], ['flat', 'Flat vector'], ['bevel', 'Bevel'], ['dome', 'Dome'], ['luma', 'Luminance relief'], ['grid', 'Direction grid']]);
    this.mode.addEventListener('change', () => {
      const mode = this.mode.value, draft = this.surfaceDraft;
      for (const key of draft.raw.keys()) if (key.startsWith('normal-')) { draft.raw.delete(key); draft.errors.delete(key); }
      this.editObject('surface', 'normal-mode', mode, value => {
        if (!mode) delete value.normal;
        else value.normal = mode === 'flat' ? { mode, vector: [0, 0, 1] } : mode === 'grid' ? { mode, x: 0, y: 0, rows: ['5'] } : { mode, ...(mode === 'bevel' ? { width: 2 } : {}), depth: 1 };
      });
    });
    this.depth = this.number('normal-depth', 'Depth', { min: 0, max: 32 }, 'surface', (value, number) => { value.normal.depth = number; });
    this.width = this.number('normal-width', 'Bevel width', { min: 1, max: 2048 }, 'surface', (value, number) => { value.normal.width = number; });
    this.vector = input('normal-vector', '', { 'aria-label': 'Flat normal vector as JSON', maxlength: 256 });
    this.vector.addEventListener('input', () => this.editObject('surface', this.vector.name, this.vector.value, value => { value.normal.vector = JSON.parse(this.vector.value); }));
    this.gridX = this.number('normal-x', 'Grid origin x', { step: 1 }, 'surface', (value, number) => { value.normal.x = number; });
    this.gridY = this.number('normal-y', 'Grid origin y', { step: 1 }, 'surface', (value, number) => { value.normal.y = number; });
    this.gridRows = this.textarea('normal-rows', 8, 131072);
    this.gridRows.wrap = 'off';
    this.gridRows.addEventListener('input', () => this.editObject('surface', this.gridRows.name, this.gridRows.value, value => { value.normal.rows = this.gridRows.value.split(/\r?\n/); }));
    this.flatFields = element('div', null, 'normal-fields'); this.flatFields.append(field('Vector [x, y, z] · +z toward viewer', this.vector));
    this.reliefFields = element('div', null, 'surface-controls normal-fields'); this.reliefFields.append(this.depth.label, this.width.label);
    this.gridFields = element('div', null, 'normal-fields');
    const origin = element('div', null, 'surface-controls'); origin.append(this.gridX.label, this.gridY.label);
    this.gridFields.append(origin, field('Direction rows · spaces are preserved', this.gridRows), element('p', 'Global cell coordinates. Equal-width rows, up to 65,536 pixels. Numpad 1–9 points in screen directions; qwe/asd/zxc are softer. 0, dot and space are flat.', 'workbench-hint'));
    const materials = element('div', null, 'surface-checks');
    this.materials = {};
    for (const [key, label] of [['solid', 'Solid · attenuates propagated light'], ['wall', 'Wall · stops direct sky seeding'], ['unlit', 'Unlit · preserves visible color']]) {
      const control = input(`material-${key}`, '', { type: 'checkbox' }); this.materials[key] = control;
      control.addEventListener('change', () => this.editObject('surface', control.name, control.checked, value => { (value.material ??= {})[key] = control.checked; }));
      materials.append(field(label, control));
    }
    this.lamps = this.textarea('surface-lamps', 6, 262144);
    this.lamps.addEventListener('input', () => this.editObject('surface', this.lamps.name, this.lamps.value, value => { value.lamps = JSON.parse(this.lamps.value); }));
    const lampActions = element('div', null, 'workbench-actions');
    lampActions.append(this.action('Add lamp', 'lamp-add', () => this.editLamps(false)), this.action('Remove last lamp', 'lamp-remove', () => this.editLamps(true)));
    this.surfaceJson = this.jsonEditor('surface', 'Complete surface JSON', 1048576);
    const surfaceActions = element('div', null, 'workbench-actions');
    this.saveSurface = this.action('Save surface', 'save', () => this.attempt(() => this.save('surface')));
    this.clearSurface = this.action('Clear surface', 'clear', () => this.attempt(() => this.save('surface', true)));
    surfaceActions.append(this.saveSurface, this.clearSurface);
    this.surfaceSection.append(field('Normal preset', this.mode), this.flatFields, this.reliefFields, this.gridFields, materials,
      element('p', 'Walls still pass propagated light. Material flags remain independent of the normal preset.', 'workbench-hint'),
      field('Attached lamps (JSON array)', this.lamps), element('p', 'Up to 64 named lamps. Each lamp uses global x/y, radius, power, z and an exact hex color. Add supplies editable defaults.', 'workbench-hint'), lampActions, this.surfaceJson.details, surfaceActions);

    this.lightingSection = element('section', null, 'surface-section');
    this.enabled = input('lighting-enabled', '', { type: 'checkbox' });
    this.enabled.addEventListener('change', () => { this.lightingDraft.enabled = this.enabled.checked; this.touch(this.lightingDraft); });
    this.policy = this.select('lighting-policy', [['', 'Choose a palette policy'], ['rgb', 'RGB · keep shaded RGB colors'], ['nearest', 'Nearest · map to opaque palette colors']]);
    this.policy.addEventListener('change', () => this.editObject('lighting', this.policy.name, this.policy.value, value => { value.palettePolicy = this.policy.value; }));
    this.ambient = this.number('lighting-ambient', 'Ambient power', { min: 0, max: 8 }, 'lighting', (value, number) => { value.ambient = number; });
    this.lightCell = this.number('lighting-cell', 'Light grid size', { min: 1, max: 64, step: 1 }, 'lighting', (value, number) => { value.cell = number; });
    this.smooth = input('lighting-smooth', '', { type: 'checkbox' });
    this.smooth.addEventListener('change', () => this.editObject('lighting', this.smooth.name, this.smooth.checked, value => { value.smooth = this.smooth.checked; }));
    this.lightingJson = this.jsonEditor('lighting', 'Complete lighting JSON', 16384);
    const common = element('div', null, 'surface-controls'); common.append(this.ambient.label, this.lightCell.label, field('Smooth light grid', this.smooth));
    const policyHint = element('p', 'Choose a palette policy explicitly. RGB keeps shaded colors outside the palette; nearest uses only opaque palette colors. Alpha and unlit colors stay unchanged.', 'workbench-hint'); policyHint.dataset.lightingPolicy = '';
    const lightActions = element('div', null, 'workbench-actions');
    this.saveLighting = this.action('Save lighting', 'lighting-save', () => this.attempt(() => this.save('lighting')));
    this.clearLighting = this.action('Disable lighting', 'lighting-clear', () => this.attempt(() => this.save('lighting', true)));
    lightActions.append(this.saveLighting, this.clearLighting);
    this.lightingSection.append(element('h3', 'Cell lighting'), field('Enable lighting', this.enabled), field('Palette policy', this.policy), policyHint, common,
      element('p', 'Complete JSON also edits block (0–1), shape (round/diamond), ambientColor, sky (0–8), skyColor, skyReach (positive, up to 8192), skyDir ([x,y]) and relief (0–8). Colors use exact hex. Common controls preserve those values.', 'workbench-hint'), this.lightingJson.details, lightActions);

    this.previewSection = element('section', null, 'surface-preview');
    this.channel = this.select('surface-channel', [['color', 'Color'], ['normal', 'Normal map'], ['light', 'Light map']]);
    this.channel.addEventListener('change', () => this.invalidatePreview());
    this.proof = pixelImage('Saved cell lighting channel');
    this.previewButton = this.action('Preview saved channel', 'preview', () => this.preview());
    this.previewNote = element('p', 'Previews show saved state. Save drafts first to see their effect.', 'workbench-hint'); this.previewNote.dataset.previewNote = '';
    const previewControls = element('div', null, 'replay-controls'); previewControls.append(field('Saved channel', this.channel), this.previewButton);
    this.previewSection.append(element('h3', 'Saved cell preview'), previewControls, this.previewNote, this.proof.node);
    this.status = status(); this.status.dataset.surfaceStatus = '';
    this.root.append(this.target, ownership, this.surfaceSection, this.lightingSection, this.previewSection, this.status);
    mount.replaceChildren(this.root); this.updateProject(this.getProject());
  }
  select(name, options) {
    const control = element('select'); control.name = name;
    for (const [value, label] of options) { const option = element('option', label); option.value = value; control.append(option); }
    return control;
  }
  textarea(name, rows, maxLength) {
    const control = element('textarea'); Object.assign(control, { name, rows, maxLength, spellcheck: false });
    control.setAttribute('autocapitalize', 'off'); control.setAttribute('autocomplete', 'off'); return control;
  }
  number(name, label, attributes, kind, change) {
    const control = input(name, '', { type: 'number', step: 'any', ...attributes });
    control.addEventListener('input', () => this.editObject(kind, name, control.value, value => change(value, numeric(control))));
    return { control, label: field(label, control) };
  }
  jsonEditor(kind, label, limit) {
    const control = this.textarea(`${kind}-json`, 10, limit), details = element('details', null, 'surface-advanced');
    details.append(element('summary', label), field(label, control));
    control.addEventListener('input', () => {
      const draft = this[`${kind}Draft`]; draft.text = control.value; draft.raw.clear(); draft.errors.clear(); this.touch(draft); this.paintDraft(kind);
    });
    return { control, details };
  }
  action(label, name, handler) { const control = button(label, handler); control.dataset.action = `surface-${name}`; return control; }
  current(view = this.viewSequence) {
    return view === this.viewSequence && this.isCurrent() && this.root.isConnected && this.sessionId === this.getSessionId();
  }
  canonicalCell(project) {
    const ref = this.getCell(), match = typeof ref === 'string' && ref.match(/^(\d+),(\d+)$/);
    if (match) {
      const [row, col] = match.slice(1).map(Number);
      if (row < project.grid.rows && col < project.grid.cols) return `${row},${col}`;
    }
    return Object.entries(project.cells ?? {}).find(([, cell]) => cell.name === ref)?.[0];
  }
  updateProject(project) {
    if (!this.current()) return;
    this.project = project; this.projectRevision++; this.invalidatePreview();
    const cell = project?.grid && this.canonicalCell(project);
    if (cell !== this.cell) { this.cell = cell; this.viewSequence++; setStatus(this.status, ''); }
    if (!cell || !this.sessionId) {
      this.target.textContent = 'Open a design and select a cell to edit lighting.';
      this.surfaceSection.hidden = true; this.lightingSection.hidden = true; this.setPendingControls(); return;
    }
    this.surfaceSection.hidden = false; this.lightingSection.hidden = false;
    this.loaded = !project.projectId || Array.isArray(project.cells?.[cell]?.shapes);
    if (!this.loaded) {
      this.target.textContent = `Cell ${cell} · Loading…`;
      this.emptyShapes.hidden = true;
      this.setPendingControls(); return;
    }
    this.paint();
  }
  draft(key, canonical, enabled = true) {
    if (!this.drafts.has(key)) this.drafts.set(key, { text: '', dirty: false, version: 0, raw: new Map(), errors: new Map() });
    const draft = this.drafts.get(key);
    if (!draft.dirty) { draft.text = json(canonical ?? {}); draft.enabled = enabled; draft.raw.clear(); draft.errors.clear(); }
    return draft;
  }
  paint() {
    if (!this.cell || !this.current() || this.loaded === false) return;
    const cell = this.project.cells?.[this.cell] ?? {}, shapes = cell.shapes ?? [];
    this.target.textContent = `Cell ${this.cell}${cell.name ? ` · ${cell.name}` : ''}`;
    const selected = this.selections.get(this.cell) ?? this.getShape()?.id;
    const next = shapes.some(shape => shape.id === selected) ? selected : shapes[0]?.id ?? '';
    if (this.shapeId !== next) { this.shapeId = next; this.viewSequence++; this.invalidatePreview(); }
    this.selections.set(this.cell, next);
    this.emptyShapes.hidden = shapes.length > 0;
    this.shape.replaceChildren(...shapes.map(shape => {
      const option = element('option', `${shape.name || 'Unnamed'} · ${shape.id}${shape.visible === false ? ' · hidden' : ''}`); option.value = shape.id; return option;
    }));
    this.shape.value = next;
    this.surfaceDraft = this.draft(`shape:${this.cell}:${next}`, shapes.find(shape => shape.id === next)?.params?.surface);
    this.lightingDraft = this.draft(`cell:${this.cell}`, cell.lighting, cell.lighting != null);
    this.paintDraft('surface'); this.paintDraft('lighting'); this.setPendingControls();
  }
  paintDraft(kind) {
    const draft = this[`${kind}Draft`]; this[`${kind}Json`].control.value = draft.text;
    if (kind === 'lighting') this.enabled.checked = draft.enabled;
    let value;
    try { value = object(draft.text); } catch { return; }
    const set = (control, fallback) => {
      const value = draft.raw.has(control.name) ? draft.raw.get(control.name) : fallback;
      if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value ?? '';
    };
    if (kind === 'surface') {
      const normal = value.normal ?? {};
      set(this.mode, normal.mode ?? ''); set(this.depth.control, normal.depth ?? 1); set(this.width.control, normal.width ?? 2);
      set(this.vector, json(normal.vector ?? [0, 0, 1])); set(this.gridX.control, normal.x ?? 0); set(this.gridY.control, normal.y ?? 0);
      set(this.gridRows, Array.isArray(normal.rows) ? normal.rows.join('\n') : '5');
      this.flatFields.hidden = normal.mode !== 'flat'; this.reliefFields.hidden = !['bevel', 'dome', 'luma'].includes(normal.mode);
      this.width.label.hidden = normal.mode !== 'bevel'; this.gridFields.hidden = normal.mode !== 'grid';
      for (const [key, control] of Object.entries(this.materials)) set(control, value.material?.[key] ?? false);
      set(this.lamps, json(value.lamps ?? []));
    } else {
      set(this.policy, value.palettePolicy ?? ''); set(this.ambient.control, value.ambient ?? 0);
      set(this.lightCell.control, value.cell ?? 4); set(this.smooth, value.smooth ?? false);
    }
  }
  touch(draft) {
    draft.dirty = true; draft.version++; this.invalidatePreview(); setStatus(this.status, 'Unsaved draft. Save to update the preview.');
  }
  editObject(kind, name, raw, mutate) {
    const draft = this[`${kind}Draft`]; draft.raw.set(name, raw); this.touch(draft);
    try {
      const value = object(draft.text); mutate(value); draft.text = json(value); draft.errors.delete(name);
      this.paintDraft(kind);
    } catch (error) { draft.errors.set(name, error.message); setStatus(this.status, error.message, true); }
  }
  editLamps(remove) {
    if (!this.current() || !this.shapeId || this.pending) return;
    try {
      if (this.surfaceDraft.errors.has('surface-lamps')) throw new Error('Fix the lamp JSON before adding or removing lamps.');
      const value = object(this.surfaceDraft.text), lamps = value.lamps ?? [];
      if (!Array.isArray(lamps)) throw new Error('Lamps must be a JSON array.');
      if (remove) lamps.pop();
      else {
        if (lamps.length >= SURFACE_LIMITS.maxLamps) throw new Error('At most 64 lamps per shape.');
        let index = 1; while (lamps.some(lamp => lamp.name === `lamp-${index}`)) index++;
        lamps.push({ name: `lamp-${index}`, x: 0, y: 0, radius: 32, power: 1, z: 8, color: '#ffffff' });
      }
      this.surfaceDraft.raw.delete('surface-lamps');
      this.editObject('surface', 'surface-lamps', json(lamps), value => { value.lamps = lamps; });
    } catch (error) { setStatus(this.status, error.message, true); }
  }
  invalidatePreview() { this.previewSequence++; this.proof?.set(null); }
  setPendingControls() {
    const disabled = this.pending || !this.cell || !this.sessionId || this.loaded === false;
    this.root.setAttribute('aria-busy', String(this.pending));
    for (const control of this.root.querySelectorAll('button')) control.disabled = disabled;
    for (const control of [this.saveSurface, this.clearSurface, ...this.surfaceSection.querySelectorAll('[data-action^="surface-lamp-"]')]) control.disabled = disabled || !this.shapeId;
    for (const control of this.surfaceSection.querySelectorAll('input, textarea, select')) control.disabled = !this.cell || !this.sessionId || !this.shapeId || this.loaded === false;
    for (const control of this.lightingSection.querySelectorAll('input, textarea, select')) control.disabled = !this.cell || !this.sessionId || this.loaded === false;
    this.shape.disabled = disabled || !this.shapeId;
    this.previewButton.disabled = disabled || this.previewPending;
  }
  async attempt(action) {
    if (!this.current() || this.pending || !this.cell || !this.sessionId || this.loaded === false) return;
    const view = this.viewSequence;
    try { await action(); } catch (error) { if (this.current(view)) setStatus(this.status, error.message, true); }
  }
  async save(kind, clear = false) {
    const draft = this[`${kind}Draft`], version = draft.version, view = this.viewSequence;
    let value = null;
    if (!clear) {
      if (draft.errors.size) throw new Error(draft.errors.values().next().value);
      if (kind === 'lighting' && !draft.enabled) throw new Error('Enable lighting before saving, or use Disable lighting.');
      value = (kind === 'surface' ? validateSurface : validateLighting)(object(draft.text));
    }
    if (kind === 'surface' && !this.shapeId) return;
    const body = { cell: this.cell, ...(kind === 'surface' ? { shapeId: this.shapeId, surface: value } : { lighting: value }) };
    this.pending = true; this.invalidatePreview(); this.setPendingControls(); setStatus(this.status, `Saving ${kind}…`);
    try {
      await this.request(`/cell/${kind}`, body, { sessionId: this.sessionId });
      if (!this.current(view)) return;
      const revision = this.projectRevision;
      const result = await this.request('/workbench/project-summary', undefined, { sessionId: this.sessionId });
      if (!this.current(view)) return;
      // An acknowledged unchanged draft clears even when a newer live packet wins the read race.
      if (draft.version === version) draft.dirty = false;
      if (revision === this.projectRevision) this.updateProject(result.data); else this.paint();
      setStatus(this.status, kind === 'surface' ? 'Surface saved.' : 'Lighting saved.'); this.refresh();
    } finally { this.pending = false; if (this.current()) this.setPendingControls(); }
  }
  async preview() {
    if (!this.current() || this.pending || this.previewPending || !this.cell || !this.sessionId) return;
    const view = this.viewSequence, cell = this.cell, channel = this.channel.value;
    this.invalidatePreview(); const sequence = this.previewSequence;
    this.previewPending = true; this.setPendingControls(); setStatus(this.status, 'Rendering saved channel…');
    try {
      const result = await this.request(`/cell/surface-preview?${new URLSearchParams({ cell, channel })}`, undefined, { sessionId: this.sessionId });
      if (!this.current(view) || sequence !== this.previewSequence) return;
      if (result.data.cell !== cell || result.data.channel !== channel) throw new Error('Preview target changed. Render it again.');
      this.proof.set(result.data.image);
      if (this.proof.node.hidden) throw new Error('The server did not return a PNG preview.');
      this.proof.node.alt = `Saved ${channel} channel · cell ${cell}`; setStatus(this.status, 'Saved channel preview ready.');
    } catch (error) { if (this.current(view) && sequence === this.previewSequence) setStatus(this.status, error.message, true); }
    finally { this.previewPending = false; if (this.current()) this.setPendingControls(); }
  }
}
