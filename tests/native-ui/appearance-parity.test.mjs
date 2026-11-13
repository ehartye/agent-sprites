import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import express from 'express';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Reference changes only the new internal reader, using the old complete public
// observation. No renderer, input, layout, asset, or validation code is replaced.
const source=await readFile(new URL('../../server/build/ui-interaction.mjs',import.meta.url),'utf8');
const needle=/export function readUiAppearance\(interaction\) \{\r?\n  const read = appearanceReaders\.get\(interaction\);\r?\n  if \(!read\) throw new TypeError\('Expected a genuine UI interaction instance'\);\r?\n  return read\(\);\r?\n\}/g;
assert.equal([...source.matchAll(needle)].length,1,'Exact private reader reference substitution');
const reference=source.replace(needle,`export function readUiAppearance(interaction) {
 const controls=[];let page,afterId;do{page=interaction.inspect({limit:256,...(afterId?{afterId}:{})});controls.push(...page.controls);afterId=page.nextAfterId;}while(afterId);
 return {scopeId:page.scopeId,modelRevision:page.modelRevision,disposed:page.disposed,controls};
}`);
for(const renderer of ['webgl','canvas'])test(renderer+' compact appearance matches rich public feedback pixels input resource and callback authority',{timeout:120000},async()=>{
 const app=express();app.use(express.static(root));const server=createServer(app);let browser,context;const report={renderer,sourceHash:createHash('sha256').update(source).digest('hex'),referenceHash:createHash('sha256').update(reference).digest('hex'),runs:[]};let error;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--force_high_performance_gpu']});
  for(const mode of ['compact','reference']){
   context=await browser.newContext({viewport:{width:200,height:160},deviceScaleFactor:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(mode==='reference')await page.route('**/server/build/ui-interaction.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:reference}));
   await page.goto(`http://127.0.0.1:${server.address().port}/tests/native-ui/proof.html?renderer=${renderer}`);await page.waitForFunction(()=>window.proofUi);
   const result=await page.evaluate(async()=>{
    const u=await import('/server/build/ui-index.mjs'),scene=nativeGame.scene.scenes[0],game=nativeGame,calls={asset:[],attach:0,measure:0,regions:0,mount:0,dispose:0};
    const json=async p=>(await fetch('/tests/native-ui/assets/'+p)).json(),font=u.normalizeBitmapFont({report:await json('font.report.json'),atlas:await json('font.atlas.json')});
    const theme=u.defineTheme({version:1,id:'test:appearance-parity',fonts:{body:{font}},roles:{
     absolute:{},extension:{},panel:{alternatives:[{kind:'flat',color:'#112233'}]},
     button:{font:'body',tone:'cream',padding:0,alternatives:[{kind:'flat',color:'#123456'}],edge:{width:1,focusWhenDisabled:true},colors:{focus:'#00ffff',hover:'#ffff00',pressed:'#ff0000',selected:'#00ff00'},placement:{nativeStates:{hover:{glyphTint:'#ffff00'},focus:{glyphTint:'#00ffff'},pressed:{glyphTint:'#ff00ff',paintOffset:{x:0,y:1}},disabled:{glyphTint:'#777777'}}}},
     linked:{font:'body',tone:'cream',placement:{nativeStates:{hover:{glyphTint:'#ffff00'},focus:{glyphTint:'#00ffff'},pressed:{paintOffset:{x:0,y:1}},disabled:{visible:false}}}},
    },geometry:{gap:0,padding:0,minTarget:0}});
    const parent=scene.add.container(),ports={resolveAsset:r=>{calls.asset.push(r.kind+':'+r.id+':'+(r.tone??''));return{ownership:'borrowed',texture:scene.textures.get('native-font')};},attachContext:()=>{calls.attach++;return{ownership:'borrowed',parent};}};
    const ui=u.createPhaserUi({scene,theme,ports});ui.registerExtension('test:bounded',{version:1,measure:()=>{calls.measure++;return{min:{width:1,height:1},preferred:{width:1,height:1},overflow:'clip'};},regions:()=>{calls.regions++;return[];},mount:(_m,_a,owner)=>{calls.mount++;owner.onDispose(()=>calls.dispose++);}});
    const c={id:'test:main',revision:1,localToPhysical:{scale:1,x:0,y:0},sourcePixelPhysicalSize:1,viewport:{x:0,y:0,width:160,height:120}};
    const snapshot=(revision,changed=false)=>({revision,context:c,tree:u.absolute({id:'root',focus:{initialId:'a',order:['a','b']},layout:{width:160,height:120},children:[
     u.button({id:'a',label:'?',actionId:'action:a',enabled:!changed,selected:true,layout:{x:4,y:4,width:24,height:16}}),
     u.button({id:'b',label:'?',actionId:'action:b',enabled:changed,focusable:true,layout:{x:34,y:4,width:24,height:16}}),
     u.text({id:'linked',label:'?',appearanceRole:'linked',metadata:{'ui:stateOwner':'a'},layout:{x:4,y:24,width:12,height:8}}),
     u.extension({id:'ext',extensionId:'test:bounded',model:{changed},layout:{x:70,y:4,width:1,height:1}}),
     ...Array.from({length:260},(_,i)=>u.panel({id:'offscreen:'+i,layout:{x:200+i,y:0,width:1,height:1}})),
    ]})});
    const mount=ui.mount(snapshot(1),{parent,scope:'test:appearance'}),rows=[];
    const capture=async(label,intents=[])=>{const image=await new Promise(done=>game.renderer.snapshot(done));await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data,pixelHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const controls=[];let afterId,last;do{last=mount.inspect({limit:256,...(afterId?{afterId}:{})});controls.push(...last.controls);afterId=last.nextAfterId;}while(afterId);rows.push({label,intents,pixelHash,controls,focus:last.focusId,hover:last.hoverId,held:last.heldCount,native:last.native,sceneChildren:scene.children.length,calls:JSON.parse(JSON.stringify(calls))});};
    try{
     await capture('initial');for(const[label,event]of [
      ['hover-a',{type:'hover',point:{x:6,y:6},pointSpace:'physical'}],
      ['press-a',{type:'press',inputId:'a-press',controlId:'a'}],
      ['release-a',{type:'release',inputId:'a-press',controlId:'a'}],
      ['focus-disabled-b',{type:'focus',controlId:'b'}],
      ['press-disabled-b',{type:'press',inputId:'disabled',controlId:'b'}],
      ['blur',{type:'blur'}],
     ])await capture(label,mount.handle(event));
     mount.update(snapshot(2,true));await capture('updated');await capture('press-enabled-b',mount.handle({type:'press',inputId:'b-press',controlId:'b'}));await capture('cancel-held',mount.handle({type:'blur'}));await capture('release-cancelled',mount.handle({type:'release',inputId:'b-press',controlId:'b'}));
     let rejection;try{mount.update(snapshot(1));}catch(e){rejection=e.name;}if(!rejection)throw Error('Stale revision not rejected');await capture('rejected-stale');
     ui.dispose();parent.destroy();const retired=mount.inspect({limit:1}).native;return{rows,calls,retired,sceneChildren:scene.children.length,rejection,backend:{type:game.renderer.type,webgl2:!!game.renderer.gl&&game.renderer.gl instanceof WebGL2RenderingContext}};
    }finally{ui.dispose();if(parent.scene)parent.destroy();}
   });
   assert.equal(result.backend.type,renderer==='canvas'?1:2);if(renderer==='webgl')assert.equal(result.backend.webgl2,true);assert.ok(result.rows[0].controls.length>256);assert.equal(result.rows.find(r=>r.label==='release-a').intents[0]?.actionId,'action:a');assert.equal(result.rows.find(r=>r.label==='press-disabled-b').held,0);assert.equal(result.rows.find(r=>r.label==='press-enabled-b').held,1);assert.deepEqual(result.rows.find(r=>r.label==='release-cancelled').intents,[]);assert.equal(result.retired.objects,0);assert.equal(result.retired.fragments,0);assert.equal(result.sceneChildren,0);assert.deepEqual(errors,[]);report.runs.push({mode,result});
   const shutdown=await page.evaluate(()=>proofUi.shutdown());assert.deepEqual(shutdown.errors,[]);assert.equal(shutdown.loopRunning,false);assert.equal(shutdown.remainingScenes,0);await context.close();context=null;
  }
  assert.deepEqual(report.runs[0].result,report.runs[1].result,'Compact renderer is byte/state/callback equivalent to old rich feedback');report.status='passed';console.log(renderer+' appearance parity: '+report.runs[0].result.rows.length+' exact states');
 }catch(e){error=e;report.status='failed';report.error=e.stack;throw e;}finally{
  const failures=[];for(const close of [()=>context?.close(),()=>browser?.close(),()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))])try{await close();}catch(e){failures.push(e);}
  await mkdir(new URL('../../reports/appearance-parity/',import.meta.url),{recursive:true});await writeFile(new URL('../../reports/appearance-parity/'+renderer+'-'+Date.now()+'.json',import.meta.url),JSON.stringify(report,null,2),{flag:'wx'});
  if(failures.length){const cleanup=new AggregateError(failures,'Appearance parity teardown failed');if(error)error.cause=cleanup;else throw cleanup;}
 }
});
