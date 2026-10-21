import fs from 'fs';
import { Palette } from './palette.js';
import { CellManager } from './cell-manager.js';
import { GroupManager } from './group-manager.js';
import { validateConstructionReplay } from './construction-replay.js';
import { resolveFrameDurationMs, validateFrameDurations, validateAnimationLoops, validateAnimationFps, ANIMATION_DIRECTIONS, resolveAnimationDirection } from '../web/public/js/shared/timing.js';

/** Tag playback directions shared by project authoring, preview and atlas output. */
export const TAG_DIRECTIONS = ANIMATION_DIRECTIONS;

function canonicalGroups(cells,groups) {
  if(!groups||typeof groups!=='object'||Array.isArray(groups))throw new Error('Animation groups must map names to cell arrays');
  return Object.fromEntries(Object.entries(groups).map(([name,refs])=>{
    if(!Array.isArray(refs))throw new Error(`Animation group "${name}" must contain cell references`);
    return [name,refs.map(ref=>cells.resolveRef(ref))];
  }));
}

export class Project {
  constructor({ name, cellWidth, cellHeight, cells, palette, groups, background, pivot, animationFps, animationDirections, frameDurations, animationLoops, shapeGroups, review, constructionReplay }) {
    this.name = name;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.cells = cells;
    this.palette = palette;
    this.groups = GroupManager.fromJSON(canonicalGroups(cells,groups.toJSON()));
    this.background = background ?? { mode: 'transparent' };
    this.pivot = pivot ?? null;
    this.animationFps = validateAnimationFps(animationFps);
    this.animationDirections = animationDirections ?? {};
    this.frameDurations = validateFrameDurations(frameDurations, this);
    this.animationLoops = validateAnimationLoops(animationLoops);
    this.shapeGroups = shapeGroups ?? {};
    this.review = review ?? null;
    this.constructionReplay = constructionReplay === undefined ? null : validateConstructionReplay(constructionReplay, this);
    this.path = null;
  }

  static create({ name, cellSize, cellWidth, cellHeight, rows, cols, palette: presetName }) {
    const w = cellWidth ?? cellSize;
    const h = cellHeight ?? cellSize ?? w;
    const palette = presetName ? Palette.fromPreset(presetName) : new Palette();
    return new Project({
      name,
      cellWidth: w,
      cellHeight: h,
      cells: new CellManager({ w, h }, rows, cols),
      palette,
      groups: new GroupManager(),
    });
  }

  toJSON() {
    return {
      version: 1,
      name: this.name,
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      grid: { rows: this.cells.rows, cols: this.cells.cols },
      background: this.background,
      pivot: this.pivot,
      palette: this.palette.toJSON(),
      cells: this.cells.toJSON().cells,
      groups: canonicalGroups(this.cells,this.groups.toJSON()),
      animationFps: this.animationFps,
      // Omitted when empty so existing project files stay byte-identical.
      ...(Object.keys(this.animationDirections).length ? { animationDirections: this.animationDirections } : {}),
      ...(Object.keys(this.frameDurations).length ? { frameDurations: { ...this.frameDurations } } : {}),
      ...(Object.keys(this.animationLoops).length ? { animationLoops: { ...this.animationLoops } } : {}),
      shapeGroups: this.shapeGroups,
      ...(this.review ? { review: this.review } : {}),
      ...(this.constructionReplay ? { constructionReplay: structuredClone(this.constructionReplay) } : {}),
    };
  }

  save(filePath) {
    const p = filePath ?? this.path;
    if (!p) throw new Error('No file path specified');
    fs.writeFileSync(p, JSON.stringify(this.toJSON(), null, 2));
    this.path = p;
  }

