import {FONT_GLYPHS,FONT_CHARACTERS} from './ui-font.js';
import {skinDefinitions,drawSkin} from './ui-skin.js';

export const UI_COLORS={ink:'#172f35',deep:'#203640',edge:'#789088',cream:'#eceddb',muted:'#a8bcb9',gold:'#eed09b',moss:'#98b58a',light:'#ded5b4',shadow:'#10242d'};
export function generateUIRecipe(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('UI recipe must be an object.');
  for(const k of Object.keys(config))if(!['name','kind','theme','characters'].includes(k))throw Error(`Unknown UI field: ${k}`);
  const {kind,name=kind==='font'?'ui-font':'ui-skin',theme='moss-brass'}=config;
  if(!['font','skin'].includes(kind))throw Error('UI kind must be font or skin.');
  if(typeof name!=='string'||!/^[a-z][a-z0-9_-]{0,47}$/.test(name))throw Error('Invalid UI name.');
  if(theme!=='moss-brass')throw Error('Unsupported UI theme.');
  if(kind==='skin'&&config.characters!==undefined)throw Error('Characters apply only to fonts.');
  const characters=config.characters??FONT_CHARACTERS;
  if(typeof characters!=='string'||!characters.length)throw Error('Font characters must be a nonempty string.');
  const chars=[...new Set([...characters,'?',' '])].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0));
  if(kind==='font')for(const char of chars)if(char!==' '&&!FONT_GLYPHS[char])throw Error(`Unsupported font character: ${char}`);
  const tones=['cream','muted','gold','ink'],width=kind==='font'?8:24,height=kind==='font'?12:24;
  const entries=kind==='font'?chars.filter(c=>c!==' ').flatMap(char=>tones.map(tone=>({char,tone,alias:`glyph_${char.codePointAt(0).toString(16).padStart(4,'0')}_${tone}`}))):skinDefinitions();
  const maxCols=kind==='font'?32:8;
  const fittingCols=()=>Array.from({length:maxCols},(_,i)=>maxCols-i).find(n=>entries.length%n===0);
  const cols=fittingCols();
  const operations=[{command:'new',name,size:`${width}x${height}`,cols,rows:entries.length/cols,palette:'pico8'}],frames=[],glyphs={},skins={};
  if(kind==='font')for(const char of chars)glyphs[char]={advance:char===' '?4:6,frames:{},bounds:null};
  for(const [index,entry] of entries.entries()){
    const cell=`${Math.floor(index/cols)},${index%cols}`,alias=entry.alias,names=[],bounds={left:width,top:height,right:-1,bottom:-1};
    operations.push({command:'clear',cell},{command:'name',cell,as:alias});
    function rect(x,y,w,h,color){
      if(![x,y,w,h].every(Number.isInteger)||w<1||h<1||x<0||y<0||x+w>width||y+h>height)throw Error(`Out-of-cell UI rectangle: ${alias}`);
      const name=`pixel_run_${names.length}`;names.push(name);operations.push({command:'draw',cell,type:'rect',name,color,filled:true,x,y,w,h});
      bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x+w-1);bounds.bottom=Math.max(bounds.bottom,y+h-1);
    }
    if(kind==='font'){
      const glyph=FONT_GLYPHS[entry.char];
      glyph.rows.forEach((mask,row)=>{for(let x=0;x<5;){if(!(mask&(1<<(4-x)))){x++;continue;}const start=x;while(x<5&&(mask&(1<<(4-x))))x++;rect(start,row+glyph.top,x-start,1,UI_COLORS[entry.tone]);}});
      glyphs[entry.char].frames[entry.tone]=alias;glyphs[entry.char].bounds={...bounds};
    }else{drawSkin(entry.alias,rect,UI_COLORS);skins[alias]=entry.metrics;}
    operations.push({command:'shape-group',sub:'create',cell,name:kind,shapes:names});frames.push({alias,cell,bounds,...(kind==='font'?{character:entry.char,tone:entry.tone}:{})});
  }
  return {operations,report:{version:1,ok:true,kind,theme,cellSize:{width,height},colors:UI_COLORS,frames,...(kind==='font'?{baseline:9,lineHeight:12,fallback:'?',glyphs}:{skins})}};
}
