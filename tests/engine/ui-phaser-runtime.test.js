import {test, expect, vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {existsSync} from 'node:fs';
import {normalizeBitmapFont} from '../../server/build/ui-runtime.mjs';
import {defineTheme} from '../../server/build/ui-theme.mjs';
import {layoutUi} from '../../server/build/ui-layout.mjs';
import {iterateNineSliceTiles,projectPixelRect} from '../../server/build/ui-runtime.mjs';
import * as u from '../../server/build/ui-components.mjs';
const {button}=u;

// Observe the real portable publisher without adding a production test API or
// replacing weak ownership. Normally disabled; assertions compare actual plans.
const nativePlanObservation=vi.hoisted(()=>({observe:null}));
vi.mock('../../server/build/ui-theme.mjs',async importOriginal=>{
  const real=await importOriginal();
  return {...real,publishUiData(value){const result=real.publishUiData(value);nativePlanObservation.observe?.(result);return result;}};
});

// This seam double models only the installed Phaser Image/Rectangle/Texture APIs.
// It cannot establish native pixels, renderer state or real input transport.
// Phaser Container child order is list order, NOT child.depth. Sorting is explicit.
function fakeContainer(children=[]) {
 const parent={kind:'container',list:[],destroyed:0,visible:true,parentContainer:null,
  add(value){for(const child of Array.isArray(value)?value:[value]){if(child.parentContainer===this)continue;child.parentContainer?.remove(child);this.list.push(child);child.parentContainer=this;}return this;},
  remove(child,destroy=false){const i=this.list.indexOf(child);if(i>=0){this.list.splice(i,1);child.parentContainer=null;if(destroy)child.destroy();}return this;},
  moveTo(child,index){const i=this.list.indexOf(child);if(i<0)throw Error('Missing child');this.list.splice(i,1);this.list.splice(index,0,child);return this;},
  sendToBack(child){return this.moveTo(child,0);},bringToTop(child){return this.moveTo(child,this.list.length-1);},
  sort(property,handler){this.list.sort(handler??((a,b)=>a[property]-b[property]));return this;},
  setDepth(depth){this.depth=depth;return this;},setVisible(visible){this.visible=visible;return this;},
  setPosition(x,y){Object.assign(this,{x,y});return this;},setScale(x,y=x){Object.assign(this,{scaleX:x,scaleY:y});return this;},
  destroy(){this.destroyed++;this.parentContainer?.remove(this);for(const child of [...this.list]){this.remove(child);child.destroy();}}
 };parent.add(children);return parent;
}
function paintedOrder(parent){return parent.list.flatMap(child=>child.destroyed||child.visible===false?[]:child.kind==='container'?paintedOrder(child):child.kind==='rectangle'?[child.color]:[]);}
function fixture() {
  const objects = [], containers=[], fragments = new Map(), parent = fakeContainer();
  const texture = {key: 'borrowed',frameTotal:1,firstFrame:'__BASE',source:[{}],has: key => fragments.has(key),
    add(name, index, x, y, width, height) {const f = {name, sourceIndex:index, cutX:x, cutY:y, width, height}; fragments.set(name,f);texture.frameTotal++;if(texture.firstFrame==='__BASE')texture.firstFrame=name;return f;},
    get(){return {clone(){return {name:'',sourceIndex:0,source:texture.source[0],setSize(width,height,x,y){Object.assign(this,{width,height,cutX:x,cutY:y});fragments.set(this.name,this);return this;},destroy(){fragments.delete(this.name);}};}};},
    remove(name) {fragments.delete(name);}, destroy() {throw Error('borrowed texture destroyed');}};
  const make = kind => {
    const obj = {kind, destroyed:0, setOrigin() {return this;}, setPosition(x,y) {Object.assign(this,{x,y});return this;},
      setScale(x,y=x) {Object.assign(this,{scaleX:x,scaleY:y});return this;}, setTexture(key,frame) {Object.assign(this,{texture:key,frame:typeof frame==='string'?frame:frame.name});return this;},
      setFrame(frame) {this.frame=typeof frame==='object'?frame.name:frame;return this;},
      setCrop(...crop) {this.crop=crop;return this;}, setVisible(visible) {this.visible=visible;return this;},
      setTint(tint) {this.tint=tint;return this;},
      setAlpha(alpha) {this.alpha=alpha;return this;},
      setSize(width,height) {Object.assign(this,{width,height});return this;}, setFillStyle(color) {this.color=color;return this;},
      setDepth(depth) {this.depth=depth;return this;}, destroy() {this.destroyed++;this.parentContainer?.remove(this);}};
    objects.push(obj);return obj;
  };
  const scene = {events:new EventEmitter(), add:{image:()=>make('image'),rectangle:()=>make('rectangle'),container:(_x,_y,children=[])=>{const c=fakeContainer(children);containers.push(c);return c;}}};
  const font = normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}}}}});
  const colors={focus:'#ffffff',hover:'#ffff00',pressed:'#ff0000',disabled:'#777777',selection:'#444444',caret:'#ffffff',indicator:'#00ff00',separator:'#777777',track:'#111111',fill:'#00ff00',selected:'#333333',adjust:'#ffffff'};
  const theme=defineTheme({version:1,id:'test:native',fonts:{body:{font}},roles:Object.fromEntries(['button','text','panel','absolute','stack','field','tabs','stepper','pager','toggle','fold','progress','meter','separator','icon','extension'].map(k=>[k,{font:'body',tone:'cream',colors,...(k==='button'?{alternatives:[{kind:'flat',color:'#123456'}]}:{})}])),geometry:{gap:0,padding:0,minTarget:0}});
  const context={id:'test:main',revision:1,localToPhysical:{scale:2,x:0,y:0},sourcePixelPhysicalSize:2,viewport:{x:0,y:0,width:100,height:60}};
  const snapshot=(revision=1,label='?')=>({revision,context,tree:button({id:'ok',label,actionId:'game:ok',layout:{width:20,height:10}})});
  const ports={resolveAsset:()=>({ownership:'borrowed',texture}),attachContext:()=>({ownership:'borrowed',parent})};
  return {scene,theme,ports,parent,objects,containers,fragments,texture,context,snapshot};
}
async function api() {
  const url=new URL('../../server/build/ui-phaser-runtime.mjs',import.meta.url);
  expect(existsSync(url),'shared native host public seam exists').toBe(true);
  return import(url.href);
}

test('original-binding policy reaches the keyed native mount and retains a hold through unrelated content updates',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
  const snapshot=(revision,label)=>({revision,context:f.context,tree:u.absolute({id:'root',layout:{width:100,height:60},children:[
    button({id:'ok',label:'?',actionId:'original:ok',layout:{width:20,height:10}}),
    u.text({id:'unrelated',label,layout:{x:40,y:20,width:40,height:10}})
  ]})});
  const mount=ui.mount(snapshot(1,'?'),{parent:f.parent,scope:'test:retained-binding',policy:{retainUnchangedPresses:true}});
  mount.handle({type:'press',inputId:'held',point:{x:4,y:4},pointSpace:'physical'});
  mount.update(snapshot(2,'??'));expect(mount.inspect({limit:3})).toMatchObject({heldCount:1,modelRevision:2,native:{lifecycle:'mounted'}});
  expect(mount.handle({type:'release',inputId:'held',point:{x:4,y:4},pointSpace:'physical'})).toMatchObject([{actionId:'original:ok',modelRevision:2}]);
  expect(mount.handle({type:'release',inputId:'held',point:{x:4,y:4},pointSpace:'physical'})).toEqual([]);
  ui.dispose();expect(mount.inspect({limit:1}).native.objects).toBe(0);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('clipped document glyphs retain logical records while only visible rows consume native objects',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const snapshot=(revision,scroll)=>({revision,context:f.context,tree:u.absolute({id:'document',layout:{width:80,height:24,overflow:'clip'},children:Array.from({length:2000},(_,i)=>u.text({id:'row:'+i,label:'??????????',layout:{x:0,y:i*8-scroll,width:60,height:8,wrap:false}}))})});
  const ui=createPhaserUi({...f,limits:{objects:32}}),mount=ui.mount(snapshot(1,0),{parent:f.parent,scope:'test:clipped-document'});
  expect(mount.inspect({limit:1}).native.objects).toBe(30);
  mount.update(snapshot(2,1997*8));
  expect(mount.inspect({limit:1}).native.objects).toBe(30);
  const page=mount.inspect({afterId:'row:1996',limit:4});
  expect(page.controls.map(r=>r.id)).toEqual(['row:1997','row:1998','row:1999']);
  expect(page.controls.every(r=>r.state==='visible')).toBe(true);
  expect(f.objects.filter(o=>o.visible&&!o.destroyed&&o.kind==='image')).toHaveLength(30);
  ui.dispose();expect(mount.inspect({limit:1}).native.objects).toBe(0);
});

test('fully clipped nested documents reserve no glyphs and reveal within the same native budget',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const snapshot=(revision,y)=>({revision,context:f.context,tree:u.absolute({id:'root',layout:{width:80,height:24,overflow:'clip'},children:[u.absolute({id:'nested',layout:{y,width:80,height:24,overflow:'clip'},children:Array.from({length:2000},(_,i)=>u.text({id:'nested:'+i,label:'??????????',layout:{y:i*8,width:60,height:8,wrap:false}}))})]})});
  const ui=createPhaserUi({...f,limits:{objects:32}}),mount=ui.mount(snapshot(1,100),{parent:f.parent,scope:'test:null-clip'});
  expect(mount.inspect({limit:1}).native.objects).toBe(0);
  mount.update(snapshot(2,0));expect(mount.inspect({limit:1}).native.objects).toBe(30);
  mount.update(snapshot(3,100));expect(mount.inspect({limit:1}).native.objects).toBe(0);
  ui.dispose();
});

test('skin clip admission admits the exact visible budget before later invisible tiles',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();delete f.ports.readSourceRGBA;
  const snapshot=f.snapshot();snapshot.context={...snapshot.context,viewport:{x:0,y:0,width:1,height:1}};
  snapshot.tree=button({id:'face',focusable:false,layout:{width:20,height:20}});
  const ui=createPhaserUi({...f,limits:{objects:1}}),mount=ui.mount(snapshot,{parent:f.parent,scope:'test:skin-clip-budget'});
  expect(mount.inspect({limit:1}).native.objects).toBe(1);
  expect(f.objects.filter(o=>o.visible&&!o.destroyed)).toHaveLength(1);ui.dispose();
});

test('clip admission includes a state offset that brings a glyph into the viewport',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:clip-state',fonts:{body:{font:f.theme.fonts.body.font}},roles:{absolute:{},button:{},text:{font:'body',tone:'cream',placement:{nativeStates:{pressed:{paintOffset:{x:0,y:1}}}}}}});
  const tree=u.absolute({id:'root',layout:{width:20,height:10,overflow:'clip'},children:[button({id:'owner',actionId:'act',layout:{x:10,y:0,width:10,height:10}}),u.text({id:'caption',label:'?',metadata:{'ui:stateOwner':'owner'},layout:{x:0,y:-6,width:8,height:8,wrap:false}})]});
  const ui=createPhaserUi(f),mount=ui.mount({revision:1,context:f.context,tree},{parent:f.parent,scope:'test:clip-state'});
  expect(f.objects.filter(o=>o.kind==='image'&&o.visible&&!o.destroyed)).toHaveLength(0);
  mount.handle({type:'press',inputId:'pointer',point:{x:24,y:4},pointSpace:'physical'});
  const glyphs=f.objects.filter(o=>o.kind==='image'&&o.visible&&!o.destroyed);
  expect(glyphs).toHaveLength(1);expect(glyphs[0].y).toBe(-5);
  mount.handle({type:'blur'});expect(f.objects.filter(o=>o.kind==='image'&&o.visible&&!o.destroyed)).toHaveLength(0);
  ui.dispose();
});

test('independent regions: native disabled focus frames the full card without changing the small painted button or hit target',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:regions',roles:{absolute:{},button:{alternatives:[{kind:'flat',color:'#123456'}],colors:{focus:'#ff2bd6'},edge:{width:2,focusWhenDisabled:true}}},geometry:{minTarget:0}});
  const tree=u.absolute({id:'root',focus:{order:['neutral','card'],initialId:'neutral'},children:[button({id:'neutral',layout:{x:80,y:0,width:10,height:10}}),button({id:'card',actionId:'game:locked',enabled:false,focusable:true,layout:{x:30,y:20,width:20,height:10},regions:{focus:{x:-20,y:-10,width:60,height:30}}})]});
  const ui=createPhaserUi(f),m=ui.mount({revision:1,tree,context:f.context},{parent:f.parent,scope:'test:regions'});
  m.handle({type:'focus',controlId:'card'});
  const edges=f.objects.filter(o=>o.visible&&o.color===0xff2bd6),face=f.objects.find(o=>o.visible&&o.color===0x123456&&o.x===30);
  expect(edges).toHaveLength(4);expect(edges[0]).toMatchObject({x:10,y:10,width:60,height:2});expect(face).toMatchObject({x:30,y:20,width:20,height:10});
  const record=m.inspect({limit:10}).controls.find(r=>r.id==='card');expect(record.focusBounds).toEqual({x:10,y:10,width:60,height:30});expect(record.hitBounds).toEqual({x:30,y:20,width:20,height:10});
  expect(m.handle({type:'activate',controlId:'card',inputId:'disabled'})).toEqual([]);ui.dispose();expect(m.inspect({limit:1}).native.objects).toBe(0);
});

test('independent regions: native touch padding activates outside the smaller visual face and reuses its objects',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const tree=button({id:'small',actionId:'game:small',layout:{x:18,y:18,width:27,height:15},regions:{hit:{x:-8,y:-8,width:44,height:31}}});
  const ui=createPhaserUi(f),m=ui.mount({revision:1,tree,context:f.context},{parent:f.parent,scope:'test:touch-region'}),created=m.inspect({limit:1}).native.created;
  const face=f.objects.find(o=>o.visible&&o.color===0x123456);expect(face).toMatchObject({x:18,y:18,width:27,height:15});
  m.handle({type:'press',inputId:'padding',point:{x:22,y:22},pointSpace:'physical'});
  expect(m.handle({type:'release',inputId:'padding',point:{x:22,y:22},pointSpace:'physical'}).map(i=>i.actionId)).toEqual(['game:small']);
  expect(m.inspect({limit:1}).native.created).toBe(created);ui.dispose();expect(m.inspect({limit:1}).native.objects).toBe(0);
});

test('disabled focus edge opt-in paints only authoritative focus and never enables activation',async()=>{
  const {createPhaserUi}=await api();
  for(const optIn of [true,false,undefined]){
    const f=fixture();
    f.theme=defineTheme({version:1,id:'test:disabled-focus',roles:{absolute:{},button:{colors:{focus:'#ff2bd6'},edge:{width:2,...(optIn===undefined?{}:{focusWhenDisabled:optIn})}}}});
    const tree=u.absolute({id:'root',focus:{order:['neutral','card'],initialId:'neutral'},children:[
      button({id:'neutral',actionId:'game:neutral',layout:{x:40,y:0,width:20,height:10}}),
      button({id:'card',actionId:'game:locked',enabled:false,focusable:true,layout:{x:0,y:0,width:20,height:10}}),
    ]});
    const ui=createPhaserUi(f),m=ui.mount({revision:0,context:f.context,tree},{parent:f.parent,scope:'test:disabled-focus'});
    const paintedCard=()=>f.objects.filter(o=>o.kind==='rectangle'&&o.visible&&o.color===0xff2bd6&&o.x<20);
    expect(paintedCard()).toHaveLength(0);
    m.handle({type:'focus',controlId:'card'});
    expect(m.inspect({limit:10}).focusId).toBe('card');
    expect(paintedCard()).toHaveLength(optIn===true?4:0);
    if(optIn===true){expect(paintedCard()[0].height).toBe(2);expect(paintedCard().every(o=>o.alpha===1)).toBe(true);}
    expect(m.handle({type:'activate',controlId:'card',inputId:'enter'}).filter(i=>i.kind==='activate')).toHaveLength(0);
    m.handle({type:'press',point:{x:2,y:2},pointSpace:'physical',inputId:'mouse'});
    expect(m.inspect({limit:10}).heldCount).toBe(0);
    expect(m.handle({type:'release',point:{x:2,y:2},pointSpace:'physical',inputId:'mouse'}).filter(i=>i.kind==='activate')).toHaveLength(0);
    m.handle({type:'focus',controlId:'neutral'});expect(paintedCard()).toHaveLength(0);
    m.dispose();expect(m.inspect({limit:1}).native.objects).toBe(0);ui.dispose();
  }
});

