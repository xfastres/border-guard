import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createCombatCore, createCombatHooks, isEnemyUnstoppable } from '../../src/systems/combat/index.js';

function setup({ seed = 123, wave = 30, main = null, aux = [], gear = {}, gearSynergy = {}, seals = {}, sets = {}, perks = {}, ports = {} } = {}) {
  const draws = [];
  const rng = mulberry32(seed);
  const game = {
    rnd() {
      const draw = rng();
      draws.push(draw);
      return draw;
    },
    wave, phase: 'wave', waveClock: 0, nextEnemyId: 1, shake: 0,
    hero: {
      x: 10, y: 10, hp: 100, maxHp: 1000, baseMaxHp: 1000, moving: true, invuln: 0,
      shield: 0, gear: [], perks, skills: {}, vouchers: {}, breakthroughs: {}, destinyEnhancements: {}, bloodKills: 0,
      combatStateStats: { fireMarksApplied: 0, fireDetonations: 0, frostSlowsApplied: 0, frostPulsesTriggered: 0, frostShieldGained: 0, w10BranchProcs: 0 },
    },
    stats: { dmgTotal: 0, kills: 0, elites: 0, skillDmg: { perk: 0 } },
    w30Battle: {
      elapsedSeconds: 12.345, phaseTimeline: [], signatureHitsDuringLock: 0,
      signatureStatusHitsDuringLock: { fireMarks: 0, fireDetonations: 0, frostSlows: 0, frostPulses: 0, frostShieldGained: 0 },
    },
    curWaveTel: { ehpTotal: 0 }, waveQueue: [],
    enemies: [], zones: [], bolts: [], healOrbs: [], floats: [], rings: [], projectiles: [], gems: [], chests: [],
  };
  const resources = [];
  const clears = [];
  const cues = [];
  const ctx = createRuntimeContext({ game, ports: {
    vfx: {
      addFloat: (...args) => ctx.game.floats.push(args),
      addRing: (...args) => ctx.game.rings.push(args),
    },
    audio: { play: (...args) => cues.push(args) },
    ...ports,
  } });
  const deps = {
    meta: { getActiveMetaMain: () => main, hasMetaAux: key => aux.includes(key) },
    equipment: { getActiveGearAffixSynergies: () => gearSynergy },
    hero: {
      getHeroStats: () => ({ skillDmgMult: 1, dmgMult: 1, crit: 0, critDmg: 1.7, gm: gear }),
      aggregateGear: () => gear,
      getSynergyCounts: () => seals,
      getSynergyTier: key => seals[key] || 0,
      getSubSeal: () => null,
      gearSetTier: key => sets[key] || 0,
      hasDualRes: () => false,
      syncHeroMaxHp: () => { game.hero.maxHp = game.hero.baseMaxHp; },
    },
    economy: {
      changeGold: (...args) => resources.push(['gold', ...args]),
      changeMaterials: (...args) => resources.push(['materials', ...args]),
      getEnemyMaterialDrop: () => 3,
    },
    simulation: { pushProjectile: p => game.projectiles.push(p), triggerSealOnHeroHit() {} },
    run: { completeWaveClear: () => clears.push({
      live: game.enemies.length, projectiles: game.projectiles.length, zones: game.zones.length,
      orbs: game.healOrbs.length, queue: game.waveQueue.map(item => item.spawned),
    }) },
  };
  const combat = createCombatCore(ctx, deps);
  function enemy(options = {}) {
    const e = {
      id: game.nextEnemyId++, kind: 'grunt', x: 10, y: 10, hp: 1000, maxHp: 1000, shield: 0,
      r: 0.3, gold: 2, xp: 8, dmg: 20, slow: 0, slowT: 0, freezeT: 0, burnDps: 0, burnT: 0, ...options,
    };
    game.enemies.push(e);
    return e;
  }
  function w20(directionKey, enhancementKey) {
    game.hero.vouchers.w20 = true;
    game.hero.breakthroughs.w20 = { completed: true, directionKey, enhancementKey };
  }
  return { combat, ctx, deps, game, enemy, w20, draws, resources, clears, cues };
}

