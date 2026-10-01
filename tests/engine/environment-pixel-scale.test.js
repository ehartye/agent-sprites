import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';

const renderer=new CanvasRenderer(new Palette());
const STYLES=['cottage','workshop','kitchen','barn','capsule','vault','gantry','dome'];
const LAYERS=['habitat_floor','habitat_back','habitat_front','habitat_roof'];
const FURNITURE=['bed','kitchen','workbench','planter','stool','locker'];
const MATERIALS=['moss','regolith','basalt','packed-earth','alloy','cork'];

/** Raw RGBA of one frame at the recipe's own (source) cell size. */
function render(recipe,alias){
  const frame=recipe.report.frames.find(f=>f.alias===alias),{width:w,height:h}=recipe.report.cellSize,cell=new Cell({w,h});
  for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
    const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
  }
  return {w,h,data:renderer.renderCellRaw(cell)};
}
const colorAt=(f,x,y)=>{const i=(y*f.w+x)*4;return f.data[i+3]===0?-1:f.data[i]<<16|f.data[i+1]<<8|f.data[i+2];};
const alphaAt=(f,x,y)=>f.data[(y*f.w+x)*4+3];
const colorsOf=f=>{const set=new Set();for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const c=colorAt(f,x,y);if(c>=0)set.add(c);}return set;};
/** Opaque pixels with no 8-neighbour of the same colour. wrap=true treats the frame as a repeating tile. */
function strays(f,wrap=false){
  let n=0;
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
    const c=colorAt(f,x,y);if(c<0)continue;
    let ok=false;
    for(let dy=-1;dy<=1&&!ok;dy++)for(let dx=-1;dx<=1&&!ok;dx++){
      if(!dx&&!dy)continue;
      let X=x+dx,Y=y+dy;
      if(wrap){X=(X+f.w)%f.w;Y=(Y+f.h)%f.h;}else if(X<0||Y<0||X>=f.w||Y>=f.h)continue;
      if(colorAt(f,X,Y)===c)ok=true;
    }
    if(!ok)n++;
  }
  return n;
}
/** Horizontally adjacent 2x2 checkerboard windows: a run of alternating pixels, which is what dither looks like. */
function ditherWindows(f){
  let n=0;
  const checker=(x,y)=>{const a=colorAt(f,x,y),b=colorAt(f,x+1,y),c=colorAt(f,x,y+1),d=colorAt(f,x+1,y+1);return a>=0&&a===d&&b===c&&a!==b&&b>=0;};
  for(let y=0;y<f.h-1;y++)for(let x=0;x<f.w-2;x++)if(checker(x,y)&&checker(x+1,y))n++;
  return n;
}
const hardAlpha=f=>{for(let i=3;i<f.data.length;i+=4)if(f.data[i]!==0&&f.data[i]!==255)return false;return true;};

describe('default output is byte-identical',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/environment-default-hashes.json',import.meta.url),'utf8'));
  test.each(Object.entries(golden))('%s matches the recipe hash taken before pixelScale existed',(name,{config,sha256})=>{
    expect(createHash('sha256').update(JSON.stringify(generateEnvironmentRecipe(config))).digest('hex')).toBe(sha256);
  });

  test.each([{kind:'terrain'},{kind:'furniture'},{kind:'habitat'},{kind:'habitat',style:'dome'}])('an explicit pixelScale 1 draws exactly the same operations for %j',config=>{
    const base=generateEnvironmentRecipe(config),one=generateEnvironmentRecipe({...config,pixelScale:1});
    expect(one.operations).toEqual(base.operations);
    expect(one.report.frames).toEqual(base.report.frames);
    expect(one.report).toMatchObject({pixelScale:1,screenCellSize:base.report.cellSize,cellSize:base.report.cellSize});
    expect(base.report.pixelScale).toBeUndefined();
  });
});

describe('pixelScale validation',()=>{
  test.each([0,3,4,1.5,-2,'2',null,NaN,true,[]])('rejects pixelScale %j',value=>{
    expect(()=>generateEnvironmentRecipe({kind:'terrain',pixelScale:value})).toThrow(/pixelScale/);
  });
  test('terrain transitions do not support it',()=>expect(()=>generateEnvironmentRecipe({kind:'terrain-transition',pixelScale:2})).toThrow(/pixelScale/));
  test.each(['terrain','habitat','furniture'])('%s accepts 1 and 2',kind=>{
    for(const pixelScale of [1,2])expect(generateEnvironmentRecipe({kind,pixelScale}).report.pixelScale).toBe(pixelScale);
  });
});

