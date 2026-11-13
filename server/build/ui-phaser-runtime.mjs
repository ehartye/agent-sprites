import {layoutUiUnclipped,prepareUiLayout,prepareUnclippedUiLayout,inspectUiLayoutMemo} from './ui-layout.mjs';
import {validateUiTree} from './ui-components.mjs';
import {createUiInteraction} from './ui-interaction.mjs';
import {iterateNineSliceTiles, planNineSlice, placeBitmapText, projectPixelRect, quantizePhysicalRect} from './ui-runtime.mjs';
import {copyUiData, freezeUiData, snapshotUiData, publishUiData, isUiSnapshot, resolveThemeRole, uiId, uiRect, uiKeys} from './ui-theme.mjs';

const stable = value => JSON.stringify(value);
// Exact private shape keys retain optional own values and signed zero. Node IDs
// alone are omitted; IDs in ordinary data are never rewritten or normalized.
function exactPassiveKey(value) {
  return JSON.stringify(value,(_key,v)=>v===undefined?'~passive:u':typeof v==='number'&&Object.is(v,-0)?'~passive:-0':typeof v==='string'&&v.startsWith('~passive:')?'~passive:s:'+v:v);
}
const passiveShapeLimit=32768,passiveActiveKeyLimit=1048576;
function passiveShapeKey(node,available) {
  // Bound encoding BEFORE stringify. The charge includes worst-case JSON
  // escaping and typed marker expansion; oversized valid shapes compile normally.
  let left=Math.min(passiveShapeLimit,available);
  const take=n=>(left-=n)>=0;
  function charge(value) {
    if(typeof value==='string')return take((value.length+12)*6+4);
    if(value===null||typeof value!=='object')return take(64);
    if(!take(4))return false;
    for(const [key,v]of Object.entries(value))if(!take(key.length*6+4)||!charge(v))return false;
    return true;
  }
  function shape(n) {
    if(!take(32))return;
    const data={};
    for(const [key,value]of Object.entries(n))if(key!=='id'&&key!=='children'){
      if(!take(key.length*6+4)||!charge(value))return;
      data[key]=value;
    }
    const children=[];
    for(const child of n.children){const value=shape(child);if(!value)return;children.push(value);}
    return {...data,children};
  }
  const value=shape(node);return value?exactPassiveKey(value):undefined;
}
function rebindPassive(template,tree,rawTree,shapeKey,count,letters) {
  const ids=new Map();
  function zip(a,b){ids.set(a.id,b.id);a.children.forEach((child,i)=>zip(child,b.children[i]));}
  zip(template.templateTree,tree);
  if(ids.size!==template.records.length||template.records.some(r=>!ids.has(r.id)))throw new TypeError('Invalid passive template topology');
  return {...template,tree:rawTree,templateTree:tree,shapeKey,nodes:count,glyphs:letters,
    records:template.records.map(r=>({...r,id:ids.get(r.id),parentId:r.parentId===null?null:ids.get(r.parentId)})),
    commands:template.commands.map(c=>{if(!ids.has(c.recordId)||!c.key.startsWith(c.recordId+':'))throw new TypeError('Invalid passive command identity');return {...c,recordId:ids.get(c.recordId),key:ids.get(c.recordId)+c.key.slice(c.recordId.length)};})};
}
let hostIdentity = 0; // Identity only, never a texture, renderer or game cache.
function intersect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x,b.x), y = Math.max(a.y,b.y);
  const width = Math.min(a.x+a.width,b.x+b.width)-x, height = Math.min(a.y+a.height,b.y+b.height)-y;
  return width > 0 && height > 0 ? {x,y,width,height} : null;
}
function color(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`Native UI color requires #RRGGBB: ${value}`);
  return parseInt(value.slice(1),16);
}
const appearanceStates = ['hover','focus','pressed','disabled'];
const appearanceState = status => !status.enabled?'disabled':status.pressed?'pressed':status.hovered?'hover':status.focused?'focus':'normal';
function nativeStates(role,theme) {
  const states=role.placement?.nativeStates ?? {};
  uiKeys(states,appearanceStates,'native appearance states');
  for(const variant of Object.values(states)) {
    uiKeys(variant,['skin','tone','glyphTint','paintOffset','visible','opacity'],'native appearance variant');
    if(variant.skin!==undefined && !Object.hasOwn(theme.skins,variant.skin))throw new TypeError('Unknown native variant skin');
    if(variant.tone!==undefined && !theme.fonts[role.font]?.font.toneNames.includes(variant.tone))throw new TypeError('Unknown native variant tone');
    if(variant.glyphTint!==undefined){color(variant.glyphTint);if(!role.font)throw new TypeError('Variant glyph tint requires font');}
    if(variant.visible!==undefined && typeof variant.visible!=='boolean')throw new TypeError('Invalid native variant visibility');
    if(variant.opacity!==undefined && (!Number.isFinite(variant.opacity)||variant.opacity<0||variant.opacity>1))throw new RangeError('Native variant opacity must be finite and within 0..1');
    if(variant.paintOffset!==undefined){uiKeys(variant.paintOffset,['x','y'],'native paint offset');if(![variant.paintOffset.x,variant.paintOffset.y].every(Number.isFinite))throw new TypeError('Invalid native paint offset');}
  }
  return states;
}
// Compare every RGBA byte, including RGB below zero alpha. No guessed colors,
// approximate equality, atlas-wide assumptions or shorter repeat periods.
function constantAxis(plane,s,axis) {
  const {data,width}=plane;
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)for(let c=0;c<4;c++) {
    const a=((s.y+y)*width+s.x+x)*4+c;
    const b=((s.y+(axis==='y'?0:y))*width+s.x+(axis==='x'?0:x))*4+c;
    if(data[a]!==data[b])return false;
  }
  return true;
}
function tileWindow(d,p,clip) {
  const visible=intersect(d,clip);if(!visible)return null;
  return {x:Math.max(0,Math.floor((visible.x-d.x)/p.width)*p.width),y:Math.max(0,Math.floor((visible.y-d.y)/p.height)*p.height),right:Math.min(d.width,Math.ceil((visible.x+visible.width-d.x)/p.width)*p.width),bottom:Math.min(d.height,Math.ceil((visible.y+visible.height-d.y)/p.height)*p.height)};
}
function* skinTiles(plan,plane,clip) {
  const physical=plan.physicalPlan??plan, scale=physical.scale;
  const physicalClip=plan.resolution&&clip?projectPixelRect(plan.resolution,clip):clip;
  for(const region of physical.regions) {
    const {source:s,destination:d,period,tile,phase}=region;
    if(!intersect(d,physicalClip))continue;
    if(!plane || !tile || period.width!==s.width*scale || period.height!==s.height*scale || phase?.x || phase?.y) {
      // Iterate only original tile periods touching the clip. Aligned starts
      // preserve source phase without walking arbitrarily large hidden areas.
      const window=tile?tileWindow(d,period,physicalClip):null;
      const destination=window?{x:d.x+window.x,y:d.y+window.y,width:window.right-window.x,height:window.bottom-window.y}:d;
      const partial={...physical,regions:[{...region,destination}]};
      for(const q of iterateNineSliceTiles(partial))yield {...q,destination:plan.resolution?projectPixelRect(plan.resolution,q.destination,'to-local'):q.destination};
      continue;
    }
    const x=d.width>period.width && constantAxis(plane,s,'x'), y=d.height>period.height && constantAxis(plane,s,'y');
    const step={width:x?d.width:period.width,height:y?d.height:period.height},window=tileWindow(d,step,physicalClip);
    for(let oy=window.y;oy<window.bottom;oy+=step.height)for(let ox=window.x;ox<window.right;ox+=step.width) {
      const width=x?d.width:Math.min(period.width,d.width-ox),height=y?d.height:Math.min(period.height,d.height-oy);
      const destination={x:d.x+ox,y:d.y+oy,width,height};
      yield {source:{x:s.x,y:s.y,width:x?1:width/scale,height:y?1:height/scale},destination:plan.resolution?projectPixelRect(plan.resolution,destination,'to-local'):destination};
    }
  }
}
function ownership(failures) {
  let closed = false;
  const releases = new Set();
  function add(release) {
    if (closed) throw new Error('UI ownership scope is closed');
    if (typeof release !== 'function') throw new TypeError('Owned resource requires a release function');
    const once = () => {
      if (!releases.delete(once)) return;
      try{release();}catch(error){
        if(failures.length<32)failures.push(String(error?.message??error).slice(0,512));
        throw error;
      }
    };
    releases.add(once); return once;
  }
  const facade = Object.freeze({own(value, release) {add(()=>release(value));return value;},onDispose(release) {add(release);}});
  function drain() {
    if (closed) return; closed = true;
    const errors = [];
    for (const release of [...releases].reverse()) try {release();} catch(error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors,'UI cleanup failed');
  }
  return {facade, add, drain};
}

