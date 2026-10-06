import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dressTemplate} from '../../server/authoring/native/dress-template.mjs';
import {nativeReport} from '../../server/authoring/native/native-report.mjs';
import {parseGear} from '../../server/authoring/native/native-gear.mjs';

// The wardrobe library lives in server/authoring/native so the managed runtime ships it;
// this file stays the command-line generator for the checked-in build configs.
export {dressTemplate};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),gear=parseGear(args.filter(a=>a.startsWith('gear='))),[kind='adult',style,tone,wig]=args.filter(a=>!a.startsWith('gear='));const operations=dressTemplate(kind,style,tone,wig,{gear});process.stdout.write(JSON.stringify({operations,report:nativeReport(operations,kind,{gear})}));}
