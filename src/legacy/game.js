import BALANCE from '../data/balance.js';
import AudioKit from '../ui/audio/audio.js';
import { createCanvasRenderer } from '../ui/canvas/index.js';
import { createFeedbackUI } from '../ui/feedback/feedback.js';
import { createVfxManager } from '../ui/vfx/vfx.js';
import { clamp, xpForLevel } from '../core/math.js';
import { createRuntimeContext } from '../core/runtime-context.js';
import { createMetaSystem } from '../systems/meta/index.js';
import { createAffixTransfer, createEquipmentCore, createEquipmentInventory } from '../systems/equipment/index.js';
import { createEconomyCore, createShopConfirm, createShopSystem } from '../systems/economy/index.js';
import { createUnlockSystem, createW10Breakthrough, createW20Breakthrough, createRewardsSystem, createDestinyGamble } from '../systems/progression/index.js';
import { createHeroStats, createHeroSkills, createHeroVitals } from '../systems/hero/index.js';
import { createCombatSystem } from '../systems/combat/index.js';
import { createRunSystem } from '../systems/run/index.js';
import {
  getSourceStageForWave as queryGetSourceStageForWave,
  getSourceStageSpec as queryGetSourceStageSpec,
  perkLv as queryPerkLv,
  hasCombo as queryHasCombo,
  getW20ActiveState as queryGetW20ActiveState,
  hasW20Direction as queryHasW20Direction,
  hasW20Enhancement as queryHasW20Enhancement,
  hasDestinyEnhancement as queryHasDestinyEnhancement,
  getOwnedDestinyEnhancements as queryGetOwnedDestinyEnhancements,
  isFinalPrepActionLocked as queryIsFinalPrepActionLocked,
  isW29WaveRewardModal as queryIsW29WaveRewardModal,
  hasPendingW29WaveRewards as queryHasPendingW29WaveRewards,
  getFinalPrepState as queryGetFinalPrepState,
} from '../core/state-queries.js';
import {
  W,
  H,
  MAIN_WAVES,
  MAX_ENEMIES,
  HERO_GEAR_SLOTS,
  SHRINE_WAVES,
  ELEMENTS,
  UNLOCK_NODES,
  REALMS,
  SEAL_TIER_NAMES,
  SEAL_FUSE_NEED,
  ARTIFACTS,
  SUB_SEAL_RESONANCE,
  SEAL_SPECIALIZATIONS,
  COMBOS,
  COMBO_LIST,
  PERKS,
  PILLS,
  HERO_SKILLS,
  W10_SKILL_BRANCHES,
  GEAR_SETS,
  DUAL_RESONANCES,
  GEARS,
  BASE_GEAR_KEYS,
  GEAR_RARITY_LABELS,
  GEAR_SALVAGE_GOLD,
  SOURCE_STAGES,
  GEAR_STAR_MULT,
  GEAR_AFFIXES,
  GEAR_AFFIX_KEYS,
  BASE_AFFIX_KEYS,
  GEAR_SYNERGIES,
  W20_BOSS_AUX_POOL,
  W30_BOSS_AUX_POOL,
  W20_DIRECTIONS,
  W20_DIRECTION_KEYS,
  W20_ENHANCEMENTS,
  DESTINY_ENHANCEMENTS,
  DESTINY_SPECIAL_BOONS,
  DESTINY_PILLS,
} from '../data/index.js';

