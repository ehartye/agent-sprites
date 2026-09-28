# Native 16×32 Character Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the primary Stardew-style 16×32 mannequins per-frame body sides, a published character report, and an owner-approved held trowel, per `docs/superpowers/specs/2026-09-28-native-character-report-design.md`.

**Architecture:** An authored joint table (`joints.mjs`) is the single source of shoulder/wrist/hip landmarks and hand boxes; left/back/large are derived. Generators may print `{ operations, report }`; the build publishes the report, the playback runtime and manifest entries. A native report builder turns ops plus joints into the recipe-compatible report. The trowel is drawn per pixel by role and is gated on owner art review.

**Tech Stack:** Node ESM, vitest, node-canvas, the agent-sprites build (`server/build/project-build.js`), `server/build/playback-runtime.mjs`, `server/authoring/humanoid-poses.js` (`bodySideRole`).

**Repo conventions (read first):**
- Work on a feature branch per task group; never commit to `main`. Squash-merge PRs.
- Working copies are CRLF; edit with tools that preserve line endings. After edits run `node --check` on changed `.mjs/.js` files.
- Full suite on this machine: `npx vitest run --maxWorkers=4 --testTimeout=60000 --hookTimeout=60000` (plain parallel runs time out under load).
- After changing server or script code: bump the version in `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, run `npm install --package-lock-only --ignore-scripts`, then `node scripts/setup.js` and require `node scripts/setup.js --check --json` to report `"ok":true`. If it reports a running-server mismatch, stop the repo server on port 3377 by PID.
- Rebuild every native preset after changing generator output:
  `for f in examples/native-character/*.build.json; do node scripts/run-managed.js build "$f" --json; done` and copy each `dist/<name>/contact.png` over `examples/native-character/preview/<name>.png` when that preview exists.

---

## File structure

- Create `examples/native-character/joints.mjs` — authored `JOINTS` table, `handBoxes()` (moved verbatim from `dress-template.mjs`), `jointsFor()` derivation.
- Modify `examples/native-character/dress-template.mjs` — read hand boxes from `handBoxes()`; print `{operations, report}` from its CLI entry.
- Create `examples/native-character/native-report.mjs` — `nativeReport(ops, kind, {gear})`.
- Modify `examples/native-character/generate-template.mjs`, `generate-cast.mjs` — print `{operations, report}`.
- Modify `server/build/project-build.js` — accept `{operations, report}` generator output and publish the report.
- Modify `server/build/playback-runtime.mjs` — `directions` mapping in aliases; clear error without locomotion.
- Create `examples/native-character/native-gear.mjs` — 16×32 trowel drawing (Task 5, owner-gated).
- Tests: `tests/native-joints.test.js`, `tests/cli/generator-report.test.js`, `tests/native-report.test.js`, `tests/native-gear.test.js`.

---

### Task 1: Joint table and hand-box move (no output change)

**Files:**
- Create: `examples/native-character/joints.mjs`
- Modify: `examples/native-character/dress-template.mjs:25-31`
- Test: `tests/native-joints.test.js`

- [ ] **Step 1: Capture the byte-identical baseline**

Before touching code, record every native build output hash:

```bash
cd C:/Users/ehart/repos/claude-sprites
for f in examples/native-character/*.build.json; do node scripts/run-managed.js build "$f" --json >/dev/null; done
node -e "const fs=require('fs'),c=require('crypto');const out={};for(const d of fs.readdirSync('examples/native-character/dist')){const p='examples/native-character/dist/'+d;for(const f of fs.readdirSync(p))if(/\.(png|atlas\.json)$/.test(f))out[d+'/'+f]=c.createHash('sha256').update(fs.readFileSync(p+'/'+f)).digest('hex');}fs.writeFileSync(process.env.TEMP+'/native-baseline.json',JSON.stringify(out,null,1));console.log(Object.keys(out).length,'files hashed')"
```
Expected: `153 files hashed` (51 builds × sheet, contact sheet and atlas).

- [ ] **Step 2: Write the failing joint tests**

Create `tests/native-joints.test.js`:

```js
import {test,expect} from 'vitest';
import {JOINTS,jointsFor,handBoxes} from '../examples/native-character/joints.mjs';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';

const FACINGS=['front','right','back','left'];
const cellOf=(ops,as)=>ops.find(o=>o.command==='name'&&o.as===as).cell;
const aliasOf=(facing,phase)=>phase===null?facing:`${facing}_walk_${phase}`;

for(const kind of ['adult','child','large'])test(`${kind}: every landmark sits on or beside a body pixel of its frame`,()=>{
  const ops=nativeMannequin(kind);
  for(const facing of FACINGS)for(const phase of [null,0,1,2,3]){
    const cell=cellOf(ops,aliasOf(facing,phase)),pts=ops.filter(o=>o.command==='draw'&&o.cell===cell);
    const j=jointsFor(kind,facing,phase);
    for(const side of ['left','right'])for(const joint of ['shoulder','wrist','hip']){
      const [x,y]=j[side][joint];
      expect(pts.some(p=>Math.abs(p.x-x)<=1&&Math.abs(p.y-y)<=1),`${kind} ${aliasOf(facing,phase)} ${side} ${joint} ${x},${y}`).toBe(true);
    }
  }
});

test('left mirrors right with side labels swapped',()=>{
  for(const phase of [null,0,1,2,3]){
    const r=jointsFor('adult','right',phase),l=jointsFor('adult','left',phase);
    for(const joint of ['shoulder','wrist','hip']){
      expect(l.left[joint]).toEqual([15-r.right[joint][0],r.right[joint][1]]);
      expect(l.right[joint]).toEqual([15-r.left[joint][0],r.left[joint][1]]);
    }
  }
});

test('back reuses front positions with side labels swapped',()=>{
  const f=jointsFor('adult','front',1),b=jointsFor('adult','back',1);
  expect(b.left).toEqual(f.right);expect(b.right).toEqual(f.left);
});

test('large maps adult x through the broadening split',()=>{
  const a=jointsFor('adult','front',0),g=jointsFor('large','front',0);
  const split=x=>x<7?x-1:x>8?x+1:x;
  expect(g.right.shoulder).toEqual([split(a.right.shoulder[0]),a.right.shoulder[1]]);
});

test('idle uses phase 0, and the table covers 8 source poses per body',()=>{
  expect(jointsFor('child','right',null)).toEqual(jointsFor('child','right',0));
  expect(Object.keys(JOINTS.adult).sort()).toEqual(['front_0','front_1','front_2','front_3','right_0','right_1','right_2','right_3']);
  expect(handBoxes('adult','right',1)).toEqual([[2,20,4,22],[11,20,13,22]]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/native-joints.test.js`
Expected: FAIL — cannot resolve `../examples/native-character/joints.mjs`.

- [ ] **Step 4: Create `examples/native-character/joints.mjs`**

```js
// Authored body landmarks for the 16×32 source poses (cell pixels, bob included).
// Front: the character's right is on the image left. Right profile: the right side
// is near. Left, back and large are derived — never author them.
// Rows marked "review" were ambiguous in the art; the owner confirms them on the overlay.
export const JOINTS = {
  adult: {
    front_0: {right:{shoulder:[4,15],wrist:[3,21],hip:[6,21]},left:{shoulder:[11,15],wrist:[12,21],hip:[9,21]}},
    front_1: {right:{shoulder:[4,16],wrist:[4,20],hip:[6,22]},left:{shoulder:[11,16],wrist:[11,22],hip:[9,22]}},
    front_2: {right:{shoulder:[4,15],wrist:[3,21],hip:[6,21]},left:{shoulder:[11,15],wrist:[12,21],hip:[9,21]}},
    front_3: {right:{shoulder:[4,16],wrist:[4,22],hip:[6,22]},left:{shoulder:[11,16],wrist:[11,20],hip:[9,22]}},
    right_0: {right:{shoulder:[8,15],wrist:[5,20],hip:[8,21]},left:{shoulder:[9,15],wrist:[10,21],hip:[9,21]}},
    right_1: {right:{shoulder:[8,16],wrist:[12,21],hip:[8,22]},left:{shoulder:[9,16],wrist:[3,21],hip:[9,22]}},
    right_2: {right:{shoulder:[8,15],wrist:[5,20],hip:[8,21]},left:{shoulder:[9,15],wrist:[10,21],hip:[9,21]}},
    right_3: {right:{shoulder:[8,16],wrist:[3,22],hip:[8,22]},left:{shoulder:[9,16],wrist:[11,21],hip:[9,22]}},
  },
  child: {
    front_0: {right:{shoulder:[4,20],wrist:[2,24],hip:[6,24]},left:{shoulder:[11,20],wrist:[12,24],hip:[9,24]}},
    front_1: {right:{shoulder:[4,21],wrist:[4,24],hip:[6,25]},left:{shoulder:[11,21],wrist:[10,24],hip:[9,25]}},
    front_2: {right:{shoulder:[4,20],wrist:[2,24],hip:[6,24]},left:{shoulder:[11,20],wrist:[12,24],hip:[9,24]}},
    front_3: {right:{shoulder:[4,21],wrist:[5,24],hip:[6,25]},left:{shoulder:[11,21],wrist:[11,24],hip:[9,25]}},
    // Standing profile: the far hand is hidden, so its wrist sits behind the body.
    right_0: {right:{shoulder:[8,20],wrist:[5,24],hip:[8,24]},left:{shoulder:[9,20],wrist:[9,24],hip:[9,24]}},
    right_1: {right:{shoulder:[8,21],wrist:[3,24],hip:[8,25]},left:{shoulder:[9,21],wrist:[11,23],hip:[9,25]}}, // review
    right_2: {right:{shoulder:[8,20],wrist:[5,24],hip:[8,24]},left:{shoulder:[9,20],wrist:[9,24],hip:[9,24]}},
    right_3: {right:{shoulder:[8,21],wrist:[10,24],hip:[8,25]},left:{shoulder:[9,21],wrist:[4,24],hip:[9,25]}}, // review
  },
};

/** Hand boxes that clothing leaves exposed. Moved verbatim from dress-template.mjs. */
export function handBoxes(kind, dir, phase) {
  const neutral=phase%2===0;
  let hands=kind==='adult'?(dir==='right'?(neutral?[[4,20,7,21],[10,21,11,22]]:phase===1?[[2,20,4,22],[11,20,13,22]]:[[2,21,4,23],[10,20,12,22]]):(neutral?[[2,20,4,23],[11,20,13,23]]:[[3,19,5,21],[10,21,12,23]])):
    (dir==='right'?(neutral?[[4,24,7,25]]:phase===1?[[2,24,4,25],[11,23,12,24]]:[[3,24,5,25],[10,24,11,25]]):(neutral?[[1,23,4,25],[11,23,14,25]]:[[3,23,5,25],[9,24,11,25]]));
  if(dir!=='right'&&phase===3)hands=hands.map(([l,t,r,b])=>[15-r,t,15-l,b]);
  return hands;
}

