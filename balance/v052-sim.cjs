#!/usr/bin/env node
/* v0.52 balance numbers: deterministic expected supply, NOT a combat win-rate simulator. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const engine=require('./v052-engine.js');
const args=process.argv.slice(2);
const nextOf=(flag,def)=>{const i=args.indexOf(flag);return i<0?def:args[i+1];};
const configFile=path.resolve(nextOf('--config',path.join(__dirname,'v052-baseline.json')));
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const errors=engine.validate(config);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
const opts={waves:Number(nextOf('--waves','20')),targetSeconds:Number(nextOf('--target-seconds','35'))};
const sim=engine.simulate(config,opts);
const columns=['wave','phase','mobs','eliteCount','bossKind','scale','ehp','needDps','xp','gold','totalGold','level'];
if(args.includes('--json')){
  console.log(JSON.stringify(sim,null,2));
}else if(args.includes('--csv')){
  console.log(columns.join(','));
  for(const r of sim.rows)console.log(columns.map(k=>String(r[k]??'')).join(','));
}else{
  console.log('v0.52 Balance Lab · EXPECTED SUPPLY (not real combat)');
  console.log('W  Phase    Mobs Elite Boss   HP-scale       TotalHP    DPS@'+opts.targetSeconds+'s    XP   +Gold  GoldTotal Lv');
  for(const r of sim.rows){
    console.log(
      String(r.wave).padStart(2)+' '+r.phase.padEnd(8)+String(r.mobs).padStart(4)+'  '+
      String(r.eliteCount).padStart(2)+'    '+(r.bossKind||'—').padEnd(6)+
      r.scale.toFixed(2).padStart(9)+'    '+String(r.ehp).padStart(10)+' '+String(r.needDps).padStart(10)+' '+
      String(r.xp).padStart(5)+'  '+String(r.gold).padStart(5)+'  '+String(r.totalGold).padStart(7)+' '+r.level
    );
  }
  console.log('Projected breakthrough opportunities:',sim.breakthroughs.map(x=>'W'+x.wave+'→Lv'+x.level).join(', ')||'none');
  console.log('Assumptions:',...Object.values(sim.assumptions).map(x=>'\n- '+x));
}
