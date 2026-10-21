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

/** Complete joint period for loops; one-shot tracks hold their last frame. */
export function composeTimeline(tracks, { loop, maxDurationMs = 60000, maxSteps = 4096 } = {}) {
  integer(maxDurationMs, 'Maximum duration', 1); integer(maxSteps, 'Maximum steps', 1);
  if (loop !== undefined && typeof loop !== 'boolean') throw new Error('loop must be a boolean.');
  if (!Array.isArray(tracks) || !tracks.length || tracks.length > 16) throw new Error('Expected 1 to 16 timeline tracks.');
  const prepared = tracks.map(track => {
    if (!object(track) || !Array.isArray(track.sequence) || !track.sequence.length || track.sequence.length > maxSteps) throw new Error('Each track requires a nonempty sequence within the steps limit.');
    if (track.loop !== undefined && typeof track.loop !== 'boolean') throw new Error('Track loop must be a boolean.');
    let period = 0;
    const sequence = track.sequence.map(frame => {
      integer(frame?.index, 'Frame index'); integer(frame?.duration, 'Frame duration', 1);
      period += frame.duration; integer(period, 'Track period', 1);
      return {index:frame.index,duration:frame.duration};
    });
    return { sequence, period, loop:track.loop ?? true, static:sequence.length === 1 };
  });
  const animated = prepared.filter(t => !t.static);
  const outputLoop = loop ?? animated.every(t => t.loop);
  const gcd = (a,b) => { while (b) [a,b] = [b,a%b]; return a; };
  let horizon;
  const looping=animated.filter(t=>t.loop),oneShotDuration=Math.max(0,...animated.filter(t=>!t.loop).map(t=>t.period));
  if (looping.length) {
    horizon = 1;
    for (const t of looping) {
      const factor = t.period / gcd(horizon, t.period);
      if (factor > Math.floor(maxDurationMs / horizon)) throw new Error(`Joint period exceeds maximum duration ${maxDurationMs} ms.`);
      horizon *= factor;
    }
    horizon*=Math.max(1,Math.ceil(oneShotDuration/horizon));
  } else horizon = Math.max(...(animated.length ? animated.map(t=>t.period) : prepared.map(t=>t.sequence[0].duration)));
  if (horizon > maxDurationMs) throw new Error(`Timeline duration exceeds ${maxDurationMs} ms.`);
  const steps = [];
  let atMs = 0;
  while (atMs < horizon) {
    let next = horizon;
    const frames = prepared.map(t => {
      if (t.static) return t.sequence[0].index;
      if (!t.loop && atMs >= t.period) return t.sequence.at(-1).index;
      const local = t.loop ? atMs % t.period : atMs;
      let boundary = 0;
      for (const f of t.sequence) {
        boundary += f.duration;
        if (local < boundary) { next = Math.min(next, atMs + boundary - local); return f.index; }
      }
      throw new Error('Timeline could not resolve a frame.');
    });
    if (steps.length >= maxSteps) throw new Error(`Timeline exceeds ${maxSteps} steps.`);
    steps.push({atMs,durationMs:next-atMs,frames}); atMs = next;
  }
  return {durationMs:horizon,loop:outputLoop,steps};
}
