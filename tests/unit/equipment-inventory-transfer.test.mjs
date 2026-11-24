import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createEconomyCore } from '../../src/systems/economy/index.js';
import * as equipmentSystem from '../../src/systems/equipment/index.js';
import { createHeroStats } from '../../src/systems/hero/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';
import { createUnlockSystem } from '../../src/systems/progression/index.js';

function setup() {
  const game = {
    wave: 1, rnd: mulberry32(42), gold: 100, materials: 10, transferTokens: 2,
    bag: [], seal: null, subSeals: [], stats: { merges: 0 }, runMetrics: {},
    hero: {
      x: 4, y: 7, baseMaxHp: 220, maxHp: 220, hp: 80,
      gear: [], perks: {}, breakthroughs: {},
    },
  };
  const effects = [];
  const record = name => (...args) => effects.push([name, ...args]);
  const ctx = createRuntimeContext({ game, ports: {
    audio: { play: record('play') },
    vfx: { addRing: record('ring'), addFloat: record('float') },
    ui: { toast: record('toast'), renderAllUI: record('render') },
    modals: { renderAffixTransferModal: record('modal') },
  } });
  const meta = createMetaSystem(ctx);
  const unlock = createUnlockSystem(ctx);
  const equipment = equipmentSystem.createEquipmentCore(ctx, meta);
  const economy = createEconomyCore(ctx, { equipment, meta });
  const hero = createHeroStats(ctx, { unlock, meta });
  economy.resetRunMetricsResourceBaseline();
  const inventory = equipmentSystem.createEquipmentInventory(ctx, { equipment, economy, unlock, hero });
  const transfer = equipmentSystem.createAffixTransfer(ctx, { equipment, economy, hero });
  const gear = (uid, baseKey, affixes, opts = {}) => equipment.createGearInstance(baseKey, {
    uid, slotsCount: affixes.length, affixes, ...opts,
  });
  return { game, ctx, gear, inventory, transfer, effects, economy };
}

function bagSeal() {
  return { itemType: 'seal', uid: 'seal', kind: 'fire', star: 2, name: '赤焰灵印' };
}

function globalSynergies(game) {
  return game.hero.activeGearSynergies.active.map(s => s.id);
}

test('equip, replace and unequip update max HP and live synergies without free healing (BUG-02)', () => {
  const { game, gear, inventory } = setup();
  const original = gear('original', 'bronze_tassel', ['fire_brand']);
  const incoming = gear('incoming', 'wood_talisman', ['fire_burst']);
  const replacement = gear('replacement', 'frost_mirror', ['frost_chill']);
  game.hero.gear.push(original);
  game.bag.push(incoming, replacement);
  game.mode = 'equip';

  assert.equal(inventory.equipGearFromBag(0), true);
  assert.deepEqual(game.hero.gear, [original, incoming]);
  assert.deepEqual(game.bag, [replacement]);
  assert.equal(game.mode, null);
  assert.equal(game.hero.maxHp, 265);
  assert.equal(game.hero.hp, 80);
  assert.deepEqual(globalSynergies(game), ['fire_detonate_duo']);

  const swapped = inventory.replaceEquippedGear(1, 0);
  assert.deepEqual(swapped, { ok: true, slotIdx: 1, bagIdx: 0, incoming: replacement, outgoing: incoming });
  assert.deepEqual(game.hero.gear, [original, replacement]);
  assert.deepEqual(game.bag, [incoming]);
  assert.equal(game.hero.maxHp, 275);
  assert.equal(game.hero.hp, 80);
  assert.deepEqual(globalSynergies(game), []);

  assert.equal(inventory.replaceEquippedGear(1, 0).ok, true);
  assert.deepEqual(globalSynergies(game), ['fire_detonate_duo']);
  game.hero.hp = 250;
  assert.equal(inventory.unequipGear(1), true);
  assert.deepEqual(game.hero.gear, [original]);
  assert.deepEqual(game.bag, [replacement, incoming]);
  assert.equal(game.hero.maxHp, 220);
  assert.equal(game.hero.hp, 220);
  assert.deepEqual(globalSynergies(game), []);
});

