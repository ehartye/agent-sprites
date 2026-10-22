import { mix, smooth } from "./geometry.mjs";
const base = {
  x: 82,
  y: 202,
  groundY: 202,
  angle: 0,
  curl: 1,
  crouch: 0,
  stretch: 0,
  sit: 0,
  face: 1,
  headTilt: 0,
  headDip: 0,
  eye: 0,
  blink: 1,
  tail: 0,
  reach: 0,
  gait: 0,
  pawLift: 0,
  wipe: 0,
  tongue: 0,
  ball: { x: 293, y: 220, spin: 0 },
  beat: "A soft start",
};
const interpolate = (a, b, t) => {
  const result = { ...a };
  for (const key of Object.keys(b))
    result[key] =
      typeof b[key] === "number"
        ? mix(a[key] ?? 0, b[key], smooth(t))
        : key === "ball"
          ? {
              x: mix(a.ball.x, b.ball.x, smooth(t)),
              y: mix(a.ball.y, b.ball.y, smooth(t)),
              spin: mix(a.ball.spin, b.ball.spin, smooth(t)),
            }
          : b[key];
  return result;
};
const keys = [
  [0, { ...base }],
  [0.55, { ...base, headDip: -1 }],
  [0.95, { ...base, blink: 0, headTilt: -0.1 }],
  [1.2, { ...base, x: 94, curl: 0.8, blink: 0, angle: 0 }],
  [2.05, { ...base, x: 168, y: 222, curl: 1, blink: 0, angle: 360 }],
  [
    2.35,
    { ...base, x: 180, y: 224, curl: 0, blink: 0.8, stretch: 1, angle: 360 },
  ],
  [
    2.75,
    { ...base, x: 186, y: 224, curl: 0, blink: 0, crouch: 0.45, angle: 360 },
  ],
  [
    3.2,
    {
      ...base,
      x: 210,
      y: 224,
      curl: 0,
      blink: 0,
      crouch: 0.6,
      reach: 13,
      angle: 360,
    },
  ],
  [
    3.45,
    {
      ...base,
      x: 214,
      y: 224,
      curl: 0,
      blink: 0,
      crouch: 0.5,
      reach: 30,
      angle: 360,
      ball: { x: 293, y: 220, spin: 0 },
    },
  ],
  [
    3.9,
    {
      ...base,
      x: 228,
      y: 224,
      curl: 0,
      blink: 0,
      crouch: 0.55,
      reach: 2,
      angle: 360,
      ball: { x: 328, y: 220, spin: 2.1 },
    },
  ],
  [
    4.05,
    {
      ...base,
      x: 230,
      y: 225,
      curl: 0,
      blink: 0,
      crouch: 1,
      angle: 360,
      ball: { x: 330, y: 220, spin: 2.2 },
    },
  ],
  [
    4.4,
    {
      ...base,
      x: 263,
      y: 195,
      curl: 0,
      blink: 0,
      crouch: 0,
      reach: 20,
      stretch: 0.4,
      angle: 348,
      ball: { x: 330, y: 220, spin: 2.2 },
    },
  ],
  [
    4.65,
    {
      ...base,
      x: 269,
      y: 224,
      curl: 0.2,
      blink: 0,
      crouch: 0.8,
      reach: 6,
      angle: 380,
      ball: { x: 321, y: 214, spin: 3.4 },
    },
  ],
  [
    4.95,
    {
      ...base,
      x: 266,
      y: 224,
      curl: 0.65,
      blink: 0.8,
      crouch: 0,
      reach: 3,
      angle: 420,
      ball: { x: 308, y: 204, spin: 4 },
    },
  ],
  [
    5.35,
    {
      ...base,
      x: 253,
      y: 224,
      curl: 0.5,
      blink: 0,
      crouch: 0.4,
      reach: 11,
      angle: 360,
      ball: { x: 294, y: 220, spin: 6.28 },
    },
  ],
  [
    5.65,
    {
      ...base,
      x: 246,
      y: 224,
      curl: 0.2,
      blink: 0,
      crouch: 0.2,
      angle: 360,
      ball: { x: 293, y: 220, spin: 6.28 },
    },
  ],
  [
    6.85,
    { ...base, x: 107, y: 224, curl: 0.35, blink: 0, crouch: 0.2, angle: 360 },
  ],
  [7.25, { ...base, x: 82, y: 202, curl: 1, blink: 0.8, angle: 360 }],
  [7.55, { ...base, angle: 360 }],
  [7.95, { ...base, angle: 360 }],
];
const phaseAt = (t) =>
  t < 0.6
    ? "sleep"
    : t < 1.2
      ? "wake"
      : t < 2.1
        ? "roll-out"
        : t < 2.75
          ? "stretch"
          : t < 3.45
            ? "stalk"
            : t < 4.05
              ? "first-tap"
              : t < 4.65
                ? "pounce"
                : t < 5.4
                  ? "play-flop"
                  : t < 7.25
                    ? "homeward"
                    : "sleep";
