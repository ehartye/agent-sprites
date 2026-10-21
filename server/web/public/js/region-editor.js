import { element, button, input, field, status, setStatus } from './components.js';

/** Text edits use the canonical server renderer and the same cell API as CLI. */
export class RegionEditor {
  constructor({ request, getCell, getProject, getSessionId, refresh }) {
    Object.assign(this, { request, getCell, getProject, getSessionId, refresh });
    this.loaded = null;
    this.revision = 0;
    this.busy = false;
  }

  render(mount) {
    const project = this.getProject();
    const width = project?.cellWidth ?? project?.cellSize ?? 32;
    const height = project?.cellHeight ?? project?.cellSize ?? width;
    const w = Math.min(width, 64), h = Math.min(height, Math.floor(4096 / w));
    this.root = element('section', null, 'ascii-editor');
    this.root.append(element('h3', 'ASCII region'), element('p', 'Read a small region, edit its pixels as text, then apply one undoable patch. Shapes remain editable.', 'workbench-hint'));
    this.target = element('p', `Selected cell: ${this.getCell()}`, 'ascii-target');
    this.root.append(this.target);
    const bounds = element('div', null, 'ascii-bounds');
    this.bounds = Object.fromEntries(Object.entries({ x: 0, y: 0, w, h }).map(([name, value]) => {
      const control = input(name, value, { type: 'number', min: name === 'x' || name === 'y' ? 0 : 1, step: 1, required: '' });
      control.addEventListener('input', () => {
        this.revision++;
        this.loaded = null;
        this.updateApply();
        setStatus(this.feedback, 'Region changed. Read it before applying a patch.');
      });
      bounds.append(field({ x: 'Left (x)', y: 'Top (y)', w: 'Width', h: 'Height' }[name], control));
      return [name, control];
    }));
    this.root.append(bounds, element('p', 'Up to 4096 pixels per read or patch. Regions must fit entirely inside the cell.', 'workbench-hint'));
    this.readButton = button('Read region', () => this.read());
    this.readButton.dataset.action = 'ascii-read';
    this.root.append(this.readButton);
    const legend = element('p', null, 'ascii-legend');
    for (const [symbol, meaning] of [['.', 'keep existing pixel'], ['_', 'erase pixel'], ['?', 'unmapped color; replace before applying']]) {
      const entry = element('span'); entry.append(element('code', symbol), document.createTextNode(` ${meaning}`)); legend.append(entry);
    }
    this.root.append(legend);
    this.rows = element('textarea');
    this.rows.name = 'rows'; this.rows.rows = 12; this.rows.spellcheck = false; this.rows.wrap = 'off';
    this.rows.setAttribute('autocapitalize', 'off'); this.rows.setAttribute('autocomplete', 'off');
    this.rows.addEventListener('input', () => this.updateApply());
    this.root.append(field('Pixel rows (spaces are preserved)', this.rows));
    this.colors = element('textarea'); this.colors.name = 'colors'; this.colors.rows = 5; this.colors.value = '{}'; this.colors.spellcheck = false;
    this.root.append(field('Character colors (JSON)', this.colors), element('p', 'Map each printable character to a hex color or a palette name. The symbols ., _ and ? are reserved. A space can be a color key.', 'workbench-hint'));
    this.unmapped = element('details', null, 'ascii-unmapped');
    this.unmapped.hidden = true;
    this.root.append(this.unmapped);
    this.prefix = input('prefix', 'patch', { maxlength: 80, pattern: '[A-Za-z0-9_-]{1,80}', required: '' });
    this.root.append(field('Shape name prefix (letters, digits, _ or -)', this.prefix));
    this.applyButton = button('Apply patch', () => this.patch());
    this.applyButton.dataset.action = 'ascii-patch'; this.applyButton.disabled = true;
    this.feedback = status(project ? 'Read a region to begin.' : 'Open or create a design to read a region.');
    this.readButton.disabled = !project || !this.getSessionId();
    this.root.append(this.applyButton, this.feedback);
    mount.append(this.root);
    return this;
  }

