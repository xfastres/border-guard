'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');

function createMockLocalStorage({ failWrites = false, writeErrorMsg = 'QuotaExceededError: storage full' } = {}) {
  const map = new Map();
  return {
    _map: map,
    failWrites,
    writeErrorMsg,
    setCalls: 0,
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      this.setCalls++;
      if (this.failWrites) throw new Error(this.writeErrorMsg);
      map.set(String(k), String(v));
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

function bootBG60({ storage = null, initialNowMs = 0, innerWidth = 1440, innerHeight = 900 } = {}) {
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
        for (const fn of (listeners.click || [])) fn({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node });
      },
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
    addEventListener() {},
    ...(storage ? { localStorage: storage } : {})
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
// BUG-01: W29 real-time countdown decoupled from clamped sim dt & pause
// =========================================================================
test('BUG-01: W29 90s countdown follows real monotonic clock at 5 FPS, 10 FPS, background tab jump, and cannot be frozen by pause', () => {
  // Case 1A: 5 FPS (200ms per frame) via monotonic clock + loop(ts)
  {
    const { B, clock, driveFrame } = bootBG60({ initialNowMs: 1000 });
    let nowMs = 1000;
    clock.nowMs = nowMs;
    if (typeof B.setMonotonicClockForTest === 'function') B.setMonotonicClockForTest(() => nowMs);

    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', seed: 9001 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();

    assert.equal(B.game.finalPrep.active, true);
    assert.equal(B.game.finalPrep.started, true);
    assert.equal(B.game.finalPrep.timer, 90);

    // Advance 449 frames at 5 FPS (200ms each = 89.8s real time)
    for (let i = 0; i < 449; i++) {
      nowMs += 200;
      clock.nowMs = nowMs;
      driveFrame(nowMs);
    }
    assert.equal(B.game.phase, 'prep', 'At 89.8s real time, should still be in W29 final prep');
    assert.ok(Math.abs(B.game.finalPrep.timer - 0.2) < 0.05, `Expected ~0.2s left after 89.8s at 5 FPS, got ${B.game.finalPrep.timer}`);

    // 450th frame reaches exactly 90.0s real time -> must expire & enter W30!
    nowMs += 200;
    clock.nowMs = nowMs;
    driveFrame(nowMs);
    assert.equal(B.game.finalPrep.active, false, 'At 90.0s real time (5 FPS), W29 final prep must expire');
    assert.equal(B.game.wave, 30);
    assert.equal(B.game.phase, 'wave', 'W30 battle must start at exact 90s real time');
    assert.equal(typeof B.setMonotonicClockForTest, 'function', 'BG60 must expose setMonotonicClockForTest');
  }

  // Case 1B: 10 FPS (100ms per frame) + 2x battle speed -> still exact 90s real time
  {
    const { B, clock, driveFrame } = bootBG60({ initialNowMs: 5000 });
    let nowMs = 5000;
    clock.nowMs = nowMs;
    B.setMonotonicClockForTest(() => nowMs);

    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'frost', seed: 9002 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();
    B.game.speed = 2;

    for (let i = 0; i < 900; i++) {
      nowMs += 100;
      clock.nowMs = nowMs;
      driveFrame(nowMs);
    }
    assert.equal(B.game.finalPrep.active, false, 'At 90s real time (10 FPS + 2x speed), W29 final prep must expire');
    assert.equal(B.game.phase, 'wave');
    assert.equal(B.game.wave, 30);
  }

  // Case 1C: Background tab suspension (single 45s jump + 45s jump)
  {
    const { B, clock, driveFrame } = bootBG60({ initialNowMs: 2000 });
    let nowMs = 2000;
    clock.nowMs = nowMs;
    B.setMonotonicClockForTest(() => nowMs);

    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', seed: 9003 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();

    nowMs += 45000;
    clock.nowMs = nowMs;
    driveFrame(nowMs);
    assert.ok(Math.abs(B.game.finalPrep.timer - 45) < 0.05, `After 45s background jump, expected ~45s left, got ${B.game.finalPrep.timer}`);

    nowMs += 45000;
    clock.nowMs = nowMs;
    driveFrame(nowMs);
    assert.equal(B.game.phase, 'wave', 'Second 45s background jump must expire W29 and start W30');
    assert.equal(B.game.finalPrep.active, false);
  }

  // Case 1D: Clicking pause button / forcing paused=true MUST NOT freeze W29 countdown
  {
    const { B, doc, clock, driveFrame } = bootBG60({ initialNowMs: 3000 });
    let nowMs = 3000;
    clock.nowMs = nowMs;
    B.setMonotonicClockForTest(() => nowMs);

    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', seed: 9004 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();

    // Clicking pauseBtn during W29 final prep must NOT pause countdown
    doc.getElementById('pauseBtn').click();
    // Even if paused is explicitly forced true via internal state / API, W29 countdown still ticks to 0!
    if (typeof B.setPaused === 'function') B.setPaused(true);

    nowMs += 30000;
    clock.nowMs = nowMs;
    driveFrame(nowMs);
    assert.ok(Math.abs(B.game.finalPrep.timer - 60) < 0.05, `Paused state must NOT freeze W29 countdown (expected ~60s, got ${B.game.finalPrep.timer})`);

    nowMs += 60000;
    clock.nowMs = nowMs;
    driveFrame(nowMs);
    assert.equal(B.game.phase, 'wave', 'W29 countdown must expire and start W30 even while paused=true');
    assert.equal(B.game.wave, 30);
  }
});

// =========================================================================
// BUG-02: Repeated equip/unequip of +HP gear must NOT heal hero for free
// =========================================================================
test('BUG-02: Repeatedly equipping/unequipping +HP gear gives strictly 0 free healing, while level-up heals still work', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 8, tier: 'standard', build: 'frost', seed: 9010 });
  B.game.bag = [];
  while (B.game.hero.gear.length > 0) {
    assert.equal(B.unequipGear(0), true);
  }
  B.game.bag = [];

  // Create a +HP gear instance (e.g. jade_pendant / flatHp gear)
  const hpGearKey = Object.keys(B.GEARS).find(k => (B.GEARS[k].mod?.flatHp || 0) > 0 || (B.GEARS[k].mod?.hpPct || 0) > 0);
  assert.ok(hpGearKey, 'Must have at least one +HP gear in GEARS');
  const hpGear = B.createGearInstance(hpGearKey, { sourceStage: 2, slotsCount: 1, affixes: ['frost_ward'] });
  B.game.bag.push(hpGear);

  // Reduce hero to low HP (e.g. 50 HP)
  B.game.hero.hp = 50;
  const baseMaxBefore = B.game.hero.maxHp;

  // Repeatedly equip -> unequip 10 times!
  for (let i = 0; i < 10; i++) {
    assert.equal(B.equipGearFromBag(0), true);
    assert.ok(B.game.hero.maxHp > baseMaxBefore, 'Equipping +HP gear must still raise maxHp');
    assert.equal(B.game.hero.hp, 50, `Equip #${i + 1} must NOT increase current hp (exploit healed to ${B.game.hero.hp})`);

    assert.equal(B.unequipGear(0), true);
    assert.equal(B.game.hero.maxHp, baseMaxBefore, 'Unequipping must restore base maxHp');
    assert.equal(B.game.hero.hp, 50, `Unequip #${i + 1} must keep hp at 50`);
  }

  // Also verify enhancing equipped +HP gear does not grant free current HP
  assert.equal(B.equipGearFromBag(0), true);
  B.game.materials = 50;
  B.game.hero.hp = 50;
  const enhRes = B.enhanceGear({ location: 'equipped', idx: 0 });
  assert.equal(enhRes.ok, true);
  assert.equal(B.game.hero.hp, 50, 'Enhancing equipped +HP gear must NOT heal current hp');

  // Verify legitimate level-up STILL heals hero explicitly
  const hpBeforeLevel = B.game.hero.hp;
  const needXp = B.game.hero.xpNext - B.game.hero.xp;
  B.gainHeroXp(needXp);
  assert.ok(B.game.hero.hp > hpBeforeLevel, 'Legitimate level-up must still heal hero');

  // Verify clamping still works when unequipping +HP gear while at full HP
  B.game.hero.hp = B.game.hero.maxHp;
  const highMax = B.game.hero.maxHp;
  assert.equal(B.unequipGear(0), true);
  assert.ok(B.game.hero.maxHp < highMax);
  assert.equal(B.game.hero.hp, B.game.hero.maxHp, 'Unequipping at full HP must clamp hp to new maxHp');
});