test('disabled focus edge preserves explicit disabled ink when focus ink is omitted',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:disabled-ink',roles:{button:{colors:{disabled:'#777777'},edge:{focusWhenDisabled:true}}}});
  const ui=createPhaserUi(f),m=ui.mount({revision:0,context:f.context,tree:button({id:'locked',enabled:false,focusable:true,actionId:'game:locked',layout:{width:20,height:10}})},{parent:f.parent,scope:'test:disabled-ink'});
  m.handle({type:'focus',controlId:'locked'});
  expect(m.inspect({limit:1}).focusId).toBe('locked');
  expect(f.objects.filter(o=>o.visible&&o.color===0x777777)).toHaveLength(4);ui.dispose();
});

test('disabled focus edge cannot grant focus to a control excluded by interaction policy',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:no-focus-grant',roles:{absolute:{},button:{colors:{focus:'#ff2bd6'},edge:{focusWhenDisabled:true}}}});
  const tree=u.absolute({id:'root',focus:{order:['neutral'],initialId:'neutral'},children:[
    button({id:'neutral',actionId:'game:neutral',layout:{x:40,y:0,width:20,height:10}}),
    button({id:'locked',enabled:false,focusable:false,actionId:'game:locked',layout:{width:20,height:10}}),
  ]});
  const ui=createPhaserUi(f),m=ui.mount({revision:0,context:f.context,tree},{parent:f.parent,scope:'test:no-focus-grant'});
  m.handle({type:'focus',controlId:'locked'});
  expect(m.inspect({limit:10}).focusId).toBe('neutral');
  expect(f.objects.filter(o=>o.visible&&o.x<20&&o.color===0xff2bd6)).toHaveLength(0);
  ui.dispose();
});

test('focus style uses two semantic local pixels at scale four and defaults to one physical pixel',async()=>{
  const {createPhaserUi}=await api();
  for(const width of [2,undefined]){
    const f=fixture();f.context={...f.context,localToPhysical:{scale:4,x:0,y:0},sourcePixelPhysicalSize:2};
    f.theme=defineTheme({version:1,id:'test:edge',roles:{button:{colors:{focus:'#ff2bd6'},...(width===undefined?{}:{edge:{width}})}}});
    const ui=createPhaserUi(f),m=ui.mount({revision:1,context:f.context,tree:button({id:'ok',actionId:'game:ok',layout:{width:20,height:10}})},{parent:f.parent,scope:'test:edge'});
    const borders=f.objects.filter(o=>o.kind==='rectangle'&&o.visible);
    expect(borders[0].height).toBe(width??.25);expect(borders[2].width).toBe(width??.25);
    expect(borders.every(o=>o.alpha===1)).toBe(true);m.dispose();ui.dispose();
  }
});

test('focus style opacity applies to stock rectangles and glyphs and resets on keyed base reuse',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:alpha',fonts:f.theme.fonts,roles:{absolute:{},button:{font:'body',tone:'cream',alternatives:[{kind:'flat',color:'#123456'}],placement:{nativeStates:{focus:{opacity:.3},pressed:{opacity:0}}}}}});
  const snapshot=revision=>({revision,context:f.context,tree:u.absolute({id:'root',children:[button({id:'ok',label:'?',actionId:'game:ok',layout:{width:20,height:10}}),button({id:'other',actionId:'game:other',layout:{x:30,width:20,height:10}})]})});
  const ui=createPhaserUi(f),m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:alpha'}),first=f.objects.slice(0,2);
  expect(first.map(o=>o.alpha)).toEqual([.3,.3]);
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});expect(first.map(o=>o.alpha)).toEqual([0,0]);
  expect(m.handle({type:'release',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toHaveLength(1);
  m.handle({type:'hover',point:{x:90,y:40},pointSpace:'physical'});m.handle({type:'focus',controlId:'other'});
  expect(first.map(o=>o.alpha)).toEqual([1,1]);expect(first.every(o=>!o.destroyed)).toBe(true);
  ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('focus style stock flat wash follows itemSlot without input authority and keeps its border opaque',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:wash',roles:{absolute:{},itemSlot:{colors:{focus:'#ff2bd6'},edge:{width:2}},wash:{opacity:0,alternatives:[{kind:'flat',color:'#ff2bd6'}],placement:{nativeStates:{focus:{opacity:.3},hover:{opacity:.3},pressed:{opacity:.3},disabled:{opacity:0}}}}}});
  const tree=u.absolute({id:'root',children:[u.itemSlot({id:'slot',actionId:'game:item',layout:{width:20,height:10}}),u.panel({id:'wash',appearanceRole:'wash',metadata:{'ui:stateOwner':'slot'},layout:{width:20,height:10}})]});
  const ui=createPhaserUi(f),m=ui.mount({revision:1,context:f.context,tree},{parent:f.parent,scope:'test:wash'});
  expect(f.objects.filter(o=>o.kind==='rectangle'&&o.visible).map(o=>o.alpha)).toEqual([1,1,1,1,.3]);
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});expect(m.inspect({limit:10}).heldCount).toBe(1);
  expect(m.handle({type:'release',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toMatchObject([{controlId:'slot'}]);
  expect(m.inspect({limit:10}).focusId).toBe('slot');ui.dispose();
});

test.each([NaN,Infinity,-Infinity,-.1,1.1,null,'0.3',false])('focus style rejects dormant native opacity %s before allocation',async opacity=>{
  const {createPhaserUi}=await api(),f=fixture();
  // Non-finite data fails the immutable theme barrier; other malformed values
  // must also fail the dormant variant preflight before a native attachment.
  let attachments=0;f.ports.attachContext=()=>{attachments++;return {ownership:'borrowed',parent:f.parent};};
  expect(()=>{
    f.theme=defineTheme({version:1,id:'test:badAlpha',roles:{button:{placement:{nativeStates:{disabled:{opacity}}}}}});
    createPhaserUi(f).mount({revision:1,context:f.context,tree:button({id:'ok'})},{parent:f.parent,scope:'test:badAlpha'});
  }).toThrow(/opacity|finite/);
  expect(f.objects).toHaveLength(0);expect(attachments).toBe(0);expect(f.scene.events.listenerCount('shutdown')).toBe(0);
});

test.each([0,-1,NaN,Infinity,null,'2',.3])('focus style rejects invalid or physically unaligned edge width %s before mutation',async width=>{
  const {createPhaserUi}=await api(),f=fixture();let attachments=0;
  f.ports.attachContext=()=>{attachments++;return {ownership:'borrowed',parent:f.parent};};
  expect(()=>{
    f.theme=defineTheme({version:1,id:'test:badWidth',roles:{button:{edge:{width}}}});
    createPhaserUi(f).mount({revision:1,context:f.context,tree:button({id:'ok'})},{parent:f.parent,scope:'test:badWidth'});
  }).toThrow(/width|finite/);
  expect(f.objects).toHaveLength(0);expect(attachments).toBe(0);
});

test('focus style width follows semantic mapping independently of skin and label density',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,localToPhysical:{scale:1.5,x:.25,y:-.5},sourcePixelPhysicalSize:2};
  const other={...f.context,id:'test:other',localToPhysical:{scale:4,x:0,y:0},sourcePixelPhysicalSize:4};
  f.theme=defineTheme({version:1,id:'test:mixedEdge',fonts:f.theme.fonts,roles:{button:{font:'body',tone:'cream',edge:{width:2},colors:{focus:'#ff2bd6'},alternatives:[{kind:'flat',color:'#123456'}]}}});
  const snapshot={revision:1,context:f.context,additionalContexts:[other],tree:button({id:'ok',label:'?',skinContextId:other.id,labelContextId:other.id,layout:{width:20,height:10}})};
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:mixedEdge'});
  const edge=f.objects.filter(o=>o.kind==='rectangle'&&o.color===0xff2bd6&&o.visible);
  expect(edge[0].height*1.5).toBe(3);expect(edge[2].width*1.5).toBe(3);
  expect(m.inspect({limit:1}).controls[0].bounds).toEqual({x:0,y:0,width:20,height:10});
  ui.dispose();
});

test.each([{width:.25,height:.25},{width:1,height:3},{width:3,height:1},{width:3,height:3},{width:10,height:10}])('focus style translucent edge partitions tiny $width by $height bounds exactly once',async bounds=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,localToPhysical:{scale:4,x:0,y:0},sourcePixelPhysicalSize:4};
  f.theme=defineTheme({version:1,id:'test:tinyEdge',roles:{button:{opacity:.3,edge:{width:2},colors:{focus:'#ff2bd6'}}}});
  const ui=createPhaserUi(f);ui.mount({revision:1,context:f.context,tree:button({id:'ok',layout:bounds})},{parent:f.parent,scope:'test:tinyEdge'});
  const rects=f.objects.filter(o=>o.kind==='rectangle'&&o.visible);
  expect(rects.every(o=>o.alpha===.3&&o.x>=0&&o.y>=0&&o.x+o.width<=bounds.width&&o.y+o.height<=bounds.height)).toBe(true);
  // Coverage of planned seam rectangles, not rendered framebuffer pixels.
  for(let py=0;py<bounds.height*4;py++)for(let px=0;px<bounds.width*4;px++){
    const x=(px+.5)/4,y=(py+.5)/4,n=rects.filter(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height).length;
    const expected=x<2||y<2||x>=bounds.width-2||y>=bounds.height-2;
    expect(n).toBe(expected?1:0);
  }
  ui.dispose();
});

test('focus style clipped borders retain continuous hit bounds and do not repaint clipped corners',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,viewport:{x:0,y:0,width:4,height:4}};
  f.theme=defineTheme({version:1,id:'test:clipEdge',roles:{button:{opacity:.3,edge:{width:2},colors:{focus:'#ff2bd6'}}}});
  const ui=createPhaserUi(f),m=ui.mount({revision:1,context:f.context,tree:button({id:'ok',layout:{x:-1.25,y:-1.25,width:6,height:6}})},{parent:f.parent,scope:'test:clipEdge'});
  const rects=f.objects.filter(o=>o.visible);expect(rects.length).toBeGreaterThan(0);
  expect(rects.every(o=>o.x>=0&&o.y>=0&&o.x+o.width<=4&&o.y+o.height<=4)).toBe(true);
  expect(m.inspect({limit:1}).controls[0].bounds).toEqual({x:-1.25,y:-1.25,width:6,height:6});
  for(let y=.125;y<4;y+=.25)for(let x=.125;x<4;x+=.25)expect(rects.filter(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height).length).toBeLessThanOrEqual(1);
  ui.dispose();
});

test('focus style applies role opacity to skins icons and every stock command with keyed reset',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:stockAlpha',skins:f.theme.skins,fonts:fixture().theme.fonts,icons:{coin:{width:2,height:2,frame:{x:0,y:0,width:2,height:2}}},roles:{absolute:{},button:{opacity:.3,font:'body',tone:'cream',colors:{focus:'#ff2bd6'},alternatives:[{kind:'skin',id:'paper'}]},icon:{opacity:0},progress:{opacity:.3,colors:{track:'#123456',fill:'#ff2bd6'}}}});
  const s=revision=>({revision,context:f.context,tree:u.absolute({id:'root',children:[button({id:'ok',label:'?',layout:{width:20,height:10}}),u.icon({id:'coin',asset:'coin',layout:{x:25,width:2,height:2}}),u.progress({id:'progress',value:.5,layout:{x:30,width:20,height:10}})]})});
  const ui=createPhaserUi(f),m=ui.mount(s(1),{parent:f.parent,scope:'test:stockAlpha'});
  expect(f.objects.filter(o=>o.visible).map(o=>o.alpha)).toContain(0);
  expect(f.objects.filter(o=>o.visible&&o.alpha!==0).every(o=>o.alpha===.3)).toBe(true);
  const count=f.objects.length;m.update(s(2));expect(f.objects.length).toBe(count);ui.dispose();
});

test('focus style state precedence falls directly to base and alpha failures drain without cache mutation',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:precedenceAlpha',roles:{button:{opacity:.8,alternatives:[{kind:'flat',color:'#123456'}],placement:{nativeStates:{focus:{opacity:.3},hover:{opacity:.6},pressed:{opacity:0},disabled:{opacity:.1}}}}}});
  const snapshot=(revision,enabled=true)=>({revision,context:f.context,tree:button({id:'ok',enabled,actionId:'game:ok',layout:{width:20,height:10}})});
  const ui=createPhaserUi(f),m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:precedenceAlpha'}),o=f.objects[0];
  expect(o.alpha).toBe(.3);m.handle({type:'hover',point:{x:4,y:4},pointSpace:'physical'});expect(o.alpha).toBe(.6);
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});expect(o.alpha).toBe(0);
  m.update(snapshot(2,false));expect(o.alpha).toBe(.1);expect(m.handle({type:'release',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toEqual([]);
  m.update(snapshot(3));expect(o.alpha).toBe(.6); // current hover still outranks focus
  o.setAlpha=()=>{throw Error('alpha failed');};expect(()=>m.handle({type:'hover',point:{x:4,y:4},pointSpace:'physical'})).toThrow(/alpha failed/);
  expect(m.inspect({limit:1}).native.lifecycle).toBe('retired');expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
  expect(f.texture.frameTotal).toBe(1);expect(f.fragments.size).toBe(0);expect(f.scene.events.listenerCount('shutdown')).toBe(0);ui.dispose();
});

test('focus style rejected context update preserves held state and initial alpha failure drains owned frames',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:rejectedEdge',roles:{button:{edge:{width:2},colors:{focus:'#ff2bd6'}}}});
  const snapshot={revision:1,context:f.context,tree:button({id:'ok',actionId:'game:ok',layout:{width:20,height:10}})};
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:rejectedEdge'}),before=f.objects.map(o=>({x:o.x,y:o.y,width:o.width,height:o.height,alpha:o.alpha}));
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});
  expect(()=>m.update({...snapshot,revision:2,context:{...f.context,revision:2,localToPhysical:{scale:1.25,x:0,y:0}}})).toThrow(/edge.width/);
  expect(m.inspect({limit:1}).heldCount).toBe(1);expect(f.objects.map(o=>({x:o.x,y:o.y,width:o.width,height:o.height,alpha:o.alpha}))).toEqual(before);
  expect(m.handle({type:'release',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toHaveLength(1);ui.dispose();
  const g=uniformFixture(),make=g.scene.add.image;g.scene.add.image=(...args)=>{const o=make(...args);o.setAlpha=()=>{throw Error('initial alpha failed');};return o;};
  const broken=createPhaserUi(g);expect(()=>broken.mount(g.snapshot(),{parent:g.parent,scope:'test:initialAlpha'})).toThrow(/initial alpha failed/);
  expect(g.objects.every(o=>o.destroyed===1)).toBe(true);expect(g.fragments.size).toBe(0);expect(g.texture.frameTotal).toBe(1);expect(g.scene.events.listenerCount('shutdown')).toBe(0);broken.dispose();
});

test('focus style accepts only named opacity fields and never arbitrary alpha aliases',async()=>{
  const {createPhaserUi}=await api();
  expect(()=>button({id:'bad',alpha:.3})).toThrow(/keys/);
  for(const role of [{alpha:.3},{alternatives:[{kind:'flat',color:'#ff2bd6',alpha:.3}]}])expect(()=>defineTheme({version:1,id:'test:badAlias',roles:{button:role}})).toThrow(/keys/);
  const f=fixture();f.theme=defineTheme({version:1,id:'test:badNativeAlias',roles:{button:{placement:{nativeStates:{pressed:{alpha:.3}}}}}});
  expect(()=>createPhaserUi(f).mount({revision:1,context:f.context,tree:button({id:'bad'})},{parent:f.parent,scope:'test:badAlias'})).toThrow(/keys/);expect(f.objects).toHaveLength(0);
});

function uniformFixture(nonuniform=false) {
  const f=fixture(), source={width:12,height:12}; f.texture.source=[source];
  const data=new Uint8Array(12*12*4);
  for(let y=0;y<12;y++)for(let x=0;x<12;x++)data.set([x===11?99:23,y===11?91:37,53,(nonuniform&&x===5&&y===5)?127:193],(y*12+x)*4);
  f.ports.readSourceRGBA=({source:identity})=>({source:identity,width:12,height:12,data});
  f.theme=defineTheme({version:1,id:'test:uniform',skins:{paper:{frame:{x:2,y:2,width:6,height:6},insets:1}},roles:{button:{alternatives:[{kind:'skin',id:'paper'}]}}});
  f.snapshot=()=>({revision:1,context:{...f.context,viewport:{x:0,y:0,width:200,height:100}},tree:button({id:'ok',actionId:'game:ok',layout:{width:101,height:53}})});
  return {...f,data};
}

test('proven constant axes bound stock objects while alpha detail retains exact tiling',async()=>{
  const {createPhaserUi}=await api();
  for(const detailed of [false,true]){
    const f=uniformFixture(detailed),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:uniform'});
    const images=f.objects.filter(o=>o.kind==='image');
    expect(images.length).toBe(detailed?4+2+2+Math.ceil(99/4)*Math.ceil(51/4):9);
    expect(f.texture.frameTotal).toBe(1);m.dispose();ui.dispose();expect(f.fragments.size).toBe(0);
  }
});

test('authored transient skin and offset preserve a held activation across hover and release',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:states',skins:{normal:{frame:{x:2,y:2,width:3,height:3},insets:1},hover:{frame:{x:5,y:2,width:3,height:3},insets:1},down:{frame:{x:8,y:2,width:3,height:3},insets:1}},roles:{button:{alternatives:[{kind:'skin',id:'normal'}],placement:{nativeStates:{focus:{skin:'hover'},hover:{skin:'hover'},pressed:{skin:'down',paintOffset:{x:0,y:1}},disabled:{visible:false}}}}}});
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:states'});
  const first=()=>f.objects.find(o=>!o.destroyed&&o.kind==='image');
  expect(f.fragments.get(first().frame).cutX).toBe(5); // initial focus
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});
  expect(f.fragments.get(first().frame).cutX).toBe(8);expect(first().y).toBe(1);
  m.handle({type:'hover',point:{x:6,y:6},pointSpace:'physical'});
  expect(m.inspect({limit:1}).heldCount).toBe(1);
  expect(m.handle({type:'release',inputId:'p',point:{x:6,y:6},pointSpace:'physical'})).toHaveLength(1);
  expect(m.handle({type:'release',inputId:'p',point:{x:6,y:6},pointSpace:'physical'})).toEqual([]);
  expect(first().y).toBe(0);m.dispose();ui.dispose();
});

