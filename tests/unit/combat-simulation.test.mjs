import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import BALANCE from '../../src/data/balance.js';
import { MAX_PROJECTILES } from '../../src/data/index.js';
import { createCombatSimulation, createCombatSystem, isEnemyUnstoppable, pointToSegDist } from '../../src/systems/combat/index.js';

function enemy(id, props = {}) {
  return {
    id, kind: 'wolf', x: 12, y: 10, r: 0.3, hp: 100, maxHp: 100, dmg: 20, spd: 1,
    cd: 0, flash: 0, aiCd: 0, aiState: 'chase', slow: 0, slowT: 0, freezeT: 0, frenzyT: 0,
    ...props,
  };
}

function boss6(props = {}) {
  return enemy(1, {
    kind: 'boss6', boss: true, x: 15, maxHp: 1000, hp: 1000, bossTimer: 10, bossAuxTimer: 10,
    signatureThresholdHp: 800, finalThresholdHp: 350, ...props,
  });
}

function fixture({ state = {}, hero = {}, sealStats = {}, dual = [], aux = [], rng = [] } = {}) {
  const events = [];
  const record = (key, ...args) => { events.push([key, ...args]); };
  const spy = key => (...args) => record(key, ...args);
  const calls = key => events.filter(([name]) => name === key).map(([, ...args]) => args);
  let rngIndex = 0;
  const game = {
    hero: { x: 10, y: 10, hp: 100, shield: 0, shieldTimer: 0, combos: {} },
    phase: 'wave', wave: 8, waveClock: 0, thunderSynTimer: 0, seal: null, subSeals: [],
    enemies: [], projectiles: [], zones: [], bolts: [], beams: [], floats: [], shake: 0,
    stats: { dmgTotal: 0, skillDmg: {} },
    rnd() {
      assert.ok(rngIndex < rng.length, 'unexpected RNG call');
      const value = rng[rngIndex++];
      record('rng', value);
      return value;
    },
    ...state,
  };
  const ctx = createRuntimeContext({ game, ports: {
    audio: { play: spy('audio') },
    vfx: { addRing: spy('ring'), addFloat: spy('float') },
    ui: { showBanner: spy('banner') },
  } });
  const deps = {
    meta: { hasMetaAux: key => aux.includes(key) },
    hero: {
      getSynergyCounts: () => ({}), getSynergyTier: () => 0, getHeroStats: () => ({ rangeMult: 1 }),
      getSealStats: () => ({ cd: 1.2, dmg: 40, shots: 2, range: 4, pierce: 2, splash: 2,
        burn: 30, beams: 2, chains: 4, crit: 0.1, critDmg: 1.6, gm: {}, ...sealStats }),
      hasDualRes: key => dual.includes(key), ...hero,
    },
    heroVitals: {
      damageHero(amount, meta) { game.hero.hp -= amount; record('heroHit', amount, meta); },
    },
    hooks: {
      applyFireMark(target, stacks, source, duration) {
        record('mark', target.id, stacks, source, duration);
        target.fireMarkStacks = (target.fireMarkStacks || 0) + stacks;
        target.fireMarkT = duration;
      },
      applyFrostSlow: spy('slow'), gainFrostShield: spy('frostShield'), triggerFireDetonation: spy('detonate'),
    },
    damage: {
      isEnemyUnstoppable,
      dealDamage(target, amount, opts) { target.hp -= amount; record('hit', target.id, amount, opts); },
      fireChainLightning: spy('chain'), applyHeroLifesteal: spy('lifesteal'), onEnemyKilled: spy('killed'),
      triggerW30BossSignature: spy('signature'), enterW30BossFinalPhase: spy('finalPhase'), spawnHealOrb: spy('healOrb'),
      spawnEnemy(kind, side, scale, pos) {
        const spawned = enemy(game.enemies.length + 1, { kind, ...pos });
        game.enemies.push(spawned);
        record('spawn', kind, side, scale, pos);
        return spawned;
      },
    },
  };
  return { ctx, game, deps, events, calls, sim: createCombatSimulation(ctx, deps) };
}

function shot(kind, props = {}) {
  return { kind, x: 12, y: 10, vx: 0, vy: 0, life: 1, r: 0.3, dmg: 20,
    pierce: 0, splash: 0, hitSet: new Set(), ...props };
}

function arc(kind, props = {}) {
  return { kind, sx: 12, sy: 10, tx: 10, ty: 10, t: 0, dur: 0.25, dmg: 20, ...props };
}

test('projectile insertion evicts the oldest at capacity and follows the current runtime state', () => {
  const { ctx, game, sim } = fixture();
  const replacement = { projectiles: Array.from({ length: MAX_PROJECTILES }, (_, id) => ({ id })) };
  ctx.setGame(replacement);
  const next = { id: MAX_PROJECTILES };
  assert.equal(sim.pushProjectile(next), undefined);
  assert.equal(replacement.projectiles.length, MAX_PROJECTILES);
  assert.equal(replacement.projectiles[0].id, 1);
  assert.equal(replacement.projectiles.at(-1), next);
  assert.deepEqual(game.projectiles, []);
});

