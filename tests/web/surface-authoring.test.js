import {afterEach,beforeEach,test,expect} from 'vitest';
import {SessionDB} from '../../server/db/session.js';
import {startWebServer} from '../../server/web/http.js';
let state,server,base;
async function api(path,body,session){return(await fetch(base+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json',...(session?{'X-Sprite-Session':session}:{})}})).json();}
beforeEach(async()=>{state={db:new SessionDB(':memory:'),project:null,sessionId:null};server=await startWebServer(state,0);base=`http://localhost:${server.port}/api/`;await api('session/new',{name:'surface-study',size:4,rows:1,cols:2});await api('draw',{type:'rect',cell:'0,0',x:0,y:0,w:3,h:3,filled:true,color:'#fff',shape_name:'panel'});await api('cell/name',{cell:'0,0',name:'pose'});});
afterEach(async()=>{server.wss.close();await new Promise(resolve=>server.httpServer.close(resolve));state.db.close();});
test('surface set/read/clear uses canonical cells, retained named geometry and one undo',async()=>{
  const body={cell:'pose',shape:'panel',surface:{normal:{mode:'bevel'},material:{solid:true},lamps:[{name:'key',x:1,y:1}]}};
  const result=await api('cell/surface',body,state.sessionId);expect(result.ok).toBe(true);expect(result.data).toMatchObject({cell:'0,0',shape:{name:'panel'},surface:{normal:{mode:'bevel',width:2,depth:1}}});
  const read=await api('cell/surface?cell=pose&shape=panel');expect(read.data.surface).toEqual(result.data.surface);
  expect(JSON.parse(state.db.getSession(state.sessionId).draft_json).cells['0,0'].shapes[0].params.surface.material.solid).toBe(true);
  await api('cell/surface',{cell:'pose',shape:'panel',surface:null});expect((await api('cell/surface?cell=pose&shape=panel')).data.surface).toBeNull();
  await api('cell/undo',{cell:'pose'});expect((await api('cell/surface?cell=pose&shape=panel')).data.surface).toEqual(result.data.surface);
});
test('lighting is explicit, persisted and undoable; malformed or stale writes are atomic',async()=>{
  expect((await api('cell/lighting',{cell:'pose',lighting:{palettePolicy:'rgb',ambient:0.25}})).ok).toBe(true);
  const before=state.db.getSession(state.sessionId).draft_json;
  expect((await api('cell/lighting',{cell:'pose',lighting:{ambient:1}})).ok).toBe(false);
  for(const lighting of [{ambient:1},{palettePolicy:'rgb',unknown:true},{palettePolicy:'rgb',cell:0},null]){
    const response=await api('cell/lighting',{cell:'pose',lighting},'stale-session');expect(response.ok).toBe(false);
  }
  expect((await api('cell/surface',{cell:'pose',shape:'panel',surface:{normal:{mode:'unknown'}}})).ok).toBe(false);
  expect((await api('cell/surface',{cell:'pose',shape:'missing',surface:{}})).ok).toBe(false);
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
  await api('cell/lighting',{cell:'pose',lighting:null});expect((await api('cell/lighting?cell=pose')).data.lighting).toBeNull();
  await api('cell/undo',{cell:'pose'});expect((await api('cell/lighting?cell=pose')).data.lighting.ambient).toBe(0.25);
});
test('explicit shape ID selection remains exact even when another shape has that ID as its name',async()=>{
  const target=state.project.cells.getCell('0,0').shapes.getByName('panel');
  await api('draw',{type:'point',cell:'0,0',x:3,y:3,color:'#fff',shape_name:target.id});
  expect((await api('cell/surface',{cell:'pose',shapeId:target.id,surface:{normal:{mode:'dome'}}})).ok).toBe(true);
  expect(target.params.surface.normal.mode).toBe('dome');
  expect(state.project.cells.getCell('0,0').shapes.getByName(target.id).params.surface).toBeUndefined();
});
test('all three debug channels return canonical PNG data without mutating state',async()=>{
  await api('cell/surface',{cell:'pose',shape:'panel',surface:{normal:{mode:'dome'}}});
  await api('cell/lighting',{cell:'pose',lighting:{palettePolicy:'rgb',ambient:0.25}});
  const before=state.db.getSession(state.sessionId).draft_json;
  for(const channel of ['color','normal','light'])expect((await api(`cell/surface-preview?cell=pose&channel=${channel}`)).data).toMatchObject({cell:'0,0',channel,image:expect.stringMatching(/^data:image\/png;base64,/)});
  expect((await api('cell/surface-preview?cell=pose&channel=typo')).ok).toBe(false);
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
});

test('rejected group moves publish no partial member or earlier-cell edit',async()=>{
  for(const [cell,names] of [['0,0',['panel','edge']],['0,1',['other']]]){
    for(const name of names){
      if(name!=='panel')await api('draw',{type:'point',cell,x:0,y:0,color:'#fff',shape_name:name});
      await api('cell/surface',{cell,shape:name,surface:{lamps:[{name:'key',x:name==='edge'?1048576:0,y:0}]}});
    }
    state.db.setShapeGroup(state.sessionId,cell,'carriers',names);
  }
  const before=state.project.toJSON(),draft=state.db.getSession(state.sessionId).draft_json;
  const histories=['0,0','0,1'].map(ref=>state.project.cells.getCell(ref)._undoStack.length);
  const messages=[];state.broadcast=message=>messages.push(message);
  for(const request of [{cell:'0,0',name:'carriers',dx:1,dy:0},{name:'carriers',all_cells:true,dx:1,dy:0}]){
    expect((await api('group/shape/move',request)).ok).toBe(false);
    expect(state.project.toJSON()).toEqual(before);
    expect(state.db.getSession(state.sessionId).draft_json).toBe(draft);
    expect(['0,0','0,1'].map(ref=>state.project.cells.getCell(ref)._undoStack.length)).toEqual(histories);
    expect(messages).toEqual([]);
  }
});
