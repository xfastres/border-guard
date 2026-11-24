import BALANCE from '../../data/balance.js';
import { GEARS } from '../../data/index.js';
import { getSourceStageForWave, getSourceStageSpec } from '../../core/state-queries.js';
import { gearBase } from '../equipment/index.js';

// Recycle value depends STRICTLY on inst.rarity and inst.sourceStage (NEVER slotsCount or current wave!)
// Anti-arbitrage guard: if bought from shop (paidGold > 0), sell gold is strictly < paidGold!
export function getGearSellGold(inst){
  if (!inst) return 0;
  const rec = BALANCE.equipment?.recycle || {};
  const baseMap = rec.sellGoldBase || { common: 10, rare: 16, epic: 26, legend: 42 };
  const rarity = typeof inst === 'object' ? (inst.rarity || GEARS[gearBase(inst)]?.rarity || 'common') : (GEARS[gearBase(inst)]?.rarity || 'common');
  const sourceStage = typeof inst === 'object' ? (inst.sourceStage || 1) : 1;
  const stageSpec = getSourceStageSpec(sourceStage);
  let gold = Math.max(1, Math.round((baseMap[rarity] || 10) * (stageSpec.sellMult || 1)));
  const paid = typeof inst === 'object' ? Math.max(0, Number(inst.paidGold || 0)) : 0;
  if (paid > 0) {
    const capRatio = Number(rec.paidGoldSellCapRatio ?? 0.72);
    const maxAllowed = Math.max(1, Math.min(paid - 1, Math.floor(paid * capRatio)));
    gold = Math.min(gold, maxAllowed);
  }
  return gold;
}

export function getGearEnhanceCost(inst){
  if (!inst || typeof inst !== 'object' || inst.itemType === 'seal') return null;
  const cfg = BALANCE.equipment?.materialEnhance || {};
  const maxLv = cfg.maxEnhanceLv || 6;
  const curLv = inst.enhanceLv || 0;
  if (curLv >= maxLv) return null;
  const table = Array.isArray(cfg.matCostByNextLv) ? cfg.matCostByNextLv : [2, 3, 5, 7, 10, 14];
  return table[curLv] ?? (2 + curLv * 2);
}

export function getBagCapacity(){
  return Math.max(4, Number(BALANCE.progression?.bagCapacity || 12));
}

export function isBagSeal(item){
  return !!(item && typeof item === 'object' && item.itemType === 'seal');
}

export function getEndgameRefinementConfig(){
  return BALANCE.endgameRefinement || {
    startWave: 21,
    eliteMaterialDropW21To24: 2,
    eliteMaterialDropW25To29: 3,
    bossMaterialDropW21Plus: 6,
    shrineMaterialDropW21Plus: 4,
    waveClearMaterialsByBand: [
      { from: 21, to: 24, materials: 1 },
      { from: 25, to: 27, materials: 2 },
      { from: 28, to: 29, materials: 3 }
    ],
    shopHighRarityAffixBonusW21Plus: 0.14,
    shopSecondGearChanceW21Plus: 0.65,
    chestHighRarityAffixBonusW21Plus: 0.12
  };
}

export function getWaveClearMaterialBonus(clearedWave){
  const cfg = getEndgameRefinementConfig();
  const bands = Array.isArray(cfg.waveClearMaterialsByBand) ? cfg.waveClearMaterialsByBand : [];
  for (const b of bands) {
    if (clearedWave >= b.from && clearedWave <= b.to) return Math.max(0, Number(b.materials || 0));
  }
  return 0;
}