// =========================================================================
// BUG-03: Unified bag capacity invariant across shop, unequip, and chest
// =========================================================================
test('BUG-03: Bag capacity invariant (bag.length <= getBagCapacity()) enforced in buyShopItem, confirmShopPurchase, unequipGear & pickGearReward', () => {
  const { B } = bootBG60();
  B.loadTestPreset({ wave: 12, tier: 'standard', build: 'fire', gold: 9999, seed: 9020 });
  const cap = B.getBagCapacity();

  // Ensure hero has at least 1 equipped gear and fill bag to 100% capacity
  assert.ok(B.game.hero.gear.length >= 1);
  B.game.bag = [];
  for (let i = 0; i < cap; i++) {
    B.game.bag.push(B.createGearInstance('bronze_tassel', { sourceStage: 1, slotsCount: 1, affixes: ['fury_crit'] }));
  }
  assert.equal(B.game.bag.length, cap);

  // 3A: buyShopItem on a gear offer with full bag MUST reject with { ok: false, reason: 'bag_full' } and ZERO gold deducted
  const gearIdx = B.game.shop.findIndex(s => s && !s.bought && s.itemType === 'gear');
  assert.ok(gearIdx >= 0, 'Shop must contain a gear offer');
  const goldBefore = B.game.gold;
  const buyRes = B.buyShopItem(gearIdx);
  assert.deepEqual(buyRes, { ok: false, reason: 'bag_full' }, 'buyShopItem must reject gear purchase when bag is full');
  assert.equal(B.game.gold, goldBefore, 'Failed buyShopItem must deduct 0 gold');
  assert.equal(B.game.shop[gearIdx].bought, false, 'Shop gear offer must remain unbought');
  assert.equal(B.game.bag.length, cap, 'Bag length must NEVER exceed getBagCapacity()');

  // 3B: confirmShopPurchase on a gear offer with full bag MUST reject with reason='bag_full' and ZERO gold deducted
  const openRes = B.openShopPurchaseConfirm(gearIdx);
  assert.equal(openRes.ok, true);
  const confRes = B.confirmShopPurchase();
  assert.equal(confRes.ok, false);
  assert.equal(confRes.reason, 'bag_full');
  assert.equal(B.game.gold, goldBefore, 'Failed confirmShopPurchase must deduct 0 gold');
  assert.equal(B.game.bag.length, cap);

  // 3C: unequipGear with full bag MUST reject with { ok: false, reason: 'bag_full' } and keep gear equipped
  const eqCountBefore = B.game.hero.gear.length;
  const firstEqUid = B.game.hero.gear[0].uid;
  const unqRes = B.unequipGear(0);
  assert.deepEqual(unqRes, { ok: false, reason: 'bag_full' }, 'unequipGear must reject when bag is full');
  assert.equal(B.game.hero.gear.length, eqCountBefore, 'Equipped gear must stay equipped when unequip rejected');
  assert.equal(B.game.hero.gear[0].uid, firstEqUid);
  assert.equal(B.game.bag.length, cap, 'Bag length must remain <= getBagCapacity()');

  // 3D: Normal chest pickGearReward with full bag MUST safely route overflow to rewardStash (bag stays at cap!)
  const stashBefore = B.game.rewardStash.length;
  B.queueModal({ type: 'chest', legend: false, shrineTier: false });
  assert.equal(B.game.activeModal?.type, 'chest');
  assert.ok(Array.isArray(B.game.activeModal.choices) && B.game.activeModal.choices.length > 0);
  const chosenChestGear = B.game.activeModal.choices[0];
  const picked = B.pickGearReward(chosenChestGear);
  assert.ok(picked && picked.uid === chosenChestGear.uid, 'Chest reward claim must succeed safely');
  assert.equal(B.game.bag.length, cap, 'Chest claim with full bag must NOT overflow game.bag');
  assert.equal(B.game.rewardStash.length, stashBefore + 1, 'Overflow chest gear must be routed safely to rewardStash');
  assert.equal(B.game.rewardStash[B.game.rewardStash.length - 1].item.uid, chosenChestGear.uid);
});

