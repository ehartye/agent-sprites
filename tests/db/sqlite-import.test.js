// @risk standard
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);

describe('better-sqlite3 ESM import', () => {
  it('loads via createRequire without error', () => {
    const Database = require('better-sqlite3');
    expect(Database).toBeDefined();
    expect(typeof Database).toBe('function');
  });

  it('can open an in-memory database', () => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    expect(db).toBeInstanceOf(Database);
    expect(db.open).toBe(true);
    // Verify basic operation
    const row = db.prepare('SELECT 1 + 1 AS result').get();
    expect(row.result).toBe(2);
    db.close();
  });
});