test('point-to-segment distance handles both endpoints, the perpendicular and a degenerate segment', () => {
  const { sim } = fixture();
  assert.equal(pointToSegDist(-3, 4, 0, 0, 8, 0), 5);
  assert.equal(pointToSegDist(11, 4, 0, 0, 8, 0), 5);
  assert.equal(pointToSegDist(3, 4, 0, 0, 8, 0), 4);
  assert.equal(pointToSegDist(4, 6, 1, 2, 1, 2), 5);
  assert.equal(sim.pointToSegDist, pointToSegDist);
});

test('seal cooldown floors at zero and thunder tier two pulses the nearest three living enemies every three seconds', () => {
  const seal = { cd: 0.5 };
  const enemies = [enemy(1, { x: 16 }), enemy(2, { x: 11 }), enemy(3, { x: 13 }),
    enemy(4, { x: 12 }), enemy(5, { x: 10, hp: 0 })];
  const { game, sim, calls } = fixture({ state: { seal, enemies, thunderSynTimer: 1 },
    hero: { getSynergyTier: key => key === 'thunder' ? 2 : 0 } });
  sim.updateSeal(0.25);
  assert.equal(seal.cd, 0.25);
  assert.deepEqual(calls('chain'), []);
  sim.updateSeal(0.75);
  assert.equal(seal.cd, 0);
  assert.equal(game.thunderSynTimer, 3);
  assert.deepEqual(calls('chain').map(([target, damage, count, opts]) =>
    [target.id, damage, count, opts.oy, opts.tower]), [[2, 219, 4, 6, seal], [4, 219, 4, 6, seal], [3, 219, 4, 6, seal]]);
  sim.updateSeal(2);
  assert.equal(calls('chain').length, 3);
  sim.updateSeal(1);
  assert.equal(calls('chain').length, 6);
  game.phase = 'harvest';
  sim.updateSeal(3);
  assert.equal(calls('chain').length, 6);
});

test('seal ignores a missing target, an active cooldown and a target beyond scaled range', () => {
  const seal = { kind: 'holy', cd: 0.5 };
  const { sim, events } = fixture({ state: { seal }, hero: { getHeroStats: () => ({ rangeMult: 0.5 }) } });
  sim.triggerSealOnHeroHit(enemy(1));
  assert.equal(seal.cd, 0.5);
  seal.cd = 0;
  sim.triggerSealOnHeroHit(null);
  sim.triggerSealOnHeroHit(enemy(2, { x: 12.5 }));
  assert.equal(seal.cd, 0);
  assert.deepEqual(events, []);
});

test('wind seal uses mastery stats and resolves wind, dual and sub-seal effects in RNG order', () => {
  const seal = { kind: 'wind', cd: 0, star: 3 };
  const target = enemy(1);
  const high = enemy(2, { hp: 200 });
  const wind = { elem: 'wind', star: 2 };
  const thunder = { elem: 'thunder', star: 1 };
  const holy = { elem: 'holy', star: 2 };
  const { game, sim, calls, events } = fixture({
    state: { seal, enemies: [target, high], subSeals: [wind, thunder, holy] },
    hero: { getSynergyCounts: () => ({ wind: 4 }) },
    sealStats: { route: 'mastery', shots: 3, pierce: 4, cd: 0.8 },
    dual: ['fire_thunder', 'holy_omni'], rng: [0.3, 0.4],
  });
  game.hero.shield = 73;
  sim.triggerSealOnHeroHit(target);
  assert.equal(seal.cd, 0.8);
  assert.equal(game.hero.shield, 75);
  assert.equal(game.hero.shieldTimer, 4);
  assert.equal(game.stats.shieldGained, 2);
  assert.deepEqual(game.projectiles.map(p => [p.kind, p.pierce, p.dmg, p.opts.tower, [...p.hitSet]]), [
    ...Array.from({ length: 5 }, () => ['arrow', 4, 40, seal, [1]]),
    ...Array.from({ length: 2 }, () => ['arrow', 1, 22, wind, [1]]),
  ]);
  assert.deepEqual(events.map(([key]) => key), ['rng', 'ring', 'audio', 'chain', 'rng', 'chain', 'lifesteal', 'ring']);
  const [dualChain, subChain] = calls('chain');
  assert.deepEqual(dualChain.slice(0, 3), [high, 30, 2]);
  assert.equal(dualChain[3].comboThunderFire, true);
  assert.deepEqual(subChain.slice(0, 3), [target, 27, 2]);
  assert.equal(subChain[3].tower, thunder);
  assert.deepEqual(calls('lifesteal'), [[2.5]]);
});

test('fire mastery marks before damage and creates its larger, longer lava zone', () => {
  const seal = { kind: 'fire', cd: 0, star: 3 };
  const target = enemy(1);
  const { game, sim, events, calls } = fixture({ state: { seal, enemies: [target, enemy(2, { x: 16 })] },
    sealStats: { route: 'mastery' } });
  sim.triggerSealOnHeroHit(target);
  assert.equal(target.hp, 60);
  assert.deepEqual(events.map(([key]) => key), ['ring', 'mark', 'hit', 'audio']);
  assert.deepEqual(calls('mark'), [[1, 1, 'seal_fire_mastery', 4.5]]);
  assert.deepEqual(game.zones, [{ kind: 'lava', x: 12, y: 10, r: 1.92, t: 3.5, max: 3.5, tick: 0.45, dps: 30, tower: seal }]);
});