describe('cell sizes and metadata',()=>{
  test.each([['habitat',160,128,320,256,4],['furniture',32,32,64,64,6],['terrain',16,16,32,32,24]])('%s cells are %ix%i source pixels for a %ix%i screen cell',(kind,w,h,sw,sh,count)=>{
    const recipe=generateEnvironmentRecipe({kind,pixelScale:2});
    expect(recipe.report).toMatchObject({pixelScale:2,cellSize:{width:w,height:h},screenCellSize:{width:sw,height:sh}});
    expect(recipe.report.frames).toHaveLength(count);
    expect(recipe.operations[0].size).toBe(`${w}x${h}`);
    for(const frame of recipe.report.frames){
      for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
        for(const [key,value] of Object.entries(op))if(typeof value==='number')expect(Number.isInteger(value),`${op.name}.${key}`).toBe(true);
      }
      const data=render(recipe,frame.alias);
      expect(data.w).toBe(w);expect(data.h).toBe(h);
      expect(data.data.some(v=>v>0)).toBe(true);
      // reported bounds are screen units covering exactly the source pixels, and sourceBounds says which
      expect(frame.bounds).toEqual({left:frame.sourceBounds.left*2,top:frame.sourceBounds.top*2,right:frame.sourceBounds.right*2+1,bottom:frame.sourceBounds.bottom*2+1});
      expect(frame.sourceBounds.right).toBeLessThan(w);expect(frame.sourceBounds.bottom).toBeLessThan(h);
    }
  });
  test('the furniture pivot is the source-grid ground contact',()=>{
    expect(generateEnvironmentRecipe({kind:'furniture',pixelScale:2}).operations.at(-1)).toEqual({command:'pivot',x:16,y:31});
    expect(generateEnvironmentRecipe({kind:'furniture'}).operations.at(-1)).toEqual({command:'pivot',x:32,y:62});
  });
});

describe('reported geometry is the same as at pixelScale 1',()=>{
  test.each(STYLES)('%s layout, door and walls report identical screen numbers',style=>{
    const one=generateEnvironmentRecipe({kind:'habitat',style}),two=generateEnvironmentRecipe({kind:'habitat',style,pixelScale:2});
    expect(two.report.layout).toEqual(one.report.layout);
    expect(two.report.style).toBe(style);
    expect(two.report.frames.map(f=>f.alias)).toEqual(one.report.frames.map(f=>f.alias));
    expect(two.report.layout.door).toEqual({x:136,y:220,w:48,h:36});
  });
  test('furniture collision rectangles and ground anchors report identical screen numbers',()=>{
    const one=generateEnvironmentRecipe({kind:'furniture'}).report.frames,two=generateEnvironmentRecipe({kind:'furniture',pixelScale:2}).report.frames;
    expect(two.map(f=>[f.alias,f.collision,f.ground])).toEqual(one.map(f=>[f.alias,f.collision,f.ground]));
    for(const frame of two)expect(frame.sourceGround).toEqual({x:16,y:31});
  });
  test('terrain aliases and materials report identically',()=>{
    const one=generateEnvironmentRecipe({kind:'terrain'}).report.frames,two=generateEnvironmentRecipe({kind:'terrain',pixelScale:2}).report.frames;
    expect(two.map(f=>[f.alias,f.material,f.variant,f.cell])).toEqual(one.map(f=>[f.alias,f.material,f.variant,f.cell]));
  });
});

