import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createGearSynergies } from '../../src/systems/equipment/synergy.js';
import { createEffectsDrawer } from '../../src/ui/canvas/draw-effects.js';
import { getOfferBuildFit } from '../../src/ui/hud/shop-cards.js';
import { icon, SKILL_ICON, withIcons } from '../../src/ui/shared/icons.js';
import { createBattleVfx, EFFECT_LIMITS, effectTier, SKILL_EFFECT } from '../../src/ui/vfx/battle-vfx.js';

const countActive = pool => pool.filter(e => e.time > 0).length;

function makeScene() {
  const game = {
    phase: 'wave', wave: 25, enemies: [],
    hero: { x: 10, y: 10, hp: 220, shield: 0, breakthroughs: {}, vouchers: {}, skillTimers: {} },
  };
  const runtime = createRuntimeContext({ game });
  return { game, scene: createBattleVfx(runtime) };
}

test('VFX pools stay bounded under an effect storm and shed entries under high wave pressure', () => {
  const { game, scene } = makeScene();
  scene.sample(0, 60);
  const entries = scene.particles.slice();
  for (let frame = 0; frame < 50; frame++) {
    scene.advance(.016);
    for (let i = 0; i < 240; i++) scene.onRing(10 + i / 60, 11, '#ff4724', 2);
    scene.sample(frame * 16, 60);
  }
  assert.equal(countActive(scene.stamps), EFFECT_LIMITS.high.stamps);
  assert.equal(countActive(scene.particles), EFFECT_LIMITS.high.particles);
  assert.ok(entries.every((entry, i) => entry === scene.particles[i]));
  game.enemies = Array.from({ length: 145 }, () => ({}));
  scene.sample(1200, 45);
  assert.equal(scene.quality, 'low');
  assert.ok(countActive(scene.stamps) <= EFFECT_LIMITS.low.stamps);
  assert.ok(countActive(scene.particles) <= EFFECT_LIMITS.low.particles);
  scene.cycleMode();
  scene.cycleMode();
  scene.cycleMode();
  assert.equal(scene.quality, 'off');
  scene.onRing(10, 11, '#ff4724', 2);
  assert.equal(countActive(scene.particles), 0);
  assert.equal(countActive(scene.stamps), 0);
  assert.equal(countActive(scene.trails), 0);
});

test('auto quality starts in reduce-motion mode and respects the recovery dwell', () => {
  const { game, scene } = makeScene();
  scene.sample(0, 39);
  assert.equal(scene.quality, 'low');
  scene.sample(650, 60);
  assert.equal(scene.quality, 'low');
  scene.sample(1200, 60);
  assert.equal(scene.quality, 'high');
  scene.sample(2400, 28);
  scene.sample(3600, 28);
  assert.equal(scene.quality, 'off');
  scene.sample(4800, 60);
  assert.equal(scene.quality, 'low');
  const quiet = createBattleVfx(createRuntimeContext({ game }), { preferReducedMotion: true });
  quiet.sample(3000, 60);
  assert.equal(quiet.quality, 'off');
});

test('eight starters have distinct visual codes and use their actual breakthroughs for the tiers', () => {
  assert.equal(new Set(Object.values(SKILL_EFFECT)).size, 8);
  assert.equal(new Set(Object.values(SKILL_ICON)).size, 8);
  const { game } = makeScene();
  assert.equal(effectTier(game, 'frost'), 0);
  game.hero.breakthroughs.w10 = { skillKey: 'nova' };
  assert.equal(effectTier(game, 'frost'), 1);
  game.hero.breakthroughs.w20 = { completed: true, directionKey: 'frost_bastion_counter' };
  assert.equal(effectTier(game, 'frost'), 1);
  game.hero.vouchers.w20 = true;
  assert.equal(effectTier(game, 'frost'), 2);
  assert.equal(effectTier(game, 'blood'), 0);
});

test('fire and wind dashes leave different trails without using gameplay randomness', () => {
  for (const [starterSkill, kind] of [['firewave', 'fire'], ['blades', 'wind']]) {
    const { game, scene } = makeScene();
    game.hero.starterSkill = starterSkill;
    game.rnd = () => assert.fail('Presentation must not use the gameplay RNG');
    scene.sample(0, 60);
    game.hero.x += 3;
    game.hero.dashCd = 4;
    scene.sample(16, 60);
    const trails = scene.trails.filter(trail => trail.time > 0);
    assert.equal(trails.length, 6);
    assert.ok(trails.every(trail => trail.kind === kind));
  }
});

test('minimal effects reserve visible shield links when lightning saturates the draw cap', () => {
  const game = { projectiles: [], beams: [], bolts: [] };
  const bolt = col => ({ col, pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }], t: .2, max: .25 });
  game.bolts = [bolt('#6ce2ff'), bolt('#ff88dc'), ...Array.from({ length: 50 }, () => bolt('#889aff'))];
  const colors = [];
  const ignore = () => {};
  const ctx = { save: ignore, restore: ignore, beginPath: ignore, moveTo: ignore, lineTo: ignore, stroke() { colors.push(this.strokeStyle); } };
  const drawer = createEffectsDrawer({ game }, { ctx, scene: { quality: 'off', limits: EFFECT_LIMITS.off } });
  drawer.drawProjectilesBeamsBolts();
  assert.ok(colors.includes('#6ce2ff') && colors.includes('#ff88dc'));
  assert.equal(colors.length, EFFECT_LIMITS.off.bolts * 2);
});

test('inline icons replace emoji while preserving attributes and keep distinct starter SVG paths', () => {
  const ui = withIcons('<button data-id="7" title="⚡ 伤害 > 0">❤️ 火力⚡</button>');
  assert.match(ui, /data-id="7" title=" 伤害 > 0"/);
  assert.match(ui, /icon-heart/);
  assert.match(ui, /icon-thunder/);
  assert.doesNotMatch(ui, /\p{Extended_Pictographic}/u);
  assert.equal(new Set(Object.values(SKILL_ICON).map(icon)).size, 8);
});

test('shop fit predicts the real replacement slot and keeps equipped synergies read-only', () => {
  const item = (baseKey, ...ids) => ({ baseKey, elem: 'fire', affixes: ids.map(id => ({ id })) });
  const gear = [
    item('smolder_edge', 'fire_brand'), item('ember_focus', 'fire_burst'),
    item('blood_cord', 'blood_reserve'), item('scarlet_bracer', 'blood_leech'),
  ];
  const game = { hero: { gear, starterSkill: 'firewave' } };
  const ctx = createRuntimeContext({ game });
  const { evaluateEquipmentSynergies } = createGearSynergies(ctx);
  const ownedBefore = JSON.stringify(gear);
  const offer = item('flame_fan', 'fire_chain');
  const fit = getOfferBuildFit(game, offer, evaluateEquipmentSynergies);
  assert.equal(fit.route.name, '火标连爆');
  assert.equal(fit.upgrade.link.tier, 3);
  assert.equal(fit.upgrade.slot, 3);
  assert.ok(fit.upgrade.lost.some(link => link.chain === 'blood_rite'));
  assert.equal(JSON.stringify(gear), ownedBefore);
});
