import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import express from 'express';
import sharp from 'sharp';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),fixture=new URL('tests/native-ui/',root),assets=new URL('assets/',fixture);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('manifest.json',assets)));
for(const [name,digest] of Object.entries(manifest.inputs))assert.equal(hash(readFileSync(new URL(name,fixture))),digest,`${name}: recipe changed; run npm run build:ui-fixture`);
for(const [name,receipt] of Object.entries(manifest.files)){const bytes=readFileSync(new URL(name,assets));assert.deepEqual({bytes:bytes.length,sha256:hash(bytes)},receipt,`Checked asset ${name}`);}
const started=performance.now(),report={format:'agent-sprites/ui-native-result@1',cases:[],failures:[]};
const attempts=new URL('.tmp/ui-native/',root);mkdirSync(attempts,{recursive:true});
const output=pathToFileURL(mkdtempSync(join(fileURLToPath(attempts),'attempt-'))+'/');
report.output=fileURLToPath(output);
const app=express();app.use(express.static(fileURLToPath(root)));
const server=createServer(app);let browser;
const pixel=(data,width,x,y)=>[...data.subarray((y*width+x)*4,(y*width+x)*4+3)];
const rgb=color=>color.match(/[a-f\d]{2}/gi).map(part=>parseInt(part,16));
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  report.startupMs=Math.round(performance.now()-started);
  for(const renderer of ['webgl','canvas'])for(const theme of ['night','day']) {
    const caseStart=performance.now(),context=await browser.newContext({viewport:{width:200,height:160},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const specimen={renderer,theme};report.cases.push(specimen);
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/tests/native-ui/?renderer=${renderer}&theme=${theme}`);
      await page.waitForFunction(()=>!!window.nativeUi,{timeout:15000});
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const initial=await page.evaluate(()=>({renderer:window.nativeUi.renderer,webgl2:window.nativeUi.webgl2,observation:window.nativeUi.inspect(),plan:window.nativeUi.plan()}));
      assert.equal(initial.renderer,renderer==='canvas'?1:2,'Requested native backend');if(renderer==='webgl')assert.equal(initial.webgl2,true,'Real WebGL2 context');
      assert.equal(initial.observation.native.attachments,2);assert.equal(initial.observation.native.extensions,1);
      const glyph=initial.plan.records.find(record=>record.id==='glyph').text.draws[0].physicalDestination;
      assert.deepEqual(glyph,{x:26,y:48,width:3,height:5},'Nonzero viewport origin and independent source density');
      const image=await page.locator('canvas').screenshot({path:fileURLToPath(new URL(`${renderer}-${theme}.png`,output))});
      const decoded=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true}),at=(x,y)=>pixel(decoded.data,decoded.info.width,x,y);
      const fill=rgb(theme==='night'?'304860':'d8c898'),edge=rgb(theme==='night'?'7088a0':'886840'),ink=rgb(theme==='night'?'f8e8b0':'202838');
      assert.deepEqual(at(18,12),edge,'Skin border at nonzero origin');assert.deepEqual(at(22,16),fill,'Tiled skin center');assert.deepEqual(at(17,12),[8,12,16],'Outside viewport remains unpainted');
      const pattern=['111','001','011','000','010'];for(let y=0;y<5;y++)for(let x=0;x<3;x++)assert.deepEqual(at(26+x,48+y),pattern[y][x]==='1'?ink:fill,`Exact font pixel ${x},${y}`);
      assert.deepEqual(at(114,20),ink,'Clipped text retains first glyph');assert.deepEqual(at(118,20),fill,'Glyph after right clip is absent');
      assert.deepEqual(at(98,52),[40,200,120],'Extension paints bounded region');assert.deepEqual(at(97,52),fill,'Extension does not paint outside allocation');assert.deepEqual(at(110,52),fill,'Extension obeys inherited clip inside its larger allocation');
      const before=(await page.evaluate(()=>window.nativeUi.intents)).length;
      await page.mouse.click(32,26);await page.keyboard.press('Enter');
      const routed=await page.evaluate(()=>{const a=window.nativeUi.handle({type:'activate',controlId:'ok',inputId:'controller:1'});const duplicate=window.nativeUi.handle({type:'activate',controlId:'ok',inputId:'controller:1'});return {a,duplicate,intents:window.nativeUi.intents};});
      assert.equal(routed.intents.slice(before).filter(i=>i.kind==='activate'&&i.actionId==='native:accept').length,3,'Pointer, keyboard and normalized controller activate once');assert.deepEqual(routed.duplicate,[]);
      const stale=await page.evaluate(()=>{window.nativeUi.handle({type:'press',controlId:'ok',inputId:'held:1'});const update=window.nativeUi.update({context:true});const release=window.nativeUi.handle({type:'release',controlId:'ok',inputId:'held:1'});const queued=window.nativeUi.handle({type:'activate',controlId:'ok',inputId:'stale:1',modelRevision:1});const queuedContext=window.nativeUi.handle({type:'activate',controlId:'ok',inputId:'stale-context:1',contextRevisions:{'native:detail':1}});return {update,release,queued,queuedContext};});
      assert.equal(stale.update.heldCount,0);assert.deepEqual(stale.release,[]);assert.deepEqual(stale.queued,[]);assert.deepEqual(stale.queuedContext,[]);
      await page.keyboard.press('Escape');assert.ok((await page.evaluate(()=>window.nativeUi.intents)).some(i=>i.actionId==='native:cancel'),'Normalized cancel route');
      const scrolled=await page.evaluate(()=>window.nativeUi.update({scroll:8}));assert.equal(scrolled.controls.find(c=>c.id==='scrolled-glyph').state,'visible');
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const scrollImage=await sharp(await page.locator('canvas').screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(pixel(scrollImage.data,scrollImage.info.width,26,68),ink,'Scroll reveals native glyph');
      const extension=await page.evaluate(()=>({outside:(window.nativeUi.handle({type:'press',point:{x:94,y:50},pointSpace:'physical',inputId:'outside:ext'}),window.nativeUi.handle({type:'release',point:{x:94,y:50},pointSpace:'physical',inputId:'outside:ext'})),inside:window.nativeUi.handle({type:'press',point:{x:100,y:54},pointSpace:'physical',inputId:'inside:ext'}),release:window.nativeUi.handle({type:'release',point:{x:100,y:54},pointSpace:'physical',inputId:'inside:ext'})}));
      assert.deepEqual(extension.outside,[]);assert.equal(extension.release[0]?.actionId,'native:custom');
      const resized=await page.evaluate(()=>{window.nativeGame.scale.resize(176,128);window.nativeUi.update({context:true,origin:4});return {width:window.nativeGame.canvas.width,height:window.nativeGame.canvas.height,glyph:window.nativeUi.plan().records.find(r=>r.id==='glyph').text.draws[0].physicalDestination};});
      assert.equal(resized.width,176);assert.equal(resized.height,128);assert.deepEqual(resized.glyph,{x:30,y:52,width:3,height:5},'Resized host realizes revised context mapping');
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const resizedImage=await sharp(await page.locator('canvas').screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(pixel(resizedImage.data,resizedImage.info.width,30,52),ink,'Revised context paints at the new physical origin');
      const remounted=await page.evaluate(()=>window.nativeUi.remount());assert.equal(remounted.native.lifecycle,'mounted');
      const failed=await page.evaluate(()=>{let error;try{window.nativeUi.update({fail:true});}catch(e){error=e.message;}return {error,observation:window.nativeUi.inspect(),lifecycle:window.nativeUi.lifecycle()};});
      assert.match(failed.error,/Deliberate extension failure/);assert.equal(failed.observation.native.lifecycle,'retired');assert.equal(failed.observation.native.objects,0);assert.equal(failed.observation.native.extensions,0);
      const cleaned=await page.evaluate(()=>window.nativeUi.dispose());assert.equal(cleaned.observation.native.objects,0);assert.equal(cleaned.observation.native.fragments,0);assert.equal(cleaned.observation.native.created,cleaned.observation.native.destroyed);assert.equal(cleaned.lifecycle.attachmentsCreated,cleaned.lifecycle.attachmentsDisposed);assert.equal(cleaned.lifecycle.borrowedFonts,true);assert.equal(cleaned.lifecycle.borrowedSkins,true);assert.deepEqual(cleaned.lifecycle.fontFrames,['__BASE']);assert.deepEqual(cleaned.lifecycle.skinFrames,['__BASE']);assert.ok(cleaned.lifecycle.extensionDisposed>=3);
      assert.deepEqual(errors,[]);specimen.passed=true;
    } catch(error) {specimen.passed=false;specimen.error=error.stack;report.failures.push(`${renderer}/${theme}: ${error.message}`);try{await page.screenshot({path:fileURLToPath(new URL(`${renderer}-${theme}-failure.png`,output))});}catch(captureError){specimen.captureError=captureError.message;}}
    finally {const cleanup=performance.now();await context.close();specimen.cleanupMs=Math.round(performance.now()-cleanup);specimen.totalMs=Math.round(performance.now()-caseStart);}
  }
} finally {
  const cleanup=performance.now();const results=await Promise.allSettled([browser?.close(),new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))]);
  report.cleanupMs=Math.round(performance.now()-cleanup);report.totalMs=Math.round(performance.now()-started);
  for(const result of results)if(result.status==='rejected')report.failures.push(`cleanup: ${result.reason}`);
  writeFileSync(new URL('result.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(report.failures.length)process.exitCode=1;
}
