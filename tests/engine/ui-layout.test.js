import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {normalizeBitmapFont,iterateNineSliceTiles} from '../../server/build/ui-runtime.mjs';
async function api(){for(const file of ['ui-layout','ui-components','ui-theme'])expect(existsSync(new URL(`../../server/build/${file}.mjs`,import.meta.url)),`${file} owner exists`).toBe(true);return Promise.all(['ui-layout','ui-components','ui-theme'].map(file=>import(`../../server/build/${file}.mjs`)));}
function font(){return normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3},A:{advance:7,frames:{cream:'a'},bounds:{left:0,top:0,right:5,bottom:5}},i:{advance:2,frames:{cream:'i'},bounds:{left:0,top:0,right:0,bottom:5}}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}},a:{frame:{x:4,y:0,w:6,h:6}},i:{frame:{x:10,y:0,w:1,h:6}}}}});}
function environment(defineTheme,extra={}){return {theme:defineTheme({version:1,id:'test:theme',fonts:{body:{font:font()}},skins:{},roles:Object.fromEntries(['body','text','button','stack','row','grid','absolute','actionBar','panel','field','toggle','stepper','tabs','fold','pager','progress','meter','extension','header','card','listRow','itemSlot','separator','icon','notice','tooltip'].map(k=>[k,{font:'body',tone:'cream'}])),geometry:{gap:0,padding:0,minTarget:0}}),revision:1,context:{id:'test:main',revision:1,localToPhysical:{scale:2,x:0,y:0},sourcePixelPhysicalSize:3,viewport:{x:0,y:0,width:100,height:60}},...extra};}

test('child semantic context projects allocation and inherited clipping through physical coordinates',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  env.context={...env.context,localToPhysical:{scale:2,x:10,y:0},sourcePixelPhysicalSize:2};
  env.additionalContexts=[{...env.context,id:'test:child',localToPhysical:{scale:1,x:100,y:0},sourcePixelPhysicalSize:1,viewport:{x:-100,y:0,width:200,height:120}}];
  const plan=layoutUi(u.absolute({id:'root',layout:{width:20,height:10,overflow:'clip'},children:[u.button({id:'child',contextId:'test:child',label:'?',actionId:'game:child',layout:{width:20,height:10}})]}),env);
  const record=plan.records.find(r=>r.id==='child');
  expect(record.semanticContextId).toBe('test:child');
  expect(record.bounds).toEqual({x:-90,y:0,width:20,height:10});
  expect(record.clipBounds).toEqual({x:-90,y:0,width:40,height:20});
  expect(record.effectiveHitBounds).toEqual(record.bounds);
  expect(record.contextRevisions).toMatchObject({'test:child':1,'test:main':1});
});

test('mixed semantic contexts convert child intrinsic and explicit sizes before parent row allocation',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api(),env=environment(defineTheme);
  env.context={...env.context,sourcePixelPhysicalSize:2};
  env.additionalContexts=[{...env.context,id:'test:child',sourcePixelPhysicalSize:1,localToPhysical:{scale:1,x:100,y:0},viewport:{x:-100,y:0,width:300,height:120}}];
  const tree=u.row({id:'row',layout:{width:50,height:20,align:'start'},children:[u.button({id:'intrinsic',contextId:'test:child',label:'?'}),u.button({id:'fixed',contextId:'test:child',label:'?',layout:{width:10,height:10}}),u.button({id:'main',label:'?'})]});
  const records=layoutUi(tree,env).records;
  expect(records[1].bounds).toEqual({x:-100,y:0,width:5,height:8});
  expect(records[2].bounds).toEqual({x:-95,y:0,width:10,height:10});
  expect(records[3].bounds.x).toBe(7.5);
});