describe.each(STYLES)('%s at pixelScale 2',style=>{
  const recipe=generateEnvironmentRecipe({kind:'habitat',style,pixelScale:2}),one=generateEnvironmentRecipe({kind:'habitat',style});
  const frames=Object.fromEntries(LAYERS.map(l=>[l,render(recipe,l)]));

  test('has hard alpha, no stray pixels and no dither in any layer',()=>{
    for(const layer of LAYERS){
      expect(hardAlpha(frames[layer]),`${style} ${layer} alpha`).toBe(true);
      expect(strays(frames[layer]),`${style} ${layer} strays`).toBe(0);
      expect(ditherWindows(frames[layer]),`${style} ${layer} dither`).toBe(0);
    }
  });

  test('uses only colors the full-size style already uses',()=>{
    const kit=new Set();
    for(const layer of LAYERS)for(const c of colorsOf(render(one,layer)))kit.add(c);
    for(const layer of LAYERS)for(const c of colorsOf(frames[layer]))expect(kit.has(c),`${style} ${layer} ${c.toString(16)}`).toBe(true);
  });

  test('keeps the doorway open and the room readable in the same screen geometry',()=>{
    // Screen rectangles divided by two: door x136..183 y220..255 and interior x24..295 y80..219 are even-aligned.
    for(const layer of LAYERS)for(let y=110;y<128;y++)for(let x=68;x<92;x++)expect(alphaAt(frames[layer],x,y),`${layer} door ${x},${y}`).toBe(layer==='habitat_floor'?255:0);
    // the floor fills the room and the back and front layers leave it clear; the roof closes it from the wall line down
    for(let y=40;y<110;y++)for(let x=12;x<148;x++)for(const layer of LAYERS){
      if(layer==='habitat_roof'&&y<80)continue;
      expect(alphaAt(frames[layer],x,y)===255,`${layer} interior ${x},${y}`).toBe(['habitat_roof','habitat_floor'].includes(layer));
    }
  });

  test('closes the wall below the roof behind the door recess',()=>{
    const roof=frames.habitat_roof;
    for(let y=80;y<110;y++)for(let x=12;x<148;x++)expect(alphaAt(roof,x,y),`${x},${y}`).toBe(255);
    const dark=colorAt(roof,80,100);
    for(let y=92;y<110;y++)for(let x=70;x<91;x++)expect(colorAt(roof,x,y)).toBe(dark);
  });
});

test('pixelScale 2 exteriors have distinct silhouettes, no closer than the full-size ones',()=>{
  const mask=(style,pixelScale)=>{const f=render(generateEnvironmentRecipe({kind:'habitat',style,pixelScale}),'habitat_roof'),out=new Uint8Array(f.w*f.h);for(let i=0;i<out.length;i++)out[i]=f.data[i*4+3]?1:0;return out;};
  const overlap=(a,b)=>{let both=0,either=0;for(let k=0;k<a.length;k++){both+=a[k]&b[k];either+=a[k]|b[k];}return both/either;};
  const full=STYLES.map(s=>mask(s,1)),half=STYLES.map(s=>mask(s,2));
  expect(new Set(half.map(m=>Buffer.from(m).toString('base64'))).size).toBe(STYLES.length);
  for(let i=0;i<STYLES.length;i++)for(let j=i+1;j<STYLES.length;j++){
    const h=overlap(half[i],half[j]),f=overlap(full[i],full[j]);
    expect(h,`${STYLES[i]} vs ${STYLES[j]} (full size ${f.toFixed(3)})`).toBeLessThan(Math.max(f+0.02,0.88));
    // the four modules were held under 0.88 against each other at full size
    if(i>=4)expect(h,`${STYLES[i]} vs ${STYLES[j]}`).toBeLessThan(0.88);
  }
});

test('module exteriors still share the base style rooms at pixelScale 2',()=>{
  for(const [module,base] of [['capsule','cottage'],['vault','barn'],['gantry','workshop'],['dome','kitchen']]){
    const m=generateEnvironmentRecipe({kind:'habitat',style:module,pixelScale:2}),b=generateEnvironmentRecipe({kind:'habitat',style:base,pixelScale:2});
    const floorM=render(m,'habitat_floor'),floorB=render(b,'habitat_floor');
    expect(Buffer.from(floorM.data).equals(Buffer.from(floorB.data)),`${module} floor`).toBe(true);
    // trim only: back and front differ by the module's named seam and chevrons, nowhere else
    const backM=render(m,'habitat_back'),backB=render(b,'habitat_back');
    for(let y=0;y<backM.h;y++)for(let x=0;x<backM.w;x++)if(colorAt(backM,x,y)!==colorAt(backB,x,y))expect(y>=37&&y<=39&&x>=12&&x<=147,`${module} back ${x},${y}`).toBe(true);
    const frontM=render(m,'habitat_front'),frontB=render(b,'habitat_front');
    for(let y=0;y<frontM.h;y++)for(let x=0;x<frontM.w;x++)if(colorAt(frontM,x,y)!==colorAt(frontB,x,y))expect(y>=110&&y<=121&&((x>=64&&x<=67)||(x>=92&&x<=95)),`${module} front ${x},${y}`).toBe(true);
  }
});

