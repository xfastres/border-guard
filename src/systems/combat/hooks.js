import BALANCE from '../../data/balance.js';
import { W, H } from '../../data/index.js';
import { dist, clamp } from '../../core/math.js';
import { hasW20Direction, hasW20Enhancement, hasDestinyEnhancement } from '../../core/state-queries.js';

export function createCombatHooks(ctx, deps) {
  function recordW20Proc(kind = 'base'){
    if (!ctx.game) return;
    if (kind === 'base') {
      if (ctx.game.stats) ctx.game.stats.w20BaseProcs = (ctx.game.stats.w20BaseProcs || 0) + 1;
      if (ctx.game.hero?.combatStateStats) ctx.game.hero.combatStateStats.w20BaseProcs = (ctx.game.hero.combatStateStats.w20BaseProcs || 0) + 1;
    } else {
      if (ctx.game.stats) ctx.game.stats.w20EnhancementProcs = (ctx.game.stats.w20EnhancementProcs || 0) + 1;
      if (ctx.game.hero?.combatStateStats) ctx.game.hero.combatStateStats.w20EnhancementProcs = (ctx.game.hero.combatStateStats.w20EnhancementProcs || 0) + 1;
    }
  }

  function recordDestinyProc(key = null){
    if (!ctx.game) return;
    if (ctx.game.stats) ctx.game.stats.destinyEnhancementProcs = (ctx.game.stats.destinyEnhancementProcs || 0) + 1;
    if (ctx.game.hero?.combatStateStats) {
      ctx.game.hero.combatStateStats.destinyEnhancementProcs = (ctx.game.hero.combatStateStats.destinyEnhancementProcs || 0) + 1;
    }
  }

  function isIsolatedHighValueTarget(e, radius = 3.2){
    if (!e || !ctx.game || !(e.boss || e.elite)) return false;
    for (const o of ctx.game.enemies) {
      if (o.id !== e.id && o.hp > 0 && dist(o, e) <= radius) return false;
    }
    return true;
  }

  function triggerW20ElementalEcho(){
    if (!ctx.game?.hero || !hasW20Enhancement(ctx.game, 'w20_shared_elemental_echo')) return 0;
    const h = ctx.game.hero;
    const hs = deps.hero.getHeroStats();
    const rad = 3.6;
    recordW20Proc('enhancement');
    ctx.ports.vfx.addRing(h.x, h.y, '#ffe688', rad);
    ctx.ports.vfx.addFloat(h.x, h.y - 0.8, '✨ 灵韵回响波!', '#ffe896', true);
    ctx.ports.audio.play('holy', 1.15);
    let hit = 0;
    for (const o of ctx.game.enemies) {
      if (o.hp > 0 && dist(o, h) <= rad + o.r) {
        hit++;
        applyFireMark(o, 1, 'w20_shared_elemental_echo', 4.5);
        applyFrostSlow(o, 0.50, 3.0, 'w20_shared_elemental_echo');
        deps.damage.dealDamage(o, Math.round(44 * hs.skillDmgMult), {
          fromHero: false, skillKey: 'perk', col: '#ffe688', noFireDetonate: true, noFrostShieldProc: true
        });
      }
    }
    gainFrostShield(18, { duration: 4.5, source: 'w20_shared_elemental_echo', noFullShieldPulse: true });
    return hit;
  }

  function applyFireMark(e, arg2 = 1, arg3 = 'w10', arg4 = 4.5){
    if (!e || e.hp <= 0) return false;
    const isObj = arg2 && typeof arg2 === 'object';
    const stacks = isObj ? (arg2.stacks ?? 1) : Number(arg2 || 1);
    const source = isObj ? (arg2.source ?? 'w10') : (arg3 || 'w10');
    const mainFlameBonus = deps.meta.getActiveMetaMain()?.id === 'main_flame' ? Number(deps.meta.getActiveMetaMain()?.effects?.fireMarkDurationBonus || 0.8) : 0;
    const duration = (isObj ? (arg2.duration ?? 4.5) : Number(arg4 || 4.5)) + mainFlameBonus;
    e.fireMarkT = Math.max(e.fireMarkT || 0, duration);
    e.fireMarkStacks = Math.min(3, (e.fireMarkStacks || 0) + Math.max(1, stacks));
    e.fireMarkSource = source;
    if (ctx.game?.stats) ctx.game.stats.fireMarksApplied = (ctx.game.stats.fireMarksApplied || 0) + 1;
    if (ctx.game?.hero?.combatStateStats) {
      ctx.game.hero.combatStateStats.fireMarksApplied++;
    }
    if (e.kind === 'boss6' && e.signatureLockActive && ctx.game?.w30Battle?.signatureStatusHitsDuringLock) {
      ctx.game.w30Battle.signatureStatusHitsDuringLock.fireMarks++;
    }
    return true;
  }

  function triggerFireDetonation(e, arg2 = 1.2, arg3 = 1.85, arg4 = 'firewave'){
    if (!e || !ctx.game) return 0;
    if ((e.fireDetonateCd || 0) > 0) return 0;
    const isObj = arg3 && typeof arg3 === 'object';
    const hs = deps.hero.getHeroStats();
    const affixDetBonus = 1 + (hs.gm?.fireDetonateBonus || 0);
    const rawBaseDmg = (Number(arg2) > 5)
      ? Number(arg2)
      : Math.round((32 + (ctx.game.hero?.skills?.firewave || 1) * 14) * hs.skillDmgMult * Number(arg2 || 1.2));
    const baseDmg = Math.round(rawBaseDmg * affixDetBonus);
    const radius = (isObj ? (arg3.radius ?? 1.85) : Number(arg3 || 1.85)) + Math.min(0.6, (hs.gm?.splashBonus || 0) * 0.35);
    const consumeMark = isObj ? !!arg3.consumeMark : false;
    const skillKey = isObj ? (arg3.skillKey || 'firewave') : (arg4 || 'firewave');
    const skipTrioChain = isObj ? !!arg3.skipTrioChain : false;

    const hasFireTrio = !skipTrioChain && deps.equipment.getActiveGearAffixSynergies().hasFireTrio;
    const w20FireBase = hasW20Direction(ctx.game, 'fire_chain_surge');
    const w20Supernova = hasW20Enhancement(ctx.game, 'w20_fire_supernova_chain');
    const w20IsoExec = hasW20Enhancement(ctx.game, 'w20_fire_isolated_exec');
    const w20Vortex = hasW20Enhancement(ctx.game, 'w20_fire_mark_vortex');
    const w20EmberBarrage = hasW20Enhancement(ctx.game, 'w20_fire_ember_barrage');
    const w20BossBreaker = hasW20Enhancement(ctx.game, 'w20_shared_boss_breaker');
    const allowChainTransfer = !ctx.counters.inFireChainTransfer && (hasFireTrio || w20FireBase);

    e.fireDetonateCd = 0.22;
    const stacks = Math.max(1, e.fireMarkStacks || 1);
    const stackMult = 1 + Math.max(0, stacks - 1) * 0.25;
    let destinyDetBoost = 1;
    if (hasDestinyEnhancement(ctx.game, 'destiny_ember_echo') && ctx.game.hero?.destinyEmberNextBoost) {
      destinyDetBoost = 1.18;
      ctx.game.hero.destinyEmberNextBoost = false;
      recordDestinyProc('destiny_ember_echo');
    }
    const detDmg = Math.max(10, Math.round(baseDmg * stackMult * destinyDetBoost));
    if (consumeMark) {
      e.fireMarkStacks = Math.max(0, (e.fireMarkStacks || 1) - 1);
      if (e.fireMarkStacks <= 0) e.fireMarkT = 0;
    } else {
      e.fireMarkStacks = 1;
      e.fireMarkT = Math.max(e.fireMarkT || 0, 2.5);
    }
    if (ctx.game.stats) ctx.game.stats.fireDetonations = (ctx.game.stats.fireDetonations || 0) + 1;
    if (ctx.game.hero?.combatStateStats) {
      ctx.game.hero.combatStateStats.fireDetonations++;
      ctx.game.hero.combatStateStats.w10BranchProcs++;
    }
    if (e.kind === 'boss6' && e.signatureLockActive && ctx.game?.w30Battle?.signatureStatusHitsDuringLock) {
      ctx.game.w30Battle.signatureStatusHitsDuringLock.fireDetonations++;
    }

    // Stage 3 W20 Base Direction [fire_chain_surge]: Pull nearby non-boss enemies inward & splash fire mark before blast!
    if (w20FireBase && !ctx.counters.inFireChainTransfer) {
      const be = BALANCE.w20Breakthrough?.baseEffects || {};
      const pullRad = be.firePullRadius || 3.4;
      const pullStr = be.firePullStrength || 0.75;
      let pulledAny = false;
      for (const o of ctx.game.enemies) {
        if (o.id === e.id || o.hp <= 0) continue;
        const d = dist(o, e);
        if (d <= pullRad && d > 0.35) {
          if (!o.boss && !deps.damage.isEnemyUnstoppable(o)) {
            const step = Math.min(pullStr, d - 0.3);
            o.x = clamp(o.x + (e.x - o.x) / d * step, 0.8, W - 0.8);
            o.y = clamp(o.y + (e.y - o.y) / d * step, 0.8, H - 0.8);
            pulledAny = true;
          }
          if ((o.fireMarkT || 0) <= 0) {
            applyFireMark(o, 1, 'w20_fire_pull', 4.5);
          }
        }
      }
      recordW20Proc('base');
      if (pulledAny && ctx.game.stats) {
        ctx.game.stats.w20FirePulls = (ctx.game.stats.w20FirePulls || 0) + 1;
      }
    }

    ctx.ports.vfx.addRing(e.x, e.y, allowChainTransfer ? '#ff4724' : '#ff5e2b', radius);
    ctx.ports.vfx.addFloat(e.x, e.y - 0.55, w20FireBase ? '🔥聚焰连爆!' : (hasFireTrio ? '🔥连环引爆!' : '🔥火标引爆!'), '#ff9852', true);
    ctx.ports.audio.play('fire', 1.15);

    let totalDealt = 0;
    for (const o of ctx.game.enemies) {
      if (o.hp > 0 && dist(o, e) <= radius + o.r) {
        totalDealt += deps.damage.dealDamage(o, detDmg, {
          fromHero: false, skillKey, isFireExp: true,
          noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
          col: '#ff8a47', burn: 16
        });
      }
    }

    // Stage 2 Fire Trio + Stage 3 W20 [fire_chain_surge] chain transfer & isolated Boss/Elite focused detonation
    if (allowChainTransfer) {
      ctx.counters.inFireChainTransfer = true;
      try {
        const sc = BALANCE.equipment?.synergyCombat || {};
        const be = BALANCE.w20Breakthrough?.baseEffects || {};
        const trioChains = hasFireTrio ? Math.max(1, sc.fireTrioMaxChains || 2) : 0;
        const w20BaseChains = w20FireBase ? (be.fireBaseExtraChains || 1) : 0;
        const w20EnhChains = w20Supernova ? 2 : 0;
        const maxChains = Math.max(1, trioChains + w20BaseChains + w20EnhChains);
        const chainRange = (sc.fireTrioChainRange || 3.2) + (w20Supernova ? 0.9 : 0);
        const chainDecay = sc.fireTrioChainDecay || 0.78;
        const focusMults = Array.isArray(sc.fireTrioFocusMults) ? sc.fireTrioFocusMults : [0.55, 0.35];
        let maxFocusRatio = hasFireTrio ? (sc.fireTrioFocusMaxTotalRatio || 0.90) : (be.fireBaseFocusRatio || 0.42);
        if (hasFireTrio && w20FireBase) maxFocusRatio = Math.max(maxFocusRatio, be.fireTrioBonusFocusCap || 1.15);
        if (w20IsoExec) maxFocusRatio = Math.max(maxFocusRatio, 1.45);

        const visited = new Set([e.id]);
        let curSource = e;
        let transferred = 0;

        for (let step = 0; step < maxChains; step++) {
          let nextTgt = null;
          let bestD = chainRange;
          for (const cand of ctx.game.enemies) {
            if (cand.hp <= 0 || visited.has(cand.id) || (cand.fireMarkT || 0) <= 0) continue;
            const d = dist(curSource, cand);
            if (d <= bestD) { bestD = d; nextTgt = cand; }
          }
          if (!nextTgt) break;
          visited.add(nextTgt.id);
          transferred++;
          const hopDmg = Math.max(8, Math.round(detDmg * Math.pow(chainDecay, step + 1)));
          const hopRad = Math.max(1.35, radius * 0.85);
          nextTgt.fireDetonateCd = Math.max(nextTgt.fireDetonateCd || 0, 0.25);
          ctx.game.bolts.push({
            pts: [{ x: curSource.x, y: curSource.y }, { x: nextTgt.x, y: nextTgt.y }],
            t: 0.26, max: 0.26, col: '#ff6d38', comboThunderFire: false
          });
          ctx.ports.vfx.addRing(nextTgt.x, nextTgt.y, '#ff6a32', hopRad);
          ctx.ports.vfx.addFloat(nextTgt.x, nextTgt.y - 0.5, `🔥传递引爆#${transferred}`, '#ffb35c', true);
          if (ctx.game.stats) {
            ctx.game.stats.fireDetonations = (ctx.game.stats.fireDetonations || 0) + 1;
            ctx.game.stats.fireChainTransfers = (ctx.game.stats.fireChainTransfers || 0) + 1;
          }
          for (const o of ctx.game.enemies) {
            if (o.hp > 0 && dist(o, nextTgt) <= hopRad + o.r) {
              totalDealt += deps.damage.dealDamage(o, hopDmg, {
                fromHero: false, skillKey, isFireExp: true,
                noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
                col: '#ff964d', burn: 14
              });
            }
          }
          if (w20Supernova) {
            recordW20Proc('enhancement');
            ctx.game.zones.push({
              kind: 'lava', w10Branch: 'w20_supernova', w20Source: 'w20_fire_supernova_chain',
              x: nextTgt.x, y: nextTgt.y, r: 1.55, t: 2.6, max: 2.6, tick: 0.45,
              dps: Math.max(18, Math.round(hopDmg * 0.35))
            });
          }
          curSource = nextTgt;
        }

        // Isolated Elite/Boss fallback: convert remaining chain chances into capped decaying focused detonation
        const remChains = maxChains - transferred;
        if (remChains > 0 && e.hp > 0) {
          let ratioSum = 0;
          for (let k = 0; k < remChains; k++) {
            ratioSum += focusMults[k] ?? 0.32;
          }
          if (w20IsoExec) ratioSum += 0.55;
          const cappedRatio = Math.min(maxFocusRatio, ratioSum);
          const focusDmg = Math.max(8, Math.round(detDmg * cappedRatio));
          ctx.ports.vfx.addRing(e.x, e.y, '#ffe066', Math.max(1.1, radius * 0.65));
          ctx.ports.vfx.addFloat(e.x, e.y - 0.85, w20IsoExec ? `💥孤星焚核×${remChains}!` : `💥聚焦引爆×${remChains}!`, '#ffe066', true);
          if (ctx.game.stats) {
            ctx.game.stats.fireFocusedDetonations = (ctx.game.stats.fireFocusedDetonations || 0) + 1;
          }
          if (w20IsoExec) {
            recordW20Proc('enhancement');
            e.vulnT = Math.max(e.vulnT || 0, 3.5);
          }
          totalDealt += deps.damage.dealDamage(e, focusDmg, {
            fromHero: false, skillKey, isFireExp: true,
            noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
            col: '#ffd85c', burn: 18
          });
          if (w20IsoExec && e.hp > 0) {
            totalDealt += deps.damage.dealDamage(e, Math.max(10, Math.round(focusDmg * 0.48)), {
              fromHero: false, skillKey, isFireExp: true,
              noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
              col: '#fff08c', burn: 20
            });
          }
        }
      } finally {
        ctx.counters.inFireChainTransfer = false;
      }
    }

    // W20 Fire/Shared Enhancements post-detonation behaviors
    if (!ctx.counters.inFireChainTransfer) {
      if (w20Vortex) {
        recordW20Proc('enhancement');
        ctx.game.zones.push({
          kind: 'fireVortex', w20Source: 'w20_fire_mark_vortex',
          x: e.x, y: e.y, r: 2.8, t: 2.2, max: 2.2, tick: 0.45,
          dps: Math.max(16, Math.round(detDmg * 0.28))
        });
      }
      if (w20EmberBarrage) {
        recordW20Proc('enhancement');
        for (let i = 0; i < 4; i++) {
          const ang = (Math.PI * 2 * i) / 4 + ctx.game.waveClock;
          deps.simulation.pushProjectile({
            kind: 'arrow', w20Source: 'w20_fire_ember_barrage', x: e.x, y: e.y,
            vx: Math.cos(ang) * 12.5, vy: Math.sin(ang) * 12.5,
            life: 0.45, r: 0.34, pierce: 2, hitSet: new Set([e.id]),
            dmg: Math.max(12, Math.round(detDmg * 0.42)), splash: 0,
            opts: { fromHero: false, skillKey, isFireExp: true, noFireDetonate: true, col: '#ff9f4d', burn: 14, applyFireMarkOnHit: true }
          });
        }
      }
      if (w20BossBreaker && e.hp > 0 && isIsolatedHighValueTarget(e, 3.2)) {
        recordW20Proc('enhancement');
        e.vulnT = Math.max(e.vulnT || 0, 3.5);
        ctx.ports.vfx.addFloat(e.x, e.y - 1.0, '⚔️孤影破壁!', '#ffe680', true);
        totalDealt += deps.damage.dealDamage(e, Math.max(16, Math.round(detDmg * 0.45)), {
          fromHero: false, skillKey: 'perk', noFireDetonate: true, col: '#ffe680'
        });
      }
      if (hasW20Enhancement(ctx.game, 'w20_brk_tempest_step') && ctx.game.hero) {
        recordW20Proc('enhancement');
        ctx.game.hero.dashCd = Math.max(0, (ctx.game.hero.dashCd || 0) - 0.35);
      }
      if (hasW20Enhancement(ctx.game, 'w20_shared_elemental_echo') && ctx.game.hero) {
        ctx.game.hero.w20EchoFireCnt = (ctx.game.hero.w20EchoFireCnt || 0) + 1;
        if (ctx.game.hero.w20EchoFireCnt >= 3) {
          ctx.game.hero.w20EchoFireCnt = 0;
          triggerW20ElementalEcho();
        }
      }
      if (hasDestinyEnhancement(ctx.game, 'destiny_ember_echo') && ctx.game.hero && (ctx.game.hero.destinyEmberCd || 0) <= 0) {
        ctx.game.hero.destinyEmberCd = 0.6;
        ctx.game.hero.destinyEmberNextBoost = true;
        recordDestinyProc('destiny_ember_echo');
        for (const o of ctx.game.enemies) {
          if (o.hp > 0 && dist(o, e) <= 2.8 + o.r) {
            applyFireMark(o, 1, 'destiny_ember_echo', 4.5);
          }
        }
      }
    }
    return totalDealt;
  }

  function applyFrostSlow(e, arg2 = 0.50, arg3 = 3.0, arg4 = 'w10'){
    if (!e || e.hp <= 0) return false;
    if (deps.damage.isEnemyUnstoppable(e)) return false;
    const isObj = arg2 && typeof arg2 === 'object';
    const slow = isObj ? (arg2.slow ?? 0.50) : Number(arg2 || 0.50);
    const mainFrostBonus = deps.meta.getActiveMetaMain()?.id === 'main_frost' ? Number(deps.meta.getActiveMetaMain()?.effects?.frostSlowDurationBonus || 0.6) : 0;
    const duration = (isObj ? (arg2.duration ?? 3.0) : Number(arg3 || 3.0)) + mainFrostBonus;
    const source = isObj ? (arg2.source ?? 'w10') : (arg4 || 'w10');
    e.slow = Math.max(e.slow || 0, slow);
    e.slowT = Math.max(e.slowT || 0, duration);
    e.frostBrandSource = source;
    if (ctx.game?.stats) ctx.game.stats.frostSlowsApplied = (ctx.game.stats.frostSlowsApplied || 0) + 1;
    if (ctx.game?.hero?.combatStateStats) {
      ctx.game.hero.combatStateStats.frostSlowsApplied++;
    }
    if (e.kind === 'boss6' && e.signatureLockActive && ctx.game?.w30Battle?.signatureStatusHitsDuringLock) {
      ctx.game.w30Battle.signatureStatusHitsDuringLock.frostSlows++;
    }
    return true;
  }

  function getHeroMaxFrostShield(baseCap = 90){
    const gm = deps.hero.aggregateGear(ctx.game?.hero?.gear || []);
    const syn = deps.equipment.getActiveGearAffixSynergies();
    const sc = BALANCE.equipment?.synergyCombat || {};
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    const synBase = syn.hasFrostTrio ? (sc.frostTrioShieldCap || 115) : syn.hasFrostDuo ? (sc.frostDuoShieldCap || 95) : baseCap;
    const w20Bonus = hasW20Direction(ctx.game, 'frost_bastion_counter') ? (be.frostBaseShieldCapBonus || 35) : 0;
    const destinyBonus = hasDestinyEnhancement(ctx.game, 'destiny_glacial_aegis') ? 40 : 0;
    return Math.max(baseCap, synBase) + (gm.frostShieldCapBonus || 0) + w20Bonus + destinyBonus;
  }

  function triggerFrostPulse(radius = 2.8, rawDmg = 36, freezeDur = 0.9, source = 'w10', extraOpts = {}){
    if (!ctx.game?.hero) return 0;
    const h = ctx.game.hero;
    const syn = deps.equipment.getActiveGearAffixSynergies();
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    const w20FrostBase = hasW20Direction(ctx.game, 'frost_bastion_counter');
    const w20DashRing = hasW20Enhancement(ctx.game, 'w20_frost_dash_ring');
    const w20AegisThorns = hasW20Enhancement(ctx.game, 'w20_frost_aegis_thorns');
    const w20ShatterEcho = hasW20Enhancement(ctx.game, 'w20_frost_shatter_echo');
    const w20Overflow = hasW20Enhancement(ctx.game, 'w20_frost_overflow_nova');

    const isActiveTrigger = source === 'dash_shield' || source === 'full_shield_refresh';
    if (isActiveTrigger) {
      if ((h.frostActivePulseCd || 0) > 0) return 0;
      let cd = BALANCE.equipment?.synergyCombat?.frostTrioActivePulseCd || 1.5;
      if (w20FrostBase && syn.hasFrostTrio) cd = Math.max(0.75, cd - (be.frostBaseTrioActiveCdReduction || 0.35));
      if (w20DashRing && source === 'dash_shield') cd = Math.min(cd, 0.75);
      h.frostActivePulseCd = cd;
    } else {
      if ((h.frostPulseCd || 0) > 0) return 0;
      h.frostPulseCd = 0.55;
    }

    let effRadius = radius;
    let effDmg = rawDmg + (extraOpts.overflowBonusDmg || 0);
    let effFreeze = freezeDur;
    if (w20FrostBase) {
      recordW20Proc('base');
      if (ctx.game.stats) ctx.game.stats.w20FrostCounterProcs = (ctx.game.stats.w20FrostCounterProcs || 0) + 1;
      if (syn.hasFrostTrio) effRadius *= 1.22;
    }
    if (w20AegisThorns && source === 'shield_hit') {
      recordW20Proc('enhancement');
      effRadius *= 1.35;
      effFreeze += 0.5;
    }

    if (h.combatStateStats) {
      h.combatStateStats.frostPulsesTriggered++;
      h.combatStateStats.w10BranchProcs++;
    }
    if (ctx.game?.w30Battle?.signatureLockActive && ctx.game.w30Battle.signatureStatusHitsDuringLock) {
      ctx.game.w30Battle.signatureStatusHitsDuringLock.frostPulses++;
    }
    if (ctx.game.stats) {
      if (source === 'shield_hit') ctx.game.stats.frostHitPulses = (ctx.game.stats.frostHitPulses || 0) + 1;
      else if (source === 'dash_shield') ctx.game.stats.frostDashPulses = (ctx.game.stats.frostDashPulses || 0) + 1;
      else if (source === 'full_shield_refresh') ctx.game.stats.frostFullShieldPulses = (ctx.game.stats.frostFullShieldPulses || 0) + 1;
    }
    const floatText = source === 'dash_shield' ? (w20DashRing ? '❄️踏霜主动环!' : '❄️冲刺冰环!')
      : source === 'full_shield_refresh' ? (w20Overflow ? '💠满盾超载震!' : '❄️满盾冰环!')
      : (w20AegisThorns ? '🛡️寒甲反噬!' : '❄️冰环反制!');
    ctx.ports.vfx.addRing(h.x, h.y, isActiveTrigger ? '#aef8ff' : '#8ef4ff', effRadius);
    ctx.ports.vfx.addFloat(h.x, h.y - 0.65, floatText, '#a4f8ff', true);
    ctx.ports.audio.play('frost', isActiveTrigger ? 1.25 : 1.15);
    const hs = deps.hero.getHeroStats();
    let hitCnt = 0;
    for (const o of ctx.game.enemies) {
      if (o.hp > 0 && dist(o, h) <= effRadius + o.r) {
        hitCnt++;
        const wasSlowed = (o.slowT || 0) > 0 || (o.freezeT || 0) > 0;
        applyFrostSlow(o, w20ShatterEcho ? 0.65 : 0.55, 3.0, 'frost_pulse');
        if (!o.boss && !deps.damage.isEnemyUnstoppable(o)) o.freezeT = Math.max(o.freezeT || 0, effFreeze);
        deps.damage.dealDamage(o, Math.round(effDmg * hs.skillDmgMult), {
          fromHero: false, skillKey: 'nova', col: '#9cf6ff', noFrostShieldProc: true
        });
        if (w20ShatterEcho && wasSlowed && o.hp > 0) {
          recordW20Proc('enhancement');
          ctx.ports.vfx.addRing(o.x, o.y, '#c4f8ff', 1.6);
          for (const nb of ctx.game.enemies) {
            if (nb.hp > 0 && dist(nb, o) <= 1.6 + nb.r) {
              applyFrostSlow(nb, 0.65, 3.2, 'w20_frost_shatter_echo');
              deps.damage.dealDamage(nb, Math.max(12, Math.round(effDmg * 0.55 * hs.skillDmgMult)), {
                fromHero: false, skillKey: 'nova', col: '#c4f8ff', noFrostShieldProc: true
              });
            }
          }
        }
        if (hasW20Enhancement(ctx.game, 'w20_shared_boss_breaker') && o.hp > 0 && isIsolatedHighValueTarget(o, 3.2)) {
          recordW20Proc('enhancement');
          o.vulnT = Math.max(o.vulnT || 0, 3.5);
          deps.damage.dealDamage(o, Math.max(16, Math.round(effDmg * 0.55 * hs.skillDmgMult)), {
            fromHero: false, skillKey: 'perk', col: '#ffe680', noFrostShieldProc: true
          });
        }
      }
    }
    if (w20FrostBase && syn.hasFrostTrio && hitCnt > 0) {
      gainFrostShield(be.frostBaseTrioPulseShieldRefund || 10, { duration: 4.5, noFullShieldPulse: true, source: 'w20_frost_refund' });
    }
    if (w20AegisThorns && source === 'shield_hit') {
      gainFrostShield(14, { duration: 4.5, noFullShieldPulse: true, source: 'w20_frost_aegis_thorns' });
      const tgt = ctx.game.enemies.find(o => o.hp > 0);
      const baseAng = tgt ? Math.atan2(tgt.y - h.y, tgt.x - h.x) : 0;
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.24;
        deps.simulation.pushProjectile({
          kind: 'arrow', w20Source: 'w20_frost_aegis_thorns', x: h.x, y: h.y,
          vx: Math.cos(a) * 14.5, vy: Math.sin(a) * 14.5,
          life: 0.45, r: 0.34, pierce: 3, hitSet: new Set(),
          dmg: Math.round(effDmg * 0.85 * hs.skillDmgMult), splash: 0,
          opts: { fromHero: false, skillKey: 'nova', col: '#aef8ff', slow: 0.55, slowDur: 2.8, noFrostShieldProc: true }
        });
      }
    }
    if (w20Overflow && source === 'full_shield_refresh') {
      recordW20Proc('enhancement');
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        deps.simulation.pushProjectile({
          kind: 'arrow', w20Source: 'w20_frost_overflow_nova', x: h.x, y: h.y,
          vx: Math.cos(a) * 13.8, vy: Math.sin(a) * 13.8,
          life: 0.42, r: 0.34, pierce: 3, hitSet: new Set(),
          dmg: Math.round(effDmg * 0.72 * hs.skillDmgMult), splash: 0,
          opts: { fromHero: false, skillKey: 'nova', col: '#b8fbff', slow: 0.55, slowDur: 2.8, noFrostShieldProc: true }
        });
      }
    }
    if (hasW20Enhancement(ctx.game, 'w20_brk_tempest_step')) {
      recordW20Proc('enhancement');
      h.dashCd = Math.max(0, (h.dashCd || 0) - 0.35);
    }
    if (hasW20Enhancement(ctx.game, 'w20_shared_elemental_echo')) {
      h.w20EchoFrostCnt = (h.w20EchoFrostCnt || 0) + 1;
      if (h.w20EchoFrostCnt >= 2) {
        h.w20EchoFrostCnt = 0;
        triggerW20ElementalEcho();
      }
    }
    if (hasDestinyEnhancement(ctx.game, 'destiny_glacial_aegis')) {
      recordDestinyProc('destiny_glacial_aegis');
      h.destinyFrostMoveT = Math.max(h.destinyFrostMoveT || 0, 2.5);
      gainFrostShield(14, { duration: 5.0, noFullShieldPulse: true, source: 'destiny_glacial_aegis' });
    }
    return hitCnt;
  }

  function gainFrostShield(amount, arg2 = 5.0, arg3 = 90){
    if (!ctx.game?.hero || amount <= 0) return 0;
    const h = ctx.game.hero;
    const isObj = arg2 && typeof arg2 === 'object';
    const mainFrostShieldBonus = deps.meta.getActiveMetaMain()?.id === 'main_frost' ? Number(deps.meta.getActiveMetaMain()?.effects?.frostShieldDurationBonus || 0.8) : 0;
    const duration = (isObj ? (arg2.duration ?? 5.0) : Number(arg2 || 5.0)) + mainFrostShieldBonus;
    const reqMax = isObj ? (arg2.maxShield ?? 90) : Number(arg3 || 90);
    const noFullShieldPulse = isObj ? !!arg2.noFullShieldPulse : false;
    const maxShield = Math.max(getHeroMaxFrostShield(90), reqMax);
    const gain = Math.round(amount);
    const prevShield = h.shield || 0;
    const overflow = Math.max(0, prevShield + gain - maxShield);
    const wasFullOrOverflow = prevShield >= maxShield * 0.92 || (prevShield + gain >= maxShield);
    h.shield = Math.min(maxShield, prevShield + gain);
    const actualGain = Math.max(0, Math.round(h.shield - prevShield));
    h.shieldTimer = Math.max(h.shieldTimer || 0, duration);
    h.frostShieldActive = true;
    if (actualGain > 0) {
      if (ctx.game.stats) {
        ctx.game.stats.frostShieldGained = (ctx.game.stats.frostShieldGained || 0) + actualGain;
        ctx.game.stats.shieldGained = (ctx.game.stats.shieldGained || 0) + actualGain;
      }
      if (h.combatStateStats) {
        h.combatStateStats.frostShieldGained += actualGain;
      }
      if (ctx.game?.w30Battle?.signatureLockActive && ctx.game.w30Battle.signatureStatusHitsDuringLock) {
        ctx.game.w30Battle.signatureStatusHitsDuringLock.frostShieldGained += actualGain;
      }
    }
    if (h.combatStateStats) {
      h.combatStateStats.w10BranchProcs++;
    }
    // Stage 3 W20 Enhancement [w20_frost_pillar_ward]: every 40 cumulative frost shield drops a 3.2s frost ward zone
    if (hasW20Enhancement(ctx.game, 'w20_frost_pillar_ward') && arg2?.source !== 'w20_frost_pillar_ward') {
      h.w20ShieldPillarAccum = (h.w20ShieldPillarAccum || 0) + gain;
      if (h.w20ShieldPillarAccum >= 40) {
        h.w20ShieldPillarAccum -= 40;
        recordW20Proc('enhancement');
        ctx.game.zones.push({
          kind: 'frostTrail', w20Source: 'w20_frost_pillar_ward', x: h.x, y: h.y, r: 2.35,
          t: 3.2, max: 3.2, tick: 0.6, dps: 22
        });
      }
    }
    // Stage 2 Frost Trio OR Stage 3 W20 [w20_frost_overflow_nova]: full-shield refresh triggers active Frost Pulse!
    const allowFullPulse = !noFullShieldPulse && (deps.equipment.getActiveGearAffixSynergies().hasFrostTrio || hasW20Enhancement(ctx.game, 'w20_frost_overflow_nova'));
    if (allowFullPulse && wasFullOrOverflow && (h.frostActivePulseCd || 0) <= 0) {
      const sc = BALANCE.equipment?.synergyCombat || {};
      const overflowBonusDmg = hasW20Enhancement(ctx.game, 'w20_frost_overflow_nova') ? Math.round(overflow * 1.4) : 0;
      triggerFrostPulse(sc.frostTrioActivePulseRadius || 3.25, sc.frostTrioActivePulseDmg || 46, 0.95, 'full_shield_refresh', { overflowBonusDmg });
    }
    return actualGain;
  }

  return {
    recordW20Proc,
    recordDestinyProc,
    isIsolatedHighValueTarget,
    triggerW20ElementalEcho,
    applyFireMark,
    triggerFireDetonation,
    applyFrostSlow,
    getHeroMaxFrostShield,
    triggerFrostPulse,
    gainFrostShield,
  };
}