// =========================================================================
// BUG-04: W29 timeout auto-claim & early-start random claim MUST NOT swallow
//         newly triggered levelup reward modals!
// =========================================================================
test('BUG-04: W29 timeout auto-claim and early-start random claim preserve newly triggered levelup modal while entering W30', () => {
  // 4A: Timeout auto-claim triggering legend_ascend -> even levelup modal
  {
    const { B } = bootBG60();
    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 800, seed: 9030 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();

    // Ensure hero is on an ODD level so +1 level lands on EVEN level -> guarantees queueModal({ type: 'levelup' })!
    if (B.game.hero.lv % 2 === 0) {
      B.game.hero.lv += 1;
      B.game.hero.xpNext = B.xpForLevel(B.game.hero.lv);
      B.game.hero.xp = 0;
    }
    const lvBefore = B.game.hero.lv;

    // Open Destiny modal & inject an unclaimed offer where all 3 choices are legend_ascend (guaranteed levelup!)
    B.openDestinyGambleModal();
    B.game.destiny.pendingOffer = {
      offerId: 'bug04_timeout_xp_pill',
      bet: 220,
      wave: 30,
      claimed: false,
      choices: [0, 1, 2].map(idx => ({
        choiceIndex: idx,
        category: 'pill',
        subType: 'pill',
        pillKey: 'legend_ascend',
        rarity: 'legend',
        icon: '🌟',
        name: '飞升仙丹',
        desc: '直升 1 级'
      }))
    };

    const res = B.resolveW29FinalPrepTimeout();
    assert.equal(res.ok, true);
    assert.equal(B.game.wave, 30);
    assert.equal(B.game.phase, 'wave', 'W30 must still start cleanly on timeout');
    assert.equal(B.game.hero.lv, lvBefore + 1, 'Auto-claimed legend_ascend must level up hero');
    assert.equal(B.game.activeModal?.type, 'levelup', 'Newly triggered levelup modal MUST be preserved (not swallowed by closeAllPrepModals!)');
    assert.ok(Array.isArray(B.game.activeModal.choices) && B.game.activeModal.choices.length > 0);

    // Player can legally claim the preserved levelup skill!
    const skillKey = B.game.activeModal.choices[0];
    const lvSkillBefore = B.game.hero.skills[skillKey] || 0;
    assert.equal(B.pickHeroSkill(skillKey), true);
    assert.equal(B.game.hero.skills[skillKey], lvSkillBefore + 1);
    assert.equal(B.game.activeModal, null);
  }

  // 4B: Early-start with acceptRandomClaim=true triggering levelup modal
  {
    const { B } = bootBG60();
    B.loadTestPreset({ wave: 29, tier: 'strong', build: 'frost', gold: 800, seed: 9031 });
    B.startWave();
    B.completeWaveClear();
    while (B.game.activeModal) B.closeModal();
    B.syncW29FinalPrepStart();

    if (B.game.hero.lv % 2 === 0) {
      B.game.hero.lv += 1;
      B.game.hero.xpNext = B.xpForLevel(B.game.hero.lv);
      B.game.hero.xp = 0;
    }
    const lvBefore = B.game.hero.lv;

    B.game.destiny.pendingOffer = {
      offerId: 'bug04_early_xp_pill',
      bet: 220,
      wave: 30,
      claimed: false,
      choices: [0, 1, 2].map(idx => ({
        choiceIndex: idx,
        category: 'pill',
        subType: 'pill',
        pillKey: 'legend_ascend',
        rarity: 'legend',
        icon: '🌟',
        name: '飞升仙丹',
        desc: '直升 1 级'
      }))
    };

    // First click opens w30_early_confirm modal
    const promptRes = B.startW30Early({ acceptRandomClaim: false });
    assert.equal(promptRes.ok, false);
    assert.equal(B.game.activeModal?.type, 'w30_early_confirm');

    // Confirming random claim must close w30_early_confirm, enter W30, AND preserve the newly triggered levelup modal!
    const earlyRes = B.startW30Early({ acceptRandomClaim: true });
    assert.equal(earlyRes.ok, true);
    assert.equal(B.game.wave, 30);
    assert.equal(B.game.phase, 'wave');
    assert.equal(B.game.hero.lv, lvBefore + 1);
    assert.equal(B.game.activeModal?.type, 'levelup', 'Early-start random claim MUST preserve newly triggered levelup modal');
    assert.ok(Array.isArray(B.game.activeModal.choices) && B.game.activeModal.choices.length > 0);
  }
});

