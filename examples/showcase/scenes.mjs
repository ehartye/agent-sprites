import { wave, noise, mod } from './drawing.mjs';

// One perspective, selective local outlines, hand-placed material lights and
// restrained color ramps. The tiny figures are environmental scale anchors.
const night = {
  ink:'#10152d', deep:'#191d3c', sky:'#262342', far:'#39304f', haze:'#50405f',
  slate:'#323e5d', steel:'#4d6176', edge:'#7793a2', cyan:'#64d6d0', ice:'#bbf0df',
  teal:'#255969', water:'#223c58', violet:'#5c4b72', pink:'#d96d94', rose:'#f4b0b0',
  gold:'#f6c881', amber:'#d38b6c', dark:'#172438', cream:'#e8dbc0', plum:'#785773'
};
function stationBase(p) {
  const c=night;
  p.rect('night_sky',0,0,192,128,c.sky);
  p.rect('horizon_haze',0,38,192,45,c.far);
  p.rect('low_cloud',0,27,74,3,c.far);
  p.rect('low_cloud_tail',20,30,75,2,c.far);
  p.rect('cloud_right',129,16,63,2,c.far);
  p.rect('cloud_right_shadow',147,18,45,4,c.far);
  // Distant windows occupy coherent, low contrast clusters.
  for(let j=0;j<15;j++) {
    const x=j*15-5,w=10+Math.floor(noise(j+2)*8),h=15+Math.floor(noise(j+45)*30),y=76-h;
    p.rect('distant_tower',x,y,w,h,c.haze);
    p.rect('distant_tower_side',x+w-3,y,3,h,c.far);
    if(j%3===0) p.line('aerial',x+3,y,x+3,y-7,c.haze);
    for(let yy=y+5;yy<73;yy+=7) for(let xx=x+2;xx<x+w-3;xx+=5)
      if(noise(xx+yy*3)>.38)p.rect('far_window',xx,yy,2,2,j%4===0?c.amber:c.violet);
  }
  p.line('distant_viaduct',0,78,191,78,c.violet);
  p.rect('station_floor_shadow',0,85,192,43,c.ink);
  p.poly('wet_platform',[[0,89],[139,89],[161,105],[0,105]],c.slate);
  p.poly('platform_face',[[0,105],[161,105],[161,111],[0,111]],c.deep);
  p.line('platform_edge_light',0,104,160,104,c.cyan);
  p.rect('tactile_band',0,98,143,2,c.amber);
  for(let x=3;x<142;x+=5)p.rect('tactile_tile',x,98,2,1,c.gold);
  for(let x=5;x<150;x+=28)p.line('platform_joint',x,89,x+16,104,c.steel);
  p.rect('track_ballast',0,112,192,16,c.dark);
  for(let x=-4;x<192;x+=15)p.poly('track_sleeper',[[x,116],[x+8,116],[x+18,125],[x+10,125]],c.slate);
  p.rect('rail_back',0,113,192,1,c.edge);
  p.rect('rail_front_shadow',0,123,192,3,c.ink);
  p.rect('rail_front_light',0,123,192,1,c.steel);
  // Last train: long lit window ribbon leads toward the waiting passenger.
  p.poly('train_body_outline',[[105,62],[184,62],[191,69],[191,94],[102,94],[98,89],[98,70]],c.ink);
  p.poly('train_body',[[106,64],[184,64],[191,70],[191,91],[104,91],[101,88],[101,71]],c.steel);
  p.rect('train_roof_light',108,64,74,1,c.edge);
  p.rect('train_windows_dark',107,70,85,13,c.dark);
  for(let x=110;x<192;x+=19) {
    p.rect('train_window',x,72,14,9,c.cyan);
    p.rect('train_window_warm',x+1,73,12,3,c.ice);
    p.rect('train_window_lower',x+1,79,12,2,c.teal);
    p.line('window_reflection',x+8,73,x+4,77,c.ice);
    p.rect('seat_silhouette',x+2,79,4,2,c.slate);
  }
  p.rect('train_stripe',103,85,89,2,c.pink);
  p.rect('train_skirt',105,91,87,4,c.deep);
  p.ellipse('rear_bogie',125,95,7,2,c.ink);p.ellipse('front_bogie',178,95,7,2,c.ink);
  p.rect('train_door_seam',153,67,1,24,c.dark);
  p.rect('train_door_seam_second',168,67,1,24,c.dark);
  p.rect('train_door_handle',165,83,1,2,c.edge);
  p.rect('train_destination_panel',173,66,14,3,c.ink);
  for(let x=175;x<185;x+=3)p.rect('train_destination_glyph',x,67,2,1,c.gold);
  // Canopy with a subtly sloped roof, deep fascia and rain gutter.
  p.rect('rear_station_wall',13,53,75,36,c.deep);
  p.rect('rear_wall_tiles',15,59,69,29,c.slate);
  for(let y=65;y<89;y+=7)p.line('wall_tile_row',16,y,83,y,c.steel);
  for(let x=19;x<84;x+=11)p.line('wall_tile_joint',x,59,x,88,c.deep);
  p.poly('canopy_roof_dark',[[4,42],[100,42],[118,52],[19,52]],c.ink);
  p.poly('canopy_roof',[[6,40],[99,40],[117,49],[20,49]],c.slate);
  p.line('canopy_roof_lit_rim',7,40,99,40,c.edge);
  for(let x=17;x<100;x+=14)p.line('roof_sheet_seam',x,41,x+15,48,c.steel);
  p.rect('fascia',20,49,98,5,c.deep);
  p.rect('canopy_cyan_strip',22,52,93,1,c.cyan);
  p.poly('canopy_support_bracket',[[24,55],[35,55],[24,66]],c.steel);
  p.rect('post_shadow',21,53,5,42,c.ink);
  p.rect('post',22,54,2,41,c.steel);
  p.rect('post_rim',22,55,1,39,c.cyan);
  p.rect('second_post',92,53,3,40,c.deep);p.rect('second_post_rim',92,55,1,37,c.edge);
  // Lit vending machine, individually editable buttons and cans.
  p.rect('vending_machine_shadow',31,62,17,30,c.ink);
  p.rect('vending_machine_cabinet',32,61,15,29,c.pink);
  p.rect('vending_lit_edge',32,61,1,29,c.rose);
  p.rect('vending_machine_glass',34,64,9,15,c.dark);
  p.rect('vending_title',34,62,8,1,c.cream);
  for(let y=66;y<77;y+=5)for(let x=35;x<43;x+=3) {
    p.rect('drink_can',x,y,2,3,(x+y)%2?c.gold:c.cyan);p.point('can_shine',x,y,c.cream);
  }
  p.rect('vending_coin_slot',44,70,1,3,c.ink);p.point('vending_ready_led',44,75,c.ice);
  p.rect('vending_tray',35,83,9,3,c.deep);p.rect('vending_tray_light',36,83,7,1,c.amber);
  p.rect('vending_plinth',30,90,19,2,c.ink);
  p.rect('route_map_frame',6,66,11,18,c.dark);p.rect('route_map_paper',7,67,9,15,c.cream);
  p.line('route_map_blue_line',9,69,9,78,c.teal);p.line('route_map_branch',9,74,13,77,c.pink);
  for(let yy=70;yy<79;yy+=3)p.point('route_map_stop',9,yy,c.amber);
  p.rect('route_map_caption',8,80,5,1,c.steel);
  // Floating sign and station clock become the upper focal accents.
  p.rect('sign_hanger',52,53,1,4,c.edge);
  p.rect('sign_frame',48,57,28,10,c.ink);
  p.rect('sign_face',49,58,26,8,c.teal);
  p.rect('sign_glow',50,58,24,1,c.cyan);
  for(let j=0;j<4;j++) {
    const x=52+j*5;
    p.line('sign_glyph_top',x,60,x+2,60,c.ice);
    p.line('sign_glyph_stem',x+1,60,x+1,64,c.cyan);
    p.point('sign_glyph_base',x,64,c.cyan);
  }
  p.line('clock_suspension',82,48,82,57,c.edge);
  p.ellipse('clock_case',82,62,6,6,c.ink);p.ellipse('clock_face',82,62,5,5,c.cream);
  p.line('clock_hour_hand',82,62,79,60,c.deep);p.line('clock_minute_hand',82,62,83,58,c.deep);
  p.point('clock_twelve',82,58,c.amber);p.point('clock_three',86,62,c.amber);
  // Wooden bench and discarded paper give the platform a human scale.
  p.rect('bench_back',52,82,22,3,c.amber);p.rect('bench_back_lit_edge',53,82,20,1,c.gold);
  p.rect('bench_seat',50,88,26,2,c.amber);p.rect('bench_seat_lit_edge',51,88,24,1,c.gold);
  p.rect('bench_leg_left',53,90,2,5,c.deep);p.rect('bench_leg_right',71,90,2,5,c.deep);
  p.poly('folded_newsprint',[[49,95],[55,95],[57,97],[50,97]],c.edge);
  // Passenger: a coral umbrella against the cool light of the train.
  p.ellipse('passenger_shadow',78,96,7,2,c.ink);
  p.rect('traveler_far_boot',77,91,2,5,c.ink);p.rect('traveler_near_boot',81,91,3,5,c.ink);
  p.poly('traveler_coat_shadow',[[77,80],[82,80],[85,91],[76,91]],c.ink);
  p.poly('traveler_coat',[[78,80],[82,80],[83,90],[77,90]],c.teal);
  p.rect('traveler_coat_rim',82,82,1,8,c.cyan);
  p.rect('traveler_head',78,76,4,4,c.amber);p.rect('traveler_hair',77,75,5,2,c.ink);
  p.rect('traveler_scarf',77,80,6,1,c.gold);p.rect('traveler_scarf_tail',77,81,1,4,c.gold);
  p.rect('suitcase',86,88,5,7,c.violet);p.rect('suitcase_lit_edge',86,88,1,7,c.pink);
  p.line('suitcase_handle',87,86,89,86,c.edge);p.line('suitcase_handle_side',87,86,87,88,c.edge);
  p.line('umbrella_shaft',80,72,80,85,c.edge);
  p.poly('umbrella_outline',[[65,76],[69,70],[75,67],[82,67],[89,70],[94,76]],c.ink);
  p.poly('umbrella_coral',[[66,75],[70,70],[76,68],[82,68],[88,71],[92,75]],c.pink);
  p.poly('umbrella_lit_panel',[[68,74],[74,69],[78,68],[76,75]],c.rose);
  p.poly('umbrella_shadow_panel',[[81,68],[87,71],[91,75],[84,74]],c.plum);
  p.line('umbrella_center_rib',79,68,79,75,c.rose);p.point('umbrella_tip',79,66,c.gold);
  p.line('overhead_cable',0,20,191,31,c.ink);p.line('overhead_cable_two',0,25,191,36,c.deep);
  // Storm-dark clouds have a few stepped edges; the broad sky stays quiet.
  p.rect('storm_cloud_low_edge',87,31,72,2,c.far);p.rect('storm_cloud_tail',109,33,55,1,c.far);
  p.rect('storm_cloud_deep',-2,7,56,3,c.deep);p.rect('storm_cloud_deep_tail',15,10,55,1,c.deep);
  // Foreground cropped lamp frames the scene without blocking the story.
  p.rect('foreground_lamp_post',179,37,3,91,c.ink);
  p.line('foreground_lamp_top',171,37,183,37,c.edge);
  p.poly('foreground_lamp_hat',[[170,37],[184,37],[181,34],[174,34]],c.ink);
  p.rect('foreground_lamp_glass',173,38,8,7,c.gold);p.rect('foreground_lamp_core',175,38,4,6,c.cream);
  p.rect('foreground_lamp_cage',176,37,1,8,c.amber);p.rect('foreground_lamp_base',172,45,10,2,c.ink);
}
function stationMotion(p,i) {
  const c=night;
  // Rain crosses one complete 32-frame period; individual drops wrap off canvas.
  for(let j=0;j<54;j++) {
    const x=mod(j*43,204)-6+Math.round(wave(i,32,j/54)*2),y=mod(j*31+i*4,128)-4;
    // Shelter masks the rain underneath the roof.
    if(x>20&&x<117&&y>50&&y<95)continue;
    p.line('rain_streak',x,y,x-1,y+3,j%4===0?c.edge:c.steel);
  }
  for(let j=0;j<10;j++) {
    const x=11+j*15,y=107+(j%3)*4,phase=mod(i+j*3,16);
    if(phase<8)p.line('puddle_ripple',x-phase/2,y,x+phase/2+1,y,j%2?c.teal:c.violet);
  }
  for(let j=0;j<7;j++) {
    const x=35+Math.round(wave(i,16,j/7)*2),y=94+j*3;
    p.rect('vending_wet_reflection',x,y,8-Math.floor(j/2),1,j%2?c.plum:c.pink);
  }
  for(let j=0;j<8;j++)p.rect('window_water_glimmer',113+j*9+Math.round(wave(i,32,j/8)*2),101+j%2*2,4,1,j%2?c.teal:c.cyan);
  if(i%8<4) p.point('signal_light',188,59,c.pink);
}

