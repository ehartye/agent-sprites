import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {generateUIRecipe,packGrid} from '../../server/authoring/ui.js';
import * as uiRuntime from '../../server/build/ui-runtime.mjs';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
const {createBitmapFont,resolveFontText,drawNineSlice,getOpaqueBounds,pixelFit,drawPixelFit}=uiRuntime;

// Load inside these cases so a missing independent capability is a precise
// assertion failure rather than preventing the existing font/skin owner loading.
async function actionGroupPlanner(){
  const source=new URL('../../server/build/ui-action-group.mjs',import.meta.url);
  expect(existsSync(source),'independent action group artifact must exist').toBe(true);
  const module=await import(source.href);
  expect(module.planActionGroup).toBeTypeOf('function');
  return module.planActionGroup;
}
function equalActionGroup(){return {
  actions:['export','accept','cancel'].map(id=>({id,preferredWidth:50,minWidth:0,minHeight:22})),
  visualOrder:['export','accept','cancel'],fallbackOrder:['cancel','export','accept'],
  width:175,insets:{top:11,right:8,bottom:8,left:8},gap:8,rowGap:8,policy:'equal-max-fit',
};}
function authoredActionGroup(){return {
  actions:[
    {id:'overwrite',preferredWidth:140,minWidth:22,minHeight:22,fixedHeight:22},
    {id:'cancel',preferredWidth:64,minWidth:22,minHeight:22,fixedHeight:22},
  ],
  visualOrder:['cancel','overwrite'],fallbackOrder:['cancel','overwrite'],
  width:372,insets:{top:0,right:8,bottom:2,left:8},gap:6,rowGap:6,policy:'authored-width-end',
};}
test('action group preserves semantic IDs and selects native grid topology with unknown actual height',async()=>{
  const plan=(await actionGroupPlanner())(equalActionGroup());
  expect(plan).toEqual({
    format:'agent-sprites/action-group@1',semanticIds:['export','accept','cancel'],
    paintIds:['cancel','export','accept'],width:175,
    insets:{top:11,right:8,bottom:8,left:8},gap:8,rowGap:8,
    allocation:{kind:'native-equal',arrangement:'grid',columns:2,rows:[['cancel','export'],['accept']]},
    occupiedHeight:{known:false,minimum:71},
    overflow:{known:false,reason:'native-measurement-required',insetDeficit:0},
  });
});
test('action group equal floor boundary retains visual row order only when every action fits',async()=>{
  const planActionGroup=await actionGroupPlanner();
  const row=planActionGroup({...equalActionGroup(),width:182});
  expect(row.paintIds).toEqual(['export','accept','cancel']);
  expect(row.allocation).toEqual({kind:'native-equal',arrangement:'row',columns:3,rows:[['export','accept','cancel']]});
  expect(row.occupiedHeight).toEqual({known:false,minimum:41});
  // A native remainder might give one child 50; the donor requires all to fit
  // the floored equal share, so 181.5 cannot become a three-column row.
  expect(planActionGroup({...equalActionGroup(),width:181.5}).allocation)
    .toEqual({kind:'native-equal',arrangement:'grid',columns:2,rows:[['cancel','export'],['accept']]});
});
test('action group native stack does not clamp long measurements or hide an inset deficit',async()=>{
  const planActionGroup=await actionGroupPlanner();
  const stack=planActionGroup({...equalActionGroup(),width:73});
  expect(stack.allocation).toEqual({kind:'native-equal',arrangement:'stack',columns:1,rows:[['cancel'],['export'],['accept']]});
  expect(stack.occupiedHeight).toEqual({known:false,minimum:101});
  const wide=equalActionGroup();wide.actions[0].preferredWidth=200;
  expect(planActionGroup(wide).allocation).toEqual(stack.allocation);
  const deficit=planActionGroup({...equalActionGroup(),width:10});
  expect(deficit.allocation).toEqual(stack.allocation);
  expect(deficit.overflow).toEqual({known:false,reason:'native-measurement-required',insetDeficit:6});
});
test('action group native minimum uses row maxima without promoting fixed heights to native facts',async()=>{
  const planActionGroup=await actionGroupPlanner();
  const input=equalActionGroup();input.actions[0].minHeight=40;input.actions[1].minHeight=12;
  for(const action of input.actions)action.fixedHeight=200;
  const plan=planActionGroup(input);
  expect(plan.occupiedHeight).toEqual({known:false,minimum:79});
  expect(plan.overflow.known).toBe(false);
  expect(plan.allocation).not.toHaveProperty('slots');
});
test('action group authored end placement uses explicit visual order and fixed caller units',async()=>{
  const plan=(await actionGroupPlanner())(authoredActionGroup());
  expect(plan).toEqual({
    format:'agent-sprites/action-group@1',semanticIds:['overwrite','cancel'],paintIds:['cancel','overwrite'],
    width:372,insets:{top:0,right:8,bottom:2,left:8},gap:6,rowGap:6,
    allocation:{kind:'authored',arrangement:'row',slots:[
      {id:'cancel',x:154,y:0,width:64,height:22},
      {id:'overwrite',x:224,y:0,width:140,height:22},
    ]},occupiedHeight:{known:true,value:24},overflow:{known:true,left:0,right:0},
  });
});
test('action group authored overflow is measured against the outer box and never shrinks controls',async()=>{
  const planActionGroup=await actionGroupPlanner();
  const narrow=planActionGroup({...authoredActionGroup(),width:100});
  expect(narrow.allocation.slots).toEqual([
    {id:'cancel',x:-118,y:0,width:64,height:22},
    {id:'overwrite',x:-48,y:0,width:140,height:22},
  ]);
  expect(narrow.overflow).toEqual({known:true,left:118,right:0});
  const insetOnly=planActionGroup({...authoredActionGroup(),width:222});
  expect(insetOnly.allocation.slots[0].x).toBe(4);
  expect(insetOnly.overflow).toEqual({known:true,left:0,right:0});
  const taller=authoredActionGroup();taller.insets.top=3.5;taller.actions[0].minHeight=30.5;
  expect(planActionGroup(taller).allocation.slots[1]).toEqual({id:'overwrite',x:224,y:3.5,width:140,height:30.5});
  expect(planActionGroup(taller).occupiedHeight).toEqual({known:true,value:36});
});
test.each(['equal-max-fit','authored-width-end'])('action group %s empty input has zero occupancy despite padding',async policy=>{
  const plan=(await actionGroupPlanner())({...equalActionGroup(),actions:[],visualOrder:[],fallbackOrder:[],policy});
  expect(plan.semanticIds).toEqual([]);expect(plan.paintIds).toEqual([]);
  expect(plan.allocation).toEqual({kind:'empty'});
  expect(plan.occupiedHeight).toEqual({known:true,value:0});
  expect(plan.overflow).toEqual({known:true,left:0,right:0});
});
test('action group copies and freezes only owned output while caller records remain mutable',async()=>{
  const input=equalActionGroup(),plan=(await actionGroupPlanner())(input);
  input.actions[0].id='changed';input.actions[0].preferredWidth=999;
  input.visualOrder.reverse();input.fallbackOrder[0]='changed';input.insets.top=100;input.width=0;
  expect(plan.semanticIds).toEqual(['export','accept','cancel']);
  expect(plan.allocation.rows).toEqual([['cancel','export'],['accept']]);
  expect(plan.insets.top).toBe(11);expect(plan.width).toBe(175);
  for(const value of [plan,plan.semanticIds,plan.paintIds,plan.insets,plan.allocation,plan.allocation.rows,
    ...plan.allocation.rows,plan.occupiedHeight,plan.overflow])expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(input)).toBe(false);expect(Object.isFrozen(input.actions[0])).toBe(false);
  const authored=(await actionGroupPlanner())(authoredActionGroup());
  expect(Object.isFrozen(authored.allocation.slots)).toBe(true);
  expect(authored.allocation.slots.every(Object.isFrozen)).toBe(true);
});
test('action group rejects malformed records, unsupported keys and incomplete or duplicate ID orders',async()=>{
  const planActionGroup=await actionGroupPlanner(),valid=equalActionGroup();
  const invalid=[null,[],new Date(),{}, {...valid,policy:'wrap'}, {...valid,theme:'gold'},
    {...valid,insets:{...valid.insets,extra:1}}, {...valid,actions:{}},
    {...valid,actions:[...valid.actions,{...valid.actions[0]}]},
    {...valid,actions:[{...valid.actions[0],id:''},...valid.actions.slice(1)]},
    {...valid,actions:[{...valid.actions[0],id:42},...valid.actions.slice(1)]},
    {...valid,actions:[{...valid.actions[0],payload:{}},...valid.actions.slice(1)]},
    {...valid,actions:[null,...valid.actions.slice(1)]},
    {...valid,visualOrder:['cancel','cancel','accept']}, {...valid,fallbackOrder:['cancel','export']},
    {...valid,visualOrder:['cancel','export','unknown']}, {...valid,fallbackOrder:'cancel'},
    {...valid,actions:[],visualOrder:['cancel'],fallbackOrder:[]}];
  const symbol=Symbol('unsupported');
  invalid.push({...valid,[symbol]:true}, {...valid,insets:{...valid.insets,[symbol]:true}},
    {...valid,actions:[{...valid.actions[0],[symbol]:true},...valid.actions.slice(1)]});
  for(const input of invalid)expect(()=>planActionGroup(input)).toThrow();
});
test('action group accepts ordinary and null-prototype records without accepting class instances',async()=>{
  const planActionGroup=await actionGroupPlanner(),ordinary=equalActionGroup();
  const plain=value=>Object.assign(Object.create(null),value);
  const input=plain({...ordinary,insets:plain(ordinary.insets),actions:ordinary.actions.map(plain)});
  expect(planActionGroup(input)).toEqual(planActionGroup(ordinary));
  class Measure{constructor(value){Object.assign(this,value);}}
  expect(()=>planActionGroup(new Measure(ordinary))).toThrow();
  expect(()=>planActionGroup({...ordinary,insets:new Measure(ordinary.insets)})).toThrow();
  expect(()=>planActionGroup({...ordinary,actions:[new Measure(ordinary.actions[0]),...ordinary.actions.slice(1)]})).toThrow();
});
test('action group retains declared numeric inset values regardless of property enumerability',async()=>{
  const planActionGroup=await actionGroupPlanner(),input=equalActionGroup();
  Object.defineProperty(input.insets,'top',{value:11,enumerable:false});
  const plan=planActionGroup(input);
  expect(plan.insets).toEqual({top:11,right:8,bottom:8,left:8});
  expect(plan.occupiedHeight).toEqual({known:false,minimum:71});
});
test('action group rejects invalid numeric inputs, policy minima and nonfinite derived arithmetic',async()=>{
  const planActionGroup=await actionGroupPlanner();
  for(const number of [-1,NaN,Infinity,-Infinity,'22',undefined]){
    for(const key of ['width','gap','rowGap'])expect(()=>planActionGroup({...equalActionGroup(),[key]:number})).toThrow();
    for(const key of ['top','right','bottom','left']){
      const input=equalActionGroup();input.insets[key]=number;expect(()=>planActionGroup(input)).toThrow();
    }
    for(const key of ['preferredWidth','minWidth','minHeight','fixedHeight']){
      const input=authoredActionGroup();input.actions[0][key]=number;expect(()=>planActionGroup(input)).toThrow();
    }
  }
  const positiveMin=equalActionGroup();positiveMin.actions[0].minWidth=1;
  expect(()=>planActionGroup(positiveMin)).toThrow();
  const belowMin=authoredActionGroup();belowMin.actions[0].preferredWidth=21;
  expect(()=>planActionGroup(belowMin)).toThrow();
  const absentHeight=authoredActionGroup();delete absentHeight.actions[0].fixedHeight;
  expect(()=>planActionGroup(absentHeight)).toThrow();
  const insetOverflow=equalActionGroup();insetOverflow.insets.left=Number.MAX_VALUE;insetOverflow.insets.right=Number.MAX_VALUE;
  expect(()=>planActionGroup(insetOverflow)).toThrow();
  const heightOverflow=equalActionGroup();heightOverflow.width=0;
  for(const action of heightOverflow.actions)action.minHeight=Number.MAX_VALUE;
  expect(()=>planActionGroup(heightOverflow)).toThrow();
  const cursorOverflow=authoredActionGroup();cursorOverflow.width=0;
  for(const action of cursorOverflow.actions)action.preferredWidth=Number.MAX_VALUE;
  expect(()=>planActionGroup(cursorOverflow)).toThrow();
});

