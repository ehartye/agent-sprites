import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildProject} from '../../server/build/project-build.js';
let dir,path,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-build-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1,ui:{name:'ui-font',kind:'font',characters:' Agé?'}};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const write=()=>writeFileSync(path,JSON.stringify(config));
test.each(['regular','compact'])('%s UI build publishes deterministic editable font, portable runtime, embedded bootstrap and owned report',async face=>{
  config.ui.face=face;
  write();const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  for(const key of ['uiReport','uiRuntime','uiBoot','uiPhaser'])expect(existsSync(result.artifacts[key])).toBe(true);
  const marker=JSON.parse(readFileSync(join(dir,'dist','.agent-sprites-build.json')));expect(marker.files).toContain('ui-runtime.mjs');expect(marker.files).toContain('ui-boot.mjs');
  const boot=await import(pathToFileURL(result.artifacts.uiBoot).href);expect(boot.imageDataUrl).toMatch(/^data:image\/png;base64,/);expect(boot.report.kind).toBe('font');expect(boot.atlas.frames.length).toBeGreaterThan(0);expect(boot.phaser).toEqual(JSON.parse(readFileSync(result.artifacts.uiPhaser,'utf8')));
  const px=JSON.parse(readFileSync(result.artifacts.uiPhaser,'utf8'));expect(px).toMatchObject({version:1,kind:'font',face,image:'ui-font.png',atlas:'ui-font.atlas.json',fallback:'?'});
  expect(Object.keys(px.tones)).toEqual(['cream','muted','gold','ink']);expect(px.glyphs).toBe([...px.glyphs].filter((c,i,a)=>a.indexOf(c)===i).join(''));expect(px.glyphs).not.toContain(' ');
  const rep=JSON.parse(readFileSync(result.artifacts.uiReport,'utf8')),atl=JSON.parse(readFileSync(result.artifacts.atlas,'utf8'));
  for(const tone of Object.keys(px.tones)){const d=px.tones[tone];expect(d).toMatchObject({retroFont:false,lineHeight:rep.lineHeight});
    for(const [ch,g] of Object.entries(rep.glyphs)){const c=d.chars[ch.codePointAt(0)];expect(c.xAdvance).toBe(g.advance);expect(c.yOffset).toBe(0);expect(c.data).toEqual({});expect(c.kerning).toEqual({});
      if(ch===' '){expect(c.width).toBe(0);expect(px.spaceAdvance).toBe(g.advance);continue;}
      const f=atl.frames.find(x=>x.filename===g.frames[tone]).frame;expect([c.x,c.y,c.width,c.height]).toEqual([f.x,f.y,f.w,f.h]);}}
  const previous=readFileSync(result.artifacts.sheet);expect((await buildProject(path)).ok).toBe(true);expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
  config.ui.characters='🦋';write();expect((await buildProject(path)).ok).toBe(false);expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
},20000);
test('skin publishes runtime and slicing metrics without a font bootstrap',async()=>{
  config.ui={name:'ui-skin',kind:'skin'};write();const result=await buildProject(path);expect(result.ok).toBe(true);expect(result.artifacts.uiBoot).toBeUndefined();const report=JSON.parse(readFileSync(result.artifacts.uiReport));expect(report.skins.panel_dark).toBeDefined();expect(report.skins.specimen_label.textTone).toBe('ink');expect(report.skins.speech.insets.left).toBe(6);const marker=JSON.parse(readFileSync(join(dir,'dist','.agent-sprites-build.json')));expect(marker.files).toContain('ui-report.json');expect(marker.files).toContain('ui-phaser.json');const px=JSON.parse(readFileSync(result.artifacts.uiPhaser,'utf8'));expect(px).toMatchObject({kind:'skin',image:'ui-skin.png'});expect(px.frames.panel_dark.nineSlice).toEqual({leftWidth:4,rightWidth:4,topHeight:4,bottomHeight:4});expect(px.frames.icon_leaf.nineSlice).toBeUndefined();expect(px.frames.scrim.nineSlice).toBeUndefined();expect(px.frames.speech.nineSlice.leftWidth).toBe(6);
},20000);
test.each(['ops','generator','character','environment'])('rejects mixed UI and %s before publication',async source=>{
  config[source]=null;write();const result=await buildProject(path);expect(result.ok).toBe(false);expect(result.errors[0].message).toMatch(/exactly one/);expect(existsSync(join(dir,'dist'))).toBe(false);
});
