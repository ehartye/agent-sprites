import { parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateImportedProject } from './project-validation.js';

try {
  const input = await readFile(workerData.input, 'utf8');
  const { project, summary } = validateImportedProject(JSON.parse(input), workerData.limits, workerData.name);
  const bytes = Buffer.from(JSON.stringify(project.toJSON()));
  await writeFile(workerData.output, bytes, { flag: 'wx' });
  parentPort.postMessage({ summary, output: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
} catch (error) {
  parentPort.postMessage({ error: String(error.message).slice(0, 600) });
}
