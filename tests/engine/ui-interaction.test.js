import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {pixelResolution} from '../../server/build/ui-runtime.mjs';

test('physical and explicitly contextual points resolve independently for each semantic record',async()=>{
  const {createUiInteraction}=await api();
  const main=pixelResolution({id:'test:main',revision:1,localToPhysical:{scale:2,origin:{x:0,y:0}},physicalPixelsPerSourcePixel:2});
  const other=pixelResolution({id:'test:other',revision:1,localToPhysical:{scale:1,origin:{x:100,y:0}},physicalPixelsPerSourcePixel:1});
  const s=scope([control('a',0,{semanticContextId:main.id,contextRevisions:{[main.id]:1}}),control('b',0,{enabled:true,semanticContextId:other.id,contextRevisions:{[other.id]:1}})]);
  s.plan.contexts=[{...main,viewport:{x:0,y:0,width:100,height:60}},{...other,viewport:{x:0,y:0,width:100,height:60}}];s.plan.focus={initialId:'a'};
  const ui=createUiInteraction(s);
  const click=(point,pointSpace,id)=>{ui.handle({type:'press',inputId:id,point,pointSpace});return ui.handle({type:'release',inputId:id,point,pointSpace});};
  expect(click({x:4,y:4},'physical','a')[0]?.controlId).toBe('a');
  expect(click({x:102,y:2},'physical','b')[0]?.controlId).toBe('b');
  expect(click({x:2,y:2},{contextId:main.id,revision:1},'c')[0]?.controlId).toBe('a');
  expect(click({x:2,y:2},{contextId:main.id,revision:0},'stale')).toEqual([]);
  expect(()=>click({x:2,y:2},undefined,'ambiguous')).toThrow(/space|context/i);
  ui.handle({type:'hover',point:{x:102,y:2},pointSpace:'physical'});expect(ui.inspect({limit:2}).hoverId).toBe('b');
  const spatial=createUiInteraction(s,{navigation:'spatial'});spatial.handle({type:'navigate',direction:'right'});expect(spatial.inspect({limit:2}).focusId).toBe('b');
});
async function api(){const url=new URL('../../server/build/ui-interaction.mjs',import.meta.url);expect(existsSync(url),'portable interaction owner exists').toBe(true);return import(url.href);}
const context = id => ({...pixelResolution({id,revision:1,localToPhysical:{scale:1,origin:{x:0,y:0}},physicalPixelsPerSourcePixel:1}),viewport:{x:0,y:0,width:100,height:60}});
function control(id,x,extra={}){return {id,semanticContextId:'app:main',kind:'button',role:'button',enabled:true,focusable:true,actionId:`action:${id}`,paneId:'main',bounds:{x,y:0,width:10,height:10},hitBounds:{x,y:0,width:10,height:10},focusBounds:{x,y:0,width:10,height:10},effectiveHitBounds:{x,y:0,width:10,height:10},effectiveFocusBounds:{x,y:0,width:10,height:10},clipBounds:null,state:'visible',contextRevisions:{'app:main':1},...extra};}
function scope(records=[control('a',0),control('b',20,{enabled:false}),control('c',40)]){const ids=records.map(r=>r.id);return {id:'app:dialog',plan:{format:'agent-sprites/ui-layout@1',revision:1,contexts:[context('app:main')],records,focus:{initialId:ids.includes('b')?'b':ids[0],defaultId:ids.includes('a')?'a':undefined,cancelId:ids.includes('c')?'c':undefined}}};}

