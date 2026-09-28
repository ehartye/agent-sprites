import {nativeMannequin} from './native-mannequin.mjs';
import {nativeReport} from './native-report.mjs';
import {parseGear} from './native-gear.mjs';
const kind = process.argv[2] ?? 'adult';
if (!['adult','child','large'].includes(kind)) throw new Error('Choose adult, child or large');
// Optional gear arguments after the tone, for example gear=trowel:right.
const gear = parseGear(process.argv.slice(4));
const operations = nativeMannequin(kind, process.argv[3] ?? 'peach', {gear});
process.stdout.write(JSON.stringify({operations, report: nativeReport(operations, kind, {gear})}));
