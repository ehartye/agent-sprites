import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const kinds = ['farm', 'engineering', 'space', 'relay', 'settlement', 'assembly', 'robot', 'shipyard', 'orchard', 'inspection', 'evacuation', 'relocation', 'teleport', 'animals', 'network', 'meal'];
const safe = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const color = { sky:'#142c3c', ground:'#45645b', dark:'#213b46', green:'#6ca967', light:'#bbdb94', gold:'#efc76a', coral:'#d88b70', teal:'#57b4b0', pale:'#e7e0c4', grey:'#91a5a6' };

export function validatePanels(panels) {
  if (!Array.isArray(panels) || !panels.length) throw Error('Input must be a nonempty panel array.');
  const ids = new Set(), scenes = new Map();
  for (const panel of panels) {
    if (!panel || typeof panel !== 'object' || Array.isArray(panel)) throw Error('Each panel must be an object.');
    if (typeof panel.id !== 'string' || !safe.test(panel.id) || ids.has(panel.id.toLowerCase())) throw Error('Panel IDs must be unique filename-safe strings (case-insensitive).');
    ids.add(panel.id.toLowerCase());
    if (typeof panel.scene !== 'string' || !panel.scene.trim()) throw Error(`Missing scene for ${panel.id}.`);
    if (!kinds.includes(panel.kind)) throw Error(`Unsupported kind for ${panel.id}: ${panel.kind}`);
    if (!(typeof panel.stage === 'string' && panel.stage.trim()) && !(Number.isInteger(panel.stage) && panel.stage >= 1 && panel.stage <= 3)) throw Error(`Stage for ${panel.id} must be a label or 1, 2, 3.`);
    if (panel.caption !== undefined && typeof panel.caption !== 'string') throw Error(`Caption for ${panel.id} must be text.`);
    if (!scenes.has(panel.scene)) scenes.set(panel.scene, []);
    scenes.get(panel.scene).push(panel);
  }
  for (const [scene, entries] of scenes) {
    if (entries.length !== 3 || new Set(entries.map(p => String(p.stage))).size !== 3) throw Error(`Scene ${scene} needs exactly three distinct stages.`);
    const numeric = entries.filter(p => typeof p.stage === 'number').length;
    if (numeric && numeric !== 3) throw Error(`Scene ${scene} cannot mix numeric stages and labels.`);
    if (numeric === 3) entries.sort((a,b) => a.stage-b.stage);
  }
  return scenes;
}

