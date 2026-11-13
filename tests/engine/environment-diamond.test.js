import {describe,expect,it} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {DIAMOND,diamondEdgeShadePixels,diamondOverlayPixels,diamondUv,inDiamond,materialDiamond,projectCoverage} from '../../server/authoring/environment-diamond.js';
import {OVERLAY_MASKS,overlayCoverage} from '../../server/authoring/environment-overlay.js';

const W=DIAMOND.width,H=DIAMOND.height;
const SPEC={ramp:['#6b7d3a','#4a5c2f','#8a9a4a','#a9b45a'],patterns:[{kind:'speckle',density:.6,tone:'light'},{kind:'clusters',density:.4,size:'small',tone:'dark'},{kind:'streaks',density:.3},{kind:'cracks',density:.3}],seed:23};
const WATER={ramp:['#3f7a8d','#2f5f78','#6fa4b4','#8fc4c4'],patterns:[{kind:'ripples',density:.6}],animated:true,fps:4,seed:19};
/** Lay tiles on the game's lattice: map +x is screen (+32, +16), map +y is (-32, +16). */
function lay(tiles){
  const picture=new Map();
  for(const [tx,ty,pixels] of tiles)pixels.forEach((c,i)=>{
    if(c===null)return;
    const key=`${(tx-ty)*W/2+i%W},${(tx+ty)*H/2+Math.floor(i/W)}`;
    if(picture.has(key))throw Error(`pixel ${key} drawn twice`);
    picture.set(key,c);
  });
  return picture;
}

describe('diamond terrain geometry',()=>{
  it('is 1,024 pixels in rows of 2, 6, 10 ... 62 and back',()=>{
    const rows=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>inDiamond(x,y)).filter(Boolean).length);
    expect(rows.slice(0,16)).toEqual(Array.from({length:16},(_,r)=>4*r+2));
    expect(rows.slice(16)).toEqual(rows.slice(0,16).reverse());
    expect(rows.reduce((a,b)=>a+b,0)).toBe(1024);
    expect(diamondUv(31,0)[1]).toBeGreaterThan(diamondUv(32,0)[1]);
  });
  it('covers every screen pixel exactly once when laid as a map',()=>{
    const full=Array.from({length:W*H},(_,i)=>inDiamond(i%W,Math.floor(i/W))?'#000000':null),tiles=[];
    for(let ty=-3;ty<=3;ty++)for(let tx=-3;tx<=3;tx++)tiles.push([tx,ty,full]);
    const picture=lay(tiles);
    // every pixel of the middle tile's cell, corners included, belongs to some tile
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)expect(picture.has(`${x},${y}`),`${x},${y}`).toBe(true);
  });
});

describe('diamond materials',()=>{
  it('fill the diamond with colours of the ramp, the same every time, and differently in each variant',()=>{
    const tiles=[0,1,2,3].map(v=>materialDiamond('meadow',SPEC,v,7));
    for(const tile of tiles){
      expect(tile.filter(c=>c!==null)).toHaveLength(1024);
      for(const c of tile)if(c!==null)expect(SPEC.ramp).toContain(c);
      expect(tile.filter(c=>c!==null&&c!==SPEC.ramp[0]).length).toBeGreaterThan(40);
    }
    expect(materialDiamond('meadow',SPEC,1,7)).toEqual(tiles[1]);
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)expect(tiles[a]).not.toEqual(tiles[b]);
    expect(materialDiamond('meadow',SPEC,0,8)).not.toEqual(tiles[0]);
  });
  it('never cut a mark at a tile edge, whichever variants meet there',()=>{
    const base=SPEC.ramp[0];
    for(const [a,b] of [[0,1],[1,2],[2,0],[3,1]])for(const [nx,ny] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const same=lay([[0,0,materialDiamond('meadow',SPEC,a,7)],[nx,ny,materialDiamond('meadow',SPEC,a,7)]]);
      const mixed=lay([[0,0,materialDiamond('meadow',SPEC,a,7)],[nx,ny,materialDiamond('meadow',SPEC,b,7)]]);
      const first=new Set(lay([[0,0,materialDiamond('meadow',SPEC,a,7)]]).keys());
      // marks of the one-variant picture, as connected runs of anything but the base colour
      const seen=new Set();let crossing=0;
      for(const start of same.keys()){
        if(seen.has(start)||same.get(start)===base)continue;
        const mark=[start];seen.add(start);
        for(let i=0;i<mark.length;i++){const [x,y]=mark[i].split(',').map(Number);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const k=`${x+dx},${y+dy}`;if(!seen.has(k)&&same.has(k)&&same.get(k)!==base){seen.add(k);mark.push(k);}}}
        if(!mark.some(k=>first.has(k))||mark.every(k=>first.has(k)))continue;
        crossing++;
        for(const k of mark)expect(mixed.get(k),`variants ${a},${b} across ${nx},${ny} at ${k}`).toBe(same.get(k));
      }
      expect(crossing,`marks crossing ${nx},${ny}`).toBeGreaterThan(0);
    }
  });
  it('move water with the frame and keep one look when animated',()=>{
    const frames=[0,1,2,3].map(f=>materialDiamond('water',WATER,0,7,f));
    for(let f=1;f<4;f++)expect(frames[f]).not.toEqual(frames[0]);
    expect(materialDiamond('water',WATER,2,7,1)).toEqual(frames[1]);
  });
});

