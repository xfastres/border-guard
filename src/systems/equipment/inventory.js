import {
  ARTIFACTS,
  GEAR_RARITY_LABELS,
  HERO_GEAR_SLOTS,
  SEAL_FUSE_NEED,
  SUB_SEAL_RESONANCE,
} from '../../data/index.js';
import BALANCE from '../../data/balance.js';
import { clamp } from '../../core/math.js';
import { getSourceStageSpec } from '../../core/state-queries.js';
import { gearBase, gearLabel, isGearInstance } from './instance.js';

export function createEquipmentInventory(ctx, { equipment, economy, unlock, hero }) {
  const { createGearInstance, normalizeGearInstance, nextGearUid, recomputeEquipmentSynergies } = equipment;
  const {
    changeGold,
    changeMaterials,
    getBagCapacity,
    getGearDismantleMaterials,
    getGearEnhanceCost,
    getGearEnhanceGoldCost,
    getGearSellGold,
    hasBagSpace,
    isBagSeal,
    tryStoreGearInBag,
  } = economy;
  const { getSealStarCap, getSubSealSlotCap } = unlock;
  const { syncHeroMaxHp } = hero;

  function equipGearFromBag(bagIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
    const raw = game.bag[bagIdx];
    if (isBagSeal(raw)) {
      // Safe non-destructive attempt to absorb/equip stashed seal without overwriting active Main Seal!
      const res = grantSealSafely(raw.kind, raw.star, { rarity: raw.rarity, origin: raw.origin || 'bag_seal', dryIfStore: true });
      if (res.ok && res.action !== 'stored_bag' && res.action !== 'stored_stash') {
        game.bag.splice(bagIdx, 1);
        ctx.ports.ui.renderAllUI(true);
        return true;
      }
      ctx.ports.ui.toast(`在用主辅灵印已满，【${raw.name} ${raw.star}★】不会覆盖当前主灵印！可右键出售换金或 Shift+右键拆解换锻材。`, true);
      ctx.ports.ui.renderAllUI(true);
      return false;
    }
    const inst = normalizeGearInstance(raw);
    if (game.hero.gear.length >= HERO_GEAR_SLOTS) {
      game.inspTarget = { type: 'hero' };
      ctx.ports.ui.toast(`领主构装槽已满（${HERO_GEAR_SLOTS}/${HERO_GEAR_SLOTS}），已在详情面板打开，可卸下、替换、出售或拆解！`, true);
      ctx.ports.ui.renderAllUI(true);
      return false;
    }
    game.bag.splice(bagIdx, 1);
    game.hero.gear.push(inst);
    syncHeroMaxHp();
    const syn = recomputeEquipmentSynergies();
    game.mode = null;
    const synTxt = syn.active.length ? ` · 当前联动：${syn.active.map(s => s.name).join(' / ')}` : '';
    ctx.ports.vfx.addRing(game.hero.x, game.hero.y, '#ffe478', 1.5);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `穿戴 ${gearLabel(inst)}`, '#ffe88a', true);
    ctx.ports.audio.play('chest');
    ctx.ports.ui.toast(`已穿戴【${gearLabel(inst)}】(${inst.slotsCount}槽)${synTxt}`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function replaceEquippedGear(slotIdx, bagIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
    if (slotIdx < 0 || slotIdx >= game.hero.gear.length) return { ok: false, reason: 'invalid_slot_idx' };
    if (bagIdx < 0 || bagIdx >= game.bag.length) return { ok: false, reason: 'invalid_bag_idx' };
    if (isBagSeal(game.bag[bagIdx])) {
      ctx.ports.ui.toast('灵印物品无法替换领主构装槽！', true);
      return { ok: false, reason: 'bag_item_is_seal' };
    }
    const incoming = normalizeGearInstance(game.bag[bagIdx]);
    const outgoing = game.hero.gear[slotIdx];
    game.hero.gear[slotIdx] = incoming;
    game.bag[bagIdx] = outgoing;
    syncHeroMaxHp();
    recomputeEquipmentSynergies();
    ctx.ports.audio.play('chest', 1.05);
    ctx.ports.ui.toast(`已用【${gearLabel(incoming)}】替换【${gearLabel(outgoing)}】，联动已实时重算！`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, slotIdx, bagIdx, incoming, outgoing };
  }

  function unequipGear(slotIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    const list = game.hero.gear;
    if (!list || slotIdx < 0 || slotIdx >= list.length) return false;
    if (!hasBagSpace(1)) {
      ctx.ports.ui.toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先替换或出售/拆解背包装备后再卸下！`, true);
      ctx.ports.ui.renderAllUI(true);
      return { ok: false, reason: 'bag_full' };
    }
    const [inst] = list.splice(slotIdx, 1);
    tryStoreGearInBag(inst);
    syncHeroMaxHp();
    recomputeEquipmentSynergies();
    ctx.ports.audio.play('coin', 0.85);
    ctx.ports.ui.toast(`已卸下【${gearLabel(inst)}】放回背包，联动已重算。`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function sellBagGear(bagIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
    const inst = game.bag[bagIdx];
    if (isBagSeal(inst)) {
      const spec = ARTIFACTS[inst.kind] || { cost: 22, name: inst.name || '灵印' };
      const pts = inst.star === 3 ? 4 : inst.star === 2 ? 2 : 1;
      const gold = Math.max(8, Math.round(spec.cost * pts * 0.65));
      game.bag.splice(bagIdx, 1);
      changeGold(gold, 'sell_bag_seal');
      ctx.ports.audio.play('coin', 1.1);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `售灵印 +${gold} 金`, '#ffe27a');
      ctx.ports.ui.toast(`💰 已出售未装备灵印【${spec.name} ${inst.star}★】，获得 +${gold} 金币！`);
      ctx.ports.ui.renderAllUI(true);
      return true;
    }
    const gold = getGearSellGold(inst);
    game.bag.splice(bagIdx, 1);
    changeGold(gold, 'sell_bag_gear');
    ctx.ports.audio.play('coin', 1.1);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `出售 +${gold} 金`, '#ffe27a');
    ctx.ports.ui.toast(`💰 已出售【${gearLabel(inst)}】(${GEAR_RARITY_LABELS[inst.rarity]}·阶段${inst.sourceStage})，获得 +${gold} 金币！`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function dismantleBagGear(bagIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    if (bagIdx < 0 || bagIdx >= game.bag.length) return false;
    const inst = game.bag[bagIdx];
    if (isBagSeal(inst)) {
      // Dismantling seals yields ONLY ordinary materials, NEVER transfer tokens!
      const mats = Math.max(1, (inst.star || 1) * 2);
      game.bag.splice(bagIdx, 1);
      changeMaterials(mats, 'dismantle_bag_seal');
      ctx.ports.audio.play('merge', 0.9);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `拆灵印 +${mats} 锻材`, '#8ef4ff');
      ctx.ports.ui.toast(`🔧 已拆解未装备灵印【${inst.name} ${inst.star}★】，获得 +${mats} 普通材料！`);
      ctx.ports.ui.renderAllUI(true);
      return true;
    }
    const mats = getGearDismantleMaterials(inst);
    game.bag.splice(bagIdx, 1);
    changeMaterials(mats, 'dismantle_bag_gear');
    ctx.ports.audio.play('merge', 0.9);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `拆解 +${mats} 锻材`, '#8ef4ff');
    ctx.ports.ui.toast(`🔧 已拆解【${gearLabel(inst)}】(${GEAR_RARITY_LABELS[inst.rarity]}·阶段${inst.sourceStage})，获得 +${mats} 普通材料！`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  // Backward-compatible alias
  function salvageBagGear(bagIdx){
    return sellBagGear(bagIdx);
  }

  // Stage 4 Safe Claim Paths (NEVER auto-sell or overwrite active 5★ Main Seal; overflow goes to game.rewardStash!)
  function grantGearSafely(input, opts = {}){
    const game = ctx.game;
    const inst = isGearInstance(input)
      ? normalizeGearInstance(input)
      : createGearInstance(gearBase(input), { wave: game.wave, origin: opts.origin || 'destiny_gamble', ...opts });
    const cap = getBagCapacity();
    if (game.bag.length < cap) {
      game.bag.push(inst);
      ctx.ports.audio.play('chest', 1.2);
      if (!opts.silent) {
        const stSpec = getSourceStageSpec(inst.sourceStage);
        ctx.ports.ui.toast(`获得构装【${inst.name}】(${GEAR_RARITY_LABELS[inst.rarity]}·${stSpec.label}·${inst.slotsCount}槽)，已安全放入背包！`);
      }
      ctx.ports.ui.renderAllUI(true);
      return { ok: true, storedIn: 'bag', item: inst };
    }
    game.rewardStash = game.rewardStash || [];
    game.rewardStash.push({ itemType: 'gear', item: inst, storedAtWave: game.wave, origin: opts.origin || 'destiny_gamble' });
    ctx.ports.audio.play('chest', 1.1);
    if (!opts.silent) {
      ctx.ports.ui.toast(`背包已满（${cap}/${cap}），构装【${inst.name}】已安全转入暂存箱（可随时在属性面板提取）！`);
    }
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, storedIn: 'stash', item: inst };
  }

  function grantSealSafely(kind, star = 1, opts = {}){
    const game = ctx.game;
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
        ctx.ports.audio.play('merge', 1.1);
        if (!opts.silent) ctx.ports.ui.toast(`✨ 安全领奖：已铭刻主灵印【${spec.name} ${initStar}★】！`);
        ctx.ports.ui.renderAllUI(true);
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
        ctx.ports.audio.play('merge', 1.15);
        if (!opts.silent) ctx.ports.ui.toast(leveled ? `★ 主灵印【${spec.name}】晋升 ${game.seal.star}★！` : `✨ 主灵印【${spec.name}】吸收灵印精华！`);
        ctx.ports.ui.renderAllUI(true);
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
        ctx.ports.audio.play('merge', 1.1);
        if (!opts.silent) ctx.ports.ui.toast(leveled ? `★ 辅灵印【${spec.name}】晋升 ${sub.star}★！` : `✨ 辅灵印【${spec.name}】吸收灵印精华！`);
        ctx.ports.ui.renderAllUI(true);
        return { ok: true, action: 'upgraded_sub', leveled, mainSealPreserved: true, subSeal: sub };
      }

      // Case 4: Off-element seal & empty Sub-Seal slot available -> equip into Sub-Seal slot (Main Seal untouched!)
      if (game.seal.kind !== kind && subIdx < 0 && game.subSeals.length < subCap) {
        const initStar = Math.min(3, normStar);
        const sub = { kind, elem: spec.elem, star: initStar, prog: 0, dmgDealt: 0 };
        game.subSeals.push(sub);
        ctx.ports.audio.play('merge', 1.1);
        if (!opts.silent) ctx.ports.ui.toast(`✨ 辅印共鸣激活！【${SUB_SEAL_RESONANCE[spec.elem].name} ${initStar}★】已入空辅印槽，主灵印完好保留！`);
        ctx.ports.ui.renderAllUI(true);
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
      ctx.ports.audio.play('chest', 1.05);
      if (!opts.silent) ctx.ports.ui.toast(`🛡️ 安全领奖：【${spec.name} ${normStar}★】已收纳至背包，在用主辅灵印（含 5★ 主印）完好保留！`);
      ctx.ports.ui.renderAllUI(true);
      return { ok: true, action: 'stored_bag', storedIn: 'bag', item: sealItem, mainSealPreserved: true };
    }
    game.rewardStash = game.rewardStash || [];
    game.rewardStash.push({ itemType: 'seal', item: sealItem, storedAtWave: game.wave, origin: opts.origin || 'destiny_gamble' });
    ctx.ports.audio.play('chest', 1.05);
    if (!opts.silent) ctx.ports.ui.toast(`🛡️ 背包已满，【${spec.name} ${normStar}★】已安全存入暂存箱，在用主辅灵印完好保留！`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, action: 'stored_stash', storedIn: 'stash', item: sealItem, mainSealPreserved: true };
  }

  function claimRewardStashItem(stashIdx = 0){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
    if (!game?.rewardStash || stashIdx < 0 || stashIdx >= game.rewardStash.length) {
      return { ok: false, reason: 'invalid_stash_index' };
    }
    if (game.bag.length >= getBagCapacity()) {
      ctx.ports.ui.toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解腾出空位！`, true);
      return { ok: false, reason: 'bag_full' };
    }
    const [entry] = game.rewardStash.splice(stashIdx, 1);
    game.bag.push(entry.item);
    ctx.ports.audio.play('chest', 1.0);
    ctx.ports.ui.toast(`📦 已从暂存箱取出【${entry.item.name}】放入背包！`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, item: entry.item, stashLeft: game.rewardStash.length };
  }

  // Stage 2 Normal Material Optimization (Review-approved plan L96):
  // Consumes game.materials to raise enhanceLv (base stats + existing affix numeric tier),
  // STRICTLY preserving rarity, sourceStage, slotsCount, and affix IDs!
  function enhanceGear(target){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
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
      ctx.ports.ui.toast(`【${gearLabel(inst)}】已达最高强化档位！`, true);
      return { ok: false, reason: 'max_level' };
    }
    if ((game.materials || 0) < cost) {
      ctx.ports.ui.toast(`材料强化需要 ⚙️${cost} 普通材料（当前 ${game.materials || 0}）！`, true);
      return { ok: false, reason: 'insufficient_materials', need: cost };
    }
    const goldCost = getGearEnhanceGoldCost?.(inst) ?? 0;
    if (game.gold < goldCost) {
      ctx.ports.ui.toast(`精修还需 ${goldCost} 金币`, true);
      return { ok: false, reason: 'insufficient_gold', need: goldCost };
    }
    if (goldCost > 0) changeGold(-goldCost, 'equipment_refine');
    changeMaterials(-cost, 'enhance_gear');
    inst.enhanceLv = (inst.enhanceLv || 0) + 1;
    // Upgrade numeric tier of existing affixes while strictly preserving affix IDs, slotsCount, rarity, sourceStage!
    for (const a of (inst.affixes || [])) {
      if (a) a.tier = 1 + inst.enhanceLv;
    }
    syncHeroMaxHp();
    recomputeEquipmentSynergies();
    ctx.ports.audio.play('merge', 1.15);
    ctx.ports.vfx.addRing(game.hero.x, game.hero.y, '#8ef4ff', 1.6);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.55, `⚙️强化 ${inst.name} +${inst.enhanceLv}`, '#9ef6ff', true);
    ctx.ports.ui.toast(`⚙️ 消耗 ${cost} 锻材优化【${gearLabel(inst)}】：基础属性与已有词条数值档位升至 T${1 + inst.enhanceLv}（原品质/阶段/槽位/词条不变）！`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, uid: inst.uid, enhanceLv: inst.enhanceLv, cost, materialsLeft: game.materials };
  }

  return {
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
  };
}
