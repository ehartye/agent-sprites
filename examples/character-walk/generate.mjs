import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const defaults = {
  outline: '#1d2b53', pants: '#526c83', farPants: '#34445e',
  jacket: '#008e91', jacketLight: '#35c4bc', jacketShade: '#00646c',
  skin: '#ffccaa', farSkin: '#c78c78', hair: '#493640',
  scarf: '#ffcc55', pack: '#b57045', packLight: '#dc9e63', sole: '#172638',
};

/** Eight walking poses, right side nearest camera, always facing screen-right. */
export function generateWalk({ name = 'courier', stride = 4, bob = 1, fps = 8, colors = {} } = {}) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) throw new Error('name must be a filename-safe project name.');
  if (!Number.isInteger(stride) || stride < 2 || stride > 5) throw new Error('stride must be an integer from 2 to 5 pixels.');
  if (![0, 1].includes(bob)) throw new Error('bob must be 0 or 1 pixel.');
  if (!Number.isFinite(fps) || fps < 4 || fps > 12) throw new Error('fps must be between 4 and 12.');
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) throw new Error('colors must be a color map.');
  for (const [key, value] of Object.entries(colors)) {
    if (!Object.hasOwn(defaults, key) || typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Unknown color or invalid six-digit hex: ${key}`);
  }
  const c = { ...defaults, ...colors };
  const ops = [{ command: 'new', name, size: '24x32', rows: 1, cols: 8, palette: 'pico8' }];
  const cx = 11, ground = 29;
  const half = Math.round(stride / 2);
  // From right heel strike to the next right heel strike. Knee and ankle are
  // relative to the pivot; each boot profile is relative to its ankle.
  const legs = [
    {knee: [half + 1, -5], ankle: [stride, -2], boot: 'heel'},
    {knee: [half + 1, -4], ankle: [half, -2], boot: 'flat'},
    {knee: [1, -5], ankle: [0, -2], boot: 'flat'},
    {knee: [0, -5], ankle: [-half, -3], boot: 'roll'},
    {knee: [-1, -5], ankle: [-stride, -3], boot: 'roll'},
    {knee: [0, -5], ankle: [-stride - 1, -4], boot: 'lift'},
    {knee: [half + 1, -6], ankle: [-3, -5], boot: 'lift'},
    {knee: [half + 2, -6], ankle: [half, -4], boot: 'heel'},
  ];
  const boots = {
    heel: [[-1,-1],[1,-1],[2,0],[3,0],[3,1],[0,2],[-1,2]],
    flat: [[-1,-1],[1,-1],[1,0],[3,1],[3,2],[-1,2]],
    roll: [[-1,-1],[1,-1],[1,0],[3,2],[3,3],[2,3],[-1,1]],
    lift: [[-1,-1],[1,-1],[1,0],[2,2],[1,2],[-1,1]],
  };
  // Keep the original contact/support aliases and physical cells. The four
  // added cells supply the loading and heel-rise poses between them.
  const poses = [
    {name:'right_contact',cell:0,rightHand:[cx-4,19],leftHand:[cx+4,18],lift:0},
    {name:'right_load',cell:4,rightHand:[cx-2,20],leftHand:[cx+3,19],lift:0},
    {name:'right_support',cell:1,rightHand:[cx,21],leftHand:[cx+1,19],lift:bob},
    {name:'right_push',cell:5,rightHand:[cx+3,20],leftHand:[cx-2,18],lift:bob},
    {name:'left_contact',cell:2,rightHand:[cx+4,19],leftHand:[cx-4,18],lift:0},
    {name:'left_load',cell:6,rightHand:[cx+3,20],leftHand:[cx-2,20],lift:0},
    {name:'left_support',cell:3,rightHand:[cx+1,19],leftHand:[cx,21],lift:bob},
    {name:'left_push',cell:7,rightHand:[cx-2,19],leftHand:[cx+3,20],lift:bob},
  ];
  const beatMs = Math.round(1000 / fps);
  const firstHalfMs = Math.floor(beatMs / 2);
  for (const [index, pose] of poses.entries()) {
    const cell = `0,${pose.cell}`, dy = -pose.lift;
    const rect = (name, x, y, w, h, color) => ops.push({ command: 'draw', type: 'rect', cell, name, x, y, w, h, color, filled: true });
    const polygon = (name, points, color) => ops.push({ command: 'draw', type: 'polygon', cell, name, points, color, filled: true });
    const leg = (side, near) => {
      const phase = legs[(index + (near ? 0 : 4)) % legs.length];
      const hipX = near ? 12 : 10, hipY = 20 + dy;
      const kneeX = cx + phase.knee[0], kneeY = ground + phase.knee[1];
      const ankleX = cx + phase.ankle[0], ankleY = ground + phase.ankle[1];
      const color = near ? c.pants : c.farPants;
      polygon(`${side}_thigh`, [[hipX-2,hipY],[hipX+1,hipY],[kneeX+1,kneeY],[kneeX,kneeY+1],[kneeX-1,kneeY]], color);
      polygon(`${side}_shin`, [[kneeX-1,kneeY],[kneeX+1,kneeY],[ankleX,ankleY+1],[ankleX-1,ankleY]], color);
      polygon(`${side}_boot`, boots[phase.boot].map(([x,y]) => [ankleX+x,ankleY+y]), near ? c.sole : c.outline);
      rect(`${side}_boot_top`, ankleX-1,ankleY-1,2,1,color);
    };
    const arm = (side, near) => {
      const [handX, handY] = pose[`${side}Hand`], shoulderX=near?12:10, shoulderY=15+dy;
      const elbowX=Math.round((shoulderX+handX)/2), elbowY=18+dy;
      const sleeve=near?c.jacket:c.jacketShade;
      polygon(`${side}_upper_arm`,[[shoulderX-1,shoulderY],[shoulderX+1,shoulderY],[elbowX+1,elbowY],[elbowX-1,elbowY]],sleeve);
      polygon(`${side}_forearm`,[[elbowX-1,elbowY],[elbowX+1,elbowY],[handX+1,handY+dy],[handX-1,handY+dy]],sleeve);
      rect(`${side}_hand`,handX-1,handY+dy,3,2,near?c.skin:c.farSkin);
      if (near) rect('right_wrist_band',handX-1,handY-1+dy,3,1,c.scarf);
    };
    // Painter's order: far limbs, pack, near leg, torso/head, then near arm.
    leg('left',false); arm('left',false);
    rect('backpack_outline',5,14+dy,5,8,c.outline);
    rect('backpack',5,15+dy,4,6,c.pack);
    rect('backpack_seam',5,15+dy,1,5,c.packLight);
    leg('right',true);
    polygon('jacket_outline',[[9,13+dy],[14,13+dy],[16,21+dy],[8,21+dy]],c.outline);
    polygon('jacket',[[10,14+dy],[13,14+dy],[14,20+dy],[9,20+dy]],c.jacket);
    rect('jacket_light',12,15+dy,1,5,c.jacketLight);
    rect('neck',12,11+dy,3,3,c.farSkin);
    rect('head_outline',10,6+dy,7,7,c.outline);
    rect('face',12,7+dy,5,5,c.skin);
    rect('nose',17,9+dy,1,2,c.skin);
    rect('hair',10,7+dy,3,5,c.hair);
    rect('ear',12,9+dy,1,2,c.skin);
    rect('eye',15,8+dy,1,1,c.outline);
    rect('cap',10,5+dy,6,2,c.jacketShade);
    rect('cap_highlight',11,5+dy,4,1,c.jacketLight);
    rect('cap_brim',13,7+dy,5,1,c.outline);
    rect('scarf',10,12+dy,5,2,c.scarf);
    rect('scarf_tail',8,13+dy,2,3,c.scarf);
    arm('right',true);
    ops.push({ command:'name', cell, as:pose.name });
    ops.push({ command:'duration', cell, ms:index % 2 ? beatMs - firstHalfMs : firstHalfMs });
    for(const side of ['left','right']) ops.push({ command:'shape-group',sub:'create',cell,name:`${side}_limbs`,shapes:[`${side}_thigh`,`${side}_shin`,`${side}_boot`,`${side}_boot_top`,`${side}_upper_arm`,`${side}_forearm`,`${side}_hand`,...(side==='right'?['right_wrist_band']:[])] });
  }
  ops.push({command:'group',sub:'create',name:'walk',cells:poses.map(pose => `0,${pose.cell}`),fps:fps*2});
  ops.push({command:'pivot',x:11,y:29});
  return ops;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : {};
  process.stdout.write(JSON.stringify(generateWalk(config), null, 2) + '\n');
}