test('logical spatial: Travel 284x160 requests area-4 reveal then activates only after republish',async()=>{
  const {createUiInteraction}=await api(),u=await import('../../server/build/ui-components.mjs'),{layoutUi}=await import('../../server/build/ui-layout.mjs'),{defineTheme}=await import('../../server/build/ui-theme.mjs');
  const theme=defineTheme({version:1,id:'test:travel',roles:{absolute:{},button:{}},geometry:{minTarget:0}});
  const context={id:'test:travel',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:284,height:160}};
  // Actual Travel/screen/scrollBody reservations: box (4,8,276,144),
  // body (10,32,264,92), eight 24-unit rows with 138x22 action faces.
  // Projection withholds partly clipped actions in zero-clip wrappers.
  const plan=(scroll,revision)=>layoutUi(u.absolute({id:'travel',layout:{width:284,height:160,overflow:'clip'},focus:{initialId:'area-3',defaultId:'area-4',cancelId:'back',order:[...Array.from({length:8},(_,i)=>`area-${i+1}`),'deploy','back']},children:[
    u.absolute({id:'body',layout:{x:10,y:32,width:264,height:92,overflow:'clip'},children:Array.from({length:8},(_,i)=>{
      const y=i*24-scroll,child=u.button({id:`area-${i+1}`,actionId:`district:${i+1}`,layout:{x:2,y,width:138,height:22}});
      return y<0||y+22>92?u.absolute({id:`withheld:${i}`,layout:{width:0,height:0,overflow:'clip'},children:[child]}):child;
    })}),u.button({id:'deploy',actionId:'deploy',layout:{x:132,y:128,width:140,height:22}}),u.button({id:'back',actionId:'back',layout:{x:70,y:128,width:56,height:22}})
  ]}),{theme,context,revision});
  const first=plan(0,1),target=first.records.find(r=>r.id==='area-4');
  expect(target.focusBounds).toEqual({x:12,y:104,width:138,height:22});expect(target.effectiveFocusBounds).toBeNull();
  const ui=createUiInteraction({id:'test:travel',plan:first},{navigation:'spatial',wrap:true});
  expect(ui.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'area-4',modelRevision:1}]);
  expect(ui.inspect({limit:30}).focusId).toBe('area-4');
  for(const type of ['activate','default'])expect(ui.handle({type,inputId:`before:${type}`})).toEqual([]);
  ui.handle({type:'press',controlId:'area-4',inputId:'before:held'});expect(ui.inspect({limit:30}).heldCount).toBe(0);
  ui.update({id:'test:travel',plan:plan(24,2)});
  expect(ui.handle({type:'release',controlId:'area-4',inputId:'before:held'})).toEqual([]);
  expect(ui.handle({type:'activate',inputId:'queued-old',modelRevision:1})).toEqual([]);
  expect(ui.handle({type:'activate',inputId:'after',modelRevision:2})).toMatchObject([{kind:'activate',controlId:'area-4',actionId:'district:4',modelRevision:2}]);
  expect(ui.handle({type:'default',inputId:'after-default'})).toMatchObject([{controlId:'area-4'}]);
  expect(ui.handle({type:'cancel',inputId:'escape'})).toMatchObject([{controlId:'back'}]);ui.dispose();
});

test.each(['visible','paginate'])('review correction: spatial navigation excludes inherited hidden targets under %s parents',async overflow=>{
  const {createUiInteraction}=await api(),u=await import('../../server/build/ui-components.mjs'),{layoutUi}=await import('../../server/build/ui-layout.mjs'),{defineTheme}=await import('../../server/build/ui-theme.mjs');
  const theme=defineTheme({version:1,id:'test:hidden-tree',roles:{absolute:{},button:{}},geometry:{minTarget:0}});
  const context={id:'test:hidden-tree',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:100,height:120}};
  const make=(hidden,revision)=>layoutUi(u.absolute({id:'root',layout:{width:100,height:120},focus:{initialId:'origin',order:['origin','unavailable','far']},children:[
    u.button({id:'origin',layout:{width:10,height:10}}),
    u.absolute({id:'hidden-parent',hidden,layout:{overflow},children:[u.absolute({id:'nested',layout:{width:30,height:40},children:[u.button({id:'unavailable',hidden:false,layout:{y:20,width:10,height:10}})]})]}),
    u.button({id:'far',layout:{y:80,width:10,height:10}})
  ]}),{theme,context,revision});
  const plan=make(true,1);
  const unavailable=plan.records.find(r=>r.id==='unavailable');
  expect(unavailable).toMatchObject({hidden:false,state:'clipped',parentId:'nested',focusBounds:{y:20,width:10,height:10}});
  expect(unavailable.effectiveFocusBounds).toBeNull();
  const input=createUiInteraction({id:'test:hidden-tree',plan},{navigation:'spatial'});
  expect(input.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'far',modelRevision:1}]);
  expect(input.inspect({limit:10}).focusId).toBe('far');
  expect(input.handle({type:'activate',controlId:'unavailable',inputId:'hidden'})).toEqual([]);
  expect(()=>input.update({id:'test:hidden-tree',plan:make(false,1)})).toThrow(/revision/i);
  input.update({id:'test:hidden-tree',plan:make(false,2)});
  expect(input.handle({type:'navigate',direction:'up'})).toEqual([{kind:'focus',controlId:'unavailable',modelRevision:2}]);
  input.dispose();
  const reversed={...plan,records:[...plan.records].reverse()},unordered=createUiInteraction({id:'test:hidden-tree',plan:reversed},{navigation:'spatial'});
  expect(unordered.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'far',modelRevision:1}]);
  unordered.dispose();
});

