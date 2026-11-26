import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { BASE_GEAR_KEYS, GEARS, W20_ENHANCEMENTS } from '../../src/data/index.js';
import * as progression from '../../src/systems/progression/index.js';

const FIRE = 'fire_chain_surge';
const FROST = 'frost_bastion_counter';
const BREAKER = 'breaker_momentum';
const keys = specs => specs.map(spec => spec.key);

function setup(gameOverrides = {}) {
  const game = {
    wave: 1, rnd: mulberry32(37), stats: {}, materials: 30, gold: 0, w20State: {},
    hero: { skills: {}, perks: {}, w10Branch: {}, breakthroughs: {}, baseMaxHp: 100, maxHp: 100, hp: 10, x: 2, y: 3 },
    ...gameOverrides,
  };
  const ctx = createRuntimeContext({ game });
  const events = [];
  const record = name => (...args) => events.push([name, ...args]);
  ctx.bindPorts({
    audio: { play: record('play') },
    vfx: { addRing: record('ring') },
    ui: { toast: record('toast'), flashScreen: record('flash'), showBanner: record('banner'), renderAllUI: record('render') },
    modals: {
      closeModal() { events.push(['close']); },
      renderW10BreakthroughModal: record('renderW10'),
      renderW20PreselectModal: record('renderW20Preselect'),
      renderW20BreakthroughModal: record('renderW20'),
    },
  });
  // Keep the modal visible to exercise claim guards even when a port re-enters the system.
  const meta = {
    lockMetaLoadoutForRun() { game.metaRunLocked = true; events.push(['lock']); },
    getActiveRunGearKeys: () => BASE_GEAR_KEYS,
    pickWeightedByMainLegacy: (pool, getElem, rnd) => pool[Math.floor(rnd() * pool.length)],
  };
  const synergies = {};
  const equipment = {
    getActiveGearAffixSynergies: () => synergies,
    createGearInstance(baseKey, opts) {
      events.push(['createGear', baseKey, opts]);
      return { baseKey, rarity: GEARS[baseKey].rarity };
    },
    grantGearSafely(input, opts) {
      events.push(['grantGear', input, opts]);
      return { item: { baseKey: typeof input === 'string' ? input : input.baseKey } };
    },
  };
  const economy = {
    changeMaterials(delta, reason) { game.materials += delta; events.push(['materials', delta, reason]); },
    changeGold(delta, reason) { game.gold += delta; events.push(['gold', delta, reason]); },
    getEndgameRefinementConfig: () => ({ startWave: 21, chestHighRarityAffixBonusW21Plus: 0.12 }),
  };
  const hero = {
    refreshCombos: record('combos'),
    syncHeroMaxHp() { game.hero.maxHp = game.hero.baseMaxHp; events.push(['syncHp']); },
  };
  return { ctx, game, events, meta, equipment, economy, hero, synergies };
}

function w10For({ ctx, meta, hero }) {
  return progression.createW10Breakthrough(ctx, { meta, hero, unlock: progression.createUnlockSystem(ctx) });
}

function w20For({ ctx, equipment, economy }) {
  return progression.createW20Breakthrough(ctx, { equipment, economy });
}

function rewardsFor({ ctx, meta, equipment, economy, hero }) {
  return progression.createRewardsSystem(ctx, { meta, equipment, economy, hero });
}

