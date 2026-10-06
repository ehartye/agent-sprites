import {FONT_GLYPHS} from './ui-font.js';
import {epx} from './ui-display.js';

// Logotype: capital lettering at 4x (the regular masks smoothed twice with EPX) in a lit gold-to-copper gradient, a dark outline
// inside a brass one, a hard drop shadow, over a striped sun and a horizon of wheat. Pure pixel art from one deterministic raster,
// so a game draws it as one atlas frame (a title screen) with no scaling.
export const LOGO_SCALE=4;
const GAP=3,LINE_GAP=6,PAD_X=16,PAD_TOP=24,PAD_BOTTOM=25,SHADOW=3;

function letter(char){
  const g=FONT_GLYPHS[char];
  if(!g||g.top!==2||g.rows.length!==7)throw Error(`Logo text supports letters and digits drawn on seven rows, not: ${char}`);
  return epx(epx(g.rows.map(mask=>Array.from({length:5},(_,x)=>Boolean(mask&(1<<(4-x)))))));
}
const dilate=(mask,r)=>mask.map((row,y)=>row.map((_,x)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(mask[y+dy]?.[x+dx])return true;return false;}));

/** Palette-key raster of the logo: `{width,height,rows,palette}` where each row is a string of one-letter keys and `.` is empty. */
export function logoRaster({text='FALLOW\nVALLEY'}={},c){
  if(typeof text!=='string'||!text.trim())throw Error('Logo text must be a nonempty string.');
  const lines=text.toUpperCase().split('\n').map(s=>s.trim()),cellH=7*LOGO_SCALE,advance=5*LOGO_SCALE+GAP;
  const lineW=s=>[...s].length*advance-GAP,maxW=Math.max(...lines.map(lineW));
  const W=maxW+2*PAD_X,blockH=lines.length*cellH+(lines.length-1)*LINE_GAP,H=PAD_TOP+blockH+PAD_BOTTOM;
  const grid=()=>Array.from({length:H},()=>Array(W).fill(false));
  const fill=grid(),rowOf=Array.from({length:H},()=>Array(W).fill(0));
  lines.forEach((s,li)=>{
    const x0=Math.floor((W-lineW(s))/2),y0=PAD_TOP+li*(cellH+LINE_GAP);
    [...s].forEach((ch,i)=>{if(ch===' ')return;letter(ch).forEach((row,y)=>row.forEach((v,x)=>{if(v){fill[y0+y][x0+i*advance+x]=true;rowOf[y0+y][x0+i*advance+x]=y;}}));});
  });
  const P={k:c.shadow,e:c.edge,h:'#fff7c4',a:'#f6e07a',b:c.gold,d:'#e0b84a',f:'#d98b2c',g:c.wornCopper,s:'#8c3b25',r:'#5e2a1f',m:c.moss,o:'#e0903a',q:'#e8a448',w:'#e0b84a',n:c.light,t:'#3a2a1f'};
  const out=Array.from({length:H},()=>Array(W).fill('.'));
  // sun: a disc behind the lettering with horizontal gaps that widen toward the horizon
  const R=Math.min(W/2-2,46),cx=W/2-.5,cy=2+R;
  for(let y=0;y<H-PAD_BOTTOM+10;y++)for(let x=0;x<W;x++){
    const d=Math.hypot(x-cx,y-cy);if(d>R)continue;
    const below=y-cy;if(below>2&&Math.floor((below-2)/3)%2===1)continue;
    out[y][x]=d>R-2?'o':below<-R/3?'q':below<8?'g':'s';
  }
  // horizon: ground band and wheat
  const gy=H-4;
  for(let x=0;x<W;x++){out[gy][x]='e';out[gy+1][x]='n';out[gy+2][x]='b';out[gy+3][x]='t';}
  for(let i=0,x=4;x<W-3;i++,x+=7+(i%2)){
    const h=7+((i*5)%6);
    for(let y=gy-h;y<gy;y++)out[y][x]='m';
    for(let k=0;k<4;k++){const y=gy-h-1-k*2;out[y][x]='w';out[y][x-1]='w';out[y][x+1]='w';out[y-1][x]='w';}
    out[gy-h-8][x]='h';out[gy-h-7][x]='w';
  }
  // lettering: shadow, brass ring, dark ring, then the lit face
  const d1=dilate(fill,1),d2=dilate(fill,2),shifted=fill.map((row,y)=>row.map((_,x)=>Boolean(fill[y-SHADOW]?.[x-SHADOW]))),sh=dilate(shifted,1);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(fill[y][x]){
      const r=rowOf[y][x],topEdge=!fill[y-1]?.[x];
      out[y][x]=topEdge?'h':r<8?'a':r<14?'b':r<19?'d':r<23?'f':'g';
      if(!fill[y+1]?.[x]&&r>=23)out[y][x]='s';
    }else if(d1[y][x])out[y][x]='k';
    else if(d2[y][x])out[y][x]='e';
    else if(sh[y][x]&&out[y][x]!=='.'||sh[y][x])out[y][x]='k';
  }
  return {width:W,height:H,rows:out.map(r=>r.join('')),palette:P};
}
