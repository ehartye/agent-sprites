import { quadrupedSide, quadrupedFrontBack, quadrupedDown } from './creature-quadruped.js';
import { insectSide, insectFrontBack, insectDown, arachnidSide, arachnidFrontBack, arachnidDown } from './creature-arthropod.js';
import { birdSide, birdFrontBack, birdDown } from './creature-bird.js';
import { bipedSide, bipedFrontBack, bipedDown } from './creature-biped.js';
import { blobSide, blobFrontBack, blobDown } from './creature-blob.js';

const pick = (side, fb, down) => ctx => ctx.pose.down ? down(ctx) : ctx.view === 'right' ? side(ctx) : fb(ctx);
const COMMON = ['glow_eyes', 'glow_patch', 'extra_eyes', 'spikes'];

/** Body plans: how each is drawn, what it can wear, and its defaults. */
export const PLANS = {
  quadruped: {
    draw: pick(quadrupedSide, quadrupedFrontBack, quadrupedDown),
    attacks: ['bite', 'charge'],
    features: [...COMMON, 'horns', 'tusks', 'tail', 'fur', 'beard', 'wool', 'saddle', 'pack', 'extra_limbs', 'second_head', 'hump', 'shell'],
    defaults: { head: 'canid', tail: 'whip', paw: 'paw' },
    options: { head: ['canid', 'bovid', 'swine', 'caprine', 'equine'], tail: ['whip', 'tuft', 'club', 'stub'], paw: ['paw', 'hoof'] },
  },
  insect: {
    draw: pick(insectSide, insectFrontBack, insectDown),
    attacks: ['bite'],
    features: [...COMMON, 'mandibles', 'antennae', 'shell', 'wings', 'extra_limbs'],
    defaults: {}, options: {},
  },
  arachnid: {
    draw: pick(arachnidSide, arachnidFrontBack, arachnidDown),
    attacks: ['stinger', 'pincer'],
    features: [...COMMON, 'stinger', 'pincers', 'shell', 'extra_limbs'],
    defaults: {}, options: {},
  },
  bird: {
    draw: pick(birdSide, birdFrontBack, birdDown),
    attacks: ['peck'],
    features: [...COMMON, 'comb', 'metal_feathers'],
    defaults: {}, options: {},
  },
  blob: {
    draw: pick(blobSide, blobFrontBack, blobDown),
    attacks: ['slam', 'bite'],
    features: [...COMMON, 'shell'],
    defaults: {}, options: {},
  },
  biped: {
    minSize: [24, 24], // two legs, two arms and a head need room: smaller cells clip
    draw: pick(bipedSide, bipedFrontBack, bipedDown),
    attacks: ['slam', 'sweep', 'blast'],
    features: [...COMMON, 'horns', 'tusks', 'hump', 'shell', 'core', 'pauldrons', 'cannon', 'antennae'],
    defaults: { head: 'brute', paw: 'fist' },
    options: { head: ['brute', 'helm'], paw: ['fist', 'claw'] },
  },
};
