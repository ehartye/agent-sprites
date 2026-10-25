// Explicit asset build only. Ordinary verification reads checked assets.
import {readFileSync} from 'node:fs';
const recipe=JSON.parse(readFileSync(new URL('./recipe.json',import.meta.url)));
const kind=process.argv[2], operations=[], frames=[];
if(kind==='font') {
  operations.push({command:'new',name:'contract-font',size:'3x5',cols:2,rows:1,palette:'pico8'});
  const glyph={advance:4,frames:{},bounds:{left:0,top:0,right:2,bottom:4}};
  for(const [i,[tone,color]] of Object.entries(recipe.tones).entries()) {
    const cell=`0,${i}`,alias=`question_${tone}`;
    recipe.glyph.forEach((row,y)=>[...row].forEach((pixel,x)=>{if(pixel==='1')operations.push({command:'draw',type:'rect',cell,x,y,w:1,h:1,color,filled:true,name:`p${x}_${y}`});}));
    operations.push({command:'name',cell,as:alias});frames.push({alias,cell,bounds:glyph.bounds});glyph.frames[tone]=alias;
  }
  process.stdout.write(JSON.stringify({operations,report:{version:1,kind,cellSize:{width:3,height:5},lineHeight:6,baseline:4,fallback:'?',tones:recipe.tones,colors:recipe.tones,frames,glyphs:{'?':glyph,' ':{advance:2,frames:{},bounds:null}}}}));
} else if(kind==='skin') {
  operations.push({command:'new',name:'contract-skin',size:'4x4',cols:2,rows:1,palette:'pico8'});
  const skins={};
  for(const [i,[alias,colors]] of Object.entries(recipe.skins).entries()) {
    const cell=`0,${i}`;
    operations.push({command:'draw',type:'rect',cell,x:0,y:0,w:4,h:4,color:colors.edge,filled:true,name:'edge'},
      {command:'draw',type:'rect',cell,x:1,y:1,w:2,h:2,color:colors.fill,filled:true,name:'fill'}, {command:'name',cell,as:alias});
    frames.push({alias,cell,bounds:{left:0,top:0,right:3,bottom:3}});
    skins[alias]={insets:{left:1,right:1,top:1,bottom:1},padding:{left:1,right:1,top:1,bottom:1},minWidth:4,minHeight:4};
  }
  process.stdout.write(JSON.stringify({operations,report:{version:1,kind,cellSize:{width:4,height:4},frames,skins}}));
} else throw Error('Expected font or skin');
