import {test,expect} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
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
const pixel=(data,x,y,w=32)=>Array.from(data.slice((y*w+x)*4,(y*w+x)*4+4));

test.each([['terrain',24,32,32],['habitat',4,320,256],['furniture',6,64,64]])('%s provides deterministic editable bounded frames',(kind,count,width,height)=>{
  const result=generateEnvironmentRecipe({kind});expect(generateEnvironmentRecipe({kind})).toEqual(result);
  expect(result.report).toMatchObject({ok:true,version:1,kind,cellSize:{width,height}});expect(result.report.frames).toHaveLength(count);
  expect(new Set(result.report.frames.map(f=>f.alias)).size).toBe(count);
  for(const frame of result.report.frames){
    const ops=result.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell);
    expect(ops.length).toBeGreaterThan(5);expect(new Set(ops.map(o=>o.name)).size).toBe(ops.length);
    expect(frame.bounds.left).toBeGreaterThanOrEqual(0);expect(frame.bounds.top).toBeGreaterThanOrEqual(0);expect(frame.bounds.right).toBeLessThan(width);expect(frame.bounds.bottom).toBeLessThan(height);
    for(const op of ops)for(const [key,value] of Object.entries(op)){if(typeof value==='number')expect(Number.isInteger(value),`${op.name}.${key}`).toBe(true);}
    expect(render(result,frame).some(v=>v>0)).toBe(true);
  }
});

test('terrain variants have matching opposite edges and compatible edges between variants',()=>{
  const result=generateEnvironmentRecipe({kind:'terrain'}),edges=new Map();
  for(const frame of result.report.frames){
    const data=render(result,frame),signature=[];
    for(let i=0;i<32;i++){
      expect(pixel(data,0,i),`${frame.alias} horizontal ${i}`).toEqual(pixel(data,31,i));
      expect(pixel(data,i,0),`${frame.alias} vertical ${i}`).toEqual(pixel(data,i,31));
      signature.push(pixel(data,0,i),pixel(data,i,0));
    }
    if(edges.has(frame.material))expect(signature).toEqual(edges.get(frame.material));else edges.set(frame.material,signature);
    for(let i=3;i<data.length;i+=4)expect(data[i]).toBe(255);
  }
});

test('seed changes texture and variant subset preserves stable aliases',()=>{
  expect(generateEnvironmentRecipe({kind:'terrain',seed:8}).operations).not.toEqual(generateEnvironmentRecipe({kind:'terrain',seed:7}).operations);
  const result=generateEnvironmentRecipe({kind:'terrain',materials:['packed-earth','moss'],variants:2});
  expect(result.report.frames.map(f=>f.alias)).toEqual(['packed-earth_0','packed-earth_1','moss_0','moss_1']);
  const all=generateEnvironmentRecipe({kind:'terrain'});
  for(const material of ['moss','regolith','basalt','packed-earth','alloy','cork']){
    const frames=all.report.frames.filter(f=>f.material===material).map(f=>Buffer.from(render(all,f)).toString('base64'));
    expect(new Set(frames).size,material).toBe(4);
  }
});

test('habitat roof conceals interior while every wall layer leaves the 48px doorway clear',()=>{
  const result=generateEnvironmentRecipe({kind:'habitat'}),{interior,door,walls}=result.report.layout;
  expect(door).toEqual({x:136,y:220,w:48,h:36});expect(walls).toHaveLength(5);
  for(const frame of result.report.frames){
    const data=render(result,frame);
    for(let y=door.y;y<door.y+door.h;y++)for(let x=door.x;x<door.x+door.w;x++)expect(pixel(data,x,y,320)[3],`${frame.alias} door`).toBe(frame.alias==='habitat_floor'?255:0);
    for(let y=interior.y;y<interior.y+interior.h;y++)for(let x=interior.x;x<interior.x+interior.w;x++){
      const opaque=['habitat_roof','habitat_floor'].includes(frame.alias);expect(pixel(data,x,y,320)[3],`${frame.alias} interior`).toBe(opaque?255:0);
    }
  }
});

test('furniture shares a grounded origin and leaves two bottom rows transparent',()=>{
  const result=generateEnvironmentRecipe({kind:'furniture'});
  for(const frame of result.report.frames){
    expect(frame.ground).toEqual({x:32,y:62});expect(frame.collision.y+frame.collision.h).toBe(62);
    const data=render(result,frame);for(let y=62;y<64;y++)for(let x=0;x<64;x++)expect(pixel(data,x,y,64)[3]).toBe(0);
  }
});

test.each([null,[],{}, {kind:'forest'},{kind:'terrain',name:'../bad'},{kind:'terrain',name:null},{kind:'terrain',seed:1.5},{kind:'terrain',seed:null},{kind:'terrain',seed:Infinity},{kind:'terrain',seed:Number.MAX_SAFE_INTEGER+1},{kind:'terrain',variants:0},{kind:'terrain',variants:5},{kind:'terrain',variants:null},{kind:'terrain',materials:[]},{kind:'terrain',materials:['moss','moss']},{kind:'terrain',materials:['unknown']},{kind:'terrain',materials:null},{kind:'habitat',variants:1},{kind:'furniture',materials:['moss']},{kind:'terrain',typo:true}])('rejects invalid environment config %j',config=>expect(()=>generateEnvironmentRecipe(config)).toThrow());
