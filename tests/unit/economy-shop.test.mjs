import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { ARTIFACTS, PILLS, SEAL_SPECIALIZATIONS } from '../../src/data/index.js';
import { createEconomyCore, createShopSystem, createShopConfirm, sealTotalPoints } from '../../src/systems/economy/index.js';
import { createEquipmentCore } from '../../src/systems/equipment/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';
import { createUnlockSystem } from '../../src/systems/progression/index.js';

function setup({ seed = 12345, ...overrides } = {}) {
  const rng = mulberry32(seed);
  const draws = [];
  const effects = [];
  const record = name => (...args) => { effects.push([name, ...args]); };
  const game = {
    phase: 'prep', wave: 10, gold: 200, rerollCost: 8, materials: 4, runMetrics: {},
    shop: [], bag: [], shopElemBuyCounts: {}, shopElemBuyStage: 1,
    metaLoadout: { main: null, aux: [] }, metaRunState: {},
    hero: { x: 2, y: 3, hp: 20, maxHp: 100, xpNext: 102, perks: {} },
    pills: {}, seal: null, subSeals: [], stats: { merges: 0 }, shake: 0,
    activeModal: null, shopConfirmDraft: null, inspTarget: null,
    rnd: () => {
      const value = rng();
      draws.push(value);
      return value;
    },
    ...overrides,
  };
  const ctx = createRuntimeContext({ game });
  const meta = createMetaSystem(ctx);
  const equipment = createEquipmentCore(ctx, meta);
  const economy = createEconomyCore(ctx, { meta, equipment });
  const unlock = createUnlockSystem(ctx);
  economy.resetRunMetricsResourceBaseline();
  const shop = createShopSystem(ctx, {
    meta, equipment, economy, unlock,
    hero: { gainHeroXp: record('xp') },
    combat: { gainFrostShield: record('shield') },
  });
  const confirm = createShopConfirm(ctx, { buyShopItem: shop.buyShopItem });
  ctx.bindPorts({
    ui: { toast: record('toast'), renderAllUI: record('render') },
    audio: { play: record('audio') },
    vfx: { addRing: record('ring'), addFloat: record('float') },
    modals: {
      renderShopConfirmModal() {
        effects.push(['open', game.activeModal, { ...game.shopConfirmDraft }]);
      },
      closeModal() {
        effects.push(['close', game.shopConfirmDraft, game.gold]);
        game.activeModal = null;
      },
    },
  });
  const ledger = () => economy.getResourceLedger().map(({ type, delta, reason }) => [type, delta, reason]);
  return { ctx, game, shop, confirm, equipment, economy, effects, draws, ledger };
}

function pill(pillKey, uid = 1) {
  return { uid, itemType: 'pill', pillKey, cost: PILLS[pillKey].cost, bought: false };
}

function sealOffer(kind, star = 1) {
  const cost = ARTIFACTS[kind].cost * ({ 1: 1, 2: 2, 3: 4 })[star];
  return { uid: 1, itemType: 'seal', kind, star, cost, bought: false };
}

function gearOffer(equipment, baseKey, uid) {
  const gear = equipment.createGearInstance(baseKey, { uid: 'gear-' + uid, slotsCount: 1, affixes: [], rarity: 'rare' });
  return { uid, itemType: 'gear', gear, elem: gear.elem, rarity: gear.rarity, cost: 42, bought: false };
}

test('W29 blocks paid refresh, seal transactions and draft opening when the timer expires', () => {
  const { game, shop, confirm, effects, draws, ledger } = setup({
    wave: 29, finalPrep: { active: true, started: true, timer: 0 },
  });
  const row = game.shop = [pill('heal')];
  assert.equal(shop.rollShop(), false);
  assert.equal(shop.buyShopItem(0), false);
  assert.equal(shop.sellSeal(), false);
  assert.equal(shop.sellSubSeal(0), false);
  assert.deepEqual(shop.chooseSealRoute('standard'), { ok: false, reason: 'final_prep_locked' });
  assert.deepEqual(confirm.openShopPurchaseConfirm(0), { ok: false, reason: 'final_prep_locked' });
  assert.equal(game.shop, row);
  assert.equal(game.gold, 200);
  assert.equal(game.rerollCost, 8);
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.activeModal, null);
  assert.deepEqual(effects, []);
  assert.deepEqual(draws, []);
  assert.deepEqual(ledger(), []);
});

