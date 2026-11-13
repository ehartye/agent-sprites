import {defineTheme,normalizeBitmapFont,button,itemSlot,panel,text,field,absolute,extension,layoutUi,createPhaserUi,createUiInteraction,pixelResolution,projectPixelPoint,placeBitmapText,planActionGroup} from '../../server/build/ui-index.mjs';
import type {NativeScene,NativeParent,NativePorts,NativeImage,NativeRectangle,UiSnapshot,NativeExtension,UiIntent,NativeAppearancePlacement,ThemeEdge,SourceRGBA} from '../../server/build/ui-index.mjs';
// Verified against the producer-pinned Phaser 4.2.1 declaration package and compiler.
import type Phaser from 'phaser';
import {publishUiSoftware} from '../../server/build/ui-software.mjs';
import {row,stack} from '../../server/build/ui-components.mjs';
import {paginateUiBlocks} from '../../server/build/ui-layout.mjs';
import type {Layout} from '../../server/build/ui-components.mjs';
import type {InteractionPolicy} from '../../server/build/ui-interaction.mjs';

const font=normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}}}}});
const flowLayout={wrap:true,rowGap:0,lastPageHeight:30,overflow:'paginate'} satisfies Layout;
row({id:'flow',layout:flowLayout,children:[button({id:'action',layout:{width:60,height:22}})]});
stack({id:'reading-pages',layout:{height:60,lastPageHeight:30,overflow:'paginate'}});
text({id:'prelaid',label:' ?    ? ',layout:{wrap:false}});
placeBitmapText(font,' ?    ? ',0,0,{wrap:false,maxWidth:10,sourceOffsets:true,align:'center'});
paginateUiBlocks([{height:80,wholeFirst:true,flow:{count:8,heightOf:(from,to)=>(to-from)*10,keep:index=>index===2}},{height:20,breakBefore:true}],{pageHeight:60,lastPageHeight:30,minSplit:10,gap:0}).forEach(page=>page.forEach(run=>{const block:number=run.block;const from:number|undefined=run.from;void block;void from;}));
// @ts-expect-error wrap is an explicit boolean
row({id:'bad-wrap',layout:{wrap:'true'}});
// @ts-expect-error final capacity uses semantic numbers
stack({id:'bad-final',layout:{lastPageHeight:'30px'}});
// @ts-expect-error there is one coordinated row/text policy, no competing noReflow flag
text({id:'bad-text-policy',layout:{noReflow:true}});
// @ts-expect-error low-level wrap is an explicit boolean
placeBitmapText(font,'?',0,0,{wrap:'false'});
// @ts-expect-error flow height must remain numeric
paginateUiBlocks([{height:20,flow:{count:2,heightOf:()=> '20'}}],{pageHeight:30});
// @ts-expect-error heading keep callbacks must return boolean
paginateUiBlocks([{height:20,flow:{count:2,heightOf:()=>20,keep:()=>1}}],{pageHeight:30});
const colors={focus:'#ffffff',hover:'#ffff00',pressed:'#ff0000',disabled:'#777777',selection:'#444444',caret:'#ffffff'};
const theme=defineTheme({version:1,id:'consumer:theme',fonts:{body:{font}},roles:{absolute:{},button:{font:'body',tone:'cream',colors},field:{font:'body',tone:'cream',colors},extension:{}}});
const context={id:'consumer:main',revision:1,localToPhysical:{scale:2,x:0,y:0},sourcePixelPhysicalSize:2,viewport:{x:0,y:0,width:100,height:100}};
const snapshot:UiSnapshot={revision:1,context,tree:absolute({id:'screen',children:[button({id:'ok',label:'?',actionId:'game:ok'}),field({id:'name',value:'?',selection:{start:0,end:1,direction:'forward'},composition:null}),extension({id:'chart',extensionId:'consumer:chart',model:{value:1}})]})};
declare const scene:NativeScene;
declare const parent:NativeParent;
type ChartFacade={readonly line:(from:number,to:number)=>void};
declare const ports:NativePorts<ChartFacade>;
const chart:NativeExtension<ChartFacade>={version:1,
  measure:()=>({min:{width:10,height:10},preferred:{width:20,height:20},overflow:'clip'}),
  regions:(_model,a)=>[{id:'zoom',bounds:a.bounds,actionId:'game:zoom',label:'?',enabled:true,focusable:true}],
  mount(_model,_allocation,scope){scope.native.line(0,1);scope.onDispose(()=>{});}};
