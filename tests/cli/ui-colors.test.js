import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {generateUIRecipe,UI_THEMES,UI_COLOR_ROLES} from '../../server/authoring/ui.js';

let dir,path,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-colors-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const build=async ui=>{config.ui=ui;writeFileSync(path,JSON.stringify(config));const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);return result;};
// Both builds write to the same output folder, so read everything from the first before the second runs.
const snapshot=async ui=>{const result=await build(ui);return {result,report:json(result.artifacts.uiReport),atlas:json(result.artifacts.atlas),png:await readPng(result.artifacts.sheet)};};
const readPng=async file=>{const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,info};};
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const GOLD='#3a7bd5',BASE=UI_THEMES.wasteland;

test('without colors both themes produce the same recipes as before roles became configurable',()=>{
  const pins={
    'moss-brass':{skin:'55b098168355e6a4c10e9cdf1c9a99c85f4b4f98f05af21f5003e591c2c95c1c',font:'d175d718609b18feee933cf4beabec783ae1977372bceaab16c29a6236e75025',compact:'2849008f56a038288e8f12f0b0491d971a9165563a43542163fedeb89e3a9335',display:'4f5bd54763adf3d3512e8e673ab3097630629a28da12d3f0df5ddd52ffb98e6a',logo:'3dfb7866979b22c3bce932ef776d680e0aa337b3daab6670f1d875e1ed4f899c'},
    wasteland:{skin:'6b313fee0aec8447b29f09efd9d2d3b807417687c463003316b73770d72f1953',font:'03af4e7f84523924c5a802d535766037d31eb174303f112d5e406f546ed634e0',compact:'381d4108c60a03ef4b69d5022b5b7fce3f61d18657ef42794d8c762f8daf1c60',display:'c5d78123f766913a9d5d330e7c44527b7ff930382bcbf2d4cc0e38dcd6e2ccd7',logo:'e863d4c75fa6757c5c50497dffc85ce49e24ffff0924e813c3e6c54cf2fafdc2'},
  };
  const kinds={skin:{kind:'skin'},font:{kind:'font'},compact:{kind:'font',face:'compact'},display:{kind:'font',face:'display'},logo:{kind:'logo'}};
  for(const [theme,expected] of Object.entries(pins)){
    const actual=Object.fromEntries(Object.entries(kinds).map(([key,recipe])=>[key,hash(generateUIRecipe({...recipe,theme}))]));
    expect(actual,theme).toEqual(expected);
  }
});

test('a gold override recolours only the gold pixels and leaves the pad, HUD and symbol frames byte-identical',async()=>{
  const base=await snapshot({name:'ui-skin',kind:'skin',theme:'wasteland'});
  const over=await snapshot({name:'ui-skin',kind:'skin',theme:'wasteland',colors:{gold:GOLD}});
  const report=over.report;
  expect(Object.keys(report.colors)).toEqual(UI_COLOR_ROLES);expect(UI_COLOR_ROLES).toHaveLength(16);
  expect(report.colors).toEqual({...BASE,gold:GOLD});expect(report.colorOverrides).toEqual(['gold']);expect(report.theme).toBe('wasteland');
  expect(base.report.colors).toEqual(BASE);expect(base.report.colorOverrides).toBeUndefined();
  const a=base.png,b=over.png;
  expect(b.info).toEqual(a.info);
  const atlasA=base.atlas,atlasB=over.atlas;
  expect(atlasB.frames.map(f=>[f.filename,f.frame])).toEqual(atlasA.frames.map(f=>[f.filename,f.frame]));
  const baseGold=rgb(BASE.gold),newGold=rgb(GOLD);let changed=0;
  for(let i=0;i<a.data.length;i+=4){
    const before=[...a.data.slice(i,i+4)],after=[...b.data.slice(i,i+4)];
    if(before.every((n,k)=>n===after[k]))continue;
    changed++;expect(before.slice(0,3)).toEqual(baseGold);expect(after.slice(0,3)).toEqual(newGold);expect(after[3]).toBe(before[3]);
  }
  expect(changed).toBeGreaterThan(0);
  // The fixed-colour families do not follow the roles: their frames are identical pixel for pixel.
  const fixed=atlasA.frames.filter(f=>/^(pad_|hud_|sym_)/.test(f.filename));
  expect(fixed.filter(f=>f.filename.startsWith('pad_'))).toHaveLength(88);
  for(const f of fixed)for(let y=0;y<f.frame.h;y++){
    const start=((f.frame.y+y)*a.info.width+f.frame.x)*4,end=start+f.frame.w*4;
    expect(Buffer.compare(a.data.subarray(start,end),b.data.subarray(start,end)),f.filename).toBe(0);
  }
  // Role-based frames do change.
  const tab=atlasA.frames.find(f=>f.filename==='tab_selected').frame;let tabChanged=0;
  for(let y=0;y<tab.h;y++)for(let x=0;x<tab.w;x++){const i=((tab.y+y)*a.info.width+tab.x+x)*4;if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2])tabChanged++;}
  expect(tabChanged).toBeGreaterThan(0);
},60000);

