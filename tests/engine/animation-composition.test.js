import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAnimationComposition } from '../../server/authoring/animation-composition.js';
import { buildLayerTree } from '../../server/web/public/js/shared/shape-layers.js';
import { Shape } from '../../server/engine/shape.js';

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'animation-compose-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const shape = (name, x = 0, params = {}) => ({
  id: `source-${name}`,
  name,
  type: 'rect',
  params: { x, y: 0, w: 2, h: 2, filled: true, ...params },
  color: 'ink',
  visible: true,
  zIndex: 0
});
function source(file = 'child.project.json', extra = {}) {
  const data = {
    version: 1,
    name: 'child',
    cellWidth: 4,
    cellHeight: 4,
    grid: { rows: 1, cols: 2 },
    palette: [
      { name: 'ink', color: '#123456' },
      { name: 'paper', color: '#abcdef' }
    ],
    background: { mode: 'transparent' },
    cells: {
      '0,0': { name: 'first', shapes: [shape('body', 0)] },
      '0,1': { name: 'second', shapes: [shape('body', 1)] }
    },
    groups: { walk: ['0,0', '0,1'] },
    animationFps: { walk: 5 },
    frameDurations: { '0,0': 100, '0,1': 200 },
    ...extra
  };
  writeFileSync(join(dir, file), JSON.stringify(data));
  return data;
}
const scene = () => ({
  name: 'scene',
  size: 8,
  palette: 'pico8',
  parts: { child: { project: 'child.project.json', group: 'walk' } },
  placements: [{ kind: 'stamp', name: 'left', part: 'child', x: 1, y: 2 }]
});

test('retains editable primitives, source identity, isolated canvas, palette and exact event timing', () => {
  const input = source();
  input.cells['0,0'].shapes.push({
    ...shape('hidden', 2, { pattern: 'checker', color2: 'paper' }),
    visible: false,
    zIndex: 1
  });
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(input));
  const before = readFileSync(join(dir, 'child.project.json'), 'utf8'),
    result = generateAnimationComposition(scene(), dir);
  expect(result.operations[0]).toMatchObject({
    command: 'new',
    name: 'scene',
    size: 8,
    cols: 2,
    rows: 1
  });
  expect(
    result.operations.filter((o) => o.command === 'duration').map((o) => o.ms)
  ).toEqual([100, 200]);
  const draws = result.operations.filter((o) => o.command === 'draw');
  expect(draws[0]).toMatchObject({
    type: 'rect',
    name: 'scene:left:body',
    color: '#123456',
    x: 1,
    y: 2,
    w: 2,
    h: 2,
    layers: [
      { x: 1, y: 2, w: 4, h: 4, z: 0, background: { mode: 'transparent' } }
    ],
    composition: {
      prefix: 'scene',
      part: 'child',
      instance: 'left',
      localName: 'body',
      source: { project: 'child.project.json', cell: '0,0', shape: 'body' }
    }
  });
  expect(draws[1]).toMatchObject({ visible: false, color2: '#abcdef' });
  expect(result.operations.at(-1)).toMatchObject({
    command: 'group',
    sub: 'create',
    name: 'scene',
    cells: ['0,0', '0,1'],
    loop: true
  });
  expect(result.report).toMatchObject({
    kind: 'animation',
    durationMs: 300,
    loop: true,
    limits: {
      maxAnimatedInstances: 1024,
      maxFrames: 4096,
      maxDurationMs: 60000,
      maxShapes: 200000,
      maxRasterWork: 64000000
    }
  });
  expect(result.report.sources[0]).toMatchObject({
    path: 'child.project.json',
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
  });
  expect(readFileSync(join(dir, 'child.project.json'), 'utf8')).toBe(before);
});

test('respects reverse/pingpong groups, explicit repeated frames and independent cell/group/default duration', () => {
  source('child.project.json', {
    frameDurations: { '0,0': 70 },
    animationDirections: { walk: 'pingpong_reverse' }
  });
  const cfg = scene(),
    result = generateAnimationComposition(cfg, dir);
  expect(result.report.parts.child.sequence.map((f) => f.cell)).toEqual([
    '0,1',
    '0,0'
  ]);
  expect(
    result.operations.filter((o) => o.command === 'duration').map((o) => o.ms)
  ).toEqual([200, 70]);
  cfg.parts.child = {
    project: 'child.project.json',
    frames: ['first', 'first', 'second'],
    loop: false
  };
  const repeated = generateAnimationComposition(cfg, dir);
  expect(
    repeated.operations.filter((o) => o.command === 'duration').map((o) => o.ms)
  ).toEqual([70, 70, 125]);
  expect(repeated.report.loop).toBe(false);
});

