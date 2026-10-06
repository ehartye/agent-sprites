import {test,expect} from 'vitest';
import {generateUIRecipe,packGrid} from '../../server/authoring/ui.js';
import {createBitmapFont,drawNineSlice,getOpaqueBounds,drawPixelFit} from '../../server/build/ui-runtime.mjs';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';

test('font publishes deterministic editable glyphs, metrics, game symbols, and crisp bounded raster',()=>{
  const recipe=generateUIRecipe({kind:'font'});expect(generateUIRecipe({kind:'font'})).toEqual(recipe);
  expect(recipe.report).toMatchObject({kind:'font',cellSize:{width:8,height:12},baseline:9,lineHeight:12});
  for(const char of 'AaZzgypq 0129·’‘“”…—−×↑↓←→↗↩✦✕Ⅱ▤♧☷☼é')expect(recipe.report.glyphs[char]).toBeDefined();
  expect(recipe.report.glyphs[' '].frames).toEqual({});
  const renderer=new CanvasRenderer(new Palette());
  for(const frame of recipe.report.frames){
    const cell=new Cell({w:8,h:12});
    for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
      const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
    }
    const pixels=renderer.renderCellRaw(cell);expect(pixels.some(v=>v>0)).toBe(true);
    for(let i=3;i<pixels.length;i+=4)expect([0,255]).toContain(pixels[i]);
    expect(frame.bounds.left).toBeGreaterThanOrEqual(0);expect(frame.bounds.right).toBeLessThan(8);expect(frame.bounds.bottom).toBeLessThan(12);
  }
});
function fixture(kind){const {report}=generateUIRecipe({kind});return {image:{},report,atlas:{frames:report.frames.map((f,i)=>({filename:f.alias,frame:{x:i*report.cellSize.width,y:0,w:report.cellSize.width,h:report.cellSize.height}}))}};}
test('compact font keeps the full repertoire with smaller authored metrics and integer rendering',()=>{
  const regular=generateUIRecipe({kind:'font'}),compact=generateUIRecipe({kind:'font',face:'compact'});
  expect(compact.report).toMatchObject({cellSize:{width:6,height:10},baseline:7,lineHeight:10,face:'compact'});
  expect(Object.keys(compact.report.glyphs)).toEqual(Object.keys(regular.report.glyphs));
  for(const [char,glyph] of Object.entries(compact.report.glyphs)){
    expect(glyph.advance).toBe(char===' '?3:5);
    if(char!==' '){expect(glyph.bounds.right).toBeLessThan(5);expect(glyph.bounds.bottom).toBeLessThan(10);expect(glyph.bounds.right).toBeGreaterThanOrEqual(0);}
  }
  const report=compact.report,atlas={frames:report.frames.map((f,i)=>({filename:f.alias,frame:{x:i*6,y:0,w:6,h:10}}))};
  const font=createBitmapFont({image:{},report,atlas});
  expect(font.measure('A hint',{scale:2})).toMatchObject({width:56,height:20});
  expect(()=>generateUIRecipe({kind:'skin',face:'compact'})).toThrow(/font/);
  expect(()=>generateUIRecipe({kind:'font',face:'tiny'})).toThrow(/face/);
});
test('runtime wraps with shared metrics, preserves explicit newlines, and draws atlas pixels only',()=>{
  const font=createBitmapFont(fixture('font')),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(font.measure('AB',{scale:2})).toMatchObject({width:24,height:24});
  expect(font.wrap('AA BB\nCC',24,{scale:2})).toEqual(['AA','BB','CC']);
  expect(font.wrap('ABCDE',24,{scale:2})).toEqual(['AB','CD','E']);
  expect(font.missingGlyphs('A🦋')).toEqual(['🦋']);
  font.draw(ctx,'Agé',2,4,{scale:2});expect(calls).toHaveLength(3);
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
  expect(()=>font.draw(ctx,'A',0,0,{scale:1.5})).toThrow(/integer/);
  font.draw(ctx,'🦋',0,0,{scale:2});expect(calls).toHaveLength(4);
  expect(()=>font.draw(ctx,'A',0,0,{tone:'missing'})).toThrow(/tone/);
});
test('custom character subsets always include fallback and space and pack near-square with only unnamed padding',()=>{
  const full=generateUIRecipe({kind:'font'}),characters=Object.keys(full.report.glyphs).slice(0,128).join('');
  const subset=generateUIRecipe({kind:'font',characters}),grid=subset.operations[0];
  expect(grid.rows*grid.cols).toBeGreaterThanOrEqual(subset.report.frames.length);expect(grid.rows*grid.cols-subset.report.frames.length).toBeLessThan(grid.cols);
  expect(subset.report.glyphs['?']).toBeDefined();expect(subset.report.glyphs[' '].advance).toBe(4);
});
test('disabled button artwork is visually distinct from normal artwork',()=>{
  const recipe=generateUIRecipe({kind:'skin'}),renderer=new CanvasRenderer(new Palette());
  const pixels=alias=>{const f=recipe.report.frames.find(f=>f.alias===alias),cell=new Cell({w:24,h:24});for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===f.cell)){const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);}return renderer.renderCellRaw(cell);};
  expect(pixels('button_disabled')).not.toEqual(pixels('button_normal'));
});
test('skin has reusable metrics and nine-slice preserves corner pixels at integer scales',()=>{
  const data=fixture('skin'),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(data.report.skins.button_normal.insets).toEqual({left:4,right:4,top:4,bottom:4});
  for(const alias of ['panel_dark','panel_light','button_normal','button_hover','button_pressed','button_disabled','button_focus','slot_selected','scrim','icon_leaf','icon_bag','icon_sun','icon_bag_ink','progress_track','progress_fill'])expect(data.report.frames.some(f=>f.alias===alias)).toBe(true);
  expect(data.report.skins.progress_fill.content).toEqual({x:0,y:11,w:24,h:2});
  drawNineSlice(ctx,data,'button_normal',0,0,80,32,{scale:2});
  expect(calls[0].slice(-4)).toEqual([0,0,8,8]);
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
  expect(()=>drawNineSlice(ctx,data,'button_normal',0,0,81,32,{scale:2})).toThrow(/multiple/);
});
test.each([null,[],{kind:'other'},{kind:'font',typo:true},{kind:'font',characters:'🦋'},{kind:'skin',characters:'a'},{kind:'font',theme:'unknown'}])('rejects unsupported UI recipe %j',config=>expect(()=>generateUIRecipe(config)).toThrow());