test('same-mount label and shadow consume button state with authored tone pixels and no hit authority',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const font=normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{normal:{},hover:{},down:{}},glyphs:{'?':{advance:4,frames:{normal:'a',hover:'b',down:'c'}}}},atlas:{frames:{a:{frame:{x:0,y:0,w:4,h:6}},b:{frame:{x:4,y:0,w:4,h:6}},c:{frame:{x:8,y:0,w:4,h:6}}}}});
  f.theme=defineTheme({version:1,id:'test:linked',fonts:{body:{font}},roles:{absolute:{},button:{alternatives:[{kind:'flat',color:'#123456'}]},text:{font:'body',tone:'normal',placement:{nativeStates:{hover:{tone:'hover'},focus:{tone:'hover'},pressed:{tone:'down',paintOffset:{x:0,y:1}}}}},shadow:{font:'body',tone:'normal',placement:{nativeStates:{pressed:{paintOffset:{x:0,y:1}},disabled:{visible:false}}}}}});
  const snapshot=(revision=1,enabled=true)=>({revision,context:f.context,tree:u.absolute({id:'screen',children:[button({id:'ok',enabled,actionId:'game:ok',layout:{width:20,height:10}}),u.text({id:'label',label:'?',metadata:{'ui:stateOwner':'ok'},layout:{width:20,height:10}}),u.text({id:'shadow',appearanceRole:'shadow',label:'?',metadata:{'ui:stateOwner':'ok'},layout:{width:20,height:10}})]})});
  const ui=createPhaserUi(f),m=ui.mount(snapshot(),{parent:f.parent,scope:'test:linked'});
  const images=()=>f.objects.filter(o=>o.kind==='image'&&!o.destroyed);
  expect(f.fragments.get(images()[0].frame).cutX).toBe(4);
  m.handle({type:'press',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});
  expect(f.fragments.get(images()[0].frame).cutX).toBe(8);expect(images().map(o=>o.y)).toEqual([1,1]);
  expect(m.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toMatchObject([{controlId:'ok'}]);
  m.update(snapshot(2,false));expect(images()[1].visible).toBe(false);
  expect(m.inspect({limit:10}).controls.filter(c=>c.focused).map(c=>c.id)).toEqual(['ok']);
  ui.dispose();
});

test.each(['missing','cycle','authority','cross-scope','not-sibling'])('rejects $0 transient state-owner references before allocation',async mode=>{
  const {createPhaserUi}=await api(),f=fixture();
  const owner=button({id:'ok',actionId:'game:ok',...(mode==='cycle'?{metadata:{'ui:stateOwner':'label'}}:{})});
  const label=u.text({id:'label',label:'?',metadata:{'ui:stateOwner':mode==='missing'?'absent':mode==='cross-scope'?'another:scope:ok':'ok'},...(mode==='authority'?{actionId:'game:bad'}:{})});
  const tree=u.absolute({id:'root',children:[owner,mode==='not-sibling'?u.absolute({id:'nested',children:[label]}):label]});
  const ui=createPhaserUi(f);
  expect(()=>ui.mount({revision:1,context:f.context,tree},{parent:f.parent,scope:'test:links'})).toThrow(/state.owner|sibling/i);
  expect(f.objects).toHaveLength(0);ui.dispose();
});

test('every appearance variant validates assets and total budgets before native mutation',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  // The normal face compresses, but the not-yet-active down skin has an alpha
  // detail that exceeds the admitted object budget. Focus must not conceal it.
  f.data[(5*12+5)*4+3]=127;
  f.theme=defineTheme({version:1,id:'test:preflight',skins:{normal:{frame:{x:2,y:2,width:3,height:3},insets:1},down:{frame:{x:2,y:2,width:6,height:6},insets:1}},roles:{button:{alternatives:[{kind:'skin',id:'normal'}],placement:{nativeStates:{pressed:{skin:'down'}}}}}});
  const ui=createPhaserUi({...f,limits:{objects:20}});
  expect(()=>ui.mount(f.snapshot(),{parent:f.parent,scope:'test:preflight'})).toThrow(/budget/);
  expect(f.objects).toHaveLength(0);ui.dispose();
});

test.each(['identity','length','dimensions','budget'])('rejects invalid RGBA $0 before mutation',async mode=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.ports.readSourceRGBA=({source})=>({source:mode==='identity'?{}:source,width:mode==='dimensions'?13:12,height:12,data:mode==='length'?new Uint8Array(3):f.data});
  const ui=createPhaserUi({...f,limits:mode==='budget'?{sourceBytes:575}:{}});
  expect(()=>ui.mount(f.snapshot(),{parent:f.parent,scope:'test:plane'})).toThrow(/source|RGBA/);expect(f.objects).toHaveLength(0);ui.dispose();
});

test('stale source identity cannot reuse a compiled plane or a cloned frame',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:stale'});
  f.texture.source[0]={width:12,height:12};
  expect(()=>m.handle({type:'hover',point:{x:4,y:4},pointSpace:'physical'})).toThrow(/stale source/i);
  expect(m.inspect({limit:1}).native.lifecycle).toBe('retired');
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);ui.dispose();
});

test('an unknown dormant variant asset fails before initial native allocation',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:unknownVariant',skins:f.theme.skins,roles:{button:{alternatives:[{kind:'skin',id:'paper'}],placement:{nativeStates:{pressed:{skin:'absent'}}}}}});
  const ui=createPhaserUi(f);expect(()=>ui.mount(f.snapshot(),{parent:f.parent,scope:'test:unknown'})).toThrow(/variant skin/i);expect(f.objects).toHaveLength(0);ui.dispose();
});

test.each(['flat','x-strip','y-strip','period-two','alpha-detail','unavailable'])('exact source sampling preserves $0 periods offsets tails clipping and fractional density',async mode=>{
  const {createPhaserUi}=await api();
  function make(compress) {
    const f=uniformFixture();
    for(let y=0;y<12;y++)for(let x=0;x<12;x++)f.data.set([mode==='y-strip'?x*11:mode==='period-two'?(x%2)*97:23,mode==='x-strip'?y*13:37,53,mode==='alpha-detail'?(x*17+y*23)%256:193],(y*12+x)*4);
    if(!compress||mode==='unavailable')delete f.ports.readSourceRGBA;
    f.context={...f.context,localToPhysical:{scale:1.5,x:0.25,y:-0.5},sourcePixelPhysicalSize:2,viewport:{x:1.25,y:2.75,width:90,height:40}};
    const s={revision:1,context:f.context,tree:button({id:'ok',actionId:'game:ok',layout:{x:-1.25,y:-2.75,width:101,height:53}})};
    const ui=createPhaserUi(f),m=ui.mount(s,{parent:f.parent,scope:'test:sampling'});
    return {...f,ui,m};
  }
  const exact=make(false),optimized=make(true);
  function sample(f,x,y) {
    for(const o of f.objects.filter(o=>o.kind==='image'&&!o.destroyed&&o.visible).reverse()){
      const frame=f.fragments.get(o.frame),sx=(x-o.x)/o.scaleX,sy=(y-o.y)/o.scaleY;
      const [cx=0,cy=0,cw=frame.width,ch=frame.height]=o.crop;
      if(sx>=cx&&sy>=cy&&sx<cx+cw&&sy<cy+ch&&sx>=0&&sy>=0&&sx<frame.width&&sy<frame.height){const i=((frame.cutY+Math.floor(sy))*12+frame.cutX+Math.floor(sx))*4;return [...f.data.slice(i,i+4)];}
    }
    return null;
  }
  for(let py=3;py<62;py+=2)for(let px=2;px<145;px+=2){const x=(px+0.5-0.25)/1.5,y=(py+0.5+0.5)/1.5;expect(sample(optimized,x,y)).toEqual(sample(exact,x,y));}
  const count=f=>f.objects.filter(o=>o.kind==='image').length;
  if(['flat','x-strip','y-strip'].includes(mode))expect(count(optimized)).toBeLessThan(count(exact));
  if(['alpha-detail','unavailable'].includes(mode))expect(count(optimized)).toBe(count(exact));
  exact.ui.dispose();optimized.ui.dispose();
});

test('source RGBA is copied once and large unavailable tiling retains the default 8192 object budget',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();let reads=0;
  f.ports.readSourceRGBA=({source})=>{reads++;return {source,width:12,height:12,data:f.data};};
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:copy'});
  f.data.fill(0);f.data[(5*12+5)*4+3]=255;
  m.update({...f.snapshot(),revision:2});expect(reads).toBe(1);expect(f.objects.filter(o=>o.kind==='image'&&!o.destroyed)).toHaveLength(9);
  ui.dispose();
  const g=uniformFixture();delete g.ports.readSourceRGBA;
  const legacy=createPhaserUi(g),s=g.snapshot();s.tree=button({id:'ok',layout:{width:1000,height:1000}});
  // The budget protects simultaneous visible work. Clipped tiles no longer
  // reserve native images, so expose the entire oversized face in this control.
  s.context={...s.context,viewport:{x:0,y:0,width:1000,height:1000}};
  expect(()=>legacy.mount(s,{parent:g.parent,scope:'test:budget'})).toThrow(/object budget/);expect(g.objects).toHaveLength(0);legacy.dispose();
});

test('appearance transitions reuse Images at the exact admitted fragment budget',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:fragmentSwitch',skins:{a:{frame:{x:2,y:2,width:3,height:3},insets:1},b:{frame:{x:6,y:2,width:3,height:3},insets:1}},roles:{button:{alternatives:[{kind:'skin',id:'a'}],placement:{nativeStates:{pressed:{skin:'b'}}}}}});
  const ui=createPhaserUi({...f,limits:{fragments:9}}),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:fragments'}),created=f.objects.length;
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});
  expect(f.objects.length).toBe(created);expect(m.inspect({limit:1}).heldCount).toBe(1);
  expect(m.handle({type:'release',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toHaveLength(1);
  expect(f.objects.length).toBe(created);expect(f.fragments.size).toBe(9);ui.dispose();
});

test('mixed independent appearance states reserve their simultaneous fragments before allocating',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:mixedFragments',skins:{a:{frame:{x:2,y:2,width:3,height:3},insets:1},b:{frame:{x:6,y:2,width:3,height:3},insets:1}},roles:{absolute:{},button:{alternatives:[{kind:'skin',id:'a'}],placement:{nativeStates:{pressed:{skin:'b'}}}}}});
  const snapshot={revision:1,context:f.context,tree:u.absolute({id:'screen',children:[button({id:'a',actionId:'game:a',layout:{width:20,height:10}}),button({id:'b',actionId:'game:b',layout:{x:30,width:20,height:10}})]})};
  const ui=createPhaserUi({...f,limits:{fragments:9}});
  expect(()=>ui.mount(snapshot,{parent:f.parent,scope:'test:mixedFragments'})).toThrow(/variant.*fragment/i);
  expect(f.objects).toHaveLength(0);ui.dispose();
});

test('shared fragment identities are counted once across independent controls',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:sharedFragments',skins:{a:{frame:{x:2,y:2,width:3,height:3},insets:1}},roles:{absolute:{},button:{alternatives:[{kind:'skin',id:'a'}],placement:{nativeStates:{pressed:{skin:'a'}}}}}});
  const snapshot={revision:1,context:f.context,tree:u.absolute({id:'screen',children:[button({id:'a',actionId:'game:a',layout:{width:20,height:10}}),button({id:'b',actionId:'game:b',layout:{x:30,width:20,height:10}})]})};
  const ui=createPhaserUi({...f,limits:{fragments:9}}),m=ui.mount(snapshot,{parent:f.parent,scope:'test:sharedFragments'});
  m.handle({type:'press',inputId:'a',point:{x:4,y:4},pointSpace:'physical'});
  expect(m.inspect({limit:2}).heldCount).toBe(1);expect(f.fragments.size).toBe(9);ui.dispose();
});

function transactionalSourceFixture(){
  const f=uniformFixture(),reads=[];
  const assets=Object.fromEntries(['a','b','c'].map(id=>[id,{texture:{...f.texture,key:id,source:[{width:12,height:12}]},data:new Uint8Array(f.data)}]));
  f.ports.resolveAsset=({id})=>({ownership:'borrowed',texture:assets[id].texture});
  f.ports.readSourceRGBA=({id,source,maxBytes})=>{reads.push({id,maxBytes});return maxBytes<576?null:{source,width:12,height:12,data:assets[id].data};};
  const skins=Object.fromEntries(['a','b','c'].map(id=>[id,{frame:{x:2,y:2,width:6,height:6},insets:1}]));
  const roles=Object.fromEntries(['a','b','c'].map(id=>[id,{alternatives:[{kind:'skin',id}]}]));
  roles.bad={alternatives:[{kind:'skin',id:'b'}],placement:{nativeStates:{pressed:{paintOffset:{x:0,y:.25}}}}};
  f.theme=defineTheme({version:1,id:'test:sourceTransaction',skins,roles});
  const snapshot=(revision,role)=>({...f.snapshot(),revision,tree:button({id:'ok',actionId:'game:ok',appearanceRole:role,layout:{width:101,height:53}})});
  return {...f,reads,snapshot};
}

test('failed appearance preparation cannot retain source planes or cancel the published hold',async()=>{
  const {createPhaserUi}=await api(),f=transactionalSourceFixture(),ui=createPhaserUi({...f,limits:{sourceBytes:1152,objects:20}}),m=ui.mount(f.snapshot(1,'a'),{parent:f.parent,scope:'test:sourceTransaction'});
  m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'});
  expect(()=>m.update(f.snapshot(2,'bad'))).toThrow(/physical.*offset|offset.*physical/i);
  expect(m.inspect({limit:1})).toMatchObject({modelRevision:1,heldCount:1});
  expect(()=>m.update(f.snapshot(2,'c'))).not.toThrow();
  expect(m.inspect({limit:1})).toMatchObject({modelRevision:2,heldCount:0,native:{lifecycle:'mounted'}});
  expect(f.reads.findLast(r=>r.id==='c').maxBytes).toBeGreaterThanOrEqual(576);ui.dispose();
});

test('successful appearance replacement releases the old source byte reservation',async()=>{
  const {createPhaserUi}=await api(),f=transactionalSourceFixture(),ui=createPhaserUi({...f,limits:{sourceBytes:576,objects:20}}),m=ui.mount(f.snapshot(1,'a'),{parent:f.parent,scope:'test:sourceReplacement'});
  for(const [i,id]of ['b','c','a'].entries()){
    expect(()=>m.update(f.snapshot(i+2,id))).not.toThrow();
    expect(m.inspect({limit:1}).native.lifecycle).toBe('mounted');
  }
  expect(f.reads.map(r=>r.maxBytes)).toEqual([576,576,576,576]);ui.dispose();
});

test('nonphysical paint offsets reject before native allocation',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  f.theme=defineTheme({version:1,id:'test:offset',skins:f.theme.skins,roles:{button:{alternatives:[{kind:'skin',id:'paper'}],placement:{nativeStates:{pressed:{paintOffset:{x:0,y:.25}}}}}}});
  const ui=createPhaserUi(f);expect(()=>ui.mount(f.snapshot(),{parent:f.parent,scope:'test:offset'})).toThrow(/physical.*offset|offset.*physical/i);expect(f.objects).toHaveLength(0);ui.dispose();
});

