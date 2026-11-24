import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createHeroStats } from '../../src/systems/hero/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';
import { createUnlockSystem } from '../../src/systems/progression/index.js';

function setup({ hero = {}, ports, ...run } = {}) {
  const game = {
    wave: 1, gold: 0, shake: 0, seal: null, subSeals: [],
    metaLoadout: { main: null, aux: [] },
    ...run,
    hero: {
      x: 4, y: 7, lv: 1, baseMaxHp: 220, maxHp: 220, hp: 220,
      realm: 0, gear: [], skills: {}, perks: {}, combos: {}, breakthroughs: {},
      destinyEnhancements: {},
      ...hero,
    },
  };
  const ctx = createRuntimeContext({ game, ports });
  const unlock = createUnlockSystem(ctx);
  const meta = createMetaSystem(ctx);
  return { game, hero: game.hero, ctx, unlock, stats: createHeroStats(ctx, { unlock, meta }) };
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${expected}, got ${actual}`);
}

function seal(elem, star, route) {
  return { kind: elem, elem, star, route };
}

test('unlock queries use the wave and breakthrough flags and update the current hero realm', () => {
  const { game, hero, ctx, unlock } = setup();
  const starterSkills = ['blades', 'firewave', 'nova', 'berserk'];
  const w6Skills = [...starterSkills, 'thunder'];
  const fullSkills = [...w6Skills, 'stomp'];
  for (const [wave, breakthroughs, idx, id, label, skills, shopTier] of [
    [1, {}, 0, 'w1_start', '炼气·初探', starterSkills, 1],
    [6, {}, 1, 'w6_node', '筑基·成型', w6Skills, 2],
    [10, {}, 1, 'w6_node', '筑基·成型', w6Skills, 2],
    [10, { w10: true }, 2, 'w10_breakthrough', '金丹·一破', fullSkills, 3],
    [16, {}, 1, 'w6_node', '筑基·成型', w6Skills, 3],
    [16, { w10: true }, 3, 'w16_node', '元婴·预备', fullSkills, 3],
    [20, { w10: true }, 3, 'w16_node', '元婴·预备', fullSkills, 3],
    [20, { w10: true, w20: true }, 4, 'w20_breakthrough', '化神·二破', fullSkills, 3],
  ]) {
    game.wave = wave;
    hero.breakthroughs = breakthroughs;
    hero.realm = -1;
    const node = unlock.getActiveUnlockNode();
    assert.equal(node.id, id);
    assert.equal(hero.realm, idx);
    assert.equal(unlock.getRealm(), node);
    assert.equal(unlock.getRealm(null), node);
    assert.equal(unlock.getRealmStageLabel(), label);
    assert.deepEqual(unlock.getUnlockedSkillPool(), skills);
    assert.equal(unlock.getShopTier(), shopTier);
  }
  assert.equal(unlock.getRealm(-1).id, 'w1_start');
  assert.equal(unlock.getRealm(99).id, 'w20_breakthrough');
  assert.equal(hero.realm, 4);
  unlock.getUnlockedSkillPool().pop();
  assert.deepEqual(unlock.getUnlockedSkillPool(), fullSkills);

  ctx.setGame({ wave: 1, hero: {}, shopTierBonus: 1 });
  assert.equal(unlock.getShopTier(), 2);
  assert.equal(ctx.game.hero.realm, 0);
  ctx.game.shopTierBonus = 9;
  assert.equal(unlock.getShopTier(), 3);
  ctx.setGame(null);
  assert.equal(unlock.getActiveUnlockNode().id, 'w1_start');
});

test('artifact overclock adds a sub-seal slot at Lv.1 and a main-seal star at Lv.2 within the global caps', () => {
  const { game, hero, unlock } = setup();
  for (const [wave, breakthroughs, level, stars, slots] of [
    [1, {}, 0, 2, 0], [1, {}, 1, 2, 1], [1, {}, 2, 3, 1],
    [6, {}, 0, 3, 1], [6, {}, 1, 3, 2], [6, {}, 2, 4, 2],
    [10, { w10: true }, 2, 5, 2], [16, { w10: true }, 2, 5, 2],
  ]) {
    game.wave = wave;
    hero.breakthroughs = breakthroughs;
    hero.perks.artifact_overclock = level;
    assert.equal(unlock.getSealStarCap(), stars);
    assert.equal(unlock.getSubSealSlotCap(), slots);
  }
});

test('pending decisions include each blocker while the intro and claimed destiny offers allow play', () => {
  const { ctx, unlock } = setup();
  for (const [state, pending] of [
    [null, false],
    [{}, false],
    [{ activeModal: { type: 'intro' }, pendingModals: [], chests: [] }, false],
    [{ activeModal: { type: 'levelup' } }, true],
    [{ pendingModals: [{ type: 'chest' }] }, true],
    [{ pendingBreakthrough: 'w20' }, true],
    [{ destiny: { pendingOffer: { claimed: false } } }, true],
    [{ destiny: { pendingOffer: { claimed: true } } }, false],
    [{ chests: [{}] }, true],
  ]) {
    ctx.setGame(state);
    assert.equal(unlock.hasPendingDecision(), pending);
  }
});

test('main seals, sub-seals and elemental gear contribute their own synergy weights', () => {
  const { game, hero, stats } = setup();
  assert.deepEqual(stats.getSynergyCounts(), { wind: 0, fire: 0, frost: 0, thunder: 0, holy: 0 });
  const fire = seal('fire', 1);
  const frost = seal('frost', 3);
  game.subSeals = [fire, frost];
  hero.gear = ['iron_whetstone#3', { baseKey: 'wood_talisman', enhanceLv: 4 }];
  for (const [stars, weight, tier] of [[1, 1, 0], [3, 2, 1], [5, 4, 2]]) {
    game.seal = seal('wind', stars);
    assert.deepEqual(stats.getSynergyCounts(), { wind: weight, fire: 1, frost: 2, thunder: 1, holy: 1 });
    assert.equal(stats.getSynergyTier('wind'), tier);
  }
  assert.equal(stats.getSubSeal('fire'), fire);
  assert.equal(stats.getSubSeal('frost'), frost);
  assert.equal(stats.getSubSeal('holy'), null);
});

test('dual resonances need weight two in both elements and holy can match any other element', () => {
  const { game, hero, stats } = setup({ seal: seal('holy', 3) });
  hero.gear = ['bronze_tassel'];
  assert.equal(stats.hasDualRes('holy_omni'), false);
  for (const elem of ['wind', 'fire', 'frost', 'thunder']) {
    game.subSeals = [seal(elem, 3)];
    assert.deepEqual(stats.getActiveDualResonances().map(r => r.key), ['holy_omni']);
  }
  game.seal = seal('wind', 3);
  game.subSeals = [seal('fire', 3), seal('frost', 3)];
  assert.deepEqual(stats.getActiveDualResonances().map(r => r.key), ['wind_fire', 'wind_frost']);
  assert.equal(stats.hasDualRes('wind_fire'), true);
  assert.equal(stats.hasDualRes('holy_omni'), false);
});

test('gear sets activate at two pieces and use their three-piece bonus at three pieces', () => {
  const { hero, stats } = setup();
  hero.gear = ['bronze_tassel#2', 'wood_talisman'];
  assert.deepEqual(stats.getGearSetCounts(), { sword: 1, blood: 1 });
  assert.deepEqual(stats.getGearSetCounts(['coin_pouch']), { greed: 1 });
  assert.deepEqual(stats.getActiveGearSets(), []);
  assert.equal(stats.gearSetTier('sword'), 0);

  hero.gear.push({ baseKey: 'swift_boots', enhanceLv: 2 });
  const [duo] = stats.getActiveGearSets();
  assert.deepEqual([duo.key, duo.count, duo.tier, duo.desc], ['sword', 2, 2, duo.d2]);
  assert.equal(stats.gearSetTier('sword'), 2);

  hero.gear.push('split_bow');
  const [trio] = stats.getActiveGearSets();
  assert.deepEqual([trio.key, trio.count, trio.tier, trio.desc], ['sword', 3, 3, trio.d3]);
  assert.equal(stats.gearSetTier('sword'), 3);
});

test('combos require the right unlock tier, two owned skills and three total levels, and announce only once', () => {
  const calls = [];
  const { game, hero, stats } = setup({
    hero: { skills: { blades: 2, firewave: 1 } },
    ports: {
      audio: { play: (...args) => calls.push(['audio', game.shake, ...args]) },
      vfx: { addRing: (...args) => calls.push(['vfx', game.shake, ...args]) },
      ui: { showBanner: (...args) => calls.push(['ui', ...args]) },
    },
  });

  stats.refreshCombos();
  assert.deepEqual(hero.combos, {});
  game.wave = 6;
  hero.skills = { blades: 3 };
  stats.refreshCombos();
  assert.deepEqual(hero.combos, {});
  hero.skills = { blades: 1, firewave: 1 };
  stats.refreshCombos();
  assert.deepEqual(hero.combos, {});
  assert.deepEqual(calls, []);

  hero.skills.blades = 2;
  stats.refreshCombos();
  assert.deepEqual(hero.combos, { wanjian: true });
  assert.equal(game.shake, 7);
  assert.deepEqual(calls, [
    ['audio', 0, 'level', 1.15],
    ['vfx', 7, 4, 7, '#ffe878', 3.4],
    ['ui', '✨ 组合技觉醒 · 【万剑诀】！', '【W6节点+两技总等级≥3觉醒】每 2.4s 环绕飞刃向周围齐射穿透剑气（60% 剑波伤）', 'good'],
  ]);
  calls.length = 0;
  game.shake = 0;
  stats.refreshCombos();
  assert.deepEqual(calls, []);
  assert.equal(game.shake, 0);

  game.wave = 10;
  hero.skills.thunder = 2;
  stats.refreshCombos();
  assert.deepEqual(hero.combos, { wanjian: true });
  hero.breakthroughs.w10 = true;
  stats.refreshCombos(false);
  assert.deepEqual(hero.combos, { wanjian: true, thunder_fire: true });
  assert.deepEqual(calls, []);
  assert.equal(game.shake, 0);
});

test('gear aggregation multiplies legacy stars and instance base stats while scaling independent affixes separately', () => {
  const { hero, stats } = setup();
  const cup = {
    baseKey: 'greed_cup', uid: 'cup', sourceStage: 2, enhanceLv: 2,
    affixes: [{ id: 'vamp_siphon' }, { id: 'frost_ward', tier: 2 }, { id: 'fire_chain', tier: 2 }],
  };
  const gear = ['coin_pouch#2', cup, 'titan_crown'];
  near(stats.aggregateGear(gear.slice(0, 2)).dmgPct, 0.644864);
  near(stats.aggregateGear(gear).dmgPct, 1.4716936);
  hero.perks.dao_fortune = 1;
  near(stats.aggregateGear(gear).dmgPct, 1.4716936);
  hero.perks.dao_fortune = 2;
  const gm = stats.aggregateGear(gear);
  near(gm.dmgPct, 1.810617);
  near(gm.lifesteal, 2.32);
  near(gm.markedDmgPct, 0.1856);
  assert.equal(gm.flatHp, 38);
  assert.equal(gm.frostShieldCapBonus, 33);
  assert.equal(gm.burnKillHeal, 3);
  assert.equal(gm.bonusGold, 7);

  const cursed = stats.aggregateGear(['asura_blood#3', 'split_bow#3', 'heavy_greatsword#3']);
  assert.equal(cursed.extraShot, 1);
  assert.equal(cursed.hpPct, -0.20);
  assert.equal(cursed.aspd, -0.15);
});

test('gear aggregation clamps stacking probabilities and takes the strongest slow and fire mark', () => {
  const { stats } = setup();
  const affixes = [{ id: 'iron_bastion', tier: 10 }, { id: 'fortune_mint', tier: 10 }];
  const gm = stats.aggregateGear([
    'frost_orb#3', 'thunder_wood#3',
    { baseKey: 'volt_crest', enhanceLv: 2, affixes: [...affixes, { id: 'fire_brand', tier: 10 }] },
    { baseKey: 'bronze_tassel', affixes: [...affixes, { id: 'fire_brand', tier: 1 }] },
  ]);
  assert.equal(gm.slowOnHit, 0.65);
  assert.equal(gm.chainProc, 0.8);
  assert.equal(gm.dmgReduce, 0.35);
  assert.equal(gm.bonusGoldChance, 0.85);
  assert.equal(gm.fireMarkChance, 0.95);
  assert.equal(stats.aggregateGear([
    { baseKey: 'bronze_tassel', affixes: [{ id: 'frost_chill' }] },
    { baseKey: 'bronze_tassel', affixes: [{ id: 'frost_chill', tier: 2 }] },
  ]).slowOnHit, 0.26);
});

test('syncHeroMaxHp clamps on gear removal and heals only when a max-HP increase explicitly requests it', () => {
  const { hero, stats } = setup({ hero: { hp: 100 } });
  hero.gear = ['wood_talisman'];
  stats.syncHeroMaxHp();
  assert.deepEqual([hero.hp, hero.maxHp], [100, 265]);
  hero.gear = [];
  stats.syncHeroMaxHp();
  assert.deepEqual([hero.hp, hero.maxHp], [100, 220]);

  hero.gear = ['wood_talisman'];
  stats.syncHeroMaxHp({ healDelta: true });
  assert.deepEqual([hero.hp, hero.maxHp], [145, 265]);
  stats.syncHeroMaxHp({ healDelta: true });
  assert.equal(hero.hp, 145);
  hero.destinyEnhancements.destiny_aegis_bulwark = true;
  stats.syncHeroMaxHp({ healDelta: true });
  assert.deepEqual([hero.hp, hero.maxHp], [235, 355]);

  hero.hp = 350;
  hero.gear = [];
  stats.syncHeroMaxHp(null);
  assert.deepEqual([hero.hp, hero.maxHp], [310, 310]);
  hero.destinyEnhancements.destiny_aegis_bulwark = false;
  stats.syncHeroMaxHp({ healDelta: true });
  assert.deepEqual([hero.hp, hero.maxHp], [220, 220]);
});

test('hero stats apply blood oath at half health, cap gold power and gate mono mastery by owned skills', () => {
  const { game, hero, stats } = setup({
    gold: 900, hero: { hp: 110, perks: { blood_oath: 2, gold_power: 2, mono_mastery: 2 }, skills: { blades: 1, firewave: 1, nova: 1, stomp: 0 } },
  });
  const hs = stats.getHeroStats();
  near(hs.dmgMult, 2.53);
  near(hs.aspd, 1.35);
  assert.equal(hs.lifesteal, 10);
  assert.equal(hs.mmActive, true);
  near(hs.skillDmgMult, 3.9215);
  near(hs.skillRangeMult, 1.15);
  near(hs.skillCdMult, 0.80);

  hero.skills.stomp = 1;
  assert.equal(stats.getHeroStats().mmActive, false);
  near(stats.getHeroStats().skillDmgMult, 2.53);
  hero.hp = 111;
  assert.equal(stats.getHeroStats().aspd, 1);
  assert.equal(stats.getHeroStats().lifesteal, 8);

  game.gold = 149;
  hero.hp = 110;
  hero.perks = { blood_oath: 1, gold_power: 1, mono_mastery: 1 };
  hero.skills = { blades: 1, firewave: 1, nova: 0 };
  const lv1 = stats.getHeroStats();
  near(lv1.dmgMult, 1.72);
  near(lv1.skillDmgMult, 2.236);
  near(lv1.skillRangeMult, 1.08);
  assert.equal(lv1.skillCdMult, 1);
  hero.skills.nova = 1;
  assert.equal(stats.getHeroStats().mmActive, false);
});

test('hero crit surge converts dash crit overflow to critical damage at the correct rate', () => {
  const { hero, stats } = setup({ hero: { perks: { crit_surge: 2, wind_gale: 1 } } });
  near(stats.getHeroStats().crit, 0.37);
  near(stats.getHeroStats().critDmg, 1.75);
  hero.dashBuffT = 1;
  assert.equal(stats.getHeroStats().crit, 1);
  near(stats.getHeroStats().critDmg, 2.86);
  hero.perks.crit_surge = 1;
  assert.equal(stats.getHeroStats().crit, 1);
  near(stats.getHeroStats().critDmg, 2.29);
});

test('hero stats combine destiny enhancements, shielded modifiers and the wind main legacy', () => {
  const { game, hero, stats } = setup({
    metaLoadout: { main: 'main_wind', aux: [] },
    hero: {
      gear: [{ baseKey: 'bronze_tassel', enhanceLv: 2, affixes: [{ id: 'frost_nova_counter', tier: 1 }] }],
      shield: 1, destinyDashBuffT: 1, destinyFrostMoveT: 1,
      destinyEnhancements: {
        destiny_golden_temper: true, destiny_resonance_crown: true,
        destiny_phantom_stride: true, destiny_glacial_aegis: true,
      },
    },
  });
  const hs = stats.getHeroStats();
  near(hs.dmgMult, 1.2948);
  near(hs.aspd, 1.2404);
  near(hs.skillDmgMult, 1.501968);
  near(hs.crit, 0.32);
  near(hs.critDmg, 2);
  near(hs.moveSpd, 6.66176);
  near(hs.magnet, 3.7);
  game.metaLoadout.main = null;
  hero.destinyDashBuffT = 0;
  hero.destinyFrostMoveT = 0;
  hero.shield = 0;
  near(stats.getHeroStats().magnet, 2.9);
  near(stats.getHeroStats().crit, 0.12);
  near(stats.getHeroStats().moveSpd, 5.6);
  near(stats.getHeroStats().dmgMult, 1.1788);
});

test('each 3-star seal keeps the distinct standard and mastery stats', () => {
  const { game, stats } = setup();
  assert.equal(stats.getSealStats(), null);
  for (const [elem, standard, mastery] of [
    ['wind',    [40, 0.35328, 0, 4, 0, 2, 2, 1.75],    [34, 0.3456, 0, 5, 0, 4, 2, 1.75]],
    ['fire',    [89, 0.92, 2.4, 1, 0, 0, 2, 1.75],      [76, 1, 3, 1, 0, 0, 2, 1.75]],
    ['frost',   [45, 0.7728, 2.55, 1, 0, 0, 2, 1.75],   [38, 0.84, 2.55, 1, 0, 0, 2, 1.75]],
    ['thunder', [61, 0.736, 0, 1, 8, 0, 2, 1.75],      [52, 0.8, 0, 1, 10, 0, 2, 1.75]],
    ['holy',    [64, 0.55936, 0, 1, 0, 0, 3, 1.75],     [54, 0.608, 0, 1, 0, 0, 4, 1.95]],
  ]) {
    for (const [route, expected] of [['standard', standard], ['mastery', mastery]]) {
      game.seal = seal(elem, 3, route);
      const ss = stats.getSealStats();
      assert.equal(ss.route, route);
      const actual = [ss.dmg, ss.cd, ss.splash, ss.shots, ss.chains, ss.pierce, ss.beams, ss.critDmg];
      actual.forEach((value, index) => near(value, expected[index]));
      if (elem === 'frost') assert.deepEqual([ss.slow, ss.slowDur], [0.54, 3.2]);
    }
  }
  const candidate = stats.getSealStats(seal('wind', 2, 'mastery'));
  assert.deepEqual([candidate.route, candidate.shots, candidate.pierce], [null, 3, 1]);
  assert.equal(stats.getSealStats(null), null);
});

test('seal stats combine sub-seal resonance, dual resonance, essence, overclock and destiny cooldown', () => {
  const { hero, game, stats } = setup({
    seal: seal('fire', 3, 'mastery'),
    subSeals: [seal('wind', 3), seal('frost', 3)],
    hero: { perks: { artifact_overclock: 2 }, sealEssenceBonus: 0.2, destinyEnhancements: { destiny_resonance_crown: true } },
  });
  const ss = stats.getSealStats();
  assert.equal(ss.dmg, 112);
  near(ss.cd, 0.3612);
  assert.equal(ss.range, 6.24);
  assert.equal(ss.shots, 2);
  near(ss.splash, 4.992);
  assert.deepEqual([ss.slow, ss.slowDur, ss.burn], [0.55, 2.2, 20]);
  near(stats.getHeroStats().moveSpd, 6.44);

  game.seal = seal('wind', 1);
  game.subSeals = [seal('fire', 3), seal('holy', 3)];
  hero.perks = {};
  hero.sealEssenceBonus = 0;
  hero.destinyEnhancements = {};
  const wind = stats.getSealStats();
  assert.deepEqual([wind.dmg, wind.burn], [19, 30]);
  near(wind.crit, 0.49);
  game.seal.star = 3;
  near(stats.getSealStats().critDmg, 2);
});
