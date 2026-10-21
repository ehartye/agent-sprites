import { readFileSync, writeFileSync, openSync, closeSync, fstatSync, readdirSync, lstatSync, statSync, realpathSync, mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, isAbsolute, relative, sep, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import { atlasFrames, validateAtlas } from './atlas-verifier.js';
import { atlasSequence, composeTimeline, anchorPoint } from '../web/public/js/shared/atlas-timeline.js';

export const ATLAS_PROOF_LIMITS = Object.freeze({ maxTracks:16, maxSteps:4096, maxDurationMs:60000, maxLogicalSide:2048, maxScale:8, maxRasterPixels:64000000, maxContactSide:32767 });
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function fields(value, allowed, label) {
  if (!object(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
}
function bool(value, label) { if (value !== undefined && typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`); }
function localPath(value, label) {
  if (typeof value !== 'string' || !value.length || value.includes('\0') || isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('\\')) throw new Error(`${label} must be a relative local path.`);
  return value;
}
function absent(path) {
  try { lstatSync(path); } catch(e) { if (e.code === 'ENOENT') return; throw e; }
  throw new Error(`Output already exists: ${path}`);
}
function parseConfig(bytes) {
  let config; try { config = JSON.parse(bytes.toString('utf8')); } catch(e) { throw new Error(`Cannot parse proof config: ${e.message}`); }
  fields(config,['version','canvas','scale','loop','matte','tracks'],'config');
  if (config.version !== 1) throw new Error('Proof config version must be 1.');
  fields(config.canvas,['w','h'],'canvas');
  integer(config.canvas.w,1,2048,'canvas.w'); integer(config.canvas.h,1,2048,'canvas.h');
  integer(config.scale === undefined ? 1 : config.scale,1,8,'scale'); bool(config.loop,'loop');
  if (config.matte !== undefined && (typeof config.matte !== 'string' || !/^#[0-9a-f]{6}$/i.test(config.matte))) throw new Error('matte must be a #RRGGBB color.');
  if (!Array.isArray(config.tracks) || !config.tracks.length || config.tracks.length > 16) throw new Error('Proof requires 1 to 16 tracks.');
  const names = new Set();
  config.tracks.forEach((t,i) => {
    fields(t,['name','atlas','tag','frames','x','y','anchor','loop'],`tracks[${i}]`);
    if (typeof t.name !== 'string' || !t.name.length || names.has(t.name)) throw new Error('Track names must be unique nonempty strings.');
    names.add(t.name); localPath(t.atlas,`Track ${t.name} atlas`);
    if ((t.tag !== undefined) === (t.frames !== undefined)) throw new Error(`Track ${t.name} requires exactly one of tag or frames.`);
    if (t.tag !== undefined && (typeof t.tag !== 'string' || !t.tag.length)) throw new Error('Track tag must be a nonempty name.');
    if (t.frames !== undefined && (!Array.isArray(t.frames) || !t.frames.length || t.frames.length > 4096 || t.frames.some(f=>!(Number.isSafeInteger(f)&&f>=0) && !(typeof f==='string'&&f.length)))) throw new Error('Track frames requires 1 to 4096 integer indices or names.');
    integer(t.x === undefined ? 0 : t.x,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'Track x');integer(t.y === undefined ? 0 : t.y,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'Track y');
    bool(t.loop,'Track loop');
    if (object(t.anchor)) { fields(t.anchor,['x','y'],'anchor'); anchorPoint(t.anchor,1,1); }
    else if (t.anchor !== undefined && !['top-left','center','top-center','bottom-center','bottom-left','bottom-right','pivot'].includes(t.anchor)) throw new Error(`Unknown anchor: ${String(t.anchor)}`);
  });
  return config;
}
function pivotAt(atlas,index) {
  const slices = atlas.meta?.slices;
  const slice = Array.isArray(slices) && slices.find(s=>s.name==='pivot');
  if (!slice || !Array.isArray(slice.keys)) throw new Error(`Frame ${index} has no pivot slice.`);
  let selected;
  const seen = new Set();
  for (const key of slice.keys) {
    if (!object(key) || !Number.isSafeInteger(key.frame) || key.frame < 0 || seen.has(key.frame)) throw new Error('Pivot slice keys require unique nonnegative integer frames.');
    seen.add(key.frame);
    if (key.frame <= index && (!selected || key.frame > selected.frame)) selected=key;
  }
  if (!selected || !object(selected.bounds) || !object(selected.pivot)) throw new Error(`Frame ${index} has no requested pivot.`);
  const {bounds:b,pivot:p}=selected;
  if (![b.x,b.y,b.w,b.h,p.x,p.y].every(Number.isSafeInteger) || b.w<1 || b.h<1) throw new Error('Pivot slice bounds and hotspot must be integers; choose an explicit integer anchor for a fractional pivot.');
  const point={x:b.x+p.x,y:b.y+p.y};
  if (!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)) throw new Error('Pivot coordinates exceed safe integer bounds.');
  return point;
}
function contactLayout(count,w,h) {
  const gap=2,label=18,cardW=Math.max(w,96),cardH=h+label;
  let best;
  for(let columns=1;columns<=count;columns++) {
    const width=columns*(cardW+gap)+gap,height=Math.ceil(count/columns)*(cardH+gap)+gap;
    if(width>32767||height>32767)continue;
    const score=Math.max(width,height);
    if(!best||score<best.score)best={columns,width,height,cardW,cardH,gap,label,score};
  }
  if(!best)throw new Error('Contact sheet exceeds the 32767 pixel side limit; reduce scale or split the proof.');
  return best;
}
function quantizeDelays(steps) {
  let previous=0;
  return steps.map(step=>{
    const boundary=Math.round((step.atMs+step.durationMs)/10)*10, delay=boundary-previous;previous=boundary;
    if(delay<10||delay>655350)throw new Error('GIF interval is not representable at 10 ms resolution (zero or excessive encoded delay).');
    return delay;
  });
}

/** Render real atlas PNGs, verify the encoded GIF, then publish one new directory. */
export async function renderAtlasProof(configPath,{output}={}) {
  if(typeof configPath!=='string'||!configPath.length)throw new Error('A proof config path is required.');
  if(typeof output!=='string'||!output.length)throw new Error('A new output directory is required.');
  const requestedOutput=resolve(output);absent(requestedOutput);
  const parent=realpathSync(dirname(requestedOutput));
  if(!statSync(parent).isDirectory())throw new Error('Output parent must be an existing directory.');
  const destination=resolve(parent,basename(requestedOutput));absent(destination);
  const snapshots=new Map();
  const capture=path=>{
    const original=resolve(path),canonical=realpathSync(original),stat=statSync(canonical);
    if(!stat.isFile())throw new Error(`Input must be a local file: ${original}`);
    if(snapshots.has(original))return snapshots.get(original);
    const bytes=readFileSync(canonical),entry={path:original,canonical,bytes,sha256:sha256(bytes),size:bytes.length,dev:stat.dev,ino:stat.ino};
    snapshots.set(original,entry);return entry;
  };
  const configInput=capture(configPath),config=parseConfig(configInput.bytes),scale=config.scale??1;
  const inputs=new Map(),tracks=[];
  for(const t of config.tracks) {
    const atlasPath=resolve(dirname(configInput.path),t.atlas),input=capture(atlasPath);
    let source=inputs.get(atlasPath);
    if(!source) {
      let atlas;try{atlas=JSON.parse(input.bytes.toString('utf8'));}catch(e){throw new Error(`Cannot parse atlas ${t.atlas}: ${e.message}`);}
      localPath(atlas?.meta?.image,'Atlas meta.image');
      if(extname(atlas.meta.image).toLowerCase()!=='.png')throw new Error('Atlas meta.image must name a local PNG.');
      const imageInput=capture(resolve(dirname(atlasPath),atlas.meta.image));
      if(!imageInput.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error(`Expected PNG file bytes: ${imageInput.path}`);
      let metadata;try{metadata=await sharp(imageInput.bytes).metadata();}catch(e){throw new Error(`Cannot decode PNG: ${e.message}`);}
      if(metadata.format!=='png'||(metadata.pages??1)!==1)throw new Error('Atlas image must be a static PNG.');
      integer(metadata.width,1,2048,'Actual PNG width');integer(metadata.height,1,2048,'Actual PNG height');
      const checked=validateAtlas(atlas,{width:metadata.width,height:metadata.height});
      if(!checked.ok)throw new Error(`Invalid atlas ${t.atlas}: ${checked.errors.map(e=>`${e.path}: ${e.message}`).join('; ')}`);
      const frames=atlasFrames(atlas);
      for(const f of frames) {
        integer(f.duration,1,Number.MAX_SAFE_INTEGER,'Atlas frame duration');
        integer(f.sourceSize.w,1,2048,'Atlas source width');integer(f.sourceSize.h,1,2048,'Atlas source height');
      }
      source={atlas,frames,imageInput,width:metadata.width,height:metadata.height};inputs.set(atlasPath,source);
    }
    const sequence=atlasSequence(source.atlas,{...(t.tag!==undefined?{tag:t.tag}:{frames:t.frames})});
    const origins=new Map();
    for(const {index}of sequence) {
      const f=source.frames[index],pivot=t.anchor==='pivot'?pivotAt(source.atlas,index):undefined;
      const a=anchorPoint(t.anchor??'top-left',f.sourceSize.w,f.sourceSize.h,pivot);
      const origin={x:(t.x??0)-a.x,y:(t.y??0)-a.y};
      if(!Number.isSafeInteger(origin.x)||!Number.isSafeInteger(origin.y))throw new Error('Final frame origin must be a safe integer.');
      origins.set(index,origin);
    }
    const tagLoop=t.tag===undefined?undefined:source.atlas.meta?.frameTags?.find(tag=>tag.name===t.tag)?.loop;
    bool(tagLoop,'Atlas tag loop');
    tracks.push({...t,atlasPath,source,sequence,origins,loop:t.loop??tagLoop??true});
  }
  const timeline=composeTimeline(tracks,{loop:config.loop}),delays=quantizeDelays(timeline.steps);
  const count=timeline.steps.length,w=config.canvas.w,h=config.canvas.h,width=w*scale,height=h*scale;
  const layout=contactLayout(count,width,height);
  // Work budget: each unique PNG decode, each track's logical composite area,
  // canonical output + GIF encoding + GIF decoding, and the complete contact.
  const inputPixels=[...new Map([...inputs.values()].map(s=>[s.imageInput.canonical,s])).values()].reduce((n,s)=>n+s.width*s.height,0);
  const rasterPixels=inputPixels+count*w*h*tracks.length+3*count*width*height+layout.width*layout.height;
  if(!Number.isSafeInteger(rasterPixels)||rasterPixels>64000000)throw new Error(`Proof raster work exceeds 64000000 pixel budget (${rasterPixels}). Reduce canvas, scale, tracks or timeline.`);
  const imageCache=new Map();
  for(const s of inputs.values()) {
    if(!imageCache.has(s.imageInput.canonical)) {
      const image=await loadImage(s.imageInput.bytes);
      if(!config.matte) {
        const scan=createCanvas(s.width,s.height),ctx=scan.getContext('2d');ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,s.width,s.height).data;
        for(let p=3;p<pixels.length;p+=4)if(pixels[p]!==0&&pixels[p]!==255)throw new Error('Partial alpha in an input PNG requires an explicit matte color.');
      }
      imageCache.set(s.imageInput.canonical,image);
    }
    s.image=imageCache.get(s.imageInput.canonical);
    if(s.image.width!==s.width||s.image.height!==s.height)throw new Error('PNG decoders disagree on image dimensions.');
  }
  let staging,ownedStaging,ownedStat,framesStat;
  const writtenArtifacts=new Map();
  const sameIdentity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
  const assertOwnedStaging=()=>{
    const entry=lstatSync(staging,{bigint:true});
    if(!entry.isDirectory()||entry.isSymbolicLink()||realpathSync(staging)!==ownedStaging||!sameIdentity(entry,ownedStat))throw new Error('Owned staging directory changed during proof rendering.');
    if(framesStat) {
      const frames=lstatSync(resolve(staging,'frames'),{bigint:true});
      if(!frames.isDirectory()||frames.isSymbolicLink()||!sameIdentity(frames,framesStat))throw new Error('Owned frames directory changed during proof rendering.');
    }
  };
  const writeArtifact=(name,value)=>{
    assertOwnedStaging();
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(value),path=resolve(staging,name);
    // Keep the identity from our exclusively created handle, rather than
    // adopting whatever entry happens to occupy the path after a write.
    const fd=openSync(path,'wx');
    let identity;
    try {
      identity=fstatSync(fd,{bigint:true});
      if(!identity.isFile()||identity.nlink!==1n)throw new Error(`Artifact is not a fresh regular file: ${name}`);
      writeFileSync(fd,bytes,{flag:'wx'});
    } finally { closeSync(fd); }
    writtenArtifacts.set(name,{identity,bytes:bytes.length,sha256:sha256(bytes)});
  };
  const verifyArtifacts=()=>{
    assertOwnedStaging();
    const matches=(actual,expected)=>actual.length===expected.length&&actual.every((name,i)=>name===expected[i]);
    const expectedRoot=['frames',...writtenArtifacts.keys()].filter(name=>!name.includes('/')).sort();
    const expectedFrames=[...writtenArtifacts.keys()].filter(name=>name.startsWith('frames/')).map(name=>name.slice('frames/'.length)).sort();
    if(!matches(readdirSync(staging).sort(),expectedRoot)||!matches(readdirSync(resolve(staging,'frames')).sort(),expectedFrames))throw new Error('Artifact inventory changed during proof rendering.');
    for(const [name,expected]of writtenArtifacts) {
      const path=resolve(staging,name),entry=lstatSync(path,{bigint:true});
      if(!entry.isFile()||entry.isSymbolicLink()||entry.nlink!==1n||!sameIdentity(entry,expected.identity)||entry.size!==BigInt(expected.bytes))throw new Error(`Artifact identity changed during proof rendering: ${name}`);
      const fd=openSync(path,'r');
      try {
        const opened=fstatSync(fd,{bigint:true});
        if(!opened.isFile()||opened.nlink!==1n||!sameIdentity(opened,expected.identity)||opened.size!==BigInt(expected.bytes)||sha256(readFileSync(fd))!==expected.sha256)throw new Error(`Artifact bytes changed during proof rendering: ${name}`);
      } finally { closeSync(fd); }
      const after=lstatSync(path,{bigint:true});
      if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1n||!sameIdentity(after,expected.identity)||after.size!==BigInt(expected.bytes))throw new Error(`Artifact identity changed during proof rendering: ${name}`);
    }
  };
  try {
    absent(destination);staging=mkdtempSync(resolve(parent,`.${basename(destination)}-staging-`));
    ownedStaging=realpathSync(staging);ownedStat=statSync(ownedStaging,{bigint:true});
    mkdirSync(resolve(staging,'frames'));framesStat=lstatSync(resolve(staging,'frames'),{bigint:true});
    const contact=createCanvas(layout.width,layout.height),cc=contact.getContext('2d');cc.imageSmoothingEnabled=false;
    cc.fillStyle='#333333';cc.fillRect(0,0,contact.width,contact.height);
    const logical=createCanvas(w,h),lc=logical.getContext('2d');lc.imageSmoothingEnabled=false;
    const scaled=createCanvas(width,height),sc=scaled.getContext('2d');sc.imageSmoothingEnabled=false;
    const stack=Buffer.alloc(count*width*height*4),frameNames=[];
    for(let i=0;i<count;i++) {
      lc.clearRect(0,0,w,h);
      if(config.matte){lc.fillStyle=config.matte;lc.fillRect(0,0,w,h);}
      tracks.forEach((track,j)=>{
        const index=timeline.steps[i].frames[j],f=track.source.frames[index],r=f.frame,s=f.spriteSourceSize,o=track.origins.get(index);
        lc.save();lc.translate(o.x+s.x,o.y+s.y);
        if(f.rotated){lc.translate(0,r.w);lc.rotate(-Math.PI/2);}
        lc.drawImage(track.source.image,r.x,r.y,r.w,r.h,0,0,r.w,r.h);lc.restore();
      });
      sc.clearRect(0,0,width,height);sc.drawImage(logical,0,0,width,height);
      const raw=sc.getImageData(0,0,width,height).data;
      for(let p=3;p<raw.length;p+=4)if(raw[p]!==0&&raw[p]!==255)throw new Error('Partial alpha cannot be represented in GIF; supply an explicit matte color.');
      stack.set(raw,i*width*height*4);
      const name=`frames/${String(i).padStart(4,'0')}.png`;frameNames.push(name);
      writeArtifact(name,scaled.toBuffer('image/png'));
      const x=layout.gap+(i%layout.columns)*(layout.cardW+layout.gap),y=layout.gap+Math.floor(i/layout.columns)*(layout.cardH+layout.gap);
      cc.clearRect(x,y,layout.cardW,height);cc.drawImage(scaled,x,y);
      cc.fillStyle='#111111';cc.fillRect(x,y+height,layout.cardW,layout.label);
      cc.fillStyle='#ffffff';cc.font='11px sans-serif';cc.fillText(`#${i} ${timeline.steps[i].atMs}ms +${timeline.steps[i].durationMs}`,x+2,y+height+13,layout.cardW-4);
    }
    writeArtifact('contact.png',contact.toBuffer('image/png'));
    const gif=await sharp(stack,{raw:{width,height:height*count,channels:4,pageHeight:height}}).gif({
      loop:timeline.loop?0:1,delay:delays,colours:256,dither:0,effort:7,reuse:false,
      keepDuplicateFrames:true,interFrameMaxError:0,interPaletteMaxError:0,
    }).toBuffer();
    writeArtifact('proof.gif',gif);
    const metadata=await sharp(gif,{animated:true}).metadata();
    const decoded=await sharp(gif,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const actualCount=metadata.pages??1,actualDelays=metadata.delay??[];
    if(actualCount!==count||decoded.info.width!==width||decoded.info.height!==height*count||actualDelays.length!==count||actualDelays.some((d,i)=>d!==delays[i]))throw new Error('Encoded GIF frame count, dimensions or delays differ from the proof.');
    if(timeline.loop?metadata.loop!==0:metadata.loop!==1)throw new Error('Encoded GIF loop behavior differs from the proof.');
    if(!timeline.loop&&gif.includes(Buffer.from('NETSCAPE2.0')))throw new Error('One-shot GIF unexpectedly contains a Netscape looping extension.');
    if(decoded.data.length!==stack.length)throw new Error('Encoded GIF decoded raster size differs from canonical frames.');
    let differentPixels=0,maxChannelError=0;
    for(let p=0;p<stack.length;p+=4) {
      if(stack[p+3]!==decoded.data[p+3])throw new Error('Encoded GIF failed to preserve binary alpha.');
      if(!stack[p+3])continue;
      let different=false;
      for(let c=0;c<3;c++){const delta=Math.abs(stack[p+c]-decoded.data[p+c]);if(delta)different=true;maxChannelError=Math.max(maxChannelError,delta);}
      if(different)differentPixels++;
    }
    const artifacts={gif:resolve(destination,'proof.gif'),contact:resolve(destination,'contact.png'),frames:frameNames.map(n=>resolve(destination,n)),report:resolve(destination,'proof.json')};
    const encodedDuration=delays.reduce((a,b)=>a+b,0);
    const report={ok:true,version:1,width,height,frameCount:count,durationMs:timeline.durationMs,loop:timeline.loop,scale,canvas:{w,h},matte:config.matte??null,
      timeline,gif:{loop:timeline.loop,pages:actualCount,delaysMs:actualDelays,durationMs:encodedDuration,requestedDurationMs:timeline.durationMs,driftMs:encodedDuration-timeline.durationMs,
        timing:timeline.steps.map((s,i)=>({atMs:s.atMs,requestedMs:s.durationMs,encodedMs:actualDelays[i],boundaryDriftMs:actualDelays.slice(0,i+1).reduce((a,b)=>a+b,0)-s.atMs-s.durationMs})),
        pixelComparison:{exact:differentPixels===0,differentPixels,maxChannelError,transparentPixels:'RGB ignored where alpha is zero'},paletteLimit:256},
      contact:{tiles:count,columns:layout.columns,width:layout.width,height:layout.height},
      limits:{...ATLAS_PROOF_LIMITS,rasterPixels,rasterFormula:'unique PNG pixels + steps * logical canvas pixels * tracks + 3 * steps * scaled canvas pixels + contact pixels'},
      tracks:tracks.map(t=>({name:t.name,atlas:t.atlasPath,image:t.source.imageInput.path,loop:t.loop,sequence:t.sequence,origins:[...t.origins].map(([index,origin])=>({index,...origin}))})),
      provenance:{inputs:[...snapshots.values()].map(s=>({path:s.path,sha256:s.sha256,bytes:s.size}))},artifacts};
    writeArtifact('proof.json',JSON.stringify(report,null,2)+'\n');
    for(const s of snapshots.values()) {
      let current;
      try {const identity=statSync(s.path);current=realpathSync(s.path)===s.canonical&&identity.dev===s.dev&&identity.ino===s.ino&&sha256(readFileSync(s.path))===s.sha256;}catch{current=false;}
      if(!current)throw new Error(`Input changed during proof rendering: ${s.path}`);
    }
    // Recheck ownership before publication or cleanup; never follow a replaced link.
    const parentNow=realpathSync(dirname(requestedOutput));
    if(parentNow!==parent)throw new Error('Output parent changed during proof rendering.');
    verifyArtifacts();
    absent(destination);renameSync(staging,destination);staging=undefined;
    return report;
  } finally {
    if(staging) {
      // Only the freshly created, resolved sibling staging directory is ours.
      const rel=relative(parent,staging);
      if(rel&&!isAbsolute(rel)&&!rel.startsWith(`..${sep}`)&&!rel.includes(sep)&&basename(staging).startsWith(`.${basename(destination)}-staging-`)) {
        let entry;try{entry=lstatSync(staging,{bigint:true});}catch(e){if(e.code!=='ENOENT')throw e;}
        if(entry&&!entry.isSymbolicLink()&&realpathSync(staging)===ownedStaging&&entry.dev===ownedStat?.dev&&entry.ino===ownedStat?.ino)rmSync(staging,{recursive:true,force:true});
      }
    }
  }
}
