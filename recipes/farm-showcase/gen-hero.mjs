#!/usr/bin/env node
// gen-hero.mjs — High-detail farm character showcase, 32x48, db-32.
// Style contract: Stardew construction (selective dark-of-local outlines,
// 3-4 step material ramps, hand-placed seam lights) x Fallout mood
// (desaturated olive/rust/dust, dithered ground shadow, ~5-head realistic
// proportions). Dusk key top-left, radiation-green rim viewer-right.
// v2 lesson: at this scale auto highlight/shadow blobs read as noise —
// every light is a hand-placed 1px seam. Leads with clear -> idempotent.

const C = '0,0';
const P = {
  black: '#000000', ink: '#222034', plum: '#45283c',
  cedar: '#663931', rope: '#8f563b', ember: '#df7126',
  tan: '#d9a066', cream: '#eec39a',
  radGlow: '#99e550', radMid: '#6abe30', moss: '#4b692f',
  olive: '#524b24', khaki: '#8f974a', pine: '#323c39',
  steel: '#595652', ash: '#696a6a', silver: '#847e87', mist: '#9badb7',
  blood: '#ac3232', white: '#ffffff',
};

const ops = [{ command: 'clear', cell: C }];
const d = (type, name, extra) => ops.push({ command: 'draw', type, cell: C, name, group: 'hero', ...extra });
const rect = (name, x, y, w, h, color) => d('rect', name, { x, y, w, h, color });
const line = (name, x1, y1, x2, y2, color) => d('line', name, { x1, y1, x2, y2, color });
const pt = (name, x, y, color) => d('point', name, { x, y, color });
const ell = (name, cx, cy, rx, ry, color, filled = true) => d('ellipse', name, { cx, cy, rx, ry, color, filled });
const poly = (name, points, color, filled = true) => d('polygon', name, { points, color, filled });

// ---- ground shadow (Fallout dithered stack) ----
ell('gshadow_soft', 16, 45, 10, 2, P.plum);
ell('gshadow_core', 15, 45, 6, 1, P.ink);

// ---- hoe slung over his left shoulder (viewer right), behind body ----
line('hoe_shaft_a', 23, 30, 28, 6, P.rope);
line('hoe_shaft_b', 24, 30, 29, 6, P.cedar);
poly('hoe_blade', '26,1 31,3 29,7 26,4', P.ash);
line('hoe_blade_edge', 26, 1, 31, 3, P.mist);

// ---- duster skirt flaps (behind legs), tattered hems ----
poly('skirt_l', '9,30 6,42 8,40 9,42 11,40 12,31', P.olive);
poly('skirt_r', '20,31 21,40 23,42 24,40 26,42 23,30', P.olive);
line('skirt_l_shade', 8, 33, 7, 40, P.pine);
line('skirt_l_shade2', 9, 33, 8, 40, P.pine);
line('skirt_r_shade', 24, 33, 25, 40, P.pine);
line('skirt_r_lite', 21, 33, 22, 40, P.khaki);

// ---- duster back panel seen between the legs ----
rect('back_panel', 13, 30, 6, 11, P.pine);
line('back_panel_hem', 13, 40, 18, 40, P.ink);

// ---- legs ----
rect('boot_l', 10, 42, 4, 4, P.ink);
rect('boot_r', 18, 42, 4, 4, P.ink);
line('sole_l', 10, 45, 13, 45, P.black);
line('sole_r', 18, 45, 21, 45, P.black);
pt('boot_l_hl', 10, 42, P.steel);
pt('boot_r_hl', 18, 42, P.steel);
rect('pant_l', 10, 32, 4, 10, P.cedar);
rect('pant_r', 18, 32, 4, 10, P.cedar);
line('pant_l_lite', 10, 32, 10, 41, P.rope);
line('pant_l_shade', 13, 32, 13, 41, P.plum);
line('pant_r_shade', 21, 32, 21, 41, P.plum);
rect('knee_patch', 18, 36, 2, 2, P.rope);

