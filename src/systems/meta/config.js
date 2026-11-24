import BALANCE from '../../data/balance.js';
import { BASE_AFFIX_KEYS, BASE_GEAR_KEYS } from '../../data/index.js';

export { MAIN_WAVES } from '../../data/index.js';

export function getMetaConfig(){
  const raw = BALANCE.metaProgression || {};
  return {
    storageKey: raw.storageKey || 'border_guard_v060_meta_v1',
    schemaVersion: Number(raw.schemaVersion || 1),
    currency: raw.currency || { id: 'legacyShards', name: '传承碎片', icon: '💠' },
    budget: {
      mainSlots: Math.max(1, Number(raw.budget?.mainSlots ?? 1)),
      maxAuxCount: Math.max(1, Number(raw.budget?.maxAuxCount ?? 3)),
      maxAuxPoints: Math.max(1, Number(raw.budget?.maxAuxPoints ?? 4))
    },
    mainRewardWeightMultiplier: Math.max(1.0, Number(raw.mainRewardWeightMultiplier ?? 1.35)),
    activePoolControl: {
      targetActiveGearPoolSize: Math.max(12, Number(raw.activePoolControl?.targetActiveGearPoolSize ?? BASE_GEAR_KEYS.length)),
      targetActiveAffixPoolSize: Math.max(8, Number(raw.activePoolControl?.targetActiveAffixPoolSize ?? BASE_AFFIX_KEYS.length))
    },
    mains: Array.isArray(raw.mains) ? raw.mains : [],
    auxiliaries: Array.isArray(raw.auxiliaries) ? raw.auxiliaries : [],
    unlockPacks: Array.isArray(raw.unlockPacks) ? raw.unlockPacks : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
    rewardFormula: raw.rewardFormula || {
      minClearedWaveForAnyReward: 3,
      band1Range: [3, 10], band1PerWave: 1.5,
      band2Range: [11, 20], band2PerWave: 3.5,
      band3Range: [21, 29], band3PerWave: 7.0,
      bossKillBonus: 4, w10BreakthroughBonus: 12, w20VoucherBonus: 28, w30VictoryBonus: 140
    }
  };
}

export function getMetaMainSpec(id){
  return getMetaConfig().mains.find(m => m.id === id) || null;
}

export function getMetaAuxSpec(id){
  return getMetaConfig().auxiliaries.find(a => a.id === id) || null;
}

export function getMetaPackSpec(id){
  return getMetaConfig().unlockPacks.find(p => p.id === id) || null;
}

export function createDefaultMetaSave(){
  const cfg = getMetaConfig();
  const defaultMains = cfg.mains.filter(m => m.unlockedByDefault).map(m => m.id);
  const defaultAux = cfg.auxiliaries.filter(a => a.unlockedByDefault).map(a => a.id);
  // Ensure initial default loadout demonstrates 1 Main + 3 Aux = 4 pts (1+1+2=4) on a brand-new 0-unlock account!
  const initAux = [];
  let pts = 0;
  for (const id of defaultAux) {
    const sp = getMetaAuxSpec(id);
    if (!sp) continue;
    if (initAux.length < cfg.budget.maxAuxCount && pts + sp.costPoints <= cfg.budget.maxAuxPoints) {
      initAux.push(id);
      pts += sp.costPoints;
    }
  }
  return {
    schemaVersion: cfg.schemaVersion,
    legacyShards: 0,
    unlockedMain: defaultMains.length ? defaultMains : ['main_flame'],
    unlockedAux: defaultAux,
    unlockedPacks: [],
    claimedMilestones: [],
    loadout: {
      main: defaultMains[0] || 'main_flame',
      aux: initAux
    },
    stats: {
      totalRuns: 0,
      victories: 0,
      bestWave: 0,
      totalLegacyShardsEarned: 0,
      noGambleVictories: 0,
      shrinesClearedTotal: 0
    },
    settledRunIds: [],
    lastSettlement: null
  };
}

export function getMetaLoadoutBudget(loadout){
  const cfg = getMetaConfig();
  const mainId = loadout?.main || null;
  const auxList = Array.isArray(loadout?.aux) ? Array.from(new Set(loadout.aux)) : [];
  let auxPoints = 0;
  for (const id of auxList) {
    const sp = getMetaAuxSpec(id);
    if (sp) auxPoints += Math.max(0, Number(sp.costPoints || 0));
  }
  const mainValid = !!(mainId && getMetaMainSpec(mainId));
  const auxCount = auxList.length;
  let valid = true;
  let reason = null;
  if (!mainValid) { valid = false; reason = 'invalid_main'; }
  else if (auxCount > cfg.budget.maxAuxCount) { valid = false; reason = 'aux_count_exceeded'; }
  else if (auxPoints > cfg.budget.maxAuxPoints) { valid = false; reason = 'aux_points_exceeded'; }
  return {
    mainCount: mainValid ? 1 : 0,
    mainSlots: cfg.budget.mainSlots,
    auxCount,
    maxAuxCount: cfg.budget.maxAuxCount,
    auxPoints,
    maxAuxPoints: cfg.budget.maxAuxPoints,
    remainingPoints: Math.max(0, cfg.budget.maxAuxPoints - auxPoints),
    valid,
    reason
  };
}