/** Semantic named shapes, composed back-to-front; captions remain story metadata. */
export function generateScene(panels, name = 'storyboard') {
  validatePanels(panels);
  if (new Set(panels.map(p => p.scene)).size !== 1) throw Error('generateScene takes one scene.');
  if (!safe.test(name)) throw Error('Project name must be filename safe.');
  const entries = [...validatePanels(panels).values()][0];
  const ops = [{command:'new',name,size:'256x144',rows:1,cols:3,palette:'db-32'}];
  for (const [stage, panel] of entries.entries()) {
    const cell=`0,${stage}`;
    ops.push({command:'clear',cell},{command:'name',cell,as:panel.id});
    const draw=(type,name,params,c)=>ops.push({command:'draw',type,cell,name,...params,color:c,filled:true});
    const rect=(name,x,y,w,h,c)=>draw('rect',name,{x,y,w,h},c);
    const poly=(name,points,c)=>draw('polygon',name,{points},c);
    const ellipse=(name,cx,cy,rx,ry,c)=>draw('ellipse',name,{cx,cy,rx,ry},c);
    const line=(name,x1,y1,x2,y2,c)=>draw('line',name,{x1,y1,x2,y2},c);
    const person=(n,x,y,action=false)=>{
      rect(`${n}_legs`,x-4,y-9,3,10,color.dark);rect(`${n}_leg2`,x+2,y-9,3,10,color.dark);
      rect(`${n}_body`,x-5,y-22,11,14,color.coral);ellipse(`${n}_head`,x,y-27,5,5,color.pale);
      rect(`${n}_arm`,x+5,y-21,action?14:3,3,color.pale);
    };
    const bot=(n,x,y,action=false)=>{
      rect(`${n}_left_foot`,x-10,y-4,8,5,color.dark);rect(`${n}_right_foot`,x+3,y-4,8,5,color.dark);
      rect(`${n}_body`,x-9,y-25,18,21,color.grey);rect(`${n}_head`,x-11,y-34,22,10,color.teal);
      rect(`${n}_eyes`,x-6,y-31,4,2,color.gold);rect(`${n}_eye2`,x+3,y-31,4,2,color.gold);
      rect(`${n}_arm`,x+9,y-24,action?20:5,4,color.grey);
    };
    const plant=(n,x,y,growth=stage)=>{
      ellipse(`${n}_soil`,x,y,17,5,color.dark);
      if(growth===0){ellipse(`${n}_seed`,x,y-5,5,4,color.gold);return;}
      rect(`${n}_stem`,x-1,y-24-growth*7,3,25+growth*7,color.light);
      ellipse(`${n}_leaf_left`,x-8,y-18,9,4,color.green);ellipse(`${n}_leaf_right`,x+8,y-28,9,4,color.green);
      if(growth===2)ellipse(`${n}_fruit`,x,y-43,8,7,color.gold);
    };
    const pod=(n,x,y,active=stage>0)=>{
      ellipse(`${n}_outer`,x,y-25,17,30,color.teal);ellipse(`${n}_opening`,x,y-25,12,24,active?color.light:color.dark);
      line(`${n}_root_l`,x-7,y,x-16,y+10,color.green);line(`${n}_root_r`,x+7,y,x+16,y+10,color.green);
    };
    const ship=(n,x,y,scale=1,ready=stage===2)=>{
      const pts=[[-55,0],[-35,-22],[28,-19],[62,0],[28,19],[-35,22]].map(([dx,dy])=>[Math.round(x+dx*scale),Math.round(y+dy*scale)]);
      poly(`${n}_hull`,pts,color.teal);
      ellipse(`${n}_cabin`,x+10*scale,y,23*scale,8*scale,color.pale);
      ellipse(`${n}_core`,x-31*scale,y,9*scale,9*scale,ready?color.gold:color.dark);
      line(`${n}_rib1`,x-8*scale,y-19*scale,x-8*scale,y+19*scale,color.green);
      if(ready)poly(`${n}_thrust`,[[x-55*scale,y-8*scale],[x-79*scale,y],[x-55*scale,y+8*scale]],color.gold);
    };
    const hut=(n,x,y)=>{
      rect(`${n}_wall`,x,y-35,36,35,color.grey);poly(`${n}_roof`,[[x-5,y-35],[x+18,y-53],[x+41,y-35]],color.green);
      rect(`${n}_door`,x+13,y-21,10,21,color.dark);rect(`${n}_window`,x+4,y-26,6,7,color.gold);
    };
    const arrow=(n,x,y)=>{rect(`${n}_shaft`,x,y-2,22,4,color.gold);poly(`${n}_tip`,[[x+22,y-7],[x+31,y],[x+22,y+7]],color.gold);};
    rect('sky',0,0,256,144,color.sky);
    for(let i=0;i<10;i++)rect(`star_${i}`,12+i*24,12+(i*17)%35,1,1,color.grey);
    rect('ground',0,112,256,32,color.ground);
    rect('ground_edge',0,112,256,3,color.light);
    // Three unobtrusive beat markers; no prose or unapproved story lore baked into pixels.
    for(let i=0;i<3;i++)rect(`stage_${i}`,10+i*9,132,6,4,i===stage?color.gold:color.dark);
    switch(panel.kind){
      case 'farm':
        for(let i=0;i<4;i++){rect(`bed_${i}`,60+i*40,109,31,7,color.dark);plant(`crop_${i}`,76+i*40,109);}
        person('farmer',30+stage*17,112,stage===1);if(stage===2)rect('harvest_basket',29,95,24,17,color.gold);break;
      case 'orchard':
        for(let i=0;i<3;i++){rect(`tree_${i}_trunk`,60+i*65,73,5,39,color.coral);ellipse(`tree_${i}_crown`,62+i*65,67,27,29,color.green);if(stage>0)for(let j=0;j<3;j++)ellipse(`tree_${i}_fruit_${j}`,47+i*65+j*14,65+(j%2)*14,4,4,color.gold);}
        person('picker',stage===0?24:100,112,stage===1);if(stage===2)rect('fruit_crate',102,96,35,16,color.gold);break;
      case 'engineering':
        rect('workbench',51,101,155,10,color.grey);ellipse('propulsion_socket',145,73,30,28,color.teal);ellipse('engine_core',145,73,15,15,stage===2?color.gold:color.dark);
        if(stage<2)ellipse('loose_component',stage===0?75:118,stage===0?92:73,11,11,color.gold);
        person('engineer',stage===0?30:94,112,stage===1);if(stage===2)arrow('power',182,71);break;
      case 'space':
        rect('space_ground',0,112,256,32,color.sky);ellipse('destination_world',218,75,27,27,color.green);
        ship('civilian_ship',68+stage*34,78,0.8,stage>0);break;
      case 'settlement':
        hut('home_left',24,112);hut('home_right',182,112);plant('public_component',135,110,stage);
        person('visitor',83,112,stage===1);person('resident',163,112,stage===2);break;
      case 'assembly':
        rect('assembly_table',42,101,165,10,color.grey);plant('grown_part',139,100,stage);bot('assembler',66,112,stage===1);
        if(stage===2){rect('assembled_machine',172,72,26,29,color.teal);ellipse('working_wheel',185,87,8,8,color.gold);}break;
      case 'robot':
        bot('helper',stage===0?70:122,112,stage===1);plant('task_crop',171,112,stage);
        if(stage===2){rect('delivered_crate',49,93,29,19,color.gold);person('recipient',82,112,true);}break;
      case 'shipyard':
        rect('dock',24,116,209,8,color.grey);for(let i=0;i<3;i++)rect(`scaffold_${i}`,40+i*77,42,3,74,color.dark);
        if(stage===0){plant('hull_seed',123,111,0);poly('hull_ribs',[[70,100],[102,65],[156,65],[192,100]],color.green);}
        else {ship('grown_ship',129,77,1.15,stage===2);if(stage===1)bot('shipbuilder',41,112,true);}break;
      case 'inspection':
        plant('component',155,107,2);person('inspector',81,112,stage===1);
        ellipse('scan_outer',136,71,23,23,color.grey);ellipse('scan_inner',136,71,19,19,color.sky);plant('scan_crop',145,95,stage===2?2:1);
        line('scan_handle',119,88,102,105,color.grey);if(stage===2)poly('approval',[[193,78],[201,86],[217,61],[222,65],[203,95],[188,83]],color.light);break;
      case 'relay':
        for(let i=0;i<3;i++){rect(`tower_${i}`,40+i*84,59,6,53,color.grey);ellipse(`antenna_${i}`,43+i*84,55,10,5,color.teal);}
        if(stage>0){line('link_a',43,55,127,55,color.gold);if(stage===2)line('link_b',127,55,211,55,color.gold);}person('operator',92,112,stage===1);break;
      case 'network':
        for(const [i,x,y] of [[0,60,47],[1,196,47],[2,60,104],[3,196,104]])ellipse(`seed_${i}`,x,y,10,10,color.teal);
        if(stage>0){line('connection_top',60,47,196,47,color.gold);line('connection_direct',60,47,196,104,color.gold);}
        if(stage===2){line('connection_bottom',60,104,196,104,color.light);line('connection_other_direct',60,104,196,47,color.light);line('connection_left',60,47,60,104,color.light);line('connection_right',196,47,196,104,color.light);}break;
      case 'teleport':
        pod('departure',69,106,stage>0);pod('arrival',196,106,stage>0);
        person('traveler',stage===0?34:stage===1?69:223,112,stage===0);
        if(stage>0){arrow('direct_crossing',114,71);if(stage===1)rect('crossing_spark',68,71,3,28,color.gold);}break;
      case 'evacuation':
        ship('rescue_ship',188,63,.8,stage===2);rect('boarding_ramp',161,86,16,28,color.grey);
        for(let i=0;i<(stage===2?1:4);i++)person(`evacuee_${i}`,stage===0?30+i*24:stage===1?66+i*23:162,112,stage===1);
        if(stage>0)arrow('boarding_direction',94,78);if(stage===2)for(let i=0;i<3;i++)rect(`passenger_window_${i}`,182+i*7,59,3,7,color.coral);break;
      case 'relocation':
        hut('new_home',177,112);ship('arrival_ship',stage===0?80:55,stage===0?65:85,.6,stage===0);
        person('arriving_resident',stage===0?120:stage===1?147:191,112,stage===1);if(stage===2){plant('new_local_crop',143,112,2);person('neighbor',226,112);}break;
      case 'animals':
        for(let i=0;i<3;i++){const x=55+i*70;ellipse(`animal_${i}_body`,x,100,15,8,color.pale);rect(`animal_${i}_head`,x+11,88,10,12,color.pale);rect(`animal_${i}_ear`,x+15,82,3,8,color.coral);for(let j=0;j<2;j++)rect(`animal_${i}_leg_${j}`,x-9+j*16,105,3,7,color.dark);rect(`animal_${i}_eye`,x+18,92,2,2,color.dark);}
        if(stage>0){rect('feed_trough',65,117,123,10,color.gold);person('caretaker',stage===1?22:234,112,stage===1);}break;
      case 'meal':
        rect('table_top',51,94,154,7,color.coral);rect('table_leg_l',64,101,5,18,color.dark);rect('table_leg_r',191,101,5,18,color.dark);
        person('cook',26,112,stage===1);if(stage>0)for(let i=0;i<3;i++)ellipse(`food_bowl_${i}`,87+i*39,92,10,4,color.gold);
        if(stage===2){person('guest_l',80,90,true);person('guest_m',125,90,true);person('guest_r',175,90,true);}break;
    }
  }
  return ops;
}