export function createEconomyPricing(ctx, { meta, equipment }) {
  const { getActiveRunGearKeys, pickWeightedByMainLegacy, hasMetaAux } = meta;
  const { normalizeGearInstance } = equipment;

  function getShopElemBuyCount(elem){
    const game = ctx.game;
    if (!game) return 0;
    const sp = BALANCE.equipment?.shopPricing || {};
    const curStage = getSourceStageForWave(game.wave);
    if (sp.sameElemResetByStage && game.shopElemBuyStage !== curStage) {
      game.shopElemBuyCounts = { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 };
      game.shopElemBuyStage = curStage;
    }
    return game.shopElemBuyCounts?.[elem] || 0;
  }

  function calcShopGearPrice(rarity, elem, wave = ctx.game?.wave || 1){
    const sp = BALANCE.equipment?.shopPricing || {};
    const baseMap = sp.basePriceByRarity || { common: 26, rare: 42, epic: 64, legend: 96 };
    const stageMap = sp.stagePriceMult || { '1': 1.0, '2': 1.3, '3': 1.65 };
    const capMap = sp.priceCapByRarity || { common: 64, rare: 104, epic: 156, legend: 220 };
    const step = Number(sp.sameElemStep ?? 0.18);
    const stage = getSourceStageForWave(wave);
    const base = baseMap[rarity] || baseMap.common || 26;
    const stageMult = Number(stageMap[String(stage)] ?? 1.0);
    const sameElemCount = getShopElemBuyCount(elem);
    const raw = Math.round(base * stageMult * (1 + sameElemCount * step));
    const cap = capMap[rarity] || Math.round(base * 2.4);
    return Math.min(cap, Math.max(base, raw));
  }

  function pickShopGearBaseKey(wave = ctx.game?.wave || 1, rndFn = ctx.game?.rnd || Math.random){
    const r = rndFn();
    let rarity = 'common';
    if (wave <= 5) rarity = r < 0.28 ? 'rare' : 'common';
    else if (wave <= 10) rarity = r < 0.12 ? 'epic' : r < 0.58 ? 'rare' : 'common';
    else if (wave <= 20) rarity = r < 0.08 ? 'legend' : r < 0.42 ? 'epic' : r < 0.85 ? 'rare' : 'common';
    else rarity = r < 0.22 ? 'legend' : r < 0.65 ? 'epic' : 'rare';

    const activePool = getActiveRunGearKeys();
    const pool = activePool.filter(k => GEARS[k]?.rarity === rarity);
    const list = pool.length ? pool : activePool;
    return pickWeightedByMainLegacy(list, k => GEARS[k]?.elem || null, rndFn) || list[0];
  }

  function getGearDismantleMaterials(inst){
    if (!inst) return 0;
    const rec = BALANCE.equipment?.recycle || {};
    const baseMap = rec.dismantleMatBase || { common: 1, rare: 2, epic: 3, legend: 5 };
    const rarity = typeof inst === 'object' ? (inst.rarity || GEARS[gearBase(inst)]?.rarity || 'common') : (GEARS[gearBase(inst)]?.rarity || 'common');
    const sourceStage = typeof inst === 'object' ? (inst.sourceStage || 1) : 1;
    const stageSpec = getSourceStageSpec(sourceStage);
    const baseMats = Math.max(1, Math.round((baseMap[rarity] || 1) * (stageSpec.dismantleMult || 1)));
    const craftBonus = (hasMetaAux('aux_salvage_craft') && (rarity === 'epic' || rarity === 'legend')) ? 1 : 0;
    return baseMats + craftBonus;
  }

  function hasBagSpace(need = 1){
    const game = ctx.game;
    if (!game || !Array.isArray(game.bag)) return false;
    return (game.bag.length + Math.max(1, Number(need) || 1)) <= getBagCapacity();
  }

  function tryStoreGearInBag(inst){
    if (!hasBagSpace(1)) {
      return { ok: false, reason: 'bag_full', capacity: getBagCapacity() };
    }
    const normalized = isBagSeal(inst) ? inst : normalizeGearInstance(inst);
    ctx.game.bag.push(normalized);
    return { ok: true, storedIn: 'bag', item: normalized };
  }

  function getEnemyMaterialDrop(e, wave = ctx.game?.wave || 1){
    const cfg = getEndgameRefinementConfig();
    if (e?.isShrineBoss) {
      return wave >= (cfg.startWave || 21) ? (cfg.shrineMaterialDropW21Plus || 4) : 2;
    }
    if (e?.boss) {
      return wave >= (cfg.startWave || 21) ? (cfg.bossMaterialDropW21Plus || 6) : (BALANCE.economy.bossMaterialDrop || 3);
    }
    if (e?.elite) {
      if (wave >= 25) return cfg.eliteMaterialDropW25To29 || 3;
      if (wave >= (cfg.startWave || 21)) return cfg.eliteMaterialDropW21To24 || 2;
      return BALANCE.economy.eliteMaterialDrop || 1;
    }
    return 0;
  }

  return {
    getShopElemBuyCount,
    calcShopGearPrice,
    pickShopGearBaseKey,
    getGearSellGold,
    getGearDismantleMaterials,
    getGearEnhanceCost,
    getBagCapacity,
    hasBagSpace,
    tryStoreGearInBag,
    isBagSeal,
    getEndgameRefinementConfig,
    getEnemyMaterialDrop,
    getWaveClearMaterialBonus,
  };
}
