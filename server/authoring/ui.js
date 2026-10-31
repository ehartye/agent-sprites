import {FONT_GLYPHS,FONT_CHARACTERS,FONT_SYMBOLS} from './ui-font.js';
import {logoRaster,DEFAULT_LOGO_TEXT} from './ui-logo.js';
import {DISPLAY_CELL,displayGlyph,resolveDisplayRamps} from './ui-display.js';
import {COMPACT_GLYPHS} from './ui-font-compact.js';
import {skinDefinitions,drawSkin} from './ui-skin.js';
import {FONT_TONES} from '../build/ui-runtime.mjs';

export const UI_COLORS={ink:'#172f35',deep:'#203640',edge:'#789088',cream:'#eceddb',muted:'#a8bcb9',gold:'#eed09b',moss:'#98b58a',light:'#ded5b4',shadow:'#10242d',orbitalInk:'#26333f',instrumentTeal:'#528f8b',wornCopper:'#bc7858',seedGold:'#dfac59',mint:'#a4d4c4',paper:'#eedfbe',specimenWell:'#36565e'};
// Wasteland theme ramps: night backing, dust brass, oxide teal, rust copper, harvest gold.
export const WASTELAND_COLORS={ink:'#0d1126',deep:'#1b2040',edge:'#8f6f45',cream:'#f6edcf',muted:'#a8a79e',gold:'#f0d466',moss:'#8a9a4a',light:'#e3cf93',shadow:'#07091a',orbitalInk:'#0d1126',instrumentTeal:'#5f9a8d',wornCopper:'#b5532f',seedGold:'#e0b84a',mint:'#8fc4b4',paper:'#e3cf93',specimenWell:'#2c3a6b'};
export const UI_THEMES={'moss-brass':UI_COLORS,wasteland:WASTELAND_COLORS};
export const UI_COLOR_ROLES=Object.freeze(Object.keys(UI_COLORS));
/** Roles whose pairwise equality would make the font tones or their lit edges indistinguishable. */
const DISTINCT_ROLES=['cream','muted','gold','ink'];
/**
 * Merge an optional `colors` map over a base theme's 16 roles. Role names stay unchanged and the frame set stays tied to the theme.
 * Throws an error that names the role for an unknown role, a value that is not `#rrggbb`, or a collapsed cream, muted, gold or ink pair.
 * Pads, HUD and symbol icons draw fixed colours and do not follow the roles. Returns the resolved map and the overridden role names.
 */
