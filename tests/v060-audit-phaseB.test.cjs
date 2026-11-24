'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');

function bootBG60({ initialNowMs = 0, innerWidth = 1440, innerHeight = 900 } = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Border-Guard-v0.60.html must contain embedded <script>');
  const src = match[1];
  const ctx2d = new Proxy({}, { get: () => () => {} });
  const cache = {};
  function makeEl(id) {
    const classes = new Set();
    const children = [];
    const listeners = {};
    const node = {
      id,
      style: { setProperty() {} },
      dataset: {},
      hidden: false,
      disabled: false,
      title: '',
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
      addEventListener(ev, fn) {
        (listeners[ev] ||= []).push(fn);
      },
      click() {
        if (this.disabled) return;
        for (const fn of (listeners.click || [])) {
          fn({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node });
        }
      },
      append(...nodes) { children.push(...nodes); },
      appendChild(n) { children.push(n); },
      replaceChildren(...nodes) { children.length = 0; children.push(...nodes); },
      querySelector(sel) {
        if (sel && sel.startsWith('#')) {
          const targetId = sel.slice(1);
          // Only return element if its id actually appears in innerHTML (for modal buttons) or is already cached
          if (this._innerHTML && this._innerHTML.includes(`id="${targetId}"`)) {
            return cache[targetId] ||= makeEl(targetId);
          }
          if (this.id === 'modalBox' && this._innerHTML && !this._innerHTML.includes(`id="${targetId}"`)) {
            return null;
          }
          return cache[targetId] ||= makeEl(targetId);
        }
        return makeEl(sel || 'q');
      },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { height: 52, bottom: 96, width: innerWidth }; },
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
    innerWidth,
    innerHeight,
    devicePixelRatio: 1,
    addEventListener() {}
  };
  const clock = { nowMs: initialNowMs };
  let latestRaf = null;
  const raf = (cb) => { latestRaf = cb; };
  const runner = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', src);
  runner(win, doc, raf, { now: () => clock.nowMs }, () => 0, () => {});
  assert.ok(win.BG60, 'window.BG60 must be exposed');

  function driveFrame(tsMs) {
    const cb = latestRaf;
    assert.equal(typeof cb, 'function', 'requestAnimationFrame loop callback must be registered');
    latestRaf = null;
    cb(tsMs);
  }

  return { B: win.BG60, win, doc, clock, driveFrame };
}

