import {test,expect} from 'vitest';
import {hitTestShapes} from '../../server/web/public/js/tools.js';
const layer=(id,z,w=4,h=4)=>({id,x:0,y:0,w,h,z,background:{mode:'transparent'}});
const point=(id,z,layers,x=1,y=1)=>({id,name:id,type:'point',params:{x,y,layers},color:'#fff',visible:true,zIndex:z});
const bounds={width:8,height:8};

test('selection and Delete follow retained layer paint order before local member order',()=>{
  const back=point('back',10,[layer('back-canvas',0)]),front=point('front',0,[layer('front-canvas',20)]);
  expect(hitTestShapes([back,front],1,1,bounds)).toBe(front);
});
test('clipped-out primitives cannot be selected through their hidden geometry',()=>{
  const hidden=point('outside',0,[layer('clip',0,2,2)],3,3);
  expect(hitTestShapes([hidden],3,3,bounds)).toBeNull();
  const nested=point('nested',0,[layer('outer',0,2,2),layer('inner',0)],3,1);
  expect(hitTestShapes([nested],3,1,bounds)).toBeNull();
});
test('one-pixel hit tolerance measures only visible clipped pixels',()=>{
  const visible=point('inside',0,[layer('clip',0,2,2)]);
  expect(hitTestShapes([visible],2,1,bounds)).toBe(visible);
  const rect={...visible,type:'rect',params:{x:1,y:1,w:4,h:4,filled:true,layers:[layer('clip',0,2,2)]}};
  expect(hitTestShapes([rect],3,3,bounds)).toBeNull();
  expect(hitTestShapes([rect],2,1,bounds)).toBe(rect);
});
