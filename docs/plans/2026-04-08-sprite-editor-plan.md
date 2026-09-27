# Claude-Sprites Implementation Plan

Historical plan: its example 10×10 grid restriction was removed in 0.26.0.
Current grids have no product policy caps; see the README for current behavior.

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach).

**Goal:** Build a Claude Code plugin that provides collaborative pixel art sprite sheet editing via MCP tools and a real-time web UI.

**Architecture:** Single Node process with a shared canvas engine. MCP server (stdio) and HTTP+WebSocket server both call the same engine. All state lives in the engine, persisted to `.sprites` JSON project files.

**Tech Stack:** Node.js, `@modelcontextprotocol/sdk` (MCP server), `canvas` (node-canvas), `express`, `ws`, `vitest`

**Design doc:** `docs/plans/2026-04-08-sprite-editor-design.md`

**Note:** Design doc lists `@anthropic-ai/sdk` for MCP but the correct package for building MCP servers is `@modelcontextprotocol/sdk`. Corrected here.

---

## File Structure (Revised)

The design doc's `server/mcp/tools.js` single file would exceed 500 lines with ~30 tools. Split by category. Similarly, web UI uses ES modules for modularity without a bundler.

```
claude-sprites/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── .gitignore
├── package.json
├── commands/
│   ├── sprite-new.md
│   ├── sprite-open.md
│   └── sprite-export.md
├── skills/
│   └── sprite-editing/
│       └── SKILL.md
├── server/
│   ├── index.js                  # Entry: boots MCP + web server
│   ├── engine/
│   │   ├── shape.js              # Shape class (~60 lines)
│   │   ├── shape-registry.js     # Registry CRUD (~100 lines)
│   │   ├── palette.js            # Palette + presets (~120 lines)
│   │   ├── cell.js               # Cell: canvas + shapes + undo (~150 lines)
│   │   ├── cell-manager.js       # Grid of cells (~120 lines)
│   │   ├── group-manager.js      # Named cell groups (~80 lines)
│   │   ├── canvas-renderer.js    # Render shapes to PNG (~200 lines)
│   │   └── project.js            # Save/load .sprites files (~100 lines)
│   ├── mcp/
│   │   ├── server.js             # MCP bootstrap + tool registration (~80 lines)
│   │   ├── project-tools.js      # new, open, save, palette tools (~120 lines)
│   │   ├── drawing-tools.js      # point, line, rect, circle, fill (~150 lines)
│   │   ├── shape-tools.js        # name, move, recolor, delete, list, z (~120 lines)
│   │   ├── cell-tools.js         # shift, mirror, copy, clear, name (~100 lines)
│   │   ├── group-tools.js        # create, add, remove, list, batch (~100 lines)
│   │   ├── view-tools.js         # view cell/cells/sheet, export (~130 lines)
│   │   └── history-tools.js      # undo, redo (~40 lines)
│   └── web/
│       ├── http.js               # Express + WebSocket setup (~80 lines)
│       └── public/
│           ├── index.html
│           ├── css/
│           │   └── styles.css
│           └── js/
│               ├── app.js            # Main entry, wiring (~100 lines)
│               ├── canvas-editor.js  # Pixel grid canvas (~250 lines)
│               ├── tools.js          # Drawing tool handlers (~150 lines)
│               ├── panels.js         # Shape list, group mgr (~200 lines)
│               ├── cell-nav.js       # Cell thumbnail strip (~150 lines)
│               ├── websocket.js      # WS connection + sync (~80 lines)
│               └── animation.js      # Animation preview (~100 lines)
├── tests/
│   ├── engine/
│   │   ├── shape.test.js
│   │   ├── shape-registry.test.js
│   │   ├── palette.test.js
│   │   ├── cell.test.js
│   │   ├── cell-manager.test.js
│   │   ├── group-manager.test.js
│   │   ├── canvas-renderer.test.js
│   │   └── project.test.js
│   ├── mcp/
│   │   ├── drawing-tools.test.js
│   │   ├── shape-tools.test.js
│   │   ├── cell-tools.test.js
│   │   ├── group-tools.test.js
│   │   └── view-tools.test.js
│   └── web/
│       └── sync.test.js
└── docs/
    └── plans/
        ├── 2026-04-08-sprite-editor-design.md
        └── 2026-04-08-sprite-editor-plan.md
```

---

## Phase 1: Foundation (Engine)

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `vitest.config.js`

**Step 1: Initialize package.json**

```json
{
  "name": "claude-sprites",
  "version": "0.1.0",
  "description": "Collaborative pixel art sprite sheet editor — Claude Code plugin",
  "type": "module",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "MIT"
}
```

**Step 2: Create .gitignore**

```
node_modules/
*.sprites
.tmp/
```

**Step 3: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 4: Install dependencies**

Run: `npm install canvas express ws @modelcontextprotocol/sdk`
Run: `npm install -D vitest nodemon`

**Step 5: Verify setup**

Run: `npx vitest run`
Expected: "No test files found" (no error)

**Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore vitest.config.js
git commit -m "feat: project scaffolding with dependencies"
```

---

### Task 2: Shape Model

**Files:**
- Create: `server/engine/shape.js`
- Create: `tests/engine/shape.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/shape.test.js
import { describe, it, expect } from 'vitest';
import { Shape } from '../../server/engine/shape.js';

