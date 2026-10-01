import {test,expect} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';

const renderer=new CanvasRenderer(new Palette());
const MODULES={capsule:'cottage',vault:'barn',gantry:'workshop',dome:'kitchen'};
const ALL=['cottage','workshop','kitchen','barn',...Object.keys(MODULES)];
const W=320,H=256;

function render(recipe,alias){
  const frame=recipe.report.frames.find(f=>f.alias===alias),cell=new Cell({w:W,h:H});
  for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
    const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
  }
  return renderer.renderCellRaw(cell);
}
const px=(data,x,y)=>Array.from(data.slice((y*W+x)*4,(y*W+x)*4+4));
const recipes=Object.fromEntries(ALL.map(style=>[style,generateEnvironmentRecipe({kind:'habitat',style})]));
const roofs=Object.fromEntries(ALL.map(style=>[style,render(recipes[style],'habitat_roof')]));
const alpha=data=>{const out=new Uint8Array(W*H);for(let i=0;i<W*H;i++)out[i]=data[i*4+3]?1:0;return out;};
const overlap=(a,b)=>{let i=0,u=0;for(let k=0;k<W*H;k++){i+=a[k]&b[k];u+=a[k]|b[k];}return i/u;};
const colorsOf=data=>{const set=new Set();for(let i=0;i<W*H;i++)if(data[i*4+3])set.add(data.slice(i*4,i*4+3).join(','));return set;};

test.each(Object.entries(MODULES))('%s keeps its base style rooms, layout and doorway geometry',(style,base)=>{
  const module=recipes[style],original=recipes[base];
  expect(module.report.style).toBe(style);
  expect(module.report.layout).toEqual(original.report.layout);
  expect(module.report.cellSize).toEqual({width:W,height:H});
  for(const alias of ['habitat_floor','habitat_back','habitat_front']){
    expect(render(module,alias)).toEqual(render(original,alias));
  }
  expect(generateEnvironmentRecipe({kind:'habitat',style})).toEqual(module);
});

test.each(Object.keys(MODULES))('%s exterior is hard-edged, closes the wall and leaves an exact door recess',style=>{
  const data=roofs[style];
  expect(data.every((value,i)=>i%4!==3||value===0||value===255)).toBe(true);
  let open=0;for(let y=160;y<220;y++)for(let x=24;x<296;x++)open+=Number(px(data,x,y)[3]!==255);
  expect(open).toBe(0);
  const dark=px(data,160,200);
  for(let y=184;y<219;y++)for(let x=140;x<181;x++)expect(px(data,x,y)).toEqual(dark);
  for(let y=220;y<256;y++)for(let x=136;x<184;x++)expect(px(data,x,y)[3]).toBe(0);
});

test('module exteriors have distinct silhouettes and use only the shipped kit colors',()=>{
  const names=Object.keys(MODULES),shapes=names.map(n=>alpha(roofs[n]));
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)expect(overlap(shapes[i],shapes[j]),`${names[i]} vs ${names[j]}`).toBeLessThan(0.88);
  expect(new Set(ALL.map(style=>Buffer.from(alpha(roofs[style])).toString('base64'))).size).toBe(ALL.length);
  const kit=new Set();
  for(const base of Object.values(MODULES))for(const color of colorsOf(roofs[base]))kit.add(color);
  for(const style of names)for(const color of colorsOf(roofs[style]))expect(kit.has(color),`${style} uses ${color}`).toBe(true);
});

test.each(Object.keys(MODULES))('%s carries the shared hull trim',style=>{
  const names=recipes[style].operations.filter(o=>o.command==='draw'&&o.cell===recipes[style].report.frames.find(f=>f.alias==='habitat_roof').cell).map(o=>o.name);
  expect(names.some(n=>n.startsWith('hazard_left_'))&&names.some(n=>n.startsWith('hazard_right_'))).toBe(true);
  // The dome's riveted docking ring is its pressure seam.
  expect(names.some(n=>n.includes('seam')||n.includes('dome_ring'))).toBe(true);
  expect(names.some(n=>n.includes('rivet'))).toBe(true);
});

test.each(Object.keys(MODULES))('%s exterior has no stray single pixels',style=>{
  const data=roofs[style],seen=new Uint8Array(W*H);let singles=0;
  const same=(a,b)=>a.every((v,i)=>v===b[i]);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const here=px(data,x,y);if(!here[3]||seen[y*W+x])continue;
    const queue=[[x,y]];seen[y*W+x]=1;let size=0;
    while(queue.length){
      const [cx,cy]=queue.pop();size++;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=cx+dx,ny=cy+dy;
        if((dx||dy)&&nx>=0&&ny>=0&&nx<W&&ny<H&&!seen[ny*W+nx]&&same(px(data,nx,ny),here)){seen[ny*W+nx]=1;queue.push([nx,ny]);}
      }
    }
    if(size===1)singles++;
  }
  expect(singles).toBeLessThanOrEqual(12);
});

test('existing style exteriors are unchanged by the module registry',()=>{
  for(const style of ['cottage','workshop','kitchen','barn']){
    const recipe=generateEnvironmentRecipe({kind:'habitat',style});
    expect(recipe.report.style).toBe(style);
    expect(recipe.operations.filter(o=>o.command==='draw').every(o=>!/^(hazard_|capsule_|vault_|gantry_|dome_)/.test(o.name))).toBe(true);
  }
});