test.each(['scroll','paginate','clip'])('review own text contributes to %s extent and field decoration movement',async overflow=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);env.context={...env.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  for(const kind of ['text','field']){
    const content='AA\nAA\nAA',node=kind==='text'?u.text({id:'f',label:content,layout:{width:14,maxHeight:8,overflow,scrollY:16,page:2}}):u.field({id:'f',value:content,selection:{start:6,end:8,direction:'forward'},composition:'i',layout:{width:14,maxHeight:8,overflow,scrollY:16,page:2}});
    const r=layoutUi(node,env).records[0],offset=overflow==='clip'?0:16;
    expect(r.overflow.maxScrollY).toBe(16);expect(r.overflow.vertical).toBe(true);
    expect(r.text.lines.map(line=>line.y)).toEqual([0-offset,8-offset,16-offset]);
    if(overflow==='paginate'){expect(r.overflow.pageCount).toBe(3);expect(r.overflow.page).toBe(2);}
    if(kind==='field')for(const part of r.parts.filter(p=>['selection','caret','composition'].includes(p.kind)))expect(part.bounds?.y??part.placement.lines[0].y).toBe(16-offset);
    expect(r.contentClipBounds).toEqual({x:0,y:0,width:14,height:8});
  }
});

test('review text scrolling maps into a separate label context and paginated children follow text',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);env.context={...env.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  env.additionalContexts=[{...env.context,id:'test:labels',localToPhysical:{scale:2,x:0,y:0}}];
  const mixed=layoutUi(u.field({id:'mixed',labelContextId:'test:labels',value:'AA\nAA\nAA',selection:{start:6,end:8,direction:'forward'},composition:'i',layout:{width:14,maxHeight:8,overflow:'scroll',scrollY:16}}),env).records[0];
  expect(mixed.text.lines.map(line=>line.y)).toEqual([-8,-4,0]);expect(mixed.parts.find(p=>p.kind==='caret').bounds.y).toBe(0);expect(mixed.overflow.maxScrollY).toBe(16);
  const tree=page=>u.panel({id:'pages',label:'AA\nAA\nAA',layout:{width:14,maxHeight:8,overflow:'paginate',page},children:[u.button({id:'next',label:'?',actionId:'go'})]});
  const textPage=layoutUi(tree(2),env),childPage=layoutUi(tree(3),env);
  expect(textPage.records[0].overflow.pageCount).toBe(4);expect(textPage.records[0].text.lines[2].y).toBe(0);expect(textPage.records[1].state).toBe('clipped');
  expect(childPage.records[0].text).toBeUndefined();expect(childPage.records[1].state).toBe('visible');expect(childPage.records[1].bounds.y).toBe(0);
});

test('review child maxWidth is resolved before wrapping and reserving sibling height',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);env.context={...env.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  const p=layoutUi(u.stack({id:'s',children:[u.text({id:'txt',label:'AA AA',layout:{maxWidth:14}}),u.button({id:'b',label:'?',actionId:'go'})]}),env);
  expect(p.records[1].bounds).toMatchObject({width:14,height:16});expect(p.records[1].text.lines).toHaveLength(2);expect(p.records[2].bounds.y).toBe(16);
});

test.each([8,12,20])('review paginated label occupancy at height %s cannot strand child controls',async height=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);env.context={...env.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  const children=(height===20?['a','b']:['a']).map(id=>u.button({id,label:'?',actionId:id,layout:{height:8}}));
  const p=layoutUi(u.panel({id:'root',label:'AA',layout:{width:14,height,overflow:'paginate',page:1},children}),env);
  expect(p.records[0].overflow).toMatchObject({page:1,pageCount:2});expect(p.records[0].text).toBeUndefined();
  expect(p.records[1].bounds.y).toBe(0);for(const r of p.records.slice(1)){expect(r.state).toBe('visible');expect(r.effectiveHitBounds.height).toBe(8);}
});

test('review tab strip overflow follows unwrapped paint and horizontal hit regions',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);env.context={...env.context,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1};
  const r=layoutUi(u.tabs({id:'tabs',value:'a',options:[{id:'a',label:'AA'},{id:'b',label:'AA'}],layout:{width:14,height:8,overflow:'scroll',scrollX:20,scrollY:8}}),env).records[0];
  expect(r.overflow).toMatchObject({maxScrollX:20,maxScrollY:0,scrollX:20,scrollY:0});
  const second=r.parts.find(p=>p.kind==='tab'&&p.value==='b');expect(second.bounds.x).toBe(0);expect(second.hitBounds).toEqual({x:0,y:0,width:14,height:8});
});

