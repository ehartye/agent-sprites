import { COMMANDS, commandRequest } from './command-catalog.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, action, className = '') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
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
  }
  init() {
    this.mount = document.getElementById('workbench-mount');
    this.mount.className = 'workbench-drawer';
    this.mount.hidden = true;
    this.mount.setAttribute('aria-label', 'Design workbench');
    this.mount.append(element('h2', 'Design workbench'));
    this.mount.append(button('Close', () => this.close(), 'drawer-close'));
    this.nav = element('nav', null, 'workbench-tabs');
    for (const tab of ['sessions', 'palettes', 'tools', 'handoff']) {
      const btn = button(tab[0].toUpperCase() + tab.slice(1), () => this.show(tab));
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
    this.mount.hidden = true;
    this.sequence++;
    this.opener?.focus();
  }
  notify(message, error = false) {
    const status = document.getElementById('workbench-status');
    status.textContent = message;
    status.classList.toggle('error', error);
  }
  async run(action) {
    try { return await action(); }
    catch (error) { this.notify(error.message, true); }
  }
  async show(tab) {
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
      if (sequence !== this.sequence) return;
      this.body.replaceChildren();
      if (tab === 'sessions') this.renderSessions(data);
      if (tab === 'palettes') this.renderPalettes(data);
      if (tab === 'tools') this.renderTools();
      if (tab === 'handoff') this.renderHandoff();
    } catch (error) { if (sequence === this.sequence) this.body.replaceChildren(element('p', error.message, 'error')); }
  }
  setProject(project, sessionId) {
    const changed = this.sessionId !== sessionId;
    this.project = project;
    this.sessionId = sessionId;
    document.getElementById('session-indicator')?.replaceChildren(document.createTextNode(sessionId ? `Shared session · ${sessionId.slice(-8)}` : 'No active session'));
    if (!this.mount.hidden && (changed || this.tab === 'sessions')) this.show(this.tab);
  }
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
  renderTools() {
    const search = element('input'); search.type = 'search'; search.placeholder = 'Find a tool or CLI command'; search.setAttribute('aria-label', 'Find a tool or CLI command');
    this.body.append(search);
    const browser = element('div', null, 'command-browser');
    const list = element('div', null, 'command-list');
    this.commandDetail = element('div', null, 'command-detail');
    browser.append(list, this.commandDetail); this.body.append(browser);
    const render = () => {
      list.replaceChildren();
      const needle = search.value.toLowerCase();
      let category;
      for (const command of COMMANDS.filter(command => `${command.id} ${command.label} ${command.category}`.toLowerCase().includes(needle))) {
        if (category !== command.category) { category = command.category; list.append(element('h3', category)); }
        const item = button(command.label, () => this.selectCommand(command.id)); item.title = command.id; item.dataset.command = command.id;
        list.append(item);
      }
    };
    search.addEventListener('input', render); render();
    this.selectCommand('draw rect');
  }
  selectCommand(id) {
    const command = COMMANDS.find(command => command.id === id);
    this.commandDetail.replaceChildren(element('h3', command.label), element('code', command.id));
    this.body.querySelectorAll('[data-command]').forEach(btn => btn.classList.toggle('active', btn.dataset.command === id));
    if (command.description) this.commandDetail.append(element('p', command.description, 'workbench-hint'));
    if (command.cli) {
      const snippet = element('textarea'); snippet.readOnly = true; snippet.value = command.cli; snippet.setAttribute('aria-label', 'Terminal command');
      this.commandDetail.append(snippet, button('Copy command', () => this.run(async () => { await navigator.clipboard.writeText(command.cli); this.notify('Terminal command copied.'); })));
      return;
    }
    if (command.action === 'preview') { this.commandDetail.append(button('Open preview', () => { this.preview(); this.close(); })); return; }
    if (command.action === 'batch') { this.renderBatch(this.commandDetail); return; }
    const values = structuredClone(command.body);
    if ('cell' in values) values.cell = this.getCell();
    if ('from' in values && typeof values.from === 'string') values.from = this.getCell();
    if ('from_cell' in values) values.from_cell = this.getCell();
    if ('color' in values) values.color = this.getColor() ?? values.color;
    const selected = this.getShape();
    if (selected) {
      if ('shape' in values) values.shape = selected.name ?? selected.id;
      if ('shape_id' in values) values.shape_id = selected.id;
      if (command.category === 'Shapes' && 'name' in values && id !== 'rename') values.name = selected.name ?? selected.id;
    }
    const form = element('form', null, 'tool-form');
    const fields = [];
    for (const [key, value] of Object.entries(values)) {
      const label = element('label', key.replaceAll('_', ' '));
      const input = element(typeof value === 'object' && value !== null ? 'textarea' : 'input');
      input.name = key;
      const kind = value === null ? 'null' : typeof value;
      if (kind === 'boolean') { input.type = 'checkbox'; input.checked = value; }
      else { if (kind === 'number') { input.type = 'number'; input.step = 'any'; } input.value = kind === 'object' ? JSON.stringify(value) : value ?? ''; }
      label.append(input); form.append(label); fields.push({ key, input, kind });
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
    const submit = element('button', command.method === 'GET' ? 'Inspect' : 'Apply'); submit.type = 'submit'; form.append(submit);
    const output = element('pre', null, 'tool-output'); output.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', event => {
      event.preventDefault();
      this.run(async () => {
        submit.disabled = true;
        try {
          const request = commandRequest(command, read());
          const result = await this.request(request.path.replace(/^\/api/, ''), request.method === 'POST' ? request.body : undefined);
          output.textContent = JSON.stringify(result.data ?? result, null, 2).slice(0, 24_000);
          if (result.data?.ok === false) {
            this.notify(`${command.label} failed. See the report below.`, true);
            return;
          }
          if (result.data?.artifacts?.project) {
            const projectPath = result.data.artifacts.project;
            output.after(button('Open generated project', () => this.run(async () => {
              await this.request('/session/open', { path: projectPath });
              this.notify('Generated project opened as a new session.'); this.refresh();
            })));
          }
          if (result.data?.url?.startsWith('/casting.html?')) {
            const link = element('a', 'Open casting review'); link.href = result.data.url; link.target = '_blank'; link.rel = 'noopener'; output.after(link);
          }
          this.notify(`${command.label} completed.`); this.refresh();
        } finally { submit.disabled = false; }
      });
    });
    this.commandDetail.append(form, output);
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
            await this.request(request.path.replace(/^\/api/, ''), request.method === 'POST' ? request.body : undefined, { sessionId });
            output.textContent += `${index + 1}. Applied ${request.path}\n`;
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
    actions.append(button('Download editable project', () => this.run(async () => {
      const packet = await this.request('/workbench/project'); download(`${packet.data.name}.project.json`, packet.data);
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
    const upload = element('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.setAttribute('aria-label', 'Import editable project JSON');
    upload.addEventListener('change', () => this.run(async () => {
      const file = upload.files[0]; if (!file) return;
      if (file.size > 64 * 1024 * 1024) throw new Error('Project must be smaller than 64 MB');
      await this.request('/session/import', { project: JSON.parse(await file.text()) });
      this.notify(`Imported ${file.name} as a new session.`); this.refresh();
    }));
    this.body.append(actions, element('label', 'Import an editable project'), upload);
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
      const packet = await this.request('/workbench/project');
      const port = location.port || (location.protocol === 'https:' ? '443' : '80');
      const text = `Design: ${packet.data.name}\nPreview: ${location.origin}\nSession: ${packet.session_id}\nFrame: ${this.getCell()}\nReview: ${note.value}\n\nUse the matching managed agent-sprites runtime, bound to this preview port (do not use another server). In PowerShell:\n$env:SPRITE_PORT='${port}'\nagent-sprites open --session ${packet.session_id}\n\nRead the current editable project and its saved review note at ${location.origin}/api/workbench/project with X-Sprite-Session: ${packet.session_id}. Download the editable project for transfer to another machine.`;
      await navigator.clipboard.writeText(text); this.notify('Design handoff copied.');
    })));
    this.body.append(element('p', 'Drafts save automatically. Save project on disk writes a portable file; downloads include the last saved review note.', 'workbench-hint'));
  }
}
