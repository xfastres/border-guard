import BALANCE from '../../data/balance.js';
import { W, H, CELL, MAIN_WAVES, ELITE_AFFIXES, ENEMY_SPECS, SUB_SEAL_RESONANCE } from '../../data/index.js';
import { dist, clamp } from '../../core/math.js';
import { perkLv, hasW20Direction, hasW20Enhancement, hasDestinyEnhancement } from '../../core/state-queries.js';

export function isEnemyUnstoppable(e){
  return !!e && (e.aiState === 'windup' || e.aiState === 'leap' || e.aiState === 'charge');
}

export function createCombatDamage(ctx, deps) {
  /* Dynamic viewport-perimeter rectangle spawn: ALWAYS outside visible screen regardless of aspect ratio! */
  function spawnPosAroundHero(side){
    const h = ctx.game.hero;
    const cam = ctx.ports.viewport.getCamera();
    const viewHalfW = (cam.w / (2 * Math.max(0.5, cam.zoom))) / CELL;
    const viewHalfH = (cam.h / (2 * Math.max(0.5, cam.zoom))) / CELL;
    const rx = Math.max(11.5, viewHalfW + 1.6);
    const ry = Math.max(8.5, viewHalfH + 1.6);
    const pick = side || ['west','east','north','south'][Math.floor(ctx.game.rnd() * 4)];
    const jitter = (ctx.game.rnd() * 2 - 1);
    let sx = h.x, sy = h.y;
    if (pick === 'east')       { sx = h.x + rx; sy = h.y + jitter * ry; }
    else if (pick === 'west')  { sx = h.x - rx; sy = h.y + jitter * ry; }
    else if (pick === 'south') { sy = h.y + ry; sx = h.x + jitter * rx; }
    else                       { sy = h.y - ry; sx = h.x + jitter * rx; }

    // If hero hugs a world border and spawn falls outside world, reflect to opposite open side
    if (sx < 0.8) sx = h.x + rx;
    else if (sx > W - 0.8) sx = h.x - rx;
    if (sy < 0.8) sy = h.y + ry;
    else if (sy > H - 0.8) sy = h.y - ry;

    return { x: clamp(sx, 0.8, W - 0.8), y: clamp(sy, 0.8, H - 0.8) };
  }

  function pickEliteAffixes(cnt = 1){
    const pool = ELITE_AFFIXES.slice();
    const out = [];
    while (out.length < cnt && pool.length) {
      out.push(pool.splice(Math.floor(ctx.game.rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  function spawnEnemy(kind, side, scale = 1, customPos = null){
    const sp = ENEMY_SPECS[kind];
    const pos = customPos || spawnPosAroundHero(side);
    const hp = Math.round(sp.hp * scale);
    const affixCnt = sp.elite ? (ctx.game.wave >= 22 ? 3 : ctx.game.wave >= 12 ? 2 : 1) : 0;
    const bw = BALANCE.wave;
    const waveSpdMult = bw.enemySpeedBands.reduce((m, band) => ctx.game.wave >= band.from ? band.mult : m, 1);
    const wDmgMult = (1 + (ctx.game.wave - 1) * bw.enemyDamageGrowthPerWave) *
      (ctx.game.wave >= bw.enemyDamageLateStart ? Math.pow(bw.enemyDamageLateGrowth, ctx.game.wave - (bw.enemyDamageLateStart - 1)) : 1)
      * (bw.pressure[ctx.game.wave - 1] ?? 1);
    const w30Cfg = BALANCE.w30Boss || {};
    const baseSpd = Number((sp.spd * waveSpdMult).toFixed(2));
    const e = {
      id: ctx.game.nextEnemyId++,
      kind, name: sp.name,
      x: pos.x, y: pos.y,
      hp, maxHp: hp, shield: 0,
      spd: baseSpd, baseSpd, dmg: Math.round(sp.dmg * wDmgMult),
      xp: sp.xp, gold: sp.gold, r: sp.r,
      col: sp.col, rim: sp.rim,
      ranged: !!sp.ranged, range: sp.range || 0,
      leaper: !!sp.leaper, charger: !!sp.charger, bomber: !!sp.bomber, shaman: !!sp.shaman,
      totem: !!sp.totem, totemTimer: 2.2, totemBossId: null,
      pillar: !!sp.pillar, pillarTimer: 2.8, pillarBossId: null,
      voidGuard: !!sp.voidGuard,
      elite: !!sp.elite, boss: !!sp.boss,
      affixes: affixCnt > 0 ? pickEliteAffixes(affixCnt) : [],
      cd: 0.4, slow: 0, slowT: 0, freezeT: 0, burnDps: 0, burnT: 0, vulnT: 0, frenzyT: 0,
      fireMarkT: 0, fireMarkStacks: 0, fireMarkSource: null, fireDetonateCd: 0,
      flash: 0, bossTimer: kind === 'boss6' ? (w30Cfg.coreCooldownOpening || 5.2)
        : kind === 'boss4' ? BALANCE.combat.w20FirstCoreDelay : 5.0,
      bossAuxTimer: kind === 'boss6' ? (w30Cfg.auxCooldownMid || 9.5) : 3.6,
      bossAuxCasts: 0, bossChaseQueue: 0, bossChaseCd: 0, bossPhase: 0, frenzied: false,
      signatureThresholdHp: kind === 'boss6' ? Math.round(hp * (w30Cfg.signatureThresholdPct ?? 0.80)) : 0,
      finalThresholdHp: kind === 'boss6' ? Math.round(hp * (w30Cfg.finalPhaseThresholdPct ?? 0.35)) : 0,
      signatureTriggered: false,
      signatureLockActive: false,
      signatureStage: 'none', // 'none' | 'telegraph' | 'shockwave' | 'done'
      signatureTimer: 0,
      signatureSafeZone: null,
      finalPhaseEntered: false,
      sigFloatCd: 0,
      zeroExecCd: 0,
      aiState: 'chase', aiTimer: 0, aiCd: 2.0 + ctx.game.rnd() * 1.4, aiVx: 0, aiVy: 0,
      affixTimer: 2.4 + ctx.game.rnd() * 1.2, shamanTimer: 2.2, unstopFloatCd: 0
    };
    ctx.game.enemies.push(e);
    if (kind === 'boss6' && ctx.game.w30Battle) {
      ctx.game.w30Battle.bossId = e.id;
      ctx.game.w30Battle.bossMaxHp = e.maxHp;
      ctx.game.w30Battle.signatureThresholdHp = e.signatureThresholdHp;
      ctx.game.w30Battle.finalThresholdHp = e.finalThresholdHp;
    }
    if (ctx.game.curWaveTel) ctx.game.curWaveTel.ehpTotal += hp;
    return e;
  }

  function spawnHealOrb(x, y, opts = {}){
    if (!ctx.game) return null;
    ctx.game.healOrbs = ctx.game.healOrbs || [];
    const w30Cfg = BALANCE.w30Boss || {};
    const orb = {
      x: clamp(x, 2.0, W - 2.0),
      y: clamp(y, 2.0, H - 2.0),
      hpPct: opts.hpPct ?? (w30Cfg.healOrbHpPct || 0.18),
      shield: opts.shield ?? 18,
      life: opts.life ?? 18.0,
      bob: ctx.game.rnd() * Math.PI * 2
    };
    ctx.game.healOrbs.push(orb);
    if (ctx.game.w30Battle) ctx.game.w30Battle.healOrbsSpawned = (ctx.game.w30Battle.healOrbsSpawned || 0) + 1;
    ctx.ports.vfx.addRing(orb.x, orb.y, '#62ffb8', 1.2);
    return orb;
  }

  function triggerW30BossSignature(boss, truncatedDmg = 0){
    if (!boss || boss.kind !== 'boss6' || boss.signatureTriggered) return false;
    const w30Cfg = BALANCE.w30Boss || {};
    const h = ctx.game.hero;
    const teleSec = w30Cfg.signatureTelegraphSeconds || 2.6;
    const safeDist = w30Cfg.signatureSafeZoneDist || 5.4;
    const safeR = w30Cfg.signatureSafeZoneRadius || 2.8;
    const baseAng = Math.atan2(h.y - boss.y, h.x - boss.x);
    const safeAng = baseAng + (ctx.game.rnd() < 0.5 ? 0.55 : -0.55);
    const safeX = clamp(boss.x + Math.cos(safeAng) * safeDist, 4.0, W - 4.0);
    const safeY = clamp(boss.y + Math.sin(safeAng) * safeDist, 4.0, H - 4.0);

    boss.hp = boss.signatureThresholdHp;
    boss.signatureTriggered = true;
    boss.signatureLockActive = true;
    boss.signatureStage = 'telegraph';
    boss.signatureTimer = teleSec;
    boss.signatureSafeZone = { x: safeX, y: safeY, r: safeR };
    boss.aiState = 'signature'; // NOT unstoppable -> Fire marks, Frost slow & Frost shield still work legitimately!

    ctx.game.zones.push({
      kind: 'w30SigTelegraph',
      bossId: boss.id,
      x: boss.x, y: boss.y, r: 16.5,
      safeX, safeY, safeR,
      t: teleSec, max: teleSec,
      dmg: w30Cfg.signatureDamage || 68
    });

    if (ctx.game.w30Battle) {
      const at = Number((ctx.game.w30Battle.elapsedSeconds || 0).toFixed(2));
      ctx.game.w30Battle.phase = 'signature_telegraph';
      ctx.game.w30Battle.signatureTriggered = true;
      ctx.game.w30Battle.signatureLockActive = true;
      ctx.game.w30Battle.signatureLockStartedAt = at;
      ctx.game.w30Battle.signatureTruncatedDmg = Math.max(0, Math.round(truncatedDmg));
      ctx.game.w30Battle.phaseTimeline.push({
        phase: 'signature_telegraph',
        at,
        bossHpPct: Math.round(boss.hp * 100 / Math.max(1, boss.maxHp)),
        truncatedDmg: Math.max(0, Math.round(truncatedDmg))
      });
    }

    ctx.ports.audio.play('boss', 0.85);
    ctx.game.shake = Math.max(ctx.game.shake, 9);
    ctx.ports.ui.flashScreen('fail');
    ctx.ports.vfx.addRing(boss.x, boss.y, '#ff2e63', 4.5);
    ctx.ports.vfx.addFloat(boss.x, boss.y - 1.0, '🛡️ 终焉锁血 · 招牌招式蓄力！', '#ffe678', true);
    ctx.ports.ui.showBanner(
      '⚠️ 深渊主宰 · 80% 血线招牌招式【终焉裂空冲击波】！',
      '🛡️ 首领进入终焉锁血（命中可挂火标/减速/叠盾，扣血与吸血为 0）！速入青绿安全区规避爆发！',
      'boss'
    );
    return true;
  }

  function enterW30BossFinalPhase(boss){
    if (!boss || boss.kind !== 'boss6' || boss.finalPhaseEntered || boss.signatureLockActive) return false;
    boss.finalPhaseEntered = true;
    boss.frenzied = true;
    boss.spd = Number(((boss.baseSpd || boss.spd) * 1.16).toFixed(2));
    boss.bossTimer = Math.min(boss.bossTimer, 1.4);
    if (ctx.game.w30Battle) {
      const at = Number((ctx.game.w30Battle.elapsedSeconds || 0).toFixed(2));
      ctx.game.w30Battle.phase = 'final_combo';
      ctx.game.w30Battle.phaseTimeline.push({
        phase: 'final_combo',
        at,
        bossHpPct: Math.round(boss.hp * 100 / Math.max(1, boss.maxHp))
      });
    }
    const h = ctx.game.hero;
    spawnHealOrb(clamp(h.x + (ctx.game.rnd() - 0.5) * 4.0, 3, W - 3), clamp(h.y + (ctx.game.rnd() - 0.5) * 4.0, 3, H - 3));
    ctx.ports.audio.play('boss', 1.1);
    ctx.game.shake = Math.max(ctx.game.shake, 8);
    ctx.ports.vfx.addRing(boss.x, boss.y, '#ff385c', 4.2);
    ctx.ports.vfx.addFloat(boss.x, boss.y - 0.95, '🔥 末段组合压制 · 打空即胜！', '#ff809c', true);
    ctx.ports.ui.showBanner('🔥 深渊主宰进入末段（≤35%）· 招式组合全力展开！', '末段无锁血，伤害正常结算，打空血条即刻通关 30 波！', 'boss');
    return true;
  }

  function applyHeroLifesteal(rawAmt){
    const h = ctx.game.hero;
    if (!h || rawAmt <= 0 || h.hp >= h.maxHp) return 0;
    const bloodSet = deps.hero.gearSetTier('blood');
    const bloodMult = bloodSet >= 3 ? 1.80 : bloodSet >= 2 ? 1.45 : 1.0;
    const afkMult = (ctx.game.phase === 'wave' && !h.moving && h.invuln <= 0) ? 0.50 : 1.0;
    const cap = Math.max(8, Math.round(h.maxHp * BALANCE.combat.leechHpFractionPerSecond * bloodMult * afkMult));
    const avail = Math.max(0, cap - (h.leechUsed || 0));
    const heal = Math.min(rawAmt, avail, h.maxHp - h.hp);
    if (heal > 0) {
      h.hp += heal;
      h.leechUsed = (h.leechUsed || 0) + heal;
    }
    return heal;
  }

  function dealDamage(e, rawDmg, opts = {}){
    if (!e || e.hp <= 0 || ctx.game.phase === 'won' || ctx.game.phase === 'lost') return 0;
    const wasSignatureLocked = !!(e.kind === 'boss6' && e.signatureLockActive);
    const syn = deps.hero.getSynergyCounts();
    const frostSet = deps.hero.gearSetTier('frost');
    const flameSet = deps.hero.gearSetTier('flame');
    const gearSyn = deps.equipment.getActiveGearAffixSynergies();
    const gm = deps.hero.aggregateGear(ctx.game?.hero?.gear || []);
    const hadFireMarkBeforeHit = (e.fireMarkT || 0) > 0;
    let dmg = rawDmg;
    const frostSub = deps.hero.getSubSeal('frost');
    const chillAmp = frostSub ? SUB_SEAL_RESONANCE.frost.chillAmp[frostSub.star - 1] : 0;
    if ((e.slowT > 0 || e.freezeT > 0)) {
      if (syn.frost >= 2) dmg *= 1.25;
      if (chillAmp > 0) dmg *= (1 + chillAmp);
      if (frostSet >= 2) dmg *= (frostSet >= 3 ? 1.35 : 1.20);
      if (gm.chilledDmgPct > 0) dmg *= (1 + gm.chilledDmgPct);
    }
    const isFireHit = (opts.skillKey === 'firewave' || opts.tower?.elem === 'fire' || opts.isFireExp || opts.burn > 0);
    if (flameSet >= 2 && isFireHit) {
      dmg *= (flameSet >= 3 ? 1.40 : 1.25);
    }
    if (gm.fireDmgPct > 0 && isFireHit) {
      dmg *= (1 + gm.fireDmgPct);
    }
    if (gm.markedDmgPct > 0 && (e.fireMarkT > 0 || e.burnT > 0)) {
      dmg *= (1 + gm.markedDmgPct);
    }
    if (e.vulnT > 0) dmg *= 1.20;
    if (hasDestinyEnhancement(ctx.game, 'destiny_fate_breaker') && (e.boss || e.elite || e.vulnT > 0)) {
      dmg *= 1.22;
    }

    // Dual Cataclysm (雷火劫印): burning enemy takes bonus thunder dmg + instant burn burst!
    const dcLv = perkLv(ctx.game, 'dual_cataclysm');
    let dcHealPending = false;
    if (dcLv > 0 && opts.isThunder && e.burnT > 0) {
      dmg *= (dcLv >= 2 ? 2.0 : 1.6);
      const burnBurst = Math.round(e.burnDps * e.burnT * 0.6);
      if (burnBurst > 0) dmg += burnBurst;
      e.burnT = 3.0;
      if (dcLv >= 2) dcHealPending = true;
    }

    const statusCap = BALANCE.combat.statusMultiplierSoftCap;
    if (dmg > rawDmg * statusCap) {
      dmg = rawDmg * statusCap + (dmg - rawDmg * statusCap) * BALANCE.combat.statusOverflowScale;
    }
    const isCrit = opts.critChance ? ctx.game.rnd() < opts.critChance : false;
    if (isCrit) dmg *= (opts.critDmg || 1.7);
    if (isCrit && hasDestinyEnhancement(ctx.game, 'destiny_fate_breaker') && (e.boss || e.elite) && !opts.fromDestinyBreaker && (ctx.game.hero?.destinyBreakerCd || 0) <= 0) {
      ctx.game.hero.destinyBreakerCd = 1.2;
      e.vulnT = Math.max(e.vulnT || 0, 2.5);
      dmg = Math.round(dmg * 1.35);
      deps.hooks.recordDestinyProc('destiny_fate_breaker');
      ctx.ports.vfx.addFloat(e.x, e.y - 0.85, '⚔️破劫裁决!', '#ffe484', true);
    }
    dmg = Math.max(1, Math.round(dmg));

    // Zero Execution (绝对零度): Boss extra missing HP true dmg at Lv.2 (fair 1.5s ICD + cap so 3-5 min W30 Boss isn't broken)
    const zeLv = perkLv(ctx.game, 'zero_exec');
    if (zeLv >= 2 && e.boss && !opts.fromExec && (e.zeroExecCd || 0) <= 0) {
      const rawMissing = Math.round((e.maxHp - e.hp) * 0.06);
      const bossCap = e.kind === 'boss6' ? Math.max(240, Math.round(dmg * 0.55)) : Math.max(320, Math.round(dmg * 0.80));
      dmg += Math.min(rawMissing, bossCap);
      e.zeroExecCd = 1.5;
    }

    // ==================== STAGE 5: DECOUPLED HP DEDUCTION & W30 BOSS SIGNATURE LOCK ====================
    let actualHpDmg = 0;
    let actualShieldDmg = 0;

    if (wasSignatureLocked) {
      // STRICT HP LOCK: actual HP deduction = 0, damage-based lifesteal = 0; legitimate hit effects STILL resolve below!
      actualHpDmg = 0;
      actualShieldDmg = 0;
      e.hp = e.signatureThresholdHp;
      e.flash = 0.08;
      if (ctx.game.w30Battle) {
        ctx.game.w30Battle.signatureHitsDuringLock++;
      }
      if ((e.sigFloatCd || 0) <= 0) {
        e.sigFloatCd = 0.42;
        ctx.ports.vfx.addFloat(e.x + (ctx.game.rnd() - 0.5) * 0.35, e.y - 0.65, '🛡️终焉锁血(0扣血)', '#ffd97d', true);
      }
    } else {
      // Absorb enemy shield first if present (Elite/Boss affix)
      let hpDmg = dmg;
      if (e.shield > 0) {
        const abs = Math.min(e.shield, hpDmg);
        e.shield -= abs;
        actualShieldDmg = abs;
        hpDmg -= abs;
      }

      // W30 Boss6 first crossing of signature threshold (80% HP): TRUNCATE excess crossing damage & enter signature lock!
      if (e.kind === 'boss6' && !e.signatureTriggered && e.signatureThresholdHp > 0 && (e.hp - hpDmg) <= e.signatureThresholdHp) {
        const allowedHpDmg = Math.max(0, e.hp - e.signatureThresholdHp);
        const truncated = Math.max(0, hpDmg - allowedHpDmg);
        actualHpDmg = allowedHpDmg;
        e.hp = e.signatureThresholdHp;
        e.flash = 0.12;
        triggerW30BossSignature(e, truncated);
      } else {
        actualHpDmg = Math.min(e.hp, hpDmg);
        e.hp -= hpDmg;
        e.flash = 0.10;
        if (e.kind === 'boss6' && e.signatureTriggered && !e.signatureLockActive && !e.finalPhaseEntered && e.hp > 0 && e.hp <= e.finalThresholdHp) {
          enterW30BossFinalPhase(e);
        }
      }
    }

    const effectiveDmg = actualHpDmg + actualShieldDmg;
    if (e.boss && actualShieldDmg > 0 && e.shield <= 0) ctx.ports.vfx.impact?.(e.x, e.y, 'ward');
    if (effectiveDmg > 0) {
      ctx.game.stats.dmgTotal += effectiveDmg;
      if (opts.tower) opts.tower.dmgDealt = (opts.tower.dmgDealt || 0) + effectiveDmg;
      if (opts.skillKey && ctx.game.stats.skillDmg && opts.skillKey in ctx.game.stats.skillDmg) {
        ctx.game.stats.skillDmg[opts.skillKey] += effectiveDmg;
      }
    }

    // Zero Execution instant shatter kill on non-boss
    if (zeLv > 0 && e.hp > 0 && !e.boss && (e.freezeT > 0 || e.hp < e.maxHp * (zeLv >= 2 ? 0.30 : 0.20))) {
      e.hp = 0;
      ctx.ports.vfx.addRing(e.x, e.y, '#8ef4ff', 1.1);
      ctx.ports.vfx.addFloat(e.x, e.y - 0.5, '💠 绝对斩杀!', '#a8f8ff', true);
    }

    if (!wasSignatureLocked && (isCrit || effectiveDmg >= 28 || ctx.game.floats.length < 40)) {
      ctx.ports.vfx.addFloat(e.x + (ctx.game.rnd()-0.5)*0.3, e.y - 0.3, isCrit ? `${Math.round(effectiveDmg)}!` : String(Math.round(effectiveDmg)), isCrit ? '#ffdf4d' : (opts.col || '#ffffff'), isCrit);
    }
    if (isCrit) {
      ctx.ports.audio.play('crit');
      if (perkLv(ctx.game, 'crit_surge') >= 2) {
        ctx.game.hero.dashCd = Math.max(0, ctx.game.hero.dashCd - 0.15);
        ctx.game.hero.ultCd = Math.max(0, ctx.game.hero.ultCd - 0.15);
      }
      if (syn.holy >= 4 && !opts.noHolyProc) {
        ctx.ports.vfx.addRing(e.x, e.y, '#ffe478', 1.35);
        for (const o of ctx.game.enemies) {
          if (o.id !== e.id && o.hp > 0 && dist(o, e) <= 1.4) dealDamage(o, Math.round(dmg * 0.35), { col:'#ffe478', noHolyProc:true, skillKey:'perk' });
        }
      }
      // Thunder Arc (紫霄天引): crit calls extra chain lightning
      const taLv = perkLv(ctx.game, 'thunder_arc');
      if (taLv > 0 && !opts.noChainProc && ctx.game.rnd() < (taLv >= 2 ? 0.55 : 0.30)) {
        fireChainLightning(e, Math.round(dmg * 0.55), taLv >= 2 ? 5 : 3, {
          ox: e.x, oy: e.y - 2.6, noChainProc: true, isThunder: true, skillKey: 'perk', vuln: taLv >= 2
        });
      }
      // Flame Set 2pc/3pc: crit vs burning enemy erupts赤焰爆轰
      if (flameSet >= 2 && e.burnT > 0 && !opts.noFlameBlast) {
        const fRad = flameSet >= 3 ? 2.2 : 1.6;
        ctx.ports.vfx.addRing(e.x, e.y, '#ff6a38', fRad);
        for (const o of ctx.game.enemies) {
          if (o.id !== e.id && o.hp > 0 && dist(o, e) <= fRad + o.r) {
            dealDamage(o, Math.max(8, Math.round(dmg * 0.45)), { col:'#ff884d', noFlameBlast:true, isFireExp:true, skillKey:'perk' });
          }
        }
      }
    }

    // Slow & Frost Tier-4 Freeze Shatter (BLOCKED if Unstoppable windup/leap/charge; ALLOWED during Boss6 signature lock!)
    const appliedSlow = Math.max(opts.slow || 0, (opts.fromHero && !opts.noFrostShieldProc) ? (gm.slowOnHit || 0) : 0);
    if (appliedSlow > 0) {
      if (isEnemyUnstoppable(e)) {
        if ((e.unstopFloatCd || 0) <= 0) {
          e.unstopFloatCd = 0.85;
          ctx.ports.vfx.addFloat(e.x, e.y - 0.55, '🛡️霸体!', '#ffcc4d', true);
        }
      } else {
        const hadSlowBefore = (e.slowT || 0) > 0;
        e.slow = Math.max(e.slow, appliedSlow);
        e.slowT = Math.max(e.slowT, opts.slowDur || 2.4);
        if (!hadSlowBefore && ctx.game?.stats) {
          ctx.game.stats.frostSlowsApplied = (ctx.game.stats.frostSlowsApplied || 0) + 1;
        }
        if (e.kind === 'boss6' && e.signatureLockActive && ctx.game?.w30Battle?.signatureStatusHitsDuringLock) {
          ctx.game.w30Battle.signatureStatusHitsDuringLock.frostSlows++;
        }
        if (syn.frost >= 4 && !e.boss && e.freezeT <= 0 && ctx.game.rnd() < 0.25) {
          e.freezeT = 1.5 * (perkLv(ctx.game, 'frost_shatter') >= 2 ? 1.5 : 1);
          ctx.ports.vfx.addRing(e.x, e.y, '#a4f4ff', 0.9);
          e.hp -= 60;
          ctx.ports.vfx.addFloat(e.x, e.y - 0.55, '碎冰 -60', '#96f2ff', true);
        }
      }
    }
    if (opts.vuln || (opts.vulnBoss && (e.boss || e.elite))) e.vulnT = Math.max(e.vulnT || 0, 3.0);
    if (opts.burn > 0) {
      e.burnDps = Math.max(e.burnDps, opts.burn);
      e.burnT = Math.max(e.burnT, 3.0);
    }

    if (opts.applyFireMarkOnHit && e.hp > 0) {
      deps.hooks.applyFireMark(e, 1, 'w20_fire_ember_barrage', 4.5);
    }
    if (opts.fromHero && e.hp > 0 && (ctx.game.hero.w20TacticalReadyT || 0) > 0 && hasW20Enhancement(ctx.game, 'w20_shared_tactical_surge')) {
      ctx.game.hero.w20TacticalReadyT = 0;
      deps.hooks.recordW20Proc('enhancement');
      deps.hooks.applyFireMark(e, 1, 'w20_shared_tactical_surge', 4.8);
      deps.hooks.applyFrostSlow(e, 0.50, 3.0, 'w20_shared_tactical_surge');
      ctx.ports.vfx.addFloat(e.x, e.y - 0.75, '⚡战技连携!', '#ffe680', true);
      if (hasW20Direction(ctx.game, 'fire_chain_surge') || gearSyn.hasFireDuo || gearSyn.hasFireTrio) {
        deps.hooks.triggerFireDetonation(e, 1.15, { radius: 1.9, skillKey: opts.skillKey || 'firewave' });
      } else {
        deps.hooks.gainFrostShield(20, { duration: 4.5, source: 'w20_shared_tactical_surge' });
      }
    }

    // Stage 2: Independent Fire Brand affix + Fire Detonation Duo / Complete Trio Synergy
    // Trio STRICTLY replaces Duo (never triggers both on the same hit!)
    if (!opts.noFireDetonate && opts.skillKey !== 'perk' && (opts.fromHero || opts.tower || isFireHit)) {
      const sc = BALANCE.equipment?.synergyCombat || {};
      if (hadFireMarkBeforeHit && (gearSyn.hasFireTrio || gearSyn.hasFireDuo) && (e.fireDetonateCd || 0) <= 0) {
        if (gearSyn.hasFireTrio) {
          if (ctx.game.stats) ctx.game.stats.gearFireTrioProcs = (ctx.game.stats.gearFireTrioProcs || 0) + 1;
          deps.hooks.triggerFireDetonation(e, sc.fireTrioDetonateMult || 1.25, {
            radius: sc.fireTrioRadius || 2.05,
            skillKey: opts.skillKey || 'firewave'
          });
        } else if (gearSyn.hasFireDuo) {
          if (ctx.game.stats) ctx.game.stats.gearFireDuoProcs = (ctx.game.stats.gearFireDuoProcs || 0) + 1;
          deps.hooks.triggerFireDetonation(e, sc.fireDuoDetonateMult || 1.15, {
            radius: sc.fireDuoRadius || 1.85,
            skillKey: opts.skillKey || 'firewave',
            skipTrioChain: true
          });
        }
      } else if (e.hp > 0 && !hadFireMarkBeforeHit) {
        const shouldMark = (gearSyn.hasFireTrio || gearSyn.hasFireDuo)
          ? (isFireHit || opts.fromHero)
          : (gm.fireMarkChance > 0 && (isFireHit || opts.fromHero) && ctx.game.rnd() < gm.fireMarkChance);
        if (shouldMark) {
          deps.hooks.applyFireMark(e, 1, 'gear_affix', 4.8);
        }
      }
    }

    // Stage 2: Frost Aegis Duo / Complete Trio Synergy (Trio STRICTLY replaces Duo!)
    if (!opts.noFrostShieldProc && opts.skillKey !== 'perk' && (e.slowT > 0 || e.freezeT > 0) && (gearSyn.hasFrostTrio || gearSyn.hasFrostDuo)) {
      if ((ctx.game.hero.gearFrostShieldCd || 0) <= 0) {
        const sc = BALANCE.equipment?.synergyCombat || {};
        if (gearSyn.hasFrostTrio) {
          ctx.game.hero.gearFrostShieldCd = sc.frostTrioShieldCd || 0.40;
          if (ctx.game.stats) ctx.game.stats.gearFrostTrioProcs = (ctx.game.stats.gearFrostTrioProcs || 0) + 1;
          deps.hooks.gainFrostShield(sc.frostTrioShieldGain || 18, {
            duration: 5.0,
            maxShield: sc.frostTrioShieldCap || 115,
            source: 'gear_frost_trio'
          });
        } else if (gearSyn.hasFrostDuo) {
          ctx.game.hero.gearFrostShieldCd = sc.frostDuoShieldCd || 0.45;
          if (ctx.game.stats) ctx.game.stats.gearFrostDuoProcs = (ctx.game.stats.gearFrostDuoProcs || 0) + 1;
          deps.hooks.gainFrostShield(sc.frostDuoShieldGain || 14, {
            duration: 4.5,
            maxShield: sc.frostDuoShieldCap || 95,
            source: 'gear_frost_duo',
            noFullShieldPulse: !hasW20Enhancement(ctx.game, 'w20_frost_overflow_nova')
          });
        }
      }
    }

    // Dual Resonance: Wind+Fire & Frost+Thunder procs
    if ((opts.isWind || opts.tower?.elem === 'wind') && deps.hero.hasDualRes('wind_fire')) {
      e.burnDps = Math.max(e.burnDps, 14);
      e.burnT = Math.max(e.burnT, 3.0);
      if (!opts.fromWindRes && e.hp > 0 && ctx.game.rnd() < 0.35) {
        dealDamage(e, Math.max(5, Math.round(dmg * 0.30)), { col:'#ff9a52', fromWindRes:true, isFireExp:true, skillKey:'perk' });
      }
    }
    if (opts.isThunder && deps.hero.hasDualRes('frost_thunder') && (e.slowT > 0 || e.freezeT > 0) && !opts.fromDualFrost && e.hp > 0) {
      ctx.ports.vfx.addRing(e.x, e.y, '#9ce4ff', 1.65);
      e.vulnT = Math.max(e.vulnT || 0, 3.0);
      for (const o of ctx.game.enemies) {
        if (o.hp > 0 && dist(o, e) <= 1.65 + o.r) {
          dealDamage(o, Math.max(6, Math.round(dmg * 0.35)), { col:'#9ce4ff', fromDualFrost:true, skillKey:'perk' });
        }
      }
    }
    // Frost Set 2pc/3pc: chance to form +10 icy shield on chilled enemy
    if (frostSet >= 2 && (e.slowT > 0 || e.freezeT > 0) && opts.skillKey !== 'perk' && ctx.game.rnd() < (frostSet >= 3 ? 0.35 : 0.22)) {
      deps.hooks.gainFrostShield(10, 4.0, 60);
    }

    // Capped Damage-Based Lifesteal: STRICTLY based on actual HP damage dealt (0 during W30 Boss signature lock!)
    if (!wasSignatureLocked && actualHpDmg > 0) {
      if (dcHealPending) applyHeroLifesteal(3);
      if (opts.lifesteal > 0) {
        applyHeroLifesteal(opts.lifesteal * 0.50);
      }
    }

    // On-hit Volt Crest / Thunder Spark affix chain proc
    const chainChance = Math.max(opts.chainProc || 0, (opts.fromHero && !opts.noChainProc) ? (gm.chainProc || 0) : 0);
    if (chainChance > 0 && !opts.noChainProc && ctx.game.rnd() < chainChance) {
      fireChainLightning(e, Math.round(dmg * 0.55), 3, { tower: opts.tower, noChainProc: true, isThunder: true });
    }

    // Hero active hits trigger: Unique Seal Imbuement + Sword Rain perk
    if (opts.fromHero) {
      deps.simulation.triggerSealOnHeroHit(e);
      const srLv = perkLv(ctx.game, 'sword_rain');
      if (srLv > 0) {
        ctx.game.hero.swordRainHits++;
        const req = srLv >= 2 ? 4 : 6;
        if (ctx.game.hero.swordRainHits >= req) {
          ctx.game.hero.swordRainHits = 0;
          const alive = ctx.game.enemies.filter(o => o.hp > 0);
          const tgt = alive.sort((a,b) => ((b.boss||b.elite?1:0)-(a.boss||a.elite?1:0)) || dist(ctx.game.hero,a)-dist(ctx.game.hero,b))[0] || e;
          const cnt = srLv >= 2 ? 5 : 3;
          const hs = deps.hero.getHeroStats();
          for (let i = 0; i < cnt; i++) {
            const ang = Math.atan2(tgt.y - ctx.game.hero.y, tgt.x - ctx.game.hero.x) + (i - (cnt-1)/2) * 0.14;
            deps.simulation.pushProjectile({
              kind:'arrow', x: ctx.game.hero.x, y: ctx.game.hero.y,
              vx: Math.cos(ang)*18, vy: Math.sin(ang)*18, life: 0.65, r: 0.3,
              pierce: 3, hitSet: new Set(), dmg: Math.round(34 * hs.dmgMult), splash: 0,
              opts: { fromHero:false, skillKey:'perk', critChance:hs.crit, critDmg:hs.critDmg, col:'#ffe688' }
            });
          }
          ctx.ports.vfx.addFloat(ctx.game.hero.x, ctx.game.hero.y - 0.6, '🌠 天剑降临!', '#ffe896');
        }
      }
    }

    if (e.hp <= 0) onEnemyKilled(e, opts);
    else deps.builds?.afterBuildHit(e, actualHpDmg, opts, gm);
    return effectiveDmg;
  }

  function onEnemyKilled(e, opts){
    if (!e || e._killed) return;
    e._killed = true;
    ctx.game.stats.kills++;
    if (e.boss) ctx.game.stats.bossKills = (ctx.game.stats.bossKills || 0) + 1;
    if (opts.tower) opts.tower.kills = (opts.tower.kills || 0) + 1;
    const gm = deps.hero.aggregateGear(ctx.game?.hero?.gear || []);
    const affixGold = (gm.bonusGoldChance > 0 && ctx.game.rnd() < gm.bonusGoldChance) ? 1 : 0;
    const bonusGold = (opts.bonusGold || 0) + affixGold;
    if (e.elite || e.boss) ctx.ports.vfx.impact?.(e.x, e.y, e.boss ? 'boss' : 'stone');
    const baseGold = (e.elite || e.boss || e.gold >= 2) ? e.gold : (ctx.game.rnd() < BALANCE.economy.singleGoldDropChance ? e.gold : 0);
    const tel = ctx.game.curWaveTel;
    let killGold = baseGold + bonusGold;
    if (tel && !e.boss && !e.elite) {
      const goldLimit = Math.round(BALANCE.economy.killGoldBudgetBase + (ctx.game.wave - 1) * BALANCE.economy.killGoldBudgetPerWave);
      const normalGold = Math.min(baseGold, Math.max(0, goldLimit - tel.killGold));
      const greedGold = Math.min(bonusGold, Math.max(0, BALANCE.economy.greedKillGoldPerWave - tel.greedGold));
      tel.killGold += normalGold;
      tel.greedGold += greedGold;
      killGold = normalGold + greedGold;
    }
    if (killGold > 0) deps.economy.changeGold(killGold, e.boss ? 'kill_boss' : e.elite ? 'kill_elite' : 'kill_enemy');

    if (gm.burnKillHeal > 0 && (e.burnT > 0 || e.fireMarkT > 0)) {
      applyHeroLifesteal(gm.burnKillHeal);
    }

    // Stage 3: W20 Boss Shield Totem destroyed -> shatter Boss shield & apply 3s vulnerability!
    if (e.totem) {
      if (ctx.game.stats) ctx.game.stats.w20TotemsDestroyed = (ctx.game.stats.w20TotemsDestroyed || 0) + 1;
      const ownerBoss = ctx.game.enemies.find(o => o.hp > 0 && (o.id === e.totemBossId || o.kind === 'boss4'));
      ctx.ports.vfx.addRing(e.x, e.y, '#7cf2ff', 2.4);
      if (ownerBoss) {
        if (ownerBoss.shield > 0) ctx.ports.vfx.impact?.(ownerBoss.x, ownerBoss.y, 'ward');
        ownerBoss.shield = 0;
        ownerBoss.vulnT = Math.max(ownerBoss.vulnT || 0, 3.0);
        ctx.ports.vfx.addRing(ownerBoss.x, ownerBoss.y, '#ffe678', 2.6);
        ctx.ports.vfx.addFloat(ownerBoss.x, ownerBoss.y - 0.85, '💥 图腾击碎 · 首领破盾易伤!', '#ffe678', true);
      }
      ctx.ports.audio.play('crit', 1.2);
      return;
    }

    // Stage 5: W30 Abyss Pillar destroyed -> shatter boss6 shield, apply 3.5s vuln & drop healing spirit orb!
    if (e.pillar) {
      const ownerBoss = ctx.game.enemies.find(o => o.hp > 0 && (o.id === e.pillarBossId || o.kind === 'boss6'));
      ctx.ports.vfx.addRing(e.x, e.y, '#ff88dc', 2.6);
      if (ownerBoss) {
        if (ownerBoss.shield > 0) ctx.ports.vfx.impact?.(ownerBoss.x, ownerBoss.y, 'ward');
        ownerBoss.shield = 0;
        ownerBoss.vulnT = Math.max(ownerBoss.vulnT || 0, 3.5);
        ctx.ports.vfx.addRing(ownerBoss.x, ownerBoss.y, '#ffe678', 2.8);
        ctx.ports.vfx.addFloat(ownerBoss.x, ownerBoss.y - 0.9, '💥 晶柱击破 · 主宰易伤 3.5s!', '#ffe678', true);
      }
      spawnHealOrb(e.x, e.y);
      ctx.ports.audio.play('crit', 1.2);
      return;
    }

    // Stage 5: W30 Void Guard slain -> guaranteed healing spirit orb drop!
    if (e.voidGuard) {
      spawnHealOrb(e.x, e.y);
    }

    // Material drops for v0.60 equipment & crafting loop (scales up in W21-W29 endgame refinement!)
    if (e.boss || e.elite) {
      const matDrop = deps.economy.getEnemyMaterialDrop(e, ctx.game.wave);
      if (matDrop > 0) deps.economy.changeMaterials(matDrop, e.boss ? 'drop_boss_materials' : 'drop_elite_materials');
    }

    // Stage 5: Depleting W30 Final Boss (boss6) HP bar in Final Phase triggers IMMEDIATE 3D Victory Settlement!
    if (e.kind === 'boss6' && ctx.game.wave === MAIN_WAVES && ctx.game.phase === 'wave') {
      for (const qItem of ctx.game.waveQueue) qItem.spawned = true;
      ctx.game.enemies = [];
      ctx.game.projectiles = [];
      ctx.game.zones = [];
      ctx.game.healOrbs = [];
      deps.run.completeWaveClear();
      return;
    }

    if ((e.elite || e.boss) && deps.hero.gearSetTier('blood') >= 2 && (ctx.game.hero.bloodKills || 0) < 10) {
      ctx.game.hero.bloodKills++;
      ctx.game.hero.baseMaxHp += 12;
      deps.hero.syncHeroMaxHp();
      ctx.ports.vfx.addFloat(ctx.game.hero.x, ctx.game.hero.y - 0.7, `🩸血煞吞噬(${ctx.game.hero.bloodKills}/10)`, '#ff6e88', true);
    }

    // Ult Engine (燃魂超载): kills shorten Overdrive CD
    const ueLv = perkLv(ctx.game, 'ult_engine');
    if (ueLv > 0) {
      ctx.game.hero.ultKillCounter++;
      const need = ueLv >= 2 ? 15 : 25;
      if (ctx.game.hero.ultKillCounter >= need) {
        ctx.game.hero.ultKillCounter = 0;
        ctx.game.hero.ultCd = Math.max(0, ctx.game.hero.ultCd - (ueLv >= 2 ? 4 : 3));
      }
    }

    // Bomber enemy (煞灵毒虫) death bomb -> poison puddle!
    if (e.bomber) {
      ctx.game.zones.push({
        kind:'poisonBomb', x:e.x, y:e.y, r:1.55, t:0.75, max:0.75, dmg: Math.round(e.dmg * 1.35),
        sourceMeta: { attackerName: e.name || '煞毒自爆虫', attackerKind: e.kind, skillName: '亡语剧毒自爆', isBoss: false, isBossCore: false, isBossAux: false }
      });
    }

    // Fire Tier-4 Corpse Explosion + Fire Nova perk (焚天余烬) + Fire Sub-Seal burn explosion
    const fnLv = perkLv(ctx.game, 'fire_nova');
    const fireSub = deps.hero.getSubSeal('fire');
    if ((deps.hero.getSynergyTier('fire') >= 2 || ((fnLv > 0 || fireSub) && e.burnT > 0)) && !opts.fromCorpse) {
      const pct = fnLv >= 2 ? 0.25 : deps.hero.getSynergyTier('fire') >= 2 ? 0.18 : fnLv === 1 ? 0.15 : 0.12;
      const rad = fnLv >= 2 ? 2.4 : 1.75;
      const expDmg = Math.max(22, Math.round(e.maxHp * pct));
      ctx.ports.vfx.addRing(e.x, e.y, '#ff6d38', rad);
      for (const o of ctx.game.enemies) {
        if (o.id !== e.id && o.hp > 0 && dist(o, e) <= rad) {
          dealDamage(o, o.boss ? Math.min(expDmg, Math.round(BALANCE.combat.corpseBossCapSkillMult * deps.hero.getHeroStats().skillDmgMult)) : expDmg, { col:'#ff884d', fromCorpse:true, skillKey:'perk', burn: fnLv >= 2 ? 16 : 0 });
        }
      }
    }

    // Frost Shatter perk (玄冰碎甲): chilled/frozen death bursts piercing ice shards
    const fsLv = perkLv(ctx.game, 'frost_shatter');
    if (fsLv > 0 && (e.slowT > 0 || e.freezeT > 0)) {
      const cnt = fsLv >= 2 ? 7 : 4;
      const hs = deps.hero.getHeroStats();
      for (let i = 0; i < cnt; i++) {
        const ang = (Math.PI * 2 * i) / cnt;
        deps.simulation.pushProjectile({
          kind:'arrow', x: e.x, y: e.y, vx: Math.cos(ang)*13, vy: Math.sin(ang)*13,
          life: 0.35, r: 0.25, pierce: 2, hitSet: new Set([e.id]),
          dmg: Math.round(24 * hs.dmgMult), splash: 0,
          opts: { fromHero:false, skillKey:'perk', col:'#8cf2ff', slow: 0.35, slowDur: 1.8 }
        });
      }
    }

    // Drop XP Gem
    ctx.game.gems.push({
      x: e.x + (ctx.game.rnd()-0.5)*0.25,
      y: e.y + (ctx.game.rnd()-0.5)*0.25,
      xp: e.xp, big: e.elite || e.boss,
      vx: (ctx.game.rnd()-0.5)*1.8, vy: (ctx.game.rnd()-0.5)*1.8, t: 0
    });
    // Dao Fortune perk: Elite/Boss drops an extra big XP orb
    if (perkLv(ctx.game, 'dao_fortune') >= 1 && (e.elite || e.boss)) {
      ctx.game.gems.push({ x: e.x + 0.35, y: e.y - 0.25, xp: 28, big: true, vx: 1.2, vy: -1.0, t: 0 });
    }

    // Blood Shrine Boss Reward (Chapter-capped chest + 25 gold + materials scaled in W21+)
    if (e.isShrineBoss) {
      ctx.game.stats.elites++;
      if (ctx.game.shrine) ctx.game.shrine.cleared = true;
      if (ctx.game.curWaveTel) ctx.game.curWaveTel.shrineCleared = true;
      const shrineMats = deps.economy.getEnemyMaterialDrop(e, ctx.game.wave);
      deps.economy.changeGold(25, 'shrine_clear');
      if (shrineMats > 0) deps.economy.changeMaterials(shrineMats, 'shrine_clear');
      if (deps.meta.hasMetaAux('aux_shrine_compass') && ctx.game.hero) {
        const healAmt = Math.round(ctx.game.hero.maxHp * 0.20);
        ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + healAmt);
        ctx.ports.vfx.addFloat(ctx.game.hero.x, ctx.game.hero.y - 0.65, `🩸 妖碑寻踪 +${healAmt}血`, '#72f2b4', true);
      }
      ctx.game.chests.push({ x: e.x, y: e.y, legend: ctx.game.wave >= 12, shrineTier: true, bob: 0 });
      ctx.ports.vfx.addRing(e.x, e.y, '#ff4d6d', 2.8);
      ctx.ports.ui.showBanner('🩸 血煞妖王已伏诛！', `掉落章节血碑宝箱 + 25 金币 + ${shrineMats} 锻材！`, 'good');
      ctx.ports.audio.play('chest', 1.2);
      ctx.game.shake = Math.max(ctx.game.shake, 8);
      return;
    }

    // Drop Equipment Chest: Boss always drops Legend Chest; 1st Elite per wave guaranteed, 2nd Elite 25% chance
    if (e.boss || e.elite) {
      ctx.game.stats.elites++;
      const guaranteed = BALANCE.economy.eliteChestWaves.includes(ctx.game.wave) && !ctx.game.eliteChestDropped;
      const dropChest = e.boss || guaranteed || (ctx.game.eliteChestDropped && e.elite && ctx.game.rnd() < 0.25);
      if (dropChest) {
        if (e.elite) ctx.game.eliteChestDropped = true;
        ctx.game.chests.push({ x: e.x, y: e.y, legend: !!e.boss, bob: 0 });
        ctx.ports.vfx.addRing(e.x, e.y, '#ffe478', 2.2);
        ctx.ports.vfx.addFloat(e.x, e.y - 0.5, e.boss ? '👑 传说宝箱掉落！' : '📦 构装宝箱掉落！', '#ffe478', true);
        ctx.ports.audio.play('chest');
        ctx.game.shake = Math.max(ctx.game.shake, e.boss ? 10 : 5);
      } else {
        deps.economy.changeGold(BALANCE.economy.eliteFallbackBounty, 'elite_bounty');
        ctx.ports.vfx.addFloat(e.x, e.y - 0.5, '💰 精英赏金 +${BALANCE.economy.eliteFallbackBounty}', '#ffe478', true);
        ctx.ports.audio.play('coin', 1.1);
      }
    }
  }

  function fireChainLightning(startEnemy, dmg, maxTargets, opts = {}){
    const visited = new Set([startEnemy.id]);
    let cur = startEnemy;
    const thSet = deps.hero.gearSetTier('thunder');
    const totalTargets = maxTargets + (thSet >= 3 ? 1 : 0);
    const jumpMult = thSet >= 2 ? BALANCE.combat.chainSetDecay : BALANCE.combat.chainDecay;
    const pts = [{ x: opts.ox ?? startEnemy.x, y: opts.oy ?? startEnemy.y }, { x: startEnemy.x, y: startEnemy.y }];
    dealDamage(cur, dmg, { ...opts, col:'#d8a6ff', noChainProc:true, isThunder:true });

    const thunderMetaRadius = deps.meta.getActiveMetaMain()?.id === 'main_thunder' ? Number(deps.meta.getActiveMetaMain()?.effects?.thunderChainRadiusBonus || 0.6) : 0;
    let curDmg = dmg;
    for (let i = 1; i < totalTargets; i++) {
      let best = null, bestD = 2.8 + thunderMetaRadius;
      for (const e of ctx.game.enemies) {
        if (e.hp <= 0 || visited.has(e.id)) continue;
        const d = dist(cur, e);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      visited.add(best.id);
      pts.push({ x: best.x, y: best.y });
      curDmg = Math.max(1, Math.round(curDmg * jumpMult));
      dealDamage(best, curDmg, { ...opts, col:'#d8a6ff', noChainProc:true, isThunder:true });
      cur = best;
    }
    ctx.game.bolts.push({ pts, t: 0.24, max: 0.24, col: opts.col || '#cf96ff', comboThunderFire: !!opts.comboThunderFire });
    ctx.ports.audio.play('thunder');
  }

  return {
    spawnPosAroundHero,
    pickEliteAffixes,
    spawnEnemy,
    spawnHealOrb,
    triggerW30BossSignature,
    enterW30BossFinalPhase,
    isEnemyUnstoppable,
    applyHeroLifesteal,
    dealDamage,
    onEnemyKilled,
    fireChainLightning,
  };
}
