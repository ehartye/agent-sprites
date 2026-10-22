import { element, button, input, field, status, setStatus } from './components.js';
import { durationFromFps, resolveAnimationLoop, resolveAnimationDirection, resolveGroupFps, resolveFrameTiming } from './shared/timing.js';

const PAGE_SIZE = 64;

/** Timing edits belong to canonical cells; drafts belong to this session and panel. */
export class FrameTimingPanel {
  constructor({ request, getProject, getSessionId, refresh, preview = () => {}, isCurrent = () => true }) {
    Object.assign(this, { request, getProject, getSessionId, refresh, preview, isCurrent });
    this.drafts = new Map();
    this.rowControls = new Map();
    this.page = 0;
    this.viewSequence = 0;
    this.projectRevision = 0;
    this.pending = false;
  }
  render(mount) {
    this.sessionId = this.getSessionId();
    this.root = element('section', null, 'frame-timing');
    this.root.append(element('h3', 'Frame timing'));
    const ownership = element('p', 'Each cell has one duration override shared by every group. Leave milliseconds blank to inherit the group FPS, or the default 8 FPS. Repeated cells appear once, in group order.', 'workbench-hint');
    ownership.dataset.timingOwnership = '';
    this.scope = element('select'); this.scope.name = 'timing-group';
    this.scope.addEventListener('change', () => { this.page = 0; this.viewSequence++; setStatus(this.status, ''); this.paint(); });
    this.groupControls = element('div', null, 'timing-group-controls'); this.groupControls.hidden = true;
    this.fps = input('timing-fps', '', { type: 'number', min: '0', step: 'any' });
    this.loop = input('timing-loop', '', { type: 'checkbox' });
    this.fps.addEventListener('input', () => this.editDraft(`fps:${this.group}`, this.fps.value));
    this.loop.addEventListener('change', () => this.editDraft(`loop:${this.group}`, this.loop.checked));
    this.fpsApply = this.action('Apply FPS', 'fps', () => this.saveFps());
    this.loopApply = this.action('Apply loop', 'loop', () => this.saveLoop());
    this.groupControls.append(field('Group FPS', this.fps), this.fpsApply, field('Loop animation', this.loop), this.loopApply);
    this.playback = element('p', null, 'workbench-hint'); this.playback.dataset.timingPlayback = '';
    this.previewButton = button('Open animation preview', () => this.preview(this.group ? `group:${this.group}` : 'all'));
    this.rows = element('div', null, 'timing-rows');
    const pages = element('div', null, 'timing-pagination');
    this.previous = this.action('Previous cells', 'previous', () => this.movePage(-1));
    this.next = this.action('Next cells', 'next', () => this.movePage(1));
    this.pageLabel = element('span'); this.pageLabel.dataset.timingPage = '';
    pages.append(this.previous, this.pageLabel, this.next);
    this.status = status(); this.status.dataset.timingStatus = '';
    this.root.append(ownership, field('Animation group', this.scope), this.groupControls, this.playback, this.previewButton, this.rows, pages, this.status);
    mount.replaceChildren(this.root);
    this.updateProject(this.getProject());
  }
  action(label, name, handler) {
    const control = button(label, handler); control.dataset.action = `timing-${name}`; return control;
  }
  current(view = this.viewSequence) {
    return view === this.viewSequence && this.isCurrent() && this.root.isConnected && this.getSessionId() === this.sessionId;
  }
  draft(key, canonical) {
    if (!this.drafts.has(key)) this.drafts.set(key, { value: canonical, dirty: false, version: 0 });
    const draft = this.drafts.get(key);
    if (!draft.dirty) draft.value = canonical;
    return draft;
  }
  editDraft(key, value) {
    const draft = this.drafts.get(key);
    if (draft) { draft.value = value; draft.dirty = true; draft.version++; }
  }
  updateProject(project) {
    if (!this.current()) return;
    this.project = project;
    this.projectRevision++;
    if (!project?.grid || !this.sessionId) {
      this.rows.replaceChildren(); this.rowControls.clear();
      setStatus(this.status, 'Open a design to edit frame timing.');
      this.setPendingControls(); return;
    }
    // Only materialized cells can have names. Grid coordinates are generated a page at a time.
    this.names = new Map(Object.entries(project.cells ?? {}).filter(([, cell]) => cell.name).map(([ref, cell]) => [cell.name, ref]));
    const groups = Object.keys(project.groups ?? {});
    const options = ['', ...groups];
    if (JSON.stringify([...this.scope.options].map(option => option.value)) !== JSON.stringify(options)) {
      const selected = this.scope.value;
      this.scope.replaceChildren(...options.map(name => { const option = element('option', name || 'All grid cells'); option.value = name; return option; }));
      this.scope.value = groups.includes(selected) ? selected : '';
      if (selected !== this.scope.value) { this.viewSequence++; this.page = 0; }
    }
    this.paint();
  }
  canonical(ref) {
    const match = typeof ref === 'string' && ref.match(/^(\d+),(\d+)$/);
    const cell = match ? `${Number(match[1])},${Number(match[2])}` : this.names.get(ref);
    if (!cell) throw new Error(`Unknown timing cell: ${ref}`);
    resolveFrameTiming(this.project, cell);
    return cell;
  }
  paint() {
    if (!this.project?.grid || !this.current()) return;
    this.group = this.scope.value || undefined;
    this.groupControls.hidden = !this.group;
    if (this.group) {
      this.fps.value = this.draft(`fps:${this.group}`, String(resolveGroupFps(this.project, this.group))).value;
      this.loop.checked = this.draft(`loop:${this.group}`, resolveAnimationLoop(this.project, this.group)).value;
    }
    this.playback.textContent = this.group ? `Playback: ${resolveAnimationDirection(this.project, this.group)}. Group FPS applies to cells without an override.` : 'Grid cells inherit 8 FPS when no duration override is set.';
    this.occurrences = new Map();
    if (this.group) {
      for (const ref of this.project.groups[this.group]) {
        const cell = this.canonical(ref);
        this.occurrences.set(cell, (this.occurrences.get(cell) ?? 0) + 1);
      }
      this.groupCells = [...this.occurrences.keys()];
    }
    const { rows, cols } = this.project.grid;
    this.total = this.group ? this.groupCells.length : rows * cols;
    this.page = Math.max(0, Math.min(this.page, Math.ceil(this.total / PAGE_SIZE) - 1));
    const start = this.page * PAGE_SIZE;
    const refs = this.group ? this.groupCells.slice(start, start + PAGE_SIZE)
      : Array.from({ length: Math.min(PAGE_SIZE, this.total - start) }, (_, index) => `${Math.floor((start + index) / cols)},${(start + index) % cols}`);
    const oldRefs = [...this.rowControls.keys()];
    if (JSON.stringify(refs) !== JSON.stringify(oldRefs)) {
      this.viewSequence++;
      setStatus(this.status, '');
      this.rows.replaceChildren(); this.rowControls.clear();
      for (const cell of refs) this.addRow(cell);
    }
    for (const [cell, controls] of this.rowControls) {
      const name = this.project.cells?.[cell]?.name;
      controls.name.textContent = name ? `${cell} · ${name}` : cell;
      const count = this.occurrences.get(cell) ?? 1;
      controls.occurrences.textContent = count > 1 ? `${count} occurrences · One shared override` : '';
      const timing = resolveFrameTiming(this.project, cell, { group: this.group });
      const source = timing.source === 'frame' ? 'Cell override' : timing.source === 'group' ? `Group FPS (${timing.fps})` : 'Default (8 FPS)';
      controls.effective.textContent = `${timing.ms} ms · ${source}`;
      controls.input.value = this.draft(`cell:${cell}`, String(this.project.frameDurations?.[cell] ?? '')).value;
    }
    if (!refs.length) this.rows.replaceChildren(element('p', 'This group has no cells.', 'workbench-hint'));
    this.pageLabel.textContent = this.total ? `${start + 1}–${Math.min(start + PAGE_SIZE, this.total)} of ${this.total} cells` : '0 cells';
    this.setPendingControls();
  }
  addRow(cell) {
    const node = element('div', null, 'timing-row'); node.dataset.timingCell = cell;
    const name = element('strong'), effective = element('p', null, 'timing-effective'), occurrences = element('small');
    const details = element('div', null, 'timing-cell-details'); details.append(name, effective, occurrences);
    const control = input('timing-ms', '', { type: 'number', min: '1', step: '1', placeholder: 'Inherit', 'aria-label': `${cell} override milliseconds` });
    control.addEventListener('input', () => this.editDraft(`cell:${cell}`, control.value));
    const controls = { node, name, effective, occurrences, input: control };
    controls.apply = this.action('Apply', 'apply', () => this.saveDuration(cell, controls));
    controls.clear = this.action('Clear', 'clear', () => this.saveDuration(cell, controls, true));
    node.append(details, field('Override ms', control), controls.apply, controls.clear);
    this.rowControls.set(cell, controls); this.rows.append(node);
  }
  movePage(by) {
    if (this.pending || !this.current()) return;
    this.page += by; this.viewSequence++; this.paint();
  }
  setPendingControls() {
    const disabled = this.pending || !this.sessionId || !this.project?.grid;
    this.scope.disabled = disabled;
    for (const control of this.root.querySelectorAll('button')) control.disabled = disabled;
    this.previous.disabled = disabled || this.page === 0;
    this.next.disabled = disabled || (this.page + 1) * PAGE_SIZE >= this.total;
  }
  saveDuration(cell, controls, clear = false) {
    if (this.rowControls.get(cell) !== controls) return;
    this.attempt(() => {
      const draft = this.drafts.get(`cell:${cell}`);
      const ms = clear || draft.value.trim() === '' ? null : Number(draft.value);
      if (ms !== null && (!Number.isSafeInteger(ms) || ms < 1)) throw new Error('Use positive whole milliseconds, or leave blank to inherit.');
      return this.save('/cell/duration', { cell, ms, ...(this.group ? { group: this.group } : {}) }, draft);
    });
  }
  saveFps() {
    this.attempt(() => {
      const draft = this.drafts.get(`fps:${this.group}`), fps = Number(draft.value);
      durationFromFps(fps);
      return this.save('/group/cell/fps', { name: this.group, fps }, draft);
    });
  }
  saveLoop() {
    this.attempt(() => {
      const draft = this.drafts.get(`loop:${this.group}`);
      return this.save('/group/cell/loop', { name: this.group, loop: draft.value }, draft);
    });
  }
  async attempt(action) {
    if (this.pending || !this.sessionId || !this.current()) return;
    const view = this.viewSequence;
    try { await action(); }
    catch (error) { if (this.current(view)) setStatus(this.status, error.message, true); }
  }
  async save(path, body, draft) {
    const view = this.viewSequence, version = draft.version;
    this.pending = true; this.setPendingControls(); setStatus(this.status, 'Saving timing…');
    try {
      await this.request(path, body, { sessionId: this.sessionId });
      if (!this.current(view)) return;
      const revision = this.projectRevision;
      const result = await this.request('/workbench/project-summary', undefined, { sessionId: this.sessionId });
      if (!this.current(view)) return;
      // The acknowledged draft is saved even when a newer live project wins.
      // Edits made after submission remain unsaved and must survive either response.
      if (draft.version === version) draft.dirty = false;
      // A newer live project packet wins over a read that started before it arrived.
      if (revision === this.projectRevision) {
        this.updateProject(result.data);
      } else this.paint();
      setStatus(this.status, 'Timing saved.'); this.refresh();
    } finally {
      this.pending = false;
      if (this.current()) this.setPendingControls();
    }
  }
}
