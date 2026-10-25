import * as u from '/server/build/ui-index.mjs';
const query=new URLSearchParams(location.search),themeId=query.get('theme')??'night';
const json=async name=>{const response=await fetch(`./assets/${name}`);if(!response.ok)throw Error(`Asset ${name}: ${response.status}`);return response.json();};
const [fontReport,fontAtlas,skinReport,skinAtlas]=await Promise.all(['font.report.json','font.atlas.json','skin.report.json','skin.atlas.json'].map(json));
const font=u.normalizeBitmapFont({report:fontReport,atlas:fontAtlas});
const frame=(atlas,id)=>atlas.frames.find(f=>f.filename===id).frame;
const skins=Object.fromEntries(Object.entries(skinReport.skins).map(([id,skin])=>{const f=frame(skinAtlas,id);return [id,{...skin,frame:{x:f.x,y:f.y,width:f.w,height:f.h}}];}));
const tone=themeId==='night'?'cream':'ink';
const theme=u.defineTheme({version:1,id:`native:${themeId}`,fonts:{body:{font}},skins,
  roles:{absolute:{},panel:{alternatives:[{kind:'skin',id:themeId}],padding:0},text:{font:'body',tone,padding:0},
    button:{font:'body',tone,padding:1,alternatives:[{kind:'skin',id:themeId}]},extension:{}},geometry:{gap:0,padding:0,minTarget:0}});
