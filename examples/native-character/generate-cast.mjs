import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {costumeTemplate} from './costume-template.mjs';

export const cast=JSON.parse(readFileSync(new URL('./cast/manifest.json',import.meta.url),'utf8'));
export function castTemplate(id){
  const profile=cast.characters.find(character=>character.id===id);
  if(!profile)throw Error(`Unknown cast member: ${id}`);
  return costumeTemplate(profile);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(castTemplate(process.argv[2]??'farmer')));
