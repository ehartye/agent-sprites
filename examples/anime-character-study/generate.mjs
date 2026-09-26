// Identity: swept chestnut fringe, gold triangular neck clasp, short teal tunic.
// All colors are semantic material roles. Geometry is authored separately by age.
export const palette = {outline:'#39283f',skin:'#efac83',skinLight:'#ffd0a0',skinShade:'#c47774',hair:'#864733',hairShade:'#572f37',hairLight:'#bb7546',teal:'#328f89',tealLight:'#64b9a1',tealShade:'#245867',pants:'#6c6680',boot:'#694348',bootLight:'#986350',gold:'#e7b763',white:'#fff1cf',iris:'#416b79'};
export const geometry = {
 adult:{crown:5,eye:14,chin:20,shoulder:23,waist:31,hem:35,boot:40,hand:31,headLeft:8,headRight:23},
 child:{crown:13,eye:22,chin:27,shoulder:29,waist:34,hem:38,boot:42,hand:34,headLeft:8,headRight:23}
};
export function generate(age='adult', options={}) {
 if(!geometry[age]) throw new Error('Choose adult or child');
 const c={...palette,...options.colors},g=geometry[age],child=age==='child';
 const ops=[{command:'new',name:`reed-${age}`,size:'32x48',rows:1,cols:2,palette:'pico8'}];
 for(let view=0;view<2;view++) {
 const cell=`0,${view}`,front=view===0;
 const p=(name,points,color)=>ops.push({command:'draw',type:'polygon',cell,name,points,color:c[color]??color,filled:true});
 const r=(name,x,y,w,h,color)=>ops.push({command:'draw',type:'rect',cell,name,x,y,w,h,color:c[color]??color,filled:true});
 const t=g.crown,e=g.eye,j=g.chin,s=g.shoulder,h=g.hem;
 if(front) {
 // Anatomical right is on screen left; the stance is neutral, feet apart.
 for(const [side,x] of [['right',10],['left',18]]) {
 r(`${side}_leg_outline`,x,h-1,5,46-h,'outline');r(`${side}_trouser`,x+1,h,3,g.boot-h+1,'pants');
 p(`${side}_boot`,[[x,g.boot],[x+4,g.boot],[x+4,44],[x+5,44],[x+5,45],[x-1,45],[x-1,43],[x,42]],'outline');
 r(`${side}_boot_leather`,x,g.boot+1,4,44-g.boot,'boot');r(`${side}_boot_light`,x,g.boot+1,2,2,'bootLight');
 }
 const left=child?9:7,right=child?22:24;
 for(const [side,x] of [['right',left],['left',right-3]]) {
 p(`${side}_arm_outline`,[[x+1,s],[x+4,s+1],[x+4,g.hand+3],[x+3,g.hand+5],[x,g.hand+4],[x-1,g.hand+2],[x,s+3]],'outline');
 r(`${side}_sleeve`,x+1,s+2,3,child?3:5,side==='left'?'tealShade':'teal');
 r(`${side}_hand`,x,g.hand,3,4,'skin');r(`${side}_hand_light`,x,g.hand,1,2,'skinLight');
 }
 p('tunic_outline',[[12,s-1],[19,s-1],[22,s+2],[20,g.waist],[22,h],[17,h+1],[16,h],[14,h+1],[9,h],[11,g.waist],[9,s+2]],'outline');
 p('tunic',[[12,s],[19,s],[20,s+2],[19,g.waist],[20,h-1],[17,h],[16,h-1],[13,h],[11,h-1],[12,g.waist],[11,s+2]],'teal');
 p('tunic_shadow',[[18,s+2],[20,s+2],[19,g.waist],[20,h-1],[17,h],[17,g.waist]],'tealShade');
 r('tunic_light',12,s+3,2,Math.max(2,g.waist-s-3),'tealLight');
 r('belt',11,g.waist,10,2,'hairShade');r('buckle',15,g.waist,2,2,'gold');
 r('neck_outline',13,j-1,6,s-j+3,'outline');r('neck',14,j,4,s-j+2,'skinShade');
 if(options.clasp!==false) p('gold_clasp',[[13,s],[18,s],[16,s+3]],'gold');
 p('hair_back',[[11,t],[19,t],[23,t+3],[24,e+3],[21,j],[10,j],[7,e+1],[8,t+4]],'outline');
 p('face_base',[[10,t+5],[21,t+5],[22,e+3],[20,j-1],[17,j+1],[13,j],[10,j-2],[9,e+2]],'skin');
 p('face_light',[[11,t+6],[19,t+6],[20,e+3],[16,j-1],[12,j-2],[10,e+2]],'skinLight');
 r('temple_shade',21,e,1,4,'skinShade');r('ear_right',8,e+1,2,3,'skin');r('ear_left',22,e+1,2,3,'skinShade');
 for(const [name,x] of [['right',11],['left',18]]) {
 r(`eye_${name}_lid`,x,e,3,1,'outline');r(`eye_${name}_white`,x,e+1,3,2,'white');r(`eye_${name}_iris`,x+1,e+1,2,2,'iris');r(`eye_${name}_pupil`,x+1,e+1,1,1,'outline');
 }
 r('nose',16,e+3,1,1,'skinShade');r('mouth',15,j-2,2,1,'skinShade');
 p('hair_cap',[[9,t+3],[12,t+1],[19,t+1],[22,t+4],[22,t+7],[20,t+6],[18,t+5],[15,t+7],[13,t+7],[11,t+8],[9,t+7]],'hair');
 p('hair_swept_fringe',[[10,t+5],[18,t+3],[21,t+5],[18,t+6],[16,t+7],[13,t+8],[14,t+6],[11,t+8]],'hair');
 p('hair_highlight',[[11,t+3],[14,t+2],[18,t+2],[20,t+3],[15,t+4],[11,t+5]],'hairLight');
 p('side_lock_right',[[8,t+5],[10,t+5],[10,e+2],[9,e+3],[8,e+1]],'hairShade');
 } else {
 r('far_leg_outline',12,h-1,5,46-h,'outline');r('far_trouser',13,h,3,g.boot-h+1,'pants');r('far_boot',12,g.boot,6,6-(g.boot-40),'outline');r('far_boot_plane',13,g.boot+1,2,44-g.boot,'bootLight');r('far_boot_toe',13,44,2,1,'boot');
 r('near_leg_outline',16,h-1,5,46-h,'outline');r('near_trouser',17,h,3,g.boot-h+1,'pants');
 p('near_boot_outline',[[16,g.boot],[20,g.boot],[20,43],[23,44],[23,45],[16,45]],'outline');
 p('near_boot',[[17,g.boot+1],[19,g.boot+1],[19,43],[22,44],[17,44]],'boot');r('boot_light',17,g.boot+1,2,1,'bootLight');
 p('tunic_outline',[[13,s-1],[19,s-1],[21,s+3],[20,g.waist],[22,h],[17,h+1],[12,h],[13,g.waist],[11,s+3]],'outline');
 p('tunic',[[14,s],[18,s],[20,s+3],[19,g.waist],[20,h-1],[13,h-1],[14,g.waist],[12,s+3]],'teal');
 r('tunic_shadow',13,s+4,2,h-s-4,'tealShade');r('belt',13,g.waist,7,2,'hairShade');r('buckle',20,g.waist,1,2,'gold');
 r('neck_outline',15,j-1,5,s-j+3,'outline');r('neck',16,j,3,s-j+2,'skinShade');if(options.clasp!==false) r('clasp',19,s+1,2,2,'gold');
 p('hair_back',[[11,t],[19,t],[23,t+3],[23,e-1],[24,e+1],[24,e+2],[23,e+3],[23,e+3],[23,j-2],[20,j],[14,j+1],[10,j-2],[8,e],[8,t+4]],'outline');
 p('face_base',[[17,t+4],[21,t+4],[22,e],[22,e+1],[23,e+2],[22,e+3],[22,j-2],[19,j],[15,j-1],[13,e+1]],'skin');
 p('face_light',[[18,t+5],[21,t+5],[21,e+1],[23,e+2],[21,e+3],[21,j-2],[19,j-1],[16,j-2],[16,e+1]],'skinLight');
 r('eye_near_lid',19,e,3,1,'outline');r('eye_near_white',19,e+1,3,2,'white');r('eye_near_iris',20,e+1,2,2,'iris');r('eye_near_pupil',21,e+1,1,1,'outline');r('mouth',22,j-3,1,1,'skinShade');
 p('hair_cap',[[10,t+3],[12,t+1],[19,t+1],[22,t+4],[21,t+6],[19,t+5],[17,t+7],[15,t+8],[14,e+3],[11,j-2],[9,e],[9,t+5]],'hair');
 p('rear_hair_shade',[[9,t+5],[12,t+6],[12,j-2],[10,j-3],[9,e]],'hairShade');
 p('hair_highlight',[[11,t+3],[14,t+2],[18,t+2],[20,t+3],[16,t+4],[12,t+5]],'hairLight');
 r('ear',14,e+1,3,3,'skin');r('ear_shadow',14,e+2,1,2,'skinShade');
 p('near_arm_outline',[[15,s+1],[18,s+1],[19,s+3],[18,g.hand+1],[19,g.hand+3],[18,g.hand+5],[15,g.hand+5],[14,g.hand+3],[15,g.hand]],'outline');
 p('near_sleeve',[[16,s+2],[18,s+2],[18,s+4],[17,s+6],[15,s+6]],'teal');r('sleeve_light',16,s+2,1,3,'tealLight');
 r('near_hand',15,g.hand+1,3,3,'skin');r('hand_light',16,g.hand+1,1,2,'skinLight');
 }
 // Restore the outer contour after overlapping material fills. These source-grid
 // edge runs belong to their editable part groups, not a flattened raster overlay.
 const edge=(name,x1,y1,x2=x1,y2=y1)=>ops.push({command:'draw',type:'line',cell,name,x1,y1,x2,y2,color:c.outline});
 if(front) {
  edge('hair_crown_contour',9,t+3);
  edge('hair_left_contour',8,t+5,8,t+6);
  edge('face_ear_contour',8,e+2,8,e+3);
  if(!child) {
   edge('face_chin_contour',19,j);
   edge('right_hand_contour',7,g.hand+3);
   for(const [side,x] of [['right',10],['left',18]]) edge(`${side}_boot_contour`,x,g.boot+1,x,g.boot+2);
  }
 } else {
  if(!child) { edge('hair_back_upper_contour',9,e+1); edge('hair_back_lower_contour',10,j-3); }
  edge('face_chin_contour',21,j-1);
  if(options.clasp!==false) edge('clasp_contour',20,s+1,20,s+2);
  edge('tunic_back_contour',13,g.waist-(child?0:1),13,g.waist+1);
  edge('belt_front_contour',20,g.waist,20,g.waist+1);
  edge('near_boot_toe_contour',22,44);
 }
 for(const [name,pattern] of Object.entries({hair:'^(hair_|rear_hair|side_lock)',face:'^(face_|eye_|nose|mouth|ear|temple)',clothing:'^(tunic|belt|buckle|gold_clasp|clasp)',limbs:'^(right_|left_|near_|far_|boot_|hand_|sleeve_)'})) ops.push({command:'shape-group',sub:'create',cell,name,pattern});
 ops.push({command:'name',cell,as:front?'idle_front':'idle_right'});
 ops.push({command:'group',sub:'create',name:front?'idle_front':'idle_right',cells:[cell],fps:4});
 }
 ops.push({command:'pivot',anchor:'bottom-center'});return ops;
}
import { readFileSync } from 'node:fs';
const options=process.argv[3]?JSON.parse(readFileSync(process.argv[3],'utf8')):{};
console.log(JSON.stringify(generate(process.argv[2]??'adult',options)));


