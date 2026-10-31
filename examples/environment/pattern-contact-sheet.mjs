// Contact sheet of the layered-terrain pattern kinds: bedding, crystals and sheen, alone and together.
//
// Regenerate the sheet from the repository root:
//
//   node examples/environment/pattern-contact-sheet.mjs
//   node examples/environment/pattern-contact-sheet.mjs --zoom 6 --out ./sheet.png
//
// It writes examples/environment/pattern-contact-sheet.png (or --out). Each row is one custom material. The first line of a row
// is six variants of the material side by side with a gap, each a 32x32 tile (pixelScale 2) before the zoom; the second line is the
// same six tiles joined with no gap, as they sit in a map, so seams and repeats show. Rows from the top: bedding, crystals, sheen,
// all three on a five-colour ramp with the default grain, and all three with soft grain. The page is caption-free by design.
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import sharp from 'sharp';
import {GRID,materialTile,validateCustomMaterial} from '../../server/authoring/environment-materials.js';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:fallback;};
const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(option('out',resolve(here,'pattern-contact-sheet.png')));
const zoom=Math.max(1,Math.min(12,Number(option('zoom',4))||4));
const SEED=7,VARIANTS=6,PIXEL=2,GAP=4;

const rows=[
  {name:'sandstone',ramp:['#b08f68','#8a6a4a','#d2b48a','#ead7b0'],patterns:[{kind:'bedding',density:.8}],grain:'none'},
  {name:'frost',ramp:['#6f8fa6','#4a6a82','#a8c8da','#e4f4fa'],patterns:[{kind:'crystals',density:.7}],grain:'none'},
  {name:'glacier',ramp:['#3f6f78','#2c4f5a','#6fa0a8','#d8f4f0'],patterns:[{kind:'sheen',density:.6}],grain:'none'},
  {name:'strata',ramp:['#7a6a4f','#4e4130','#b09c74','#e8dcae','#2a2118'],patterns:[{kind:'bedding',density:.6},{kind:'crystals',density:.4},{kind:'sheen',density:.4}]},
  {name:'strata-soft',ramp:['#7a6a4f','#4e4130','#b09c74','#e8dcae','#2a2118'],patterns:[{kind:'bedding',density:.6},{kind:'crystals',density:.4},{kind:'sheen',density:.4}],grain:'soft'},
];
const BACKGROUND=[24,22,28];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

const tileWidth=GRID*PIXEL,rowHeight=tileWidth*2+GAP*3;
const width=VARIANTS*tileWidth+(VARIANTS+1)*GAP,height=rows.length*rowHeight+GAP;
const canvas=Buffer.alloc(width*height*3);
for(let i=0;i<width*height;i++)canvas.set(BACKGROUND,i*3);
const paint=(ox,oy,tile)=>{
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
    const color=rgb(tile[y*GRID+x]);
    for(let dy=0;dy<PIXEL;dy++)for(let dx=0;dx<PIXEL;dx++)canvas.set(color,((oy+y*PIXEL+dy)*width+ox+x*PIXEL+dx)*3);
  }
};
rows.forEach((row,r)=>{
  const spec=validateCustomMaterial(row,[]);
  const tiles=Array.from({length:VARIANTS},(_,v)=>materialTile(row.name,spec,v,SEED,v));
  const top=GAP+r*rowHeight;
  tiles.forEach((tile,v)=>{
    paint(GAP+v*(tileWidth+GAP),top,tile);
    paint(GAP+v*tileWidth,top+tileWidth+GAP,tile);
  });
});
await sharp(canvas,{raw:{width,height,channels:3}}).resize(width*zoom,height*zoom,{kernel:'nearest'}).png().toFile(out);
console.log(`wrote ${out} (${width*zoom}x${height*zoom})`);
