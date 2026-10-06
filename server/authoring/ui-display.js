import {FONT_GLYPHS} from './ui-font.js';

// Display face: the regular lettering redrawn at twice the size for logos, banners and boss names.
// Each five-by-seven mask is smoothed with the EPX (Scale2x) rule, so curves and diagonals get real pixel steps instead of
// doubled blocks, then lit like a bevel (top edge highlight, bottom edge shade) and wrapped in an outline with a drop shadow.
// It covers every regular glyph, so a string the regular face can draw the display face can draw.
export const DISPLAY_CELL=Object.freeze({width:12,height:24,advance:12,baseline:19,lineHeight:24});

const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
/** Highlight, face, shade and outline colours for one font tone, derived from the theme so every theme gets a matching face. */
export function displayRamp(tone,c){
  const base=c[tone];
  if(tone==='ink')return {h:mix(base,c.specimenWell,.7),f:base,s:mix(base,c.shadow,.4),o:c.light};
  if(tone==='gold')return {h:mix(base,'#ffffff',.55),f:base,s:mix(base,c.wornCopper,.6),o:c.shadow};
  if(tone==='cream')return {h:mix(base,'#ffffff',.6),f:base,s:mix(base,c.edge,.55),o:c.shadow};
  return {h:mix(base,'#ffffff',.45),f:base,s:mix(base,c.shadow,.5),o:c.shadow};
}

function sourceGrid(glyph){
  const rows=[...Array(glyph.top).fill(0),...glyph.rows];
  return rows.map(mask=>Array.from({length:5},(_,x)=>Boolean(mask&(1<<(4-x)))));
}
function epx(grid){
  const h=grid.length,w=5,at=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&grid[y][x];
  const out=Array.from({length:h*2},()=>Array(w*2).fill(false));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=at(x,y),a=at(x,y-1),b=at(x+1,y),c=at(x-1,y),d=at(x,y+1);
    out[2*y][2*x]=c===a&&c!==d&&a!==b?a:p;
    out[2*y][2*x+1]=a===b&&a!==c&&b!==d?b:p;
    out[2*y+1][2*x]=d===c&&d!==b&&c!==a?c:p;
    out[2*y+1][2*x+1]=b===d&&b!==a&&d!==c?d:p;
  }
  return out;
}
const cache=new Map();
/** A 12x24 grid of pixel keys: `.` empty, `o` outline or shadow, `h` highlight, `f` face, `s` shade. */
export function displayGlyph(char){
  if(cache.has(char))return cache.get(char);
  const glyph=FONT_GLYPHS[char];if(!glyph)throw Error(`Unsupported display character: ${char}`);
  const {width:W,height:H}=DISPLAY_CELL,big=epx(sourceGrid(glyph)),on=Array.from({length:H},()=>Array(W).fill(false));
  big.forEach((row,y)=>row.forEach((v,x)=>{if(v)on[y+1][x+1]=true;}));
  const isOn=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&on[y][x];
  const grid=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>{
    if(isOn(x,y))return !isOn(x,y-1)?'h':!isOn(x,y+1)?'s':'f';
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(isOn(x+dx,y+dy))return 'o';
    return isOn(x-1,y-1)||isOn(x,y-1)||isOn(x-1,y)?'o':'.';
  }).join(''));
  cache.set(char,grid);return grid;
}
