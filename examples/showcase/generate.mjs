import { readFileSync } from 'node:fs';
import { createScene } from './drawing.mjs';
import { scenes } from './scenes.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const scene = scenes[config.slug];
if (!scene) throw new Error(`Unknown showcase scene: ${config.slug}`);
process.stdout.write(JSON.stringify(createScene(config, scene.base, scene.animate)));
