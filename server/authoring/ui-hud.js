// Colour HUD icons for the `wasteland` UI theme: 12x12 pixel art centred in the 24x24 skin cell.
// Keys: o outline, h highlight, g base, s shade, d detail (hands, pupils, bolts), w white glint.
// Danger hues are reserved for hazards: glow green radiation, violet acid, orange heat.
const P = (o, h, g, s, d, w) => ({o, h, g, s, d, w});
const OUT = '#26262a';
// Radiation trefoil: a disc with three 60-degree blades around a dark hub.
function trefoil() {
  const rows = [];
  for (let y = 0; y < 12; y++) {
    let row = '';
    for (let x = 0; x < 12; x++) {
      const dx = x - 5.5, dy = y - 5.5, r = Math.hypot(dx, dy);
      if (r > 5.9) { row += '.'; continue; }
      if (r > 5) { row += 'o'; continue; }
      let ch = dx + dy < -1.5 ? 'h' : dx + dy > 2 ? 's' : 'g';
      if (r < 1.3) ch = 'o';
      else if (r > 1.6) {
        const a = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        for (const c of [270, 30, 150]) { const d = Math.abs(((a - c + 540) % 360) - 180); if (d > 120) ch = 'd'; }
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
export const HUD_ICONS = {
  hunger: {colors: P(OUT, '#d98b4a', '#b5532f', '#8c3b25', '#e3cf93', '#ffd9b0'), rows: [
    '......oooo..',
    '.....ohhggo.',
    '....ohhgggso',
    '....ohggggso',
    '....ogggggso',
    '.....ogggso.',
    '....ossssoo.',
    '...oggso....',
    '..oggo......',
    '.oggo.......',
    'ohgo.oo.....',
    '.oo.ohho....']},
  thirst: {colors: P(OUT, '#8fc4b4', '#5f9a8d', '#3f6f68', '#2a4a4a', '#e8fff6'), rows: [
    '.....oo.....',
    '....ohgo....',
    '....ohgo....',
    '...ohhggo...',
    '...ohggso...',
    '..ohhgggso..',
    '.ohwhggggso.',
    '.ohwgggggso.',
    '.ohgggggsso.',
    '.ohggggssso.',
    '..osgsssso..',
    '...oooooo...']},
  health: {colors: P(OUT, '#d98b4a', '#b5532f', '#8c3b25', '#5e2a1f', '#ffd9b0'), rows: [
    '............',
    '.ooo....ooo.',
    'ohhgo..ohggo',
    'ohwhgooggggo',
    'ohhggggggggo',
    'ohgggggggsso',
    '.ogggggggso.',
    '..oggggggso.',
    '...ogggsso..',
    '....ogsso...',
    '.....oso....',
    '......o.....']},
  stamina: {colors: P(OUT, '#f0d466', '#e0b84a', '#c58f2c', '#8f6f45', '#fff2b0'), rows: [
    '......ooo...',
    '.....ohhgo..',
    '....ohhgo...',
    '...ohhgso...',
    '..ohhggo....',
    '.ohhgggooo..',
    '.ooooghhgo..',
    '.....ohgso..',
    '....ohgso...',
    '....ogso....',
    '...ogso.....',
    '...ooo......']},
  weight: {colors: P(OUT, '#a8a79e', '#85847c', '#5f5f5a', '#3c3c3a', '#c4c3ba'), rows: [
    '....oooo....',
    '...ohhhho...',
    '..oho..ogo..',
    '..og....so..',
    '.oooooooooo.',
    'ohhhggggggso',
    'ohwgggggggso',
    'ohgggggggsso',
    'ohgggdddgsso',
    'ohggggggssso',
    '.ossssssssso',
    '..oooooooooo']},
  clock: {colors: P(OUT, '#e3cf93', '#c9a869', '#8f6f45', '#26262a', '#fff2b0'), rows: [
    '...oooooo...',
    '..ohhhhhho..',
    '.ohggggggso.',
    'ohgggdgggsso',
    'ohggggdggsso',
    'ohggggddgsso',
    'ohgggdggggso',
    'ohggggggggso',
    'ohgggggggsso',
    '.ossggggsso.',
    '..ossssssoo.',
    '...oooooo...']},
  exposure: {colors: P(OUT, '#e3cf93', '#c4c3ba', '#85847c', '#b5532f', '#ffffff'), rows: [
    '....oooo....',
    '...ohggso...',
    '...ohgsso...',
    '...ohgsso...',
    '...ohgdso...',
    '...ohgdso...',
    '...ohgdso...',
    '..ohgdddso..',
    '..ohdddddso.',
    '..ohdddddso.',
    '..osdddddso.',
    '...ossssso..']},
  radiation: {colors: P(OUT, '#d6ff9a', '#9dff6e', '#5ac96a', '#2a4a4a', '#ffffff'), rows: trefoil()},
  'weather_clear': {colors: P(OUT, '#f0d466', '#e0b84a', '#c58f2c', '#e0b84a', '#fff2b0'), rows: [
    '.....oo.....',
    '..o..dd..o..',
    '...o.oo.o...',
    '....ohho....',
    '.d.ohwhgo.d.',
    'oo.ohggso.oo',
    'oo.oggsso.oo',
    '.d.ossso..d.',
    '...o.oo.o...',
    '..o..dd..o..',
    '.....oo.....',
    '............']},
  'weather_heat': {colors: P(OUT, '#f0d466', '#e08a2c', '#b5532f', '#e08a2c', '#fff2b0'), rows: [
    '....o.......',
    '...ogo..o...',
    '...ogo.ogo..',
    '..ogso.ogo..',
    '..ogsooogso.',
    '.ohgggggggso',
    '.ohggwgggsso',
    '.ohgggggssso',
    '..osgggssso.',
    '...ossssso..',
    '....ooooo...',
    '............']},
  'weather_dust': {colors: P(OUT, '#e3cf93', '#c9a869', '#8f6f45', '#b08d57', '#fff2b0'), rows: [
    '............',
    '.oooooo.....',
    'ohhhggso....',
    '.ossssso.oo.',
    '.....ohhggo.',
    '..ooooggsso.',
    '.ohhggsssso.',
    '..ossssooo..',
    '.oooooo.....',
    'ohhggggo.oo.',
    '.ossssso.ggo',
    '..ooooo.oooo']},
  'weather_rain': {colors: P(OUT, '#a8a79e', '#85847c', '#5f5f5a', '#5f9a8d', '#c4c3ba'), rows: [
    '...oooo.....',
    '..ohhggo.oo.',
    '.ohggggooggo',
    'ohgggggggggs',
    'ohgggggggsso',
    '.osssssssso.',
    '..oooooooo..',
    '.d..d..d....',
    '.d..d..d.d..',
    '..d..d..d...',
    '..d..d..d...',
    '............']},
  'weather_acid-rain': {colors: P(OUT, '#a8a79e', '#85847c', '#5f5f5a', '#7a4a8c', '#c4c3ba'), rows: [
    '...oooo.....',
    '..ohhggo.oo.',
    '.ohggggooggo',
    'ohgggggggggs',
    'ohgggggggsso',
    '.osssssssso.',
    '..oooooooo..',
    '.d..d..d....',
    '.d..d..d.d..',
    '..d..d..d...',
    '..d..d..d...',
    '............']},
  'weather_rad-storm': {colors: P(OUT, '#d6ff9a', '#9dff6e', '#5ac96a', '#2a4a4a', '#ffffff'), rows: [
    '...oooo.....',
    '..ohhggo.oo.',
    '.ohggggooggo',
    'ohgggggggggs',
    'ohgggggggsso',
    '.osssssssso.',
    '..oooooooo..',
    '....ohgo....',
    '...ohgso....',
    '..ohhgso....',
    '...oogso....',
    '....ooo.....']},
  'weather_night': {colors: P(OUT, '#c4c3ba', '#a8a79e', '#85847c', '#2c3a6b', '#ffffff'), rows: [
    '....oooo....',
    '..oohhgso...',
    '.ohhggso....',
    '.ohgggo.....',
    'ohgggso.....',
    'ohgggso.....',
    'ohgggso.....',
    'ohgggsso.o..',
    '.ohggsssooo.',
    '.ohgssssso..',
    '..ooosssso..',
    '....oooooo..'.slice(0, 12)]},
};
export const HUD_ICON_NAMES = Object.keys(HUD_ICONS);
for (const [name, icon] of Object.entries(HUD_ICONS)) {
  if (icon.rows.length !== 12 || icon.rows.some(row => row.length !== 12)) throw Error(`HUD icon ${name} must be 12x12.`);
}
