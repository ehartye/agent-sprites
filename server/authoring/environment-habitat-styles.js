import {drawHabitat} from './environment-habitat.js';
import {MODULE_BASE_STYLES,MODULE_DRAWERS} from './environment-habitat-modules.js';
import {hazardChevrons,interiorChevrons,seamBand,KIT} from './environment-habitat-trim.js';

export const BASE_HABITAT_STYLES=['cottage','workshop','kitchen','barn'];
export const HABITAT_STYLES=[...BASE_HABITAT_STYLES,...Object.keys(MODULE_BASE_STYLES)];
const C={ink:'#344751',dark:'#283c44',cream:'#dfddbd',light:'#f4edcf',brass:'#a9895e',gold:'#d4b47c',glass:'#527b8b',glint:'#bce0d3',leaf:'#a7bb79'};
// Back-wall panel joins that a style's own fittings would cut to a single pixel at half size.
const HALF_SKIP_JOINS={cottage:[1,4,6],workshop:[0,1,4,6],kitchen:[1,2,4,5,6,7],barn:[1,4,5,6]};
const themes={
  cottage:{base:'#8c6860',shade:'#664f50',mid:'#ac7b6c',lit:'#d3a18b',wall:'#cbb18a',floor:'#b79a71'},
  workshop:{base:'#607d8b',shade:'#405762',mid:'#7896a0',lit:'#a4c2c3',wall:'#91a3a0',floor:'#7b8b8b'},
  kitchen:{base:'#779566',shade:'#506a59',mid:'#96ad7b',lit:'#c1d3a0',wall:'#ded6ac',floor:'#bfb38e'},
  barn:{base:'#ad7859',shade:'#74533f',mid:'#c49266',lit:'#dfb982',wall:'#b8966e',floor:'#958571'},
};

