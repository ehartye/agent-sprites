/** Small shared DOM controls for the editor and its workbench panels. */
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function button(label, action, className = '') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function input(name, value = '', { type = 'text', ...attributes } = {}) {
  const node = element('input');
  node.name = name;
  node.type = type;
  node.value = value;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function field(label, control) {
  const node = element('label', label);
  node.append(control);
  return node;
}

export function status(message = '') {
  const node = element('p', message, 'workbench-hint');
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  return node;
}

export function setStatus(node, message, error = false) {
  node.textContent = message;
  node.classList.toggle('error', error);
}

export function pixelImage(alt, className = '') {
  const node = element('img', null, `pixel-proof ${className}`.trim()); node.alt = alt; node.hidden = true;
  return { node, set(value) {
    node.removeAttribute('src');
    node.hidden = !(typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value));
    if (!node.hidden) node.src = value;
  } };
}

/** Display only server-produced GIF data, with a pause control and direct download. */
export function animationProof() {
  const node = element('figure', null, 'animation-proof'); node.hidden = true;
  const image = element('img'); image.alt = 'Composited atlas animation proof';
  const link = element('a', 'Download GIF'); link.download = 'atlas-proof.gif';
  let gif, poster, playing;
  const pause = button('Pause animation', () => {
    playing = !playing;
    if (playing) { image.src = gif; image.hidden = false; }
    else if (poster) image.src = poster;
    else { image.removeAttribute('src'); image.hidden = true; }
    pause.textContent = playing ? 'Pause animation' : 'Play animation';
    pause.setAttribute('aria-pressed', String(!playing));
  });
  const caption = element('figcaption'); caption.append(pause, link); node.append(image, caption);
  return { node, set(value, still) {
    gif = typeof value === 'string' && /^data:image\/gif;base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null;
    poster = typeof still === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(still) ? still : null;
    node.hidden = !gif; playing = Boolean(gif) && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    image.removeAttribute('src'); link.removeAttribute('href');
    if (gif) {
      link.href = gif; image.hidden = false;
      if (playing || poster) image.src = playing ? gif : poster;
      else image.hidden = true;
    }
    pause.textContent = playing ? 'Pause animation' : 'Play animation'; pause.setAttribute('aria-pressed', String(!playing));
  } };
}

/** Bound the visible JSON while preserving the complete result for download. */
export function jsonReport({ onDownload, limit = 24_000 }) {
  const node = element('div', null, 'json-report');
  const output = element('pre', null, 'tool-output');
  output.setAttribute('aria-live', 'polite');
  let data;
  const full = button('Download full report', () => onDownload(data));
  full.hidden = true;
  node.append(output, full);
  return { node, output, set(value) {
    data = value;
    const text = JSON.stringify(value, null, 2) ?? '';
    const count = value?.instances?.length;
    const summary = Array.isArray(value?.instances) ? `${count} instance${count === 1 ? '' : 's'} · ${value.shapes?.length ?? 0} shapes\n\n` : '';
    full.hidden = text.length <= limit;
    output.textContent = summary + text.slice(0, limit) + (full.hidden ? '' : `\n\nShowing first ${limit.toLocaleString()} characters. Download the full report for every record.`);
  } };
}