const ui=createPhaserUi({scene,theme,ports});const remove=ui.registerExtension('consumer:chart',chart);
const mount=ui.mount(snapshot,{parent,scope:'consumer:screen',policy:{navigation:'spatial'}});
const intents:readonly UiIntent[]=mount.handle({type:'press',point:{x:2,y:2},pointSpace:'physical',inputId:'pointer:1'});
mount.handle({type:'release',point:{x:1,y:1},pointSpace:{contextId:context.id,revision:1},inputId:'pointer:1'});
mount.inspect({limit:20}).controls.forEach(c=>{const focused:boolean=c.focused;void focused;});
const smallFace=button({id:'small-face',layout:{width:27,height:15},regions:{hit:{x:-8,y:-8,width:44,height:31},focus:{x:-10,y:-10,width:60,height:40}}});
mount.inspect({limit:20}).controls.forEach(c=>{const geometry:readonly number[]=[c.hitBounds.width,c.focusBounds.width];const coordinateSpace:string=c.semanticContextId;void geometry;void coordinateSpace;});
void smallFace;
// @ts-expect-error regions declare continuous numeric rectangles, not CSS units
button({id:'bad-region',regions:{hit:{x:0,y:0,width:'44px',height:44}}});
// @ts-expect-error visual allocation stays in layout; no implicit paint region API
button({id:'bad-region-key',regions:{paint:{x:0,y:0,width:20,height:10}}});
mount.update({...snapshot,revision:2});mount.dispose();remove();ui.dispose();void intents;
const plan=layoutUi(snapshot.tree,{...snapshot,theme,extensions:{'consumer:chart':chart}});
const interaction=createUiInteraction({id:'consumer:portable',plan});interaction.handle({type:'default',inputId:'enter:1'});interaction.dispose();
const logicalSpatialPolicy={navigation:'spatial',wrap:true} satisfies InteractionPolicy;
const directional=createUiInteraction({id:'consumer:directional',plan},logicalSpatialPolicy);
directional.handle({type:'navigate',direction:'down'}).forEach(intent=>{if(intent.kind==='focus'){const controlId:string=intent.controlId;const revision:number=intent.modelRevision;void controlId;void revision;}});directional.dispose();
// @ts-expect-error logical reveal uses the existing declared focus order, no private solver option
const privateSpatialPolicy:InteractionPolicy={navigation:'spatial',logicalBounds:()=>({x:0,y:0,width:1,height:1})};
void privateSpatialPolicy;
const resolution=pixelResolution({id:'consumer:main',revision:1,localToPhysical:{scale:2,origin:{x:0,y:0}},physicalPixelsPerSourcePixel:2});
projectPixelPoint(resolution,{x:1,y:2});placeBitmapText(font,'?',0,0,{resolution,sourceOffsets:true}).draws.forEach(d=>void d.destination.width);
planActionGroup({actions:[],visualOrder:[],fallbackOrder:[],width:100,insets:{top:0,right:0,bottom:0,left:0},gap:0,rowGap:0,policy:'equal-max-fit'});
publishUiSoftware({output:'.tmp/consumer-bundle'}).receipt.producer.identity.sha256;
// @ts-expect-error undeclared stock node properties are not an extension API
button({id:'bad',gameDispatch:()=>{}});
// @ts-expect-error fields remain controlled strings
field({id:'bad',value:17});
// @ts-expect-error physical/source resolution options are mutually exclusive
placeBitmapText(font,'?',0,0,{resolution,scale:2});

declare const actualScene:Phaser.Scene;
declare const actualParent:Phaser.GameObjects.Container;
declare const actualTexture:Phaser.Textures.Texture;
declare const sourcePixels:Omit<SourceRGBA,'source'>;
const structuralScene:NativeScene=actualScene;
const structuralParent:NativeParent=actualParent;
declare const actualImage:Phaser.GameObjects.Image;
declare const actualRectangle:Phaser.GameObjects.Rectangle;
const structuralImage:NativeImage=actualImage;
const structuralRectangle:NativeRectangle=actualRectangle;
structuralImage.setAlpha(.3);structuralRectangle.setAlpha(0).setAlpha(1);
const nativePorts:NativePorts={
  resolveAsset:()=>({ownership:'borrowed',texture:actualTexture}),
  readSourceRGBA:request=>request.kind==='skin'?{...sourcePixels,source:request.source}:null,
  attachContext:()=>({ownership:'borrowed',parent:actualParent})};
