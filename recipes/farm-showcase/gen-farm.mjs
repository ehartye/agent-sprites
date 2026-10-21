#!/usr/bin/env node
// gen-farm.mjs — High-detail farm environment showcase
// at dusk, 128x96 single cell, db-32. Fallout mood (desaturated, murky dusk,
// silhouetted nuclear plant) built with Stardew construction (per-plank and
// per-shingle value wobble, selective dark-of-local outlines, trim accents).
// Saturation budget: radiation green (#99e550) + dusk ember (#df7126) only.
// Emits farm-build.json for `sprite.js batch`. Leads with clear -> idempotent.

const C = '0,0';
const P = {
  black: '#000000', ink: '#222034', plum: '#45283c',
  cedar: '#663931', rope: '#8f563b', ember: '#df7126',
  tan: '#d9a066', cream: '#eec39a',
  radGlow: '#99e550', radMid: '#6abe30', teal: '#37946e', moss: '#4b692f',
  olive: '#524b24', khaki: '#8f974a', pine: '#323c39',
  violet: '#76428a', rose: '#d95763',
  steel: '#595652', ash: '#696a6a', silver: '#847e87', mist: '#9badb7',
  blood: '#ac3232', white: '#ffffff', pale: '#cbdbfc',
};

const ops = [{ command: 'clear', cell: C }];
let n = 0;
const d = (type, name, extra) => ops.push({ command: 'draw', type, cell: C, name: `${name}_${n++}`, ...extra });
const rect = (name, x, y, w, h, color) => d('rect', name, { x, y, w, h, color });
const line = (name, x1, y1, x2, y2, color) => d('line', name, { x1, y1, x2, y2, color });
const pt = (name, x, y, color) => d('point', name, { x, y, color });
const ell = (name, cx, cy, rx, ry, color, filled = true) => d('ellipse', name, { cx, cy, rx, ry, color, filled });
const circ = (name, cx, cy, r, color, filled = true) => d('circle', name, { cx, cy, r, color, filled });
const poly = (name, points, color, filled = true) => d('polygon', name, { points, color, filled });
// checkerboard dither row: colored points on alternating pixels, band below shows through
const dither = (name, y, x0, x1, color, phase = 0) => {
  for (let x = x0 + phase; x <= x1; x += 2) pt(name, x, y, color);
};

// ================= SKY (y 0-35): dusk bands with dithered transitions =====
rect('sky_night', 0, 0, 128, 12, P.ink);
rect('sky_dusk', 0, 12, 128, 8, P.plum);
rect('sky_violet', 0, 20, 128, 7, P.violet);
rect('sky_rose', 0, 27, 128, 4, P.rose);
rect('sky_ember', 0, 31, 128, 3, P.ember);
rect('sky_glow', 0, 34, 128, 2, P.tan);
// one single-phase checker row on the FIRST row of each lower band —
// double rows or same-band rows read as stripes, not gradient
dither('dz1', 12, 0, 127, P.ink, 0);
dither('dz2', 20, 0, 127, P.plum, 1);
dither('dz3', 27, 0, 127, P.violet, 0);
dither('dz4', 31, 0, 127, P.rose, 1);
dither('dz5', 34, 0, 127, P.ember, 0);
// stars in the dark bands
for (const [x, y] of [[7, 3], [23, 6], [41, 2], [66, 5], [88, 3], [112, 7], [99, 11], [52, 9]]) pt('star', x, y, P.pale);
pt('star_bright', 30, 4, P.white);
// thin drifting cloud streaks
line('cloud1', 58, 8, 84, 8, P.plum);
line('cloud2', 90, 15, 116, 15, P.ink);

// ============ FAR SILHOUETTES on the horizon =============================
// rolling dead hills
poly('hills', '0,36 0,32 18,30 40,33 64,29 86,32 108,30 127,33 127,36', P.pine);
// nuclear plant: two cooling towers, right horizon
poly('tower1', '96,36 98,24 101,22 104,24 106,36', P.plum);
poly('tower2', '108,36 110,26 112,24 115,26 117,36', P.plum);
line('tower1_lite', 98, 24, 96, 36, P.violet);
pt('tower_light', 101, 22, P.blood);
// steam wisps rising from the tower mouths
pt('steam1', 101, 20, P.steel); pt('steam2', 103, 18, P.steel);
pt('steam3', 112, 22, P.steel); pt('steam4', 113, 19, P.ash);
// broken silo, left horizon
rect('silo', 4, 24, 7, 12, P.plum);
poly('silo_tear', '4,24 11,24 9,27 6,26', P.ink);
line('silo_lite', 4, 25, 4, 35, P.violet);