test('fire mark caps stacks, applies the flame legacy duration and counts locked hits on the current run', () => {
  const { combat, ctx, game, enemy } = setup({ main: { id: 'main_flame', effects: { fireMarkDurationBonus: 1.5 } } });
  const boss = enemy({ kind: 'boss6', signatureLockActive: true });
  assert.equal(combat.applyFireMark(boss, { stacks: 2, duration: 6, source: 'test' }), true);
  assert.equal(combat.applyFireMark(boss, 2, 'w10'), true);
  assert.equal(combat.applyFireMark({ hp: 0 }), false);
  assert.deepEqual([boss.fireMarkStacks, boss.fireMarkT, boss.fireMarkSource], [3, 7.5, 'w10']);
  assert.equal(game.w30Battle.signatureStatusHitsDuringLock.fireMarks, 2);
  assert.equal(game.hero.combatStateStats.fireMarksApplied, 2);
  const nextRun = { stats: {} };
  ctx.setGame(nextRun);
  assert.equal(combat.applyFireMark({ hp: 1 }), true);
  assert.equal(nextRun.stats.fireMarksApplied, 1);
  assert.equal(game.stats.fireMarksApplied, 2);
});

test('fire trio transfers to marked targets in order and focuses unused hops on a lone boss', () => {
  const { combat, game, enemy } = setup({ gearSynergy: { hasFireTrio: true } });
  const start = enemy({ fireMarkT: 5 });
  const next = enemy({ x: 13, fireMarkT: 5 });
  const last = enemy({ x: 16, fireMarkT: 5 });
  assert.equal(combat.triggerFireDetonation(start, 100), 239);
  assert.deepEqual([start.hp, next.hp, last.hp], [900, 922, 939]);
  assert.deepEqual(game.bolts.map(bolt => bolt.pts.map(p => p.x)), [[10, 13], [13, 16]]);
  assert.equal(game.stats.fireChainTransfers, 2);
  const boss = enemy({ x: 25, boss: true });
  assert.equal(combat.isIsolatedHighValueTarget(boss), true);
  assert.equal(combat.triggerFireDetonation(boss, 100), 190);
  assert.equal(game.stats.fireFocusedDetonations, 1);
});

test('fire chain guard blocks nested transfers and resets even when a hop throws', () => {
  const { ctx, deps, enemy, game } = setup({ gearSynergy: { hasFireTrio: true } });
  const start = enemy({ fireMarkT: 5 });
  const hop = enemy({ x: 13, fireMarkT: 5 });
  const nested = enemy({ x: 20, fireMarkT: 5 });
  enemy({ x: 23, fireMarkT: 5 });
  const failure = new Error('hop failed');
  const hooks = createCombatHooks(ctx, { ...deps, damage: {
    isEnemyUnstoppable,
    dealDamage(target, amount) {
      if (target === hop) {
        assert.equal(ctx.counters.inFireChainTransfer, true);
        assert.equal(hooks.triggerFireDetonation(nested, 100), 100);
        throw failure;
      }
      return amount;
    },
  } });
  assert.throws(() => hooks.triggerFireDetonation(start, 100), error => error === failure);
  assert.equal(ctx.counters.inFireChainTransfer, false);
  assert.equal(game.stats.fireChainTransfers, 1);
  assert.equal(game.bolts.length, 1);
});

test('W20 聚焰 pulls and marks a nearby enemy, with a supernova zone at the hop', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('fire_chain_surge', 'w20_fire_supernova_chain');
  const start = enemy();
  const target = enemy({ x: 13.25 });
  const boss = enemy({ x: 7, boss: true });
  combat.triggerFireDetonation(start, 100);
  assert.equal(target.x, 12.5);
  assert.equal(target.fireMarkSource, 'w20_fire_pull');
  assert.equal(boss.x, 7);
  assert.equal(boss.fireMarkSource, 'w20_fire_pull');
  assert.equal(game.stats.w20FirePulls, 1);
  assert.equal(game.stats.w20BaseProcs, 1);
  assert.deepEqual(game.zones.map(z => [z.kind, z.x, z.dps]), [['lava', 12.5, 27]]);
});

test('W20 孤星焚核 applies vulnerability and both focus hits', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('fire_chain_surge', 'w20_fire_isolated_exec');
  const boss = enemy({ boss: true });
  assert.equal(combat.triggerFireDetonation(boss, 100), 296);
  assert.equal(boss.vulnT, 3.5);
  assert.equal(game.stats.w20EnhancementProcs, 1);
});

