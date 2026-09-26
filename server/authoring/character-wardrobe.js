export const OUTFIT_NAMES=['casual','field','service','retro','wayfarer','phase-suit'];
export const isSealed=outfit=>!['casual','wayfarer'].includes(outfit);

/** Garment panels are split so the legs remain readable throughout the stride. */
export function drawTravelLayers(p,person,outfit,profile,pose,direction){
 const c=person.colors,b=profile,y=b.torsoTop+pose.bob,side=direction==='right',hem=Math.min(49,y+17);
 if(outfit==='wayfarer'){
  p.poly('mantle_left_panel',[[9,y],[16,y+2],[13,hem-5],[10,hem],[5,hem-3]],c.jacketShade);
  p.poly('mantle_right_panel',[[24,y+2],[31,y],[35,hem-3],[30,hem],[27,hem-5]],side?c.jacketShade:c.jacket);
  p.line('mantle_left_trim',9,y+2,7,hem-4,c.accent);
  p.line('mantle_right_trim',31,y+2,33,hem-4,c.accent);
 }
 if(person.equipment==='survey-rig'){
  const x=side?7:11;
  p.poly('equipment_survey_frame',[[x,y+1],[x+4,y-1],[x+8,y+2],[x+8,y+10],[x+4,y+13],[x,y+10]],c.outline);
  p.rect('equipment_survey_case',x+1,y+2,6,8,c.metal);
  p.rect('equipment_survey_cell',x+2,y+3,4,5,c.visor);
  p.rect('equipment_survey_glow',x+3,y+4,2,3,c.signal);
  p.line('equipment_aerial',x+4,y-1,x+4,y-5,c.accent);
 }
}

export function drawTorsoDetails(p,person,outfit,profile,pose,direction){
 const c=person.colors,y=profile.torsoTop+pose.bob,side=direction==='right',back=direction==='up';
 if(outfit==='wayfarer'){
  if(back){
   p.rect('mantle_back',15,y+2,10,profile.hip-profile.torsoTop-1,c.jacketShade);
   p.line('mantle_back_yoke',14,y+2,26,y+2,c.jacketLight);
   p.line('mantle_back_seam',20,y+3,20,profile.hip+pose.bob,c.accent);
   return;
  }
  p.poly('mantle_shoulder_collar',[[13,y],[20,y+3],[27,y],[26,y+4],[20,y+6],[14,y+4]],c.jacketLight);
  p.line('mantle_cross_sash',side?23:16,y+5,side?23:23,profile.hip+pose.bob,c.accent);
  p.rect('equipment_waystone',side?23:19,y+5,3,3,c.signal);
 }
 if(outfit==='phase-suit'){
  if(back){
   p.rect('phase_back_manifold',15,y+2,10,8,c.outline);
   p.rect('phase_back_plate',16,y+3,8,6,c.suitShade);
   p.rect('phase_back_reservoir_left',17,y+4,2,4,c.accent);
   p.rect('phase_back_reservoir_right',21,y+4,2,4,c.accent);
   return;
  }
  if(side){
   p.poly('phase_profile_carapace',[[23,y+2],[25,y+3],[26,y+6],[24,y+10],[23,y+8]],c.suitShade);
   p.rect('phase_side_connector',24,y+4,2,5,c.accent);
   p.rect('phase_core_edge',25,y+5,1,2,c.signal);
   return;
  }
  p.poly('phase_chest_carapace',[[15,y+2],[25,y+2],[26,y+6],[22,y+10],[18,y+10],[14,y+6]],c.suitShade);
  p.poly('phase_field_core',[[20,y+3],[23,y+6],[20,y+9],[17,y+6]],c.outline);
  p.rect('phase_core_light',19,y+5,3,3,back?c.accent:c.signal);
 }
}