const placement={nativeStates:{hover:{tone:'cream',opacity:.3},focus:{tone:'cream',opacity:.3},pressed:{paintOffset:{x:0,y:1},opacity:0},disabled:{visible:false,opacity:1}}} satisfies NativeAppearancePlacement;
const linked=absolute({id:'linked',children:[button({id:'owner',actionId:'game:ok'}),text({id:'linked-label',label:'?',metadata:{'ui:stateOwner':'owner'}})]});
void linked;void placement;
const edge={width:2,focusWhenDisabled:true,authored:'magenta',corners:{style:'square'}} satisfies ThemeEdge;
const washTheme=defineTheme({version:1,id:'consumer:wash',roles:{absolute:{},itemSlot:{opacity:1,edge,colors:{focus:'#ff2bd6'}},wash:{opacity:0,alternatives:[{kind:'flat',color:'#ff2bd6'}],placement:{nativeStates:{focus:{opacity:.3},hover:{opacity:.3},pressed:{opacity:.3},disabled:{opacity:0}}}}}});
const washTree=absolute({id:'wash-root',children:[itemSlot({id:'item',actionId:'game:item',layout:{width:20,height:10}}),panel({id:'wash',appearanceRole:'wash',metadata:{'ui:stateOwner':'item'},layout:{width:20,height:10}})]});
layoutUi(washTree,{theme:washTheme,context,revision:1}).records.forEach(record=>{const parentId:string|null|undefined=record.parentId;void parentId;});
// @ts-expect-error edge width is a local number, never a CSS dimension
const invalidEdge:ThemeEdge={width:'2px'};
// @ts-expect-error disabled-focus ink is an explicit boolean, not an action grant
const invalidDisabledFocus:ThemeEdge={focusWhenDisabled:'true'};
void invalidDisabledFocus;
// @ts-expect-error native opacity has no string or arbitrary alpha alias
const invalidOpacity:NativeAppearancePlacement={nativeStates:{focus:{opacity:'0.3'}}};
void invalidEdge;void invalidOpacity;
createPhaserUi({scene:structuralScene,theme,ports:nativePorts,limits:{sourceBytes:4194304}}).mount(snapshot,{parent:structuralParent,scope:'consumer:actual'});
// @ts-expect-error reserved state-owner identity must be a string
button({id:'bad-state-owner',metadata:{'ui:stateOwner':17}});
// @ts-expect-error transient appearance cannot grant action authority
const invalidPlacement:NativeAppearancePlacement={nativeStates:{pressed:{actionId:'game:bad'}}};
void invalidPlacement;

const passive=createPhaserUi({scene:structuralScene,theme,ports:nativePorts}).mountPassive({revision:1,context,items:[{id:'passive-label',tree:text({id:'passive-label',label:'?'}),x:0,y:0}]},{parent:structuralParent,scope:'consumer:passive'});
passive.update({revision:2,context,items:[]});
// @ts-expect-error Passive ownership cannot acquire an input handle.
passive.handle({type:'activate',controlId:'passive-label'});

// Memo tokens are opaque, scoped immutable data; they never replace a snapshot.
import {prepareUiLayout,inspectUiLayoutMemo,type UiLayoutMemo} from '../../server/build/ui-layout.mjs';
const memoPlan=prepareUiLayout(text({id:'memo-label',label:'?'}),{theme,context,revision:1});
inspectUiLayoutMemo(memoPlan.memo);
// @ts-expect-error Ordinary records cannot forge a memo token.
const forgedMemo:UiLayoutMemo={};
void forgedMemo;

const iconPlacementMount=createPhaserUi({scene:structuralScene,theme,ports:nativePorts}).mount(snapshot,{parent:structuralParent,scope:'consumer:icon-placement'});
iconPlacementMount.placeIcons({expectedRevision:1,revision:2,items:[{id:'icon',x:1.25,y:-2}]});
// @ts-expect-error Stock placement cannot replace immutable image content.
iconPlacementMount.placeIcons({expectedRevision:2,revision:3,items:[{id:'icon',x:0,y:0,asset:'other'}]});
// @ts-expect-error Placement coordinates remain finite-number data, not strings.
iconPlacementMount.placeIcons({expectedRevision:2,revision:3,items:[{id:'icon',x:'0',y:0}]});
// @ts-expect-error A placement needs an explicit current-publication dependency.
iconPlacementMount.placeIcons({revision:3,items:[]});
// @ts-expect-error Ordinary-mount placement does not broaden passive ownership.
passive.placeIcons({expectedRevision:2,revision:3,items:[]});

// Private appearance reader is readonly and carries no layout/admission authority.
import {readUiAppearance} from '../../server/build/ui-interaction.mjs';
declare const compactAppearanceInstance: import('../../server/build/ui-interaction.mjs').UiInteraction;
const compactAppearance=readUiAppearance(compactAppearanceInstance);
const compactSelected:boolean|undefined=compactAppearance.controls[0].selected;
const compactPressed:boolean=compactAppearance.controls[0].pressed;
void compactSelected;void compactPressed;
// @ts-expect-error compact renderer observations deliberately exclude geometry
compactAppearance.controls[0].bounds;
// @ts-expect-error compact renderer observations are readonly
compactAppearance.controls[0].pressed=false;
// @ts-expect-error compact renderer arrays are readonly
compactAppearance.controls.push(compactAppearance.controls[0]);

// Isolated ordering is explicit; legacy add-only scenes remain valid by default.
declare const stockGroup: import('../../server/build/ui-phaser-runtime.mjs').NativeStockGroup;
const isolatedScene={...structuralScene,add:{...structuralScene.add,container:(_x:number,_y:number)=>stockGroup}};
const isolatedUi=createPhaserUi({scene:isolatedScene,theme,ports:nativePorts,stockOrdering:'isolated',limits:{stockGroups:8}});
const isolatedMount=isolatedUi.mount(snapshot,{parent:structuralParent,scope:'consumer:isolated'});
const stockGroupCount:number|undefined=isolatedMount.inspect({limit:1}).native.stockGroups;
void stockGroupCount;
// @ts-expect-error Ordering mode is an explicit contract, not a guessed capability.
createPhaserUi({scene:structuralScene,theme,ports:nativePorts,stockOrdering:'auto'});
