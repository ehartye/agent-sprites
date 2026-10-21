import {beforeEach,afterEach,test,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {SessionDB} from '../../server/db/session.js';
import {startWebServer} from '../../server/web/http.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import sharp from 'sharp';
const exec=promisify(execFile);let state,server,temp;
const cli=(...args)=>exec(process.execPath,[resolve('scripts/sprite.js'),...args],{env:{...process.env,SPRITE_PORT:String(server.port)},timeout:10000,windowsHide:true});
const json=async(...args)=>JSON.parse((await cli(...args)).stdout);
const file=(name,value)=>{const path=join(temp,name);writeFileSync(path,JSON.stringify(value));return path;};
beforeEach(async()=>{state={db:new SessionDB(':memory:'),project:null,sessionId:null};server=await startWebServer(state,0);temp=mkdtempSync(join(tmpdir(),'sprite-surface-cli-'));await cli('new','lighting-study','--size','4','--rows','1','--cols','2','--dest',temp);await cli('draw','rect','--cell','0,0','--x','0','--y','0','--w','3','--h','3','--color','#fff','--name','panel');});
afterEach(async()=>{server.wss.close();await new Promise(resolve=>server.httpServer.close(resolve));state.db.close();rmSync(temp,{recursive:true,force:true});});
test('real CLI sets, queries and clears retained surfaces and cell lighting with session guards',async()=>{
  const surface=file('surface.json',{normal:{mode:'bevel'},material:{solid:true},lamps:[{name:'key',x:1,y:1}]}),lighting=file('lighting.json',{palettePolicy:'rgb',ambient:0.25});
  expect(await json('surface','set','--cell','0,0','--shape','panel','--file',surface,'--session',state.sessionId)).toMatchObject({cell:'0,0',surface:{normal:{mode:'bevel'}}});
  expect(await json('surface','read','--cell','0,0','--shape','panel')).toMatchObject({surface:{material:{solid:true}}});
  expect(await json('lighting','set','--cell','0,0','--file',lighting)).toMatchObject({lighting:{ambient:0.25}});
  const before=state.db.getSession(state.sessionId).draft_json;
  for(const command of ['surface','lighting'])for(const sub of ['read','clear'])await expect(cli(command,sub,'--cell','0,0',...(command==='surface'?['--shape','panel']:[]),'--session','stale')).rejects.toMatchObject({code:1,stderr:expect.stringMatching(/session changed/)});
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
  await cli('surface','clear','--cell','0,0','--shape','panel');expect((await json('surface','read','--cell','0,0','--shape','panel')).surface).toBeNull();
  await cli('lighting','clear','--cell','0,0');expect((await json('lighting','read','--cell','0,0')).lighting).toBeNull();
});
test('batch retains authoring read results and normal export uses canonical trim metadata',async()=>{
  const ops=file('ops.json',[{command:'surface',cell:'0,0',shape:'panel',surface:{normal:{mode:'dome'}}},{command:'lighting',cell:'0,0',lighting:{palettePolicy:'rgb',ambient:0.4}},{command:'surface',sub:'read',cell:'0,0',shape:'panel'},{command:'lighting',sub:'read',cell:'0,0'}]);
  const report=await json('batch',ops,'--json','--session',state.sessionId);expect(report.succeeded).toBe(4);expect(report.results).toHaveLength(2);
  const output=join(temp,'export');await cli('export','--dest',output,'--trim','true','--session',state.sessionId);
  expect(existsSync(join(output,'lighting-study.normal.png'))).toBe(true);
  const color=JSON.parse(readFileSync(join(output,'lighting-study.atlas.json'),'utf8')),normal=JSON.parse(readFileSync(join(output,'lighting-study.normal.atlas.json'),'utf8'));
  expect(normal.frames).toEqual(color.frames);expect(normal.meta.size).toEqual(color.meta.size);
});
test('standalone transformations honor the same session pin as surface authoring',async()=>{
  const before=state.db.getSession(state.sessionId).draft_json;
  const commands=[
    ['move','panel','--cell','0,0','--dx','1','--dy','0'],
    ['move-to','panel','--cell','0,0','--x','1','--y','1'],
    ['flip','panel','--cell','0,0','--axis','horizontal','--about','cell'],
    ['rotate','panel','--cell','0,0','--deg','90','--about','cell'],
    ['mirror','--cell','0,0','--axis','horizontal'],
    ['rotate-cell','--cell','0,0','--deg','90'],
    ['copy','--from','0,0','--to','0,1'],['undo','--cell','0,0'],
  ];
  for(const command of commands)await expect(cli(...command,'--session','previous-session')).rejects.toMatchObject({code:1,stderr:expect.stringMatching(/session changed/)});
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
});
test('view exposes exact saved normal and light channels through the existing renderer',async()=>{
  await cli('surface','set','--cell','0,0','--shape','panel','--file',file('normal.json',{normal:{mode:'flat',vector:[1,0,1]}}));
  await cli('lighting','set','--cell','0,0','--file',file('light.json',{palettePolicy:'rgb',ambient:0.25}));
  const renderer=new CanvasRenderer(state.project.palette),cell=state.project.cells.getCell('0,0');
  for(const channel of ['normal','light']){
    const output=join(temp,`${channel}.png`);await cli('view','--cell','0,0','--channel',channel,'--out',output,'--session',state.sessionId);
    expect([...await sharp(output).ensureAlpha().raw().toBuffer()]).toEqual([...renderer.renderCellRaw(cell,{channel})]);
  }
  await expect(cli('view','--cell','0,0','--channel','typo')).rejects.toMatchObject({code:1,stderr:expect.stringMatching(/channel/)});
});