test('frost mastery grants shield when the blast hits a previously chilled enemy', () => {
  for (const slowT of [0, 1]) {
    const seal = { kind: 'frost', cd: 0, star: 3 };
    const target = enemy(1, { slowT });
    const { sim, calls } = fixture({ state: { seal, enemies: [target] }, sealStats: { route: 'mastery' } });
    sim.triggerSealOnHeroHit(target);
    assert.equal(target.hp, 60);
    assert.deepEqual(calls('frostShield'), slowT ? [[10, { duration: 4.5, maxShield: 105, source: 'seal_frost_mastery' }]] : []);
  }
});

test('thunder mastery chains with vulnerability enabled', () => {
  const seal = { kind: 'thunder', cd: 0, star: 3 };
  const target = enemy(1);
  const { sim, calls } = fixture({ state: { seal, enemies: [target] }, sealStats: { route: 'mastery' } });
  sim.triggerSealOnHeroHit(target);
  const [chain] = calls('chain');
  assert.deepEqual(chain.slice(0, 3), [target, 40, 4]);
  assert.equal(chain[3].vuln, true);
});

test('holy mastery draws rays from a single RNG angle, hits in ray order and heals', () => {
  const seal = { kind: 'holy', cd: 0, star: 3 };
  const target = enemy(1);
  const onRay = enemy(2, { x: 15 });
  const offRay = enemy(3, { x: 14, y: 12 });
  const { game, sim, calls, events } = fixture({ state: { seal, enemies: [target, onRay, offRay] },
    sealStats: { route: 'mastery' }, rng: [0] });
  sim.triggerSealOnHeroHit(target);
  assert.equal(game.beams.length, 2);
  assert.deepEqual([game.beams[0].x1, game.beams[0].x2], [8, 16]);
  assert.deepEqual(calls('hit').map(([id]) => id), [1, 2, 1]);
  assert.equal(offRay.hp, 100);
  assert.deepEqual(events.map(([key]) => key), ['rng', 'ring', 'hit', 'hit', 'hit', 'lifesteal', 'audio']);
  assert.deepEqual(calls('lifesteal'), [[4]]);
});

test('enemy shots expire on impact, preserve source metadata and can be dodged', () => {
  const metadata = { attackerKind: 'mage', skillName: '奥术弹幕' };
  const hit = arc('enemyShot', { sourceMeta: metadata });
  const miss = arc('enemyShot', { tx: 11 });
  const { game, sim, calls } = fixture({ state: { projectiles: [hit, miss] } });
  sim.updateProjectilesAndZones(0.125);
  assert.equal(hit.x, 11);
  assert.equal(game.hero.hp, 100);
  sim.updateProjectilesAndZones(0.125);
  assert.equal(game.hero.hp, 80);
  assert.equal(calls('heroHit')[0][1], metadata);
  assert.deepEqual(calls('ring'), [[11, 10, 'rgba(255,102,196,0.5)', 0.45]]);
  assert.deepEqual(game.projectiles, []);
});

for (const [branch, stacks, radius, skill] of [
  ['fw_brand_pierce', 1, 1.90, 'firewave'], ['fw_ring_detonate', 0, 2.15, 'firewave'],
  ['fw_homing_ember', 1, 1.75, 'firewave'], ['bk_blood_crescent', 0, 1.75, 'berserk'],
]) {
  test(`firewave ${branch} applies a mark and dispatches its detonation`, () => {
    const target = enemy(1, { fireMarkStacks: stacks, fireMarkT: stacks });
    const nearby = enemy(2, { x: 14 });
    const projectile = shot('firewave', { w10Branch: branch, bounceLeft: 1 });
    const { game, sim, calls, events } = fixture({ state: { enemies: [target, nearby], projectiles: [projectile] } });
    sim.updateProjectilesAndZones(0.01);
    assert.deepEqual(events.map(([key]) => key), ['hit', 'mark', 'detonate']);
    assert.equal(calls('hit')[0][2].skillKey, skill);
    assert.equal(calls('hit')[0][2].burn, 16);
    assert.deepEqual(calls('mark'), [[1, 1, branch, 5]]);
    assert.deepEqual(calls('detonate'), [[target, branch === 'fw_brand_pierce' ? 1.35 : 1.15, radius, skill]]);
    if (branch === 'fw_homing_ember') {
      assert.equal(game.projectiles.length, 1);
      const [bounce] = game.projectiles;
      assert.deepEqual([bounce.w10Branch, bounce.vx, bounce.dmg, bounce.bounceLeft, ...bounce.hitSet], [branch, 13, 17, 0, 1]);
    } else {
      assert.deepEqual(game.projectiles, []);
    }
  });
}

test('thunder-fire combo rolls only on eligible firewave hits and emits its chain after damage', () => {
  const target = enemy(1);
  const projectiles = [shot('firewave', { isCombo: true }), shot('firewave'), shot('firewave')];
  const { game, sim, calls, events } = fixture({ state: { enemies: [target], projectiles }, rng: [0.45, 0.44] });
  game.hero.combos.thunder_fire = true;
  sim.updateProjectilesAndZones(0.01);
  assert.deepEqual(events.map(([key]) => key), ['hit', 'hit', 'rng', 'hit', 'rng', 'ring', 'float', 'chain']);
  const [chain] = calls('chain');
  assert.deepEqual(chain.slice(0, 3), [target, 14, 3]);
  assert.equal(chain[3].comboThunderFire, true);
});

