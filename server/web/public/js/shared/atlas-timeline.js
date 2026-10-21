// Shared by offline proofs and browser playback. No Node, canvas or DOM imports.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, label, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be a safe integer${min > 0 ? ` of at least ${min}` : ''}.`);
  return value;
};

/** Select atlas indices without losing explicit repeated holds. */
export function atlasSequence(atlas, { tag, frames } = {}) {
  if ((tag !== undefined) === (frames !== undefined)) throw new Error('Select exactly one of tag or frames.');
  const entries = Array.isArray(atlas?.frames) ? atlas.frames : object(atlas?.frames)
    ? Object.entries(atlas.frames).map(([filename, frame]) => ({ ...frame, filename })) : [];
  if (!entries.length) throw new Error('Atlas has no frames.');
  let indices;
  if (tag !== undefined) {
    if (typeof tag !== 'string' || !tag.length) throw new Error('tag must be a nonempty name.');
    const tags = atlas?.meta?.frameTags;
    const selected = Array.isArray(tags) && tags.find(t => t.name === tag);
    if (!selected) throw new Error(`Unknown atlas tag: ${tag}`);
    const { from, to, direction = 'forward' } = selected;
    integer(from, 'Tag from'); integer(to, 'Tag to');
    if (to < from || to >= entries.length) throw new Error(`Invalid tag range: ${tag}`);
    if (!['forward','reverse','pingpong','pingpong_reverse'].includes(direction)) throw new Error(`Unsupported tag direction: ${direction}`);
    indices = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    if (direction === 'reverse' || direction === 'pingpong_reverse') indices.reverse();
    if (direction.startsWith('pingpong')) indices = indices.concat(indices.slice(1, -1).reverse());
  } else {
    if (!Array.isArray(frames) || !frames.length) throw new Error('frames must be a nonempty array of indices or exact names.');
    indices = frames.map(selector => {
      if (Number.isSafeInteger(selector) && selector >= 0 && selector < entries.length) return selector;
      if (typeof selector === 'string' && selector.length) {
        const index = entries.findIndex(f => f.filename === selector);
        if (index >= 0) return index;
      }
      throw new Error(`Unknown atlas frame: ${String(selector)}`);
    });
  }
  if (indices.length > 4096) throw new Error('Atlas sequence exceeds 4096 steps.');
  return indices.map(index => ({ index, duration: integer(entries[index]?.duration, `Frame ${index} duration`, 1) }));
}

/** Authoring anchors are pixel coordinates, rather than half-open box edges. */
export function anchorPoint(anchor = 'top-left', w, h, pivot) {
  integer(w, 'Anchor width', 1); integer(h, 'Anchor height', 1);
  const presets = {
    'top-left': {x:0,y:0}, center: {x:Math.floor(w/2),y:Math.floor(h/2)},
    'top-center': {x:Math.floor(w/2),y:0}, 'bottom-center': {x:Math.floor(w/2),y:h-1},
    'bottom-left': {x:0,y:h-1}, 'bottom-right': {x:w-1,y:h-1},
  };
  const point = anchor === 'pivot' ? pivot : object(anchor) ? anchor : presets[anchor];
  if (!point) throw new Error(`Unknown or missing anchor: ${String(anchor)}`);
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) throw new Error('Anchor coordinates must be safe integers.');
  return {x:point.x,y:point.y};
}