test('skill rewards validate the offer and claim it atomically before locking Meta', () => {
  const { ctx, game, events, meta, hero } = setup();
  const modal = { type: 'starter', choices: ['firewave', 'nova'] };
  const lockMeta = meta.lockMetaLoadoutForRun;
  meta.lockMetaLoadoutForRun = () => {
    assert.equal(modal.claimed, true);
    assert.equal(modal.claimedChoice, 'firewave');
    assert.equal(game.hero.skills.firewave, undefined);
    assert.equal(claim('nova'), false);
    lockMeta();
  };
  const { pickHeroSkill: claim } = w10For({ ctx, meta, hero });
  assert.equal(claim('firewave'), false);
  game.activeModal = modal;
  assert.equal(claim('unknown'), false);
  assert.equal(claim('blades'), false);
  assert.equal(claim('firewave'), true);
  assert.equal(claim('nova'), false);
  assert.equal(game.hero.skills.firewave, 1);
  assert.equal(game.hero.skills.nova, undefined);
  assert.equal(game.metaRunLocked, true);
  assert.deepEqual(events, [
    ['lock'], ['play', 'merge', 1.1], ['toast', '领主习得【烈焰剑波 Lv.1】！'],
    ['combos', true], ['close'], ['render', true],
  ]);

  game.activeModal = { type: 'levelup', choices: ['firewave'] };
  game.hero.skills.firewave = 4;
  assert.equal(claim('firewave'), true);
  assert.equal(game.hero.skills.firewave, 5);
  game.activeModal = { type: 'levelup', choices: ['firewave'] };
  assert.equal(claim('firewave'), false);
  assert.equal(game.activeModal.claimed, undefined);
  assert.equal(events.filter(([name]) => name === 'lock').length, 1);
});

test('W10 offers three seeded branches and applies the selected breakthrough with ordered port calls', () => {
  const { ctx, game, events, meta, hero } = setup({ wave: 10, pendingBreakthrough: 'w10' });
  const api = w10For({ ctx, meta, hero });
  assert.deepEqual(api.getLearnedSkillKeys(), ['firewave']);
  game.hero.skills = { firewave: 2, nova: 1, blades: 0 };
  assert.deepEqual(api.getLearnedSkillKeys(), ['firewave', 'nova']);
  assert.deepEqual(api.selectW10BreakthroughSkill('blades'), {
    ok: false, reason: 'skill_not_learned', learned: ['firewave', 'nova'],
  });
  assert.deepEqual(api.rollW10BranchChoices('missing'), []);
  const expected = ['fw_homing_ember', 'fw_mortar_cluster', 'fw_brand_pierce'];
  assert.deepEqual(keys(api.rollW10BranchChoices('firewave')), expected);
  assert.equal(game.rnd(), 0.7394027516711503);
  game.rnd = mulberry32(37);
  game.activeModal = { type: 'w10_breakthrough', step: 'pick_skill' };
  assert.deepEqual(api.pickW10BreakthroughBranch(expected[0]), { ok: false, reason: 'no_w10_skill_selected' });
  const selection = api.selectW10BreakthroughSkill('firewave');
  assert.equal(selection.ok, true);
  assert.equal(selection.skillKey, 'firewave');
  assert.deepEqual(keys(selection.choices), expected);
  assert.deepEqual(game.w10Draft.choices, expected);
  assert.equal(game.activeModal.step, 'pick_branch');
  assert.deepEqual(api.pickW10BreakthroughBranch('nv_glacial_bastion'), {
    ok: false, reason: 'invalid_branch_key', skillKey: 'firewave',
  });

  const picked = api.pickW10BreakthroughBranch(expected[0]);
  assert.equal(picked.ok, true);
  assert.strictEqual(picked.breakthrough, game.hero.breakthroughs.w10);
  assert.equal(picked.breakthrough.branchKey, expected[0]);
  assert.equal(game.hero.w10Branch.firewave, expected[0]);
  assert.strictEqual(api.getW10BranchSpec('firewave'), selection.choices[0]);
  assert.equal(api.getW10BranchSpec('nova', expected[0]), null);
  assert.equal(game.hero.baseMaxHp, 140);
  assert.equal(game.hero.hp, 90);
  assert.equal(game.hero.realm, 2);
  assert.equal(game.stats.breakthroughsCompleted, 1);
  assert.equal(game.w10Draft, null);
  assert.equal(game.pendingBreakthrough, null);
  assert.deepEqual(events, [
    ['renderW10'], ['syncHp'], ['flash', 'gold'], ['play', 'level', 1.25], ['ring', 2, 3, '#ffd666', 4.2],
    ['banner', '⚡ W10 大型突破完成 · 【烈焰剑波 · 追魂火鸦 · 锁标弹射】！',
      '主灵印上限升至 4★ · 辅灵印扩至 2 槽 · 开启下一阶段神通池！', 'good'],
    ['close'], ['combos', true], ['render', true],
  ]);
});