test('arrow splash, piercing hit-set and W10 frost shield are applied on contact', () => {
  const first = enemy(1);
  const second = enemy(2, { x: 13 });
  const arrow = shot('arrow', { pierce: 1, splash: 0.8, vx: 1, w10Branch: 'nv_prism_lance' });
  const { game, sim, calls } = fixture({ state: { enemies: [first, second], projectiles: [arrow] } });
  sim.updateProjectilesAndZones(0.05);
  assert.deepEqual([first.hp, second.hp, arrow.pierce, ...arrow.hitSet], [80, 80, 0, 1]);
  assert.deepEqual(calls('slow'), [[first, 0.50, 2.6, 'nv_prism_lance']]);
  assert.deepEqual(calls('frostShield'), [[6, 4, 90]]);
  sim.updateProjectilesAndZones(0.5);
  assert.deepEqual([...arrow.hitSet], [1, 2]);
  assert.deepEqual(game.projectiles, []);
  assert.deepEqual(calls('slow').map(([target]) => target.id), [1, 2]);
});

test('two-star mortar fireball creates lava and marks and detonates after direct damage', () => {
  const target = enemy(1, { x: 10 });
  const tower = { star: 2 };
  const fireball = arc('fireball', { star: 2, splash: 2, w10Branch: 'fw_mortar_cluster', burn: 30, opts: { tower } });
  const { game, sim, events, calls } = fixture({ state: { enemies: [target], projectiles: [fireball] } });
  sim.updateProjectilesAndZones(0.25);
  assert.equal(target.hp, 80);
  assert.deepEqual(events.map(([key]) => key), ['ring', 'hit', 'mark', 'detonate']);
  assert.deepEqual(calls('detonate'), [[target, 1.20, 1.85, 'firewave']]);
  assert.deepEqual(game.projectiles, []);
  assert.deepEqual(game.zones, [{ kind: 'lava', w10Branch: 'fw_mortar_cluster', x: 10, y: 10,
    r: 1.7, t: 2.75, max: 3, tick: 0.2, dps: 30, tower }]);
});

test('fire vortex pulls ordinary enemies and ticks without moving bosses or unstoppable enemies', () => {
  const ordinary = enemy(1, { x: 11 });
  const boss = enemy(2, { x: 11, boss: true });
  const charging = enemy(3, { x: 11, aiState: 'charge' });
  const zone = { kind: 'fireVortex', x: 10, y: 10, r: 2, t: 1, tick: 0, dps: 40 };
  const { sim, calls } = fixture({ state: { enemies: [ordinary, boss, charging], zones: [zone] } });
  sim.updateProjectilesAndZones(0.1);
  assert.deepEqual([ordinary.x, boss.x, charging.x], [10.58, 11, 11]);
  assert.deepEqual([ordinary.hp, boss.hp, charging.hp, zone.tick], [82, 82, 82, 0.45]);
  assert.deepEqual(calls('mark'), [1, 2, 3].map(id => [id, 1, 'fireVortex', 4.5]));
});

test('frost vortex pulls, slows and damages a target, then grants frost shield', () => {
  const target = enemy(1, { x: 11 });
  const zone = { kind: 'frostVortex', x: 10, y: 10, r: 2, t: 1, tick: 0 };
  const { sim, calls, events } = fixture({ state: { enemies: [target], zones: [zone] } });
  sim.updateProjectilesAndZones(0.1);
  assert.deepEqual([target.x, target.hp, zone.tick], [10.65, 92, 0.45]);
  assert.deepEqual(events.map(([key]) => key), ['slow', 'hit', 'frostShield']);
  assert.deepEqual(calls('slow'), [[target, 0.60, 2.4, 'frostVortex']]);
  assert.deepEqual(calls('frostShield'), [[6, { duration: 4.2, source: 'frost_zone' }]]);
});

test('thunder field adds a fire mark before damage and detonates a second stack', () => {
  const target = enemy(1, { fireMarkStacks: 1 });
  const zone = { kind: 'thunderField', x: 12, y: 10, r: 2, t: 1, tick: 0 };
  const { sim, calls, events } = fixture({ state: { enemies: [target], zones: [zone] } });
  sim.updateProjectilesAndZones(0.1);
  assert.equal(target.hp, 88);
  assert.equal(zone.tick, 0.5);
  assert.deepEqual(events.map(([key]) => key), ['mark', 'hit', 'detonate']);
  assert.deepEqual(calls('mark'), [[1, 1, 'th_judgment_pillar', 4.5]]);
  assert.deepEqual(calls('detonate'), [[target, 1.15, 1.80, 'thunder']]);
});

