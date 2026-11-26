import { BUILD_ROUTES, SKILL_BUILD_KEYS } from '../../data/build-data.js';
import BALANCE from '../../data/balance.js';
import { W20_DIRECTIONS, W20_DIRECTION_KEYS, W20_ENHANCEMENTS } from '../../data/progression-data.js';
import { clamp } from '../../core/math.js';

export function createW20Breakthrough(ctx, { equipment, economy }) {
  const { getActiveGearAffixSynergies } = equipment;
  const { changeMaterials } = economy;

  function isW20PreselectOpen(){
    if (!ctx.game) return false;
    const openWave = BALANCE.w20Breakthrough?.preselectOpenWave || 16;
    return ctx.game.wave >= openWave && ctx.game.wave <= 20 && !ctx.game.w20State?.locked && !ctx.game.hero?.breakthroughs?.w20;
  }

  function isW20BossIntelRevealed(){
    if (!ctx.game) return false;
    const revealWave = BALANCE.w20Breakthrough?.bossIntelRevealWave || 19;
    return ctx.game.wave >= revealWave || !!ctx.game.bossIntel?.w20Revealed;
  }

  function getW20BossIntel(){
    if (!ctx.game?.bossIntel) return null;
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
      coreName: ctx.game.bossIntel.w20Core,
      coreDesc: ctx.game.bossIntel.w20CoreDesc,
      auxKey: ctx.game.bossIntel.w20AuxKey,
      auxName: ctx.game.bossIntel.w20Aux,
      auxDesc: ctx.game.bossIntel.w20AuxDesc,
      auxFairness: ctx.game.bossIntel.w20AuxFairness
    };
  }

  function isW30BossIntelRevealed(){
    if (!ctx.game) return false;
    const revealWave = BALANCE.w30Boss?.intelRevealWave || 29;
    return ctx.game.wave >= revealWave || !!ctx.game.bossIntel?.w30Revealed || !!ctx.game.finalPrep?.w30IntelShown;
  }

  function getW30BossIntel(){
    if (!ctx.game?.bossIntel) return null;
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
      coreName: ctx.game.bossIntel.w30Core,
      coreDesc: ctx.game.bossIntel.w30CoreDesc,
      auxKey: ctx.game.bossIntel.w30AuxKey,
      auxName: ctx.game.bossIntel.w30Aux,
      auxDesc: ctx.game.bossIntel.w30AuxDesc,
      auxFairness: ctx.game.bossIntel.w30AuxFairness,
      signatureThresholdPct: w30Cfg.signatureThresholdPct ?? 0.80,
      finalPhaseThresholdPct: w30Cfg.finalPhaseThresholdPct ?? 0.35
    };
  }

  function getW30BattleState(){
    if (!ctx.game?.w30Battle) return null;
    const boss = ctx.game.enemies?.find(e => e.kind === 'boss6') || null;
    return {
      ...JSON.parse(JSON.stringify(ctx.game.w30Battle)),
      bossHp: boss ? Math.max(0, Math.round(boss.hp)) : (ctx.game.w30Battle.outcome === 'victory' ? 0 : null),
      bossHpPct: boss ? Number((clamp(boss.hp, 0, boss.maxHp) * 100 / Math.max(1, boss.maxHp)).toFixed(2)) : (ctx.game.w30Battle.outcome === 'victory' ? 0 : null)
    };
  }

  function getRecommendedW20Direction(){
    if (!ctx.game?.hero) return 'fire_chain_surge';
    const primary = ctx.game.hero.breakthroughs?.w10?.skillKey || ctx.game.hero.starterSkill;
    const route = BUILD_ROUTES[SKILL_BUILD_KEYS[primary]];
    if (route) return route.direction;
    const syn = getActiveGearAffixSynergies();
    if (syn.hasFrostTrio || syn.hasFrostDuo || (ctx.game.hero.skills?.nova || 0) > (ctx.game.hero.skills?.firewave || 0)) {
      return 'frost_bastion_counter';
    }
    if (syn.hasFireTrio || syn.hasFireDuo || (ctx.game.hero.skills?.firewave || 0) > 0) {
      return 'fire_chain_surge';
    }
    return 'breaker_momentum';
  }

  function selectW20PreselectDirection(directionKey){
    if (!ctx.game) return { ok: false, reason: 'no_game' };
    const openWave = BALANCE.w20Breakthrough?.preselectOpenWave || 16;
    if (ctx.game.wave < openWave) {
      return { ok: false, reason: 'not_unlocked_yet', openWave };
    }
    if (ctx.game.w20State?.locked || ctx.game.hero?.breakthroughs?.w20) {
      return { ok: false, reason: 'direction_locked', lockedDirection: ctx.game.w20State?.lockedDirection || ctx.game.hero?.breakthroughs?.w20?.directionKey };
    }
    const spec = W20_DIRECTIONS[directionKey];
    if (!spec) {
      return { ok: false, reason: 'invalid_direction', validKeys: W20_DIRECTION_KEYS };
    }
    ctx.game.w20State.preselectedDirection = spec.key;
    ctx.ports.audio.play('coin', 1.15);
    ctx.ports.ui.toast(`已预选 W20 突破方向【${spec.icon} ${spec.name}】（击败 W20 首领拿到突破凭证后才会生效）`);
    if (ctx.game.activeModal?.type === 'w20_preselect') {
      ctx.ports.modals.renderW20PreselectModal(ctx.game.activeModal);
    }
    ctx.ports.ui.renderAllUI(true);
    return {
      ok: true,
      preselectedDirection: spec.key,
      directionName: spec.name,
      locked: false,
      baseEffectActive: false
    };
  }

  function lockW20DirectionForBattle(){
    if (!ctx.game) return { ok: false, reason: 'no_game' };
    const dirKey = ctx.game.w20State?.preselectedDirection || getRecommendedW20Direction();
    if (!W20_DIRECTIONS[dirKey]) return { ok: false, reason: 'invalid_direction' };
    ctx.game.w20State.preselectedDirection = dirKey;
    ctx.game.w20State.lockedDirection = dirKey;
    ctx.game.w20State.locked = true;
    ctx.game.w20State.lockedAtWave = ctx.game.wave;
    return {
      ok: true,
      lockedDirection: dirKey,
      directionName: W20_DIRECTIONS[dirKey].name,
      baseEffectActive: false // Still NOT active until defeating W20 Boss!
    };
  }

  function getValidW20EnhancementPool(directionKey, ownedKeys = []){
    if (!directionKey || !W20_DIRECTIONS[directionKey]) return [];
    const ownedSet = new Set(ownedKeys || []);
    if (ctx.game?.hero?.breakthroughs?.w20?.enhancementKey) {
      ownedSet.add(ctx.game.hero.breakthroughs.w20.enhancementKey);
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
      if (typeof c.applicable === 'function' && !c.applicable(ctx.game?.hero)) return false;
      return true;
    });
  }

  function getW20RerollCost(rerollCount = null){
    const cfg = BALANCE.w20Breakthrough || {};
    const base = Number.isFinite(Number(cfg.rerollBaseCost)) ? Number(cfg.rerollBaseCost) : 4;
    const step = Number.isFinite(Number(cfg.rerollStep)) ? Number(cfg.rerollStep) : 2;
    const cnt = rerollCount !== null && rerollCount !== undefined ? Number(rerollCount) : (ctx.game?.w20Draft?.rerollCount || 0);
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
      const idx = Math.floor((ctx.game?.rnd ? ctx.game.rnd() : Math.random()) * poolCopy.length);
      picked.push(poolCopy.splice(idx, 1)[0]);
    }
    return { ok: true, cards: picked, validPoolSize: validPool.length, requiredMinPool: minRequired };
  }

  function initW20EnhancementDraft(directionKey = null){
    if (!ctx.game) return { ok: false, reason: 'no_game' };
    const dirKey = directionKey || ctx.game.hero?.breakthroughs?.w20?.directionKey || ctx.game.w20State?.lockedDirection || 'fire_chain_surge';
    const cfg = BALANCE.w20Breakthrough || {};
    const K = Math.max(1, Number(cfg.groupSize || 2));
    const draw = drawW20CandidateGroup(dirKey, [], K);
    if (!draw.ok) {
      // Fallback without blocking base effect if config was deliberately shrunk in a test
      const rawPool = getValidW20EnhancementPool(dirKey).slice(0, K);
      ctx.game.w20Draft = {
        directionKey: dirKey,
        groupSize: K,
        rerollCount: 0,
        nextRerollCost: getW20RerollCost(0),
        candidates: rawPool.map(c => c.key),
        history: [rawPool.map(c => c.key)],
        prevCandidates: [],
        poolUnderCapacity: true
      };
      return { ok: false, reason: draw.reason, required: draw.required, available: draw.available, draft: ctx.game.w20Draft };
    }
    const ids = draw.cards.map(c => c.key);
    ctx.game.w20Draft = {
      directionKey: dirKey,
      groupSize: K,
      rerollCount: 0,
      nextRerollCost: getW20RerollCost(0),
      candidates: ids,
      history: [ids.slice()],
      prevCandidates: [],
      poolUnderCapacity: false
    };
    return { ok: true, draft: ctx.game.w20Draft, candidates: draw.cards, validPoolSize: draw.validPoolSize };
  }

  function rerollW20Enhancements(){
    if (!ctx.game || !ctx.game.w20Draft) return { ok: false, reason: 'no_active_draft' };
    const draft = ctx.game.w20Draft;
    const K = draft.groupSize || (BALANCE.w20Breakthrough?.groupSize || 2);
    const cost = getW20RerollCost(draft.rerollCount);

    if ((ctx.game.materials || 0) < cost) {
      ctx.ports.ui.toast(`锻材不足！本次整组重抽需 ${cost} 锻材（当前 ⚙️ ${ctx.game.materials || 0}）`, true);
      return {
        ok: false,
        reason: 'insufficient_materials',
        cost,
        materialsLeft: ctx.game.materials || 0,
        candidates: draft.candidates.slice()
      };
    }

    // Strict 2K+2 capacity redline check BEFORE deducting any materials!
    const recent = [...new Set((draft.history || [draft.candidates]).slice(-2).flat())];
    const draw = drawW20CandidateGroup(draft.directionKey, recent, K);
    if (!draw.ok) {
      ctx.ports.ui.toast(`候选池容量不足（需至少 ${draw.required} 张，当前 ${draw.available} 张），已保留当前候选与锻材余额！`, true);
      return {
        ok: false,
        reason: 'insufficient_pool',
        required: draw.required,
        available: draw.available,
        materialsLeft: ctx.game.materials,
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

    ctx.ports.audio.play('merge', 1.15);
    ctx.ports.ui.toast(`🎲 已消耗 ${cost} 锻材整组重抽！下次重抽需 ${draft.nextRerollCost} 锻材（剩余 ⚙️ ${ctx.game.materials}）`);
    if (ctx.game.activeModal?.type === 'w20_breakthrough') {
      ctx.ports.modals.renderW20BreakthroughModal();
    }
    ctx.ports.ui.renderAllUI(true);
    return {
      ok: true,
      costPaid: cost,
      materialsLeft: ctx.game.materials,
      rerollCount: draft.rerollCount,
      nextRerollCost: draft.nextRerollCost,
      prevCandidates: prevIds,
      candidates: draw.cards
    };
  }

  function pickW20Enhancement(enhKey){
    if (!ctx.game || !ctx.game.w20Draft) return { ok: false, reason: 'no_active_draft' };
    const draft = ctx.game.w20Draft;
    const spec = W20_ENHANCEMENTS[enhKey];
    if (!spec || !draft.candidates.includes(enhKey)) {
      return { ok: false, reason: 'invalid_enhancement_choice', candidates: draft.candidates.slice() };
    }
    const w20 = ctx.game.hero.breakthroughs.w20;
    if (!w20) return { ok: false, reason: 'w20_not_unlocked' };
    w20.enhancementKey = spec.key;
    w20.enhancementName = spec.name;
    w20.enhancementIcon = spec.icon;
    w20.enhancementDesc = spec.desc;
    w20.enhancementBehaviorTag = spec.behaviorTag;
    w20.rerollCount = draft.rerollCount;

    ctx.game.pendingBreakthrough = null;
    ctx.game.w20Draft = null;
    ctx.ports.ui.flashScreen('gold');
    ctx.ports.audio.play('level', 1.3);
    ctx.ports.vfx.addRing(ctx.game.hero.x, ctx.game.hero.y, '#ffd666', 4.5);
    ctx.ports.ui.showBanner(
      `⚡ W20 突破强化完成 · 【${w20.directionName} × ${spec.name}】！`,
      `即将进入第 21 波强势体验！${spec.behaviorTag}`,
      'good'
    );
    if (ctx.game.activeModal?.type === 'w20_breakthrough') {
      ctx.ports.modals.closeModal();
    }
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, breakthrough: { ...w20 } };
  }

  return {
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
  };
}
