// pixelScale: author a recipe's geometry on a grid of 1/pixelScale the size and draw the result at pixelScale.
//
// Recipes keep their screen-unit numbers (the habitat layout, door, collision and anchors never change). With
// pixelScale 2 every shape is rasterised on the half-size source grid, so one source pixel is two screen pixels
// and every outline, seam band, rivet or vent is one source pixel thick at minimum. This is a redraw on a
// coarser grid, not an image resample: coverage is by inclusive pixel cover (a screen pixel maps to the source
// pixel containing it), so nothing vanishes and rectangles that tile at screen size still tile at source size.
// Details that would be finer than one source pixel are simplified in the drawers through p.pixelScale.

export const PIXEL_SCALES=[1,2];

/** Validate the recipe option. The scale is an explicit 1 or 2; transitions are not yet supported. */
export function readPixelScale(config){
  if(config.pixelScale===undefined)return 1;
  if(!PIXEL_SCALES.includes(config.pixelScale))throw Error('Environment pixelScale must be 1 or 2');
  if(config.kind==='terrain-transition')throw Error('pixelScale applies only to terrain, habitat and furniture');
  return config.pixelScale;
}

const down=(v,s)=>Math.floor(v/s);

/** Source-grid rectangle covering the inclusive screen box x..x+w-1. */
function rect({x,y,w,h},s){
  const x0=down(x,s),y0=down(y,s);
  return {x:x0,y:y0,w:down(x+w-1,s)-x0+1,h:down(y+h-1,s)-y0+1};
}

/** Convert one draw operation's shape fields from screen to source coordinates. */
export function scaleShape(type,fields,s){
  if(s===1)return {type,fields};
  if(type==='rect')return {type,fields:rect(fields,s)};
  if(type==='line')return {type,fields:{x1:down(fields.x1,s),y1:down(fields.y1,s),x2:down(fields.x2,s),y2:down(fields.y2,s)}};
  if(type==='ellipse'){
    const {cx,cy,rx,ry}=fields;
    return {type,fields:{cx:down(cx,s),cy:down(cy,s),rx:Math.max(1,Math.round(rx/s)),ry:Math.max(1,Math.round(ry/s))}};
  }
  // polygon: floor each inclusive vertex, drop consecutive repeats, and degrade a collapsed shape to a line or a pixel
  const points=[];
  for(const pt of fields.points){
    const q={x:down(pt.x,s),y:down(pt.y,s)},last=points.at(-1);
    if(!last||last.x!==q.x||last.y!==q.y)points.push(q);
  }
  while(points.length>1&&points[0].x===points.at(-1).x&&points[0].y===points.at(-1).y)points.pop();
  if(points.length>=3)return {type,fields:{points}};
  const [a,b=a]=points;
  return {type:'line',fields:{x1:a.x,y1:a.y,x2:b.x,y2:b.y}};
}

/** Screen-space bounds of the source pixels a screen-space box touches (so reported bounds use screen units). */
export function screenBounds(bounds,s){
  if(s===1||bounds.right<0)return bounds;
  return {left:down(bounds.left,s)*s,top:down(bounds.top,s)*s,right:down(bounds.right,s)*s+s-1,bottom:down(bounds.bottom,s)*s+s-1};
}
export function sourceBounds(bounds,s){
  if(bounds.right<0)return bounds;
  return {left:down(bounds.left,s),top:down(bounds.top,s),right:down(bounds.right,s),bottom:down(bounds.bottom,s)};
}

/**
 * A pen whose coordinates are source pixels, for hand-authored half-size details. Every number is a source
 * pixel: rect(x,y,w,h) fills exactly w by h source pixels, and radii are source pixels.
 */
export function sourcePen(pen,s){
  if(s===1)return pen;
  return {
    rect:(n,x,y,w,h,c)=>pen.rect(n,x*s,y*s,w*s,h*s,c),
    poly:(n,pts,c)=>pen.poly(n,pts.map(([x,y])=>[x*s,y*s]),c),
    line:(n,x1,y1,x2,y2,c)=>pen.line(n,x1*s,y1*s,x2*s,y2*s,c),
    ellipse:(n,cx,cy,rx,ry,c)=>pen.ellipse(n,cx*s,cy*s,rx*s,ry*s,c),
  };
}
