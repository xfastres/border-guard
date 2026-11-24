import { GEAR_AFFIXES, GEAR_SYNERGIES } from '../../data/index.js';

export function evaluateSynergySetFromAffixIds(affixIdSet){
  const matched = GEAR_SYNERGIES.filter(s => s.req.every(r => affixIdSet.has(r)));
  const activeTrios = matched.filter(s => s.tier === 3);
  const replacedChains = new Set(activeTrios.map(s => s.chain));
  const bestByConflictGroup = new Map();
  const active = [...activeTrios];

  for (const s of matched) {
    if (s.tier !== 2) continue;
    // Complete Trio STRICTLY replaces any Duo of the same chain (never both!)
    if (replacedChains.has(s.chain)) continue;
    const grp = s.conflictGroup || s.id;
    const cur = bestByConflictGroup.get(grp);
    if (!cur || s.priority > cur.priority) {
      bestByConflictGroup.set(grp, s);
    }
  }
  for (const s of bestByConflictGroup.values()) active.push(s);
  active.sort((a, b) => (b.tier - a.tier) || (b.priority - a.priority));
  return active;
}

export function evaluateItemSynergies(inst){
  if (!inst || !Array.isArray(inst.affixes)) return [];
  const ids = new Set(inst.affixes.filter(Boolean).map(a => a.id));
  return evaluateSynergySetFromAffixIds(ids);
}

export function buildChainHint(chainKey, chainLabel, reqIds, affixIdSet, activeList){
  const present = reqIds.filter(id => affixIdSet.has(id));
  const missing = reqIds.filter(id => !affixIdSet.has(id));
  const trio = activeList.find(s => s.chain === chainKey && s.tier === 3);
  const duo = activeList.find(s => s.chain === chainKey && s.tier === 2);
  if (trio) {
    return {
      chain: chainKey, state: 'trio', activeId: trio.id, present, missing: [],
      text: `${trio.icon} ${chainLabel}【${trio.name}】完整三联动已激活（已替代原双联动）`
    };
  }
  if (duo) {
    const missNames = missing.map(id => `【${GEAR_AFFIXES[id]?.name || id}】`).join(' / ');
    return {
      chain: chainKey, state: 'duo', activeId: duo.id, present, missing,
      text: `${duo.icon} ${chainLabel}已激活双联动【${duo.name}】· 再配 ${missNames} 升级为完整三联动！`
    };
  }
  if (present.length === 1) {
    const missNames = missing.map(id => `【${GEAR_AFFIXES[id]?.name || id}】`).join(' 或 ');
    return {
      chain: chainKey, state: 'partial', activeId: null, present, missing,
      text: `${chainLabel} 1/3（已有【${GEAR_AFFIXES[present[0]]?.name}】）· 再配 ${missNames} 激活双联动`
    };
  }
  return null;
}

export function createGearSynergies(ctx) {
  function evaluateEquipmentSynergies(gearList = ctx.game?.hero?.gear || []){
    const list = Array.isArray(gearList) ? gearList : [];
    const globalAffixIds = new Set();
    const affixCounts = {};
    const perItem = [];

    for (const g of list) {
      if (!g || typeof g !== 'object' || !Array.isArray(g.affixes)) continue;
      const itemSyns = evaluateItemSynergies(g);
      perItem.push({ uid: g.uid, synergies: itemSyns });
      for (const a of g.affixes) {
        if (!a || !GEAR_AFFIXES[a.id]) continue;
        globalAffixIds.add(a.id);
        affixCounts[a.id] = (affixCounts[a.id] || 0) + 1;
      }
    }

    // Global evaluation: each synergy activates AT MOST ONCE across all 4 gear slots; Trio strictly replaces Duo
    const active = evaluateSynergySetFromAffixIds(globalAffixIds);
    const byId = {};
    for (const s of active) byId[s.id] = s;

    const fireSynergy = active.find(s => s.chain === 'fire_detonate') || null;
    const frostSynergy = active.find(s => s.chain === 'frost_aegis') || null;

    const hints = [];
    const fireHint = buildChainHint('fire_detonate', '火系引爆', ['fire_brand', 'fire_burst', 'fire_chain'], globalAffixIds, active);
    const frostHint = buildChainHint('frost_aegis', '冰系护体', ['frost_chill', 'frost_ward', 'frost_nova_counter'], globalAffixIds, active);
    if (fireHint) hints.push(fireHint);
    if (frostHint) hints.push(frostHint);

    return {
      active,
      byId,
      perItem,
      affixCounts,
      affixIds: Array.from(globalAffixIds),
      fireSynergy,
      frostSynergy,
      hasFireTrio: fireSynergy?.tier === 3,
      hasFireDuo: fireSynergy?.tier === 2,
      hasFrostTrio: frostSynergy?.tier === 3,
      hasFrostDuo: frostSynergy?.tier === 2,
      hints
    };
  }

  function recomputeEquipmentSynergies(){
    if (!ctx.game?.hero) return evaluateEquipmentSynergies([]);
    const res = evaluateEquipmentSynergies(ctx.game.hero.gear);
    ctx.game.hero.activeGearSynergies = res;
    return res;
  }

  function getActiveGearAffixSynergies(){
    if (!ctx.game?.hero) return evaluateEquipmentSynergies([]);
    if (!ctx.game.hero.activeGearSynergies) return recomputeEquipmentSynergies();
    return ctx.game.hero.activeGearSynergies;
  }

  function getGearSynergyHints(candidateInst = null){
    const cur = evaluateEquipmentSynergies(ctx.game?.hero?.gear || []);
    if (!candidateInst) return cur.hints;
    const withCand = evaluateEquipmentSynergies([...(ctx.game?.hero?.gear || []), candidateInst]);
    const changes = [];
    if (withCand.hasFireTrio && !cur.hasFireTrio) changes.push('穿戴后升级🔥【炽炎连环引爆】完整三联动！');
    else if (withCand.hasFireDuo && !cur.hasFireDuo && !cur.hasFireTrio) changes.push('穿戴后激活🔥火系双词条联动！');
    if (withCand.hasFrostTrio && !cur.hasFrostTrio) changes.push('穿戴后升级❄️【凛冬寒盾反制】完整三联动！');
    else if (withCand.hasFrostDuo && !cur.hasFrostDuo && !cur.hasFrostTrio) changes.push('穿戴后激活❄️冰系双词条联动！');
    return changes;
  }

  return {
    evaluateEquipmentSynergies,
    recomputeEquipmentSynergies,
    getActiveGearAffixSynergies,
    getGearSynergyHints,
  };
}
