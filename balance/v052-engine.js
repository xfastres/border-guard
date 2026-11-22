/* Border Guard v0.52 · deterministic expectation model (not a real combat simulation)
   Shared by Node CLI and the interactive browser lab. No hard-coded wave scaling formulas outside the config. */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BGBalance52 = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
  function phaseFor(c, w) {
    const p = c.wave.phases.find(x => w >= x.from && w <= x.to)
      || c.wave.phases[c.wave.phases.length - 1];
    return {
      tag: w > 20 ? '无尽狂潮' : p.tag,
      kind: p.kind,
      mobMult: p.mobMult,
      hpMult: p.hpBase + (w - p.offset) * p.hpSlope
    };
  }
  function scaleFor(c, w) {
    const b = c.wave, phase = phaseFor(c, w);
    const late = w >= b.lateHpGrowthSecondStart
      ? Math.pow(b.lateHpGrowthSecond, w - b.lateHpGrowthSecondStart + 1)
      : w >= b.lateHpGrowthStart
        ? Math.pow(b.lateHpGrowthFirst, w - b.lateHpGrowthStart + 1)
        : 1;
    return Math.pow(b.normalHpGrowth, w - 1) * phase.hpMult * late;
  }
  function kindProbability(c, w, isHeavy) {
    const rows = c.wave.mobMix;
    const entry = rows.find(m => w <= m.to) || rows[rows.length - 1];
    const cuts = isHeavy && entry.heavy ? entry.heavy : entry.normal;
    const result = {};
    let prev = 0;
    for (const [kind, upper] of cuts) {
      result[kind] = upper - prev;
      prev = upper;
    }
    return result;
  }
  function waveStats(c, w, options={}) {
    const b = c.wave, p = phaseFor(c, w);
    const base = Math.min(b.mobsBaseCap, Math.round(b.mobsBase + w*b.mobsPerWave));
    const mobs = Math.min(b.mobsFinalCap, Math.round(base*p.mobMult));
    const s1 = Math.round(mobs * b.stages.fractionOne);
    const s2 = Math.min(b.stages.quietMax, Math.max(b.stages.quietMin, Math.round(mobs*b.stages.fractionTwo)));
    const s3 = Math.max(0, mobs-s1-s2);
    const normal = kindProbability(c,w,false), heavy = kindProbability(c,w,true);
    const expectedKinds={};
    const kinds = new Set([...Object.keys(normal),...Object.keys(heavy)]);
    for(const kind of kinds) expectedKinds[kind]=(s1+s2)*(normal[kind]||0)+s3*(heavy[kind]||0);
    const scale=scaleFor(c,w), ei=c.enemies;
    let mobEhp=0, xp=0, goldDrops=0, potentialDamage=0;
    const enemyDamageMult = (1+(w-1)*b.enemyDamageGrowthPerWave)
      *(w >= b.enemyDamageLateStart ? Math.pow(b.enemyDamageLateGrowth,w-b.enemyDamageLateStart+1):1);
    for(const [kind,qty] of Object.entries(expectedKinds)){
      const e=ei[kind];
      mobEhp+=qty*Math.round(e.hp*scale);
      xp+=qty*e.xp;
      goldDrops+=qty*e.gold*(e.gold===1?c.economy.singleGoldDropChance:1);
      potentialDamage+=qty*Math.round(e.dmg*enemyDamageMult);
    }
    const eliteCount=w>=b.eliteFirstWave
      ? (w>=b.eliteCountIncreasedWave?b.eliteCountLate:b.eliteCountEarly):0;
    const eliteScale=Math.pow(b.eliteHpGrowth,w-b.eliteFirstWave);
    const eliteHp=eliteCount*Math.round(ei.elite.hp*eliteScale);
    const eliteGold=eliteCount*ei.elite.gold;
    const eliteXp=eliteCount*ei.elite.xp;
    const bossKind=w%b.bossPeriod===0?(w===5?'boss1':w===10?'boss2':w===15?'boss3':'boss4'):null;
    const bossScale=w>20?Math.pow(b.bossEndlessHpGrowth,(w-20)/2):1;
    const bossHp=bossKind?Math.round(ei[bossKind].hp*bossScale):0;
    const bossGold=bossKind?ei[bossKind].gold:0;
    const bossXp=bossKind?ei[bossKind].xp:0;
    const clearBonus=c.economy.waveClearBase+w*c.economy.waveClearPerWave;
    const waveDuration=Math.min(b.durationCap,b.durationBase+w*b.durationPerWave);
    const targetSeconds=Math.max(1,Number(options.targetSeconds)||35);
    const expectedXp=Math.round(xp+eliteXp+bossXp);
    const grossGold=Math.round(goldDrops+eliteGold+bossGold+clearBonus);
    const expectedEhp=Math.round(mobEhp+eliteHp+bossHp);
    return {
      wave:w,tag:p.tag,phase:p.kind,mobs,s1,s2,s3,eliteCount,bossKind,
      scale,baseEnemyDamageMultiplier:enemyDamageMult,spawnDuration:waveDuration,
      mobEhp:Math.round(mobEhp),eliteEhp:eliteHp,bossEhp:bossHp,ehp:expectedEhp,
      xp:expectedXp,gold:grossGold,clearBonus,needDps:Math.ceil(expectedEhp/targetSeconds),
      potentialIncomingDamage:Math.round(potentialDamage+eliteCount*Math.round(ei.elite.dmg*enemyDamageMult)+(bossKind?Math.round(ei[bossKind].dmg*enemyDamageMult):0)),
      expectedKinds
    };
  }
  function xpForLevel(c,lv) {
    const p=c.progression;
    return Math.round(p.xpBase+Math.min(lv,p.xpKnee)*p.xpEarlyPerLevel+Math.max(0,lv-p.xpKnee)*p.xpLatePerLevel);
  }
  function simulate(c,options={}){
    const waves=clamp(Math.round(Number(options.waves)||20),1,40);
    const rows=[];
    let totalGold=c.progression.initialGold,totalXp=0,totalEhp=0;
    let level=1,realm=0,progress=0;
    const thresholds=[4,9,14,19],breakthroughs=[];
    for(let w=1;w<=waves;w++){
      const row=waveStats(c,w,options);
      totalGold+=row.gold;
      totalXp+=row.xp;
      totalEhp+=row.ehp;
      progress+=row.xp;
      let upgrades=0,ready=false;
      // Conservative approximation: one breakthrough at end of wave and overflow capped at 100%.
      while(upgrades++<100){
        const next=xpForLevel(c,level);
        if(progress<next)break;
        if(thresholds[realm]===level){
          progress=Math.min(progress,next*2);
          ready=true;
          break;
        }
        progress-=next;
        level++;
      }
      if(ready&&realm<4){
        breakthroughs.push({wave:w,to:realm+1,level:level+1});
        progress-=xpForLevel(c,level);
        level++;
        realm++;
        // Residual XP may be processed after the wave. Keep at most next realm threshold.
        for(let i=0;i<50;i++){
          const next=xpForLevel(c,level);
          if(progress<next||thresholds[realm]===level)break;
          progress-=next;level++;
        }
      }
      rows.push({...row,level,realm,remainingXp:Math.max(0,Math.round(progress)),
        totalGold:Math.round(totalGold),totalXp:Math.round(totalXp),totalEhp:Math.round(totalEhp)});
    }
    return {rows,breakthroughs,totalGold:Math.round(totalGold),totalXp:Math.round(totalXp),totalEhp:Math.round(totalEhp),
      assumptions:{gold:'不扣除购买、刷新等消费；普通1金币小怪按掉率期望计',
        xp:'假设敌军全部击杀且经验全部回收，渡劫在波末成功并受100%溢出限制',
        ehp:'敌人出生总生命值之和，不考虑治疗、护盾、召唤及过量伤害',
        dps:'每波总生命值 ÷ 指定目标击杀秒数，非实战角色DPS',
        damage:'潜在敌人攻击伤害合计，不代表实际受到的伤害'}};
  }
  function validate(c){
    const errors=[];
    if(c.schemaVersion!==1)errors.push('schemaVersion must be 1');
    for(const k of ['normalHpGrowth','eliteHpGrowth','lateHpGrowthFirst','lateHpGrowthSecond']){
      if(!(c.wave[k]>0))errors.push('wave.'+k+' must be >0');
    }
    if(c.wave.stages.fractionOne+c.wave.stages.fractionTwo>=1)errors.push('wave stage fractions must be <1');
    for(const m of c.wave.mobMix){
      for(const dist of [m.normal,m.heavy].filter(Boolean)){
        if(Math.abs(dist[dist.length-1][1]-1)>1e-9)errors.push('distribution must end at 1');
        for(let i=1;i<dist.length;i++)if(dist[i][1]<dist[i-1][1])errors.push('distribution cuts out of order');
      }
    }
    for(const [kind,e] of Object.entries(c.enemies)){
      if(!e.hp||e.hp<=0)errors.push('invalid hp '+kind);
    }
    return errors;
  }
  return {phaseFor,scaleFor,kindProbability,waveStats,xpForLevel,simulate,validate};
});
