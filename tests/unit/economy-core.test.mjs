import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import BALANCE from '../../src/data/balance.js';
import {
  RESOURCE_LEDGER_MAX,
  createEconomyCore,
  getBagCapacity,
  getEndgameRefinementConfig,
  getGearEnhanceCost,
  getGearSellGold,
  getWaveClearMaterialBonus,
  isBagSeal,
} from '../../src/systems/economy/index.js';
import { createEquipmentCore } from '../../src/systems/equipment/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';

function setup(game = null) {
  const ctx = createRuntimeContext({ game });
  const meta = createMetaSystem(ctx);
  const equipment = createEquipmentCore(ctx, meta);
  return { ctx, economy: createEconomyCore(ctx, { meta, equipment }) };
}

test('same-frame resource flows account for income and spending separately and clamp overdrafts', () => {
  const game = { wave: 7, gold: 10, materials: 5, transferTokens: 2, runMetrics: {} };
  const { economy } = setup(game);
  economy.resetRunMetricsResourceBaseline();

  for (const [type, change, initial, amount, defaultReason] of [
    ['gold', economy.changeGold, 10, 8, 'gold_change'],
    ['materials', economy.changeMaterials, 5, 3, 'materials_change'],
    ['transferTokens', economy.changeTransferTokens, 2, 1, 'transfer_tokens_change'],
  ]) {
    assert.equal(change(amount), amount);
    assert.equal(change(-amount, 'purchase'), -amount);
    assert.equal(game[type], initial);
    assert.equal(game.runMetrics[`${type}Earned`], initial + amount);
    assert.equal(game.runMetrics[`${type}Spent`], amount);
    assert.deepEqual(economy.getResourceLedger(2).map(({ seq, ...entry }) => entry), [
      { wave: 7, type, delta: amount, reason: defaultReason, balanceAfter: initial + amount },
      { wave: 7, type, delta: -amount, reason: 'purchase', balanceAfter: initial },
    ]);

    assert.equal(change(-100, 'overdraft'), -initial);
    assert.equal(change(-100), 0);
    assert.equal(game[type], 0);
    assert.equal(game.runMetrics[`${type}Spent`], initial + amount);
  }
  assert.equal(economy.getResourceLedger().length, 9);
  assert.equal(economy.recordResourceFlow('unknown', 5), 0);
});

test('resource ledger keeps the latest 500 entries and gives callers shallow copies', () => {
  const { ctx, economy } = setup();
  assert.equal(economy.changeGold(1), 0);
  assert.deepEqual(economy.getResourceLedger(), []);
  ctx.setGame({ wave: 2, gold: 0, runMetrics: {} });
  economy.resetRunMetricsResourceBaseline();
  for (let i = 0; i < 502; i++) economy.recordResourceFlow('gold', 1);

  assert.equal(RESOURCE_LEDGER_MAX, 500);
  const all = economy.getResourceLedger();
  assert.equal(all.length, 500);
  assert.equal(all[0].seq, 3);
  assert.equal(all.at(-1).seq, 502);
  const tail = economy.getResourceLedger(2);
  assert.deepEqual(tail, [
    { seq: 501, wave: 2, type: 'gold', delta: 1, reason: 'unknown', balanceAfter: 501 },
    { seq: 502, wave: 2, type: 'gold', delta: 1, reason: 'unknown', balanceAfter: 502 },
  ]);
  tail[0].delta = -1;
  all.pop();
  assert.equal(economy.getResourceLedger().length, 500);
  assert.equal(economy.getResourceLedger(2)[0].delta, 1);
});

test('resource sync only updates balance snapshots and reset restarts the accounting baseline', () => {
  const game = { gold: 4, materials: 3, transferTokens: 2, runMetrics: {} };
  const { economy } = setup(game);
  economy.resetRunMetricsResourceBaseline();
  economy.changeGold(7);
  economy.changeGold(-5);
  economy.changeMaterials(-2);
  economy.changeTransferTokens(4);
  const ledger = economy.getResourceLedger();

  Object.assign(game, { gold: 30, materials: 12, transferTokens: 7 });
  economy.syncRunResourceAccounting();
  assert.deepEqual(game.runMetrics, {
    goldEarned: 11, goldSpent: 5,
    materialsEarned: 3, materialsSpent: 2,
    transferTokensEarned: 6, transferTokensSpent: 0,
    _lastGold: 30, _lastMaterials: 12, _lastTokens: 7, ledger, _ledgerSeq: 5,
  });

  economy.resetRunMetricsResourceBaseline();
  assert.deepEqual(game.runMetrics, {
    goldEarned: 30, goldSpent: 0,
    materialsEarned: 12, materialsSpent: 0,
    transferTokensEarned: 7, transferTokensSpent: 0,
    _lastGold: 30, _lastMaterials: 12, _lastTokens: 7, ledger: [], _ledgerSeq: 1,
  });
  economy.changeGold(1);
  assert.equal(economy.getResourceLedger(1)[0].seq, 1);
});

