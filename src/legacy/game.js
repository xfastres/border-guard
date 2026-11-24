import BALANCE from '../data/balance.js';
import AudioKit from '../ui/audio/audio.js';
import { buildTerrainProps } from '../core/terrain.js';
import { mulberry32 } from '../core/rng.js';
import { dist, clamp, xpForLevel } from '../core/math.js';
import { createRuntimeContext } from '../core/runtime-context.js';
import { createMetaSystem } from '../systems/meta/index.js';
import { createAffixTransfer, createEquipmentCore, createEquipmentInventory } from '../systems/equipment/index.js';
import { createEconomyCore, createShopConfirm, createShopSystem } from '../systems/economy/index.js';
import { createUnlockSystem, createW10Breakthrough, createW20Breakthrough, createRewardsSystem, createDestinyGamble } from '../systems/progression/index.js';
import { createHeroStats, createHeroSkills, createHeroVitals } from '../systems/hero/index.js';
import { createCombatSystem } from '../systems/combat/index.js';
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
  CELL,
  MAIN_WAVES,
  MAX_ENEMIES,
  MAX_FLOATS,
  MAX_RINGS,
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
  generateRunId,
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
  run: { completeWaveClear: (...args) => completeWaveClear(...args) },
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
  pickEliteAffixes,
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
  updateSeal,
  triggerSealOnHeroHit,
  pointToSegDist,
  updateProjectilesAndZones,
  updateEnemies,
} = combatSystem;

const heroVitals = createHeroVitals(runtimeCtx, {
  meta: metaSystem,
  unlock: unlockSystem,
  equipment: equipmentCore,
  hero: heroStats,
  combat: combatSystem,
  run: { finishGame: (...args) => finishGame(...args) },
});
const { updatePickups, gainHeroXp, getCombatLogNowSec, getRecentThreatSummary, damageHero } = heroVitals;

const heroSkills = createHeroSkills(runtimeCtx, {
  meta: metaSystem, equipment: equipmentCore, hero: heroStats, combat: combatSystem,
});
const { executeBreakerShockwave, castHeroDash, castHeroOverdrive, pickAimTarget, updateHero } = heroSkills;

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
} = createW20Breakthrough(runtimeCtx, { equipment: equipmentCore, economy: economyCore });

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

