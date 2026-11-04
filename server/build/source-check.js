import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { checkTilesetRecipe } from '../authoring/tileset.js';

/** Parse-only check of one build config: names every mistyped .pxl row by file, line and expected width. Writes nothing. */
export function checkBuildSources(configPath) {
  const result = { ok: false, mode: 'check', config: resolve(configPath), tiles: 0, errors: [] };
  try {
    const full = realpathSync(resolve(configPath)), config = JSON.parse(readFileSync(full, 'utf8'));
    result.config = full;
    if (!config.tileset || typeof config.tileset !== 'object' || Array.isArray(config.tileset)) {
      const example = JSON.stringify({ version: 1, projects: [`./${basename(full)}`] });
      throw new Error('build --check only validates inline tileset .pxl sources; this build config has no inline tileset source. '
        + 'For generator/ops output freshness, save a NEW manifest beside this config (do not overwrite it):\n'
        + example + '\nThen run: agent-sprites build-set "<new-manifest.json>" --check --json\n'
        + 'Paths are relative to the manifest. This is read-only: it checks recorded inputs and published artifacts '
        + 'without running generators or starting a server.');
    }
    const checked = checkTilesetRecipe(config.tileset, dirname(full));
    result.tiles = checked.tiles;
    result.errors = checked.diagnostics.map(({ code, ...rest }) => ({ code: code === 'recipe' ? 'recipe' : 'pxl-invalid', kind: code, ...rest }));
  } catch (error) {
    result.errors.push({ code: 'check-input', message: error.message });
  }
  result.ok = result.errors.length === 0;
  return result;
}
