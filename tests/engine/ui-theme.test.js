import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {normalizeBitmapFont} from '../../server/build/ui-runtime.mjs';

test('disabled focus edge opt-in is inherited immutable boolean appearance data',async()=>{
  const {defineTheme}=await api(),input=themeInput();
  input.roles.button.edge={width:2,focusWhenDisabled:true,authored:'skill'};
  const theme=defineTheme(input);input.roles.button.edge.focusWhenDisabled=false;
  expect(theme.roles.primary.edge.focusWhenDisabled).toBe(true);
  expect(Object.isFrozen(theme.roles.primary.edge)).toBe(true);
  for(const value of ['true',1,0,null,[],{}]){
    const bad=themeInput();bad.roles.button.edge={focusWhenDisabled:value};
    expect(()=>defineTheme(bad)).toThrow(/focusWhenDisabled/);
  }
  const legacy=themeInput();expect(defineTheme(legacy).roles.primary.edge).toBeUndefined();
});

test('focus style inherits immutable opacity and local edge width without losing edge metadata',async()=>{
  const {defineTheme}=await api(),input=themeInput();
  input.roles.button.opacity=.3;input.roles.button.edge={width:2,authored:'magenta'};
  input.roles.extended={extends:'button'};
  const theme=defineTheme(input);input.roles.button.edge.width=9;input.roles.button.opacity=1;
  expect(theme.roles.primary.opacity).toBe(.3);expect(theme.roles.extended.edge).toEqual({width:2,authored:'magenta'});
  expect(Object.isFrozen(theme.roles.primary.edge)).toBe(true);
  expect(theme.roles.body.opacity).toBeUndefined();expect(theme.roles.body.edge).toBeUndefined();
  for(const value of [NaN,Infinity,-Infinity,-.1,1.1,null,'0.3']){
    const bad=themeInput();bad.roles.button.opacity=value;expect(()=>defineTheme(bad)).toThrow(/opacity|finite/);
  }
  for(const value of [NaN,Infinity,-Infinity,0,-1,null,'2']){
    const bad=themeInput();bad.roles.button.edge={width:value};expect(()=>defineTheme(bad)).toThrow(/width|finite/);
  }
  const zero=themeInput();zero.roles.button.opacity=0;expect(defineTheme(zero).roles.primary.opacity).toBe(0);
});
export function font(){return normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3},A:{advance:7,frames:{cream:'a'},bounds:{left:0,top:0,right:5,bottom:5}},i:{advance:2,frames:{cream:'i'},bounds:{left:0,top:0,right:0,bottom:5}}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}},a:{frame:{x:4,y:0,w:6,h:6}},i:{frame:{x:10,y:0,w:1,h:6}}}}});}
async function api(){const url=new URL('../../server/build/ui-theme.mjs',import.meta.url);expect(existsSync(url),'portable theme owner exists').toBe(true);return import(url.href);}
export function themeInput(){return {version:1,id:'app:theme',fonts:{body:{font:font(),policy:{spaces:'terminal'}}},skins:{paper:{frame:{x:0,y:0,width:12,height:12},insets:{left:2,right:2,top:2,bottom:2},padding:{left:3,right:3,top:2,bottom:2},minWidth:4,minHeight:4,center:'omit',tile:true,trim:{x:1,y:1,width:10,height:10},caps:{start:2,end:3,period:4}}},roles:{body:{font:'body',tone:'cream'},button:{font:'body',tone:'cream',alternatives:[{kind:'skin',id:'missing'},{kind:'skin',id:'paper'}]},primary:'button'},geometry:{gap:2,padding:0,minTarget:10}};}

test('themes resolve explicit aliases and alternatives, retaining hollow trim cap and font policies',async()=>{
  const {defineTheme,resolveThemeRole}=await api();const input=themeInput();const theme=defineTheme(input);input.skins.paper.caps.start=9;
  const role=resolveThemeRole(theme,'primary');expect(role.appearance.kind).toBe('skin');expect(role.appearance.id).toBe('paper');expect(role.appearance.skin.center).toBe('omit');expect(role.appearance.skin.caps.start).toBe(2);expect(role.appearance.skin.trim.width).toBe(10);expect(theme.fonts.body.policy.spaces).toBe('terminal');expect(Object.isFrozen(role)).toBe(true);
  expect(()=>resolveThemeRole(theme,'unknown')).toThrow(/role/i);
});

