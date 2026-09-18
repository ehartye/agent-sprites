import { resolve } from 'node:path';

export function mapCommandToApi(cmd) {
  const { command, ...params } = cmd;
  switch (command) {
    case 'new': {
      const sizeMatch = typeof params.size === 'string' ? params.size.match(/^(\d+)x(\d+)$/i) : null;
      return { method: 'POST', path: '/api/session/new', body: {
        name: params.name,
        ...(sizeMatch
          ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
          : { size: params.size }),
        rows: params.rows, cols: params.cols, palette: params.palette,
        cwd: process.cwd(),
        dest: params.dest ? resolve(String(params.dest)) : undefined,
      }};
    }
    case 'clone-cell': {
      const to = Array.isArray(params.to) ? params.to : String(params.to).split(/\s+/).filter(Boolean);
      return { method: 'POST', path: '/api/cell/clone-fanout', body: { from: params.from, to } };
    }
    case 'pivot':
      return { method: 'POST', path: '/api/session/pivot', body: {
        x: params.x, y: params.y, anchor: params.anchor,
      }};
    case 'ref':
      return params.sub === 'clear'
        ? { method: 'POST', path: '/api/cell/reference', body: { cell: params.cell, path: null } }
        : { method: 'POST', path: '/api/cell/reference', body: {
            cell: params.cell, path: resolve(String(params.path)), opacity: params.opacity,
          }};
    case 'save':
      return { method: 'POST', path: '/api/session/save', body: {} };
    case 'export':
      return { method: 'POST', path: '/api/session/export', body: {
        dest: params.dest ? resolve(String(params.dest)) : undefined,
      }};
    case 'shape-group': {
      const body = { cell: params.cell, name: params.name };
      switch (params.sub) {
        case 'create': return { method: 'POST', path: '/api/group/shape/create', body: {
          ...body, shapes: params.shapes, all_cells: params.all_cells, pattern: params.pattern,
        }};
        case 'add':    return { method: 'POST', path: '/api/group/shape/add', body: { ...body, shapes: params.shapes } };
        case 'remove': return { method: 'POST', path: '/api/group/shape/remove', body: { ...body, shapes: params.shapes } };
        case 'delete': return { method: 'POST', path: '/api/group/shape/delete', body };
        default: throw new Error(`Unknown shape-group sub-command: ${params.sub}`);
      }
    }
    case 'duplicate':
      return { method: 'POST', path: '/api/shape/duplicate', body: {
        cell: params.cell, shape: params.shape, as: params.as, mirror: params.mirror,
      }};
    case 'tween': {
      const xy = (v) => {
        if (v == null || typeof v === 'object') return v ?? undefined;
        const m = String(v).match(/^(-?\d+),(-?\d+)$/);
        if (!m) throw new Error(`tween "to"/"from" must be "X,Y" or {x,y}, got "${v}"`);
        return { x: Number(m[1]), y: Number(m[2]) };
      };
      return { method: 'POST', path: '/api/shape/tween', body: {
        group: params.group, shape: params.shape,
        to: xy(params.to), from: xy(params.from),
        to_updates: params.to_updates, from_updates: params.from_updates,
        ease: params.ease,
      }};
    }
    case 'move-group':
      return { method: 'POST', path: '/api/group/shape/move', body: {
        name: params.name, cell: params.cell, all_cells: params.all_cells, dx: params.dx, dy: params.dy,
      }};
    case 'recolor-group':
      return { method: 'POST', path: '/api/group/shape/recolor', body: {
        name: params.name, cell: params.cell, all_cells: params.all_cells, color: params.color,
      }};
    case 'draw':
      return { method: 'POST', path: '/api/draw', body: {
        type: params.type, cell: params.cell, color: params.color,
        shape_name: params.name ?? params.shape_name,
        x: params.x, y: params.y,
        x1: params.x1, y1: params.y1, x2: params.x2, y2: params.y2,
        cx: params.cx, cy: params.cy,
        r: params.r, rx: params.rx, ry: params.ry,
        w: params.w, h: params.h,
        points: params.points,
        filled: params.filled,
        shape: params.shape, direction: params.direction, strength: params.strength,
        count: params.count,
        dither: params.dither,
        span_deg: params.span_deg,
        radius_factor: params.radius_factor,
        intensity: params.intensity,
        from_deg: params.from_deg,
        to_deg: params.to_deg,
        clip_to: params.clip_to,
        shape_prefix: params.shape_prefix,
        shapes: params.shapes,
        group: params.group,
        cell_group: params.cell_group,
      }};
    case 'rename':
      return { method: 'POST', path: '/api/shape/name', body: {
        cell: params.cell, shape_id: params.shape_id, name: params.name,
      }};
    case 'move':
      return { method: 'POST', path: '/api/shape/move', body: {
        cell: params.cell, name: params.shape, dx: params.dx, dy: params.dy,
      }};
    case 'move-to':
      return { method: 'POST', path: '/api/shape/move-to', body: {
        cell: params.cell, shape: params.shape, x: params.x, y: params.y,
      }};
    case 'resize':
      return { method: 'POST', path: '/api/shape/resize', body: {
        cell: params.cell, shape: params.shape, updates: params.updates ?? params,
      }};
    case 'recolor':
      return { method: 'POST', path: '/api/shape/recolor', body: {
        cell: params.cell, name: params.shape, color: params.color,
      }};
    case 'delete':
      return { method: 'POST', path: '/api/shape/delete', body: {
        cell: params.cell, name: params.shape,
      }};
    case 'clone':
      return { method: 'POST', path: '/api/shape/clone', body: {
        from_cell: params.from, to_cell: params.to, shape: params.shape, new_name: params.as,
      }};
    case 'flip':
      return { method: 'POST', path: '/api/shape/flip', body: {
        cell: params.cell, name: params.shape, axis: params.axis, about: params.about,
      }};
    case 'rotate':
      return { method: 'POST', path: '/api/shape/rotate', body: {
        cell: params.cell, name: params.shape, deg: params.deg, about: params.about,
      }};
    case 'mirror':
      return { method: 'POST', path: '/api/cell/mirror', body: {
        cell: params.cell, axis: params.axis,
      }};
    case 'rotate-cell':
      return { method: 'POST', path: '/api/cell/rotate', body: {
        cell: params.cell, deg: params.deg,
      }};
    case 'copy':
      return { method: 'POST', path: '/api/cell/copy', body: {
        from: params.from, to: params.to,
      }};
    case 'clear':
      return { method: 'POST', path: '/api/cell/clear', body: { cell: params.cell } };
    case 'name':
      return { method: 'POST', path: '/api/cell/name', body: { cell: params.cell, name: params.as } };
    case 'undo':
      return { method: 'POST', path: '/api/cell/undo', body: { cell: params.cell } };
    case 'redo':
      return { method: 'POST', path: '/api/cell/redo', body: { cell: params.cell } };
    case 'group': {
      const sub = params.sub;
      const name = params.name;
      switch (sub) {
        case 'create': return { method: 'POST', path: '/api/group/cell/create', body: { name, cells: params.cells, fps: params.fps } };
        case 'fps':    return { method: 'POST', path: '/api/group/cell/fps', body: { name, fps: params.fps } };
        case 'add':    return { method: 'POST', path: '/api/group/cell/add', body: { name, cells: params.cells } };
        case 'remove': return { method: 'POST', path: '/api/group/cell/remove', body: { name, cells: params.cells } };
        case 'delete': return { method: 'POST', path: '/api/group/cell/delete', body: { name } };
        case 'list':   return { method: 'GET', path: '/api/group/cell/list', body: undefined };
        default: throw new Error(`Unknown group sub-command: ${sub}`);
      }
    }
    default:
      throw new Error(`Unknown batch command: ${command}`);
  }
}

