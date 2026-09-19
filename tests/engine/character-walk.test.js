import { test, expect } from 'vitest';
import { generateWalk } from '../../examples/character-walk/generate.mjs';
import { buildProject } from '../../server/build/project-build.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from 'canvas';

test('four editable poses preserve anatomical identity and counter-swing', () => {
  const ops=generateWalk({});
  const shapes=cell=>ops.filter(o=>o.command==='draw'&&o.cell===cell);
  const hand=(cell,part)=>shapes(cell).find(o=>o.name===`${part}_hand`);
  const boot=(cell,part)=>shapes(cell).find(o=>o.name===`${part}_boot`);
  for (const cell of ['0,0','0,1','0,2','0,3']) {
    const names=shapes(cell).map(s=>s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('right_wrist_band');
    expect(names).not.toContain('left_wrist_band');
    expect(Math.max(boot(cell,'right').y+boot(cell,'right').h-1,boot(cell,'left').y+boot(cell,'left').h-1)).toBe(29);
  }
  expect(boot('0,0','right').x).toBeGreaterThan(boot('0,0','left').x);
  expect(hand('0,0','right').x).toBeLessThan(hand('0,0','left').x);
  expect(boot('0,2','right').x).toBeLessThan(boot('0,2','left').x);
  expect(hand('0,2','right').x).toBeGreaterThan(hand('0,2','left').x);
  expect(boot('0,1','left').y).toBeLessThan(boot('0,1','right').y);
  expect(boot('0,3','right').y).toBeLessThan(boot('0,3','left').y);
  expect(ops.some(o=>['rotate','rotate-cell'].includes(o.command))).toBe(false);
});

test('parameters are bounded and generation is deterministic', () => {
  expect(generateWalk({stride:3,bob:0,fps:6})).toEqual(generateWalk({stride:3,bob:0,fps:6}));
  for (const config of [{stride:20},{bob:8},{fps:0},{colors:{jacket:'bad'}},{colors:{constructor:'#123456'}},{name:42},{name:'../escape'}]) expect(()=>generateWalk(config)).toThrow();
});

test('real built walk has four distinct grounded silhouettes and a timed walk tag', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sprite-walk-'));
  try {
    writeFileSync(join(dir,'ops.json'),JSON.stringify(generateWalk({})));
    writeFileSync(join(dir,'sprite-project.json'),JSON.stringify({version:1,ops:'ops.json',output:'dist',expectedTags:['walk']}));
    const built=await buildProject(join(dir,'sprite-project.json'));
    expect(built.ok).toBe(true); expect(built.warnings).toEqual([]);
    const atlas=JSON.parse(readFileSync(built.artifacts.atlas,'utf8'));
    const tag=atlas.meta.frameTags.find(t=>t.name==='walk'); expect(tag.to-tag.from+1).toBe(4);
    expect(atlas.frames.slice(tag.from,tag.to+1).map(f=>f.duration)).toEqual([125,125,125,125]);
    const image=await loadImage(built.artifacts.sheet),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const frames=[];
    for(let col=0;col<4;col++){
      const data=ctx.getImageData(col*24,0,24,32).data;frames.push(Buffer.from(data).toString('base64'));
      let baseline=-1;for(let y=0;y<32;y++)for(let x=0;x<24;x++)if(data[(y*24+x)*4+3])baseline=y;
      expect(baseline).toBe(29);
    }
    expect(new Set(frames).size).toBe(4);
  } finally {rmSync(dir,{recursive:true,force:true});}
}, 20000);