test('review pointer routing resolves decorations to controls and blocks disabled overlays',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const {createUiInteraction}=await import('../../server/build/ui-interaction.mjs');const env=environment(defineTheme);
  const tap=(tree,p={x:2,y:2})=>{const ui=createUiInteraction({id:'test:tap',plan:layoutUi(tree,env)});ui.handle({type:'press',inputId:'p',point:p});return ui.handle({type:'release',inputId:'p',point:p});};
  const button=enabled=>u.button({id:'b',enabled,actionId:'go',layout:{width:40,height:20},children:[u.text({id:'caption',label:'?'})]});
  expect(tap(button(true))).toMatchObject([{kind:'activate',controlId:'b',actionId:'go'}]);
  expect(tap(u.absolute({id:'root',children:[u.button({id:'under',actionId:'under',layout:{width:40,height:20}}),button(false)]}))).toEqual([]);
  expect(tap(u.absolute({id:'root',children:[u.button({id:'under',actionId:'under',layout:{width:40,height:20}}),u.text({id:'decor',label:'?'})]}))[0].controlId).toBe('under');
});

test('review pointer parts retain selected tabs and decrement direction across release',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const {createUiInteraction}=await import('../../server/build/ui-interaction.mjs');const env=environment(defineTheme);
  const exercise=(tree,p,release=p)=>{const plan=layoutUi(tree,env),ui=createUiInteraction({id:'test:parts',plan});ui.handle({type:'press',inputId:'p',point:p});const result=ui.handle({type:'release',inputId:'p',point:release});expect(ui.handle({type:'release',inputId:'p',point:release})).toEqual([]);return {result,plan,ui};};
  const step=value=>u.stepper({id:'s',value,min:0,max:10,layout:{width:40,height:20}});
  expect(exercise(step(5),{x:2,y:2}).result).toMatchObject([{value:4}]);
  expect(exercise(step(5),{x:30,y:2}).result).toMatchObject([{value:6}]);
  expect(exercise(step(5),{x:2,y:2},{x:30,y:2}).result).toEqual([]);
  expect(exercise(step(0),{x:2,y:2}).result).toEqual([]);
  const tabs=u.tabs({id:'t',value:'b',options:[{id:'a',label:'?'},{id:'b',label:'?'},{id:'c',label:'?',enabled:false}],layout:{width:60,height:20}});
  const first=exercise(tabs,{x:2,y:2});expect(first.result).toMatchObject([{value:'a'}]);
  const disabled=first.plan.records[0].parts.find(p=>p.kind==='tab'&&p.value==='c');expect(exercise(tabs,{x:disabled.bounds.x+1,y:2}).result).toEqual([]);
  const clipped=u.stack({id:'clip',layout:{width:10,height:20,overflow:'clip'},children:[step(5)]});expect(exercise(clipped,{x:30,y:2}).result).toEqual([]);
  const plan=layoutUi(step(5),env),ui=createUiInteraction({id:'test:parts',plan});ui.handle({type:'press',inputId:'stale',point:{x:2,y:2}});ui.update({id:'test:parts',plan:layoutUi(step(5),{...env,revision:2})});expect(ui.handle({type:'release',inputId:'stale',point:{x:2,y:2}})).toEqual([]);
});

test.each([true,false])('review hollow and tile=%s reach physical plans and the public iterator',async tile=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);const theme=defineTheme({version:1,id:'test:hollow',skins:{s:{frame:{x:0,y:0,width:12,height:12},insets:2,center:'omit',tile}},roles:{panel:{alternatives:[{kind:'skin',id:'s'}]}}});
  const plan=layoutUi(u.panel({id:'p',layout:{width:40,height:30}}),{...env,theme}).records[0].parts[0].plan;
  for(const p of [plan,plan.physicalPlan]){expect(p.regions).toHaveLength(8);expect(p.regions.some(r=>r.tile)).toBe(tile);}
  const tiles=[...iterateNineSliceTiles(plan)];expect(tiles.some(q=>q.source.x===2&&q.source.y===2)).toBe(false);if(!tile)expect(tiles).toHaveLength(8);
});

test.each(['scroll','clip','paginate'])('review capped %s viewport separates content minima from extent',async overflow=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);const tree=u.stack({id:'s',layout:{maxHeight:10,overflow},children:[u.button({id:'a',label:'?'}),u.button({id:'b',label:'?'})]});
  const plan=layoutUi(tree,env),r=plan.records[0];expect(r.bounds.height).toBe(10);expect(r.measure.min.height).toBeLessThanOrEqual(10);expect(plan.records[1].bounds.height).toBe(12);expect(r.overflow.vertical||r.overflow.pageCount>1).toBe(true);
  expect(()=>u.stack({id:'bad',layout:{minHeight:11,maxHeight:10,overflow}})).toThrow(/min/i);
});

