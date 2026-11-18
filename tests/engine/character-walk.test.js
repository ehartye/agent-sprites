// @lane scheduled
import { test, expect } from 'vitest';
import { generateWalk } from '../../examples/character-walk/generate.mjs';
import { buildProject } from '../../server/build/project-build.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from 'canvas';

const phaseNames = ['right_contact', 'right_load', 'right_support', 'right_push', 'left_contact', 'left_load', 'left_support', 'left_push'];

test('the walk tag interleaves the original landmarks with the four new poses', () => {
  const ops = generateWalk();
  const alias = new Map(ops.filter(op => op.command === 'name').map(op => [op.cell, op.as]));
  const walk = ops.find(op => op.command === 'group' && op.name === 'walk');
  expect(walk.cells.map(cell => alias.get(cell))).toEqual(phaseNames);
  expect([...alias.keys()].sort().slice(0, 4).map(cell => alias.get(cell))).toEqual(phaseNames.filter((_, i) => i % 2 === 0));
  for (const cell of walk.cells) {
    const parts = ops.filter(op => op.cell === cell && op.command === 'draw');
    const names = parts.map(part => part.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('right_wrist_band');
    expect(names).not.toContain('left_wrist_band');
  }
  for (const [phase, nearLeads] of [[0, true], [4, false]]) {
    const parts = ops.filter(op => op.cell === walk.cells[phase]);
    const x = name => parts.find(op => op.name === name).x;
    expect(x('right_boot_top') > x('left_boot_top')).toBe(nearLeads);
    expect(x('right_hand') > x('left_hand')).toBe(!nearLeads);
  }
});

test('stance moves back under the hip and swing clears the ground across supported strides', () => {
  for (const stride of [2, 3, 4, 5]) {
    for (const bob of [0, 1]) {
      const ops = generateWalk({stride, bob});
      const cells = ops.find(op => op.command === 'group').cells;
      for (const [side, start] of [['right', 0], ['left', 4]]) {
        const part = (phase, name) => ops.find(op => op.cell === cells[(phase + start) % 8] && op.name === side + '_' + name);
        const soles = cells.map((_, phase) => Math.max(...part(phase, 'boot').points.map(([, y]) => y)));
        expect(soles.slice(0, 5)).toEqual([29, 29, 29, 29, 29]);
        expect(Math.max(...soles.slice(5))).toBeLessThan(29);
        const anchors = cells.slice(0, 5).map((_, phase) => part(phase, 'boot_top').x);
        expect(anchors[0] - anchors[4]).toBe(2 * stride);
        expect(anchors).toEqual([...anchors].sort((a, b) => b - a));
        const groundEdge = phase => part(phase, 'boot').points.filter(([, y]) => y === 29).map(([x]) => x);
        expect(Math.max(...groundEdge(0))).toBeLessThan(Math.max(...part(0, 'boot').points.map(([x]) => x)));
        expect(Math.min(...groundEdge(4))).toBeGreaterThan(part(4, 'boot_top').x);
        // The passing leg folds: its knee is in front of the hip, its lifted ankle behind.
        expect(part(6, 'shin').points[0][0]).toBeGreaterThan(11);
        expect(part(6, 'boot_top').x).toBeLessThan(11);
      }
    }
  }
});

test('parameters are bounded and generation is deterministic', () => {
  expect(generateWalk({stride:3,bob:0,fps:6})).toEqual(generateWalk({stride:3,bob:0,fps:6}));
  for (const config of [{stride:20},{bob:8},{fps:0},{colors:{jacket:'bad'}},{colors:{constructor:'#123456'}},{name:42},{name:'../escape'}]) expect(()=>generateWalk(config)).toThrow();
});

test('real built walk has eight distinct grounded frames in a half-second loop', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sprite-walk-'));
  try {
    writeFileSync(join(dir,'ops.json'),JSON.stringify(generateWalk({})));
    writeFileSync(join(dir,'sprite-project.json'),JSON.stringify({version:1,ops:'ops.json',output:'dist',expectedTags:['walk']}));
    const built=await buildProject(join(dir,'sprite-project.json'));
    expect(built.ok).toBe(true); expect(built.warnings).toEqual([]);
    const atlas=JSON.parse(readFileSync(built.artifacts.atlas,'utf8'));
    const tag=atlas.meta.frameTags.find(t=>t.name==='walk'); expect(tag.to-tag.from+1).toBe(8);
    expect(atlas.frames.slice(tag.from,tag.to+1).map(f=>f.duration)).toEqual([62,63,62,63,62,63,62,63]);
    const image=await loadImage(built.artifacts.sheet),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const frames=[];
    for(const {frame} of atlas.frames.slice(tag.from,tag.to+1)){
      const data=ctx.getImageData(frame.x,frame.y,24,32).data;frames.push(Buffer.from(data).toString('base64'));
      let baseline=-1;for(let y=0;y<32;y++)for(let x=0;x<24;x++)if(data[(y*24+x)*4+3])baseline=y;
      expect(baseline).toBe(29);
    }
    expect(new Set(frames).size).toBe(8);
  } finally {rmSync(dir,{recursive:true,force:true});}
}, 20000);
