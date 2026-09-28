// Pixel-art outline cleanup for point-based sprites (native mannequins, traces).
/**
 * Outside outline corners: where a horizontal and a vertical outline run meet,
 * drop the corner pixel so the runs join diagonally. A candidate is an outline
 * pixel with exactly one horizontal and one vertical neighbor, both outline, and
 * empty on its other two sides. One pass only, so corners never cascade.
 */
export function cutOutlineCorners(ops,outline){
 // One colour or a set: garments, hair and skin each carry their own outline colour.
 const outlines=typeof outline==='string'?new Set([outline]):new Set(outline);
 const removed=[];
 // Composites stack layers at one position (body under garment). Decide on the
 // visible top pixel, but cut every layer there so nothing shows through.
 const byCell=new Map(),layers=new Map();
 for(const o of ops)if(o.command==='draw'&&o.type==='point'){
  if(!byCell.has(o.cell))byCell.set(o.cell,new Map());byCell.get(o.cell).set(o.x+','+o.y,o);
  const key=o.cell+'@'+o.x+','+o.y;(layers.get(key)??layers.set(key,[]).get(key)).push(o);
 }
 const drop=new Set();
 for(const [cell,px] of byCell){
  const at=(x,y)=>px.get(x+','+y),line=(x,y)=>outlines.has(at(x,y)?.color);
  for(const p of px.values()){
   if(!outlines.has(p.color))continue;
   const h=[at(p.x-1,p.y),at(p.x+1,p.y)],v=[at(p.x,p.y-1),at(p.x,p.y+1)];
   if(h.filter(Boolean).length!==1||v.filter(Boolean).length!==1)continue;
   const hx=h[0]?p.x-1:p.x+1,vy=v[0]?p.y-1:p.y+1;
   if(!line(hx,p.y)||!line(p.x,vy))continue;
   for(const layer of layers.get(cell+'@'+p.x+','+p.y))drop.add(layer);
   removed.push({cell,x:p.x,y:p.y});
  }
 }
 const names=new Map([...drop].map(p=>[p.cell+'/'+p.name,true]));
 const kept=ops.filter(o=>!drop.has(o)).map(o=>o.command==='shape-group'?{...o,shapes:o.shapes.filter(n=>!names.has(o.cell+'/'+n))}:o);
 return {ops:kept,removed};
}
