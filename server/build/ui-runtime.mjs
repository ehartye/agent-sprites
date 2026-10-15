// Portable browser compositor for agent-sprites UI reports. Artwork lives in the atlas.
const positiveInteger=(value,name)=>{if(!Number.isInteger(value)||value<1)throw Error(`${name} must be a positive integer.`);return value;};
const integer=(value,name)=>{if(!Number.isInteger(value))throw Error(`${name} must be an integer.`);return value;};
/** The four tones every font glyph carries. */
export const FONT_TONES=['cream','muted','gold','ink'];
export const fontToneNames=report=>report.tones?Object.keys(report.tones):FONT_TONES;
const frameMaps=new WeakMap();
const normalizeFontText=text=>String(text).replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
function fontGlyphLookup(font){
  const glyphs=typeof font.glyphs==='string'?new Set(font.glyphs):font.glyphs;
  return char=>typeof glyphs.has==='function'?char===' '||glyphs.has(char):Object.hasOwn(glyphs,char);
}
function missingFontGlyphs(font,text){const hasGlyph=fontGlyphLookup(font);return [...new Set([...normalizeFontText(text)].filter(char=>char!=='\n'&&!hasGlyph(char)))];}
/** Resolve unsupported display characters to the font's exported fallback without changing source text. */
export function resolveFontText(font,text){
  if(!font||!(typeof font.glyphs==='string'||(font.glyphs&&typeof font.glyphs==='object'))||typeof font.fallback!=='string'||[...font.fallback].length!==1)throw Error('Invalid bitmap font glyph metadata.');
  const hasGlyph=fontGlyphLookup(font);
  if(!hasGlyph(font.fallback))throw Error('Invalid bitmap font glyph metadata.');
  return [...normalizeFontText(text)].map(char=>char==='\n'||hasGlyph(char)?char:font.fallback).join('');
}
export function getFrame(atlas,name){
  if(!frameMaps.has(atlas))frameMaps.set(atlas,Array.isArray(atlas.frames)?new Map(atlas.frames.map(f=>[f.filename,f])):new Map(Object.entries(atlas.frames||{})));
  const entry=frameMaps.get(atlas).get(name);
  if(!entry?.frame)throw Error(`Missing UI frame: ${name}`);return entry.frame;
}
const freezeData=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freezeData(child);Object.freeze(value);}
  return value;
};
const finite=(value,name)=>{if(!Number.isFinite(value))throw Error(`${name} must be finite.`);return value===0?0:value;};
function exactOptions(value,keys,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error(`Unsupported ${name} options.`);}
function point(value){exactOptions(value,['x','y'],'point');finite(value.x,'X');finite(value.y,'Y');return value;}
function rectangle(value){exactOptions(value,['x','y','width','height'],'rectangle');point({x:value.x,y:value.y});for(const key of ['width','height'])if(finite(value[key],key)<0)throw Error('Rectangle extents must be nonnegative.');return value;}
/** Uniform local-to-physical projection only; semantic geometry is never implicitly snapped. */
export function pixelResolution(options){
  exactOptions(options,['id','revision','localToPhysical','physicalPixelsPerSourcePixel'],'pixel resolution');
  const {id,revision,localToPhysical,physicalPixelsPerSourcePixel}=options;
  if(typeof id!=='string'||!/^\S+:\S+$/.test(id))throw Error('Resolution id must be namespaced.');
  if(!Number.isInteger(revision)||revision<0)throw Error('Resolution revision must be a nonnegative integer.');
  exactOptions(localToPhysical,['scale','origin'],'local-to-physical');
  const {scale,origin}=localToPhysical;if(finite(scale,'Local-to-physical scale')<=0)throw Error('Local-to-physical scale must be positive.');point(origin);
  positiveInteger(physicalPixelsPerSourcePixel,'Physical pixels per source pixel');
  const sourceToLocalScale=finite(physicalPixelsPerSourcePixel/scale,'Source-to-local scale');
  return freezeData({format:'agent-sprites/pixel-resolution@1',id,revision,localToPhysical:{scale,origin:{...origin}},physicalPixelsPerSourcePixel,sourceToLocalScale});
}
function resolutionData(value){if(value?.format!=='agent-sprites/pixel-resolution@1')throw Error('Expected a pixel resolution descriptor.');return pixelResolution({id:value.id,revision:value.revision,localToPhysical:value.localToPhysical,physicalPixelsPerSourcePixel:value.physicalPixelsPerSourcePixel});}
export function projectPixelPoint(resolution,value,direction='to-physical'){
  const r=resolutionData(resolution);point(value);if(!['to-physical','to-local'].includes(direction))throw Error('Unsupported projection direction.');
  return projectedPoint(r,value,direction);
}
function projectedPoint(r,value,direction){
  const {scale,origin}=r.localToPhysical,result=Object.fromEntries(['x','y'].map(key=>[key,finite(direction==='to-physical'?value[key]*scale+origin[key]:(value[key]-origin[key])/scale,'Projected coordinate')]));return result;
}
export function projectPixelRect(resolution,value,direction='to-physical'){
  const r=resolutionData(resolution);rectangle(value);if(!['to-physical','to-local'].includes(direction))throw Error('Unsupported projection direction.');return projectedRect(r,value,direction);
}
function projectedRect(r,value,direction){
  const origin=projectedPoint(r,value,direction),scale=r.localToPhysical.scale;
  return {...origin,width:finite(direction==='to-physical'?value.width*scale:value.width/scale,'Projected width'),height:finite(direction==='to-physical'?value.height*scale:value.height/scale,'Projected height')};
}
const nearestGrid=(value,grid)=>Math.floor(value/grid+.5)*grid;
export function quantizePhysicalPoint(value,options={}){exactOptions(options,['grid'],'point quantization');const {grid=1}=options;positiveInteger(grid,'Grid');point(value);return {x:finite(nearestGrid(value.x,grid),'Quantized X'),y:finite(nearestGrid(value.y,grid),'Quantized Y')};}
export function quantizePhysicalRect(value,options={}){
  exactOptions(options,['grid','mode'],'rectangle quantization');const {grid=1,mode='inside'}=options;positiveInteger(grid,'Grid');rectangle(value);
  if(!['inside','cover','nearest'].includes(mode))throw Error('Unsupported quantization mode.');
  const leading=mode==='inside'?Math.ceil:mode==='cover'?Math.floor:v=>Math.floor(v+.5),trailing=mode==='inside'?Math.floor:mode==='cover'?Math.ceil:v=>Math.floor(v+.5),result={};
  for(const [axis,extent] of [['x','width'],['y','height']]){const start=finite(leading(value[axis]/grid)*grid,'Quantized origin'),end=finite(trailing(finite(value[axis]+value[extent],'Rectangle edge')/grid)*grid,'Quantized edge');result[axis]=start;result[extent]=value[extent]===0?0:Math.max(0,end-start);}
  return {x:result.x,y:result.y,width:result.width,height:result.height};
}
function inkBounds(bounds){
  if(bounds===undefined)return {known:false,rect:null};
  if(bounds===null)return {known:true,rect:null};
  const {left,top,right,bottom}=bounds;
  if(![left,top,right,bottom].every(Number.isInteger)||left<0||top<0||right<left||bottom<top)throw Error('Invalid bitmap font ink bounds.');
  return {known:true,rect:{x:left,y:top,width:right-left+1,height:bottom-top+1}};
}
function fontFrame(name,frame,offset={x:0,y:0}){
  for(const key of ['x','y'])integer(frame[key],`Font frame ${key}`);
  for(const key of ['w','h'])positiveInteger(frame[key],`Font frame ${key}`);
  for(const key of ['x','y'])integer(offset[key],`Font offset ${key}`);
  return {name,source:{x:frame.x,y:frame.y,width:frame.w,height:frame.h},offset:{x:offset.x,y:offset.y}};
}
/** Copy report/atlas or Phaser export metadata once; never infer ink or a cell from texture dimensions. */
export function normalizeBitmapFont(input){
  if(!input||Boolean(input.report)===Boolean(input.phaser))throw Error('Provide one bitmap font report/atlas or Phaser export.');
  const data=input.report??input.phaser,raw=Boolean(input.report);
  if(data.kind!=='font'||typeof data.fallback!=='string'||[...data.fallback].length!==1)throw Error('Invalid bitmap font report.');
  positiveInteger(data.lineHeight,'Font line height');
  if(data.baseline!==undefined)integer(data.baseline,'Font baseline');
  const cell=raw?data.cellSize:data.cell;
  if(cell!==undefined&&cell!==null){positiveInteger(cell.width,'Font cell width');positiveInteger(cell.height,'Font cell height');}
  const tones=raw?fontToneNames(data):Object.keys(data.tones??{}),glyphs=[];
  if(!tones.length)throw Error('Missing bitmap font tones.');
  if(raw){
    if(!data.glyphs?.[data.fallback])throw Error('Invalid bitmap font report.');
    const entries=Array.isArray(input.atlas?.frames)?new Map(input.atlas.frames.map(entry=>[entry.filename,entry])):new Map(Object.entries(input.atlas?.frames??{}));
    for(const [char,g] of Object.entries(data.glyphs)){
      positiveInteger(g.advance,`Advance for ${char}`);
      const frames=Object.fromEntries(char===' '?[]:tones.map(tone=>{
        const name=g.frames?.[tone];if(typeof name!=='string')throw Error(`Missing font tone: ${tone} for ${char}`);
        const entry=entries.get(name);if(!entry?.frame)throw Error(`Missing UI frame: ${name}`);
        return [tone,fontFrame(name,entry.frame,entry.spriteSourceSize??{x:0,y:0})];
      }));
      glyphs.push([char,{advance:g.advance,inkBounds:char===' '?inkBounds(null):inkBounds(g.bounds),frames}]);
    }
  }else{
    if(typeof data.glyphs!=='string')throw Error('Invalid Phaser bitmap font repertoire.');
    for(const char of new Set([...data.glyphs,' '])){
      const code=char.codePointAt(0),first=data.tones[tones[0]]?.chars?.[code],advance=first?.xAdvance;
      positiveInteger(advance,`Advance for ${char}`);
      const metric=data.metrics?.[char];
      if(metric?.advance!==undefined&&metric.advance!==advance)throw Error(`Inconsistent bitmap font advance for ${char}`);
      const frames=Object.fromEntries(tones.map(tone=>{
        const g=data.tones[tone]?.chars?.[code];
        if(!g||g.xAdvance!==advance)throw Error(`Inconsistent bitmap font tone: ${tone} for ${char}`);
        return [tone,char===' '?null:fontFrame(null,{x:g.x,y:g.y,w:g.width,h:g.height},{x:g.xOffset,y:g.yOffset})];
      }).filter(([,frame])=>frame!==null));
      glyphs.push([char,{advance,inkBounds:char===' '?inkBounds(null):inkBounds(metric?.bounds),frames}]);
    }
    if(!glyphs.some(([char])=>char===data.fallback))throw Error('Invalid bitmap font fallback.');
  }
  return freezeData({format:'agent-sprites/bitmap-font@1',lineHeight:data.lineHeight,baseline:data.baseline??null,cell:cell?{width:cell.width,height:cell.height}:null,fallback:data.fallback,toneNames:[...tones],glyphs:Object.fromEntries(glyphs)});
}
/** Finite text policies; dimensions/advances and line spacing are in source pixels before scale. */
export const BITMAP_TEXT_POLICY=Object.freeze({newline:'normalize',tab:'four-spaces',nullish:'stringify',empty:'line',trailingAdvance:0,lastLine:'line',lineSpacing:0,spaces:'trim'});
function textPolicy(policy={}){
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(key=>!Object.hasOwn(BITMAP_TEXT_POLICY,key)))throw Error('Unsupported bitmap text policy.');
  const p={...BITMAP_TEXT_POLICY,...policy};
  for(const [key,allowed] of Object.entries({newline:['normalize','lf-only'],tab:['four-spaces','literal'],nullish:['stringify','empty'],empty:['line','none'],trailingAdvance:[0,1],lastLine:['line','cell'],spaces:['trim','terminal']}))if(!allowed.includes(p[key]))throw Error(`Unsupported bitmap text policy: ${key}`);
  if(!Number.isInteger(p.lineSpacing)||p.lineSpacing<0)throw Error('Bitmap text policy lineSpacing must be a nonnegative integer.');
  return p;
}
function normalizedFont(font){if(font?.format!=='agent-sprites/bitmap-font@1'||!font.glyphs?.[font.fallback])throw Error('Expected a normalized bitmap font.');return font;}
const normalizedGlyph=(font,char)=>Object.hasOwn(font.glyphs,char)?font.glyphs[char]:font.glyphs[font.fallback];
function policyText(text,p){
  let source=String(p.nullish==='empty'&&text==null?'':text);
  if(p.newline==='normalize')source=source.replace(/\r\n?/g,'\n');
  if(p.tab==='four-spaces')source=source.replace(/\t/g,'    ');
  return source;
}
// Boundary maps use UTF-16 offsets, including collapsed CRLF and expanded tabs.
function policyTextOffsets(text,p){
  const raw=String(p.nullish==='empty'&&text==null?'':text),toDisplay=[0],toSource=[0];let source='';
  for(let i=0;i<raw.length;){
    const start=i;let value=raw[i++];
    if(value==='\r'&&p.newline==='normalize'){if(raw[i]==='\n')i++;value='\n';}
    if(value==='\t'&&p.tab==='four-spaces')value='    ';
    const before=source.length;source+=value;
    for(let n=before+1;n<=source.length;n++)toSource[n]=n===source.length?i:start;
    for(let n=start+1;n<=i;n++)toDisplay[n]=source.length;
  }
  return {source,toDisplay,toSource};
}
const lineResult=(font,sourceLines)=>({sourceLines,resolvedLines:sourceLines.map(line=>[...line].map(char=>Object.hasOwn(font.glyphs,char)?char:font.fallback).join(''))});
// One calculation kernel; adapters own metric validation, fallback and drawable metadata.
function textMetricsKernel({lineHeight,advanceOf},p,{scale=1,leading=0,cellHeight}={}){
  const advanceWidth=line=>{let width=0;for(const char of String(line))width+=advanceOf(char);return width;};
  const width=line=>Math.max(0,advanceWidth(line)-p.trailingAdvance);
  function wrap(source,maxWidth,capture){
    if(maxWidth!==Infinity&&(!Number.isFinite(maxWidth)||maxWidth<0))throw Error('Max width must be nonnegative or Infinity.');
    if(!source&&p.empty==='none')return [];
    const limit=maxWidth/scale,lines=[];let paragraphStart=0;
    for(const paragraph of source.split('\n')){
      let line='',units=[],lineStart=paragraphStart,wordStart=paragraphStart;
      const emit=end=>{lines.push(line);capture?.push({start:lineStart,end,units});line='';units=[];lineStart=end;};
      if(!paragraph){emit(paragraphStart);paragraphStart++;continue;}
      for(const word of paragraph.split(/ +/)){
        const start=wordStart;wordStart+=word.length;while(source[wordStart]===' ')wordStart++;
        if(!word&&(p.spaces==='trim'||!line))continue;
        if(line&&width(`${line} ${word}`)<=limit){
          units.push({char:' ',start:units.at(-1)?.end??lineStart,end:start});line+=' ';
          let offset=start;for(const char of word){units.push({char,start:offset,end:offset+char.length});offset+=char.length;}line+=word;continue;
        }
        if(line)emit(start);
        let offset=start;
        for(const char of word){const candidateWidth=width(line+char);if(line&&candidateWidth>limit)emit(offset);units.push({char,start:offset,end:offset+char.length});offset+=char.length;line+=char;}
      }
      emit(paragraphStart+paragraph.length);paragraphStart+=paragraph.length+1;
    }
    return lines;
  }
  function measure(source,maxWidth,capture){
    const sourceLines=maxWidth===undefined?(!source&&p.empty==='none'?[]:source.split('\n')):wrap(source,maxWidth,capture);
    if(capture&&maxWidth===undefined){let start=0;for(const line of sourceLines){let offset=start;const units=[...line].map(char=>{const unit={char,start:offset,end:offset+char.length};offset+=char.length;return unit;});capture.push({start,end:offset,units});start=offset+1;}}
    const widths=sourceLines.map(advanceWidth);
    const height=sourceLines.length?((sourceLines.length-1)*(lineHeight+p.lineSpacing+leading)+(p.lastLine==='cell'?cellHeight:lineHeight))*scale:0;
    return {sourceLines,width:Math.max(0,...widths.map(value=>Math.max(0,value-p.trailingAdvance)*scale)),height,advanceWidth:Math.max(0,...widths)*scale};
  }
  return {lineWidth:line=>width(line)*scale,wrap,measure};
}
const bitmapMetrics=font=>({lineHeight:font.lineHeight,advanceOf:char=>normalizedGlyph(font,char).advance});
function validatedTextMetrics(metrics){
  if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw Error('Expected text metrics.');
  if(finite(metrics.lineHeight,'Metrics line height')<=0)throw Error('Metrics line height must be positive.');
  if(typeof metrics.advanceOf!=='function')throw Error('Metrics advanceOf must be a function.');
  // Stable, pure callbacks can be validated once for each code point in this calculation.
  const advances=new Map();
  return {lineHeight:metrics.lineHeight,advanceOf:char=>{
    if(!advances.has(char)){
      const advance=finite(metrics.advanceOf(char),`Advance for ${char}`);
      if(advance<0)throw Error(`Advance for ${char} must be nonnegative.`);
      advances.set(char,advance);
    }
    return advances.get(char);
  }};
}
function metricsPolicy(policy){const p=textPolicy(policy);if(p.lastLine==='cell')throw Error('Text metrics policy lastLine cell requires bitmap cell metadata.');return p;}
/** Raw full advances in caller units. advanceOf receives one Unicode code point and must be stable and pure. */
export function textMetricsLineWidth(metrics,line){return textMetricsKernel(validatedTextMetrics(metrics),BITMAP_TEXT_POLICY).lineWidth(line);}
/** Source lines only; no drawable font, fallback or ink metadata is inferred. */
export function wrapTextMetrics(metrics,text,maxWidth=Infinity,options={}){
  exactOptions(options,['policy'],'text metrics wrapping');const m=validatedTextMetrics(metrics),p=metricsPolicy(options.policy);
  return {sourceLines:textMetricsKernel(m,p).wrap(policyText(text,p),maxWidth)};
}
/** Dimensions stay in caller units without rounding. Leading adds to policy lineSpacing between lines. */
export function measureTextMetrics(metrics,text,options={}){
  exactOptions(options,['maxWidth','leading','policy'],'text metrics measurement');
  const m=validatedTextMetrics(metrics),p=metricsPolicy(options.policy),{maxWidth,leading=0}=options;
  if(finite(leading,'Leading')<0)throw Error('Leading must be nonnegative.');
  return textMetricsKernel(m,p,{leading}).measure(policyText(text,p),maxWidth);
}
export function bitmapLineWidth(font,line,{scale=1,trailingAdvance=0}={}){
  normalizedFont(font);positiveInteger(scale,'Scale');
  if(![0,1].includes(trailingAdvance))throw Error('Unsupported bitmap text policy: trailingAdvance');
  return textMetricsKernel(bitmapMetrics(font),{...BITMAP_TEXT_POLICY,trailingAdvance},{scale}).lineWidth(line);
}
export function wrapBitmapText(font,text,maxWidth,{scale=1,policy}={}){
  normalizedFont(font);positiveInteger(scale,'Scale');const p=textPolicy(policy);
  return lineResult(font,textMetricsKernel(bitmapMetrics(font),p,{scale}).wrap(policyText(text,p),maxWidth));
}
export function measureBitmapText(font,text,{scale=1,maxWidth,policy,sourceOffsets=false}={}){
  normalizedFont(font);positiveInteger(scale,'Scale');const p=textPolicy(policy),source=policyText(text,p);
  if(p.lastLine==='cell'&&!font.cell)throw Error('Bitmap font cell height is unknown.');
  const capture=sourceOffsets?[]:undefined,measured=textMetricsKernel(bitmapMetrics(font),p,{scale,cellHeight:font.cell?.height}).measure(source,maxWidth,capture),{sourceLines}=measured;
  let sourceMap;
  if(capture){
    const {toDisplay,toSource}=policyTextOffsets(text,p);
    sourceMap=capture.map(({start,end,units})=>{
      const sourceStart=toSource[start],sourceEnd=toSource[end],caretAdvances=[];let index=0,advance=0;
      for(let offset=sourceStart;offset<=sourceEnd;offset++){
        while(index<units.length&&units[index].end<=toDisplay[offset])advance+=normalizedGlyph(font,units[index++].char).advance*scale;
        caretAdvances.push(advance);
      }
      return {sourceStart,sourceEnd,caretAdvances};
    });
  }
  let known=true,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const [row,line] of sourceLines.entries()){
    let pen=0;
    for(const char of line){
      const g=normalizedGlyph(font,char),ink=g.inkBounds;known&&=ink.known;
      if(ink.rect){const b=ink.rect,x=(pen+b.x)*scale,y=(row*(font.lineHeight+p.lineSpacing)+b.y)*scale;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+b.width*scale);bottom=Math.max(bottom,y+b.height*scale);}
      pen+=g.advance;
    }
  }
  return {...lineResult(font,sourceLines),...measured,...(sourceMap?{sourceMap}:{}),paintedBounds:{known,rect:known&&left!==Infinity?{x:left,y:top,width:right-left,height:bottom-top}:null}};
}
/** Source metrics remain source pixels; origins, bounds and returned paint are in the caller's destination space. */
export function placeBitmapText(font,text,x,y,options={}){
  exactOptions(options,['scale','tone','maxWidth','maxHeight','align','policy','resolution','sourceOffsets'],'text placement');
  const {scale=1,tone=font?.toneNames?.[0],maxWidth,maxHeight,align='left',policy,resolution,sourceOffsets=false}=options;
  if(typeof sourceOffsets!=='boolean')throw Error('Source offsets must be boolean.');
  if(resolution!==undefined){
    if(Object.hasOwn(options,'scale'))throw Error('Do not combine scale with resolution.');
    point({x,y});const r=resolutionData(resolution),anchor=projectedPoint(r,{x,y},'to-physical'),s=r.localToPhysical.scale,p=r.physicalPixelsPerSourcePixel;
    for(const extent of [maxWidth,maxHeight])if(extent!==undefined&&finite(extent,'Layout extent')<0)throw Error('Layout extents must be nonnegative.');
    const snapped=quantizePhysicalPoint(anchor),fitOrigin={...snapped},bounds={};
    for(const [axis,extent,value] of [['x','width',maxWidth],['y','height',maxHeight]])if(value!==undefined){fitOrigin[axis]=Math.ceil(anchor[axis]);bounds[extent]=Math.max(0,Math.floor(finite(anchor[axis]+value*s,'Layout edge'))-fitOrigin[axis]);}
    const physical=placeBitmapText(font,text,snapped.x,snapped.y,{scale:p,tone,maxWidth:bounds.width,maxHeight:bounds.height,align,policy,sourceOffsets});
    const project=rect=>projectedRect(r,rect,'to-local'),physicalBounds={...fitOrigin,width:bounds.width??physical.width,height:bounds.height??physical.height},ink=physical.paintedBounds;
    const escapes=(rect,axis,extent)=>!!rect&&(rect[axis]<physicalBounds[axis]||rect[axis]+rect[extent]>physicalBounds[axis]+physicalBounds[extent]);
    const overflow={horizontal:maxWidth!==undefined&&physical.lines.some(line=>escapes({x:line.x,width:line.width},'x','width')),vertical:maxHeight!==undefined&&physical.height>0&&escapes({y:snapped.y,height:physical.height},'y','height'),painted:{known:ink.known,horizontal:ink.known?maxWidth!==undefined&&escapes(ink.rect,'x','width'):null,vertical:ink.known?maxHeight!==undefined&&escapes(ink.rect,'y','height'):null}};
    return {...physical,width:finite(physical.width/s,'Local width'),height:finite(physical.height/s,'Local height'),advanceWidth:finite(physical.advanceWidth/s,'Local advance width'),
      ...(physical.sourceMap?{sourceMap:physical.sourceMap.map(line=>({...line,caretAdvances:line.caretAdvances.map(value=>value/s)}))}:{}),
      lines:physical.lines.map(line=>({...line,...projectedPoint(r,line,'to-local'),width:finite(line.width/s,'Local line width'),...(line.caretAdvances?{caretAdvances:line.caretAdvances.map(value=>value/s)}:{})})),
      draws:physical.draws.map(draw=>({...draw,physicalDestination:draw.destination,destination:project(draw.destination)})),
      paintedBounds:{known:physical.paintedBounds.known,rect:physical.paintedBounds.rect?project(physical.paintedBounds.rect):null},physicalPaintedBounds:physical.paintedBounds,
      resolution:r,context:{id:r.id,revision:r.revision},requestedLayoutBounds:{x,y,width:maxWidth??null,height:maxHeight??null},physicalAnchor:snapped,bounds:project(physicalBounds),physicalBounds,overflow,
      quantization:{space:'physical',grid:1,origin:'nearest',bounds:'inside',ties:'positive',sourcePixels:p}};
  }
  integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');
  if(!['left','center','right'].includes(align))throw Error('Invalid text alignment.');
  for(const [key,value] of [['Max width',maxWidth],['Max height',maxHeight]])if(value!==undefined&&(!Number.isInteger(value)||value<0))throw Error(`${key} must be a finite nonnegative integer.`);
  const p=textPolicy(policy),measured=measureBitmapText(font,text,{scale,maxWidth,policy:p,sourceOffsets}),box=maxWidth??measured.width,draws=[],lines=[];
  let known=true,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const [row,line] of measured.sourceLines.entries()){
    const metrics=measureBitmapText(font,line,{scale,policy:p}),lx=x+(align==='center'?Math.floor((box-metrics.width)/2):align==='right'?box-metrics.width:0),ly=y+row*(font.lineHeight+p.lineSpacing)*scale;
    lines.push({x:lx,y:ly,width:metrics.width,source:line,resolved:measured.resolvedLines[row],...(sourceOffsets?measured.sourceMap[row]:{})});
    known&&=metrics.paintedBounds.known;
    const ink=metrics.paintedBounds.rect;
    if(ink){left=Math.min(left,lx+ink.x);top=Math.min(top,ly+ink.y);right=Math.max(right,lx+ink.x+ink.width);bottom=Math.max(bottom,ly+ink.y+ink.height);}
    let pen=0;
    for(const char of line){
      const resolvedChar=Object.hasOwn(font.glyphs,char)?char:font.fallback,g=normalizedGlyph(font,char),frame=g.frames[tone];
      if(char!==' '){
        if(!frame)throw Error(`Missing font tone: ${tone}`);
        const {source,offset}=frame;
        draws.push({char,resolvedChar,row,frame:frame.name,tone,source,destination:{x:lx+(pen+offset.x)*scale,y:ly+offset.y*scale,width:source.width*scale,height:source.height*scale}});
      }
      pen+=g.advance;
    }
  }
  if(![measured.width,measured.height,...lines.flatMap(line=>[line.x,line.y]),...draws.flatMap(draw=>Object.values(draw.destination))].every(Number.isFinite))throw Error('Text placement geometry must be finite.');
  const rect=known&&left!==Infinity?{x:left,y:top,width:right-left,height:bottom-top}:null;
  return {...measured,lines,draws,paintedBounds:{known,rect},overflow:{horizontal:maxWidth!==undefined&&measured.width>maxWidth,vertical:maxHeight!==undefined&&measured.height>maxHeight,painted:{known,horizontal:known?!!rect&&maxWidth!==undefined&&(rect.x<x||rect.x+rect.width>x+maxWidth):null,vertical:known?!!rect&&maxHeight!==undefined&&(rect.y<y||rect.y+rect.height>y+maxHeight):null}}};
}
export function createBitmapFont({image,atlas,report}){
  const font=normalizeBitmapFont({report,atlas});
  function wrap(text,maxWidth,{scale=2}={}){
    positiveInteger(scale,'Scale');positiveInteger(maxWidth,'Max width');
    return wrapBitmapText(font,text,maxWidth,{scale}).sourceLines;
  }
  function measure(text,{scale=2,maxWidth}={}){
    positiveInteger(scale,'Scale');if(maxWidth!==undefined)positiveInteger(maxWidth,'Max width');
    const {width,height,sourceLines}=measureBitmapText(font,text,{scale,maxWidth});
    return {width,height,lines:sourceLines};
  }
  function draw(ctx,text,x,y,{scale=2,tone='cream',maxWidth,align='left'}={}){
    integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');
    if(!['left','center','right'].includes(align))throw Error('Invalid text alignment.');
    if(maxWidth!==undefined)positiveInteger(maxWidth,'Max width');ctx.imageSmoothingEnabled=false;
    const plan=placeBitmapText(font,text,x,y,{scale,tone,maxWidth,align});
    for(const {source:f,destination:d} of plan.draws)ctx.drawImage(image,f.x,f.y,f.width,f.height,d.x,d.y,d.width,d.height);
    return {width:plan.width,height:plan.height,lines:plan.sourceLines};
  }
  return {measure,wrap,draw,missingGlyphs:text=>missingFontGlyphs(font,text)};
}
/** At most nine drawable regions; no authored minimum or native renderer/resource policy is inferred. */
export function planNineSlice({frame,insets},{x,y,width,height},options={}){
  exactOptions(options,['scale','resolution'],'nine-slice');const {scale=1,resolution}=options;
  if(resolution!==undefined){
    if(Object.hasOwn(options,'scale'))throw Error('Do not combine scale with resolution.');
    const r=resolutionData(resolution),requestedLayoutBounds={x,y,width,height},p=r.physicalPixelsPerSourcePixel;
    rectangle(requestedLayoutBounds);const inside=quantizePhysicalRect(projectedRect(r,requestedLayoutBounds,'to-physical'),{mode:'inside'}),physicalBounds={...inside,width:Math.floor(inside.width/p)*p,height:Math.floor(inside.height/p)*p};
    // Validate source metadata even when the requested paint allocation is empty.
    const validated=planNineSlice({frame,insets},{x:physicalBounds.x,y:physicalBounds.y,width:physicalBounds.width||p,height:physicalBounds.height||p},{scale:p});
    const physicalPlan=physicalBounds.width&&physicalBounds.height?validated:freezeData({...validated,bounds:physicalBounds,regions:[]});
    const project=rect=>projectedRect(r,rect,'to-local'),regions=physicalPlan.regions.map(region=>({...region,physicalDestination:region.destination,destination:project(region.destination),physicalPeriod:region.period,period:{width:finite(region.period.width/r.localToPhysical.scale,'Local period width'),height:finite(region.period.height/r.localToPhysical.scale,'Local period height')}}));
    const painted=unionRectangles(physicalPlan.regions.map(region=>region.destination)),overflow=painted?{horizontal:painted.x<physicalBounds.x||painted.x+painted.width>physicalBounds.x+physicalBounds.width,vertical:painted.y<physicalBounds.y||painted.y+painted.height>physicalBounds.y+physicalBounds.height}:{horizontal:false,vertical:false};
    return freezeData({...physicalPlan,scale:r.sourceToLocalScale,regions,resolution:r,context:{id:r.id,revision:r.revision},physicalPlan,requestedLayoutBounds,physicalBounds,bounds:project(physicalBounds),paintedBounds:{known:true,rect:painted?project(painted):null},physicalPaintedBounds:{known:true,rect:painted},overflow,
      quantization:{space:'physical',originGrid:1,originMode:'inside-ceil',extentGrid:p,extentMode:'inward-floor',extentOrigin:{x:physicalBounds.x,y:physicalBounds.y}}});
  }
  integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');positiveInteger(width,'Width');positiveInteger(height,'Height');
  if(width%scale||height%scale)throw Error('Nine-slice dimensions must be a multiple of scale.');
  integer(frame.x,'Frame X');integer(frame.y,'Frame Y');positiveInteger(frame.w,'Frame width');positiveInteger(frame.h,'Frame height');
  for(const value of Object.values(insets))if(!Number.isInteger(value)||value<0)throw Error('Nine-slice insets must be nonnegative integers.');
  const {left:l,right:r,top:t,bottom:b}=insets;
  if([l,r,t,b].some(value=>value===undefined))throw Error('Missing nine-slice insets.');
  const sw=[l,frame.w-l-r,r],sh=[t,frame.h-t-b,b],dw=[l*scale,width-(l+r)*scale,r*scale],dh=[t*scale,height-(t+b)*scale,b*scale],regions=[];
  if(![...sw,...sh,...dw,...dh].every(Number.isFinite))throw Error('Nine-slice geometry must be finite.');
  let sy=frame.y,dy=y;
  for(let row=0;row<3;row++){
    let sx=frame.x,dx=x;
    for(let column=0;column<3;column++){
      if(sw[column]>0&&sh[row]>0&&dw[column]>0&&dh[row]>0)regions.push({row,column,source:{x:sx,y:sy,width:sw[column],height:sh[row]},destination:{x:dx,y:dy,width:dw[column],height:dh[row]},tile:row===1||column===1,period:{width:sw[column]*scale,height:sh[row]*scale},phase:{x:0,y:0}});
      sx+=sw[column];dx+=dw[column];
    }
    sy+=sh[row];dy+=dh[row];
  }
  return freezeData({format:'agent-sprites/nine-slice@1',scale,bounds:{x,y,width,height},regions});
}
/** Lazy row/column/tile-Y/tile-X drawing order; partial tiles crop their source rather than stretching it. */
export function* iterateNineSliceTiles(plan){
  if(plan?.format!=='agent-sprites/nine-slice@1'||!Array.isArray(plan.regions)||plan.regions.length>9)throw Error('Expected a nine-slice plan.');
  if(plan.resolution){const r=resolutionData(plan.resolution);for(const quad of iterateNineSliceTiles(plan.physicalPlan))yield {...quad,physicalDestination:quad.destination,destination:projectedRect(r,quad.destination,'to-local')};return;}
  positiveInteger(plan.scale,'Scale');
  for(const {source:s,destination:d,period,tile} of plan.regions){
    if(!tile){yield {source:{...s},destination:{...d}};continue;}
    positiveInteger(period.width,'Tile period width');positiveInteger(period.height,'Tile period height');
    for(let oy=0;oy<d.height;oy+=period.height)for(let ox=0;ox<d.width;ox+=period.width){
      const width=Math.min(period.width,d.width-ox),height=Math.min(period.height,d.height-oy);
      yield {source:{x:s.x,y:s.y,width:width/plan.scale,height:height/plan.scale},destination:{x:d.x+ox,y:d.y+oy,width,height}};
    }
  }
}
function unionRectangles(rects){if(!rects.length)return null;const x=Math.min(...rects.map(rect=>rect.x)),y=Math.min(...rects.map(rect=>rect.y)),right=Math.max(...rects.map(rect=>rect.x+rect.width)),bottom=Math.max(...rects.map(rect=>rect.y+rect.height));return {x,y,width:right-x,height:bottom-y};}
export function drawNineSlice(ctx,{image,atlas,report},name,x,y,width,height,{scale=2}={}){
  integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');positiveInteger(width,'Width');positiveInteger(height,'Height');
  if(width%scale||height%scale)throw Error('Nine-slice dimensions must be a multiple of scale.');
  const skin=report?.skins?.[name],f=getFrame(atlas,name);
  if(!skin)throw Error(`Missing UI skin metrics: ${name}`);
  if(width<skin.minWidth*scale||height<skin.minHeight*scale)throw Error('UI skin destination is below its minimum size.');
  const plan=planNineSlice({frame:f,insets:skin.insets},{x,y,width,height},{scale});
  ctx.imageSmoothingEnabled=false;
  for(const {source:s,destination:d} of iterateNineSliceTiles(plan))ctx.drawImage(image,s.x,s.y,s.width,s.height,d.x,d.y,d.width,d.height);
}

