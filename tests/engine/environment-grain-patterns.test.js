// `grain` (the edge-ring marks of a custom material) and the bedding, crystals and sheen pattern kinds.
// Materials that omit both stay byte-identical: tests/engine/environment-material-goldens.test.js pins that, and the first
// cases below re-derive a few of its hashes with `grain: 'lattice'` written out.
import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID,PATTERN_KINDS,ALL_PATTERN_KINDS,materialTile,validateCustomMaterial} from '../../server/authoring/environment-materials.js';

const golden=JSON.parse(readFileSync(new URL('./fixtures/environment-material-hashes.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const RAMP=['#7a6a4f','#4e4130','#b09c74','#e8dcae'],[BASE,DARK,LIGHT,BRIGHT]=RAMP;
const spec=(patterns,extra={})=>validateCustomMaterial({name:'probe',ramp:RAMP,patterns,...extra},[]);
const tile=(s,v,seed=7)=>materialTile('probe',s,v,seed,v);
const at=(t,x,y)=>t[y*GRID+x];
const onRing=(x,y)=>x===0||y===0||x===GRID-1||y===GRID-1;
const cells=()=>Array.from({length:GRID*GRID},(_,i)=>[i%GRID,Math.floor(i/GRID)]);
const ring=t=>cells().filter(([x,y])=>onRing(x,y)&&at(t,x,y)!==BASE).map(([x,y])=>`${x},${y}`);
/** Positions of every interior pixel that is not the base fill. */
const marks=t=>new Set(cells().filter(([x,y])=>!onRing(x,y)&&at(t,x,y)!==BASE).map(([x,y])=>`${x},${y}`));
/** 8-connected components of pixels of one colour, as lists of [x,y]. */
function components(t,color){
  const seen=new Set(),out=[];
  for(const [x0,y0] of cells()){
    if(at(t,x0,y0)!==color||seen.has(`${x0},${y0}`))continue;
    const part=[],stack=[[x0,y0]];seen.add(`${x0},${y0}`);
    while(stack.length){
      const [x,y]=stack.pop();part.push([x,y]);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
        if(nx<0||ny<0||nx>=GRID||ny>=GRID||seen.has(key)||at(t,nx,ny)!==color)continue;
        seen.add(key);stack.push([nx,ny]);
      }
    }
    out.push(part);
  }
  return out;
}
const range=values=>Math.max(...values)-Math.min(...values)+1;
/** Thickness of a pixel run along its thinnest of four directions: 1 is a one pixel line. */
const thickness=part=>Math.min(range(part.map(([,y])=>y)),range(part.map(([x])=>x)),range(part.map(([x,y])=>x-y)),range(part.map(([x,y])=>x+y)));
const sharedFraction=(a,b)=>[...a].filter(k=>b.has(k)).length/Math.min(a.size,b.size);
const longestRun=(t,color)=>{
  let best=0;
  for(let y=1;y<GRID-1;y++){let run=0;for(let x=1;x<GRID-1;x++){run=at(t,x,y)===color?run+1:0;best=Math.max(best,run);}}
  return best;
};
const SEEDS=[1,7,13,29,101];

describe('grain: lattice is the default and the existing bytes',()=>{
  const cases={'speckle-0':[{kind:'speckle'}],'clusters-0':[{kind:'clusters'}],'cracks-0':[{kind:'cracks'}],'ripples-0':[{kind:'ripples'}],'streaks-0':[{kind:'streaks'}]};
  for(const [name,patterns] of Object.entries(cases))test(`${name}: lattice and omitted grain equal the golden`,()=>{
    const hashOf=extra=>sha([7,13].flatMap(seed=>[0,5].map(materialSeed=>{
      const s=spec(patterns,{seed:materialSeed,...extra});
      return Array.from({length:8},(_,v)=>materialTile('probe',s,v,seed,v));
    })));
    expect(hashOf({})).toBe(golden[`custom-tile/${name}`]);
    expect(hashOf({grain:'lattice'})).toBe(golden[`custom-tile/${name}`]);
  });
  test('a recipe with grain lattice equals the golden recipe of the same material',()=>{
    const bone={name:'bone-field',ramp:['#c8c0a8','#a8a088','#e0d8c0','#f4eed8'],patterns:[{kind:'speckle',density:.4},{kind:'cracks',density:.5},{kind:'clusters',size:'large',shade:true}],seed:3};
    const recipe=custom=>sha(generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:[custom],variants:1}));
    expect(recipe(bone)).toBe(golden['custom-terrain/bone-field-v1']);
    expect(recipe({...bone,grain:'lattice'})).toBe(golden['custom-terrain/bone-field-v1']);
  });
  test('the lattice ring is the same in every variant and has marks on all four edges',()=>{
    const s=spec([{kind:'speckle'}]);
    const first=ring(tile(s,0));
    expect(first.length).toBe(16);
    for(let v=1;v<8;v++)expect(ring(tile(s,v))).toEqual(first);
  });
  test('the validated material carries grain only when it was given',()=>{
    expect('grain' in spec([{kind:'speckle'}])).toBe(false);
    expect(spec([{kind:'speckle'}],{grain:'soft'}).grain).toBe('soft');
  });
});

