// Wasteland costume motif library for the native 16x32 cast.
//
// Each entry composes from NAMES: `{name:'wide-brim-hat', colors:{band:'#b5532f'}}` in a
// native build's `motifs` list expands to the landmark-anchored pixel motifs that
// costume-template.mjs already understands (front/right/back authored, left reflects
// right). Entries are adult-proportioned; a large body widens them automatically.
//
// Colours come from named slots. A slot default is a literal hex from the shared
// wasteland ramps, or '@material.role' which follows the character's own material
// (so a duster's coat matches its sleeves). Callers override any slot by name.

const R = { // shared ramps (light to dark); see the game's palette docs
  dust: ['#e3cf93', '#c9a869', '#b08d57', '#8f6f45', '#6b5033', '#4a3624'],
  rust: ['#d98b4a', '#b5532f', '#8c3b25', '#5e2a1f'],
  oxide: ['#8fc4b4', '#5f9a8d', '#3f6f68', '#2a4a4a'],
  concrete: ['#c4c3ba', '#a8a79e', '#85847c', '#5f5f5a', '#3c3c3a', '#26262a'],
  scrub: ['#a9b45a', '#8a9a4a', '#6b7d3a', '#4a5c2f', '#2f3d22'],
  harvest: ['#f0d466', '#e0b84a', '#c58f2c'],
  glow: ['#d6ff9a', '#9dff6e', '#5ac96a'],
};

const ALL = ['front', 'right', 'back'];
const FB = ['front', 'back'];
const part = (directions, anchor, x, y, rows, extra = {}) => ({ directions, anchor, x, y, rows, ...extra });

/**
 * name -> {slots, symbols, parts, ...}. `symbols` maps a pixel-row character to a slot.
 * `side` entries (pauldron) are authored for the character's right and mirror for 'left'.
 */