// =========================================================================
// BUG-06: Unified resource ledger (changeGold / changeMaterials / changeTransferTokens)
//         replaces net-delta polling so same-frame earn + spend never cancel out
// =========================================================================
test('BUG-06: Same-frame earn+spend for gold, materials, and transfer tokens are accurately recorded without net-delta cancellation', () => {
  const { B } = bootBG60();

  assert.equal(typeof B.changeGold, 'function', 'BG60 must export changeGold');
  assert.equal(typeof B.changeMaterials, 'function', 'BG60 must export changeMaterials');
  assert.equal(typeof B.changeTransferTokens, 'function', 'BG60 must export changeTransferTokens');
  assert.equal(typeof B.getResourceLedger, 'function', 'BG60 must export getResourceLedger');

  // Setup clean preset with 100 gold, 0 materials, 0 tokens
  B.loadTestPreset({ wave: 5, tier: 'standard', build: 'fire', gold: 100, materials: 0, transferTokens: 0, seed: 8601 });
  const rm = B.game.runMetrics;
  const baseGoldEarned = rm.goldEarned;
  const baseGoldSpent = rm.goldSpent;
  const baseMatEarned = rm.materialsEarned;
  const baseMatSpent = rm.materialsSpent;
  const baseTokEarned = rm.transferTokensEarned;
  const baseTokSpent = rm.transferTokensSpent;

  // 1) Same frame: start 100g, spend 80g + earn 50g -> spent=80, earned=+50, balance=70
  B.changeGold(-80, 'test_buy_gear');
  B.changeGold(50, 'test_sell_old_gear');
  B.syncRunResourceAccounting(); // Must NOT cancel or overwrite ledger totals!
  assert.equal(B.game.gold, 70);
  assert.equal(rm.goldSpent - baseGoldSpent, 80, 'Gold spent must be strictly 80 (not cancelled to 30)');
  assert.equal(rm.goldEarned - baseGoldEarned, 50, 'Gold earned must be strictly 50 (not cancelled to 0)');

  // 2) Same frame: gain +5 materials, spend -3 materials -> earned=+5, spent=+3, balance=2
  B.changeMaterials(5, 'test_dismantle_gear');
  B.changeMaterials(-3, 'test_enhance_gear');
  B.syncRunResourceAccounting();
  assert.equal(B.game.materials, 2);
  assert.equal(rm.materialsEarned - baseMatEarned, 5, 'Materials earned must be strictly 5');
  assert.equal(rm.materialsSpent - baseMatSpent, 3, 'Materials spent must be strictly 3');

  // 3) Same frame: gain +2 transfer tokens, spend -1 transfer token -> earned=+2, spent=+1, balance=1
  B.changeTransferTokens(2, 'test_destiny_token');
  B.changeTransferTokens(-1, 'test_affix_transfer');
  B.syncRunResourceAccounting();
  assert.equal(B.game.transferTokens, 1);
  assert.equal(rm.transferTokensEarned - baseTokEarned, 2, 'Transfer tokens earned must be strictly 2');
  assert.equal(rm.transferTokensSpent - baseTokSpent, 1, 'Transfer tokens spent must be strictly 1');

  // 4) Real game actions in the SAME frame: buy shop gear + sell bag gear + dismantle + enhance!
  B.loadTestPreset({ wave: 12, tier: 'standard', build: 'fire', gold: 300, materials: 10, transferTokens: 2, seed: 8602 });
  const rm2 = B.game.runMetrics;
  const gEarn0 = rm2.goldEarned, gSpent0 = rm2.goldSpent;
  const mEarn0 = rm2.materialsEarned, mSpent0 = rm2.materialsSpent;

  const gearShopIdx = B.game.shop.findIndex(it => it && !it.bought && it.itemType === 'gear');
  assert.ok(gearShopIdx >= 0, 'Shop must contain at least one gear item');
  const gearCost = B.game.shop[gearShopIdx].cost;
  const extraBagGear1 = B.createGearInstance('flame_fan', { wave: 12, rarity: 'rare' });
  const extraBagGear2 = B.createGearInstance('frost_mirror', { wave: 12, rarity: 'rare' });
  B.game.bag.push(extraBagGear1, extraBagGear2);
  const expectedSellGold = B.getGearSellGold(extraBagGear1);
  const expectedDisMats = B.getGearDismantleMaterials(extraBagGear2);
  const expectedEnhCost = B.getGearEnhanceCost(B.game.hero.gear[0]);

  assert.equal(B.buyShopItem(gearShopIdx), true);
  assert.equal(B.sellBagGear(B.game.bag.indexOf(extraBagGear1)), true);
  assert.equal(B.dismantleBagGear(B.game.bag.indexOf(extraBagGear2)), true);
  assert.equal(B.enhanceGear({ location: 'equipped', idx: 0 }).ok, true);
  B.syncRunResourceAccounting();

  assert.equal(rm2.goldSpent - gSpent0, gearCost, 'Real buyShopItem spend must be recorded verbatim');
  assert.equal(rm2.goldEarned - gEarn0, expectedSellGold, 'Real sellBagGear earn must be recorded verbatim in same frame');
  assert.equal(rm2.materialsEarned - mEarn0, expectedDisMats, 'Real dismantleBagGear materials must be recorded verbatim');
  assert.equal(rm2.materialsSpent - mSpent0, expectedEnhCost, 'Real enhanceGear cost must be recorded verbatim in same frame');

  // 5) Ledger structure & 500-entry memory cap
  const ledgerBeforeCap = B.getResourceLedger();
  assert.ok(ledgerBeforeCap.length >= 4);
  const lastEntry = ledgerBeforeCap[ledgerBeforeCap.length - 1];
  assert.ok(typeof lastEntry.seq === 'number' && lastEntry.wave === 12 && typeof lastEntry.reason === 'string' && typeof lastEntry.balanceAfter === 'number');
  for (let i = 0; i < 520; i++) B.changeGold(1, 'cap_test');
  const ledgerAfterCap = B.getResourceLedger();
  assert.ok(ledgerAfterCap.length <= 500, `Ledger must cap at 500 entries, got ${ledgerAfterCap.length}`);
  assert.ok(ledgerAfterCap[ledgerAfterCap.length - 1].seq > ledgerAfterCap[0].seq);
});

