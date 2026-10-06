// Named ramps and costume presets for the native recipe's wasteland motif library.
// A preset is plain recipe JSON that `native.preset` lays under the caller's own fields,
// so a game profile is usually `{preset, name, skin, hair}` plus a few overrides.

const ramp = (outline, shadow, base, highlight) => ({ outline, shadow, base, highlight });

/** Skin ramps (outline, shadow, base, highlight), from realistic tones to creature skins. */
export const SKIN_RAMPS = {
  fair: ramp('#6a4230', '#b57e5c', '#dca884', '#f2cfae'),
  tan: ramp('#5a3626', '#a06a48', '#c98f62', '#e8b88a'),
  brown: ramp('#3d2216', '#6e4129', '#8f5b3c', '#b57a54'),
  dark: ramp('#2c170f', '#4e2e22', '#6a4030', '#8a5a40'),
  ghoul: ramp('#3a4535', '#66755c', '#8a9a7a', '#a3b392'),
  zombie: ramp('#364032', '#5f7059', '#7d8f78', '#9aab94'),
  grey: ramp('#3c3c3a', '#85847c', '#a8a79e', '#c4c3ba'),
  mutant: ramp('#2f3d22', '#6b7d3a', '#8a9a4a', '#a9b45a'),
};

/** Hair ramps. */
export const HAIR_RAMPS = {
  brown: ramp('#4a3624', '#6b5033', '#8f6f45', '#b08d57'),
  black: ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c'),
  blond: ramp('#4a3624', '#b08d57', '#c9a869', '#e3cf93'),
  red: ramp('#5e2a1f', '#8c3b25', '#b5532f', '#d98b4a'),
  grey: ramp('#3c3c3a', '#5f5f5a', '#85847c', '#a8a79e'),
  white: ramp('#5f5f5a', '#85847c', '#a8a79e', '#c4c3ba'),
};

const dustCloth = ramp('#4a3624', '#8f6f45', '#b08d57', '#c9a869');
const rustCloth = ramp('#5e2a1f', '#8c3b25', '#b5532f', '#d98b4a');
const oxideCloth = ramp('#2a4a4a', '#3f6f68', '#5f9a8d', '#8fc4b4');
const slateCloth = ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c');
const scrubCloth = ramp('#2f3d22', '#4a5c2f', '#6b7d3a', '#8a9a4a');
const trouserDust = ramp('#26262a', '#4a3624', '#6b5033', '#8f6f45');
const trouserSlate = ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c');
const trimDust = ramp('#4a3624', '#8f6f45', '#b08d57', '#e3cf93');
const shoeDark = ramp('#26262a', '#4a3624', '#6b5033', '#8f6f45');

const O_HUMAN = '#4a3624'; // edge colour for costume pixels (the darkest dust step)

