// Explicit asset build only. Ordinary verification reads checked assets.
import {readFileSync} from 'node:fs';
const recipe=JSON.parse(readFileSync(new URL('./recipe.json',import.meta.url)));
const kind=process.argv[2], operations=[], frames=[];
if(kind==='font') {
  const chars=Object.keys(recipe.glyphs);
  operations.push({command:'new',name:'contract-font',size:'3x5',cols:Object.keys(recipe.tones).length,rows:chars.length,palette:'pico8'});
  const glyphs={' ':{advance:2,frames:{},bounds:null}};
  // Row k holds glyph k; column i holds tone i. The first glyph keeps cells 0,0 and 0,1.
  for(const [k,char] of chars.entries()) {
    const {name,rows}=recipe.glyphs[char],glyph={advance:4,frames:{},bounds:{left:0,top:0,right:2,bottom:4}};
    for(const [i,[tone,color]] of Object.entries(recipe.tones).entries()) {
      const cell=`${k},${i}`,alias=`${name}_${tone}`;
      rows.forEach((row,y)=>[...row].forEach((pixel,x)=>{if(pixel==='1')operations.push({command:'draw',type:'rect',cell,x,y,w:1,h:1,color,filled:true,name:`p${x}_${y}`});}));
      operations.push({command:'name',cell,as:alias});frames.push({alias,cell,bounds:glyph.bounds});glyph.frames[tone]=alias;
    }
    glyphs[char]=glyph;
  }
  process.stdout.write(JSON.stringify({operations,report:{version:1,kind,cellSize:{width:3,height:5},lineHeight:6,baseline:4,fallback:'?',tones:recipe.tones,colors:recipe.tones,frames,glyphs}}));
} else if(kind==='skin') {
  // Four cells: two themed faces, then the compressed-tiling art. "uniform" has a
  // constant face on both axes; "detailed" alternates two columns across x and stays
  // constant down y (its true x repeat period is 2 source pixels).
  const faces=Object.entries(recipe.skins).map(([alias,c])=>({alias,draw:cell=>[
    {command:'draw',type:'rect',cell,x:0,y:0,w:4,h:4,color:c.edge,filled:true,name:'edge'},
    {command:'draw',type:'rect',cell,x:1,y:1,w:2,h:2,color:c.fill,filled:true,name:'fill'}]}));
  for(const [alias,c] of Object.entries(recipe.tiles)) faces.push({alias,draw:cell=>[
    {command:'draw',type:'rect',cell,x:0,y:0,w:4,h:4,color:c.edge,filled:true,name:'edge'},
    {command:'draw',type:'rect',cell,x:1,y:0,w:1,h:4,color:c.a,filled:true,name:'columnA'},
    {command:'draw',type:'rect',cell,x:2,y:0,w:1,h:4,color:c.b,filled:true,name:'columnB'},
    {command:'draw',type:'rect',cell,x:0,y:0,w:1,h:4,color:c.edge,filled:true,name:'left'},
    {command:'draw',type:'rect',cell,x:3,y:0,w:1,h:4,color:c.edge,filled:true,name:'right'}]});
  operations.push({command:'new',name:'contract-skin',size:'4x4',cols:faces.length,rows:1,palette:'pico8'});
  const skins={};
  for(const [i,{alias,draw}] of faces.entries()) {
    const cell=`0,${i}`;
    operations.push(...draw(cell),{command:'name',cell,as:alias});
    frames.push({alias,cell,bounds:{left:0,top:0,right:3,bottom:3}});
    skins[alias]={insets:{left:1,right:1,top:1,bottom:1},padding:{left:1,right:1,top:1,bottom:1},minWidth:4,minHeight:4};
  }
  process.stdout.write(JSON.stringify({operations,report:{version:1,kind,cellSize:{width:4,height:4},frames,skins}}));
} else throw Error('Expected font or skin');
