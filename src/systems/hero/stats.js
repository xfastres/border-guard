import BALANCE from '../../data/balance.js';
import {
  ARTIFACTS,
  COMBO_LIST,
  DUAL_RESONANCES,
  GEAR_AFFIXES,
  GEAR_SETS,
  GEAR_STAR_MULT,
  GEARS,
  SUB_SEAL_RESONANCE,
} from '../../data/index.js';
import { clamp } from '../../core/math.js';
import { perkLv, hasDestinyEnhancement } from '../../core/state-queries.js';
import { gearBase, gearStar, getGearBaseMult } from '../equipment/index.js';

export function createHeroStats(ctx, { unlock, meta }) {
  const { getActiveUnlockNode } = unlock;
  const { getActiveMetaMain } = meta;

  function getSynergyCounts(){
    const c = { wind:0, fire:0, frost:0, thunder:0, holy:0 };
    if (ctx.game?.seal) {
      c[ctx.game.seal.elem] += ctx.game.seal.star >= 5 ? 4 : ctx.game.seal.star >= 3 ? 2 : 1;
    }
    if (ctx.game?.subSeals?.length) {
      for (const s of ctx.game.subSeals) {
        c[s.elem] += s.star >= 3 ? 2 : 1;
      }
    }
    if (ctx.game?.hero?.gear?.length) {
      for (const gk of ctx.game.hero.gear) {
        const sp = GEARS[gearBase(gk)];
        if (sp?.elem && c[sp.elem] !== undefined) c[sp.elem] += 1;
      }
    }
    return c;
  }

  function getSynergyTier(elem){
    const n = getSynergyCounts()[elem] || 0;
    return n >= 4 ? 2 : n >= 2 ? 1 : 0;
  }

  function getSubSeal(elem){
    return ctx.game?.subSeals?.find(s => s.elem === elem) || null;
  }

  function getGearSetCounts(gearList = ctx.game?.hero?.gear || []){
    const counts = {};
    for (const gk of gearList) {
      const sp = GEARS[gearBase(gk)];
      if (sp?.set) counts[sp.set] = (counts[sp.set] || 0) + 1;
    }
    return counts;
  }

  function gearSetTier(setKey){
    const n = getGearSetCounts()[setKey] || 0;
    return n >= 3 ? 3 : n >= 2 ? 2 : 0;
  }

  function getActiveGearSets(){
    const counts = getGearSetCounts();
    const out = [];
    for (const [k, n] of Object.entries(counts)) {
      if (n >= 2 && GEAR_SETS[k]) {
        const tier = n >= 3 ? 3 : 2;
        out.push({ ...GEAR_SETS[k], count: n, tier, desc: tier >= 3 ? GEAR_SETS[k].d3 : GEAR_SETS[k].d2 });
      }
    }
    return out;
  }

  function getActiveDualResonances(){
    const c = getSynergyCounts();
    return DUAL_RESONANCES.filter(r => {
      if (r.req[1] === '_any') {
        return c[r.req[0]] >= 2 && ['wind','fire','frost','thunder'].some(e => c[e] >= 2);
      }
      return c[r.req[0]] >= 2 && c[r.req[1]] >= 2;
    });
  }

  function hasDualRes(key){
    return getActiveDualResonances().some(r => r.key === key);
  }

  function refreshCombos(announce = true){
    const h = ctx.game.hero;
    const node = getActiveUnlockNode();
    for (const c of COMBO_LIST) {
      if (h.combos[c.key]) continue;
      const sumLv = c.req.reduce((s, sk) => s + (h.skills[sk] || 0), 0);
      if (node.comboTier >= c.realm && c.req.every(sk => (h.skills[sk] || 0) >= 1) && sumLv >= 3) {
        h.combos[c.key] = true;
        if (announce) {
          ctx.ports.audio.play('level', 1.15);
          ctx.game.shake = Math.max(ctx.game.shake, 7);
          ctx.ports.vfx.addRing(h.x, h.y, '#ffe878', 3.4);
          ctx.ports.ui.showBanner(`✨ 组合技觉醒 · 【${c.name}】！`, c.desc, 'good');
        }
      }
    }
  }

  function aggregateGear(gearList){
    const m = {
      dmgPct:0, aspd:0, crit:0, critDmg:0, rangePct:0, movePct:0, flatHp:0, hpPct:0,
      extraShot:0, splashBonus:0, slowOnHit:0, chainProc:0, lifesteal:0, bonusGold:0,
      // Stage 2 Affix independent modifiers
      fireMarkChance:0, fireDmgPct:0, fireDetonateBonus:0, markedDmgPct:0, burnKillHeal:0,
      chilledDmgPct:0, frostShieldCapBonus:0, shieldedDmgPct:0, shieldedMovePct:0,
      dmgReduce:0, bonusGoldChance:0, windFlow:0, stormLoad:0, bloodRite:0, holyOath:0
    };
    const dfBoost = perkLv(ctx.game, 'dao_fortune') >= 2 ? 1.25 : 1;
    const greedSetBoost = (getGearSetCounts(gearList).greed || 0) >= 3 ? 1.15 : 1;
    const affixStep = BALANCE.equipment?.materialEnhance?.affixTierStepPerLv || 0.16;

    for (const k of (gearList || [])) {
      const isInst = k && typeof k === 'object';
      const gm = GEARS[gearBase(k)]?.mod;
      if (gm) {
        const mult = (isInst ? getGearBaseMult(k) : GEAR_STAR_MULT[gearStar(k) - 1]) * dfBoost * greedSetBoost;
        for (const [key, val] of Object.entries(gm)) {
          const scaled = key === 'extraShot' ? val : (val < 0 ? val : val * mult);
          if (key === 'slowOnHit') m.slowOnHit = Math.max(m.slowOnHit, Math.min(0.65, scaled));
          else if (key === 'chainProc') m[key] = Math.min(0.8, m[key] + scaled);
          else if (key === 'fireMarkChance') m[key] = Math.max(m[key], Math.min(0.98, scaled));
          else if (key in m) m[key] += scaled;
        }
      }
      // Aggregate every independent affix on this instance (preserved regardless of duo/trio synergy!)
      if (isInst && Array.isArray(k.affixes)) {
        const enhBonusMult = 1 + (k.enhanceLv || 0) * affixStep * 0.5;
        for (const a of k.affixes) {
          if (!a || !GEAR_AFFIXES[a.id]) continue;
          const aSpec = GEAR_AFFIXES[a.id];
          const tier = Math.max(1, Number(a.tier || (1 + (k.enhanceLv || 0))));
          const aMod = aSpec.mod ? aSpec.mod(tier) : {};
          for (const [ak, av] of Object.entries(aMod)) {
            if (ak === 'slowOnHit') m.slowOnHit = Math.max(m.slowOnHit, Math.min(0.65, av));
            else if (ak === 'fireMarkChance') m.fireMarkChance = Math.min(0.98, Math.max(m.fireMarkChance, av));
            else if (ak === 'chainProc') m.chainProc = Math.min(0.8, m.chainProc + av);
            else if (ak === 'dmgReduce') m.dmgReduce = Math.min(0.35, m.dmgReduce + av);
            else if (ak === 'bonusGoldChance') m.bonusGoldChance = Math.min(0.85, m.bonusGoldChance + av);
            else if (ak in m) m[ak] += (ak === 'flatHp' || ak === 'frostShieldCapBonus' || ak === 'burnKillHeal') ? av : av * enhBonusMult;
          }
        }
      }
    }
    m.dmgReduce = Math.min(0.35, m.dmgReduce);
    m.extraShot = Math.min(BALANCE.combat.extraShotCap, Math.round(m.extraShot));
    m.bonusGold = Math.round(m.bonusGold);
    m.flatHp = Math.round(m.flatHp);
    m.frostShieldCapBonus = Math.round(m.frostShieldCapBonus);
    m.burnKillHeal = Math.round(m.burnKillHeal);
    return m;
  }

  function syncHeroMaxHp(opts = {}){
    if (!ctx.game?.hero) return;
    const h = ctx.game.hero;
    const gm = aggregateGear(h.gear);
    const oldMax = h.maxHp;
    const destinyFlatHp = hasDestinyEnhancement(ctx.game, 'destiny_aegis_bulwark') ? 90 : 0;
    const rawMax = Math.round((h.baseMaxHp + gm.flatHp + destinyFlatHp) * Math.max(0.4, 1 + gm.hpPct));
    h.maxHp = Math.max(60, rawMax);
    if (opts && opts.healDelta && h.maxHp > oldMax) {
      h.hp = Math.min(h.maxHp, h.hp + (h.maxHp - oldMax));
    } else {
      h.hp = Math.min(h.hp, h.maxHp);
    }
  }

  function getHeroStats(){
    const h = ctx.game.hero;
    const r = getActiveUnlockNode();
    const gm = aggregateGear(h.gear);
    const syn = getSynergyCounts();
    const berkLv = h.skills.berserk || 0;
    const holyAura = (ctx.game.seal && ctx.game.seal.kind === 'holy') ? (ARTIFACTS.holy.stars[ctx.game.seal.star - 1].auraAspd || 0) : 0;
    const holySub = getSubSeal('holy');
    const holySubCrit = holySub ? SUB_SEAL_RESONANCE.holy.crit[holySub.star - 1] : 0;
    const hasShieldNow = (h.shield || 0) > 0;

    // Perk bonuses
    const bloodLv = perkLv(ctx.game, 'blood_oath');
    const lostPct = clamp((h.maxHp - h.hp) / Math.max(1, h.maxHp), 0, 1);
    const bloodSteps = Math.floor(lostPct * 10);
    const bloodDmg = bloodLv === 2 ? bloodSteps * 0.18 : bloodLv === 1 ? bloodSteps * 0.12 : 0;
    const bloodAspd = (bloodLv >= 2 && h.hp <= h.maxHp * 0.5) ? 0.35 : 0;
    const bloodLeech = bloodLv >= 1 ? bloodSteps * 2 : 0;

    const goldLv = perkLv(ctx.game, 'gold_power');
    const goldDmg = goldLv === 2 ? Math.min(0.63, Math.floor(ctx.game.gold / 50) * 0.09)
                  : goldLv === 1 ? Math.min(0.42, Math.floor(ctx.game.gold / 50) * 0.06) : 0;

    const ocLv = perkLv(ctx.game, 'artifact_overclock');
    const sealDmgBonus = (ocLv >= 1 && ctx.game.seal) ? ctx.game.seal.star * 0.08 : 0;

    const windGaleLv = perkLv(ctx.game, 'wind_gale');
    const dashAspd = (windGaleLv >= 2 && h.dashBuffT > 0) ? 0.60 : 0;
    const swordSet = gearSetTier('sword');
    const greedSet = gearSetTier('greed');
    const greedCap = greedSet >= 3 ? 0.45 : 0.28;
    const greedAspd = greedSet >= 2 ? Math.min(greedCap, Math.floor(ctx.game.gold / 40) * 0.04) : 0;
    const greedMove = greedSet >= 2 ? Math.min(greedCap, Math.floor(ctx.game.gold / 40) * 0.03) : 0;
    const wfDualMove = hasDualRes('wind_frost') ? 0.15 : 0;
    const bloodKillDmg = (h.bloodKills || 0) * 0.03;
    const shieldAffixDmg = hasShieldNow ? (gm.shieldedDmgPct || 0) : 0;
    const shieldAffixMove = hasShieldNow ? (gm.shieldedMovePct || 0) : 0;
    const holyMasteryCritDmg = (ctx.game.seal?.kind === 'holy' && ctx.game.seal?.route === 'mastery') ? 0.20 : 0;

    // Stage 4 Destiny Exclusive Enhancement stat hooks
    const temperedGearCount = hasDestinyEnhancement(ctx.game, 'destiny_golden_temper')
      ? (h.gear || []).filter(g => (g?.enhanceLv || 0) >= 2).length
      : 0;
    const destinyTemperDmg = temperedGearCount * 0.07;
    const destinyTemperAspd = temperedGearCount * 0.05;
    const destinyCrownSkillMult = hasDestinyEnhancement(ctx.game, 'destiny_resonance_crown') ? 1.16 : 1.0;
    const destinyCrownCritDmg = hasDestinyEnhancement(ctx.game, 'destiny_resonance_crown') ? 0.25 : 0;
    const destinyDashCrit = (hasDestinyEnhancement(ctx.game, 'destiny_phantom_stride') && (h.destinyDashBuffT || 0) > 0) ? 0.20 : 0;
    const destinyFrostMove = (hasDestinyEnhancement(ctx.game, 'destiny_glacial_aegis') && (h.destinyFrostMoveT || 0) > 0) ? 0.12 : 0;

    const rawAspd = Math.max(0.5, 1 + gm.aspd + berkLv * 0.18 + holyAura + (syn.wind >= 2 ? 0.25 : 0) + (h.ultTimer > 0 ? 0.80 : 0) + bloodAspd + dashAspd + greedAspd + destinyTemperAspd);
    const { attackSpeedSoftCap, attackSpeedOverflowScale } = BALANCE.combat;
    const aspd = Math.min(rawAspd, attackSpeedSoftCap) + Math.max(0, rawAspd - attackSpeedSoftCap) * attackSpeedOverflowScale;
    const { gearDamageSoftCap, gearDamageOverflowScale } = BALANCE.combat;
    const gearDamage = Math.min(gm.dmgPct, gearDamageSoftCap) + Math.max(0, gm.dmgPct - gearDamageSoftCap) * gearDamageOverflowScale;
    const dmgMult = 1 + gearDamage + shieldAffixDmg + (h.lv - 1) * BALANCE.progression.heroDmgPerLevel + r.dmgBonus + bloodDmg + goldDmg + sealDmgBonus + bloodKillDmg + destinyTemperDmg;

    const ownedSkills = Object.values(h.skills).filter(v => v > 0).length;
    const mmLv = perkLv(ctx.game, 'mono_mastery');
    const mmActive = (mmLv === 1 && ownedSkills <= 2) || (mmLv >= 2 && ownedSkills <= 3);
    const skillDmgMult = dmgMult * (mmActive ? (mmLv >= 2 ? 1.55 : 1.30) : 1) * destinyCrownSkillMult;
    const rangeMult = Math.max(0.65, 1 + gm.rangePct);
    const skillRangeMult = rangeMult * (mmActive ? (mmLv >= 2 ? 1.15 : 1.08) : 1);
    const skillCdMult = r.cdMult * (mmActive && mmLv >= 2 ? 0.80 : 1);

    const csLv = perkLv(ctx.game, 'crit_surge');
    const swordSetCrit = swordSet >= 3 ? 0.20 : swordSet >= 2 ? 0.12 : 0;
    const rawCrit = BALANCE.progression.heroBaseCrit + gm.crit + berkLv * 0.08 + (syn.holy >= 2 ? 0.15 : 0) + holySubCrit + (h.ultTimer > 0 ? 0.35 : 0)
      + swordSetCrit + (csLv === 2 ? 0.25 : csLv === 1 ? 0.15 : 0)
      + (windGaleLv >= 1 && h.dashBuffT > 0 ? 1.0 : 0) + destinyDashCrit;
    const overflowCrit = Math.max(0, rawCrit - 1.0);
    const crit = Math.min(1.0, rawCrit);
    const rawCritDmg = (syn.holy >= 4 ? 2.2 : BALANCE.progression.heroBaseCritMultiplier) + gm.critDmg + holyMasteryCritDmg + (hasDualRes('holy_omni') ? 0.25 : 0)
      + (csLv === 2 ? overflowCrit * 3 * BALANCE.combat.critOverflowScale : csLv === 1 ? overflowCrit * 2 * BALANCE.combat.critOverflowScale : 0)
      + (perkLv(ctx.game, 'sword_rain') >= 2 ? 0.60 : 0) + destinyCrownCritDmg;
    const critDmg = Math.min(rawCritDmg, BALANCE.combat.critDamageCap);

    const moveSpd = (BALANCE.progression.heroBaseMove + berkLv * BALANCE.progression.heroMovePerBerserkLv)
      * (1 + gm.movePct + shieldAffixMove + greedMove + wfDualMove + destinyFrostMove + (windGaleLv === 2 ? 0.30 : windGaleLv === 1 ? 0.20 : 0) + (perkLv(ctx.game, 'ult_engine') >= 1 && h.ultTimer > 0 ? 0.30 : 0));
    const windMetaMagnet = getActiveMetaMain()?.id === 'main_wind' ? Number(getActiveMetaMain()?.effects?.magnetBonus || 0.8) : 0;
    const magnet = 2.9 + berkLv * 0.85 + gm.rangePct * 2.0 + windMetaMagnet;
    const lifesteal = gm.lifesteal + berkLv * 2 + bloodLeech;

    return { aspd, dmgMult, skillDmgMult, crit, critDmg, magnet, rangeMult, skillRangeMult, skillCdMult, moveSpd, lifesteal, mmActive, gm };
  }

  function getSealStats(a = ctx.game.seal){
    if (!a) return null;
    const spec = ARTIFACTS[a.kind];
    const base = spec.stars[clamp(a.star - 1, 0, spec.stars.length - 1)];
    const hs = getHeroStats();
    const gm = hs.gm;
    const syn = getSynergyCounts();
    const ocLv = perkLv(ctx.game, 'artifact_overclock');
    const windSub = getSubSeal('wind');
    const fireSub = getSubSeal('fire');
    const frostSub = getSubSeal('frost');
    const route = a.star >= 3 ? (a.route || null) : null;

    const fireSubMult = fireSub ? (1 + SUB_SEAL_RESONANCE.fire.dmgBonus[fireSub.star - 1]) : 1;
    const windSubCd = windSub ? (1 - SUB_SEAL_RESONANCE.wind.cdRed[windSub.star - 1]) : 1;
    const frostSubSlow = frostSub ? SUB_SEAL_RESONANCE.frost.slow[frostSub.star - 1] : 0;
    const fireSubBurn = fireSub ? SUB_SEAL_RESONANCE.fire.burn[fireSub.star - 1] : 0;

    const routeDmgMult = route === 'standard' ? 1.18 : 1;
    const routeCdMult = route === 'standard' ? 0.92 : (route === 'mastery' && a.kind === 'wind' ? 0.90 : 1);
    const fireMult = (a.elem === 'fire' && syn.fire >= 2) ? 1.35 : 1;
    const essenceMult = 1 + (ctx.game.hero?.sealEssenceBonus || 0);
    const destinyCrownSealCd = hasDestinyEnhancement(ctx.game, 'destiny_resonance_crown') ? 0.86 : 1;
    const dmg = Math.max(5, Math.round(base.dmg * hs.dmgMult * fireMult * fireSubMult * routeDmgMult * essenceMult));
    const cd = Math.max(0.16, base.cd * windSubCd * routeCdMult * destinyCrownSealCd * (ocLv >= 1 ? 0.75 : 1) / hs.aspd);
    const range = Number((base.range * hs.rangeMult * (ocLv >= 2 ? 1.3 : 1)).toFixed(2));
    const shots = (base.shots || 1) + gm.extraShot + (ocLv >= 2 ? 1 : 0) + (route === 'mastery' && a.kind === 'wind' ? 1 : 0);
    const chains = (base.chains || 0) + (syn.thunder >= 2 ? 2 : 0) + gm.extraShot + (ocLv >= 2 ? 1 : 0) + (route === 'mastery' && a.kind === 'thunder' ? 2 : 0);
    const wfRadiusMult = hasDualRes('wind_fire') ? 1.28 : 1;
    const fireMasteryRad = (route === 'mastery' && a.kind === 'fire') ? 1.25 : 1;
    const splash = ((base.splash || 0) + gm.splashBonus) * (ocLv >= 2 ? 1.3 : 1) * wfRadiusMult * fireMasteryRad;
    const pierce = (base.pierce || 0) + (route === 'mastery' && a.kind === 'wind' ? 2 : 0);
    const beams = (base.beams || 2) + gm.extraShot + (ocLv >= 2 ? 1 : 0) + (route === 'mastery' && a.kind === 'holy' ? 1 : 0);

    return {
      dmg, cd, range, crit: hs.crit, critDmg: hs.critDmg, shots, chains, splash, pierce, beams, route,
      slow: Math.max(base.slow || 0, gm.slowOnHit, frostSubSlow),
      slowDur: base.slowDur || ((gm.slowOnHit || frostSubSlow) ? 2.2 : 0),
      burn: Math.max(base.burn || 0, fireSubBurn), gm
    };
  }

  return {
    getSynergyCounts,
    getSynergyTier,
    getSubSeal,
    getGearSetCounts,
    gearSetTier,
    getActiveGearSets,
    getActiveDualResonances,
    hasDualRes,
    refreshCombos,
    aggregateGear,
    syncHeroMaxHp,
    getHeroStats,
    getSealStats,
  };
}