test('retains full joint periods and offsets while stable random phases survive declaration reordering', () => {
  source('a.project.json', { frameDurations: { '0,0': 101, '0,1': 101 } });
  source('b.project.json', { frameDurations: { '0,0': 103, '0,1': 103 } });
  const cfg = {
    ...scene(),
    seed: 'scene-seed',
    size: 4,
    parts: {
      a: { project: 'a.project.json', group: 'walk' },
      b: { project: 'b.project.json', group: 'walk' }
    },
    placements: [
      { kind: 'stamp', name: 'a', part: 'a', x: 0, y: 0, randomPhase: true },
      {
        kind: 'stamp',
        name: 'b',
        part: 'b',
        x: 0,
        y: 0,
        phaseMs: 17,
        delayMs: 23
      }
    ]
  };
  const result = generateAnimationComposition(cfg, dir);
  expect(result.report.durationMs).toBe(20806);
  expect(result.report.frames.length).toBeLessThan(420);
  cfg.placements.reverse();
  cfg.parts = { b: cfg.parts.b, a: cfg.parts.a };
  const reordered = generateAnimationComposition(cfg, dir);
  expect(
    Object.fromEntries(result.report.instances.map((i) => [i.name, i.phaseMs]))
  ).toEqual(
    Object.fromEntries(
      reordered.report.instances.map((i) => [i.name, i.phaseMs])
    )
  );
});

test('reuses G2 tile and seeded scatter origins and rejects static temporal controls', () => {
  const cfg = {
    name: 'scene',
    size: 8,
    palette: 'pico8',
    parts: {
      dot: {
        shapes: [
          { name: 'dot', type: 'point', params: { x: 0, y: 0 }, color: 'red' }
        ]
      }
    },
    placements: [
      {
        kind: 'tile',
        name: 'tile',
        part: 'dot',
        x: 1,
        y: 2,
        cols: 2,
        rows: 2,
        stepX: 3,
        stepY: 4
      },
      {
        kind: 'scatter',
        name: 'spray',
        part: 'dot',
        x: 0,
        y: 0,
        w: 8,
        h: 8,
        count: 2,
        seed: 'scatter'
      }
    ]
  };
  const result = generateAnimationComposition(cfg, dir);
  expect(
    result.report.instances.slice(0, 4).map((i) => [i.name, i.x, i.y])
  ).toEqual([
    ['tile/r0c0', 1, 2],
    ['tile/r0c1', 4, 2],
    ['tile/r1c0', 1, 6],
    ['tile/r1c1', 4, 6]
  ]);
  expect(generateAnimationComposition(cfg, dir)).toEqual(result);
  cfg.placements[0].delayMs = 0;
  expect(() => generateAnimationComposition(cfg, dir)).toThrow(
    /static.*temporal|temporal.*static/i
  );
});

test('prefixes nested source layers and represents empty background child canvases', () => {
  const data = source();
  data.cells['0,0'].shapes[0].params.layers = [
    {
      id: 'inner',
      x: 0,
      y: 1,
      w: 2,
      h: 2,
      z: 3,
      background: { mode: 'transparent' }
    }
  ];
  data.cells['0,1'].shapes = [];
  data.background = { mode: 'chroma', color: '#234567' };
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  const result = generateAnimationComposition(scene(), dir),
    draws = result.operations.filter((o) => o.command === 'draw');
  expect(draws[0].layers).toHaveLength(2);
  expect(draws[0].layers[1]).toMatchObject({ x: 1, y: 3, w: 2, h: 2, z: 3 });
  expect(draws[0].layers[1].id).not.toBe('inner');
  expect(draws[1]).toMatchObject({
    type: 'point',
    visible: false,
    layers: [{ background: { mode: 'chroma', color: '#234567' } }]
  });
});

test.each([
  [
    (cfg) => {
      cfg.parts.child.group = 'missing';
    },
    /group/
  ],
  [
    (cfg) => {
      cfg.parts.child.frames = ['0,0'];
    },
    /exactly one/
  ],
  [
    (cfg) => {
      cfg.parts.child.project = 'C:/absolute.project.json';
    },
    /relative|portable/
  ],
  [
    (cfg) => {
      cfg.parts.child.frames = ['missing'];
      delete cfg.parts.child.group;
    },
    /cell|frame/
  ],
  [
    (cfg) => {
      cfg.placements[0].randomPhase = true;
    },
    /seed/
  ],
  [
    (cfg) => {
      cfg.durationMs = 250;
    },
    /complete|boundary/
  ],
  [
    (cfg) => {
      cfg.placements[0].kind = 'tile';
      Object.assign(cfg.placements[0], {
        cols: 1025,
        rows: 1,
        stepX: 0,
        stepY: 0
      });
    },
    /1024/
  ]
])('rejects malformed or unbounded declarations (%#)', (mutate, message) => {
  source();
  const cfg = scene();
  mutate(cfg);
  expect(() => generateAnimationComposition(cfg, dir)).toThrow(message);
});