// =========================================================================
// BUG-08: Real shop button wiring — normal prep direct buy vs W29 final prep
//         confirmation modal (#shopConfirmBuyBtn / #shopConfirmCancelBtn)
// =========================================================================
test('BUG-08: Normal prep shop buttons buy directly; W29 final prep shop buttons open confirm modal without pausing countdown', () => {
  const { B, doc, clock, driveFrame } = bootBG60({ initialNowMs: 1000 });
  let nowMs = 1000;
  clock.nowMs = nowMs;
  B.setMonotonicClockForTest(() => nowMs);

  // 1) Normal W1 prep: clicking real shop card buys immediately without shop_confirm modal
  B.loadTestPreset({ wave: 1, tier: 'standard', build: 'fire', gold: 500, seed: 8801 });
  const shopSec = doc.getElementById('shopSec');
  assert.equal(shopSec.children.length, 4, 'Shop must render 4 card buttons');
  const buyIdx1 = B.game.shop.findIndex((it, idx) => it && !it.bought && (it.itemType === 'gear' || it.itemType === 'pill') && !shopSec.children[idx].disabled);
  assert.ok(buyIdx1 >= 0, 'Must have an affordable gear or pill item in W1 shop');
  const cost1 = B.game.shop[buyIdx1].cost;
  const goldBefore1 = B.game.gold;
  shopSec.children[buyIdx1].click();
  assert.equal(B.game.activeModal, null, 'Normal prep shop click must NOT open shop_confirm modal');
  assert.equal(B.game.shopConfirmDraft, null);
  assert.equal(B.game.gold, goldBefore1 - cost1, 'Normal prep shop click must buy directly');

  // 2) W29 final prep: clicking real shop card opens confirmation modal with #shopConfirmBuyBtn & #shopConfirmCancelBtn
  B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 800, seed: 8802 });
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  B.syncW29FinalPrepStart();
  assert.equal(B.game.finalPrep.active, true);
  assert.equal(B.game.finalPrep.started, true);

  const w29IdxA = B.game.shop.findIndex((it, idx) => it && !it.bought && (it.itemType === 'gear' || it.itemType === 'pill') && !shopSec.children[idx].disabled);
  assert.ok(w29IdxA >= 0, 'Must have an affordable gear or pill shop item in W29');
  const goldBeforeA = B.game.gold;
  const costA = B.game.shop[w29IdxA].cost;

  // Click real shop button -> opens confirm modal, ZERO gold deducted yet!
  shopSec.children[w29IdxA].click();
  assert.equal(B.game.activeModal?.type, 'shop_confirm', 'W29 shop click must open shop_confirm modal');
  assert.ok(B.game.shopConfirmDraft, 'W29 shop click must create shopConfirmDraft');
  assert.equal(B.game.gold, goldBeforeA, 'Opening confirm modal must NOT deduct gold');
  const modalBox = doc.getElementById('modalBox');
  const buyBtn = modalBox.querySelector('#shopConfirmBuyBtn');
  const cancelBtn = modalBox.querySelector('#shopConfirmCancelBtn');
  assert.ok(buyBtn, 'Confirm modal must render #shopConfirmBuyBtn');
  assert.ok(cancelBtn, 'Confirm modal must render #shopConfirmCancelBtn');

  // Countdown must continue running while shop_confirm modal is open!
  const timerBefore = B.game.finalPrep.timer;
  nowMs += 5000;
  clock.nowMs = nowMs;
  driveFrame(nowMs);
  assert.ok(B.game.finalPrep.timer < timerBefore - 4.5, 'W29 countdown must NOT pause while shop confirm modal is open');

  // Click #shopConfirmCancelBtn -> zero deduction, modal closed
  cancelBtn.click();
  assert.equal(B.game.shopConfirmDraft, null);
  assert.equal(B.game.activeModal, null);
  assert.equal(B.game.gold, goldBeforeA, 'Canceling confirm modal must deduct 0 gold');
  assert.equal(B.game.shop[w29IdxA].bought, false);

  // Re-open confirm modal & click #shopConfirmBuyBtn -> purchase executes!
  shopSec.children[w29IdxA].click();
  assert.equal(B.game.activeModal?.type, 'shop_confirm');
  modalBox.querySelector('#shopConfirmBuyBtn').click();
  assert.equal(B.game.shopConfirmDraft, null);
  assert.equal(B.game.activeModal, null);
  assert.equal(B.game.gold, goldBeforeA - costA, 'Confirming purchase must deduct exact item cost');
  assert.equal(B.game.shop[w29IdxA].bought, true);

  // Open confirm modal on another item and let W29 timer expire -> draft cleared, 0 gold deducted, W30 starts!
  const w29IdxB = B.game.shop.findIndex((it, idx) => it && !it.bought && !shopSec.children[idx].disabled);
  assert.ok(w29IdxB >= 0, 'Must have a second affordable shop item in W29');
  const goldBeforeTimeout = B.game.gold;
  shopSec.children[w29IdxB].click();
  assert.equal(B.game.activeModal?.type, 'shop_confirm');
  assert.ok(B.game.shopConfirmDraft);

  nowMs += 90000;
  clock.nowMs = nowMs;
  driveFrame(nowMs);
  assert.equal(B.game.wave, 30);
  assert.equal(B.game.phase, 'wave');
  assert.equal(B.game.shopConfirmDraft, null, 'W29 timeout must clear uncommitted shopConfirmDraft');
  assert.equal(B.game.gold, goldBeforeTimeout, 'W29 timeout with open shop confirm must deduct 0 gold');
});

