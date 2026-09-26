import {randomFor} from './environment-terrain.js';

const C={ink:'#344751',deep:'#42646b',teal:'#659797',sea:'#83b5af',cream:'#dfddbd',light:'#f4edcf',shade:'#b4b9a3',bronze:'#a9895e',gold:'#d4b47c',wood:'#b79a71',woodDark:'#927958',woodLight:'#cbb18a',glass:'#527b8b',glint:'#bce0d3',green:'#779566',leaf:'#a7bb79',soil:'#6b6658',red:'#bb7866'};
export const HABITAT_LAYOUT={footprint:{x:16,y:48,w:288,h:196},interior:{x:24,y:80,w:272,h:140},door:{x:136,y:220,w:48,h:36},walls:[{x:16,y:48,w:288,h:32},{x:16,y:80,w:8,h:140},{x:296,y:80,w:8,h:140},{x:16,y:220,w:120,h:24},{x:184,y:220,w:120,h:24}]};
export const FURNITURE_COLLISIONS={bed:{x:10,y:34,w:44,h:28},kitchen:{x:5,y:38,w:54,h:24},workbench:{x:6,y:39,w:52,h:23},planter:{x:20,y:44,w:24,h:18},stool:{x:22,y:48,w:20,h:14},locker:{x:18,y:42,w:28,h:20}};

