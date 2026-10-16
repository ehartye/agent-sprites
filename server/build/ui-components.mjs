import {copyUiData, freezeUiData, uiNumber, uiKeys, uiId, uiInsets, uiRect} from './ui-theme.mjs';

export const UI_NODE_KINDS = Object.freeze(['panel', 'header', 'card', 'text', 'button', 'actionBar', 'listRow', 'itemSlot', 'field', 'toggle', 'stepper', 'tabs', 'fold', 'pager', 'progress', 'meter', 'separator', 'icon', 'notice', 'tooltip', 'extension', 'stack', 'row', 'grid', 'absolute']);
const controls = new Set(['button', 'listRow', 'itemSlot', 'field', 'toggle', 'stepper', 'tabs', 'fold', 'pager']);
const values = {
  field: ['value', 'selection', 'composition', 'maxLength'], toggle: ['value'], fold: ['value'],
  stepper: ['value', 'min', 'max', 'step'], progress: ['value', 'min', 'max', 'step'], meter: ['value', 'min', 'max', 'step'],
  tabs: ['value', 'options'], pager: ['value', 'pageCount'], extension: ['extensionId', 'extensionVersion', 'model'],
  actionBar: ['visualOrder', 'fallbackOrder', 'allocationPolicy'], icon: ['asset'], itemSlot: ['asset', 'quantity'],
};
const common = ['id', 'role', 'appearanceRole', 'variant', 'label', 'children', 'layout', 'regions', 'enabled', 'focusable', 'selected', 'actionId', 'paneId', 'contextId', 'labelContextId', 'skinContextId', 'focus', 'metadata', 'hidden'];
const layoutKeys = ['x', 'y', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'preferredWidth', 'preferredHeight', 'grow', 'gap', 'rowGap', 'padding', 'columns', 'overflow', 'scrollX', 'scrollY', 'page', 'align', 'justify', 'wrap', 'lastPageHeight'];

function validateLayout(layout) {
  uiKeys(layout, layoutKeys, 'node layout');
  for (const [key, value] of Object.entries(layout)) {
    if (['overflow', 'align', 'justify', 'padding', 'wrap'].includes(key)) continue;
    uiNumber(value, `layout.${key}`, ['x', 'y'].includes(key) ? -Number.MAX_VALUE : 0);
  }
  if (layout.padding !== undefined) uiInsets(layout.padding);
  if (layout.wrap !== undefined && typeof layout.wrap !== 'boolean') throw new TypeError('Layout wrap must be boolean');
  if (layout.overflow !== undefined && !['visible', 'clip', 'scroll', 'paginate'].includes(layout.overflow)) throw new TypeError('Invalid overflow policy');
  if (layout.align !== undefined && !['start', 'center', 'end', 'stretch'].includes(layout.align)) throw new TypeError('Invalid alignment');
  if (layout.justify !== undefined && !['start', 'center', 'end', 'space-between'].includes(layout.justify)) throw new TypeError('Invalid justification');
  for (const key of ['columns', 'page']) if (layout[key] !== undefined && (!Number.isInteger(layout[key]) || key === 'columns' && layout[key] < 1)) throw new RangeError(`Invalid ${key}`);
  for (const dimension of ['Width', 'Height']) {
    const min = layout[`min${dimension}`] ?? 0, max = layout[`max${dimension}`] ?? Number.MAX_VALUE;
    if (min > max) throw new RangeError('Minimum dimensions exceed maximum');
    for (const key of [dimension.toLowerCase(), `preferred${dimension}`]) if (layout[key] !== undefined && (layout[key] < min || layout[key] > max)) throw new RangeError('Dimensions violate min/max constraints');
  }
}