test('W20/W30 intelligence masks mechanics until their reveal waves or explicit reveal flags', () => {
  const fixture = setup();
  const { game, ctx } = fixture;
  const api = w20For(fixture);
  ctx.setGame(null);
  assert.equal(api.getW20BossIntel(), null);
  assert.equal(api.getW30BossIntel(), null);
  assert.equal(api.isW20BossIntelRevealed(), false);
  assert.equal(api.isW30BossIntelRevealed(), false);
  game.bossIntel = {
    w20Core: 'W20 核心', w20CoreDesc: 'W20 核心描述', w20AuxKey: 'aux20',
    w20Aux: 'W20 辅助', w20AuxDesc: 'W20 辅助描述', w20AuxFairness: 'W20 公平提示',
    w30Core: 'W30 核心', w30CoreDesc: 'W30 核心描述', w30AuxKey: 'aux30',
    w30Aux: 'W30 辅助', w30AuxDesc: 'W30 辅助描述', w30AuxFairness: 'W30 公平提示',
  };
  ctx.setGame(game);
  for (const [wave, revealWave, isRevealed, getIntel, bossName] of [
    [20, 19, api.isW20BossIntelRevealed, api.getW20BossIntel, '天劫魔尊'],
    [30, 29, api.isW30BossIntelRevealed, api.getW30BossIntel, '深渊主宰'],
  ]) {
    const thresholds = wave === 30 ? { signatureThresholdPct: 0.8, finalPhaseThresholdPct: 0.35 } : {};
    game.wave = revealWave - 1;
    assert.equal(isRevealed(), false);
    assert.deepEqual(getIntel(), {
      revealed: false, revealWave, wave, bossName, coreName: null,
      coreDesc: wave === 20
        ? '第 19 波备战时揭晓 W20 首领固定核心机制与本局随机辅助机制'
        : '第 29 波备战时揭晓 W30 终局首领固定核心机制与本局随机辅助机制',
      auxKey: null, auxName: null, auxDesc: null, auxFairness: null, ...thresholds,
    });
    game.wave = revealWave;
    assert.equal(isRevealed(), true);
    assert.deepEqual(getIntel(), {
      revealed: true, revealWave, wave, bossName, coreName: `W${wave} 核心`, coreDesc: `W${wave} 核心描述`,
      auxKey: `aux${wave}`, auxName: `W${wave} 辅助`, auxDesc: `W${wave} 辅助描述`,
      auxFairness: `W${wave} 公平提示`, ...thresholds,
    });
  }
  game.wave = 1;
  game.bossIntel.w20Revealed = true;
  game.bossIntel.w30Revealed = true;
  assert.equal(api.isW20BossIntelRevealed(), true);
  assert.equal(api.isW30BossIntelRevealed(), true);
  game.bossIntel.w30Revealed = false;
  game.finalPrep = { w30IntelShown: true };
  assert.equal(api.isW30BossIntelRevealed(), true);
});

test('W30 battle state snapshots the battle and reports live or defeated boss health', () => {
  const fixture = setup();
  const { game } = fixture;
  const { getW30BattleState } = w20For(fixture);
  assert.equal(getW30BattleState(), null);
  game.w30Battle = { outcome: 'in_progress', phase: { name: 'signature' } };
  assert.deepEqual(getW30BattleState(), { ...game.w30Battle, bossHp: null, bossHpPct: null });
  game.enemies = [{ kind: 'slime', hp: 5, maxHp: 5 }, { kind: 'boss6', hp: 123.45, maxHp: 300 }];
  const snapshot = getW30BattleState();
  assert.deepEqual(snapshot, { ...game.w30Battle, bossHp: 123, bossHpPct: 41.15 });
  snapshot.phase.name = 'modified';
  assert.equal(game.w30Battle.phase.name, 'signature');
  game.enemies = [];
  game.w30Battle.outcome = 'victory';
  assert.deepEqual(getW30BattleState(), { ...game.w30Battle, bossHp: 0, bossHpPct: 0 });
});