test('painter uses the installed public factory and setFrame declarations without widened Frame arguments',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),image=f.scene.add.image;
  f.scene.add.image=(x,y,texture,frame)=>{
    if(frame!==undefined && !['string','number'].includes(typeof frame))throw Error('public factory frame argument');
    const object=image(x,y,texture,frame),setTexture=object.setTexture;
    object.setTexture=(key,nextFrame)=>{if(typeof key!=='string'||typeof nextFrame==='object')throw Error('public setTexture argument');return setTexture.call(object,key,nextFrame);};
    return object;
  };
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:actualPublic'});
  expect(f.objects.some(o=>o.kind==='image'&&typeof o.frame==='string')).toBe(true);
  m.update(f.snapshot(2));m.dispose();expect(f.fragments.size).toBe(0);ui.dispose();
});

test('authored state precedence retains held input until model or resize cancellation',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture();
  const skin=x=>({frame:{x,y:2,width:3,height:3},insets:1});
  f.theme=defineTheme({version:1,id:'test:precedence',skins:{normal:skin(0),focus:skin(2),hover:skin(5),pressed:skin(8)},roles:{button:{alternatives:[{kind:'skin',id:'normal'}],placement:{nativeStates:{focus:{skin:'focus'},hover:{skin:'hover'},pressed:{skin:'pressed'},disabled:{skin:'normal'}}}}}});
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:precedence'});
  const firstX=()=>f.fragments.get(f.objects.find(o=>o.kind==='image'&&!o.destroyed).frame).cutX;
  expect(firstX()).toBe(2);m.handle({type:'hover',point:{x:4,y:4},pointSpace:'physical'});expect(firstX()).toBe(5);
  m.handle({type:'press',inputId:'a',point:{x:4,y:4},pointSpace:'physical'});expect(firstX()).toBe(8);
  m.handle({type:'hover',point:{x:6,y:6},pointSpace:'physical'});expect(firstX()).toBe(8);expect(m.inspect({limit:1}).heldCount).toBe(1);
  const disabled={...f.snapshot(),revision:2,tree:button({id:'ok',enabled:false,actionId:'game:ok',layout:{width:101,height:53}})};
  m.update(disabled);expect(firstX()).toBe(0);expect(m.inspect({limit:1}).heldCount).toBe(0);
  expect(m.handle({type:'release',inputId:'a',point:{x:6,y:6},pointSpace:'physical'})).toEqual([]);
  const enabled={...f.snapshot(),revision:3};m.update(enabled);m.handle({type:'press',inputId:'b',point:{x:4,y:4},pointSpace:'physical'});
  m.update({...enabled,context:{...enabled.context,revision:2,localToPhysical:{scale:3,x:0,y:0}}});
  expect(m.inspect({limit:1}).heldCount).toBe(0);expect(m.handle({type:'release',inputId:'b',point:{x:4,y:4},pointSpace:'physical'})).toEqual([]);ui.dispose();
});

test('a transient fragment allocation failure retires held state and drains owned resources',async()=>{
  const {createPhaserUi}=await api(),f=uniformFixture(),get=f.texture.get;
  f.theme=defineTheme({version:1,id:'test:stateFailure',skins:{a:{frame:{x:2,y:2,width:3,height:3},insets:1},b:{frame:{x:8,y:2,width:3,height:3},insets:1}},roles:{button:{alternatives:[{kind:'skin',id:'a'}],placement:{nativeStates:{pressed:{skin:'b'}}}}}});
  f.texture.get=()=>({clone(){const frame=get().clone(),setSize=frame.setSize;frame.setSize=function(w,h,x,y){setSize.call(this,w,h,x,y);if(x>=8)throw Error('state fragment failed');return this;};return frame;}});
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:stateFailure'});
  expect(()=>m.handle({type:'press',inputId:'p',point:{x:4,y:4},pointSpace:'physical'})).toThrow(/state fragment failed/);
  expect(m.inspect({limit:1})).toMatchObject({heldCount:0,disposed:true,native:{lifecycle:'retired',objects:0,fragments:0,attachments:0}});
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);expect(f.texture.frameTotal).toBe(1);ui.dispose();
});

test('authored glyph tint reaches only lettering and clears on a reused image',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const role=f.theme.roles.button;
  f.theme=defineTheme({version:1,id:'test:tinted',fonts:f.theme.fonts,skins:{paper:{frame:{x:4,y:0,width:3,height:3},insets:1}},roles:{button:{font:role.font,tone:role.tone,alternatives:[{kind:'skin',id:'paper'}]},danger:{font:role.font,tone:role.tone,glyphTint:'#e8837a',alternatives:[{kind:'skin',id:'paper'}]}}});
  const ui=createPhaserUi(f),snapshot=(revision,appearanceRole)=>({...f.snapshot(revision),tree:button({id:'ok',appearanceRole,label:'?',actionId:'game:ok',layout:{width:20,height:10}})});
  const m=ui.mount(snapshot(1,'danger'),{parent:f.parent,scope:'test:tint'});
  const glyph=f.objects.find(o=>o.kind==='image'&&o.tint===0xe8837a);expect(glyph).toBeDefined();
  const skin=f.objects.filter(o=>o.kind==='image'&&o!==glyph);expect(skin.length).toBeGreaterThan(0);expect(skin.every(o=>o.tint===0xffffff)).toBe(true);
  const count=f.objects.length;m.update(snapshot(2,'button'));expect(f.objects.length).toBe(count);expect(glyph.destroyed).toBe(0);expect(glyph.tint).toBe(0xffffff);
  m.dispose();ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);
});

test.each(['x','y'].flatMap(axis=>[0,50,100].map(value=>({axis,value}))))('capped $axis meter paints the controlled $value percent',async({axis,value})=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  f.theme=defineTheme({version:1,id:'test:meterAxes',skins:{bar:{frame:{x:0,y:0,width:3,height:5},insets:1,caps:{axis,start:1,end:1,period:1}}},roles:{meter:{colors:{track:'#111111',fill:'#00ff00'},alternatives:[{kind:'skin',id:'bar'}]}}});
  const ui=createPhaserUi(f),m=ui.mount({revision:1,context:f.context,tree:u.meter({id:'meter',value,min:0,max:100,layout:{width:20,height:20}})},{parent:f.parent,scope:'test:meterAxes'});
  const fill=f.objects.find(o=>o.kind==='rectangle'&&o.color===0x00ff00),track=f.objects.find(o=>o.kind==='rectangle'&&o.color===0x111111);
  const dimension=axis==='x'?'width':'height',cross=axis==='x'?'height':'width';
  if(value===0)expect(fill?.visible??false).toBe(false);
  else {expect(fill.visible).toBe(true);expect(fill[dimension]).toBe(Math.floor(track[dimension]*value/100));expect(fill[cross]).toBe(track[cross]);}
  m.dispose();ui.dispose();
});

test.each(['stepper','pager'])('$0 indicators use the physical grid while semantic bounds remain continuous',async kind=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,localToPhysical:{scale:1.5,x:0.25,y:0.5},sourcePixelPhysicalSize:2};
  const tree=u[kind]({id:'adjust',value:1,...(kind==='pager'?{pageCount:3}:{min:0,max:2}),layout:{width:22,height:10}}),snapshot={revision:1,context:f.context,tree};
  const planned=layoutUi(tree,{...snapshot,theme:f.theme}),ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:grid'});
  const indicators=f.objects.filter(o=>o.kind==='rectangle'&&o.visible&&o.color===0xffffff);
  expect(indicators.length).toBeGreaterThan(0);
  for(const object of indicators){const physical=projectPixelRect(planned.contexts[0],{x:object.x,y:object.y,width:object.width,height:object.height});for(const v of Object.values(physical))expect(Math.abs(v-Math.round(v))).toBeLessThan(1e-8);}
  expect(m.inspect({limit:1}).controls[0].bounds).toEqual(planned.records[0].bounds);m.dispose();ui.dispose();
});

test.each(['x','y'].flatMap(axis=>[0,50,100].map(value=>({axis,value}))))('mixed-resolution capped $axis fill retains every authored period at $value percent',async({axis,value})=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.context={...f.context,localToPhysical:{scale:1.5,x:0.25,y:0.5},sourcePixelPhysicalSize:2};
  f.theme=defineTheme({version:1,id:'test:mixedMeter',skins:{bar:{frame:{x:0,y:0,width:3,height:5},insets:1,caps:{axis,start:1,end:1,period:1}}},roles:{meter:{colors:{track:'#111111',fill:'#00ff00'},alternatives:[{kind:'skin',id:'bar'}]}}});
  const tree=u.meter({id:'meter',value,min:0,max:100,layout:{width:22,height:22}}),snapshot={revision:1,context:f.context,tree},plan=layoutUi(tree,{...snapshot,theme:f.theme});
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:mixedMeter'}),fill=f.objects.find(o=>o.kind==='rectangle'&&o.color===0x00ff00);
  if(value===0)expect(fill?.visible??false).toBe(false);
  else {const actual=projectPixelRect(plan.contexts[0],{x:fill.x,y:fill.y,width:fill.width,height:fill.height});expect(actual[axis==='x'?'width':'height']).toBeCloseTo(value===50?14:28,10);}
  m.dispose();ui.dispose();
});

test.each(['x','y'].flatMap(axis=>[1,2].flatMap(pixel=>[28.99999,29,29.00001].map(value=>({axis,pixel,value})))) )('capped $axis fill preserves the exact period boundary near $value with $pixel physical pixels per source pixel',async({axis,pixel,value})=>{
  const {createPhaserUi}=await api(),f=fixture(),mixed=pixel===2;
  f.context={...f.context,localToPhysical:{scale:mixed?1.5:1,x:mixed?0.25:0,y:mixed?0.25:0},sourcePixelPhysicalSize:pixel,viewport:{x:0,y:0,width:150,height:150}};
  f.theme=defineTheme({version:1,id:'test:periodBoundary',skins:{bar:{frame:{x:0,y:0,width:3,height:5},insets:1,caps:{axis,start:1,end:1,period:1}}},roles:{meter:{colors:{track:'#111111',fill:'#00ff00'},alternatives:[{kind:'skin',id:'bar'}]}}});
  const size=mixed?137:102,tree=u.meter({id:'meter',value,min:0,max:100,layout:{width:size,height:size}}),snapshot={revision:1,context:f.context,tree},plan=layoutUi(tree,{...snapshot,theme:f.theme});
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:periodBoundary'}),fill=f.objects.find(o=>o.kind==='rectangle'&&o.color===0x00ff00),track=f.objects.find(o=>o.kind==='rectangle'&&o.color===0x111111);
  const dimension=axis==='x'?'width':'height';
  const physical=o=>projectPixelRect(plan.contexts[0],{x:o.x,y:o.y,width:o.width,height:o.height})[dimension];
  expect(physical(track)).toBeCloseTo(100*pixel,10);expect(physical(fill)).toBeCloseTo((value<29?28:29)*pixel,10);m.dispose();ui.dispose();
});

test('native mount reuses a stock button, returns one intent and releases only its allocations',async()=>{
  const {createPhaserUi}=await api(), f=fixture();
  const ui=createPhaserUi(f), mount=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:screen'});
  expect(f.objects.some(o=>o.kind==='image')).toBe(true);
  mount.handle({type:'press',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});
  expect(mount.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toMatchObject([{kind:'activate',controlId:'ok',actionId:'game:ok'}]);
  expect(mount.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toEqual([]);
  const glyph=f.objects.find(o=>o.kind==='image'), created=f.objects.length;
  mount.update(f.snapshot(2));expect(glyph.destroyed).toBe(0);expect(f.objects.length).toBe(created);
  mount.dispose();mount.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
  expect(f.fragments.size).toBe(0);expect(f.parent.destroyed).toBe(0);
  expect(f.scene.events.listenerCount('shutdown')).toBe(0);expect(mount.inspect({limit:1}).disposed).toBe(true);
  ui.dispose();
});

test('mount cycles leave borrowed atlas bookkeeping and fallback frame unchanged',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
  for(let i=0;i<4;i++){const m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:borrowed'});m.dispose();}
  expect(f.texture.frameTotal).toBe(1);expect(f.texture.firstFrame).toBe('__BASE');expect(f.fragments.size).toBe(0);ui.dispose();
});

test('preparation failure preserves the current native mount; reconcile failure retires and drains it',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:fail'});
  const glyph=f.objects.find(o=>o.kind==='image');
  expect(()=>m.update({...f.snapshot(2),tree:{...f.snapshot().tree,appearanceRole:'missing'}})).toThrow(/role/i);
  expect(glyph.destroyed).toBe(0);expect(m.handle({type:'default',inputId:'still-live'})).toEqual([]);
  expect(m.handle({type:'activate',controlId:'ok',inputId:'still-live-2'})).toHaveLength(1);
  glyph.setPosition=()=>{throw Error('native mutation failed');};
  expect(()=>m.update(f.snapshot(2,'??'))).toThrow(/native mutation failed/);
  expect(m.inspect({limit:1}).native.lifecycle).toBe('retired');expect(m.handle({type:'activate',controlId:'ok',inputId:'dead'})).toEqual([]);
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);ui.dispose();
});

test('scene shutdown attempts every owned release once even when a destructor fails',async()=>{
  const {createPhaserUi}=await api(),f=fixture();let releases=0;
  f.ports.attachContext=()=>({ownership:'owned',parent:f.parent,release(){releases++;throw Error('lease failed');}});
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:cleanup'});
  const bad=f.objects[0];bad.destroy=()=>{bad.destroyed++;throw Error('object failed');};
  expect(()=>f.scene.events.emit('shutdown')).toThrow(/cleanup|release|dispose/i);
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);expect(releases).toBe(1);
  expect(m.inspect({limit:1}).native.cleanupFailures.join(' ')).toMatch(/object failed/);
  expect(m.inspect({limit:1}).native.cleanupFailures.join(' ')).toMatch(/lease failed/);
  m.dispose();ui.dispose();expect(releases).toBe(1);
});

test('single portable feedback drives focus hover press disabled and controlled field presentation',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
  const snapshot=(revision,enabled=true)=>({...f.snapshot(revision),tree:u.field({id:'field',enabled,value:'??',selection:{start:0,end:1,direction:'forward'},composition:'?',layout:{width:20,height:10}})});
  const m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:feedback'});
  expect(m.inspect({limit:1}).controls[0].focused).toBe(true);
  expect(f.objects.some(o=>o.kind==='rectangle'&&o.color===0x444444&&o.visible)).toBe(true);
  m.handle({type:'hover',point:{x:2,y:2},pointSpace:'physical'});expect(m.inspect({limit:1}).controls[0].hovered).toBe(true);
  m.handle({type:'press',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});expect(m.inspect({limit:1}).controls[0].pressed).toBe(true);
  expect(f.objects.some(o=>o.color===0xff0000&&o.visible)).toBe(true);
  expect(m.handle({type:'edit',inputId:'edit',text:'?'})).toMatchObject([{kind:'change',value:'??'}]);
  m.update(snapshot(2,false));expect(m.inspect({limit:1}).controls[0].pressed).toBe(false);
  expect(f.objects.some(o=>o.color===0x777777&&o.visible)).toBe(true);ui.dispose();
});

