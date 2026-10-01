import {arcPoints,drawPlanes,roundedRectPoly,tidy} from './environment-habitat-geometry.js';
import {KIT,port,seamBand,ventPanel} from './environment-habitat-trim.js';

// Garden capsule: a low barrel hull with a clay roof in three flat planes, a riveted pressure seam,
// a tan paneled wall with two round ports, a glass crop tower on the left shoulder and a roof vent.
const SLATE_SHADE='#405762',SLATE_BASE='#607d8b';

// Hull top edge (y) at column x: a 46px rounded corner on each side of the flat top.
function hullTop(x){
  const dx=x<62?62-x:x>257?x-257:0;
  return 142-Math.sqrt(Math.max(0,46*46-dx*dx));
}

const wallRect=(p,name,x0,y0,x1,y1,color)=>p.rect(name,x0,y0,x1-x0+1,y1-y0+1,color);

export function capsule(p,t){
  const clay={lit:t.lit,mid:t.mid,base:t.base,shade:t.shade};
  const roofPoly=roundedRectPoly(16,96,303,149,{tl:46,tr:46});

  // ink outline first, so every fill below sits inside it
  p.poly('capsule_hull_outline',roundedRectPoly(14,94,305,149,{tl:48,tr:48}),KIT.ink);
  p.rect('capsule_side_outline_l',14,140,2,80,KIT.ink);
  p.rect('capsule_side_outline_r',304,140,2,80,KIT.ink);
  p.poly('capsule_tower_outline',tidy([...arcPoints(64,41,32,17,180,360,24),[96,110],[32,110]]),KIT.ink);
  p.rect('capsule_vent_outline',230,80,38,18,KIT.ink);
  p.rect('capsule_finial_outline',58,10,12,19,KIT.ink);

  // clay roof in three flat planes with raised ribs
  drawPlanes(p,'capsule_roof',roofPoly,16,303,{base:clay.lit,slabs:[[0.10,clay.lit],[0.38,clay.mid],[0.74,clay.base],[1,clay.shade]]});
  for(const x of [48,96,224,272]){
    const top=Math.ceil(Math.max(hullTop(x),hullTop(x+1),hullTop(x-1)));
    p.rect(`capsule_rib_${x}`,x,top,2,150-top,clay.shade);
    p.rect(`capsule_rib_lip_${x}`,x-1,top,1,150-top,x<160?clay.lit:clay.mid);
  }
  seamBand(p,'capsule',16,303,142,150,{base:clay.shade,lit:clay.base,shade:KIT.dark,rivet:clay.lit});

  // tan paneled wall, shaded toward the right, with a darker plinth
  wallRect(p,'capsule_wall',16,151,250,219,t.wall);
  wallRect(p,'capsule_wall_shade',251,151,303,219,KIT.brass);
  for(let x=48;x<300;x+=32){
    const color=x<250?KIT.brass:clay.shade;
    p.rect(`capsule_panel_${x}`,x,152,1,48,color);
  }
  wallRect(p,'capsule_plinth',16,200,303,219,clay.base);
  port(p,'capsule_port_l',72,180,15);
  port(p,'capsule_port_r',248,180,15);

  // glass crop tower
  const towerPoly=tidy([...arcPoints(64,41,30,15,180,360,24),[94,110],[34,110]]);
  drawPlanes(p,'capsule_tower',towerPoly,34,94,{base:KIT.glint,slabs:[[0.10,KIT.glint],[0.40,KIT.sea],[0.74,KIT.glass],[1,SLATE_SHADE]]});
  for(const x of [54,74])p.rect(`capsule_tower_mullion_${x}`,x,41,1,70,KIT.brass);
  for(const y of [60,84])p.rect(`capsule_tower_band_${y}`,34,y,61,3,KIT.brass);
  for(let x=39;x<89;x+=10){
    p.rect(`capsule_crop_${x}`,x,98,5,12,KIT.leaf);
    p.rect(`capsule_crop_stem_${x}`,x+1,94,3,4,'#779566');
  }
  p.ellipse('capsule_tower_cap',64,36,27,8,KIT.brass);
  p.ellipse('capsule_tower_cap_light',52,33,10,3,KIT.gold);
  p.rect('capsule_finial',62,14,4,15,KIT.brass);
  p.rect('capsule_finial_top',60,12,8,3,KIT.gold);

  // roof vent
  ventPanel(p,'capsule',232,84,266,98,{base:SLATE_BASE,slot:SLATE_SHADE});
}