test('W20 聚焰漩涡 creates its zone and 余烬散射 launches four fire-marking projectiles', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('fire_chain_surge', 'w20_fire_mark_vortex');
  combat.triggerFireDetonation(enemy(), 100);
  assert.deepEqual(game.zones.map(z => [z.kind, z.r, z.dps]), [['fireVortex', 2.8, 28]]);
  w20('fire_chain_surge', 'w20_fire_ember_barrage');
  const source = enemy({ x: 20 });
  combat.triggerFireDetonation(source, 100);
  assert.equal(game.projectiles.length, 4);
  assert.ok(game.projectiles.every(p => p.opts.applyFireMarkOnHit && p.hitSet.has(source.id) && p.dmg === 42));
});

test('W20 灵韵回响 triggers on the third fire detonation and applies both elements and a shield', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('fire_chain_surge', 'w20_shared_elemental_echo');
  const target = enemy();
  const far = enemy({ x: 20 });
  for (let i = 0; i < 3; i++) {
    target.fireDetonateCd = 0;
    combat.triggerFireDetonation(target, 100, { consumeMark: true });
  }
  assert.equal(game.hero.w20EchoFireCnt, 0);
  assert.equal(game.hero.shield, 18);
  assert.equal(target.fireMarkSource, 'w20_shared_elemental_echo');
  assert.equal(target.frostBrandSource, 'w20_shared_elemental_echo');
  assert.equal(far.hp, 1000);
  assert.equal(game.stats.w20EnhancementProcs, 1);
  assert.equal(combat.triggerW20ElementalEcho(), 1);
});

test('destiny ember primes one detonation, then consumes its single damage boost', () => {
  const { combat, game, enemy } = setup();
  game.hero.destinyEnhancements.destiny_ember_echo = true;
  const targets = [enemy(), enemy({ x: 20 }), enemy({ x: 30 })];
  assert.deepEqual(targets.map(e => combat.triggerFireDetonation(e, 100)), [100, 118, 100]);
  assert.equal(targets[0].fireMarkSource, 'destiny_ember_echo');
  assert.equal(game.hero.destinyEmberNextBoost, false);
  assert.equal(game.stats.destinyEnhancementProcs, 2);
});

test('frost slow preserves unstoppable immunity and applies the frost legacy duration during W30 lock', () => {
  const { combat, game, enemy } = setup({ main: { id: 'main_frost', effects: { frostSlowDurationBonus: 1.2 } } });
  for (const aiState of ['windup', 'leap', 'charge']) {
    const target = enemy({ aiState });
    assert.equal(isEnemyUnstoppable(target), true);
    assert.equal(combat.applyFrostSlow(target), false);
    assert.equal(target.slowT, 0);
  }
  const boss = enemy({ kind: 'boss6', aiState: 'signature', signatureLockActive: true });
  assert.equal(combat.isEnemyUnstoppable(boss), false);
  assert.equal(combat.applyFrostSlow(boss, { slow: 0.7, duration: 5, source: 'test' }), true);
  assert.deepEqual([boss.slow, boss.slowT, boss.frostBrandSource], [0.7, 6.2, 'test']);
  assert.equal(game.w30Battle.signatureStatusHitsDuringLock.frostSlows, 1);
  assert.equal(game.hero.combatStateStats.frostSlowsApplied, 1);
});

test('frost shield composes gear, W20 and destiny caps and accumulates incoming shield for W20 ward', () => {
  const { combat, game, w20 } = setup({
    gear: { frostShieldCapBonus: 7 }, gearSynergy: { hasFrostDuo: true, hasFrostTrio: true },
    main: { id: 'main_frost', effects: { frostShieldDurationBonus: 1.1 } },
  });
  w20('frost_bastion_counter', 'w20_frost_pillar_ward');
  game.hero.destinyEnhancements.destiny_glacial_aegis = true;
  assert.equal(combat.getHeroMaxFrostShield(), 197);
  assert.equal(combat.getHeroMaxFrostShield(150), 232);
  game.hero.shield = 185;
  assert.equal(combat.gainFrostShield(39, { noFullShieldPulse: true }), 12);
  assert.equal(game.zones.length, 0);
  assert.equal(combat.gainFrostShield(1, { noFullShieldPulse: true }), 0);
  assert.equal(game.hero.shield, 197);
  assert.equal(game.hero.shieldTimer, 6.1);
  assert.equal(game.hero.w20ShieldPillarAccum, 0);
  assert.deepEqual(game.zones.map(z => [z.kind, z.w20Source, z.t]), [['frostTrail', 'w20_frost_pillar_ward', 3.2]]);
});

