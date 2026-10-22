import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../scripts/managed-runtime.js';
import {actions} from './poses.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const launcher=join(root,'scripts/run-managed.js');
const runtime=resolveRuntime(root);
const require=createRequire(join(runtime.root,'package.json'));
const {createCanvas,loadImage}=require('canvas');
const read=(path)=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const run=(...args)=>{
  const result=execFileSync(process.execPath,[launcher,...args,'--json'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  const value=JSON.parse(result);
  if(value.ok===false)throw new Error(result);
  return value;
};
const publish=resolve(root,'site/assets/tessel');
if(!relative(root,publish).startsWith(`site${sep}assets${sep}tessel`))throw new Error('Unexpected publication directory');
mkdirSync(publish,{recursive:true});
mkdirSync(join(here,'.reviews'),{recursive:true});
const review=mkdtempSync(join(here,'.reviews/review-'));
const built=run('build',join(here,'sprite-project.json'));
write(join(here,'.raw-build.json'),built);
const dist=join(here,'dist');
copyFileSync(join(dist,'tessel.png'),join(publish,'sheet.png'));
copyFileSync(join(dist,'tessel.normal.png'),join(publish,'normal.png'));
// Compact only serialization; retain every editable shape and embedded replay record.
writeFileSync(join(publish,'project.json'),JSON.stringify(read(join(dist,'tessel.project.json')))+'\n');
writeFileSync(join(publish,'replay.json'),JSON.stringify(read(join(dist,'construction-replay.json')))+'\n');
const atlas=read(join(dist,'tessel.atlas.json'));
atlas.meta.image='sheet.png';
atlas.meta.normalMap.image='normal.png';
atlas.meta.normalMap.atlas='normal.atlas.json';
write(join(publish,'atlas.json'),atlas);
const normal=read(join(dist,'tessel.normal.atlas.json'));
normal.meta.image='normal.png';
normal.meta.colorImage='sheet.png';
normal.meta.normalEncoding.image='normal.png';
normal.meta.normalEncoding.atlas='normal.atlas.json';
write(join(publish,'normal.atlas.json'),normal);
const verification=run('verify',join(publish,'atlas.json'),'--report',join(review,'verification.json'));
const normalVerification=run('verify',join(publish,'normal.atlas.json'),'--report',join(review,'normal-verification.json'));
write(join(here,'.raw-verification.json'),{verification,normalVerification});

// Proofs are always made in new directories. Existing source and earlier reviews survive.
const proofs={};
const portableReport=(out,dest,config)=>{
  const report=read(join(out,'proof.json'));
  for(const track of report.tracks){track.atlas=relative(dest,track.atlas).split(sep).join('/');track.image=relative(dest,track.image).split(sep).join('/');}
  for(const input of report.provenance.inputs)input.path=relative(dest,input.path).split(sep).join('/');
  mkdirSync(join(dest,'frames'),{recursive:true});
  for(const name of readdirSync(join(out,'frames')))copyFileSync(join(out,'frames',name),join(dest,'frames',name));
  report.artifacts={gif:dest===publish?'montage.gif':'scene.gif',contact:dest===publish?'montage-contact.png':'contact.png',frames:report.artifacts.frames.map(path=>`frames/${path.split(/[\\/]/).at(-1)}`),report:'proof.json'};
  report.publication={paths:'Relocated to portable paths; GIF pixels, timings and input hashes are unchanged.',input:relative(dest,config).split(sep).join('/')};
  write(join(dest,'proof.json'),report);
  return report;
};
for(const action of actions){
  const dest=join(publish,'actions',action.id);
  mkdirSync(dest,{recursive:true});
  const config=join(dest,'proof-input.json');
  write(config,{version:1,canvas:{w:64,h:64},scale:4,matte:'#171d2c',tracks:[{name:action.id,atlas:'../../atlas.json',tag:`${action.id}_right`,x:32,y:55,anchor:'pivot'}]});
  const out=join(review,action.id);
  run('atlas-proof',config,'--out',out);
  copyFileSync(join(out,'proof.gif'),join(dest,'scene.gif'));
  copyFileSync(join(out,'frames','0000.png'),join(dest,'poster.png'));
  copyFileSync(join(out,'contact.png'),join(dest,'contact.png'));
  proofs[action.id]=portableReport(out,dest,config);
}
const montageConfig=join(publish,'proof-input.json');
write(montageConfig,{version:1,canvas:{w:256,h:128},scale:2,matte:'#171d2c',loop:true,tracks:actions.map((a,i)=>({name:a.id,atlas:'atlas.json',tag:`${a.id}_right`,x:32+(i%4)*64,y:55+Math.floor(i/4)*64,anchor:'pivot',loop:true}))});
const montageOut=join(review,'montage');
run('atlas-proof',montageConfig,'--out',montageOut);
copyFileSync(join(montageOut,'proof.gif'),join(publish,'montage.gif'));
copyFileSync(join(montageOut,'frames','0000.png'),join(publish,'poster.png'));
copyFileSync(join(montageOut,'contact.png'),join(publish,'montage-contact.png'));
portableReport(montageOut,publish,montageConfig);

// Source-cell reviews contain all 128 cells once, at 1× and 4×.
const sheet=await loadImage(join(publish,'sheet.png'));
for(const scale of [1,4]){
  const canvas=createCanvas(512*scale,1024*scale),ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#929298';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(sheet,0,0,canvas.width,canvas.height);
  writeFileSync(join(review,`source-${scale}x.png`),canvas.toBuffer('image/png'));
}
for(let row=0;row<16;row++){
  const canvas=createCanvas(2048,256),ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;ctx.fillStyle='#929298';ctx.fillRect(0,0,2048,256);
  ctx.drawImage(sheet,0,row*64,512,64,0,0,2048,256);
  writeFileSync(join(review,`source-row-${String(row).padStart(2,'0')}-4x.png`),canvas.toBuffer('image/png'));
}
// Pairing is checked structurally and against the actual decoded alpha planes.
const ci=await loadImage(join(publish,'sheet.png')),ni=await loadImage(join(publish,'normal.png'));
const alpha=(image)=>{const c=createCanvas(image.width,image.height),x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,c.width,c.height).data;};
const cd=alpha(ci),nd=alpha(ni);
if(cd.length!==nd.length)throw new Error('Normal dimensions differ');
for(let i=3;i<cd.length;i+=4)if(cd[i]!==nd[i])throw new Error(`Normal alpha differs at ${i}`);
const frameContract=(value)=>JSON.stringify({frames:value.frames,tags:value.meta.frameTags,slices:value.meta.slices,size:value.meta.size});
if(frameContract(atlas)!==frameContract(normal))throw new Error('Normal packing, timing or pivot differs');
const source=read(join(publish,'project.json'));
const replay=read(join(publish,'replay.json'));
const cells=Object.values(source.cells);
const sources=read(join(dist,'sprite-manifest.json')).build.inputs.map(input=>{
  const bytes=readFileSync(resolve(here,input.path));
  const rawSha256=createHash('sha256').update(bytes).digest('hex');
  if(rawSha256!==input.sha256||(input.bytes!==undefined&&input.bytes!==bytes.length))throw new Error(`Source input changed after build: ${input.path}`);
  const text=/\.(?:[cm]?js|json|md|txt|ya?ml|html?|css|svg|ts|pxl)$/i.test(input.path);
  return {...input,bytes:input.bytes??bytes.length,...(text?{normalizedTextSha256:createHash('sha256').update(bytes.toString('utf8').replace(/\r\n?/g,'\n')).digest('hex')}:{})};
});
const walkFiles=(folder,prefix='')=>readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walkFiles(join(folder,item.name),`${prefix}${item.name}/`):[`${prefix}${item.name}`]);
const fileNames=walkFiles(publish).filter(n=>n!=='manifest.json'&&n!=='.gitattributes');
const integrity=Object.fromEntries(fileNames.map(name=>{const bytes=readFileSync(join(publish,name));return[name,{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];}));
write(join(publish,'manifest.json'),{
  version:1,name:'Tessel the Foldback',width:64,height:64,pivot:{x:32,y:55},sourceCells:128,atlasEntries:atlas.frames.length,reviewScale:4,
  actions:actions.map(a=>({id:a.id,tags:{right:`${a.id}_right`,left:`${a.id}_left`},loop:a.loop,durationMs:a.durations.reduce((x,y)=>x+y,0),holdsMs:a.durations})),
  palette:read(join(here,'palette.json')),
  tools:{producer:'agent-sprites',version:runtime.version,composition:'named reusable foot and shell parts; independent editable copies',timing:'per-cell exact milliseconds',surfaces:'retained dome/bevel/flat normals, solid materials, attached emissive face lamp',lighting:'RGB ambient/sky and face lamp on every source cell',normalAtlas:'paired rectangles, timing, pivot and exact alpha checked',constructionReplay:{cell:'0,0',records:replay.records.length}},
  sourceInputs:sources,unusedFrames:[],
  proof:{source:'exported atlas',matte:'#171d2c',actionGifs:'own tag loop policy',montage:'all eight real tags forced to repeat together for a 1600 ms comparison; individual one-shots retain their policy',quantization:'Measured decoded GIF palette changes and error are in each proof.json; PNG/atlas is authoritative.'},
  integrity
});
console.log(JSON.stringify({ok:true,review:relative(root,review).split(sep).join('/'),published:'site/assets/tessel',actions:Object.keys(proofs),sourceCells:cells.length,atlasEntries:atlas.frames.length,replayRecords:replay.records.length},null,2));
