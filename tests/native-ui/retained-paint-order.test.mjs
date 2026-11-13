import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const renderer of ['webgl','canvas'])test(renderer+' retained stock insertion matches fresh paint without crossing borrowed siblings or extensions',{timeout:120000},async()=>{
 const app=express();app.use(express.static(root));const server=createServer(app);let browser,context;const report={renderer};
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--force_high_performance_gpu']});context=await browser.newContext({viewport:{width:200,height:160},deviceScaleFactor:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/tests/native-ui/proof.html?renderer=${renderer}`);await page.waitForFunction(()=>window.proofUi);
 report.result=await page.evaluate(async()=>{
  const u=await import('/server/build/ui-index.mjs'),game=nativeGame,scene=game.scene.scenes[0];
  const theme=u.defineTheme({version:1,id:'test:order',roles:{absolute:{},extension:{},red:{alternatives:[{kind:'flat',color:'#ff0000'}]},green:{alternatives:[{kind:'flat',color:'#00ff00'}]},blue:{alternatives:[{kind:'flat',color:'#0000ff'}]}},geometry:{gap:0,padding:0,minTarget:0}});
  const c={id:'order:main',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:160,height:120}};
  const hash=async()=>{const image=await new Promise(resolve=>game.renderer.snapshot(resolve));await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,canvas.width,canvas.height).data)),n=>n.toString(16).padStart(2,'0')).join('');};
  const runs=[];for(const extensionMode of ['none','overlay','under-stock']){
   const parent=scene.add.container(),foreign=scene.add.rectangle(4,4,3,3,0xff00ff);parent.add(foreign);let extensionMounts=0,extensionDisposals=0;
   const ports={resolveAsset(){throw Error('Unexpected asset');},attachContext:()=>({ownership:'borrowed',parent}),extensionFacade:()=>({parent})};const ui=u.createPhaserUi({scene,theme,ports,stockOrdering:'isolated'});
   ui.registerExtension('test:paint',{version:1,measure:()=>({min:{width:1,height:1},preferred:{width:8,height:8},overflow:'clip'}),regions:()=>[],mount:(_m,a,owner)=>{extensionMounts++;const o=scene.add.rectangle(a.bounds.x,a.bounds.y,8,8,0xffffff).setOrigin(0);parent.add(o);if(extensionMode==='under-stock')parent.sendToBack(o);owner.onDispose(()=>{extensionDisposals++;o.destroy();});}});
   const panel=(id,role,x=20)=>u.panel({id,appearanceRole:role,layout:{x,y:20,width:20,height:20}});
   const snap=(revision,insert)=>({revision,context:c,tree:u.absolute({id:'root',layout:{width:160,height:120},children:[
    ...(insert?[panel('new-low','red')]:[]),panel('high','green'),
    ...(extensionMode==='none'?[]:[u.extension({id:'extension',extensionId:'test:paint',model:{stable:true},layout:{x:20,y:20,width:8,height:8}})])
   ]})});
   let mount=ui.mount(snap(1,false),{parent,scope:'order:retained'});mount.update(snap(2,true));const retained=await hash(),mountsAfterUpdate=extensionMounts;mount.dispose();const foreignSurvives=foreign.scene===scene&&parent.list.includes(foreign);mount=ui.mount(snap(2,true),{parent,scope:'order:fresh'});const fresh=await hash();mount.dispose();ui.dispose();const remaining=parent.list.length;parent.destroy();runs.push({extensionMode,retained,fresh,pixelEqual:retained===fresh,mountsAfterUpdate,extensionMounts,extensionDisposals,foreignSurvives,remaining});
  }
  // Fresh direct painting is the baseline for borrowed transforms, clipping,
  // alpha and camera exclusion. A blank/hidden result cannot prove parity.
  const parity=[];
  for(const masked of [false,true]){
   const results={};
   for(const stockOrdering of ['direct','isolated']){
    const parent=scene.add.container(7,9).setScale(1.25).setAlpha(.7);
    const graphics=masked?scene.make.graphics({x:0,y:0,add:false}):null;
    const mask=graphics?.fillStyle(0xffffff).fillRect(20,20,29,27).createGeometryMask();if(mask)parent.setMask(mask);
    const ui=u.createPhaserUi({scene,theme,stockOrdering,ports:{resolveAsset(){throw Error('Unexpected asset');},attachContext:()=>({ownership:'borrowed',parent})}});
    const tree=u.absolute({id:'clip',layout:{x:12,y:12,width:34,height:27,overflow:'clip'},children:[u.panel({id:'red',appearanceRole:'red',layout:{x:-4,y:0,width:30,height:25}}),u.panel({id:'green',appearanceRole:'green',layout:{x:12,y:11,width:31,height:21}})]});
    const mount=ui.mount({revision:1,context:c,tree},{parent,scope:'order:transform'}),visible=await hash();
    scene.cameras.main.ignore(parent);const hidden=await hash();
    mount.dispose();ui.dispose();parent.clearMask(false);parent.destroy();mask?.destroy();graphics?.destroy();results[stockOrdering]={visible,hidden};
   }
   parity.push({masked,...results});
  }
  return {runs,parity};
 });assert.deepEqual(errors,[]);for(const r of report.result.runs){assert.equal(r.pixelEqual,true,JSON.stringify(r));assert.equal(r.foreignSurvives,true);assert.equal(r.remaining,1);assert.equal(r.extensionDisposals,r.extensionMounts);assert.equal(r.mountsAfterUpdate,r.extensionMode==='none'?0:1);}for(const p of report.result.parity){assert.deepEqual(p.isolated,p.direct,'nested native transform/mask/camera parity '+p.masked);assert.notEqual(p.direct.visible,p.direct.hidden,'nonblank visible witness '+p.masked);}report.status='passed';
 }catch(e){report.status='failed';report.error=e.stack;throw e;}finally{await context?.close();await browser?.close();await new Promise(r=>server.close(r));await mkdir('.tmp/native-order',{recursive:true});await writeFile('.tmp/native-order/'+renderer+'-'+Date.now()+'.json',JSON.stringify(report,null,2));}
});
