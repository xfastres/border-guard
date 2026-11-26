import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameSystems } from '../../src/app/bootstrap.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createDebugPresets } from '../../src/debug/presets.js';
import BALANCE from '../../src/data/balance.js';
import { BUILD_ROUTES, GEARS, GEAR_AFFIXES, HERO_SKILL_STARTERS, W10_SKILL_BRANCHES } from '../../src/data/index.js';

function setup(seed = 2026) {
  let ms = 1000;
  const entries = new Map();
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  const ctx = createRuntimeContext({ ports: {
    storage: { getStorage: () => storage },
    clock: { perfNow: () => ms, nowMs: () => 1700000000000 + ms },
  } });
  const systems = createGameSystems(ctx);
  systems.meta.loadMetaSave();
  systems.run.startNewRun(seed, false);
  const noop = () => {};
  const load = createDebugPresets(ctx, {
    systems,
    ui: { hud: { renderAllUI: noop }, viewport: { fitCamera: noop, updateCamera: noop }, modals: { closeModal: noop } },
  }).loadTestPreset;
  return { ctx, systems, load, storage, entries, setClock: value => { ms = value; } };
}

test('all eight starts are selectable and can reach an owned W10 branch without redrawing on Back', () => {
  for (const key of HERO_SKILL_STARTERS) {
    const { ctx, systems } = setup();
    const game = ctx.game;
    game.activeModal = { type: 'starter', choices: HERO_SKILL_STARTERS };
    assert.equal(systems.w10.pickHeroSkill(key), true);
    assert.equal(game.hero.starterSkill, key);
    assert.equal(systems.w10.rollSkillChoices()[0], key);
    game.wave = 11;
    game.activeModal = { type: 'w10_breakthrough' };
    const result = systems.w10.selectW10BreakthroughSkill(key);
    assert.equal(result.choices.length, 3);
    assert.equal(new Set(result.choices.map(x => x.key)).size, 3);
    const hidden = W10_SKILL_BRANCHES[key].find(x => !game.w10Draft.choices.includes(x.key));
    assert.equal(systems.w10.pickW10BreakthroughBranch(hidden.key).ok, false);
    assert.deepEqual(systems.w10.selectW10BreakthroughSkill(key).choices, result.choices);
    assert.equal(systems.w10.pickW10BreakthroughBranch(result.choices[0].key).ok, true);
    assert.equal(game.hero.breakthroughs.w10.skillKey, key);
  }
});

test('every practice route can stage the correct W20 gate and each direction has enough distinct draft cards', () => {
  const { ctx, systems, load } = setup();
  for (const [key, route] of Object.entries(BUILD_ROUTES)) {
    assert.ok(route.gear.every(id => GEARS[id]));
    assert.ok(route.affixes.every(id => GEAR_AFFIXES[id]));
    assert.equal(load({ wave: 20, build: key }).ok, true);
    assert.equal(ctx.game.hero.breakthroughs.w10.skillKey, route.skill);
    assert.equal(ctx.game.w20State.preselectedDirection, route.direction);
    assert.equal(ctx.game.hero.breakthroughs.w20, null);
    assert.equal(systems.run.startWave(), true);
    assert.equal(ctx.game.w20State.lockedDirection, route.direction);
    assert.equal(ctx.game.hero.vouchers.w20, false);
    const pool = systems.w20.getValidW20EnhancementPool(route.direction);
    assert.ok(new Set(pool.map(card => card.key)).size >= 6);
    assert.equal(load({ wave: 21, build: key }).ok, true);
    assert.equal(ctx.game.hero.breakthroughs.w20.directionKey, route.direction);
    assert.equal(ctx.game.hero.vouchers.w20, true);
  }
});

