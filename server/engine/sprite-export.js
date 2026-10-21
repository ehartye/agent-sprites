import sharp from 'sharp';
import {exportTrimmed,assertTrimOption} from './trimmed-export.js';

export function hasAuthoredNormals(project) {
  return project.cells.listCells().some(({coord})=>project.cells.getCell(coord).shapes.listByZ().some(shape=>shape.visible!==false&&shape.params.surface?.normal));
}

/** Export both channels from one color layout; normal pixels never choose another trim. */
export async function exportSpriteAtlases(project,renderer,{trim,normal,...options}={}) {
  assertTrimOption(trim);
  if(normal!==undefined&&typeof normal!=='boolean')throw new Error('normal must be true or false');
  const includeNormal=normal??hasAuthoredNormals(project);
  const pixels=project.cellWidth*project.cellHeight*project.cells.rows*project.cells.cols;
  if(includeNormal&&(!Number.isSafeInteger(pixels)||pixels*2>64_000_000))throw new Error('Paired color/normal atlas exceeds the 64000000-pixel work budget');
  const result=trim?await exportTrimmed(project,renderer,options):{png:renderer.renderSheet(project.cells,{gap:0}),atlas:project.exportAseprite(options)};
  const lighting=Object.fromEntries(project.cells.listCells().flatMap(({coord})=>{
    const value=project.cells.getCell(coord).lighting;
    return value===undefined?[]:[[coord,structuredClone(value)]];
  }));
  if(Object.keys(lighting).length)result.atlas.meta.lighting={mode:'offline-2d-baked-color',alpha:'preserved',cells:lighting};
  if(!includeNormal)return result;
  const {w,h}=result.atlas.meta.size;
  if(!Number.isSafeInteger(w*h)||w*h>64_000_000)throw new Error('Normal atlas exceeds the 64000000-pixel budget');
  const image=options.imageName??result.atlas.meta.image;
  if(typeof image!=='string'||!image.toLowerCase().endsWith('.png'))throw new Error('Paired normal export requires a PNG imageName');
  const stem=image.slice(0,-4),normalImage=`${stem}.normal.png`,normalAtlasName=`${stem}.normal.atlas.json`;
  // Copy encoded vectors as bytes. A premultiplied canvas can round RGB under
  // partial alpha, which is inappropriate for an exported direction channel.
  const sheet=new Uint8ClampedArray(w*h*4);
  for(let row=0;row<project.cells.rows;row++)for(let col=0;col<project.cells.cols;col++){
    const frame=result.atlas.frames[row*project.cells.cols+col],bounds=frame.spriteSourceSize,packed=frame.frame;
    const data=renderer.renderCellRaw(project.cells.getCell(`${row},${col}`),{channel:'normal'});
    if(frame.rotated||packed.w!==bounds.w||packed.h!==bounds.h)throw new Error('Normal export requires the canonical unrotated, unscaled color packing');
    if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==project.cellWidth*project.cellHeight*4)throw new Error('Normal renderer must return one RGBA value per source pixel');
    for(let y=0;y<bounds.h;y++)for(let x=0;x<bounds.w;x++){
      const from=((bounds.y+y)*project.cellWidth+bounds.x+x)*4,to=((packed.y+y)*w+packed.x+x)*4;
      sheet.set(data.subarray(from,from+4),to);
    }
  }
  result.atlas.meta.normalMap={image:normalImage,atlas:normalAtlasName,encoding:'RGB=(x,-y,z)*0.5+0.5',green:'up',flat:[128,128,255],alpha:'matches color'};
  result.normalAtlas=structuredClone(result.atlas);
  result.normalAtlas.meta.image=normalImage;
  delete result.normalAtlas.meta.normalMap;
  delete result.normalAtlas.meta.lighting;
  result.normalAtlas.meta.channel='normal';
  result.normalAtlas.meta.colorImage=image;
  result.normalAtlas.meta.normalEncoding={...structuredClone(result.atlas.meta.normalMap)};
  result.normalPng=await sharp(Buffer.from(sheet),{raw:{width:w,height:h,channels:4}}).png().toBuffer();
  return result;
}