test('商路先机 waives only the first refresh of the wave and takes priority over gold_power', () => {
  const { game, shop, ledger, draws, effects } = setup();
  game.metaLoadout.aux.push('aux_shop_first_refresh');
  game.hero.perks.gold_power = 2;
  assert.equal(shop.rollShop(), true);
  assert.equal(game.gold, 200);
  assert.equal(game.rerollCost, 8);
  assert.deepEqual(game.metaRunState, { freeRefreshUsedThisWave: true, freeRefreshUses: 1 });
  assert.equal(draws.length, 18);
  assert.match(effects[0][1], /本波首次商店刷新免费/);

  game.hero.perks.gold_power = 0;
  assert.equal(shop.rollShop(), true);
  assert.equal(game.gold, 192);
  assert.equal(game.rerollCost, 12);
  assert.equal(game.metaRunState.freeRefreshUses, 1);
  assert.deepEqual(ledger(), [['gold', -8, 'shop_reroll']]);
});

test('gold_power Lv.2 waives refresh below 25% and paid refreshes use escalating costs', () => {
  for (const [roll, free] of [[0.249, true], [0.25, false]]) {
    const { game, shop, draws, ledger, effects } = setup();
    game.hero.perks.gold_power = 2;
    const rnd = game.rnd;
    let calls = 0;
    game.rnd = () => calls++ === 0 ? roll : rnd();
    assert.equal(shop.rollShop(), true);
    assert.equal(game.gold, free ? 200 : 192);
    assert.equal(game.rerollCost, free ? 8 : 12);
    assert.equal(ledger().length, free ? 0 : 1);
    assert.equal(effects[0][0], free ? 'toast' : 'audio');
    assert.equal(calls, 19);
    assert.equal(draws.length, 18);
  }

  const { game, shop, draws, ledger } = setup({ gold: 20 });
  game.hero.perks.gold_power = 1;
  assert.equal(shop.rollShop(), true);
  assert.equal(draws.length, 18);
  assert.equal(shop.rollShop(), true);
  const lastRow = game.shop;
  assert.equal(shop.rollShop(), false);
  assert.equal(game.shop, lastRow);
  assert.equal(game.gold, 0);
  assert.equal(game.rerollCost, 16);
  assert.deepEqual(ledger(), [['gold', -8, 'shop_reroll'], ['gold', -12, 'shop_reroll']]);
});

test('fixed seeds preserve all four offers and RNG order for each last-slot item type', () => {
  // Seeded W10 fixtures cover a pill row and two gear rows.
  for (const [seed, expected, drawCount, next] of [
    [12345, [
      ['seal', 817934412, 'holy', 1, 28], ['seal', 766396467, 'frost', 1, 20],
      ['gear', 627660528, 'iron_whetstone', 'common', 26], ['pill', 305045148, 'heal', null, 24],
    ], 18, 0.772419034736231],
    [1, [
      ['seal', 527447039, 'thunder', 2, 59], ['seal', 612838860, 'holy', 1, 28],
      ['gear', 154493134, 'blood_cord', 'common', 26], ['gear', 590382493, 'frost_mirror', 'rare', 42],
    ], 25, 0.7986842156387866],
    [4, [
      ['seal', 81841019, 'holy', 1, 28], ['seal', 973861920, 'fire', 1, 22],
      ['gear', 743346156, 'jade_pendant', 'common', 26], ['gear', 527572519, 'swift_boots', 'common', 26],
    ], 27, 0.34286920516751707],
  ]) {
    const { game, shop, draws, ledger, effects } = setup({ seed });
    assert.equal(shop.rollShop(true), true);
    assert.deepEqual(game.shop.map(({ itemType, uid, kind, gear, pillKey, star, cost }) => [
      itemType, uid, kind ?? gear?.baseKey ?? pillKey, star ?? gear?.rarity ?? null, cost,
    ]), expected);
    assert.ok(game.shop.every(item => item.bought === false));
    assert.equal(draws.length, drawCount);
    assert.equal(game.rnd(), next);
    assert.deepEqual(ledger(), []);
    assert.deepEqual(effects, [['render']]);
  }
});

test('each pill charges once and delivers its XP, shield, health or materials', () => {
  for (const [key, price, hp, materials, reward, extraLedger] of [
    ['xp', 26, 20, 4, [['xp', 36]], []],
    ['heal', 24, 85, 4, [['shield', 25, { maxShield: 90, duration: 6, source: 'pill_heal' }]], []],
    ['temper', 30, 45, 6, [], [['materials', 2, 'pill_temper']]],
  ]) {
    const { game, shop, effects, ledger } = setup({ shop: [pill(key), pill('xp', 2)] });
    assert.equal(shop.buyShopItem(0), true);
    assert.equal(shop.buyShopItem(0), false);
    assert.equal(game.gold, 200 - price);
    assert.deepEqual(game.pills, { [key]: 1 });
    assert.equal(game.hero.hp, hp);
    assert.equal(game.materials, materials);
    assert.deepEqual(effects.filter(([name]) => name === 'xp' || name === 'shield'), reward);
    assert.deepEqual(ledger(), [['gold', -price, 'shop_buy_pill_' + key], ...extraLedger]);
  }
});

