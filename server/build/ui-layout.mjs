import {pixelResolution, measureBitmapText, placeBitmapText, planNineSlice, projectPixelRect, quantizePhysicalRect} from './ui-runtime.mjs';
import {planActionGroup} from './ui-action-group.mjs';
import {validateUiTree} from './ui-components.mjs';
import {copyUiData, freezeUiData, uiId, uiNumber, uiRect, uiInsets, resolveThemeRole} from './ui-theme.mjs';

const rect = (x, y, width, height) => uiRect({x, y, width, height});
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = values => values.reduce((a, b) => a + b, 0);
const maximum = values => Math.max(0, ...values);
function intersection(a, b) {
  if (!a) return b && {...b}; if (!b) return {...a};
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? rect(x, y, right - x, bottom - y) : null;
}
function union(rects) {
  const values = rects.filter(Boolean); if (!values.length) return null;
  const x = Math.min(...values.map(r => r.x)), y = Math.min(...values.map(r => r.y));
  return rect(x, y, Math.max(...values.map(r => r.x + r.width)) - x, Math.max(...values.map(r => r.y + r.height)) - y);
}
function paintRect(context, bounds) { return projectPixelRect(context, quantizePhysicalRect(projectPixelRect(context, bounds), {mode: 'inside'}), 'to-local'); }
function mapRect(from, to, bounds) { return projectPixelRect(to, projectPixelRect(from, bounds), 'to-local'); }
function contextData(input) {
  uiRect(input.viewport, 'context viewport');
  const mapping = input.localToPhysical;
  if (!mapping || Object.keys(mapping).some(key => !['scale', 'x', 'y'].includes(key))) throw new TypeError('Unsupported context mapping');
  const resolution = pixelResolution({id: input.id, revision: input.revision, localToPhysical: {scale: mapping.scale, origin: {x: mapping.x, y: mapping.y}}, physicalPixelsPerSourcePixel: input.sourcePixelPhysicalSize});
  return {...resolution, viewport: copyUiData(input.viewport)};
}
function textValue(node) {
  if (node.kind === 'field') return node.value;
  if (node.kind === 'pager') return node.label ?? `${node.value + 1} / ${node.pageCount}`;
  if (node.kind === 'stepper') return node.label === undefined ? String(node.value) : `${node.label}: ${node.value}`;
  if (node.kind === 'tabs') return node.options.map(option => option.label).join('  ');
  return node.label;
}

