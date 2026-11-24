import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/rng.js';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import BALANCE from '../../src/data/balance.js';
import { DESTINY_ENHANCEMENT_KEYS, DESTINY_PILLS } from '../../src/data/destiny-data.js';
import { createDestinyGamble, getDestinyBetBand, getDestinyConfig } from '../../src/systems/progression/destiny.js';
import * as progression from '../../src/systems/progression/index.js';

function draws(...values) {
  let count = 0;
  const rnd = () => {
    assert.ok(count < values.length, 'unexpected RNG draw');
    return values[count++];
  };
  rnd.check = () => assert.equal(count, values.length, 'unused RNG draws');
  return rnd;
}

function setup(overrides = {}, { foresight = false } = {}) {
  const game = {
    phase: 'prep', wave: 29, gold: 500, materials: 0, transferTokens: 0,
    rnd: mulberry32(4011), stats: {}, seal: null, subSeals: [],
    hero: { baseMaxHp: 500, maxHp: 500, hp: 100, xpNext: 101, x: 2, y: 3 },
    destiny: {
      pendingOffer: null, nextOfferSeq: 1, totalRolls: 0, totalGoldBet: 0,
      emptyTribulations: 0, wins: 0, history: [],
    },
    ...overrides,
  };
  const events = [];
  const record = name => (...args) => events.push([name, ...args]);
  const ctx = createRuntimeContext({ game, ports: {
    ui: { toast: record('toast'), flashScreen: record('flash'), renderAllUI: record('render') },
    audio: { play: record('play') },
    vfx: { addRing: record('ring') },
    modals: { renderDestinyGambleModal: record('modal') },
  } });
  const equipment = {
    createGearInstance(baseKey, opts) {
      record('createGear')(baseKey, opts);
      return { baseKey, name: baseKey, rarity: opts.rarity, slotsCount: 2, sourceStage: 3, icon: '⚙️' };
    },
    evaluateItemSynergies: () => [{ name: '试炼联动' }],
    getGearSynergyHints: () => ['试炼提示'],
    describeGearEffect: () => '构装效果',
    grantGearSafely(gear, opts) {
      record('grantGear')(gear, opts);
      return { ok: true, action: 'gear_granted' };
    },
    grantSealSafely(kind, star, opts) {
      record('grantSeal')(kind, star, opts);
      return { ok: true, action: 'seal_granted' };
    },
  };
  const system = createDestinyGamble(ctx, {
    meta: { hasMetaAux(key) { assert.equal(key, 'aux_destiny_foresight'); return foresight; } },
    unlock: { getSealStarCap: () => 5, getSubSealSlotCap: () => 2 },
    equipment,
    economy: {
      changeGold(delta, source) { ctx.game.gold += delta; record('gold')(delta, source); },
      changeMaterials(delta, source) { ctx.game.materials += delta; record('materials')(delta, source); },
      changeTransferTokens(delta, source) { ctx.game.transferTokens += delta; record('tokens')(delta, source); },
    },
    hero: {
      gainHeroXp: record('xp'),
      syncHeroMaxHp() {
        const h = ctx.game.hero;
        h.maxHp = h.baseMaxHp + (h.destinyEnhancements?.destiny_aegis_bulwark ? 90 : 0);
        record('syncHp')(h.maxHp);
      },
    },
    combat: { gainFrostShield: record('shield') },
  });
  return { game, ctx, system, events };
}

function pending(game, ...choices) {
  return (game.destiny.pendingOffer = { offerId: 'dg_29_1', bet: 120, choices, claimed: false });
}