test('BUG-03 rejects gear purchases when the bag is full without charging or repricing', () => {
  const { game, shop, equipment, economy, effects, ledger } = setup();
  game.shop = [gearOffer(equipment, 'flame_fan', 1), gearOffer(equipment, 'flame_fan', 2)];
  game.bag = Array.from({ length: economy.getBagCapacity() }, () => ({ itemType: 'seal', kind: 'wind', star: 1 }));
  const bagBefore = game.bag.slice();
  assert.deepEqual(shop.buyShopItem(0), { ok: false, reason: 'bag_full' });
  assert.deepEqual(game.bag, bagBefore);
  assert.deepEqual(game.shop.map(item => [item.bought, item.cost]), [[false, 42], [false, 42]]);
  assert.deepEqual(game.shopElemBuyCounts, {});
  assert.equal(game.gold, 200);
  assert.deepEqual(ledger(), []);
  assert.deepEqual(effects.map(([name]) => name), ['toast', 'render']);
});

test('gear locks the paid price and reprices only unsold gear of the same element', () => {
  const { game, shop, equipment, ledger } = setup();
  const row = game.shop = [
    gearOffer(equipment, 'flame_fan', 1), gearOffer(equipment, 'flame_fan', 2),
    gearOffer(equipment, 'flame_fan', 3), gearOffer(equipment, 'frost_mirror', 4),
  ];
  assert.equal(shop.buyShopItem(0), true);
  assert.deepEqual(row.map(item => item.cost), [42,47,47,42]);
  assert.equal(shop.buyShopItem(1), true);
  assert.deepEqual(row.map(item => item.cost), [42,47,53,42]);
  assert.deepEqual(game.bag.map(item => [item.paidGold, item.origin]), [[42,"shop"],[47,"shop"]]);
  assert.deepEqual(game.shopElemBuyCounts, { fire: 2 });
  assert.equal(game.gold, 111);
  assert.deepEqual(ledger(), [["gold",-42,"shop_buy_gear"],["gold",-47,"shop_buy_gear"]]);
});

test('buying the fourth offer restocks all slots for free', () => {
  const { game, shop, equipment, effects, draws, ledger } = setup();
  const row = game.shop = [pill('heal', 1), pill('heal', 2), pill('heal', 3), gearOffer(equipment, 'flame_fan', 4)];
  for (let i = 0; i < 4; i++) {
    assert.equal(game.shop, row);
    assert.equal(draws.length, 0);
    assert.equal(shop.buyShopItem(i), true);
  }
  assert.ok(row.every(item => item.bought));
  assert.notEqual(game.shop, row);
  assert.equal(game.shop.length, 4);
  assert.ok(game.shop.every(item => !item.bought));
  assert.equal(game.gold, 86);
  assert.equal(game.hero.hp, 100);
  assert.equal(game.bag[0].paidGold, 42);
  assert.equal(game.rerollCost, 8);
  assert.equal(draws.length, 18);
  assert.equal(ledger().length, 4);
  assert.deepEqual(effects.slice(-3), [['render'], ['toast', '商店已买空，已自动免费补货！'], ['render', true]]);
});

test('main seals start at the purchased star, merge up to the unlock cap, and reject further buys', () => {
  const { game, shop, ledger } = setup({
    shop: [sealOffer('fire', 2), sealOffer('fire', 2), sealOffer('fire'), pill('heal', 4)],
  });
  assert.equal(shop.buyShopItem(0), true);
  assert.deepEqual(game.seal, { kind: 'fire', elem: 'fire', star: 2, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 });
  assert.equal(shop.buyShopItem(1), true);
  assert.equal(game.seal.star, 3);
  assert.equal(game.seal.prog, 0);
  assert.equal(game.stats.merges, 1);
  assert.equal(shop.buyShopItem(2), false);
  assert.equal(game.shop[2].bought, false);
  assert.equal(game.gold, 100);
  assert.deepEqual(ledger(), [['gold', -50, 'shop_buy_main_seal'], ['gold', -50, 'shop_upgrade_main_seal']]);
});