const mirror=([x,y])=>[15-x,y];
const split=([x,y])=>[x<7?x-1:x>8?x+1:x,y];
const mapSides=(j,f)=>({left:Object.fromEntries(Object.entries(j.left).map(([k,v])=>[k,f(v)])),right:Object.fromEntries(Object.entries(j.right).map(([k,v])=>[k,f(v)]))});
const swap=j=>({left:j.right,right:j.left});

/** Landmarks for a published frame. phase null is the idle pose (phase 0 art). */
export function jointsFor(kind, facing, phase) {
  const source=kind==='large'?'adult':kind, p=phase??0;
  const row=f=>JOINTS[source][`${f}_${p}`];
  let j;
  if(facing==='front') j=row('front');
  else if(facing==='back') j=swap(row('front'));
  else if(facing==='right') j=row('right');
  else if(facing==='left') j=swap(mapSides(row('right'),mirror));
  else throw new Error(`Unknown facing ${facing}`);
  return kind==='large'?mapSides(j,split):structuredClone(j);
}
```

- [ ] **Step 5: Point `dress-template.mjs` at `handBoxes`**

In `examples/native-character/dress-template.mjs`, add to the imports:

```js
import {handBoxes} from './joints.mjs';
```

Replace the two-statement block starting `let hands=kind==='adult'?(dir==='right'?...` through `if(dir!=='right'&&phase===3)hands=hands.map(...)` with:

```js
    const hands=handBoxes(kind,dir,phase);
```

- [ ] **Step 6: Run the joint tests**

Run: `npx vitest run tests/native-joints.test.js`
Expected: PASS. If a `large` landmark fails the on-body test (its arm bands move some arm pixels), add to `joints.mjs`:

```js
// Large-body landmarks the column split alone misplaces, keyed `${facing}_${phase}` → {side:{joint:[x,y]}}.
export const LARGE_OVERRIDES = {};
```

and in `jointsFor` replace `return kind==='large'?mapSides(j,split):structuredClone(j);` with:

```js
  if(kind!=='large')return structuredClone(j);
  const g=mapSides(j,split),o=LARGE_OVERRIDES[`${facing}_${p}`]??{};
  for(const side of ['left','right'])Object.assign(g[side],o[side]??{});
  return g;
```

then add an entry per failure using the nearest body pixel named in the failure message, and rerun.

- [ ] **Step 7: Prove the move is byte-identical**

Rebuild all native presets (command in "Repo conventions"), then:

```bash
node -e "const fs=require('fs'),c=require('crypto');const base=JSON.parse(fs.readFileSync(process.env.TEMP+'/native-baseline.json'));let diff=0;for(const [k,h] of Object.entries(base)){const now=c.createHash('sha256').update(fs.readFileSync('examples/native-character/dist/'+k)).digest('hex');if(now!==h){diff++;console.log('CHANGED',k)}}console.log(diff,'changed')"
```
Expected: `0 changed`.

- [ ] **Step 8: Run related suites and commit**

Run: `npx vitest run tests/native-joints.test.js tests/native-wardrobe.test.js tests/native-costume.test.js tests/native-garment-corners.test.js --testTimeout=60000`
Expected: PASS.

```bash
git checkout -b feat/native-joints
git add examples/native-character/joints.mjs examples/native-character/dress-template.mjs tests/native-joints.test.js
git commit -m "feat(native): authored joint table for 16x32 poses; hand boxes move into it"
```

### Task 2: Owner review of the joint overlay (gate)

**Files:**
- Create (review-only, not committed): `examples/native-character/drafts/joints.html`

- [ ] **Step 1: Render an overlay page**

Create `examples/native-character/drafts/joints.html` that loads `../dist/adult/native-adult.atlas.json`, `../dist/child/native-child.atlas.json`, `../dist/large/native-large.atlas.json` and their PNGs, draws every frame at 12×, and plots each landmark from `jointsFor` (inline a copy of the table via `<script type="module">import {jointsFor} from '../joints.mjs'</script>`): shoulder = cyan, wrist = yellow, hip = magenta, with `R`/`L` labels. Serve `examples/native-character` with the scratch static server on port 8765 bound to `0.0.0.0` (`Cache-Control: no-store`).

- [ ] **Step 2: Ask the owner to review**

Share `http://hal9000:8765/drafts/joints.html`. Point out the two `// review` rows (child `right_1`, `right_3`). **Stop until the owner confirms or corrects landmarks.** Apply any corrections to `JOINTS`, rerun Task 1 Steps 6–8.

- [ ] **Step 3: Merge Task 1**

Push `feat/native-joints`, open a PR, squash-merge after the full suite passes, delete the remote branch, sync `main`. Delete `examples/native-character/drafts/`.

### Task 3: Generator reports in the build (no output change)

**Files:**
- Modify: `server/build/project-build.js:121-129, 165-176, 190-191`
- Test: `tests/cli/generator-report.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/cli/generator-report.test.js`:

```js
import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProject} from '../../server/build/project-build.js';

let dir;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-genreport-'));});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const OPS=[{command:'new',name:'dot',size:8,rows:1,cols:1},{command:'draw',type:'point',cell:'0,0',name:'p',x:1,y:1,color:'#ffffff'},{command:'name',cell:'0,0',as:'front'}];
const REPORT={version:1,ok:true,kind:'character',system:'native',cellSize:{width:8,height:8},ground:7,frames:[{alias:'front',cell:'0,0',direction:'front',frame:null,sides:{},gear:[],bounds:{left:1,top:1,right:1,bottom:1}}]};
async function build(output){
  writeFileSync(join(dir,'gen.mjs'),`process.stdout.write(${JSON.stringify(JSON.stringify(output))})`);
  writeFileSync(join(dir,'sprite-project.json'),JSON.stringify({version:1,generator:'gen.mjs',output:'dist',scale:1}));
  return buildProject(join(dir,'sprite-project.json'));
}

test('a generator printing { operations, report } publishes the character report and runtime',async()=>{
  const r=await build({operations:OPS,report:REPORT});
  expect(r.errors).toEqual([]);
  expect(JSON.parse(readFileSync(r.artifacts.characterReport,'utf8'))).toEqual(REPORT);
  expect(existsSync(r.artifacts.playbackRuntime)).toBe(true);
  const m=JSON.parse(readFileSync(r.artifacts.manifest,'utf8'));
  expect(m).toMatchObject({source:'generator',kind:'character',report:'character-report.json'});
},30000);

test('a plain operations array builds exactly as before',async()=>{
  const r=await build(OPS);
  expect(r.errors).toEqual([]);
  expect(r.artifacts.characterReport).toBeUndefined();
  expect(r.artifacts.playbackRuntime).toBeUndefined();
},30000);

test.each([
  [{report:REPORT},/operations array or \{ operations, report \}/],
  [{operations:OPS,report:{kind:'terrain'}},/character report with frames/],
])('malformed generator output fails before publication: %j',async(output,error)=>{
  const r=await build(output);
  expect(r.ok).toBe(false);
  expect(r.errors[0].message).toMatch(error);
  expect(existsSync(join(dir,'dist'))).toBe(false);
},30000);
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/cli/generator-report.test.js`
Expected: FAIL (report artifacts undefined; malformed output not rejected with those messages).

- [ ] **Step 3: Implement in `server/build/project-build.js`**

Replace `operations = JSON.parse(generated.stdout);` with:

```js
      const generatedOut = JSON.parse(generated.stdout);
      if (Array.isArray(generatedOut)) operations = generatedOut;
      else {
        // Generators may publish a character report beside their operations.
        if (!generatedOut || !Array.isArray(generatedOut.operations)) throw new Error('Generator output must be an operations array or { operations, report }.');
        if (generatedOut.report !== undefined && (generatedOut.report?.kind !== 'character' || !Array.isArray(generatedOut.report.frames))) throw new Error('Generator report must be a character report with frames.');
        operations = generatedOut.operations;
        recipeReport = generatedOut.report;
      }
```

Replace the report-writing block:

```js
    if (inline) {
      artifacts[`${sourceKind}Report`] = `${sourceKind}-report.json`;
      writeFileSync(join(stage, artifacts[`${sourceKind}Report`]), json(recipeReport));
    }
    if (sourceKind === 'character' || sourceKind === 'environment') {
```

with:

```js
    // Inline recipes name their report by source; generator reports are character reports.
    const reportKey = inline ? `${sourceKind}Report` : recipeReport ? 'characterReport' : null;
    if (reportKey) {
      artifacts[reportKey] = reportKey.replace(/Report$/, '-report.json');
      writeFileSync(join(stage, artifacts[reportKey]), json(recipeReport));
    }
    if (sourceKind === 'character' || sourceKind === 'environment' || recipeReport?.kind === 'character') {
```

Replace `if (inline) manifest.report = artifacts[`${sourceKind}Report`];` with:

```js
    if (reportKey) manifest.report = artifacts[reportKey];
```

- [ ] **Step 4: Run tests, then the build suites**

Run: `npx vitest run tests/cli/generator-report.test.js tests/cli/build-manifest.test.js tests/cli/project-build.test.js --testTimeout=60000`
Expected: PASS.

- [ ] **Step 5: Version, full suite, commit, PR, merge**

Bump to the next minor, run setup (see conventions), run the full suite (expect all pass), then:

```bash
git checkout -b feat/generator-reports
git add server/build/project-build.js tests/cli/generator-report.test.js package.json package-lock.json .claude-plugin
git commit -m "feat(build): generators may publish a character report beside their operations"
```
Push, PR, squash-merge, sync.

### Task 4: Native reports for bodies, wardrobe and cast

**Files:**
- Create: `examples/native-character/native-report.mjs`
- Modify: `examples/native-character/generate-template.mjs`, `examples/native-character/dress-template.mjs` (CLI entry, last line), `examples/native-character/generate-cast.mjs` (CLI entry, last line)
- Modify: `server/build/playback-runtime.mjs` (`createWalker`)
- Test: `tests/native-report.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/native-report.test.js`:

```js
import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {jointsFor} from '../examples/native-character/joints.mjs';
import {attachmentFor,groundAnchor,createWalker} from '../server/build/playback-runtime.mjs';
import {bodySideRole} from '../server/authoring/humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};

test('the native report matches the recipe contract with native names',()=>{
  const ops=nativeMannequin('adult'),r=nativeReport(ops,'adult');
  expect(r).toMatchObject({version:1,ok:true,kind:'character',system:'native',cellSize:{width:16,height:32},ground:29,
    aliases:{idle:'{direction}',walk:'{direction}_walk_{frame}'},directions:{down:'front',up:'back',right:'right',left:'left'}});
  expect(r.frames).toHaveLength(20);
  for(const f of r.frames){
    const j=jointsFor('adult',f.direction,f.frame);
    for(const side of ['left','right']){
      expect(f.sides[side]).toEqual({role:bodySideRole(side,RUNTIME[f.direction]),...j[side]});
    }
    expect(f.gear).toEqual([]);
    expect(f.bounds.bottom).toBe(29);
  }
});

test('runtime helpers work from a native report; the walker explains what is missing',()=>{
  const r=nativeReport(nativeMannequin('child'),'child'),f=r.frames.find(x=>x.alias==='right');
  expect(groundAnchor(r,f)).toEqual({x:8,y:29});
  expect(attachmentFor(f,'right','wrist',groundAnchor(r,f),100,200,{scale:2})).toMatchObject({role:'near',layer:'over-body'});
  expect(()=>createWalker([r],{person:'',outfit:'',mode:'continuous-root',facing:'right'}).update(1,0)).toThrow(/no locomotion data in this report/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/native-report.test.js`
Expected: FAIL — cannot resolve `native-report.mjs`.

- [ ] **Step 3: Create `examples/native-character/native-report.mjs`**

```js
import {jointsFor} from './joints.mjs';
import {bodySideRole} from '../../server/authoring/humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};

/** Recipe-compatible character report for a native 16×32 sheet. */
export function nativeReport(ops, kind, {gear=[]}={}) {
  const frames=ops.filter(o=>o.command==='name').map(({cell,as:alias})=>{
    const [direction,,phase]=alias.split('_'),frame=phase===undefined?null:Number(phase);
    const pts=ops.filter(o=>o.command==='draw'&&o.cell===cell),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const j=jointsFor(kind,direction,frame);
    const sides=Object.fromEntries(['left','right'].map(side=>[side,{role:bodySideRole(side,RUNTIME[direction]),...j[side]}]));
    return {alias,cell,direction,frame,sides,
      gear:gear.map(g=>({...g,role:sides[g.side].role})),
      bounds:{left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}};
  });
  return {version:1,ok:true,kind:'character',system:'native',cellSize:{width:16,height:32},ground:29,
    aliases:{idle:'{direction}',walk:'{direction}_walk_{frame}'},
    directions:{down:'front',up:'back',right:'right',left:'left'},frames};
}
```

- [ ] **Step 4: Teach the walker the report's direction names and the locomotion error**

In `server/build/playback-runtime.mjs` `createWalker`, replace

```js
  const name = (mode, direction, frame) => fill(aliases[mode], { person, outfit, direction, frame });
```

with

```js
  const directions = [].concat(reports).find(r => r.directions)?.directions ?? {};
  const name = (mode, direction, frame) => fill(aliases[mode], { person, outfit, direction: directions[direction] ?? direction, frame });
```

and in `gait`, after the existing `if (!frame) throw ...` line, add:

```js
    if (!frame.locomotion) throw new Error('no locomotion data in this report');
```

- [ ] **Step 5: Print `{operations, report}` from the generator entry points**

`examples/native-character/generate-template.mjs` becomes:

```js
import {nativeMannequin} from './native-mannequin.mjs';
import {nativeReport} from './native-report.mjs';
const kind = process.argv[2] ?? 'adult';
if (!['adult','child','large'].includes(kind)) throw new Error('Choose adult, child or large');
const operations = nativeMannequin(kind, process.argv[3] ?? 'peach');
process.stdout.write(JSON.stringify({operations, report: nativeReport(operations, kind)}));
```

In `dress-template.mjs`, replace the last line's `process.stdout.write(JSON.stringify(dressTemplate(...process.argv.slice(2))))` with:

```js
{const operations=dressTemplate(...process.argv.slice(2));process.stdout.write(JSON.stringify({operations,report:nativeReport(operations,process.argv[2]??'adult')}));}
```
and add `import {nativeReport} from './native-report.mjs';` to its imports.

In `generate-cast.mjs`, replace the last line's `process.stdout.write(JSON.stringify(castTemplate(process.argv[2]??'farmer',process.argv[3]??'everyday')))` with:

```js
{const id=process.argv[2]??'farmer',operations=castTemplate(id,process.argv[3]??'everyday'),kind=cast.characters.find(c=>c.id===id).kind??'adult';process.stdout.write(JSON.stringify({operations,report:nativeReport(operations,kind)}));}
```
and add `import {nativeReport} from './native-report.mjs';`.

- [ ] **Step 6: Run tests, rebuild presets, prove pixels unchanged**

Run: `npx vitest run tests/native-report.test.js tests/engine/playback-runtime.test.js tests/engine/runtime-contracts.test.js --testTimeout=60000` → PASS.
Rebuild all native presets, rerun the Task 1 Step 7 hash check → `0 changed`. Confirm `examples/native-character/dist/adult/character-report.json` exists and `dist/adult-wig-short/` has none.

- [ ] **Step 7: Docs, version, full suite, commit, PR, merge**

Update `examples/native-character/README.md`: builds now publish `character-report.json` and `playback-runtime.mjs`; list the report fields and that `createWalker` needs phase 2. Update the `sprite-character` skill row for the 16×32 system: remove "does not yet emit a character report", say it reports `sides` and ground, gear and walking pending. Bump minor, setup, full suite, then:

```bash
git checkout -b feat/native-reports
git add examples/native-character server/build/playback-runtime.mjs skills/sprite-character/SKILL.md tests/native-report.test.js package.json package-lock.json .claude-plugin
git commit -m "feat(native): 16x32 builds publish a character report with body sides"
```
Push, PR, squash-merge, sync.

### Task 5: 16×32 trowel drafts (owner gate)

**Files:**
- Create: `examples/native-character/native-gear.mjs`
- Modify: `examples/native-character/native-mannequin.mjs` (`finishNative` callers pass gear outline), `dress-template.mjs` and `generate-template.mjs` (`gear=trowel:<side>` argument), `cast/manifest.json` (optional `gear` field)
- Test: `tests/native-gear.test.js` (measurement assertions added in Task 6)

- [ ] **Step 1: Parse and validate gear**

In `native-gear.mjs`:

```js
export const NATIVE_GEAR=['trowel'];
/** "trowel:right" args or profile objects → validated gear list (one hand item per side). */
export function parseGear(input=[]){
  const list=input.map(g=>typeof g==='string'?(([item,side])=>({item,side}))(g.replace(/^gear=/,'').split(':')):g);
  const seen=new Set();
  for(const g of list){
    if(!NATIVE_GEAR.includes(g.item))throw new Error(`Unknown gear item: ${g.item}`);
    if(!['left','right'].includes(g.side))throw new Error(`Gear side must be left or right, not ${g.side}`);
    if(seen.has(g.side))throw new Error(`Only one hand item per side (${g.side})`);seen.add(g.side);
  }
  return list;
}
```

- [ ] **Step 2: Draft the trowel drawing**

Starting pixel template (offsets from the wrist `[wx, wy]`; `f` = +1 facing right, −1 facing left; H = handle, M = blade metal, O = outline). Front/back: H at `[wx,wy]`,`[wx,wy+1]`; O at `[wx-1,wy+2]`,`[wx+1,wy+2]`,`[wx-1,wy+3]`,`[wx+1,wy+3]`,`[wx,wy+4]`; M at `[wx,wy+2]`,`[wx,wy+3]`. Profile: H at `[wx,wy]`,`[wx+f,wy]`; O at `[wx+2f,wy-1]`,`[wx+3f,wy]`,`[wx+2f,wy+2]`,`[wx+3f,wy+1]`; M at `[wx+2f,wy]`,`[wx+2f,wy+1]`. Drop any pixel outside the 16×32 cell. This is a draft for the owner, not final art.

In `native-gear.mjs`, `drawNativeGear(ops, kind, gear, palette)` adds, for each frame and gear item, points at the wrist from the report sides (`nativeReport` sides give role): a 1×2 handle (`palette.handle`) through the wrist and a 2×3 blade (`palette.metal`) below/forward with an outline (`palette.outline`), in front/back views pointing down and in profiles pointing forward. Role `far`: only add a pixel where no body pixel exists; otherwise add on top (replace the top-layer pixel at that position). Name points `gear_trowel_<side>_<n>` and add a `gear` shape group per cell; add `palette.outline` to the sheet's outline set via `finishNative(ops,[palette.outline])`.

- [ ] **Step 3: Build candidates and open a casting review**

Build a baseline and `gear=trowel:right` for adult and child (idle + walk rows) into scratch builds, render 4× strips, and start a casting session with a no-gear baseline and **no prediction**. Measure per facing the changed pixels versus baseline (near/far counts, mean x in front/back). Share the casting URL and measurements with the owner. **Stop until the owner approves the art or asks for changes.**

### Task 6: Approved trowel, tests, docs, ship

- [ ] **Step 1: Write the measurement tests**

Create `tests/native-gear.test.js` asserting, against a no-gear build of the same body: near facing ≥ 4 changed pixels; far facing ≤ 2; front right-hand trowel mean x < 8, back > 8; every near walk frame ≥ 4; `parseGear` rejects unknown items, bad sides and duplicate sides; report frames list the gear with its role; shapes in a `gear` group named `gear_trowel_<side>_*`. Run: expect PASS with the approved art.

- [ ] **Step 2: Regression**

Rebuild all presets; the Task 1 hash check must show `0 changed` for every sheet that declares no gear.

- [ ] **Step 3: Docs, version, full suite, ship**

Document `gear=trowel:<side>` and the cast `gear` field in the native README and the `sprite-character` skill. Bump minor, setup, full suite, commit on `feat/native-trowel`, PR, squash-merge, sync. Update the wiki: `native-and-recipe-character-parity` phase 1 shipped (PRs), phase 2 (walking) planned with its own spec.
