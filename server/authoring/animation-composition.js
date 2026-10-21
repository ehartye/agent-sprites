import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { Palette } from '../engine/palette.js';
import { compileComposition } from '../engine/composition.js';
import { patternTest } from '../engine/patterns.js';
import { snapParams } from '../web/public/js/shared/raster.js';
import { composeTimeline } from '../web/public/js/shared/atlas-timeline.js';
import { validateSurface, validateLighting } from '../web/public/js/shared/surface-model.js';
import { validateSurfaceScene } from '../web/public/js/shared/surface-raster.js';
import {
  resolveFrameDurationMs,
  resolveAnimationLoop,
  resolveAnimationDirection,
  ANIMATION_DIRECTIONS,
  validateFrameDurations,
  validateAnimationFps,
  validateAnimationLoops
} from '../web/public/js/shared/timing.js';
import {
  validateLayers,
  translateParams,
  buildLayerTree
} from '../web/public/js/shared/shape-layers.js';

export const ANIMATION_COMPOSITION_LIMITS = Object.freeze({
  maxInstances: 4096,
  maxAnimatedInstances: 1024,
  maxFrames: 4096,
  maxDurationMs: 60000,
  maxShapes: 200000,
  maxNameLength: 4096,
  maxRasterWork: 64_000_000
});
const MAX_COORD = 1_048_576;
const geometry = {
  point: ['x', 'y'],
  fill: ['x', 'y'],
  line: ['x1', 'y1', 'x2', 'y2'],
  rect: ['x', 'y', 'w', 'h'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'],
  polyline: ['points']
};
const temporal = ['phaseMs', 'delayMs', 'randomPhase', 'loop'];
const plain = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function object(value, fields, label) {
  if (!plain(value)) throw Error(`${label} must be an object`);
  for (const field of Object.keys(value))
    if (!fields.includes(field))
      throw Error(`Unknown ${label} field "${field}"`);
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^\w[\w-]{0,79}$/.test(value))
    throw Error(
      `${label} must contain 1–80 letters, digits, underscores or hyphens`
    );
  return value;
}
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`${label} must be a safe integer from ${min} to ${max}`);
  return value;
}
function bool(value, label) {
  if (typeof value !== 'boolean') throw Error(`${label} must be boolean`);
  return value;
}
function seed(value) {
  if (
    !(typeof value === 'string' && value.length > 0 && value.length <= 160) &&
    !Number.isSafeInteger(value)
  )
    throw Error(
      'Scene seed must be a nonempty string up to 160 characters or a safe integer'
    );
}
function color(palette, value) {
  if (typeof value !== 'string')
    throw Error('Source shape color must be a string');
  const resolved = palette.resolve(value);
  if (
    typeof resolved !== 'string' ||
    !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(resolved)
  )
    throw Error(`Invalid source color "${value}"`);
  return resolved;
}
function dimensions(size) {
  const match = typeof size === 'string' && /^(\d+)x(\d+)$/.exec(size);
  const width = match ? Number(match[1]) : size,
    height = match ? Number(match[2]) : size;
  integer(width, 'Animation width', 1, 2048);
  integer(height, 'Animation height', 1, 2048);
  return { width, height };
}
function background(value, palette) {
  const result = structuredClone(value ?? { mode: 'transparent' });
  if (result.mode === 'chroma') result.color = color(palette, result.color);
  validateLayers([
    { id: 'check', x: 0, y: 0, w: 1, h: 1, z: 0, background: result }
  ]);
  return result;
}
function sourceRef(project, selector) {
  if (typeof selector !== 'string' || !selector.length)
    throw Error('Source frame must be an exact cell coordinate or name');
  let ref;
  const coord = /^(0|[1-9]\d*),(0|[1-9]\d*)$/.exec(selector);
  if (coord) {
    const r = Number(coord[1]),
      c = Number(coord[2]);
    if (
      !Number.isSafeInteger(r) ||
      !Number.isSafeInteger(c) ||
      r >= project.grid.rows ||
      c >= project.grid.cols
    )
      throw Error(`Source cell ${selector} is outside the grid`);
    ref = `${r},${c}`;
  } else {
    const found = Object.entries(project.cells).filter(
      ([, cell]) => cell?.name === selector
    );
    if (found.length !== 1)
      throw Error(`Source frame "${selector}" must name exactly one cell`);
    ref = found[0][0];
  }
  return ref;
}
function primitive(shape, palette) {
  if (
    !plain(shape) ||
    typeof shape.name !== 'string' ||
    !shape.name.length ||
    shape.name.length > ANIMATION_COMPOSITION_LIMITS.maxNameLength ||
    /[\p{Cc}\p{Cs}]/u.test(shape.name)
  )
    throw Error(
      'Source shapes require unique editable names of 1–4096 characters'
    );
  const fields = Object.hasOwn(geometry, shape.type) && geometry[shape.type],
    p = structuredClone(shape.params);
  if (!fields || !plain(p))
    throw Error(`Unsupported source primitive type/parameters: ${shape.type}`);
  for (const field of fields) {
    if (field === 'points') {
      if (
        !Array.isArray(p.points) ||
        p.points.length < (shape.type === 'polygon' ? 3 : 2) ||
        p.points.length > 65536 ||
        p.points.some(
          (pt) =>
            !plain(pt) ||
            ![pt.x, pt.y].every(
              (n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORD
            )
        )
      )
        throw Error('Source geometry points exceed bounds');
    } else if (!Number.isFinite(p[field]) || Math.abs(p[field]) > MAX_COORD)
      throw Error(`Source geometry ${field} exceeds bounds`);
  }
  for (const key of ['w', 'h', 'r', 'rx', 'ry'])
    if (key in p && p[key] < 0) throw Error('Negative source geometry');
  for (const key of ['filled', 'erase'])
    if (key in p) bool(p[key], `Source ${key}`);
  // Directly retained source primitives use the raster's outline default;
  // ordinary draw operations otherwise default newly authored shapes to filled.
  if (['rect', 'circle', 'ellipse', 'polygon'].includes(shape.type))
    p.filled ??= false;
  if (p.filled === false) {
    delete p.pattern;
    delete p.color2;
  }
  if (shape.visible !== undefined) bool(shape.visible, 'Source visible');
  if (p.pattern !== undefined) patternTest(p.pattern);
  if (p.color2 !== undefined) p.color2 = color(palette, p.color2);
  if (p.layers !== undefined) validateLayers(p.layers);
  if (p.surface !== undefined) p.surface = validateSurface(p.surface);
  if (!Number.isFinite(shape.zIndex ?? 0))
    throw Error('Source z order must be finite');
  delete p.composition;
  delete p.asciiPatch;
  return {
    name: shape.name,
    type: shape.type,
    params: p,
    color: color(palette, shape.color),
    visible: shape.visible ?? true,
    zIndex: shape.zIndex ?? 0
  };
}
function sourcePart(part, name, base, cache, sources) {
  object(part, ['project', 'group', 'frames', 'loop'], 'animated part');
  if (
    typeof part.project !== 'string' ||
    !part.project.length ||
    part.project.includes('\\') ||
    part.project.includes('\0') ||
    isAbsolute(part.project) ||
    /^[a-z]:/i.test(part.project)
  )
    throw Error('Source project must use a portable relative file path');
  if (Object.hasOwn(part, 'group') === Object.hasOwn(part, 'frames'))
    throw Error(`Part ${name} requires exactly one group or frames selection`);
  if (part.loop !== undefined) bool(part.loop, 'Part loop');
  const full = realpathSync(resolve(base, part.project));
  if (!statSync(full).isFile()) throw Error('Source project must be a file');
  let loaded = cache.get(full);
  if (!loaded) {
    const bytes = readFileSync(full),
      project = JSON.parse(bytes.toString('utf8'));
    if (
      project.version !== 1 ||
      !plain(project.grid) ||
      !plain(project.cells) ||
      !Array.isArray(project.palette)
    )
      throw Error('Source must be a portable project JSON');
    integer(project.grid.rows, 'Source rows', 1);
    integer(project.grid.cols, 'Source columns', 1);
    const width = integer(
        project.cellWidth ?? project.cellSize,
        'Source width',
        1,
        2048
      ),
      height = integer(
        project.cellHeight ?? project.cellSize ?? width,
        'Source height',
        1,
        2048
      );
    validateFrameDurations(project.frameDurations, project);
    validateAnimationFps(project.animationFps);
    validateAnimationLoops(project.animationLoops);
    const palette = Palette.fromJSON(project.palette);
    loaded = {
      project,
      palette,
      width,
      height,
      frames: new Map(),
      background: background(project.background, palette),
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
    cache.set(full, loaded);
  }
  const { project, palette, width, height } = loaded;
  let refs,
    direction = 'forward';
  if (part.group !== undefined) {
    if (
      typeof part.group !== 'string' ||
      !Array.isArray(project.groups?.[part.group]) ||
      !project.groups[part.group].length
    )
      throw Error(`Unknown or empty source group "${part.group}"`);
    refs = project.groups[part.group].map((ref) => sourceRef(project, ref));
    direction = resolveAnimationDirection(project, part.group);
    if (
      !ANIMATION_DIRECTIONS.includes(
        direction
      )
    )
      throw Error('Unsupported source group direction');
    if (direction === 'reverse' || direction === 'pingpong_reverse')
      refs.reverse();
    if (direction.startsWith('pingpong'))
      refs = refs.concat(refs.slice(1, -1).reverse());
  } else {
    if (!Array.isArray(part.frames) || !part.frames.length)
      throw Error('Source frames must be a nonempty array');
    refs = part.frames.map((ref) => sourceRef(project, ref));
  }
  if (refs.length > 4096) throw Error('Source sequence exceeds 4096 frames');
  const frames = new Map();
  for (const ref of new Set(refs)) {
    if (loaded.frames.has(ref)) {
      frames.set(ref, loaded.frames.get(ref));
      continue;
    }
    const shapes = project.cells[ref]?.shapes ?? [];
    if (
      !Array.isArray(shapes) ||
      shapes.length > ANIMATION_COMPOSITION_LIMITS.maxShapes
    )
      throw Error('Source shapes exceed bounds');
    const selected = shapes.map((shape) => primitive(shape, palette));
    if (new Set(selected.map((shape) => shape.name)).size !== selected.length)
      throw Error('Source shapes must have unique names; duplicate name found');
    selected.sort((a, b) => a.zIndex - b.zIndex);
    buildLayerTree(selected, width, height);
    loaded.frames.set(ref, selected);
    frames.set(ref, selected);
  }
  const identity = { path: part.project, sha256: loaded.sha256 };
  if (!sources.some((s) => s.path === identity.path)) sources.push(identity);
  const sequence = refs.map((cell, index) => ({
    index,
    cell,
    duration: resolveFrameDurationMs(project, cell, { group: part.group })
  }));
  return {
    animated: true,
    width,
    height,
    background: loaded.background,
    project: part.project,
    sha256: loaded.sha256,
    group: part.group,
    direction,
    loop: part.loop ?? resolveAnimationLoop(project, part.group),
    sequence,
    frames
  };
}
function planningProject(palette, width, height) {
  const cell = { width, height, _nextZ: 0, shapes: { listByZ: () => [] } };
  return { palette, cells: { resolveRef: () => '0,0', getCell: () => cell } };
}
function primitiveWork(shape, width, height) {
  if (!shape.visible) return 0;
  const p = snapParams(shape.params);
  if (shape.type === 'point') return 1;
  if (shape.type === 'fill') {
    const surface = p.layers?.at(-1);
    return surface ? surface.w * surface.h : width * height;
  }
  if (shape.type === 'line')
    return Math.max(Math.abs(p.x2 - p.x1), Math.abs(p.y2 - p.y1)) + 1;
  if (shape.type === 'rect') return Math.abs(p.w * p.h) + 2 * (p.w + p.h);
  if (shape.type === 'circle') return (2 * p.r + 1) ** 2 + 8 * (p.r + 1);
  if (shape.type === 'ellipse')
    return (2 * p.rx + 1) * (2 * p.ry + 1) + 8 * (p.rx + p.ry + 1);
  const xs = p.points.map((pt) => pt.x),
    ys = p.points.map((pt) => pt.y),
    w = Math.max(...xs) - Math.min(...xs) + 1,
    h = Math.max(...ys) - Math.min(...ys) + 1;
  return w * h + (w + h) * p.points.length;
}

/** Expand isolated child project poses into ordinary editable, exactly timed cells. */
export function generateAnimationComposition(config, baseDirectory) {
  object(
    config,
    [
      'name',
      'size',
      'palette',
      'seed',
      'durationMs',
      'loop',
      'lighting',
      'parts',
      'placements'
    ],
    'animation'
  );
  identifier(config.name, 'Animation name');
  const { width, height } = dimensions(config.size),
    palette = Palette.fromPreset(config.palette ?? 'pico8');
  if (config.seed !== undefined) seed(config.seed);
  if (config.loop !== undefined) bool(config.loop, 'Animation loop');
  const lighting=validateLighting(config.lighting);
  object(config.parts, Object.keys(config.parts ?? {}), 'parts');
  const project = planningProject(palette, width, height),
    parts = new Map(),
    markers = Object.create(null),
    sources = [],
    cache = new Map();
  for (const [name, part] of Object.entries(config.parts)) {
    identifier(name, 'Part name');
    if (plain(part) && Object.hasOwn(part, 'shapes')) {
      object(part, ['shapes'], 'static part');
      const compiled = compileComposition(project, {
        cell: '0,0',
        prefix: 'validate',
        parts: { [name]: part },
        placements: [{ kind: 'stamp', name: 'static', part: name, x: 0, y: 0 }]
      });
      const shapes = compiled.shapes.map((shape) => {
        const params = structuredClone(shape.params);
        delete params.composition;
        return { ...shape, name: shape.params.composition.localName, params };
      });
      parts.set(name, { animated: false, shapes });
    } else
      parts.set(name, sourcePart(part, name, baseDirectory, cache, sources));
    markers[name] = {
      shapes: [
        {
          name: 'origin',
          type: 'point',
          params: { x: 0, y: 0 },
          color: '#000000',
          visible: false
        }
      ]
    };
  }
  if (!parts.size) throw Error('Animation requires named parts');
  if (!Array.isArray(config.placements) || !config.placements.length)
    throw Error('Animation requires placements');
  const placementByName = new Map();
  const placements = config.placements.map((placement) => {
    if (!plain(placement)) throw Error('Placement must be an object');
    const part = parts.get(placement.part);
    if (!part) throw Error(`Unknown animation part "${placement.part}"`);
    if (!part.animated && temporal.some((key) => Object.hasOwn(placement, key)))
      throw Error('Static parts cannot use temporal placement controls');
    for (const key of ['phaseMs', 'delayMs'])
      if (placement[key] !== undefined) integer(placement[key], key);
    for (const key of ['randomPhase', 'loop'])
      if (placement[key] !== undefined) bool(placement[key], key);
    if (placement.randomPhase) {
      seed(config.seed);
    }
    placementByName.set(placement.name, placement);
    return Object.fromEntries(
      Object.entries(placement).filter(([key]) => !temporal.includes(key))
    );
  });
  const planned = compileComposition(project, {
    cell: '0,0',
    prefix: config.name,
    parts: markers,
    placements
  }).instances;
  const tracks = [],
    instances = planned.map((instance, z) => {
      const declaration = placementByName.get(instance.name.split('/')[0]),
        part = parts.get(instance.part);
      const value = {
        name: instance.name,
        part: instance.part,
        x: instance.x,
        y: instance.y,
        z,
        animated: part.animated
      };
      if (part.animated) {
        if (tracks.length >= 1024)
          throw Error('Animation exceeds 1024 animated instances');
        const period = part.sequence.reduce(
          (sum, frame) => sum + frame.duration,
          0
        );
        const randomPhaseMs = declaration.randomPhase
          ? Number(
              BigInt(
                '0x' +
                  createHash('sha256')
                    .update(
                      JSON.stringify([
                        typeof config.seed,
                        config.seed,
                        instance.name
                      ])
                    )
                    .digest('hex')
              ) % BigInt(period)
            )
          : 0;
        const phaseMs = (declaration.phaseMs ?? 0) + randomPhaseMs;
        integer(phaseMs, 'Combined phase');
        Object.assign(value, {
          phaseMs,
          delayMs: declaration.delayMs ?? 0,
          randomPhaseMs,
          loop: declaration.loop ?? part.loop,
          track: tracks.length
        });
        tracks.push({
          sequence: part.sequence,
          loop: value.loop,
          phaseMs,
          delayMs: value.delayMs
        });
      }
      return value;
    });
  if (!instances.length)
    throw Error('Animation placements expand to no instances');
  const timeline = composeTimeline(
    tracks.length ? tracks : [{ sequence: [{ index: 0, duration: 125 }] }],
    {
      loop: config.loop,
      durationMs: config.durationMs,
      maxTracks: 1024,
      maxSteps: 4096,
      maxDurationMs: 60000
    }
  );
  const cols = Math.min(16, Math.ceil(Math.sqrt(timeline.steps.length))),
    rows = Math.ceil(timeline.steps.length / cols);
  const operations = [
      {
        command: 'new',
        name: config.name,
        size: config.size,
        cols,
        rows,
        palette: config.palette ?? 'pico8'
      }
    ],
    frames = [];
  let totalShapes = 0,
    rasterWork = (cols * rows - timeline.steps.length) * width * height;
  if (cols * rows * width * height > 64_000_000)
    throw Error('Animation exceeds 64000000-pixel raster work budget');
  for (const [index, step] of timeline.steps.entries()) {
    const frameStartWork=rasterWork;
    const cell = `${Math.floor(index / cols)},${index % cols}`,
      alias = `${config.name}_${String(index).padStart(4, '0')}`,
      shapes = [];
    operations.push(
      { command: 'name', cell, as: alias },
      { command: 'duration', cell, ms: step.durationMs }
    );
    const selected = [];
    for (const instance of instances) {
      const part = parts.get(instance.part),
        entry = part.animated
          ? part.sequence[step.frames[instance.track]]
          : null,
        sourceShapes = entry ? part.frames.get(entry.cell) : part.shapes;
      if (entry)
        selected.push({
          instance: instance.name,
          project: part.project,
          cell: entry.cell,
          sequenceIndex: entry.index
        });
      const locals = sourceShapes.length
        ? sourceShapes
        : part.animated && part.background.mode === 'chroma'
          ? [
              {
                name: '__canvas__',
                type: 'point',
                params: { x: 0, y: 0 },
                color: '#000000',
                visible: false,
                zIndex: 0
              }
            ]
          : [];
      for (const local of locals) {
        const params = translateParams(local.params, instance.x, instance.y, {
            layers: true
          }),
          name = `${config.name}:${instance.name}:${encodeURIComponent(local.name)}`;
        if(name.length>ANIMATION_COMPOSITION_LIMITS.maxNameLength)
          throw Error('Qualified shape name exceeds 4096 characters');
        if (!part.animated && params.layers)
          params.layers = params.layers.map((layer, depth) => ({
            ...layer,
            id: `${config.name}:${instance.name}:nested:${layer.id}`,
            z: layer.z + (depth === 0 ? instance.z * 200001 : 0)
          }));
        if (part.animated) {
          const prefix = `${config.name}:${instance.name}:`,
            outer = {
              id: prefix + 'canvas',
              x: instance.x,
              y: instance.y,
              w: part.width,
              h: part.height,
              z: instance.z * 200001,
              background: structuredClone(part.background)
            };
          params.layers = [
            outer,
            ...(params.layers ?? []).map((layer) => ({
              ...layer,
              id: prefix + 'nested:' + layer.id
            }))
          ];
          validateLayers(params.layers);
        }
        for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy'])
          if (
            key in params &&
            (!Number.isFinite(params[key]) || Math.abs(params[key]) > MAX_COORD)
          )
            throw Error('Expanded geometry exceeds bounds');
        if (
          params.points?.some(
            (pt) => Math.abs(pt.x) > MAX_COORD || Math.abs(pt.y) > MAX_COORD
          )
        )
          throw Error('Expanded geometry points exceed bounds');
        params.composition = {
          prefix: config.name,
          part: instance.part,
          instance: instance.name,
          localName: local.name,
          ...(entry
            ? {
                source: {
                  project: part.project,
                  sha256: part.sha256,
                  cell: entry.cell,
                  shape: local.name
                }
              }
            : {})
        };
        const shape = {
          ...local,
          name,
          params,
          zIndex: part.animated
            ? local.zIndex
            : instance.z * 200001 + local.zIndex
        };
        shapes.push(shape);
        totalShapes++;
        if (totalShapes > 200000)
          throw Error('Animation exceeds 200000 expanded shapes');
        rasterWork += primitiveWork(
          shape,
          part.width ?? width,
          part.height ?? height
        );
        if (!Number.isSafeInteger(rasterWork) || rasterWork > 64_000_000)
          throw Error('Animation exceeds 64000000-pixel raster work budget');
        operations.push({
          command: 'draw',
          cell,
          name,
          type: shape.type,
          color: shape.color,
          ...params,
          visible: shape.visible,
          z: shape.zIndex
        });
      }
    }
    if(lighting!==undefined||shapes.some(shape=>shape.params.surface!==undefined))rasterWork=frameStartWork+validateSurfaceScene({shapes,width,height,lighting,palette:palette.toJSON()}).rasterWork;
    else rasterWork += buildLayerTree(shapes, width, height).rasterWork;
    if (rasterWork > 64_000_000)
      throw Error('Animation exceeds 64000000-pixel raster work budget');
    if(lighting!==undefined)operations.push({command:'lighting',cell,lighting:structuredClone(lighting)});
    frames.push({
      alias,
      cell,
      atMs: step.atMs,
      durationMs: step.durationMs,
      sources: selected,
      shapeCount: shapes.length
    });
  }
  operations.push({
    command: 'group',
    sub: 'create',
    name: config.name,
    cells: frames.map((frame) => frame.cell),
    loop: timeline.loop
  });
  return {
    operations,
    report: {
      version: 1,
      ok: true,
      kind: 'animation',
      name: config.name,
      cellSize: { width, height },
      columns: cols,
      rows,
      count: frames.length,
      paddingCells: cols * rows - frames.length,
      durationMs: timeline.durationMs,
      loop: timeline.loop,
      sources,
      parts: Object.fromEntries(
        [...parts].map(([name, part]) => [
          name,
          part.animated
            ? {
                project: part.project,
                sha256: part.sha256,
                group: part.group,
                direction: part.direction,
                loop: part.loop,
                sequence: part.sequence
              }
            : { static: true, shapeCount: part.shapes.length }
        ])
      ),
      instances,
      frames,
      expandedShapes: totalShapes,
      rasterWork,
      limits: ANIMATION_COMPOSITION_LIMITS
    }
  };
}
