import {scene} from './art.mjs';
import {timeline} from './timeline.mjs';
const operations=[{command:'new',name:'cozy-cat',size:'160x112',rows:10,cols:8,palette:'db-32'}];
for(const pose of timeline){
  const cell=`${Math.floor(pose.frame/8)},${pose.frame%8}`;
  operations.push({command:'clear',cell});
  operations.push({command:'compose',cell,prefix:'morning',...scene(pose),replay:{label:`Marmalade: ${pose.beat}, pose ${pose.frame+1}`}});
  operations.push({command:'lighting',cell,lighting:{palettePolicy:'rgb',cell:4,smooth:false,block:.08,ambient:.84,ambientColor:'#fff5e4',sky:.14,skyColor:'#fff2d0',skyReach:160,skyDir:[1,-1],relief:.28}});
  operations.push({command:'duration',cell,ms:100});
  operations.push({command:'name',cell,as:`little_morning_${String(pose.frame).padStart(2,'0')}`});
}
operations.push({command:'group',sub:'create',name:'little_morning',cells:timeline.map(p=>`${Math.floor(p.frame/8)},${p.frame%8}`),fps:10,loop:true});
operations.push({command:'pivot',x:0,y:0});
process.stdout.write(JSON.stringify(operations)+'\n');
