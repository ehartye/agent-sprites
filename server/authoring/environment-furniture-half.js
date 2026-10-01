import {randomFor} from './environment-terrain.js';

// Half-size furniture: every piece redrawn in source pixels (32 by 32 cells, drawn at 2x), where
// the full-size quilt stitching, utensils, graph traces and spanner cannot exist. Each piece keeps the footprint,
// ground contact and collision of the full-size one; only what fits in a source pixel is kept.
const C={soil:'#6b6658',green:'#779566',leaf:'#a7bb79',ink:'#344751',deep:'#42646b',teal:'#659797',sea:'#83b5af',cream:'#dfddbd',light:'#f4edcf',shade:'#b4b9a3',bronze:'#a9895e',gold:'#d4b47c',wood:'#b79a71',woodLight:'#cbb18a',glass:'#527b8b',glint:'#bce0d3',red:'#bb7866'};

/** Rounded panel in source pixels: ink outline with cut corners, a flat face and one lit row. */
function panel(q,n,x,y,w,h,color=C.cream){
  q.poly(`${n}_outline`,[[x+1,y],[x+w-2,y],[x+w-1,y+1],[x+w-1,y+h-2],[x+w-2,y+h-1],[x+1,y+h-1],[x,y+h-2],[x,y+1]],C.ink);
  q.rect(`${n}_face`,x+1,y+1,w-2,h-2,color);
  q.line(`${n}_light`,x+1,y+1,x+w-2,y+1,C.light);
}
/** Two legs: a three-pixel ink column with a brass core. */
function feet(q,x0,x1,y){
  for(const [i,x] of [[0,x0],[1,x1]]){q.rect(`foot_${i}`,x,y,3,31-y,C.ink);q.rect(`foot_light_${i}`,x+1,y,1,30-y,C.bronze);}
}
// Contact shadow: three rows (narrower above and below), the half-size version of the two-radius ellipse. It spans
// the outer edges of the feet so no tip is left sticking out as a lone pixel.
const shadow=(q,x0,x1)=>{q.rect('ground_shadow_top',x0+1,28,x1-x0-1,1,C.deep);q.rect('ground_shadow',x0,29,x1-x0+1,1,C.deep);q.rect('ground_shadow_bottom',x0+1,30,x1-x0-1,1,C.deep);};