test('shield-hit and dash frost pulses have independent cooldowns', () => {
  const { combat, game, enemy, w20 } = setup({ gearSynergy: { hasFrostTrio: true } });
  w20('frost_bastion_counter');
  enemy();
  assert.equal(combat.triggerFrostPulse(2.8, 36, 0.9, 'shield_hit'), 1);
  assert.equal(combat.triggerFrostPulse(2.8, 36, 0.9, 'dash_shield'), 1);
  assert.equal(combat.triggerFrostPulse(2.8, 36, 0.9, 'shield_hit'), 0);
  assert.equal(combat.triggerFrostPulse(2.8, 36, 0.9, 'full_shield_refresh'), 0);
  assert.equal(game.hero.frostPulseCd, 0.55);
  assert.equal(game.hero.frostActivePulseCd, 1.15);
  assert.equal(game.hero.shield, 20);
});

test('W20 寒甲反噬 widens the counter, extends freeze and launches three shards', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('frost_bastion_counter', 'w20_frost_aegis_thorns');
  const target = enemy({ x: 14 });
  assert.equal(combat.triggerFrostPulse(2.8, 36, 0.9, 'shield_hit'), 1);
  assert.equal(target.freezeT, 1.4);
  assert.equal(game.hero.shield, 14);
  assert.deepEqual(game.projectiles.map(p => p.dmg), [31, 31, 31]);
});

test('W20 碎冰回响 damages nearby enemies on a pulse against a previously chilled target', () => {
  const { combat, enemy, w20 } = setup();
  w20('frost_bastion_counter', 'w20_frost_shatter_echo');
  const target = enemy({ x: 12.5, slowT: 1 });
  const splash = enemy({ x: 13.5 });
  assert.equal(combat.triggerFrostPulse(), 1);
  assert.deepEqual([target.hp, splash.hp], [944, 980]);
  assert.equal(splash.frostBrandSource, 'w20_frost_shatter_echo');
});

test('full shield refresh uses overflow damage and fires six W20 满盾超载震 shards', () => {
  const { combat, game, enemy, w20 } = setup();
  w20('frost_bastion_counter', 'w20_frost_overflow_nova');
  game.hero.shield = 120;
  const target = enemy();
  assert.equal(combat.gainFrostShield(20), 5);
  assert.equal(game.hero.shield, 125);
  assert.equal(target.hp, 933);
  assert.equal(game.stats.frostFullShieldPulses, 1);
  assert.deepEqual(game.projectiles.map(p => p.dmg), Array(6).fill(48));
  assert.equal(combat.gainFrostShield(20), 0);
  assert.equal(game.projectiles.length, 6);
});

test('spawn position reads live viewport dimensions, reflects from the edge and keeps seeded draws', () => {
  let camera = { w: 1760, h: 880, zoom: 1 };
  const makeRun = () => setup({ ports: { viewport: { getCamera: () => camera } } });
  const first = makeRun();
  first.game.hero.x = 1;
  first.game.hero.y = 24;
  const reflected = first.combat.spawnPosAroundHero('west');
  assert.equal(reflected.x, 22.6);
  assert.ok(Math.abs(reflected.y - 30.66423766166) < 1e-10);
  const second = makeRun();
  second.game.hero.x = 1;
  second.game.hero.y = 24;
  assert.deepEqual(second.combat.spawnPosAroundHero('west'), reflected);
  camera = { w: 1760, h: 880, zoom: 2 };
  const zoomed = first.combat.spawnPosAroundHero();
  assert.equal(zoomed.x, 12.6);
  assert.ok(Math.abs(zoomed.y - 23.92036373867) < 1e-10);
  assert.equal(first.draws.length, 3);
});

