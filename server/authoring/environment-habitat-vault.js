import {KIT,seamBand,port,ventPanel} from './environment-habitat-trim.js';
import {arcPoints,boxRect,clipPoly,ellipsePoly,tidy} from './environment-habitat-geometry.js';

// Seed vault: a broad vaulted hangar roof in three copper planes, a riveted seam, a wooden wall with
// two cargo hatches, and a tall banded seed silo at each end that rises above the vault.
// The caller draws the door (x128..191) and open recess afterwards, so the wall runs full width behind it.

/** Hard-terminator vertical planes: cols[0] fills the form, later cols overlay slabs from edge[i] onward. */
function planes(p,prefix,poly,x0,x1,cols,cuts){
  p.poly(`${prefix}_base`,poly,cols[0]);
  const edges=[x0,...cuts.map(c=>Math.floor(x0+(x1-x0)*c)),x1+1];
  for(let i=1;i<cols.length;i++){
    const part=clipPoly(poly,{x0:edges[i],x1:edges[i+1]});
    if(part)p.poly(`${prefix}_plane_${i}`,part,cols[i]);
  }
}

export function vault(p,t){
  const CX=160,CY=148.5,RX=120,RY=94.5;
  const dome=(rx,ry,extra=0)=>tidy([...arcPoints(CX,CY,rx,ry,180,360,72),[CX+rx,CY+extra],[CX-rx,CY+extra]]);
  const silos=[[12,60],[260,308]];

  // Outline ring first, so every fill below sits inside it.
  p.rect('vault_vent_outline',125,42,71,20,KIT.ink);
  p.poly('vault_arch_outline',dome(RX+2,RY+2,3.5),KIT.ink);
  for(const [i,[x0,x1]] of silos.entries()){
    p.rect(`vault_silo_outline_${i}`,x0-2,72,x1-x0+5,149,KIT.ink);
    p.poly(`vault_silo_dome_outline_${i}`,ellipsePoly(x0+24.5,72.5,26.5,8.5),KIT.ink);
  }

  // Vault roof: three flat copper planes, vertical ribs, riveted seam, ridge vent.
  planes(p,'vault_roof',dome(RX,RY,2.5),40,279,[KIT.roofBase,KIT.roofShade,KIT.roofShade],[.34,.74]);
  for(let x=64;x<260;x+=24){
    if(Math.abs(x-160)<6)continue;
    const top=Math.ceil(CY-RY*Math.sqrt(1-((x+.5-CX)/RX)**2));
    p.rect(`vault_rib_${x}`,x,top,1,142-top,x<121?KIT.roofShade:KIT.roofBase);
  }
  seamBand(p,'vault',40,279,142,150,{base:KIT.roofBase,lit:KIT.roofLit,shade:KIT.dark,rivet:KIT.roofLit});
  ventPanel(p,'vault',128,46,192,60,{base:KIT.roofLit,slot:KIT.roofShade});

  // Wooden wall with two cargo hatches and a dark plinth band.
  boxRect(p,'vault_wall',40,151,239,218,t.lit);
  boxRect(p,'vault_wall_far',240,151,279,218,t.wall);
  for(const [i,x0] of [74,204].entries()){
    const face=x0<150?t.mid:t.base;
    p.rect(`vault_hatch_frame_${i}`,x0,160,45,47,t.shade);
    p.rect(`vault_hatch_face_${i}`,x0+3,163,39,41,face);
    for(let y=167;y<201;y+=6)p.line(`vault_hatch_slat_${i}_${y}`,x0+3,y,x0+41,y,t.shade);
  }
  boxRect(p,'vault_plinth',40,200,279,218,t.base);

  // Seed silos: banded, with a domed copper cap, service rungs and a porthole.
  for(const [i,[x0,x1]] of silos.entries()){
    const body=tidy([...arcPoints(x0+24.5,71.5,24.5,5.5,180,360,24),[x1+1,72],[x1+1,219],[x0,219],[x0,72]]);
    planes(p,`vault_silo_${i}`,body,x0,x1,[t.lit,t.mid,t.base,t.shade],[.14,.42,.74]);
    for(const y of [112,150,188])p.rect(`vault_silo_band_${i}_${y}`,x0,y,x1-x0+1,3,t.shade);
    const cap=ellipsePoly(x0+24.5,71.5,22.5,4.5,24);
    p.poly(`vault_silo_cap_${i}`,cap,KIT.brass);
    p.ellipse(`vault_silo_cap_light_${i}`,x0+14,68,9,2,KIT.gold);
    // the cap would cut the ink ring into two runs; one outline pixel keeps it whole at half size
    if(p.pixelScale===2)p.src.rect(`vault_silo_ring_join_${i}`,i?153:29,33,1,1,KIT.ink);
    for(let y=120;y<212;y+=8)p.rect(`vault_silo_rung_${i}_${y}`,x1-4,y,4,1,KIT.brass);
  }
  port(p,'vault_port_l',36,134,8);
  port(p,'vault_port_r',284,134,8);
}
