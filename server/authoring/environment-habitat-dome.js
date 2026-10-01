// Commons dome: a half-round glass dome in three flat planes, meridian ribs, a docking ring, solar louvers
// and a cream wall with two panoramic planter windows. Light comes from the upper left.
import {arcPoints,boxRect,clipPoly,thickLine,tidy} from './environment-habitat-geometry.js';
import {KIT} from './environment-habitat-trim.js';

const SG={d:'#506a59',m:'#779566',l:'#96ad7b',h:'#c1d3a0',cr:'#dfddbd'};
const CX=160,BASE=158,R=138;

/** Sutherland-Hodgman clip of a polygon against a convex polygon (clockwise or counter-clockwise). */
function clipConvex(subject,clip){
  let out=subject;
  const area=clip.reduce((s,[x,y],i)=>{const [nx,ny]=clip[(i+1)%clip.length];return s+x*ny-nx*y;},0);
  const sign=area>=0?1:-1;
  for(let i=0;i<clip.length&&out.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length];
    const side=q=>sign*((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]));
    const next=[];
    for(let j=0;j<out.length;j++){
      const s=out[j],e=out[(j+1)%out.length],ss=side(s),se=side(e);
      if(ss>=0)next.push(s);
      if((ss>=0)!==(se>=0)){const k=ss/(ss-se);next.push([s[0]+(e[0]-s[0])*k,s[1]+(e[1]-s[1])*k]);}
    }
    out=next;
  }
  return out.length?tidy(out):null;
}

export function dome(p,t){
  const {ink,brass,glass,glint,sea}=KIT;
  const rect=(name,...box)=>boxRect(p,name,...box);
  const half=r=>arcPoints(CX,BASE,r,r,180,360,Math.ceil(r*1.2));
  const domePoly=tidy([...half(R),[CX+R,BASE],[CX-R,BASE]]);
  const inDome=poly=>poly&&clipConvex(poly,domePoly);
  const slab=(name,poly,color)=>{const q=inDome(poly);if(q)p.poly(name,q,color);};

  // Outlines first, so every fill sits on top: stack, dome, ring.
  p.rect('dome_stack_outline',262,50,23,47,ink);
  p.poly('dome_outline',tidy([...half(R+2),[CX+R+2,BASE],[CX-R-2,BASE]]),ink);
  rect('dome_ring_outline',14,146,305,172,ink);

  // Glass shell in three hard planes: mint lit, sea base, glass shadow.
  const x0=CX-R,x1=CX+R,cut1=Math.floor(x0+(x1-x0)*0.30),cut2=Math.floor(x0+(x1-x0)*0.74);
  p.poly('dome_glass_lit',domePoly,'#bce0d3');
  const sea_=clipPoly(domePoly,{x0:cut1});if(sea_)p.poly('dome_glass_base',sea_,sea);
  const shade=clipPoly(domePoly,{x0:cut2});if(shade)p.poly('dome_glass_shadow',shade,glass);

  // Seven meridian ribs, lit on the left, shaded on the right, clipped to the shell.
  for(let k=-3;k<=3;k++){
    const rib=thickLine(CX+k*40,BASE,CX+k*12,24,4);
    slab(`dome_rib_${k+3}`,rib,k<2?SG.m:SG.d);
  }
  // Two parallels with a lit top row.
  for(const [y,hw,i] of [[108,122,0],[64,82,1]]){
    slab(`dome_parallel_${i}`,[[CX-hw,y],[CX+hw+1,y],[CX+hw+1,y+4],[CX-hw,y+4]],SG.m);
    slab(`dome_parallel_lit_${i}`,[[CX-hw,y],[CX+hw+1,y],[CX+hw+1,y+1],[CX-hw,y+1]],SG.l);
  }
  for(const [gx,gy] of [[70,120],[96,84],[124,52],[150,34]])slab(`dome_glint_${gx}`,[[gx,gy],[gx+4,gy],[gx+4,gy+6],[gx,gy+6]],glint);

  // Exhaust stack on the right shoulder.
  p.rect('dome_stack',266,56,15,41,SG.m);
  p.rect('dome_stack_lit',266,56,3,41,SG.h);
  p.rect('dome_stack_cap',264,52,19,5,brass);

  // Docking ring: three planes, a shaded underside and rivets.
  const rx0=16,rx1=303,ra=Math.floor(rx0+(rx1-rx0)*0.10),rb=Math.floor(rx0+(rx1-rx0)*0.80);
  rect('dome_ring_lit',rx0,148,ra-1,172,SG.h);
  rect('dome_ring_base',ra,148,rb-1,172,SG.l);
  rect('dome_ring_shade',rb,148,rx1,172,SG.m);
  rect('dome_ring_under',rx0,170,rx1,172,SG.d);
  if(p.pixelScale===2)for(let x=13;x<148;x+=9)p.src.rect(`dome_ring_rivet_${x*2}`,x,80,2,1,SG.cr);
  else for(let x=26;x<296;x+=18)rect(`dome_ring_rivet_${x}`,x,160,x+1,161,SG.cr);

  // Solar louvers, alternating cream and sage; the ink behind shows as the slats' gaps.
  rect('dome_louver_backing',16,173,303,190,ink);
  for(let i=0,x=20;x<300;i++,x+=20){
    rect(`dome_louver_${i}`,x,174,x+17,190,i%2?SG.l:SG.cr);
    if(!(p.pixelScale===2&&i===8))rect(`dome_louver_shade_${i}`,x,189,x+17,190,SG.m);
  }

  // Cream wall with the lit left face and a shaded right end.
  rect('dome_wall_lit',16,191,Math.floor(16+287*0.86)-1,218,SG.cr);
  rect('dome_wall_shade',Math.floor(16+287*0.86),191,303,218,SG.l);

  // Two panoramic planter windows.
  for(const [i,wx] of [[0,30],[1,214]]){
    p.rect(`dome_window_${i}_frame`,wx,194,79,21,ink);
    p.rect(`dome_window_${i}_rim`,wx+2,196,75,17,brass);
    p.rect(`dome_window_${i}_glass`,wx+4,198,71,13,glass);
    p.rect(`dome_window_${i}_glint`,wx+4,198,71,3,'#bce0d3');
    for(let px=wx+8;px<wx+72;px+=10)p.rect(`dome_window_${i}_leaf_${px}`,px,205,4,6,'#a7bb79');
  }
}