test('progression exports the factory and pure helpers, and config pins all betting thresholds', () => {
  assert.equal(progression.createDestinyGamble, createDestinyGamble);
  assert.equal(progression.getDestinyConfig, getDestinyConfig);
  assert.equal(progression.getDestinyBetBand, getDestinyBetBand);
  const { system } = setup();
  assert.equal(system.getDestinyConfig, getDestinyConfig);
  assert.equal(system.getDestinyBetBand, getDestinyBetBand);
  const cfg = getDestinyConfig();
  assert.equal(cfg.minBet, 30);
  assert.equal(cfg.emptyTribulationChance, 0.22);
  assert.deepEqual(cfg.betQuickPresets, [30, 60, 100, 120, 220, 320]);
  assert.deepEqual(cfg.preciousThresholds, { rare: 60, transferToken: 100, epic: 120, destinyExclusive: 120, legend: 220 });
  assert.deepEqual(cfg.transferTokenYieldByBet, [{ minBet: 100, count: 1 }, { minBet: 240, count: 2 }]);
  for (const [bet, band, rare, token, epic, legend] of [
    [30, 'low', false, false, false, false],
    [59, 'low', false, false, false, false],
    [60, 'mid', true, false, false, false],
    [99, 'mid', true, false, false, false],
    [100, 'mid', true, true, false, false],
    [119, 'mid', true, true, false, false],
    [120, 'high', true, true, true, false],
    [219, 'high', true, true, true, false],
    [220, 'supreme', true, true, true, true],
    [240, 'supreme', true, true, true, true],
  ]) {
    assert.deepEqual(getDestinyBetBand(bet), {
      bet, band, allowRare: rare, allowTransferToken: token, allowEpic: epic,
      allowDestinyExclusive: epic, allowLegend: legend, allowPrecious: token,
    });
  }
});

test('quality respects the four bet bands and uses the seeded runtime RNG by default', () => {
  const { game, system } = setup();
  for (const [bet, values, rarities] of [
    [30, [0, 0.999], ['common', 'common']],
    [60, [0.55, 0.551, 0.999], ['common', 'rare', 'rare']],
    [120, [0.2, 0.201, 0.659, 0.661, 0.999], ['common', 'rare', 'rare', 'epic', 'epic']],
    [220, [0.1, 0.101, 0.419, 0.421, 0.799, 0.801], ['common', 'rare', 'rare', 'epic', 'epic', 'legend']],
  ]) {
    const rnd = draws(...values);
    assert.deepEqual(values.map(() => system.rollDestinyQuality(bet, rnd)), rarities);
    rnd.check();
  }
  game.rnd = mulberry32(42);
  assert.deepEqual(Array.from({ length: 6 }, () => system.rollDestinyQuality(220)), ['epic', 'epic', 'legend', 'epic', 'rare', 'epic']);
});

test('category draws respect each 25% boundary and duplicate selection policy', () => {
  const { game, system } = setup();
  assert.deepEqual(getDestinyConfig().categoryWeights, { seal: 0.25, gear: 0.25, pill: 0.25, special: 0.25 });
  assert.equal(getDestinyConfig().allowDuplicateCategories, true);
  const boundaries = draws(0, 0.25, 0.251, 0.5, 0.501, 0.75, 0.751, 0.999);
  assert.deepEqual(system.rollDestinyCategories(8, boundaries), ['seal', 'seal', 'gear', 'gear', 'pill', 'pill', 'special', 'special']);
  boundaries.check();
  assert.deepEqual(system.rollDestinyCategories(3, () => 0, true), ['seal', 'seal', 'seal']);
  const unique = draws(0, 0, 0, 0);
  assert.deepEqual(system.rollDestinyCategories(4, unique, false), ['seal', 'gear', 'pill', 'special']);
  unique.check();
  game.rnd = mulberry32(42);
  assert.deepEqual(system.rollDestinyCategories(), ['pill', 'gear', 'special']);
});