  static fromJSON(data) {
    for (const [name, direction] of Object.entries(data.animationDirections ?? {})) {
      if (!TAG_DIRECTIONS.includes(direction)) throw new Error(`Animation "${name}" direction must be forward, reverse, pingpong or pingpong_reverse`);
    }
    const w = data.cellWidth ?? data.cellSize;
    const h = data.cellHeight ?? data.cellSize ?? w;
    return new Project({
      name: data.name,
      cellWidth: w,
      cellHeight: h,
      cells: CellManager.fromJSON({ rows: data.grid.rows, cols: data.grid.cols, cells: data.cells }, { w, h }),
      palette: Palette.fromJSON(data.palette),
      groups: GroupManager.fromJSON(data.groups),
      background: data.background,
      pivot: data.pivot,
      animationFps: data.animationFps,
      animationDirections: data.animationDirections,
      frameDurations: data.frameDurations,
      animationLoops: data.animationLoops,
      shapeGroups: data.shapeGroups,
      review: data.review,
      constructionReplay: data.constructionReplay,
    });
  }

  static load(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const proj = Project.fromJSON(data);
    proj.path = filePath;
    return proj;
  }

  _asepriteFrame(filename, rect, duration) {
    return {
      filename,
      frame: rect,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: rect.w, h: rect.h },
      sourceSize: { w: rect.w, h: rect.h },
      duration,
    };
  }

  /**
   * Aseprite JSON sprite-sheet atlas (json-array form) — the de-facto
   * interchange format read by Unity, Godot, and Phaser importers.
   * Base frames cover the grid row-major; each cell group is appended as its
   * own contiguous frame run and tagged via meta.frameTags, so tags always
   * reference a contiguous range regardless of where the group's cells sit
   * in the grid.
   */
  exportAseprite({ imageName, groups = this.groups.toJSON(), fpsMap = this.animationFps, directionMap = this.animationDirections, defaultFps = 8 } = {}) {
    const frames = [];
    const baseIndex = new Map();
    const namedCells = [];
    // Frame filenames are the frame's own array index — the Aseprite
    // "{frame}" convention that Phaser's createFromAseprite resolves
    // tag ranges against.
    for (let r = 0; r < this.cells.rows; r++) {
      for (let c = 0; c < this.cells.cols; c++) {
        const ref = `${r},${c}`;
        const cell = this.cells.getCell(ref);
        const rect = { x: c * this.cellWidth, y: r * this.cellHeight, w: this.cellWidth, h: this.cellHeight };
        baseIndex.set(ref, frames.length);
        if (cell.name) namedCells.push({ name: cell.name, rect, ref });
        frames.push(this._asepriteFrame(String(frames.length), rect, resolveFrameDurationMs(this, ref, { defaultFps })));
      }
    }

    const frameTags = [];
    for (const [name, cells] of Object.entries(canonicalGroups(this.cells,groups))) {
      if (!cells || cells.length === 0) continue;
      const from = frames.length;
      for (const ref of cells) {
        const bi = baseIndex.get(ref);
        if (bi === undefined) throw new Error(`Group "${name}" references unknown cell "${ref}"`);
        frames.push(this._asepriteFrame(String(frames.length), { ...frames[bi].frame }, resolveFrameDurationMs(this, ref, { group: name, defaultFps, fpsMap })));
      }
      frameTags.push({ name, from, to: frames.length - 1, direction: resolveAnimationDirection(this, name, directionMap), ...(Object.hasOwn(this.animationLoops, name) ? { loop: this.animationLoops[name] } : {}) });
    }

    // Named cells become alias frames AFTER every tag run, so tools that look
    // up frames by name (e.g. Phaser's add.image(x, y, key, 'girder')) work
    // without disturbing the numeric tag indexing.
    const usedNames = new Set();
    for (const { name, rect, ref } of namedCells) {
      if (usedNames.has(name)) continue;
      usedNames.add(name);
      frames.push(this._asepriteFrame(name, { ...rect }, resolveFrameDurationMs(this, ref, { defaultFps })));
    }

    const slices = this.pivot
      ? [{
          name: 'pivot',
          color: '#0000ffff',
          keys: [{
            frame: 0,
            bounds: { x: 0, y: 0, w: this.cellWidth, h: this.cellHeight },
            pivot: { x: this.pivot.x, y: this.pivot.y },
          }],
        }]
      : [];

    return {
      frames,
      meta: {
        app: 'https://github.com/ehartye/agent-sprites',
        version: '1.0',
        image: imageName,
        format: 'RGBA8888',
        size: { w: this.cells.cols * this.cellWidth, h: this.cells.rows * this.cellHeight },
        scale: '1',
        frameTags,
        slices,
      },
    };
  }
}
