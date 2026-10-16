import {defineTheme,normalizeBitmapFont,button,itemSlot,panel,text,field,absolute,extension,layoutUi,createPhaserUi,createUiInteraction,pixelResolution,projectPixelPoint,placeBitmapText,planActionGroup} from '../../server/build/ui-index.mjs';
import type {NativeScene,NativeParent,NativePorts,NativeImage,NativeRectangle,UiSnapshot,NativeExtension,UiIntent,NativeAppearancePlacement,ThemeEdge,SourceRGBA} from '../../server/build/ui-index.mjs';
// The coordinator resolves this to the actual installed Phaser 4.2.1 declaration
// package. This fixture requires a separately verified TypeScript compiler.
import type Phaser from 'phaser';
import {publishUiSoftware} from '../../server/build/ui-software.mjs';

const font=normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}}}}});
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
mount.update({...snapshot,revision:2});mount.dispose();remove();ui.dispose();void intents;
const plan=layoutUi(snapshot.tree,{...snapshot,theme,extensions:{'consumer:chart':chart}});
const interaction=createUiInteraction({id:'consumer:portable',plan});interaction.handle({type:'default',inputId:'enter:1'});interaction.dispose();
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
const edge={width:2,authored:'magenta',corners:{style:'square'}} satisfies ThemeEdge;
const washTheme=defineTheme({version:1,id:'consumer:wash',roles:{absolute:{},itemSlot:{opacity:1,edge,colors:{focus:'#ff2bd6'}},wash:{opacity:0,alternatives:[{kind:'flat',color:'#ff2bd6'}],placement:{nativeStates:{focus:{opacity:.3},hover:{opacity:.3},pressed:{opacity:.3},disabled:{opacity:0}}}}}});
const washTree=absolute({id:'wash-root',children:[itemSlot({id:'item',actionId:'game:item',layout:{width:20,height:10}}),panel({id:'wash',appearanceRole:'wash',metadata:{'ui:stateOwner':'item'},layout:{width:20,height:10}})]});
layoutUi(washTree,{theme:washTheme,context,revision:1}).records.forEach(record=>{const parentId:string|null|undefined=record.parentId;void parentId;});
// @ts-expect-error edge width is a local number, never a CSS dimension
const invalidEdge:ThemeEdge={width:'2px'};
// @ts-expect-error native opacity has no string or arbitrary alpha alias
const invalidOpacity:NativeAppearancePlacement={nativeStates:{focus:{opacity:'0.3'}}};
void invalidEdge;void invalidOpacity;
createPhaserUi({scene:structuralScene,theme,ports:nativePorts,limits:{sourceBytes:4194304}}).mount(snapshot,{parent:structuralParent,scope:'consumer:actual'});
// @ts-expect-error reserved state-owner identity must be a string
button({id:'bad-state-owner',metadata:{'ui:stateOwner':17}});
// @ts-expect-error transient appearance cannot grant action authority
const invalidPlacement:NativeAppearancePlacement={nativeStates:{pressed:{actionId:'game:bad'}}};
void invalidPlacement;
