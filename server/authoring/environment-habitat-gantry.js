import {KIT,seamBand} from './environment-habitat-trim.js';
import {arcPoints,clipPoly,drawPlanes,ellipsePoly,thickLine} from './environment-habitat-geometry.js';

// Service gantry: a flat slate hall with chamfered corners and a roof solar array, a pressure tank
// on the left, and a lattice mast carrying a boom, stay cable, counterweight and hook on the right.
// Light is from the top left; every curved form is flat planes with hard terminators.
const SL=['#405762','#607d8b','#7896a0','#91a3a0','#a4c2c3'];
const {ink:INK,dark:DARK,glass:GLASS,brass:COPPER,gold:BRASS}=KIT;

export function gantry(p0,t){
  const rnd=pts=>pts.map(([x,y])=>[Math.round(x),Math.round(y)]);
  const p={rect:(...a)=>p0.rect(...a),line:(...a)=>p0.line(...a),ellipse:(...a)=>p0.ellipse(...a),poly:(n,pts,c)=>p0.poly(n,rnd(pts),c)};
  // Inclusive-corner rectangle, matching the approved concept's pixel boxes.
  const R=(n,x0,y0,x1,y1,c)=>p.rect(n,x0,y0,x1-x0+1,y1-y0+1,c);
  // Two-pixel ink outline around a rectangle with the corners rounded off.
  const ring=(n,x0,y0,x1,y1)=>p.poly(n,[[x0-2,y0-1],[x0-1,y0-2],[x1+1,y0-2],[x1+2,y0-1],[x1+2,y1+1],[x1+1,y1+2],[x0-1,y1+2],[x0-2,y1+1]],INK);

  // Outlines first, so every part fill sits on top of its neighbours' rings.
  p.poly('gantry_hall_ink',[[14,219],[14,125],[29,112],[291,112],[305,125],[305,219]],INK);
  const tankTop=arcPoints(49,55,21,5,180,360,14);
  p.poly('gantry_tank_ink',[[26,114],[26,54],...arcPoints(49,55,23,7,180,360,16),[72,54],[72,114]],INK);
  ring('gantry_stack_ink',44,32,54,52);
  ring('gantry_mast_ink',252,12,272,114);ring('gantry_mast_cap_ink',246,6,278,12);
  ring('gantry_counterweight_ink',272,16,294,40);
  p.poly('gantry_boom_ink',[[252,19],[124,27],[124,41],[252,39]],INK);
  p.poly('gantry_boom_ink_tip',[[123,29],[126,27],[126,41],[123,39]],INK);
  p.poly('gantry_cable_ink',thickLine(266,10,130,29,5),INK);
  ring('gantry_hook_line_ink',139,38,140,78);ring('gantry_hook_ink',135,78,144,88);

  // Roof hall: chamfered body in three planes.
  const body=[[16,152],[16,126],[30,114],[290,114],[303,126],[303,152]];
  drawPlanes(p,'gantry_roof',body,16,304,{base:SL[2],slabs:[[.08,SL[2]],[.8,SL[1]],[1,SL[0]]]});
  for(let x=48;x<300;x+=40)R(`gantry_roof_rib_${x}`,x,116,x,140,SL[0]);
  // Solar array.
  R('gantry_solar_frame',60,118,168,142,INK);
  for(let gx=62;gx<168;gx+=12)for(let gy=120;gy<141;gy+=7)R(`gantry_solar_${gx}_${gy}`,gx,gy,gx+10,gy+5,GLASS);
  R('gantry_solar_glint',62,119,166,119,SL[4]);
  seamBand(p,'gantry_hall',16,303,144,152,{base:SL[0],lit:SL[1],shade:DARK,rivet:BRASS});

  // Wall, full width; the caller's door covers x128..191 afterwards.
  R('gantry_wall_a',16,153,261,218,SL[3]);R('gantry_wall_b',262,153,303,218,SL[2]);
  for(const x of [48,80,112,144,176,208,240,272])R(`gantry_wall_joint_${x}`,x,154,x,217,SL[1]);
  R('gantry_wall_joint_299',299,154,299,217,SL[1]);
  R('gantry_wall_base',16,200,303,218,SL[0]);

  // Slot window.
  R('gantry_window_ink',40,166,104,192,INK);R('gantry_window_frame',43,169,101,189,COPPER);
  R('gantry_window_glass',46,172,98,186,GLASS);R('gantry_window_sky',46,172,98,175,SL[4]);R('gantry_window_mullion',72,172,73,186,COPPER);
  // Vent panel.
  R('gantry_vent_ink',218,164,282,194,INK);R('gantry_vent_face',221,167,279,191,SL[1]);
  for(let y=171;y<189;y+=5)R(`gantry_vent_slot_${y}`,226,y,270,y+1,SL[0]);

  // Pressure tank with copper cap.
  const tank=[[28,114],[28,55],...tankTop.slice(0,-1).map(([x,y])=>[x,y]),[70,55],[70,114]];
  drawPlanes(p,'gantry_tank',tank,28,71,{base:SL[4],slabs:[[.14,SL[4]],[.42,SL[3]],[.74,SL[2]],[1,SL[0]]]});
  for(const y of [70,92])R(`gantry_tank_band_${y}`,28,y,70,y+2,SL[0]);
  const cap=ellipsePoly(49,55,19,4,18);if(cap)p.poly('gantry_tank_cap',cap,COPPER);
  const capLit=ellipsePoly(38,52,6,1,12);if(capLit)p.poly('gantry_tank_cap_lit',capLit,BRASS);
  R('gantry_stack',46,34,52,52,COPPER);R('gantry_stack_cap',44,32,54,34,BRASS);

  // Lattice mast.
  R('gantry_mast',252,12,272,114,SL[1]);R('gantry_mast_lit',252,12,254,114,SL[3]);R('gantry_mast_shade',270,12,272,114,SL[0]);
  for(let y=22;y<112;y+=14){p.line(`gantry_brace_${y}`,255,y+10,269,y,SL[0]);p.line(`gantry_brace_b_${y}`,255,y+11,269,y+1,SL[0]);}
  // Boom, stay cable, counterweight and hook.
  p.poly('gantry_boom',[[252,22],[126,30],[126,38],[252,36]],SL[2]);
  R('gantry_boom_lit',126,30,252,31,SL[4]);R('gantry_boom_shade',126,38,252,38,SL[0]);
  for(let x=138;x<244;x+=14)p.line(`gantry_boom_brace_${x}`,x,31,x+7,38,SL[0]);
  p.line('gantry_stay_cable',266,10,130,29,INK);
  R('gantry_counterweight',272,16,294,40,SL[0]);R('gantry_counterweight_lit',272,16,294,17,SL[2]);
  R('gantry_hook_line',139,38,140,78,INK);R('gantry_hook_body',135,78,144,86,COPPER);R('gantry_hook_tip',137,84,142,88,INK);
  R('gantry_mast_cap',246,6,278,12,COPPER);R('gantry_mast_cap_lit',246,6,278,7,BRASS);
}
