import BALANCE from '../../data/balance.js';
import { dist, xpForLevel } from '../../core/math.js';
import { perkLv, hasW20Direction, hasDestinyEnhancement } from '../../core/state-queries.js';

export function createHeroVitals(ctx, deps) {
  const { getActiveMetaMain, hasMetaAux } = deps.meta;
  const { getActiveUnlockNode, getRealmStageLabel } = deps.unlock;
  const { getActiveGearAffixSynergies } = deps.equipment;
  const { getHeroStats, aggregateGear, gearSetTier, syncHeroMaxHp } = deps.hero;
  const { triggerFrostPulse, dealDamage } = deps.combat;
  const { finishGame } = deps.run;

  function updatePickups(dt){
    const game = ctx.game;
    const h = game.hero;
    const hs = getHeroStats();
    if (game.xpComboTimer > 0) { game.xpComboTimer -= dt; if (game.xpComboTimer <= 0) game.xpCombo = 0; }
    const isHarvest = game.phase === 'harvest';

    for (const g of game.gems) {
      g.t += dt;
      if (!isHarvest && g.t < 0.22) { g.x += g.vx * dt; g.y += g.vy * dt; continue; }
      const d = dist(g, h);
      if (isHarvest || d <= hs.magnet || g.magnetized) {
        g.magnetized = true;
        const spd = isHarvest ? 28.0 : 14.5;
        if (d <= 0.55) {
          g.done = true;
          gainHeroXp(g.xp);
        } else {
          g.x += (h.x - g.x) / d * spd * dt;
          g.y += (h.y - g.y) / d * spd * dt;
        }
      }
    }
    game.gems = game.gems.filter(g => !g.done);

    // Ground chests stay pickable in both wave & prep phases!
    for (const c of game.chests) {
      c.bob += dt * 4.5;
      if (dist(c, h) <= 1.15) {
        c.done = true;
        ctx.ports.modals.queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
        ctx.ports.audio.play('chest', 1.15);
      }
    }
    game.chests = game.chests.filter(c => !c.done);

    // Stage 5: W30 Healing Spirit Orbs (sustain for non-lifesteal kiting builds across 3-5 min boss fight)
    if (game.healOrbs && game.healOrbs.length) {
      for (const orb of game.healOrbs) {
        orb.life -= dt;
        orb.bob = (orb.bob || 0) + dt * 5.0;
        const d = dist(orb, h);
        const holyOrbBonus = getActiveMetaMain()?.id === 'main_holy' ? Number(getActiveMetaMain()?.effects?.healOrbMagnetBonus || 0.7) : 0;
        if (d <= 2.8 + holyOrbBonus) {
          const pullSpd = 10.5;
          if (d <= 0.95) {
            orb.done = true;
            const healAmt = Math.max(25, Math.round(h.maxHp * (orb.hpPct || 0.18)));
            const prevHp = h.hp;
            h.hp = Math.min(h.maxHp, h.hp + healAmt);
            const actualHeal = Math.round(h.hp - prevHp);
            if ((orb.shield || 0) > 0 && h.shield < orb.shield) {
              const prevOrbShield = h.shield || 0;
              h.shield = Math.max(prevOrbShield, orb.shield);
              const orbShieldGain = Math.max(0, Math.round(h.shield - prevOrbShield));
              if (orbShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + orbShieldGain;
              h.shieldTimer = Math.max(h.shieldTimer || 0, 4.5);
            }
            if (game.w30Battle) game.w30Battle.healOrbsCollected = (game.w30Battle.healOrbsCollected || 0) + 1;
            ctx.ports.vfx.addRing(h.x, h.y, '#62ffb8', 1.6);
            ctx.ports.vfx.addFloat(h.x, h.y - 0.6, `💚 灵气回血 +${actualHeal || healAmt}`, '#72f2b4', true);
            ctx.ports.audio.play('holy', 1.15);
          } else {
            orb.x += (h.x - orb.x) / d * pullSpd * dt;
            orb.y += (h.y - orb.y) / d * pullSpd * dt;
          }
        }
      }
      game.healOrbs = game.healOrbs.filter(o => !o.done && o.life > 0);
    }
  }

  function gainHeroXp(amt){
    const game = ctx.game;
    const h = game.hero;
    h.xp += amt;
    game.xpCombo = Math.min(14, game.xpCombo + 1);
    game.xpComboTimer = 0.65;
    ctx.ports.audio.play('xp', 1 + game.xpCombo * 0.045);

    while (h.xp >= h.xpNext) {
      h.xp -= h.xpNext;
      h.lv++;
      h.xpNext = xpForLevel(h.lv);
      h.realm = getActiveUnlockNode().idx;
      const pickModalTurn = h.lv % 2 === 0;
      h.baseMaxHp += pickModalTurn ? BALANCE.progression.hpEvenLevelGain : BALANCE.progression.hpOddLevelGain;
      syncHeroMaxHp();
      h.hp = Math.min(h.maxHp, h.hp + (pickModalTurn ? BALANCE.progression.hpEvenLevelHeal : BALANCE.progression.hpOddLevelHeal));
      ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', 2.4);
      ctx.ports.audio.play('level');
      if (pickModalTurn) {
        ctx.ports.vfx.addFloat(h.x, h.y - 0.6, `✨ ${getRealmStageLabel()} Lv.${h.lv} · 领悟神通！`, '#8cf4ff', true);
        ctx.ports.modals.queueModal({ type:'levelup' });
      } else {
        ctx.ports.vfx.addFloat(h.x, h.y - 0.6, `✨ ${getRealmStageLabel()} Lv.${h.lv} · 灵脉淬体！`, '#72f2b4', true);
        ctx.ports.ui.toast(`✨ 等级提升【${getRealmStageLabel()} Lv.${h.lv}】！灵脉自动淬炼：生命上限 +${BALANCE.progression.hpOddLevelGain}、恢复 +${BALANCE.progression.hpOddLevelHeal}（下级可选神通卡）`);
      }
    }
  }

  function getCombatLogNowSec(){
    const game = ctx.game;
    if (!game) return 0;
    if (game.combatLog && Number.isFinite(game.combatLog.settledAtRunClock)) {
      return game.combatLog.settledAtRunClock;
    }
    const rmSec = Number(game.runMetrics?.totalEffectiveSec || 0);
    const waveSec = Number(game.waveClock || 0);
    return Number(Math.max(rmSec, waveSec).toFixed(2));
  }

  function getRecentThreatSummary(windowSec = 5.0){
    const game = ctx.game;
    const log = game?.combatLog;
    const nowT = getCombatLogNowSec();
    const cutoff = Math.max(0, nowT - windowSec);
    if (!log || !log.hits.length) {
      return { windowSec, anchorSec: nowT, hitCount: 0, totalHpLost: 0, totalDmg: 0, hits: [], topThreats: [], fatalSource: log?.fatalSource || null };
    }
    const recent = log.hits.filter(h => {
      const t = Number(h.runClock ?? 0);
      return t >= cutoff && t <= nowT + 1e-6;
    });
    const agg = new Map();
    let totalHpLost = 0;
    for (const h of recent) {
      totalHpLost += h.hpLost;
      const key = `${h.attackerName}｜${h.skillName}`;
      const cur = agg.get(key) || {
        attackerName: h.attackerName,
        skillName: h.skillName,
        isBossCore: h.isBossCore,
        isBossAux: h.isBossAux,
        hits: 0,
        totalHpLost: 0,
        maxSingleHit: 0
      };
      cur.hits++;
      cur.totalHpLost += h.hpLost;
      cur.maxSingleHit = Math.max(cur.maxSingleHit, h.hpLost);
      agg.set(key, cur);
    }
    const topThreats = Array.from(agg.values()).sort((a, b) => (b.totalHpLost - a.totalHpLost) || (b.hits - a.hits));
    return {
      windowSec,
      anchorSec: nowT,
      hitCount: recent.length,
      totalHpLost,
      totalDmg: totalHpLost,
      hits: recent.map(h => ({ ...h })),
      topThreats,
      fatalSource: log.fatalSource || null
    };
  }

  function damageHero(amt, sourceMeta = null){
    const game = ctx.game;
    const h = game.hero;
    if (h.invuln > 0 || !['prep','wave'].includes(game.phase)) return;
    const holyInvulnBonus = getActiveMetaMain()?.id === 'main_holy' ? Number(getActiveMetaMain()?.effects?.invulnBonus || 0.10) : 0;
    h.invuln = 0.28 + holyInvulnBonus;
    let rem = amt;
    const gm = aggregateGear(h.gear);
    if ((h.armorBreakT || 0) > 0) rem = Math.round(rem * 1.25);
    if (perkLv(game, 'frost_domain') >= 2) rem = Math.max(1, Math.round(rem * 0.80));
    if (gearSetTier('blood') >= 3 && h.hp <= h.maxHp * 0.5) rem = Math.max(1, Math.round(rem * 0.78));
    if (gm.dmgReduce > 0) rem = Math.max(1, Math.round(rem * (1 - gm.dmgReduce)));
    if (hasDestinyEnhancement(game, 'destiny_aegis_bulwark')) rem = Math.max(1, Math.round(rem * 0.90));
    // Stage 6 Aux Legacy [aux_tactical_reserve] (3 pts): once per wave deflect membrane reduces a >25% maxHp heavy hit by 35%
    let deflected = false;
    if (hasMetaAux('aux_tactical_reserve') && game.metaRunState?.deflectReady && rem >= Math.round(h.maxHp * 0.25)) {
      game.metaRunState.deflectReady = false;
      game.metaRunState.deflectTriggers = (game.metaRunState.deflectTriggers || 0) + 1;
      rem = Math.max(1, Math.round(rem * 0.65));
      deflected = true;
      ctx.ports.vfx.addRing(h.x, h.y, '#8ef4ff', 1.9);
      ctx.ports.vfx.addFloat(h.x, h.y - 0.72, '🛡️ 奇门偏折 -35%!', '#8ef4ff', true);
    }
    const rawDamageAfterMitigation = Math.max(0, Math.round(rem));
    const hadFrostShield = h.shield > 0 && h.frostShieldActive;
    const gearSyn = getActiveGearAffixSynergies();
    if (hadFrostShield && (gearSyn.hasFrostTrio || hasW20Direction(game, 'frost_bastion_counter'))) {
      const sc = BALANCE.equipment?.synergyCombat || {};
      const be = BALANCE.w20Breakthrough?.baseEffects || {};
      const pRad = hasW20Direction(game, 'frost_bastion_counter') ? Math.max(sc.frostTrioHitPulseRadius || 3.1, be.frostBasePulseRadius || 3.05) : (sc.frostTrioHitPulseRadius || 3.1);
      const pDmg = hasW20Direction(game, 'frost_bastion_counter') ? Math.max(sc.frostTrioHitPulseDmg || 44, be.frostBasePulseDmg || 46) : (sc.frostTrioHitPulseDmg || 44);
      triggerFrostPulse(pRad, pDmg, 1.0, 'shield_hit');
    } else if (hadFrostShield && h.w10Branch?.nova === 'nv_prism_lance') {
      triggerFrostPulse(2.8, 36, 0.9, 'w10');
    }
    let shieldAbsorbed = 0;
    if (h.shield > 0) {
      shieldAbsorbed = Math.min(h.shield, rem);
      h.shield -= shieldAbsorbed;
      rem -= shieldAbsorbed;
    }
    if (hadFrostShield && h.shield <= 0) {
      h.frostShieldActive = false;
      if (gearSetTier('frost') >= 3 || h.w10Branch?.nova === 'nv_glacial_bastion') {
        triggerFrostPulse(3.2, 42, 1.0, 'w10');
      }
    }
    const prevHp = h.hp;
    let actualHpLoss = 0;
    if (rem > 0) {
      h.hp = Math.max(0, h.hp - rem);
      actualHpLoss = Math.max(0, Math.round(prevHp - h.hp));
      game.shake = Math.max(game.shake, 5.2);
      ctx.ports.ui.flashScreen('dmg');
      ctx.ports.vfx.addFloat(h.x, h.y - 0.45, `-${actualHpLoss || Math.round(rem)}`, '#ff7666', actualHpLoss >= 18);
      ctx.ports.audio.play('hit');
      if (game.curWaveTel) {
        game.curWaveTel.hitsTaken++;
        game.curWaveTel.dmgTaken += actualHpLoss;
        game.curWaveTel.minHpPct = Math.min(game.curWaveTel.minHpPct, Math.round(h.hp * 100 / Math.max(1, h.maxHp)));
      }
      if (game.runMetrics) {
        game.runMetrics.hpLost = (game.runMetrics.hpLost || 0) + actualHpLoss;
      }
    }
    ctx.ports.ui.setDangerVignette(h.hp > 0 && h.hp < h.maxHp * 0.35);

    // Stage 6: Real combat hit & fatal attribution log (NEVER fabricates entries; strictly records actualHpLoss!)
    const meta = sourceMeta && typeof sourceMeta === 'object' ? sourceMeta : {};
    const hpPctAfter = Math.round(h.hp * 100 / Math.max(1, h.maxHp));
    const hitEntry = {
      wave: game.wave,
      waveClock: Number((game.waveClock || 0).toFixed(2)),
      runClock: getCombatLogNowSec(),
      attackerName: meta.attackerName || '战场敌人',
      attackerKind: meta.attackerKind || 'unknown',
      skillName: meta.skillName || '攻击命中',
      isBoss: !!meta.isBoss,
      isBossCore: !!meta.isBossCore,
      isBossAux: !!meta.isBossAux,
      auxKey: meta.auxKey || null,
      rawAmt: Math.round(amt),
      rawDamageAfterMitigation,
      shieldAbsorbed: Math.round(shieldAbsorbed),
      hpLost: actualHpLoss,
      hpAfter: Math.round(h.hp),
      hpPctAfter,
      deflected,
      fatal: false
    };
    if (game.combatLog) {
      game.combatLog.hits.push(hitEntry);
      if (game.combatLog.hits.length > 160) game.combatLog.hits.shift();
      game.combatLog.lowestHpPct = Math.min(game.combatLog.lowestHpPct, hpPctAfter);
      game.combatLog.totalHitsTaken++;
      game.combatLog.totalHpLost += hitEntry.hpLost;
      game.combatLog.totalShieldAbsorbed += hitEntry.shieldAbsorbed;
      const skey = `${hitEntry.attackerName}｜${hitEntry.skillName}`;
      const prev = game.combatLog.bySource[skey] || {
        attackerName: hitEntry.attackerName,
        skillName: hitEntry.skillName,
        isBossCore: hitEntry.isBossCore,
        isBossAux: hitEntry.isBossAux,
        hits: 0,
        totalHpLost: 0,
        maxSingleHit: 0
      };
      prev.hits++;
      prev.totalHpLost += hitEntry.hpLost;
      prev.maxSingleHit = Math.max(prev.maxSingleHit, hitEntry.hpLost);
      game.combatLog.bySource[skey] = prev;
    }

    // Body Thorns perk (金刚反震): reactive shockwave + shield on hit
    const btLv = perkLv(game, 'body_thorns');
    if (btLv > 0 && h.thornsCd <= 0 && h.hp > 0) {
      h.thornsCd = 3.0;
      const prevBtShield = h.shield || 0;
      h.shield = Math.max(prevBtShield, btLv >= 2 ? 60 : 28);
      const btShieldGain = Math.max(0, Math.round(h.shield - prevBtShield));
      if (btShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + btShieldGain;
      h.shieldTimer = 4.0;
      if (btLv >= 2) h.hp = Math.min(h.maxHp, h.hp + 15);
      ctx.ports.vfx.addRing(h.x, h.y, '#ffe478', 3.0);
      const hs = getHeroStats();
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(h, e) <= 3.1 + e.r) {
          dealDamage(e, Math.round((btLv >= 2 ? 55 : 32) * hs.dmgMult), { fromHero:false, skillKey:'perk', col:'#ffe88a' });
          if (btLv >= 2 && !e.boss) e.freezeT = Math.max(e.freezeT, 1.0);
        }
      }
    }
    // Undying Will perk (不灭金身): once per wave fatal save!
    if (h.hp <= 0) {
      const uwLv = perkLv(game, 'undying_will');
      if (uwLv > 0 && h.undyingUsedWave !== game.wave) {
        h.undyingUsedWave = game.wave;
        h.hp = Math.round(h.maxHp * (uwLv >= 2 ? 0.80 : 0.50));
        h.invuln = 2.5;
        if (uwLv >= 2) h.ultTimer = Math.max(h.ultTimer, 4.0);
        game.shake = 10;
        ctx.ports.vfx.addRing(h.x, h.y, '#ffe878', 6.0);
        for (const e of game.enemies) {
          if (e.hp > 0 && dist(h, e) <= 6.0) dealDamage(e, Math.round(120 * getHeroStats().dmgMult), { fromHero:false, skillKey:'perk', col:'#ffe878' });
        }
        ctx.ports.ui.setDangerVignette(h.hp < h.maxHp * 0.35);
        ctx.ports.ui.showBanner('👑 不灭金身触发！', uwLv >= 2 ? '回血 80% + 无敌 2.5s + 4s 全军超载！' : '回血 50% + 无敌 2.5s + 清屏震爆！', 'good');
        ctx.ports.audio.play('level', 1.2);
        return;
      }
      hitEntry.fatal = true;
      if (game.combatLog) game.combatLog.fatalSource = hitEntry;
      finishGame(false);
    }
  }

  return { updatePickups, gainHeroXp, getCombatLogNowSec, getRecentThreatSummary, damageHero };
}
