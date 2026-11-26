import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import {
  buildChainHint,
  createEquipmentCore,
  describeGearEffect,
  describeGearInstance,
  evaluateItemSynergies,
  evaluateSynergySetFromAffixIds,
  findGearStackTarget,
  gearBase,
  gearLabel,
  gearStar,
  getGearBaseMult,
  isGearInstance,
  validateGearAffixes,
} from '../../src/systems/equipment/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';

const fire = ['fire_brand', 'fire_burst', 'fire_chain'];
const frost = ['frost_chill', 'frost_ward', 'frost_nova_counter'];

function setup(game = null) {
  const ctx = createRuntimeContext({ game });
  return { ctx, equipment: createEquipmentCore(ctx, createMetaSystem(ctx)) };
}

function item(uid, ...ids) {
  return { uid, affixes: ids.map(id => id && { id }) };
}

test('equipment core assembles the 22 methods and preserves legacy and instance identity', () => {
  const { ctx, equipment } = setup();
  const inst = { uid: 'g1', baseKey: 'bronze_tassel', enhanceLv: 5 };
  const legacy = 'bronze_tassel#2';
  const pure = {
    isGearInstance, gearBase, gearStar, gearLabel, findGearStackTarget, validateGearAffixes, getGearBaseMult,
    evaluateSynergySetFromAffixIds, evaluateItemSynergies, buildChainHint, describeGearEffect, describeGearInstance,
  };
  assert.deepEqual(Object.keys(equipment).sort(), [
    ...Object.keys(pure), 'nextGearUid', 'ownedGearStar', 'rollGearSlotsCount', 'rollGearAffixes',
    'createGearInstance', 'normalizeGearInstance', 'evaluateEquipmentSynergies', 'recomputeEquipmentSynergies',
    'getActiveGearAffixSynergies', 'getGearSynergyHints',
  ].sort());
  for (const [key, fn] of Object.entries(pure)) assert.equal(equipment[key], fn);

  assert.equal(isGearInstance(inst), true);
  assert.equal(isGearInstance(legacy), false);
  assert.equal(isGearInstance({ baseKey: inst.baseKey }), false);
  assert.equal(isGearInstance(null), false);
  assert.equal(gearBase(legacy), 'bronze_tassel');
  assert.equal(gearBase(inst), 'bronze_tassel');
  assert.equal(gearBase({ key: 'bronze_tassel' }), 'bronze_tassel');
  assert.equal(gearBase(null), '');
  assert.equal(gearStar(inst), 6);
  assert.equal(gearStar(legacy), 2);
  assert.equal(gearStar('bronze_tassel#99'), 3);
  assert.equal(gearStar('bronze_tassel#bad'), 1);
  assert.equal(gearLabel(inst), '青铜剑穗 +5');
  assert.equal(gearLabel(legacy), '青铜剑穗 2★');
  assert.equal(gearLabel('unknown'), '未知构装');
  assert.equal(findGearStackTarget(), null);
  assert.equal(equipment.ownedGearStar('bronze_tassel'), 0);

  ctx.setGame({ hero: { gear: [legacy] }, bag: [inst, 'flame_fan'] });
  assert.equal(equipment.ownedGearStar('bronze_tassel'), 2);
  assert.equal(equipment.ownedGearStar('flame_fan'), 1);
  assert.equal(findGearStackTarget(), null);
});

test('base stats multiply source stages 1–3 by each enhancement level 0–5', () => {
  const expected = [
    [1, 1.125, 1.25, 1.375, 1.50, 1.625],
    [1.12, 1.26, 1.40, 1.54, 1.68, 1.82],
    [1.24, 1.395, 1.55, 1.705, 1.86, 2.015],
  ];
  for (const [index, levels] of expected.entries()) {
    for (const [enhanceLv, mult] of levels.entries()) {
      assert.ok(Math.abs(getGearBaseMult({ sourceStage: index + 1, enhanceLv }) - mult) < 1e-12);
    }
  }
  assert.equal(getGearBaseMult('bronze_tassel#3'), getGearBaseMult({ sourceStage: 1, enhanceLv: 2 }));
  assert.equal(getGearBaseMult(null), 1);
});