(() => {
'use strict';

let game = null;
let paused = false;
const runtimeCtx = createRuntimeContext({
  onGameChange: nextGame => { game = nextGame; },
  onPausedChange: nextPaused => { paused = nextPaused; },
});
const { counters } = runtimeCtx;

function getSourceStageForWave(wave = game?.wave || 1){ return queryGetSourceStageForWave(wave); }
function getSourceStageSpec(stage = 1){ return queryGetSourceStageSpec(stage); }

function getMetaStorage(){
  try {
    if (window && window.localStorage && typeof window.localStorage.getItem === 'function' && typeof window.localStorage.setItem === 'function') {
      return window.localStorage;
    }
  } catch (_) {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch (_) {}
  return null;
}

const metaSystem = createMetaSystem(runtimeCtx);
const {
  getMetaConfig,
  getMetaMainSpec,
  getMetaAuxSpec,
  getMetaPackSpec,
  createDefaultMetaSave,
  getMetaLoadoutBudget,
  normalizeMetaSave,
  migrateMetaSave,
  getMetaStorageStatus,
  exportRawCorruptedMetaSave,
  loadMetaSave,
  saveMetaSave: writeMetaSave,
  getMetaSave,
  resetMetaSave,
  exportMetaSave,
  importMetaSave,
  isMetaLoadoutLocked,
  setMetaMainLegacy,
  toggleMetaAuxLegacy,
  setMetaLoadout: setMetaLoadoutFromIds,
  unlockMetaItem,
  buildActiveRunPools: buildMetaPools,
  syncRunActivePools,
  getActiveRunGearKeys,
  getActiveRunAffixKeys,
  getActiveMetaLoadout,
  getActiveMetaMain,
  hasMetaAux,
  lockMetaLoadoutForRun,
  getMainLegacyWeightTable,
  pickWeightedByMainLegacy,
  calculateRunShardRewards,
  checkEligibleNewMilestones: findNewMetaMilestones,
  settleRunMetaRewards,
  retryPendingMetaSave,
} = metaSystem;

const equipmentCore = createEquipmentCore(runtimeCtx, metaSystem);
const {
  isGearInstance,
  gearBase,
  gearStar,
  gearLabel,
  findGearStackTarget,
  validateGearAffixes,
  ownedGearStar,
  rollGearSlotsCount,
  rollGearAffixes,
  createGearInstance,
  normalizeGearInstance,
  evaluateSynergySetFromAffixIds,
  evaluateItemSynergies,
  buildChainHint,
  evaluateEquipmentSynergies,
  recomputeEquipmentSynergies,
  getActiveGearAffixSynergies,
  getGearSynergyHints,
  describeGearEffect,
  describeGearInstance,
} = equipmentCore;

const unlockSystem = createUnlockSystem(runtimeCtx);
const {
  getActiveUnlockNode,
  getRealm,
  getRealmStageLabel,
  getUnlockedSkillPool,
  getSealStarCap,
  getSubSealSlotCap,
  getShopTier,
  hasPendingDecision,
} = unlockSystem;

const heroStats = createHeroStats(runtimeCtx, { unlock: unlockSystem, meta: metaSystem });
const {
  getSynergyCounts,
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
} = heroStats;

const economyCore = createEconomyCore(runtimeCtx, { meta: metaSystem, equipment: equipmentCore });
const {
  recordResourceFlow,
  changeGold,
  changeMaterials,
  changeTransferTokens,
  getResourceLedger,
  resetRunMetricsResourceBaseline,
  syncRunResourceAccounting,
  getShopElemBuyCount,
  calcShopGearPrice,
  pickShopGearBaseKey,
  getGearSellGold,
  getGearDismantleMaterials,
  getGearEnhanceCost,
  getBagCapacity,
  hasBagSpace,
  isBagSeal,
  getEndgameRefinementConfig,
  getEnemyMaterialDrop,
  getWaveClearMaterialBonus,
} = economyCore;

const combatSystem = createCombatSystem(runtimeCtx, {
  meta: metaSystem,
  equipment: equipmentCore,
  hero: heroStats,
  economy: economyCore,
  heroVitals: { damageHero: (...args) => heroVitals.damageHero(...args) },
  run: { completeWaveClear: (...args) => runSystem.completeWaveClear(...args) },
});
const {
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
  spawnPosAroundHero,
  spawnEnemy,
  spawnHealOrb,
  triggerW30BossSignature,
  enterW30BossFinalPhase,
  isEnemyUnstoppable,
  applyHeroLifesteal,
  dealDamage,
  onEnemyKilled,
  fireChainLightning,
  pushProjectile,
  triggerSealOnHeroHit,
  pointToSegDist,
} = combatSystem;

const heroVitals = createHeroVitals(runtimeCtx, {
  meta: metaSystem,
  unlock: unlockSystem,
  equipment: equipmentCore,
  hero: heroStats,
  combat: combatSystem,
  run: { finishGame: (...args) => runSystem.finishGame(...args) },
});
const { gainHeroXp, getCombatLogNowSec, getRecentThreatSummary, damageHero } = heroVitals;

const heroSkills = createHeroSkills(runtimeCtx, {
  meta: metaSystem, equipment: equipmentCore, hero: heroStats, combat: combatSystem,
});
const { executeBreakerShockwave, castHeroDash, castHeroOverdrive, pickAimTarget } = heroSkills;

const shopSystem = createShopSystem(runtimeCtx, {
  meta: metaSystem,
  equipment: equipmentCore,
  economy: economyCore,
  unlock: unlockSystem,
  hero: heroVitals,
  combat: combatSystem,
});
const { rollShop, checkShopAutoRestock, sealTotalPoints, chooseSealRoute, buyShopItem, sellSeal, sellSubSeal } = shopSystem;

const shopConfirm = createShopConfirm(runtimeCtx, { buyShopItem });
const { openShopPurchaseConfirm, cancelShopPurchaseConfirm, confirmShopPurchase } = shopConfirm;

const equipmentInventory = createEquipmentInventory(runtimeCtx, {
  equipment: equipmentCore, economy: economyCore, unlock: unlockSystem, hero: heroStats,
});
const {
  equipGearFromBag,
  replaceEquippedGear,
  unequipGear,
  sellBagGear,
  dismantleBagGear,
  salvageBagGear,
  grantGearSafely,
  grantSealSafely,
  claimRewardStashItem,
  enhanceGear,
} = equipmentInventory;

const affixTransfer = createAffixTransfer(runtimeCtx, {
  equipment: equipmentCore, economy: economyCore, hero: heroStats,
});
const {
  resolveGearLocation,
  getAffixTransferCost,
  validateAffixTransfer,
  describeTransferError,
  previewAffixTransfer,
  cancelAffixTransferPreview,
  commitAffixTransfer,
} = affixTransfer;

const {
  getW10BranchSpec,
  pickHeroSkill,
  getLearnedSkillKeys,
  rollW10BranchChoices,
  selectW10BreakthroughSkill,
  pickW10BreakthroughBranch,
} = createW10Breakthrough(runtimeCtx, { meta: metaSystem, unlock: unlockSystem, hero: heroStats });

const w20Breakthrough = createW20Breakthrough(runtimeCtx, { equipment: equipmentCore, economy: economyCore });
const {
  isW20PreselectOpen,
  isW20BossIntelRevealed,
  getW20BossIntel,
  isW30BossIntelRevealed,
  getW30BossIntel,
  getW30BattleState,
  getRecommendedW20Direction,
  selectW20PreselectDirection,
  lockW20DirectionForBattle,
  getValidW20EnhancementPool,
  getW20RerollCost,
  drawW20CandidateGroup,
  initW20EnhancementDraft,
  rerollW20Enhancements,
  pickW20Enhancement,
} = w20Breakthrough;

const { rollPerkChoices, pickPerk, pickChestGearChoices, grantGear, pickGearReward } = createRewardsSystem(runtimeCtx, {
  meta: metaSystem,
  equipment: { createGearInstance, grantGearSafely },
  economy: economyCore,
  hero: heroStats,
});

const destinySystem = createDestinyGamble(runtimeCtx, {
  meta: metaSystem,
  unlock: unlockSystem,
  equipment: { createGearInstance, evaluateItemSynergies, getGearSynergyHints, describeGearEffect, grantGearSafely, grantSealSafely },
  economy: economyCore,
  hero: { syncHeroMaxHp, gainHeroXp },
  combat: combatSystem,
});
const {
  getDestinyConfig,
  getDestinyBetBand,
  rollDestinyQuality,
  rollDestinyCategories,
  isAllEquippedSealsMaxed,
  isSealKindCurrentlyMaxed,
  getAvailableDestinyEnhancements,
  buildDestinyCandidate,
  getPendingDestinyOffer,
  rollDestinyGamble,
  applyDestinyPillReward,
  claimDestinyReward,
  autoClaimPendingDestinyReward,
} = destinySystem;

const runSystem = createRunSystem(runtimeCtx, {
  meta: metaSystem,
  unlock: unlockSystem,
  equipment: { ...equipmentCore, ...affixTransfer },
  economy: { ...economyCore, ...shopSystem, ...shopConfirm },
  hero: { ...heroStats, ...heroVitals, ...heroSkills },
  progression: { ...w20Breakthrough, ...destinySystem },
  combat: combatSystem,
});
const {
  makeGame,
  getWavePhaseMeta,
  getW22To24Theme,
  getW25To28Pool,
  rollW25To28Encounter,
  getWaveEncounterInfo,
  getEndgameOmenState,
  buildWaveQueue,
  startWave,
  finalizeCurrentTelemetry,
  getTelemetryReport,
  beginWaveHarvest,
  getMonotonicNowMs,
  setMonotonicClockForTest,
  syncW29FinalPrepStart,
  syncW29FinalPrepClock,
  isCancelablePrepModal,
  closeCancelablePrepModals,
  closeAllPrepModals,
  startW30Early,
  resolveW29FinalPrepTimeout,
  enterW29FinalPrep,
  startNewRun,
  completeWaveClear,
  finishGame,
  tick,
} = runSystem;

// Keep the published BG60 argument order and options when calling the Meta system.
function saveMetaSave(opts = {}){
  return writeMetaSave(undefined, opts);
}
function setMetaLoadout({ main, aux } = {}){
  return setMetaLoadoutFromIds(main, aux);
}
function buildActiveRunPools(loadout = null, saveState = null){
  return buildMetaPools(saveState, loadout);
}
function checkEligibleNewMilestones(victory, g = game, save = getMetaSave()){
  return findNewMetaMilestones(victory, save, g);
}

const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const perfStats = { fps: 60, frameCount: 0, fpsTimer: 0, culledTiles: 0, culledProps: 0 };
const vfxManager = createVfxManager(runtimeCtx);
const feedbackUI = createFeedbackUI({ getEl: $ });
const canvasRenderer = createCanvasRenderer(runtimeCtx, {
  canvas, ctx, getEl: $, perfStats, hero: heroStats, unlock: unlockSystem, combat: combatSystem,
});
const { addRing, addFloat, updateVfx } = vfxManager;
const { toast, showBanner, setDangerVignette, flashScreen, hideTransientFeedback } = feedbackUI;
const { cam, fitCamera, updateCamera, resetCamera, screenToWorld, worldToScreen, render } = canvasRenderer;

// Bind adapters before the initial Meta load. Viewport and input are read on demand.
runtimeCtx.bindPorts({
  storage: { getStorage: getMetaStorage },
  audio: { play: AudioKit.play.bind(AudioKit), unlock: AudioKit.unlock.bind(AudioKit) },
  vfx: { addRing, addFloat, update: updateVfx },
  ui: {
    toast, showBanner, flashScreen, renderAllUI, setDangerVignette, setPaused,
    resetRunUI() {
      lastShopKey = lastSynKey = lastBagKey = lastInspKey = lastArtKey = lastSkillKey = lastLeftHudKey = lastBattleHudKey = '';
      hideTransientFeedback();
    },
  },
  modals: {
    queueModal, closeModal, openNextModal, showEndModal, showIntroModal,
    openW20PreselectModal, openDestinyGambleModal, openAffixTransferModal, openMetaLegacyModal,
    renderW10BreakthroughModal, renderW20PreselectModal, renderW20BreakthroughModal,
    renderDestinyGambleModal, renderAffixTransferModal, renderShopConfirmModal, renderW30EarlyConfirmModal,
    renderMetaLegacyModal,
    hideBackdrop: () => { $('modalBackdrop').hidden = true; },
  },
  viewport: {
    screenToWorld, worldToScreen, getCamera: () => cam, updateCamera,
    resetCamera,
  },
  clock: {
    syncLoopTimestamp: nowMs => { if (typeof lastTs !== 'undefined') lastTs = nowMs; },
  },
  input: {
    getKeys: () => keys,
    getPointerScreen: () => pointerScreen,
    getPointerWorld: () => pointerWorld,
    setPointerWorld: pt => { pointerWorld = pt; },
    isPointerDown: () => pointerDown,
  },
});
loadMetaSave();

function getSkillBreakdown(key, lv, hs){
  const spec = HERO_SKILLS[key];
  const nextLv = lv < 5 ? lv + 1 : null;
  const sm = hs.skillDmgMult || hs.dmgMult;
  const rm = hs.skillRangeMult || hs.rangeMult;
  const cdM = hs.skillCdMult || 1;
  const br = getW10BranchSpec(key);
  const brNote = br ? ` · 【W10:${br.name}】` : '';
  if (key === 'blades') {
    const dmg = Math.round((15 + lv * 7) * sm);
    const cnt = lv + 1 + (br?.key === 'bl_twin_orbit' ? 2 : 0);
    const rad = ((1.65 + lv * 0.10) * rm).toFixed(2);
    const nDmg = nextLv ? Math.round((15 + nextLv * 7) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `${cnt} 把飞刃 · 单次 ${dmg} 伤（基础${15+lv*7}×${Math.round(sm*100)}%）· 半径 ${rad}格${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：飞刃 ${cnt}→${nextLv+1} 把，单次 ${dmg}→${nDmg} 伤，转速与半径提升` : '已满级 Lv.5'
    };
  }
  if (key === 'firewave') {
    const dmg = Math.round((26 + lv * 13) * sm);
    const cnt = Math.min(4, Math.ceil(lv / 2) + 1) + hs.gm.extraShot;
    const cd = (Math.max(0.75, 1.45 - lv * 0.14) * cdM / hs.aspd).toFixed(2);
    const nCnt = nextLv ? Math.min(4, Math.ceil(nextLv / 2) + 1) + hs.gm.extraShot : 0;
    const nDmg = nextLv ? Math.round((26 + nextLv * 13) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `${cnt} 道穿透剑气 · 单次 ${dmg} 伤 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：剑气 ${cnt}→${nCnt} 道，单次 ${dmg}→${nDmg} 伤，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'thunder') {
    const dmg = Math.round((30 + lv * 15) * sm);
    const strikes = lv + 1;
    const cd = (Math.max(0.75, 1.65 - lv * 0.18) * cdM / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((30 + nextLv * 15) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `召唤 ${strikes} 道 3连天雷 · 单次 ${dmg} 伤 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：落雷 ${strikes}→${nextLv+1} 道，单次 ${dmg}→${nDmg} 伤，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'nova') {
    const dmg = Math.round((25 + lv * 13) * sm);
    const rad = ((1.95 + lv * 0.24) * rm * (br?.key === 'nv_glacial_bastion' ? 1.25 : 1)).toFixed(2);
    const cd = (Math.max(1.45, 2.25 - lv * 0.16) * cdM * (br?.key === 'nv_trail_aegis' ? 0.75 : 1) / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((25 + nextLv * 13) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `冰环半径 ${rad}格 · 单次 ${dmg} 伤 + 减速 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：单次 ${dmg}→${nDmg} 伤，半径扩大，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'stomp') {
    const dmg = Math.round((40 + lv * 20) * sm);
    const rad = ((2.00 + lv * 0.24) * rm * (br?.key === 'st_glacier_quake' ? 1.25 : 1)).toFixed(2);
    const cd = (Math.max(1.60, 2.45 - lv * 0.17) * cdM / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((40 + nextLv * 20) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `震荡半径 ${rad}格 · 单次 ${dmg} 伤 + 0.75s 晕眩 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：单次 ${dmg}→${nDmg} 伤，范围更大，冷却缩短` : '已满级 Lv.5'
    };
  }
  return {
    name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
    cur: `攻速 +${lv*18}% · 暴击 +${lv*8}% · 移速 +${(lv*0.35).toFixed(2)} · 吸血 +${lv*2} · 磁铁 +${(lv*0.85).toFixed(1)}格${br ? ` · ${br.tag}` : ''}`,
    next: nextLv ? `升至 Lv.${nextLv}：攻速 +${nextLv*18}%、暴击 +${nextLv*8}%、吸血 +${nextLv*2}、磁铁再扩` : '已满级 Lv.5'
  };
}

/* ==================== AUDIO ENGINE ==================== */


/* ==================== STATE & HELPERS ==================== */
const keys = new Set();
let pointerDown = false;
let pointerScreen = null;
let pointerWorld = null;

// UI dirty-tracking keys to guarantee ZERO DOM flicker
let lastShopKey = '', lastSynKey = '', lastBagKey = '', lastInspKey = '', lastArtKey = '', lastSkillKey = '', lastLeftHudKey = '', lastBattleHudKey = '';
let compactHudMode = null;

function perkLv(k){ return queryPerkLv(game, k); }
function hasCombo(k){ return queryHasCombo(game, k); }

/* ==================== CROSS-STAGE COMBAT STATE HOOKS (W10 / GEAR / W20 SHARED) ==================== */
function getW20ActiveState(){ return queryGetW20ActiveState(game); }
function hasW20Direction(dirKey){ return queryHasW20Direction(game, dirKey); }
function hasW20Enhancement(enhKey){ return queryHasW20Enhancement(game, enhKey); }

function hasDestinyEnhancement(key){ return queryHasDestinyEnhancement(game, key); }
function getOwnedDestinyEnhancements(){ return queryGetOwnedDestinyEnhancements(game); }

/* ==================== STAGE 5: W29 FINAL PREP ATOMIC MUTEX LOCK & SHOP CONFIRM DRAFT ==================== */
function isFinalPrepActionLocked(){ return queryIsFinalPrepActionLocked(game); }

function renderShopConfirmModal(){
  const draft = game?.shopConfirmDraft;
  const item = draft ? game.shop?.[draft.shopIdx] : null;
  if (!draft || !item || item.bought) { cancelShopPurchaseConfirm(); return; }
  const box = $('modalBox');
  const w29Note = game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备倒计时继续运行 (${Math.ceil(game.finalPrep.timer)}s)</span>` : '';
  let detailLine = '';
  if (item.itemType === 'pill') {
    const p = PILLS[item.pillKey];
    detailLine = p ? `${p.icon} ${p.name}：${p.desc}` : draft.label;
  } else if (item.itemType === 'gear' && item.gear) {
    const g = item.gear;
    const stSpec = getSourceStageSpec(g.sourceStage);
    const afTxt = (g.affixes || []).filter(Boolean).map(a => GEAR_AFFIXES[a.id]?.name || a.id).join(' / ') || '无词条';
    detailLine = `${g.icon} ${g.name} [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽] · 词条：${afTxt}`;
  } else {
    const spec = ARTIFACTS[item.kind];
    detailLine = spec ? `${spec.name} ${item.star || 1}★：${spec.desc}` : draft.label;
  }
  box.innerHTML = `
    <h2>🛒 确认购买【${draft.label}】</h2>
    <p class="lead">${detailLine}<br>花费 <strong>💰 ${item.cost} 金币</strong>（当前持有 💰 ${game.gold}）${w29Note}。未确认的草稿在倒计时归零时自动清空、零扣款。</p>
    <div class="modal-footer">
      <button class="btn" id="shopConfirmCancelBtn" type="button">取消（零扣款）</button>
      <button class="btn gold" id="shopConfirmBuyBtn" type="button" ${game.gold < item.cost ? 'disabled' : ''}>确认购买（💰${item.cost}）</button>
    </div>
  `;
  box.querySelector('#shopConfirmCancelBtn')?.addEventListener('click', () => { cancelShopPurchaseConfirm(); renderAllUI(true); });
  box.querySelector('#shopConfirmBuyBtn')?.addEventListener('click', () => { confirmShopPurchase(); });
  $('modalBackdrop').hidden = false;
}

function isW29WaveRewardModal(m){ return queryIsW29WaveRewardModal(m); }
function hasPendingW29WaveRewards(){ return queryHasPendingW29WaveRewards(game); }
function getFinalPrepState(){ return queryGetFinalPrepState(game); }

function renderW30EarlyConfirmModal(){
  const offer = getPendingDestinyOffer();
  if (!offer) {
    closeModal();
    return;
  }
  const box = $('modalBox');
  const remSec = Math.ceil(game.finalPrep?.timer || 0);
  const choiceNames = offer.choices.map((c, i) => `${i + 1}. ${c.icon || '✨'}${c.name}`).join(' · ');
  box.innerHTML = `
    <h2>⚠️ 尚有未领取的天命赌局奖励</h2>
    <p class="lead">你已赢得天命三选一候选（<strong>${choiceNames}</strong>），尚未领取！<br>
    ⏳ W29 整备倒计时继续运行（剩余 <strong>${remSec}s</strong>）。你可以先完成三选一领取，或明确接受从这 3 件中<strong>随机安全领取 1 件</strong>并立即迎战 W30 深渊主宰！</p>
    <div class="modal-footer" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn" id="w30EarlyBackBtn" type="button">返回整备</button>
      <button class="btn gold" id="w30EarlyClaimBtn" type="button">🎲 先去三选一领取</button>
      <button class="btn danger" id="w30EarlyRandomBtn" type="button">⚡ 接受随机领取并立即开战 W30</button>
    </div>
  `;
  box.querySelector('#w30EarlyBackBtn')?.addEventListener('click', () => { closeModal(); renderAllUI(true); });
  box.querySelector('#w30EarlyClaimBtn')?.addEventListener('click', () => { openDestinyGambleModal(); });
  box.querySelector('#w30EarlyRandomBtn')?.addEventListener('click', () => { startW30Early({ acceptRandomClaim: true }); });
  $('modalBackdrop').hidden = false;
}

/* ==================== MODALS (STARTER, LEVEL-UP, W10 BREAKTHROUGH, CHEST, PERK, INTRO, META, END) ==================== */
function queueModal(m){
  game.pendingModals.push(m);
  if (game.autoWave && game.phase === 'prep') {
    game.autoWavePausedForDecision = true;
  }
  if (!game.activeModal) openNextModal();
}

function openNextModal(){
  if (!game.pendingModals.length) {
    // If W10 or W20 breakthrough is still pending and no modal is left in queue, ensure the breakthrough modal opens
    if (game && game.pendingBreakthrough === 'w10' && !game.hero.breakthroughs.w10) {
      game.activeModal = { type: 'w10_breakthrough', step: game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
      renderW10BreakthroughModal();
      return;
    }
    if (game && game.pendingBreakthrough === 'w20' && game.w20Draft) {
      game.activeModal = { type: 'w20_breakthrough' };
      renderW20BreakthroughModal();
      return;
    }
    closeModal();
    return;
  }
  const m = game.pendingModals.shift();
  game.activeModal = m;
  if (m.type === 'starter') renderStarterModal();
  else if (m.type === 'levelup') renderLevelUpModal();
  else if (m.type === 'w10_breakthrough') renderW10BreakthroughModal();
  else if (m.type === 'w20_preselect') renderW20PreselectModal(m);
  else if (m.type === 'w20_breakthrough') renderW20BreakthroughModal();
  else if (m.type === 'chest') renderChestModal(!!m.legend, !!m.shrineTier);
  else if (m.type === 'perk') renderPerkModal(m.quality || 'ren');
  else if (m.type === 'destiny_gamble') renderDestinyGambleModal();
  else if (m.type === 'affix_transfer') renderAffixTransferModal();
  else if (m.type === 'shop_confirm') renderShopConfirmModal();
  else if (m.type === 'w30_early_confirm') renderW30EarlyConfirmModal();
  else if (m.type === 'meta_legacy') renderMetaLegacyModal(m);
}

function closeModal(){
  if (game) game.activeModal = null;
  $('modalBackdrop').hidden = true;
  if (game && game.pendingModals.length) {
    openNextModal();
  } else if (game && game.pendingBreakthrough === 'w10' && !game.hero.breakthroughs.w10) {
    game.activeModal = { type: 'w10_breakthrough', step: game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
    renderW10BreakthroughModal();
  } else if (game && game.pendingBreakthrough === 'w20' && game.w20Draft) {
    game.activeModal = { type: 'w20_breakthrough' };
    renderW20BreakthroughModal();
  } else if (game && game.finalPrep?.active && game.finalPrep.awaitingWaveRewards) {
    syncW29FinalPrepStart();
  }
}

function renderStarterModal(){
  const m = game?.activeModal;
  if (!m || m.type !== 'starter') return;
  const starters = ['blades', 'firewave', 'nova'];
  if (!m.offerId) m.offerId = `starter_${counters.modalOfferSeq++}`;
  if (!Array.isArray(m.choices) || !m.choices.length) m.choices = starters.slice();
  if (typeof m.claimed !== 'boolean') m.claimed = false;
  const hs = getHeroStats();
  const box = $('modalBox');
  box.innerHTML = `
    <h2>⚔️ 选择本命神通 · 开启 30 波秘境守卫</h2>
    <p class="lead">本命神通 + 御剑引子可随鼠标方向指向集火！击败 <strong>W10 首领</strong>后将触发<strong>首次大型突破</strong>，为你选定的主力神通解锁三选一形态质变分支！</p>
    <div class="choices" id="modalChoices"></div>
  `;
  const grid = box.querySelector('#modalChoices');
  for (const k of m.choices) {
    const s = HERO_SKILLS[k];
    if (!s) continue;
    const info = getSkillBreakdown(k, 1, hs);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card';
    card.dataset.choice = k;
    card.innerHTML = `
      <span class="tag">${s.tag} · 本命起手</span>
      <span class="ci">${s.icon}</span>
      <span class="cn">${s.name}</span>
      <span class="cd">${s.desc(1)}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">✨ ${info.cur}</span>
    `;
    card.addEventListener('click', () => pickHeroSkill(k));
    grid.append(card);
  }
  $('modalBackdrop').hidden = false;
}

function renderLevelUpModal(){
  const m = game?.activeModal;
  if (!m || m.type !== 'levelup') return;
  if (!m.offerId) m.offerId = `levelup_${counters.modalOfferSeq++}`;
  if (typeof m.claimed !== 'boolean') m.claimed = false;

  let choices = [];
  if (Array.isArray(m.choices) && m.choices.length) {
    choices = m.choices.map(k => HERO_SKILLS[k]).filter(s => s && (game.hero.skills[s.key] || 0) < 5);
  }
  if (!choices.length) {
    const unlockedKeys = getUnlockedSkillPool();
    const pool = unlockedKeys.map(k => HERO_SKILLS[k]).filter(s => s && (game.hero.skills[s.key] || 0) < 5);
    if (!pool.length) { changeGold(20, 'max_skill_pool_bonus'); toast('当前阶段神通池已全满级！额外奖励 +20 金币！'); closeModal(); return; }
    const copy = pool.slice();
    while (choices.length < 3 && copy.length) {
      choices.push(copy.splice(Math.floor(game.rnd() * copy.length), 1)[0]);
    }
    m.choices = choices.map(s => s.key);
  }

  const box = $('modalBox');
  box.innerHTML = `
    <h2>✨ ${getRealmStageLabel()} Lv.${game.hero.lv} · 选择领主神通</h2>
    <p class="lead">普通升级隔一级选一次神通卡，卡池随波次与大型突破分批开放（满级 Lv.5，组合技需两技总等级≥3觉醒）。</p>
    <div class="choices" id="modalChoices"></div>
  `;
  const grid = box.querySelector('#modalChoices');
  const hs = getHeroStats();
  const comboTier = getActiveUnlockNode().comboTier;
  for (const s of choices) {
    const curLv = game.hero.skills[s.key] || 0;
    const nextLv = curLv + 1;
    const nextInfo = getSkillBreakdown(s.key, nextLv, hs);
    const curInfo = curLv > 0 ? getSkillBreakdown(s.key, curLv, hs) : null;
    let comboTag = '';
    for (const c of COMBO_LIST) {
      if (game.hero.combos[c.key] || c.realm > comboTier) continue;
      if (c.req.includes(s.key)) {
        const other = c.req.find(r => r !== s.key);
        const otherLv = game.hero.skills[other] || 0;
        if (otherLv >= 1) {
          comboTag = (nextLv + otherLv >= 3)
            ? `<span class="combo-tag">✨ 选后立即觉醒【${c.name}】</span>`
            : `<span class="combo-tag">✨ 可凑【${c.name}】(${nextLv+otherLv}/3)</span>`;
          break;
        }
      }
    }
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card';
    card.dataset.choice = s.key;
    card.innerHTML = `
      <span class="tag">${s.tag} · ${curLv ? `Lv.${curLv} → Lv.${nextLv}` : '新习得 Lv.1'}</span>
      ${comboTag}
      <span class="ci">${s.icon}</span>
      <span class="cn">${s.name}</span>
      <span class="cd">${s.desc(nextLv)}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">✨ 选后效果：${nextInfo.cur}</span>
      ${curInfo ? `<span class="cd" style="color:#a9c4be;font-size:10.5px">当前：${curInfo.cur}</span>` : ''}
    `;
    card.addEventListener('click', () => pickHeroSkill(s.key));
    grid.append(card);
  }
  $('modalBackdrop').hidden = false;
}

/* ==================== W10 FIRST MAJOR BREAKTHROUGH (DESIGNATE LEARNED SKILL -> 3 RANDOM BRANCHES) ==================== */
function renderW10BreakthroughModal(){
  const h = game.hero;
  const box = $('modalBox');
  const learned = getLearnedSkillKeys();

  if (!game.w10Draft || !game.w10Draft.skillKey) {
    box.innerHTML = `
      <h2>⚡ W10 首次大型突破 · 第一步：指定主力神通</h2>
      <p class="lead">你已斩杀第 10 波首领并取得<strong>突破凭证</strong>！请从<strong>已学会的神通</strong>中指定 1 门主力神通，随后从其随机 3 个形态质变分支中择一突破（突破后同时解锁 <strong>主印 4★ 上限 + 第 2 辅印槽</strong>）！</p>
      <div class="choices" id="modalChoices"></div>
    `;
    const grid = box.querySelector('#modalChoices');
    const hs = getHeroStats();
    for (const k of learned) {
      const s = HERO_SKILLS[k];
      const lv = h.skills[k] || 1;
      const info = getSkillBreakdown(k, lv, hs);
      const branchPool = W10_SKILL_BRANCHES[k] || [];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card epic';
      card.dataset.skill = k;
      card.innerHTML = `
        <span class="tag">${s.tag} · 当前 Lv.${lv}</span>
        <span class="up-tag">⚡ 可突破 (${branchPool.length} 分支池)</span>
        <span class="ci">${s.icon}</span>
        <span class="cn">${s.name}</span>
        <span class="cd">${s.desc(lv)}</span>
        <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">当前数值：${info.cur}</span>
        <span class="cd" style="color:#ffd878;font-size:11px;margin-top:2px">点击指定该神通并抽取 3 个形态分支 →</span>
      `;
      card.addEventListener('click', () => selectW10BreakthroughSkill(k));
      grid.append(card);
    }
    $('modalBackdrop').hidden = false;
    return;
  }

  const skillKey = game.w10Draft.skillKey;
  const s = HERO_SKILLS[skillKey];
  const branches = game.w10Draft.branches || [];
  box.innerHTML = `
    <h2>⚡ W10 首次大型突破 · 第二步：【${s.name}】分支三选一</h2>
    <p class="lead">选择 1 条形态分支永久改变【${s.name}】的攻击形态与跨阶段战斗状态（<strong>火标/引爆</strong> 或 <strong>减速/冰盾</strong>），为后续构装与 W20 二次突破奠定联动基础！</p>
    <div class="choices" id="modalChoices"></div>
    <div class="modal-footer">
      <button class="btn" id="w10BackBtn" type="button">← 重新指定主力神通</button>
    </div>
  `;
  const grid = box.querySelector('#modalChoices');
  for (const b of branches) {
    const hookKind = b.hook || b.hookType;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card epic';
    card.dataset.branch = b.key;
    card.innerHTML = `
      <span class="tag">${b.tag}</span>
      <span class="up-tag">${hookKind === 'fire_mark_detonate' ? '🔥 火标/引爆联动' : '❄️ 减速/冰盾联动'}</span>
      <span class="ci">${b.icon}</span>
      <span class="cn">${b.name}</span>
      <span class="cd">${b.desc}</span>
    `;
    card.addEventListener('click', () => pickW10BreakthroughBranch(b.key));
    grid.append(card);
  }
  box.querySelector('#w10BackBtn')?.addEventListener('click', () => {
    game.w10Draft = null;
    renderW10BreakthroughModal();
  });
  $('modalBackdrop').hidden = false;
}

/* ==================== STAGE 3: W16-W19 PRESELECT, W19 BOSS INTEL & W20 BREAKTHROUGH + PAID REROLL ==================== */
function openW20PreselectModal(opts = {}){
  if (!game) return false;
  if (!isW20PreselectOpen()) {
    toast('W20 二破方向预选在 W16–W20 开战前开放！', true);
    return false;
  }
  // Highlight recommended direction visually if player hasn't clicked any yet (without silently locking)
  game.activeModal = { type: 'w20_preselect', requireConfirmStart: !!opts.requireConfirmStart };
  renderW20PreselectModal(game.activeModal);
  return true;
}

function renderW20PreselectModal(modalState = {}){
  if (!game) return;
  const box = $('modalBox');
  const curPick = game.w20State?.preselectedDirection || null;
  const recKey = getRecommendedW20Direction();
  const intel = getW20BossIntel();
  const requireStart = !!modalState.requireConfirmStart;

  const intelHtml = intel?.revealed
    ? `<div class="intel-box">
        <div><b>🔎 W19 首领情报 · 第 20 波【${intel.bossName}】</b></div>
        <div>• <b>固定核心机制</b>：${intel.coreName} —— ${intel.coreDesc}</div>
        <div>• <b>本局随机辅助机制</b>：<b style="color:#ff9ec4">${intel.auxName}</b> —— ${intel.auxDesc}</div>
        <div style="font-size:11px;opacity:.85;margin-top:2px">✅ 公平性保障：${intel.auxFairness}</div>
      </div>`
    : `<div class="intel-box" style="background:rgba(40,60,72,0.38);border-color:rgba(140,210,220,0.35);color:#cbe4e0">
        <b>🔎 首领情报提示</b>：第 19 波备战时将提前揭晓 W20 首领【天劫魔尊】的固定核心机制与本局随机辅助机制。
      </div>`;

  box.innerHTML = `
    <h2>⚡ W20 第二次大型突破 · 方向预选（第 ${game.wave} 波备战）</h2>
    <div class="w20-notice">
      🔒 <b>生效时点说明：</b>W16–W19 期间可随时根据当前装备与词条自由调整预选方向；<b>击败 W20 首领拿到突破凭证后，已锁定方向的基础效果才会生效</b>（开战 W20 前均仅使用已有战力，零材料同样 100% 生效基础效果）！
    </div>
    ${intelHtml}
    <div class="choices" id="modalChoices"></div>
    <div class="modal-footer">
      ${requireStart
        ? `<button class="btn" id="w20CancelBtn" type="button">返回备战</button>
           <button class="btn gold" id="w20LockStartBtn" type="button" ${curPick ? '' : 'disabled'}>🔒 锁定【${curPick ? W20_DIRECTIONS[curPick].name : '请先选方向'}】并迎战 W20</button>`
        : `<button class="btn gold" id="w20DoneBtn" type="button">保存预选并返回备战</button>`}
    </div>
  `;

  const grid = box.querySelector('#modalChoices');
  for (const key of W20_DIRECTION_KEYS) {
    const d = W20_DIRECTIONS[key];
    const isSel = curPick === key;
    const isRec = !curPick && recKey === key;
    const poolCnt = getValidW20EnhancementPool(key).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card' + (isSel ? ' w20-selected' : '');
    card.dataset.w20Dir = key;
    card.innerHTML = `
      <span class="tag">${d.tag}</span>
      ${isSel ? '<span class="up-tag">✅ 当前预选方向</span>' : isRec ? '<span class="up-tag">💡 契合当前构筑</span>' : ''}
      <span class="ci">${d.icon}</span>
      <span class="cn">${d.name}</span>
      <span class="cd">${d.baseDesc}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">🔗 ${d.synergyNote}（战后强化池 ${poolCnt} 张）</span>
    `;
    card.addEventListener('click', () => {
      selectW20PreselectDirection(key);
    });
    grid.append(card);
  }

  box.querySelector('#w20DoneBtn')?.addEventListener('click', () => closeModal());
  box.querySelector('#w20CancelBtn')?.addEventListener('click', () => closeModal());
  box.querySelector('#w20LockStartBtn')?.addEventListener('click', () => {
    if (!game.w20State?.preselectedDirection) {
      selectW20PreselectDirection(recKey);
    }
    closeModal();
    startWave();
  });
  $('modalBackdrop').hidden = false;
}

function openW20BreakthroughModal(){
  if (!game || !game.w20Draft) return false;
  game.activeModal = { type: 'w20_breakthrough' };
  renderW20BreakthroughModal();
  return true;
}

function renderW20BreakthroughModal(){
  if (!game || !game.w20Draft) return;
  const draft = game.w20Draft;
  const dir = W20_DIRECTIONS[draft.directionKey];
  const cards = draft.candidates.map(k => W20_ENHANCEMENTS[k]).filter(Boolean);
  const nextCost = getW20RerollCost(draft.rerollCount);
  const mats = game.materials || 0;
  const canReroll = mats >= nextCost;
  const validPoolSize = getValidW20EnhancementPool(draft.directionKey).length;
  const minPool = 2 * (draft.groupSize || 2) + (BALANCE.w20Breakthrough?.minPoolBuffer ?? 2);
  const box = $('modalBox');

  box.innerHTML = `
    <h2>⚡ W20 第二次大型突破 · 战后强化选择</h2>
    <div class="w20-notice">
      ✅ <b>突破凭证保底生效：</b>已斩杀天劫魔尊并激活【${dir.icon} ${dir.name}】基础效果 —— ${dir.baseDesc}（即使普通材料为 0 亦已 100% 生效！）
    </div>
    <p class="lead">请从下方 <strong>${cards.length} 张机制强化卡</strong>中免费择一进入 W21；或消耗普通材料（⚙️ 当前 <strong>${mats}</strong> 锻材）<strong>整组重抽</strong>（相邻两组严格 0 重复，当前方向有效池 ${validPoolSize} 张 / 下限 ${minPool} 张）。</p>
    <div class="choices ${cards.length === 2 ? 'two' : ''}" id="modalChoices"></div>
    <div class="reroll-bar">
      <div style="font-size:12px;color:#cde4df">
        ⚙️ 剩余锻材：<b>${mats}</b> · 已重抽 <b>${draft.rerollCount}</b> 次 · 下次整组重抽价格：<b style="color:#ffe27a">${nextCost} 锻材</b>
      </div>
      <button class="btn gold" id="w20RerollBtn" type="button" ${canReroll ? '' : 'disabled'}>
        🎲 付费整组重抽（消耗 ${nextCost} 锻材）
      </button>
    </div>
  `;

  const grid = box.querySelector('#modalChoices');
  for (const c of cards) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card legend';
    card.dataset.w20Enh = c.key;
    card.innerHTML = `
      <span class="tag">${c.tag}${c.shared ? ' · 通用相容' : ''}</span>
      <span class="up-tag">⚡ ${c.behaviorTag}</span>
      <span class="ci">${c.icon}</span>
      <span class="cn">${c.name}</span>
      <span class="cd">${c.desc}</span>
    `;
    card.addEventListener('click', () => pickW20Enhancement(c.key));
    grid.append(card);
  }
  box.querySelector('#w20RerollBtn')?.addEventListener('click', () => rerollW20Enhancements());
  $('modalBackdrop').hidden = false;
}

/* ---- DESTINY PERK DRAFT (3 / 4 / 6 CHOICES + LV.1->LV.2 UPGRADE CHAINS) ---- */
function renderPerkModal(quality = 'ren'){
  const choices = rollPerkChoices(quality);
  if (!choices.length) { closeModal(); return; }
  const qName = quality === 'tian' ? '👑 天道秘宝加持（六选一）' : quality === 'di' ? '💎 地道秘宝加持（四选一）' : '✨ 秘宝加持（三选一）';
  const gridCls = choices.length >= 5 ? 'choices six' : choices.length === 4 ? 'choices four' : 'choices';
  const box = $('modalBox');
  box.innerHTML = `
    <h2>${qName}</h2>
    <p class="lead">选择 <strong>1 条规则弯折词条</strong>塑造本局流派；已拥有的 Lv.1 词条可原地升阶为 <strong>Lv.2 精通</strong>！</p>
    <div class="${gridCls}" id="modalChoices"></div>
  `;
  const grid = box.querySelector('#modalChoices');
  for (const p of choices) {
    const curLv = game.hero.perks[p.key] || 0;
    const nextLv = curLv + 1;
    const rarityLabel = p.rarity === 'epic' ? '史诗' : p.rarity === 'rare' ? '稀有' : '普通';
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card' + (p.rarity === 'epic' ? ' epic' : p.rarity === 'rare' ? ' rare' : '');
    card.dataset.choice = p.key;
    card.innerHTML = `
      <span class="tag">${p.family}系 · ${rarityLabel}</span>
      ${curLv === 1 ? '<span class="up-tag">⬆ 升阶精通 Lv.2</span>' : ''}
      <span class="ci">${p.icon}</span>
      <span class="cn">${p.name}</span>
      <span class="cd">${nextLv === 2 ? p.d2 : p.d1}</span>
    `;
    card.addEventListener('click', () => pickPerk(p.key));
    grid.append(card);
  }
  $('modalBackdrop').hidden = false;
}

function renderAffixChipsHtml(inst){
  return (inst.affixes || []).map((a, idx) => {
    if (!a) return `<span class="affix-chip">[空槽${idx + 1}]</span>`;
    const sp = GEAR_AFFIXES[a.id];
    if (!sp) return '';
    const cls = `${sp.elem === 'fire' ? 'fire' : sp.elem === 'frost' ? 'frost' : ''} ${sp.rarity}`;
    return `<span class="affix-chip ${cls}" title="${sp.desc(a.tier || 1)}">${sp.icon}${sp.name}${a.tier > 1 ? ` T${a.tier}` : ''}</span>`;
  }).join('');
}

function renderChestModal(legendBias = false, shrineTier = false){
  const m = game?.activeModal;
  if (!m || m.type !== 'chest') return;
  if (!m.offerId) m.offerId = `chest_${counters.modalOfferSeq++}`;
  if (typeof m.claimed !== 'boolean') m.claimed = false;
  const choices = (Array.isArray(m.choices) && m.choices.length)
    ? m.choices.map(c => normalizeGearInstance(c))
    : pickChestGearChoices(legendBias, shrineTier);
  m.choices = choices;
  const box = $('modalBox');
  const title = legendBias ? '👑 首领传说宝箱' : shrineTier ? '🩸 血煞妖碑高阶宝箱' : '📦 精英构装宝箱';
  box.innerHTML = `
    <h2>${title} · 三选一</h2>
    <p class="lead">每件装备为<strong>独立实例</strong>（品质与 <strong>1/2/3 槽</strong>独立随机，锁定当前来源阶段，不再同名合星覆盖词条）。多余装备可在属性面板选择<strong>出售换金</strong>或<strong>拆解获锻材</strong>！</p>
    <div class="choices" id="modalChoices"></div>
  `;
  const grid = box.querySelector('#modalChoices');
  const setCounts = getGearSetCounts();
  for (const inst of choices) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'choice-card ' + inst.rarity;
    card.dataset.choice = inst.baseKey;
    card.dataset.uid = inst.uid;
    const rTag = GEAR_RARITY_LABELS[inst.rarity] || '凡品';
    const stSpec = getSourceStageSpec(inst.sourceStage);
    const elSpec = ELEMENTS[inst.elem];
    const setSpec = GEAR_SETS[inst.set];
    const curSetCnt = setCounts[inst.set] || 0;
    const itemSyns = evaluateItemSynergies(inst);
    const synHints = getGearSynergyHints(inst);
    card.innerHTML = `
      <span class="tag">${rTag} · ${stSpec.label} · ${inst.slotsCount}槽${elSpec ? ` · ${elSpec.icon}${elSpec.name}` : ''}</span>
      <span class="ci">${inst.icon}</span>
      <span class="cn">${inst.name}</span>
      <span class="cd">${describeGearEffect(inst)}</span>
      <div style="margin-top:3px">${renderAffixChipsHtml(inst)}</div>
      ${itemSyns.length ? `<span class="syn-badge ${itemSyns[0].badgeClass}">✨ 单件联动：${itemSyns.map(s => `${s.icon}${s.name}(${s.short})`).join(' / ')}</span>` : ''}
      ${synHints.length ? `<span class="syn-badge hint">💡 ${synHints.join('；')}</span>` : ''}
      ${setSpec ? `<span class="cd" style="color:${setSpec.col};font-size:11px;margin-top:2px">${setSpec.icon} ${setSpec.name} (${curSetCnt}/3)</span>` : ''}
    `;
    card.addEventListener('click', () => pickGearReward(inst));
    grid.append(card);
  }
  $('modalBackdrop').hidden = false;
}

function formatDurationMMSS(sec){
  const s = Math.max(0, Math.round(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}分${String(r).padStart(2, '0')}秒`;
}

function openMetaLegacyModal(opts = {}){
  if (!game) return { ok: false, reason: 'no_game' };
  const context = opts.context || ((game.phase === 'won' || game.phase === 'lost') ? 'settlement' : (isMetaLoadoutLocked() ? 'in_run' : 'pre_run'));
  game.activeModal = { type: 'meta_legacy', context, returnTo: opts.returnTo || null };
  renderMetaLegacyModal(game.activeModal);
  return { ok: true, locked: isMetaLoadoutLocked(), context };
}

function renderMetaLegacyModal(modalState = {}){
  const cfg = getMetaConfig();
  const save = getMetaSave();
  const locked = isMetaLoadoutLocked();
  const activeLoadout = locked ? getActiveMetaLoadout() : save.loadout;
  const budget = getMetaLoadoutBudget(activeLoadout);
  const pools = buildActiveRunPools(activeLoadout, save);
  const box = $('modalBox');

  const mainCardsHtml = cfg.mains.map(m => {
    const unlocked = save.unlockedMain.includes(m.id);
    const selected = activeLoadout.main === m.id;
    const cls = `meta-card ${selected ? 'sel' : ''} ${!unlocked ? 'locked-item' : ''}`;
    const btnState = unlocked
      ? (locked ? 'disabled' : '')
      : (save.legacyShards < m.unlockCost ? 'disabled' : '');
    const badge = selected ? '✅ 已装备' : unlocked ? (locked ? '🔒 局内锁定' : '点击装备') : `💠 ${m.unlockCost} 解锁`;
    return `
      <button type="button" class="${cls}" data-meta-action="${unlocked ? 'equip_main' : 'unlock_main'}" data-meta-id="${m.id}" ${btnState}>
        <div class="meta-card-head"><span>${m.icon} ${m.name}</span><span class="meta-pts-pill">${badge}</span></div>
        <div class="meta-card-sub" style="color:#9ef2cf">${m.styleTag}</div>
        <div class="meta-card-sub">${m.desc}</div>
      </button>
    `;
  }).join('');

  const auxCardsHtml = cfg.auxiliaries.map(a => {
    const unlocked = save.unlockedAux.includes(a.id);
    const selected = activeLoadout.aux.includes(a.id);
    const wouldExceedCount = !selected && budget.auxCount >= budget.maxAuxCount;
    const wouldExceedPts = !selected && (budget.auxPoints + a.costPoints > budget.maxAuxPoints);
    const cls = `meta-card ${selected ? 'sel' : ''} ${!unlocked ? 'locked-item' : ''}`;
    let disabled = false;
    if (unlocked) {
      if (locked || (!selected && (wouldExceedCount || wouldExceedPts))) disabled = true;
    } else if (save.legacyShards < a.unlockCost) {
      disabled = true;
    }
    const badge = selected ? `✅ ${a.costPoints}点` : unlocked ? `${a.costPoints}点${wouldExceedPts ? '·超预算' : wouldExceedCount ? '·满3槽' : ''}` : `💠 ${a.unlockCost} 解锁`;
    return `
      <button type="button" class="${cls}" data-meta-action="${unlocked ? 'toggle_aux' : 'unlock_aux'}" data-meta-id="${a.id}" ${disabled ? 'disabled' : ''}>
        <div class="meta-card-head"><span>${a.icon} ${a.name}</span><span class="meta-pts-pill">${badge}</span></div>
        <div class="meta-card-sub">${a.desc}</div>
      </button>
    `;
  }).join('');

  const packCardsHtml = cfg.unlockPacks.map(p => {
    const unlocked = save.unlockedPacks.includes(p.id);
    const disabled = unlocked || save.legacyShards < p.unlockCost;
    return `
      <button type="button" class="meta-card ${unlocked ? 'sel' : 'locked-item'}" data-meta-action="unlock_pack" data-meta-id="${p.id}" ${disabled ? 'disabled' : ''}>
        <div class="meta-card-head"><span>${p.icon} ${p.name}</span><span class="meta-pts-pill">${unlocked ? '✅ 已解锁' : `💠 ${p.unlockCost} 解锁`}</span></div>
        <div class="meta-card-sub">${p.desc}</div>
      </button>
    `;
  }).join('');

  const msHtml = cfg.milestones.map(ms => {
    const done = save.claimedMilestones.includes(ms.id);
    return `<div class="meta-ms-item ${done ? 'done' : ''}"><b>${done ? '✅' : '⬜'} ${ms.name}</b>（💠 +${ms.shardReward}）<br>${ms.desc}</div>`;
  }).join('');

  const isSettlement = modalState.context === 'settlement' || game.phase === 'won' || game.phase === 'lost';
  const isPreRun = modalState.context === 'pre_run' || modalState.returnTo === 'intro';

  box.innerHTML = `
    <h2>💠 局外传承配置与横向解锁</h2>
    <p class="lead">每局锁定 <strong>1 个主传承</strong> + <strong>最多 ${budget.maxAuxCount} 个辅助传承（总预算固定 ${budget.maxAuxPoints} 点，全解锁容量永不增加）</strong>。主传承仅提高本系奖励出现权重 ×${cfg.mainRewardWeightMultiplier}（严格重新归一化），<strong>绝不堆叠永久攻血暴击</strong>！</p>
    <div class="meta-lock-banner ${locked ? 'locked' : ''}">
      <div>${locked ? '🔒 <strong>本局已锁定（只读展示）</strong>：局内禁止热切换传承配置；新解锁内容将在重开新局后生效。' : '🔓 <strong>开局前配置就绪</strong>：自由选择主传承、勾选辅助传承与消费传承碎片解锁新内容。'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="meta-pts-pill">💠 碎片：${save.legacyShards}</span>
        <span class="meta-pts-pill">主传承：${budget.mainCount}/1</span>
        <span class="meta-pts-pill">辅助：${budget.auxCount}/${budget.maxAuxCount}（${budget.auxPoints}/${budget.maxAuxPoints} 点）</span>
        <span class="meta-pts-pill">防稀释定容：装备 ${pools.activeGearKeys.length} / 词条 ${pools.activeAffixKeys.length}</span>
      </div>
    </div>

    <div class="meta-sec-title"><span>1. 主传承（5 选 1 · 免费 3 + 可解锁 2）</span><span style="font-size:11px;color:#a8cdc6">最高波次 W${save.stats.bestWave || 0} · 通关 ${save.stats.victories || 0} / 总场次 ${save.stats.totalRuns || 0}</span></div>
    <div class="meta-grid">${mainCardsHtml}</div>

    <div class="meta-sec-title"><span>2. 辅助传承（最多 ${budget.maxAuxCount} 个 · 固定 ${budget.maxAuxPoints} 点预算）</span><span style="font-size:11px;color:#a8cdc6">0 解锁即达 1+1+2=4 三辅助满配</span></div>
    <div class="meta-grid two">${auxCardsHtml}</div>

    <div class="meta-sec-title"><span>3. 横向扩展包（装备 / 词条 / 挑战）</span><span style="font-size:11px;color:#a8cdc6">解锁后保持活跃池定容，绝不稀释联动概率</span></div>
    <div class="meta-grid">${packCardsHtml}</div>

    <div class="meta-sec-title"><span>4. 一次性里程碑进度（${save.claimedMilestones.length}/${cfg.milestones.length}）</span><span style="font-size:11px;color:#a8cdc6">存档键：${cfg.storageKey} (v${cfg.schemaVersion})</span></div>
    <div class="meta-milestone-list">${msHtml}</div>

    <div class="modal-footer">
      <button class="btn" id="metaExportBtn" type="button" title="复制本地存档 JSON 备份">💾 备份存档</button>
      ${isSettlement ? `<button class="btn" id="metaBackEndBtn" type="button">返回结算摘要</button><button class="btn gold" id="metaStartNewBtn" type="button" style="padding:8px 16px">🔁 保存并开启新局</button>`
        : isPreRun ? `<button class="btn gold" id="metaConfirmPreBtn" type="button" style="padding:8px 18px">⚔️ 锁定配置 · 踏入秘境！</button>`
        : `<button class="btn" id="metaCloseBtn" type="button">关闭</button>`}
    </div>
  `;

  box.querySelectorAll('[data-meta-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.metaAction;
      const id = btn.dataset.metaId;
      if (act === 'equip_main') setMetaMainLegacy(id);
      else if (act === 'toggle_aux') toggleMetaAuxLegacy(id);
      else if (act === 'unlock_main') unlockMetaItem('main', id);
      else if (act === 'unlock_aux') unlockMetaItem('aux', id);
      else if (act === 'unlock_pack') unlockMetaItem('pack', id);
      renderMetaLegacyModal(modalState);
    });
  });

  box.querySelector('#metaExportBtn')?.addEventListener('click', () => {
    const json = exportMetaSave();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => toast('💾 局外传承存档 JSON 已复制到剪贴板！')).catch(() => toast('💾 存档已就绪（可通过 BG60.exportMetaSave() 获取）'));
    } else {
      toast('💾 存档已导出（可在控制台调用 BG60.exportMetaSave() 查看）');
    }
  });
  box.querySelector('#metaBackEndBtn')?.addEventListener('click', () => showEndModal(game.phase === 'won'));
  box.querySelector('#metaStartNewBtn')?.addEventListener('click', () => startNewRun());
  box.querySelector('#metaConfirmPreBtn')?.addEventListener('click', () => {
    AudioKit.unlock();
    lockMetaLoadoutForRun();
    rollShop(true);
    closeModal();
  });
  box.querySelector('#metaCloseBtn')?.addEventListener('click', () => closeModal());
  $('modalBackdrop').hidden = false;
}

function showIntroModal(){
  game.activeModal = { type:'intro' };
  const save = getMetaSave();
  const mainSpec = getMetaMainSpec(save.loadout.main);
  const auxSpecs = (save.loadout.aux || []).map(id => getMetaAuxSpec(id)).filter(Boolean);
  const budget = getMetaLoadoutBudget(save.loadout);
  const box = $('modalBox');
  box.innerHTML = `
    <h2>⚔️ 边境守卫 v0.60 · 30 波完整试玩版</h2>
    <p class="lead">64×48 修仙秘境自由游走！从 <strong>W1</strong> 迎战 6 大首领与 <strong>W10 / W20 双大型突破</strong>，激活双/三词条实战联动，完成 <strong>W29 实时 90 秒整备</strong>并决战 <strong>W30 深渊主宰</strong>！</p>
    <div class="meta-lock-banner" style="margin-bottom:10px">
      <div>💠 当前局外传承：<strong>${mainSpec ? `${mainSpec.icon}${mainSpec.name}` : '未选'}</strong> · 辅助（${budget.auxCount}/3 · ${budget.auxPoints}/4点）：<strong>${auxSpecs.map(a => `${a.icon}${a.name}`).join(' / ') || '无'}</strong></div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="meta-pts-pill">💠 ${save.legacyShards} 碎片</span>
        <button class="btn" id="introMetaBtn" type="button" style="padding:4px 10px;font-size:12px">⚙️ 局外传承与解锁</button>
      </div>
    </div>
    <div class="intro-grid">
      <div class="intro-box">
        <h4>🔥❄️ 跨阶段双/三词条实战联动</h4>
        <p>构装独立随机 <strong>1/2/3 槽词条</strong>，与 W10 分支和 W20 突破共享火标/减速状态；完整三联动替代原双联动，呈现群体连爆、孤立聚焦与持盾主动冰环！</p>
      </div>
      <div class="intro-box">
        <h4>🏪 常规经济 · 天命赌局 · 词条转移台</h4>
        <p>多余装备自主<strong>出售换金</strong>或<strong>拆解得锻材</strong>（按品质与来源阶段计算）；常规商店稳健精修即可通关，也可参与天命赌局搏取转印符与天命专属强化！</p>
      </div>
      <div class="intro-box">
        <h4>⏳ W29 90秒实时整备 & W30 三段决战</h4>
        <p>W29 战后先结清波末奖励，再开启 <strong>90 秒实时终局整备</strong>（倍速不变）；W30 深渊主宰 80% 血线强制招牌锁血冲击波，末段打空即胜！</p>
      </div>
      <div class="intro-box">
        <h4>💠 固定预算局外传承与防刷结算</h4>
        <p>开局锁定 <strong>1 主传承 + 最多 3 辅助（固定 4 点）</strong>，主传承权重倾斜 ×1.35 并保持活跃池定容防稀释；三维结算提供真实伤害归因与单局防重复发奖。</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="introMetaBtnFoot" type="button" style="padding:9px 14px;font-size:13px">⚙️ 配置局外传承</button>
      <button class="btn gold" id="introGo" type="button" style="padding:9px 22px;font-size:14px">⚔️ 锁定传承 · 踏入秘境！</button>
    </div>
  `;
  const openMetaFromIntro = () => openMetaLegacyModal({ context: 'pre_run', returnTo: 'intro' });
  box.querySelector('#introMetaBtn')?.addEventListener('click', openMetaFromIntro);
  box.querySelector('#introMetaBtnFoot')?.addEventListener('click', openMetaFromIntro);
  box.querySelector('#introGo')?.addEventListener('click', () => {
    AudioKit.unlock();
    if (!game.metaRunLocked) {
      lockMetaLoadoutForRun();
      rollShop(true);
    }
    closeModal();
  });
  $('modalBackdrop').hidden = false;
}

function showEndModal(victory){
  game.activeModal = { type:'end', victory: !!victory };
  const rep = getTelemetryReport();
  const settle = game.metaSettlement || settleRunMetaRewards(!!victory);
  const rm = game.runMetrics || {};
  const recentRows = rep.waves.slice(-8).map(w =>
    `<tr><td>W${w.wave} (${w.phaseTag})</td><td>${w.duration}s</td><td style="color:${w.minHpPct<35?'#ff7b6b':'#7ce896'}">${w.minHpPct}%</td><td>${w.hitsTaken}</td><td>${w.dps}</td><td>${w.shrineCleared?'✅':w.shrineTried?'❌':'—'}</td></tr>`
  ).join('');
  const w10Info = game.hero.breakthroughs.w10
    ? `${game.hero.breakthroughs.w10.skillName} · ${game.hero.breakthroughs.w10.branchName}`
    : '未完成';
  const w20 = game.hero.breakthroughs.w20;
  const w20Info = w20
    ? (w20.placeholder
      ? '已达成 W20 突破节点'
      : `${w20.directionIcon || '⚡'}${w20.directionName || w20.directionKey}${w20.enhancementName ? ` × ${w20.enhancementName}` : '（基础效果生效）'}`)
    : '未达成';
  const activeGearSyn = getActiveGearAffixSynergies();
  const synNames = activeGearSyn.active.length
    ? activeGearSyn.active.map(s => `${s.icon}${s.name}(${s.tier === 3 ? '三联动' : '双联动'})`).join('、')
    : '无词条联动';
  const w30B = game.w30Battle;
  const w30Line = w30B
    ? `<br>W30 深渊主宰：用时 <b>${Number(w30B.elapsedSeconds || 0).toFixed(1)}s</b> · 辅助 <b>${w30B.auxName || '—'}</b> · 招牌锁血 <b>${w30B.signatureTriggered ? '已完整经历' : '未触发'}</b>`
    : '';

  const lo = getActiveMetaLoadout();
  const mainSpec = getMetaMainSpec(lo.main);
  const auxSpecs = (lo.aux || []).map(id => getMetaAuxSpec(id)).filter(Boolean);
  const budget = getMetaLoadoutBudget(lo);
  const lowestHp = Math.min(rep.summary.lowestHpPct ?? 100, game.combatLog?.lowestHpPct ?? 100);
  const threat = getRecentThreatSummary(5.0);
  const fatal = game.combatLog?.fatalSource || null;
  const fatalHtml = fatal
    ? `<b>致命一击：</b>${fatal.attackerName} · <b>${fatal.skillName}</b>${fatal.isBossCore ? '【首领核心】' : fatal.isBossAux ? '【首领随机辅助】' : ''}（扣血 <b>-${fatal.hpLost}</b>${fatal.shieldAbsorbed > 0 ? `，盾抵 ${fatal.shieldAbsorbed}` : ''}，W${fatal.wave} ${fatal.waveClock}s）`
    : (victory ? '<b>存活通关：</b>未触发致命伤。' : '<b>致命记录：</b>无有效受击记录（非受击结束）。');
  const recentThreatHtml = threat.topThreats.length
    ? threat.topThreats.slice(0, 3).map(t => `${t.attackerName}·${t.skillName}(${t.hits}次/-${t.totalHpLost}血)`).join('；')
    : '近 5 秒无受击记录';

  const shardDetailText = settle?.eligible
    ? `波段推进 +${(settle.band1Shards || 0) + (settle.band2Shards || 0) + (settle.band3Shards || 0)}（W3-10:${settle.band1Shards} / W11-20:${settle.band2Shards} / W21-29:${settle.band3Shards}）· 首领 +${settle.bossBonus} · 突破 +${(settle.w10Bonus || 0) + (settle.w20Bonus || 0)}${settle.w30VictoryBonus ? ` · W30通关大奖 +${settle.w30VictoryBonus}` : ''}`
    : '未通过 W3 且未击败首领：防速死刷取规则生效，本局传承碎片收益为 0（有效推进后即可获得长期成长）';
  const newMsList = (settle?.newlyClaimedMilestones || []).map(m => `${m.name}(+💠${m.shardReward})`).join('、') || '无新增';
  const saveFailed = !!(settle && (settle.saveStatus === 'failed' || settle.persisted === false));
  const dupGuardText = settle?.duplicateBlocked
    ? '🛡️ 防重放已拦截（本 runId 奖励此前已发放，本次 +0）'
    : saveFailed
      ? `⚠️ 本地存档写入失败，本局奖励尚未持久化（原因：${settle.saveError || 'storage_write_failed'}）`
      : `✅ 单局首结已入账（runId: ${game.runId}）`;
  const saveWarningHtml = saveFailed ? `
        <div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,95,86,0.16);border:1px solid rgba(255,123,107,0.55);color:#ffd2cc;font-size:12px">
          ⚠️ <b>本地存档写入失败，本局奖励尚未持久化！</b>（${settle.saveError || '存储空间不足或受限'}）
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button class="btn gold" id="endRetrySaveBtn" type="button" style="padding:5px 10px;font-size:12px">🔄 重试保存</button>
            <button class="btn" id="endExportBackupBtn" type="button" style="padding:5px 10px;font-size:12px">💾 导出备份 JSON</button>
          </div>
        </div>` : '';

  const box = $('modalBox');
  box.innerHTML = `
    <h2>${victory ? `🏆 30 波秘境守卫大成！你斩杀了第 ${MAIN_WAVES} 波深渊主宰！` : `💀 道消身陨 · 止步第 ${game.wave} / ${MAIN_WAVES} 波（${getRealmStageLabel()}）`}</h2>
    <p class="lead">${victory ? '你已完成全部 30 波边境守卫与终局决战！以下为本局三维度真实结算报告：' : '本局已在当前波次立即结算。以下为三维度真实战况归因与长期成长结算：'}</p>
    <div class="settle-grid">
      <div class="settle-card">
        <h4>① 通关结果与传承快照</h4>
        <p>结算状态：<b style="color:${victory?'#7ce896':'#ff7b6b'}">${victory ? '30 波通关胜利' : `第 ${game.wave} 波战败结算`}</b><br>
        到达波次：<b>W${game.wave} / W${MAIN_WAVES}</b> · 节点：<b>${getRealmStageLabel()}</b><br>
        总有效时长：<b>${formatDurationMMSS(rm.totalEffectiveSec)}</b>（普通战 ${Math.round(rm.normalCombatSec||0)}s / 首领战 ${Math.round(rm.bossCombatSec||0)}s / 整备 ${Math.round((rm.prepSec||0)+(rm.w29FinalPrepSec||0))}s）${w30Line}<br>
        锁定传承：<b>${mainSpec ? `${mainSpec.icon}${mainSpec.name}` : '无'}</b> · 辅助(${budget.auxPoints}/4点)：<b>${auxSpecs.map(a => a.name).join(' / ') || '无'}</b></p>
      </div>
      <div class="settle-card">
        <h4>② 本局表现与真实受击归因</h4>
        <p>击杀：<b>${game.stats.kills}</b>（首领 <b>${game.stats.bossKills || 0}</b> / 精英 <b>${game.stats.elites}</b>） · 总输出：<b>${Math.round(game.stats.dmgTotal).toLocaleString()}</b><br>
        最低血线：<b>${lowestHp}%</b> · 受击总计：<b>${game.combatLog?.totalHitsTaken || 0}</b> 次（失血 ${game.combatLog?.totalHpLost || 0} / 护盾吸收 ${game.combatLog?.totalShieldAbsorbed || 0}）<br>
        W10：<b>${w10Info}</b> · W20：<b>${w20Info}</b><br>
        装备联动：<b>${synNames}</b>（火标${game.stats.fireMarksApplied||0}/引爆${game.stats.fireDetonations||0}/传递${game.stats.fireChainTransfers||0} · 冰缓${game.stats.frostSlowsApplied||0}/冰盾+${game.stats.frostShieldGained||0}/冰环${(game.stats.frostHitPulses||0)+(game.stats.frostDashPulses||0)+(game.stats.frostFullShieldPulses||0)}）<br>
        资源收支：金币 +${rm.goldEarned||0}/-${rm.goldSpent||0}(余${game.gold}) · 锻材 +${rm.materialsEarned||0}/-${rm.materialsSpent||0}(余${game.materials||0}) · 转印符 +${rm.transferTokensEarned||0}/-${rm.transferTokensSpent||0}(余${game.transferTokens||0}) · 赌局 ${game.stats.destinyRolls||0}次</p>
        <div class="attr-log">${fatalHtml}<br><b>近 5 秒真实威胁：</b>${recentThreatHtml}</div>
      </div>
      <div class="settle-card full">
        <h4>③ 长期成长与资源结算 · 传承碎片与里程碑</h4>
        <p>本局实发传承碎片：<b style="color:#72f2b4;font-size:14px">💠 +${settle?.totalShardsGranted ?? 0}</b>（当前余额：<b>💠 ${getMetaSave().legacyShards}</b>） · ${dupGuardText}<br>
        收益明细：${shardDetailText}<br>
        新增一次性里程碑：<b>${newMsList}</b>（累计已完成 ${getMetaSave().claimedMilestones.length}/${getMetaConfig().milestones.length}）</p>${saveWarningHtml}
      </div>
    </div>
    ${recentRows ? `
    <div style="background:rgba(0,0,0,0.28);border:1px solid rgba(182,218,214,0.16);border-radius:10px;padding:8px 10px;margin-bottom:10px;overflow-x:auto">
      <div style="font-size:11px;font-weight:900;color:#ffe28a;margin-bottom:4px">📊 波次难度体检摘要（均耗时 ${rep.summary.avgDuration}s）</div>
      <table class="tel-table">
        <tr><th>波次·阶段</th><th>耗时</th><th>最低血</th><th>受击</th><th>DPS</th><th>妖碑</th></tr>
        ${recentRows}
      </table>
    </div>` : ''}
    <div class="modal-footer">
      <button class="btn" id="endMetaBtn" type="button" style="padding:9px 15px;font-size:13px">⚙️ 局外传承配置（💠${getMetaSave().legacyShards}）</button>
      <button class="btn gold" id="restartGo" type="button" style="padding:9px 18px;font-size:14px">🔁 快速重开</button>
    </div>
  `;
  box.querySelector('#endRetrySaveBtn')?.addEventListener('click', () => retryPendingMetaSave());
  box.querySelector('#endExportBackupBtn')?.addEventListener('click', () => {
    const json = exportMetaSave();
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => toast('💾 备份存档 JSON 已复制到剪贴板！')).catch(() => toast('💾 备份存档已就绪（可通过 BG60.exportMetaSave() 获取）'));
    } else {
      toast('💾 备份存档已就绪（可通过 BG60.exportMetaSave() 获取）');
    }
  });
  box.querySelector('#endMetaBtn')?.addEventListener('click', () => openMetaLegacyModal({ context: 'settlement', returnTo: 'end' }));
  box.querySelector('#restartGo')?.addEventListener('click', () => startNewRun());
  $('modalBackdrop').hidden = false;
}

/* ==================== STAGE 4 MODALS: DESTINY GAMBLE & AFFIX TRANSFER WORKBENCH ==================== */
let _destinyBetInputVal = 120;
let _transferUiState = { sourceUid: null, sourceSlot: 0, targetUid: null, targetSlot: 0 };

function openDestinyGambleModal(){
  if (!game) return false;
  if (game.phase !== 'prep') {
    toast('战斗中不可开启天命赌局，请于备战期操作！', true);
    return false;
  }
  game.activeModal = { type: 'destiny_gamble' };
  renderDestinyGambleModal();
  return true;
}

function renderDestinyGambleModal(){
  const cfg = getDestinyConfig();
  const pending = getPendingDestinyOffer();
  const box = $('modalBox');
  const ownedExc = getOwnedDestinyEnhancements();
  const w29Note = game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备倒计时继续运行 (${Math.ceil(game.finalPrep.timer)}s)</span>` : '';

  if (pending) {
    box.innerHTML = `
      <h2>🎲 天命赌局 · 开奖三选一（押注 💰${pending.bet}）</h2>
      <p class="lead">本次天命已开奖！请从以下 <strong>3 件随机候选</strong>中择一领取（<strong>单次结账、仅领一件</strong>，未领取前不可再次发起新押注）${w29Note}。</p>
      <div class="destiny-meta-row">
        <span class="destiny-chip gold">💰 余额 ${game.gold}</span>
        <span class="destiny-chip purple">🔮 转印符 ${game.transferTokens || 0}</span>
        <span class="destiny-chip">⚙️ 锻材 ${game.materials || 0}</span>
        <span class="destiny-chip">📦 背包 ${game.bag.length}/${getBagCapacity()}</span>
      </div>
      <div class="choices" id="modalChoices"></div>
    `;
    const grid = box.querySelector('#modalChoices');
    pending.choices.forEach((ch, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card ' + (ch.rarity || 'common');
      card.dataset.choice = String(idx);
      const gearChips = ch.category === 'gear' && ch.gear ? `<div style="margin-top:3px">${renderAffixChipsHtml(ch.gear)}</div>` : '';
      const synBadge = ch.synNote ? `<span class="syn-badge hint">💡 ${ch.synNote}</span>` : '';
      card.innerHTML = `
        <span class="tag">${ch.tag || ch.category}</span>
        <span class="ci">${ch.icon || '✨'}</span>
        <span class="cn">${ch.name}</span>
        <span class="cd">${ch.desc || ''}</span>
        ${gearChips}
        ${synBadge}
      `;
      card.addEventListener('click', () => claimDestinyReward(idx));
      grid.append(card);
    });
    $('modalBackdrop').hidden = false;
    return;
  }

  const curBet = Math.max(cfg.minBet, Math.min(Math.max(cfg.minBet, game.gold), Math.floor(Number(_destinyBetInputVal) || cfg.minBet)));
  const band = getDestinyBetBand(curBet);
  const t = cfg.preciousThresholds;
  const lastEmpty = game.destiny?.lastOutcome?.outcome === 'empty_tribulation';

  box.innerHTML = `
    <h2>🎲 天命赌局 · 自由押注开奖</h2>
    <p class="lead">自由设定押注金币，确认后<strong>单次原子扣款并立即开奖</strong>（不可无痛撤回）。空劫概率 <strong>${Math.round(cfg.emptyTribulationChance * 100)}%</strong>（空劫押注归零）；中奖按<strong>灵印 / 构装 / 丹药 / 特殊强化各 25%</strong>生成 3 件候选三选一，纯按概率无稀有度保底${w29Note}。</p>
    <div class="destiny-meta-row">
      <span class="destiny-chip gold">💰 当前金币 ${game.gold}</span>
      <span class="destiny-chip purple">🔮 转印符 ${game.transferTokens || 0}</span>
      <span class="destiny-chip">⚙️ 锻材 ${game.materials || 0}</span>
      <span class="destiny-chip">最低押注 ${cfg.minBet}金</span>
      <span class="destiny-chip">珍贵门槛：稀有≥${t.rare} · 转印符≥${t.transferToken} · 史诗/天命专属≥${t.destinyExclusive} · 传说≥${t.legend}</span>
    </div>
    ${lastEmpty ? `<div class="destiny-empty-alert">🌩️ 上次押注 💰${game.destiny.lastOutcome.bet} 触发了<strong>天命空劫</strong>，押注已归零且无候选生成。</div>` : ''}
    <div class="destiny-bet-bar">
      <label style="font-size:12px;font-weight:800;color:#ffe484">押注金币：</label>
      <input type="number" class="destiny-bet-input" id="destinyBetInput" min="${cfg.minBet}" max="${Math.max(cfg.minBet, game.gold)}" step="10" value="${curBet}">
      <div id="destinyQuickBtns" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      <button class="btn gold" id="destinyRollBtn" type="button" ${game.gold < cfg.minBet ? 'disabled' : ''}>🎲 确认押注并开奖</button>
    </div>
    <div class="destiny-band-box" id="destinyBandPreview"></div>
    <div style="font-size:11.5px;color:#b8d6d0;margin-top:4px">
      <b>已持有天命专属强化 (${ownedExc.length})：</b>
      ${ownedExc.length ? ownedExc.map(e => `${e.icon}${e.name}`).join(' · ') : '尚未持有（押注 ≥' + t.destinyExclusive + ' 金有几率在特殊强化类抽出）'}
    </div>
    <div class="modal-footer">
      <button class="btn" id="destinyOpenTransferBtn" type="button">✨ 前往词条转移台 (🔮${game.transferTokens || 0})</button>
      <button class="btn" id="destinyCloseBtn" type="button">返回备战</button>
    </div>
  `;

  const updateBandPreview = val => {
    const bVal = Math.floor(Number(val) || 0);
    _destinyBetInputVal = bVal;
    const info = getDestinyBetBand(bVal);
    const pv = box.querySelector('#destinyBandPreview');
    const rollBtn = box.querySelector('#destinyRollBtn');
    const valid = bVal >= cfg.minBet && game.gold >= bVal;
    if (rollBtn) rollBtn.disabled = !valid;
    if (!pv) return;
    if (bVal < cfg.minBet) {
      pv.innerHTML = `<span style="color:#ff9aa8">⚠️ 低于最低押注门槛（${cfg.minBet} 金），无法开奖。</span>`;
      return;
    }
    const unlocked = [
      '凡品池',
      info.allowRare ? '✅ 稀有池' : `🔒 稀有(需≥${t.rare}金)`,
      info.allowTransferToken ? '✅ 🔮天命转印符(特殊强化子池)' : `🔒 转印符(需≥${t.transferToken}金)`,
      info.allowDestinyExclusive ? '✅ 🌟史诗/天命专属强化' : `🔒 史诗/天命专属(需≥${t.destinyExclusive}金)`,
      info.allowLegend ? '✅ 👑传说珍贵池' : `🔒 传说池(需≥${t.legend}金)`
    ];
    pv.innerHTML = `<b>押注 💰${bVal} 档位资格：</b>${unlocked.join(' · ')}<br><small style="opacity:0.85">四类顶层权重固定：灵印 25% / 构装 25% / 丹药 25% / 特殊强化 25%（无稀有度保底）</small>`;
  };

  const quickWrap = box.querySelector('#destinyQuickBtns');
  for (const p of cfg.betQuickPresets) {
    const qb = document.createElement('button');
    qb.type = 'button';
    qb.className = 'btn';
    qb.style.padding = '4px 8px';
    qb.style.fontSize = '11px';
    qb.textContent = `${p}金`;
    qb.disabled = game.gold < p;
    qb.addEventListener('click', () => {
      const inp = box.querySelector('#destinyBetInput');
      if (inp) inp.value = String(p);
      updateBandPreview(p);
    });
    quickWrap.append(qb);
  }
  const inp = box.querySelector('#destinyBetInput');
  inp?.addEventListener('input', () => updateBandPreview(inp.value));
  updateBandPreview(curBet);

  box.querySelector('#destinyRollBtn')?.addEventListener('click', () => {
    const v = Math.floor(Number(box.querySelector('#destinyBetInput')?.value || _destinyBetInputVal));
    rollDestinyGamble(v);
  });
  box.querySelector('#destinyOpenTransferBtn')?.addEventListener('click', () => openAffixTransferModal());
  box.querySelector('#destinyCloseBtn')?.addEventListener('click', () => closeModal());
  $('modalBackdrop').hidden = false;
}

function openAffixTransferModal(){
  if (!game) return false;
  if (game.phase !== 'prep') {
    toast('战斗中不可使用词条转移台，请于备战期操作！', true);
    return false;
  }
  game.activeModal = { type: 'affix_transfer' };
  renderAffixTransferModal();
  return true;
}

function renderAffixTransferModal(){
  const box = $('modalBox');
  const allGear = [
    ...game.hero.gear.map((g, idx) => ({ inst: g, location: 'equipped', idx, locTag: `已穿戴·槽${idx + 1}` })),
    ...game.bag.map((g, idx) => ({ inst: g, location: 'bag', idx, locTag: `背包#${idx + 1}` })).filter(x => !isBagSeal(x.inst))
  ];
  const w29Note = game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备倒计时继续运行 (${Math.ceil(game.finalPrep.timer)}s)</span>` : '';

  if (allGear.length < 2) {
    box.innerHTML = `
      <h2>✨ 词条转移台</h2>
      <p class="lead">至少需要持有 <strong>2 件构装</strong>（已穿戴或背包合计）才可进行词条提取与转入${w29Note}。</p>
      <div class="destiny-meta-row">
        <span class="destiny-chip purple">🔮 天命转印符 ${game.transferTokens || 0}</span>
        <span class="destiny-chip gold">💰 金币 ${game.gold}</span>
      </div>
      <div class="modal-footer">
        <button class="btn gold" id="trGoDestiny" type="button">🎲 前往天命赌局</button>
        <button class="btn" id="trCancel" type="button">返回备战</button>
      </div>
    `;
    box.querySelector('#trGoDestiny')?.addEventListener('click', () => openDestinyGambleModal());
    box.querySelector('#trCancel')?.addEventListener('click', () => { cancelAffixTransferPreview(); closeModal(); });
    $('modalBackdrop').hidden = false;
    return;
  }

  // Ensure valid default selections
  if (!allGear.some(x => x.inst.uid === _transferUiState.sourceUid)) {
    const defSrc = allGear.find(x => (x.inst.affixes || []).some(Boolean)) || allGear[0];
    _transferUiState.sourceUid = defSrc.inst.uid;
    _transferUiState.sourceSlot = Math.max(0, (defSrc.inst.affixes || []).findIndex(Boolean));
  }
  if (!allGear.some(x => x.inst.uid === _transferUiState.targetUid) || _transferUiState.targetUid === _transferUiState.sourceUid) {
    const defTgt = allGear.find(x => x.inst.uid !== _transferUiState.sourceUid) || allGear[0];
    _transferUiState.targetUid = defTgt.inst.uid;
    const emptyIdx = (defTgt.inst.affixes || []).findIndex(a => !a);
    _transferUiState.targetSlot = emptyIdx >= 0 ? emptyIdx : 0;
  }

  const pv = previewAffixTransfer({
    source: _transferUiState.sourceUid,
    sourceSlot: _transferUiState.sourceSlot,
    target: _transferUiState.targetUid,
    targetSlot: _transferUiState.targetSlot
  });

  const fmtSyn = list => list.length ? list.map(s => `${s.name}(${s.tier === 3 ? '三联动' : '双联动'})`).join(' / ') : '无联动';

  box.innerHTML = `
    <h2>✨ 词条转移台 · 原子预览与确认</h2>
    <p class="lead">支持<strong>已穿戴 4 槽装备与背包装备</strong>直接互转（无需卸下主力装）。提取后<strong>源装备保留、源槽变为空槽</strong>，目标可<strong>填空槽或覆盖已有词条</strong>；取消预览零副作用${w29Note}。</p>
    <div class="destiny-meta-row">
      <span class="destiny-chip purple">🔮 天命转印符 ${game.transferTokens || 0}</span>
      <span class="destiny-chip gold">💰 金币 ${game.gold}</span>
      <span class="destiny-chip">严禁同件重复词条与互斥组冲突</span>
    </div>
    <div class="transfer-grid">
      <div class="transfer-col" id="trSrcCol"><h4>① 选择源装备与待提取词条槽</h4></div>
      <div class="transfer-col" id="trTgtCol"><h4>② 选择目标装备与写入槽位（空槽/覆盖）</h4></div>
    </div>
    <div class="transfer-preview-box ${pv.canCommit ? '' : 'err'}">
      ${pv.movingAffix ? `
        <div><b>转移预览：</b>将【${pv.movingAffix.name}】从 <b>${pv.source?.name}</b>(槽${pv.sourceSlot + 1}→空槽) 移入 <b>${pv.target?.name}</b>(槽${pv.targetSlot + 1}${pv.isOverwrite ? ` · 覆盖【${pv.replacedAffix?.name}】` : ' · 填入空槽'})</div>
        <div><b>费用：</b>🔮 ${pv.costTokens} 转印符 + 💰 ${pv.costGold} 金币</div>
        <div><b>联动变化预测：</b>源装备 [${fmtSyn(pv.sourceBeforeSynergies)} → ${fmtSyn(pv.sourceAfterSynergies)}] · 目标装备 [${fmtSyn(pv.targetBeforeSynergies)} → ${fmtSyn(pv.targetAfterSynergies)}] · 领主全局 [<b>${fmtSyn(pv.globalBeforeSynergies)} → ${fmtSyn(pv.globalAfterSynergies)}</b>]</div>
      ` : '<div>请选择有效的源词条槽与目标槽位。</div>'}
      ${pv.canCommit ? '<div style="color:#72f2b4;margin-top:4px">✅ 校验通过：点击下方【确认转移】一次性原子扣费并生效！</div>' : `<div style="color:#ff9aa8;margin-top:4px">❌ ${pv.errorText}</div>`}
    </div>
    <div class="modal-footer">
      <button class="btn" id="trCancelBtn" type="button">取消预览 / 返回备战</button>
      <button class="btn gold" id="trCommitBtn" type="button" ${pv.canCommit ? '' : 'disabled'}>✨ 最终确认转移 (🔮${pv.costTokens} + 💰${pv.costGold})</button>
    </div>
  `;

  const srcCol = box.querySelector('#trSrcCol');
  const tgtCol = box.querySelector('#trTgtCol');

  allGear.forEach(entry => {
    const g = entry.inst;
    const isSrcSel = g.uid === _transferUiState.sourceUid;
    const sCard = document.createElement('div');
    sCard.className = 'transfer-gear-card' + (isSrcSel ? ' sel' : '');
    sCard.innerHTML = `<div class="transfer-gear-head"><span>${g.icon} ${gearLabel(g)}</span><small>${entry.locTag} · ${g.slotsCount}槽</small></div><div class="transfer-slot-row"></div>`;
    const sRow = sCard.querySelector('.transfer-slot-row');
    for (let i = 0; i < g.slotsCount; i++) {
      const af = g.affixes?.[i] || null;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'transfer-slot-btn' + (isSrcSel && _transferUiState.sourceSlot === i ? ' active' : '') + (!af ? ' empty-slot' : '');
      b.disabled = !af;
      b.textContent = af ? `槽${i + 1}:${GEAR_AFFIXES[af.id]?.icon || ''}${GEAR_AFFIXES[af.id]?.name || af.id}` : `槽${i + 1}:[空槽]`;
      b.addEventListener('click', () => {
        _transferUiState.sourceUid = g.uid;
        _transferUiState.sourceSlot = i;
        renderAffixTransferModal();
      });
      sRow.append(b);
    }
    srcCol.append(sCard);

    const isTgtSel = g.uid === _transferUiState.targetUid;
    const tCard = document.createElement('div');
    tCard.className = 'transfer-gear-card' + (isTgtSel ? ' sel' : '');
    tCard.innerHTML = `<div class="transfer-gear-head"><span>${g.icon} ${gearLabel(g)}</span><small>${entry.locTag} · ${g.slotsCount}槽</small></div><div class="transfer-slot-row"></div>`;
    const tRow = tCard.querySelector('.transfer-slot-row');
    for (let i = 0; i < g.slotsCount; i++) {
      const af = g.affixes?.[i] || null;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'transfer-slot-btn' + (isTgtSel && _transferUiState.targetSlot === i ? ' active' : '') + (!af ? ' empty-slot' : '');
      b.disabled = g.uid === _transferUiState.sourceUid;
      b.textContent = af ? `覆盖槽${i + 1}:${GEAR_AFFIXES[af.id]?.name || af.id}` : `填入空槽${i + 1}`;
      b.addEventListener('click', () => {
        _transferUiState.targetUid = g.uid;
        _transferUiState.targetSlot = i;
        renderAffixTransferModal();
      });
      tRow.append(b);
    }
    tgtCol.append(tCard);
  });

  box.querySelector('#trCancelBtn')?.addEventListener('click', () => {
    cancelAffixTransferPreview();
    closeModal();
  });
  box.querySelector('#trCommitBtn')?.addEventListener('click', () => {
    commitAffixTransfer({
      source: _transferUiState.sourceUid,
      sourceSlot: _transferUiState.sourceSlot,
      target: _transferUiState.targetUid,
      targetSlot: _transferUiState.targetSlot
    });
  });
  $('modalBackdrop').hidden = false;
}

/* ==================== UI RENDERING (ZERO-FLICKER RECONCILIATION) ==================== */
function syncOffsets(){
  const topH = $('topbar').getBoundingClientRect().height || 52;
  document.documentElement.style.setProperty('--top-h', `${Math.ceil(topH)}px`);
  const subB = $('subbar').getBoundingClientRect().bottom || (topH + 44);
  document.documentElement.style.setProperty('--sub-bottom', `${Math.ceil(subB)}px`);
}

function renderAllUI(force = false){
  if (!game) return;
  const h = game.hero;
  const isWave = game.phase === 'wave' || game.phase === 'harvest';
  const meta = getWavePhaseMeta(game.wave);

  const wp = $('wavePill');
  const pTxt = game.phase === 'harvest'
    ? '收菜中'
    : game.phase === 'wave'
      ? (game.wave === MAIN_WAVES && game.w30Battle?.active ? `决战 ${Math.floor(game.w30Battle.elapsedSeconds || 0)}s` : '激战中')
      : (game.finalPrep?.active
        ? (game.finalPrep.awaitingWaveRewards ? '波末奖励结清中' : `终局整备 ${Math.ceil(game.finalPrep.timer)}s`)
        : '备战');
  wp.textContent = `第 ${game.wave}/${MAIN_WAVES} 波 [${meta.tag}] · ${pTxt}`;
  wp.className = 'pill ' + (isWave ? 'wave-live' : 'wave-prep');

  const goldTxt = `💰 ${game.gold}`;
  if ($('goldPill').textContent !== goldTxt) {
    $('goldPill').textContent = goldTxt;
    $('dockGoldNum').textContent = game.gold;
    for (const el of [$('goldPill'), $('dockGoldNum')]) {
      el.classList.remove('gold-bump'); void el.offsetWidth; el.classList.add('gold-bump');
    }
  }
  const matEl = $('matPill');
  if (matEl) {
    matEl.textContent = `⚙️ ${game.materials || 0} 锻材`;
  }
  const tokEl = $('tokenPill');
  if (tokEl) {
    tokEl.textContent = `🔮 ${game.transferTokens || 0} 转印符`;
  }
  const shardEl = $('shardPill');
  if (shardEl) {
    shardEl.textContent = `💠 ${getMetaSave().legacyShards || 0} 碎片`;
  }

  const hpPill = $('heroHpPill');
  const hpRatio = h.hp / Math.max(1, h.maxHp);
  hpPill.textContent = `❤️ ${Math.ceil(h.hp)}/${h.maxHp}${h.shield > 0 ? ` (+${Math.ceil(h.shield)})` : ''}`;
  hpPill.className = 'pill ' + (hpRatio < 0.35 ? 'warn' : 'hp');
  $('hpVignette')?.classList.toggle('danger', game.phase === 'wave' && h.hp > 0 && hpRatio < 0.35);

  const rp = $('heroPill');
  if (game.pendingBreakthrough === 'w10' && !h.breakthroughs.w10) {
    rp.className = 'pill realm-btn trib-ready';
    $('heroLvTxt').textContent = `⚡ 待完成 W10 大型突破（点击打开）`;
    $('xpFill').style.width = `100%`;
  } else if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
    rp.className = 'pill realm-btn trib-ready';
    $('heroLvTxt').textContent = `⚡ 待选 W20 战后强化（点击打开）`;
    $('xpFill').style.width = `100%`;
  } else {
    rp.className = 'pill realm-btn';
    $('heroLvTxt').textContent = `${getRealmStageLabel()} Lv.${h.lv}`;
    $('xpFill').style.width = `${clamp((h.xp / Math.max(1, h.xpNext)) * 100, 0, 100)}%`;
  }

  const w20Btn = $('w20PrepBtn');
  if (w20Btn) {
    const showPre = isW20PreselectOpen();
    const showDraft = game.pendingBreakthrough === 'w20' && !!game.w20Draft;
    w20Btn.hidden = !(showPre || showDraft);
    if (showDraft) {
      w20Btn.textContent = `⚡ 选 W20 强化（⚙️${game.materials || 0}）`;
    } else if (showPre) {
      const preSpec = game.w20State?.preselectedDirection ? W20_DIRECTIONS[game.w20State.preselectedDirection] : null;
      w20Btn.textContent = preSpec ? `⚡ W20预选：${preSpec.icon}${preSpec.name}` : '⚡ W20 方向预选';
    }
  }

  const destinyBtn = $('destinyBtn');
  if (destinyBtn) {
    const pendingOffer = getPendingDestinyOffer();
    destinyBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
    destinyBtn.textContent = pendingOffer ? '🎲 天命待领 (3选1)!' : '🎲 天命赌局';
    destinyBtn.classList.toggle('active', !!pendingOffer);
  }
  const transferBtn = $('transferBtn');
  if (transferBtn) {
    transferBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
    transferBtn.textContent = `✨ 词条转移台 (🔮${game.transferTokens || 0})`;
  }
  const metaBtn = $('metaLegacyBtn');
  if (metaBtn) {
    const mainSpec = getActiveMetaMain();
    const budget = getMetaLoadoutBudget(getActiveMetaLoadout());
    metaBtn.textContent = `${isMetaLoadoutLocked() ? '🔒' : '⚙️'} ${mainSpec ? mainSpec.icon + mainSpec.name : '传承'} (${budget.auxPoints}/4)`;
  }

  const rem = game.enemies.length + game.waveQueue.filter(w => !w.spawned).length;
  $('enemyPill').hidden = game.phase !== 'wave';
  if (game.phase === 'wave') $('enemyPill').textContent = `👾 剩余 ${rem}`;
  $('fpsPill').textContent = `${perfStats.fps} FPS`;

  $('speedBtn').textContent = `${game.speed}×`;
  $('speedBtn').classList.toggle('active', game.speed === 2);
  $('pauseBtn').textContent = paused ? '继续' : '暂停';
  $('soundBtn').textContent = AudioKit.enabled ? '🔊' : '🔇';
  $('heroPanelBtn').textContent = `👑 属性/体检 (${h.gear.length}/${HERO_GEAR_SLOTS}) [C]`;
  $('heroPanelBtn').classList.toggle('active', game.inspTarget?.type === 'hero');
  const autoPaused = game.autoWave && game.phase === 'prep' && hasPendingDecision();
  $('autoWaveBtn').textContent = `自动下波：${game.autoWave ? (autoPaused ? '暂停(待选)' : '开') : '关'}`;
  $('autoWaveBtn').classList.toggle('active', game.autoWave);

  const comboCnt = Object.keys(h.combos).length;
  const btCnt = (h.breakthroughs.w10 ? 1 : 0) + (h.breakthroughs.w20 ? 1 : 0);
  const w10Tag = h.breakthroughs.w10 ? ` · W10:${h.breakthroughs.w10.branchName}` : '';
  const w20Tag = h.breakthroughs.w20?.directionName ? ` · W20:${h.breakthroughs.w20.directionName}` : '';
  $('metaBadge').textContent = `✨ 突破 ${btCnt}/2${w10Tag}${w20Tag} · 组合 ${comboCnt}/4`;

  const dc = $('dashCd');
  if (h.dashCd > 0) { dc.hidden = false; dc.textContent = `${h.dashCd.toFixed(1)}s`; } else dc.hidden = true;
  const uc = $('ultCd');
  if (h.ultTimer > 0) { uc.hidden = false; uc.textContent = `🔥${h.ultTimer.toFixed(1)}s`; }
  else if (h.ultCd > 0) { uc.hidden = false; uc.textContent = `${h.ultCd.toFixed(1)}s`; }
  else uc.hidden = true;

  const wb = $('waveBtn');
  wb.disabled = isWave || ['won','lost'].includes(game.phase);
  if (game.phase === 'harvest') {
    $('waveBtnNm').textContent = '收菜中…';
    $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
  } else if (isWave) {
    $('waveBtnNm').textContent = `第 ${game.wave} 波激战`;
    $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
  } else if (game.finalPrep?.active) {
    $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
    $('waveBtnSb').textContent = game.finalPrep.awaitingWaveRewards
      ? '📦 先结清波末奖励'
      : `⏳ 终局整备 ${Math.ceil(game.finalPrep.timer)}s`;
  } else {
    $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
    $('waveBtnSb').textContent = game.pendingBreakthrough
      ? '⚡ 请先完成突破'
      : (game.chests.length ? `📦 地面${game.chests.length}箱` : game.wave % 5 === 0 ? '⚠️ 首领波' : `${meta.tag}`);
  }

  const freeMetaRefreshReady = hasMetaAux('aux_shop_first_refresh') && game.metaRunState && !game.metaRunState.freeRefreshUsedThisWave;
  $('rerollBtn').disabled = !freeMetaRefreshReady && game.gold < game.rerollCost;
  $('rerollCost').textContent = freeMetaRefreshReady ? '免费(商路先机)' : `${game.rerollCost} 金币`;

  renderSealStrip(force);
  renderSkillStrip(force);
  renderBattleHud(force);
  renderLeftHud(force);
  renderShop(force);
  renderBag(force);
  renderInspector(force);
  syncOffsets();
}

function syncHudResponsiveMode(){
  const compact = (window.innerWidth || 1280) <= 980;
  if (compactHudMode === compact) return;
  compactHudMode = compact;
  const build = $('leftHud'), battle = $('battleHud');
  if (build) build.classList.toggle('collapsed', compact);
  if (battle) battle.classList.toggle('collapsed', compact);
  const buildBtn = $('leftHudToggle'), battleBtn = $('battleHudToggle');
  if (buildBtn) buildBtn.textContent = compact ? '展开 [Tab]' : '折叠 [Tab]';
  if (battleBtn) battleBtn.textContent = compact ? '展开' : '折叠';
}

function toggleBattleHud(){
  const hud = $('battleHud');
  if (!hud) return;
  if (compactHudMode) $('leftHud')?.classList.add('collapsed');
  const col = hud.classList.toggle('collapsed');
  const btn = $('battleHudToggle');
  if (btn) btn.textContent = col ? '展开' : '折叠';
}

function toggleLeftHud(){
  const hud = $('leftHud');
  if (!hud) return;
  if (compactHudMode) $('battleHud')?.classList.add('collapsed');
  const col = hud.classList.toggle('collapsed');
  const btn = $('leftHudToggle');
  if (btn) btn.textContent = col ? '展开 [Tab]' : '折叠 [Tab]';
}

function renderBattleHud(force){
  const body = $('battleHudBody');
  if (!body || !game) return;
  const h = game.hero;
  const alive = game.enemies.filter(e => e.hp > 0);
  const queued = game.waveQueue.filter(w => !w.spawned).length;
  const remaining = alive.length + queued;
  const bosses = alive.filter(e => String(e.kind || '').indexOf('boss') === 0).length;
  const elites = alive.filter(e => e.kind === 'elite').length;
  const hpPct = clamp((h.hp / Math.max(1, h.maxHp)) * 100, 0, 100);
  const shieldPct = clamp((h.shield / Math.max(1, h.maxHp)) * 100, 0, 100);
  const meta = getWavePhaseMeta(game.wave);
  const phaseLabels = {
    prep: game.finalPrep?.active
      ? (game.finalPrep.awaitingWaveRewards ? '波末奖励结清中' : `终局整备 (${Math.ceil(game.finalPrep.timer)}s)`)
      : '备战中',
    wave: (game.wave === MAIN_WAVES && game.w30Battle?.active) ? `终局决战 (${Math.floor(game.w30Battle.elapsedSeconds || 0)}s)` : '激战中',
    harvest: '战利品结算',
    won: '已通关',
    lost: '已陨落'
  };
  const phaseLabel = phaseLabels[game.phase] || game.phase;
  const phaseClass = game.phase === 'wave' ? 'live' : (game.phase === 'won' ? 'done' : '');
  const threatText = bosses > 0
    ? '👑 首领正在场上 · ' + bosses + ' 只'
    : elites > 0
      ? '🟣 精英正在场上 · ' + elites + ' 只'
      : game.phase === 'wave' && game.wave % 5 === 0
        ? '⚠️ 首领波进行中 · 首领尚未入场'
        : game.phase === 'wave'
          ? '普通敌潮 · ' + alive.length + ' 只在场'
          : (game.wave % 5 === 0 ? '⚠️ 下一场是首领波' : '暂未发现高危单位');
  const threatClass = bosses > 0 ? 'danger' : (elites > 0 ? 'elite' : '');

  // Stage 3 & Stage 5 Wave Intel / Encounter Info (NO pre-wave spoilers for W25-W28 regular enemies!)
  const w20Intel = (game.wave === 19 || game.wave === 20) ? getW20BossIntel() : null;
  const w30Intel = (game.wave >= 29 || game.finalPrep?.active) ? getW30BossIntel() : null;
  const w30Battle = game.wave === MAIN_WAVES ? game.w30Battle : null;
  const encInfo = getWaveEncounterInfo(game.wave);
  const omen = getEndgameOmenState();

  const key = [
    game.wave, game.phase, game.finalPrep?.active ? `${game.finalPrep.awaitingWaveRewards?1:0}:${Math.ceil(game.finalPrep.timer)}` : 0,
    remaining, alive.length, queued, bosses, elites,
    Math.ceil(h.hp), h.maxHp, Math.ceil(h.shield), game.stats.kills,
    game.stats.elites, Math.floor(game.stats.dmgTotal / 50),
    w20Intel?.revealed ? w20Intel.auxKey : '',
    w30Intel?.revealed ? w30Intel.auxKey : '',
    w30Battle ? `${w30Battle.phase}:${Math.floor(w30Battle.elapsedSeconds || 0)}:${w30Battle.signatureLockActive ? 1 : 0}` : '',
    encInfo ? `${encInfo.type}:${encInfo.revealed}:${encInfo.id || encInfo.themeKey || ''}` : '',
    omen.triggered ? `${omen.midWaveTriggered}:${omen.clearTriggered}` : ''
  ].join('|');
  if (!force && key === lastBattleHudKey) return;
  lastBattleHudKey = key;

  let stage3IntelHtml = '';
  if (w20Intel?.revealed) {
    stage3IntelHtml +=
      '<div class="lh-sec"><div class="lh-sec-t"><span>🔎 W20 首领情报</span><span>天劫魔尊</span></div>' +
        '<div class="bh-meta-line" style="color:#ffdce6"><b>核心：</b>' + w20Intel.coreName + '</div>' +
        '<div class="bh-meta-line" style="color:#ff9ec4"><b>辅助：</b>' + w20Intel.auxName + '</div>' +
        '<div class="bh-meta-line">' + w20Intel.auxDesc + '</div>' +
      '</div>';
  }
  if (w30Intel?.revealed) {
    const w30PhaseLabelMap = {
      opening: '开场交锋 (100%→80%)',
      signature_telegraph: '🛡️ 招牌锁血预警 (0扣血)',
      signature_shockwave: '🛡️ 招牌锁血冲击波 (0扣血)',
      mid_skirmish: '中段周旋 (80%→35%)',
      final_combo: '🔥 末段组合 (35%→0%)',
      ended: '已结束'
    };
    const w30LiveLine = w30Battle
      ? '<div class="bh-meta-line" style="color:#ffe28a"><b>阶段：</b>' + (w30PhaseLabelMap[w30Battle.phase] || w30Battle.phase) + ' · <b>' + Number(w30Battle.elapsedSeconds || 0).toFixed(1) + 's</b></div>'
      : '';
    stage3IntelHtml +=
      '<div class="lh-sec"><div class="lh-sec-t"><span>👑 W30 深渊主宰情报</span><span>' + (game.finalPrep?.active ? (game.finalPrep.awaitingWaveRewards ? '结清波末奖励' : `整备 ${Math.ceil(game.finalPrep.timer)}s`) : '已揭晓') + '</span></div>' +
        '<div class="bh-meta-line" style="color:#ffdce6"><b>固定核心：</b>' + w30Intel.coreName + '</div>' +
        '<div class="bh-meta-line" style="color:#ff9ec4"><b>本局辅助：</b>' + w30Intel.auxName + '</div>' +
        '<div class="bh-meta-line">' + w30Intel.auxDesc + '</div>' +
        w30LiveLine +
      '</div>';
  }
  if (encInfo && encInfo.type === 'w22_24_shared_threat') {
    stage3IntelHtml +=
      '<div class="lh-sec"><div class="lh-sec-t"><span>🔥 W22–W24 同源威胁</span><span>强度 ' + encInfo.pressureLevel + '/3</span></div>' +
        '<div class="bh-meta-line" style="color:#ffe48a"><b>主题：</b>' + encInfo.themeName + '</div>' +
        '<div class="bh-meta-line">' + encInfo.comboLabel + '</div>' +
      '</div>';
  } else if (encInfo && encInfo.type === 'w25_28_random') {
    stage3IntelHtml +=
      '<div class="lh-sec"><div class="lh-sec-t"><span>🎲 W25–W28 独立敌群</span><span>' + (encInfo.revealed ? '已揭晓' : '未揭晓') + '</span></div>' +
        '<div class="bh-meta-line">' + (encInfo.revealed ? ('本波敌群：<b>' + encInfo.name + '</b>') : '普通敌群组合将在开战后独立抽取揭晓（无战前剧透）') + '</div>' +
      '</div>';
  }
  if (omen.triggered && (game.wave === 28 || game.wave === 29)) {
    stage3IntelHtml += '<div class="omen-badge">🌑 <b>终局预兆：</b>深渊危机逼近，W29 战后开启 90s 最终整备迎战 W30！</div>';
  }

  body.innerHTML =
    '<div class="lh-sec">' +
      '<div class="bh-wave-row"><div><span class="bh-wave-kicker">当前战局</span><div class="bh-wave-name">第 ' + game.wave + ' / ' + MAIN_WAVES + ' 波</div></div>' +
      '<span class="bh-phase ' + phaseClass + '">' + phaseLabel + '</span></div>' +
      '<div class="bh-meta-line">' + meta.tag + ' · ' + getRealmStageLabel() + '</div>' +
      '<div class="bh-remain"><strong>' + remaining + '</strong><span>剩余敌人</span><small>场上 ' + alive.length + ' · 待刷新 ' + queued + '</small></div>' +
    '</div>' +
    stage3IntelHtml +
    '<div class="lh-sec"><div class="lh-sec-t"><span>❤️ 领主状态</span><span>' + (hpPct < 35 ? '危险' : '生命线') + '</span></div>' +
      '<div class="bh-vital-line"><span>生命值</span><b>' + Math.ceil(h.hp) + ' / ' + h.maxHp + '</b></div>' +
      '<div class="bh-track ' + (hpPct < 35 ? 'hp-low' : '') + '"><i style="width:' + hpPct + '%"></i></div>' +
      '<div class="bh-vital-meta">护盾 ' + Math.ceil(h.shield) + (h.shield > 0 ? ' · 吸收伤害' : ' · 暂无护盾') + '</div>' +
      (h.shield > 0 ? '<div class="bh-track"><i style="width:' + shieldPct + '%;background:linear-gradient(90deg,#58bfff,#b4e9ff)"></i></div>' : '') +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>🚨 威胁监测</span><span>' + (bosses + elites) + ' 高危单位</span></div>' +
      '<div class="bh-threat ' + threatClass + '">' + threatText + '</div>' +
      '<div class="bh-meta-line">敌潮剩余 ' + remaining + ' · 当前场上 ' + alive.length + '</div>' +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>📊 本局战绩</span><span>实时</span></div>' +
      '<div class="bh-metrics">' +
        '<div class="bh-metric"><b>' + game.stats.kills.toLocaleString() + '</b><small>累计击杀</small></div>' +
        '<div class="bh-metric"><b>' + game.stats.elites.toLocaleString() + '</b><small>精英击杀</small></div>' +
        '<div class="bh-metric"><b>' + Math.round(game.stats.dmgTotal).toLocaleString() + '</b><small>累计伤害</small></div>' +
      '</div>' +
    '</div>';
}

function gearListSig(list){
  return (list || []).map(g => {
    if (!g || typeof g !== 'object') return String(g || '');
    if (isBagSeal(g)) return `seal:${g.uid}:${g.kind}:${g.star}`;
    const af = (g.affixes || []).map(a => a ? `${a.id}:${a.tier || 1}` : '_').join('+');
    return `${g.uid}:${g.enhanceLv || 0}:${g.slotsCount}:${af}`;
  }).join(',');
}

function renderLeftHud(force){
  const body = $('leftHudBody');
  const panel = $('leftHud');
  if (panel) panel.hidden = !!game?.inspTarget;
  if (!body || !game) return;
  const h = game.hero;
  const syn = getSynergyCounts();
  const activeSets = getActiveGearSets();
  const setCounts = getGearSetCounts();
  const duals = getActiveDualResonances();
  const gearAffixSyn = getActiveGearAffixSynergies();
  const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}:${game.seal.route || ''}` : '0';
  const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
  const skSig = Object.entries(h.skills).map(([k,v]) => k + v + (h.w10Branch?.[k] || '')).join(',');
  const w20Sig = `${game.wave}:${game.w20State?.preselectedDirection || ''}:${game.w20State?.locked ? 1 : 0}:${h.breakthroughs.w20?.directionKey || ''}:${h.breakthroughs.w20?.enhancementKey || ''}`;
  const destSig = `${game.transferTokens || 0}:${(game.rewardStash || []).length}:${getPendingDestinyOffer()?.offerId || ''}:${Object.keys(h.destinyEnhancements || {}).join(',')}`;
  const key = [
    sealSig, subSig, gearListSig(h.gear), skSig, Object.keys(h.combos).join(','),
    Object.keys(h.perks).join(','), h.realm, h.lv, game.gold, game.materials, w20Sig, destSig
  ].join('|');
  if (!force && key === lastLeftHudKey) return;
  lastLeftHudKey = key;

  let sealHtml = '';
  if (game.seal) {
    const sp = ARTIFACTS[game.seal.kind], st = getSealStats(game.seal);
    const routeSpec = game.seal.route ? SEAL_SPECIALIZATIONS[game.seal.elem]?.[game.seal.route] : null;
    const routeTxt = routeSpec ? ` · ${routeSpec.name}` : (game.seal.star >= 3 ? ' · ⚡可选3★专精' : '');
    sealHtml += '<button type="button" class="bh-item" data-open-seal title="' + sp.desc + '">' +
      '<span class="bh-item-icon">' + sp.icon + '</span><span class="bh-item-main"><b>主灵印 · ' + sp.name + routeTxt + '</b>' +
      '<small>' + '★'.repeat(game.seal.star) + ' · ' + st.dmg + ' 伤害 / ' + st.cd.toFixed(2) + 's</small></span><span class="bh-item-tag">主</span></button>';
  } else {
    sealHtml += '<div class="bh-empty">尚未铭刻主灵印 · 在底部商店选择五行灵印</div>';
  }
  game.subSeals.forEach((sub, idx) => {
    const sp = ARTIFACTS[sub.kind], res = SUB_SEAL_RESONANCE[sub.elem];
    sealHtml += '<button type="button" class="bh-item" data-open-seal title="' + res.desc(sub.star) + '">' +
      '<span class="bh-item-icon">' + sp.icon + '</span><span class="bh-item-main"><b>辅印 ' + (idx + 1) + ' · ' + res.name + '</b>' +
      '<small>' + sub.star + '★ · ' + (sub.star >= 3 ? '已达辅印上限' : '升阶进度 ' + sub.prog + '/' + SEAL_FUSE_NEED[sub.star]) + '</small></span><span class="bh-item-tag">辅</span></button>';
  });

  let synergyHtml = '';
  for (const ek of Object.keys(ELEMENTS)) {
    const cnt = syn[ek] || 0;
    if (!cnt) continue;
    const el = ELEMENTS[ek];
    const state = cnt >= 4 ? '4层终极' : cnt >= 2 ? '2层激活' : cnt + '/2';
    const pct = Math.min(100, cnt / 4 * 100);
    synergyHtml += '<div class="bh-syn-row"><span class="bh-syn-name">' + el.icon + el.name + '</span>' +
      '<span class="bh-syn-track"><i style="width:' + pct + '%;background:' + el.color + '"></i></span>' +
      '<span class="bh-syn-state">' + state + '</span></div>';
  }
  if (!synergyHtml) synergyHtml = '<div class="bh-empty">尚未形成五行羁绊</div>';
  const dualHtml = duals.length
    ? duals.map(d => '<span class="bh-dual">' + d.icons + ' ' + d.name + '</span>').join('')
    : '<span class="bh-section-note">尚未激活双系共鸣</span>';

  const gearSlots = [];
  for (let idx = 0; idx < HERO_GEAR_SLOTS; idx++) {
    const inst = h.gear[idx];
    if (!inst) {
      gearSlots.push('<div class="bh-gear-slot empty">＋ 空槽</div>');
      continue;
    }
    const sp = GEARS[gearBase(inst)] || {};
    const stSpec = getSourceStageSpec(inst.sourceStage || 1);
    const fullDesc = describeGearInstance(inst);
    const safeTitle = String(fullDesc).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const afShort = (inst.affixes || []).filter(Boolean).map(a => GEAR_AFFIXES[a.id]?.name || a.id).join('·') || '无词条';
    gearSlots.push(
      '<div class="bh-gear-slot">' +
        '<button type="button" class="bh-gear-open" data-open-hero title="' + safeTitle + '">' +
          '<span class="bh-gear-icon">' + (sp.icon || '🧩') + '</span>' +
          '<b>' + gearLabel(inst) + ' [' + (inst.slotsCount || 1) + '槽]</b>' +
          '<small>' + (GEAR_RARITY_LABELS[inst.rarity] || '凡品') + '·' + stSpec.label.slice(0, 3) + ' · ' + afShort + '</small>' +
        '</button>' +
        '<button type="button" class="bh-unequip" data-lh-unequip="' + idx + '" title="卸回背包">×</button>' +
      '</div>'
    );
  }

  let affixSynHtml = '';
  if (gearAffixSyn.active.length) {
    affixSynHtml += gearAffixSyn.active.map(s =>
      `<div class="syn-badge ${s.badgeClass}"><b>${s.icon} ${s.name}（${s.short}）</b><br>${s.desc}</div>`
    ).join('');
  }
  const nonTrioHints = (gearAffixSyn.hints || []).filter(ht => ht.state !== 'trio');
  if (nonTrioHints.length) {
    affixSynHtml += nonTrioHints.map(ht => `<div class="syn-badge hint">💡 ${ht.text}</div>`).join('');
  }
  if (!affixSynHtml) {
    affixSynHtml = '<div class="bh-section-note">尚未激活词条联动 · 凑齐火系(炽炎烙印/爆燃核心/余烬连环)或冰系(寒霜侵骨/凝冰护心/凛冬反震)激活双/三联动</div>';
  }

  // Stage 3 W20 Preselect / Active Breakthrough card in Left HUD
  let w20HudHtml = '';
  if (h.breakthroughs.w20 && !h.breakthroughs.w20.placeholder) {
    const w20 = h.breakthroughs.w20;
    w20HudHtml =
      '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ W20 第二次突破</span><span>已生效</span></div>' +
        '<div class="syn-badge ' + (w20.directionKey === 'frost_bastion_counter' ? 'frost' : 'fire') + '">' +
          '<b>' + (w20.directionIcon || '⚡') + ' ' + w20.directionName + (w20.enhancementName ? (' × ' + w20.enhancementName) : '') + '</b><br>' +
          (w20.enhancementDesc || w20.baseEffectDesc || '') +
        '</div>' +
      '</div>';
  } else if (isW20PreselectOpen()) {
    const preSpec = game.w20State?.preselectedDirection ? W20_DIRECTIONS[game.w20State.preselectedDirection] : null;
    w20HudHtml =
      '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ W20 方向预选</span><span>W16–W19可调</span></div>' +
        '<button type="button" class="bh-item" data-open-w20-preselect>' +
          '<span class="bh-item-icon">' + (preSpec ? preSpec.icon : '⚡') + '</span>' +
          '<span class="bh-item-main"><b>' + (preSpec ? ('已预选：' + preSpec.name) : '点击预选 W20 突破方向') + '</b>' +
          '<small>击败 W20 首领拿到突破凭证后，已锁定方向的基础效果才会生效</small></span>' +
          '<span class="bh-item-tag">预选</span>' +
        '</button>' +
      '</div>';
  }

  let setHtml = '';
  for (const [sk, n] of Object.entries(setCounts)) {
    if (!n || !GEAR_SETS[sk]) continue;
    const st = GEAR_SETS[sk];
    if (n >= 2) {
      const active = activeSets.find(x => x.key === sk);
      setHtml += '<div class="bh-set-row">✅ ' + st.icon + st.name + ' · ' + n + '/3' +
        '<small>' + (active ? active.desc : st.d2) + '</small></div>';
    } else {
      setHtml += '<div class="bh-set-row">' + st.icon + st.name + ' · 1/2' +
        '<small>再装备 1 件激活：' + st.d2 + '</small></div>';
    }
  }
  if (!setHtml) setHtml = '<div class="bh-section-note">尚未形成套装 · 同系列构装可激活 2/3 件效果</div>';

  const skillEntries = Object.entries(h.skills).filter(([,v]) => v > 0);
  const skillHtml = skillEntries.length
    ? skillEntries.map(([k, lv]) => {
        const spec = HERO_SKILLS[k];
        const bKey = h.w10Branch?.[k];
        const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
        return '<button type="button" class="bh-skill" data-open-hero title="点击查看详细属性与突破分支">' +
          '<span>' + spec.icon + ' ' + spec.name + (bSpec ? ' · ' + bSpec.name : '') + '</span><b>Lv.' + lv + '</b></button>';
      }).join('')
    : '<div class="bh-empty">尚未习得神通</div>';
  const comboHtml = COMBO_LIST.filter(c => !!h.combos[c.key]).map(c =>
    '<div class="bh-combo">✨ ' + c.icon + ' ' + c.name + ' <b>已觉醒</b></div>'
  ).join('') || '<div class="bh-section-note">组合技 ' + Object.keys(h.combos).length + '/4 · 满足阶段节点与等级条件后觉醒</div>';

  const ownedDestiny = getOwnedDestinyEnhancements();
  const destinyHudHtml = ownedDestiny.length
    ? '<div class="lh-sec"><div class="lh-sec-t"><span>🎲 天命专属强化</span><span>' + ownedDestiny.length + ' 项生效</span></div>' +
      ownedDestiny.map(d => '<div class="bh-set-row">' + d.icon + ' <b>' + d.name + '</b><small>' + d.desc + '</small></div>').join('') +
      '</div>'
    : '';

  const sealSlotsUsed = (game.seal ? 1 : 0) + game.subSeals.length;
  body.innerHTML =
    w20HudHtml +
    destinyHudHtml +
    '<div class="lh-sec"><div class="lh-sec-t"><span>✨ 灵印阵盘</span><span>' + sealSlotsUsed + ' 个已占用</span></div>' +
      sealHtml +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ 装备词条联动</span><span>' + gearAffixSyn.active.length + ' 项激活</span></div>' +
      affixSynHtml +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>🛡️ 构装与套装</span><span>' + h.gear.length + '/' + HERO_GEAR_SLOTS + '</span></div>' +
      '<div class="bh-gear-grid">' + gearSlots.join('') + '</div>' + setHtml +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>🌈 五行羁绊</span><span class="bh-section-note">2 / 4 层</span></div>' +
      synergyHtml + '<div class="bh-dual-list">' + dualHtml + '</div>' +
    '</div>' +
    '<div class="lh-sec"><div class="lh-sec-t"><span>⚔️ 神通与阶段突破</span><span>' + skillEntries.length + ' 项神通</span></div>' +
      '<div class="bh-skill-list">' + skillHtml + '</div>' + comboHtml +
      '<div class="bh-build-footer"><span>节点 ' + getRealmStageLabel() + '</span><span>⚙️' + (game.materials || 0) + ' · 🔮' + (game.transferTokens || 0) + ((game.rewardStash?.length || 0) ? ` · 📦暂存${game.rewardStash.length}` : '') + '</span></div>' +
    '</div>';

  body.querySelectorAll('[data-open-w20-preselect]').forEach(btn => {
    btn.addEventListener('click', () => openW20PreselectModal());
  });
  body.querySelectorAll('[data-open-seal]').forEach(btn => {
    btn.addEventListener('click', () => {
      game.inspTarget = { type:'seal' };
      renderAllUI(true);
    });
  });
  body.querySelectorAll('[data-open-hero]').forEach(btn => {
    btn.addEventListener('click', () => {
      game.inspTarget = { type:'hero' };
      renderAllUI(true);
    });
  });
  body.querySelectorAll('[data-lh-unequip]').forEach(btn => {
    btn.addEventListener('click', () => unequipGear(Number(btn.dataset.lhUnequip)));
  });
}

function renderSealStrip(force){
  const s = game.seal;
  const cap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
  const key = `${s ? `${s.kind}:${s.star}:${s.prog}` : 'none'}:${cap}:${subCap}:${subSig}:${game.inspTarget?.type==='seal'?1:0}`;
  if (!force && key === lastArtKey) return;
  lastArtKey = key;
  const wrap = $('sealStrip');
  if (!wrap) return;
  wrap.replaceChildren();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'seal-badge';
  if (!s) {
    btn.textContent = `✨ 未铭刻主灵印（上限 ${cap}★）`;
    btn.addEventListener('click', () => toast('点击底栏商店任意五行灵印即可铭刻附魔！'));
  } else {
    const spec = ARTIFACTS[s.kind], el = ELEMENTS[s.elem];
    btn.style.borderColor = el.color;
    const synTag = s.star >= 5 ? '4层终极羁绊' : s.star >= 3 ? '2层羁绊激活' : `3★激羁绊`;
    const progTxt = s.star >= 5 ? '满阶' : s.star >= cap ? `需节点升${cap+1}★` : `${s.prog}/${SEAL_FUSE_NEED[s.star]}`;
    btn.innerHTML = `<span>${spec.icon} <b>主:${spec.name}</b> ${'★'.repeat(s.star)}</span><span class="tier-tag">${progTxt}</span><span class="tier-tag" style="color:${el.color}">${synTag}</span>`;
    btn.title = `${spec.desc}\n[2层(3★)] ${el.t1}\n[4层(5★)] ${el.t2}\n点击查看主辅灵印阵盘或卸售`;
    btn.addEventListener('click', () => {
      game.inspTarget = game.inspTarget?.type === 'seal' ? null : { type:'seal' };
      renderAllUI(true);
    });
  }
  wrap.append(btn);

  // 2 Sub-Seal Resonance Slots (unlocked at W6 and W10 breakthrough)
  for (let i = 0; i < 2; i++) {
    const sub = game.subSeals[i];
    const unlocked = i < subCap;
    const chip = document.createElement('button');
    chip.type = 'button';
    if (sub) {
      const spec = ARTIFACTS[sub.kind], el = ELEMENTS[sub.elem], res = SUB_SEAL_RESONANCE[sub.elem];
      chip.className = 'sub-seal-chip';
      chip.style.borderColor = el.color;
      chip.innerHTML = `${spec.icon} <b>辅:${res.name}</b> ${sub.star}★`;
      chip.title = `${res.desc(sub.star)}\n点击打开灵印阵盘可卸售或查看详情`;
      chip.addEventListener('click', () => {
        game.inspTarget = { type:'seal' };
        renderAllUI(true);
      });
    } else if (unlocked) {
      chip.className = 'sub-seal-chip empty';
      chip.textContent = `+ 辅印${i + 1} (空)`;
      chip.title = '商店购买异系灵印将自动铭刻入辅印槽触发五行共鸣！';
      chip.addEventListener('click', () => toast('在底栏商店购买异系灵印，即可自动装入辅灵印槽触发共鸣！'));
    } else {
      chip.className = 'sub-seal-chip locked';
      chip.textContent = `🔒 辅${i + 1}(${i === 0 ? 'W6' : 'W10突破'})`;
      chip.title = `达成【${i === 0 ? '第 6 波节点' : 'W10 大型突破'}】后解锁第 ${i + 1} 辅灵印共鸣槽`;
    }
    wrap.append(chip);
  }
}

function renderSkillStrip(force){
  const entries = Object.entries(game.hero.skills).filter(([,lv]) => lv > 0);
  const key = entries.map(([k,v]) => `${k}:${v}:${game.hero.w10Branch?.[k] || ''}`).join('|');
  if (!force && key === lastSkillKey) return;
  lastSkillKey = key;
  const wrap = $('skillStrip');
  if (!wrap) return;
  wrap.replaceChildren();
  for (const [k, lv] of entries) {
    const spec = HERO_SKILLS[k];
    const bKey = game.hero.w10Branch?.[k];
    const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sk-chip';
    btn.title = `${spec.name} Lv.${lv}/5${bSpec ? ` · W10突破【${bSpec.name}】` : ''}（点击查看详情）`;
    btn.innerHTML = `${spec.icon}<b>Lv.${lv}${bSpec ? '★' : ''}</b>`;
    btn.addEventListener('click', () => {
      game.inspTarget = { type: 'hero' };
      renderAllUI(true);
    });
    wrap.append(btn);
  }
}

let shopCardNodes = null;
function renderShop(force){
  const cap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}:${game.seal.route || ''}` : 'none';
  const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
  const inW29TimedPrep = !!(game.finalPrep?.active && game.finalPrep?.started);
  const key = `${sealSig}:${cap}:${subCap}:${subSig}:${game.wave}:${inW29TimedPrep ? 1 : 0}|` + game.shop.map(s=>`${s.uid}:${s.itemType}:${s.bought?1:0}:${s.cost}:${s.star||0}:${s.pillKey||''}:${s.gear?.uid||''}:${game.gold>=s.cost?1:0}`).join('|');
  if (!force && key === lastShopKey) return;
  lastShopKey = key;

  const sec = $('shopSec');
  if (!shopCardNodes) {
    sec.replaceChildren();
    shopCardNodes = [];
    for (let idx = 0; idx < 4; idx++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-card';
      btn.dataset.shopIdx = String(idx);
      btn.innerHTML = `<span class="elem-dot"></span><span class="merge-tag" hidden></span><span class="ic"></span><span class="nm"></span><span class="cost"></span>`;
      btn.addEventListener('click', () => {
        AudioKit.unlock();
        if (game.shop[idx]?.bought) return;
        if (game.finalPrep?.active && game.finalPrep?.started) {
          openShopPurchaseConfirm(idx);
          return;
        }
        buyShopItem(idx);
      });
      sec.append(btn);
      shopCardNodes.push({
        btn,
        tag: btn.querySelector('.merge-tag'),
        ic: btn.querySelector('.ic'),
        nm: btn.querySelector('.nm'),
        cost: btn.querySelector('.cost')
      });
    }
  }
  game.shop.forEach((item, idx) => {
    const node = shopCardNodes[idx];
    if (!node) return;
    if (item.itemType === 'pill') {
      const p = PILLS[item.pillKey];
      node.btn.className = 'shop-card pill-card';
      node.btn.style.setProperty('--elem-c', '#7ce896');
      node.btn.disabled = item.bought || game.gold < item.cost;
      node.btn.title = `${p.name}：${p.desc}`;
      node.tag.hidden = item.bought;
      node.tag.textContent = '丹药';
      node.ic.textContent = p.icon;
      node.nm.textContent = item.bought ? '已购买' : p.name;
      node.cost.textContent = item.bought ? '—' : `${item.cost} 金`;
      return;
    }

    if (item.itemType === 'gear' && item.gear) {
      const g = item.gear;
      const el = ELEMENTS[g.elem] || { icon: '🧩', name: '无', color: '#8ad8ce' };
      const stSpec = getSourceStageSpec(g.sourceStage);
      const synHints = getGearSynergyHints(g);
      const itemSyns = evaluateItemSynergies(g);
      const afLines = (g.affixes || []).filter(Boolean).map(a => {
        const sp = GEAR_AFFIXES[a.id];
        return sp ? `• ${sp.icon}${sp.name}：${sp.desc(a.tier || 1)}` : '';
      }).join('\n');
      const buyCnt = getShopElemBuyCount(g.elem);
      node.btn.className = `shop-card gear-card ${g.rarity}` + (synHints.length || itemSyns.length ? ' mergeable' : '');
      node.btn.style.setProperty('--elem-c', el.color);
      node.btn.disabled = item.bought || game.gold < item.cost;
      node.btn.title = `${g.name} [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽]\n基础：${describeGearEffect(g)}\n词条：\n${afLines}${itemSyns.length ? `\n单件联动：${itemSyns.map(s => s.name).join('/')}` : ''}${synHints.length ? `\n提示：${synHints.join('；')}` : ''}\n定价：阶段${g.sourceStage} · ${el.name}系已购 ${buyCnt} 次`;
      node.tag.hidden = item.bought;
      node.tag.textContent = `${GEAR_RARITY_LABELS[g.rarity]}·${g.slotsCount}槽`;
      node.ic.textContent = g.icon;
      node.nm.textContent = item.bought ? '已购买' : g.name;
      node.cost.textContent = item.bought ? '—' : `${item.cost} 金`;
      return;
    }

    const spec = ARTIFACTS[item.kind];
    const el = ELEMENTS[spec.elem];
    const sameMain = game.seal && game.seal.kind === item.kind;
    const matchSub = game.subSeals.find(s => s.kind === item.kind);
    const mainAtCap = sameMain && game.seal.star >= cap;
    const subAtCap = !!matchSub && matchSub.star >= 3;
    const atCap = mainAtCap || subAtCap;
    const canFuseMain = sameMain && !mainAtCap && !item.bought;
    const canFuseSub = !!matchSub && !subAtCap && !item.bought;
    const canAddSub = game.seal && !sameMain && !matchSub && game.subSeals.length < subCap && !item.bought;
    const isSwitch = game.seal && !sameMain && !matchSub && game.subSeals.length >= subCap && !item.bought;

    node.btn.className = 'shop-card' + ((canFuseMain || canFuseSub || canAddSub) ? ' mergeable' : '') + (atCap ? ' locked-cap' : '');
    node.btn.style.setProperty('--elem-c', el.color);
    node.btn.disabled = item.bought || game.gold < item.cost || atCap;
    const resDesc = SUB_SEAL_RESONANCE[spec.elem].desc(Math.min(3, item.star));
    const dualHint = DUAL_RESONANCES.filter(d => d.req.includes(spec.elem) || d.req[1] === '_any').map(d => `${d.icons}${d.name}`).join(' / ');
    node.btn.title = `${spec.name} ${item.star}★（${el.icon}${el.name} · 计入+1~+2羁绊）\n[主印] ${spec.desc}\n[辅印] ${resDesc}\n[双系共鸣] ${dualHint}`;

    const pts = item.star === 3 ? 4 : item.star === 2 ? 2 : 1;
    if (canFuseMain) {
      node.tag.hidden = false; node.tag.textContent = `★ 主印+${pts}`;
    } else if (canFuseSub) {
      node.tag.hidden = false; node.tag.textContent = `★ 辅印+${pts}`;
    } else if (canAddSub) {
      node.tag.hidden = false; node.tag.textContent = `✨ 装辅印`;
    } else if (mainAtCap && !item.bought) {
      node.tag.hidden = false; node.tag.textContent = game.seal.star >= 5 ? '主已满5★' : `需节点破限`;
    } else if (subAtCap && !item.bought) {
      node.tag.hidden = false; node.tag.textContent = '辅已满3★';
    } else if (isSwitch) {
      node.tag.hidden = false; node.tag.textContent = `转修换主印`;
    } else {
      node.tag.hidden = true;
    }
    node.ic.textContent = spec.icon;
    node.nm.textContent = item.bought ? '已购买' : `${spec.name}${item.star > 1 ? ` ${item.star}★` : ''}`;
    node.cost.textContent = item.bought ? '—' : `${item.cost} 金${item.disc ? ' 折' : ''}`;
  });
}

function renderBag(force){
  const key = gearListSig(game.bag) + '|' + game.hero.gear.length;
  if (!force && key === lastBagKey) return;
  lastBagKey = key;

  const tray = $('bagTray');
  tray.replaceChildren();
  if (!game.bag.length) {
    const sp = document.createElement('div');
    sp.className = 'bag-empty';
    sp.textContent = '构装背包空\n商店/精英获装';
    tray.append(sp);
    return;
  }
  game.bag.forEach((inst, idx) => {
    if (isBagSeal(inst)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bag-item ' + (inst.rarity || 'rare');
      btn.dataset.bagIdx = String(idx);
      btn.dataset.uid = inst.uid;
      btn.title = `未装备灵印【${inst.name} ${inst.star}★】（安全收纳，不覆盖主灵印）\n左键尝试吸收 · 右键出售换金 · Shift+右键拆解换锻材`;
      btn.innerHTML = `<span class="ic">${inst.icon || '✨'}</span><span class="nm">${inst.name}</span><span class="star-tag">${inst.star}★</span><span class="slot-tag">灵印</span>`;
      btn.addEventListener('click', () => equipGearFromBag(idx));
      btn.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (ev.shiftKey) dismantleBagGear(idx);
        else sellBagGear(idx);
      });
      tray.append(btn);
      return;
    }
    const g = isGearInstance(inst) ? inst : normalizeGearInstance(inst);
    const sellGold = getGearSellGold(g);
    const disMats = getGearDismantleMaterials(g);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bag-item ' + g.rarity;
    btn.dataset.bagIdx = String(idx);
    btn.dataset.uid = g.uid;
    btn.title = `${describeGearInstance(g)}\n左键穿戴 · 右键出售(+${sellGold}金) · Shift+右键拆解(+${disMats}锻材)`;
    btn.innerHTML = `<span class="ic">${g.icon}</span><span class="nm">${g.name}</span>${g.enhanceLv > 0 ? `<span class="star-tag">+${g.enhanceLv}</span>` : ''}<span class="slot-tag">${g.slotsCount}槽</span>`;
    btn.addEventListener('click', () => equipGearFromBag(idx));
    btn.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      if (ev.shiftKey) dismantleBagGear(idx);
      else sellBagGear(idx);
    });
    tray.append(btn);
  });
}

function renderInspector(force){
  const panel = $('inspector');
  if (!game.inspTarget) {
    if (!panel.hidden) { panel.hidden = true; lastInspKey = ''; }
    return;
  }
  if (game.inspTarget.type === 'seal') {
    const a = game.seal;
    if (!a && !game.subSeals.length) { game.inspTarget = null; panel.hidden = true; lastInspKey = ''; return; }
    const cap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    const subSig = game.subSeals.map(s => `${s.kind}:${s.star}:${s.prog}`).join(',');
    const key = ['S', a?.kind || 'none', a?.star || 0, a?.prog || 0, a?.route || '', game.gold, cap, subCap, subSig, gearListSig(game.hero.gear), Math.floor((a?.dmgDealt || 0) / 50)].join('|');
    if (!force && key === lastInspKey && !panel.hidden) return;
    lastInspKey = key;
    panel.hidden = false;

    if (a) {
      const spec = ARTIFACTS[a.kind], st = getSealStats(a);
      const routeSpec = a.route ? SEAL_SPECIALIZATIONS[a.elem]?.[a.route] : null;
      $('inspTitle').textContent = `${spec.icon} 主:${spec.name} ${'★'.repeat(a.star)} ${SEAL_TIER_NAMES[a.star]}${routeSpec ? ` · ${routeSpec.name}` : ''}`;
      $('inspSub').textContent = `[唯一主灵印 + ${subCap} 辅灵印共鸣阵盘] ${spec.desc}`;
      $('inspStats').innerHTML = `
        <div class="stat-box">爆发伤害 <b>${st.dmg}</b><span class="sub">含辅印与领主全局加成</span></div>
        <div class="stat-box">触发内置CD <b>${st.cd.toFixed(2)}s</b><span class="sub">命中即从受击点扩散</span></div>
        <div class="stat-box">主印星阶 <b>${a.star}★ / 上限${cap}★</b><span class="sub">${a.star>=5?'已达巅峰仙印':`下星进度 ${a.prog}/${SEAL_FUSE_NEED[a.star]}`}</span></div>
        <div class="stat-box">3★ 专精路线 <b>${routeSpec ? routeSpec.name : (a.star >= 3 ? '待选择' : '3★解锁')}</b><span class="sub">${routeSpec ? routeSpec.tag : '免费稳健 vs 35金专精'}</span></div>
      `;
    } else {
      $('inspTitle').textContent = `✨ 灵印阵盘`;
      $('inspSub').textContent = `主灵印未铭刻 · 辅印槽 ${game.subSeals.length}/${subCap}`;
      $('inspStats').innerHTML = '';
    }
    $('inspSlotLbl').hidden = true;
    $('inspSlots').replaceChildren();
    const fxWrap = $('inspGearFx');
    fxWrap.replaceChildren();
    if (a) {
      const el = ELEMENTS[a.elem];
      const r1 = document.createElement('div');
      r1.className = 'gear-fx-row';
      r1.innerHTML = `<b>[2层羁绊 · 3★激活]</b> ${el.t1} ${getSynergyCounts()[a.elem] >= 2 ? '✅' : '🔒'}`;
      const r2 = document.createElement('div');
      r2.className = 'gear-fx-row';
      r2.innerHTML = `<b>[4层终极 · 5★激活]</b> ${el.t2} ${getSynergyCounts()[a.elem] >= 4 ? '✅' : '🔒'}`;
      fxWrap.append(r1, r2);

      // Stage 2: 3★ Same-Element Seal Specialization Route comparison & choice
      const routes = SEAL_SPECIALIZATIONS[a.elem];
      if (routes) {
        const routeRow = document.createElement('div');
        routeRow.className = 'gear-fx-row';
        if (a.route && routes[a.route]) {
          routeRow.innerHTML = `<b>✨ 已选 3★ 专精【${routes[a.route].name}】</b>（${routes[a.route].tag}）：${routes[a.route].desc}`;
        } else if (a.star >= 3) {
          routeRow.innerHTML = `<b>⚡ 3★ 专精节点二选一（金币取舍）：</b><br>• <b>${routes.standard.name}</b>（免费）：${routes.standard.desc}<br>• <b>${routes.mastery.name}</b>（${routes.mastery.cost} 金）：${routes.mastery.desc}`;
        } else {
          routeRow.innerHTML = `<b>🔒 3★ 专精节点预览</b>：主印升至 3★ 后可在【${routes.standard.name}(免费)】与【${routes.mastery.name}(${routes.mastery.cost}金)】间择一！`;
        }
        fxWrap.append(routeRow);
      }
    }
    for (let i = 0; i < game.subSeals.length; i++) {
      const sub = game.subSeals[i];
      const sp = ARTIFACTS[sub.kind], res = SUB_SEAL_RESONANCE[sub.elem];
      const row = document.createElement('div');
      row.className = 'gear-fx-row';
      row.innerHTML = `<b>${sp.icon} 辅印 ${i+1} · ${res.name} ${sub.star}★</b>（进度 ${sub.star>=3?'满3★':`${sub.prog}/${SEAL_FUSE_NEED[sub.star]}`}）：${res.desc(sub.star)}`;
      fxWrap.append(row);
    }

    $('inspSkillLbl').hidden = true;
    $('inspSkills').replaceChildren();
    const acts = $('inspActions');
    acts.replaceChildren();
    if (a && a.star >= 3 && !a.route && SEAL_SPECIALIZATIONS[a.elem]) {
      const routes = SEAL_SPECIALIZATIONS[a.elem];
      const bStd = document.createElement('button');
      bStd.type = 'button'; bStd.className = 'btn';
      bStd.innerHTML = `<span>✨ 选 ${routes.standard.name}</span><small>免费 (0 金)</small>`;
      bStd.addEventListener('click', () => chooseSealRoute('standard'));
      const bMas = document.createElement('button');
      bMas.type = 'button'; bMas.className = 'btn gold';
      bMas.disabled = game.gold < routes.mastery.cost;
      bMas.innerHTML = `<span>🔥 选 ${routes.mastery.name}</span><small>消耗 ${routes.mastery.cost} 金</small>`;
      bMas.addEventListener('click', () => chooseSealRoute('mastery'));
      acts.append(bStd, bMas);
    }
    if (a) {
      const spec = ARTIFACTS[a.kind];
      const sell = document.createElement('button');
      sell.type = 'button'; sell.className = 'btn danger full'; sell.dataset.act = 'sell';
      const refund = Math.round(spec.cost * sealTotalPoints(a) * 0.8);
      sell.innerHTML = `<span>卸售主灵印</span><small>返还 +${refund} 金（80% 折价）</small>`;
      sell.addEventListener('click', sellSeal);
      acts.append(sell);
    }
    game.subSeals.forEach((sub, idx) => {
      const sp = ARTIFACTS[sub.kind];
      const refund = Math.round(sp.cost * sealTotalPoints(sub) * 0.8);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn danger';
      b.innerHTML = `<span>卸售辅印${idx+1} (${sp.name})</span><small>返还 +${refund} 金</small>`;
      b.addEventListener('click', () => sellSubSeal(idx));
      acts.append(b);
    });
    return;
  }

  // Hero Inspector (Complete Stats + Independent Gear Instances + Affix Synergies + Enhance/Sell/Dismantle + Telemetry!)
  const h = game.hero, hs = getHeroStats();
  const gearSyn = getActiveGearAffixSynergies();
  const skSig = Object.entries(h.skills).map(([k,v])=>`${k}${v}${h.w10Branch?.[k]||''}`).join(',');
  const pkSig = Object.entries(h.perks).map(([k,v])=>`${k}${v}`).join(',');
  const cbSig = Object.keys(h.combos).join(',');
  const dmgBucket = Math.floor(game.stats.dmgTotal / 120);
  const key = ['H', h.realm, h.lv, Math.ceil(h.hp), h.maxHp, game.gold, game.materials, game.transferTokens || 0, (game.rewardStash || []).length, gearListSig(h.gear), skSig, pkSig, cbSig, gearListSig(game.bag), game.telemetry.length, dmgBucket].join('|');
  if (!force && key === lastInspKey && !panel.hidden) return;
  lastInspKey = key;
  panel.hidden = false;

  const activeNode = getActiveUnlockNode();
  const baseDmgPct = 100 + (h.lv - 1) * 8;
  const gearDmgPct = Math.round(hs.gm.dmgPct * 100);
  const leechCap = Math.max(10, Math.round(h.maxHp * 0.055));
  const maxEnhLv = BALANCE.equipment?.materialEnhance?.maxEnhanceLv || 6;
  $('inspTitle').textContent = `👑 ${getRealmStageLabel()} · Lv.${h.lv}`;
  $('inspSub').textContent = `按 [C] 开关 · 主印上限 ${getSealStarCap()}★ · 辅印 ${game.subSeals.length}/${getSubSealSlotCap()} · 锻材 ⚙️${game.materials || 0} · 转印符 🔮${game.transferTokens || 0}${hs.mmActive ? ' · 🎯一法破万法!' : ''}`;
  $('inspStats').innerHTML = `
    <div class="stat-box">生命 / 护盾 <b>${Math.ceil(h.hp)}/${h.maxHp}</b><span class="sub">护盾 ${Math.ceil(h.shield)} · 移速 ${hs.moveSpd.toFixed(1)}</span></div>
    <div class="stat-box">伤害倍率 <b>${Math.round(hs.dmgMult * 100)}%</b><span class="sub">级${baseDmgPct}% 构+${gearDmgPct}% 节点+${Math.round((activeNode.dmgBonus||0)*100)}%</span></div>
    <div class="stat-box">攻速倍率 <b>${Math.round(hs.aspd * 100)}%</b><span class="sub">神通倍率 ${Math.round(hs.skillDmgMult*100)}%</span></div>
    <div class="stat-box">暴击 / 暴伤 <b>${Math.round(hs.crit*100)}% / ${Math.round(hs.critDmg*100)}%</b><span class="sub">构装暴击 +${Math.round(hs.gm.crit*100)}%</span></div>
    <div class="stat-box">🔥火系引爆 <b>${game.stats.fireDetonations||0}次</b><span class="sub">传递 ${game.stats.fireChainTransfers||0} · 孤立聚焦 ${game.stats.fireFocusedDetonations||0}</span></div>
    <div class="stat-box">❄️冰盾反制 <b>+${game.stats.frostShieldGained||0}盾</b><span class="sub">受击${game.stats.frostHitPulses||0} 冲刺${game.stats.frostDashPulses||0} 满盾${game.stats.frostFullShieldPulses||0}</span></div>
  `;
  $('inspSlotLbl').hidden = false;
  const slots = $('inspSlots');
  slots.replaceChildren();
  for (let s = 0; s < HERO_GEAR_SLOTS; s++) {
    const inst = h.gear[s];
    const sb = document.createElement('button');
    sb.type = 'button';
    sb.className = 'gear-slot' + (inst ? ' filled' : '');
    sb.innerHTML = inst
      ? `<span style="font-size:16px">${inst.icon}</span><span>${gearLabel(inst)}</span><span style="font-size:9px;opacity:.85">${GEAR_RARITY_LABELS[inst.rarity]}·${inst.slotsCount}槽</span>`
      : '<span>+ 空槽</span><span style="font-size:9.5px">点此穿戴</span>';
    sb.addEventListener('click', () => {
      if (inst) unequipGear(s);
      else {
        const firstGearIdx = game.bag.findIndex(x => !isBagSeal(x));
        if (firstGearIdx >= 0) equipGearFromBag(firstGearIdx);
        else toast('构装背包为空，可在底部商店购买或击败精英爆箱获得！', true);
      }
    });
    slots.append(sb);
  }

  const fxWrap = $('inspGearFx');
  fxWrap.replaceChildren();

  // Active Affix Synergies & Missing Affix Upgrade Hints
  if (gearSyn.active.length || gearSyn.hints.length) {
    const synBox = document.createElement('div');
    synBox.className = 'gear-fx-row';
    let html = '<b>⚡ 装备词条联动状态</b>';
    for (const s of gearSyn.active) {
      html += `<span class="syn-badge ${s.badgeClass}"><b>${s.icon} ${s.name}（${s.short}）</b>：${s.desc}</span>`;
    }
    for (const ht of gearSyn.hints) {
      if (ht.state !== 'trio') html += `<span class="syn-badge hint">💡 ${ht.text}</span>`;
    }
    synBox.innerHTML = html;
    fxWrap.append(synBox);
  }

  if (h.gear.length) {
    h.gear.forEach((inst, sIdx) => {
      const stSpec = getSourceStageSpec(inst.sourceStage);
      const enhCost = getGearEnhanceCost(inst);
      const row = document.createElement('div');
      row.className = 'gear-fx-row';
      row.innerHTML = `
        <div><b>${inst.icon} ${gearLabel(inst)}</b> [${GEAR_RARITY_LABELS[inst.rarity]} · ${stSpec.label} · ${inst.slotsCount}槽]</div>
        <div style="font-size:11px;opacity:.9;margin-top:2px">基础：${describeGearEffect(inst)}</div>
        <div style="margin-top:3px">${renderAffixChipsHtml(inst)}</div>
      `;
      const actRow = document.createElement('div');
      actRow.className = 'gear-act-row';
      const enhBtn = document.createElement('button');
      enhBtn.type = 'button';
      enhBtn.className = 'btn';
      enhBtn.disabled = enhCost === null || (game.materials || 0) < enhCost;
      enhBtn.textContent = enhCost === null ? `已满强化 (+${maxEnhLv})` : `⚙️ 锻材强化 (${enhCost}锻材 → +${inst.enhanceLv + 1})`;
      enhBtn.addEventListener('click', () => enhanceGear({ location: 'equipped', idx: sIdx }));
      const uneqBtn = document.createElement('button');
      uneqBtn.type = 'button';
      uneqBtn.className = 'btn';
      uneqBtn.textContent = '卸回背包';
      uneqBtn.addEventListener('click', () => unequipGear(sIdx));
      actRow.append(enhBtn, uneqBtn);
      row.append(actRow);
      fxWrap.append(row);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'gear-fx-row';
    empty.style.opacity = '0.68';
    empty.textContent = '尚未穿戴构装：可在底部商店购买带词条构装，或击败精英/妖碑爆箱后点击背包穿戴。';
    fxWrap.append(empty);
  }

  // Bag Management: Equip/Replace, Enhance, Sell (Gold), Dismantle (Materials) + Safe Bag Seals + Stash
  const acts = $('inspActions');
  acts.replaceChildren();
  if (game.bag.length) {
    game.bag.forEach((inst, idx) => {
      if (isBagSeal(inst)) {
        const spec = ARTIFACTS[inst.kind] || { cost: 22, name: inst.name || '灵印' };
        const pts = inst.star === 3 ? 4 : inst.star === 2 ? 2 : 1;
        const sellVal = Math.max(8, Math.round(spec.cost * pts * 0.65));
        const disMats = Math.max(1, (inst.star || 1) * 2);
        const card = document.createElement('div');
        card.className = 'gear-fx-row';
        card.style.width = '100%';
        card.innerHTML = `<div><b>🎒 ${inst.icon || '✨'} ${inst.name} ${inst.star}★</b> [未装备灵印 · 安全收纳不覆盖主印]</div>`;
        const rowBtns = document.createElement('div');
        rowBtns.className = 'gear-act-row';
        const sellBtn = document.createElement('button');
        sellBtn.type = 'button'; sellBtn.className = 'btn';
        sellBtn.textContent = `💰出售(+${sellVal}金)`;
        sellBtn.addEventListener('click', () => sellBagGear(idx));
        const disBtn = document.createElement('button');
        disBtn.type = 'button'; disBtn.className = 'btn';
        disBtn.textContent = `🔧拆解(+${disMats}锻材)`;
        disBtn.addEventListener('click', () => dismantleBagGear(idx));
        rowBtns.append(sellBtn, disBtn);
        card.append(rowBtns);
        acts.append(card);
        return;
      }
      const g = isGearInstance(inst) ? inst : normalizeGearInstance(inst);
      const stSpec = getSourceStageSpec(g.sourceStage);
      const sellVal = getGearSellGold(g);
      const disMats = getGearDismantleMaterials(g);
      const enhCost = getGearEnhanceCost(g);
      const card = document.createElement('div');
      card.className = 'gear-fx-row';
      card.style.width = '100%';
      card.innerHTML = `
        <div><b>🎒 ${g.icon} ${gearLabel(g)}</b> [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽]</div>
        <div style="margin-top:2px">${renderAffixChipsHtml(g)}</div>
      `;
      const rowBtns = document.createElement('div');
      rowBtns.className = 'gear-act-row';
      const eqBtn = document.createElement('button');
      eqBtn.type = 'button'; eqBtn.className = 'btn';
      if (h.gear.length < HERO_GEAR_SLOTS) {
        eqBtn.textContent = '穿戴';
        eqBtn.addEventListener('click', () => equipGearFromBag(idx));
      } else {
        eqBtn.textContent = '替换槽1';
        eqBtn.addEventListener('click', () => replaceEquippedGear(0, idx));
      }
      const enhBtn = document.createElement('button');
      enhBtn.type = 'button'; enhBtn.className = 'btn';
      enhBtn.disabled = enhCost === null || (game.materials || 0) < enhCost;
      enhBtn.textContent = enhCost === null ? '满强化' : `⚙️强化(${enhCost}材)`;
      enhBtn.addEventListener('click', () => enhanceGear({ location: 'bag', idx }));
      const sellBtn = document.createElement('button');
      sellBtn.type = 'button'; sellBtn.className = 'btn';
      sellBtn.textContent = `💰出售(+${sellVal}金)`;
      sellBtn.addEventListener('click', () => sellBagGear(idx));
      const disBtn = document.createElement('button');
      disBtn.type = 'button'; disBtn.className = 'btn';
      disBtn.textContent = `🔧拆解(+${disMats}锻材)`;
      disBtn.addEventListener('click', () => dismantleBagGear(idx));
      rowBtns.append(eqBtn, enhBtn, sellBtn, disBtn);
      card.append(rowBtns);
      acts.append(card);
    });
  }
  if (game.rewardStash && game.rewardStash.length) {
    game.rewardStash.forEach((entry, sIdx) => {
      const it = entry.item;
      const card = document.createElement('div');
      card.className = 'gear-fx-row';
      card.style.width = '100%';
      card.innerHTML = `<div><b>📦 暂存箱 #${sIdx + 1} · ${it.icon || '✨'} ${it.name}</b> [背包满溢安全暂存]</div>`;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn gold';
      btn.disabled = game.bag.length >= getBagCapacity();
      btn.textContent = game.bag.length >= getBagCapacity() ? '背包满（清理后取出）' : '取出放入背包';
      btn.addEventListener('click', () => claimRewardStashItem(sIdx));
      card.append(btn);
      acts.append(card);
    });
  }

  $('inspSkillLbl').hidden = false;
  const sl = $('inspSkills');
  sl.replaceChildren();

  const totalDmg = Math.max(1, game.stats.dmgTotal);
  const skillKeys = Object.keys(h.skills).filter(k => h.skills[k] > 0);
  for (const k of skillKeys) {
    const lv = h.skills[k];
    const info = getSkillBreakdown(k, lv, hs);
    const dealt = game.stats.skillDmg?.[k] || 0;
    const pct = game.stats.dmgTotal ? Math.round(dealt * 100 / totalDmg) : 0;
    const bKey = h.w10Branch?.[k];
    const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.innerHTML = `
      <div class="sh"><span>${info.name}${bSpec ? ` · <b style="color:#ffd878">[W10:${bSpec.name}]</b>` : ''}</span><span class="lv">${info.lvText}${k !== 'berserk' ? ` · 输出 ${dealt.toLocaleString()} (${pct}%)` : ''}</span></div>
      <div class="dmg">${info.cur}</div>
      ${bSpec ? `<div class="dmg" style="color:#9ef6ff">${bSpec.icon} ${bSpec.tag}：${bSpec.desc}</div>` : ''}
      <div class="next">⬆ ${info.next}</div>
    `;
    sl.append(card);
  }

  // Combo Recipes section
  const cbHead = document.createElement('div');
  cbHead.className = 'insp-sec-lbl';
  cbHead.textContent = `配方组合技（${Object.keys(h.combos).length}/4 · 需两技总等级≥3）`;
  sl.append(cbHead);
  for (const c of COMBO_LIST) {
    const unlocked = activeNode.comboTier >= c.realm;
    const active = !!h.combos[c.key];
    const sumLv = c.req.reduce((s, rk) => s + (h.skills[rk] || 0), 0);
    const row = document.createElement('div');
    row.className = 'skill-card';
    row.style.opacity = unlocked ? '1' : '0.55';
    const reqTxt = c.req.map(rk => `${HERO_SKILLS[rk].name}(Lv.${h.skills[rk]||0})`).join(' + ');
    row.innerHTML = unlocked
      ? `<div class="sh"><span>${c.icon} ${c.name}</span><span class="lv" style="color:${active?'#7ce896':'#95b3ae'}">${active?'已觉醒':`进度 ${sumLv}/3`}</span></div><div class="dmg">${reqTxt} · ${c.desc}</div>`
      : `<div class="sh"><span>🔒 ${c.name}</span><span class="lv">需【${c.realm === 1 ? 'W6 筑基节点' : 'W10 突破节点'}】解锁</span></div>`;
    sl.append(row);
  }

  // Wave Telemetry Report section
  const rep = getTelemetryReport();
  const telHead = document.createElement('div');
  telHead.className = 'insp-sec-lbl';
  telHead.textContent = `📊 心流与难度曲线体检表（已过 ${rep.summary.wavesCleared} 波 · 最低血 ${rep.summary.lowestHpPct}%）`;
  sl.append(telHead);
  const telBox = document.createElement('div');
  telBox.className = 'skill-card';
  if (!rep.waves.length) {
    telBox.innerHTML = `<div class="dmg" style="opacity:.75">完成第 1 波后自动生成各波耗时、受击、最低血量、跑动与秒伤波形。</div>`;
  } else {
    const rows = rep.waves.slice(-6).map(w => {
      const stress = clamp(100 - w.minHpPct + w.hitsTaken * 5, 10, 100);
      const barCol = w.kind === 'peak' ? '#ff5c42' : w.kind === 'relief' ? '#7ce896' : '#5cc8ff';
      return `<tr><td>W${w.wave}</td><td><span class="tel-bar" style="width:${Math.round(stress*0.35)}px;background:${barCol}"></span>${w.phaseTag.slice(0,2)}</td><td>${w.duration}s</td><td style="color:${w.minHpPct<35?'#ff7b6b':'#9bf2d0'}">${w.minHpPct}%</td><td>${w.hitsTaken}</td><td>${w.moveDist}</td></tr>`;
    }).join('');
    telBox.innerHTML = `<table class="tel-table"><tr><th>波</th><th>波形</th><th>耗时</th><th>低血</th><th>受击</th><th>走位</th></tr>${rows}</table>`;
  }
  sl.append(telBox);
}

/* ==================== INPUT HANDLING ==================== */
function handleCanvasClick(wx, wy){
  game.hero.goal = { x: clamp(wx, 1.2, W - 1.2), y: clamp(wy, 1.2, H - 1.2) };
}

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  AudioKit.unlock();
  pointerScreen = { x: e.clientX, y: e.clientY };
  const w = screenToWorld(e.clientX, e.clientY);
  pointerWorld = w;
  pointerDown = true;
  handleCanvasClick(w.x, w.y);
});
window.addEventListener('pointermove', e => {
  pointerScreen = { x: e.clientX, y: e.clientY };
  pointerWorld = screenToWorld(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { pointerDown = false; });
canvas.addEventListener('contextmenu', e => {
  if (game?.inspTarget) { e.preventDefault(); game.inspTarget = null; renderAllUI(); }
});

window.addEventListener('keydown', e => {
  if (!game) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'escape') {
    if (game.activeModal?.type === 'affix_transfer') { cancelAffixTransferPreview(); closeModal(); renderAllUI(); return; }
    if (game.activeModal?.type === 'destiny_gamble' && !getPendingDestinyOffer()) { closeModal(); renderAllUI(); return; }
    if (game.inspTarget) { game.inspTarget = null; renderAllUI(); }
    else if (paused) setPaused(false);
    return;
  }
  if (k === 'tab') { e.preventDefault(); toggleLeftHud(); return; }
  if (game.activeModal) return;
  if (k === ' ' || k === 'e') { e.preventDefault(); castHeroDash(); return; }
  if (k === 'r') { castHeroOverdrive(); return; }
  if (k === 'q') { rollShop(false); return; }
  if (k === 'c') { game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' }; renderAllUI(true); return; }
  if (k === 'enter' && game.phase === 'prep') { startWave(); return; }
  if (k === 'f') { game.speed = game.speed === 2 ? 1 : 2; renderAllUI(); return; }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// Static button listeners
function setPaused(val){
  runtimeCtx.setPaused(val);
  renderAllUI();
  return paused;
}
$('speedBtn').addEventListener('click', () => { game.speed = game.speed === 2 ? 1 : 2; renderAllUI(); });
$('pauseBtn').addEventListener('click', () => {
  if (!paused && game?.phase === 'prep' && game?.finalPrep?.active && game.finalPrep.started) {
    toast('⏳ W29 终局整备倒计时按真实时间流逝，不可暂停！');
    renderAllUI();
    return;
  }
  setPaused(!paused);
});
$('soundBtn').addEventListener('click', () => { AudioKit.enabled = !AudioKit.enabled; renderAllUI(); });
$('helpBtn').addEventListener('click', showIntroModal);
$('resetBtn').addEventListener('click', () => startNewRun());
$('dashBtn').addEventListener('click', castHeroDash);
$('ultBtn').addEventListener('click', castHeroOverdrive);
$('rerollBtn').addEventListener('click', () => rollShop(false));
$('waveBtn').addEventListener('click', startWave);
$('inspClose').addEventListener('click', () => { game.inspTarget = null; renderAllUI(); });
$('leftHudHead')?.addEventListener('click', toggleLeftHud);
$('battleHudHead')?.addEventListener('click', toggleBattleHud);
$('heroPill').addEventListener('click', () => {
  if (game.pendingBreakthrough === 'w10' && !game.hero.breakthroughs.w10) {
    game.activeModal = { type: 'w10_breakthrough', step: game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
    renderW10BreakthroughModal();
  } else if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
    openW20BreakthroughModal();
  } else {
    game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' };
    renderAllUI(true);
  }
});
$('w20PrepBtn')?.addEventListener('click', () => {
  if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
    openW20BreakthroughModal();
  } else if (isW20PreselectOpen()) {
    openW20PreselectModal();
  }
});
$('destinyBtn')?.addEventListener('click', () => openDestinyGambleModal());
$('transferBtn')?.addEventListener('click', () => openAffixTransferModal());
$('metaLegacyBtn')?.addEventListener('click', () => openMetaLegacyModal());
$('metaBadge').addEventListener('click', () => {
  game.inspTarget = { type:'hero' }; renderAllUI(true);
});
$('heroPanelBtn').addEventListener('click', () => {
  game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' };
  renderAllUI(true);
});
$('autoWaveBtn').addEventListener('click', () => {
  game.autoWave = !game.autoWave;
  if (game.autoWave && game.phase === 'prep') {
    if (hasPendingDecision()) {
      game.autoWavePausedForDecision = true;
      game.autoWaveTimer = 4.0;
    } else {
      game.autoWavePausedForDecision = false;
      game.autoWaveTimer = 2.0;
    }
  }
  renderAllUI();
});
syncHudResponsiveMode();
window.addEventListener('resize', () => { fitCamera(); syncOffsets(); syncHudResponsiveMode(); });

/* ==================== DEBUG CONTRACT: BG60.loadTestPreset ==================== */
function loadTestPreset({ wave = 10, tier = 'standard', build = 'fire', materials, gold, transferTokens, seed = 2026 } = {}){
  const targetWave = clamp(Math.round(Number(wave) || 10), 1, MAIN_WAVES);
  const normTier = ['weak', 'standard', 'strong'].includes(tier) ? tier : 'standard';
  const normBuild = ['fire', 'frost'].includes(build) ? build : 'fire';
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) : 2026;

  runtimeCtx.setPaused(false);
  closeModal();
  runtimeCtx.setGame(makeGame(runSeed));
  game.wave = targetWave;
  game.phase = 'prep';
  game.subPhase = null;
  game.pendingModals = [];
  game.activeModal = null;
  game.pendingBreakthrough = null;
  game.w10Draft = null;
  game.w20Draft = null;
  game.inspTarget = null;

  const h = game.hero;
  // W10 pre-battle and W20 pre-battle use state BEFORE completing that wave's breakthrough
  const hasW10 = targetWave >= 11;
  const hasW20 = targetWave >= 21;

  // Compute level & baseMaxHp appropriate for wave & tier
  const tierLvOffset = normTier === 'strong' ? 2 : normTier === 'weak' ? -1 : 0;
  const baseLv = Math.max(1, Math.round(1 + (targetWave - 1) * 0.78) + tierLvOffset);
  h.lv = baseLv;
  h.xp = 0;
  h.xpNext = xpForLevel(h.lv);

  let calcBaseHp = BALANCE.progression.initialHp;
  for (let l = 2; l <= h.lv; l++) {
    calcBaseHp += (l % 2 === 0) ? BALANCE.progression.hpEvenLevelGain : BALANCE.progression.hpOddLevelGain;
  }
  if (hasW10) calcBaseHp += 40;
  if (hasW20) calcBaseHp += 60;
  if (normTier === 'strong') calcBaseHp += 65;
  else if (normTier === 'weak') calcBaseHp = Math.max(220, calcBaseHp - 40);
  h.baseMaxHp = calcBaseHp;

  // Set breakthroughs, vouchers, W16-W20 preselection, W19 intel & W28 omen
  if (hasW10) {
    h.vouchers.w10 = true;
    const primarySkill = normBuild === 'frost' ? 'nova' : 'firewave';
    const branchKey = normBuild === 'frost'
      ? (normTier === 'strong' ? 'nv_glacial_bastion' : 'nv_seeking_vortex')
      : (normTier === 'strong' ? 'fw_ring_detonate' : 'fw_brand_pierce');
    const branchSpec = (W10_SKILL_BRANCHES[primarySkill] || []).find(b => b.key === branchKey) || W10_SKILL_BRANCHES[primarySkill][0];
    h.w10Branch[primarySkill] = branchSpec.key;
    h.breakthroughs.w10 = {
      wave: 10,
      completed: true,
      skillKey: primarySkill,
      skillName: HERO_SKILLS[primarySkill].name,
      branchKey: branchSpec.key,
      branchName: branchSpec.name,
      tag: branchSpec.tag,
      hook: branchSpec.hook || branchSpec.hookType,
      hookType: branchSpec.hookType || branchSpec.hook,
      desc: branchSpec.desc
    };
    game.stats.breakthroughsCompleted = 1;
  }

  const defaultW20DirKey = normBuild === 'frost' ? 'frost_bastion_counter' : 'fire_chain_surge';
  const defaultW20Dir = W20_DIRECTIONS[defaultW20DirKey];
  if (targetWave >= 19) {
    game.bossIntel.w20Revealed = true;
  }
  if (targetWave >= 16 && targetWave <= 20) {
    // W16-W20 pre-battle: preselected direction ready to adjust or lock when starting W20, NOT active yet!
    game.w20State = {
      preselectedDirection: defaultW20Dir.key,
      lockedDirection: null,
      locked: false,
      lockedAtWave: null
    };
  }
  if (hasW20) {
    // Stage 3: Replace Stage 1 placeholder with REAL locked W20 direction & enhancement!
    h.vouchers.w20 = true;
    const defaultEnhKey = normBuild === 'frost'
      ? (normTier === 'strong' ? 'w20_frost_overflow_nova' : 'w20_frost_dash_ring')
      : (normTier === 'strong' ? 'w20_fire_supernova_chain' : 'w20_fire_isolated_exec');
    const enhSpec = W20_ENHANCEMENTS[defaultEnhKey];
    game.w20State = {
      preselectedDirection: defaultW20Dir.key,
      lockedDirection: defaultW20Dir.key,
      locked: true,
      lockedAtWave: 20
    };
    h.breakthroughs.w20 = {
      wave: 20,
      completed: true,
      placeholder: false,
      directionKey: defaultW20Dir.key,
      directionName: defaultW20Dir.name,
      directionIcon: defaultW20Dir.icon,
      baseEffectActive: true,
      baseEffectDesc: defaultW20Dir.baseDesc,
      enhancementKey: enhSpec.key,
      enhancementName: enhSpec.name,
      enhancementIcon: enhSpec.icon,
      enhancementDesc: enhSpec.desc,
      enhancementBehaviorTag: enhSpec.behaviorTag,
      rerollCount: 0
    };
    game.stats.breakthroughsCompleted = 2;
  }
  if (targetWave >= 29) {
    const om = BALANCE.wave?.w28Omen || {};
    game.endgameOmen = {
      triggered: true,
      wave: 28,
      midWaveTriggered: true,
      clearTriggered: true,
      label: om.clearTitle || '🌑 终局预兆已现'
    };
    game.bossIntel.w30Revealed = true;
  }

  // Update active unlock node and shop tier bonus
  const activeNode = getActiveUnlockNode();
  h.realm = activeNode.idx;
  game.shopTierBonus = activeNode.idx;

  // Initialize learned skills according to build, wave, and tier
  const mainLv = clamp(
    (targetWave >= 21 ? 5 : targetWave >= 11 ? 4 : targetWave >= 6 ? 3 : 2) + (normTier === 'strong' ? 1 : normTier === 'weak' ? -1 : 0),
    1, 5
  );
  const secLv = clamp(mainLv - 1, 1, 5);
  const tertLv = clamp(mainLv - 2, 1, 5);
  h.skills = { blades:0, firewave:0, thunder:0, nova:0, stomp:0, berserk:0 };
  if (normBuild === 'fire') {
    h.skills.firewave = mainLv;
    h.skills.blades = secLv;
    if (targetWave >= 6) h.skills.thunder = secLv;
    if (targetWave >= 10) h.skills.berserk = tertLv;
    if (hasW10 && targetWave >= 15) h.skills.stomp = tertLv;
  } else {
    h.skills.nova = mainLv;
    h.skills.blades = secLv;
    if (targetWave >= 6) h.skills.thunder = secLv;
    if (targetWave >= 10) h.skills.berserk = tertLv;
    if (hasW10 && targetWave >= 15) h.skills.stomp = tertLv;
  }

  // Initialize Main Seal & Sub-Seals within unlocked caps
  const sealCap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  const desiredMainStar = targetWave >= 21 ? 5 : targetWave >= 16 ? 4 : targetWave >= 11 ? 4 : targetWave >= 6 ? 3 : 2;
  const mainStar = clamp(
    desiredMainStar + (normTier === 'strong' ? 1 : normTier === 'weak' ? -1 : 0),
    1, sealCap
  );
  const mainKind = normBuild === 'frost' ? 'frost' : 'fire';
  game.seal = {
    id: game.nextTowerId++,
    kind: mainKind,
    elem: ARTIFACTS[mainKind].elem,
    star: mainStar,
    prog: 0,
    route: mainStar >= 3 ? (normTier === 'strong' ? 'mastery' : normTier === 'standard' ? 'standard' : null) : null,
    cd: 0,
    kills: 0,
    dmgDealt: 0
  };

  game.subSeals = [];
  const subOrder = normBuild === 'frost' ? ['wind', 'thunder'] : ['thunder', 'wind'];
  const subStar = clamp(
    (targetWave >= 20 ? 3 : targetWave >= 11 ? 2 : 1) + (normTier === 'strong' ? 1 : normTier === 'weak' ? -1 : 0),
    1, 3
  );
  for (let i = 0; i < subCap && i < subOrder.length; i++) {
    const sk = subOrder[i];
    game.subSeals.push({
      id: game.nextTowerId++,
      kind: sk,
      elem: ARTIFACTS[sk].elem,
      star: subStar,
      prog: 0,
      dmgDealt: 0
    });
  }

  // Stage 2: Initialize real independent Gear Instances according to build, wave, and tier
  // weak = 1-slot single affix (no synergy), standard = 2-slot Duo synergy, strong = 3-slot Complete Trio synergy!
  const srcStage = getSourceStageForWave(targetWave);
  const enhanceLv = normTier === 'strong'
    ? (targetWave >= 21 ? 5 : Math.min(3, srcStage))
    : normTier === 'standard'
      ? Math.max(0, srcStage - 1)
      : 0;
  const gearPool = normBuild === 'frost'
    ? ['frost_mirror', 'frost_orb', 'jade_pendant', 'seal_astrolabe']
    : ['flame_fan', 'burn_core', 'crit_axe', 'vamp_fang'];
  const coreAffixes = normBuild === 'frost'
    ? (normTier === 'strong' ? ['frost_chill', 'frost_ward', 'frost_nova_counter'] : normTier === 'standard' ? ['frost_chill', 'frost_ward'] : ['frost_chill'])
    : (normTier === 'strong' ? ['fire_brand', 'fire_burst', 'fire_chain'] : normTier === 'standard' ? ['fire_brand', 'fire_burst'] : ['fire_brand']);
  const auxAffixSets = normBuild === 'frost'
    ? [['iron_bastion'], ['wind_tempest'], ['fortune_mint']]
    : [['fury_crit'], ['vamp_siphon'], ['wind_tempest']];
  const slotCount = targetWave >= 20 ? 4 : targetWave >= 10 ? (normTier === 'weak' ? 2 : 3) : 2;
  h.gear = [];
  for (let i = 0; i < slotCount && i < gearPool.length; i++) {
    const gk = gearPool[i];
    const affs = i === 0 ? coreAffixes : (auxAffixSets[i - 1] || ['vamp_siphon']);
    h.gear.push(createGearInstance(gk, {
      sourceStage: srcStage,
      slotsCount: affs.length,
      affixes: affs,
      enhanceLv: i === 0 ? enhanceLv : Math.max(0, enhanceLv - 1),
      origin: 'preset'
    }));
  }

  // v0.60 uses W10/W20 breakthroughs, gear affixes & Stage 4 Destiny Exclusives (no legacy v0.52 tribulation perks)
  h.perks = {};
  h.destinyEnhancements = {};
  if (normTier === 'strong' && targetWave >= 21) {
    h.destinyEnhancements = normBuild === 'frost'
      ? { destiny_fate_breaker: true, destiny_frost_refraction: true }
      : { destiny_fate_breaker: true, destiny_ember_echo: true };
  }

  // Initialize Gold, Materials, and Transfer Tokens budgets
  const tierEconMult = normTier === 'strong' ? 1.4 : normTier === 'weak' ? 0.65 : 1.0;
  game.gold = gold !== undefined
    ? Math.max(0, Math.round(Number(gold)))
    : Math.round((45 + targetWave * 12) * tierEconMult);
  game.materials = materials !== undefined
    ? Math.max(0, Math.round(Number(materials)))
    : Math.max(0, Math.round((targetWave - 1) * 1.4 * tierEconMult));
  const defaultTokens = targetWave >= 21
    ? (normTier === 'strong' ? 4 : normTier === 'standard' ? 2 : 1)
    : targetWave >= 16
      ? (normTier === 'strong' ? 2 : normTier === 'standard' ? 1 : 0)
      : 0;
  game.transferTokens = transferTokens !== undefined
    ? Math.max(0, Math.round(Number(transferTokens)))
    : defaultTokens;
  resetRunMetricsResourceBaseline();

  syncHeroMaxHp();
  const activeSynergies = recomputeEquipmentSynergies();
  h.hp = h.maxHp;
  refreshCombos(false);
  rollShop(true);
  fitCamera();
  updateCamera(0, true);
  renderAllUI(true);

  return {
    ok: true,
    wave: game.wave,
    phase: game.phase,
    tier: normTier,
    build: normBuild,
    seed: runSeed,
    gold: game.gold,
    materials: game.materials,
    transferTokens: game.transferTokens,
    w20State: { ...game.w20State },
    bossIntel: getW20BossIntel(),
    w30BossIntel: getW30BossIntel(),
    hero: {
      lv: h.lv,
      hp: h.hp,
      maxHp: h.maxHp,
      realm: h.realm,
      stageLabel: getRealmStageLabel(),
      sealCap: getSealStarCap(),
      subCap: getSubSealSlotCap(),
      skills: { ...h.skills },
      w10Branch: { ...h.w10Branch },
      breakthroughs: JSON.parse(JSON.stringify(h.breakthroughs)),
      vouchers: { ...h.vouchers },
      destinyEnhancements: { ...(h.destinyEnhancements || {}) },
      gear: JSON.parse(JSON.stringify(h.gear)),
      activeGearSynergies: activeSynergies.active.map(s => ({ id: s.id, name: s.name, tier: s.tier, chain: s.chain }))
    },
    seal: game.seal ? { kind: game.seal.kind, star: game.seal.star, route: game.seal.route || null } : null,
    subSeals: game.subSeals.map(s => ({ kind: s.kind, star: s.star })),
    unimplementedStageFeatures: {
      stage2_equipmentCraftingAndAffixes: 'Implemented in Stage 2 (independent gear instances, 1-3 slots, duo/trio synergies, shop pricing, sell/dismantle & material enhance)',
      stage3_w20FullBreakthroughAndW21Elites: 'Implemented in Stage 3 (W16-W19 preselect, W19 fair W20 Boss intel, W20 lock-in/voucher/paid full-group reroll, W21 showcase, W22-W24 shared-threat escalation, W25-W28 spoiler-free draws & W28 omen)',
      stage4_fateGambleAndTransfer: 'Implemented in Stage 4 (Destiny Gamble with free bet/empty tribulation/4x25% category weights/precious thresholds/8 exclusive enhancements/single-checkout idempotent safe claim, Affix Transfer Workbench with zero-side-effect preview & atomic commit, and W21-W29 endgame refinement economy)',
      stage5_w29FinalPrepAndW30Boss: 'Implemented in Stage 5 (W29 compact & tougher escalation, W30 fair Boss intel, wave-reward gated real-time 90s final prep with full-boundary mutex lock & safe unequipped timeout claim, W30 Boss6 3-phase structure with 80% signature HP lock + decoupled hit/HP resolution & 3-5 min fixed-HP calibration)'
    }
  };
}

function exportBuildPreset(){
  if (!game?.hero) return null;
  const h = game.hero;
  const syn = recomputeEquipmentSynergies();
  return JSON.parse(JSON.stringify({
    schema: 'bg60-build-preset-v4',
    seed: game.seed,
    wave: game.wave,
    gold: game.gold,
    materials: game.materials,
    transferTokens: game.transferTokens || 0,
    shopElemBuyCounts: { ...(game.shopElemBuyCounts || {}) },
    shopElemBuyStage: game.shopElemBuyStage || getSourceStageForWave(game.wave),
    w20State: { ...(game.w20State || {}) },
    bossIntel: { ...(game.bossIntel || {}) },
    wavePlan: {
      w22To24ThemeKey: game.wavePlan?.w22To24ThemeKey || 'mobile_rush',
      w25To28Rolled: { ...(game.wavePlan?.w25To28Rolled || {}) }
    },
    endgameOmen: { ...(game.endgameOmen || {}) },
    destinyPendingOffer: getPendingDestinyOffer(),
    rewardStash: (game.rewardStash || []).slice(),
    seal: game.seal ? { kind: game.seal.kind, elem: game.seal.elem, star: game.seal.star, prog: game.seal.prog || 0, route: game.seal.route || null } : null,
    subSeals: game.subSeals.map(s => ({ kind: s.kind, elem: s.elem, star: s.star, prog: s.prog || 0 })),
    hero: {
      lv: h.lv,
      xp: h.xp,
      baseMaxHp: h.baseMaxHp,
      skills: { ...h.skills },
      w10Branch: { ...h.w10Branch },
      breakthroughs: h.breakthroughs,
      vouchers: { ...h.vouchers },
      perks: { ...h.perks },
      combos: { ...h.combos },
      destinyEnhancements: { ...(h.destinyEnhancements || {}) },
      sealEssenceBonus: h.sealEssenceBonus || 0,
      gear: h.gear.map(g => normalizeGearInstance(g))
    },
    bag: game.bag.map(g => isBagSeal(g) ? { ...g } : normalizeGearInstance(g)),
    activeGearSynergies: syn.active.map(s => s.id)
  }));
}

function importBuildPreset(snapshot){
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'invalid_snapshot' };
  const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : JSON.parse(JSON.stringify(snapshot));
  runtimeCtx.setPaused(false);
  closeModal();
  runtimeCtx.setGame(makeGame(Number.isFinite(Number(data.seed)) ? Number(data.seed) : 2026));
  game.wave = clamp(Math.round(Number(data.wave || 1)), 1, MAIN_WAVES);
  game.phase = 'prep';
  game.gold = Math.max(0, Math.round(Number(data.gold ?? BALANCE.progression.initialGold)));
  game.materials = Math.max(0, Math.round(Number(data.materials ?? 0)));
  game.transferTokens = Math.max(0, Math.round(Number(data.transferTokens ?? 0)));
  resetRunMetricsResourceBaseline();
  game.shopElemBuyCounts = { wind:0, fire:0, frost:0, thunder:0, holy:0, ...(data.shopElemBuyCounts || {}) };
  game.shopElemBuyStage = Number(data.shopElemBuyStage || getSourceStageForWave(game.wave));
  if (data.w20State) {
    game.w20State = {
      preselectedDirection: data.w20State.preselectedDirection || null,
      lockedDirection: data.w20State.lockedDirection || null,
      locked: !!data.w20State.locked,
      lockedAtWave: data.w20State.lockedAtWave || null
    };
  }
  if (data.bossIntel) {
    game.bossIntel = { ...game.bossIntel, ...data.bossIntel };
  }
  if (data.wavePlan) {
    game.wavePlan = {
      w22To24ThemeKey: data.wavePlan.w22To24ThemeKey || game.wavePlan.w22To24ThemeKey,
      w25To28Rolled: { ...(data.wavePlan.w25To28Rolled || {}) },
      currentEncounter: null
    };
  }
  if (data.endgameOmen) {
    game.endgameOmen = { ...game.endgameOmen, ...data.endgameOmen };
  }
  if (data.destinyPendingOffer && !data.destinyPendingOffer.claimed) {
    game.destiny.pendingOffer = JSON.parse(JSON.stringify(data.destinyPendingOffer));
  }
  game.rewardStash = Array.isArray(data.rewardStash) ? JSON.parse(JSON.stringify(data.rewardStash)) : [];

  const h = game.hero;
  const hd = data.hero || {};
  h.lv = Math.max(1, Math.round(Number(hd.lv || 1)));
  h.xp = Math.max(0, Math.round(Number(hd.xp || 0)));
  h.xpNext = xpForLevel(h.lv);
  h.baseMaxHp = Math.max(100, Math.round(Number(hd.baseMaxHp || BALANCE.progression.initialHp)));
  h.skills = { blades:0, firewave:0, thunder:0, nova:0, stomp:0, berserk:0, ...(hd.skills || {}) };
  h.w10Branch = { ...(hd.w10Branch || {}) };
  h.breakthroughs = { w10: hd.breakthroughs?.w10 || null, w20: hd.breakthroughs?.w20 || null };
  h.vouchers = { w10: !!hd.vouchers?.w10, w20: !!hd.vouchers?.w20 };
  h.perks = { ...(hd.perks || {}) };
  h.combos = { ...(hd.combos || {}) };
  h.destinyEnhancements = { ...(hd.destinyEnhancements || {}) };
  h.sealEssenceBonus = Math.max(0, Number(hd.sealEssenceBonus || 0));
  h.gear = (Array.isArray(hd.gear) ? hd.gear : []).slice(0, HERO_GEAR_SLOTS).map(g => normalizeGearInstance(g));
  game.bag = (Array.isArray(data.bag) ? data.bag : []).map(g => isBagSeal(g) ? { ...g } : normalizeGearInstance(g));

  game.seal = data.seal ? {
    kind: data.seal.kind,
    elem: data.seal.elem || ARTIFACTS[data.seal.kind]?.elem,
    star: clamp(Number(data.seal.star || 1), 1, 5),
    prog: Math.max(0, Number(data.seal.prog || 0)),
    route: data.seal.route || null,
    cd: 0, dmgDealt: 0, kills: 0
  } : null;
  game.subSeals = (Array.isArray(data.subSeals) ? data.subSeals : []).slice(0, 2).map(s => ({
    kind: s.kind,
    elem: s.elem || ARTIFACTS[s.kind]?.elem,
    star: clamp(Number(s.star || 1), 1, 3),
    prog: Math.max(0, Number(s.prog || 0)),
    dmgDealt: 0
  }));

  const node = getActiveUnlockNode();
  h.realm = node.idx;
  game.shopTierBonus = node.idx;
  syncHeroMaxHp();
  h.hp = h.maxHp;
  const activeSynergies = recomputeEquipmentSynergies();
  refreshCombos(false);
  rollShop(true);
  renderAllUI(true);
  return {
    ok: true,
    wave: game.wave,
    gearCount: h.gear.length,
    bagCount: game.bag.length,
    transferTokens: game.transferTokens,
    activeGearSynergies: activeSynergies.active.map(s => s.id),
    w20Breakthrough: h.breakthroughs.w20 ? { ...h.breakthroughs.w20 } : null
  };
}

/* ==================== MAIN LOOP ==================== */
let lastTs = performance.now(), uiAccum = 0;
function stepFrame(rawDt){
  if (!game) return;
  const steps = game.speed === 2 ? 2 : 1;
  for (let i = 0; i < steps; i++) tick(rawDt);
}
function loop(ts){
  const rawDt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;
  perfStats.frameCount++;
  perfStats.fpsTimer += rawDt;
  if (perfStats.fpsTimer >= 0.5) {
    perfStats.fps = Math.round(perfStats.frameCount / perfStats.fpsTimer);
    perfStats.frameCount = 0;
    perfStats.fpsTimer = 0;
  }
  if (game) {
    counters.inMainLoopFrame = true;
    try {
      stepFrame(rawDt);
    } finally {
      counters.inMainLoopFrame = false;
    }
    render();
    uiAccum += rawDt;
    if (uiAccum >= 0.14) {
      uiAccum = 0;
      renderAllUI(false);
    }
  }
  requestAnimationFrame(loop);
}

/* ==================== BOOT & QA EXPORT (window.BG60) ==================== */
startNewRun(2026, false, { preRunSetup: true });
showIntroModal();
// Queue starter active skill selection right after closing intro!
game.pendingModals.push({ type: 'starter' });
requestAnimationFrame(loop);

window.BG60 = {
  version: '0.60.0-stage6',
  releaseTag: 'v0.60-complete',
  get game(){ return game; },
  get cam(){ return cam; },
  get perf(){ return { ...perfStats, enemies: game?.enemies.length || 0, projectiles: game?.projectiles.length || 0 }; },
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
window.BG52 = window.BG60;
})();