describe('Shape', () => {
  it('creates a shape with auto-generated id', () => {
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    expect(shape.id).toBeDefined();
    expect(shape.type).toBe('rect');
    expect(shape.params).toEqual({ x: 0, y: 0, w: 5, h: 5, filled: true });
    expect(shape.color).toBe('red');
    expect(shape.zIndex).toBe(0);
    expect(shape.visible).toBe(true);
    expect(shape.name).toBeNull();
  });

  it('accepts optional name and zIndex', () => {
    const shape = new Shape('line', { x1: 0, y1: 0, x2: 5, y2: 5 }, 'blue', {
      name: 'diagonal',
      zIndex: 3,
    });
    expect(shape.name).toBe('diagonal');
    expect(shape.zIndex).toBe(3);
  });

  it('generates unique ids', () => {
    const a = new Shape('point', { x: 0, y: 0 }, 'red');
    const b = new Shape('point', { x: 1, y: 1 }, 'red');
    expect(a.id).not.toBe(b.id);
  });

  it('clones with new id', () => {
    const original = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    const clone = original.clone();
    expect(clone.id).not.toBe(original.id);
    expect(clone.type).toBe(original.type);
    expect(clone.params).toEqual(original.params);
    expect(clone.params).not.toBe(original.params); // deep copy
    expect(clone.name).toBeNull(); // clones don't inherit names
  });

  it('serializes to JSON and deserializes', () => {
    const shape = new Shape('circle', { cx: 8, cy: 8, r: 3, filled: false }, 'outline', {
      name: 'head',
      zIndex: 2,
    });
    const json = shape.toJSON();
    const restored = Shape.fromJSON(json);
    expect(restored.id).toBe(shape.id);
    expect(restored.type).toBe('circle');
    expect(restored.params).toEqual({ cx: 8, cy: 8, r: 3, filled: false });
    expect(restored.color).toBe('outline');
    expect(restored.name).toBe('head');
    expect(restored.zIndex).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/shape.test.js`
Expected: FAIL — cannot find module

**Step 3: Implement Shape class**

```js
// server/engine/shape.js
let nextId = 1;

export class Shape {
  constructor(type, params, color, opts = {}) {
    this.id = `s${nextId++}`;
    this.type = type;
    this.params = { ...params };
    this.color = color;
    this.name = opts.name ?? null;
    this.zIndex = opts.zIndex ?? 0;
    this.visible = opts.visible ?? true;
  }

  clone() {
    const clone = new Shape(this.type, { ...this.params }, this.color, {
      zIndex: this.zIndex,
      visible: this.visible,
    });
    return clone;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      params: { ...this.params },
      color: this.color,
      zIndex: this.zIndex,
      visible: this.visible,
    };
  }

  static fromJSON(json) {
    const shape = new Shape(json.type, json.params, json.color, {
      name: json.name,
      zIndex: json.zIndex,
      visible: json.visible,
    });
    shape.id = json.id;
    return shape;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/shape.test.js`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add server/engine/shape.js tests/engine/shape.test.js
git commit -m "feat: Shape model with clone and serialization"
```

---

### Task 3: Palette Manager

**Files:**
- Create: `server/engine/palette.js`
- Create: `tests/engine/palette.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/palette.test.js
import { describe, it, expect } from 'vitest';
import { Palette } from '../../server/engine/palette.js';

describe('Palette', () => {
  it('creates with initial colors', () => {
    const p = new Palette([{ name: 'red', color: '#ff0000' }]);
    expect(p.getColor('red')).toBe('#ff0000');
  });

  it('adds a color', () => {
    const p = new Palette();
    p.add('sky', '#87ceeb');
    expect(p.getColor('sky')).toBe('#87ceeb');
  });

  it('throws on duplicate name', () => {
    const p = new Palette([{ name: 'red', color: '#ff0000' }]);
    expect(() => p.add('red', '#cc0000')).toThrow('already exists');
  });

  it('updates a color', () => {
    const p = new Palette([{ name: 'red', color: '#ff0000' }]);
    p.update('red', '#cc0000');
    expect(p.getColor('red')).toBe('#cc0000');
  });

  it('removes a color', () => {
    const p = new Palette([{ name: 'red', color: '#ff0000' }]);
    p.remove('red');
    expect(p.getColor('red')).toBeNull();
  });

  it('lists all colors', () => {
    const p = new Palette([
      { name: 'red', color: '#ff0000' },
      { name: 'blue', color: '#0000ff' },
    ]);
    expect(p.list()).toEqual([
      { name: 'red', color: '#ff0000' },
      { name: 'blue', color: '#0000ff' },
    ]);
  });

  it('resolves hex pass-through', () => {
    const p = new Palette();
    expect(p.resolve('#ff0000')).toBe('#ff0000');
  });

  it('resolves palette name to hex', () => {
    const p = new Palette([{ name: 'red', color: '#ff0000' }]);
    expect(p.resolve('red')).toBe('#ff0000');
  });

  it('serializes and deserializes', () => {
    const p = new Palette([{ name: 'a', color: '#111' }, { name: 'b', color: '#222' }]);
    const json = p.toJSON();
    const restored = Palette.fromJSON(json);
    expect(restored.list()).toEqual(p.list());
  });

  it('loads a preset', () => {
    const p = Palette.fromPreset('pico8');
    expect(p.list().length).toBeGreaterThan(0);
    // PICO-8 has 16 colors
    expect(p.list().length).toBe(16);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/palette.test.js`
Expected: FAIL

**Step 3: Implement Palette**

```js
// server/engine/palette.js

const PRESETS = {
  pico8: [
    { name: 'black', color: '#000000' },
    { name: 'dark-blue', color: '#1d2b53' },
    { name: 'dark-purple', color: '#7e2553' },
    { name: 'dark-green', color: '#008751' },
    { name: 'brown', color: '#ab5236' },
    { name: 'dark-grey', color: '#5f574f' },
    { name: 'light-grey', color: '#c2c3c7' },
    { name: 'white', color: '#fff1e8' },
    { name: 'red', color: '#ff004d' },
    { name: 'orange', color: '#ffa300' },
    { name: 'yellow', color: '#ffec27' },
    { name: 'green', color: '#00e436' },
    { name: 'blue', color: '#29adff' },
    { name: 'lavender', color: '#83769c' },
    { name: 'pink', color: '#ff77a8' },
    { name: 'light-peach', color: '#ffccaa' },
  ],
  gameboy: [
    { name: 'darkest', color: '#0f380f' },
    { name: 'dark', color: '#306230' },
    { name: 'light', color: '#8bac0f' },
    { name: 'lightest', color: '#9bbc0f' },
  ],
  nes: [
    { name: 'black', color: '#000000' },
    { name: 'white', color: '#fcfcfc' },
    { name: 'red', color: '#d82800' },
    { name: 'cyan', color: '#00a8a8' },
    { name: 'purple', color: '#6844fc' },
    { name: 'green', color: '#00a844' },
    { name: 'blue', color: '#0000a8' },
    { name: 'yellow', color: '#f8d878' },
    { name: 'orange', color: '#f87858' },
    { name: 'brown', color: '#ac7c00' },
    { name: 'light-red', color: '#f89898' },
    { name: 'dark-grey', color: '#787878' },
    { name: 'grey', color: '#a8a8a8' },
    { name: 'light-green', color: '#b8f878' },
    { name: 'light-blue', color: '#7878fc' },
    { name: 'light-grey', color: '#d8d8d8' },
  ],
};

export class Palette {
  constructor(colors = []) {
    this._colors = new Map();
    for (const { name, color } of colors) {
      this._colors.set(name, color);
    }
  }

  add(name, color) {
    if (this._colors.has(name)) {
      throw new Error(`Color "${name}" already exists`);
    }
    this._colors.set(name, color);
  }

  update(name, color) {
    this._colors.set(name, color);
  }

  remove(name) {
    this._colors.delete(name);
  }

  getColor(name) {
    return this._colors.get(name) ?? null;
  }

  resolve(colorRef) {
    if (colorRef.startsWith('#')) return colorRef;
    return this.getColor(colorRef) ?? colorRef;
  }

  list() {
    return Array.from(this._colors.entries()).map(([name, color]) => ({ name, color }));
  }

  toJSON() {
    return this.list();
  }

  static fromJSON(json) {
    return new Palette(json);
  }

  static fromPreset(name) {
    const preset = PRESETS[name];
    if (!preset) throw new Error(`Unknown preset: ${name}. Available: ${Object.keys(PRESETS).join(', ')}`);
    return new Palette(preset);
  }

  static listPresets() {
    return Object.keys(PRESETS);
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/palette.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/palette.js tests/engine/palette.test.js
git commit -m "feat: Palette with named colors, presets, and resolve"
```

---

### Task 4: Shape Registry

**Files:**
- Create: `server/engine/shape-registry.js`
- Create: `tests/engine/shape-registry.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/shape-registry.test.js
import { describe, it, expect } from 'vitest';
import { ShapeRegistry } from '../../server/engine/shape-registry.js';
import { Shape } from '../../server/engine/shape.js';

describe('ShapeRegistry', () => {
  it('adds a shape and retrieves by id', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    reg.add(shape);
    expect(reg.getById(shape.id)).toBe(shape);
  });

  it('retrieves by name', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    reg.add(shape);
    expect(reg.getByName('box')).toBe(shape);
  });

  it('throws on duplicate name', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' }));
    expect(() =>
      reg.add(new Shape('rect', { x: 1, y: 1, w: 3, h: 3, filled: true }, 'blue', { name: 'box' }))
    ).toThrow('already exists');
  });

  it('names an existing shape', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    reg.add(shape);
    reg.nameShape(shape.id, 'box');
    expect(reg.getByName('box')).toBe(shape);
    expect(shape.name).toBe('box');
  });

  it('removes a shape', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    reg.add(shape);
    reg.remove(shape.id);
    expect(reg.getById(shape.id)).toBeNull();
    expect(reg.getByName('box')).toBeNull();
  });

  it('lists shapes sorted by zIndex', () => {
    const reg = new ShapeRegistry();
    const a = new Shape('point', { x: 0, y: 0 }, 'red', { zIndex: 2 });
    const b = new Shape('point', { x: 1, y: 1 }, 'blue', { zIndex: 0 });
    const c = new Shape('point', { x: 2, y: 2 }, 'green', { zIndex: 1 });
    reg.add(a);
    reg.add(b);
    reg.add(c);
    const list = reg.listByZ();
    expect(list[0]).toBe(b);
    expect(list[1]).toBe(c);
    expect(list[2]).toBe(a);
  });

  it('clears all shapes', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('point', { x: 0, y: 0 }, 'red'));
    reg.add(new Shape('point', { x: 1, y: 1 }, 'blue'));
    reg.clear();
    expect(reg.listByZ()).toEqual([]);
  });

  it('serializes and deserializes', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' }));
    const json = reg.toJSON();
    const restored = ShapeRegistry.fromJSON(json);
    expect(restored.getByName('box')).toBeDefined();
    expect(restored.getByName('box').type).toBe('rect');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/shape-registry.test.js`
Expected: FAIL

**Step 3: Implement ShapeRegistry**

```js
// server/engine/shape-registry.js
import { Shape } from './shape.js';

export class ShapeRegistry {
  constructor() {
    this._byId = new Map();
    this._byName = new Map();
  }

  add(shape) {
    if (shape.name && this._byName.has(shape.name)) {
      throw new Error(`Shape name "${shape.name}" already exists`);
    }
    this._byId.set(shape.id, shape);
    if (shape.name) this._byName.set(shape.name, shape);
    return shape;
  }

  getById(id) {
    return this._byId.get(id) ?? null;
  }

  getByName(name) {
    return this._byName.get(name) ?? null;
  }

  get(ref) {
    return this.getByName(ref) ?? this.getById(ref);
  }

  nameShape(id, name) {
    const shape = this.getById(id);
    if (!shape) throw new Error(`Shape "${id}" not found`);
    if (this._byName.has(name)) throw new Error(`Name "${name}" already exists`);
    if (shape.name) this._byName.delete(shape.name);
    shape.name = name;
    this._byName.set(name, shape);
  }

  remove(id) {
    const shape = this._byId.get(id);
    if (!shape) return;
    if (shape.name) this._byName.delete(shape.name);
    this._byId.delete(id);
  }

  listByZ() {
    return Array.from(this._byId.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  clear() {
    this._byId.clear();
    this._byName.clear();
  }

  toJSON() {
    return this.listByZ().map((s) => s.toJSON());
  }

  static fromJSON(json) {
    const reg = new ShapeRegistry();
    for (const data of json) {
      reg.add(Shape.fromJSON(data));
    }
    return reg;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/shape-registry.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/shape-registry.js tests/engine/shape-registry.test.js
git commit -m "feat: ShapeRegistry with CRUD, naming, z-order"
```

---

### Task 5: Cell (Canvas + Shapes + Undo/Redo)

**Files:**
- Create: `server/engine/cell.js`
- Create: `tests/engine/cell.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/cell.test.js
import { describe, it, expect } from 'vitest';
import { Cell } from '../../server/engine/cell.js';

describe('Cell', () => {
  it('creates with given size', () => {
    const cell = new Cell(16);
    expect(cell.size).toBe(16);
    expect(cell.shapes.listByZ()).toEqual([]);
  });

  it('draws a shape and returns it', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    expect(shape.type).toBe('rect');
    expect(cell.shapes.getById(shape.id)).toBe(shape);
  });

  it('draws with auto-incrementing zIndex', () => {
    const cell = new Cell(16);
    const a = cell.draw('point', { x: 0, y: 0 }, 'red');
    const b = cell.draw('point', { x: 1, y: 1 }, 'blue');
    expect(b.zIndex).toBeGreaterThan(a.zIndex);
  });

  it('undoes a draw', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    cell.undo();
    expect(cell.shapes.getById(shape.id)).toBeNull();
  });

  it('redoes an undone draw', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    const id = shape.id;
    cell.undo();
    cell.redo();
    expect(cell.shapes.getById(id)).not.toBeNull();
  });

  it('clears redo stack on new draw after undo', () => {
    const cell = new Cell(16);
    cell.draw('point', { x: 0, y: 0 }, 'red');
    cell.undo();
    cell.draw('point', { x: 1, y: 1 }, 'blue');
    cell.redo(); // should be no-op
    expect(cell.shapes.listByZ().length).toBe(1);
  });

  it('respects max undo depth', () => {
    const cell = new Cell(16, { maxUndo: 3 });
    cell.draw('point', { x: 0, y: 0 }, 'a');
    cell.draw('point', { x: 1, y: 1 }, 'b');
    cell.draw('point', { x: 2, y: 2 }, 'c');
    cell.draw('point', { x: 3, y: 3 }, 'd');
    // 4 draws, max 3 undo — oldest should be gone
    cell.undo();
    cell.undo();
    cell.undo();
    cell.undo(); // no-op, stack exhausted
    expect(cell.shapes.listByZ().length).toBe(1); // first draw not undoable
  });

  it('moves a shape with undo support', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cell.moveShape('box', 3, 2);
    expect(shape.params.x).toBe(3);
    expect(shape.params.y).toBe(2);
    cell.undo();
    expect(shape.params.x).toBe(0);
    expect(shape.params.y).toBe(0);
  });

  it('recolors a shape with undo support', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cell.recolorShape('box', 'blue');
    expect(shape.color).toBe('blue');
    cell.undo();
    expect(shape.color).toBe('red');
  });

  it('has optional name', () => {
    const cell = new Cell(16);
    expect(cell.name).toBeNull();
    cell.name = 'idle_1';
    expect(cell.name).toBe('idle_1');
  });

  it('serializes and deserializes', () => {
    const cell = new Cell(16);
    cell.name = 'test';
    cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    const json = cell.toJSON();
    const restored = Cell.fromJSON(json, 16);
    expect(restored.name).toBe('test');
    expect(restored.shapes.getByName('box')).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/cell.test.js`
Expected: FAIL

**Step 3: Implement Cell**

The Cell class wraps a ShapeRegistry with drawing convenience methods and an undo/redo command stack. Each undoable action stores an `execute` and `undo` function.

```js
// server/engine/cell.js
import { Shape } from './shape.js';
import { ShapeRegistry } from './shape-registry.js';

export class Cell {
  constructor(size, opts = {}) {
    this.size = size;
    this.name = opts.name ?? null;
    this.shapes = new ShapeRegistry();
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = opts.maxUndo ?? 50;
    this._nextZ = 0;
  }

  _exec(command) {
    command.execute();
    this._undoStack.push(command);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  draw(type, params, color, shapeName = null) {
    const shape = new Shape(type, params, color, {
      name: shapeName,
      zIndex: this._nextZ++,
    });
    this._exec({
      execute: () => this.shapes.add(shape),
      undo: () => this.shapes.remove(shape.id),
    });
    return shape;
  }

  moveShape(ref, dx, dy) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldParams = { ...shape.params };
    const applyMove = () => {
      // Shift all position-related params
      if ('x' in shape.params) shape.params.x += dx;
      if ('y' in shape.params) shape.params.y += dy;
      if ('x1' in shape.params) { shape.params.x1 += dx; shape.params.y1 += dy; }
      if ('x2' in shape.params) { shape.params.x2 += dx; shape.params.y2 += dy; }
      if ('cx' in shape.params) { shape.params.cx += dx; shape.params.cy += dy; }
    };
    this._exec({
      execute: applyMove,
      undo: () => { Object.assign(shape.params, oldParams); },
    });
  }

  recolorShape(ref, color) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldColor = shape.color;
    this._exec({
      execute: () => { shape.color = color; },
      undo: () => { shape.color = oldColor; },
    });
  }

  deleteShape(ref) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const snapshot = shape.toJSON();
    this._exec({
      execute: () => this.shapes.remove(shape.id),
      undo: () => this.shapes.add(Shape.fromJSON(snapshot)),
    });
  }

  setZ(ref, z) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldZ = shape.zIndex;
    this._exec({
      execute: () => { shape.zIndex = z; },
      undo: () => { shape.zIndex = oldZ; },
    });
  }

  clear() {
    const snapshot = this.shapes.toJSON();
    this._exec({
      execute: () => this.shapes.clear(),
      undo: () => {
        for (const data of snapshot) this.shapes.add(Shape.fromJSON(data));
      },
    });
  }

  undo() {
    const command = this._undoStack.pop();
    if (!command) return false;
    command.undo();
    this._redoStack.push(command);
    return true;
  }

  redo() {
    const command = this._redoStack.pop();
    if (!command) return false;
    command.execute();
    this._undoStack.push(command);
    return true;
  }

  toJSON() {
    return {
      name: this.name,
      shapes: this.shapes.toJSON(),
    };
  }

  static fromJSON(json, size) {
    const cell = new Cell(size, { name: json.name });
    const shapes = ShapeRegistry.fromJSON(json.shapes);
    // Transfer shapes without going through command stack
    for (const shape of shapes.listByZ()) {
      cell.shapes.add(shape);
      if (shape.zIndex >= cell._nextZ) cell._nextZ = shape.zIndex + 1;
    }
    return cell;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/cell.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/cell.js tests/engine/cell.test.js
git commit -m "feat: Cell with draw, move, recolor, undo/redo"
```

---

### Task 6: Cell Manager (Grid)

**Files:**
- Create: `server/engine/cell-manager.js`
- Create: `tests/engine/cell-manager.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/cell-manager.test.js
import { describe, it, expect } from 'vitest';
import { CellManager } from '../../server/engine/cell-manager.js';

describe('CellManager', () => {
  it('creates a grid of cells', () => {
    const cm = new CellManager(16, 3, 4);
    expect(cm.rows).toBe(3);
    expect(cm.cols).toBe(4);
    expect(cm.cellSize).toBe(16);
  });

  it('gets a cell by row,col', () => {
    const cm = new CellManager(16, 3, 4);
    const cell = cm.getCell('1,2');
    expect(cell).toBeDefined();
    expect(cell.size).toBe(16);
  });

  it('throws on out-of-bounds', () => {
    const cm = new CellManager(16, 3, 4);
    expect(() => cm.getCell('5,0')).toThrow('out of bounds');
  });

  it('resolves cell by name', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.name = 'idle_1';
    expect(cm.getCell('idle_1')).toBe(cell);
  });

  it('copies a cell', () => {
    const cm = new CellManager(16, 2, 2);
    const src = cm.getCell('0,0');
    src.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cm.copyCell('0,0', '0,1');
    const dst = cm.getCell('0,1');
    expect(dst.shapes.listByZ().length).toBe(1);
    expect(dst.shapes.listByZ()[0].type).toBe('rect');
  });

  it('shifts cell contents', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    cm.shiftCell('0,0', 2, 3);
    expect(cell.shapes.listByZ()[0].params.x).toBe(2);
    expect(cell.shapes.listByZ()[0].params.y).toBe(3);
  });

  it('mirrors a cell horizontally', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.draw('point', { x: 2, y: 5 }, 'red');
    cm.mirrorCell('0,0', 'horizontal');
    expect(cell.shapes.listByZ()[0].params.x).toBe(13); // 16 - 1 - 2
  });

  it('lists all cells with coordinates', () => {
    const cm = new CellManager(16, 2, 2);
    const list = cm.listCells();
    expect(list.length).toBe(4);
    expect(list[0].coord).toBe('0,0');
  });

  it('enforces max grid size 10x10', () => {
    expect(() => new CellManager(16, 11, 5)).toThrow('max');
  });

  it('serializes and deserializes', () => {
    const cm = new CellManager(16, 2, 2);
    cm.getCell('0,0').draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cm.getCell('0,0').name = 'idle';
    const json = cm.toJSON();
    const restored = CellManager.fromJSON(json, 16);
    expect(restored.rows).toBe(2);
    expect(restored.getCell('idle').shapes.getByName('box')).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/cell-manager.test.js`
Expected: FAIL

**Step 3: Implement CellManager**

```js
// server/engine/cell-manager.js
import { Cell } from './cell.js';

export class CellManager {
  constructor(cellSize, rows, cols) {
    if (rows > 10 || cols > 10) throw new Error('Grid max is 10x10');
    if (rows < 1 || cols < 1) throw new Error('Grid must be at least 1x1');
    this.cellSize = cellSize;
    this.rows = rows;
    this.cols = cols;
    this._grid = [];
    for (let r = 0; r < rows; r++) {
      this._grid[r] = [];
      for (let c = 0; c < cols; c++) {
        this._grid[r][c] = new Cell(cellSize);
      }
    }
  }

  _parseCoord(ref) {
    // Try "row,col" format
    const match = ref.match(/^(\d+),(\d+)$/);
    if (match) {
      const r = parseInt(match[1], 10);
      const c = parseInt(match[2], 10);
      return { r, c };
    }
    // Try name lookup
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this._grid[r][c].name === ref) return { r, c };
      }
    }
    throw new Error(`Cell "${ref}" not found`);
  }

  getCell(ref) {
    const { r, c } = this._parseCoord(ref);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
      throw new Error(`Cell ${r},${c} out of bounds (grid is ${this.rows}x${this.cols})`);
    }
    return this._grid[r][c];
  }

  copyCell(fromRef, toRef) {
    const src = this.getCell(fromRef);
    const { r, c } = this._parseCoord(toRef);
    const dest = new Cell(this.cellSize);
    // Copy shapes from source
    for (const shape of src.shapes.listByZ()) {
      const clone = shape.clone();
      dest.shapes.add(clone);
    }
    this._grid[r][c] = dest;
  }

  shiftCell(ref, dx, dy) {
    const cell = this.getCell(ref);
    for (const shape of cell.shapes.listByZ()) {
      if ('x' in shape.params) { shape.params.x += dx; shape.params.y += dy; }
      if ('x1' in shape.params) { shape.params.x1 += dx; shape.params.y1 += dy; }
      if ('x2' in shape.params) { shape.params.x2 += dx; shape.params.y2 += dy; }
      if ('cx' in shape.params) { shape.params.cx += dx; shape.params.cy += dy; }
    }
  }

  mirrorCell(ref, axis) {
    const cell = this.getCell(ref);
    const max = this.cellSize - 1;
    for (const shape of cell.shapes.listByZ()) {
      if (axis === 'horizontal') {
        if ('x' in shape.params) shape.params.x = max - shape.params.x - (shape.params.w ?? 0) + (shape.params.w ? 0 : 0);
        if ('x' in shape.params && !('w' in shape.params)) shape.params.x = max - shape.params.x;
        if ('w' in shape.params) shape.params.x = max - shape.params.x - shape.params.w + 1;
        if ('x1' in shape.params) { shape.params.x1 = max - shape.params.x1; shape.params.x2 = max - shape.params.x2; }
        if ('cx' in shape.params) shape.params.cx = max - shape.params.cx;
      } else {
        if ('y' in shape.params && !('h' in shape.params)) shape.params.y = max - shape.params.y;
        if ('h' in shape.params) shape.params.y = max - shape.params.y - shape.params.h + 1;
        if ('y1' in shape.params) { shape.params.y1 = max - shape.params.y1; shape.params.y2 = max - shape.params.y2; }
        if ('cy' in shape.params) shape.params.cy = max - shape.params.cy;
      }
    }
  }

  listCells() {
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this._grid[r][c];
        result.push({
          coord: `${r},${c}`,
          name: cell.name,
          shapeCount: cell.shapes.listByZ().length,
        });
      }
    }
    return result;
  }

  toJSON() {
    const cells = {};
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this._grid[r][c];
        if (cell.shapes.listByZ().length > 0 || cell.name) {
          cells[`${r},${c}`] = cell.toJSON();
        }
      }
    }
    return { rows: this.rows, cols: this.cols, cells };
  }

  static fromJSON(json, cellSize) {
    const cm = new CellManager(cellSize, json.rows, json.cols);
    for (const [coord, cellData] of Object.entries(json.cells)) {
      const { r, c } = cm._parseCoord(coord);
      cm._grid[r][c] = Cell.fromJSON(cellData, cellSize);
    }
    return cm;
  }
}
```

Note: The `mirrorCell` logic above is intentionally simplified. It handles point and rect shapes but the mirror math for shapes with width/height has an overlap in the conditional branches. The implementor should clean up the conditionals so `x`-with-`w` (rect) and `x`-without-`w` (point) are distinct branches:

```js
if (axis === 'horizontal') {
  const p = shape.params;
  if ('x1' in p) { p.x1 = max - p.x1; p.x2 = max - p.x2; }
  else if ('cx' in p) { p.cx = max - p.cx; }
  else if ('x' in p && 'w' in p) { p.x = max - p.x - p.w + 1; }
  else if ('x' in p) { p.x = max - p.x; }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/cell-manager.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/cell-manager.js tests/engine/cell-manager.test.js
git commit -m "feat: CellManager grid with copy, shift, mirror"
```

---

### Task 7: Group Manager

**Files:**
- Create: `server/engine/group-manager.js`
- Create: `tests/engine/group-manager.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/group-manager.test.js
import { describe, it, expect } from 'vitest';
import { GroupManager } from '../../server/engine/group-manager.js';

describe('GroupManager', () => {
  it('creates a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('throws on duplicate group name', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    expect(() => gm.create('walk', ['0,1'])).toThrow('already exists');
  });

  it('adds cells to a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    gm.addCells('walk', ['0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('does not duplicate cells', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.addCells('walk', ['0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('removes cells from a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1', '0,2']);
    gm.removeCells('walk', ['0,1']);
    expect(gm.get('walk')).toEqual(['0,0', '0,2']);
  });

  it('deletes a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    gm.delete('walk');
    expect(gm.get('walk')).toBeNull();
  });

  it('lists all groups', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.create('idle', ['1,0']);
    const list = gm.list();
    expect(list).toEqual({
      walk: ['0,0', '0,1'],
      idle: ['1,0'],
    });
  });

  it('finds groups containing a cell', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.create('idle', ['0,0']);
    expect(gm.groupsForCell('0,0')).toEqual(['walk', 'idle']);
    expect(gm.groupsForCell('0,1')).toEqual(['walk']);
  });

  it('serializes and deserializes', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    const json = gm.toJSON();
    const restored = GroupManager.fromJSON(json);
    expect(restored.get('walk')).toEqual(['0,0', '0,1']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/group-manager.test.js`
Expected: FAIL

**Step 3: Implement GroupManager**

```js
// server/engine/group-manager.js
export class GroupManager {
  constructor() {
    this._groups = new Map();
  }

  create(name, cells = []) {
    if (this._groups.has(name)) throw new Error(`Group "${name}" already exists`);
    this._groups.set(name, [...cells]);
  }

  get(name) {
    const group = this._groups.get(name);
    return group ? [...group] : null;
  }

  addCells(name, cells) {
    const group = this._groups.get(name);
    if (!group) throw new Error(`Group "${name}" not found`);
    for (const cell of cells) {
      if (!group.includes(cell)) group.push(cell);
    }
  }

  removeCells(name, cells) {
    const group = this._groups.get(name);
    if (!group) throw new Error(`Group "${name}" not found`);
    const toRemove = new Set(cells);
    const filtered = group.filter((c) => !toRemove.has(c));
    this._groups.set(name, filtered);
  }

  delete(name) {
    this._groups.delete(name);
  }

  list() {
    const result = {};
    for (const [name, cells] of this._groups) {
      result[name] = [...cells];
    }
    return result;
  }

  groupsForCell(cellRef) {
    const result = [];
    for (const [name, cells] of this._groups) {
      if (cells.includes(cellRef)) result.push(name);
    }
    return result;
  }

  toJSON() {
    const result = {};
    for (const [name, cells] of this._groups) {
      result[name] = [...cells];
    }
    return result;
  }

  static fromJSON(json) {
    const gm = new GroupManager();
    for (const [name, cells] of Object.entries(json)) {
      gm.create(name, cells);
    }
    return gm;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/group-manager.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/group-manager.js tests/engine/group-manager.test.js
git commit -m "feat: GroupManager for animation cell groups"
```

---

### Task 8: Canvas Renderer

**Files:**
- Create: `server/engine/canvas-renderer.js`
- Create: `tests/engine/canvas-renderer.test.js`

This is the bridge between the shape model and actual pixel output using the `canvas` npm package.

**Step 1: Write failing tests**

```js
// tests/engine/canvas-renderer.test.js
import { describe, it, expect } from 'vitest';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';

describe('CanvasRenderer', () => {
  const palette = new Palette([
    { name: 'red', color: '#ff0000' },
    { name: 'blue', color: '#0000ff' },
  ]);

  it('renders a cell to a Buffer (PNG)', () => {
    const cell = new Cell(16);
    cell.draw('point', { x: 0, y: 0 }, 'red');
    const renderer = new CanvasRenderer(palette);
    const buf = renderer.renderCell(cell);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  it('renders a point at the correct pixel', () => {
    const cell = new Cell(16);
    cell.draw('point', { x: 5, y: 3 }, '#ff0000');
    const renderer = new CanvasRenderer(palette);
    const imageData = renderer.renderCellRaw(cell);
    // imageData is a flat RGBA array, width=16
    const idx = (3 * 16 + 5) * 4;
    expect(imageData[idx]).toBe(255);     // R
    expect(imageData[idx + 1]).toBe(0);   // G
    expect(imageData[idx + 2]).toBe(0);   // B
    expect(imageData[idx + 3]).toBe(255); // A
  });

  it('renders a filled rect', () => {
    const cell = new Cell(16);
    cell.draw('rect', { x: 2, y: 2, w: 3, h: 3, filled: true }, 'blue');
    const renderer = new CanvasRenderer(palette);
    const imageData = renderer.renderCellRaw(cell);
    // Check center pixel of the rect (3,3)
    const idx = (3 * 16 + 3) * 4;
    expect(imageData[idx]).toBe(0);       // R
    expect(imageData[idx + 1]).toBe(0);   // G
    expect(imageData[idx + 2]).toBe(255); // B
    expect(imageData[idx + 3]).toBe(255); // A
  });

  it('renders shapes in z-order (higher z on top)', () => {
    const cell = new Cell(16);
    cell.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, '#ff0000');
    cell.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, '#0000ff');
    const renderer = new CanvasRenderer(palette);
    const imageData = renderer.renderCellRaw(cell);
    // Top shape is blue
    expect(imageData[0]).toBe(0);
    expect(imageData[2]).toBe(255);
  });

  it('renders a line', () => {
    const cell = new Cell(16);
    cell.draw('line', { x1: 0, y1: 0, x2: 15, y2: 0 }, '#ff0000');
    const renderer = new CanvasRenderer(palette);
    const imageData = renderer.renderCellRaw(cell);
    // First pixel should be red
    expect(imageData[0]).toBe(255);
    expect(imageData[3]).toBe(255);
  });

  it('renders multiple cells side by side', () => {
    const cell1 = new Cell(16);
    const cell2 = new Cell(16);
    cell1.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, 'red');
    cell2.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, 'blue');
    const renderer = new CanvasRenderer(palette);
    const buf = renderer.renderCells([cell1, cell2]);
    expect(buf).toBeInstanceOf(Buffer);
    // Should be wider than a single cell
  });

  it('renders with chroma background', () => {
    const cell = new Cell(16);
    // No shapes — just background
    const renderer = new CanvasRenderer(palette, { background: { mode: 'chroma', color: '#ff00ff' } });
    const imageData = renderer.renderCellRaw(cell);
    // First pixel should be magenta
    expect(imageData[0]).toBe(255);
    expect(imageData[1]).toBe(0);
    expect(imageData[2]).toBe(255);
    expect(imageData[3]).toBe(255);
  });

  it('skips invisible shapes', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, '#ff0000');
    shape.visible = false;
    const renderer = new CanvasRenderer(palette);
    const imageData = renderer.renderCellRaw(cell);
    // Should be transparent (default background)
    expect(imageData[3]).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/canvas-renderer.test.js`
Expected: FAIL

**Step 3: Implement CanvasRenderer**

```js
// server/engine/canvas-renderer.js
import { createCanvas } from 'canvas';

export class CanvasRenderer {
  constructor(palette, opts = {}) {
    this.palette = palette;
    this.background = opts.background ?? { mode: 'transparent' };
  }

  _resolveColor(colorRef) {
    return this.palette.resolve(colorRef);
  }

  _applyBackground(ctx, width, height) {
    if (this.background.mode === 'chroma') {
      ctx.fillStyle = this.background.color;
      ctx.fillRect(0, 0, width, height);
    }
    // transparent = default canvas state (all zeros)
  }

  _drawShape(ctx, shape) {
    if (!shape.visible) return;
    const color = this._resolveColor(shape.color);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    const p = shape.params;
    switch (shape.type) {
      case 'point':
        ctx.fillRect(p.x, p.y, 1, 1);
        break;
      case 'line':
        this._drawLine(ctx, p.x1, p.y1, p.x2, p.y2);
        break;
      case 'rect':
        if (p.filled) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        } else {
          // 1px outline
          ctx.fillRect(p.x, p.y, p.w, 1);           // top
          ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1); // bottom
          ctx.fillRect(p.x, p.y, 1, p.h);            // left
          ctx.fillRect(p.x + p.w - 1, p.y, 1, p.h);  // right
        }
        break;
      case 'circle':
        this._drawCircle(ctx, p.cx, p.cy, p.r, p.filled);
        break;
      case 'fill':
        // Flood fill is applied at draw-time via pixel manipulation
        // Stored as a shape for undo, but rendering is a filled area
        // For now, treat as a point (flood fill rendering is in a separate method)
        this._floodFill(ctx, p.x, p.y, color);
        break;
    }
  }

  // Bresenham's line for pixel-perfect lines
  _drawLine(ctx, x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    while (true) {
      ctx.fillRect(x, y, 1, 1);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  // Midpoint circle algorithm
  _drawCircle(ctx, cx, cy, r, filled) {
    if (filled) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= r * r) {
            ctx.fillRect(cx + x, cy + y, 1, 1);
          }
        }
      }
    } else {
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
        ctx.fillRect(cx + y, cy + x, 1, 1);
        ctx.fillRect(cx - y, cy + x, 1, 1);
        ctx.fillRect(cx - x, cy + y, 1, 1);
        ctx.fillRect(cx - x, cy - y, 1, 1);
        ctx.fillRect(cx - y, cy - x, 1, 1);
        ctx.fillRect(cx + y, cy - x, 1, 1);
        ctx.fillRect(cx + x, cy - y, 1, 1);
        y++;
        if (err < 0) {
          err += 2 * y + 1;
        } else {
          x--;
          err += 2 * (y - x) + 1;
        }
      }
    }
  }

  _floodFill(ctx, startX, startY, fillColor) {
    const canvas = ctx.canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    const idx = (startY * w + startX) * 4;
    const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];

    // Parse fill color to RGBA
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    const fc = tempCtx.getImageData(0, 0, 1, 1).data;
    const fillR = fc[0], fillG = fc[1], fillB = fc[2], fillA = fc[3];

    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

    const match = (i) =>
      data[i] === targetR && data[i + 1] === targetG &&
      data[i + 2] === targetB && data[i + 3] === targetA;

    const stack = [[startX, startY]];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const i = (y * w + x) * 4;
      if (x < 0 || x >= w || y < 0 || y >= h || !match(i)) continue;
      data[i] = fillR; data[i + 1] = fillG; data[i + 2] = fillB; data[i + 3] = fillA;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  renderCellRaw(cell) {
    const canvas = createCanvas(cell.size, cell.size);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, cell.size, cell.size);
    for (const shape of cell.shapes.listByZ()) {
      this._drawShape(ctx, shape);
    }
    return ctx.getImageData(0, 0, cell.size, cell.size).data;
  }

  renderCell(cell) {
    const canvas = createCanvas(cell.size, cell.size);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, cell.size, cell.size);
    for (const shape of cell.shapes.listByZ()) {
      this._drawShape(ctx, shape);
    }
    return canvas.toBuffer('image/png');
  }

  renderCells(cells, opts = {}) {
    const cols = opts.cols ?? cells.length;
    const rows = Math.ceil(cells.length / cols);
    const size = cells[0].size;
    const gap = opts.gap ?? 1;
    const w = cols * size + (cols - 1) * gap;
    const h = rows * size + (rows - 1) * gap;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, w, h);

    cells.forEach((cell, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = c * (size + gap);
      const y = r * (size + gap);
      const cellCanvas = createCanvas(size, size);
      const cellCtx = cellCanvas.getContext('2d');
      this._applyBackground(cellCtx, size, size);
      for (const shape of cell.shapes.listByZ()) {
        this._drawShape(cellCtx, shape);
      }
      ctx.drawImage(cellCanvas, x, y);
    });

    return canvas.toBuffer('image/png');
  }

  renderSheet(cellManager) {
    const cells = [];
    for (let r = 0; r < cellManager.rows; r++) {
      for (let c = 0; c < cellManager.cols; c++) {
        cells.push(cellManager.getCell(`${r},${c}`));
      }
    }
    return this.renderCells(cells, { cols: cellManager.cols });
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/canvas-renderer.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/canvas-renderer.js tests/engine/canvas-renderer.test.js
git commit -m "feat: CanvasRenderer with Bresenham line, midpoint circle, flood fill"
```

---

### Task 9: Project Save/Load

**Files:**
- Create: `server/engine/project.js`
- Create: `tests/engine/project.test.js`

**Step 1: Write failing tests**

```js
// tests/engine/project.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import fs from 'fs';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), '.tmp');
const TMP_FILE = path.join(TMP_DIR, 'test.sprites');

describe('Project', () => {
  afterEach(() => {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
    if (fs.existsSync(TMP_DIR)) fs.rmdirSync(TMP_DIR);
  });

  it('creates a new project', () => {
    const proj = Project.create({ name: 'test', cellSize: 16, rows: 3, cols: 4 });
    expect(proj.name).toBe('test');
    expect(proj.cellSize).toBe(16);
    expect(proj.cells.rows).toBe(3);
    expect(proj.cells.cols).toBe(4);
    expect(proj.palette.list().length).toBe(0);
  });

  it('creates with a preset palette', () => {
    const proj = Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2, palette: 'pico8' });
    expect(proj.palette.list().length).toBe(16);
  });

  it('draws a shape and can access it', () => {
    const proj = Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 });
    const cell = proj.cells.getCell('0,0');
    cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, '#ff0000', 'box');
    expect(cell.shapes.getByName('box')).toBeDefined();
  });

  it('saves to file and loads back', () => {
    const proj = Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 });
    proj.palette.add('red', '#ff0000');
    proj.cells.getCell('0,0').draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    proj.cells.getCell('0,0').name = 'idle';
    proj.groups.create('anim', ['0,0', '0,1']);

    fs.mkdirSync(TMP_DIR, { recursive: true });
    proj.save(TMP_FILE);

    const loaded = Project.load(TMP_FILE);
    expect(loaded.name).toBe('test');
    expect(loaded.cellSize).toBe(16);
    expect(loaded.palette.getColor('red')).toBe('#ff0000');
    expect(loaded.cells.getCell('idle').shapes.getByName('box')).toBeDefined();
    expect(loaded.groups.get('anim')).toEqual(['0,0', '0,1']);
  });

  it('serializes to JSON matching design format', () => {
    const proj = Project.create({ name: 'crab', cellSize: 16, rows: 2, cols: 3 });
    const json = proj.toJSON();
    expect(json.version).toBe(1);
    expect(json.name).toBe('crab');
    expect(json.cellSize).toBe(16);
    expect(json.grid).toEqual({ rows: 2, cols: 3 });
    expect(json.background).toEqual({ mode: 'transparent' });
    expect(json.palette).toEqual([]);
    expect(json.cells).toEqual({});
    expect(json.groups).toEqual({});
  });

  it('exports texture atlas JSON', () => {
    const proj = Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 3 });
    proj.cells.getCell('0,0').name = 'idle';
    const atlas = proj.exportAtlas();
    expect(atlas.cellSize).toBe(16);
    expect(atlas.frames['0,0'].x).toBe(0);
    expect(atlas.frames['0,0'].y).toBe(0);
    expect(atlas.frames['0,0'].name).toBe('idle');
    expect(atlas.frames['0,1'].x).toBe(16);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/project.test.js`
Expected: FAIL

**Step 3: Implement Project**

```js
// server/engine/project.js
import fs from 'fs';
import { Palette } from './palette.js';
import { CellManager } from './cell-manager.js';
import { GroupManager } from './group-manager.js';

export class Project {
  constructor({ name, cellSize, cells, palette, groups, background }) {
    this.name = name;
    this.cellSize = cellSize;
    this.cells = cells;
    this.palette = palette;
    this.groups = groups;
    this.background = background ?? { mode: 'transparent' };
    this.path = null;
  }

  static create({ name, cellSize, rows, cols, palette: presetName }) {
    const palette = presetName ? Palette.fromPreset(presetName) : new Palette();
    return new Project({
      name,
      cellSize,
      cells: new CellManager(cellSize, rows, cols),
      palette,
      groups: new GroupManager(),
    });
  }

  toJSON() {
    return {
      version: 1,
      name: this.name,
      cellSize: this.cellSize,
      grid: { rows: this.cells.rows, cols: this.cells.cols },
      background: this.background,
      palette: this.palette.toJSON(),
      cells: this.cells.toJSON().cells,
      groups: this.groups.toJSON(),
    };
  }

  save(filePath) {
    const p = filePath ?? this.path;
    if (!p) throw new Error('No file path specified');
    fs.writeFileSync(p, JSON.stringify(this.toJSON(), null, 2));
    this.path = p;
  }

  static load(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const proj = new Project({
      name: data.name,
      cellSize: data.cellSize,
      cells: CellManager.fromJSON({ rows: data.grid.rows, cols: data.grid.cols, cells: data.cells }, data.cellSize),
      palette: Palette.fromJSON(data.palette),
      groups: GroupManager.fromJSON(data.groups),
      background: data.background,
    });
    proj.path = filePath;
    return proj;
  }

  exportAtlas() {
    const frames = {};
    for (let r = 0; r < this.cells.rows; r++) {
      for (let c = 0; c < this.cells.cols; c++) {
        const cell = this.cells.getCell(`${r},${c}`);
        frames[`${r},${c}`] = {
          x: c * this.cellSize,
          y: r * this.cellSize,
          w: this.cellSize,
          h: this.cellSize,
          name: cell.name,
        };
      }
    }
    return {
      name: this.name,
      cellSize: this.cellSize,
      imageWidth: this.cells.cols * this.cellSize,
      imageHeight: this.cells.rows * this.cellSize,
      frames,
    };
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/engine/project.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/engine/project.js tests/engine/project.test.js
git commit -m "feat: Project save/load with atlas export"
```

---

## Phase 2: MCP Server

### Task 10: MCP Server Bootstrap

**Files:**
- Create: `server/mcp/server.js`
- Create: `server/index.js`

**Step 1: Implement MCP server skeleton**

```js
// server/mcp/server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createMcpServer(engine) {
  const server = new McpServer({
    name: 'claude-sprites',
    version: '0.1.0',
  });

  // engine is the shared Project instance — tool modules will register against this server
  return { server, engine };
}

export async function startMcpServer(server) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

```js
// server/index.js
import { createMcpServer, startMcpServer } from './mcp/server.js';
import { startWebServer } from './web/http.js';
import { Project } from './engine/project.js';

// Shared state: a project instance (starts null, created/loaded via tools)
const state = {
  project: null,
};

const { server } = createMcpServer(state);

// Import and register all tool modules
// (These will be created in subsequent tasks)

const WEB_PORT = parseInt(process.env.SPRITE_PORT ?? '3377', 10);

// Start web server (non-blocking)
startWebServer(state, WEB_PORT).then((info) => {
  // Log to stderr so it doesn't interfere with MCP stdio
  console.error(`Sprite editor web UI: http://localhost:${info.port}`);
});

// Start MCP server (blocks on stdio)
startMcpServer(server);
```

**Step 2: Create placeholder web server**

```js
// server/web/http.js
import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startWebServer(state, port) {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  const httpServer = app.listen(port);

  const wss = new WebSocketServer({ server: httpServer });
  state.wss = wss;

  // Broadcast helper — tools call this after state changes
  state.broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  };

  wss.on('connection', (ws) => {
    // Send current project state on connect
    if (state.project) {
      ws.send(JSON.stringify({ type: 'project', data: state.project.toJSON() }));
    }

    ws.on('message', (raw) => {
      // Handle operations from web UI — will be wired in Task 16
      try {
        const msg = JSON.parse(raw);
        // TODO: dispatch operation to engine, then broadcast
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });
  });

  return { port };
}
```

**Step 3: Create placeholder HTML**

```html
<!-- server/web/public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Sprites</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div id="app">
    <p>Claude Sprites — web UI coming soon</p>
  </div>
</body>
</html>
```

Create placeholder CSS:
```css
/* server/web/public/css/styles.css */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; }
#app { padding: 1rem; }
```

**Step 4: Verify server starts**

Run: `node server/index.js &` (should print web UI URL to stderr, then listen on stdio)
Kill immediately after verifying.

**Step 5: Commit**

```bash
git add server/index.js server/mcp/server.js server/web/http.js server/web/public/
git commit -m "feat: MCP + web server bootstrap with shared state"
```

---

### Task 11: MCP Project & Drawing Tools

**Files:**
- Create: `server/mcp/project-tools.js`
- Create: `server/mcp/drawing-tools.js`
- Create: `tests/mcp/drawing-tools.test.js`

**Step 1: Write failing tests for drawing tools**

```js
// tests/mcp/drawing-tools.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/mcp/drawing-tools.js';

describe('Drawing tools', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: () => {},
    };
  });

  it('draws a point', () => {
    const result = handleDraw(state, 'point', { cell: '0,0', x: 5, y: 3, color: '#ff0000' });
    expect(result.shapeId).toBeDefined();
    const cell = state.project.cells.getCell('0,0');
    expect(cell.shapes.listByZ().length).toBe(1);
  });

  it('draws a line', () => {
    const result = handleDraw(state, 'line', { cell: '0,0', x1: 0, y1: 0, x2: 10, y2: 10, color: '#ff0000' });
    expect(result.shapeId).toBeDefined();
  });

  it('draws a named shape', () => {
    handleDraw(state, 'rect', {
      cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', filled: true, shape_name: 'box',
    });
    const cell = state.project.cells.getCell('0,0');
    expect(cell.shapes.getByName('box')).toBeDefined();
  });

  it('throws without a project', () => {
    state.project = null;
    expect(() => handleDraw(state, 'point', { cell: '0,0', x: 0, y: 0, color: '#ff0000' }))
      .toThrow('No project');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mcp/drawing-tools.test.js`
Expected: FAIL

**Step 3: Implement project tools**

```js
// server/mcp/project-tools.js
import { Project } from '../engine/project.js';
import { Palette } from '../engine/palette.js';

export function registerProjectTools(server, state) {
  server.tool('sprite_new_project', {
    description: 'Create a new sprite sheet project',
    cell_size: { type: 'number', description: '16 or 32' },
    grid_rows: { type: 'number', description: 'Number of rows (1-10)' },
    grid_cols: { type: 'number', description: 'Number of columns (1-10)' },
    name: { type: 'string', description: 'Project name' },
    palette: { type: 'string', description: 'Optional preset: pico8, gameboy, nes', optional: true },
  }, (params) => {
    state.project = Project.create({
      name: params.name,
      cellSize: params.cell_size,
      rows: params.grid_rows,
      cols: params.grid_cols,
      palette: params.palette,
    });
    state.broadcast({ type: 'project', data: state.project.toJSON() });
    return { content: [{ type: 'text', text: `Created project "${params.name}" (${params.cell_size}px, ${params.grid_rows}x${params.grid_cols})` }] };
  });

  server.tool('sprite_open_project', {
    description: 'Load a .sprites project file',
    path: { type: 'string', description: 'Path to .sprites file' },
  }, (params) => {
    state.project = Project.load(params.path);
    state.broadcast({ type: 'project', data: state.project.toJSON() });
    return { content: [{ type: 'text', text: `Opened "${state.project.name}"` }] };
  });

  server.tool('sprite_save_project', {
    description: 'Save the current project',
    path: { type: 'string', description: 'File path (optional if previously saved)', optional: true },
  }, (params) => {
    if (!state.project) throw new Error('No project open');
    state.project.save(params.path);
    return { content: [{ type: 'text', text: `Saved to ${state.project.path}` }] };
  });

  server.tool('sprite_set_palette', {
    description: 'Set project palette colors',
    colors: { type: 'array', description: 'Array of {name, color} objects' },
  }, (params) => {
    if (!state.project) throw new Error('No project open');
    state.project.palette = new Palette(params.colors);
    state.broadcast({ type: 'palette', data: state.project.palette.toJSON() });
    return { content: [{ type: 'text', text: `Palette set with ${params.colors.length} colors` }] };
  });

  server.tool('sprite_load_palette', {
    description: 'Load a built-in palette preset',
    preset: { type: 'string', description: 'Preset name: pico8, gameboy, nes' },
  }, (params) => {
    if (!state.project) throw new Error('No project open');
    state.project.palette = Palette.fromPreset(params.preset);
    state.broadcast({ type: 'palette', data: state.project.palette.toJSON() });
    return { content: [{ type: 'text', text: `Loaded ${params.preset} palette (${state.project.palette.list().length} colors)` }] };
  });
}
```

**Step 4: Implement drawing tools**

```js
// server/mcp/drawing-tools.js

// Shared handler (also called from tests and WebSocket)
export function handleDraw(state, type, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);

  let drawParams;
  switch (type) {
    case 'point':
      drawParams = { x: params.x, y: params.y };
      break;
    case 'line':
      drawParams = { x1: params.x1, y1: params.y1, x2: params.x2, y2: params.y2 };
      break;
    case 'rect':
      drawParams = { x: params.x, y: params.y, w: params.w, h: params.h, filled: params.filled ?? true };
      break;
    case 'circle':
      drawParams = { cx: params.cx, cy: params.cy, r: params.r, filled: params.filled ?? true };
      break;
    case 'fill':
      drawParams = { x: params.x, y: params.y };
      break;
    default:
      throw new Error(`Unknown draw type: ${type}`);
  }

  const shape = cell.draw(type, drawParams, params.color, params.shape_name ?? null);
  state.broadcast?.({ type: 'draw', cell: params.cell, shape: shape.toJSON() });
  return { shapeId: shape.id, shapeName: shape.name };
}

export function registerDrawingTools(server, state) {
  server.tool('sprite_draw_point', {
    description: 'Draw a single pixel',
    cell: { type: 'string', description: 'Cell ref (e.g. "0,0" or name)' },
    x: { type: 'number' }, y: { type: 'number' },
    color: { type: 'string', description: 'Hex color or palette name' },
    shape_name: { type: 'string', optional: true },
  }, (params) => {
    const result = handleDraw(state, 'point', params);
    return { content: [{ type: 'text', text: `Point at (${params.x},${params.y}) → shape ${result.shapeId}` }] };
  });

  server.tool('sprite_draw_line', {
    description: 'Draw a line between two points',
    cell: { type: 'string' },
    x1: { type: 'number' }, y1: { type: 'number' },
    x2: { type: 'number' }, y2: { type: 'number' },
    color: { type: 'string' },
    shape_name: { type: 'string', optional: true },
  }, (params) => {
    const result = handleDraw(state, 'line', params);
    return { content: [{ type: 'text', text: `Line (${params.x1},${params.y1})→(${params.x2},${params.y2}) → shape ${result.shapeId}` }] };
  });

  server.tool('sprite_draw_rect', {
    description: 'Draw a rectangle',
    cell: { type: 'string' },
    x: { type: 'number' }, y: { type: 'number' },
    w: { type: 'number' }, h: { type: 'number' },
    color: { type: 'string' },
    filled: { type: 'boolean', optional: true, description: 'Filled (default true)' },
    shape_name: { type: 'string', optional: true },
  }, (params) => {
    const result = handleDraw(state, 'rect', params);
    return { content: [{ type: 'text', text: `Rect ${params.w}x${params.h} at (${params.x},${params.y}) → shape ${result.shapeId}` }] };
  });

  server.tool('sprite_draw_circle', {
    description: 'Draw a circle or ellipse',
    cell: { type: 'string' },
    cx: { type: 'number' }, cy: { type: 'number' },
    r: { type: 'number' },
    color: { type: 'string' },
    filled: { type: 'boolean', optional: true },
    shape_name: { type: 'string', optional: true },
  }, (params) => {
    const result = handleDraw(state, 'circle', params);
    return { content: [{ type: 'text', text: `Circle r=${params.r} at (${params.cx},${params.cy}) → shape ${result.shapeId}` }] };
  });

  server.tool('sprite_flood_fill', {
    description: 'Flood fill from a point',
    cell: { type: 'string' },
    x: { type: 'number' }, y: { type: 'number' },
    color: { type: 'string' },
    shape_name: { type: 'string', optional: true },
  }, (params) => {
    const result = handleDraw(state, 'fill', params);
    return { content: [{ type: 'text', text: `Fill at (${params.x},${params.y}) → shape ${result.shapeId}` }] };
  });
}
```

**Step 5: Run tests**

Run: `npx vitest run tests/mcp/drawing-tools.test.js`
Expected: All PASS

**Step 6: Commit**

```bash
git add server/mcp/project-tools.js server/mcp/drawing-tools.js tests/mcp/drawing-tools.test.js
git commit -m "feat: MCP project and drawing tools"
```

---

### Task 12: MCP Shape, Cell, Group, History Tools

**Files:**
- Create: `server/mcp/shape-tools.js`
- Create: `server/mcp/cell-tools.js`
- Create: `server/mcp/group-tools.js`
- Create: `server/mcp/history-tools.js`
- Create: `tests/mcp/shape-tools.test.js`
- Create: `tests/mcp/cell-tools.test.js`
- Create: `tests/mcp/group-tools.test.js`

These follow the same pattern as drawing tools — thin wrappers around engine methods. Tests verify the wiring.

**Step 1: Write failing tests for shape tools**

```js
// tests/mcp/shape-tools.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/mcp/drawing-tools.js';
import {
  handleNameShape, handleMoveShape, handleRecolorShape,
  handleDeleteShape, handleListShapes, handleSetZ,
} from '../../server/mcp/shape-tools.js';

describe('Shape tools', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: () => {},
    };
  });

  it('names a shape', () => {
    const { shapeId } = handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000' });
    handleNameShape(state, { cell: '0,0', shape_id: shapeId, name: 'box' });
    const cell = state.project.cells.getCell('0,0');
    expect(cell.shapes.getByName('box')).toBeDefined();
  });

  it('moves a shape', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'box' });
    handleMoveShape(state, { cell: '0,0', name: 'box', dx: 3, dy: 2 });
    const shape = state.project.cells.getCell('0,0').shapes.getByName('box');
    expect(shape.params.x).toBe(3);
    expect(shape.params.y).toBe(2);
  });

  it('recolors a shape', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'box' });
    handleRecolorShape(state, { cell: '0,0', name: 'box', color: '#0000ff' });
    expect(state.project.cells.getCell('0,0').shapes.getByName('box').color).toBe('#0000ff');
  });

  it('deletes a shape', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'box' });
    handleDeleteShape(state, { cell: '0,0', name: 'box' });
    expect(state.project.cells.getCell('0,0').shapes.getByName('box')).toBeNull();
  });

  it('lists shapes', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'a' });
    handleDraw(state, 'point', { cell: '0,0', x: 1, y: 1, color: '#0000ff', shape_name: 'b' });
    const list = handleListShapes(state, { cell: '0,0' });
    expect(list.length).toBe(2);
  });

  it('sets z-index', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'box' });
    handleSetZ(state, { cell: '0,0', name: 'box', z: 10 });
    expect(state.project.cells.getCell('0,0').shapes.getByName('box').zIndex).toBe(10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mcp/shape-tools.test.js`
Expected: FAIL

**Step 3: Implement shape-tools.js**

```js
// server/mcp/shape-tools.js

export function handleNameShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.shapes.nameShape(params.shape_id, params.name);
  state.broadcast?.({ type: 'shape_named', cell: params.cell, shapeId: params.shape_id, name: params.name });
}

