import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import * as api from '../../../server/build/ui-interaction.mjs';
import {pixelResolution} from '../../../server/build/ui-runtime.mjs';
const context=()=>({...pixelResolution({id:'test:main',revision:1,localToPhysical:{scale:1,origin:{x:0,y:0}},physicalPixelsPerSourcePixel:1}),viewport:{x:0,y:0,width:100,height:100}});
const record=(id,x=0,extra={})=>({id,semanticContextId:'test:main',kind:'button',role:'button',enabled:true,focusable:true,actionId:'action:'+id,paneId:'main',bounds:{x,y:0,width:10,height:10},hitBounds:{x,y:0,width:10,height:10},focusBounds:{x,y:0,width:10,height:10},effectiveHitBounds:{x,y:0,width:10,height:10},effectiveFocusBounds:{x,y:0,width:10,height:10},clipBounds:null,state:'visible',contextRevisions:{'test:main':1},...extra});
const scope=(records=[record('a',0,{selected:false}),record('b',20),record('c',40,{selected:true})],revision=1)=>({id:'test:appearance',plan:{format:'agent-sprites/ui-layout@1',revision,contexts:[context()],records,focus:{initialId:records[0]?.id}}});
function expected(ui){const controls=[];let afterId,page;do{page=ui.inspect({limit:2,...(afterId?{afterId}:{})});for(const r of page.controls)controls.push({id:r.id,state:r.state,enabled:r.enabled,selected:r.selected===undefined?undefined:!!r.selected,focused:r.focused,hovered:r.hovered,pressed:r.pressed});afterId=page.nextAfterId;}while(afterId);return{scopeId:page.scopeId,modelRevision:page.modelRevision,disposed:page.disposed,controls};}
function read(ui){assert.equal(typeof api.readUiAppearance,'function','internal compact reader must exist');return api.readUiAppearance(ui);}
function equal(ui){assert.deepEqual(read(ui),expected(ui));}
export const appearanceCases=[
 ['compact appearance equals public projection through focus hover multi-press release blur and dispose',()=>{
  const ui=api.createUiInteraction(scope(),{retainUnchangedPresses:true});equal(ui);
  for(const input of [{type:'focus',controlId:'c'},{type:'hover',point:{x:22,y:2},pointSpace:'physical'},{type:'press',controlId:'a',inputId:'one'},{type:'press',controlId:'c',inputId:'two'},{type:'release',controlId:'a',inputId:'one'},{type:'blur'}]){ui.handle(input);equal(ui);}
  ui.dispose();equal(ui);assert.equal(read(ui).controls.some(r=>r.focused||r.hovered||r.pressed),false);
 }],
 ['compact appearance follows accepted updates and preserves state after rejected publication',()=>{
  const ui=api.createUiInteraction(scope());ui.handle({type:'press',controlId:'a',inputId:'held'});equal(ui);
  const next=scope([record('a',0,{enabled:false}),record('b',20)],2);ui.update(next);equal(ui);assert.equal(read(ui).controls.some(r=>r.pressed),false);
  const before=read(ui),bad=scope([record('a',0),record('a',20)],3);assert.throws(()=>ui.update(bad));assert.deepEqual(read(ui),before);equal(ui);ui.dispose();
 }],
 ['compact snapshots are detached frozen primitive records and do not leak admitted geometry or tokens',()=>{
  const ui=api.createUiInteraction(scope()),old=read(ui);assert.ok(Object.isFrozen(old)&&Object.isFrozen(old.controls));
  for(const r of old.controls){assert.ok(Object.isFrozen(r));assert.deepEqual(Object.keys(r),['id','state','enabled','selected','focused','hovered','pressed']);for(const v of Object.values(r))assert.ok(v===undefined||v===null||['string','number','boolean'].includes(typeof v));}
  assert.throws(()=>{old.controls[0].focused=true;},TypeError);ui.handle({type:'focus',controlId:'c'});assert.equal(old.controls[0].focused,true);assert.equal(read(ui).controls[0].focused,false);equal(ui);ui.dispose();
 }],
 ['compact reader requires genuine instance identity while public API shape and pagination stay unchanged',()=>{
  const ui=api.createUiInteraction(scope());assert.deepEqual(Object.keys(ui),['handle','update','inspect','dispose']);
  for(const fake of [null,{},Object.create(ui),{...ui},new Proxy(ui,{})])assert.throws(()=>read(fake),TypeError);
  assert.throws(()=>ui.inspect({limit:0}),RangeError);assert.throws(()=>ui.inspect({limit:257}),RangeError);assert.throws(()=>ui.inspect({limit:1,afterId:'missing'}),TypeError);
  const observation=ui.inspect({limit:1});assert.ok(observation.controls[0].bounds);assert.equal(observation.nextAfterId,'a');equal(ui);ui.dispose();
 }],
 ['compact snapshots span all current records without retaining removed records or state between instances',()=>{
  const many=Array.from({length:300},(_,i)=>record('r'+i,i*11)),a=api.createUiInteraction(scope(many)),b=api.createUiInteraction(scope());
  equal(a);equal(b);assert.equal(read(a).controls.length,300);a.handle({type:'focus',controlId:'r299'});assert.equal(read(b).controls[0].focused,true);
  a.update(scope([record('only')],2));equal(a);assert.equal(read(a).controls.length,1);a.dispose();b.dispose();equal(a);equal(b);
 }],
 ['compact selected is optional normalized paint truthiness while raw accepted selection stays unchanged',()=>{
  for(const selected of [undefined,null,false,true,0,1,'', 'selected',{},[]]){
   const ui=api.createUiInteraction(scope([record('a',0,{selected})]));
   assert.deepEqual(ui.inspect({limit:1}).controls[0].selected,selected);
   assert.equal(read(ui).controls[0].selected,selected===undefined?undefined:!!selected);ui.dispose();
  }
 }],
 ['compact path does not change raw scope admission or caller-owned data isolation',()=>{
  const raw=scope(),ui=api.createUiInteraction(raw);raw.plan.records[0].enabled=false;equal(ui);assert.equal(read(ui).controls[0].enabled,true);
  const hostile=scope();Object.defineProperty(hostile.plan.records[0],'enabled',{get(){throw Error('raw getter');},enumerable:true});assert.throws(()=>api.createUiInteraction(hostile));equal(ui);ui.dispose();
 }],
];
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let failed=0;for(const[name,run]of appearanceCases)try{run();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}console.log(JSON.stringify({passed:appearanceCases.length-failed,failed}));if(failed)process.exitCode=1;
}
