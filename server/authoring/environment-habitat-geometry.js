// Integer geometry for habitat exteriors. Environment shapes are flat polygons, rectangles, lines and
// ellipses, so curved or clipped forms are expressed as polygons computed here, never as raster masks.

const roundPoint=([x,y])=>[Math.round(x),Math.round(y)];
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];

/** Drop consecutive duplicate points; return null when fewer than three points remain. */
export function tidy(points){
  const out=[];
  for(const point of points.map(roundPoint))if(!out.length||!same(out.at(-1),point))out.push(point);
  if(out.length>1&&same(out[0],out.at(-1)))out.pop();
  return out.length>=3?out:null;
}

function clipEdge(points,inside,cross){
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],ia=inside(a),ib=inside(b);
    if(ia)out.push(a);
    if(ia!==ib)out.push(cross(a,b));
  }
  return out;
}

/** Sutherland-Hodgman clip against an axis-aligned box. Exact for convex polygons. */
export function clipPoly(points,{x0=-Infinity,x1=Infinity,y0=-Infinity,y1=Infinity}={}){
  let out=points;
  const atX=x=>(a,b)=>[x,a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])];
  const atY=y=>(a,b)=>[a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]),y];
  if(Number.isFinite(x0))out=clipEdge(out,p=>p[0]>=x0,atX(x0));
  if(Number.isFinite(x1))out=out.length?clipEdge(out,p=>p[0]<=x1,atX(x1)):out;
  if(Number.isFinite(y0))out=out.length?clipEdge(out,p=>p[1]>=y0,atY(y0)):out;
  if(Number.isFinite(y1))out=out.length?clipEdge(out,p=>p[1]<=y1,atY(y1)):out;
  return out.length?tidy(out):null;
}

/** Points on an ellipse arc, angles in degrees with 0 at east and 90 at south (screen coordinates). */
export function arcPoints(cx,cy,rx,ry,from=0,to=360,steps=Math.max(12,Math.ceil(Math.max(rx,ry)/2))){
  const points=[];
  for(let i=0;i<=steps;i++){
    const a=(from+(to-from)*i/steps)*Math.PI/180;
    points.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*ry]);
  }
  return points;
}

export const ellipsePoly=(cx,cy,rx,ry,steps)=>tidy(arcPoints(cx,cy,rx,ry,0,360,steps));

/** Rounded rectangle; r maps corner names tl, tr, br, bl to radii. */
export function roundedRectPoly(x0,y0,x1,y1,r){
  const {tl=0,tr=0,br=0,bl=0}=typeof r==='number'?{tl:r,tr:r,br:r,bl:r}:r;
  const arc=(cx,cy,radius,from)=>radius?arcPoints(cx,cy,radius,radius,from,from+90,Math.max(4,Math.ceil(radius/2))):[[cx,cy]];
  return tidy([...arc(x0+tl,y0+tl,tl,180),...arc(x1-tr,y0+tr,tr,270),...arc(x1-br,y1-br,br,0),...arc(x0+bl,y1-bl,bl,90)]);
}

/** A line with real thickness as a polygon, so ribs and booms keep a constant, clean width. */
export function thickLine(x1,y1,x2,y2,width){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len*width/2,ny=dx/len*width/2;
  return tidy([[x1+nx,y1+ny],[x2+nx,y2+ny],[x2-nx,y2-ny],[x1-nx,y1-ny]]);
}

/** x on an ellipse boundary at a given y, left or right side. */
export function ellipseX(cx,cy,rx,ry,y,side){
  const t=1-((y-cy)/ry)**2;
  return t<0?null:cx+(side==='left'?-1:1)*rx*Math.sqrt(t);
}

/**
 * Hard-terminator planes across a form: draw the whole form in the base color, then overlay vertical slabs.
 * colors[i] covers up to cuts[i] (fractions of x0..x1); base is the color drawn first.
 */
export function drawPlanes(p,prefix,poly,x0,x1,{base,slabs}){
  p.poly(`${prefix}_base`,poly,base);
  let left=x0;
  for(const [i,[cut,color]] of slabs.entries()){
    const right=cut>=1?x1:Math.round(x0+(x1-x0)*cut);
    const part=clipPoly(poly,{x0:left,x1:right});
    if(part&&color!==base)p.poly(`${prefix}_plane_${i}`,part,color);
    left=right;
  }
}