test('rejects unnamed or duplicate source shapes and dangerous geometry before expansion', () => {
  const data = source();
  data.cells['0,0'].shapes[0].name = null;
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  expect(() => generateAnimationComposition(scene(), dir)).toThrow(/name/);
  data.cells['0,0'].shapes = [shape('body'), shape('body')];
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  expect(() => generateAnimationComposition(scene(), dir)).toThrow(
    /duplicate|unique/
  );
  data.cells['0,0'].shapes = [shape('body', 0, { w: 1e12 })];
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  expect(() => generateAnimationComposition(scene(), dir)).toThrow(
    /geometry|bound/
  );
});

test('placement paint order keeps multi-shape static parts together and child source layer order intact', () => {
  const data = source();
  data.cells['0,0'].shapes = [
    { ...shape('under'), zIndex: 0 },
    {
      ...shape('nested'),
      zIndex: 10,
      params: {
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        filled: true,
        layers: [
          {
            id: 'nested',
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            z: 5,
            background: { mode: 'transparent' }
          }
        ]
      }
    },
    { ...shape('over'), zIndex: 9 }
  ];
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  const cfg = scene();
  cfg.parts.back = {
    shapes: [
      { name: 'a', type: 'point', params: { x: 0, y: 0 }, color: '#fff' },
      { name: 'b', type: 'point', params: { x: 1, y: 0 }, color: '#fff' },
      { name: 'c', type: 'point', params: { x: 2, y: 0 }, color: '#fff' }
    ]
  };
  cfg.placements.unshift({
    kind: 'stamp',
    name: 'back',
    part: 'back',
    x: 0,
    y: 0
  });
  const result = generateAnimationComposition(cfg, dir),
    draws = result.operations.filter(
      (op) => op.command === 'draw' && op.cell === '0,0'
    );
  const tree = buildLayerTree(
    draws.map(
      ({ type, name, color, visible, z, command, cell, ...params }) => ({
        type,
        name,
        color,
        visible,
        zIndex: z,
        params
      })
    ),
    8,
    8
  );
  expect(
    tree.children.map((unit) =>
      unit.kind === 'shape' ? unit.shape.name : unit.id
    )
  ).toEqual([
    'scene:back:a',
    'scene:back:b',
    'scene:back:c',
    'scene:left:canvas'
  ]);
  expect(
    tree.children
      .at(-1)
      .children.map((unit) =>
        unit.kind === 'shape'
          ? unit.shape.params.composition.localName
          : unit.id
      )
  ).toEqual(['under', 'scene:left:nested:nested', 'over']);
});

test('rejects total expanded shape and raster work budgets without capping output', () => {
  source('child.project.json', { frameDurations: { '0,0': 1, '0,1': 1 } });
  const cfg = scene();
  cfg.durationMs = 4096;
  cfg.placements[0] = {
    kind: 'tile',
    name: 'many',
    part: 'child',
    x: 0,
    y: 0,
    cols: 50,
    rows: 1,
    stepX: 0,
    stepY: 0
  };
  expect(() => generateAnimationComposition(cfg, dir)).toThrow(/200000/);
  cfg.durationMs = 2;
  cfg.size = 2048;
  cfg.placements[0].cols = 1;
  source('child.project.json', {
    cellWidth: 2048,
    cellHeight: 2048,
    frameDurations: { '0,0': 1, '0,1': 1 }
  });
  cfg.durationMs = 20;
  expect(() => generateAnimationComposition(cfg, dir)).toThrow(/64000000/);
});

test('counts padded sheet cells in the raster work budget', () => {
  source('child.project.json', { frameDurations: { '0,0': 1, '0,1': 1 } });
  const cfg = scene();
  cfg.size = 2048;
  cfg.parts.child = {
    project: 'child.project.json',
    frames: Array(15).fill('0,0'),
    loop: false
  };
  expect(() => generateAnimationComposition(cfg, dir)).toThrow(/64000000/);
});

test('flood fills charge their innermost nested surface rather than the smaller source canvas',()=>{
  const data=source();
  const layers=[{id:'large-child',x:0,y:0,w:2048,h:2048,z:0,background:{mode:'transparent'}}];
  data.cells['0,0'].shapes=Array.from({length:16},(_,i)=>({...shape(`fill-${i}`),type:'fill',params:{x:0,y:0,layers}}));
  writeFileSync(join(dir,'child.project.json'),JSON.stringify(data));
  const cfg=scene();cfg.parts.child={project:'child.project.json',frames:['0,0']};
  expect(()=>generateAnimationComposition(cfg,dir)).toThrow(/64000000/);
});