/** Complete event-boundary timeline; one-shots hold their first and last pose. */
export function composeTimeline(tracks, { loop, durationMs, maxTracks = 16, maxDurationMs = 60000, maxSteps = 4096 } = {}) {
  integer(maxDurationMs, 'Maximum duration', 1); integer(maxSteps, 'Maximum steps', 1); integer(maxTracks, 'Maximum tracks', 1);
  if (durationMs !== undefined) integer(durationMs, 'Explicit duration', 1);
  if (loop !== undefined && typeof loop !== 'boolean') throw new Error('loop must be a boolean.');
  if (!Array.isArray(tracks) || !tracks.length || tracks.length > maxTracks) throw new Error(`Expected 1 to ${maxTracks} timeline tracks.`);
  const prepared = tracks.map(track => {
    if (!object(track) || !Array.isArray(track.sequence) || !track.sequence.length || track.sequence.length > maxSteps) throw new Error('Each track requires a nonempty sequence within the steps limit.');
    if (track.loop !== undefined && typeof track.loop !== 'boolean') throw new Error('Track loop must be a boolean.');
    const phase = integer(track.phaseMs ?? 0, 'Track phase'), delay = integer(track.delayMs ?? 0, 'Track delay');
    const offset = phase - delay;
    if (!Number.isSafeInteger(offset)) throw new Error('Track offset must be a safe integer.');
    let period = 0;
    const ends = [], sequence = track.sequence.map(frame => {
      integer(frame?.index, 'Frame index'); integer(frame?.duration, 'Frame duration', 1);
      period += frame.duration; integer(period, 'Track period', 1); ends.push(period);
      return {index:frame.index,duration:frame.duration};
    });
    const repeating = track.loop ?? true;
    return { sequence, ends, period, offset:repeating ? offset % period : offset, loop:repeating, static:sequence.length === 1 };
  });
  const animated = prepared.filter(t => !t.static), looping = animated.filter(t => t.loop);
  const outputLoop = loop ?? prepared.every(t => t.loop);
  const gcd = (a,b) => { while (b) [a,b] = [b,a%b]; return a; };
  let jointPeriod = 0;
  for (const t of looping) {
    const current = jointPeriod || 1, factor = t.period / gcd(current, t.period);
    if (factor > Math.floor(maxDurationMs / current)) throw new Error(`Joint period exceeds maximum duration ${maxDurationMs} ms.`);
    jointPeriod = current * factor;
  }
  let oneShotDuration = 0;
  for (const t of prepared.filter(t => !t.loop)) {
    const end = t.period - t.offset;
    if (!Number.isSafeInteger(end)) throw new Error('One-shot duration must be a safe integer.');
    oneShotDuration = Math.max(oneShotDuration, end);
  }
  let horizon = durationMs ?? (jointPeriod ? jointPeriod * Math.max(1, Math.ceil(oneShotDuration / jointPeriod))
    : animated.length ? Math.max(1, oneShotDuration) : Math.max(1,oneShotDuration,...prepared.filter(t=>t.loop).map(t=>t.sequence[0].duration)));
  if (!Number.isSafeInteger(horizon) || horizon > maxDurationMs) throw new Error(`Timeline duration exceeds ${maxDurationMs} ms.`);
  if (horizon < oneShotDuration) throw new Error('Explicit duration must complete every one-shot track.');
  if (jointPeriod && horizon % jointPeriod !== 0) throw new Error('Explicit duration must end on a complete joint loop boundary.');
  const steps = [];
  let atMs = 0;
  while (atMs < horizon) {
    let next = horizon;
    const frames = prepared.map(t => {
      if (t.static) return t.sequence[0].index;
      const shifted = atMs + t.offset;
      if (!Number.isSafeInteger(shifted)) throw new Error('Timeline offset arithmetic exceeds safe integers.');
      if (!t.loop && shifted < 0) {
        // Before onset the first pose is held, so onset itself is not a change.
        next = Math.min(next, t.ends[0] - t.offset);
        return t.sequence[0].index;
      }
      if (!t.loop && shifted >= t.period) return t.sequence.at(-1).index;
      const local = t.loop ? ((shifted % t.period) + t.period) % t.period : shifted;
      let low = 0, high = t.ends.length;
      while (low < high) { const mid = Math.floor((low + high) / 2); if (t.ends[mid] <= local) low = mid + 1; else high = mid; }
      next = Math.min(next, atMs + t.ends[low] - local);
      return t.sequence[low].index;
    });
    if (steps.length >= maxSteps) throw new Error(`Timeline exceeds ${maxSteps} steps.`);
    if (!Number.isSafeInteger(next) || next <= atMs) throw new Error('Timeline could not advance to a safe event boundary.');
    steps.push({atMs,durationMs:next-atMs,frames}); atMs = next;
  }
  return {durationMs:horizon,loop:outputLoop,steps};
}
