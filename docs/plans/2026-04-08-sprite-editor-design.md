# Claude-Sprites: Collaborative Pixel Art Sprite Sheet Editor

Historical design: its grid-size restrictions were removed in 0.26.0. Current
grids have no product policy caps; see the README for current behavior.

## Overview

A Claude Code plugin for collaborative pixel art sprite sheet editing. A shared canvas engine powers both an MCP server (for Claude's tools) and a web UI (for the user), enabling real-time co-editing of sprite sheets.

## Architecture

Single Node.js process, two interfaces:

```
┌─────────────────────────────────────────┐
│              Node Process               │
│                                         │
│  ┌─────────┐       ┌────────────────┐   │
│  │ MCP      │──────▶│                │   │
│  │ (stdio)  │       │  Canvas Engine │   │
│  └─────────┘       │                │   │
│                     │  - Drawing     │   │
│  ┌─────────┐       │  - Shapes      │   │
│  │ HTTP +   │──────▶│  - Cells       │   │
│  │ WebSocket│◀──────│  - Groups      │   │
│  └─────────┘       │  - Palette     │   │
│       ▲             │  - Undo/Redo   │   │
│       │             └────────────────┘   │
└───────┼─────────────────────────────────┘
        │
   Browser (Web UI)
```

- MCP tools call engine methods directly (in-process)
- Web UI sends operations via WebSocket, engine broadcasts state changes back
- Both interfaces are equal in capability

## Plugin Structure

```
claude-sprites/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── sprite-new.md
│   ├── sprite-open.md
│   └── sprite-export.md
├── skills/
│   └── sprite-editing/
│       └── SKILL.md
├── .mcp.json
├── server/
│   ├── index.js
│   ├── engine/
│   │   ├── canvas-engine.js
│   │   ├── shape-registry.js
│   │   ├── cell-manager.js
│   │   ├── group-manager.js
│   │   └── project.js
│   ├── mcp/
│   │   └── tools.js
│   └── web/
│       ├── http.js
│       └── public/
│           ├── index.html
│           ├── app.js
│           └── styles.css
├── package.json
└── .gitignore
```

## Object Model

### Cell Grid

- Project has a single grid, max 10x10
- Cell size fixed at project creation: 16x16 or 32x32 pixels
- Cells addressed by `row,col` (e.g., `0,0`) or optional name (e.g., `idle_1`)

### Shape Registry

Every drawing operation creates a Shape:

- `id` — auto-generated unique identifier
- `name` — optional, user-assigned (e.g., `left_claw`)
- `type` — point, line, rect, circle, fill
- `params` — original drawing parameters (preserved for non-destructive editing)
- `color` — palette name reference
- `zIndex` — rendering order
- `visible` — toggle visibility

Cells composite their shapes in z-order on every change. At 16x16/32x32 this is instant.

### Groups

Named collections of cell references for animation sequences:

- A cell can belong to multiple groups
- Operations: create, add/remove cells, batch transform, export as strip, preview animation

### Palette

- Project-level array of named colors: `{ name: "shell", color: "#c0392b" }`
- Shapes reference palette entries by name
- Recoloring a palette entry updates all shapes using it
- Built-in presets: NES, Game Boy, PICO-8, etc.

### Background Modes

- Transparent (RGBA alpha = 0) — default
- Chroma key (user-specified color, e.g., `#FF00FF`)
- Set per-project, applied at export. Engine always works in RGBA internally.

### Undo/Redo

Command stack per cell, default depth 50.

## MCP Tools

All prefixed `sprite_`. Colors accepted as hex, palette name, or rgba tuple.

### Project

| Tool | Parameters |
|------|-----------|
| `sprite_new_project` | cell_size, grid_rows, grid_cols, name |
| `sprite_open_project` | path |
| `sprite_save_project` | path? |
| `sprite_set_palette` | colors[] |
| `sprite_load_palette` | preset name |

### Drawing

All take `cell` and optional `shape_name`:

| Tool | Parameters |
|------|-----------|
| `sprite_draw_point` | cell, x, y, color |
| `sprite_draw_line` | cell, x1, y1, x2, y2, color |
| `sprite_draw_rect` | cell, x, y, w, h, color, filled? |
| `sprite_draw_circle` | cell, cx, cy, r, color, filled? |
| `sprite_flood_fill` | cell, x, y, color |

### Shape Management

| Tool | Parameters |
|------|-----------|
| `sprite_name_shape` | cell, shape_id, name |
| `sprite_move_shape` | cell, name, dx, dy |
| `sprite_recolor_shape` | cell, name, color |
| `sprite_delete_shape` | cell, name |
| `sprite_list_shapes` | cell |
| `sprite_set_z` | cell, name, z |

### Cell Operations

| Tool | Parameters |
|------|-----------|
| `sprite_shift_cell` | cell, dx, dy |
| `sprite_mirror_cell` | cell, axis |
| `sprite_copy_cell` | from, to |
| `sprite_clear_cell` | cell |
| `sprite_name_cell` | cell, name |

### Group Operations

| Tool | Parameters |
|------|-----------|
| `sprite_create_group` | name, cells[] |
| `sprite_add_to_group` | name, cells[] |
| `sprite_remove_from_group` | name, cells[] |
| `sprite_list_groups` | — |
| `sprite_batch_transform` | group, operation, params |

### View & Export

| Tool | Parameters |
|------|-----------|
| `sprite_view_cell` | cell |
| `sprite_view_cells` | cells[] |
| `sprite_view_sheet` | — |
| `sprite_export_png` | target, path |
| `sprite_export_json` | path |

### History

| Tool | Parameters |
|------|-----------|
| `sprite_undo` | cell |
| `sprite_redo` | cell |

## Web UI

### Layout

- **Left panel:** Tool palette + color palette
- **Center:** Pixel canvas (single cell zoomed or full grid overview)
- **Right panel:** Shape list, group manager
- **Bottom bar:** Cell thumbnail strip, cell info, background toggle

### Interactions

- Click/drag to draw with selected tool
- Select shapes by name for move/recolor
- Scroll zoom, middle-click pan
- Toggleable pixel gridlines
- Onion skin: ghost overlay of adjacent cells in group
- Animation preview: play group cells at adjustable FPS

### Tech

Vanilla JS + Canvas API. No framework, no build step. Static files served by Express.

## Project File Format

`.sprites` files are JSON:

```json
{
  "version": 1,
  "name": "crab-character",
  "cellSize": 16,
  "grid": { "rows": 4, "cols": 6 },
  "background": { "mode": "transparent" },
  "palette": [
    { "name": "shell", "color": "#c0392b" },
    { "name": "outline", "color": "#1a1a2e" }
  ],
  "cells": {
    "0,0": {
      "name": "idle_1",
      "shapes": [
        {
          "id": "s1",
          "name": "body",
          "type": "rect",
          "params": { "x": 4, "y": 6, "w": 8, "h": 5, "filled": true },
          "color": "shell",
          "zIndex": 0,
          "visible": true
        }
      ]
    }
  },
  "groups": {
    "idle": { "cells": ["0,0", "0,1", "0,2", "0,3"] },
    "walk_cycle": { "cells": ["1,0", "1,1", "1,2", "1,3", "1,4", "1,5"] }
  }
}
```

Export also produces texture atlas JSON (cell positions/dimensions only) for game engine consumption.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | MCP server SDK (stdio transport) |
| `canvas` | Server-side Canvas 2D API for rendering |
| `express` | HTTP server for web UI |
| `ws` | WebSocket for real-time sync |

Dev: `vitest` (tests), `nodemon` (dev reload).

No TypeScript, no bundler at launch. Vanilla JS throughout.