test('themes reject authority, missing required assets, alias cycles and invalid geometry',async()=>{
  const {defineTheme}=await api();
  for(const edit of [i=>i.version=2,i=>i.roles.body.enabled=true,i=>i.roles.body.defaultId='yes',i=>i.roles.primary='primary',i=>i.roles.body.font='absent',i=>i.skins.paper.insets.left=-1,i=>i.skins.paper.frame.width=0,i=>i.skins.paper.insets.top=.5,i=>i.geometry.gap=Infinity,i=>i.roles.button.alternatives=[{kind:'skin',id:'absent'}]]){
    const input=themeInput();edit(input);expect(()=>defineTheme(input)).toThrow();
  }
  const i=themeInput();i.roles.button.alternatives=[{kind:'flat',color:'#112233'}];expect(defineTheme(i).roles.button.appearance).toEqual({kind:'flat',color:'#112233'});
});

test('authored glyph tint is inherited and validated independently of skin and feedback colors',async()=>{
  const {defineTheme}=await api(),input=themeInput();input.roles.button.glyphTint='#e8837a';
  const theme=defineTheme(input);expect(theme.roles.primary.glyphTint).toBe('#e8837a');
  expect(theme.roles.primary.appearance.id).toBe('paper');expect(theme.roles.body.glyphTint).toBeUndefined();
  for(const invalid of [0xe8837a,'red','#fff','#gggggg',null]){
    const i=themeInput();i.roles.button.glyphTint=invalid;expect(()=>defineTheme(i)).toThrow(/glyphTint/);
  }
  const i=themeInput();i.roles.plain={glyphTint:'#e8837a'};expect(()=>defineTheme(i)).toThrow(/font/);
});

test('authored caret width is inherited, copied and requires a positive finite local dimension',async()=>{
  const {defineTheme}=await api(),input=themeInput();input.roles.body.caretWidth=1;
  input.roles.field={extends:'body'};const theme=defineTheme(input);input.roles.body.caretWidth=2;
  expect(theme.roles.field.caretWidth).toBe(1);
  for(const width of [0,-1,Infinity,NaN,'1',null]){
    const invalid=themeInput();invalid.roles.body.caretWidth=width;
    expect(()=>defineTheme(invalid)).toThrow(/caretWidth|finite/);
  }
});

test('immutable snapshots share only certified plain data and keep mutable copies detached',async()=>{
  const {snapshotUiData,copyUiData}=await api();
  expect(typeof snapshotUiData).toBe('function');
  const input={label:'A',nested:{value:1}},first=snapshotUiData(input);
  input.nested.value=2;expect(first.nested.value).toBe(1);
  expect(Object.isFrozen(first.nested)).toBe(true);expect(Object.isFrozen(input.nested)).toBe(false);
  expect(snapshotUiData(first)).toBe(first);
  const next=snapshotUiData({left:first,right:first,revision:2});
  expect(next.left).toBe(first);expect(next.right).toBe(first);
  const copy=copyUiData(next);expect(copy.left).not.toBe(first);copy.left.nested.value=3;
  expect(first.nested.value).toBe(1);expect(copy.right.nested.value).toBe(1);
});

test('snapshot admission revalidates shallow freezes and rejects executable or cyclic caller data',async()=>{
  const {snapshotUiData,freezeUiData}=await api();expect(typeof snapshotUiData).toBe('function');
  const child={value:1},frozen=Object.freeze({child}),snapshot=snapshotUiData(frozen);
  child.value=9;expect(snapshot.child.value).toBe(1);expect(snapshot).not.toBe(frozen);
  const formerlyFrozen={child:{value:2}};freezeUiData(formerlyFrozen);
  expect(snapshotUiData(formerlyFrozen)).not.toBe(formerlyFrozen);
  let calls=0;const accessor=Object.freeze(Object.defineProperty({},'value',{enumerable:true,get(){calls++;return 1;}}));
  const hidden=Object.defineProperty({},'secret',{value:1}),symbol={[Symbol('x')]:1},cycle={};cycle.self=cycle;Object.freeze(cycle);
  const polluted=JSON.parse('{"__proto__":{"bad":1}}');
  for(const bad of [accessor,hidden,symbol,cycle,polluted,[,1],{n:NaN},{fn(){}}])expect(()=>snapshotUiData(bad)).toThrow();
  expect(calls).toBe(0);
  expect(()=>snapshotUiData(freezeUiData({fn(){}}))).toThrow();
  expect(snapshotUiData({safe:1})).toEqual({safe:1});
});