test('shop prices rise per element, respect the cap and keep counts across stages by default', () => {
  const game = { wave: 10, shopElemBuyStage: 1, shopElemBuyCounts: { fire: 0, frost: 0 } };
  const { economy } = setup(game);
  for (const [count, price] of [[0, 42], [1, 50], [2, 57], [100, 104]]) {
    game.shopElemBuyCounts.fire = count;
    assert.equal(economy.getShopElemBuyCount('fire'), count);
    assert.equal(economy.calcShopGearPrice('rare', 'fire'), price);
    assert.equal(economy.calcShopGearPrice('rare', 'frost'), 42);
  }
  game.shopElemBuyCounts.fire = 2;
  for (const [wave, price] of [[11, 74], [20, 74], [21, 94]]) {
    game.wave = wave;
    assert.equal(economy.calcShopGearPrice('rare', 'fire'), price);
    assert.equal(economy.getShopElemBuyCount('fire'), 2);
    assert.equal(game.shopElemBuyStage, 1);
  }
});

test('the stage reset option clears all element counts at W11 and W21', () => {
  const pricing = BALANCE.equipment.shopPricing;
  const original = pricing.sameElemResetByStage;
  pricing.sameElemResetByStage = true;
  try {
    const game = { wave: 10, shopElemBuyStage: 1, shopElemBuyCounts: { fire: 2, frost: 3 } };
    const { economy } = setup(game);
    for (const [lastWave, nextStage, before, after] of [[10, 2, 57, 55], [20, 3, 74, 69]]) {
      game.wave = lastWave;
      Object.assign(game.shopElemBuyCounts, { fire: 2, frost: 3 });
      assert.equal(economy.calcShopGearPrice('rare', 'fire'), before);
      game.wave++;
      assert.equal(economy.calcShopGearPrice('rare', 'fire'), after);
      assert.equal(game.shopElemBuyStage, nextStage);
      assert.deepEqual(game.shopElemBuyCounts, { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 });
    }
  } finally {
    pricing.sameElemResetByStage = original;
  }
});

test('shop rarity bands produce fixed-seed keys and use exactly two run RNG draws', () => {
  const game = { metaLoadout: { main: null, aux: [] } };
  const { economy } = setup(game);
  const seeds = [7, 42, 12345, 123456];
  const bands = [
    [[1, 5], ['flame_fan', 'wood_talisman', 'jade_pendant', 'iron_whetstone']],
    [[6, 10], ['split_bow', 'wood_talisman', 'jade_pendant', 'blood_bead']],
    [[11, 20], ['titan_crown', 'frost_mirror', 'jade_pendant', 'eagle_scope']],
    [[21, 30], ['titan_crown', 'frost_orb', 'thunder_wood', 'eagle_scope']],
  ];
  for (const [waves, keys] of bands) {
    for (const wave of waves) {
      for (const [i, seed] of seeds.entries()) {
        const rng = mulberry32(seed);
        let calls = 0;
        game.wave = wave;
        game.rnd = () => { calls++; return rng(); };
        assert.equal(economy.pickShopGearBaseKey(), keys[i], `wave ${wave}, seed ${seed}`);
        assert.equal(calls, 2);
      }
    }
  }
});

test('shop key selection applies the main legacy weight to the active pool using the second roll', () => {
  const game = {
    wave: 21,
    metaLoadout: { main: null, aux: [] },
    metaRunState: { activeGearKeys: ['thunder_wood', 'flame_fan'] },
    rnd: () => assert.fail('the explicit RNG should be used'),
  };
  const { economy } = setup(game);
  for (const [main, expected] of [[null, 'thunder_wood'], ['main_flame', 'flame_fan']]) {
    game.metaLoadout.main = main;
    const rng = mulberry32(56);
    let calls = 0;
    assert.equal(economy.pickShopGearBaseKey(5, () => { calls++; return rng(); }), expected);
    assert.equal(calls, 2);
  }
  // The W21 legend roll has no match in this pool, so it uses the full active pool.
  assert.equal(economy.pickShopGearBaseKey(21, mulberry32(7)), 'thunder_wood');
});

