// Wardrobe motifs for the native 16x32 cast: hair styles, facial hair and a few outfit pieces.
//
// They compose with the rest of the wasteland library (see wasteland-motifs.mjs), and are meant for characters that
// are customised in-game: build a bald body (`wig: "none"`), then build each hair style and facial hair as its own
// overlay sheet with `native.only` (same frame layout as the body, only that motif's pixels), and composite in the game.
// Hair and facial hair follow the character's `hair` material ('@hair.role'), so one ramp recolours both.
//
// Authoring grid: front, right and back are drawn, left reflects right. Rows are anchored to the head (the top of the
// bare head is row 0; the bare head is ten pixels wide at x 3..12 in front and back views, the face is at rows 4..10).

const ALL = ['front', 'right', 'back'];
const part = (directions, anchor, x, y, rows, extra = {}) => ({ directions, anchor, x, y, rows, ...extra });
const HAIR = { slots: { outline: '@hair.outline', shadow: '@hair.shadow', base: '@hair.base', light: '@hair.highlight' }, symbols: { o: 'outline', S: 'shadow', B: 'base', H: 'light' } };

// Twelve-pixel envelope that wraps the ten-pixel bare head; the fringe stops above the eyes.
const FRONT = ['..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo', 'oSBBBooBBBSo', '.oBBo..oBBo.', '..oo....oo..'];
const REAR = ['..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo', 'oSHBBBBBBBSo', 'oSBBBBBBBBSo', 'oSBBBBBBBSSo', 'oSBBBBBBBSSo', '.oSBBBBBSSo.', '..oSSSSSSo..', '...oooooo...'];
const SIDE = ['oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB'];
const KNOT = ['.oo.', 'oHBo', 'oBSo', '.oo.'];

