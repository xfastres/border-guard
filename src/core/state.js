import BALANCE from '../data/balance.js';
import { W, H, BASE_GEAR_KEYS, BASE_AFFIX_KEYS, W20_BOSS_AUX_POOL, W30_BOSS_AUX_POOL } from '../data/index.js';
import { xpForLevel } from './math.js';
import { mulberry32 } from './rng.js';
import { buildTerrainProps } from './terrain.js';

function buildRunState(seed, rnd, deps = {}){
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
    nextTowerId: 1,
    debugRun: false,
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
    w10SkillDrafts: null,
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
      skills: {},
      starterSkill: null,
      routeCombat: {},
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
      skillTimers: { swordlance: 0, sunward: 0, firewave: 0.3, thunder: 0.4, nova: 0.4, stomp: 0.5, spirit: 0 },
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
    runId: deps.generateRunId ? deps.generateRunId(seed) : `run_${seed}`,
    metaLoadout: (() => {
      const sv = deps.getMetaSave ? deps.getMetaSave() : { loadout: { main: null, aux: [] } };
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
      skillDmg: { swordlance:0, sunward:0, route:0, blades:0, firewave:0, thunder:0, nova:0, stomp:0, berserk:0, dash:0, spirit:0, combo:0, perk:0, burn:0 }
    }
  };
  return g;
}

export function createRunState(seed = Math.floor(Math.random() * 1e9), deps = {}) {
  return buildRunState(seed, mulberry32(seed), deps);
}

export function createGameStateFactory(ctx, deps) {
  function makeGame(seed = Math.floor(Math.random() * 1e9)){
    const rnd = mulberry32(seed);
    const terrainProps = buildTerrainProps(seed);
    ctx.setTerrainProps(terrainProps);
    return buildRunState(seed, rnd, deps);
  }

  return { makeGame };
}
