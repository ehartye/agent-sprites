import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import { request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startWebServer } from '../../server/web/http.js';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
const exec = promisify(execFile);
let state, server, base;
beforeEach(async () => {
 const db = new SessionDB(':memory:');
 const session = db.createSession({ project_name:'Shared sprite', project_path:'.', destination_folder:'.', draft_json:'{}' });
 state = { db, sessionId:session.id, project:Project.create({ name:'Shared sprite', cellSize:8, rows:1, cols:2 }) };
 state.project.cells.getCell('0,0').draw('rect', {x:1,y:1,w:4,h:4}, '#ff0000', 'red');
 state.project.cells.getCell('0,1').draw('rect', {x:2,y:1,w:4,h:4}, '#00ff00', 'green');
 server = await startWebServer(state, 0); base = `http://127.0.0.1:${server.port}`;
});
afterEach(async () => { vi.restoreAllMocks(); for(const ws of server.wss.clients) ws.terminate(); await server.dispose(); await new Promise(r=>server.wss.close(r)); await new Promise(r=>server.httpServer.close(r)); state.db.close(); });
const post = (path, body, headers={}) => fetch(base+path,{ method:'POST', headers:{'content-type':'application/json',...headers}, body:JSON.stringify(body) });
async function issue(seconds) { const r=await post('/api/previews',{seconds}); expect(r.status).toBe(200); return (await r.json()).data; }
async function exchange(share) { const token=new URL(share.url).hash.slice('#preview='.length); const r=await post(`/preview/${share.id}/exchange`,{token}); expect(r.status).toBe(200); return r.headers.get('set-cookie').split(';')[0]; }
const data = (share,cookie) => fetch(`${base}/preview/${share.id}/summary`,{headers:cookie?{cookie}:{}});

test('issues scoped links, exchanges into a distinct scoped cookie and omits private metadata',async()=>{
 state.project.cells.getCell('0,0').reference={path:'C:/private/source.png'};
 state.project.review={private:'owner-notes'};
 const share=await issue(); expect(share.access).toBe('read-only'); expect(share.expiresAt).toBeDefined();
 expect((await data(share)).status).toBe(403);
 const cookie=await exchange(share); const r=await data(share,cookie); expect(r.status).toBe(200);
 const text=await r.text(); expect(text).toContain('Shared sprite'); expect(text).not.toContain('private'); expect(text).not.toContain('owner-notes');
 expect(r.headers.get('cache-control')).toBe('no-store'); expect(r.headers.get('referrer-policy')).toBe('no-referrer');
 const summary=(await (await data(share,cookie)).json()).data;
 const query=new URLSearchParams({...summary,refs:'0,0'});
 const frames=await fetch(`${base}/preview/${share.id}/frames?${query}`,{headers:{cookie}});
 expect(frames.status).toBe(200); expect(await frames.text()).not.toContain('private');
 const other=await issue(); expect((await data(other,cookie)).status).toBe(403);
 expect((await post(`/preview/${other.id}/exchange`,{token:new URL(share.url).hash.slice(9)})).status).toBe(403);
});

test('revokes opened and unopened access and never follows a replacement project',async()=>{
 const share=await issue(),cookie=await exchange(share);
 expect((await post('/api/previews/revoke',{id:share.id})).status).toBe(200);
 expect((await data(share,cookie)).status).toBe(403);
 const second=await issue(), c2=await exchange(second);
 state.project=Project.create({name:'Private replacement',cellSize:8,rows:1,cols:1});
 expect((await data(second,c2)).status).toBe(403);
});

test('validates TTL and rechecks expiry after exchanging',async()=>{
 for(const seconds of [0,59,86401,60.5,'60']) expect((await post('/api/previews',{seconds})).status).toBe(400);
 const share=await issue(60), cookie=await exchange(share);
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+61000);
 expect((await data(share,cookie)).status).toBe(403);
 expect((await post(`/preview/${share.id}/exchange`,{token:new URL(share.url).hash.slice(9)})).status).toBe(403);
});