test('font publishes deterministic editable glyphs, metrics, game symbols, and crisp bounded raster',()=>{
  const recipe=generateUIRecipe({kind:'font'});expect(generateUIRecipe({kind:'font'})).toEqual(recipe);
  expect(recipe.report).toMatchObject({kind:'font',cellSize:{width:8,height:12},baseline:9,lineHeight:12});
  for(const char of 'AaZzgypq 0129·’‘“”…—−×↑↓←→↗↩✦✕Ⅱ▤♧☷☼é')expect(recipe.report.glyphs[char]).toBeDefined();
  expect(recipe.report.glyphs[' '].frames).toEqual({});
  const renderer=new CanvasRenderer(new Palette());
  for(const frame of recipe.report.frames){
    const cell=new Cell({w:8,h:12});
    for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
      const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
    }
    const pixels=renderer.renderCellRaw(cell);expect(pixels.some(v=>v>0)).toBe(true);
    for(let i=3;i<pixels.length;i+=4)expect([0,255]).toContain(pixels[i]);
    expect(frame.bounds.left).toBeGreaterThanOrEqual(0);expect(frame.bounds.right).toBeLessThan(8);expect(frame.bounds.bottom).toBeLessThan(12);
  }
});
function fixture(kind){const {report}=generateUIRecipe({kind});return {image:{},report,atlas:{frames:report.frames.map((f,i)=>({filename:f.alias,frame:{x:i*report.cellSize.width,y:0,w:report.cellSize.width,h:report.cellSize.height}}))}};}
// Metadata controls need no recipe generation or native raster per text case.
function portableFontFixture(){
  const report={kind:'font',fallback:'?',lineHeight:11,baseline:8,cellSize:{width:6,height:9},tones:{cream:'#ffffff',rare:'#123456'},glyphs:{
    ' ':{advance:3,frames:{},bounds:null},
    A:{advance:6,frames:{cream:'A',rare:'A-rare'},bounds:{left:0,top:1,right:4,bottom:7}},
    I:{advance:4,frames:{cream:'I',rare:'I-rare'},bounds:{left:1,top:1,right:2,bottom:7}},
    '?':{advance:4,frames:{cream:'?',rare:'?-rare'},bounds:{left:1,top:2,right:3,bottom:6}},
  }};
  const atlas={frames:[
    {filename:'A',frame:{x:20,y:30,w:5,h:7},spriteSourceSize:{x:0,y:1}},
    {filename:'I',frame:{x:30,y:30,w:2,h:7},spriteSourceSize:{x:1,y:1}},
    {filename:'?',frame:{x:40,y:30,w:3,h:5},spriteSourceSize:{x:1,y:2}},
    {filename:'A-rare',frame:{x:20,y:50,w:5,h:7},spriteSourceSize:{x:0,y:1}},
    {filename:'I-rare',frame:{x:30,y:50,w:2,h:7},spriteSourceSize:{x:1,y:1}},
    {filename:'?-rare',frame:{x:40,y:50,w:3,h:5},spriteSourceSize:{x:1,y:2}},
  ]};
  return {image:{},report,atlas};
}

