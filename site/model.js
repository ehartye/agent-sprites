export function atlasFrames(atlas) {
  return Array.isArray(atlas.frames)
    ? atlas.frames
    : Object.entries(atlas.frames).map(([filename, f]) => ({ filename, ...f }));
}
export function orderedFrames(frames, direction = "forward") {
  const order =
    direction === "reverse" || direction === "pingpong_reverse"
      ? [...frames].reverse()
      : [...frames];
  return direction === "pingpong" || direction === "pingpong_reverse"
    ? order.concat(order.slice(1, -1).reverse())
    : order;
}
export function frameIndexAt(frames, elapsed, loop = true) {
  const total = frames.reduce((s, f) => s + f.duration, 0);
  if (
    !frames.length ||
    !Number.isSafeInteger(total) ||
    frames.some((f) => !Number.isSafeInteger(f.duration) || f.duration < 1)
  )
    throw Error("Invalid atlas timing");
  let t = loop
    ? Math.max(0, elapsed) % total
    : Math.min(Math.max(0, elapsed), total - 1);
  for (let i = 0; i < frames.length; i++) {
    if (t < frames[i].duration) return i;
    t -= frames[i].duration;
  }
  return frames.length - 1;
}
export function requestExample(command) {
  if (command.cli) return command.cli;
  if (command.action === "batch")
    return "agent-sprites batch operations.json --json";
  if (command.action === "preview")
    return "agent-sprites view-anim idle --loops 3";
  const url = new URL(command.path, "http://localhost:3000");
  if (command.method === "GET")
    for (const [key, value] of Object.entries(command.body ?? {}))
      url.searchParams.set(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
  return command.method === "GET"
    ? `GET ${url}`
    : `POST ${url}\nContent-Type: application/json\n\n${JSON.stringify(command.body ?? {}, null, 2)}`;
}