describe('grain: none',()=>{
  const every=[...PATTERN_KINDS.filter(k=>!['panels','furrows','stripe'].includes(k)),'bedding','crystals','sheen'];
  test.each(every)('%s draws nothing on the edge ring',kind=>{
    const s=spec([{kind,density:1}],{grain:'none'});
    for(const seed of SEEDS)for(let v=0;v<4;v++)expect(ring(tile(s,v,seed))).toEqual([]);
  });
  test('the same material with the default grain does draw the ring',()=>{
    expect(ring(tile(spec([{kind:'speckle',density:1}]),0)).length).toBeGreaterThan(0);
  });
  test('the interior keeps its marks',()=>{
    expect(marks(tile(spec([{kind:'clusters',density:1}],{grain:'none'}),0)).size).toBeGreaterThan(0);
  });
});

describe('grain: soft',()=>{
  const s=spec([{kind:'speckle',density:.6}],{grain:'soft'});
  test('two variants of one material have different edge-mark positions',()=>{
    for(const seed of SEEDS){
      const rings=[0,1,2].map(v=>ring(tile(s,v,seed)).join(';'));
      expect(new Set(rings).size).toBe(3);
    }
  });
  test('each variant still draws marks on every edge, matching on opposite edges',()=>{
    for(const seed of SEEDS)for(let v=0;v<4;v++){
      const t=tile(s,v,seed),r=ring(t).map(k=>k.split(',').map(Number));
      expect(r.some(([x])=>x===0)).toBe(true);
      expect(r.some(([x])=>x===GRID-1)).toBe(true);
      expect(r.some(([,y])=>y===0)).toBe(true);
      expect(r.some(([,y])=>y===GRID-1)).toBe(true);
      for(let k=1;k<GRID-1;k++){
        expect(at(t,0,k)).toBe(at(t,GRID-1,k));
        expect(at(t,k,0)).toBe(at(t,k,GRID-1));
      }
      for(const [x,y] of r)expect(at(t,x,y)).toBe(x===0||x===GRID-1?LIGHT:DARK);
      expect(r.length).toBeLessThanOrEqual(16);
    }
  });
  test('the marks are not on the lattice positions of the default grain',()=>{
    const lattice=ring(tile(spec([{kind:'speckle',density:.6}]),0)).join(';');
    expect([0,1,2,3].filter(v=>ring(tile(s,v)).join(';')!==lattice).length).toBeGreaterThanOrEqual(3);
  });
  test('soft marks are deterministic for a seed',()=>{
    expect(tile(s,2,13)).toEqual(tile(s,2,13));
  });
});

describe('grain: validation',()=>{
  test('an unknown grain is rejected with a message naming grain',()=>{
    for(const grain of ['loose','LATTICE','',1,null,true,['none']])expect(()=>spec([{kind:'speckle'}],{grain})).toThrow(/grain/);
  });
  test('an unknown grain is rejected through a recipe',()=>{
    const custom={name:'probe',ramp:RAMP,patterns:[{kind:'speckle'}],grain:'noise'};
    expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['probe'],customMaterials:[custom]})).toThrow(/grain/);
  });
  test.each(['none','soft','lattice'])('grain %s builds through terrain and terrain-overlay',grain=>{
    const custom={name:'probe',ramp:RAMP,patterns:[{kind:'bedding'},{kind:'crystals'}],grain};
    for(const kind of ['terrain','terrain-overlay'])expect(generateEnvironmentRecipe({kind,materials:['probe'],customMaterials:[custom],variants:2}).report.ok).toBe(true);
  });
});