const garden={sky:'#e8d9a6',cream:'#fff0bd',gold:'#e7b968',sun:'#f9dc89',cloud:'#f5e7ba',
  far:'#91aa87',light:'#bfd3a4',glass:'#a4c9b5',pane:'#c5dfc1',blue:'#73aba8',water:'#4b8f91',
  ink:'#254b4a',dark:'#355e4f',green:'#447b54',leaf:'#6c9b59',lime:'#aac56b',bright:'#d3dc86',
  wood:'#99795c',clay:'#b97659',terra:'#d79868',soil:'#654f48',path:'#cfbd8b',stone:'#91a891',pink:'#dc8d86'};
function glasshouseBase(p) {
  const c=garden;
  p.rect('summer_sky',0,0,192,128,c.sky);
  p.ellipse('sun_disc',25,19,12,12,c.cream);
  p.rect('morning_cloud',114,13,51,3,c.cloud);p.rect('morning_cloud_tip',128,10,20,3,c.cloud);
  p.poly('distant_hill',[[0,53],[16,44],[33,49],[52,40],[75,51],[99,43],[130,51],[155,39],[192,48],[192,82],[0,82]],c.far);
  p.rect('garden_ground',0,78,192,50,c.light);
  p.poly('greenhouse_shadow',[[25,88],[149,82],[184,106],[60,116],[12,104]],c.far);
  // Perspective glazing: the side wing recedes toward the right.
  p.poly('glasshouse_side',[[120,40],[173,53],[173,94],[120,94]],c.glass);
  p.poly('glasshouse_front',[[26,40],[74,12],[122,40],[122,95],[26,95]],c.pane);
  p.poly('glasshouse_roof_side',[[74,12],[126,27],[173,53],[122,40]],c.blue);
  p.poly('roof_upper_reflection',[[79,15],[125,29],[164,50],[123,38]],c.glass);
  p.poly('roof_lower_reflection',[[107,33],[126,32],[158,48],[128,40]],c.pane);
  p.poly('front_left_glass',[[29,42],[72,17],[72,78],[29,88]],c.glass);
  p.poly('sunbeam_one',[[34,38],[48,30],[92,94],[76,94]],c.cream);
  p.poly('sunbeam_two',[[60,24],[65,21],[113,94],[108,94]],c.sun);
  // Back growing shelves are below the glass structure and its fine ribs.
  p.rect('back_growing_bed',30,71,82,16,c.dark);
  for(let j=0;j<15;j++) {
    const x=33+j*5,y=73+Math.round(noise(j+4)*7);
    p.leaf('back_leaf_left',x,y,-5,-10-noise(j)*8,j%2?c.leaf:c.green);
    p.leaf('back_leaf_right',x,y,5,-7-noise(j+9)*9,j%3?c.lime:c.green);
  }
  p.rect('rear_shelf',31,82,82,3,c.wood);p.rect('rear_shelf_highlight',31,82,82,1,c.gold);
  for(const [x,y]of [[141,82],[158,86]]) {
    p.pot('back_herb_pot',x-4,y,8,8,[c.clay,c.terra,c.wood,c.soil]);
    p.fern('back_herb',x,y,0.65,[c.green,c.leaf,c.lime]);
  }
  // Tall tropical plant is a readable tree silhouette, not stippled texture.
  p.poly('fig_trunk_shadow',[[49,81],[52,81],[52,43],[50,37],[49,51]],c.soil);
  p.line('fig_branch_left',50,58,39,45,c.wood);p.line('fig_branch_right',51,48,62,36,c.wood);
  for(const [x,y,dx,dy] of [[50,42,-17,-10],[50,50,-19,-1],[50,56,-17,9],[52,40,13,-16],[52,48,19,-5],[51,56,16,9],[50,35,-5,-15]]) {
    p.leaf('fig_leaf_shadow',x,y,dx,dy,c.dark);
    p.leaf('fig_leaf',x,y-1,dx*.9,dy,c.green);
    p.line('fig_leaf_vein',x,y,x+dx*.7,y+dy*.7,c.leaf);
  }
  p.pot('fig_planter',43,80,17,14,[c.clay,c.terra,c.wood,c.soil]);
  // The greenhouse ribs provide a consistent architectural rhythm.
  p.line('front_left_column_shadow',25,40,25,96,c.ink);
  p.rect('front_left_column',26,41,2,54,c.cream);
  p.rect('front_right_column_shadow',121,40,3,56,c.wood);
  p.rect('front_right_column',121,40,1,55,c.cream);
  p.line('front_roof_left_shadow',25,40,74,11,c.wood);
  p.line('front_roof_left_light',25,39,74,10,c.cream);
  p.line('front_roof_right_shadow',74,11,123,40,c.wood);
  p.line('front_roof_right_light',74,10,123,39,c.cream);
  p.line('roof_ridge',74,11,126,26,c.cream);
  p.line('roof_side_outer',126,26,174,52,c.cream);
  p.line('roof_side_gutter',123,40,174,52,c.cream);
  for(let j=1;j<4;j++) {
    const x=26+j*24;
    p.rect('glass_front_mullion',x,41,1,54,c.cream);
    p.line('gable_mullion',x,40,74,13,c.cream);
  }
  p.line('crossbar_front',27,61,120,61,c.cream);
  p.line('gable_crossbar',42,30,106,30,c.cream);
  for(let j=0;j<4;j++) {
    const x=125+j*16,y=41+j*4;
    p.line('side_column_shadow',x+1,y,x+1,96,c.blue);
    p.line('side_column',x,y,x,94,c.cream);
    p.line('roof_side_rib',74+j*17,12+j*5,x,y,c.cream);
  }
  p.line('side_crossbar',124,63,173,72,c.cream);p.line('side_base',123,95,173,95,c.wood);
  p.line('glasshouse_foundation',24,96,174,96,c.wood);
  p.rect('foundation_light',25,96,149,2,c.path);
  p.poly('open_door_shadow',[[76,62],[92,62],[92,97],[76,97]],c.dark);
  p.rect('door_left_jamb',75,61,2,36,c.cream);p.rect('door_lintel',75,60,19,2,c.cream);
  p.poly('door_open_glass',[[94,62],[105,68],[105,97],[94,96]],c.glass);
  p.line('door_open_light',104,68,104,96,c.cream);p.line('door_open_bottom',94,96,104,97,c.cream);
  p.point('door_handle',101,81,c.wood);
  // Hanging baskets bridge the glass roof and the dense ground plants.
  for(const [x,y] of [[39,56],[110,55],[151,64]]) {
    p.line('basket_cord_left',x-5,y,x,y-12,c.wood);p.line('basket_cord_right',x+5,y,x,y-12,c.wood);
    p.pot('hanging_basket',x-6,y,12,6,[c.wood,c.gold,c.clay,c.soil]);
    for(let k=0;k<5;k++)p.leaf('basket_trailing_leaf',x-5+k*2,y,x%3-1,8+k%3*3,k%2?c.green:c.leaf);
  }
  // A curved channel and stepping path set the foreground plane.
  p.poly('garden_path',[[75,96],[96,96],[128,128],[55,128]],c.path);
  for(const [x,y,w] of [[78,101,18],[78,109,24],[75,120,34]]) {
    p.poly('stepping_stone_shadow',[[x,y],[x+w,y-1],[x+w+3,y+4],[x-3,y+5]],c.wood);
    p.poly('stepping_stone',[[x,y-1],[x+w,y-2],[x+w+2,y+2],[x-2,y+3]],c.cloud);
  }
  p.poly('water_channel_edge',[[121,97],[174,97],[192,115],[148,128],[126,116]],c.stone);
  p.poly('water_channel',[[125,100],[172,100],[186,114],[148,123],[131,114]],c.water);
  p.line('water_channel_rim_light',124,98,173,98,c.cream);
  p.line('water_channel_inner_light',131,114,148,123,c.blue);
  // Fountain: shallow stone bowl and a scalloped central pedestal.
  p.ellipse('fountain_ground_shadow',127,94,21,6,c.far);
  p.ellipse('fountain_bowl_dark',126,88,20,8,c.ink);
  p.rect('fountain_bowl_depth',108,86,36,7,c.stone);
  p.ellipse('fountain_bowl_body',126,90,18,6,c.stone);
  p.ellipse('fountain_bowl_lip',126,85,20,7,c.cloud);
  p.ellipse('fountain_water',126,85,17,5,c.water);
  p.ellipse('fountain_water_light',123,84,12,3,c.blue);
  p.rect('fountain_pedestal',124,70,4,15,c.wood);p.rect('fountain_pedestal_light',124,70,1,15,c.cloud);
  p.ellipse('fountain_upper_dish',126,70,9,3,c.cream);
  p.ellipse('fountain_upper_water',126,69,7,2,c.blue);
  // Foreground pots frame the path with distinct plant silhouettes.
  p.pot('large_front_pot',8,109,22,17,[c.clay,c.terra,c.wood,c.soil]);
  p.fern('front_fern',19,108,1.6,[c.dark,c.green,c.leaf,c.lime]);
  p.pot('flower_pot',39,108,16,12,[c.clay,c.terra,c.wood,c.soil]);
  for(let j=0;j<6;j++) {
    const x=41+j*2,y=95+(j%3)*3;
    p.line('flower_stem',47,108,x,y,c.green);p.flower('pink_flower',x,y,c.pink,c.sun);
  }
  p.pot('right_herb_pot',164,102,16,12,[c.clay,c.terra,c.wood,c.soil]);
  p.fern('right_herb',171,101,1,[c.dark,c.green,c.leaf]);
  for(let j=0;j<14;j++) {
    const x=j*14-3,y=120+Math.round(noise(j+3)*7);
    if(x>56&&x<125)continue;
    p.leaf('foreground_grass',x,y,-4,-7,c.green);p.leaf('foreground_grass',x,y,4,-11,c.leaf);
  }
  // Copper watering can and its graceful open handle.
  p.ellipse('watering_can_body',62,105,6,5,c.wood);p.rect('watering_can_body_light',58,102,3,5,c.gold);
  p.poly('watering_can_spout',[[66,103],[72,98],[74,98],[68,107]],c.wood);
  p.line('watering_can_handle_top',56,98,62,98,c.wood);p.line('watering_can_handle_side',55,99,55,103,c.wood);
  p.rect('plant_label_stake',34,103,1,7,c.wood);
  p.poly('plant_label',[[30,100],[38,100],[38,104],[30,104]],c.cream);
  p.rect('plant_label_ink',32,102,4,1,c.green);
  for(const [x,y]of [[8,94],[18,97],[178,94],[183,111],[39,122],[135,124]]) {
    p.rect('grass_lit_cluster',x,y,3,1,c.lime);p.rect('grass_lit_cluster_upright',x+1,y-1,1,2,c.bright);
  }
}
function glasshouseMotion(p,i) {
  const c=garden;
  // A complete ballistic arch at every instant; highlights travel down it.
  p.line('fountain_jet_left',125,68,125,60,c.cream);
  p.line('fountain_jet_right',127,68,127,61,c.pane);
  p.poly('fountain_jet_crown',[[123,61],[125,58],[127,58],[130,62],[128,61],[126,59],[124,62]],c.pane);
  for(let j=0;j<6;j++) {
    const phase=mod(i+j*5,16)/16,x=126+(j%2?1:-1)*(3+phase*8),y=62+phase*20;
    p.rect('falling_fountain_droplet',x,y,1,2,j%2?c.cream:c.pane);
  }
  for(let j=0;j<5;j++) {
    const phase=mod(i+j*6,32)/32;
    p.line('fountain_ripple_left',112+phase*5,84+j%2,118+phase*5,84+j%2,c.pane);
    p.line('channel_glimmer',140+j*7+wave(i,32,j/5)*2,105+j%3*3,143+j*7+wave(i,32,j/5)*2,105+j%3*3,c.glass);
  }
  const x=105+Math.round(wave(i,32)*15),y=44+Math.round(wave(i,16,.15)*4),spread=[3,2,1,2][i%4];
  p.poly('butterfly_upper_wing_left',[[x,y],[x-spread-1,y-4],[x-spread-2,y-1],[x-1,y+1]],c.pink);
  p.poly('butterfly_lower_wing_right',[[x,y],[x+spread+1,y-3],[x+spread+2,y],[x+1,y+2]],c.gold);
  p.line('butterfly_body',x,y-1,x,y+2,c.soil);
  for(let j=0;j<5;j++) {
    const xx=42+j*25+Math.round(wave(i,32,j/5)*4),yy=25+j*8+Math.round(wave(i,32,j/5+.25)*6);
    if((i+j)%8<5)p.point('sunlit_mote',xx,yy,c.cream);
  }
}

