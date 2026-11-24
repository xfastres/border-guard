import assert from 'node:assert/strict';
import test from 'node:test';
import { xpForLevel } from '../../src/core/math.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createHeroSkills, createHeroVitals } from '../../src/systems/hero/index.js';

function enemy(x, y = 10, attrs = {}) {
  return { id: x, x, y, r: 0, hp: 500, maxHp: 500, slowT: 0, freezeT: 0, ...attrs };
}

function setup({ hero = {}, run = {}, main, aux = [], sets = {}, gear = {}, frostTrio = false, ports = {} } = {}) {
  const h = {
    x: 10, y: 10, face: 1, hp: 100, maxHp: 100, baseMaxHp: 100, shield: 0,
    shieldTimer: 0, invuln: 0, dashCd: 0, dashBuffT: 0, ultCd: 0, ultTimer: 0,
    thornsCd: 0, lv: 1, xp: 0, xpNext: xpForLevel(1), gear: [], perks: {},
    skills: {}, combos: {}, skillTimers: { spirit: 10, firewave: 0, thunder: 0, nova: 0, stomp: 0, berserk: 0 },
    bladeAngle: 0, bladeHitMap: new Map(), shatterCdMap: new Map(), wanjianTimer: 0,
    ...hero,
  };
  const game = {
    hero: h, phase: 'wave', wave: 20, waveClock: 10, shake: 0, mode: null,
    enemies: [], zones: [], beams: [], projectiles: [], gems: [], chests: [], healOrbs: [],
    xpCombo: 0, xpComboTimer: 0, stats: {}, metaRunState: { deflectReady: true },
    runMetrics: {}, curWaveTel: { dashCount: 0, ultCount: 0, moveDist: 0, hitsTaken: 0, dmgTaken: 0, minHpPct: 100 },
    combatLog: { hits: [], lowestHpPct: 100, totalHitsTaken: 0, totalHpLost: 0, totalShieldAbsorbed: 0, bySource: {} },
    rnd: () => assert.fail('Unexpected RNG call'),
    ...run,
  };
  const events = [];
  const record = name => (...args) => { events.push([name, ...args]); };
  const calls = name => events.filter(([type]) => type === name).map(([, ...args]) => args);
  const ctx = createRuntimeContext({ game, ports: {
    ...ports,
    vfx: { addRing: record('ring'), addFloat: record('float') },
    audio: { play: record('audio') },
    ui: { toast: record('toast'), renderAllUI: record('render'), setDangerVignette: record('danger'),
      flashScreen: record('flash'), showBanner: record('banner') },
    modals: { queueModal: record('modal') },
  } });
  const deps = {
    meta: { getActiveMetaMain: () => main, hasMetaAux: key => aux.includes(key) },
    equipment: { getActiveGearAffixSynergies: () => ({ hasFrostTrio: frostTrio }) },
    hero: {
      getHeroStats: () => ({ dmgMult: 1, skillDmgMult: 1, skillRangeMult: 1, rangeMult: 1,
        skillCdMult: 1, aspd: 1, moveSpd: 5, magnet: 4, crit: 0, critDmg: 1.5, lifesteal: 0,
        gm: { aspd: 0, bonusGold: 0, extraShot: 0, ...gear } }),
      gearSetTier: key => sets[key] || 0,
      aggregateGear: () => gear,
      syncHeroMaxHp: () => { h.maxHp = h.baseMaxHp; },
    },
    unlock: { getActiveUnlockNode: () => ({ idx: 4 }), getRealmStageLabel: () => '化神·二破' },
    combat: {
      recordW20Proc: record('w20'), recordDestinyProc: record('destiny'),
      isIsolatedHighValueTarget: () => false, triggerW20ElementalEcho: record('echo'),
      applyFireMark(e, stacks, source, duration) {
        e.fireMarkT = duration;
        e.fireMarkStacks = (e.fireMarkStacks || 0) + stacks;
        record('mark')(e, stacks, source, duration);
      },
      applyFrostSlow(e, slow, duration, source) {
        e.slowT = duration;
        record('slow')(e, slow, duration, source);
      },
      triggerFireDetonation: record('detonate'), triggerFrostPulse: record('pulse'),
      gainFrostShield: record('shield'), isEnemyUnstoppable: e => !!e.unstoppable,
      applyHeroLifesteal: record('lifesteal'), fireChainLightning: record('chain'),
      dealDamage(e, amount, opts) {
        e.hp -= amount;
        record('damage')(e, amount, opts);
        return amount;
      },
      pushProjectile(p) { game.projectiles.push(p); },
    },
    run: { finishGame: record('finish') },
  };
  return { h, game, ctx, events, calls, skills: createHeroSkills(ctx, deps), vitals: createHeroVitals(ctx, deps) };
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${expected}, got ${actual}`);
}

function w20(directionKey, enhancementKey) {
  return { vouchers: { w20: true }, breakthroughs: { w20: { completed: true, directionKey, enhancementKey } } };
}

test('aim priority ranks boss, elite, shaman, bomber or ranged, then ordinary enemies', () => {
  const { skills } = setup();
  for (const lowPriority of ['bomber', 'ranged']) {
    const ranked = [enemy(15, 10, { boss: true }), enemy(14, 10, { elite: true }),
      enemy(13, 10, { shaman: true }), enemy(12, 10, { [lowPriority]: true }), enemy(11)];
    for (const [i, target] of ranked.entries()) {
      assert.equal(skills.pickAimTarget(ranked.slice(i).reverse(), 6, true), target);
    }
    assert.equal(skills.pickAimTarget(ranked, 0.9, true), null);
  }
});

test('aim uses the 0.65 radian cone and falls back to the nearest in-range enemy', () => {
  let pointer = { x: 20, y: 10 };
  const { skills } = setup({ ports: { input: { getPointerWorld: () => pointer } } });
  const atAngle = (angle, distance) => enemy(10 + Math.cos(angle) * distance, 10 + Math.sin(angle) * distance);
  const boundary = atAngle(0.65, 3);
  const outside = atAngle(0.65001, 1);
  const centered = enemy(14);
  assert.equal(skills.pickAimTarget([outside, boundary, centered]), boundary);
  assert.equal(skills.pickAimTarget([outside, boundary, centered], 2), outside);
  pointer = null;
  assert.equal(skills.pickAimTarget([outside, boundary, centered]), outside);
  assert.equal(skills.pickAimTarget([]), null);
});

test('dash and overdrive stop when paused, modal-blocked or cooling down', () => {
  const { ctx, game, h, skills, events, calls } = setup();
  ctx.setPaused(true);
  assert.equal(skills.castHeroDash(), false);
  assert.equal(skills.castHeroOverdrive(), false);
  ctx.setPaused(false);
  game.activeModal = { type: 'perk' };
  assert.equal(skills.castHeroDash(), false);
  assert.equal(skills.castHeroOverdrive(), false);
  assert.equal(events.length, 0);
  game.activeModal = null;
  h.dashCd = 1.25;
  h.ultCd = 2;
  assert.equal(skills.castHeroDash(), false);
  assert.equal(skills.castHeroOverdrive(), false);
  assert.deepEqual(calls('toast'), [['烈焰冲刺冷却中 (1.3s)', true], ['全军超载冷却中 (2.0s)', true]]);
  assert.deepEqual([game.curWaveTel.dashCount, game.curWaveTel.ultCount], [0, 0]);
});

test('dash normalizes WASD, clamps the hero and applies cadence cooldown and invulnerability', () => {
  const { h, game, skills, calls } = setup({ hero: { x: 62, y: 2 }, aux: ['aux_dash_cadence'],
    ports: { input: { getKeys: () => new Set(['d', 'w']), getPointerWorld: () => ({ x: 1, y: 40 }) } } });
  assert.equal(skills.castHeroDash(), true);
  assert.deepEqual([h.x, h.y], [62.8, 1.2]);
  near(h.invuln, 0.66);
  near(h.dashCd, 3.85);
  assert.deepEqual([h.shield, h.shieldTimer, game.stats.shieldGained, game.curWaveTel.dashCount], [35, 3.5, 35, 1]);
  assert.deepEqual(calls('audio'), [['fire', 1.2]]);
  assert.deepEqual(calls('render'), [[]]);
});

test('dash uses fresh screen coordinates with either a bound setter or the default no-op', () => {
  for (const bindSetter of [false, true]) {
    let point;
    const { h, skills } = setup({ ports: {
      input: { getPointerScreen: () => ({ x: 200, y: 300 }), getPointerWorld: () => ({ x: 3, y: 10 }),
        ...(bindSetter && { setPointerWorld: value => { point = value; } }) },
      viewport: { screenToWorld: (x, y) => ({ x: x / 20, y: y / 20 }) },
    } });
    assert.equal(skills.castHeroDash(), true);
    assert.deepEqual([h.x, h.y], [10, 13.8]);
    if (bindSetter) assert.deepEqual(point, { x: 10, y: 15 });
  }
  const { h, skills } = setup({ hero: { face: -1 } });
  assert.equal(skills.castHeroDash(), true);
  assert.deepEqual([h.x, h.y], [6.2, 10]);
});

test('breaker dash lands a shockwave and applies the equipped aftershock or tempest upgrade', () => {
  for (const enhancement of ['w20_brk_aftershock_dash', 'w20_brk_tempest_step']) {
    const affected = enemy(16.6);
    const outOfRange = enemy(16.71);
    const { h, game, skills, calls } = setup({ hero: w20('breaker_momentum', enhancement), run: { enemies: [affected, outOfRange] } });
    skills.castHeroDash();
    near(h.dashCd, 3.36);
    assert.equal(game.stats.w20BreakerSlams, 1);
    assert.equal(affected.vulnT, 3);
    assert.equal(affected.hp, 433);
    assert.equal(outOfRange.hp, 500);
    assert.deepEqual(calls('w20'), [['base'], ['enhancement']]);
    if (enhancement === 'w20_brk_aftershock_dash') {
      assert.deepEqual(h.w20AftershockQueue, [{ x: 13.8, y: 10, t: 0.45, r: 3.8, dmgMult: 1.25 }]);
      assert.equal(game.projectiles.length, 0);
    } else {
      assert.equal(h.w20AftershockQueue, undefined);
      assert.deepEqual(game.projectiles.map(p => [p.w20Source, p.dmg, p.pierce]), Array(3).fill([enhancement, 38, 3]));
      for (const [i, p] of game.projectiles.entries()) near(Math.atan2(p.vy, p.vx), (i - 1) * 0.22);
    }
  }
});

test('frost dash pulse requires a pre-existing frost shield and respects its cooldown', () => {
  for (const [frostTrio, direction, enhancement, active, cooldown, expected] of [
    [true, null, null, true, 0, true],
    [false, 'frost_bastion_counter', null, true, 0, true],
    [false, 'frost_bastion_counter', 'w20_frost_dash_ring', true, 0, true],
    [false, 'frost_bastion_counter', 'w20_frost_dash_ring', false, 0, false],
    [false, null, null, true, 0, false],
    [true, null, null, true, 1, false],
  ]) {
    const { game, skills, calls } = setup({ frostTrio, hero: { ...(direction && w20(direction, enhancement)),
      shield: 20, frostShieldActive: active, frostActivePulseCd: cooldown } });
    skills.castHeroDash();
    assert.deepEqual(calls('pulse'), expected ? [[3.25, 46, 1, 'dash_shield']] : []);
    const trail = expected && enhancement;
    assert.deepEqual(calls('shield'), trail ? [[24, { duration: 5, source: 'w20_frost_dash_ring', noFullShieldPulse: true }]] : []);
    assert.deepEqual(game.zones.map(z => [z.kind, z.x, z.dps]), trail ? [['frostTrail', 13.8, 32]] : []);
  }
});

test('fire dash detonates premarked targets near the landing and phantom stride applies trail statuses', () => {
  const trail = enemy(10);
  const marked = enemy(16.99, 10, { fireMarkT: 1 });
  const far = enemy(17.01, 10, { fireMarkT: 1 });
  const { h, skills, calls } = setup({ hero: { ...w20('fire_chain_surge', 'w20_fire_dash_detonator'),
    destinyEnhancements: { destiny_phantom_stride: true } }, run: { enemies: [trail, marked, far] } });
  skills.castHeroDash();
  near(h.dashCd, 3.444);
  assert.equal(h.destinyDashBuffT, 2.2);
  assert.deepEqual(calls('destiny'), [['destiny_phantom_stride']]);
  assert.deepEqual(calls('mark'), [[trail, 2, 'w20_fire_dash_detonator', 5], [trail, 1, 'destiny_phantom_stride', 4.5]]);
  assert.deepEqual(calls('slow'), [[trail, 0.4, 2.8, 'destiny_phantom_stride']]);
  assert.deepEqual(calls('detonate'), [[marked, 1.15, { radius: 2, skillKey: 'dash' }]]);
  assert.deepEqual(calls('w20'), [['enhancement']]);
});

test('sword echo emits one or four sword waves and thunder gear strikes at the correct dash endpoints', () => {
  for (const [level, tier, count] of [[1, 2, 1], [2, 3, 4]]) {
    const start = enemy(10);
    const landing = enemy(13.8);
    const { game, skills, calls } = setup({ hero: { perks: { sword_echo: level }, combos: { thunder_fire: true } },
      sets: { thunder: tier }, run: { enemies: [start, landing] } });
    skills.castHeroDash();
    assert.equal(game.projectiles.length, count);
    for (const [i, p] of game.projectiles.entries()) {
      assert.deepEqual([p.kind, p.pierce, p.dmg, p.isThunderFireCombo], ['firewave', 2, 36, true]);
      near(Math.atan2(p.vy, p.vx), [0, Math.PI / 2, Math.PI, -Math.PI / 2][i]);
    }
    assert.deepEqual(calls('chain').map(([target, dmg, chains, opts]) => [target, dmg, chains, opts.ox]),
      tier === 2 ? [[landing, 40, 3, 13.8]] : [[landing, 40, 4, 13.8], [start, 40, 4, 10]]);
  }
});

test('overdrive lasts 5s or 8s and nova reduces cooldown and hits only enemies within range', () => {
  const base = setup({ hero: { perks: { ult_engine: 1 } } });
  assert.equal(base.skills.castHeroOverdrive(), true);
  assert.deepEqual([base.h.ultTimer, base.h.ultCd], [5, 18]);
  const nearEdge = enemy(14.59);
  const outside = enemy(14.61);
  const { h, game, skills, calls } = setup({ hero: { perks: { ult_engine: 2 },
    destinyEnhancements: { destiny_overdrive_nova: true } }, run: { enemies: [nearEdge, outside] } });
  assert.equal(skills.castHeroOverdrive(), true);
  assert.deepEqual([h.ultTimer, h.ultCd, game.curWaveTel.ultCount, game.shake], [8, 14.04, 1, 6]);
  assert.deepEqual(calls('destiny'), [['destiny_overdrive_nova']]);
  assert.deepEqual(calls('shield'), [[45, { duration: 6, source: 'destiny_overdrive_nova' }]]);
  assert.deepEqual(calls('mark'), [[nearEdge, 1, 'destiny_overdrive_nova', 5]]);
  assert.deepEqual(calls('slow'), [[nearEdge, 0.5, 3.2, 'destiny_overdrive_nova']]);
  assert.deepEqual([nearEdge.hp, outside.hp], [422, 500]);
});

test('breaker aftershock pulls only movable enemies and resonates with fire and frost', () => {
  const movable = enemy(12, 10, { vulnT: 4 });
  const boss = enemy(13, 10, { boss: true });
  const unstoppable = enemy(11, 10, { unstoppable: true });
  const { skills, calls, events } = setup({ hero: w20('breaker_momentum', 'w20_brk_state_resonance'),
    run: { enemies: [movable, boss, unstoppable, enemy(15), enemy(12, 11, { hp: 0 })] } });
  assert.equal(skills.executeBreakerShockwave(10, 10, 3.8, 1.25, true), 3);
  near(movable.x, 11.15);
  assert.deepEqual([boss.x, unstoppable.x, movable.vulnT, boss.vulnT, movable.hp], [13, 11, 4, 3, 442]);
  assert.deepEqual(events.slice(2, 6).map(([type]) => type), ['mark', 'slow', 'damage', 'detonate']);
  assert.deepEqual(calls('shield'), [[22, { duration: 4.5, source: 'w20_breaker_dash' }]]);
  assert.deepEqual(calls('w20'), [['enhancement']]);
});

test('breaker elite hunter chains lightning and reduces dash cooldown, while aegis stacks shield by hit count', () => {
  const elite = enemy(12, 10, { elite: true });
  const hunt = setup({ hero: { ...w20('breaker_momentum', 'w20_brk_elite_hunter'), dashCd: 0.8 }, run: { enemies: [elite] } });
  assert.equal(hunt.skills.executeBreakerShockwave(10, 10, 3, 1), 1);
  assert.equal(hunt.h.dashCd, 0);
  assert.deepEqual(hunt.calls('chain'), [[elite, 41, 2, { ox: 12, oy: 7, skillKey: 'dash', noChainProc: true }]]);
  const aegis = setup({ hero: w20('breaker_momentum', 'w20_brk_vanguard_aegis'), run: { enemies: [enemy(11), enemy(12)] } });
  assert.equal(aegis.skills.executeBreakerShockwave(10, 10, 3, 1), 2);
  assert.deepEqual(aegis.calls('shield'), [[24, { duration: 4.8, source: 'w20_brk_vanguard_aegis' }]]);
});

test('hero tick decays timers, resets leech and clears expired frost shield before refreshing bulwark', () => {
  const timers = ['dashCd', 'ultCd', 'ultTimer', 'dashBuffT', 'destinyDashBuffT', 'destinyFrostMoveT',
    'destinyEmberCd', 'destinyBreakerCd', 'thornsCd', 'frostPulseCd', 'frostActivePulseCd',
    'gearFrostShieldCd', 'w20TacticalReadyT', 'invuln', 'armorBreakT'];
  const { h, skills, calls, game } = setup({ hero: {
    ...Object.fromEntries(timers.map(name => [name, 1])), leechTimer: 0.875, leechUsed: 10,
    shield: 20, shieldTimer: 0.125, frostShieldActive: true,
    destinyEnhancements: { destiny_aegis_bulwark: true },
  } });
  skills.updateHero(0.25);
  assert.deepEqual(timers.map(name => h[name]), timers.map(() => 0.75));
  assert.deepEqual([h.leechTimer, h.leechUsed, h.shield, h.shieldTimer, h.frostShieldActive], [0.125, 0, 0, 0, false]);
  assert.equal(h.destinyBulwarkTimer, 7.75);
  game.phase = 'prep';
  skills.updateHero(7.75);
  assert.equal(h.destinyBulwarkTimer, 7.75);
  assert.deepEqual(calls('shield'), []);
  game.phase = 'wave';
  skills.updateHero(7.75);
  assert.equal(h.destinyBulwarkTimer, 8);
  assert.deepEqual(calls('destiny'), [['destiny_aegis_bulwark']]);
  assert.deepEqual(calls('shield'), [[32, { duration: 5.5, source: 'destiny_aegis_bulwark' }]]);
});

test('hero tick applies due aftershocks and keeps later entries in the queue', () => {
  const target = enemy(12);
  const due = { x: 10, y: 10, r: 3.8, t: 0.25, dmgMult: 1.25 };
  const later = { x: 1, y: 2, r: 3.8, t: 0.75, dmgMult: 1.25 };
  const { h, skills } = setup({ hero: { ...w20('breaker_momentum', 'w20_brk_aftershock_dash'),
    w20AftershockQueue: [due, later] }, run: { enemies: [target] } });
  skills.updateHero(0.25);
  assert.deepEqual(h.w20AftershockQueue, [later]);
  assert.equal(later.t, 0.5);
  near(target.x, 11.15);
  assert.deepEqual([target.hp, target.vulnT], [442, 3]);
});

test('hero tick refreshes the frost shield aura and chills nearby enemies', () => {
  const target = enemy(13.3);
  const outside = enemy(13.5);
  const { h, skills, calls } = setup({ hero: { ...w20('frost_bastion_counter'),
    shield: 20, frostShieldActive: true, w20FrostAuraTimer: 0.25 }, run: { enemies: [target, outside] } });
  skills.updateHero(0.25);
  assert.deepEqual([target.slowT, outside.slowT], [2.6, 0]);
  assert.equal(h.w20FrostAuraTimer, 1.6);
  assert.deepEqual(calls('w20'), [['base']]);
});

test('hero tick uses converted pointer movement in the same frame and applies crowd slowdown only during combat', () => {
  for (const [phase, bindSetter] of [['wave', true], ['prep', true], ['wave', false]]) {
    let point = { x: 5, y: 10 };
    const { h, game, skills } = setup({ run: { phase, enemies: [enemy(10.5), enemy(9.5)] }, ports: {
      input: { isPointerDown: () => true, getPointerScreen: () => ({ x: 30, y: 20 }),
        getPointerWorld: () => point, ...(bindSetter && { setPointerWorld: value => { point = value; } }) },
      viewport: { screenToWorld: (x, y) => ({ x: x / 2, y: y / 2 }) },
    } });
    skills.updateHero(0.2);
    const distance = phase === 'wave' ? 0.78 : 1;
    near(h.x, 10 + distance);
    assert.deepEqual([h.y, h.moving, point], [10, true, { x: bindSetter ? 15 : 5, y: 10 }]);
    near(game.curWaveTel.moveDist, phase === 'wave' ? distance : 0);
  }
});

test('spirit sword requires a learned skill and a nearby enemy while sword gear adds volleys on movement', () => {
  const noSkill = setup({ hero: { skillTimers: { spirit: 0 } }, run: { enemies: [enemy(12)] } });
  noSkill.skills.updateHero(0.2);
  assert.equal(noSkill.game.projectiles.length, 0);
  for (const [tier, count, slow] of [[2, 2, 0], [3, 3, 0.25]]) {
    const { h, game, skills } = setup({ hero: { skills: { berserk: 1 }, skillTimers: { spirit: 0 }, swordSetTimer: 0 },
      sets: { sword: tier }, run: { enemies: [enemy(15.51)] },
      ports: { input: { getKeys: () => new Set(['d']) } } });
    skills.updateHero(0.2);
    assert.deepEqual(game.projectiles.map(p => [p.opts.skillKey, p.dmg, p.opts.slow]), Array(count).fill(['perk', 22, slow]));
    assert.equal(h.skillTimers.spirit, 0);
    assert.equal(h.swordSetTimer, 1.6);
    skills.updateHero(0.2);
    const projectile = game.projectiles.at(-1);
    assert.deepEqual([projectile.opts.skillKey, projectile.dmg, projectile.vx, h.skillTimers.spirit], ['spirit', 14, 15.5, 0.95]);
  }
});

test('frost domain damages and slows only enemies within its level-dependent radius', () => {
  for (const [level, damage, slow] of [[1, 11, 0.35], [2, 18, 0.5]]) {
    const close = enemy(13);
    const far = enemy(14);
    const { h, skills, calls } = setup({ hero: { skills: { berserk: 1 }, frostDomainTick: 0,
      perks: { frost_domain: level } }, run: { enemies: [close, far, enemy(14.51)] } });
    skills.updateHero(0.2);
    assert.equal(h.frostDomainTick, 0.45);
    assert.deepEqual(calls('damage').map(([e, dmg, opts]) => [e, dmg, opts.slow]),
      (level === 1 ? [close] : [close, far]).map(e => [e, damage, slow]));
  }
});

test('orbiting blades shatter chilled targets, respect hit cooldown and fire both Wanjian swords', () => {
  const chilled = enemy(11.75, 10, { slowT: 1 });
  const { h, game, skills, calls } = setup({ hero: { skills: { blades: 1 }, combos: { ice_blades: true, wanjian: true } },
    run: { enemies: [chilled] } });
  skills.updateHero(0);
  skills.updateHero(0);
  assert.deepEqual(calls('damage').map(([, dmg, opts]) => [dmg, opts.skillKey, opts.slow]),
    [[22, 'blades', 0.35], [40, 'combo', undefined]]);
  assert.equal(chilled.hp, 438);
  assert.deepEqual([h.bladeHitMap.get(chilled.id), h.shatterCdMap.get(chilled.id), h.wanjianTimer], [10, 10, 2.4]);
  assert.deepEqual(game.projectiles.map(p => [p.comboStyle, p.dmg, p.x]), [['wanjian', 23, 11.75], ['wanjian', 23, 8.25]]);
});

for (const [branch, kind, count, damage, property, value] of [
  ['fw_ring_detonate', 'firewave', 8, 39, 'pierce', 3],
  ['fw_mortar_cluster', 'fireball', 3, 45, 'burn', 22],
  ['fw_brand_pierce', 'firewave', 3, 44, 'pierce', 4],
  ['fw_homing_ember', 'firewave', 2, 39, 'bounceLeft', 1],
]) {
  test(`fire wave ${branch} emits its branch projectiles`, () => {
    const boss = enemy(10, 14, { boss: true });
    let rngCalls = 0;
    const { game, skills } = setup({ hero: { skills: { firewave: 1 }, w10Branch: { firewave: branch } },
      run: { enemies: [enemy(12), boss], rnd: () => { rngCalls++; return 0.5; } } });
    skills.updateHero(0);
    assert.deepEqual(game.projectiles.map(p => [p.w10Branch, p.kind, p.dmg, p[property]]),
      Array(count).fill([branch, kind, damage, value]));
    assert.equal(rngCalls, branch === 'fw_mortar_cluster' ? 3 : 0);
    if (branch === 'fw_mortar_cluster') {
      assert.deepEqual([game.projectiles[0].tx, game.projectiles[0].ty], [boss.x, boss.y]);
      near(game.projectiles[1].ty, boss.y + 1.35 * Math.sqrt(3) / 2);
      near(game.projectiles[2].ty, boss.y - 1.35 * Math.sqrt(3) / 2);
    }
    if (branch === 'fw_homing_ember') {
      near(Math.atan2(game.projectiles[0].vy, game.projectiles[0].vx), Math.PI / 2 - 0.1);
    }
  });
}

for (const [branch, chains, marks, detonation] of [
  ['th_storm_orb', 0, 0, null], ['th_judgment_pillar', 3, 1, [1.15, 1.85]],
  ['th_arc_web', 6, 2, [1.15, 1.8]], ['th_heaven_brand', 3, 2, [1.25, 1.9]],
]) {
  test(`thunder ${branch} applies its chain, field or orb effects`, () => {
    const ordinary = enemy(12);
    const boss = enemy(10, 14, { boss: true });
    let rngCalls = 0;
    const { game, skills, calls } = setup({ hero: { skills: { thunder: 1 }, w10Branch: { thunder: branch } },
      run: { enemies: [ordinary, boss], rnd: () => { rngCalls++; return 0.75; } } });
    skills.updateHero(0);
    if (branch === 'th_storm_orb') {
      assert.deepEqual(game.projectiles.map(p => [p.w10Branch, p.pierce, p.dmg, p.splash]), Array(2).fill([branch, 99, 52, 1.45]));
      assert.deepEqual(calls('shield'), [[10, 4, 80]]);
      assert.deepEqual(calls('chain'), []);
    } else {
      assert.deepEqual(calls('chain').map(([e, damage, count]) => [e, damage, count]),
        [[boss, 45, chains], [branch === 'th_heaven_brand' ? boss : ordinary, 45, chains]]);
    }
    assert.deepEqual(calls('mark').map(([, stacks, source]) => [stacks, source]), Array(marks).fill([marks === 1 ? 2 : 1, branch]));
    assert.deepEqual(calls('detonate').map(([, mult, radius, skill]) => [mult, radius, skill]),
      Array.from({ length: marks }, () => [...detonation, 'thunder']));
    assert.deepEqual(game.zones.map(z => [z.kind, z.x, z.y, z.dps]), branch === 'th_judgment_pillar' ? [['thunderField', 10, 14, 34]] : []);
    assert.equal(rngCalls, ['th_judgment_pillar', 'th_arc_web'].includes(branch) ? 1 : 0);
  });
}

test('fire mortar consumes its three RNG samples before thunder chooses its secondary target', () => {
  const ordinary = enemy(12);
  const boss = enemy(10, 14, { boss: true });
  const trace = [];
  const samples = [0.1, 0.2, 0.3, 0.75];
  const { skills, calls } = setup({ hero: { skills: { firewave: 1, thunder: 1 },
    w10Branch: { firewave: 'fw_mortar_cluster', thunder: 'th_arc_web' } },
    run: { enemies: [ordinary, boss], rnd: () => { trace.push(calls('chain').length); return samples.shift(); } } });
  skills.updateHero(0);
  assert.deepEqual(trace, [0, 0, 0, 1]);
  assert.equal(samples.length, 0);
  assert.deepEqual(calls('chain').map(([e]) => e), [boss, ordinary]);
});

for (const [branch, damage, slow, shield, cap, zone, shots] of [
  ['nv_seeking_vortex', 38, 0.6, 18, 90, 'frostVortex', 0],
  ['nv_prism_lance', 38, 0.55, 18, 90, undefined, 8],
  ['nv_trail_aegis', 38, 0.6, 22, 95, 'frostTrail', 0],
  ['nv_glacial_bastion', 44, 0.7, 26, 95, undefined, 0],
]) {
  test(`nova ${branch} applies its slow, damage and defensive effects`, () => {
    const target = enemy(branch === 'nv_seeking_vortex' ? 15 : branch === 'nv_glacial_bastion' ? 12.8 : 11.5);
    const { h, game, skills, calls } = setup({ hero: { skills: { nova: 1 }, w10Branch: { nova: branch } }, run: { enemies: [target] } });
    skills.updateHero(0);
    assert.equal(target.hp, 500 - damage);
    assert.deepEqual(calls('slow').map(([, amount, , source]) => [amount, source]), [[slow, branch]]);
    assert.deepEqual(calls('shield'), [[shield, branch === 'nv_seeking_vortex' ? 4.8 : 5, cap]]);
    assert.equal(game.zones[0]?.kind, zone);
    if (zone) assert.equal(game.zones[0].x, branch === 'nv_seeking_vortex' ? 15 : 10);
    assert.deepEqual(game.projectiles.map(p => [p.w10Branch, p.dmg, p.pierce]), Array(shots).fill([branch, 32, 3]));
    near(h.skillTimers.nova, branch === 'nv_trail_aegis' ? 1.7138 : 2.09);
  });
}

for (const [branch, x, freeze, zones, shields, rings] of [
  ['st_fissure_wave', 12, 0.75, [11.6, 13.2], [], 1],
  ['st_glacier_quake', 12.8, 1.2, [], [[22, 5, 95]], 1],
  ['st_aftershock_ring', 13.2, 0.75, [], [], 2],
  ['st_molten_crater', 12, 0.75, [10], [], 1],
]) {
  test(`stomp ${branch} applies its freeze and leaves its expected follow-up effects`, () => {
    const target = enemy(x);
    const { game, skills, calls } = setup({ hero: { skills: { stomp: 1 }, w10Branch: { stomp: branch } }, run: { enemies: [target] } });
    skills.updateHero(0);
    assert.deepEqual([target.hp, target.freezeT], [440, freeze]);
    assert.deepEqual(game.zones.map(z => [z.w10Branch, z.x, z.dps]), zones.map(zx => [branch, zx, 33]));
    assert.deepEqual(calls('shield'), shields);
    assert.equal(calls('ring').length, rings);
    if (branch === 'st_glacier_quake') {
      assert.deepEqual(calls('slow'), [[target, 0.65, 3.4, branch]]);
      assert.deepEqual(calls('mark'), []);
    } else {
      assert.deepEqual(calls('mark'), [[target, 2, branch, 5]]);
      assert.deepEqual(calls('detonate'), [[target, 1.25, 2, 'stomp']]);
    }
  });
}

test('quake blood scales with missing HP, emits eight fissures, and leeches on a successful hit', () => {
  const target = enemy(12);
  const { game, skills, calls } = setup({ hero: { hp: 50, skills: { stomp: 1 }, combos: { quake_blood: true } }, run: { enemies: [target] } });
  skills.updateHero(0);
  assert.deepEqual([target.hp, game.beams.length, game.shake], [410, 8, 7.5]);
  assert.equal(calls('damage')[0][2].skillKey, 'combo');
  assert.deepEqual(calls('lifesteal'), [[3]]);
});

for (const [branch, damage, shield, projectiles] of [
  ['bk_flame_aura', 34, [], []], ['bk_frost_armor', 34, [[16, 4.5, 90]], []],
  ['bk_blood_crescent', 0, [], [['firewave', 43, 4]]],
  ['bk_war_tempest', 0, [[14, 4.5, 90]], Array(4).fill(['arrow', 34, 3])],
]) {
  test(`berserk ${branch} runs its pulse and waits for the next cooldown`, () => {
    const target = enemy(12);
    const { h, game, skills, calls } = setup({ hero: { skills: { berserk: 1 }, w10Branch: { berserk: branch } }, run: { enemies: [target] } });
    skills.updateHero(0);
    skills.updateHero(0);
    assert.equal(h.skillTimers.berserk, 0.85);
    assert.equal(target.hp, 500 - damage);
    assert.deepEqual(calls('shield'), shield);
    assert.deepEqual(game.projectiles.map(p => [p.kind, p.dmg, p.pierce]), projectiles);
    if (branch === 'bk_flame_aura') {
      assert.deepEqual(calls('mark'), [[target, 1, branch, 4.5]]);
      assert.deepEqual(calls('detonate'), [[target, 1.15, 1.85, 'berserk']]);
    }
    if (branch === 'bk_frost_armor') assert.deepEqual(calls('slow'), [[target, 0.55, 2.8, branch]]);
    assert.deepEqual(calls('lifesteal'), branch === 'bk_blood_crescent' ? [[6]] : []);
  });
}

test('pickups preserve initial gem drift, magnetic speed, harvest speed and chest modal flags', () => {
  const drifting = { x: 11, y: 10, t: 0, vx: 2, vy: 1, xp: 1 };
  const magnet = { x: 13, y: 10, t: 1, xp: 2 };
  const distant = { x: 20, y: 10, t: 1, xp: 3 };
  const close = { x: 10.5, y: 10, t: 1, xp: 4 };
  const chest = { x: 11, y: 10, bob: 0, legend: true, shrineTier: 2 };
  const { h, game, vitals, calls } = setup({ run: { phase: 'prep', gems: [drifting, magnet, distant, close], chests: [chest], xpCombo: 10, xpComboTimer: 0.05 } });
  vitals.updatePickups(0.1);
  assert.deepEqual([drifting.x, drifting.y, magnet.magnetized, distant.x, h.xp, game.xpCombo, game.xpComboTimer], [11.2, 10.1, true, 20, 4, 1, 0.65]);
  near(magnet.x, 11.55);
  assert.deepEqual(game.gems, [drifting, magnet, distant]);
  assert.deepEqual(game.chests, []);
  assert.deepEqual(calls('modal'), [[{ type: 'chest', legend: true, shrineTier: true }]]);
  assert.deepEqual(calls('audio'), [['xp', 1.045], ['chest', 1.15]]);
  game.phase = 'harvest';
  vitals.updatePickups(0.1);
  near(distant.x, 17.2);
  assert.equal(distant.magnetized, true);
});

test('W30 heal orbs honor holy magnet range, cap healing and record shield gain and collection', () => {
  for (const main of [undefined, { id: 'main_holy', effects: { healOrbMagnetBonus: 1 } }]) {
    const pulled = { x: 13.7, y: 10, life: 1 };
    const close = { x: 10.9, y: 10, life: 1, hpPct: 0.2, shield: 30 };
    const expired = { x: 20, y: 10, life: 0.05 };
    const { h, game, vitals, calls } = setup({ main, hero: { hp: 85, shield: 10 }, run: { healOrbs: [pulled, close, expired], w30Battle: {} } });
    vitals.updatePickups(0.1);
    near(pulled.x, main ? 12.65 : 13.7);
    assert.deepEqual(game.healOrbs, [pulled]);
    assert.deepEqual([h.hp, h.shield, h.shieldTimer, game.stats.shieldGained, game.w30Battle.healOrbsCollected], [100, 30, 4.5, 20, 1]);
    assert.match(calls('float')[0][2], /\+15$/);
  }
});

test('one XP award can cross even and odd levels with one modal and the correct HP gains', () => {
  const { h, game, vitals, calls } = setup({ hero: { hp: 5 }, run: { xpCombo: 14 } });
  vitals.gainHeroXp(h.xpNext + xpForLevel(2) + 1);
  assert.deepEqual([h.lv, h.xp, h.xpNext, h.realm, h.baseMaxHp, h.maxHp, h.hp, game.xpCombo], [3, 1, xpForLevel(3), 4, 142, 142, 95, 14]);
  assert.deepEqual(calls('modal'), [[{ type: 'levelup' }]]);
  assert.match(calls('float')[0][2], /Lv\.2 · 领悟神通！$/);
  assert.match(calls('float')[1][2], /Lv\.3 · 灵脉淬体！$/);
  assert.match(calls('toast')[0][0], /生命上限 \+24、恢复 \+50/);
});

test('damage ignores invulnerable and noncombat heroes, and holy extends prep and wave invulnerability', () => {
  const { h, game, vitals, events } = setup({ main: { id: 'main_holy', effects: { invulnBonus: 0.2 } }, hero: { invuln: 1 } });
  assert.equal(vitals.damageHero(12), undefined);
  h.invuln = 0;
  game.phase = 'harvest';
  assert.equal(vitals.damageHero(12), undefined);
  assert.deepEqual([h.hp, h.invuln, events.length, game.combatLog.hits.length], [100, 0, 0, 0]);
  for (const phase of ['prep', 'wave']) {
    game.phase = phase;
    h.invuln = 0;
    vitals.damageHero(12);
    near(h.invuln, 0.48);
  }
  assert.equal(h.hp, 76);
});

test('damage rounds stacked mitigation before shield absorption and records only actual HP loss', () => {
  const source = { attackerName: '首领', attackerKind: 'boss6', skillName: '重击', isBoss: true, isBossCore: true };
  const { h, game, vitals, calls } = setup({ gear: { dmgReduce: 0.2 }, sets: { blood: 3 }, hero: { hp: 45,
    shield: 20, armorBreakT: 2, perks: { frost_domain: 2 }, destinyEnhancements: { destiny_aegis_bulwark: true } } });
  vitals.damageHero(83, source);
  assert.deepEqual([h.hp, h.shield, h.invuln, game.curWaveTel.hitsTaken, game.curWaveTel.dmgTaken,
    game.curWaveTel.minHpPct, game.runMetrics.hpLost], [18, 0, 0.28, 1, 27, 18, 27]);
  assert.deepEqual(game.combatLog.hits, [{ wave: 20, waveClock: 10, runClock: 10, ...source,
    isBossAux: false, auxKey: null, rawAmt: 83, rawDamageAfterMitigation: 47, shieldAbsorbed: 20,
    hpLost: 27, hpAfter: 18, hpPctAfter: 18, deflected: false, fatal: false }]);
  assert.deepEqual([game.combatLog.totalHpLost, game.combatLog.totalShieldAbsorbed], [27, 20]);
  assert.deepEqual(calls('danger'), [[true]]);
  assert.deepEqual(calls('flash'), [['dmg']]);
});

test('tactical reserve deflects only the first qualifying hit until the wave resets it', () => {
  const { h, game, vitals, calls } = setup({ aux: ['aux_tactical_reserve'], hero: { hp: 200, maxHp: 200 } });
  for (const amount of [49, 50, 50]) {
    h.invuln = 0;
    vitals.damageHero(amount);
  }
  assert.equal(h.hp, 68);
  assert.deepEqual(game.combatLog.hits.map(hit => [hit.hpLost, hit.deflected]), [[49, false], [33, true], [50, false]]);
  assert.deepEqual(game.metaRunState, { deflectReady: false, deflectTriggers: 1 });
  assert.equal(calls('ring').length, 1);
  game.wave++;
  game.metaRunState.deflectReady = true;
  h.invuln = 0;
  vitals.damageHero(50);
  assert.equal(h.hp, 35);
  assert.equal(game.metaRunState.deflectTriggers, 2);
});

test('frost shield absorbs first and calls the hit pulse before the break pulse', () => {
  for (const [config, hitPulse] of [
    [{ frostTrio: true, sets: { frost: 3 } }, [3.1, 44, 1, 'shield_hit']],
    [{ hero: { ...w20('frost_bastion_counter'), w10Branch: { nova: 'nv_glacial_bastion' } } }, [3.1, 46, 1, 'shield_hit']],
    [{ sets: { frost: 3 }, hero: { w10Branch: { nova: 'nv_prism_lance' } } }, [2.8, 36, 0.9, 'w10']],
  ]) {
    const { h, game, vitals, calls } = setup({ ...config, hero: { ...config.hero, shield: 20, frostShieldActive: true } });
    vitals.damageHero(10);
    assert.deepEqual([h.hp, h.shield, h.frostShieldActive, game.curWaveTel.hitsTaken], [100, 10, true, 0]);
    assert.deepEqual(calls('pulse'), [hitPulse]);
    assert.deepEqual(calls('flash'), []);
    h.invuln = 0;
    vitals.damageHero(15);
    assert.deepEqual([h.hp, h.shield, h.frostShieldActive], [95, 0, false]);
    assert.deepEqual(calls('pulse'), [hitPulse, hitPulse, [3.2, 42, 1, 'w10']]);
    assert.deepEqual(calls('danger'), [[false], [false]]);
    assert.deepEqual(game.combatLog.hits.map(hit => [hit.shieldAbsorbed, hit.hpLost]), [[10, 0], [10, 5]]);
  }
});

test('thorns retaliates, grants shield, and heals and freezes only at level two', () => {
  for (const [level, shield, damage, hp, freeze] of [[1, 28, 32, 65, 0], [2, 60, 55, 80, 1]]) {
    const target = enemy(13.05);
    const boss = enemy(11, 10, { boss: true });
    const outside = enemy(13.2);
    const { h, game, vitals, calls } = setup({ hero: { hp: 75, perks: { body_thorns: level } }, run: { enemies: [target, boss, outside] } });
    vitals.damageHero(10);
    assert.deepEqual([h.hp, h.thornsCd, h.shield, h.shieldTimer, game.stats.shieldGained], [hp, 3, shield, 4, shield]);
    assert.deepEqual([target.hp, target.freezeT, boss.hp, boss.freezeT, outside.hp], [500 - damage, freeze, 500 - damage, 0, 500]);
    assert.equal(game.combatLog.hits[0].hpAfter, 65);
    h.invuln = 0;
    vitals.damageHero(10);
    assert.equal(h.shield, shield - 10);
    assert.equal(calls('damage').length, 2);
  }
});

test('undying will saves one lethal hit per wave, updates the vignette again, then records a fatal hit', () => {
  for (const [level, restoredHp, ultTimer] of [[1, 50, 0], [2, 80, 4]]) {
    const source = { attackerName: '玄龙', skillName: '灭世', isBoss: true, isBossCore: true };
    const target = enemy(16);
    const outside = enemy(16.01);
    const { h, game, vitals, calls, events } = setup({ hero: { hp: 12, perks: { undying_will: level } }, run: { enemies: [target, outside] } });
    vitals.damageHero(500, source);
    assert.deepEqual([h.hp, h.invuln, h.undyingUsedWave, h.ultTimer, game.shake], [restoredHp, 2.5, 20, ultTimer, 10]);
    assert.deepEqual([target.hp, outside.hp], [380, 500]);
    assert.deepEqual(calls('danger'), [[false], [false]]);
    assert.ok(events.findLastIndex(([type]) => type === 'danger') > events.findIndex(([type]) => type === 'damage'));
    assert.equal(calls('banner').length, 1);
    assert.deepEqual(calls('finish'), []);
    assert.deepEqual(game.combatLog.hits.map(hit => [hit.hpLost, hit.fatal]), [[12, false]]);
    h.invuln = 0;
    vitals.damageHero(500, source);
    assert.equal(h.hp, 0);
    assert.equal(game.combatLog.fatalSource, game.combatLog.hits.at(-1));
    assert.deepEqual([game.combatLog.fatalSource.attackerName, game.combatLog.fatalSource.hpLost,
      game.combatLog.fatalSource.fatal], ['玄龙', restoredHp, true]);
    assert.deepEqual(calls('finish'), [[false]]);
    assert.equal(vitals.getRecentThreatSummary().fatalSource, game.combatLog.fatalSource);
  }
});

test('combat log caps recent entries at 160 while keeping full source totals', () => {
  const source = { attackerName: '偏将', skillName: '连击', isBossAux: true, auxKey: 'shaman' };
  const { h, game, vitals } = setup({ hero: { hp: 1000, maxHp: 1000 } });
  for (let i = 1; i <= 161; i++) {
    game.waveClock = i;
    h.invuln = 0;
    vitals.damageHero(2, source);
  }
  const { hits, bySource, totalHitsTaken, totalHpLost, lowestHpPct } = game.combatLog;
  assert.deepEqual([hits.length, hits[0].runClock, hits.at(-1).runClock], [160, 2, 161]);
  assert.deepEqual([totalHitsTaken, totalHpLost, lowestHpPct], [161, 322, 68]);
  assert.deepEqual(bySource['偏将｜连击'], { attackerName: '偏将', skillName: '连击', isBossCore: false, isBossAux: true,
    hits: 161, totalHpLost: 322, maxSingleHit: 2 });
  assert.equal(hits[0].auxKey, 'shaman');
});

test('threat summaries use the effective or settled clock and group only in-window hits by actual HP loss', () => {
  const { h, ctx, game, vitals } = setup();
  assert.equal(vitals.getCombatLogNowSec(), 10);
  assert.deepEqual(vitals.getRecentThreatSummary(), { windowSec: 5, anchorSec: 10, hitCount: 0, totalHpLost: 0,
    totalDmg: 0, hits: [], topThreats: [], fatalSource: null });
  for (const [clock, attackerName, amt] of [[6.99, '旧伤', 10], [7, '偏将', 4], [9, '首领', 9], [11, '偏将', 5], [13, '未来', 10]]) {
    game.waveClock = clock;
    h.invuln = 0;
    vitals.damageHero(amt, { attackerName, skillName: '合击', isBossCore: attackerName === '首领' });
  }
  game.runMetrics.totalEffectiveSec = 15.126;
  assert.equal(vitals.getCombatLogNowSec(), 15.13);
  game.combatLog.settledAtRunClock = 12;
  const summary = vitals.getRecentThreatSummary();
  assert.deepEqual([summary.anchorSec, summary.hitCount, summary.totalHpLost, summary.totalDmg], [12, 3, 18, 18]);
  assert.deepEqual(summary.hits.map(hit => hit.runClock), [7, 9, 11]);
  assert.notEqual(summary.hits[0], game.combatLog.hits[1]);
  assert.deepEqual(summary.topThreats.map(t => [t.attackerName, t.isBossCore, t.hits, t.totalHpLost, t.maxSingleHit]),
    [['偏将', false, 2, 9, 5], ['首领', true, 1, 9, 9]]);
  assert.equal(vitals.getRecentThreatSummary(2).hitCount, 1);
  ctx.setGame(null);
  assert.equal(vitals.getCombatLogNowSec(), 0);
  assert.equal(vitals.getRecentThreatSummary().hitCount, 0);
});