function panel(p,n,x,y,w,h,color=C.cream){
  p.poly(`${n}_outline`,[[x+3,y],[x+w-4,y],[x+w-1,y+3],[x+w-1,y+h-4],[x+w-4,y+h-1],[x+3,y+h-1],[x,y+h-4],[x,y+3]],C.ink);
  p.rect(`${n}_face`,x+2,y+3,w-4,h-6,color);
  p.line(`${n}_light`,x+4,y+1,x+w-5,y+1,C.light);
}
function port(p,n,x,y){
  p.ellipse(`${n}_ring`,x,y,14,11,C.ink);p.ellipse(`${n}_bronze`,x,y-1,12,9,C.bronze);p.ellipse(`${n}_glass`,x,y-1,9,7,C.glass);
  p.line(`${n}_reflection`,x-5,y-5,x+3,y-5,C.glint);p.line(`${n}_reflection_tip`,x-6,y-4,x-6,y-2,C.glint);
  p.rect(`${n}_latch`,x+11,y-1,3,3,C.gold);
}
function southWalls(p,prefix='south'){
  for(const [i,x,w] of [[0,16,120],[1,184,120]]){
    p.poly(`${prefix}_${i}_outline`,[[x,220],[x+w-1,220],[x+w-1,237],[x+w-7,243],[x+6,243],[x,237]],C.ink);
    p.rect(`${prefix}_${i}_face`,x+3,223,w-6,13,C.teal);p.line(`${prefix}_${i}_cap`,x+3,220,x+w-4,220,C.light);
    p.line(`${prefix}_${i}_base`,x+7,239,x+w-8,239,C.deep);
    for(let j=0;j<3;j++)p.rect(`${prefix}_${i}_rib_${j}`,x+15+j*35,223,3,13,C.sea);
  }
  p.rect(`${prefix}_left_jamb`,128,220,8,22,C.bronze);p.rect(`${prefix}_right_jamb`,184,220,8,22,C.bronze);
  p.line(`${prefix}_left_light`,132,220,132,237,C.gold);p.line(`${prefix}_right_light`,187,220,187,237,C.gold);
}
export function drawHabitat(p,layer,seed){
  if(layer==='habitat_floor'){
    p.rect('floor_underlay',24,76,272,144,C.woodDark);
    for(let row=0;row<9;row++){
      const y=76+row*16;p.rect(`floor_board_${row}`,25,y+1,270,14,C.wood);
      p.line(`floor_board_light_${row}`,25,y+1,294,y+1,C.woodLight);
      const offset=row%2?41:8;
      for(let x=24+offset,j=0;x<294;x+=68,j++)p.line(`floor_end_${row}_${j}`,x,y+2,x,y+14,C.woodDark);
      const random=randomFor(seed,row);
      for(let j=0;j<9;j++){const x=29+Math.floor(random()*251),gy=y+4+Math.floor(random()*8);p.line(`floor_grain_${row}_${j}`,x,gy,x+4,gy,j%3?C.woodLight:C.woodDark);}
    }
    p.rect('perimeter_back',24,76,272,4,C.bronze);p.rect('perimeter_left',24,80,3,140,C.bronze);p.rect('perimeter_right',293,80,3,140,C.bronze);
    p.rect('entry_underlay',136,220,48,36,C.ink);p.rect('entry_plate',138,220,44,36,C.teal);
    for(let i=0;i<6;i++){p.line(`entry_tread_${i}`,141,223+i*6,178,223+i*6,C.sea);p.line(`entry_tread_shadow_${i}`,141,224+i*6,178,224+i*6,C.deep);}
    p.line('threshold',138,220,181,220,C.gold);
  }else if(layer==='habitat_back'){
    p.poly('back_pressure_shell',[[16,79],[16,61],[28,49],[46,48],[273,48],[291,49],[303,61],[303,79]],C.ink);
    p.poly('back_wall_face',[[20,77],[20,62],[30,53],[289,53],[299,62],[299,77]],C.cream);
    p.line('back_crown_light',34,51,285,51,C.light);p.rect('back_wall_bottom',24,74,272,6,C.teal);
    for(let i=0;i<8;i++){const x=36+i*34;p.line(`back_panel_join_${i}`,x,54,x,72,C.shade);p.rect(`back_panel_pin_${i}`,x+3,56,2,2,C.bronze);}
    for(const [i,x] of [[0,80],[1,240]]){p.ellipse(`inner_port_rim_${i}`,x,63,13,9,C.bronze);p.ellipse(`inner_port_glass_${i}`,x,63,10,6,C.glass);p.line(`inner_port_light_${i}`,x-6,59,x+4,59,C.glint);}
    panel(p,'life_support',143,54,34,20,C.deep);p.rect('life_support_screen',149,59,16,6,C.sea);p.rect('life_support_indicator',169,61,3,3,C.gold);
    for(const [side,x] of [['left',16],['right',296]]){
      p.rect(`${side}_wall_outline`,x,80,8,140,C.ink);p.rect(`${side}_wall_face`,x+2,80,4,140,C.cream);p.line(`${side}_wall_light`,x+2,80,x+2,219,C.light);
      for(let i=0;i<4;i++)p.rect(`${side}_wall_lock_${i}`,x+1,96+i*32,6,5,C.bronze);
    }
  }else if(layer==='habitat_front')southWalls(p);
  else{
    // Broad rounded pressure vessel: thermal shell, long ribs, glazing and solar cells.
    p.poly('hull_silhouette',[[16,219],[16,62],[21,49],[36,37],[57,30],[262,30],[283,37],[298,49],[303,62],[303,219]],C.ink);
    p.poly('thermal_shell',[[20,219],[20,64],[26,50],[40,40],[60,34],[259,34],[279,40],[293,50],[299,64],[299,219]],C.cream);
    p.poly('crown_highlight',[[29,54],[41,43],[61,37],[258,37],[278,43],[290,54],[276,49],[257,44],[62,44],[43,49]],C.light);
    // A vertical front wall below the eave gives the raised roof an explicit depth cue.
    p.rect('front_wall_shadow',20,167,280,53,C.deep);p.rect('front_wall_face',25,173,270,43,C.teal);
    p.rect('front_wall_base',24,208,272,12,C.deep);
    for(const x of [39,113,204,278]){p.rect(`front_wall_rib_${x}`,x,175,4,38,C.sea);p.rect(`front_wall_pin_${x}`,x,211,4,3,C.bronze);}
    p.poly('roof_left_curve',[[60,37],[45,53],[39,79],[40,143],[48,158],[33,167],[22,151],[20,66],[28,48]],C.shade);
    p.poly('roof_left_lit_band',[[60,38],[50,55],[46,79],[46,143],[52,155],[45,158],[39,142],[39,77],[44,54]],C.light);
    p.poly('roof_right_curve',[[259,37],[274,53],[280,79],[279,143],[271,158],[286,167],[297,151],[299,66],[291,48]],C.shade);
    p.poly('roof_right_shadow',[[283,56],[291,68],[293,143],[286,157],[279,162],[282,142]],C.bronze);
    for(let i=0;i<7;i++){
      const x=52+i*36;p.line(`roof_panel_seam_${i}`,x,50,x,149,C.shade);p.rect(`roof_fastener_${i}`,x+3,151,2,2,C.bronze);
    }
    for(const [side,x] of [['left',69],['right',243]]){
      p.poly(`${side}_structural_rib`,[[x,42],[x+5,41],[x-5,66],[x-7,142],[x-4,158],[x-11,158],[x-13,143],[x-10,65]],C.deep);
      p.line(`${side}_rib_light`,x+1,43,x-8,67,C.sea);p.line(`${side}_rib_lower_light`,x-8,67,x-10,141,C.sea);
      for(let i=0;i<2;i++)p.rect(`${side}_rib_clamp_${i}`,x-14,84+i*39,12,4,C.bronze);
    }
    // Glazing lies on the receding roof plane, with slanted sides and a visible lower lip.
    p.poly('skylight_mount',[[117,59],[203,59],[221,103],[99,103]],C.ink);
    p.poly('skylight_frame',[[118,61],[202,61],[217,99],[103,99]],C.teal);
    for(let i=0;i<3;i++){
      const top=121+i*26,bottom=108+i*35;
      p.poly(`skylight_pane_${i}`,[[top,65],[top+22,65],[bottom+29,94],[bottom,94]],C.glass);
      p.poly(`skylight_glow_${i}`,[[top+2,66],[top+14,66],[bottom+7,88],[bottom+2,88]],C.sea);
      p.line(`skylight_reflection_${i}`,top+1,65,top+21,65,C.glint);
      p.rect(`skylight_latch_${i}`,bottom+12,99,6,2,C.bronze);
    }
    p.line('skylight_front_depth',100,104,220,104,C.bronze);
    for(const [side,x] of [['left',78],['right',178]]){
      p.poly(`${side}_solar_frame`,[[x+8,114],[x+55,114],[x+65,145],[x,145]],C.ink);
      for(let row=0;row<3;row++)for(let col=0;col<3;col++){
        const sx=x+9+col*15-row*2,sy=118+row*8;
        p.poly(`${side}_solar_cell_${row}_${col}`,[[sx,sy],[sx+12+row*2,sy],[sx+13+row*2,sy+5],[sx-1,sy+5]],C.glass);
        p.line(`${side}_solar_glint_${row}_${col}`,sx,sy,sx+12+row*2,sy,C.sea);
      }
      p.line(`${side}_solar_lower_lip`,x+1,146,x+64,146,C.bronze);
    }
    p.poly('roof_eave_shadow',[[22,149],[36,161],[56,165],[263,165],[283,161],[297,149],[295,167],[279,174],[41,174],[24,167]],C.deep);
    p.poly('roof_eave_face',[[23,147],[38,156],[57,160],[262,160],[281,156],[296,147],[293,159],[277,166],[42,166],[26,159]],C.cream);
    p.line('roof_eave_light',56,160,263,160,C.light);p.line('roof_eave_lower',44,168,276,168,C.bronze);
    port(p,'left_port',77,192);port(p,'right_port',243,192);
    // Forty-four pixels of open recess accommodate an adult, above the clear ground doorway.
    p.poly('airlock_outer_arch',[[128,219],[128,182],[133,174],[141,170],[178,170],[187,174],[191,182],[191,219]],C.ink);
    p.poly('airlock_bronze_arch',[[131,219],[131,183],[137,176],[143,174],[177,174],[184,177],[188,183],[188,219]],C.bronze);
    p.poly('airlock_open_recess',[[136,219],[136,184],[141,178],[178,178],[183,184],[183,219]],C.ink);
    p.rect('airlock_inner_dark',139,185,42,35,'#283c44');p.line('airlock_left_edge',134,184,134,216,C.gold);p.line('airlock_right_edge',185,184,185,216,C.gold);
    p.rect('airlock_overdoor_lamp',148,172,24,3,C.light);p.rect('airlock_right_control',194,188,7,12,C.ink);p.rect('airlock_control_signal',196,190,3,3,C.gold);
    p.rect('roof_service_spine',154,117,12,30,C.bronze);p.line('roof_spine_light',155,118,155,144,C.gold);
    for(let i=0;i<3;i++)p.rect(`spine_vent_${i}`,159,122+i*7,5,2,C.ink);
    southWalls(p,'outer_south');
  }
}