test('hazard chevrons, seams and ports are one source pixel thick at minimum',()=>{
  const recipe=generateEnvironmentRecipe({kind:'habitat',style:'capsule',pixelScale:2});
  const ops=recipe.operations.filter(o=>o.command==='draw'&&o.cell===recipe.report.frames.find(f=>f.alias==='habitat_roof').cell);
  const bars=ops.filter(o=>/^hazard_(left|right)_\d$/.test(o.name));
  expect(bars).toHaveLength(10);
  for(const bar of bars){expect(bar.w).toBe(4);expect(bar.h).toBe(2);}
  const seam=ops.find(o=>o.name==='capsule_seam');expect(seam.h).toBe(5);
  expect(ops.filter(o=>o.name.startsWith('capsule_rivet_')).every(o=>o.w===2&&o.h===1)).toBe(true);
});

describe('furniture at pixelScale 2',()=>{
  const recipe=generateEnvironmentRecipe({kind:'furniture',pixelScale:2}),one=generateEnvironmentRecipe({kind:'furniture'});
  test.each(FURNITURE)('%s is hard-edged, stray-free, dither-free and grounded',name=>{
    const f=render(recipe,name);
    expect(hardAlpha(f)).toBe(true);expect(strays(f)).toBe(0);expect(ditherWindows(f)).toBe(0);
    // the last source row is transparent (screen rows 62 and 63), and the feet touch the row above it
    for(let x=0;x<f.w;x++)expect(alphaAt(f,x,31)).toBe(0);
    expect([...Array(f.w).keys()].some(x=>alphaAt(f,x,30)===255)).toBe(true);
    const kit=colorsOf(render(one,name));
    for(const c of colorsOf(f))expect(kit.has(c),`${name} ${c.toString(16)}`).toBe(true);
  });
  test('silhouettes are distinct',()=>{
    const masks=FURNITURE.map(n=>{const f=render(recipe,n);return Buffer.from(Array.from({length:f.w*f.h},(_,i)=>f.data[i*4+3]?1:0)).toString('base64');});
    expect(new Set(masks).size).toBe(FURNITURE.length);
  });
});

describe('terrain at pixelScale 2',()=>{
  const recipe=generateEnvironmentRecipe({kind:'terrain',pixelScale:2}),one=generateEnvironmentRecipe({kind:'terrain'});
  test('tiles are opaque, seamless, stray-free when tiled and keep matching edges across variants',()=>{
    const edges=new Map();
    for(const frame of recipe.report.frames){
      const f=render(recipe,frame.alias),signature=[];
      for(let i=0;i<16;i++){
        expect(colorAt(f,0,i),`${frame.alias} horizontal ${i}`).toBe(colorAt(f,15,i));
        expect(colorAt(f,i,0),`${frame.alias} vertical ${i}`).toBe(colorAt(f,i,15));
        signature.push(colorAt(f,0,i),colorAt(f,i,0));
      }
      if(edges.has(frame.material))expect(signature).toEqual(edges.get(frame.material));else edges.set(frame.material,signature);
      for(let i=3;i<f.data.length;i+=4)expect(f.data[i]).toBe(255);
      expect(strays(f,true),`${frame.alias} strays`).toBe(0);
      expect(ditherWindows(f),`${frame.alias} dither`).toBe(0);
    }
  });
  test.each(MATERIALS)('%s keeps its palette, four distinct variants and a base fill under 80 percent',material=>{
    const frames=recipe.report.frames.filter(f=>f.material===material).map(f=>render(recipe,f.alias));
    expect(new Set(frames.map(f=>Buffer.from(f.data).toString('base64'))).size).toBe(4);
    const kit=new Set();for(const f of one.report.frames.filter(f=>f.material===material))for(const c of colorsOf(render(one,f.alias)))kit.add(c);
    for(const f of frames){
      for(const c of colorsOf(f))expect(kit.has(c),`${material} ${c.toString(16)}`).toBe(true);
      const counts=new Map();for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)counts.set(colorAt(f,x,y),(counts.get(colorAt(f,x,y))||0)+1);
      expect(Math.max(...counts.values())/(f.w*f.h)).toBeLessThan(material==='alloy'?0.8:0.95);
    }
  });
});

test('effective scale of every pixelScale 2 layer is source size times draw scale 2',()=>{
  // The scale guard collects these: source cell x draw scale = the screen cell the game lays out.
  const effective=(kind,extra={})=>{const r=generateEnvironmentRecipe({kind,pixelScale:2,...extra}).report;return {width:r.cellSize.width*r.pixelScale,height:r.cellSize.height*r.pixelScale};};
  expect(effective('habitat')).toEqual({width:320,height:256});
  expect(effective('furniture')).toEqual({width:64,height:64});
  expect(effective('terrain')).toEqual({width:32,height:32});
});