test('full equipment slots open hero details and a full bag prevents unequipping (BUG-03)', () => {
  const { game, gear, inventory, effects, economy } = setup();
  game.hero.gear = Array.from({ length: 4 }, (_, i) => gear(`equipped-${i}`, 'bronze_tassel', [null]));
  game.bag = Array.from({ length: economy.getBagCapacity() }, (_, i) => gear(`bag-${i}`, 'wood_talisman', [null]));
  const equippedBefore = game.hero.gear.slice();
  const bagBefore = game.bag.slice();
  assert.equal(inventory.equipGearFromBag(0), false);
  assert.deepEqual(game.inspTarget, { type: 'hero' });
  assert.match(effects[0][1], /领主构装槽已满（4\/4）/);
  assert.deepEqual(effects[1], ['render', true]);

  assert.deepEqual(inventory.unequipGear(0), { ok: false, reason: 'bag_full' });
  assert.match(effects[2][1], /背包已满（12\/12）/);
  assert.deepEqual(effects[3], ['render', true]);
  assert.deepEqual(game.hero.gear, equippedBefore);
  assert.deepEqual(game.bag, bagBefore);
});

test('a bag seal cannot replace gear but can be equipped safely as a main seal', () => {
  const { game, gear, inventory } = setup();
  const equipped = gear('equipped', 'bronze_tassel', [null]);
  const seal = bagSeal();
  game.hero.gear.push(equipped);
  game.bag.push(seal);
  assert.deepEqual(inventory.replaceEquippedGear(0, 0), { ok: false, reason: 'bag_item_is_seal' });
  assert.equal(game.hero.gear[0], equipped);
  assert.equal(game.bag[0], seal);
  assert.equal(inventory.equipGearFromBag(0), true);
  assert.equal(game.bag.length, 0);
  assert.equal(game.seal.kind, 'fire');
  assert.equal(game.seal.star, 2);
});

test('selling, salvage alias and dismantling settle only their original currency for gear and seals', () => {
  const { game, gear, inventory, economy } = setup();
  for (const [action, item, reason, type, delta] of [
    ['sellBagGear', gear('sell', 'bronze_tassel', [null]), 'sell_bag_gear', 'gold', 10],
    ['sellBagGear', bagSeal(), 'sell_bag_seal', 'gold', 33],
    ['salvageBagGear', gear('salvage', 'bronze_tassel', [null]), 'sell_bag_gear', 'gold', 10],
    ['dismantleBagGear', gear('dismantle', 'bronze_tassel', [null]), 'dismantle_bag_gear', 'materials', 1],
    ['dismantleBagGear', bagSeal(), 'dismantle_bag_seal', 'materials', 4],
  ]) {
    game.bag.push(item);
    assert.equal(inventory[action](0), true);
    assert.deepEqual(game.bag, []);
    assert.deepEqual(economy.getResourceLedger(1).map(entry => [entry.reason, entry.type, entry.delta]),
      [[reason, type, delta]]);
    assert.equal(game.transferTokens, 2);
  }
  assert.equal(game.gold, 153);
  assert.equal(game.materials, 15);
  assert.equal(economy.getResourceLedger().length, 5);
});

test('enhancement preserves gear identity and slot contents while raising the existing affix tiers', () => {
  const { game, gear, inventory } = setup();
  const item = gear('enhance', 'wood_talisman', ['fire_brand', null, 'fire_burst'], {
    enhanceLv: 2, sourceStage: 3, rarity: 'epic',
  });
  game.hero.gear.push(item);
  assert.deepEqual(inventory.enhanceGear({ location: 'equipped', idx: 0 }), {
    ok: true, uid: 'enhance', enhanceLv: 3, cost: 5, materialsLeft: 5,
  });
  assert.equal(game.hero.gear[0], item);
  assert.equal(item.rarity, 'epic');
  assert.equal(item.sourceStage, 3);
  assert.equal(item.slotsCount, 3);
  assert.deepEqual(item.affixes, [
    { id: 'fire_brand', tier: 4, rarity: 'common' }, null,
    { id: 'fire_burst', tier: 4, rarity: 'rare' },
  ]);
  assert.equal(game.hero.hp, 80);
  assert.equal(game.hero.maxHp, 316);
  assert.deepEqual(globalSynergies(game), ['fire_detonate_duo']);
  assert.equal(game.transferTokens, 2);
});