test('W20 recommends and locks a direction without activating its battle effect', () => {
  const fixture = setup({ wave: 15 });
  const { game, events, synergies } = fixture;
  const api = w20For(fixture);
  assert.equal(api.isW20PreselectOpen(), false);
  assert.equal(api.getRecommendedW20Direction(), BREAKER);
  game.hero.skills.firewave = 1;
  assert.equal(api.getRecommendedW20Direction(), FIRE);
  game.hero.skills.nova = 2;
  assert.equal(api.getRecommendedW20Direction(), FROST);
  game.hero.skills = {};
  synergies.hasFireDuo = true;
  synergies.hasFrostTrio = true;
  assert.equal(api.getRecommendedW20Direction(), FROST);
  synergies.hasFrostTrio = false;
  assert.equal(api.getRecommendedW20Direction(), FIRE);
  assert.deepEqual(api.selectW20PreselectDirection(FROST), { ok: false, reason: 'not_unlocked_yet', openWave: 16 });

  game.wave = 16;
  assert.equal(api.isW20PreselectOpen(), true);
  assert.deepEqual(api.selectW20PreselectDirection('unknown'), {
    ok: false, reason: 'invalid_direction', validKeys: ['wind_stride', 'storm_circuit', 'blood_requital', 'sanctum_verdict', FIRE, FROST, BREAKER],
  });
  game.wave = 21;
  assert.equal(api.isW20PreselectOpen(), false);
  game.wave = 20;
  assert.equal(api.isW20PreselectOpen(), true);
  game.activeModal = { type: 'w20_preselect' };
  assert.deepEqual(api.selectW20PreselectDirection(FROST), {
    ok: true, preselectedDirection: FROST, directionName: '凛冬反制', locked: false, baseEffectActive: false,
  });
  assert.deepEqual(events, [
    ['play', 'coin', 1.15], ['toast', '已预选 W20 突破方向【❄️ 凛冬反制】（击败 W20 首领拿到突破凭证后才会生效）'],
    ['renderW20Preselect', game.activeModal], ['render', true],
  ]);
  assert.deepEqual(api.lockW20DirectionForBattle(), {
    ok: true, lockedDirection: FROST, directionName: '凛冬反制', baseEffectActive: false,
  });
  assert.deepEqual(game.w20State, { preselectedDirection: FROST, lockedDirection: FROST, locked: true, lockedAtWave: 20 });
  assert.equal(game.hero.breakthroughs.w20, undefined);
  assert.equal(api.isW20PreselectOpen(), false);
  assert.deepEqual(api.selectW20PreselectDirection(FIRE), { ok: false, reason: 'direction_locked', lockedDirection: FROST });
  game.w20State = {};
  assert.equal(api.lockW20DirectionForBattle().lockedDirection, FIRE);
});

test('W20 pool filters direction, owned enhancements, and mutex conflicts', t => {
  const fixture = setup();
  const { game } = fixture;
  const api = w20For(fixture);
  const owned = 'w20_fire_supernova_chain';
  const mutexPeer = 'w20_fire_isolated_exec';
  const active = 'w20_shared_elemental_echo';
  assert.deepEqual(api.getValidW20EnhancementPool('unknown'), []);
  const full = api.getValidW20EnhancementPool(FIRE);
  assert.equal(full.length, 8);
  assert.ok(full.every(spec => spec.directions.includes(FIRE)));
  assert.ok(!keys(full).includes('w20_frost_dash_ring'));
  // No stock cards have a mutex, so exercise the existing rule with two temporary tags.
  t.after(() => {
    delete W20_ENHANCEMENTS[owned].mutex;
    delete W20_ENHANCEMENTS[mutexPeer].mutex;
  });
  W20_ENHANCEMENTS[owned].mutex = 'test-exclusive';
  W20_ENHANCEMENTS[mutexPeer].mutex = 'test-exclusive';
  game.hero.breakthroughs.w20 = { enhancementKey: active };
  assert.deepEqual(keys(api.getValidW20EnhancementPool(FIRE, [owned])),
    keys(full).filter(key => ![owned, mutexPeer, active].includes(key)));
});