const forge={ink:'#171e2b',night:'#243348',blue:'#3e5d70',ice:'#8ca9ad',dark:'#302933',
  soot:'#40323b',stone:'#5d4a4a',rock:'#806458',wood:'#70483e',plank:'#956247',lit:'#bc8355',
  ember:'#d87643',orange:'#ed9d4d',gold:'#f6c56a',cream:'#ffe5a0',red:'#a64b3f',metal:'#536472',
  steel:'#8f9b9c',water:'#658c97',apron:'#5d5d58',skin:'#c29570',teal:'#3b696b'};
function workshopBase(p) {
  const c=forge;
  p.rect('workshop_dark',0,0,192,128,c.ink);
  p.rect('back_plaster',5,13,182,78,c.dark);
  p.rect('back_wall_upper',7,13,178,19,c.soot);
  p.rect('back_wall_lower',7,32,178,58,c.stone);
  // Masonry stays grouped into broad planes, lit warmly from the forge.
  for(let y=36;y<89;y+=10) {
    p.line('mortar_course',7,y,185,y,c.soot);
    for(let x=9+(y%20?0:10);x<186;x+=21)p.line('mortar_joint',x,y-8,x,y,c.soot);
  }
  p.rect('timber_column_left',4,10,7,88,c.wood);p.rect('timber_column_left_light',9,11,1,85,c.lit);
  p.rect('timber_column_right',182,10,7,88,c.wood);p.rect('timber_column_right_shadow',186,11,2,85,c.dark);
  p.rect('roof_lintel',3,8,186,8,c.wood);p.rect('roof_lintel_edge',3,8,186,1,c.lit);
  p.poly('left_roof_brace',[[9,16],[33,16],[9,37]],c.wood);p.line('left_roof_brace_light',11,33,29,17,c.lit);
  p.poly('right_roof_brace',[[160,16],[184,16],[184,37]],c.wood);
  for(let x=17;x<183;x+=20)p.rect('rafter_end',x,8,5,8,c.dark);
  // Moonlit window is a cool secondary focal point.
  p.rect('window_frame',18,25,38,33,c.wood);p.rect('window_opening',21,27,32,28,c.night);
  p.ellipse('window_moon',31,35,5,5,c.ice);p.ellipse('window_moon_shadow',33,33,4,4,c.night);
  p.poly('window_far_mountain',[[21,50],[29,43],[39,48],[47,41],[53,46],[53,55],[21,55]],c.blue);
  p.poly('window_near_mountain',[[21,53],[33,48],[43,52],[53,48],[53,55],[21,55]],c.ink);
  p.rect('window_crossbar',36,27,2,28,c.wood);p.rect('window_horizontal',21,41,32,2,c.wood);
  p.rect('window_lit_jamb',20,26,1,30,c.ice);p.rect('window_sill',17,56,42,4,c.plank);
  p.rect('window_sill_light',18,56,40,1,c.steel);
  p.rect('window_latch',38,48,3,2,c.metal);
  p.rect('wall_shelf_left',13,22,47,2,c.plank);
  p.rect('shelf_lit_edge',13,22,47,1,c.lit);
  p.rect('shelf_jar_body',18,17,5,5,c.teal);p.rect('shelf_jar_shine',18,18,1,3,c.water);
  p.rect('shelf_jar_lid',17,16,7,2,c.wood);
  p.rect('shelf_rag',29,19,8,3,c.apron);p.rect('shelf_rag_fold',31,19,1,3,c.steel);
  p.rect('shelf_small_bottle',44,17,3,5,c.rock);p.rect('shelf_bottle_neck',45,15,1,2,c.lit);
  p.poly('window_cast_light',[[21,59],[53,59],[80,93],[43,93]],c.soot);
  // An arched forge has deeply recessed stone voussoirs.
  p.poly('forge_chimney',[[113,15],[158,15],[158,31],[168,44],[168,90],[106,90],[106,44],[113,31]],c.soot);
  p.rect('chimney_front',119,16,31,21,c.stone);p.rect('chimney_side',150,16,8,21,c.dark);
  for(let y=20;y<37;y+=8)p.line('chimney_mortar',119,y,149,y,c.soot);
  p.poly('forge_arch_outer',[[108,82],[108,53],[112,42],[121,34],[135,31],[150,35],[161,45],[166,56],[166,82]],c.rock);
  p.poly('forge_arch_face',[[112,81],[112,54],[117,44],[125,38],[136,36],[148,40],[157,48],[161,57],[161,81]],c.lit);
  p.poly('forge_inner_shadow',[[118,79],[118,55],[122,46],[130,42],[140,42],[150,47],[155,57],[155,79]],c.ink);
  p.poly('forge_inner_glow',[[121,79],[121,57],[126,49],[135,46],[146,50],[151,58],[151,79]],c.red);
  p.rect('forge_hearth',106,80,61,8,c.soot);p.rect('forge_hearth_lit_edge',106,80,61,2,c.orange);
  p.rect('forge_hearth_face',109,88,56,6,c.rock);p.rect('forge_hearth_face_shadow',152,88,13,6,c.stone);
  // Radial stone joints preserve the reading of a heavy arch.
  for(const [x1,y1,x2,y2] of [[108,61,118,61],[111,48,121,51],[119,37,126,46],[133,33,134,42],[148,36,145,46],[161,47,152,52],[165,62,155,62]])
    p.line('arch_stone_joint',x1,y1,x2,y2,c.stone);
  p.rect('hearth_left_buttress',108,63,9,17,c.rock);p.rect('hearth_left_rim',116,63,1,17,c.gold);
  p.rect('hearth_right_buttress',156,64,9,16,c.stone);
  p.line('fire_grate',120,77,153,77,c.ink);
  for(let x=122;x<154;x+=5)p.rect('fire_grate_bar',x,73,2,7,c.dark);
  // Workbench with hand tools, a vise and blue-rimmed kettle.
  p.rect('workbench_shadow',11,78,63,6,c.ink);p.rect('workbench_top',10,75,65,4,c.plank);
  p.rect('workbench_top_light',11,75,64,1,c.lit);
  p.rect('bench_left_leg',14,82,5,22,c.wood);p.rect('bench_right_leg',64,82,5,22,c.wood);
  p.rect('bench_apron',13,82,58,7,c.wood);p.rect('bench_apron_edge',15,82,54,1,c.plank);
  p.rect('bench_lower_shelf',16,98,51,3,c.plank);
  for(let j=0;j<5;j++)p.rect('bench_stacked_ingot',24+j*6,94,5,4,j%2?c.steel:c.metal);
  p.rect('vise_base',60,70,11,5,c.metal);p.rect('vise_front_jaw',62,66,4,7,c.steel);
  p.rect('vise_back_jaw',69,66,3,7,c.metal);p.rect('vise_grip',63,65,8,1,c.ice);
  p.line('vise_screw',63,72,76,72,c.steel);p.line('vise_handle',74,69,74,75,c.steel);
  p.ellipse('kettle_body',29,69,7,6,c.metal);p.ellipse('kettle_shoulder',29,65,6,3,c.steel);
  p.rect('kettle_face_light',25,66,2,7,c.ice);p.rect('kettle_lid',26,62,6,2,c.ink);
  p.rect('kettle_lid_knob',28,60,2,2,c.wood);
  p.poly('kettle_spout',[[34,68],[40,63],[42,63],[37,71]],c.metal);
  p.line('kettle_handle_top',21,63,24,62,c.ink);p.line('kettle_handle_side',20,64,20,70,c.ink);
  p.poly('tongs_on_bench',[[43,72],[53,70],[56,72],[45,73]],c.metal);p.line('tongs_glint',44,72,53,71,c.steel);
  p.rect('tool_rack',63,32,32,3,c.wood);p.rect('tool_rack_light',63,32,32,1,c.lit);
  for(const [x,y,kind] of [[68,38,0],[79,39,1],[90,38,0]]) {
    p.rect('hanging_tool_handle',x,y,2,17,c.plank);
    if(kind)p.poly('hanging_spanner',[[x-2,y+11],[x+3,y+11],[x+3,y+17],[x+1,y+19],[x-2,y+17]],c.metal);
    else p.rect('hanging_hammer_head',x-3,y+12,8,4,c.metal);
    p.point('rack_hook',x,35,c.gold);
  }
  // Floor planks: long, varied clusters rather than tiled noise.
  p.rect('floor_base',0,104,192,24,c.wood);
  p.poly('floor_forge_light',[[93,94],[163,94],[192,128],[63,128]],c.plank);
  for(let y=107;y<128;y+=7) {
    p.line('floor_board_seam',0,y,191,y,c.dark);
    for(let x=15+(y%3)*17;x<190;x+=43)p.line('floor_end_joint',x,y,x+6,y+6,c.dark);
  }
  for(const [x,y,w]of [[4,110,21],[49,120,12],[105,110,17],[139,123,25],[166,115,20]])p.rect('floor_grain',x,y,w,1,c.lit);
  // Barrel, coal basket and forge implements occupy the right foreground.
  p.ellipse('barrel_shadow',176,108,15,4,c.dark);
  p.rect('barrel_body',166,91,21,18,c.wood);p.ellipse('barrel_bottom',176,109,10,3,c.wood);
  p.ellipse('barrel_top',176,91,10,3,c.plank);p.ellipse('barrel_interior',176,90,8,2,c.dark);
  for(let x=170;x<187;x+=5)p.line('barrel_stave',x,94,x,109,c.plank);
  p.rect('barrel_upper_band',165,96,23,2,c.metal);p.rect('barrel_lower_band',166,105,21,2,c.metal);
  p.line('barrel_band_light',167,96,183,96,c.steel);
  p.line('long_poker',175,88,179,62,c.ink);p.line('poker_lit_edge',174,88,178,62,c.steel);
  p.rect('coal_bin',135,104,24,12,c.dark);p.rect('coal_bin_rim',133,103,28,3,c.metal);
  for(let j=0;j<9;j++)p.poly('coal_chunk',[[136+j*2,103],[139+j*2,99-j%3],[142+j*2,103]],j%2?c.ink:c.soot);
  // Broad anvil silhouette, neck, hardy hole and warm striking face.
  p.ellipse('anvil_ground_shadow',88,113,24,5,c.dark);
  p.poly('anvil_stump',[[75,100],[99,100],[103,114],[72,114]],c.wood);
  p.ellipse('anvil_stump_top',87,100,13,4,c.plank);
  for(let x=76;x<101;x+=5)p.line('stump_bark',x,104,x-1,113,c.dark);
  p.poly('anvil_shadow',[[67,89],[75,89],[77,86],[101,86],[101,92],[95,96],[95,101],[101,103],[76,103],[81,99],[80,95],[71,93]],c.ink);
  p.poly('anvil_body',[[68,88],[77,88],[79,85],[101,85],[101,91],[94,94],[93,100],[99,101],[78,101],[83,98],[82,93],[73,92]],c.metal);
  p.poly('anvil_face',[[76,85],[101,85],[104,87],[75,89],[67,88]],c.steel);
  p.line('anvil_hot_rim',77,85,101,85,c.gold);p.rect('anvil_hardy_hole',95,86,2,1,c.ink);
  p.rect('hot_steel_bar',83,84,13,2,c.orange);p.rect('hot_steel_core',87,84,8,1,c.cream);
  // Smith at rest: leather apron, rolled sleeve and a lowered hammer.
  p.ellipse('smith_shadow',96,105,8,3,c.dark);
  p.rect('smith_far_boot',92,99,3,6,c.ink);p.rect('smith_near_boot',98,99,4,6,c.ink);
  p.poly('smith_trousers',[[91,88],[102,88],[101,101],[98,101],[96,94],[95,101],[91,101]],c.night);
  p.poly('smith_shirt',[[90,72],[99,71],[104,82],[100,90],[90,88]],c.teal);
  p.poly('smith_apron',[[93,76],[99,76],[101,96],[90,96],[92,84]],c.apron);
  p.line('smith_apron_seam',98,77,99,94,c.lit);
  p.rect('smith_neck',94,68,4,5,c.skin);p.rect('smith_head',92,62,8,8,c.skin);
  p.poly('smith_hair',[[91,63],[93,60],[98,60],[101,64],[100,65],[93,64],[93,67],[91,67]],c.dark);
  p.rect('smith_beard',96,67,5,4,c.wood);p.point('smith_eye',99,65,c.ink);
  p.poly('smith_near_sleeve',[[99,74],[103,75],[105,81],[101,83],[98,78]],c.water);
  p.poly('smith_forearm',[[101,82],[104,81],[107,84],[111,82],[113,85],[107,88],[102,85]],c.skin);
  p.line('smith_tongs',108,84,120,77,c.steel);p.line('smith_tongs_second',110,86,121,79,c.metal);
  p.poly('smith_far_arm',[[91,75],[88,76],[87,82],[85,83],[86,86],[91,84],[93,78]],c.skin);
  p.line('hammer_handle',87,83,82,76,c.plank);p.rect('hammer_head',77,73,9,4,c.metal);p.rect('hammer_head_light',78,73,7,1,c.steel);
  // Sleeping cat curls up in the cool side of the room.
  p.ellipse('cat_shadow',36,116,14,3,c.dark);p.ellipse('sleeping_cat_body',36,113,11,5,c.plank);
  p.ellipse('sleeping_cat_head',43,112,5,4,c.lit);
  p.poly('cat_ear',[[40,110],[40,106],[44,110]],c.plank);p.poly('cat_ear_two',[[44,110],[47,107],[48,112]],c.plank);
  p.line('cat_sleeping_eye',43,112,45,112,c.dark);p.poly('cat_curl_tail',[[26,111],[28,109],[33,110],[35,114],[32,116],[28,115]],c.wood);
  // Rivets, worn apron edges and a copper offcut reward close inspection.
  for(const [x,y]of [[16,84],[65,84],[110,85],[162,85],[8,17],[184,17]])p.point('iron_joinery_rivet',x,y,c.lit);
  p.rect('apron_pocket',94,85,4,3,c.wood);p.line('apron_pocket_stitch',94,85,97,85,c.skin);
  p.poly('copper_offcut',[[51,114],[58,111],[63,113],[56,116]],c.ember);p.line('copper_offcut_edge',52,114,58,112,c.gold);
}
function workshopMotion(p,i) {
  const c=forge;
  // Fire lives inside the cavity, behind the re-drawn grate.
  for(let j=0;j<7;j++) {
    const x=123+j*4,h=9+Math.round(wave(i,8,j/7)*3+wave(i,16,j/9)*2);
    p.poly('flame_amber',[[x-2,76],[x-2,70],[x,76-h],[x+2,70],[x+3,76]],j%2?c.orange:c.ember);
    p.poly('flame_gold',[[x-1,76],[x,69-Math.round(wave(i,8,j/5)*2)],[x+2,76]],c.gold);
    p.rect('flame_core',x,74,1,2,c.cream);
  }
  p.line('fire_grate_foreground',120,77,153,77,c.ink);
  for(let x=122;x<154;x+=5)p.rect('grate_bar_foreground',x,73,2,7,c.dark);
  for(let j=0;j<9;j++) {
    const age=mod(i+j*4,32)/32,x=125+j*3+Math.round(wave(i,32,j/9)*2),y=71-age*25;
    if(age<.8)p.rect('forge_rising_spark',x,y,1,j%3?1:2,age<.4?c.gold:c.ember);
  }
  for(let j=0;j<4;j++) {
    const age=mod(i+j*8,32)/32,x=40+Math.round(wave(i,32,j/4)*2),y=60-age*16;
    p.line('kettle_steam',x,y,x+2,y-2,j%2?c.water:c.ice);
    p.line('kettle_steam_curl',x+2,y-2,x+1,y-4,j%2?c.water:c.ice);
  }
  for(let j=0;j<5;j++) {
    const x=115+j*7,y=95+(j%2)*3;
    if(wave(i,8,j/5)>.1)p.rect('hearth_floor_glint',x,y,3+j%2,1,c.ember);
  }
}