test('enhancement rejects insufficient materials, capped gear and bag seals without spending', () => {
  const { game, gear, inventory, economy } = setup();
  const capped = gear('capped', 'wood_talisman', ['fire_brand'], { enhanceLv: 6 });
  const item = gear('short', 'wood_talisman', ['fire_brand'], { enhanceLv: 1 });
  game.bag.push(capped, item, bagSeal());
  game.materials = 2;
  const before = structuredClone(game.bag);
  assert.deepEqual(inventory.enhanceGear('capped'), { ok: false, reason: 'max_level' });
  assert.deepEqual(inventory.enhanceGear({ uid: 'short' }), { ok: false, reason: 'insufficient_materials', need: 3 });
  assert.deepEqual(inventory.enhanceGear({ location: 'bag', idx: 2 }), { ok: false, reason: 'not_found' });
  assert.deepEqual(game.bag, before);
  assert.equal(game.materials, 2);
  assert.deepEqual(economy.getResourceLedger(), []);
});

test('gear rewards enter the bag or overflow to the stash and can be claimed after freeing space', () => {
  const { game, inventory, economy } = setup();
  const stored = inventory.grantGearSafely('wood_talisman', { uid: 'reward', slotsCount: 1, affixes: [null] });
  assert.deepEqual(stored, { ok: true, storedIn: 'bag', item: game.bag[0] });
  assert.equal(stored.item.baseKey, 'wood_talisman');
  assert.equal(stored.item.origin, 'destiny_gamble');
  while (game.bag.length < economy.getBagCapacity()) game.bag.push(bagSeal());

  const overflow = inventory.grantGearSafely(stored.item, { origin: 'chest', silent: true });
  assert.deepEqual(overflow, { ok: true, storedIn: 'stash', item: game.rewardStash[0].item });
  assert.deepEqual(game.rewardStash, [{ itemType: 'gear', item: overflow.item, storedAtWave: 1, origin: 'chest' }]);
  assert.deepEqual(inventory.claimRewardStashItem(), { ok: false, reason: 'bag_full' });
  game.bag.pop();
  assert.deepEqual(inventory.claimRewardStashItem(), { ok: true, item: overflow.item, stashLeft: 0 });
  assert.equal(game.bag.at(-1), overflow.item);
  assert.deepEqual(inventory.claimRewardStashItem(), { ok: false, reason: 'invalid_stash_index' });
});

test('off-element seal rewards use sub slots or storage and preserve a five-star main seal', () => {
  const { game, inventory } = setup();
  game.wave = 20;
  game.hero.breakthroughs = { w10: true, w20: true };
  game.hero.perks.artifact_overclock = 2;
  const main = { kind: 'frost', elem: 'frost', star: 5, prog: 0, route: 'frost_aegis', cd: 2, dmgDealt: 7, kills: 1 };
  const before = structuredClone(main);
  game.seal = main;
  assert.equal(inventory.grantSealSafely('fire').action, 'equipped_sub');
  assert.equal(inventory.grantSealSafely('holy', 2).action, 'equipped_sub');
  assert.equal(inventory.grantSealSafely('wind', 3).action, 'stored_bag');
  assert.deepEqual(game.subSeals.map(({ kind, star }) => [kind, star]), [['fire', 1], ['holy', 2]]);
  assert.deepEqual(game.bag.map(({ kind, star }) => [kind, star]), [['wind', 3]]);
  assert.equal(game.seal, main);
  assert.deepEqual(game.seal, before);
  assert.equal(inventory.equipGearFromBag(0), false);
  assert.equal(game.bag.length, 1);
  assert.equal(game.seal, main);
});