function abstractMetrics(){return {lineHeight:10.5,advanceOf:char=>({' ':1.25,A:3.5,I:1.5,'😀':4.25,'猫':2.75,'\r':0.25,'\t':0.5}[char]??2)};}
test('abstract text metrics consume raw Unicode code points and keep fractional caller units',()=>{
  const metrics=abstractMetrics(),seen=[];
  expect(uiRuntime.textMetricsLineWidth({...metrics,advanceOf:char=>{seen.push(char);return metrics.advanceOf(char);}},'A😀猫\r\t')).toBe(11.25);
  expect(seen).toEqual(['A','😀','猫','\r','\t']);
  expect(uiRuntime.textMetricsLineWidth(metrics,null)).toBe(8);
  expect(uiRuntime.wrapTextMetrics(metrics,'A😀猫 I',7.75)).toEqual({sourceLines:['A😀','猫 I']});
  expect(uiRuntime.measureTextMetrics(metrics,'A😀猫 I',{maxWidth:7.75,leading:0.5,policy:{lineSpacing:2,trailingAdvance:1}})).toEqual({sourceLines:['A😀','猫 I'],width:6.75,height:23.5,advanceWidth:7.75});
});
test('abstract text metrics return source calculations without drawable or fallback metadata',()=>{
  const metrics=abstractMetrics();
  expect(uiRuntime.measureTextMetrics(metrics,'猫😀\nA')).toEqual({sourceLines:['猫😀','A'],width:7,height:21,advanceWidth:7});
  expect(uiRuntime.wrapTextMetrics(metrics,' A   I ')).toEqual({sourceLines:['A I']});
  expect(uiRuntime.measureTextMetrics(metrics,' A   I ')).toEqual({sourceLines:[' A   I '],width:11.25,height:10.5,advanceWidth:11.25});
  expect(uiRuntime.measureTextMetrics(metrics,' A   I ',{maxWidth:Infinity})).toEqual({sourceLines:['A I'],width:6.25,height:10.5,advanceWidth:6.25});
  expect(uiRuntime.measureTextMetrics(metrics,'A\r\nI\rA\tI').sourceLines).toEqual(['A','I','A    I']);
  expect(uiRuntime.wrapTextMetrics(metrics,'A\r\tI',100,{policy:{newline:'lf-only',tab:'literal'}})).toEqual({sourceLines:['A\r\tI']});
  expect(uiRuntime.measureTextMetrics(metrics,null,{policy:{empty:'none',nullish:'empty'}})).toEqual({sourceLines:[],width:0,height:0,advanceWidth:0});
  expect(uiRuntime.measureTextMetrics(metrics,'',{leading:0.5})).toEqual({sourceLines:[''],width:0,height:10.5,advanceWidth:0});
  expect(uiRuntime.wrapTextMetrics(metrics,'A ',3.5,{policy:{spaces:'terminal',trailingAdvance:1}})).toEqual({sourceLines:['A','']});
  expect(uiRuntime.wrapTextMetrics(metrics,'A',0)).toEqual({sourceLines:['A']});
});
test('abstract metrics reject invalid metrics, advances and unsupported rendering or cell options',()=>{
  const metrics=abstractMetrics();
  for(const invalid of [null,[],{}, {...metrics,lineHeight:0},{...metrics,lineHeight:-1},{...metrics,lineHeight:Infinity},{...metrics,lineHeight:NaN},{...metrics,advanceOf:3}]){
    for(const call of [()=>uiRuntime.textMetricsLineWidth(invalid,'A'),()=>uiRuntime.wrapTextMetrics(invalid,'A'),()=>uiRuntime.measureTextMetrics(invalid,'A')])expect(call).toThrow(/metrics|line height|advanceOf/i);
  }
  for(const advance of [-1,Infinity,NaN,undefined,'3']){
    const invalid={...metrics,advanceOf:()=>advance};
    for(const call of [()=>uiRuntime.textMetricsLineWidth(invalid,'A'),()=>uiRuntime.wrapTextMetrics(invalid,'A',1),()=>uiRuntime.measureTextMetrics(invalid,'A')])expect(call).toThrow(/advance/i);
  }
  expect(uiRuntime.measureTextMetrics({...metrics,advanceOf:()=>0},'A😀')).toEqual({sourceLines:['A😀'],width:0,height:10.5,advanceWidth:0});
  for(const policy of [{lastLine:'cell'},{unknown:1},{trailingAdvance:2},{lineSpacing:0.5}]){
    expect(()=>uiRuntime.wrapTextMetrics(metrics,'A',10,{policy})).toThrow(/policy|cell/i);
    expect(()=>uiRuntime.measureTextMetrics(metrics,'A',{policy})).toThrow(/policy|cell/i);
  }
  for(const options of [{leading:-1},{leading:Infinity},{leading:NaN},{scale:2},{resolution:{}},{unknown:1}])expect(()=>uiRuntime.measureTextMetrics(metrics,'A',options)).toThrow();
  for(const options of [{scale:2},{resolution:{}},{leading:1},{unknown:1}])expect(()=>uiRuntime.wrapTextMetrics(metrics,'A',10,options)).toThrow();
  for(const maxWidth of [-1,NaN,'3'])expect(()=>uiRuntime.wrapTextMetrics(metrics,'A',maxWidth)).toThrow(/width/i);
});
test('abstract and real bitmap calculations share nonuniform advances, finite policies and scaled results',()=>{
  const font=uiRuntime.normalizeBitmapFont(portableFontFixture()),metrics={lineHeight:font.lineHeight,advanceOf:char=>(font.glyphs[char]??font.glyphs[font.fallback]).advance};
  for(const [text,maxWidth,policy] of [['A猫😀',undefined,{}],[' A   I ',Infinity,{}],['A\n\nI',undefined,{lineSpacing:2}],['A ',6,{spaces:'terminal',trailingAdvance:1}],['',undefined,{empty:'none'}],[null,undefined,{nullish:'empty'}]]){
    const abstract=uiRuntime.measureTextMetrics(metrics,text,{maxWidth,policy}),bitmap=uiRuntime.measureBitmapText(font,text,{maxWidth,policy});
    expect(abstract).toEqual({sourceLines:bitmap.sourceLines,width:bitmap.width,height:bitmap.height,advanceWidth:bitmap.advanceWidth});
    const scaled=uiRuntime.measureBitmapText(font,text,{maxWidth:maxWidth===undefined?undefined:maxWidth*2,scale:2,policy});
    expect(scaled).toMatchObject({...abstract,width:abstract.width*2,height:abstract.height*2,advanceWidth:abstract.advanceWidth*2});
  }
  expect(uiRuntime.measureBitmapText(font,'A\nI',{policy:{lastLine:'cell',trailingAdvance:1,lineSpacing:2}})).toMatchObject({sourceLines:['A','I'],width:5,height:22,advanceWidth:6,paintedBounds:{known:true,rect:{x:0,y:1,width:5,height:20}}});
});
test('portable font normalization owns immutable advances, exact ink and separate trim offsets for every tone',()=>{
  const input=portableFontFixture(),before=JSON.stringify(input),font=uiRuntime.normalizeBitmapFont(input);
  expect(font).toMatchObject({lineHeight:11,baseline:8,cell:{width:6,height:9},fallback:'?',toneNames:['cream','rare']});
  expect(font.glyphs['?']).toMatchObject({advance:4,inkBounds:{known:true,rect:{x:1,y:2,width:3,height:5}},frames:{rare:{name:'?-rare',source:{x:40,y:50,width:3,height:5},offset:{x:1,y:2}}}});
  expect(Object.isFrozen(font)).toBe(true);expect(Object.isFrozen(font.glyphs['?'].frames.rare.offset)).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
  input.report.glyphs['?'].advance=99;input.atlas.frames[2].spriteSourceSize.x=99;
  expect(font.glyphs['?'].advance).toBe(4);expect(font.glyphs['?'].frames.cream.offset.x).toBe(1);
});
test('Canvas drawing and missing glyphs retain the same normalized snapshot after source metadata changes',()=>{
  const input=portableFontFixture(),image=input.image,font=createBitmapFont(input),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  const text='A猫\nI',expected={width:20,height:44,lines:['A猫','I']};
  expect(font.measure(text)).toEqual(expected);
  input.report.glyphs.A.advance=99;input.report.lineHeight=99;
  input.report.glyphs.A.frames.rare='new-frame';
  input.atlas.frames[5].frame.x=99;input.atlas.frames[5].spriteSourceSize.x=99;
  delete input.report.glyphs.I;input.report.glyphs['猫']={advance:99,frames:{rare:'new-frame'}};
  input.report.fallback='A';
  expect(font.measure(text)).toEqual(expected);
  expect(font.wrap(text,24)).toEqual(expected.lines);
  expect(font.draw(ctx,text,10,20,{tone:'rare'})).toEqual(expected);
  expect(calls).toEqual([
    [image,20,50,5,7,10,22,10,14],
    [image,40,50,3,5,24,24,6,10],
    [image,30,50,2,7,12,44,4,14],
  ]);
  expect(font.missingGlyphs('I猫\r\n\t')).toEqual(['猫']);
  expect(Object.isFrozen(image)).toBe(false);
});
test.each(['array','object'])('portable font recreation uses one fresh %s atlas record for both rectangle and offset',shape=>{
  const input=portableFontFixture();
  if(shape==='object')input.atlas.frames=Object.fromEntries(input.atlas.frames.map(entry=>[entry.filename,entry]));
  const original=uiRuntime.normalizeBitmapFont(input),oldFont=createBitmapFont(input);
  const replacement={filename:'A',frame:{x:70,y:80,w:3,h:5},spriteSourceSize:{x:1,y:2}};
  if(shape==='array')input.atlas.frames[0]=replacement;else input.atlas.frames.A=replacement;
  input.report.glyphs.A.bounds={left:1,top:2,right:3,bottom:6};
  const recreated=uiRuntime.normalizeBitmapFont(input),newFont=createBitmapFont(input);
  expect(original.glyphs.A.frames.cream).toEqual({name:'A',source:{x:20,y:30,width:5,height:7},offset:{x:0,y:1}});
  expect(recreated.glyphs.A.frames.cream).toEqual({name:'A',source:{x:70,y:80,width:3,height:5},offset:{x:1,y:2}});
  const image=input.image,oldCalls=[],newCalls=[];
  oldFont.draw({drawImage:(...args)=>oldCalls.push(args)},'A',10,20);
  newFont.draw({drawImage:(...args)=>newCalls.push(args)},'A',10,20);
  expect(oldCalls).toEqual([[image,20,30,5,7,10,22,10,14]]);
  expect(newCalls).toEqual([[image,70,80,3,5,12,24,6,10]]);
});
test('portable font normalization retains legacy Phaser cell and ink as unknown without inventing cell bounds',()=>{
  const chars={32:{x:0,y:0,width:0,height:0,xOffset:0,yOffset:0,xAdvance:4},63:{x:8,y:12,width:8,height:12,xOffset:0,yOffset:0,xAdvance:6},65:{x:16,y:12,width:8,height:12,xOffset:0,yOffset:0,xAdvance:6}};
  const font=uiRuntime.normalizeBitmapFont({phaser:{kind:'font',glyphs:'?A',fallback:'?',lineHeight:12,baseline:9,tones:{cream:{chars},muted:{chars}}}});
  expect(font.cell).toBe(null);expect(font.glyphs.A.inkBounds).toEqual({known:false,rect:null});
  expect(font.glyphs.A.frames.cream.source).toEqual({x:16,y:12,width:8,height:12});
  expect(uiRuntime.measureBitmapText(font,'A I')).toMatchObject({width:16,height:12,advanceWidth:16,sourceLines:['A I'],resolvedLines:['A ?'],paintedBounds:{known:false,rect:null}});
  expect(uiRuntime.measureBitmapText(font,' ')).toMatchObject({width:4,paintedBounds:{known:true,rect:null}});
  expect(()=>uiRuntime.measureBitmapText(font,'A',{policy:{lastLine:'cell'}})).toThrow(/cell.*unknown/i);
});
test('portable font measurement uses native exported metrics and counts a trim offset only once',()=>{
  const phaser={kind:'font',glyphs:'?A',fallback:'?',lineHeight:11,baseline:8,cell:{width:6,height:9},metrics:{' ':{advance:3,bounds:null},'?':{advance:4,bounds:{left:1,top:2,right:3,bottom:6}},A:{advance:6,bounds:{left:0,top:1,right:4,bottom:7}}},tones:{
    neon:{chars:{32:{x:0,y:0,width:0,height:0,xOffset:0,yOffset:0,xAdvance:3},63:{x:40,y:30,width:3,height:5,xOffset:1,yOffset:2,xAdvance:4},65:{x:20,y:30,width:5,height:7,xOffset:0,yOffset:1,xAdvance:6}}},
  }};
  const font=uiRuntime.normalizeBitmapFont({phaser});
  expect(font.toneNames).toEqual(['neon']);
  expect(uiRuntime.measureBitmapText(font,'A?',{scale:2})).toMatchObject({width:20,height:22,paintedBounds:{known:true,rect:{x:0,y:2,width:20,height:14}}});
  expect(uiRuntime.bitmapLineWidth(font,'A?',{scale:2,trailingAdvance:1})).toBe(18);
  expect(uiRuntime.measureBitmapText(font,'A\n?',{policy:{trailingAdvance:1,lastLine:'cell'}})).toMatchObject({width:5,advanceWidth:6,height:20});
});
test.each([
  ['',undefined,2,[''],0,22],
  ['A I',undefined,2,['A I'],26,22],
  ['A\n\nI',undefined,2,['A','','I'],12,66],
  ['A\r\nI\rA\tI',undefined,2,['A','I','A    I'],44,66],
  ['A猫😀',undefined,2,['A猫😀'],28,22],
  ['AA II\nA',24,2,['AA','II','A'],24,66],
  ['AAAAA',24,2,['AA','AA','A'],24,66],
  ['A I',25,2,['A','I'],12,44],
  ['A',10,2,['A'],12,22],
  [' A   I ',100,1,['A I'],13,11],
  ['   ',undefined,1,['   '],9,11],
  ['   ',100,1,[''],0,11],
  [null,undefined,1,['null'],16,11],
])('portable font calculations and Canvas preserve source lines and authored dimensions %#',(text,maxWidth,scale,lines,width,height)=>{
  const input=portableFontFixture(),font=uiRuntime.normalizeBitmapFont(input),canvas=createBitmapFont(input);
  const result=uiRuntime.measureBitmapText(font,text,{scale,maxWidth});
  expect(result).toMatchObject({sourceLines:lines,width,height});
  expect(canvas.measure(text,{scale,maxWidth})).toEqual({lines,width,height});
  if(maxWidth!==undefined){expect(uiRuntime.wrapBitmapText(font,text,maxWidth,{scale}).sourceLines).toEqual(lines);expect(canvas.wrap(text,maxWidth,{scale})).toEqual(lines);}
  expect(result.resolvedLines.every(line=>!line.includes('猫')&&!line.includes('😀'))).toBe(true);
});
test('portable font policies explicitly preserve empty input, literal control characters and terminal spaces',()=>{
  const font=uiRuntime.normalizeBitmapFont(portableFontFixture());
  expect(uiRuntime.measureBitmapText(font,null,{policy:{empty:'none',nullish:'empty'}})).toMatchObject({sourceLines:[],resolvedLines:[],width:0,height:0});
  expect(uiRuntime.measureBitmapText(font,'',{policy:{empty:'none'}}).height).toBe(0);
  expect(uiRuntime.measureBitmapText(font,'A\nI',{policy:{lineSpacing:2}}).height).toBe(24);
  expect(uiRuntime.wrapBitmapText(font,'A\r\tI',100,{policy:{newline:'lf-only',tab:'literal'}})).toMatchObject({sourceLines:['A\r\tI'],resolvedLines:['A??I']});
  expect(uiRuntime.wrapBitmapText(font,'A ',6,{policy:{spaces:'terminal',trailingAdvance:1}}).sourceLines).toEqual(['A','']);
  expect(uiRuntime.wrapBitmapText(font,'A ',8,{policy:{spaces:'terminal',trailingAdvance:1}}).sourceLines).toEqual(['A ']);
  expect(uiRuntime.wrapBitmapText(font,'A',0).sourceLines).toEqual(['A']);
  expect(()=>createBitmapFont(portableFontFixture()).wrap('A',0)).toThrow(/positive integer/);
});
test('portable font policies reject unsupported values while legacy minimal text resolution stays available',()=>{
  const font=uiRuntime.normalizeBitmapFont(portableFontFixture());
  for(const policy of [{game:'x'},{empty:'guess'},{newline:'guess'},{tab:3},{trailingAdvance:2},{lastLine:'guess'},{lineSpacing:-1}])expect(()=>uiRuntime.measureBitmapText(font,'A',{policy})).toThrow(/policy/i);
  expect(()=>uiRuntime.bitmapLineWidth(font,'A',{scale:1.5})).toThrow(/integer/);
  expect(resolveFontText({glyphs:'A?',fallback:'?'},'A猫\r\n\t')).toBe('A?\n    ');
});
test.each([['left',10,10],['center',12,18],['right',15,27]])('portable placement preserves %s alignment, trim offsets, fallback and Canvas draw order',(align,firstX,lastX)=>{
  const input=portableFontFixture(),font=uiRuntime.normalizeBitmapFont(input),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  const plan=uiRuntime.placeBitmapText(font,'A猫\nI',10,20,{scale:2,tone:'rare',maxWidth:25,maxHeight:44,align});
  const expected=[
    [input.image,20,50,5,7,firstX,22,10,14],
    [input.image,40,50,3,5,firstX+14,24,6,10],
    [input.image,30,50,2,7,lastX+2,44,4,14],
  ];
  expect(plan.lines.map(line=>[line.x,line.y])).toEqual([[firstX,20],[lastX,42]]);
  expect(plan.paintedBounds).toEqual({known:true,rect:{x:firstX,y:22,width:20,height:36}});
  expect(plan.overflow).toEqual({horizontal:false,vertical:false,painted:{known:true,horizontal:false,vertical:false}});
  expect(plan.draws.map(draw=>[input.image,draw.source.x,draw.source.y,draw.source.width,draw.source.height,draw.destination.x,draw.destination.y,draw.destination.width,draw.destination.height])).toEqual(expected);
  expect(createBitmapFont(input).draw(ctx,'A猫\nI',10,20,{scale:2,tone:'rare',maxWidth:25,align})).toEqual({width:20,height:44,lines:['A猫','I']});
  expect(calls).toEqual(expected);expect(ctx.imageSmoothingEnabled).toBe(false);
});
test('portable placement reports metric and known/unknown painted overflow without clipping or shrinking',()=>{
  const input=portableFontFixture(),font=uiRuntime.normalizeBitmapFont(input);
  const plan=uiRuntime.placeBitmapText(font,'I',3,5,{scale:2,maxWidth:7,maxHeight:1,align:'center'});
  expect(plan.draws[0].destination).toEqual({x:4,y:7,width:4,height:14});
  expect(plan.overflow).toEqual({horizontal:true,vertical:true,painted:{known:true,horizontal:false,vertical:true}});
  delete input.report.glyphs.A.bounds;
  const unknown=uiRuntime.placeBitmapText(uiRuntime.normalizeBitmapFont(input),'A',1,1,{maxWidth:6,maxHeight:11});
  expect(unknown.paintedBounds).toEqual({known:false,rect:null});
  expect(unknown.overflow.painted).toEqual({known:false,horizontal:null,vertical:null});
  const empty=uiRuntime.placeBitmapText(font,'',0,0,{maxWidth:0,maxHeight:0});
  expect(empty.draws).toEqual([]);expect(empty.overflow.vertical).toBe(true);
  for(const options of [{maxWidth:Infinity},{maxHeight:NaN},{maxWidth:1.5},{scale:1.5},{align:'justify'}])expect(()=>uiRuntime.placeBitmapText(font,'A',0,0,options)).toThrow();
});
function portableSkinFixture(insets={left:2,right:1,top:1,bottom:2}){
  return {image:{},report:{skins:{panel:{insets,minWidth:1,minHeight:1}}},atlas:{frames:[{filename:'panel',frame:{x:40,y:60,w:6,h:6},spriteSourceSize:{x:7,y:9}}]}};
}
const quadNumbers=quad=>[quad.source.x,quad.source.y,quad.source.width,quad.source.height,quad.destination.x,quad.destination.y,quad.destination.width,quad.destination.height];
test('portable nine-slice preserves asymmetric geometry, partial tile order and cropped-frame origins',()=>{
  const input=portableSkinFixture(),frame=input.atlas.frames[0].frame,bounds={x:2,y:3,width:8,height:7};
  const plan=uiRuntime.planNineSlice({frame,insets:input.report.skins.panel.insets},bounds);
  const expected=[
    [40,60,2,1,2,3,2,1],[42,60,3,1,4,3,3,1],[42,60,2,1,7,3,2,1],[45,60,1,1,9,3,1,1],
    [40,61,2,3,2,4,2,3],[40,61,2,1,2,7,2,1],
    [42,61,3,3,4,4,3,3],[42,61,2,3,7,4,2,3],[42,61,3,1,4,7,3,1],[42,61,2,1,7,7,2,1],
    [45,61,1,3,9,4,1,3],[45,61,1,1,9,7,1,1],
    [40,64,2,2,2,8,2,2],[42,64,3,2,4,8,3,2],[42,64,2,2,7,8,2,2],[45,64,1,2,9,8,1,2],
  ];
  expect(plan.regions).toHaveLength(9);expect(Object.isFrozen(plan.regions[0].source)).toBe(true);
  expect([...uiRuntime.iterateNineSliceTiles(plan)].map(quadNumbers)).toEqual(expected);
  const calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  drawNineSlice(ctx,input,'panel',2,3,8,7,{scale:1});
  expect(calls).toEqual(expected.map(quad=>[input.image,...quad]));expect(ctx.imageSmoothingEnabled).toBe(false);
  frame.x=999;expect(uiRuntime.iterateNineSliceTiles(plan).next().value.source.x).toBe(40);
});
test('portable nine-slice handles zero insets, scaled partial tiles and bounded lazy region planning',()=>{
  const input=portableSkinFixture({left:0,right:0,top:0,bottom:0}),frame={x:40,y:60,w:5,h:4};input.atlas.frames[0].frame=frame;
  const plan=uiRuntime.planNineSlice({frame,insets:input.report.skins.panel.insets},{x:2,y:3,width:14,height:10},{scale:2});
  const expected=[[40,60,5,4,2,3,10,8],[40,60,2,4,12,3,4,8],[40,60,5,1,2,11,10,2],[40,60,2,1,12,11,4,2]];
  expect(plan.regions).toHaveLength(1);expect([...uiRuntime.iterateNineSliceTiles(plan)].map(quadNumbers)).toEqual(expected);
  const calls=[];drawNineSlice({drawImage:(...args)=>calls.push(args)},input,'panel',2,3,14,10,{scale:2});expect(calls).toEqual(expected.map(quad=>[input.image,...quad]));
  const large=uiRuntime.planNineSlice({frame:{x:0,y:0,w:1,h:1},insets:input.report.skins.panel.insets},{x:0,y:0,width:1000000,height:1000000});
  expect(large.regions).toHaveLength(1);expect(large).not.toHaveProperty('draws');
  const iterator=uiRuntime.iterateNineSliceTiles(large);expect(iterator.next().value.destination).toEqual({x:0,y:0,width:1,height:1});iterator.return();
});
test.each([2,3])('portable nine-slice keeps narrow/zero destination centers at width %i without imposing authored minima',width=>{
  const input=portableSkinFixture(),plan=uiRuntime.planNineSlice({frame:input.atlas.frames[0].frame,insets:input.report.skins.panel.insets},{x:2,y:3,width,height:width});
  const expected=[
    [40,60,2,1,2,3,2,1],[45,60,1,1,2+width-1,3,1,1],
    [40,64,2,2,2,3+width-2,2,2],[45,64,1,2,2+width-1,3+width-2,1,2],
  ];
  expect(plan.regions).toHaveLength(4);expect([...uiRuntime.iterateNineSliceTiles(plan)].map(quadNumbers)).toEqual(expected);
  const calls=[];drawNineSlice({drawImage:(...args)=>calls.push(args)},input,'panel',2,3,width,width,{scale:1});expect(calls).toEqual(expected.map(quad=>[input.image,...quad]));
  input.report.skins.panel.minWidth=4;expect(()=>drawNineSlice(null,input,'panel',2,3,width,width,{scale:1})).toThrow(/minimum/);
});
test('portable nine-slice omits zero source centers and preserves the existing unpainted center',()=>{
  const input=portableSkinFixture({left:3,right:3,top:3,bottom:3}),frame=input.atlas.frames[0].frame;
  const plan=uiRuntime.planNineSlice({frame,insets:input.report.skins.panel.insets},{x:0,y:0,width:8,height:8});
  const expected=[[40,60,3,3,0,0,3,3],[43,60,3,3,5,0,3,3],[40,63,3,3,0,5,3,3],[43,63,3,3,5,5,3,3]];
  expect(plan.regions).toHaveLength(4);expect([...uiRuntime.iterateNineSliceTiles(plan)].map(quadNumbers)).toEqual(expected);
  const calls=[];drawNineSlice({drawImage:(...args)=>calls.push(args)},input,'panel',0,0,8,8,{scale:1});expect(calls).toEqual(expected.map(quad=>[input.image,...quad]));
});
const resolutionFixture=()=>uiRuntime.pixelResolution({id:'app:menu/card',revision:7,localToPhysical:{scale:3,origin:{x:-0.25,y:0.5}},physicalPixelsPerSourcePixel:2});
test('portable resolution records mixed density and projects continuous points/rectangles without snapping inverse input',()=>{
  const resolution=resolutionFixture(),point={x:-1.25,y:2.125},rect={...point,width:4.5,height:0.25};
  expect(resolution.sourceToLocalScale).toBe(2/3);expect(Object.isFrozen(resolution.localToPhysical.origin)).toBe(true);
  const physical=uiRuntime.projectPixelPoint(resolution,point);expect(physical).toEqual({x:-4,y:6.875});
  expect(uiRuntime.projectPixelPoint(resolution,physical,'to-local')).toEqual(point);
  expect(uiRuntime.projectPixelRect(resolution,rect)).toEqual({x:-4,y:6.875,width:13.5,height:0.75});
  expect(uiRuntime.projectPixelRect(resolution,uiRuntime.projectPixelRect(resolution,rect),'to-local')).toEqual(rect);
  const pointer=uiRuntime.projectPixelPoint(resolution,{x:3.25,y:7.125},'to-local');
  expect(pointer.x).toBeCloseTo(3.5/3,14);expect(pointer.y).toBeCloseTo(6.625/3,14);
});
test('portable resolution quantization explicitly covers, collapses inward and keeps empty physical rectangles empty',()=>{
  const rect={x:-0.25,y:0.25,width:0.5,height:0.5};
  expect(uiRuntime.quantizePhysicalRect(rect,{mode:'inside'})).toEqual({x:0,y:1,width:0,height:0});
  expect(uiRuntime.quantizePhysicalRect(rect,{mode:'cover'})).toEqual({x:-1,y:0,width:2,height:1});
  expect(uiRuntime.quantizePhysicalRect({...rect,width:0,height:0},{mode:'cover'})).toEqual({x:-1,y:0,width:0,height:0});
  expect(uiRuntime.quantizePhysicalPoint({x:-1,y:1},{grid:2})).toEqual({x:0,y:2});
  expect(()=>uiRuntime.quantizePhysicalRect(rect,{mode:'guess'})).toThrow(/unsupported/i);
});
test('portable resolution text plans project whole physical glyphs into fractional local geometry and retain requested bounds',()=>{
  const resolution=resolutionFixture(),font=uiRuntime.normalizeBitmapFont(portableFontFixture());
  const plan=uiRuntime.placeBitmapText(font,'A\nI',-1.25,2.125,{resolution,tone:'rare',maxWidth:4.5,maxHeight:10});
  expect(plan.context).toEqual({id:'app:menu/card',revision:7});
  expect(plan.requestedLayoutBounds).toEqual({x:-1.25,y:2.125,width:4.5,height:10});
  expect(plan.width).toBe(4);expect(plan.draws).toHaveLength(2);expect(plan.overflow.vertical).toBe(true);
  for(const draw of plan.draws){
    expect(Object.values(draw.physicalDestination).every(Number.isInteger)).toBe(true);
    expect(draw.physicalDestination.width).toBe(draw.source.width*2);
    expect(uiRuntime.projectPixelRect(resolution,draw.destination).x).toBeCloseTo(draw.physicalDestination.x,13);
  }
  expect(plan.draws[0].destination.width).toBeCloseTo(10/3,14);
  expect(plan.quantization).toMatchObject({space:'physical',grid:1,bounds:'inside',sourcePixels:2});
  expect(()=>uiRuntime.placeBitmapText(font,'A',0,0,{resolution,scale:1})).toThrow(/scale.*resolution/i);
});
test('portable resolution skin origin uses grid one and extents use the source-pixel grid relative to that origin',()=>{
  const resolution=resolutionFixture(),input={frame:{x:0,y:0,w:5,h:4},insets:{left:0,right:0,top:0,bottom:0}},requested={x:1,y:2,width:6,height:5};
  const plan=uiRuntime.planNineSlice(input,requested,{resolution});
  expect(plan.physicalBounds).toEqual({x:3,y:7,width:16,height:14});
  expect(plan.requestedLayoutBounds).toEqual(requested);expect(plan.context.revision).toBe(7);
  expect(plan.quantization).toMatchObject({space:'physical',originGrid:1,originMode:'inside-ceil',extentGrid:2,extentMode:'inward-floor',extentOrigin:{x:3,y:7}});
  const quads=[...uiRuntime.iterateNineSliceTiles(plan)];expect(quads).toHaveLength(4);
  expect(quads[1].source).toEqual({x:0,y:0,width:3,height:4});
  for(const quad of quads){
    expect(Object.values(quad.source).every(Number.isInteger)).toBe(true);
    expect(Object.values(quad.physicalDestination).every(Number.isInteger)).toBe(true);
    expect(quad.physicalDestination.width).toBe(quad.source.width*2);
    expect(uiRuntime.projectPixelRect(resolution,quad.destination).width).toBeCloseTo(quad.physicalDestination.width,13);
  }
  for(const bounds of [{x:0.1,y:0.1,width:0,height:0},{x:0.1,y:0.1,width:0.1,height:0.1}]){
    const empty=uiRuntime.planNineSlice({...input,insets:{left:2,right:2,top:1,bottom:1}},bounds,{resolution});
    expect(empty.regions).toEqual([]);expect([...uiRuntime.iterateNineSliceTiles(empty)]).toEqual([]);
    expect(empty.physicalPaintedBounds).toEqual({known:true,rect:null});
  }
  const narrow=uiRuntime.planNineSlice({...input,insets:{left:2,right:2,top:1,bottom:1}},{x:1,y:2,width:1,height:1},{resolution});
  expect(narrow.physicalBounds).toEqual({x:3,y:7,width:2,height:2});
  expect(narrow.physicalPaintedBounds).toEqual({known:true,rect:{x:1,y:7,width:6,height:2}});
  expect(narrow.overflow).toEqual({horizontal:true,vertical:false});
  expect([...uiRuntime.iterateNineSliceTiles(narrow)]).toHaveLength(4);
});
test('portable resolution text keeps its nearest anchor independently of an inward fit box',()=>{
  const resolution=resolutionFixture(),font=uiRuntime.normalizeBitmapFont(portableFontFixture()),x=1/6,y=1/4;
  const unbounded=uiRuntime.placeBitmapText(font,'A',x,y,{resolution});
  const constrained=uiRuntime.placeBitmapText(font,'A',x,y,{resolution,maxWidth:6,maxHeight:10});
  expect(unbounded.physicalAnchor).toEqual({x:0,y:1});expect(constrained.physicalAnchor).toEqual(unbounded.physicalAnchor);
  expect(constrained.draws[0].physicalDestination).toEqual(unbounded.draws[0].physicalDestination);
  expect(constrained.physicalBounds).toEqual({x:1,y:2,width:17,height:29});
  expect(constrained.requestedLayoutBounds).toEqual({x,y,width:6,height:10});
  expect(constrained.overflow).toEqual({horizontal:true,vertical:true,painted:{known:true,horizontal:true,vertical:false}});
  expect(constrained.quantization).toMatchObject({origin:'nearest',bounds:'inside'});
});
test('portable resolution rejects unsupported transforms/options and leaves uncontextualized Canvas guards unchanged',()=>{
  const base={id:'app:ui',revision:1,localToPhysical:{scale:3,origin:{x:0,y:0}},physicalPixelsPerSourcePixel:2};
  for(const input of [{...base,rotation:0},{...base,id:'unnamespaced'},{...base,localToPhysical:{...base.localToPhysical,scaleX:3}},{...base,physicalPixelsPerSourcePixel:1.5}])expect(()=>uiRuntime.pixelResolution(input)).toThrow();
  const resolution=resolutionFixture(),font=uiRuntime.normalizeBitmapFont(portableFontFixture());
  expect(()=>uiRuntime.placeBitmapText(font,'A',0,0,{resolution,dpr:2})).toThrow(/unsupported/i);
  expect(()=>uiRuntime.projectPixelPoint(resolution,{x:0,y:0},'guess')).toThrow(/unsupported/i);
  expect(()=>createBitmapFont(portableFontFixture()).draw(null,'A',0.5,0)).toThrow(/integer/);
  expect(()=>uiRuntime.planNineSlice({frame:{x:0,y:0,w:5,h:4},insets:{left:0,right:0,top:0,bottom:0}},{x:0.5,y:0,width:6,height:5})).toThrow(/integer/);
});
test('compact font keeps the full repertoire with smaller authored metrics and integer rendering',()=>{
  const regular=generateUIRecipe({kind:'font'}),compact=generateUIRecipe({kind:'font',face:'compact'});
  expect(compact.report).toMatchObject({cellSize:{width:6,height:10},baseline:7,lineHeight:10,face:'compact'});
  expect(Object.keys(compact.report.glyphs)).toEqual(Object.keys(regular.report.glyphs));
  for(const [char,glyph] of Object.entries(compact.report.glyphs)){
    expect(glyph.advance).toBe(char===' '?3:5);
    if(char!==' '){expect(glyph.bounds.right).toBeLessThan(5);expect(glyph.bounds.bottom).toBeLessThan(10);expect(glyph.bounds.right).toBeGreaterThanOrEqual(0);}
  }
  const report=compact.report,atlas={frames:report.frames.map((f,i)=>({filename:f.alias,frame:{x:i*6,y:0,w:6,h:10}}))};
  const font=createBitmapFont({image:{},report,atlas});
  expect(font.measure('A hint',{scale:2})).toMatchObject({width:56,height:20});
  expect(()=>generateUIRecipe({kind:'skin',face:'compact'})).toThrow(/font/);
  expect(()=>generateUIRecipe({kind:'font',face:'tiny'})).toThrow(/face/);
});
test('runtime wraps with shared metrics, preserves explicit newlines, and draws atlas pixels only',()=>{
  const font=createBitmapFont(fixture('font')),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(font.measure('AB',{scale:2})).toMatchObject({width:24,height:24});
  expect(font.wrap('AA BB\nCC',24,{scale:2})).toEqual(['AA','BB','CC']);
  expect(font.wrap('ABCDE',24,{scale:2})).toEqual(['AB','CD','E']);
  expect(font.missingGlyphs('A🦋')).toEqual(['🦋']);
  font.draw(ctx,'Agé',2,4,{scale:2});expect(calls).toHaveLength(3);
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
  expect(()=>font.draw(ctx,'A',0,0,{scale:1.5})).toThrow(/integer/);
  font.draw(ctx,'🦋',0,0,{scale:2});expect(calls).toHaveLength(4);
  expect(()=>font.draw(ctx,'A',0,0,{tone:'missing'})).toThrow(/tone/);
});
test.each(['regular','compact'])('%s font resolves display text by Unicode code point without changing source text',face=>{
  const {report}=generateUIRecipe({kind:'font',face}),input='é猫😀☃\r\nA\tB';
  expect(resolveFontText(report,input)).toBe('é???\nA    B');
  expect(input).toBe('é猫😀☃\r\nA\tB');
  expect(resolveFontText(report,'é\ud800😀')).toBe('é??');
  expect(resolveFontText(report,'e\u0301')).toBe('e?');
});
test('font text resolver accepts Phaser repertoire metadata and custom fallback glyphs',()=>{
  const report=generateUIRecipe({kind:'font',characters:' ABC?'}).report;
  const phaserFont={glyphs:Object.keys(report.glyphs).filter(char=>char!==' ').join(''),fallback:report.fallback};
  expect(resolveFontText(phaserFont,'A B\nC')).toBe('A B\nC');
  expect(resolveFontText(phaserFont,'A猫😀')).toBe('A??');
  const glyphs=Object.freeze({'A':{},'!':{},' ':{} }),custom=Object.freeze({glyphs,fallback:'!'});
  expect(resolveFontText(custom,'A猫\tB')).toBe('A!    !');
  expect(Object.keys(custom.glyphs)).toEqual(['A','!',' ']);
});
test('custom character subsets always include fallback and space and pack near-square with only unnamed padding',()=>{
  const full=generateUIRecipe({kind:'font'}),characters=Object.keys(full.report.glyphs).slice(0,128).join('');
  const subset=generateUIRecipe({kind:'font',characters}),grid=subset.operations[0];
  expect(grid.rows*grid.cols).toBeGreaterThanOrEqual(subset.report.frames.length);expect(grid.rows*grid.cols-subset.report.frames.length).toBeLessThan(grid.cols);
  expect(subset.report.glyphs['?']).toBeDefined();expect(subset.report.glyphs[' '].advance).toBe(4);
});
test('disabled button artwork is visually distinct from normal artwork',()=>{
  const recipe=generateUIRecipe({kind:'skin'}),renderer=new CanvasRenderer(new Palette());
  const pixels=alias=>{const f=recipe.report.frames.find(f=>f.alias===alias),cell=new Cell({w:24,h:24});for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===f.cell)){const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);}return renderer.renderCellRaw(cell);};
  expect(pixels('button_disabled')).not.toEqual(pixels('button_normal'));
});
test('skin has reusable metrics and nine-slice preserves corner pixels at integer scales',()=>{
  const data=fixture('skin'),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(data.report.skins.button_normal.insets).toEqual({left:4,right:4,top:4,bottom:4});
  for(const alias of ['panel_dark','panel_light','button_normal','button_hover','button_pressed','button_disabled','button_focus','slot_selected','scrim','icon_leaf','icon_bag','icon_sun','icon_bag_ink','progress_track','progress_fill'])expect(data.report.frames.some(f=>f.alias===alias)).toBe(true);
  expect(data.report.skins.progress_fill.content).toEqual({x:0,y:11,w:24,h:2});
  drawNineSlice(ctx,data,'button_normal',0,0,80,32,{scale:2});
  expect(calls[0].slice(-4)).toEqual([0,0,8,8]);
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
  expect(()=>drawNineSlice(ctx,data,'button_normal',0,0,81,32,{scale:2})).toThrow(/multiple/);
});
test.each([null,[],{kind:'other'},{kind:'font',typo:true},{kind:'font',characters:'🦋'},{kind:'skin',characters:'a'},{kind:'font',theme:'unknown'}])('rejects unsupported UI recipe %j',config=>expect(()=>generateUIRecipe(config)).toThrow());

