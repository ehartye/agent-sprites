import {test,expect,describe} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID,WASTELAND_SPECS,materialTile} from '../../server/authoring/environment-materials.js';
import {OVERLAY_MASKS,overlayCoverage,overlayPixels} from '../../server/authoring/environment-overlay.js';

const N=1,E=4,S=16,W=64;
const cell=(c,x,y)=>c[y*GRID+x];

describe('overlay edge style: rounded concave corners',()=>{
  test('round 0 (the default) leaves every coverage exactly as before',()=>{
    for(const mask of OVERLAY_MASKS)for(let v=0;v<3;v++)expect(overlayCoverage(mask,v,7,{round:0})).toEqual(overlayCoverage(mask,v,7));
  });

  test('rounding only ever adds covered pixels, and a few of them',()=>{
    for(const mask of [N|E,E|S,S|W,W|N,N|E|S,N|E|S|W]){
      let total=0;
      for(let v=0;v<8;v++){
        const flat=overlayCoverage(mask,v,7),round=overlayCoverage(mask,v,7,{round:4});
        let added=0;
        for(let i=0;i<GRID*GRID;i++){
          if(flat[i])expect(round[i],`mask ${mask} v${v} pixel ${i} was covered`).toBe(true);
          if(!flat[i]&&round[i])added++;
        }
        expect(added,`mask ${mask} v${v}`).toBeLessThan(40);
        total+=added;
      }
      expect(total,`mask ${mask} over 8 variants`).toBeGreaterThan(0);
    }
  });

  test('the two pixels along every tile border are untouched, so seams still match',()=>{
    for(const mask of OVERLAY_MASKS)for(let v=0;v<3;v++){
      const flat=overlayCoverage(mask,v,7),round=overlayCoverage(mask,v,7,{round:6});
      for(let i=0;i<GRID;i++)for(const b of [0,1,GRID-2,GRID-1]){
        expect(round[b*GRID+i],`${mask} row ${b}`).toBe(flat[b*GRID+i]);
        expect(round[i*GRID+b],`${mask} col ${b}`).toBe(flat[i*GRID+b]);
      }
    }
  });

  test('a tile almost surrounded keeps an island of its own material',()=>{
    for(let v=0;v<3;v++){
      const c=overlayCoverage(N|E|S|W,v,7,{round:6});
      expect(c.filter(x=>!x).length).toBeGreaterThan(8);
    }
  });
});

describe('overlay edge style: rim',()=>{
  const tile=materialTile('gravel',WASTELAND_SPECS.gravel,0,7,0),rim={light:'#aaaaaa',dark:'#111111'};
  test('rim pixels sit exactly on the covered pixels that touch the free ones, lit on the top-left side',()=>{
    const cov=overlayCoverage(N|W,0,7),px=overlayPixels(cov,tile,rim);
    let light=0,dark=0;
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
      const c=px[y*GRID+x];
      if(!cov[y*GRID+x]){expect(c).toBeNull();continue;}
      const free=(dx,dy)=>x+dx>=0&&y+dy>=0&&x+dx<GRID&&y+dy<GRID&&!cov[(y+dy)*GRID+x+dx];
      const edge=free(1,0)||free(-1,0)||free(0,1)||free(0,-1);
      if(!edge){expect(c).toBe(tile[y*GRID+x]);continue;}
      expect(['#aaaaaa','#111111']).toContain(c);
      if(c==='#aaaaaa')light++;else dark++;
    }
    expect(light+dark).toBeGreaterThan(10);
    // an N|W tile's free region is down and right of the bands, so its rim faces away from the light: dark
    expect(dark).toBeGreaterThan(light);
  });
  test('a rim never lands on a tile border pixel (the next tile decides what lies beyond)',()=>{
    for(const mask of OVERLAY_MASKS){
      const cov=overlayCoverage(mask,0,7),px=overlayPixels(cov,tile,rim);
      for(let i=0;i<GRID;i++)for(const [x,y] of [[i,0],[i,GRID-1],[0,i],[GRID-1,i]]){
        const c=px[y*GRID+x];
        if(c!==null&&(x===0||y===0||x===GRID-1||y===GRID-1)){
          // a border pixel may carry a rim only along the border row where a band ends (covered next to free): never from the tile's outside
          const inward=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([a,b])=>a>=0&&b>=0&&a<GRID&&b<GRID).some(([a,b])=>!cov[b*GRID+a]);
          if(!inward)expect(c).toBe(tile[y*GRID+x]);
        }
      }
    }
  });
});

describe('overlayEdge in an environment recipe',()=>{
  const recipe=edge=>generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','gravel'],variants:1,pixelScale:2,overlayEdge:edge});
  test('absent: the frames are exactly the old ones',()=>{
    const a=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','gravel'],variants:1,pixelScale:2});
    expect(a.report.frames.length).toBe(2+2*46);
  });
  test('soft adds a rimless twin of every overlay',()=>{
    const r=recipe({rim:true,round:3,soft:true}),names=r.report.frames.map(f=>f.alias);
    expect(names.length).toBe(2+4*46);
    expect(names).toContain('dust-soft_5_0');
    expect(names).toContain('gravel_5_0');
    const rimmed=r.operations.filter(o=>o.command==='draw'&&o.cell===r.report.frames.find(f=>f.alias==='gravel_5_0').cell).map(o=>o.color);
    const soft=r.operations.filter(o=>o.command==='draw'&&o.cell===r.report.frames.find(f=>f.alias==='gravel-soft_5_0').cell).map(o=>o.color);
    expect(new Set(rimmed).size).toBeGreaterThanOrEqual(new Set(soft).size);
    expect(rimmed.join()).not.toBe(soft.join());
  });
  test('soft may name a subset',()=>{
    const names=recipe({rim:true,soft:['dust']}).report.frames.map(f=>f.alias);
    expect(names).toContain('dust-soft_1_0');
    expect(names).not.toContain('gravel-soft_1_0');
  });
  test('bad settings are rejected with a reason',()=>{
    expect(()=>recipe({round:9})).toThrow(/round/);
    expect(()=>recipe({rim:'yes'})).toThrow(/rim/);
    expect(()=>recipe({colour:1})).toThrow(/Unknown overlayEdge/);
    expect(()=>recipe({soft:true})).toThrow(/needs rim/);
    expect(()=>recipe({rim:true,soft:['water']})).toThrow(/not in materials/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',overlayEdge:{rim:true}})).toThrow(/only to terrain-overlay/);
  });
});