test('storeUnequipped bypasses empty main and sub slots, storing seals in the bag or stash', () => {
  const { game, inventory, economy } = setup();
  const stored = inventory.grantSealSafely('fire', 3, { storeUnequipped: true });
  assert.equal(stored.action, 'stored_bag');
  assert.equal(stored.item, game.bag[0]);
  assert.equal(game.seal, null);
  game.wave = 6;
  inventory.grantSealSafely('frost');
  const main = game.seal;
  while (game.bag.length < economy.getBagCapacity()) game.bag.push(bagSeal());
  const overflow = inventory.grantSealSafely('holy', 2, { storeUnequipped: true, origin: 'w29' });
  assert.equal(overflow.action, 'stored_stash');
  assert.deepEqual(game.rewardStash, [{ itemType: 'seal', item: overflow.item, storedAtWave: 6, origin: 'w29' }]);
  assert.equal(game.seal, main);
  assert.deepEqual(game.subSeals, []);
  game.bag.pop();
  assert.equal(inventory.claimRewardStashItem().item, overflow.item);
  assert.equal(game.bag.at(-1), overflow.item);
});

function transferSetup() {
  const fixture = setup();
  const { game, gear } = fixture;
  const source = gear('source', 'bronze_tassel', ['fire_brand', 'fire_burst', null]);
  const target = gear('target', 'wood_talisman', ['fire_chain', null], { enhanceLv: 2 });
  game.hero.gear.push(source);
  game.bag.push(target, bagSeal());
  const params = { source: 'source', sourceSlot: 0, target: 'target', targetSlot: 1 };
  return { ...fixture, source, target, params };
}

test('transfer locations accept UID and index references but exclude bag seals', () => {
  const { transfer, source, target, ctx } = transferSetup();
  assert.deepEqual(transfer.resolveGearLocation('source'), { inst: source, location: 'equipped', idx: 0 });
  assert.deepEqual(transfer.resolveGearLocation({ location: 'equipped', idx: 0 }),
    { inst: source, location: 'equipped', idx: 0 });
  assert.deepEqual(transfer.resolveGearLocation({ uid: 'target' }), { inst: target, location: 'bag', idx: 0 });
  assert.deepEqual(transfer.resolveGearLocation({ location: 'bag', idx: 0 }), { inst: target, location: 'bag', idx: 0 });
  assert.equal(transfer.resolveGearLocation('seal'), null);
  assert.equal(transfer.resolveGearLocation({ location: 'bag', idx: 1 }), null);
  assert.equal(transfer.resolveGearLocation('missing'), null);
  ctx.setGame(null);
  assert.equal(transfer.resolveGearLocation('source'), null);
  assert.deepEqual(transfer.validateAffixTransfer(), { ok: false, reason: 'no_game' });
  assert.deepEqual(transfer.commitAffixTransfer(), { ok: false, reason: 'no_game' });
});

test('transfer cost and error copy are available as pure functions and through the factory', () => {
  const { transfer } = transferSetup();
  assert.equal(transfer.getAffixTransferCost, equipmentSystem.getAffixTransferCost);
  assert.equal(transfer.describeTransferError, equipmentSystem.describeTransferError);
  assert.deepEqual(transfer.getAffixTransferCost('fire_brand'), { costTokens: 1, costGold: 28, isOverwrite: false });
  assert.deepEqual(transfer.getAffixTransferCost('fire_burst', true), { costTokens: 1, costGold: 63, isOverwrite: true });
  assert.deepEqual(transfer.getAffixTransferCost('fire_chain'), { costTokens: 1, costGold: 68, isOverwrite: false });
  assert.equal(transfer.describeTransferError('same_gear'), '源装备与目标装备不能为同一件构装');
  assert.equal(transfer.describeTransferError('no_game'), '转移条件不满足 (no_game)');
});

