import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
async function api(){const url=new URL('../../server/build/ui-interaction.mjs',import.meta.url);expect(existsSync(url),'portable interaction owner exists').toBe(true);return import(url.href);}
function control(id,x,extra={}){return {id,kind:'button',role:'button',enabled:true,focusable:true,actionId:`action:${id}`,paneId:'main',bounds:{x,y:0,width:10,height:10},hitBounds:{x,y:0,width:10,height:10},focusBounds:{x,y:0,width:10,height:10},effectiveHitBounds:{x,y:0,width:10,height:10},effectiveFocusBounds:{x,y:0,width:10,height:10},clipBounds:null,state:'visible',contextRevisions:{'app:main':1},...extra};}
function scope(records=[control('a',0),control('b',20,{enabled:false}),control('c',40)]){const ids=records.map(r=>r.id);return {id:'app:dialog',plan:{format:'agent-sprites/ui-layout@1',revision:1,contexts:[{id:'app:main',revision:1}],records,focus:{initialId:ids.includes('b')?'b':ids[0],defaultId:ids.includes('a')?'a':undefined,cancelId:ids.includes('c')?'c':undefined}}};}

test('disabled focus remains readable; ordered, spatial and pane movement share one focus owner',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope(),{navigation:'ordered',wrap:true});expect(ui.inspect({limit:10}).focusId).toBe('b');expect(ui.handle({type:'activate',inputId:'key:enter'})).toEqual([]);
  ui.handle({type:'navigate',direction:'next'});expect(ui.inspect({limit:10}).focusId).toBe('c');ui.handle({type:'navigate',direction:'next'});expect(ui.inspect({limit:10}).focusId).toBe('a');
  const spatial=createUiInteraction(scope(),{navigation:'spatial'});spatial.handle({type:'navigate',direction:'right'});expect(spatial.inspect({limit:10}).focusId).toBe('c');
  const panes=createUiInteraction(scope([control('a',0),control('b',20,{paneId:'other'})]),{navigation:'pane',restoreId:'a'});panes.handle({type:'pane',paneId:'other'});expect(panes.inspect({limit:10}).focusId).toBe('b');panes.handle({type:'pane',paneId:'main'});expect(panes.inspect({limit:10}).focusId).toBe('a');
});

test('default/cancel produce revision bound intents and event identity delivers only once',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());const first=ui.handle({type:'default',inputId:'enter:1'});expect(first).toHaveLength(1);expect(first[0]).toMatchObject({kind:'activate',controlId:'a',actionId:'action:a',modelRevision:1});expect(ui.handle({type:'default',inputId:'enter:1'})).toEqual([]);
  expect(ui.handle({type:'cancel',inputId:'escape:1'})[0].controlId).toBe('c');const s=scope();s.plan.focus.cancelId=undefined;expect(createUiInteraction(s).handle({type:'cancel',inputId:'escape'})[0]).toMatchObject({kind:'cancel',scopeId:'app:dialog'});
});

test('held presses reject wrong input, outside clip, changed model/context and disposal',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());const down={type:'press',controlId:'a',inputId:'pointer:1',point:{x:2,y:2}};const up={type:'release',inputId:'pointer:1',point:{x:2,y:2}};
  ui.handle(down);expect(ui.handle({...up,inputId:'pointer:2'})).toEqual([]);expect(ui.handle(up)).toHaveLength(1);expect(ui.handle(up)).toEqual([]);
  ui.handle(down);const next=scope();next.plan.revision=2;ui.update(next);expect(ui.handle(up)).toEqual([]);
  ui.handle(down);const context=scope();context.plan.revision=3;context.plan.contexts[0].revision=2;for(const c of context.plan.records)c.contextRevisions['app:main']=2;ui.update(context);expect(ui.handle(up)).toEqual([]);
  expect(()=>ui.update(scope())).toThrow(/revision|stale/i);ui.dispose();ui.dispose();expect(ui.handle(down)).toEqual([]);expect(ui.inspect({limit:1}).disposed).toBe(true);
  const clipped=createUiInteraction(scope([control('a',0,{effectiveHitBounds:{x:0,y:0,width:3,height:10}})]));clipped.handle({...down,point:{x:5,y:2}});expect(clipped.handle(up)).toEqual([]);
});