export function resolveUIColors(base,colors){
  if(colors===undefined)return {colors:base,overrides:undefined};
  if(!colors||typeof colors!=='object'||Array.isArray(colors))throw Error('UI colors must be an object of role names to #rrggbb values.');
  const merged={...base};
  for(const [role,value] of Object.entries(colors)){
    if(!UI_COLOR_ROLES.includes(role))throw Error(`Unknown UI colour role: ${role}. Roles: ${UI_COLOR_ROLES.join(', ')}.`);
    if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error(`UI colour ${role} must be a #rrggbb value.`);
    merged[role]=value.toLowerCase();
  }
  for(const [i,a] of DISTINCT_ROLES.entries())for(const b of DISTINCT_ROLES.slice(i+1))if(merged[a]===merged[b])throw Error(`UI colours ${a} and ${b} must differ; both are ${merged[a]}.`);
  return {colors:merged,overrides:UI_COLOR_ROLES.filter(role=>Object.hasOwn(colors,role))};
}
/** Rows and columns for `count` equal cells: the squarest sheet (by pixels) within `maxWidth`, then the fewest empty cells. */
export function packGrid(count,width,height,maxWidth=1024){
  let best=null;
  for(let cols=1;cols<=count;cols++){
    const rows=Math.ceil(count/cols),W=cols*width,H=rows*height;
    if(W>maxWidth&&cols>1)break;
    const score=[Math.max(W,H)/Math.min(W,H),rows*cols-count];
    if(!best||score[0]<best.score[0]-1e-9||(Math.abs(score[0]-best.score[0])<1e-9&&score[1]<best.score[1]))best={cols,rows,score};
  }
  return {cols:best.cols,rows:best.rows};
}
/** One-cell logotype frame `logo`: lettering, sun and wheat as a single raster (see ui-logo.js). */
function generateLogoRecipe(config,{name,theme,COLORS,overrides}){
  if(config.characters!==undefined||config.face!==undefined)throw Error('Characters and face apply only to fonts.');
  const raster=logoRaster({text:config.text},COLORS),{width,height}=raster;
  const operations=[{command:'new',name,size:`${width}x${height}`,cols:1,rows:1,palette:'pico8'},{command:'clear',cell:'0,0'},{command:'name',cell:'0,0',as:'logo'}],names=[],bounds={left:width,top:height,right:-1,bottom:-1};
  raster.rows.forEach((row,y)=>{for(let x=0;x<width;){const key=row[x];if(key==='.'){x++;continue;}const start=x;while(x<width&&row[x]===key)x++;
    const shape=`pixel_run_${names.length}`;names.push(shape);operations.push({command:'draw',cell:'0,0',type:'rect',name:shape,color:raster.palette[key],filled:true,x:start,y,w:x-start,h:1});
    bounds.left=Math.min(bounds.left,start);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x-1);bounds.bottom=Math.max(bounds.bottom,y);}});
  operations.push({command:'shape-group',sub:'create',cell:'0,0',name:'logo',shapes:names});
  return {operations,report:{version:1,ok:true,kind:'logo',theme,cellSize:{width,height},colors:COLORS,...(overrides?{colorOverrides:overrides}:{}),frames:[{alias:'logo',cell:'0,0',bounds}],logo:{text:config.text??DEFAULT_LOGO_TEXT,colors:Object.values(raster.palette)}}};
}
export function generateUIRecipe(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('UI recipe must be an object.');
  for(const k of Object.keys(config))if(!['name','kind','theme','colors','characters','face','text','displayRamps'].includes(k))throw Error(`Unknown UI field: ${k}`);
  const {kind,name=kind==='font'?'ui-font':'ui-skin',theme='moss-brass'}=config;
  if(!['font','skin','logo'].includes(kind))throw Error('UI kind must be font, skin or logo.');
  if(typeof name!=='string'||!/^[a-z][a-z0-9_-]{0,47}$/.test(name))throw Error('Invalid UI name.');
  if(!Object.hasOwn(UI_THEMES,theme))throw Error('Unsupported UI theme.');
  const {colors:COLORS,overrides}=resolveUIColors(UI_THEMES[theme],config.colors);
  if(config.displayRamps!==undefined&&(kind!=='font'||config.face!=='display'))throw Error('displayRamps applies only to fonts with face display.');
  if(kind==='logo')return generateLogoRecipe(config,{name:config.name??'ui-logo',theme,COLORS,overrides});
  if(config.text!==undefined)throw Error('Text applies only to logos.');
  if(kind==='skin'&&config.characters!==undefined)throw Error('Characters apply only to fonts.');
  if(kind==='skin'&&config.face!==undefined)throw Error('Face applies only to fonts.');
  const face=config.face??'regular',compact=face==='compact',display=face==='display';
  if(!['regular','compact','display'].includes(face))throw Error('Unsupported font face.');
  const masks=compact?COMPACT_GLYPHS:FONT_GLYPHS;
  const characters=config.characters??FONT_CHARACTERS;
  if(typeof characters!=='string'||!characters.length)throw Error('Font characters must be a nonempty string.');
  const chars=[...new Set([...characters,'?',' '])].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0));
  if(kind==='font')for(const char of chars)if(char!==' '&&!FONT_GLYPHS[char])throw Error(`Unsupported font character: ${char}`);
  const {steps:displaySteps,report:displayReport}=resolveDisplayRamps(COLORS,config.displayRamps);
  const tones=FONT_TONES,width=kind==='font'?(display?DISPLAY_CELL.width:compact?6:8):24,height=kind==='font'?(display?DISPLAY_CELL.height:compact?10:12):24;
  const entries=kind==='font'?chars.filter(c=>c!==' ').flatMap(char=>tones.map(tone=>({char,tone,alias:`glyph_${char.codePointAt(0).toString(16).padStart(4,'0')}_${tone}`}))):skinDefinitions(theme);
  // A near-square sheet; the cells that pad the last row stay empty and unnamed. Frame names never depend on the layout.
  const {cols,rows}=packGrid(entries.length,width,height);
  const operations=[{command:'new',name,size:`${width}x${height}`,cols,rows,palette:'pico8'}],frames=[],glyphs={},skins={};
  if(kind==='font')for(const char of chars)glyphs[char]={advance:display?(char===' '?8:DISPLAY_CELL.advance):char===' '?(compact?3:4):(compact?5:6),frames:{},bounds:null};
  for(const [index,entry] of entries.entries()){
    const cell=`${Math.floor(index/cols)},${index%cols}`,alias=entry.alias,names=[],bounds={left:width,top:height,right:-1,bottom:-1};
    operations.push({command:'clear',cell},{command:'name',cell,as:alias});
    function rect(x,y,w,h,color){
      if(![x,y,w,h].every(Number.isInteger)||w<1||h<1||x<0||y<0||x+w>width||y+h>height)throw Error(`Out-of-cell UI rectangle: ${alias}`);
      const name=`pixel_run_${names.length}`;names.push(name);operations.push({command:'draw',cell,type:'rect',name,color,filled:true,x,y,w,h});
      bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x+w-1);bounds.bottom=Math.max(bounds.bottom,y+h-1);
    }
    if(kind==='font'){
      if(display){
        const ramp=displaySteps[entry.tone],run=k=>k==='d'&&ramp.d===ramp.o?'o':k;
        displayGlyph(entry.char).forEach((row,y)=>{for(let x=0;x<width;){const key=run(row[x]);if(key==='.'){x++;continue;}const start=x;while(x<width&&run(row[x])===key)x++;rect(start,y,x-start,1,ramp[key]);}});
      }else{
      const glyph=masks[entry.char];
      glyph.rows.forEach((mask,row)=>{for(let x=0;x<5;){if(!(mask&(1<<(4-x)))){x++;continue;}const start=x;while(x<5&&(mask&(1<<(4-x))))x++;rect(start,row+glyph.top,x-start,1,COLORS[entry.tone]);}});
      }
      glyphs[entry.char].frames[entry.tone]=alias;glyphs[entry.char].bounds={...bounds};
    }else{drawSkin(entry.alias,rect,COLORS);skins[alias]=entry.metrics;}
    operations.push({command:'shape-group',sub:'create',cell,name:kind,shapes:names});frames.push({alias,cell,bounds,...(kind==='font'?{character:entry.char,tone:entry.tone}:{})});
  }
  return {operations,report:{version:1,ok:true,kind,theme,cellSize:{width,height},colors:COLORS,...(overrides?{colorOverrides:overrides}:{}),...(displayReport?{displayRamps:displayReport}:{}),frames,...(kind==='font'?{...(compact||display?{face}:{}),baseline:display?DISPLAY_CELL.baseline:compact?7:9,lineHeight:height,fallback:'?',symbols:Object.fromEntries(Object.entries(FONT_SYMBOLS).filter(([,c])=>glyphs[c])),glyphs}:{skins})}};
}
