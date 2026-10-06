import { generateCreatureRecipe } from './server/authoring/creature.js';
import { PLANS } from './server/authoring/creature-plans.js';
const sizes=['12x12','12x40','20x40','40x12','96x64','160x128','16x16','13x17','31x23'];
const bad={};
let ok=0;
for (const plan of Object.keys(PLANS)) for (const size of sizes) {
  const feats=PLANS[plan].features;
  const sets=[[],...feats.map(f=>[f]),feats];
  for (const fs of sets) for (const extra of [{}, {proportions:{bodyLength:2.5,legLength:2.5,headSize:2.5,tailLength:2.5,bodyHeight:2.5}},{proportions:{bodyLength:0.4,legLength:0.4,headSize:0.4,bodyHeight:.4,legThickness:.4}}]) {
    for (const views of [undefined,['front','back','right']]) {
    const cfg={plan,size,features:fs,views,...extra};
    try{ const a=JSON.stringify(generateCreatureRecipe(cfg)); const b=JSON.stringify(generateCreatureRecipe(cfg)); if(a!==b) bad['nondet '+plan]=cfg; ok++; }
    catch(e){ const k=`${plan} ${e.message.slice(0,90)}`; (bad[k]??=[]).push(size+' '+fs.join(',').slice(0,40)+' '+JSON.stringify(extra).slice(0,30)); }
  }}
}
console.log(ok);
for (const [k,v] of Object.entries(bad)) console.log(k, Array.isArray(v)?v.length+' e.g. '+v.slice(0,3).join(' | '):JSON.stringify(v));
