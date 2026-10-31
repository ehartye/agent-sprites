import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const owners=['tests/engine/ui.test.js','tests/engine/ui-theme.test.js','tests/engine/ui-components.test.js','tests/engine/ui-layout.test.js','tests/engine/ui-interaction.test.js','tests/engine/ui-phaser-runtime.test.js','tests/cli/ui-software.test.js','tests/cli/ui-runtime-export.test.js','tests/cli/ui-build.test.js','tests/cli/generated-ui-build.test.js','tests/cli/ui-pad.test.js','tests/cli/ui-wasteland.test.js','tests/cli/ui-colors.test.js','tests/cli/ui-display-ramps.test.js'];
for(const args of [
  ['node_modules/vitest/vitest.mjs','run',...owners,'--maxWorkers=1'],
  ['node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--module','nodenext','--moduleResolution','nodenext','--target','es2022','tests/fixtures/ui-software-consumer.mts'],
]) {
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
