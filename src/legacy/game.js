import BALANCE from '../data/balance.js';
import AudioKit from '../ui/audio/audio.js';
import { createCanvasRenderer } from '../ui/canvas/index.js';
import { createFeedbackUI } from '../ui/feedback/feedback.js';
import { createVfxManager } from '../ui/vfx/vfx.js';
import { createUiFormatters } from '../ui/shared/formatters.js';
import { createModalsSystem } from '../ui/modals/index.js';
import { createHudSystem } from '../ui/hud/index.js';
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

const w10Breakthrough = createW10Breakthrough(runtimeCtx, { meta: metaSystem, unlock: unlockSystem, hero: heroStats });
const {
  getW10BranchSpec,
  pickHeroSkill,
  getLearnedSkillKeys,
  rollW10BranchChoices,
  selectW10BreakthroughSkill,
  pickW10BreakthroughBranch,
} = w10Breakthrough;

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

const rewardsSystem = createRewardsSystem(runtimeCtx, {
  meta: metaSystem,
  equipment: { createGearInstance, grantGearSafely },
  economy: economyCore,
  hero: heroStats,
});

const { rollPerkChoices, pickPerk, pickChestGearChoices, grantGear, pickGearReward } = rewardsSystem;

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

const uiFormatters = createUiFormatters({ getW10BranchSpec });
const modalsSystem = createModalsSystem(runtimeCtx, {
  getEl: $,
  meta: metaSystem,
  equipment: { ...equipmentCore, ...affixTransfer },
  economy: { ...economyCore, ...shopSystem, ...shopConfirm },
  progression: { ...unlockSystem, ...w10Breakthrough, ...w20Breakthrough, ...rewardsSystem, ...destinySystem },
  hero: { ...heroStats, ...heroVitals },
  run: runSystem,
  feedback: feedbackUI,
  audio: AudioKit,
  formatters: uiFormatters,
  ui: { renderAllUI: (...args) => hudSystem.renderAllUI(...args) },
});
const {
  queueModal, openNextModal, closeModal, hideBackdrop,
  renderShopConfirmModal, renderW30EarlyConfirmModal,
  renderStarterModal, renderLevelUpModal, renderW10BreakthroughModal,
  openW20PreselectModal, renderW20PreselectModal, openW20BreakthroughModal, renderW20BreakthroughModal,
  renderPerkModal, renderChestModal,
  openMetaLegacyModal, renderMetaLegacyModal,
  showIntroModal, showEndModal,
  openDestinyGambleModal, renderDestinyGambleModal, openAffixTransferModal, renderAffixTransferModal,
} = modalsSystem;

const hudSystem = createHudSystem(runtimeCtx, {
  getEl: $,
  perfStats,
  meta: metaSystem,
  equipment: { ...equipmentCore, ...equipmentInventory },
  economy: { ...economyCore, ...shopSystem, ...shopConfirm },
  progression: { ...w20Breakthrough, ...destinySystem },
  hero: heroStats,
  unlock: unlockSystem,
  run: runSystem,
  modals: modalsSystem,
  feedback: feedbackUI,
  audio: AudioKit,
  formatters: uiFormatters,
});
const {
  syncOffsets, renderAllUI, syncHudResponsiveMode, toggleBattleHud, toggleLeftHud,
  renderBattleHud, gearListSig, renderLeftHud, renderSealStrip, renderSkillStrip, renderShop, renderBag, renderInspector,
} = hudSystem;

// Bind adapters before the initial Meta load. Viewport and input are read on demand.
runtimeCtx.bindPorts({
  storage: { getStorage: getMetaStorage },
  audio: { play: AudioKit.play.bind(AudioKit), unlock: AudioKit.unlock.bind(AudioKit) },
  vfx: { addRing, addFloat, update: updateVfx },
  ui: {
    toast, showBanner, flashScreen, renderAllUI, setDangerVignette, setPaused,
    resetRunUI() {
      hudSystem.resetDirtyKeys();
      hideTransientFeedback();
    },
  },
  modals: modalsSystem,
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

/* ==================== AUDIO ENGINE ==================== */


/* ==================== STATE & HELPERS ==================== */
const keys = new Set();
let pointerDown = false;
let pointerScreen = null;
let pointerWorld = null;

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

function isW29WaveRewardModal(m){ return queryIsW29WaveRewardModal(m); }
function hasPendingW29WaveRewards(){ return queryHasPendingW29WaveRewards(game); }
function getFinalPrepState(){ return queryGetFinalPrepState(game); }

/* ==================== W10 FIRST MAJOR BREAKTHROUGH (DESIGNATE LEARNED SKILL -> 3 RANDOM BRANCHES) ==================== */
/* ==================== STAGE 3: W16-W19 PRESELECT, W19 BOSS INTEL & W20 BREAKTHROUGH + PAID REROLL ==================== */
/* ---- DESTINY PERK DRAFT (3 / 4 / 6 CHOICES + LV.1->LV.2 UPGRADE CHAINS) ---- */
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
