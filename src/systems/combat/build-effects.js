import BALANCE from '../../data/balance.js';
import { dist } from '../../core/math.js';
import { getW20ActiveState } from '../../core/state-queries.js';

const spec = BALANCE.combat.routes;

export function createBuildEffects(ctx, deps) {
  function grantBuildShield(amount) {
    const { hero, stats } = ctx.game;
    const before = hero.shield || 0;
    const cap = Math.round(hero.maxHp * 0.28);
    hero.shield = Math.max(before, Math.min(cap, before + Math.round(amount)));
    const gained = hero.shield - before;
    if (gained > 0) {
      hero.shieldTimer = Math.max(hero.shieldTimer || 0, 4.5);
      stats.shieldGained = (stats.shieldGained || 0) + gained;
    }
    return gained;
  }

  function onBuildDash() {
    const game = ctx.game;
    if (game.phase !== 'wave') return;
    const { hero, waveClock } = game;
    hero.routeCombat.dashAt = waveClock;
    hero.routeCombat.windReadyUntil = waveClock + spec.wind.duration;
    hero.routeCombat.windReady = true;
  }

  function beginBloodWindow() {
    const game = ctx.game;
    if (game.phase !== 'wave') return;
    const { hero, waveClock } = game;
    const w20 = getW20ActiveState(game);
    const active = w20.baseEffectActive && w20.directionKey === 'blood_requital';
    const gm = deps.hero.aggregateGear(hero.gear);
    const synergy = getRouteTier('blood_rite');
    if (!active && !synergy && gm.bloodRite <= 0) return;
    const cost = Math.min(
      Math.floor(hero.hp - hero.maxHp * spec.blood.minimumLife),
      Math.round(hero.maxHp * spec.blood.cost * (active ? 1 : 0.55))
    );
    if (cost <= 0) return;
    hero.hp -= cost;
    hero.routeCombat.bloodDebt = cost;
    hero.routeCombat.bloodUntil = waveClock + spec.blood.duration + (active && w20.enhancementKey === 'w20_blood_feast' ? 2 : 0);
    if (active && w20.enhancementKey === 'w20_blood_reserve') grantBuildShield(32);
    ctx.ports.vfx.addRing(hero.x, hero.y, '#ff7999', 2.25);
    ctx.ports.ui.toast(`血契 -${cost} 生命 · 近身命中可回收`);
  }

  function getRouteTier(chain) {
    return (deps.equipment.getActiveGearAffixSynergies().active || []).find(entry => entry.chain === chain)?.tier || 0;
  }

  function nearby(target, range, limit) {
    const picks = [];
    for (const e of ctx.game.enemies) {
      if (e !== target && e.hp > 0 && dist(e, target) <= range + e.r) picks.push(e);
      if (picks.length >= limit) break;
    }
    return picks;
  }

  function hitsAlongAim(target, range, width, limit) {
    const h = ctx.game.hero;
    const dx = target.x - h.x, dy = target.y - h.y;
    const length = Math.hypot(dx, dy) || 1;
    const targets = [];
    for (const o of ctx.game.enemies) {
      if (o === target || o.hp <= 0) continue;
      const x = o.x - target.x, y = o.y - target.y;
      const along = (x * dx + y * dy) / length;
      if (along > 0 && along <= range && Math.abs(x * dy - y * dx) / length <= width + o.r) targets.push(o);
      if (targets.length >= limit) break;
    }
    return targets;
  }

  function strike(e, power, color, skillKey = 'route') {
    return deps.damage.dealDamage(e, Math.round(power), {
      skillKey, col: color, buildEcho: true, noChainProc: true,
      noFireDetonate: true, noFrostShieldProc: true,
    });
  }

  function report(target, color, power, others, echoMult, active, card) {
    ctx.ports.vfx.addRing(target.x, target.y, color, 1.6);
    let dealt = strike(target, power, color);
    for (const e of others) dealt += strike(e, power * echoMult, color);
    if (active) {
      deps.hooks.recordW20Proc('base');
      if (card) deps.hooks.recordW20Proc('enhancement');
      const { hero, waveClock } = ctx.game;
      if (card === 'w20_route_ward' && waveClock >= (hero.routeCombat.wardAt ?? 0)) {
        hero.routeCombat.wardAt = waveClock + spec.shared.guardCd;
        grantBuildShield(spec.shared.guard);
      }
      if (card === 'w20_route_interrupt' && (target.boss || target.elite)) {
        target.vulnT = Math.max(target.vulnT || 0, spec.shared.vulnerability);
      }
    }
    return dealt;
  }

  function afterBuildHit(target, actualHpDmg, opts, gm) {
    if (opts.buildEcho || actualHpDmg <= 0 || target.hp <= 0 || ctx.game.phase !== 'wave') return;
    const { hero, waveClock } = ctx.game;
    const state = hero.routeCombat;
    const w20 = getW20ActiveState(ctx.game);
    const direction = w20.baseEffectActive ? w20.directionKey : null;
    const card = w20.enhancementKey;
    const powerOf = (key, gearPower, active, tier) =>
      spec[key].base * deps.hero.getHeroStats().skillDmgMult * (active ? 1 : 0.44) * (1 + Math.min(0.65, gearPower) + Math.max(0, tier - 1) * 0.16);

    const windHit = opts.isWind || opts.skillKey === 'blades' || opts.skillKey === 'swordlance' || opts.tower?.elem === 'wind';
    if (windHit && state.windReady && waveClock <= state.windReadyUntil) {
      const active = direction === 'wind_stride';
      const tier = getRouteTier('wind_flow');
      if (active || tier || gm.windFlow > 0) {
        state.windReady = false;
        const config = spec.wind;
        const wider = active && card === 'w20_wind_crosscut';
        const others = hitsAlongAim(target, config.reach, config.width + (wider ? 0.45 : 0), config.maxTargets + (wider ? 2 : 0));
        const solo = !others.length && (target.elite || target.boss);
        const power = powerOf('wind', gm.windFlow, active, tier) * (solo ? config.soloMult : 1);
        report(target, '#9ff5d1', power, others, config.echo, active, card);
        if (active && card === 'w20_wind_duel' && solo) strike(target, power * 0.68, '#caffeb');
        if (active && card === 'w20_wind_pin') {
          for (const e of others) deps.hooks.applyFrostSlow(e, 0.35, 2.0, 'wind_pin');
        }
        if ((active && card === 'w20_wind_guard') || tier === 3) grantBuildShield(22);
      }
    }

    if ((opts.isThunder || opts.tower?.elem === 'thunder') && target.hp > 0 && waveClock >= (target.stormOverloadAt || 0)) {
      const active = direction === 'storm_circuit';
      const tier = getRouteTier('storm_circuit');
      if (active || tier || gm.stormLoad > 0) {
        const config = spec.thunder;
        const threshold = config.threshold + (active ? 0 : 2) - (tier === 3 ? 1 : 0);
        target.stormCharge = (target.stormCharge || 0) + 1;
        if (target.stormCharge >= threshold) {
          target.stormCharge = active && card === 'w20_storm_refill' ? 2 : 0;
          target.stormOverloadAt = waveClock + config.cooldown;
          const others = nearby(target, config.reach, config.maxTargets + (active && card === 'w20_storm_fork' ? 2 : 0));
          const solo = !others.length;
          const power = powerOf('thunder', gm.stormLoad, active, tier) * (solo ? config.soloMult : 1);
          report(target, '#d8b2ff', power, others, config.echo, active, card);
          if (active && card === 'w20_storm_focus' && solo) strike(target, power * 0.62, '#e6d0ff');
          if (active && card === 'w20_storm_ground') target.vulnT = Math.max(target.vulnT || 0, 2.8);
        }
      }
    }

    if (opts.fromHero && target.hp > 0 && waveClock <= (state.bloodUntil ?? -1)
      && waveClock >= (state.bloodNext ?? 0) && dist(hero, target) <= spec.blood.reach + target.r) {
      const active = direction === 'blood_requital';
      const tier = getRouteTier('blood_rite');
      const config = spec.blood;
      state.bloodNext = waveClock + config.cooldown;
      const others = nearby(target, config.reach, config.maxTargets + (active && card === 'w20_blood_spread' ? 2 : 0));
      const power = powerOf('blood', gm.bloodRite, active, tier) * (target.boss || target.elite ? 1.4 : 1);
      const dealt = report(target, '#ff91a9', power, others, config.echo, active, card);
      if (dealt > 0 && state.bloodDebt > 0) {
        const refund = active && card === 'w20_blood_hunter' && (target.boss || target.elite) ? 1 : config.refund;
        const cap = Math.max(1, Math.round(hero.maxHp * 0.022 * refund * (tier === 3 ? 1.3 : 1)));
        state.bloodDebt -= deps.damage.applyHeroLifesteal(Math.min(cap, state.bloodDebt));
      }
    }

    if ((opts.isHoly || opts.tower?.elem === 'holy') && target.hp > 0 && waveClock >= (state.verdictNext ?? 0)) {
      const active = direction === 'sanctum_verdict';
      const tier = getRouteTier('holy_oath');
      if (!active && !tier && gm.holyOath <= 0) return;
      const config = spec.holy;
      const discount = active && card === 'w20_sanctum_patience' && (state.dashAt ?? -10) >= waveClock - 3 && state.discountDash !== state.dashAt;
      const cost = discount ? config.shieldCost / 2 : config.shieldCost;
      if (hero.shield < cost) return;
      hero.shield -= cost;
      if (hero.shield <= 0) hero.frostShieldActive = false;
      if (discount) state.discountDash = state.dashAt;
      state.verdictNext = waveClock + config.cooldown;
      const wider = active && card === 'w20_sanctum_reach';
      const others = nearby(target, config.reach + (wider ? 1.2 : 0), config.maxTargets + (wider ? 2 : 0));
      const power = powerOf('holy', gm.holyOath, active, tier) * ((target.boss || target.elite) ? 1.5 : 1);
      const dealt = report(target, '#ffe88e', power, others, config.echo, active, card);
      if (active && card === 'w20_sanctum_purify') hero.armorBreakT = 0;
      if (active && card === 'w20_sanctum_heal' && dealt > 0 && (target.boss || target.elite)) deps.damage.applyHeroLifesteal(14);
      if (tier === 3 && others.length > 0) grantBuildShield(10);
    }
  }

  return { grantBuildShield, onBuildDash, beginBloodWindow, afterBuildHit };
}
