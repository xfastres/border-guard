import BALANCE from '../data/balance.js';
import AudioKit from '../ui/audio/audio.js';
import { createCanvasRenderer } from '../ui/canvas/index.js';
import { createFeedbackUI } from '../ui/feedback/feedback.js';
import { createVfxManager } from '../ui/vfx/vfx.js';
import { createUiFormatters } from '../ui/shared/formatters.js';
import { createModalsSystem } from '../ui/modals/index.js';
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
const { getSkillBreakdown, renderAffixChipsHtml, formatDurationMMSS } = uiFormatters;
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
  ui: { renderAllUI: (...args) => renderAllUI(...args) },
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

function isW29WaveRewardModal(m){ return queryIsW29WaveRewardModal(m); }
function hasPendingW29WaveRewards(){ return queryHasPendingW29WaveRewards(game); }
function getFinalPrepState(){ return queryGetFinalPrepState(game); }

/* ==================== W10 FIRST MAJOR BREAKTHROUGH (DESIGNATE LEARNED SKILL -> 3 RANDOM BRANCHES) ==================== */
/* ==================== STAGE 3: W16-W19 PRESELECT, W19 BOSS INTEL & W20 BREAKTHROUGH + PAID REROLL ==================== */
/* ---- DESTINY PERK DRAFT (3 / 4 / 6 CHOICES + LV.1->LV.2 UPGRADE CHAINS) ---- */
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
