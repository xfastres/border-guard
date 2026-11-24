'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');
const CONFIG_PATH = path.join(ROOT, 'balance', 'v060-baseline.json');

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
      style: { setProperty() {} },
      dataset: {},
      hidden: false,
      disabled: false,
      _innerHTML: '',
      _textContent: '',
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

test('1. W29 same-direction escalation (tighter & tougher than W28), W30 intel reveal, wave-end reward gating & real-time 90s speed invariance', () => {
  const { B } = bootBG60();
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert.match(B.version, /^0\.60\.0-stage[5-9]/);
  assert.ok(cfg.w30Boss && cfg.wave.w29Outpost);

  // Compare W28 vs W29 queue metrics on the same seed
  B.loadTestPreset({ wave: 28, tier: 'standard', build: 'fire', seed: 5001 });
  const q28 = B.buildWaveQueue(28);
  const mobs28 = q28.filter(x => x.kind !== 'elite' && !x.kind.startsWith('boss'));
  const span28 = Math.max(...mobs28.map(x => x.at)) - Math.min(...mobs28.map(x => x.at));
  const avgScale28 = mobs28.reduce((s, x) => s + x.scale, 0) / mobs28.length;

  B.loadTestPreset({ wave: 29, tier: 'standard', build: 'fire', seed: 5001 });
  assert.equal(B.isW30BossIntelRevealed(), true, 'W30 Boss intel must be revealed by W29 prep');
  const w30Intel = B.getW30BossIntel();
  assert.equal(w30Intel.revealed, true);
  assert.ok(w30Intel.coreName && w30Intel.auxKey && w30Intel.auxFairness);

  const q29 = B.buildWaveQueue(29);
  const mobs29 = q29.filter(x => x.kind !== 'elite' && !x.kind.startsWith('boss'));
  const span29 = Math.max(...mobs29.map(x => x.at)) - Math.min(...mobs29.map(x => x.at));
  const avgScale29 = mobs29.reduce((s, x) => s + x.scale, 0) / mobs29.length;

  assert.ok(span29 < span28, `W29 spawn span (${span29.toFixed(2)}s) must be tighter than W28 (${span28.toFixed(2)}s)`);
  assert.ok(avgScale29 > avgScale28, `W29 enemy HP scale (${avgScale29.toFixed(2)}) must be tougher than W28 (${avgScale28.toFixed(2)})`);
  assert.ok(mobs29.length >= mobs28.length, `W29 mob count (${mobs29.length}) should escalate vs W28 (${mobs28.length})`);

  // Verify W29 wave-end rewards (ground chest + levelup modal) MUST settle BEFORE 90s timer starts!
  B.startWave();
  B.game.chests.push({ x: B.game.hero.x + 2, y: B.game.hero.y, legend: false, bob: 0 });
  B.game.hero.xp = B.game.hero.xpNext - 1;
  B.game.gems.push({ x: B.game.hero.x, y: B.game.hero.y, xp: 10, vx: 0, vy: 0, t: 1, magnetized: true });
  // Ensure next level is even so levelup modal triggers on wave clear
  if ((B.game.hero.lv + 1) % 2 !== 0) {
    B.game.hero.lv += 1;
    B.game.hero.xpNext = B.xpForLevel(B.game.hero.lv);
    B.game.hero.xp = B.game.hero.xpNext - 1;
  }
  B.completeWaveClear();

  const fpWait = B.getFinalPrepState();
  assert.equal(fpWait.active, true);
  assert.equal(fpWait.awaitingWaveRewards, true, '90s timer must wait while W29 levelup/chest rewards remain unsettled');
  assert.equal(fpWait.started, false);
  assert.equal(fpWait.timer, 90);

  // Ticking 20s while wave-end reward modals are open MUST NOT drain the 90s timer
  for (let i = 0; i < 40; i++) B.stepFrame(0.5);
  assert.equal(B.getFinalPrepState().timer, 90, 'Timer must stay frozen at 90s until wave-end rewards settle');

  // Settle all W29 wave-end reward modals
  while (B.game.activeModal) {
    if (B.game.activeModal.type === 'levelup') {
      const ch = B.game.activeModal.choices || [];
      const pick = ch.find(k => (B.game.hero.skills[k] || 0) < 5) || ch[0];
      if (pick) B.pickHeroSkill(pick); else B.closeModal();
    } else if (B.game.activeModal.type === 'chest') {
      const ch = B.game.activeModal.choices || [];
      if (ch[0]) B.pickGearReward(ch[0]); else B.closeModal();
    } else B.closeModal();
  }
  B.syncW29FinalPrepStart();
  const fpStarted = B.getFinalPrepState();
  assert.equal(fpStarted.awaitingWaveRewards, false);
  assert.equal(fpStarted.started, true);
  assert.equal(fpStarted.timer, 90);

  // Verify 2x battle speed does NOT accelerate 90s real-time countdown (stepFrame runs 2 ticks at speed=2)
  B.game.speed = 2;
  for (let i = 0; i < 200; i++) B.stepFrame(0.05); // 10.0s real elapsed time
  assert.ok(Math.abs(B.getFinalPrepState().timer - 80) < 0.05, `Expected ~80s left after 10s real time at 2x speed, got ${B.getFinalPrepState().timer}`);

  // Verify opening Destiny Gamble, Affix Transfer, Shop Confirm, and Equipment Inspector NEVER pauses 90s countdown
  B.openDestinyGambleModal();
  for (let i = 0; i < 100; i++) B.stepFrame(0.05); // 5.0s real elapsed
  assert.ok(Math.abs(B.getFinalPrepState().timer - 75) < 0.05, `Destiny modal must not pause W29 timer, got ${B.getFinalPrepState().timer}`);

  B.openAffixTransferModal();
  for (let i = 0; i < 100; i++) B.stepFrame(0.05); // 5.0s real elapsed
  assert.ok(Math.abs(B.getFinalPrepState().timer - 70) < 0.05, `Transfer modal must not pause W29 timer, got ${B.getFinalPrepState().timer}`);

  B.game.inspTarget = { type: 'hero' };
  B.game.speed = 1;
  for (let i = 0; i < 100; i++) B.stepFrame(0.05); // 5.0s real elapsed
  assert.ok(Math.abs(B.getFinalPrepState().timer - 65) < 0.05, `Inspector must not pause W29 timer, got ${B.getFinalPrepState().timer}`);
});