export function handleMoveShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.moveShape(params.name, params.dx, params.dy);
  state.broadcast?.({ type: 'shape_moved', cell: params.cell, name: params.name, dx: params.dx, dy: params.dy });
}

export function handleRecolorShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.recolorShape(params.name, params.color);
  state.broadcast?.({ type: 'shape_recolored', cell: params.cell, name: params.name, color: params.color });
}

export function handleDeleteShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.deleteShape(params.name);
  state.broadcast?.({ type: 'shape_deleted', cell: params.cell, name: params.name });
}

export function handleListShapes(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  return cell.shapes.listByZ().map((s) => s.toJSON());
}

export function handleSetZ(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.setZ(params.name, params.z);
  state.broadcast?.({ type: 'shape_z', cell: params.cell, name: params.name, z: params.z });
}

export function registerShapeTools(server, state) {
  server.tool('sprite_name_shape', {
    description: 'Give a name to a shape',
    cell: { type: 'string' }, shape_id: { type: 'string' }, name: { type: 'string' },
  }, (params) => {
    handleNameShape(state, params);
    return { content: [{ type: 'text', text: `Named shape ${params.shape_id} as "${params.name}"` }] };
  });

  server.tool('sprite_move_shape', {
    description: 'Move a named shape by offset',
    cell: { type: 'string' }, name: { type: 'string' },
    dx: { type: 'number' }, dy: { type: 'number' },
  }, (params) => {
    handleMoveShape(state, params);
    return { content: [{ type: 'text', text: `Moved "${params.name}" by (${params.dx},${params.dy})` }] };
  });

  server.tool('sprite_recolor_shape', {
    description: 'Change color of a named shape',
    cell: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' },
  }, (params) => {
    handleRecolorShape(state, params);
    return { content: [{ type: 'text', text: `Recolored "${params.name}" to ${params.color}` }] };
  });

  server.tool('sprite_delete_shape', {
    description: 'Delete a named shape',
    cell: { type: 'string' }, name: { type: 'string' },
  }, (params) => {
    handleDeleteShape(state, params);
    return { content: [{ type: 'text', text: `Deleted "${params.name}"` }] };
  });

  server.tool('sprite_list_shapes', {
    description: 'List all shapes in a cell',
    cell: { type: 'string' },
  }, (params) => {
    const shapes = handleListShapes(state, params);
    const lines = shapes.map((s) => `  ${s.name ?? s.id}: ${s.type} z=${s.zIndex} color=${s.color}`);
    return { content: [{ type: 'text', text: `Shapes in ${params.cell}:\n${lines.join('\n')}` }] };
  });

  server.tool('sprite_set_z', {
    description: 'Change z-order of a shape',
    cell: { type: 'string' }, name: { type: 'string' }, z: { type: 'number' },
  }, (params) => {
    handleSetZ(state, params);
    return { content: [{ type: 'text', text: `Set "${params.name}" z-index to ${params.z}` }] };
  });
}
```

**Step 4: Implement cell-tools.js, group-tools.js, history-tools.js**

Follow the identical pattern — exported handler functions + `register*Tools(server, state)`. Cell tools wrap `CellManager.shiftCell`, `mirrorCell`, `copyCell`, `clear`, `nameCell`. Group tools wrap `GroupManager.create`, `addCells`, `removeCells`, `list`, and a `batchTransform` that iterates group cells and applies a named operation. History tools wrap `cell.undo()` and `cell.redo()`.

Each file should be under 120 lines. Tests for cell-tools and group-tools follow the same structure as shape-tools tests above.

**Step 5: Run all tests**

Run: `npx vitest run tests/mcp/`
Expected: All PASS

**Step 6: Commit**

```bash
git add server/mcp/shape-tools.js server/mcp/cell-tools.js server/mcp/group-tools.js server/mcp/history-tools.js tests/mcp/
git commit -m "feat: MCP shape, cell, group, history tools"
```

---

### Task 13: MCP View & Export Tools

**Files:**
- Create: `server/mcp/view-tools.js`
- Create: `tests/mcp/view-tools.test.js`

**Step 1: Write failing tests**

```js
// tests/mcp/view-tools.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/mcp/drawing-tools.js';
import { handleViewCell, handleViewSheet, handleExportPng } from '../../server/mcp/view-tools.js';
import fs from 'fs';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), '.tmp');

