// The same retained geometry is lit by three explicitly positioned lamps.
const operations=[{command:'new',name:'surface-lighting',size:'32x24',rows:1,cols:3,palette:'pico8'}];
const draw=(cell,name,type,color,params,surface)=>operations.push({command:'draw',cell,name,type,color,...params,...(surface?{surface}:{})});
for(const [frame,lampX] of [5,16,27].entries()){
  const cell=`0,${frame}`;
  draw(cell,'back-wall','rect','#283747',{x:1,y:1,w:30,h:22,filled:true},{material:{wall:true}});
  draw(cell,'floor','rect','#71604c',{x:1,y:20,w:30,h:3,filled:true},{normal:{mode:'bevel',width:1,depth:1},material:{solid:true}});
  draw(cell,'orb','circle','#63a27c',{cx:9,cy:14,r:5,filled:true},{normal:{mode:'dome',depth:5}});
  draw(cell,'crate','rect','#b18059',{x:18,y:9,w:10,h:11,filled:true},{normal:{mode:'bevel',width:2,depth:2},material:{solid:true}});
  draw(cell,'metal-label','rect','#bbc7cd',{x:20,y:11,w:6,h:4,filled:true},{normal:{mode:'grid',x:20,y:11,rows:['788889','455556','455556','122223']}});
  draw(cell,'stone','ellipse','#758694',{cx:7,cy:20,rx:4,ry:2,filled:true,pattern:'sparse',color2:'#abb6bd'},{normal:{mode:'luma',depth:3}});
  draw(cell,'lamp-wire','line','#202630',{x1:lampX,y1:1,x2:lampX,y2:4});
  draw(cell,'lamp','circle','#ffdb90',{cx:lampX,cy:5,r:1,filled:true},{material:{unlit:true},lamps:[{name:'warm-key',x:lampX,y:5,radius:32,power:1.25,z:4,color:'#ffd7a3'}]});
  operations.push({command:'lighting',cell,lighting:{palettePolicy:'rgb',cell:1,smooth:false,block:0.55,ambient:0.16,ambientColor:'#bdcce2',relief:1}});
  operations.push({command:'duration',cell,ms:[75,125,200][frame]});
  operations.push({command:'name',cell,as:`lamp-${frame}`});
}
operations.push({command:'group',sub:'create',name:'sweep',cells:['0,0','0,1','0,2'],direction:'pingpong_reverse',loop:false});
operations.push({command:'pivot',x:16,y:22});
process.stdout.write(JSON.stringify(operations,null,2)+'\n');
