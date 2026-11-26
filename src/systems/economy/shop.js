import BALANCE from '../../data/balance.js';
import {
  ARTIFACTS,
  ARTIFACT_KEYS,
  ELEMENTS,
  GEAR_RARITY_COLORS,
  GEAR_RARITY_LABELS,
  PILLS,
  PILL_KEYS,
  SEAL_FUSE_NEED,
  SEAL_SPECIALIZATIONS,
  SEAL_TIER_NAMES,
  SUB_SEAL_RESONANCE,
  UNLOCK_NODES,
} from '../../data/index.js';
import { getBuildRoute, getSourceStageForWave, perkLv } from '../../core/state-queries.js';

export function sealTotalPoints(seal){
  if (!seal) return 0;
  let pts = 1 + (seal.prog || 0);
  for (let s = 1; s < seal.star; s++) pts += SEAL_FUSE_NEED[s];
  return pts;
}

export function createShopSystem(ctx, { meta, equipment, economy, unlock, hero, combat }) {
  const { hasMetaAux, pickWeightedByMainLegacy } = meta;
  const { createGearInstance, normalizeGearInstance } = equipment;
  const {
    changeGold, changeMaterials, getEndgameRefinementConfig,
    pickShopGearBaseKey, calcShopGearPrice, hasBagSpace, getBagCapacity, tryStoreGearInBag,
  } = economy;
  const { getShopTier, getActiveUnlockNode, getSealStarCap, getSubSealSlotCap } = unlock;
  const { gainHeroXp } = hero;
  const { gainFrostShield } = combat;

  function rollShop(free = false){
    const game = ctx.game;
    if (!free && ctx.isFinalPrepActionLocked()) return false;
    if (!free) {
      const canMetaFreeRefresh = hasMetaAux('aux_shop_first_refresh') && game.metaRunState && !game.metaRunState.freeRefreshUsedThisWave;
      if (canMetaFreeRefresh) {
        game.metaRunState.freeRefreshUsedThisWave = true;
        game.metaRunState.freeRefreshUses = (game.metaRunState.freeRefreshUses || 0) + 1;
        ctx.ports.ui.toast('🏷️ 辅助传承【商路先机】触发：本波首次商店刷新免费！');
      } else {
        const freeProc = perkLv(game, 'gold_power') >= 2 && game.rnd() < 0.25;
        if (!freeProc) {
          if (game.gold < game.rerollCost) { ctx.ports.ui.toast(`需要 ${game.rerollCost} 金币才能刷新商店！`, true); return false; }
          changeGold(-game.rerollCost, 'shop_reroll');
          game.rerollCost += BALANCE.economy.rerollIncrement;
          ctx.ports.audio.play('coin', 0.9);
        } else {
          ctx.ports.ui.toast('💰 点石成金精通触发：本次刷新免费！');
        }
      }
    }
    const tier = getShopTier();
    const isHuashen = getActiveUnlockNode().idx >= 4;
    const refCfg = getEndgameRefinementConfig();
    const isEndgameRef = (game.wave || 1) >= (refCfg.startWave || 21);
    game.shop = [];

    const pushSealOffer = () => {
      const kind = pickWeightedByMainLegacy(ARTIFACT_KEYS, k => ARTIFACTS[k]?.elem || null, game.rnd, getBuildRoute(game)?.elem) || ARTIFACT_KEYS[0];
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
    ctx.ports.ui.renderAllUI();
    return true;
  }

  function checkShopAutoRestock(){
    const game = ctx.game;
    if (game.shop.length > 0 && game.shop.every(s => s.bought)) {
      rollShop(true);
      ctx.ports.ui.toast('商店已买空，已自动免费补货！');
    }
  }

  function chooseSealRoute(routeKey){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
    if (!game?.seal) return { ok: false, reason: 'no_seal' };
    const s = game.seal;
    if (s.star < 3) { ctx.ports.ui.toast('主灵印达到 3★ 后才可选择专精路线！', true); return { ok: false, reason: 'star_too_low' }; }
    if (s.route) { ctx.ports.ui.toast(`主灵印已锁定专精路线【${SEAL_SPECIALIZATIONS[s.elem]?.[s.route]?.name || s.route}】！`, true); return { ok: false, reason: 'already_chosen' }; }
    const spec = SEAL_SPECIALIZATIONS[s.elem]?.[routeKey];
    if (!spec) return { ok: false, reason: 'invalid_route' };
    if (spec.cost > 0 && game.gold < spec.cost) {
      ctx.ports.ui.toast(`选择【${spec.name}】需要 ${spec.cost} 金币！`, true);
      return { ok: false, reason: 'insufficient_gold', need: spec.cost };
    }
    if (spec.cost > 0) changeGold(-spec.cost, 'seal_route');
    s.route = routeKey;
    ctx.ports.audio.play('merge', 1.2);
    ctx.ports.vfx.addRing(game.hero.x, game.hero.y, ELEMENTS[s.elem].color, 2.4);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.65, `✨ 灵印专精·${spec.name}`, '#ffe878', true);
    ctx.ports.ui.toast(`已选定主灵印 3★ 专精【${spec.name}】${spec.cost > 0 ? `（消耗 ${spec.cost} 金）` : '（免费）'}：${spec.desc}`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, route: routeKey, cost: spec.cost, spec };
  }

  function buyShopItem(shopIdx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    const item = game.shop[shopIdx];
    if (!item || item.bought) return false;
    if (game.gold < item.cost) { ctx.ports.ui.toast(`需要 ${item.cost} 金币！`, true); return false; }

    // 1. Pill purchase (v0.60 clean pills: xp, heal, temper)
    if (item.itemType === 'pill') {
      const pSpec = PILLS[item.pillKey];
      if (!pSpec) return false;
      changeGold(-item.cost, `shop_buy_pill_${item.pillKey}`);
      item.bought = true;
      game.pills[item.pillKey] = (game.pills[item.pillKey] || 0) + 1;
      ctx.ports.audio.play('chest', 1.1);
      if (item.pillKey === 'xp') {
        const gain = Math.round(game.hero.xpNext * 0.35);
        gainHeroXp(gain);
        ctx.ports.ui.toast(`服下【修为丹】！修为 +${gain}！`);
      } else if (item.pillKey === 'heal') {
        game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 65);
        gainFrostShield(25, { maxShield: 90, duration: 6.0, source: 'pill_heal' });
        ctx.ports.ui.toast('服下【回春丹】！恢复 65 生命并凝结 25 护盾！');
      } else if (item.pillKey === 'temper') {
        changeMaterials(2, 'pill_temper');
        game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + 25);
        ctx.ports.ui.toast(`服下【淬灵丹】！普通材料 +2（当前 ${game.materials}）并恢复 25 生命！`);
      }
      checkShopAutoRestock();
      ctx.ports.ui.renderAllUI(true);
      return true;
    }

    // 2. Stage 2 Independent Gear purchase (with stage + same-element escalating price & paidGold lock)
    if (item.itemType === 'gear' && item.gear) {
      if (!hasBagSpace(1)) {
        ctx.ports.ui.toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解背包装备后再购买！`, true);
        ctx.ports.ui.renderAllUI(true);
        return { ok: false, reason: 'bag_full' };
      }
      const boughtInst = normalizeGearInstance({ ...item.gear, paidGold: item.cost, origin: 'shop' });
      const stored = tryStoreGearInBag(boughtInst);
      if (!stored.ok) {
        ctx.ports.ui.toast(`背包已满（${getBagCapacity()}/${getBagCapacity()}），请先出售或拆解背包装备后再购买！`, true);
        ctx.ports.ui.renderAllUI(true);
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
      ctx.ports.audio.play('chest', 1.15);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.55, `购入 ${boughtInst.icon}${boughtInst.name} [${boughtInst.slotsCount}槽]`, GEAR_RARITY_COLORS[boughtInst.rarity] || '#ffe27a', true);
      ctx.ports.ui.toast(`购入【${boughtInst.name}】(${GEAR_RARITY_LABELS[boughtInst.rarity]}·${boughtInst.slotsCount}槽) 花费 ${item.cost} 金，已放入背包！`);
      checkShopAutoRestock();
      ctx.ports.ui.renderAllUI(true);
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
      ctx.ports.vfx.addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 1.8);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `附魔 ${spec.name} ${initStar}★`, ELEMENTS[spec.elem].color, true);
      ctx.ports.audio.play('merge', 1.05);
      ctx.ports.ui.toast(`已铭刻主灵印【${spec.name} ${initStar}★ ${SEAL_TIER_NAMES[initStar]}】${initStar >= 3 ? ' · 点击主印可选 3★ 专精路线！' : '！'}`);
    } else if (game.seal.kind === item.kind) {
      if (game.seal.star >= cap) {
        const curNode = getActiveUnlockNode();
        const nextNode = UNLOCK_NODES[curNode.idx + 1];
        ctx.ports.ui.toast(game.seal.star >= 5 ? '【主灵印】已达 5★ 仙印巅峰！' : `当前阶段主印上限 ${cap}★，达成【${nextNode?.name || '下一阶段'}】节点后解锁 ${cap + 1}★！`, true);
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
        ctx.ports.vfx.addRing(game.hero.x, game.hero.y, '#ffe878', 2.6);
        ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.6, `★ ${spec.name} 晋升 ${game.seal.star}★ ${SEAL_TIER_NAMES[game.seal.star]}！`, '#ffe878', true);
        ctx.ports.audio.play('merge');
        const routeHint = (game.seal.star >= 3 && !game.seal.route) ? ' · 已解锁 3★ 专精二选一（点击灵印阵盘选择）！' : '';
        const synMsg = game.seal.star === 3 ? ' · 已激活 2 层元素羁绊' : game.seal.star === 5 ? ' · 已激活 4 层终极羁绊' : '';
        ctx.ports.ui.toast(`主印升阶！【${spec.name}】晋升 ${game.seal.star}★ ${SEAL_TIER_NAMES[game.seal.star]}${synMsg}${routeHint}`);
      } else {
        ctx.ports.audio.play('coin', 1.2);
        ctx.ports.ui.toast(`吸收灵印精华！${spec.name} ${game.seal.star}★ 升星进度 ${game.seal.prog}/${SEAL_FUSE_NEED[game.seal.star]}`);
      }
    } else if (subIdx >= 0) {
      const sub = game.subSeals[subIdx];
      if (sub.star >= 3) {
        ctx.ports.ui.toast(`辅印【${spec.name}】已达 3★ 阵眼巅峰！`, true);
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
        ctx.ports.audio.play('merge', 1.15);
        ctx.ports.vfx.addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.1);
        ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.6, `★ 辅印 ${spec.name} 升至 ${sub.star}★！`, ELEMENTS[spec.elem].color, true);
        ctx.ports.ui.toast(`辅印升阶！【${SUB_SEAL_RESONANCE[spec.elem].name}】晋升 ${sub.star}★${sub.star === 3 ? '（额外+2羁绊权重）' : ''}！`);
      } else {
        ctx.ports.audio.play('coin', 1.15);
        ctx.ports.ui.toast(`强化辅印【${spec.name}】进度 ${sub.prog}/${SEAL_FUSE_NEED[sub.star]}`);
      }
    } else if (game.subSeals.length < subCap) {
      changeGold(-item.cost, 'shop_buy_sub_seal');
      item.bought = true;
      const initStar = Math.min(3, item.star);
      game.subSeals.push({ kind: item.kind, elem: spec.elem, star: initStar, prog: 0, dmgDealt: 0 });
      const res = SUB_SEAL_RESONANCE[spec.elem];
      ctx.ports.vfx.addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.0);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.55, `✨ 辅印共鸣 · ${res.name} ${initStar}★`, ELEMENTS[spec.elem].color, true);
      ctx.ports.audio.play('merge', 1.1);
      ctx.ports.ui.toast(`✨ 辅印共鸣激活！【${res.name} ${initStar}★】${res.desc(initStar)}`);
    } else {
      // Switch Main Seal: refund a fraction of its base fusion value and equip the new element.
      const oldSpec = ARTIFACTS[game.seal.kind];
      const refund = Math.round(oldSpec.cost * sealTotalPoints(game.seal) * BALANCE.economy.sealRefundRatio);
      changeGold(-item.cost, 'shop_switch_main_seal');
      if (refund > 0) changeGold(refund, 'switch_main_seal_refund');
      item.bought = true;
      const initStar = Math.min(cap, item.star);
      game.seal = { kind: item.kind, elem: spec.elem, star: initStar, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 };
      ctx.ports.vfx.addRing(game.hero.x, game.hero.y, ELEMENTS[spec.elem].color, 2.0);
      ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `转修 ${spec.name} ${initStar}★ (+${refund}金)`, ELEMENTS[spec.elem].color, true);
      ctx.ports.audio.play('merge', 1.0);
      ctx.ports.ui.toast(`转修换主印！【${oldSpec.name}】折价返还 +${refund} 金，已切换为【${spec.name} ${initStar}★】！`);
    }

    checkShopAutoRestock();
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function sellSeal(){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    if (!game.seal) return false;
    const oldSpec = ARTIFACTS[game.seal.kind];
    const refund = Math.round(oldSpec.cost * sealTotalPoints(game.seal) * BALANCE.economy.sealRefundRatio);
    changeGold(refund, 'sell_main_seal');
    game.seal = null;
    if (!game.subSeals.length) game.inspTarget = null;
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `+${refund} 金`, '#ffe27a');
    ctx.ports.audio.play('coin');
    ctx.ports.ui.toast(`已卸售主灵印【${oldSpec.name}】返还 ${refund} 金币。`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function sellSubSeal(idx){
    const game = ctx.game;
    if (ctx.isFinalPrepActionLocked()) return false;
    const sub = game.subSeals[idx];
    if (!sub) return false;
    const spec = ARTIFACTS[sub.kind];
    const refund = Math.round(spec.cost * sealTotalPoints(sub) * BALANCE.economy.sealRefundRatio);
    changeGold(refund, 'sell_sub_seal');
    game.subSeals.splice(idx, 1);
    ctx.ports.vfx.addFloat(game.hero.x, game.hero.y - 0.5, `卸辅印 +${refund} 金`, '#ffe27a');
    ctx.ports.audio.play('coin');
    ctx.ports.ui.toast(`已卸售辅灵印【${spec.name}】返还 ${refund} 金币，空出 1 个辅印槽。`);
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  return { rollShop, checkShopAutoRestock, sealTotalPoints, chooseSealRoute, buyShopItem, sellSeal, sellSubSeal };
}
