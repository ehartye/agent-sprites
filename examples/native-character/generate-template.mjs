import {readFileSync} from 'node:fs';
import {deriveBackStudy} from '../reference-grid/derive-back.mjs';
const kind = process.argv[2] ?? 'adult';
if (!['adult','child'].includes(kind)) throw new Error('Choose adult or child');
const project = JSON.parse(readFileSync(new URL('./templates/'+kind+'.project.json',import.meta.url),'utf8'));
process.stdout.write(JSON.stringify(deriveBackStudy(project,{kind,tone:process.argv[3] ?? 'peach'})));
