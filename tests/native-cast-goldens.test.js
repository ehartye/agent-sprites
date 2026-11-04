// Golden hashes for the drawn pixels of the native cast: every cast member in the everyday outfit, plus the field, retro and
// service outfits for one adult (gardener) and one child (child). Each hash covers the decoded pixels, not PNG bytes: per cell,
// in cell-name order, the visible [x, y, color] pixels after later draw operations replace earlier ones at the same coordinate,
// sorted by y then x. A change to any template that moves a pixel of a cast member fails here.
// The fixture is a flat map from a case name to a sha256. A changed hash needs a reviewed reason (name it in the pull request
// and the release notes). To regenerate it after a deliberate, reviewed change:
//   UPDATE_GOLDENS=1 npx vitest run tests/native-cast-goldens.test.js
// A plain run never writes the fixture.
import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {cast,castTemplate} from '../examples/native-character/generate-cast.mjs';

const FIXTURE=new URL('./fixtures/native-cast-hashes.json',import.meta.url);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Later draw operations replace earlier ones at the same coordinate (same reduction as native-costume.test.js).
const visible=(ops,cell)=>new Map(ops.filter(o=>o.command==='draw'&&o.cell===cell).map(p=>[`${p.x},${p.y}`,p]));
const pixels=map=>[...map.values()].map(p=>[p.x,p.y,p.color]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
const cellPixels=(id,outfit)=>{
  const ops=castTemplate(id,outfit);
  const cells=[...new Set(ops.filter(o=>o.command==='draw').map(o=>o.cell))].sort();
  return cells.map(cell=>[cell,pixels(visible(ops,cell))]);
};

const cases=new Map();
for(const {id} of cast.characters)cases.set(`${id}/everyday`,()=>sha(cellPixels(id,'everyday')));
for(const id of ['gardener','child'])for(const outfit of ['field','retro','service'])cases.set(`${id}/${outfit}`,()=>sha(cellPixels(id,outfit)));

if(process.env.UPDATE_GOLDENS==='1'){
  const next=Object.fromEntries([...cases].map(([name,compute])=>[name,compute()]));
  writeFileSync(FIXTURE,JSON.stringify(next,null,1)+'\n');
  console.log(`UPDATE_GOLDENS: wrote ${Object.keys(next).length} hashes to tests/fixtures/native-cast-hashes.json`);
}
const golden=JSON.parse(readFileSync(FIXTURE,'utf8'));

describe('native cast pixels are unchanged',()=>{
  test('the fixture lists exactly the cases the test computes',()=>expect(Object.keys(golden).sort()).toEqual([...cases.keys()].sort()));
  test.each([...cases.keys()])('%s',name=>expect(cases.get(name)()).toBe(golden[name]));
});
