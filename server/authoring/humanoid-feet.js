// Authored pixel silhouettes, never rotated bitmaps. The sole landmarks are
// literal outline vertices, so pose reports and rendered boots cannot disagree.
const SHAPES={
 // Neutral shaft stands directly above its heel; walking retains its own soles.
 rest:{outline:[[-1,-3],[1,-3],[1,-1],[3,-1],[6,0],[6,2],[4,2],[0,2],[-1,1]],fill:[[0,-2],[0,-1],[2,0],[4,0],[5,1],[0,1]],heel:[0,2],ball:[4,2],toe:[6,2]},
 flat:{outline:[[-2,-3],[1,-3],[1,-1],[3,-1],[4,0],[4,2],[2,2],[-2,2]],fill:[[-1,-2],[0,-2],[0,0],[2,0],[3,1],[-1,1]],heel:[-2,2],ball:[2,2],toe:[4,2]},
 heel:{outline:[[-2,-3],[1,-3],[2,-2],[4,-2],[4,0],[2,1],[-2,2]],fill:[[-1,-2],[0,-2],[1,-1],[3,-1],[1,0],[-1,1]],heel:[-2,2],ball:[2,1],toe:[4,0]},
 toe:{outline:[[-2,-3],[1,-3],[2,-1],[4,1],[4,3],[2,3],[-2,1]],fill:[[-1,-2],[0,-2],[1,0],[3,1],[3,2],[2,2],[-1,0]],heel:[-2,1],ball:[2,3],toe:[4,3]},
};
export function profileFoot(ankle,direction,state='flat'){
 const shape=SHAPES[state==='swing'?'flat':state],sign=direction==='left'?-1:1;
 const point=([x,y])=>[ankle[0]+x*sign,ankle[1]+y];
 const heel=point(shape.heel),ball=point(shape.ball),toe=point(shape.toe);
 return {state,contact:state!=='swing',heel,ball,toe,anchor:state==='toe'?toe:heel,outline:shape.outline.map(point),fill:shape.fill.map(point)};
}
