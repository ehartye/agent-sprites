import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';

test('layer CLI and shared batch move a whole child atomically, persist it, and reject stale sessions',async()=>{
  const db=new SessionDB(':memory:');
  const session=db.createSession({project_name:'layers',project_path:process.cwd(),destination_folder:'',json_file:null});
  const state={db,sessionId:session.id,project:Project.create({name:'layers',cellSize:8,rows:1,cols:1})};
  const cell=state.project.cells.getCell('0,0');
  cell.name='first';
  const layer={id:'scene:child',x:1,y:1,w:3,h:3,z:2,background:{mode:'transparent'}};
  cell.draw('point',{x:1,y:1,layers:[layer]},'#ff0000','a');
  cell.draw('point',{x:2,y:1,layers:[layer]},'#00ff00','b');
  const before=cell.toJSON(),server=await startWebServer(state,0);
  const packets=[],broadcast=state.broadcast;
  state.broadcast=packet=>{packets.push(structuredClone(packet));broadcast?.(packet);};
  const cli=async(...args)=>promisify(execFile)(process.execPath,[resolve('scripts/sprite.js'),...args],{env:{...process.env,SPRITE_PORT:String(server.port)},timeout:10000,windowsHide:true});
  try {
    const list=JSON.parse((await cli('layer','list','--cell','first')).stdout);
    expect(list.cell).toBe('0,0');
    expect(list.layers).toEqual([expect.objectContaining({...layer,parent:null,members:['a','b']})]);
    await expect(cli('layer','edit',layer.id,'--cell','0,0','--dx','2','--session','stale')).rejects.toMatchObject({code:1,stderr:expect.stringMatching(/session changed/)});
    expect(cell.toJSON()).toEqual(before);
    const history=cell._undoStack.length;
    const changed=JSON.parse((await cli('layer','edit',layer.id,'--cell','first','--dx','2','--dy','1','--z','10','--session',session.id)).stdout);
    expect(changed.changed).toBe(2);expect(cell._undoStack.length).toBe(history+1);
    expect(packets.find(packet=>packet.type==='cell_update')).toMatchObject({cell:'0,0',cellData:{shapes:[expect.objectContaining({name:'a',params:expect.objectContaining({x:3,y:2})}),expect.objectContaining({name:'b'})]}});
    expect(cell.shapes.get('a').params).toMatchObject({x:3,y:2,layers:[{...layer,x:3,y:2,z:10}]});
    const draft=JSON.parse(db.getSession(session.id).draft_json);
    expect(draft.cells['0,0'].shapes[0].params.layers[0]).toMatchObject({x:3,y:2,z:10});
    cell.undo();expect(cell.toJSON()).toEqual(before);cell.redo();
    const batch=await fetch(`http://localhost:${server.port}/api/workbench/map-operations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations:[{command:'layer',sub:'edit',cell:'0,0',id:layer.id,dx:-1}]})}).then(res=>res.json());
    expect(batch.data).toEqual([{method:'POST',path:'/api/cell/layer',body:{cell:'0,0',id:layer.id,dx:-1}}]);
  } finally {server.wss.close();await new Promise(resolve=>server.httpServer.close(resolve));db.close();}
},20000);