test('boss slam deals attributed impact damage and leaves damaging lava', () => {
  const sourceMeta = { attackerName: '熔岩巨魔', attackerKind: 'boss1', skillName: '熔岩裂地重击 (W5核心)',
    isBoss: true, isBossCore: true, isBossAux: false };
  const slam = { kind: 'bossSlam', x: 10, y: 10, r: 2, t: 0.25, dmg: 40, leaveLava: true, sourceMeta };
  const { game, sim, calls } = fixture({ state: { zones: [slam] } });
  sim.updateProjectilesAndZones(0.25);
  assert.equal(game.hero.hp, 60);
  assert.equal(game.shake, 8);
  assert.deepEqual(calls('audio'), [['boss', 1.2]]);
  assert.equal(game.zones.length, 1);
  const [lava] = game.zones;
  assert.deepEqual([lava.kind, lava.r, lava.dmg], ['enemyLava', 1.6, 14]);
  sim.updateProjectilesAndZones(0.55);
  assert.equal(game.hero.hp, 46);
  assert.deepEqual(calls('heroHit'), [[40, sourceMeta], [14, { ...sourceMeta, skillName: '灼地焦土(持续)' }]]);
});

test('poison bomb becomes a poison pool with periodic damage only while in range', () => {
  const bomb = { kind: 'poisonBomb', x: 10, y: 10, r: 2, t: 0.25, dmg: 20 };
  const { game, sim, calls } = fixture({ state: { zones: [bomb] } });
  sim.updateProjectilesAndZones(0.25);
  assert.equal(game.hero.hp, 80);
  assert.equal(game.zones.length, 1);
  const [pool] = game.zones;
  assert.deepEqual([pool.kind, pool.r, pool.dmg], ['poisonPool', 1.8, 9]);
  sim.updateProjectilesAndZones(0.65);
  assert.equal(game.hero.hp, 71);
  game.hero.x = 12;
  sim.updateProjectilesAndZones(0.65);
  assert.equal(game.hero.hp, 71);
  assert.deepEqual(calls('heroHit').map(([, meta]) => meta.skillName), ['剧毒自爆', '残留毒池(持续)']);
});

test('boss wave damages only on ring contact and only once', () => {
  const zone = { kind: 'bossWave', w20Aux: 'oppression_ring', x: 8, y: 10, r: 4, t: 1, max: 1, dmg: 38 };
  const { game, sim, calls } = fixture({ state: { zones: [zone] } });
  sim.updateProjectilesAndZones(0.25);
  assert.equal(game.hero.hp, 100);
  sim.updateProjectilesAndZones(0.25);
  sim.updateProjectilesAndZones(0.125);
  assert.equal(game.hero.hp, 62);
  assert.equal(zone.hitHero, true);
  const [[, meta]] = calls('heroHit');
  assert.equal(meta.skillName, '领域压迫环 (W20随机辅助)');
  assert.equal(meta.isBossAux, true);
});

test('W30 telegraph is harmless and its shockwave respects the safe zone', () => {
  const zone = { kind: 'w30SigTelegraph', x: 8, y: 10, r: 4, t: 1, max: 1, dmg: 68, safeX: 10, safeY: 10, safeR: 1 };
  const { ctx, deps, game, calls } = fixture({ state: { zones: [zone] } });
  const sim = createCombatSimulation(ctx, { ...deps, heroVitals: undefined,
    hero: { ...deps.hero, damageHero: deps.heroVitals.damageHero } });
  sim.updateProjectilesAndZones(0.5);
  assert.equal(game.hero.hp, 100);
  const shockwave = { ...zone, t: 1, kind: 'w30SigShockwave' };
  game.zones = [shockwave];
  sim.updateProjectilesAndZones(0.5);
  assert.equal(game.hero.hp, 100);
  assert.equal(shockwave.hitHero, undefined);
  game.hero.x = 11.5;
  sim.updateProjectilesAndZones(0.375);
  assert.equal(game.hero.hp, 32);
  assert.equal(shockwave.hitHero, true);
  assert.equal(calls('heroHit')[0][1].skillName, '终焉裂空冲击波 (W30核心招牌)');
});

test('W30 burn advances its timer through signature lock without touching HP, shield or damage totals', () => {
  const target = boss6({ hp: 800, shield: 10, burnT: 2, burnDps: 100,
    signatureTriggered: true, signatureLockActive: true, signatureStage: 'telegraph', signatureTimer: 2 });
  const { game, sim, calls } = fixture({ state: { enemies: [target] } });
  sim.updateEnemies(0.25);
  assert.deepEqual([target.hp, target.shield, target.burnT], [800, 10, 1.75]);
  assert.deepEqual(game.stats, { dmgTotal: 0, skillDmg: {} });
  assert.deepEqual(calls('signature'), []);
  assert.deepEqual(calls('finalPhase'), []);
});

test('W30 burn truncates at 80%, records only shield and allowed HP damage and starts signature', () => {
  const target = boss6({ hp: 810, shield: 5, burnT: 2, burnDps: 100 });
  const { game, sim, calls } = fixture({ state: { enemies: [target] } });
  sim.updateEnemies(0.25);
  assert.deepEqual([target.hp, target.shield, target.burnT], [800, 0, 1.75]);
  assert.deepEqual(game.stats, { dmgTotal: 15, skillDmg: { burn: 15 } });
  assert.deepEqual(calls('signature'), [[target, 10]]);
});

test('W30 burn after signature crosses 35% and enters final phase', () => {
  const target = boss6({ hp: 360, burnT: 2, burnDps: 100, signatureTriggered: true });
  const { game, sim, calls } = fixture({ state: { enemies: [target] } });
  sim.updateEnemies(0.25);
  assert.equal(target.hp, 335);
  assert.deepEqual(game.stats, { dmgTotal: 25, skillDmg: { burn: 25 } });
  assert.deepEqual(calls('finalPhase'), [[target]]);
});

