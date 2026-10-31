// Golden hashes for the pixel-grid terrain materials: built-in wasteland set, overlays with rim, the animated water material,
// and custom materials across every pattern kind. A byte change in any default output of these options fails here.
// The fixture is a flat map from a case name to a sha256. To regenerate it after a deliberate, reviewed change:
//   UPDATE_GOLDENS=1 npx vitest run tests/engine/environment-material-goldens.test.js
import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {PATTERN_KINDS,WASTELAND_SPECS,WASTELAND_MATERIALS,materialTile,validateCustomMaterial} from '../../server/authoring/environment-materials.js';

const FIXTURE=new URL('./fixtures/environment-material-hashes.json',import.meta.url);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const recipe=config=>sha(generateEnvironmentRecipe(config));

const cases=new Map();
const add=(name,compute)=>{if(cases.has(name))throw Error(`duplicate golden case ${name}`);cases.set(name,compute);};

// --- Built-in materials: the raw tiles, then the terrain and overlay forms ---------------------------------------------------
for(const m of WASTELAND_MATERIALS){
  add(`builtin-tile/${m}`,()=>sha([7,13].map(seed=>Array.from({length:8},(_,v)=>materialTile(m,WASTELAND_SPECS[m],v,seed,v%4)))));
  add(`builtin-terrain/${m}`,()=>recipe({kind:'terrain',materials:[m]}));
  add(`builtin-overlay/${m}`,()=>recipe({kind:'terrain-overlay',materials:[m]}));
  add(`builtin-overlay-rim/${m}`,()=>recipe({kind:'terrain-overlay',materials:[m],overlayEdge:{rim:true}}));
}
add('builtin-terrain-all/scale1-seed7',()=>recipe({kind:'terrain',materials:WASTELAND_MATERIALS}));
add('builtin-terrain-all/scale2-seed9-v2',()=>recipe({kind:'terrain',materials:WASTELAND_MATERIALS,variants:2,pixelScale:2,seed:9}));
add('builtin-terrain-all/scale2-v1',()=>recipe({kind:'terrain',materials:WASTELAND_MATERIALS,variants:1,pixelScale:2}));
add('builtin-overlay-all/default',()=>recipe({kind:'terrain-overlay'}));
add('builtin-overlay-all/rim-scale2-v3',()=>recipe({kind:'terrain-overlay',variants:3,pixelScale:2,overlayEdge:{rim:true}}));
add('builtin-overlay-rim/dust-gravel-soft-round-shade',()=>recipe({kind:'terrain-overlay',materials:['dust','gravel'],pixelScale:2,overlayEdge:{rim:true,soft:true,round:2,shade:{width:2,dir:'all'}}}));
add('builtin-overlay-rim/mud-clay-nobase-masks',()=>recipe({kind:'terrain-overlay',materials:['mud','clay'],base:false,overlays:{masks:[1,2,4,5,17,21]},overlayEdge:{rim:true,round:1}}));
add('builtin-overlay-rim/seed3-asphalt-concrete',()=>recipe({kind:'terrain-overlay',materials:['asphalt','concrete','slag'],variants:4,seed:3,overlayEdge:{rim:true}}));

// --- Water: the animated material, every frame --------------------------------------------------------------------------------
add('water/terrain-frames',()=>recipe({kind:'terrain',materials:['water']}));
add('water/terrain-frames-scale2-seed2',()=>recipe({kind:'terrain',materials:['dust','water'],variants:2,pixelScale:2,seed:2}));
add('water/tile-frames',()=>sha([7,11,29].map(seed=>[0,1,2,3].map(frame=>materialTile('water',WASTELAND_SPECS.water,0,seed,frame)))));
add('water/overlay-plain',()=>recipe({kind:'terrain-overlay',materials:['water']}));
add('water/overlay-rim-animate',()=>recipe({kind:'terrain-overlay',materials:['water'],variants:1,overlayEdge:{rim:true,animate:true}}));
add('water/overlay-rim-animate-v2-scale2',()=>recipe({kind:'terrain-overlay',materials:['water','sand'],variants:2,pixelScale:2,overlayEdge:{rim:true,animate:['water'],soft:['water']}}));
add('water/overlay-animate-only',()=>recipe({kind:'terrain-overlay',materials:['water','mud'],variants:3,overlayEdge:{animate:true}}));