test('rejects foreign origins and forged local hosts for owner HTTP and WebSocket access',async()=>{
 expect((await post('/api/previews',{}, {origin:'https://evil.example'})).status).toBe(403);
 const forged = await new Promise(resolve=>{const req=httpRequest(base+'/api/session/status',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.end();});
 expect(forged).toBe(403);
 const share=await issue(); const token=new URL(share.url).hash.slice(9);
 expect((await post(`/preview/${share.id}/exchange`,{token},{origin:'https://evil.example'})).status).toBe(403);
 const status=await new Promise(resolve=>{const ws=new WebSocket(base.replace('http:','ws:'),{origin:'https://evil.example'});ws.on('unexpected-response',(_r,res)=>{res.resume();resolve(res.statusCode);});ws.on('error',()=>{});});
 expect(status).toBe(403);
});

test('remote peers cannot bypass a preview through owner APIs, health or raw WebSocket',async()=>{
 const ip=Object.values(networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal)?.address;
 expect(ip).toBeTruthy(); const remote=`http://${ip}:${server.port}`;
 const share=await issue(), cookie=await exchange(share);
 expect((await fetch(`${remote}/preview/${share.id}/summary`,{headers:{cookie}})).status).toBe(200);
 for(const path of ['/','/health','/api/session/list','/api/workbench/project-summary']) expect((await fetch(remote+path)).status).toBe(403);
 expect((await fetch(remote+'/api/session/new',{method:'POST',headers:{'content-type':'application/json'},body:'{"name":"Unauthorized"}'})).status).toBe(403);
 const status=await new Promise(resolve=>{const ws=new WebSocket(remote.replace('http:','ws:'));ws.on('unexpected-response',(_r,res)=>{res.resume();resolve(res.statusCode);});ws.on('error',()=>{});});
 expect(status).toBe(403); expect(state.project.name).toBe('Shared sprite');
});

test('CLI creates and revokes shares without starting a new server',async()=>{
 const cli=async(...args)=>JSON.parse((await exec(process.execPath,['scripts/sprite.js','preview',...args],{env:{...process.env,SPRITE_PORT:String(server.port)},timeout:10000})).stdout);
 const share=await cli('create','--seconds','120'); expect(share.access).toBe('read-only');
 const cookie=await exchange(share); await cli('revoke','--id',share.id); expect((await data(share,cookie)).status).toBe(403);
});
const { chromium } = await import(process.env.SPRITE_PLAYWRIGHT_MODULE ?? 'playwright');

test('native mobile preview renders, plays, reloads and isolates simultaneous links without URL credentials', async () => {
 const first=await issue(), second=await issue();
 const ip=Object.values(networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal).address;
 const remoteUrl=share=>`http://${ip}:${server.port}/preview/${share.id}${new URL(share.url).hash}`;
 const secret=new URL(first.url).hash.slice(9);
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const page=await context.newPage(), requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()+' '+(r.headers().referer??'')));
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.route('http://chat.example.test/', route => route.fulfill({contentType:'text/html',body:`<a href="${remoteUrl(first)}">Open preview</a>`}));
  await page.goto('http://chat.example.test/'); await page.getByRole('link',{name:'Open preview'}).click(); await page.waitForSelector('canvas[data-state="ready"]', { timeout: 5000 });
  expect(await page.locator('h1').textContent()).toBe('Shared sprite');
  expect(page.url()).not.toContain('#');
  expect(requests.join('\n')).not.toContain(secret);
  expect(requests.some(r=>r.includes('/api/'))).toBe(false);
  const cookies=await context.cookies(); expect(cookies[0]).toMatchObject({httpOnly:true,sameSite:'Strict',path:`/preview/${first.id}`});
  const pixels=await page.locator('canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let red=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<30&&d[i+2]<30)red++;return red;});
  expect(pixels).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('button')?.textContent==='Pause');
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4)if(d[i+1]>200&&d[i]<30&&d[i+2]<30)return true;return false;});
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  if(process.env.SPRITE_PREVIEW_SCREENSHOT)await page.screenshot({path:process.env.SPRITE_PREVIEW_SCREENSHOT,fullPage:true});
  const restored=page.waitForResponse(r=>r.url().endsWith('/summary'),{timeout:2000});
  await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await restored;
  const other=await context.newPage(); await other.goto(remoteUrl(second)); await other.waitForSelector('canvas[data-state="ready"]');
  await page.reload(); await page.waitForSelector('canvas[data-state="ready"]', { timeout: 5000 });
  await post('/api/previews/revoke',{id:first.id});
  expect(await page.evaluate(async()=> (await fetch(location.pathname+'/summary')).status)).toBe(403);
  expect(await other.evaluate(async()=> (await fetch(location.pathname+'/summary')).status)).toBe(200);
  expect(errors).toEqual([]);
 } finally { await context.close();await browser.close(); }
},20000);