test('owned publication validates before freezing and preserves generated graph aliases',async()=>{
  const {publishUiData,snapshotUiData,copyUiData}=await api();expect(typeof publishUiData).toBe('function');
  const placement={draws:[{source:{x:1,y:2,width:3,height:4}}]},owned={text:placement,parts:[{placement}]};
  expect(publishUiData(owned)).toBe(owned);expect(owned.text).toBe(owned.parts[0].placement);
  expect(Object.isFrozen(placement.draws[0].source)).toBe(true);expect(snapshotUiData(owned)).toBe(owned);
  const copy=copyUiData(owned);copy.text.draws[0].source.x=9;expect(owned.text.draws[0].source.x).toBe(1);
  let reads=0;const earlier={value:1},invalid={earlier,bad:Object.defineProperty({},'value',{enumerable:true,get(){reads++;return 1;}})};
  expect(()=>publishUiData(invalid)).toThrow();expect(reads).toBe(0);
  expect(Object.isFrozen(earlier)).toBe(false);expect(Object.isFrozen(invalid)).toBe(false);
  const cycle={};cycle.self=cycle;expect(()=>publishUiData(cycle)).toThrow(/acyclic/);
  const sparse=[,1];sparse.extra=1;expect(()=>publishUiData(sparse)).toThrow(/dense/);
  const mutated={value:1},proxy=new Proxy({}, {ownKeys(){mutated.bad=()=>{};return [];}});
  expect(()=>publishUiData({mutated,proxy})).toThrow();expect(()=>snapshotUiData(mutated)).toThrow();
  for(const bad of [[,1],{n:Infinity},{[Symbol('hidden')]:1},Object.create({inherited:true})])expect(()=>publishUiData(bad)).toThrow();
  class ForeignArray extends Array {map(){throw Error('foreign method');}}
  const foreign=ForeignArray.of(1),custom=[1];Object.setPrototypeOf(custom,{map(){throw Error('foreign method');}});
  for(const bad of [foreign,custom])expect(()=>publishUiData(bad)).toThrow(/array|plain/i);
  expect(snapshotUiData(foreign)).toEqual([1]);
});


test('certified graphs use one weak certification entry per node and generic freezing skips them',async()=>{
 const {snapshotUiData,publishUiData,freezeUiData}=await import('../../server/build/ui-theme.mjs');
 const count=work=>{const counts=new WeakMap(),old=WeakSet.prototype.add;WeakSet.prototype.add=function(value){counts.set(value,(counts.get(value)??0)+1);return old.call(this,value);};try{return {value:work(),counts};}finally{WeakSet.prototype.add=old;}};
 for(const admission of [snapshotUiData,publishUiData]){
  const {value,counts}=count(()=>admission({child:{x:1},array:[{y:2}]}));
  for(const node of [value,value.child,value.array,value.array[0]])expect(counts.get(node)).toBe(1);
  let additions=0,freezes=0;const add=WeakSet.prototype.add,freeze=Object.freeze;let same;
  WeakSet.prototype.add=function(value){additions++;return add.call(this,value);};Object.freeze=function(value){freezes++;return freeze(value);};
  try{same=freezeUiData(value);}finally{WeakSet.prototype.add=add;Object.freeze=freeze;}
  expect(same).toBe(value);expect(additions).toBe(0);expect(freezes).toBe(0);
 }
});
test('generic deep freezing never grants raw data a validation certificate',async()=>{
 const {snapshotUiData,publishUiData,freezeUiData,isUiSnapshot,copyUiData}=await import('../../server/build/ui-theme.mjs');let calls=0;
 const raw=freezeUiData({child:{safe:1},fn(){calls++;}});
 expect(Object.isFrozen(raw.child)).toBe(true);expect(isUiSnapshot(raw)).toBe(false);expect(isUiSnapshot(raw.child)).toBe(false);
 expect(()=>snapshotUiData(raw)).toThrow();expect(()=>publishUiData(raw)).toThrow();expect(calls).toBe(0);
 const valid=freezeUiData({child:{safe:1}}),accepted=snapshotUiData(valid);expect(accepted).not.toBe(valid);expect(accepted.child).not.toBe(valid.child);expect(isUiSnapshot(valid)).toBe(false);
 const mutable=copyUiData(accepted);expect(Object.isFrozen(mutable.child)).toBe(false);mutable.child.safe=2;expect(accepted.child.safe).toBe(1);
});