export const playBeats = [
  {
    frame: 0,
    title: "A soft start",
    description: "A slow breath lifts the fur above the quilted cushion.",
  },
  {
    frame: 33,
    title: "Out of bed",
    description:
      "A sleepy tumble rolls across the basket lip and onto the rug.",
  },
  {
    frame: 69,
    title: "Just one little tap",
    description: "Toes settle onto the lilac yarn before the ball rolls away.",
  },
  {
    frame: 88,
    title: "A little pounce",
    description: "The body lifts in an arc; the tail trails the landing.",
  },
  {
    frame: 148,
    title: "The warm spot",
    description: "Marmalade settles back into the sage cushion.",
  },
];
const playPoses = Array.from({ length: 160 }, (_, frame) => {
  const t = frame * 0.05;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i],
    b = keys[i + 1],
    p = interpolate(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
  p.frame = frame;
  p.beat = phaseAt(t);
  p.gait = t * 7;
  p.tail = Math.sin(t * 5.1) * 2.5;
  p.headTilt += Math.sin(t * 2) * 0.025;
  p.breath = (Math.sin((t * Math.PI * 2) / 2.3) + 1) * 0.4;
  p.groundY =
    t < 1.2
      ? 202
      : t < 2.05
        ? mix(202, 224, smooth((t - 1.2) / 0.85))
        : t < 6.85
          ? 224
          : t < 7.25
            ? mix(224, 202, smooth((t - 6.85) / 0.4))
            : 202;
  if (t >= 5.4 && t < 7.25) {
    p.face = 1 - 2 * smooth((t - 5.4) / 0.45) + 2 * smooth((t - 6.85) / 0.4);
    p.curl = Math.max(p.curl, 1 - Math.abs(p.face));
    p.walkWeight = smooth((t - 5.65) / 0.2) * (1 - smooth((t - 6.65) / 0.2));
    p.curl = mix(p.curl, 0, p.walkWeight);
    p.gait = (t - 5.85) * 10;
  }
  // Endpoints are deliberately equal in all painted channels, including yarn.
  if (frame === 159)
    return { ...base, frame, beat: "sleep", gait: 0, breath: 0.4 };
  if (frame === 0) {
    p.tail = 0;
    p.headTilt = 0;
    p.breath = 0.4;
  }
  return p;
});
// Secondary tail motion follows the body turn and uncurl with bounded lag.
// Equal-sample Bezier controls blend continuously; no pose threshold swaps.
let tailCurl = 1,
  tailFace = 1;
export const playTimeline = playPoses.map((p) => {
  tailCurl += Math.max(-0.085, Math.min(0.085, (p.curl ?? 0) - tailCurl));
  tailFace += Math.max(-0.12, Math.min(0.12, (p.face ?? 1) - tailFace));
  return { ...p, tailCurl, tailFace };
});
export const groomBeats = [
  {
    frame: 0,
    title: "A quiet moment",
    description:
      "Marmalade sits beside the bed, with both paws resting on the rug.",
  },
  {
    frame: 27,
    title: "A careful lick",
    description: "A pink tongue meets the raised cream paw.",
  },
  {
    frame: 53,
    title: "Another little lick",
    description: "The head follows the paw with small, coordinated strokes.",
  },
  {
    frame: 83,
    title: "Wash behind the whiskers",
    description: "The damp paw sweeps up the cheek and past the ear.",
  },
  {
    frame: 112,
    title: "All tidy",
    description: "The paw lowers and the green eyes open again.",
  },
];
export const groomTimeline = Array.from({ length: 120 }, (_, frame) => {
  const t = frame * 0.05,
    p = {
      ...base,
      frame,
      x: 226,
      y: 226,
      groundY: 226,
      curl: 0,
      sit: 1,
      blink: 0,
      beat: "settle",
      ball: { ...base.ball },
      gait: 0,
      breath: 0.35,
      tail: Math.sin(t * 2.2) * 2,
      headTilt: -0.05,
    };
  p.pawLift = smooth((t - 0.4) / 0.65) * (1 - smooth((t - 5.05) / 0.6));
  if (t >= 1.15 && t < 3.45) {
    const cycle = (t - 1.15) / 0.56,
      phase = cycle - Math.floor(cycle),
      contact = Math.sin(Math.PI * phase);
    p.tongue = Math.max(0, contact) ** 1.2;
    p.headDip = contact * 3;
    p.blink = 0.35 + contact * 0.5;
    p.beat = "paw-lick";
  }
  if (t >= 3.45 && t < 4.8) {
    const u = (t - 3.45) / 1.35;
    p.wipe = Math.sin(u * Math.PI);
    p.headTilt = -0.05 + p.wipe * 0.1;
    p.blink = 0.9;
    p.beat = "face-wipe";
  }
  if (t >= 4.8) {
    p.beat = "all-tidy";
    p.blink = Math.max(0, 1 - (t - 4.8) / 0.5);
  }
  if (frame === 0 || frame === 119)
    return {
      ...p,
      pawLift: 0,
      wipe: 0,
      tongue: 0,
      tail: 0,
      headTilt: -0.05,
      blink: 0,
      headDip: 0,
    };
  return p;
});