test('slot rolls use exact weight cutoffs and read the current run RNG by default', () => {
  const { ctx, equipment } = setup();
  for (const [roll, slots] of [[0, 1], [0.499999, 1], [0.50, 2], [0.849999, 2], [0.85, 3], [0.999999, 3]]) {
    assert.equal(equipment.rollGearSlotsCount(() => roll), slots, String(roll));
  }
  ctx.setGame({ rnd: mulberry32(42) });
  assert.equal(equipment.rollGearSlotsCount(), 2);
  assert.equal(equipment.rollGearSlotsCount(), 1);
  assert.equal(equipment.rollGearSlotsCount(), 3);
});

test('validation handles slot limits, unknowns, duplicates, conflicts and empty slots', () => {
  assert.deepEqual(validateGearAffixes([null, 'fire_brand', { id: 'fire_burst' }]), { ok: true, reason: null });
  assert.deepEqual(validateGearAffixes(['fire_brand', null], 1), { ok: false, reason: 'exceeds_slots' });
  assert.deepEqual(validateGearAffixes(['missing']), { ok: false, reason: 'unknown_affix:missing' });
  assert.deepEqual(validateGearAffixes(['fire_brand', { id: 'fire_brand' }]), {
    ok: false, reason: 'duplicate_affix:fire_brand',
  });
  assert.deepEqual(validateGearAffixes(['thunder_spark', 'wind_tempest']), {
    ok: false, reason: 'conflict_group:proc_style',
  });
  assert.deepEqual(validateGearAffixes(['fury_crit', 'iron_bastion']), {
    ok: false, reason: 'conflict_group:crit_stance',
  });
});

test('affix rolls, gear creation and legacy normalization preserve seeded results and RNG order', () => {
  const game = {
    wave: 21,
    rnd: mulberry32(42),
    metaLoadout: { main: 'main_flame' },
    metaRunState: { activeAffixKeys: ['fire_brand', 'frost_chill', 'thunder_spark', 'wind_tempest'] },
  };
  const { ctx, equipment } = setup(game);
  const rndFn = mulberry32(42);
  assert.deepEqual(equipment.rollGearAffixes(3, { elem: 'fire', rndFn }), [
    { id: 'fire_brand', tier: 1, rarity: 'common' },
    { id: 'wind_tempest', tier: 1, rarity: 'common' },
    { id: 'frost_chill', tier: 1, rarity: 'common' },
  ]);
  assert.equal(rndFn(), 0.17481389874592423);
  assert.deepEqual(equipment.createGearInstance('flame_fan', { enhanceLv: 2 }), {
    uid: 'g1_2573', baseKey: 'flame_fan', name: '离火羽扇', icon: '◇', elem: 'fire', set: 'flame',
    rarity: 'rare', sourceStage: 3, slotsCount: 2,
    affixes: [
      { id: 'thunder_spark', tier: 3, rarity: 'rare' },
      { id: 'fire_brand', tier: 3, rarity: 'common' },
    ],
    enhanceLv: 2, paidGold: 0, extractedCount: 0, origin: 'drop',
  });
  const normalized = equipment.normalizeGearInstance('frost_mirror#3', {
    slotsCount: 2, affixes: ['frost_chill', null], wave: 11, origin: 'legacy',
  });
  assert.deepEqual(normalized, {
    uid: 'g2_5739', baseKey: 'frost_mirror', name: '寒冰护镜', icon: '🪞', elem: 'frost', set: 'frost',
    rarity: 'rare', sourceStage: 2, slotsCount: 2,
    affixes: [{ id: 'frost_chill', tier: 3, rarity: 'common' }, null],
    enhanceLv: 2, paidGold: 0, extractedCount: 0, origin: 'legacy',
  });
  assert.deepEqual(equipment.normalizeGearInstance(normalized), normalized);
  assert.equal(ctx.counters.gearUidSeq, 3);
  assert.equal(game.rnd(), 0.2732279943302274);
});

test('UIDs share the runtime counter and use Math.random when there is no active run', t => {
  t.mock.method(Math, 'random', () => 0.25);
  const { ctx, equipment } = setup();
  assert.equal(equipment.nextGearUid(), 'g1_3250');
  ctx.setGame({ rnd: mulberry32(42) });
  assert.equal(equipment.nextGearUid(), 'g2_6409');
  assert.equal(ctx.counters.gearUidSeq, 3);
});

