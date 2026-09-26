export const EXPRESSION_NAMES = Object.freeze(['neutral', 'happy', 'curious', 'worried', 'surprised', 'tired', 'half_blink', 'closed']);

const EYE_WHITE = '#f4ead5';

/** Draw a shared pixel face. The caller validates options and mirrors left-facing art.
 * Bounds describe the head/helmet envelope, excluding uncovered hair ornaments.
 */
export function drawHumanoidHead(pen, { cx = 20, top = 12, headSize = 16, direction = 'down', hair = 'short', expression = 'neutral', colors, hood = false }) {
  const left = cx - Math.floor(headSize / 2);
  const right = left + headSize - 1;
  const bottom = top + headSize - 1;
  const eyeY = top + Math.floor(headSize / 2);
  const chinY = bottom - 1;
  const bounds = { left, top, right, bottom };
  const profile = direction === 'right';
  const back = direction === 'up';
  const c = colors;

  // A stair-step silhouette keeps a one-pixel jaw outline and a quiet chin.
  pen.poly('head_outline', [[left + 3, top], [right - 3, top], [right - 1, top + 2], [right, top + 5], [right, bottom - 5], [right - 2, bottom - 2], [right - 4, bottom], [left + 4, bottom], [left + 2, bottom - 2], [left, bottom - 5], [left, top + 4]], c.outline);
  pen.poly('hair_volume', [[left + 3, top + 1], [right - 3, top + 1], [right - 1, top + 3], [right - 1, bottom - 5], [right - 3, bottom - 2], [left + 3, bottom - 2], [left + 1, bottom - 5], [left + 1, top + 4]], c.hair);
  drawHairSilhouette(pen, { left, right, top, bottom, cx, hair, hood, profile, colors: c });

  if (back) {
    pen.rect('left_ear', left, eyeY + 1, 2, 3, c.skinShade);
    pen.rect('right_ear', right - 1, eyeY + 1, 2, 3, c.skinShade);
    pen.line('hair_back_light', left + 3, top + 4, left + 3, bottom - 5, c.hairLight);
    pen.line('hair_nape', left + 4, bottom - 2, right - 4, bottom - 2, c.outline);
    return { bounds, eyeY, chinY };
  }

  if (profile) {
    pen.poly('face', [[cx, top + 5], [right - 2, top + 5], [right - 1, eyeY + 1], [right, eyeY + 3], [right - 1, eyeY + 4], [right - 2, bottom - 2], [right - 4, chinY], [cx - 1, chinY], [cx - 3, bottom - 4], [cx - 3, eyeY]], c.skin);
    pen.rect('face_light', cx, top + 6, right - cx, eyeY - top - 3, c.skinLight);
    pen.rect('right_ear', cx - 3, eyeY + 1, 2, 3, c.skinShade);
    pen.rect('right_ear_light', cx - 3, eyeY + 1, 1, 2, c.skinLight);
    pen.rect('nose', right - 1, eyeY + 3, 1, 1, c.skinShade);
  } else {
    pen.poly('face', [[left + 2, top + 4], [right - 2, top + 4], [right - 2, top + 7], [right - 2, bottom - 5], [right - 3, bottom - 3], [right - 5, chinY], [left + 5, chinY], [left + 3, bottom - 3], [left + 2, bottom - 5], [left + 2, top + 7]], c.skin);
    pen.rect('face_light', left + 2, top + 6, headSize - 4, eyeY - top - 3, c.skinLight);
    // Anatomical right appears on the viewer's left in a front view.
    pen.rect('right_ear', left, eyeY + 1, 2, 3, c.skinShade);
    pen.rect('left_ear', right - 1, eyeY + 1, 2, 3, c.skinShade);
    pen.rect('nose', cx, eyeY + 3, 1, 1, c.skinShade);
  }

  drawFringe(pen, { left, right, top, cx, hair, profile, eyeY, colors: c });
  const eyeWidth = headSize === 16 && !profile ? 4 : 3;
  const eyes = profile
    ? [{ name: 'right_eye', x: right - 4, outerLeft: false }]
    : [{ name: 'right_eye', x: left + (headSize === 16 ? 3 : 2), outerLeft: true }, { name: 'left_eye', x: right - eyeWidth - 1, outerLeft: false }];
  for (const eye of eyes) drawEye(pen, { ...eye, y: eyeY, width: eyeWidth, expression, minimumBrowY: top + 5, colors: c });

  const mouthX = profile ? right - 4 : cx - 1;
  const mouthY = bottom - 2;
  if (expression === 'happy') {
    pen.line('mouth_smile_left', mouthX - 1, mouthY - 1, mouthX, mouthY, c.skinShade);
    pen.line('mouth_smile_right', mouthX, mouthY, mouthX + 2, mouthY - 1, c.skinShade);
  } else if (expression === 'surprised') {
    pen.rect('mouth_open', mouthX, mouthY - 1, 2, 2, c.skinShade);
  } else if (expression === 'worried') {
    pen.line('mouth_concern', mouthX, mouthY, mouthX + 2, mouthY - 1, c.skinShade);
  } else {
    pen.rect('mouth_relaxed', mouthX, mouthY, 2, 1, c.skinShade);
  }
  return { bounds, eyeY, chinY };
}