test('record copies shadow inherited accessors and readonly data including post-child prototype changes',async()=>{
 const {snapshotUiData}=await api(),define=Object.defineProperty,descriptor=o=>Object.assign(Object.create(null),o);
 for(const during of [false,true])for(const kind of ['setter','getter','readonly']){let reads=0,writes=0,result;const install=()=>define(Object.prototype,'factory:key',descriptor(kind==='readonly'?{value:1,writable:false,configurable:true}:kind==='setter'?{set(){writes++;},configurable:true}:{get(){reads++;return 1;},configurable:true}));
  try{if(!during)install();const value=during?new Proxy({}, {ownKeys(){install();return [];}}):3;result=snapshotUiData({'factory:key':value});}finally{delete Object.prototype['factory:key'];}
  expect(reads).toBe(0);expect(writes).toBe(0);expect(Object.hasOwn(result,'factory:key')).toBe(true);expect(Object.getOwnPropertyDescriptor(result,'factory:key')).toMatchObject({enumerable:true,configurable:false,writable:false});
 }
});

test('record write preserves inherited descriptor-field conversion after recursive child capture',async()=>{
 const {snapshotUiData}=await api(),define=Object.defineProperty;
 for(const key of ['get','set'])for(const accessor of [false,true]){let reads=0,error;
  try{const child=new Proxy({}, {ownKeys(){define(Object.prototype,key,Object.assign(Object.create(null),accessor?{configurable:true,get(){reads++;return undefined;}}:{configurable:true,value:undefined}));return [];}});try{snapshotUiData({child});}catch(e){error=e;}}finally{delete Object.prototype[key];}
  expect(error).toBeInstanceOf(TypeError);expect(reads).toBe(accessor?1:0);
 }
});

test('record fallback retains the pre-child defineProperty callee and late caller mutation remains detached',async()=>{
 const {snapshotUiData}=await api(),define=Object.defineProperty;let result;const raw={value:1};
 try{const child=new Proxy({}, {ownKeys(){define(Object.prototype,'factory:key',{value:1,configurable:true});Object.defineProperty=()=>{throw Error('late callee');};raw.value=2;return [];}});result=snapshotUiData({'factory:key':child});}finally{Object.defineProperty=define;delete Object.prototype['factory:key'];}
 expect(Object.hasOwn(result,'factory:key')).toBe(true);expect(result['factory:key']).toEqual({});expect(Object.isFrozen(result['factory:key'])).toBe(true);expect(raw.value).toBe(2);
});

test('raw copies preserve a defineProperty shim installed before module initialization',async()=>{
 const original=Object.defineProperty;let calls=0,result;
 Object.defineProperty=function(target,key,descriptor){if(key==='guardShimProbe'){calls++;expect(this).toBe(Object);}return original(target,key,descriptor);};
 try{const module=await import('../../server/build/ui-theme.mjs?preinstalled-define-shim');result=module.snapshotUiData({guardShimProbe:23});}finally{Object.defineProperty=original;}
 expect(result.guardShimProbe).toBe(23);expect(calls).toBe(1);expect(Object.isFrozen(result)).toBe(true);
});

test('a temporary custom definer permanently retains the original path for that private record',async()=>{
 const {snapshotUiData}=await api(),original=Object.defineProperty;let reads=0,writes=0,result;
 Object.defineProperty=function(target,key,descriptor){if(key==='factoryFirst'){original(target,'factorySecond',{configurable:true,enumerable:true,get(){reads++;return 99;},set(){writes++;}});Object.defineProperty=original;}return original(target,key,descriptor);};
 try{result=snapshotUiData({factoryFirst:1,factorySecond:2});}finally{Object.defineProperty=original;}
 expect(reads).toBe(0);expect(writes).toBe(0);expect(result.factorySecond).toBe(2);
});

test('raw copy definer receives its pre-child receiver when a transient shim is installed',async()=>{
 const {snapshotUiData}=await api(),original=Object.defineProperty;let calls=0,result;
 Object.defineProperty=function(target,key,descriptor){if(key==='receiverProbe'){calls++;expect(this).toBe(Object);}return original(target,key,descriptor);};
 try{result=snapshotUiData({receiverProbe:23});}finally{Object.defineProperty=original;}
 expect(calls).toBe(1);expect(result.receiverProbe).toBe(23);
});