test('wind, thunder, blood and holy accrue damage through distinct conditions with finite resources', () => {
  for (const route of ['wind', 'thunder', 'blood', 'holy']) {
    const { ctx, systems, load } = setup();
    load({ wave: 21, build: route });
    systems.run.startWave();
    const { game } = ctx;
    const h = game.hero;
    h.hp = Math.round(h.maxHp * 0.75);
    const firstHp = h.hp;
    const enemy = systems.combat.spawnEnemy('elite', 'east', 30, { x: h.x + 1.2, y: h.y });
    const baseline = game.stats.skillDmg.route;
    if (route === 'wind') {
      systems.combat.dealDamage(enemy, 40, { skillKey: 'swordlance', isWind: true });
      assert.equal(game.stats.skillDmg.route, baseline);
      systems.combat.onBuildDash();
      systems.combat.dealDamage(enemy, 40, { skillKey: 'swordlance', isWind: true });
      const used = game.stats.skillDmg.route;
      assert.ok(used > baseline);
      systems.combat.dealDamage(enemy, 40, { skillKey: 'swordlance', isWind: true });
      assert.equal(game.stats.skillDmg.route, used);
    }
    if (route === 'thunder') {
      for (let i = 0; i < 4; i++) systems.combat.dealDamage(enemy, 40, { isThunder: true });
      assert.equal(game.stats.skillDmg.route, baseline);
      systems.combat.dealDamage(enemy, 40, { isThunder: true });
      const used = game.stats.skillDmg.route;
      assert.ok(used > baseline);
      for (let i = 0; i < 80; i++) systems.combat.dealDamage(enemy, 40, { isThunder: true });
      assert.equal(game.stats.skillDmg.route, used);
    }
    if (route === 'blood') {
      systems.combat.beginBloodWindow();
      const spent = h.hp;
      assert.ok(spent < firstHp);
      assert.ok(spent >= h.maxHp * BALANCE.combat.routes.blood.minimumLife);
      systems.combat.dealDamage(enemy, 40, { fromHero: true });
      assert.ok(game.stats.skillDmg.route > baseline);
      assert.ok(h.hp > spent && h.hp <= firstHp);
    }
    if (route === 'holy') {
      const before = systems.combat.grantBuildShield(34);
      h.armorBreakT = 2;
      systems.combat.dealDamage(enemy, 40, { isHoly: true });
      assert.ok(game.stats.skillDmg.route > baseline);
      assert.equal(h.shield, before - BALANCE.combat.routes.holy.shieldCost);
      assert.equal(h.armorBreakT, 0);
    }
    assert.ok(Number.isFinite(enemy.hp));
    assert.ok(Number.isFinite(game.stats.dmgTotal));
  }
});

function useRouteCard(route, card, pack = false) {
  const { ctx, systems, load } = setup();
  load({ wave: 21, build: route });
  systems.run.startWave();
  const { hero, stats } = ctx.game;
  ctx.game.seal = null;
  ctx.game.subSeals = [];
  hero.gear = [];
  systems.equipmentCore.recomputeEquipmentSynergies();
  hero.hp = Math.round(hero.maxHp * 0.7);
  hero.moving = true;
  hero.breakthroughs.w20.enhancementKey = card;
  const spawn = (x, y) => systems.combat.spawnEnemy('elite', 'east', 120, { x, y });
  const target = spawn(hero.x + 1.5, hero.y);
  const other = pack ? [[1, 0], [1.2, 0.18], [1.6, -0.18], [2.1, 0.22], [2.3, -0.18]]
    .map(([dx, dy]) => spawn(target.x + dx, target.y + dy)) : [];
  if (route === 'wind' || route === 'holy') systems.combat.onBuildDash();
  if (route === 'blood') systems.combat.beginBloodWindow();
  const hpBeforeHit = hero.hp;
  if (route === 'holy') {
    systems.combat.grantBuildShield(60);
    hero.armorBreakT = 2;
  }
  const hit = { isWind: route === 'wind', isThunder: route === 'thunder', isHoly: route === 'holy', fromHero: true };
  for (let i = 0; i < (hit.isThunder ? 5 : 1); i++) systems.combat.dealDamage(target, 5, hit);
  return { hero, stats, target, other, hpBeforeHit };
}

