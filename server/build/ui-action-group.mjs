/** Measured action allocation in caller units; native widgets own final equal-policy geometry. */
function record(value, required, optional, label) {
  if (value === null || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain record`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} has missing or unsupported keys`);
  }
}

function array(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      Reflect.ownKeys(value).length !== value.length + 1) {
    throw new TypeError(`${label} must be an ordinary dense array without extra keys`);
  }
  for (let i = 0; i < value.length; i++) {
    if (!Object.hasOwn(value, i)) throw new TypeError(`${label} must be dense`);
  }
}

function nonnegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be finite and nonnegative`);
  }
}

function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError('Action group derived arithmetic must remain finite');
  return value;
}

function order(value, ids, label) {
  array(value, label);
  if (value.length !== ids.size || new Set(value).size !== ids.size || value.some(id => !ids.has(id))) {
    throw new TypeError(`${label} must be an exact permutation of action IDs`);
  }
}

// Every object reached here was constructed locally, never caller-owned data.
function readonly(value) {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) readonly(child);
    Object.freeze(value);
  }
  return value;
}

export function planActionGroup(input) {
  record(input, ['actions', 'visualOrder', 'fallbackOrder', 'width', 'insets', 'gap', 'rowGap', 'policy'], [], 'Action group');
  if (!['equal-max-fit', 'authored-width-end'].includes(input.policy)) throw new TypeError('Unsupported action group policy');
  for (const key of ['width', 'gap', 'rowGap']) nonnegative(input[key], key);
  record(input.insets, ['top', 'right', 'bottom', 'left'], [], 'Insets');
  for (const key of ['top', 'right', 'bottom', 'left']) nonnegative(input.insets[key], `insets.${key}`);
  array(input.actions, 'actions');
  const measures = new Map();
  for (const action of input.actions) {
    record(action, ['id', 'preferredWidth', 'minWidth', 'minHeight'], ['fixedHeight'], 'Action measure');
    if (typeof action.id !== 'string' || action.id.length === 0 || measures.has(action.id)) {
      throw new TypeError('Action IDs must be unique nonempty strings');
    }
    for (const key of ['preferredWidth', 'minWidth', 'minHeight']) nonnegative(action[key], key);
    if (Object.hasOwn(action, 'fixedHeight')) nonnegative(action.fixedHeight, 'fixedHeight');
    if (input.policy === 'equal-max-fit' && action.minWidth !== 0) throw new TypeError('Equal policy requires minWidth zero');
    if (input.policy === 'authored-width-end' &&
        (!Object.hasOwn(action, 'fixedHeight') || action.preferredWidth < action.minWidth)) {
      throw new TypeError('Authored policy requires fixedHeight and preferredWidth >= minWidth');
    }
    measures.set(action.id, action);
  }
  order(input.visualOrder, measures, 'visualOrder');
  order(input.fallbackOrder, measures, 'fallbackOrder');
  const {width, gap, rowGap} = input;
  const insets = {top: input.insets.top, right: input.insets.right, bottom: input.insets.bottom, left: input.insets.left};
  const plan = {
    format: 'agent-sprites/action-group@1', semanticIds: [...measures.keys()],
    paintIds: [...input.visualOrder], width, insets, gap, rowGap,
  };
  if (measures.size === 0) {
    return readonly({...plan, allocation: {kind: 'empty'}, occupiedHeight: {known: true, value: 0}, overflow: {known: true, left: 0, right: 0}});
  }
  if (input.policy === 'equal-max-fit') {
    const inner = finite(finite(width - insets.left) - insets.right);
    const fits = columns => {
      const share = Math.floor(finite(inner - finite(gap * (columns - 1))) / columns);
      return input.actions.every(action => action.preferredWidth <= share);
    };
    let columns = 1, arrangement = 'stack';
    if (inner >= 0 && fits(measures.size)) {
      columns = measures.size; arrangement = 'row';
    } else {
      plan.paintIds = [...input.fallbackOrder];
      if (inner >= 0) {
        for (let count = measures.size; count >= 2; count--) {
          if (fits(count)) { columns = count; arrangement = 'grid'; break; }
        }
      }
    }
    const rows = [];
    let minimum = finite(insets.top + insets.bottom);
    for (let i = 0; i < plan.paintIds.length; i += columns) {
      const row = plan.paintIds.slice(i, i + columns);
      rows.push(row);
      const rowMinimum = row.reduce((maximum, id) => Math.max(maximum, measures.get(id).minHeight), 0);
      minimum = finite(minimum + rowMinimum);
      if (i > 0) minimum = finite(minimum + rowGap);
    }
    return readonly({...plan,
      allocation: {kind: 'native-equal', arrangement, columns, rows},
      occupiedHeight: {known: false, minimum},
      overflow: {known: false, reason: 'native-measurement-required', insetDeficit: Math.max(0, -inner)},
    });
  }
  let cursor = finite(width - insets.right), maxHeight = 0, minX = width, maxRight = 0;
  const slots = [];
  for (let i = plan.paintIds.length - 1; i >= 0; i--) {
    const action = measures.get(plan.paintIds[i]);
    cursor = finite(cursor - action.preferredWidth);
    const height = Math.max(action.fixedHeight, action.minHeight);
    slots.push({id: action.id, x: cursor, y: insets.top, width: action.preferredWidth, height});
    minX = Math.min(minX, cursor);
    maxRight = Math.max(maxRight, finite(cursor + action.preferredWidth));
    maxHeight = Math.max(maxHeight, height);
    cursor = finite(cursor - gap);
  }
  slots.reverse();
  return readonly({...plan,
    allocation: {kind: 'authored', arrangement: 'row', slots},
    occupiedHeight: {known: true, value: finite(finite(insets.top + maxHeight) + insets.bottom)},
    overflow: {known: true, left: Math.max(0, -minX), right: Math.max(0, finite(maxRight - width))},
  });
}
