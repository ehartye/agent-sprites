import { afterEach, beforeEach, expect, test } from 'vitest';
import { SessionDB } from '../../server/db/session.js';

let db;
beforeEach(() => { db = new SessionDB(':memory:'); });
afterEach(() => db.close());

test('round-trips own prototype-like shape group names through the all-cell representation', () => {
  for (const name of ['__proto__', 'constructor', 'toString']) db.setShapeGroup('session', '0,0', name, [name]);
  const all = db.getAllShapeGroups('session');
  for (const name of ['__proto__', 'constructor', 'toString']) {
    expect(Object.hasOwn(all['0,0'], name)).toBe(true);
    expect(all['0,0'][name]).toEqual([name]);
  }
  for (const [cell, groups] of Object.entries(JSON.parse(JSON.stringify(all)))) for (const [name, members] of Object.entries(groups)) db.setShapeGroup('copy', cell, name, members);
  expect(db.getAllShapeGroups('copy')).toEqual(all);
});

test('membership index queries avoid retrieving or parsing shape member arrays', () => {
  db.setShapeGroup('session', '0,0', '__proto__', ['member']);
  db.setShapeGroup('session', '0,1', 'other', ['member']);
  db.db.prepare('UPDATE shape_groups SET shapes = ? WHERE session_id = ?').run('not valid JSON', 'session');
  expect(db.getShapeGroupIndex('session')).toEqual([{ cell: '0,0', name: '__proto__' }, { cell: '0,1', name: 'other' }]);
});

test('migrates only the supplied alias groups while preserving canonical own keys and unrelated orphan rows', () => {
  db.setShapeGroup('session', 'alias', '__proto__', ['old']);
  db.setShapeGroup('session', 'alias', 'other', ['member']);
  db.setShapeGroup('session', '0,0', '__proto__', ['canonical']);
  db.setShapeGroup('session', 'orphan', 'untouched', []);
  db.migrateShapeGroupAlias('session', 'alias', '0,0');
  expect(db.getShapeGroups('session', 'alias')).toEqual({});
  expect(db.getShapeGroups('session', '0,0')).toEqual({ ['__proto__']: ['canonical'], other: ['member'] });
  expect(db.getShapeGroups('session', 'orphan')).toEqual({ untouched: [] });
});

test('bounded member reads do not return a stored group larger than the remaining response budget', () => {
  db.setShapeGroup('session', '0,0', 'part', ['member']);
  expect(db.getShapeGroupJSON('session', '0,0', 'part', 3)).toBeNull();
  expect(db.getShapeGroupJSON('session', '0,0', 'part', 100)).toBe('["member"]');
});