test('mapping reuse and stale node mappings fail before replacing valid state; inspect is bounded',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());const changed=scope();changed.plan.records[0].enabled=false;expect(()=>ui.update(changed)).toThrow(/revision/i);expect(ui.inspect({limit:1}).controls).toHaveLength(1);expect(ui.inspect({limit:1}).nextAfterId).toBe('a');expect(ui.inspect({limit:1,afterId:'a'}).controls[0].id).toBe('b');
  const stale=scope();stale.plan.records[0].contextRevisions['app:main']=0;expect(()=>createUiInteraction(stale)).toThrow(/context|stale/i);
  const dup=scope();dup.plan.records.push(dup.plan.records[0]);expect(()=>createUiInteraction(dup)).toThrow(/duplicate/i);
});

test('controlled fields, toggles, steppers, tabs, folds and pagers emit changes without mutating values',async()=>{
  const {createUiInteraction}=await api();
  for(const [kind,value,extra,event,expected] of [
    ['toggle',false,{}, {type:'activate'},true],['fold',false,{}, {type:'activate'},true],
    ['stepper',2,{min:0,max:3,step:2},{type:'adjust',delta:1},3],['pager',0,{pageCount:2},{type:'adjust',delta:1},1],
    ['tabs','a',{options:[{id:'a',label:'A'},{id:'b',label:'B'}]},{type:'adjust',delta:1},'b'],
    ['field','abc',{selection:{start:1,end:2,direction:'forward'},composition:null},{type:'edit',text:'Z'},'aZc'],
  ]){
    const source=scope([control('x',0,{kind,value,...extra})]);source.plan.focus={initialId:'x'};const ui=createUiInteraction(source);const intents=ui.handle({...event,inputId:`${kind}:1`});expect(intents[0]).toMatchObject({kind:'change',controlId:'x',value:expected,modelRevision:1});expect(source.plan.records[0].value).toBe(value);
    if(kind==='field'){expect(intents[0].selection).toEqual({start:2,end:2,direction:'none'});expect(ui.handle({type:'selection',controlId:'x',start:0,end:3,direction:'backward',inputId:'selection'})[0].selection.direction).toBe('backward');expect(ui.handle({type:'composition',controlId:'x',text:'字',inputId:'ime'})[0].composition).toBe('字');}
  }
});

test('update restores surviving focus, context changes invalidate only affected held controls',async()=>{
  const {createUiInteraction}=await api();const s=scope();s.plan.contexts.push({id:'app:other',revision:1});const ui=createUiInteraction(s,{restoreId:'a'});ui.handle({type:'press',controlId:'a',inputId:'p',point:{x:1,y:1}});
  const next=structuredClone(s);next.plan.contexts[1].revision=2;ui.update(next);expect(ui.handle({type:'release',inputId:'p',point:{x:1,y:1}})).toHaveLength(1);expect(ui.inspect({limit:10}).focusId).toBe('a');
  const stale=structuredClone(next);stale.plan.contexts[1].revision=3;stale.plan.records[0].bounds.x=99;expect(()=>ui.update(stale)).toThrow(/revision|geometry/i);expect(ui.inspect({limit:1}).controls[0].bounds.x).toBe(0);
});

test('stale normalized events and replayed activation identities cannot target replacement models',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());expect(ui.handle({type:'default',inputId:'enter'})).toHaveLength(1);
  const next=scope();next.plan.revision=2;ui.update(next);expect(ui.handle({type:'default',inputId:'enter'})).toEqual([]);expect(ui.handle({type:'default',inputId:'old',modelRevision:1})).toEqual([]);expect(ui.handle({type:'default',inputId:'oldContext',contextRevisions:{'app:main':0}})).toEqual([]);
  expect(ui.handle({type:'default',inputId:'new',modelRevision:2,contextRevisions:{'app:main':1}})).toHaveLength(1);
});