/** Stock native painter and lifecycle owner. No input subscriptions or game dispatch. */
export function createPhaserUi({scene, theme, ports, limits = {}}) {
  if (!scene?.add?.image || !scene.add.rectangle || !scene.events?.on || !scene.events.off || !ports?.resolveAsset || !ports.attachContext) throw new TypeError('Native scene and asset/context ports are required');
  if (theme?.format !== 'agent-sprites/ui-theme@1') throw new TypeError('Expected prepared UI theme');
  const budget = {objects:8192,fragments:4096,extensionRegions:256,sourceBytes:4194304,...limits};
  for (const value of Object.values(budget)) if (!Number.isInteger(value) || value < 1) throw new RangeError('Native budgets must be positive integers');
  const registry = new Map(), mounts = new Set(), prefix = `shared-ui:${++hostIdentity}`;
  let disposed = false, mountIdentity = 0, subscribed = false;
  function shutdown() {
    const errors=[];
    for(const m of [...mounts])try{m.dispose();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'UI scene cleanup failed');
  }
  function mountInternal(snapshot, {parent, scope, policy} = {}, passive = false) {
    if (disposed) throw new Error('UI instance is disposed');
    if(passive&&!isUiSnapshot(theme))throw new TypeError('Passive preparation requires a certified immutable theme');
    uiId(scope,'Scope ID',true);
    if (!parent?.add) throw new TypeError('Native parent is required');
    if ([...mounts].some(m=>m.scope === scope)) throw new TypeError(`Duplicate native scope ${scope}`);
    let lifecycle = 'mounted', plan, interaction, created = 0, destroyed = 0, frameIdentity = 0;
    const failures = [], owner = ownership(failures), objects = new Map(), fragments = new Map(), attachments = new Map(), extensions = new Map();
    const textureIds = new WeakMap(), sourceIds=new WeakMap(); let textureIdentity = 0, sourceIdentity=0, planes=new Map();
    const mountPrefix = `${prefix}:${++mountIdentity}`;
    let passiveCache=new Map(), passiveAccepted, preparations=0, textMemo;
    function prepare(next,feedback,original,admission) {
      // Layout has already admitted this complete immutable plan. Stock painting
      // only builds commands; retain the plan until an extension adds records.
      // This is invocation-local sharing, with no cache or new trust boundary.
      let draft = original;
      const contexts = new Map(original.contexts.map(c=>[c.id,c])), commands = [], extensionPlans = [];
      const ids = new Set(draft.records.map(r=>r.id));
      function asset(request) {
        const result = ports.resolveAsset(Object.freeze(request));
        if (result?.ownership !== 'borrowed' || !result.texture?.get || !result.texture.get('__BASE')?.clone || !Number.isInteger(result.sourceIndex ?? 0) || (result.sourceIndex ?? 0) < 0 || !result.texture.source?.[result.sourceIndex??0]) throw new TypeError(`Expected borrowed ${request.kind} asset ${request.id}`);
        const texture=result.texture,sourceIndex=result.sourceIndex??0,source=texture.source[sourceIndex];
        if(typeof source!=='object'||source===null)throw new TypeError('Expected native texture source identity');
        let plane;
        if(ports.readSourceRGBA) {
          plane=admission.planes.get(source)??planes.get(source);
          if(plane && (plane.texture!==texture || plane.sourceIndex!==sourceIndex))throw new TypeError('Source identity reused by another asset');
          if(plane && !admission.planes.has(source)){
            const bytes=plane.data.byteLength;
            if(bytes>budget.sourceBytes-admission.bytes)throw new RangeError('Source RGBA byte budget exceeded');
            admission.planes.set(source,plane);admission.bytes+=bytes;
          }else if(!plane) {
            const input=ports.readSourceRGBA(Object.freeze({...request,texture,sourceIndex,source,maxBytes:budget.sourceBytes-admission.bytes}));
            if(input!==null && input!==undefined) {
              const {width,height,data}=input;
              if(input.source!==source || !Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||width!==source.width||height!==source.height)throw new TypeError('Invalid or stale source RGBA identity/dimensions');
              const bytes=width*height*4;
              if(!Number.isSafeInteger(bytes)||bytes>budget.sourceBytes-admission.bytes)throw new RangeError('Source RGBA byte budget exceeded');
              if(!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)||data.byteLength!==bytes||typeof SharedArrayBuffer!=='undefined'&&data.buffer instanceof SharedArrayBuffer)throw new TypeError('Invalid source RGBA byte plane');
              plane={texture,sourceIndex,width,height,data:new Uint8Array(data)};admission.planes.set(source,plane);admission.bytes+=bytes;
            }
          }
        }
        return {texture,sourceIndex,source,plane};
      }
      for (const record of original.records) {
        const commandStart=commands.length;
        const baseRole = resolveThemeRole(theme, record.variant ? `${record.appearanceRole}.${record.variant}` : record.appearanceRole);
        const states=nativeStates(baseRole,theme), status=feedback.get(record.metadata?.['ui:stateOwner']??record.id)??record;
        const state=appearanceState(status);
        const variant=states[state]??{}, role={...baseRole,...variant};
        const context = contexts.get(record.semanticContextId);
        const edgePixels=role.edge?.width===undefined?1:role.edge.width*context.localToPhysical.scale;
        if(!Number.isInteger(edgePixels)||edgePixels<1)throw new RangeError('Native edge.width must be positive and align to whole physical pixels');
        for (const value of Object.values(role.colors ?? {})) color(value);
        function rect(key,bounds,paint,colorValue,extra={}) {
          if (colorValue === undefined) return;
          commands.push({key:`${record.id}:${key}`,kind:'rectangle',bounds,contextId:paint.contextId,clip:paint.clipBounds,color:color(colorValue),recordId:record.id,opacity:role.opacity??1,...extra});
        }
        function image(key,source,destination,paint,borrowed,tint=0xffffff) {
          uiRect(source,'native source');uiRect(destination,'native destination');
          if (!source.width || !source.height || ![source.x,source.y,source.width,source.height].every(Number.isInteger)) throw new TypeError('Atlas fragments require positive whole source pixels');
          if(borrowed.plane && (source.x<0||source.y<0||source.x+source.width>borrowed.plane.width||source.y+source.height>borrowed.plane.height))throw new RangeError('Source fragment exceeds RGBA plane');
          // Keep the complete logical plan, but reserve native images only for
          // ink that can reach this context's clip. Include state offsets before
          // culling so a pressed glyph can enter the viewport at its boundary.
          const painted=variant.paintOffset?{...destination,x:destination.x+variant.paintOffset.x,y:destination.y+variant.paintOffset.y}:destination;
          if(paint.clipBounds!==undefined && !intersect(painted,paint.clipBounds))return;
          commands.push({key:`${record.id}:${key}`,kind:'image',source,bounds:destination,contextId:paint.contextId,clip:paint.clipBounds,asset:borrowed,recordId:record.id,tint,opacity:role.opacity??1});
        }
        function glyphs(key,part) {
          const borrowed = part.placement.draws.length ? asset({kind:'font',id:role.font,tone:role.tone}) : null;
          part.placement.draws.forEach((draw,i)=>{
            const frame=theme.fonts[role.font].font.glyphs[draw.resolvedChar].frames[role.tone];
            const original=theme.fonts[role.font].font.glyphs[draw.resolvedChar].frames[baseRole.tone];
            if(frame.source.width!==original.source.width||frame.source.height!==original.source.height||stable(frame.offset)!==stable(original.offset))throw new TypeError('Variant tone must retain authored glyph geometry');
            image(`${key}:glyph:${i}`,frame.source,draw.destination,part,borrowed,role.glyphTint===undefined?0xffffff:color(role.glyphTint));
          });
        }
        function feedbackFor(control) {
          if (!control.focusable && !control.actionId) return;
          const bounds = quantizePhysicalRect(projectPixelRect(context,control.focusBounds),{mode:'inside'});
          // Partition in physical pixels: corners and tiny allocations paint
          // once even with translucent feedback. Semantic bounds stay continuous.
          const top=Math.min(edgePixels,bounds.height),bottom=Math.min(edgePixels,bounds.height-top);
          const left=Math.min(edgePixels,bounds.width),right=Math.min(edgePixels,bounds.width-left),middle=bounds.height-top-bottom;
          const borders=[{...bounds,height:top},{...bounds,y:bounds.y+bounds.height-bottom,height:bottom},
            {x:bounds.x,y:bounds.y+top,width:left,height:middle},{x:bounds.x+bounds.width-right,y:bounds.y+top,width:right,height:middle}];
          borders.forEach((b,i)=>commands.push({key:`${control.id}:feedback:${i}`,kind:'rectangle',bounds:projectPixelRect(context,b,'to-local'),contextId:context.id,clip:control.clipBounds,recordId:control.id,feedback:role.colors??{},focusWhenDisabled:role.edge?.focusWhenDisabled===true,opacity:role.opacity??1}));
        }
        // Selections are below lettering, after the authored face.
        const rank = p => ['flat','skin'].includes(p.kind)?0:p.kind==='selection'?1:2;
        const parts = [...record.parts].sort((a,b)=>rank(a)-rank(b));
        const counts = {};
        parts.forEach(part=>{
          const key = `${part.kind}:${counts[part.kind]=(counts[part.kind]??0)+1}`, c = contexts.get(part.contextId);
          if (part.kind === 'flat') rect(key,part.bounds,part,part.color);
          else if (part.kind === 'skin') {
            const skin=variant.skin===undefined?part.appearance.skin:theme.skins[variant.skin],bounds=part.plan.requestedLayoutBounds;
            for(const alternative of Object.values(states))if(alternative.skin!==undefined){const s=theme.skins[alternative.skin];if(bounds.width<s.minWidth*c.sourceToLocalScale||bounds.height<s.minHeight*c.sourceToLocalScale)throw new RangeError('Variant skin minimum geometry exceeds allocation');}
            let skinPlan=part.plan;
            if(variant.skin!==undefined){
              skinPlan=planNineSlice({frame:{x:skin.frame.x,y:skin.frame.y,w:skin.frame.width,h:skin.frame.height},insets:skin.insets},bounds,{resolution:c});
              const policy=p=>({...p,regions:p.regions.filter(r=>skin.center!=='omit'||r.row!==1||r.column!==1).map(r=>({...r,tile:skin.tile&&r.tile}))});
              skinPlan={...policy(skinPlan),physicalPlan:policy(skinPlan.physicalPlan)};
            }
            const borrowed = asset({kind:'skin',id:variant.skin??part.appearance.id});let i = 0;
            if(borrowed.plane){const s=skin.frame;if(s.x<0||s.y<0||s.x+s.width>borrowed.plane.width||s.y+s.height>borrowed.plane.height)throw new RangeError('Skin frame exceeds RGBA source');}
            const clip=variant.paintOffset&&part.clipBounds?{...part.clipBounds,x:part.clipBounds.x-variant.paintOffset.x,y:part.clipBounds.y-variant.paintOffset.y}:part.clipBounds;
            for (const quad of skinTiles(skinPlan,borrowed.plane,clip)) {
              image(`${key}:tile:${i++}`,quad.source,quad.destination,part,borrowed);
              if (commands.length > budget.objects) throw new RangeError('Native object budget exceeded by skin tiles');
            }
          } else if (part.kind === 'text' || part.kind === 'composition') glyphs(key,part);
          else if (part.kind === 'tab') {
            rect(`${key}:selected`,part.bounds,part,role.colors?.selected,{active:part.selected});glyphs(key,part);
            rect(`${key}:disabled`,{...part.bounds,height:1/c.localToPhysical.scale},part,role.colors?.disabled,{active:!part.enabled});
          } else if (part.kind === 'selection' || part.kind === 'caret') rect(key,part.bounds,part,role.colors?.[part.kind],{focusedOnly:true});
          else if (part.kind === 'progress' || part.kind === 'meter') {
            let track=part.track, fill=part.fill;
            if(part.caps){
              const axis=part.caps.axis??'x',dimension=axis==='x'?'width':'height',pixel=c.physicalPixelsPerSourcePixel;
              // The prepared track is already pixel-aligned. Restore integer
              // physical geometry before reserving caps or dividing periods;
              // local-space round trips can represent 28 as 27.999999999999996.
              const physical=quantizePhysicalRect(projectPixelRect(c,track),{mode:'nearest'});
              physical[axis]+=part.caps.start*pixel;
              physical[dimension]=Math.max(0,physical[dimension]-(part.caps.start+part.caps.end)*pixel);
              const period=part.caps.period*pixel;
              const periods=physical[dimension]*part.fraction/period,nearest=Math.round(periods);
              // Normalized values (for example 29 / 100) can multiply to one
              // ULP below an exact period. Snap only within the arithmetic's
              // small relative error bound; genuinely fractional periods floor.
              const count=Math.abs(periods-nearest)<=4*Number.EPSILON*Math.max(1,Math.abs(periods))?nearest:Math.floor(periods);
              const extent=count*period;
              track=projectPixelRect(c,physical,'to-local');
              fill=projectPixelRect(c,{...physical,[dimension]:extent},'to-local');
            }
            rect(`${key}:track`,track,part,role.colors?.track);rect(`${key}:fill`,fill,part,role.colors?.fill);
          } else if (part.kind === 'indicator') {
            const size = Math.min(part.bounds.width,part.bounds.height);
            if (role.icons?.[part.checked?'checked':'unchecked']) {
              const id = role.icons[part.checked?'checked':'unchecked'], metadata = theme.icons?.[id];
              if (!metadata?.frame) throw new TypeError(`Missing indicator icon ${id}`);
              image(key,metadata.frame,{...part.bounds,width:metadata.frame.width*c.sourceToLocalScale,height:metadata.frame.height*c.sourceToLocalScale},part,asset({kind:'icon',id}));
            } else rect(key,{...part.bounds,width:size,height:size},part,role.colors?.indicator,{active:part.checked});
          } else if (part.kind === 'separator') rect(key,part.bounds,part,role.colors?.separator);
          else if (part.kind === 'adjust') {
            const unit = 1/c.localToPhysical.scale;
            const anchor=projectPixelRect(c,quantizePhysicalRect(projectPixelRect(c,{x:part.bounds.x+part.bounds.width/2,y:part.bounds.y+part.bounds.height/2,width:0,height:0}),{mode:'nearest'}),'to-local');
            const {x,y}=anchor;
            const ink = part.enabled ? role.colors?.adjust : role.colors?.disabled;
            rect(`${key}:minus`,{x:x-unit,y,width:3*unit,height:unit},part,ink);
            rect(`${key}:plus`,{x,y:y-unit,width:unit,height:3*unit},part,ink,{active:part.delta>0});
          } else if (part.kind === 'icon') {
            const source = part.metadata.frame;
            if (!source) throw new TypeError(`Icon ${part.asset} requires an atlas frame rectangle`);
            const borrowed=asset({kind:'icon',id:part.asset});
            if(admission.iconPlacements?.has(record.id)&&!admission.iconBindings.has(record.id))admission.iconBindings.set(record.id,borrowed);
            image(key,source,{...part.bounds,width:source.width*c.sourceToLocalScale,height:source.height*c.sourceToLocalScale},part,borrowed);
          } else throw new TypeError(`Unsupported stock paint part ${part.kind}`);
        });
        if(record.kind==='itemSlot' && record.quantity!==undefined){
          if(!role.font)throw new TypeError('Item quantity requires a font role');
          const c=contexts.get(record.labelContextId??record.semanticContextId);
          const bounds=projectPixelRect(c,projectPixelRect(context,record.contentBounds),'to-local');
          const clip=record.contentClipBounds&&projectPixelRect(c,projectPixelRect(context,record.contentClipBounds),'to-local');
          glyphs('quantity',{contextId:c.id,clipBounds:clip,placement:placeBitmapText(theme.fonts[role.font].font,String(record.quantity),bounds.x,bounds.y+Math.max(0,bounds.height-theme.fonts[role.font].font.lineHeight*c.sourceToLocalScale),{resolution:c,tone:role.tone,policy:theme.fonts[role.font].policy,align:'right',maxWidth:bounds.width,maxHeight:bounds.height})});
        }
        feedbackFor(record);
        for(const command of commands.slice(commandStart).filter(command=>!command.feedback)) {
          if(variant.paintOffset){
            const scale=contexts.get(command.contextId).localToPhysical.scale;
            if(![variant.paintOffset.x*scale,variant.paintOffset.y*scale].every(Number.isInteger))throw new RangeError('Native paint offset must align to physical pixels');
            command.bounds=uiRect({...command.bounds,x:command.bounds.x+variant.paintOffset.x,y:command.bounds.y+variant.paintOffset.y},'native offset destination');
          }
          if(variant.visible===false)command.active=false;
        }
        if (record.extension && record.state !== 'hidden') {
          const definition = registry.get(record.extension.id), allocation = freezeUiData({controlId:record.id,enabled:record.enabled,bounds:record.extension.allocation,clipBounds:record.extension.clipBounds,context,contextRevisions:record.contextRevisions});
          const regions = copyUiData(definition.regions?.(record.extension.model,allocation) ?? []);
          if (stable(regions) !== stable(copyUiData(definition.regions?.(record.extension.model,allocation) ?? []))) throw new TypeError('Extension regions must be deterministic');
          if (!Array.isArray(regions) || regions.length+draft.records.length-original.records.length > budget.extensionRegions) throw new RangeError('Extension region budget exceeded');
          let regionIndex=draft.records.findIndex(r=>r.id===record.id)+1;
          for (const region of regions) {
            uiKeys(region,['id','bounds','actionId','label','enabled','focusable','role'],'extension region');uiId(region.id,'Region ID');uiRect(region.bounds);
            for (const key of ['enabled','focusable']) if (region[key] !== undefined && typeof region[key] !== 'boolean') throw new TypeError('Invalid extension region state');
            if (region.actionId !== undefined) uiId(region.actionId,'Region action');
            if (region.label !== undefined && typeof region.label !== 'string') throw new TypeError('Invalid extension label');
            const id = `${record.id}:${region.id}`;
            if (ids.has(id)) throw new TypeError(`Duplicate extension control ${id}`);ids.add(id);
            const clipped = intersect(intersect(region.bounds,allocation.bounds),allocation.clipBounds);
            const control={...record,id,kind:'button',role:region.role ?? 'button',label:region.label,enabled:record.enabled && region.enabled !== false,focusable:region.focusable ?? !!region.actionId,actionId:region.actionId,
              bounds:region.bounds,hitBounds:region.bounds,focusBounds:region.bounds,clipBounds:intersect(allocation.bounds,allocation.clipBounds),effectiveHitBounds:clipped,effectiveFocusBounds:clipped,state:clipped && record.state==='visible'?'visible':'clipped',parts:[],extension:undefined};
            if(draft===original)draft={...original,records:[...original.records]};
            draft.records.splice(regionIndex++,0,control);feedbackFor(control);
          }
          extensionPlans.push({id:record.id,definition,model:record.extension.model,allocation,extensionId:record.extension.id});
        }
      }
      if (commands.length > budget.objects) throw new RangeError('Native object budget exceeded');
      if(new Set(commands.filter(c=>c.kind==='image').map(frameKey)).size>budget.fragments)throw new RangeError('Native fragment budget exceeded');
      return {plan:draft===original?original:publishUiData(draft),commands,extensionPlans};
    }
    function compilePassive(raw) {
      // Copy descriptor-based raw input before any semantic reads; certified
      // immutable trees may be shared but never confer passive authority.
      const next=snapshotUiData(raw);
      uiKeys(next,['revision','context','items'],'passive snapshot');
      if(!Number.isSafeInteger(next.revision)||next.revision<0||passiveAccepted&&next.revision<=passiveAccepted.revision)throw new RangeError('Passive revisions must strictly increase');
      uiKeys(next.context,['id','revision','localToPhysical','sourcePixelPhysicalSize','viewport'],'passive context');
      const context=next.context;
      uiId(context.id,'Context ID',true);uiRect(context.viewport);
      if(!Number.isSafeInteger(context.revision)||context.revision<0)throw new RangeError('Invalid passive context revision');
      uiKeys(context.localToPhysical,['x','y','scale'],'passive mapping');
      const mapping=stable({...context,revision:0});
      if(passiveAccepted && (context.id!==passiveAccepted.context.id||context.revision<passiveAccepted.context.revision||context.revision===passiveAccepted.context.revision&&mapping!==passiveAccepted.mapping))throw new TypeError('Stale or changed same-revision passive context');
      if(!Array.isArray(next.items)||next.items.length>budget.objects)throw new RangeError('Passive item budget exceeded');
      const templateMapping=exactPassiveKey({...context,revision:0}),templates=new Map();
      // Only prior accepted active entries participate; no historical or global
      // shape cache. One entry per exact shape keeps lookup independent of N.
      if(passiveAccepted?.templateMapping===templateMapping)for(const entry of passiveCache.values())if(entry.shapeKey!==undefined&&!templates.has(entry.shapeKey))templates.set(entry.shapeKey,entry);
      const cache=new Map(),ids=new Set(),commands=[],records=[],admission={planes:new Map(),bytes:0};
      let nodes=0,glyphs=0,newPreparations=0,keyUnits=0,resolved,candidateTextMemo=textMemo;
      const move=(r,x,y)=>r==null?r:uiRect({...r,x:r.x+x,y:r.y+y},'retained translation');
      const clip=(r,x,y)=>r===undefined?context.viewport:intersect(move(r,x,y),context.viewport);
      function reserve(command) {
        if(command.kind!=='image')return;
        const {texture,sourceIndex,source,plane}=command.asset;
        if(texture.source[sourceIndex]!==source||plane&&(source.width!==plane.width||source.height!==plane.height))throw new TypeError('Stale source identity for retained native art');
        if(plane&&!admission.planes.has(source)){admission.bytes+=plane.data.byteLength;if(admission.bytes>budget.sourceBytes)throw new RangeError('Source RGBA byte budget exceeded');admission.planes.set(source,plane);}
      }
      for(const item of next.items) {
        uiKeys(item,['id','tree','x','y'],'passive item');uiId(item.id);
        if(![item.x,item.y].every(Number.isFinite))throw new TypeError('Passive translations must be finite');
        const prior=passiveCache.get(item.id),sameMapping=passiveAccepted?.mapping===mapping;
        let entry=prior;
        const scale=context.localToPhysical.scale;
        if(!entry||entry.tree!==item.tree||!sameMapping||!Number.isInteger((item.x-entry.x)*scale)||!Number.isInteger((item.y-entry.y)*scale)) {
          const tree=validateUiTree(item.tree);let count=0,letters=0,eligible=true;
          function check(node) {
            if(!['absolute','panel','text','notice'].includes(node.kind)||node.focusable||node.actionId!==undefined||node.focus!==undefined||node.regions!==undefined||node.metadata?.['ui:stateOwner']!==undefined||[node.contextId,node.skinContextId,node.labelContextId].some(id=>id!==undefined&&id!==context.id))throw new TypeError('Passive annotations cannot own controls, focus, regions, extensions or extra contexts');
            const role=resolveThemeRole(theme,node.variant?node.appearanceRole+'.'+node.variant:node.appearanceRole);
            if(Object.keys(nativeStates(role,theme)).length||role.appearance&&role.appearance.kind!=='flat')throw new TypeError('Passive annotations require stock text and flat paint without state variants');
            if(!['absolute','text'].includes(node.kind)||node.kind==='text'&&node.children.length||[node.metadata,node.paneId,node.focus,node.regions].some(v=>v!==undefined)||['scroll','paginate'].includes(node.layout.overflow))eligible=false;
            if(++count>budget.objects||(letters+=node.label?.length??0)>budget.objects)throw new RangeError('Passive preparation budget exceeded');
            for(const child of node.children)check(child);
          }
          check(tree);if(tree.id!==item.id)throw new TypeError('Passive item ID must equal its root ID');
          // Layout keeps all source ink, including offscreen glyphs. Translation
          // happens before stationary viewport clipping, using the same painter.
          const shapeKey=eligible?passiveShapeKey(tree,passiveActiveKeyLimit-keyUnits):undefined,template=shapeKey===undefined?undefined:templates.get(shapeKey);
          if(template&&Number.isInteger((item.x-template.x)*scale)&&Number.isInteger((item.y-template.y)*scale))entry=rebindPassive(template,tree,item.tree,shapeKey,count,letters);
          else {
            const positioned={...tree,layout:{...tree.layout,x:(tree.layout.x??0)+item.x,y:(tree.layout.y??0)+item.y}};
            const layout=prepareUnclippedUiLayout(positioned,{theme,revision:next.revision,context},candidateTextMemo),original=layout.plan;candidateTextMemo=layout.memo;
            const prepared=prepare(next,new Map(),original,admission);
            entry={tree:item.tree,templateTree:tree,shapeKey,x:item.x,y:item.y,records:prepared.plan.records,commands:prepared.commands,context:prepared.plan.contexts[0],nodes:count,glyphs:letters};newPreparations++;
          }
        }
        nodes+=entry.nodes;glyphs+=entry.glyphs;
        if(nodes>budget.objects||glyphs>budget.objects)throw new RangeError('Passive preparation budget exceeded');
        for(const r of entry.records){if(ids.has(r.id))throw new TypeError('Duplicate passive node ID '+r.id);ids.add(r.id);}
        if(entry.shapeKey!==undefined){
          if(entry.shapeKey.length>passiveActiveKeyLimit-keyUnits)entry={...entry,shapeKey:undefined};
          else keyUnits+=entry.shapeKey.length;
        }
        cache.set(item.id,entry);resolved=entry.context;
        const dx=item.x-entry.x,dy=item.y-entry.y;
        for(const r of entry.records){
          const bounds=move(r.bounds,dx,dy),clipped=clip(r.clipBounds,dx,dy),effective=r.state==='hidden'?null:intersect(bounds,clipped);
          records.push({...r,bounds,hitBounds:move(r.hitBounds,dx,dy),focusBounds:move(r.focusBounds,dx,dy),clipBounds:clipped,contentBounds:move(r.contentBounds,dx,dy),contentClipBounds:clip(r.contentClipBounds,dx,dy),effectiveHitBounds:effective,effectiveFocusBounds:effective,paintBounds:move(r.paintBounds,dx,dy),semanticContextId:context.id,contextRevisions:{[context.id]:context.revision},state:r.state==='hidden'?'hidden':effective?'visible':'clipped',parts:[]});
        }
        for(const command of entry.commands){reserve(command);const bounds=move(command.bounds,dx,dy),clipped=clip(command.clip,dx,dy);if(intersect(bounds,clipped))commands.push({...command,bounds,clip:clipped});}
      }
      // Validate even empty batches through the shared context/layout boundary.
      if(!resolved)resolved=layoutUiUnclipped({kind:'absolute',id:'passive:empty',appearanceRole:next.items[0]?.tree.appearanceRole??Object.keys(theme.roles)[0],children:[],layout:{}},{theme,revision:next.revision,context}).contexts[0];
      if(commands.length>budget.objects)throw new RangeError('Native object budget exceeded');
      if(new Set(commands.filter(c=>c.kind==='image').map(frameKey)).size>budget.fragments)throw new RangeError('Native fragment budget exceeded');
      return {plan:{format:'agent-sprites/ui-layout@1',revision:next.revision,themeId:theme.id,contexts:[{...resolved,revision:context.revision}],focus:{},records},commands,extensionPlans:[],planes:admission.planes,cache,accepted:{revision:next.revision,context,mapping,templateMapping},preparations:preparations+newPreparations,textMemo:candidateTextMemo};
    }
    // This draft port retains only active, already-admitted icon leaves. Raw
    // themes remain supported by full publication, never by retained placement.
    function iconPlacementInventory(current) {
      const entries=new Map(),root=current.records[0],context=current.contexts.find(c=>c.id===root?.semanticContextId);
      if(!isUiSnapshot(theme)||!root||root.kind!=='absolute'||root.parentId!==null||!context||root.state==='hidden')return entries;
      const l=root.layout,view=context.viewport;
      if(Object.keys(l).some(k=>!['x','y','width','height','padding','overflow'].includes(k))||(l.x??0)!==0||(l.y??0)!==0||(l.padding??0)!==0||l.overflow!=='clip')return entries;
      if(['x','y','width','height'].some(k=>root.bounds[k]!==view[k]||root.contentBounds[k]!==view[k]))return entries;
      const parents=new Set(current.records.map(r=>r.parentId));
      for(const record of current.records) {
        // Inventory is bounded by the current accepted plan, not visible objects.
        // Clipped leaves must remain eligible to enter a small native budget.
        if(record.kind!=='icon'||record.parentId!==root.id||parents.has(record.id)||record.focusable||!record.enabled||record.paneId!=='main')continue;
        if(['actionId','focus','regions','metadata','label','variant','hidden','selected'].some(k=>record[k]!==undefined))continue;
        if(Object.keys(record.layout).some(k=>!['x','y','width','height'].includes(k))||![record.layout.width,record.layout.height].every(n=>Number.isFinite(n)&&n>0))continue;
        if(record.semanticContextId!==context.id||Object.entries(record.contextRevisions).some(([id,revision])=>id!==context.id||revision!==context.revision))continue;
        if(current.focus?.order?.includes(record.id)||['initialId','defaultId','cancelId'].some(k=>current.focus?.[k]===record.id))continue;
        if(record.parts.length!==1||record.parts[0].kind!=='icon'||Object.keys(nativeStates(resolveThemeRole(theme,record.appearanceRole),theme)).length)continue;
        entries.set(record.id,{record,context});
      }
      return entries;
    }
    function validateVariantBudgets(current,byState) {
      const maximum=current.records.reduce((n,r)=>n+Math.max(...[...byState.values()].map(groups=>groups.get(r.id).length)),0);
      if(maximum>budget.objects)throw new RangeError('Native variant object budget exceeded');
      const ownerVariants=new Map(),allFrames=new Set();
      for(const [state,groups]of byState)for(const record of current.records){
        const ownerId=record.metadata?.['ui:stateOwner']??record.id;
        if(!ownerVariants.has(ownerId))ownerVariants.set(ownerId,new Map());
        const variants=ownerVariants.get(ownerId);if(!variants.has(state))variants.set(state,new Set());
        for(const command of groups.get(record.id))if(command.kind==='image'){
          const key=frameKey(command);variants.get(state).add(key);allFrames.add(key);
        }
      }
      const ownerMaximum=[...ownerVariants.values()].reduce((n,variants)=>n+Math.max(...[...variants.values()].map(keys=>keys.size)),0);
      if(Math.min(allFrames.size,ownerMaximum)>budget.fragments)throw new RangeError('Native variant fragment budget exceeded');
    }
    function validateSourceIdentity(asset) {
      const {texture,sourceIndex,source,plane}=asset;
      if(texture.source[sourceIndex]!==source||plane&&(source.width!==plane.width||source.height!==plane.height))throw new TypeError('Stale source identity for compiled native art');
    }
    function compileIconPlacements(raw) {
      const base=compiled,basePlan=plan,next=snapshotUiData(raw);
      const currentBase=()=>{if(lifecycle!=='mounted'||compiled!==base||plan!==basePlan)throw new Error('Icon placement base changed during preparation');};
      uiKeys(next,['expectedRevision','revision','items'],'icon placements');
      if(!Number.isSafeInteger(next.expectedRevision)||next.expectedRevision!==basePlan.revision||!Number.isSafeInteger(next.revision)||next.revision<=basePlan.revision)throw new RangeError('Stale or invalid icon placement revision');
      if(!isUiSnapshot(theme))throw new TypeError('Icon placement requires a certified immutable theme');
      if(!Array.isArray(next.items)||next.items.length>budget.objects)throw new RangeError('Icon placement item budget exceeded');
      const ids=new Set();
      // Finish compact request validation before invoking an asset port.
      for(const item of next.items){
        uiKeys(item,['id','x','y'],'icon placement item');uiId(item.id);
        if(ids.has(item.id))throw new TypeError('Duplicate icon placement ID');ids.add(item.id);
        if(![item.x,item.y].every(Number.isFinite))throw new TypeError('Icon placements must be finite');
        if(!base.iconPlacements.has(item.id))throw new TypeError('Icon placement requires an admitted decorative direct leaf');
      }
      currentBase();
      // An untouched dormant appearance is still part of accepted authority.
      for(const groups of base.byState.values())for(const commands of groups.values())for(const command of commands)if(command.kind==='image')validateSourceIdentity(command.asset);
      for(const binding of base.iconBindings.values())validateSourceIdentity(binding);
      const admission={planes:new Map(base.planes),bytes:[...base.planes.values()].reduce((n,p)=>n+p.data.byteLength,0),iconBindings:new Map(),iconPlacements:base.iconPlacements};
      const replacements=new Map(),commandsById=new Map();let candidateMemo=textMemo;
      for(const item of next.items){
        const {record,context}=base.iconPlacements.get(item.id),mapping=context.localToPhysical;
        const inputContext={id:context.id,revision:context.revision,localToPhysical:{scale:mapping.scale,x:mapping.origin.x,y:mapping.origin.y},sourcePixelPhysicalSize:context.physicalPixelsPerSourcePixel,viewport:context.viewport};
        const tree={kind:'icon',id:record.id,role:record.role,appearanceRole:record.appearanceRole,asset:record.asset,enabled:record.enabled,focusable:false,
          ...(record.contextId===undefined?{}:{contextId:record.contextId}),...(record.skinContextId===undefined?{}:{skinContextId:record.skinContextId}),...(record.labelContextId===undefined?{}:{labelContextId:record.labelContextId}),
          layout:{...record.layout,x:item.x,y:item.y},children:[]};
        const layout=prepareUiLayout(tree,{revision:next.revision,context:inputContext,theme},candidateMemo);candidateMemo=layout.memo;
        const preparedLeaf=prepare(next,new Map(),layout.plan,admission),binding=admission.iconBindings.get(item.id),prior=base.iconBindings.get(item.id);
        if(!prior||!binding||binding.texture!==prior.texture||binding.sourceIndex!==prior.sourceIndex||binding.source!==prior.source)throw new TypeError('Changed source identity for retained stock icon');
        replacements.set(item.id,publishUiData({...preparedLeaf.plan.records[0],parentId:record.parentId}));
        commandsById.set(item.id,preparedLeaf.commands);
      }
      const candidatePlan=publishUiData({...base.plan,revision:next.revision,records:base.plan.records.map(r=>replacements.get(r.id)??r)}),byState=new Map();
      for(const [state,groups]of base.byState){const nextGroups=new Map(groups);for(const [id,commands]of commandsById)nextGroups.set(id,commands);byState.set(state,nextGroups);}
      validateVariantBudgets(candidatePlan,byState);
      // All sources are checked again after ports, before accepting any state.
      for(const groups of byState.values())for(const commands of groups.values())for(const command of commands)if(command.kind==='image')validateSourceIdentity(command.asset);
      for(const binding of base.iconBindings.values())validateSourceIdentity(binding);
      currentBase();
      return {...base,plan:candidatePlan,byState,planes:admission.planes,textMemo:candidateMemo};
    }
    function compile(next) {
      if(passive)return compilePassive(next);
      const layout=prepareUiLayout(next.tree,{...next,theme,extensions:Object.fromEntries(registry)},textMemo),original=layout.plan,byState=new Map();
      // Preparation owns a candidate reservation. Published planes are borrowed
      // into it only when used; rejected plans never consume the live budget.
      const iconPlacements=iconPlacementInventory(original),iconBindings=new Map();
      const admission={planes:new Map(),bytes:0,iconPlacements,iconBindings};
      const states=original.records.some(r=>Object.keys(nativeStates(resolveThemeRole(theme,r.variant?`${r.appearanceRole}.${r.variant}`:r.appearanceRole),theme)).length)?['normal',...appearanceStates]:['normal'];
      let result;
      for(const state of states) {
        const feedback=new Map(original.records.map(r=>[r.id,{enabled:state!=='disabled',pressed:state==='pressed',hovered:state==='hover',focused:state==='focus'}]));
        const prepared=prepare(next,feedback,original,admission),groups=new Map(prepared.plan.records.map(r=>[r.id,[]]));
        for(const command of prepared.commands)groups.get(command.recordId).push(command);
        byState.set(state,groups);result??=prepared;
      }
      // Independent siblings may simultaneously select different states. Check
      // their combined worst case, not just each all-same-state projection.
      validateVariantBudgets(result.plan,byState);
      return {...result,byState,planes:admission.planes,textMemo:layout.memo,iconPlacements,iconBindings};
    }
    function selectAppearance(compiled,feedback) {
      if(passive)return compiled;
      const commands=[];
      for(const record of compiled.plan.records) {
        const status=feedback.get(record.metadata?.['ui:stateOwner']??record.id)??record;
        const groups=compiled.byState.get(appearanceState(status))??compiled.byState.get('normal');
        commands.push(...groups.get(record.id));
      }
      for(const command of commands)if(command.kind==='image') {
        const {texture,sourceIndex,source,plane}=command.asset;
        if(texture.source[sourceIndex]!==source || plane && (source.width!==plane.width||source.height!==plane.height))throw new TypeError('Stale source identity for compiled native art');
      }
      if(new Set(commands.filter(c=>c.kind==='image').map(frameKey)).size>budget.fragments)throw new RangeError('Native fragment budget exceeded');
      return {...compiled,commands};
    }
    function retire(error) {
      let cleanup;try {close('retired');} catch(failure) {cleanup=failure;}
      if (cleanup) throw new AggregateError([error,cleanup],`Native reconciliation failed: ${error.message}; cleanup failed`);
      throw error;
    }
    function close(state) {
      if (lifecycle !== 'mounted') return;
      lifecycle = state;interaction?.dispose();mounts.delete(api);
      try {owner.drain();} finally {objects.clear();fragments.clear();attachments.clear();extensions.clear();planes.clear();passiveCache.clear();textMemo=undefined;compiled=undefined;prepared=undefined;}
    }
    function attach(nextPlan) {
      const desired = new Set(nextPlan.contexts.map(c=>c.id));
      for (const [id,entry] of attachments) if (!desired.has(id) || stable(entry.context)!==stable(nextPlan.contexts.find(c=>c.id===id))) {
        for (const [key,item] of objects) if (item.contextId===id) {item.release();objects.delete(key);}
        entry.release();attachments.delete(id);
      }
      for (const context of nextPlan.contexts) if (!attachments.has(context.id)) {
        const child = ownership(failures), release = owner.add(child.drain);
        const lease = ports.attachContext({context,parent,scope},child.facade);
        if (!lease?.parent?.add || !['owned','borrowed'].includes(lease.ownership) || lease.ownership==='owned' && typeof lease.release!=='function') throw new TypeError('Invalid context attachment ownership');
        if (lease.ownership==='owned') child.add(lease.release);
        attachments.set(context.id,{context,lease,release});
      }
    }
    function frameKey(command) {
      const {texture,sourceIndex,source} = command.asset, s = command.source;
      if (!textureIds.has(texture)) textureIds.set(texture,++textureIdentity);
      if (!sourceIds.has(source))sourceIds.set(source,++sourceIdentity);
      return `${textureIds.get(texture)}:${sourceIndex}:${sourceIds.get(source)}:${s.x}:${s.y}:${s.width}:${s.height}`;
    }
    function frameFor(command,used) {
      const {texture,sourceIndex} = command.asset, s = command.source, key=frameKey(command);
      let entry = fragments.get(key);
      if (!entry) {
        if (fragments.size >= budget.fragments) throw new RangeError('Native fragment budget exceeded');
        const name = `${mountPrefix}:fragment:${++frameIdentity}`;
        // Phaser 4.2.1 Texture.remove does not undo add's bookkeeping. A native
        // unregistered Frame clone avoids mutating any borrowed cache entry.
        const frame=texture.get('__BASE').clone(), release=owner.add(()=>frame.destroy());
        entry = {frame,release};fragments.set(key,entry);
        frame.name=name;frame.sourceIndex=sourceIndex;frame.source=command.asset.source;
        frame.setSize(s.width,s.height,s.x,s.y);
      }
      used.add(key);return entry.frame;
    }
    function reconcile(prepared) {
      attach(prepared.plan);
      const desiredObjects=new Map(prepared.commands.map(c=>[c.key,c]));
      for(const [key,item]of objects) {
        const desired=desiredObjects.get(key);
        if(!desired||desired.kind!==item.kind||desired.contextId!==item.contextId){item.release();objects.delete(key);}
      }
      const desiredFrames=new Set(prepared.commands.filter(c=>c.kind==='image').map(frameKey));
      // No renderer runs during synchronous reconciliation. setCrop() first
      // clears the crop flag, then setFrame replaces each surviving Image's
      // retired Frame. Phaser 4.2.1's no-argument crop does not read that Frame.
      for(const [key,item]of fragments)if(!desiredFrames.has(key)){item.release();fragments.delete(key);}
      const feedback = passive?new Map(prepared.plan.records.map(r=>[r.id,r])):new Map();let afterId;
      if(!passive) do {const page=interaction.inspect({limit:256,...(afterId?{afterId}:{})});for(const r of page.controls)feedback.set(r.id,r);afterId=page.nextAfterId;} while(afterId);
      const usedObjects = new Set(), usedFrames = new Set();let depth=0;
      for (const command of prepared.commands) {
        const record = feedback.get(command.recordId), clipped = intersect(command.bounds,command.clip);
        let visible = !!clipped && record.state !== 'hidden' && command.active !== false && (!command.focusedOnly || record.focused), ink = command.color;
        if (command.feedback) {
          // A readable disabled card can retain its authored focus indicator.
          // This changes edge ink only; base disabled art and input eligibility
          // continue to use the original disabled state and authority.
          const disabledFocus=!record.enabled&&record.focused&&command.focusWhenDisabled&&command.feedback.focus!==undefined;
          const state = disabledFocus?'focus':!record.enabled?'disabled':record.pressed?'pressed':record.hovered?'hover':record.focused?'focus':record.selected?'selected':null;
          if (state && command.feedback[state] !== undefined) ink=color(command.feedback[state]); else visible=false;
        }
        let item=objects.get(command.key);
        if (item && (item.kind!==command.kind || item.contextId!==command.contextId)) {item.release();objects.delete(command.key);item=null;}
        if (!clipped && !item) continue;
        const frame = command.kind==='image'?frameFor(command,usedFrames):undefined;
        if (!item) {
          if (objects.size>=budget.objects) throw new RangeError('Native object budget exceeded');
          const object=command.kind==='image'?scene.add.image(0,0,command.asset.texture):scene.add.rectangle(0,0,1,1,ink??0);created++;
          const release=owner.add(()=>{destroyed++;object.destroy();});
          item={kind:command.kind,contextId:command.contextId,object,release};objects.set(command.key,item);
          attachments.get(command.contextId).lease.parent.add(object);
        }
        usedObjects.add(command.key);
        const {object}=item,d=command.bounds;
        if (command.kind==='image') {
          object.setCrop();object.setFrame(frame).setOrigin(0,0).setPosition(d.x,d.y).setScale(d.width/command.source.width,d.height/command.source.height);
          object.setTint(command.tint);
          if (clipped) object.setCrop((clipped.x-d.x)*command.source.width/d.width,(clipped.y-d.y)*command.source.height/d.height,clipped.width*command.source.width/d.width,clipped.height*command.source.height/d.height);
        } else {
          const b=clipped??d;object.setSize(b.width,b.height).setOrigin(0,0).setPosition(b.x,b.y).setScale(1).setFillStyle(ink??0);
        }
        object.setAlpha(command.opacity).setDepth(depth++).setVisible(visible);
      }
      for (const [key,item] of objects) if(!usedObjects.has(key)){item.release();objects.delete(key);}
      for (const [key,item] of fragments) if(!usedFrames.has(key)){item.release();fragments.delete(key);}
      const desired=new Set(prepared.extensionPlans.map(e=>e.id));
      for (const [id,entry] of extensions) if(!desired.has(id)){entry.release();extensions.delete(id);}
      for (const ext of prepared.extensionPlans) {
        const prior=extensions.get(ext.id), signature=stable({model:ext.model,allocation:ext.allocation});
        if (prior && prior.definition===ext.definition && prior.signature===signature) continue;
        if (prior){prior.release();extensions.delete(ext.id);}
        const child=ownership(failures),release=owner.add(child.drain);
        extensions.set(ext.id,{release,signature,definition:ext.definition,extensionId:ext.extensionId});
        const native=ports.extensionFacade?.({extensionId:ext.extensionId,allocation:ext.allocation},child.facade);
        ext.definition.mount(ext.model,ext.allocation,Object.freeze({...child.facade,native}));
      }
    }
    let compiled=compile(snapshot), prepared=compiled;
    // Exactly one existing portable engine per mount, created after pure preparation.
    interaction=passive?undefined:createUiInteraction({id:scope,plan:prepared.plan},policy);plan=prepared.plan;
    if(passive){passiveCache=compiled.cache;passiveAccepted=compiled.accepted;preparations=compiled.preparations;}
    planes=compiled.planes;textMemo=compiled.textMemo;
    function update(next) {
      if(lifecycle!=='mounted') throw new Error('Native UI mount is disposed or retired');
      const candidate=compile(next);
      interaction?.update({id:scope,plan:candidate.plan}); // Pure validation barrier.
      if(passive){passiveCache=candidate.cache;passiveAccepted=candidate.accepted;preparations=candidate.preparations;}
      plan=candidate.plan;compiled=candidate;planes=candidate.planes;textMemo=candidate.textMemo;
      try{prepared=selectAppearance(compiled,appearanceFeedback());reconcile(prepared);}catch(error){retire(error);}
    }
    function placeIcons(next) {
      if(lifecycle!=='mounted')throw new Error('Native UI mount is disposed or retired');
      const candidate=compileIconPlacements(next);
      interaction.update({id:scope,plan:candidate.plan});
      plan=candidate.plan;compiled=candidate;planes=candidate.planes;textMemo=candidate.textMemo;
      try{prepared=selectAppearance(compiled,appearanceFeedback());reconcile(prepared);}catch(error){retire(error);}
    }
    function appearanceFeedback() {
      if(passive)return new Map();
      const feedback=new Map();let afterId;
      do{const page=interaction.inspect({limit:256,...(afterId?{afterId}:{})});for(const r of page.controls)feedback.set(r.id,r);afterId=page.nextAfterId;}while(afterId);
      return feedback;
    }
    function handle(input) {
      if(lifecycle!=='mounted') return [];
      if(input?.point && input.pointSpace===undefined) throw new TypeError('Native UI points require explicit pointSpace');
      const intents=interaction.handle(input);
      try{
        prepared=selectAppearance(compiled,appearanceFeedback());reconcile(prepared);
      }catch(error){retire(error);}return intents;
    }
    const api=Object.freeze({scope,update,...(passive?{}:{handle,placeIcons}),inspect(options){
      let observation;
      if(passive){
        if(!Number.isInteger(options?.limit)||options.limit<1||options.limit>256)throw new RangeError('Inspection limit must be 1..256');
        const from=options.afterId===undefined?0:plan.records.findIndex(r=>r.id===options.afterId)+1;
        if(options.afterId!==undefined&&from===0)throw new TypeError('Unknown passive inspection cursor');
        const controls=plan.records.slice(from,from+options.limit).map(r=>({...r,enabled:r.enabled!==false,focusable:false,focused:false,hovered:false,pressed:false}));
        observation={scopeId:scope,modelRevision:plan.revision,disposed:lifecycle!=='mounted',focusId:null,hoverId:null,heldCount:0,controls,nextAfterId:from+controls.length<plan.records.length?controls.at(-1).id:null};
      }else observation=interaction.inspect(options);
        const controls=observation.controls.map(r=>({id:r.id,kind:r.kind,role:r.role,enabled:r.enabled,...(passive?{focusable:false}:{}),focused:r.focused,hovered:r.hovered,pressed:r.pressed,state:r.state,bounds:r.bounds,hitBounds:r.hitBounds,focusBounds:r.focusBounds,effectiveHitBounds:r.effectiveHitBounds,effectiveFocusBounds:r.effectiveFocusBounds,clipBounds:r.clipBounds,paintBounds:r.paintBounds,semanticContextId:r.semanticContextId,contextRevisions:r.contextRevisions}));
      return freezeUiData({...observation,controls,native:{lifecycle,textMemo:inspectUiLayoutMemo(textMemo),objects:objects.size,fragments:fragments.size,attachments:attachments.size,extensions:extensions.size,created,destroyed,...(passive?{preparations}:{}),cleanupFailures:[...failures]}});
    },dispose(){close('disposed');},uses(id){return [...extensions.values()].some(e=>e.extensionId===id);}});
    try {
      mounts.add(api);
      owner.add(()=>{if(!mounts.size&&subscribed){subscribed=false;scene.events.off('shutdown',shutdown);}});
      if(!subscribed){subscribed=true;scene.events.on('shutdown',shutdown);}
      prepared=selectAppearance(compiled,appearanceFeedback());reconcile(prepared);
    }catch(error){retire(error);}return api;
  }
  function registerExtension(id,definition) {
    if(disposed)throw new Error('UI instance is disposed');uiId(id,'Extension ID',true);
    if(registry.has(id)||definition?.version!==1||typeof definition.measure!=='function'||typeof definition.mount!=='function'||definition.regions!==undefined&&typeof definition.regions!=='function') throw new TypeError('Invalid or duplicate native extension');
    registry.set(id,Object.freeze({...definition}));let removed=false;
    return ()=>{if(removed)return;removed=true;registry.delete(id);const errors=[];for(const m of [...mounts])if(m.uses(id))try{m.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Extension removal cleanup failed');};
  }
  function dispose() {
    if(disposed)return;disposed=true;const errors=[];
    for(const m of [...mounts])try{m.dispose();}catch(error){errors.push(error);}registry.clear();
    if(errors.length)throw new AggregateError(errors,'UI dispose cleanup failed');
  }
  return Object.freeze({mount:(snapshot,options)=>mountInternal(snapshot,options),mountPassive:(snapshot,options)=>mountInternal(snapshot,options,true),registerExtension,dispose});
}
