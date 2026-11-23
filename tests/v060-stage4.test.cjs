'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');

function bootBG60() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Border-Guard-v0.60.html must contain embedded <script>');
  const src = match[1];
  const ctx2d = new Proxy({}, { get: () => () => {} });
  const cache = {};
  function makeEl(id) {
    const classes = new Set();
    const children = [];
    const node = {
      id,
      value: '',
      style: { setProperty() {} },
      dataset: {},
      hidden: false,
      disabled: false,
      _innerHTML: '',
      _textContent: '',
      children,
      get innerHTML() { return this._innerHTML; },
      set innerHTML(val) {
        this._innerHTML = String(val ?? '');
        this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ');
      },
      get textContent() { return this._textContent || this._innerHTML.replace(/<[^>]+>/g, ' '); },
      set textContent(val) {
        this._textContent = String(val ?? '');
        this._innerHTML = this._textContent;
      },
      classList: {
        add(x) { classes.add(x); },
        remove(x) { classes.delete(x); },
        toggle(x, forced) {
          if (forced === true) { classes.add(x); return true; }
          if (forced === false) { classes.delete(x); return false; }
          if (classes.has(x)) { classes.delete(x); return false; }
          classes.add(x);
          return true;
        },
        contains(x) { return classes.has(x); }
      },
      addEventListener() {},
      append(...nodes) { children.push(...nodes); },
      appendChild(n) { children.push(n); },
      replaceChildren(...nodes) { children.length = 0; children.push(...nodes); },
      querySelector(sel) {
        if (sel && sel.startsWith('#')) {
          const targetId = sel.slice(1);
          return cache[targetId] ||= makeEl(targetId);
        }
        return makeEl(sel || 'q');
      },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { height: 52, bottom: 96, width: 1280 }; },
      getContext() { return ctx2d; }
    };
    return node;
  }
  const doc = {
    getElementById: id => (cache[id] ||= makeEl(id)),
    createElement: tag => makeEl(tag),
    querySelector: sel => {
      if (sel && sel.startsWith('#')) return cache[sel.slice(1)] ||= makeEl(sel.slice(1));
      return null;
    },
    documentElement: makeEl('root'),
    addEventListener() {}
  };
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener() {}
  };
  const runner = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', src);
  runner(win, doc, () => {}, { now: () => 0 }, () => 0, () => {});
  assert.ok(win.BG60, 'window.BG60 must be exposed');
  return { B: win.BG60, win, doc, html };
}

