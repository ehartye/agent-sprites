// Hull trim shared by every module style, so the farm deck reads as one habitat system:
// a riveted pressure seam at the eaves, hazard chevrons on the door jambs, a roof vent, and round ports.

export const KIT={ink:'#344751',dark:'#283c44',brass:'#a9895e',gold:'#d4b47c',glass:'#527b8b',glint:'#bce0d3',light:'#f4edcf',cream:'#dfddbd',leaf:'#a7bb79',sea:'#83b5af',
  // Dark clay roof ramp for the hull roofs: the lit edge turns warmer, the shade turns cooler and redder, all below the walls' value.
  roofLit:'#9a6a50',roofBase:'#7a4c3c',roofShade:'#573738'};

/** Riveted pressure seam: a flat band with a lit top row, a dark bottom row and evenly spaced rivets. */
export function seamBand(p,prefix,x0,x1,y0,y1,{base,lit,shade,rivet}){
  p.rect(`${prefix}_seam`,x0,y0,x1-x0+1,y1-y0+1,base);
  p.line(`${prefix}_seam_lit`,x0,y0,x1,y0,lit);
  p.line(`${prefix}_seam_shade`,x0,y1,x1,y1,shade);
  const y=Math.floor((y0+y1)/2);
  for(let x=x0+8;x<=x1-6;x+=16)p.rect(`${prefix}_rivet_${x}`,x,y,2,2,rivet);
}

/** Alternating brass and ink bars on both door jambs, between the lintel and the threshold. */
export function hazardChevrons(p){
  for(const [side,x] of [['left',128],['right',184]]){
    for(let i=0,y=178;y<214;i++,y+=6)p.rect(`hazard_${side}_${i}`,x,y,8,3,i%2?KIT.ink:KIT.gold);
  }
}

/** The same chevrons on the interior door frame: the south wall's two jambs (y220..241), gold and ink bars. */
export function interiorChevrons(p,prefix){
  for(const [side,x] of [['left',128],['right',184]]){
    for(let i=0;i<4;i++)p.rect(`${prefix}_hazard_${side}_${i}`,x,221+i*6,8,3,i%2?KIT.ink:KIT.gold);
  }
}

/** Round port: ink ring, brass rim, glass, shaded lower half and a diagonal glint at the upper left. */
export function port(p,prefix,cx,cy,r){
  p.ellipse(`${prefix}_ring`,cx,cy,r,r,KIT.ink);
  p.ellipse(`${prefix}_rim`,cx,cy,r-2,r-2,KIT.brass);
  p.ellipse(`${prefix}_glass`,cx,cy,r-4,r-4,KIT.glass);
  const lo=r-4;
  p.poly(`${prefix}_shade`,[[cx-lo+1,cy+1],[cx+lo-1,cy+1],[cx+Math.round(lo*.7),cy+Math.round(lo*.7)],[cx-Math.round(lo*.7),cy+Math.round(lo*.7)]],'#405762');
  const g=Math.round(r/2);
  for(let i=0;i<3;i++)p.rect(`${prefix}_glint_${i}`,cx-g+i*2,cy-g+1+i*2,2,2,KIT.glint);
}

/** Louvred roof vent with a brass cap. */
export function ventPanel(p,prefix,x0,y0,x1,y1,{base,slot}){
  p.rect(`${prefix}_vent`,x0,y0,x1-x0+1,y1-y0+1,base);
  for(let y=y0+3;y<y1-1;y+=3)p.line(`${prefix}_vent_slot_${y}`,x0+3,y,x1-3,y,slot);
  p.rect(`${prefix}_vent_cap`,x0-1,y0-2,x1-x0+3,2,KIT.brass);
}