// =========================================================================
// BUG-05: Save write failure reporting/retry, no silent overwrite on load error,
//         and strict schemaVersion validation/migration
// =========================================================================
test('BUG-05: Meta save write failure alerts & retries honestly, corrupted/future saves are NEVER silently overwritten, and schemaVersion is validated', () => {
  // 5A: Corrupted JSON in localStorage MUST NOT be silently overwritten
  {
    const storage = createMockLocalStorage();
    const key = 'border_guard_v060_meta_v1';
    const corruptedRaw = '{corrupted_json_from_crash:::';
    storage.setItem(key, corruptedRaw);

    const { B } = bootBG60({ storage });
    assert.equal(typeof B.getMetaStorageStatus, 'function', 'BG60 must expose getMetaStorageStatus');
    const st = B.getMetaStorageStatus();
    assert.equal(st.state, 'load_error');
    assert.ok(st.loadError, 'loadError must be populated for corrupted JSON');
    assert.equal(st.rawCorruptedBackup, corruptedRaw, 'Original corrupted raw string must be kept as backup');
    assert.equal(storage.getItem(key), corruptedRaw, 'Corrupted localStorage value MUST NOT be silently overwritten on boot');
    // Even if saveMetaSave() is accidentally invoked without explicit reset/import, it must not clobber the original corrupted key
    assert.equal(B.saveMetaSave(), false, 'Implicit saveMetaSave must refuse to silently clobber corrupted storage');
    assert.equal(storage.getItem(key), corruptedRaw, 'Corrupted storage must remain intact for user recovery/export');
  }

  // 5B: Incompatible future schemaVersion (e.g. schemaVersion: 99) and missing/non-positive schemaVersion
  {
    const storage = createMockLocalStorage();
    const key = 'border_guard_v060_meta_v1';
    const futureRaw = JSON.stringify({ schemaVersion: 99, legacyShards: 777, futureField: true });
    storage.setItem(key, futureRaw);

    const { B } = bootBG60({ storage });
    assert.equal(typeof B.migrateMetaSave, 'function', 'BG60 must expose migrateMetaSave');

    const st = B.getMetaStorageStatus();
    assert.equal(st.state, 'load_error');
    assert.equal(st.loadError, 'incompatible_schema_version');
    assert.equal(storage.getItem(key), futureRaw, 'Future-version save MUST NOT be silently overwritten');

    // Direct migrateMetaSave checks
    const migFuture = B.migrateMetaSave({ schemaVersion: 99, legacyShards: 100 });
    assert.equal(migFuture.ok, false);
    assert.equal(migFuture.reason, 'incompatible_schema_version');

    const migMissing = B.migrateMetaSave({ legacyShards: 100 });
    assert.equal(migMissing.ok, false);
    assert.equal(migMissing.reason, 'incompatible_schema_version');

    const migNeg = B.migrateMetaSave({ schemaVersion: -1, legacyShards: 100 });
    assert.equal(migNeg.ok, false);
    assert.equal(migNeg.reason, 'incompatible_schema_version');

    const migStr = B.migrateMetaSave({ schemaVersion: '1', legacyShards: 100 });
    assert.equal(migStr.ok, false);
    assert.equal(migStr.reason, 'incompatible_schema_version');

    // Valid schemaVersion === 1 passes
    const migV1 = B.migrateMetaSave({ schemaVersion: 1, legacyShards: 250 });
    assert.equal(migV1.ok, true);
    assert.equal(migV1.save.legacyShards, 250);

    // importMetaSave rejects incompatible schemaVersion
    const impBad = B.importMetaSave({ schemaVersion: 99, legacyShards: 999 });
    assert.equal(impBad.ok, false);
    assert.equal(impBad.reason, 'incompatible_schema_version');
  }

  // 5C: Save write failure during settleRunMetaRewards MUST report failure, show warning + retry/export buttons, and recover via retryPendingMetaSave()
  {
    const storage = createMockLocalStorage({ failWrites: false });
    const { B, doc } = bootBG60({ storage });
    B.loadTestPreset({ wave: 30, tier: 'standard', build: 'fire', seed: 9040 });
    B.game.stats.bossKills = 6;

    // Simulate localStorage write failure (e.g. QuotaExceededError / Private Mode)
    storage.failWrites = true;
    B.finishGame(true);

    const settle = B.game.metaSettlement;
    assert.ok(settle, 'Settlement record must exist');
    assert.equal(settle.saveStatus, 'failed', 'Settlement record must mark saveStatus=failed when write fails');
    assert.equal(settle.persisted, false, 'Settlement record must mark persisted=false when write fails');

    const endHtml = doc.getElementById('modalBox').innerHTML;
    assert.ok(endHtml.includes('写入失败') || endHtml.includes('尚未持久化'), 'End modal must warn user that local save write failed');
    assert.equal(endHtml.includes('单局首结已入账'), false, 'End modal MUST NOT falsely claim rewards were persisted');
    assert.ok(endHtml.includes('endRetrySaveBtn'), 'End modal must provide Retry Save button');
    assert.ok(endHtml.includes('endExportBackupBtn'), 'End modal must provide Export Backup JSON button');

    // importMetaSave also reports storage_write_failed when storage fails
    const impFail = B.importMetaSave({ schemaVersion: 1, legacyShards: 123 });
    assert.equal(impFail.ok, false);
    assert.equal(impFail.reason, 'storage_write_failed');

    // Recover storage and click/call retryPendingMetaSave()
    storage.failWrites = false;
    assert.equal(typeof B.retryPendingMetaSave, 'function', 'BG60 must expose retryPendingMetaSave');
    const retryRes = B.retryPendingMetaSave();
    assert.equal(retryRes.ok, true, 'retryPendingMetaSave must succeed once storage recovers');
    assert.equal(B.game.metaSettlement.saveStatus, 'saved');
    assert.equal(B.game.metaSettlement.persisted, true);

    const persistedRaw = storage.getItem('border_guard_v060_meta_v1');
    assert.ok(persistedRaw, 'Retried save must now be written to storage');
    const parsed = JSON.parse(persistedRaw);
    assert.ok(parsed.settledRunIds.includes(B.game.runId), 'Persisted save must contain settled runId');
    assert.ok(parsed.legacyShards >= settle.totalShardsGranted, 'Persisted save must hold earned legacyShards');
  }
});