test('lethal burn records only remaining HP, dispatches death and removes the enemy', () => {
  const target = enemy(1, { hp: 10, burnT: 2, burnDps: 100 });
  const { game, sim, calls } = fixture({ state: { enemies: [target] } });
  sim.updateEnemies(0.25);
  assert.deepEqual(game.enemies, []);
  assert.deepEqual(game.stats, { dmgTotal: 10, skillDmg: { burn: 10 } });
  assert.deepEqual(calls('killed'), [[target, {}]]);
});

test('W30 signature emits the shockwave, unlocks on its last tick and drops an orb in the safe zone', () => {
  const target = boss6({ hp: 800, signatureTriggered: true, signatureLockActive: true, signatureStage: 'telegraph',
    signatureTimer: 0.25, signatureSafeZone: { x: 11, y: 12, r: 2.5 } });
  const battle = { phase: 'signature_telegraph', signatureLockActive: true, elapsedSeconds: 3.25, phaseTimeline: [] };
  const telegraph = { kind: 'w30SigTelegraph', t: 1 };
  const unrelated = { kind: 'fireVortex', t: 2 };
  const { game, sim, calls } = fixture({ state: { enemies: [target], w30Battle: battle, zones: [telegraph, unrelated] } });
  sim.updateEnemies(0.25);
  const shockDuration = BALANCE.w30Boss.signatureShockwaveSeconds;
  assert.deepEqual([target.signatureStage, target.signatureTimer, target.signatureLockActive], ['shockwave', shockDuration, true]);
  const shock = game.zones.at(-1);
  assert.deepEqual([shock.kind, shock.bossId, shock.safeX, shock.safeY, shock.safeR], ['w30SigShockwave', 1, 11, 12, 2.5]);
  assert.equal(shock.dmg, BALANCE.w30Boss.signatureDamage);
  sim.updateEnemies(shockDuration - 0.25);
  assert.equal(target.signatureLockActive, true);
  battle.elapsedSeconds = 5.125;
  sim.updateEnemies(0.25);
  assert.deepEqual([target.signatureStage, target.signatureLockActive, target.aiState, target.bossTimer, target.bossAuxTimer],
    ['done', false, 'chase', 2.2, 3.6]);
  assert.deepEqual([battle.phase, battle.signatureLockActive, battle.signatureLockEndedAt], ['mid_skirmish', false, 5.13]);
  assert.deepEqual(battle.phaseTimeline, [
    { phase: 'signature_shockwave', at: 3.25, bossHpPct: 80 },
    { phase: 'mid_skirmish', at: 5.13, bossHpPct: 80 },
  ]);
  assert.deepEqual(game.zones, [unrelated]);
  assert.deepEqual(calls('healOrb'), [[11, 12]]);
  assert.equal(calls('banner')[0][2], 'good');
});

for (const [auxKey, rng] of [
  ['abyss_pillars', [0]], ['eclipse_seekers', [0.25, 0.75]], ['rift_rings', [0.25, 0.75]], ['void_guards', [0, 0.25]],
]) {
  test(`W30 ${auxKey} executes its auxiliary attack after signature`, () => {
    const target = boss6({ signatureTriggered: true, bossAuxTimer: 0, bossAuxCasts: 1 });
    const battle = { auxTriggers: 0 };
    const { game, sim, calls } = fixture({ state: { wave: 30, enemies: [target], w30Battle: battle,
      bossIntel: { w30AuxKey: auxKey } }, rng });
    sim.updateEnemies(0.1);
    assert.equal(target.bossAuxTimer, BALANCE.w30Boss.auxCooldownMid);
    assert.equal(target.bossAuxCasts, 2);
    assert.equal(battle.auxTriggers, 1);
    assert.deepEqual(calls('rng').flat(), rng);
    if (auxKey === 'abyss_pillars') {
      assert.deepEqual(calls('spawn'), [['pillar', 'west', 1, { x: 18.8, y: 10 }]]);
      assert.equal(game.enemies[1].pillarBossId, target.id);
    } else if (auxKey === 'eclipse_seekers') {
      assert.deepEqual(game.projectiles.map(p => [p.kind, p.w30Aux, p.dmg, p.dur]),
        Array.from({ length: 5 }, () => ['enemyShot', auxKey, 30, 0.95]));
      assert.deepEqual(calls('healOrb'), [[8.75, 11.25]]);
    } else if (auxKey === 'rift_rings') {
      assert.deepEqual(game.zones.map(z => [z.kind, z.w30Aux, z.r, z.t, z.dmg]),
        [['w30RiftRing', auxKey, 7.4, 1.35, 34], ['w30RiftRing', auxKey, 9.8, 2.05, 34]]);
      assert.deepEqual(calls('healOrb'), [[8.75, 11.25]]);
    } else {
      assert.deepEqual(calls('spawn'), [['void_guard', 'west', 1, { x: 18, y: 10 }], ['void_guard', 'west', 1, { x: 15, y: 13 }]]);
    }
  });
}