// --- Custom materials: one case per pattern shape, as raw tiles ----------------------------------------------------------------
const RAMP=['#7a6a4f','#4e4130','#b09c74','#e8dcae'];
const patternCases={
  speckle:[{kind:'speckle'},{kind:'speckle',density:.05},{kind:'speckle',density:1,tone:'dark'},{kind:'speckle',density:.5,tone:'light'},{kind:'speckle',density:.7,tone:'bright'},{kind:'speckle',density:.3,tone:'mixed'},{kind:'speckle',density:.6,variants:[1,3]}],
  clusters:[{kind:'clusters'},{kind:'clusters',density:.05},{kind:'clusters',density:1,tone:'dark'},{kind:'clusters',density:.5,size:'large'},{kind:'clusters',density:.5,size:'small',shade:true},{kind:'clusters',density:.9,size:'large',shade:true,tone:'bright'},{kind:'clusters',density:.4,tone:'light',variants:[0,2]}],
  cracks:[{kind:'cracks'},{kind:'cracks',density:.05},{kind:'cracks',density:.5},{kind:'cracks',density:1},{kind:'cracks',density:.8,variants:[1,2]}],
  panels:[{kind:'panels'},{kind:'panels',cols:1},{kind:'panels',cols:2}],
  ripples:[{kind:'ripples'},{kind:'ripples',density:.05},{kind:'ripples',density:.5},{kind:'ripples',density:1},{kind:'ripples',density:.8,variants:[0,3]}],
  furrows:[{kind:'furrows'},{kind:'furrows',density:.05},{kind:'furrows',density:1}],
  polygons:[{kind:'polygons'},{kind:'polygons',density:.05},{kind:'polygons',density:.5},{kind:'polygons',density:1},{kind:'polygons',density:.7,variants:[0,1]}],
  bubbles:[{kind:'bubbles'},{kind:'bubbles',density:.05},{kind:'bubbles',density:1},{kind:'bubbles',density:.6,variants:[2]}],
  streaks:[{kind:'streaks'},{kind:'streaks',density:.05},{kind:'streaks',density:1,tone:'dark'},{kind:'streaks',density:.5,tone:'light'},{kind:'streaks',density:.7,tone:'bright'},{kind:'streaks',density:.3,tone:'mixed'},{kind:'streaks',density:.6,variants:[1,2,3]}],
  stripe:[{kind:'stripe'},{kind:'stripe',color:'#ff3366'},{kind:'stripe',color:'#2288CC',variants:[3]},{kind:'stripe',variants:[0,2]}],
};
test('the pattern matrix covers every pattern kind',()=>expect(Object.keys(patternCases).sort()).toEqual([...PATTERN_KINDS].sort()));
const customSpec=(patterns,extra={})=>validateCustomMaterial({name:'probe',ramp:RAMP,patterns,...extra},[]);
for(const [kind,list] of Object.entries(patternCases))list.forEach((pattern,i)=>{
  const label=`custom-tile/${kind}-${i}`;
  // two environment seeds, two material seeds, variants 0..7 (terrain uses 1..4, overlays up to 8)
  add(label,()=>sha([7,13].flatMap(seed=>[0,5].map(materialSeed=>{
    const spec=customSpec([pattern],{seed:materialSeed});
    return Array.from({length:8},(_,v)=>materialTile('probe',spec,v,seed,v));
  }))));
});
// animated ripples: every frame, at several seeds and densities
for(const density of [.05,.5,1])add(`custom-tile/ripples-animated-${density}`,()=>sha([7,13].flatMap(seed=>[0,9].map(materialSeed=>{
  const spec=customSpec([{kind:'ripples',density},{kind:'speckle',density:.2,tone:'dark'}],{animated:true,fps:5,seed:materialSeed});
  return [0,1,2,3].map(frame=>materialTile('probe',spec,0,seed,frame));
}))));
// the same tiles under another ramp, name and uppercase hex (normalised to lowercase), which changes colours and the name salt
add('custom-tile/name-and-ramp-sensitivity',()=>{
  const spec=validateCustomMaterial({name:'other-name',ramp:['#112233','#AABBCC','#ddeeff','#00FF00'],patterns:[{kind:'clusters',density:.6,shade:true},{kind:'cracks',density:.4},{kind:'stripe',color:'#FFAA00'}],seed:-77},[]);
  return sha([7,99].map(seed=>Array.from({length:8},(_,v)=>materialTile('other-name',spec,v,seed,v))));
});
add('custom-tile/validated-shape',()=>sha(validateCustomMaterial({name:'shape',ramp:['#ABCDEF','#123456','#FEDCBA','#654321'],patterns:[{kind:'stripe',color:'#ABCDEF'},{kind:'speckle'}]},[])));