const run=(launcher,args)=>{
  const result=spawnSync(process.execPath,[launcher,...args],{encoding:'utf8',windowsHide:true});
  if(result.error || result.status!==0)throw Error(`Managed sprite command failed: ${args[0]}\n${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
};

export function renderPanels(panels, { launcher, out }) {
  const scenes=validatePanels(panels);
  if(!launcher || !existsSync(launcher))throw Error('Supply the absolute installed plugin scripts/run-managed.js path.');
  launcher=resolve(launcher);out=resolve(out);mkdirSync(out,{recursive:true});
  const sourceDir=join(out,'_sources');mkdirSync(sourceDir,{recursive:true});
  const report={purpose:'Rough storyboard blocking, not final gameplay art',size:{w:768,h:432},panels:[],scenes:[],visualInspection:'pending'};
  for(const [scene,entries] of scenes){
    const name=`board-${createHash('sha256').update(scene).digest('hex').slice(0,12)}`;
    const sceneDir=join(sourceDir,name);mkdirSync(sceneDir,{recursive:true});
    const ops=generateScene(entries,name),opsPath=join(sceneDir,'operations.json');
    // Export the scene strip as provenance; individual view PNGs are the storyboard assets.
    ops.push({command:'export',dest:sceneDir});writeFileSync(opsPath,JSON.stringify(ops,null,2)+'\n');
    const batch=JSON.parse(run(launcher,['batch',opsPath,'--json']));
    if(!batch.ok)throw Error(`Batch failed for ${scene}.`);
    run(launcher,['verify',join(sceneDir,`${name}.atlas.json`),'--report',join(sceneDir,'verification.json'),'--contact-sheet',join(sceneDir,'contact-sheet.png'),'--json']);
    for(const [index,panel] of entries.entries()){
      const filename=`${panel.id}.png`,file=join(out,filename);
      run(launcher,['view','--cell',`0,${index}`,'--scale','3','--out',file]);
      const png=readFileSync(file);
      if(png.subarray(1,4).toString()!=='PNG'||png.readUInt32BE(16)!==768||png.readUInt32BE(20)!==432)throw Error(`Invalid landscape dimensions for ${panel.id}.`);
      report.panels.push({...panel,file:filename,cell:`0,${index}`,sha256:createHash('sha256').update(png).digest('hex')});
    }
    const hashes=report.panels.filter(p=>p.scene===scene).map(p=>p.sha256);
    if(new Set(hashes).size!==3)throw Error(`Repeated stage pixels for ${scene}.`);
    report.scenes.push({scene,project:name,ops:join('_sources',name,'operations.json'),structuralVerification:'passed'});
  }
  writeFileSync(join(out,'panels.manifest.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),input=args[0],out=args[args.indexOf('--out')+1],launcher=args[args.indexOf('--launcher')+1];
    if(!input||!args.includes('--out')||!args.includes('--launcher'))throw Error('Usage: node generate.mjs panels.json --out art --launcher /absolute/plugin/scripts/run-managed.js');
    const report=renderPanels(JSON.parse(readFileSync(input,'utf8')),{out,launcher});
    console.log(JSON.stringify({ok:true,panels:report.panels.length,scenes:report.scenes.length,out:resolve(out),visualInspection:report.visualInspection}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