test('2. W29 timeout & early-start boundary atomicity: inspect, shop confirm, transfer preview, duplicate clicks & full-bag off-element seal auto-claim safety', () => {
  const { B } = bootBG60();

  // Case A: Timeout while inspecting hero, holding unconfirmed transfer preview & shop confirm draft, plus unclaimed Destiny offer with ALL 3 choices being off-element seals & FULL main/sub seals + FULL bag!
  B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 800, materials: 50, transferTokens: 5, seed: 5101 });
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  B.syncW29FinalPrepStart();

  // Record original equipped 5★ main seal, 2 sub seals, and 4 equipped gear instances
  const origMainSeal = { kind: B.game.seal.kind, star: B.game.seal.star, route: B.game.seal.route };
  const origSubSeals = B.game.subSeals.map(s => ({ kind: s.kind, star: s.star }));
  const origGearUids = B.game.hero.gear.map(g => g.uid);
  assert.equal(origMainSeal.kind, 'fire');
  assert.equal(origMainSeal.star, 5);
  assert.equal(origSubSeals.length, 2);
  assert.equal(origGearUids.length, 4);

  // Fill bag to 100% capacity
  const bagCap = B.getBagCapacity();
  B.game.bag = [];
  for (let i = 0; i < bagCap; i++) {
    B.game.bag.push(B.createGearInstance('bronze_tassel', { sourceStage: 3, slotsCount: 1, affixes: ['fury_crit'], origin: 'test_fill' }));
  }
  assert.equal(B.game.bag.length, bagCap);

  // Open an unconfirmed affix transfer preview (must be cleared with 0 token/gold loss!)
  const prevRes = B.previewAffixTransfer({
    srcLoc: { area: 'bag', index: 0 },
    srcSlot: 0,
    dstLoc: { area: 'hero', index: 1 },
    dstSlot: 0
  });
  assert.equal(prevRes.ok, true);
  assert.ok(B.game.transferDraft);

  // Open an unconfirmed shop purchase draft (must be cleared with 0 gold loss!)
  const shopConfirm = B.openShopPurchaseConfirm(0);
  assert.equal(shopConfirm.ok, true);
  assert.ok(B.game.shopConfirmDraft);

  // Open hero inspector
  B.game.inspTarget = { type: 'hero' };

  // Inject an already-won unclaimed Destiny offer where ALL 3 choices are off-element ('holy') seals!
  B.game.destiny.pendingOffer = {
    offerId: 'w29_timeout_off_elem_seal_test',
    bet: 220,
    wave: 30,
    claimed: false,
    choices: [0, 1, 2].map(idx => ({
      choiceIndex: idx,
      category: 'seal',
      kind: 'holy',
      rarity: 'epic',
      star: 3,
      name: '圣光灵印 3★',
      icon: '✨',
      desc: '异系灵印测试候选'
    }))
  };

  const goldBeforeExpiry = B.game.gold;
  const tokensBeforeExpiry = B.game.transferTokens;
  const stashBeforeExpiry = B.game.rewardStash.length;

  // Expire 90s timer -> auto transition to W30
  B.game.finalPrep.timer = 0.04;
  B.stepFrame(0.05);

  assert.equal(B.game.wave, 30);
  assert.equal(B.game.phase, 'wave');
  assert.equal(B.game.finalPrep.active, false);
  assert.equal(B.game.transferDraft, null, 'Unconfirmed transfer preview must be cleared on timeout');
  assert.equal(B.game.shopConfirmDraft, null, 'Unconfirmed shop confirm draft must be cleared on timeout');
  assert.equal(B.game.gold, goldBeforeExpiry, 'Unconfirmed drafts must not deduct gold');
  assert.equal(B.game.transferTokens, tokensBeforeExpiry, 'Unconfirmed transfer draft must not deduct transferTokens');

  // Verify off-element seal was safely routed to rewardStash AND equipped 5★ main seal + sub seals + 4 gears are 100% intact!
  assert.equal(B.game.destiny.pendingOffer, null, 'Pending Destiny offer must be resolved');
  assert.equal(B.game.rewardStash.length, stashBeforeExpiry + 1, 'Off-element seal with full slots & full bag must route to rewardStash');
  const stashedItem = B.game.rewardStash[B.game.rewardStash.length - 1];
  assert.equal(stashedItem.item?.kind || stashedItem.kind, 'holy');
  assert.deepEqual({ kind: B.game.seal.kind, star: B.game.seal.star, route: B.game.seal.route }, origMainSeal);
  assert.deepEqual(B.game.subSeals.map(s => ({ kind: s.kind, star: s.star })), origSubSeals);
  assert.deepEqual(B.game.hero.gear.map(g => g.uid), origGearUids);

  // Rapid duplicate clicks after timeout MUST be rejected with zero mutation
  const postBuy = B.confirmShopPurchase();
  const postClaim = B.claimDestinyReward(0);
  const postGamble = B.rollDestinyGamble(100);
  const postTransfer = B.commitAffixTransfer({
    srcLoc: { area: 'bag', index: 0 }, srcSlot: 0,
    dstLoc: { area: 'hero', index: 1 }, dstSlot: 0
  });
  assert.equal(postBuy.ok, false);
  assert.equal(postClaim.ok, false);
  assert.equal(postGamble.ok, false);
  assert.equal(postTransfer.ok, false);
  assert.equal(B.game.gold, goldBeforeExpiry);
  assert.equal(B.game.transferTokens, tokensBeforeExpiry);

  // Case B: Early start with unclaimed Destiny offer prompts first, then succeeds when acceptRandomClaim=true
  B.loadTestPreset({ wave: 29, tier: 'standard', build: 'frost', gold: 500, seed: 5102 });
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  B.syncW29FinalPrepStart();

  B.game.destiny.pendingOffer = {
    offerId: 'w29_early_confirm_test',
    bet: 120,
    wave: 30,
    claimed: false,
    choices: [
      { choiceIndex: 0, category: 'pill', kind: 'pill', rarity: 'rare', pillKey: 'temper', name: '淬灵丹', icon: '💎', desc: '测试丹药' },
      { choiceIndex: 1, category: 'pill', kind: 'pill', rarity: 'rare', pillKey: 'temper', name: '淬灵丹', icon: '💎', desc: '测试丹药' },
      { choiceIndex: 2, category: 'pill', kind: 'pill', rarity: 'rare', pillKey: 'temper', name: '淬灵丹', icon: '💎', desc: '测试丹药' }
    ]
  };
  const matBeforeEarly = B.game.materials;

  // First click without explicit acceptRandomClaim -> opens confirmation prompt, stays in prep
  const earlyBlocked = B.startW30Early({ acceptRandomClaim: false });
  assert.equal(earlyBlocked.ok, false);
  assert.equal(earlyBlocked.reason, 'pending_destiny_offer_requires_choice');
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.activeModal?.type, 'w30_early_confirm');

  // Confirmed early start with acceptRandomClaim=true -> atomically claims 1 reward & enters W30
  const earlyConfirmed = B.startW30Early({ acceptRandomClaim: true });
  assert.equal(earlyConfirmed.ok, true);
  assert.equal(earlyConfirmed.startedW30, true);
  assert.equal(B.game.phase, 'wave');
  assert.equal(B.game.wave, 30);
  assert.equal(B.game.destiny.pendingOffer, null);
  assert.ok(B.game.materials > matBeforeEarly, 'Randomly claimed temper pill must be granted once');

  // Calling startW30Early again must not double-grant
  const earlyDup = B.startW30Early({ acceptRandomClaim: true });
  assert.equal(earlyDup.ok, false);
});

