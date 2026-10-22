import { validateSurface } from '../web/public/js/shared/surface-model.js';

const sharedParams = new WeakSet();
const immutableKeys = new WeakMap();
export const isSharedParams = params => params !== null && typeof params === 'object' && sharedParams.has(params);

function canonical(value, state, depth = 0) {
  state.depth = Math.max(state.depth, depth);
  if (Array.isArray(value)) return value.map(child => canonical(child, state, depth + 1));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], state, depth + 1)]));
  return value;
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function geometryKey(type, params) {
  return (isSharedParams(params) ? immutableKeys.get(params)?.get(type)?.key : undefined) ?? `[${JSON.stringify(type)},${canonicalJSON(params)}]`;
}

/** The cache only accepts parameter trees frozen and registered by this module. */
export function geometryRecord(type, params) {
  let cache = isSharedParams(params) ? immutableKeys.get(params) : undefined;
  if (cache?.has(type)) return cache.get(type);
  const state = { depth: 0 }, ordered = canonical(params, state);
  const record = { key: geometryKey(type, params), type, params: freeze(ordered), depth: state.depth };
  sharedParams.add(record.params);
  if (isSharedParams(params)) {
    if (!cache) immutableKeys.set(params, cache = new Map());
    cache.set(type, record);
  }
  immutableKeys.set(record.params, new Map([[type, record]]));
  return record;
}

/** Intern before cloning a second expanded parameter graph, including incoming V1. */
export function createGeometryPool() {
  const entries = new Map(), incoming = new WeakMap();
  return (type, params) => {
    let types = incoming.get(params);
    if (types?.has(type)) return types.get(type);
    const key = geometryKey(type, params);
    let pooled = entries.get(key);
    if (!pooled) {
      // Normalize retained surfaces once per unique incoming tree, like Shape's legacy constructor.
      const owned = structuredClone(params);
      if (Object.hasOwn(owned, 'surface')) owned.surface = validateSurface(owned.surface);
      pooled = geometryRecord(type, owned).params;
      entries.set(key, pooled);
    }
    if (!types) incoming.set(params, types = new Map());
    types.set(type, pooled);
    return pooled;
  };
}
