// Portable browser compositor for agent-sprites UI reports. Artwork lives in the atlas.
const positiveInteger=(value,name)=>{if(!Number.isInteger(value)||value<1)throw Error(`${name} must be a positive integer.`);return value;};
const integer=(value,name)=>{if(!Number.isInteger(value))throw Error(`${name} must be an integer.`);return value;};
const frameMaps=new WeakMap();
export function getFrame(atlas,name){
  if(!frameMaps.has(atlas))frameMaps.set(atlas,Array.isArray(atlas.frames)?new Map(atlas.frames.map(f=>[f.filename,f])):new Map(Object.entries(atlas.frames||{})));
  const entry=frameMaps.get(atlas).get(name);
  if(!entry?.frame)throw Error(`Missing UI frame: ${name}`);return entry.frame;
}
export function createBitmapFont({image,atlas,report}){
  if(report?.kind!=='font'||!report.glyphs?.[report.fallback]||!Number.isInteger(report.lineHeight)||report.lineHeight<1)throw Error('Invalid bitmap font report.');
  for(const [char,g] of Object.entries(report.glyphs)){
    positiveInteger(g.advance,`Advance for ${char}`);
    if(char!==' ')for(const tone of ['cream','muted','gold','ink']){if(typeof g.frames?.[tone]!=='string')throw Error(`Missing font tone: ${tone} for ${char}`);getFrame(atlas,g.frames[tone]);}
  }
  const glyph=char=>report.glyphs[char]||report.glyphs[report.fallback];
  const lineWidth=line=>[...line].reduce((n,char)=>n+glyph(char).advance,0);
  const normalize=text=>String(text).replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
  function wrap(text,maxWidth,{scale=2}={}){
    positiveInteger(scale,'Scale');positiveInteger(maxWidth,'Max width');
    const limit=maxWidth/scale,lines=[];
    for(const paragraph of normalize(text).split('\n')){
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
    positiveInteger(scale,'Scale');const lines=maxWidth===undefined?normalize(text).split('\n'):wrap(text,maxWidth,{scale});
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
        if(char!==' '){if(!alias)throw Error(`Missing font tone: ${tone}`);const f=getFrame(atlas,alias);ctx.drawImage(image,f.x,f.y,f.w,f.h,cursor,y+row*report.lineHeight*scale,f.w*scale,f.h*scale);}
        cursor+=g.advance*scale;
      }
    }
    return result;
  }
  return {measure,wrap,draw,missingGlyphs:text=>[...new Set([...normalize(text)].filter(c=>c!=='\n'&&!report.glyphs[c]))]};
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
