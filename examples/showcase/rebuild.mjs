import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..');
const args=process.argv.slice(2),launcherFlag=args.indexOf('--launcher');
const launcher=launcherFlag<0?resolve(repo,'scripts/run-managed.js'):resolve(args[launcherFlag+1]);
if(launcherFlag>=0)args.splice(launcherFlag,2);
const all=['night-station','glasshouse','ember-workshop','dusk-shrine'];
const selected=args.length?args:all;
if(selected.some(slug=>!all.includes(slug)))throw new Error(`Choose scene slugs from: ${all.join(', ')}`);
const env={...process.env,SPRITE_PORT:process.env.SPRITE_PORT??'14794'};
const run=(...command)=>{
  const result=spawnSync(process.execPath,[launcher,...command,'--json'],{cwd:repo,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:600_000,windowsHide:true});
  if(result.error||result.status!==0)throw new Error(result.error?.message??`${command[0]} failed: ${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
};
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');

mkdirSync(resolve(here,'.reviews'),{recursive:true});
for(const slug of selected) {
  process.stdout.write(`Building ${slug} through the managed runtime…\n`);
  const build=run('build',resolve(here,`${slug}.build.json`));
  if(build.ok!==true)throw new Error(`Build did not verify ${slug}`);
  const review=resolve(here,`.reviews/${slug}-${Date.now()}`);
  const report=run('atlas-proof',resolve(here,`${slug}.proof.json`),'--out',review);
  if(!report.ok||report.frameCount!==32||report.gif.driftMs!==0||!report.loop)throw new Error(`Incomplete animation proof: ${slug}`);
  const output=resolve(repo,'site/assets/scenes',slug);
  // The publication is a portable selection. Raw build/proof receipts with local
  // ownership paths stay in ignored directories; the art and measured proof ship.
  mkdirSync(output,{recursive:true});
  const raw=resolve(here,'.build',slug);
  copyFileSync(resolve(raw,`${slug}.png`),resolve(output,'sheet.png'));
  copyFileSync(resolve(review,'proof.gif'),resolve(output,'scene.gif'));
  copyFileSync(resolve(review,'frames/0000.png'),resolve(output,'poster.png'));
  copyFileSync(resolve(review,'contact.png'),resolve(output,'contact.png'));
  const atlas=json(resolve(raw,`${slug}.atlas.json`));
  atlas.meta.image='sheet.png';
  save(resolve(output,'atlas.json'),atlas);
  const project=json(resolve(raw,`${slug}.project.json`));
  // The isolated build has no live-session destination. Assert that before
  // copying instead of attempting to redact an unknown editable schema.
  const projectText=JSON.stringify(project);
  if(/(?:^|["\s])[A-Za-z]:[\\/]|\\\\Users\\\\|\/Users\//.test(projectText))throw new Error('Editable project unexpectedly contains a machine path.');
  writeFileSync(resolve(output,'project.json'),JSON.stringify(project)+'\n');
  const recipe=json(resolve(here,`${slug}.json`));
  const portable={
    ok:report.ok,version:1,scene:slug,title:recipe.title,
    canvas:report.canvas,scale:report.scale,width:report.width,height:report.height,
    frameCount:report.frameCount,durationMs:report.durationMs,loop:report.loop,
    timeline:report.timeline,gif:report.gif,contact:report.contact,
    source:{config:`../../../../examples/showcase/${slug}.build.json`,palette:recipe.palette,motion:recipe.motion},
    tracks:[{name:report.tracks[0].name,atlas:'atlas.json',image:'sheet.png',tag:'ambience',loop:true}],
    files:{gif:'scene.gif',poster:'poster.png',sheet:'sheet.png',atlas:'atlas.json',project:'project.json',contact:'contact.png'},
    integrity:Object.fromEntries(['scene.gif','poster.png','sheet.png','atlas.json','project.json','contact.png'].map(name=>[name,{sha256:hash(resolve(output,name)),bytes:readFileSync(resolve(output,name)).length}]))
  };
  const serialized=JSON.stringify(portable);
  if(/(?:^|["\s])[A-Za-z]:[\\/]|\\\\Users\\\\|\/Users\//.test(serialized))throw new Error('Portable proof unexpectedly contains a machine path.');
  save(resolve(output,'proof.json'),portable);
  process.stdout.write(`${slug}: ${report.frameCount} frames, ${report.durationMs} ms, GIF error ${report.gif.pixelComparison.maxChannelError}, ${relative(repo,output).split(sep).join('/')}\n`);
}
