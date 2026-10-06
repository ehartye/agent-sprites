import {test,expect} from 'vitest';
import {generateCreatureRecipe,parseSize} from '../../server/authoring/creature.js';
import {PLANS} from '../../server/authoring/creature-plans.js';
import {RAMPS} from '../../server/authoring/creature-palettes.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';

const renderer=new CanvasRenderer(new Palette());
function render(recipe,frame){
  const {width:w,height:h}=recipe.report.cellSize,cell=new Cell({w,h});
  for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
    const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
  }
  return renderer.renderCellRaw(cell);
}
const opaque=data=>{let n=0;for(let i=3;i<data.length;i+=4)n+=data[i]>0;return n;};
const base=plan=>({name:'t',plan,size:'small'});

test('every plan expands deterministically to named rect operations with the full animation set',()=>{
  for(const plan of Object.keys(PLANS)){
    const a=generateCreatureRecipe({...base(plan),size:'medium'}),b=generateCreatureRecipe({...base(plan),size:'medium'});
    expect(a).toEqual(b);
    expect(a.operations[0]).toMatchObject({command:'new',name:'t',size:'32x24'});
    expect(a.operations.filter(o=>o.command==='draw').every(o=>o.type==='rect'&&typeof o.name==='string'&&/^#[0-9a-f]{6}$/i.test(o.color))).toBe(true);
    const tags=a.operations.filter(o=>o.command==='group').map(o=>o.name);
    for(const dir of ['front','back','right','left'])for(const anim of ['idle','walk','attack','hurt'])expect(tags).toContain(`${anim}_${dir}`);
    expect(tags).toContain('down');
    expect(a.operations.filter(o=>o.command==='group'&&o.name==='walk_right')[0].cells).toHaveLength(4);
    expect(a.operations.filter(o=>o.command==='group'&&o.name==='attack_right')[0].cells.length).toBeGreaterThanOrEqual(3);
    expect(a.operations.at(-1)).toEqual({command:'pivot',x:16,y:24});
    expect(a.report).toMatchObject({kind:'creature',plan,cellSize:{width:32,height:24},ground:24,groundAnchor:{x:16,y:24}});
  }
},30000);

test('frames stay inside the cell, stand on the ground line and use only palette ramp colours with hard alpha',()=>{
  const allowed=new Set(Object.values(RAMPS).flat().map(c=>c.toLowerCase()));
  for(const plan of Object.keys(PLANS)){
    const r=generateCreatureRecipe({...base(plan),size:'medium',palette:'dust'});
    for(const f of r.report.frames){
      expect(f.bounds.left).toBeGreaterThanOrEqual(0);expect(f.bounds.right).toBeLessThan(32);expect(f.bounds.top).toBeGreaterThanOrEqual(0);
      expect(f.checks,`${plan} ${f.alias}`).toEqual([]);
      const data=render(r,f);expect(opaque(data)).toBeGreaterThan(10);
      for(let i=3;i<data.length;i+=4)expect(data[i]===0||data[i]===255).toBe(true);
    }
    for(const op of r.operations.filter(o=>o.command==='draw'))expect(allowed.has(op.color.toLowerCase()),`${plan} ${op.color}`).toBe(true);
  }
},30000);

test('left views are exact mirrors of right views, and the ground anchor is centred under the standing pose',()=>{
  const r=generateCreatureRecipe({...base('quadruped'),size:'medium'});
  const by=a=>r.report.frames.find(f=>f.alias===a);
  for(const a of ['idle_%_0','walk_%_2','attack_%_1','hurt_%_0']){
    const right=render(r,by(a.replace('%','right'))),left=render(r,by(a.replace('%','left')));
    for(let y=0;y<24;y++)for(let x=0;x<32;x++)expect(Array.from(left.slice((y*32+x)*4,(y*32+x)*4+4))).toEqual(Array.from(right.slice((y*32+31-x)*4,(y*32+31-x)*4+4)));
  }
  const b=by('idle_right_0').bounds;expect(Math.abs((b.left+b.right+1)/2-16)).toBeLessThanOrEqual(1);
});

test('walk frames differ, loop through four phases, and publish locomotion for the playback runtime',()=>{
  for(const plan of Object.keys(PLANS)){
    const r=generateCreatureRecipe({...base(plan),size:'medium'});
    const walk=r.report.frames.filter(f=>f.alias.startsWith('walk_right_'));
    expect(walk).toHaveLength(4);
    const shots=new Set(walk.map(f=>Buffer.from(render(r,f)).toString('base64')));
    expect(shots.size,`${plan} walk distinct frames`).toBeGreaterThanOrEqual(3);
    expect(walk[0].locomotion).toMatchObject({direction:[1,0],frameCount:4,rootCompensation:'none'});
    expect(r.report.directions).toEqual({down:'front',up:'back',left:'left',right:'right'});
  }
},30000);

test('legged gaits keep contact with the ground in every walk frame',()=>{
  for(const plan of ['quadruped','insect','arachnid','bird']){
    const r=generateCreatureRecipe({...base(plan),size:'medium'});
    for(const f of r.report.frames.filter(f=>f.alias.startsWith('walk_right_'))){
      const data=render(r,f),row=22;let n=0;for(let x=0;x<32;x++)n+=data[(row*32+x)*4+3]>0;
      expect(n,`${plan} ${f.alias} contacts`).toBeGreaterThanOrEqual(2);
    }
  }
});

test('sizes, proportions, palettes and features are validated with helpful errors',()=>{
  expect(parseSize('small')).toEqual([16,16]);expect(parseSize('large')).toEqual([48,32]);expect(parseSize('20x18')).toEqual([20,18]);
  expect(()=>parseSize('huge')).toThrow(/small, medium, large or WxH/);
  const make=extra=>generateCreatureRecipe({...base('quadruped'),...extra});
  expect(()=>make({plan:'dragon'})).toThrow(/Unsupported creature plan/);
  expect(()=>make({proportions:{legLength:9}})).toThrow(/between 0.4 and 2.5/);
  expect(()=>make({proportions:{wings:1}})).toThrow(/Unknown proportion/);
  expect(()=>make({palette:'neon'})).toThrow(/Unknown palette preset/);
  expect(()=>make({palette:{body:'#fff'}})).toThrow(/Palette role body/);
  expect(()=>make({features:['stinger']})).toThrow(/not available on the quadruped plan/);
  expect(()=>make({features:['horns','horns']})).toThrow(/Duplicate/);
  expect(()=>make({features:['teleport']})).toThrow(/Unknown creature feature/);
  expect(()=>make({views:['up']})).toThrow(/views/);
  expect(()=>make({attack:'pincer'})).toThrow(/attack must be/);
  expect(()=>make({colour:'red'})).toThrow(/Unknown creature field/);
  expect(()=>make({head:'dragon'})).toThrow(/Unsupported head/);
});

test('views, animations, left mirroring and two attacks choose exactly the frames and tags emitted',()=>{
  const r=generateCreatureRecipe({...base('arachnid'),size:'40x28',views:['right'],left:false,animations:['walk','attack'],attack:['stinger','pincer'],features:['stinger','pincers']});
  const tags=r.operations.filter(o=>o.command==='group').map(o=>o.name);
  expect(tags.sort()).toEqual(['attack2_right','attack_right','walk_right']);
  expect(r.report.attacks).toEqual(['stinger','pincer']);
  const l=generateCreatureRecipe({...base('bird'),views:['right'],animations:['idle'],idleFrames:4});
  expect(l.operations.filter(o=>o.command==='group').map(o=>o.name).sort()).toEqual(['idle_left','idle_right']);
  expect(l.report.animations.idle_right.frames).toBe(4);
});

test('features change pixels, and mutant variants of the same plan differ from the base',()=>{
  const hash=cfg=>{const r=generateCreatureRecipe(cfg);return Buffer.from(render(r,r.report.frames.find(f=>f.alias==='idle_right_0'))).toString('base64');};
  const q={...base('quadruped'),size:'medium'};
  const seen=new Set([hash(q)]);
  const features=['horns','tusks','fur','spikes','glow_eyes','wool','saddle','pack','hump','shell','extra_eyes','extra_limbs','second_head','beard','glow_patch'];
  for(const f of features)seen.add(hash({...q,features:[f]}));
  expect(seen.size).toBe(features.length+1);
  const s={...base('arachnid'),size:'40x28'};
  expect(hash({...s,features:['stinger','pincers']})).not.toBe(hash({...s,features:['stinger','pincers','glow_patch','extra_eyes','extra_limbs'],palette:'toxic'}));
},30000);

test('footprint rectangles sit on the ground line inside the cell for every direction',()=>{
  const r=generateCreatureRecipe({...base('quadruped'),size:'large'});
  for(const [dir,fp] of Object.entries(r.report.footprints)){
    expect(fp.y+fp.h,dir).toBe(32);expect(fp.x).toBeGreaterThanOrEqual(0);expect(fp.x+fp.w).toBeLessThanOrEqual(48);
  }
  expect(r.report.footprint).toEqual(r.report.footprints.right);
});

test('the shared playback runtime walks a creature from its report alone',async()=>{
  const {createWalker,groundAnchor}=await import('../../server/build/playback-runtime.mjs');
  const r=generateCreatureRecipe({...base('quadruped'),size:'medium'});
  const walker=createWalker(r.report,{mode:'continuous-root',scale:1});
  expect(walker.update(0,0).alias).toBe('idle_front_0');
  const first=walker.update(1,0);
  expect(first.alias).toBe('walk_right_0');
  const seen=new Set();for(let i=0;i<40;i++)seen.add(walker.update(1,0).alias);
  expect([...seen].sort()).toEqual(['walk_right_0','walk_right_1','walk_right_2','walk_right_3']);
  expect(walker.update(-1,0).alias).toMatch(/^walk_left_/);
  expect(groundAnchor(r.report,r.report.frames[0])).toEqual({x:16,y:24});
});

test('every plan fits every preset size with and without all its features (bodies shrink to fit, legs reach the ground)',()=>{
  for(const plan of Object.keys(PLANS))for(const size of ['small','medium','large','40x28'])for(const features of [[],PLANS[plan].features.filter(f=>f!=='tail')]){
    const r=generateCreatureRecipe({name:'t',plan,size,features});
    for(const f of r.report.frames)expect(f.checks,`${plan} ${size} ${features.length} ${f.alias}`).toEqual([]);
  }
},60000);

test('sizes below 16x16 are rejected',()=>{
  expect(()=>parseSize('12x12')).toThrow(/between 16x16 and 160x128/);
});