test('review field UTF-16 offsets survive repeated spaces, normalization, wrapping and composition',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  for(const [value,start,end,width] of [['?  ?',3,4,40],['?\r\n\t?',4,5,40],['😀  ?',4,5,9]]){
    const r=layoutUi(u.field({id:'f',value,selection:{start,end,direction:'forward'},composition:'i',layout:{width,height:50}}),env).records[0],last=r.text.lines.at(-1),caret=r.parts.find(p=>p.kind==='caret'),selection=r.parts.filter(p=>p.kind==='selection').at(-1);
    expect(caret.bounds.x).toBe(last.x+last.width);expect(caret.bounds.y).toBe(last.y);expect(selection.bounds.x).toBe(last.x+last.width-7.5);expect(selection.bounds.width).toBe(7.5);expect(r.parts.find(p=>p.kind==='composition').placement.lines[0].x).toBe(caret.bounds.x);
  }
});

test('review nested rows have a generous public metric-read budget and preserve width wrapping',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);let reads=0;
  const original=env.theme.fonts.body.font,glyph={...original.glyphs.A};Object.defineProperty(glyph,'advance',{get(){reads++;return 7;},enumerable:true});
  const instrumented={...original,glyphs:{...original.glyphs,A:glyph}};env.theme={...env.theme,fonts:{...env.theme.fonts,body:{...env.theme.fonts.body,font:instrumented}}};
  let tree=u.text({id:'leaf',label:'AA AA'});for(let i=0;i<12;i++)tree=u.row({id:`r${i}`,children:[tree]});
  const wide=layoutUi(tree,env),wideReads=reads;reads=0;const narrow=layoutUi(tree,{...env,context:{...env.context,viewport:{...env.context.viewport,width:12}}});
  console.log(JSON.stringify({cost:'nested-row-metric-reads',nodes:13,wide:wideReads,narrow:reads}));expect(wideReads+reads).toBeLessThan(10000);expect(narrow.records.at(-1).text.lines.length).toBeGreaterThan(wide.records.at(-1).text.lines.length);
});

test('text uses actual advances and physical pixel footprint while semantic bounds remain continuous',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  const result=layoutUi(u.text({id:'label',label:'Ai',layout:{x:.25,y:.25,width:20,height:12}}),env);const r=result.records[0];
  expect(r.measure.preferred.width).toBe(13.5);expect(r.hitBounds.x).toBe(.25);expect(r.paintBounds.x*2).toBe(Math.round(r.paintBounds.x*2));expect(r.text.draws[0].destination.width).toBe(9);expect(r.text.context).toEqual({id:'test:main',revision:1});
  expect(result.contexts[0].sourceToLocalScale).toBe(1.5);expect(Object.isFrozen(r)).toBe(true);
});

test('row, stack, grid and absolute allocate real children and honor minimums and grow',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  const b=id=>u.button({id,label:'i',layout:{minWidth:10,height:12,grow:1}});
  const r=layoutUi(u.row({id:'row',layout:{gap:4,width:100,height:20},children:[b('a'),b('b')]}),env);expect(r.records[1].bounds.width).toBe(48);expect(r.records[2].bounds.x).toBe(52);
  const s=layoutUi(u.stack({id:'s',layout:{gap:3},children:[b('a'),b('b')]}),env);expect(s.records[2].bounds.y).toBe(15);
  const g=layoutUi(u.grid({id:'g',layout:{columns:2,gap:4},children:[b('a'),b('b'),b('c')]}),env);expect(g.records[3].bounds.y).toBe(16);expect(g.records[2].bounds.x).toBe(52);
  const a=layoutUi(u.absolute({id:'abs',children:[u.panel({id:'p',layout:{x:17,y:9,width:22,height:13}})]}),env);expect(a.records[1].bounds).toEqual({x:17,y:9,width:22,height:13});
  expect(()=>layoutUi(u.panel({id:'p',appearanceRole:'missing'}),env)).toThrow(/role/i);
});