test('context leases and glyph keys survive unrelated mapping changes and repeated HUD updates',async()=>{
  const {createPhaserUi}=await api(),f=fixture();let attachments=0,releases=0;
  f.ports.attachContext=()=>{attachments++;return {ownership:'owned',parent:f.parent,release(){releases++;}};};
  const ui=createPhaserUi(f),snapshot=revision=>({...f.snapshot(revision),additionalContexts:[{...f.context,id:'test:unused'}]});
  const m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:reuse'}),count=f.objects.length;
  for(let revision=2;revision<=20;revision++)m.update(snapshot(revision));
  expect(f.objects.length).toBe(count);expect(attachments).toBe(2);expect(releases).toBe(0);
  m.handle({type:'press',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});
  const next=snapshot(20);next.additionalContexts[0].revision=2;m.update(next);
  expect(m.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toHaveLength(1);
  ui.dispose();expect(releases).toBe(3);
});

test('extension semantic regions share intent ownership and narrow facade allocations drain after partial failure',async()=>{
  const {createPhaserUi}=await api(),f=fixture();let owned=0,released=0,mounts=0;
  const narrow=Object.freeze({chartLine(){}});f.ports.extensionFacade=(_request,scope)=>{owned++;scope.onDispose(()=>{released++;});return narrow;};
  const ui=createPhaserUi(f),remove=ui.registerExtension('test:chart',{version:1,
    measure:()=>({min:{width:20,height:10},preferred:{width:20,height:10},overflow:'clip'}),
    regions:(_model,a)=>[{id:'zoom',bounds:a.bounds,actionId:'game:zoom',focusable:true}],
    mount(model,_allocation,scope){mounts++;expect(scope.native).toBe(narrow);expect('scene' in scope).toBe(false);if(model==='fail')throw Error('extension failed');}});
  const snapshot=(revision,model='ok')=>({...f.snapshot(revision),tree:u.extension({id:'chart',extensionId:'test:chart',model,layout:{width:20,height:10}})});
  const m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:chartScope'});
  m.handle({type:'press',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});
  expect(m.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toMatchObject([{kind:'activate',actionId:'game:zoom'}]);
  m.update(snapshot(2));expect(mounts).toBe(1);
  expect(()=>m.update(snapshot(3,'fail'))).toThrow(/extension failed/);expect(released).toBe(owned);
  expect(()=>remove()).not.toThrow();ui.dispose();
});

test('hollow tiled source regions use physical source footprints, partial crop, and bounded keyed reuse',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:regions',skins:{hollow:{frame:{x:20,y:10,width:5,height:5},insets:{top:1,right:1,bottom:1,left:1},center:'omit',tile:true}},roles:{absolute:{},panel:{alternatives:[{kind:'skin',id:'hollow'}]}}});
  f.context={...f.context,localToPhysical:{scale:1.5,x:0.25,y:0.5},sourcePixelPhysicalSize:2};
  const tree=u.absolute({id:'root',layout:{width:13,height:12,overflow:'clip'},children:[u.panel({id:'plate',layout:{x:-2,y:-1,width:18,height:13}})]});
  const snapshot={revision:1,context:f.context,tree},plan=layoutUi(tree,{...snapshot,theme:f.theme});
  const part=plan.records[1].parts[0],quads=[...iterateNineSliceTiles(part.plan)];
  expect(part.plan.regions.some(r=>r.row===1&&r.column===1)).toBe(false);
  expect(quads.length).toBeGreaterThan(8);
  expect(quads.some(q=>q.source.width<3&&q.source.x===21)).toBe(true);
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:regions'});
  const images=f.objects.filter(o=>o.kind==='image');expect(images.length).toBeGreaterThan(0);
  for(const image of images){
    expect(image.crop).toHaveLength(4);
    const frame=f.fragments.get(image.frame),[x,y,width,height]=image.crop;
    expect(frame.cutX>=20&&frame.cutY>=10).toBe(true);
    expect(image.scaleX*f.context.localToPhysical.scale).toBe(2);
    expect(image.scaleY*f.context.localToPhysical.scale).toBe(2);
    const visible=projectPixelRect(plan.contexts[0],{x:image.x+x*image.scaleX,y:image.y+y*image.scaleY,width:width*image.scaleX,height:height*image.scaleY});
    const clip=projectPixelRect(plan.contexts[0],part.clipBounds);
    expect(visible.x).toBeGreaterThanOrEqual(clip.x-1e-9);expect(visible.y).toBeGreaterThanOrEqual(clip.y-1e-9);
    expect(visible.x+visible.width).toBeLessThanOrEqual(clip.x+clip.width+1e-9);expect(visible.y+visible.height).toBeLessThanOrEqual(clip.y+clip.height+1e-9);
  }
  expect(images.some(o=>o.crop[0]>0||o.crop[1]>0||o.crop[2]<f.fragments.get(o.frame).width)).toBe(true);
  const count=f.objects.length,frames=f.fragments.size;
  for(let revision=2;revision<=6;revision++)m.update({...snapshot,revision});
  expect(f.objects.length).toBe(count);expect(f.fragments.size).toBe(frames);expect(count).toBeLessThan(40);
  ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);
});

test('remaining stock parts paint controlled values, declared icons, tabs, adjustments and capped meter geometry',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  const kinds=['absolute','panel','header','card','text','button','actionBar','listRow','itemSlot','field','toggle','stepper','tabs','fold','pager','progress','meter','separator','icon','notice','tooltip','stack','row','grid','extension'];
  f.theme=defineTheme({version:1,id:'test:stock',fonts:f.theme.fonts,skins:{bar:{frame:{x:20,y:0,width:5,height:3},insets:{left:1,right:1,top:0,bottom:0},caps:{start:1,end:1,period:3,axis:'x'}}},icons:{coin:{width:3,height:3,frame:{x:30,y:0,width:3,height:3}}},roles:Object.fromEntries(kinds.map(k=>[k,{font:'body',tone:'cream',colors:f.theme.roles.button.colors,...(['progress','meter'].includes(k)?{alternatives:[{kind:'skin',id:'bar'}]}:{})}]))});
  const values={field:{value:'??',selection:{start:0,end:1,direction:'forward'},composition:'?'},toggle:{value:true},fold:{value:true},stepper:{value:1,min:0,max:2},pager:{value:0,pageCount:2},tabs:{value:'b',options:[{id:'a',label:'?'},{id:'b',label:'?'},{id:'c',label:'?',enabled:false}]},progress:{value:1,min:0,max:4},meter:{value:1,min:0,max:4},icon:{asset:'coin'},itemSlot:{asset:'coin',quantity:2}};
  const children=kinds.filter(k=>!['absolute','extension'].includes(k)).map((kind,i)=>u.node(kind,{id:kind,...(kind==='icon'?{}:{label:'?'}),...values[kind],layout:{x:i%4*24,y:Math.floor(i/4)*12,width:22,height:10}}));
  const snapshot={revision:1,context:{...f.context,viewport:{x:0,y:0,width:100,height:80}},tree:u.absolute({id:'all',focus:{initialId:'field'},children})};
  const ui=createPhaserUi(f),m=ui.mount(snapshot,{parent:f.parent,scope:'test:stock'}),observation=m.inspect({limit:40});
  expect(observation.controls.map(c=>c.kind)).toEqual(['absolute',...children.map(c=>c.kind)]);
  expect(f.objects.some(o=>o.kind==='image'&&f.fragments.get(o.frame).cutX===30)).toBe(true);
  expect(f.objects.some(o=>o.kind==='rectangle'&&o.visible&&o.color===0x00ff00)).toBe(true);
  expect(m.handle({type:'adjust',controlId:'stepper',delta:1,inputId:'step'})).toMatchObject([{kind:'change',value:2}]);
  expect(m.handle({type:'adjust',controlId:'pager',delta:1,inputId:'page'})).toMatchObject([{kind:'change',value:1}]);
  expect(m.handle({type:'select',controlId:'tabs',value:'c',inputId:'disabled'})).toEqual([]);
  expect(m.handle({type:'activate',controlId:'toggle',inputId:'toggle'})).toMatchObject([{kind:'change',value:false}]);
  expect(m.inspect({limit:40}).controls.find(c=>c.id==='field').focused).toBe(true);
  const count=f.objects.length;m.update({...snapshot,revision:2});expect(f.objects.length).toBe(count);
  // Authored caps delimit the fill, and quantity is visible stock text rather than lost item data.
  const meterRecord=layoutUi(snapshot.tree,{...snapshot,theme:f.theme}).records.find(r=>r.id==='meter');
  const meterInk=f.objects.filter(o=>o.kind==='rectangle'&&o.color===0x00ff00&&o.x>=meterRecord.bounds.x&&o.x<meterRecord.bounds.x+meterRecord.bounds.width&&o.y>=meterRecord.bounds.y&&o.y<meterRecord.bounds.y+meterRecord.bounds.height);
  expect(meterInk[0].width).toBeLessThanOrEqual(4);
  const slot=observation.controls.find(c=>c.id==='itemSlot');
  expect(f.objects.filter(o=>o.kind==='image'&&f.fragments.get(o.frame).cutX===0&&o.x>=slot.bounds.x&&o.x<slot.bounds.x+slot.bounds.width&&o.y>=slot.bounds.y&&o.y<slot.bounds.y+slot.bounds.height)).toHaveLength(2);
  ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('shutdown drains all mounted scopes even when the first scope cleanup throws',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
  ui.mount(f.snapshot(),{parent:f.parent,scope:'test:first'});const first=f.objects[0];first.destroy=()=>{first.destroyed++;throw Error('first failed');};
  ui.mount(f.snapshot(),{parent:f.parent,scope:'test:second'});
  expect(()=>f.scene.events.emit('shutdown')).toThrow(/cleanup|dispose/);
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);expect(f.scene.events.listenerCount('shutdown')).toBe(0);ui.dispose();
});

test('extension regions inherit clip and disabled state with visible feedback from the same interaction owner',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);let mounts=0,drained=0;
  ui.registerExtension('test:feedback',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:10},overflow:'clip'}),
    regions:(_model,a)=>[{id:'zoom',bounds:{...a.bounds,x:a.bounds.x-5,width:30},focusable:true,actionId:'game:zoom'}],mount(_model,_allocation,scope){mounts++;scope.onDispose(()=>drained++);}});
  const snapshot=(revision,enabled=true)=>({...f.snapshot(revision),tree:u.extension({id:'chart',enabled,extensionId:'test:feedback',layout:{width:20,height:10}})});
  const m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:extensionFeedback'});
  expect(m.inspect({limit:5}).controls.find(c=>c.id==='chart:zoom').focused).toBe(true);
  expect(f.objects.some(o=>o.visible&&o.color===0xffffff)).toBe(true);
  m.handle({type:'press',point:{x:2,y:2},pointSpace:'physical',inputId:'press'});
  expect(f.objects.some(o=>o.visible&&o.color===0xff0000)).toBe(true);
  expect(m.handle({type:'release',point:{x:42,y:2},pointSpace:'physical',inputId:'press'})).toEqual([]);
  m.update(snapshot(2,false));expect(m.handle({type:'activate',controlId:'chart:zoom',inputId:'disabled'})).toEqual([]);
  expect(mounts).toBe(2); // enabled/semantic authority changes must republish the extension facade allocation.
  expect(drained).toBe(1);ui.dispose();expect(drained).toBe(2);
});

test('partial context and fragment allocation failures release owned effects without touching borrowed cache',async()=>{
  const {createPhaserUi}=await api();
  const a=fixture();let released=0;
  a.ports.attachContext=(_request,scope)=>{scope.onDispose(()=>released++);throw Error('attachment failed');};
  const ui=createPhaserUi(a);expect(()=>ui.mount(a.snapshot(),{parent:a.parent,scope:'test:partialAttach'})).toThrow(/attachment failed/);
  expect(released).toBe(1);expect(a.scene.events.listenerCount('shutdown')).toBe(0);ui.dispose();
  const b=fixture(),get=b.texture.get;
  b.texture.get=()=>{const base=get();return {clone(){const frame=base.clone(),setSize=frame.setSize;frame.setSize=function(...args){setSize.apply(this,args);throw Error('fragment failed after allocation');};return frame;}};};
  const second=createPhaserUi(b);expect(()=>second.mount(b.snapshot(),{parent:b.parent,scope:'test:partialFrame'})).toThrow(/fragment failed/);
  expect(b.fragments.size).toBe(0);expect(b.objects.every(o=>o.destroyed===1)).toBe(true);expect(b.scene.events.listenerCount('shutdown')).toBe(0);second.dispose();
});

test('a reconcile-time destructor failure is retained while the retired scope drains every other allocation',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:removeFailure'});
  const glyph=f.objects.find(o=>o.kind==='image');glyph.destroy=()=>{glyph.destroyed++;throw Error('removed glyph failed');};
  expect(()=>m.update(f.snapshot(2,''))).toThrow(/removed glyph failed/);
  expect(m.inspect({limit:1}).native.lifecycle).toBe('retired');
  expect(m.inspect({limit:1}).native.cleanupFailures.join(' ')).toMatch(/removed glyph failed/);
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);ui.dispose();
});


test('retained passive movement keeps offscreen ink and common native objects without new text preparation',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
  const tree=u.text({id:'label',label:'???',layout:{width:20,height:8,wrap:false}});
  const snapshot=(revision,x,y=4)=>({revision,context:f.context,items:[{id:'label',tree,x,y}]});
  expect(typeof ui.mountPassive).toBe('function');
  const m=ui.mountPassive(snapshot(1,-40),{parent:f.parent,scope:'test:passive'});
  expect(m.handle).toBeUndefined();expect(m.inspect({limit:5}).native.objects).toBe(0);
  m.update(snapshot(2,4));expect(m.inspect({limit:5}).native.objects).toBe(3);
  const visible=f.objects.filter(o=>o.visible&&!o.destroyed),before=m.inspect({limit:5});
  m.update(snapshot(3,7));const after=m.inspect({limit:5});
  expect(after.native.created).toBe(before.native.created);
  expect(after.native.preparations).toBe(before.native.preparations);
  expect(visible.map(o=>o.x)).toEqual([7,12,17]);
  expect(after.controls[0]).toMatchObject({id:'label',bounds:{x:7,y:4},focused:false,focusable:false});
  m.update(snapshot(4,7.25));expect(m.inspect({limit:5}).native.preparations).toBe(before.native.preparations+1);
  ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);
});

test('retained passive batches reject authority raw accessors duplicates and aggregate over-budget publication atomically',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi({...f,limits:{objects:4}});
  expect(typeof ui.mountPassive).toBe('function');
  const tree=u.text({id:'one',label:'??',layout:{width:20,height:8}}),item={id:'one',tree,x:4,y:4};
  const m=ui.mountPassive({revision:1,context:f.context,items:[item]},{parent:f.parent,scope:'test:passive-atomic'});
  const accepted=m.inspect({limit:5}),positions=f.objects.map(o=>[o.x,o.y]);
  const reject=items=>{expect(()=>m.update({revision:2,context:f.context,items})).toThrow();expect(m.inspect({limit:5})).toEqual(accepted);expect(f.objects.map(o=>[o.x,o.y])).toEqual(positions);};
  reject([{...item,x:12},item]);
  reject([{...item,x:12},{id:'two',x:0,y:0,tree:u.text({id:'two',label:'???',layout:{width:20,height:8}})}]);
  for(const tree of [u.button({id:'one',actionId:'game:attack'}),u.text({id:'one',label:'?',focusable:true}),u.text({id:'one',label:'?',focus:{}}),u.text({id:'one',label:'?',regions:{hit:{x:0,y:0,width:1,height:1}}})])reject([{...item,tree}]);
  let reads=0;const bad={...item};Object.defineProperty(bad,'x',{enumerable:true,get(){reads++;return 0;}});reject([bad]);expect(reads).toBe(0);
  expect(()=>m.update({revision:0,context:f.context,items:[item]})).toThrow();
  expect(()=>m.update({revision:2,context:{...f.context,viewport:{...f.context.viewport,width:99}},items:[item]})).toThrow();
  expect(()=>m.update({revision:1,context:f.context,items:[{...item,x:8}]})).toThrow();
  expect(m.inspect({limit:5})).toEqual(accepted);
  const source=f.texture.source[0];f.texture.source[0]={};expect(()=>m.update({revision:2,context:f.context,items:[{...item,x:8}]})).toThrow();f.texture.source[0]=source;
  expect(m.inspect({limit:5})).toEqual(accepted);
  m.update({revision:2,context:f.context,items:[]});expect(m.inspect({limit:5}).native.objects).toBe(0);
  m.update({revision:3,context:f.context,items:[item]});expect(m.inspect({limit:5}).native.objects).toBe(2);
  f.scene.events.emit('shutdown');expect(m.inspect({limit:5}).native.lifecycle).toBe('disposed');ui.dispose();
});


test('retained passive common-painter geometry matches fresh stock layout through outline clipping phase and context changes',async()=>{
  const {createPhaserUi}=await api();
  const ink=f=>f.objects.filter(o=>o.visible&&!o.destroyed).map(o=>{
    const frame=f.fragments.get(o.frame),round=n=>typeof n==='number'?Math.round(n*1e8)/1e8:n;
    return [o.kind,o.x,o.y,o.width,o.height,o.scaleX,o.scaleY,o.color,o.tint,o.alpha,o.depth,...o.crop??[],frame?.cutX,frame?.cutY,frame?.width,frame?.height].map(round);
  });
  for(const scale of [1,2,3]){
    const a=fixture(),b=fixture();
    for(const f of [a,b])f.context={...f.context,localToPhysical:{scale,x:1,y:2},sourcePixelPhysicalSize:2,viewport:{x:3,y:2,width:40,height:25}};
    const tree=u.absolute({id:'outline',layout:{width:20,height:9,padding:0,overflow:'clip'},children:[[-1,0],[1,0],[0,-1],[0,1],[0,0]].map(([x,y],i)=>u.text({id:'ink:'+i,label:'???',layout:{x,y,width:22,height:8,wrap:false}}))});
    const ua=createPhaserUi(a),ub=createPhaserUi(b);let ma,mb,revision=0;
    for(const [x,y]of [[-40,4],[-2,4],[4,4],[7,4],[7.25,4],[38,20],[4,4]]){
      const item={id:'outline',tree,x,y},snap={revision:++revision,context:a.context,items:[item]};
      const fresh={revision,context:b.context,tree:u.absolute({id:'root',layout:{width:40,height:25,padding:0,overflow:'clip'},children:[{...tree,layout:{...tree.layout,x,y}}]})};
      if(ma){ma.update(snap);mb.update(fresh);}else{ma=ua.mountPassive(snap,{parent:a.parent,scope:'test:retained-geometry'});mb=ub.mount(fresh,{parent:b.parent,scope:'test:fresh-geometry'});}
      expect(ink(a),JSON.stringify({scale,x,y})).toEqual(ink(b));
    }
    ua.dispose();ub.dispose();
  }
});