// Bind adapters before the initial Meta load. Viewport and input are read on demand.
runtimeCtx.bindPorts({
  storage: { getStorage: getMetaStorage },
  audio: { play: AudioKit.play.bind(AudioKit), unlock: AudioKit.unlock.bind(AudioKit) },
  vfx: { addRing, addFloat },
  ui: { toast, showBanner, flashScreen, renderAllUI, setDangerVignette, setPaused },
  modals: {
    queueModal, closeModal, openNextModal, showEndModal, showIntroModal,
    openW20PreselectModal, openDestinyGambleModal, openAffixTransferModal, openMetaLegacyModal,
    renderW10BreakthroughModal, renderW20PreselectModal, renderW20BreakthroughModal,
    renderDestinyGambleModal, renderAffixTransferModal, renderShopConfirmModal, renderW30EarlyConfirmModal,
    renderMetaLegacyModal,
  },
  viewport: { screenToWorld, worldToScreen, getCamera: () => cam },
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
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');

const cam = { x: (W / 2) * CELL, y: (H / 2) * CELL, zoom: 1, w: 1280, h: 720, dpr: 1 };
const keys = new Set();
let pointerDown = false;
let pointerScreen = null;
let pointerWorld = null;
let toastTimer = null, bannerTimer = null;
const perfStats = { fps: 60, frameCount: 0, fpsTimer: 0, culledTiles: 0, culledProps: 0 };

// UI dirty-tracking keys to guarantee ZERO DOM flicker
let lastShopKey = '', lastSynKey = '', lastBagKey = '', lastInspKey = '', lastArtKey = '', lastSkillKey = '', lastLeftHudKey = '', lastBattleHudKey = '';
let compactHudMode = null;






function toast(msg, warn = false){
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (warn ? ' warn' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
function showBanner(title, sub, tone = ''){
  $('bannerTitle').textContent = title;
  $('bannerSub').textContent = sub;
  $('banner').className = 'banner' + (tone ? ' ' + tone : '');
  $('banner').hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { $('banner').hidden = true; }, 2400);
}

function setDangerVignette(active){ $('hpVignette')?.classList.toggle('danger', active); }


function perkLv(k){ return queryPerkLv(game, k); }
function hasCombo(k){ return queryHasCombo(game, k); }

function makeGame(seed = Math.floor(Math.random() * 1e9)){
  const rnd = mulberry32(seed);
  runtimeCtx.setTerrainProps(buildTerrainProps(seed));
  const w20AuxEntry = W20_BOSS_AUX_POOL.length
    ? W20_BOSS_AUX_POOL[Math.floor(rnd() * W20_BOSS_AUX_POOL.length)]
    : { key: 'oppression_ring', name: '领域压迫环', desc: '周期释放带预警的压迫光环。', fairnessNote: '有清晰预警与走位窗口' };
  const w30AuxEntry = W30_BOSS_AUX_POOL.length
    ? W30_BOSS_AUX_POOL[Math.floor(rnd() * W30_BOSS_AUX_POOL.length)]
    : { key: 'abyss_pillars', name: '护界晶柱', desc: '周期召唤可击破的护界晶柱，击破破盾易伤并掉回复灵气球。', fairnessNote: '全流派可击破且提供续航' };
  const w22Themes = Object.keys(BALANCE.wave?.w22To24Themes || {});
  const w22ThemeKey = w22Themes.length ? w22Themes[Math.floor(rnd() * w22Themes.length)] : 'mobile_rush';
  const g = {
    seed, rnd,
    phase: 'prep', // 'prep' | 'wave' | 'harvest' | 'won' | 'lost'
    subPhase: null, // null | 'w29_final_prep'
    autoWave: false,
    autoWaveTimer: 0,
    autoWavePausedForDecision: false,
    harvestTimer: 0,
    wave: 1,
    waveClock: 0,
    stormWarnAt: 999,
    stormWarned: false,
    speed: 1,
    gold: BALANCE.progression.initialGold,
    materials: BALANCE.progression.initialMaterials || 0,
    transferTokens: BALANCE.progression.initialTransferTokens || 0,
    rerollCost: BALANCE.economy.rerollStart,
    shopTierBonus: 0,
    shake: 0,
    thunderSynTimer: 3.0,
    holyRegenTimer: 1.0,
    xpCombo: 0, xpComboTimer: 0,

    pendingBreakthrough: null, // null | 'w10' | 'w20'
    w20State: {
      preselectedDirection: null,
      lockedDirection: null,
      locked: false,
      lockedAtWave: null
    },
    w20Draft: null,
    destiny: {
      pendingOffer: null, // { offerId, bet, wave, choices: [...], claimed: false, claimedChoiceIndex: null }
      lastOffer: null,
      lastOutcome: null,
      claimedOfferIds: [],
      totalRolls: 0,
      emptyTribulations: 0,
      wins: 0,
      totalGoldBet: 0,
      history: [],
      nextOfferSeq: 1
    },
    transferDraft: null,     // Preview-only draft, zero side effects on cancel
    shopConfirmDraft: null,  // Uncommitted shop purchase draft, zero side effects on cancel / timeout
    rewardStash: [],         // Overflow safe storage when bag is full (Stage 4 & Stage 5 W29 timeout handoff)
    healOrbs: [],            // Stage 5 W30 arena healing spirit orbs for sustain across 3-5 min boss fight
    finalPrep: {
      active: false,
      awaitingWaveRewards: false,
      started: false,
      locked: false,
      transitioning: false,
      timer: BALANCE.progression.w29FinalPrepSeconds || 90,
      duration: BALANCE.progression.w29FinalPrepSeconds || 90,
      maxSeconds: BALANCE.progression.w29FinalPrepSeconds || 90,
      w30IntelShown: false,
      lastResolution: null
    },
    w30Battle: null,
    bossIntel: {
      w20Core: BALANCE.w20Breakthrough?.bossCore?.name || '天劫三重雷域 + 扇形紫电弹幕',
      w20CoreDesc: BALANCE.w20Breakthrough?.bossCore?.desc || '周期落下 3 处带 1.2s 预警雷域并齐射 6 枚扇形紫电弹幕。',
      w20AuxKey: w20AuxEntry.key,
      w20Aux: w20AuxEntry.name,
      w20AuxDesc: w20AuxEntry.desc,
      w20AuxFairness: w20AuxEntry.fairnessNote || '公平可读预警机制',
      w20Revealed: false,
      w30Core: BALANCE.w30Boss?.core?.name || '终焉锁血冲击波 + 三段复合压制',
      w30CoreDesc: BALANCE.w30Boss?.core?.desc || '80% 血线强制锁血释放终焉裂空冲击波（锁血期命中可挂状态/叠盾，扣血与吸血为 0），35% 进入末段组合压制，打空即胜！',
      w30AuxKey: w30AuxEntry.key,
      w30Aux: w30AuxEntry.name,
      w30AuxDesc: w30AuxEntry.desc,
      w30AuxFairness: w30AuxEntry.fairnessNote || '公平可反制辅助机制',
      w30Revealed: false,
      tempStage1: false
    },
    wavePlan: {
      w22To24ThemeKey: w22ThemeKey,
      w25To28Rolled: {},
      currentEncounter: null
    },
    endgameOmen: {
      triggered: false,
      wave: 28,
      midWaveTriggered: false,
      clearTriggered: false,
      label: ''
    },

    // Selection & modes
    mode: null,
    inspTarget: null, // null | {type:'seal'} | {type:'hero'}

    // 1 Main Elemental Seal (1★ -> 5★) + up to 2 Sub-Seals (1★ -> 3★ resonance)
    seal: null,
    subSeals: [],
    shrine: null,
    shop: [],
    shopElemBuyCounts: { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 },
    shopElemBuyStage: 1,
    bag: [], // array of independent gear instances (and safely stored unequipped seals if any)
    pills: { xp: 0, heal: 0, temper: 0 },

    hero: {
      x: W / 2, y: H / 2,
      hp: BALANCE.progression.initialHp, maxHp: BALANCE.progression.initialHp, baseMaxHp: BALANCE.progression.initialHp, shield: 0, shieldTimer: 0,
      lv: 1, xp: 0, xpNext: xpForLevel(1),
      realm: 0,
      face: 1, goal: null, moving: false,
      invuln: 0, armorBreakT: 0, frostShieldActive: false, frostPulseCd: 0, frostActivePulseCd: 0, gearFrostShieldCd: 0,
      dashCd: 0, ultCd: 0, ultTimer: 0, dashBuffT: 0,
      thornsCd: 0, undyingUsedWave: -1,
      swordRainHits: 0, ultKillCounter: 0,
      wanjianTimer: 2.4, frostDomainTick: 0.4, swordSetTimer: 1.2, bloodKills: 0,
      w10AuraTimer: 0.55, w10SecondaryTimer: 0.85,
      w20FrostAuraTimer: 1.6, w20ShieldPillarAccum: 0, w20EchoFireCnt: 0, w20EchoFrostCnt: 0, w20TacticalReadyT: 0, w20AftershockQueue: [],
      destinyEnhancements: {},
      sealEssenceBonus: 0,
      destinyDashBuffT: 0,
      destinyFrostMoveT: 0,
      destinyEmberNextBoost: false,
      destinyEmberCd: 0,
      destinyBreakerCd: 0,
      destinyBulwarkTimer: 8.0,
      leechUsed: 0, leechTimer: 0,
      gear: [], // up to 4 independent gear instances
      activeGearSynergies: null,
      skills: {}, // Chosen via 3-choice starter active skill modal!
      w10Branch: {}, // { [skillKey]: branchKey }
      breakthroughs: {
        w10: null,
        w20: null
      },
      vouchers: {
        w10: false,
        w20: false
      },
      combatStateStats: {
        fireMarksApplied: 0,
        fireDetonations: 0,
        frostSlowsApplied: 0,
        frostShieldGained: 0,
        frostPulsesTriggered: 0,
        w10BranchProcs: 0,
        w20BaseProcs: 0,
        w20EnhancementProcs: 0,
        destinyEnhancementProcs: 0
      },
      combos: {},
      perks: {},
      skillTimers: { firewave: 0.3, thunder: 0.4, nova: 0.4, stomp: 0.5, spirit: 0 },
      bladeAngle: 0,
      bladeHitMap: new Map(),
      shatterCdMap: new Map()
    },

    enemies: [],
    nextEnemyId: 1,
    waveQueue: [],
    projectiles: [],
    beams: [],
    bolts: [],
    zones: [],
    gems: [],
    chests: [],
    rings: [],
    floats: [],

    pendingModals: [],
    activeModal: null,

    telemetry: [],
    curWaveTel: null,
    endSummary: null,

    // Stage 6: Unique Run ID, Locked Meta Loadout Snapshot, Real Damage Attribution Log & Effective Run Metrics
    runId: generateRunId(seed),
    metaLoadout: (() => {
      const sv = getMetaSave();
      return { main: sv.loadout.main, aux: sv.loadout.aux.slice() };
    })(),
    metaRunLocked: false,
    metaRunState: {
      activeGearKeys: BASE_GEAR_KEYS.slice(),
      activeAffixKeys: BASE_AFFIX_KEYS.slice(),
      unlockedGearExtras: [],
      unlockedAffixExtras: [],
      freeRefreshUsedThisWave: false,
      deflectReady: true,
      deflectTriggers: 0,
      freeRefreshUses: 0
    },
    metaSettlement: null,
    combatLog: {
      hits: [],
      fatalSource: null,
      lowestHpPct: 100,
      totalHitsTaken: 0,
      totalHpLost: 0,
      totalShieldAbsorbed: 0,
      settledAtRunClock: null,
      bySource: {}
    },
    runMetrics: {
      normalCombatSec: 0,
      bossCombatSec: 0,
      prepSec: 0,
      w29FinalPrepSec: 0,
      harvestSec: 0,
      totalEffectiveSec: 0,
      hpLost: 0,
      goldEarned: BALANCE.progression.initialGold,
      goldSpent: 0,
      materialsEarned: BALANCE.progression.initialMaterials || 0,
      materialsSpent: 0,
      transferTokensEarned: BALANCE.progression.initialTransferTokens || 0,
      transferTokensSpent: 0,
      ledger: [],
      _ledgerSeq: 1,
      _lastGold: BALANCE.progression.initialGold,
      _lastMaterials: BALANCE.progression.initialMaterials || 0,
      _lastTokens: BALANCE.progression.initialTransferTokens || 0
    },

    stats: {
      kills: 0, elites: 0, merges: 0, dmgTotal: 0,
      bossKills: 0, breakthroughsCompleted: 0,
      fireMarksApplied: 0, fireDetonations: 0, frostSlowsApplied: 0, frostShieldGained: 0, shieldGained: 0,
      gearFireDuoProcs: 0, gearFireTrioProcs: 0, fireChainTransfers: 0, fireFocusedDetonations: 0,
      gearFrostDuoProcs: 0, gearFrostTrioProcs: 0, frostHitPulses: 0, frostDashPulses: 0, frostFullShieldPulses: 0,
      w20BaseProcs: 0, w20EnhancementProcs: 0, w20FirePulls: 0, w20FrostCounterProcs: 0, w20BreakerSlams: 0,
      w20BossAuxTriggers: 0, w20TotemsDestroyed: 0,
      destinyRolls: 0, destinyEmptyTribulations: 0, destinyClaims: 0, destinyEnhancementProcs: 0, affixTransfers: 0,
      skillDmg: { blades:0, firewave:0, thunder:0, nova:0, stomp:0, berserk:0, dash:0, spirit:0, combo:0, perk:0, burn:0 }
    }
  };
  return g;
}

function startNewRun(seed = Math.floor(Math.random() * 1e9), showStarter = true, opts = {}){
  runtimeCtx.setGame(makeGame(seed));
  syncRunActivePools();
  if (!opts?.preRunSetup) {
    game.metaRunLocked = true;
  }
  recomputeEquipmentSynergies();
  runtimeCtx.setPaused(false);
  lastShopKey = lastSynKey = lastBagKey = lastInspKey = lastArtKey = lastSkillKey = lastLeftHudKey = lastBattleHudKey = '';
  $('banner').hidden = true;
  $('toast').hidden = true;
  $('hpVignette')?.classList.remove('danger');
  closeModal();
  rollShop(true);
  fitCamera();
  updateCamera(0, true);
  if (showStarter) queueModal({ type: 'starter' });
  renderAllUI(true);
}

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

/* ==================== WAVE GENERATION (30-WAVE CONTROLLED CURVE) & SHRINE ==================== */
function getWavePhaseMeta(w){
  const phase = BALANCE.wave.phases.find(p => w >= p.from && w <= p.to) || BALANCE.wave.phases[BALANCE.wave.phases.length - 1];
  return {
    tag: phase.tag,
    kind: phase.kind,
    mobMult: phase.mobMult,
    hpMult: phase.hpBase + (w - phase.offset) * phase.hpSlope
  };
}

function getW22To24Theme(themeKey = null){
  const themes = BALANCE.wave?.w22To24Themes || {};
  const key = themeKey || game?.wavePlan?.w22To24ThemeKey || 'mobile_rush';
  return themes[key] || themes.mobile_rush || Object.values(themes)[0] || null;
}

function getW25To28Pool(w){
  const pools = BALANCE.wave?.w25To28Pools || {};
  return (pools[String(w)] || []).slice();
}

function rollW25To28Encounter(w, commitToGame = true){
  const pool = getW25To28Pool(w);
  if (!pool.length) return null;
  const pick = pool[Math.floor(game.rnd() * pool.length)];
  const enc = {
    wave: w,
    type: 'w25_28_random',
    id: pick.id,
    name: pick.name,
    primaryThreat: pick.primaryThreat,
    mobMultAdj: pick.mobMultAdj ?? 1,
    hpMultAdj: pick.hpMultAdj ?? 1,
    normal: pick.normal,
    heavy: pick.heavy
  };
  if (commitToGame && game?.wavePlan) {
    game.wavePlan.w25To28Rolled[String(w)] = enc;
    game.wavePlan.currentEncounter = enc;
  }
  return enc;
}

function getWaveEncounterInfo(w = game?.wave){
  if (!game) return null;
  const waveNum = Number(w || game.wave || 1);
  if (waveNum >= 22 && waveNum <= 24) {
    const theme = getW22To24Theme();
    const wSpec = theme?.waves?.[String(waveNum)] || null;
    if (!theme || !wSpec) return null;
    return {
      wave: waveNum,
      type: 'w22_24_shared_threat',
      revealed: true,
      themeKey: theme.key,
      themeName: theme.name,
      primaryThreat: theme.primaryThreat,
      threatLabel: theme.threatLabel,
      counterHint: theme.counterHint,
      comboLabel: wSpec.comboLabel,
      pressureLevel: wSpec.pressureLevel
    };
  }
  if (waveNum >= 25 && waveNum <= 28) {
    // STRICTLY NO pre-wave spoilers during prep phase!
    const isCurrentPrep = waveNum === game.wave && game.phase === 'prep';
    const rolled = game.wavePlan?.w25To28Rolled?.[String(waveNum)] || null;
    if (isCurrentPrep || !rolled) {
      return {
        wave: waveNum,
        type: 'w25_28_random',
        revealed: false,
        id: null,
        name: '开战后揭晓',
        primaryThreat: null
      };
    }
    return {
      wave: waveNum,
      type: 'w25_28_random',
      revealed: true,
      id: rolled.id,
      name: rolled.name,
      primaryThreat: rolled.primaryThreat
    };
  }
  return null;
}

function getEndgameOmenState(){
  return game?.endgameOmen ? { ...game.endgameOmen } : { triggered: false, wave: 28, midWaveTriggered: false, clearTriggered: false, label: '' };
}

function buildWaveQueue(w, customEncounter = null){
  const q = [];
  const meta = getWavePhaseMeta(w);
  const bw = BALANCE.wave;
  const lateScale = w >= bw.lateHpGrowthSecondStart
    ? Math.pow(bw.lateHpGrowthSecond, w - (bw.lateHpGrowthSecondStart - 1))
    : w >= bw.lateHpGrowthStart
      ? Math.pow(bw.lateHpGrowthFirst, w - (bw.lateHpGrowthStart - 1)) : 1;

  // Stage 3 & Stage 5 Wave-specific encounter mixes (W21 showcase, W22-24 shared-threat, W25-28 independent draws, W29 compact outpost)
  let encounterSpec = customEncounter;
  let packBonus = 0;
  let mobMultAdj = 1;
  let hpMultAdj = 1;
  let durationMult = 1;
  let packOffsetMult = 1;
  let spawnJitterMult = 1;
  let activeMix = bw.mobMix.find(m => w <= m.to) || bw.mobMix[bw.mobMix.length - 1];

  if (w === 21 && bw.w21ShowcaseMix) {
    activeMix = bw.w21ShowcaseMix;
    packBonus = 1;
  } else if (w >= 22 && w <= 24) {
    const theme = getW22To24Theme();
    const wSpec = theme?.waves?.[String(w)];
    if (wSpec) {
      activeMix = wSpec;
      packBonus = wSpec.packBonus || 0;
      mobMultAdj = wSpec.mobMultAdj ?? 1;
    }
  } else if (w >= 25 && w <= 28) {
    if (!encounterSpec) encounterSpec = rollW25To28Encounter(w, false);
    if (encounterSpec) {
      activeMix = encounterSpec;
      mobMultAdj = encounterSpec.mobMultAdj ?? 1;
      hpMultAdj = encounterSpec.hpMultAdj ?? 1;
    }
  } else if (w === 29 && bw.w29Outpost) {
    // Stage 5: W29 same-direction modest escalation over W28 — tighter spawn pacing/denser batches AND slightly tougher enemies!
    const w29 = bw.w29Outpost;
    activeMix = w29;
    packBonus = w29.packBonus || 2;
    mobMultAdj = w29.mobMultAdj ?? 1.04;
    hpMultAdj = w29.hpMultAdj ?? 1.06;
    durationMult = w29.durationMult ?? 0.84;
    packOffsetMult = w29.packOffsetMult ?? 0.72;
    spawnJitterMult = w29.spawnJitterMult ?? 0.75;
  }

  const scale = Math.pow(bw.normalHpGrowth, w - 1) * meta.hpMult * lateScale * hpMultAdj;
  const sides = w <= 2 ? ['west','east','north'] : ['west','east','north','south'];
  const baseMobs = Math.min(bw.mobsBaseCap, Math.round(bw.mobsBase + w * bw.mobsPerWave));
  const totalMobs = w === MAIN_WAVES
    ? Math.max(8, Number(bw.w30VanguardMobs || 16))
    : Math.min(bw.mobsFinalCap, Math.round(baseMobs * meta.mobMult * mobMultAdj));
  const baseDuration = Math.min(bw.durationCap, bw.durationBase + w * bw.durationPerWave);
  const duration = w === MAIN_WAVES ? 12.0 : Number((baseDuration * durationMult).toFixed(2));

  const pickMobKind = (forceHeavy = false) => {
    const r = game.rnd();
    const distribution = forceHeavy && activeMix.heavy ? activeMix.heavy : activeMix.normal;
    for (const [kind, upper] of distribution) if (r < upper) return kind;
    return distribution[distribution.length - 1][0];
  };

  // Arknights-style 3-stage waveform inside each wave (W30 uses a crisp opening vanguard for the Final Boss arena)
  const stage = bw.stages;
  const effJitter = stage.spawnJitter * spawnJitterMult;
  const effPackOffset = stage.packOffset * packOffsetMult;

  if (w === MAIN_WAVES) {
    // Focused W30 Boss Arena: small vanguard starting at 0.35s + Final Boss (boss6) arriving at 1.0s
    for (let i = 0; i < totalMobs; i++) {
      const at = Number((0.35 + (i / Math.max(1, totalMobs - 1)) * 10.5).toFixed(3));
      q.push({ at, side: sides[i % sides.length], kind: pickMobKind(i >= totalMobs / 2), scale, spawned: false });
    }
    const bossKind = bw.bossByWave?.[String(w)] || 'boss6';
    const w30SpawnAt = BALANCE.w30Boss?.bossSpawnAt ?? 1.0;
    q.push({ at: w30SpawnAt, side: 'west', kind: bossKind, scale: 1, spawned: false });
    q.sort((a, b) => a.at - b.at);
    return q;
  }

  const s1Count = Math.round(totalMobs * stage.fractionOne);
  const s2Count = Math.min(stage.quietMax, Math.max(stage.quietMin, Math.round(totalMobs * stage.fractionTwo)));
  const s3Count = Math.max(0, totalMobs - s1Count - s2Count);

  const pushPacks = (count, tStart, tEnd, packSz, heavy) => {
    const effPack = Math.max(1, packSz + packBonus);
    for (let i = 0; i < count; ) {
      const pack = Math.min(effPack, count - i);
      const frac = count <= effPack ? 0.5 : i / count;
      const t = tStart + frac * (tEnd - tStart) + game.rnd() * effJitter;
      const side = sides[Math.floor(game.rnd() * sides.length)];
      for (let k = 0; k < pack; k++) {
        q.push({ at: t + k * effPackOffset, side, kind: pickMobKind(heavy), scale, spawned: false });
      }
      i += pack;
    }
  };

  const [a1,b1,p1,h1] = stage.first;
  const [a2,b2,p2,h2] = stage.second;
  const [a3,b3,p3,h3] = stage.third;
  pushPacks(s1Count, a1, duration * b1, p1, h1);
  pushPacks(s2Count, duration * a2, duration * b2, p2, h2);
  pushPacks(s3Count, duration * a3, duration * b3, p3, h3);

  // Elites from Wave 2 onward: 1 elite W2-11, 2 elites W12-21, 3 elites W22+
  if (w >= bw.eliteFirstWave) {
    const eliteCount = (bw.eliteCountLateWave && w >= bw.eliteCountLateWave)
      ? (bw.eliteCountEndgame || bw.eliteCountLate)
      : (w >= bw.eliteCountIncreasedWave ? (bw.eliteCountMid || bw.eliteCountLate) : bw.eliteCountEarly);
    const eliteWaveScale = Math.pow(bw.eliteHpGrowth, w - bw.eliteFirstWave) * (w === 29 ? hpMultAdj : 1);
    for (let e = 0; e < eliteCount; e++) {
      q.push({
        at: duration * (0.24 + e * 0.24),
        side: sides[e % sides.length],
        kind: 'elite', scale: eliteWaveScale, spawned: false
      });
    }
  }

  // 6 Major Bosses on Wave 5, 10, 15, 20, 25, 30
  if (w % bw.bossPeriod === 0) {
    const bossKind = bw.bossByWave?.[String(w)] || (w === 5 ? 'boss1' : w === 10 ? 'boss2' : w === 15 ? 'boss3' : w === 20 ? 'boss4' : w === 25 ? 'boss5' : 'boss6');
    q.push({ at: bw.bossSpawnAt, side: 'west', kind: bossKind, scale: 1, spawned: false });
  }

  q.sort((a, b) => a.at - b.at);
  return q;
}

function startWave(opts = {}){
  if (game.phase !== 'prep') return false;
  const fromFinalPrep = !!(opts && (opts.fromFinalPrepTimeout || opts.fromFinalPrepEarly));

  // Stage 5: Active W29 90s final prep routes manual startWave clicks through startW30Early() for full boundary safety!
  if (game.finalPrep?.active && !fromFinalPrep) {
    const res = startW30Early({ acceptRandomClaim: !!opts?.acceptRandomClaim });
    return !!res?.ok;
  }

  AudioKit.unlock();
  // Safety net: auto-collect any unpicked ground chests from prep before starting next wave!
  if (game.chests.length) {
    for (const c of game.chests) queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
    game.chests = [];
    toast('已自动收起地面遗留的构装宝箱！');
    renderAllUI();
    return false;
  }
  if (!fromFinalPrep && game.destiny?.pendingOffer && !game.destiny.pendingOffer.claimed) {
    openDestinyGambleModal();
    toast('🎲 天命赌局尚有未领取的三选一奖励，请先领取再开战！', true);
    renderAllUI(true);
    return false;
  }
  if (!fromFinalPrep && (game.pendingBreakthrough || game.activeModal || game.pendingModals.length > 0)) {
    toast('请先完成当前待选突破或奖励！', true);
    renderAllUI();
    return false;
  }
  if (game.transferDraft) {
    cancelAffixTransferPreview();
  }
  if (game.shopConfirmDraft) {
    cancelShopPurchaseConfirm();
  }

  // Stage 3: W20 start requires a confirmed preselected direction and locks it immediately!
  if (game.wave === 20 && !game.hero.breakthroughs.w20) {
    if (!game.w20State?.preselectedDirection) {
      openW20PreselectModal({ requireConfirmStart: true });
      toast('请先选定并锁定 W20 第二次突破方向后再迎战天劫魔尊！', true);
      renderAllUI(true);
      return false;
    }
    lockW20DirectionForBattle();
  }

  if (game.finalPrep && game.finalPrep.active) {
    game.finalPrep.active = false;
    game.finalPrep.awaitingWaveRewards = false;
    game.finalPrep.transitioning = false;
    game.subPhase = null;
  }
  const meta = getWavePhaseMeta(game.wave);
  const w29DurMult = (game.wave === 29 && BALANCE.wave?.w29Outpost?.durationMult) ? BALANCE.wave.w29Outpost.durationMult : 1;
  const duration = Math.min(BALANCE.wave.durationCap, BALANCE.wave.durationBase + game.wave * BALANCE.wave.durationPerWave) * w29DurMult;
  if (!game.metaRunLocked) lockMetaLoadoutForRun();
  if (game.metaRunState) game.metaRunState.deflectReady = true;
  game.phase = 'wave';
  game.subPhase = null;
  game.waveClock = 0;
  game.stormWarnAt = game.wave === MAIN_WAVES ? 9999 : duration * 0.44;
  game.stormWarned = false;
  game.eliteChestDropped = false;
  game.healOrbs = [];
  game.inspTarget = null;
  game.mode = null;

  // Stage 3 & Stage 5: Reveal W20 Boss intel on W19+ and W30 Boss intel on W29+; roll W25-W28 encounter ONLY at wave start!
  if (game.wave >= (BALANCE.w20Breakthrough?.bossIntelRevealWave || 19)) {
    game.bossIntel.w20Revealed = true;
  }
  if (game.wave >= (BALANCE.w30Boss?.intelRevealWave || 29)) {
    game.bossIntel.w30Revealed = true;
  }
  let rolledEncounter = null;
  if (game.wave >= 25 && game.wave <= 28) {
    rolledEncounter = rollW25To28Encounter(game.wave, true);
  } else if (game.wave >= 22 && game.wave <= 24) {
    game.wavePlan.currentEncounter = getWaveEncounterInfo(game.wave);
  } else {
    game.wavePlan.currentEncounter = null;
  }

  game.waveQueue = buildWaveQueue(game.wave, rolledEncounter);
  game.autoWaveTimer = 0;
  game.autoWavePausedForDecision = false;

  // Stage 5: Start unified W30 Final Boss battle timer the exact moment player gains control in W30!
  if (game.wave === MAIN_WAVES) {
    const w30Cfg = BALANCE.w30Boss || {};
    const fixedMaxHp = BALANCE.enemies?.boss6?.hp || 320000;
    const sigPct = w30Cfg.signatureThresholdPct ?? 0.80;
    const finPct = w30Cfg.finalPhaseThresholdPct ?? 0.35;
    game.w30Battle = {
      active: true,
      startedAtWaveClock: 0,
      elapsedSeconds: 0,
      phase: 'opening',
      outcome: null,
      bossId: null,
      bossMaxHp: fixedMaxHp,
      signatureThresholdPct: sigPct,
      signatureThresholdHp: Math.round(fixedMaxHp * sigPct),
      finalThresholdPct: finPct,
      finalThresholdHp: Math.round(fixedMaxHp * finPct),
      signatureTriggered: false,
      signatureLockActive: false,
      signatureLockStartedAt: null,
      signatureLockEndedAt: null,
      signatureTruncatedDmg: 0,
      signatureHitsDuringLock: 0,
      signatureHpDamageDuringLock: 0,
      signatureLifestealDuringLock: 0,
      signatureStatusHitsDuringLock: {
        fireMarks: 0,
        fireDetonations: 0,
        frostSlows: 0,
        frostShieldGained: 0,
        frostPulses: 0
      },
      auxKey: game.bossIntel?.w30AuxKey || 'abyss_pillars',
      auxName: game.bossIntel?.w30Aux || '护界晶柱',
      auxTriggers: 0,
      healOrbsSpawned: 0,
      healOrbsCollected: 0,
      phaseTimeline: [
        { phase: 'opening', at: 0, bossHpPct: 100 }
      ]
    };
  } else {
    game.w30Battle = null;
  }

  // Spawn optional Black-Myth-style Blood Shrine (W3/W7/W12/W17/W22/W27)
  if (SHRINE_WAVES.includes(game.wave)) {
    const ang = game.rnd() * Math.PI * 2;
    const d = 10 + game.rnd() * 3.5;
    game.shrine = {
      x: clamp(game.hero.x + Math.cos(ang) * d, 3.2, W - 3.2),
      y: clamp(game.hero.y + Math.sin(ang) * d, 3.2, H - 3.2),
      r: 1.45, active: false, cleared: false, charge: 0, wave: game.wave
    };
  } else {
    game.shrine = null;
  }

  // Start Wave Telemetry sampler
  const h = game.hero;
  game.curWaveTel = {
    wave: game.wave, phaseTag: meta.tag, kind: meta.kind,
    encounterId: rolledEncounter?.id || game.wavePlan.currentEncounter?.themeKey || (game.wave === 29 ? 'w29_outpost' : game.wave === 30 ? 'w30_boss6' : null),
    duration: 0, minHpPct: Math.round(h.hp * 100 / Math.max(1, h.maxHp)),
    dmgTaken: 0, hitsTaken: 0, moveDist: 0, dashCount: 0, ultCount: 0,
    shrineTried: false, shrineCleared: false, ehpTotal: 0,
    dmgDealtStart: game.stats.dmgTotal, goldStart: game.gold
  };

  // Stage 3: W28 Endgame Omen trigger at wave start
  const isBoss = game.wave % 5 === 0;
  if (game.wave === 28) {
    const om = BALANCE.wave?.w28Omen || {};
    game.endgameOmen = {
      triggered: true,
      wave: 28,
      midWaveTriggered: false,
      clearTriggered: false,
      label: om.startTitle || '🌑 第 28 波 · 终局预兆降临！',
      encounterName: rolledEncounter?.name || ''
    };
    AudioKit.play('boss', 0.92);
    flashScreen('fail');
    showBanner(
      om.startTitle || '🌑 第 28 波 · 终局预兆降临！',
      `${rolledEncounter ? `【${rolledEncounter.name}】来袭 · ` : ''}${om.startSub || 'W29 将公布 W30 情报并进入 90 秒最终整备！'}`,
      'boss'
    );
  } else {
    AudioKit.play(isBoss ? 'boss' : 'merge', isBoss ? 1 : 0.85);
    const lockedDir = game.w20State?.lockedDirection ? W20_DIRECTIONS[game.w20State.lockedDirection] : null;
    const w22Info = (game.wave >= 22 && game.wave <= 24) ? getWaveEncounterInfo(game.wave) : null;
    const subMsg = isBoss
      ? (game.wave === 10 ? '击败首领后触发【W10 首次大型突破】！'
        : game.wave === 20 ? `已锁定二破方向【${lockedDir?.name || '未定'}】！击败天劫魔尊（辅助：${game.bossIntel.w20Aux}）当场激活基础效果！`
        : game.wave === 25 ? `玄冥妖皇携【${rolledEncounter?.name || '成型敌群'}】降临！注意走位躲避寒潮与弹幕！`
        : game.wave === 30 ? `终局决战 · 深渊主宰（本局辅助：${game.bossIntel.w30Aux}）！80% 血线锁血冲击波请入安全区，末段打空即胜！`
        : '高能首领战！注意走位躲避破阵重击，斩首必爆高阶宝箱！')
      : game.wave === 21 ? '⚡ 第二次大型突破已生效！畅快体验聚焰连爆 / 凛冬反制 / 破阵蓄势与已有装备的实战联动！'
      : game.wave === 29 ? `前哨紧凑强敌来袭（W30 情报已揭晓 · 辅助：${game.bossIntel.w30Aux}）！通关后开启 90 秒独立最终整备！`
      : w22Info ? `同源威胁【${w22Info.themeName}】· ${w22Info.comboLabel}（${w22Info.counterHint}）`
      : rolledEncounter ? `本波独立抽中敌群【${rolledEncounter.name}】！检验成型构筑！`
      : (game.shrine ? '本章【🩸血煞妖碑】已现身远端！试炼赢金币、锻材与高阶构装宝箱！' : '注意走位切入外圈弓巫并避开重击破阵！');
    showBanner(
      isBoss ? `⚠️ 第 ${game.wave} / ${MAIN_WAVES} 波 [${meta.tag}] · 首领降临！`
             : `第 ${game.wave} / ${MAIN_WAVES} 波 · ${meta.tag}`,
      subMsg,
      isBoss ? 'boss' : (meta.kind === 'relief' ? 'good' : '')
    );
  }
  renderAllUI(true);
  return true;
}

/* ==================== HERO SKILLS (SMART TARGETING + SPIRIT SWORD + COMBOS) ==================== */
function finalizeCurrentTelemetry(){
  if (!game?.curWaveTel) return;
  const tel = game.curWaveTel;
  tel.duration = Number(game.waveClock.toFixed(1));
  tel.dmgDealt = game.stats.dmgTotal - tel.dmgDealtStart;
  tel.dps = tel.duration > 0 ? Math.round(tel.dmgDealt / tel.duration) : 0;
  tel.goldEarned = Math.max(0, game.gold - tel.goldStart);
  tel.moveDist = Number(tel.moveDist.toFixed(1));
  game.telemetry.push(tel);
  game.curWaveTel = null;
}

function getTelemetryReport(){
  if (!game) return { waves: [], current: null, summary: {} };
  const waves = game.telemetry.slice();
  const avgDuration = waves.length ? Number((waves.reduce((s, w) => s + w.duration, 0) / waves.length).toFixed(1)) : 0;
  const minHp = waves.length ? Math.min(...waves.map(w => w.minHpPct)) : 100;
  const shrineClears = waves.filter(w => w.shrineCleared).length;
  return {
    waves,
    current: game.curWaveTel,
    summary: { wavesCleared: waves.length, avgDuration, lowestHpPct: minHp, shrineClears }
  };
}

function beginWaveHarvest(){
  // Clear combat leftovers immediately, then run 1.15s visual gem-vacuum harvest!
  game.projectiles = [];
  game.zones = [];
  game.beams = [];
  game.bolts = [];
  game.shrine = null;
  game.hero.bladeHitMap.clear();
  game.hero.shatterCdMap.clear();

  if (game.gems.length > 0) {
    game.phase = 'harvest';
    game.harvestTimer = 1.15;
    for (const g of game.gems) g.magnetized = true;
    addFloat(game.hero.x, game.hero.y - 0.7, '✨ 灵气归体 · 收取修为！', '#8cf4ff', true);
  } else {
    completeWaveClear();
  }
}

function isW29WaveRewardModal(m){ return queryIsW29WaveRewardModal(m); }
function hasPendingW29WaveRewards(){ return queryHasPendingW29WaveRewards(game); }
function getFinalPrepState(){ return queryGetFinalPrepState(game); }

function getMonotonicNowMs(){
  const override = counters.monotonicClockOverride;
  if (typeof override === 'function') {
    const v = Number(override());
    if (Number.isFinite(v)) return v;
  }
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function setMonotonicClockForTest(fn){
  counters.monotonicClockOverride = typeof fn === 'function' ? fn : null;
  if (typeof lastTs !== 'undefined') lastTs = getMonotonicNowMs();
}

function syncW29FinalPrepStart(){
  const fp = game?.finalPrep;
  if (!fp || !fp.active || fp.started) return false;
  if (!hasPendingW29WaveRewards()) {
    const nowMs = getMonotonicNowMs();
    const remSec = Number.isFinite(fp.timer) && fp.timer > 0 ? fp.timer : (fp.duration || fp.maxSeconds || 90);
    fp.awaitingWaveRewards = false;
    fp.started = true;
    fp.startedAtMs = nowMs;
    fp.deadlineMs = nowMs + remSec * 1000;
    fp.lastClockMs = nowMs;
    fp.lastObservedTimer = remSec;
    fp.usesWallClock = false;
    showBanner(
      `⏳ W29 终局整备正式倒计时（${Math.round(fp.duration || 90)} 秒）！`,
      `波末奖励已结清！真实时间走表（不受倍速、面板或暂停影响），迎战 W30 深渊主宰（辅助：${game.bossIntel?.w30Aux || '未知'}）！`,
      'boss'
    );
    renderAllUI(true);
    return true;
  }
  return false;
}

function syncW29FinalPrepClock({ nowMs = null, fallbackRealDt = 0, allowFallbackDt = true } = {}){
  if (!game || game.phase !== 'prep') return false;
  const fp = game.finalPrep;
  if (!fp || !fp.active) return false;

  // Phase A: Settle W29 wave-end rewards (levelup / ground chests) FIRST; 90s timer stays frozen until last wave-end reward closes!
  if (!fp.started) {
    syncW29FinalPrepStart();
    if (!fp.started) return false;
  }
  if (fp.locked || fp.transitioning) return false;

  const curNowMs = Number.isFinite(nowMs) ? nowMs : getMonotonicNowMs();
  if (!Number.isFinite(fp.deadlineMs)) {
    const remSec = Math.max(0, Number(fp.timer || 0));
    fp.startedAtMs = curNowMs;
    fp.deadlineMs = curNowMs + remSec * 1000;
    fp.lastClockMs = curNowMs;
    fp.lastObservedTimer = remSec;
  }

  // Compatibility: if a test directly mutates game.finalPrep.timer, re-anchor deadlineMs to that value before ticking.
  if (Number.isFinite(fp.lastObservedTimer) && Math.abs(fp.timer - fp.lastObservedTimer) > 1e-4) {
    fp.deadlineMs = curNowMs + Math.max(0, Number(fp.timer || 0)) * 1000;
    fp.lastClockMs = curNowMs;
    fp.lastObservedTimer = fp.timer;
  }

  const prevClockMs = Number.isFinite(fp.lastClockMs) ? fp.lastClockMs : curNowMs;
  const wallDeltaMs = Math.max(0, curNowMs - prevClockMs);
  const hasExplicitClock = typeof counters.monotonicClockOverride === 'function';
  let elapsedSec = 0;

  if (wallDeltaMs > 0) {
    // Real monotonic clock advanced: ALWAYS use exact wall-clock delta (NEVER clamped to 0.05s, NEVER frozen by paused!)
    fp.usesWallClock = true;
    fp.lastClockMs = curNowMs;
    const prevTimer = fp.timer;
    fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
    elapsedSec = Math.max(0, prevTimer - fp.timer);
  } else if (allowFallbackDt && !hasExplicitClock && !fp.usesWallClock && fallbackRealDt > 0) {
    // Node sandbox compatibility when performance.now() is static (0) and tests invoke tick(dt)/stepFrame(dt) directly
    const prevTimer = fp.timer;
    fp.deadlineMs -= fallbackRealDt * 1000;
    fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
    elapsedSec = Math.max(0, prevTimer - fp.timer);
  } else {
    fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
  }

  fp.lastObservedTimer = fp.timer;
  if (elapsedSec > 0 && game.runMetrics) {
    game.runMetrics.w29FinalPrepSec += elapsedSec;
    game.runMetrics.totalEffectiveSec += elapsedSec;
  }
  if (fp.timer <= 0) {
    resolveW29FinalPrepTimeout();
    return true;
  }
  return false;
}

function isCancelablePrepModal(m){
  return !!(m && ['destiny_gamble', 'affix_transfer', 'shop_confirm', 'w30_early_confirm', 'meta_legacy'].includes(m.type));
}

function closeCancelablePrepModals(){
  if (!game) return;
  game.inspTarget = null;
  game.mode = null;
  // Strictly preserve legal reward modals (levelup, chest, perk, w10_breakthrough, w20_breakthrough)!
  if (Array.isArray(game.pendingModals)) {
    game.pendingModals = game.pendingModals.filter(m => !isCancelablePrepModal(m));
  }
  if (isCancelablePrepModal(game.activeModal)) {
    game.activeModal = null;
    $('modalBackdrop').hidden = true;
    if (game.pendingModals && game.pendingModals.length > 0) {
      openNextModal();
    }
  } else if (!game.activeModal && game.pendingModals && game.pendingModals.length > 0) {
    openNextModal();
  } else if (!game.activeModal) {
    $('modalBackdrop').hidden = true;
  }
}

function closeAllPrepModals(){
  closeCancelablePrepModals();
}

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

function startW30Early({ acceptRandomClaim = false } = {}){
  if (!game || game.phase !== 'prep') return { ok: false, reason: 'not_in_prep' };
  const fp = game.finalPrep;
  if (!fp || !fp.active) {
    const started = startWave();
    return { ok: !!started, reason: started ? null : 'start_wave_blocked' };
  }
  if (fp.locked || fp.transitioning) {
    return { ok: false, reason: 'final_prep_locked' };
  }
  if (fp.awaitingWaveRewards || hasPendingW29WaveRewards()) {
    toast('⏳ 请先结清 W29 波末奖励（升级 / 遗留宝箱）后再进入 W30！', true);
    return { ok: false, reason: 'awaiting_wave_rewards' };
  }
  const pendingOffer = getPendingDestinyOffer();
  if (pendingOffer && !acceptRandomClaim) {
    game.activeModal = { type: 'w30_early_confirm', offerId: pendingOffer.offerId };
    renderW30EarlyConfirmModal();
    toast('🎲 天命赌局尚有未领取的三选一奖励：请先领取，或明确点击“接受随机领取并立即开战”！', true);
    renderAllUI(true);
    return { ok: false, reason: 'pending_destiny_offer_requires_choice', offerId: pendingOffer.offerId };
  }

  // ATOMIC SINGLE-FRAME TRANSITION MUTEX LOCK
  fp.locked = true;
  fp.transitioning = true;
  const clearedTransferDraft = !!game.transferDraft;
  const clearedShopDraft = !!game.shopConfirmDraft;
  if (game.transferDraft) cancelAffixTransferPreview();
  if (game.shopConfirmDraft) game.shopConfirmDraft = null;
  // Close cancelable prep UI modals FIRST so any legal levelup reward triggered by auto-claim is preserved!
  closeCancelablePrepModals();

  let autoClaimedOffer = null;
  if (pendingOffer && acceptRandomClaim) {
    autoClaimedOffer = autoClaimPendingDestinyReward(game.rnd, { allowDuringFinalPrepResolve: true });
  }
  // Close only any residual cancelable prep UI while strictly keeping legal reward modals (e.g. newly triggered levelup)!
  closeCancelablePrepModals();
  fp.lastResolution = {
    trigger: pendingOffer ? 'early_start_random_claim' : 'early_start',
    clearedTransferDraft,
    clearedShopDraft,
    autoClaimedOffer,
    resolvedAtWave: game.wave
  };
  const started = startWave({ fromFinalPrepEarly: true });
  return { ok: !!started, startedW30: !!started, autoClaimed: autoClaimedOffer, resolution: fp.lastResolution };
}

function resolveW29FinalPrepTimeout(){
  const fp = game?.finalPrep;
  if (!fp || !fp.active) return { ok: false, reason: 'not_active' };
  if (fp.locked || fp.transitioning) return { ok: false, reason: 'already_locked' };

  // ATOMIC SINGLE-FRAME TRANSITION MUTEX LOCK (rejects all duplicate/post-expiry clicks with 0 deduction!)
  fp.locked = true;
  fp.transitioning = true;
  fp.timer = 0;

  const clearedTransferDraft = !!game.transferDraft;
  const clearedShopDraft = !!game.shopConfirmDraft;
  if (game.transferDraft) cancelAffixTransferPreview();
  if (game.shopConfirmDraft) game.shopConfirmDraft = null;
  // Close cancelable prep UI modals FIRST so any legal levelup reward triggered by auto-claim is preserved!
  closeCancelablePrepModals();

  let autoClaimedOffer = null;
  if (game.destiny?.pendingOffer && !game.destiny.pendingOffer.claimed) {
    autoClaimedOffer = autoClaimPendingDestinyReward(game.rnd, { allowDuringFinalPrepResolve: true });
  }

  // Close only any residual cancelable prep UI while strictly keeping legal reward modals (e.g. newly triggered levelup)!
  closeCancelablePrepModals();
  fp.lastResolution = {
    trigger: 'timeout',
    clearedTransferDraft,
    clearedShopDraft,
    autoClaimedOffer,
    resolvedAtWave: game.wave
  };
  const started = startWave({ fromFinalPrepTimeout: true });
  return { ok: !!started, startedW30: !!started, autoClaimed: autoClaimedOffer, resolution: fp.lastResolution };
}

function enterW29FinalPrep(seconds = 90){
  const dur = Number(seconds) > 0 ? Number(seconds) : (BALANCE.progression.w29FinalPrepSeconds || 90);
  // Reveal W30 Boss intel if not already shown
  if (game.bossIntel) game.bossIntel.w30Revealed = true;
  // Auto-collect any remaining ground chests from W29 into reward modals so wave-end rewards settle BEFORE 90s timer starts!
  if (game.chests.length) {
    for (const c of game.chests) queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
    game.chests = [];
  }
  const awaiting = hasPendingW29WaveRewards();
  const nowMs = getMonotonicNowMs();
  game.subPhase = 'w29_final_prep';
  game.finalPrep = {
    active: true,
    awaitingWaveRewards: awaiting,
    started: !awaiting,
    locked: false,
    transitioning: false,
    timer: dur,
    duration: dur,
    maxSeconds: dur,
    startedAtMs: awaiting ? null : nowMs,
    deadlineMs: awaiting ? null : (nowMs + dur * 1000),
    lastClockMs: awaiting ? null : nowMs,
    lastObservedTimer: dur,
    usesWallClock: false,
    w30IntelShown: true,
    lastResolution: null
  };
  if (awaiting) {
    showBanner(
      '📦 W29 波末奖励结清中（90 秒倒计时暂未开始）',
      '请先完成 W29 升级选择与遗留宝箱领取；最后一个波末奖励关闭后将立即开启 90 秒终局整备倒计时！',
      'good'
    );
  } else {
    showBanner(
      `⏳ W29 终局整备开启（限时 ${Math.round(dur)} 秒）！`,
      `W30 深渊主宰情报（辅助：${game.bossIntel?.w30Aux || '未知'}）常驻右侧战况栏！真实时间走表（不可暂停），归零或提前开战将进入 W30 终局决战！`,
      'boss'
    );
  }
}

function completeWaveClear(){
  finalizeCurrentTelemetry();
  // Finish absorbing any final straggler gems; LEAVE chests on ground for manual prep pickup!
  for (const g of game.gems) gainHeroXp(g.xp);
  game.gems = [];
  game.shrine = null;
  game.healOrbs = [];

  const clearedWave = game.wave;
  const greedBonus = gearSetTier('greed') >= 2 ? 12 : 0;
  const clearBonus = BALANCE.economy.waveClearBase + clearedWave * BALANCE.economy.waveClearPerWave + greedBonus;
  const interest = perkLv('gold_power') >= 1 ? Math.min(25, Math.floor(game.gold * 0.10)) : 0;
  const clearMatBonus = getWaveClearMaterialBonus(clearedWave);
  if (clearBonus > 0) changeGold(clearBonus, 'wave_clear_bonus');
  if (interest > 0) changeGold(interest, 'wave_clear_interest');
  if (clearMatBonus > 0) changeMaterials(clearMatBonus, 'wave_clear_materials');
  game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + BALANCE.progression.waveClearHeal);
  $('hpVignette')?.classList.toggle('danger', game.hero.hp < game.hero.maxHp * 0.35);

  // W30 Final Boss cleared -> Run Victory!
  if (clearedWave >= MAIN_WAVES) {
    finishGame(true);
    return;
  }

  game.wave = clearedWave + 1;
  game.phase = 'prep';
  game.subPhase = null;
  game.rerollCost = BALANCE.economy.rerollStart;
  if (game.wavePlan) game.wavePlan.currentEncounter = null;
  if (game.metaRunState) {
    game.metaRunState.freeRefreshUsedThisWave = false;
    game.metaRunState.deflectReady = true;
  }
  syncRunResourceAccounting();

  // Stage progression & Major Breakthrough triggers (W5->W6, W10, W15->W16 preselect, W18->W19 intel, W20 breakthrough, W28 omen+W30 intel, W29->W30 final prep)
  if (clearedWave === 5) {
    game.shopTierBonus = Math.max(game.shopTierBonus, 1);
  } else if (clearedWave === 10) {
    game.hero.vouchers.w10 = true;
    game.shopTierBonus = Math.max(game.shopTierBonus, 2);
    if (!game.hero.breakthroughs.w10) {
      game.pendingBreakthrough = 'w10';
      if (game.chests.length) {
        for (const c of game.chests) queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
        game.chests = [];
      }
      queueModal({ type: 'w10_breakthrough', step: 'pick_skill' });
    }
  } else if (clearedWave === 15) {
    game.shopTierBonus = Math.max(game.shopTierBonus, 3);
  } else if (clearedWave === 18) {
    // W19 prep: reveal W20 Boss fixed core + rolled fair auxiliary mechanic!
    game.bossIntel.w20Revealed = true;
  } else if (clearedWave === 20) {
    // W20 Victory: 100% guaranteed Boss Voucher + IMMEDIATE activation of locked direction's base effect (even at 0 materials!)
    game.hero.vouchers.w20 = true;
    game.shopTierBonus = Math.max(game.shopTierBonus, 4);
    const dirKey = game.w20State?.lockedDirection || game.w20State?.preselectedDirection || getRecommendedW20Direction();
    const dirSpec = W20_DIRECTIONS[dirKey] || W20_DIRECTIONS.fire_chain_surge;
    if (game.w20State) {
      game.w20State.preselectedDirection = dirSpec.key;
      game.w20State.lockedDirection = dirSpec.key;
      game.w20State.locked = true;
      game.w20State.lockedAtWave = 20;
    }
    if (!game.hero.breakthroughs.w20 || game.hero.breakthroughs.w20.placeholder) {
      game.hero.breakthroughs.w20 = {
        wave: 20,
        completed: true,
        placeholder: false,
        directionKey: dirSpec.key,
        directionName: dirSpec.name,
        directionIcon: dirSpec.icon,
        baseEffectActive: true,
        baseEffectDesc: dirSpec.baseDesc,
        enhancementKey: null,
        enhancementName: null,
        enhancementDesc: null,
        rerollCount: 0
      };
      game.hero.baseMaxHp += 60;
      syncHeroMaxHp();
      game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 100);
      game.stats.breakthroughsCompleted = (game.stats.breakthroughsCompleted || 0) + 1;
      // Auto-collect any unpicked ground chests from W20 Boss
      if (game.chests.length) {
        for (const c of game.chests) queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
        game.chests = [];
      }
      initW20EnhancementDraft(dirSpec.key);
      game.pendingBreakthrough = 'w20';
      queueModal({ type: 'w20_breakthrough' });
    }
  } else if (clearedWave === 28) {
    const om = BALANCE.wave?.w28Omen || {};
    game.endgameOmen = {
      ...(game.endgameOmen || { wave: 28 }),
      triggered: true,
      clearTriggered: true,
      label: om.clearTitle || '🌑 终局预兆已现 · W29 前哨与终局情报即将揭晓！'
    };
    // Stage 5: Reveal W30 Final Boss (boss6) intel in W29 prep (concise banner + persistent HUD card, zero blocking popup!)
    if (game.bossIntel) game.bossIntel.w30Revealed = true;
  } else if (clearedWave === 29) {
    enterW29FinalPrep(BALANCE.progression.w29FinalPrepSeconds || 90);
  }

  game.hero.realm = getActiveUnlockNode().idx;
  rollShop(true);
  refreshCombos(true);

  const chestNote = game.chests.length ? ` · 地面有 ${game.chests.length} 个宝箱待拾取` : '';
  const intNote = interest ? ` + 利息 ${interest}` : '';
  if (clearedWave === 10) {
    showBanner('⚡ 第 10 波首领伏诛 · 触发【W10 首次大型突破】！', '指定一个已学主力神通并从 3 个随机形态分支中择一突破！主印上限将升至 4★、解锁第 2 辅印槽！', 'good');
  } else if (clearedWave === 15) {
    showBanner('⚡ 第 16 波备战 · 开放【W20 二破方向预选】！', 'W16–W19 随时可在顶栏/构筑总览预选与调整突破方向（击败 W20 首领拿到凭证后基础效果才会生效）！', 'good');
  } else if (clearedWave === 18) {
    showBanner(`🔎 W19 首领情报揭晓 · 天劫魔尊（辅助：${game.bossIntel.w20Aux}）`, `核心：${game.bossIntel.w20Core} · 辅助：${game.bossIntel.w20AuxDesc}`, 'boss');
  } else if (clearedWave === 20) {
    const w20 = game.hero.breakthroughs.w20;
    showBanner(`⚡ 天劫魔尊伏诛 · 【${w20?.directionName || '二破'}】基础效果已当场生效！`, '已获得 W20 突破凭证（零材料同样 100% 生效）！请从战后强化的候选卡中择一或消耗锻材整组重抽！', 'good');
  } else if (clearedWave === 28) {
    const om = BALANCE.wave?.w28Omen || {};
    showBanner(
      `🔎 W30 终局情报揭晓 · 深渊主宰（本局辅助：${game.bossIntel?.w30Aux || '未知'}）`,
      `核心：${game.bossIntel?.w30Core || '80%锁血冲击波'} · 辅助：${game.bossIntel?.w30AuxDesc || om.clearSub || 'W29 战后开启 90 秒最终整备'}`,
      'boss'
    );
  } else if (clearedWave !== 29) {
    const matNote = clearMatBonus > 0 ? ` · 精修锻材 +${clearMatBonus}` : '';
    showBanner(`✅ 第 ${clearedWave} / ${MAIN_WAVES} 波通关！`, `赏金 +${clearBonus}${intNote} 金${matNote} · 回血 +${BALANCE.progression.waveClearHeal}${chestNote}`, 'good');
  }
  AudioKit.play('merge');

  if (game.autoWave && !game.finalPrep?.active) {
    if (hasPendingDecision()) {
      game.autoWavePausedForDecision = true;
      game.autoWaveTimer = 4.0;
      toast('⏸️ 存在待选突破或奖励，自动开波已暂停！');
    } else {
      game.autoWavePausedForDecision = false;
      game.autoWaveTimer = 4.0;
    }
  }
  renderAllUI(true);
}

function finishGame(victory){
  if (game.curWaveTel) finalizeCurrentTelemetry();
  if (game.combatLog && !Number.isFinite(game.combatLog.settledAtRunClock)) {
    game.combatLog.settledAtRunClock = getCombatLogNowSec();
  }
  syncRunResourceAccounting();
  if (game.w30Battle && game.w30Battle.active) {
    const boss = game.enemies.find(e => e.kind === 'boss6');
    const hpPct = victory ? 0 : (boss ? Math.round(clamp(boss.hp, 0, boss.maxHp) * 100 / Math.max(1, boss.maxHp)) : 0);
    const at = Number((game.w30Battle.elapsedSeconds || 0).toFixed(2));
    game.w30Battle.active = false;
    game.w30Battle.signatureLockActive = false;
    game.w30Battle.outcome = victory ? 'victory' : 'defeat';
    game.w30Battle.phase = 'ended';
    game.w30Battle.phaseTimeline.push({ phase: 'ended', outcome: game.w30Battle.outcome, at, bossHpPct: hpPct });
  }
  game.phase = victory ? 'won' : 'lost';
  game.subPhase = null;
  if (game.finalPrep) {
    game.finalPrep.active = false;
    game.finalPrep.transitioning = false;
  }
  game.projectiles = [];
  game.zones = [];
  game.healOrbs = [];
  game.shrine = null;
  game.speed = 1;
  $('hpVignette')?.classList.remove('danger');
  // Stage 6: Idempotent per-runId settlement of legacy shards & one-time milestones
  settleRunMetaRewards(!!victory);
  showEndModal(victory);
  renderAllUI(true);
}

/* ==================== SIMULATION TICK ==================== */
function tick(dt){
  if (!game || !['prep','wave','harvest'].includes(game.phase)) return;

  const realDt = dt / Math.max(1, game.speed || 1);
  // BUG-01: W29 90s real-time countdown runs strictly on real monotonic time BEFORE paused guard!
  if (game.phase === 'prep' && game.finalPrep && game.finalPrep.active) {
    const expired = syncW29FinalPrepClock({
      fallbackRealDt: counters.inMainLoopFrame ? 0 : realDt,
      allowFallbackDt: !counters.inMainLoopFrame
    });
    if (expired) return;
  }

  if (paused) return;

  syncRunResourceAccounting();

  // In prep phase, check auto-wave decision pause (non-W29 prep)
  if (game.phase === 'prep' && !(game.finalPrep && game.finalPrep.active) && game.autoWave) {
    if (hasPendingDecision()) {
      game.autoWavePausedForDecision = true;
    } else {
      if (game.autoWavePausedForDecision) {
        game.autoWavePausedForDecision = false;
        game.autoWaveTimer = Math.max(game.autoWaveTimer || 0, 2.5);
      }
      game.autoWaveTimer -= dt;
      if (game.autoWaveTimer <= 0) {
        startWave();
        return;
      }
    }
  }

  if (game.activeModal) return;

  if (game.runMetrics) {
    if (game.phase === 'prep' && !game.finalPrep?.active) {
      game.runMetrics.prepSec += realDt;
      game.runMetrics.totalEffectiveSec += realDt;
    } else if (game.phase === 'harvest') {
      game.runMetrics.harvestSec += dt;
      game.runMetrics.totalEffectiveSec += dt;
    } else if (game.phase === 'wave') {
      const isBossWave = game.wave % (BALANCE.wave?.bossPeriod || 5) === 0;
      if (isBossWave) game.runMetrics.bossCombatSec += dt;
      else game.runMetrics.normalCombatSec += dt;
      game.runMetrics.totalEffectiveSec += dt;
    }
  }

  updateVfx(dt);
  updateHero(dt);
  updateCamera(dt, false);

  // Holy Tier-2 passive regen (+5/s)
  if (getSynergyTier('holy') >= 1) {
    game.holyRegenTimer -= dt;
    if (game.holyRegenTimer <= 0) {
      game.holyRegenTimer = 1.0;
      game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 5);
    }
  }

  if (game.phase === 'harvest') {
    updatePickups(dt);
    game.harvestTimer -= dt;
    if (game.gems.length === 0 || game.harvestTimer <= 0) {
      completeWaveClear();
    }
    return;
  }

  if (game.phase === 'prep') {
    updateSeal(dt);
    updatePickups(dt); // Allows walking over ground chests during prep!
    return;
  }

  // Wave Simulation with MAX_ENEMIES soft cap
  game.waveClock += dt;
  if (game.wave === MAIN_WAVES && game.w30Battle?.active) {
    game.w30Battle.elapsedSeconds = Number((game.w30Battle.elapsedSeconds + dt).toFixed(3));
  }
  if (game.curWaveTel) game.curWaveTel.duration = Number(game.waveClock.toFixed(1));

  // Arknights-style storm warning cue right before Stage 3 dense surge (and W28 Mid-Wave Endgame Omen!)
  if (!game.stormWarned && game.waveClock >= game.stormWarnAt) {
    game.stormWarned = true;
    AudioKit.play('boss', 0.85);
    if (game.wave === 28) {
      const om = BALANCE.wave?.w28Omen || {};
      if (game.endgameOmen) game.endgameOmen.midWaveTriggered = true;
      flashScreen('fail');
      showBanner(om.midTitle || '🌑 终局阴云压境 · 深渊低语回响！', om.midSub || '终局危机迫近！稳住阵脚准备迎接 W29 与 W30 终局决战！', 'boss');
    } else {
      showBanner('⚠️ 暴风雨将至 · 大波敌军即将合围！', '调整站位与冲刺冷却，迎战波内峰值怪潮！', 'boss');
    }
  }

  // Optional Black-Myth-style Blood Shrine activation!
  if (game.shrine && !game.shrine.active && !game.shrine.cleared) {
    const s = game.shrine;
    const shrineNeed = hasMetaAux('aux_shrine_compass') ? 0.15 : 0.30;
    if (dist(game.hero, s) <= s.r + 0.15) {
      s.charge += dt;
      if (s.charge >= shrineNeed) {
        s.active = true;
        if (game.curWaveTel) game.curWaveTel.shrineTried = true;
        const scale = Math.pow(BALANCE.wave.normalHpGrowth || 1.115, game.wave - 1);
        const boss = spawnEnemy('elite', 'west', scale * 2.10, { x: clamp(s.x + 1.2, 1, W-1), y: clamp(s.y, 1, H-1) });
        boss.isShrineBoss = true;
        boss.name = '🩸 血煞妖王';
        boss.col = '#ff3b5c';
        boss.spd = Number((boss.spd * 1.18).toFixed(2));
        boss.dmg = Math.round(boss.dmg * 1.30);
        boss.affixes = pickEliteAffixes(2);
        for (let k = 0; k < 3; k++) {
          if (game.enemies.length >= MAX_ENEMIES) break;
          const a = (Math.PI * 2 * k) / 3;
          spawnEnemy('wolf', 'west', scale, { x: clamp(s.x + Math.cos(a)*1.6, 0.8, W-0.8), y: clamp(s.y + Math.sin(a)*1.6, 0.8, H-0.8) });
        }
        AudioKit.play('boss', 1.1);
        game.shake = Math.max(game.shake, 7);
        addRing(s.x, s.y, '#ff3b5c', 3.4);
        showBanner('🩸 血煞妖碑已觉醒！', '【血煞妖王】现身！斩杀赢章节构装宝箱 + 25 金 + 2 锻材！', 'boss');
      }
    } else {
      s.charge = Math.max(0, s.charge - dt * 0.5);
    }
  }

  for (const w of game.waveQueue) {
    if (!w.spawned && game.waveClock >= w.at) {
      if (game.enemies.length >= MAX_ENEMIES) break;
      w.spawned = true;
      spawnEnemy(w.kind, w.side, w.scale);
    }
  }

  updateSeal(dt);
  updateProjectilesAndZones(dt);
  updateEnemies(dt);
  updatePickups(dt);

  if (game.phase !== 'wave') return;
  const allSpawned = game.waveQueue.every(w => w.spawned);
  if (allSpawned && game.enemies.length === 0) {
    beginWaveHarvest();
  }
}

/* ==================== VFX HELPERS ==================== */
function addRing(x, y, col, r){
  game.rings.push({ x, y, col, r, t: 0.34, max: 0.34 });
  if (game.rings.length > MAX_RINGS) game.rings.shift();
}
function addFloat(x, y, txt, col='#fff', big=false){
  game.floats.push({ x, y, txt, col, big, t: big ? 1.05 : 0.72, max: big ? 1.05 : 0.72 });
  if (game.floats.length > MAX_FLOATS) game.floats.shift();
}
function updateVfx(dt){
  game.shake = Math.max(0, game.shake - dt * 18);
  for (const r of game.rings) r.t -= dt;
  game.rings = game.rings.filter(r => r.t > 0);
  for (const b of game.beams) b.t -= dt;
  game.beams = game.beams.filter(b => b.t > 0);
  for (const l of game.bolts) l.t -= dt;
  game.bolts = game.bolts.filter(l => l.t > 0);
  for (const f of game.floats) { f.t -= dt; f.y -= dt * (f.big ? 0.95 : 0.68); }
  game.floats = game.floats.filter(f => f.t > 0);
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

let flashTimer = null;
function flashScreen(kind){
  const el = $('tribFlash');
  if (!el) return;
  el.className = 'trib-flash ' + (kind === 'gold' ? 'show-gold' : kind === 'dmg' ? 'show-dmg' : 'show-fail');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = 'trib-flash'; }, kind === 'dmg' ? 180 : 420);
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

/* ==================== RENDERING (CAMERA + VIEWPORT-CULLED CANVAS) ==================== */
function fitCamera(){
  cam.w = window.innerWidth;
  cam.h = window.innerHeight;
  cam.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cam.w * cam.dpr);
  canvas.height = Math.round(cam.h * cam.dpr);
  const availH = Math.max(300, cam.h - 170);
  const availW = Math.max(300, cam.w - 24);
  // Fixed ~24x16 tactical viewport window moving across 64x48 open world
  cam.zoom = clamp(Math.min(availW / (24 * CELL), availH / (16 * CELL)), 0.72, 1.15);
  if (game) updateCamera(0, true);
}