describe('pattern kinds: validation',()=>{
  test('the first ten kinds are unchanged and the three new kinds follow',()=>{
    expect(PATTERN_KINDS).toHaveLength(10);
    expect(ALL_PATTERN_KINDS).toEqual([...PATTERN_KINDS,'bedding','crystals','sheen']);
  });
  test('the new kinds take density, and bedding and crystals take a lit tone',()=>{
    for(const kind of ['bedding','crystals','sheen'])expect(spec([{kind,density:.3}]).patterns[0].kind).toBe(kind);
    for(const tone of ['light','bright','mixed'])for(const kind of ['bedding','crystals'])expect(spec([{kind,tone}]).patterns[0].tone).toBe(tone);
    expect(()=>spec([{kind:'crystals',tone:'dark'}])).toThrow(/tone/);
    expect(()=>spec([{kind:'bedding',tone:'deep'}],{ramp:[...RAMP,'#2a2118']})).toThrow(/tone/);
    expect(()=>spec([{kind:'sheen',tone:'light'}])).toThrow(/Unknown/);
    expect(()=>spec([{kind:'sheen',density:2}])).toThrow(/density/);
    expect(()=>spec([{kind:'ridges'}])).toThrow(/kind must be one of .*bedding, crystals, sheen/);
  });
  test('the new kinds keep to the interior, so every variant tiles beside every other',()=>{
    const s=spec([{kind:'bedding',density:1},{kind:'crystals',density:1},{kind:'sheen',density:1}],{grain:'none'});
    for(const seed of SEEDS)for(let v=0;v<8;v++)expect(ring(tile(s,v,seed))).toEqual([]);
  });
  test('a tile uses only ramp colours',()=>{
    const s=spec([{kind:'bedding',density:1},{kind:'crystals',density:1,tone:'mixed'},{kind:'sheen',density:1}]);
    for(const seed of SEEDS)for(let v=0;v<8;v++)for(const c of tile(s,v,seed))expect(RAMP).toContain(c);
  });
});

describe('bedding',()=>{
  const s=spec([{kind:'bedding',density:1}],{grain:'none'});
  test('has horizontal runs of lit and shade pixels',()=>{
    for(const seed of SEEDS)for(let v=0;v<3;v++){
      const t=tile(s,v,seed);
      expect(longestRun(t,LIGHT)).toBeGreaterThanOrEqual(3);
      expect(longestRun(t,DARK)).toBeGreaterThanOrEqual(3);
    }
  });
  test('every lit bed is a wide thin line that wavers by a row, with shade directly under part of it',()=>{
    for(const seed of SEEDS)for(let v=0;v<3;v++){
      const t=tile(s,v,seed),beds=components(t,LIGHT);
      expect(beds.length).toBeGreaterThanOrEqual(1);
      for(const bed of beds){
        expect(range(bed.map(([x])=>x))).toBeGreaterThanOrEqual(6);
        expect(range(bed.map(([,y])=>y))).toBe(2);
        expect(bed.some(([x,y])=>at(t,x,y+1)===DARK)).toBe(true);
      }
    }
  });
  test('the bright tone draws the lit hairlines in the bright step',()=>{
    const colors=new Set(tile(spec([{kind:'bedding',density:1,tone:'bright'}],{grain:'none'}),0,7));
    expect(colors.has(BRIGHT)).toBe(true);
    expect(colors.has(LIGHT)).toBe(false);
  });
});