test('retained passive cache rejects finite translation overflow before publication',async()=>{
 const {createPhaserUi}=await api(),f=fixture();f.context={...f.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
 const ui=createPhaserUi(f),tree=u.absolute({id:'huge',layout:{x:1e308,width:1,height:1}}),item={id:'huge',tree,x:0,y:0};
 const m=ui.mountPassive({revision:1,context:f.context,items:[item]},{parent:f.parent,scope:'test:passive-overflow'}),accepted=m.inspect({limit:1});
 expect(()=>m.update({revision:2,context:f.context,items:[{...item,x:1e308}]})).toThrow();expect(m.inspect({limit:1})).toEqual(accepted);ui.dispose();
});
test('retained passive caching requires a certified immutable theme while ordinary raw admission remains supported',async()=>{
 const {createPhaserUi}=await api(),f=fixture();f.theme=structuredClone(f.theme);
 const ui=createPhaserUi(f),tree=u.text({id:'label',label:'?',layout:{width:20,height:8}});
 expect(()=>ui.mountPassive({revision:1,context:f.context,items:[{id:'label',tree,x:0,y:0}]},{parent:f.parent,scope:'test:passive-theme'})).toThrow(/immutable|certified/i);
 const ordinary=ui.mount({revision:1,context:f.context,tree},{parent:f.parent,scope:'test:raw-theme'});expect(ordinary.inspect({limit:1}).native.lifecycle).toBe('mounted');ui.dispose();
});


test('native text memo keeps admission and held binding authority while dropping retained data on disposal',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi({...f,limits:{objects:12}});
 const tree=actionId=>u.absolute({id:'root',children:[u.text({id:'static',label:'???',layout:{x:30,y:0,width:30,height:10}}),u.button({id:'action',label:'?',actionId,layout:{width:20,height:10}})]});
 const m=ui.mount({revision:1,context:f.context,tree:tree('old-action')},{parent:f.parent,scope:'test:text-memo'});
 expect(m.inspect({limit:5}).native.textMemo?.entries).toBeGreaterThan(0);
 m.handle({type:'press',inputId:'held',point:{x:4,y:4},pointSpace:'physical'});
 m.update({revision:2,context:f.context,tree:tree('new-action')});
 expect(m.inspect({limit:5}).native.textMemo.hits).toBeGreaterThan(0);
 expect(m.handle({type:'release',inputId:'held',point:{x:4,y:4},pointSpace:'physical'}).filter(x=>x.kind==='activate')).toEqual([]);
 const accepted=m.inspect({limit:5});expect(()=>m.update({revision:3,context:f.context,tree:u.text({id:'too-many',label:'?'.repeat(9000),layout:{width:90000,height:8}})})).toThrow();expect(m.inspect({limit:5})).toEqual(accepted);
 ui.dispose();expect(m.inspect({limit:5}).native.textMemo.entries).toBe(0);
});


test('passive ID-only templates reuse active preparation while preserving current identities and native lifetimes',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);
 const tree=(id,label='???')=>u.absolute({id,layout:{width:24,height:9,padding:0,overflow:'clip'},children:[[-1,0],[0,0]].map(([x,y],i)=>u.text({id:id+':ink:'+i,label,layout:{x,y,width:24,height:8,wrap:false}}))});
 const item=(id,x=4)=>({id,tree:tree(id),x,y:4});
 const m=ui.mountPassive({revision:1,context:f.context,items:[item('old')]},{parent:f.parent,scope:'test:template'}),before=m.inspect({limit:20}),oldObjects=f.objects.filter(o=>o.visible&&!o.destroyed);
 m.update({revision:2,context:f.context,items:[item('new',7),item('sibling',12)]});
 const after=m.inspect({limit:20});expect(after.native.preparations).toBe(before.native.preparations);
 expect(after.controls.map(r=>r.id)).toEqual(['new','new:ink:0','new:ink:1','sibling','sibling:ink:0','sibling:ink:1']);
 expect(after.heldCount).toBe(0);expect(m.handle).toBeUndefined();expect(oldObjects.every(o=>o.destroyed===1)).toBe(true);
 expect(after.native.created-after.native.destroyed).toBe(after.native.objects);
 const positions=f.objects.filter(o=>o.visible&&!o.destroyed).map(o=>[o.x,o.y]);expect(positions).toEqual([[6,4],[11,4],[16,4],[7,4],[12,4],[17,4],[11,4],[16,4],[21,4],[12,4],[17,4],[22,4]]);
 ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.fragments.size).toBe(0);
});

test('passive template admission validates new trees raw descriptors aggregate budgets and source identity atomically',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi({...f,limits:{objects:4}}),tree=id=>u.text({id,label:'???',layout:{width:24,height:8,wrap:false}}),item=id=>({id,tree:tree(id),x:4,y:4});
 const m=ui.mountPassive({revision:1,context:f.context,items:[item('old')]},{parent:f.parent,scope:'test:template-atomic'}),accepted=m.inspect({limit:10}),native=f.objects.map(o=>[o.x,o.y,o.destroyed]);
 const reject=items=>{expect(()=>m.update({revision:2,context:f.context,items})).toThrow();expect(m.inspect({limit:10})).toEqual(accepted);expect(f.objects.map(o=>[o.x,o.y,o.destroyed])).toEqual(native);};
 reject([item('new'),item('another')]);reject([item('new'),item('new')]);
 reject([{...item('new'),tree:{...tree('new'),focusable:true}}]);reject([{...item('new'),tree:{...tree('new'),actionId:'game:act'}}]);reject([{...item('new'),tree:{...tree('new'),metadata:{'ui:stateOwner':'old'}}}]);reject([{...item('new'),tree:tree('wrong-root')}]);
 let reads=0;const bad={...tree('new')};Object.defineProperty(bad,'label',{enumerable:true,get(){reads++;return '???';}});reject([{...item('new'),tree:bad}]);expect(reads).toBe(0);
 const source=f.texture.source[0];f.texture.source[0]={};reject([item('new')]);f.texture.source[0]=source;
 m.update({revision:2,context:f.context,items:[item('new')]});expect(m.inspect({limit:10}).native.preparations).toBe(accepted.native.preparations);ui.dispose();
});

test('passive template lookup preserves exact optional values phase mapping and active-only lifetime',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f),item=(id,layout={width:24,height:8,wrap:false},x=4)=>({id,tree:u.text({id,label:'???',layout}),x,y:4});let revision=1,context=f.context;
 const m=ui.mountPassive({revision,context,items:[item('a')]},{parent:f.parent,scope:'test:template-boundaries'});let count=m.inspect({limit:10}).native.preparations;
 const update=(entry,extra=1)=>{m.update({revision:++revision,context,items:entry?[entry]:[]});count+=extra;expect(m.inspect({limit:10}).native.preparations).toBe(count);};
 update(item('b'),0);update(item('c',{width:24,height:8,wrap:false,x:0}));update(item('d',{width:24,height:8,wrap:false,x:-0}));update(item('e',{width:24,height:8,wrap:false,x:-0,overflow:undefined}));
 update(item('f',{width:24,height:8,wrap:false,x:-0,overflow:undefined},4.25));
 context={...context,revision:2,localToPhysical:{...context.localToPhysical,x:2}};update(item('g',{width:24,height:8,wrap:false,x:-0,overflow:undefined},4.25));
 update(null,0);update(item('h',{width:24,height:8,wrap:false,x:-0,overflow:undefined},4.25));ui.dispose();
});

test('passive non-template semantics fall back while stock shape order and contents remain exact',async()=>{
 const {createPhaserUi}=await api();
 for(const extra of [{metadata:{'test:id':'literal'}},{paneId:'literal'},{layout:{overflow:'scroll'}},{layout:{overflow:'paginate'}},{kind:'notice'},{kind:'panel'}]){
  const f=fixture(),ui=createPhaserUi(f);
  const make=id=>{const {kind,...props}=extra;return {id,tree:u.node(kind??'text',{id,label:'?',appearanceRole:'text',...props,layout:{width:24,height:8,...extra.layout}}),x:4,y:4};};
  const m=ui.mountPassive({revision:1,context:f.context,items:[make('old')]},{parent:f.parent,scope:'test:fallback'}),before=m.inspect({limit:10}).native.preparations;
  m.update({revision:2,context:f.context,items:[make('new')]});expect(m.inspect({limit:10}).native.preparations).toBe(before+1);ui.dispose();
 }
});

test('passive template swaps current colon IDs and changed shapes match independent stock geometry',async()=>{
 const {createPhaserUi}=await api(),a=fixture(),b=fixture(),ua=createPhaserUi(a),ub=createPhaserUi(b);
 const ink=f=>f.objects.filter(o=>o.visible&&!o.destroyed).map(o=>{const q=f.fragments.get(o.frame);return [o.kind,o.x,o.y,o.width,o.height,o.scaleX,o.scaleY,o.color,o.tint,o.alpha,o.depth,...o.crop??[],q?.cutX,q?.cutY,q?.width,q?.height];});
 const make=(id,label,x,extra={})=>({id,tree:u.absolute({id,layout:{width:24,height:9,padding:0,overflow:'clip'},children:[u.text({id:id+':child:literal',label,layout:{width:24,height:8,wrap:false},...extra})]}),x,y:4});
 let ma,mb,revision=0;
 const cases=[[make('id:0','?',-40),make('id:1','??',12)],[make('id:0','??',4),make('id:1','?',15)],[make('other:0','??',7),make('other:1','??',20)],[make('hidden','??',7,{hidden:true}),make('changed','???',20)]];
 for(const items of cases){const snap={revision:++revision,context:a.context,items},fresh={revision,context:b.context,tree:u.absolute({id:'fresh-root',layout:{width:100,height:60,padding:0,overflow:'clip'},children:items.map(i=>({...i.tree,layout:{...i.tree.layout,x:i.x,y:i.y}}))})};
  if(ma){ma.update(snap);mb.update(fresh);}else{ma=ua.mountPassive(snap,{parent:a.parent,scope:'test:swap'});mb=ub.mount(fresh,{parent:b.parent,scope:'test:fresh'});}
  expect(ink(a)).toEqual(ink(b));expect(ma.inspect({limit:20}).controls.map(r=>r.id)).toEqual(items.flatMap(i=>[i.id,i.id+':child:literal']));
  if(revision===3)expect(ma.inspect({limit:20}).native.preparations).toBe(2);
 }
 ua.dispose();ub.dispose();expect(a.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('passive oversized template shapes retain ordinary admission without unbounded fingerprints',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f),item=id=>({id,tree:u.text({id,role:'large-semantic-role-'.repeat(3000),label:'?',layout:{width:20,height:8}}),x:4,y:4});
 const m=ui.mountPassive({revision:1,context:f.context,items:[item('old')]},{parent:f.parent,scope:'test:bounded-shape'}),before=m.inspect({limit:2}).native.preparations;
 m.update({revision:2,context:f.context,items:[item('new')]});expect(m.inspect({limit:2})).toMatchObject({controls:[{id:'new'}],native:{preparations:before+1,objects:1}});ui.dispose();
});



// Draft stock-icon translation port: the same complete native mount remains
// authoritative. These structural assertions require independent native pixels.
function iconPlacementFixture() {
  const f=fixture();
  f.theme=defineTheme({version:1,id:'test:icon-placement',fonts:f.theme.fonts,icons:{
    arrow:{width:8,height:6,frame:{x:4,y:2,width:8,height:6}},
    other:{width:8,height:6,frame:{x:16,y:2,width:8,height:6}},
  },roles:{root:{},art:{font:'body',tone:'cream'},'art.chosen':{},label:{font:'body',tone:'cream'},button:{font:'body',tone:'cream',alternatives:[{kind:'flat',color:'#123456'}]},back:{alternatives:[{kind:'flat',color:'#123456'}]}},geometry:{gap:0,padding:0,minTarget:0}});
  f.icon=(x=4,y=4,extra={})=>u.icon({id:'arrow',appearanceRole:'art',asset:'arrow',...extra,layout:{x,y,width:8,height:6,...extra.layout}});
  f.snapshot=(revision=1,x=4,y=4,extra={})=>({revision,context:f.context,tree:u.absolute({id:'root',appearanceRole:'root',layout:{width:f.context.viewport.width,height:f.context.viewport.height,padding:0,overflow:'clip'},children:[
    u.panel({id:'below',appearanceRole:'back',layout:{x:0,y:0,width:30,height:20}}),f.icon(x,y,extra),
    u.text({id:'later',appearanceRole:'label',label:'?',layout:{x:5,y:5,width:10,height:8}}),
    button({id:'ok',label:'?',actionId:'original:ok',layout:{x:72,y:0,width:20,height:10}}),
  ]})});
  return f;
}
function iconPlacementInk(f) {
  return f.objects.filter(o=>o.visible&&!o.destroyed).sort((a,b)=>a.depth-b.depth).map(o=>{
    const frame=f.fragments.get(o.frame),round=n=>typeof n==='number'?Math.round(n*1e8)/1e8:n;
    return [o.kind,o.x,o.y,o.width,o.height,o.scaleX,o.scaleY,o.color,o.tint,o.alpha,o.depth,...o.crop??[],frame?.cutX,frame?.cutY,frame?.width,frame?.height].map(round);
  });
}

test('placeIcons matches fresh stock geometry across clipping fractional phase and translated contexts',async()=>{
  const {createPhaserUi}=await api();
  for(const scale of [1,2,3]){
    const a=iconPlacementFixture(),b=iconPlacementFixture();
    for(const f of [a,b])f.context={...f.context,localToPhysical:{scale,x:11,y:7},sourcePixelPhysicalSize:2,viewport:{x:3,y:2,width:100,height:60}};
    let requests=[];const resolve=a.ports.resolveAsset;a.ports.resolveAsset=request=>{requests.push([request.kind,request.id]);return resolve(request);};
    const ua=createPhaserUi(a),ub=createPhaserUi(b),ma=ua.mount(a.snapshot(1,-40,4),{parent:a.parent,scope:'test:placed-geometry'}),mb=ub.mount(b.snapshot(1,-40,4),{parent:b.parent,scope:'test:fresh-geometry'});
    expect(typeof ma.placeIcons).toBe('function');let revision=1;
    for(const [x,y]of [[-2,4],[4,4],[7.25,4],[96,57],[-40,4],[4.5,4.25],[4,4]]){
      requests=[];ma.placeIcons({expectedRevision:revision,revision:revision+1,items:[{id:'arrow',x,y}]});revision++;
      expect(requests).toEqual([['icon','arrow']]);
      mb.update(b.snapshot(revision,x,y));
      expect(ma.inspect({limit:20}).controls).toEqual(mb.inspect({limit:20}).controls);
      expect(iconPlacementInk(a),JSON.stringify({scale,x,y})).toEqual(iconPlacementInk(b));
      // Appearance selection after normalized input cannot restore old positions.
      ma.handle({type:'hover',point:{x:180,y:110},pointSpace:'physical'});
      mb.handle({type:'hover',point:{x:180,y:110},pointSpace:'physical'});
      expect(iconPlacementInk(a)).toEqual(iconPlacementInk(b));
    }
    ua.dispose();ub.dispose();expect(a.fragments.size).toBe(0);expect(a.texture.frameTotal).toBe(1);
  }
});

test('placeIcons rejects compact raw forgeries and stale revisions before changing the accepted hold',async()=>{
  const {createPhaserUi}=await api(),f=iconPlacementFixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:placed-atomic',policy:{retainUnchangedPresses:true}});
  expect(typeof m.placeIcons).toBe('function');
  m.handle({type:'press',inputId:'held',point:{x:148,y:4},pointSpace:'physical'});
  const accepted=m.inspect({limit:20}),ink=iconPlacementInk(f),request={expectedRevision:1,revision:2,items:[{id:'arrow',x:12,y:8}]};
  const reject=raw=>{expect(()=>m.placeIcons(raw)).toThrow();expect(m.inspect({limit:20})).toEqual(accepted);expect(iconPlacementInk(f)).toEqual(ink);};
  for(const raw of [
    {...request,expectedRevision:0},{...request,revision:1},{...request,revision:NaN},{...request,revision:2.5},
    {...request,unknown:true},{...request,items:[{...request.items[0],asset:'other'}]},
    {...request,items:[request.items[0],request.items[0]]},{...request,items:[{id:'missing',x:0,y:0}]},
    {...request,items:[{id:'ok',x:0,y:0}]},{...request,items:[{id:'arrow',x:Infinity,y:0}]},
    {...request,items:[{id:'arrow',x:0,y:0},{id:'missing',x:0,y:0}]},
  ])reject(raw);
  let reads=0;const item={id:'arrow',y:0};Object.defineProperty(item,'x',{enumerable:true,get(){reads++;return 0;}});reject({...request,items:[item]});expect(reads).toBe(0);
  const inherited=Object.create({x:12});inherited.id='arrow';inherited.y=8;reject({...request,items:[inherited]});
  const symbol={...request};symbol[Symbol('authority')]=1;reject(symbol);
  m.placeIcons(request);request.items[0].x=999;
  expect(Object.isFrozen(request.items)).toBe(false);expect(Object.isFrozen(request.items[0])).toBe(false);
  expect(m.inspect({limit:20})).toMatchObject({modelRevision:2,heldCount:1});
  expect(m.inspect({limit:20}).controls.find(r=>r.id==='arrow').bounds.x).toBe(12);
  expect(m.handle({type:'release',inputId:'held',point:{x:148,y:4},pointSpace:'physical'})).toMatchObject([{actionId:'original:ok',modelRevision:2}]);
  ui.dispose();
});

test('placeIcons refuses icon authority descendants and unsupported absolute-root arrangements',async()=>{
  const {createPhaserUi}=await api();
  const cases=[
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,focusable:true}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,actionId:'game:bad'}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,focus:{}}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,regions:{hit:{x:0,y:0,width:1,height:1}}}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,metadata:{'app:note':'not placement'}}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,label:'?'}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,children:[u.text({id:'icon-child',appearanceRole:'label',label:'?'})]}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,selected:false}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,hidden:false}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,variant:'chosen'}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.validateUiTree({...n,layout:{...n.layout,padding:0}}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,children:s.tree.children.map(n=>n.id==='arrow'?u.absolute({id:'nested',appearanceRole:'root',children:[n]}):n)})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,layout:{...s.tree.layout,x:1}})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,layout:{...s.tree.layout,padding:1}})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,layout:{...s.tree.layout,scrollX:1}})}),
    s=>({...s,tree:u.validateUiTree({...s.tree,layout:{...s.tree.layout,width:99}})}),
  ];
  for(const alter of cases){
    const f=iconPlacementFixture(),ui=createPhaserUi(f),m=ui.mount(alter(f.snapshot()),{parent:f.parent,scope:'test:placed-ineligible'});
    expect(typeof m.placeIcons).toBe('function');const accepted=m.inspect({limit:20}),ink=iconPlacementInk(f);
    expect(()=>m.placeIcons({expectedRevision:1,revision:2,items:[{id:'arrow',x:12,y:8}]})).toThrow();
    expect(m.inspect({limit:20})).toEqual(accepted);expect(iconPlacementInk(f)).toEqual(ink);ui.dispose();
  }
});