// Reuse the proven wall and doorway geometry; style changes are authored pixels,
// never unreported collision offsets. The historical pressure-vessel stays intact.
export function drawStyledHabitat(p,layer,seed,style){
  // A module style reuses its base style's rooms, doorway and theme; only the exterior roof layer is its own.
  const module=MODULE_DRAWERS[style]?style:null,base=module?MODULE_BASE_STYLES[style]:style;
  if(module&&layer!=='habitat_roof'){
    drawStyledHabitat(p,layer,seed,base);
    // Interior trim shared with the module exteriors, kept clear of the floor, furniture and doorway:
    // a riveted seam along the foot of the back wall (y74..79) and chevrons on the south wall's door jambs.
    const t=themes[base];
    if(layer==='habitat_back')seamBand(p,`${module}_back`,24,295,74,79,{base:t.shade,lit:t.mid,shade:KIT.dark,rivet:t.lit});
    if(layer==='habitat_front')interiorChevrons(p,`${module}_front`);
    return;
  }
  style=base;
  const t=themes[style];
  if(layer!=='habitat_roof'){
    const colors={'#659797':t.base,'#42646b':t.shade,'#83b5af':t.lit,'#dfddbd':t.wall,'#b79a71':t.floor,'#927958':t.shade,'#cbb18a':t.lit};
    const tint=pen=>Object.fromEntries(Object.keys(pen).map(method=>[method,(...args)=>{args[args.length-1]=colors[args.at(-1)]||args.at(-1);pen[method](...args);} ]));
    const tinted=tint(p);
    Object.defineProperty(tinted,'pixelScale',{value:p.pixelScale});
    Object.defineProperty(tinted,'src',{value:tint(p.src)});
    Object.defineProperty(tinted,'skipJoins',{value:HALF_SKIP_JOINS[style]});
    drawHabitat(tinted,layer,seed);
    if(layer==='habitat_floor'&&style!=='cottage'){
      p.rect('role_floor',28,p.pixelScale===2?80:82,264,p.pixelScale===2?138:136,t.floor);
      if(style==='workshop'){
        for(let y=84;y<216;y+=22)for(let x=30;x<288;x+=44){p.rect(`plate_${x}_${y}`,x,y,40,18,t.mid);p.line(`plate_light_${x}_${y}`,x,y,x+39,y,t.lit);p.rect(`bolt_${x}_${y}`,x+2,y+3,2,2,t.shade);}
      }else if(style==='kitchen'){
        for(let y=83;y<216;y+=17)for(let x=29;x<290;x+=22){p.rect(`tile_${x}_${y}`,x,y,20,15,(x+y)%3?t.wall:t.lit);p.line(`grout_${x}_${y}`,x,y+14,x+19,y+14,'#b4b39a');}
      }else{
        for(let x=29;x<290;x+=22){p.rect(`wide_plank_${x}`,x,83,20,133,t.wall);p.line(`plank_edge_${x}`,x,83,x,215,t.lit);for(let y=102;y<210;y+=37)p.line(`end_${x}_${y}`,x,y,x+19,y,t.shade);}
        for(const x of [94,222]){p.rect(`rail_${x}`,x,83,3,134,C.brass);p.line(`rail_light_${x}`,x,83,x,216,C.gold);}
      }
    }
    if(layer==='habitat_back'){
      if(style==='cottage'){
        for(const x of [62,92,222,252]){p.rect(`curtain_${x}`,x,54,6,19,t.mid);p.line(`curtain_fold_${x}`,x+2,55,x+2,71,t.lit);}
        p.rect('picture_frame',112,55,16,16,C.brass);p.rect('picture_sky',114,57,12,12,C.glass);p.poly('picture_hill',[[114,68],[119,61],[125,68]],C.leaf);
      }else if(style==='workshop'){
        for(let x=38;x<132;x+=12){p.line(`tool_hook_${x}`,x,57,x,69,C.ink);p.rect(`tool_head_${x}`,x-2,56,5,4,C.brass);}
        p.rect('conduit',194,70,86,3,t.shade);for(let x=198;x<280;x+=17)p.rect(`conduit_clamp_${x}`,x,69,3,5,C.gold);
      }else if(style==='kitchen'){
        p.rect('herb_rail',40,55,88,2,C.brass);for(let x=45;x<126;x+=14){if(p.pixelScale===2&&x===73)continue;p.line(`herb_tie_${x}`,x,56,x,62,C.brass);p.poly(`herb_bunch_${x}`,[[x,59],[x+4,64],[x+2,69],[x-3,68],[x-4,64]],t.base);}
        for(let x=205;x<280;x+=16){p.rect(`jar_${x}`,x,63,10,9,x%3?C.glass:t.mid);p.rect(`jar_lid_${x}`,x,61,10,2,C.gold);}
      }else{
        for(const x of [32,112,196,280]){p.rect(`timber_${x}`,x,53,5,23,t.shade);p.line(`timber_light_${x}`,x,53,x,p.pixelScale===2?71:74,t.lit);}
        p.line('beam',28,72,290,72,C.brass);p.rect('portal_meter',199,56,17,12,C.ink);p.rect('portal_meter_glow',202,59,11,3,C.glint);
      }
    }
    return;
  }
  // The common full-width wall closes the room below all four roof silhouettes.
  p.rect('wall_outline',16,151,288,69,C.ink);p.rect('wall_face',20,154,280,66,t.wall);
  p.rect('wall_foundation',20,209,280,11,t.shade);
  if(p.pixelScale===2)for(let x=14;x<149;x+=12){p.src.line(`wall_joint_${x*2}`,x,79,x,103,t.shade);p.src.line(`wall_lit_joint_${x*2}`,x+1,79,x+1,103,t.lit);}
  else for(let x=28;x<299;x+=23){p.line(`wall_joint_${x}`,x,158,x,207,t.shade);p.line(`wall_lit_joint_${x}`,x+1,158,x+1,207,t.lit);}
  if(module)MODULE_DRAWERS[module](p,t);
  else{
    if(style==='cottage')cottage(p,t);
    if(style==='workshop')workshop(p,t);
    if(style==='kitchen')kitchen(p,t);
    if(style==='barn')barn(p,t);
  }
  doorway(p,t,style,module);
  if(module)hazardChevrons(p);
  // Reuse the original split foreground parapet, recolored for each material.
  drawStyledHabitat(p,'habitat_front',seed,style);
}