describe('crystals',()=>{
  const s=spec([{kind:'crystals',density:1}],{grain:'none'});
  test('are clusters of lit pixels, each adjacent to a shade pixel',()=>{
    for(const seed of SEEDS)for(let v=0;v<4;v++){
      const t=tile(s,v,seed),clusters=components(t,LIGHT);
      expect(clusters.length).toBeGreaterThanOrEqual(2);
      for(const cluster of clusters){
        expect(cluster.length).toBeGreaterThanOrEqual(2);
        expect(cluster.length).toBeLessThanOrEqual(6);
        const touchesShade=cluster.some(([x,y])=>{
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(at(t,x+dx,y+dy)===DARK)return true;
          return false;
        });
        expect(touchesShade).toBe(true);
      }
    }
  });
  test('use the lit step for the body and the dark step for the shade only',()=>{
    expect(new Set(tile(s,0,7))).toEqual(new Set([BASE,LIGHT,DARK]));
  });
});

describe('sheen',()=>{
  const s=spec([{kind:'sheen',density:.5}],{grain:'none'});
  test('is a line of the lightest tone at most two pixels thick',()=>{
    for(const seed of SEEDS)for(let v=0;v<8;v++){
      const lines=components(tile(s,v,seed),BRIGHT);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      for(const line of lines){
        expect(line.length).toBeGreaterThanOrEqual(3);
        expect(thickness(line)).toBeLessThanOrEqual(2);
      }
    }
  });
  test('two lines at high density, each at most two pixels thick',()=>{
    const two=spec([{kind:'sheen',density:1}],{grain:'none'});
    for(const seed of SEEDS)for(let v=0;v<3;v++)for(const line of components(tile(two,v,seed),BRIGHT))expect(thickness(line)).toBeLessThanOrEqual(2);
  });
  test('the lightest tone is chosen by luminance, wherever it sits in the ramp',()=>{
    const flipped=spec([{kind:'sheen'}],{ramp:[BASE,DARK,BRIGHT,LIGHT],grain:'none'});
    const lines=components(tile(flipped,0,7),BRIGHT);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for(const line of lines)expect(thickness(line)).toBeLessThanOrEqual(2);
  });
});

describe('variants do not repeat their marks',()=>{
  const sets={
    bedding:[{kind:'bedding',density:.5}],
    'bedding-dense':[{kind:'bedding',density:1}],
    crystals:[{kind:'crystals',density:.5}],
    'crystals-dense':[{kind:'crystals',density:1}],
    sheen:[{kind:'sheen',density:.5}],
    layered:[{kind:'bedding',density:.7},{kind:'crystals',density:.5},{kind:'sheen',density:.5}],
  };
  for(const [name,patterns] of Object.entries(sets))test(`three variants of ${name} share at most half of their mark positions pairwise`,()=>{
    for(const seed of SEEDS)for(const materialSeed of [0,5]){
      const s=spec(patterns,{seed:materialSeed});
      const m=[0,1,2].map(v=>marks(tile(s,v,seed)));
      for(const set of m)expect(set.size).toBeGreaterThan(0);
      for(const [a,b] of [[0,1],[0,2],[1,2]])expect(sharedFraction(m[a],m[b])).toBeLessThanOrEqual(.5);
    }
  });
  test('the three variants are three different tiles',()=>{
    const s=spec([{kind:'bedding',density:1},{kind:'crystals',density:.6}],{grain:'none'});
    expect(new Set([0,1,2].map(v=>tile(s,v).join())).size).toBe(3);
  });
});

describe('existing pattern kinds are untouched',()=>{
  test('the golden hashes still hold for kinds this file does not otherwise touch',()=>{
    // a spot check; the full set of cases lives in environment-material-goldens.test.js
    const hashOf=patterns=>sha([7,13].flatMap(seed=>[0,5].map(materialSeed=>{
      const s=spec(patterns,{seed:materialSeed});
      return Array.from({length:8},(_,v)=>materialTile('probe',s,v,seed,v));
    })));
    expect(hashOf([{kind:'polygons'}])).toBe(golden['custom-tile/polygons-0']);
    expect(hashOf([{kind:'bubbles'}])).toBe(golden['custom-tile/bubbles-0']);
    expect(hashOf([{kind:'furrows'}])).toBe(golden['custom-tile/furrows-0']);
    expect(hashOf([{kind:'stripe'}])).toBe(golden['custom-tile/stripe-0']);
  });
});