test('logical spatial: raw context geometry preserves readable disabled focus and directional order',async()=>{
  const {createUiInteraction}=await api(),other=context('app:other');other.localToPhysical={scale:2,origin:{x:20,y:40}};
  const box={x:0,y:0,width:10,height:10},s=scope([
    control('origin',20,{bounds:{...box,x:20,y:10},focusBounds:{...box,x:20,y:10},effectiveFocusBounds:{...box,x:20,y:10}}),
    control('near',0,{semanticContextId:other.id,contextRevisions:{[other.id]:1},state:'clipped',effectiveFocusBounds:null,effectiveHitBounds:null,enabled:false}),
    control('visible-far',20,{focusBounds:{...box,x:20,y:100},effectiveFocusBounds:{...box,x:20,y:100}})
  ]);s.plan.contexts.push(other);s.plan.focus={initialId:'origin',order:['origin','near','visible-far']};
  const ui=createUiInteraction(s,{navigation:'spatial'});
  expect(ui.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'near',modelRevision:1}]);
  expect(ui.handle({type:'activate',inputId:'disabled'})).toEqual([]);
  expect(ui.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'visible-far',modelRevision:1}]);ui.dispose();
});

test('logical spatial: hidden missing zero and undeclared geometry cannot become directional targets',async()=>{
  const {createUiInteraction}=await api(),box={x:0,y:20,width:10,height:10};
  const s=scope([control('from',0),control('hidden',0,{focusBounds:box,state:'hidden'}),control('zero',0,{focusBounds:{...box,width:0},effectiveFocusBounds:null,state:'clipped'}),control('decoration',0,{focusBounds:box,focusable:false}),control('undeclared',0,{focusBounds:box}),control('next',0,{focusBounds:{...box,y:40},effectiveFocusBounds:null,effectiveHitBounds:null,state:'clipped'})]);
  s.plan.focus={initialId:'from',order:['from','hidden','missing','zero','decoration','next']};
  const ui=createUiInteraction(s,{navigation:'spatial'});
  expect(ui.handle({type:'navigate',direction:'down'})).toEqual([{kind:'focus',controlId:'next',modelRevision:1}]);
  expect(ui.handle({type:'navigate',direction:'down'})).toEqual([]);ui.dispose();
});

test.each(['left','right','up','down'])('logical spatial: %s wrap uses physical edge and declared tie order',async direction=>{
  const {createUiInteraction}=await api(),horizontal=['left','right'].includes(direction),sign=['left','up'].includes(direction)?-1:1;
  const box=n=>({x:horizontal?n*sign:0,y:horizontal?0:n*sign,width:10,height:10});
  const s=scope(['from','tied-last','tied-first'].map((id,i)=>control(id,0,{focusBounds:box(i?-20:0),effectiveFocusBounds:i?null:box(0),effectiveHitBounds:i?null:box(0),state:i?'clipped':'visible'})));
  s.plan.focus={initialId:'from',order:['from','tied-first','tied-last']};
  const ui=createUiInteraction(s,{navigation:'spatial',wrap:true});
  expect(ui.handle({type:'navigate',direction})).toEqual([{kind:'focus',controlId:'tied-first',modelRevision:1}]);ui.dispose();
});

