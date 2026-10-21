import { describe, it, expect } from 'vitest';
import { GroupManager } from '../../server/engine/group-manager.js';

describe('GroupManager', () => {
  it('round-trips prototype-like names as ordinary own group entries',()=>{
    const gm=new GroupManager();gm.create('__proto__',['0,0']);gm.create('constructor',['0,1']);
    for(const data of [gm.list(),gm.toJSON()]) {
      expect(Object.hasOwn(data,'__proto__')).toBe(true);
      expect(GroupManager.fromJSON(JSON.parse(JSON.stringify(data))).get('__proto__')).toEqual(['0,0']);
    }
  });
  it('creates a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('throws on duplicate group name', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    expect(() => gm.create('walk', ['0,1'])).toThrow('already exists');
  });

  it('adds cells to a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    gm.addCells('walk', ['0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('does not duplicate cells', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.addCells('walk', ['0,1', '0,2']);
    expect(gm.get('walk')).toEqual(['0,0', '0,1', '0,2']);
  });

  it('removes cells from a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1', '0,2']);
    gm.removeCells('walk', ['0,1']);
    expect(gm.get('walk')).toEqual(['0,0', '0,2']);
  });

  it('deletes a group', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0']);
    gm.delete('walk');
    expect(gm.get('walk')).toBeNull();
  });

  it('lists all groups', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.create('idle', ['1,0']);
    const list = gm.list();
    expect(list).toEqual({
      walk: ['0,0', '0,1'],
      idle: ['1,0'],
    });
  });

  it('finds groups containing a cell', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    gm.create('idle', ['0,0']);
    expect(gm.groupsForCell('0,0')).toEqual(['walk', 'idle']);
    expect(gm.groupsForCell('0,1')).toEqual(['walk']);
  });

  it('serializes and deserializes', () => {
    const gm = new GroupManager();
    gm.create('walk', ['0,0', '0,1']);
    const json = gm.toJSON();
    const restored = GroupManager.fromJSON(json);
    expect(restored.get('walk')).toEqual(['0,0', '0,1']);
  });
});
