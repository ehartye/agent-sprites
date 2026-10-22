// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { Workbench } from '../../server/web/public/js/workbench.js';

let bench, project, request, refresh;
const fixture = () => ({
  name: 'Timing study', grid: { rows: 1, cols: 3 },
  cells: { '0,0': { name: 'rest', shapes: [] }, '0,1': { name: 'step', shapes: [] } },
  groups: { walk: ['0,1', 'rest', '0,1'], slow: ['0,0', '0,2'] },
  animationFps: { walk: 4, slow: 2 }, animationLoops: { walk: false },
  animationDirections: { walk: 'reverse' }, frameDurations: { '0,1': 100 },
});
const choose = group => {
  const control = document.querySelector('[name="timing-group"]');
  control.value = group; control.dispatchEvent(new Event('change'));
};
const row = cell => document.querySelector(`[data-timing-cell="${cell}"]`);
const edit = (control, value) => { control.value = value; control.dispatchEvent(new Event('input')); };
const action = (name, within = document) => within.querySelector(`[data-action="timing-${name}"]`);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '<div id="workbench-mount"></div><div id="workbench-status"></div>';
  project = fixture(); refresh = vi.fn();
  request = vi.fn(async (path, body) => {
    if (path === '/workbench/project-summary') return { data: structuredClone(project) };
    if (path === '/cell/duration') {
      if (body.ms === null) delete project.frameDurations[body.cell];
      else project.frameDurations[body.cell] = body.ms;
    }
    if (path === '/group/cell/fps') project.animationFps[body.name] = body.fps;
    if (path === '/group/cell/loop') project.animationLoops[body.name] = body.loop;
    return { data: {} };
  });
  bench = new Workbench({ request, getCell: () => '0,0', getColor: () => '#fff', setColor: vi.fn(), refresh });
  bench.init(); bench.setProject(project, 'timing-session');
});

test('Timing is a workbench tab with bounded canonical grid cells and named aliases', async () => {
  expect(document.querySelector('[data-panel="timing"]')).not.toBeNull();
  await bench.show('timing');
  expect(document.querySelectorAll('[data-timing-cell]')).toHaveLength(3);
  expect(row('0,0').textContent).toContain('rest');
  expect(row('0,0').textContent).toContain('125 ms');
  expect(row('0,0').textContent).toContain('Default');
});

test('group rows preserve first occurrence order, disclose shared ownership and use group inheritance', async () => {
  await bench.show('timing'); choose('walk');
  expect([...document.querySelectorAll('[data-timing-cell]')].map(node => node.dataset.timingCell)).toEqual(['0,1', '0,0']);
  expect(row('0,1').textContent).toContain('2 occurrences');
  expect(document.querySelector('[data-timing-ownership]').textContent).toContain('every group');
  expect(row('0,0').textContent).toContain('250 ms');
  expect(row('0,0').textContent).toContain('Group');
  expect(row('0,1').textContent).toContain('100 ms');
  expect(document.querySelector('[data-timing-playback]').textContent).toContain('reverse');
  choose('slow'); expect(row('0,0').textContent).toContain('500 ms');
  expect(document.querySelector('[name="timing-loop"]').checked).toBe(true);
});

test.each(['constructor', '__proto__'])('group %s inherits actual default FPS and direction', async name => {
  bench.setProject({ ...fixture(), groups: { [name]: ['0,0'] }, animationFps: {}, animationDirections: {} }, 'timing-session');
  await bench.show('timing'); choose(name);
  expect(document.querySelector('[name="timing-fps"]').value).toBe('8');
  expect(document.querySelector('[data-timing-playback]').textContent).toContain('forward');
  expect(row('0,0').textContent).toContain('125 ms');
});

test('setting 75ms and clearing restores 250ms group inheritance through pinned canonical requests', async () => {
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  await vi.waitFor(() => expect(row('0,0').textContent).toContain('75 ms'));
  expect(request).toHaveBeenCalledWith('/cell/duration', { cell: '0,0', ms: 75, group: 'walk' }, { sessionId: 'timing-session' });
  expect(request).toHaveBeenCalledWith('/workbench/project-summary', undefined, { sessionId: 'timing-session' });
  expect(refresh).toHaveBeenCalledTimes(1);
  choose('slow'); expect(row('0,0').textContent).toContain('75 ms');
  choose('walk'); action('clear', row('0,0')).click();
  await vi.waitFor(() => expect(row('0,0').textContent).toContain('250 ms'));
  expect(row('0,0').querySelector('input').value).toBe('');
  expect(request).toHaveBeenCalledWith('/cell/duration', { cell: '0,0', ms: null, group: 'walk' }, { sessionId: 'timing-session' });
});