test('low bets stay out of every precious pool and 240 grants the second token', () => {
  const { system } = setup();
  const offerCtx = { usedExclusiveKeys: new Set() };
  for (const [bet, rarity] of [[30, 'common'], [59, 'common'], [60, 'rare'], [99, 'rare']]) {
    for (const category of ['seal', 'gear', 'pill', 'special']) {
      const rnd = draws(0.999, 0);
      const choice = system.buildDestinyCandidate(category, bet, rnd, offerCtx);
      assert.equal(choice.rarity, rarity);
      assert.equal(choice.isPrecious, false);
      assert.equal(choice.isTransferToken, false);
      assert.equal(choice.isDestinyExclusive, false);
      if (category === 'special') assert.equal(choice.subType, 'special_boon');
      rnd.check();
    }
  }
  for (const [bet, count, rarity] of [[100, 1, 'rare'], [119, 1, 'rare'], [120, 1, 'epic'], [220, 1, 'epic'], [239, 1, 'epic'], [240, 2, 'legend']]) {
    const rnd = draws(0.1, 0);
    const choice = system.buildDestinyCandidate('special', bet, rnd, offerCtx);
    assert.equal(choice.subType, 'transfer_token');
    assert.equal(choice.tokenCount, count);
    assert.equal(choice.rarity, rarity);
    rnd.check();
  }
  assert.equal(offerCtx.usedExclusiveKeys.size, 0);
});

test('a maxed seal rolls an eligible seal, or essence when all equipped seals are maxed', () => {
  const { game, system } = setup();
  const offerCtx = { usedExclusiveKeys: new Set() };
  assert.equal(system.isAllEquippedSealsMaxed(), false);
  game.seal = { kind: 'wind', star: 5 };
  game.subSeals = [{ kind: 'fire', star: 3 }, { kind: 'frost', star: 2 }];
  assert.equal(system.isAllEquippedSealsMaxed(), false);
  assert.equal(system.isSealKindCurrentlyMaxed('wind'), true);
  assert.equal(system.isSealKindCurrentlyMaxed('fire'), true);
  assert.equal(system.isSealKindCurrentlyMaxed('frost'), false);
  const replacementDraws = draws(0.9, 0.3, 0);
  const replacement = system.buildDestinyCandidate('seal', 120, replacementDraws, offerCtx);
  assert.deepEqual([replacement.kind, replacement.star, replacement.replacedFromMaxed, replacement.replacedReason],
    ['frost', 3, true, 'rolled_seal_maxed']);
  replacementDraws.check();

  game.subSeals[1].star = 3;
  assert.equal(system.isAllEquippedSealsMaxed(), true);
  const essenceDraws = draws(0.9);
  const essence = system.buildDestinyCandidate('seal', 220, essenceDraws, offerCtx);
  assert.deepEqual([essence.subType, essence.rarity, essence.bonusPct, essence.replacedReason],
    ['seal_essence', 'legend', 0.30, 'all_seals_maxed']);
  essenceDraws.check();
});

test('exclusives replace duplicate or owned-conflicting rolls and downgrade exhausted pools', () => {
  const { game, system } = setup();
  game.hero.destinyEnhancements = { destiny_fate_breaker: true, destiny_golden_temper: false };
  const usedExclusiveKeys = new Set(['destiny_phantom_stride']);
  const offerCtx = { usedExclusiveKeys };
  assert.deepEqual(system.getAvailableDestinyEnhancements({ allowLegend: false, excludeKeys: usedExclusiveKeys }).map(e => e.key),
    ['destiny_glacial_aegis', 'destiny_resonance_crown', 'destiny_golden_temper']);
  assert.ok(system.getAvailableDestinyEnhancements().some(e => e.key === 'destiny_overdrive_nova'));
  const conflictDraws = draws(0, 0.9, 0, 0);
  const replacement = system.buildDestinyCandidate('special', 120, conflictDraws, offerCtx);
  assert.deepEqual([replacement.enhancementKey, replacement.replacedFromMaxed, replacement.replacedReason],
    ['destiny_glacial_aegis', true, 'exclusive_owned_or_conflicted']);
  conflictDraws.check();
  const duplicateDraws = draws(0, 0.9, 0.25, 0);
  const next = system.buildDestinyCandidate('special', 120, duplicateDraws, offerCtx);
  assert.deepEqual([next.enhancementKey, next.replacedReason], ['destiny_resonance_crown', 'exclusive_owned_or_conflicted']);
  duplicateDraws.check();
  assert.deepEqual([...usedExclusiveKeys], ['destiny_phantom_stride', 'destiny_glacial_aegis', 'destiny_resonance_crown']);

  game.hero.destinyEnhancements = Object.fromEntries(DESTINY_ENHANCEMENT_KEYS.map(key => [key, true]));
  assert.deepEqual(system.getAvailableDestinyEnhancements(), []);
  const tokenDraws = draws(0, 0.9, 0);
  const token = system.buildDestinyCandidate('special', 120, tokenDraws, offerCtx);
  assert.deepEqual([token.subType, token.tokenCount, token.replacedFromMaxed, token.replacedReason],
    ['transfer_token', 1, true, 'all_destiny_exclusives_owned']);
  tokenDraws.check();

  // Exercise the existing fallback when exclusive bets qualify before token bets.
  const thresholds = BALANCE.destinyGamble.preciousThresholds;
  const originalTokenThreshold = thresholds.transferToken;
  try {
    thresholds.transferToken = 150;
    const boonDraws = draws(0, 0.9, 0, 0);
    const boon = system.buildDestinyCandidate('special', 120, boonDraws, offerCtx);
    assert.deepEqual([boon.subType, boon.boonKey, boon.replacedFromMaxed, boon.replacedReason],
      ['special_boon', 'boon_forge_bundle', true, 'all_destiny_exclusives_owned']);
    boonDraws.check();
  } finally {
    thresholds.transferToken = originalTokenThreshold;
  }
});

