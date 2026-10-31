import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../../server/build/project-build.js';
import {generateUIRecipe} from '../../server/authoring/ui.js';
import {normalizeBitmapFont,placeBitmapText} from '../../server/build/ui-runtime.mjs';

let dir,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-frame-names-'));config={version:1,output:'dist',scale:1,trim:false};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
// Everything is read inside the call because the next build reuses the output folder.
async function build(ui,extra={}){
  const path=join(dir,'sprite-project.json');writeFileSync(path,JSON.stringify({...config,ui,...extra}));
  const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  return {result,sheet:sha(readFileSync(result.artifacts.sheet)),report:json(result.artifacts.uiReport),atlas:json(result.artifacts.atlas),phaser:json(result.artifacts.uiPhaser),proof:result.artifacts.fontProofReport?json(result.artifacts.fontProofReport):null};
}
const ui={name:'ui-font',kind:'font',characters:'!A?'};
const TEMPLATE='glyph-{tone}-{dec}';

test('a template renames every glyph frame in the report, the glyph map and the atlas',async()=>{
  const built=await build({...ui,frameNames:TEMPLATE});
  expect(built.report.frames.find(f=>f.character==='!'&&f.tone==='cream').alias).toBe('glyph-cream-33');
  expect(built.report.glyphs['!'].frames).toEqual({cream:'glyph-cream-33',muted:'glyph-muted-33',gold:'glyph-gold-33',ink:'glyph-ink-33'});
  expect(built.atlas.frames.some(f=>f.filename==='glyph-cream-33')).toBe(true);
  expect(built.atlas.frames.some(f=>/^glyph_/.test(f.filename))).toBe(false);
  for(const f of built.report.frames)expect(f.alias).toBe(`glyph-${f.tone}-${f.character.codePointAt(0)}`);
});

test('the {hex4} template reproduces the default names byte for byte',async()=>{
  const base=await build(ui),same=await build({...ui,frameNames:'glyph_{hex4}_{tone}'});
  expect(base.report.glyphs['!'].frames.cream).toBe('glyph_0021_cream');
  expect(same.report).toEqual(base.report);expect(same.atlas).toEqual(base.atlas);expect(same.phaser).toEqual(base.phaser);expect(same.sheet).toBe(base.sheet);
  expect(JSON.stringify(generateUIRecipe({...ui,frameNames:'glyph_{hex4}_{tone}'}))).toBe(JSON.stringify(generateUIRecipe(ui)));
});

test('{hex} is unpadded lower-case hexadecimal',()=>{
  const {report}=generateUIRecipe({...ui,characters:'!z',frameNames:'{tone}.{hex}'});
  expect(report.glyphs['!'].frames.ink).toBe('ink.21');expect(report.glyphs.z.frames.ink).toBe('ink.7a');
});

test.each(['compact','display'])('the %s face renames the same way',async face=>{
  const base=await build({...ui,face}),named=await build({...ui,face,frameNames:TEMPLATE});
  expect(named.report.glyphs['!'].frames.cream).toBe('glyph-cream-33');
  expect(named.atlas.frames.some(f=>f.filename==='glyph-cream-33')).toBe(true);
  expect(named.sheet).toBe(base.sheet);
  expect(named.report.frames.map(f=>f.cell)).toEqual(base.report.frames.map(f=>f.cell));
});

test('skin frames keep their names and reject the option',async()=>{
  const built=await build({name:'ui-skin',kind:'skin'});
  expect(built.report.frames.map(f=>f.alias)).toEqual(generateUIRecipe({name:'ui-skin',kind:'skin'}).report.frames.map(f=>f.alias));
  expect(built.report.frames.some(f=>/^glyph/.test(f.alias))).toBe(false);
  expect(()=>generateUIRecipe({name:'ui-skin',kind:'skin',frameNames:TEMPLATE})).toThrow(/frameNames/);
  expect(()=>generateUIRecipe({kind:'logo',frameNames:TEMPLATE})).toThrow(/frameNames/);
});

test('a font built with a template still loads: font-proof, expected frames and the runtime lookups',async()=>{
  const built=await build({...ui,frameNames:TEMPLATE},{expectedFrames:['glyph-cream-33']});
  expect(built.proof.glyphs.map(g=>g.character).sort()).toEqual(['!','?','A']);
  const font=normalizeBitmapFont({report:built.report,atlas:built.atlas});
  expect(font.glyphs['!'].frames.cream.name).toBe('glyph-cream-33');
  expect(placeBitmapText(font,'!A',0,0).draws).toHaveLength(2);
  // The Phaser descriptor addresses glyphs by code point, so it loads without any name.
  const phaser=normalizeBitmapFont({phaser:built.phaser});
  expect(phaser.glyphs['!'].frames.cream.source).toEqual(font.glyphs['!'].frames.cream.source);
  expect(JSON.stringify(built.phaser)).not.toContain('glyph-');
});

test.each([
  ['an unknown token','glyph-{tone}-{code}'],
  ['no {tone}','glyph-{dec}'],
  ['no code token','glyph-{tone}'],
  ['an unmatched brace','glyph-{tone}-{dec'],
  ['an unsafe character','glyph/{tone}-{dec}'],
  ['an empty template',''],
  ['a non-string template',7],
])('%s fails naming frameNames',(_,template)=>{
  expect(()=>generateUIRecipe({...ui,frameNames:template})).toThrow(/frameNames/);
});

// The tone names are a prefix-free set and every code token is a function of the code point, so a valid
// template cannot collide today; the guard in generateUIRecipe covers future tokens. This pins the invariant.
test.each(['{tone}{hex}','{hex}{tone}','{dec}{hex}{tone}','{hex}{hex4}{tone}','{tone}-{dec}{hex4}'])('the valid template %s yields unique names for every font character',template=>{
  const {report}=generateUIRecipe({kind:'font',frameNames:template});
  const names=report.frames.map(f=>f.alias);
  expect(new Set(names).size).toBe(names.length);
});
