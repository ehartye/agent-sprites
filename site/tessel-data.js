export const TESSEL_ACTIONS = [
  {
    id: "idle",
    label: "Idle",
    note: "A quiet pulse beneath the shell.",
    duration: 1600,
    loop: true,
  },
  {
    id: "scuttle",
    label: "Scuttle",
    note: "Six paddle feet, one alternating rhythm.",
    duration: 800,
    loop: true,
  },
  {
    id: "burst",
    label: "Burst",
    note: "The shell sweeps back. Everything points forward.",
    duration: 400,
    loop: true,
  },
  {
    id: "hop",
    label: "Hop",
    note: "Coil, spring, hang in the air, then settle.",
    duration: 1600,
    loop: false,
  },
  {
    id: "listen",
    label: "Listen",
    note: "A small creature giving something its full attention.",
    duration: 1600,
    loop: false,
  },
  {
    id: "bloom",
    label: "Bloom",
    note: "The folded shell opens into a luminous fan.",
    duration: 1600,
    loop: false,
  },
  {
    id: "flinch",
    label: "Flinch",
    note: "A quick recoil and a protective fold.",
    duration: 800,
    loop: false,
  },
  {
    id: "rest",
    label: "Rest",
    note: "Feet tucked in. A little light left awake.",
    duration: 1600,
    loop: true,
  },
];

export function tesselSequence(atlas, action, facing) {
  const tag = atlas.meta.frameTags.find(
    (t) => t.name === `${action}_${facing}`,
  );
  if (!tag) throw Error(`Missing Tessel animation: ${action}_${facing}`);
  const entries = Array.isArray(atlas.frames)
    ? atlas.frames
    : Object.values(atlas.frames);
  const frames = entries.slice(tag.from, tag.to + 1);
  if (
    frames.length !== 8 ||
    frames.some((f) => !Number.isSafeInteger(f.duration) || f.duration < 1)
  )
    throw Error("Incomplete Tessel pose sequence");
  return {
    frames,
    tag,
    duration: frames.reduce((sum, frame) => sum + frame.duration, 0),
    loop: tag.loop !== false,
  };
}
