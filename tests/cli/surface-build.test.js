import {test,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {Project} from '../../server/engine/project.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {renderConstructionReplay} from '../../server/engine/construction-replay.js';

test('paired environment atlases carry the same source pixel scale',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sprite-surface-scale-'));
  try{
    writeFileSync(join(dir,'build.json'),JSON.stringify({version:1,output:'dist',scale:1,normal:true,environment:{name:'terrain-half',kind:'terrain',pixelScale:2,materials:['moss'],variants:1}}));
    const result=await buildProject(join(dir,'build.json'));expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
    const atlas=JSON.parse(readFileSync(result.artifacts.atlas,'utf8')),normal=JSON.parse(readFileSync(result.artifacts.normalAtlas,'utf8'));
    expect(atlas.meta.pixelScale).toBe(2);expect(normal.meta.pixelScale).toBe(atlas.meta.pixelScale);expect(normal.meta.size).toEqual(atlas.meta.size);
  }finally{rmSync(dir,{recursive:true,force:true});}
},30000);

test('isolated build publishes aligned animated normal/color atlases and retained lit replay',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sprite-surface-build-'));
  try{
    const ops=[
      {command:'new',name:'lit-panels',size:8,rows:1,cols:3,palette:'pico8'},
      {command:'draw',cell:'0,0',type:'rect',x:1,y:1,w:5,h:5,filled:true,color:'#c0a080',name:'panel',surface:{normal:{mode:'bevel',width:2,depth:2},material:{wall:true}}},
      {command:'draw',cell:'0,0',type:'point',x:1,y:2,color:'#00000000',name:'key',surface:{lamps:[{name:'warm',x:1,y:2,radius:12,z:2,color:'#ffb070'}]}},
      {command:'lighting',cell:'0,0',lighting:{palettePolicy:'rgb',cell:1,ambient:0.15}},
      {command:'copy',from:'0,0',to:'0,1'},
      {command:'move',cell:'0,1',shape:'key',dx:3,dy:0},
      {command:'copy',from:'0,1',to:'0,2'},
      {command:'move',cell:'0,2',shape:'key',dx:2,dy:0},
      {command:'duration',cell:'0,0',ms:75},{command:'duration',cell:'0,1',ms:125},{command:'duration',cell:'0,2',ms:200},
      {command:'group',sub:'create',name:'sweep',cells:['0,0','0,1','0,2'],direction:'pingpong_reverse',loop:false},
      {command:'pivot',x:4,y:7},
    ];
    writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));writeFileSync(join(dir,'build.json'),JSON.stringify({version:1,ops:'ops.json',output:'dist',trim:true,replay:{cells:['0,0','0,1'],maxSteps:20}}));
    const result=await buildProject(join(dir,'build.json'));expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
    const atlas=JSON.parse(readFileSync(result.artifacts.atlas,'utf8')),normalAtlas=JSON.parse(readFileSync(result.artifacts.normalAtlas,'utf8'));
    expect(normalAtlas.frames).toEqual(atlas.frames);expect(normalAtlas.meta.frameTags).toEqual(atlas.meta.frameTags);expect(normalAtlas.meta.slices).toEqual(atlas.meta.slices);
    expect(atlas.meta.lighting).toMatchObject({mode:'offline-2d-baked-color',cells:{'0,0':{palettePolicy:'rgb'}}});expect(normalAtlas.meta.lighting).toBeUndefined();
    const normal=await sharp(result.artifacts.normalSheet).ensureAlpha().raw().toBuffer({resolveWithObject:true}),color=await sharp(result.artifacts.sheet).ensureAlpha().raw().toBuffer();
    for(let i=3;i<color.length;i+=4)expect(normal.data[i]).toBe(color[i]);
    const project=Project.load(result.artifacts.project),renderer=new CanvasRenderer(project.palette),first=project.cells.getCell('0,0'),last=project.cells.getCell('0,2');
    expect([...renderer.renderCellRaw(first)]).not.toEqual([...renderer.renderCellRaw(last)]);
    const trace=project.constructionReplay,view=renderConstructionReplay(project,{cell:'0,0',step:trace.records.length-1});expect(view.current).toEqual({sameState:true,samePixels:true});
    const firstNormal=renderer.renderCellRaw(first,{channel:'normal'});
    for(let index=0;index<3;index++){
      const normalBytes=renderer.renderCellRaw(project.cells.getCell(`0,${index}`),{channel:'normal'}),packed=normalAtlas.frames[index],bounds=packed.spriteSourceSize;
      expect([...normalBytes]).toEqual([...firstNormal]); // Moving a lamp never bakes light into normals.
      for(let y=0;y<bounds.h;y++)for(let x=0;x<bounds.w;x++){
        const target=((packed.frame.y+y)*normal.info.width+packed.frame.x+x)*4,source=((bounds.y+y)*8+bounds.x+x)*4;
        expect([...normal.data.subarray(target,target+4)]).toEqual([...normalBytes.subarray(source,source+4)]);
      }
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
},30000);
