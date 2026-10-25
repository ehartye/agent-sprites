import {UI_NODE_KINDS} from './ui-components.mjs';
import {projectPixelPoint} from './ui-runtime.mjs';
import {copyUiData, freezeUiData, uiNumber, uiId, uiRect, uiKeys} from './ui-theme.mjs';

const stable = value => JSON.stringify(value, (_, entry) => entry && !Array.isArray(entry) && typeof entry === 'object' ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
const contains = (bounds, point) => bounds && point && point.x >= bounds.x && point.y >= bounds.y && point.x < bounds.x + bounds.width && point.y < bounds.y + bounds.height;
const eligible = record => !!record && record.focusable && record.state === 'visible' && !!record.effectiveFocusBounds && record.effectiveFocusBounds.width > 0 && record.effectiveFocusBounds.height > 0;
const logicalGeometry = record => !!record && record.focusable && !record.hidden && record.state !== 'hidden' && record.focusBounds.width > 0 && record.focusBounds.height > 0;
// Pointer/action eligibility is independent of participation in keyboard focus.
const activatable = record => !!record && record.enabled && record.state === 'visible' && !!record.effectiveHitBounds && record.effectiveHitBounds.width > 0 && record.effectiveHitBounds.height > 0;
const pointerKinds = new Set(['button', 'listRow', 'itemSlot', 'field', 'toggle', 'stepper', 'tabs', 'fold', 'pager']);
const pointerOwner = record => record && (pointerKinds.has(record.kind) || record.actionId !== undefined);
const inputParts = record => (record.parts ?? []).filter(part => part.kind === 'tab' || part.kind === 'adjust');
const semanticKeys = ['id', 'kind', 'role', 'enabled', 'focusable', 'actionId', 'paneId', 'parentId', 'value', 'selection', 'composition', 'min', 'max', 'step', 'options', 'pageCount', 'maxLength', 'label', 'selected', 'appearanceRole', 'variant', 'layout', 'regions', 'metadata', 'hidden', 'extensionId', 'model', 'contextId', 'labelContextId', 'skinContextId', 'semanticContextId'];
function semantic(plan) { return stable({focus: plan.focus, records: plan.records.map(record => Object.fromEntries(semanticKeys.filter(key => record[key] !== undefined).map(key => [key, record[key]])))}); }
function prepare(scope) {
  const source = copyUiData(scope);
  uiKeys(source, ['id', 'plan'], 'interaction scope'); uiId(source.id, 'Scope ID', true);
  const plan = source.plan;
  if (plan?.format !== 'agent-sprites/ui-layout@1' || !Array.isArray(plan.contexts) || !plan.contexts.length || !Array.isArray(plan.records)) throw new TypeError('Expected a portable UI layout plan');
  if (!Number.isInteger(uiNumber(plan.revision, 'model revision'))) throw new RangeError('Invalid model revision');
  const contexts = new Map(), records = new Map();
  for (const context of plan.contexts) {
    uiId(context.id, 'Context ID', true);
    if (contexts.has(context.id)) throw new TypeError('Duplicate context ID');
    if (!Number.isInteger(uiNumber(context.revision, 'context revision'))) throw new RangeError('Invalid context revision');
    projectPixelPoint(context,{x:0,y:0});uiRect(context.viewport,'context viewport');
    contexts.set(context.id, context);
  }
  for (const record of plan.records) {
    uiId(record.id, 'Control ID');
    if (records.has(record.id)) throw new TypeError(`Duplicate control ID ${record.id}`);
    if (!UI_NODE_KINDS.includes(record.kind) || typeof record.enabled !== 'boolean' || typeof record.focusable !== 'boolean' || !['visible', 'clipped', 'hidden'].includes(record.state)) throw new TypeError(`Invalid control ${record.id}`);
    for (const key of ['bounds', 'hitBounds', 'focusBounds']) uiRect(record[key], key);
    for (const key of ['clipBounds', 'effectiveHitBounds', 'effectiveFocusBounds']) if (record[key] !== null) uiRect(record[key], key);
    if (!record.contextRevisions || !Object.keys(record.contextRevisions).length) throw new TypeError('Control requires context dependencies');
    if (!contexts.has(record.semanticContextId) || record.contextRevisions[record.semanticContextId] !== contexts.get(record.semanticContextId).revision) throw new TypeError('Control requires a current semantic context');
    for (const [id, revision] of Object.entries(record.contextRevisions)) if (!contexts.has(id) || contexts.get(id).revision !== revision) throw new TypeError(`Stale or unknown control context ${id}`);
    records.set(record.id, record);
  }
  for (const record of records.values()) if (record.parentId !== undefined && record.parentId !== null && !records.has(record.parentId)) throw new TypeError(`Unknown parent ID ${record.parentId} for ${record.id}`);
  for(const record of records.values())if(record.metadata?.['ui:stateOwner']!==undefined) {
    const id=record.metadata['ui:stateOwner'],owner=records.get(id);
    if(typeof id!=='string'||!owner||!['button','itemSlot'].includes(owner.kind)||owner.metadata?.['ui:stateOwner']!==undefined||!['text','icon','panel'].includes(record.kind)||record.focusable||record.actionId!==undefined||record.focus!==undefined)throw new TypeError('Invalid same-mount state-owner link or authority');
    if(record.parentId!==owner.parentId || record.parentId!==undefined && record.parentId!==null && (!records.has(record.parentId)||[record.id,id].includes(record.parentId)))throw new TypeError('State-owner must be a same-mount sibling');
    if(record.kind==='panel' && (record.parentId===undefined || (record.children??[]).length || [...records.values()].some(r=>r.parentId===record.id) || record.label!==undefined || !Array.isArray(record.parts) || record.parts.some(p=>p.kind!=='flat') || record.state==='visible'&&record.parts.length!==1))throw new TypeError('State-owner panel must be a leaf flat decoration');
    if(plan.focus?.order?.includes(record.id)||['initialId','defaultId','cancelId'].some(key=>plan.focus?.[key]===record.id))throw new TypeError('State-owner consumer cannot gain focus authority');
  }
  plan.focus ??= {};
  uiKeys(plan.focus, ['initialId', 'defaultId', 'cancelId', 'order'], 'focus');
  if (plan.focus.order !== undefined) {
    if (!Array.isArray(plan.focus.order) || plan.focus.order.length > 10000 || new Set(plan.focus.order).size !== plan.focus.order.length) throw new TypeError('Invalid or duplicate focus order');
    for (const id of plan.focus.order) uiId(id, 'Focus order ID');
  }
  for (const [role, id] of Object.entries(plan.focus)) if (role !== 'order' && id !== undefined && !(role === 'initialId' && plan.focus.order?.includes(id)) && (!records.has(id) || role === 'initialId' && !records.get(id).focusable)) throw new TypeError(`Unknown focus ID ${id}`);
  // Suppression is inherited through the semantic tree. A clipped record can
  // instead be an offscreen logical target, including beneath an empty clip.
  // Resolve each ancestry once, without recursion or changing published data.
  const logicalVisibility = new Map();
  for (const record of records.values()) {
    const chain = [], seen = new Set(); let ancestor = record;
    while (ancestor && !logicalVisibility.has(ancestor.id) && !seen.has(ancestor.id)) {
      seen.add(ancestor.id); chain.push(ancestor);
      if (ancestor.hidden || ancestor.state === 'hidden') { logicalVisibility.set(ancestor.id, false); break; }
      const parent = records.get(ancestor.parentId);
      // A collapsed fold remains a visible control while suppressing only its
      // descendants. Do not reuse the fold's own visible memo for its children.
      if (parent?.kind === 'fold' && !parent.value) { logicalVisibility.set(ancestor.id, false); break; }
      ancestor = parent;
    }
    const visible = ancestor ? logicalVisibility.get(ancestor.id) ?? false : true;
    for (const entry of chain) logicalVisibility.set(entry.id, visible);
  }
  freezeUiData(source);
  return {source, plan, contexts, records, logicalVisibility, semantic: semantic(plan)};
}

/** One instance per mounted scope. Hosts feed normalized events; this engine never dispatches. */
export function createUiInteraction(scope, policy = {}) {
  uiKeys(policy, ['navigation', 'wrap', 'restoreId', 'retainUnchangedPresses'], 'interaction policy');
  policy = freezeUiData(copyUiData({navigation: 'ordered', wrap: false, retainUnchangedPresses: false, ...policy}));
  if (!['ordered', 'spatial', 'pane'].includes(policy.navigation) || typeof policy.wrap !== 'boolean' || typeof policy.retainUnchangedPresses !== 'boolean') throw new TypeError('Invalid interaction policy');
  let current = prepare(scope), disposed = false, generation = 0, sequence = 0, focusId = null, hoverId = null;
  const held = new Map(), consumed = new Set(), paneFocus = new Map();
  function candidates(pane) { return (current.plan.focus.order?.map(id => current.records.get(id)) ?? current.plan.records).filter(record => eligible(record) && (pane === undefined || record.paneId === pane)); }
  function setFocus(id) {
    const record = current.records.get(id);
    if (current.plan.focus.order?.includes(id) && !eligible(record) && current.logicalVisibility.get(id) !== false) {focusId = id; return true;}
    if (!eligible(record) || current.plan.focus.order && !current.plan.focus.order.includes(id)) return false;
    focusId = id; paneFocus.set(record.paneId, id); return true;
  }
  function restore(previous) {
    if (setFocus(previous) || setFocus(policy.restoreId) || setFocus(current.plan.focus.initialId)) return;
    focusId = candidates()[0]?.id ?? null;
    if (focusId) setFocus(focusId);
  }
  restore(null);
  function liveToken(token) {
    const record = current.records.get(token.controlId);
    return token.generation === generation && token.modelRevision === current.plan.revision && activatable(record) && token.actionId === record.actionId && (!token.part || inputParts(record).some(part => part.enabled && stable(part) === stable(token.part))) && Object.entries(token.contextRevisions).every(([id, revision]) => current.contexts.get(id)?.revision === revision);
  }
  function tokenFor(record, inputId, part) {
    return {controlId: record.id, actionId: record.actionId, inputId, part, modelRevision: current.plan.revision, contextRevisions: {...record.contextRevisions}, generation, activationId: `${current.source.id}:${generation}:${++sequence}`};
  }
  function change(record, value, extra = {}) { return {kind: 'change', controlId: record.id, value, modelRevision: current.plan.revision, ...extra}; }
  function localChange(record, delta = 1) {
    if (record.kind === 'toggle' || record.kind === 'fold') return change(record, !record.value);
    if (record.kind === 'stepper') return change(record, Math.min(record.max, Math.max(record.min, record.value + delta * record.step)));
    if (record.kind === 'pager') return change(record, Math.min(record.pageCount - 1, Math.max(0, record.value + delta)));
    if (record.kind === 'tabs') {
      const choices = record.options.filter(option => option.enabled !== false), index = choices.findIndex(option => option.id === record.value);
      if (!choices.length) return null;
      return change(record, choices[Math.min(choices.length - 1, Math.max(0, index + delta))].id);
    }
    return null;
  }
  function activate(token) {
    if (!liveToken(token)) return [];
    const record = current.records.get(token.controlId), changed = token.part?.kind === 'tab' ? change(record, token.part.value) : localChange(record, token.part?.delta ?? 1);
    if (changed) return changed.value === record.value ? [] : [changed];
    return token.actionId === undefined ? [] : [{kind: 'activate', controlId: token.controlId, actionId: token.actionId, modelRevision: token.modelRevision, activationId: token.activationId}];
  }
  function once(inputId) {
    uiId(inputId, 'Input identity');
    if (consumed.has(inputId)) return false;
    consumed.add(inputId); return true;
  }
  function point(value, space) {
    if (value === undefined) return undefined;
    uiKeys(value, ['x', 'y'], 'input point'); uiNumber(value.x, 'point.x', -Number.MAX_VALUE); uiNumber(value.y, 'point.y', -Number.MAX_VALUE);
    if (space === undefined) {
      if (current.contexts.size !== 1) throw new TypeError('Multi-context input point requires an explicit point space');
      const context = current.plan.contexts[0];
      return {physical: projectPixelPoint(context, value)};
    }
    if (space === 'physical') return {physical:value};
    uiKeys(space, ['contextId', 'revision'], 'point space');
    const context = current.contexts.get(space.contextId);
    if (!context || context.revision !== space.revision) return {stale:true};
    return {physical:projectPixelPoint(context, value)};
  }
  function localPoint(record, p) {
    if (!p || p.stale) return undefined;
    const context = current.contexts.get(record.semanticContextId);
    return projectPixelPoint(context, p.physical, 'to-local');
  }
  function containsPoint(record, bounds, p) {
    return contains(bounds, localPoint(record, p));
  }
  function targetAt(p) {
    // Disabled owners block lower controls; decorative records never capture input.
    return [...current.plan.records].reverse().find(record => pointerOwner(record) && record.state === 'visible' && containsPoint(record, record.effectiveHitBounds, p));
  }
  function move(direction) {
    if (!['next', 'previous', 'left', 'right', 'up', 'down'].includes(direction)) throw new TypeError('Invalid navigation direction');
    const order = current.plan.focus.order;
    if (order !== undefined && (policy.navigation === 'ordered' || ['next', 'previous'].includes(direction))) {
      if (!order.length) return [];
      const step = ['previous', 'left', 'up'].includes(direction) ? -1 : 1, index = order.indexOf(focusId), raw = index + step;
      const id = order[policy.wrap ? (raw + order.length) % order.length : Math.min(order.length - 1, Math.max(0, raw))];
      // Off-page/clipped targets request the host's existing reveal operation.
      // No synthetic native bounds or activation authority is introduced.
      if (!setFocus(id)) focusId = null;
      return [{kind: 'focus', controlId: id, modelRevision: current.plan.revision}];
    }
    // Explicit logical order admits measured off-page geometry for spatial
    // reveal. Raw focus rectangles stay semantic; activation still requires
    // a visible effective hit region in the current publication.
    const logicalSpatial = order !== undefined && policy.navigation === 'spatial' && !['next','previous'].includes(direction);
    const previous = current.records.get(focusId);
    const pool = logicalSpatial ? order.map(id=>current.records.get(id)).filter(record=>logicalGeometry(record) && current.logicalVisibility.get(record.id)) : candidates(policy.navigation === 'pane' ? previous?.paneId : undefined);
    const from = logicalSpatial ? pool.find(record=>record.id===focusId) : previous;
    const select = id => {
      if (!setFocus(id)) return;
      if (logicalSpatial) return [{kind:'focus',controlId:id,modelRevision:current.plan.revision}];
    };
    if (!pool.length) return;
    if (policy.navigation !== 'spatial' || ['next', 'previous'].includes(direction) || !from) {
      const step = ['previous', 'left', 'up'].includes(direction) ? -1 : 1, index = pool.findIndex(record => record.id === focusId), raw = index + step;
      const next = policy.wrap ? (raw + pool.length) % pool.length : Math.min(pool.length - 1, Math.max(0, raw)); return select(pool[next].id);
    }
    const center = r => {
      const bounds=logicalSpatial?r.focusBounds:r.effectiveFocusBounds;
      const p = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2};
      const c = current.contexts.get(r.semanticContextId);
      return projectPixelPoint(c, p);
    };
    const origin = center(from), horizontal = ['left', 'right'].includes(direction), sign = ['left', 'up'].includes(direction) ? -1 : 1;
    const projected = pool.filter(record => record.id !== from.id).map(record => {
      const c = center(record), primary = (horizontal ? c.x - origin.x : c.y - origin.y) * sign, cross = Math.abs(horizontal ? c.y - origin.y : c.x - origin.x);
      return {record, primary, cross, score: primary + 2 * cross + cross * cross / Math.max(primary, 1)};
    });
    const ranked = projected.filter(value => value.primary > 0).sort((a, b) => a.score - b.score);
    if (ranked.length) return select(ranked[0].record.id);
    else if (policy.wrap && projected.length) {
      // At a directional boundary, wrap to the opposite physical edge, then
      // the nearest cross-axis center. Equal candidates keep semantic order.
      const edge = projected.reduce((min, value) => Math.min(min, value.primary), Infinity);
      let target;
      for (const value of projected) if (value.primary === edge && (!target || value.cross < target.cross)) target = value;
      if (target) return select(target.record.id);
    }
  }

  function handle(input) {
    if (disposed) return [];
    if (!input || typeof input.type !== 'string') throw new TypeError('Expected normalized UI input');
    if (input.modelRevision !== undefined && input.modelRevision !== current.plan.revision || input.scopeId !== undefined && input.scopeId !== current.source.id || input.contextRevisions !== undefined && Object.entries(input.contextRevisions).some(([id, revision]) => current.contexts.get(id)?.revision !== revision)) return [];
    const p = point(input.point, input.pointSpace);
    if (p?.stale) {if (input.inputId) held.delete(input.inputId);return [];}
    let result = [];
    if (input.type === 'navigate') result = move(input.direction) ?? [];
    else if (input.type === 'focus') setFocus(input.controlId);
    else if (input.type === 'pane') {
      uiId(input.paneId, 'Pane ID'); const previous = paneFocus.get(input.paneId);
      if (!setFocus(previous)) setFocus(candidates(input.paneId)[0]?.id);
    } else if (input.type === 'hover') { hoverId = targetAt(p)?.id ?? null; }
    else if (input.type === 'blur') { held.clear(); hoverId = null; }
    else if (input.type === 'press') {
      uiId(input.inputId, 'Input identity'); const record = input.controlId ? current.records.get(input.controlId) : targetAt(p);
      if (held.has(input.inputId) || !activatable(record) || p && (targetAt(p)?.id !== record.id || !containsPoint(record, record.effectiveHitBounds, p))) return [];
      const parts = inputParts(record), part = p && parts.find(part => containsPoint(record, part.hitBounds, p));
      if (p && parts.length && (!part || !part.enabled)) return [];
      setFocus(record.id); held.set(input.inputId, tokenFor(record, input.inputId, part || undefined));
    } else if (input.type === 'release') {
      uiId(input.inputId, 'Input identity'); const token = held.get(input.inputId);
      if (!token) return [];
      held.delete(input.inputId); const record = current.records.get(token.controlId);
      if (input.controlId !== undefined && input.controlId !== token.controlId || p && (targetAt(p)?.id !== token.controlId || !containsPoint(record, record?.effectiveHitBounds, p) || token.part && !containsPoint(record, token.part.hitBounds, p))) return [];
      result = activate(token);
    } else if (['activate', 'default', 'cancel'].includes(input.type)) {
      if (!once(input.inputId)) return [];
      const id = input.type === 'default' ? current.plan.focus.defaultId : input.type === 'cancel' ? current.plan.focus.cancelId : input.controlId ?? focusId;
      if (input.type === 'cancel' && id === undefined) result = [{kind: 'cancel', scopeId: current.source.id, modelRevision: current.plan.revision}];
      else {
        const record = current.records.get(id);
        if (activatable(record)) result = activate(tokenFor(record, input.inputId));
      }
    } else if (['adjust', 'edit', 'selection', 'composition', 'caret', 'delete', 'select'].includes(input.type)) {
      if (!once(input.inputId)) return [];
      const record = current.records.get(input.controlId ?? focusId);
      if (!activatable(record)) return [];
      if (input.type === 'adjust') {
        if (!Number.isInteger(input.delta)) throw new TypeError('Adjustment delta must be an integer');
        const intent = localChange(record, input.delta); if (intent && intent.value !== record.value) result = [intent];
      } else if (input.type === 'select' && record.kind === 'tabs') {
        if (record.options.some(option => option.id === input.value && option.enabled !== false) && record.value !== input.value) result = [change(record, input.value)];
      } else if (record.kind === 'field') {
        const selection = record.selection ?? {start: record.value.length, end: record.value.length, direction: 'none'};
        if (input.type === 'caret') {
          if (!['left', 'right', 'home', 'end'].includes(input.direction) || input.extend !== undefined && typeof input.extend !== 'boolean') throw new TypeError('Invalid caret movement');
          const caret = selection.direction === 'backward' ? selection.start : selection.end, anchor = selection.direction === 'backward' ? selection.end : selection.start;
          const before = [...record.value.slice(0, caret)].at(-1)?.length ?? 0, after = [...record.value.slice(caret)][0]?.length ?? 0;
          const target = input.direction === 'home' ? 0 : input.direction === 'end' ? record.value.length : input.direction === 'left' ? !input.extend && selection.start !== selection.end ? selection.start : caret - before : !input.extend && selection.start !== selection.end ? selection.end : caret + after;
          const next = input.extend ? {start: Math.min(anchor, target), end: Math.max(anchor, target), direction: target === anchor ? 'none' : target < anchor ? 'backward' : 'forward'} : {start: target, end: target, direction: 'none'};
          result = [change(record, record.value, {selection: next, composition: record.composition ?? null})];
        } else if (input.type === 'delete') {
          if (!['backward', 'forward'].includes(input.direction)) throw new TypeError('Invalid delete direction');
          let {start, end} = selection;
          if (start === end) {
            if (input.direction === 'backward') start -= [...record.value.slice(0, start)].at(-1)?.length ?? 0;
            else end += [...record.value.slice(end)][0]?.length ?? 0;
          }
          const value = record.value.slice(0, start) + record.value.slice(end);
          result = [change(record, value, {selection: {start, end: start, direction: 'none'}, composition: null})];
        } else if (input.type === 'selection') {
          if (![input.start, input.end].every(Number.isInteger) || input.start < 0 || input.start > input.end || input.end > record.value.length || !['none', 'forward', 'backward'].includes(input.direction)) throw new RangeError('Invalid selection');
          result = [change(record, record.value, {selection: {start: input.start, end: input.end, direction: input.direction}, composition: record.composition ?? null})];
        } else {
          if (typeof input.text !== 'string') throw new TypeError('Field edit requires text');
          if (input.type === 'composition') result = [change(record, record.value, {selection, composition: input.text})];
          else {
            const capacity = record.maxLength === undefined ? input.text.length : Math.max(0, record.maxLength - record.value.length + selection.end - selection.start), insert = input.text.slice(0, capacity);
            const value = record.value.slice(0, selection.start) + insert + record.value.slice(selection.end), caret = selection.start + insert.length;
            result = [change(record, value, {selection: {start: caret, end: caret, direction: 'none'}, composition: null})];
          }
        }
      }
    } else throw new TypeError(`Unknown normalized UI event: ${input.type}`);
    return freezeUiData(result);
  }

  function update(nextScope) {
    if (disposed) throw new Error('UI interaction is disposed');
    const next = prepare(nextScope);
    if (next.source.id !== current.source.id || next.plan.revision < current.plan.revision) throw new TypeError('Stale scope or model revision');
    let contextChanged = false;
    for (const [id, context] of next.contexts) {
      const prior = current.contexts.get(id);
      if (prior && (context.revision < prior.revision || context.revision === prior.revision && stable(context) !== stable(prior))) throw new TypeError(`Stale context or reused context revision ${id}`);
      if (!prior || context.revision !== prior.revision) contextChanged = true;
    }
    if (next.contexts.size !== current.contexts.size) contextChanged = true;
    if (next.plan.revision === current.plan.revision && (next.semantic !== current.semantic || !contextChanged && stable(next.plan) !== stable(current.plan))) throw new TypeError('Model revision reused for changed data or geometry');
    if (next.plan.revision === current.plan.revision) {
      if (next.plan.themeId !== current.plan.themeId) throw new TypeError('Theme replacement requires a new model revision');
      for (const record of next.plan.records) {
        const prior = current.records.get(record.id);
        if (stable(Object.keys(record.contextRevisions).sort()) !== stable(Object.keys(prior.contextRevisions).sort())) throw new TypeError('Context dependency replacement requires a new model revision');
        const affected = Object.entries(record.contextRevisions).some(([id, revision]) => prior.contextRevisions[id] !== revision);
        if (!affected && stable(record) !== stable(prior)) throw new TypeError(`Unchanged context revision cannot replace geometry for ${record.id}`);
      }
    }
    const modelChanged = next.plan.revision !== current.plan.revision;
    // Opt-in hosts retain the original game binding captured at press time.
    // A model revision elsewhere may then refresh that token only when this
    // control's complete semantic/geometry/context record remains identical.
    const retained = new Set();
    if (modelChanged && policy.retainUnchangedPresses && next.plan.themeId === current.plan.themeId) {
      for (const [id, token] of held) {
        const prior = current.records.get(token.controlId), replacement = next.records.get(token.controlId);
        if (liveToken(token) && replacement && next.logicalVisibility.get(token.controlId) !== false && stable(prior) === stable(replacement)) retained.add(id);
      }
    }
    if (modelChanged) generation++;
    current = next;
    for (const [id, previous] of held) {
      const token = retained.has(id) ? {...previous, generation, modelRevision: current.plan.revision} : previous;
      if (!liveToken(token)) held.delete(id); else if (token !== previous) held.set(id, token);
    }
    restore(focusId);
    if (!current.records.has(hoverId)) hoverId = null;
  }
  function inspect({limit, afterId} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new RangeError('Observation limit must be an integer from 1 to 256');
    const start = afterId === undefined ? 0 : current.plan.records.findIndex(record => record.id === afterId) + 1;
    if (afterId !== undefined && start === 0) throw new TypeError('Unknown observation cursor');
    const controls = current.plan.records.slice(start, start + limit).map(record => ({...record, focused: record.id === focusId, hovered: record.id === hoverId, pressed: [...held.values()].some(token => token.controlId === record.id), disposed}));
    return freezeUiData({scopeId: current.source.id, modelRevision: current.plan.revision, disposed, focusId, hoverId, heldCount: held.size, controls, nextAfterId: start + controls.length < current.plan.records.length ? controls.at(-1).id : null});
  }
  function dispose() { if (!disposed) { disposed = true; generation++; held.clear(); consumed.clear(); paneFocus.clear(); focusId = null; hoverId = null; } }
  return Object.freeze({handle, update, inspect, dispose});
}
