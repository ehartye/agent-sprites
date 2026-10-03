import {test,expect} from 'vitest';
import {castTemplate} from '../examples/native-character/generate-cast.mjs';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';

// Pixel map of one named frame: later draws cover earlier ones, as in the rasteriser.
function frame(ops,alias){
  const cell=ops.find(o=>o.command==='name'&&o.as===alias).cell,px=new Map();
  for(const o of ops)if(o.command==='draw'&&o.cell===cell)px.set(o.x+','+o.y,o.color);
  return px;
}
const same=(a,b)=>a.size===b.size&&[...a].every(([k,v])=>b.get(k)===v);
// Arm region: the outer columns beside the torso, from the shoulders down past the hands.
function region(px,side,[y0,y1],dy=0){
  const out=new Map();
  for(const [k,v] of px){const [x,y]=k.split(',').map(Number);
    if((side==="L"?x<=3:x>=12)&&y-dy>=y0&&y-dy<=y1)out.set(`${side==='L'?x:15-x},${y-dy}`,v);}
  return out;
}
const bottom=(r)=>Math.max(...[...r.keys()].map(k=>+k.split(',')[1]));
const CASES=[['farmer','adult',[15,27]],['mara','adult',[15,27]],['nine','adult',[15,27]],['pip','child',[20,28]],['nori','child',[20,28]]];

for(const [id,kind,rows] of CASES)for(const facing of ['front','back'])test(`${id} ${facing}: contact poses alternate the arms against the legs and the bob`,()=>{
  const ops=castTemplate(id),f=n=>frame(ops,`${facing}_walk_${n}`);
  const L=n=>region(f(n),'L',rows),R=n=>region(f(n),'R',rows);
  // Passing poses keep both arms at the sides, mirror-symmetric in shape.
  const gear=id==='nine'; // Nine's specimen case hangs at the right hip and ends that arm region lower.
  if(!gear)expect(bottom(L(0))).toBe(bottom(R(0)));
  // Contact poses: one arm ends clearly lower than the other, and the sides swap on the opposite beat.
  for(const n of [1,3])expect(Math.abs(bottom(L(n))-bottom(R(n)))).toBeGreaterThanOrEqual(gear?1:2);
  if(!gear){expect(bottom(L(1))).toBe(bottom(R(3)));expect(bottom(R(1))).toBe(bottom(L(3)));}
  expect(bottom(L(1))).not.toBe(bottom(R(1)));expect(bottom(L(3))).not.toBe(bottom(R(3)));
  // The lower arm switches sides between the two contact poses.
  if(!gear)expect(Math.sign(bottom(L(1))-bottom(R(1)))).toBe(-Math.sign(bottom(L(3))-bottom(R(3))));
  // The two arm regions differ from each other, and the difference swaps across frames 1 and 3.
  const diff=n=>[...new Set([...L(n).keys(),...R(n).keys()])].filter(k=>L(n).get(k)!==R(n).get(k)).length;
  expect(diff(1)+diff(3)).toBeGreaterThan(diff(0));
  // Neither arm just rides the one-pixel body bob: compared with the passing pose moved down a row.
  for(const side of ['L','R'])for(const n of [1,3]){
    const moved=region(f(0),side,rows,1),now=side==='L'?L(n):R(n);
    expect(same(now,moved),`${id} ${facing} ${side} frame ${n} moves with the body`).toBe(false);
  }
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
