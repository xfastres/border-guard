import { xpForLevel } from '../core/math.js';
import * as queries from '../core/state-queries.js';
import BALANCE from '../data/balance.js';
import {
  W,
  H,
  MAIN_WAVES,
  MAX_ENEMIES,
  SHRINE_WAVES,
  ELEMENTS,
  UNLOCK_NODES,
  REALMS,
  ARTIFACTS,
  SUB_SEAL_RESONANCE,
  SEAL_SPECIALIZATIONS,
  COMBOS,
  PERKS,
  PILLS,
  HERO_SKILLS,
  W10_SKILL_BRANCHES,
  GEAR_SETS,
  DUAL_RESONANCES,
  GEARS,
  BASE_GEAR_KEYS,
  GEAR_SALVAGE_GOLD,
  SOURCE_STAGES,
  GEAR_STAR_MULT,
  GEAR_AFFIXES,
  BASE_AFFIX_KEYS,
  GEAR_SYNERGIES,
  W20_BOSS_AUX_POOL,
  W30_BOSS_AUX_POOL,
  W20_DIRECTIONS,
  W20_ENHANCEMENTS,
  DESTINY_ENHANCEMENTS,
  DESTINY_SPECIAL_BOONS,
  DESTINY_PILLS,
} from '../data/index.js';