// --- Custom materials through the recipe: terrain and overlay, the four-colour ramp ------------------------------------------------
const bone={name:'bone-field',ramp:['#c8c0a8','#a8a088','#e0d8c0','#f4eed8'],patterns:[{kind:'speckle',density:.4},{kind:'cracks',density:.5},{kind:'clusters',size:'large',shade:true}],seed:3};
const plate={name:'slate-plate',ramp:['#4a5560','#2c343c','#6e7c8a','#b8d0e0'],patterns:[{kind:'panels',cols:2},{kind:'streaks',density:.8,tone:'dark'},{kind:'stripe',color:'#E0B020',variants:[0,2]},{kind:'polygons',density:.4}]};
const pond={name:'glow-pond',ramp:['#2a4a5a','#1a3040','#3f7a8a','#9be8d0'],patterns:[{kind:'ripples',density:.9},{kind:'bubbles',density:.3},{kind:'speckle',density:.15,tone:'bright'}],animated:true,fps:6,seed:12345};
const rut={name:'rut-field',ramp:['#6e5a3a','#4a3a24','#90784c','#d0b878'],patterns:[{kind:'furrows',density:.3},{kind:'clusters',density:.05,tone:'light'},{kind:'cracks',density:1,variants:[1,3]}],seed:-5};
const customs=[bone,plate,pond,rut];
for(const c of customs){
  for(const variants of [1,2,3,4])add(`custom-terrain/${c.name}-v${variants}`,()=>recipe({kind:'terrain',materials:[c.name],customMaterials:[c],variants}));
  add(`custom-terrain/${c.name}-scale2-seed4`,()=>recipe({kind:'terrain',materials:['dust',c.name],customMaterials:[c],pixelScale:2,seed:4}));
  for(const variants of [1,2,3])add(`custom-overlay/${c.name}-v${variants}`,()=>recipe({kind:'terrain-overlay',materials:[c.name],customMaterials:[c],variants}));
  add(`custom-overlay-rim/${c.name}-v3-scale2`,()=>recipe({kind:'terrain-overlay',materials:[c.name],customMaterials:[c],variants:3,pixelScale:2,overlayEdge:{rim:true}}));
}
add('custom-overlay-rim/pond-animate',()=>recipe({kind:'terrain-overlay',materials:['glow-pond'],customMaterials:[pond],variants:2,overlayEdge:{rim:true,animate:true}}));
add('custom-overlay-rim/all-customs-with-builtins',()=>recipe({kind:'terrain-overlay',materials:['water','gravel',...customs.map(c=>c.name)],customMaterials:customs,variants:2,seed:11,overlayEdge:{rim:true,soft:true,round:3,shade:true,animate:true}}));
add('custom-terrain/all-customs-with-builtins',()=>recipe({kind:'terrain',materials:['water','gravel',...customs.map(c=>c.name)],customMaterials:customs,variants:3,seed:21}));
add('custom-terrain/default-materials-with-customs',()=>recipe({kind:'terrain',customMaterials:[bone]}));
add('custom-overlay/world-edge-bone',()=>recipe({kind:'terrain-overlay',materials:['bone-field','dust'],customMaterials:[bone],overlayEdge:{rim:true,world:{levels:2,flavours:1}}}));

// --- Golden file --------------------------------------------------------------------------------------------------------------
if(process.env.UPDATE_GOLDENS==='1'){
  const next=Object.fromEntries([...cases].map(([name,compute])=>[name,compute()]));
  writeFileSync(FIXTURE,JSON.stringify(next,null,1)+'\n');
  console.log(`UPDATE_GOLDENS: wrote ${Object.keys(next).length} hashes to tests/engine/fixtures/environment-material-hashes.json`);
}
const golden=JSON.parse(readFileSync(FIXTURE,'utf8'));

describe('material output is byte-identical',()=>{
  test('the fixture lists exactly the cases the test computes',()=>expect(Object.keys(golden).sort()).toEqual([...cases.keys()].sort()));
  test.each([...cases.keys()])('%s',name=>expect(cases.get(name)()).toBe(golden[name]));
});