test('message skins publish legible tones, fixed corner metrics and a solid compositing scrim',()=>{
  const recipe=generateUIRecipe({kind:'skin'}),renderer=new CanvasRenderer(new Palette());
  const pixels=alias=>{const frame=recipe.report.frames.find(f=>f.alias===alias),cell=new Cell({w:24,h:24});for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);}return renderer.renderCellRaw(cell);};
  for(const name of ['message','speech','specimen','specimen_mount','specimen_label','note','notification','warning']){
    const metrics=recipe.report.skins[name];expect(metrics.insets).toEqual({left:6,right:6,top:6,bottom:6});expect(metrics.padding.left).toBeGreaterThan(metrics.insets.left);
    expect(metrics.textTone).toBe(['note','specimen_label'].includes(name)?'ink':'cream');
    // The tiled middle edges are uniform; corner marks must not become a repeated rule.
    const raster=pixels(name),row=y=>Array.from(raster.subarray(y*24*4,(y+1)*24*4));
    for(let y=7;y<18;y++)expect(row(y)).toEqual(row(6));
  }
  expect(pixels('speech')).not.toEqual(pixels('specimen'));expect(pixels('note')).not.toEqual(pixels('panel_light'));
  const scrim=pixels('scrim_solid');for(let i=3;i<scrim.length;i+=4)expect(scrim[i]).toBe(255);
  expect(recipe.report.skins.scrim_solid).toMatchObject({opacity:0.48,insets:{left:0,right:0,top:0,bottom:0}});
  const data=fixture('skin'),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  drawNineSlice(ctx,data,'specimen_label',0,0,624,182,{scale:2});
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
});