export function createPublicGameApi(runtimeCtx, { systems, ui, presets, gameLoop }) {
  const { meta } = systems;
  const { viewport } = ui;
  const { loadTestPreset, exportBuildPreset, importBuildPreset } = presets;
  const { perfStats, stepFrame } = gameLoop;
  const { setPaused } = ui.input;
  const {
    getMetaConfig, getMetaMainSpec, getMetaAuxSpec, getMetaPackSpec, createDefaultMetaSave,
    getMetaLoadoutBudget, normalizeMetaSave, migrateMetaSave, getMetaStorageStatus,
    exportRawCorruptedMetaSave, loadMetaSave, getMetaSave, resetMetaSave, exportMetaSave, importMetaSave,
    isMetaLoadoutLocked, setMetaMainLegacy, toggleMetaAuxLegacy, unlockMetaItem, syncRunActivePools,
    getActiveRunGearKeys, getActiveRunAffixKeys, getActiveMetaLoadout, getActiveMetaMain, hasMetaAux,
    lockMetaLoadoutForRun, getMainLegacyWeightTable, pickWeightedByMainLegacy, calculateRunShardRewards,
    settleRunMetaRewards, retryPendingMetaSave,
  } = meta;
  const {
    isGearInstance, gearBase, gearStar, gearLabel, findGearStackTarget, validateGearAffixes,
    rollGearSlotsCount, rollGearAffixes, createGearInstance, normalizeGearInstance,
    evaluateItemSynergies, evaluateEquipmentSynergies, recomputeEquipmentSynergies,
    getActiveGearAffixSynergies, getGearSynergyHints, describeGearInstance,
  } = systems.equipmentCore;
  const {
    getActiveUnlockNode, getRealm, getRealmStageLabel, getUnlockedSkillPool, getSealStarCap,
    getSubSealSlotCap, getShopTier, hasPendingDecision,
  } = systems.unlock;
  const {
    getSynergyCounts, getGearSetCounts, gearSetTier, getActiveGearSets, getActiveDualResonances,
    hasDualRes, refreshCombos, getHeroStats, getSealStats,
  } = systems.heroStats;
  const {
    changeGold, changeMaterials, changeTransferTokens, getResourceLedger, syncRunResourceAccounting,
    getShopElemBuyCount, calcShopGearPrice, pickShopGearBaseKey, getGearSellGold,
    getGearDismantleMaterials, getGearEnhanceCost, getBagCapacity, isBagSeal, getEndgameRefinementConfig,
    getEnemyMaterialDrop, getWaveClearMaterialBonus,
  } = systems.economyCore;
  const {
    applyFireMark, triggerFireDetonation, applyFrostSlow, getHeroMaxFrostShield, triggerFrostPulse,
    gainFrostShield, spawnPosAroundHero, spawnEnemy, spawnHealOrb, isEnemyUnstoppable, dealDamage,
  } = systems.combat;
  const { gainHeroXp, getCombatLogNowSec, getRecentThreatSummary, damageHero } = systems.heroVitals;
  const { castHeroDash, castHeroOverdrive } = systems.heroSkills;
  const { rollShop, chooseSealRoute, buyShopItem, sellSeal, sellSubSeal } = systems.shop;
  const { openShopPurchaseConfirm, cancelShopPurchaseConfirm, confirmShopPurchase } = systems.shopConfirm;
  const {
    equipGearFromBag, replaceEquippedGear, unequipGear, sellBagGear, dismantleBagGear, salvageBagGear,
    grantGearSafely, grantSealSafely, claimRewardStashItem, enhanceGear,
  } = systems.equipmentInventory;
  const {
    resolveGearLocation, getAffixTransferCost, validateAffixTransfer, previewAffixTransfer,
    cancelAffixTransferPreview, commitAffixTransfer,
  } = systems.affixTransfer;
  const {
    pickHeroSkill, getLearnedSkillKeys, rollW10BranchChoices, selectW10BreakthroughSkill,
    pickW10BreakthroughBranch,
  } = systems.w10;
  const {
    isW20PreselectOpen, isW20BossIntelRevealed, getW20BossIntel, isW30BossIntelRevealed, getW30BossIntel,
    getW30BattleState, getRecommendedW20Direction, selectW20PreselectDirection,
    lockW20DirectionForBattle, getValidW20EnhancementPool, getW20RerollCost, drawW20CandidateGroup,
    initW20EnhancementDraft, rerollW20Enhancements, pickW20Enhancement,
  } = systems.w20;
  const { rollPerkChoices, pickPerk, pickChestGearChoices, grantGear, pickGearReward } = systems.rewards;
  const {
    getDestinyConfig, getDestinyBetBand, rollDestinyQuality, rollDestinyCategories,
    isAllEquippedSealsMaxed, isSealKindCurrentlyMaxed, getAvailableDestinyEnhancements,
    getPendingDestinyOffer, rollDestinyGamble, claimDestinyReward, autoClaimPendingDestinyReward,
  } = systems.destiny;
  const {
    getWavePhaseMeta, getW22To24Theme, getW25To28Pool, rollW25To28Encounter, getWaveEncounterInfo,
    getEndgameOmenState, buildWaveQueue, startWave, getTelemetryReport, getMonotonicNowMs,
    setMonotonicClockForTest, syncW29FinalPrepStart, syncW29FinalPrepClock, isCancelablePrepModal,
    closeCancelablePrepModals, startW30Early, resolveW29FinalPrepTimeout, enterW29FinalPrep, startNewRun,
    completeWaveClear, finishGame, tick,
  } = systems.run;
  const { screenToWorld, worldToScreen } = viewport;
  const {
    queueModal, openNextModal, closeModal, renderShopConfirmModal, openW20PreselectModal,
    openW20BreakthroughModal, openMetaLegacyModal, renderMetaLegacyModal, showIntroModal, showEndModal,
    openDestinyGambleModal, renderDestinyGambleModal, openAffixTransferModal, renderAffixTransferModal,
  } = ui.modals;
  const { toggleBattleHud, toggleLeftHud } = ui.hud;

  // Keep the published argument order and options when calling the Meta system.
  function saveMetaSave(opts = {}){ return meta.saveMetaSave(undefined, opts); }
  function setMetaLoadout({ main, aux } = {}){ return meta.setMetaLoadout(main, aux); }
  function buildActiveRunPools(loadout = null, saveState = null){ return meta.buildActiveRunPools(saveState, loadout); }
  function checkEligibleNewMilestones(victory, g = runtimeCtx.game, save = meta.getMetaSave()){
    return meta.checkEligibleNewMilestones(victory, save, g);
  }

  function getSourceStageForWave(wave = runtimeCtx.game?.wave || 1){ return queries.getSourceStageForWave(wave); }
  function getSourceStageSpec(stage = 1){ return queries.getSourceStageSpec(stage); }
  function perkLv(k){ return queries.perkLv(runtimeCtx.game, k); }
  function hasCombo(k){ return queries.hasCombo(runtimeCtx.game, k); }
  function getW20ActiveState(){ return queries.getW20ActiveState(runtimeCtx.game); }
  function hasW20Direction(dirKey){ return queries.hasW20Direction(runtimeCtx.game, dirKey); }
  function hasW20Enhancement(enhKey){ return queries.hasW20Enhancement(runtimeCtx.game, enhKey); }
  function hasDestinyEnhancement(key){ return queries.hasDestinyEnhancement(runtimeCtx.game, key); }
  function getOwnedDestinyEnhancements(){ return queries.getOwnedDestinyEnhancements(runtimeCtx.game); }
  function isFinalPrepActionLocked(){ return runtimeCtx.isFinalPrepActionLocked(); }
  function hasPendingW29WaveRewards(){ return queries.hasPendingW29WaveRewards(runtimeCtx.game); }
  function getFinalPrepState(){ return queries.getFinalPrepState(runtimeCtx.game); }

  return {
    version: '0.60.0-stage6',
    releaseTag: 'v0.60-complete',
    get game(){ return runtimeCtx.game; },
    get cam(){ return viewport.cam; },
    get perf(){
      const game = runtimeCtx.game;
      return { ...perfStats, enemies: game?.enemies.length || 0, projectiles: game?.projectiles.length || 0 };
    },
    loadTestPreset, exportBuildPreset, importBuildPreset,
    startNewRun, startWave, completeWaveClear, finishGame, enterW29FinalPrep,
    rollShop, buyShopItem, sellSeal, sellSubSeal, chooseSealRoute,
    sellBagGear, dismantleBagGear, salvageBagGear, enhanceGear,
    equipGearFromBag, replaceEquippedGear, unequipGear,
    castHeroDash, castHeroOverdrive, pickHeroSkill, pickGearReward,
    grantGear, gearBase, gearStar, gearLabel, findGearStackTarget, GEAR_STAR_MULT, GEAR_SALVAGE_GOLD,
    getSourceStageForWave, getSourceStageSpec, rollGearSlotsCount, rollGearAffixes, validateGearAffixes,
    createGearInstance, normalizeGearInstance, isGearInstance, describeGearInstance,
    evaluateItemSynergies, evaluateEquipmentSynergies, recomputeEquipmentSynergies, getActiveGearAffixSynergies, getGearSynergyHints,
    getShopElemBuyCount, calcShopGearPrice, getGearSellGold, getGearDismantleMaterials, getGearEnhanceCost,
    gainHeroXp, damageHero, dealDamage, spawnEnemy, spawnPosAroundHero, xpForLevel,
    getActiveUnlockNode, getUnlockedSkillPool, hasPendingDecision,
    getRealm, getRealmStageLabel, getSealStarCap, getSubSealSlotCap, getShopTier,
    getLearnedSkillKeys, rollW10BranchChoices, selectW10BreakthroughSkill, pickW10BreakthroughBranch,
    // Stage 3: W16-W19 Preselect, W19 Boss Intel, W20 Breakthrough & Paid Reroll, W22-W28 Encounters & W28 Omen
    isW20PreselectOpen, isW20BossIntelRevealed, getW20BossIntel, getRecommendedW20Direction,
    selectW20PreselectDirection, lockW20DirectionForBattle, openW20PreselectModal,
    getValidW20EnhancementPool, getW20RerollCost, drawW20CandidateGroup,
    initW20EnhancementDraft, rerollW20Enhancements, pickW20Enhancement, openW20BreakthroughModal,
    getW20ActiveState, hasW20Direction, hasW20Enhancement,
    getW22To24Theme, getW25To28Pool, rollW25To28Encounter, getWaveEncounterInfo, getEndgameOmenState,
    // Stage 4: Destiny Gamble, Safe Claim Paths, Affix Transfer Workbench & W21-W29 Endgame Refinement
    getBagCapacity, isBagSeal, grantGearSafely, grantSealSafely, claimRewardStashItem,
    getEndgameRefinementConfig, getEnemyMaterialDrop, getWaveClearMaterialBonus,
    getDestinyConfig, getDestinyBetBand, rollDestinyQuality, rollDestinyCategories,
    isAllEquippedSealsMaxed, isSealKindCurrentlyMaxed, hasDestinyEnhancement, getOwnedDestinyEnhancements, getAvailableDestinyEnhancements,
    rollDestinyGamble, getPendingDestinyOffer, claimDestinyReward, autoClaimPendingDestinyReward,
    openDestinyGambleModal, renderDestinyGambleModal,
    resolveGearLocation, getAffixTransferCost, validateAffixTransfer, previewAffixTransfer, cancelAffixTransferPreview, commitAffixTransfer,
    openAffixTransferModal, renderAffixTransferModal,
    // Stage 5: W29 Real-Time Final Prep, Full-Boundary Transaction Lock, Shop Confirm Draft, W30 Boss Intel & 3-Phase Signature Lock
    isFinalPrepActionLocked, hasPendingW29WaveRewards, getFinalPrepState, syncW29FinalPrepStart,
    syncW29FinalPrepClock, getMonotonicNowMs, setMonotonicClockForTest, setPaused,
    isCancelablePrepModal, closeCancelablePrepModals,
    startW30Early, resolveW29FinalPrepTimeout,
    openShopPurchaseConfirm, confirmShopPurchase, cancelShopPurchaseConfirm, renderShopConfirmModal,
    isW30BossIntelRevealed, getW30BossIntel, getW30BattleState, spawnHealOrb,
    // Stage 6: Meta Progression, Fixed 4-Pt Budget, Anti-Dilution Pools, Versioned Persistence, Anti-Farm Rewards & Real Attribution
    getMetaConfig, getMetaMainSpec, getMetaAuxSpec, getMetaPackSpec,
    createDefaultMetaSave, normalizeMetaSave, migrateMetaSave, loadMetaSave, saveMetaSave, getMetaSave,
    getMetaStorageStatus, exportRawCorruptedMetaSave, retryPendingMetaSave,
    resetMetaSave, exportMetaSave, importMetaSave,
    getMetaLoadoutBudget, isMetaLoadoutLocked, setMetaMainLegacy, toggleMetaAuxLegacy, setMetaLoadout, unlockMetaItem,
    lockMetaLoadoutForRun, getActiveMetaLoadout, getActiveMetaMain, hasMetaAux,
    buildActiveRunPools, syncRunActivePools, getActiveRunGearKeys, getActiveRunAffixKeys,
    getMainLegacyWeightTable, pickWeightedByMainLegacy, pickShopGearBaseKey,
    calculateRunShardRewards, checkEligibleNewMilestones, settleRunMetaRewards,
    getCombatLogNowSec, getRecentThreatSummary, syncRunResourceAccounting,
    changeGold, changeMaterials, changeTransferTokens, getResourceLedger,
    openMetaLegacyModal, renderMetaLegacyModal, showIntroModal, showEndModal,
    applyFireMark, triggerFireDetonation, applyFrostSlow, triggerFrostPulse, gainFrostShield, getHeroMaxFrostShield,
    rollPerkChoices, pickPerk, refreshCombos, hasCombo, perkLv,
    getWavePhaseMeta, buildWaveQueue, pickChestGearChoices, getTelemetryReport,
    tick, stepFrame, closeModal, openNextModal, queueModal,
    getSynergyCounts, getSealStats, getHeroStats, worldToScreen, screenToWorld,
    getGearSetCounts, getActiveGearSets, gearSetTier, getActiveDualResonances, hasDualRes, isEnemyUnstoppable, toggleLeftHud, toggleBattleHud,
    BALANCE, UNLOCK_NODES, W10_SKILL_BRANCHES, W20_DIRECTIONS, W20_ENHANCEMENTS, W20_BOSS_AUX_POOL, W30_BOSS_AUX_POOL,
    DESTINY_ENHANCEMENTS, DESTINY_SPECIAL_BOONS, DESTINY_PILLS,
    REALMS, SHRINE_WAVES, ARTIFACTS, SUB_SEAL_RESONANCE, SEAL_SPECIALIZATIONS,
    ELEMENTS, GEARS, BASE_GEAR_KEYS, GEAR_SETS, GEAR_AFFIXES, BASE_AFFIX_KEYS, GEAR_SYNERGIES, SOURCE_STAGES, DUAL_RESONANCES, HERO_SKILLS, COMBOS, PERKS, PILLS, MAIN_WAVES, W, H, MAX_ENEMIES
  };
}

export function attachPublicGameApi(api, targetWindow = window) {
  targetWindow.BG60 = api;
  targetWindow.BG52 = api;
}