describe('diamond overlays',()=>{
  const rim={light:'#ffffff',dark:'#000000'},tile=materialDiamond('meadow',SPEC,0,7);
  it('take the square coverage through the projection for every mask',()=>{
    for(const mask of OVERLAY_MASKS.filter(Boolean))for(const v of [0,1]){
      const square=overlayCoverage(mask,v,7,{round:4}),cover=projectCoverage(square);
      expect(cover.filter(c=>c!==null)).toHaveLength(1024);
      const share=cover.filter(Boolean).length/1024,want=square.filter(Boolean).length/256;
      expect(Math.abs(share-want),`mask ${mask}`).toBeLessThan(.06);
    }
  });
  it('rim only where the overlay meets open ground inside the tile, lit from the top left of the screen',()=>{
    for(const mask of [1,4,16,64,5,85,2,255&~170]){
      const cover=projectCoverage(overlayCoverage(mask,0,7,{round:4})),px=diamondOverlayPixels(cover,tile,rim),plain=diamondOverlayPixels(cover,tile,null);
      const open=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&cover[y*W+x]===false;
      px.forEach((c,i)=>{
        const x=i%W,y=Math.floor(i/W);
        if(!cover[i]){expect(c).toBeNull();return;}
        const n=open(x,y-1),w=open(x-1,y),s=open(x,y+1),e=open(x+1,y);
        if(n||w||s||e)expect(c,`mask ${mask} at ${x},${y}`).toBe((n?1:0)+(w?1:0)-(s?1:0)-(e?1:0)>0?rim.light:rim.dark);
        else expect(c).toBe(tile[i]);
        expect(plain[i]).toBe(tile[i]);
      });
    }
  });
  it('band the open ground beside an overlay, never the overlay or the cell outside the diamond',()=>{
    const cover=projectCoverage(overlayCoverage(1,0,7,{})),band=diamondEdgeShadePixels(cover,{width:2,color:'#101010',dir:'all'});
    expect(band.some(c=>c==='#101010')).toBe(true);
    band.forEach((c,i)=>{if(c!==null)expect(cover[i]).toBe(false);});
  });
});

describe('the diamond projection in a recipe',()=>{
  const environment={name:'iso',kind:'terrain-overlay',seed:7,variants:2,projection:'diamond',materials:['meadow','mere'],overlayEdge:{rim:true,round:4,soft:['meadow']},
    customMaterials:[{name:'meadow',...SPEC},{name:'mere',...WATER}]};
  it('gives the same cells as the square recipe, each a 64 by 32 diamond, and says how they lie',()=>{
    const iso=generateEnvironmentRecipe(environment),square=generateEnvironmentRecipe({...environment,projection:undefined,pixelScale:2});
    expect(iso.report.cellSize).toEqual({width:64,height:32});
    expect(iso.report.projection).toBe('diamond');
    expect(iso.report.diamond.edges).toEqual({n:'upper right',e:'lower right',s:'lower left',w:'upper left'});
    expect(iso.report.frames.map(f=>f.alias)).toEqual(square.report.frames.map(f=>f.alias));
    expect(iso.operations[0].size).toBe('64x32');
    const base=iso.report.frames.find(f=>f.alias==='meadow_0');
    expect(base.bounds).toMatchObject({left:1,top:0,right:62,bottom:31});
    expect(square.report.projection).toBeUndefined();
  });
  it('refuses what it cannot draw',()=>{
    expect(()=>generateEnvironmentRecipe({...environment,pixelScale:2})).toThrow(/pixelScale/);
    expect(()=>generateEnvironmentRecipe({...environment,projection:'hex'})).toThrow(/projection/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',projection:'diamond',materials:['moss']})).toThrow(/vector material/);
    expect(()=>generateEnvironmentRecipe({kind:'habitat',projection:'diamond'})).toThrow(/only to terrain/);
  });
});