test('W20 capacity rejects groups below 2K+2 before spending or drawing', () => {
  const fixture = setup();
  const { game, events } = fixture;
  const api = w20For(fixture);
  const candidates = ['w20_fire_supernova_chain', 'w20_fire_isolated_exec'];
  game.w20Draft = { directionKey: FIRE, groupSize: 4, rerollCount: 0, candidates };
  assert.deepEqual(api.rerollW20Enhancements(), {
    ok: false, reason: 'insufficient_pool', required: 10, available: 8, materialsLeft: 30, candidates,
  });
  assert.strictEqual(game.w20Draft.candidates, candidates);
  assert.equal(game.materials, 30);
  assert.equal(game.rnd(), mulberry32(37)());
  assert.deepEqual(events, [['toast', '候选池容量不足（需至少 10 张，当前 8 张），已保留当前候选与锻材余额！', true]]);
  const rejected = api.initW20EnhancementDraft('unknown');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.draft.poolUnderCapacity, true);
  assert.deepEqual(rejected.draft.history, [[]]);
});

test('W20 rerolls whole groups with no adjacent overlap and increasing material costs', () => {
  const fixture = setup({ wave: 20, pendingBreakthrough: 'w20', activeModal: { type: 'w20_breakthrough' } });
  const { game, events } = fixture;
  game.materials = 40;
  const api = w20For(fixture);
  assert.deepEqual([0, 1, 2, 3].map(api.getW20RerollCost), [5, 8, 11, 14]);
  const expected = ['w20_fire_ember_barrage', 'w20_shared_elemental_echo'];
  assert.deepEqual(keys(api.drawW20CandidateGroup(FIRE).cards), expected);
  game.rnd = mulberry32(37);
  game.hero.breakthroughs.w20 = { directionKey: FIRE, directionName: '聚焰连爆' };
  const initialized = api.initW20EnhancementDraft();
  assert.equal(initialized.ok, true);
  assert.deepEqual(keys(initialized.candidates), expected);
  assert.equal(initialized.validPoolSize, 8);
  assert.deepEqual(game.w20Draft.history, [expected]);

  let previous = expected;
  for (const [index, cost, balance, nextCost] of [[1, 5, 35, 8], [2, 8, 27, 11], [3, 11, 16, 14], [4, 14, 2, 17]]) {
    const rerolled = api.rerollW20Enhancements();
    assert.equal(rerolled.ok, true);
    assert.equal(rerolled.rerollCount, index);
    assert.equal(rerolled.costPaid, cost);
    assert.equal(rerolled.materialsLeft, balance);
    assert.equal(rerolled.nextRerollCost, nextCost);
    assert.deepEqual(rerolled.prevCandidates, previous);
    const next = keys(rerolled.candidates);
    assert.equal(new Set(next).size, 2);
    assert.ok(next.every(key => !previous.includes(key)));
    assert.deepEqual(game.w20Draft.history.at(-1), next);
    previous = next;
  }
  assert.equal(api.getW20RerollCost(), 17);
  let draws = 0;
  game.rnd = () => { draws++; return 0; };
  const draft = structuredClone(game.w20Draft);
  assert.deepEqual(api.rerollW20Enhancements(), {
    ok: false, reason: 'insufficient_materials', cost: 17, materialsLeft: 2, candidates: previous,
  });
  assert.equal(draws, 0, 'insufficient materials must leave the seeded RNG untouched');
  assert.deepEqual(game.w20Draft, draft);
  assert.deepEqual(events.filter(([name]) => name === 'materials').map(([, delta, reason]) => [delta, reason]),
    [[-5, 'w20_reroll'], [-8, 'w20_reroll'], [-11, 'w20_reroll'], [-14, 'w20_reroll']]);
  assert.equal(events.filter(([name]) => name === 'renderW20').length, 4);
  assert.deepEqual(api.pickW20Enhancement('unknown'), { ok: false, reason: 'invalid_enhancement_choice', candidates: previous });
  const choice = W20_ENHANCEMENTS[previous[0]];
  const picked = api.pickW20Enhancement(choice.key);
  assert.deepEqual(picked, { ok: true, breakthrough: {
    directionKey: FIRE, directionName: '聚焰连爆', enhancementKey: choice.key, enhancementName: choice.name,
    enhancementIcon: choice.icon, enhancementDesc: choice.desc, enhancementBehaviorTag: choice.behaviorTag, rerollCount: 4,
  } });
  assert.notStrictEqual(picked.breakthrough, game.hero.breakthroughs.w20);
  assert.equal(game.w20Draft, null);
  assert.equal(game.pendingBreakthrough, null);
  assert.deepEqual(events.slice(-6), [
    ['flash', 'gold'], ['play', 'level', 1.3], ['ring', 2, 3, '#ffd666', 4.5],
    ['banner', `⚡ W20 突破强化完成 · 【聚焰连爆 × ${choice.name}】！`, `即将进入第 21 波强势体验！${choice.behaviorTag}`, 'good'],
    ['close'], ['render', true],
  ]);
  assert.deepEqual(api.pickW20Enhancement(choice.key), { ok: false, reason: 'no_active_draft' });
});