// ================= GROUND PLANE ==========================================
rect('field_far', 0, 36, 128, 8, P.pine);
rect('field_mid', 0, 44, 128, 16, P.olive);
rect('field_near', 0, 60, 128, 36, P.cedar);
dither('dg1', 44, 0, 127, P.pine, 0);
dither('dg2', 60, 0, 127, P.olive, 1);
// scattered dead scrub in mid field
for (const [x, y] of [[6, 48], [30, 52], [50, 46], [88, 47], [120, 50], [70, 54]]) {
  pt('scrub', x, y, P.moss); pt('scrub2', x + 1, y, P.pine);
}

// ================= FARMHOUSE (x 8-52) ====================================
// main block: weathered vertical planks
rect('house_wall', 12, 34, 34, 22, P.cedar);
for (let x = 12; x < 46; x += 4) line('plank_seam', x, 34, x, 55, P.plum);
// irregular plank weathering beats a regular alternation
for (const x of [13, 25, 41]) rect('plank_var', x, 34, 3, 22, P.rope);
rect('plank_var_low', 33, 46, 3, 10, P.rope);
for (const [x, y] of [[15, 38], [26, 50], [39, 42], [43, 52]]) pt('wall_weather', x, y, P.khaki);
// gable roof: dark shingles, courses, holes with exposed rafters
poly('roof', '8,34 29,15 50,34', P.plum);
line('roof_course1', 14, 29, 44, 29, P.pine);
line('roof_course2', 19, 24, 39, 24, P.pine);
line('roof_edge_l', 8, 34, 29, 15, P.steel);
line('roof_ridge', 29, 15, 33, 19, P.mist);
poly('roof_hole1', '33,22 39,22 38,27 34,26', P.ink);
line('rafter1', 34, 22, 36, 27, P.rope);
poly('roof_hole2', '20,28 25,27 24,31 20,31', P.ink);
line('rafter2', 21, 28, 22, 31, P.rope);
line('eave_trim', 8, 34, 50, 34, P.silver);
// chimney, cracked
rect('chimney', 38, 16, 5, 9, P.steel);
line('chimney_crack', 40, 18, 39, 24, P.ink);
line('chimney_top', 38, 16, 42, 16, P.silver);
// dark doorway, boarded with an X
rect('door', 26, 44, 7, 12, P.ink);
line('door_frame_l', 25, 44, 25, 55, P.silver);
line('door_frame_r', 33, 44, 33, 55, P.silver);
line('door_frame_t', 25, 44, 33, 44, P.silver);
line('board_x1', 25, 45, 33, 54, P.rope);
line('board_x2', 33, 45, 25, 54, P.rope);
// boarded windows
for (const wx of [15, 38]) {
  rect('window', wx, 38, 6, 5, P.ink);
  line('win_frame', wx - 1, 37, wx + 6, 37, P.silver);
  line('win_board1', wx, 39, wx + 5, 41, P.rope);
  line('win_board2', wx, 42, wx + 5, 39, P.rope);
}
// sagging porch: overhang, posts (one broken), deck
poly('porch_roof', '18,40 24,43 34,44 48,40 48,42 34,46 24,45 18,42', P.steel);
line('porch_roof_lite', 18, 40, 48, 40, P.silver);
line('porch_post_l', 20, 43, 20, 56, P.cedar);
line('porch_post_r', 45, 42, 45, 56, P.cedar);
line('porch_post_broken', 32, 46, 35, 56, P.cedar);
rect('porch_deck', 16, 56, 33, 3, P.rope);
line('deck_seam1', 16, 57, 48, 57, P.cedar);
line('deck_edge', 16, 58, 48, 58, P.plum);
poly('deck_collapse', '40,56 48,56 48,59 42,59', P.plum);

