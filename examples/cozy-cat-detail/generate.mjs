import { scene } from "./art.mjs";
import { playTimeline, groomTimeline } from "./timeline.mjs";
export function operationsFor(clip, poses) {
  const name = clip === "play" ? "little_morning" : "paw_wash",
    cols = 8,
    rows = Math.ceil(poses.length / cols);
  const operations = [
    {
      command: "new",
      name: `marmalade-${clip}`,
      size: "384x256",
      rows,
      cols,
      palette: "db-32",
    },
  ];
  const stillNames = ["room", "rug", "basket-back", "basket-front"],
    depths = {
      room: 0,
      rug: 1000,
      "basket-back": 2000,
      "contact-shadows": 3000,
      "marmalade-anatomy": 4000,
      "basket-front": 5000,
      "lilac-yarn": 6000,
    };
  const select = (full, names) => ({
    parts: Object.fromEntries(
      Object.entries(full.parts).filter(([key]) => names.includes(key)),
    ),
    placements: full.placements.filter((p) => names.includes(p.part)),
  });
  for (const p of poses) {
    const cell = `${Math.floor(p.frame / cols)},${p.frame % cols}`;
    const full = scene(p),
      dynamicNames = Object.keys(full.parts).filter(
        (key) => !stillNames.includes(key),
      );
    if (p === poses[0]) {
      operations.push(
        { command: "clear", cell },
        {
          command: "compose",
          cell,
          prefix: "still",
          ...select(full, stillNames),
          replay: { label: "Hand-authored room, quilt, wicker and rug" },
        },
      );
      for (const part of stillNames)
        operations.push({
          command: "layer",
          sub: "edit",
          cell,
          id: `still:${part}:layer:${encodeURIComponent(`${part}-outer`)}`,
          z: depths[part],
        });
    } else operations.push({ command: "copy", from: "0,0", to: cell });
    operations.push({
      command: "compose",
      cell,
      prefix: "motion",
      ...select(full, dynamicNames),
      replay: { label: `Marmalade ${clip}: ${p.beat}, frame ${p.frame + 1}` },
    });
    for (const part of dynamicNames)
      operations.push({
        command: "layer",
        sub: "edit",
        cell,
        id: `motion:${part}:layer:${encodeURIComponent(`${part}-outer`)}`,
        z: depths[part],
      });
    operations.push({
      command: "lighting",
      cell,
      lighting: {
        palettePolicy: "rgb",
        cell: 8,
        smooth: false,
        block: 0.02,
        ambient: 0.95,
        ambientColor: "#fff9ee",
        sky: 0.06,
        skyColor: "#fff3d8",
        skyReach: 384,
        skyDir: [1, -1],
        relief: 0.12,
      },
    });
    operations.push(
      { command: "duration", cell, ms: 50 },
      {
        command: "name",
        cell,
        as: `${name}_${String(p.frame).padStart(3, "0")}`,
      },
    );
  }
  operations.push(
    {
      command: "group",
      sub: "create",
      name,
      cells: poses.map(
        (p) => `${Math.floor(p.frame / cols)},${p.frame % cols}`,
      ),
      fps: 20,
      loop: true,
    },
    { command: "pivot", x: 0, y: 0 },
  );
  return operations;
}
export const timelines = { play: playTimeline, groom: groomTimeline };