test('a gold override on the display face still passes the build display-ramp validation',async()=>{
  const result=await build({name:'ui-font',kind:'font',theme:'wasteland',face:'display',characters:'Aa?',colors:{gold:GOLD,shadow:'#101820'}});
  const report=json(result.artifacts.uiReport);expect(report.colorOverrides).toEqual(['gold','shadow']);expect(report.colors.gold).toBe(GOLD);
  // The ramp the validator allows comes from report.colors, so a changed role moves the glyph pixels and the allowed ramp together.
  const png=await readPng(result.artifacts.sheet),atlas=json(result.artifacts.atlas),cell=atlas.frames.find(f=>f.filename===report.glyphs.A.frames.gold).frame;
  let faceGold=0;
  for(let y=0;y<cell.h;y++)for(let x=0;x<cell.w;x++){const i=((cell.y+y)*png.info.width+cell.x+x)*4;if(png.data[i+3]&&[...png.data.slice(i,i+3)].join()===rgb(GOLD).join())faceGold++;}
  expect(faceGold).toBeGreaterThan(0);
},60000);

test('regular fonts and logos follow the overridden roles and keep the base theme frame set',async()=>{
  const font=await build({name:'ui-font',kind:'font',theme:'moss-brass',characters:'A?',colors:{cream:'#ffffff'}});
  expect(json(font.artifacts.uiReport).colors.cream).toBe('#ffffff');
  const logo=await build({name:'ui-logo',kind:'logo',theme:'wasteland',colors:{gold:GOLD}});
  expect(json(logo.artifacts.uiReport).colorOverrides).toEqual(['gold']);
  // moss-brass keeps its 50 frames: colours never switch the frame set to the controller prompts.
  expect(generateUIRecipe({kind:'skin',colors:{gold:GOLD}}).report.frames).toHaveLength(50);
  expect(generateUIRecipe({kind:'skin',theme:'wasteland',colors:{gold:GOLD}}).report.frames).toHaveLength(generateUIRecipe({kind:'skin',theme:'wasteland'}).report.frames.length);
  // Valid upper-case hex is normalised; an empty map overrides nothing.
  expect(generateUIRecipe({kind:'font',colors:{gold:'#ABCDEF'}}).report.colors.gold).toBe('#abcdef');
  const none=generateUIRecipe({kind:'font',colors:{}});expect(none.report.colorOverrides).toEqual([]);expect(none.report.colors).toEqual(UI_THEMES['moss-brass']);
},60000);

test.each([
  ['an unknown role name',{nope:'#ffffff'},/nope/],
  ['a malformed hex value',{gold:'gold'},/gold.*#rrggbb/],
  ['a short hex value',{ink:'#fff'},/ink.*#rrggbb/],
  ['a non-string value',{moss:12},/moss/],
  ['cream equal to ink',{cream:BASE.ink},/cream and ink/],
  ['gold equal to muted',{gold:BASE.muted},/muted and gold|gold and muted/],
  ['two overrides to one colour',{cream:'#123456',muted:'#123456'},/cream and muted/],
])('rejects %s by naming the role',(_,colors,message)=>{
  expect(()=>generateUIRecipe({kind:'skin',theme:'wasteland',colors})).toThrow(message);
  expect(()=>generateUIRecipe({kind:'logo',theme:'wasteland',colors})).toThrow(message);
});

test.each([null,[],'#ffffff',7])('rejects colors that is not a map: %j',colors=>{
  expect(()=>generateUIRecipe({kind:'font',colors})).toThrow(/colors/);
});

test('an unknown theme still fails and a build with a bad colours map fails with the role named',async()=>{
  expect(()=>generateUIRecipe({kind:'font',theme:'mine',colors:{gold:GOLD}})).toThrow(/theme/);
  config.ui={name:'ui-font',kind:'font',theme:'wasteland',colors:{nope:'#ffffff'}};writeFileSync(path,JSON.stringify(config));
  const result=await buildProject(path);expect(result.ok).toBe(false);expect(JSON.stringify(result.errors)).toMatch(/nope/);
},30000);