test('roll guards refuse before spending gold or consuming RNG', () => {
  const { ctx, game, system, events } = setup({ rnd: draws() });
  ctx.setGame(null);
  assert.deepEqual(system.rollDestinyGamble(120), { ok: false, reason: 'no_game' });
  assert.equal(system.getPendingDestinyOffer(), null);
  ctx.setGame(game);
  game.finalPrep = { active: true, started: true, timer: 0 };
  assert.deepEqual(system.rollDestinyGamble(120), { ok: false, reason: 'final_prep_locked' });
  game.finalPrep.timer = 10;
  game.phase = 'wave';
  assert.deepEqual(system.rollDestinyGamble(120), { ok: false, reason: 'not_in_prep' });
  game.phase = 'prep';
  const offer = pending(game);
  assert.deepEqual(system.rollDestinyGamble(120), { ok: false, reason: 'pending_offer_unclaimed', pendingOffer: offer });
  game.destiny.pendingOffer = null;
  for (const bet of [29.99, Infinity, 'bad']) {
    assert.deepEqual(system.rollDestinyGamble(bet), { ok: false, reason: 'below_min_bet', minBet: 30 });
  }
  assert.deepEqual(system.rollDestinyGamble(501), { ok: false, reason: 'insufficient_gold', need: 501, have: 500 });
  assert.equal(game.gold, 500);
  assert.equal(game.destiny.totalRolls, 0);
  assert.deepEqual(game.destiny.history, []);
  assert.deepEqual(events.map(event => event[0]), Array(6).fill('toast'));
  game.rnd.check();
});

test('empty tribulation consumes the wager and pays only the foresight floor refund', () => {
  for (const [foresight, refund] of [[false, 0], [true, 7]]) {
    const { game, system, events } = setup({ activeModal: { type: 'destiny_gamble' } }, { foresight });
    const rndFn = draws(0.219);
    assert.deepEqual(system.rollDestinyGamble('31.9', { rndFn }), {
      ok: true, outcome: 'empty_tribulation', bet: 31, stopLossRefund: refund, goldLeft: 469 + refund, pendingOffer: null,
    });
    rndFn.check();
    assert.equal(game.destiny.totalRolls, 1);
    assert.equal(game.destiny.totalGoldBet, 31);
    assert.equal(game.destiny.emptyTribulations, 1);
    assert.equal(game.destiny.wins, 0);
    assert.deepEqual(game.stats, { destinyRolls: 1, destinyEmptyTribulations: 1 });
    assert.deepEqual(game.destiny.lastOutcome, { outcome: 'empty_tribulation', bet: 31, stopLossRefund: refund, wave: 29 });
    assert.deepEqual(game.destiny.history, [game.destiny.lastOutcome]);
    assert.deepEqual(events, [
      ['gold', -31, 'destiny_gamble_bet'],
      ...(foresight ? [['gold', 7, 'destiny_stop_loss_refund']] : []),
      ['play', 'hit', 0.9], ['flash', 'fail'], ['toast', foresight
        ? '🌩️ 触发天命空劫！天命观星返还止损 💰7，无候选奖励。'
        : '🌩️ 触发天命空劫！本次押注 💰31 归零，无候选奖励。', true],
      ['modal'], ['render', true],
    ]);
  }
});

