import {test,expect} from 'vitest';
import {generateUIRecipe} from '../../server/authoring/ui.js';
import {createBitmapFont,drawNineSlice} from '../../server/build/ui-runtime.mjs';
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
test('custom character subsets always include fallback and space without empty padding cells',()=>{
  const full=generateUIRecipe({kind:'font'}),characters=Object.keys(full.report.glyphs).slice(0,128).join('');
  const subset=generateUIRecipe({kind:'font',characters}),grid=subset.operations[0];
  expect(grid.rows*grid.cols).toBe(subset.report.frames.length);
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