export const WASTELAND_MOTIFS = {
  'wide-brim-hat': {
    describe: 'Wide-brim sun hat: crown, band and a brim that shades the forehead.',
    slots: { light: R.dust[0], base: R.dust[1], shade: R.dust[2], band: R.rust[1], edge: R.dust[5] },
    symbols: { h: 'light', b: 'base', s: 'shade', a: 'band', o: 'edge' },
    parts: [part(ALL, 'head', 0, -2, [
      '....oooooooo....',
      '...ohhhhbbbso...',
      '...ohhbbbbbso...',
      '...oaaaaaaaao...',
      'ohhhhhhbbbbbbbso',
      '.osssssssssssso.',
    ])],
  },
  scarf: {
    describe: 'Neck scarf with a hanging tail.',
    slots: { light: R.oxide[0], base: R.oxide[1], shade: R.oxide[2], edge: R.oxide[3] },
    symbols: { h: 'light', b: 'base', s: 'shade', o: 'edge' },
    parts: [
      part(FB, 'shoulder', 4, -2, ['ohhbbbbo', 'obbbbbso']),
      part(['front'], 'shoulder', 8, 0, ['obo', 'oso', '.oo']),
      part(['back'], 'shoulder', 6, 0, ['obbo', 'obso', '.oso', '..oo']),
      part(['right'], 'shoulder', 4, -2, ['ohhbbo', 'obbbso']),
      part(['right'], 'shoulder', 3, 0, ['obo', 'oso', 'oso', '.oo']),
    ],
  },
  bandana: {
    describe: 'Head bandana knotted behind, with polka dots.',
    slots: { light: R.rust[0], base: R.rust[1], shade: R.rust[2], dot: R.dust[0], edge: R.rust[3] },
    symbols: { h: 'light', b: 'base', s: 'shade', p: 'dot', o: 'edge' },
    parts: [
      part(FB, 'head', 2, -1, ['oooooooooooo', 'ohhhbbbbbbso', 'ohbbpbbbpbso', 'obbbbbbbbbso', 'osssssssssso']),
      part(['right'], 'head', 2, -1, ['oooooooooooo', 'ohhhbbbbbbso', 'ohbbpbbbpbso', 'obbbbbbbbbso', 'osssssssssso']),
      part(['right'], 'head', 0, 2, ['obo', 'oso', '.o.']),
      part(['back'], 'head', 6, 4, ['obbo', 'osso', '.oo.']),
    ],
  },
  goggles: {
    describe: 'Round goggles over the eyes with a teal lens and a strap.',
    slots: { lens: R.oxide[1], glint: R.oxide[0], frame: R.concrete[4], strap: R.dust[4] },
    symbols: { L: 'lens', G: 'glint', o: 'frame', t: 'strap' },
    parts: [
      part(['front'], 'head', 3, 6, ['tttttttttt', 'oLGLttLGLo', 'oLLLttLLLo', '.ooo..ooo.']),
      part(['right'], 'head', 3, 6, ['tttttttttt', 'tttttooLGo', 'ttttttoLLo', '.......oo.']),
      part(['back'], 'head', 3, 6, ['tttttttttt', 'tttttttttt']),
    ],
  },
  respirator: {
    describe: 'Gas mask or respirator over nose and mouth with a filter canister.',
    slots: { base: R.scrub[2], shade: R.scrub[3], filter: R.concrete[2], filterDark: R.concrete[4], strap: R.dust[5] },
    symbols: { M: 'base', m: 'shade', F: 'filter', k: 'filterDark', o: 'strap', t: 'strap' },
    parts: [
      part(['front'], 'head', 4, 8, ['oooooooo', 'oMMMMMMo', 'oMmFFmMo', '.mmFkmm.', '..oFkoo.']),
      part(['right'], 'head', 8, 8, ['ooooo', 'MMMMo', 'MmmMo', 'FFmMo', 'FkMoo']),
      part(['right'], 'head', 3, 7, ['ttttt']),
      part(['back'], 'head', 3, 7, ['oooooooooo', '.oooooooo.']),
    ],
  },
  'welding-mask': {
    describe: 'Lowered welding mask: dome, dark visor glass and chin guard.',
    slots: { light: R.concrete[1], base: R.concrete[2], shade: R.concrete[3], glass: R.oxide[3], glint: R.oxide[0], edge: R.concrete[5] },
    symbols: { c: 'light', C: 'base', s: 'shade', K: 'glass', g: 'glint', o: 'edge' },
    parts: [
      part(['front', 'right'], 'head', 2, -1, [
        '.oooooooooo.',
        'occccCCCCCso',
        'occCCCCCCCso',
        'oCCCCCCCCCso',
        'oCCCCCCCCsso',
        'ooooooooooso',
        'oKKKKKKKKKKo',
        'oKgKKKKKKKKo',
        'oKKKKKKKKKKo',
        'ooooooooooso',
        '.oCCCCCCCCo.',
        '..oCCCCCCo..',
        '...oooooo...',
      ]),
      part(['back'], 'head', 2, -1, [
        '.oooooooooo.',
        'occccCCCCCso',
        'occCCCCCCCso',
        'oCCCCCCCCCso',
        'oCCCCCCCCsso',
        'oCCCCCCCCsso',
        'oCCoCCCCoCso',
        'oCCCCCCCCsso',
        'ooooooooooso',
        '.oCCCCCCCCo.',
        '..oCCCCCCo..',
        '...oooooo...',
      ]),
    ],
  },
  'duster-coat': {
    describe: 'Long duster: popped collar and a split skirt to the knees, in the cloth colours.',
    slots: { light: '@cloth.highlight', base: '@cloth.base', shade: '@cloth.shadow', edge: '@cloth.outline' },
    symbols: { H: 'light', B: 'base', S: 'shade', o: 'edge', s: 'edge' },
    parts: [
      part(['front'], 'shoulder', 3, -1, ['..oHo..oSo.', '..oBo..oSo.']),
      part(['front'], 'waist', 3, 2, [
        'oHBo..oBSo',
        'oHBBo.oBSo',
        'oHBBo.oBSo',
        'oHBBBooBSo',
        'oHHBo.oBSo',
        'oBoHo.oSBo',
      ]),
      part(['right'], 'waist', 4, 2, [
        'oHBBBSo.',
        'oHBBBSSo',
        'oHBBBBSo',
        'oHBBBBSo',
        'oHBHBSSo',
        'oBoHBoSo',
      ]),
      part(['back'], 'waist', 3, 2, [
        'oHBBBBBBSo',
        'oHBBsSBBSo',
        'oHBBsSBBSo',
        'oHBBsSBBSo',
        'oHBBsSBBSo',
        'oBoHssBoSo',
      ]),
    ],
  },
  'ragged-cloak': {
    describe: 'Ragged cloak: a shoulder mantle plus a drape that hangs behind the body.',
    slots: { light: R.dust[2], base: R.dust[3], shade: R.dust[4], edge: R.dust[5] },
    symbols: { H: 'light', B: 'base', S: 'shade', o: 'edge' },
    parts: [
      part(FB, 'shoulder', 2, -2, ['..oooooooo..', '.oHHBBBBBSo.', 'oHBBBBBBBSSo']),
      part(['front'], 'shoulder', 1, 0, [
        'oHBBBBBBBBBBSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oBHBBBBBBBBSBo',
        'oBoHBBBBBBSoBo',
        '.o.oHBBBBSo.o.',
        '...o.oBBSo.o..',
      ], { layer: 'behind' }),
      part(['back'], 'shoulder', 1, 1, [
        'oHBBBBBBBBBBSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oHBBBBBBBBBSSo',
        'oBHBBBBBBBBSBo',
        'oBoHBBBBBBSoBo',
        '.o.oHBBBBSo.o.',
        '...o.oBBSo.o..',
      ]),
      part(['right'], 'shoulder', 1, -1, [
        'oHBBBo',
        'oHBBBBo',
        'oHBBBBSo',
        'oHBBBBSo',
        'oHBBBBSo',
        'oBHBBBSo',
        'oBoHBBSo',
        '.o.oBSSo',
        '...o.oSo',
      ], { layer: 'behind' }),
    ],
  },
  'scrap-pauldron': {
    describe: 'Scrap-plate shoulder armour with rivets, on one shoulder (side: right|left).',
    slots: { light: R.concrete[1], base: R.concrete[2], shade: R.concrete[3], rivet: R.concrete[0], edge: R.concrete[5] },
    symbols: { H: 'light', B: 'base', S: 'shade', r: 'rivet', o: 'edge' },
    side: 'right',
    parts: [
      part(['front'], 'shoulder', 1, -2, ['.ooooo.', 'oHHHBSo', 'oHrBBSo', 'oBBBSSo', '.ooSSo.'], { overArms: true }),
      part(['right'], 'shoulder', 5, -2, ['.ooooo.', 'oHHHBSo', 'oHrBBSo', 'oBBBSSo', '.ooSSo.'], { overArms: true }),
      part(['back'], 'shoulder', 8, -2, ['.ooooo.', 'oHHBBSo', 'oBBBrSo', 'oBBBSSo', '.ooSSo.'], { overArms: true }),
    ],
  },
  backpack: {
    describe: 'Loaded pack: straps on the chest, the bulk behind (front, side) or over the back.',
    slots: { light: R.scrub[2], base: R.scrub[3], shade: R.scrub[4], strap: R.dust[4], buckle: R.harvest[1], edge: R.dust[5] },
    symbols: { H: 'light', B: 'base', S: 'shade', t: 'strap', k: 'buckle', o: 'edge' },
    parts: [
      part(['front'], 'shoulder', 6, 0, ['t..t', 't..t', 'tkkt', 't..t', 't..t']),
      part(['front'], 'shoulder', 1, -3, [
        '.oooooooooooo.',
        'oHHHBBBBBBBSSo',
        'oHBBBBBBBBBBSo',
        'oHBBBBBBBBBBSo',
        'oHBBBBBBBBBBSo',
        'oHBBBBBBBBBBSo',
        'oBBBBBBBBBBBSo',
        'oBBBBBBBBBBBSo',
        '.oSSSSSSSSSSo.',
        '..oooooooooo..',
      ], { layer: 'behind' }),
      part(['back'], 'shoulder', 3, -1, [
        'oooooooooo',
        'oHHBBBBBSo',
        'oHBBBBBBSo',
        'oHBkBBkBSo',
        'oHBBBBBBSo',
        'oHBBBBBBSo',
        'oHBkBBkBSo',
        'oBBBBBBBSo',
        'oSSSSSSSSo',
        '.oooooooo.',
      ]),
      part(['right'], 'shoulder', 0, -1, [
        '.ooooo.',
        'oHHBBSo',
        'oHBBBSo',
        'oHBBBSo',
        'oHBBBSo',
        'oHBkBSo',
        'oHBBBSo',
        'oBBBBSo',
        'oSSSSSo',
        '.ooooo.',
      ], { layer: 'behind' }),
    ],
  },
  bedroll: {
    describe: 'Rolled blanket strapped above the pack (behind layer; over the shoulders from the back).',
    slots: { light: R.rust[0], base: R.rust[1], shade: R.rust[2], strap: R.dust[4], edge: R.rust[3] },
    symbols: { H: 'light', B: 'base', S: 'shade', t: 'strap', o: 'edge' },
    parts: [
      part(['front'], 'shoulder', 1, -2, ['.oooooooooooo.', 'oHBBtBBBBtBBSo', 'oBBBtBBBBtBSSo', '.oSSSSSSSSSSo.'], { layer: 'behind' }),
      part(['back'], 'shoulder', 2, -3, ['.oooooooooo.', 'oHBBtBBtBBSo', 'oBBBtBBtBSSo', '.oSSSSSSSSo.']),
      part(['right'], 'shoulder', 0, -4, ['.oooo.', 'oHBBSo', 'oBttSo', 'oBBSSo', '.oooo.'], { layer: 'behind' }),
    ],
  },
  canteen: {
    describe: 'Canteen on a strap at the hip.',
    slots: { light: R.concrete[1], base: R.concrete[2], shade: R.concrete[3], cap: R.rust[1], edge: R.concrete[5] },
    symbols: { H: 'light', B: 'base', S: 'shade', c: 'cap', o: 'edge' },
    side: 'right',
    parts: [
      part(['front'], 'waist', 8, 1, ['.oco', 'oHBo', 'oBBo', 'oBSo', '.oo.']),
      part(['right'], 'waist', 5, 1, ['.oco', 'oHBo', 'oBBo', 'oBSo', '.oo.']),
      part(['back'], 'waist', 9, 1, ['.oco', 'oHBo', 'oBBo', 'oBSo', '.oo.']),
    ],
  },
  'tool-belt': {
    describe: 'Leather belt with buckle, a pouch and a hammer.',
    slots: { light: R.dust[3], base: R.dust[4], shade: R.dust[5], buckle: R.harvest[1], metal: R.concrete[2], edge: R.dust[5] },
    symbols: { H: 'light', B: 'base', S: 'shade', k: 'buckle', m: 'metal', o: 'edge' },
    parts: [
      part(['front'], 'waist', 5, 0, ['BBkkBB']),
      part(['front'], 'waist', 5, 1, ['oBBo', 'oHBo', 'oooo']),
      part(['front'], 'waist', 10, 1, ['mm', 'oS', 'oS', 'oS']),
      part(['right'], 'waist', 5, 0, ['BBBkBB']),
      part(['right'], 'waist', 6, 1, ['oBBo', 'oHBo', 'oooo']),
      part(['back'], 'waist', 5, 0, ['BBBBBB']),
      part(['back'], 'waist', 5, 1, ['oBBo', 'oHBo', 'oooo']),
    ],
  },
  'bone-trophy': {
    describe: 'Necklace of fangs and a small skull at the belt.',
    slots: { bone: R.dust[0], shade: R.dust[2], cord: R.dust[5], eye: R.concrete[5] },
    symbols: { c: 'bone', s: 'shade', o: 'cord', k: 'eye' },
    parts: [
      part(['front'], 'shoulder', 4, 0, ['oc.cc.co', '.oc..co.']),
      part(['front'], 'waist', 6, 0, ['.cc.', 'ckkc', '.sc.']),
      part(['right'], 'shoulder', 7, 0, ['ccc', 'osc']),
      part(['back'], 'shoulder', 5, -1, ['oooooo']),
    ],
  },
  'rag-patches': {
    describe: 'Mismatched cloth patches and torn knees for ragged clothes.',
    slots: { light: R.dust[1], base: R.dust[2], dark: R.dust[4], thread: R.dust[5] },
    symbols: { h: 'light', b: 'base', d: 'dark', t: 'thread' },
    parts: [
      part(['front'], 'shoulder', 6, 2, ['hht', 'hbt']),
      part(['front'], 'shoulder', 9, 4, ['dd', 'dt']),
      part(['front'], 'waist', 5, 4, ['bbt', 'bdt']),
      part(['right'], 'shoulder', 7, 2, ['hht', 'hbt']),
      part(['right'], 'waist', 6, 5, ['bbt', 'bdt']),
      part(['back'], 'shoulder', 6, 3, ['hht', 'hbt']),
      part(['back'], 'waist', 8, 4, ['bbt', 'bdt']),
    ],
  },
  'glow-eyes': {
    describe: 'Glowing eyes (emissive glow ramp), for ghouls and mutants.',
    slots: { core: R.glow[0], glow: R.glow[1] },
    symbols: { G: 'core', g: 'glow' },
    parts: [
      part(['front'], 'head', 5, 7, ['gG..Gg', 'gg..gg']),
      part(['right'], 'head', 8, 6, ['gG', 'gg']),
    ],
  },
  'extra-arm': {
    describe: 'A third arm crossing the body: a forearm and fist drawn over the belly (a mutant, an insectoid).',
    slots: { base: '@skin.base', shade: '@skin.shadow', light: '@skin.highlight', edge: '@skin.outline' },
    symbols: { B: 'base', S: 'shade', H: 'light', o: 'edge' },
    parts: [
      part(['front'], 'waist', 5, -3, ['..ooooooo.', '.oHHHHHHHo', 'oHHHHHHHBo', 'oHHooooHBo', '.oHHHHBBo.', '..ooooooo.'], { coverHands: true }),
      part(['right'], 'waist', 7, -3, ['oooooo', 'oHHHHo', 'oHHBBo', 'oHooBo', '.oHBBo', '..ooo.'], { coverHands: true }),
      part(['back'], 'waist', 10, -4, ['.ooo', 'oBBSo', 'oBSSo', '.ooo']),
    ],
  },
  'ragged-trousers': {
    describe: 'Ragged trousers with a torn hem, drawn over the legs (the large body is otherwise bare).',
    slots: { light: R.dust[3], base: R.dust[4], shade: R.dust[5], edge: '#2c2018' },
    symbols: { H: 'light', B: 'base', S: 'shade', o: 'edge' },
    parts: [
      part(FB, 'waist', 4, 1, ['oHBBBBSo', 'oHBBBBSo', 'oHBBoBSo', 'oHBBoBSo', 'oBoHoBoS']),
      part(['right'], 'waist', 5, 1, ['oHBBBSo', 'oHBBBSo', 'oHBBoSo', 'oHBBoSo', 'oBoHBoS']),
    ],
  },
  'glow-core': {
    describe: 'A small glowing core on the chest (emissive glow ramp): alien tech, power cells.',
    slots: { core: R.glow[0], glow: R.glow[1], edge: R.concrete[5] },
    symbols: { G: 'core', g: 'glow', o: 'edge' },
    parts: [
      part(['front'], 'shoulder', 6, 1, ['oGGo', 'oggo']),
      part(['right'], 'shoulder', 7, 1, ['oGo', 'ogo']),
    ],
  },
  antennae: {
    describe: 'Two antennae rising from the head.',
    slots: { base: R.oxide[1], tip: R.glow[1], edge: R.oxide[3] },
    symbols: { b: 'base', g: 'tip', o: 'edge' },
    parts: [
      part(FB, 'head', 3, -2, ['g......g', 'b......b', '.b....b.']),
      part(['right'], 'head', 6, -2, ['g..g', '.bb.']),
    ],
  },
  'grey-alien-head': {
    describe: 'Replacement head: a smooth grey dome with large black almond eyes and a glow accent.',
    slots: { light: '#c4c3ba', base: '#a8a79e', shade: '#85847c', eye: '#0d1126', glint: R.glow[0], edge: '#3c3c3a' },
    symbols: { h: 'light', b: 'base', s: 'shade', K: 'eye', g: 'glint', o: 'edge' },
    replaceHead: true,
    parts: [
      part(['front'], 'head', 3, 0, [
        '..oooooo..',
        '.ohhhbbbo.',
        'ohhbbbbbbo',
        'obbbbbbbbo',
        'oKKKbbKKKo',
        'oKgKKKKgKo',
        'obKKbbKKbo',
        '.obbbbbbo.',
        '..obsssbo.',
        '...oooso..',
      ], { part: 'head' }),
      part(['right'], 'head', 3, 0, [
        '..oooooo..',
        '.ohhhbbbo.',
        'ohhbbbbbbo',
        'obbbbbKKKo',
        'obbbbKKgKo',
        'obbbbbKKbo',
        '.obbbbbbbo',
        '..obbbbbo.',
        '...obssbo.',
        '....ooso..',
      ], { part: 'head' }),
      part(['back'], 'head', 3, 0, [
        '..oooooo..',
        '.ohhhbbbo.',
        'ohhbbbbbbo',
        'obbbbbbbbo',
        'obbbbbbbbo',
        'obbbbbbbso',
        'obbbbbbbso',
        '.obbbbbso.',
        '..obbbsso.',
        '...ooooo..',
      ], { part: 'head' }),
      part(['front', 'right', 'back'], 'head', 6, 10, ['ob', 'sb']),
    ],
  },
  'scrap-bot-head': {
    describe: 'Replacement head: a boxy scrap-metal casing with a single glowing visor slit and a bolt.',
    slots: { light: R.concrete[1], base: R.concrete[2], shade: R.concrete[3], rust: R.rust[1], visor: R.glow[1], visorDark: R.concrete[5], edge: R.concrete[5] },
    symbols: { h: 'light', b: 'base', s: 'shade', r: 'rust', V: 'visor', K: 'visorDark', o: 'edge' },
    replaceHead: true,
    parts: [
      part(['front'], 'head', 3, 0, [
        'oooooooooo',
        'ohhhhhhhbo',
        'ohbbbbbbbo',
        'obrbbbbbso',
        'oKKKKKKKKo',
        'oKVVVVVVKo',
        'oKKKKKKKKo',
        'obbbbbbbso',
        'osssssssso',
        '.oooooooo.',
      ], { part: 'head' }),
      part(['right'], 'head', 3, 0, [
        'oooooooooo',
        'ohhhhhhhbo',
        'ohbbbbbbbo',
        'obrbbbbbso',
        'obbbbKKKKo',
        'obbbbKVVKo',
        'obbbbKKKKo',
        'obbbbbbbso',
        'osssssssso',
        '.oooooooo.',
      ], { part: 'head' }),
      part(['back'], 'head', 3, 0, [
        'oooooooooo',
        'ohhhhhhhbo',
        'ohbbbbbbbo',
        'obbbbbrbso',
        'obbbbbbbso',
        'obbssssbso',
        'obbbbbbbso',
        'obbbbbbbso',
        'osssssssso',
        '.oooooooo.',
      ], { part: 'head' }),
      part(['front', 'right', 'back'], 'head', 6, 10, ['osso', 'obbo']),
    ],
  },
};

