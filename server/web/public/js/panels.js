/**
 * Panels — Shape list and Group manager panels for the right sidebar.
 */

export class ShapePanel {
  constructor() {
    this._shapes = [];
    this._selectedId = null;
    this._palette = {};
    this._page = 0;
    this._query = '';

    this._selectCb = null;
    this._actionCb = null;
  }

  /**
   * @param {object} opts
   * @param {Function} opts.onSelect - Called with shape id when clicked
   * @param {Function} opts.onAction - Called with (action, shapeId) for rename/recolor/delete/z
   */
  init({ onSelect, onAction }) {
    this._selectCb = onSelect;
    this._actionCb = onAction;
    this._bindContextMenu();
    document.getElementById('shape-search')?.addEventListener('input', event => {
      this._query = event.target.value.toLowerCase(); this._page = 0; this.render();
    });
  }

  setPalette(paletteMap) {
    this._palette = paletteMap;
  }

  setShapes(shapes) {
    this._shapes = shapes || [];
    this.render();
  }

  setSelected(shapeId) {
    this._selectedId = shapeId;
    this._updateSelection();
  }

  render() {
    const ul = document.getElementById('shape-items');
    ul.innerHTML = '';

    const sorted = this._shapes.filter(shape => `${shape.name ?? ''} ${shape.id} ${shape.type}`.toLowerCase().includes(this._query)).sort((a, b) => b.zIndex - a.zIndex);
    const pages = Math.max(1, Math.ceil(sorted.length / 100));
    this._page = Math.min(this._page, pages - 1);
    const pagination = document.getElementById('shape-pagination');
    if (pagination) {
      pagination.replaceChildren();
      const prev = document.createElement('button'); prev.textContent = '‹'; prev.title = 'Previous shapes'; prev.disabled = this._page === 0;
      prev.onclick = () => { this._page--; this.render(); };
      const label = document.createElement('span'); label.textContent = `${sorted.length} shapes · ${this._page + 1}/${pages}`;
      const next = document.createElement('button'); next.textContent = '›'; next.title = 'Next shapes'; next.disabled = this._page >= pages - 1;
      next.onclick = () => { this._page++; this.render(); };
      pagination.append(prev, label, next);
    }

    for (const shape of sorted.slice(this._page * 100, (this._page + 1) * 100)) {
      const li = document.createElement('li');
      li.dataset.shapeId = shape.id;
      if (shape.id === this._selectedId) li.classList.add('selected');

      const colorDot = document.createElement('span');
      colorDot.className = 'shape-color';
      colorDot.style.backgroundColor = this._resolveColor(shape.color);
      li.appendChild(colorDot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'shape-name';
      nameSpan.textContent = shape.name || `${shape.type} (${shape.id})`;
      li.appendChild(nameSpan);

      const zSpan = document.createElement('span');
      zSpan.className = 'shape-z';
      zSpan.textContent = `z${shape.zIndex}`;
      li.appendChild(zSpan);

      li.addEventListener('click', () => {
        this._selectedId = shape.id;
        this._updateSelection();
        if (this._selectCb) this._selectCb(shape.id);
      });

      ul.appendChild(li);
    }
  }

  _updateSelection() {
    document.querySelectorAll('#shape-items li').forEach((li) => {
      li.classList.toggle('selected', li.dataset.shapeId === this._selectedId);
    });
  }

  _resolveColor(ref) {
    if (!ref) return '#888';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#888';
  }

  _bindContextMenu() {
    const ul = document.getElementById('shape-items');
    ul.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const li = e.target.closest('li[data-shape-id]');
      if (!li) return;
      const shapeId = li.dataset.shapeId;
      this._showContextMenu(e.clientX, e.clientY, shapeId);
    });
  }

  _showContextMenu(x, y, shapeId) {
    this._removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const actions = [
      { label: 'Rename', action: 'rename' },
      { label: 'Recolor', action: 'recolor' },
      { label: 'Move Up', action: 'z_up' },
      { label: 'Move Down', action: 'z_down' },
      { label: 'Delete', action: 'delete' },
    ];

    for (const { label, action } of actions) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = label;
      item.addEventListener('click', () => {
        this._removeContextMenu();
        if (this._actionCb) this._actionCb(action, shapeId);
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    const dismiss = (e) => {
      if (!menu.contains(e.target)) {
        this._removeContextMenu();
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  _removeContextMenu() {
    document.querySelectorAll('.context-menu').forEach((el) => el.remove());
  }
}

export class GroupPanel {
  constructor() {
    this._groups = {};
    this._activeGroup = null;

    this._selectCb = null;
    this._createCb = null;
    this._deleteCb = null;
  }

  /**
   * @param {object} opts
   * @param {Function} opts.onSelect - Called with group name or null (all)
   * @param {Function} opts.onCreate - Called when create button clicked
   * @param {Function} opts.onDelete - Called with group name
   */
  init({ onSelect, onCreate, onDelete, onAddCell, onRemoveCell }) {
    this._selectCb = onSelect;
    this._createCb = onCreate;
    this._deleteCb = onDelete;
    this._addCellCb = onAddCell;
    this._removeCellCb = onRemoveCell;
  }

  setActiveCell(ref) {
    this._activeCell = ref;
    this.render();
  }

  setGroups(groups) {
    this._groups = groups || {};
    this.render();
  }

  get activeGroup() { return this._activeGroup; }

  render() {
    const ul = document.getElementById('group-items');
    ul.innerHTML = '';
    // Remove any previous create button
    ul.parentElement.querySelectorAll('.group-create-btn').forEach(el => el.remove());

    // "All" option
    const allLi = document.createElement('li');
    allLi.textContent = 'All Cells';
    if (!this._activeGroup) allLi.classList.add('active');
    allLi.addEventListener('click', () => this._select(null));
    ul.appendChild(allLi);

    for (const [name, cells] of Object.entries(this._groups)) {
      const li = document.createElement('li');
      li.dataset.group = name;
      if (name === this._activeGroup) li.classList.add('active');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${name} (${cells.length})`;
      li.appendChild(nameSpan);

      const btnRow = document.createElement('span');
      btnRow.className = 'group-btn-row';

      const hasCell = this._activeCell && cells.includes(this._activeCell);
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'group-toggle-btn';
      toggleBtn.textContent = hasCell ? '−' : '+';
      toggleBtn.title = hasCell
        ? `Remove ${this._activeCell} from this group`
        : `Add ${this._activeCell} to this group`;
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._activeCell) return;
        if (hasCell && this._removeCellCb) this._removeCellCb(name, this._activeCell);
        else if (!hasCell && this._addCellCb) this._addCellCb(name, this._activeCell);
      });
      btnRow.appendChild(toggleBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'group-delete-btn';
      delBtn.textContent = 'x';
      delBtn.title = 'Delete group';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._deleteCb) this._deleteCb(name);
      });
      btnRow.appendChild(delBtn);

      li.appendChild(btnRow);

      li.addEventListener('click', () => this._select(name));
      ul.appendChild(li);
    }

    // Create button
    const createBtn = document.createElement('button');
    createBtn.className = 'group-create-btn';
    createBtn.textContent = '+ New Group';
    createBtn.addEventListener('click', () => {
      if (this._createCb) this._createCb();
    });
    ul.parentElement.appendChild(createBtn);
  }

  _select(name) {
    this._activeGroup = name;
    document.querySelectorAll('#group-items li').forEach((li) => {
      const isAll = !li.dataset.group;
      li.classList.toggle('active', isAll ? !name : li.dataset.group === name);
    });
    if (this._selectCb) this._selectCb(name);
  }
}

/**
 * Shape-group panel — manages groups of shapes *within* the active cell.
 * Shows a badge when a same-named group exists in other cells too.
 */
export class ShapeGroupPanel {
  constructor() {
    this._activeCell = null;
    this._cellGroups = {};       // { groupName: [shapeName...] }  — for active cell
    this._allCellCounts = {};    // { groupName: cellCount } — across entire session
    this._callbacks = {};
  }

  init({ onCreate, onCreatePattern, onAddShape, onRemoveShape, onDelete, onSelect }) {
    this._callbacks = { onCreate, onCreatePattern, onAddShape, onRemoveShape, onDelete, onSelect };
  }

  setActiveCell(ref) {
    this._activeCell = ref;
    const scope = document.getElementById('shape-group-scope');
    if (scope) scope.textContent = ref ? `in ${ref}` : 'in —';
    this.render();
  }

  setCellGroups(groups) { this._cellGroups = groups || {}; this.render(); }

  setAllCellGroups(allGroups) {
    // allGroups: { "0,0": {name:[shapes]}, "0,1": {...} }
    const counts = {};
    for (const groupMap of Object.values(allGroups || {})) {
      for (const name of Object.keys(groupMap)) {
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
    this._allCellCounts = counts;
    this.render();
  }

  render() {
    const ul = document.getElementById('shape-group-items');
    if (!ul) return;
    ul.innerHTML = '';
    ul.parentElement.querySelectorAll('.group-create-btn, .group-create-pattern-btn').forEach(el => el.remove());

    const entries = Object.entries(this._cellGroups);
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'shape-group-empty';
      empty.textContent = this._activeCell ? 'No shape groups in this cell.' : 'Select a cell.';
      ul.appendChild(empty);
    }

    for (const [name, shapes] of entries) {
      const li = document.createElement('li');
      li.dataset.shapeGroup = name;

      const main = document.createElement('span');
      main.textContent = `${name} (${shapes.length})`;
      li.appendChild(main);

      const crossCount = this._allCellCounts[name] ?? 1;
      if (crossCount > 1) {
        const badge = document.createElement('span');
        badge.className = 'shape-group-badge';
        badge.textContent = `🔗${crossCount}`;
        badge.title = `Also exists in ${crossCount - 1} other cell(s)`;
        li.appendChild(badge);
      }

      const btnRow = document.createElement('span');
      btnRow.className = 'group-btn-row';

      const addBtn = document.createElement('button');
      addBtn.className = 'group-toggle-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add shapes (comma-separated names)';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const names = prompt(`Add shapes to "${name}" (comma-separated):`);
        if (names && this._callbacks.onAddShape) {
          this._callbacks.onAddShape(name, names.split(',').map(s => s.trim()).filter(Boolean));
        }
      });
      btnRow.appendChild(addBtn);

      const rmBtn = document.createElement('button');
      rmBtn.className = 'group-toggle-btn';
      rmBtn.textContent = '−';
      rmBtn.title = 'Remove shapes (comma-separated names)';
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const names = prompt(`Remove shapes from "${name}" (comma-separated):`);
        if (names && this._callbacks.onRemoveShape) {
          this._callbacks.onRemoveShape(name, names.split(',').map(s => s.trim()).filter(Boolean));
        }
      });
      btnRow.appendChild(rmBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'group-delete-btn';
      delBtn.textContent = 'x';
      delBtn.title = crossCount > 1
        ? 'Delete — you will be asked whether to delete in this cell only or all cells'
        : 'Delete group (shapes remain)';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._callbacks.onDelete) return;
        if (crossCount > 1) {
          const choice = prompt(
            `"${name}" exists in ${crossCount} cells. Delete:\n  1 = this cell only\n  2 = all ${crossCount} cells\n  (anything else cancels)`,
            '1'
          );
          if (choice === '1') this._callbacks.onDelete(name, { allCells: false });
          else if (choice === '2') this._callbacks.onDelete(name, { allCells: true });
        } else {
          this._callbacks.onDelete(name, { allCells: false });
        }
      });
      btnRow.appendChild(delBtn);

      li.appendChild(btnRow);

      li.addEventListener('click', () => {
        if (this._callbacks.onSelect) this._callbacks.onSelect(name, shapes);
      });
      ul.appendChild(li);
    }

    const createBtn = document.createElement('button');
    createBtn.className = 'group-create-btn';
    createBtn.textContent = '+ New Group (this cell)';
    createBtn.addEventListener('click', () => {
      if (!this._activeCell) { alert('Select a cell first.'); return; }
      const name = prompt('Group name:');
      if (!name) return;
      const shapes = prompt('Shape names (comma-separated):');
      if (!shapes) return;
      if (this._callbacks.onCreate) {
        this._callbacks.onCreate(name, shapes.split(',').map(s => s.trim()).filter(Boolean));
      }
    });
    ul.parentElement.appendChild(createBtn);

    const patternBtn = document.createElement('button');
    patternBtn.className = 'group-create-pattern-btn';
    patternBtn.textContent = '+ New Group (all cells by pattern)';
    patternBtn.addEventListener('click', () => {
      const name = prompt('Group name:');
      if (!name) return;
      const pattern = prompt('Regex to match shape names (e.g. ^seam_):');
      if (!pattern) return;
      if (this._callbacks.onCreatePattern) this._callbacks.onCreatePattern(name, pattern);
    });
    ul.parentElement.appendChild(patternBtn);
  }
}