test('3. W30 Boss signature move truncation (no skip), strict HP & damage-lifesteal 0 during lock, legitimate status/shield hits, and immediate final-phase kill victory', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 30, tier: 'strong', build: 'frost', seed: 5201 });
  B.startWave();
  for (let i = 0; i < 15; i++) B.tick(0.1);
  // Isolate boss6
  B.game.enemies = B.game.enemies.filter(e => e.kind === 'boss6');
  B.game.waveQueue.forEach(q => { q.spawned = true; });
  const boss = B.game.enemies[0];
  assert.ok(boss && boss.kind === 'boss6');

  const sigHp = boss.signatureThresholdHp;
  assert.equal(sigHp, Math.round(boss.maxHp * 0.8));

  // Hit boss with 999,999,999 overkill damage -> MUST truncate cleanly at 80% HP and enter signature lock!
  B.dealDamage(boss, 999999999, { fromHero: true, skillKey: 'firewave' });
  assert.equal(boss.hp, sigHp, 'Overkill crossing 80% threshold must truncate exactly to signatureThresholdHp');
  assert.equal(boss.signatureTriggered, true);
  assert.equal(boss.signatureLockActive, true);
  assert.equal(B.game.w30Battle.phase, 'signature_telegraph');
  assert.ok(B.game.w30Battle.signatureTruncatedDmg > 0);

  // During signature lock: lower hero HP and equip lifesteal to verify damage-based lifesteal === 0 while status/shield STILL trigger!
  B.game.hero.hp = Math.round(B.game.hero.maxHp * 0.5);
  B.game.hero.shield = 0;
  B.game.hero.frostShieldActive = false;
  const hpBeforeLockHits = B.game.hero.hp;

  // Apply Fire mark + Frost slow + Hero hit (with lifesteal) during signature lock
  B.applyFireMark(boss, 2, 'test_lock', 4.5);
  B.applyFrostSlow(boss, 0.55, 3.0, 'test_lock');
  const lockHitDmg = B.dealDamage(boss, 500000, {
    fromHero: true,
    skillKey: 'nova',
    critChance: 1,
    critDmg: 2.5
  });

  assert.equal(lockHitDmg, 0, 'Actual HP damage during signature lock must be 0');
  assert.equal(boss.hp, sigHp, 'Boss HP must stay strictly locked at signatureThresholdHp');
  assert.equal(B.game.hero.hp, hpBeforeLockHits, 'Damage-based lifesteal during signature lock must be 0');
  assert.ok(boss.fireMarkT > 0, 'Legitimate Fire Mark must still apply during signature lock');
  assert.ok(boss.slowT > 0, 'Legitimate Frost Slow must still apply during signature lock');
  assert.ok(B.game.hero.shield > 0 && B.game.hero.frostShieldActive, 'Legitimate Frost Shield on chilled hit must still trigger during signature lock');
  assert.ok(B.game.w30Battle.signatureHitsDuringLock >= 1);
  assert.ok(B.game.w30Battle.signatureStatusHitsDuringLock.fireMarks >= 1);
  assert.ok(B.game.w30Battle.signatureStatusHitsDuringLock.frostSlows >= 1);
  assert.ok(B.game.w30Battle.signatureStatusHitsDuringLock.frostShieldGained > 0);

  // Advance past telegraph (2.6s) + shockwave (2.2s) -> lock releases immediately upon shockwave end!
  B.game.hero.invuln = 10; // avoid dying while testing lock release
  for (let i = 0; i < 60; i++) B.tick(0.1);
  assert.equal(boss.signatureLockActive, false, 'Signature lock must release immediately after shockwave ends');
  assert.equal(B.game.w30Battle.phase, 'mid_skirmish');

  // Verify damage resumes immediately after unlock and transitions into Final Phase (<= 35%)
  const hpAfterUnlock = boss.hp;
  const resumedDmg = B.dealDamage(boss, Math.round(boss.maxHp * 0.5), { fromHero: true, skillKey: 'nova' });
  assert.ok(resumedDmg > 0 && boss.hp < hpAfterUnlock, 'Damage must resume immediately after signature lock ends');
  assert.equal(boss.finalPhaseEntered, true);
  assert.equal(B.game.w30Battle.phase, 'final_combo');

  // Final Phase has NO extra HP lock -> depleting remaining HP immediately wins W30 and opens 3D settlement!
  B.dealDamage(boss, boss.hp + 999999, { fromHero: true, skillKey: 'nova' });
  assert.equal(B.game.phase, 'won', 'Depleting Boss6 HP in Final Phase must immediately win the run');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, true);
  assert.equal(B.game.w30Battle.phase, 'ended');
});