describe('View tools', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: () => {},
    };
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('renders a cell to a temp PNG and returns the path', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 8, h: 8, color: '#ff0000' });
    const result = handleViewCell(state, { cell: '0,0' }, TMP_DIR);
    expect(fs.existsSync(result.path)).toBe(true);
    const buf = fs.readFileSync(result.path);
    expect(buf[0]).toBe(0x89); // PNG magic
  });

  it('renders full sheet', () => {
    const result = handleViewSheet(state, {}, TMP_DIR);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('exports to a user-specified path', () => {
    const outPath = path.join(TMP_DIR, 'export.png');
    handleExportPng(state, { target: 'sheet', path: outPath });
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mcp/view-tools.test.js`
Expected: FAIL

**Step 3: Implement view-tools.js**

View tools render using `CanvasRenderer`, write to a temp file (for `view_*` tools) or user-specified path (for `export_*`), and return the path so Claude can `Read` the image.

```js
// server/mcp/view-tools.js
import fs from 'fs';
import path from 'path';
import { CanvasRenderer } from '../engine/canvas-renderer.js';

function getRenderer(state) {
  return new CanvasRenderer(state.project.palette, { background: state.project.background });
}

function tmpPath(tmpDir, name) {
  fs.mkdirSync(tmpDir, { recursive: true });
  return path.join(tmpDir, `${name}-${Date.now()}.png`);
}

export function handleViewCell(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  const renderer = getRenderer(state);
  const buf = renderer.renderCell(cell);
  const p = tmpPath(tmpDir, `cell-${params.cell.replace(',', '-')}`);
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleViewCells(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const cells = params.cells.map((ref) => state.project.cells.getCell(ref));
  const renderer = getRenderer(state);
  const buf = renderer.renderCells(cells);
  const p = tmpPath(tmpDir, 'cells');
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleViewSheet(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const renderer = getRenderer(state);
  const buf = renderer.renderSheet(state.project.cells);
  const p = tmpPath(tmpDir, 'sheet');
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleExportPng(state, params) {
  if (!state.project) throw new Error('No project open');
  const renderer = getRenderer(state);
  let buf;
  if (params.target === 'sheet') {
    buf = renderer.renderSheet(state.project.cells);
  } else if (params.target.includes(',')) {
    // Single cell
    const cell = state.project.cells.getCell(params.target);
    buf = renderer.renderCell(cell);
  } else {
    // Group name
    const cellRefs = state.project.groups.get(params.target);
    if (!cellRefs) throw new Error(`Unknown target: ${params.target}`);
    const cells = cellRefs.map((ref) => state.project.cells.getCell(ref));
    buf = renderer.renderCells(cells);
  }
  fs.writeFileSync(params.path, buf);
  return { path: params.path };
}

export function registerViewTools(server, state) {
  const tmpDir = path.join(process.cwd(), '.tmp');

  server.tool('sprite_view_cell', {
    description: 'Render a cell as PNG for viewing. Returns the file path.',
    cell: { type: 'string' },
  }, (params) => {
    const result = handleViewCell(state, params, tmpDir);
    return { content: [{ type: 'image', data: fs.readFileSync(result.path).toString('base64'), mimeType: 'image/png' }] };
  });

  server.tool('sprite_view_cells', {
    description: 'Render multiple cells side by side as PNG',
    cells: { type: 'array', description: 'Array of cell refs' },
  }, (params) => {
    const result = handleViewCells(state, params, tmpDir);
    return { content: [{ type: 'image', data: fs.readFileSync(result.path).toString('base64'), mimeType: 'image/png' }] };
  });

  server.tool('sprite_view_sheet', {
    description: 'Render the full sprite sheet as PNG',
  }, () => {
    const result = handleViewSheet(state, {}, tmpDir);
    return { content: [{ type: 'image', data: fs.readFileSync(result.path).toString('base64'), mimeType: 'image/png' }] };
  });

  server.tool('sprite_export_png', {
    description: 'Export cell, group, or sheet to a PNG file',
    target: { type: 'string', description: '"sheet", cell ref, or group name' },
    path: { type: 'string', description: 'Output file path' },
  }, (params) => {
    handleExportPng(state, params);
    return { content: [{ type: 'text', text: `Exported to ${params.path}` }] };
  });

  server.tool('sprite_export_json', {
    description: 'Export texture atlas metadata as JSON',
    path: { type: 'string', description: 'Output file path' },
  }, (params) => {
    if (!state.project) throw new Error('No project open');
    const atlas = state.project.exportAtlas();
    fs.writeFileSync(params.path, JSON.stringify(atlas, null, 2));
    return { content: [{ type: 'text', text: `Atlas exported to ${params.path}` }] };
  });
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/mcp/view-tools.test.js`
Expected: All PASS

**Step 5: Wire all tools into server/index.js**

Update `server/index.js` to import and call all `register*Tools(server, state)` functions.

**Step 6: Commit**

```bash
git add server/mcp/view-tools.js tests/mcp/view-tools.test.js server/index.js
git commit -m "feat: MCP view and export tools with PNG rendering"
```

---

## Phase 3: Web UI

### Task 14: WebSocket Sync Protocol

**Files:**
- Modify: `server/web/http.js` — wire WebSocket message handler to engine
- Create: `tests/web/sync.test.js`

The sync protocol is simple: the web UI sends operation messages (same shape as MCP tool params), the server dispatches to the same handler functions, then broadcasts the result.

**Step 1: Write failing tests**

```js
// tests/web/sync.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { dispatchWebMessage } from '../../server/web/http.js';

describe('WebSocket sync', () => {
  let state;
  let broadcasts;

  beforeEach(() => {
    broadcasts = [];
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: (msg) => broadcasts.push(msg),
    };
  });

  it('dispatches draw operations', () => {
    const result = dispatchWebMessage(state, {
      action: 'draw',
      type: 'rect',
      params: { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000' },
    });
    expect(result.shapeId).toBeDefined();
    expect(broadcasts.length).toBe(1);
  });

  it('dispatches move_shape', () => {
    dispatchWebMessage(state, {
      action: 'draw',
      type: 'rect',
      params: { cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', shape_name: 'box' },
    });
    dispatchWebMessage(state, {
      action: 'move_shape',
      params: { cell: '0,0', name: 'box', dx: 2, dy: 3 },
    });
    const shape = state.project.cells.getCell('0,0').shapes.getByName('box');
    expect(shape.params.x).toBe(2);
  });

  it('dispatches undo', () => {
    dispatchWebMessage(state, {
      action: 'draw',
      type: 'point',
      params: { cell: '0,0', x: 0, y: 0, color: '#ff0000' },
    });
    dispatchWebMessage(state, { action: 'undo', params: { cell: '0,0' } });
    expect(state.project.cells.getCell('0,0').shapes.listByZ().length).toBe(0);
  });
});
```

**Step 2: Implement `dispatchWebMessage` in http.js**

Add an exported `dispatchWebMessage(state, msg)` function that routes by `msg.action` to the same handler functions used by MCP tools. Wire it into the WebSocket `message` event. Return the result and broadcast.

**Step 3: Run tests**

Run: `npx vitest run tests/web/sync.test.js`
Expected: All PASS

**Step 4: Commit**

```bash
git add server/web/http.js tests/web/sync.test.js
git commit -m "feat: WebSocket dispatch routing to shared engine handlers"
```

---

### Task 15: Web UI — HTML Scaffold & Canvas Editor

**Files:**
- Create: `server/web/public/index.html` (replace placeholder)
- Create: `server/web/public/js/app.js`
- Create: `server/web/public/js/canvas-editor.js`
- Create: `server/web/public/js/websocket.js`
- Create: `server/web/public/css/styles.css` (replace placeholder)

**Step 1: Build HTML scaffold**

The HTML should define the layout regions from the design:
- Left panel: `#tool-palette` + `#color-palette`
- Center: `#canvas-container` with a `<canvas id="editor-canvas">`
- Right panel: `#shape-list` + `#group-panel`
- Bottom bar: `#cell-strip`

**Step 2: Build canvas-editor.js**

This module:
- Creates a canvas element sized to the cell (16x16 or 32x32) with CSS scaling for zoom
- Draws pixel gridlines
- Handles mouse events → pixel coordinates
- Renders all shapes by calling a local render function (mirrors server-side rendering logic)
- On each state update from WebSocket, re-renders

Key functions:
- `init(container, cellSize)` — create canvas, attach events
- `setCell(cellData)` — update displayed cell
- `render()` — redraw from shape data
- `onPixelClick(callback)` — hook for tool dispatch
- `setZoom(level)` — CSS transform scaling

**Step 3: Build websocket.js**

- Connect to `ws://localhost:${port}`
- On `project` message: initialize the UI
- On `draw`/`shape_*`/`cell_*` messages: update local state and re-render
- `send(msg)` — send operation to server

**Step 4: Build app.js**

Wire everything together:
- On page load, connect WebSocket
- On project data received, initialize canvas editor and panels
- Route tool clicks → WebSocket send

**Step 5: Verify manually**

Run: `node server/index.js` (in separate terminal or via MCP)
Open browser to `http://localhost:3377`
Verify the layout renders with the canvas grid visible.

**Step 6: Commit**

```bash
git add server/web/public/
git commit -m "feat: Web UI scaffold with canvas editor and WebSocket"
```

---

### Task 16: Web UI — Tool Palette & Drawing

**Files:**
- Create: `server/web/public/js/tools.js`
- Modify: `server/web/public/js/app.js`

**Step 1: Implement tool palette**

Buttons for: Point, Line, Rect, Circle, Fill, Select/Move. Active tool highlighted.

**Step 2: Implement drawing interaction**

Each tool translates mouse events to operations:
- **Point**: click → `{ action: 'draw', type: 'point', params: { cell, x, y, color } }`
- **Line**: click start → click end → send line
- **Rect**: click corner → drag → release → send rect
- **Circle**: click center → drag radius → release → send circle
- **Fill**: click → send fill
- **Select**: click a shape in the shape list → highlight → drag to move

**Step 3: Implement color palette display**

Render palette swatches from project data. Click to select active color.

**Step 4: Verify manually**

Draw shapes in browser, verify they appear. Use MCP tools to draw, verify browser updates.

**Step 5: Commit**

```bash
git add server/web/public/js/tools.js server/web/public/js/app.js
git commit -m "feat: Web UI drawing tools and color palette"
```

---

### Task 17: Web UI — Panels (Shapes, Groups, Cells)

**Files:**
- Create: `server/web/public/js/panels.js`
- Create: `server/web/public/js/cell-nav.js`

**Step 1: Shape list panel**

- Lists all shapes in the current cell
- Click to select (highlight on canvas)
- Right-click context menu: rename, recolor, delete, change z
- Drag to reorder z-index

**Step 2: Group manager panel**

- Lists all groups
- Create group button (enter name, select cells)
- Click group to filter cell strip to that group's cells
- Delete group button

**Step 3: Cell navigator**

- Thumbnail strip showing all cells (or filtered by group)
- Click to switch active cell
- Current cell highlighted
- Shows cell name or coordinate

**Step 4: Verify manually**

Create shapes via MCP, verify panels update. Create groups, verify cell filtering works.

**Step 5: Commit**

```bash
git add server/web/public/js/panels.js server/web/public/js/cell-nav.js
git commit -m "feat: Web UI shape list, group manager, cell navigator"
```

---

### Task 18: Web UI — Animation Preview

**Files:**
- Create: `server/web/public/js/animation.js`
- Modify: `server/web/public/js/app.js`

**Step 1: Implement animation preview**

- Small fixed-position preview canvas (e.g., 128x128)
- Select a group → play button cycles through cells at configurable FPS (default 8)
- Slider for FPS
- Pause/stop buttons
- Onion skin toggle: when editing a cell that's in a group, show ghost of prev/next cell at 30% opacity

**Step 2: Verify manually**

Create a few cells in a group, preview animation.

**Step 3: Commit**

```bash
git add server/web/public/js/animation.js server/web/public/js/app.js
git commit -m "feat: Web UI animation preview with onion skin"
```

---

## Phase 4: Plugin Integration

### Task 19: Plugin Manifest, MCP Config, Commands, Skill

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `commands/sprite-new.md`
- Create: `commands/sprite-open.md`
- Create: `commands/sprite-export.md`
- Create: `skills/sprite-editing/SKILL.md`

**Step 1: Plugin manifest**

```json
{
  "name": "claude-sprites",
  "version": "0.1.0",
  "description": "Collaborative pixel art sprite sheet editor",
  "author": {
    "name": "Eric Hart"
  },
  "license": "MIT"
}
```

**Step 2: MCP config**

```json
{
  "mcpServers": {
    "claude-sprites": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/index.js"]
    }
  }
}
```

**Step 3: Commands**

```markdown
<!-- commands/sprite-new.md -->
---
name: sprite-new
description: Create a new sprite sheet project
---

Create a new sprite sheet project. Usage: /sprite-new [cell_size] [rows]x[cols] [name]

Parse the arguments and call the sprite_new_project MCP tool. If arguments are missing, ask the user.

Defaults: cell_size=16, grid=4x4, name="untitled"
```

```markdown
<!-- commands/sprite-open.md -->
---
name: sprite-open
description: Open a .sprites project file
---

Open a sprite sheet project file. Usage: /sprite-open [path]

Call sprite_open_project with the given path. If no path given, look for .sprites files in the current directory and list them.
```

```markdown
<!-- commands/sprite-export.md -->
---
name: sprite-export
description: Export sprite sheet to PNG
---

Export the current project. Usage: /sprite-export [target] [path]

Target can be "sheet", a cell ref ("0,0"), or a group name.
Path defaults to ./{project-name}.png

Calls sprite_export_png and sprite_export_json.
```

**Step 4: Skill**

```markdown
<!-- skills/sprite-editing/SKILL.md -->
---
name: sprite-editing
description: Guide for effectively using sprite sheet editing tools. Activate when the user asks to draw, create, or edit pixel art sprites.
---

# Sprite Sheet Editing

You have access to sprite_* MCP tools for pixel art creation. Key workflow:

## Starting
1. Create a project: sprite_new_project (pick cell size, grid dimensions)
2. Load a palette: sprite_load_palette (pico8, gameboy, nes) or sprite_set_palette

## Drawing
- Name your shapes as you draw — `shape_name` param. Use descriptive names like "body", "left_arm", "hat".
- Draw background/large shapes first (lower z-index), details on top.
- Use sprite_view_cell frequently to see your work.

## Organization
- Name cells: sprite_name_cell ("idle_1", "walk_3")
- Group related cells: sprite_create_group ("walk_cycle", ["1,0", "1,1", "1,2", "1,3"])
- Use sprite_view_cells to see a group's frames side by side

## Iteration
- sprite_move_shape to adjust positioning
- sprite_recolor_shape to try different colors
- sprite_undo if something goes wrong

## Export
- sprite_export_png for images
- sprite_export_json for texture atlas metadata

## Web UI
The web UI is available at http://localhost:3377 while the MCP server is running. Tell the user they can open it to see real-time updates and draw alongside you.
```

**Step 5: Commit**

```bash
git add .claude-plugin/ .mcp.json commands/ skills/
git commit -m "feat: Plugin manifest, MCP config, commands, and skill"
```

---

### Task 20: Integration Test & Final Wiring

**Step 1: Verify all tool registrations in index.js**

Ensure `server/index.js` imports and calls:
- `registerProjectTools(server, state)`
- `registerDrawingTools(server, state)`
- `registerShapeTools(server, state)`
- `registerCellTools(server, state)`
- `registerGroupTools(server, state)`
- `registerViewTools(server, state)`
- `registerHistoryTools(server, state)`

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Manual integration test**

1. Install plugin in Claude Code settings
2. Start a new session — verify MCP tools appear
3. `/sprite-new 16 4x4 crab` — creates project
4. Draw shapes via MCP tools — verify web UI updates
5. Draw in web UI — verify MCP state reflects changes
6. Save project, close session, reopen, load — verify persistence
7. Export PNG — verify output

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: Wire all MCP tool registrations, integration verified"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-9 | Engine: shapes, cells, palette, groups, rendering, save/load |
| 2: MCP | 10-13 | All 30 MCP tools wired to the engine |
| 3: Web UI | 14-18 | Browser-based editor with real-time sync |
| 4: Plugin | 19-20 | Claude Code plugin packaging, commands, skill |

Total: 20 tasks. Engine and MCP are fully TDD. Web UI is manually tested (canvas rendering doesn't lend itself to unit tests). Each task ends with a commit.