test('independent regions: focus does not enlarge activation and geometry changes still invalidate held input',async()=>{
  const {createUiInteraction}=await api(),u=await import('../../server/build/ui-components.mjs'),{layoutUi}=await import('../../server/build/ui-layout.mjs'),{defineTheme}=await import('../../server/build/ui-theme.mjs');
  const theme=defineTheme({version:1,id:'test:regions',roles:{button:{}},geometry:{minTarget:0}}),ctx={id:'test:regions',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:100,height:60}};
  const plan=(revision=1,enabled=true,dx=-5)=>layoutUi(u.button({id:'small',actionId:'game:small',enabled,layout:{x:30,y:20,width:20,height:10},regions:{hit:{x:dx,y:-5,width:30,height:20},focus:{x:-20,y:-10,width:60,height:30}}}),{theme,context:ctx,revision});
  const input=createUiInteraction({id:'test:regions',plan:plan()});
  input.handle({type:'press',inputId:'focus-only',point:{x:12,y:12}});expect(input.inspect({limit:1}).heldCount).toBe(0);
  expect(input.handle({type:'release',inputId:'focus-only',point:{x:12,y:12}})).toEqual([]);
  input.handle({type:'press',inputId:'target-padding',point:{x:27,y:17}});expect(input.inspect({limit:1}).heldCount).toBe(1);
  expect(input.handle({type:'release',inputId:'target-padding',point:{x:27,y:17}}).map(i=>i.actionId)).toEqual(['game:small']);
  input.handle({type:'press',inputId:'held',point:{x:27,y:17}});expect(()=>input.update({id:'test:regions',plan:plan(1,true,-4)})).toThrow(/revision/i);
  input.update({id:'test:regions',plan:plan(2,false)});expect(input.inspect({limit:1}).focusId).toBe('small');expect(input.inspect({limit:1}).heldCount).toBe(0);
  expect(input.handle({type:'activate',controlId:'small',inputId:'disabled'})).toEqual([]);input.dispose();
});

test('independent regions review: context revision cannot admit authored region changes at the same model revision',async()=>{
  const {createUiInteraction}=await api(),u=await import('../../server/build/ui-components.mjs'),{layoutUi}=await import('../../server/build/ui-layout.mjs'),{defineTheme}=await import('../../server/build/ui-theme.mjs');
  const theme=defineTheme({version:1,id:'test:regions',roles:{button:{}},geometry:{minTarget:0}});
  const ctx={id:'test:regions',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:100,height:60}};
  const plan=(model,context,dx)=>layoutUi(u.button({id:'small',actionId:'game:small',layout:{x:30,y:20,width:20,height:10},regions:{hit:{x:dx,y:0,width:30,height:10}}}),{theme,context:{...ctx,revision:context},revision:model});
  const input=createUiInteraction({id:'test:regions',plan:plan(1,1,0)});
  input.update({id:'test:regions',plan:plan(1,2,0)});
  expect(()=>input.update({id:'test:regions',plan:plan(1,3,-10)})).toThrow(/revision/i);
  input.handle({type:'press',inputId:'outside',point:{x:25,y:25}});expect(input.handle({type:'release',inputId:'outside',point:{x:25,y:25}})).toEqual([]);
  input.update({id:'test:regions',plan:plan(2,3,-10)});
  input.handle({type:'press',inputId:'new',point:{x:25,y:25}});expect(input.handle({type:'release',inputId:'new',point:{x:25,y:25}}).map(i=>i.actionId)).toEqual(['game:small']);input.dispose();
});

test('spatial wrap chooses the opposite edge nearest across in all four directions',async()=>{
  const {createUiInteraction}=await api();
  const records=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const box={x:col*12,y:row*12,width:9,height:9};
    records.push(control(`${row}${col}`,box.x,{bounds:box,hitBounds:box,focusBounds:box,effectiveHitBounds:box,effectiveFocusBounds:box}));
  }
  for(const [from,direction,to] of [['03','right','00'],['00','left','03'],['02','up','22'],['22','down','02']]){
    for(const wrap of [true,false]){
      const s=scope(records);s.plan.focus={initialId:from};const input=createUiInteraction(s,{navigation:'spatial',wrap});
      input.handle({type:'navigate',direction});expect(input.inspect({limit:20}).focusId).toBe(wrap?to:from);input.dispose();
    }
  }
});

test('spatial wrap uses physical contexts, stable cross-axis ties and visible eligible controls only',async()=>{
  const {createUiInteraction}=await api(),other=context('app:other');
  other.localToPhysical={scale:2,origin:{x:100,y:0}};
  const s=scope([control('right',0,{semanticContextId:other.id,contextRevisions:{[other.id]:1}}),control('left-first',0),control('left-tied',0),control('hidden',-10,{state:'hidden'}),control('decorative',-20,{focusable:false})]);
  s.plan.contexts.push(other);s.plan.focus={initialId:'right'};
  const input=createUiInteraction(s,{navigation:'spatial',wrap:true});input.handle({type:'navigate',direction:'right'});
  expect(input.inspect({limit:20}).focusId).toBe('left-first');
  input.handle({type:'navigate',direction:'left'});expect(input.inspect({limit:20}).focusId).toBe('right');
  input.dispose();
});