  updateApply() {
    this.applyButton.disabled = this.busy || !this.loaded || !this.rows.value.length || this.rows.value.includes('?');
  }

  setBusy(busy) {
    this.busy = busy;
    this.root.setAttribute('aria-busy', String(busy));
    this.readButton.disabled = busy || !this.getProject() || !this.getSessionId();
    this.updateApply();
  }

  context() {
    const bounds = Object.fromEntries(Object.entries(this.bounds).map(([name, control]) => {
      const value = control.valueAsNumber;
      if (!control.checkValidity() || !Number.isSafeInteger(value)) throw new Error('Use whole numbers for the region bounds.');
      return [name, value];
    }));
    return { cell: this.getCell(), sessionId: this.getSessionId(), revision: this.revision, ...bounds };
  }

  assertCurrent(context) {
    let error;
    if (this.getSessionId() !== context.sessionId) error = 'The active session changed. Read the region again.';
    else if (this.getCell() !== context.cell) error = 'The selected cell changed. Read the region again.';
    else if (this.revision !== context.revision) error = 'Region changed. Read it again before applying a patch.';
    if (error) { this.loaded = null; throw new Error(error); }
  }

  colorMap() {
    const colors = JSON.parse(this.colors.value);
    if (!colors || Array.isArray(colors) || typeof colors !== 'object') throw new Error('Character colors must be a JSON object.');
    return colors;
  }

  async read() {
    if (this.busy) return;
    this.loaded = null;
    this.setBusy(true);
    setStatus(this.feedback, 'Reading region…');
    try {
      const context = this.context();
      const { cell, x, y, w, h, sessionId } = context;
      const colors = this.colorMap();
      const result = await this.request('/cell/ascii-read', { cell, x, y, w, h, ...(Object.keys(colors).length ? { colors } : {}) }, { sessionId });
      if (!this.root.isConnected) return;
      this.assertCurrent(context);
      const data = result.data;
      this.rows.value = data.rows.join('\n');
      this.colors.value = JSON.stringify(data.colors, null, 2);
      this.loaded = context;
      this.target.textContent = `Cell ${cell} · (${data.x}, ${data.y}) · ${data.w} × ${data.h} pixels`;
      this.unmapped.replaceChildren(element('summary', `${data.unmapped.length} unmapped pixels`));
      this.unmapped.hidden = !data.unmapped.length;
      const list = element('ul');
      for (const pixel of data.unmapped) list.append(element('li', `${pixel.x},${pixel.y} · ${pixel.rgba}`));
      this.unmapped.append(list);
      setStatus(this.feedback, data.unmapped.length ? `Read ${data.w} × ${data.h} pixels. Replace every ? with a mapped character, . to keep it, or _ to erase it.` : `Read ${data.w} × ${data.h} pixels. Edit the rows, then apply the patch.`);
    } catch (error) {
      if (this.root.isConnected) setStatus(this.feedback, error.message, true);
    } finally { this.setBusy(false); }
  }

  async patch() {
    if (this.busy || !this.loaded) return;
    this.setBusy(true);
    setStatus(this.feedback, 'Applying patch…');
    try {
      const context = this.loaded;
      this.assertCurrent(context);
      const { cell, x, y, sessionId } = context;
      const result = await this.request('/cell/ascii-patch', { cell, x, y, rows: this.rows.value, colors: this.colorMap(), prefix: this.prefix.value }, { sessionId });
      await this.refresh();
      if (!this.root.isConnected) return;
      this.assertCurrent(context);
      setStatus(this.feedback, `Applied patch: ${result.data.changed} pixels changed. Undo restores the region in one step.`);
    } catch (error) {
      if (this.root.isConnected) setStatus(this.feedback, error.message, true);
    } finally { this.setBusy(false); }
  }
}
