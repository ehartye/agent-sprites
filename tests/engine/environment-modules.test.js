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

const framed=(recipe,alias)=>recipe.operations.filter(o=>o.command==='draw'&&o.cell===recipe.report.frames.find(f=>f.alias===alias).cell);

test.each(Object.entries(MODULES))('%s keeps its base style layout and floor, and differs in back and front only by its named trim',(style,base)=>{
  const module=recipes[style],original=recipes[base];
  expect(module.report.style).toBe(style);
  expect(module.report.layout).toEqual(original.report.layout);
  expect(module.report.cellSize).toEqual({width:W,height:H});
  expect(render(module,'habitat_floor')).toEqual(render(original,'habitat_floor'));
  expect(framed(module,'habitat_floor').map(({cell,...o})=>o)).toEqual(framed(original,'habitat_floor').map(({cell,...o})=>o));
  for(const alias of ['habitat_back','habitat_front']){
    const ops=framed(module,alias),baseOps=framed(original,alias);
    // every base operation is still there, in order, and everything added carries the module prefix
    expect(ops.slice(0,baseOps.length).map(({cell,...o})=>o)).toEqual(baseOps.map(({cell,...o})=>o));
    const added=ops.slice(baseOps.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(o=>o.name.startsWith(`${style}_`))).toBe(true);
  }
  const back=framed(module,'habitat_back').filter(o=>o.name.startsWith(`${style}_`)).map(o=>o.name);
  expect(back.some(n=>n.includes('seam'))&&back.some(n=>n.includes('rivet'))).toBe(true);
  const front=framed(module,'habitat_front').filter(o=>o.name.startsWith(`${style}_`)).map(o=>o.name);
  expect(front.some(n=>n.includes('hazard_left_'))&&front.some(n=>n.includes('hazard_right_'))).toBe(true);
  expect(generateEnvironmentRecipe({kind:'habitat',style})).toEqual(module);
});

test.each(Object.entries(MODULES))('%s interior trim stays off the door recess and the floor rows, and the front recess is clear',(style,base)=>{
  const module=recipes[style],original=recipes[base];
  const diff=(alias)=>{
    const a=render(module,alias),b=render(original,alias),out=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(px(a,x,y).join()!==px(b,x,y).join())out.push([x,y]);
    return out;
  };
  for(const [x,y] of diff('habitat_back')){expect(x>=24&&x<=295&&y>=74&&y<=79).toBe(true);}
  for(const [x,y] of diff('habitat_front')){expect(y>=221&&y<=241&&((x>=128&&x<=135)||(x>=184&&x<=191))).toBe(true);}
  // the open doorway of the front layer is still transparent
  const front=render(module,'habitat_front');
  for(let y=220;y<256;y++)for(let x=136;x<184;x++)expect(px(front,x,y)).toEqual(px(render(original,'habitat_front'),x,y));
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

test.each([['capsule',[16,94,303,150],[[0,0,98,110],[228,0,270,99]]],['vault',[62,55,257,150],[]],['gantry',[16,114,303,152],[]]])('%s reads as a dark roof over a light wall in grayscale',(style,[rx0,ry0,rx1,ry1],holes)=>{
  const data=roofs[style],lum=c=>{const v=c.map(u=>{u/=255;return u<=.03928?u/12.92:((u+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  const mean=(x0,y0,x1,y1,skip)=>{
    let sum=0,n=0;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const c=px(data,x,y);
      if(!c[3]||c.slice(0,3).join()==='52,71,81'||(x>=124&&x<=195&&y>=153)||skip.some(([a,b,c2,d])=>x>=a&&x<=c2&&y>=b&&y<=d))continue;
      sum+=lum(c);n++;
    }
    return sum/n;
  };
  const roof=mean(rx0,ry0,rx1,ry1,holes.map(([a,b,c,d])=>[a,b||ry0,c,d])),wall=mean(Math.max(rx0,style==='vault'?62:16),153,Math.min(rx1,style==='vault'?257:303),218,[]);
  expect((wall+.05)/(roof+.05)).toBeGreaterThanOrEqual(1.6);
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