test('a fixed seed generates three indexed candidates in the legacy RNG order', () => {
  const { game, system, events } = setup({ activeModal: { type: 'destiny_gamble' } });
  const result = system.rollDestinyGamble(120, { silent: true });
  const offer = system.getPendingDestinyOffer();
  assert.deepEqual(result, { ok: true, outcome: 'win', bet: 120, goldLeft: 380, pendingOffer: offer });
  assert.equal(offer, game.destiny.pendingOffer);
  assert.deepEqual({ ...offer, choices: offer.choices.length }, {
    offerId: 'dg_29_1', bet: 120, wave: 29, choices: 3, claimed: false, claimedChoiceIndex: null, claimedAtWave: null,
  });
  assert.deepEqual(offer.choices.map(c => [c.choiceIndex, c.subType, c.rarity, c.enhancementKey ?? c.kind ?? c.gear.baseKey]), [
    [0, 'destiny_exclusive', 'epic', 'destiny_resonance_crown'],
    [1, 'seal', 'epic', 'holy'],
    [2, 'gear', 'common', 'wood_talisman'],
  ]);
  assert.equal(offer.choices[2].synNote, '单件联动：试炼联动');
  assert.equal(offer.choices[2].desc, '构装效果');
  assert.equal(game.rnd(), 0.010471288347616792);
  assert.equal(game.destiny.wins, 1);
  assert.deepEqual(game.destiny.lastOutcome, { outcome: 'win', bet: 120, wave: 29, offerId: offer.offerId });
  assert.deepEqual(events, [
    ['gold', -120, 'destiny_gamble_bet'],
    ['createGear', 'wood_talisman', { rarity: 'common', wave: 29, origin: 'destiny_gamble', highRarityChance: 0.16, rndFn: game.rnd }],
    ['play', 'chest', 1.2], ['flash', 'gold'], ['modal'], ['render', true],
  ]);
});

test('claim rejects invalid requests, allows W29 resolution and locks out duplicate and replayed claims', () => {
  const { game, system, events, ctx } = setup();
  ctx.setGame(null);
  assert.deepEqual(system.claimDestinyReward(0), { ok: false, reason: 'no_game' });
  ctx.setGame(game);
  const token = { category: 'special', subType: 'transfer_token', tokenCount: 2, name: '转印符' };
  const offer = pending(game, token);
  game.finalPrep = { locked: true };
  assert.deepEqual(system.claimDestinyReward(0), { ok: false, reason: 'final_prep_locked' });
  const resolve = { allowDuringFinalPrepResolve: true, silent: true };
  assert.deepEqual(system.claimDestinyReward(0, { ...resolve, offerId: 'wrong' }), { ok: false, reason: 'offer_id_mismatch' });
  for (const idx of [-1, 1, NaN]) {
    assert.deepEqual(system.claimDestinyReward(idx, resolve), { ok: false, reason: 'invalid_choice_index' });
  }
  assert.equal(system.getPendingDestinyOffer(), offer);
  const result = system.claimDestinyReward(0, { ...resolve, offerId: offer.offerId });
  assert.deepEqual(result, { ok: true, choiceIndex: 0, chosen: token, offerId: offer.offerId,
    grantResult: { ok: true, action: 'transfer_token_granted', tokenCount: 2, totalTokens: 2 } });
  assert.equal(system.getPendingDestinyOffer(), null);
  assert.deepEqual(system.claimDestinyReward(0, resolve), { ok: false, reason: 'no_pending_offer' });
  game.destiny.pendingOffer = { ...offer, claimed: false };
  assert.deepEqual(system.claimDestinyReward(0, resolve), { ok: false, reason: 'already_claimed', offerId: offer.offerId });
  assert.equal(system.getPendingDestinyOffer(), null);
  assert.equal(game.transferTokens, 2);
  assert.equal(game.stats.destinyClaims, 1);
  assert.equal(game.destiny.lastOffer, offer);
  assert.deepEqual([offer.claimed, offer.claimedChoiceIndex, offer.claimedAtWave], [true, 0, 29]);
  assert.deepEqual(game.destiny.claimedOfferIds, [offer.offerId]);
  assert.deepEqual(game.destiny.history, [{ outcome: 'claimed', bet: 120, wave: 29, choiceIndex: 0,
    offerId: offer.offerId, category: 'special', subType: 'transfer_token', name: token.name }]);
  assert.deepEqual(events, [['tokens', 2, 'destiny_transfer_token'], ['play', 'level', 1.15], ['render', true]]);
});

