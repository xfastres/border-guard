import BALANCE from '../../data/balance.js';
import { GEARS, GEAR_KEYS, GEAR_MAX_STAR, GEAR_AFFIXES, GEAR_RARITY_LABELS } from '../../data/index.js';
import { clamp } from '../../core/math.js';
import { getSourceStageForWave, getSourceStageSpec } from '../../core/state-queries.js';

export function isGearInstance(obj){
  return !!(obj && typeof obj === 'object' && typeof obj.baseKey === 'string' && typeof obj.uid === 'string');
}

export function gearBase(k){
  if (!k) return '';
  if (typeof k === 'object') return k.baseKey || k.key || '';
  return String(k).split('#')[0];
}

export function gearStar(k){
  if (k && typeof k === 'object') return 1 + (k.enhanceLv || 0);
  const s = parseInt(String(k || '1').split('#')[1] || '1', 10);
  return Math.min(GEAR_MAX_STAR, Math.max(1, s || 1));
}

export function gearLabel(k){
  const spec = GEARS[gearBase(k)];
  if (!spec) return '未知构装';
  if (k && typeof k === 'object') {
    const enh = k.enhanceLv > 0 ? ` +${k.enhanceLv}` : '';
    return `${spec.name}${enh}`;
  }
  const s = gearStar(k);
  return `${spec.name}${s > 1 ? ` ${s}★` : ''}`;
}

// Stage 2: Legacy auto-fusion is COMPLETELY REMOVED so duplicate gear NEVER overwrites random slots/affixes!
export function findGearStackTarget(){
  return null;
}

export function validateGearAffixes(affixList, slotsCount = 3){
  const list = Array.isArray(affixList) ? affixList : [];
  if (list.length > slotsCount) return { ok: false, reason: 'exceeds_slots' };
  const seenIds = new Set();
  const seenGroups = new Set();
  for (const entry of list) {
    if (!entry) continue; // null allowed for future Stage 4 extracted empty slot
    const id = typeof entry === 'string' ? entry : entry.id;
    const spec = GEAR_AFFIXES[id];
    if (!spec) return { ok: false, reason: `unknown_affix:${id}` };
    if (seenIds.has(id)) return { ok: false, reason: `duplicate_affix:${id}` };
    seenIds.add(id);
    if (spec.conflictGroup) {
      if (seenGroups.has(spec.conflictGroup)) return { ok: false, reason: `conflict_group:${spec.conflictGroup}` };
      seenGroups.add(spec.conflictGroup);
    }
  }
  return { ok: true, reason: null };
}

export function getGearBaseMult(inst){
  const stageSpec = getSourceStageSpec(inst?.sourceStage || 1);
  const step = BALANCE.equipment?.materialEnhance?.baseStatStepPerLv || 0.18;
  const enh = inst && typeof inst === 'object' ? (inst.enhanceLv || 0) : Math.max(0, gearStar(inst) - 1);
  return (stageSpec.baseStatMult || 1) * (1 + enh * step);
}

