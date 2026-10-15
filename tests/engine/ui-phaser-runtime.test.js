import {test, expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {existsSync} from 'node:fs';
import {normalizeBitmapFont} from '../../server/build/ui-runtime.mjs';
import {defineTheme} from '../../server/build/ui-theme.mjs';
import {layoutUi} from '../../server/build/ui-layout.mjs';
import {iterateNineSliceTiles,projectPixelRect} from '../../server/build/ui-runtime.mjs';
import * as u from '../../server/build/ui-components.mjs';
const {button}=u;

// This seam double models only the installed Phaser Image/Rectangle/Texture APIs.
// It cannot establish native pixels, renderer state or real input transport.
function fixture() {
  const objects = [], fragments = new Map(), parent = {add() {}, destroyed: 0};
  const texture = {key: 'borrowed',frameTotal:1,firstFrame:'__BASE',source:[{}],has: key => fragments.has(key),
    add(name, index, x, y, width, height) {const f = {name, sourceIndex:index, cutX:x, cutY:y, width, height}; fragments.set(name,f);texture.frameTotal++;if(texture.firstFrame==='__BASE')texture.firstFrame=name;return f;},
    get(){return {clone(){return {name:'',sourceIndex:0,source:texture.source[0],setSize(width,height,x,y){Object.assign(this,{width,height,cutX:x,cutY:y});fragments.set(this.name,this);return this;},destroy(){fragments.delete(this.name);}};}};},
    remove(name) {fragments.delete(name);}, destroy() {throw Error('borrowed texture destroyed');}};
  const make = kind => {
    const obj = {kind, destroyed:0, setOrigin() {return this;}, setPosition(x,y) {Object.assign(this,{x,y});return this;},
      setScale(x,y=x) {Object.assign(this,{scaleX:x,scaleY:y});return this;}, setTexture(key,frame) {Object.assign(this,{texture:key,frame:typeof frame==='string'?frame:frame.name});return this;},
      setCrop(...crop) {this.crop=crop;return this;}, setVisible(visible) {this.visible=visible;return this;},
      setTint(tint) {this.tint=tint;return this;},
      setSize(width,height) {Object.assign(this,{width,height});return this;}, setFillStyle(color) {this.color=color;return this;},
      setDepth(depth) {this.depth=depth;return this;}, destroy() {this.destroyed++;}};
    objects.push(obj);return obj;
  };
  const scene = {events:new EventEmitter(), add:{image:()=>make('image'),rectangle:()=>make('rectangle')}};
  const font = normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}}}}});
  const colors={focus:'#ffffff',hover:'#ffff00',pressed:'#ff0000',disabled:'#777777',selection:'#444444',caret:'#ffffff',indicator:'#00ff00',separator:'#777777',track:'#111111',fill:'#00ff00',selected:'#333333',adjust:'#ffffff'};
  const theme=defineTheme({version:1,id:'test:native',fonts:{body:{font}},roles:Object.fromEntries(['button','text','panel','absolute','stack','field','tabs','stepper','pager','toggle','fold','progress','meter','separator','icon','extension'].map(k=>[k,{font:'body',tone:'cream',colors,...(k==='button'?{alternatives:[{kind:'flat',color:'#123456'}]}:{})}])),geometry:{gap:0,padding:0,minTarget:0}});
  const context={id:'test:main',revision:1,localToPhysical:{scale:2,x:0,y:0},sourcePixelPhysicalSize:2,viewport:{x:0,y:0,width:100,height:60}};
  const snapshot=(revision=1,label='?')=>({revision,context,tree:button({id:'ok',label,actionId:'game:ok',layout:{width:20,height:10}})});
  const ports={resolveAsset:()=>({ownership:'borrowed',texture}),attachContext:()=>({ownership:'borrowed',parent})};
  return {scene,theme,ports,parent,objects,fragments,texture,context,snapshot};
}
async function api() {
  const url=new URL('../../server/build/ui-phaser-runtime.mjs',import.meta.url);
  expect(existsSync(url),'shared native host public seam exists').toBe(true);
  return import(url.href);
}

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