const shrine={sky:'#494769',upper:'#3a3c60',haze:'#796784',cloud:'#a7808b',cloudLight:'#cba39b',
  sun:'#f4c99d',gold:'#ebac85',pink:'#e7a9b1',rose:'#c97d9a',plum:'#98668b',deep:'#292e4c',
  stone:'#566178',rock:'#414a64',rockLight:'#74788b',green:'#426569',teal:'#548885',mint:'#8cb4a4',
  wood:'#885c69',coral:'#cf7f7a',cream:'#f5d6ac',water:'#79b6b2',foam:'#c8d9bd',ink:'#252b47'};
function shrineBase(p) {
  const c=shrine;
  p.rect('dusk_sky',0,0,192,128,c.sky);p.rect('upper_sky',0,0,192,26,c.upper);
  p.rect('horizon_haze',0,51,192,34,c.haze);p.rect('lower_cloud_bank',0,85,192,43,c.cloud);
  p.ellipse('dusk_sun',40,35,18,18,c.sun);
  p.rect('sun_cloud_band',0,40,55,3,c.sky);p.rect('sun_cloud_tail',10,43,37,2,c.sky);
  p.rect('far_cloud_high',98,18,59,2,c.haze);p.rect('far_cloud_high_tip',120,16,20,2,c.haze);
  p.rect('far_cloud_low',6,64,66,3,c.cloud);p.rect('far_cloud_low_tail',25,61,28,3,c.cloud);
  p.rect('far_cloud_right',154,74,38,4,c.cloudLight);
  // Smaller distant islands reinforce the main island's scale and elevation.
  for(const [x,y,w] of [[5,76,23],[151,50,28],[169,98,29]]) {
    p.poly('far_island',[[x,y],[x+w,y],[x+w-5,y+6],[x+w*.55,y+13],[x+5,y+7]],c.haze);
    p.line('far_island_grass',x,y,x+w,y,c.plum);
    p.rect('far_island_shrine_post',x+7,y-8,1,8,c.haze);p.rect('far_island_shrine_post',x+15,y-8,1,8,c.haze);
    p.poly('far_island_shrine_roof',[[x+3,y-8],[x+19,y-8],[x+17,y-10],[x+7,y-10]],c.haze);
  }
  // The island's silhouette uses deliberate large facets.
  p.poly('floating_island_shadow',[[20,86],[44,74],[140,73],[174,88],[163,104],[145,111],[130,123],[114,120],[102,135],[83,117],[68,126],[50,112],[32,109]],c.ink);
  p.poly('cliff_main_face',[[25,87],[71,88],[87,111],[68,123],[51,108],[33,105]],c.rock);
  p.poly('cliff_middle_face',[[70,87],[123,86],[139,105],[116,121],[102,133],[86,111]],c.stone);
  p.poly('cliff_right_face',[[123,85],[170,89],[160,101],[142,109],[130,121],[135,103]],c.deep);
  p.poly('cliff_face_lit',[[39,94],[48,91],[55,110],[50,108]],c.rockLight);
  p.poly('cliff_face_lit_mid',[[95,98],[106,93],[109,116],[102,126]],c.rockLight);
  p.poly('cliff_dark_fissure',[[73,95],[78,96],[87,114],[83,113]],c.deep);
  p.line('cliff_stratum_left',31,99,47,102,c.stone);p.line('cliff_stratum_right',139,101,157,96,c.rockLight);
  p.poly('island_rim',[[20,84],[43,73],[137,73],[173,85],[161,96],[129,101],[71,98],[41,94]],c.teal);
  p.poly('island_grass',[[23,82],[44,72],[135,72],[170,83],[157,91],[126,96],[73,93],[43,90]],c.green);
  p.line('island_lit_rim_left',25,83,44,74,c.mint);p.line('island_lit_rim_right',139,76,167,84,c.teal);
  p.poly('shrine_stone_path',[[83,69],[103,69],[126,89],[91,96],[70,89]],c.rockLight);
  for(const [x,y,w]of [[82,75,23],[78,81,33],[76,88,43]]) {
    p.poly('path_stone',[[x,y],[x+w,y],[x+w+3,y+3],[x-2,y+3]],c.stone);
    p.line('path_stone_lit_edge',x,y,x+w,y,c.cloudLight);
  }
  // Small sanctuary visible through a monumental torii.
  p.rect('sanctuary_shadow',80,52,32,23,c.deep);p.rect('sanctuary_wood',82,53,28,21,c.wood);
  p.rect('sanctuary_door',92,57,9,17,c.ink);p.rect('sanctuary_door_inner',95,59,3,14,c.coral);
  p.rect('sanctuary_door_light',95,59,1,14,c.gold);
  p.poly('sanctuary_roof_shadow',[[74,54],[79,49],[95,43],[114,49],[120,54]],c.ink);
  p.poly('sanctuary_roof',[[74,52],[80,48],[96,42],[114,48],[120,52],[113,51],[80,51]],c.teal);
  p.line('sanctuary_roof_ridge',88,46,96,42,c.mint);p.line('sanctuary_roof_lip',76,52,118,52,c.mint);
  for(let x=85;x<111;x+=5)p.rect('sanctuary_wood_board',x,56,1,17,c.coral);
  p.rect('sanctuary_steps',78,74,36,3,c.stone);p.rect('sanctuary_step_light',78,74,36,1,c.cloudLight);
  // Roof curves are polygonal pixel clusters, with double crossbeams.
  p.poly('torii_left_foot',[[63,87],[72,87],[70,78],[65,78]],c.ink);
  p.poly('torii_right_foot',[[121,87],[130,87],[128,78],[123,78]],c.ink);
  p.poly('torii_left_post_shadow',[[64,43],[72,43],[71,85],[65,85]],c.wood);
  p.poly('torii_left_post',[[65,43],[70,43],[69,84],[65,84]],c.coral);
  p.line('torii_left_post_light',65,44,65,82,c.gold);
  p.poly('torii_right_post_shadow',[[122,43],[130,43],[128,85],[122,85]],c.wood);
  p.poly('torii_right_post',[[123,43],[127,43],[126,84],[122,84]],c.coral);
  p.line('torii_right_post_light',123,44,122,82,c.gold);
  p.rect('torii_lower_beam_shadow',58,54,77,6,c.wood);
  p.rect('torii_lower_beam',57,53,77,4,c.coral);p.rect('torii_lower_beam_light',57,53,77,1,c.gold);
  p.poly('torii_upper_roof_shadow',[[49,35],[63,39],[127,39],[144,34],[141,42],[128,46],[63,46],[52,42]],c.ink);
  p.poly('torii_upper_roof',[[49,33],[63,37],[127,37],[144,32],[141,38],[128,42],[63,42],[52,38]],c.teal);
  p.line('torii_roof_ridge_left',50,33,63,37,c.mint);p.line('torii_roof_ridge_mid',64,37,127,37,c.mint);
  p.line('torii_roof_ridge_right',128,37,143,32,c.mint);
  p.rect('torii_header',62,44,68,4,c.coral);p.rect('torii_header_lower_edge',63,47,66,1,c.wood);
  p.rect('torii_center_plaque',91,43,12,15,c.deep);p.rect('plaque_inner',93,45,8,11,c.wood);
  p.line('plaque_glyph',96,47,96,52,c.gold);p.line('plaque_glyph_cross',94,49,98,49,c.gold);p.point('plaque_glyph_tail',98,54,c.gold);
  // Sacred rope and folded paper alternate beneath the crossbeam.
  p.poly('sacred_rope',[[71,59],[82,62],[96,63],[112,61],[122,58],[112,63],[96,65],[82,64]],c.gold);
  for(const [x,y]of [[80,63],[96,65],[112,63]])p.poly('paper_offering',[[x,y],[x+3,y],[x+1,y+3],[x+3,y+3],[x,y+7],[x-1,y+4],[x+1,y+2]],c.cream);
  // Cherry trunk and branches rise from the right cliff and frame the shrine.
  p.poly('cherry_trunk_shadow',[[141,86],[150,86],[148,66],[155,51],[150,45],[147,60],[143,68]],c.ink);
  p.poly('cherry_trunk',[[143,84],[148,84],[146,65],[153,50],[150,48],[145,63],[144,71]],c.wood);
  p.poly('cherry_branch_left',[[147,63],[132,56],[119,49],[120,46],[135,52],[148,56]],c.wood);
  p.poly('cherry_branch_right',[[147,61],[161,53],[174,46],[172,42],[160,49],[150,51]],c.wood);
  p.line('cherry_trunk_lit_edge',144,69,145,82,c.coral);
  const blossoms=[[117,45,11,6],[128,49,12,6],[140,40,13,7],[151,43,12,7],[164,39,12,7],[175,45,10,6],[157,30,12,6],[143,29,10,5],[130,35,11,6],[169,32,9,5],[180,37,7,5]];
  for(const [j,[x,y,rx,ry]] of blossoms.entries()) {
    p.ellipse('cherry_blossom_shadow',x,y+2,rx,ry,c.plum);
    p.ellipse('cherry_blossom_cluster',x,y,rx,ry,j%3?c.rose:c.pink);
    p.ellipse('cherry_blossom_lit_cluster',x-3,y-2,rx*.65,ry*.6,c.pink);
    p.rect('cherry_blossom_edge',x-4,y-ry,5,1,c.cloudLight);
    for(let k=0;k<3;k++)p.point('cherry_flower_glint',x-5+k*4,y-2+(k%2),c.cream);
  }
  // Moss tufts, stones and stone lanterns balance the tree.
  for(const [x,y,s] of [[38,82,1],[52,88,.7],[135,88,.7],[157,85,.7]])p.fern('island_fern',x,y,s,[c.green,c.teal,c.mint]);
  for(const [x,y]of [[48,83],[157,83],[131,94],[34,88]]) {
    p.poly('island_stone',[[x-4,y],[x-2,y-3],[x+3,y-2],[x+5,y+1],[x-3,y+2]],c.stone);
    p.line('island_stone_light',x-2,y-3,x+3,y-2,c.rockLight);
  }
  for(const [x,y]of [[30,83],[48,89],[54,78],[136,87],[154,90],[119,94]]) {
    p.rect('moss_lit_cluster',x,y,3,1,c.mint);p.rect('moss_lit_stem',x+1,y-2,1,2,c.teal);
  }
  p.poly('pilgrim_satchel',[[53,79],[60,79],[61,84],[53,85]],c.wood);
  p.line('pilgrim_satchel_strap',53,79,58,76,c.coral);p.line('pilgrim_satchel_strap',58,76,60,79,c.coral);
  p.rect('pilgrim_satchel_clasp',56,80,2,1,c.gold);
  for(const [x,y]of [[43,74],[152,78]]) {
    p.rect('stone_lantern_foot',x-4,y+9,9,2,c.deep);p.rect('stone_lantern_stem',x-2,y+3,4,7,c.rockLight);
    p.rect('stone_lantern_chamber',x-4,y-4,9,8,c.stone);p.rect('stone_lantern_light',x-2,y-2,5,4,c.gold);
    p.rect('stone_lantern_window_bar',x,y-2,1,4,c.wood);
    p.poly('stone_lantern_roof',[[x-7,y-4],[x-3,y-7],[x+3,y-7],[x+7,y-4]],c.deep);
    p.line('stone_lantern_roof_light',x-3,y-7,x+3,y-7,c.mint);
  }
  // The stream reaches the island lip before becoming a hanging waterfall.
  p.poly('island_stream_bank',[[59,87],[74,86],[79,94],[74,98],[58,95]],c.rockLight);
  p.poly('island_stream',[[62,87],[71,87],[76,94],[71,96],[61,94]],c.water);
  p.line('stream_rim',62,87,70,87,c.foam);
  p.poly('waterfall_dark_back',[[60,95],[74,96],[75,128],[58,128]],c.teal);
  p.poly('waterfall_body',[[62,95],[72,96],[73,128],[60,128]],c.water);
  p.rect('waterfall_lit_ribbon',62,98,3,30,c.foam);
  p.rect('waterfall_middle_ribbon',68,97,2,31,c.mint);
  p.line('waterfall_lip',61,95,73,96,c.cream);
  p.rect('low_cloud_foreground',0,120,45,3,c.cloudLight);p.rect('low_cloud_foreground_tail',0,123,32,5,c.cloudLight);
}
function shrineMotion(p,i) {
  const c=shrine;
  for(let j=0;j<8;j++) {
    const y=mod(j*8+i*4,32)+94;
    p.rect('waterfall_falling_glint',63+j%3*3,y,1,3,j%2?c.cream:c.foam);
  }
  for(let j=0;j<3;j++) {
    const x=62+j*3+Math.round(wave(i,16,j/3)),y=96+j;
    p.rect('waterfall_spray',x,y,2,1,c.foam);
  }
  // Orbiting petals follow closed paths with independent phase and doubled gusts.
  for(let j=0;j<13;j++) {
    const a=i/32+j/13,x=105+wave(i,32,j/13)*69,y=65+wave(i,32,j/13+.25)*25+wave(i,16,j/13)*3;
    if(x>51&&x<135&&y<61)continue;
    const flip=Math.floor(a*16)%4;
    p.rect('windblown_cherry_petal',x,y,flip===0?1:2,flip===2?2:1,j%3?c.pink:c.cream);
  }
  // Two paper lanterns hang at different heights and sway in opposite phases.
  for(const [j,[rootX,rootY]]of [[0,[55,44]],[1,[134,45]]]) {
    const x=rootX+Math.round(wave(i,32,j*.5)*2),y=rootY+17;
    p.line('paper_lantern_cord',rootX,rootY,x,y-5,c.wood);
    p.ellipse('paper_lantern_shadow',x,y,4,6,c.wood);
    p.ellipse('paper_lantern_body',x,y-1,4,5,c.coral);
    p.ellipse('paper_lantern_core',x-1,y-1,2,4,c.gold);
    p.rect('paper_lantern_top',x-2,y-6,5,1,c.deep);p.rect('paper_lantern_base',x-2,y+4,5,1,c.wood);
    p.line('paper_lantern_rib',x+1,y-4,x+1,y+2,c.rose);
    p.line('paper_lantern_tassel',x,y+5,x+Math.round(wave(i,16,j/2)),y+8,c.gold);
  }
}

export const scenes={
  'night-station':{base:stationBase,animate:stationMotion},
  'glasshouse':{base:glasshouseBase,animate:glasshouseMotion},
  'ember-workshop':{base:workshopBase,animate:workshopMotion},
  'dusk-shrine':{base:shrineBase,animate:shrineMotion}
};