test('source reads never reserve imported IDs and excessive nested layers reject explicitly', () => {
  const data = source();
  data.cells['0,0'].shapes[0].id = 's90000000000';
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  const before = new Shape('point', { x: 0, y: 0 }, '#000');
  generateAnimationComposition(scene(), dir);
  const after = new Shape('point', { x: 0, y: 0 }, '#000');
  expect(Number(after.id.slice(1))).toBe(Number(before.id.slice(1)) + 1);
  data.cells['0,0'].shapes[0].params.layers = Array.from(
    { length: 8 },
    (_, i) => ({
      id: `nested-${i}`,
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      z: 0,
      background: { mode: 'transparent' }
    })
  );
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  expect(() => generateAnimationComposition(scene(), dir)).toThrow(/at most 8/);
});

test('static retained layers namespace each repeated instance and respect placement paint order', () => {
  const layers = [
    {
      id: 'literal',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      z: 0,
      background: { mode: 'transparent' }
    }
  ];
  const cfg = {
    name: 'scene',
    size: 8,
    parts: {
      dot: {
        shapes: [
          {
            name: 'dot',
            type: 'point',
            params: { x: 0, y: 0, layers },
            color: '#fff'
          }
        ]
      }
    },
    placements: [
      {
        kind: 'tile',
        name: 'dots',
        part: 'dot',
        x: 1,
        y: 2,
        rows: 1,
        cols: 2,
        stepX: 3,
        stepY: 0
      }
    ]
  };
  let result;
  expect(() => {
    result = generateAnimationComposition(cfg, dir);
  }).not.toThrow();
  const draws = result.operations.filter((op) => op.command === 'draw');
  expect(draws[0].layers[0].id).not.toBe(draws[1].layers[0].id);
  expect(draws.map((op) => op.layers[0].x)).toEqual([1, 4]);
  expect(draws[1].layers[0].z).toBeGreaterThan(draws[0].layers[0].z);
});

test('source primitives with absent filled retain their outline geometry', () => {
  const data = source();
  delete data.cells['0,0'].shapes[0].params.filled;
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  const result = generateAnimationComposition(scene(), dir);
  expect(
    result.operations.find((operation) => operation.command === 'draw').filled
  ).toBe(false);
});

test('qualified source names survive a second editable composition and excessive expansion rejects explicitly',()=>{
  const data=source();data.cells['0,0'].shapes[0].name='a'.repeat(150);
  writeFileSync(join(dir,'child.project.json'),JSON.stringify(data));
  const cfg=scene();cfg.parts.child.frames=['0,0'];delete cfg.parts.child.group;
  const first=generateAnimationComposition(cfg,dir);
  const shapes=first.operations.filter(op=>op.command==='draw').map(op=>{
    const {command,cell,type,name,color,visible,z,...params}=op;
    return {id:name,type,name,color,visible,zIndex:z,params};
  });
  const nested={...data,cellWidth:8,cellHeight:8,grid:{rows:1,cols:1},cells:{'0,0':{name:'nested',shapes}},groups:{scene:['0,0']},frameDurations:{'0,0':100}};
  writeFileSync(join(dir,'nested.project.json'),JSON.stringify(nested));
  const second=generateAnimationComposition({...scene(),name:'outer',parts:{child:{project:'nested.project.json',group:'scene'}}},dir);
  const draw=second.operations.find(op=>op.command==='draw');
  expect(draw.layers).toHaveLength(2);
  expect(draw.composition.source.shape).toBe(shapes[0].name);
  data.cells['0,0'].shapes[0].name='%'.repeat(4096);
  writeFileSync(join(dir,'child.project.json'),JSON.stringify(data));
  expect(()=>generateAnimationComposition(cfg,dir)).toThrow(/qualified.*4096/i);
});

test('source outline normalization drops ignored pattern fields and preserves explicit single-pose one-shot policy', () => {
  const data = source();
  Object.assign(data.cells['0,0'].shapes[0].params, {
    filled: false,
    pattern: 'checker',
    color2: 'paper'
  });
  writeFileSync(join(dir, 'child.project.json'), JSON.stringify(data));
  const cfg = scene();
  cfg.parts.child = {
    project: 'child.project.json',
    frames: ['first'],
    loop: false
  };
  const result = generateAnimationComposition(cfg, dir),
    draw = result.operations.find((operation) => operation.command === 'draw');
  expect(draw.filled).toBe(false);
  expect(draw.pattern).toBeUndefined();
  expect(draw.color2).toBeUndefined();
  expect(result.report.loop).toBe(false);
});