test('message skins publish legible tones, fixed corner metrics and a solid compositing scrim',()=>{
  const recipe=generateUIRecipe({kind:'skin'}),renderer=new CanvasRenderer(new Palette());
  const pixels=alias=>{const frame=recipe.report.frames.find(f=>f.alias===alias),cell=new Cell({w:24,h:24});for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);}return renderer.renderCellRaw(cell);};
  for(const name of ['message','speech','specimen','specimen_mount','specimen_label','note','notification','warning']){
    const metrics=recipe.report.skins[name];expect(metrics.insets).toEqual({left:6,right:6,top:6,bottom:6});expect(metrics.padding.left).toBeGreaterThan(metrics.insets.left);
    expect(metrics.textTone).toBe(['note','specimen_label'].includes(name)?'ink':'cream');
    // The tiled middle edges are uniform; corner marks must not become a repeated rule.
    const raster=pixels(name),row=y=>Array.from(raster.subarray(y*24*4,(y+1)*24*4));
    for(let y=7;y<18;y++)expect(row(y)).toEqual(row(6));
  }
  expect(pixels('speech')).not.toEqual(pixels('specimen'));expect(pixels('note')).not.toEqual(pixels('panel_light'));
  const scrim=pixels('scrim_solid');for(let i=3;i<scrim.length;i+=4)expect(scrim[i]).toBe(255);
  expect(recipe.report.skins.scrim_solid).toMatchObject({opacity:0.48,insets:{left:0,right:0,top:0,bottom:0}});
  const data=fixture('skin'),calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  drawNineSlice(ctx,data,'specimen_label',0,0,624,182,{scale:2});
  for(const call of calls)for(const n of call.slice(1))expect(Number.isInteger(n)).toBe(true);
});

test('pixel fit crops transparent padding and preserves non-square art at whole scales',()=>{
  const data=new Uint8ClampedArray(12*10*4);data[(3*12+2)*4+3]=255;data[(6*12+7)*4+3]=1;
  const bounds=getOpaqueBounds({data,width:12,height:10});expect(bounds).toEqual({x:2,y:3,width:6,height:4});
  const calls=[],ctx={drawImage:(...args)=>calls.push(args)};
  expect(drawPixelFit(ctx,{},bounds,{x:3,y:5,width:61,height:49},{padding:8})).toEqual({x:12,y:15,width:42,height:28,scale:7});
  expect(ctx.imageSmoothingEnabled).toBe(false);expect(calls[0].slice(1)).toEqual([2,3,6,4,12,15,42,28]);
  expect(drawPixelFit(ctx,{},bounds,{x:0,y:0,width:5,height:3})).toBe(null);expect(calls).toHaveLength(1);
  expect(getOpaqueBounds({data:new Uint8Array(16),width:2,height:2})).toBe(null);
  expect(drawPixelFit(ctx,{},null,{x:0,y:0,width:20,height:20})).toBe(null);
  expect(()=>getOpaqueBounds({data:[],width:2,height:2})).toThrow(/RGBA/);
  expect(()=>drawPixelFit(ctx,{},bounds,{x:0.5,y:0,width:20,height:20})).toThrow(/integer/);
  expect(()=>drawPixelFit(ctx,{},bounds,{x:0,y:0,width:20,height:20},{padding:-1})).toThrow(/nonnegative/);
});