test('placeIcons validates untouched compiled source identity before pure acceptance',async()=>{
  const {createPhaserUi}=await api(),f=iconPlacementFixture(),art={...f.texture,key:'art',source:[{}]};
  f.ports.resolveAsset=r=>({ownership:'borrowed',texture:r.kind==='icon'?art:f.texture});
  const ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:placed-stale-source'});
  expect(typeof m.placeIcons).toBe('function');const accepted=m.inspect({limit:20}),ink=iconPlacementInk(f),source=f.texture.source[0];
  f.texture.source[0]={};
  expect(()=>m.placeIcons({expectedRevision:1,revision:2,items:[{id:'arrow',x:12,y:8}]})).toThrow(/source|stale/i);
  expect(m.inspect({limit:20})).toEqual(accepted);expect(iconPlacementInk(f)).toEqual(ink);f.texture.source[0]=source;ui.dispose();
});

test('placeIcons captures Proxy descriptors without semantic gets',async()=>{
  const {createPhaserUi}=await api(),f=iconPlacementFixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:placed-raw-proxy'});
  expect(typeof m.placeIcons).toBe('function');let gets=0,descriptors=0;
  const raw={id:'arrow',x:14,y:8},item=new Proxy(raw,{get(){gets++;throw Error('raw Proxy semantic get');},getOwnPropertyDescriptor(target,key){descriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}});
  m.placeIcons({expectedRevision:1,revision:2,items:[item]});
  expect(gets).toBe(0);expect(descriptors).toBeGreaterThan(0);
  raw.x=99;expect(m.inspect({limit:20}).controls.find(r=>r.id==='arrow').bounds.x).toBe(14);ui.dispose();
});

test('placeIcons preserves accepted state when the existing full-layout quantizer rejects an inherited setter',async()=>{
  const {createPhaserUi}=await api(),a=iconPlacementFixture(),b=iconPlacementFixture(),ua=createPhaserUi(a),ub=createPhaserUi(b),ma=ua.mount(a.snapshot(),{parent:a.parent,scope:'test:placed-setter',policy:{retainUnchangedPresses:true}}),mb=ub.mount(b.snapshot(),{parent:b.parent,scope:'test:full-setter',policy:{retainUnchangedPresses:true}});
  expect(typeof ma.placeIcons).toBe('function');
  for(const mount of [ma,mb])mount.handle({type:'press',inputId:'held',point:{x:148,y:4},pointSpace:'physical'});
  const acceptedA=ma.inspect({limit:20}),acceptedB=mb.inspect({limit:20}),inkA=iconPlacementInk(a),inkB=iconPlacementInk(b),fullNext=b.snapshot(2,14,8),prior=Object.getOwnPropertyDescriptor(Object.prototype,'x');let setters=0;
  try{
    Object.defineProperty(Object.prototype,'x',{configurable:true,set(){setters++;}});
    expect(()=>mb.update(fullNext)).toThrow(/finite/i);
    expect(()=>ma.placeIcons({expectedRevision:1,revision:2,items:[{id:'arrow',x:14,y:8}]})).toThrow(/finite/i);
  }finally{if(prior)Object.defineProperty(Object.prototype,'x',prior);else delete Object.prototype.x;}
  expect(setters).toBeGreaterThanOrEqual(2);expect(ma.inspect({limit:20})).toEqual(acceptedA);expect(mb.inspect({limit:20})).toEqual(acceptedB);
  expect(iconPlacementInk(a)).toEqual(inkA);expect(iconPlacementInk(b)).toEqual(inkB);
  ma.placeIcons({expectedRevision:1,revision:2,items:[{id:'arrow',x:14,y:8}]});mb.update(fullNext);
  expect(iconPlacementInk(a)).toEqual(iconPlacementInk(b));expect(ma.inspect({limit:20}).heldCount).toBe(1);ua.dispose();ub.dispose();
});

test('placeIcons reserves aggregate visible objects and distinct fragments before admitting newly visible icons',async()=>{
  const {createPhaserUi}=await api();
  for(const limits of [{objects:1},{fragments:1}]){
    const f=iconPlacementFixture(),ui=createPhaserUi({...f,limits}),tree=u.absolute({id:'root',appearanceRole:'root',layout:{width:100,height:60,padding:0,overflow:'clip'},children:[f.icon(),u.icon({id:'entering',appearanceRole:'art',asset:'other',layout:{x:-40,y:4,width:8,height:6}})]}),m=ui.mount({revision:1,context:f.context,tree},{parent:f.parent,scope:'test:placed-budget'});
    expect(typeof m.placeIcons).toBe('function');const accepted=m.inspect({limit:20}),ink=iconPlacementInk(f);
    expect(()=>m.placeIcons({expectedRevision:1,revision:2,items:[{id:'entering',x:20,y:4}]})).toThrow(/budget/i);
    expect(m.inspect({limit:20})).toEqual(accepted);expect(iconPlacementInk(f)).toEqual(ink);ui.dispose();
  }
});

test('placeIcons full updates reset placement state while native faults retire the complete mount',async()=>{
  const {createPhaserUi}=await api(),f=iconPlacementFixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:placed-lifetime'});
  expect(typeof m.placeIcons).toBe('function');
  m.placeIcons({expectedRevision:1,revision:2,items:[{id:'arrow',x:12,y:8}]});
  m.update(f.snapshot(3,30,20,{asset:'other'}));
  expect(()=>m.placeIcons({expectedRevision:2,revision:4,items:[{id:'arrow',x:8,y:8}]})).toThrow();
  m.placeIcons({expectedRevision:3,revision:4,items:[{id:'arrow',x:35,y:21}]});
  expect(m.inspect({limit:20}).controls.find(r=>r.id==='arrow').bounds).toMatchObject({x:35,y:21});
  const image=f.objects.find(o=>o.kind==='image'&&!o.destroyed);image.setPosition=()=>{throw Error('placed native position fault');};
  expect(()=>m.placeIcons({expectedRevision:4,revision:5,items:[{id:'arrow',x:36,y:22}]})).toThrow(/placed native position fault/);
  expect(m.inspect({limit:20}).native).toMatchObject({lifecycle:'retired',objects:0,fragments:0,attachments:0});
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.texture.frameTotal).toBe(1);
  expect(()=>m.placeIcons({expectedRevision:5,revision:6,items:[]})).toThrow(/retired|disposed/i);ui.dispose();
});

test('placeIcons rejects a stale base when an asset port accepts a newer full publication during preparation',async()=>{
  const {createPhaserUi}=await api(),f=iconPlacementFixture(),resolve=f.ports.resolveAsset;let m,entered=false;
  f.ports.resolveAsset=request=>{if(m&&request.kind==='icon'&&!entered){entered=true;m.update(f.snapshot(3,40,20));}return resolve(request);};
  const ui=createPhaserUi(f);m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:placed-reentrant',policy:{retainUnchangedPresses:true}});
  m.handle({type:'press',inputId:'held',point:{x:148,y:4},pointSpace:'physical'});
  expect(()=>m.placeIcons({expectedRevision:1,revision:4,items:[{id:'arrow',x:14,y:8}]})).toThrow(/stale|changed|reentrant/i);
  expect(entered).toBe(true);expect(m.inspect({limit:20})).toMatchObject({modelRevision:3,heldCount:1,native:{lifecycle:'mounted'}});
  expect(m.inspect({limit:20}).controls.find(r=>r.id==='arrow').bounds).toMatchObject({x:40,y:20});
  m.placeIcons({expectedRevision:3,revision:4,items:[{id:'arrow',x:14,y:8}]});
  expect(m.inspect({limit:20}).controls.find(r=>r.id==='arrow').bounds).toMatchObject({x:14,y:8});ui.dispose();
});


test('certified plan sharing avoids native republication across stock appearance states',async()=>{
  const {createPhaserUi}=await api(),f=fixture();
  f.theme=defineTheme({version:1,id:'test:shared-stock',fonts:f.theme.fonts,roles:{button:{font:'body',tone:'cream',placement:{nativeStates:{pressed:{opacity:.5}}}}}});
  const plans=[],ui=createPhaserUi(f);nativePlanObservation.observe=value=>{if(value?.format==='agent-sprites/ui-layout@1')plans.push(value);};
  try{
    const m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:shared-stock'});
    expect(plans).toHaveLength(1);expect(Object.isFrozen(plans[0])).toBe(true);
    const old=plans[0];plans.length=0;m.update(f.snapshot(2,'??'));
    expect(plans).toHaveLength(1);expect(plans[0]).not.toBe(old);expect(old.revision).toBe(1);
    expect(m.handle({type:'activate',controlId:'ok',inputId:'shared'})).toHaveLength(1);
  }finally{nativePlanObservation.observe=null;ui.dispose();}
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test.each([false,true])('certified plan sharing keeps extension callbacks with empty regions=%s',async explicit=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);let calls=0,mounts=0;const plans=[];
  ui.registerExtension('test:empty',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:10},overflow:'clip'}),...(explicit?{regions(){calls++;return [];}}:{}),mount(){mounts++;}});
  const snapshot={revision:1,context:f.context,tree:u.extension({id:'empty',extensionId:'test:empty',model:{value:1},layout:{width:20,height:10}})};
  nativePlanObservation.observe=value=>{if(value?.format==='agent-sprites/ui-layout@1')plans.push(value);};
  try{ui.mount(snapshot,{parent:f.parent,scope:'test:shared-empty'});expect(plans).toHaveLength(1);expect(calls).toBe(explicit?2:0);expect(mounts).toBe(1);}finally{nativePlanObservation.observe=null;ui.dispose();}
});

test('certified plan sharing copies inserted region records and preserves rejection and reentrant layouts',async()=>{
  const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f);const plans=[];let nested=0,calls=0;
  ui.registerExtension('test:regions',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:40,height:10},overflow:'clip'}),regions(model,a){
    calls++;const independent=layoutUi(f.snapshot(9).tree,{revision:9,context:f.context,theme:f.theme});expect(independent.records[0].id).toBe('ok');nested++;
    return [{id:'one',bounds:{...a.bounds,width:20},actionId:'game:one',focusable:true},{id:model.bad?'one':'two',bounds:{...a.bounds,x:a.bounds.x+20,width:20},actionId:'game:two',focusable:true}];
  },mount(){}});
  const snapshot=(revision,bad=false)=>({revision,context:f.context,tree:u.absolute({id:'root',children:[u.extension({id:'ext',extensionId:'test:regions',model:{bad},layout:{width:40,height:10}}),u.button({id:'tail',layout:{y:20,width:20,height:10}})]})});
  nativePlanObservation.observe=value=>{if(value?.format==='agent-sprites/ui-layout@1'&&value.records[0].id==='root')plans.push(value);};
  try{
    const m=ui.mount(snapshot(1),{parent:f.parent,scope:'test:shared-regions'});
    expect(plans).toHaveLength(2);const [original,expanded]=plans;
    expect(expanded).not.toBe(original);expect(expanded.records).not.toBe(original.records);expect(expanded.records.map(r=>r.id)).toEqual(['root','ext','ext:one','ext:two','tail']);
    expect(expanded.records[0]).toBe(original.records[0]);expect(expanded.records.at(-1)).toBe(original.records.at(-1));expect(original.records.map(r=>r.id)).toEqual(['root','ext','tail']);
    m.handle({type:'press',inputId:'held',point:{x:4,y:4},pointSpace:'physical'});const before=m.inspect({limit:10});
    expect(()=>m.update(snapshot(2,true))).toThrow(/Duplicate extension/);
    expect(m.inspect({limit:10})).toEqual(before);expect(original.records).toHaveLength(3);
    expect(m.handle({type:'release',inputId:'held',point:{x:4,y:4},pointSpace:'physical'})).toMatchObject([{actionId:'game:one'}]);
    expect(calls).toBe(4);expect(nested).toBe(calls);
  }finally{nativePlanObservation.observe=null;ui.dispose();}
  expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});


// Reconciliation paint-order regression: these inspect faithful Container list order,
// not the fake object's depth field. Native pixels remain a separate owner.
function orderFixture(){const f=fixture();f.stockOrdering='isolated';f.theme=defineTheme({version:1,id:'test:paint-order',roles:{root:{},a:{alternatives:[{kind:'flat',color:'#aa0000'}]},b:{alternatives:[{kind:'flat',color:'#00bb00'}]},c:{alternatives:[{kind:'flat',color:'#0000cc'}]},extension:{}}});return f;}
function orderSnapshot(f,ids,revision=1,contexts={}){return{revision,context:f.context,...(contexts.additionalContexts?{additionalContexts:contexts.additionalContexts}:{}),tree:u.absolute({id:'root',appearanceRole:'root',layout:{width:80,height:40},children:ids.map(id=>u.panel({id,appearanceRole:id,...(contexts[id]?{contextId:contexts[id]}:{}),layout:{x:2,y:2,width:20,height:12}}))})};}
test('retained stock insertion reorder and removal match a fresh Container paint order',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:paint-order'}),original=[...f.objects];
 for(const [i,ids]of [['a','b','c'],['c','b','a'],['b','a'],['a','c','b']].entries()){
  m.update(orderSnapshot(f,ids,i+2));const fresh=orderFixture(),other=createPhaserUi(fresh);other.mount(orderSnapshot(fresh,ids),{parent:fresh.parent,scope:'test:fresh-order'});expect(paintedOrder(f.parent)).toEqual(paintedOrder(fresh.parent));other.dispose();
 }
 expect(original.find(o=>o.color===0xaa0000).destroyed).toBe(0);m.dispose();ui.dispose();expect(f.parent.list).toEqual([]);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.parent.destroyed).toBe(0);
});
test('private stock order preserves borrowed foreign siblings and another mount',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();const foreign=f.scene.add.rectangle().setFillStyle(0xdddddd).setVisible(true);f.parent.add(foreign);const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:first-owner'});const other=ui.mount(orderSnapshot(f,['b']),{parent:f.parent,scope:'test:second-owner'});
 const overlay=f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true);f.parent.add(overlay);m.update(orderSnapshot(f,['c','b','a'],2));expect(paintedOrder(f.parent)).toEqual([0xdddddd,0x0000cc,0x00bb00,0xaa0000,0x00bb00,0xeeeeee]);m.dispose();expect(paintedOrder(f.parent)).toEqual([0xdddddd,0x00bb00,0xeeeeee]);other.dispose();ui.dispose();expect(f.parent.list).toEqual([foreign,overlay]);expect(foreign.destroyed).toBe(0);expect(overlay.destroyed).toBe(0);expect(f.parent.destroyed).toBe(0);
});
test.each([false,true])('retained extension sibling remains %s underStock across new stock insertion',async underStock=>{
 const {createPhaserUi}=await api(),f=orderFixture();let created=0,marker;f.ports.extensionFacade=(_request,owner)=>({paint(){created++;marker=owner.own(f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true),o=>o.destroy());f.parent.add(marker);if(underStock)f.parent.sendToBack(marker);}});const ui=createPhaserUi(f);ui.registerExtension('test:layer',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:12},overflow:'clip'}),mount(_m,_a,scope){scope.native.paint();}});
 const snap=(ids,revision)=>{const s=orderSnapshot(f,ids,revision);s.tree={...s.tree,children:[...s.tree.children,u.extension({id:'extension',appearanceRole:'extension',extensionId:'test:layer',model:{stable:true},layout:{width:20,height:12}})]};return s;};const m=ui.mount(snap(['a','c'],1),{parent:f.parent,scope:'test:extension-order'}),first=marker;m.update(snap(['a','b','c'],2));expect(created).toBe(1);expect(marker).toBe(first);expect(paintedOrder(f.parent)).toEqual(underStock?[0xeeeeee,0xaa0000,0x00bb00,0x0000cc]:[0xaa0000,0x00bb00,0x0000cc,0xeeeeee]);m.dispose();ui.dispose();expect(marker.destroyed).toBe(1);expect(f.parent.list).toEqual([]);
});
test('contexts sharing one borrowed parent retain one interleaved stock paint sequence',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),second={...f.context,id:'test:second'},mapping={b:second.id,additionalContexts:[second]},ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c'],1,mapping),{parent:f.parent,scope:'test:aliased-parent'});m.update(orderSnapshot(f,['a','b','c'],2,mapping));expect(paintedOrder(f.parent)).toEqual([0xaa0000,0x00bb00,0x0000cc]);m.update(orderSnapshot(f,['b','c','a'],3,mapping));expect(paintedOrder(f.parent)).toEqual([0x00bb00,0x0000cc,0xaa0000]);m.dispose();expect(f.parent.list).toEqual([]);expect(f.parent.destroyed).toBe(0);ui.dispose();
});
test('owned context parent and private stock resources release exactly once',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();let releases=0;f.ports.attachContext=()=>({ownership:'owned',parent:f.parent,release(){releases++;f.parent.destroy();}});const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:owned-order'});m.update(orderSnapshot(f,['a','b','c'],2));m.dispose();m.dispose();ui.dispose();expect(releases).toBe(1);expect(f.parent.destroyed).toBe(1);expect(f.parent.list).toEqual([]);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.containers.every(c=>c.destroyed===1)).toBe(true);
});

