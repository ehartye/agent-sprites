/** A shared insectoid head. The caller validates options and mirrors left views.
 * Bounds are the fixed helmet envelope; uncovered antennae extend above it.
 * Hair is deliberately ignored: chitin plates and sensory antennae form the crown.
 */
export function drawInsectoidHead(pen, { cx = 20, top = 12, headSize = 16, direction = 'down', expression = 'neutral', colors: c, hood = false }) {
  const left = cx - Math.floor(headSize / 2);
  const right = left + headSize - 1;
  const bottom = top + headSize - 1;
  const eyeY = top + Math.floor(headSize / 2);
  const chinY = bottom - 1;
  const bounds = { left, top, right, bottom };
  const profile = direction === 'right';

  pen.poly('head_outline', [[left + 4, top], [right - 4, top], [right - 1, top + 2], [right, top + 5], [right, bottom - 5], [right - 3, bottom - 2], [cx + 1, bottom], [cx - 2, bottom], [left + 2, bottom - 3], [left, bottom - 5], [left, top + 4]], c.outline);
  pen.poly('chitin_shell', [[left + 4, top + 1], [right - 4, top + 1], [right - 1, top + 4], [right - 1, bottom - 5], [right - 4, bottom - 2], [cx, chinY], [left + 3, bottom - 3], [left + 1, bottom - 5], [left + 1, top + 4]], c.skin);
  pen.poly('chitin_crown', [[left + 4, top + 1], [right - 4, top + 1], [right - 2, top + 4], [cx, top + 6], [left + 2, top + 4]], c.skinShade);
  pen.line('chitin_crown_light', left + 4, top + 2, right - 4, top + 2, c.skinLight);
  drawAntennae(pen, { left, right, top, hood, profile, back: direction === 'up', colors: c });

  if (direction === 'up') {
    pen.line('chitin_back_seam', cx, top + 3, cx, chinY, c.outline);
    pen.line('chitin_back_left_plate', left + 2, eyeY, cx - 1, eyeY + 2, c.skinShade);
    pen.line('chitin_back_right_plate', cx + 1, eyeY + 2, right - 2, eyeY, c.skinShade);
    pen.line('chitin_back_left_light', left + 2, top + 5, left + 3, eyeY - 1, c.skinLight);
    pen.line('chitin_back_right_light', right - 3, top + 5, right - 2, eyeY - 1, c.skinLight);
    pen.line('chitin_back_nape', cx - 2, bottom - 2, cx + 1, bottom - 2, c.skinShade);
    return { bounds, eyeY, chinY };
  }

  const eyeWidth = headSize === 16 ? 6 : 5;
  const eyes = profile
    ? [{ name: 'right_eye', x: right - eyeWidth, outerLeft: false }]
    : [{ name: 'right_eye', x: left + 1, outerLeft: true }, { name: 'left_eye', x: right - eyeWidth, outerLeft: false }];
  if (profile) {
    pen.poly('chitin_profile_plate', [[left + 2, top + 5], [cx - 1, top + 4], [cx - 2, bottom - 4], [cx, chinY], [left + 3, bottom - 3]], c.skinShade);
    pen.line('chitin_profile_plate_light', left + 3, top + 5, cx - 2, eyeY, c.skinLight);
  }
  for (const eye of eyes) drawCompoundEye(pen, { ...eye, y: eyeY - 2, width: eyeWidth, expression, colors: c });
  const mouthX = profile ? right - 3 : cx;
  const spread = expression === 'surprised' ? 3 : 2;
  const tipY = expression === 'happy' ? bottom - 3 : expression === 'worried' ? bottom - 1 : bottom - 2;
  pen.line('mandible_right', mouthX - spread, bottom - 3, mouthX - 1, tipY, c.skinLight);
  pen.line('mandible_left', mouthX + (profile ? 1 : spread), bottom - 3, mouthX, tipY, c.skinLight);
  if (expression === 'surprised') pen.rect('mandible_open', mouthX - 1, bottom - 2, 2, 1, c.outline);
  pen.rect('chitin_chin', profile ? mouthX - 1 : cx - 1, chinY, 2, 1, c.skinShade);
  return { bounds, eyeY, chinY };
}