function drawHairSilhouette(pen, { left: l, right: r, top: t, bottom: b, cx, hair, hood, profile, colors: c }) {
  pen.line('hair_crown_light', l + 4, t + 2, r - 4, t + 2, c.hairLight);
  if (hood) return;
  if (hair === 'bun') {
    const x = profile ? l : cx;
    pen.poly('hair_bun_outline', [[x - 2, t - 3], [x + 2, t - 3], [x + 3, t - 1], [x + 2, t + 2], [x - 2, t + 2], [x - 3, t]], c.outline);
    pen.rect('hair_bun', x - 2, t - 2, 5, 3, c.hair);
    pen.line('hair_bun_light', x - 1, t - 2, x + 1, t - 2, c.hairLight);
  } else if (hair === 'puffs') {
    for (const [side, x] of [['left', l], ['right', r]]) {
      pen.poly(`hair_${side}_puff_outline`, [[x - 2, t], [x + 1, t - 1], [x + 3, t + 1], [x + 3, t + 4], [x + 1, t + 6], [x - 2, t + 5], [x - 3, t + 2]], c.outline);
      pen.rect(`hair_${side}_puff`, x - 2, t + 1, 5, 3, c.hair);
      pen.line(`hair_${side}_puff_light`, x - 1, t + 1, x + 1, t + 1, c.hairLight);
    }
  } else if (hair === 'bob') {
    pen.poly('hair_bob_left', [[l + 2, t + 2], [l, t + 5], [l - 1, b - 2], [l + 3, b - 1], [l + 4, b - 3]], c.hair);
    pen.poly('hair_bob_right', [[r - 2, t + 2], [r, t + 5], [r + 1, b - 2], [r - 3, b - 1], [r - 4, b - 3]], c.hair);
    pen.line('hair_bob_edge_left', l - 1, b - 2, l + 2, b - 1, c.outline);
    pen.line('hair_bob_edge_right', r - 2, b - 1, r + 1, b - 2, c.outline);
    pen.line('hair_bob_light', l + 1, t + 6, l + 1, b - 4, c.hairLight);
  } else if (hair === 'waves') {
    pen.poly('hair_wave_left', [[l + 3, t], [l, t + 2], [l - 1, t + 5], [l, t + 7], [l - 2, t + 9], [l - 1, b - 2], [l + 3, b - 2], [l + 3, t + 5]], c.hair);
    pen.poly('hair_wave_right', [[r - 3, t], [r, t + 2], [r + 1, t + 5], [r, t + 7], [r + 2, t + 9], [r + 1, b - 2], [r - 3, b - 2], [r - 3, t + 5]], c.hair);
    pen.line('hair_wave_light_left', l, t + 4, l + 1, t + 6, c.hairLight);
    pen.line('hair_wave_light_right', r, t + 8, r + 1, t + 10, c.hairLight);
  } else if (hair === 'tousled') {
    pen.poly('hair_tousled', [[l + 1, t + 4], [l, t + 1], [l + 4, t + 1], [l + 5, t - 2], [cx + 1, t], [r - 3, t - 1], [r - 1, t + 1], [r + 1, t + 3], [r - 1, t + 5]], c.hair);
    pen.line('hair_tousled_light', l + 5, t, cx, t + 1, c.hairLight);
  }
}