// ================= DEAD TREE (right) =====================================
// slim gnarled trunk with roots — a fat poly reads as a monolith, not a tree
poly('trunk', '110,58 111,46 112,34 114,34 115,46 114,58', P.plum);
line('trunk_shade', 114, 36, 114, 56, P.ink);
line('root_l', 108, 58, 110, 56, P.plum);
line('root_r', 117, 58, 114, 56, P.plum);
line('branch1', 112, 36, 106, 26, P.plum);
line('branch1b', 106, 26, 100, 24, P.plum);
line('branch2', 114, 34, 121, 24, P.plum);
line('branch2b', 121, 24, 126, 21, P.plum);
line('branch3', 112, 42, 104, 38, P.plum);
pt('twig1', 99, 23, P.plum);
pt('twig2', 105, 24, P.plum);
// the three-eyed crow, perched on the right branch elbow
circ('crow', 121, 21, 2, P.ink);
poly('crow_beak', '118,21 116,22 118,23', P.tan);
pt('crow_eye1', 120, 20, P.radGlow);
pt('crow_eye2', 122, 20, P.radGlow);
pt('crow_eye3', 121, 19, P.radGlow);

// ================= GRAVES on the knoll ===================================
ell('knoll', 76, 60, 14, 5, P.moss);
ell('knoll_shade', 76, 62, 14, 3, P.pine);
// cross marker
line('cross_v', 70, 50, 70, 58, P.silver);
line('cross_h', 68, 52, 72, 52, P.silver);
pt('cross_shade', 70, 58, P.pine);
// plank headstone
rect('headstone', 80, 51, 4, 7, P.ash);
line('headstone_top', 80, 51, 83, 51, P.mist);
line('headstone_shade', 83, 52, 83, 57, P.steel);
// one glowing flower between them
line('flower_stem', 76, 55, 76, 57, P.moss);
pt('flower', 76, 54, P.radGlow);

// ================= SCARECROW (mid field, army surplus) ===================
line('scare_pole', 58, 64, 58, 44, P.cedar);
line('scare_arm', 50, 49, 66, 49, P.cedar);
rect('scare_sleeve_l', 50, 48, 3, 3, P.olive);
rect('scare_sleeve_r', 63, 48, 3, 3, P.olive);
poly('scare_coat', '52,49 64,49 63,58 60,56 58,59 55,56 52,58', P.olive);
// dark-of-local outline so the figure separates from the field
line('scare_out_l', 52, 49, 52, 57, P.pine);
line('scare_out_r', 64, 49, 63, 57, P.pine);
line('scare_out_b', 53, 57, 63, 57, P.pine);
line('scare_belt', 53, 52, 63, 52, P.pine);
// straw spilling from the hem
pt('straw1', 54, 59, P.tan); pt('straw2', 57, 60, P.tan); pt('straw3', 61, 59, P.tan);
// burlap head under a combat helmet, button eyes aglow
rect('scare_head', 55, 43, 6, 5, P.tan);
pt('scare_stitch', 58, 46, P.rope);
rect('scare_helmet', 54, 41, 8, 2, P.steel);
line('scare_helmet_dome', 55, 40, 60, 40, P.steel);
line('scare_helmet_brim', 54, 43, 61, 43, P.pine);
pt('scare_helmet_lite', 56, 40, P.silver);
pt('scare_eye_l', 56, 45, P.radGlow);
pt('scare_eye_r', 59, 45, P.radGlow);

// ================= BROKEN FENCE line =====================================
for (const fx of [2, 16, 34, 88, 104, 120]) {
  rect('post', fx, 60, 2, 7, P.cedar);
  pt('post_lite', fx, 60, P.rope);
}
line('rail1', 4, 62, 34, 61, P.rope);
line('rail2', 90, 61, 120, 62, P.rope);
poly('post_fallen', '46,64 54,66 54,67 46,66', P.cedar);