test('pixel fit crops transparent padding and preserves non-square art at whole scales',()=>{
  const data=new Uint8ClampedArray(12*10*4);data[(3*12+2)*4+3]=255;data[(6*12+7)*4+3]=1;
  const bounds=getOpaqueBounds({data,width:12,height:10});expect(bounds).toEqual({x:2,y:3,width:6,height:4});
  const calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(drawPixelFit(ctx,{},bounds,{x:3,y:5,width:61,height:49},{padding:8})).toEqual({x:12,y:15,width:42,height:28,scale:7});
  expect(ctx.imageSmoothingEnabled).toBe(false);expect(calls[0].slice(1)).toEqual([2,3,6,4,12,15,42,28]);
  expect(drawPixelFit(ctx,{},bounds,{x:0,y:0,width:5,height:3})).toBe(null);expect(calls).toHaveLength(1);
  expect(getOpaqueBounds({data:new Uint8Array(16),width:2,height:2})).toBe(null);
  expect(drawPixelFit(ctx,{},null,{x:0,y:0,width:20,height:20})).toBe(null);
  expect(()=>getOpaqueBounds({data:[],width:2,height:2})).toThrow(/RGBA/);
  expect(()=>drawPixelFit(ctx,{},bounds,{x:0.5,y:0,width:20,height:20})).toThrow(/integer/);
  expect(()=>drawPixelFit(ctx,{},bounds,{x:0,y:0,width:20,height:20},{padding:-1})).toThrow(/nonnegative/);
});