// ---- torso: olive duster, open over flannel ----
rect('torso', 9, 16, 14, 15, P.olive);
rect('duster_interior', 13, 16, 6, 14, P.plum);
rect('flannel', 13, 16, 6, 8, P.blood);
rect('flannel_h1', 13, 18, 6, 1, P.plum);
rect('flannel_h2', 13, 21, 6, 1, P.plum);
rect('flannel_v', 15, 16, 1, 8, P.plum);
rect('belt', 13, 29, 6, 2, P.ink);
rect('buckle', 15, 29, 2, 2, P.tan);
line('torso_lite', 9, 16, 9, 30, P.khaki);
line('torso_shade', 22, 17, 22, 30, P.pine);
pt('weather1', 11, 24, P.moss);
pt('weather2', 20, 26, P.moss);
pt('weather3', 10, 20, P.khaki);

// ---- bandolier: two seed packets + one glowing vial ----
line('bando_a', 20, 16, 12, 28, P.cedar);
line('bando_b', 21, 16, 13, 28, P.cedar);
rect('packet1', 18, 17, 2, 3, P.tan);
line('packet1_fold', 18, 17, 19, 17, P.rope);
rect('packet2', 15, 20, 2, 3, P.tan);
line('packet2_fold', 15, 20, 16, 20, P.rope);
rect('vial', 13, 24, 2, 3, P.radGlow);
pt('vial_spec', 13, 24, P.white);
pt('vial_halo_a', 12, 25, P.moss);
pt('vial_halo_b', 15, 26, P.moss);

// ---- arms ----
rect('arm_l', 6, 17, 4, 13, P.olive);
line('arm_l_lite', 6, 17, 6, 29, P.khaki);
line('arm_l_shade', 9, 17, 9, 29, P.pine);
line('cuff_l', 6, 28, 9, 28, P.plum);
rect('hand_l', 6, 30, 3, 4, P.tan);
line('hand_l_shade', 6, 33, 8, 33, P.rope);
rect('arm_r_upper', 22, 17, 3, 6, P.olive);
poly('arm_r_fore', '22,22 26,13 28,14 24,23', P.olive);
line('arm_r_shade', 24, 22, 27, 15, P.pine);
rect('hand_r', 25, 11, 3, 3, P.tan);
line('hand_r_shade', 25, 13, 27, 13, P.rope);

// ---- head (order: base -> brow shadow -> features -> beard -> hat) ----
rect('neck', 14, 14, 4, 3, P.tan);
line('neck_shade', 14, 16, 17, 16, P.rope);
rect('face', 11, 7, 9, 8, P.tan);
line('brow_shadow', 11, 9, 19, 9, P.rope);
pt('cheek_lite_a', 12, 11, P.cream);
pt('cheek_lite_b', 12, 12, P.cream);
pt('eye_l', 13, 10, P.ink);
pt('eye_r', 18, 10, P.ink);
pt('nose', 15, 11, P.rope);
pt('scar_a', 19, 11, P.blood);
pt('scar_b', 19, 12, P.blood);
rect('beard', 11, 12, 9, 4, P.rope);
line('beard_edge', 11, 15, 19, 15, P.cedar);
line('mouth', 14, 13, 16, 13, P.cedar);

// ---- hat: wide brim, deep red band ----
ell('brim', 15, 8, 11, 2, P.cedar);
line('brim_under', 6, 9, 25, 9, P.plum);
line('brim_lite', 8, 7, 23, 7, P.rope);
poly('crown', '10,1 21,1 22,7 9,7', P.cedar);
line('crown_lite', 10, 1, 21, 1, P.rope);
line('crown_crease', 15, 1, 15, 5, P.plum);
rect('hat_band', 9, 6, 13, 2, P.blood);

// ---- gas mask clipped to belt at the hip ----
d('circle', 'mask', { cx: 10, cy: 31, r: 2, color: P.steel, filled: true });
pt('mask_filter', 10, 31, P.pine);
pt('mask_lite', 9, 30, P.silver);

// ---- radiation rim, viewer-right, sparse ----
pt('rim_hat', 26, 7, P.radGlow);
pt('rim_arm', 28, 14, P.radMid);
pt('rim_skirt', 25, 40, P.radMid);

process.stdout.write(JSON.stringify(ops, null, 1));