test('overflow explicitly clips hits/focus, scrolls content and paginates without changing order',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);const children=['a','b','c'].map(id=>u.button({id,label:'A',layout:{height:20}}));
  const make=(overflow,more={})=>u.stack({id:'root',layout:{height:30,width:40,overflow,...more},children});
  const clipped=layoutUi(make('clip'),env);expect(clipped.records[2].effectiveHitBounds.height).toBe(10);expect(clipped.records[3].effectiveHitBounds).toBe(null);expect(clipped.records[3].state).toBe('clipped');
  const scroll=layoutUi(make('scroll',{scrollY:25}),env);expect(scroll.records[1].bounds.y).toBe(-25);expect(scroll.records[2].effectiveHitBounds.height).toBe(15);expect(scroll.records[0].overflow.maxScrollY).toBe(30);
  const paged=layoutUi(make('paginate',{page:1}),env);expect(paged.records[0].overflow.pageCount).toBe(3);expect(paged.records.filter(n=>n.state!=='clipped').map(n=>n.id)).toEqual(['root','b']);expect(paged.records[2].bounds.y).toBe(0);
  expect(()=>layoutUi(make('scroll',{scrollY:NaN}),env)).toThrow();
});

test('action bars delegate topology and resolve measured height with explicit visual order',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  const result=layoutUi(u.actionBar({id:'bar',visualOrder:['b','a'],fallbackOrder:['a','b'],layout:{width:40,gap:4},children:[u.button({id:'a',label:'AA'}),u.button({id:'b',label:'AA'})]}),env);
  const bar=result.records[0];expect(bar.actionPlan.format).toBe('agent-sprites/action-group@1');expect(bar.actionPlan.semanticIds).toEqual(['a','b']);expect(bar.actionPlan.allocation.arrangement).toBe('stack');expect(result.records[1].id).toBe('a');expect(result.records[2].bounds.y).toBeGreaterThan(result.records[1].bounds.y);expect(bar.measure.preferred.height).toBeGreaterThan(20);
});

test('mixed contexts validate references, duplicates and all dependent revisions atomically',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);const other={...env.context,id:'test:label',sourcePixelPhysicalSize:2};
  const tree=u.button({id:'b',label:'Ai',skinContextId:'test:main',labelContextId:'test:label'});const result=layoutUi(tree,{...env,additionalContexts:[other]});expect(result.records[0].contextRevisions).toEqual({'test:main':1,'test:label':1});expect(result.records[0].text.resolution.sourceToLocalScale).toBe(1);
  expect(()=>layoutUi(tree,env)).toThrow(/context/i);expect(()=>layoutUi(tree,{...env,additionalContexts:[env.context]})).toThrow(/duplicate/i);
  const mapped=layoutUi(tree,{...env,additionalContexts:[{...other,localToPhysical:{scale:4,x:10,y:0}}]});expect(mapped.records[0].measure.preferred.width).toBe(9);expect(mapped.records[0].text.draws[0].physicalDestination.x).toBe(0);expect(mapped.records[0].text.draws[0].destination.x).toBe(-2.5);expect(mapped.records[0].paintBounds.x).toBe(0);
});

test('allocated extensions require deterministic measurements and use stock clipping and semantic controls',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);const tree=u.extension({id:'chart',extensionId:'app:chart',model:{points:[1,2]},layout:{width:30,height:10,overflow:'clip'},children:[u.button({id:'zoom',label:'i',layout:{height:20}})]});
  const extensions={'app:chart':{version:1,measure:model=>({min:{width:10,height:5},preferred:{width:model.points.length*20,height:20},overflow:'clip'})}};
  const plan=layoutUi(tree,{...env,extensions});expect(plan.records[0].measure.preferred.width).toBe(40);expect(plan.records[1].effectiveHitBounds.height).toBe(10);expect(()=>layoutUi(tree,env)).toThrow(/extension/i);
});

test('grid measures wrapped text at the allocated cell width and paginates whole rows',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  const tree=u.grid({id:'grid',layout:{width:24,height:30,columns:2,overflow:'paginate',page:1},children:['a','b','c','d'].map(id=>u.button({id,label:'AA'}))});
  const result=layoutUi(tree,env);expect(result.records[0].measure.preferred.height).toBe(48);expect(result.records[0].overflow.pageCount).toBe(2);expect(result.records.filter(r=>r.id!=='grid'&&r.state==='visible').map(r=>r.id)).toEqual(['c','d']);expect(result.records[3].bounds.y).toBe(0);expect(result.records[3].bounds.height).toBe(24);
});

