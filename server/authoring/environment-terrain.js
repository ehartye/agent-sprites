export const TERRAIN_MATERIALS=['moss','regolith','basalt','packed-earth','alloy','cork'];
const RAMPS={moss:['#627e62','#5c785e','#6b8464','#81976f'],regolith:['#afa18c','#9e917e','#bfb09a','#d3c0a3'],basalt:['#616775','#565c69','#717784','#93929a'],'packed-earth':['#967e63','#887058','#a58b6a','#b6a17a'],alloy:['#899d9e','#657f83','#a8baba','#c6cebf'],cork:['#b79a71','#a18765','#c6ac82','#dfc498']};
export function randomFor(seed,salt=0){let state=(seed^Math.imul(salt+1,0x45d9f3b))>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}

/** Quiet clusters share matching opposite edge pixels across every variant. */
export function drawTerrain(p,material,variant,seed){
  const [base,dark,light,bright]=RAMPS[material],random=randomFor(seed,variant+TERRAIN_MATERIALS.indexOf(material)*29);
  const ri=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
  p.rect('surface',0,0,32,32,base);
  if(material==='alloy'){
    p.rect('panel_inset',2,2,28,28,light);p.rect('panel_face',3,3,26,25,base);
    p.line('panel_upper_bevel',3,2,28,2,bright);p.line('panel_lower_recess',2,29,29,29,dark);
    for(const [i,x,y] of [[0,4,4],[1,26,4],[2,4,26],[3,26,26]]){p.rect(`fastener_${i}`,x,y,2,2,dark);p.rect(`fastener_glint_${i}`,x,y,1,1,bright);}
    const y=10+variant*3;p.line('panel_scuff',11,y,17,y,light);p.line('panel_scuff_tip',18,y+1,20,y+1,light);
  }else if(material==='cork'){
    for(const y of [0,15,31])p.line(`board_seam_${y}`,0,y,31,y,dark);
    p.line('board_light',0,1,31,1,light);p.line('board_second_light',0,16,31,16,light);
    p.line('board_end_upper',12,2,12,14,dark);p.line('board_end_lower',25,17,25,30,dark);
    for(let i=0;i<15;i++){const x=ri(2,27),y=ri(3,28);if(y===15||y===16)continue;p.rect(`cork_grain_${i}`,x,y,ri(1,3),1,i%4?light:dark);}
  }else{
    const clusterCount=material==='moss'?[2,4,6,8][variant]:[4,6,8,10][variant];
    for(let i=0;i<clusterCount;i++){
      const x=ri(4,24),y=ri(4,24),w=ri(3,6),h=ri(2,4),tone=i%3?light:dark;
      if(material==='moss'){
        p.poly(`moss_patch_${i}`,[[x,y+1],[x+2,y],[x+w-1,y],[x+w,y+1],[x+w-1,y+h],[x+1,y+h],[x,y+h-1]],tone);
        if(variant>1&&i===2)p.line(`moss_leaf_${i}`,x+1,y,x+2,y-1,bright);
      }else if(material==='regolith'){
        p.ellipse(`pebble_shadow_${i}`,x+2,y+2,2,1,dark);
        p.poly(`pebble_${i}`,[[x,y],[x+2,y-1],[x+3,y],[x+3,y+1],[x,y+1]],tone);
        if(i%4===0)p.line(`pebble_glint_${i}`,x,y,x+1,y,bright);
      }else if(material==='basalt'){
        p.poly(`stone_facet_${i}`,[[x,y],[x+3,y-1],[x+w,y+1],[x+2,y+h],[x,y+h]],tone);
        if(i%4===0){p.line(`mineral_vein_${i}`,x,y+1,x+2,y,bright);p.line(`mineral_branch_${i}`,x+2,y,x+4,y+1,light);}
      }else{
        p.poly(`earth_patch_${i}`,[[x,y],[x+w-1,y],[x+w,y+1],[x+w-2,y+h],[x,y+h-1]],tone);
        if(i%4===0)p.rect(`earth_grit_${i}`,x+1,y-1,2,1,bright);
      }
    }
    // Shared shallow edge clusters prevent a blank border without introducing a tile seam.
    const edgeLight=material==='moss'?'#658064':light,edgeDark=material==='moss'?'#607c61':dark;
    for(const [i,y] of [8,23].entries())for(const x of [0,30])p.rect(`edge_patch_x_${i}_${x}`,x,y,2,2,edgeLight);
    for(const [i,x] of [10,24].entries())for(const y of [0,30])p.rect(`edge_patch_y_${i}_${y}`,x,y,3,2,edgeDark);
    if(material==='regolith'&&variant===2){const x=ri(10,22),y=ri(10,22);p.ellipse('crater_rim',x,y,5,3,light);p.ellipse('crater_bowl',x,y,4,2,dark);p.line('crater_lip',x-3,y+2,x+2,y+2,bright);}
  }
}