function updateCamera(dt, snap = false){
  if (!game) return;
  const worldW = W * CELL, worldH = H * CELL;
  // Reserve HUD safe margins so world borders & hero are NEVER occluded by topbar/subbar or bottom shop dock
  const subRect = $('subbar')?.getBoundingClientRect?.();
  const dockRect = $('dock')?.getBoundingClientRect?.();
  const topSafePx = clamp((subRect?.bottom || 104) + 14, 70, cam.h * 0.30);
  const botSafePx = clamp((dockRect?.height || 86) + 22, 70, cam.h * 0.30);
  const sideSafePx = 18;

  const minCamX = (cam.w / 2 - sideSafePx) / cam.zoom;
  const maxCamX = worldW - (cam.w / 2 - sideSafePx) / cam.zoom;
  const minCamY = (cam.h / 2 - topSafePx) / cam.zoom;
  const maxCamY = worldH - (cam.h / 2 - botSafePx) / cam.zoom;

  let tx = game.hero.x * CELL;
  let ty = game.hero.y * CELL;
  if (minCamX >= maxCamX) tx = worldW / 2;
  else tx = clamp(tx, minCamX, maxCamX);
  if (minCamY >= maxCamY) ty = worldH / 2;
  else ty = clamp(ty, minCamY, maxCamY);

  if (snap || dt <= 0) {
    cam.x = tx; cam.y = ty;
  } else {
    const k = 1 - Math.exp(-8.5 * dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }
}

function screenToWorld(sx, sy){
  return {
    x: ((sx - cam.w / 2) / cam.zoom + cam.x) / CELL,
    y: ((sy - cam.h / 2) / cam.zoom + cam.y) / CELL
  };
}
function worldToScreen(wx, wy){
  return {
    x: (wx * CELL - cam.x) * cam.zoom + cam.w / 2,
    y: (wy * CELL - cam.y) * cam.zoom + cam.h / 2
  };
}

function render(){
  if (!game) return;
  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  ctx.fillStyle = '#091014';
  ctx.fillRect(0, 0, cam.w, cam.h);

  const sx = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
  const sy = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;

  ctx.save();
  ctx.translate(cam.w / 2 + sx, cam.h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawArena();
  drawZones();
  drawPickups();
  drawEnemies();
  drawHero();
  drawArtifacts();
  drawProjectilesBeamsBolts();
  drawTopTelegraphs();
  drawRingsAndFloats();

  ctx.restore();

  // Screen-space offscreen directional arrows (Boss / Elite / Chests) & W30 Boss Top Bar
  drawEdgeIndicators();
  drawW30BossTopBar();
}

function drawTopTelegraphs(){
  if (!game?.zones?.length) return;
  for (const z of game.zones) {
    if (z.kind === 'w30SigTelegraph' || z.kind === 'w30SigShockwave') {
      const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
      const sx = z.safeX * CELL, sy = z.safeY * CELL, sr = (z.safeR || 2.8) * CELL;
      const prog = 1 - clamp(z.t / Math.max(0.01, z.max), 0, 1);
      ctx.save();
      if (z.kind === 'w30SigTelegraph') {
        // High-contrast crimson danger ring + sweeping charge wave
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,30,66,0.12)'; ctx.fill();
        ctx.strokeStyle = '#ff2e63'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(10, zr * prog), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe678'; ctx.lineWidth = 3.5; ctx.stroke();
      } else {
        // Erupting high-contrast shockwave rings
        const curR = Math.max(12, zr * prog);
        ctx.beginPath(); ctx.arc(zx, zy, curR, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff2e63'; ctx.lineWidth = 10; ctx.stroke();
        ctx.beginPath(); ctx.arc(zx, zy, curR, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 3.5; ctx.stroke();
      }
      // Ultra-clear Emerald/Cyan Safe Zone (drawn on TOP so hero ALWAYS sees safety!)
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(72,255,178,0.24)'; ctx.fill();
      ctx.strokeStyle = '#62ffb8'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, sr * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 6]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#eafff5';
      ctx.fillText(z.kind === 'w30SigTelegraph' ? `✅ 安全区 (${z.t.toFixed(1)}s)` : '✅ 安全区(免疫冲击波)', sx, sy - sr - 10);
      ctx.restore();
    } else if (z.kind === 'w30RiftRing') {
      const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
      const prog = 1 - clamp(z.t / Math.max(0.01, z.max), 0, 1);
      ctx.save();
      ctx.beginPath(); ctx.arc(zx, zy, Math.max(8, zr * prog), 0, Math.PI * 2);
      ctx.strokeStyle = '#ff52b8'; ctx.lineWidth = 7; ctx.stroke();
      ctx.beginPath(); ctx.arc(zx, zy, Math.max(8, zr * prog), 0, Math.PI * 2);
      ctx.strokeStyle = '#ffe88a'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
  }
}

function drawW30BossTopBar(){
  if (!game || game.wave !== MAIN_WAVES || game.phase !== 'wave') return;
  const boss = game.enemies.find(e => e.kind === 'boss6' && e.hp > 0);
  if (!boss) return;
  const barW = Math.min(520, Math.max(260, cam.w * 0.44));
  const barH = 18;
  const x = (cam.w - barW) / 2;
  const y = 108;
  const ratio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
  const sigPct = BALANCE.w30Boss?.signatureThresholdPct ?? 0.80;
  const finPct = BALANCE.w30Boss?.finalPhaseThresholdPct ?? 0.35;
  const bState = game.w30Battle;
  const phaseTag = boss.signatureLockActive
    ? '🛡️ 终焉锁血（命中可挂状态/叠盾 · 0 扣血）'
    : boss.finalPhaseEntered
      ? '🔥 末段组合压制（无锁血 · 打空即胜）'
      : boss.signatureTriggered
        ? '⚔️ 中段周旋'
        : '⚔️ 开场交锋';

  ctx.save();
  ctx.fillStyle = 'rgba(10,16,22,0.86)';
  ctx.fillRect(x - 10, y - 24, barW + 20, barH + 34);
  ctx.strokeStyle = boss.signatureLockActive ? '#ffd97d' : '#ff4d6d';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, y - 24, barW + 20, barH + 34);

  ctx.font = '900 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff3d6';
  ctx.fillText(`👑 深渊主宰 · ${phaseTag}`, x, y - 8);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffd97d';
  ctx.fillText(`${Math.ceil(boss.hp).toLocaleString()} / ${boss.maxHp.toLocaleString()} (${Math.round(ratio * 100)}%) · ${Number(bState?.elapsedSeconds || 0).toFixed(0)}s`, x + barW, y - 8);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = boss.signatureLockActive ? '#ffd166' : boss.finalPhaseEntered ? '#ff385c' : '#ff5270';
  ctx.fillRect(x, y, barW * ratio, barH);

  // 80% Signature & 35% Final Phase threshold markers
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + barW * sigPct - 1, y - 2, 2, barH + 4);
  ctx.fillRect(x + barW * finPct - 1, y - 2, 2, barH + 4);
  ctx.restore();
}

function drawArena(){
  // Strict visible viewport AABB culling (never iterates all 3072 tiles!)
  const halfW = (cam.w / (2 * cam.zoom)) / CELL;
  const halfH = (cam.h / (2 * cam.zoom)) / CELL;
  const cxTile = cam.x / CELL, cyTile = cam.y / CELL;
  const x0 = Math.max(0, Math.floor(cxTile - halfW) - 1);
  const x1 = Math.min(W - 1, Math.ceil(cxTile + halfW) + 1);
  const y0 = Math.max(0, Math.floor(cyTile - halfH) - 1);
  const y1 = Math.min(H - 1, Math.ceil(cyTile + halfH) + 1);

  let tilesDrawn = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      ctx.fillStyle = ((x + y) % 2) ? '#121f24' : '#152329';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      tilesDrawn++;
    }
  }
  perfStats.culledTiles = tilesDrawn;

  // Subtle spatial landmark grid every 8 tiles
  ctx.strokeStyle = 'rgba(130,205,198,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / 8) * 8; x <= x1; x += 8) {
    ctx.moveTo(x * CELL, y0 * CELL);
    ctx.lineTo(x * CELL, (y1 + 1) * CELL);
  }
  for (let y = Math.ceil(y0 / 8) * 8; y <= y1; y += 8) {
    ctx.moveTo(x0 * CELL, y * CELL);
    ctx.lineTo((x1 + 1) * CELL, y * CELL);
  }
  ctx.stroke();

  // Culled non-blocking terrain landmarks (ancient rune circles, flagstones, tufts)
  let propsDrawn = 0;
  for (const p of runtimeCtx.terrainProps) {
    const pad = p.rad || 1;
    if (p.x + pad < x0 || p.x - pad > x1 + 1 || p.y + pad < y0 || p.y - pad > y1 + 1) continue;
    propsDrawn++;
    const px = p.x * CELL, py = p.y * CELL;
    if (p.kind === 'rune') {
      ctx.beginPath();
      ctx.arc(px, py, p.rad * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, p.rad * CELL * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'stone') {
      ctx.save();
      ctx.translate(px, py); ctx.rotate(p.rot);
      ctx.fillStyle = 'rgba(170,205,205,0.06)';
      const sw = p.s * CELL;
      ctx.fillRect(-sw, -sw * 0.65, sw * 2, sw * 1.3);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, p.s * CELL * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(92,195,140,0.08)';
      ctx.fill();
    }
  }
  perfStats.culledProps = propsDrawn;

  // Glowing Secret Realm Boundary (世界结界光墙)
  ctx.strokeStyle = 'rgba(108,226,255,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W * CELL - 4, H * CELL - 4);
  ctx.strokeStyle = 'rgba(255,214,102,0.22)';
  ctx.lineWidth = 10;
  ctx.strokeRect(7, 7, W * CELL - 14, H * CELL - 14);
}