test('fields retain caret direction, delete selected content and accept controlled tab selections',async()=>{
  const {createUiInteraction}=await api();const s=scope([control('f',0,{kind:'field',value:'Ai',selection:{start:1,end:1,direction:'none'},composition:null})]);s.plan.focus={initialId:'f'};const ui=createUiInteraction(s);
  expect(ui.handle({type:'caret',direction:'right',extend:true,inputId:'caret'})[0].selection).toEqual({start:1,end:2,direction:'forward'});
  expect(ui.handle({type:'delete',direction:'backward',inputId:'delete'})[0]).toMatchObject({value:'i',selection:{start:0,end:0,direction:'none'}});
  const tab=scope([control('t',0,{kind:'tabs',value:'a',options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C',enabled:false}]})]);tab.plan.focus={initialId:'t'};const tabs=createUiInteraction(tab);
  expect(tabs.handle({type:'select',value:'b',inputId:'tab'})[0].value).toBe('b');expect(tabs.handle({type:'select',value:'c',inputId:'disabled'})).toEqual([]);
});

test('coordinator regression: enabled nonfocusable pointer actions activate once without taking focus',async()=>{
  const {createUiInteraction}=await api();const s=scope([control('a',0,{focusable:false,effectiveFocusBounds:null}),control('c',40)]);s.plan.focus={initialId:'c'};const ui=createUiInteraction(s);
  ui.handle({type:'press',controlId:'a',inputId:'pointer:tap',point:{x:2,y:2}});
  expect(ui.handle({type:'release',inputId:'pointer:tap',point:{x:2,y:2}})).toEqual([{kind:'activate',controlId:'a',actionId:'action:a',modelRevision:1,activationId:expect.any(String)}]);
  expect(ui.handle({type:'release',inputId:'pointer:tap',point:{x:2,y:2}})).toEqual([]);expect(ui.inspect({limit:2}).focusId).toBe('c');
  for(const extra of [{enabled:false},{effectiveHitBounds:null},{effectiveHitBounds:{x:0,y:0,width:1,height:1}}]){
    const refused=scope([control('a',0,{focusable:false,...extra})]);refused.plan.focus={};const input=createUiInteraction(refused);input.handle({type:'press',controlId:'a',inputId:'p',point:{x:2,y:2}});expect(input.handle({type:'release',inputId:'p',point:{x:2,y:2}})).toEqual([]);
  }
  ui.handle({type:'press',controlId:'a',inputId:'old',point:{x:2,y:2}});const next=structuredClone(s);next.plan.revision=2;ui.update(next);expect(ui.handle({type:'release',inputId:'old',point:{x:2,y:2}})).toEqual([]);
  const roles=structuredClone(s);roles.plan.focus={initialId:'c',defaultId:'a',cancelId:'a'};const withRoles=createUiInteraction(roles);expect(withRoles.handle({type:'default',inputId:'default'})[0].controlId).toBe('a');expect(withRoles.handle({type:'cancel',inputId:'cancel'})[0].controlId).toBe('a');
});

test('coordinator exact stale-geometry witness: unrelated revisions cannot relocate a held control',async()=>{
  const {createUiInteraction}=await api();
  const source=scope([control('tap',0,{actionId:'game:tap',contextRevisions:{'game:main':1}})]);source.plan.focus={initialId:'tap'};source.plan.contexts=[{id:'game:main',revision:1},{id:'game:other',revision:1}];
  const press={type:'press',controlId:'tap',inputId:'pointer:1',point:{x:2,y:2}};
  const stale=createUiInteraction(source);stale.handle(press);const moved=structuredClone(source);moved.plan.contexts[1].revision=2;
  for(const key of ['bounds','hitBounds','focusBounds','effectiveHitBounds','effectiveFocusBounds'])moved.plan.records[0][key]={x:20,y:0,width:10,height:10};
  expect(()=>stale.update(moved)).toThrow(/revision|geometry/i);expect(stale.inspect({limit:1}).controls[0].bounds.x).toBe(0);
  expect(stale.handle({type:'release',inputId:'pointer:1',point:{x:22,y:2}})).toEqual([]);
  const valid=createUiInteraction(source);valid.handle(press);const unrelated=structuredClone(source);unrelated.plan.contexts[1].revision=2;valid.update(unrelated);
  expect(valid.handle({type:'release',inputId:'pointer:1',point:{x:2,y:2}})).toEqual([{kind:'activate',controlId:'tap',actionId:'game:tap',modelRevision:1,activationId:expect.any(String)}]);
  expect(valid.handle({type:'release',inputId:'pointer:1',point:{x:2,y:2}})).toEqual([]);
});