test('elite spawning draws position, affixes and AI timers in order and applies wave scaling', () => {
  const { combat, game, draws } = setup({ wave: 24 });
  const elite = combat.spawnEnemy('elite', 'east', 2.5);
  assert.deepEqual(elite.affixes.map(a => a.key), ['sprint', 'shield', 'volley']);
  assert.deepEqual([elite.hp, elite.maxHp, elite.dmg, elite.spd, elite.baseSpd], [650, 650, 42, 1.74, 1.74]);
  assert.equal(elite.aiCd, 2.5261082428973167);
  assert.equal(elite.affixTimer, 3.400024612806737);
  assert.equal(draws.length, 6);
  assert.deepEqual(combat.pickEliteAffixes().map(a => a.key), ['vortex']);
  assert.equal(game.curWaveTel.ehpTotal, 650);
});

test('W30 boss registers 80% and 35% thresholds when spawned at a supplied position', () => {
  const { combat, game, draws } = setup();
  const boss = combat.spawnEnemy('boss6', null, 1, { x: 16, y: 15 });
  assert.deepEqual([boss.x, boss.y], [16, 15]);
  assert.deepEqual([boss.signatureThresholdHp, boss.finalThresholdHp], [11040000, 4830000]);
  assert.deepEqual([game.w30Battle.bossId, game.w30Battle.bossMaxHp, game.w30Battle.signatureThresholdHp, game.w30Battle.finalThresholdHp],
    [boss.id, 13800000, 11040000, 4830000]);
  assert.equal(draws.length, 2);
});

test('W30 threshold truncates damage and locks HP, shield damage and lifesteal while status effects still land', () => {
  const { combat, game, enemy } = setup({ perks: { dual_cataclysm: 2 } });
  const boss = enemy({ kind: 'boss6', boss: true, shield: 50, signatureThresholdHp: 800, finalThresholdHp: 350 });
  assert.equal(combat.dealDamage(boss, 400), 250);
  assert.equal(boss.hp, 800);
  assert.equal(boss.signatureLockActive, true);
  assert.equal(game.w30Battle.signatureTruncatedDmg, 150);
  assert.equal(game.zones[0].kind, 'w30SigTelegraph');
  boss.shield = 60;
  boss.burnT = 4;
  boss.burnDps = 10;
  assert.equal(combat.dealDamage(boss, 9000, { slow: 0.65, applyFireMarkOnHit: true, isThunder: true, lifesteal: 100 }), 0);
  assert.deepEqual([boss.hp, boss.shield, boss.slow, boss.fireMarkStacks], [800, 60, 0.65, 1]);
  assert.equal(game.hero.hp, 100);
  assert.equal(game.stats.dmgTotal, 250);
  assert.equal(game.w30Battle.signatureHitsDuringLock, 1);
  assert.deepEqual(game.w30Battle.signatureStatusHitsDuringLock, { fireMarks: 1, fireDetonations: 0, frostSlows: 1, frostPulses: 0, frostShieldGained: 0 });
});

test('released W30 boss enters final phase at 35% and spawns exactly one healing orb', () => {
  const { combat, game, enemy } = setup();
  const boss = enemy({ kind: 'boss6', boss: true, hp: 380, baseSpd: 2, bossTimer: 4, signatureTriggered: true, finalThresholdHp: 350 });
  assert.equal(combat.dealDamage(boss, 30), 30);
  assert.equal(game.w30Battle.phase, 'final_combo');
  assert.deepEqual([boss.finalPhaseEntered, boss.frenzied, boss.spd, boss.bossTimer], [true, true, 2.32, 1.4]);
  combat.dealDamage(boss, 10);
  assert.equal(game.healOrbs.length, 1);
  assert.equal(game.w30Battle.healOrbsSpawned, 1);
  assert.equal(game.healOrbs[0].hpPct, 0.18);
});

test('绝对零度 caps missing-health damage on a boss, honors the cooldown and executes frozen non-bosses', () => {
  const { combat, enemy, game } = setup({ perks: { zero_exec: 2 } });
  const boss = enemy({ boss: true, kind: 'boss6', hp: 5000, maxHp: 100000 });
  assert.equal(combat.dealDamage(boss, 100), 340);
  assert.equal(boss.zeroExecCd, 1.5);
  assert.equal(combat.dealDamage(boss, 100), 100);
  const otherBoss = enemy({ boss: true, hp: 5000, maxHp: 100000 });
  assert.equal(combat.dealDamage(otherBoss, 100), 420);
  const target = enemy({ freezeT: 1 });
  assert.equal(combat.dealDamage(target, 1), 1);
  assert.equal(target.hp, 0);
  assert.equal(game.stats.kills, 1);
});