// Opaque bounds and integer fitting are shared by portraits, specimen displays,
// inventory previews and other consumers of padded exported frames.
export function getOpaqueBounds({data,width,height}){
  positiveInteger(width,'Source width');positiveInteger(height,'Source height');
  if(!data||data.length!==width*height*4)throw Error('Expected RGBA image data.');
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
  }
  return right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function pixelFit(bounds,destination,{padding=0}={}){
  if(!bounds)return null;
  for(const [label,rect] of [['Source',bounds],['Destination',destination]]){
    integer(rect.x,`${label} X`);integer(rect.y,`${label} Y`);positiveInteger(rect.width,`${label} width`);positiveInteger(rect.height,`${label} height`);
  }
  if(bounds.x<0||bounds.y<0)throw Error('Source bounds must be nonnegative.');
  integer(padding,'Padding');if(padding<0)throw Error('Padding must be nonnegative.');
  const scale=Math.floor(Math.min((destination.width-2*padding)/bounds.width,(destination.height-2*padding)/bounds.height));
  // Never shrink into fractional pixels or spill out of an undersized box.
  if(scale<1)return null;
  const width=bounds.width*scale,height=bounds.height*scale;
  const x=destination.x+Math.floor((destination.width-width)/2),y=destination.y+Math.floor((destination.height-height)/2);
  return {x,y,width,height,scale};
}
export function drawPixelFit(ctx,image,bounds,destination,{padding=0}={}){
  const fit=pixelFit(bounds,destination,{padding});if(!fit)return null;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,fit.x,fit.y,fit.width,fit.height);
  return fit;
}