test('gear sell value uses rarity and source stage, and shop prices cap resale below cost', () => {
  const game = { wave: 1 };
  const { economy } = setup(game);
  const gear = { rarity: 'legend', sourceStage: 3, slotsCount: 1 };
  assert.equal(getGearSellGold(null), 0);
  assert.equal(getGearSellGold('flame_fan#2'), 16);
  assert.equal(economy.getGearSellGold(gear), 78);
  game.wave = 29;
  assert.equal(economy.getGearSellGold({ ...gear, slotsCount: 3 }), 78);
  assert.equal(getGearSellGold({ ...gear, sourceStage: 2 }), 59);
  assert.equal(getGearSellGold({ ...gear, paidGold: 26 }), 18);
  for (const rarity of ['common', 'rare', 'epic', 'legend']) {
    for (const sourceStage of [1, 2, 3]) {
      const paidGold = economy.calcShopGearPrice(rarity, 'fire', [1, 11, 21][sourceStage - 1]);
      assert.ok(getGearSellGold({ rarity, sourceStage, paidGold }) < paidGold);
    }
  }
});

test('salvage craft adds one dismantle material only to epic and legend gear', () => {
  const game = { metaLoadout: { main: null, aux: [] } };
  const { economy } = setup(game);
  assert.equal(economy.getGearDismantleMaterials(null), 0);
  for (const [aux, amounts] of [
    [[], [2, 3, 5, 8]],
    [['aux_salvage_craft'], [2, 3, 6, 9]],
  ]) {
    game.metaLoadout.aux = aux;
    for (const [i, rarity] of ['common', 'rare', 'epic', 'legend'].entries()) {
      assert.equal(economy.getGearDismantleMaterials({ rarity, sourceStage: 2 }), amounts[i]);
    }
  }
});

test('gear enhancement costs materials by level and stops at max level or for seals', () => {
  assert.equal(getGearEnhanceCost(null), null);
  assert.equal(getGearEnhanceCost('flame_fan'), null);
  assert.equal(getGearEnhanceCost({ itemType: 'seal' }), null);
  for (const [enhanceLv, cost] of [2, 3, 5, 7, 10, 14, null].entries()) {
    assert.equal(getGearEnhanceCost({ enhanceLv }), cost);
  }
});

test('bag capacity rejects overflow, preserves seals and normalizes gear', () => {
  const { ctx, economy } = setup();
  assert.equal(economy.hasBagSpace(), false);
  assert.equal(getBagCapacity(), 12);
  const game = { wave: 21, bag: Array(10).fill({ itemType: 'seal' }) };
  ctx.setGame(game);

  const seal = { itemType: 'seal', kind: 'fire', star: 2 };
  assert.equal(isBagSeal(seal), true);
  assert.equal(isBagSeal('flame_fan'), false);
  const storedSeal = economy.tryStoreGearInBag(seal);
  assert.deepEqual(storedSeal, { ok: true, storedIn: 'bag', item: seal });
  assert.equal(storedSeal.item, seal);
  assert.equal(game.bag[10], seal);
  assert.equal(economy.hasBagSpace(), true);
  assert.equal(economy.hasBagSpace(2), false);

  const input = { uid: 'g1', baseKey: 'flame_fan', enhanceLv: 99, slotsCount: 0 };
  const storedGear = economy.tryStoreGearInBag(input);
  assert.equal(storedGear.ok, true);
  assert.equal(storedGear.storedIn, 'bag');
  assert.equal(game.bag[11], storedGear.item);
  assert.notEqual(storedGear.item, input);
  const { uid, baseKey, rarity, sourceStage, enhanceLv, slotsCount, affixes } = storedGear.item;
  assert.deepEqual({ uid, baseKey, rarity, sourceStage, enhanceLv, slotsCount, affixes }, {
    uid: 'g1', baseKey: 'flame_fan', rarity: 'rare', sourceStage: 3, enhanceLv: 6, slotsCount: 1, affixes: [],
  });
  assert.equal(economy.hasBagSpace(), false);
  assert.deepEqual(economy.tryStoreGearInBag(seal), { ok: false, reason: 'bag_full', capacity: 12 });
  assert.equal(game.bag.length, 12);
});

test('refinement drops cover enemy types and wave band boundaries', () => {
  const game = {};
  const { economy } = setup(game);
  const enemies = [{}, { elite: true }, { isShrineBoss: true, boss: true, elite: true }, { boss: true, elite: true }];
  for (const [waves, expected] of [
    [[1, 20], [0, 1, 2, 3]],
    [[21, 24], [0, 2, 4, 6]],
    [[25, 29], [0, 3, 4, 6]],
  ]) {
    for (const wave of waves) {
      game.wave = wave;
      assert.deepEqual(enemies.map(enemy => economy.getEnemyMaterialDrop(enemy)), expected);
    }
  }
  assert.equal(economy.getEnemyMaterialDrop({ elite: true }, 20), 1);
  assert.equal(economy.getEnemyMaterialDrop(null), 0);
  assert.equal(getEndgameRefinementConfig().startWave, 21);
  for (const [wave, bonus] of [[20, 0], [21, 1], [24, 1], [25, 2], [27, 2], [28, 3], [29, 3], [30, 0]]) {
    assert.equal(getWaveClearMaterialBonus(wave), bonus);
  }
});
