import BALANCE from '../data/balance.js';
import AudioKit from '../ui/audio/audio.js';
import { buildTerrainProps } from '../core/terrain.js';
import { mulberry32 } from '../core/rng.js';
import { dist, clamp, xpForLevel } from '../core/math.js';
import { createRuntimeContext } from '../core/runtime-context.js';
import { createMetaSystem } from '../systems/meta/index.js';
import { createEquipmentCore } from '../systems/equipment/index.js';
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
  MAX_PROJECTILES,
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
  ARTIFACT_KEYS,
  SUB_SEAL_RESONANCE,
  SEAL_SPECIALIZATIONS,
  COMBOS,
  COMBO_LIST,
  PERKS,
  PERK_LIST,
  PILLS,
  PILL_KEYS,
  HERO_SKILLS,
  W10_SKILL_BRANCHES,
  GEAR_SETS,
  DUAL_RESONANCES,
  GEARS,
  GEAR_KEYS,
  BASE_GEAR_KEYS,
  GEAR_RARITY_LABELS,
  GEAR_RARITY_COLORS,
  GEAR_SALVAGE_GOLD,
  SOURCE_STAGES,
  GEAR_STAR_MULT,
  GEAR_AFFIXES,
  GEAR_AFFIX_KEYS,
  BASE_AFFIX_KEYS,
  GEAR_SYNERGIES,
  ELITE_AFFIXES,
  W20_BOSS_AUX_POOL,
  W30_BOSS_AUX_POOL,
  W20_DIRECTIONS,
  W20_DIRECTION_KEYS,
  W20_ENHANCEMENTS,
  ENEMY_SPECS,
  DESTINY_ENHANCEMENTS,
  DESTINY_ENHANCEMENT_KEYS,
  DESTINY_SPECIAL_BOONS,
  DESTINY_SPECIAL_BOON_KEYS,
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
  getGearBaseMult,
  nextGearUid,
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
    isPointerDown: () => pointerDown,
  },
});
loadMetaSave();

function getW10BranchSpec(skillKey, branchKey = game?.hero?.w10Branch?.[skillKey]){
  if (!skillKey || !branchKey) return null;
  return (W10_SKILL_BRANCHES[skillKey] || []).find(b => b.key === branchKey) || null;
}

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


/* Wave / Breakthrough Node Evaluation (replaces old 4 manual tribulations!) */
function getActiveUnlockNode(){
  if (!game?.hero) return UNLOCK_NODES[0];
  const w = game.wave || 1;
  const br = game.hero.breakthroughs || {};
  let active = UNLOCK_NODES[0];
  for (const node of UNLOCK_NODES) {
    const waveOk = w >= (node.minWave || 1);
    const brOk = !node.requireBreakthrough || !!br[node.requireBreakthrough];
    if (waveOk && brOk) active = node;
  }
  game.hero.realm = active.idx;
  return active;
}

function getRealm(idx = null){
  if (idx === null || idx === undefined) return getActiveUnlockNode();
  return UNLOCK_NODES[clamp(idx, 0, UNLOCK_NODES.length - 1)];
}

function getRealmStageLabel(){
  const node = getActiveUnlockNode();
  return `${node.name}·${node.stageTag || '进阶'}`;
}

function getUnlockedSkillPool(){
  return getActiveUnlockNode().skills.slice();
}

function perkLv(k){ return queryPerkLv(game, k); }
function hasCombo(k){ return queryHasCombo(game, k); }

function getSealStarCap(){
  const node = getActiveUnlockNode();
  const bonus = perkLv('artifact_overclock') >= 2 ? 1 : 0;
  return Math.min(5, node.sealCap + bonus);
}

function getSubSealSlotCap(){
  const node = getActiveUnlockNode();
  const bonus = perkLv('artifact_overclock') >= 1 ? 1 : 0;
  return Math.min(2, node.subCap + bonus);
}

function getShopTier(){
  const node = getActiveUnlockNode();
  const base = (game.wave >= 16 || node.idx >= 2) ? 3 : (game.wave >= 6 || node.idx >= 1) ? 2 : 1;
  return Math.min(3, base + (game.shopTierBonus || 0));
}

function hasPendingDecision(){
  if (!game) return false;
  if (game.activeModal && game.activeModal.type !== 'intro') return true;
  if (game.pendingModals && game.pendingModals.length > 0) return true;
  if (game.pendingBreakthrough) return true;
  if (game.destiny?.pendingOffer && !game.destiny.pendingOffer.claimed) return true;
  if (game.chests && game.chests.length > 0) return true;
  return false;
}

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

const RESOURCE_LEDGER_MAX = 500;
function recordResourceFlow(resourceType, delta, reason = 'unknown'){
  if (!game) return 0;
  const amt = Math.round(Number(delta) || 0);
  if (amt === 0) return 0;
  const rm = game.runMetrics;
  let actualDelta = 0;
  let balanceAfter = 0;
  if (resourceType === 'gold') {
    const prev = Math.max(0, Number(game.gold || 0));
    game.gold = Math.max(0, prev + amt);
    actualDelta = game.gold - prev;
    balanceAfter = game.gold;
    if (rm) {
      if (actualDelta > 0) rm.goldEarned += actualDelta;
      else if (actualDelta < 0) rm.goldSpent += -actualDelta;
      rm._lastGold = game.gold;
    }
  } else if (resourceType === 'materials') {
    const prev = Math.max(0, Number(game.materials || 0));
    game.materials = Math.max(0, prev + amt);
    actualDelta = game.materials - prev;
    balanceAfter = game.materials;
    if (rm) {
      if (actualDelta > 0) rm.materialsEarned += actualDelta;
      else if (actualDelta < 0) rm.materialsSpent += -actualDelta;
      rm._lastMaterials = game.materials;
    }
  } else if (resourceType === 'transferTokens') {
    const prev = Math.max(0, Number(game.transferTokens || 0));
    game.transferTokens = Math.max(0, prev + amt);
    actualDelta = game.transferTokens - prev;
    balanceAfter = game.transferTokens;
    if (rm) {
      if (actualDelta > 0) rm.transferTokensEarned += actualDelta;
      else if (actualDelta < 0) rm.transferTokensSpent += -actualDelta;
      rm._lastTokens = game.transferTokens;
    }
  } else {
    return 0;
  }
  if (rm && actualDelta !== 0) {
    if (!Array.isArray(rm.ledger)) rm.ledger = [];
    const seq = rm._ledgerSeq || 1;
    rm._ledgerSeq = seq + 1;
    rm.ledger.push({
      seq,
      wave: game.wave || 1,
      type: resourceType,
      delta: actualDelta,
      reason: String(reason || 'unknown'),
      balanceAfter
    });
    if (rm.ledger.length > RESOURCE_LEDGER_MAX) {
      rm.ledger.splice(0, rm.ledger.length - RESOURCE_LEDGER_MAX);
    }
  }
  return actualDelta;
}

function changeGold(delta, reason = 'gold_change'){
  return recordResourceFlow('gold', delta, reason);
}
function changeMaterials(delta, reason = 'materials_change'){
  return recordResourceFlow('materials', delta, reason);
}
function changeTransferTokens(delta, reason = 'transfer_tokens_change'){
  return recordResourceFlow('transferTokens', delta, reason);
}
function getResourceLedger(limit = 0){
  const list = Array.isArray(game?.runMetrics?.ledger) ? game.runMetrics.ledger : [];
  const sliced = limit > 0 ? list.slice(-limit) : list.slice();
  return sliced.map(e => ({ ...e }));
}
function resetRunMetricsResourceBaseline(){
  if (!game?.runMetrics) return;
  const rm = game.runMetrics;
  const g = Math.max(0, Number(game.gold || 0));
  const m = Math.max(0, Number(game.materials || 0));
  const t = Math.max(0, Number(game.transferTokens || 0));
  rm.goldEarned = g;
  rm.goldSpent = 0;
  rm.materialsEarned = m;
  rm.materialsSpent = 0;
  rm.transferTokensEarned = t;
  rm.transferTokensSpent = 0;
  rm._lastGold = g;
  rm._lastMaterials = m;
  rm._lastTokens = t;
  rm.ledger = [];
  rm._ledgerSeq = 1;
}

function syncRunResourceAccounting(){
  // BUG-06: Accounting is now driven strictly by changeGold/changeMaterials/changeTransferTokens ledger.
  // Keep this helper only to sync baseline snapshots without ever overriding/canceling ledger totals.
  if (!game?.runMetrics) return;
  const rm = game.runMetrics;
  rm._lastGold = Math.max(0, Number(game.gold || 0));
  rm._lastMaterials = Math.max(0, Number(game.materials || 0));
  rm._lastTokens = Math.max(0, Number(game.transferTokens || 0));
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

function recordW20Proc(kind = 'base'){
  if (!game) return;
  if (kind === 'base') {
    if (game.stats) game.stats.w20BaseProcs = (game.stats.w20BaseProcs || 0) + 1;
    if (game.hero?.combatStateStats) game.hero.combatStateStats.w20BaseProcs = (game.hero.combatStateStats.w20BaseProcs || 0) + 1;
  } else {
    if (game.stats) game.stats.w20EnhancementProcs = (game.stats.w20EnhancementProcs || 0) + 1;
    if (game.hero?.combatStateStats) game.hero.combatStateStats.w20EnhancementProcs = (game.hero.combatStateStats.w20EnhancementProcs || 0) + 1;
  }
}

function hasDestinyEnhancement(key){ return queryHasDestinyEnhancement(game, key); }
function getOwnedDestinyEnhancements(){ return queryGetOwnedDestinyEnhancements(game); }

function recordDestinyProc(key = null){
  if (!game) return;
  if (game.stats) game.stats.destinyEnhancementProcs = (game.stats.destinyEnhancementProcs || 0) + 1;
  if (game.hero?.combatStateStats) {
    game.hero.combatStateStats.destinyEnhancementProcs = (game.hero.combatStateStats.destinyEnhancementProcs || 0) + 1;
  }
}

function isIsolatedHighValueTarget(e, radius = 3.2){
  if (!e || !game || !(e.boss || e.elite)) return false;
  for (const o of game.enemies) {
    if (o.id !== e.id && o.hp > 0 && dist(o, e) <= radius) return false;
  }
  return true;
}

function triggerW20ElementalEcho(){
  if (!game?.hero || !hasW20Enhancement('w20_shared_elemental_echo')) return 0;
  const h = game.hero;
  const hs = getHeroStats();
  const rad = 3.6;
  recordW20Proc('enhancement');
  addRing(h.x, h.y, '#ffe688', rad);
  addFloat(h.x, h.y - 0.8, '✨ 灵韵回响波!', '#ffe896', true);
  AudioKit.play('holy', 1.15);
  let hit = 0;
  for (const o of game.enemies) {
    if (o.hp > 0 && dist(o, h) <= rad + o.r) {
      hit++;
      applyFireMark(o, 1, 'w20_shared_elemental_echo', 4.5);
      applyFrostSlow(o, 0.50, 3.0, 'w20_shared_elemental_echo');
      dealDamage(o, Math.round(44 * hs.skillDmgMult), {
        fromHero: false, skillKey: 'perk', col: '#ffe688', noFireDetonate: true, noFrostShieldProc: true
      });
    }
  }
  gainFrostShield(18, { duration: 4.5, source: 'w20_shared_elemental_echo', noFullShieldPulse: true });
  return hit;
}

function applyFireMark(e, arg2 = 1, arg3 = 'w10', arg4 = 4.5){
  if (!e || e.hp <= 0) return false;
  const isObj = arg2 && typeof arg2 === 'object';
  const stacks = isObj ? (arg2.stacks ?? 1) : Number(arg2 || 1);
  const source = isObj ? (arg2.source ?? 'w10') : (arg3 || 'w10');
  const mainFlameBonus = getActiveMetaMain()?.id === 'main_flame' ? Number(getActiveMetaMain()?.effects?.fireMarkDurationBonus || 0.8) : 0;
  const duration = (isObj ? (arg2.duration ?? 4.5) : Number(arg4 || 4.5)) + mainFlameBonus;
  e.fireMarkT = Math.max(e.fireMarkT || 0, duration);
  e.fireMarkStacks = Math.min(3, (e.fireMarkStacks || 0) + Math.max(1, stacks));
  e.fireMarkSource = source;
  if (game?.stats) game.stats.fireMarksApplied = (game.stats.fireMarksApplied || 0) + 1;
  if (game?.hero?.combatStateStats) {
    game.hero.combatStateStats.fireMarksApplied++;
  }
  if (e.kind === 'boss6' && e.signatureLockActive && game?.w30Battle?.signatureStatusHitsDuringLock) {
    game.w30Battle.signatureStatusHitsDuringLock.fireMarks++;
  }
  return true;
}

function triggerFireDetonation(e, arg2 = 1.2, arg3 = 1.85, arg4 = 'firewave'){
  if (!e || !game) return 0;
  if ((e.fireDetonateCd || 0) > 0) return 0;
  const isObj = arg3 && typeof arg3 === 'object';
  const hs = getHeroStats();
  const affixDetBonus = 1 + (hs.gm?.fireDetonateBonus || 0);
  const rawBaseDmg = (Number(arg2) > 5)
    ? Number(arg2)
    : Math.round((32 + (game.hero?.skills?.firewave || 1) * 14) * hs.skillDmgMult * Number(arg2 || 1.2));
  const baseDmg = Math.round(rawBaseDmg * affixDetBonus);
  const radius = (isObj ? (arg3.radius ?? 1.85) : Number(arg3 || 1.85)) + Math.min(0.6, (hs.gm?.splashBonus || 0) * 0.35);
  const consumeMark = isObj ? !!arg3.consumeMark : false;
  const skillKey = isObj ? (arg3.skillKey || 'firewave') : (arg4 || 'firewave');
  const skipTrioChain = isObj ? !!arg3.skipTrioChain : false;

  const hasFireTrio = !skipTrioChain && getActiveGearAffixSynergies().hasFireTrio;
  const w20FireBase = hasW20Direction('fire_chain_surge');
  const w20Supernova = hasW20Enhancement('w20_fire_supernova_chain');
  const w20IsoExec = hasW20Enhancement('w20_fire_isolated_exec');
  const w20Vortex = hasW20Enhancement('w20_fire_mark_vortex');
  const w20EmberBarrage = hasW20Enhancement('w20_fire_ember_barrage');
  const w20BossBreaker = hasW20Enhancement('w20_shared_boss_breaker');
  const allowChainTransfer = !counters.inFireChainTransfer && (hasFireTrio || w20FireBase);

  e.fireDetonateCd = 0.22;
  const stacks = Math.max(1, e.fireMarkStacks || 1);
  const stackMult = 1 + Math.max(0, stacks - 1) * 0.25;
  let destinyDetBoost = 1;
  if (hasDestinyEnhancement('destiny_ember_echo') && game.hero?.destinyEmberNextBoost) {
    destinyDetBoost = 1.18;
    game.hero.destinyEmberNextBoost = false;
    recordDestinyProc('destiny_ember_echo');
  }
  const detDmg = Math.max(10, Math.round(baseDmg * stackMult * destinyDetBoost));
  if (consumeMark) {
    e.fireMarkStacks = Math.max(0, (e.fireMarkStacks || 1) - 1);
    if (e.fireMarkStacks <= 0) e.fireMarkT = 0;
  } else {
    e.fireMarkStacks = 1;
    e.fireMarkT = Math.max(e.fireMarkT || 0, 2.5);
  }
  if (game.stats) game.stats.fireDetonations = (game.stats.fireDetonations || 0) + 1;
  if (game.hero?.combatStateStats) {
    game.hero.combatStateStats.fireDetonations++;
    game.hero.combatStateStats.w10BranchProcs++;
  }
  if (e.kind === 'boss6' && e.signatureLockActive && game?.w30Battle?.signatureStatusHitsDuringLock) {
    game.w30Battle.signatureStatusHitsDuringLock.fireDetonations++;
  }

  // Stage 3 W20 Base Direction [fire_chain_surge]: Pull nearby non-boss enemies inward & splash fire mark before blast!
  if (w20FireBase && !counters.inFireChainTransfer) {
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    const pullRad = be.firePullRadius || 3.4;
    const pullStr = be.firePullStrength || 0.75;
    let pulledAny = false;
    for (const o of game.enemies) {
      if (o.id === e.id || o.hp <= 0) continue;
      const d = dist(o, e);
      if (d <= pullRad && d > 0.35) {
        if (!o.boss && !isEnemyUnstoppable(o)) {
          const step = Math.min(pullStr, d - 0.3);
          o.x = clamp(o.x + (e.x - o.x) / d * step, 0.8, W - 0.8);
          o.y = clamp(o.y + (e.y - o.y) / d * step, 0.8, H - 0.8);
          pulledAny = true;
        }
        if ((o.fireMarkT || 0) <= 0) {
          applyFireMark(o, 1, 'w20_fire_pull', 4.5);
        }
      }
    }
    recordW20Proc('base');
    if (pulledAny && game.stats) {
      game.stats.w20FirePulls = (game.stats.w20FirePulls || 0) + 1;
    }
  }

  addRing(e.x, e.y, allowChainTransfer ? '#ff4724' : '#ff5e2b', radius);
  addFloat(e.x, e.y - 0.55, w20FireBase ? '🔥聚焰连爆!' : (hasFireTrio ? '🔥连环引爆!' : '🔥火标引爆!'), '#ff9852', true);
  AudioKit.play('fire', 1.15);

  let totalDealt = 0;
  for (const o of game.enemies) {
    if (o.hp > 0 && dist(o, e) <= radius + o.r) {
      totalDealt += dealDamage(o, detDmg, {
        fromHero: false, skillKey, isFireExp: true,
        noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
        col: '#ff8a47', burn: 16
      });
    }
  }

  // Stage 2 Fire Trio + Stage 3 W20 [fire_chain_surge] chain transfer & isolated Boss/Elite focused detonation
  if (allowChainTransfer) {
    counters.inFireChainTransfer = true;
    try {
      const sc = BALANCE.equipment?.synergyCombat || {};
      const be = BALANCE.w20Breakthrough?.baseEffects || {};
      const trioChains = hasFireTrio ? Math.max(1, sc.fireTrioMaxChains || 2) : 0;
      const w20BaseChains = w20FireBase ? (be.fireBaseExtraChains || 1) : 0;
      const w20EnhChains = w20Supernova ? 2 : 0;
      const maxChains = Math.max(1, trioChains + w20BaseChains + w20EnhChains);
      const chainRange = (sc.fireTrioChainRange || 3.2) + (w20Supernova ? 0.9 : 0);
      const chainDecay = sc.fireTrioChainDecay || 0.78;
      const focusMults = Array.isArray(sc.fireTrioFocusMults) ? sc.fireTrioFocusMults : [0.55, 0.35];
      let maxFocusRatio = hasFireTrio ? (sc.fireTrioFocusMaxTotalRatio || 0.90) : (be.fireBaseFocusRatio || 0.42);
      if (hasFireTrio && w20FireBase) maxFocusRatio = Math.max(maxFocusRatio, be.fireTrioBonusFocusCap || 1.15);
      if (w20IsoExec) maxFocusRatio = Math.max(maxFocusRatio, 1.45);

      const visited = new Set([e.id]);
      let curSource = e;
      let transferred = 0;

      for (let step = 0; step < maxChains; step++) {
        let nextTgt = null;
        let bestD = chainRange;
        for (const cand of game.enemies) {
          if (cand.hp <= 0 || visited.has(cand.id) || (cand.fireMarkT || 0) <= 0) continue;
          const d = dist(curSource, cand);
          if (d <= bestD) { bestD = d; nextTgt = cand; }
        }
        if (!nextTgt) break;
        visited.add(nextTgt.id);
        transferred++;
        const hopDmg = Math.max(8, Math.round(detDmg * Math.pow(chainDecay, step + 1)));
        const hopRad = Math.max(1.35, radius * 0.85);
        nextTgt.fireDetonateCd = Math.max(nextTgt.fireDetonateCd || 0, 0.25);
        game.bolts.push({
          pts: [{ x: curSource.x, y: curSource.y }, { x: nextTgt.x, y: nextTgt.y }],
          t: 0.26, max: 0.26, col: '#ff6d38', comboThunderFire: false
        });
        addRing(nextTgt.x, nextTgt.y, '#ff6a32', hopRad);
        addFloat(nextTgt.x, nextTgt.y - 0.5, `🔥传递引爆#${transferred}`, '#ffb35c', true);
        if (game.stats) {
          game.stats.fireDetonations = (game.stats.fireDetonations || 0) + 1;
          game.stats.fireChainTransfers = (game.stats.fireChainTransfers || 0) + 1;
        }
        for (const o of game.enemies) {
          if (o.hp > 0 && dist(o, nextTgt) <= hopRad + o.r) {
            totalDealt += dealDamage(o, hopDmg, {
              fromHero: false, skillKey, isFireExp: true,
              noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
              col: '#ff964d', burn: 14
            });
          }
        }
        if (w20Supernova) {
          recordW20Proc('enhancement');
          game.zones.push({
            kind: 'lava', w10Branch: 'w20_supernova', w20Source: 'w20_fire_supernova_chain',
            x: nextTgt.x, y: nextTgt.y, r: 1.55, t: 2.6, max: 2.6, tick: 0.45,
            dps: Math.max(18, Math.round(hopDmg * 0.35))
          });
        }
        curSource = nextTgt;
      }

      // Isolated Elite/Boss fallback: convert remaining chain chances into capped decaying focused detonation
      const remChains = maxChains - transferred;
      if (remChains > 0 && e.hp > 0) {
        let ratioSum = 0;
        for (let k = 0; k < remChains; k++) {
          ratioSum += focusMults[k] ?? 0.32;
        }
        if (w20IsoExec) ratioSum += 0.55;
        const cappedRatio = Math.min(maxFocusRatio, ratioSum);
        const focusDmg = Math.max(8, Math.round(detDmg * cappedRatio));
        addRing(e.x, e.y, '#ffe066', Math.max(1.1, radius * 0.65));
        addFloat(e.x, e.y - 0.85, w20IsoExec ? `💥孤星焚核×${remChains}!` : `💥聚焦引爆×${remChains}!`, '#ffe066', true);
        if (game.stats) {
          game.stats.fireFocusedDetonations = (game.stats.fireFocusedDetonations || 0) + 1;
        }
        if (w20IsoExec) {
          recordW20Proc('enhancement');
          e.vulnT = Math.max(e.vulnT || 0, 3.5);
        }
        totalDealt += dealDamage(e, focusDmg, {
          fromHero: false, skillKey, isFireExp: true,
          noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
          col: '#ffd85c', burn: 18
        });
        if (w20IsoExec && e.hp > 0) {
          totalDealt += dealDamage(e, Math.max(10, Math.round(focusDmg * 0.48)), {
            fromHero: false, skillKey, isFireExp: true,
            noFireDetonate: true, critChance: hs.crit, critDmg: hs.critDmg,
            col: '#fff08c', burn: 20
          });
        }
      }
    } finally {
      counters.inFireChainTransfer = false;
    }
  }

  // W20 Fire/Shared Enhancements post-detonation behaviors
  if (!counters.inFireChainTransfer) {
    if (w20Vortex) {
      recordW20Proc('enhancement');
      game.zones.push({
        kind: 'fireVortex', w20Source: 'w20_fire_mark_vortex',
        x: e.x, y: e.y, r: 2.8, t: 2.2, max: 2.2, tick: 0.45,
        dps: Math.max(16, Math.round(detDmg * 0.28))
      });
    }
    if (w20EmberBarrage) {
      recordW20Proc('enhancement');
      for (let i = 0; i < 4; i++) {
        const ang = (Math.PI * 2 * i) / 4 + game.waveClock;
        pushProjectile({
          kind: 'arrow', w20Source: 'w20_fire_ember_barrage', x: e.x, y: e.y,
          vx: Math.cos(ang) * 12.5, vy: Math.sin(ang) * 12.5,
          life: 0.45, r: 0.34, pierce: 2, hitSet: new Set([e.id]),
          dmg: Math.max(12, Math.round(detDmg * 0.42)), splash: 0,
          opts: { fromHero: false, skillKey, isFireExp: true, noFireDetonate: true, col: '#ff9f4d', burn: 14, applyFireMarkOnHit: true }
        });
      }
    }
    if (w20BossBreaker && e.hp > 0 && isIsolatedHighValueTarget(e, 3.2)) {
      recordW20Proc('enhancement');
      e.vulnT = Math.max(e.vulnT || 0, 3.5);
      addFloat(e.x, e.y - 1.0, '⚔️孤影破壁!', '#ffe680', true);
      totalDealt += dealDamage(e, Math.max(16, Math.round(detDmg * 0.45)), {
        fromHero: false, skillKey: 'perk', noFireDetonate: true, col: '#ffe680'
      });
    }
    if (hasW20Enhancement('w20_brk_tempest_step') && game.hero) {
      recordW20Proc('enhancement');
      game.hero.dashCd = Math.max(0, (game.hero.dashCd || 0) - 0.35);
    }
    if (hasW20Enhancement('w20_shared_elemental_echo') && game.hero) {
      game.hero.w20EchoFireCnt = (game.hero.w20EchoFireCnt || 0) + 1;
      if (game.hero.w20EchoFireCnt >= 3) {
        game.hero.w20EchoFireCnt = 0;
        triggerW20ElementalEcho();
      }
    }
    if (hasDestinyEnhancement('destiny_ember_echo') && game.hero && (game.hero.destinyEmberCd || 0) <= 0) {
      game.hero.destinyEmberCd = 0.6;
      game.hero.destinyEmberNextBoost = true;
      recordDestinyProc('destiny_ember_echo');
      for (const o of game.enemies) {
        if (o.hp > 0 && dist(o, e) <= 2.8 + o.r) {
          applyFireMark(o, 1, 'destiny_ember_echo', 4.5);
        }
      }
    }
  }
  return totalDealt;
}

function applyFrostSlow(e, arg2 = 0.50, arg3 = 3.0, arg4 = 'w10'){
  if (!e || e.hp <= 0) return false;
  if (isEnemyUnstoppable(e)) return false;
  const isObj = arg2 && typeof arg2 === 'object';
  const slow = isObj ? (arg2.slow ?? 0.50) : Number(arg2 || 0.50);
  const mainFrostBonus = getActiveMetaMain()?.id === 'main_frost' ? Number(getActiveMetaMain()?.effects?.frostSlowDurationBonus || 0.6) : 0;
  const duration = (isObj ? (arg2.duration ?? 3.0) : Number(arg3 || 3.0)) + mainFrostBonus;
  const source = isObj ? (arg2.source ?? 'w10') : (arg4 || 'w10');
  e.slow = Math.max(e.slow || 0, slow);
  e.slowT = Math.max(e.slowT || 0, duration);
  e.frostBrandSource = source;
  if (game?.stats) game.stats.frostSlowsApplied = (game.stats.frostSlowsApplied || 0) + 1;
  if (game?.hero?.combatStateStats) {
    game.hero.combatStateStats.frostSlowsApplied++;
  }
  if (e.kind === 'boss6' && e.signatureLockActive && game?.w30Battle?.signatureStatusHitsDuringLock) {
    game.w30Battle.signatureStatusHitsDuringLock.frostSlows++;
  }
  return true;
}

function getHeroMaxFrostShield(baseCap = 90){
  const gm = aggregateGear(game?.hero?.gear || []);
  const syn = getActiveGearAffixSynergies();
  const sc = BALANCE.equipment?.synergyCombat || {};
  const be = BALANCE.w20Breakthrough?.baseEffects || {};
  const synBase = syn.hasFrostTrio ? (sc.frostTrioShieldCap || 115) : syn.hasFrostDuo ? (sc.frostDuoShieldCap || 95) : baseCap;
  const w20Bonus = hasW20Direction('frost_bastion_counter') ? (be.frostBaseShieldCapBonus || 35) : 0;
  const destinyBonus = hasDestinyEnhancement('destiny_glacial_aegis') ? 40 : 0;
  return Math.max(baseCap, synBase) + (gm.frostShieldCapBonus || 0) + w20Bonus + destinyBonus;
}

function triggerFrostPulse(radius = 2.8, rawDmg = 36, freezeDur = 0.9, source = 'w10', extraOpts = {}){
  if (!game?.hero) return 0;
  const h = game.hero;
  const syn = getActiveGearAffixSynergies();
  const be = BALANCE.w20Breakthrough?.baseEffects || {};
  const w20FrostBase = hasW20Direction('frost_bastion_counter');
  const w20DashRing = hasW20Enhancement('w20_frost_dash_ring');
  const w20AegisThorns = hasW20Enhancement('w20_frost_aegis_thorns');
  const w20ShatterEcho = hasW20Enhancement('w20_frost_shatter_echo');
  const w20Overflow = hasW20Enhancement('w20_frost_overflow_nova');

  const isActiveTrigger = source === 'dash_shield' || source === 'full_shield_refresh';
  if (isActiveTrigger) {
    if ((h.frostActivePulseCd || 0) > 0) return 0;
    let cd = BALANCE.equipment?.synergyCombat?.frostTrioActivePulseCd || 1.5;
    if (w20FrostBase && syn.hasFrostTrio) cd = Math.max(0.75, cd - (be.frostBaseTrioActiveCdReduction || 0.35));
    if (w20DashRing && source === 'dash_shield') cd = Math.min(cd, 0.75);
    h.frostActivePulseCd = cd;
  } else {
    if ((h.frostPulseCd || 0) > 0) return 0;
    h.frostPulseCd = 0.55;
  }

  let effRadius = radius;
  let effDmg = rawDmg + (extraOpts.overflowBonusDmg || 0);
  let effFreeze = freezeDur;
  if (w20FrostBase) {
    recordW20Proc('base');
    if (game.stats) game.stats.w20FrostCounterProcs = (game.stats.w20FrostCounterProcs || 0) + 1;
    if (syn.hasFrostTrio) effRadius *= 1.22;
  }
  if (w20AegisThorns && source === 'shield_hit') {
    recordW20Proc('enhancement');
    effRadius *= 1.35;
    effFreeze += 0.5;
  }

  if (h.combatStateStats) {
    h.combatStateStats.frostPulsesTriggered++;
    h.combatStateStats.w10BranchProcs++;
  }
  if (game?.w30Battle?.signatureLockActive && game.w30Battle.signatureStatusHitsDuringLock) {
    game.w30Battle.signatureStatusHitsDuringLock.frostPulses++;
  }
  if (game.stats) {
    if (source === 'shield_hit') game.stats.frostHitPulses = (game.stats.frostHitPulses || 0) + 1;
    else if (source === 'dash_shield') game.stats.frostDashPulses = (game.stats.frostDashPulses || 0) + 1;
    else if (source === 'full_shield_refresh') game.stats.frostFullShieldPulses = (game.stats.frostFullShieldPulses || 0) + 1;
  }
  const floatText = source === 'dash_shield' ? (w20DashRing ? '❄️踏霜主动环!' : '❄️冲刺冰环!')
    : source === 'full_shield_refresh' ? (w20Overflow ? '💠满盾超载震!' : '❄️满盾冰环!')
    : (w20AegisThorns ? '🛡️寒甲反噬!' : '❄️冰环反制!');
  addRing(h.x, h.y, isActiveTrigger ? '#aef8ff' : '#8ef4ff', effRadius);
  addFloat(h.x, h.y - 0.65, floatText, '#a4f8ff', true);
  AudioKit.play('frost', isActiveTrigger ? 1.25 : 1.15);
  const hs = getHeroStats();
  let hitCnt = 0;
  for (const o of game.enemies) {
    if (o.hp > 0 && dist(o, h) <= effRadius + o.r) {
      hitCnt++;
      const wasSlowed = (o.slowT || 0) > 0 || (o.freezeT || 0) > 0;
      applyFrostSlow(o, w20ShatterEcho ? 0.65 : 0.55, 3.0, 'frost_pulse');
      if (!o.boss && !isEnemyUnstoppable(o)) o.freezeT = Math.max(o.freezeT || 0, effFreeze);
      dealDamage(o, Math.round(effDmg * hs.skillDmgMult), {
        fromHero: false, skillKey: 'nova', col: '#9cf6ff', noFrostShieldProc: true
      });
      if (w20ShatterEcho && wasSlowed && o.hp > 0) {
        recordW20Proc('enhancement');
        addRing(o.x, o.y, '#c4f8ff', 1.6);
        for (const nb of game.enemies) {
          if (nb.hp > 0 && dist(nb, o) <= 1.6 + nb.r) {
            applyFrostSlow(nb, 0.65, 3.2, 'w20_frost_shatter_echo');
            dealDamage(nb, Math.max(12, Math.round(effDmg * 0.55 * hs.skillDmgMult)), {
              fromHero: false, skillKey: 'nova', col: '#c4f8ff', noFrostShieldProc: true
            });
          }
        }
      }
      if (hasW20Enhancement('w20_shared_boss_breaker') && o.hp > 0 && isIsolatedHighValueTarget(o, 3.2)) {
        recordW20Proc('enhancement');
        o.vulnT = Math.max(o.vulnT || 0, 3.5);
        dealDamage(o, Math.max(16, Math.round(effDmg * 0.55 * hs.skillDmgMult)), {
          fromHero: false, skillKey: 'perk', col: '#ffe680', noFrostShieldProc: true
        });
      }
    }
  }
  if (w20FrostBase && syn.hasFrostTrio && hitCnt > 0) {
    gainFrostShield(be.frostBaseTrioPulseShieldRefund || 10, { duration: 4.5, noFullShieldPulse: true, source: 'w20_frost_refund' });
  }
  if (w20AegisThorns && source === 'shield_hit') {
    gainFrostShield(14, { duration: 4.5, noFullShieldPulse: true, source: 'w20_frost_aegis_thorns' });
    const tgt = game.enemies.find(o => o.hp > 0);
    const baseAng = tgt ? Math.atan2(tgt.y - h.y, tgt.x - h.x) : 0;
    for (let i = -1; i <= 1; i++) {
      const a = baseAng + i * 0.24;
      pushProjectile({
        kind: 'arrow', w20Source: 'w20_frost_aegis_thorns', x: h.x, y: h.y,
        vx: Math.cos(a) * 14.5, vy: Math.sin(a) * 14.5,
        life: 0.45, r: 0.34, pierce: 3, hitSet: new Set(),
        dmg: Math.round(effDmg * 0.85 * hs.skillDmgMult), splash: 0,
        opts: { fromHero: false, skillKey: 'nova', col: '#aef8ff', slow: 0.55, slowDur: 2.8, noFrostShieldProc: true }
      });
    }
  }
  if (w20Overflow && source === 'full_shield_refresh') {
    recordW20Proc('enhancement');
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      pushProjectile({
        kind: 'arrow', w20Source: 'w20_frost_overflow_nova', x: h.x, y: h.y,
        vx: Math.cos(a) * 13.8, vy: Math.sin(a) * 13.8,
        life: 0.42, r: 0.34, pierce: 3, hitSet: new Set(),
        dmg: Math.round(effDmg * 0.72 * hs.skillDmgMult), splash: 0,
        opts: { fromHero: false, skillKey: 'nova', col: '#b8fbff', slow: 0.55, slowDur: 2.8, noFrostShieldProc: true }
      });
    }
  }
  if (hasW20Enhancement('w20_brk_tempest_step')) {
    recordW20Proc('enhancement');
    h.dashCd = Math.max(0, (h.dashCd || 0) - 0.35);
  }
  if (hasW20Enhancement('w20_shared_elemental_echo')) {
    h.w20EchoFrostCnt = (h.w20EchoFrostCnt || 0) + 1;
    if (h.w20EchoFrostCnt >= 2) {
      h.w20EchoFrostCnt = 0;
      triggerW20ElementalEcho();
    }
  }
  if (hasDestinyEnhancement('destiny_glacial_aegis')) {
    recordDestinyProc('destiny_glacial_aegis');
    h.destinyFrostMoveT = Math.max(h.destinyFrostMoveT || 0, 2.5);
    gainFrostShield(14, { duration: 5.0, noFullShieldPulse: true, source: 'destiny_glacial_aegis' });
  }
  return hitCnt;
}

function gainFrostShield(amount, arg2 = 5.0, arg3 = 90){
  if (!game?.hero || amount <= 0) return 0;
  const h = game.hero;
  const isObj = arg2 && typeof arg2 === 'object';
  const mainFrostShieldBonus = getActiveMetaMain()?.id === 'main_frost' ? Number(getActiveMetaMain()?.effects?.frostShieldDurationBonus || 0.8) : 0;
  const duration = (isObj ? (arg2.duration ?? 5.0) : Number(arg2 || 5.0)) + mainFrostShieldBonus;
  const reqMax = isObj ? (arg2.maxShield ?? 90) : Number(arg3 || 90);
  const noFullShieldPulse = isObj ? !!arg2.noFullShieldPulse : false;
  const maxShield = Math.max(getHeroMaxFrostShield(90), reqMax);
  const gain = Math.round(amount);
  const prevShield = h.shield || 0;
  const overflow = Math.max(0, prevShield + gain - maxShield);
  const wasFullOrOverflow = prevShield >= maxShield * 0.92 || (prevShield + gain >= maxShield);
  h.shield = Math.min(maxShield, prevShield + gain);
  const actualGain = Math.max(0, Math.round(h.shield - prevShield));
  h.shieldTimer = Math.max(h.shieldTimer || 0, duration);
  h.frostShieldActive = true;
  if (actualGain > 0) {
    if (game.stats) {
      game.stats.frostShieldGained = (game.stats.frostShieldGained || 0) + actualGain;
      game.stats.shieldGained = (game.stats.shieldGained || 0) + actualGain;
    }
    if (h.combatStateStats) {
      h.combatStateStats.frostShieldGained += actualGain;
    }
    if (game?.w30Battle?.signatureLockActive && game.w30Battle.signatureStatusHitsDuringLock) {
      game.w30Battle.signatureStatusHitsDuringLock.frostShieldGained += actualGain;
    }
  }
  if (h.combatStateStats) {
    h.combatStateStats.w10BranchProcs++;
  }
  // Stage 3 W20 Enhancement [w20_frost_pillar_ward]: every 40 cumulative frost shield drops a 3.2s frost ward zone
  if (hasW20Enhancement('w20_frost_pillar_ward') && arg2?.source !== 'w20_frost_pillar_ward') {
    h.w20ShieldPillarAccum = (h.w20ShieldPillarAccum || 0) + gain;
    if (h.w20ShieldPillarAccum >= 40) {
      h.w20ShieldPillarAccum -= 40;
      recordW20Proc('enhancement');
      game.zones.push({
        kind: 'frostTrail', w20Source: 'w20_frost_pillar_ward', x: h.x, y: h.y, r: 2.35,
        t: 3.2, max: 3.2, tick: 0.6, dps: 22
      });
    }
  }
  // Stage 2 Frost Trio OR Stage 3 W20 [w20_frost_overflow_nova]: full-shield refresh triggers active Frost Pulse!
  const allowFullPulse = !noFullShieldPulse && (getActiveGearAffixSynergies().hasFrostTrio || hasW20Enhancement('w20_frost_overflow_nova'));
  if (allowFullPulse && wasFullOrOverflow && (h.frostActivePulseCd || 0) <= 0) {
    const sc = BALANCE.equipment?.synergyCombat || {};
    const overflowBonusDmg = hasW20Enhancement('w20_frost_overflow_nova') ? Math.round(overflow * 1.4) : 0;
    triggerFrostPulse(sc.frostTrioActivePulseRadius || 3.25, sc.frostTrioActivePulseDmg || 46, 0.95, 'full_shield_refresh', { overflowBonusDmg });
  }
  return actualGain;
}

/* ==================== SYNERGY, COMBO & STAT COMPUTATION ==================== */
function getSynergyCounts(){
  const c = { wind:0, fire:0, frost:0, thunder:0, holy:0 };
  if (game?.seal) {
    c[game.seal.elem] += game.seal.star >= 5 ? 4 : game.seal.star >= 3 ? 2 : 1;
  }
  if (game?.subSeals?.length) {
    for (const s of game.subSeals) {
      c[s.elem] += s.star >= 3 ? 2 : 1;
    }
  }
  if (game?.hero?.gear?.length) {
    for (const gk of game.hero.gear) {
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
  return game?.subSeals?.find(s => s.elem === elem) || null;
}
function getGearSetCounts(gearList = game?.hero?.gear || []){
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
  const h = game.hero;
  const node = getActiveUnlockNode();
  for (const c of COMBO_LIST) {
    if (h.combos[c.key]) continue;
    const sumLv = c.req.reduce((s, sk) => s + (h.skills[sk] || 0), 0);
    if (node.comboTier >= c.realm && c.req.every(sk => (h.skills[sk] || 0) >= 1) && sumLv >= 3) {
      h.combos[c.key] = true;
      if (announce) {
        AudioKit.play('level', 1.15);
        game.shake = Math.max(game.shake, 7);
        addRing(h.x, h.y, '#ffe878', 3.4);
        showBanner(`✨ 组合技觉醒 · 【${c.name}】！`, c.desc, 'good');
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
    dmgReduce:0, bonusGoldChance:0
  };
  const dfBoost = perkLv('dao_fortune') >= 2 ? 1.25 : 1;
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
        else m[key] += scaled;
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
  m.extraShot = Math.round(m.extraShot);
  m.bonusGold = Math.round(m.bonusGold);
  m.flatHp = Math.round(m.flatHp);
  m.frostShieldCapBonus = Math.round(m.frostShieldCapBonus);
  m.burnKillHeal = Math.round(m.burnKillHeal);
  return m;
}

function syncHeroMaxHp(opts = {}){
  if (!game?.hero) return;
  const h = game.hero;
  const gm = aggregateGear(h.gear);
  const oldMax = h.maxHp;
  const destinyFlatHp = hasDestinyEnhancement('destiny_aegis_bulwark') ? 90 : 0;
  const rawMax = Math.round((h.baseMaxHp + gm.flatHp + destinyFlatHp) * Math.max(0.4, 1 + gm.hpPct));
  h.maxHp = Math.max(60, rawMax);
  if (opts && opts.healDelta && h.maxHp > oldMax) {
    h.hp = Math.min(h.maxHp, h.hp + (h.maxHp - oldMax));
  } else {
    h.hp = Math.min(h.hp, h.maxHp);
  }
}

function getHeroStats(){
  const h = game.hero;
  const r = getActiveUnlockNode();
  const gm = aggregateGear(h.gear);
  const syn = getSynergyCounts();
  const berkLv = h.skills.berserk || 0;
  const holyAura = (game.seal && game.seal.kind === 'holy') ? (ARTIFACTS.holy.stars[game.seal.star - 1].auraAspd || 0) : 0;
  const holySub = getSubSeal('holy');
  const holySubCrit = holySub ? SUB_SEAL_RESONANCE.holy.crit[holySub.star - 1] : 0;
  const hasShieldNow = (h.shield || 0) > 0;

  // Perk bonuses
  const bloodLv = perkLv('blood_oath');
  const lostPct = clamp((h.maxHp - h.hp) / Math.max(1, h.maxHp), 0, 1);
  const bloodSteps = Math.floor(lostPct * 10);
  const bloodDmg = bloodLv === 2 ? bloodSteps * 0.18 : bloodLv === 1 ? bloodSteps * 0.12 : 0;
  const bloodAspd = (bloodLv >= 2 && h.hp <= h.maxHp * 0.5) ? 0.35 : 0;
  const bloodLeech = bloodLv >= 1 ? bloodSteps * 2 : 0;

  const goldLv = perkLv('gold_power');
  const goldDmg = goldLv === 2 ? Math.min(0.63, Math.floor(game.gold / 50) * 0.09)
                : goldLv === 1 ? Math.min(0.42, Math.floor(game.gold / 50) * 0.06) : 0;

  const ocLv = perkLv('artifact_overclock');
  const sealDmgBonus = (ocLv >= 1 && game.seal) ? game.seal.star * 0.08 : 0;

  const windGaleLv = perkLv('wind_gale');
  const dashAspd = (windGaleLv >= 2 && h.dashBuffT > 0) ? 0.60 : 0;
  const swordSet = gearSetTier('sword');
  const greedSet = gearSetTier('greed');
  const greedCap = greedSet >= 3 ? 0.45 : 0.28;
  const greedAspd = greedSet >= 2 ? Math.min(greedCap, Math.floor(game.gold / 40) * 0.04) : 0;
  const greedMove = greedSet >= 2 ? Math.min(greedCap, Math.floor(game.gold / 40) * 0.03) : 0;
  const wfDualMove = hasDualRes('wind_frost') ? 0.15 : 0;
  const bloodKillDmg = (h.bloodKills || 0) * 0.03;
  const shieldAffixDmg = hasShieldNow ? (gm.shieldedDmgPct || 0) : 0;
  const shieldAffixMove = hasShieldNow ? (gm.shieldedMovePct || 0) : 0;
  const holyMasteryCritDmg = (game.seal?.kind === 'holy' && game.seal?.route === 'mastery') ? 0.20 : 0;

  // Stage 4 Destiny Exclusive Enhancement stat hooks
  const temperedGearCount = hasDestinyEnhancement('destiny_golden_temper')
    ? (h.gear || []).filter(g => (g?.enhanceLv || 0) >= 2).length
    : 0;
  const destinyTemperDmg = temperedGearCount * 0.07;
  const destinyTemperAspd = temperedGearCount * 0.05;
  const destinyCrownSkillMult = hasDestinyEnhancement('destiny_resonance_crown') ? 1.16 : 1.0;
  const destinyCrownCritDmg = hasDestinyEnhancement('destiny_resonance_crown') ? 0.25 : 0;
  const destinyDashCrit = (hasDestinyEnhancement('destiny_phantom_stride') && (h.destinyDashBuffT || 0) > 0) ? 0.20 : 0;
  const destinyFrostMove = (hasDestinyEnhancement('destiny_glacial_aegis') && (h.destinyFrostMoveT || 0) > 0) ? 0.12 : 0;

  const aspd = Math.max(0.5, 1 + gm.aspd + berkLv * 0.18 + holyAura + (syn.wind >= 2 ? 0.25 : 0) + (h.ultTimer > 0 ? 0.80 : 0) + bloodAspd + dashAspd + greedAspd + destinyTemperAspd);
  const dmgMult = 1 + gm.dmgPct + shieldAffixDmg + (h.lv - 1) * BALANCE.progression.heroDmgPerLevel + r.dmgBonus + bloodDmg + goldDmg + sealDmgBonus + bloodKillDmg + destinyTemperDmg;

  const ownedSkills = Object.values(h.skills).filter(v => v > 0).length;
  const mmLv = perkLv('mono_mastery');
  const mmActive = (mmLv === 1 && ownedSkills <= 2) || (mmLv >= 2 && ownedSkills <= 3);
  const skillDmgMult = dmgMult * (mmActive ? (mmLv >= 2 ? 1.55 : 1.30) : 1) * destinyCrownSkillMult;
  const rangeMult = Math.max(0.65, 1 + gm.rangePct);
  const skillRangeMult = rangeMult * (mmActive ? (mmLv >= 2 ? 1.15 : 1.08) : 1);
  const skillCdMult = r.cdMult * (mmActive && mmLv >= 2 ? 0.80 : 1);

  const csLv = perkLv('crit_surge');
  const swordSetCrit = swordSet >= 3 ? 0.20 : swordSet >= 2 ? 0.12 : 0;
  const rawCrit = BALANCE.progression.heroBaseCrit + gm.crit + berkLv * 0.08 + (syn.holy >= 2 ? 0.15 : 0) + holySubCrit + (h.ultTimer > 0 ? 0.35 : 0)
    + swordSetCrit + (csLv === 2 ? 0.25 : csLv === 1 ? 0.15 : 0)
    + (windGaleLv >= 1 && h.dashBuffT > 0 ? 1.0 : 0) + destinyDashCrit;
  const overflowCrit = Math.max(0, rawCrit - 1.0);
  const crit = Math.min(1.0, rawCrit);
  const critDmg = (syn.holy >= 4 ? 2.2 : BALANCE.progression.heroBaseCritMultiplier) + gm.critDmg + holyMasteryCritDmg + (hasDualRes('holy_omni') ? 0.25 : 0)
    + (csLv === 2 ? overflowCrit * 3 : csLv === 1 ? overflowCrit * 2 : 0)
    + (perkLv('sword_rain') >= 2 ? 0.60 : 0) + destinyCrownCritDmg;

  const moveSpd = (BALANCE.progression.heroBaseMove + berkLv * BALANCE.progression.heroMovePerBerserkLv)
    * (1 + gm.movePct + shieldAffixMove + greedMove + wfDualMove + destinyFrostMove + (windGaleLv === 2 ? 0.30 : windGaleLv === 1 ? 0.20 : 0) + (perkLv('ult_engine') >= 1 && h.ultTimer > 0 ? 0.30 : 0));
  const windMetaMagnet = getActiveMetaMain()?.id === 'main_wind' ? Number(getActiveMetaMain()?.effects?.magnetBonus || 0.8) : 0;
  const magnet = 2.9 + berkLv * 0.85 + gm.rangePct * 2.0 + windMetaMagnet;
  const lifesteal = gm.lifesteal + berkLv * 2 + bloodLeech;

  return { aspd, dmgMult, skillDmgMult, crit, critDmg, magnet, rangeMult, skillRangeMult, skillCdMult, moveSpd, lifesteal, mmActive, gm };
}

function getSealStats(a = game.seal){
  if (!a) return null;
  const spec = ARTIFACTS[a.kind];
  const base = spec.stars[clamp(a.star - 1, 0, spec.stars.length - 1)];
  const hs = getHeroStats();
  const gm = hs.gm;
  const syn = getSynergyCounts();
  const ocLv = perkLv('artifact_overclock');
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
  const essenceMult = 1 + (game.hero?.sealEssenceBonus || 0);
  const destinyCrownSealCd = hasDestinyEnhancement('destiny_resonance_crown') ? 0.86 : 1;
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

/* ==================== STAGE 2: SHOP PRICING, RECYCLE ANTI-ARBITRAGE & MATERIAL ENHANCE ==================== */
function getShopElemBuyCount(elem){
  if (!game) return 0;
  const sp = BALANCE.equipment?.shopPricing || {};
  const curStage = getSourceStageForWave(game.wave);
  if (sp.sameElemResetByStage && game.shopElemBuyStage !== curStage) {
    game.shopElemBuyCounts = { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 };
    game.shopElemBuyStage = curStage;
  }
  return game.shopElemBuyCounts?.[elem] || 0;
}

function calcShopGearPrice(rarity, elem, wave = game?.wave || 1){
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

function pickShopGearBaseKey(wave = game?.wave || 1, rndFn = game?.rnd || Math.random){
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

// Recycle value depends STRICTLY on inst.rarity and inst.sourceStage (NEVER slotsCount or current wave!)
// Anti-arbitrage guard: if bought from shop (paidGold > 0), sell gold is strictly < paidGold!
function getGearSellGold(inst){
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

function getGearEnhanceCost(inst){
  if (!inst || typeof inst !== 'object' || inst.itemType === 'seal') return null;
  const cfg = BALANCE.equipment?.materialEnhance || {};
  const maxLv = cfg.maxEnhanceLv || 6;
  const curLv = inst.enhanceLv || 0;
  if (curLv >= maxLv) return null;
  const table = Array.isArray(cfg.matCostByNextLv) ? cfg.matCostByNextLv : [2, 3, 5, 7, 10, 14];
  return table[curLv] ?? (2 + curLv * 2);
}

function getBagCapacity(){
  return Math.max(4, Number(BALANCE.progression?.bagCapacity || 12));
}

function hasBagSpace(need = 1){
  if (!game || !Array.isArray(game.bag)) return false;
  return (game.bag.length + Math.max(1, Number(need) || 1)) <= getBagCapacity();
}

function tryStoreGearInBag(inst){
  if (!hasBagSpace(1)) {
    return { ok: false, reason: 'bag_full', capacity: getBagCapacity() };
  }
  const normalized = isBagSeal(inst) ? inst : normalizeGearInstance(inst);
  game.bag.push(normalized);
  return { ok: true, storedIn: 'bag', item: normalized };
}

function isBagSeal(item){
  return !!(item && typeof item === 'object' && item.itemType === 'seal');
}

function getEndgameRefinementConfig(){
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

function getEnemyMaterialDrop(e, wave = game?.wave || 1){
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

function getWaveClearMaterialBonus(clearedWave){
  const cfg = getEndgameRefinementConfig();
  const bands = Array.isArray(cfg.waveClearMaterialsByBand) ? cfg.waveClearMaterialsByBand : [];
  for (const b of bands) {
    if (clearedWave >= b.from && clearedWave <= b.to) return Math.max(0, Number(b.materials || 0));
  }
  return 0;
}

/* ==================== STAGE 5: W29 FINAL PREP ATOMIC MUTEX LOCK & SHOP CONFIRM DRAFT ==================== */
function isFinalPrepActionLocked(){ return queryIsFinalPrepActionLocked(game); }

function openShopPurchaseConfirm(shopIdx){
  if (!game || game.phase !== 'prep') return { ok: false, reason: 'not_in_prep' };
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  const item = game.shop?.[shopIdx];
  if (!item || item.bought) return { ok: false, reason: 'invalid_shop_item' };
  const label = item.itemType === 'pill'
    ? (PILLS[item.pillKey]?.name || item.pillKey)
    : item.itemType === 'gear'
      ? (item.gear?.name || '构装')
      : `${ARTIFACTS[item.kind]?.name || item.kind} ${item.star || 1}★`;
  game.shopConfirmDraft = {
    shopIdx,
    itemUid: item.uid,
    itemType: item.itemType,
    cost: item.cost,
    label
  };
  game.activeModal = { type: 'shop_confirm', shopIdx, itemUid: item.uid };
  renderShopConfirmModal();
  return { ok: true, draft: { ...game.shopConfirmDraft } };
}

function cancelShopPurchaseConfirm(){
  if (game) {
    game.shopConfirmDraft = null;
    if (game.activeModal?.type === 'shop_confirm') closeModal();
  }
  return { ok: true, cancelled: true };
}

function confirmShopPurchase(){
  if (!game) return { ok: false, reason: 'no_game' };
  if (isFinalPrepActionLocked()) {
    game.shopConfirmDraft = null;
    return { ok: false, reason: 'final_prep_locked' };
  }
  const draft = game.shopConfirmDraft;
  if (!draft) return { ok: false, reason: 'no_shop_draft' };
  const item = game.shop?.[draft.shopIdx];
  if (!item || item.bought || item.uid !== draft.itemUid) {
    game.shopConfirmDraft = null;
    if (game.activeModal?.type === 'shop_confirm') closeModal();
    return { ok: false, reason: 'stale_shop_draft' };
  }
  game.shopConfirmDraft = null;
  if (game.activeModal?.type === 'shop_confirm') closeModal();
  const bought = buyShopItem(draft.shopIdx);
  if (bought && typeof bought === 'object' && bought.ok === false) {
    return { ok: false, reason: bought.reason || 'buy_failed', goldLeft: game.gold };
  }
  return { ok: !!bought, reason: bought ? null : 'buy_failed', goldLeft: game.gold };
}

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

/* ==================== SHOP (SEALS + STAGE 2 GEAR + V0.60 CLEAN PILLS) ==================== */
function rollShop(free = false){
  if (!free && isFinalPrepActionLocked()) return false;
  if (!free) {
    const canMetaFreeRefresh = hasMetaAux('aux_shop_first_refresh') && game.metaRunState && !game.metaRunState.freeRefreshUsedThisWave;
    if (canMetaFreeRefresh) {
      game.metaRunState.freeRefreshUsedThisWave = true;
      game.metaRunState.freeRefreshUses = (game.metaRunState.freeRefreshUses || 0) + 1;
      toast('🏷️ 辅助传承【商路先机】触发：本波首次商店刷新免费！');
    } else {
      const freeProc = perkLv('gold_power') >= 2 && game.rnd() < 0.25;
      if (!freeProc) {
        if (game.gold < game.rerollCost) { toast(`需要 ${game.rerollCost} 金币才能刷新商店！`, true); return false; }
        changeGold(-game.rerollCost, 'shop_reroll');
        game.rerollCost += BALANCE.economy.rerollIncrement;
        AudioKit.play('coin', 0.9);
      } else {
        toast('💰 点石成金精通触发：本次刷新免费！');
      }
    }
  }
  const tier = getShopTier();
  const isHuashen = getActiveUnlockNode().idx >= 4;
  const refCfg = getEndgameRefinementConfig();
  const isEndgameRef = (game.wave || 1) >= (refCfg.startWave || 21);
  game.shop = [];

  const pushSealOffer = () => {
    const kind = pickWeightedByMainLegacy(ARTIFACT_KEYS, k => ARTIFACTS[k]?.elem || null, game.rnd) || ARTIFACT_KEYS[0];
    const spec = ARTIFACTS[kind];
    let star = 1;
    const r = game.rnd();
    if (tier === 2 && r < BALANCE.economy.tier2Star2Chance) star = 2;
    else if (tier === 3) {
      const t3Chance = isHuashen ? BALANCE.economy.huashenStar3Chance : BALANCE.economy.tier3Star3Chance;
      if (r < t3Chance) star = 3;
      else if (r < t3Chance + BALANCE.economy.tier3Star2Chance) star = 2;
    }
    const mult = star === 3 ? BALANCE.economy.star3PriceFactor : star === 2 ? BALANCE.economy.star2PriceFactor : 1.0;
    const disc = (star === 1 && game.wave >= 2 && game.rnd() < BALANCE.economy.discountChance) ? BALANCE.economy.discountAmount : 0;
    const cost = Math.max(BALANCE.economy.priceFloor, Math.round(spec.cost * mult) - disc);
    game.shop.push({ uid: Math.floor(game.rnd() * 1e9), itemType: 'seal', kind, star, cost, bought: false, disc });
  };

  const pushGearOffer = () => {
    const baseKey = pickShopGearBaseKey(game.wave, game.rnd);
    const highAffixChance = (BALANCE.equipment?.shopPricing?.highRarityAffixChance || 0.16)
      + (isEndgameRef ? (refCfg.shopHighRarityAffixBonusW21Plus || 0.14) : 0);
    const gear = createGearInstance(baseKey, {
      wave: game.wave,
      origin: 'shop',
      highRarityChance: Math.min(0.65, highAffixChance),
      rndFn: game.rnd
    });
    const cost = calcShopGearPrice(gear.rarity, gear.elem, game.wave);
    game.shop.push({
      uid: Math.floor(game.rnd() * 1e9),
      itemType: 'gear',
      gear,
      elem: gear.elem,
      rarity: gear.rarity,
      cost,
      bought: false
    });
  };

  for (let i = 0; i < 4; i++) {
    // Slot 2: Guaranteed regular shop gear instance with independent rarity/slots/affixes!
    if (i === 2) {
      pushGearOffer();
      continue;
    }
    // Slot 3: In-run clean Pill slot (only xp/heal/temper — NEVER transferTokens or Destiny Exclusives!) or 2nd gear / seal offer
    if (i === 3) {
      if (game.rnd() < BALANCE.economy.pillSlotChance) {
        const pk = PILL_KEYS[Math.floor(game.rnd() * PILL_KEYS.length)];
        game.shop.push({ uid: Math.floor(game.rnd() * 1e9), itemType: 'pill', pillKey: pk, cost: PILLS[pk].cost, bought: false });
      } else if (game.rnd() < (isEndgameRef ? (refCfg.shopSecondGearChanceW21Plus || 0.65) : (BALANCE.economy.gearSecondSlotChance || 0.45))) {
        pushGearOffer();
      } else {
        pushSealOffer();
      }
      continue;
    }
    pushSealOffer();
  }
  renderAllUI();
  return true;
}

function checkShopAutoRestock(){
  if (game.shop.length > 0 && game.shop.every(s => s.bought)) {
    rollShop(true);
    toast('商店已买空，已自动免费补货！');
  }
}

function sealTotalPoints(seal){
  if (!seal) return 0;
  let pts = 1 + (seal.prog || 0);
  for (let s = 1; s < seal.star; s++) pts += SEAL_FUSE_NEED[s];
  return pts;
}

function chooseSealRoute(routeKey){
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  if (!game?.seal) return { ok: false, reason: 'no_seal' };
  const s = game.seal;
  if (s.star < 3) { toast('主灵印达到 3★ 后才可选择专精路线！', true); return { ok: false, reason: 'star_too_low' }; }
  if (s.route) { toast(`主灵印已锁定专精路线【${SEAL_SPECIALIZATIONS[s.elem]?.[s.route]?.name || s.route}】！`, true); return { ok: false, reason: 'already_chosen' }; }
  const spec = SEAL_SPECIALIZATIONS[s.elem]?.[routeKey];
  if (!spec) return { ok: false, reason: 'invalid_route' };
  if (spec.cost > 0 && game.gold < spec.cost) {
    toast(`选择【${spec.name}】需要 ${spec.cost} 金币！`, true);
    return { ok: false, reason: 'insufficient_gold', need: spec.cost };
  }
  if (spec.cost > 0) changeGold(-spec.cost, 'seal_route');
  s.route = routeKey;
  AudioKit.play('merge', 1.2);
  addRing(game.hero.x, game.hero.y, ELEMENTS[s.elem].color, 2.4);
  addFloat(game.hero.x, game.hero.y - 0.65, `✨ 灵印专精·${spec.name}`, '#ffe878', true);
  toast(`已选定主灵印 3★ 专精【${spec.name}】${spec.cost > 0 ? `（消耗 ${spec.cost} 金）` : '（免费）'}：${spec.desc}`);
  renderAllUI(true);
  return { ok: true, route: routeKey, cost: spec.cost, spec };
}

function buyShopItem(shopIdx){
  if (isFinalPrepActionLocked()) return false;
  const item = game.shop[shopIdx];
  if (!item || item.bought) return false;
  if (game.gold < item.cost) { toast(`需要 ${item.cost} 金币！`, true); return false; }

  // 1. Pill purchase (v0.60 clean pills: xp, heal, temper)
  if (item.itemType === 'pill') {
    const pSpec = PILLS[item.pillKey];
    if (!pSpec) return false;
    changeGold(-item.cost, `shop_buy_pill_${item.pillKey}`);
    item.bought = true;
    game.pills[item.pillKey] = (game.pills[item.pillKey] || 0) + 1;
    AudioKit.play('chest', 1.1);
    if (item.pillKey === 'xp') {
      const gain = Math.round(game.hero.xpNext * 0.35);
      gainHeroXp(gain);
      toast(`服下【修为丹】！修为 +${gain}！`);
    } else if (item.pillKey === 'heal') {
      game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 65);
      gainFrostShield(25, { maxShield: 90, duration: 6.0, source: 'pill_heal' });
      toast('服下【回春丹】！恢复 65 生命并凝结 25 护盾！');
    } else if (item.pillKey === 'temper') {
      changeMaterials(2, 'pill_temper');
      game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 25);
      toast(`服下【淬灵丹】！普通材料 +2（当前 ${game.materials}）并恢复 25 生命！`);
    }
    checkShopAutoRestock();
    renderAllUI(true);
    return true;
  }

  // 2. Stage 2 Independent Gear purchase (with stage + same-element escalating price & paidGold lock)
  if (item.itemType === 'gear' && item.gear) {
    if (!hasBagSpace(1)) {
      toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解背包装备后再购买！`, true);
      renderAllUI(true);
      return { ok: false, reason: 'bag_full' };
    }
    const boughtInst = normalizeGearInstance({ ...item.gear, paidGold: item.cost, origin: 'shop' });
    const stored = tryStoreGearInBag(boughtInst);
    if (!stored.ok) {
      toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解背包装备后再购买！`, true);
      renderAllUI(true);
      return { ok: false, reason: 'bag_full' };
    }
    changeGold(-item.cost, 'shop_buy_gear');
    item.bought = true;
    // Increment same-element purchase count (respecting sameElemResetByStage)
    const curStage = getSourceStageForWave(game.wave);
    if (BALANCE.equipment?.shopPricing?.sameElemResetByStage && game.shopElemBuyStage !== curStage) {
      game.shopElemBuyCounts = { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 };
      game.shopElemBuyStage = curStage;
    }
    game.shopElemBuyCounts[boughtInst.elem] = (game.shopElemBuyCounts[boughtInst.elem] || 0) + 1;
    // Dynamically refresh remaining unbought same-element gear prices in current shop row
    for (const other of game.shop) {
      if (!other.bought && other.itemType === 'gear' && other.gear && other.gear.elem === boughtInst.elem) {
        other.cost = calcShopGearPrice(other.gear.rarity, other.gear.elem, game.wave);
      }
    }
    AudioKit.play('chest', 1.15);
    addFloat(game.hero.x, game.hero.y - 0.55, `购入 ${boughtInst.icon}${boughtInst.name} [${boughtInst.slotsCount}槽]`, GEAR_RARITY_COLORS[boughtInst.rarity] || '#ffe27a', true);
    toast(`购入【${boughtInst.name}】(${GEAR_RARITY_LABELS[boughtInst.rarity]}·${boughtInst.slotsCount}槽) 花费 ${item.cost} 金，已放入背包！`);
    checkShopAutoRestock();
    renderAllUI(true);
    return true;
  }

  // 3. Main Seal & Sub-Seal Resonance purchase
  const spec = ARTIFACTS[item.kind];
  const cap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  const cardPts = item.star === 3 ? 4 : item.star === 2 ? 2 : 1;
  const subIdx = game.subSeals.findIndex(s => s.kind === item.kind);

  if (!game.seal) {
    changeGold(-item.cost, 'shop_buy_main_seal');
    item.bought = true;
    const initStar = Math.min(cap, item.star);
    game.seal = { kind: item.kind, elem: spec.elem, star: initStar, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 };
    addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 1.8);
    addFloat(game.hero.x, game.hero.y - 0.5, `附魔 ${spec.name} ${initStar}★`, ELEMENTS[spec.elem].color, true);
    AudioKit.play('merge', 1.05);
    toast(`已铭刻主灵印【${spec.name} ${initStar}★ ${SEAL_TIER_NAMES[initStar]}】${initStar >= 3 ? ' · 点击主印可选 3★ 专精路线！' : '！'}`);
  } else if (game.seal.kind === item.kind) {
    if (game.seal.star >= cap) {
      const curNode = getActiveUnlockNode();
      const nextNode = UNLOCK_NODES[curNode.idx + 1];
      toast(game.seal.star >= 5 ? '【主灵印】已达 5★ 仙印巅峰！' : `当前阶段主印上限 ${cap}★，达成【${nextNode?.name || '下一阶段'}】节点后解锁 ${cap + 1}★！`, true);
      return false;
    }
    changeGold(-item.cost, 'shop_upgrade_main_seal');
    item.bought = true;
    game.seal.prog += cardPts;
    let leveled = false;
    while (game.seal.star < cap && game.seal.prog >= SEAL_FUSE_NEED[game.seal.star]) {
      game.seal.prog -= SEAL_FUSE_NEED[game.seal.star];
      game.seal.star++;
      game.stats.merges++;
      leveled = true;
    }
    if (game.seal.star >= cap) game.seal.prog = 0;
    if (leveled) {
      game.shake = Math.max(game.shake, 7);
      addRing(game.hero.x, game.hero.y, '#ffe878', 2.6);
      addFloat(game.hero.x, game.hero.y - 0.6, `★ ${spec.name} 晋升 ${game.seal.star}★ ${SEAL_TIER_NAMES[game.seal.star]}！`, '#ffe878', true);
      AudioKit.play('merge');
      const routeHint = (game.seal.star >= 3 && !game.seal.route) ? ' · 已解锁 3★ 专精二选一（点击灵印阵盘选择）！' : '';
      const synMsg = game.seal.star === 3 ? ' · 已激活 2 层元素羁绊' : game.seal.star === 5 ? ' · 已激活 4 层终极羁绊' : '';
      toast(`主印升阶！【${spec.name}】晋升 ${game.seal.star}★ ${SEAL_TIER_NAMES[game.seal.star]}${synMsg}${routeHint}`);
    } else {
      AudioKit.play('coin', 1.2);
      toast(`吸收灵印精华！${spec.name} ${game.seal.star}★ 升星进度 ${game.seal.prog}/${SEAL_FUSE_NEED[game.seal.star]}`);
    }
  } else if (subIdx >= 0) {
    const sub = game.subSeals[subIdx];
    if (sub.star >= 3) {
      toast(`辅印【${spec.name}】已达 3★ 阵眼巅峰！`, true);
      return false;
    }
    changeGold(-item.cost, 'shop_upgrade_sub_seal');
    item.bought = true;
    sub.prog += cardPts;
    let leveled = false;
    while (sub.star < 3 && sub.prog >= SEAL_FUSE_NEED[sub.star]) {
      sub.prog -= SEAL_FUSE_NEED[sub.star];
      sub.star++;
      game.stats.merges++;
      leveled = true;
    }
    if (sub.star >= 3) sub.prog = 0;
    if (leveled) {
      AudioKit.play('merge', 1.15);
      addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.1);
      addFloat(game.hero.x, game.hero.y - 0.6, `★ 辅印 ${spec.name} 升至 ${sub.star}★！`, ELEMENTS[spec.elem].color, true);
      toast(`辅印升阶！【${SUB_SEAL_RESONANCE[spec.elem].name}】晋升 ${sub.star}★${sub.star === 3 ? '（额外+2羁绊权重）' : ''}！`);
    } else {
      AudioKit.play('coin', 1.15);
      toast(`强化辅印【${spec.name}】进度 ${sub.prog}/${SEAL_FUSE_NEED[sub.star]}`);
    }
  } else if (game.subSeals.length < subCap) {
    changeGold(-item.cost, 'shop_buy_sub_seal');
    item.bought = true;
    const initStar = Math.min(3, item.star);
    game.subSeals.push({ kind: item.kind, elem: spec.elem, star: initStar, prog: 0, dmgDealt: 0 });
    const res = SUB_SEAL_RESONANCE[spec.elem];
    addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.0);
    addFloat(game.hero.x, game.hero.y - 0.55, `✨ 辅印共鸣 · ${res.name} ${initStar}★`, ELEMENTS[spec.elem].color, true);
    AudioKit.play('merge', 1.1);
    toast(`✨ 辅印共鸣激活！【${res.name} ${initStar}★】${res.desc(initStar)}`);
  } else {
    // Switch Main Seal: refund 80% of old main seal invested value and equip new element!
    const oldSpec = ARTIFACTS[game.seal.kind];
    const refund = Math.round(oldSpec.cost * sealTotalPoints(game.seal) * 0.8);
    changeGold(-item.cost, 'shop_switch_main_seal');
    if (refund > 0) changeGold(refund, 'switch_main_seal_refund');
    item.bought = true;
    const initStar = Math.min(cap, item.star);
    game.seal = { kind: item.kind, elem: spec.elem, star: initStar, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 };
    addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.0);
    addFloat(game.hero.x, game.hero.y - 0.5, `转修 ${spec.name} ${initStar}★ (+${refund}金)`, ELEMENTS[spec.elem].color, true);
    AudioKit.play('merge', 1.0);
    toast(`转修换主印！【${oldSpec.name}】折价返还 +${refund} 金，已切换为【${spec.name} ${initStar}★】！`);
  }

  checkShopAutoRestock();
  renderAllUI(true);
  return true;
}

function sellSeal(){
  if (isFinalPrepActionLocked()) return false;
  if (!game.seal) return false;
  const oldSpec = ARTIFACTS[game.seal.kind];
  const refund = Math.round(oldSpec.cost * sealTotalPoints(game.seal) * 0.8);
  changeGold(refund, 'sell_main_seal');
  game.seal = null;
  if (!game.subSeals.length) game.inspTarget = null;
  addFloat(game.hero.x, game.hero.y - 0.5, `+${refund} 金`, '#ffe27a');
  AudioKit.play('coin');
  toast(`已卸售主灵印【${oldSpec.name}】返还 ${refund} 金币。`);
  renderAllUI(true);
  return true;
}

function sellSubSeal(idx){
  if (isFinalPrepActionLocked()) return false;
  const sub = game.subSeals[idx];
  if (!sub) return false;
  const spec = ARTIFACTS[sub.kind];
  const refund = Math.round(spec.cost * sealTotalPoints(sub) * 0.8);
  changeGold(refund, 'sell_sub_seal');
  game.subSeals.splice(idx, 1);
  addFloat(game.hero.x, game.hero.y - 0.5, `卸辅印 +${refund} 金`, '#ffe27a');
  AudioKit.play('coin');
  toast(`已卸售辅灵印【${spec.name}】返还 ${refund} 金币，空出 1 个辅印槽。`);
  renderAllUI(true);
  return true;
}

function equipGearFromBag(bagIdx){
  if (isFinalPrepActionLocked()) return false;
  if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
  const raw = game.bag[bagIdx];
  if (isBagSeal(raw)) {
    // Safe non-destructive attempt to absorb/equip stashed seal without overwriting active Main Seal!
    const res = grantSealSafely(raw.kind, raw.star, { rarity: raw.rarity, origin: raw.origin || 'bag_seal', dryIfStore: true });
    if (res.ok && res.action !== 'stored_bag' && res.action !== 'stored_stash') {
      game.bag.splice(bagIdx, 1);
      renderAllUI(true);
      return true;
    }
    toast(`在用主辅灵印已满，【${raw.name} ${raw.star}★】不会覆盖当前主灵印！可右键出售换金或 Shift+右键拆解换锻材。`, true);
    renderAllUI(true);
    return false;
  }
  const inst = normalizeGearInstance(raw);
  if (game.hero.gear.length >= HERO_GEAR_SLOTS) {
    game.inspTarget = { type: 'hero' };
    toast(`领主构装槽已满（${HERO_GEAR_SLOTS}/${HERO_GEAR_SLOTS}），已在详情面板打开，可卸下、替换、出售或拆解！`, true);
    renderAllUI(true);
    return false;
  }
  game.bag.splice(bagIdx, 1);
  game.hero.gear.push(inst);
  syncHeroMaxHp();
  const syn = recomputeEquipmentSynergies();
  game.mode = null;
  const synTxt = syn.active.length ? ` · 当前联动：${syn.active.map(s => s.name).join(' / ')}` : '';
  addRing(game.hero.x, game.hero.y, '#ffe478', 1.5);
  addFloat(game.hero.x, game.hero.y - 0.5, `穿戴 ${gearLabel(inst)}`, '#ffe88a', true);
  AudioKit.play('chest');
  toast(`已穿戴【${gearLabel(inst)}】(${inst.slotsCount}槽)${synTxt}`);
  renderAllUI(true);
  return true;
}

function replaceEquippedGear(slotIdx, bagIdx){
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  if (slotIdx < 0 || slotIdx >= game.hero.gear.length) return { ok: false, reason: 'invalid_slot_idx' };
  if (bagIdx < 0 || bagIdx >= game.bag.length) return { ok: false, reason: 'invalid_bag_idx' };
  if (isBagSeal(game.bag[bagIdx])) {
    toast('灵印物品无法替换领主构装槽！', true);
    return { ok: false, reason: 'bag_item_is_seal' };
  }
  const incoming = normalizeGearInstance(game.bag[bagIdx]);
  const outgoing = game.hero.gear[slotIdx];
  game.hero.gear[slotIdx] = incoming;
  game.bag[bagIdx] = outgoing;
  syncHeroMaxHp();
  recomputeEquipmentSynergies();
  AudioKit.play('chest', 1.05);
  toast(`已用【${gearLabel(incoming)}】替换【${gearLabel(outgoing)}】，联动已实时重算！`);
  renderAllUI(true);
  return { ok: true, slotIdx, bagIdx, incoming, outgoing };
}

function unequipGear(slotIdx){
  if (isFinalPrepActionLocked()) return false;
  const list = game.hero.gear;
  if (!list || slotIdx < 0 || slotIdx >= list.length) return false;
  if (!hasBagSpace(1)) {
    toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先替换或出售/拆解背包装备后再卸下！`, true);
    renderAllUI(true);
    return { ok: false, reason: 'bag_full' };
  }
  const [inst] = list.splice(slotIdx, 1);
  tryStoreGearInBag(inst);
  syncHeroMaxHp();
  recomputeEquipmentSynergies();
  AudioKit.play('coin', 0.85);
  toast(`已卸下【${gearLabel(inst)}】放回背包，联动已重算。`);
  renderAllUI(true);
  return true;
}

function sellBagGear(bagIdx){
  if (isFinalPrepActionLocked()) return false;
  if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
  const inst = game.bag[bagIdx];
  if (isBagSeal(inst)) {
    const spec = ARTIFACTS[inst.kind] || { cost: 22, name: inst.name || '灵印' };
    const pts = inst.star === 3 ? 4 : inst.star === 2 ? 2 : 1;
    const gold = Math.max(8, Math.round(spec.cost * pts * 0.65));
    game.bag.splice(bagIdx, 1);
    changeGold(gold, 'sell_bag_seal');
    AudioKit.play('coin', 1.1);
    addFloat(game.hero.x, game.hero.y - 0.5, `售灵印 +${gold} 金`, '#ffe27a');
    toast(`💰 已出售未装备灵印【${spec.name} ${inst.star}★】，获得 +${gold} 金币！`);
    renderAllUI(true);
    return true;
  }
  const gold = getGearSellGold(inst);
  game.bag.splice(bagIdx, 1);
  changeGold(gold, 'sell_bag_gear');
  AudioKit.play('coin', 1.1);
  addFloat(game.hero.x, game.hero.y - 0.5, `出售 +${gold} 金`, '#ffe27a');
  toast(`💰 已出售【${gearLabel(inst)}】(${GEAR_RARITY_LABELS[inst.rarity]}·阶段${inst.sourceStage})，获得 +${gold} 金币！`);
  renderAllUI(true);
  return true;
}

function dismantleBagGear(bagIdx){
  if (isFinalPrepActionLocked()) return false;
  if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
  const inst = game.bag[bagIdx];
  if (isBagSeal(inst)) {
    // Dismantling seals yields ONLY ordinary materials, NEVER transfer tokens!
    const mats = Math.max(1, (inst.star || 1) * 2);
    game.bag.splice(bagIdx, 1);
    changeMaterials(mats, 'dismantle_bag_seal');
    AudioKit.play('merge', 0.9);
    addFloat(game.hero.x, game.hero.y - 0.5, `拆灵印 +${mats} 锻材`, '#8ef4ff');
    toast(`🔧 已拆解未装备灵印【${inst.name} ${inst.star}★】，获得 +${mats} 普通材料！`);
    renderAllUI(true);
    return true;
  }
  const mats = getGearDismantleMaterials(inst);
  game.bag.splice(bagIdx, 1);
  changeMaterials(mats, 'dismantle_bag_gear');
  AudioKit.play('merge', 0.9);
  addFloat(game.hero.x, game.hero.y - 0.5, `拆解 +${mats} 锻材`, '#8ef4ff');
  toast(`🔧 已拆解【${gearLabel(inst)}】(${GEAR_RARITY_LABELS[inst.rarity]}·阶段${inst.sourceStage})，获得 +${mats} 普通材料！`);
  renderAllUI(true);
  return true;
}

// Backward-compatible alias
function salvageBagGear(bagIdx){
  return sellBagGear(bagIdx);
}

// Stage 4 Safe Claim Paths (NEVER auto-sell or overwrite active 5★ Main Seal; overflow goes to game.rewardStash!)
function grantGearSafely(input, opts = {}){
  const inst = isGearInstance(input)
    ? normalizeGearInstance(input)
    : createGearInstance(gearBase(input), { wave: game.wave, origin: opts.origin || 'destiny_gamble', ...opts });
  const cap = getBagCapacity();
  if (game.bag.length < cap) {
    game.bag.push(inst);
    AudioKit.play('chest', 1.2);
    if (!opts.silent) {
      const stSpec = getSourceStageSpec(inst.sourceStage);
      toast(`获得构装【${inst.name}】(${GEAR_RARITY_LABELS[inst.rarity]}·${stSpec.label}·${inst.slotsCount}槽)，已安全放入背包！`);
    }
    renderAllUI(true);
    return { ok: true, storedIn: 'bag', item: inst };
  }
  game.rewardStash = game.rewardStash || [];
  game.rewardStash.push({ itemType: 'gear', item: inst, storedAtWave: game.wave, origin: opts.origin || 'destiny_gamble' });
  AudioKit.play('chest', 1.1);
  if (!opts.silent) {
    toast(`背包已满（${cap}/${cap}），构装【${inst.name}】已安全转入暂存箱（可随时在属性面板提取）！`);
  }
  renderAllUI(true);
  return { ok: true, storedIn: 'stash', item: inst };
}

function grantSealSafely(kind, star = 1, opts = {}){
  const spec = ARTIFACTS[kind];
  if (!spec) return { ok: false, reason: 'invalid_seal' };
  const cap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  const normStar = clamp(Math.round(Number(star) || 1), 1, 3);
  const cardPts = normStar === 3 ? 4 : normStar === 2 ? 2 : 1;
  const subIdx = game.subSeals.findIndex(s => s.kind === kind);

  // On W29 timeout/auto-claim (opts.storeUnequipped), NEVER modify active Main/Sub Seals — always store as unequipped seal in bag or rewardStash!
  if (!opts.storeUnequipped) {
    // Case 1: No Main Seal equipped yet -> equip safely
    if (!game.seal) {
      const initStar = Math.min(cap, normStar);
      game.seal = { kind, elem: spec.elem, star: initStar, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 };
      AudioKit.play('merge', 1.1);
      if (!opts.silent) toast(`✨ 安全领奖：已铭刻主灵印【${spec.name} ${initStar}★】！`);
      renderAllUI(true);
      return { ok: true, action: 'equipped_main', mainSealPreserved: true, seal: game.seal };
    }

    // Case 2: Matches Main Seal & Main Seal is below current star cap -> absorb fusion points
    if (game.seal.kind === kind && game.seal.star < cap) {
      game.seal.prog += cardPts;
      let leveled = false;
      while (game.seal.star < cap && game.seal.prog >= SEAL_FUSE_NEED[game.seal.star]) {
        game.seal.prog -= SEAL_FUSE_NEED[game.seal.star];
        game.seal.star++;
        game.stats.merges++;
        leveled = true;
      }
      if (game.seal.star >= cap) game.seal.prog = 0;
      AudioKit.play('merge', 1.15);
      if (!opts.silent) toast(leveled ? `★ 主灵印【${spec.name}】晋升 ${game.seal.star}★！` : `✨ 主灵印【${spec.name}】吸收灵印精华！`);
      renderAllUI(true);
      return { ok: true, action: 'upgraded_main', leveled, mainSealPreserved: true, seal: game.seal };
    }

    // Case 3: Matches existing Sub-Seal & Sub-Seal is below 3★ -> absorb fusion points
    if (subIdx >= 0 && game.subSeals[subIdx].star < 3) {
      const sub = game.subSeals[subIdx];
      sub.prog += cardPts;
      let leveled = false;
      while (sub.star < 3 && sub.prog >= SEAL_FUSE_NEED[sub.star]) {
        sub.prog -= SEAL_FUSE_NEED[sub.star];
        sub.star++;
        game.stats.merges++;
        leveled = true;
      }
      if (sub.star >= 3) sub.prog = 0;
      AudioKit.play('merge', 1.1);
      if (!opts.silent) toast(leveled ? `★ 辅灵印【${spec.name}】晋升 ${sub.star}★！` : `✨ 辅灵印【${spec.name}】吸收灵印精华！`);
      renderAllUI(true);
      return { ok: true, action: 'upgraded_sub', leveled, mainSealPreserved: true, subSeal: sub };
    }

    // Case 4: Off-element seal & empty Sub-Seal slot available -> equip into Sub-Seal slot (Main Seal untouched!)
    if (game.seal.kind !== kind && subIdx < 0 && game.subSeals.length < subCap) {
      const initStar = Math.min(3, normStar);
      const sub = { kind, elem: spec.elem, star: initStar, prog: 0, dmgDealt: 0 };
      game.subSeals.push(sub);
      AudioKit.play('merge', 1.1);
      if (!opts.silent) toast(`✨ 辅印共鸣激活！【${SUB_SEAL_RESONANCE[spec.elem].name} ${initStar}★】已入空辅印槽，主灵印完好保留！`);
      renderAllUI(true);
      return { ok: true, action: 'equipped_sub', mainSealPreserved: true, subSeal: sub };
    }
  }

  // Case 5 (SAFE IRON RULE): Off-element with full slots, maxed seal, or W29 timeout unequipped rule ->
  // NEVER call buyShopItem, NEVER sell or overwrite active Main/Sub Seal! Store as unequipped seal in bag or rewardStash!
  if (opts.dryIfStore) {
    return { ok: false, reason: 'slots_full_or_maxed', mainSealPreserved: true };
  }
  const sealItem = {
    itemType: 'seal',
    uid: nextGearUid(),
    kind,
    elem: spec.elem,
    star: normStar,
    name: spec.name,
    icon: spec.icon,
    rarity: opts.rarity || (normStar >= 3 ? 'epic' : normStar === 2 ? 'rare' : 'common'),
    origin: opts.origin || 'destiny_gamble'
  };
  const bagCap = getBagCapacity();
  if (game.bag.length < bagCap) {
    game.bag.push(sealItem);
    AudioKit.play('chest', 1.05);
    if (!opts.silent) toast(`🛡️ 安全领奖：【${spec.name} ${normStar}★】已收纳至背包，在用主辅灵印（含 5★ 主印）完好保留！`);
    renderAllUI(true);
    return { ok: true, action: 'stored_bag', storedIn: 'bag', item: sealItem, mainSealPreserved: true };
  }
  game.rewardStash = game.rewardStash || [];
  game.rewardStash.push({ itemType: 'seal', item: sealItem, storedAtWave: game.wave, origin: opts.origin || 'destiny_gamble' });
  AudioKit.play('chest', 1.05);
  if (!opts.silent) toast(`🛡️ 背包已满，【${spec.name} ${normStar}★】已安全存入暂存箱，在用主辅灵印完好保留！`);
  renderAllUI(true);
  return { ok: true, action: 'stored_stash', storedIn: 'stash', item: sealItem, mainSealPreserved: true };
}

function claimRewardStashItem(stashIdx = 0){
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  if (!game?.rewardStash || stashIdx < 0 || stashIdx >= game.rewardStash.length) {
    return { ok: false, reason: 'invalid_stash_index' };
  }
  if (game.bag.length >= getBagCapacity()) {
    toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解腾出空位！`, true);
    return { ok: false, reason: 'bag_full' };
  }
  const [entry] = game.rewardStash.splice(stashIdx, 1);
  game.bag.push(entry.item);
  AudioKit.play('chest', 1.0);
  toast(`📦 已从暂存箱取出【${entry.item.name}】放入背包！`);
  renderAllUI(true);
  return { ok: true, item: entry.item, stashLeft: game.rewardStash.length };
}

// Stage 2 Normal Material Optimization (Review-approved plan L96):
// Consumes game.materials to raise enhanceLv (base stats + existing affix numeric tier),
// STRICTLY preserving rarity, sourceStage, slotsCount, and affix IDs!
function enhanceGear(target){
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  if (!game?.hero) return { ok: false, reason: 'no_game' };
  let inst = null;
  if (typeof target === 'string') {
    inst = game.hero.gear.find(g => g.uid === target) || game.bag.find(g => g.uid === target) || null;
  } else if (target && typeof target === 'object') {
    if (target.location === 'equipped') inst = game.hero.gear[target.idx] || null;
    else if (target.location === 'bag') inst = game.bag[target.idx] || null;
    else if (target.uid) inst = game.hero.gear.find(g => g.uid === target.uid) || game.bag.find(g => g.uid === target.uid) || null;
  }
  if (!inst || typeof inst !== 'object' || isBagSeal(inst)) return { ok: false, reason: 'not_found' };
  const cost = getGearEnhanceCost(inst);
  if (cost === null) {
    toast(`【${gearLabel(inst)}】已达最高强化档位！`, true);
    return { ok: false, reason: 'max_level' };
  }
  if ((game.materials || 0) < cost) {
    toast(`材料强化需要 ⚙️${cost} 普通材料（当前 ${game.materials || 0}）！`, true);
    return { ok: false, reason: 'insufficient_materials', need: cost };
  }
  changeMaterials(-cost, 'enhance_gear');
  inst.enhanceLv = (inst.enhanceLv || 0) + 1;
  // Upgrade numeric tier of existing affixes while strictly preserving affix IDs, slotsCount, rarity, sourceStage!
  for (const a of (inst.affixes || [])) {
    if (a) a.tier = 1 + inst.enhanceLv;
  }
  syncHeroMaxHp();
  recomputeEquipmentSynergies();
  AudioKit.play('merge', 1.15);
  addRing(game.hero.x, game.hero.y, '#8ef4ff', 1.6);
  addFloat(game.hero.x, game.hero.y - 0.55, `⚙️强化 ${inst.name} +${inst.enhanceLv}`, '#9ef6ff', true);
  toast(`⚙️ 消耗 ${cost} 锻材优化【${gearLabel(inst)}】：基础属性与已有词条数值档位升至 T${1 + inst.enhanceLv}（原品质/阶段/槽位/词条不变）！`);
  renderAllUI(true);
  return { ok: true, uid: inst.uid, enhanceLv: inst.enhanceLv, cost, materialsLeft: game.materials };
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

/* Dynamic viewport-perimeter rectangle spawn: ALWAYS outside visible screen regardless of aspect ratio! */
function spawnPosAroundHero(side){
  const h = game.hero;
  const viewHalfW = (cam.w / (2 * Math.max(0.5, cam.zoom))) / CELL;
  const viewHalfH = (cam.h / (2 * Math.max(0.5, cam.zoom))) / CELL;
  const rx = Math.max(11.5, viewHalfW + 1.6);
  const ry = Math.max(8.5, viewHalfH + 1.6);
  const pick = side || ['west','east','north','south'][Math.floor(game.rnd() * 4)];
  const jitter = (game.rnd() * 2 - 1);
  let sx = h.x, sy = h.y;
  if (pick === 'east')       { sx = h.x + rx; sy = h.y + jitter * ry; }
  else if (pick === 'west')  { sx = h.x - rx; sy = h.y + jitter * ry; }
  else if (pick === 'south') { sy = h.y + ry; sx = h.x + jitter * rx; }
  else                       { sy = h.y - ry; sx = h.x + jitter * rx; }

  // If hero hugs a world border and spawn falls outside world, reflect to opposite open side
  if (sx < 0.8) sx = h.x + rx;
  else if (sx > W - 0.8) sx = h.x - rx;
  if (sy < 0.8) sy = h.y + ry;
  else if (sy > H - 0.8) sy = h.y - ry;

  return { x: clamp(sx, 0.8, W - 0.8), y: clamp(sy, 0.8, H - 0.8) };
}

function pickEliteAffixes(cnt = 1){
  const pool = ELITE_AFFIXES.slice();
  const out = [];
  while (out.length < cnt && pool.length) {
    out.push(pool.splice(Math.floor(game.rnd() * pool.length), 1)[0]);
  }
  return out;
}

function spawnEnemy(kind, side, scale = 1, customPos = null){
  const sp = ENEMY_SPECS[kind];
  const pos = customPos || spawnPosAroundHero(side);
  const hp = Math.round(sp.hp * scale);
  const affixCnt = sp.elite ? (game.wave >= 22 ? 3 : game.wave >= 12 ? 2 : 1) : 0;
  const bw = BALANCE.wave;
  const waveSpdMult = bw.enemySpeedBands.reduce((m, band) => game.wave >= band.from ? band.mult : m, 1);
  const wDmgMult = (1 + (game.wave - 1) * bw.enemyDamageGrowthPerWave) *
    (game.wave >= bw.enemyDamageLateStart ? Math.pow(bw.enemyDamageLateGrowth, game.wave - (bw.enemyDamageLateStart - 1)) : 1);
  const w30Cfg = BALANCE.w30Boss || {};
  const baseSpd = Number((sp.spd * waveSpdMult).toFixed(2));
  const e = {
    id: game.nextEnemyId++,
    kind, name: sp.name,
    x: pos.x, y: pos.y,
    hp, maxHp: hp, shield: 0,
    spd: baseSpd, baseSpd, dmg: Math.round(sp.dmg * wDmgMult),
    xp: sp.xp, gold: sp.gold, r: sp.r,
    col: sp.col, rim: sp.rim,
    ranged: !!sp.ranged, range: sp.range || 0,
    leaper: !!sp.leaper, charger: !!sp.charger, bomber: !!sp.bomber, shaman: !!sp.shaman,
    totem: !!sp.totem, totemTimer: 2.2, totemBossId: null,
    pillar: !!sp.pillar, pillarTimer: 2.8, pillarBossId: null,
    voidGuard: !!sp.voidGuard,
    elite: !!sp.elite, boss: !!sp.boss,
    affixes: affixCnt > 0 ? pickEliteAffixes(affixCnt) : [],
    cd: 0.4, slow: 0, slowT: 0, freezeT: 0, burnDps: 0, burnT: 0, vulnT: 0, frenzyT: 0,
    fireMarkT: 0, fireMarkStacks: 0, fireMarkSource: null, fireDetonateCd: 0,
    flash: 0, bossTimer: kind === 'boss6' ? (w30Cfg.coreCooldownOpening || 5.2) : 5.0,
    bossAuxTimer: kind === 'boss6' ? (w30Cfg.auxCooldownMid || 9.5) : 3.6,
    bossAuxCasts: 0, bossChaseQueue: 0, bossChaseCd: 0, bossPhase: 0, frenzied: false,
    signatureThresholdHp: kind === 'boss6' ? Math.round(hp * (w30Cfg.signatureThresholdPct ?? 0.80)) : 0,
    finalThresholdHp: kind === 'boss6' ? Math.round(hp * (w30Cfg.finalPhaseThresholdPct ?? 0.35)) : 0,
    signatureTriggered: false,
    signatureLockActive: false,
    signatureStage: 'none', // 'none' | 'telegraph' | 'shockwave' | 'done'
    signatureTimer: 0,
    signatureSafeZone: null,
    finalPhaseEntered: false,
    sigFloatCd: 0,
    zeroExecCd: 0,
    aiState: 'chase', aiTimer: 0, aiCd: 2.0 + game.rnd() * 1.4, aiVx: 0, aiVy: 0,
    affixTimer: 2.4 + game.rnd() * 1.2, shamanTimer: 2.2, unstopFloatCd: 0
  };
  game.enemies.push(e);
  if (kind === 'boss6' && game.w30Battle) {
    game.w30Battle.bossId = e.id;
    game.w30Battle.bossMaxHp = e.maxHp;
    game.w30Battle.signatureThresholdHp = e.signatureThresholdHp;
    game.w30Battle.finalThresholdHp = e.finalThresholdHp;
  }
  if (game.curWaveTel) game.curWaveTel.ehpTotal += hp;
  return e;
}

function spawnHealOrb(x, y, opts = {}){
  if (!game) return null;
  game.healOrbs = game.healOrbs || [];
  const w30Cfg = BALANCE.w30Boss || {};
  const orb = {
    x: clamp(x, 2.0, W - 2.0),
    y: clamp(y, 2.0, H - 2.0),
    hpPct: opts.hpPct ?? (w30Cfg.healOrbHpPct || 0.18),
    shield: opts.shield ?? 18,
    life: opts.life ?? 18.0,
    bob: game.rnd() * Math.PI * 2
  };
  game.healOrbs.push(orb);
  if (game.w30Battle) game.w30Battle.healOrbsSpawned = (game.w30Battle.healOrbsSpawned || 0) + 1;
  addRing(orb.x, orb.y, '#62ffb8', 1.2);
  return orb;
}

function triggerW30BossSignature(boss, truncatedDmg = 0){
  if (!boss || boss.kind !== 'boss6' || boss.signatureTriggered) return false;
  const w30Cfg = BALANCE.w30Boss || {};
  const h = game.hero;
  const teleSec = w30Cfg.signatureTelegraphSeconds || 2.6;
  const safeDist = w30Cfg.signatureSafeZoneDist || 5.4;
  const safeR = w30Cfg.signatureSafeZoneRadius || 2.8;
  const baseAng = Math.atan2(h.y - boss.y, h.x - boss.x);
  const safeAng = baseAng + (game.rnd() < 0.5 ? 0.55 : -0.55);
  const safeX = clamp(boss.x + Math.cos(safeAng) * safeDist, 4.0, W - 4.0);
  const safeY = clamp(boss.y + Math.sin(safeAng) * safeDist, 4.0, H - 4.0);

  boss.hp = boss.signatureThresholdHp;
  boss.signatureTriggered = true;
  boss.signatureLockActive = true;
  boss.signatureStage = 'telegraph';
  boss.signatureTimer = teleSec;
  boss.signatureSafeZone = { x: safeX, y: safeY, r: safeR };
  boss.aiState = 'signature'; // NOT unstoppable -> Fire marks, Frost slow & Frost shield still work legitimately!

  game.zones.push({
    kind: 'w30SigTelegraph',
    bossId: boss.id,
    x: boss.x, y: boss.y, r: 16.5,
    safeX, safeY, safeR,
    t: teleSec, max: teleSec,
    dmg: w30Cfg.signatureDamage || 68
  });

  if (game.w30Battle) {
    const at = Number((game.w30Battle.elapsedSeconds || 0).toFixed(2));
    game.w30Battle.phase = 'signature_telegraph';
    game.w30Battle.signatureTriggered = true;
    game.w30Battle.signatureLockActive = true;
    game.w30Battle.signatureLockStartedAt = at;
    game.w30Battle.signatureTruncatedDmg = Math.max(0, Math.round(truncatedDmg));
    game.w30Battle.phaseTimeline.push({
      phase: 'signature_telegraph',
      at,
      bossHpPct: Math.round(boss.hp * 100 / Math.max(1, boss.maxHp)),
      truncatedDmg: Math.max(0, Math.round(truncatedDmg))
    });
  }

  AudioKit.play('boss', 0.85);
  game.shake = Math.max(game.shake, 9);
  flashScreen('fail');
  addRing(boss.x, boss.y, '#ff2e63', 4.5);
  addFloat(boss.x, boss.y - 1.0, '🛡️ 终焉锁血 · 招牌招式蓄力！', '#ffe678', true);
  showBanner(
    '⚠️ 深渊主宰 · 80% 血线招牌招式【终焉裂空冲击波】！',
    '🛡️ 首领进入终焉锁血（命中可挂火标/减速/叠盾，扣血与吸血为 0）！速入青绿安全区规避爆发！',
    'boss'
  );
  return true;
}

function enterW30BossFinalPhase(boss){
  if (!boss || boss.kind !== 'boss6' || boss.finalPhaseEntered || boss.signatureLockActive) return false;
  boss.finalPhaseEntered = true;
  boss.frenzied = true;
  boss.spd = Number(((boss.baseSpd || boss.spd) * 1.16).toFixed(2));
  boss.bossTimer = Math.min(boss.bossTimer, 1.4);
  if (game.w30Battle) {
    const at = Number((game.w30Battle.elapsedSeconds || 0).toFixed(2));
    game.w30Battle.phase = 'final_combo';
    game.w30Battle.phaseTimeline.push({
      phase: 'final_combo',
      at,
      bossHpPct: Math.round(boss.hp * 100 / Math.max(1, boss.maxHp))
    });
  }
  const h = game.hero;
  spawnHealOrb(clamp(h.x + (game.rnd() - 0.5) * 4.0, 3, W - 3), clamp(h.y + (game.rnd() - 0.5) * 4.0, 3, H - 3));
  AudioKit.play('boss', 1.1);
  game.shake = Math.max(game.shake, 8);
  addRing(boss.x, boss.y, '#ff385c', 4.2);
  addFloat(boss.x, boss.y - 0.95, '🔥 末段组合压制 · 打空即胜！', '#ff809c', true);
  showBanner('🔥 深渊主宰进入末段（≤35%）· 招式组合全力展开！', '末段无锁血，伤害正常结算，打空血条即刻通关 30 波！', 'boss');
  return true;
}

function isEnemyUnstoppable(e){
  return !!e && (e.aiState === 'windup' || e.aiState === 'leap' || e.aiState === 'charge');
}
function applyHeroLifesteal(rawAmt){
  const h = game.hero;
  if (!h || rawAmt <= 0 || h.hp >= h.maxHp) return 0;
  const bloodSet = gearSetTier('blood');
  const bloodMult = bloodSet >= 3 ? 1.80 : bloodSet >= 2 ? 1.45 : 1.0;
  const afkMult = (game.phase === 'wave' && !h.moving && h.invuln <= 0) ? 0.50 : 1.0;
  const cap = Math.max(8, Math.round(h.maxHp * 0.055 * bloodMult * afkMult));
  const avail = Math.max(0, cap - (h.leechUsed || 0));
  const heal = Math.min(rawAmt, avail, h.maxHp - h.hp);
  if (heal > 0) {
    h.hp += heal;
    h.leechUsed = (h.leechUsed || 0) + heal;
  }
  return heal;
}

function dealDamage(e, rawDmg, opts = {}){
  if (!e || e.hp <= 0) return 0;
  const wasSignatureLocked = !!(e.kind === 'boss6' && e.signatureLockActive);
  const syn = getSynergyCounts();
  const frostSet = gearSetTier('frost');
  const flameSet = gearSetTier('flame');
  const gearSyn = getActiveGearAffixSynergies();
  const gm = aggregateGear(game?.hero?.gear || []);
  const hadFireMarkBeforeHit = (e.fireMarkT || 0) > 0;
  let dmg = rawDmg;
  const frostSub = getSubSeal('frost');
  const chillAmp = frostSub ? SUB_SEAL_RESONANCE.frost.chillAmp[frostSub.star - 1] : 0;
  if ((e.slowT > 0 || e.freezeT > 0)) {
    if (syn.frost >= 2) dmg *= 1.25;
    if (chillAmp > 0) dmg *= (1 + chillAmp);
    if (frostSet >= 2) dmg *= (frostSet >= 3 ? 1.35 : 1.20);
    if (gm.chilledDmgPct > 0) dmg *= (1 + gm.chilledDmgPct);
  }
  const isFireHit = (opts.skillKey === 'firewave' || opts.tower?.elem === 'fire' || opts.isFireExp || opts.burn > 0);
  if (flameSet >= 2 && isFireHit) {
    dmg *= (flameSet >= 3 ? 1.40 : 1.25);
  }
  if (gm.fireDmgPct > 0 && isFireHit) {
    dmg *= (1 + gm.fireDmgPct);
  }
  if (gm.markedDmgPct > 0 && (e.fireMarkT > 0 || e.burnT > 0)) {
    dmg *= (1 + gm.markedDmgPct);
  }
  if (e.vulnT > 0) dmg *= 1.20;
  if (hasDestinyEnhancement('destiny_fate_breaker') && (e.boss || e.elite || e.vulnT > 0)) {
    dmg *= 1.22;
  }

  // Dual Cataclysm (雷火劫印): burning enemy takes bonus thunder dmg + instant burn burst!
  const dcLv = perkLv('dual_cataclysm');
  let dcHealPending = false;
  if (dcLv > 0 && opts.isThunder && e.burnT > 0) {
    dmg *= (dcLv >= 2 ? 2.0 : 1.6);
    const burnBurst = Math.round(e.burnDps * e.burnT * 0.6);
    if (burnBurst > 0) dmg += burnBurst;
    e.burnT = 3.0;
    if (dcLv >= 2) dcHealPending = true;
  }

  const isCrit = opts.critChance ? game.rnd() < opts.critChance : false;
  if (isCrit) dmg *= (opts.critDmg || 1.7);
  if (isCrit && hasDestinyEnhancement('destiny_fate_breaker') && (e.boss || e.elite) && !opts.fromDestinyBreaker && (game.hero?.destinyBreakerCd || 0) <= 0) {
    game.hero.destinyBreakerCd = 1.2;
    e.vulnT = Math.max(e.vulnT || 0, 2.5);
    dmg = Math.round(dmg * 1.35);
    recordDestinyProc('destiny_fate_breaker');
    addFloat(e.x, e.y - 0.85, '⚔️破劫裁决!', '#ffe484', true);
  }
  dmg = Math.max(1, Math.round(dmg));

  // Zero Execution (绝对零度): Boss extra missing HP true dmg at Lv.2 (fair 1.5s ICD + cap so 3-5 min W30 Boss isn't broken)
  const zeLv = perkLv('zero_exec');
  if (zeLv >= 2 && e.boss && !opts.fromExec && (e.zeroExecCd || 0) <= 0) {
    const rawMissing = Math.round((e.maxHp - e.hp) * 0.06);
    const bossCap = e.kind === 'boss6' ? Math.max(240, Math.round(dmg * 0.55)) : Math.max(320, Math.round(dmg * 0.80));
    dmg += Math.min(rawMissing, bossCap);
    e.zeroExecCd = 1.5;
  }

  // ==================== STAGE 5: DECOUPLED HP DEDUCTION & W30 BOSS SIGNATURE LOCK ====================
  let actualHpDmg = 0;
  let actualShieldDmg = 0;

  if (wasSignatureLocked) {
    // STRICT HP LOCK: actual HP deduction = 0, damage-based lifesteal = 0; legitimate hit effects STILL resolve below!
    actualHpDmg = 0;
    actualShieldDmg = 0;
    e.hp = Math.max(e.hp, e.signatureThresholdHp);
    e.flash = 0.08;
    if (game.w30Battle) {
      game.w30Battle.signatureHitsDuringLock++;
    }
    if ((e.sigFloatCd || 0) <= 0) {
      e.sigFloatCd = 0.42;
      addFloat(e.x + (game.rnd() - 0.5) * 0.35, e.y - 0.65, '🛡️终焉锁血(0扣血)', '#ffd97d', true);
    }
  } else {
    // Absorb enemy shield first if present (Elite/Boss affix)
    let hpDmg = dmg;
    if (e.shield > 0) {
      const abs = Math.min(e.shield, hpDmg);
      e.shield -= abs;
      actualShieldDmg = abs;
      hpDmg -= abs;
    }

    // W30 Boss6 first crossing of signature threshold (80% HP): TRUNCATE excess crossing damage & enter signature lock!
    if (e.kind === 'boss6' && !e.signatureTriggered && e.signatureThresholdHp > 0 && (e.hp - hpDmg) <= e.signatureThresholdHp) {
      const allowedHpDmg = Math.max(0, e.hp - e.signatureThresholdHp);
      const truncated = Math.max(0, hpDmg - allowedHpDmg);
      actualHpDmg = allowedHpDmg;
      e.hp = e.signatureThresholdHp;
      e.flash = 0.12;
      triggerW30BossSignature(e, truncated);
    } else {
      actualHpDmg = Math.min(e.hp, hpDmg);
      e.hp -= hpDmg;
      e.flash = 0.10;
      if (e.kind === 'boss6' && e.signatureTriggered && !e.signatureLockActive && !e.finalPhaseEntered && e.hp > 0 && e.hp <= e.finalThresholdHp) {
        enterW30BossFinalPhase(e);
      }
    }
  }

  const effectiveDmg = actualHpDmg + actualShieldDmg;
  if (effectiveDmg > 0) {
    game.stats.dmgTotal += effectiveDmg;
    if (opts.tower) opts.tower.dmgDealt = (opts.tower.dmgDealt || 0) + effectiveDmg;
    if (opts.skillKey && game.stats.skillDmg && opts.skillKey in game.stats.skillDmg) {
      game.stats.skillDmg[opts.skillKey] += effectiveDmg;
    }
  }

  // Zero Execution instant shatter kill on non-boss
  if (zeLv > 0 && e.hp > 0 && !e.boss && (e.freezeT > 0 || e.hp < e.maxHp * (zeLv >= 2 ? 0.30 : 0.20))) {
    e.hp = 0;
    addRing(e.x, e.y, '#8ef4ff', 1.1);
    addFloat(e.x, e.y - 0.5, '💠 绝对斩杀!', '#a8f8ff', true);
  }

  if (!wasSignatureLocked && (isCrit || effectiveDmg >= 28 || game.floats.length < 40)) {
    addFloat(e.x + (game.rnd()-0.5)*0.3, e.y - 0.3, isCrit ? `${effectiveDmg}!` : `${effectiveDmg}`, isCrit ? '#ffdf4d' : (opts.col || '#ffffff'), isCrit);
  }
  if (isCrit) {
    AudioKit.play('crit');
    if (perkLv('crit_surge') >= 2) {
      game.hero.dashCd = Math.max(0, game.hero.dashCd - 0.15);
      game.hero.ultCd = Math.max(0, game.hero.ultCd - 0.15);
    }
    if (syn.holy >= 4 && !opts.noHolyProc) {
      addRing(e.x, e.y, '#ffe478', 1.35);
      for (const o of game.enemies) {
        if (o.id !== e.id && o.hp > 0 && dist(o, e) <= 1.4) dealDamage(o, Math.round(dmg * 0.35), { col:'#ffe478', noHolyProc:true, skillKey:'perk' });
      }
    }
    // Thunder Arc (紫霄天引): crit calls extra chain lightning
    const taLv = perkLv('thunder_arc');
    if (taLv > 0 && !opts.noChainProc && game.rnd() < (taLv >= 2 ? 0.55 : 0.30)) {
      fireChainLightning(e, Math.round(dmg * 0.55), taLv >= 2 ? 5 : 3, {
        ox: e.x, oy: e.y - 2.6, noChainProc: true, isThunder: true, skillKey: 'perk', vuln: taLv >= 2
      });
    }
    // Flame Set 2pc/3pc: crit vs burning enemy erupts赤焰爆轰
    if (flameSet >= 2 && e.burnT > 0 && !opts.noFlameBlast) {
      const fRad = flameSet >= 3 ? 2.2 : 1.6;
      addRing(e.x, e.y, '#ff6a38', fRad);
      for (const o of game.enemies) {
        if (o.id !== e.id && o.hp > 0 && dist(o, e) <= fRad + o.r) {
          dealDamage(o, Math.max(8, Math.round(dmg * 0.45)), { col:'#ff884d', noFlameBlast:true, isFireExp:true, skillKey:'perk' });
        }
      }
    }
  }

  // Slow & Frost Tier-4 Freeze Shatter (BLOCKED if Unstoppable windup/leap/charge; ALLOWED during Boss6 signature lock!)
  const appliedSlow = Math.max(opts.slow || 0, (opts.fromHero && !opts.noFrostShieldProc) ? (gm.slowOnHit || 0) : 0);
  if (appliedSlow > 0) {
    if (isEnemyUnstoppable(e)) {
      if ((e.unstopFloatCd || 0) <= 0) {
        e.unstopFloatCd = 0.85;
        addFloat(e.x, e.y - 0.55, '🛡️霸体!', '#ffcc4d', true);
      }
    } else {
      const hadSlowBefore = (e.slowT || 0) > 0;
      e.slow = Math.max(e.slow, appliedSlow);
      e.slowT = Math.max(e.slowT, opts.slowDur || 2.4);
      if (!hadSlowBefore && game?.stats) {
        game.stats.frostSlowsApplied = (game.stats.frostSlowsApplied || 0) + 1;
      }
      if (e.kind === 'boss6' && e.signatureLockActive && game?.w30Battle?.signatureStatusHitsDuringLock) {
        game.w30Battle.signatureStatusHitsDuringLock.frostSlows++;
      }
      if (syn.frost >= 4 && !e.boss && e.freezeT <= 0 && game.rnd() < 0.25) {
        e.freezeT = 1.5 * (perkLv('frost_shatter') >= 2 ? 1.5 : 1);
        addRing(e.x, e.y, '#a4f4ff', 0.9);
        e.hp -= 60;
        addFloat(e.x, e.y - 0.55, '碎冰 -60', '#96f2ff', true);
      }
    }
  }
  if (opts.vuln) e.vulnT = Math.max(e.vulnT || 0, 3.0);
  if (opts.burn > 0) {
    e.burnDps = Math.max(e.burnDps, opts.burn);
    e.burnT = Math.max(e.burnT, 3.0);
  }

  if (opts.applyFireMarkOnHit && e.hp > 0) {
    applyFireMark(e, 1, 'w20_fire_ember_barrage', 4.5);
  }
  if (opts.fromHero && e.hp > 0 && (game.hero.w20TacticalReadyT || 0) > 0 && hasW20Enhancement('w20_shared_tactical_surge')) {
    game.hero.w20TacticalReadyT = 0;
    recordW20Proc('enhancement');
    applyFireMark(e, 1, 'w20_shared_tactical_surge', 4.8);
    applyFrostSlow(e, 0.50, 3.0, 'w20_shared_tactical_surge');
    addFloat(e.x, e.y - 0.75, '⚡战技连携!', '#ffe680', true);
    if (hasW20Direction('fire_chain_surge') || gearSyn.hasFireDuo || gearSyn.hasFireTrio) {
      triggerFireDetonation(e, 1.15, { radius: 1.9, skillKey: opts.skillKey || 'firewave' });
    } else {
      gainFrostShield(20, { duration: 4.5, source: 'w20_shared_tactical_surge' });
    }
  }

  // Stage 2: Independent Fire Brand affix + Fire Detonation Duo / Complete Trio Synergy
  // Trio STRICTLY replaces Duo (never triggers both on the same hit!)
  if (!opts.noFireDetonate && opts.skillKey !== 'perk' && (opts.fromHero || opts.tower || isFireHit)) {
    const sc = BALANCE.equipment?.synergyCombat || {};
    if (hadFireMarkBeforeHit && (gearSyn.hasFireTrio || gearSyn.hasFireDuo) && (e.fireDetonateCd || 0) <= 0) {
      if (gearSyn.hasFireTrio) {
        if (game.stats) game.stats.gearFireTrioProcs = (game.stats.gearFireTrioProcs || 0) + 1;
        triggerFireDetonation(e, sc.fireTrioDetonateMult || 1.25, {
          radius: sc.fireTrioRadius || 2.05,
          skillKey: opts.skillKey || 'firewave'
        });
      } else if (gearSyn.hasFireDuo) {
        if (game.stats) game.stats.gearFireDuoProcs = (game.stats.gearFireDuoProcs || 0) + 1;
        triggerFireDetonation(e, sc.fireDuoDetonateMult || 1.15, {
          radius: sc.fireDuoRadius || 1.85,
          skillKey: opts.skillKey || 'firewave',
          skipTrioChain: true
        });
      }
    } else if (e.hp > 0 && !hadFireMarkBeforeHit) {
      const shouldMark = (gearSyn.hasFireTrio || gearSyn.hasFireDuo)
        ? (isFireHit || opts.fromHero)
        : (gm.fireMarkChance > 0 && (isFireHit || opts.fromHero) && game.rnd() < gm.fireMarkChance);
      if (shouldMark) {
        applyFireMark(e, 1, 'gear_affix', 4.8);
      }
    }
  }

  // Stage 2: Frost Aegis Duo / Complete Trio Synergy (Trio STRICTLY replaces Duo!)
  if (!opts.noFrostShieldProc && opts.skillKey !== 'perk' && (e.slowT > 0 || e.freezeT > 0) && (gearSyn.hasFrostTrio || gearSyn.hasFrostDuo)) {
    if ((game.hero.gearFrostShieldCd || 0) <= 0) {
      const sc = BALANCE.equipment?.synergyCombat || {};
      if (gearSyn.hasFrostTrio) {
        game.hero.gearFrostShieldCd = sc.frostTrioShieldCd || 0.40;
        if (game.stats) game.stats.gearFrostTrioProcs = (game.stats.gearFrostTrioProcs || 0) + 1;
        gainFrostShield(sc.frostTrioShieldGain || 18, {
          duration: 5.0,
          maxShield: sc.frostTrioShieldCap || 115,
          source: 'gear_frost_trio'
        });
      } else if (gearSyn.hasFrostDuo) {
        game.hero.gearFrostShieldCd = sc.frostDuoShieldCd || 0.45;
        if (game.stats) game.stats.gearFrostDuoProcs = (game.stats.gearFrostDuoProcs || 0) + 1;
        gainFrostShield(sc.frostDuoShieldGain || 14, {
          duration: 4.5,
          maxShield: sc.frostDuoShieldCap || 95,
          source: 'gear_frost_duo',
          noFullShieldPulse: !hasW20Enhancement('w20_frost_overflow_nova')
        });
      }
    }
  }

  // Dual Resonance: Wind+Fire & Frost+Thunder procs
  if ((opts.isWind || opts.tower?.elem === 'wind') && hasDualRes('wind_fire')) {
    e.burnDps = Math.max(e.burnDps, 14);
    e.burnT = Math.max(e.burnT, 3.0);
    if (!opts.fromWindRes && e.hp > 0 && game.rnd() < 0.35) {
      dealDamage(e, Math.max(5, Math.round(dmg * 0.30)), { col:'#ff9a52', fromWindRes:true, isFireExp:true, skillKey:'perk' });
    }
  }
  if (opts.isThunder && hasDualRes('frost_thunder') && (e.slowT > 0 || e.freezeT > 0) && !opts.fromDualFrost && e.hp > 0) {
    addRing(e.x, e.y, '#9ce4ff', 1.65);
    e.vulnT = Math.max(e.vulnT || 0, 3.0);
    for (const o of game.enemies) {
      if (o.hp > 0 && dist(o, e) <= 1.65 + o.r) {
        dealDamage(o, Math.max(6, Math.round(dmg * 0.35)), { col:'#9ce4ff', fromDualFrost:true, skillKey:'perk' });
      }
    }
  }
  // Frost Set 2pc/3pc: chance to form +10 icy shield on chilled enemy
  if (frostSet >= 2 && (e.slowT > 0 || e.freezeT > 0) && opts.skillKey !== 'perk' && game.rnd() < (frostSet >= 3 ? 0.35 : 0.22)) {
    gainFrostShield(10, 4.0, 60);
  }

  // Capped Damage-Based Lifesteal: STRICTLY based on actual HP damage dealt (0 during W30 Boss signature lock!)
  if (!wasSignatureLocked && actualHpDmg > 0) {
    if (dcHealPending) applyHeroLifesteal(3);
    if (opts.lifesteal > 0) {
      applyHeroLifesteal(opts.lifesteal * 0.50);
    }
  }

  // On-hit Volt Crest / Thunder Spark affix chain proc
  const chainChance = Math.max(opts.chainProc || 0, (opts.fromHero && !opts.noChainProc) ? (gm.chainProc || 0) : 0);
  if (chainChance > 0 && !opts.noChainProc && game.rnd() < chainChance) {
    fireChainLightning(e, Math.round(dmg * 0.55), 3, { tower: opts.tower, noChainProc: true, isThunder: true });
  }

  // Hero active hits trigger: Unique Seal Imbuement + Sword Rain perk
  if (opts.fromHero) {
    triggerSealOnHeroHit(e);
    const srLv = perkLv('sword_rain');
    if (srLv > 0) {
      game.hero.swordRainHits++;
      const req = srLv >= 2 ? 4 : 6;
      if (game.hero.swordRainHits >= req) {
        game.hero.swordRainHits = 0;
        const alive = game.enemies.filter(o => o.hp > 0);
        const tgt = alive.sort((a,b) => ((b.boss||b.elite?1:0)-(a.boss||a.elite?1:0)) || dist(game.hero,a)-dist(game.hero,b))[0] || e;
        const cnt = srLv >= 2 ? 5 : 3;
        const hs = getHeroStats();
        for (let i = 0; i < cnt; i++) {
          const ang = Math.atan2(tgt.y - game.hero.y, tgt.x - game.hero.x) + (i - (cnt-1)/2) * 0.14;
          pushProjectile({
            kind:'arrow', x: game.hero.x, y: game.hero.y,
            vx: Math.cos(ang)*18, vy: Math.sin(ang)*18, life: 0.65, r: 0.3,
            pierce: 3, hitSet: new Set(), dmg: Math.round(34 * hs.dmgMult), splash: 0,
            opts: { fromHero:false, skillKey:'perk', critChance:hs.crit, critDmg:hs.critDmg, col:'#ffe688' }
          });
        }
        addFloat(game.hero.x, game.hero.y - 0.6, '🌠 天剑降临!', '#ffe896');
      }
    }
  }

  if (e.hp <= 0) onEnemyKilled(e, opts);
  return effectiveDmg;
}

function onEnemyKilled(e, opts){
  if (!e || e._killed) return;
  e._killed = true;
  game.stats.kills++;
  if (e.boss) game.stats.bossKills = (game.stats.bossKills || 0) + 1;
  if (opts.tower) opts.tower.kills = (opts.tower.kills || 0) + 1;
  const gm = aggregateGear(game?.hero?.gear || []);
  const affixGold = (gm.bonusGoldChance > 0 && game.rnd() < gm.bonusGoldChance) ? 1 : 0;
  const bonusGold = (opts.bonusGold || 0) + affixGold;
  const baseGold = (e.elite || e.boss || e.gold >= 2) ? e.gold : (game.rnd() < BALANCE.economy.singleGoldDropChance ? e.gold : 0);
  const killGold = baseGold + bonusGold;
  if (killGold > 0) changeGold(killGold, e.boss ? 'kill_boss' : e.elite ? 'kill_elite' : 'kill_enemy');

  if (gm.burnKillHeal > 0 && (e.burnT > 0 || e.fireMarkT > 0)) {
    applyHeroLifesteal(gm.burnKillHeal);
  }

  // Stage 3: W20 Boss Shield Totem destroyed -> shatter Boss shield & apply 3s vulnerability!
  if (e.totem) {
    if (game.stats) game.stats.w20TotemsDestroyed = (game.stats.w20TotemsDestroyed || 0) + 1;
    const ownerBoss = game.enemies.find(o => o.hp > 0 && (o.id === e.totemBossId || o.kind === 'boss4'));
    addRing(e.x, e.y, '#7cf2ff', 2.4);
    if (ownerBoss) {
      ownerBoss.shield = 0;
      ownerBoss.vulnT = Math.max(ownerBoss.vulnT || 0, 3.0);
      addRing(ownerBoss.x, ownerBoss.y, '#ffe678', 2.6);
      addFloat(ownerBoss.x, ownerBoss.y - 0.85, '💥 图腾击碎 · 首领破盾易伤!', '#ffe678', true);
    }
    AudioKit.play('crit', 1.2);
    return;
  }

  // Stage 5: W30 Abyss Pillar destroyed -> shatter boss6 shield, apply 3.5s vuln & drop healing spirit orb!
  if (e.pillar) {
    const ownerBoss = game.enemies.find(o => o.hp > 0 && (o.id === e.pillarBossId || o.kind === 'boss6'));
    addRing(e.x, e.y, '#ff88dc', 2.6);
    if (ownerBoss) {
      ownerBoss.shield = 0;
      ownerBoss.vulnT = Math.max(ownerBoss.vulnT || 0, 3.5);
      addRing(ownerBoss.x, ownerBoss.y, '#ffe678', 2.8);
      addFloat(ownerBoss.x, ownerBoss.y - 0.9, '💥 晶柱击破 · 主宰易伤 3.5s!', '#ffe678', true);
    }
    spawnHealOrb(e.x, e.y);
    AudioKit.play('crit', 1.2);
    return;
  }

  // Stage 5: W30 Void Guard slain -> guaranteed healing spirit orb drop!
  if (e.voidGuard) {
    spawnHealOrb(e.x, e.y);
  }

  // Material drops for v0.60 equipment & crafting loop (scales up in W21-W29 endgame refinement!)
  if (e.boss || e.elite) {
    const matDrop = getEnemyMaterialDrop(e, game.wave);
    if (matDrop > 0) changeMaterials(matDrop, e.boss ? 'drop_boss_materials' : 'drop_elite_materials');
  }

  // Stage 5: Depleting W30 Final Boss (boss6) HP bar in Final Phase triggers IMMEDIATE 3D Victory Settlement!
  if (e.kind === 'boss6' && game.wave === MAIN_WAVES && game.phase === 'wave') {
    for (const qItem of game.waveQueue) qItem.spawned = true;
    game.enemies = [];
    game.projectiles = [];
    game.zones = [];
    game.healOrbs = [];
    completeWaveClear();
    return;
  }

  if ((e.elite || e.boss) && gearSetTier('blood') >= 2 && (game.hero.bloodKills || 0) < 10) {
    game.hero.bloodKills++;
    game.hero.baseMaxHp += 12;
    syncHeroMaxHp();
    addFloat(game.hero.x, game.hero.y - 0.7, `🩸血煞吞噬(${game.hero.bloodKills}/10)`, '#ff6e88', true);
  }

  // Ult Engine (燃魂超载): kills shorten Overdrive CD
  const ueLv = perkLv('ult_engine');
  if (ueLv > 0) {
    game.hero.ultKillCounter++;
    const need = ueLv >= 2 ? 15 : 25;
    if (game.hero.ultKillCounter >= need) {
      game.hero.ultKillCounter = 0;
      game.hero.ultCd = Math.max(0, game.hero.ultCd - (ueLv >= 2 ? 4 : 3));
    }
  }

  // Bomber enemy (煞灵毒虫) death bomb -> poison puddle!
  if (e.bomber) {
    game.zones.push({
      kind:'poisonBomb', x:e.x, y:e.y, r:1.55, t:0.75, max:0.75, dmg: Math.round(e.dmg * 1.35),
      sourceMeta: { attackerName: e.name || '煞毒自爆虫', attackerKind: e.kind, skillName: '亡语剧毒自爆', isBoss: false, isBossCore: false, isBossAux: false }
    });
  }

  // Fire Tier-4 Corpse Explosion + Fire Nova perk (焚天余烬) + Fire Sub-Seal burn explosion
  const fnLv = perkLv('fire_nova');
  const fireSub = getSubSeal('fire');
  if ((getSynergyTier('fire') >= 2 || ((fnLv > 0 || fireSub) && e.burnT > 0)) && !opts.fromCorpse) {
    const pct = fnLv >= 2 ? 0.25 : getSynergyTier('fire') >= 2 ? 0.18 : fnLv === 1 ? 0.15 : 0.12;
    const rad = fnLv >= 2 ? 2.4 : 1.75;
    const expDmg = Math.max(22, Math.round(e.maxHp * pct));
    addRing(e.x, e.y, '#ff6d38', rad);
    for (const o of game.enemies) {
      if (o.id !== e.id && o.hp > 0 && dist(o, e) <= rad) {
        dealDamage(o, expDmg, { col:'#ff884d', fromCorpse:true, skillKey:'perk', burn: fnLv >= 2 ? 16 : 0 });
      }
    }
  }

  // Frost Shatter perk (玄冰碎甲): chilled/frozen death bursts piercing ice shards
  const fsLv = perkLv('frost_shatter');
  if (fsLv > 0 && (e.slowT > 0 || e.freezeT > 0)) {
    const cnt = fsLv >= 2 ? 7 : 4;
    const hs = getHeroStats();
    for (let i = 0; i < cnt; i++) {
      const ang = (Math.PI * 2 * i) / cnt;
      pushProjectile({
        kind:'arrow', x: e.x, y: e.y, vx: Math.cos(ang)*13, vy: Math.sin(ang)*13,
        life: 0.35, r: 0.25, pierce: 2, hitSet: new Set([e.id]),
        dmg: Math.round(24 * hs.dmgMult), splash: 0,
        opts: { fromHero:false, skillKey:'perk', col:'#8cf2ff', slow: 0.35, slowDur: 1.8 }
      });
    }
  }

  // Drop XP Gem
  game.gems.push({
    x: e.x + (game.rnd()-0.5)*0.25,
    y: e.y + (game.rnd()-0.5)*0.25,
    xp: e.xp, big: e.elite || e.boss,
    vx: (game.rnd()-0.5)*1.8, vy: (game.rnd()-0.5)*1.8, t: 0
  });
  // Dao Fortune perk: Elite/Boss drops an extra big XP orb
  if (perkLv('dao_fortune') >= 1 && (e.elite || e.boss)) {
    game.gems.push({ x: e.x + 0.35, y: e.y - 0.25, xp: 28, big: true, vx: 1.2, vy: -1.0, t: 0 });
  }

  // Blood Shrine Boss Reward (Chapter-capped chest + 25 gold + materials scaled in W21+)
  if (e.isShrineBoss) {
    game.stats.elites++;
    if (game.shrine) game.shrine.cleared = true;
    if (game.curWaveTel) game.curWaveTel.shrineCleared = true;
    const shrineMats = getEnemyMaterialDrop(e, game.wave);
    changeGold(25, 'shrine_clear');
    if (shrineMats > 0) changeMaterials(shrineMats, 'shrine_clear');
    if (hasMetaAux('aux_shrine_compass') && game.hero) {
      const healAmt = Math.round(game.hero.maxHp * 0.20);
      game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + healAmt);
      addFloat(game.hero.x, game.hero.y - 0.65, `🩸 妖碑寻踪 +${healAmt}血`, '#72f2b4', true);
    }
    game.chests.push({ x: e.x, y: e.y, legend: game.wave >= 12, shrineTier: true, bob: 0 });
    addRing(e.x, e.y, '#ff4d6d', 2.8);
    showBanner('🩸 血煞妖王已伏诛！', `掉落章节血碑宝箱 + 25 金币 + ${shrineMats} 锻材！`, 'good');
    AudioKit.play('chest', 1.2);
    game.shake = Math.max(game.shake, 8);
    return;
  }

  // Drop Equipment Chest: Boss always drops Legend Chest; 1st Elite per wave guaranteed, 2nd Elite 25% chance
  if (e.boss || e.elite) {
    game.stats.elites++;
    const dropChest = e.boss || !game.eliteChestDropped || (e.elite && game.rnd() < 0.25);
    if (dropChest) {
      if (e.elite) game.eliteChestDropped = true;
      game.chests.push({ x: e.x, y: e.y, legend: !!e.boss, bob: 0 });
      addRing(e.x, e.y, '#ffe478', 2.2);
      addFloat(e.x, e.y - 0.5, e.boss ? '👑 传说宝箱掉落！' : '📦 构装宝箱掉落！', '#ffe478', true);
      AudioKit.play('chest');
      game.shake = Math.max(game.shake, e.boss ? 10 : 5);
    } else {
      changeGold(14, 'elite_bounty');
      addFloat(e.x, e.y - 0.5, '💰 精英赏金 +14', '#ffe478', true);
      AudioKit.play('coin', 1.1);
    }
  }
}

function fireChainLightning(startEnemy, dmg, maxTargets, opts = {}){
  const visited = new Set([startEnemy.id]);
  let cur = startEnemy;
  const thSet = gearSetTier('thunder');
  const totalTargets = maxTargets + (thSet >= 3 ? 1 : 0);
  const jumpMult = thSet >= 2 ? 1.12 : 0.88;
  const pts = [{ x: opts.ox ?? startEnemy.x, y: opts.oy ?? startEnemy.y }, { x: startEnemy.x, y: startEnemy.y }];
  dealDamage(cur, dmg, { ...opts, col:'#d8a6ff', noChainProc:true, isThunder:true });

  const thunderMetaRadius = getActiveMetaMain()?.id === 'main_thunder' ? Number(getActiveMetaMain()?.effects?.thunderChainRadiusBonus || 0.6) : 0;
  let curDmg = dmg;
  for (let i = 1; i < totalTargets; i++) {
    let best = null, bestD = 2.8 + thunderMetaRadius;
    for (const e of game.enemies) {
      if (e.hp <= 0 || visited.has(e.id)) continue;
      const d = dist(cur, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) break;
    visited.add(best.id);
    pts.push({ x: best.x, y: best.y });
    curDmg = Math.max(1, Math.round(curDmg * jumpMult));
    dealDamage(best, curDmg, { ...opts, col:'#d8a6ff', noChainProc:true, isThunder:true });
    cur = best;
  }
  game.bolts.push({ pts, t: 0.24, max: 0.24, col: opts.col || '#cf96ff', comboThunderFire: !!opts.comboThunderFire });
  AudioKit.play('thunder');
}

/* ==================== HERO SKILLS (SMART TARGETING + SPIRIT SWORD + COMBOS) ==================== */
function executeBreakerShockwave(cx, cy, radius, dmgMult, isAftershock = false){
  const hs = getHeroStats();
  const baseDmg = Math.round(46 * hs.skillDmgMult * dmgMult);
  addRing(cx, cy, isAftershock ? '#ffe478' : '#d89eff', radius);
  addFloat(cx, cy - 0.75, isAftershock ? '⚡破阵二段震!' : '⚡破阵蓄势!', '#e6b8ff', true);
  let hitCnt = 0;
  let hitSlowed = false;
  let hitEliteOrBoss = false;
  const stateRes = hasW20Enhancement('w20_brk_state_resonance');
  const eliteHunt = hasW20Enhancement('w20_brk_elite_hunter');
  for (const e of game.enemies) {
    if (e.hp <= 0 || dist(e, { x: cx, y: cy }) > radius + e.r) continue;
    hitCnt++;
    if (isAftershock && !e.boss && !isEnemyUnstoppable(e)) {
      const d = dist(e, { x: cx, y: cy });
      if (d > 0.4) {
        e.x = clamp(e.x + (cx - e.x) / d * 0.85, 0.8, W - 0.8);
        e.y = clamp(e.y + (cy - e.y) / d * 0.85, 0.8, H - 0.8);
      }
    }
    e.vulnT = Math.max(e.vulnT || 0, 3.0);
    if (stateRes) {
      applyFireMark(e, 1, 'w20_brk_state_resonance', 4.5);
      applyFrostSlow(e, 0.55, 3.0, 'w20_brk_state_resonance');
    }
    if ((e.slowT || 0) > 0 || (e.freezeT || 0) > 0) hitSlowed = true;
    if (e.boss || e.elite) hitEliteOrBoss = true;
    dealDamage(e, baseDmg, {
      fromHero: true, skillKey: 'dash', isThunder: true, critChance: hs.crit, critDmg: hs.critDmg,
      col: '#dfb3ff', lifesteal: hs.lifesteal, noFireDetonate: true, noFrostShieldProc: true
    });
    if (e.hp > 0 && (e.fireMarkT || 0) > 0) {
      triggerFireDetonation(e, 1.10, { radius: 1.85, skillKey: 'dash' });
    }
    if (eliteHunt && e.hp > 0 && (e.boss || e.elite || e.vulnT > 0)) {
      recordW20Proc('enhancement');
      fireChainLightning(e, Math.round(baseDmg * 0.9), 2, { ox: e.x, oy: e.y - 3.0, skillKey: 'dash', noChainProc: true });
    }
    if (hasW20Enhancement('w20_shared_boss_breaker') && e.hp > 0 && isIsolatedHighValueTarget(e, 3.2)) {
      recordW20Proc('enhancement');
      e.vulnT = Math.max(e.vulnT || 0, 3.5);
      dealDamage(e, Math.round(baseDmg * 0.65), { fromHero: false, skillKey: 'perk', col: '#ffe680', noFireDetonate: true });
    }
  }
  const be = BALANCE.w20Breakthrough?.baseEffects || {};
  if (hitSlowed || stateRes) {
    gainFrostShield(be.breakerDashShieldOnSlow || 22, { duration: 4.5, source: 'w20_breaker_dash' });
  }
  if (hasW20Enhancement('w20_brk_vanguard_aegis') && hitCnt > 0) {
    recordW20Proc('enhancement');
    gainFrostShield(hitCnt * 12, { duration: 4.8, source: 'w20_brk_vanguard_aegis' });
  }
  if (eliteHunt && hitEliteOrBoss && game.hero) {
    game.hero.dashCd = Math.max(0, (game.hero.dashCd || 0) - 1.0);
  }
  if (stateRes) recordW20Proc('enhancement');
  return hitCnt;
}

function castHeroDash(){
  if (paused || game.activeModal) return false;
  const h = game.hero;
  if (h.dashCd > 0) { toast(`烈焰冲刺冷却中 (${h.dashCd.toFixed(1)}s)`, true); return false; }
  if (game.curWaveTel) game.curWaveTel.dashCount++;
  const hadFrostShieldBeforeDash = h.shield > 0 && h.frostShieldActive;
  const hs = getHeroStats();
  if (pointerScreen) pointerWorld = screenToWorld(pointerScreen.x, pointerScreen.y);
  let dx = Number(keys.has('d')||keys.has('arrowright')) - Number(keys.has('a')||keys.has('arrowleft'));
  let dy = Number(keys.has('s')||keys.has('arrowdown')) - Number(keys.has('w')||keys.has('arrowup'));
  if (!dx && !dy) {
    if (pointerWorld) { dx = pointerWorld.x - h.x; dy = pointerWorld.y - h.y; }
    else { dx = h.face; dy = 0; }
  }
  const len = Math.max(0.01, Math.hypot(dx, dy));
  dx /= len; dy /= len;
  const ox = h.x, oy = h.y;
  const dashDist = 3.8;
  h.x = clamp(h.x + dx * dashDist, 1.2, W - 1.2);
  h.y = clamp(h.y + dy * dashDist, 1.2, H - 1.2);
  const dashCadenceAux = hasMetaAux('aux_dash_cadence');
  h.invuln = 0.6 + (dashCadenceAux ? 0.06 : 0);
  const prevDashShield = h.shield || 0;
  h.shield = Math.max(prevDashShield, 35);
  const dashShieldGain = Math.max(0, Math.round(h.shield - prevDashShield));
  if (dashShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + dashShieldGain;
  h.shieldTimer = Math.max(h.shieldTimer || 0, 3.5);
  const wgLv = perkLv('wind_gale');
  const be = BALANCE.w20Breakthrough?.baseEffects || {};
  let cdFactor = wgLv >= 2 ? 0.55 : wgLv === 1 ? 0.75 : 1.0;
  if (hasW20Direction('breaker_momentum')) cdFactor *= (be.breakerDashCdFactor || 0.80);
  if (hasW20Enhancement('w20_shared_tactical_surge')) {
    cdFactor *= 0.75;
    h.w20TacticalReadyT = 2.5;
  }
  const hasPhantomStride = hasDestinyEnhancement('destiny_phantom_stride');
  if (hasPhantomStride) {
    cdFactor *= 0.82;
    h.destinyDashBuffT = 2.2;
    recordDestinyProc('destiny_phantom_stride');
  }
  if (wgLv > 0) h.dashBuffT = 2.0;
  if (getActiveMetaMain()?.id === 'main_wind') {
    h.dashBuffT = Math.max(h.dashBuffT || 0, Number(getActiveMetaMain()?.effects?.dashGlideDuration || 1.4));
  }
  const baseDashCd = Math.max(2.6, 4.2 - (dashCadenceAux ? 0.35 : 0));
  h.dashCd = Math.max(1.0, (baseDashCd * cdFactor) / (1 + Math.max(0, hs.gm.aspd) * 0.6));

  const w20FireDash = hasW20Enhancement('w20_fire_dash_detonator');
  for (let s = 0; s < 3; s++) {
    const px = ox + (h.x - ox) * (s / 2);
    const py = oy + (h.y - oy) * (s / 2);
    addRing(px, py, hasPhantomStride ? '#9effea' : '#ff7b47', 1.45);
    for (const e of game.enemies) {
      if (e.hp > 0 && dist(e, {x:px,y:py}) <= 1.55) {
        if (w20FireDash) applyFireMark(e, 2, 'w20_fire_dash_detonator', 5.0);
        if (hasPhantomStride) {
          applyFireMark(e, 1, 'destiny_phantom_stride', 4.5);
          applyFrostSlow(e, 0.40, 2.8, 'destiny_phantom_stride');
        }
        dealDamage(e, Math.round(32 * hs.dmgMult), { fromHero:true, skillKey:'dash', critChance:hs.crit, critDmg:hs.critDmg, col:'#ff8e52', burn:12, lifesteal:hs.lifesteal });
      }
    }
  }
  // Stage 3 W20 [w20_fire_dash_detonator]: detonate all marked enemies within 3.2 tiles of dash landing
  if (w20FireDash) {
    let detonatedAny = false;
    for (const e of game.enemies) {
      if (e.hp > 0 && (e.fireMarkT || 0) > 0 && dist(e, h) <= 3.2 + e.r) {
        triggerFireDetonation(e, 1.15, { radius: 2.0, skillKey: 'dash' });
        detonatedAny = true;
      }
    }
    if (detonatedAny) recordW20Proc('enhancement');
  }
  // Stage 2 Frost Trio OR Stage 3 W20 Base [frost_bastion_counter]: active dash frost pulse when holding Frost Shield!
  const allowDashFrostPulse = hadFrostShieldBeforeDash && (getActiveGearAffixSynergies().hasFrostTrio || hasW20Direction('frost_bastion_counter'));
  if (allowDashFrostPulse && (h.frostActivePulseCd || 0) <= 0) {
    const sc = BALANCE.equipment?.synergyCombat || {};
    const pulseRad = hasW20Direction('frost_bastion_counter') ? Math.max(sc.frostTrioActivePulseRadius || 3.25, be.frostBasePulseRadius || 3.05) : (sc.frostTrioActivePulseRadius || 3.25);
    const pulseDmg = hasW20Direction('frost_bastion_counter') ? Math.max(sc.frostTrioActivePulseDmg || 46, be.frostBasePulseDmg || 46) : (sc.frostTrioActivePulseDmg || 46);
    triggerFrostPulse(pulseRad, pulseDmg, 1.0, 'dash_shield');
    if (hasW20Enhancement('w20_frost_dash_ring')) {
      recordW20Proc('enhancement');
      gainFrostShield(24, { duration: 5.0, source: 'w20_frost_dash_ring', noFullShieldPulse: true });
      game.zones.push({
        kind: 'frostTrail', w20Source: 'w20_frost_dash_ring', x: h.x, y: h.y, r: 2.25,
        t: 2.8, max: 2.8, tick: 0.45, dps: Math.round(32 * hs.skillDmgMult)
      });
    }
  }
  // Stage 3 W20 Base [breaker_momentum]: landing shockwave that shreds armor & triggers fire/frost state hooks!
  if (hasW20Direction('breaker_momentum')) {
    recordW20Proc('base');
    if (game.stats) game.stats.w20BreakerSlams = (game.stats.w20BreakerSlams || 0) + 1;
    const vanguardBoost = (hasW20Enhancement('w20_brk_vanguard_aegis') && h.shield > 0) ? 1.30 : 1.0;
    const brkRad = (be.breakerDashRadius || 2.9) * vanguardBoost;
    executeBreakerShockwave(h.x, h.y, brkRad, be.breakerDashDmgMult || 1.45, false);
    if (hasW20Enhancement('w20_brk_aftershock_dash')) {
      recordW20Proc('enhancement');
      h.w20AftershockQueue = h.w20AftershockQueue || [];
      h.w20AftershockQueue.push({ x: h.x, y: h.y, t: 0.45, r: 3.8, dmgMult: 1.25 });
    }
    if (hasW20Enhancement('w20_brk_tempest_step')) {
      recordW20Proc('enhancement');
      const baseAng = Math.atan2(dy, dx);
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.22;
        pushProjectile({
          kind: 'arrow', w20Source: 'w20_brk_tempest_step', x: h.x, y: h.y,
          vx: Math.cos(a) * 16.5, vy: Math.sin(a) * 16.5,
          life: 0.45, r: 0.34, pierce: 3, hitSet: new Set(),
          dmg: Math.round(38 * hs.skillDmgMult), splash: 0,
          opts: { fromHero: true, skillKey: 'dash', isWind: true, critChance: hs.crit, critDmg: hs.critDmg, col: '#9effdc' }
        });
      }
    }
    if (hasW20Enhancement('w20_shared_elemental_echo')) {
      h.w20EchoFrostCnt = (h.w20EchoFrostCnt || 0) + 1;
      if (h.w20EchoFrostCnt >= 2) {
        h.w20EchoFrostCnt = 0;
        triggerW20ElementalEcho();
      }
    }
  }
  // Sword Echo (剑影分身): dash unleashes 1 or 4 piercing sword waves!
  const seLv = perkLv('sword_echo');
  if (seLv > 0) {
    const baseAng = Math.atan2(dy, dx);
    const dirs = seLv >= 2 ? [0, Math.PI/2, Math.PI, -Math.PI/2] : [0];
    for (const off of dirs) {
      const a = baseAng + off;
      pushProjectile({
        kind:'firewave', x: h.x, y: h.y, vx: Math.cos(a)*12, vy: Math.sin(a)*12,
        life: 0.35 * hs.rangeMult, r: 0.52, pierce: 2, hitSet: new Set(),
        dmg: Math.round(36 * hs.skillDmgMult), critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
        isThunderFireCombo: hasCombo('thunder_fire')
      });
    }
  }
  // Thunder Set 2pc/3pc: Dash calls purple chain lightning at landing (and start at 3pc)
  const thSet = gearSetTier('thunder');
  if (thSet >= 2) {
    const aliveTh = game.enemies.filter(e => e.hp > 0);
    const strikeAt = (px, py, ch) => {
      const tgt = aliveTh.filter(e => e.hp > 0 && dist({x:px, y:py}, e) <= 5.0).sort((a,b) => dist({x:px,y:py},a) - dist({x:px,y:py},b))[0];
      if (tgt) fireChainLightning(tgt, Math.round(40 * hs.dmgMult), ch, { ox: px, oy: py, skillKey:'perk', critChance:hs.crit, critDmg:hs.critDmg });
    };
    strikeAt(h.x, h.y, thSet >= 3 ? 4 : 3);
    if (thSet >= 3) strikeAt(ox, oy, 4);
  }
  AudioKit.play('fire', 1.2);
  renderAllUI();
  return true;
}

function castHeroOverdrive(){
  if (paused || game.activeModal) return false;
  const h = game.hero;
  if (h.ultCd > 0) { toast(`全军超载冷却中 (${h.ultCd.toFixed(1)}s)`, true); return false; }
  if (game.curWaveTel) game.curWaveTel.ultCount++;
  h.ultTimer = perkLv('ult_engine') >= 2 ? 8.0 : 5.0;
  const hasOdNova = hasDestinyEnhancement('destiny_overdrive_nova');
  h.ultCd = hasOdNova ? Number((18.0 * 0.78).toFixed(2)) : 18.0;
  game.shake = 6;
  addRing(h.x, h.y, '#ffe478', 4.5);
  addFloat(h.x, h.y - 0.6, `⚡ 全军超载 ${h.ultTimer}s！攻速+80% 暴击+35%`, '#ffe878', true);
  if (hasOdNova) {
    recordDestinyProc('destiny_overdrive_nova');
    const hs = getHeroStats();
    const novaRad = 4.6;
    addRing(h.x, h.y, '#c89eff', novaRad);
    addFloat(h.x, h.y - 1.0, '🌠 天命·星陨超载!', '#e4c4ff', true);
    gainFrostShield(45, { duration: 6.0, source: 'destiny_overdrive_nova' });
    for (const e of game.enemies) {
      if (e.hp > 0 && dist(e, h) <= novaRad + e.r) {
        applyFireMark(e, 1, 'destiny_overdrive_nova', 5.0);
        applyFrostSlow(e, 0.50, 3.2, 'destiny_overdrive_nova');
        dealDamage(e, Math.round(78 * hs.skillDmgMult), {
          fromHero: true, skillKey: 'perk', critChance: hs.crit, critDmg: hs.critDmg, col: '#e4c4ff'
        });
      }
    }
  }
  AudioKit.play('merge', 1.15);
  renderAllUI();
  return true;
}

function pickAimTarget(alive, range = 99, preferPriority = false){
  const h = game.hero;
  const inRange = alive.filter(e => dist(h, e) <= range);
  if (!inRange.length) return null;
  if (preferPriority) {
    return inRange.slice().sort((a, b) => {
      const sa = (a.boss ? 1000 : a.elite ? 500 : a.shaman ? 300 : (a.bomber || a.ranged) ? 150 : 0) - dist(h, a) * 10;
      const sb = (b.boss ? 1000 : b.elite ? 500 : b.shaman ? 300 : (b.bomber || b.ranged) ? 150 : 0) - dist(h, b) * 10;
      return sb - sa;
    })[0];
  }
  if (pointerWorld && dist(h, pointerWorld) > 0.5) {
    const aimAng = Math.atan2(pointerWorld.y - h.y, pointerWorld.x - h.x);
    const inCone = inRange.filter(e => {
      let diff = Math.abs(Math.atan2(e.y - h.y, e.x - h.x) - aimAng);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      return diff <= 0.65;
    });
    if (inCone.length) return inCone.sort((a, b) => dist(h, a) - dist(h, b))[0];
  }
  return inRange.slice().sort((a, b) => dist(h, a) - dist(h, b))[0];
}

function updateHero(dt){
  const h = game.hero;
  const hs = getHeroStats();
  h.dashCd = Math.max(0, h.dashCd - dt);
  h.ultCd = Math.max(0, h.ultCd - dt);
  h.ultTimer = Math.max(0, h.ultTimer - dt);
  h.dashBuffT = Math.max(0, h.dashBuffT - dt);
  h.destinyDashBuffT = Math.max(0, (h.destinyDashBuffT || 0) - dt);
  h.destinyFrostMoveT = Math.max(0, (h.destinyFrostMoveT || 0) - dt);
  h.destinyEmberCd = Math.max(0, (h.destinyEmberCd || 0) - dt);
  h.destinyBreakerCd = Math.max(0, (h.destinyBreakerCd || 0) - dt);
  h.thornsCd = Math.max(0, h.thornsCd - dt);
  h.frostPulseCd = Math.max(0, (h.frostPulseCd || 0) - dt);
  h.frostActivePulseCd = Math.max(0, (h.frostActivePulseCd || 0) - dt);
  h.gearFrostShieldCd = Math.max(0, (h.gearFrostShieldCd || 0) - dt);
  h.w20TacticalReadyT = Math.max(0, (h.w20TacticalReadyT || 0) - dt);
  h.invuln = Math.max(0, h.invuln - dt);
  h.armorBreakT = Math.max(0, (h.armorBreakT || 0) - dt);
  h.leechTimer = (h.leechTimer || 0) + dt;
  if (h.leechTimer >= 1.0) { h.leechTimer -= 1.0; h.leechUsed = 0; }
  if (h.shieldTimer > 0) {
    h.shieldTimer = Math.max(0, h.shieldTimer - dt);
    if (h.shieldTimer === 0) { h.shield = 0; h.frostShieldActive = false; }
  }
  // Stage 4 Destiny Enhancement [destiny_aegis_bulwark]: auto-refresh 32 Frost Shield every 8s during wave!
  if (game.phase === 'wave' && hasDestinyEnhancement('destiny_aegis_bulwark')) {
    h.destinyBulwarkTimer = (h.destinyBulwarkTimer ?? 8.0) - dt;
    if (h.destinyBulwarkTimer <= 0) {
      h.destinyBulwarkTimer = 8.0;
      recordDestinyProc('destiny_aegis_bulwark');
      gainFrostShield(32, { duration: 5.5, source: 'destiny_aegis_bulwark' });
      addFloat(h.x, h.y - 0.75, '🛡️玄天金钟 +32盾', '#ffe484');
    }
  }
  // Process W20 delayed Breaker Aftershocks
  if (h.w20AftershockQueue?.length) {
    for (const q of h.w20AftershockQueue) {
      q.t -= dt;
      if (q.t <= 0) executeBreakerShockwave(q.x, q.y, q.r, q.dmgMult, true);
    }
    h.w20AftershockQueue = h.w20AftershockQueue.filter(q => q.t > 0);
  }
  // Stage 3 W20 Base [frost_bastion_counter]: while Frost Shield is up, periodic subtle chill aura sustains slows!
  if (game.phase === 'wave' && hasW20Direction('frost_bastion_counter') && h.shield > 0 && h.frostShieldActive) {
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    h.w20FrostAuraTimer = (h.w20FrostAuraTimer ?? (be.frostBaseAuraInterval || 1.6)) - dt;
    if (h.w20FrostAuraTimer <= 0) {
      h.w20FrostAuraTimer = be.frostBaseAuraInterval || 1.6;
      let chilled = false;
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(h, e) <= 3.4 + e.r) {
          applyFrostSlow(e, 0.45, 2.6, 'w20_frost_aura');
          chilled = true;
        }
      }
      if (chilled) {
        recordW20Proc('base');
        addRing(h.x, h.y, 'rgba(142,244,255,0.65)', 3.4);
      }
    }
  }

  if (pointerDown && pointerScreen) {
    pointerWorld = screenToWorld(pointerScreen.x, pointerScreen.y);
  }

  // Crowd slowdown (怪群挤压阻滞): being surrounded slows normal walking unless Dashing/Overdriving!
  let crowdCnt = 0;
  if (game.phase === 'wave' && h.ultTimer <= 0 && h.invuln <= 0) {
    for (const e of game.enemies) {
      if (e.hp > 0 && dist(e, h) <= 0.85 + e.r) crowdCnt++;
    }
  }
  const crowdMult = crowdCnt > 0 ? Math.max(0.55, 1 - crowdCnt * 0.11) : 1.0;

  // Movement (WASD / Arrows / Hold-pointer) across open 64x48 world
  const prevX = h.x, prevY = h.y;
  const spd = hs.moveSpd * crowdMult;
  let dx = Number(keys.has('d')||keys.has('arrowright')) - Number(keys.has('a')||keys.has('arrowleft'));
  let dy = Number(keys.has('s')||keys.has('arrowdown')) - Number(keys.has('w')||keys.has('arrowup'));
  if (dx || dy) {
    h.goal = null;
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    if (dx) h.face = dx < 0 ? -1 : 1;
    h.x = clamp(h.x + dx * spd * dt, 1.2, W - 1.2);
    h.y = clamp(h.y + dy * spd * dt, 1.2, H - 1.2);
    h.moving = true;
  } else if (pointerDown && pointerWorld && !game.mode) {
    const d = dist(h, pointerWorld);
    if (d > 0.25) {
      const mx = (pointerWorld.x - h.x) / d, my = (pointerWorld.y - h.y) / d;
      if (Math.abs(mx) > 0.05) h.face = mx < 0 ? -1 : 1;
      h.x = clamp(h.x + mx * spd * dt, 1.2, W - 1.2);
      h.y = clamp(h.y + my * spd * dt, 1.2, H - 1.2);
      h.moving = true;
    } else h.moving = false;
  } else if (h.goal) {
    const d = dist(h, h.goal);
    if (d <= 0.22) { h.goal = null; h.moving = false; }
    else {
      const mx = (h.goal.x - h.x) / d, my = (h.goal.y - h.y) / d;
      if (Math.abs(mx) > 0.05) h.face = mx < 0 ? -1 : 1;
      h.x = clamp(h.x + mx * spd * dt, 1.2, W - 1.2);
      h.y = clamp(h.y + my * spd * dt, 1.2, H - 1.2);
      h.moving = true;
    }
  } else {
    h.moving = false;
  }
  if (game.curWaveTel && game.phase === 'wave') {
    game.curWaveTel.moveDist += Math.hypot(h.x - prevX, h.y - prevY);
  }

  // Only fire combat skills when enemies exist AND starter skill has been picked!
  if (game.phase !== 'wave') return;
  const alive = game.enemies.filter(e => e.hp > 0);
  if (!alive.length) return;
  const hasAnySkill = Object.values(h.skills).some(v => v > 0);
  if (!hasAnySkill) return;

  // 0. Innate Spirit Sword Trigger (本命御剑引子: NEVER fires at thin air when no enemy is in range!)
  h.skillTimers.spirit = Math.max(0, (h.skillTimers.spirit ?? 0) - dt * hs.aspd);
  if (h.skillTimers.spirit <= 0) {
    const tgt = pickAimTarget(alive, 4.5 * hs.rangeMult, false);
    if (tgt) {
      h.skillTimers.spirit = 0.95 * hs.skillCdMult;
      const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
      pushProjectile({
        kind: 'arrow', x: h.x, y: h.y, vx: Math.cos(ang) * 15.5, vy: Math.sin(ang) * 15.5,
        life: 0.30 * hs.rangeMult, r: 0.28, pierce: 1, hitSet: new Set(),
        dmg: Math.round(14 * hs.dmgMult), splash: 0,
        opts: { fromHero:true, skillKey:'spirit', critChance:hs.crit, critDmg:hs.critDmg, col:'#9fffe0', lifesteal:hs.lifesteal, bonusGold:hs.gm.bonusGold }
      });
    }
  }

  // Sword Set 2pc/3pc: firing bonus cloud swords while moving if enemies near
  const swordSet = gearSetTier('sword');
  if (swordSet >= 2 && h.moving) {
    h.swordSetTimer = Math.max(0, (h.swordSetTimer ?? 1.2) - dt * hs.aspd);
    if (h.swordSetTimer <= 0) {
      const tgt = pickAimTarget(alive, 6.0 * hs.rangeMult, false);
      if (tgt) {
        h.swordSetTimer = 1.60;
        const cnt = swordSet >= 3 ? 3 : 2;
        const baseAng = Math.atan2(tgt.y - h.y, tgt.x - h.x);
        for (let i = 0; i < cnt; i++) {
          const ang = baseAng + (i - (cnt - 1) / 2) * 0.18;
          pushProjectile({
            kind: 'arrow', x: h.x, y: h.y, vx: Math.cos(ang) * 16.5, vy: Math.sin(ang) * 16.5,
            life: 0.42 * hs.rangeMult, r: 0.26, pierce: 2, hitSet: new Set(),
            dmg: Math.round(22 * hs.dmgMult), splash: 0,
            opts: { fromHero:false, skillKey:'perk', isWind:true, critChance:hs.crit, critDmg:hs.critDmg, col:'#72f2b4', slow: swordSet >= 3 ? 0.25 : 0, slowDur: 1.6 }
          });
        }
      }
    }
  }

  // Frost Domain perk (凛冬领域): passive chilly aura around Hero
  const fdLv = perkLv('frost_domain');
  if (fdLv > 0) {
    h.frostDomainTick -= dt;
    if (h.frostDomainTick <= 0) {
      h.frostDomainTick = 0.45;
      const rad = fdLv >= 2 ? 4.5 : 3.2;
      for (const e of alive) {
        if (dist(h, e) <= rad + e.r) {
          dealDamage(e, Math.round((fdLv >= 2 ? 18 : 11) * hs.dmgMult), {
            fromHero:false, skillKey:'perk', col:'#8cf2ff', slow: fdLv >= 2 ? 0.50 : 0.35, slowDur: 1.0
          });
        }
      }
    }
  }

  // 1. Orbiting Blades (旋风飞刃) + W10 Branch Mechanics + Combo: 冰刃风暴 / 万剑诀
  const bLv = h.skills.blades || 0;
  if (bLv > 0) {
    const blBranch = h.w10Branch?.blades || null;
    const seMult = perkLv('sword_echo') >= 2 ? 1.65 : perkLv('sword_echo') === 1 ? 1.35 : 1.0;
    h.bladeAngle += dt * (4.2 + bLv * 0.55) * seMult * (1 + (hs.aspd - 1) * 0.35);
    const count = bLv + 1;
    let baseOrbitR = (1.65 + bLv * 0.10) * hs.skillRangeMult;
    if (blBranch === 'bl_expanding_storm') {
      const waveSin = Math.sin(game.waveClock * 3.2);
      baseOrbitR *= (1.10 + 0.35 * waveSin);
    }
    const rings = blBranch === 'bl_twin_orbit'
      ? [{ r: baseOrbitR * 0.72, dir: -1.25, tag: 'inner' }, { r: baseOrbitR * 1.24, dir: 1.0, tag: 'outer' }]
      : [{ r: baseOrbitR, dir: 1.0, tag: 'main' }];
    const now = game.waveClock;
    const hasIceBlades = hasCombo('ice_blades');
    for (const ring of rings) {
      for (let i = 0; i < count; i++) {
        const ang = h.bladeAngle * ring.dir + (Math.PI * 2 * i) / count;
        const bx = h.x + Math.cos(ang) * ring.r;
        const by = h.y + Math.sin(ang) * ring.r;
        for (const e of alive) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - bx, e.y - by) <= 0.55 + e.r) {
            const hitKey = ring.tag === 'inner' ? `in_${e.id}` : e.id;
            const lastHit = h.bladeHitMap.get(hitKey) || -9;
            if (now - lastHit >= 0.32) {
              h.bladeHitMap.set(hitKey, now);
              const wasChilled = e.slowT > 0 || e.freezeT > 0;
              dealDamage(e, Math.round((15 + bLv * 7) * hs.skillDmgMult), {
                fromHero:true, skillKey:'blades',
                critChance: hs.crit, critDmg: hs.critDmg,
                col: blBranch === 'bl_crimson_wheel' ? '#ff8a52' : '#8cf2ff',
                lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                burn: blBranch === 'bl_crimson_wheel' ? 18 : 0,
                slow: hasIceBlades ? 0.35 : hs.gm.slowOnHit, slowDur: hasIceBlades ? 2.0 : 2.2
              });
              if (blBranch === 'bl_crimson_wheel' && e.hp > 0) {
                applyFireMark(e, 1, 'bl_crimson_wheel', 4.5);
                if (e.fireMarkStacks >= 2) triggerFireDetonation(e, 1.15, 1.75, 'blades');
              } else if (blBranch === 'bl_frost_shuriken') {
                if (e.hp > 0) applyFrostSlow(e, 0.50, 2.5, 'bl_frost_shuriken');
                h.bladeOrbitTicks = (h.bladeOrbitTicks || 0) + 1;
                if (h.bladeOrbitTicks % 3 === 0) {
                  gainFrostShield(10, 4.0, 80);
                  pushProjectile({
                    kind: 'arrow', w10Branch: 'bl_frost_shuriken', x: bx, y: by,
                    vx: Math.cos(ang) * 14, vy: Math.sin(ang) * 14,
                    life: 0.45 * hs.skillRangeMult, r: 0.35, pierce: 3, hitSet: new Set(),
                    dmg: Math.round((18 + bLv * 8) * hs.skillDmgMult), splash: 0,
                    opts: { fromHero:true, skillKey:'blades', critChance:hs.crit, critDmg:hs.critDmg, col:'#96f2ff', slow:0.45, slowDur:2.4 }
                  });
                }
              } else if (blBranch === 'bl_twin_orbit') {
                if (e.hp > 0) applyFrostSlow(e, 0.40, 2.2, 'bl_twin_orbit');
                gainFrostShield(6, 3.5, 75);
              } else if (blBranch === 'bl_expanding_storm') {
                if (e.hp > 0) applyFrostSlow(e, 0.45, 2.4, 'bl_expanding_storm');
                gainFrostShield(8, 3.8, 80);
              }
              if (hasIceBlades && wasChilled && e.hp > 0) {
                const lastShatter = h.shatterCdMap.get(e.id) || -9;
                if (now - lastShatter >= 0.65) {
                  h.shatterCdMap.set(e.id, now);
                  const shatter = Math.min(140, Math.max(14, Math.round(e.maxHp * 0.08)));
                  addRing(e.x, e.y, '#9cf6ff', 1.25);
                  addFloat(e.x, e.y - 0.5, '❄️冰刃碎甲!', '#aef8ff', true);
                  dealDamage(e, shatter, { fromHero:false, skillKey:'combo', col:'#aef8ff' });
                }
              }
            }
          }
        }
      }
    }
    // Combo: 万剑诀 (no-whiff guard: requires at least 1 enemy within 4.6 cells!)
    if (hasCombo('wanjian')) {
      h.wanjianTimer = Math.max(0, h.wanjianTimer - dt);
      if (h.wanjianTimer <= 0 && alive.some(e => dist(h, e) <= 4.6 * hs.skillRangeMult)) {
        h.wanjianTimer = 2.4;
        const fwLv = h.skills.firewave || 1;
        const dmg = Math.round((26 + fwLv * 13) * hs.skillDmgMult * 0.60);
        addRing(h.x, h.y, '#ffe478', 2.4);
        addFloat(h.x, h.y - 0.75, '⚔️万剑齐发!', '#ffe878', true);
        for (let i = 0; i < count; i++) {
          const ang = h.bladeAngle + (Math.PI * 2 * i) / count;
          const bx = h.x + Math.cos(ang) * baseOrbitR;
          const by = h.y + Math.sin(ang) * baseOrbitR;
          pushProjectile({
            kind:'firewave', comboStyle:'wanjian', x: bx, y: by, vx: Math.cos(ang)*12, vy: Math.sin(ang)*12,
            life: 0.35 * hs.skillRangeMult, r: 0.44, pierce: 2, hitSet: new Set(),
            dmg, critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold, isCombo: true
          });
        }
        AudioKit.play('slash', 1.25);
      }
    }
  }

  // 2. Fire Wave (烈焰剑波) + W10 Fire Breakthrough Branches (火标/引爆)
  const fwLv = h.skills.firewave || 0;
  if (fwLv > 0) {
    const fwBranch = h.w10Branch?.firewave || null;
    h.skillTimers.firewave = Math.max(0, h.skillTimers.firewave - dt * hs.aspd);
    if (h.skillTimers.firewave <= 0) {
      const searchRange = (fwBranch === 'fw_brand_pierce' || fwBranch === 'fw_homing_ember' || fwBranch === 'fw_mortar_cluster') ? 6.2 * hs.skillRangeMult : 5.0 * hs.skillRangeMult;
      const preferPrio = fwBranch === 'fw_homing_ember' || fwBranch === 'fw_mortar_cluster';
      const target = pickAimTarget(alive, searchRange, preferPrio);
      if (target) {
        h.skillTimers.firewave = Math.max(0.75, 1.45 - fwLv * 0.14) * hs.skillCdMult;
        const baseAng = Math.atan2(target.y - h.y, target.x - h.x);
        const tfCombo = hasCombo('thunder_fire');
        const baseDmg = Math.round((26 + fwLv * 13) * hs.skillDmgMult);

        if (fwBranch === 'fw_ring_detonate') {
          // 燎原火环: 8-way radial fire ring around hero + instant fire mark & detonation
          const ringCnt = 8;
          addRing(h.x, h.y, '#ff6d38', 2.4 * hs.skillRangeMult);
          for (let i = 0; i < ringCnt; i++) {
            const a = (Math.PI * 2 * i) / ringCnt;
            pushProjectile({
              kind: 'firewave', w10Branch: 'fw_ring_detonate', x: h.x, y: h.y,
              vx: Math.cos(a) * 10.5, vy: Math.sin(a) * 10.5,
              life: 0.36 * hs.skillRangeMult, r: 0.58, pierce: 3 + Math.floor(fwLv / 2), hitSet: new Set(),
              dmg: baseDmg,
              critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
              isThunderFireCombo: tfCombo
            });
          }
        } else if (fwBranch === 'fw_mortar_cluster') {
          // 熔火轰击: 3 arcing mortar fireballs around priority target that leave lava & apply/detonate fireMark
          const mortarCnt = 3 + hs.gm.extraShot;
          for (let i = 0; i < mortarCnt; i++) {
            const offAng = (Math.PI * 2 * i) / mortarCnt + (game.rnd() - 0.5) * 0.3;
            const offDist = i === 0 ? 0 : 1.35;
            const tx = clamp(target.x + Math.cos(offAng) * offDist, 1.0, W - 1.0);
            const ty = clamp(target.y + Math.sin(offAng) * offDist, 1.0, H - 1.0);
            pushProjectile({
              kind: 'fireball', w10Branch: 'fw_mortar_cluster',
              sx: h.x, sy: h.y, x: h.x, y: h.y, tx, ty,
              t: 0, dur: 0.42, splash: 1.85 * hs.skillRangeMult,
              dmg: Math.round(baseDmg * 1.15), star: 2, burn: 22,
              opts: { fromHero:true, skillKey:'firewave', critChance:hs.crit, critDmg:hs.critDmg, lifesteal:hs.lifesteal, bonusGold:hs.gm.bonusGold }
            });
          }
        } else if (fwBranch === 'fw_brand_pierce') {
          // 烙印长锋: High-speed focused piercing lance cone (+1 projectile, +2 pierce, +35% range, applies fireMark & detonates at 2 stacks)
          const count = Math.min(5, Math.ceil(fwLv / 2) + 2) + hs.gm.extraShot;
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * 0.13;
            pushProjectile({
              kind: 'firewave', w10Branch: 'fw_brand_pierce', x: h.x, y: h.y,
              vx: Math.cos(a) * 13.8, vy: Math.sin(a) * 13.8,
              life: 0.56 * hs.skillRangeMult, r: 0.56, pierce: 4 + Math.floor(fwLv / 2), hitSet: new Set(),
              dmg: Math.round(baseDmg * 1.12),
              critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
              isThunderFireCombo: tfCombo
            });
          }
        } else if (fwBranch === 'fw_homing_ember') {
          // 追魂流火: Priority-seeking firewaves that bounce to nearby enemies on hit & apply/detonate fireMark
          const count = Math.min(4, Math.ceil(fwLv / 2) + 1) + hs.gm.extraShot;
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * 0.20;
            pushProjectile({
              kind: 'firewave', w10Branch: 'fw_homing_ember', bounceLeft: 1, x: h.x, y: h.y,
              vx: Math.cos(a) * 12.2, vy: Math.sin(a) * 12.2,
              life: 0.50 * hs.skillRangeMult, r: 0.54, pierce: 2 + Math.floor(fwLv / 2), hitSet: new Set(),
              dmg: baseDmg,
              critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
              isThunderFireCombo: tfCombo
            });
          }
        } else {
          // Base Fire Wave
          const count = Math.min(4, Math.ceil(fwLv / 2) + 1) + hs.gm.extraShot;
          for (let i = 0; i < count; i++) {
            const a = baseAng + (i - (count - 1) / 2) * 0.24;
            pushProjectile({
              kind: 'firewave', x: h.x, y: h.y,
              vx: Math.cos(a) * 11.5, vy: Math.sin(a) * 11.5,
              life: 0.42 * hs.skillRangeMult, r: 0.52, pierce: 2 + Math.floor(fwLv / 2), hitSet: new Set(),
              dmg: baseDmg,
              critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
              isThunderFireCombo: tfCombo
            });
          }
        }
        AudioKit.play('fire', 1.35);
      }
    }
  }

  // 3. Hero Chain Thunder (天雷轰顶) + W10 Branch Mechanics
  const thLv = h.skills.thunder || 0;
  if (thLv > 0) {
    const thBranch = h.w10Branch?.thunder || null;
    h.skillTimers.thunder = Math.max(0, h.skillTimers.thunder - dt * hs.aspd);
    if (h.skillTimers.thunder <= 0) {
      const near = alive.filter(e => dist(h, e) <= 4.8 * hs.skillRangeMult);
      if (near.length) {
        h.skillTimers.thunder = Math.max(0.75, 1.65 - thLv * 0.18) * hs.skillCdMult;
        const sorted = near.slice().sort((a, b) => {
          const sa = (a.boss ? 1000 : a.elite ? 500 : a.shaman ? 300 : 0) - dist(h, a) * 5;
          const sb = (b.boss ? 1000 : b.elite ? 500 : b.shaman ? 300 : 0) - dist(h, b) * 5;
          return sb - sa;
        });
        const baseDmg = Math.round((30 + thLv * 15) * hs.skillDmgMult);

        if (thBranch === 'th_storm_orb') {
          // 雷球巡猎: Fires 2 slow-moving piercing storm orbs that slow enemies & grant frost shield
          gainFrostShield(10, 4.0, 80);
          for (let s = 0; s < 2; s++) {
            const tgt = sorted[s % sorted.length];
            const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x) + (s === 0 ? -0.15 : 0.15);
            pushProjectile({
              kind: 'arrow', w10Branch: 'th_storm_orb', x: h.x, y: h.y,
              vx: Math.cos(ang) * 6.2, vy: Math.sin(ang) * 6.2,
              life: 1.15 * hs.skillRangeMult, r: 0.65, pierce: 99, hitSet: new Set(),
              dmg: Math.round(baseDmg * 1.15), splash: 1.45,
              opts: { fromHero:true, skillKey:'thunder', isThunder:true, critChance:hs.crit, critDmg:hs.critDmg, col:'#d8a6ff', slow:0.45, slowDur:2.4 }
            });
          }
          AudioKit.play('thunder');
        } else {
          const strikes = thLv + 1;
          const chainCnt = thBranch === 'th_arc_web' ? 6 : 3;
          for (let s = 0; s < strikes; s++) {
            const tgt = (thBranch === 'th_heaven_brand' || s === 0) ? sorted[0] : sorted[Math.floor(game.rnd() * sorted.length)];
            if (tgt && tgt.hp > 0) {
              fireChainLightning(tgt, baseDmg, chainCnt, {
                fromHero:true, skillKey:'thunder',
                ox: tgt.x, oy: tgt.y - 3.2, critChance: hs.crit, critDmg: hs.critDmg, bonusGold: hs.gm.bonusGold
              });
              if (thBranch === 'th_judgment_pillar' && s === 0) {
                applyFireMark(tgt, 2, 'th_judgment_pillar', 5.0);
                triggerFireDetonation(tgt, 1.15, 1.85, 'thunder');
                game.zones.push({
                  kind: 'thunderField', w10Branch: 'th_judgment_pillar',
                  x: tgt.x, y: tgt.y, r: 2.1 * hs.skillRangeMult,
                  t: 3.0, max: 3.0, tick: 0.5, dps: Math.round(baseDmg * 0.75)
                });
              } else if (thBranch === 'th_arc_web') {
                if (tgt.hp > 0) {
                  applyFireMark(tgt, 1, 'th_arc_web', 5.0);
                  triggerFireDetonation(tgt, 1.15, 1.80, 'thunder');
                }
              } else if (thBranch === 'th_heaven_brand') {
                if (tgt.hp > 0) {
                  applyFireMark(tgt, 1, 'th_heaven_brand', 5.0);
                  triggerFireDetonation(tgt, 1.25, 1.90, 'thunder');
                }
              }
            }
          }
        }
      }
    }
  }

  // 4. Frost Nova (冰霜新星) + W10 Frost Breakthrough Branches (减速/冰盾)
  const nvLv = h.skills.nova || 0;
  if (nvLv > 0) {
    const nvBranch = h.w10Branch?.nova || null;
    h.skillTimers.nova = Math.max(0, h.skillTimers.nova - dt * hs.aspd);
    if (h.skillTimers.nova <= 0) {
      const baseRad = (1.95 + nvLv * 0.24) * hs.skillRangeMult;
      const rad = nvBranch === 'nv_glacial_bastion' ? baseRad * 1.35 : baseRad;
      const searchRad = nvBranch === 'nv_seeking_vortex' ? 5.6 * hs.skillRangeMult : nvBranch === 'nv_prism_lance' ? 4.8 * hs.skillRangeMult : rad;
      if (alive.some(e => dist(h, e) <= searchRad + e.r)) {
        const cdFactor = nvBranch === 'nv_trail_aegis' ? 0.82 : 1.0;
        h.skillTimers.nova = Math.max(1.20, (2.25 - nvLv * 0.16) * cdFactor) * hs.skillCdMult;
        const baseDmg = Math.round((25 + nvLv * 13) * hs.skillDmgMult);

        if (nvBranch === 'nv_seeking_vortex') {
          // 追猎寒涡: Remote frost vortex at priority enemy cluster + frost slow + frost shield
          const tgt = pickAimTarget(alive, searchRad, true) || alive[0];
          const vx = tgt.x, vy = tgt.y;
          const vRad = baseRad * 1.05;
          addRing(vx, vy, '#7ce8ff', vRad);
          AudioKit.play('frost');
          let hitCnt = 0;
          for (const e of alive) {
            if (dist({ x: vx, y: vy }, e) <= vRad + e.r) {
              hitCnt++;
              applyFrostSlow(e, 0.60, 3.2, 'nv_seeking_vortex');
              dealDamage(e, baseDmg, {
                fromHero:true, skillKey:'nova',
                critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.60, slowDur: 3.2, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          }
          gainFrostShield(14 + hitCnt * 4, 4.8, 90);
          game.zones.push({
            kind: 'frostVortex', w10Branch: 'nv_seeking_vortex', x: vx, y: vy, r: vRad,
            t: 3.2, max: 3.2, tick: 0.45, dps: Math.round(baseDmg * 0.55)
          });
        } else if (nvBranch === 'nv_prism_lance') {
          // 冰棱乱射: Frost Nova ring + 8 radial piercing frost lances + reactive frost shield
          addRing(h.x, h.y, '#7ce8ff', baseRad * 0.9);
          AudioKit.play('frost');
          for (const e of alive) {
            if (dist(h, e) <= baseRad * 0.9 + e.r) {
              applyFrostSlow(e, 0.55, 3.0, 'nv_prism_lance');
              dealDamage(e, baseDmg, {
                fromHero:true, skillKey:'nova',
                critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.55, slowDur: 3.0, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          }
          gainFrostShield(18, 5.0, 90);
          for (let i = 0; i < 8; i++) {
            const ang = (Math.PI * 2 * i) / 8;
            pushProjectile({
              kind: 'arrow', w10Branch: 'nv_prism_lance', x: h.x, y: h.y,
              vx: Math.cos(ang) * 14.5, vy: Math.sin(ang) * 14.5,
              life: 0.44 * hs.skillRangeMult, r: 0.34, pierce: 3, hitSet: new Set(),
              dmg: Math.round(baseDmg * 0.85), splash: 0,
              opts: { fromHero:true, skillKey:'nova', critChance:hs.crit, critDmg:hs.critDmg, col:'#9ef6ff', slow:0.55, slowDur:3.0 }
            });
          }
        } else if (nvBranch === 'nv_trail_aegis') {
          // 霜径护体: Frost Nova + persistent frost trail zones + immediate high frost shield
          addRing(h.x, h.y, '#7ce8ff', rad);
          AudioKit.play('frost');
          for (const e of alive) {
            if (dist(h, e) <= rad + e.r) {
              applyFrostSlow(e, 0.60, 3.2, 'nv_trail_aegis');
              dealDamage(e, baseDmg, {
                fromHero:true, skillKey:'nova',
                critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.60, slowDur: 3.2, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          }
          gainFrostShield(22, 5.0, 95);
          game.zones.push({
            kind: 'frostTrail', w10Branch: 'nv_trail_aegis', x: h.x, y: h.y, r: 1.65 * hs.skillRangeMult,
            t: 3.2, max: 3.2, tick: 0.45, dps: Math.round(baseDmg * 0.50)
          });
        } else if (nvBranch === 'nv_glacial_bastion') {
          // 凛冰堡垒: Expanded +35% radius nova + deep 70% slow + scales frost shield per enemy hit
          addRing(h.x, h.y, '#7ce8ff', rad);
          AudioKit.play('frost');
          let chilledHit = 0;
          for (const e of alive) {
            if (dist(h, e) <= rad + e.r) {
              chilledHit++;
              applyFrostSlow(e, 0.70, 3.6, 'nv_glacial_bastion');
              dealDamage(e, Math.round(baseDmg * 1.15), {
                fromHero:true, skillKey:'nova',
                critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.70, slowDur: 3.6, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          }
          gainFrostShield(18 + chilledHit * 8, 5.0, 95);
        } else {
          // Base Frost Nova
          addRing(h.x, h.y, '#7ce8ff', rad);
          AudioKit.play('frost');
          for (const e of alive) {
            if (dist(h, e) <= rad + e.r) {
              dealDamage(e, baseDmg, {
                fromHero:true, skillKey:'nova',
                critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.55, slowDur: 3.0, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          }
        }
      }
    }
  }

  // 5. Quake Stomp (重锤震地) + W10 Branch Mechanics + Combo: 崩山血怒裂地纹
  const stLv = h.skills.stomp || 0;
  if (stLv > 0) {
    const stBranch = h.w10Branch?.stomp || null;
    h.skillTimers.stomp = Math.max(0, h.skillTimers.stomp - dt * hs.aspd);
    if (h.skillTimers.stomp <= 0) {
      const baseRad = (2.00 + stLv * 0.24) * hs.skillRangeMult;
      const rad = stBranch === 'st_glacier_quake' ? baseRad * 1.30 : stBranch === 'st_aftershock_ring' ? baseRad * 1.45 : baseRad;
      if (alive.some(e => dist(h, e) <= rad + e.r)) {
        h.skillTimers.stomp = Math.max(1.60, 2.45 - stLv * 0.17) * hs.skillCdMult;
        const hasQuakeBlood = hasCombo('quake_blood');
        const missingMult = hasQuakeBlood ? (1 + clamp((h.maxHp - h.hp) / Math.max(1, h.maxHp), 0, 1)) : 1;
        addRing(h.x, h.y, stBranch === 'st_glacier_quake' ? '#88f0ff' : hasQuakeBlood ? '#ff5c42' : '#ffbe55', rad);
        if (hasQuakeBlood) {
          addFloat(h.x, h.y - 0.7, '🌋崩山血怒!', '#ff6a4d', true);
          for (let f = 0; f < 8; f++) {
            const ang = (Math.PI * 2 * f) / 8;
            game.beams.push({ x1: h.x, y1: h.y, x2: h.x + Math.cos(ang)*rad*1.15, y2: h.y + Math.sin(ang)*rad*1.15, t: 0.28, max: 0.28, w: 6, col:'#ff5a3c' });
          }
        }
        game.shake = Math.max(game.shake, hasQuakeBlood ? 7.5 : 4.5);
        AudioKit.play('fire', 0.75);
        const baseDmg = Math.round((40 + stLv * 20) * hs.skillDmgMult * missingMult);
        let hitCount = 0;
        for (const e of alive) {
          if (dist(h, e) <= rad + e.r) {
            hitCount++;
            const dealt = dealDamage(e, baseDmg, {
              fromHero:true, skillKey: hasQuakeBlood ? 'combo' : 'stomp',
              critChance: hs.crit, critDmg: hs.critDmg, col: hasQuakeBlood ? '#ff8a6b' : '#ffd478', lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
            });
            if (hasQuakeBlood && dealt > 0) applyHeroLifesteal(3);
            if (!e.boss && !isEnemyUnstoppable(e)) e.freezeT = Math.max(e.freezeT, stBranch === 'st_glacier_quake' ? 1.2 : 0.75);
            if ((stBranch === 'st_fissure_wave' || stBranch === 'st_aftershock_ring' || stBranch === 'st_molten_crater') && e.hp > 0) {
              applyFireMark(e, 2, stBranch, 5.0);
              triggerFireDetonation(e, 1.25, 2.0, 'stomp');
            } else if (stBranch === 'st_glacier_quake' && e.hp > 0) {
              applyFrostSlow(e, 0.65, 3.4, 'st_glacier_quake');
            }
          }
        }
        if (stBranch === 'st_fissure_wave') {
          const tgt = pickAimTarget(alive, rad + 2.5, true) || alive[0];
          const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
          for (let k = 1; k <= 2; k++) {
            game.zones.push({
              kind: 'lava', w10Branch: 'st_fissure_wave',
              x: clamp(h.x + Math.cos(ang) * k * 1.6, 1.0, W - 1.0),
              y: clamp(h.y + Math.sin(ang) * k * 1.6, 1.0, H - 1.0),
              r: 1.45, t: 3.0, max: 3.0, tick: 0.45, dps: Math.round(baseDmg * 0.55)
            });
          }
        } else if (stBranch === 'st_glacier_quake') {
          gainFrostShield(16 + hitCount * 6, 5.0, 95);
        } else if (stBranch === 'st_aftershock_ring') {
          addRing(h.x, h.y, '#ff6d38', rad * 1.25);
        } else if (stBranch === 'st_molten_crater') {
          game.zones.push({
            kind: 'lava', w10Branch: 'st_molten_crater', x: h.x, y: h.y, r: rad * 0.95,
            t: 2.8, max: 2.8, tick: 0.45, dps: Math.round(baseDmg * 0.55)
          });
        }
      }
    }
  }

  // 6. Berserk Blood (狂战血怒) W10 Active Branch Pulses
  const bzLv = h.skills.berserk || 0;
  const bzBranch = h.w10Branch?.berserk || null;
  if (bzLv > 0 && bzBranch) {
    h.skillTimers.berserk = Math.max(0, (h.skillTimers.berserk || 0) - dt * hs.aspd);
    if (h.skillTimers.berserk <= 0) {
      const pulseRad = (2.6 + bzLv * 0.25) * hs.skillRangeMult;
      if (alive.some(e => dist(h, e) <= pulseRad + 2.0)) {
        h.skillTimers.berserk = 0.85 * hs.skillCdMult;
        const pulseDmg = Math.round((22 + bzLv * 12) * hs.skillDmgMult);
        if (bzBranch === 'bk_flame_aura') {
          addRing(h.x, h.y, '#ff6d38', pulseRad);
          for (const e of alive) {
            if (dist(h, e) <= pulseRad + e.r) {
              applyFireMark(e, 1, 'bk_flame_aura', 4.5);
              dealDamage(e, pulseDmg, { fromHero:true, skillKey:'berserk', col:'#ff884d', burn:18, critChance:hs.crit, critDmg:hs.critDmg });
              if (e.hp > 0) triggerFireDetonation(e, 1.15, 1.85, 'berserk');
            }
          }
        } else if (bzBranch === 'bk_frost_armor') {
          addRing(h.x, h.y, '#7ce8ff', pulseRad);
          gainFrostShield(16, 4.5, 90);
          for (const e of alive) {
            if (dist(h, e) <= pulseRad + e.r) {
              applyFrostSlow(e, 0.55, 2.8, 'bk_frost_armor');
              dealDamage(e, pulseDmg, { fromHero:true, skillKey:'berserk', col:'#8cf0ff', slow:0.55, slowDur:2.8, critChance:hs.crit, critDmg:hs.critDmg });
            }
          }
        } else if (bzBranch === 'bk_blood_crescent') {
          const tgt = pickAimTarget(alive, 5.2 * hs.skillRangeMult, true);
          if (tgt) {
            const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
            applyHeroLifesteal(6);
            pushProjectile({
              kind: 'firewave', w10Branch: 'bk_blood_crescent', x: h.x, y: h.y,
              vx: Math.cos(ang) * 12.5, vy: Math.sin(ang) * 12.5,
              life: 0.45 * hs.skillRangeMult, r: 0.62, pierce: 4, hitSet: new Set(),
              dmg: Math.round(pulseDmg * 1.25),
              critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
            });
          }
        } else if (bzBranch === 'bk_war_tempest') {
          addRing(h.x, h.y, '#8cf0ff', pulseRad);
          gainFrostShield(14, 4.5, 90);
          for (let i = 0; i < 4; i++) {
            const ang = (Math.PI * 2 * i) / 4 + game.waveClock;
            pushProjectile({
              kind: 'arrow', w10Branch: 'bk_war_tempest', x: h.x, y: h.y,
              vx: Math.cos(ang) * 13.5, vy: Math.sin(ang) * 13.5,
              life: 0.42 * hs.skillRangeMult, r: 0.34, pierce: 3, hitSet: new Set(),
              dmg: pulseDmg, splash: 0,
              opts: { fromHero:true, skillKey:'berserk', critChance:hs.crit, critDmg:hs.critDmg, col:'#9ef6ff', slow:0.50, slowDur:2.6 }
            });
          }
        }
      }
    }
  }
}

/* ==================== MAIN SEAL & SUB-SEAL RESONANCE (ON-HIT IMPACT ERUPTION) ==================== */
function pushProjectile(p){
  if (game.projectiles.length >= MAX_PROJECTILES) game.projectiles.shift();
  game.projectiles.push(p);
}

function updateSeal(dt){
  if (game.seal) game.seal.cd = Math.max(0, game.seal.cd - dt);

  // Thunder Tier-4 Global Wrath Strike every 3s in active combat
  if (game.phase === 'wave' && game.enemies.length > 0 && getSynergyTier('thunder') >= 2) {
    game.thunderSynTimer -= dt;
    if (game.thunderSynTimer <= 0) {
      game.thunderSynTimer = 3.0;
      const alive = game.enemies.filter(e => e.hp > 0);
      const targets = alive.sort((a,b) => dist(a, game.hero) - dist(b, game.hero)).slice(0, 3);
      for (const tgt of targets) {
        fireChainLightning(tgt, Math.round(75 + game.wave * 18), 4, { ox: tgt.x, oy: tgt.y - 4.0, col:'#e2b8ff', tower: game.seal });
        addRing(tgt.x, tgt.y, '#c68cff', 1.6);
      }
    }
  }
}

function triggerSealOnHeroHit(hitEnemy){
  const a = game.seal;
  if (!hitEnemy || !a || a.cd > 0) return;
  const h = game.hero;
  const maxTrigDist = 4.8 * getHeroStats().rangeMult;
  if (dist(h, hitEnemy) > maxTrigDist) return;
  const syn = getSynergyCounts();
  const alive = game.enemies.filter(e => e.hp > 0);
  const hx = hitEnemy.x, hy = hitEnemy.y;
  const st = getSealStats(a);
  a.cd = st.cd;

  const dmgOpts = {
    tower: a, fromHero: false, critChance: st.crit, critDmg: st.critDmg,
    slow: st.slow, slowDur: st.slowDur, burn: st.burn,
    lifesteal: st.gm.lifesteal, chainProc: st.gm.chainProc, bonusGold: st.gm.bonusGold
  };

  if (a.kind === 'wind') {
    const baseAng = Math.atan2(hy - h.y, hx - h.x);
    let totalShots = st.shots;
    if (syn.wind >= 4 && game.rnd() < 0.35) totalShots += 2;
    addRing(hx, hy, '#72f2b4', 1.15);
    for (let i = 0; i < totalShots; i++) {
      const ang = totalShots >= 4
        ? baseAng + (Math.PI * 2 * i) / totalShots
        : baseAng + (i - (totalShots - 1) / 2) * 0.55;
      pushProjectile({
        kind: 'arrow', x: hx, y: hy,
        vx: Math.cos(ang) * 14.5, vy: Math.sin(ang) * 14.5,
        life: st.range / 14.5, r: 0.28,
        pierce: st.pierce, hitSet: new Set([hitEnemy.id]),
        dmg: st.dmg, splash: st.splash, opts: { ...dmgOpts, isWind: true }
      });
    }
    AudioKit.play('arrow');
  } else if (a.kind === 'fire') {
    const rad = Math.max(1.70, st.splash);
    addRing(hx, hy, '#ff7b47', rad);
    for (const e of alive) {
      if (e.hp > 0 && dist(e, hitEnemy) <= rad + e.r) {
        if (st.route === 'mastery') applyFireMark(e, 1, 'seal_fire_mastery', 4.5);
        dealDamage(e, st.dmg, { ...dmgOpts, col:'#ff9f66' });
      }
    }
    if (a.star >= 2) {
      game.zones.push({ kind:'lava', x:hx, y:hy, r:rad * (st.route === 'mastery' ? 0.96 : 0.82), t: st.route === 'mastery' ? 3.5 : 2.8, max: st.route === 'mastery' ? 3.5 : 2.8, tick:0.45, dps:st.burn, tower:a });
    }
    AudioKit.play('fire');
  } else if (a.kind === 'frost') {
    const rad = Math.max(1.85, st.splash);
    addRing(hx, hy, '#6ce2ff', rad);
    let chilledHit = false;
    for (const e of alive) {
      if (e.hp > 0 && dist(e, hitEnemy) <= rad + e.r) {
        if (e.slowT > 0 || e.freezeT > 0) chilledHit = true;
        dealDamage(e, st.dmg, { ...dmgOpts, col:'#8ceeff' });
      }
    }
    if (st.route === 'mastery' && chilledHit) {
      gainFrostShield(10, { duration: 4.5, maxShield: 105, source: 'seal_frost_mastery' });
    }
    AudioKit.play('frost');
  } else if (a.kind === 'thunder') {
    fireChainLightning(hitEnemy, st.dmg, st.chains, { ...dmgOpts, vuln: st.route === 'mastery' || dmgOpts.vuln, ox: hx, oy: hy });
  } else if (a.kind === 'holy') {
    const baseAng = game.rnd() * Math.PI;
    const rayCount = Math.max(2, st.beams);
    addRing(hx, hy, '#ffe478', st.range * 0.6);
    for (let i = 0; i < rayCount; i++) {
      const ang = baseAng + (Math.PI * i) / rayCount;
      const dx = Math.cos(ang) * st.range, dy = Math.sin(ang) * st.range;
      const x1 = hx - dx, y1 = hy - dy, x2 = hx + dx, y2 = hy + dy;
      game.beams.push({ x1, y1, x2, y2, t: 0.22, max: 0.22, w: 3.5 + a.star * 1.6 });
      for (const e of alive) {
        if (e.hp > 0 && pointToSegDist(e.x, e.y, x1, y1, x2, y2) <= 0.52 + e.r) dealDamage(e, st.dmg, { ...dmgOpts, col:'#fff094' });
      }
    }
    if (st.route === 'mastery') applyHeroLifesteal(4);
    AudioKit.play('holy');
  }

  // Dual Resonance: Fire+Thunder crimson wrath & Holy Omni shield
  if (hasDualRes('fire_thunder')) {
    const hi = alive.filter(e => e.hp > 0).sort((x, y) => y.hp - x.hp)[0];
    if (hi) {
      fireChainLightning(hi, Math.max(10, Math.round(st.dmg * 0.75)), 2, {
        ox: hx, oy: hy, col: '#ff6a4d', burn: 18, noChainProc: true, isThunder: true, critChance: st.crit, critDmg: st.critDmg, comboThunderFire: true
      });
    }
  }
  if (hasDualRes('holy_omni')) {
    const prevHolyShield = h.shield || 0;
    h.shield = Math.min(75, prevHolyShield + 6);
    const holyShieldGain = Math.max(0, Math.round(h.shield - prevHolyShield));
    if (holyShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + holyShieldGain;
    h.shieldTimer = Math.max(h.shieldTimer, 4.0);
  }

  // Trigger Sub-Seal Elemental Resonances!
  for (const sub of game.subSeals) {
    if (sub.elem === 'wind') {
      const cnt = SUB_SEAL_RESONANCE.wind.blades[sub.star - 1];
      const baseAng = Math.atan2(hy - h.y, hx - h.x);
      for (let i = 0; i < cnt; i++) {
        const ang = baseAng + (i - (cnt - 1) / 2) * 0.45 + 0.2;
        pushProjectile({
          kind: 'arrow', x: hx, y: hy, vx: Math.cos(ang)*14.5, vy: Math.sin(ang)*14.5,
          life: 0.32, r: 0.25, pierce: 1, hitSet: new Set([hitEnemy.id]),
          dmg: Math.max(6, Math.round(st.dmg * 0.55)), splash: 0,
          opts: { tower: sub, isWind: true, fromHero: false, critChance: st.crit, critDmg: st.critDmg, col:'#8cffca' }
        });
      }
    } else if (sub.elem === 'thunder') {
      const proc = SUB_SEAL_RESONANCE.thunder.proc[sub.star - 1];
      if (game.rnd() < proc) {
        const thunderStart = hitEnemy.hp > 0 ? hitEnemy : game.enemies.find(o => o.hp > 0 && dist(o, hitEnemy) <= 4.4);
        if (thunderStart) {
          const ch = SUB_SEAL_RESONANCE.thunder.chains[sub.star - 1];
          fireChainLightning(thunderStart, Math.max(8, Math.round(st.dmg * 0.68)), ch, {
            tower: sub, ox: hx, oy: hy, noChainProc: true, critChance: st.crit, critDmg: st.critDmg
          });
        }
      }
    } else if (sub.elem === 'holy') {
      applyHeroLifesteal(SUB_SEAL_RESONANCE.holy.heal[sub.star - 1]);
      addRing(hx, hy, '#ffe478', 0.95);
    }
  }
}

function pointToSegDist(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function updateProjectilesAndZones(dt){
  for (const p of game.projectiles) {
    if (p.kind === 'enemyShot') {
      p.t += dt;
      const u = clamp(p.t / p.dur, 0, 1);
      p.x = p.sx + (p.tx - p.sx) * u;
      p.y = p.sy + (p.ty - p.sy) * u;
      if (u >= 1) {
        p.done = true;
        // Dodgeable enemy shot: hits Hero only if still within impact radius <= 0.65
        if (dist(game.hero, { x: p.tx, y: p.ty }) <= 0.65) {
          damageHero(p.dmg, p.sourceMeta || {
            attackerName: p.w30Aux ? '深渊主宰' : p.w20Aux ? '天劫魔尊' : '远程敌军',
            attackerKind: p.w30Aux ? 'boss6' : p.w20Aux ? 'boss4' : 'mage',
            skillName: p.w30Aux === 'eclipse_seekers' ? '星蚀追踪弹 (W30随机辅助)' : p.w20Aux === 'chase_barrage' ? '周期追击弹幕 (W20随机辅助)' : '敌方弹幕',
            isBoss: !!(p.w30Aux || p.w20Aux),
            isBossCore: false,
            isBossAux: !!(p.w30Aux || p.w20Aux),
            auxKey: p.w30Aux || p.w20Aux || null
          });
        } else {
          addRing(p.tx, p.ty, 'rgba(255,102,196,0.5)', 0.45);
        }
      }
      continue;
    }
    if (p.kind === 'arrow' || p.kind === 'firewave') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) { p.done = true; continue; }
      for (const e of game.enemies) {
        if (e.hp <= 0 || p.hitSet.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= p.r + e.r) {
          p.hitSet.add(e.id);
          if (p.kind === 'firewave') {
            const hadMarkOrBurn = (e.fireMarkT > 0 || e.burnT > 0);
            dealDamage(e, p.dmg, {
              fromHero: !p.isCombo,
              skillKey: p.w10Branch === 'bk_blood_crescent' ? 'berserk' : (p.isCombo ? 'combo' : 'firewave'),
              critChance:p.critChance, critDmg:p.critDmg, col:'#ff9a52',
              burn: p.w10Branch ? 16 : 0,
              lifesteal:p.lifesteal, bonusGold:p.bonusGold
            });
            // W10 Fire Branch hooks: apply fireMark & trigger fireDetonation
            if (p.w10Branch && e.hp > 0) {
              applyFireMark(e, 1, p.w10Branch, 5.0);
              if (p.w10Branch === 'fw_brand_pierce' && e.fireMarkStacks >= 2) {
                triggerFireDetonation(e, 1.35, 1.90, 'firewave');
              } else if (p.w10Branch === 'fw_ring_detonate' && (hadMarkOrBurn || e.fireMarkStacks >= 1)) {
                triggerFireDetonation(e, 1.15, 2.15, 'firewave');
              } else if (p.w10Branch === 'fw_homing_ember') {
                if (hadMarkOrBurn || e.fireMarkStacks >= 2) {
                  triggerFireDetonation(e, 1.15, 1.75, 'firewave');
                }
                if ((p.bounceLeft || 0) > 0) {
                  p.bounceLeft--;
                  const nextTgt = game.enemies
                    .filter(o => o.hp > 0 && o.id !== e.id && !p.hitSet.has(o.id) && dist(o, e) <= 4.2)
                    .sort((a, b) => dist(a, e) - dist(b, e))[0];
                  if (nextTgt) {
                    const bAng = Math.atan2(nextTgt.y - e.y, nextTgt.x - e.x);
                    pushProjectile({
                      kind: 'firewave', w10Branch: 'fw_homing_ember', bounceLeft: 0,
                      x: e.x, y: e.y, vx: Math.cos(bAng) * 13.0, vy: Math.sin(bAng) * 13.0,
                      life: 0.35, r: 0.50, pierce: 2, hitSet: new Set(p.hitSet),
                      dmg: Math.round(p.dmg * 0.85), critChance: p.critChance, critDmg: p.critDmg,
                      lifesteal: p.lifesteal, bonusGold: p.bonusGold
                    });
                  }
                }
              } else if (p.w10Branch === 'bk_blood_crescent') {
                triggerFireDetonation(e, 1.15, 1.75, 'berserk');
              }
            }
            if (hasCombo('thunder_fire') && !p.isCombo && e.hp > 0 && game.rnd() < 0.45) {
              addRing(e.x, e.y, '#ff6a38', 1.35);
              addFloat(e.x, e.y - 0.55, '🌩️雷火劫!', '#ff9452', true);
              fireChainLightning(e, Math.round(p.dmg * 0.7), 3, { ox: e.x, oy: e.y - 2.4, skillKey:'combo', col:'#ff7840', comboThunderFire:true, critChance:p.critChance, critDmg:p.critDmg });
            }
            if (p.pierce !== undefined) {
              if (p.pierce > 0) p.pierce--;
              else { p.done = true; break; }
            }
          } else {
            if (p.w10Branch === 'nv_prism_lance' || p.w10Branch === 'bl_frost_shuriken' || p.w10Branch === 'th_storm_orb' || p.w10Branch === 'bk_war_tempest') {
              applyFrostSlow(e, p.opts?.slow || 0.50, p.opts?.slowDur || 2.6, p.w10Branch);
              gainFrostShield(6, 4.0, 90);
            }
            if (p.splash > 0) {
              addRing(p.x, p.y, '#ff9848', p.splash);
              for (const o of game.enemies) {
                if (o.hp > 0 && dist(o, p) <= p.splash + o.r) dealDamage(o, p.dmg, { ...p.opts, col:'#9affc8' });
              }
            } else {
              dealDamage(e, p.dmg, { ...p.opts, col:'#a8ffd2' });
            }
            if (p.pierce > 0) p.pierce--;
            else { p.done = true; break; }
          }
        }
      }
      continue;
    }
    // Arcing explosive / frost balls
    p.t += dt;
    const u = clamp(p.t / p.dur, 0, 1);
    p.x = p.sx + (p.tx - p.sx) * u;
    p.y = p.sy + (p.ty - p.sy) * u;
    if (u >= 1) {
      p.done = true;
      const isFire = p.kind === 'fireball';
      addRing(p.tx, p.ty, isFire ? '#ff7b47' : '#6ce2ff', p.splash);
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(e, {x:p.tx, y:p.ty}) <= p.splash + e.r) {
          dealDamage(e, p.dmg, { ...p.opts, col: isFire ? '#ff9f66' : '#8ceeff' });
          if (p.w10Branch === 'fw_mortar_cluster' && e.hp > 0) {
            applyFireMark(e, 1, 'fw_mortar_cluster', 5.0);
            triggerFireDetonation(e, 1.20, 1.85, 'firewave');
          }
        }
      }
      if (isFire && p.star >= 2) {
        game.zones.push({
          kind:'lava', w10Branch: p.w10Branch || null,
          x:p.tx, y:p.ty, r:p.splash * 0.85, t:3.0, max:3.0, tick:0.45,
          dps:p.burn || 20, tower:p.opts?.tower
        });
      }
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.done);

  for (const z of game.zones) {
    z.t -= dt;
    if (z.kind === 'lava' || z.kind === 'fireVortex') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.45;
        for (const e of game.enemies) {
          if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
            if (z.kind === 'fireVortex' && !e.boss && !isEnemyUnstoppable(e)) {
              const d = Math.max(0.25, dist(e, z));
              e.x = clamp(e.x + (z.x - e.x) / d * 0.42, 0.8, W - 0.8);
              e.y = clamp(e.y + (z.y - e.y) / d * 0.42, 0.8, H - 0.8);
            }
            dealDamage(e, Math.round(z.dps * 0.45), { tower:z.tower, skillKey: (z.w10Branch || z.w20Source) ? 'firewave' : undefined, col:'#ff884d' });
            if ((z.w10Branch || z.kind === 'fireVortex') && e.hp > 0) {
              applyFireMark(e, 1, z.w20Source || z.w10Branch || 'fireVortex', 4.5);
              if (e.fireMarkStacks >= 2 && z.w10Branch) triggerFireDetonation(e, 1.10, 1.75, 'firewave');
            }
          }
        }
      }
    } else if (z.kind === 'frostVortex' || z.kind === 'frostTrail') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.45;
        let hitAny = false;
        for (const e of game.enemies) {
          if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
            hitAny = true;
            if (z.kind === 'frostVortex' && !e.boss) {
              const d = Math.max(0.2, dist(e, z));
              e.x = clamp(e.x + (z.x - e.x) / d * 0.35, 0.8, W - 0.8);
              e.y = clamp(e.y + (z.y - e.y) / d * 0.35, 0.8, H - 0.8);
            }
            applyFrostSlow(e, 0.60, 2.4, z.kind);
            dealDamage(e, Math.max(6, Math.round((z.dps || 18) * 0.45)), { skillKey:'nova', col:'#8cf0ff', slow:0.60, slowDur:2.4 });
          }
        }
        if (hitAny || z.w20Source === 'w20_frost_pillar_ward') gainFrostShield(z.w20Source === 'w20_frost_pillar_ward' ? 10 : 6, { duration: 4.2, source: z.w20Source || 'frost_zone' });
      }
    } else if (z.kind === 'thunderField') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.50;
        for (const e of game.enemies) {
          if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
            applyFireMark(e, 1, 'th_judgment_pillar', 4.5);
            dealDamage(e, Math.max(8, Math.round((z.dps || 24) * 0.50)), { skillKey:'thunder', isThunder:true, col:'#d8a6ff' });
            if (e.hp > 0 && e.fireMarkStacks >= 2) triggerFireDetonation(e, 1.15, 1.80, 'thunder');
          }
        }
      }
    } else if (z.kind === 'bossSlam' && z.t <= 0) {
      z.done = true;
      addRing(z.x, z.y, '#ff4d42', z.r);
      game.shake = Math.max(game.shake, 8);
      AudioKit.play('boss', 1.2);
      const slamMeta = z.sourceMeta || {
        attackerName: z.w20Aux ? '天劫魔尊' : '强敌重击',
        attackerKind: z.w20Aux ? 'boss4' : 'boss',
        skillName: z.w20Aux === 'charged_shockwave' ? '蓄力震荡波 (W20随机辅助)' : '裂地重击',
        isBoss: true, isBossCore: !z.w20Aux, isBossAux: !!z.w20Aux, auxKey: z.w20Aux || null
      };
      if (dist(game.hero, z) <= z.r) damageHero(z.dmg || 34, slamMeta);
      if (z.leaveLava) {
        game.zones.push({
          kind:'enemyLava', x:z.x, y:z.y, r:z.r * 0.8, t:2.2, max:2.2, tick:0.55, dmg: Math.round((z.dmg || 24) * 0.35),
          sourceMeta: { attackerName: slamMeta.attackerName, attackerKind: slamMeta.attackerKind, skillName: '灼地焦土(持续)', isBoss: slamMeta.isBoss, isBossCore: slamMeta.isBossCore, isBossAux: slamMeta.isBossAux }
        });
      }
    } else if (z.kind === 'poisonBomb' && z.t <= 0) {
      z.done = true;
      addRing(z.x, z.y, '#52ff9a', z.r);
      const pbMeta = z.sourceMeta || { attackerName: '煞毒自爆虫', attackerKind: 'bomber', skillName: '剧毒自爆', isBoss: false, isBossCore: false, isBossAux: false };
      if (dist(game.hero, z) <= z.r) damageHero(z.dmg || 10, pbMeta);
      game.zones.push({
        kind:'poisonPool', x:z.x, y:z.y, r:z.r * 0.9, t:2.8, max:2.8, tick:0.65, dmg: Math.max(4, Math.round((z.dmg || 10) * 0.45)),
        sourceMeta: { attackerName: pbMeta.attackerName, attackerKind: 'bomber', skillName: '残留毒池(持续)', isBoss: false, isBossCore: false, isBossAux: false }
      });
    } else if (z.kind === 'poisonPool' || z.kind === 'enemyLava') {
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = z.kind === 'enemyLava' ? 0.55 : 0.65;
        if (dist(game.hero, z) <= z.r) {
          damageHero(z.dmg, z.sourceMeta || {
            attackerName: z.kind === 'enemyLava' ? '火焰领域' : '煞毒虫',
            attackerKind: z.kind,
            skillName: z.kind === 'enemyLava' ? '灼地焦土(持续)' : '残留毒池(持续)',
            isBoss: false, isBossCore: false, isBossAux: false
          });
        }
      }
    } else if (z.kind === 'bossWave' || z.kind === 'w30RiftRing') {
      const prog = 1 - clamp(z.t / z.max, 0, 1);
      const curR = z.r * prog;
      if (!z.hitHero && Math.abs(dist(game.hero, z) - curR) <= 0.55) {
        z.hitHero = true;
        damageHero(z.dmg || 36, z.sourceMeta || {
          attackerName: z.kind === 'w30RiftRing' ? '深渊主宰' : z.w20Aux ? '天劫魔尊' : '首领震波',
          attackerKind: z.kind === 'w30RiftRing' ? 'boss6' : 'boss',
          skillName: z.w30Aux === 'rift_rings' ? '裂空震荡环 (W30随机辅助)' : z.w20Aux === 'oppression_ring' ? '领域压迫环 (W20随机辅助)' : '首领扩散震波',
          isBoss: true, isBossCore: !(z.w30Aux || z.w20Aux), isBossAux: !!(z.w30Aux || z.w20Aux), auxKey: z.w30Aux || z.w20Aux || null
        });
      }
    } else if (z.kind === 'w30SigTelegraph') {
      // Pure telegraph + safe zone marker; deals no damage until shockwave phase
    } else if (z.kind === 'w30SigShockwave') {
      const prog = 1 - clamp(z.t / z.max, 0, 1);
      const curR = z.r * prog;
      const inSafeZone = dist(game.hero, { x: z.safeX, y: z.safeY }) <= (z.safeR || 2.8);
      if (!z.hitHero && !inSafeZone && Math.abs(dist(game.hero, z) - curR) <= 0.85) {
        z.hitHero = true;
        damageHero(z.dmg || 68, z.sourceMeta || {
          attackerName: '深渊主宰', attackerKind: 'boss6',
          skillName: '终焉裂空冲击波 (W30核心招牌)',
          isBoss: true, isBossCore: true, isBossAux: false
        });
      }
    }
  }
  game.zones = game.zones.filter(z => z.t > 0 && !z.done);
}

function updateEnemies(dt){
  const h = game.hero;
  const wfFrostAura = hasDualRes('wind_frost');

  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    e.cd = Math.max(0, e.cd - dt);
    e.aiCd = Math.max(0, e.aiCd - dt);
    e.flash = Math.max(0, e.flash - dt);
    if (e.unstopFloatCd > 0) e.unstopFloatCd = Math.max(0, e.unstopFloatCd - dt);
    if (e.sigFloatCd > 0) e.sigFloatCd = Math.max(0, e.sigFloatCd - dt);
    if (e.zeroExecCd > 0) e.zeroExecCd = Math.max(0, e.zeroExecCd - dt);
    if (e.frenzyT > 0) e.frenzyT = Math.max(0, e.frenzyT - dt);
    if (e.vulnT > 0) e.vulnT = Math.max(0, e.vulnT - dt);
    if (e.fireDetonateCd > 0) e.fireDetonateCd = Math.max(0, e.fireDetonateCd - dt);
    if (e.fireMarkT > 0) {
      e.fireMarkT = Math.max(0, e.fireMarkT - dt);
      if (e.fireMarkT === 0) { e.fireMarkStacks = 0; e.fireMarkSource = null; }
    }
    if (isEnemyUnstoppable(e)) { e.slow = 0; e.slowT = 0; e.freezeT = 0; }
    else if (e.slowT > 0) { e.slowT = Math.max(0, e.slowT - dt); if (e.slowT === 0) e.slow = 0; }
    if (e.burnT > 0) {
      e.burnT = Math.max(0, e.burnT - dt);
      const burnTick = Math.max(0, (e.burnDps || 0) * dt);
      if (e.kind === 'boss6' && e.signatureLockActive) {
        // STRICT HP LOCK during signature: burn timer ticks, 0 HP deducted, 0 burn dmg recorded!
        e.hp = Math.max(e.hp, e.signatureThresholdHp);
      } else if (burnTick > 0) {
        let remBurn = burnTick;
        let actualBurnDmg = 0;
        if (e.shield > 0) {
          const shAbs = Math.min(e.shield, remBurn);
          e.shield -= shAbs;
          remBurn -= shAbs;
          actualBurnDmg += shAbs;
        }
        if (e.kind === 'boss6' && !e.signatureTriggered && e.signatureThresholdHp > 0 && (e.hp - remBurn) <= e.signatureThresholdHp) {
          const allowedHp = Math.max(0, e.hp - e.signatureThresholdHp);
          const trunc = Math.max(0, remBurn - allowedHp);
          e.hp = e.signatureThresholdHp;
          actualBurnDmg += allowedHp;
          if (actualBurnDmg > 0 && game.stats) {
            game.stats.dmgTotal += actualBurnDmg;
            if (game.stats.skillDmg) game.stats.skillDmg.burn = (game.stats.skillDmg.burn || 0) + actualBurnDmg;
          }
          triggerW30BossSignature(e, trunc);
        } else {
          const prevHp = Math.max(0, e.hp);
          e.hp -= remBurn;
          actualBurnDmg += Math.min(prevHp, remBurn);
          if (actualBurnDmg > 0 && game.stats) {
            game.stats.dmgTotal += actualBurnDmg;
            if (game.stats.skillDmg) game.stats.skillDmg.burn = (game.stats.skillDmg.burn || 0) + actualBurnDmg;
          }
          if (e.kind === 'boss6' && e.signatureTriggered && !e.signatureLockActive && !e.finalPhaseEntered && e.hp > 0 && e.hp <= e.finalThresholdHp) {
            enterW30BossFinalPhase(e);
          }
          if (e.hp <= 0) { onEnemyKilled(e, {}); continue; }
        }
      }
    }
    if (e.freezeT > 0 && !isEnemyUnstoppable(e)) { e.freezeT = Math.max(0, e.freezeT - dt); continue; }

    // Stage 3: W20 Boss Shield Totem stays stationary and periodically shields boss4 until destroyed by player
    if (e.totem) {
      e.totemTimer = (e.totemTimer ?? 2.4) - dt;
      if (e.totemTimer <= 0) {
        e.totemTimer = 2.4;
        const ownerBoss = game.enemies.find(o => o.hp > 0 && (o.id === e.totemBossId || o.kind === 'boss4'));
        if (ownerBoss) {
          ownerBoss.shield = Math.min(Math.round(ownerBoss.maxHp * 0.14), (ownerBoss.shield || 0) + 160);
          addRing(e.x, e.y, '#6ce2ff', 1.4);
          game.bolts.push({ pts: [{ x: e.x, y: e.y }, { x: ownerBoss.x, y: ownerBoss.y }], t: 0.25, max: 0.25, col: '#6ce2ff' });
        }
      }
      continue;
    }

    // Stage 5: W30 Abyss Pillar stays stationary and grants modest shield to boss6 until destroyed (fair to all builds)
    if (e.pillar) {
      e.pillarTimer = (e.pillarTimer ?? 2.8) - dt;
      if (e.pillarTimer <= 0) {
        e.pillarTimer = 2.8;
        const ownerBoss = game.enemies.find(o => o.hp > 0 && (o.id === e.pillarBossId || o.kind === 'boss6'));
        if (ownerBoss && !ownerBoss.signatureLockActive) {
          ownerBoss.shield = Math.min(Math.round(ownerBoss.maxHp * 0.04), (ownerBoss.shield || 0) + 650);
          addRing(e.x, e.y, '#ff88dc', 1.5);
          game.bolts.push({ pts: [{ x: e.x, y: e.y }, { x: ownerBoss.x, y: ownerBoss.y }], t: 0.28, max: 0.28, col: '#ff88dc' });
        }
      }
      continue;
    }

    const dHero = dist(e, h);

    // Elite Affixes (疾奔 / 弹幕 / 灵盾 / 引力)
    if (e.elite && e.affixes?.length) {
      e.affixTimer -= dt;
      if (e.affixTimer <= 0) {
        e.affixTimer = e.isShrineBoss ? 3.0 : 3.8;
        const pick = e.affixes[Math.floor(game.rnd() * e.affixes.length)].key;
        if (pick === 'sprint' && e.aiState === 'chase' && dHero > 1.8) {
          const len = Math.max(0.01, dHero);
          e.aiState = 'charge'; e.aiTimer = 0.45;
          e.slow = 0; e.slowT = 0; e.freezeT = 0;
          e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
          addFloat(e.x, e.y - 0.5, '⚡疾奔·霸体!', '#ffaa44');
        } else if (pick === 'volley') {
          for (let k = 0; k < 8; k++) {
            const ang = (Math.PI * 2 * k) / 8 + game.waveClock;
            pushProjectile({
              kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
              tx: clamp(e.x + Math.cos(ang) * 5.2, 0.8, W - 0.8),
              ty: clamp(e.y + Math.sin(ang) * 5.2, 0.8, H - 0.8),
              t:0, dur: 0.72, dmg: Math.round(e.dmg * 0.75),
              sourceMeta: { attackerName: e.name || '精英怪', attackerKind: e.kind, skillName: '精英环状弹幕', isBoss: false, isBossCore: false, isBossAux: false }
            });
          }
          addRing(e.x, e.y, '#d86cff', 1.6);
        } else if (pick === 'shield') {
          e.shield = Math.round(e.maxHp * 0.16);
          addRing(e.x, e.y, '#6ce2ff', 2.4);
          for (const o of game.enemies) {
            if (o.hp > 0 && dist(o, e) <= 3.2) o.frenzyT = Math.max(o.frenzyT, 2.0);
          }
        } else if (pick === 'vortex' && dHero <= 6.5 && dHero > 1.2) {
          addRing(e.x, e.y, '#a46bff', 4.5);
          const pull = 1.45;
          h.x = clamp(h.x + (e.x - h.x) / dHero * pull, 1.2, W - 1.2);
          h.y = clamp(h.y + (e.y - h.y) / dHero * pull, 1.2, H - 1.2);
          addFloat(e.x, e.y - 0.55, '🌀引力牵引!', '#c68cff');
        }
      }
    }

    // Shaman (妖火祭司): buffer heal + frenzy pulse + anti-AFK Demon Fire Meteor on Hero!
    if (e.shaman) {
      e.shamanTimer -= dt;
      if (e.shamanTimer <= 0) {
        e.shamanTimer = 2.6;
        addRing(e.x, e.y, '#ff9f43', 3.4);
        for (const o of game.enemies) {
          if (o.hp > 0 && dist(o, e) <= 3.4) {
            o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp * 0.06));
            o.frenzyT = Math.max(o.frenzyT, 2.4);
          }
        }
        if (dHero <= 7.5) {
          const teleBuf = hasMetaAux('aux_telegraph_buffer') ? 0.20 : 0;
          game.zones.push({
            kind:'bossSlam', leaveLava:true,
            x: clamp(h.x, 1.2, W - 1.2), y: clamp(h.y, 1.2, H - 1.2),
            r: 1.55, t: 1.05 + teleBuf, max: 1.05 + teleBuf, dmg: Math.round(e.dmg * 1.65),
            sourceMeta: { attackerName: e.name || '妖火祭司', attackerKind: e.kind, skillName: '妖火天降点名', isBoss: false, isBossCore: false, isBossAux: false }
          });
          addFloat(e.x, e.y - 0.6, '🔥妖火点名!', '#ff9f43', true);
        }
      }
    }

    // 6 Distinct Boss Mechanics (W5/10/15/20/25/30) + Half-HP Frenzy!
    if (e.boss) {
      if (e.kind !== 'boss6' && !e.frenzied && e.hp <= e.maxHp * 0.5) {
        e.frenzied = true;
        e.spd *= 1.25;
        addRing(e.x, e.y, '#ff4f42', 3.6);
        addFloat(e.x, e.y - 0.8, '🔥 首领半血狂暴！', '#ff4f42', true);
      }

      // Stage 5: W30 Final Boss (boss6) 3-Phase State Machine (Signature Lock + Fair Auxiliary Mechanics)
      if (e.kind === 'boss6') {
        const w30Cfg = BALANCE.w30Boss || {};
        if (e.signatureLockActive) {
          e.hp = Math.max(e.hp, e.signatureThresholdHp);
          e.signatureTimer = Math.max(0, (e.signatureTimer || 0) - dt);
          if (e.signatureStage === 'telegraph' && e.signatureTimer <= 0) {
            const shockSec = w30Cfg.signatureShockwaveSeconds || 2.2;
            e.signatureStage = 'shockwave';
            e.signatureTimer = shockSec;
            const sz = e.signatureSafeZone || { x: clamp(h.x, 4, W - 4), y: clamp(h.y, 4, H - 4), r: w30Cfg.signatureSafeZoneRadius || 2.8 };
            game.zones.push({
              kind: 'w30SigShockwave',
              bossId: e.id,
              x: e.x, y: e.y, r: 17.0,
              safeX: sz.x, safeY: sz.y, safeR: sz.r,
              t: shockSec, max: shockSec,
              dmg: w30Cfg.signatureDamage || 68,
              hitHero: false
            });
            if (game.w30Battle) {
              const at = Number((game.w30Battle.elapsedSeconds || 0).toFixed(2));
              game.w30Battle.phase = 'signature_shockwave';
              game.w30Battle.phaseTimeline.push({
                phase: 'signature_shockwave',
                at,
                bossHpPct: Math.round(e.hp * 100 / Math.max(1, e.maxHp))
              });
            }
            AudioKit.play('boss', 1.18);
            game.shake = Math.max(game.shake, 11);
            addRing(e.x, e.y, '#ff2e63', 5.5);
            addFloat(e.x, e.y - 1.0, '💥 终焉裂空冲击波爆发！', '#ff5c7a', true);
          } else if (e.signatureStage === 'shockwave' && e.signatureTimer <= 0) {
            // IMMEDIATE UNLOCK the instant shockwave finishes -> enter mid_skirmish!
            e.signatureStage = 'done';
            e.signatureLockActive = false;
            e.aiState = 'chase';
            e.bossTimer = Math.min(e.bossTimer || 2.5, 2.2);
            e.bossAuxTimer = Math.min(e.bossAuxTimer || 4.0, 3.6);
            game.zones = game.zones.filter(z => z.kind !== 'w30SigTelegraph' && z.kind !== 'w30SigShockwave');
            if (game.w30Battle) {
              const at = Number((game.w30Battle.elapsedSeconds || 0).toFixed(2));
              game.w30Battle.signatureLockActive = false;
              game.w30Battle.signatureLockEndedAt = at;
              game.w30Battle.phase = 'mid_skirmish';
              game.w30Battle.phaseTimeline.push({
                phase: 'mid_skirmish',
                at,
                bossHpPct: Math.round(e.hp * 100 / Math.max(1, e.maxHp))
              });
            }
            const sz = e.signatureSafeZone || { x: h.x, y: h.y };
            spawnHealOrb(sz.x, sz.y);
            addRing(e.x, e.y, '#72f2b4', 3.4);
            addFloat(e.x, e.y - 0.95, '🔓 终焉锁血解除 · 恢复正常扣血！', '#72f2b4', true);
            showBanner('🔓 终焉冲击波结束 · 首领解除锁血！', '现在可正常造成伤害与吸血，进入中段周旋（35% 进入末段）！', 'good');
          }
          continue; // Channel signature in place (remains hittable for Fire Marks / Frost Slow / Frost Shield!)
        }

        // Mid-skirmish & Final-combo Fair Auxiliary Mechanic Execution
        if (e.signatureTriggered && !e.signatureLockActive) {
          e.bossAuxTimer = (e.bossAuxTimer ?? (w30Cfg.auxCooldownMid || 9.5)) - dt;
          if (e.bossAuxTimer <= 0) {
            e.bossAuxTimer = e.finalPhaseEntered ? (w30Cfg.auxCooldownFinal || 7.5) : (w30Cfg.auxCooldownMid || 9.5);
            e.bossAuxCasts = (e.bossAuxCasts || 0) + 1;
            const auxKey = game.bossIntel?.w30AuxKey || 'abyss_pillars';
            if (game.w30Battle) game.w30Battle.auxTriggers = (game.w30Battle.auxTriggers || 0) + 1;

            if (auxKey === 'abyss_pillars') {
              const hasPillar = game.enemies.some(o => o.hp > 0 && o.pillar);
              if (!hasPillar && game.enemies.length < MAX_ENEMIES) {
                const ang = game.rnd() * Math.PI * 2;
                const px = clamp(e.x + Math.cos(ang) * 3.8, 2.0, W - 2.0);
                const py = clamp(e.y + Math.sin(ang) * 3.8, 2.0, H - 2.0);
                const pil = spawnEnemy('pillar', 'west', 1, { x: px, y: py });
                pil.pillarBossId = e.id;
                addRing(px, py, '#ff78d4', 2.2);
                addFloat(px, py - 0.7, '🔮 护界晶柱降临(击破易伤+回血)!', '#ff9ae0', true);
              } else {
                spawnHealOrb(clamp(h.x + (game.rnd() - 0.5) * 4.5, 2.5, W - 2.5), clamp(h.y + (game.rnd() - 0.5) * 4.5, 2.5, H - 2.5));
              }
            } else if (auxKey === 'eclipse_seekers') {
              const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
              for (let k = 0; k < 5; k++) {
                const a = baseAng + (k - 2) * 0.28;
                pushProjectile({
                  kind: 'enemyShot', w30Aux: 'eclipse_seekers', sx: e.x, sy: e.y, x: e.x, y: e.y,
                  tx: clamp(e.x + Math.cos(a) * 9.2, 0.8, W - 0.8),
                  ty: clamp(e.y + Math.sin(a) * 9.2, 0.8, H - 0.8),
                  t: 0, dur: 0.95, dmg: 30
                });
              }
              addFloat(e.x, e.y - 0.9, '🌑 辅助·星蚀追踪弹！', '#d9a4ff', true);
              if (e.bossAuxCasts % 2 === 0) {
                spawnHealOrb(clamp(h.x + (game.rnd() - 0.5) * 5.0, 2.5, W - 2.5), clamp(h.y + (game.rnd() - 0.5) * 5.0, 2.5, H - 2.5));
              }
            } else if (auxKey === 'rift_rings') {
              game.zones.push({ kind: 'w30RiftRing', w30Aux: 'rift_rings', x: e.x, y: e.y, r: 7.4, t: 1.35, max: 1.35, dmg: 34, hitHero: false });
              game.zones.push({ kind: 'w30RiftRing', w30Aux: 'rift_rings', x: e.x, y: e.y, r: 9.8, t: 2.05, max: 2.05, dmg: 34, hitHero: false });
              addFloat(e.x, e.y - 0.9, '💫 辅助·双重裂空震荡环！', '#ff80c8', true);
              if (e.bossAuxCasts % 2 === 0) {
                spawnHealOrb(clamp(h.x + (game.rnd() - 0.5) * 5.0, 2.5, W - 2.5), clamp(h.y + (game.rnd() - 0.5) * 5.0, 2.5, H - 2.5));
              }
            } else if (auxKey === 'void_guards') {
              const liveGuards = game.enemies.filter(o => o.hp > 0 && o.voidGuard).length;
              const toSpawn = Math.max(0, Math.min(2, 3 - liveGuards));
              for (let k = 0; k < toSpawn; k++) {
                if (game.enemies.length >= MAX_ENEMIES) break;
                const a = game.rnd() * Math.PI * 2;
                spawnEnemy('void_guard', 'west', 1, {
                  x: clamp(e.x + Math.cos(a) * 3.0, 1.5, W - 1.5),
                  y: clamp(e.y + Math.sin(a) * 3.0, 1.5, H - 1.5)
                });
              }
              addFloat(e.x, e.y - 0.9, '👾 辅助·暗潮近卫召临！', '#b896ff', true);
            }
          }
        }
      }

      // Stage 3: W20 Boss (boss4) fair rolled auxiliary mechanic execution
      if (e.kind === 'boss4') {
        if ((e.bossChaseQueue || 0) > 0) {
          e.bossChaseCd = Math.max(0, (e.bossChaseCd || 0) - dt);
          if (e.bossChaseCd <= 0) {
            e.bossChaseQueue--;
            e.bossChaseCd = 0.65;
            const cAng = Math.atan2(h.y - e.y, h.x - e.x);
            for (let k = -1; k <= 2; k++) {
              const a = cAng + (k - 0.5) * 0.20;
              pushProjectile({
                kind: 'enemyShot', w20Aux: 'chase_barrage', sx: e.x, sy: e.y, x: e.x, y: e.y,
                tx: clamp(e.x + Math.cos(a) * 8.4, 0.8, W - 0.8),
                ty: clamp(e.y + Math.sin(a) * 8.4, 0.8, H - 0.8),
                t: 0, dur: 0.84, dmg: 28
              });
            }
          }
        }
        e.bossAuxTimer = (e.bossAuxTimer ?? 3.6) - dt;
        if (e.bossAuxTimer <= 0) {
          e.bossAuxTimer = e.frenzied ? 5.2 : 6.6;
          const auxKey = game.bossIntel?.w20AuxKey || 'oppression_ring';
          if (game.stats) game.stats.w20BossAuxTriggers = (game.stats.w20BossAuxTriggers || 0) + 1;
          if (auxKey === 'oppression_ring') {
            game.zones.push({ kind: 'bossWave', w20Aux: 'oppression_ring', x: e.x, y: e.y, r: 6.2, t: 1.25, max: 1.25, dmg: 38, hitHero: false });
            addFloat(e.x, e.y - 0.9, '🔴 辅助机制·领域压迫环！', '#ff6e9c', true);
          } else if (auxKey === 'shield_totem') {
            const hasTotem = game.enemies.some(o => o.hp > 0 && o.totem);
            if (!hasTotem && game.enemies.length < MAX_ENEMIES) {
              const ang = game.rnd() * Math.PI * 2;
              const tx = clamp(e.x + Math.cos(ang) * 3.0, 1.4, W - 1.4);
              const ty = clamp(e.y + Math.sin(ang) * 3.0, 1.4, H - 1.4);
              const tot = spawnEnemy('totem', 'west', 1, { x: tx, y: ty });
              tot.totemBossId = e.id;
              addRing(tx, ty, '#6ce2ff', 2.0);
              addFloat(tx, ty - 0.65, '🛡️ 护盾图腾降临（可击碎）!', '#8ef4ff', true);
            } else {
              e.shield = Math.min(Math.round(e.maxHp * 0.14), (e.shield || 0) + 140);
            }
          } else if (auxKey === 'chase_barrage') {
            e.bossChaseQueue = 2;
            e.bossChaseCd = 0.01;
            addRing(e.x, e.y, '#d47cff', 2.2);
            addFloat(e.x, e.y - 0.9, '🟣 辅助机制·追击弹幕！', '#dfb0ff', true);
          } else if (auxKey === 'charged_shockwave') {
            const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
            for (const a of dirs) {
              game.zones.push({
                kind: 'bossSlam', w20Aux: 'charged_shockwave',
                x: clamp(h.x + Math.cos(a) * 2.1, 1, W - 1),
                y: clamp(h.y + Math.sin(a) * 2.1, 1, H - 1),
                r: 1.85, t: 1.30, max: 1.30, dmg: 42
              });
            }
            addFloat(e.x, e.y - 0.9, '💥 辅助机制·蓄力震荡波！', '#ff9852', true);
          }
        }
      }
      e.bossTimer -= dt;
      if (e.bossTimer <= 0) {
        e.bossTimer = e.frenzied ? 4.5 : 6.0;
        const scale = Math.pow(BALANCE.wave.normalHpGrowth || 1.115, game.wave - 1);
        const teleBuf = hasMetaAux('aux_telegraph_buffer') ? 0.20 : 0;
        if (e.kind === 'boss1') {
          // 熔岩巨魔 (W5): Charge + 2 lava slam zones + summon 2 bombers
          const len = Math.max(0.01, dHero);
          e.aiState = 'windup'; e.aiTimer = 0.55; e.aiKind = 'charge';
          e.slow = 0; e.slowT = 0; e.freezeT = 0;
          e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
          for (let k = 0; k < 2; k++) {
            const ang = game.rnd() * Math.PI * 2;
            const dOff = k === 0 ? 0 : 2.1;
            game.zones.push({
              kind:'bossSlam', leaveLava:true, x: clamp(h.x + Math.cos(ang)*dOff, 1, W-1), y: clamp(h.y + Math.sin(ang)*dOff, 1, H-1),
              r: 1.9, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 30,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '熔岩裂地重击 (W5核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          addFloat(e.x, e.y - 0.7, '🔥 熔岩冲撞！', '#ff8c70', true);
          for (let k = 0; k < 2; k++) {
            if (game.enemies.length >= MAX_ENEMIES) break;
            spawnEnemy('bomber', 'west', scale, { x: clamp(e.x + (game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (game.rnd()-0.5)*1.8, 0.8, H-0.8) });
          }
        } else if (e.kind === 'boss2') {
          // 暗影死灵王 (W10): 10-orb ring volley + slam + 4 wolves
          for (let k = 0; k < 10; k++) {
            const ang = (Math.PI * 2 * k) / 10 + game.waveClock;
            pushProjectile({
              kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
              tx: clamp(e.x + Math.cos(ang) * 7.2, 0.8, W-0.8),
              ty: clamp(e.y + Math.sin(ang) * 7.2, 0.8, H-0.8),
              t:0, dur: 0.88, dmg: 26,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '死灵环状弹幕 (W10核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          game.zones.push({
            kind:'bossSlam', x: h.x, y: h.y, r: 2.1, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 34,
            sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '死灵裂地重击 (W10核心)', isBoss: true, isBossCore: true, isBossAux: false }
          });
          addFloat(e.x, e.y - 0.7, '💀 死灵弹幕阵！', '#d284ff', true);
          for (let k = 0; k < 4; k++) {
            if (game.enemies.length >= MAX_ENEMIES) break;
            const a = (Math.PI * 2 * k) / 4;
            spawnEnemy('wolf', 'west', scale, { x: clamp(h.x + Math.cos(a)*5.5, 0.8, W-0.8), y: clamp(h.y + Math.sin(a)*5.5, 0.8, H-0.8) });
          }
        } else if (e.kind === 'boss3') {
          // 毁灭泰坦 (W15): Leap Slam + Expanding Shockwave Ring + 2 Brutes
          game.zones.push({
            kind:'bossSlam', x: h.x, y: h.y, r: 2.7, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 44,
            sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '泰坦重踏 (W15核心)', isBoss: true, isBossCore: true, isBossAux: false }
          });
          game.zones.push({
            kind:'bossWave', x: e.x, y: e.y, r: 5.8, t: 1.15 + teleBuf, max: 1.15 + teleBuf, dmg: 36, hitHero: false,
            sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '泰坦裂地震波 (W15核心)', isBoss: true, isBossCore: true, isBossAux: false }
          });
          addFloat(e.x, e.y - 0.7, '💥 泰坦裂地波！', '#ff5247', true);
          for (let k = 0; k < 2; k++) {
            if (game.enemies.length >= MAX_ENEMIES) break;
            spawnEnemy('brute', 'west', scale, { x: clamp(e.x + (game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (game.rnd()-0.5)*1.8, 0.8, H-0.8) });
          }
        } else if (e.kind === 'boss4') {
          // 天劫魔尊 (W20): Fixed Core = 3 telegraphed thunder slam zones + 6 lightning orbs + 2 Brutes
          for (let k = 0; k < 3; k++) {
            const ang = (Math.PI * 2 * k) / 3 + game.rnd() * 0.6;
            const distOff = k === 0 ? 0 : 2.3;
            game.zones.push({
              kind:'bossSlam', x: clamp(h.x + Math.cos(ang)*distOff, 1, W-1), y: clamp(h.y + Math.sin(ang)*distOff, 1, H-1),
              r: 2.0, t: 1.2 + teleBuf, max: 1.2 + teleBuf, dmg: 46,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '天劫三重雷域 (W20固定核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
          for (let k = 0; k < 6; k++) {
            const a = baseAng + (k - 2.5) * 0.28;
            pushProjectile({
              kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
              tx: clamp(e.x + Math.cos(a) * 8.0, 0.8, W-0.8),
              ty: clamp(e.y + Math.sin(a) * 8.0, 0.8, H-0.8),
              t:0, dur: 0.78, dmg: 32,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '天劫扇形紫电弹幕 (W20固定核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          addFloat(e.x, e.y - 0.7, '⚡ 天劫重雷降临！', '#ff70a8', true);
          for (let k = 0; k < 2; k++) {
            if (game.enemies.length >= MAX_ENEMIES) break;
            spawnEnemy('brute', 'west', scale, { x: clamp(e.x + (game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (game.rnd()-0.5)*1.8, 0.8, H-0.8) });
          }
        } else if (e.kind === 'boss5') {
          // 玄冥妖皇 (W25): Expanding frost-fire shockwave + 8 aimed shots + 2 Shamans
          game.zones.push({
            kind:'bossWave', x: e.x, y: e.y, r: 6.4, t: 1.15 + teleBuf, max: 1.15 + teleBuf, dmg: 44, hitHero: false,
            sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '玄冥寒潮震波 (W25核心)', isBoss: true, isBossCore: true, isBossAux: false }
          });
          for (let k = 0; k < 8; k++) {
            const ang = (Math.PI * 2 * k) / 8 + game.waveClock;
            pushProjectile({
              kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
              tx: clamp(e.x + Math.cos(ang) * 8.2, 0.8, W-0.8),
              ty: clamp(e.y + Math.sin(ang) * 8.2, 0.8, H-0.8),
              t:0, dur: 0.80, dmg: 36,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '玄冥寒炎齐射 (W25核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          addFloat(e.x, e.y - 0.7, '❄️ 玄冥寒潮领域！', '#6ef0ff', true);
          for (let k = 0; k < 2; k++) {
            if (game.enemies.length >= MAX_ENEMIES) break;
            spawnEnemy('shaman', 'west', scale, { x: clamp(e.x + (game.rnd()-0.5)*2.0, 0.8, W-0.8), y: clamp(e.y + (game.rnd()-0.5)*2.0, 0.8, H-0.8) });
          }
        } else {
          // Stage 5: 深渊主宰 (W30 Boss 6) 3-Phase Core Attacks (opening -> mid_skirmish -> final_combo)
          const w30Cfg = BALANCE.w30Boss || {};
          e.bossTimer = e.finalPhaseEntered
            ? (w30Cfg.coreCooldownFinal || 3.4)
            : e.signatureTriggered
              ? (w30Cfg.coreCooldownMid || 4.4)
              : (w30Cfg.coreCooldownOpening || 5.2);
          const slamCount = e.finalPhaseEntered ? 4 : e.signatureTriggered ? 3 : 2;
          const orbCount = e.finalPhaseEntered ? 8 : e.signatureTriggered ? 6 : 5;
          for (let k = 0; k < slamCount; k++) {
            const ang = (Math.PI * 2 * k) / slamCount + game.rnd() * 0.5;
            const distOff = k === 0 ? 0 : 2.6;
            const dur = (e.finalPhaseEntered ? 1.18 : 1.28) + teleBuf;
            game.zones.push({
              kind: 'bossSlam',
              leaveLava: !!e.finalPhaseEntered,
              x: clamp(h.x + Math.cos(ang) * distOff, 1.2, W - 1.2),
              y: clamp(h.y + Math.sin(ang) * distOff, 1.2, H - 1.2),
              r: e.finalPhaseEntered ? 2.15 : 1.95,
              t: dur,
              max: dur,
              dmg: e.finalPhaseEntered ? 44 : 36,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: e.finalPhaseEntered ? '终末裂界重击 (W30核心)' : '深渊裂界重击 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          if (e.finalPhaseEntered) {
            game.zones.push({
              kind: 'w30RiftRing', x: e.x, y: e.y, r: 7.5, t: 1.25 + teleBuf, max: 1.25 + teleBuf, dmg: 38, hitHero: false,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '终末扩散震荡波 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
          for (let k = 0; k < orbCount; k++) {
            const a = baseAng + (k - (orbCount - 1) / 2) * 0.24;
            pushProjectile({
              kind: 'enemyShot', sx: e.x, sy: e.y, x: e.x, y: e.y,
              tx: clamp(e.x + Math.cos(a) * 8.6, 0.8, W - 0.8),
              ty: clamp(e.y + Math.sin(a) * 8.6, 0.8, H - 0.8),
              t: 0, dur: 0.86, dmg: e.finalPhaseEntered ? 34 : 28,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: e.finalPhaseEntered ? '终末深渊弹幕 (W30核心)' : '深渊齐射弹幕 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
          }
          addFloat(e.x, e.y - 0.75, e.finalPhaseEntered ? '👑 终末组合·深渊裂界！' : '👑 深渊主宰·裂界轰击！', '#ff80b5', true);
        }
      }
    }

    // Windup / Leap / Charge state machine (Wolf leap & Brute/Boss charge - UNSTOPPABLE!)
    if (e.aiState === 'windup') {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = e.aiKind === 'leap' ? 'leap' : 'charge';
        e.aiTimer = e.aiState === 'leap' ? 0.30 : 0.48;
        e.slow = 0; e.slowT = 0; e.freezeT = 0;
      }
      continue;
    }
    if (e.aiState === 'leap' || e.aiState === 'charge') {
      e.aiTimer -= dt;
      const mult = e.aiState === 'leap' ? 3.1 : 3.6;
      e.x = clamp(e.x + e.aiVx * e.spd * mult * dt, 0.4, W - 0.4);
      e.y = clamp(e.y + e.aiVy * e.spd * mult * dt, 0.4, H - 0.4);
      if (dist(e, h) <= 0.65 + e.r && e.cd <= 0) {
        e.cd = 0.85;
        h.armorBreakT = 2.5;
        addFloat(h.x, h.y - 0.65, '💔 破甲重创!', '#ff6b57', true);
        damageHero(Math.round(e.dmg * (e.aiState === 'charge' ? 1.50 : 1.25)), {
          attackerName: e.name || e.kind,
          attackerKind: e.kind,
          skillName: e.aiState === 'charge' ? '霸体冲锋破甲' : '飞扑突袭破甲',
          isBoss: !!e.boss,
          isBossCore: !!e.boss,
          isBossAux: false
        });
      }
      if (e.aiTimer <= 0) e.aiState = 'chase';
      continue;
    }

    // Trigger Wolf Leap or Brute Charge (clears slow/freeze & enters unstoppable windup!)
    if (e.leaper && e.aiCd <= 0 && dHero >= 2.0 && dHero <= 4.4) {
      e.aiCd = 3.2 + game.rnd() * 1.2;
      e.aiState = 'windup'; e.aiKind = 'leap'; e.aiTimer = 0.36;
      e.slow = 0; e.slowT = 0; e.freezeT = 0;
      const len = Math.max(0.01, dHero);
      e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
      continue;
    }
    if (e.charger && e.aiCd <= 0 && dHero >= 1.8 && dHero <= 5.5) {
      e.aiCd = 4.6 + game.rnd() * 1.2;
      e.aiState = 'windup'; e.aiKind = 'charge'; e.aiTimer = 0.55;
      e.slow = 0; e.slowT = 0; e.freezeT = 0;
      const len = Math.max(0.01, dHero);
      e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
      continue;
    }

    // Ranged Mage & Shaman standoff
    if ((e.ranged || e.shaman) && dHero <= e.range) {
      if (e.ranged && e.cd <= 0) {
        e.cd = 1.50;
        const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
        const shots = game.wave >= 8 ? [-0.16, 0.16] : [0];
        for (const off of shots) {
          const a = baseAng + off;
          const tx = clamp(e.x + Math.cos(a) * Math.min(dHero + 0.6, e.range), 0.8, W - 0.8);
          const ty = clamp(e.y + Math.sin(a) * Math.min(dHero + 0.6, e.range), 0.8, H - 0.8);
          pushProjectile({
            kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y, tx, ty,
            t:0, dur: Math.max(0.42, dHero / 7.5), dmg: e.dmg,
            sourceMeta: { attackerName: e.name || '暗影法师', attackerKind: e.kind, skillName: '奥术弹幕', isBoss: false, isBossCore: false, isBossAux: false }
          });
        }
      }
      continue;
    }

    const hitDist = 0.62 + e.r;
    if (dHero <= hitDist) {
      if (e.cd <= 0) {
        e.cd = 0.95;
        damageHero(e.dmg, {
          attackerName: e.name || e.kind,
          attackerKind: e.kind,
          skillName: e.kind === 'void_guard' ? '暗潮近卫突刺 (W30随机辅助)' : e.boss ? '首领近身重击' : '近身撞击',
          isBoss: !!e.boss,
          isBossCore: !!e.boss,
          isBossAux: e.kind === 'void_guard',
          auxKey: e.kind === 'void_guard' ? 'void_guards' : null
        });
      }
      continue;
    }

    const auraSlow = (wfFrostAura && dHero <= 3.4) ? 0.22 : 0;
    const effSlow = (e.charger || e.isShrineBoss) ? Math.max(e.slow, auraSlow) * 0.40 : Math.max(e.slow, auraSlow);
    const frenzyBoost = e.frenzyT > 0 ? 1.35 : 1.0;
    const curSpd = e.spd * Math.max(0.25, 1 - effSlow) * frenzyBoost;
    const mx = (h.x - e.x) / Math.max(0.01, dHero);
    const my = (h.y - e.y) / Math.max(0.01, dHero);
    e.x = clamp(e.x + mx * curSpd * dt, 0.4, W - 0.4);
    e.y = clamp(e.y + my * curSpd * dt, 0.4, H - 0.4);
  }

  // Light separation
  for (let i = 0; i < game.enemies.length; i++) {
    const a = game.enemies[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < Math.min(game.enemies.length, i + 14); j++) {
      const b = game.enemies[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), md = a.r + b.r;
      if (d > 0.001 && d < md) {
        const push = (md - d) * 0.28;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
    }
  }
  game.enemies = game.enemies.filter(e => e.hp > 0);
}

function updatePickups(dt){
  const h = game.hero;
  const hs = getHeroStats();
  if (game.xpComboTimer > 0) { game.xpComboTimer -= dt; if (game.xpComboTimer <= 0) game.xpCombo = 0; }
  const isHarvest = game.phase === 'harvest';

  for (const g of game.gems) {
    g.t += dt;
    if (!isHarvest && g.t < 0.22) { g.x += g.vx * dt; g.y += g.vy * dt; continue; }
    const d = dist(g, h);
    if (isHarvest || d <= hs.magnet || g.magnetized) {
      g.magnetized = true;
      const spd = isHarvest ? 28.0 : 14.5;
      if (d <= 0.55) {
        g.done = true;
        gainHeroXp(g.xp);
      } else {
        g.x += (h.x - g.x) / d * spd * dt;
        g.y += (h.y - g.y) / d * spd * dt;
      }
    }
  }
  game.gems = game.gems.filter(g => !g.done);

  // Ground chests stay pickable in both wave & prep phases!
  for (const c of game.chests) {
    c.bob += dt * 4.5;
    if (dist(c, h) <= 1.15) {
      c.done = true;
      queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
      AudioKit.play('chest', 1.15);
    }
  }
  game.chests = game.chests.filter(c => !c.done);

  // Stage 5: W30 Healing Spirit Orbs (sustain for non-lifesteal kiting builds across 3-5 min boss fight)
  if (game.healOrbs && game.healOrbs.length) {
    for (const orb of game.healOrbs) {
      orb.life -= dt;
      orb.bob = (orb.bob || 0) + dt * 5.0;
      const d = dist(orb, h);
      const holyOrbBonus = getActiveMetaMain()?.id === 'main_holy' ? Number(getActiveMetaMain()?.effects?.healOrbMagnetBonus || 0.7) : 0;
      if (d <= 2.8 + holyOrbBonus) {
        const pullSpd = 10.5;
        if (d <= 0.95) {
          orb.done = true;
          const healAmt = Math.max(25, Math.round(h.maxHp * (orb.hpPct || 0.18)));
          const prevHp = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + healAmt);
          const actualHeal = Math.round(h.hp - prevHp);
          if ((orb.shield || 0) > 0 && h.shield < orb.shield) {
            const prevOrbShield = h.shield || 0;
            h.shield = Math.max(prevOrbShield, orb.shield);
            const orbShieldGain = Math.max(0, Math.round(h.shield - prevOrbShield));
            if (orbShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + orbShieldGain;
            h.shieldTimer = Math.max(h.shieldTimer || 0, 4.5);
          }
          if (game.w30Battle) game.w30Battle.healOrbsCollected = (game.w30Battle.healOrbsCollected || 0) + 1;
          addRing(h.x, h.y, '#62ffb8', 1.6);
          addFloat(h.x, h.y - 0.6, `💚 灵气回血 +${actualHeal || healAmt}`, '#72f2b4', true);
          AudioKit.play('holy', 1.15);
        } else {
          orb.x += (h.x - orb.x) / d * pullSpd * dt;
          orb.y += (h.y - orb.y) / d * pullSpd * dt;
        }
      }
    }
    game.healOrbs = game.healOrbs.filter(o => !o.done && o.life > 0);
  }
}

function gainHeroXp(amt){
  const h = game.hero;
  h.xp += amt;
  game.xpCombo = Math.min(14, game.xpCombo + 1);
  game.xpComboTimer = 0.65;
  AudioKit.play('xp', 1 + game.xpCombo * 0.045);

  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.lv++;
    h.xpNext = xpForLevel(h.lv);
    h.realm = getActiveUnlockNode().idx;
    const pickModalTurn = h.lv % 2 === 0;
    h.baseMaxHp += pickModalTurn ? BALANCE.progression.hpEvenLevelGain : BALANCE.progression.hpOddLevelGain;
    syncHeroMaxHp();
    h.hp = Math.min(h.maxHp, h.hp + (pickModalTurn ? BALANCE.progression.hpEvenLevelHeal : BALANCE.progression.hpOddLevelHeal));
    addRing(h.x, h.y, '#7ce8ff', 2.4);
    AudioKit.play('level');
    if (pickModalTurn) {
      addFloat(h.x, h.y - 0.6, `✨ ${getRealmStageLabel()} Lv.${h.lv} · 领悟神通！`, '#8cf4ff', true);
      queueModal({ type:'levelup' });
    } else {
      addFloat(h.x, h.y - 0.6, `✨ ${getRealmStageLabel()} Lv.${h.lv} · 灵脉淬体！`, '#72f2b4', true);
      toast(`✨ 等级提升【${getRealmStageLabel()} Lv.${h.lv}】！灵脉自动淬炼：生命上限 +${BALANCE.progression.hpOddLevelGain}、恢复 +${BALANCE.progression.hpOddLevelHeal}（下级可选神通卡）`);
    }
  }
}

function getCombatLogNowSec(){
  if (!game) return 0;
  if (game.combatLog && Number.isFinite(game.combatLog.settledAtRunClock)) {
    return game.combatLog.settledAtRunClock;
  }
  const rmSec = Number(game.runMetrics?.totalEffectiveSec || 0);
  const waveSec = Number(game.waveClock || 0);
  return Number(Math.max(rmSec, waveSec).toFixed(2));
}

function getRecentThreatSummary(windowSec = 5.0){
  const log = game?.combatLog;
  const nowT = getCombatLogNowSec();
  const cutoff = Math.max(0, nowT - windowSec);
  if (!log || !log.hits.length) {
    return { windowSec, anchorSec: nowT, hitCount: 0, totalHpLost: 0, totalDmg: 0, hits: [], topThreats: [], fatalSource: log?.fatalSource || null };
  }
  const recent = log.hits.filter(h => {
    const t = Number(h.runClock ?? 0);
    return t >= cutoff && t <= nowT + 1e-6;
  });
  const agg = new Map();
  let totalHpLost = 0;
  for (const h of recent) {
    totalHpLost += h.hpLost;
    const key = `${h.attackerName}｜${h.skillName}`;
    const cur = agg.get(key) || {
      attackerName: h.attackerName,
      skillName: h.skillName,
      isBossCore: h.isBossCore,
      isBossAux: h.isBossAux,
      hits: 0,
      totalHpLost: 0,
      maxSingleHit: 0
    };
    cur.hits++;
    cur.totalHpLost += h.hpLost;
    cur.maxSingleHit = Math.max(cur.maxSingleHit, h.hpLost);
    agg.set(key, cur);
  }
  const topThreats = Array.from(agg.values()).sort((a, b) => (b.totalHpLost - a.totalHpLost) || (b.hits - a.hits));
  return {
    windowSec,
    anchorSec: nowT,
    hitCount: recent.length,
    totalHpLost,
    totalDmg: totalHpLost,
    hits: recent.map(h => ({ ...h })),
    topThreats,
    fatalSource: log.fatalSource || null
  };
}

function damageHero(amt, sourceMeta = null){
  const h = game.hero;
  if (h.invuln > 0 || !['prep','wave'].includes(game.phase)) return;
  const holyInvulnBonus = getActiveMetaMain()?.id === 'main_holy' ? Number(getActiveMetaMain()?.effects?.invulnBonus || 0.10) : 0;
  h.invuln = 0.28 + holyInvulnBonus;
  let rem = amt;
  const gm = aggregateGear(h.gear);
  if ((h.armorBreakT || 0) > 0) rem = Math.round(rem * 1.25);
  if (perkLv('frost_domain') >= 2) rem = Math.max(1, Math.round(rem * 0.80));
  if (gearSetTier('blood') >= 3 && h.hp <= h.maxHp * 0.5) rem = Math.max(1, Math.round(rem * 0.78));
  if (gm.dmgReduce > 0) rem = Math.max(1, Math.round(rem * (1 - gm.dmgReduce)));
  if (hasDestinyEnhancement('destiny_aegis_bulwark')) rem = Math.max(1, Math.round(rem * 0.90));
  // Stage 6 Aux Legacy [aux_tactical_reserve] (3 pts): once per wave deflect membrane reduces a >25% maxHp heavy hit by 35%
  let deflected = false;
  if (hasMetaAux('aux_tactical_reserve') && game.metaRunState?.deflectReady && rem >= Math.round(h.maxHp * 0.25)) {
    game.metaRunState.deflectReady = false;
    game.metaRunState.deflectTriggers = (game.metaRunState.deflectTriggers || 0) + 1;
    rem = Math.max(1, Math.round(rem * 0.65));
    deflected = true;
    addRing(h.x, h.y, '#8ef4ff', 1.9);
    addFloat(h.x, h.y - 0.72, '🛡️ 奇门偏折 -35%!', '#8ef4ff', true);
  }
  const rawDamageAfterMitigation = Math.max(0, Math.round(rem));
  const hadFrostShield = h.shield > 0 && h.frostShieldActive;
  const gearSyn = getActiveGearAffixSynergies();
  if (hadFrostShield && (gearSyn.hasFrostTrio || hasW20Direction('frost_bastion_counter'))) {
    const sc = BALANCE.equipment?.synergyCombat || {};
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    const pRad = hasW20Direction('frost_bastion_counter') ? Math.max(sc.frostTrioHitPulseRadius || 3.1, be.frostBasePulseRadius || 3.05) : (sc.frostTrioHitPulseRadius || 3.1);
    const pDmg = hasW20Direction('frost_bastion_counter') ? Math.max(sc.frostTrioHitPulseDmg || 44, be.frostBasePulseDmg || 46) : (sc.frostTrioHitPulseDmg || 44);
    triggerFrostPulse(pRad, pDmg, 1.0, 'shield_hit');
  } else if (hadFrostShield && h.w10Branch?.nova === 'nv_prism_lance') {
    triggerFrostPulse(2.8, 36, 0.9, 'w10');
  }
  let shieldAbsorbed = 0;
  if (h.shield > 0) {
    shieldAbsorbed = Math.min(h.shield, rem);
    h.shield -= shieldAbsorbed;
    rem -= shieldAbsorbed;
  }
  if (hadFrostShield && h.shield <= 0) {
    h.frostShieldActive = false;
    if (gearSetTier('frost') >= 3 || h.w10Branch?.nova === 'nv_glacial_bastion') {
      triggerFrostPulse(3.2, 42, 1.0, 'w10');
    }
  }
  const prevHp = h.hp;
  let actualHpLoss = 0;
  if (rem > 0) {
    h.hp = Math.max(0, h.hp - rem);
    actualHpLoss = Math.max(0, Math.round(prevHp - h.hp));
    game.shake = Math.max(game.shake, 5.2);
    flashScreen('dmg');
    addFloat(h.x, h.y - 0.45, `-${actualHpLoss || Math.round(rem)}`, '#ff7666', actualHpLoss >= 18);
    AudioKit.play('hit');
    if (game.curWaveTel) {
      game.curWaveTel.hitsTaken++;
      game.curWaveTel.dmgTaken += actualHpLoss;
      game.curWaveTel.minHpPct = Math.min(game.curWaveTel.minHpPct, Math.round(h.hp * 100 / Math.max(1, h.maxHp)));
    }
    if (game.runMetrics) {
      game.runMetrics.hpLost = (game.runMetrics.hpLost || 0) + actualHpLoss;
    }
  }
  $('hpVignette')?.classList.toggle('danger', h.hp > 0 && h.hp < h.maxHp * 0.35);

  // Stage 6: Real combat hit & fatal attribution log (NEVER fabricates entries; strictly records actualHpLoss!)
  const meta = sourceMeta && typeof sourceMeta === 'object' ? sourceMeta : {};
  const hpPctAfter = Math.round(h.hp * 100 / Math.max(1, h.maxHp));
  const hitEntry = {
    wave: game.wave,
    waveClock: Number((game.waveClock || 0).toFixed(2)),
    runClock: getCombatLogNowSec(),
    attackerName: meta.attackerName || '战场敌人',
    attackerKind: meta.attackerKind || 'unknown',
    skillName: meta.skillName || '攻击命中',
    isBoss: !!meta.isBoss,
    isBossCore: !!meta.isBossCore,
    isBossAux: !!meta.isBossAux,
    auxKey: meta.auxKey || null,
    rawAmt: Math.round(amt),
    rawDamageAfterMitigation,
    shieldAbsorbed: Math.round(shieldAbsorbed),
    hpLost: actualHpLoss,
    hpAfter: Math.round(h.hp),
    hpPctAfter,
    deflected,
    fatal: false
  };
  if (game.combatLog) {
    game.combatLog.hits.push(hitEntry);
    if (game.combatLog.hits.length > 160) game.combatLog.hits.shift();
    game.combatLog.lowestHpPct = Math.min(game.combatLog.lowestHpPct, hpPctAfter);
    game.combatLog.totalHitsTaken++;
    game.combatLog.totalHpLost += hitEntry.hpLost;
    game.combatLog.totalShieldAbsorbed += hitEntry.shieldAbsorbed;
    const skey = `${hitEntry.attackerName}｜${hitEntry.skillName}`;
    const prev = game.combatLog.bySource[skey] || {
      attackerName: hitEntry.attackerName,
      skillName: hitEntry.skillName,
      isBossCore: hitEntry.isBossCore,
      isBossAux: hitEntry.isBossAux,
      hits: 0,
      totalHpLost: 0,
      maxSingleHit: 0
    };
    prev.hits++;
    prev.totalHpLost += hitEntry.hpLost;
    prev.maxSingleHit = Math.max(prev.maxSingleHit, hitEntry.hpLost);
    game.combatLog.bySource[skey] = prev;
  }

  // Body Thorns perk (金刚反震): reactive shockwave + shield on hit
  const btLv = perkLv('body_thorns');
  if (btLv > 0 && h.thornsCd <= 0 && h.hp > 0) {
    h.thornsCd = 3.0;
    const prevBtShield = h.shield || 0;
    h.shield = Math.max(prevBtShield, btLv >= 2 ? 60 : 28);
    const btShieldGain = Math.max(0, Math.round(h.shield - prevBtShield));
    if (btShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + btShieldGain;
    h.shieldTimer = 4.0;
    if (btLv >= 2) h.hp = Math.min(h.maxHp, h.hp + 15);
    addRing(h.x, h.y, '#ffe478', 3.0);
    const hs = getHeroStats();
    for (const e of game.enemies) {
      if (e.hp > 0 && dist(h, e) <= 3.1 + e.r) {
        dealDamage(e, Math.round((btLv >= 2 ? 55 : 32) * hs.dmgMult), { fromHero:false, skillKey:'perk', col:'#ffe88a' });
        if (btLv >= 2 && !e.boss) e.freezeT = Math.max(e.freezeT, 1.0);
      }
    }
  }
  // Undying Will perk (不灭金身): once per wave fatal save!
  if (h.hp <= 0) {
    const uwLv = perkLv('undying_will');
    if (uwLv > 0 && h.undyingUsedWave !== game.wave) {
      h.undyingUsedWave = game.wave;
      h.hp = Math.round(h.maxHp * (uwLv >= 2 ? 0.80 : 0.50));
      h.invuln = 2.5;
      if (uwLv >= 2) h.ultTimer = Math.max(h.ultTimer, 4.0);
      game.shake = 10;
      addRing(h.x, h.y, '#ffe878', 6.0);
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(h, e) <= 6.0) dealDamage(e, Math.round(120 * getHeroStats().dmgMult), { fromHero:false, skillKey:'perk', col:'#ffe878' });
      }
      $('hpVignette')?.classList.toggle('danger', h.hp < h.maxHp * 0.35);
      showBanner('👑 不灭金身触发！', uwLv >= 2 ? '回血 80% + 无敌 2.5s + 4s 全军超载！' : '回血 50% + 无敌 2.5s + 清屏震爆！', 'good');
      AudioKit.play('level', 1.2);
      return;
    }
    hitEntry.fatal = true;
    if (game.combatLog) game.combatLog.fatalSource = hitEntry;
    finishGame(false);
  }
}

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

function pickHeroSkill(key){
  if (!game || !HERO_SKILLS[key]) return false;
  const m = game.activeModal;
  if (!m || (m.type !== 'starter' && m.type !== 'levelup')) return false;
  if (m.claimed) return false;
  if (!Array.isArray(m.choices) || !m.choices.includes(key)) return false;
  if ((game.hero.skills[key] || 0) >= 5) return false;

  // ATOMIC SINGLE-CLAIM LOCK BEFORE STATE MUTATION
  m.claimed = true;
  m.claimedChoice = key;

  if (!game.metaRunLocked) lockMetaLoadoutForRun();
  game.hero.skills[key] = (game.hero.skills[key] || 0) + 1;
  AudioKit.play('merge', 1.1);
  toast(`领主习得【${HERO_SKILLS[key].name} Lv.${game.hero.skills[key]}】！`);
  refreshCombos(true);
  closeModal();
  renderAllUI(true);
  return true;
}

/* ==================== W10 FIRST MAJOR BREAKTHROUGH (DESIGNATE LEARNED SKILL -> 3 RANDOM BRANCHES) ==================== */
function getLearnedSkillKeys(){
  const h = game.hero;
  const learned = Object.keys(h.skills).filter(k => (h.skills[k] || 0) > 0 && W10_SKILL_BRANCHES[k]?.length);
  if (learned.length) return learned;
  return ['firewave'];
}

function rollW10BranchChoices(skillKey){
  const pool = (W10_SKILL_BRANCHES[skillKey] || []).slice();
  const out = [];
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(Math.floor(game.rnd() * pool.length), 1)[0]);
  }
  return out;
}

function selectW10BreakthroughSkill(skillKey){
  if (!game) return { ok: false, reason: 'no_game' };
  const learned = getLearnedSkillKeys();
  if (!learned.includes(skillKey)) {
    return { ok: false, reason: 'skill_not_learned', learned };
  }
  const branches = rollW10BranchChoices(skillKey);
  game.w10Draft = {
    skillKey,
    choices: branches.map(b => b.key),
    branches
  };
  if (game.activeModal && game.activeModal.type === 'w10_breakthrough') {
    game.activeModal.step = 'pick_branch';
    renderW10BreakthroughModal();
  }
  return { ok: true, skillKey, choices: branches };
}

function pickW10BreakthroughBranch(branchKey){
  if (!game || !game.w10Draft || !game.w10Draft.skillKey) {
    return { ok: false, reason: 'no_w10_skill_selected' };
  }
  const skillKey = game.w10Draft.skillKey;
  const allBranches = W10_SKILL_BRANCHES[skillKey] || [];
  const branch = allBranches.find(b => b.key === branchKey);
  if (!branch) {
    return { ok: false, reason: 'invalid_branch_key', skillKey };
  }
  const h = game.hero;
  h.w10Branch[skillKey] = branch.key;
  h.breakthroughs.w10 = {
    wave: 10,
    completed: true,
    skillKey,
    skillName: HERO_SKILLS[skillKey]?.name || skillKey,
    branchKey: branch.key,
    branchName: branch.name,
    tag: branch.tag,
    hook: branch.hook || branch.hookType,
    hookType: branch.hookType || branch.hook,
    desc: branch.desc
  };
  game.pendingBreakthrough = null;
  game.w10Draft = null;
  game.stats.breakthroughsCompleted = (game.stats.breakthroughsCompleted || 0) + 1;
  h.realm = getActiveUnlockNode().idx;
  h.baseMaxHp += 40;
  syncHeroMaxHp();
  h.hp = Math.min(h.maxHp, h.hp + 80);
  flashScreen('gold');
  AudioKit.play('level', 1.25);
  addRing(h.x, h.y, '#ffd666', 4.2);
  showBanner(
    `⚡ W10 大型突破完成 · 【${HERO_SKILLS[skillKey]?.name} · ${branch.name}】！`,
    `主灵印上限升至 ${getSealStarCap()}★ · 辅灵印扩至 ${getSubSealSlotCap()} 槽 · 解锁【重锤震地】神通池！`,
    'good'
  );
  if (game.activeModal && game.activeModal.type === 'w10_breakthrough') {
    closeModal();
  }
  refreshCombos(true);
  renderAllUI(true);
  return { ok: true, breakthrough: h.breakthroughs.w10 };
}

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
function isW20PreselectOpen(){
  if (!game) return false;
  const openWave = BALANCE.w20Breakthrough?.preselectOpenWave || 16;
  return game.wave >= openWave && game.wave <= 20 && !game.w20State?.locked && !game.hero?.breakthroughs?.w20;
}

function isW20BossIntelRevealed(){
  if (!game) return false;
  const revealWave = BALANCE.w20Breakthrough?.bossIntelRevealWave || 19;
  return game.wave >= revealWave || !!game.bossIntel?.w20Revealed;
}

function getW20BossIntel(){
  if (!game?.bossIntel) return null;
  const revealed = isW20BossIntelRevealed();
  if (!revealed) {
    return {
      revealed: false,
      revealWave: BALANCE.w20Breakthrough?.bossIntelRevealWave || 19,
      wave: 20,
      bossName: '天劫魔尊',
      coreName: null,
      coreDesc: '第 19 波备战时揭晓 W20 首领固定核心机制与本局随机辅助机制',
      auxKey: null,
      auxName: null,
      auxDesc: null,
      auxFairness: null
    };
  }
  return {
    revealed: true,
    revealWave: BALANCE.w20Breakthrough?.bossIntelRevealWave || 19,
    wave: 20,
    bossName: '天劫魔尊',
    coreName: game.bossIntel.w20Core,
    coreDesc: game.bossIntel.w20CoreDesc,
    auxKey: game.bossIntel.w20AuxKey,
    auxName: game.bossIntel.w20Aux,
    auxDesc: game.bossIntel.w20AuxDesc,
    auxFairness: game.bossIntel.w20AuxFairness
  };
}

function isW30BossIntelRevealed(){
  if (!game) return false;
  const revealWave = BALANCE.w30Boss?.intelRevealWave || 29;
  return game.wave >= revealWave || !!game.bossIntel?.w30Revealed || !!game.finalPrep?.w30IntelShown;
}

function getW30BossIntel(){
  if (!game?.bossIntel) return null;
  const revealed = isW30BossIntelRevealed();
  const w30Cfg = BALANCE.w30Boss || {};
  const revealWave = w30Cfg.intelRevealWave || 29;
  if (!revealed) {
    return {
      revealed: false,
      revealWave,
      wave: 30,
      bossName: w30Cfg.name || '深渊主宰',
      coreName: null,
      coreDesc: '第 29 波备战时揭晓 W30 终局首领固定核心机制与本局随机辅助机制',
      auxKey: null,
      auxName: null,
      auxDesc: null,
      auxFairness: null,
      signatureThresholdPct: w30Cfg.signatureThresholdPct ?? 0.80,
      finalPhaseThresholdPct: w30Cfg.finalPhaseThresholdPct ?? 0.35
    };
  }
  return {
    revealed: true,
    revealWave,
    wave: 30,
    bossName: w30Cfg.name || '深渊主宰',
    coreName: game.bossIntel.w30Core,
    coreDesc: game.bossIntel.w30CoreDesc,
    auxKey: game.bossIntel.w30AuxKey,
    auxName: game.bossIntel.w30Aux,
    auxDesc: game.bossIntel.w30AuxDesc,
    auxFairness: game.bossIntel.w30AuxFairness,
    signatureThresholdPct: w30Cfg.signatureThresholdPct ?? 0.80,
    finalPhaseThresholdPct: w30Cfg.finalPhaseThresholdPct ?? 0.35
  };
}

function getW30BattleState(){
  if (!game?.w30Battle) return null;
  const boss = game.enemies?.find(e => e.kind === 'boss6') || null;
  return {
    ...JSON.parse(JSON.stringify(game.w30Battle)),
    bossHp: boss ? Math.max(0, Math.round(boss.hp)) : (game.w30Battle.outcome === 'victory' ? 0 : null),
    bossHpPct: boss ? Number((clamp(boss.hp, 0, boss.maxHp) * 100 / Math.max(1, boss.maxHp)).toFixed(2)) : (game.w30Battle.outcome === 'victory' ? 0 : null)
  };
}

function getRecommendedW20Direction(){
  if (!game?.hero) return 'fire_chain_surge';
  const syn = getActiveGearAffixSynergies();
  if (syn.hasFrostTrio || syn.hasFrostDuo || (game.hero.skills?.nova || 0) > (game.hero.skills?.firewave || 0)) {
    return 'frost_bastion_counter';
  }
  if (syn.hasFireTrio || syn.hasFireDuo || (game.hero.skills?.firewave || 0) > 0) {
    return 'fire_chain_surge';
  }
  return 'breaker_momentum';
}

function selectW20PreselectDirection(directionKey){
  if (!game) return { ok: false, reason: 'no_game' };
  const openWave = BALANCE.w20Breakthrough?.preselectOpenWave || 16;
  if (game.wave < openWave) {
    return { ok: false, reason: 'not_unlocked_yet', openWave };
  }
  if (game.w20State?.locked || game.hero?.breakthroughs?.w20) {
    return { ok: false, reason: 'direction_locked', lockedDirection: game.w20State?.lockedDirection || game.hero?.breakthroughs?.w20?.directionKey };
  }
  const spec = W20_DIRECTIONS[directionKey];
  if (!spec) {
    return { ok: false, reason: 'invalid_direction', validKeys: W20_DIRECTION_KEYS };
  }
  game.w20State.preselectedDirection = spec.key;
  AudioKit.play('coin', 1.15);
  toast(`已预选 W20 突破方向【${spec.icon} ${spec.name}】（击败 W20 首领拿到突破凭证后才会生效）`);
  if (game.activeModal?.type === 'w20_preselect') {
    renderW20PreselectModal(game.activeModal);
  }
  renderAllUI(true);
  return {
    ok: true,
    preselectedDirection: spec.key,
    directionName: spec.name,
    locked: false,
    baseEffectActive: false
  };
}

function lockW20DirectionForBattle(){
  if (!game) return { ok: false, reason: 'no_game' };
  const dirKey = game.w20State?.preselectedDirection || getRecommendedW20Direction();
  if (!W20_DIRECTIONS[dirKey]) return { ok: false, reason: 'invalid_direction' };
  game.w20State.preselectedDirection = dirKey;
  game.w20State.lockedDirection = dirKey;
  game.w20State.locked = true;
  game.w20State.lockedAtWave = game.wave;
  return {
    ok: true,
    lockedDirection: dirKey,
    directionName: W20_DIRECTIONS[dirKey].name,
    baseEffectActive: false // Still NOT active until defeating W20 Boss!
  };
}

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

function getValidW20EnhancementPool(directionKey, ownedKeys = []){
  if (!directionKey || !W20_DIRECTIONS[directionKey]) return [];
  const ownedSet = new Set(ownedKeys || []);
  if (game?.hero?.breakthroughs?.w20?.enhancementKey) {
    ownedSet.add(game.hero.breakthroughs.w20.enhancementKey);
  }
  const ownedMutex = new Set();
  for (const ok of ownedSet) {
    const sp = W20_ENHANCEMENTS[ok];
    if (sp?.mutex) ownedMutex.add(sp.mutex);
  }
  return Object.values(W20_ENHANCEMENTS).filter(c => {
    if (!c || !Array.isArray(c.directions) || !c.directions.includes(directionKey)) return false;
    if (ownedSet.has(c.key)) return false;
    if (c.mutex && ownedMutex.has(c.mutex)) return false;
    if (typeof c.applicable === 'function' && !c.applicable(game?.hero)) return false;
    return true;
  });
}

function getW20RerollCost(rerollCount = null){
  const cfg = BALANCE.w20Breakthrough || {};
  const base = Number.isFinite(Number(cfg.rerollBaseCost)) ? Number(cfg.rerollBaseCost) : 4;
  const step = Number.isFinite(Number(cfg.rerollStep)) ? Number(cfg.rerollStep) : 2;
  const cnt = rerollCount !== null && rerollCount !== undefined ? Number(rerollCount) : (game?.w20Draft?.rerollCount || 0);
  return base + Math.max(0, cnt) * step;
}

function drawW20CandidateGroup(directionKey, excludeKeys = [], groupSize = null){
  const cfg = BALANCE.w20Breakthrough || {};
  const K = Math.max(1, Number(groupSize || cfg.groupSize || 2));
  const minRequired = 2 * K + (cfg.minPoolBuffer ?? 2);
  const validPool = getValidW20EnhancementPool(directionKey);
  if (validPool.length < minRequired) {
    return { ok: false, reason: 'insufficient_pool', required: minRequired, available: validPool.length, cards: [] };
  }
  const exSet = new Set(excludeKeys || []);
  const eligible = validPool.filter(c => !exSet.has(c.key));
  if (eligible.length < K) {
    return { ok: false, reason: 'insufficient_pool', required: minRequired, available: eligible.length, cards: [] };
  }
  const poolCopy = eligible.slice();
  const picked = [];
  while (picked.length < K && poolCopy.length) {
    const idx = Math.floor((game?.rnd ? game.rnd() : Math.random()) * poolCopy.length);
    picked.push(poolCopy.splice(idx, 1)[0]);
  }
  return { ok: true, cards: picked, validPoolSize: validPool.length, requiredMinPool: minRequired };
}

function initW20EnhancementDraft(directionKey = null){
  if (!game) return { ok: false, reason: 'no_game' };
  const dirKey = directionKey || game.hero?.breakthroughs?.w20?.directionKey || game.w20State?.lockedDirection || 'fire_chain_surge';
  const cfg = BALANCE.w20Breakthrough || {};
  const K = Math.max(1, Number(cfg.groupSize || 2));
  const draw = drawW20CandidateGroup(dirKey, [], K);
  if (!draw.ok) {
    // Fallback without blocking base effect if config was deliberately shrunk in a test
    const rawPool = getValidW20EnhancementPool(dirKey).slice(0, K);
    game.w20Draft = {
      directionKey: dirKey,
      groupSize: K,
      rerollCount: 0,
      nextRerollCost: getW20RerollCost(0),
      candidates: rawPool.map(c => c.key),
      history: [rawPool.map(c => c.key)],
      prevCandidates: [],
      poolUnderCapacity: true
    };
    return { ok: false, reason: draw.reason, required: draw.required, available: draw.available, draft: game.w20Draft };
  }
  const ids = draw.cards.map(c => c.key);
  game.w20Draft = {
    directionKey: dirKey,
    groupSize: K,
    rerollCount: 0,
    nextRerollCost: getW20RerollCost(0),
    candidates: ids,
    history: [ids.slice()],
    prevCandidates: [],
    poolUnderCapacity: false
  };
  return { ok: true, draft: game.w20Draft, candidates: draw.cards, validPoolSize: draw.validPoolSize };
}

function rerollW20Enhancements(){
  if (!game || !game.w20Draft) return { ok: false, reason: 'no_active_draft' };
  const draft = game.w20Draft;
  const K = draft.groupSize || (BALANCE.w20Breakthrough?.groupSize || 2);
  const cost = getW20RerollCost(draft.rerollCount);

  // Strict 2K+2 capacity redline check BEFORE deducting any materials!
  const draw = drawW20CandidateGroup(draft.directionKey, draft.candidates, K);
  if (!draw.ok) {
    toast(`候选池容量不足（需至少 ${draw.required} 张，当前 ${draw.available} 张），已保留当前候选与锻材余额！`, true);
    return {
      ok: false,
      reason: 'insufficient_pool',
      required: draw.required,
      available: draw.available,
      materialsLeft: game.materials,
      candidates: draft.candidates.slice()
    };
  }

  if ((game.materials || 0) < cost) {
    toast(`锻材不足！本次整组重抽需 ${cost} 锻材（当前 ⚙️ ${game.materials || 0}）`, true);
    return {
      ok: false,
      reason: 'insufficient_materials',
      cost,
      materialsLeft: game.materials || 0,
      candidates: draft.candidates.slice()
    };
  }

  const prevIds = draft.candidates.slice();
  const nextIds = draw.cards.map(c => c.key);
  changeMaterials(-cost, 'w20_reroll');
  draft.prevCandidates = prevIds;
  draft.candidates = nextIds;
  draft.rerollCount += 1;
  draft.nextRerollCost = getW20RerollCost(draft.rerollCount);
  draft.history.push(nextIds.slice());

  AudioKit.play('merge', 1.15);
  toast(`🎲 已消耗 ${cost} 锻材整组重抽！下次重抽需 ${draft.nextRerollCost} 锻材（剩余 ⚙️ ${game.materials}）`);
  if (game.activeModal?.type === 'w20_breakthrough') {
    renderW20BreakthroughModal();
  }
  renderAllUI(true);
  return {
    ok: true,
    costPaid: cost,
    materialsLeft: game.materials,
    rerollCount: draft.rerollCount,
    nextRerollCost: draft.nextRerollCost,
    prevCandidates: prevIds,
    candidates: draw.cards
  };
}

function pickW20Enhancement(enhKey){
  if (!game || !game.w20Draft) return { ok: false, reason: 'no_active_draft' };
  const draft = game.w20Draft;
  const spec = W20_ENHANCEMENTS[enhKey];
  if (!spec || !draft.candidates.includes(enhKey)) {
    return { ok: false, reason: 'invalid_enhancement_choice', candidates: draft.candidates.slice() };
  }
  const w20 = game.hero.breakthroughs.w20;
  if (!w20) return { ok: false, reason: 'w20_not_unlocked' };
  w20.enhancementKey = spec.key;
  w20.enhancementName = spec.name;
  w20.enhancementIcon = spec.icon;
  w20.enhancementDesc = spec.desc;
  w20.enhancementBehaviorTag = spec.behaviorTag;
  w20.rerollCount = draft.rerollCount;

  game.pendingBreakthrough = null;
  game.w20Draft = null;
  flashScreen('gold');
  AudioKit.play('level', 1.3);
  addRing(game.hero.x, game.hero.y, '#ffd666', 4.5);
  showBanner(
    `⚡ W20 突破强化完成 · 【${w20.directionName} × ${spec.name}】！`,
    `即将进入第 21 波强势体验！${spec.behaviorTag}`,
    'good'
  );
  if (game.activeModal?.type === 'w20_breakthrough') {
    closeModal();
  }
  renderAllUI(true);
  return { ok: true, breakthrough: { ...w20 } };
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
function rollPerkChoices(quality = 'ren'){
  const count = quality === 'tian' ? 6 : quality === 'di' ? 4 : 3;
  const available = PERK_LIST.filter(p => (game.hero.perks[p.key] || 0) < 2);
  const ownedLv1 = available.filter(p => game.hero.perks[p.key] === 1);
  const commons = available.filter(p => p.rarity === 'common');
  const rares   = available.filter(p => p.rarity === 'rare');
  const epics   = available.filter(p => p.rarity === 'epic');

  const picked = [];
  const takeFrom = arr => {
    const rem = arr.filter(p => !picked.includes(p));
    if (!rem.length) return null;
    const item = rem[Math.floor(game.rnd() * rem.length)];
    picked.push(item);
    return item;
  };

  if (quality === 'tian') {
    takeFrom(epics); takeFrom(epics);
    if (ownedLv1.length && game.rnd() < 0.8) takeFrom(ownedLv1);
    while (picked.length < count) {
      const r = game.rnd();
      if (r < 0.38 && takeFrom(epics)) continue;
      if (r < 0.80 && takeFrom(rares)) continue;
      if (!takeFrom(available)) break;
    }
  } else if (quality === 'di') {
    takeFrom(rares); takeFrom(rares);
    if (game.rnd() < 0.15) takeFrom(epics);
    if (ownedLv1.length && game.rnd() < 0.65) takeFrom(ownedLv1);
    while (picked.length < count) {
      if (game.rnd() < 0.55 && takeFrom(rares)) continue;
      if (!takeFrom(commons) && !takeFrom(available)) break;
    }
  } else {
    if (ownedLv1.length && game.rnd() < 0.45) {
      const nonEpic = ownedLv1.filter(p => p.rarity !== 'epic');
      takeFrom(nonEpic);
    }
    while (picked.length < count) {
      if (game.rnd() < 0.20 && takeFrom(rares)) continue;
      if (!takeFrom(commons) && !takeFrom(rares) && !takeFrom(available)) break;
    }
  }
  return picked;
}

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

function pickPerk(key){
  const p = PERKS[key];
  if (!p) return;
  const nextLv = (game.hero.perks[key] || 0) + 1;
  game.hero.perks[key] = Math.min(2, nextLv);
  if (key === 'blood_oath') {
    game.hero.baseMaxHp += 80;
    syncHeroMaxHp();
  } else if (key === 'dao_fortune') {
    if (nextLv === 1) {
      changeGold(35, 'perk_dao_fortune');
      const rares = GEAR_KEYS.filter(k => GEARS[k].rarity === 'rare');
      const rk = rares[Math.floor(game.rnd() * rares.length)];
      grantGear(rk);
    } else if (nextLv === 2) {
      const epics = GEAR_KEYS.filter(k => GEARS[k].rarity === 'epic');
      const rk = epics[Math.floor(game.rnd() * epics.length)];
      grantGear(rk);
    }
  }
  AudioKit.play('level', 1.15);
  toast(`词条生效！【${p.name} Lv.${game.hero.perks[key]}】`);
  closeModal();
  renderAllUI(true);
}

function pickChestGearChoices(legendBias = false, shrineTier = false){
  const activePool = getActiveRunGearKeys();
  const byRarity = {
    common: activePool.filter(k => GEARS[k]?.rarity === 'common').map(k => GEARS[k]),
    rare:   activePool.filter(k => GEARS[k]?.rarity === 'rare').map(k => GEARS[k]),
    epic:   activePool.filter(k => GEARS[k]?.rarity === 'epic').map(k => GEARS[k]),
    legend: activePool.filter(k => GEARS[k]?.rarity === 'legend').map(k => GEARS[k])
  };
  const specs = [];
  const takeRarity = r => {
    const pool = byRarity[r].filter(g => !specs.includes(g));
    if (!pool.length) return null;
    const g = pickWeightedByMainLegacy(pool, item => item?.elem || null, game.rnd) || pool[0];
    specs.push(g);
    return g;
  };
  const w = game.wave || 1;
  if (legendBias) {
    if (w <= 6) takeRarity('epic');
    else takeRarity('legend');
  } else if (shrineTier) {
    if (w <= 6) takeRarity('rare');
    else if (w <= 15) takeRarity('epic');
    else takeRarity('legend');
  }
  while (specs.length < 3) {
    const r = game.rnd();
    let tier = 'common';
    if (legendBias) {
      if (w <= 6) tier = r < 0.30 ? 'epic' : 'rare';
      else if (w <= 15) tier = r < 0.25 ? 'legend' : 'epic';
      else tier = r < 0.45 ? 'legend' : 'epic';
    } else if (shrineTier) {
      if (w <= 6) tier = r < 0.65 ? 'rare' : 'common';
      else if (w <= 11) tier = r < 0.35 ? 'epic' : 'rare';
      else if (w <= 18) tier = r < 0.20 ? 'legend' : r < 0.75 ? 'epic' : 'rare';
      else tier = r < 0.35 ? 'legend' : 'epic';
    } else {
      if (w <= 5) tier = r < 0.25 ? 'rare' : 'common';
      else if (w <= 10) tier = r < 0.10 ? 'epic' : r < 0.55 ? 'rare' : 'common';
      else if (w <= 18) tier = r < 0.28 ? 'epic' : r < 0.80 ? 'rare' : 'common';
      else tier = r < 0.15 ? 'legend' : r < 0.65 ? 'epic' : 'rare';
    }
    if (!takeRarity(tier)) {
      const fallbackOrder = w <= 5 ? ['rare', 'common'] : w <= 10 ? ['epic', 'rare', 'common'] : ['epic', 'rare', 'legend', 'common'];
      let picked = null;
      for (const ft of fallbackOrder) {
        picked = takeRarity(ft);
        if (picked) break;
      }
      if (!picked) break;
    }
  }
  // Generate 3 real independent gear instances (independent rarity & 1/2/3 slots, locked sourceStage, filled affixes)
  const refCfg = getEndgameRefinementConfig();
  const endgameBonus = w >= (refCfg.startWave || 21) ? (refCfg.chestHighRarityAffixBonusW21Plus || 0.12) : 0;
  return specs.map(sp => {
    const inst = createGearInstance(sp.key, {
      wave: w,
      origin: legendBias ? 'boss_chest' : shrineTier ? 'shrine_chest' : 'elite_chest',
      highRarityChance: Math.min(0.70, (legendBias ? 0.32 : shrineTier ? 0.24 : 0.14) + endgameBonus),
      rndFn: game.rnd
    });
    inst.key = inst.baseKey; // keep .key alias for UI/tests
    return inst;
  });
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

function grantGear(input, opts = {}){
  const res = grantGearSafely(input, { origin: opts.origin || 'drop', ...opts });
  return res?.item || null;
}

function pickGearReward(itemOrKey){
  if (!game) return false;
  const m = game.activeModal;
  if (!m || m.type !== 'chest') return false;
  if (m.claimed) return false;
  if (!Array.isArray(m.choices) || !m.choices.length) return false;

  let matched = null;
  if (itemOrKey && typeof itemOrKey === 'object') {
    matched = m.choices.find(c => c === itemOrKey || (itemOrKey.uid && c.uid === itemOrKey.uid)) || null;
  } else if (typeof itemOrKey === 'string') {
    matched = m.choices.find(c => c.uid === itemOrKey || c.baseKey === itemOrKey) || null;
  }
  if (!matched) return false;

  // ATOMIC SINGLE-CLAIM LOCK BEFORE STATE MUTATION
  m.claimed = true;
  m.claimedChoice = matched.uid;

  if (!game.metaRunLocked) lockMetaLoadoutForRun();
  const grantRes = grantGearSafely(matched, { origin: 'chest' });
  closeModal();
  return grantRes?.item || matched;
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

/* ==================== STAGE 4: DESTINY GAMBLE SYSTEM (天命赌局) ==================== */
function getDestinyConfig(){
  const raw = BALANCE.destinyGamble || {};
  return {
    minBet: Math.max(1, Number(raw.minBet ?? 30)),
    emptyTribulationChance: clamp(Number(raw.emptyTribulationChance ?? 0.22), 0, 0.95),
    categoryWeights: {
      seal: Number(raw.categoryWeights?.seal ?? 0.25),
      gear: Number(raw.categoryWeights?.gear ?? 0.25),
      pill: Number(raw.categoryWeights?.pill ?? 0.25),
      special: Number(raw.categoryWeights?.special ?? 0.25)
    },
    allowDuplicateCategories: raw.allowDuplicateCategories !== false,
    preciousThresholds: {
      rare: Number(raw.preciousThresholds?.rare ?? 60),
      transferToken: Number(raw.preciousThresholds?.transferToken ?? 100),
      epic: Number(raw.preciousThresholds?.epic ?? 120),
      destinyExclusive: Number(raw.preciousThresholds?.destinyExclusive ?? 120),
      legend: Number(raw.preciousThresholds?.legend ?? 220)
    },
    betQuickPresets: Array.isArray(raw.betQuickPresets) ? raw.betQuickPresets : [30, 60, 100, 120, 220, 320],
    specialSubPoolWeights: {
      transferToken: Number(raw.specialSubPoolWeights?.transferToken ?? 0.42),
      destinyExclusive: Number(raw.specialSubPoolWeights?.destinyExclusive ?? 0.58)
    },
    qualityChanceByBetBand: raw.qualityChanceByBetBand || {
      low:     { common: 1.0,  rare: 0,    epic: 0,    legend: 0 },
      mid:     { common: 0.55, rare: 0.45, epic: 0,    legend: 0 },
      high:    { common: 0.20, rare: 0.46, epic: 0.34, legend: 0 },
      supreme: { common: 0.10, rare: 0.32, epic: 0.38, legend: 0.20 }
    },
    transferTokenYieldByBet: Array.isArray(raw.transferTokenYieldByBet) ? raw.transferTokenYieldByBet : [
      { minBet: 100, count: 1 },
      { minBet: 240, count: 2 }
    ],
    sealEssenceBonusByRarity: raw.sealEssenceBonusByRarity || { common: 0.10, rare: 0.15, epic: 0.22, legend: 0.30 }
  };
}

function getDestinyBetBand(bet){
  const cfg = getDestinyConfig();
  const t = cfg.preciousThresholds;
  const allowRare = bet >= t.rare;
  const allowTransferToken = bet >= t.transferToken;
  const allowEpic = bet >= t.epic;
  const allowDestinyExclusive = bet >= t.destinyExclusive;
  const allowLegend = bet >= t.legend;
  const band = allowLegend ? 'supreme' : allowEpic ? 'high' : allowRare ? 'mid' : 'low';
  return {
    bet, band,
    allowRare, allowTransferToken, allowEpic, allowDestinyExclusive, allowLegend,
    allowPrecious: allowTransferToken || allowEpic || allowDestinyExclusive || allowLegend
  };
}

function rollDestinyQuality(bet, rndFn = game?.rnd || Math.random){
  const cfg = getDestinyConfig();
  const b = getDestinyBetBand(bet);
  const raw = cfg.qualityChanceByBetBand[b.band] || { common: 1, rare: 0, epic: 0, legend: 0 };
  const weights = {
    common: Math.max(0, Number(raw.common || 0)),
    rare: b.allowRare ? Math.max(0, Number(raw.rare || 0)) : 0,
    epic: b.allowEpic ? Math.max(0, Number(raw.epic || 0)) : 0,
    legend: b.allowLegend ? Math.max(0, Number(raw.legend || 0)) : 0
  };
  const total = weights.common + weights.rare + weights.epic + weights.legend;
  if (total <= 0) return 'common';
  let roll = rndFn() * total;
  for (const r of ['common', 'rare', 'epic', 'legend']) {
    roll -= weights[r];
    if (roll <= 0) return r;
  }
  return 'common';
}

function rollDestinyCategories(count = 3, rndFn = game?.rnd || Math.random, allowDuplicateOverride = null){
  const cfg = getDestinyConfig();
  const allowDup = allowDuplicateOverride !== null ? !!allowDuplicateOverride : cfg.allowDuplicateCategories;
  const keys = ['seal', 'gear', 'pill', 'special'];
  const baseWeights = keys.map(k => ({ key: k, w: Math.max(0, Number(cfg.categoryWeights[k] ?? 0.25)) }));
  const picked = [];
  const pool = baseWeights.slice();
  for (let i = 0; i < count; i++) {
    const activePool = allowDup ? baseWeights : pool;
    const total = activePool.reduce((s, e) => s + e.w, 0);
    if (total <= 0 || !activePool.length) { picked.push(keys[i % keys.length]); continue; }
    let r = rndFn() * total;
    let chosenIdx = activePool.length - 1;
    for (let j = 0; j < activePool.length; j++) {
      r -= activePool[j].w;
      if (r <= 0) { chosenIdx = j; break; }
    }
    picked.push(activePool[chosenIdx].key);
    if (!allowDup) pool.splice(chosenIdx, 1);
  }
  return picked;
}

function isAllEquippedSealsMaxed(){
  if (!game?.seal) return false;
  const cap = getSealStarCap();
  const subCap = getSubSealSlotCap();
  if (game.seal.star < cap) return false;
  if (game.subSeals.length < subCap) return false;
  return game.subSeals.every(s => s.star >= 3);
}

function isSealKindCurrentlyMaxed(kind){
  if (!game) return false;
  const cap = getSealStarCap();
  if (game.seal && game.seal.kind === kind && game.seal.star >= cap) return true;
  const sub = game.subSeals.find(s => s.kind === kind);
  if (sub && sub.star >= 3) return true;
  return false;
}

function getAvailableDestinyEnhancements({ allowLegend = true, excludeKeys = null } = {}){
  const owned = game?.hero?.destinyEnhancements || {};
  const blockedGroups = new Set();
  for (const k of Object.keys(owned)) {
    if (!owned[k]) continue;
    const sp = DESTINY_ENHANCEMENTS[k];
    if (sp?.conflictGroup) blockedGroups.add(sp.conflictGroup);
  }
  return DESTINY_ENHANCEMENT_KEYS
    .map(k => DESTINY_ENHANCEMENTS[k])
    .filter(sp => {
      if (!sp) return false;
      if (owned[sp.key]) return false;
      if (excludeKeys && excludeKeys.has(sp.key)) return false;
      if (sp.conflictGroup && blockedGroups.has(sp.conflictGroup)) return false;
      if (!allowLegend && sp.rarity === 'legend') return false;
      return true;
    });
}

function buildDestinyCandidate(category, bet, rndFn, offerCtx){
  const cfg = getDestinyConfig();
  const band = getDestinyBetBand(bet);
  const rarity = rollDestinyQuality(bet, rndFn);
  const isPreciousRarity = rarity === 'epic' || rarity === 'legend';

  if (category === 'seal') {
    const cap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    const star = rarity === 'legend' ? 3 : rarity === 'epic' ? 3 : rarity === 'rare' ? 2 : 1;

    // Check if ALL equipped main & sub seals are maxed -> replace with same-category available item (Seal Essence)
    if (isAllEquippedSealsMaxed()) {
      const bonusPct = Number(cfg.sealEssenceBonusByRarity?.[rarity] ?? 0.15);
      return {
        category: 'seal',
        subType: 'seal_essence',
        rarity,
        isPrecious: isPreciousRarity,
        isTransferToken: false,
        isDestinyExclusive: false,
        replacedFromMaxed: true,
        replacedReason: 'all_seals_maxed',
        bonusPct,
        icon: '✨',
        name: `${GEAR_RARITY_LABELS[rarity]}·灵印淬魂晶`,
        tag: `灵印类 · 满星替换 · ${GEAR_RARITY_LABELS[rarity]}`,
        desc: `主辅灵印已全满星，自动替换为同类别可用项：永久提升主灵印爆发伤害 +${Math.round(bonusPct * 100)}%！`
      };
    }

    let kind = ARTIFACT_KEYS[Math.floor(rndFn() * ARTIFACT_KEYS.length)];
    let replacedFromMaxed = false;
    let replacedReason = null;
    if (isSealKindCurrentlyMaxed(kind)) {
      // Find an upgradeable same-category seal (unmaxed main, unmaxed sub, or open sub-slot element)
      const upgradeable = ARTIFACT_KEYS.filter(k => {
        if (isSealKindCurrentlyMaxed(k)) return false;
        if (!game.seal) return true;
        if (game.seal.kind === k && game.seal.star < cap) return true;
        if (game.subSeals.some(s => s.kind === k && s.star < 3)) return true;
        if (game.seal.kind !== k && !game.subSeals.some(s => s.kind === k) && game.subSeals.length < subCap) return true;
        return false;
      });
      if (upgradeable.length) {
        kind = upgradeable[Math.floor(rndFn() * upgradeable.length)];
        replacedFromMaxed = true;
        replacedReason = 'rolled_seal_maxed';
      } else {
        const bonusPct = Number(cfg.sealEssenceBonusByRarity?.[rarity] ?? 0.15);
        return {
          category: 'seal',
          subType: 'seal_essence',
          rarity,
          isPrecious: isPreciousRarity,
          isTransferToken: false,
          isDestinyExclusive: false,
          replacedFromMaxed: true,
          replacedReason: 'no_upgradeable_seal_slot',
          bonusPct,
          icon: '✨',
          name: `${GEAR_RARITY_LABELS[rarity]}·灵印淬魂晶`,
          tag: `灵印类 · 满星替换 · ${GEAR_RARITY_LABELS[rarity]}`,
          desc: `原随出灵印已达星级上限，自动替换为同类别可用项：永久提升主灵印爆发伤害 +${Math.round(bonusPct * 100)}%！`
        };
      }
    }
    const spec = ARTIFACTS[kind];
    const safetyHint = (game.seal && game.seal.kind !== kind && game.subSeals.length >= subCap)
      ? '（安全领奖：异系灵印将入背包/暂存，绝不覆盖在用主灵印）'
      : '（安全领奖：同系自动升星或入空辅印槽）';
    return {
      category: 'seal',
      subType: 'seal',
      rarity,
      isPrecious: isPreciousRarity,
      isTransferToken: false,
      isDestinyExclusive: false,
      replacedFromMaxed,
      replacedReason,
      kind,
      elem: spec.elem,
      star,
      icon: spec.icon,
      name: `${spec.name} ${star}★`,
      tag: `灵印类 · ${GEAR_RARITY_LABELS[rarity]}${replacedFromMaxed ? ' · 满星替换' : ''}`,
      desc: `${spec.desc} ${safetyHint}`
    };
  }

  if (category === 'gear') {
    const pool = GEAR_KEYS.filter(k => GEARS[k].rarity === rarity);
    const list = pool.length ? pool : GEAR_KEYS;
    const baseKey = list[Math.floor(rndFn() * list.length)];
    const gear = createGearInstance(baseKey, {
      rarity,
      wave: game.wave,
      origin: 'destiny_gamble',
      highRarityChance: rarity === 'legend' ? 0.42 : rarity === 'epic' ? 0.28 : 0.16,
      rndFn
    });
    const itemSyns = evaluateItemSynergies(gear);
    const synHints = getGearSynergyHints(gear);
    return {
      category: 'gear',
      subType: 'gear',
      rarity: gear.rarity,
      isPrecious: gear.rarity === 'epic' || gear.rarity === 'legend',
      isTransferToken: false,
      isDestinyExclusive: false,
      replacedFromMaxed: false,
      gear,
      icon: gear.icon,
      name: `${gear.name} [${gear.slotsCount}槽]`,
      tag: `构装类 · ${GEAR_RARITY_LABELS[gear.rarity]} · 阶段${gear.sourceStage}`,
      desc: describeGearEffect(gear),
      synNote: itemSyns.length ? `单件联动：${itemSyns.map(s => s.name).join('/')}` : (synHints[0] || '')
    };
  }

  if (category === 'pill') {
    const tierList = DESTINY_PILLS[rarity] || DESTINY_PILLS.common;
    const pill = tierList[Math.floor(rndFn() * tierList.length)];
    return {
      category: 'pill',
      subType: 'pill',
      rarity: pill.rarity,
      isPrecious: pill.rarity === 'epic' || pill.rarity === 'legend',
      isTransferToken: false,
      isDestinyExclusive: false,
      replacedFromMaxed: false,
      pillKey: pill.key,
      pill,
      icon: pill.icon,
      name: pill.name,
      tag: `丹药类 · ${GEAR_RARITY_LABELS[pill.rarity]}`,
      desc: pill.desc
    };
  }

  // category === 'special' (Contains Transfer Tokens & Destiny Exclusive Enhancements ONLY when bet meets thresholds!)
  const makeTransferTokenCandidate = (replacedFromMaxed = false, replacedReason = null) => {
    let tokenCount = 1;
    for (const row of cfg.transferTokenYieldByBet) {
      if (bet >= row.minBet) tokenCount = Math.max(tokenCount, Number(row.count || 1));
    }
    const tokRarity = (tokenCount >= 2 && band.allowLegend) ? 'legend' : (band.allowEpic ? 'epic' : 'rare');
    return {
      category: 'special',
      subType: 'transfer_token',
      rarity: tokRarity,
      isPrecious: true,
      isTransferToken: true,
      isDestinyExclusive: false,
      replacedFromMaxed,
      replacedReason,
      tokenCount,
      icon: '🔮',
      name: tokenCount > 1 ? `天命转印符 ×${tokenCount}` : '天命转印符 ×1',
      tag: `特殊强化 · 转印物资${replacedFromMaxed ? ' · 满额替换' : ''}`,
      desc: `获得 🔮+${tokenCount} 天命转印符（仅天命赌局产出）。可在【✨ 词条转移台】将一件装备的词条转移至另一件装备拼装完整三联动！`
    };
  };

  const makeSpecialBoonCandidate = (boonRarity, replacedFromMaxed = false, replacedReason = null) => {
    const bk = DESTINY_SPECIAL_BOON_KEYS[Math.floor(rndFn() * DESTINY_SPECIAL_BOON_KEYS.length)];
    const spec = DESTINY_SPECIAL_BOONS[bk];
    return {
      category: 'special',
      subType: 'special_boon',
      rarity: boonRarity,
      isPrecious: boonRarity === 'epic' || boonRarity === 'legend',
      isTransferToken: false,
      isDestinyExclusive: false,
      replacedFromMaxed,
      replacedReason,
      boonKey: spec.key,
      icon: spec.icon,
      name: spec.name,
      tag: `特殊强化 · ${GEAR_RARITY_LABELS[boonRarity]}${replacedFromMaxed ? ' · 满额替换' : ''}`,
      desc: spec.desc(boonRarity)
    };
  };

  // Low bet: STRICTLY cannot enter precious pool (no transferToken, no destinyExclusive, no epic/legend)!
  if (!band.allowTransferToken && !band.allowDestinyExclusive) {
    return makeSpecialBoonCandidate(rarity, false, null);
  }

  // Mid-precious bet (can drop transferToken, below destinyExclusive threshold)
  if (band.allowTransferToken && !band.allowDestinyExclusive) {
    const tokChance = clamp(cfg.specialSubPoolWeights.transferToken || 0.42, 0.15, 0.85);
    if (rndFn() < tokChance) return makeTransferTokenCandidate(false, null);
    return makeSpecialBoonCandidate(rarity, false, null);
  }

  // High / Supreme bet (meets destinyExclusive threshold, and transferToken threshold if >= transferToken)
  const wTok = band.allowTransferToken ? Math.max(0, cfg.specialSubPoolWeights.transferToken || 0.42) : 0;
  const wExc = Math.max(0, cfg.specialSubPoolWeights.destinyExclusive || 0.58);
  const rollSub = rndFn() * (wTok + wExc);
  if (wTok > 0 && rollSub < wTok) {
    return makeTransferTokenCandidate(false, null);
  }

  // Pick a Destiny-Exclusive Enhancement (with non-duplicate & conflictGroup replacement!)
  const eligibleAll = DESTINY_ENHANCEMENT_KEYS
    .map(k => DESTINY_ENHANCEMENTS[k])
    .filter(sp => band.allowLegend || sp.rarity !== 'legend');
  const rawPick = eligibleAll[Math.floor(rndFn() * eligibleAll.length)];
  const avail = getAvailableDestinyEnhancements({ allowLegend: band.allowLegend, excludeKeys: offerCtx.usedExclusiveKeys });

  if (rawPick && avail.some(a => a.key === rawPick.key)) {
    offerCtx.usedExclusiveKeys.add(rawPick.key);
    return {
      category: 'special',
      subType: 'destiny_exclusive',
      rarity: rawPick.rarity,
      isPrecious: true,
      isTransferToken: false,
      isDestinyExclusive: true,
      replacedFromMaxed: false,
      enhancementKey: rawPick.key,
      icon: rawPick.icon,
      name: rawPick.name,
      tag: `特殊强化 · 天命专属 · ${rawPick.tag}`,
      desc: rawPick.desc
    };
  }
  if (avail.length > 0) {
    const rep = avail[Math.floor(rndFn() * avail.length)];
    offerCtx.usedExclusiveKeys.add(rep.key);
    return {
      category: 'special',
      subType: 'destiny_exclusive',
      rarity: rep.rarity,
      isPrecious: true,
      isTransferToken: false,
      isDestinyExclusive: true,
      replacedFromMaxed: true,
      replacedReason: 'exclusive_owned_or_conflicted',
      enhancementKey: rep.key,
      icon: rep.icon,
      name: rep.name,
      tag: `特殊强化 · 天命专属(替换) · ${rep.tag}`,
      desc: rep.desc
    };
  }
  // All eligible Destiny-Exclusive Enhancements owned/blocked -> replace with same-category available item!
  if (band.allowTransferToken) {
    return makeTransferTokenCandidate(true, 'all_destiny_exclusives_owned');
  }
  return makeSpecialBoonCandidate(rarity, true, 'all_destiny_exclusives_owned');
}

function getPendingDestinyOffer(){
  const p = game?.destiny?.pendingOffer;
  return (p && !p.claimed) ? p : null;
}

// Single atomic checkout: validates bet & pendingOffer, deducts gold ONCE, resolves empty tribulation OR generates 3 candidates!
function rollDestinyGamble(betAmount, opts = {}){
  if (!game || !game.destiny) return { ok: false, reason: 'no_game' };
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  if (game.phase !== 'prep') {
    toast('仅在备战期（含 W29 终局整备）可开启天命赌局！', true);
    return { ok: false, reason: 'not_in_prep' };
  }
  if (game.destiny.pendingOffer && !game.destiny.pendingOffer.claimed) {
    toast('当前已有未领取的天命三选一奖励，请先领取再继续押注！', true);
    return { ok: false, reason: 'pending_offer_unclaimed', pendingOffer: game.destiny.pendingOffer };
  }
  const cfg = getDestinyConfig();
  const bet = Math.floor(Number(betAmount));
  if (!Number.isFinite(bet) || bet < cfg.minBet) {
    toast(`押注金额不得低于最低门槛 ${cfg.minBet} 金币！`, true);
    return { ok: false, reason: 'below_min_bet', minBet: cfg.minBet };
  }
  if (game.gold < bet) {
    toast(`金币不足！本次押注需要 💰${bet}（当前 💰${game.gold}）`, true);
    return { ok: false, reason: 'insufficient_gold', need: bet, have: game.gold };
  }

  // ATOMIC DEDUCTION (irreversible once confirmed)
  const rndFn = opts.rndFn || game.rnd;
  changeGold(-bet, 'destiny_gamble_bet');
  game.destiny.totalRolls++;
  game.destiny.totalGoldBet += bet;
  if (game.stats) game.stats.destinyRolls = (game.stats.destinyRolls || 0) + 1;

  const isEmpty = opts.forceOutcome === 'empty'
    ? true
    : opts.forceOutcome === 'win'
      ? false
      : (rndFn() < cfg.emptyTribulationChance);

  if (isEmpty) {
    game.destiny.emptyTribulations++;
    game.destiny.pendingOffer = null;
    const stopLossRefund = hasMetaAux('aux_destiny_foresight') ? Math.floor(bet * 0.25) : 0;
    if (stopLossRefund > 0) changeGold(stopLossRefund, 'destiny_stop_loss_refund');
    game.destiny.lastOutcome = { outcome: 'empty_tribulation', bet, stopLossRefund, wave: game.wave };
    game.destiny.history.push({ outcome: 'empty_tribulation', bet, stopLossRefund, wave: game.wave });
    if (game.stats) game.stats.destinyEmptyTribulations = (game.stats.destinyEmptyTribulations || 0) + 1;
    AudioKit.play('hit', 0.9);
    flashScreen('fail');
    if (!opts.silent) {
      toast(stopLossRefund > 0
        ? `🌩️ 触发天命空劫！天命观星返还止损 💰${stopLossRefund}，无候选奖励。`
        : `🌩️ 触发天命空劫！本次押注 💰${bet} 归零，无候选奖励。`, true);
    }
    if (game.activeModal?.type === 'destiny_gamble') renderDestinyGambleModal();
    renderAllUI(true);
    return { ok: true, outcome: 'empty_tribulation', bet, stopLossRefund, goldLeft: game.gold, pendingOffer: null };
  }

  // WIN: Generate 3 random candidates with strict 4x25% category weights and pure probability quality (NO rarity pity!)
  const categories = rollDestinyCategories(3, rndFn, opts.allowDuplicateCategories ?? null);
  const offerCtx = { usedExclusiveKeys: new Set() };
  const choices = categories.map((cat, idx) => ({
    choiceIndex: idx,
    ...buildDestinyCandidate(cat, bet, rndFn, offerCtx)
  }));
  const offer = {
    offerId: `dg_${game.wave}_${game.destiny.nextOfferSeq++}`,
    bet,
    wave: game.wave,
    choices,
    claimed: false,
    claimedChoiceIndex: null,
    claimedAtWave: null
  };
  game.destiny.pendingOffer = offer;
  game.destiny.wins++;
  game.destiny.lastOutcome = { outcome: 'win', bet, wave: game.wave, offerId: offer.offerId };
  AudioKit.play('chest', 1.2);
  flashScreen('gold');
  if (!opts.silent) toast(`🎲 天命开奖成功（押注 💰${bet}）！请从 3 件天命候选中择一领取！`);
  if (game.activeModal?.type === 'destiny_gamble') renderDestinyGambleModal();
  renderAllUI(true);
  return { ok: true, outcome: 'win', bet, goldLeft: game.gold, pendingOffer: offer };
}

function applyDestinyPillReward(pillKey){
  const h = game.hero;
  if (pillKey === 'xp') {
    const gain = Math.round(h.xpNext * 0.35);
    gainHeroXp(gain);
    return { effect: `修为 +${gain}` };
  }
  if (pillKey === 'heal') {
    h.hp = Math.min(h.maxHp, h.hp + 65);
    gainFrostShield(25, { maxShield: 90, duration: 6.0, source: 'destiny_pill' });
    return { effect: '生命 +65, 护盾 +25' };
  }
  if (pillKey === 'temper') {
    changeMaterials(2, 'destiny_pill_temper');
    h.hp = Math.min(h.maxHp, h.hp + 25);
    return { effect: '锻材 +2, 生命 +25' };
  }
  if (pillKey === 'rare_xp') {
    const gain = Math.round(h.xpNext * 0.55);
    gainHeroXp(gain);
    return { effect: `修为 +${gain}` };
  }
  if (pillKey === 'rare_heal') {
    h.hp = Math.min(h.maxHp, h.hp + 105);
    gainFrostShield(45, { maxShield: 110, duration: 6.0, source: 'destiny_pill' });
    return { effect: '生命 +105, 护盾 +45' };
  }
  if (pillKey === 'rare_temper') {
    changeMaterials(4, 'destiny_pill_rare_temper');
    h.hp = Math.min(h.maxHp, h.hp + 40);
    return { effect: '锻材 +4, 生命 +40' };
  }
  if (pillKey === 'epic_xp') {
    const gain = Math.round(h.xpNext * 0.85);
    gainHeroXp(gain);
    h.hp = Math.min(h.maxHp, h.hp + 50);
    return { effect: `修为 +${gain}, 生命 +50` };
  }
  if (pillKey === 'epic_vital') {
    h.baseMaxHp += 35;
    syncHeroMaxHp();
    h.hp = Math.min(h.maxHp, h.hp + 130);
    gainFrostShield(60, { maxShield: 120, duration: 6.5, source: 'destiny_pill' });
    return { effect: '永久最大生命 +35, 生命 +130, 护盾 +60' };
  }
  if (pillKey === 'epic_temper') {
    changeMaterials(6, 'destiny_pill_epic_temper');
    h.hp = Math.min(h.maxHp, h.hp + 55);
    return { effect: '锻材 +6, 生命 +55' };
  }
  if (pillKey === 'legend_ascend') {
    h.baseMaxHp += 45;
    syncHeroMaxHp();
    gainHeroXp(h.xpNext);
    h.hp = h.maxHp;
    return { effect: '直升 1 级, 永久最大生命 +45, 生命全满' };
  }
  if (pillKey === 'legend_temper') {
    changeMaterials(9, 'destiny_pill_legend_temper');
    h.baseMaxHp += 25;
    syncHeroMaxHp();
    h.hp = Math.min(h.maxHp, h.hp + 80);
    return { effect: '锻材 +9, 永久最大生命 +25, 生命 +80' };
  }
  return { effect: '丹药生效' };
}

// Unified single-checkout STRICTLY IDEMPOTENT reward claim entry (reusable by Stage 5 W29 timeout!)
function claimDestinyReward(choiceIndex, opts = {}){
  if (!game?.destiny) return { ok: false, reason: 'no_game' };
  if (isFinalPrepActionLocked() && !opts.allowDuringFinalPrepResolve) {
    return { ok: false, reason: 'final_prep_locked' };
  }
  const offer = game.destiny.pendingOffer;
  if (!offer) return { ok: false, reason: 'no_pending_offer' };
  if (opts.offerId && offer.offerId !== opts.offerId) {
    return { ok: false, reason: 'offer_id_mismatch' };
  }
  game.destiny.claimedOfferIds = game.destiny.claimedOfferIds || [];
  if (offer.claimed || game.destiny.claimedOfferIds.includes(offer.offerId)) {
    game.destiny.pendingOffer = null;
    return { ok: false, reason: 'already_claimed', offerId: offer.offerId };
  }
  const idx = Math.floor(Number(choiceIndex));
  if (!Number.isFinite(idx) || idx < 0 || idx >= offer.choices.length) {
    return { ok: false, reason: 'invalid_choice_index' };
  }

  // ATOMIC SINGLE-CHECKOUT LOCK BEFORE GRANTING REWARD (prevents any duplicate grant on double click!)
  offer.claimed = true;
  offer.claimedChoiceIndex = idx;
  offer.claimedAtWave = game.wave;
  game.destiny.claimedOfferIds.push(offer.offerId);
  game.destiny.pendingOffer = null;
  game.destiny.lastOffer = offer;
  if (game.stats) game.stats.destinyClaims = (game.stats.destinyClaims || 0) + 1;

  const chosen = offer.choices[idx];
  let grantResult = null;

  if (chosen.category === 'gear' && chosen.gear) {
    grantResult = grantGearSafely(chosen.gear, { origin: 'destiny_gamble', silent: !!opts.silent });
  } else if (chosen.category === 'seal') {
    if (chosen.subType === 'seal_essence') {
      game.hero.sealEssenceBonus = Number(((game.hero.sealEssenceBonus || 0) + (chosen.bonusPct || 0.15)).toFixed(4));
      grantResult = { ok: true, action: 'seal_essence_applied', sealEssenceBonus: game.hero.sealEssenceBonus };
      AudioKit.play('merge', 1.2);
      if (!opts.silent) toast(`✨ 吸收【${chosen.name}】，主灵印永久伤害累计 +${Math.round(game.hero.sealEssenceBonus * 100)}%！`);
    } else {
      // SAFE CLAIM PATH: NEVER calls buyShopItem, NEVER overwrites/sells active 5★ Main Seal!
      // On W29 timeout/early random claim (opts.autoTimeout), ALWAYS store as unequipped seal in bag/stash so active seals & gear stay 100% intact!
      grantResult = grantSealSafely(chosen.kind, chosen.star, {
        rarity: chosen.rarity,
        origin: 'destiny_gamble',
        silent: !!opts.silent,
        storeUnequipped: !!opts.autoTimeout
      });
    }
  } else if (chosen.category === 'pill') {
    grantResult = { ok: true, ...applyDestinyPillReward(chosen.pillKey) };
    AudioKit.play('chest', 1.15);
    if (!opts.silent) toast(`💊 领取【${chosen.name}】：${grantResult.effect}！`);
  } else if (chosen.category === 'special') {
    if (chosen.subType === 'transfer_token') {
      const cnt = Math.max(1, Number(chosen.tokenCount || 1));
      changeTransferTokens(cnt, 'destiny_transfer_token');
      grantResult = { ok: true, action: 'transfer_token_granted', tokenCount: cnt, totalTokens: game.transferTokens };
      AudioKit.play('level', 1.15);
      if (!opts.silent) toast(`🔮 获得【${chosen.name}】！当前天命转印符：${game.transferTokens} 枚！`);
    } else if (chosen.subType === 'destiny_exclusive') {
      const ek = chosen.enhancementKey;
      game.hero.destinyEnhancements = game.hero.destinyEnhancements || {};
      game.hero.destinyEnhancements[ek] = true;
      if (ek === 'destiny_aegis_bulwark') syncHeroMaxHp();
      if (ek === 'destiny_golden_temper') changeMaterials(4, 'destiny_golden_temper');
      grantResult = { ok: true, action: 'destiny_exclusive_granted', enhancementKey: ek };
      AudioKit.play('level', 1.25);
      addRing(game.hero.x, game.hero.y, '#e4c4ff', 2.8);
      if (!opts.silent) toast(`🌟 习得天命专属强化【${chosen.name}】：${chosen.desc}`);
    } else if (chosen.subType === 'special_boon') {
      const spec = DESTINY_SPECIAL_BOONS[chosen.boonKey] || DESTINY_SPECIAL_BOONS.boon_forge_bundle;
      const r = chosen.rarity || 'common';
      if (spec.materialsByRarity?.[r]) changeMaterials(spec.materialsByRarity[r], 'destiny_special_boon');
      if (spec.hpByRarity?.[r]) {
        game.hero.baseMaxHp += spec.hpByRarity[r];
        syncHeroMaxHp();
        game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + (r === 'rare' ? 70 : 40));
      }
      if (spec.shieldByRarity?.[r]) {
        gainFrostShield(spec.shieldByRarity[r], { maxShield: 120, duration: 6.5, source: 'destiny_boon' });
        game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 35);
      }
      grantResult = { ok: true, action: 'special_boon_granted', boonKey: spec.key };
      AudioKit.play('chest', 1.1);
      if (!opts.silent) toast(`✨ 领取【${chosen.name}】：${chosen.desc}`);
    }
  }

  game.destiny.history.push({
    outcome: 'claimed',
    offerId: offer.offerId,
    bet: offer.bet,
    wave: game.wave,
    choiceIndex: idx,
    category: chosen.category,
    subType: chosen.subType,
    name: chosen.name
  });

  if (game.activeModal?.type === 'destiny_gamble') renderDestinyGambleModal();
  renderAllUI(true);
  return { ok: true, offerId: offer.offerId, choiceIndex: idx, chosen, grantResult };
}

function autoClaimPendingDestinyReward(rndFn = game?.rnd || Math.random, opts = {}){
  const offer = getPendingDestinyOffer();
  if (!offer) return { ok: false, reason: 'no_pending_offer' };
  const idx = Math.floor(rndFn() * offer.choices.length);
  return claimDestinyReward(idx, {
    offerId: offer.offerId,
    autoTimeout: true,
    allowDuringFinalPrepResolve: !!opts?.allowDuringFinalPrepResolve
  });
}

/* ==================== STAGE 4: AFFIX TRANSFER WORKBENCH (词条转移台) ==================== */
function resolveGearLocation(ref){
  if (!game?.hero || !ref) return null;
  if (typeof ref === 'string') {
    const eqIdx = game.hero.gear.findIndex(g => g && g.uid === ref);
    if (eqIdx >= 0) return { inst: game.hero.gear[eqIdx], location: 'equipped', idx: eqIdx };
    const bagIdx = game.bag.findIndex(g => g && !isBagSeal(g) && g.uid === ref);
    if (bagIdx >= 0) return { inst: game.bag[bagIdx], location: 'bag', idx: bagIdx };
    return null;
  }
  if (typeof ref === 'object') {
    if (ref.uid) return resolveGearLocation(ref.uid);
    if (ref.location === 'equipped') {
      const inst = game.hero.gear[ref.idx];
      return (inst && isGearInstance(inst)) ? { inst, location: 'equipped', idx: ref.idx } : null;
    }
    if (ref.location === 'bag') {
      const inst = game.bag[ref.idx];
      return (inst && !isBagSeal(inst) && isGearInstance(inst)) ? { inst, location: 'bag', idx: ref.idx } : null;
    }
  }
  return null;
}

function getAffixTransferCost(affixId, isOverwrite = false){
  const cfg = BALANCE.affixTransfer || {};
  const spec = GEAR_AFFIXES[affixId];
  const rar = spec?.rarity || 'common';
  const baseTokens = Math.max(1, Number(cfg.baseTokenCost ?? 1));
  const extraTokens = isOverwrite ? Math.max(0, Number(cfg.overwriteExtraTokenCost ?? 0)) : 0;
  const goldMap = cfg.goldCostByAffixRarity || { common: 28, rare: 45, epic: 68 };
  const baseGold = Math.max(1, Number(goldMap[rar] ?? 35));
  const extraGold = isOverwrite ? Math.max(0, Number(cfg.overwriteGoldExtra ?? 18)) : 0;
  return {
    costTokens: baseTokens + extraTokens,
    costGold: baseGold + extraGold,
    isOverwrite: !!isOverwrite
  };
}

function validateAffixTransfer(params = {}){
  const { source, sourceSlot, target, targetSlot } = params || {};
  if (!game?.hero) return { ok: false, reason: 'no_game' };
  const src = resolveGearLocation(source);
  if (!src) return { ok: false, reason: 'invalid_source' };
  const tgt = resolveGearLocation(target);
  if (!tgt) return { ok: false, reason: 'invalid_target' };
  if (src.inst.uid === tgt.inst.uid) return { ok: false, reason: 'same_gear' };

  const sIdx = Math.floor(Number(sourceSlot));
  if (!Number.isFinite(sIdx) || sIdx < 0 || sIdx >= src.inst.slotsCount) {
    return { ok: false, reason: 'invalid_source_slot' };
  }
  const srcAffix = src.inst.affixes?.[sIdx] || null;
  if (!srcAffix || !GEAR_AFFIXES[srcAffix.id]) {
    return { ok: false, reason: 'empty_source_slot' };
  }

  const tIdx = Math.floor(Number(targetSlot));
  if (!Number.isFinite(tIdx) || tIdx < 0 || tIdx >= tgt.inst.slotsCount) {
    return { ok: false, reason: 'invalid_target_slot' };
  }

  const incomingSpec = GEAR_AFFIXES[srcAffix.id];
  const replacedAffix = tgt.inst.affixes?.[tIdx] || null;
  const isOverwrite = !!replacedAffix;

  // Check duplicate affix & conflict group on target gear EXCLUDING targetSlot (which is being overwritten)
  for (let i = 0; i < tgt.inst.slotsCount; i++) {
    if (i === tIdx) continue;
    const other = tgt.inst.affixes?.[i];
    if (!other || !GEAR_AFFIXES[other.id]) continue;
    if (other.id === srcAffix.id) {
      return { ok: false, reason: 'duplicate_affix_on_target', affixId: srcAffix.id };
    }
    const otherSpec = GEAR_AFFIXES[other.id];
    if (incomingSpec.conflictGroup && otherSpec.conflictGroup === incomingSpec.conflictGroup) {
      return {
        ok: false,
        reason: 'conflict_group_on_target',
        conflictGroup: incomingSpec.conflictGroup,
        conflictingAffixId: other.id
      };
    }
  }

  const { costTokens, costGold } = getAffixTransferCost(srcAffix.id, isOverwrite);
  if ((game.transferTokens || 0) < costTokens) {
    return {
      ok: false,
      reason: 'insufficient_transfer_tokens',
      costTokens, costGold, isOverwrite,
      haveTokens: game.transferTokens || 0,
      haveGold: game.gold || 0
    };
  }
  if ((game.gold || 0) < costGold) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      costTokens, costGold, isOverwrite,
      haveTokens: game.transferTokens || 0,
      haveGold: game.gold || 0
    };
  }

  return {
    ok: true,
    reason: null,
    src, tgt,
    sourceSlot: sIdx,
    targetSlot: tIdx,
    srcAffix,
    replacedAffix,
    isOverwrite,
    costTokens,
    costGold
  };
}

function describeTransferError(reason){
  const map = {
    invalid_source: '请选择有效的源装备',
    invalid_target: '请选择有效的目标装备',
    same_gear: '源装备与目标装备不能为同一件构装',
    invalid_source_slot: '源槽位索引无效',
    empty_source_slot: '源槽位为空，无法提取词条',
    invalid_target_slot: '目标槽位索引无效',
    duplicate_affix_on_target: '目标装备已存在同名词条（严禁复制与同件重复词条）',
    conflict_group_on_target: '目标装备存在互斥词条组冲突，无法转入',
    insufficient_transfer_tokens: '天命转印符不足（仅可通过天命赌局获取）',
    insufficient_gold: '金币不足，无法支付本次转印费用'
  };
  return map[reason] || `转移条件不满足 (${reason})`;
}

// ZERO side-effect preview: NEVER mutates gold, transferTokens, or gear!
function previewAffixTransfer(params = {}){
  if (!game?.hero) return { ok: false, canCommit: false, reason: 'no_game' };
  const check = validateAffixTransfer(params);
  const src = resolveGearLocation(params.source);
  const tgt = resolveGearLocation(params.target);

  let sourceBeforeSyns = [], sourceAfterSyns = [];
  let targetBeforeSyns = [], targetAfterSyns = [];
  let globalBeforeSyns = evaluateEquipmentSynergies(game.hero.gear).active;
  let globalAfterSyns = globalBeforeSyns;

  if (src) sourceBeforeSyns = evaluateItemSynergies(src.inst);
  if (tgt) targetBeforeSyns = evaluateItemSynergies(tgt.inst);

  const sIdx = Math.floor(Number(params.sourceSlot));
  const tIdx = Math.floor(Number(params.targetSlot));
  const srcAffix = (src && Number.isFinite(sIdx) && sIdx >= 0 && sIdx < src.inst.slotsCount) ? (src.inst.affixes?.[sIdx] || null) : null;
  const tgtAffix = (tgt && Number.isFinite(tIdx) && tIdx >= 0 && tIdx < tgt.inst.slotsCount) ? (tgt.inst.affixes?.[tIdx] || null) : null;
  const cost = srcAffix ? getAffixTransferCost(srcAffix.id, !!tgtAffix) : { costTokens: 1, costGold: 0, isOverwrite: false };

  if (src && tgt && src.inst.uid !== tgt.inst.uid && srcAffix && Number.isFinite(tIdx) && tIdx >= 0 && tIdx < tgt.inst.slotsCount) {
    const vSrc = JSON.parse(JSON.stringify(src.inst));
    const vTgt = JSON.parse(JSON.stringify(tgt.inst));
    while (vSrc.affixes.length < vSrc.slotsCount) vSrc.affixes.push(null);
    while (vTgt.affixes.length < vTgt.slotsCount) vTgt.affixes.push(null);
    vSrc.affixes[sIdx] = null;
    vTgt.affixes[tIdx] = { id: srcAffix.id, tier: Math.max(1, 1 + (vTgt.enhanceLv || 0)), rarity: GEAR_AFFIXES[srcAffix.id]?.rarity || 'common' };
    sourceAfterSyns = evaluateItemSynergies(vSrc);
    targetAfterSyns = evaluateItemSynergies(vTgt);

    const vEquipped = game.hero.gear.map(g => {
      if (g.uid === vSrc.uid) return vSrc;
      if (g.uid === vTgt.uid) return vTgt;
      return g;
    });
    globalAfterSyns = evaluateEquipmentSynergies(vEquipped).active;
  }

  const preview = {
    ok: true,
    canCommit: !!check.ok,
    reason: check.ok ? null : check.reason,
    errorText: check.ok ? '' : describeTransferError(check.reason),
    source: src ? { uid: src.inst.uid, location: src.location, idx: src.idx, name: gearLabel(src.inst) } : null,
    target: tgt ? { uid: tgt.inst.uid, location: tgt.location, idx: tgt.idx, name: gearLabel(tgt.inst) } : null,
    sourceSlot: sIdx,
    targetSlot: tIdx,
    movingAffix: srcAffix ? { ...srcAffix, name: GEAR_AFFIXES[srcAffix.id]?.name || srcAffix.id } : null,
    replacedAffix: tgtAffix ? { ...tgtAffix, name: GEAR_AFFIXES[tgtAffix.id]?.name || tgtAffix.id } : null,
    isOverwrite: !!tgtAffix,
    costTokens: cost.costTokens,
    costGold: cost.costGold,
    sourceBeforeSynergies: sourceBeforeSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier })),
    sourceAfterSynergies: sourceAfterSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier })),
    targetBeforeSynergies: targetBeforeSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier })),
    targetAfterSynergies: targetAfterSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier })),
    globalBeforeSynergies: globalBeforeSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier })),
    globalAfterSynergies: globalAfterSyns.map(s => ({ id: s.id, name: s.name, tier: s.tier }))
  };

  game.transferDraft = {
    source: params.source,
    sourceSlot: sIdx,
    target: params.target,
    targetSlot: tIdx,
    preview
  };
  return preview;
}

// ZERO side-effect cancel: discards draft without touching any resource or gear!
function cancelAffixTransferPreview(){
  if (game) game.transferDraft = null;
  return { ok: true, cancelled: true };
}

// SINGLE ATOMIC COMMIT: validates everything fresh at commit time, deducts tokens+gold, extracts source slot -> null (keeping source gear), writes target slot, recomputes synergies!
function commitAffixTransfer(params = null){
  if (!game?.hero) return { ok: false, reason: 'no_game' };
  if (isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
  const input = params || game.transferDraft;
  if (!input) return { ok: false, reason: 'no_transfer_params' };

  const check = validateAffixTransfer(input);
  if (!check.ok) {
    toast(describeTransferError(check.reason), true);
    return {
      ok: false,
      reason: check.reason,
      errorText: describeTransferError(check.reason),
      transferTokensLeft: game.transferTokens || 0,
      goldLeft: game.gold || 0
    };
  }

  // ATOMIC COMMIT BLOCK (all checks passed!)
  if (check.costTokens > 0) changeTransferTokens(-check.costTokens, 'affix_transfer');
  if (check.costGold > 0) changeGold(-check.costGold, 'affix_transfer');

  while (check.src.inst.affixes.length < check.src.inst.slotsCount) check.src.inst.affixes.push(null);
  while (check.tgt.inst.affixes.length < check.tgt.inst.slotsCount) check.tgt.inst.affixes.push(null);

  const movedAffix = {
    id: check.srcAffix.id,
    tier: Math.max(1, 1 + (check.tgt.inst.enhanceLv || 0)),
    rarity: GEAR_AFFIXES[check.srcAffix.id].rarity
  };
  // Source gear is PRESERVED; source slot becomes null empty slot!
  check.src.inst.affixes[check.sourceSlot] = null;
  check.src.inst.extractedCount = (check.src.inst.extractedCount || 0) + 1;
  // Target slot receives the moved affix (filling empty slot or overwriting previous affix)
  check.tgt.inst.affixes[check.targetSlot] = movedAffix;

  game.transferDraft = null;
  syncHeroMaxHp();
  const globalSyn = recomputeEquipmentSynergies();
  const sourceSyns = evaluateItemSynergies(check.src.inst);
  const targetSyns = evaluateItemSynergies(check.tgt.inst);
  if (game.stats) game.stats.affixTransfers = (game.stats.affixTransfers || 0) + 1;

  AudioKit.play('merge', 1.25);
  addRing(game.hero.x, game.hero.y, '#c68cff', 2.4);
  addFloat(game.hero.x, game.hero.y - 0.6, `✨ 词条转印成功 · ${GEAR_AFFIXES[movedAffix.id].name}`, '#e4c4ff', true);
  toast(`✨ 词条转移成功！已将【${GEAR_AFFIXES[movedAffix.id].name}】从【${gearLabel(check.src.inst)}】移至【${gearLabel(check.tgt.inst)}】（消耗 🔮${check.costTokens} + 💰${check.costGold}），联动已实时重算！`);
  if (game.activeModal?.type === 'affix_transfer') renderAffixTransferModal();
  renderAllUI(true);

  return {
    ok: true,
    costTokens: check.costTokens,
    costGold: check.costGold,
    isOverwrite: check.isOverwrite,
    sourceUid: check.src.inst.uid,
    targetUid: check.tgt.inst.uid,
    sourceSlot: check.sourceSlot,
    targetSlot: check.targetSlot,
    movedAffix,
    replacedAffix: check.replacedAffix,
    sourceSynergies: sourceSyns.map(s => s.id),
    targetSynergies: targetSyns.map(s => s.id),
    globalSynergies: globalSyn.active.map(s => s.id),
    transferTokensLeft: game.transferTokens,
    goldLeft: game.gold
  };
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
