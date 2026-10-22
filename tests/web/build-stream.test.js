import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:http';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

let dir, config, server, state, base;
const operations = [{ command: 'new', name: 'streamed', size: 8, rows: 1, cols: 1 }];
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-build-stream-')); config = join(dir, 'sprite-project.json');
  writeFileSync(join(dir, 'generate.mjs'), `process.stdout.write(${JSON.stringify(JSON.stringify(operations))});`);
  writeFileSync(config, JSON.stringify({ version: 1, generator: 'generate.mjs', output: 'dist', scale: 1 }));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null }; server = await startWebServer(state, 0); base = `http://localhost:${server.port}`;
});
afterEach(async () => {
  server.wss.close(); await new Promise(resolve => { server.httpServer.close(resolve); server.httpServer.closeAllConnections(); }); state.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('existing build POST opts into NDJSON progress and one final compatible result', async () => {
  const response = await fetch(`${base}/api/workbench/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ path: config }) });
  expect(response.headers.get('content-type')).toMatch(/application\/x-ndjson/);
  const records = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  expect(records[0]).toEqual({ type: 'progress', phase: 'prepare' });
  expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'progress', phase: 'generator', bytes: expect.any(Number) }), { type: 'progress', phase: 'committing' }, { type: 'progress', phase: 'committed' }]));
  expect(records.filter(record => record.type === 'result')).toHaveLength(1);
  expect(records.at(-1)).toMatchObject({ type: 'result', ok: true, data: { ok: true, artifacts: { sheet: expect.any(String) } } });
});

test('default POST stays JSON and ignores request attempts to raise generator policy', async () => {
  const response = await fetch(`${base}/api/workbench/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: config, generatorPolicy: { maxStdoutBytes: 1 } }) });
  expect(response.headers.get('content-type')).toMatch(/application\/json/); expect(await response.json()).toMatchObject({ ok: true, data: { ok: true } });
});

test('abandoning a streaming request stops only its generator and releases its output lock', async () => {
  const marker = join(dir, 'pid');
  writeFileSync(join(dir, 'generate.mjs'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},String(process.pid));const interval=setInterval(()=>process.stdout.write(' '.repeat(1024)),10);setTimeout(()=>{clearInterval(interval);},1500);`);
  writeFileSync(join(dir, 'foreign'), 'keep');
  const body = JSON.stringify({ path: config });
  const req = request(`${base}/api/workbench/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'Content-Length': Buffer.byteLength(body) } });
  req.on('error', () => {});
  let incoming = '';
  const received = new Promise(resolve => req.once('response', res => res.on('data', chunk => {
    incoming += chunk.toString();
    if (/"phase":"generator","bytes":[1-9]/.test(incoming)) { req.destroy(); resolve(); }
  })));
  req.end(body); await received;
  for (let i = 0; i < 100 && existsSync(join(dir, 'dist.build-lock')); i++) await delay(20);
  expect(existsSync(join(dir, 'dist.build-lock'))).toBe(false); expect(existsSync(join(dir, 'dist'))).toBe(false);
  const pid = Number(readFileSync(marker, 'utf8')); expect(() => process.kill(pid, 0)).toThrow();
  expect(readFileSync(join(dir, 'foreign'), 'utf8')).toBe('keep'); expect(readdirSync(dir).some(name => /staging/.test(name))).toBe(false);
}, 10000);
