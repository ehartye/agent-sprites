/** Node-only software publication. This module deliberately imports no art builder. */
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const names=['ui-runtime','ui-action-group','ui-theme','ui-components','ui-layout','ui-interaction','ui-phaser-runtime','ui-index'];
export const UI_SOFTWARE_FILES=Object.freeze(names.flatMap(name=>[`${name}.mjs`,`${name}.d.mts`]));
const manifestName='ui-software-manifest.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const integrity=bytes=>({bytes:bytes.length,sha256:hash(bytes)});
const source=dirname(fileURLToPath(import.meta.url));
function regular(path){if(lstatSync(path).isSymbolicLink()||!lstatSync(path).isFile())throw new TypeError(`Software ownership requires a regular file: ${path}`);}
// lstat observes directory entries, including symlinks with absent referents.
function entryExists(path){try{lstatSync(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function noLinks(path){let cursor=resolve(path);while(true){if(entryExists(cursor)&&lstatSync(cursor).isSymbolicLink())throw new TypeError(`Software ownership rejects links: ${cursor}`);const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}}

/** Verify every previous owned byte before writing any new byte. Manifest publishes last. */
export function publishUiSoftware({output}) {
  if(typeof output!=='string'||!output.trim())throw new TypeError('Software output path is required');
  const directory=resolve(output);noLinks(directory);
  // Existing working files can retain CRLF after an attributes-only upgrade.
  // Export canonical LF source bytes before hashing, without rewriting inputs.
  const payload=Object.fromEntries(UI_SOFTWARE_FILES.map(name=>{const path=join(source,name);regular(path);return [name,Buffer.from(readFileSync(path,'utf8').replace(/\r\n/g,'\n'))];}));
  const files=Object.fromEntries(Object.entries(payload).map(([name,bytes])=>[name,integrity(bytes)]));
  const version=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url))).version;
  const receipt={format:'agent-sprites/ui-software@1',version:1,producer:{name:'agent-sprites',version,identity:{algorithm:'sha256-ui-software-v1',sha256:hash(JSON.stringify({version,files}))}},files};
  const manifest=join(directory,manifestName);
  if(entryExists(manifest)){
    regular(manifest);const previous=JSON.parse(readFileSync(manifest,'utf8'));
    if(previous.format!==receipt.format||previous.version!==1||previous.producer?.name!=='agent-sprites'||previous.producer.identity?.algorithm!=='sha256-ui-software-v1'||JSON.stringify(Object.keys(previous.files??{}).sort())!==JSON.stringify([...UI_SOFTWARE_FILES].sort()))throw new TypeError('Invalid software ownership manifest');
    if(hash(JSON.stringify({version:previous.producer.version,files:previous.files}))!==previous.producer.identity.sha256)throw new TypeError('Software manifest integrity mismatch');
    for(const name of UI_SOFTWARE_FILES){const path=join(directory,name);if(!entryExists(path))throw new TypeError(`Owned software file missing: ${name}`);regular(path);const actual=integrity(readFileSync(path)),expected=previous.files[name];if(actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)throw new TypeError(`Modified software integrity: ${name}`);}
  } else for(const name of UI_SOFTWARE_FILES)if(entryExists(join(directory,name)))throw new TypeError(`Unowned software name collision: ${name}`);
  mkdirSync(directory,{recursive:true});
  for(const [name,bytes]of Object.entries(payload)){const path=join(directory,name);if(!entryExists(path)||!readFileSync(path).equals(bytes))writeFileSync(path,bytes);}
  const manifestBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
  if(!entryExists(manifest)||!readFileSync(manifest).equals(manifestBytes))writeFileSync(manifest,manifestBytes);
  const artifacts=Object.fromEntries(UI_SOFTWARE_FILES.map(name=>[name,join(directory,name)]));
  return {manifest,artifacts,receipt};
}
