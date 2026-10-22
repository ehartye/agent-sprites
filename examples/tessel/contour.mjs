import {rasterShape} from '../../server/web/public/js/shared/raster.js';

// Compile only an editable outline path from the authored part geometry. The
// underlying colored polygons, normals, material regions and lamps stay intact.
// Pixel-center contour vertices avoid fractional insets rounding onto an edge.
export function contourShapes(parts,placements,color){
  const occupied=new Set(),key=(x,y)=>`${x},${y}`;
  for(const placement of placements)for(const shape of parts[placement.part].shapes){
    if(shape.visible===false)continue;
    const px=(x,y)=>occupied.add(key(x+placement.x,y+placement.y));
    rasterShape(shape.type,shape.params,{px,rect:(x,y,w,h)=>{for(let py=y;py<y+h;py++)for(let px2=x;px2<x+w;px2++)px(px2,py);}});
  }
  const edges=[],outgoing=new Map();
  const edge=(start,end,owner)=>{
    const id=edges.length;edges.push({start,end,owner});
    const k=key(...start);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(id);
  };
  for(const pixel of occupied){
    const [x,y]=pixel.split(',').map(Number);
    if(!occupied.has(key(x,y-1)))edge([x,y],[x+1,y],[x,y]);
    if(!occupied.has(key(x+1,y)))edge([x+1,y],[x+1,y+1],[x,y]);
    if(!occupied.has(key(x,y+1)))edge([x+1,y+1],[x,y+1],[x,y]);
    if(!occupied.has(key(x-1,y)))edge([x,y+1],[x,y],[x,y]);
  }
  const seen=new Set(),shapes=[];
  for(let initial=0;initial<edges.length;initial++){
    if(seen.has(initial))continue;
    const points=[];
    let id=initial;
    while(id!==undefined&&!seen.has(id)){
      seen.add(id);
      const item=edges[id],last=points.at(-1);
      if(!last||last[0]!==item.owner[0]||last[1]!==item.owner[1])points.push(item.owner);
      id=outgoing.get(key(...item.end))?.find(next=>!seen.has(next));
    }
    if(points.length>1)points.push(points[0]);
    // Remove straight-run intermediate vertices without changing their pixel path.
    const path=[];
    for(const point of points){
      while(path.length>1){
        const a=path.at(-2),b=path.at(-1);
        const cross=(b[0]-a[0])*(point[1]-b[1])-(b[1]-a[1])*(point[0]-b[0]);
        const dot=(b[0]-a[0])*(point[0]-b[0])+(b[1]-a[1])*(point[1]-b[1]);
        if(cross!==0||dot<0)break;
        path.pop();
      }
      path.push(point);
    }
    if(path.length>256)throw new Error('Editable contour exceeds polygon vertex budget');
    shapes.push(path.length===1?{name:`edge-${shapes.length+1}`,type:'point',color,params:{x:path[0][0],y:path[0][1],surface:{normal:{mode:'flat'},material:{unlit:true}}}}:{name:`edge-${shapes.length+1}`,type:'polyline',color,params:{points:path.map(([x,y])=>({x,y})),surface:{normal:{mode:'flat'},material:{unlit:true}}}});
  }
  return shapes;
}