test('blank overrides inherit, while zero or fractional milliseconds never send a mutation', async () => {
  await bench.show('timing'); choose('walk');
  for (const value of ['0', '2.5', '-1']) {
    edit(row('0,0').querySelector('input'), value); action('apply', row('0,0')).click();
    await settle();
    expect(request).not.toHaveBeenCalled();
    expect(document.querySelector('[data-timing-status]').textContent).toContain('positive');
  }
  edit(row('0,1').querySelector('input'), ''); action('apply', row('0,1')).click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/cell/duration', { cell: '0,1', ms: null, group: 'walk' }, { sessionId: 'timing-session' }));
});

test('FPS and loop controls use their group routes and pinned session', async () => {
  await bench.show('timing'); choose('walk');
  expect(document.querySelector('[name="timing-loop"]').checked).toBe(false);
  edit(document.querySelector('[name="timing-fps"]'), '5'); action('fps').click();
  await vi.waitFor(() => expect(row('0,0').textContent).toContain('200 ms'));
  expect(request).toHaveBeenCalledWith('/group/cell/fps', { name: 'walk', fps: 5 }, { sessionId: 'timing-session' });
  const loop = document.querySelector('[name="timing-loop"]'); loop.checked = true; loop.dispatchEvent(new Event('change'));
  action('loop').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/group/cell/loop', { name: 'walk', loop: true }, { sessionId: 'timing-session' }));
  await vi.waitFor(() => expect(action('loop').disabled).toBe(false));
  expect(document.querySelector('[name="timing-loop"]').checked).toBe(true);
  expect(row('0,1').textContent).toContain('100 ms');
});

test('unusable FPS is rejected before sending', async () => {
  await bench.show('timing'); choose('walk');
  edit(document.querySelector('[name="timing-fps"]'), '1000000'); action('fps').click();
  await settle(); expect(request).not.toHaveBeenCalled();
  expect(document.querySelector('[data-timing-status]').classList.contains('error')).toBe(true);
});

test('preview opens the selected persisted group and closes the drawer', async () => {
  bench.preview = vi.fn(); await bench.show('timing'); choose('walk');
  [...document.querySelectorAll('button')].find(node => node.textContent === 'Open animation preview').click();
  expect(bench.preview).toHaveBeenCalledWith('group:walk');
  expect(bench.mount.hidden).toBe(true);
  await bench.show('timing');
  [...document.querySelectorAll('button')].find(node => node.textContent === 'Open animation preview').click();
  expect(bench.preview).toHaveBeenLastCalledWith('all');
});

test('a failed save preserves the override draft and disables submissions while pending', async () => {
  let rejectSave;
  request.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  expect(action('apply', row('0,0')).disabled).toBe(true);
  expect(action('clear', row('0,1')).disabled).toBe(true);
  action('apply', row('0,0')).click(); expect(request).toHaveBeenCalledTimes(1);
  rejectSave(new Error('Disk full'));
  await vi.waitFor(() => expect(document.querySelector('[data-timing-status]').textContent).toContain('Disk full'));
  expect(row('0,0').querySelector('input').value).toBe('75');
  expect(row('0,0').textContent).toContain('250 ms');
  expect(action('apply', row('0,0')).disabled).toBe(false);
});

test('live project refreshes update resolved timing without discarding row, FPS or loop drafts', async () => {
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75');
  edit(document.querySelector('[name="timing-fps"]'), '7');
  const loop = document.querySelector('[name="timing-loop"]'); loop.checked = true; loop.dispatchEvent(new Event('change'));
  const updated = fixture(); updated.frameDurations['0,0'] = 90;
  bench.setProject(updated, 'timing-session');
  expect(row('0,0').textContent).toContain('90 ms');
  expect(row('0,0').querySelector('input').value).toBe('75');
  expect(document.querySelector('[name="timing-fps"]').value).toBe('7');
  expect(document.querySelector('[name="timing-loop"]').checked).toBe(true);
});

test('edits made during a save survive its canonical response', async () => {
  let resolveSave;
  request.mockImplementation(async path => path === '/cell/duration' ? new Promise(resolve => { resolveSave = resolve; }) : { data: { ...fixture(), frameDurations: { '0,0': 75 } } });
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  edit(row('0,0').querySelector('input'), '80');
  bench.setProject(fixture(), 'timing-session');
  expect(row('0,0').querySelector('input').value).toBe('80');
  resolveSave({ data: {} });
  await vi.waitFor(() => expect(row('0,0').textContent).toContain('75 ms'));
  expect(row('0,0').querySelector('input').value).toBe('80');
});