export const WARDROBE_MOTIFS = {
  'hair-cropped': {
    describe: 'Cropped hair: a close cap with the sides left bare.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 2, -1, ['..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo', '.oSBBBBBBSo.', '..oo....oo..']),
      part(['right'], 'head', 2, -1, ['..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo']),
      part(['right'], 'head', 3, 3, ['oSBB', 'oSBB', 'oSBB', '.oSB', '..oo']),
      part(['back'], 'head', 2, -1, REAR.slice(0, 7).concat(['.oSSSSSSo.'])),
    ],
  },
  'hair-short': {
    describe: 'Short hair with a side-swept fringe.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 2, -1, FRONT),
      part(['right'], 'head', 2, -1, FRONT.slice(0, 6)),
      part(['right'], 'head', 3, 3, SIDE),
      part(['back'], 'head', 2, -1, REAR),
    ],
  },
  'hair-tied': {
    describe: 'Short hair pulled back into a knot.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 2, -1, FRONT),
      part(['front'], 'head', 3, 6, ['o']),
      part(['front'], 'head', 12, 6, ['o']),
      part(['right'], 'head', 2, -1, FRONT.slice(0, 6)),
      part(['right'], 'head', 3, 3, SIDE),
      part(['right'], 'head', 1, 6, KNOT),
      part(['back'], 'head', 2, -1, REAR),
      part(['back'], 'head', 6, 7, KNOT),
    ],
  },
  'hair-long': {
    describe: 'Long hair that falls past the shoulders at the back and in curtains at the sides.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 2, -1, FRONT),
      part(['front'], 'head', 2, 5, ['oSB', 'oSB', 'oSB', 'oSB', 'oSB', 'oSB', 'oSB', '.oS', '..o']),
      part(['front'], 'head', 11, 5, ['BSo', 'BSo', 'BSo', 'BSo', 'BSo', 'BSo', 'BSo', 'SBo', 'oo.']),
      part(['right'], 'head', 2, -1, FRONT.slice(0, 6)),
      part(['right'], 'head', 3, 3, ['oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBB', 'oSBS', '.oSS', '..oo']),
      part(['back'], 'head', 2, -1, REAR.slice(0, 8)),
      part(['back'], 'head', 2, 7, ['oSBBBBBBBSSo', 'oSBBBBBBBSSo', 'oSBBBBBBBSSo', 'oSBBBBBBSSSo', 'oSBBBBBBSSSo', '.oSBBBBBSSo.', '..oSSBBSSo..', '...oooooo...']),
    ],
  },
  'hair-curls': {
    describe: 'Soft curls: a wide, bumpy cloud of hair around the head.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 1, -1, ['..oo.oooo.oo..', '.oHHoHBBHoHHo.', 'oHHBBBBBBBBSSo', 'oHBBBBBBBBBBSo', 'oSBBBBBBBBBBSo', 'oSBBo....oBBSo', '.oSBo....oBSo.', '..ooo....ooo..']),
      part(['right'], 'head', 1, -1, ['..oo.oooo.oo..', '.oHHoHBBHBHo..', 'oHHBBBBBBBSo..', 'oHBBBBBBBSo...']),
      part(['right'], 'head', 2, 3, ['oHBBB', 'oHBBBS', 'oSBBBS', 'oSBBBo', '.oSBBo', '..ooSo', '....o']),
      part(['back'], 'head', 1, -1, ['..oo.oooo.oo..', '.oHHoHBBHoHHo.', 'oHHBBBBBBBBSSo', 'oHBBBBBBBBBBSo', 'oSBBBBBBBBBBSo', 'oSBBBBBBBBBBSo', 'oSBBBBBBBBBSSo', 'oSBBBBBBBBBSSo', '.oSBBBBBBBSSo.', '..oSSSBBSSSo..', '...ooooooooo..']),
    ],
  },
  'hair-mohawk': {
    describe: 'A tall mohawk ridge over bare sides.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 6, -2, ['.oo.', 'oHBo', 'oHBo', 'oHBo', 'oBBo', 'oBSo', '.oo.']),
      part(['right'], 'head', 5, -2, ['.oooooo.', 'oHHBBBSo', '.oBBBSo.']),
      part(['back'], 'head', 6, -2, ['.oo.', 'oHBo', 'oHBo', 'oBBo', 'oBBo', 'oBSo', 'oBSo', 'oBSo', 'oSSo', '.oo.']),
    ],
  },
  'facial-stubble': {
    describe: 'A day of stubble across the jaw.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 4, 8, ['S.S....S.S', '.S.SSSS.S.', '..S....S..']),
      part(['right'], 'head', 6, 8, ['S.S.S', '.S.S.', 'S.S.S']),
    ],
  },
  'facial-moustache': {
    describe: 'A moustache.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 5, 8, ['SBBBBS', 'S....S']),
      part(['right'], 'head', 8, 8, ['SBBo', 'BS..']),
    ],
  },
  'facial-goatee': {
    describe: 'A moustache and a chin patch.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 5, 8, ['SBBBBS', 'S.BB.S', '..SS..']),
      part(['front'], 'head', 6, 11, ['oBBo']),
      part(['right'], 'head', 8, 8, ['SBBo', 'BSBo', '.BSo']),
    ],
  },
  'facial-beard': {
    describe: 'A full short beard from the sideburns round the chin.',
    ...HAIR,
    parts: [
      part(['front'], 'head', 3, 8, ['oSBBBBBBSo', 'oSBBSSBBSo', '.oSBBBBSo.', '..oSBBSo..', '...oSSo...']),
      part(['right'], 'head', 4, 7, ['oSS.....', 'oSBBBBoo', '.oSBBBBo', '..oSBBSo', '...oSSo.']),
    ],
  },
  'goggles-up': {
    describe: 'Goggles pushed up on the forehead with a strap around the head.',
    slots: { lens: '#5f9a8d', glint: '#8fc4b4', frame: '#3c3c3a', strap: '#6b5033' },
    symbols: { L: 'lens', G: 'glint', o: 'frame', t: 'strap' },
    parts: [
      part(['front'], 'head', 3, 2, ['tttttttttt', 'oLGLttLGLo', '.ooo..ooo.']),
      part(['right'], 'head', 3, 2, ['tttttttttt', 'tttttooLGo', '.......oo.']),
      part(['back'], 'head', 3, 2, ['tttttttttt']),
    ],
  },
  overalls: {
    describe: 'Bib overalls over the shirt, in the trousers colours.',
    slots: { light: '@trousers.highlight', base: '@trousers.base', shade: '@trousers.shadow', edge: '@trousers.outline', button: '#e0b84a' },
    symbols: { H: 'light', B: 'base', S: 'shade', o: 'edge', k: 'button' },
    parts: [
      part(['front'], 'shoulder', 5, -1, ['.H..S.', '.H..S.', 'okBBko', 'HBBBBS', 'HBooBS', 'HBBBBS', 'HBBBBS']),
      part(['right'], 'shoulder', 7, -1, ['HB', 'HB', 'kB', 'BS', 'oS', 'BS', 'BS']),
      part(['back'], 'shoulder', 5, -1, ['.H..S.', '..HS..', '..SH..', '.H..S.', 'HBBBBS', 'HBBBBS', 'HBBBBS']),
    ],
  },
  bandolier: {
    describe: 'A cartridge bandolier across the chest, from the shoulder to the opposite hip.',
    slots: { strap: '#6b5033', edge: '#4a3624', shell: '#e0b84a', cap: '#b5532f' },
    symbols: { b: 'strap', o: 'edge', k: 'shell', c: 'cap' },
    parts: [
      part(['front'], 'shoulder', 5, 0, ['bo....', 'kbo...', '.kbo..', '..cbo.', '...kbo', '....kb']),
      part(['right'], 'shoulder', 6, 0, ['bo..', 'kbo.', '.cbo', '..kb']),
      part(['back'], 'shoulder', 5, 0, ['....ob', '...obk', '..obk.', '.obc..', 'obk...', 'bk....']),
    ],
  },
  'field-jacket': {
    describe: 'Field jacket details: shoulder tabs, flapped chest pockets and a collar, in the cloth colours.',
    slots: { light: '@cloth.highlight', base: '@cloth.base', shade: '@cloth.shadow', edge: '@cloth.outline', button: '#e0b84a' },
    symbols: { H: 'light', B: 'base', S: 'shade', o: 'edge', k: 'button' },
    parts: [
      part(['front'], 'shoulder', 4, -1, ['oHo', 'oo.']),
      part(['front'], 'shoulder', 9, -1, ['oSo', '.oo']),
      part(['front'], 'shoulder', 5, 2, ['SSS', 'HkB', 'oBo']),
      part(['front'], 'shoulder', 8, 2, ['SSS', 'BkH', 'oSo']),
      part(['right'], 'shoulder', 7, 2, ['SSS', 'HkB', 'oBo']),
      part(['back'], 'shoulder', 4, -1, ['oHBBBBSo']),
    ],
  },
};

export const WARDROBE_MOTIF_NAMES = Object.keys(WARDROBE_MOTIFS);
export { ALL as WARDROBE_DIRECTIONS };
