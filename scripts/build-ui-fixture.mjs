import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildProject} from '../server/build/project-build.js';
const root=new URL('../tests/native-ui/',import.meta.url),assets=new URL('assets/',root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
mkdirSync(assets,{recursive:true});
const manifest={format:'agent-sprites/ui-native-assets@1',inputs:{},files:{}};
for(const name of ['recipe.json','generate.mjs','font.build.json','skin.build.json'])manifest.inputs[name]=hash(readFileSync(new URL(name,root)));
for(const kind of ['font','skin']) {
  const result=await buildProject(fileURLToPath(new URL(`${kind}.build.json`,root)));
  if(!result.ok)throw Error(JSON.stringify(result.errors));
  for(const [source,target] of [['sheet',`${kind}.png`],['atlas',`${kind}.atlas.json`],['uiReport',`${kind}.report.json`]]) {
    if(!result.artifacts[source])throw Error(`Missing ${source}`);
    const destination=new URL(target,assets);copyFileSync(result.artifacts[source],destination);
    const bytes=readFileSync(destination);manifest.files[target]={bytes:bytes.length,sha256:hash(bytes)};
  }
}
writeFileSync(new URL('manifest.json',assets),JSON.stringify(manifest,null,2)+'\n');
console.log('Built checked native UI font/skin assets through the manifest pipeline.');