import { PreviewGrants, previewLinks, ownerRequestAllowed } from '../../server/web/preview-access.js';

test('bounds live grants and stores only hashes, never restoring them after restart',()=>{
 let now=1000; const grants=new PreviewGrants(()=>now);
 const {grant,token}=grants.issue('project',60);
 expect(JSON.stringify([...grants.grants.values()])).not.toContain(token);
 expect(grants.get(grant.id,token,'other')).toBeNull();
 expect(new PreviewGrants().get(grant.id,token,'project')).toBeNull();
 now+=60000;expect(grants.get(grant.id,token,'project')).toBeNull();
 for(let i=0;i<128;i++)grants.issue('project');
 expect(()=>grants.issue('project')).toThrow(/limit/);
 grants.clear();expect(grants.grants.size).toBe(0);
});

test('advertises only named supported Tailscale adapters and rejects forwarded owner identity',()=>{
 const address={family:'IPv4',internal:false,address:'100.80.1.2'};
 expect(previewLinks(3377,'/preview/id',{Tailscale:[address]}).tailscaleUrl).toBe('http://100.80.1.2:3377/preview/id');
 for(const interfaces of [{Ethernet:[address]},{Tailscale:[{...address,address:'100.1.1.1'}]}])expect(previewLinks(3377,'/',interfaces).tailscaleUrl).toBeNull();
 expect(ownerRequestAllowed({socket:{remoteAddress:'192.168.1.2'},headers:{host:'localhost:3377','x-forwarded-for':'127.0.0.1'}})).toBe(false);
 expect(ownerRequestAllowed({socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3377','sec-fetch-site':'cross-site'}})).toBe(false);
});

test('keeps malformed preview errors private and denies cross-resource writes and frame overreach',async()=>{
 const share=await issue(),cookie=await exchange(share);
 const malformed=await fetch(`${base}/preview/${share.id}/exchange`,{method:'POST',headers:{'content-type':'application/json'},body:'{"token":'});
 expect(malformed.status).toBe(400);expect(await malformed.text()).toBe('{"ok":false,"error":"Invalid preview request"}');
 for(const path of ['event','revoke','../other/summary'])expect((await post(`/preview/${share.id}/${path}`,{}, {cookie})).status).toBe(403);
 expect((await post(`/preview/${share.id}/summary`,{}, {cookie})).status).toBe(403);
 const summary=(await (await data(share,cookie)).json()).data;
 for(const refs of ['0,0|0,1|0,2|0,3|0,4|0,5|0,6|0,7|0,8','0,2']){
  const query=new URLSearchParams({sessionId:summary.sessionId,projectId:summary.projectId,revision:summary.revision,refs});
  expect((await fetch(`${base}/preview/${share.id}/frames?${query}`,{headers:{cookie}})).status).toBe(400);
 }
});
test('opens the credential-free shell when a shared link is clicked from chat',async()=>{
 const share=await issue();
 const shell=await fetch(`${base}/preview/${share.id}`,{headers:{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'}});
 expect(shell.status).toBe(200);expect(await shell.text()).toContain('shared-preview.js');
 expect((await fetch(`${base}/preview/${share.id}/summary`,{headers:{'sec-fetch-site':'cross-site'}})).status).toBe(403);
});

test('honors explicit session guards when creating a share',async()=>{
 const result=await post('/api/previews',{}, {'x-sprite-session':'another-session'});
 expect(result.status).toBe(409);
});

test('CLI refuses an older server with a useful error and sends no mutation',async()=>{
 const {createServer}=await import('node:http'); const paths=[];
 const old=createServer((req,res)=>{paths.push(req.method+' '+req.url);if(req.url==='/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,service:'agent-sprites',protocol:1}));}else{res.writeHead(404);res.end('<html>old server</html>');}});
 await new Promise(r=>old.listen(0,'127.0.0.1',r));
 try {
  await expect(exec(process.execPath,['scripts/sprite.js','preview','create'],{env:{...process.env,SPRITE_PORT:String(old.address().port)},timeout:10000})).rejects.toMatchObject({stderr:expect.stringContaining('does not support scoped previews')});
  expect(paths).toEqual(['GET /health','GET /api/previews/status']);
 }finally{await new Promise(r=>old.close(r));}
});