test('Perk rolls preserve fixed-seed order and exclude maxed perks at every quality', () => {
  const fixture = setup();
  const { game } = fixture;
  const { rollPerkChoices } = rewardsFor(fixture);
  game.hero.perks = { sword_echo: 1, blood_oath: 2 };
  for (const [quality, expected, nextRandom] of [
    [undefined, ['sword_echo', 'fire_nova', 'frost_shatter'], 0.9583973521366715],
    ['di', ['mono_mastery', 'ult_engine', 'undying_will', 'sword_echo'], 0.1765399652067572],
    ['tian', ['zero_exec', 'dao_fortune', 'sword_echo', 'dual_cataclysm', 'undying_will', 'frost_domain'], 0.5996687372680753],
  ]) {
    game.rnd = mulberry32(37);
    assert.deepEqual(keys(rollPerkChoices(quality)), expected);
    assert.equal(game.rnd(), nextRandom);
  }
});

test('Perk claims apply blood oath HP and distinct Lv.1/Lv.2 dao fortune rewards', () => {
  const fixture = setup({ rnd: () => 0 });
  const { game, events } = fixture;
  const { pickPerk } = rewardsFor(fixture);
  assert.equal(pickPerk('unknown'), false);
  assert.deepEqual(events, []);
  for (const level of [1, 2]) {
    pickPerk('blood_oath');
    assert.equal(game.hero.perks.blood_oath, level);
    assert.equal(game.hero.maxHp, 100 + 80 * level);
    assert.equal(game.hero.hp, 10);
    pickPerk('dao_fortune');
    assert.equal(game.hero.perks.dao_fortune, level);
    assert.equal(game.gold, 35);
  }
  pickPerk('dao_fortune');
  assert.equal(game.hero.perks.dao_fortune, 2);
  assert.deepEqual(events.filter(([name]) => ['gold', 'grantGear'].includes(name)), [
    ['gold', 35, 'perk_dao_fortune'], ['grantGear', 'windcord', { origin: 'drop' }],
    ['grantGear', 'ember_focus', { origin: 'drop' }],
  ]);
  assert.deepEqual(events.slice(0, 5), [
    ['syncHp'], ['play', 'level', 1.15], ['toast', '词条生效！【血煞魔躯 Lv.1】'], ['close'], ['render', true],
  ]);
});