function make(kind, props) {
  if (!UI_NODE_KINDS.includes(kind)) throw new TypeError(`Unknown UI node kind: ${kind}`);
  uiKeys(props, [...common, ...(values[kind] ?? [])], `${kind} node`); uiId(props.id, 'Node ID');
  const result = {kind, ...props, role: props.role ?? kind, appearanceRole: props.appearanceRole ?? kind, enabled: props.enabled ?? true, focusable: props.focusable ?? controls.has(kind), layout: props.layout ?? {}, children: props.children ?? []};
  uiId(result.role, 'Semantic role'); uiId(result.appearanceRole, 'Appearance role');
  for (const key of ['enabled', 'focusable', 'selected', 'hidden']) if (result[key] !== undefined && typeof result[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
  for (const key of ['actionId', 'paneId', 'contextId', 'labelContextId', 'skinContextId', 'variant']) if (result[key] !== undefined) uiId(result[key], key);
  if (result.label !== undefined && typeof result.label !== 'string') throw new TypeError('Node label must be a string');
  if (!Array.isArray(result.children)) throw new TypeError('Node children must be an array');
  if (result.metadata && Object.keys(result.metadata).some(key => !/^\S+:\S+$/.test(key))) throw new TypeError('Metadata keys must be namespaced');
  validateLayout(result.layout);
  if (result.regions !== undefined) {
    uiKeys(result.regions, ['hit', 'focus'], 'component regions');
    for (const [kind, region] of Object.entries(result.regions)) uiRect(region, `${kind} region`);
  }
  if (['toggle', 'fold'].includes(kind) && typeof result.value !== 'boolean') throw new TypeError(`${kind} value must be boolean`);
  if (kind === 'field') {
    if (typeof result.value !== 'string') throw new TypeError('Field value must be a string');
    if (result.maxLength !== undefined && (!Number.isInteger(result.maxLength) || result.maxLength < result.value.length)) throw new RangeError('Invalid field maxLength');
    result.selection ??= {start: result.value.length, end: result.value.length, direction: 'none'};
    uiKeys(result.selection, ['start', 'end', 'direction'], 'selection');
    const {start, end, direction} = result.selection;
    if (![start, end].every(Number.isInteger) || start < 0 || start > end || end > result.value.length || !['none', 'forward', 'backward'].includes(direction)) throw new RangeError('Invalid field selection');
    result.composition ??= null;
    if (result.composition !== null && typeof result.composition !== 'string') throw new TypeError('Invalid composition state');
  }
  if (['stepper', 'progress', 'meter'].includes(kind)) {
    result.min ??= 0; result.max ??= 1; result.step ??= 1;
    uiNumber(result.min, 'min', -Number.MAX_VALUE); uiNumber(result.max, 'max', result.min); uiNumber(result.value, 'value', result.min);
    if (result.value > result.max || uiNumber(result.step, 'step') === 0) throw new RangeError('Invalid numeric value or step');
  }
  if (kind === 'tabs') {
    if (!Array.isArray(result.options) || !result.options.length) throw new TypeError('Tabs require options');
    const ids = new Set();
    for (const option of result.options) { uiKeys(option, ['id', 'label', 'enabled'], 'tab option'); uiId(option.id); if (ids.has(option.id)) throw new TypeError('Duplicate tab option ID'); ids.add(option.id); if (typeof option.label !== 'string' || option.enabled !== undefined && typeof option.enabled !== 'boolean') throw new TypeError('Invalid tab option'); }
    if (!ids.has(result.value)) throw new TypeError('Unknown selected tab ID');
  }
  if (kind === 'pager' && (!Number.isInteger(result.pageCount) || result.pageCount < 1 || !Number.isInteger(result.value) || result.value < 0 || result.value >= result.pageCount)) throw new RangeError('Invalid pager value or page count');
  if (kind === 'extension') { uiId(result.extensionId, 'Extension ID', true); result.extensionVersion ??= 1; if (result.extensionVersion !== 1) throw new TypeError('Unsupported extension version'); }
  if (kind === 'icon') uiId(result.asset, 'Icon asset');
  if (result.quantity !== undefined) uiNumber(result.quantity, 'quantity');
  if (kind === 'actionBar') {
    result.allocationPolicy ??= 'equal-max-fit';
    if (!['equal-max-fit', 'authored-width-end'].includes(result.allocationPolicy)) throw new TypeError('Invalid action allocation policy');
    result.visualOrder ??= result.children.map(child => child.id); result.fallbackOrder ??= [...result.visualOrder];
    const ids = new Set(result.children.map(child => child.id));
    for (const order of [result.visualOrder, result.fallbackOrder]) if (!Array.isArray(order) || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) throw new TypeError('Action order must be an exact permutation of children');
  }
  return result;
}

/** Validate even raw trees at the publication boundary; caller nodes are always copied. */
export function validateUiTree(tree) {
  const copy = copyUiData(tree), ids = new Map(), focusScopes = [];
  function visit(value) {
    if (!value || typeof value !== 'object') throw new TypeError('Invalid UI node');
    const {kind, ...props} = value, result = make(kind, props);
    if (ids.has(result.id)) throw new TypeError(`Duplicate node ID: ${result.id}`);
    ids.set(result.id, result);
    result.children = result.children.map(visit);
    if (result.focus) focusScopes.push(result.focus);
    return result;
  }
  const result = visit(copy);
  for (const focus of focusScopes) {
    uiKeys(focus, ['initialId', 'defaultId', 'cancelId', 'order'], 'focus');
    if (focus.order !== undefined) {
      if (!Array.isArray(focus.order) || focus.order.length > 10000 || new Set(focus.order).size !== focus.order.length) throw new TypeError('Invalid or duplicate focus order');
      for (const id of focus.order) uiId(id, 'Focus order ID');
    }
    for (const [role, id] of Object.entries(focus)) if (role !== 'order' && id !== undefined && !(role === 'initialId' && focus.order?.includes(id)) && (!ids.has(id) || role === 'initialId' && !ids.get(id).focusable)) throw new TypeError(`Unknown or unfocusable focus ID: ${id}`);
  }
  return freezeUiData(result);
}

export function node(kind, props) { return validateUiTree(make(kind, copyUiData(props))); }
export const panel = props => node('panel', props);
export const header = props => node('header', props);
export const card = props => node('card', props);
export const text = props => node('text', props);
export const button = props => node('button', props);
export const actionBar = props => node('actionBar', props);
export const listRow = props => node('listRow', props);
export const itemSlot = props => node('itemSlot', props);
export const field = props => node('field', props);
export const toggle = props => node('toggle', props);
export const stepper = props => node('stepper', props);
export const tabs = props => node('tabs', props);
export const fold = props => node('fold', props);
export const pager = props => node('pager', props);
export const progress = props => node('progress', props);
export const meter = props => node('meter', props);
export const separator = props => node('separator', props);
export const icon = props => node('icon', props);
export const notice = props => node('notice', props);
export const tooltip = props => node('tooltip', props);
export const extension = props => node('extension', props);
export const stack = props => node('stack', props);
export const row = props => node('row', props);
export const grid = props => node('grid', props);
export const absolute = props => node('absolute', props);

function family(input, body, createRoot = panel) {
  uiKeys(input, ['id', 'title', 'message', 'actions', 'visualOrder', 'fallbackOrder', 'initialId', 'defaultId', 'cancelId', 'layout', 'fields', 'items', 'appearanceRole'], 'family');
  const actions = (input.actions ?? []).map(props => button(props));
  const children = [
    ...(input.title !== undefined ? [header({id: `${input.id}:title`, label: input.title})] : []),
    ...body,
    actionBar({id: `${input.id}:actions`, children: actions, visualOrder: input.visualOrder ?? actions.map(a => a.id), fallbackOrder: input.fallbackOrder ?? input.visualOrder ?? actions.map(a => a.id)}),
  ];
  const focus = Object.fromEntries(['initialId', 'defaultId', 'cancelId'].filter(key => input[key] !== undefined).map(key => [key, input[key]]));
  return createRoot({id: input.id, children, focus, layout: input.layout, ...(input.appearanceRole ? {appearanceRole: input.appearanceRole} : {})});
}
export function confirmationFamily(input) { return family(input, input.message === undefined ? [] : [text({id: `${input.id}:message`, label: input.message})]); }
export function menuFamily(input) { return family(input, []); }
export function formFamily(input) { return family(input, input.fields ?? []); }
export function listFamily(input) { return family(input, input.items ?? []); }

/** Shared conversation/reading shell. Page and scroll values remain caller-controlled. */
export function readingFamily(input) {
  const {speaker, paragraphs, page, bodyLayout, ...base} = copyUiData(input);
  const copy = [...(base.message === undefined ? [] : [base.message]), ...(paragraphs ?? [])];
  if (paragraphs !== undefined && !Array.isArray(paragraphs) || !copy.length || copy.some(value => typeof value !== 'string')) throw new TypeError('Reading family requires text paragraphs or a message');
  const body = [
    ...(speaker === undefined ? [] : [header({id: `${base.id}:speaker`, label: speaker})]),
    stack({id: `${base.id}:body`, layout: {overflow: 'scroll', ...bodyLayout}, children: copy.map((label, index) => text({id: `${base.id}:paragraph:${index}`, label}))}),
  ];
  if (page !== undefined) {
    uiKeys(page, ['value', 'pageCount'], 'reading page');
    body.push(pager({id: `${base.id}:page`, value: page.value, pageCount: page.pageCount}));
  }
  return family(base, body);
}

/** Shared notice/toast shell; timers and game dismissal authority remain outside the portable producer. */
export function noticeFamily(input) {
  const {visible = true, announcementRole = 'status', ...base} = copyUiData(input);
  if (typeof visible !== 'boolean' || !['status', 'alert'].includes(announcementRole) || typeof base.message !== 'string') throw new TypeError('Invalid notice family visibility, announcement role or message');
  return family(base, [text({id: `${base.id}:message`, label: base.message})], props => notice({...props, role: announcementRole, hidden: !visible}));
}

/** Shared HUD regions retain authored arrangement and values; no game rule is inferred. */
export function hudFamily(input) {
  const {items, arrangement = 'row', ...props} = copyUiData(input);
  uiKeys(props, ['id', 'layout', 'appearanceRole', 'contextId', 'paneId'], 'HUD family');
  if (!Array.isArray(items) || !['row', 'stack', 'absolute'].includes(arrangement)) throw new TypeError('HUD family requires stock items and a declared arrangement');
  return node(arrangement, {...props, role: 'hud', focusable: false, children: items});
}