test('1. Destiny Gamble thresholds, empty tribulation, strict 4x25% category weights, no rarity pity, and shop/dismantle isolation', () => {
  const { B } = bootBG60();
  assert.match(B.version, /^0\.60\.0-stage[4-9]/);

  const cfg = B.getDestinyConfig();
  assert.equal(cfg.minBet, 30);
  assert.equal(cfg.categoryWeights.seal, 0.25);
  assert.equal(cfg.categoryWeights.gear, 0.25);
  assert.equal(cfg.categoryWeights.pill, 0.25);
  assert.equal(cfg.categoryWeights.special, 0.25);
  assert.ok(cfg.emptyTribulationChance > 0 && cfg.emptyTribulationChance < 0.5);
  assert.ok(cfg.preciousThresholds.rare < cfg.preciousThresholds.transferToken);
  assert.ok(cfg.preciousThresholds.transferToken <= cfg.preciousThresholds.epic);
  assert.ok(cfg.preciousThresholds.epic < cfg.preciousThresholds.legend);

  // 1a) Invalid bet rejections: below minBet, insufficient gold, in-combat -> ZERO gold deducted!
  B.loadTestPreset({ wave: 16, tier: 'standard', build: 'fire', gold: 100, materials: 10, transferTokens: 0, seed: 4001 });
  const lowReject = B.rollDestinyGamble(cfg.minBet - 1, { silent: true });
  assert.equal(lowReject.ok, false);
  assert.equal(lowReject.reason, 'below_min_bet');
  assert.equal(B.game.gold, 100);
  assert.equal(B.getPendingDestinyOffer(), null);

  const poorReject = B.rollDestinyGamble(150, { silent: true });
  assert.equal(poorReject.ok, false);
  assert.equal(poorReject.reason, 'insufficient_gold');
  assert.equal(B.game.gold, 100);
  assert.equal(B.getPendingDestinyOffer(), null);

  B.game.phase = 'wave';
  const combatReject = B.rollDestinyGamble(50, { silent: true });
  assert.equal(combatReject.ok, false);
  assert.equal(combatReject.reason, 'not_in_prep');
  assert.equal(B.game.gold, 100);
  B.game.phase = 'prep';

  // 1b) Empty tribulation: deducts ONLY valid bet, NO pendingOffer, NO rewards granted!
  const beforeEmpty = {
    gold: B.game.gold,
    materials: B.game.materials,
    tokens: B.game.transferTokens,
    bagLen: B.game.bag.length,
    excLen: B.getOwnedDestinyEnhancements().length
  };
  const emptyRes = B.rollDestinyGamble(60, { forceOutcome: 'empty', silent: true });
  assert.equal(emptyRes.ok, true);
  assert.equal(emptyRes.outcome, 'empty_tribulation');
  assert.equal(B.game.gold, beforeEmpty.gold - 60);
  assert.equal(B.getPendingDestinyOffer(), null);
  assert.equal(B.game.materials, beforeEmpty.materials);
  assert.equal(B.game.transferTokens, beforeEmpty.tokens);
  assert.equal(B.game.bag.length, beforeEmpty.bagLen);
  assert.equal(B.getOwnedDestinyEnhancements().length, beforeEmpty.excLen);

  // 1c) Large-sample LOW BET test (bet = 40 < rare 60, and bet = 80 < transferToken 100):
  //     ZERO epic, ZERO legend, ZERO destinyExclusive, ZERO transferToken!
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire', gold: 500000, materials: 10, transferTokens: 0, seed: 4002 });
  const lowBets = [40, 80];
  for (const bet of lowBets) {
    let seenChoices = 0;
    let seenRare = 0;
    for (let i = 0; i < 400; i++) {
      const r = B.rollDestinyGamble(bet, { forceOutcome: 'win', silent: true });
      assert.equal(r.ok, true);
      assert.equal(r.pendingOffer.choices.length, 3);
      for (const ch of r.pendingOffer.choices) {
        seenChoices++;
        if (ch.rarity === 'rare') seenRare++;
        assert.notEqual(ch.rarity, 'epic', `Low bet ${bet} must NEVER yield epic`);
        assert.notEqual(ch.rarity, 'legend', `Low bet ${bet} must NEVER yield legend`);
        assert.equal(ch.isDestinyExclusive, false, `Low bet ${bet} must NEVER yield Destiny Exclusive`);
        assert.equal(ch.isTransferToken, false, `Low bet ${bet} must NEVER yield Transfer Token`);
        assert.equal(ch.isPrecious, false, `Low bet ${bet} must NEVER yield any precious pool item`);
      }
      B.game.destiny.pendingOffer = null; // clear without mutating hero for pure sampling
    }
    assert.equal(seenChoices, 1200);
    if (bet < cfg.preciousThresholds.rare) assert.equal(seenRare, 0, 'Bet below rare threshold must never yield rare');
    else assert.ok(seenRare > 100, 'Bet >= rare threshold should yield rare items');
  }

  // 1d) Large-sample HIGH BET (bet = 260 >= legend 220):
  //     Verify empty tribulation rate, strict 4x25% top-level category weights, precious pool access, NO rarity pity, and transfer tokens ONLY in 'special'!
  B.loadTestPreset({ wave: 25, tier: 'standard', build: 'fire', gold: 2000000, materials: 10, transferTokens: 0, seed: 4003 });
  const catCounts = { seal: 0, gear: 0, pill: 0, special: 0 };
  const rarCounts = { common: 0, rare: 0, epic: 0, legend: 0 };
  let emptyCount = 0;
  let winCount = 0;
  let tokenChoices = 0;
  let exclusiveChoices = 0;
  const totalTrials = 1600;
  for (let i = 0; i < totalTrials; i++) {
    const r = B.rollDestinyGamble(260, { silent: true });
    assert.equal(r.ok, true);
    if (r.outcome === 'empty_tribulation') {
      emptyCount++;
      assert.equal(B.getPendingDestinyOffer(), null);
      continue;
    }
    winCount++;
    assert.equal(r.pendingOffer.choices.length, 3);
    for (const ch of r.pendingOffer.choices) {
      catCounts[ch.category]++;
      if (rarCounts[ch.rarity] !== undefined) rarCounts[ch.rarity]++;
      if (ch.isTransferToken) {
        tokenChoices++;
        assert.equal(ch.category, 'special', 'Transfer token must live strictly inside special category sub-pool');
        assert.equal(ch.tokenCount, 2, 'Bet >= 240 should yield 2 transfer tokens per config');
      }
      if (ch.isDestinyExclusive) {
        exclusiveChoices++;
        assert.equal(ch.category, 'special', 'Destiny Exclusive must live strictly inside special category');
        assert.ok(B.DESTINY_ENHANCEMENTS[ch.enhancementKey]);
      }
      if (ch.category === 'pill') {
        assert.notEqual(ch.pillKey, 'guard');
        assert.notEqual(ch.pillKey, 'mend');
      }
    }
    B.game.destiny.pendingOffer = null;
  }
  const emptyRate = emptyCount / totalTrials;
  assert.ok(emptyRate > 0.16 && emptyRate < 0.28, `Empty tribulation rate (${(emptyRate * 100).toFixed(1)}%) should converge near 22%`);
  const totalCandidates = winCount * 3;
  for (const cat of ['seal', 'gear', 'pill', 'special']) {
    const share = catCounts[cat] / totalCandidates;
    assert.ok(share > 0.215 && share < 0.285, `Category ${cat} share (${(share * 100).toFixed(2)}%) must converge near 25%`);
  }
  assert.ok(rarCounts.common > 0, 'No rarity pity: common quality must still occur at high bet');
  assert.ok(rarCounts.epic > 100 && rarCounts.legend > 100, 'High bet >= legend threshold must yield epic and legend items');
  assert.ok(tokenChoices > 50, 'High bet must yield transfer tokens in special sub-pool');
  assert.ok(exclusiveChoices > 50, 'High bet must yield Destiny Exclusive Enhancements in special sub-pool');

  // 1e) Configurable allowDuplicateCategories = false produces 3 distinct categories per offer!
  for (let i = 0; i < 40; i++) {
    const r = B.rollDestinyGamble(140, { forceOutcome: 'win', allowDuplicateCategories: false, silent: true });
    assert.equal(r.ok, true);
    const cats = new Set(r.pendingOffer.choices.map(c => c.category));
    assert.equal(cats.size, 3, 'allowDuplicateCategories=false must produce 3 distinct categories');
    B.game.destiny.pendingOffer = null;
  }

  // 1f) Isolation: regular shop (100 rolls) and dismantling gear/seals NEVER yield transferTokens or Destiny Exclusives!
  B.loadTestPreset({ wave: 25, tier: 'standard', build: 'fire', gold: 10000, materials: 10, transferTokens: 0, seed: 4004 });
  for (let i = 0; i < 100; i++) {
    B.rollShop(true);
    for (const offer of B.game.shop) {
      assert.notEqual(offer.itemType, 'transfer_token');
      assert.notEqual(offer.itemType, 'destiny_exclusive');
      assert.ok(!B.DESTINY_ENHANCEMENTS[offer.kind]);
      assert.ok(!B.DESTINY_ENHANCEMENTS[offer.pillKey]);
    }
  }
  for (let i = 0; i < 20; i++) {
    B.game.bag.push(B.createGearInstance('flame_fan', { wave: 25, rarity: 'legend', slotsCount: 3 }));
    B.dismantleBagGear(B.game.bag.length - 1);
  }
  assert.equal(B.game.transferTokens, 0, 'Dismantling gear must NEVER yield transferTokens');
  const skillPool = B.getUnlockedSkillPool();
  for (const dk of Object.keys(B.DESTINY_ENHANCEMENTS)) {
    assert.ok(!skillPool.includes(dk), 'Destiny Exclusive must NEVER appear in level-up skill pool');
  }
});

