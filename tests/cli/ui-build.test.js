import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildProject} from '../../server/build/project-build.js';
let dir,path,config;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-ui-build-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1,ui:{name:'ui-font',kind:'font',characters:' Agé?'}};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const write=()=>writeFileSync(path,JSON.stringify(config));
test('UI build publishes deterministic editable font, portable runtime, embedded bootstrap and owned report',async()=>{
  write();const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  for(const key of ['uiReport','uiRuntime','uiBoot'])expect(existsSync(result.artifacts[key])).toBe(true);
  const marker=JSON.parse(readFileSync(join(dir,'dist','.agent-sprites-build.json')));expect(marker.files).toContain('ui-runtime.mjs');expect(marker.files).toContain('ui-boot.mjs');
  const boot=await import(pathToFileURL(result.artifacts.uiBoot).href);expect(boot.imageDataUrl).toMatch(/^data:image\/png;base64,/);expect(boot.report.kind).toBe('font');expect(boot.atlas.frames.length).toBeGreaterThan(0);
  const previous=readFileSync(result.artifacts.sheet);expect((await buildProject(path)).ok).toBe(true);expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
  config.ui.characters='🦋';write();expect((await buildProject(path)).ok).toBe(false);expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
},20000);
test('skin publishes runtime and slicing metrics without a font bootstrap',async()=>{
  config.ui={name:'ui-skin',kind:'skin'};write();const result=await buildProject(path);expect(result.ok).toBe(true);expect(result.artifacts.uiBoot).toBeUndefined();expect(JSON.parse(readFileSync(result.artifacts.uiReport)).skins.panel_dark).toBeDefined();
},20000);
test.each(['ops','generator','character','environment'])('rejects mixed UI and %s before publication',async source=>{
  config[source]=null;write();const result=await buildProject(path);expect(result.ok).toBe(false);expect(result.errors[0].message).toMatch(/exactly one/);expect(existsSync(join(dir,'dist'))).toBe(false);
});