test('sub-seals use a free slot, merge up to 3 stars and preserve the main seal', () => {
  const { game, shop, ledger } = setup({
    seal: { kind: 'fire', elem: 'fire', star: 1, prog: 0 },
    shop: [sealOffer('frost', 2), sealOffer('frost', 2), sealOffer('frost'), pill('heal', 4)],
  });
  const main = game.seal;
  assert.equal(shop.buyShopItem(0), true);
  assert.deepEqual(game.subSeals, [{ kind: 'frost', elem: 'frost', star: 2, prog: 0, dmgDealt: 0 }]);
  assert.equal(shop.buyShopItem(1), true);
  assert.equal(game.subSeals[0].star, 3);
  assert.equal(game.subSeals[0].prog, 0);
  assert.equal(game.stats.merges, 1);
  assert.equal(shop.buyShopItem(2), false);
  assert.equal(game.shop[2].bought, false);
  assert.equal(game.seal, main);
  assert.equal(game.gold, 108);
  assert.deepEqual(ledger(), [['gold', -46, 'shop_buy_sub_seal'], ['gold', -46, 'shop_upgrade_sub_seal']]);
});

test('full sub-seal slots cause main seal replacement with a discounted fusion refund', () => {
  const { game, shop, ledger } = setup({
    seal: { kind: 'fire', elem: 'fire', star: 2, prog: 1, route: 'mastery' },
    subSeals: [{ kind: 'frost', elem: 'frost', star: 1, prog: 0 }],
    shop: [sealOffer('wind'), pill('heal', 2)],
  });
  const subs = game.subSeals.slice();
  assert.equal(shop.buyShopItem(0), true);
  assert.deepEqual(game.seal, { kind: 'wind', elem: 'wind', star: 1, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 });
  assert.deepEqual(game.subSeals, subs);
  assert.equal(game.gold, 219);
  assert.deepEqual(ledger(), [["gold",-22,"shop_switch_main_seal"],["gold",41,"switch_main_seal_refund"]]);
});

test('selling seals refunds the configured fraction of fusion points and clears the empty main inspection target', () => {
  const { game, shop, ledger } = setup({
    seal: { kind: 'fire', star: 3, prog: 1 }, subSeals: [{ kind: 'frost', star: 2 }],
    inspTarget: { kind: 'seal' },
  });
  assert.equal(sealTotalPoints(null), 0);
  assert.equal(shop.sealTotalPoints(game.seal), 5);
  assert.equal(sealTotalPoints(game.subSeals[0]), 2);
  assert.equal(shop.sellSubSeal(0), true);
  assert.equal(shop.sellSubSeal(0), false);
  assert.deepEqual(game.subSeals, []);
  assert.equal(shop.sellSeal(), true);
  assert.equal(shop.sellSeal(), false);
  assert.equal(game.seal, null);
  assert.equal(game.inspTarget, null);
  assert.equal(game.gold, 294);
  assert.deepEqual(ledger(), [["gold",25,"sell_sub_seal"],["gold",69,"sell_main_seal"]]);
});

test('seal specialization validates state and charges only for mastery', () => {
  const { game, shop, ledger } = setup({ gold: 34 });
  const seal = { kind: 'fire', elem: 'fire', star: 2, prog: 0, route: null };
  assert.deepEqual(shop.chooseSealRoute('standard'), { ok: false, reason: 'no_seal' });
  game.seal = seal;
  assert.deepEqual(shop.chooseSealRoute('standard'), { ok: false, reason: 'star_too_low' });
  seal.star = 3;
  assert.deepEqual(shop.chooseSealRoute('unknown'), { ok: false, reason: 'invalid_route' });
  assert.deepEqual(shop.chooseSealRoute('mastery'), { ok: false, reason: 'insufficient_gold', need: 68 });
  assert.equal(seal.route, null);
  assert.deepEqual(shop.chooseSealRoute('standard'), {
    ok: true, route: 'standard', cost: 0, spec: SEAL_SPECIALIZATIONS.fire.standard,
  });
  assert.equal(seal.route, 'standard');
  assert.deepEqual(shop.chooseSealRoute('mastery'), { ok: false, reason: 'already_chosen' });
  assert.equal(game.gold, 34);
  assert.deepEqual(ledger(), []);

  const paid = setup({ gold: 68, seal: { ...seal, route: null } });
  assert.deepEqual(paid.shop.chooseSealRoute('mastery'), {
    ok: true, route: 'mastery', cost: 68, spec: SEAL_SPECIALIZATIONS.fire.mastery,
  });
  assert.equal(paid.game.seal.route, 'mastery');
  assert.equal(paid.game.gold, 0);
  assert.deepEqual(paid.ledger(), [['gold', -68, 'seal_route']]);
});