test('雷火劫印 adds its burn burst and only heals from HP damage', () => {
  const { combat, game, enemy } = setup({ perks: { dual_cataclysm: 2 } });
  const target = enemy({ burnT: 4, burnDps: 10, shield: 300 });
  assert.equal(combat.dealDamage(target, 50, { isThunder: true }), 124);
  assert.equal(target.burnT, 3);
  assert.equal(game.hero.hp, 100);
  target.shield = 0;
  assert.equal(combat.dealDamage(target, 50, { isThunder: true }), 118);
  assert.equal(game.hero.hp, 103);
});

test('fire and frost trios each replace the corresponding duo on a single hit', () => {
  for (const trio of [false, true]) {
    const { combat, game, enemy } = setup({ gearSynergy: { hasFireDuo: true, hasFrostDuo: true, hasFireTrio: trio, hasFrostTrio: trio } });
    const target = enemy({ fireMarkT: 5, slowT: 2 });
    combat.dealDamage(target, 10, { fromHero: true });
    assert.deepEqual([game.stats.gearFireDuoProcs, game.stats.gearFireTrioProcs], trio ? [undefined, 1] : [1, undefined]);
    assert.deepEqual([game.stats.gearFrostDuoProcs, game.stats.gearFrostTrioProcs], trio ? [undefined, 1] : [1, undefined]);
    assert.equal(game.hero.shield, trio ? 18 : 14);
  }
});

test('critical hits trigger holy splash, 紫霄天引 and 赤焰 in their original order', () => {
  const { combat, game, enemy, draws, cues } = setup({ seals: { holy: 4 }, sets: { flame: 3 }, perks: { thunder_arc: 2 } });
  const target = enemy({ burnT: 2 });
  const near = enemy({ x: 11 });
  assert.equal(combat.dealDamage(target, 100, { critChance: 1 }), 170);
  assert.equal(target.hp, 736);
  assert.equal(near.hp, 729);
  assert.equal(near.vulnT, 3);
  assert.deepEqual(game.rings.map(r => r[2]), ['#ffe478', '#ff6a38']);
  assert.deepEqual(game.bolts[0].pts.map(p => p.x), [10, 10, 11]);
  assert.deepEqual(cues.map(cue => cue[0]), ['crit', 'thunder']);
  assert.equal(draws.length, 7);
});

test('blood set lifesteal shares its cap across hits and halves it while stationary in battle', () => {
  const { combat, game, enemy } = setup({ sets: { blood: 3 } });
  const target = enemy();
  combat.dealDamage(target, 100, { lifesteal: 100 });
  combat.dealDamage(target, 100, { lifesteal: 200 });
  assert.deepEqual([game.hero.hp, game.hero.leechUsed], [199, 99]);
  assert.equal(combat.applyHeroLifesteal(50), 0);
  game.hero.leechUsed = 0;
  game.hero.moving = false;
  assert.equal(combat.applyHeroLifesteal(100), 50);
  assert.equal(game.hero.hp, 249);
});

test('W20 totem and W30 pillar kills strip their boss shields, with an orb only from the pillar', () => {
  const { combat, game, enemy, draws } = setup();
  const boss4 = enemy({ kind: 'boss4', boss: true, shield: 88 });
  const boss6 = enemy({ kind: 'boss6', boss: true, shield: 99 });
  const totem = enemy({ hp: 0, totem: true, totemBossId: boss4.id });
  const pillar = enemy({ hp: 0, pillar: true, pillarBossId: boss6.id, x: 0, y: 50 });
  combat.onEnemyKilled(totem, {});
  assert.deepEqual([boss4.shield, boss4.vulnT, game.stats.w20TotemsDestroyed], [0, 3, 1]);
  assert.equal(game.healOrbs.length, 0);
  combat.onEnemyKilled(pillar, {});
  combat.onEnemyKilled(pillar, {});
  assert.deepEqual([boss6.shield, boss6.vulnT], [0, 3.5]);
  assert.deepEqual([game.healOrbs[0].x, game.healOrbs[0].y, game.healOrbs[0].shield], [2, 46, 18]);
  assert.equal(draws.length, 1);
  assert.equal(game.stats.kills, 2);
  assert.equal(game.gems.length, 0);
});