test('state-owner identity participates in revision validation and linked labels never become input owners',async()=>{
  const {createUiInteraction}=await api();
  const linked=control('label',0,{kind:'text',role:'text',focusable:false,actionId:undefined,metadata:{'ui:stateOwner':'a'}});
  const s=scope([control('a',0),control('b',20),linked]),ui=createUiInteraction(s);
  ui.handle({type:'press',inputId:'p',point:{x:2,y:2}});ui.handle({type:'hover',point:{x:2,y:2}});
  expect(ui.inspect({limit:10}).heldCount).toBe(1);
  expect(ui.handle({type:'release',inputId:'p',point:{x:2,y:2}})).toMatchObject([{controlId:'a'}]);
  const rebound=structuredClone(s);rebound.plan.records[2].metadata['ui:stateOwner']='b';
  expect(()=>ui.update(rebound)).toThrow(/revision/);
  ui.handle({type:'press',inputId:'p2',point:{x:2,y:2}});rebound.plan.revision=2;ui.update(rebound);
  expect(ui.handle({type:'release',inputId:'p2',point:{x:2,y:2}})).toEqual([]);
  const forged=structuredClone(s);forged.plan.focus.order=['a','label'];
  expect(()=>createUiInteraction(forged)).toThrow(/state.owner|authority/);
});

test('focus style leaf panel link retains one itemSlot input owner and rejects forged authority or parentage',async()=>{
  const {createUiInteraction}=await api();
  const owner=control('a',0,{kind:'itemSlot',parentId:null}),wash=control('wash',0,{kind:'panel',parentId:null,focusable:false,actionId:undefined,children:[],parts:[{kind:'flat'}],metadata:{'ui:stateOwner':'a'}});
  const s=scope([owner,wash]),ui=createUiInteraction(s);
  ui.handle({type:'press',inputId:'p',point:{x:2,y:2}});expect(ui.inspect({limit:4}).heldCount).toBe(1);
  expect(ui.handle({type:'release',inputId:'p',point:{x:2,y:2}})).toMatchObject([{controlId:'a'}]);
  expect(ui.handle({type:'activate',inputId:'bad',controlId:'wash'})).toEqual([]);
  for(const patch of [{focusable:true},{actionId:'game:bad'},{children:[{id:'a'}]},{parts:[{kind:'skin'}]},{metadata:{'ui:stateOwner':'missing'}},{focus:{defaultId:'a'}}]){
    const forged=structuredClone(s);Object.assign(forged.plan.records[1],patch);expect(()=>createUiInteraction(forged)).toThrow(/state.owner|authority|flat|sibling/i);
  }
  const nested=structuredClone(s);nested.plan.records.push(control('parent',20,{kind:'panel',parentId:null,focusable:false,actionId:undefined}));nested.plan.records[1].parentId='parent';
  expect(()=>createUiInteraction(nested)).toThrow(/state.owner|sibling/i);
  const chain=structuredClone(s);chain.plan.records[0].metadata={'ui:stateOwner':'wash'};expect(()=>createUiInteraction(chain)).toThrow(/state.owner/i);
  const ordered=structuredClone(s);ordered.plan.focus.order=['a','wash'];expect(()=>createUiInteraction(ordered)).toThrow(/state.owner|authority/i);
  ui.dispose();
});