test('4. W30 fixed-HP 3-tier calibration (Standard Fire & Frost inside 180-300s, Strong faster, Weak slower) & real W30 Fire/Frost synergy verification', () => {
  const { B } = bootBG60();
  const fixedHp = B.BALANCE.enemies.boss6.hp;
  const results = {};

  for (const build of ['fire', 'frost']) {
    for (const tier of ['weak', 'standard', 'strong']) {
      B.loadTestPreset({ wave: 30, tier, build, seed: 5050 });
      B.startWave();
      let t = 0;
      const dt = 0.1;
      let bossMaxHpSeen = 0;
      while (B.game.phase === 'wave' && t < 480) {
        const h = B.game.hero;
        const boss = B.game.enemies.find(e => e.kind === 'boss6' && e.hp > 0);
        if (boss) {
          if (!bossMaxHpSeen) bossMaxHpSeen = boss.maxHp;
          // Realistic player kiting & dodging cycle: 55% engagement (3.6 cells), 45% dodging telegraphs (6.2 cells)
          const r = (t % 6 < 3.3) ? 3.6 : 6.2;
          const ang = t * 0.9;
          h.x = Math.max(2, Math.min(B.W - 2, boss.x + Math.cos(ang) * r));
          h.y = Math.max(2, Math.min(B.H - 2, boss.y + Math.sin(ang) * r));
          h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.75));
          if (Math.round(t * 10) % 35 === 0 && h.dashCd <= 0) B.castHeroDash();
        }
        B.tick(dt);
        t += dt;
      }
      assert.equal(bossMaxHpSeen, fixedHp, `Fixed Boss6 HP must be identical for ${build}/${tier}`);
      const w30 = B.game.w30Battle;
      results[`${build}_${tier}`] = {
        phase: B.game.phase,
        elapsed: Number((w30?.elapsedSeconds || t).toFixed(1)),
        signatureTriggered: !!w30?.signatureTriggered,
        lockHits: w30?.signatureHitsDuringLock || 0,
        lockMarks: w30?.signatureStatusHitsDuringLock?.fireMarks || 0,
        lockShield: w30?.signatureStatusHitsDuringLock?.frostShieldGained || 0,
        fireDets: B.game.stats.fireDetonations || 0,
        w20Procs: B.game.hero.combatStateStats?.w20EnhancementProcs || 0,
        frostPulses: B.game.hero.combatStateStats?.frostPulsesTriggered || 0
      };
    }
  }

  // Standard reference builds (BOTH Fire and Frost!) must land inside 3-5 min (180-300s) against the exact same fixed Boss6 HP
  assert.equal(results.fire_standard.phase, 'won');
  assert.equal(results.frost_standard.phase, 'won');
  assert.ok(
    results.fire_standard.elapsed >= 180 && results.fire_standard.elapsed <= 300,
    `Expected fire/standard W30 time in 180-300s, got ${results.fire_standard.elapsed}s`
  );
  assert.ok(
    results.frost_standard.elapsed >= 180 && results.frost_standard.elapsed <= 300,
    `Expected frost/standard W30 time in 180-300s, got ${results.frost_standard.elapsed}s`
  );

  // Strong builds must be clearly faster while STILL triggering full signature move
  assert.equal(results.fire_strong.phase, 'won');
  assert.equal(results.frost_strong.phase, 'won');
  assert.equal(results.fire_strong.signatureTriggered, true);
  assert.equal(results.frost_strong.signatureTriggered, true);
  assert.ok(results.fire_strong.elapsed < results.fire_standard.elapsed * 0.8, `Expected fire/strong (${results.fire_strong.elapsed}s) clearly faster than standard (${results.fire_standard.elapsed}s)`);
  assert.ok(results.frost_strong.elapsed < results.frost_standard.elapsed * 0.85, `Expected frost/strong (${results.frost_strong.elapsed}s) clearly faster than standard (${results.frost_standard.elapsed}s)`);

  // Weak builds must take clearly longer than standard builds
  assert.ok(results.fire_weak.elapsed > results.fire_standard.elapsed * 1.4, `Expected fire/weak (${results.fire_weak.elapsed}s) clearly slower than standard (${results.fire_standard.elapsed}s)`);
  assert.ok(results.frost_weak.elapsed > results.frost_standard.elapsed * 1.3, `Expected frost/weak (${results.frost_weak.elapsed}s) clearly slower than standard (${results.frost_standard.elapsed}s)`);

  // Verify real Fire & Frost cross-stage synergies execute in W30 Boss fight
  assert.ok(results.fire_standard.fireDets > 20 && results.fire_standard.w20Procs > 20, 'Fire isolated Boss detonation + W20 procs must trigger in W30');
  assert.ok(results.fire_standard.lockMarks > 0, 'Fire marks must apply during W30 signature lock');
  assert.ok(results.frost_standard.frostPulses > 10 && results.frost_standard.lockShield > 0, 'Frost active pulses & lock-phase shield stacking must trigger in W30');
});

