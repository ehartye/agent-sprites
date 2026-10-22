import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../scripts/managed-runtime.js';
import {storyBeats,timeline} from './timeline.mjs';
import {catParts,C} from './art.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const launcher=join(root,'scripts/run-managed.js'),runtime=resolveRuntime(root);
const require=createRequire(join(runtime.root,'package.json')),{createCanvas,loadImage}=require('canvas');
const read=p=>JSON.parse(readFileSync(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const write=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n');
const run=(...args)=>{const text=execFileSync(process.execPath,[launcher,...args,'--json'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});const value=JSON.parse(text);if(value.ok===false)throw new Error(text);return value;};
const publish=resolve(root,'site/assets/cozy-cat');
if(relative(root,publish)!==join('site','assets','cozy-cat'))throw new Error('Unexpected publication directory');
mkdirSync(publish,{recursive:true});mkdirSync(join(here,'.reviews'),{recursive:true});
const review=mkdtempSync(join(here,'.reviews/review-'));
const built=run('build',join(here,'sprite-project.json'));write(join(here,'.raw-build.json'),built);
const dist=join(here,'dist');
copyFileSync(join(dist,'cozy-cat.png'),join(publish,'sheet.png'));
copyFileSync(join(dist,'cozy-cat.normal.png'),join(publish,'normal.png'));
writeFileSync(join(publish,'project.json'),JSON.stringify(read(join(dist,'cozy-cat.project.json')))+'\n');
writeFileSync(join(publish,'replay.json'),JSON.stringify(read(join(dist,'construction-replay.json')))+'\n');
const atlas=read(join(dist,'cozy-cat.atlas.json'));atlas.meta.image='sheet.png';atlas.meta.normalMap.image='normal.png';atlas.meta.normalMap.atlas='normal.atlas.json';write(join(publish,'atlas.json'),atlas);
const normal=read(join(dist,'cozy-cat.normal.atlas.json'));normal.meta.image='normal.png';normal.meta.colorImage='sheet.png';normal.meta.normalEncoding.image='normal.png';normal.meta.normalEncoding.atlas='normal.atlas.json';write(join(publish,'normal.atlas.json'),normal);
const verification=run('verify',join(publish,'atlas.json'),'--report',join(review,'verification.json'));
const normalVerification=run('verify',join(publish,'normal.atlas.json'),'--report',join(review,'normal-verification.json'));
write(join(here,'.raw-verification.json'),{verification,normalVerification});
const input=join(publish,'proof-input.json');
// 4× full-loop proof would exceed the tool's 64M work budget. All poses also get
// separate local 4× review cards; the complete actual-atlas GIF is 2×.
write(input,{version:1,canvas:{w:160,h:112},scale:2,matte:'#ecdab9',tracks:[{name:'little_morning',atlas:'atlas.json',tag:'little_morning',x:0,y:0,anchor:'pivot'}]});
const out=join(review,'proof');run('atlas-proof',input,'--out',out);
copyFileSync(join(out,'proof.gif'),join(publish,'scene.gif'));copyFileSync(join(out,'frames','0000.png'),join(publish,'poster.png'));copyFileSync(join(out,'contact.png'),join(publish,'contact.png'));
mkdirSync(join(publish,'frames'),{recursive:true});
for(const name of readdirSync(join(out,'frames')))copyFileSync(join(out,'frames',name),join(publish,'frames',name));
const proof=read(join(out,'proof.json'));
for(const track of proof.tracks){track.atlas=relative(publish,track.atlas).split(sep).join('/');track.image=relative(publish,track.image).split(sep).join('/');}
for(const source of proof.provenance.inputs)source.path=relative(publish,source.path).split(sep).join('/');
proof.artifacts={gif:'scene.gif',contact:'contact.png',frames:proof.artifacts.frames.map(p=>`frames/${p.split(/[\\/]/).at(-1)}`),report:'proof.json'};
proof.publication={paths:'Portable relocated paths; input hashes and decoded GIF measurements are unchanged.',input:'proof-input.json'};write(join(publish,'proof.json'),proof);
const image=await loadImage(join(publish,'sheet.png'));
const tag=atlas.meta.frameTags.find(t=>t.name==='little_morning'),frames=atlas.frames.slice(tag.from,tag.to+1);
for(const scale of [1]){
  const canvas=createCanvas(1280*scale,1120*scale),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,canvas.width,canvas.height);writeFileSync(join(review,`all-source-${scale}x.png`),canvas.toBuffer('image/png'));
}
for(let start=0;start<80;start+=4){
  const canvas=createCanvas(1280,896),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(let j=0;j<4;j++){const f=frames[start+j].frame;ctx.drawImage(image,f.x,f.y,160,112,(j%2)*640,Math.floor(j/2)*448,640,448);}
  writeFileSync(join(review,`poses-${String(start).padStart(2,'0')}-${start+3}-4x.png`),canvas.toBuffer('image/png'));
}
const sources=read(join(dist,'sprite-manifest.json')).build.inputs.map(input=>{
  const bytes=readFileSync(resolve(here,input.path));if(hash(bytes)!==input.sha256)throw new Error(`Source changed after build: ${input.path}`);
  const text=/\.(?:[cm]?js|json|md|txt|ya?ml|html?|css|svg|ts|pxl)$/i.test(input.path);
  return {...input,bytes:input.bytes??bytes.length,...(text?{normalizedTextSha256:hash(bytes.toString('utf8').replace(/\r\n?/g,'\n'))}:{})};
});
const walkFiles=(folder,prefix='')=>readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walkFiles(join(folder,item.name),`${prefix}${item.name}/`):[`${prefix}${item.name}`]);
const integrity=Object.fromEntries(walkFiles(publish).filter(p=>p!=='manifest.json'&&p!=='.gitattributes').map(p=>{const bytes=readFileSync(join(publish,p));return[p,{bytes:bytes.length,sha256:hash(bytes)}];}));
const contacts=[33,34,43,44,45,46,47,51,52].map(frame=>{const p=timeline[frame],paw=catParts(p).paws.nearFore;return{frame,paw:'nearFore',pawCenter:paw,ballCenter:[p.ball.x,p.ball.y],centerDistance:Math.hypot(paw[0]-p.ball.x,paw[1]-p.ball.y)};});
write(join(publish,'manifest.json'),{version:1,name:"Marmalade's little morning",width:160,height:112,pivot:{x:0,y:0},sourceFrames:80,tag:'little_morning',durationMs:8000,frameDurationMs:100,loop:true,reviewScale:4,proofScale:2,storyBeats,palette:C,contacts,sourceInputs:sources,tools:{producer:'agent-sprites',version:runtime.version,composition:'new named cat anatomy, basket, room and yarn parts',timing:'80 exact 100ms holds',surfaces:'retained fur/cushion/yarn dome normals, wicker/window bevels, material flags and attached morning-window lamp',lighting:'RGB ambient/sky/window bake on every source cell',normalAtlas:'paired packing, timing, pivot and exact alpha',constructionReplay:{cell:'0,0',records:read(join(publish,'replay.json')).records.length}},proof:{source:'actual exported atlas',matte:'#ecdab9',durationMs:proof.durationMs,driftMs:proof.gif.driftMs,pixelComparison:proof.gif.pixelComparison,scaleReason:'2× full-loop GIF stays inside tool bounds; all 80 poses separately reviewed at native and 4×'},unusedFrames:[],integrity});
console.log(JSON.stringify({ok:true,published:'site/assets/cozy-cat',review:relative(root,review).split(sep).join('/'),sourceFrames:80,durationMs:8000,proofFrames:proof.frameCount,gif:proof.gif.pixelComparison},null,2));
