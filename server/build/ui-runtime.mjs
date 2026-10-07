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
export function createBitmapFont({image,atlas,report}){
  if(report?.kind!=='font'||!report.glyphs?.[report.fallback]||!Number.isInteger(report.lineHeight)||report.lineHeight<1)throw Error('Invalid bitmap font report.');
  for(const [char,g] of Object.entries(report.glyphs)){
    positiveInteger(g.advance,`Advance for ${char}`);
    if(char!==' ')for(const tone of fontToneNames(report)){if(typeof g.frames?.[tone]!=='string')throw Error(`Missing font tone: ${tone} for ${char}`);getFrame(atlas,g.frames[tone]);}
  }
  const hasGlyph=fontGlyphLookup(report),glyph=char=>hasGlyph(char)?report.glyphs[char]:report.glyphs[report.fallback];
  const lineWidth=line=>[...line].reduce((n,char)=>n+glyph(char).advance,0);
  function wrap(text,maxWidth,{scale=2}={}){
    positiveInteger(scale,'Scale');positiveInteger(maxWidth,'Max width');
    const limit=maxWidth/scale,lines=[];
    for(const paragraph of normalizeFontText(text).split('\n')){
      if(!paragraph){lines.push('');continue;}
      let line='';
      for(const word of paragraph.split(/ +/)){
        if(!word)continue;
        if(line&&lineWidth(`${line} ${word}`)<=limit){line+=` ${word}`;continue;}
        if(line){lines.push(line);line='';}
        for(const char of word){
          if(line&&lineWidth(line+char)>limit){lines.push(line);line='';}
          line+=char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function measure(text,{scale=2,maxWidth}={}){
    positiveInteger(scale,'Scale');const lines=maxWidth===undefined?normalizeFontText(text).split('\n'):wrap(text,maxWidth,{scale});
    return {width:Math.max(0,...lines.map(line=>lineWidth(line)*scale)),height:lines.length*report.lineHeight*scale,lines};
  }
  function draw(ctx,text,x,y,{scale=2,tone='cream',maxWidth,align='left'}={}){
    integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');
    if(!['left','center','right'].includes(align))throw Error('Invalid text alignment.');
    const result=measure(text,{scale,maxWidth});ctx.imageSmoothingEnabled=false;
    for(const [row,line] of result.lines.entries()){
      const width=lineWidth(line)*scale,box=maxWidth??result.width;
      let cursor=x+(align==='center'?Math.floor((box-width)/2):align==='right'?box-width:0);
      for(const char of line){
        const g=glyph(char),alias=g.frames[tone];
        if(char!==' '){if(!alias)throw Error(`Missing font tone: ${tone}`);const f=getFrame(atlas,alias),entry=Array.isArray(atlas.frames)?atlas.frames.find(frame=>frame.filename===alias):atlas.frames[alias],offset=entry.spriteSourceSize??{x:0,y:0};ctx.drawImage(image,f.x,f.y,f.w,f.h,cursor+offset.x*scale,y+(row*report.lineHeight+offset.y)*scale,f.w*scale,f.h*scale);}
        cursor+=g.advance*scale;
      }
    }
    return result;
  }
  return {measure,wrap,draw,missingGlyphs:text=>missingFontGlyphs(report,text)};
}
export function drawNineSlice(ctx,{image,atlas,report},name,x,y,width,height,{scale=2}={}){
  integer(x,'X');integer(y,'Y');positiveInteger(scale,'Scale');positiveInteger(width,'Width');positiveInteger(height,'Height');
  if(width%scale||height%scale)throw Error('Nine-slice dimensions must be a multiple of scale.');
  const skin=report?.skins?.[name],f=getFrame(atlas,name);
  if(!skin)throw Error(`Missing UI skin metrics: ${name}`);
  if(width<skin.minWidth*scale||height<skin.minHeight*scale)throw Error('UI skin destination is below its minimum size.');
  const {left:l,right:r,top:t,bottom:b}=skin.insets;
  const sw=[l,f.w-l-r,r],sh=[t,f.h-t-b,b],dw=[l*scale,width-(l+r)*scale,r*scale],dh=[t*scale,height-(t+b)*scale,b*scale];
  ctx.imageSmoothingEnabled=false;
  let sy=f.y,dy=y;
  for(let row=0;row<3;row++){
    let sx=f.x,dx=x;
    for(let col=0;col<3;col++){
      if(sw[col]>0&&sh[row]>0)for(let oy=0;oy<dh[row];oy+=sh[row]*scale)for(let ox=0;ox<dw[col];ox+=sw[col]*scale){
        const w=Math.min(sw[col]*scale,dw[col]-ox),h=Math.min(sh[row]*scale,dh[row]-oy);
        ctx.drawImage(image,sx,sy,w/scale,h/scale,dx+ox,dy+oy,w,h);
      }
      sx+=sw[col];dx+=dw[col];
    }
    sy+=sh[row];dy+=dh[row];
  }
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
