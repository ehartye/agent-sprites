import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {generateUIRecipe} from '../../server/authoring/ui.js';
import {displayGlyph,displayRamp} from '../../server/authoring/ui-display.js';

const TONES=['cream','muted','gold','ink'];
let dir,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-display-ramps-'));config={version:1,output:'dist',scale:1,trim:false};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex=(data,i)=>'#'+[0,1,2].map(k=>data[i+k].toString(16).padStart(2,'0')).join('');
// Builds before the next build reuses the output folder, so everything is read here.
async function build(ui){
  const path=join(dir,'sprite-project.json');writeFileSync(path,JSON.stringify({...config,ui}));
  const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const sheet=readFileSync(result.artifacts.sheet),{data,info}=await sharp(sheet).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {sheet,data,info,report:json(result.artifacts.uiReport),atlas:json(result.artifacts.atlas)};
}
const cellOf=(built,char,tone)=>built.atlas.frames.find(f=>f.filename===built.report.glyphs[char].frames[tone]).frame;
const pixel=(built,cell,x,y)=>{const i=((cell.y+y)*built.info.width+cell.x+x)*4;return built.data[i+3]?hex(built.data,i):null;};
const census=(built,tone)=>{
  const colours=new Set();
  for(const char of Object.keys(built.report.glyphs)){
    if(char===' ')continue;
    const cell=cellOf(built,char,tone);
    for(let y=0;y<cell.h;y++)for(let x=0;x<cell.w;x++){const c=pixel(built,cell,x,y);if(c)colours.add(c);}
  }
  return colours;
};
const ui={name:'ui-font',kind:'font',face:'display',characters:'A?'};
const STEPS={
  cream:{highlight:'#ffe0e0',shade:'#802020',outline:'#102030',shadow:'#304050'},
  muted:{highlight:'#e0ffe0',shade:'#208020',outline:'#112233',shadow:'#334455'},
  gold:{highlight:'#e0e0ff',shade:'#202080',outline:'#122334',shadow:'#445566'},
  ink:{highlight:'#fffbe0',shade:'#807020',outline:'#132435',shadow:'#556677'},
};

test('declared steps for all four tones are the only non-face colours on the sheet',async()=>{
  const base=await build(ui);
  const custom=await build({...ui,displayRamps:STEPS});
  for(const tone of TONES){
    const face=custom.report.colors[tone],s=STEPS[tone];
    expect([...census(custom,tone)].sort()).toEqual([face,s.highlight,s.shade,s.outline,s.shadow].sort());
    expect(custom.report.displayRamps[tone]).toEqual({...s,face});
  }
  // None of the colours the derivation produced for the steps survives anywhere on the sheet.
  const all=new Set(TONES.flatMap(tone=>[...census(custom,tone)]));
  for(const tone of TONES){const r=displayRamp(tone,base.report.colors);for(const step of ['h','s','o'])expect(all.has(r[step]),`${tone}.${step}`).toBe(false);}
});

test('a single highlight step keeps every other derived colour',async()=>{
  const base=await build(ui);
  const custom=await build({...ui,displayRamps:{cream:{highlight:'#fedcba'}}});
  const r=displayRamp('cream',base.report.colors);
  expect([...census(custom,'cream')].sort()).toEqual([r.f,r.o,r.s,'#fedcba'].sort());
  for(const tone of ['muted','gold','ink'])expect([...census(custom,tone)].sort()).toEqual([...census(base,tone)].sort());
  expect(custom.report.displayRamps.cream).toEqual({highlight:'#fedcba',face:r.f,shade:r.s,outline:r.o,shadow:r.o});
  expect(custom.report.displayRamps.ink.highlight).toBe(displayRamp('ink',base.report.colors).h);
});

test('outline and shadow paint exactly their own cells and the shadow follows the outline when omitted',async()=>{
  const base=await build(ui);
  const outline='#112233',shadow='#445566';
  const custom=await build({...ui,displayRamps:{cream:{outline,shadow}}});
  const defaults=displayRamp('cream',base.report.colors);
  for(const char of ['A','?']){
    const grid=displayGlyph(char),after=cellOf(custom,char,'cream'),before=cellOf(base,char,'cream');
    let shadowCells=0,outlineCells=0;
    grid.forEach((row,y)=>[...row].forEach((key,x)=>{
      const was=pixel(base,before,x,y),now=pixel(custom,after,x,y);
      if(key==='d'){shadowCells++;expect(was).toBe(defaults.o);expect(now).toBe(shadow);}
      else if(key==='o'){outlineCells++;expect(was).toBe(defaults.o);expect(now).toBe(outline);}
      else if(key==='.'){expect(now).toBeNull();}
      else expect(now).toBe(was);
    }));
    expect(shadowCells).toBeGreaterThan(0);expect(outlineCells).toBeGreaterThan(0);
  }
  // Shadow omitted: the drop shadow takes the outline colour, so a new outline recolours both.
  const follow=await build({...ui,displayRamps:{cream:{outline}}});
  for(const char of ['A','?']){
    const cell=cellOf(follow,char,'cream');
    displayGlyph(char).forEach((row,y)=>[...row].forEach((key,x)=>{if(key==='o'||key==='d')expect(pixel(follow,cell,x,y)).toBe(outline);}));
  }
  expect(follow.report.displayRamps.cream.shadow).toBe(outline);
  // Declaring the derived highlight, shade and outline with no shadow reproduces the default sheet byte for byte.
  const same=await build({...ui,displayRamps:Object.fromEntries(TONES.map(tone=>{const r=displayRamp(tone,base.report.colors);return [tone,{highlight:r.h,shade:r.s,outline:r.o}];}))});
  expect(Buffer.compare(same.sheet,base.sheet)).toBe(0);
});