test('explicit affixes reject duplicates and conflicts and normalize unknowns to empty slots', () => {
  const { ctx, equipment } = setup();
  const opts = { slotsCount: 2, uid: 'explicit' };
  assert.throws(
    () => equipment.createGearInstance('flame_fan', { ...opts, affixes: ['fire_brand', 'fire_brand'] }),
    /Invalid gear affixes \(duplicate_affix:fire_brand\)/,
  );
  assert.throws(
    () => equipment.createGearInstance('flame_fan', { ...opts, affixes: ['fury_crit', 'iron_bastion'] }),
    /Invalid gear affixes \(conflict_group:crit_stance\)/,
  );
  const inst = equipment.createGearInstance('flame_fan', { ...opts, affixes: ['missing', 'fire_brand', 'fire_burst'] });
  assert.deepEqual(inst.affixes, [null, { id: 'fire_brand', tier: 1, rarity: 'common' }]);
  assert.deepEqual(equipment.normalizeGearInstance({ ...inst, affixes: ['missing', 'fire_brand'] }), inst);
  assert.equal(ctx.counters.gearUidSeq, 1);
});

test('the main legacy tilts the same roll and rolls stay inside the active affix pool', () => {
  const game = {
    rnd: () => 0.52,
    metaLoadout: { main: 'main_flame' },
    metaRunState: { activeAffixKeys: ['fire_brand', 'frost_chill'] },
  };
  const { equipment } = setup(game);
  assert.deepEqual(equipment.rollGearAffixes(1), [{ id: 'fire_brand', tier: 1, rarity: 'common' }]);
  game.metaLoadout.main = 'main_frost';
  assert.deepEqual(equipment.rollGearAffixes(1), [{ id: 'frost_chill', tier: 1, rarity: 'common' }]);
  game.metaRunState.activeAffixKeys = ['thunder_spark', 'wind_tempest', 'unknown_affix'];
  assert.deepEqual(equipment.rollGearAffixes(3, { rndFn: () => 0 }), [
    { id: 'thunder_spark', tier: 1, rarity: 'rare' },
  ]);
});

test('item and equipment evaluations replace duos with trios and activate each chain only once across four slots', () => {
  const gear = [
    item('a', ...fire.slice(0, 2)),
    item('b', ...fire),
    item('c', frost[0], frost[1], null),
    item('d', frost[2], frost[1]),
  ];
  const { equipment } = setup({ hero: { gear } });
  assert.deepEqual(evaluateItemSynergies(gear[0]).map(s => s.id), ['fire_detonate_duo']);
  assert.deepEqual(evaluateItemSynergies(gear[1]).map(s => s.id), ['fire_detonate_trio']);
  assert.deepEqual(evaluateItemSynergies('flame_fan#2'), []);
  assert.deepEqual(evaluateSynergySetFromAffixIds(new Set(frost.slice(0, 2))).map(s => s.id), ['frost_aegis_duo']);

  const result = equipment.evaluateEquipmentSynergies();
  assert.deepEqual(result.active.map(s => s.id), ['fire_detonate_trio', 'frost_aegis_trio']);
  assert.deepEqual(Object.keys(result.byId), ['fire_detonate_trio', 'frost_aegis_trio']);
  assert.deepEqual(result.affixIds, [...fire, ...frost]);
  assert.equal(result.affixCounts.fire_brand, 2);
  assert.equal(result.affixCounts.frost_ward, 2);
  assert.deepEqual(result.perItem.map(({ uid, synergies }) => [uid, synergies.map(s => s.id)]), [
    ['a', ['fire_detonate_duo']], ['b', ['fire_detonate_trio']],
    ['c', ['frost_aegis_duo']], ['d', ['frost_bulwark_duo']],
  ]);
  assert.equal(result.hasFireTrio, true);
  assert.equal(result.hasFrostTrio, true);
  assert.equal(result.hasFireDuo, false);
  assert.equal(result.hasFrostDuo, false);
});