test('BUG-08 drafts can only open for an unsold item during prep', () => {
  const { ctx, game, confirm, effects } = setup({ phase: 'battle', shop: [pill('xp')] });
  assert.deepEqual(confirm.openShopPurchaseConfirm(0), { ok: false, reason: 'not_in_prep' });
  game.phase = 'prep';
  assert.deepEqual(confirm.openShopPurchaseConfirm(1), { ok: false, reason: 'invalid_shop_item' });
  game.shop[0].bought = true;
  assert.deepEqual(confirm.openShopPurchaseConfirm(0), { ok: false, reason: 'invalid_shop_item' });
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.activeModal, null);
  ctx.setGame(null);
  assert.deepEqual(confirm.openShopPurchaseConfirm(0), { ok: false, reason: 'not_in_prep' });
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'no_game' });
  assert.deepEqual(effects, []);
});

test('BUG-08 opening and cancelling a W29 draft only affect the modal', () => {
  const { game, confirm, effects, ledger, draws } = setup({
    wave: 29, shop: [pill('xp')], finalPrep: { active: true, started: true, timer: 8 },
  });
  const draft = { shopIdx: 0, itemUid: 1, itemType: 'pill', cost: 26, label: '修为丹' };
  assert.deepEqual(confirm.openShopPurchaseConfirm(0), { ok: true, draft });
  assert.deepEqual(game.shopConfirmDraft, draft);
  assert.deepEqual(confirm.cancelShopPurchaseConfirm(), { ok: true, cancelled: true });
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.activeModal, null);
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'no_shop_draft' });
  assert.deepEqual(effects, [['open', { type: 'shop_confirm', shopIdx: 0, itemUid: 1 }, draft], ['close', null, 200]]);
  assert.equal(game.gold, 200);
  assert.equal(game.shop[0].bought, false);
  assert.deepEqual(game.pills, {});
  assert.deepEqual(ledger(), []);
  assert.deepEqual(draws, []);
});

test('BUG-08 stale and expired drafts cannot deliver purchases', () => {
  for (const stale of [undefined, { ...pill('xp'), bought: true }, pill('xp', 9)]) {
    const { game, confirm, effects, ledger } = setup({ shop: [pill('xp')] });
    assert.equal(confirm.openShopPurchaseConfirm(0).ok, true);
    game.shop[0] = stale;
    assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'stale_shop_draft' });
    assert.equal(game.shopConfirmDraft, null);
    assert.equal(game.activeModal, null);
    assert.deepEqual(effects.map(([name]) => name), ['open', 'close']);
    assert.deepEqual(ledger(), []);
  }

  const { game, confirm, effects, ledger } = setup({
    wave: 29, shop: [pill('xp')], finalPrep: { active: true, started: true, timer: 1 },
  });
  assert.equal(confirm.openShopPurchaseConfirm(0).ok, true);
  game.finalPrep.timer = 0;
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'final_prep_locked' });
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.shop[0].bought, false);
  assert.deepEqual(effects.map(([name]) => name), ['open']);
  assert.deepEqual(ledger(), []);
});

test('BUG-08 confirmation closes the draft before charging and delivering exactly once', () => {
  const { game, confirm, effects, ledger } = setup({
    wave: 29, shop: [pill('temper'), pill('xp', 2)], finalPrep: { active: true, started: true, timer: 8 },
  });
  assert.equal(confirm.openShopPurchaseConfirm(0).ok, true);
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: true, reason: null, goldLeft: 170 });
  assert.deepEqual(effects[1], ['close', null, 200]);
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.activeModal, null);
  assert.equal(game.shop[0].bought, true);
  assert.deepEqual(game.pills, { temper: 1 });
  assert.equal(game.materials, 6);
  assert.equal(game.hero.hp, 45);
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'no_shop_draft' });
  assert.deepEqual(ledger(), [['gold', -30, 'shop_buy_pill_temper'], ['materials', 2, 'pill_temper']]);
});

test('confirmation reports a full bag after closing the draft and leaves the offer available', () => {
  const { game, confirm, equipment, economy, effects, ledger } = setup();
  game.shop = [gearOffer(equipment, 'flame_fan', 1)];
  game.bag = Array.from({ length: economy.getBagCapacity() }, () => ({ itemType: 'seal', kind: 'wind', star: 1 }));
  assert.equal(confirm.openShopPurchaseConfirm(0).ok, true);
  assert.deepEqual(confirm.confirmShopPurchase(), { ok: false, reason: 'bag_full', goldLeft: 200 });
  assert.deepEqual(effects.map(([name]) => name), ['open', 'close', 'toast', 'render']);
  assert.equal(game.activeModal, null);
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.shop[0].bought, false);
  assert.deepEqual(ledger(), []);
});