test('2. Single-checkout idempotency, safe 5★ Main Seal preservation, bag overflow stash, maxed-item replacement, and real combat hooks for all 8 Destiny Exclusives', () => {
  const { B } = bootBG60();

  // 2a) Pending offer blocks new bets; claiming twice is strictly idempotent (grants reward ONLY ONCE!)
  B.loadTestPreset({ wave: 25, tier: 'strong', build: 'fire', gold: 600, materials: 20, transferTokens: 0, seed: 4010 });
  const roll = B.rollDestinyGamble(140, { forceOutcome: 'win', silent: true });
  assert.equal(roll.ok, true);
  const offer = roll.pendingOffer;
  assert.equal(offer.claimed, false);
  assert.equal(offer.bet, 140);
  assert.equal(offer.wave, 25);
  assert.equal(B.hasPendingDecision(), true);

  // Trying to bet again while pendingOffer is unclaimed must be rejected with 0 gold deducted
  const goldBeforeDupBet = B.game.gold;
  const blockedBet = B.rollDestinyGamble(60, { silent: true });
  assert.equal(blockedBet.ok, false);
  assert.equal(blockedBet.reason, 'pending_offer_unclaimed');
  assert.equal(B.game.gold, goldBeforeDupBet);

  // Force choice[0] to be a Transfer Token so we can verify exact +1 single grant on double click!
  offer.choices[0] = {
    choiceIndex: 0,
    category: 'special',
    subType: 'transfer_token',
    rarity: 'epic',
    isPrecious: true,
    isTransferToken: true,
    tokenCount: 1,
    icon: '🔮',
    name: '天命转印符 ×1',
    desc: 'test'
  };
  const claim1 = B.claimDestinyReward(0, { silent: true });
  assert.equal(claim1.ok, true);
  assert.equal(offer.claimed, true);
  assert.equal(B.game.transferTokens, 1);
  assert.equal(B.getPendingDestinyOffer(), null);

  // Duplicate click / call must be rejected and NOT grant a second token!
  const claim2 = B.claimDestinyReward(0, { silent: true });
  assert.equal(claim2.ok, false);
  assert.equal(B.game.transferTokens, 1, 'Double claim must NEVER duplicate reward');

  // Even re-injecting the same offerId cannot be claimed twice!
  B.game.destiny.pendingOffer = { ...offer, claimed: false };
  const claimReplay = B.claimDestinyReward(0, { silent: true });
  assert.equal(claimReplay.ok, false);
  assert.equal(claimReplay.reason, 'already_claimed');
  assert.equal(B.game.transferTokens, 1);

  // 2b) Safe claim iron rule: claiming an OFF-ELEMENT seal while wearing 5★ Fire Main Seal + 2/2 Sub-Seals
  //     MUST NOT sell, replace, or alter the 5★ Main Seal! Stores safely in bag, and in rewardStash when bag is full!
  B.loadTestPreset({ wave: 25, tier: 'strong', build: 'fire', gold: 500, materials: 20, transferTokens: 0, seed: 4011 });
  assert.equal(B.game.seal.kind, 'fire');
  assert.equal(B.game.seal.star, 5);
  assert.equal(B.game.seal.route, 'mastery');
  assert.equal(B.game.subSeals.length, 2);
  const goldBeforeOffSeal = B.game.gold;

  const wOff = B.rollDestinyGamble(120, { forceOutcome: 'win', silent: true });
  wOff.pendingOffer.choices[0] = {
    choiceIndex: 0,
    category: 'seal',
    subType: 'seal',
    rarity: 'epic',
    kind: 'frost',
    elem: 'frost',
    star: 3,
    icon: '❄️',
    name: '寒玉灵印 3★'
  };
  const claimOff = B.claimDestinyReward(0, { silent: true });
  assert.equal(claimOff.ok, true);
  assert.equal(claimOff.grantResult.action, 'stored_bag');
  assert.equal(claimOff.grantResult.mainSealPreserved, true);
  assert.equal(B.game.seal.kind, 'fire', '5★ Fire Main Seal must NEVER be overwritten!');
  assert.equal(B.game.seal.star, 5, '5★ Fire Main Seal star must stay 5★!');
  assert.equal(B.game.seal.route, 'mastery', '5★ Main Seal specialization route must remain intact!');
  assert.equal(B.game.gold, goldBeforeOffSeal - 120, 'Main Seal must NOT be auto-sold/refunded!');
  assert.ok(B.game.bag.some(x => B.isBagSeal(x) && x.kind === 'frost'), 'Off-element seal must be safely stored in bag');

  // Fill bag to capacity and claim both an off-element seal AND a gear item -> both go safely to game.rewardStash!
  const bagCap = B.getBagCapacity();
  while (B.game.bag.length < bagCap) {
    B.game.bag.push(B.createGearInstance('vamp_fang', { wave: 25 }));
  }
  assert.equal(B.game.bag.length, bagCap);
  const sealStashRes = B.grantSealSafely('holy', 3, { origin: 'destiny_gamble', silent: true });
  assert.equal(sealStashRes.ok, true);
  assert.equal(sealStashRes.storedIn, 'stash');
  assert.equal(B.game.seal.kind, 'fire');
  assert.equal(B.game.seal.star, 5);

  const gearStashRes = B.grantGearSafely(B.createGearInstance('flame_fan', { wave: 25, rarity: 'legend' }), { silent: true });
  assert.equal(gearStashRes.ok, true);
  assert.equal(gearStashRes.storedIn, 'stash');
  assert.equal(B.game.rewardStash.length, 2);

  // Free 1 bag slot and claim from stash
  B.sellBagGear(0);
  const unstash = B.claimRewardStashItem(0);
  assert.equal(unstash.ok, true);
  assert.equal(B.game.rewardStash.length, 1);

  // 2c) Maxed-item same-category replacement:
  //     When Main Seal (5★) and both Sub-Seals (3★) are maxed, any rolled 'seal' candidate becomes 'seal_essence' (category='seal')!
  B.loadTestPreset({ wave: 25, tier: 'strong', build: 'fire', gold: 50000, materials: 20, transferTokens: 0, seed: 4012 });
  assert.equal(B.isAllEquippedSealsMaxed(), true);
  let sealReplacedCount = 0;
  const sealDmgBefore = B.getSealStats().dmg;
  for (let i = 0; i < 60 && sealReplacedCount < 3; i++) {
    const r = B.rollDestinyGamble(140, { forceOutcome: 'win', silent: true });
    const sealIdx = r.pendingOffer.choices.findIndex(c => c.category === 'seal');
    if (sealIdx >= 0) {
      const ch = r.pendingOffer.choices[sealIdx];
      assert.equal(ch.subType, 'seal_essence', 'Maxed main+sub seals must replace with same-category seal_essence');
      assert.equal(ch.replacedFromMaxed, true);
      B.claimDestinyReward(sealIdx, { silent: true });
      sealReplacedCount++;
    } else {
      B.game.destiny.pendingOffer = null;
    }
  }
  assert.ok(sealReplacedCount >= 1, 'Should encounter and claim seal_essence replacement');
  assert.ok(B.game.hero.sealEssenceBonus > 0);
  assert.ok(B.getSealStats().dmg > sealDmgBefore, 'Seal essence replacement must genuinely boost Main Seal damage');

  // Own all non-conflicting Destiny Exclusive slots -> verify conflict groups & already-owned are NEVER re-rolled, and fallback stays category='special'!
  B.loadTestPreset({ wave: 25, tier: 'strong', build: 'fire', gold: 50000, materials: 20, transferTokens: 0, seed: 4013 });
  B.game.hero.destinyEnhancements = {
    destiny_ember_echo: true,      // blocks destiny_offense (destiny_fate_breaker)
    destiny_glacial_aegis: true,   // blocks destiny_defense (destiny_aegis_bulwark)
    destiny_phantom_stride: true,  // blocks destiny_mobility (destiny_overdrive_nova)
    destiny_resonance_crown: true,
    destiny_golden_temper: true
  };
  assert.equal(B.getAvailableDestinyEnhancements({ allowLegend: true }).length, 0);
  let specialChecked = 0;
  for (let i = 0; i < 50; i++) {
    const r = B.rollDestinyGamble(240, { forceOutcome: 'win', silent: true });
    for (const ch of r.pendingOffer.choices) {
      if (ch.category === 'special') {
        specialChecked++;
        assert.equal(ch.isDestinyExclusive, false, 'Must NEVER offer already-owned or conflict-blocked Destiny Exclusive');
        assert.equal(ch.subType, 'transfer_token', 'Exhausted exclusives at high bet must replace with same-category transfer_token');
      }
    }
    B.game.destiny.pendingOffer = null;
  }
  assert.ok(specialChecked > 20);

  // 2d) Real combat execution of all 8 Destiny Exclusive Enhancements
  assert.ok(Object.keys(B.DESTINY_ENHANCEMENTS).length >= 8);
  // Check Fire Ember Echo & Fate Breaker & Resonance Crown & Golden Temper
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire', gold: 500, materials: 20, seed: 4014 });
  const baseStats = B.getHeroStats();
  const baseSealCd = B.getSealStats().cd;
  B.game.hero.destinyEnhancements.destiny_resonance_crown = true;
  B.game.hero.destinyEnhancements.destiny_golden_temper = true;
  B.game.hero.gear[0].enhanceLv = 2;
  const boostedStats = B.getHeroStats();
  assert.ok(boostedStats.skillDmgMult > baseStats.skillDmgMult, 'destiny_resonance_crown + golden_temper must raise skillDmgMult');
  assert.ok(boostedStats.critDmg > baseStats.critDmg, 'destiny_resonance_crown must raise critDmg');
  assert.ok(B.getSealStats().cd < baseSealCd, 'destiny_resonance_crown must shorten Main Seal CD');

  // Fire Ember Echo: re-applies fire marks to nearby enemies & boosts next detonation
  B.game.hero.destinyEnhancements.destiny_ember_echo = true;
  B.game.phase = 'wave';
  B.game.enemies = [];
  const e1 = B.spawnEnemy('brute', 0, 1, { x: B.game.hero.x + 1.5, y: B.game.hero.y });
  const e2 = B.spawnEnemy('brute', 0, 1, { x: B.game.hero.x + 2.8, y: B.game.hero.y });
  e1.hp = e1.maxHp = 50000; e2.hp = e2.maxHp = 50000;
  B.applyFireMark(e1, 1, 'test', 4.5);
  B.triggerFireDetonation(e1, 1.2, { radius: 1.8, skillKey: 'firewave' });
  assert.ok(e2.fireMarkT > 0, 'destiny_ember_echo must re-apply fire mark to nearby enemies');
  assert.equal(B.game.hero.destinyEmberNextBoost, true, 'destiny_ember_echo must arm next detonation boost');

  // Glacial Aegis + Phantom Stride + Aegis Bulwark + Overdrive Nova + Fate Breaker
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'frost', gold: 500, materials: 20, seed: 4015 });
  const capBefore = B.getHeroMaxFrostShield();
  const maxHpBefore = B.game.hero.maxHp;
  B.game.hero.destinyEnhancements.destiny_glacial_aegis = true;
  assert.equal(B.getHeroMaxFrostShield(), capBefore + 40, 'destiny_glacial_aegis must add +40 frost shield cap');
  B.game.hero.destinyEnhancements.destiny_aegis_bulwark = true;
  B.enhanceGear({ location: 'equipped', idx: 0 }); // triggers syncHeroMaxHp
  assert.ok(B.game.hero.maxHp >= maxHpBefore + 90, 'destiny_aegis_bulwark must add +90 max HP');

  // Verify destiny_aegis_bulwark periodic 8s shield refresh during wave
  B.game.phase = 'wave';
  B.game.enemies = [];
  B.game.hero.shield = 0;
  B.game.hero.destinyBulwarkTimer = 0.05;
  B.tick(0.1);
  assert.ok(B.game.hero.shield >= 32, 'destiny_aegis_bulwark must grant periodic 32 frost shield');

  B.game.hero.destinyEnhancements.destiny_phantom_stride = true;
  B.game.hero.destinyEnhancements.destiny_overdrive_nova = true;
  B.game.hero.destinyEnhancements.destiny_fate_breaker = true;
  B.game.hero.face = 1;
  const boss = B.spawnEnemy('boss4', 0, 1, { x: B.game.hero.x + 1.4, y: B.game.hero.y });
  boss.hp = boss.maxHp = 50000;
  const critBeforeDash = B.getHeroStats().crit;
  assert.equal(B.castHeroDash(), true);
  assert.ok(B.game.hero.destinyDashBuffT > 0);
  assert.ok(B.getHeroStats().crit >= Math.min(1, critBeforeDash + 0.19), 'destiny_phantom_stride must boost crit after dash');
  assert.ok(boss.fireMarkT > 0 && boss.slowT > 0, 'destiny_phantom_stride must apply fire mark & frost slow along dash path');

  B.game.hero.ultCd = 0;
  assert.equal(B.castHeroOverdrive(), true);
  assert.ok(B.game.hero.ultCd < 15, 'destiny_overdrive_nova must reduce Overdrive CD by 22%');
  assert.ok(B.game.hero.shield >= 45, 'destiny_overdrive_nova must grant frost shield on cast');

  boss.vulnT = 0;
  B.game.hero.destinyBreakerCd = 0;
  B.dealDamage(boss, 200, { critChance: 1.0, critDmg: 2.0 });
  assert.ok(boss.vulnT >= 2.5, 'destiny_fate_breaker crit vs boss must apply 2.5s vulnerability');
  assert.ok(B.game.stats.destinyEnhancementProcs >= 4);
});

