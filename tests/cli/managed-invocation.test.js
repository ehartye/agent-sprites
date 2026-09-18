import { test, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
const exec = promisify(execFile);
let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprite-invoke-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(resolve('scripts/sprite.js'), join(root, 'scripts', 'sprite.js'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'agent-sprites', version: '1.2.3', type: 'module' }));
  writeFileSync(join(root, 'managed-install.json'), JSON.stringify({ version: '1.2.3' }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('--version works without dependencies or contacting a server', async () => {
  const result = await exec(process.execPath, [join(root, 'scripts/sprite.js'), '--version'], { timeout: 4000 });
  expect(result.stdout.trim()).toBe('1.2.3');
});

test.each([
  ['old version', { version: '0.9.0' }],
  ['different installation', { runtimeRoot: 'C:/some/checkout' }],
  ['legacy health', { version: undefined, runtimeRoot: undefined }],
])('managed CLI refuses %s without sending mutations', async (_name, override) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.end(JSON.stringify({ ok: true, service: 'agent-sprites', protocol: 1, version: '1.2.3', runtimeRoot: realpathSync(root), ...override }));
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const result = await exec(process.execPath, [join(root, 'scripts/sprite.js'), 'new', 'should-not-exist'], {
      env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 5000,
    }).then(r => ({ ...r, code: 0 }), e => e);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/version|installation|mismatch/i);
    expect(requests).toEqual(['/health']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test.each(['exact', ...(process.platform === 'win32' ? ['different case'] : [])])('managed CLI accepts its own matching server (%s path)', async casing => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.end(JSON.stringify(req.url === '/health'
      ? { ok: true, service: 'agent-sprites', protocol: 1, version: '1.2.3', runtimeRoot: casing === 'different case' ? realpathSync(root).toUpperCase() : realpathSync(root) }
      : { ok: true, data: 'managed-session' }));
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const result = await exec(process.execPath, [join(root, 'scripts/sprite.js'), 'status'], {
      env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 5000,
    });
    expect(result.stdout.trim()).toBe('managed-session');
    expect(requests).toEqual(['/health', '/api/session/status']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