let scene,host,mount,revision=1,contextRevision=1,scroll=0,extensionDisposed=0,failExtension=false;
let attachmentsCreated=0,attachmentsDisposed=0,originOffset=0;
const fixtureRoots=[];
let disposedResult,shutdownPromise,inputDeliveries=0;
const createFixtureRoot=()=>{const root=scene.add.container();fixtureRoots.push(root);return root;};
const inspectFixtureRoots=()=>fixtureRoots.map(root=>({children:root.list.length,borrowedAlive:root.scene===scene}));
const intents=[];
const main=()=>({id:'native:main',revision:contextRevision,localToPhysical:{scale:2,x:12+originOffset,y:8+originOffset},sourcePixelPhysicalSize:2,viewport:{x:3,y:2,width:64,height:48}});
const detail=()=>({id:'native:detail',revision:contextRevision,localToPhysical:{scale:1,x:12+originOffset,y:8+originOffset},sourcePixelPhysicalSize:1,viewport:{x:6,y:4,width:128,height:96}});
const tree=()=>u.absolute({id:'root',layout:{width:64,height:48},focus:{initialId:'ok',defaultId:'ok',cancelId:'cancel',order:['ok','cancel','custom:region']},children:[
  u.panel({id:'shell',layout:{width:60,height:44}}),
  u.button({id:'ok',label:'?',actionId:'native:accept',labelContextId:'native:detail',skinContextId:'native:detail',layout:{x:4,y:4,width:20,height:10}}),
  u.button({id:'cancel',actionId:'native:cancel',layout:{x:26,y:4,width:10,height:10}}),
  u.text({id:'glyph',label:'?',labelContextId:'native:detail',layout:{x:4,y:18,width:10,height:8,wrap:false}}),
  u.absolute({id:'clip',layout:{x:40,y:4,width:10,height:10,overflow:'clip'},children:[u.text({id:'clipped-glyphs',label:'??',labelContextId:'native:detail',layout:{x:8,y:0,width:20,height:8,wrap:false}})]}),
  u.absolute({id:'scroll',layout:{x:4,y:28,width:12,height:6,overflow:'scroll',scrollY:scroll},children:[u.text({id:'scrolled-glyph',label:'?',labelContextId:'native:detail',layout:{y:8,width:12,height:8,wrap:false}})]}),
  u.absolute({id:'extension-clip',layout:{x:40,y:20,width:6,height:6,overflow:'clip'},children:[
    u.extension({id:'custom',extensionId:'native:region',model:{fail:failExtension},layout:{width:8,height:8}}),
  ]}),
]});
const snapshot=()=>({revision,tree:tree(),context:main(),additionalContexts:[detail()]});
function route(input){inputDeliveries++;const emitted=mount.handle(input);intents.push(...emitted);return emitted;}
const ready=new Promise((resolve,reject)=>{
  class ContractScene extends Phaser.Scene {
    preload(){this.load.image('native-font','./assets/font.png');this.load.image('native-skin','./assets/skin.png');this.load.on('loaderror',file=>reject(Error(`Load failed: ${file.url}`)));}
    create(){
      try {
        scene=this;
        host=u.createPhaserUi({scene,theme,ports:{
          resolveAsset:request=>({ownership:'borrowed',texture:scene.textures.get(request.kind==='font'?'native-font':'native-skin')}),
          attachContext:({context})=>{
            const parent=scene.add.container(context.localToPhysical.origin.x,context.localToPhysical.origin.y).setScale(context.localToPhysical.scale);
            attachmentsCreated++;return {ownership:'owned',parent,release:()=>{attachmentsDisposed++;parent.destroy();}};
          },
          extensionFacade:({allocation},owner)=>({paint(){
            // A bounded facade clips explicitly to the common allocation and inherited clip.
            const b=allocation.bounds,c=allocation.clipBounds;
            const left=Math.max(b.x,c?.x??b.x),top=Math.max(b.y,c?.y??b.y);
            const right=Math.min(b.x+b.width,c?c.x+c.width:b.x+b.width),bottom=Math.min(b.y+b.height,c?c.y+c.height:b.y+b.height);
            const mapping=allocation.context.localToPhysical;
            const object=scene.add.rectangle(mapping.origin.x+left*mapping.scale,mapping.origin.y+top*mapping.scale,(right-left)*mapping.scale,(bottom-top)*mapping.scale,0x28c878).setOrigin(0).setDepth(1000);
            owner.own(object,item=>item.destroy());return object;
          }}),
        }});
        host.registerExtension('native:region',{version:1,measure:()=>({min:{width:8,height:8},preferred:{width:8,height:8},overflow:'clip'}),
          regions:(_model,a)=>[{id:'region',bounds:{x:a.bounds.x-4,y:a.bounds.y-4,width:a.bounds.width+8,height:a.bounds.height+8},actionId:'native:custom'}],
          mount(model,_allocation,scope){scope.onDispose(()=>extensionDisposed++);scope.native.paint();if(model.fail)throw Error('Deliberate extension failure');}});
        mount=host.mount(snapshot(),{parent:createFixtureRoot(),scope:'native:screen'});
        resolve();
      }catch(error){reject(error);}
    }
  }
  const renderer=query.get('renderer')==='canvas'?Phaser.CANVAS:Phaser.WEBGL;
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
  const context=renderer===Phaser.WEBGL?canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true}):undefined;
  if(renderer===Phaser.WEBGL&&!context)throw Error('WebGL2 unavailable');
  window.nativeGame=new Phaser.Game({type:renderer,canvas,context,width:160,height:120,resolution:1,backgroundColor:'#080c10',pixelArt:true,roundPixels:false,banner:false,audio:{noAudio:true},render:{antialias:false,antialiasGL:false,roundPixels:false,preserveDrawingBuffer:true},scene:ContractScene});
});
await ready;
const canvas=window.nativeGame.canvas;
const pointerDown=event=>{const b=canvas.getBoundingClientRect();route({type:'press',inputId:'pointer:primary',point:{x:(event.clientX-b.left)*canvas.width/b.width,y:(event.clientY-b.top)*canvas.height/b.height},pointSpace:'physical'});};
const pointerUp=event=>{const b=canvas.getBoundingClientRect();route({type:'release',inputId:'pointer:primary',point:{x:(event.clientX-b.left)*canvas.width/b.width,y:(event.clientY-b.top)*canvas.height/b.height},pointSpace:'physical'});};
canvas.addEventListener('pointerdown',pointerDown);
canvas.addEventListener('pointerup',pointerUp);
let keyboardId=0;
const keyDown=event=>{if(event.key==='Enter')route({type:'default',inputId:`keyboard:${++keyboardId}`});if(event.key==='Escape')route({type:'cancel',inputId:`keyboard:${++keyboardId}`});};
window.addEventListener('keydown',keyDown);
window.nativeUi={
  renderer:window.nativeGame.renderer.type,webgl2:!!window.nativeGame.renderer.gl&&window.nativeGame.renderer.gl instanceof WebGL2RenderingContext,
  inspect:()=>mount.inspect({limit:32}),handle:route,intents,
  update(options={}){revision++;if(options.context)contextRevision++;if(options.origin!==undefined)originOffset=options.origin;if(options.scroll!==undefined)scroll=options.scroll;failExtension=!!options.fail;mount.update(snapshot());return mount.inspect({limit:32});},
  plan:()=>u.layoutUi(tree(),{...snapshot(),theme,extensions:{'native:region':{version:1,measure:()=>({min:{width:8,height:8},preferred:{width:8,height:8},overflow:'clip'})}}}),
  lifecycle(){return {attachmentsCreated,attachmentsDisposed,extensionDisposed,borrowedFonts:scene.textures.exists('native-font'),borrowedSkins:scene.textures.exists('native-skin'),fontFrames:Object.keys(scene.textures.get('native-font').frames),skinFrames:Object.keys(scene.textures.get('native-skin').frames),sceneObjects:scene.children.list.length};},
  remount(){mount.dispose();const borrowedRoots=inspectFixtureRoots();mount=host.mount(snapshot(),{parent:createFixtureRoot(),scope:'native:screen'});return {...mount.inspect({limit:32}),borrowedRoots};},
  dispose(){
    if(disposedResult)return disposedResult;
    mount.dispose();host.dispose();
    const observation=mount.inspect({limit:32}),lifecycle=this.lifecycle(),borrowedRoots=inspectFixtureRoots();
    for(const root of fixtureRoots)root.destroy();
    disposedResult={observation,lifecycle,borrowedRoots,sceneObjectsAfterRootCleanup:scene.children.list.length};
    return disposedResult;
  },
  shutdown(){
    if(shutdownPromise)return shutdownPromise;
    shutdownPromise=(async()=>{
      const errors=[];
      try{this.dispose();}catch(error){errors.push(error.message);}
      // Host teardown remains responsible for borrowed roots after library failure.
      for(const root of fixtureRoots)if(root.scene)try{root.destroy();}catch(error){errors.push(error.message);}
      const sceneObjects=scene.children.list.length;
      canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);window.removeEventListener('keydown',keyDown);
      const listenerProbeBefore=inputDeliveries;
      canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:1,clientY:1}));canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:1,clientY:1}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
      const listenerProbeAfter=inputDeliveries,game=window.nativeGame,manager=game.scene;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Phaser teardown did not complete within 5000ms')),5000);game.events.once(Phaser.Core.Events.DESTROY,()=>{clearTimeout(timer);setTimeout(resolve,0);});try{game.destroy(true,true);}catch(error){clearTimeout(timer);reject(error);}});
      return {errors,sceneObjects,listenerProbeBefore,listenerProbeAfter,canvasConnected:canvas.isConnected,remainingScenes:manager.scenes.length,pendingDestroy:game.pendingDestroy,loopRunning:game.loop.running};
    })();
    return shutdownPromise;
  },
};
