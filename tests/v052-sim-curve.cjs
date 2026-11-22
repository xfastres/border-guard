/* Compatibility entrypoint: all numeric projections now use canonical JSON + shared model.
   Retained so existing workflows can run: node tests/v052-sim-curve.cjs */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const balance=require('../balance/v052-engine.js');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../balance/v052-baseline.json'),'utf8'));
const r=balance.simulate(cfg,{waves:20,targetSeconds:35});
console.log('Wave | Kind     | Mobs | Total HP | +XP | +Gold | Level | Expected challenge');
for(const w of r.rows){
 console.log(String(w.wave).padStart(4)+' | '+w.phase.padEnd(8)+' | '
   +String(w.mobs).padStart(4)+' | '+String(w.ehp).padStart(8)
   +' | '+String(w.xp).padStart(3)+' | '+String(w.gold).padStart(5)
   +' | Lv.'+w.level+' | '+w.tag);
}
const milestones=r.breakthroughs.map(x=>x.wave);
console.log('Estimated breakthrough waves:',milestones.join(', '));
console.log('NOT a combat result: assumes all enemies killed, full XP recovery, wave-end safe tribulation, no shop spending.');
if(milestones.join(',')!=='5,10,15,19'){
  console.error('WARNING: baseline milestone assumptions changed; inspect wave inputs and real telemetry.');
  process.exitCode=1;
}