test('pure pixel fit centers sparse opaque art with padding without a drawing context',()=>{
  expect(pixelFit).toBeTypeOf('function');
  const data=new Uint8ClampedArray(12*10*4);data[(3*12+2)*4+3]=255;data[(6*12+7)*4+3]=1;
  const bounds=Object.freeze(getOpaqueBounds({data,width:12,height:10})),destination=Object.freeze({x:3,y:5,width:61,height:49});
  expect(pixelFit(bounds,destination,{padding:8})).toEqual({x:12,y:15,width:42,height:28,scale:7});
});

test.each([
  [{x:3,y:5,width:19,height:10},{x:0,y:0,width:160,height:160},0,{x:4,y:40,width:152,height:80,scale:8}],
  [{x:2,y:1,width:7,height:3},{x:-13,y:-4,width:31,height:20},2,{x:-8,y:1,width:21,height:9,scale:3}],
  [{x:0,y:0,width:3,height:7},{x:0,y:0,width:20,height:31},2,{x:5,y:5,width:9,height:21,scale:3}],
  [{x:0,y:0,width:1,height:1},{x:4,y:6,width:1,height:1},0,{x:4,y:6,width:1,height:1,scale:1}],
])('pixel fit chooses the maximal whole scale and floors odd centering %#',(bounds,destination,padding,expected)=>{
  expect(pixelFit(bounds,destination,{padding})).toEqual(expected);
  const image={},calls=[],ctx={imageSmoothingEnabled:true,drawImage:(...args)=>calls.push(args)};
  expect(drawPixelFit(ctx,image,bounds,destination,{padding})).toEqual(expected);
  expect(ctx.imageSmoothingEnabled).toBe(false);
  expect(calls).toEqual([[image,bounds.x,bounds.y,bounds.width,bounds.height,expected.x,expected.y,expected.width,expected.height]]);
});