// =========================================================================
// BUG-09 (Part 1): Actual hero HP loss (no overkill inflation in telemetry/combatLog/runMetrics)
// =========================================================================
test('BUG-09.1: Fatal 100 damage on 10 HP hero records strictly 10 actual HP loss across telemetry, combatLog, and runMetrics', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 10, tier: 'standard', build: 'fire', seed: 8901 });
  assert.equal(B.startWave(), true);
  B.stepFrame(0.05);

  const h = B.game.hero;
  h.gear = [];
  h.perks = {};
  h.destinyEnhancements = {};
  h.invuln = 0;
  h.shield = 0;
  h.armorBreakT = 0;
  h.hp = 10;
  // Disable deflect aux if active so mitigation doesn't alter 100 -> 65
  if (B.game.metaRunState) B.game.metaRunState.deflectReady = false;

  B.damageHero(100, {
    attackerName: '暗影死灵王',
    attackerKind: 'boss2',
    skillName: '死亡斩击',
    isBoss: true,
    isBossCore: true
  });

  assert.equal(B.game.phase, 'lost');
  assert.equal(h.hp, 0);
  const lastTel = B.game.telemetry[B.game.telemetry.length - 1];
  assert.equal(lastTel.dmgTaken, 10, `Telemetry dmgTaken must be actual HP lost (10), got ${lastTel.dmgTaken}`);
  assert.equal(B.game.combatLog.totalHpLost, 10, `combatLog.totalHpLost must be 10, got ${B.game.combatLog.totalHpLost}`);
  assert.equal(B.game.combatLog.hits[0].hpLost, 10, `hitEntry.hpLost must be 10, got ${B.game.combatLog.hits[0].hpLost}`);
  assert.equal(B.game.combatLog.hits[0].rawDamageAfterMitigation, 100, 'rawDamageAfterMitigation should preserve 100 for reference');
  assert.equal(B.game.runMetrics.hpLost, 10, `runMetrics.hpLost must be 10, got ${B.game.runMetrics.hpLost}`);
});

