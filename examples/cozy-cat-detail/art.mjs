import {
  C,
  flat,
  unlit,
  fur,
  soft,
  bevel,
  poly,
  line,
  rect,
  ellipse,
  oval,
  ribbon,
  bezier,
  mix,
  clipPolygon,
  hashNoise,
} from "./geometry.mjs";
import { rasterShape } from "../../server/web/public/js/shared/raster.js";
export { C };
const path = (name, color, points, width = 1, surface = flat) =>
  width === 1
    ? line(name, color, points, surface)
    : poly(name, color, ribbon(points, width), surface);
const clipped = (name, color, points, boundary, surface = flat) => {
  const p = clipPolygon(points, boundary);
  return p.length > 2 ? poly(name, color, p, surface) : null;
};
const fadeColor = (a, b, t) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        mix(
          parseInt(C[a].slice(i, i + 2), 16),
          parseInt(C[b].slice(i, i + 2), 16),
          t,
        ),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

function room() {
  const s = [
    rect("plaster-wall", "wall", 0, 0, 384, 157, unlit),
    rect("plaster-window-glow", "wallLight", 175, 0, 209, 153, unlit),
    rect("lower-wall-shadow", "wallShade", 0, 143, 384, 15, unlit),
    rect("wooden-floor", "wood", 0, 157, 384, 99, unlit),
  ];
  // Wide, irregular floorboards and sparse grain are kept below the focal cat.
  for (let row = 0; row < 5; row++) {
    const y = 157 + row * 22;
    s.push(
      rect(
        `floor-board-${row}`,
        ["wood", "woodLight", "wood", "woodLight", "wood"][row],
        0,
        y,
        384,
        21,
        unlit,
      ),
      rect(`floor-joint-${row}`, "woodLine", 0, y, 384, 1, unlit),
    );
    for (let i = 0; i < 7; i++) {
      const x = (i * 61 + row * 37) % 384;
      s.push(
        path(
          `grain-${row}-${i}`,
          "woodLine",
          [
            [x, y + 7],
            [x + 11, y + 6],
            [x + 30, y + 8],
            [x + 45, y + 7],
          ],
          1,
          unlit,
        ),
      );
      if (i % 2 === 0)
        s.push(
          path(
            `grain-light-${row}-${i}`,
            "woodGlow",
            [
              [x + 2, y + 14],
              [x + 19, y + 13],
              [x + 31, y + 14],
            ],
            1,
            unlit,
          ),
        );
    }
    for (const x of [68 + (row % 2) * 74, 278 - (row % 2) * 69])
      s.push(rect(`board-end-${row}-${x}`, "woodLine", x, y, 1, 21, unlit));
  }
  s.push(
    rect("skirting-shadow", "woodDark", 0, 153, 384, 5, bevel),
    rect("skirting-light", "woodLight", 0, 147, 384, 7, bevel),
    rect("skirting-top-glint", "woodGlow", 0, 147, 384, 1, unlit),
  );
  s.push(
    poly(
      "morning-sun-floor",
      "woodGlow",
      [
        [206, 159],
        [285, 159],
        [384, 242],
        [289, 242],
      ],
      unlit,
    ),
    path(
      "sun-crossbar-shadow",
      "wood",
      [
        [250, 160],
        [330, 226],
      ],
      5,
      unlit,
    ),
  );
  // Window with deep sill and a restrained leafy garden beyond it.
  s.push(
    rect("window-cast-shadow", "wallShade", 171, 14, 147, 126, unlit),
    rect("window-outer-frame", "woodDark", 165, 9, 147, 122, bevel),
    rect("window-frame-light", "creamShade", 168, 12, 141, 116, bevel),
    rect("window-garden", "sky", 176, 18, 125, 101, unlit),
  );
  for (let i = 0; i < 30; i++) {
    const x = 179 + hashNoise(i, 1) * 119,
      y = 18 + hashNoise(i, 2) * 97;
    s.push(
      ellipse(
        `garden-bokeh-${i}`,
        i % 3 === 0 ? "skyLight" : i % 3 === 1 ? "leafLight" : "sky",
        x,
        y,
        3 + hashNoise(i, 3) * 7,
        2 + hashNoise(i, 4) * 6,
        unlit,
      ),
    );
  }
  s.push(
    rect("window-mullion-v", "cream", 236, 16, 5, 106, bevel),
    rect("window-mullion-h", "cream", 173, 65, 132, 5, bevel),
    rect("window-inner-edge", "creamLight", 174, 18, 2, 102, unlit),
    rect("sill-dark", "woodDark", 160, 129, 157, 6, bevel),
    rect("sill-top", "cream", 158, 123, 159, 6, bevel),
    rect("sill-glint", "creamLight", 159, 123, 156, 1, unlit),
  );
  s.push(
    rect("morning-window-lamp", "creamLight", 177, 21, 2, 32, {
      ...unlit,
      lamps: [
        {
          name: "golden-window",
          x: 234,
          y: 77,
          radius: 330,
          power: 0.12,
          z: 80,
          color: "#ffe5ae",
        },
      ],
    }),
  );
  for (const side of [0, 1]) {
    const x = side ? 292 : 156;
    s.push(
      poly(
        `linen-curtain-${side}`,
        "curtain",
        [
          [x, 0],
          [x + 24, 0],
          [x + 23, 89],
          [x + 17, 113],
          [x + 4, 119],
          [x, 117],
        ],
        soft,
      ),
    );
    for (let j = 0; j < 4; j++)
      s.push(
        path(
          `curtain-fold-${side}-${j}`,
          "curtainShadow",
          [
            [x + 3 + j * 5, 1],
            [x + 2 + j * 5, 65],
            [x + 1 + j * 5, 112],
          ],
          1,
          flat,
        ),
      );
    for (let j = 0; j < 11; j++) {
      const dx = x + 4 + (j % 3) * 6,
        dy = 10 + Math.floor(j / 3) * 25;
      s.push(
        poly(
          `curtain-leaf-${side}-${j}`,
          "curtainPattern",
          [
            [dx, dy],
            [dx + 2, dy - 3],
            [dx + 4, dy - 2],
            [dx + 3, dy + 1],
          ],
          flat,
        ),
      );
    }
    s.push(
      path(
        `curtain-lace-${side}`,
        "creamLight",
        [
          [x, 116],
          [x + 3, 119],
          [x + 6, 117],
          [x + 9, 119],
          [x + 12, 116],
          [x + 15, 116],
          [x + 18, 111],
          [x + 21, 107],
        ],
        1,
        flat,
      ),
    );
  }
  // A modest shelf balances the bright window without fighting the face.
  s.push(
    rect("shelf-shadow", "wallShade", 4, 92, 124, 8, unlit),
    rect("shelf-wood", "woodDark", 0, 87, 132, 7, bevel),
    rect("shelf-lit-edge", "woodLight", 0, 86, 133, 2, unlit),
  );
  for (let i = 0; i < 8; i++) {
    const x = 7 + i * 10,
      h = 27 + ((i * 7) % 19);
    s.push(
      rect(
        `book-spine-${i}`,
        ["sageDark", "woodDark", "rugBlue", "basketDark"][i % 4],
        x,
        86 - h,
        8,
        h,
        bevel,
      ),
      rect(`book-gilt-${i}`, "basketLight", x + 1, 86 - h + 5, 6, 1, unlit),
      rect(`book-label-${i}`, "creamShade", x + 2, 86 - h + 11, 3, 6, flat),
    );
  }
  s.push(
    poly(
      "shelf-jug",
      "curtain",
      [
        [97, 84],
        [93, 79],
        [94, 69],
        [99, 64],
        [98, 57],
        [108, 57],
        [108, 65],
        [114, 70],
        [115, 79],
        [111, 84],
      ],
      soft,
    ),
    ellipse("jug-handle", "woodDark", 116, 71, 5, 7, flat),
    ellipse("jug-handle-hole", "wall", 116, 71, 3, 5, flat),
    poly(
      "jug-front",
      "curtain",
      [
        [97, 67],
        [108, 67],
        [113, 75],
        [111, 83],
        [97, 83],
        [94, 76],
      ],
      soft,
    ),
  );
  for (let i = 0; i < 5; i++)
    s.push(
      poly(
        `jug-painted-leaf-${i}`,
        "rugBlue",
        [
          [99 + i * 2, 72 + (i % 2) * 4],
          [101 + i * 2, 70 + (i % 2) * 4],
          [103 + i * 2, 73 + (i % 2) * 4],
          [101 + i * 2, 75 + (i % 2) * 4],
        ],
        flat,
      ),
    );
  // Window-side planter, stems and leaves arranged as recognisable clusters.
  s.push(
    rect("plant-table-top", "woodDark", 321, 131, 63, 7, bevel),
    poly(
      "plant-table-leg",
      "wood",
      [
        [330, 137],
        [337, 137],
        [336, 184],
        [331, 184],
      ],
      bevel,
    ),
    poly(
      "terracotta-pot",
      "pot",
      [
        [337, 102],
        [374, 102],
        [370, 130],
        [342, 130],
      ],
      bevel,
    ),
    rect("terracotta-rim", "potLight", 335, 100, 41, 6, bevel),
    ellipse("pot-soil", "woodDark", 356, 101, 17, 3, unlit),
  );
  for (let stem = 0; stem < 7; stem++) {
    const sx = 355 + (stem - 3) * 2,
      ex = 327 + stem * 9,
      ey = 56 + (stem % 3) * 9;
    s.push(
      path(
        `plant-stem-${stem}`,
        "leafDark",
        [
          [sx, 102],
          [sx - 2, 80],
          [ex, ey],
        ],
        1,
        flat,
      ),
    );
    for (let i = 0; i < 3; i++) {
      const u = 0.3 + i * 0.26,
        x = mix(sx, ex, u),
        y = mix(99, ey, u),
        dir = (i + stem) % 2 ? 1 : -1;
      s.push(
        poly(
          `plant-leaf-${stem}-${i}`,
          "leaf",
          [
            [x, y],
            [x + dir * 5, y - 8],
            [x + dir * 13, y - 10],
            [x + dir * 12, y - 3],
            [x + dir * 5, y + 1],
          ],
          soft,
        ),
        path(
          `leaf-vein-${stem}-${i}`,
          "leafLight",
          [
            [x, y],
            [x + dir * 9, y - 7],
          ],
          1,
          flat,
        ),
      );
    }
  }
  return s;
}
function rug() {
  const s = [
    ellipse("oval-rug-shadow", "woodDark", 210, 226, 167, 27, unlit),
    ellipse("bound-rug-edge", "rugDark", 210, 224, 166, 27, unlit),
    ellipse("outer-braid", "rugCream", 210, 223, 163, 25, unlit),
    ellipse("blue-border", "rugBlue", 210, 222, 157, 22, unlit),
    ellipse("inner-braid", "rugCream", 210, 221, 150, 20, unlit),
    ellipse("woven-field", "rug", 210, 221, 143, 18, unlit),
  ];
  const boundary = oval(210, 221, 141, 17);
  for (let i = 0; i < 145; i++) {
    const x = 67 + hashNoise(i, 19) * 285,
      y = 204 + hashNoise(i, 21) * 34;
    if (((x - 210) / 142) ** 2 + ((y - 221) / 17) ** 2 > 1) continue;
    s.push(
      path(
        `woven-speck-${i}`,
        ["rugLight", "rugDark", "rugBlue", "rugCream"][i % 4],
        [
          [x, y],
          [x + 2, y],
          [x + 3, y + 1],
        ],
        1,
        unlit,
      ),
    );
  }
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * Math.PI * 2,
      x = 210 + Math.cos(a) * 158,
      y = 222 + Math.sin(a) * 22;
    s.push(
      path(
        `border-stitch-${i}`,
        "rugLight",
        [
          [x - 2, y - 1],
          [x + 2, y + 1],
        ],
        1,
        unlit,
      ),
    );
  }
  for (let i = 0; i < 19; i++) {
    const x = 69 + i * 15,
      y = 246 - Math.abs(x - 210) * 0.035;
    s.push(
      path(
        `front-fringe-${i}`,
        "rugCream",
        [
          [x, y],
          [x - 2, y + 4],
          [x + 1, y + 5],
        ],
        1,
        unlit,
      ),
    );
  }
  return s;
}
function basket() {
  const back = [
    ellipse("basket-contact", "shadowDark", 80, 207, 68, 8, unlit),
    ellipse("basket-back-rim", "basketDark", 80, 180, 66, 30, bevel),
    ellipse("basket-back-lit", "basket", 80, 179, 64, 28, bevel),
    ellipse("quilt-cushion-shadow", "sageDark", 80, 180, 60, 24, soft),
    ellipse("quilt-cushion", "sage", 80, 179, 57, 23, soft),
    ellipse("cushion-lit-area", "sageLight", 72, 175, 46, 17, soft),
  ];
  const bound = oval(80, 179, 56, 22);
  for (let i = 0; i < 8; i++) {
    const x = 23 + i * 16;
    for (const [j, points] of [
      [
        [0],
        [
          [x - 15, 146],
          [x + 34, 202],
        ],
      ],
      [
        [1],
        [
          [x + 25, 146],
          [x - 24, 202],
        ],
      ],
    ]) {
      const clippedPoints = clipPolygon(ribbon(points, 1), bound);
      if (clippedPoints.length > 2)
        back.push(
          poly(`quilt-diagonal-${i}-${j}`, "sageShade", clippedPoints, flat),
        );
    }
  }
  for (let y = 157; y < 192; y += 13)
    for (let x = 38; x < 131; x += 20) {
      if (((x - 80) / 52) ** 2 + ((y - 174) / 24) ** 2 < 1)
        back.push(
          ellipse(`quilt-button-${x}-${y}`, "sageDark", x, y, 1.5, 1, flat),
        );
    }
  back.push(
    path(
      "cushion-piping",
      "sageDark",
      [
        [24, 172],
        [32, 189],
        [55, 197],
        [82, 199],
        [111, 194],
        [134, 181],
      ],
      2,
      flat,
    ),
    path(
      "cushion-piping-light",
      "sageLight",
      [
        [25, 170],
        [30, 184],
        [48, 193],
        [75, 196],
        [107, 192],
        [132, 179],
      ],
      1,
      flat,
    ),
  );
  const front = [
    poly(
      "basket-front-body",
      "basketDark",
      [
        [15, 176],
        [26, 192],
        [55, 202],
        [88, 205],
        [119, 197],
        [145, 179],
        [139, 204],
        [122, 216],
        [53, 221],
        [27, 214],
        [19, 204],
      ],
      bevel,
    ),
    poly(
      "basket-front-fill",
      "basket",
      [
        [20, 183],
        [36, 198],
        [72, 207],
        [107, 202],
        [141, 184],
        [136, 203],
        [119, 214],
        [54, 218],
        [30, 211],
        [23, 202],
      ],
      bevel,
    ),
  ];
  // Separate horizontal reeds and staggered over-under vertical wicker fibres.
  for (let row = 0; row < 6; row++) {
    const y = 187 + row * 5;
    const points = [
      [23 + row * 0.8, y],
      [49, y + 9],
      [79, y + 11],
      [109, y + 7],
      [137 - row, y - 3],
    ];
    const shell = [
      [20, 182],
      [37, 196],
      [73, 205],
      [108, 201],
      [141, 184],
      [136, 203],
      [119, 214],
      [54, 218],
      [30, 211],
      [23, 202],
    ];
    const p = clipPolygon(ribbon(points, 2), [
      [0, 0],
      [384, 0],
      [384, 220],
      [0, 220],
    ]);
    front.push(
      poly(`woven-horizontal-${row}`, "basketLight", p, bevel),
      path(`recess-horizontal-${row}`, "basketDark", points, 1, flat),
    );
  }
  for (let i = 0; i < 22; i++) {
    const x = 24 + i * 5.1,
      curve = 1 - Math.abs(x - 80) / 62,
      top = 183 + curve * 21;
    front.push(
      path(
        `wicker-upright-${i}`,
        "basketDark",
        [
          [x, top],
          [x + 1, Math.min(217, top + 16)],
        ],
        2,
        bevel,
      ),
    );
    for (let j = 0; j < 3; j++) {
      const y = top + 2 + j * 5;
      if (y > 216) continue;
      front.push(
        path(
          `wicker-over-${i}-${j}`,
          (i + j) % 2 ? "basketLight" : "basket",
          [
            [x - 2, y],
            [x + 2, y + 1],
          ],
          2,
          bevel,
        ),
      );
    }
  }
  const rim = bezier(
    [
      [15, 175],
      [33, 219],
      [110, 216],
      [145, 176],
    ],
    36,
  );
  front.push(
    path("braided-rim-shadow", "basketDark", rim, 7, bevel),
    path("braided-rim", "basketLight", rim, 5, bevel),
  );
  for (let i = 1; i < rim.length - 1; i++) {
    const [x, y] = rim[i],
      a = rim[i - 1],
      b = rim[i + 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      d = Math.hypot(dx, dy),
      nx = -dy / d,
      ny = dx / d;
    front.push(
      path(
        `braid-crossing-${i}`,
        i % 2 ? "basketGlow" : "basket",
        [
          [x - nx * 2 - dx / d, y - ny * 2 - dy / d],
          [x + nx * 2 + dx / d, y + ny * 2 + dy / d],
        ],
        1,
        flat,
      ),
    );
  }
  return { back, front };
}

export function catParts(p) {
  const s = [],
    curl = p.curl ?? 0,
    low = p.crouch ?? 0,
    stretch = p.stretch ?? 0,
    sit = p.sit ?? 0;
  const angle = ((p.angle ?? 0) * Math.PI) / 180,
    co = Math.cos(angle),
    si = Math.sin(angle),
    face = p.face ?? 1;
  // A turn uses independently posed head/legs/tail, keeping torso volume. It
  // never flips an entire frame or collapses the cat to a zero-width billboard.
  const tr = ([x, y]) => {
    const yy = y + 48;
    return [p.x + x * co - yy * si, p.y - 48 + x * si + yy * co];
  };
  const q = (n, c, pts, sf = flat) => poly(n, c, pts.map(tr), sf),
    o = (n, c, x, y, rx, ry, sf = flat) => q(n, c, oval(x, y, rx, ry), sf),
    l = (n, c, pts, w = 1, sf = flat) =>
      w === 1 ? line(n, c, pts.map(tr), sf) : q(n, c, ribbon(pts, w), sf);
  const clippedLocal = (n, c, pts, boundary, sf = flat) => {
    const a = clipPolygon(pts, boundary);
    if (a.length > 2) s.push(q(n, c, a, sf));
  };
  const bodyY =
      mix(-46, -30, curl) + low * 10 - stretch * 3 - sit * 12 - (p.breath ?? 0),
    bodyRx = 43 + stretch * 14 - curl * 4 - sit * 12,
    bodyRy = 29 - low * 7 - stretch * 9 + sit * 16 - curl * 2;
  const bodyBoundary = oval(-4, bodyY, bodyRx - 2, bodyRy - 2, 40);
  const headX = (mix(32, 26, curl) + stretch * 13 - sit * 18) * face,
    headY =
      mix(-81, -39, curl) +
      low * 15 +
      stretch * 28 -
      sit * 17 +
      (p.headDip ?? 0);
  const headAngle = p.headTilt ?? 0,
    hr = (points) =>
      points.map(([x, y]) => [
        headX + x * Math.cos(headAngle) - y * Math.sin(headAngle),
        headY + x * Math.sin(headAngle) + y * Math.cos(headAngle),
      ]);
  const hq = (n, c, pts, sf = flat) => q(n, c, hr(pts), sf),
    ho = (n, c, x, y, rx, ry, sf = flat) => hq(n, c, oval(x, y, rx, ry), sf),
    hl = (n, c, pts, w = 1, sf = flat) =>
      w === 1 ? l(n, c, hr(pts), 1, sf) : hq(n, c, ribbon(pts, w), sf);
  const gait = p.gait ?? 0,
    walkWeight = p.walkWeight ?? 0,
    walking = walkWeight > 0;
  let nearFore = [34 + (p.reach ?? 0), -1],
    farFore = [20, -2],
    nearHind = [-33, -1],
    farHind = [-21, -3];
  if (walking) {
    nearFore[0] += Math.cos(gait) * 10;
    nearFore[1] -= Math.max(0, Math.sin(gait)) * 8;
    farFore[0] -= Math.cos(gait) * 10;
    farFore[1] -= Math.max(0, -Math.sin(gait)) * 8;
    nearHind[0] -= Math.cos(gait) * 10;
    nearHind[1] -= Math.max(0, -Math.sin(gait)) * 8;
    farHind[0] += Math.cos(gait) * 10;
    farHind[1] -= Math.max(0, Math.sin(gait)) * 8;
  }
  nearFore = [
    mix(nearFore[0], 25, curl) + stretch * 20,
    mix(nearFore[1], -13, curl),
  ];
  farFore = [
    mix(farFore[0], 11, curl) + stretch * 17,
    mix(farFore[1], -17, curl),
  ];
  nearHind = [mix(nearHind[0], -20, curl), mix(nearHind[1], -13, curl)];
  farHind = [mix(farHind[0], -26, curl), mix(farHind[1], -17, curl)];
  if (sit) {
    nearFore = [29, 0];
    farFore = [13, -2];
    nearHind = [-25, 0];
    farHind = [-38, -3];
  }
  if (!sit) {
    nearFore[0] *= face;
    farFore[0] *= face;
    nearHind[0] *= face;
    farHind[0] *= face;
  }
  if (walking) {
    // During stance the toe is a fixed world anchor. Only swing resets a paw.
    const travel = 246 - p.x,
      step = 56;
    const planted = (base, offset) => {
      const d = (((travel + offset) % step) + step) % step;
      if (d < 36) return [base - 18 + d, 0];
      const u = (d - 36) / 20;
      return [
        mix(base + 18, base - 18, u * u * (3 - 2 * u)),
        -Math.sin(u * Math.PI) * 10,
      ];
    };
    const blend = (a, b) => [
      mix(a[0], b[0], walkWeight),
      mix(a[1], b[1], walkWeight),
    ];
    nearFore = blend(nearFore, planted(-34, 0));
    farFore = blend(farFore, planted(-20, 28));
    nearHind = blend(nearHind, planted(33, 28));
    farHind = blend(farHind, planted(21, 0));
  }
  if (p.pawLift) {
    const target = [
      headX + 18 + (p.wipe ?? 0) * 8,
      headY + 40 - (p.wipe ?? 0) * 38,
    ];
    nearFore = [
      mix(nearFore[0], target[0], p.pawLift),
      mix(nearFore[1], target[1], p.pawLift),
    ];
  }
  const tailFace = p.tailFace ?? face,
    tailCurl = Math.max(0, Math.min(1, p.tailCurl ?? curl)),
    tailTurn = Math.max(0, Math.min(1, (Math.abs(tailFace) - 0.15) / 0.85)),
    tailBlend =
      tailCurl *
      tailCurl *
      (3 - 2 * tailCurl) *
      tailTurn *
      tailTurn *
      (3 - 2 * tailTurn);
  const openTail = [
      [-bodyRx + 4, bodyY + 1],
      [-89, bodyY - 8],
      [-87, -96 + low * 18],
      [-64, -102 + (p.tail ?? 0)],
    ],
    curledTail = [
      [-35, bodyY],
      [-70, -2],
      [-20, 3],
      [20, -18],
    ];
  const tailControls = openTail.map((point, i) => [
    mix(point[0], curledTail[i][0], tailBlend) * (i === 0 ? face : tailFace),
    mix(point[1], curledTail[i][1], tailBlend),
  ]);
  const tailPoints = bezier(tailControls, 24);
  s.push(
    q("tail-dark-edge", "furShadow", ribbon(tailPoints, 15), fur),
    q("tail-main-fur", "fur", ribbon(tailPoints, 12), fur),
    q(
      "tail-sunlit-fibres",
      "furLight",
      ribbon(
        tailPoints.map(([x, y]) => [x - 1, y - 2]),
        5,
      ),
      soft,
    ),
  );
  for (let i = 3; i < tailPoints.length - 1; i += 4)
    s.push(
      q(
        `tail-contained-ring-${i}`,
        "stripe",
        ribbon(tailPoints.slice(i, i + 3), 11),
        flat,
      ),
    );
  s.push(q("tail-cream-tip", "cream", ribbon(tailPoints.slice(-4), 11), soft));
  const paw = (name, end, near, pads = 0) => {
    s.push(
      o(
        `${name}-paw-shadow`,
        near ? "creamShade" : "creamShadow",
        end[0],
        end[1] - 2,
        11,
        6,
        soft,
      ),
      o(
        `${name}-paw-cream`,
        near ? "cream" : "creamShade",
        end[0] + 1,
        end[1] - 4,
        10,
        7,
        soft,
      ),
      o(`${name}-paw-light`, "creamLight", end[0] + 1, end[1] - 6, 7, 4, soft),
    );
    for (let i = 0; i < 3; i++)
      s.push(
        l(
          `${name}-toe-${i}`,
          "creamShade",
          [
            [end[0] - 5 + i * 5, end[1] - 2],
            [end[0] - 4 + i * 5, end[1] + 1],
          ],
          1,
          flat,
        ),
      );
    if (name === "raised-near-fore") {
      s.push(
        o(
          `${name}-central-pad`,
          fadeColor("cream", "pink", pads),
          end[0],
          end[1] - 3,
          4,
          3,
          soft,
        ),
      );
      for (let i = 0; i < 3; i++)
        s.push(
          o(
            `${name}-toe-pad-${i}`,
            fadeColor("cream", "pinkLight", pads),
            end[0] - 5 + i * 5,
            end[1] - 8,
            1.7,
            2,
            soft,
          ),
        );
    }
  };
  const limb = (name, root, end, near, pads = 0) => {
    const lift = name === "raised-near-fore" ? (p.pawLift ?? 0) : 0;
    const reach = Math.max(0, Math.min(1, ((p.reach ?? 0) - 2) / 10)),
      extended = name === "near-fore" ? reach : 0;
    const mid = [
      mix(root[0], end[0], mix(0.55, 0.42, extended)) +
        (near ? 3 : -3) +
        lift * (8 - (p.wipe ?? 0) * 4),
      mix(root[1], end[1], mix(0.5, 0.62, extended)),
    ];
    const wrist = [mix(mid[0], end[0], 0.82), end[1] - 7];
    s.push(
      l(
        `${name}-fur-outline`,
        near ? "furShadow" : "stripeDark",
        [root, mid, wrist, end],
        16,
        fur,
      ),
      l(
        `${name}-fur`,
        near ? "fur" : "furShade",
        [[root[0], root[1] - 1], mid, wrist, end],
        13,
        fur,
      ),
      l(
        `${name}-lit-edge`,
        "furLight",
        [
          [root[0] - 2, root[1] - 1],
          [mid[0] - 3, mid[1] - 2],
          [wrist[0] - 3, wrist[1]],
        ],
        4,
        soft,
      ),
    );
    for (let i = 0; i < 2; i++) {
      const u = 0.28 + i * 0.21,
        c = [mix(root[0], end[0], u), mix(root[1], end[1], u)];
      s.push(
        l(
          `${name}-attached-band-${i}`,
          "stripe",
          [
            [c[0] - 5, c[1] - 2],
            [c[0] + 1, c[1] + 1],
            [c[0] + 5, c[1]],
          ],
          2,
          flat,
        ),
      );
    }
    paw(name, end, near, pads);
  };
  limb("far-hind", [-27 * face, bodyY + 9], farHind, false);
  limb("far-fore", [22 * face, bodyY + 5], farFore, false);
  s.push(
    o(
      "body-dark-silhouette",
      "furShadow",
      -4,
      bodyY,
      bodyRx + 1,
      bodyRy + 1,
      fur,
    ),
    o("body-base-fur", "fur", -4, bodyY, bodyRx, bodyRy, fur),
  );
  clippedLocal(
    "body-warm-back",
    "furLight",
    [
      [-60, bodyY - 40],
      [-10, bodyY - 34],
      [45, bodyY - 23],
      [32, bodyY - 10],
      [3, bodyY - 16],
      [-35, bodyY - 3],
      [-62, bodyY - 7],
    ],
    bodyBoundary,
    fur,
  );
  clippedLocal(
    "body-lower-shade",
    "furShade",
    [
      [-55, bodyY + 11],
      [-30, bodyY + 14],
      [8, bodyY + 8],
      [43, bodyY - 3],
      [55, bodyY + 35],
      [-60, bodyY + 40],
    ],
    bodyBoundary,
    soft,
  );
  clippedLocal(
    "belly-cream",
    "creamShade",
    [
      [-27, bodyY + 22],
      [-5, bodyY + 12],
      [28, bodyY + 2],
      [42, bodyY + 20],
      [8, bodyY + 39],
      [-30, bodyY + 35],
    ],
    bodyBoundary,
    soft,
  );
  for (let i = 0; i < 6; i++) {
    const x = -40 + i * 13;
    const curve = bezier(
      [
        [x - 2, bodyY - 37],
        [x - 9, bodyY - 14],
        [x + 13, bodyY - 13],
        [x + 8, bodyY + 8],
      ],
      16,
    );
    clippedLocal(
      `body-clipped-tabby-${i}`,
      "stripe",
      ribbon(curve, [2, 3, 4, 5, 6, 6, 6, 6, 5, 5, 4, 4, 3, 2, 2, 1, 0.3]),
      bodyBoundary,
      flat,
    );
    clippedLocal(
      `body-tabby-warm-edge-${i}`,
      "stripeLight",
      ribbon(
        curve.map(([a, b]) => [a + 1, b]),
        1,
      ),
      bodyBoundary,
      flat,
    );
  }
  // Short staggered fur clusters track the underlying anatomical surface.
  for (let i = 0; i < 38; i++) {
    const x = -44 + hashNoise(i, 47) * 80,
      y = bodyY - 28 + hashNoise(i, 49) * 54;
    if (((x + 4) / (bodyRx - 3)) ** 2 + ((y - bodyY) / (bodyRy - 3)) ** 2 > 1)
      continue;
    clippedLocal(
      `body-fur-cluster-${i}`,
      i % 3 === 0 ? "furGlow" : i % 3 === 1 ? "furShade" : "furLight",
      [
        [x, y],
        [x + 3, y - 1],
        [x + 6, y],
        [x + 3, y + 1],
      ],
      bodyBoundary,
      flat,
    );
  }
  limb("near-hind", [-29 * face, bodyY + 8], nearHind, true);
  if (!sit) limb("near-fore", [27 * face, bodyY + 3], nearFore, true);
  // Condense the bib when the head lowers. Its scalloped edge follows the
  // torso's lower envelope instead of hanging beneath the paws like a beard.
  const chestTop = headY + 2,
    chestBottom = Math.min(headY + 62, bodyY + bodyRy + 2),
    chestRatio = Math.min(1, (chestBottom - chestTop) / 60),
    chestPoint = ([x, y]) => [x, chestTop + (y - chestTop) * chestRatio],
    chest = oval(headX - 7, headY + 32, 21, 30, 32).map(chestPoint);
  s.push(
    q("cream-chest-shadow", "creamShade", chest, soft),
    q(
      "cream-chest-light",
      "cream",
      [
        [headX - 22, headY + 15],
        [headX + 10, headY + 16],
        [headX + 12, headY + 38],
        [headX + 6, headY + 49],
        [headX + 1, headY + 45],
        [headX - 3, headY + 53],
        [headX - 8, headY + 48],
        [headX - 12, headY + 51],
        [headX - 17, headY + 40],
        [headX - 21, headY + 43],
        [headX - 26, headY + 29],
      ].map(chestPoint),
      soft,
    ),
  );
  for (let i = 0; i < 9; i++)
    s.push(
      l(
        `chest-fur-stroke-${i}`,
        "creamLight",
        [
          [headX - 15 + i * 3, headY + 23 + (i % 3) * 5],
          [headX - 14 + i * 3, headY + 30 + (i % 3) * 5],
        ].map(chestPoint),
        1,
        flat,
      ),
    );
  // Broad triangular ears lead into rounded cheek and jowl forms.
  s.push(
    hq(
      "far-ear-outer",
      "furShadow",
      [
        [-28, -13],
        [-29, -45],
        [-19, -42],
        [-5, -25],
      ],
      fur,
    ),
    hq(
      "far-ear-fur",
      "furLight",
      [
        [-26, -15],
        [-26, -41],
        [-18, -37],
        [-8, -24],
      ],
      fur,
    ),
    hq(
      "far-ear-inner",
      "pink",
      [
        [-23, -21],
        [-24, -35],
        [-20, -32],
        [-13, -23],
      ],
      soft,
    ),
  );
  s.push(
    hq(
      "near-ear-outer",
      "furShadow",
      [
        [8, -24],
        [30, -44],
        [36, -43],
        [35, -10],
      ],
      fur,
    ),
    hq(
      "near-ear-fur",
      "furLight",
      [
        [12, -23],
        [32, -40],
        [33, -15],
        [26, -9],
      ],
      fur,
    ),
    hq(
      "near-ear-inner",
      "pink",
      [
        [18, -23],
        [30, -34],
        [29, -15],
        [23, -15],
      ],
      soft,
    ),
    hq(
      "ear-inner-shadow",
      "pinkDark",
      [
        [24, -24],
        [30, -34],
        [29, -17],
      ],
      flat,
    ),
  );
  for (let i = 0; i < 5; i++) {
    s.push(
      hl(
        `near-ear-hair-${i}`,
        "cream",
        [
          [19 + i * 2, -23 + i],
          [29, -30 + i * 3],
        ],
        1,
        flat,
      ),
      hl(
        `far-ear-hair-${i}`,
        "cream",
        [
          [-24, -31 + i * 3],
          [-17 + i, -23 + i],
        ],
        1,
        flat,
      ),
    );
  }
  s.push(
    ho("head-shadow-outline", "furShadow", 1, 0, 33, 29, fur),
    ho("rounded-head-fur", "fur", 1, -1, 32, 28, fur),
    hq(
      "left-cheek-fluff",
      "fur",
      [
        [-27, 1],
        [-36, 8],
        [-30, 8],
        [-35, 15],
        [-27, 14],
        [-27, 20],
        [-19, 18],
        [-16, 7],
      ],
      fur,
    ),
    hq(
      "right-cheek-fluff",
      "fur",
      [
        [27, 2],
        [37, 9],
        [31, 10],
        [36, 15],
        [29, 16],
        [28, 21],
        [20, 18],
        [19, 7],
      ],
      fur,
    ),
  );
  const headBoundary = oval(1, -1, 31, 27, 40);
  const headClip = (name, color, points, sf = flat) => {
    const cp = clipPolygon(points, headBoundary);
    if (cp.length > 2) s.push(hq(name, color, cp, sf));
  };
  headClip(
    "forehead-sunlit",
    "furLight",
    [
      [-31, -20],
      [-12, -32],
      [12, -29],
      [27, -18],
      [19, -8],
      [3, -13],
      [-16, -6],
      [-32, -3],
    ],
    fur,
  );
  for (let i = 0; i < 4; i++) {
    const x = -15 + i * 10,
      curve = bezier(
        [
          [x, -31],
          [x - 4, -20],
          [x + 4, -16],
          [x + 2, -7],
        ],
        12,
      );
    headClip(
      `forehead-contained-mark-${i}`,
      "stripe",
      ribbon(curve, [4, 4, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 0.5]),
      flat,
    );
  }
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++)
      headClip(
        `cheek-contained-stripe-${side}-${i}`,
        "stripe",
        ribbon(
          [
            [side * 34, -3 + i * 6],
            [side * 26, -2 + i * 6],
            [side * 19, 2 + i * 5],
          ],
          [4, 3, 1],
        ),
        flat,
      );
    s.push(
      ho(`cream-eye-surround-${side}`, "cream", side * 15, -1, 12, 9, soft),
    );
  }
  const blink = Math.max(0, Math.min(1, p.blink ?? 0));
  for (const [i, ex] of [-14, 16].entries()) {
    s.push(
      hl(
        `eyebrow-${i}`,
        "furShadow",
        [
          [ex - 10, -8],
          [ex - 2, -11],
          [ex + 6, -9],
        ],
        2,
        flat,
      ),
    );
    if (blink > 0.84)
      s.push(
        hl(
          `sleeping-eye-${i}`,
          "ink",
          [
            [ex - 8, -1],
            [ex - 3, 2],
            [ex + 3, 2],
            [ex + 8, -1],
          ],
          2,
          unlit,
        ),
      );
    else {
      const h = 7.5 * (1 - blink * 0.8);
      s.push(
        ho(`eye-liner-${i}`, "ink", ex, 0, 9, h + 1, unlit),
        ho(`green-iris-${i}`, "eye", ex, 0, 7, h, unlit),
        ho(`iris-lit-${i}`, "eyeLight", ex + 1, -1, 4, h - 1, unlit),
        ho(`iris-deep-${i}`, "eyeDark", ex - 3, 1, 2, h - 1, unlit),
        ho(`eye-pupil-${i}`, "pupil", ex + 1, 0, 2.4, h - 0.7, unlit),
        ho(`eye-catchlight-${i}`, "creamLight", ex + 3, -3, 2, 2, unlit),
        ho(`eye-low-glint-${i}`, "cream", ex - 3, 3, 1, 1, unlit),
      );
    }
  }
  s.push(
    ho("cream-chin-shadow", "creamShade", 4, 21, 14, 7, soft),
    ho("cream-chin", "cream", 4, 20, 12, 5, soft),
    ho("left-muzzle-pad", "cream", -7, 14, 16, 10, soft),
    ho("right-muzzle-pad", "cream", 16, 14, 15, 10, soft),
    ho("left-muzzle-light", "creamLight", -8, 12, 12, 6, soft),
    ho("right-muzzle-light", "creamLight", 16, 12, 11, 6, soft),
  );
  s.push(
    hq(
      "nose-outline",
      "pinkDark",
      [
        [-2, 9],
        [11, 9],
        [6, 17],
        [3, 17],
      ],
      soft,
    ),
    hq(
      "pink-nose",
      "pink",
      [
        [0, 10],
        [10, 10],
        [5, 15],
      ],
      soft,
    ),
    hl(
      "nose-highlight",
      "pinkLight",
      [
        [2, 10],
        [7, 10],
      ],
      1,
      unlit,
    ),
    hl(
      "philtrum",
      "ink",
      [
        [5, 16],
        [5, 20],
      ],
      1,
      unlit,
    ),
    hl(
      "mouth-left",
      "ink",
      [
        [5, 20],
        [1, 22],
        [-4, 21],
      ],
      1,
      unlit,
    ),
    hl(
      "mouth-right",
      "ink",
      [
        [5, 20],
        [10, 22],
        [14, 20],
      ],
      1,
      unlit,
    ),
  );
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = side < 0 ? -12 : 19;
      s.push(
        ho(
          `whisker-follicle-${side}-${i}`,
          "furShadow",
          x + (i % 2) * 3,
          12 + i * 3,
          0.75,
          0.75,
          flat,
        ),
      );
      s.push(
        hl(
          `fine-whisker-${side}-${i}`,
          i === 1 ? "creamLight" : "cream",
          [
            [x + side * 4, 14 + i],
            [x + side * 19, 10 + i * 5],
            [x + side * 31, 10 + i * 6],
          ],
          1,
          unlit,
        ),
      );
    }
  for (let i = 0; i < 12; i++) {
    const x = -23 + i * 4;
    headClip(
      `face-fur-cluster-${i}`,
      "furGlow",
      [
        [x, -18],
        [x + 2, -19],
        [x + 4, -17],
      ],
      flat,
    );
  }
  if (p.tongue) {
    s.push(
      ho("mouth-open-for-lick", "pinkDark", 7, 22, 6, 3, unlit),
      hq(
        "visible-licking-tongue",
        "tongue",
        [
          [3, 22],
          [11, 22],
          [13, 24 + p.tongue * 8],
          [10, 28 + p.tongue * 8],
          [6, 27 + p.tongue * 8],
          [4, 25],
        ],
        soft,
      ),
      hl(
        "tongue-center-groove",
        "pinkDark",
        [
          [8, 24],
          [9, 27 + p.tongue * 6],
        ],
        1,
        flat,
      ),
    );
  }
  const wipeTurn = Math.max(0, Math.min(1, (p.wipe ?? 0) / 0.45)),
    padVisibility =
      (p.pawLift ?? 0) * (1 - wipeTurn * wipeTurn * (3 - 2 * wipeTurn));
  if (sit)
    limb("raised-near-fore", [24, bodyY + 8], nearFore, true, padVisibility);
  // On a curled/turning tail the ribbon is concave. Intersect each band with
  // the actual posed fur mask and retain editable named row rectangles.
  const coverage = (shape) => {
    const set = new Set(),
      px = (x, y) => set.add(`${x},${y}`);
    rasterShape(shape.type, shape.params, {
      px,
      rect: (x, y, w, h) => {
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) px(xx, yy);
      },
    });
    return set;
  };
  const tailMask = coverage(s.find((shape) => shape.name === "tail-dark-edge")),
    final = [];
  for (const shape of s) {
    if (!shape.name.startsWith("tail-contained-ring-")) {
      final.push(shape);
      continue;
    }
    const rows = new Map();
    for (const key of coverage(shape))
      if (tailMask.has(key)) {
        const [x, y] = key.split(",").map(Number);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(x);
      }
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      let start = xs[0],
        last = start,
        run = 0;
      for (let i = 1; i <= xs.length; i++) {
        if (xs[i] === last + 1) {
          last = xs[i];
          continue;
        }
        final.push(
          rect(
            `${shape.name}-row-${y}-${run++}`,
            "stripe",
            start,
            y,
            last - start + 1,
            1,
            flat,
          ),
        );
        start = last = xs[i];
      }
    }
  }
  return {
    shapes: final,
    paws: {
      nearFore: tr(nearFore),
      farFore: tr(farFore),
      nearHind: tr(nearHind),
      farHind: tr(farHind),
    },
    lick: p.tongue
      ? {
          tongueTip: tr(hr([[10, 28 + p.tongue * 8]])[0]),
          innerPawEdge: tr([nearFore[0] - 9, nearFore[1] - 4]),
          pawCenter: tr([nearFore[0] + 1, nearFore[1] - 4]),
        }
      : null,
    localBodyBoundary: bodyBoundary,
    transform: tr,
  };
}
function yarn(p) {
  const { x, y, spin } = p.ball,
    r = 17,
    boundary = oval(x, y, r - 1, r - 1),
    s = [
      path(
        "loose-yarn-thread-shadow",
        "yarnDark",
        bezier(
          [
            [x + 7, y + 10],
            [x + 39, 241],
            [274, 239],
            [274, 244],
          ],
          22,
        ),
        3,
        flat,
      ),
      path(
        "loose-yarn-thread",
        "yarn",
        bezier(
          [
            [x + 7, y + 10],
            [x + 39, 241],
            [274, 239],
            [274, 244],
          ],
          22,
        ),
        2,
        soft,
      ),
      ellipse("yarn-ball-dark", "yarnDark", x, y, r, r, soft),
      ellipse("yarn-ball", "yarn", x - 0.5, y - 1, r - 1, r - 1, fur),
      ellipse("yarn-lit-side", "yarnLight", x - 4, y - 5, 9, 10, soft),
    ];
  for (let i = 0; i < 12; i++) {
    const a = i * 0.47 + spin * 0.4,
      pts = Array.from({ length: 18 }, (_, j) => {
        const t = -Math.PI * 0.85 + (j / 17) * Math.PI * 1.7;
        return [
          x + Math.cos(t) * 15 * Math.cos(a) - Math.sin(t) * 5 * Math.sin(a),
          y + Math.cos(t) * 15 * Math.sin(a) + Math.sin(t) * 5 * Math.cos(a),
        ];
      });
    const cp = clipPolygon(ribbon(pts, 1), boundary);
    if (cp.length > 2)
      s.push(
        poly(
          `wound-strand-${i}`,
          i % 3 === 0 ? "yarnDark" : i % 3 === 1 ? "yarnGlow" : "yarnShade",
          cp,
          flat,
        ),
      );
  }
  s.push(
    path(
      "yarn-upper-glint",
      "yarnGlow",
      [
        [x - 9, y - 11],
        [x - 4, y - 14],
        [x + 2, y - 14],
      ],
      1,
      flat,
    ),
  );
  return s;
}
const staticRoom = room(),
  staticRug = rug(),
  staticBasket = basket();
