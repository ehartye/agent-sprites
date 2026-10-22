import { commandRequest } from './command-catalog.js';
import { element, button, input, field, setStatus, jsonReport, animationProof } from './components.js';
import { RegionEditor } from './region-editor.js';
import { ConstructionReplayPanel } from './construction-replay.js';
import { FrameTimingPanel } from './frame-timing.js';
import { SurfacePanel } from './surface-panel.js';
import { ProjectImportController } from './project-import.js';
import { ProjectBuildController } from './project-build.js';

const buildPhases = {
  prepare: 'Preparing build', generator: 'Reading generator output', 'generator-parse': 'Reading generated operations',
  operations: 'Applying operations', render: 'Rendering sprites', verify: 'Checking build', artifacts: 'Writing build files',
  prepublication: 'Checking files before publishing', committing: 'Publishing build files', committed: 'Build files published; waiting for report',
};
function buildMessage(update) {
  if (update.message || update.error) return update.message ?? update.error;
  if (update.state === 'complete') return 'Build completed.';
  if (update.state === 'failed') return 'Build failed. See the report below.';
  const phase = buildPhases[update.phase] ?? 'Building project';
  if (Number.isFinite(update.bytes)) return `${phase} · ${update.bytes.toLocaleString()} bytes read`;
  if (Number.isFinite(update.completed) && Number.isFinite(update.total)) return `${phase} · ${update.completed.toLocaleString()} of ${update.total.toLocaleString()} operations`;
  return `${phase}…`;
}
export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type }));
  const link = element('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class Workbench {
  constructor({ request, getCell, getColor, setColor, getShape = () => null, refresh, preview = () => {} }) {
    Object.assign(this, { request, getCell, getColor, setColor, getShape, refresh, preview });
    this.project = null;
    this.sessionId = null;
    this.tab = null;
    this.sequence = 0;
    this.commands = [];
  }
  init() {
    this.mount = document.getElementById('workbench-mount');
    this.mount.className = 'workbench-drawer';
    this.mount.hidden = true;
    this.mount.setAttribute('aria-label', 'Design workbench');
    this.mount.append(element('h2', 'Design workbench'));
    this.mount.append(button('Close', () => this.close(), 'drawer-close'));
    this.nav = element('nav', null, 'workbench-tabs');
    for (const tab of ['sessions', 'palettes', 'ascii', 'replay', 'timing', 'lighting', 'tools', 'handoff']) {
      const btn = button(tab === 'ascii' ? 'ASCII' : tab[0].toUpperCase() + tab.slice(1), () => this.show(tab));
      btn.dataset.panel = tab;
      this.nav.append(btn);
    }
    this.mount.append(this.nav);
    this.body = element('div', null, 'workbench-content');
    this.mount.append(this.body);
    document.querySelectorAll('[data-workbench]').forEach(btn => btn.addEventListener('click', () => this.show(btn.dataset.workbench)));
    this.mount.addEventListener('keydown', event => { if (event.key === 'Escape') this.close(); });
  }
  close() {
    this.cancelImport();
    this.disposeBuild();
    this.mount.hidden = true;
    this.sequence++;
    this.opener?.focus();
  }
  notify(message, error = false) {
    const status = document.getElementById('workbench-status');
    setStatus(status, message, error);
  }
  async run(action) {
    try { return await action(); }
    catch (error) { this.notify(error.message, true); }
  }
  async show(tab) {
    this.cancelImport();
    this.disposeBuild();
    if (this.mount.hidden) this.opener = document.activeElement;
    this.mount.hidden = false;
    this.tab = tab;
    const sequence = ++this.sequence;
    this.nav.querySelectorAll('button').forEach(btn => { btn.classList.toggle('active', btn.dataset.panel === tab); btn.setAttribute('aria-pressed', String(btn.dataset.panel === tab)); });
    this.body.replaceChildren(element('p', 'Loading…'));
    try {
      let data;
      if (tab === 'sessions') data = (await this.request('/session/list?limit=1000')).data;
      if (tab === 'palettes') data = (await this.request('/workbench/palettes')).data;
      if (tab === 'tools') data = (await this.request('/workbench/commands')).data;
      if (sequence !== this.sequence) return;
      this.body.replaceChildren();
      if (tab === 'sessions') this.renderSessions(data);
      if (tab === 'palettes') this.renderPalettes(data);
      if (tab === 'tools') this.renderTools(data);
      if (tab === 'ascii') new RegionEditor({ request: this.request, getCell: this.getCell, getProject: () => this.project, getSessionId: () => this.sessionId, refresh: this.refresh }).render(this.body);
      if (tab === 'replay') {
        this.replayPanel = new ConstructionReplayPanel({ request: this.request, getCell: this.getCell, getSessionId: () => this.sessionId, isCurrent: () => sequence === this.sequence && this.tab === 'replay' });
        this.replayPanel.render(this.body);
      }
      if (tab === 'timing') {
        this.timingPanel = new FrameTimingPanel({ request: this.request, getProject: () => this.project, getSessionId: () => this.sessionId, refresh: this.refresh, preview: sequenceId => { this.preview(sequenceId); this.close(); }, isCurrent: () => sequence === this.sequence && this.tab === 'timing' });
        this.timingPanel.render(this.body);
      }
      if (tab === 'lighting') {
        this.lightingPanel = new SurfacePanel({ request: this.request, getProject: () => this.project, getCell: this.getCell, getShape: this.getShape, getSessionId: () => this.sessionId, refresh: this.refresh, isCurrent: () => sequence === this.sequence && this.tab === 'lighting' });
        this.lightingPanel.render(this.body);
      }
      if (tab === 'handoff') this.renderHandoff();
    } catch (error) { if (sequence === this.sequence) this.body.replaceChildren(element('p', error.message, 'error')); }
  }
  setProject(project, sessionId) {
    const changed = this.sessionId !== sessionId || (this.project?.projectId !== undefined && project?.projectId !== undefined && this.project.projectId !== project.projectId);
    if (this.sessionId !== sessionId || this.project?.projectId !== project?.projectId) this.disposeBuild();
    this.project = project;
    this.sessionId = sessionId;
    document.getElementById('session-indicator')?.replaceChildren(document.createTextNode(sessionId ? `Shared session · ${sessionId.slice(-8)}` : 'No active session'));
    if (this.importer?.isActivating()) return;
    if (!this.mount.hidden && (changed || this.tab === 'sessions')) this.show(this.tab);
    else this.refreshProjectPanels();
  }
  cancelImport() {
    const importer = this.importer; this.importer = null;
    if (importer) void importer.dispose().catch(error => this.notify(error.message, true));
  }
  disposeBuild() {
    this.builder?.dispose();
    this.builder = null;
  }
  refreshProjectPanels() {
    this.refreshReplay();
    if (!this.mount.hidden && this.tab === 'timing') this.timingPanel?.updateProject(this.project);
    if (!this.mount.hidden && this.tab === 'lighting') this.lightingPanel?.updateProject(this.project);
  }
  refreshReplay() { if (!this.mount.hidden && this.tab === 'replay') this.replayPanel?.refreshCurrent(); }
  renderSessions(sessions) {
    this.body.append(element('p', 'Everyone connected to this server follows the active session. Copy a design before exploring a variation.', 'workbench-hint'));
    const actions = element('div', null, 'workbench-actions');
    actions.append(button('New design', () => { this.show('tools').then(() => this.selectCommand('new')); }));
    actions.append(button('Copy for edits', () => this.run(async () => {
      const name = prompt('Name the editable copy:', `${this.project?.name ?? 'Design'} copy`);
      if (!name) return;
      await this.request('/session/copy', { name });
      this.notify(`Created independent copy “${name}”.`);
      this.refresh();
      await this.show('sessions');
    })));
    this.body.append(actions);
    const search = element('input'); search.type = 'search'; search.placeholder = 'Find a saved design'; search.setAttribute('aria-label', 'Find a saved design');
    this.body.append(search);
    const list = element('div', null, 'session-list');
    this.body.append(list);
    const render = () => {
      list.replaceChildren();
      const needle = search.value.toLowerCase();
      for (const session of sessions.filter(item => `${item.project_name} ${item.id}`.toLowerCase().includes(needle))) {
        const row = button('', () => this.run(async () => {
          await this.request('/session/open-session', { ref: session.id });
          this.notify(`Opened “${session.project_name}”.`);
          this.refresh();
        }), 'session-entry');
        row.classList.toggle('active', session.id === this.sessionId);
        row.append(element('strong', session.project_name), element('span', `${new Date(session.updated_at).toLocaleString()} · ${session.id}`));
        list.append(row);
      }
      if (!list.children.length) list.append(element('p', 'No matching sessions. Create a design or import a project.'));
    };
    search.addEventListener('input', render); render();
  }
  renderPalettes(data) {
    if (data.skinTones?.supported) {
      const section = element('section', null, 'skin-tone-picker');
      section.append(element('h3', 'Skin tone'), element('p', 'Apply one tone across every pose. Eyes keep their colors.', 'workbench-hint'));
      const choices = element('div', null, 'skin-tone-choices');
      const sessionId = data.skinTones.sessionId ?? this.sessionId;
      for (const tone of data.skinTones.presets) {
        const choice = button('', () => this.run(async () => {
          choices.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
          try {
            await this.request('/workbench/skin-tone', { tone: tone.id }, { sessionId });
            this.notify(`Applied ${tone.name} skin tone to every pose.`);
            await this.refresh();
            if (this.sessionId === sessionId && this.tab === 'palettes') await this.show('palettes');
          } finally { choices.querySelectorAll('button').forEach(btn => { btn.disabled = false; }); }
        }), 'skin-tone-choice');
        choice.dataset.skinTone = tone.id;
        choice.disabled = !sessionId;
        choice.setAttribute('aria-pressed', String(data.skinTones.selected === tone.id));
        const ramp = element('span', null, 'skin-tone-ramp'); ramp.setAttribute('aria-hidden', 'true');
        for (const role of ['outline', 'shadow', 'base', 'highlight']) {
          const sample = element('span'); sample.style.backgroundColor = tone.colors[role]; ramp.append(sample);
        }
        choice.append(ramp, element('span', tone.name)); choices.append(choice);
      }
      section.append(choices); this.body.append(section);
    }
    this.body.append(element('p', 'Pick any color across the full palette library. Library colors draw as exact hex values; your existing artwork keeps its colors.', 'workbench-hint'));
    const custom = element('label', 'Custom color');
    const input = element('input'); input.type = 'color'; input.value = /^#[\da-f]{6}$/i.test(this.getColor()) ? this.getColor() : '#ffccaa';
    input.addEventListener('input', () => this.setColor(input.value, input.value)); custom.append(input); this.body.append(custom);
    const families = [...(data.current.length ? [{ name: 'This design', colors: data.current }] : []), ...data.presets];
    for (const family of families) {
      const section = element('section', null, 'palette-family');
      section.append(element('h3', `${family.name} · ${family.colors.length}`));
      const colors = element('div', null, 'library-swatches');
      for (const { name, color } of family.colors) {
        const swatch = button('', () => { this.setColor(color, color); this.notify(`${family.name} / ${name} · ${color}`); }, 'library-swatch');
        swatch.style.backgroundColor = color;
        swatch.title = `${family.name} / ${name} · ${color}`;
        swatch.setAttribute('aria-label', swatch.title);
        colors.append(swatch);
      }
      section.append(colors); this.body.append(section);
    }
  }
  renderTools(commands) {
    this.commands = commands;
    const search = input('tool-search', '', { type: 'search', placeholder: 'Find a tool or CLI command', 'aria-label': 'Find a tool or CLI command' });
    this.body.append(search);
    const browser = element('div', null, 'command-browser');
    const list = element('div', null, 'command-list');
    this.commandDetail = element('div', null, 'command-detail');
    browser.append(list, this.commandDetail); this.body.append(browser);
    const render = () => {
      list.replaceChildren();
      const needle = search.value.toLowerCase();
      let category;
      for (const command of this.commands.filter(command => `${command.id} ${command.label} ${command.category}`.toLowerCase().includes(needle))) {
        if (category !== command.category) { category = command.category; list.append(element('h3', category)); }
        const item = button(command.label, () => this.selectCommand(command.id)); item.title = command.id; item.dataset.command = command.id;
        list.append(item);
      }
    };
    search.addEventListener('input', render); render();
    const initial = this.commands.find(command => command.id === 'draw rect') ?? this.commands[0];
    if (initial) this.selectCommand(initial.id);
    else this.commandDetail.append(element('p', 'No tools are available from this server.'));
  }
  selectCommand(id) {
    const command = this.commands.find(command => command.id === id);
    if (!command) return;
    this.disposeBuild();
    const commandIdentity = this.commandIdentity = Symbol(id), sequence = this.sequence;
    const selectionCurrent = () => this.commandIdentity === commandIdentity && sequence === this.sequence && this.tab === 'tools' && !this.mount.hidden;
    const isBuild = command.method === 'POST' && command.path?.replace(/^\/api/, '') === '/workbench/build';
    this.commandDetail.replaceChildren(element('h3', command.label), element('code', command.id));
    this.body.querySelectorAll('[data-command]').forEach(btn => btn.classList.toggle('active', btn.dataset.command === id));
    if (command.description) this.commandDetail.append(element('p', command.description, 'workbench-hint'));
    if (command.cli) {
      const snippet = element('textarea'); snippet.readOnly = true; snippet.value = command.cli; snippet.setAttribute('aria-label', 'Terminal command');
      this.commandDetail.append(snippet, button('Copy command', () => this.run(async () => { await navigator.clipboard.writeText(command.cli); this.notify('Terminal command copied.'); })));
      return;
    }
    if (command.action === 'preview') { this.commandDetail.append(button('Open preview', () => { this.preview(); this.close(); })); return; }
    if (command.action === 'import') { this.commandDetail.append(button('Choose project file', () => this.show('handoff'))); return; }
    if (command.action === 'batch') { this.renderBatch(this.commandDetail); return; }
    const values = structuredClone(command.body);
    if ('cell' in values) values.cell = this.getCell();
    if ('from' in values && typeof values.from === 'string') values.from = this.getCell();
    if ('from_cell' in values) values.from_cell = this.getCell();
    if ('color' in values) values.color = this.getColor() ?? values.color;
    const selected = this.getShape();
    if(id==='layer edit'||id==='layer order') {
      const layer=selected?.params?.layers?.at(-1);
      if(layer) {values.id=layer.id;if('z' in values) values.z=layer.z??0;}
    }
    if (selected) {
      if ('shape' in values) values.shape = selected.name ?? selected.id;
      if ('shape_id' in values) values.shape_id = selected.id;
      if (command.category === 'Shapes' && 'name' in values && id !== 'rename') values.name = selected.name ?? selected.id;
    }
    const form = element('form', null, 'tool-form');
    const fields = [];
    for (const [key, value] of Object.entries(values)) {
      const choices = command.choices?.[key];
      const input = element(choices ? 'select' : typeof value === 'object' && value !== null ? 'textarea' : 'input');
      input.name = key;
      const kind = value === null ? 'null' : typeof value;
      if (choices) for (const [value, label] of Object.entries(choices)) { const option = element('option', label); option.value = value; input.append(option); }
      if (kind === 'boolean') { input.type = 'checkbox'; input.checked = value; }
      else { if (kind === 'number') { input.type = 'number'; input.step = 'any'; } input.value = kind === 'object' ? JSON.stringify(value) : value ?? ''; }
      form.append(field(key.replaceAll('_', ' '), input)); fields.push({ key, input, kind });
    }
    const advanced = element('details'); advanced.append(element('summary', 'All parameters (JSON)'));
    const json = element('textarea'); json.rows = 8; json.value = JSON.stringify(values, null, 2); json.setAttribute('aria-label', 'All tool parameters as JSON');
    advanced.append(json); form.append(advanced);
    let jsonEdited = false;
    json.addEventListener('input', () => { jsonEdited = true; });
    const read = () => {
      if (jsonEdited) {
        const body = JSON.parse(json.value);
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Parameters must be a JSON object');
        return body;
      }
      return Object.fromEntries(fields.map(({ key, input, kind }) => [key,
        kind === 'boolean' ? input.checked : kind === 'number' ? Number(input.value) : kind === 'object' ? JSON.parse(input.value) : kind === 'null' && !input.value ? null : input.value]));
    };
    for (const { input } of fields) input.addEventListener('input', () => { jsonEdited = false; try { json.value = JSON.stringify(read(), null, 2); } catch { /* partial field input */ } });
    const submit = element('button', command.submitLabel ?? (isBuild ? 'Build' : command.method === 'GET' ? 'Inspect' : 'Apply')); submit.type = 'submit'; form.append(submit);
    const report = jsonReport({ onDownload: data => download(`${command.id.replaceAll(' ', '-')}-report.json`, data) });
    const animation = animationProof();
    const output = report.output;
    let generatedAction, formBuild;
    const buildProgress = element('div', null, 'build-progress'); buildProgress.hidden = true;
    const buildStatus = element('p', '', 'workbench-hint'); buildStatus.dataset.buildStatus = ''; buildStatus.setAttribute('role', 'status');
    const progress = element('progress'); progress.dataset.buildProgress = ''; progress.setAttribute('aria-label', 'Build progress');
    const cancel = button('Cancel build', () => { if (selectionCurrent()) formBuild?.cancel(); }); cancel.dataset.buildCancel = ''; cancel.disabled = true;
    if (isBuild) { buildProgress.append(buildStatus, progress, cancel); form.append(buildProgress); }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (isBuild && (submit.disabled || !selectionCurrent())) return;
      const sessionId = this.sessionId, projectId = this.project?.projectId;
      let activeBuild;
      const current = () => selectionCurrent() && this.sessionId === sessionId && this.project?.projectId === projectId && (!activeBuild || (this.builder === activeBuild && !activeBuild.disposed));
      this.run(async () => {
        submit.disabled = true;
        animation.set(null);
        try {
          const request = commandRequest(command, read());
          let result;
          if (isBuild) {
            generatedAction?.remove(); report.set(undefined);
            const builder = activeBuild = formBuild = this.builder = new ProjectBuildController({ isCurrent: current, onUpdate: update => {
              if (!current()) return;
              buildProgress.hidden = false;
              setStatus(buildStatus, buildMessage(update), update.state === 'failed');
              progress.hidden = !update.busy;
              if (Number.isFinite(update.completed) && update.total > 0) { progress.max = update.total; progress.value = update.completed; }
              else { progress.max = 1; progress.removeAttribute('value'); }
              cancel.disabled = !update.cancellable;
            } });
            result = await builder.start(request.body, { sessionId });
            if (!current() || !result) return;
          } else result = await this.request(request.path.replace(/^\/api/, ''), request.method === 'POST' ? request.body : undefined);
          report.set(result.data ?? result);
          animation.set(result.preview, result.previewPoster);
          if (result.data?.ok === false) {
            this.notify(`${command.label} failed. See the report below.`, true);
            return;
          }
          if (result.data?.artifacts?.project) {
            const projectPath = result.data.artifacts.project;
            generatedAction = button('Open generated project', () => this.run(async () => {
              await this.request('/session/open', { path: projectPath });
              this.notify('Generated project opened as a new session.'); this.refresh();
            }));
            output.after(generatedAction);
          }
          if (result.data?.url?.startsWith('/casting.html?')) {
            const link = element('a', 'Open casting review'); link.href = result.data.url; link.target = '_blank'; link.rel = 'noopener'; output.after(link);
          }
          this.notify(`${command.label} completed.`); this.refresh();
        } catch (error) {
          if (!isBuild || current()) throw error;
        } finally { if (!isBuild || current()) submit.disabled = false; }
      });
    });
    this.commandDetail.append(form, animation.node, report.node);
  }
  renderBatch(mount) {
    const input = element('textarea'); input.rows = 12; input.value = JSON.stringify([{ command: 'draw', type: 'point', cell: this.getCell(), x: 8, y: 8, color: this.getColor() ?? '#ffccaa', name: 'review-mark' }], null, 2);
    input.setAttribute('aria-label', 'Expanded CLI batch operations');
    const output = element('pre', null, 'tool-output');
    const apply = button('Apply operations', () => this.run(async () => {
      const sessionId = this.sessionId;
      apply.disabled = true;
      try {
        const mapped = await this.request('/workbench/map-operations', { operations: JSON.parse(input.value) }, { sessionId });
        output.textContent = '';
        for (const [index, request] of mapped.data.entries()) {
          try {
            if (this.sessionId !== sessionId) throw new Error('The active session changed');
            const result = await this.request(request.path.replace(/^\/api/, ''), request.method === 'POST' ? request.body : undefined, { sessionId });
            output.textContent += `${index + 1}. Applied ${request.path}\n`;
            if (['/api/cell/ascii-read', '/api/cell/compose-plan'].includes(request.path)||request.path.startsWith('/api/cell/layers?')) output.textContent += `${JSON.stringify(result.data, null, 2)}\n`;
          } catch (error) { throw new Error(`Stopped at operation ${index + 1}: ${error.message}. ${index} earlier operations remain applied.`); }
        }
        this.refresh(); this.notify(`Applied ${mapped.data.length} operations.`);
      } finally { apply.disabled = false; }
    }));
    mount.append(input, apply, output);
  }
  renderHandoff() {
    this.body.append(element('p', 'Pass the editable design, the selected frame, and a short review note between you and your agent. Imported files always become a new session.', 'workbench-hint'));
    const actions = element('div', null, 'workbench-actions');
    const format = element('select'); format.name = 'project-format'; format.setAttribute('aria-label', 'Editable project format');
    for (const [value, label] of [['', 'Current project format'], ['shared', 'Shared geometry (V2)'], ['expanded', 'Expanded (V1)']]) {
      const option = element('option', label); option.value = value; format.append(option);
    }
    actions.append(format);
    actions.append(button('Download editable project', () => this.run(async () => {
      const sessionId = this.sessionId, name = this.project?.name ?? 'design';
      const response = await fetch(`/api/workbench/project-file${format.value ? `?format=${format.value}` : ''}`, { headers: { 'X-Sprite-Session': sessionId ?? '' } });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Could not download this project');
      download(`${name}.project.json`, await response.blob());
    })));
    actions.append(button('Download PNG', () => this.run(async () => {
      const sessionId = this.sessionId, name = this.project?.name ?? 'design';
      const response = await fetch('/api/workbench/sheet.png', { headers: { 'X-Sprite-Session': sessionId ?? '' } });
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('Could not render this sheet');
      download(`${name}.png`, await response.blob());
    })));
    actions.append(button('Download atlas', () => this.run(async () => {
      const sessionId = this.sessionId, name = this.project?.name ?? 'design';
      const atlas = await this.request('/workbench/atlas', undefined, { sessionId });
      download(`${name}.atlas.json`, atlas.data);
    })));
    const upload = element('input'); upload.type = 'file'; upload.accept = '.json,.json.gz,application/json,application/gzip'; upload.setAttribute('aria-label', 'Import editable project JSON or gzip');
    const importStatus = element('p', 'Choose a .json or .json.gz project.'); importStatus.dataset.importStatus = ''; importStatus.setAttribute('role', 'status');
    const importProgress = element('progress'); importProgress.hidden = true;
    const cancelImport = button('Cancel import', () => this.run(() => this.importer?.cancel())); cancelImport.dataset.importCancel = ''; cancelImport.disabled = true;
    const importSequence = this.sequence;
    this.importer = new ProjectImportController({ getSessionId: () => this.sessionId,
      isCurrent: () => importSequence === this.sequence && this.tab === 'handoff' && !this.mount.hidden,
      onUpdate: status => {
        if (importSequence !== this.sequence) return;
        upload.disabled = status.busy; cancelImport.disabled = !status.busy;
        importProgress.hidden = !status.busy;
        if (status.state === 'uploading' && status.total) { importProgress.max = status.total; importProgress.value = status.loaded ?? 0; }
        else importProgress.removeAttribute('value');
        importStatus.textContent = status.error ?? `${status.phase ?? status.state}${status.loaded !== undefined ? ` · ${status.loaded.toLocaleString()}${status.total ? ` / ${status.total.toLocaleString()}` : ''} bytes` : ''}`;
        importStatus.classList.toggle('error', status.state === 'failed');
        if (!status.busy) upload.value = '';
      },
      onComplete: receipt => { this.notify(`Imported ${receipt.project_name} as a new session.`); this.refresh(); },
    });
    upload.addEventListener('change', () => this.run(async () => {
      const file = upload.files[0]; if (!file) return;
      await this.importer?.start(file);
    }));
    this.body.append(actions, element('label', 'Import an editable project'), upload, importStatus, importProgress, cancelImport);
    const exportSection = element('section', null, 'surface-section');
    exportSection.append(element('h3', 'Export PNG and atlas on disk'), element('p', 'Write the sheet and atlas to the session export folder, or choose another destination. Auto includes normal assets when the design has authored normals.', 'workbench-hint'));
    const destination = input('export-dest', '', { placeholder: 'Use session export folder' });
    const trim = input('export-trim', '', { type: 'checkbox' });
    const normal = element('select'); normal.name = 'export-normal';
    for (const [value, label] of [['auto', 'Auto · authored metadata'], ['include', 'Include normal assets'], ['omit', 'Omit normal assets']]) {
      const option = element('option', label); option.value = value; normal.append(option);
    }
    const report = jsonReport({ onDownload: data => download('export-report.json', data) });
    const sequence = this.sequence, sessionId = this.sessionId;
    const exportButton = button('Export to disk', () => this.run(async () => {
      if (exportButton.disabled || this.sessionId !== sessionId || sequence !== this.sequence) return;
      exportButton.disabled = true;
      try {
        const result = await this.request('/session/export', { ...(destination.value.trim() ? { dest: destination.value.trim() } : {}), trim: trim.checked, normal: normal.value === 'auto' ? undefined : normal.value === 'include' }, { sessionId });
        if (this.sessionId !== sessionId || sequence !== this.sequence) return;
        report.set(result); this.notify('Export completed. See artifact paths below.');
      } catch (error) {
        if (this.sessionId === sessionId && sequence === this.sequence) throw error;
      } finally { if (this.sessionId === sessionId && sequence === this.sequence) exportButton.disabled = !sessionId; }
    }));
    exportButton.dataset.action = 'handoff-export'; exportButton.disabled = !sessionId;
    exportSection.append(field('Destination folder (optional)', destination), field('Trim transparent bounds', trim), field('Normal export', normal), exportButton, report.node);
    this.body.append(exportSection);
    const noteLabel = element('label', 'Review note');
    const note = element('textarea'); note.rows = 7; note.maxLength = 20000; note.placeholder = 'What should the next pass change or preserve?';
    const draftKey = `sprite-review-${this.sessionId}`;
    note.value = localStorage.getItem(draftKey) ?? this.project?.review?.note ?? '';
    note.addEventListener('input', () => localStorage.setItem(draftKey, note.value));
    noteLabel.append(note); this.body.append(noteLabel);
    const author = element('input'); author.value = this.project?.review?.author ?? 'Artist'; author.maxLength = 120; author.setAttribute('aria-label', 'Review author');
    this.body.append(element('label', 'From'), author);
    this.body.append(button('Save review note', () => this.run(async () => {
      await this.request('/workbench/handoff', { note: note.value, author: author.value, cell: this.getCell() });
      localStorage.removeItem(draftKey); this.notify('Review note saved with the project.'); this.refresh();
    })));
    this.body.append(button('Copy handoff for agent', () => this.run(async () => {
      const packet = await this.request('/workbench/project-summary');
      const sessionId = packet.data.sessionId ?? this.sessionId;
      const port = location.port || (location.protocol === 'https:' ? '443' : '80');
      const text = `Design: ${packet.data.name}\nPreview: ${location.origin}\nSession: ${sessionId}\nFrame: ${this.getCell()}\nReview: ${note.value}\n\nUse the matching managed agent-sprites runtime, bound to this preview port (do not use another server). In PowerShell:\n$env:SPRITE_PORT='${port}'\nagent-sprites open --session ${sessionId}\n\nRead design metadata and its saved review note at ${location.origin}/api/workbench/project-summary with X-Sprite-Session: ${sessionId}. Request pinned frames from /api/workbench/frames for editing. Download the editable project for transfer to another machine.`;
      await navigator.clipboard.writeText(text); this.notify('Design handoff copied.');
    })));
    this.body.append(element('p', 'Drafts save automatically. Save project on disk writes a portable file; downloads include the last saved review note.', 'workbench-hint'));
  }
}
