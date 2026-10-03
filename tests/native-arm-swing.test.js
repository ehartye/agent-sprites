import {test,expect} from 'vitest';
import {castTemplate} from '../examples/native-character/generate-cast.mjs';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';

// Stardew-style walk: on a contact pose the forward-swinging arm is foreshortened (its
// hand tucks against the hip), the trailing arm stays full length, and the sides swap
// on the opposite contact. Passing poses keep both arms at the sides.
// Pixel map of one named frame: later draws cover earlier ones, as in the rasteriser.
function frame(ops,alias){
  const cell=ops.find(o=>o.command==='name'&&o.as===alias).cell,px=new Map();
  for(const o of ops)if(o.command==='draw'&&o.cell===cell)px.set(o.x+','+o.y,o.color);
  return px;
}
// Arm region: the outer columns beside the torso, from the shoulders down past the hands.
function arm(px,side,[y0,y1]){
  let count=0,bottom=-1;
  for(const k of px.keys()){const [x,y]=k.split(',').map(Number);
    if(y<y0||y>y1||(side==='L'?x>3:x<12))continue;
    count++;bottom=Math.max(bottom,y);}
  return {count,bottom};
}
const CASES=[['farmer','adult',[15,27]],['mara','adult',[15,27]],['nine','adult',[15,27]],['pip','child',[20,28]],['nori','child',[20,28]]];

for(const [id,kind,rows] of CASES)for(const facing of ['front','back'])test(`${id} ${facing}: the forward arm foreshortens and the sides alternate`,()=>{
  const ops=castTemplate(id),f=n=>frame(ops,`${facing}_walk_${n}`);
  const L=n=>arm(f(n),'L',rows),R=n=>arm(f(n),'R',rows);
  const gear=id==='nine'; // Nine's specimen case hangs at the right hip and adds arm-column pixels there.
  const min=gear?2:kind==='adult'?5:4;
  // Passing poses: both arms at the sides, same size and length.
  for(const n of [0,2]){expect(L(n).count).toBe(R(n).count);expect(L(n).bottom).toBe(R(n).bottom);}
  // Contact poses: one arm has clearly fewer pixels than the other.
  for(const n of [1,3])expect(Math.abs(L(n).count-R(n).count),`${id} ${facing} frame ${n}`).toBeGreaterThanOrEqual(min);
  // The short arm also ends higher, hand tucked at the hip (not for Nine, whose case hides the right hand).
  if(!gear)for(const n of [1,3]){
    const [short,long]=L(n).count<R(n).count?[L(n),R(n)]:[R(n),L(n)];
    expect(long.bottom-short.bottom,`${id} ${facing} frame ${n}`).toBeGreaterThanOrEqual(kind==='adult'?3:2);
  }
  // The short side switches between the two contact poses.
  expect(Math.sign(L(1).count-R(1).count)).toBe(-Math.sign(L(3).count-R(3).count));
  expect(L(1).count).toBeLessThan(R(1).count);
  expect(R(3).count).toBeLessThan(L(3).count);
  // Both contact poses keep the trailing arm at least as large as the idle arm (it rides the body bob).
  if(!gear){expect(R(1).count).toBeGreaterThanOrEqual(R(0).count);expect(L(3).count).toBeGreaterThanOrEqual(L(0).count);}
});

test('swing leaves the bare mannequin silhouette whole: one component per front and back walk frame',()=>{
  for(const kind of ['adult','child']){
    const ops=nativeMannequin(kind);
    for(const facing of ['front','back'])for(const n of [0,1,2,3]){
      const px=frame(ops,`${facing}_walk_${n}`),seen=new Set(),keys=[...px.keys()];
      const stack=[keys[0]];seen.add(keys[0]);
      while(stack.length){const [x,y]=stack.pop().split(',').map(Number);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const k=`${x+dx},${y+dy}`;if(px.has(k)&&!seen.has(k)){seen.add(k);stack.push(k);}}}
      expect(seen.size,`${kind} ${facing}_walk_${n}`).toBe(px.size);
    }
  }
});

test('contact poses lift the foot on the short-arm side (same side as the forward arm) and keep the other planted',()=>{
  for(const kind of ['adult','child']){
    const ops=nativeMannequin(kind);
    for(const facing of ['front','back'])for(const [n,liftedSide] of [[1,'L'],[3,'R']]){
      const px=frame(ops,`${facing}_walk_${n}`),low=side=>Math.max(...[...px.keys()].map(k=>k.split(',').map(Number)).filter(([x])=>side==='L'?x<8:x>=8).map(([,y])=>y));
      const other=liftedSide==='L'?'R':'L';
      expect(low(other)-low(liftedSide),`${kind} ${facing} ${n}`).toBe(1);
    }
  }
});
