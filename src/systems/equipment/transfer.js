import BALANCE from '../../data/balance.js';
import { GEAR_AFFIXES } from '../../data/index.js';
import { isFinalPrepActionLocked } from '../../core/state-queries.js';
import { gearLabel, isGearInstance } from './instance.js';
import { evaluateItemSynergies } from './synergy.js';

export function getAffixTransferCost(affixId, isOverwrite = false){
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

export function describeTransferError(reason){
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

export function createAffixTransfer(ctx, { equipment, economy, hero }) {
  const { evaluateEquipmentSynergies, recomputeEquipmentSynergies } = equipment;
  const { changeGold, changeTransferTokens, isBagSeal } = economy;
  const { syncHeroMaxHp } = hero;

  function resolveGearLocation(ref){
    const game = ctx.game;
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

  function validateAffixTransfer(params = {}){
    const game = ctx.game;
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

  // ZERO side-effect preview: NEVER mutates gold, transferTokens, or gear!
  function previewAffixTransfer(params = {}){
    const game = ctx.game;
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
    const game = ctx.game;
    if (game) game.transferDraft = null;
    return { ok: true, cancelled: true };
  }

  // SINGLE ATOMIC COMMIT: validates everything fresh at commit time, deducts tokens+gold, extracts source slot -> null (keeping source gear), writes target slot, recomputes synergies!
  function commitAffixTransfer(params = null){
    const game = ctx.game;
    if (!game?.hero) return { ok: false, reason: 'no_game' };
    if (isFinalPrepActionLocked(game)) return { ok: false, reason: 'final_prep_locked' };
    const input = params || game.transferDraft;
    if (!input) return { ok: false, reason: 'no_transfer_params' };

    const check = validateAffixTransfer(input);
    if (!check.ok) {
      ctx.ports.ui.toast(describeTransferError(check.reason), true);
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

    ctx.ports.audio.play('merge', 1.25);
    ctx.ports.vfx.addRing(game.hero.x, game.hero.y, '#c68cff', 2.4);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.6, `✨ 词条转印成功 · ${GEAR_AFFIXES[movedAffix.id].name}`, '#e4c4ff', true);
    ctx.ports.ui.toast(`✨ 词条转移成功！已将【${GEAR_AFFIXES[movedAffix.id].name}】从【${gearLabel(check.src.inst)}】移至【${gearLabel(check.tgt.inst)}】（消耗 🔮${check.costTokens} + 💰${check.costGold}），联动已实时重算！`);
    if (game.activeModal?.type === 'affix_transfer') ctx.ports.modals.renderAffixTransferModal();
    ctx.ports.ui.renderAllUI(true);

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

  return {
    resolveGearLocation,
    getAffixTransferCost,
    validateAffixTransfer,
    describeTransferError,
    previewAffixTransfer,
    cancelAffixTransferPreview,
    commitAffixTransfer,
  };
}
