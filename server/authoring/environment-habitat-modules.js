// Habitat modules: four space-habitat exteriors that share the rooms, doorway, foundation and kit palette of
// the cottage, workshop, kitchen and barn styles they replace visually. Each drawer receives the pen and the
// base style's theme, and draws only the exterior above the common wall; the wall, doorway and parapet are
// drawn by drawStyledHabitat so the reported geometry cannot drift.
import {capsule} from './environment-habitat-capsule.js';
import {vault} from './environment-habitat-vault.js';
import {gantry} from './environment-habitat-gantry.js';
import {dome} from './environment-habitat-dome.js';

export const MODULE_BASE_STYLES={capsule:'cottage',vault:'barn',gantry:'workshop',dome:'kitchen'};
export const MODULE_DRAWERS={capsule,vault,gantry,dome};
