import {BITMAP_TEXT_POLICY, measureBitmapText} from './ui-runtime.mjs';

/** Shared validation helpers. Copy data before freezing; never freeze caller objects. @internal */
export function copyUiData(value, seen = new Set()) {
  if (value === null || ['string', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('UI data numbers must be finite'); return value; }
  if (typeof value !== 'object' || seen.has(value)) throw new TypeError('UI data must be acyclic plain data');
  seen.add(value);
  const array = Array.isArray(value);
  if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('UI data must be plain records');
  const result = array ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('UI data has unsupported properties');
    Object.defineProperty(result, key, {value: copyUiData(descriptor.value, seen), enumerable: true, writable: true, configurable: true});
  }
  if (array && (result.length !== value.length || Object.keys(result).length !== value.length)) throw new TypeError('UI arrays must be dense');
  seen.delete(value);
  return result;
}
/** @internal */
export function freezeUiData(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeUiData(child); Object.freeze(value); }
  return value;
}
/** @internal */
export function uiNumber(value, name, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${name} must be finite and >= ${minimum}`);
  return value;
}
/** @internal */
export function uiKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(`Invalid ${name} keys`);
}
/** @internal */
export function uiId(value, name = 'ID', namespaced = false) {
  if (typeof value !== 'string' || !value.trim() || (namespaced && !/^\S+:\S+$/.test(value))) throw new TypeError(`${name} must be a ${namespaced ? 'namespaced ' : ''}nonempty ID`);
  return value;
}
/** @internal */
export function uiRect(value, name = 'rectangle') {
  uiKeys(value, ['x', 'y', 'width', 'height'], name);
  uiNumber(value.x, `${name}.x`, -Number.MAX_VALUE); uiNumber(value.y, `${name}.y`, -Number.MAX_VALUE);
  uiNumber(value.width, `${name}.width`); uiNumber(value.height, `${name}.height`);
  uiNumber(value.x + value.width, `${name}.right`, -Number.MAX_VALUE); uiNumber(value.y + value.height, `${name}.bottom`, -Number.MAX_VALUE);
  return value;
}
/** @internal */
export function uiInsets(value = 0) {
  if (typeof value === 'number') { uiNumber(value, 'padding'); return {top: value, right: value, bottom: value, left: value}; }
  uiKeys(value, ['top', 'right', 'bottom', 'left'], 'insets');
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key => [key, uiNumber(value[key] ?? 0, `insets.${key}`)]));
}

function skinData(value) {
  uiKeys(value, ['frame', 'insets', 'padding', 'minWidth', 'minHeight', 'center', 'tile', 'trim', 'caps', 'contentBounds', 'paintedBounds'], 'skin');
  uiRect(value.frame, 'skin.frame');
  const insets = uiInsets(value.insets), padding = uiInsets(value.padding);
  if (!Object.values(value.frame).every(Number.isInteger) || value.frame.width < 1 || value.frame.height < 1 || !Object.values(insets).every(Number.isInteger)) throw new RangeError('Skin source frame and insets require whole source pixels and positive dimensions');
  if (insets.left + insets.right > value.frame.width || insets.top + insets.bottom > value.frame.height) throw new RangeError('Skin insets exceed source frame');
  for (const key of ['trim', 'contentBounds', 'paintedBounds']) if (value[key] !== undefined && value[key] !== null) uiRect(value[key], `skin.${key}`);
  if (value.center !== undefined && !['include', 'omit'].includes(value.center)) throw new TypeError('Invalid skin center');
  if (value.tile !== undefined && typeof value.tile !== 'boolean') throw new TypeError('Invalid skin tiling');
  if (value.caps) {
    uiKeys(value.caps, ['start', 'end', 'period', 'axis'], 'caps');
    for (const key of ['start', 'end', 'period']) uiNumber(value.caps[key], `caps.${key}`);
    if (value.caps.period === 0 || value.caps.axis !== undefined && !['x', 'y'].includes(value.caps.axis)) throw new RangeError('Invalid cap period or axis');
  }
  return {...value, insets, padding, minWidth: uiNumber(value.minWidth ?? insets.left + insets.right, 'skin.minWidth'), minHeight: uiNumber(value.minHeight ?? insets.top + insets.bottom, 'skin.minHeight'), center: value.center ?? 'include', tile: value.tile ?? true};
}

/** Prepare immutable authored appearance. Role data never grants action or focus authority. */
export function defineTheme(input) {
  const source = copyUiData(input);
  uiKeys(source, ['version', 'id', 'fonts', 'skins', 'roles', 'geometry', 'palette', 'icons', 'placement'], 'theme');
  if (source.version !== 1) throw new TypeError('Unsupported UI theme version');
  uiId(source.id, 'Theme ID', true);
  const fonts = {};
  for (const [id, descriptor] of Object.entries(source.fonts ?? {})) {
    uiId(id); uiKeys(descriptor, ['font', 'policy'], 'font');
    const policy = {...BITMAP_TEXT_POLICY, ...descriptor.policy};
    measureBitmapText(descriptor.font, '', {policy});
    fonts[id] = {...descriptor, policy};
  }
  const skins = Object.fromEntries(Object.entries(source.skins ?? {}).map(([id, value]) => [uiId(id), skinData(value)]));
  const roles = {}, resolving = new Set();
  function resolve(id) {
    if (Object.hasOwn(roles, id)) return roles[id];
    if (!Object.hasOwn(source.roles ?? {}, id)) throw new TypeError(`Unknown theme role: ${id}`);
    if (resolving.has(id)) throw new TypeError(`Theme role alias cycle: ${id}`);
    resolving.add(id);
    const raw = source.roles[id];
    if (typeof raw === 'string') roles[id] = {...resolve(raw)};
    else {
      uiKeys(raw, ['extends', 'font', 'tone', 'glyphTint', 'alternatives', 'padding', 'minWidth', 'minHeight', 'colors', 'edge', 'icons', 'placement', 'density'], `theme role ${id}`);
      const role = {...(raw.extends ? resolve(raw.extends) : {}), ...raw};
      delete role.extends;
      if (role.font !== undefined) {
        if (!Object.hasOwn(fonts, role.font)) throw new TypeError(`Missing font ${role.font} for role ${id}`);
        role.tone ??= fonts[role.font].font.toneNames[0];
        if (!fonts[role.font].font.toneNames.includes(role.tone)) throw new TypeError(`Missing font tone ${role.tone} for role ${id}`);
      } else if (role.tone !== undefined) throw new TypeError(`Role ${id} tone requires a font`);
      if (role.glyphTint !== undefined) {
        if (typeof role.glyphTint !== 'string' || !/^#[\da-f]{6}$/i.test(role.glyphTint)) throw new TypeError(`Role ${id} glyphTint requires #RRGGBB`);
        if (!role.font) throw new TypeError(`Role ${id} glyphTint requires a font`);
      }
      if (role.padding !== undefined) role.padding = uiInsets(role.padding);
      for (const key of ['minWidth', 'minHeight', 'density']) if (role[key] !== undefined) uiNumber(role[key], `role.${key}`);
      if (raw.alternatives !== undefined) {
        if (!Array.isArray(raw.alternatives) || !raw.alternatives.length) throw new TypeError(`Role ${id} requires explicit appearance alternatives`);
        let appearance;
        for (const alternative of raw.alternatives) {
          if (alternative.kind === 'skin') {
            uiKeys(alternative, ['kind', 'id'], 'skin alternative'); uiId(alternative.id);
            if (!appearance && Object.hasOwn(skins, alternative.id)) appearance = {...alternative, skin: skins[alternative.id]};
          } else if (alternative.kind === 'flat') {
            uiKeys(alternative, ['kind', 'color'], 'flat alternative');
            if (typeof alternative.color !== 'string' || !alternative.color) throw new TypeError('Flat alternative requires a color');
            appearance ??= {...alternative};
          } else throw new TypeError(`Unknown appearance alternative for ${id}`);
        }
        if (!appearance) throw new TypeError(`Missing required appearance assets for role ${id}`);
        role.appearance = appearance;
      }
      roles[id] = role;
    }
    resolving.delete(id);
    return roles[id];
  }
  for (const id of Object.keys(source.roles ?? {})) { uiId(id); resolve(id); }
  const geometry = {gap: 0, padding: 0, minTarget: 0, ...source.geometry};
  uiKeys(geometry, ['gap', 'padding', 'minTarget'], 'theme geometry');
  uiNumber(geometry.gap, 'geometry.gap'); uiNumber(geometry.minTarget, 'geometry.minTarget'); geometry.padding = uiInsets(geometry.padding);
  return freezeUiData({...source, format: 'agent-sprites/ui-theme@1', fonts, skins, roles, geometry});
}

export function resolveThemeRole(theme, id) {
  if (theme?.format !== 'agent-sprites/ui-theme@1' || !Object.hasOwn(theme.roles, id)) throw new TypeError(`Unknown theme role: ${id}`);
  return theme.roles[id];
}