test('claim delegates gear and seal safely, and auto-claim stores a seal unequipped', () => {
  const gear = { uid: 'test-gear' };
  const seal = { category: 'seal', subType: 'seal', kind: 'frost', star: 3, rarity: 'epic' };
  for (const category of ['gear', 'seal', 'auto']) {
    const { game, system, events, ctx } = setup({ seal: { kind: 'fire', star: 5 } });
    const gearChoice = { category: 'gear', subType: 'gear', gear };
    const offer = pending(game, gearChoice, seal);
    let result;
    if (category === 'auto') {
      game.finalPrep = { transitioning: true };
      const rnd = draws(0.75);
      result = system.autoClaimPendingDestinyReward(rnd, { allowDuringFinalPrepResolve: true });
      rnd.check();
    } else {
      // Re-enter through a port after grant and confirm the checkout already removed the offer.
      ctx.bindPorts({ ui: { renderAllUI() { assert.equal(system.getPendingDestinyOffer(), null); } } });
      result = system.claimDestinyReward(category === 'gear' ? 0 : 1, { silent: true });
    }
    assert.equal(result.ok, true);
    assert.equal(result.offerId, offer.offerId);
    assert.equal(result.grantResult.action, category === 'gear' ? 'gear_granted' : 'seal_granted');
    assert.deepEqual(events[0], category === 'gear'
      ? ['grantGear', gear, { origin: 'destiny_gamble', silent: true }]
      : ['grantSeal', 'frost', 3, { rarity: 'epic', origin: 'destiny_gamble', silent: category !== 'auto', storeUnequipped: category === 'auto' }]);
    assert.deepEqual(game.seal, { kind: 'fire', star: 5 });
    assert.deepEqual(system.autoClaimPendingDestinyReward(draws()), { ok: false, reason: 'no_pending_offer' });
  }
});

test('claim applies seal essence and enhancement side effects at checkout', () => {
  const cases = [
    [{ category: 'seal', subType: 'seal_essence', bonusPct: 0.22 }, 'seal_essence_applied', [['play', 'merge', 1.2]]],
    [{ category: 'special', subType: 'destiny_exclusive', enhancementKey: 'destiny_aegis_bulwark' }, 'destiny_exclusive_granted',
      [['syncHp', 590], ['play', 'level', 1.25], ['ring', 2, 3, '#e4c4ff', 2.8]]],
    [{ category: 'special', subType: 'destiny_exclusive', enhancementKey: 'destiny_golden_temper' }, 'destiny_exclusive_granted',
      [['materials', 4, 'destiny_golden_temper'], ['play', 'level', 1.25], ['ring', 2, 3, '#e4c4ff', 2.8]]],
  ];
  for (const [choice, action, effects] of cases) {
    const { game, system, events } = setup({ activeModal: { type: 'destiny_gamble' } });
    game.hero.sealEssenceBonus = 0.1;
    pending(game, choice);
    const result = system.claimDestinyReward(0, { silent: true });
    assert.equal(result.grantResult.action, action);
    if (choice.enhancementKey) assert.equal(game.hero.destinyEnhancements[choice.enhancementKey], true);
    else assert.equal(game.hero.sealEssenceBonus, 0.32);
    assert.deepEqual(events, [...effects, ['modal'], ['render', true]]);
  }
});