test('3. Affix Transfer atomicity, zero-side-effect preview/cancel, empty-slot fill & overwrite, real-time synergy recomputation, and all rejection guards', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire', gold: 500, materials: 20, transferTokens: 3, seed: 4020 });

  // Setup: Equipped slot 0 = 3-slot Fire Duo + vamp_siphon; Bag[0] = 3-slot Fire Trio (source); Bag[1] = 2-slot gear with empty slot 1
  const eqCore = B.createGearInstance('flame_fan', {
    sourceStage: 3, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'vamp_siphon'], enhanceLv: 2
  });
  const bagSourceTrio = B.createGearInstance('burn_core', {
    sourceStage: 3, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'fire_chain'], enhanceLv: 0
  });
  const bagTargetEmpty = B.createGearInstance('crit_axe', {
    sourceStage: 3, slotsCount: 2, affixes: ['fury_crit', null], enhanceLv: 1
  });
  const bagConflictTarget = B.createGearInstance('jade_pendant', {
    sourceStage: 3, slotsCount: 2, affixes: ['thunder_spark', 'vamp_siphon'], enhanceLv: 0
  });
  const bagWindSource = B.createGearInstance('wind_dagger', {
    sourceStage: 3, slotsCount: 1, affixes: ['wind_tempest'], enhanceLv: 0
  });

  B.game.hero.gear = [eqCore];
  B.game.bag = [bagSourceTrio, bagTargetEmpty, bagConflictTarget, bagWindSource];
  B.recomputeEquipmentSynergies();
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, true);
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, false);
  assert.equal(B.evaluateItemSynergies(bagSourceTrio)[0].id, 'fire_detonate_trio');

  // 3a) Preview then Cancel -> ZERO side effects on tokens, gold, gear, or synergies!
  const snapBeforeCancel = JSON.stringify({
    gold: B.game.gold,
    tokens: B.game.transferTokens,
    eq: B.game.hero.gear,
    bag: B.game.bag,
    syns: B.getActiveGearAffixSynergies().active.map(s => s.id)
  });
  const pv = B.previewAffixTransfer({
    source: bagSourceTrio.uid, sourceSlot: 2, // fire_chain (epic)
    target: eqCore.uid, targetSlot: 2         // overwrite vamp_siphon
  });
  assert.equal(pv.ok, true);
  assert.equal(pv.canCommit, true);
  assert.equal(pv.isOverwrite, true);
  assert.equal(pv.sourceBeforeSynergies[0].id, 'fire_detonate_trio');
  assert.equal(pv.sourceAfterSynergies[0].id, 'fire_detonate_duo');
  assert.equal(pv.targetAfterSynergies[0].id, 'fire_detonate_trio');
  assert.equal(pv.globalAfterSynergies[0].id, 'fire_detonate_trio');
  B.cancelAffixTransferPreview();
  assert.equal(B.game.transferDraft, null);
  const snapAfterCancel = JSON.stringify({
    gold: B.game.gold,
    tokens: B.game.transferTokens,
    eq: B.game.hero.gear,
    bag: B.game.bag,
    syns: B.getActiveGearAffixSynergies().active.map(s => s.id)
  });
  assert.equal(snapAfterCancel, snapBeforeCancel, 'Preview + Cancel must have ZERO side effects!');

  // 3b) Commit OVERWRITE transfer directly onto EQUIPPED gear (without unequipping!):
  //     Source loses fire_chain (slot 2 -> null, gear preserved, downgrades Trio -> Duo);
  //     Target equipped gear overwrites vamp_siphon -> fire_chain (upgrades Duo -> Complete Trio globally!)
  const goldBefore = B.game.gold;
  const tokensBefore = B.game.transferTokens;
  const commitOverwrite = B.commitAffixTransfer({
    source: bagSourceTrio.uid, sourceSlot: 2,
    target: eqCore.uid, targetSlot: 2
  });
  assert.equal(commitOverwrite.ok, true);
  assert.equal(commitOverwrite.isOverwrite, true);
  assert.equal(B.game.transferTokens, tokensBefore - commitOverwrite.costTokens);
  assert.equal(B.game.gold, goldBefore - commitOverwrite.costGold);
  assert.equal(bagSourceTrio.affixes[2], null, 'Source slot must become null empty slot while keeping source gear');
  assert.equal(bagSourceTrio.extractedCount, 1);
  assert.equal(B.game.bag.includes(bagSourceTrio), true, 'Source gear must be preserved');
  assert.equal(eqCore.affixes[2].id, 'fire_chain');
  assert.equal(eqCore.affixes[2].tier, 1 + eqCore.enhanceLv, 'Transferred affix tier should match target enhanceLv');
  assert.deepEqual(commitOverwrite.sourceSynergies, ['fire_detonate_duo']);
  assert.deepEqual(commitOverwrite.targetSynergies, ['fire_detonate_trio']);
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, true, 'Global synergy must immediately upgrade to Complete Fire Trio');
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, false, 'Complete Trio must replace Duo');

  // 3c) Commit EMPTY-SLOT transfer (bagSourceTrio slot 1 fire_burst -> bagTargetEmpty empty slot 1)
  const commitEmpty = B.commitAffixTransfer({
    source: bagSourceTrio.uid, sourceSlot: 1,
    target: bagTargetEmpty.uid, targetSlot: 1
  });
  assert.equal(commitEmpty.ok, true);
  assert.equal(commitEmpty.isOverwrite, false);
  assert.equal(bagSourceTrio.affixes[1], null);
  assert.equal(bagSourceTrio.extractedCount, 2);
  assert.deepEqual(commitEmpty.sourceSynergies, [], 'Source with only 1 affix left must downgrade to no synergy');
  assert.equal(bagTargetEmpty.affixes[1].id, 'fire_burst');

  // 3d) ALL REJECTION GUARDS must leave tokens, gold, and gear 100% UNCHANGED!
  const assertRejectedNoMutation = (params, expectedReason) => {
    const before = JSON.stringify({
      gold: B.game.gold,
      tokens: B.game.transferTokens,
      eq: B.game.hero.gear,
      bag: B.game.bag
    });
    const res = B.commitAffixTransfer(params);
    assert.equal(res.ok, false, `Expected rejection ${expectedReason}`);
    assert.equal(res.reason, expectedReason);
    const after = JSON.stringify({
      gold: B.game.gold,
      tokens: B.game.transferTokens,
      eq: B.game.hero.gear,
      bag: B.game.bag
    });
    assert.equal(after, before, `Rejected transfer (${expectedReason}) must have ZERO deduction and ZERO mutation!`);
  };

  // Same gear
  assertRejectedNoMutation({ source: eqCore.uid, sourceSlot: 0, target: eqCore.uid, targetSlot: 1 }, 'same_gear');
  // Empty source slot
  assertRejectedNoMutation({ source: bagSourceTrio.uid, sourceSlot: 2, target: eqCore.uid, targetSlot: 1 }, 'empty_source_slot');
  // Duplicate affix on target (bagSourceTrio slot 0 is fire_brand; eqCore already has fire_brand in slot 0 -> trying to put into slot 1 must reject!)
  assertRejectedNoMutation({ source: bagSourceTrio.uid, sourceSlot: 0, target: eqCore.uid, targetSlot: 1 }, 'duplicate_affix_on_target');
  // Conflict group on target (bagWindSource has wind_tempest [proc_style]; bagConflictTarget has thunder_spark [proc_style] in slot 0 -> putting into slot 1 must reject!)
  assertRejectedNoMutation({ source: bagWindSource.uid, sourceSlot: 0, target: bagConflictTarget.uid, targetSlot: 1 }, 'conflict_group_on_target');
  // Insufficient gold
  const savedGold = B.game.gold;
  B.game.gold = 5;
  assertRejectedNoMutation({ source: bagWindSource.uid, sourceSlot: 0, target: bagConflictTarget.uid, targetSlot: 0 }, 'insufficient_gold');
  B.game.gold = savedGold;
  // Insufficient transfer tokens
  const savedTok = B.game.transferTokens;
  B.game.transferTokens = 0;
  assertRejectedNoMutation({ source: bagWindSource.uid, sourceSlot: 0, target: bagConflictTarget.uid, targetSlot: 0 }, 'insufficient_transfer_tokens');
  B.game.transferTokens = savedTok;

  // Overwriting the conflicting slot itself (slot 0 thunder_spark -> replaced by wind_tempest) IS VALID!
  const overwriteConflictSlot = B.commitAffixTransfer({
    source: bagWindSource.uid, sourceSlot: 0,
    target: bagConflictTarget.uid, targetSlot: 0
  });
  assert.equal(overwriteConflictSlot.ok, true, 'Overwriting the conflicting slot directly must be allowed');
  assert.equal(bagConflictTarget.affixes[0].id, 'wind_tempest');
});