test.each([null,undefined,false,0])('pixel fit short-circuits empty bounds before validating destination or padding %#',bounds=>{
  expect(pixelFit(bounds,null,{padding:-0.5})).toBe(null);
  expect(drawPixelFit(null,null,bounds,null,{padding:-0.5})).toBe(null);
});

test.each([
  [{x:0,y:0,width:18,height:160},0],
  [{x:0,y:0,width:160,height:9},0],
  [{x:0,y:0,width:160,height:160},71],
  [{x:0,y:0,width:160,height:160},90],
])('pixel fit returns null when either padded dimension cannot fit 1x %#',(destination,padding)=>{
  const bounds={x:3,y:5,width:19,height:10},ctx={imageSmoothingEnabled:true,drawImage:()=>{throw Error('Undersized art must not draw.');}};
  expect(pixelFit(bounds,destination,{padding})).toBe(null);
  expect(drawPixelFit(ctx,{},bounds,destination,{padding})).toBe(null);
  expect(ctx.imageSmoothingEnabled).toBe(true);
});

test.each([
  ['Source X',{x:0.5},{},0,'Source X must be an integer.'],
  ['Source Y',{y:0.5},{},0,'Source Y must be an integer.'],
  ['Source width',{width:0},{},0,'Source width must be a positive integer.'],
  ['Source height',{height:1.5},{},0,'Source height must be a positive integer.'],
  ['Negative source X',{x:-1},{},0,'Source bounds must be nonnegative.'],
  ['Negative source Y',{y:-1},{},0,'Source bounds must be nonnegative.'],
  ['Destination X',{},{x:0.5},0,'Destination X must be an integer.'],
  ['Destination Y',{},{y:0.5},0,'Destination Y must be an integer.'],
  ['Destination width',{},{width:0},0,'Destination width must be a positive integer.'],
  ['Destination height',{},{height:1.5},0,'Destination height must be a positive integer.'],
  ['Fractional padding',{},{},0.5,'Padding must be an integer.'],
  ['Negative padding',{},{},-1,'Padding must be nonnegative.'],
])('pixel fit and Canvas adapter preserve validation for %s',(_label,source,dest,padding,message)=>{
  const bounds={x:0,y:0,width:19,height:10,...source},destination={x:0,y:0,width:160,height:160,...dest};
  expect(()=>pixelFit(bounds,destination,{padding})).toThrow(message);
  expect(()=>drawPixelFit(null,null,bounds,destination,{padding})).toThrow(message);
});