test('claim applies all three ordinary special boons', () => {
  for (const [boonKey, rarity, hp, maxHp, materials, effects] of [
    ['boon_forge_bundle', 'common', 100, 500, 2, [['materials', 2, 'destiny_special_boon']]],
    ['boon_vital_temper', 'rare', 170, 532, 0, [['syncHp', 532]]],
    ['boon_battle_ward', 'epic', 135, 500, 5, [['materials', 5, 'destiny_special_boon'],
      ['shield', 85, { maxShield: 120, duration: 6.5, source: 'destiny_boon' }]]],
  ]) {
    const { game, system, events } = setup();
    pending(game, { category: 'special', subType: 'special_boon', boonKey, rarity });
    assert.deepEqual(system.claimDestinyReward(0, { silent: true }).grantResult, { ok: true, action: 'special_boon_granted', boonKey });
    assert.deepEqual([game.hero.hp, game.hero.maxHp, game.materials], [hp, maxHp, materials]);
    assert.deepEqual(events, [...effects, ['play', 'chest', 1.1], ['render', true]]);
  }
});

test('claim applies all eleven pill effects with their exact resource and combat calls', () => {
  const shield = (amount, maxShield, duration) => ['shield', amount, { maxShield, duration, source: 'destiny_pill' }];
  const rows = [
    ['xp', 100, 500, '修为 +35', [['xp', 35]]],
    ['heal', 165, 500, '生命 +65, 护盾 +25', [shield(25, 90, 6)]],
    ['temper', 125, 500, '锻材 +2, 生命 +25', [['materials', 2, 'destiny_pill_temper']]],
    ['rare_xp', 100, 500, '修为 +56', [['xp', 56]]],
    ['rare_heal', 205, 500, '生命 +105, 护盾 +45', [shield(45, 110, 6)]],
    ['rare_temper', 140, 500, '锻材 +4, 生命 +40', [['materials', 4, 'destiny_pill_rare_temper']]],
    ['epic_xp', 150, 500, '修为 +86, 生命 +50', [['xp', 86]]],
    ['epic_vital', 230, 535, '永久最大生命 +35, 生命 +130, 护盾 +60', [['syncHp', 535], shield(60, 120, 6.5)]],
    ['epic_temper', 155, 500, '锻材 +6, 生命 +55', [['materials', 6, 'destiny_pill_epic_temper']]],
    ['legend_ascend', 545, 545, '直升 1 级, 永久最大生命 +45, 生命全满', [['syncHp', 545], ['xp', 101]]],
    ['legend_temper', 180, 525, '锻材 +9, 永久最大生命 +25, 生命 +80', [['materials', 9, 'destiny_pill_legend_temper'], ['syncHp', 525]]],
  ];
  assert.deepEqual(rows.map(row => row[0]), Object.values(DESTINY_PILLS).flat().map(pill => pill.key));
  for (const [pillKey, hp, baseMaxHp, effect, effects] of rows) {
    const { game, system, events } = setup();
    pending(game, { category: 'pill', subType: 'pill', pillKey });
    assert.deepEqual(system.claimDestinyReward(0, { silent: true }).grantResult, { ok: true, effect }, pillKey);
    assert.deepEqual([game.hero.hp, game.hero.baseMaxHp, game.hero.maxHp], [hp, baseMaxHp, baseMaxHp], pillKey);
    assert.deepEqual(events, [...effects, ['play', 'chest', 1.15], ['render', true]], pillKey);
  }
});
