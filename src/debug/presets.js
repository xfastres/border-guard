import { clamp, xpForLevel } from '../core/math.js';
import { getSourceStageForWave } from '../core/state-queries.js';
import BALANCE from '../data/balance.js';
import { ARTIFACTS, BUILD_ROUTES, GEARS, HERO_GEAR_SLOTS, HERO_SKILLS, MAIN_WAVES, W10_SKILL_BRANCHES, W20_DIRECTIONS, W20_ENHANCEMENTS } from '../data/index.js';

export function createDebugPresets(runtimeCtx, { systems, ui }) {
  const { makeGame } = systems.run;
  const { getActiveUnlockNode, getSealStarCap, getSubSealSlotCap, getRealmStageLabel } = systems.unlock;
  const { createGearInstance, normalizeGearInstance, recomputeEquipmentSynergies } = systems.equipmentCore;
  const { isBagSeal, resetRunMetricsResourceBaseline } = systems.economyCore;
  const { syncHeroMaxHp, refreshCombos } = systems.heroStats;
  const { rollShop } = systems.shop;
  const { getW20BossIntel, getW30BossIntel } = systems.w20;
  const { getPendingDestinyOffer } = systems.destiny;
  const { closeModal } = ui.modals;
  const { fitCamera, updateCamera } = ui.viewport;
  const { renderAllUI } = ui.hud;

  function loadTestPreset({ wave = 10, tier = 'standard', build = 'fire', materials, gold, transferTokens, seed = 2026 } = {}){
    const targetWave = clamp(Math.round(Number(wave) || 10), 1, MAIN_WAVES);
    const normTier = ['weak', 'standard', 'strong'].includes(tier) ? tier : 'standard';
    const normBuild = Object.hasOwn(BUILD_ROUTES, build) ? build : 'fire';
    const route = BUILD_ROUTES[normBuild];
    const runSeed = Number.isFinite(Number(seed)) ? Number(seed) : 2026;

    runtimeCtx.setPaused(false);
    closeModal();
    runtimeCtx.setGame(makeGame(runSeed));
    const game = runtimeCtx.game;
    game.debugRun = true;
    game.metaRunLocked = true;
    game.wave = targetWave;
    game.phase = 'prep';
    game.subPhase = null;
    game.pendingModals = [];
    game.activeModal = null;
    game.pendingBreakthrough = null;
    runtimeCtx.ports.modals.hideBackdrop();
    game.w10Draft = null;
    game.w20Draft = null;
    game.inspTarget = null;

    const h = game.hero;
    // W10 pre-battle and W20 pre-battle use state BEFORE completing that wave's breakthrough
    const hasW10 = targetWave >= 11;
    const hasW20 = targetWave >= 21;

    // Compute level & baseMaxHp appropriate for wave & tier
    const tierLvOffset = normTier === 'strong' ? 2 : normTier === 'weak' ? -1 : 0;
    const baseLv = Math.max(1, Math.round(1 + (targetWave - 1) * 0.92) + tierLvOffset);
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
      const primarySkill = route.skill;
      const branchKey = normBuild === 'frost'
        ? (normTier === 'strong' ? 'nv_glacial_bastion' : 'nv_seeking_vortex')
        : normBuild === 'fire' && normTier === 'strong' ? 'fw_ring_detonate' : route.branch;
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

    const defaultW20DirKey = route.direction;
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
        : normBuild === 'fire' && normTier === 'strong' ? 'w20_fire_supernova_chain' : route.enhancement;
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
      (targetWave >= 21 ? 5 : targetWave >= 11 ? 4 : targetWave >= 6 ? 3 : targetWave === 1 ? 1 : 2) + (normTier === 'strong' ? 1 : normTier === 'weak' ? -1 : 0),
      1, 5
    );
    const secLv = clamp(mainLv - 1, 1, 5);
    const tertLv = clamp(mainLv - 2, 1, 5);
    h.skills = { [route.skill]: mainLv };
    h.starterSkill = route.skill;
    const support = route.skill === 'blades' ? 'nova' : 'blades';
    if (targetWave >= 5) h.skills[support] = secLv;
    if (targetWave >= 6 && route.skill !== 'thunder') h.skills.thunder = secLv;
    if (targetWave >= 10 && route.skill !== 'berserk') h.skills.berserk = tertLv;
    if (targetWave >= 15 && route.skill !== 'stomp') h.skills.stomp = tertLv;

    // Initialize Main Seal & Sub-Seals within unlocked caps
    const sealCap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    const desiredMainStar = targetWave >= 21 ? 5 : targetWave >= 16 ? 4 : targetWave >= 11 ? 4 : targetWave >= 6 ? 3 : 2;
    const mainStar = clamp(
      desiredMainStar + (normTier === 'strong' ? 1 : normTier === 'weak' ? -1 : 0),
      1, sealCap
    );
    const mainKind = route.elem;
    game.seal = targetWave === 1 ? null : {
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
    const subOrder = ['thunder', 'wind', 'holy'].filter(kind => kind !== mainKind);
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
      : normBuild === 'fire' ? ['flame_fan', 'burn_core', 'crit_axe', 'vamp_fang']
        : [...route.gear.filter(key => GEARS[key]), 'vamp_fang'];
    const coreAffixes = route.affixes.slice(0, normTier === 'strong' ? 3 : normTier === 'standard' ? 2 : 1);
    const auxAffixSets = normBuild === 'frost'
      ? [['iron_bastion'], ['wind_tempest'], ['fortune_mint']]
      : [['fury_crit'], ['vamp_siphon'], ['wind_tempest']];
    const slotCount = targetWave === 1 ? 0 : targetWave >= 20 ? 4 : targetWave >= 10 ? (normTier === 'weak' ? 2 : 3) : 2;
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
        ? { destiny_fate_breaker: true, destiny_glacial_aegis: true }
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
    const game = runtimeCtx.game;
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
    const game = runtimeCtx.game;
    game.debugRun = true;
    game.metaRunLocked = true;
    runtimeCtx.ports.modals.hideBackdrop();
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

  return { loadTestPreset, exportBuildPreset, importBuildPreset };
}