test('packGrid picks the squarest sheet, so 166 skin cells are not a 2 column strip',()=>{
  const {cols,rows}=packGrid(166,24,24);
  expect(cols*rows).toBeGreaterThanOrEqual(166);expect(cols).toBeGreaterThan(8);
  expect(Math.max(cols,rows)/Math.min(cols,rows)).toBeLessThan(1.3);
  expect(packGrid(1,8,12)).toEqual({cols:1,rows:1});expect(packGrid(7,8,8).cols*packGrid(7,8,8).rows).toBeGreaterThanOrEqual(7);
  const skin=generateUIRecipe({kind:'skin',theme:'wasteland'}),grid=skin.operations[0];
  expect(grid.cols*24/(grid.rows*24)).toBeLessThan(1.5);expect(grid.rows*grid.cols-skin.report.frames.length).toBeLessThan(grid.cols);
});
test('every theme gets symbol glyphs, named in the report',()=>{
  const {report}=generateUIRecipe({kind:'font'});
  for(const name of ['heart','skull','check','star','moon','bolt','sun','drop','wheat','lock','cross'])expect(report.glyphs[report.symbols[name]],name).toBeDefined();
  expect(report.symbols.heart).toBe('♥');
  for(const tone of ['cream','muted','gold','ink'])expect(report.glyphs['♥'].frames[tone]).toBe('glyph_2665_'+tone);
  expect(generateUIRecipe({kind:'font',face:'compact'}).report.symbols.skull).toBe('☠');
});
test('display face draws every regular glyph twice as big with outline, bevel and shadow, in whole pixels',()=>{
  const regular=generateUIRecipe({kind:'font',theme:'wasteland'}),display=generateUIRecipe({kind:'font',theme:'wasteland',face:'display'});
  expect(display.report).toMatchObject({face:'display',cellSize:{width:12,height:24},baseline:19,lineHeight:24});
  expect(Object.keys(display.report.glyphs)).toEqual(Object.keys(regular.report.glyphs));
  expect(display.report.glyphs.A.advance).toBe(12);expect(display.report.glyphs[' '].advance).toBe(8);
  expect(generateUIRecipe({kind:'font',theme:'wasteland',face:'display'})).toEqual(display);
  const colorsOf=tone=>new Set(display.operations.filter(o=>o.color&&o.cell===display.report.frames.find(f=>f.alias==='glyph_0041_'+tone).cell).map(o=>o.color));
  expect(colorsOf('gold').size).toBe(4);expect(colorsOf('gold').has('#f0d466')).toBe(true);expect(colorsOf('ink').has('#e3cf93')).toBe(true);
  for(const f of display.report.frames){expect(f.bounds.right).toBeLessThan(12);expect(f.bounds.bottom).toBeLessThan(24);}
  for(const [char,glyph] of Object.entries(display.report.glyphs))if(char!==' ')expect(glyph.bounds.right-glyph.bounds.left,char).toBeGreaterThanOrEqual(2);
});
test('wasteland skin carries the colour symbol icons',()=>{
  const {report}=generateUIRecipe({kind:'skin',theme:'wasteland'});
  for(const n of ['skull','wheat','bolt','sun','moon','star','check','cross','lock'])expect(report.skins['sym_'+n],n).toMatchObject({icon:true,color:true});
  expect(generateUIRecipe({kind:'skin'}).report.skins.sym_skull).toBeUndefined();
});

test('logo kind draws one deterministic stacked logotype frame with sun and wheat',()=>{
  const a=generateUIRecipe({kind:'logo',theme:'wasteland'}),b=generateUIRecipe({kind:'logo',theme:'wasteland'});
  expect(a).toEqual(b);
  expect(a.report.kind).toBe('logo');expect(a.report.frames.map(f=>f.alias)).toEqual(['logo']);
  expect(a.report.logo.text).toBe('PIXEL\nSTUDIO');
  expect(a.operations).toEqual(generateUIRecipe({kind:'logo',theme:'wasteland',text:'PIXEL\nSTUDIO'}).operations);
  const {width,height}=a.report.cellSize;expect(width).toBeGreaterThan(120);expect(height).toBeGreaterThan(80);expect(a.operations[0]).toMatchObject({cols:1,rows:1,size:`${width}x${height}`});
  expect(a.report.frames[0].bounds).toMatchObject({left:0,top:expect.any(Number),right:width-1,bottom:height-1});
  expect(new Set(a.operations.filter(o=>o.color).map(o=>o.color)).size).toBeGreaterThan(10);
  expect(generateUIRecipe({kind:'logo',text:'GREEN ACRES'}).report.cellSize.width).toBeGreaterThan(width);
  expect(()=>generateUIRecipe({kind:'logo',text:'aé'})).toThrow(/Logo text/);
  expect(()=>generateUIRecipe({kind:'skin',text:'X'})).toThrow(/logos/);
  expect(()=>generateUIRecipe({kind:'logo',face:'display'})).toThrow(/fonts/);
});
test('wasteland skin has the boss banner plate with wide insets',()=>{
  const {report}=generateUIRecipe({kind:'skin',theme:'wasteland'});
  expect(report.skins.banner_boss).toMatchObject({insets:{left:8,right:8,top:8,bottom:8},minWidth:24});
  expect(generateUIRecipe({kind:'skin'}).report.skins.banner_boss).toBeUndefined();
});
