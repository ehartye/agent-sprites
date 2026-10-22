import {readFileSync} from 'node:fs';
import {actions} from './poses.mjs';
import {contourShapes} from './contour.mjs';

const C=JSON.parse(readFileSync(new URL('./palette.json',import.meta.url),'utf8'));
const ops=[{command:'new',name:'tessel',size:64,rows:16,cols:8,palette:'db-32'}];
const flat=(vector=[0,0,1],extra={})=>({normal:{mode:'flat',vector},...extra});
const round={normal:{mode:'dome',depth:2},material:{solid:true}};
const bevel={normal:{mode:'bevel',width:2,depth:1},material:{solid:true}};
const shape=(name,type,color,params,surface=flat())=>({name,type,color:C[color]??color,params:{...params,surface}});
const poly=(name,color,points,surface)=>shape(name,'polygon',color,{points:points.map(([x,y])=>({x:Math.round(x),y:Math.round(y)})),filled:true},surface);
const rect=(name,color,x,y,w,h,surface)=>shape(name,'rect',color,{x,y,w,h,filled:true},surface);

function character(action,p){
  const {sx,sy,lift,fan,tail,lean,eye,frame}=p;
  const parts={},placements=[];
  const transform=([x,y])=>[Math.round(32+(x-32)*sx+lean),Math.round(46+(y-46)*sy-lift)];
  const P=(points)=>points.map(transform);
  const add=(part,shapes,x=0,y=0)=>{parts[part]={shapes};placements.push({kind:'stamp',part,name:part,x,y});};
  // The far tripod sits behind the belly. Three separately named, stable paddles.
  const gait=action==='scuttle'||action==='burst';
  const stride=action==='burst'?6:4;
  const gaitPhase=(leg,near)=>((frame+(leg%2===0?0:4)+(near?0:4))%8);
  const feet=(near)=>{
    for(let leg=0;leg<3;leg++){
      const phase=gaitPhase(leg,near);
      const dx=gait?[stride,2,0,-2,-stride,-1,2,4][phase]:0;
      let rise=gait?[0,0,0,0,0,3,5,3][phase]:0;
      if(action==='hop'&&lift>3)rise=5+(leg%2)*2;
      if(action==='rest')rise=1;
      const x=[20,31,43][leg]+(near?0:3)+dx;
      const ground=(near?54:51)-rise-((action==='hop'&&lift>3)?lift:0);
      const root=transform([[21,31,42][leg]+(near?0:2),near?45:44]);
      const ankle=[x,Math.min(ground-2,root[1]+8)];
      const k=near?'near':'far';
      add(`${k}-paddle-${leg+1}`,[
        poly('outline','ink',[[root[0]-2,root[1]],[root[0]+2,root[1]], [ankle[0]+2,ankle[1]-1],[x+4,ground-2],[x+3,ground],[x-4,ground],[x-5,ground-2],[ankle[0]-2,ankle[1]-2]]),
        poly('web',near?'petrol':'petrolDark',[[root[0]-1,root[1]],[root[0]+1,root[1]],[ankle[0]+1,ankle[1]],[x+3,ground-2],[x+2,ground-1],[x-3,ground-1],[x-3,ground-2],[ankle[0]-1,ankle[1]-1]],round),
        poly('paddle-light',near?'seaGlass':'petrol',[[x-3,ground-2],[x+2,ground-2],[x+1,ground-1],[x-3,ground-1]],flat([0,-.5,1]))
      ]);
    }
  };
  feet(false);
  // A doubled-back ribbon, a new anatomical form rather than a held accessory.
  // The flinch folds its trailing end inward so no authored pose meets the canvas edge.
  const ribbonShift=Math.max(0,2-transform([4,40])[0]);
  const R=(points)=>P(points).map(([x,y])=>[x+ribbonShift,y]);
  add('ribbon',[
    poly('outer','ink',R([[21,42],[14,43],[8,39+tail],[4,40+tail],[5,45+tail],[11,49],[19,47],[22,45]])),
    poly('upper','petrol',R([[20,43],[14,44],[8,41+tail],[6,41+tail],[7,44+tail],[12,46],[19,45]]),round),
    poly('return-fold','seaGlass',R([[8,43+tail],[12,46],[18,45],[20,46],[12,48],[8,46+tail]]),flat([-.5,-.4,1]))
  ]);
  add('soft-body',[
    poly('outline','ink',P([[16,36],[24,32],[41,33],[50,37],[52,43],[48,48],[36,51],[24,50],[17,47],[14,42]])),
    poly('upper','petrol',P([[17,37],[25,34],[40,35],[49,38],[50,43],[46,47],[36,49],[24,48],[18,46],[16,42]]),round),
    poly('lower','petrolDark',P([[17,43],[26,45],[39,44],[49,41],[49,45],[45,48],[35,50],[24,49],[18,46]]),flat([0,.5,1])),
    poly('cheek','seaGlass',P([[35,40],[44,37],[49,39],[50,42],[46,45],[38,46],[34,44]]),round),
    poly('jaw-light','seaLight',P([[39,44],[46,43],[49,41],[48,44],[44,46],[39,46]]),flat([.5,-.3,1]))
  ]);
  // Five overlapping folded shell leaves share a root along the curved back.
  // Opening lifts their peaks on different arcs, producing a fan silhouette.
  const panels=[
    {name:'rear-leaf',pts:[[12,37],[14,31],[20,26],[26,25],[24,33],[23,41]],peak:[18,17],crease:[[15,32],[23,28],[23,37]],color:'coral',shadow:'coralDark',light:'coralLight'},
    {name:'back-leaf',pts:[[19,32],[23,25],[31,23],[35,26],[32,36],[27,42]],peak:[26,11],crease:[[24,27],[30,26],[30,36]],color:'ivory',shadow:'ivoryShadow',light:'ivoryLight'},
    {name:'crown-leaf',pts:[[28,29],[32,24],[40,25],[44,29],[39,38],[32,42]],peak:[37,9],crease:[[33,26],[39,27],[36,37]],color:'coral',shadow:'coralDark',light:'coralLight'},
    {name:'front-leaf',pts:[[36,31],[42,27],[48,30],[51,34],[45,40],[37,43]],peak:[48,15],crease:[[42,30],[47,32],[43,38]],color:'ivory',shadow:'ivoryShadow',light:'ivoryLight'},
    {name:'hood-leaf',pts:[[42,35],[48,32],[53,35],[54,39],[48,41],[42,42]],peak:[56,24],crease:[[47,35],[51,36],[47,39]],color:'coral',shadow:'coralDark',light:'coralLight'}
  ];
  for(const [n,panel] of panels.entries()){
    const f=Math.max(-.12,fan);
    const pts=panel.pts.map(([x,y],i)=>{
      if(i<4){const strength=[.28,.85,1,.6][i];return [x+(panel.peak[0]-panel.pts[2][0])*f*strength,y+(panel.peak[1]-panel.pts[2][1])*f*strength];}
      return [x,y];
    });
    const center=pts.reduce((a,b)=>[a[0]+b[0]/pts.length,a[1]+b[1]/pts.length],[0,0]);
    const inner=pts.map(([x,y])=>[x+(center[0]-x)*.12,y+(center[1]-y)*.12]);
    const a=inner[0],b=inner[1],c=inner[2],d=inner[3],e=inner[4],g=inner[5];
    add(panel.name,[
      poly('outer-edge','ink',P(pts),flat([0,0,1],{material:{solid:true}})),
      poly('main-plane',panel.color,P(inner),bevel),
      poly('fold-shadow',panel.shadow,P([c,d,e,g,[center[0]+1,center[1]+1]]),flat([.55,.4,1],{material:{solid:true}})),
      poly('lit-plane',panel.light,P([a,b,c,[center[0]-1,center[1]-1]]),flat([-.35,-.65,1],{material:{solid:true}}))
    ]);
  }
  // The crescent rim ties the fan roots together and leaves a luminous face exposed.
  add('fold-rim',[
    poly('outline','ink',P([[12,37],[20,39],[29,40],[39,39],[50,36],[53,38],[49,42],[39,44],[28,44],[18,42],[13,40]])),
    poly('edge','ivoryShadow',P([[14,38],[22,40],[31,41],[40,40],[50,38],[51,39],[47,41],[38,43],[28,43],[18,41]]),bevel),
    poly('seam-light','ivory',P([[16,39],[24,41],[33,42],[42,41],[48,39],[47,41],[38,43],[28,43],[20,41]]),flat([0,-.5,1]))
  ]);
  feet(true);
  const ep=transform([44,43]);
  const closed=eye===1||eye===2||eye===5;
  const happy=eye===4;
  const eyeHeight=eye===3?3:2;
  add('face',[
    poly('mask','petrolDark',P([[38,40],[44,39],[50,40],[50,44],[45,47],[39,46],[36,44]]),round),
    ...(closed?[
      poly('eye-near','amber',P(eye===2?[[44,41],[47,43],[44,44],[44,43],[46,43]]:[[44,43],[48,42],[48,43],[45,44]]),{material:{unlit:true},lamps:[{name:'face-glow',x:ep[0],y:ep[1],radius:18,power:.18,z:5,color:C.amber}]}),
      poly('eye-far','amber',P([[39,42],[41,42],[41,43],[39,43]]),{material:{unlit:true}})
    ]:happy?[
      poly('eye-near','eyeLight',P([[44,43],[45,41],[47,41],[48,43],[47,43],[46,42],[45,43]]),{material:{unlit:true},lamps:[{name:'face-glow',x:ep[0],y:ep[1],radius:20,power:.24,z:5,color:C.amber}]}),
      poly('eye-far','amber',P([[39,42],[40,41],[41,42],[41,43],[40,42],[39,43]]),{material:{unlit:true}})
    ]:[
      poly('eye-near','eyeLight',P([[44,41],[47,41],[48,42],[47,41+eyeHeight],[44,42+eyeHeight]]),{material:{unlit:true},lamps:[{name:'face-glow',x:ep[0],y:ep[1],radius:20,power:.22,z:5,color:C.amber}]}),
      poly('eye-far','amber',P([[39,41],[41,41],[41,43],[39,43]]),{material:{unlit:true}})
    ]),
    poly('mouth','ink',P([[43,46],[46,45],[46,46],[44,47],[42,47]])),
    poly('chin','seaGlass',P([[40,46],[42,47],[45,47],[44,48],[40,47]]))
  ]);
  add('outer-contour',contourShapes(parts,placements,C.ink));
  return {parts,placements};
}
for(const [a,action] of actions.entries()){
  for(let f=0;f<8;f++){
    const right=`${a*2},${f}`,left=`${a*2+1},${f}`;
    ops.push({command:'clear',cell:right});
    ops.push({command:'compose',cell:right,prefix:'tessel',...character(action.id,action.poses[f]),replay:{label:`Tessel: ${action.id} authored pose ${f+1}`}});
    ops.push({command:'lighting',cell:right,lighting:{palettePolicy:'rgb',cell:2,smooth:false,block:.08,ambient:.85,ambientColor:'#fff4e7',sky:.18,skyColor:'#e4f5ef',skyDir:[-1,-1],skyReach:64,relief:.35}});
    ops.push({command:'duration',cell:right,ms:action.durations[f]});
    ops.push({command:'name',cell:right,as:`${action.id}_right_${f+1}`});
    ops.push({command:'copy',from:right,to:left});
    ops.push({command:'mirror',cell:left,axis:'horizontal'});
    ops.push({command:'duration',cell:left,ms:action.durations[f]});
    ops.push({command:'name',cell:left,as:`${action.id}_left_${f+1}`});
  }
  for(const [offset,side] of [[0,'right'],[1,'left']])ops.push({command:'group',sub:'create',name:`${action.id}_${side}`,cells:Array.from({length:8},(_,f)=>`${a*2+offset},${f}`),fps:8,loop:action.loop});
}
ops.push({command:'pivot',x:32,y:55});
process.stdout.write(JSON.stringify(ops)+'\n');
