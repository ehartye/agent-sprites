import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProject} from '../../server/build/project-build.js';

let dir;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-genreport-'));});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const OPS=[{command:'new',name:'dot',size:8,rows:1,cols:1},{command:'draw',type:'point',cell:'0,0',name:'p',x:1,y:1,color:'#ffffff'},{command:'name',cell:'0,0',as:'front'}];
const REPORT={version:1,ok:true,kind:'character',system:'native',cellSize:{width:8,height:8},ground:7,frames:[{alias:'front',cell:'0,0',direction:'front',frame:null,sides:{},gear:[],bounds:{left:1,top:1,right:1,bottom:1}}]};
async function build(output){
  writeFileSync(join(dir,'gen.mjs'),`process.stdout.write(${JSON.stringify(JSON.stringify(output))})`);
  writeFileSync(join(dir,'sprite-project.json'),JSON.stringify({version:1,generator:'gen.mjs',output:'dist',scale:1}));
  return buildProject(join(dir,'sprite-project.json'));
}

test('a generator printing { operations, report } publishes the character report and runtime',async()=>{
  const r=await build({operations:OPS,report:REPORT});
  expect(r.errors).toEqual([]);
  expect(JSON.parse(readFileSync(r.artifacts.characterReport,'utf8'))).toEqual(REPORT);
  expect(existsSync(r.artifacts.playbackRuntime)).toBe(true);
  const m=JSON.parse(readFileSync(r.artifacts.manifest,'utf8'));
  expect(m).toMatchObject({source:'generator',kind:'character',report:'character-report.json'});
},30000);

test('a plain operations array builds exactly as before',async()=>{
  const r=await build(OPS);
  expect(r.errors).toEqual([]);
  expect(r.artifacts.characterReport).toBeUndefined();
  expect(r.artifacts.playbackRuntime).toBeUndefined();
},30000);

test.each([
  [{report:REPORT},/operations array or \{ operations, report \}/],
  [{operations:OPS,report:{kind:'terrain'}},/character or UI report with frames/],
])('malformed generator output fails before publication: %j',async(output,error)=>{
  const r=await build(output);
  expect(r.ok).toBe(false);
  expect(r.errors[0].message).toMatch(error);
  expect(existsSync(join(dir,'dist'))).toBe(false);
},30000);
