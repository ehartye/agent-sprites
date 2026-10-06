import { generateCreatureRecipe } from './server/authoring/creature.js';
import { PLANS } from './server/authoring/creature-plans.js';
const sizes=['small','medium','large','12x12','16x16','20x40','96x64','160x128','40x12'];
for (const plan of Object.keys(PLANS)) for (const size of sizes) {
  const t=Date.now();
  try{ generateCreatureRecipe({plan,size}); console.log('ok',plan,size,Date.now()-t,'ms'); }catch(e){ console.log('FAIL',plan,size,e.message.slice(0,110)); }
}
