import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../../server/build/project-build.js';
import {PAD_ALIAS_NAMES,PAD_FAMILIES,PAD_IDS,PAD_DECK_EXTRA_IDS,CURSOR_ALIAS_NAMES,padPixels,cursorPixels} from '../../server/authoring/ui-pad.js';

let dir,path,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-pad-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const build=async ui=>{config.ui=ui;writeFileSync(path,JSON.stringify(config));return buildProject(path);};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const key=px=>JSON.stringify(px);

test('the alias list has 4 families x 21 ids plus the four Deck grips',()=>{
  expect(PAD_IDS.length).toBe(21);expect(PAD_DECK_EXTRA_IDS).toEqual(['l4','r4','l5','r5']);
  expect(PAD_ALIAS_NAMES.length).toBe(4*21+4);expect(new Set(PAD_ALIAS_NAMES).size).toBe(PAD_ALIAS_NAMES.length);
  for(const f of PAD_FAMILIES)for(const id of PAD_IDS)expect(PAD_ALIAS_NAMES).toContain(`pad_${f}_${id}`);
  expect(CURSOR_ALIAS_NAMES).toEqual(['cursor_tile','cursor_aim']);
});

test('every pad glyph is colour pixel art no taller than 13 px; cursors are exactly 16x16 and 11x11',()=>{
  for(const alias of PAD_ALIAS_NAMES){
    const px=padPixels(alias);expect(px.length,alias).toBeLessThanOrEqual(13);expect(px[0].length,alias).toBeLessThanOrEqual(20);
    expect(px.flat().filter(Boolean).length,alias).toBeGreaterThan(20);
  }
  expect([cursorPixels('cursor_tile').length,cursorPixels('cursor_tile')[0].length]).toEqual([16,16]);
  expect([cursorPixels('cursor_aim').length,cursorPixels('cursor_aim')[0].length]).toEqual([11,11]);
});

test('glyphs within a family are distinct; Deck matches Xbox for shared ids',()=>{
  for(const f of PAD_FAMILIES){
    const ids=[...PAD_IDS,...(f==='deck'?PAD_DECK_EXTRA_IDS:[])],seen=new Map();
    for(const id of ids){const k=key(padPixels(`pad_${f}_${id}`));expect(seen.get(k),`${f}_${id} duplicates ${seen.get(k)}`).toBeUndefined();seen.set(k,id);}
  }
  for(const id of PAD_IDS)expect(key(padPixels(`pad_deck_${id}`))).toBe(key(padPixels(`pad_xbox_${id}`)));
  expect(key(padPixels('pad_ps_south'))).not.toBe(key(padPixels('pad_xbox_south')));
  expect(key(padPixels('pad_switch_south'))).not.toBe(key(padPixels('pad_switch_east')));
});

test('the wasteland skin paints every pad and cursor frame inside the cell with exact bounds',async()=>{
  const result=await build({name:'ui-skin',kind:'skin',theme:'wasteland'});expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const report=JSON.parse(readFileSync(result.artifacts.uiReport));
  const phaser=JSON.parse(readFileSync(result.artifacts.uiPhaser));
  for(const alias of [...PAD_ALIAS_NAMES,...CURSOR_ALIAS_NAMES]){
    expect(report.skins[alias],alias).toBeTruthy();expect(report.skins[alias].icon).toBe(true);expect(report.skins[alias].color).toBe(true);
    const f=report.frames.find(x=>x.alias===alias),w=f.bounds.right-f.bounds.left+1,h=f.bounds.bottom-f.bounds.top+1;
    expect(f.bounds.left>=0&&f.bounds.top>=0&&f.bounds.right<=23&&f.bounds.bottom<=23,alias).toBe(true);
    if(alias.startsWith('pad_'))expect(h,alias).toBeLessThanOrEqual(13);
    if(alias==='cursor_tile')expect([w,h]).toEqual([16,16]);
    if(alias==='cursor_aim')expect([w,h]).toEqual([11,11]);
    expect(JSON.stringify(phaser),alias).toContain(alias);
  }
},60000);

test('moss-brass output has no pad frames and is unchanged',async()=>{
  const result=await build({name:'ui-skin',kind:'skin',theme:'moss-brass'});expect(result.ok).toBe(true);
  expect(JSON.stringify(JSON.parse(readFileSync(result.artifacts.uiReport)).skins)).not.toMatch(/pad_|cursor_/);
  expect(sha(result.artifacts.sheet)).toBe('0e6bda808ba67793e8d17e799a4b5cbd94e1d9c1a5fa67c2c3f9cafca76c45ef');
},30000);