test('default direct stock attachment preserves legacy adapter calls and creates no groups',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();delete f.stockOrdering;delete f.scene.add.container;const attached=[];f.ports.attachContext=()=>({ownership:'borrowed',parent:{add(object){attached.push(object);f.parent.add(object);}}});
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:legacy-direct'});m.update(orderSnapshot(f,['a','b','c'],2));
 expect(f.containers).toHaveLength(0);expect(attached).toEqual(f.objects);expect(paintedOrder(f.parent)).toEqual([0xaa0000,0x0000cc,0x00bb00]);m.dispose();ui.dispose();expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('isolated stock ordering requires container creation without changing default direct capability',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();delete f.scene.add.container;
 expect(()=>{const ui=createPhaserUi(f);try{ui.mount(orderSnapshot(f,['a']),{parent:f.parent,scope:'test:missing-group'});}finally{ui.dispose();}}).toThrow(/container|isolated|group/i);
 expect(f.objects).toHaveLength(0);expect(f.parent.list).toEqual([]);
});

test('refcounted owned context aliases preserve per-lease release timing and destroy group before final parent',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),second={...f.context,id:'test:owned-alias'},mapping={b:second.id,additionalContexts:[second]};let refs=0;const released=[];
 f.ports.attachContext=({context})=>{refs++;return{ownership:'owned',parent:f.parent,release(){released.push(context.id);if(--refs===0){expect(f.parent.list).toEqual([]);f.parent.destroy();}}};};
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','b','c'],1,mapping),{parent:f.parent,scope:'test:owned-aliases'});
 expect(refs).toBe(2);expect(f.containers).toHaveLength(1);const group=f.containers[0];
 m.update(orderSnapshot(f,['c','a'],2));expect(released).toEqual([second.id]);expect(refs).toBe(1);expect(group.destroyed).toBe(0);expect(f.parent.destroyed).toBe(0);expect(paintedOrder(f.parent)).toEqual([0x0000cc,0xaa0000]);
 m.dispose();m.dispose();ui.dispose();expect(released).toEqual([second.id,f.context.id]);expect(refs).toBe(0);expect(group.destroyed).toBe(1);expect(f.parent.destroyed).toBe(1);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);
});

test('borrowed context replacement retains private group identity and foreign sibling slot',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:replacement-slot'});
 const group=f.containers[0],overlay=f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true);f.parent.add(overlay);
 const next=orderSnapshot(f,['c','b','a'],2);next.context={...f.context,revision:2,viewport:{...f.context.viewport,width:101}};m.update(next);
 expect(f.containers).toHaveLength(1);expect(f.parent.list).toEqual([group,overlay]);expect(group.destroyed).toBe(0);expect(paintedOrder(f.parent)).toEqual([0x0000cc,0x00bb00,0xaa0000,0xeeeeee]);
 m.dispose();ui.dispose();expect(group.destroyed).toBe(1);expect(f.parent.list).toEqual([overlay]);expect(overlay.destroyed).toBe(0);expect(f.parent.destroyed).toBe(0);
});

test('isolated stock sort failure retires and drains stock group before owned parent',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();let releases=0;f.ports.attachContext=()=>({ownership:'owned',parent:f.parent,release(){releases++;expect(f.parent.list).toEqual([]);f.parent.destroy();}});
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:sort-failure'}),group=f.containers[0];group.sort=()=>{throw Error('private sort failed');};
 expect(()=>m.update(orderSnapshot(f,['c','b','a'],2))).toThrow(/private sort failed/);expect(m.inspect({limit:1}).native.lifecycle).toBe('retired');expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(group.destroyed).toBe(1);expect(releases).toBe(1);expect(f.parent.destroyed).toBe(1);m.dispose();ui.dispose();expect(releases).toBe(1);
});

test('isolated stock partially successful group add failure drains every created object once',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),make=f.scene.add.container;f.scene.add.container=(...args)=>{const group=make(...args),add=group.add;group.add=function(object){add.call(this,object);throw Error('private add failed');};return group;};
 const ui=createPhaserUi(f);expect(()=>ui.mount(orderSnapshot(f,['a']),{parent:f.parent,scope:'test:add-failure'})).toThrow(/private add failed/);ui.dispose();expect(f.objects.length).toBeGreaterThan(0);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.containers.every(c=>c.destroyed===1)).toBe(true);expect(f.parent.list).toEqual([]);expect(f.parent.destroyed).toBe(0);expect(f.scene.events.listenerCount('shutdown')).toBe(0);
});

test('isolated context replacement retires extension and stock before releasing each owned parent',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),parents=[],markers=[],releases=[];let current;
 f.ports.attachContext=({context})=>{const parent=fakeContainer();parents.push(parent);current=parent;return{ownership:'owned',parent,release(){expect(parent.list).toEqual([]);releases.push(context.revision);parent.destroy();}};};
 f.ports.extensionFacade=(_request,owner)=>({paint(){const marker=owner.own(f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true),o=>o.destroy());markers.push(marker);current.add(marker);}});
 const ui=createPhaserUi(f);ui.registerExtension('test:replacement-extension',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:12},overflow:'clip'}),mount(_m,_a,scope){scope.native.paint();}});
 const snap=revision=>{const s=orderSnapshot(f,['a','c'],revision);s.context={...f.context,revision,viewport:{...f.context.viewport,width:100+revision}};s.tree={...s.tree,children:[...s.tree.children,u.extension({id:'extension',appearanceRole:'extension',extensionId:'test:replacement-extension',model:{stable:true},layout:{width:20,height:12}})]};return s;};
 const m=ui.mount(snap(1),{parent:f.parent,scope:'test:owned-extension-replacement'});m.update(snap(2));expect(releases).toEqual([1]);expect(markers).toHaveLength(2);expect(markers[0].destroyed).toBe(1);expect(markers[1].destroyed).toBe(0);expect(parents[0].destroyed).toBe(1);expect(paintedOrder(parents[1])).toEqual([0xaa0000,0x0000cc,0xeeeeee]);
 m.dispose();ui.dispose();expect(releases).toEqual([1,2]);expect(markers.every(o=>o.destroyed===1)).toBe(true);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(f.containers.every(c=>c.destroyed===1)).toBe(true);expect(parents.every(p=>p.destroyed===1)).toBe(true);
});

test('default direct observations do not expose isolated stock group counts',async()=>{
 const {createPhaserUi}=await api(),f=fixture(),ui=createPhaserUi(f),m=ui.mount(f.snapshot(),{parent:f.parent,scope:'test:direct-observation'});
 expect(Object.hasOwn(m.inspect({limit:1}).native,'stockGroups')).toBe(false);m.dispose();expect(Object.hasOwn(m.inspect({limit:1}).native,'stockGroups')).toBe(false);ui.dispose();
});

test('isolated group budget counts one actual parent for aliased contexts and reports zero after disposal',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),second={...f.context,id:'test:budget-alias'},mapping={b:second.id,additionalContexts:[second]};f.limits={stockGroups:1};
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','b','c'],1,mapping),{parent:f.parent,scope:'test:group-budget-alias'});
 expect(m.inspect({limit:1}).native.stockGroups).toBe(1);expect(f.containers).toHaveLength(1);m.dispose();expect(m.inspect({limit:1}).native.stockGroups).toBe(0);expect(f.containers[0].destroyed).toBe(1);expect(f.parent.destroyed).toBe(0);ui.dispose();
});

test('isolated distinct parent group budget refuses before stock allocation and drains only private groups',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),other=fakeContainer(),second={...f.context,id:'test:budget-other'},mapping={b:second.id,additionalContexts:[second]};f.limits={stockGroups:1};
 f.ports.attachContext=({context})=>({ownership:'borrowed',parent:context.id===second.id?other:f.parent});const ui=createPhaserUi(f);
 expect(()=>ui.mount(orderSnapshot(f,['a','b'],1,mapping),{parent:f.parent,scope:'test:group-budget-distinct'})).toThrow(/group.*budget|budget.*group/i);
 expect(f.objects).toHaveLength(0);expect(f.containers.length).toBeLessThanOrEqual(1);expect(f.containers.every(c=>c.destroyed===1)).toBe(true);expect(f.parent.list).toEqual([]);expect(other.list).toEqual([]);expect(f.parent.destroyed).toBe(0);expect(other.destroyed).toBe(0);expect(f.scene.events.listenerCount('shutdown')).toBe(0);ui.dispose();
});

test('isolated empty stock reserves its slot below a retained extension before new stock appears',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();let marker,mounted=0;f.ports.extensionFacade=(_request,owner)=>({paint(){mounted++;marker=owner.own(f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true),o=>o.destroy());f.parent.add(marker);}});
 const ui=createPhaserUi(f);ui.registerExtension('test:empty-overlay',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:12},overflow:'clip'}),mount(_model,_allocation,scope){scope.native.paint();}});
 const snap=(ids,revision)=>{const s=orderSnapshot(f,ids,revision);s.tree={...s.tree,children:[...s.tree.children,u.extension({id:'extension',appearanceRole:'extension',extensionId:'test:empty-overlay',model:{stable:true},layout:{width:20,height:12}})]};return s;};
 const m=ui.mount(snap([],1),{parent:f.parent,scope:'test:empty-stock-slot'});expect(f.containers).toHaveLength(1);const group=f.containers[0],original=marker;expect(f.parent.list).toEqual([group,marker]);expect(paintedOrder(f.parent)).toEqual([0xeeeeee]);
 m.update(snap(['a','c'],2));expect(mounted).toBe(1);expect(marker).toBe(original);expect(f.parent.list).toEqual([group,marker]);expect(paintedOrder(f.parent)).toEqual([0xaa0000,0x0000cc,0xeeeeee]);m.dispose();ui.dispose();expect(marker.destroyed).toBe(1);expect(group.destroyed).toBe(1);expect(f.parent.list).toEqual([]);
});

test('isolated extension retires before its secondary context revision attachment releases',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),secondaryId='test:extension-secondary',released=[],markers=[],secondaryParents=[];let latest;
 f.ports.attachContext=({context})=>{if(context.id!==secondaryId)return{ownership:'borrowed',parent:f.parent};const parent=fakeContainer();secondaryParents.push(parent);return{ownership:'owned',parent,release(){expect(latest.destroyed).toBe(1);expect(parent.list).toEqual([]);released.push(context.revision);parent.destroy();}};};
 f.ports.extensionFacade=({allocation},owner)=>{expect(allocation.context.id).toBe(f.context.id);expect(allocation.contextRevisions[secondaryId]).toBeDefined();return{paint(){latest=owner.own(f.scene.add.rectangle().setFillStyle(0xeeeeee).setVisible(true),o=>o.destroy());markers.push(latest);f.parent.add(latest);}};};
 const ui=createPhaserUi(f);ui.registerExtension('test:secondary-dependent',{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:20,height:12},overflow:'clip'}),mount(_model,_allocation,scope){scope.native.paint();}});
 const snap=revision=>({revision,context:f.context,additionalContexts:[{...f.context,id:secondaryId,revision}],tree:u.absolute({id:'root',appearanceRole:'root',layout:{width:80,height:40},children:[u.extension({id:'extension',appearanceRole:'extension',skinContextId:secondaryId,extensionId:'test:secondary-dependent',model:{stable:true},layout:{width:20,height:12}})]})});
 const m=ui.mount(snap(1),{parent:f.parent,scope:'test:secondary-extension-retirement'});m.update(snap(2));expect(released).toEqual([1]);expect(markers).toHaveLength(2);expect(markers[0].destroyed).toBe(1);expect(markers[1].destroyed).toBe(0);expect(secondaryParents[0].destroyed).toBe(1);
 m.dispose();ui.dispose();expect(released).toEqual([1,2]);expect(markers.every(o=>o.destroyed===1)).toBe(true);expect(secondaryParents.every(p=>p.destroyed===1)).toBe(true);expect(f.parent.destroyed).toBe(0);expect(f.parent.list).toEqual([]);
});

test('isolated group budget one permits borrowed parent replacement without counting obsolete placeholder',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture(),nextParent=fakeContainer();f.limits={stockGroups:1};f.ports.attachContext=({context})=>({ownership:'borrowed',parent:context.revision===1?f.parent:nextParent});
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','c']),{parent:f.parent,scope:'test:replacement-budget'}),oldGroup=f.containers[0];
 const next=orderSnapshot(f,['c','b','a'],2);next.context={...f.context,revision:2};expect(()=>m.update(next)).not.toThrow();
 expect(m.inspect({limit:1}).native.lifecycle).toBe('mounted');expect(m.inspect({limit:1}).native.stockGroups).toBe(1);expect(oldGroup.destroyed).toBe(1);expect(f.parent.list).toEqual([]);expect(paintedOrder(nextParent)).toEqual([0x0000cc,0x00bb00,0xaa0000]);expect(f.containers).toHaveLength(2);expect(f.parent.destroyed).toBe(0);expect(nextParent.destroyed).toBe(0);
 m.dispose();ui.dispose();expect(m.inspect({limit:1}).native.stockGroups).toBe(0);expect(nextParent.list).toEqual([]);expect(f.containers.every(c=>c.destroyed===1)).toBe(true);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(nextParent.destroyed).toBe(0);
});

test('isolated cleanup never retries a stock destructor that throws before detaching from its group',async()=>{
 const {createPhaserUi}=await api(),f=orderFixture();let leases=0;f.ports.attachContext=()=>({ownership:'owned',parent:f.parent,release(){leases++;expect(f.parent.list).toEqual([]);f.parent.destroy();}});
 const ui=createPhaserUi(f),m=ui.mount(orderSnapshot(f,['a','b','c']),{parent:f.parent,scope:'test:throwing-stock-cleanup'}),group=f.containers[0],bad=f.objects.find(o=>o.color===0x00bb00);
 bad.destroy=()=>{bad.destroyed++;throw Error('stock destructor failed before detach');};
 expect(()=>m.dispose()).toThrow(/cleanup/i);expect(bad.destroyed).toBe(1);expect(f.objects.every(o=>o.destroyed===1)).toBe(true);expect(group.destroyed).toBe(1);expect(group.list).toEqual([]);expect(f.parent.list).toEqual([]);expect(leases).toBe(1);expect(f.parent.destroyed).toBe(1);expect(m.inspect({limit:1}).native.cleanupFailures.join(' ')).toMatch(/stock destructor failed before detach/);
 m.dispose();ui.dispose();expect(bad.destroyed).toBe(1);expect(leases).toBe(1);
});