test('active synergies cache on the current hero and recompute after equipment changes', () => {
  const { ctx, equipment } = setup();
  assert.deepEqual(equipment.getActiveGearAffixSynergies().active, []);
  assert.deepEqual(equipment.recomputeEquipmentSynergies().active, []);
  const hero = { gear: [item('a', ...fire.slice(0, 2))] };
  ctx.setGame({ hero });
  const cached = equipment.getActiveGearAffixSynergies();
  assert.equal(cached, hero.activeGearSynergies);
  assert.equal(cached.fireSynergy.id, 'fire_detonate_duo');
  hero.gear.push(item('b', fire[2]));
  assert.equal(equipment.getActiveGearAffixSynergies(), cached);
  const next = equipment.recomputeEquipmentSynergies();
  assert.notEqual(next, cached);
  assert.equal(next, equipment.getActiveGearAffixSynergies());
  assert.equal(next.fireSynergy.id, 'fire_detonate_trio');
});

test('fire and frost hints show partial, duo and trio progress, including candidate previews', () => {
  const cases = [
    [fire, 'fire_detonate', '火系引爆', '穿戴后激活【焚标引爆】双词条联动', '穿戴后升级【炽炎连环引爆】完整三联动'],
    [frost, 'frost_aegis', '冰系护体', '穿戴后激活【寒冰护体】双词条联动', '穿戴后升级【凛冬寒盾反制】完整三联动'],
  ];
  for (const [ids, chain, label, duoPreview, trioPreview] of cases) {
    const hero = { gear: [item('a', ids[0])] };
    const { equipment } = setup({ hero });
    const duo = item('b', ids[1]);
    const trio = item('c', ids[2]);
    const [partial] = equipment.getGearSynergyHints();
    assert.deepEqual(partial, buildChainHint(chain, label, ids, new Set([ids[0]]), []));
    assert.equal(partial.state, 'partial');
    assert.equal(partial.activeId, null);
    assert.deepEqual(partial.present, ids.slice(0, 1));
    assert.deepEqual(partial.missing, ids.slice(1));
    assert.match(partial.text, /1\/3/);
    assert.deepEqual(equipment.getGearSynergyHints(duo), [duoPreview]);

    hero.gear.push(duo);
    const [duoHint] = equipment.getGearSynergyHints();
    assert.equal(duoHint.state, 'duo');
    assert.equal(duoHint.activeId, `${chain}_duo`);
    assert.deepEqual(duoHint.present, ids.slice(0, 2));
    assert.deepEqual(duoHint.missing, ids.slice(2));
    assert.match(duoHint.text, /已激活双联动.*升级为完整三联动/);
    assert.deepEqual(equipment.getGearSynergyHints(trio), [trioPreview]);
    assert.equal(hero.gear.length, 2);

    hero.gear.push(trio);
    const [trioHint] = equipment.getGearSynergyHints();
    assert.equal(trioHint.state, 'trio');
    assert.equal(trioHint.activeId, `${chain}_trio`);
    assert.deepEqual(trioHint.present, ids);
    assert.deepEqual(trioHint.missing, []);
    assert.match(trioHint.text, /完整三联动已激活（已替代原双联动）/);
    assert.deepEqual(equipment.getGearSynergyHints(trio), []);
  }
});

test('gear descriptions retain legacy multipliers, empty slots, enhancement and the synergy suffix', () => {
  const { equipment } = setup();
  assert.equal(describeGearEffect('bronze_tassel#2'), '攻速 +22% · 全伤 +13%');
  assert.equal(describeGearEffect('unknown'), '');
  assert.equal(describeGearInstance('bronze_tassel#2'), '攻速 +22% · 全伤 +13%');
  const inst = equipment.createGearInstance('bronze_tassel', {
    uid: 'describe', sourceStage: 2, slotsCount: 3, enhanceLv: 2,
    affixes: [null, 'fire_brand', { id: 'fire_burst', tier: 2 }],
  });
  assert.equal(describeGearEffect(inst), "攻速 +20% · 全伤 +11%");
  assert.equal(describeGearInstance(inst),
    "[凡品·阶段2(W11-20)·3槽·+2] 攻速 +20% · 全伤 +11% | 词条:[空槽1] + 🔥炽炎烙印(T3) + 💥爆燃核心(T2) | 联动:焚标引爆");
});