test('declared semantic navigation requests off-page reveal without granting activation and preserves cyclic order',async()=>{
  const {createUiInteraction}=await api(),s=scope([control('a',0),control('pager',20),control('c',40)]);
  s.plan.focus.order=['a','off-page','c'];const ui=createUiInteraction(s,{navigation:'ordered',wrap:true});
  expect(ui.handle({type:'navigate',direction:'next'})).toEqual([{kind:'focus',controlId:'off-page',modelRevision:1}]);
  expect(ui.inspect({limit:10}).focusId).toBe('off-page');
  expect(ui.handle({type:'activate',inputId:'no-stale-focus'})).toEqual([]);
  expect(ui.handle({type:'activate',controlId:'off-page',inputId:'not-painted'})).toEqual([]);
  const next=scope([control('a',0),control('off-page',20),control('c',40)]);next.plan.revision=2;next.plan.focus={initialId:'off-page',order:['a','off-page','c']};
  ui.update(next);ui.handle({type:'focus',controlId:'off-page'});
  expect(ui.handle({type:'navigate',direction:'next'})).toEqual([{kind:'focus',controlId:'c',modelRevision:2}]);
  expect(ui.inspect({limit:10}).focusId).toBe('c');
  expect(ui.handle({type:'navigate',direction:'next'})).toEqual([{kind:'focus',controlId:'a',modelRevision:2}]);
  expect(ui.handle({type:'navigate',direction:'previous'})).toEqual([{kind:'focus',controlId:'c',modelRevision:2}]);
  expect(()=>createUiInteraction({...s,plan:{...s.plan,focus:{order:['a','a']}}})).toThrow(/order|duplicate/i);
  const clipped=scope([control('a',0),control('clipped',20,{state:'clipped',effectiveHitBounds:null,effectiveFocusBounds:null})]);
  clipped.plan.focus.order=['a','clipped'];const reveal=createUiInteraction(clipped,{navigation:'ordered'});
  expect(reveal.handle({type:'navigate',direction:'next'})).toEqual([{kind:'focus',controlId:'clipped',modelRevision:1}]);
  expect(reveal.handle({type:'activate',inputId:'clipped'})).toEqual([]);
  const changed=structuredClone(next);changed.plan.focus.order=['c','off-page','a'];expect(()=>ui.update(changed)).toThrow(/revision/i);
  const anchored=scope([control('c',40)]);anchored.plan.focus={initialId:'off-page',order:['a','off-page','c']};
  const logical=createUiInteraction(anchored,{navigation:'ordered',wrap:true});expect(logical.inspect({limit:10}).focusId).toBe('off-page');
  expect(logical.handle({type:'activate',inputId:'logical-only'})).toEqual([]);
  expect(logical.handle({type:'navigate',direction:'next'})).toEqual([{kind:'focus',controlId:'c',modelRevision:1}]);
});

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
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());const down={type:'press',controlId:'a',inputId:'pointer:1',point:{x:2,y:2},pointSpace:'physical'};const up={type:'release',inputId:'pointer:1',point:{x:2,y:2},pointSpace:'physical'};
  ui.handle(down);expect(ui.handle({...up,inputId:'pointer:2'})).toEqual([]);expect(ui.handle(up)).toHaveLength(1);expect(ui.handle(up)).toEqual([]);
  ui.handle(down);const next=scope();next.plan.revision=2;ui.update(next);expect(ui.handle(up)).toEqual([]);
  ui.handle(down);const context=scope();context.plan.revision=3;context.plan.contexts[0].revision=2;for(const c of context.plan.records)c.contextRevisions['app:main']=2;ui.update(context);expect(ui.handle(up)).toEqual([]);
  expect(()=>ui.update(scope())).toThrow(/revision|stale/i);ui.dispose();ui.dispose();expect(ui.handle(down)).toEqual([]);expect(ui.inspect({limit:1}).disposed).toBe(true);
  const clipped=createUiInteraction(scope([control('a',0,{effectiveHitBounds:{x:0,y:0,width:3,height:10}})]));clipped.handle({...down,point:{x:5,y:2},pointSpace:'physical'});expect(clipped.handle(up)).toEqual([]);
});

