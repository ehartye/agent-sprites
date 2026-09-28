import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {costumeTemplate} from './costume-template.mjs';
import {pressureSuitTemplate} from './pressure-suit.mjs';
import {finishNative} from './native-mannequin.mjs';

export const cast=JSON.parse(readFileSync(new URL('./cast/manifest.json',import.meta.url),'utf8'));
export function castTemplate(id,outfit='everyday'){
  const profile=cast.characters.find(character=>character.id===id);
  if(!profile)throw Error(`Unknown cast member: ${id}`);
  const ops=outfit==='everyday'?costumeTemplate(profile):pressureSuitTemplate(profile,outfit);
  // Costume edge pixels use the profile's outline colour without an outline group.
  return finishNative(ops,[profile.colors?.o??'#26333f']);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(castTemplate(process.argv[2]??'farmer',process.argv[3]??'everyday')));
