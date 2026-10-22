import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spoolBoundedInput } from '../../server/io/bounded-input.js';

test('rejects missing or invalid byte budgets before allocating output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprite-input-budget-'));
  try {
    await expect(spoolBoundedInput(Readable.from(['input']), join(directory, 'source.json'), { maxSourceBytes: Infinity, maxExpandedBytes: 100 })).rejects.toThrow(/limit|budget/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('never overwrites or removes a caller-owned output file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprite-input-owner-')), output = join(directory, 'sentinel');
  try {
    await writeFile(output, 'keep');
    await expect(spoolBoundedInput(Readable.from(['replacement']), output, { maxSourceBytes: 100, maxExpandedBytes: 100 })).rejects.toThrow(/exist/i);
    expect(await readFile(output, 'utf8')).toBe('keep');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