const HEX = /^#[\da-f]{6}$/i;

/** Material ramp lookup used by '@material.role' slot defaults. */
function ramp(materials, name) {
  const m = materials?.[name];
  return m && ['outline', 'shadow', 'base', 'highlight'].every(r => HEX.test(m[r] ?? '')) ? m : null;
}

function slotColor(value, materials, fallbackRamps) {
  if (typeof value !== 'string' || !value.startsWith('@')) return value;
  const [material, role] = value.slice(1).split('.');
  const found = ramp(materials, material) ?? fallbackRamps?.[material];
  if (!found?.[role]) throw new Error(`Motif colour ${value} needs a ${material} material.`);
  return found[role];
}

/** Mirror a right-authored front/back part for the character's left side. */
function mirrorPart(p) {
  if (p.directions.includes('right') || !p.directions.every(d => d === 'front' || d === 'back')) return p;
  const width = Math.max(...p.rows.map(r => r.length));
  return { ...p, x: 16 - (p.x + width), rows: p.rows.map(r => [...r.padEnd(width, '.')].reverse().join('')) };
}

// Widening for the large body: columns left of the centre shift left, right shift right,
// and the two centre-adjacent columns duplicate, exactly as large-mannequin.mjs broadens
// the body. Head-anchored motifs stay put (the large head equals the adult head).
function widenPart(p) {
  if (p.anchor === 'head') return p;
  const cells = new Map();
  p.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const x = p.x + i;
    const xs = x < 7 ? [x - 1, ...(x === 6 ? [6] : [])] : x > 8 ? [x + 1, ...(x === 9 ? [9] : [])] : [x];
    for (const nx of xs) cells.set(`${nx},${j}`, ch);
  }));
  for (const k of [...cells.keys()]) { const x = Number(k.split(',')[0]); if (x < 0 || x > 15) cells.delete(k); } // a wide motif is cropped at the cell edge
  const xsAll = [...cells.keys()].map(k => Number(k.split(',')[0]));
  const left = Math.min(...xsAll), right = Math.max(...xsAll);
  const rows = p.rows.map((_, j) => Array.from({ length: right - left + 1 }, (_, i) => cells.get(`${left + i},${j}`) ?? '.').join(''));
  return { ...p, x: left, rows };
}

