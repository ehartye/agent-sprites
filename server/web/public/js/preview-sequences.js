export function previewSequences(project, activeCell = '0,0') {
  if (!project) return [];
  const { rows, cols } = project.grid;
  const row = Math.max(0, Math.min(rows - 1, Number(activeCell.split(',')[0]) || 0));
  const options = [
    { id: 'row', label: `Current row (${row + 1})`, frames: Array.from({ length: cols }, (_, c) => `${row},${c}`), fps: 8 },
    { id: 'all', label: 'All cells', frames: Array.from({ length: rows * cols }, (_, i) => `${Math.floor(i / cols)},${i % cols}`), fps: 8 },
    { id: 'cell', label: 'Current cell', frames: [activeCell], fps: 8 },
  ];
  // Same rule as the exported preview's animationSequence: pingpong omits both repeated ends.
  const play = (frames, direction) => {
    const order = direction === 'reverse' ? [...frames].reverse() : frames;
    return direction === 'pingpong' ? order.concat(order.slice(1, -1).reverse()) : order;
  };
  for (const [name, frames] of Object.entries(project.groups ?? {})) options.push({ id: `group:${name}`, group: name, label: name, frames: play(frames, project.animationDirections?.[name]), fps: project.animationFps?.[name] ?? 8 });
  return options;
}
export function selectPreviewSequence(options, id) {
  return options.find(option => option.id === id) ?? options[0] ?? null;
}
