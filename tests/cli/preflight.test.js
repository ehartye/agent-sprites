import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtemp, mkdir, copyFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import net from 'net';
import http from 'http';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

async function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

describe('sprite CLI dependency preflight', () => {
  // A plugin installed straight from a marketplace has no node_modules yet —
  // sprite.js itself runs on builtins, but the server it spawns cannot.
  // Simulate that cold install: sprite.js copied into a tree with no deps.
  let root;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sprite-preflight-'));
    await mkdir(join(root, 'scripts'));
    await copyFile(SPRITE_JS, join(root, 'scripts', 'sprite.js'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('fails fast with an npm install hint instead of a bare server timeout', async () => {
    const port = await pickPort();
    let stderr = '';
    let code = 0;
    try {
      await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'status'], {
        env: { ...process.env, SPRITE_PORT: String(port) },
        timeout: 15000,
      });
    } catch (e) {
      stderr = e.stderr ?? '';
      code = e.code ?? 0;
    }
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/npm install/);
    expect(stderr).toMatch(/dependencies/i);
  }, 20000);

  test('batch JSON reports dependency preflight failure without requiring the server', async () => {
    const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'batch', 'unused.json', '--json'], {
      env: { ...process.env, SPRITE_PORT: String(await pickPort()) }, timeout: 8000,
    }).then(value => ({ ...value, code: 0 }), error => error);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false, total: 0, attempted: 0, succeeded: 0, failed: 1,
      errors: [{ index: null, command: 'startup', error: expect.stringMatching(/npm install/) }],
      session: null, artifacts: [], exports: [],
    });
    expect(result.stderr).toMatch(/dependencies/);
  });

  test('batch JSON reports occupied-port failure without sending operations', async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'batch', 'unused.json', '--json'], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: false, total: 0, attempted: 0, succeeded: 0, failed: 1,
        errors: [{ index: null, command: 'startup', error: expect.stringMatching(/occupied/) }],
        session: null, artifacts: [], exports: [],
      });
      expect(requests).toEqual(['/health']);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test.each(['status', 'restart'])('rejects an unidentified service without sending %s API requests', async command => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), command], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/SPRITE_PORT/);
      expect(result.stderr).toMatch(/stop.*manually|manually.*stop/i);
      expect(requests.every(path => path === '/health')).toBe(true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test.each([
    ['wrong service', JSON.stringify({ ok: true, service: 'other-app', protocol: 1 })],
    ['unsupported protocol', JSON.stringify({ ok: true, service: 'agent-sprites', protocol: 2 })],
    ['HTML response', '<html>another application</html>'],
  ])('rejects %s health responses', async (_label, body) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      res.end(body);
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'status'], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/occupied/);
      expect(requests).toEqual(['/health']);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('uses a verified running service without requiring local server dependencies', async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url === '/health'
        ? { ok: true, service: 'agent-sprites', protocol: 1 }
        : { ok: true, data: 'verified-session' }));
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'status'], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      });
      expect(result.stdout.trim()).toBe('verified-session');
      expect(requests).toEqual(['/health', '/api/session/status']);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('rejects a health redirect instead of trusting another endpoint identity', async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      if (req.url === '/health') {
        res.writeHead(302, { Location: '/other-service' });
        res.end();
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, service: 'agent-sprites', protocol: 1 }));
      }
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'status'], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/occupied/);
      expect(requests).toEqual(['/health']);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('does not report a restart when a verified server ignores shutdown', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, service: 'agent-sprites', protocol: 1 }));
    });
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const result = await exec(process.execPath, [join(root, 'scripts', 'sprite.js'), 'restart'], {
        env: { ...process.env, SPRITE_PORT: String(server.address().port) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/did not stop/);
      expect(result.stdout).not.toMatch(/restarted/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }, 10000);

  test('reports an early child failure with its diagnostic instead of waiting for a timeout', async () => {
    const failingRoot = await mkdtemp(join(tmpdir(), 'sprite-start-failure-'));
    try {
      await mkdir(join(failingRoot, 'scripts'));
      await mkdir(join(failingRoot, 'server'));
      await mkdir(join(failingRoot, 'node_modules'));
      await copyFile(SPRITE_JS, join(failingRoot, 'scripts', 'sprite.js'));
      await writeFile(join(failingRoot, 'server', 'index.js'), "console.error('native dependency could not load'); process.exit(7);\n");
      const started = Date.now();
      const result = await exec(process.execPath, [join(failingRoot, 'scripts', 'sprite.js'), 'status'], {
        env: { ...process.env, SPRITE_PORT: String(await pickPort()) }, timeout: 8000,
      }).then(value => ({ ...value, code: 0 }), error => error);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/native dependency could not load/);
      expect(result.stderr).toMatch(/log/i);
      expect(Date.now() - started).toBeLessThan(7000);
      expect(result.stderr).not.toMatch(/fetch failed/);
    } finally {
      await rm(failingRoot, { recursive: true, force: true });
    }
  }, 15000);
});