test('without displayRamps the display and font recipes and reports are unchanged and carry no displayRamps',()=>{
  const pins={display:'4f5bd54763adf3d3512e8e673ab3097630629a28da12d3f0df5ddd52ffb98e6a',font:'d175d718609b18feee933cf4beabec783ae1977372bceaab16c29a6236e75025'};
  const display=generateUIRecipe({kind:'font',face:'display'}),font=generateUIRecipe({kind:'font'});
  expect(hash(display)).toBe(pins.display);expect(hash(font)).toBe(pins.font);
  expect('displayRamps' in display.report).toBe(false);expect('displayRamps' in font.report).toBe(false);
  expect(Object.keys(generateUIRecipe({...ui,displayRamps:{}}).report)).toContain('displayRamps');
});

test.each([
  ['a malformed hex step',{kind:'font',face:'display',displayRamps:{cream:{highlight:'red'}}},/displayRamps\.cream\.highlight/],
  ['a short hex step',{kind:'font',face:'display',displayRamps:{gold:{shadow:'#fff'}}},/displayRamps\.gold\.shadow/],
  ['a non-string step',{kind:'font',face:'display',displayRamps:{ink:{outline:7}}},/displayRamps\.ink\.outline/],
  ['an unknown tone',{kind:'font',face:'display',displayRamps:{rare:{highlight:'#ffffff'}}},/displayRamps.*rare/],
  ['an unknown step name',{kind:'font',face:'display',displayRamps:{cream:{glow:'#ffffff'}}},/displayRamps\.cream\.glow/],
  ['a tone that is not a step map',{kind:'font',face:'display',displayRamps:{cream:'#ffffff'}},/displayRamps\.cream/],
  ['a map that is not an object',{kind:'font',face:'display',displayRamps:[]},/displayRamps/],
  ['a regular face',{kind:'font',displayRamps:{cream:{highlight:'#ffffff'}}},/displayRamps/],
  ['a compact face',{kind:'font',face:'compact',displayRamps:{cream:{highlight:'#ffffff'}}},/displayRamps/],
  ['a skin',{kind:'skin',displayRamps:{cream:{highlight:'#ffffff'}}},/displayRamps/],
  ['a logo',{kind:'logo',displayRamps:{cream:{highlight:'#ffffff'}}},/displayRamps/],
])('rejects %s by naming displayRamps',(_,recipe,message)=>{
  expect(()=>generateUIRecipe(recipe)).toThrow(message);
});

test('the build still rejects a corrupted display pixel and checks it against the declared steps',async()=>{
  const generated=generateUIRecipe({...ui,displayRamps:STEPS}),cell=generated.report.frames.find(f=>f.alias===generated.report.glyphs.A.frames.cream).cell;
  const generator=join(dir,'generate.mjs'),path=join(dir,'sprite-project.json');
  writeFileSync(path,JSON.stringify({...config,generator:'generate.mjs'}));
  const attempt=async recipe=>{writeFileSync(generator,`console.log(${JSON.stringify(JSON.stringify(recipe))});`);return buildProject(path);};
  expect((await attempt(generated)).ok).toBe(true);
  const bad=structuredClone(generated),operation=bad.operations.find(op=>op.command==='draw'&&op.cell===cell&&op.color===STEPS.cream.shadow);
  expect(operation).toBeDefined();operation.color='#ff00ff';
  const result=await attempt(bad);expect(result.ok).toBe(false);expect(result.errors[0].message).toMatch(/^UI font tone pixels differ: cream/);
  // A report that drops the declared steps falls back to the derived ramp and rejects the custom pixels.
  const stripped=structuredClone(generated);delete stripped.report.displayRamps;
  const fallback=await attempt(stripped);expect(fallback.ok).toBe(false);expect(fallback.errors[0].message).toMatch(/UI font tone pixels differ/);
},60000);