function feet(p,x0,x1,y){for(const [i,x] of [[0,x0],[1,x1]]){p.rect(`foot_${i}`,x,y,5,62-y,C.ink);p.rect(`foot_light_${i}`,x+1,y,2,61-y,C.bronze);}}
export function drawFurniture(p,kind,seed){
  const collision=FURNITURE_COLLISIONS[kind];
  p.ellipse('ground_shadow',32,59,Math.floor(collision.w/2),2,C.deep);
  if(kind==='bed'){
    feet(p,11,48,56);panel(p,'bed_frame',10,17,44,41,C.bronze);
    p.rect('mattress_side',13,24,38,30,C.shade);p.rect('mattress_top',13,20,38,29,C.light);
    p.rect('quilt_shadow',13,34,38,21,'#956456');p.rect('quilt',14,33,36,19,C.red);
    p.poly('quilt_fold',[[14,32],[48,32],[50,34],[49,38],[16,37],[14,35]],'#d19a82');
    for(let r=0;r<3;r++)for(let c=0;c<4;c++){const x=17+c*8,y=40+r*4;p.poly(`quilt_stitch_${r}_${c}`,[[x,y-1],[x+2,y],[x,y+1],[x-2,y]],'#cb8d77');}
    p.line('quilt_left_light',14,38,14,50,'#d19a82');p.line('quilt_hem',15,51,49,51,C.gold);
    p.poly('pillow_soft_shadow',[[19,23],[43,22],[47,25],[46,30],[43,32],[20,31],[17,28]],C.shade);
    p.poly('pillow_linen',[[20,23],[42,23],[45,25],[44,29],[41,30],[20,29],[18,27]],C.light);p.line('pillow_crease',21,28,25,29,C.cream);p.line('pillow_top_fold',23,23,39,23,C.cream);
    p.rect('headboard',11,16,42,5,C.bronze);p.line('headboard_light',14,16,49,16,C.gold);
    p.rect('bedside_book',42,41,5,6,C.teal);p.line('book_pages',43,42,46,42,C.light);
  }else if(kind==='kitchen'){
    feet(p,8,51,57);panel(p,'cabinet',5,26,54,32,C.teal);p.rect('cabinet_toe',8,53,48,5,C.deep);
    for(const [i,x] of [[0,9],[1,34]]){p.rect(`cabinet_door_${i}`,x,36,21,15,C.cream);p.line(`cabinet_seam_${i}`,x,50,x+20,50,C.shade);p.rect(`cabinet_pull_${i}`,x+13,39,5,2,C.bronze);}
    p.poly('counter_outline',[[5,25],[9,20],[54,20],[58,25],[58,35],[5,35]],C.ink);p.rect('counter_surface',7,25,49,7,C.light);p.line('counter_edge',7,33,56,33,C.bronze);
    p.ellipse('sink_rim',20,28,8,4,C.shade);p.ellipse('sink_basin',20,28,6,3,C.glass);p.line('sink_reflection',17,30,23,30,C.glint);
    p.line('faucet',23,20,23,26,C.ink);p.line('faucet_top',19,20,23,20,C.ink);p.line('faucet_light',19,19,22,19,C.light);
    p.rect('induction_plate',36,24,16,7,C.ink);p.ellipse('induction_ring',44,27,5,2,C.teal);p.ellipse('induction_center',44,27,3,1,C.ink);p.rect('hob_signal',52,31,2,1,C.gold);
    panel(p,'backsplash',7,11,50,10,C.cream);p.line('utensil_rail',13,16,48,16,C.bronze);
    for(let i=0;i<3;i++){p.line(`utensil_${i}`,34+i*5,15,34+i*5,22,C.deep);p.rect(`utensil_tip_${i}`,33+i*5,20,3,3,C.deep);}
    p.rect('spice_tin',12,17,5,5,C.red);p.line('spice_lid',12,17,16,17,C.gold);
  }else if(kind==='workbench'){
    feet(p,8,50,39);p.rect('bench_back_brace',11,52,42,4,C.bronze);p.rect('bench_storage',9,42,18,12,C.teal);p.rect('storage_handle',14,46,8,2,C.gold);
    p.poly('bench_top_outline',[[6,31],[11,24],[52,24],[57,31],[57,40],[6,40]],C.ink);p.rect('bench_top',9,30,46,7,C.woodLight);p.line('bench_front',8,38,55,38,C.bronze);
    for(let i=0;i<4;i++)p.line(`bench_grain_${i}`,12+i*9,34,17+i*9,34,C.wood);
    panel(p,'console',11,12,25,21,C.deep);p.rect('console_screen',15,16,17,10,C.glass);p.line('console_glow',17,18,28,18,C.glint);p.line('console_graph_a',17,23,20,20,C.sea);p.line('console_graph_b',20,20,24,23,C.sea);p.line('console_graph_c',24,23,29,20,C.sea);
    p.rect('console_stand',21,33,7,2,C.ink);p.rect('console_key',15,28,3,2,C.gold);p.rect('console_key_2',20,28,3,2,C.sea);
    p.rect('tools_mat',39,30,13,6,C.teal);p.line('spanner',41,32,48,29,C.shade);p.rect('spanner_jaw',47,27,4,3,C.shade);p.rect('tool_grip',43,33,7,2,C.red);
    panel(p,'battery_under',34,43,13,14,C.cream);p.rect('battery_meter',38,47,5,3,C.sea);
  }else if(kind==='planter'){
    p.poly('pot_outline',[[19,39],[44,39],[43,55],[38,60],[25,60],[20,55]],C.ink);p.poly('pot_body',[[21,41],[42,41],[40,54],[36,57],[27,57],[23,53]],C.bronze);
    p.line('pot_light',23,45,25,53,C.gold);p.rect('pot_label',29,49,7,5,C.cream);p.rect('pot_label_leaf',31,50,3,2,C.green);
    p.ellipse('pot_rim',32,40,13,5,C.gold);p.ellipse('soil',32,39,10,3,C.soil);
    p.line('plant_stalk',32,20,32,39,C.deep);p.line('plant_stalk_light',33,24,33,37,C.green);
    const random=randomFor(seed,111);
    for(let i=0;i<7;i++){
      const side=i%2?1:-1,y=19+i*3,x=32+side*(7+Math.floor(random()*3));
      p.poly(`leaf_${i}`,[[32,y+7],[x,y+4],[x+side*3,y],[x-side*4,y+1]],i%3?C.green:C.leaf);
      p.line(`leaf_vein_${i}`,32,y+6,x,y+2,C.leaf);
    }
    p.poly('plant_crown',[[32,24],[28,18],[30,13],[34,15],[36,20]],C.leaf);
  }else if(kind==='stool'){
    feet(p,23,36,47);p.line('stool_brace',25,55,38,55,C.bronze);p.ellipse('seat_outline',32,44,13,7,C.ink);p.ellipse('seat_cushion',32,42,12,5,C.teal);p.ellipse('seat_light',31,41,9,3,C.sea);p.line('seat_seam',24,44,39,44,C.deep);
    p.rect('seat_button',31,41,3,2,C.teal);
  }else{
    feet(p,20,39,57);panel(p,'locker_shell',18,12,28,46,C.cream);p.rect('locker_side',41,17,3,36,C.shade);panel(p,'locker_door',21,17,20,35,C.teal);
    p.rect('locker_upper_panel',24,21,14,11,C.deep);p.rect('locker_meter',27,24,8,3,C.sea);p.rect('locker_status',34,29,2,2,C.gold);
    p.rect('locker_handle_shadow',35,36,3,9,C.ink);p.line('locker_handle',36,36,36,42,C.gold);
    for(let i=0;i<3;i++)p.line(`locker_vent_${i}`,25,43+i*3,31,43+i*3,C.deep);
    p.rect('locker_badge',27,35,4,4,C.cream);p.line('locker_badge_mark',28,36,29,37,C.bronze);
    p.line('locker_top_light',23,14,40,14,C.light);
  }
}