// =========================================================================
// BUG-09 (Part 2): Actual shield gained (0 stat gain when already at full shield)
// =========================================================================
test('BUG-09.2: Frost shield stats strictly record actual shield delta (partial cap & 0 gain at full shield)', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 30, tier: 'strong', build: 'frost', seed: 8902 });
  assert.equal(B.startWave(), true);

  const h = B.game.hero;
  const maxS = B.getHeroMaxFrostShield(90);
  h.shield = 0;
  B.game.stats.frostShieldGained = 0;
  h.combatStateStats.frostShieldGained = 0;

  // Gain 30 from 0 -> actualGain = 30
  const g1 = B.gainFrostShield(30, { duration: 5.0, maxShield: maxS, noFullShieldPulse: true });
  assert.equal(g1, 30);
  assert.equal(B.game.stats.frostShieldGained, 30);
  assert.equal(h.combatStateStats.frostShieldGained, 30);

  // Set to maxS - 10, gain 40 -> actualGain = 10
  h.shield = maxS - 10;
  const g2 = B.gainFrostShield(40, { duration: 5.0, maxShield: maxS, noFullShieldPulse: true });
  assert.equal(g2, 10);
  assert.equal(B.game.stats.frostShieldGained, 40, 'Partial overflow must only add actual 10 shield gained');
  assert.equal(h.combatStateStats.frostShieldGained, 40);

  // Already at full shield (maxS), gain 40 again -> actualGain = 0, stats MUST NOT increase!
  B.game.w30Battle.signatureLockActive = true;
  B.game.w30Battle.signatureStatusHitsDuringLock.frostShieldGained = 0;
  const g3 = B.gainFrostShield(40, { duration: 5.0, maxShield: maxS, noFullShieldPulse: true });
  assert.equal(g3, 0);
  assert.equal(B.game.stats.frostShieldGained, 40, 'Full shield refresh must add strictly 0 to frostShieldGained');
  assert.equal(h.combatStateStats.frostShieldGained, 40, 'Full shield refresh must add strictly 0 to combatStateStats.frostShieldGained');
  assert.equal(B.game.w30Battle.signatureStatusHitsDuringLock.frostShieldGained, 0, 'Full shield during W30 lock must add strictly 0');
});

// =========================================================================
// BUG-09 (Part 3): Recent 5s threat summary anchored to current/settled clock
// =========================================================================
test('BUG-09.3: getRecentThreatSummary(5) anchors strictly to current/settlement clock, not last hit timestamp', () => {
  const { B, doc } = bootBG60();
  B.loadTestPreset({ wave: 10, tier: 'strong', build: 'fire', seed: 8903 });
  assert.equal(B.startWave(), true);
  // Keep wave alive with a harmless distant dummy enemy BEFORE advancing frames
  B.game.enemies = [];
  B.game.waveQueue = [];
  B.game.seal = null;
  B.game.subSeals = [];
  B.game.hero.skills = {};
  const dummy = B.spawnEnemy('slime', 'north', 999999, { x: 1, y: 1 });
  dummy.spd = 0;
  B.game.hero.x = 25;
  B.game.hero.y = 18;

  B.stepFrame(1.0);
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(20, { attackerName: '烈焰法师', attackerKind: 'mage', skillName: '火球术' });

  const immediate = B.getRecentThreatSummary(5.0);
  assert.equal(immediate.hitCount, 1);
  assert.equal(immediate.hits.length, 1);
  assert.ok(immediate.totalDmg > 0);

  // Advance 15 seconds with ZERO new hits
  for (let i = 0; i < 150; i++) B.stepFrame(0.1);
  assert.ok(B.getCombatLogNowSec() >= 15.9, `Combat clock must advance to >= 16s, got ${B.getCombatLogNowSec()}`);

  const after15s = B.getRecentThreatSummary(5.0);
  assert.equal(after15s.hitCount, 0, 'Hit from 15s ago must NOT appear in recent 5s window');
  assert.deepEqual(after15s.hits, [], 'hits must be empty when no hits occurred in last 5s');
  assert.equal(after15s.totalDmg, 0, 'totalDmg must be 0 when no hits occurred in last 5s');
  assert.equal(after15s.totalHpLost, 0);

  // Finish game at t+15s -> settlement freezes timestamp and shows no recent 5s threats
  B.finishGame(true);
  const settledSummary = B.getRecentThreatSummary(5.0);
  assert.equal(settledSummary.hitCount, 0);
  assert.equal(settledSummary.totalDmg, 0);
  assert.ok(doc.getElementById('modalBox').innerHTML.includes('近 5 秒无受击记录'), 'Settlement modal must report no hits in last 5s');
});