export function createGearInstances(ctx, meta) {
  const { getActiveRunAffixKeys, getActiveMetaMain, getMetaConfig } = meta;

  function nextGearUid(){
    const n = ctx.counters.gearUidSeq++;
    const r = ctx.game?.rnd ? Math.floor(ctx.game.rnd() * 9000 + 1000) : Math.floor(Math.random() * 9000 + 1000);
    return `g${n}_${r}`;
  }

  function ownedGearStar(baseKey){
    let cnt = 0;
    for (const g of (ctx.game?.hero?.gear || [])) if (gearBase(g) === baseKey) cnt++;
    for (const g of (ctx.game?.bag || [])) if (gearBase(g) === baseKey) cnt++;
    return cnt;
  }

  function rollGearSlotsCount(rndFn = ctx.game?.rnd || Math.random){
    const w = BALANCE.equipment?.slotWeights || { '1': 0.50, '2': 0.35, '3': 0.15 };
    const p1 = Number(w['1'] ?? 0.50);
    const p2 = Number(w['2'] ?? 0.35);
    const r = rndFn();
    if (r < p1) return 1;
    if (r < p1 + p2) return 2;
    return 3;
  }

  function rollGearAffixes(slotsCount, { elem = null, highRarityChance = 0.14, rndFn = ctx.game?.rnd || Math.random } = {}){
    const count = clamp(Math.round(Number(slotsCount) || 1), 1, 3);
    const chosen = [];
    const usedIds = new Set();
    const usedGroups = new Set();
    const wantHighRarity = rndFn() < highRarityChance;
    const activePool = getActiveRunAffixKeys();
    const mainSpec = getActiveMetaMain();
    const mainElem = mainSpec?.elem || null;
    const mainTilt = mainElem ? getMetaConfig().mainRewardWeightMultiplier : 1.0;

    for (let i = 0; i < count; i++) {
      const candidates = activePool.filter(id => {
        if (usedIds.has(id)) return false;
        const sp = GEAR_AFFIXES[id];
        if (!sp) return false;
        if (sp.conflictGroup && usedGroups.has(sp.conflictGroup)) return false;
        return true;
      });
      if (!candidates.length) break;

      let totalWeight = 0;
      const weighted = candidates.map(id => {
        const sp = GEAR_AFFIXES[id];
        let wt = sp.rarity === 'epic' ? (wantHighRarity ? 2.6 : 1.0)
          : sp.rarity === 'rare' ? (wantHighRarity ? 2.2 : 1.5)
          : 2.0;
        if (elem && sp.elem === elem) wt *= 2.4;
        if (mainElem && sp.elem === mainElem) wt *= mainTilt;
        totalWeight += wt;
        return { id, wt };
      });

      let pick = weighted[weighted.length - 1].id;
      let roll = rndFn() * totalWeight;
      for (const w of weighted) {
        roll -= w.wt;
        if (roll <= 0) { pick = w.id; break; }
      }
      const spec = GEAR_AFFIXES[pick];
      usedIds.add(pick);
      if (spec.conflictGroup) usedGroups.add(spec.conflictGroup);
      chosen.push({ id: pick, tier: 1, rarity: spec.rarity });
    }
    return chosen;
  }

  function createGearInstance(baseKey, opts = {}){
    const key = GEARS[baseKey] ? baseKey : GEAR_KEYS[0];
    const spec = GEARS[key];
    const rndFn = opts.rndFn || ctx.game?.rnd || Math.random;
    const rarity = (opts.rarity && GEAR_RARITY_LABELS[opts.rarity]) ? opts.rarity : spec.rarity;
    const sourceStage = opts.sourceStage != null
      ? clamp(Math.round(Number(opts.sourceStage)), 1, 3)
      : getSourceStageForWave(opts.wave ?? ctx.game?.wave ?? 1);
    const slotsCount = opts.slotsCount != null
      ? clamp(Math.round(Number(opts.slotsCount)), 1, 3)
      : rollGearSlotsCount(rndFn);
    const enhanceLv = clamp(Math.round(Number(opts.enhanceLv || 0)), 0, BALANCE.equipment?.materialEnhance?.maxEnhanceLv || 5);

    let affixes;
    if (Array.isArray(opts.affixes)) {
      const normalized = opts.affixes.slice(0, slotsCount).map(a => {
        if (!a) return null;
        const id = typeof a === 'string' ? a : a.id;
        const aSpec = GEAR_AFFIXES[id];
        if (!aSpec) return null;
        return { id, tier: Math.max(1, (typeof a === 'object' && a.tier ? a.tier : 1 + enhanceLv)), rarity: aSpec.rarity };
      });
      const check = validateGearAffixes(normalized, slotsCount);
      if (!check.ok) {
        throw new Error(`Invalid gear affixes (${check.reason})`);
      }
      affixes = normalized;
    } else {
      affixes = rollGearAffixes(slotsCount, {
        elem: spec.elem,
        highRarityChance: opts.highRarityChance ?? (BALANCE.equipment?.shopPricing?.highRarityAffixChance || 0.16),
        rndFn
      }).map(a => ({ ...a, tier: 1 + enhanceLv }));
    }

    return {
      uid: opts.uid || nextGearUid(),
      baseKey: key,
      name: spec.name,
      icon: spec.icon,
      elem: spec.elem,
      set: spec.set,
      rarity,
      sourceStage,
      slotsCount,
      affixes,
      enhanceLv,
      paidGold: Math.max(0, Math.round(Number(opts.paidGold || 0))),
      extractedCount: Math.max(0, Math.round(Number(opts.extractedCount || 0))),
      origin: opts.origin || 'drop'
    };
  }

  function normalizeGearInstance(input, opts = {}){
    if (isGearInstance(input)) {
      const spec = GEARS[input.baseKey] || GEARS[GEAR_KEYS[0]];
      const enhanceLv = clamp(Math.round(Number(input.enhanceLv || 0)), 0, BALANCE.equipment?.materialEnhance?.maxEnhanceLv || 5);
      const slotsCount = clamp(Math.round(Number(input.slotsCount || (input.affixes?.length || 1))), 1, 3);
      const affixes = (Array.isArray(input.affixes) ? input.affixes : []).slice(0, slotsCount).map(a => {
        if (!a) return null;
        const id = typeof a === 'string' ? a : a.id;
        const sp = GEAR_AFFIXES[id];
        return sp ? { id, tier: Math.max(1, Number(a.tier || (1 + enhanceLv))), rarity: sp.rarity } : null;
      });
      return {
        uid: input.uid || nextGearUid(),
        baseKey: spec.key,
        name: input.name || spec.name,
        icon: input.icon || spec.icon,
        elem: input.elem || spec.elem,
        set: input.set || spec.set,
        rarity: (input.rarity && GEAR_RARITY_LABELS[input.rarity]) ? input.rarity : spec.rarity,
        sourceStage: clamp(Math.round(Number(input.sourceStage || getSourceStageForWave(opts.wave ?? ctx.game?.wave ?? 1))), 1, 3),
        slotsCount,
        affixes,
        enhanceLv,
        paidGold: Math.max(0, Math.round(Number(input.paidGold || 0))),
        extractedCount: Math.max(0, Math.round(Number(input.extractedCount || 0))),
        origin: input.origin || opts.origin || 'drop'
      };
    }
    const baseKey = gearBase(input);
    const legacyStar = gearStar(input);
    return createGearInstance(baseKey, {
      ...opts,
      enhanceLv: opts.enhanceLv != null ? opts.enhanceLv : Math.max(0, legacyStar - 1)
    });
  }

  return {
    nextGearUid,
    ownedGearStar,
    rollGearSlotsCount,
    rollGearAffixes,
    createGearInstance,
    normalizeGearInstance,
  };
}