test('wind cards change the sword path, slow flankers, protect dashes and reward duels', () => {
  const base = useRouteCard('wind', null, true);
  const cross = useRouteCard('wind', 'w20_wind_crosscut', true);
  const countHit = result => result.other.filter(e => e.hp < e.maxHp).length;
  assert.equal(countHit(base), 3);
  assert.equal(countHit(cross), 5);
  assert.equal(useRouteCard('wind', 'w20_wind_pin', true).other.filter(e => e.slowT > 0).length, 3);
  assert.equal(useRouteCard('wind', 'w20_wind_guard').hero.shield, 22);
  assert.ok(useRouteCard('wind', 'w20_wind_duel').stats.skillDmg.route > useRouteCard('wind', null).stats.skillDmg.route);
  assert.equal(useRouteCard('wind', 'w20_route_ward').hero.shield, BALANCE.combat.routes.shared.guard);
  assert.equal(useRouteCard('wind', 'w20_route_interrupt').target.vulnT, BALANCE.combat.routes.shared.vulnerability);
});

test('thunder cards change the number of targets, isolated damage, vulnerability and next charge', () => {
  const fork = useRouteCard('thunder', 'w20_storm_fork', true);
  assert.equal(fork.other.filter(e => e.hp < e.maxHp).length, 4);
  assert.ok(useRouteCard('thunder', 'w20_storm_focus').stats.skillDmg.route > useRouteCard('thunder', null).stats.skillDmg.route);
  assert.equal(useRouteCard('thunder', 'w20_storm_ground').target.vulnT, 2.8);
  assert.equal(useRouteCard('thunder', 'w20_storm_refill').target.stormCharge, 2);
});

test('blood cards preserve the life cost while changing cleave, recovery, shield or window', () => {
  const spread = useRouteCard('blood', 'w20_blood_spread', true);
  assert.equal(spread.other.filter(e => e.hp < e.maxHp).length, 4);
  const normal = useRouteCard('blood', null);
  const hunter = useRouteCard('blood', 'w20_blood_hunter');
  assert.ok(hunter.hero.hp - hunter.hpBeforeHit > normal.hero.hp - normal.hpBeforeHit);
  assert.equal(useRouteCard('blood', 'w20_blood_reserve').hero.shield, 32);
  assert.equal(useRouteCard('blood', 'w20_blood_feast').hero.routeCombat.bloodUntil, BALANCE.combat.routes.blood.duration + 2);
});

test('holy cards use a shield for wider judgement, purification, dash discount or recovery', () => {
  const reach = useRouteCard('holy', 'w20_sanctum_reach', true);
  assert.equal(reach.other.filter(e => e.hp < e.maxHp).length, 4);
  assert.equal(useRouteCard('holy', 'w20_sanctum_purify').hero.armorBreakT, 0);
  assert.equal(useRouteCard('holy', 'w20_sanctum_patience').hero.shield, 60 - BALANCE.combat.routes.holy.shieldCost / 2);
  const heal = useRouteCard('holy', 'w20_sanctum_heal');
  assert.equal(heal.hero.hp - heal.hpBeforeHit, 14);
});

function useW10Skill(build, branch, prepare = () => {}) {
  const { ctx, systems, load } = setup();
  load({ wave: 11, build });
  systems.run.startWave();
  const { game } = ctx;
  const { hero } = game;
  const skill = BUILD_ROUTES[build].skill;
  hero.skills = { [skill]: 4 };
  hero.w10Branch = { [skill]: branch };
  hero.skillTimers[skill] = 0;
  hero.skillTimers.spirit = 30;
  hero.gear = [];
  game.seal = null;
  game.subSeals = [];
  systems.equipmentCore.recomputeEquipmentSynergies();
  const spawn = (dx, dy) => systems.combat.spawnEnemy('elite', 'east', 120, { x: hero.x + dx, y: hero.y + dy });
  const target = spawn(2.2, 0);
  const targets = [[2.2, 0.4], [2.24, -0.6], [2.1, 0.9], [2.1, -0.9], [2.5, 0.7]].map(([x, y]) => spawn(x, y));
  prepare(hero, systems);
  systems.heroSkills.updateHero(0.02);
  return { hero, target, targets, projectiles: game.projectiles.filter(p => p.opts?.skillKey === skill) };
}