test('W30 boss defeat clears the battlefield before invoking wave settlement', () => {
  const { combat, game, enemy, clears, resources } = setup();
  const boss = enemy({ kind: 'boss6', boss: true, hp: 100, signatureTriggered: true, finalPhaseEntered: true });
  enemy();
  game.waveQueue.push({ spawned: false }, { spawned: true });
  game.projectiles.push({});
  game.zones.push({});
  game.healOrbs.push({});
  assert.equal(combat.dealDamage(boss, 100), 100);
  assert.deepEqual(clears, [{ live: 0, projectiles: 0, zones: 0, orbs: 0, queue: [true, true] }]);
  assert.deepEqual(resources, [['gold', 2, 'kill_boss'], ['materials', 3, 'drop_boss_materials']]);
  assert.equal(game.chests.length, 0);
});

test('a burning chilled bomber leaves poison, triggers corpse damage and fires frost shatter projectiles', () => {
  const { combat, game, enemy } = setup({ perks: { fire_nova: 2, frost_shatter: 2 } });
  const bomber = enemy({ kind: 'bomber', name: '煞灵毒虫', hp: 0, bomber: true, maxHp: 200, burnT: 1, slowT: 1 });
  const near = enemy({ x: 11.3 });
  const far = enemy({ x: 13 });
  combat.onEnemyKilled(bomber, {});
  assert.equal(near.hp, 950);
  assert.equal(near.burnDps, 16);
  assert.equal(far.hp, 1000);
  assert.deepEqual([game.zones[0].kind, game.zones[0].dmg, game.zones[0].sourceMeta.attackerKind], ['poisonBomb', 27, 'bomber']);
  assert.equal(game.projectiles.length, 7);
  assert.ok(game.projectiles.every(p => p.hitSet.has(bomber.id) && p.dmg === 24));
});

test('血煞妖王 awards the shrine chest and ledger bonuses and advances the blood set kill bonus', () => {
  const { combat, game, enemy, resources } = setup({ sets: { blood: 2 }, wave: 12, aux: ['aux_shrine_compass'] });
  game.shrine = {};
  combat.onEnemyKilled(enemy({ hp: 0, boss: true, isShrineBoss: true }), {});
  assert.equal(game.shrine.cleared, true);
  assert.equal(game.curWaveTel.shrineCleared, true);
  assert.deepEqual([game.hero.bloodKills, game.hero.maxHp, game.hero.hp], [1, 1012, 302]);
  assert.deepEqual(game.chests, [{ x: 10, y: 10, legend: true, shrineTier: true, bob: 0 }]);
  assert.deepEqual(resources.slice(-2), [['gold', 25, 'shrine_clear'], ['materials', 3, 'shrine_clear']]);
});

test('first elite chest skips RNG and the second chest uses the draw after both XP gem rolls', () => {
  for (const [seed, chestCount] of [[123, 1], [124, 2]]) {
    const { combat, game, enemy, draws, resources } = setup({ seed });
    combat.onEnemyKilled(enemy({ hp: 0, elite: true }), {});
    assert.equal(game.chests.length, 1);
    assert.equal(draws.length, 4);
    combat.onEnemyKilled(enemy({ hp: 0, elite: true }), {});
    assert.equal(draws.length, 9);
    assert.equal(game.gems[1].vy, (draws[7] - 0.5) * 1.8);
    assert.equal(game.chests.length, chestCount);
    assert.equal(resources.some(entry => entry[2] === 'elite_bounty'), chestCount === 1);
  }
});

test('thunder set extends the chain and increases hop damage across the legacy radius', () => {
  const { combat, game, enemy, cues } = setup({ sets: { thunder: 3 }, main: { id: 'main_thunder', effects: { thunderChainRadiusBonus: 0.6 } } });
  const start = enemy();
  const second = enemy({ x: 13 });
  const third = enemy({ x: 16 });
  const fourth = enemy({ x: 19 });
  assert.equal(combat.fireChainLightning(start, 100, 2, { ox: 0, oy: 0, comboThunderFire: true }), undefined);
  assert.deepEqual([start.hp, second.hp, third.hp, fourth.hp], [900, 888, 875, 1000]);
  assert.deepEqual(game.bolts, [{
    pts: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 13, y: 10 }, { x: 16, y: 10 }],
    t: 0.24, max: 0.24, col: '#cf96ff', comboThunderFire: true,
  }]);
  assert.deepEqual(cues, [['thunder']]);
});