function drawFringe(pen, { left: l, right: r, top: t, cx, hair, profile, eyeY, colors: c }) {
  if (profile) {
    pen.poly('hair_fringe', [[l + 3, t + 3], [r - 2, t + 3], [r - 2, t + 5], [cx + 1, t + 4], [cx - 1, t + 7], [l + 2, t + 7]], c.hair);
    pen.line('hair_fringe_light', l + 4, t + 3, cx + 1, t + 3, c.hairLight);
    return;
  }
  const edge = hair === 'bob'
    ? [[r - 2, t + 5], [cx + 1, t + 5], [cx, t + 4], [cx - 2, t + 5], [l + 2, t + 5]]
    : hair === 'waves'
      ? [[r - 2, t + 5], [cx + 2, t + 4], [cx, t + 3], [cx - 2, t + 5], [l + 2, t + 6]]
      : hair === 'bun' || hair === 'puffs'
        ? [[r - 2, t + 5], [cx + 2, t + 4], [cx - 2, t + 4], [l + 2, t + 5]]
        : [[r - 2, t + 5], [cx + 2, t + 4], [cx + 1, t + 5], [cx - 1, t + 4], [cx - 2, t + 5], [l + 2, t + 6]];
  // Small heads reserve a clean forehead row for brows instead of stacking
  // the worried expression onto the bangs.
  pen.poly('hair_fringe', [[l + 2, t + 3], [r - 2, t + 3], ...edge.map(([x, y]) => [x, Math.min(y, eyeY - 3)])], c.hair);
  pen.line('hair_fringe_light', l + 4, t + 3, cx, t + 3, c.hairLight);
}

function drawEye(pen, { name, x, y, width: w, outerLeft, expression, minimumBrowY, colors: c }) {
  if (expression === 'happy') {
    pen.line(`${name}_smile_lid_left`, x, y + 1, x + 1, y, c.skinShade);
    pen.line(`${name}_smile_lid_right`, x + 1, y, x + w - 1, y + 1, c.skinShade);
  } else if (expression === 'closed') {
    pen.line(`${name}_closed_lid`, x, y + 1, x + w - 1, y + 1, c.skinShade);
    pen.rect(`${name}_lid_corner`, x + w - 1, y, 1, 1, c.skinShade);
  } else {
    const top = expression === 'surprised' ? y - 1 : y;
    const height = expression === 'surprised' ? 4 : 3;
    const irisX = x + (expression === 'curious' && w === 4 ? 2 : 1);
    pen.rect(`${name}_sclera`, x, top, w, height, EYE_WHITE);
    pen.rect(`${name}_iris`, irisX, top, Math.min(2, x + w - irisX), height, c.iris);
    pen.rect(`${name}_pupil`, Math.min(x + w - 1, irisX + 1), top + 1, 1, height - 1, c.outline);
    pen.rect(`${name}_catchlight`, irisX, top, 1, 1, EYE_WHITE);
    pen.line(`${name}_upper_lid`, x, top - 1, x + w - 1, top - 1, c.skinShade);
    if (expression === 'half_blink' || expression === 'tired') {
      pen.rect(`${name}_lowered_lid`, x, top, w, height - 1, c.skinLight);
      pen.line(`${name}_half_lid_edge`, x, top + height - 2, x + w - 1, top + height - 2, c.skinShade);
    }
    if (expression === 'worried') {
      const outer = outerLeft ? x : x + w - 1;
      pen.rect(`${name}_outer_lid_drop`, outer, top, 1, 1, c.skinLight);
      pen.rect(`${name}_anxious_lid`, outer, top + 1, 1, 1, c.skinShade);
    }
    if (expression === 'tired') pen.line(`${name}_under_eye`, x, y + 3, x + w - 2, y + 3, c.skinShade);
  }
  let browLeft = y - 2;
  let browRight = y - 2;
  if (expression === 'curious' && !outerLeft) browLeft--;
  if (expression === 'worried') {
    // Raise only the inner corner by one pixel; keep the brow below the hairline.
    if (outerLeft) browLeft++;
    else browRight++;
  }
  if (expression === 'surprised') { browLeft--; browRight--; }
  if (expression === 'tired') { browLeft++; browRight++; }
  pen.line(`${name}_brow`, x, Math.max(minimumBrowY, browLeft), x + w - 1, Math.max(minimumBrowY, browRight), c.hair);
}
