import {layoutUi} from './ui-layout.mjs';
import {createUiInteraction} from './ui-interaction.mjs';
import {iterateNineSliceTiles, planNineSlice, placeBitmapText, projectPixelRect, quantizePhysicalRect} from './ui-runtime.mjs';
import {copyUiData, freezeUiData, resolveThemeRole, uiId, uiRect, uiKeys} from './ui-theme.mjs';

const stable = value => JSON.stringify(value);
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
function* skinTiles(plan,plane) {
  if(!plane){yield* iterateNineSliceTiles(plan);return;}
  const physical=plan.physicalPlan??plan, scale=physical.scale;
  for(const region of physical.regions) {
    const {source:s,destination:d,period,tile,phase}=region;
    if(!tile || period.width!==s.width*scale || period.height!==s.height*scale || phase?.x || phase?.y) {
      const partial={...physical,regions:[region]};
      for(const q of iterateNineSliceTiles(partial))yield {...q,destination:plan.resolution?projectPixelRect(plan.resolution,q.destination,'to-local'):q.destination};
      continue;
    }
    const x=d.width>period.width && constantAxis(plane,s,'x'), y=d.height>period.height && constantAxis(plane,s,'y');
    for(let oy=0;oy<d.height;oy+=y?d.height:period.height)for(let ox=0;ox<d.width;ox+=x?d.width:period.width) {
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
  function mount(snapshot, {parent, scope, policy} = {}) {
    if (disposed) throw new Error('UI instance is disposed');
    uiId(scope,'Scope ID',true);
    if (!parent?.add) throw new TypeError('Native parent is required');
    if ([...mounts].some(m=>m.scope === scope)) throw new TypeError(`Duplicate native scope ${scope}`);
    let lifecycle = 'mounted', plan, interaction, created = 0, destroyed = 0, frameIdentity = 0;
    const failures = [], owner = ownership(failures), objects = new Map(), fragments = new Map(), attachments = new Map(), extensions = new Map();
    const textureIds = new WeakMap(), sourceIds=new WeakMap(); let textureIdentity = 0, sourceIdentity=0, planes=new Map();
    const mountPrefix = `${prefix}:${++mountIdentity}`;
    function prepare(next,feedback,original,admission) {
      const draft = copyUiData(original), contexts = new Map(original.contexts.map(c=>[c.id,c])), commands = [], extensionPlans = [];
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
          const bounds = quantizePhysicalRect(projectPixelRect(context,control.bounds),{mode:'inside'});
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
            for (const quad of skinTiles(skinPlan,borrowed.plane)) {
              if (commands.length >= budget.objects) throw new RangeError('Native object budget exceeded by skin tiles');
              image(`${key}:tile:${i++}`,quad.source,quad.destination,part,borrowed);
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
            image(key,source,{...part.bounds,width:source.width*c.sourceToLocalScale,height:source.height*c.sourceToLocalScale},part,asset({kind:'icon',id:part.asset}));
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
            const control={...copyUiData(record),id,kind:'button',role:region.role ?? 'button',label:region.label,enabled:record.enabled && region.enabled !== false,focusable:region.focusable ?? !!region.actionId,actionId:region.actionId,
              bounds:region.bounds,hitBounds:region.bounds,focusBounds:region.bounds,clipBounds:intersect(allocation.bounds,allocation.clipBounds),effectiveHitBounds:clipped,effectiveFocusBounds:clipped,state:clipped && record.state==='visible'?'visible':'clipped',parts:[],extension:undefined};
            draft.records.splice(regionIndex++,0,control);feedbackFor(control);
          }
          extensionPlans.push({id:record.id,definition,model:record.extension.model,allocation,extensionId:record.extension.id});
        }
      }
      if (commands.length > budget.objects) throw new RangeError('Native object budget exceeded');
      if(new Set(commands.filter(c=>c.kind==='image').map(frameKey)).size>budget.fragments)throw new RangeError('Native fragment budget exceeded');
      return {plan:freezeUiData(draft),commands,extensionPlans};
    }
    function compile(next) {
      const original=layoutUi(next.tree,{...next,theme,extensions:Object.fromEntries(registry)}), byState=new Map();
      // Preparation owns a candidate reservation. Published planes are borrowed
      // into it only when used; rejected plans never consume the live budget.
      const admission={planes:new Map(),bytes:0};
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
      const maximum=result.plan.records.reduce((n,r)=>n+Math.max(...[...byState.values()].map(groups=>groups.get(r.id).length)),0);
      if(maximum>budget.objects)throw new RangeError('Native variant object budget exceeded');
      const ownerVariants=new Map(),allFrames=new Set();
      for(const [state,groups]of byState)for(const record of result.plan.records){
        const ownerId=record.metadata?.['ui:stateOwner']??record.id;
        if(!ownerVariants.has(ownerId))ownerVariants.set(ownerId,new Map());
        const variants=ownerVariants.get(ownerId);if(!variants.has(state))variants.set(state,new Set());
        for(const command of groups.get(record.id))if(command.kind==='image'){
          const key=frameKey(command);variants.get(state).add(key);allFrames.add(key);
        }
      }
      // Bound independent owners without enumerating an exponential state
      // product. Linked labels/shadows change with their owner. Shared fragments
      // are capped by the global union; a single owner needs only its largest
      // simultaneous variant, so exact-budget state switches remain admitted.
      const ownerMaximum=[...ownerVariants.values()].reduce((n,variants)=>n+Math.max(...[...variants.values()].map(keys=>keys.size)),0);
      if(Math.min(allFrames.size,ownerMaximum)>budget.fragments)throw new RangeError('Native variant fragment budget exceeded');
      return {...result,byState,planes:admission.planes};
    }
    function selectAppearance(compiled,feedback) {
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
      try {owner.drain();} finally {objects.clear();fragments.clear();attachments.clear();extensions.clear();planes.clear();compiled=undefined;prepared=undefined;}
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
      const feedback = new Map();let afterId;
      do {const page=interaction.inspect({limit:256,...(afterId?{afterId}:{})});for(const r of page.controls)feedback.set(r.id,r);afterId=page.nextAfterId;} while(afterId);
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
    interaction=createUiInteraction({id:scope,plan:prepared.plan},policy);plan=prepared.plan;
    planes=compiled.planes;
    function update(next) {
      if(lifecycle!=='mounted') throw new Error('Native UI mount is disposed or retired');
      const candidate=compile(next);
      interaction.update({id:scope,plan:candidate.plan}); // Pure validation barrier.
      plan=candidate.plan;compiled=candidate;planes=candidate.planes;
      try{prepared=selectAppearance(compiled,appearanceFeedback());reconcile(prepared);}catch(error){retire(error);}
    }
    function appearanceFeedback() {
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
    const api=Object.freeze({scope,update,handle,inspect(options){
      const observation=interaction.inspect(options);
      const controls=observation.controls.map(r=>({id:r.id,kind:r.kind,role:r.role,enabled:r.enabled,focused:r.focused,hovered:r.hovered,pressed:r.pressed,state:r.state,bounds:r.bounds,effectiveHitBounds:r.effectiveHitBounds,effectiveFocusBounds:r.effectiveFocusBounds,clipBounds:r.clipBounds,paintBounds:r.paintBounds,contextRevisions:r.contextRevisions}));
      return freezeUiData({...observation,controls,native:{lifecycle,objects:objects.size,fragments:fragments.size,attachments:attachments.size,extensions:extensions.size,created,destroyed,cleanupFailures:[...failures]}});
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
  return Object.freeze({mount,registerExtension,dispose});
}