test('W10 sword and sun branches change attack shape and conditional defense in the normal skill update', () => {
  assert.equal(useW10Skill('wind', 'sl_returning_lance').projectiles[0].rebound, true);
  assert.equal(useW10Skill('wind', 'sl_cross_lanes').projectiles.length, 3);
  assert.equal(useW10Skill('wind', 'sl_sever_guard').projectiles[0].opts.vulnBoss, true);
  assert.equal(useW10Skill('wind', 'sl_stillpoint').projectiles.length, 0);
  const moving = useW10Skill('wind', 'sl_stillpoint', (h, s) => { h.goal = { x: h.x + 1, y: h.y }; s.combat.onBuildDash(); });
  assert.equal(moving.projectiles.length, 1);
  assert.equal(moving.hero.shield, 12);

  const baseline = useW10Skill('holy', null);
  const verdict = useW10Skill('holy', 'su_verdict', (h, s) => s.combat.grantBuildShield(22));
  assert.ok(verdict.target.hp < baseline.target.hp);
  assert.equal(useW10Skill('holy', 'su_shelter').hero.shield, baseline.hero.shield + 16);
  assert.equal(useW10Skill('holy', 'su_dawning').targets.filter(e => e.hp < e.maxHp).length, 5);
  assert.equal(useW10Skill('holy', 'su_cleansing', h => { h.armorBreakT = 3; }).hero.armorBreakT, 0);
});

test('same-chain trios replace duos exactly once across equipment and the expanded pool respects unlocks', () => {
  const { ctx, systems } = setup();
  assert.equal(systems.meta.getActiveRunGearKeys().includes('trailing_edge'), false);
  for (const route of ['wind', 'thunder', 'blood', 'holy']) {
    const r = BUILD_ROUTES[route];
    const first = systems.equipmentCore.createGearInstance(r.gear[0], { slotsCount: 2, affixes: r.affixes.slice(0, 2) });
    const third = systems.equipmentCore.createGearInstance(r.gear[1], { slotsCount: 1, affixes: r.affixes.slice(2) });
    ctx.game.hero.gear = [first];
    assert.equal(systems.equipmentCore.recomputeEquipmentSynergies().active[0].tier, 2);
    ctx.game.hero.gear.push(third, { ...first, uid: 'second-copy' });
    const full = systems.equipmentCore.recomputeEquipmentSynergies().active;
    assert.equal(full.length, 1);
    assert.equal(full[0].tier, 3);
  }
  for (let i = 0; i < 24; i++) {
    ctx.game.gold = 500;
    const { pendingOffer } = systems.destiny.rollDestinyGamble(100, { forceOutcome: 'win' });
    assert.ok(pendingOffer.choices.every(offer => !offer.gear || systems.meta.getActiveRunGearKeys().includes(offer.gear.baseKey)));
    assert.equal(new Set(pendingOffer.choices.map(offer => offer.category)).size, 3);
    systems.destiny.claimDestinyReward(0);
  }
});

test('new gear and affixes occur in normal offers, and the optional pack replaces active picks', () => {
  const { ctx, systems } = setup();
  const optional = ['trailing_edge', 'litany_mail'];
  const starters = ['smolder_edge', 'ice_lantern', 'reed_sword', 'copper_needle', 'blood_cord', 'sunward_charm'];
  const stock = new Set();
  for (let i = 0; i < 100; i++) {
    systems.shop.rollShop(true);
    for (const item of ctx.game.shop) if (item.gear) stock.add(item.gear.baseKey);
  }
  assert.ok(starters.every(id => stock.has(id)));
  assert.ok(optional.every(id => !stock.has(id)));
  const before = systems.meta.getActiveRunGearKeys().length;
  systems.meta.getMetaSave().legacyShards = 150;
  assert.equal(systems.meta.unlockMetaItem('pack', 'pack_gear_duel').ok, true);
  assert.ok(optional.every(id => !systems.meta.getActiveRunGearKeys().includes(id)));
  systems.run.startNewRun(2027, false);
  assert.equal(systems.meta.getActiveRunGearKeys().length, before);
  assert.ok(optional.every(id => systems.meta.getActiveRunGearKeys().includes(id)));

  const rolls = new Set();
  for (let i = 0; i < 140; i++) {
    const elem = ['wind', 'thunder', 'fire', 'holy'][i % 4];
    for (const affix of systems.equipmentCore.rollGearAffixes(3, { elem, highRarityChance: 0.35 })) rolls.add(affix.id);
  }
  for (const route of ['wind', 'thunder', 'blood', 'holy']) assert.ok(BUILD_ROUTES[route].affixes.every(id => rolls.has(id)));
});

