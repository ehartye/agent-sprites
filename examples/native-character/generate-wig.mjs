import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dressTemplate} from './dress-template.mjs';

// Keep full body cell coordinates and pivot so wig sheets align without offsets.
export function wigTemplate(kind='adult', wig='short') {
  if(!['short','tied'].includes(wig))throw new Error('Choose a short or tied wig.');
  const ops=dressTemplate(kind,'jacket','peach',wig).filter(op=>
    ['new','name','pivot','group'].includes(op.command) ||
    (op.command==='draw'&&op.name.includes('-hair-')) ||
    (op.command==='shape-group'&&(op.name==='hair'||op.name.startsWith('hair-'))));
  ops[0].name=`${kind}-wig-${wig}`;
  return ops;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(wigTemplate(...process.argv.slice(2))));