// =========================================================================
// BUG-10: Business-layer validation & atomic claim lock for pickHeroSkill
//         and pickGearReward
// =========================================================================
test('BUG-10: pickHeroSkill and pickGearReward validate active modal, offered choices, Lv.5 cap, and atomic single-claim lock', () => {
  const { B } = bootBG60();
  B.startNewRun(9050, false);

  // 10A: Calling pickHeroSkill with NO active modal MUST fail with 0 state mutation
  assert.equal(B.game.activeModal, null);
  const beforeSkills = { ...B.game.hero.skills };
  assert.equal(B.pickHeroSkill('firewave'), false, 'pickHeroSkill must reject when no modal is open');
  assert.deepEqual(B.game.hero.skills, beforeSkills);

  // 10B: Calling pickHeroSkill when a NON-skill modal (e.g. chest) is active MUST fail
  B.queueModal({ type: 'chest', legend: false, shrineTier: false });
  assert.equal(B.game.activeModal?.type, 'chest');
  assert.equal(B.pickHeroSkill('firewave'), false, 'pickHeroSkill must reject during chest modal');
  assert.deepEqual(B.game.hero.skills, beforeSkills);
  B.closeModal();

  // 10C: During a real levelup modal, reject non-offered skill key, reject max-level Lv.5, accept offered choice ONCE, reject duplicate claim
  B.queueModal({ type: 'levelup' });
  const lvModal = B.game.activeModal;
  assert.equal(lvModal?.type, 'levelup');
  assert.ok(lvModal.offerId, 'levelup modal must have offerId');
  assert.ok(Array.isArray(lvModal.choices) && lvModal.choices.length > 0, 'levelup modal must store choices');
  assert.equal(lvModal.claimed, false);

  // Find a valid HERO_SKILLS key NOT in lvModal.choices
  const nonOfferedSkill = Object.keys(B.HERO_SKILLS).find(k => !lvModal.choices.includes(k));
  assert.ok(nonOfferedSkill, 'Should find a skill not in current 3 choices');
  assert.equal(B.pickHeroSkill(nonOfferedSkill), false, 'pickHeroSkill must reject skill NOT in modal choices');
  assert.equal(B.game.hero.skills[nonOfferedSkill] || 0, 0);
  assert.equal(B.game.activeModal, lvModal, 'Rejected pick must leave modal open');

  // If offered skill is somehow already Lv.5, reject exceeding Lv.5
  const offered0 = lvModal.choices[0];
  B.game.hero.skills[offered0] = 5;
  assert.equal(B.pickHeroSkill(offered0), false, 'pickHeroSkill must reject upgrading past Lv.5');
  assert.equal(B.game.hero.skills[offered0], 5);

  // Pick a valid offered skill below Lv.5
  const offered1 = lvModal.choices.find(k => (B.game.hero.skills[k] || 0) < 5);
  assert.ok(offered1);
  const prevLv = B.game.hero.skills[offered1] || 0;
  assert.equal(B.pickHeroSkill(offered1), true, 'Valid offered skill pick must succeed');
  assert.equal(B.game.hero.skills[offered1], prevLv + 1);
  assert.equal(lvModal.claimed, true, 'Modal must be atomically marked claimed');

  // Re-attaching the already-claimed modal & trying duplicate claim MUST fail with 0 mutation
  B.game.activeModal = lvModal;
  assert.equal(B.pickHeroSkill(offered1), false, 'Duplicate claim on already-claimed levelup modal must be rejected');
  assert.equal(B.game.hero.skills[offered1], prevLv + 1);
  B.game.activeModal = null;

  // 10D: pickGearReward validation & atomic single-claim lock
  const bagLen0 = B.game.bag.length;
  // Calling with no active chest modal MUST fail
  assert.equal(B.pickGearReward('asura_blood'), false, 'pickGearReward must reject when no chest modal is open');
  assert.equal(B.game.bag.length, bagLen0);

  // Open real chest modal
  B.queueModal({ type: 'chest', legend: false, shrineTier: false });
  const chModal = B.game.activeModal;
  assert.equal(chModal?.type, 'chest');
  assert.ok(chModal.offerId, 'chest modal must have offerId');
  assert.ok(Array.isArray(chModal.choices) && chModal.choices.length > 0, 'chest modal must store real offered gear instances');
  assert.equal(chModal.claimed, false);

  // Forged gear instance NOT in chModal.choices MUST be rejected
  const forgedGear = B.createGearInstance('asura_blood', { sourceStage: 3, slotsCount: 3 });
  assert.equal(B.pickGearReward(forgedGear), false, 'pickGearReward must reject forged gear instance not in choices');
  assert.equal(B.game.bag.length, bagLen0);
  assert.equal(B.game.activeModal, chModal);

  // Forged baseKey NOT in chModal.choices MUST be rejected
  const nonOfferedGearKey = Object.keys(B.GEARS).find(k => !chModal.choices.some(c => c.baseKey === k));
  assert.ok(nonOfferedGearKey);
  assert.equal(B.pickGearReward(nonOfferedGearKey), false, 'pickGearReward must reject gear key not in choices');
  assert.equal(B.game.bag.length, bagLen0);

  // Legitimate claim succeeds once and marks modal claimed
  const realChoice = chModal.choices[0];
  const claimRes = B.pickGearReward(realChoice);
  assert.ok(claimRes && claimRes.uid === realChoice.uid, 'Legitimate chest choice claim must succeed');
  assert.equal(chModal.claimed, true);
  assert.equal(B.game.bag.length, bagLen0 + 1);

  // Duplicate claim on same chest modal MUST fail with 0 extra items
  B.game.activeModal = chModal;
  assert.equal(B.pickGearReward(realChoice), false, 'Duplicate chest claim must be rejected');
  assert.equal(B.game.bag.length, bagLen0 + 1);
  B.game.activeModal = null;
});