test('4. Anti-arbitrage verification and W21-W29 dual-route endgame economy regression (Regular Economy 0-Gamble vs Destiny Gamble + Affix Transfer)', () => {
  const { B } = bootBG60();

  // 4a) Anti-arbitrage proof: buy shop gear -> transfer affix -> sell/dismantle empty shell NEVER creates positive gold or free materials!
  B.loadTestPreset({ wave: 25, tier: 'standard', build: 'fire', gold: 2000, materials: 10, transferTokens: 5, seed: 4030 });
  const targetHolder = B.createGearInstance('vamp_fang', { sourceStage: 3, slotsCount: 3, affixes: ['fury_crit', null, null] });
  B.game.bag.push(targetHolder);
  const shopGearIdx = B.game.shop.findIndex(s => s.itemType === 'gear' && !s.bought);
  assert.ok(shopGearIdx >= 0);
  const shopOffer = B.game.shop[shopGearIdx];
  const paidGold = shopOffer.cost;
  const goldStart = B.game.gold;
  const matStart = B.game.materials;
  assert.equal(B.buyShopItem(shopGearIdx), true);
  const boughtShell = B.game.bag[B.game.bag.length - 1];
  assert.equal(boughtShell.paidGold, paidGold);

  // Find a non-conflicting affix on boughtShell to transfer to targetHolder empty slot 1
  const validSlot = boughtShell.affixes.findIndex(a => a && a.id !== 'fury_crit' && B.GEAR_AFFIXES[a.id]?.conflictGroup !== 'crit_stance');
  if (validSlot >= 0) {
    const trRes = B.commitAffixTransfer({
      source: boughtShell.uid, sourceSlot: validSlot,
      target: targetHolder.uid, targetSlot: 1
    });
    assert.equal(trRes.ok, true);
    const sellGold = B.getGearSellGold(boughtShell);
    const disMats = B.getGearDismantleMaterials(boughtShell);
    assert.ok(sellGold < paidGold, `Shop gear shell sellGold (${sellGold}) must be strictly < paidGold (${paidGold})`);
    assert.ok(goldStart - (B.game.gold + sellGold) >= (paidGold - sellGold) + trRes.costGold, 'Buy + Transfer + Sell must be strictly net negative in gold');
    // Dismantle shell: check materials per gold spent is strictly worse than buying Temper Pill (15g/mat)
    const goldSpentOnBuyAndTransfer = paidGold + trRes.costGold;
    assert.ok(goldSpentOnBuyAndTransfer / disMats > 15, 'Buy + Transfer + Dismantle must NEVER be cheaper per material than normal economy');
    B.dismantleBagGear(B.game.bag.indexOf(boughtShell));
    assert.equal(B.game.materials, matStart + disMats);
  }

  // 4b) Verify R30-04 W21-W29 endgame refinement drops & wave-clear material scaling
  assert.equal(B.getEnemyMaterialDrop({ elite: true }, 15), 1);
  assert.equal(B.getEnemyMaterialDrop({ elite: true }, 22), 2);
  assert.equal(B.getEnemyMaterialDrop({ elite: true }, 26), 3);
  assert.equal(B.getEnemyMaterialDrop({ boss: true }, 25), 6);
  assert.equal(B.getWaveClearMaterialBonus(20), 0);
  assert.equal(B.getWaveClearMaterialBonus(22), 1);
  assert.equal(B.getWaveClearMaterialBonus(26), 2);
  assert.equal(B.getWaveClearMaterialBonus(28), 3);

  // Helper to simulate clearing wave W (spawning wave elites + boss if W25, collecting chests -> bag, completing wave)
  function simulateWaveClearRewards(BInst) {
    const w = BInst.game.wave;
    const eliteCount = w >= 22 ? 3 : 2;
    for (let i = 0; i < eliteCount; i++) {
      BInst.game.materials += BInst.getEnemyMaterialDrop({ elite: true }, w);
      BInst.game.gold += 14;
    }
    if (w % 5 === 0) {
      BInst.game.materials += BInst.getEnemyMaterialDrop({ boss: true }, w);
      BInst.game.gold += 140;
    }
    // Simulate 1 chest gear drop per wave (retained in W21-W29 per R30-04!)
    const choices = BInst.pickChestGearChoices(w % 5 === 0, false);
    BInst.grantGearSafely(choices[0], { silent: true });
    BInst.completeWaveClear();
  }

  // 4c) ROUTE A: Regular Economy (0 Destiny Gambles!) from W21 -> W29
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire', gold: 380, materials: 10, transferTokens: 0, seed: 4031 });
  const regStartDmg = B.getHeroStats().dmgMult;
  let regEnhancementsW21To27 = 0;
  let regEnhancementsW28To29 = 0;
  let regShopGearBought = 0;
  let regDismantled = 0;

  for (let w = 21; w <= 28; w++) {
    simulateWaveClearRewards(B);
    // Dismantle dropped bag gear that is weaker than equipped, buy shop gear/temper pills when helpful, enhance equipped gear!
    while (B.game.bag.length > 1) {
      B.dismantleBagGear(B.game.bag.length - 1);
      regDismantled++;
    }
    const gIdx = B.game.shop.findIndex(s => s.itemType === 'gear' && !s.bought && s.cost <= B.game.gold);
    if (gIdx >= 0 && B.game.gold >= 260) {
      B.buyShopItem(gIdx);
      regShopGearBought++;
    }
    // Spend materials on enhancing equipped gear
    for (let s = 0; s < B.game.hero.gear.length; s++) {
      const r = B.enhanceGear({ location: 'equipped', idx: s });
      if (r.ok) {
        if (w >= 27) regEnhancementsW28To29++; // W28 prep (after W27 clear) & W29 prep (after W28 clear)
        else regEnhancementsW21To27++;
      }
    }
  }
  assert.equal(B.game.wave, 29);
  assert.equal(B.game.stats.destinyRolls, 0, 'Route A must perform 0 Destiny Gambles');
  assert.ok(regEnhancementsW28To29 >= 2, `Regular Economy route must have meaningful material sinks at W28-W29 (got ${regEnhancementsW28To29})`);
  assert.ok(B.getHeroStats().dmgMult > regStartDmg + 0.3, 'Regular Economy route must meaningfully grow combat power across W21-W29');
  const regSummary = {
    route: 'regular_0_gamble',
    wave: B.game.wave,
    gold: B.game.gold,
    materials: B.game.materials,
    enhanceLevels: B.game.hero.gear.map(g => g.enhanceLv),
    enhancementsW21To27: regEnhancementsW21To27,
    enhancementsW28To29: regEnhancementsW28To29,
    shopGearBought: regShopGearBought,
    dismantled: regDismantled,
    dmgMult: Number(B.getHeroStats().dmgMult.toFixed(2))
  };

  // 4d) ROUTE B: Destiny Gamble + Affix Transfer Route from W21 -> W29
  B.loadTestPreset({ wave: 21, tier: 'standard', build: 'fire', gold: 520, materials: 10, transferTokens: 0, seed: 4032 });
  // Give player a 3-slot equipped Fire Duo core (ready to upgrade to Trio via Affix Transfer!)
  B.game.hero.gear[0] = B.createGearInstance('flame_fan', {
    sourceStage: 3, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'vamp_siphon'], enhanceLv: 1
  });
  // And a bag donor holding fire_chain
  const donorGear = B.createGearInstance('burn_core', {
    sourceStage: 3, slotsCount: 2, affixes: ['fire_chain', 'fury_crit'], enhanceLv: 0
  });
  B.game.bag.push(donorGear);
  B.recomputeEquipmentSynergies();
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, true);
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, false);

  let gambleEnhW28To29 = 0;
  let transferCompleted = false;
  for (let w = 21; w <= 28; w++) {
    simulateWaveClearRewards(B);
    // Dismantle extra drops (keep donorGear!)
    for (let i = B.game.bag.length - 1; i >= 0; i--) {
      if (B.game.bag[i].uid !== donorGear.uid) B.dismantleBagGear(i);
    }
    // Save gold and gamble at high bet (>= 140) to earn Transfer Tokens & Destiny Exclusive Enhancements!
    while (B.game.gold >= 260 && (B.game.transferTokens < 1 || B.getOwnedDestinyEnhancements().length < 1)) {
      const r = B.rollDestinyGamble(150, { silent: true });
      if (r.ok && r.outcome === 'win') {
        const choices = r.pendingOffer.choices;
        let pickIdx = choices.findIndex(c => c.isTransferToken && B.game.transferTokens < 1);
        if (pickIdx < 0) pickIdx = choices.findIndex(c => c.isDestinyExclusive);
        if (pickIdx < 0) pickIdx = 0;
        B.claimDestinyReward(pickIdx, { silent: true });
      }
    }
    // Once we have a transfer token from Destiny Gamble, assemble Complete Fire Trio on equipped core!
    if (!transferCompleted && B.game.transferTokens >= 1 && B.game.gold >= 100) {
      const tr = B.commitAffixTransfer({
        source: donorGear.uid, sourceSlot: 0,
        target: B.game.hero.gear[0].uid, targetSlot: 2
      });
      if (tr.ok) transferCompleted = true;
    }
    // Continue refining equipped gear with ordinary materials!
    for (let s = 0; s < B.game.hero.gear.length; s++) {
      const r = B.enhanceGear({ location: 'equipped', idx: s });
      if (r.ok && w >= 27) gambleEnhW28To29++;
    }
  }
  assert.equal(B.game.wave, 29);
  assert.ok(B.game.stats.destinyRolls >= 1, 'Route B must engage Destiny Gamble');
  assert.equal(transferCompleted, true, 'Route B must acquire transfer token via Destiny Gamble and complete Affix Transfer');
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, true, 'Route B must assemble Complete Fire Trio via Affix Transfer');
  assert.ok(gambleEnhW28To29 >= 2, `Gamble+Transfer route must also have meaningful material sinks at W28-W29 (got ${gambleEnhW28To29})`);

  const gambleSummary = {
    route: 'destiny_gamble_plus_transfer',
    wave: B.game.wave,
    gold: B.game.gold,
    materials: B.game.materials,
    transferTokensLeft: B.game.transferTokens,
    destinyRolls: B.game.stats.destinyRolls,
    destinyEmpty: B.game.stats.destinyEmptyTribulations,
    destinyExclusives: B.getOwnedDestinyEnhancements().map(e => e.key),
    affixTransfers: B.game.stats.affixTransfers,
    hasFireTrio: B.getActiveGearAffixSynergies().hasFireTrio,
    enhanceLevels: B.game.hero.gear.map(g => g.enhanceLv),
    enhancementsW28To29: gambleEnhW28To29,
    dmgMult: Number(B.getHeroStats().dmgMult.toFixed(2))
  };
  assert.ok(regSummary.dmgMult > 2.0 && gambleSummary.dmgMult > 2.0);
});

