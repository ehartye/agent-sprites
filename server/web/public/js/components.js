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
