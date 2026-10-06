import {diagonalJoints} from './native-diagonal.mjs';

// Authored body landmarks for the 16×32 source poses (cell pixels, bob included).
// Front: the character's right is on the image left. Right profile: the right side
// is near. Left, back and large are derived — never author them.
// Rows marked "review" were ambiguous in the art; the owner confirms them on the overlay.
export const JOINTS = {
  adult: {
    front_0: {right:{shoulder:[4,15],wrist:[3,21],hip:[6,21]},left:{shoulder:[11,15],wrist:[12,21],hip:[9,21]}},
    front_1: {right:{shoulder:[4,16],wrist:[4,20],hip:[6,22]},left:{shoulder:[11,16],wrist:[12,22],hip:[9,22]}},
    front_2: {right:{shoulder:[4,15],wrist:[3,21],hip:[6,21]},left:{shoulder:[11,15],wrist:[12,21],hip:[9,21]}},
    front_3: {right:{shoulder:[4,16],wrist:[3,22],hip:[6,22]},left:{shoulder:[11,16],wrist:[11,20],hip:[9,22]}},
    right_0: {right:{shoulder:[8,15],wrist:[5,20],hip:[8,21]},left:{shoulder:[9,15],wrist:[10,21],hip:[9,21]}},
    right_1: {right:{shoulder:[8,16],wrist:[12,21],hip:[8,22]},left:{shoulder:[9,16],wrist:[3,21],hip:[9,22]}},
    right_2: {right:{shoulder:[8,15],wrist:[5,20],hip:[8,21]},left:{shoulder:[9,15],wrist:[10,21],hip:[9,21]}},
    right_3: {right:{shoulder:[8,16],wrist:[3,22],hip:[8,22]},left:{shoulder:[9,16],wrist:[11,21],hip:[9,22]}},
  },
  child: {
    front_0: {right:{shoulder:[4,20],wrist:[2,24],hip:[6,24]},left:{shoulder:[11,20],wrist:[12,24],hip:[9,24]}},
    front_1: {right:{shoulder:[4,21],wrist:[4,23],hip:[6,25]},left:{shoulder:[11,21],wrist:[12,25],hip:[9,25]}},
    front_2: {right:{shoulder:[4,20],wrist:[2,24],hip:[6,24]},left:{shoulder:[11,20],wrist:[12,24],hip:[9,24]}},
    front_3: {right:{shoulder:[4,21],wrist:[3,25],hip:[6,25]},left:{shoulder:[11,21],wrist:[11,23],hip:[9,25]}},
    // Standing profile: the far hand is hidden, so its wrist sits behind the body.
    right_0: {right:{shoulder:[8,20],wrist:[5,24],hip:[8,24]},left:{shoulder:[9,20],wrist:[9,24],hip:[9,24]}},
    right_1: {right:{shoulder:[8,21],wrist:[3,24],hip:[8,25]},left:{shoulder:[9,21],wrist:[11,23],hip:[9,25]}}, // review
    right_2: {right:{shoulder:[8,20],wrist:[5,24],hip:[8,24]},left:{shoulder:[9,20],wrist:[9,24],hip:[9,24]}},
    right_3: {right:{shoulder:[8,21],wrist:[10,24],hip:[8,25]},left:{shoulder:[9,21],wrist:[4,24],hip:[9,25]}}, // review
  },
};

/**
 * Walk stride per frame, in source pixels. Measured from the art: the mean over the
 * two stride frames of (front-foot centre − back-foot centre on row 29) ÷ 2, rounded
 * to 0.5. The drawn walk is uneven, so a constant stride leaves about 1px of foot
 * slide: reports mark contacts uncalibrated.
 */
export const STRIDE = { adult: 3.5, child: 2.5, large: 4 };

/**
 * Body travel per profile (right/left) walk frame, in source pixels, so the
 * support foot stays planted. Measured from the art on the ground row (29) as
 * sole centres: frame 0 → 1 the passing foot becomes the back foot, 1 → 2 the
 * front foot becomes the passing foot, and likewise for frames 2 → 3 → 0. Right
 * and left mirror exactly. Uneven because the drawn strides are.
 */
export const PROFILE_STEPS = { adult: [3.5, 2.5, 4.5, 3], child: [3.5, 1, 3.5, 2], large: [4, 3, 5.5, 4] };

/** Hand boxes that clothing leaves exposed. Moved verbatim from dress-template.mjs. */
export function handBoxes(kind, dir, phase) {
  const neutral=phase%2===0;
  let hands=kind==='adult'?(dir==='right'?(neutral?[[4,20,7,21],[10,21,11,22]]:phase===1?[[2,20,4,22],[11,20,13,22]]:[[2,21,4,23],[10,20,12,22]]):(neutral?[[2,20,4,23],[11,20,13,23]]:[[3,20,4,21],[11,21,13,24]])):
    (dir==='right'?(neutral?[[4,24,7,25]]:phase===1?[[2,24,4,25],[11,23,12,24]]:[[3,24,5,25],[10,24,11,25]]):(neutral?[[1,23,4,25],[11,23,14,25]]:[[3,23,4,24],[11,24,14,26]]));
  if(dir!=='right'&&phase===3)hands=hands.map(([l,t,r,b])=>[15-r,t,15-l,b]);
  return hands;
}

const mirror=([x,y])=>[15-x,y];
const split=([x,y])=>[x<7?x-1:x>8?x+1:x,y];
const mapSides=(j,f)=>({left:Object.fromEntries(Object.entries(j.left).map(([k,v])=>[k,f(v)])),right:Object.fromEntries(Object.entries(j.right).map(([k,v])=>[k,f(v)]))});
const swap=j=>({left:j.right,right:j.left});

/** Landmarks for a published frame. phase null is the idle pose (phase 0 art). */
export function jointsFor(kind, facing, phase) {
  if(['front-right','back-right','back-left','front-left'].includes(facing))return diagonalJoints(kind,facing,phase);
  const source=kind==='large'?'adult':kind, p=phase??0;
  const row=f=>JOINTS[source][`${f}_${p}`];
  let j;
  if(facing==='front') j=row('front');
  else if(facing==='back') j=swap(row('front'));
  else if(facing==='right') j=row('right');
  else if(facing==='left') j=swap(mapSides(row('right'),mirror));
  else throw new Error(`Unknown facing ${facing}`);
  return kind==='large'?mapSides(j,split):structuredClone(j);
}