test('transfer validation rejects invalid gear references, same gear and empty or out-of-bounds slots', () => {
  const { transfer, params } = transferSetup();
  for (const [overrides, reason] of [
    [{ source: 'missing' }, 'invalid_source'],
    [{ target: 'seal' }, 'invalid_target'],
    [{ target: 'source' }, 'same_gear'],
    [{ sourceSlot: -1 }, 'invalid_source_slot'],
    [{ sourceSlot: 3 }, 'invalid_source_slot'],
    [{ sourceSlot: 2 }, 'empty_source_slot'],
    [{ targetSlot: NaN }, 'invalid_target_slot'],
    [{ targetSlot: 2 }, 'invalid_target_slot'],
  ]) {
    assert.deepEqual(transfer.validateAffixTransfer({ ...params, ...overrides }), { ok: false, reason });
  }
});

test('transfer validation excludes the overwritten slot from duplicate and conflict checks', () => {
  const { game, gear, transfer, params } = transferSetup();
  game.bag[0] = gear('target', 'wood_talisman', ['fire_brand', null]);
  assert.deepEqual(transfer.validateAffixTransfer(params), {
    ok: false, reason: 'duplicate_affix_on_target', affixId: 'fire_brand',
  });
  assert.equal(transfer.validateAffixTransfer({ ...params, targetSlot: 0 }).ok, true);

  game.hero.gear[0] = gear('source', 'bronze_tassel', ['thunder_spark']);
  game.bag[0] = gear('target', 'wood_talisman', ['wind_tempest', null]);
  assert.deepEqual(transfer.validateAffixTransfer(params), {
    ok: false, reason: 'conflict_group_on_target', conflictGroup: 'proc_style', conflictingAffixId: 'wind_tempest',
  });
  assert.equal(transfer.validateAffixTransfer({ ...params, targetSlot: 0 }).ok, true);
});

test('preview and cancel only write the draft and preserve resources and real gear synergies', () => {
  const { game, transfer, params, effects } = transferSetup();
  const snapshot = () => structuredClone({ ...game, rnd: null, transferDraft: null });
  const before = snapshot();
  const preview = transfer.previewAffixTransfer(params);
  assert.equal(preview.canCommit, true);
  assert.equal(preview.isOverwrite, false);
  assert.equal(preview.movingAffix.id, 'fire_brand');
  assert.equal(preview.replacedAffix, null);
  assert.deepEqual(preview.sourceBeforeSynergies.map(s => s.id), ['fire_detonate_duo']);
  assert.deepEqual(preview.sourceAfterSynergies, []);
  assert.deepEqual(preview.targetBeforeSynergies, []);
  assert.deepEqual(preview.targetAfterSynergies.map(s => s.id), ['fire_ember_duo']);
  assert.deepEqual(preview.globalBeforeSynergies.map(s => s.id), ['fire_detonate_duo']);
  assert.deepEqual(preview.globalAfterSynergies, []);
  assert.equal(game.transferDraft.preview, preview);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(transfer.cancelAffixTransferPreview(), { ok: true, cancelled: true });
  assert.equal(game.transferDraft, null);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(effects, []);
});