export const MOTIF_NAMES = Object.keys(WASTELAND_MOTIFS);

/**
 * Expand library references into costume motifs. An entry is a name or
 * {name, colors?, side?, directions?, overArms?}; an object with `rows` is a custom
 * costume motif passed through untouched. `meta` collects per-motif facts (overArms,
 * replaceHead, library name) by the expanded index, for the recipe.
 */
export function expandMotifs(entries, { materials = {}, kind = 'adult', fallbackRamps = {} } = {}) {
  const motifs = [], meta = [];
  for (const entry of entries ?? []) {
    if (entry && typeof entry === 'object' && Array.isArray(entry.rows)) {
      motifs.push(entry);
      meta.push({ name: entry.name, overArms: Boolean(entry.overArms), replaceHead: false });
      continue;
    }
    const ref = typeof entry === 'string' ? { name: entry } : entry;
    if (!ref || typeof ref !== 'object' || typeof ref.name !== 'string') throw new Error('A motif is a library name, {name, colors}, or a custom motif with rows.');
    const lib = WASTELAND_MOTIFS[ref.name];
    if (!lib) throw new Error(`Unknown wasteland motif "${ref.name}". Choose from: ${MOTIF_NAMES.join(', ')}.`);
    for (const key of Object.keys(ref.colors ?? {})) if (!(key in lib.slots)) throw new Error(`Motif ${ref.name} has no colour slot "${key}". Slots: ${Object.keys(lib.slots).join(', ')}.`);
    if (ref.side !== undefined && !['left', 'right'].includes(ref.side)) throw new Error('Motif side must be left or right.');
    const slots = {};
    for (const [slot, value] of Object.entries({ ...lib.slots, ...(ref.colors ?? {}) })) {
      const resolved = slotColor(value, materials, fallbackRamps);
      if (!HEX.test(resolved)) throw new Error(`Motif ${ref.name} colour ${slot} must be a six-digit hex.`);
      slots[slot] = resolved;
    }
    const colors = Object.fromEntries(Object.entries(lib.symbols).map(([symbol, slot]) => [symbol, slots[slot]]));
    const mirror = (ref.side ?? lib.side) === 'left' && lib.side === 'right';
    for (const authored of lib.parts) {
      let p = mirror ? mirrorPart(authored) : authored;
      if (mirror && p.directions.includes('right') && p.directions.length === 1) continue; // hidden on the far side
      if (ref.directions) p = { ...p, directions: p.directions.filter(d => ref.directions.includes(d)) };
      if (!p.directions.length) continue;
      if (kind === 'large') p = widenPart(p);
      const { overArms, ...rest } = p;
      motifs.push({ name: ref.name, ...rest, colors });
      meta.push({ name: ref.name, overArms: Boolean(overArms ?? ref.overArms), replaceHead: Boolean(lib.replaceHead) });
    }
  }
  return { motifs, meta };
}
