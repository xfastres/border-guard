import BALANCE from '../../data/balance.js';
import { ARTIFACTS, ARTIFACT_KEYS } from '../../data/core-data.js';
import { GEARS, GEAR_RARITY_LABELS } from '../../data/equipment-data.js';
import { DESTINY_ENHANCEMENTS, DESTINY_ENHANCEMENT_KEYS, DESTINY_SPECIAL_BOONS, DESTINY_SPECIAL_BOON_KEYS, DESTINY_PILLS } from '../../data/destiny-data.js';
import { getBuildRoute } from '../../core/state-queries.js';
import { clamp } from '../../core/math.js';

export function getDestinyConfig(){
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

export function getDestinyBetBand(bet){
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

export function createDestinyGamble(ctx, { meta, unlock, equipment, economy, hero, combat }) {
  const { hasMetaAux, getActiveRunGearKeys, pickWeightedByMainLegacy } = meta;
  const { getSealStarCap, getSubSealSlotCap } = unlock;
  const { createGearInstance, evaluateItemSynergies, getGearSynergyHints, describeGearEffect, grantGearSafely, grantSealSafely } = equipment;
  const { changeGold, changeMaterials, changeTransferTokens } = economy;
  const { syncHeroMaxHp, gainHeroXp } = hero;
  const { gainFrostShield } = combat;

  function rollDestinyQuality(bet, rndFn = ctx.game?.rnd || Math.random){
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

  function rollDestinyCategories(count = 3, rndFn = ctx.game?.rnd || Math.random, allowDuplicateOverride = null){
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
    if (!ctx.game?.seal) return false;
    const cap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    if (ctx.game.seal.star < cap) return false;
    if (ctx.game.subSeals.length < subCap) return false;
    return ctx.game.subSeals.every(s => s.star >= 3);
  }

  function isSealKindCurrentlyMaxed(kind){
    if (!ctx.game) return false;
    const cap = getSealStarCap();
    if (ctx.game.seal && ctx.game.seal.kind === kind && ctx.game.seal.star >= cap) return true;
    const sub = ctx.game.subSeals.find(s => s.kind === kind);
    if (sub && sub.star >= 3) return true;
    return false;
  }

  function getAvailableDestinyEnhancements({ allowLegend = true, excludeKeys = null } = {}){
    const owned = ctx.game?.hero?.destinyEnhancements || {};
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
          if (!ctx.game.seal) return true;
          if (ctx.game.seal.kind === k && ctx.game.seal.star < cap) return true;
          if (ctx.game.subSeals.some(s => s.kind === k && s.star < 3)) return true;
          if (ctx.game.seal.kind !== k && !ctx.game.subSeals.some(s => s.kind === k) && ctx.game.subSeals.length < subCap) return true;
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
      const safetyHint = (ctx.game.seal && ctx.game.seal.kind !== kind && ctx.game.subSeals.length >= subCap)
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
      const activePool = getActiveRunGearKeys();
      const pool = activePool.filter(k => GEARS[k].rarity === rarity);
      const list = pool.length ? pool : activePool;
      const baseKey = pickWeightedByMainLegacy(list, key => GEARS[key].elem, rndFn, getBuildRoute(ctx.game)?.elem);
      const gear = createGearInstance(baseKey, {
        rarity,
        wave: ctx.game.wave,
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
    const p = ctx.game?.destiny?.pendingOffer;
    return (p && !p.claimed) ? p : null;
  }

  // Single atomic checkout: validates bet & pendingOffer, deducts gold ONCE, resolves empty tribulation OR generates 3 candidates!
  function rollDestinyGamble(betAmount, opts = {}){
    if (!ctx.game || !ctx.game.destiny) return { ok: false, reason: 'no_game' };
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
    if (ctx.game.phase !== 'prep') {
      ctx.ports.ui.toast('仅在备战期（含 W29 终局整备）可开启天命赌局！', true);
      return { ok: false, reason: 'not_in_prep' };
    }
    if (ctx.game.destiny.pendingOffer && !ctx.game.destiny.pendingOffer.claimed) {
      ctx.ports.ui.toast('当前已有未领取的天命三选一奖励，请先领取再继续押注！', true);
      return { ok: false, reason: 'pending_offer_unclaimed', pendingOffer: ctx.game.destiny.pendingOffer };
    }
    const cfg = getDestinyConfig();
    const bet = Math.floor(Number(betAmount));
    if (!Number.isFinite(bet) || bet < cfg.minBet) {
      ctx.ports.ui.toast(`押注金额不得低于最低门槛 ${cfg.minBet} 金币！`, true);
      return { ok: false, reason: 'below_min_bet', minBet: cfg.minBet };
    }
    if (ctx.game.gold < bet) {
      ctx.ports.ui.toast(`金币不足！本次押注需要 💰${bet}（当前 💰${ctx.game.gold}）`, true);
      return { ok: false, reason: 'insufficient_gold', need: bet, have: ctx.game.gold };
    }

    // ATOMIC DEDUCTION (irreversible once confirmed)
    const rndFn = opts.rndFn || ctx.game.rnd;
    changeGold(-bet, 'destiny_gamble_bet');
    ctx.game.destiny.totalRolls++;
    ctx.game.destiny.totalGoldBet += bet;
    if (ctx.game.stats) ctx.game.stats.destinyRolls = (ctx.game.stats.destinyRolls || 0) + 1;

    const isEmpty = opts.forceOutcome === 'empty'
      ? true
      : opts.forceOutcome === 'win'
        ? false
        : (rndFn() < cfg.emptyTribulationChance);

    if (isEmpty) {
      ctx.game.destiny.emptyTribulations++;
      ctx.game.destiny.pendingOffer = null;
      const stopLossRefund = hasMetaAux('aux_destiny_foresight') ? Math.floor(bet * 0.25) : 0;
      if (stopLossRefund > 0) changeGold(stopLossRefund, 'destiny_stop_loss_refund');
      ctx.game.destiny.lastOutcome = { outcome: 'empty_tribulation', bet, stopLossRefund, wave: ctx.game.wave };
      ctx.game.destiny.history.push({ outcome: 'empty_tribulation', bet, stopLossRefund, wave: ctx.game.wave });
      if (ctx.game.stats) ctx.game.stats.destinyEmptyTribulations = (ctx.game.stats.destinyEmptyTribulations || 0) + 1;
      ctx.ports.audio.play('hit', 0.9);
      ctx.ports.ui.flashScreen('fail');
      if (!opts.silent) {
        ctx.ports.ui.toast(stopLossRefund > 0
          ? `🌩️ 触发天命空劫！天命观星返还止损 💰${stopLossRefund}，无候选奖励。`
          : `🌩️ 触发天命空劫！本次押注 💰${bet} 归零，无候选奖励。`, true);
      }
      if (ctx.game.activeModal?.type === 'destiny_gamble') ctx.ports.modals.renderDestinyGambleModal();
      ctx.ports.ui.renderAllUI(true);
      return { ok: true, outcome: 'empty_tribulation', bet, stopLossRefund, goldLeft: ctx.game.gold, pendingOffer: null };
    }

    // WIN: Generate 3 random candidates with strict 4x25% category weights and pure probability quality (NO rarity pity!)
    const categories = rollDestinyCategories(3, rndFn, opts.allowDuplicateCategories ?? null);
    const offerCtx = { usedExclusiveKeys: new Set() };
    const choices = categories.map((cat, idx) => ({
      choiceIndex: idx,
      ...buildDestinyCandidate(cat, bet, rndFn, offerCtx)
    }));
    const offer = {
      offerId: `dg_${ctx.game.wave}_${ctx.game.destiny.nextOfferSeq++}`,
      bet,
      wave: ctx.game.wave,
      choices,
      claimed: false,
      claimedChoiceIndex: null,
      claimedAtWave: null
    };
    ctx.game.destiny.pendingOffer = offer;
    ctx.game.destiny.wins++;
    ctx.game.destiny.lastOutcome = { outcome: 'win', bet, wave: ctx.game.wave, offerId: offer.offerId };
    ctx.ports.audio.play('chest', 1.2);
    ctx.ports.ui.flashScreen('gold');
    if (!opts.silent) ctx.ports.ui.toast(`🎲 天命开奖成功（押注 💰${bet}）！请从 3 件天命候选中择一领取！`);
    if (ctx.game.activeModal?.type === 'destiny_gamble') ctx.ports.modals.renderDestinyGambleModal();
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, outcome: 'win', bet, goldLeft: ctx.game.gold, pendingOffer: offer };
  }

  function applyDestinyPillReward(pillKey){
    const h = ctx.game.hero;
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
    if (!ctx.game?.destiny) return { ok: false, reason: 'no_game' };
    if (ctx.isFinalPrepActionLocked() && !opts.allowDuringFinalPrepResolve) {
      return { ok: false, reason: 'final_prep_locked' };
    }
    const offer = ctx.game.destiny.pendingOffer;
    if (!offer) return { ok: false, reason: 'no_pending_offer' };
    if (opts.offerId && offer.offerId !== opts.offerId) {
      return { ok: false, reason: 'offer_id_mismatch' };
    }
    ctx.game.destiny.claimedOfferIds = ctx.game.destiny.claimedOfferIds || [];
    if (offer.claimed || ctx.game.destiny.claimedOfferIds.includes(offer.offerId)) {
      ctx.game.destiny.pendingOffer = null;
      return { ok: false, reason: 'already_claimed', offerId: offer.offerId };
    }
    const idx = Math.floor(Number(choiceIndex));
    if (!Number.isFinite(idx) || idx < 0 || idx >= offer.choices.length) {
      return { ok: false, reason: 'invalid_choice_index' };
    }

    // ATOMIC SINGLE-CHECKOUT LOCK BEFORE GRANTING REWARD (prevents any duplicate grant on double click!)
    offer.claimed = true;
    offer.claimedChoiceIndex = idx;
    offer.claimedAtWave = ctx.game.wave;
    ctx.game.destiny.claimedOfferIds.push(offer.offerId);
    ctx.game.destiny.pendingOffer = null;
    ctx.game.destiny.lastOffer = offer;
    if (ctx.game.stats) ctx.game.stats.destinyClaims = (ctx.game.stats.destinyClaims || 0) + 1;

    const chosen = offer.choices[idx];
    let grantResult = null;

    if (chosen.category === 'gear' && chosen.gear) {
      grantResult = grantGearSafely(chosen.gear, { origin: 'destiny_gamble', silent: !!opts.silent });
    } else if (chosen.category === 'seal') {
      if (chosen.subType === 'seal_essence') {
        const totalBonus = (ctx.game.hero.sealEssenceBonus || 0) + (chosen.bonusPct || 0.15);
        ctx.game.hero.sealEssenceBonus = Math.min(BALANCE.destinyGamble.sealEssenceCap, Number(totalBonus.toFixed(4)));
        grantResult = { ok: true, action: 'seal_essence_applied', sealEssenceBonus: ctx.game.hero.sealEssenceBonus };
        ctx.ports.audio.play('merge', 1.2);
        if (!opts.silent) ctx.ports.ui.toast(`✨ 吸收【${chosen.name}】，主灵印永久伤害累计 +${Math.round(ctx.game.hero.sealEssenceBonus * 100)}%！`);
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
      ctx.ports.audio.play('chest', 1.15);
      if (!opts.silent) ctx.ports.ui.toast(`💊 领取【${chosen.name}】：${grantResult.effect}！`);
    } else if (chosen.category === 'special') {
      if (chosen.subType === 'transfer_token') {
        const cnt = Math.max(1, Number(chosen.tokenCount || 1));
        changeTransferTokens(cnt, 'destiny_transfer_token');
        grantResult = { ok: true, action: 'transfer_token_granted', tokenCount: cnt, totalTokens: ctx.game.transferTokens };
        ctx.ports.audio.play('level', 1.15);
        if (!opts.silent) ctx.ports.ui.toast(`🔮 获得【${chosen.name}】！当前天命转印符：${ctx.game.transferTokens} 枚！`);
      } else if (chosen.subType === 'destiny_exclusive') {
        const ek = chosen.enhancementKey;
        ctx.game.hero.destinyEnhancements = ctx.game.hero.destinyEnhancements || {};
        ctx.game.hero.destinyEnhancements[ek] = true;
        if (ek === 'destiny_aegis_bulwark') syncHeroMaxHp();
        if (ek === 'destiny_golden_temper') changeMaterials(4, 'destiny_golden_temper');
        grantResult = { ok: true, action: 'destiny_exclusive_granted', enhancementKey: ek };
        ctx.ports.audio.play('level', 1.25);
        ctx.ports.vfx.addRing(ctx.game.hero.x, ctx.game.hero.y, '#e4c4ff', 2.8);
        if (!opts.silent) ctx.ports.ui.toast(`🌟 习得天命专属强化【${chosen.name}】：${chosen.desc}`);
      } else if (chosen.subType === 'special_boon') {
        const spec = DESTINY_SPECIAL_BOONS[chosen.boonKey] || DESTINY_SPECIAL_BOONS.boon_forge_bundle;
        const r = chosen.rarity || 'common';
        if (spec.materialsByRarity?.[r]) changeMaterials(spec.materialsByRarity[r], 'destiny_special_boon');
        if (spec.hpByRarity?.[r]) {
          ctx.game.hero.baseMaxHp += spec.hpByRarity[r];
          syncHeroMaxHp();
          ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + (r === 'rare' ? 70 : 40));
        }
        if (spec.shieldByRarity?.[r]) {
          gainFrostShield(spec.shieldByRarity[r], { maxShield: 120, duration: 6.5, source: 'destiny_boon' });
          ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + 35);
        }
        grantResult = { ok: true, action: 'special_boon_granted', boonKey: spec.key };
        ctx.ports.audio.play('chest', 1.1);
        if (!opts.silent) ctx.ports.ui.toast(`✨ 领取【${chosen.name}】：${chosen.desc}`);
      }
    }

    ctx.game.destiny.history.push({
      outcome: 'claimed',
      offerId: offer.offerId,
      bet: offer.bet,
      wave: ctx.game.wave,
      choiceIndex: idx,
      category: chosen.category,
      subType: chosen.subType,
      name: chosen.name
    });

    if (ctx.game.activeModal?.type === 'destiny_gamble') ctx.ports.modals.renderDestinyGambleModal();
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, offerId: offer.offerId, choiceIndex: idx, chosen, grantResult };
  }

  function autoClaimPendingDestinyReward(rndFn = ctx.game?.rnd || Math.random, opts = {}){
    const offer = getPendingDestinyOffer();
    if (!offer) return { ok: false, reason: 'no_pending_offer' };
    const idx = Math.floor(rndFn() * offer.choices.length);
    return claimDestinyReward(idx, {
      offerId: offer.offerId,
      autoTimeout: true,
      allowDuringFinalPrepResolve: !!opts?.allowDuringFinalPrepResolve
    });
  }

  return {
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
  };
}