test('commit revalidates previewed prices and W29 lock without partially applying changes', () => {
  const { game, transfer, params, effects } = transferSetup();
  assert.deepEqual(transfer.commitAffixTransfer(), { ok: false, reason: 'no_transfer_params' });
  assert.equal(transfer.previewAffixTransfer(params).canCommit, true);
  for (const [tokens, gold, reason] of [
    [0, 100, 'insufficient_transfer_tokens'], [1, 27, 'insufficient_gold'],
  ]) {
    game.transferTokens = tokens;
    game.gold = gold;
    const before = structuredClone({ ...game, rnd: null });
    assert.deepEqual(transfer.validateAffixTransfer(params), {
      ok: false, reason, costTokens: 1, costGold: 28, isOverwrite: false, haveTokens: tokens, haveGold: gold,
    });
    const errorText = transfer.describeTransferError(reason);
    assert.deepEqual(transfer.commitAffixTransfer(), {
      ok: false, reason, errorText, transferTokensLeft: tokens, goldLeft: gold,
    });
    assert.deepEqual(effects.at(-1), ['toast', errorText, true]);
    assert.deepEqual({ ...game, rnd: null }, before);
  }
  game.transferTokens = 2;
  game.gold = 100;
  game.wave = 29;
  game.finalPrep = { active: true, started: true, timer: 0 };
  const before = structuredClone({ ...game, rnd: null });
  assert.deepEqual(transfer.commitAffixTransfer(), { ok: false, reason: 'final_prep_locked' });
  assert.deepEqual({ ...game, rnd: null }, before);
  assert.equal(effects.length, 2);
});

test('commit fills an empty slot then overwrites a slot and recalculates item and global synergies', () => {
  const { game, transfer, source, target, params, economy, effects } = transferSetup();
  game.bag[0] = source;
  game.hero.gear[0] = target;
  game.activeModal = { type: 'affix_transfer' };
  source.extractedCount = 2;
  transfer.previewAffixTransfer(params);

  const first = transfer.commitAffixTransfer();
  const moved = { id: 'fire_brand', tier: 3, rarity: 'common' };
  assert.deepEqual(first, {
    ok: true, sourceUid: 'source', targetUid: 'target', sourceSlot: 0, targetSlot: 1,
    costTokens: 1, costGold: 28, isOverwrite: false, movedAffix: moved, replacedAffix: null,
    sourceSynergies: [], targetSynergies: ['fire_ember_duo'], globalSynergies: ['fire_ember_duo'],
    transferTokensLeft: 1, goldLeft: 72,
  });
  assert.equal(game.bag[0], source);
  assert.equal(game.hero.gear[0], target);
  assert.equal(source.affixes[0], null);
  assert.equal(source.extractedCount, 3);
  assert.deepEqual(target.affixes[1], moved);
  assert.equal(game.transferDraft, null);
  assert.deepEqual(globalSynergies(game), ['fire_ember_duo']);

  const overwritten = target.affixes[0];
  const second = transfer.commitAffixTransfer({ ...params, sourceSlot: 1, targetSlot: 0 });
  assert.deepEqual(second, {
    ok: true, sourceUid: 'source', targetUid: 'target', sourceSlot: 1, targetSlot: 0,
    costTokens: 1, costGold: 63, isOverwrite: true,
    movedAffix: { id: 'fire_burst', tier: 3, rarity: 'rare' }, replacedAffix: overwritten,
    sourceSynergies: [], targetSynergies: ['fire_detonate_duo'], globalSynergies: ['fire_detonate_duo'],
    transferTokensLeft: 0, goldLeft: 9,
  });
  assert.equal(second.replacedAffix, overwritten);
  assert.deepEqual(source.affixes, [null, null, null]);
  assert.equal(source.extractedCount, 4);
  assert.deepEqual(target.affixes, [second.movedAffix, moved]);
  assert.equal(game.stats.affixTransfers, 2);
  assert.equal(game.hero.maxHp, 281);
  assert.equal(game.hero.hp, 80);
  assert.deepEqual(globalSynergies(game), ['fire_detonate_duo']);
  assert.deepEqual(economy.getResourceLedger().map(e => [e.type, e.delta, e.reason]), [
    ['transferTokens', -1, 'affix_transfer'], ['gold', -28, 'affix_transfer'],
    ['transferTokens', -1, 'affix_transfer'], ['gold', -63, 'affix_transfer'],
  ]);
  assert.deepEqual(effects.map(([name]) => name), [
    'play', 'ring', 'float', 'toast', 'modal', 'render',
    'play', 'ring', 'float', 'toast', 'modal', 'render',
  ]);
});