test('stock controlled parts expose deterministic value geometry and caret; skin plans preserve hollow tiled edges',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);
  const f=layoutUi(u.field({id:'f',value:'Ai',selection:{start:1,end:2,direction:'backward'}}),env).records[0];expect(f.parts.find(p=>p.kind==='caret').bounds.x).toBe(10.5);expect(f.parts.find(p=>p.kind==='selection').bounds.width).toBe(3);
  const tabs=layoutUi(u.tabs({id:'t',value:'b',options:[{id:'a',label:'A'},{id:'b',label:'i'}]}),env).records[0];expect(tabs.parts.filter(p=>p.kind==='tab').map(p=>[p.value,p.selected])).toEqual([['a',false],['b',true]]);
  const step=layoutUi(u.stepper({id:'s',value:1,min:0,max:2}),env).records[0];expect(step.parts.filter(p=>p.kind==='adjust').map(p=>p.delta)).toEqual([-1,1]);
  const meter=layoutUi(u.meter({id:'m',value:1,min:0,max:4,layout:{width:40,height:8}}),env).records[0];expect(meter.parts.find(p=>p.kind==='meter').fill.width).toBe(10);
  const input={version:1,id:'test:skin',fonts:env.theme.fonts,skins:{hollow:{frame:{x:0,y:0,width:12,height:12},insets:{left:2,right:2,top:2,bottom:2},center:'omit',tile:true}},roles:{panel:{alternatives:[{kind:'skin',id:'hollow'}]}}};
  const skin=layoutUi(u.panel({id:'p',layout:{width:40,height:30}}),{...env,theme:defineTheme(input)}).records[0].parts[0];expect(skin.plan.regions.some(r=>r.row===1&&r.column===1)).toBe(false);expect(skin.plan.regions.some(r=>r.tile)).toBe(true);
});

test('extension preparation refuses nondeterminism and context mappings fail closed',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const env=environment(defineTheme);let count=0;
  expect(()=>layoutUi(u.extension({id:'e',extensionId:'app:bad'}),{...env,extensions:{'app:bad':{version:1,measure:()=>({min:{width:0,height:0},preferred:{width:++count,height:1},overflow:'clip'})}}})).toThrow(/deterministic/i);
  expect(()=>layoutUi(u.panel({id:'p'}),{...env,context:{...env.context,localToPhysical:{scale:2,x:0,y:0,rotation:1}}})).toThrow(/mapping/i);
});

test('reading, notice and HUD families deliver scroll, controlled paging, visibility and authored meter geometry',async()=>{
  const [{layoutUi},u,{defineTheme}]=await api();const {createUiInteraction}=await import('../../server/build/ui-interaction.mjs');const env=environment(defineTheme);
  const reading=u.readingFamily({id:'read',paragraphs:['A','A','A'],bodyLayout:{height:12,overflow:'scroll'},page:{value:0,pageCount:3},initialId:'read:page',layout:{width:80,height:60}});
  const plan=layoutUi(reading,env);expect(plan.records.find(r=>r.id==='read:body').overflow.maxScrollY).toBe(24);expect(createUiInteraction({id:'test:reading',plan}).handle({type:'adjust',controlId:'read:page',delta:1,inputId:'next'})[0]).toMatchObject({kind:'change',controlId:'read:page',value:1});
  const notice=layoutUi(u.noticeFamily({id:'toast',message:'A',visible:false}),env);expect(notice.records[0].state).toBe('hidden');expect(notice.records.every(r=>r.effectiveHitBounds===null&&r.paintBounds===null)).toBe(true);
  const hud=layoutUi(u.hudFamily({id:'hud',arrangement:'absolute',items:[u.meter({id:'energy',value:1,min:0,max:4,layout:{x:20,y:4,width:40,height:8}})]}),env);expect(hud.records[1].bounds).toEqual({x:20,y:4,width:40,height:8});expect(hud.records[1].parts.find(p=>p.kind==='meter').fill.width).toBe(10);expect(createUiInteraction({id:'test:hud',plan:hud}).inspect({limit:5}).focusId).toBe(null);
});