function drawArtifacts(){
  const h = game.hero;
  const hx = h.x * CELL, hy = h.y * CELL;
  const inCombat = game.phase === 'wave' && game.enemies.length > 0;

  // Frost Domain perk aura ring + Dual Wind+Frost Aura
  const fdLv = perkLv('frost_domain');
  if (fdLv > 0 && inCombat) {
    const rad = (fdLv >= 2 ? 4.5 : 3.2) * CELL;
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(108,226,255,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(108,226,255,0.32)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]); ctx.stroke();
    ctx.restore();
  }
  if (hasDualRes('wind_frost') && inCombat) {
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, 3.4 * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(132,255,216,0.26)'; ctx.lineWidth = 1.8;
    ctx.setLineDash([10, 6]); ctx.stroke();
    ctx.restore();
  }

  // Subtle Realm + Active Seal halo under Hero (no cluttered orbiting balls!)
  const rCol = getRealm(h.realm).col;
  if (h.realm > 0 || (inCombat && game.seal)) {
    const col = (inCombat && game.seal) ? ELEMENTS[game.seal.elem].color : rCol;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 22 + h.realm * 2 + Math.sin(performance.now() / 160) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.globalAlpha = inCombat ? 0.44 : 0.28;
    ctx.lineWidth = 2.2 + h.realm * 0.35;
    ctx.stroke();
    ctx.restore();
  }
}

