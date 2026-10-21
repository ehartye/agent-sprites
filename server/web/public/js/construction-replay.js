import { element, button, input, field, status, setStatus, pixelImage } from './components.js';

export class ConstructionReplayPanel {
  constructor({ request, getCell, getSessionId, isCurrent = () => true }) { Object.assign(this, { request, getCell, getSessionId, isCurrent }); this.sequence = 0; }
  async render(mount) {
    this.mount = mount; this.sessionId = this.getSessionId();
    mount.replaceChildren(element('h3', 'Construction replay'), element('p', 'Scrub recorded build steps and inspect what each step changed. Your live design and undo history stay independent.', 'workbench-hint'));
    this.status = status('Loading recorded construction…'); this.status.dataset.replayStatus = ''; mount.append(this.status);
    try {
      const result = await this.request('/workbench/replay', undefined, { sessionId: this.sessionId });
      if (!this.isCurrent() || !mount.isConnected) return;
      if (this.getSessionId() !== this.sessionId) throw new Error('The active session changed. Reopen construction replay.');
      this.metadata = result.data;
      if (!this.metadata?.steps?.length) throw new Error('This design has no recorded construction steps.');
      this.controls(); this.load();
    } catch (error) { if (this.isCurrent() && mount.isConnected) setStatus(this.status, error.message, true); }
  }
  controls() {
    const { metadata, mount } = this;
    this.cell = element('select'); this.cell.name = 'replay-cell';
    for (const ref of metadata.cells) { const option = element('option', ref); option.value = ref; this.cell.append(option); }
    this.cell.value = metadata.cells.includes(this.getCell()) ? this.getCell() : metadata.cells[0];
    this.slider = input('replay-step', 0, { type: 'range', min: 0, max: metadata.steps.length - 1, step: 1 });
    this.scale = element('select'); this.scale.name = 'replay-scale';
    for (const n of [1, 2, 4, 8]) { const option = element('option', `${n}×`); option.value = n; this.scale.append(option); }
    const initialScale = [4, 2, 1].find(n => metadata.width * metadata.height * (4 * n * n + 4) <= metadata.limits.maxPixels) ?? 1;
    this.scale.value = String(initialScale);
    this.view = element('select'); this.view.name = 'replay-view';
    for (const [value, label] of [['after', 'After step'], ['before', 'Before step'], ['contribution', 'Pixel contribution'], ['changedMask', 'Changed-pixel mask']]) {
      const option = element('option', label); option.value = value; this.view.append(option);
    }
    const controls = element('div', null, 'replay-controls');
    controls.append(field('Recorded cell', this.cell), field('Construction step', this.slider), field('Zoom', this.scale), field('View', this.view));
    const advance = by => { this.slider.value = Math.max(0, Math.min(metadata.steps.length - 1, Number(this.slider.value) + by)); this.load(); };
    controls.append(button('Previous step', () => advance(-1)), button('Next step', () => advance(1)));
    for (const control of [this.cell, this.scale]) control.addEventListener('change', () => this.load());
    this.slider.addEventListener('input', () => this.refreshCurrent());
    this.view.addEventListener('change', () => this.image.set(this.images?.[this.view.value]));
    this.source = element('pre', null, 'replay-source'); this.source.dataset.replaySource = '';
    this.image = pixelImage('Recorded construction pixels', 'replay-image');
    mount.append(controls, this.source, this.image.node);
  }
  refreshCurrent() {
    if (!this.slider || !this.isCurrent() || !this.mount.isConnected) return;
    clearTimeout(this.scrubTimer);
    this.scrubTimer = setTimeout(() => { if (this.isCurrent() && this.mount.isConnected) this.load(); }, 80);
  }
  async load() {
    const sequence = ++this.sequence, step = Number(this.slider.value);
    setStatus(this.status, `Loading construction step ${step + 1}…`);
    try {
      const result = await this.request('/workbench/replay', { cell: this.cell.value, step, scale: Number(this.scale.value) }, { sessionId: this.sessionId });
      if (sequence !== this.sequence || !this.isCurrent() || !this.mount.isConnected) return;
      if (this.getSessionId() !== this.sessionId) throw new Error('The active session changed. Reopen construction replay.');
      const data = result.data, record = data.step, source = record.source ?? {};
      this.images = result.images; this.image.set(this.images?.[this.view.value]);
      const position = source.line ? `:${source.line}${source.column ? `:${source.column}` : ''}` : source.pointer ?? '';
      this.source.textContent = `Step ${step + 1} / ${this.metadata.steps.length} · operation ${record.operationIndex}\n${record.command} · ${record.label ?? ''}\n${source.path ?? ''}${position}\nSource SHA256: ${source.sha256 ?? 'not recorded'}\nOperation: ${record.id ?? ''}`;
      this.slider.setAttribute('aria-valuetext', `Step ${step + 1}: ${record.label ?? record.command}`);
      const current = data.current.sameState ? 'Live design matches final construction.'
        : data.current.samePixels ? 'Live shape state differs; pixels still match final construction.' : 'Live design differs from final construction.';
      setStatus(this.status, `${data.changedPixels} changed pixels · ${data.clearedPixels ?? 0} cleared pixels. ${current}`);
    } catch (error) { if (sequence === this.sequence && this.isCurrent() && this.mount.isConnected) { this.images = null; this.image.set(null); setStatus(this.status, error.message, true); } }
  }
}
