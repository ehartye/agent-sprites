import {test,expect} from 'vitest';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const names=['ui-runtime','ui-action-group','ui-theme','ui-components','ui-layout','ui-interaction','ui-phaser-runtime','ui-index'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function api(){const url=new URL('../../server/build/ui-software.mjs',import.meta.url);expect(existsSync(url),'standalone software publisher exists').toBe(true);return import(url.href);}

test('software publication canonicalizes stale CRLF working files before hashing or exporting',async()=>{
  const temp=resolve('.tmp');mkdirSync(temp,{recursive:true});const dir=mkdtempSync(join(temp,'ui-canonical-'));
  try{
    const build=join(dir,'server/build');mkdirSync(build,{recursive:true});
    writeFileSync(join(dir,'package.json'),JSON.stringify({type:'module',version:'1.0.0'}));
    const producer=new URL('../../server/build/',import.meta.url);
    for(const file of [...names.flatMap(n=>[n+'.mjs',n+'.d.mts']),'ui-software.mjs'])writeFileSync(join(build,file),readFileSync(new URL(file,producer)));
    const file='ui-action-group.mjs',canonical=readFileSync(join(build,file),'utf8').replace(/\r\n/g,'\n');
    writeFileSync(join(build,file),canonical.replace(/\n/g,'\r\n'));
    const {publishUiSoftware}=await import(pathToFileURL(join(build,'ui-software.mjs')).href);
    const output=join(dir,'output'),{receipt}=publishUiSoftware({output}),bytes=readFileSync(join(output,file));
    expect(bytes.equals(Buffer.from(canonical)),'exported bytes match canonical LF source').toBe(true);
    expect(receipt.files[file]).toEqual({bytes:Buffer.byteLength(canonical),sha256:hash(Buffer.from(canonical))});
    expect(readFileSync(join(build,file),'utf8')).toContain('\r\n');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

// A scoped producer may explicitly forbid creating filesystem links. Preserve
// the default gate; report these cases as unverified when that policy is active.
test.skipIf(process.env.UI_SOFTWARE_NO_LINKS==='1').each([...names.flatMap(n=>[n+'.mjs',n+'.d.mts']),'ui-software-manifest.json'])('first publication rejects dangling ownership link %s without writing its target',async name=>{
  const {publishUiSoftware}=await api();const temp=resolve('.tmp');mkdirSync(temp,{recursive:true});const dir=mkdtempSync(join(temp,'ui-dangling-'));
  if(!dir.startsWith(temp+sep))throw Error('Fixture escaped its owned temporary root');
  try{
    const output=join(dir,'output'),outside=join(dir,'outside');mkdirSync(output);mkdirSync(outside);
    const target=join(outside,'must-not-be-created');symlinkSync(target,join(output,name),'file');
    expect(()=>publishUiSoftware({output})).toThrow(/ownership|unowned|link|regular/i);
    expect(existsSync(target)).toBe(false);expect(existsSync(join(output,'ui-index.mjs'))).toBe(false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('software publication is a complete independently loadable ESM/declaration closure with exact receipts',async()=>{
  const {publishUiSoftware}=await api();mkdirSync('.tmp',{recursive:true});const dir=mkdtempSync(resolve('.tmp/ui-software-'));
  try {
    const receipt=publishUiSoftware({output:dir}), manifest=JSON.parse(readFileSync(receipt.manifest,'utf8'));
    const packageVersion=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
    expect(manifest).toMatchObject({format:'agent-sprites/ui-software@1',version:1,producer:{name:'agent-sprites',version:packageVersion,identity:{algorithm:'sha256-ui-software-v1'}}});
    expect(Object.keys(manifest.files).sort()).toEqual(names.flatMap(n=>[n+'.mjs',n+'.d.mts']).sort());
    for(const [file,integrity] of Object.entries(manifest.files)) {
      const bytes=readFileSync(join(dir,file));expect(integrity).toEqual({bytes:bytes.length,sha256:hash(bytes)});
      const source=bytes.toString();
      if(file.endsWith('.mjs'))expect(source).not.toMatch(/(?:from\s*|import\s*\()['"](?:node:|phaser|canvas|sharp|better-sqlite3)/);
      for(const [,dep] of source.matchAll(/(?:from\s*|import\s*\()['"]\.\/([^'"]+)['"]/g))expect(existsSync(join(dir,dep))||existsSync(join(dir,dep.replace(/\.mjs$/,'.d.mts')))).toBe(true);
    }
    const browser=await import(pathToFileURL(join(dir,'ui-index.mjs')).href);
    for(const fn of ['createPhaserUi','createUiInteraction','layoutUi','button','defineTheme','planActionGroup','placeBitmapText'])expect(typeof browser[fn]).toBe('function');
    const before=readFileSync(receipt.manifest);publishUiSoftware({output:dir});expect(readFileSync(receipt.manifest)).toEqual(before);
    writeFileSync(join(dir,'ui-index.mjs'),'user-owned drift');
    expect(()=>publishUiSoftware({output:dir})).toThrow(/integrity|modified|ownership/i);
    expect(readFileSync(join(dir,'ui-index.mjs'),'utf8')).toBe('user-owned drift');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('software sync preserves unrelated historical artwork and rejects unowned name collisions',async()=>{
  const {publishUiSoftware}=await api();mkdirSync('.tmp',{recursive:true});const dir=mkdtempSync(resolve('.tmp/ui-history-'));
  try {
    writeFileSync(join(dir,'historical.png'),'old art');publishUiSoftware({output:dir});expect(readFileSync(join(dir,'historical.png'),'utf8')).toBe('old art');
    const collision=join(dir,'collision');mkdirSync(collision);writeFileSync(join(collision,'ui-runtime.mjs'),'user data');
    expect(()=>publishUiSoftware({output:collision})).toThrow(/ownership|unowned/i);
    expect(existsSync(join(collision,'ui-index.mjs'))).toBe(false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
