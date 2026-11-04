// Second fixture page: compressed-tiling and prelaid-text proof cases. One panel or label is
// mounted at a time; the runner screenshots each mount and compares decoded pixels.
import * as u from '/server/build/ui-index.mjs';
const query=new URLSearchParams(location.search);
const json=async name=>{const response=await fetch(`./assets/${name}`);if(!response.ok)throw Error(`Asset ${name}: ${response.status}`);return response.json();};
const [fontReport,fontAtlas,skinReport,skinAtlas]=await Promise.all(['font.report.json','font.atlas.json','skin.report.json','skin.atlas.json'].map(json));
const font=u.normalizeBitmapFont({report:fontReport,atlas:fontAtlas});
const skins=Object.fromEntries(Object.entries(skinReport.skins).map(([id,skin])=>{const f=skinAtlas.frames.find(f=>f.filename===id).frame;return [id,{...skin,frame:{x:f.x,y:f.y,width:f.w,height:f.h}}];}));
const themeFor=art=>u.defineTheme({version:1,id:`native:proof-${art}`,fonts:{body:{font}},skins,roles:{absolute:{},panel:{alternatives:[{kind:'skin',id:art}],padding:0},text:{font:'body',tone:'cream',padding:0}},geometry:{gap:0,padding:0,minTarget:0}});
let scene,current;
const countImages=object=>(object.type==='Image'?1:0)+(object.list??[]).reduce((sum,child)=>sum+countImages(child),0);
const sceneImages=()=>scene.children.list.reduce((sum,child)=>sum+countImages(child),0);
// In-page source read: draw the loaded texture source into a 2D canvas and copy its bytes.
function readPlane(source) {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=false;context.drawImage(source.image,0,0);
  const {data}=context.getImageData(0,0,canvas.width,canvas.height);return {width:canvas.width,height:canvas.height,data:new Uint8Array(data.buffer.slice(0))};
}
// Deliberate faults injected into the source-pixel port, never into the runtime.
const faults={
  // Claims the detailed art repeats every source pixel along x: column 2 is overwritten with column 1.
  'wrong-period'(plane,frame) {
    const data=new Uint8Array(plane.data);
    for(let y=0;y<frame.h;y++)for(let c=0;c<4;c++)data[((frame.y+y)*plane.width+frame.x+2)*4+c]=data[((frame.y+y)*plane.width+frame.x+1)*4+c];
    return {...plane,data};
  },
  // Returns the plane at twice the density (a device-pixel-ratio readback of the same texture).
  'wrong-density'(plane) {
    const width=plane.width*2,height=plane.height*2,data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const from=((y>>1)*plane.width+(x>>1))*4;data.set(plane.data.subarray(from,from+4),(y*width+x)*4);}
    return {width,height,data};
  },
};
const ready=new Promise((resolve,reject)=>{
  class ProofScene extends Phaser.Scene {
    preload(){this.load.image('native-font','./assets/font.png');this.load.image('native-skin','./assets/skin.png');this.load.on('loaderror',file=>reject(Error(`Load failed: ${file.url}`)));}
    create(){scene=this;this.cameras.main.setRoundPixels(false);resolve();}
  }
  const renderer=query.get('renderer')==='canvas'?Phaser.CANVAS:Phaser.WEBGL;
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
  const context=renderer===Phaser.WEBGL?canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true}):undefined;
  if(renderer===Phaser.WEBGL&&!context)throw Error('WebGL2 unavailable');
  window.nativeGame=new Phaser.Game({type:renderer,canvas,context,width:160,height:120,resolution:1,backgroundColor:'#080c10',pixelArt:true,roundPixels:false,banner:false,audio:{noAudio:true},render:{antialias:false,antialiasGL:false,roundPixels:false,preserveDrawingBuffer:true},scene:ProofScene});
});
await ready;
function hide() {
  const errors=[];
  if(current){try{current.mount?.dispose();current.host.dispose();}catch(error){errors.push(error.message);}try{current.root.destroy();}catch(error){errors.push(error.message);}current=undefined;}
  return {errors,images:sceneImages(),sceneObjects:scene.children.list.length};
}
function mountOne(theme,context,tree,mode) {
  hide();
  const state={reads:0,root:scene.add.container()};
  const ports={
    resolveAsset:request=>({ownership:'borrowed',texture:scene.textures.get(request.kind==='font'?'native-font':'native-skin')}),
    attachContext:({context})=>{const parent=scene.add.container(context.localToPhysical.origin.x,context.localToPhysical.origin.y).setScale(context.localToPhysical.scale);return {ownership:'owned',parent,release:()=>parent.destroy()};},
  };
  if(mode!=='exact')ports.readSourceRGBA=({kind,id,source})=>{
    if(kind!=='skin')return null;
    state.reads++;
    const plane=readPlane(source),frame=skinAtlas.frames.find(f=>f.filename===id).frame;
    const read=faults[mode]?faults[mode](plane,frame):plane;
    return {source,...read};
  };
  state.host=u.createPhaserUi({scene,theme,ports});current=state;
  try {
    state.mount=state.host.mount({revision:1,tree,context,additionalContexts:[]},{parent:state.root,scope:'native:proof'});
    return {mounted:true,reads:state.reads,images:sceneImages(),nativeObjects:state.mount.inspect({limit:32}).native.objects};
  } catch(error) {
    const reads=state.reads,cleanup=hide();
    return {mounted:false,error:error.message,errorName:error.name,reads,imagesAfterRejection:cleanup.images,sceneObjectsAfterRejection:cleanup.sceneObjects};
  }
}
window.proofUi={
  renderer:window.nativeGame.renderer.type,webgl2:!!window.nativeGame.renderer.gl&&window.nativeGame.renderer.gl instanceof WebGL2RenderingContext,
  hide,
  // mode: 'exact' (no port), 'compressed' (honest port), 'wrong-period', 'wrong-density'.
  showPanel({art,mode}) {
    const context={id:'native:main',revision:1,localToPhysical:{scale:2,x:12,y:8},sourcePixelPhysicalSize:2,viewport:{x:0,y:0,width:64,height:48}};
    const tree=u.absolute({id:'root',layout:{width:64,height:48},children:[u.panel({id:'tile',layout:{width:35,height:27}})]});
    return mountOne(themeFor(art),context,tree,mode);
  },
  // Prelaid label under a physical zoom; returns the layout record that the pixels must match.
  showText({label,zoom,wrap,width,height}) {
    const context={id:'native:text',revision:1,localToPhysical:{scale:zoom,x:4,y:6},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:100,height:60}};
    const tree=u.absolute({id:'root',layout:{width:100,height:60},children:[u.text({id:'label',label,layout:{x:2,y:3,width,height,wrap}})]});
    const theme=themeFor('uniform'),snapshot={revision:1,tree,context,additionalContexts:[]};
    const record=u.layoutUi(tree,{...snapshot,theme,extensions:{}}).records.find(r=>r.id==='label');
    const result=mountOne(theme,context,tree,'exact');
    return {...result,text:JSON.parse(JSON.stringify(record.text))};
  },
  shutdown() {
    const errors=hide().errors,game=window.nativeGame,canvas=game.canvas,manager=game.scene;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Phaser teardown did not complete within 5000ms')),5000);game.events.once(Phaser.Core.Events.DESTROY,()=>{clearTimeout(timer);setTimeout(()=>resolve({errors,canvasConnected:canvas.isConnected,remainingScenes:manager.scenes.length,pendingDestroy:game.pendingDestroy,loopRunning:game.loop.running}),0);});try{game.destroy(true,true);}catch(error){clearTimeout(timer);reject(error);}});
  },
};