function drawAntennae(pen, { left, right, top, hood, profile, back, colors: c }) {
  for (const [frontSide, root, sign] of [['right', left + 4, -1], ['left', right - 4, 1]]) {
    const side = back ? (frontSide === 'right' ? 'left' : 'right') : frontSide;
    if (hood) {
      // Fold along the crown so the helmet overlay never cuts an exposed stalk.
      pen.line(`antenna_${side}_fold`, root, top + 3, root + sign * 2, top + 1, c.outline);
      pen.line(`antenna_${side}_tip`, root + sign * 2, top + 1, root + sign * 3, top + 3, c.skinLight);
    } else {
      const reach = profile && side === 'right' ? 4 : 6;
      pen.line(`antenna_${side}_stalk`, root, top + 2, root + sign * 2, top - 2, c.outline);
      pen.line(`antenna_${side}_sweep`, root + sign * 2, top - 2, root + sign * reach, top - 5, c.outline);
      pen.line(`antenna_${side}_light`, root + sign * 3, top - 2, root + sign * reach, top - 4, c.skinLight);
      pen.line(`antenna_${side}_barb`, root + sign * 3, top - 3, root + sign * 3, top - 5, c.skinShade);
      pen.rect(`antenna_${side}_tip`, root + sign * reach, top - 5, 1, 1, c.signal ?? c.skinLight);
    }
  }
}

function drawCompoundEye(pen, { name, x, y, width: w, outerLeft, expression, colors: c }) {
  const r = x + w - 1;
  const t = expression === 'surprised' ? y - 1 : y;
  const b = y + 5;
  const glint = c.signal ?? c.skinLight;
  pen.poly(`${name}_compound`, [[x + 1, t], [r - 1, t], [r, t + 1], [r, b - 1], [r - 1, b], [x + 1, b], [x, b - 1], [x, t + 1]], c.iris);
  pen.line(`${name}_facet_light`, x + 1, t + 1, r - 1, t + 1, glint);
  pen.line(`${name}_facet_shade`, x + 1, b - 1, r - 1, b - 1, c.skinShade);
  pen.rect(`${name}_facet_outer`, outerLeft ? x : r, t + 2, 1, 2, glint);
  const irisX = x + (expression === 'curious' ? w - 2 : 2);
  pen.rect(`${name}_iris`, irisX - 1, t + 2, 2, 3, glint);
  pen.rect(`${name}_pupil`, irisX, t + 2, 1, expression === 'surprised' ? 2 : 3, c.outline);
  pen.rect(`${name}_catchlight`, irisX - 1, t + 2, 1, 1, '#fff3c4');
  pen.line(`${name}_upper_lid`, x + 1, t - 1, r - 1, t - 1, c.outline);

  if (expression === 'closed' || expression === 'happy') {
    pen.poly(`${name}_closed_cover`, [[x + 1, t], [r - 1, t], [r, t + 1], [r, b - 1], [r - 1, b], [x + 1, b], [x, b - 1], [x, t + 1]], c.skinLight);
    const middle = x + Math.floor(w / 2);
    const lidY = expression === 'happy' ? y + 1 : y + 3;
    pen.line(`${name}_closed_lid_outer`, x, y + 3, middle, lidY, c.skinShade);
    pen.line(`${name}_closed_lid_inner`, middle, lidY, r, y + 3, c.skinShade);
  } else if (expression === 'half_blink' || expression === 'tired') {
    const lidDepth=expression==='tired'?4:3;
    pen.rect(`${name}_lowered_lid`, x, t, w, lidDepth, c.skinLight);
    pen.line(`${name}_half_lid_edge`, x, t + lidDepth, r, t + lidDepth, c.skinShade);
    if (expression === 'tired') pen.line(`${name}_under_eye`, x + 1, b + 1, r - 1, b + 1, c.skinShade);
  } else if (expression === 'worried') {
    const outer = outerLeft ? x : r;
    pen.poly(`${name}_worried_upper_cover`,outerLeft?[[x,t-1],[r,t-1],[r,t],[x,t+2]]:[[x,t-1],[r,t-1],[r,t+2],[x,t]],c.skinLight);
    pen.line(`${name}_worried_brow`,x,t+(outerLeft?0:-2),r,t+(outerLeft?-2:0),c.outline);
    pen.line(`${name}_anxious_lid`, outer, t, outer, t + 2, c.skinLight);
    pen.line(`${name}_inner_lid`, x + 1, t + (outerLeft ? 1 : -1), r - 1, t + (outerLeft ? -1 : 1), c.skinShade);
  } else if (expression === 'curious') {
    pen.line(`${name}_raised_lid`, x + 1, t - 2, r - 1, t - 1, c.skinLight);
  }
}