test('leaving the tab rejects a late mutation result and does not refresh another panel', async () => {
  let resolveSave;
  request.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  await bench.show('handoff'); const content = bench.body.textContent;
  resolveSave({ data: {} }); await settle();
  expect(bench.body.textContent).toBe(content);
  expect(refresh).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
});

test('switching sessions rejects the former session save and retains the new canonical data', async () => {
  let resolveSave;
  request.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  const next = fixture(); next.frameDurations['0,0'] = 160; bench.setProject(next, 'next-session');
  await settle(); resolveSave({ data: {} }); await settle();
  expect(row('0,0').textContent).toContain('160 ms');
  expect(row('0,0').querySelector('input').value).toBe('160');
  expect(refresh).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
});

test('a late canonical read cannot overwrite a newer live project update', async () => {
  let resolveProject;
  request.mockImplementation(async path => path === '/workbench/project-summary' ? new Promise(resolve => { resolveProject = resolve; }) : { data: {} });
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  await vi.waitFor(() => expect(resolveProject).toBeTypeOf('function'));
  const updated = fixture(); updated.frameDurations['0,0'] = 95; bench.setProject(updated, 'timing-session');
  resolveProject({ data: { ...fixture(), frameDurations: { '0,0': 75 } } }); await settle();
  expect(row('0,0').textContent).toContain('95 ms');
  expect(row('0,0').querySelector('input').value).toBe('95');
  const later = fixture(); later.frameDurations['0,0'] = 110; bench.setProject(later, 'timing-session');
  expect(row('0,0').querySelector('input').value).toBe('110');
});

test('a newer live project cannot clear edits made after the submitted draft', async () => {
  let resolveProject;
  request.mockImplementation(async path => path === '/workbench/project-summary' ? new Promise(resolve => { resolveProject = resolve; }) : { data: {} });
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  await vi.waitFor(() => expect(resolveProject).toBeTypeOf('function'));
  edit(row('0,0').querySelector('input'), '80');
  const updated = fixture(); updated.frameDurations['0,0'] = 95; bench.setProject(updated, 'timing-session');
  resolveProject({ data: { ...fixture(), frameDurations: { '0,0': 75 } } }); await settle();
  expect(row('0,0').textContent).toContain('95 ms');
  expect(row('0,0').querySelector('input').value).toBe('80');
});

test('a failed canonical refresh retains the draft so it can be retried', async () => {
  request.mockImplementation(async path => {
    if (path === '/workbench/project-summary') throw new Error('Refresh unavailable');
    return { data: {} };
  });
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  await vi.waitFor(() => expect(document.querySelector('[data-timing-status]').textContent).toContain('Refresh unavailable'));
  expect(row('0,0').querySelector('input').value).toBe('75');
  expect(action('apply', row('0,0')).disabled).toBe(false);
});

test('a late error for an old group cannot replace the current group status', async () => {
  let rejectSave;
  request.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  await bench.show('timing'); choose('walk');
  edit(row('0,0').querySelector('input'), '75'); action('apply', row('0,0')).click();
  choose('slow'); const content = document.querySelector('[data-timing-status]').textContent;
  rejectSave(new Error('Old group failed')); await settle();
  expect(document.querySelector('[data-timing-status]').textContent).toBe(content);
  expect(row('0,0').textContent).toContain('500 ms');
});

test('removing the saved row invalidates its late canonical response', async () => {
  let resolveSave;
  request.mockImplementation(async path => path === '/cell/duration' ? new Promise(resolve => { resolveSave = resolve; }) : { data: fixture() });
  await bench.show('timing');
  edit(row('0,2').querySelector('input'), '75'); action('apply', row('0,2')).click();
  bench.setProject({ ...fixture(), grid: { rows: 1, cols: 2 }, groups: {} }, 'timing-session');
  resolveSave({ data: {} }); await settle();
  expect(row('0,2')).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
});

test('large sparse grids only mount 64 rows per page and retain drafts when paging', async () => {
  const large = { ...fixture(), grid: { rows: 100, cols: 100 }, groups: {} };
  bench.setProject(large, 'timing-session'); await bench.show('timing');
  expect(document.querySelectorAll('[data-timing-cell]')).toHaveLength(64);
  edit(row('0,0').querySelector('input'), '75'); action('next').click();
  expect(document.querySelectorAll('[data-timing-cell]')).toHaveLength(64);
  expect(row('0,64')).not.toBeNull(); expect(row('0,0')).toBeNull();
  expect(document.querySelector('[data-timing-page]').textContent).toContain('10000');
  action('previous').click(); expect(row('0,0').querySelector('input').value).toBe('75');
});
