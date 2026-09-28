import {nativeMannequin} from './native-mannequin.mjs';
import {nativeReport} from './native-report.mjs';
const kind = process.argv[2] ?? 'adult';
if (!['adult','child','large'].includes(kind)) throw new Error('Choose adult, child or large');
const operations = nativeMannequin(kind, process.argv[3] ?? 'peach');
process.stdout.write(JSON.stringify({operations, report: nativeReport(operations, kind)}));