for (const auxKey of ['oppression_ring', 'shield_totem', 'chase_barrage', 'charged_shockwave']) {
  test(`W20 ${auxKey} executes after the boss enters its half-health frenzy`, () => {
    const target = enemy(1, { kind: 'boss4', boss: true, x: 15, hp: 500, maxHp: 1000, bossTimer: 10, bossAuxTimer: 0 });
    const { game, sim, calls } = fixture({ state: { wave: 20, enemies: [target], bossIntel: { w20AuxKey: auxKey } },
      rng: auxKey === 'shield_totem' ? [0] : [] });
    sim.updateEnemies(0.1);
    assert.deepEqual([target.frenzied, target.spd, target.bossAuxTimer, game.stats.w20BossAuxTriggers], [true, 1.25, 5.2, 1]);
    if (auxKey === 'oppression_ring') {
      assert.deepEqual(game.zones.map(z => [z.kind, z.w20Aux, z.r, z.dmg]), [['bossWave', auxKey, 6.2, 38]]);
    } else if (auxKey === 'shield_totem') {
      assert.deepEqual(calls('spawn'), [['totem', 'west', 1, { x: 18, y: 10 }]]);
      assert.equal(game.enemies[1].totemBossId, target.id);
    } else if (auxKey === 'chase_barrage') {
      assert.deepEqual([target.bossChaseQueue, target.bossChaseCd], [2, 0.01]);
      sim.updateEnemies(0.1);
      assert.equal(target.bossChaseQueue, 1);
      sim.updateEnemies(0.65);
      assert.equal(target.bossChaseQueue, 0);
      assert.deepEqual(game.projectiles.map(p => [p.kind, p.w20Aux, p.dmg]),
        Array.from({ length: 8 }, () => ['enemyShot', auxKey, 28]));
      assert.equal(target.spd, 1.25);
    } else {
      assert.deepEqual(game.zones.map(z => [z.kind, z.w20Aux, z.r, z.dmg]),
        Array.from({ length: 4 }, () => ['bossSlam', auxKey, 1.85, 42]));
      assert.deepEqual(game.zones.map(z => [z.x, z.y]), [[12.1, 10], [10, 12.1], [7.9, 10], [10, 7.9]]);
    }
  });
}

for (const [index, affix] of ['sprint', 'volley', 'shield', 'vortex'].entries()) {
  test(`elite ${affix} is selected by one RNG draw and applies its effect`, () => {
    const elite = enemy(1, { elite: true, x: 14, affixTimer: 0, slow: 0.5, slowT: 2,
      affixes: ['sprint', 'volley', 'shield', 'vortex'].map(key => ({ key })) });
    const ally = enemy(2, { x: 15 });
    const draw = (index + 0.5) / 4;
    const { game, sim, calls } = fixture({ state: { enemies: [elite, ally] }, rng: [draw] });
    sim.updateEnemies(0.1);
    assert.equal(elite.affixTimer, 3.8);
    assert.deepEqual(calls('rng'), [[draw]]);
    if (affix === 'sprint') {
      assert.deepEqual([elite.aiState, elite.slow, elite.slowT, elite.aiVx, elite.x], ['charge', 0, 0, -1, 13.64]);
    } else if (affix === 'volley') {
      assert.equal(game.projectiles.length, 8);
      assert.deepEqual(game.projectiles.map(p => [p.kind, p.dmg, p.sourceMeta.skillName]),
        Array.from({ length: 8 }, () => ['enemyShot', 15, '精英环状弹幕']));
    } else if (affix === 'shield') {
      assert.deepEqual([elite.shield, elite.frenzyT, ally.frenzyT], [16, 2, 1.9]);
    } else {
      assert.equal(game.hero.x, 11.45);
      assert.equal(game.hero.y, 10);
    }
  });
}

test('shaman heals nearby allies, frenzies them and includes the Meta telegraph buffer', () => {
  for (const hasBuffer of [false, true]) {
    const shaman = enemy(1, { kind: 'shaman', shaman: true, x: 14, hp: 98, shamanTimer: 0, range: 6 });
    const ally = enemy(2, { x: 15, hp: 80, maxHp: 150 });
    const far = enemy(3, { x: 20, hp: 80 });
    const { game, sim } = fixture({ state: { enemies: [shaman, ally, far] }, aux: hasBuffer ? ['aux_telegraph_buffer'] : [] });
    sim.updateEnemies(0.1);
    assert.deepEqual([shaman.hp, ally.hp, far.hp, shaman.shamanTimer], [100, 89, 80, 2.6]);
    assert.deepEqual([shaman.frenzyT, ally.frenzyT, far.frenzyT], [2.4, 2.3, 0]);
    const [zone] = game.zones;
    assert.deepEqual([zone.kind, zone.leaveLava, zone.x, zone.y, zone.dmg, zone.t, zone.max, zone.sourceMeta.skillName],
      ['bossSlam', true, 10, 10, 33, hasBuffer ? 1.25 : 1.05, hasBuffer ? 1.25 : 1.05, '妖火天降点名']);
  }
});

