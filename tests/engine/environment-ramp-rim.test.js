// A custom material's ramp may take a fifth colour (`deep`) and its overlay rim may use declared `rimRoles`.
// Four-colour materials without rimRoles stay byte-identical: tests/engine/environment-material-goldens.test.js pins that.
import {test,expect,describe} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID,materialTile,validateCustomMaterial} from '../../server/authoring/environment-materials.js';

const RAMP4=['#7a6a4f','#4e4130','#b09c74','#e8dcae'];
const DEEP='#2a2118';
const RAMP5=[...RAMP4,DEEP];
const patterns=[{kind:'speckle',density:.5},{kind:'clusters',density:.6,tone:'deep'},{kind:'cracks',density:.5}];
const material=(extra={})=>({name:'probe',ramp:RAMP5,patterns,seed:3,...extra});

describe('five-colour ramp',()=>{
  test('a five-colour ramp validates and keeps all five colours',()=>{
    const spec=validateCustomMaterial(material({ramp:RAMP5.map(c=>c.toUpperCase())}),[]);
    expect(spec.ramp).toEqual(RAMP5);
  });
  test('a tile uses at most five distinct opaque colours and uses deep',()=>{
    const spec=validateCustomMaterial(material(),[]);
    let usedDeep=false;
    for(const seed of [7,13])for(let v=0;v<8;v++){
      const colors=new Set(materialTile('probe',spec,v,seed,v));
      expect(colors.size).toBeLessThanOrEqual(5);
      for(const c of colors)expect(RAMP5).toContain(c);
      if(colors.has(DEEP))usedDeep=true;
    }
    expect(usedDeep).toBe(true);
  });
  test('deep is drawn only where a pattern asks for it',()=>{
    const spec=validateCustomMaterial(material({patterns:[{kind:'speckle',density:.5,tone:'mixed'},{kind:'clusters',density:.6,shade:true,size:'large'},{kind:'cracks'},{kind:'streaks'}]}),[]);
    for(let v=0;v<8;v++)expect(new Set(materialTile('probe',spec,v,7,v)).has(DEEP)).toBe(false);
  });
  test('a fifth colour changes nothing when no pattern asks for deep',()=>{
    const noDeep=[{kind:'speckle',density:.5},{kind:'clusters',density:.6,shade:true},{kind:'cracks',density:.5}];
    const four=validateCustomMaterial({name:'probe',ramp:RAMP4,patterns:noDeep,seed:3},[]);
    const five=validateCustomMaterial({name:'probe',ramp:RAMP5,patterns:noDeep,seed:3},[]);
    for(let v=0;v<8;v++)expect(materialTile('probe',five,v,7,v)).toEqual(materialTile('probe',four,v,7,v));
  });
  test('a six-colour ramp is rejected with a message naming ramp',()=>{
    expect(()=>validateCustomMaterial(material({ramp:[...RAMP5,'#000000']}),[])).toThrow(/ramp/);
    expect(()=>validateCustomMaterial(material({ramp:RAMP4.slice(0,3)}),[])).toThrow(/ramp/);
    expect(()=>validateCustomMaterial(material({ramp:[...RAMP4,'nope']}),[])).toThrow(/ramp/);
  });
  test('tone deep without a fifth colour is rejected with a message naming ramp',()=>{
    expect(()=>validateCustomMaterial(material({ramp:RAMP4}),[])).toThrow(/ramp/);
  });
  test('a five-colour material builds through terrain and terrain-overlay',()=>{
    for(const kind of ['terrain','terrain-overlay']){
      const {report}=generateEnvironmentRecipe({kind,materials:['probe'],customMaterials:[material()],variants:2});
      expect(report.customMaterials).toEqual(['probe']);
      expect(report.rimRoles).toBeUndefined();
    }
  });
});

describe('rimRoles',()=>{
  const LIGHT='#ffd9a0',DARK='#150f0a';
  const colorsOf=(config,role='overlay')=>{
    const {operations,report}=generateEnvironmentRecipe(config);
    const cells=new Set(report.frames.filter(f=>f.role===role).map(f=>f.cell));
    const found=new Set();
    for(const op of operations)if(op.command==='draw'&&cells.has(op.cell))found.add(op.color);
    return found;
  };
  const build=(extra,rim=true)=>({kind:'terrain-overlay',materials:['probe'],customMaterials:[material(extra)],variants:2,overlayEdge:{rim}});
  const outside=(colors,allowed)=>[...colors].filter(c=>!allowed.includes(c));

  test('rim pixels use only the two declared colours plus the ramp',()=>{
    const found=colorsOf(build({rimRoles:{light:LIGHT.toUpperCase(),dark:DARK}}));
    expect(outside(found,[LIGHT,DARK,...RAMP5])).toEqual([]);
    expect(found.has(LIGHT)).toBe(true);
    expect(found.has(DARK)).toBe(true);
  });
  test('negative: without rimRoles the derived rim leaves that set, and the check catches it',()=>{
    const found=colorsOf(build({}));
    expect(outside(found,[LIGHT,DARK,...RAMP5]).length).toBeGreaterThan(0);
    expect(outside(found,RAMP5).length).toBeGreaterThan(0); // the derived dark rim is off the ramp
  });
  test('rimRoles is ignored when rim is off',()=>{
    const found=colorsOf(build({rimRoles:{light:LIGHT,dark:DARK}},false));
    expect(outside(found,RAMP5)).toEqual([]);
  });
  test('rimRoles is reported only when present',()=>{
    const withRoles=generateEnvironmentRecipe(build({rimRoles:{light:LIGHT.toUpperCase(),dark:DARK}})).report;
    expect(withRoles.rimRoles).toEqual({probe:{light:LIGHT,dark:DARK}});
    expect('rimRoles' in generateEnvironmentRecipe(build({})).report).toBe(false);
  });
  test('rimRoles does not change the tiles',()=>{
    const a=validateCustomMaterial(material({rimRoles:{light:LIGHT,dark:DARK}}),[]);
    const b=validateCustomMaterial(material(),[]);
    for(let v=0;v<4;v++)expect(materialTile('probe',a,v,7,v)).toEqual(materialTile('probe',b,v,7,v));
    expect(materialTile('probe',a,0,7,0)).toHaveLength(GRID*GRID);
  });
  test('malformed rimRoles are rejected with a message naming rimRoles',()=>{
    for(const bad of ['#fff','red',{light:'#ffd9a0'},{light:'#ffd9a0',dark:'#12'},{light:'#ffd9a0',dark:5},{light:'#ffd9a0',dark:DARK,mid:DARK},[LIGHT,DARK],null])
      expect(()=>validateCustomMaterial(material({rimRoles:bad}),[]),JSON.stringify(bad)).toThrow(/rimRoles/);
  });
});
