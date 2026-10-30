import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {chromium} from 'playwright';
// Values below were observed from Phaser 4.2.1 `load.aseprite` + `anims.createFromAseprite`, not derived from the Aseprite spec.
// Observed: Phaser ignores the tag `loop` flag (every animation has repeat 0), plays `pingpong_reverse` forward without yoyo,
// reverses `reverse`, sets yoyo only for `pingpong`, and named alias frames after the tag do not disturb tag lookup.
const PHASER_VERSION='4.2.1';
const PINNED={
  directions:{
    'forward-run':{frames:[4,5,6,7],durations:[80,120,160,240],repeat:0,yoyo:false},
    'pingpong-loop':{frames:[8,9,10,11],durations:[80,120,160,240],repeat:0,yoyo:true},
    'pingpong-reverse-once':{frames:[12,13,14],durations:[120,160,240],repeat:0,yoyo:false},
    'reverse-once':{frames:[18,17,16,15],durations:[240,160,120,80],repeat:0,yoyo:false},
  },
  blink:{
    blink:{frames:[2,3,4,5],durations:[250,250,250,250],repeat:0,yoyo:false},
  },
};
const BLINK_FRAME_NAMES=['0','1','2','3','4','5','open','closed'];
const tamper=process.argv.includes('--tamper');
if(tamper)PINNED.directions['reverse-once'].frames=[15,16,17,18];
const app=express();app.use(express.static(fileURLToPath(new URL('../',import.meta.url))));
const server=createServer(app);let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/atlas-phaser/`);
  await page.waitForFunction(()=>!!window.atlasProbe,undefined,{timeout:15000});
  const result=await page.evaluate(()=>window.atlasProbe);
  assert.deepEqual(errors,[],'Page errors');
  assert.equal(result.phaser,PHASER_VERSION,'Pinned Phaser version');
  for(const [fixture,tags] of Object.entries(PINNED)){
    const observed=result.fixtures[fixture].tags;
    assert.deepEqual(observed.map(tag=>tag.key),Object.keys(tags),`${fixture}: created animations`);
    for(const tag of observed){
      const frames=tag.frames.map(frame=>frame.index);
      console.log(`${fixture}/${tag.key}: frames=[${frames}] repeat=${tag.repeat} yoyo=${tag.yoyo}`);
      assert.deepEqual({frames,durations:tag.frames.map(frame=>frame.duration),repeat:tag.repeat,yoyo:tag.yoyo},tags[tag.key],`${fixture}/${tag.key}`);
      assert.deepEqual(tag.frames.map(frame=>frame.key),frames.map(String),`${fixture}/${tag.key}: frame keys are the atlas array index`);
    }
  }
  assert.deepEqual(result.fixtures.blink.frameNames,BLINK_FRAME_NAMES,'Alias frames stay addressable beside indexed frames');
  assert.deepEqual(result.blinkAliases,{open:{width:16,height:16},closed:{width:16,height:16}},'Alias frame lookup');
  const strip=tags=>tags.map(({key,repeat,yoyo,frames})=>({key,repeat,yoyo,frames}));
  assert.deepEqual(strip(result.fixtures['directions-loop-flipped'].tags),strip(result.fixtures.directions.tags),'Flipping tag `loop` changes nothing');
  console.log('atlas-phaser: ok');
}finally{
  await Promise.allSettled([browser?.close(),new Promise(resolve=>server.close(resolve))]);
}