export function scene(p) {
  const parts = {},
    placements = [];
  // Every independently editable painted primitive gets a tight transparent
  // layer. This preserves normals and bounds raster work to the actual part,
  // rather than allocating a full 384×256 surface for each tiny fur/cloth mark.
  const add = (name, shapes) => {
    const bounds = (list) => {
      const points = list.flatMap(
        (shape) =>
          shape.params.points ??
          [
            [shape.params.x, shape.params.y],
            [
              shape.params.x + shape.params.w - 1,
              shape.params.y + shape.params.h - 1,
            ],
          ].map(([x, y]) => ({ x, y })),
      );
      const x = Math.min(...points.map((t) => t.x)),
        y = Math.min(...points.map((t) => t.y));
      return {
        x,
        y,
        w: Math.max(...points.map((t) => t.x)) - x + 1,
        h: Math.max(...points.map((t) => t.y)) - y + 1,
      };
    };
    const category = (shape) => {
      const n = shape.name;
      if (name === "room")
        return /^(?:window|garden|curtain|linen|sill|morning-window)/.test(n)
          ? "window"
          : /^(?:shelf|book|jug)/.test(n)
            ? "shelf"
            : /^(?:plant|terracotta|pot|leaf)/.test(n)
              ? "plant"
              : /^(?:floor|grain|board|skirting|wooden|morning-sun|sun-crossbar)/.test(
                    n,
                  )
                ? "floor"
                : "wall";
      if (name === "marmalade-anatomy")
        return n.startsWith("tail")
          ? "tail"
          : n.startsWith("body") || n.startsWith("belly")
            ? "body"
            : /^(?:far-hind|far-fore|near-hind|near-fore|raised-near-fore)/.test(
                  n,
                )
              ? n
                  .split("-")
                  .slice(0, n.startsWith("raised") ? 3 : 2)
                  .join("-")
              : /^(?:cream-chest|chest)/.test(n)
                ? "chest"
                : "head";
      return name;
    };
    const runs = [];
    for (const shape of shapes) {
      const key = category(shape);
      if (runs.at(-1)?.key !== key) runs.push({ key, list: [] });
      runs.at(-1).list.push(shape);
    }
    const outer = {
      id: `${name}-outer`,
      ...bounds(shapes),
      z: 0,
      background: { mode: "transparent" },
    };
    let index = 0;
    parts[name] = {
      shapes: runs.flatMap((run, ri) => {
        const region = {
          id: `${name}-${run.key}-region-${ri}`,
          ...bounds(run.list),
          z: index,
          background: { mode: "transparent" },
        };
        return run.list.map((shape) => ({
          ...shape,
          params: {
            ...shape.params,
            layers: [
              outer,
              region,
              {
                id: `${name}-${shape.name}`,
                ...bounds([shape]),
                z: index++,
                background: { mode: "transparent" },
              },
            ],
          },
        }));
      }),
    };
    placements.push({ kind: "stamp", part: name, name, x: 0, y: 0 });
  };
  add("room", staticRoom);
  add("rug", staticRug);
  add("basket-back", staticBasket.back);
  const ground = p.groundY ?? 224,
    elevation = Math.max(0, ground - p.y),
    shadowShrink = Math.min(24, elevation * 0.6);
  add("contact-shadows", [
    ellipse(
      "body-soft-shadow",
      fadeColor("shadow", "rug", Math.min(0.5, elevation / 60)),
      p.x,
      ground,
      52 - 12 * (p.curl ?? 0) - shadowShrink,
      Math.max(3, 7 - elevation * 0.12),
      unlit,
    ),
    ellipse(
      "paw-contact-shadow",
      "shadowDark",
      p.x + 24 * (p.face ?? 1),
      ground + 1,
      23 - shadowShrink * 0.5,
      Math.max(1.5, 3 - elevation * 0.05),
      unlit,
    ),
    ellipse("yarn-contact-shadow", "shadowDark", p.ball.x, 236, 17, 4, unlit),
  ]);
  const cat = catParts(p);
  add("marmalade-anatomy", cat.shapes);
  add("basket-front", staticBasket.front);
  add("lilac-yarn", yarn(p));
  return { parts, placements };
}