test('5. All 4 W30 fair auxiliary mechanics execute cleanly, arena healing orbs sustain non-lifesteal kiting, and W30 defeat settlement works', () => {
  const { B } = bootBG60();
  const auxKeys = B.W30_BOSS_AUX_POOL.map(a => a.key);
  assert.deepEqual(auxKeys, ['abyss_pillars', 'eclipse_seekers', 'rift_rings', 'void_guards']);

  for (const aux of B.W30_BOSS_AUX_POOL) {
    B.loadTestPreset({ wave: 30, tier: 'standard', build: 'frost', seed: 5300 });
    B.game.bossIntel.w30AuxKey = aux.key;
    B.game.bossIntel.w30Aux = aux.name;
    B.game.bossIntel.w30AuxDesc = aux.desc;
    B.startWave();
    for (let i = 0; i < 15; i++) B.tick(0.1);
    const boss = B.game.enemies.find(e => e.kind === 'boss6');
    assert.ok(boss);
    // Move past opening into mid_skirmish so aux timer fires
    boss.signatureTriggered = true;
    boss.signatureLockActive = false;
    boss.bossAuxTimer = 0.05;
    B.game.hero.invuln = 10;
    let sawSeeker = false;
    let sawRift = false;
    for (let i = 0; i < 15; i++) {
      B.tick(0.1);
      if (B.game.projectiles.some(p => p.w30Aux === 'eclipse_seekers')) sawSeeker = true;
      if (B.game.zones.some(z => z.w30Aux === 'rift_rings')) sawRift = true;
    }

    if (aux.key === 'abyss_pillars') {
      const pillar = B.game.enemies.find(e => e.kind === 'pillar');
      assert.ok(pillar, 'abyss_pillars must spawn a destructible pillar');
      B.dealDamage(pillar, pillar.hp + 9999, { fromHero: true, skillKey: 'nova' });
      assert.ok(boss.vulnT > 0, 'Destroying pillar must apply vulnerability to Boss6');
      assert.ok(B.game.healOrbs.length > 0, 'Destroying pillar must drop a healing spirit orb');
    } else if (aux.key === 'eclipse_seekers') {
      assert.equal(sawSeeker, true, 'eclipse_seekers must fire tagged seeker projectiles');
    } else if (aux.key === 'rift_rings') {
      assert.equal(sawRift, true, 'rift_rings must spawn tagged double rift rings');
    } else if (aux.key === 'void_guards') {
      const guard = B.game.enemies.find(e => e.kind === 'void_guard');
      assert.ok(guard, 'void_guards must spawn killable void guards');
      B.dealDamage(guard, guard.hp + 9999, { fromHero: true, skillKey: 'nova' });
      assert.ok(B.game.healOrbs.length > 0, 'Killing void guard must drop a healing spirit orb');
    }
  }

  // Verify healing spirit orb pickup restores HP
  B.loadTestPreset({ wave: 30, tier: 'standard', build: 'frost', seed: 5305 });
  B.startWave();
  B.game.hero.hp = Math.round(B.game.hero.maxHp * 0.4);
  const hpBeforeOrb = B.game.hero.hp;
  B.spawnHealOrb(B.game.hero.x, B.game.hero.y);
  B.tick(0.1);
  assert.ok(B.game.hero.hp > hpBeforeOrb, 'Collecting healing spirit orb must restore hero HP');

  // Verify W30 defeat triggers immediate settlement with W30 telemetry
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(B.game.hero.hp + 99999);
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, false);
  assert.equal(B.game.w30Battle.phase, 'ended');
});