test('chest offers preserve seeded rarity selection, source options, and key aliases', () => {
  for (const [wave, legendBias, shrineTier, origin, bonus, expected, nextRandom] of [
    [5, false, false, 'elite_chest', 0.14, ['swift_boots', 'frost_mirror', 'flame_fan'], 0.1765399652067572],
    [5, false, true, 'shrine_chest', 0.24, ['flame_fan', 'smolder_edge', 'reed_sword'], 0.5882677019108087],
    [5, true, false, 'boss_chest', 0.32, ['haste_glass', 'windcord', 'shatter_maul'], 0.5882677019108087],
    [16, false, true, 'shrine_chest', 0.24, ['heavy_greatsword', 'windcord', 'circuit_mirror'], 0.5882677019108087],
    [21, false, false, 'elite_chest', 0.26, ['greed_cup', 'heavy_greatsword', 'burn_core'], 0.1765399652067572],
    [21, true, false, 'boss_chest', 0.44, ['heavy_greatsword', 'ember_focus', 'bloodseal_disc'], 0.5882677019108087],
  ]) {
    const fixture = setup({ wave });
    const { game, events } = fixture;
    const { pickChestGearChoices } = rewardsFor(fixture);
    const choices = pickChestGearChoices(legendBias, shrineTier);
    assert.deepEqual(choices.map(choice => choice.baseKey), expected);
    assert.deepEqual(keys(choices), expected);
    assert.equal(new Set(choices).size, 3);
    assert.deepEqual(events, expected.map(baseKey => ['createGear', baseKey, {
      wave, origin, highRarityChance: bonus, rndFn: game.rnd,
    }]));
    assert.equal(game.rnd(), nextRandom);
  }
});

test('grantGear forwards options and returns the item or null', () => {
  const fixture = setup();
  const { events } = fixture;
  const { grantGear } = rewardsFor(fixture);
  const item = { uid: 'gear-1', baseKey: 'swift_boots' };
  assert.deepEqual(grantGear(item, { origin: 'test', paidGold: 10 }), { baseKey: 'swift_boots' });
  assert.deepEqual(events, [['grantGear', item, { origin: 'test', paidGold: 10 }]]);
  fixture.equipment.grantGearSafely = () => ({ ok: false });
  assert.equal(rewardsFor(fixture).grantGear('swift_boots'), null);
});

test('chest claims match by reference, object UID, string UID or baseKey and lock before granting', () => {
  for (const input of [item => item, item => ({ uid: item.uid }), item => item.uid, item => item.baseKey]) {
    const fixture = setup();
    const { game, events, equipment, meta } = fixture;
    const item = { uid: 'chest-1', baseKey: 'swift_boots' };
    const other = { uid: 'chest-2', baseKey: 'frost_mirror' };
    const modal = { type: 'chest', choices: [item, other] };
    const received = { ...item, origin: 'chest' };
    let claim;
    const lockMeta = meta.lockMetaLoadoutForRun;
    meta.lockMetaLoadoutForRun = () => {
      assert.equal(modal.claimed, true);
      assert.equal(claim(other), false);
      lockMeta();
    };
    equipment.grantGearSafely = (matched, opts) => {
      assert.equal(modal.claimed, true);
      assert.equal(modal.claimedChoice, item.uid);
      assert.equal(claim(other.uid), false);
      assert.strictEqual(matched, item);
      assert.deepEqual(opts, { origin: 'chest' });
      events.push(['grant']);
      return { item: received };
    };
    claim = rewardsFor(fixture).pickGearReward;
    assert.equal(claim(item), false);
    game.activeModal = modal;
    assert.equal(claim({ baseKey: other.baseKey }), false);
    assert.equal(claim('missing'), false);
    assert.strictEqual(claim(input(item)), received);
    assert.equal(claim(item), false);
    assert.deepEqual(events, [['lock'], ['grant'], ['close']]);
  }
});