/** Pure preparation: uses source metrics, returns continuous semantics and quantized paint. */
export function layoutUi(tree, environment) {
  const root = validateUiTree(tree), {theme} = environment;
  if (theme?.format !== 'agent-sprites/ui-theme@1') throw new TypeError('Expected a prepared UI theme');
  const revision = uiNumber(environment.revision, 'model revision');
  if (!Number.isInteger(revision)) throw new TypeError('Model revision must be an integer');
  const contexts = [environment.context, ...(environment.additionalContexts ?? [])].map(contextData), contextMap = new Map();
  for (const context of contexts) { if (contextMap.has(context.id)) throw new TypeError(`Duplicate context ID: ${context.id}`); contextMap.set(context.id, context); }
  const prepared = new Map();
  function prepare(node, inherited) {
    const ids = {semantic: node.contextId ?? inherited, skin: node.skinContextId ?? node.contextId ?? inherited, label: node.labelContextId ?? node.contextId ?? inherited};
    for (const id of Object.values(ids)) if (!contextMap.has(id)) throw new TypeError(`Unknown context ${id} for ${node.id}`);
    const context = contextMap.get(ids.semantic), skinContext = contextMap.get(ids.skin), labelContext = contextMap.get(ids.label);
    const roleName = node.variant ? `${node.appearanceRole}.${node.variant}` : node.appearanceRole;
    const role = resolveThemeRole(theme, roleName), skin = role.appearance?.kind === 'skin' ? role.appearance.skin : null;
    const sourcePadding = skin ? Object.fromEntries(Object.entries(skin.padding).map(([k, v]) => [k, v * skinContext.physicalPixelsPerSourcePixel / context.localToPhysical.scale])) : theme.geometry.padding;
    const padding = uiInsets(node.layout.padding ?? role.padding ?? sourcePadding);
    const label = textValue(node), face = role.font === undefined ? null : theme.fonts[role.font];
    if (label !== undefined && !face) throw new TypeError(`Node ${node.id} requires a font role`);
    let extension;
    if (node.kind === 'extension') {
      const entry = environment.extensions?.[node.extensionId];
      if (!entry || entry.version !== node.extensionVersion || typeof entry.measure !== 'function') throw new TypeError(`Missing compatible extension ${node.extensionId}`);
      const measureEnvironment = freezeUiData({theme, context, contexts, revision});
      extension = copyUiData(entry.measure(node.model, measureEnvironment));
      const repeated = copyUiData(entry.measure(node.model, measureEnvironment));
      if (JSON.stringify(extension) !== JSON.stringify(repeated)) throw new TypeError(`Extension ${node.extensionId} measurement is not deterministic`);
      for (const key of ['min', 'preferred']) for (const dimension of ['width', 'height']) uiNumber(extension?.[key]?.[dimension], `extension.${key}.${dimension}`);
      if (extension.min.width > extension.preferred.width || extension.min.height > extension.preferred.height || !['visible', 'clip', 'scroll', 'paginate'].includes(extension.overflow)) throw new TypeError('Invalid extension measurement or overflow');
    }
    const data = {node, context, skinContext, labelContext, role, skin, padding, face, label, extension, gap: node.layout.gap ?? theme.geometry.gap};
    prepared.set(node.id, data);
    for (const child of node.children) prepare(child, ids.semantic);
  }
  prepare(root, contexts[0].id);
  // Reserved semantic metadata grants appearance consumption only.
  const parents=new Map();
  function parentIds(node,parent=null){parents.set(node.id,parent);for(const child of node.children)parentIds(child,node.id);}
  parentIds(root);
  for(const {node,role} of prepared.values())if(node.metadata?.['ui:stateOwner']!==undefined) {
    const id=node.metadata['ui:stateOwner'],owner=prepared.get(id)?.node;
    if(typeof id!=='string'||!owner||!['button','itemSlot'].includes(owner.kind)||owner.metadata?.['ui:stateOwner']!==undefined||!['text','icon','panel'].includes(node.kind)||node.focusable||node.actionId!==undefined||node.focus!==undefined)throw new TypeError('Invalid state-owner link or authority');
    if(node.kind==='panel' && (node.children.length || node.label!==undefined || role.appearance?.kind!=='flat'))throw new TypeError('State-owner panel must be a leaf flat decoration');
    if(parents.get(node.id)!==parents.get(id))throw new TypeError('State-owner must be a same-mount sibling');
    for(const {node:ancestor}of prepared.values())if(ancestor.focus && (ancestor.focus.order?.includes(node.id)||['initialId','defaultId','cancelId'].some(key=>ancestor.focus[key]===node.id)))throw new TypeError('State-owner consumer cannot gain focus authority');
  }

  const measurements = new Map();
  const ratio = (child, parentContext) => prepared.get(child.id).context.localToPhysical.scale / parentContext.localToPhysical.scale;
  const childLength = (child, key, parentContext) => child.layout[key] === undefined ? undefined : child.layout[key] * ratio(child,parentContext);
  function measureChild(child, availableWidth, parentContext) {
    const factor=ratio(child,parentContext), measured=measure(child,availableWidth/factor);
    return {...measured,min:{width:measured.min.width*factor,height:measured.min.height*factor},preferred:{width:measured.preferred.width*factor,height:measured.preferred.height*factor},allocatedHeight:measured.allocatedHeight*factor};
  }
  function measure(node, availableWidth) {
    const width = clamp(node.layout.width ?? availableWidth, node.layout.minWidth ?? 0, node.layout.maxWidth ?? Number.MAX_VALUE);
    let widths = measurements.get(node.id);
    if (!widths) measurements.set(node.id, widths = new Map());
    if (widths.has(width)) return widths.get(width);
    const result = calculateMeasure(node, width);
    widths.set(width, result);
    return result;
  }
  function calculateMeasure(node, availableWidth) {
    const data = prepared.get(node.id), {padding: p, gap, labelContext: c, face, label} = data, l = node.layout;
    const innerWidth = Math.max(0, availableWidth - p.left - p.right);
    let naturalText = {width: 0, height: 0}, wrappedText = naturalText, textMin = 0;
    if (face && label !== undefined) {
      const options = {scale: c.physicalPixelsPerSourcePixel, policy: face.policy};
      naturalText = measureBitmapText(face.font, label, options);
      wrappedText = node.kind === 'tabs' ? naturalText : measureBitmapText(face.font, label, {...options, maxWidth: innerWidth * data.context.localToPhysical.scale});
      naturalText = {width: naturalText.width / data.context.localToPhysical.scale, height: naturalText.height / data.context.localToPhysical.scale};
      wrappedText = {width: wrappedText.width / data.context.localToPhysical.scale, height: wrappedText.height / data.context.localToPhysical.scale};
      textMin = maximum([...label].filter(ch => ch !== '\n').map(ch => measureBitmapText(face.font, ch, options).width / data.context.localToPhysical.scale));
    }
    const children = node.kind === 'fold' && !node.value ? [] : node.children.filter(child => !child.hidden);
    const cellWidth = node.kind === 'grid' ? Math.max(0, (innerWidth - gap * ((l.columns ?? 1) - 1)) / (l.columns ?? 1)) : innerWidth;
    const sizes = children.map(child => measureChild(child, cellWidth, data.context));
    const widths = sizes.map((m, i) => childLength(children[i],'width',data.context) ?? m.preferred.width), heights = sizes.map((m, i) => childLength(children[i],'height',data.context) ?? m.allocatedHeight);
    let childWidth = maximum(widths), childHeight = sum(heights) + gap * Math.max(0, children.length - 1), minWidth = maximum(sizes.map(m => m.min.width)), minHeight = sum(sizes.map(m => m.min.height)) + gap * Math.max(0, children.length - 1), actionPlan;
    if (node.kind === 'row') {
      childWidth = sum(widths) + gap * Math.max(0, children.length - 1); childHeight = maximum(heights);
      minWidth = sum(sizes.map(m => m.min.width)) + gap * Math.max(0, children.length - 1); minHeight = maximum(sizes.map(m => m.min.height));
      const allocatedWidths = fitLengths(children, sizes, innerWidth, 'width', gap, data.context);
      const remeasured = children.map((child, i) => measureChild(child, allocatedWidths[i], data.context));
      childHeight = maximum(remeasured.map((m, i) => childLength(children[i],'height',data.context) ?? m.allocatedHeight));
      minHeight = maximum(remeasured.map(m => m.min.height));
    } else if (node.kind === 'grid') {
      const columns = l.columns ?? 1, rows = Math.ceil(children.length / columns);
      childWidth = maximum(widths) * columns + gap * (columns - 1);
      childHeight = sum(Array.from({length: rows}, (_, i) => maximum(heights.slice(i * columns, (i + 1) * columns)))) + gap * Math.max(0, rows - 1);
      minWidth = maximum(sizes.map(m => m.min.width)) * columns + gap * (columns - 1);
      minHeight = sum(Array.from({length: rows}, (_, i) => maximum(sizes.slice(i * columns, (i + 1) * columns).map(m => m.min.height)))) + gap * Math.max(0, rows - 1);
    } else if (node.kind === 'absolute') {
      childWidth = maximum(widths.map((w, i) => w + (childLength(children[i],'x',data.context) ?? 0))); childHeight = maximum(heights.map((h, i) => h + (childLength(children[i],'y',data.context) ?? 0)));
      minWidth = maximum(sizes.map((m, i) => m.min.width + (childLength(children[i],'x',data.context) ?? 0))); minHeight = maximum(sizes.map((m, i) => m.min.height + (childLength(children[i],'y',data.context) ?? 0)));
    } else if (node.kind === 'actionBar') {
      actionPlan = planActionGroup({actions: children.map((child, i) => ({id: child.id, preferredWidth: widths[i], minWidth: node.allocationPolicy === 'equal-max-fit' ? 0 : sizes[i].min.width, minHeight: sizes[i].min.height, ...(node.allocationPolicy === 'authored-width-end' ? {fixedHeight: heights[i]} : {})})), visualOrder: node.visualOrder, fallbackOrder: node.fallbackOrder, width: l.width ?? availableWidth, insets: p, gap, rowGap: l.rowGap ?? gap, policy: node.allocationPolicy});
      const byId = new Map(children.map((child, i) => [child.id, heights[i]]));
      const rows = actionPlan.allocation.rows;
      childHeight = rows ? sum(rows.map(ids => maximum(ids.map(id => byId.get(id))))) + (l.rowGap ?? gap) * Math.max(0, rows.length - 1) : maximum(heights);
      childWidth = sum(widths) + gap * Math.max(0, widths.length - 1); minWidth = maximum(sizes.map(m => m.min.width)); minHeight = childHeight;
    }
    let preferred = {width: Math.max(naturalText.width, childWidth) + p.left + p.right, height: naturalText.height + childHeight + (children.length && label !== undefined ? gap : 0) + p.top + p.bottom};
    let allocatedHeight = wrappedText.height + childHeight + (children.length && label !== undefined ? gap : 0) + p.top + p.bottom;
    const overflow = l.overflow ?? data.extension?.overflow ?? 'visible', viewport = overflow !== 'visible';
    const minimum = {width: (viewport ? 0 : Math.max(textMin, minWidth)) + p.left + p.right, height: (viewport ? 0 : Math.max(wrappedText.height, minHeight)) + p.top + p.bottom};
    if (data.skin) {
      minimum.width = Math.max(minimum.width, data.skin.minWidth * data.skinContext.physicalPixelsPerSourcePixel / data.context.localToPhysical.scale);
      minimum.height = Math.max(minimum.height, data.skin.minHeight * data.skinContext.physicalPixelsPerSourcePixel / data.context.localToPhysical.scale);
    }
    if (node.focusable) { minimum.width = Math.max(minimum.width, theme.geometry.minTarget); minimum.height = Math.max(minimum.height, theme.geometry.minTarget); }
    if (['progress', 'meter', 'separator'].includes(node.kind)) { preferred.width = Math.max(preferred.width, 40); preferred.height = Math.max(preferred.height, node.kind === 'separator' ? 1 : 6); }
    if (node.kind === 'icon' || node.kind === 'itemSlot' && node.asset) {
      const asset = theme.icons?.[node.asset];
      if (!asset) throw new TypeError(`Missing icon asset ${node.asset}`);
      preferred.width = Math.max(preferred.width, uiNumber(asset.width, 'icon width') * c.physicalPixelsPerSourcePixel / data.context.localToPhysical.scale + p.left + p.right);
      preferred.height = Math.max(preferred.height, uiNumber(asset.height, 'icon height') * c.physicalPixelsPerSourcePixel / data.context.localToPhysical.scale + p.top + p.bottom);
    }
    if (data.extension) { Object.assign(preferred, data.extension.preferred); Object.assign(minimum, data.extension.min); allocatedHeight = preferred.height; }
    for (const [dimension, suffix] of [['width', 'Width'], ['height', 'Height']]) {
      minimum[dimension] = Math.max(minimum[dimension], l[`min${suffix}`] ?? 0, data.role[`min${suffix}`] ?? 0);
      if (minimum[dimension] > (l[`max${suffix}`] ?? Number.MAX_VALUE)) throw new RangeError(`Node ${node.id} measured minimum exceeds maximum ${dimension}`);
      preferred[dimension] = clamp(l[`preferred${suffix}`] ?? preferred[dimension], minimum[dimension], l[`max${suffix}`] ?? Number.MAX_VALUE);
      uiNumber(preferred[dimension], `measured ${dimension}`);
    }
    allocatedHeight = clamp(Math.max(allocatedHeight, minimum.height, preferred.height > naturalText.height + childHeight + p.top + p.bottom ? preferred.height : 0), minimum.height, l.maxHeight ?? Number.MAX_VALUE);
    return {min: minimum, preferred, allocatedHeight, textHeight: wrappedText.height, contentHeight: wrappedText.height + childHeight + (children.length && label !== undefined ? gap : 0), actionPlan};
  }

  function fitLengths(children, measures, available, axis, gap, parentContext) {
    const suffix = axis === 'width' ? 'Width' : 'Height';
    const lengths = children.map((child, i) => childLength(child,axis,parentContext) ?? (axis === 'height' ? measures[i].allocatedHeight : measures[i].preferred.width));
    let extra = available - sum(lengths) - gap * Math.max(0, children.length - 1);
    if (extra > 0) {
      let growing = children.map((child, i) => i).filter(i => children[i].layout[axis] === undefined && children[i].layout.grow > 0);
      while (extra > 1e-8 && growing.length) {
        const total = sum(growing.map(i => children[i].layout.grow)), before = extra;
        for (const i of growing) { const add = Math.min(before * children[i].layout.grow / total, (childLength(children[i],`max${suffix}`,parentContext) ?? Number.MAX_VALUE) - lengths[i]); lengths[i] += add; extra -= add; }
        growing = growing.filter(i => lengths[i] < (childLength(children[i],`max${suffix}`,parentContext) ?? Number.MAX_VALUE));
        if (before === extra) break;
      }
    } else if (extra < 0) {
      const capacity = children.map((child, i) => child.layout[axis] === undefined ? Math.max(0, lengths[i] - measures[i].min[axis]) : 0), total = sum(capacity), take = Math.min(-extra, total);
      if (total) for (let i = 0; i < lengths.length; i++) lengths[i] -= take * capacity[i] / total;
    }
    return lengths;
  }

  const records = [];
  function allocate(node, bounds, inheritedClip, suppressed = false, inheritedPane = 'main', allocationContext, inheritedDependencies = {}) {
    const data = prepared.get(node.id), {padding: p, gap, context, labelContext, skinContext, face, label, skin, role} = data, l = node.layout;
    if (allocationContext && allocationContext.id !== context.id) {
      bounds = mapRect(allocationContext, context, bounds);
      inheritedClip = inheritedClip && mapRect(allocationContext, context, inheritedClip);
    }
    inheritedClip = inheritedClip && intersection(inheritedClip, context.viewport);
    const measured = measure(node, bounds.width), index = records.length;
    const content = rect(bounds.x + p.left, bounds.y + p.top, Math.max(0, bounds.width - p.left - p.right), Math.max(0, bounds.height - p.top - p.bottom));
    const labelContent = mapRect(context, labelContext, content), skinBounds = mapRect(context, skinContext, bounds), skinContent = mapRect(context, skinContext, content);
    const mode = l.overflow ?? data.extension?.overflow ?? 'visible';
    const clip = mode === 'visible' ? inheritedClip : intersection(inheritedClip, content);
    const fullyClipped = inheritedClip === null || mode !== 'visible' && clip === null;
    const hidden = suppressed || !!node.hidden;
    const effectiveHit = hidden || fullyClipped ? null : intersection(bounds, inheritedClip);
    const dependencies = {...inheritedDependencies, ...Object.fromEntries([...new Set([context.id, skinContext.id, labelContext.id])].map(id => [id, contextMap.get(id).revision]))};
    const record = {...node, bounds, hitBounds: {...bounds}, focusBounds: {...bounds}, effectiveHitBounds: effectiveHit, effectiveFocusBounds: effectiveHit && {...effectiveHit}, clipBounds: inheritedClip, contentClipBounds: clip, semanticContextId: context.id, contextRevisions: dependencies, paneId: node.paneId ?? inheritedPane, state: hidden ? 'hidden' : effectiveHit ? 'visible' : 'clipped', measure: {min: measured.min, preferred: measured.preferred}, contentBounds: content, paintBounds: null, parts: [], overflow: {mode}};
    delete record.children;
    // Retain topology after flattening so the interaction publication barrier
    // can independently validate decorative sibling/leaf restrictions.
    record.parentId=parents.get(node.id);
    records.push(record);
    const textMaxWidth = node.kind === 'tabs' ? undefined : labelContent.width;
    const ownText = face && label !== undefined && !hidden ? placeBitmapText(face.font, label, labelContent.x, labelContent.y, {resolution: labelContext, tone: role.tone, policy: face.policy, maxWidth: textMaxWidth, maxHeight: labelContent.height, sourceOffsets: node.kind === 'field'}) : null;
    const ownTextBounds = ownText ? mapRect(labelContext, context, rect(labelContent.x, labelContent.y, ownText.width, ownText.height)) : null;
    // If text plus children overflows, page text first and give child pages the
    // full viewport. A repeated header belongs outside the paginated container.
    const ownTextPages = mode === 'paginate' && ownTextBounds && content.height > 0 && (ownTextBounds.height > content.height || node.children.some(child => !child.hidden) && measured.contentHeight > content.height) ? Math.ceil(ownTextBounds.height / content.height) : 0;
    const children = node.children.filter(child => !child.hidden), sizes = children.map(child => measureChild(child, content.width, context));
    const childTop = content.y + (label !== undefined && children.length && !ownTextPages ? measured.textHeight + gap : 0), childHeight = Math.max(0, content.y + content.height - childTop);
    const slots = new Map(), pageMembership = new Map();
    if (node.kind === 'actionBar') {
      const plan = measured.actionPlan; record.actionPlan = plan;
      if (plan.allocation.kind === 'authored') for (const slot of plan.allocation.slots) slots.set(slot.id, rect(bounds.x + slot.x, bounds.y + slot.y, slot.width, slot.height));
      else if (plan.allocation.kind === 'native-equal') {
        let y = content.y;
        for (const ids of plan.allocation.rows) {
          const width = Math.max(0, Math.floor((content.width - gap * (ids.length - 1)) / ids.length));
          const rowMeasures = ids.map(id => measureChild(children.find(child => child.id === id), width, context));
          const height = maximum(rowMeasures.map(m => m.allocatedHeight));
          ids.forEach((id, i) => slots.set(id, rect(content.x + i * (width + gap), y, width, height))); y += height + (l.rowGap ?? gap);
        }
      }
    } else if (node.kind === 'absolute') {
      children.forEach((child, i) => slots.set(child.id, rect(content.x + (childLength(child,'x',context) ?? 0), childTop + (childLength(child,'y',context) ?? 0), childLength(child,'width',context) ?? sizes[i].preferred.width, childLength(child,'height',context) ?? sizes[i].allocatedHeight)));
    } else if (node.kind === 'grid') {
      const columns = l.columns ?? 1, width = Math.max(0, (content.width - gap * (columns - 1)) / columns); let y = childTop;
      for (let i = 0; i < children.length; i += columns) {
        const slice = children.slice(i, i + columns), measures = slice.map(child => measureChild(child, width, context)), height = maximum(measures.map(m => m.allocatedHeight));
        slice.forEach((child, col) => slots.set(child.id, rect(content.x + col * (width + gap), y, childLength(child,'width',context) ?? Math.max(width, measures[col].min.width), childLength(child,'height',context) ?? height))); y += height + gap;
      }
    } else {
      const horizontal = node.kind === 'row', axis = horizontal ? 'width' : 'height', available = horizontal ? content.width : childHeight;
      const lengths = mode === 'paginate' || mode === 'scroll' ? children.map((child, i) => childLength(child,axis,context) ?? (horizontal ? sizes[i].preferred.width : sizes[i].allocatedHeight)) : fitLengths(children, sizes, available, axis, gap, context);
      const occupied = sum(lengths) + gap * Math.max(0, children.length - 1), extra = Math.max(0, available - occupied);
      let between = gap, cursor = (horizontal ? content.x : childTop) + (l.justify === 'end' ? extra : l.justify === 'center' ? extra / 2 : 0);
      if (l.justify === 'space-between' && children.length > 1) between += extra / (children.length - 1);
      let page = 0, used = 0;
      children.forEach((child, i) => {
        if (mode === 'paginate') {
          if (used > 0 && used + gap + lengths[i] > available) { page++; used = 0; }
          cursor = (horizontal ? content.x : childTop) + used + (used ? gap : 0); pageMembership.set(child.id, page); used += (used ? gap : 0) + lengths[i];
        }
        const crossAxis = horizontal ? 'height' : 'width', crossAvailable = horizontal ? childHeight : content.width;
        const cross = childLength(child,crossAxis,context) ?? (l.align && l.align !== 'stretch' ? sizes[i].preferred[crossAxis] : clamp(crossAvailable, sizes[i].min[crossAxis], childLength(child,crossAxis === 'width' ? 'maxWidth' : 'maxHeight',context) ?? Number.MAX_VALUE));
        const shift = l.align === 'end' ? crossAvailable - cross : l.align === 'center' ? (crossAvailable - cross) / 2 : 0;
        slots.set(child.id, horizontal ? rect(cursor, childTop + shift, lengths[i], cross) : rect(content.x + shift, cursor, cross, lengths[i])); cursor += lengths[i] + between;
      });
      if (mode === 'paginate') { record.overflow.pageCount = page + 1; record.overflow.page = clamp(l.page ?? 0, 0, page); }
    }
    if (mode === 'paginate' && children.length && !pageMembership.size) {
      // Preserve a visual row as one page unit (grid, action allocation or authored slots).
      const rows = new Map();
      for (const child of children) { const slot = slots.get(child.id); if (!slot) continue; const row = rows.get(slot.y) ?? []; row.push(child.id); rows.set(slot.y, row); }
      let page = 0, used = 0;
      for (const [y, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        const height = maximum(ids.map(id => slots.get(id).height));
        if (used > 0 && used + gap + height > childHeight) { page++; used = 0; }
        const top = childTop + used + (used ? gap : 0);
        for (const id of ids) { pageMembership.set(id, page); const slot = slots.get(id); slots.set(id, {...slot, y: top + slot.y - y}); }
        used += (used ? gap : 0) + height;
      }
      record.overflow.pageCount = page + 1; record.overflow.page = clamp(l.page ?? 0, 0, page);
    }
    if (mode === 'paginate' && ownTextPages) {
      for (const [id, page] of pageMembership) pageMembership.set(id, page + ownTextPages);
      record.overflow.pageCount = ownTextPages + (children.length ? record.overflow.pageCount ?? 1 : 0);
      record.overflow.page = clamp(l.page ?? 0, 0, record.overflow.pageCount - 1);
    }
    const extent = union([ownTextBounds, ...slots.values()]) ?? content;
    const maxScrollX = Math.max(0, extent.x + extent.width - content.x - content.width), maxScrollY = Math.max(0, extent.y + extent.height - content.y - content.height);
    Object.assign(record.overflow, {contentBounds: extent, horizontal: extent.x < content.x || maxScrollX > 0, vertical: extent.y < content.y || maxScrollY > 0, maxScrollX, maxScrollY});
    const scrollX = mode === 'scroll' ? clamp(l.scrollX ?? 0, 0, maxScrollX) : 0, scrollY = mode === 'scroll' ? clamp(l.scrollY ?? 0, 0, maxScrollY) : 0;
    Object.assign(record.overflow, {scrollX, scrollY});
    const textShiftX = scrollX, textShiftY = scrollY + (ownTextPages ? Math.min(record.overflow.page, ownTextPages - 1) * content.height : 0);
    const shiftedLabelContent = mapRect(context, labelContext, {...content, x: content.x - textShiftX, y: content.y - textShiftY});
    if (skin && !hidden) {
      const plan = planNineSlice({frame: {x: skin.frame.x, y: skin.frame.y, w: skin.frame.width, h: skin.frame.height}, insets: skin.insets}, skinBounds, {resolution: skinContext});
      const applyPolicy = source => {
        const regions = source.regions.filter(region => skin.center !== 'omit' || region.row !== 1 || region.column !== 1).map(region => ({...region, tile: skin.tile && region.tile}));
        return {...source, regions, paintedBounds: {known: true, rect: union(regions.map(region => region.destination))}};
      };
      const physicalPlan = applyPolicy(plan.physicalPlan), localPlan = applyPolicy(plan);
      const painted = physicalPlan.paintedBounds.rect, allocation = plan.physicalBounds;
      const overflow = {horizontal: !!painted && (painted.x < allocation.x || painted.x + painted.width > allocation.x + allocation.width), vertical: !!painted && (painted.y < allocation.y || painted.y + painted.height > allocation.y + allocation.height)};
      record.parts.push({kind: 'skin', appearance: role.appearance, plan: {...localPlan, physicalPlan, physicalPaintedBounds: physicalPlan.paintedBounds, overflow}, contextId: skinContext.id});
    } else if (role.appearance?.kind === 'flat' && !hidden) record.parts.push({kind: 'flat', color: role.appearance.color, bounds: paintRect(skinContext, skinBounds), contextId: skinContext.id});
    if (ownText && (!ownTextPages || record.overflow.page < ownTextPages)) {
      record.text = textShiftX || textShiftY ? placeBitmapText(face.font, label, shiftedLabelContent.x, shiftedLabelContent.y, {resolution: labelContext, tone: role.tone, policy: face.policy, maxWidth: textMaxWidth, maxHeight: labelContent.height, sourceOffsets: node.kind === 'field'}) : ownText;
      record.parts.push({kind: 'text', placement: record.text, contextId: labelContext.id});
    }
    if (node.kind === 'field' && record.text) {
      // Selection uses UTF-16 offsets, as does the existing native IME bridge.
      const {start, end} = node.selection, caret = node.selection.direction === 'backward' ? start : end;
      const caretWidth = role.caretWidth ?? 1 / labelContext.localToPhysical.scale;
      let cursorBounds;
      for (const line of record.text.lines) {
        const {sourceStart: lineStart, sourceEnd: lineEnd} = line;
        const advance = offset => line.caretAdvances[clamp(offset, lineStart, lineEnd) - lineStart];
        const height = face.font.lineHeight * labelContext.sourceToLocalScale;
        if (start < lineEnd && end > lineStart) {
          const a = advance(start), b = advance(end);
          record.parts.push({kind: 'selection', bounds: rect(line.x + a, line.y, Math.max(0, b - a), height), direction: node.selection.direction, contextId: labelContext.id});
        }
        if (caret >= lineStart) cursorBounds = rect(line.x + advance(caret), line.y, caretWidth, height);
      }
      cursorBounds ??= rect(shiftedLabelContent.x, shiftedLabelContent.y, caretWidth, face.font.lineHeight * labelContext.sourceToLocalScale);
      record.parts.push({kind: 'caret', bounds: cursorBounds, contextId: labelContext.id});
      if (node.composition !== null) record.parts.push({kind: 'composition', placement: placeBitmapText(face.font, node.composition, cursorBounds.x, cursorBounds.y, {resolution: labelContext, tone: role.tone, policy: face.policy}), contextId: labelContext.id});
    }
    if (node.kind === 'tabs' && record.text) {
      record.parts = record.parts.filter(part => part.kind !== 'text');
      let x = shiftedLabelContent.x;
      for (const option of node.options) {
        const width = measureBitmapText(face.font, option.label, {scale: labelContext.physicalPixelsPerSourcePixel, policy: face.policy}).width / labelContext.localToPhysical.scale;
        const bounds = rect(x, shiftedLabelContent.y, width, labelContent.height);
        record.parts.push({kind: 'tab', value: option.id, selected: option.id === node.value, enabled: node.enabled && option.enabled !== false, bounds, hitBounds: fullyClipped || hidden ? null : intersection(mapRect(labelContext, context, bounds), clip), placement: placeBitmapText(face.font, option.label, x, shiftedLabelContent.y, {resolution: labelContext, tone: role.tone, policy: face.policy}), contextId: labelContext.id});
        x += width + measureBitmapText(face.font, '  ', {scale: labelContext.physicalPixelsPerSourcePixel, policy: face.policy}).width / labelContext.localToPhysical.scale;
      }
    }
    if (['stepper', 'pager'].includes(node.kind)) {
      for (const delta of [-1, 1]) {
        const bounds = rect(content.x + (delta === 1 ? content.width / 2 : 0), content.y, content.width / 2, content.height);
        const atLimit = delta < 0 ? node.value <= (node.min ?? 0) : node.value >= (node.kind === 'pager' ? node.pageCount - 1 : node.max);
        record.parts.push({kind: 'adjust', delta, enabled: node.enabled && !atLimit, bounds, hitBounds: fullyClipped || hidden ? null : intersection(bounds, clip), contextId: context.id});
      }
    }
    if (['progress', 'meter'].includes(node.kind)) {
      const fraction = node.max === node.min ? 0 : (node.value - node.min) / (node.max - node.min);
      record.parts.push({kind: node.kind, fraction, track: paintRect(skinContext, skinContent), fill: paintRect(skinContext, {...skinContent, width: skinContent.width * fraction}), caps: skin?.caps ?? null, contextId: skinContext.id});
    }
    if (['toggle', 'fold'].includes(node.kind)) record.parts.push({kind: 'indicator', checked: node.value, bounds: paintRect(skinContext, skinContent), contextId: skinContext.id});
    if (node.kind === 'separator') record.parts.push({kind: 'separator', bounds: paintRect(skinContext, skinContent), contextId: skinContext.id});
    if (node.kind === 'icon' || node.kind === 'itemSlot' && node.asset) record.parts.push({kind: 'icon', asset: node.asset, metadata: theme.icons[node.asset], bounds: paintRect(labelContext, labelContent), contextId: labelContext.id});
    if (node.kind === 'extension') record.extension = {id: node.extensionId, version: node.extensionVersion, model: node.model, allocation: content, clipBounds: clip, contextRevisions: dependencies};
    for (const part of record.parts) {
      const target = contextMap.get(part.contextId), contentPart = ['text', 'composition', 'tab', 'selection', 'caret', 'icon', 'meter', 'progress', 'indicator'].includes(part.kind), semanticClip = contentPart ? clip : inheritedClip;
      part.clipBounds = semanticClip && !fullyClipped ? intersection(mapRect(context, target, semanticClip), target.viewport) : null;
    }
    record.paintBounds = union(record.parts.map(part => { const bounds = part.placement?.paintedBounds.rect ?? part.plan?.paintedBounds.rect ?? part.bounds ?? part.track; return bounds ? mapRect(contextMap.get(part.contextId), context, bounds) : null; }));
    record.effectivePaintBounds = union(record.parts.map(part => { const bounds = part.placement?.paintedBounds.rect ?? part.plan?.paintedBounds.rect ?? part.bounds ?? part.track, clipped = bounds && part.clipBounds ? intersection(bounds, part.clipBounds) : null; return clipped ? mapRect(contextMap.get(part.contextId), context, clipped) : null; }));
    for (const child of node.children) {
      const slot = slots.get(child.id) ?? rect(content.x, childTop, 0, 0);
      allocate(child, {...slot, x: slot.x - scrollX, y: slot.y - scrollY}, fullyClipped ? null : clip, hidden || child.hidden || node.kind === 'fold' && !node.value || mode === 'paginate' && pageMembership.get(child.id) !== record.overflow.page, record.paneId, context, dependencies);
    }
    if (record.state === 'hidden') { record.parts = []; record.paintBounds = null; }
    if (record.state === 'hidden' && mode === 'paginate' || suppressed && !node.hidden) record.state = 'clipped';
    records[index] = record;
  }
  const viewport = contextMap.get(root.contextId ?? contexts[0].id).viewport, measured = measure(root, viewport.width), l = root.layout;
  const container = root.children.length > 0 || ['stack', 'row', 'grid', 'absolute', 'panel'].includes(root.kind);
  allocate(root, rect(viewport.x + (l.x ?? 0), viewport.y + (l.y ?? 0), l.width ?? Math.min(l.maxWidth ?? Number.MAX_VALUE, Math.max(l.minWidth ?? 0, container ? viewport.width : measured.preferred.width)), l.height ?? Math.min(l.maxHeight ?? Number.MAX_VALUE, Math.max(l.minHeight ?? 0, container ? viewport.height : measured.allocatedHeight))), viewport);
  return freezeUiData({format: 'agent-sprites/ui-layout@1', revision, themeId: theme.id, contexts, focus: root.focus ?? {}, records});
}