test('W20 totem and W30 pillar periodically shield their owners with distinct caps and skip a locked W30 boss', () => {
  const w20 = enemy(1, { kind: 'boss4', boss: true, x: 15, maxHp: 1000, hp: 1000, bossTimer: 60, bossAuxTimer: 60 });
  const w30 = { ...boss6({ x: 20, bossTimer: 60, signatureTriggered: true }), id: 2 };
  const totem = enemy(3, { totem: true, kind: 'totem', totemBossId: 1, totemTimer: 0, x: 25 });
  const pillar = enemy(4, { pillar: true, kind: 'pillar', pillarBossId: 2, pillarTimer: 0, x: 27 });
  const { game, sim } = fixture({ state: { enemies: [w20, w30, totem, pillar] } });
  sim.updateEnemies(0.1);
  assert.deepEqual([w20.shield, w30.shield, totem.totemTimer, pillar.pillarTimer], [140, 40, 2.4, 2.8]);
  assert.deepEqual([totem.x, pillar.x], [25, 27]);
  assert.deepEqual(game.bolts.map(b => [b.pts[0].x, b.col]), [[25, '#6ce2ff'], [27, '#ff88dc']]);
  w30.signatureLockActive = true;
  w30.signatureStage = 'telegraph';
  w30.signatureTimer = 10;
  w30.shield = 0;
  w20.shield = 0;
  sim.updateEnemies(2.8);
  assert.deepEqual([w20.shield, w30.shield, totem.totemTimer, pillar.pillarTimer, game.bolts.length], [140, 0, 2.4, 2.8, 3]);
});

for (const [kind, flag, action, windup, damage, skill] of [
  ['brute', 'charger', 'charge', 0.55, 30, '霸体冲锋破甲'],
  ['wolf', 'leaper', 'leap', 0.36, 25, '飞扑突袭破甲'],
]) {
  test(`${kind} ${action} clears slow and freeze and breaks hero armor on contact`, () => {
    const target = enemy(1, { kind, [flag]: true, x: 13, spd: 3, slow: 0.8, slowT: 5 });
    const { game, sim, calls } = fixture({ state: { enemies: [target] }, rng: [0.5] });
    sim.updateEnemies(0.1);
    assert.deepEqual([target.aiState, target.aiKind, target.aiTimer, target.slow, target.slowT], ['windup', action, windup, 0, 0]);
    target.freezeT = 2;
    target.slowT = 2;
    target.slow = 0.5;
    sim.updateEnemies(windup);
    assert.deepEqual([target.aiState, target.slow, target.slowT, target.freezeT], [action, 0, 0, 0]);
    sim.updateEnemies(0.25);
    assert.equal(game.hero.armorBreakT, 2.5);
    assert.equal(game.hero.hp, 100 - damage);
    assert.equal(calls('heroHit')[0][1].skillName, skill);
  });
}

test('ranged enemies hold position and switch from one shot to two at wave eight', () => {
  for (const wave of [7, 8]) {
    const mage = enemy(1, { kind: 'mage', ranged: true, range: 5 });
    const { game, sim } = fixture({ state: { wave, enemies: [mage] } });
    sim.updateEnemies(0.1);
    assert.deepEqual([mage.x, mage.y, mage.cd], [12, 10, 1.5]);
    assert.equal(game.projectiles.length, wave === 7 ? 1 : 2);
    for (const p of game.projectiles) {
      assert.deepEqual([p.kind, p.dur, p.dmg, p.sourceMeta.attackerKind, p.sourceMeta.skillName], ['enemyShot', 0.42, 20, 'mage', '奥术弹幕']);
    }
    if (wave === 7) assert.equal(game.projectiles[0].ty, 10);
    else assert.ok(game.projectiles[0].ty > 10 && game.projectiles[1].ty < 10);
  }
});

test('nearby melee enemies deal contact damage and separate after the update', () => {
  const first = enemy(1, { x: 10.5 });
  const second = enemy(2, { x: 10.75 });
  const { sim, game, calls } = fixture({ state: { enemies: [first, second] } });
  sim.updateEnemies(0.1);
  assert.deepEqual([first.cd, second.cd, game.hero.hp], [0.95, 0.95, 60]);
  assert.deepEqual(calls('heroHit').map(([, meta]) => meta.skillName), ['近身撞击', '近身撞击']);
  assert.deepEqual([first.x, second.x], [10.402, 10.848]);
});

test('assembled combat routes a hero hit through damage, simulation and the fire mark hook', () => {
  const target = enemy(1);
  const seal = { kind: 'fire', cd: 0, star: 3 };
  const { ctx, deps, game, calls } = fixture({ state: { enemies: [target], seal },
    hero: { gearSetTier: () => 0, aggregateGear: () => ({}), getSubSeal: () => null },
    sealStats: { route: 'mastery', crit: 0, burn: 0 }, rng: [0.1, 0.2] });
  const system = createCombatSystem(ctx, {
    meta: { ...deps.meta, getActiveMetaMain: () => null }, hero: deps.hero, heroVitals: deps.heroVitals,
    equipment: { getActiveGearAffixSynergies: () => ({}) }, economy: {}, run: {},
  });
  assert.equal(Object.keys(system).length, 27);
  assert.equal(system.pointToSegDist, pointToSegDist);
  assert.equal(system.dealDamage(target, 10, { fromHero: true }), 10);
  assert.deepEqual([target.hp, target.fireMarkStacks, target.fireMarkSource], [50, 1, 'seal_fire_mastery']);
  assert.equal(game.stats.dmgTotal, 50);
  assert.equal(game.zones[0].tower, seal);
  assert.deepEqual(calls('rng'), [[0.1], [0.2]]);
});
