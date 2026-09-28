import {test,expect} from 'vitest';
import {dressTemplate} from '../examples/native-character/dress-template.mjs';
import {castTemplate,cast} from '../examples/native-character/generate-cast.mjs';
import {wigTemplate} from '../examples/native-character/generate-wig.mjs';
import {finishNative,outlineColorsOf} from '../examples/native-character/native-mannequin.mjs';
import {cutOutlineCorners} from '../server/engine/outline-corners.js';

const byCell=ops=>{const m=new Map();for(const o of ops)if(o.command==='draw'){if(!m.has(o.cell))m.set(o.cell,new Map());m.get(o.cell).set(o.x+','+o.y,o);}return m;};
// Costume edge pixels carry the profile outline colour without a group, as castTemplate knows.
const costumeOutline=i=>[cast.characters[i].colors?.o??'#26333f'];
const cases=[
 ['adult jacket',()=>dressTemplate('adult','jacket'),[]],
 ['child dress',()=>dressTemplate('child','dress'),[]],
 ['cast everyday',()=>castTemplate(cast.characters[0].id),costumeOutline(0)],
 ['cast pressure suit',()=>castTemplate(cast.characters[1].id,'field'),costumeOutline(1)],
];

test.each(cases)('%s: every outline colour in the sheet gets its outside corners cut once',(label,make,extra)=>{
 const ops=make(),colors=outlineColorsOf(ops,extra);
 expect(colors.size).toBeGreaterThan(1); // skin plus garment or hair outlines
 // Published output is already finished: a second pass may only find corners the first created.
 const again=cutOutlineCorners(ops,colors).removed;
 expect(again.length,label).toBeLessThan(ops.filter(o=>o.command==='name').length*3);
 for(const px of byCell(ops).values())for(const p of px.values())if(!colors.has(p.color))
  expect([[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>px.has((p.x+dx)+','+(p.y+dy))),`${label} fill exposed at ${p.cell} ${p.x},${p.y}`).toBe(true);
});

test('garment outlines lose corners that the body-only cut left square',()=>{
 const raw=dressTemplate('adult','jacket',undefined,undefined,{finish:false});
 const {removed}=cutOutlineCorners(raw,outlineColorsOf(raw));
 const garmentCorners=removed.filter(p=>raw.find(o=>o.command==='draw'&&o.cell===p.cell&&o.x===p.x&&o.y===p.y&&!o.name.startsWith('large-')&&/-(cloth|trim|trousers|shoes|hair)-/.test(o.name)));
 expect(garmentCorners.length).toBeGreaterThan(0);
 expect(finishNative(raw)).toEqual(dressTemplate('adult','jacket'));
});

test('wigs are cut in the composite, then extracted',()=>{
 const wig=wigTemplate('adult','short').filter(o=>o.command==='draw');
 const composite=dressTemplate('adult','jacket','peach','short');
 const hair=composite.filter(o=>o.command==='draw'&&o.name.includes('-hair-'));
 expect(wig.map(o=>[o.cell,o.x,o.y,o.color])).toEqual(hair.map(o=>[o.cell,o.x,o.y,o.color]));
});