function drawHero(){
  const h = game.hero;
  const hx = h.x * CELL, hy = h.y * CELL;
  const hs = getHeroStats();
  const rSpec = getRealm(h.realm);

  // Overdrive golden aura
  if (h.ultTimer > 0) {
    ctx.beginPath();
    ctx.arc(hx, hy, 30 + Math.sin(performance.now()/80)*4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,90,0.22)'; ctx.fill();
    ctx.strokeStyle = '#ffe878'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Orbiting Blades (旋风飞刃: tightened radius matching combat collision!) + Combo Array Auras
  const bLv = h.skills.blades || 0;
  const hasWanjian = hasCombo('wanjian');
  const hasIceBlades = hasCombo('ice_blades');
  if (hasWanjian) {
    const rot = performance.now() / 650;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(rot);
    ctx.beginPath(); ctx.arc(0, 0, 1.35 * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,228,120,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke();
    ctx.setLineDash([]);
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 1.15 * CELL, Math.sin(a) * 1.15 * CELL);
      ctx.lineTo(Math.cos(a) * 1.48 * CELL, Math.sin(a) * 1.48 * CELL);
      ctx.strokeStyle = 'rgba(255,240,160,0.62)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }
  if (bLv > 0 && game.phase === 'wave' && game.enemies.length > 0) {
    const count = bLv + 1;
    const orbitR = (1.65 + bLv * 0.10) * hs.skillRangeMult * CELL;
    ctx.beginPath();
    ctx.arc(hx, hy, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = hasIceBlades ? 'rgba(130,245,255,0.42)' : 'rgba(142,244,255,0.12)';
    ctx.lineWidth = hasIceBlades ? 2.4 : 1.5;
    ctx.stroke();
    if (hasIceBlades) {
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(-h.bladeAngle * 0.5);
      for (let t = 0; t < 2; t++) {
        ctx.beginPath();
        for (let p = 0; p < 3; p++) {
          const a = (Math.PI * 2 * p) / 3 + t * Math.PI;
          const x = Math.cos(a) * orbitR * 0.92, y = Math.sin(a) * orbitR * 0.92;
          if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(160,248,255,0.22)'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < count; i++) {
      const ang = h.bladeAngle + (Math.PI * 2 * i) / count;
      const bx = hx + Math.cos(ang) * orbitR;
      const by = hy + Math.sin(ang) * orbitR;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang + Math.PI / 2);
      const bScale = hasIceBlades ? 1.32 : 1.0;
      ctx.beginPath();
      ctx.moveTo(0, -12 * bScale); ctx.lineTo(5.5 * bScale, 6 * bScale); ctx.lineTo(0, 3 * bScale); ctx.lineTo(-5.5 * bScale, 6 * bScale); ctx.closePath();
      ctx.fillStyle = hasIceBlades ? '#b6f8ff' : hasWanjian ? '#ffe888' : '#8ef4ff'; ctx.fill();
      ctx.strokeStyle = hasIceBlades ? '#52d6ff' : '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
  }

  // Hero Body (size & rim glow scale with Cultivation Realm!)
  const bodyR = 14 + h.realm * 0.8;
  ctx.beginPath();
  ctx.arc(hx, hy, bodyR, 0, Math.PI * 2);
  ctx.fillStyle = h.invuln > 0 ? '#ffffff' : '#2a8fff';
  ctx.fill();
  ctx.strokeStyle = (h.armorBreakT || 0) > 0 ? '#ff6b57' : h.shield > 0 ? '#8ef5ff' : rSpec.col;
  ctx.lineWidth = (h.armorBreakT || 0) > 0 ? 4 : 3;
  ctx.stroke();
  // Crown / realm crest
  ctx.fillStyle = rSpec.col;
  ctx.beginPath();
  ctx.moveTo(hx - 7, hy - 9); ctx.lineTo(hx - 4, hy - 16); ctx.lineTo(hx, hy - 11);
  ctx.lineTo(hx + 4, hy - 16); ctx.lineTo(hx + 7, hy - 9); ctx.closePath();
  ctx.fill();

  // HP Bar (Sole Lifeline!)
  const r = clamp(h.hp / h.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(hx - 18, hy - 25, 36, 6);
  ctx.fillStyle = r < 0.35 ? '#ff6250' : '#6cf29c';
  ctx.fillRect(hx - 17, hy - 24, 34 * r, 4);
}

function drawEdgeIndicators(){
  const padX = 36, padTop = 108, padBot = 106;
  const targets = [];
  for (const e of game.enemies) {
    if (e.boss) targets.push({ x: e.x, y: e.y, col: '#ff5247', label: 'BOSS' });
    else if (e.elite) targets.push({ x: e.x, y: e.y, col: e.isShrineBoss ? '#ff3b5c' : '#c978ff', label: e.isShrineBoss ? '妖王' : '精英' });
  }
  if (game.shrine && !game.shrine.active && !game.shrine.cleared) {
    targets.push({ x: game.shrine.x, y: game.shrine.y, col: '#ff4d6d', label: '🩸妖碑' });
  }
  for (const c of game.chests) {
    targets.push({ x: c.x, y: c.y, col: '#ffe066', label: c.legend ? '👑' : '📦' });
  }
  for (const t of targets) {
    const sp = worldToScreen(t.x, t.y);
    if (sp.x >= 24 && sp.x <= cam.w - 24 && sp.y >= padTop && sp.y <= cam.h - padBot) continue;
    const cx = cam.w / 2, cy = cam.h / 2;
    const ang = Math.atan2(sp.y - cy, sp.x - cx);
    const ix = clamp(sp.x, padX, cam.w - padX);
    const iy = clamp(sp.y, padTop, cam.h - padBot);
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-4, 0); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fillStyle = t.col; ctx.fill();
    ctx.strokeStyle = '#10191f'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = t.col;
    ctx.fillText(t.label, ix, iy - 12);
  }
}

function drawEnemies(){
  for (const e of game.enemies) {
    const ex = e.x * CELL, ey = e.y * CELL;
    const rad = e.r * CELL;

    // Telegraph leap / charge corridor during windup
    if (e.aiState === 'windup') {
      const lineLen = (e.aiKind === 'leap' ? 3.2 : 4.6) * CELL;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,70,56,0.72)';
      ctx.lineWidth = e.boss ? 16 : 8;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + e.aiVx * lineLen, ey + e.aiVy * lineLen);
      ctx.stroke();
      ctx.restore();
    }

    // Unstoppable Gold-Crimson Aura during windup/leap/charge!
    if (isEnemyUnstoppable(e)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ex, ey, rad + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffcc4d'; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, rad + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,82,66,0.65)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffdf6e';
      ctx.fillText('🛡️霸体', ex, ey - rad - 16);
      ctx.restore();
    }
    if (e.elite || e.boss || e.frenzyT > 0) {
      ctx.beginPath();
      ctx.arc(ex, ey, rad + 6, 0, Math.PI * 2);
      ctx.fillStyle = e.boss ? 'rgba(255,65,50,0.22)' : e.isShrineBoss ? 'rgba(255,59,92,0.28)' : e.elite ? 'rgba(190,102,255,0.22)' : 'rgba(255,159,67,0.20)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(ex, ey, rad, 0, Math.PI * 2);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.freezeT > 0 ? '#8ceeff' : e.col;
    ctx.fill();
    ctx.strokeStyle = e.fireMarkT > 0 ? '#ff6d38' : e.shield > 0 ? '#6ce2ff' : e.slowT > 0 ? '#7ce8ff' : e.rim;
    ctx.lineWidth = (e.boss || e.elite || e.shield > 0 || e.fireMarkT > 0) ? 3 : 1.8;
    ctx.stroke();

    // Fire Mark indicator (W10 Fire breakthrough hook)
    if (e.fireMarkT > 0) {
      ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9a52';
      ctx.fillText(`🔥×${e.fireMarkStacks || 1}`, ex, ey + rad + 11);
    }

    // Elite affix tag
    if (e.elite && e.affixes?.length) {
      ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = e.isShrineBoss ? '#ff8ca0' : '#e6c2ff';
      ctx.fillText(e.affixes.map(a => a.name).join('·'), ex, ey - rad - 13);
    }

    // HP Bar for damaged / elites / bosses
    if (e.hp < e.maxHp || e.elite || e.boss || e.shield > 0) {
      const bw = e.boss ? 48 : e.elite ? 32 : 20;
      const r = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(ex - bw/2, ey - rad - 9, bw, 4.5);
      ctx.fillStyle = e.boss ? '#ff4f42' : e.isShrineBoss ? '#ff3b5c' : e.elite ? '#d284ff' : '#ff7b61';
      ctx.fillRect(ex - bw/2 + 0.5, ey - rad - 8.5, (bw - 1) * r, 3.5);
      if (e.shield > 0) {
        const sr = clamp(e.shield / (e.maxHp * 0.16), 0, 1);
        ctx.fillStyle = '#6ce2ff';
        ctx.fillRect(ex - bw/2 + 0.5, ey - rad - 11, (bw - 1) * sr, 2);
      }
    }
  }
}

function drawPickups(){
  const h = game.hero;
  const isHarvest = game.phase === 'harvest';
  for (const g of game.gems) {
    const gx = g.x * CELL, gy = g.y * CELL;
    const s = g.big ? 6 : 4;
    if (isHarvest || g.magnetized) {
      const dx = h.x * CELL - gx, dy = h.y * CELL - gy;
      const d = Math.max(1, Math.hypot(dx, dy));
      const trail = Math.min(26, d * 0.45);
      ctx.strokeStyle = g.big ? 'rgba(255,228,120,0.55)' : 'rgba(110,244,255,0.48)';
      ctx.lineWidth = g.big ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - (dx/d)*trail, gy - (dy/d)*trail); ctx.stroke();
    }
    ctx.fillStyle = g.big ? '#ffe478' : '#6ef4ff';
    ctx.beginPath();
    ctx.moveTo(gx, gy - s); ctx.lineTo(gx + s * 0.8, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - s * 0.8, gy); ctx.closePath();
    ctx.fill();
  }
  for (const c of game.chests) {
    const cx = c.x * CELL, cy = c.y * CELL + Math.sin(c.bob) * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = c.legend ? 'rgba(255,196,64,0.3)' : c.shrineTier ? 'rgba(255,65,95,0.34)' : 'rgba(196,120,255,0.28)';
    ctx.fill();
    ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.legend ? '👑' : c.shrineTier ? '🩸' : '📦', cx, cy);
  }
  for (const orb of (game.healOrbs || [])) {
    const ox = orb.x * CELL, oy = orb.y * CELL + Math.sin(orb.bob || 0) * 3;
    ctx.beginPath();
    ctx.arc(ox, oy, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(98,255,184,0.32)'; ctx.fill();
    ctx.strokeStyle = '#62ffb8'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💚', ox, oy);
  }
}

function drawZones(){
  // Optional Blood Shrine (血煞妖碑)
  if (game.shrine && !game.shrine.cleared) {
    const s = game.shrine;
    const sx = s.x * CELL, sy = s.y * CELL, sr = s.r * CELL;
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = s.active ? 'rgba(255,48,80,0.24)' : 'rgba(255,58,92,0.14)';
    ctx.fill();
    ctx.strokeStyle = s.active ? '#ff8096' : '#ff3b5c';
    ctx.lineWidth = 2.5;
    if (!s.active) ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!s.active && s.charge > 0) {
      ctx.beginPath();
      ctx.arc(sx, sy, sr * clamp(s.charge / 0.30, 0, 1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,70,100,0.35)'; ctx.fill();
    }
    ctx.font = '900 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff9cb0';
    ctx.fillText(s.active ? '🩸妖王试炼中' : '🩸血煞妖碑(踩入挑战)', sx, sy - sr - 6);
    ctx.restore();
  }

  for (const z of game.zones) {
    const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
    if (z.kind === 'lava' || z.kind === 'fireVortex') {
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = z.kind === 'fireVortex'
        ? `rgba(255,120,40,${0.26 * (z.t / z.max)})`
        : `rgba(255,95,35,${0.25 * (z.t / z.max)})`;
      ctx.fill();
      if (z.kind === 'fireVortex') {
        ctx.strokeStyle = 'rgba(255,190,85,0.65)'; ctx.lineWidth = 2; ctx.stroke();
      }
    } else if (z.kind === 'frostVortex' || z.kind === 'frostTrail') {
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108,226,255,${0.22 * (z.t / z.max)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(142,244,255,0.45)'; ctx.lineWidth = 1.6; ctx.stroke();
    } else if (z.kind === 'thunderField') {
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(198,136,255,${0.22 * (z.t / z.max)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(216,166,255,0.5)'; ctx.lineWidth = 1.8; ctx.stroke();
    } else if (z.kind === 'enemyLava') {
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,55,30,${0.28 * (z.t / z.max)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(255,110,60,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (z.kind === 'poisonPool') {
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(60,245,135,${0.22 * (z.t / z.max)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(82,255,154,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (z.kind === 'poisonBomb') {
      const prog = 1 - z.t / z.max;
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(82,255,154,0.14)'; ctx.fill();
      ctx.strokeStyle = '#52ff9a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(zx, zy, zr * prog, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(82,255,154,0.30)'; ctx.fill();
    } else if (z.kind === 'bossWave') {
      const prog = 1 - z.t / z.max;
      ctx.beginPath(); ctx.arc(zx, zy, Math.max(6, zr * prog), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,90,65,${1 - prog * 0.4})`; ctx.lineWidth = 6; ctx.stroke();
    } else if (z.kind === 'bossSlam') {
      const prog = 1 - z.t / z.max;
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,55,40,0.16)'; ctx.fill();
      ctx.strokeStyle = '#ff5642'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(zx, zy, zr * prog, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,70,50,0.28)'; ctx.fill();
    }
  }
}

function drawProjectilesBeamsBolts(){
  for (const p of game.projectiles) {
    const px = p.x * CELL, py = p.y * CELL;
    if (p.kind === 'firewave') {
      const a = Math.atan2(p.vy, p.vx);
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      if (p.comboStyle === 'wanjian') {
        ctx.beginPath();
        ctx.moveTo(20, 0); ctx.lineTo(-2, -6); ctx.lineTo(-6, -2); ctx.lineTo(-16, -2);
        ctx.lineTo(-16, 2); ctx.lineTo(-6, 2); ctx.lineTo(-2, 6); ctx.closePath();
        ctx.fillStyle = '#ffe878'; ctx.fill();
        ctx.strokeStyle = '#8ef8ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6, 8);
        ctx.strokeStyle = '#ffd24c'; ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 14, -1.1, 1.1);
        ctx.strokeStyle = p.isThunderFireCombo ? '#d284ff' : (p.w10Branch ? '#ff542e' : '#ff8c42'); ctx.lineWidth = 5.5; ctx.stroke();
        ctx.strokeStyle = p.isThunderFireCombo ? '#ffe878' : '#fff0a0'; ctx.lineWidth = 2; ctx.stroke();
        if (p.isThunderFireCombo) {
          ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(4, -4); ctx.lineTo(-3, 4); ctx.lineTo(5, 12);
          ctx.strokeStyle = '#ffe878'; ctx.lineWidth = 1.8; ctx.stroke();
        }
      }
      ctx.restore();
    } else if (p.kind === 'arrow') {
      const a = Math.atan2(p.vy, p.vx);
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.strokeStyle = p.w10Branch ? '#8cf0ff' : '#8ef8c6'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'fireball') {
      ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7b38'; ctx.fill();
      ctx.strokeStyle = '#fff09c'; ctx.lineWidth = 1.6; ctx.stroke();
    } else if (p.kind === 'frostball') {
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#7beeff'; ctx.fill();
    } else if (p.kind === 'enemyShot') {
      ctx.beginPath(); ctx.arc(p.tx * CELL, p.ty * CELL, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,102,196,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ff66c4'; ctx.fill();
      ctx.strokeStyle = '#ffd6f0'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  for (const b of game.beams) {
    const alpha = b.t / b.max;
    ctx.save();
    ctx.strokeStyle = b.col || `rgba(255,232,120,${alpha})`;
    ctx.globalAlpha = b.col ? alpha : 1;
    ctx.lineWidth = b.w * alpha;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x1 * CELL, b.y1 * CELL); ctx.lineTo(b.x2 * CELL, b.y2 * CELL); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = Math.max(1.5, b.w * 0.35 * alpha);
    ctx.stroke();
    ctx.restore();
  }
  for (const l of game.bolts) {
    const alpha = l.t / l.max;
    ctx.save();
    ctx.strokeStyle = l.col;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = l.comboThunderFire ? 5 : 3;
    ctx.beginPath();
    l.pts.forEach((pt, i) => {
      const lx = pt.x * CELL + (i > 0 ? (Math.random()-0.5)*7 : 0);
      const ly = pt.y * CELL + (i > 0 ? (Math.random()-0.5)*7 : 0);
      if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    });
    ctx.stroke();
    if (l.comboThunderFire) {
      ctx.strokeStyle = '#ffe878';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRingsAndFloats(){
  for (const r of game.rings) {
    const u = 1 - r.t / r.max;
    ctx.beginPath();
    ctx.arc(r.x * CELL, r.y * CELL, Math.max(4, r.r * CELL * (0.28 + 0.72 * u)), 0, Math.PI * 2);
    ctx.strokeStyle = r.col;
    ctx.globalAlpha = 1 - u;
    ctx.lineWidth = 3 * (1 - u * 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  for (const f of game.floats) {
    const alpha = clamp(f.t / f.max * 1.4, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = f.big ? '900 15px sans-serif' : '800 12px sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(f.txt, f.x * CELL + 1, f.y * CELL + 1);
    ctx.fillStyle = f.col;
    ctx.fillText(f.txt, f.x * CELL, f.y * CELL);
  }
  ctx.globalAlpha = 1;
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
