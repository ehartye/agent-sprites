import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {HUD_ICONS,HUD_ICON_NAMES} from '../../server/authoring/ui-hud.js';

let dir,path,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-wasteland-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const build=async ui=>{config.ui=ui;writeFileSync(path,JSON.stringify(config));return buildProject(path);};
const readPng=async file=>{const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,info};};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

test('the default moss-brass skin and fonts are byte-identical to the pre-wasteland build',async()=>{
  const skin=await build({name:'ui-skin',kind:'skin',theme:'moss-brass'});expect(skin.ok).toBe(true);
  expect(sha(skin.artifacts.sheet)).toBe('c7cae4190ed59e13a2c1ee9dde11995ee39851bac75eb5f3c6ae97fff293bf2d');
  const font=await build({name:'ui-font',kind:'font',theme:'moss-brass'});expect(font.ok).toBe(true);
  expect(sha(font.artifacts.sheet)).toBe('9077002a85077dc8d1ad388d55e33f4b17f85291bfd7c9b37cd8e2970bd63bfe');
},30000);

test('the wasteland skin adds meters, a hollow minimap frame, tabs and colour HUD icons with metrics',async()=>{
  const result=await build({name:'ui-skin',kind:'skin',theme:'wasteland'});expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const report=JSON.parse(readFileSync(result.artifacts.uiReport));expect(report.theme).toBe('wasteland');
  for(const alias of ['panel_dark','slot_selected','progress_fill','meter_track','meter_fill_hunger','meter_fill_thirst','meter_fill_health','meter_fill_danger','meter_fill_rad','minimap_frame','tab_selected',...HUD_ICON_NAMES.map(n=>`hud_${n}`)])expect(report.skins[alias],alias).toBeDefined();
  expect(report.skins.meter_track.content).toEqual({x:0,y:10,w:24,h:4});expect(report.skins.minimap_frame.hollow).toBe(true);expect(report.skins.minimap_frame.insets.left).toBe(5);expect(report.skins.hud_hunger.color).toBe(true);
  expect(HUD_ICON_NAMES).toEqual(expect.arrayContaining(['hunger','thirst','health','weight','clock','weather_clear','weather_dust','weather_rain','weather_acid-rain','weather_rad-storm','weather_heat']));
  // hollow means hollow: the middle of the minimap frame is transparent in the exported sheet
  const atlas=JSON.parse(readFileSync(result.artifacts.atlas)),f=atlas.frames.find(x=>x.filename==='minimap_frame').frame,png=await readPng(result.artifacts.sheet);
  const alpha=(x,y)=>png.data[((f.y+y)*png.info.width+f.x+x)*4+3];expect(alpha(12,12)).toBe(0);expect(alpha(5,12)).toBe(0);expect(alpha(0,12)).toBe(255);expect(alpha(2,12)).toBe(255);expect(alpha(12,2)).toBe(255);
},30000);

test('every HUD icon is 12x12, uses only declared keys and has a visible silhouette',()=>{
  for(const [name,icon] of Object.entries(HUD_ICONS)){
    expect(icon.rows.length,name).toBe(12);
    for(const r of icon.rows){expect(r.length,name).toBe(12);for(const ch of r)if(ch!=='.')expect(icon.colors[ch],`${name} key ${ch}`).toBeTruthy();}
    expect(icon.rows.join('').replace(/\./g,'').length,name).toBeGreaterThan(40);
  }
});

test('wasteland fonts keep the glyph frames and tones and use the theme colours',async()=>{
  const result=await build({name:'ui-font',kind:'font',theme:'wasteland',characters:'Aa?'});expect(result.ok).toBe(true);
  const report=JSON.parse(readFileSync(result.artifacts.uiReport));expect(report.colors.cream).toBe('#f6edcf');expect(report.glyphs.A.frames.gold).toBe('glyph_0041_gold');
  expect((await build({name:'ui-font',kind:'font',theme:'sunset'})).ok).toBe(false);
},30000);
