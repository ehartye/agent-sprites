import {test} from 'vitest';
import assert from 'node:assert/strict';
import * as module from '../../server/build/ui-runtime.mjs';
const records=[{kind:'absolute',state:'visible'},{kind:'text',state:'visible'}];
const plane={width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])};
const command=(x,sx,width=1)=>({kind:'image',bounds:{x,y:0,width,height:1},source:{x:sx,y:0,width,height:1},asset:{plane},contextId:'c',tint:0xffffff,opacity:1});
test('ordered glyph pixels preserve pass order and transparent overlap',()=>{
 assert.equal(typeof module.rasterPassiveTextEntry,'function');
 const result=module.rasterPassiveTextEntry(records,[command(0,0,2),command(0,1)]);
 assert.deepEqual([...result.data],[0,0,255,255,0,0,255,255]);
 assert.deepEqual(result.bounds,{x:0,y:0,width:2,height:1});
});
test('intrinsic clipping retains local origin and leaves clipped pixels transparent',()=>{
 const result=module.rasterPassiveTextEntry(records,[{...command(-1,0,2),clip:{x:0,y:0,width:1,height:1}}]);
 assert.deepEqual([...result.data],[0,0,0,0,0,0,255,255]);
});
test('unsupported paint takes the original path rather than approximating',()=>{
 for(const change of [{opacity:.5},{tint:0xff0000},{bounds:{x:.5,y:0,width:1,height:1}},{bounds:{x:0,y:0,width:2,height:1}},{clip:{x:.5,y:0,width:1,height:1}},{feedback:{hover:1}}])assert.equal(module.rasterPassiveTextEntry(records,[{...command(0,0),...change}]),null);
 assert.equal(module.rasterPassiveTextEntry([{kind:'button',state:'visible'}],[command(0,0)]),null);
 assert.equal(module.rasterPassiveTextEntry([{kind:'text',state:'hidden'}],[command(0,0)]),null);
 const fractional={width:1,height:1,data:new Uint8Array([255,0,0,128])};
 assert.equal(module.rasterPassiveTextEntry(records,[{...command(0,0),asset:{plane:fractional}}]),null);
 assert.equal(module.rasterPassiveTextEntry(records,[command(0,0,2)],{maxBytes:4}),null);
});
