// Gaits and poses for creature frames. Everything here is plain arithmetic on
// a gait phase, so every frame of a cycle is derived, never hand-placed.

export const ANIMATIONS = ['idle', 'walk', 'attack', 'hurt', 'down'];
export const VIEWS = ['front', 'back', 'right', 'left'];
export const ATTACKS = ['bite', 'pincer', 'stinger', 'charge', 'peck', 'slam', 'sweep', 'blast'];
export const ATTACK_FRAMES = 4;
export const WALK_FRAMES = 4;

/** Phase in [0,1) of a leg for a walk frame. Samples sit mid-quarter so no frame lands on a gait boundary. */
export const legPhase = (frame, offset) => (((frame + 0.5) / WALK_FRAMES + offset) % 1 + 1) % 1;

/**
 * Foot displacement at a phase: stance drags the foot backward across the ground,
 * swing lifts it and carries it forward. `dx` is forward distance from the hip, `lift` px above ground.
 */
export function foot(phase, duty, stride, lift) {
  if (phase < duty) return { dx: stride * (0.5 - phase / duty), lift: 0, swing: false };
  const u = (phase - duty) / (1 - duty);
  return { dx: stride * (-0.5 + u), lift: lift * Math.sin(Math.PI * u), swing: true };
}

/** Phase offsets per gait. Each entry is a leg's offset within the cycle. */
export const GAITS = {
  // Lateral sequence walk: hind-far, fore-far, hind-near, fore-near, a quarter cycle apart.
  quadruped: { duty: 0.75, hindNear: 0.5, foreNear: 0.75, hindFar: 0, foreFar: 0.25 },
  // Tripod: front-near, rear-near and mid-far swing together while the other three plant.
  tripod: { duty: 0.5, near: [0.5, 0, 0.5], far: [0, 0.5, 0] },
  // Alternating tetrapod: four legs a side, diagonal sets alternate.
  tetrapod: { duty: 0.55, near: [0.5, 0, 0.5, 0], far: [0, 0.5, 0, 0.5] },
  biped: { duty: 0.5, near: 0, far: 0.5 },
};

/** Attack progress per frame: wind-up, strike, full extension (the hit), recover. */
export const ATTACK_EXTENT = [-0.7, 0.55, 1, 0.3];

export function posePlan({ anim, frame, size }) {
  const pose = { anim, frame, bob: 0, lunge: 0, head: 0, jaw: 0, tail: 0, sway: 0, ext: 0, twitch: 0, hurt: false, down: false, stepping: false };
  if (anim === 'idle') {
    // Frame 1 settles a pixel lower (a breath out); frame 3 of a four-frame idle twitches the tail and ears.
    pose.bob = frame === 1 ? 1 : 0; pose.head = frame === 1 ? 1 : 0;
    pose.twitch = frame === 3 ? 1 : 0; pose.sway = frame === 3 ? 1 : frame === 1 ? -1 : 0;
  } else if (anim === 'walk') {
    pose.stepping = true; pose.bob = frame % 2 === 1 ? -1 : 0; pose.head = frame % 2 === 1 ? 0 : 1;
    pose.sway = [1, 0, -1, 0][frame];
  } else if (anim === 'attack') {
    pose.ext = ATTACK_EXTENT[frame]; pose.lunge = Math.max(0, pose.ext);
    pose.jaw = [0.5, 0.9, 0.2, 0][frame]; pose.sway = frame;
    pose.bob = [-1, 0, 1, 0][frame];
  } else if (anim === 'hurt') { pose.hurt = true; pose.bob = 1; pose.head = -1; pose.lunge = -1; }
  else if (anim === 'down') { pose.down = true; }
  return pose;
}

/** Visible leg lift in whole pixels so contact reads at any size. */
export const liftFor = h => Math.max(1, Math.round(h * 0.09));