test('5. W29 90s final prep non-blocking timer with Destiny/Transfer modals, HUD entries, BG60.loadTestPreset transferTokens & export/importBuildPreset roundtrip', () => {
  const { B, doc } = bootBG60();

  // 5a) loadTestPreset initializes transferTokens by wave/tier & supports explicit override
  const pW10 = B.loadTestPreset({ wave: 10, tier: 'standard', build: 'fire', seed: 4040 });
  assert.equal(pW10.transferTokens, 0);
  const pW29Std = B.loadTestPreset({ wave: 29, tier: 'standard', build: 'fire', seed: 4041 });
  assert.equal(pW29Std.transferTokens, 2);
  const pW29Strong = B.loadTestPreset({ wave: 29, tier: 'strong', build: 'frost', seed: 4042 });
  assert.equal(pW29Strong.transferTokens, 4);
  const pOverride = B.loadTestPreset({ wave: 29, tier: 'standard', build: 'fire', transferTokens: 7, gold: 800, seed: 4043 });
  assert.equal(pOverride.transferTokens, 7);
  assert.equal(B.game.transferTokens, 7);
  assert.match(pOverride.unimplementedStageFeatures.stage4_fateGambleAndTransfer, /Implemented in Stage 4/);

  // 5b) HUD pills & buttons exist and update cleanly between prep & wave
  assert.ok(doc.getElementById('tokenPill').textContent.includes('7'));
  assert.equal(doc.getElementById('destinyBtn').disabled, false);
  assert.equal(doc.getElementById('transferBtn').disabled, false);

  // 5c) W29 90s final prep: opening Destiny Gamble / Affix Transfer does NOT pause timer;
  //     timer expiry clears transferDraft, auto-claims unclaimed pendingOffer ONCE safely (preserving 5★ main seal!), and starts W30!
  B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 900, materials: 30, transferTokens: 3, seed: 4044 });
  assert.equal(B.game.seal.kind, 'fire');
  assert.equal(B.game.seal.star, 5);
  B.game.wave = 30;
  B.enterW29FinalPrep(10);
  assert.equal(B.game.finalPrep.active, true);
  assert.equal(B.game.finalPrep.timer, 10);

  // Open Destiny Gamble modal and win a bet with off-element seal choices; also create an uncommitted transfer preview draft!
  B.openDestinyGambleModal();
  assert.equal(B.game.activeModal.type, 'destiny_gamble');
  const winRes = B.rollDestinyGamble(120, { forceOutcome: 'win', silent: true });
  assert.equal(winRes.ok, true);
  winRes.pendingOffer.choices = [0, 1, 2].map(i => ({
    choiceIndex: i, category: 'seal', subType: 'seal', rarity: 'epic', kind: 'frost', elem: 'frost', star: 3, icon: '❄️', name: '寒玉灵印 3★'
  }));
  B.game.bag.push(B.createGearInstance('burn_core', { sourceStage: 3, slotsCount: 2, affixes: ['fury_crit', 'vamp_siphon'] }));
  B.previewAffixTransfer({
    source: B.game.bag[0].uid, sourceSlot: 0,
    target: B.game.hero.gear[0].uid, targetSlot: 0
  });
  assert.ok(B.game.transferDraft, 'Transfer preview draft exists before timeout');

  // Tick 4s with speed=2 (real time = 2s, MUST NOT pause even while destiny_gamble modal is open!)
  B.game.speed = 2;
  for (let i = 0; i < 40; i++) B.tick(0.1); // 40 * (0.1/2) = 2s real time
  assert.ok(B.game.finalPrep.timer < 8.1 && B.game.finalPrep.timer > 7.9, `W29 timer must count down in real time while Destiny modal is open (got ${B.game.finalPrep.timer})`);

  // Tick remaining time until expiry
  for (let i = 0; i < 200 && B.game.phase === 'prep'; i++) B.tick(0.1);
  assert.equal(B.game.phase, 'wave', 'W29 timeout must automatically start W30');
  assert.equal(B.game.wave, 30);
  assert.equal(B.game.transferDraft, null, 'Uncommitted transfer draft must be cleared on W29 timeout');
  assert.equal(B.getPendingDestinyOffer(), null, 'Unclaimed Destiny offer must be auto-claimed on W29 timeout');
  assert.equal(B.game.stats.destinyClaims, 1, 'Auto-claim must fire strictly once');
  assert.equal(B.game.seal.kind, 'fire', 'W29 timeout auto-claim must preserve 5★ Fire Main Seal');
  assert.equal(B.game.seal.star, 5);
  assert.equal(B.game.transferTokens, 3, 'Cancelled transfer draft must not deduct transferTokens');

  // 5d) exportBuildPreset / importBuildPreset roundtrip preserves Stage 4 state!
  B.loadTestPreset({ wave: 28, tier: 'standard', build: 'frost', gold: 650, materials: 24, transferTokens: 5, seed: 4045 });
  B.game.hero.destinyEnhancements.destiny_glacial_aegis = true;
  B.game.hero.sealEssenceBonus = 0.22;
  B.rollDestinyGamble(120, { forceOutcome: 'win', silent: true });
  const snap = B.exportBuildPreset();
  assert.equal(snap.schema, 'bg60-build-preset-v4');
  assert.equal(snap.transferTokens, 5);
  assert.equal(snap.hero.destinyEnhancements.destiny_glacial_aegis, true);
  assert.ok(snap.destinyPendingOffer && !snap.destinyPendingOffer.claimed);

  const imp = B.importBuildPreset(snap);
  assert.equal(imp.ok, true);
  assert.equal(B.game.transferTokens, 5);
  assert.equal(B.hasDestinyEnhancement('destiny_glacial_aegis'), true);
  assert.equal(B.game.hero.sealEssenceBonus, 0.22);
  assert.equal(B.getPendingDestinyOffer()?.offerId, snap.destinyPendingOffer.offerId);
});
