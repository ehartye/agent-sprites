import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

let dir, config;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'sprite-listen-')));
  config = join(dir, 'sprite-project.json');
  writeFileSync(join(dir, 'ops.json'), JSON.stringify([
    { command: 'new', name: 'tiny', size: 16, rows: 1, cols: 1 },
    { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 3, y: 3, w: 8, h: 8, color: '#29adff', filled: true },
  ]));
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist' }));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

test('a refused loopback listen is reported with the OS code and address and leaves no residue', async () => {
  // Node reports a listen failure as an 'error' event; Express 5 forwards it to the listen callback.
  vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function () {
    process.nextTick(() => this.emit('error', Object.assign(new Error('listen EACCES: permission denied 127.0.0.1'), { code: 'EACCES', syscall: 'listen', address: '127.0.0.1' })));
    return this;
  });
  const result = await buildProject(config);
  expect(result.ok).toBe(false); // scripts/sprite.js turns a failed report into exit code 1
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].code).toBe('build');
  expect(result.errors[0].message).toContain('EACCES');
  expect(result.errors[0].message).toContain('127.0.0.1');
  expect(result.errors[0].message).not.toContain('reading');
  expect(result.errors[0].message).not.toContain('Server is not running');
  expect(readdirSync(dir).filter(name => /\.staging-|\.build-lock|previous/.test(name))).toEqual([]);
});