export const NATIVE_PRESETS = {
  'scavenger-rags': {
    describe: 'Starting wanderer: threadbare duster, sun hat, scarf, patches, a canteen.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'hoe',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.fair, hair: HAIR_RAMPS.brown, cloth: dustCloth, trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['duster-coat', 'rag-patches', 'wide-brim-hat', { name: 'scarf', colors: { light: '#8fc4b4', base: '#5f9a8d', shade: '#3f6f68', edge: '#2a4a4a' } }, 'canteen'],
  },
  'scavenger-scrap': {
    describe: 'Scrap-armour wanderer: plated shoulder, goggles on the hat, tool belt, trophies.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'pick',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.fair, hair: HAIR_RAMPS.brown, cloth: rustCloth, trousers: trouserSlate, trim: trimDust, shoes: shoeDark },
    motifs: ['duster-coat', 'scrap-pauldron', 'wide-brim-hat', { name: 'scarf', colors: { light: '#f0d466', base: '#e0b84a', shade: '#c58f2c', edge: '#8c3b25' } }, 'tool-belt', 'bone-trophy', 'canteen'],
  },
  'scavenger-expedition': {
    describe: 'Expedition kit: weathered duster, loaded pack and bedroll, goggles, belt, canteen.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'pick',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.fair, hair: HAIR_RAMPS.brown, cloth: oxideCloth, trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['duster-coat', 'backpack', 'bedroll', 'wide-brim-hat', { name: 'scarf', colors: { light: '#d98b4a', base: '#b5532f', shade: '#8c3b25', edge: '#5e2a1f' } }, 'tool-belt', 'canteen'],
  },
  'settler-farmer': {
    describe: 'Farmer: sun hat, patched work clothes, canteen and tool belt; swings a hoe.',
    kind: 'adult', outfit: 'jacket', wig: 'tied', actions: true, tool: 'hoe',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.tan, hair: HAIR_RAMPS.brown, cloth: scrubCloth, trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['wide-brim-hat', 'rag-patches', 'tool-belt', 'canteen'],
  },
  'settler-tinkerer': {
    describe: 'Tinkerer: goggles, bandana, heavy tool belt, scrap shoulder plate.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'club',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.brown, hair: HAIR_RAMPS.black, cloth: rustCloth, trousers: trouserSlate, trim: trimDust, shoes: shoeDark },
    motifs: ['bandana', 'goggles', 'tool-belt', { name: 'scrap-pauldron', side: 'left' }],
  },
  'settler-elder': {
    describe: 'Elder: grey hair, a ragged cloak over a long robe and a scarf.',
    kind: 'adult', outfit: 'dress', wig: 'tied', actions: true, tool: 'club',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.fair, hair: HAIR_RAMPS.white, cloth: oxideCloth, trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['ragged-cloak', { name: 'scarf', colors: { light: '#e3cf93', base: '#c9a869', shade: '#b08d57', edge: '#6b5033' } }],
  },
  trader: {
    describe: 'Merchant: a loaded pack with a bedroll, a wide hat with a gold band, canteen and belt.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'club',
    colors: { o: O_HUMAN },
    materials: { skin: SKIN_RAMPS.brown, hair: HAIR_RAMPS.black, cloth: rustCloth, trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['backpack', 'bedroll', { name: 'wide-brim-hat', colors: { band: '#f0d466' } }, { name: 'scarf', colors: { light: '#e3cf93', base: '#c9a869', shade: '#b08d57', edge: '#6b5033' } }, 'tool-belt', 'canteen'],
  },
  raider: {
    describe: 'Raider: respirator, scrap shoulder plate, bone trophies, ragged cloak; swings a club.',
    kind: 'adult', outfit: 'jacket', wig: 'none', actions: true, tool: 'club',
    colors: { o: '#26262a' },
    materials: { skin: SKIN_RAMPS.tan, hair: HAIR_RAMPS.black, cloth: slateCloth, trousers: trouserSlate, trim: ramp('#26262a', '#5e2a1f', '#8c3b25', '#b5532f'), shoes: shoeDark },
    motifs: ['ragged-cloak', 'scrap-pauldron', 'respirator', 'bone-trophy', 'tool-belt', { name: 'bandana', colors: { light: '#d98b4a', base: '#b5532f', shade: '#8c3b25', edge: '#5e2a1f' } }],
  },
  ghoul: {
    describe: 'Ghoul: grey-green skin, ragged clothes and glowing eyes.',
    kind: 'adult', outfit: 'jacket', wig: 'none', actions: true, tool: 'club',
    colors: { o: '#2a3328' },
    materials: { skin: SKIN_RAMPS.ghoul, cloth: ramp('#4a3624', '#6b5033', '#8f6f45', '#b08d57'), trousers: trouserSlate, trim: ramp('#4a3624', '#6b5033', '#8f6f45', '#b08d57'), shoes: shoeDark },
    motifs: ['rag-patches', 'glow-eyes'],
  },
  zombie: {
    describe: 'Zombie: sallow skin, torn clothes and a shambling arms-forward walk.',
    kind: 'adult', outfit: 'jacket', wig: 'short', actions: true, tool: 'club', posture: 'shamble',
    colors: { o: '#2a3328' },
    materials: { skin: SKIN_RAMPS.zombie, hair: ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c'), cloth: ramp('#2a4a4a', '#3f6f68', '#5f9a8d', '#8fc4b4'), trousers: trouserDust, trim: trimDust, shoes: shoeDark },
    motifs: ['rag-patches'],
  },
  'mutant-brute': {
    describe: 'Mutant brute: the large body, an extra arm, one scrap shoulder plate and glowing eyes.',
    kind: 'large', outfit: 'none', actions: true, tool: 'club',
    colors: { o: '#2f3d22' },
    materials: { skin: SKIN_RAMPS.mutant },
    motifs: ['extra-arm', 'ragged-trousers', 'scrap-pauldron', 'glow-eyes'],
  },
  'alien-visitor': {
    describe: 'Alien visitor: a smooth grey head with black eyes, antennae and a glowing chest gem.',
    kind: 'adult', outfit: 'jacket', wig: 'none', actions: true, tool: 'club',
    colors: { o: '#26262a' },
    materials: { skin: SKIN_RAMPS.grey, cloth: oxideCloth, trousers: ramp('#2a4a4a', '#3f6f68', '#5f9a8d', '#8fc4b4'), trim: ramp('#26262a', '#3f6f68', '#5f9a8d', '#8fc4b4'), shoes: ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c') },
    motifs: ['grey-alien-head', 'antennae', 'glow-core'],
  },
  'scrap-bot': {
    describe: 'Scrap-bot: a boxy scrap-metal frame with a glowing visor and power core.',
    kind: 'adult', outfit: 'jacket', wig: 'none', actions: true, tool: 'club', bodyMaterial: 'casing', armMaterial: 'casing', handMaterial: 'casing',
    colors: { o: '#26262a' },
    materials: { skin: ramp('#3c3c3a', '#85847c', '#a8a79e', '#c4c3ba'), cloth: ramp('#26262a', '#5f5f5a', '#85847c', '#a8a79e'), trousers: ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c'), trim: ramp('#5e2a1f', '#8c3b25', '#b5532f', '#d98b4a'), shoes: ramp('#26262a', '#3c3c3a', '#5f5f5a', '#85847c') },
    motifs: ['scrap-bot-head', 'glow-core', 'rag-patches'],
  },
};

export const PRESET_NAMES = Object.keys(NATIVE_PRESETS);