function window(p,n,x,y,w,h,t){
  if(p.pixelScale===2){
    // Half size: one-pixel ink and brass frame, a lit top row, a one-pixel mullion and a one-row sill.
    const q=p.src,sx=x>>1,sy=y>>1,sw=w>>1,sh=h>>1;
    q.rect(`${n}_shadow`,sx-1,sy-1,sw+2,sh+2,C.ink);q.rect(`${n}_frame`,sx,sy,sw,sh,C.brass);q.rect(`${n}_glass`,sx+1,sy+1,sw-2,sh-2,C.glass);
    q.poly(`${n}_reflection`,[[sx+1,sy+2],[sx+sw-3,sy+2],[sx+4,sy+sh-2],[sx+1,sy+sh-2]],t.mid);
    q.line(`${n}_glint`,sx+1,sy+1,sx+sw-2,sy+1,C.glint);q.rect(`${n}_mullion`,sx+(sw>>1),sy+1,1,sh-2,C.brass);q.rect(`${n}_sill`,sx-1,sy+sh,sw+2,1,t.lit);
    return;
  }
  p.rect(`${n}_shadow`,x-2,y-2,w+4,h+5,C.ink);p.rect(`${n}_frame`,x,y,w,h,C.brass);p.rect(`${n}_glass`,x+3,y+3,w-6,h-6,C.glass);
  p.poly(`${n}_reflection`,[[x+4,y+4],[x+w-6,y+4],[x+9,y+h-5],[x+4,y+h-5]],t.mid);
  p.line(`${n}_glint`,x+4,y+3,x+w-5,y+3,C.glint);p.rect(`${n}_mullion`,x+Math.floor(w/2),y+2,2,h-4,C.brass);p.rect(`${n}_sill`,x-3,y+h,w+6,3,t.lit);
}
function doorway(p,t,style,module){
  const square=style==='workshop'||style==='barn';
  p.poly('door_outer',[[128,219],[128,181],[square?128:137,170],[square?191:182,170],[191,181],[191,219]],C.ink);
  p.poly('door_frame',[[131,219],[131,182],[square?131:139,173],[square?188:180,173],[188,182],[188,219]],style==='barn'?t.mid:C.brass);
  p.poly('door_recess',[[136,219],[136,184],[141,178],[178,178],[183,184],[183,219]],C.dark);
  p.line('door_left_light',133,183,133,216,t.lit);p.line('door_right_light',186,183,186,216,C.gold);
  p.rect('door_lamp',145,173,30,3,style==='barn'?C.glint:C.light);
  p.rect('door_control',194,187,7,14,C.ink);p.rect('door_signal',196,189,3,4,C.glint);
  if(style==='workshop'&&p.pixelScale===2){if(!module)for(let k=0;k<4;k++){p.src.rect(`safety_left_${k}`,64,92+k*4,2,2,C.gold);p.src.rect(`safety_right_${k}`,94,92+k*4,2,2,C.gold);}}
  else if(style==='workshop')for(let y=185;y<216;y+=8){p.rect(`safety_left_${y}`,129,y,3,4,C.gold);p.rect(`safety_right_${y}`,189,y,3,4,C.gold);}
}
function cottage(p,t){
  // Asymmetric pitched dwelling, with a glazed lean-to on its right side.
  p.poly('main_roof_outline',p.pixelScale===2?[[11,92],[104,10],[123,6],[229,79],[229,151],[13,151]]:[[13,92],[104,12],[123,8],[229,79],[229,151],[13,151]],C.ink);
  p.poly('roof_sun_plane',[[18,91],[106,17],[118,14],[118,129],[18,145]],t.mid);
  p.poly('roof_shade_plane',[[121,15],[224,81],[224,146],[121,129]],t.shade);
  for(let row=0;row<7;row++){
    const y=43+row*14,left=Math.max(20,106-Math.floor((y-17)*1.18));
    p.line(`sun_shingle_course_${row}`,left,y,116,y-15,t.lit);
    for(let x=left+10;x<112;x+=20)if(!(p.pixelScale===2&&((row===0&&x===86)||(row===3&&x===36))))p.line(`sun_shingle_end_${row}_${x}`,x,y-8,x,y-2,t.base);
    if(row>1)p.line(`shade_shingle_course_${row}`,124,y-13,220,y+1,t.base);
  }
  p.poly('ridge_cap',[[104,12],[123,8],[129,12],[111,18],[19,97],[14,92]],C.brass);p.line('ridge_light',107,13,121,10,C.gold);
  p.poly('eave_depth',[[13,145],[119,128],[229,146],[229,156],[119,139],[13,156]],t.shade);
  p.line('eave_sun_edge',16,145,118,129,t.lit);
  p.poly('greenhouse_outline',[[212,63],[289,67],[305,119],[305,159],[211,159]],C.ink);
  p.poly('greenhouse_glass',[[216,68],[286,72],[299,120],[216,120]],C.glass);
  for(let i=0;i<4;i++){
    const x=220+i*19;p.poly(`glass_reflection_${i}`,[[x,72],[x+7,72],[x+12,116],[x+3,116]],'#83b5af');
    p.line(`glass_bar_${i}`,x+12,72,x+18,119,C.cream);
  }
  p.rect('greenhouse_eave',212,122,91,5,C.brass);p.rect('greenhouse_front_glass',216,128,82,24,C.glass);
  for(let x=220;x<295;x+=18){p.poly(`greenhouse_leaf_${x}`,[[x,147],[x-2,138],[x+4,142],[x+8,135],[x+9,147]],C.leaf);p.rect(`greenhouse_front_bar_${x}`,x+10,128,3,25,C.cream);}
  p.rect('greenhouse_sill',213,154,90,6,t.shade);
  window(p,'home_window',43,174,55,28,t);window(p,'garden_window',229,174,48,27,t);
  if(p.pixelScale===2){p.src.rect('home_flower_box',20,102,30,3,C.brass);p.src.rect('flower_leaves',20,99,29,3,C.leaf);for(let i=0;i<6;i++)p.src.rect(`flower_${i}`,22+i*5,98,2,1,t.lit);}
  else{p.rect('home_flower_box',41,204,59,8,C.brass);for(let x=47;x<98;x+=9){p.rect(`flower_leaf_${x}`,x,200,6,5,C.leaf);p.rect(`flower_${x}`,x+2,197,3,3,t.lit);}}
  p.rect('chimney_shadow',52,30,20,31,C.ink);p.rect('chimney_face',55,29,14,27,t.wall);p.rect('chimney_cap',50,26,24,5,C.brass);p.rect('chimney_lip',52,25,20,2,C.light);
}
function workshop(p,t){
  // Low shed roof, heavy fascia and useful equipment rather than a house gable.
  p.poly('service_roof_outline',[[16,64],[38,48],[285,48],[303,63],[303,151],[16,151]],C.ink);
  p.poly('service_roof_plane',[[21,66],[41,53],[282,53],[297,65],[282,129],[35,129]],t.mid);
  p.poly('service_roof_right',[[297,65],[301,68],[301,146],[283,135],[282,129]],t.shade);
  for(let x=45;x<282;x+=24){p.line(`roof_channel_${x}`,x,56,x-8,126,t.shade);p.line(`roof_channel_light_${x}`,x+2,56,x-6,126,t.lit);}
  p.poly('heavy_fascia',[[17,129],[283,129],[302,145],[302,158],[17,158]],t.shade);p.rect('fascia_face',21,135,266,14,t.base);p.line('fascia_light',24,132,281,132,t.lit);
  for(let x=31;x<285;x+=32)p.rect(`fascia_bolt_${x}`,x,140,3,3,C.brass);
  p.poly('extractor_base',[[48,67],[58,57],[104,57],[112,66],[112,96],[48,96]],C.ink);p.rect('extractor_front',52,68,56,24,t.base);p.poly('extractor_top',[[53,65],[60,59],[102,59],[107,65]],t.lit);
  for(let y=72;y<90;y+=5)p.rect(`extractor_vent_${y}`,58,y,44,2,t.shade);
  p.rect('exhaust_pipe_shadow',67,30,27,28,C.ink);p.rect('exhaust_pipe',70,31,20,27,t.base);p.rect('exhaust_pipe_light',71,31,4,25,t.lit);p.rect('exhaust_cowl',64,26,33,7,C.brass);p.line('cowl_light',66,26,94,26,C.gold);
  p.poly('solar_bank',[[163,69],[269,69],[262,116],[156,116]],C.ink);
  for(let row=0;row<4;row++)for(let col=0;col<5;col++){const x=167+col*19-row*2,y=73+row*10;p.rect(`solar_${row}_${col}`,x,y,16,7,C.glass);p.line(`solar_glint_${row}_${col}`,x,y,x+15,y,C.glint);}
  window(p,'service_window',39,177,61,25,t);
  p.rect('equipment_hatch',219,169,64,38,t.shade);p.rect('equipment_face',223,173,56,30,t.base);for(let y=178;y<198;y+=5)p.rect(`equipment_vent_${y}`,229,y,35,2,C.ink);p.rect('hatch_latch',269,184,5,11,C.gold);
  p.rect('service_cable',26,161,96,4,C.brass);p.rect('service_cable_down',118,161,4,42,C.brass);
}
function kitchen(p,t){
  // Broad conservatory barrel, with rounded pressure ribs and a scalloped awning.
  p.poly('conservatory_outline',[[16,143],[16,72],[26,53],[46,37],[72,25],[247,25],[273,37],[293,53],[303,72],[303,143]],C.ink);
  p.poly('conservatory_shell',[[21,137],[21,73],[30,57],[49,41],[75,30],[244,30],[270,41],[289,57],[298,73],[298,137]],t.base);
  p.poly('barrel_highlight',[[29,68],[49,46],[76,35],[243,35],[269,46],[289,68],[266,58],[242,49],[77,49],[51,58]],t.lit);
  p.rect('barrel_middle',30,71,261,30,t.mid);p.rect('barrel_shadow',25,109,271,28,t.shade);
  for(let i=0;i<7;i++){
    const x=48+i*33;p.poly(`glass_panel_${i}`,[[x+9,52],[x+28,52],[x+28,99],[x,99]],C.glass);p.poly(`glass_glow_${i}`,p.pixelScale===2?[[x+9,52],[x+17,52],[x+8,99],[x,99]]:[[x+10,54],[x+17,54],[x+7,94],[x+2,94]],'#83b5af');p.line(`glass_peak_${i}`,x+11,53,x+26,53,C.glint);
    p.line(`pressure_rib_${i}`,x+6,43,x-5,74,C.cream);p.line(`pressure_rib_lower_${i}`,x-5,74,x-5,120,C.brass);
  }
  p.poly('awning_shadow',[[15,129],[304,129],[310,160],[304,170],[17,170],[9,160]],C.ink);
  p.poly('awning_canopy',[[19,125],[300,125],[305,155],[15,155]],C.cream);
  for(let i=0;i<10;i++){
    const x=19+i*28;p.poly(`awning_stripe_${i}`,[[x,127],[x+13,127],[x+15,154],[x-2,154]],t.mid);
    p.poly(`awning_scallop_${i}`,[[x-3,155],[x+24,155],[x+23,162],[x+18,166],[x+4,166],[x-2,162]],i%2?t.lit:C.cream);
  }
  window(p,'kitchen_window',37,178,65,25,t);window(p,'herb_window',222,178,61,25,t);
  for(const start of [38,222]){
    p.rect(`growing_trough_${start}`,start,205,62,7,C.brass);
    if(p.pixelScale===2){const x0=(start>>1)+1;p.src.rect(`herb_leaves_${start}`,x0,98,29,2,C.leaf);for(let k=0;k<7;k++)p.src.rect(`herb_tuft_${start}_${k}`,x0+1+k*4,97,2,1,C.leaf);for(let k=0;k<7;k++)p.src.rect(`herb_stem_${start}_${k}`,x0+2+k*4,100,1,2,t.shade);}
    else for(let x=start+4;x<start+57;x+=11){p.line(`herb_stem_${x}`,x,198,x,206,t.shade);p.poly(`herb_leaf_${x}`,[[x,201],[x-4,196],[x-5,193],[x+1,196],[x+5,192],[x+5,198]],C.leaf);}
  }
  p.rect('oven_flue',263,21,15,29,t.shade);p.rect('oven_flue_light',264,22,4,27,t.lit);p.rect('oven_flue_cap',258,18,25,5,C.brass);
}
function barn(p,t){
  // Tall gambrel agricultural roof; upper and lower slopes have different values.
  p.poly('gambrel_outline',[[13,150],[28,65],[87,5],[233,5],[291,65],[306,150]],C.ink);
  p.poly('upper_slope',[[32,65],[89,10],[231,10],[287,65],[273,82],[48,82]],t.mid);
  p.poly('lower_slope',[[31,69],[49,82],[272,82],[288,69],[301,145],[18,145]],t.base);
  p.poly('right_slope_shadow',p.pixelScale===2?[[232,12],[287,67],[288,69],[301,145],[272,142],[260,70]]:[[232,12],[287,67],[301,144],[272,142],[260,70]],t.shade);
  for(let x=58;x<266;x+=23){
    const top=90+Math.round((x-58)*.67);p.line(`upper_roof_seam_${x}`,top,13,x,76,t.lit);p.line(`lower_roof_seam_${x}`,x,85,x-9,140,t.shade);p.line(`lower_roof_light_${x}`,x+2,85,x-7,140,t.mid);
  }
  p.rect('ridge_vent_shadow',113,0,94,13,C.ink);p.rect('ridge_vent_face',117,3,86,7,t.shade);for(let x=121;x<201;x+=8)p.rect(`ridge_slot_${x}`,x,5,3,4,C.brass);p.line('ridge_cap',115,1,205,1,t.lit);
  p.poly('roof_break_beam',[[30,64],[49,78],[272,78],[289,64],[290,69],[273,84],[48,84],[29,69]],C.brass);p.line('roof_break_light',50,78,271,78,C.gold);
  p.rect('eave_shadow',15,146,290,12,t.shade);p.line('eave_highlight',18,146,300,146,t.lit);p.rect('eave_beam',19,151,281,5,C.brass);
  // Timber braces distinguish the barn even under the roof and at small scale.
  for(const [i,x] of [[0,32],[1,216]]){
    p.rect(`barn_panel_${i}`,x,164,72,45,t.base);p.rect(`barn_upright_${i}`,x,164,5,45,t.shade);p.rect(`barn_upright_far_${i}`,x+67,164,5,45,t.shade);
    p.poly(`barn_cross_a_${i}`,[[x+5,168],[x+9,166],[x+65,203],[x+63,207]],t.lit);p.poly(`barn_cross_b_${i}`,[[x+63,166],[x+67,169],[x+9,207],[x+5,204]],C.brass);
  }
  p.rect('hayloft_shadow',132,111,56,31,C.ink);p.rect('hayloft_face',136,115,48,23,t.shade);p.line('hayloft_cross_a',138,117,181,135,C.brass);p.line('hayloft_cross_b',181,117,138,135,C.brass);p.rect('hayloft_sill',129,140,62,4,C.gold);
  p.rect('portal_conduit',114,162,4,45,C.glass);p.rect('portal_conduit_light',115,164,1,40,C.glint);p.rect('portal_box',107,190,15,14,C.ink);p.rect('portal_box_signal',111,193,7,3,C.glint);
}