// ================= CROP ROWS + MUTANT PUMPKINS ===========================
// furrow ridges with shadow lines
for (const [y, stagger] of [[66, 0], [73, 2], [81, 1], [90, 3]]) {
  line('furrow', stagger, y, 127, y + 1, P.rope);
  line('furrow_shade', stagger, y + 1, 127, y + 2, P.plum);
}
// pumpkin helper: body + sparse ribs + stem + glow accent + glow pool.
// tight rib spacing turns small pumpkins into striped barrels — 3 ribs max,
// none below r3; glow is a rim line only when there's room for one
const pumpkin = (cx, cy, r) => {
  ell('pool', cx, cy + r, r + 2, 1, P.moss);
  dither('pool_glow', cy + r + 1, cx - r - 1, cx + r + 1, P.radMid);
  circ('pumpkin', cx, cy, r, P.ember);
  if (r >= 3) for (const i of [-1, 0, 1]) line('rib', cx + i * (r - 1), cy - r + 2, cx + i * (r - 1), cy + r - 2, P.cedar);
  else line('rib', cx, cy - r + 1, cx, cy + r - 1, P.cedar);
  pt('stem', cx, cy - r, P.moss);
  if (r >= 4) line('glow_rim', cx - r + 2, cy - r + 1, cx + r - 2, cy - r + 1, P.radGlow);
  else pt('glow_pt', cx, cy - r + 1, P.radGlow);
};
pumpkin(14, 68, 2);
pumpkin(94, 67, 2);
pumpkin(118, 74, 3);
pumpkin(8, 76, 3);
pumpkin(84, 78, 4);
pumpkin(112, 88, 5);
// THE BIG ONE: grinning mutant pumpkin, front and centre-right
ell('big_pool', 64, 90, 16, 4, P.moss);
dither('big_pool_glow1', 92, 50, 78, P.radMid);
dither('big_pool_glow2', 93, 52, 76, P.radMid, 1);
circ('big_pumpkin', 64, 82, 10, P.ember);
for (const rx of [-6, -3, 0, 3, 6]) line('big_rib', 64 + rx, 73, 64 + rx, 91, P.cedar);
line('big_glow_rim', 57, 74, 71, 74, P.radGlow);
line('big_glow_rim2', 59, 73, 69, 73, P.radGlow);
rect('big_stem', 63, 71, 3, 2, P.moss);
line('big_vine', 66, 71, 74, 65, P.moss);
line('big_vine2', 74, 65, 80, 63, P.moss);
pt('big_vine_tip', 81, 62, P.radGlow);
// face: triangle eyes with glow pupils, toothy grin
poly('big_eye_l', '58,78 62,78 60,81', P.ink);
poly('big_eye_r', '66,78 70,78 68,81', P.ink);
pt('big_pupil_l', 60, 79, P.radGlow);
pt('big_pupil_r', 68, 79, P.radGlow);
poly('big_mouth', '56,85 72,85 70,89 58,89', P.ink);
for (const tx of [58, 62, 66, 70]) pt('big_tooth', tx, 85, P.cream);
for (const tx of [60, 64, 68]) pt('big_tooth_low', tx, 88, P.cream);

// ================= PATH to the porch (over the furrows) ==================
poly('path', '30,96 24,72 26,59 34,59 36,72 48,96', P.rope);
line('path_edge_l', 30, 96, 25, 72, P.cedar);
for (const [x, y] of [[32, 88], [35, 78], [30, 68], [40, 92], [31, 62]]) pt('path_crack', x, y, P.cedar);
for (const [x, y] of [[34, 84], [29, 74], [38, 90]]) pt('path_lite', x, y, P.tan);

// ================= SIGN (foreground left, tilted, over the furrows) ======
rect('sign_post', 7, 78, 2, 16, P.cedar);
line('sign_post_lite', 7, 78, 7, 92, P.rope);
poly('sign_plank', '2,75 15,73 16,79 3,81', P.tan);
line('sign_shade', 3, 80, 16, 78, P.rope);
line('sign_top', 2, 75, 15, 73, P.cream);
for (const [x, y] of [[5, 77], [8, 77], [11, 76], [13, 76], [6, 79]]) pt('sign_scratch', x, y, P.cedar);
pt('sign_drip', 13, 79, P.radGlow);

// ================= ATMOSPHERE ============================================
for (const [x, y] of [[46, 70], [76, 72], [100, 80], [22, 80]]) pt('firefly', x, y, P.radGlow);
pt('mote1', 52, 48, P.silver);
pt('mote2', 42, 36, P.silver);

process.stdout.write(JSON.stringify(ops, null, 1));
