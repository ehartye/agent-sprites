import { describe, it, expect } from 'vitest';
import { kinds, validatePanels, generateScene } from '../examples/storyboard-panels/generate.mjs';

const scene = kind => [1,2,3].map(stage => ({id:`${kind}-${stage}`,scene:'Example',stage,kind}));

describe('storyboard panel manifest', () => {
  it('sorts numeric stages and preserves arbitrary string-stage order', () => {
    expect([...validatePanels(scene('farm').reverse()).values()][0].map(p=>p.stage)).toEqual([1,2,3]);
    const labels=scene('farm').map((p,i)=>({...p,stage:['before','work','after'][i]}));
    expect([...validatePanels(labels).values()][0].map(p=>p.stage)).toEqual(['before','work','after']);
  });
  it('rejects missing stages, duplicate stages and unsafe or repeated IDs', () => {
    expect(()=>validatePanels(scene('farm').slice(1))).toThrow('exactly three');
    expect(()=>validatePanels(scene('farm').map(p=>({...p,stage:1})))).toThrow('distinct');
    expect(()=>validatePanels(scene('farm').map(p=>({...p,id:'../outside'})))).toThrow('filename-safe');
    expect(()=>validatePanels(scene('farm').map(p=>({...p,id:'same'})))).toThrow('unique');
    expect(()=>validatePanels(scene('farm').map((p,i)=>({...p,id:i===0?'Same':i===1?'same':'other'})))).toThrow('unique');
    expect(()=>validatePanels(scene('unknown'))).toThrow('Unsupported');
    expect(()=>validatePanels(scene('farm').map((p,i)=>i? p:{...p,stage:'start'}))).toThrow('mix');
  });
  it.each(kinds)('produces three distinct named-shape compositions for %s', kind => {
    const ops=generateScene(scene(kind));
    expect(ops[0]).toMatchObject({command:'new',size:'256x144',rows:1,cols:3});
    const cells=[0,1,2].map(i=>ops.filter(op=>op.command==='draw'&&op.cell===`0,${i}`));
    for(const shapes of cells){
      expect(shapes.length).toBeGreaterThan(18);
      expect(new Set(shapes.map(s=>s.name)).size).toBe(shapes.length);
      expect(shapes[0].name).toBe('sky');
    }
    // Ignore beat markers so content, not the stage index alone, must differ.
    const content=cells.map(shapes=>JSON.stringify(shapes.filter(s=>!s.name.startsWith('stage_')).map(({cell,...s})=>s)));
    expect(new Set(content).size).toBe(3);
  });
});