// =========================================================================
// BUG-09 (Part 4): Continuous burn DoT damage recorded in dmgTotal & skillDmg.burn
// =========================================================================
test('BUG-09.4: Burn DoT damage is accurately accounted in stats.dmgTotal and stats.skillDmg.burn (and 0 during W30 HP lock)', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 10, tier: 'standard', build: 'fire', seed: 8904 });
  assert.equal(B.startWave(), true);
  assert.equal(B.game.stats.skillDmg.burn, 0, 'skillDmg.burn must be initialized to 0');

  // Clear battlefield & disable seal/skills so ONLY burn DoT damages the enemy
  B.game.enemies = [];
  B.game.waveQueue = [];
  B.game.projectiles = [];
  B.game.zones = [];
  B.game.seal = null;
  B.game.subSeals = [];
  B.game.hero.skills = {};
  B.game.hero.x = 2;
  B.game.hero.y = 2;

  const target = B.spawnEnemy('brute', 'east', 1000, { x: 25, y: 15 });
  target.spd = 0;
  target.burnDps = 40;
  target.burnT = 2.0;

  const dmgBefore = B.game.stats.dmgTotal;
  // Step 60 frames at 1/60s (1.0s total) to verify fractional per-frame ticks do NOT round away to 0!
  for (let i = 0; i < 60; i++) B.stepFrame(1 / 60);

  const burnRecorded = B.game.stats.skillDmg.burn;
  const totalDelta = B.game.stats.dmgTotal - dmgBefore;
  assert.ok(Math.abs(burnRecorded - 40) < 0.5, `Expected ~40 burn DoT recorded in skillDmg.burn, got ${burnRecorded}`);
  assert.ok(Math.abs(totalDelta - burnRecorded) < 0.5, `Expected dmgTotal delta (${totalDelta}) to match skillDmg.burn (${burnRecorded})`);

  // Verify W30 Boss6 signature HP lock: burn timer ticks, 0 HP lost, 0 burn damage accounted!
  B.loadTestPreset({ wave: 30, tier: 'strong', build: 'fire', seed: 8905 });
  assert.equal(B.startWave(), true);
  B.game.seal = null;
  B.game.subSeals = [];
  B.game.hero.skills = {};
  let boss = B.game.enemies.find(e => e.kind === 'boss6');
  for (let i = 0; i < 40 && !boss; i++) {
    B.stepFrame(0.1);
    boss = B.game.enemies.find(e => e.kind === 'boss6');
  }
  assert.ok(boss, 'boss6 must spawn in W30');
  boss.signatureTriggered = true;
  boss.signatureLockActive = true;
  boss.signatureThresholdHp = Math.round(boss.maxHp * 0.8);
  boss.hp = boss.signatureThresholdHp;
  boss.burnDps = 500;
  boss.burnT = 3.0;
  B.game.enemies = [boss];
  B.game.waveQueue = [];

  const burnBeforeLock = B.game.stats.skillDmg.burn;
  const totalBeforeLock = B.game.stats.dmgTotal;
  for (let i = 0; i < 10; i++) B.stepFrame(0.1);
  assert.equal(boss.hp, boss.signatureThresholdHp, 'Boss6 HP must remain locked during signature');
  assert.equal(B.game.stats.skillDmg.burn, burnBeforeLock, 'Burn DoT during W30 signature lock must record 0');
  assert.equal(B.game.stats.dmgTotal, totalBeforeLock, 'dmgTotal during W30 signature lock must record 0 from burn');
});
