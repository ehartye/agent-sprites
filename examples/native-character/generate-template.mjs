import {nativeMannequin} from './native-mannequin.mjs';
const kind = process.argv[2] ?? 'adult';
if (!['adult','child'].includes(kind)) throw new Error('Choose adult or child');
process.stdout.write(JSON.stringify(nativeMannequin(kind,process.argv[3] ?? 'peach')));