export const HALF_FURNITURE={
  bed(p,collision){
    const q=p.src;shadow(q,5,26);
    panel(q,'bed_frame',5,8,22,21,C.bronze);feet(q,5,24,28);
    q.rect('mattress_side',6,12,20,15,C.shade);q.rect('mattress_top',6,10,20,14,C.light);
    q.rect('quilt_shadow',6,17,20,11,'#956456');q.rect('quilt',7,16,18,10,C.red);
    q.poly('quilt_fold',[[7,16],[24,16],[25,17],[24,19],[8,18],[7,17]],'#d19a82');
    // quilting as two broken seams rather than a grid of single stitches
    for(const [i,y] of [[0,20],[1,23]]){q.line(`quilt_seam_${i}_a`,9,y,14,y,'#cb8d77');q.line(`quilt_seam_${i}_b`,17,y,22,y,'#cb8d77');}
    q.line('quilt_left_light',7,19,7,25,'#d19a82');q.line('quilt_hem',8,25,24,25,C.gold);
    q.rect('pillow_soft_shadow',8,12,16,4,C.shade);
    q.poly('pillow_linen',[[10,11],[21,11],[22,12],[22,14],[21,15],[10,15],[9,14],[9,12]],C.light);q.line('pillow_crease',10,14,13,14,C.cream);
    q.rect('headboard',5,8,22,2,C.bronze);q.line('headboard_light',7,8,24,8,C.gold);
    q.rect('bedside_book',21,20,3,3,C.teal);q.line('book_pages',21,20,23,20,C.light);
  },
  kitchen(p,collision){
    const q=p.src;shadow(q,4,27);
    panel(q,'cabinet',2,13,28,16,C.teal);q.rect('cabinet_toe',4,26,24,2,C.deep);feet(q,4,25,28);
    for(const [i,x] of [[0,4],[1,17]]){q.rect(`cabinet_door_${i}`,x,18,11,7,C.cream);q.line(`cabinet_seam_${i}`,x,25,x+10,25,C.shade);q.rect(`cabinet_pull_${i}`,x+7,19,2,1,C.bronze);}
    // backsplash and rail first, so the counter sits in front of them
    panel(q,'backsplash',3,4,25,6,C.cream);q.line('utensil_rail',6,6,24,6,C.bronze);
    for(let i=0;i<3;i++)q.line(`utensil_${i}`,16+i*3,7,16+i*3,9,C.deep);
    q.rect('spice_tin',6,6,3,3,C.red);q.line('spice_lid',6,6,8,6,C.gold);
    q.poly('counter_outline',[[2,12],[4,10],[27,10],[29,12],[29,17],[2,17]],C.ink);
    q.rect('counter_surface',3,12,26,4,C.light);q.line('counter_edge',3,16,28,16,C.bronze);
    q.rect('sink_rim',6,12,8,3,C.shade);q.rect('sink_basin',7,13,6,1,C.glass);
    q.rect('faucet',14,10,1,3,C.ink);q.rect('faucet_top',12,10,3,1,C.ink);q.line('faucet_light',12,9,13,9,C.light);
    q.rect('induction_plate',18,12,8,3,C.ink);q.line('induction_ring',20,13,23,13,C.teal);q.rect('hob_signal',24,14,2,1,C.gold);
  },
  workbench(p,collision){
    const q=p.src;shadow(q,4,27);
    feet(q,4,25,19);q.rect('bench_back_brace',5,26,21,2,C.bronze);q.rect('bench_storage',4,21,9,6,C.teal);q.rect('storage_handle',7,23,4,1,C.gold);
    q.poly('bench_top_outline',[[3,15],[5,12],[26,12],[28,15],[28,20],[3,20]],C.ink);q.rect('bench_top',4,15,24,4,C.woodLight);q.line('bench_front',4,19,27,19,C.bronze);
    for(let i=0;i<3;i++)q.line(`bench_grain_${i}`,7+i*8,17,10+i*8,17,C.wood);
    panel(q,'console',5,4,13,11,C.deep);q.rect('console_screen',7,6,9,5,C.glass);q.line('console_glow',8,6,14,6,C.glint);
    q.line('console_graph_a',8,10,9,10,C.sea);q.line('console_graph_b',10,9,11,9,C.sea);q.line('console_graph_c',12,8,13,8,C.sea);q.line('console_graph_d',14,9,14,10,C.sea);
    q.rect('console_stand',10,15,3,1,C.ink);q.rect('console_key',7,13,2,1,C.gold);q.rect('console_key_2',10,13,2,1,C.sea);
    q.rect('tools_mat',19,15,6,3,C.teal);q.line('spanner',20,16,23,14,C.shade);q.rect('spanner_jaw',23,13,2,2,C.shade);q.rect('tool_grip',21,17,3,1,C.red);
    panel(q,'battery_under',17,21,7,7,C.cream);q.rect('battery_meter',19,23,2,2,C.sea);
  },
  planter(p,collision,seed){
    const q=p.src;shadow(q,9,22);
    q.poly('pot_outline',[[9,19],[22,19],[21,27],[19,30],[12,30],[10,27]],C.ink);q.poly('pot_body',[[10,20],[21,20],[20,26],[18,28],[13,28],[11,26]],C.bronze);
    q.line('pot_light',11,21,11,25,C.gold);q.rect('pot_label',14,24,3,3,C.cream);
    q.ellipse('pot_rim',16,20,6,2,C.gold);
    
    const random=randomFor(seed,111);
    for(let i=0;i<7;i++){
      const side=i%2?1:-1,y=9+Math.round(i*1.5),x=16+side*(3+Math.floor(random()*2));
      const base=Math.min(y+3,18);
      q.poly(`leaf_${i}`,[[16,base],[x,base-1],[x+side,y],[x-side*2,y]],i%3?C.green:C.leaf);
      q.line(`leaf_vein_${i}`,16,base,x,y+1,C.leaf);
    }
    q.poly('plant_crown',[[16,12],[14,9],[15,6],[17,7],[18,10]],C.leaf);
    // soil last, so the leaves rise out of it instead of burying it
    q.rect('soil',11,19,10,1,C.soil);
  },
  stool(p){
    const q=p.src;shadow(q,11,20);
    feet(q,11,18,24);q.line('stool_brace',12,27,19,27,C.bronze);
    // seat as hand-set rows (half-width per row): ink rim, teal cushion, a lit patch at the upper left and a seam
    const rows=(name,cx,cy,list,color)=>list.forEach(([dy,hw],k)=>q.rect(`${name}_${k}`,cx-hw,cy+dy,hw*2+1,1,color));
    rows('seat_outline',15,21,[[-3,4],[-2,5],[-1,6],[0,6],[1,6],[2,5],[3,4]],C.ink);
    rows('seat_cushion',15,21,[[-2,3],[-1,5],[0,5],[1,4]],C.teal);
    rows('seat_light',14,21,[[-2,2],[-1,3]],C.sea);
    q.line('seat_seam',10,23,20,23,C.deep);
  },
  locker(p,collision){
    const q=p.src;shadow(q,10,21);
    panel(q,'locker_shell',9,6,14,23,C.cream);feet(q,10,19,28);q.rect('locker_side',20,7,2,19,C.shade);q.rect('locker_door_outline',10,8,10,17,C.ink);q.rect('locker_door_face',11,9,8,15,C.teal);
    q.rect('locker_upper_panel',12,10,7,5,C.deep);q.rect('locker_meter',13,11,4,1,C.sea);q.rect('locker_status',16,13,2,1,C.gold);
    q.rect('locker_handle_shadow',17,18,2,4,C.ink);q.line('locker_handle',18,18,18,20,C.gold);
    for(let i=0;i<3;i++)q.line(`locker_vent_${i}`,12,19+i*2,15,19+i*2,C.deep);
    q.rect('locker_badge',13,17,2,2,C.cream);
  },
};