test('stacked generic gear damage and critical overflow stay bounded in the actual hero stats', () => {
  const { ctx, systems, load } = setup();
  load({ wave: 30, build: 'fire', tier: 'strong' });
  const h = ctx.game.hero;
  h.perks = { crit_surge: 2 };
  h.destinyEnhancements = {};
  h.ultTimer = 0;
  const naked = systems.heroStats.getHeroStats();
  const previousDamage = naked.gm.dmgPct;
  h.gear = Array.from({ length: 4 }, () => systems.equipmentCore.createGearInstance('titan_crown', {
    sourceStage: 3, enhanceLv: 6, slotsCount: 1, affixes: ['fury_crit'],
  }));
  const high = systems.heroStats.getHeroStats();
  const { gearDamageSoftCap, gearDamageOverflowScale, critDamageCap } = BALANCE.combat;
  const effective = gearDamageSoftCap + (high.gm.dmgPct - gearDamageSoftCap) * gearDamageOverflowScale;
  assert.ok(high.gm.dmgPct > gearDamageSoftCap);
  assert.ok(Math.abs(high.dmgMult - naked.dmgMult - effective + previousDamage) < 1e-8);
  assert.ok(high.critDmg <= critDamageCap);
  assert.ok(Number.isFinite(high.skillDmgMult));
});

test('deadline rejects a purchase before the next frame and dismisses an open help panel', () => {
  const { ctx, systems, load, setClock } = setup();
  load({ wave: 30, build: 'wind' });
  systems.run.enterW29FinalPrep();
  const gold = ctx.game.gold;
  ctx.game.activeModal = { type: 'intro' };
  setClock(ctx.game.finalPrep.deadlineMs);
  assert.deepEqual(systems.shopConfirm.openShopPurchaseConfirm(0), { ok: false, reason: 'final_prep_locked' });
  assert.equal(ctx.game.gold, gold);
  systems.run.tick(0.05);
  assert.equal(ctx.game.finalPrep.lastResolution.trigger, 'timeout');
  assert.equal(ctx.game.phase, 'wave');
  assert.equal(ctx.game.activeModal, null);
});

test('W30 lock blocks restoration from allies and lower shield limits preserve existing shields', () => {
  const { ctx, systems, load } = setup();
  load({ wave: 30, build: 'frost' });
  systems.run.startWave();
  const { game } = ctx;
  const h = game.hero;
  const boss = systems.combat.spawnEnemy('boss6', 'west', 1, { x: h.x + 2, y: h.y });
  const shaman = systems.combat.spawnEnemy('shaman', 'west', 1, { x: boss.x + 0.5, y: boss.y });
  shaman.shamanTimer = 0;
  systems.combat.dealDamage(boss, boss.maxHp);
  assert.equal(boss.signatureLockActive, true);
  systems.combat.updateEnemies(0.05);
  assert.equal(boss.hp, boss.signatureThresholdHp);
  h.shield = 300;
  assert.equal(systems.combat.gainFrostShield(16), 0);
  assert.equal(h.shield, 300);
});

test('practice defeats neither award save rewards nor create a pending settlement', () => {
  const { ctx, systems, load, entries } = setup();
  const before = [...entries];
  load({ wave: 20, build: 'blood' });
  systems.run.startWave();
  systems.run.finishGame(false);
  assert.equal(ctx.game.phase, 'lost');
  assert.equal(ctx.game.metaSettlement.practice, true);
  assert.equal(systems.meta.setMetaLoadout('main_wind', []).reason, 'run_locked');
  assert.deepEqual([...entries], before);
  assert.equal(ctx.meta.storageStatus.pendingUnsavedSettlement, null);
});
