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
// Proof cases run on tests/native-ui/proof.html: one fixture page per renderer, one report entry per named case.
// Pixels are decoded here from canvas screenshots (sharp). The compressed cases supply the optional
// `readSourceRGBA` port in the page, which reads the loaded skin texture through a 2D canvas; faults are
// injected into that port's bytes only, never into server/ code.
const recipe=JSON.parse(readFileSync(new URL('recipe.json',fixture)));
const BACKGROUND=[8,12,16],PANEL={x:12,y:8,width:70,height:54},sameBytes=(a,b)=>Buffer.compare(a.data,b.data)===0;
function differing(a,b){let count=0;for(let i=0;i<a.data.length;i+=4)if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2]||a.data[i+3]!==b.data[i+3])count++;return count;}
// Analytic art for the 35x27 panel at 2 physical pixels per source pixel, origin (12,8): side edges are the edge
// color; the center and the top and bottom edge strips repeat columns a,b every 4 physical pixels (tail at x 78..79).
function expectedPanel(art,width,height){
  const tiles=recipe.tiles[art],colors=Object.fromEntries(['edge','a','b'].map(key=>[key,rgb(tiles[key])])),data=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=PANEL.x&&x<PANEL.x+PANEL.width&&y>=PANEL.y&&y<PANEL.y+PANEL.height;
    const color=!inside?BACKGROUND:x<PANEL.x+2||x>=PANEL.x+PANEL.width-2?colors.edge:(x-PANEL.x-2)%4<2?colors.a:colors.b;
    data.set([...color,255],(y*width+x)*4);
  }
  return {data,info:{width,height}};
}
async function proofCases(renderer) {
  const context=await browser.newContext({viewport:{width:200,height:160},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const shoot=async name=>{await frames();return sharp(await page.locator('canvas').screenshot({path:fileURLToPath(new URL(`${renderer}-${name}.png`,output))})).ensureAlpha().raw().toBuffer({resolveWithObject:true});};
  const panel=async(art,mode,expectMounted=true)=>{const result=await page.evaluate(options=>window.proofUi.showPanel(options),{art,mode});if(expectMounted)assert.equal(result.mounted,true,`${art}/${mode}: ${result.error}`);return {...result,pixels:await shoot(`${art}-${mode}`)};};
  const label=async(options,name)=>{const result=await page.evaluate(o=>window.proofUi.showText(o),options);assert.equal(result.mounted,true,`${name}: ${result.error}`);return {...result,pixels:await shoot(name)};};
  const exact={},exactFor=async art=>{if(!exact[art]){exact[art]=await panel(art,'exact');assert.equal(exact[art].reads,0,'Exact tiling never calls the source-pixel port');assert.ok(sameBytes(exact[art].pixels,expectedPanel(art,160,120)),`Exact tiling renders the authored ${art} art`);}return exact[art];};
  const compressedCase=art=>async specimen=>{
    const reference=await exactFor(art),compressed=await panel(art,'compressed');
    assert.ok(compressed.reads>=1,'The case supplies readSourceRGBA and the runtime reads the skin source');
    assert.ok(sameBytes(compressed.pixels,reference.pixels),`Compressed ${art} tiling equals exact tiling pixel for pixel`);
    assert.ok(sameBytes(compressed.pixels,expectedPanel(art,160,120)),`Compressed ${art} tiling equals the authored art`);
    assert.ok(compressed.images<reference.images,`Compressed ${art} tiling mounts fewer Images (${compressed.images}) than exact tiling (${reference.images})`);
    if(art==='uniform')assert.ok(compressed.images<=9,'Constant faces on both axes need at most the nine-slice Images');
    else assert.ok(compressed.images>9,'Detailed art keeps its varying axis exact');
    Object.assign(specimen,{readSourceRGBA:compressed.reads,exactImages:reference.images,compressedImages:compressed.images,differingPixels:differing(compressed.pixels,reference.pixels)});
  };
  // A control passes only when its fault is detected: the runtime rejects the input, or the pixels no longer match.
  const controlCase=(mode,art)=>async specimen=>{
    const reference=await exactFor(art),faulty=await panel(art,mode,false);
    if(!faulty.mounted){
      assert.match(faulty.error,/source RGBA/i,'The runtime rejects the faulty plane for the stated reason');assert.equal(faulty.imagesAfterRejection,0,'Rejection leaves no Images');assert.equal(faulty.sceneObjectsAfterRejection,0,'Rejection leaves no scene objects');
      for(let i=0;i<faulty.pixels.data.length;i+=4)if(faulty.pixels.data[i]!==BACKGROUND[0]||faulty.pixels.data[i+1]!==BACKGROUND[1]||faulty.pixels.data[i+2]!==BACKGROUND[2])assert.fail('Nothing from the rejected mount is painted');
      Object.assign(specimen,{detectedBy:'rejected',error:faulty.error});return;
    }
    const mismatch=differing(faulty.pixels,reference.pixels);
    assert.ok(mismatch>0,`Negative control ${mode} was NOT detected: pixels equal exact tiling`);
    assert.ok(!sameBytes(faulty.pixels,expectedPanel(art,160,120)),`Negative control ${mode} differs from the authored art`);
    Object.assign(specimen,{detectedBy:'pixel-mismatch',differingPixels:mismatch,exactImages:reference.images,faultyImages:faulty.images});
  };
  const textPixels=(shot,text,message)=>{
    const at=(x,y)=>pixel(shot.data,shot.info.width,x,y),ink=rgb(recipe.tones.cream);
    for(const draw of text.draws){
      const d=draw.physicalDestination,rows=recipe.glyphs[draw.char].rows;
      assert.ok(Object.values(d).every(Number.isInteger),`${message}: ${draw.char} snaps to whole physical pixels`);assert.deepEqual([d.width,d.height],[3,5]);
      for(let y=0;y<5;y++)for(let x=0;x<3;x++)assert.deepEqual(at(d.x+x,d.y+y),rows[y][x]==='1'?ink:BACKGROUND,`${message}: glyph ${draw.char} pixel ${x},${y}`);
    }
  };
  const cases={
    'compressed-uniform':compressedCase('uniform'),
    'compressed-detailed':compressedCase('detailed'),
    'wrong-period-control':controlCase('wrong-period','detailed'),
    'wrong-density-control':controlCase('wrong-density','detailed'),
    async 'prelaid-double-space'(specimen) {
      const result=await label({label:'A  B',zoom:1,wrap:false,width:12,height:8},'prelaid-double-space'),text=result.text,[a,b]=text.draws;
      assert.deepEqual(text.lines.map(line=>line.source),['A  B'],'Both spaces stay in the single line');assert.equal(text.draws.length,2);
      assert.equal(b.physicalDestination.x-a.physicalDestination.x,8,'B sits after A plus the advance of two spaces (4+2+2), not one');
      textPixels(result.pixels,text,'A  B');
      // A collapsed single space would put B's solid left column at A.x+6; the double space leaves A.x+3 .. A.x+7 empty.
      for(let x=a.physicalDestination.x+3;x<b.physicalDestination.x;x++)for(let y=a.physicalDestination.y;y<a.physicalDestination.y+5;y++)assert.deepEqual(pixel(result.pixels.data,160,x,y),BACKGROUND,`Gap pixel ${x},${y} stays empty`);
      Object.assign(specimen,{lines:text.lines.length,glyphGap:b.physicalDestination.x-a.physicalDestination.x});
    },
    async 'prelaid-card-7b-zoom'(specimen) {
      const options={label:'Card 7B',zoom:1.5,width:14,height:14};
      const wrapped=await label({...options,wrap:true},'prelaid-card-7b-wrapped'),result=await label({...options,wrap:false},'prelaid-card-7b-zoom'),text=result.text;
      assert.deepEqual(wrapped.text.lines.map(line=>line.source),['Card','7B'],'Control: the same box wraps when wrapping is allowed');
      assert.deepEqual(text.lines.map(line=>line.source),['Card 7B'],'wrap:false keeps Card 7B on one line at zoom 1.5');
      assert.equal(text.overflow.horizontal,true,'Horizontal overflow is reported');assert.equal(text.overflow.vertical,false);
      assert.equal(text.draws.length,6);assert.equal(new Set(text.draws.map(d=>d.physicalDestination.y)).size,1,'One row of glyphs');
      const last=text.draws.at(-1).physicalDestination,box=text.physicalBounds;
      assert.ok(last.x+last.width>box.x+box.width,'Painted ink extends past the layout box');
      textPixels(result.pixels,text,'Card 7B');
      Object.assign(specimen,{lines:text.lines.length,overflowHorizontal:text.overflow.horizontal,wrappedControlLines:wrapped.text.lines.length});
    },
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/native-ui/proof.html?renderer=${renderer}`);
    await page.waitForFunction(()=>!!window.proofUi,undefined,{timeout:15000});
    const initial=await page.evaluate(()=>({renderer:window.proofUi.renderer,webgl2:window.proofUi.webgl2}));
    assert.equal(initial.renderer,renderer==='canvas'?1:2,'Requested native backend');if(renderer==='webgl')assert.equal(initial.webgl2,true,'Real WebGL2 context');
    for(const [name,run] of Object.entries(cases)){
      const caseStart=performance.now(),specimen={name,renderer};report.cases.push(specimen);
      try{await run(specimen);assert.deepEqual(errors,[]);specimen.passed=true;}
      catch(error){specimen.passed=false;specimen.error=error.stack;report.failures.push(`${renderer}/${name}: ${error.message}`);try{await page.screenshot({path:fileURLToPath(new URL(`${renderer}-${name}-failure.png`,output))});}catch(captureError){specimen.captureError=captureError.message;}}
      finally{specimen.totalMs=Math.round(performance.now()-caseStart);}
    }
  } catch(error) {report.cases.push({name:'proof-page',renderer,passed:false,error:error.stack});report.failures.push(`${renderer}/proof-page: ${error.message}`);}
  finally {
    try{
      const teardown=await page.evaluate(()=>window.proofUi?window.proofUi.shutdown():{notStarted:true});
      if(!teardown.notStarted){assert.deepEqual(teardown.errors,[]);assert.equal(teardown.canvasConnected,false,'Game destroy removes the real canvas');assert.equal(teardown.remainingScenes,0);assert.equal(teardown.pendingDestroy,false);assert.equal(teardown.loopRunning,false);}
    }catch(error){report.failures.push(`${renderer}/proof teardown: ${error.message}`);}
    try{await context.close();}catch(error){report.failures.push(`${renderer}/proof context close: ${error.message}`);}
  }
}
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
      await page.waitForFunction(()=>!!window.nativeUi,undefined,{timeout:15000});
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
      const remounted=await page.evaluate(()=>window.nativeUi.remount());assert.equal(remounted.native.lifecycle,'mounted');assert.ok(remounted.borrowedRoots.every(root=>root.children===0&&root.borrowedAlive),'Library unmount empties and preserves borrowed fixture roots');
      const failed=await page.evaluate(()=>{let error;try{window.nativeUi.update({fail:true});}catch(e){error=e.message;}return {error,observation:window.nativeUi.inspect(),lifecycle:window.nativeUi.lifecycle()};});
      assert.match(failed.error,/Deliberate extension failure/);assert.equal(failed.observation.native.lifecycle,'retired');assert.equal(failed.observation.native.objects,0);assert.equal(failed.observation.native.extensions,0);
      const passiveSteps=[];
      for(let step=0;step<7;step++){
        const referenceProbe=await page.evaluate(step=>window.nativeUi.retainedProbe('reference',step),step);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const referencePixels=await page.locator('canvas').screenshot();
        const retainedProbe=await page.evaluate(step=>window.nativeUi.retainedProbe('retained',step),step);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const retainedPixels=await page.locator('canvas').screenshot();
        const refInk=await sharp(referencePixels).raw().toBuffer({resolveWithObject:true}),retainedInk=await sharp(retainedPixels).raw().toBuffer({resolveWithObject:true});
        assert.deepEqual(retainedInk.info,refInk.info);assert.deepEqual(retainedInk.data,refInk.data,'Retained outline/clip/movement pixels equal freshly prepared stock reference at step '+step);
        assert.equal(retainedProbe.heldCount,0);assert.equal(retainedProbe.focusId,null);
        if(step===6)assert.ok(retainedProbe.native.preparations<7,'Whole-pixel movements reuse preparation');
        passiveSteps.push({step,referenceObjects:referenceProbe.native.objects,retainedObjects:retainedProbe.native.objects,preparations:retainedProbe.native.preparations,pixelBytes:refInk.data.length,exactPixels:true});
      }
      specimen.retainedPassive={steps:passiveSteps,exactPixels:true};
      await page.evaluate(()=>window.nativeUi.stopRetainedProbe());
      const iconSteps=[];
      for(let step=0;step<9;step++){
        const reference=await page.evaluate(step=>window.nativeUi.iconPlacementProbe('reference',step),step);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const referencePixels=await page.locator('canvas').screenshot();
        const placed=await page.evaluate(step=>window.nativeUi.iconPlacementProbe('placed',step),step);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const placedPixels=await page.locator('canvas').screenshot();
        const refInk=await sharp(referencePixels).raw().toBuffer({resolveWithObject:true}),placedInk=await sharp(placedPixels).raw().toBuffer({resolveWithObject:true});
        assert.deepEqual(placedInk.info,refInk.info);assert.deepEqual(placedInk.data,refInk.data,'Placed stock-icon pixels equal independent full-layout reference at step '+step);
        assert.deepEqual(placed.controls,reference.controls);assert.equal(placed.heldCount,step<7?1:0,'Unchanged hold survives placement; context replacement cancels it');
        if(step===8){assert.equal(placed.placements,6);assert.equal(placed.fullUpdates,2);}
        iconSteps.push({step,pixelBytes:refInk.data.length,placements:placed.placements,fullUpdates:placed.fullUpdates,heldCount:placed.heldCount,exactPixels:true});
      }
      specimen.iconPlacements={steps:iconSteps,exactPixels:true};
      await page.evaluate(()=>window.nativeUi.stopIconPlacementProbe());
      const cleaned=await page.evaluate(()=>window.nativeUi.dispose());assert.equal(cleaned.observation.native.objects,0);assert.equal(cleaned.observation.native.fragments,0);assert.equal(cleaned.observation.native.created,cleaned.observation.native.destroyed);assert.equal(cleaned.lifecycle.attachmentsCreated,cleaned.lifecycle.attachmentsDisposed);assert.equal(cleaned.lifecycle.borrowedFonts,true);assert.equal(cleaned.lifecycle.borrowedSkins,true);assert.deepEqual(cleaned.lifecycle.fontFrames,['__BASE']);assert.deepEqual(cleaned.lifecycle.skinFrames,['__BASE']);assert.ok(cleaned.lifecycle.extensionDisposed>=3);
      assert.ok(cleaned.borrowedRoots.every(root=>root.children===0&&root.borrowedAlive),'Library disposal preserves empty borrowed roots');assert.equal(cleaned.lifecycle.sceneObjects,cleaned.borrowedRoots.length,'Only fixture roots remain after library cleanup');assert.equal(cleaned.sceneObjectsAfterRootCleanup,0,'Host root cleanup empties the actual scene display list');
      assert.deepEqual(errors,[]);specimen.passed=true;
    } catch(error) {specimen.passed=false;specimen.error=error.stack;report.failures.push(`${renderer}/${theme}: ${error.message}`);try{await page.screenshot({path:fileURLToPath(new URL(`${renderer}-${theme}-failure.png`,output))});}catch(captureError){specimen.captureError=captureError.message;}}
    finally {
      const cleanup=performance.now();
      try {
        const teardown=await page.evaluate(async()=>{
          if(window.nativeUi)return window.nativeUi.shutdown();
          if(!window.nativeGame)return {notStarted:true};
          const game=window.nativeGame,canvas=game.canvas,manager=game.scene;
          await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Phaser teardown did not complete within 5000ms')),5000);game.events.once(Phaser.Core.Events.DESTROY,()=>{clearTimeout(timer);setTimeout(resolve,0);});try{game.destroy(true,true);}catch(error){clearTimeout(timer);reject(error);}});
          return {startupFailed:true,canvasConnected:canvas.isConnected,remainingScenes:manager.scenes.length,pendingDestroy:game.pendingDestroy,loopRunning:game.loop.running};
        });
        specimen.teardown=teardown;
        if(!teardown.notStarted){assert.equal(teardown.canvasConnected,false,'Game destroy removes the real canvas');assert.equal(teardown.remainingScenes,0,'Game destroy removes all actual scenes');assert.equal(teardown.pendingDestroy,false);assert.equal(teardown.loopRunning,false);}
        if(!teardown.startupFailed&&!teardown.notStarted){assert.deepEqual(teardown.errors,[]);assert.equal(teardown.sceneObjects,0);assert.equal(teardown.listenerProbeAfter,teardown.listenerProbeBefore,'Removed fixture listeners receive no further events');}
      }catch(error){specimen.passed=false;report.failures.push(`${renderer}/${theme} teardown: ${error.message}`);}
      finally {try{await context.close();}catch(error){specimen.passed=false;report.failures.push(`${renderer}/${theme} context close: ${error.message}`);}specimen.cleanupMs=Math.round(performance.now()-cleanup);specimen.totalMs=Math.round(performance.now()-caseStart);}
    }
  }
  for(const renderer of ['webgl','canvas'])await proofCases(renderer);
} finally {
  const cleanup=performance.now();const results=await Promise.allSettled([browser?.close(),new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))]);
  report.cleanupMs=Math.round(performance.now()-cleanup);report.totalMs=Math.round(performance.now()-started);
  for(const result of results)if(result.status==='rejected')report.failures.push(`cleanup: ${result.reason}`);
  writeFileSync(new URL('result.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(report.failures.length)process.exitCode=1;
}

// Retained insertion and isolated ownership parity run after this browser closes.
if(!process.exitCode){
  const {spawnSync}=await import('node:child_process');
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/native-ui/retained-paint-order.test.mjs'],{cwd:fileURLToPath(root),stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exitCode=result.status??1;
}
