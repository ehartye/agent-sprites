import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import express from 'express';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const renderer of ['webgl','canvas'])test(renderer+' passive text planes preserve ordered pixels and release native resources',{timeout:120000},async()=>{
 const app=express();app.use(express.static(root));const server=createServer(app);let browser;const report={renderer};
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--force_high_performance_gpu']});const page=await browser.newPage({viewport:{width:200,height:160}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/tests/native-ui/proof.html?renderer=${renderer}`);await page.waitForFunction(()=>window.proofUi);
 report.result=await page.evaluate(async()=>{
  const u=await import('/server/build/ui-index.mjs'),game=nativeGame,scene=game.scene.scenes[0],gl=game.renderer.gl;
  const gpu=gl?gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL):'Canvas';
  if(gl&&/SwiftShader|software|llvmpipe/i.test(gpu))throw Error('Hardware renderer required');
  const [report,atlas]=await Promise.all(['font.report.json','font.atlas.json'].map(p=>fetch('/tests/native-ui/assets/'+p).then(r=>r.json()))),font=u.normalizeBitmapFont({report,atlas}),tones=Object.keys(report.tones);
  scene.textures.get('native-font').setFilter(1);const source=scene.textures.get('native-font').source[0],canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source.image,0,0);const data=new Uint8Array(ctx.getImageData(0,0,canvas.width,canvas.height).data);
  const theme=u.defineTheme({version:1,id:'test:text-plane',fonts:{body:{font}},roles:{absolute:{},ink:{font:'body',tone:tones[0]},face:{font:'body',tone:tones.at(-1)}},geometry:{gap:0,padding:0,minTarget:0}});
  const hash=async()=>{const image=await new Promise(resolve=>game.renderer.snapshot(resolve));await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',g.getImageData(0,0,c.width,c.height).data)),v=>v.toString(16).padStart(2,'0')).join('');};
  const blank=await hash(),runs=[];
  for(const fractional of [false,true])for(const enabled of [false,true]){
   const before=scene.textures.getTextureKeys().length,parent=scene.add.container(),ancestor=scene.add.container(),listenersBefore=scene.events.listenerCount('prerender'),context={id:'plane:main',revision:1,localToPhysical:{scale:2,x:0,y:0},sourcePixelPhysicalSize:2,viewport:{x:0,y:0,width:80,height:60}};
   ancestor.add(parent);parent.setScale(2);const ports={resolveAsset:()=>({ownership:'borrowed',texture:scene.textures.get('native-font')}),readSourceRGBA:()=>({source,width:source.width,height:source.height,data}),attachContext:()=>({ownership:'borrowed',parent})};
   const ui=u.createPhaserUi({scene,theme,ports,stockOrdering:'isolated',passiveTextPlanes:enabled}),hashes=[],counts=[],textures=[];
   const tree=label=>u.absolute({id:'label',layout:{width:45,height:16,overflow:'clip'},children:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],[0,0]].map(([x,y],i)=>u.text({id:'pass'+i,label,appearanceRole:i===8?'face':'ink',layout:{x,y,width:50,wrap:false}}))});
   let mount;for(const [i,options]of [{x:10,y:10,text:'ABBA'},{x:-3,y:10,text:'ABBA'},{x:65,y:50,text:'BAAB'},{x:12,y:12,text:'AA'},{x:12,y:12,text:''}].entries()){
    const snapshot={revision:i+1,context,items:[{id:'label',tree:tree(options.text),x:options.x+(fractional?.25:0),y:options.y}]};
    if(mount)mount.update(snapshot);else mount=ui.mountPassive(snapshot,{parent,scope:'plane:proof'});
    hashes.push(await hash());if(i===0){parent.setAlpha(.5);hashes.push(await hash());parent.setAlpha(1);ancestor.setAlpha(.5);hashes.push(await hash());ancestor.setAlpha(1);ancestor.x=.25;hashes.push(await hash());ancestor.x=0;hashes.push(await hash());scene.textures.get('native-font').setFilter(0);hashes.push(await hash());scene.textures.get('native-font').setFilter(1);hashes.push(await hash());scene.cameras.main.startFollow({x:90.25,y:45.5},false,1,1);hashes.push(await hash());scene.cameras.main.stopFollow();scene.cameras.main.setScroll(0,0);hashes.push(await hash());}
    counts.push(mount.inspect({limit:64}).native.objects);textures.push(scene.textures.getTextureKeys().length-before);
   }
   ui.dispose();parent.destroy();ancestor.destroy();if(scene.events.listenerCount('prerender')!==listenersBefore)throw Error('Render observer leak');runs.push({fractional,enabled,hashes,counts,textures,remainingTextures:scene.textures.getTextureKeys().length-before});
  }
  return {gpu,blank,runs};
 });assert.deepEqual(errors,[]);for(const fractional of [false,true]){const a=report.result.runs.find(r=>r.fractional===fractional&&!r.enabled),b=report.result.runs.find(r=>r.fractional===fractional&&r.enabled);assert.deepEqual(b.hashes,a.hashes,'full framebuffer equality');assert.notEqual(a.hashes[0],report.result.blank,'nonblank original witness');assert.equal(a.remainingTextures,0);assert.equal(b.remainingTextures,0);if(!fractional&&renderer==='webgl'){assert.ok(b.counts[0]<a.counts[0],'native glyph population reduced');assert.ok(b.textures[0]>0,'owned text plane was actually exercised');}else assert.deepEqual(b.counts,a.counts,'fractional placement falls back');}report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;throw e;}finally{await browser?.close();await new Promise(r=>server.close(r));await mkdir('.tmp/text-plane',{recursive:true});await writeFile('.tmp/text-plane/'+renderer+'-'+Date.now()+'.json',JSON.stringify(report,null,2));}
});
