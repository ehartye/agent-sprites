import {test,expect} from 'vitest';
import {createCanvas} from 'canvas';
import {Project} from '../../server/engine/project.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {exportSpriteAtlases} from '../../server/engine/sprite-export.js';
import sharp from 'sharp';

function fixture(){
  const project=Project.create({name:'aligned',cellSize:8,rows:1,cols:3});
  project.cells.getCell('0,0').draw('rect',{x:2,y:1,w:3,h:4,filled:true,surface:{normal:{mode:'flat',vector:[1,0,1]}}},'#fff','panel');
  project.cells.getCell('0,0').name='pose';
  project.cells.getCell('0,1').draw('point',{x:5,y:6},'#fff','dot');
  project.groups.create('turn',['0,1','0,0','0,1']);
  project.frameDurations={'0,0':75,'0,1':125};project.animationDirections={turn:'pingpong_reverse'};project.animationLoops={turn:false};project.pivot={x:4,y:7};
  const renderer=new CanvasRenderer(project.palette),colorRaw=renderer.renderCellRaw.bind(renderer);
  // Isolate packing from shading math: a controlled normal image with identical source alpha.
  renderer.renderCellRaw=(cell,opts={})=>{
    const rgba=colorRaw(cell);
    if(opts.channel==='normal')for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]){rgba[i]=218;rgba[i+1]=128;rgba[i+2]=218;}
    return rgba;
  };
  return {project,renderer};
}
test.each([false,true])('normal atlas follows the exact color layout, aliases, timing and pivot (trim %s)',async trim=>{
  const {project,renderer}=fixture();
  const result=await exportSpriteAtlases(project,renderer,{imageName:'aligned.png',trim});
  expect(result.normalAtlas.frames).toEqual(result.atlas.frames);
  expect(result.normalAtlas.meta.frameTags).toEqual(result.atlas.meta.frameTags);
  expect(result.normalAtlas.meta.slices).toEqual(result.atlas.meta.slices);
  expect(result.normalAtlas.meta.size).toEqual(result.atlas.meta.size);
  expect(result.normalAtlas.meta.image).toBe('aligned.normal.png');
  expect(result.atlas.meta.normalMap).toMatchObject({image:'aligned.normal.png',atlas:'aligned.normal.atlas.json',green:'up'});
  const color=await sharp(result.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const normal=await sharp(result.normalPng).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(normal.info).toEqual(color.info);
  for(let i=0;i<color.data.length;i+=4){
    expect(normal.data[i+3]).toBe(color.data[i+3]);
    if(normal.data[i+3])expect([...normal.data.subarray(i,i+3)]).toEqual([218,128,218]);
  }
});
test('normal output is automatic for authored normals, optional otherwise and explicitly validated',async()=>{
  const project=Project.create({name:'plain',cellSize:2,rows:1,cols:1});project.cells.getCell('0,0').draw('point',{x:0,y:0},'#fff');
  const canvas=createCanvas(2,2);canvas.getContext('2d').fillRect(0,0,1,1);
  const renderer={renderSheet:()=>canvas.toBuffer('image/png'),renderCellRaw:()=>new Uint8ClampedArray([128,128,255,255,...Array(12).fill(0)])};
  expect((await exportSpriteAtlases(project,renderer,{imageName:'plain.png'})).normalPng).toBeUndefined();
  expect((await exportSpriteAtlases(project,renderer,{imageName:'plain.png',normal:true})).normalPng).toBeInstanceOf(Buffer);
  await expect(exportSpriteAtlases(project,renderer,{imageName:'plain.png',normal:'yes'})).rejects.toThrow(/normal/);
});
test('packing preserves encoded normal RGB under partial alpha without canvas premultiplication',async()=>{
  const project=Project.create({name:'alpha',cellSize:1,rows:1,cols:1});
  const canvas=createCanvas(1,1),renderer={renderSheet:()=>canvas.toBuffer('image/png'),renderCellRaw:()=>new Uint8ClampedArray([219,129,217,7])};
  const result=await exportSpriteAtlases(project,renderer,{imageName:'alpha.png',normal:true});
  expect([...await sharp(result.normalPng).raw().toBuffer()]).toEqual([219,129,217,7]);
});