test('mapping reuse and stale node mappings fail before replacing valid state; inspect is bounded',async()=>{
  const {createUiInteraction}=await api();const ui=createUiInteraction(scope());const changed=scope();changed.plan.records[0].enabled=false;expect(()=>ui.update(changed)).toThrow(/revision/i);expect(ui.inspect({limit:1}).controls).toHaveLength(1);expect(ui.inspect({limit:1}).nextAfterId).toBe('a');expect(ui.inspect({limit:1,afterId:'a'}).controls[0].id).toBe('b');
  const stale=scope();stale.plan.records[0].contextRevisions['app:main']=0;expect(()=>createUiInteraction(stale)).toThrow(/context|stale/i);
  const dup=scope();dup.plan.records.push(dup.plan.records[0]);expect(()=>createUiInteraction(dup)).toThrow(/duplicate/i);
  const missing=scope();delete missing.plan.contexts[0].localToPhysical;expect(()=>createUiInteraction(missing)).toThrow(/context|resolution|physical/i);
  const noSemantic=scope();delete noSemantic.plan.records[0].semanticContextId;expect(()=>createUiInteraction(noSemantic)).toThrow(/semantic|context/i);
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
  const {createUiInteraction}=await api();const s=scope();s.plan.contexts.push(context('app:other'));const ui=createUiInteraction(s,{restoreId:'a'});ui.handle({type:'press',controlId:'a',inputId:'p',point:{x:1,y:1},pointSpace:'physical'});
  const next=structuredClone(s);next.plan.contexts[1].revision=2;ui.update(next);expect(ui.handle({type:'release',inputId:'p',point:{x:1,y:1},pointSpace:'physical'})).toHaveLength(1);expect(ui.inspect({limit:10}).focusId).toBe('a');
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
  ui.handle({type:'press',controlId:'a',inputId:'pointer:tap',point:{x:2,y:2},pointSpace:'physical'});
  expect(ui.handle({type:'release',inputId:'pointer:tap',point:{x:2,y:2},pointSpace:'physical'})).toEqual([{kind:'activate',controlId:'a',actionId:'action:a',modelRevision:1,activationId:expect.any(String)}]);
  expect(ui.handle({type:'release',inputId:'pointer:tap',point:{x:2,y:2},pointSpace:'physical'})).toEqual([]);expect(ui.inspect({limit:2}).focusId).toBe('c');
  for(const extra of [{enabled:false},{effectiveHitBounds:null},{effectiveHitBounds:{x:0,y:0,width:1,height:1}}]){
    const refused=scope([control('a',0,{focusable:false,...extra})]);refused.plan.focus={};const input=createUiInteraction(refused);input.handle({type:'press',controlId:'a',inputId:'p',point:{x:2,y:2},pointSpace:'physical'});expect(input.handle({type:'release',inputId:'p',point:{x:2,y:2},pointSpace:'physical'})).toEqual([]);
  }
  ui.handle({type:'press',controlId:'a',inputId:'old',point:{x:2,y:2},pointSpace:'physical'});const next=structuredClone(s);next.plan.revision=2;ui.update(next);expect(ui.handle({type:'release',inputId:'old',point:{x:2,y:2},pointSpace:'physical'})).toEqual([]);
  const roles=structuredClone(s);roles.plan.focus={initialId:'c',defaultId:'a',cancelId:'a'};const withRoles=createUiInteraction(roles);expect(withRoles.handle({type:'default',inputId:'default'})[0].controlId).toBe('a');expect(withRoles.handle({type:'cancel',inputId:'cancel'})[0].controlId).toBe('a');
});

test('coordinator exact stale-geometry witness: unrelated revisions cannot relocate a held control',async()=>{
  const {createUiInteraction}=await api();
  const source=scope([control('tap',0,{actionId:'game:tap',contextRevisions:{'game:main':1}})]);source.plan.focus={initialId:'tap'};source.plan.contexts=[context('game:main'),context('game:other')];source.plan.records[0].semanticContextId='game:main';
  const press={type:'press',controlId:'tap',inputId:'pointer:1',point:{x:2,y:2},pointSpace:'physical'};
  const stale=createUiInteraction(source);stale.handle(press);const moved=structuredClone(source);moved.plan.contexts[1].revision=2;
  for(const key of ['bounds','hitBounds','focusBounds','effectiveHitBounds','effectiveFocusBounds'])moved.plan.records[0][key]={x:20,y:0,width:10,height:10};
  expect(()=>stale.update(moved)).toThrow(/revision|geometry/i);expect(stale.inspect({limit:1}).controls[0].bounds.x).toBe(0);
  expect(stale.handle({type:'release',inputId:'pointer:1',point:{x:22,y:2},pointSpace:'physical'})).toEqual([]);
  const valid=createUiInteraction(source);valid.handle(press);const unrelated=structuredClone(source);unrelated.plan.contexts[1].revision=2;valid.update(unrelated);
  expect(valid.handle({type:'release',inputId:'pointer:1',point:{x:2,y:2},pointSpace:'physical'})).toEqual([{kind:'activate',controlId:'tap',actionId:'game:tap',modelRevision:1,activationId:expect.any(String)}]);
  expect(valid.handle({type:'release',inputId:'pointer:1',point:{x:2,y:2},pointSpace:'physical'})).toEqual([]);
});