test('packGrid picks the squarest sheet, so 166 skin cells are not a 2 column strip',()=>{
  const {cols,rows}=packGrid(166,24,24);
  expect(cols*rows).toBeGreaterThanOrEqual(166);expect(cols).toBeGreaterThan(8);
  expect(Math.max(cols,rows)/Math.min(cols,rows)).toBeLessThan(1.3);
  expect(packGrid(1,8,12)).toEqual({cols:1,rows:1});expect(packGrid(7,8,8).cols*packGrid(7,8,8).rows).toBeGreaterThanOrEqual(7);
  const skin=generateUIRecipe({kind:'skin',theme:'wasteland'}),grid=skin.operations[0];
  expect(grid.cols*24/(grid.rows*24)).toBeLessThan(1.5);expect(grid.rows*grid.cols-skin.report.frames.length).toBeLessThan(grid.cols);
});
test('every theme gets symbol glyphs, named in the report',()=>{
  const {report}=generateUIRecipe({kind:'font'});
  for(const name of ['heart','skull','check','star','moon','bolt','sun','drop','wheat','lock','cross'])expect(report.glyphs[report.symbols[name]],name).toBeDefined();
  expect(report.symbols.heart).toBe('♥');
  for(const tone of ['cream','muted','gold','ink'])expect(report.glyphs['♥'].frames[tone]).toBe('glyph_2665_'+tone);
  expect(generateUIRecipe({kind:'font',face:'compact'}).report.symbols.skull).toBe('☠');
});
test('display face draws every regular glyph twice as big with outline, bevel and shadow, in whole pixels',()=>{
  const regular=generateUIRecipe({kind:'font',theme:'wasteland'}),display=generateUIRecipe({kind:'font',theme:'wasteland',face:'display'});
  expect(display.report).toMatchObject({face:'display',cellSize:{width:12,height:24},baseline:19,lineHeight:24});
  expect(Object.keys(display.report.glyphs)).toEqual(Object.keys(regular.report.glyphs));
  expect(display.report.glyphs.A.advance).toBe(12);expect(display.report.glyphs[' '].advance).toBe(8);
  expect(generateUIRecipe({kind:'font',theme:'wasteland',face:'display'})).toEqual(display);
  const colorsOf=tone=>new Set(display.operations.filter(o=>o.color&&o.cell===display.report.frames.find(f=>f.alias==='glyph_0041_'+tone).cell).map(o=>o.color));
  expect(colorsOf('gold').size).toBe(4);expect(colorsOf('gold').has('#f0d466')).toBe(true);expect(colorsOf('ink').has('#e3cf93')).toBe(true);
  for(const f of display.report.frames){expect(f.bounds.right).toBeLessThan(12);expect(f.bounds.bottom).toBeLessThan(24);}
  for(const [char,glyph] of Object.entries(display.report.glyphs))if(char!==' ')expect(glyph.bounds.right-glyph.bounds.left,char).toBeGreaterThanOrEqual(2);
});
test('wasteland skin carries the colour symbol icons',()=>{
  const {report}=generateUIRecipe({kind:'skin',theme:'wasteland'});
  for(const n of ['skull','wheat','bolt','sun','moon','star','check','cross','lock'])expect(report.skins['sym_'+n],n).toMatchObject({icon:true,color:true});
  expect(generateUIRecipe({kind:'skin'}).report.skins.sym_skull).toBeUndefined();
});

test('logo kind draws one deterministic stacked logotype frame with sun and wheat',()=>{
  const a=generateUIRecipe({kind:'logo',theme:'wasteland'}),b=generateUIRecipe({kind:'logo',theme:'wasteland'});
  expect(a).toEqual(b);
  expect(a.report.kind).toBe('logo');expect(a.report.frames.map(f=>f.alias)).toEqual(['logo']);
  const {width,height}=a.report.cellSize;expect(width).toBeGreaterThan(120);expect(height).toBeGreaterThan(80);expect(a.operations[0]).toMatchObject({cols:1,rows:1,size:`${width}x${height}`});
  expect(a.report.frames[0].bounds).toMatchObject({left:0,top:expect.any(Number),right:width-1,bottom:height-1});
  expect(new Set(a.operations.filter(o=>o.color).map(o=>o.color)).size).toBeGreaterThan(10);
  expect(generateUIRecipe({kind:'logo',text:'GREEN ACRES'}).report.cellSize.width).toBeGreaterThan(width);
  expect(()=>generateUIRecipe({kind:'logo',text:'aé'})).toThrow(/Logo text/);
  expect(()=>generateUIRecipe({kind:'skin',text:'X'})).toThrow(/logos/);
  expect(()=>generateUIRecipe({kind:'logo',face:'display'})).toThrow(/fonts/);
});
test('wasteland skin has the boss banner plate with wide insets',()=>{
  const {report}=generateUIRecipe({kind:'skin',theme:'wasteland'});
  expect(report.skins.banner_boss).toMatchObject({insets:{left:8,right:8,top:8,bottom:8},minWidth:24});
  expect(generateUIRecipe({kind:'skin'}).report.skins.banner_boss).toBeUndefined();
});
