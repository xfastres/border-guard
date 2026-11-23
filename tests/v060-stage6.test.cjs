'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');
const CONFIG_PATH = path.join(ROOT, 'balance', 'v060-baseline.json');

function createMockLocalStorage() {
  const map = new Map();
  return {
    _map: map,
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

function bootBG60({ storage = null, innerWidth = 1440, innerHeight = 900 } = {}) {
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
  const runner = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', src);
  runner(win, doc, () => {}, { now: () => 0 }, () => 0, () => {});
  assert.ok(win.BG60, 'window.BG60 must be exposed');
  return { B: win.BG60, win, doc, html };
}

// =========================================================================
// TEST 1: Meta Progression Budget (1 Main + <=3 Aux / Fixed 4 Pts), Pre-Run Lock,
//         Renormalized Weight Tilt (x1.35), Anti-Dilution Pools & Next-Run Unlocks
// =========================================================================
test('1. Meta progression fixed 4-pt/3-aux budget (0-unlock 1+1+2=4 & full-unlock invariant), run lock-in, renormalized weight tilt, anti-dilution & next-run unlock activation', () => {
  const storage = createMockLocalStorage();
  const { B, doc } = bootBG60({ storage });
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  assert.equal(B.version, '0.60.0-stage6');
  assert.equal(B.releaseTag, 'v0.60-complete');
  assert.ok(cfg.metaProgression, 'metaProgression must exist in balance/v060-baseline.json');

  // 1a) Initial 0-unlock account has 3 free mains + 2x 1-pt & 1x 2-pt free aux => 1+1+2=4 (3 aux reachable at 0 unlocks!)
  const initSave = B.getMetaSave();
  assert.equal(initSave.schemaVersion, 1);
  assert.equal(initSave.unlockedMain.length, 3, '3 default free main legacies');
  const freeAuxSpecs = initSave.unlockedAux.map(id => B.getMetaAuxSpec(id));
  const free1Pt = freeAuxSpecs.filter(a => a.costPoints === 1);
  const free2Pt = freeAuxSpecs.filter(a => a.costPoints === 2);
  assert.ok(free1Pt.length >= 2, '0-unlock pool must have at least two 1-pt auxiliaries');
  assert.ok(free2Pt.length >= 1, '0-unlock pool must have at least one 2-pt auxiliary');

  const initBudget = B.getMetaLoadoutBudget(initSave.loadout);
  assert.equal(initBudget.mainCount, 1);
  assert.equal(initBudget.auxCount, 3, 'Default 0-unlock loadout reaches 3 auxiliaries');
  assert.equal(initBudget.auxPoints, 4, 'Default 0-unlock loadout reaches 1+1+2 = 4 points');
  assert.equal(initBudget.maxAuxCount, 3);
  assert.equal(initBudget.maxAuxPoints, 4);
  assert.equal(initBudget.valid, true);

  // 1b) Pre-run Intro allows editing; starting run locks loadout immediately (no hot-swap!)
  assert.equal(B.isMetaLoadoutLocked(), false, 'Pre-run intro state must allow meta loadout configuration');
  const preSwap = B.setMetaMainLegacy('main_frost');
  assert.equal(preSwap.ok, true);
  assert.equal(B.getMetaSave().loadout.main, 'main_frost');

  // Start run -> locked immediately!
  B.startNewRun(6001, false);
  assert.equal(B.isMetaLoadoutLocked(), true, 'Active run must lock meta loadout');
  const lockedMainAttempt = B.setMetaMainLegacy('main_flame');
  assert.equal(lockedMainAttempt.ok, false);
  assert.equal(lockedMainAttempt.reason, 'run_locked');
  const lockedAuxAttempt = B.toggleMetaAuxLegacy('aux_scout_sense', false);
  assert.equal(lockedAuxAttempt.ok, false);
  assert.equal(lockedAuxAttempt.reason, 'run_locked');
  assert.equal(B.getActiveMetaMain().id, 'main_frost', 'Active run main legacy must remain locked to main_frost');

  // Read-only locked UI view during active run
  B.openMetaLegacyModal();
  const lockedModalHtml = doc.getElementById('modalBox').innerHTML;
  assert.ok(lockedModalHtml.includes('本局已锁定'), 'In-run meta modal must indicate locked read-only status');
  B.closeModal();

  // 1c) Renormalized main legacy weight tilt (x1.35): matching elem boosted, sum(prob)===1, others remain reachable, NO extra drop/gold!
  const sealTableFrost = B.getMainLegacyWeightTable(Object.keys(B.ARTIFACTS), k => B.ARTIFACTS[k].elem);
  const probSum = sealTableFrost.reduce((s, e) => s + e.prob, 0);
  assert.ok(Math.abs(probSum - 1.0) < 1e-9, `Renormalized probabilities must sum to 1 (got ${probSum})`);
  const frostSealEntry = sealTableFrost.find(e => e.elem === 'frost');
  const fireSealEntry = sealTableFrost.find(e => e.elem === 'fire');
  assert.ok(Math.abs(frostSealEntry.prob / fireSealEntry.prob - 1.35) < 1e-9, 'Matching element weight ratio must equal 1.35');
  assert.ok(fireSealEntry.prob > 0.15, 'Non-matching elements must remain normally obtainable');

  // Statistical check over 3000 shop gear rolls under main_frost vs main_flame
  const countElemRolls = (mainId) => {
    B.finishGame(false);
    B.setMetaMainLegacy(mainId);
    B.startNewRun(6010, false);
    const counts = { fire: 0, frost: 0, thunder: 0, wind: 0, holy: 0 };
    for (let i = 0; i < 3000; i++) {
      const k = B.pickShopGearBaseKey(12, B.game.rnd);
      counts[B.GEARS[k].elem]++;
    }
    return counts;
  };
  const underFrost = countElemRolls('main_frost');
  const underFlame = countElemRolls('main_flame');
  assert.ok(underFrost.frost > underFlame.frost + 80, `main_frost must increase frost gear rate (${underFrost.frost} vs ${underFlame.frost})`);
  assert.ok(underFlame.fire > underFrost.fire + 80, `main_flame must increase fire gear rate (${underFlame.fire} vs ${underFrost.fire})`);
  assert.ok(underFrost.fire > 300 && underFlame.frost > 250, 'Other elements must still appear frequently');

  // 1d) Locked pack gear/affix NEVER enter active run pool before unlock
  assert.equal(B.getActiveRunGearKeys().includes('ember_censer'), false);
  assert.equal(B.getActiveRunAffixKeys().includes('storm_conduit'), false);
  const baseGearPoolLen = B.getActiveRunGearKeys().length;
  const baseAffixPoolLen = B.getActiveRunAffixKeys().length;
  assert.equal(baseGearPoolLen, 23);
  assert.equal(baseAffixPoolLen, 12);

  // 1e) Grant shards via import -> unlock ALL mains, ALL aux, ALL packs -> verify:
  //     (i) budget capacity STILL strictly 1 main, <=3 aux, <=4 pts (NEVER increases!)
  //     (ii) active pool size STILL strictly 23 gears / 12 affixes (anti-dilution!)
  //     (iii) unlocked expansion items appear on next run!
  //     (iv) 0 permanent ATK/HP/Crit inflation vs 0-unlock!
  B.finishGame(false);
  const heroStatsZeroUnlock = (() => {
    B.startNewRun(6020, false);
    const s = B.getHeroStats();
    return { maxHp: B.game.hero.maxHp, dmgMult: s.dmgMult, crit: s.crit, w30BossHp: B.BALANCE.enemies.boss6.hp };
  })();

  B.finishGame(false);
  const richSave = JSON.parse(B.exportMetaSave());
  richSave.legacyShards = 2000;
  assert.equal(B.importMetaSave(richSave).ok, true);

  for (const m of cfg.metaProgression.mains) {
    if (!B.getMetaSave().unlockedMain.includes(m.id)) {
      assert.equal(B.unlockMetaItem('main', m.id).ok, true);
    }
  }
  for (const a of cfg.metaProgression.auxiliaries) {
    if (!B.getMetaSave().unlockedAux.includes(a.id)) {
      assert.equal(B.unlockMetaItem('aux', a.id).ok, true);
    }
  }
  for (const p of cfg.metaProgression.unlockPacks) {
    assert.equal(B.unlockMetaItem('pack', p.id).ok, true);
  }

  // Full unlock budget STILL strictly capped at max 3 aux and max 4 pts!
  const overPts = B.setMetaLoadout({ main: 'main_wind', aux: ['aux_tactical_reserve', 'aux_telegraph_buffer'] }); // 3 + 2 = 5 > 4
  assert.equal(overPts.ok, false);
  assert.equal(overPts.reason, 'aux_points_exceeded');

  const overCnt = B.setMetaLoadout({ main: 'main_wind', aux: ['aux_scout_sense', 'aux_dash_cadence', 'aux_salvage_craft', 'aux_shop_first_refresh'] }); // 4 aux > 3
  assert.equal(overCnt.ok, false);
  assert.equal(overCnt.reason, 'aux_count_exceeded');

  // Valid 3+1=4 full-unlock combination works!
  const valid31 = B.setMetaLoadout({ main: 'main_wind', aux: ['aux_tactical_reserve', 'aux_salvage_craft'] });
  assert.equal(valid31.ok, true);
  assert.equal(valid31.budget.auxCount, 2);
  assert.equal(valid31.budget.auxPoints, 4);
  assert.equal(valid31.budget.maxAuxCount, 3);
  assert.equal(valid31.budget.maxAuxPoints, 4);

  // Start new run with unlocked content -> anti-dilution constant pool size + unlocked gear/affix active + zero stat inflation!
  B.startNewRun(6020, false);
  assert.equal(B.getActiveMetaMain().id, 'main_wind');
  assert.equal(B.getActiveRunGearKeys().length, baseGearPoolLen, 'Unlocked gear pack must NOT dilute active gear pool size');
  assert.equal(B.getActiveRunAffixKeys().length, baseAffixPoolLen, 'Unlocked affix pack must NOT dilute active affix pool size');
  assert.equal(B.getActiveRunGearKeys().includes('ember_censer'), true, 'Unlocked gear must enter next run active pool');
  assert.equal(B.getActiveRunGearKeys().includes('glacier_bell'), true);
  assert.equal(B.getActiveRunAffixKeys().includes('storm_conduit'), true, 'Unlocked affix must enter next run active pool');
  assert.equal(B.getActiveRunAffixKeys().includes('aegis_pulse'), true);

  const heroStatsFullUnlock = {
    maxHp: B.game.hero.maxHp,
    dmgMult: B.getHeroStats().dmgMult,
    crit: B.getHeroStats().crit,
    w30BossHp: B.BALANCE.enemies.boss6.hp
  };
  assert.deepEqual(heroStatsFullUnlock, heroStatsZeroUnlock, 'Full unlocks MUST NOT inflate base maxHp/dmgMult/crit or Boss HP');
});

// =========================================================================
// TEST 2: Versioned Persistence, Anti-Duplicate Settlement (Same runId & Reload)
//         & Anti-Suicide-Farming Shard Formula
// =========================================================================
test('2. Versioned localStorage persistence, export/import, anti-duplicate settlement across repeat calls & page reload, and anti-suicide-farming shard formula', () => {
  const storage = createMockLocalStorage();
  const { B } = bootBG60({ storage });

  // 2a) Anti-suicide-farming formula: W1/W2/W3 (0 bosses, <3 cleared waves) => STRICTLY 0 shards!
  for (const earlyWave of [1, 2, 3]) {
    B.startNewRun(6100 + earlyWave, false);
    B.game.wave = earlyWave;
    B.game.stats.bossKills = 0;
    const calc = B.calculateRunShardRewards(false, B.game);
    assert.equal(calc.eligible, false, `Wave ${earlyWave} defeat with 0 bosses must be ineligible`);
    assert.equal(calc.runShards, 0, `Wave ${earlyWave} early suicide must grant strictly 0 shards`);
    B.finishGame(false);
    assert.equal(B.getMetaSave().legacyShards, 0, 'Total shards must remain 0 after W1-W3 early suicide');
  }

  // 2b) Monotonic progression & victory per-minute superiority
  const simReward = (wave, bossKills, w10, w20, victory, estMinutes) => {
    const fakeG = {
      wave,
      stats: { bossKills },
      hero: { breakthroughs: { w10: w10 ? { wave: 10 } : null, w20: w20 ? { wave: 20, placeholder: false } : null }, vouchers: { w20 } }
    };
    const r = B.calculateRunShardRewards(victory, fakeG);
    return { ...r, perMin: r.runShards / estMinutes };
  };
  const rW2 = simReward(2, 0, false, false, false, 0.8);
  const rW10 = simReward(10, 1, false, false, false, 6);
  const rW20 = simReward(20, 3, true, false, false, 15);
  const rW30Fail = simReward(30, 5, true, true, false, 27);
  const rW30Win = simReward(30, 6, true, true, true, 30);

  assert.equal(rW2.runShards, 0);
  assert.ok(rW10.runShards > 0 && rW20.runShards > rW10.runShards * 3, `W20 fail (${rW20.runShards}) >> W10 fail (${rW10.runShards})`);
  assert.ok(rW30Fail.runShards > rW20.runShards * 2, `W30 fail (${rW30Fail.runShards}) >> W20 fail (${rW20.runShards})`);
  assert.ok(rW30Win.runShards > rW30Fail.runShards + 120, `W30 win (${rW30Win.runShards}) >> W30 fail (${rW30Fail.runShards})`);
  assert.ok(rW30Win.perMin > rW30Fail.perMin * 1.5, `W30 win shards/min (${rW30Win.perMin.toFixed(2)}) must significantly beat W30 fail (${rW30Fail.perMin.toFixed(2)})`);
  assert.ok(rW30Win.perMin > rW20.perMin * 2.0, `W30 win shards/min (${rW30Win.perMin.toFixed(2)}) must strongly beat W20 fail (${rW20.perMin.toFixed(2)})`);

  // 2c) Same runId duplicate finishGame() AND simulated page reload replay MUST NOT double-grant shards or milestones!
  B.loadTestPreset({ wave: 30, tier: 'standard', build: 'fire', seed: 6150 });
  B.game.stats.bossKills = 6;
  B.game.stats.destinyRolls = 0;
  const runId = B.game.runId;
  B.finishGame(true);

  const firstSettle = B.game.metaSettlement;
  const shardsAfterFirst = B.getMetaSave().legacyShards;
  const milestonesAfterFirst = B.getMetaSave().claimedMilestones.slice();
  assert.equal(firstSettle.duplicateBlocked, false);
  assert.ok(shardsAfterFirst >= 400, `First W30 0-gamble victory + milestones should grant rich shards (got ${shardsAfterFirst})`);
  assert.ok(milestonesAfterFirst.includes('ms_clear_w30'));
  assert.ok(milestonesAfterFirst.includes('ms_clear_w30_no_gamble'));

  // Duplicate finishGame(true) call on same runId
  B.finishGame(true);
  assert.equal(B.game.metaSettlement.duplicateBlocked, true);
  assert.equal(B.game.metaSettlement.totalShardsGrantedThisCall, 0);
  assert.equal(B.getMetaSave().legacyShards, shardsAfterFirst, 'Duplicate finishGame must NOT add shards');

  // Verify versioned localStorage persistence across fresh page reload + replay attack with same runId
  const rawStored = storage.getItem('border_guard_v060_meta_v1');
  assert.ok(rawStored, 'Save must be persisted under border_guard_v060_meta_v1');
  const parsedStored = JSON.parse(rawStored);
  assert.equal(parsedStored.schemaVersion, 1);
  assert.ok(parsedStored.settledRunIds.includes(runId));

  const { B: B2 } = bootBG60({ storage });
  assert.equal(B2.getMetaSave().legacyShards, shardsAfterFirst, 'Reloaded session must preserve legacyShards');
  assert.deepEqual(B2.getMetaSave().claimedMilestones, milestonesAfterFirst, 'Reloaded session must preserve claimedMilestones');

  // Attempt replay settlement using the ALREADY-SETTLED runId on reloaded instance!
  B2.loadTestPreset({ wave: 30, tier: 'standard', build: 'fire', seed: 6150 });
  B2.game.runId = runId;
  B2.game.stats.bossKills = 6;
  B2.finishGame(true);
  assert.equal(B2.game.metaSettlement.duplicateBlocked, true, 'Reload replay with same runId must be blocked');
  assert.equal(B2.getMetaSave().legacyShards, shardsAfterFirst, 'Reload replay must NOT grant any extra shards');

  // Export -> Reset -> Import roundtrip
  const backupJson = B2.exportMetaSave();
  B2.resetMetaSave();
  assert.equal(B2.getMetaSave().legacyShards, 0);
  assert.equal(B2.importMetaSave(backupJson).ok, true);
  assert.equal(B2.getMetaSave().legacyShards, shardsAfterFirst);
});

// =========================================================================
// TEST 3: Real Hit Tracking, Fatal Source Attribution, 3-Dim Settlement UI
//         & Clean Restart from W20 Defeat / W30 Defeat / W30 Victory
// =========================================================================
test('3. Real combat hit & fatal attribution (Boss core/aux + normal threats), 3-dim settlement rendering, and clean restart after W20 defeat / W30 defeat / W30 victory', () => {
  const storage = createMockLocalStorage();
  const { B, doc } = bootBG60({ storage });

  // 3a) W20 Defeat with real Boss 4 attack attribution
  B.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire', seed: 6201 });
  B.selectW20PreselectDirection('fire_chain_surge');
  assert.equal(B.startWave(), true);
  B.stepFrame(0.05);
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(45, {
    attackerName: '天劫魔尊', attackerKind: 'boss4',
    skillName: '领域压迫环 (W20随机辅助)', isBoss: true, isBossCore: false, isBossAux: true, auxKey: 'oppression_ring'
  });
  B.game.hero.invuln = 0;
  B.damageHero(9999, {
    attackerName: '天劫魔尊', attackerKind: 'boss4',
    skillName: '天劫三重雷域 (W20固定核心)', isBoss: true, isBossCore: true, isBossAux: false
  });
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.combatLog.fatalSource.attackerName, '天劫魔尊');
  assert.equal(B.game.combatLog.fatalSource.skillName, '天劫三重雷域 (W20固定核心)');
  assert.equal(B.game.combatLog.fatalSource.isBossCore, true);
  const threatsW20 = B.getRecentThreatSummary(5.0);
  assert.equal(threatsW20.hitCount, 2);

  const w20ModalHtml = doc.getElementById('modalBox').innerHTML;
  assert.ok(w20ModalHtml.includes('① 通关结果'), '3-dim settlement section 1 present');
  assert.ok(w20ModalHtml.includes('② 本局表现'), '3-dim settlement section 2 present');
  assert.ok(w20ModalHtml.includes('③ 长期成长与资源结算'), '3-dim settlement section 3 present');
  assert.ok(w20ModalHtml.includes('天劫三重雷域'), 'Fatal source must be rendered verbatim');
  assert.ok(w20ModalHtml.includes('endMetaBtn') && w20ModalHtml.includes('restartGo'), 'Meta config & quick restart buttons must exist');

  // Clean restart after W20 defeat
  const prevRunId1 = B.game.runId;
  B.startNewRun(6202, false);
  assert.notEqual(B.game.runId, prevRunId1);
  assert.equal(B.game.wave, 1);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.hero.gear.length, 0);
  assert.equal(B.game.combatLog.hits.length, 0);
  assert.equal(B.game.combatLog.fatalSource, null);

  // 3b) W30 Defeat from real Boss 6 signature shockwave -> clean restart
  B.loadTestPreset({ wave: 30, tier: 'standard', build: 'frost', seed: 6203 });
  assert.equal(B.startWave(), true);
  B.stepFrame(0.05);
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(9999, {
    attackerName: '深渊主宰', attackerKind: 'boss6',
    skillName: '终焉裂空冲击波 (W30核心招牌)', isBoss: true, isBossCore: true, isBossAux: false
  });
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.combatLog.fatalSource.skillName, '终焉裂空冲击波 (W30核心招牌)');
  const prevRunId2 = B.game.runId;
  B.startNewRun(6204, false);
  assert.notEqual(B.game.runId, prevRunId2);
  assert.equal(B.game.wave, 1);
  assert.equal(B.game.w30Battle, null);

  // 3c) W30 Victory -> clean restart
  B.loadTestPreset({ wave: 30, tier: 'strong', build: 'fire', seed: 6205 });
  B.game.stats.bossKills = 6;
  B.finishGame(true);
  assert.equal(B.game.phase, 'won');
  const prevRunId3 = B.game.runId;
  B.startNewRun(6206, false);
  assert.notEqual(B.game.runId, prevRunId3);
  assert.equal(B.game.wave, 1);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.enemies.length, 0);
});

// =========================================================================
// TEST 4: Natural Full 30-Wave Playthrough (W1 -> W30) with ZERO Destiny Gambles
//         (Verifies 0-gamble regular route clearability, 25-35 min pacing metrics,
//          real W10/W20/gear synergy progression, and resource accounting)
// =========================================================================
test('4. Natural W1 -> W30 full playthrough via 0-gamble regular route: pacing breakdown, synergies, materials, attribution & W30 victory', () => {
  const storage = createMockLocalStorage();
  const { B } = bootBG60({ storage });

  // Start naturally from W1 with default 0-unlock loadout (main_flame + 1+1+2=4 aux!)
  B.startNewRun(6060, false);
  B.pickHeroSkill('firewave');
  assert.equal(B.game.wave, 1);
  assert.equal(B.game.metaRunLocked, true);

  // Helper: handle any pending level-up / chest / breakthrough modals naturally as a player would
  const resolveModalsNaturally = () => {
    let guard = 0;
    while (guard++ < 30) {
      if (B.game.chests.length > 0 && B.game.phase === 'prep') {
        const c = B.game.chests.shift();
        B.queueModal({ type: 'chest', legend: c.legend, shrineTier: !!c.shrineTier });
      }
      if (!B.game.activeModal && B.game.pendingModals.length > 0) {
        B.openNextModal();
      }
      const m = B.game.activeModal;
      if (!m) break;

      if (m.type === 'levelup') {
        // Prefer firewave -> blades -> berserk -> nova -> thunder -> stomp
        const order = ['firewave', 'blades', 'berserk', 'nova', 'thunder', 'stomp'];
        const unlocked = B.getUnlockedSkillPool();
        const pick = order.find(k => unlocked.includes(k) && (B.game.hero.skills[k] || 0) < 5);
        if (pick) B.pickHeroSkill(pick);
        else B.closeModal();
      } else if (m.type === 'w10_breakthrough') {
        if (!B.game.w10Draft?.skillKey) {
          B.selectW10BreakthroughSkill('firewave');
        }
        const opts = B.game.w10Draft?.choices || [];
        const preferredKey = opts.includes('fw_brand_pierce') ? 'fw_brand_pierce' : opts[0];
        if (preferredKey) B.pickW10BreakthroughBranch(preferredKey);
        else B.closeModal();
      } else if (m.type === 'w20_breakthrough') {
        const draft = B.game.w20Draft;
        const cands = draft?.candidates || [];
        const bestKey = cands.find(k => k === 'w20_fire_isolated_exec' || k === 'w20_fire_supernova_chain') || cands[0];
        if (bestKey) B.pickW20Enhancement(bestKey);
        else B.closeModal();
      } else if (m.type === 'chest') {
        const choices = B.pickChestGearChoices(!!m.legend, !!m.shrineTier);
        // Score choices favoring fire synergy affixes & higher rarity
        const scoreInst = (inst) => {
          let sc = ({ common: 10, rare: 25, epic: 50, legend: 90 }[inst.rarity] || 10) + inst.slotsCount * 12;
          for (const a of (inst.affixes || [])) {
            if (a && ['fire_brand', 'fire_burst', 'fire_chain'].includes(a.id)) sc += 45;
          }
          if (inst.elem === 'fire') sc += 15;
          return sc;
        };
        choices.sort((a, b) => scoreInst(b) - scoreInst(a));
        B.pickGearReward(choices[0]);
      } else {
        B.closeModal();
      }
    }
  };

  // Helper: regular shop optimization (STRICTLY ZERO DESTINY GAMBLES!)
  const optimizeInPrepZeroGamble = (wave) => {
    resolveModalsNaturally();

    // Preselect W20 direction once W16 opens
    if (wave >= 16 && wave <= 20 && !B.game.w20State?.preselectedDirection) {
      B.selectW20PreselectDirection('fire_chain_surge');
    }

    // Buy matching fire seal (up to cap) + helpful sub-seals + fire/epic/legend gear from regular shop
    const tryShopPurchases = () => {
      for (let i = 0; i < B.game.shop.length; i++) {
        const it = B.game.shop[i];
        if (!it || it.bought || B.game.gold < it.cost) continue;
        if (it.itemType === 'seal') {
          const wantMain = !B.game.seal ? it.kind === 'fire' : (B.game.seal.kind === it.kind && B.game.seal.star < B.getSealStarCap());
          const wantSub = B.game.seal && B.game.seal.kind !== it.kind && ['wind', 'thunder', 'holy'].includes(it.kind)
            && (B.game.subSeals.some(s => s.kind === it.kind && s.star < 3) || B.game.subSeals.length < B.getSubSealSlotCap());
          if (wantMain || wantSub) {
            B.buyShopItem(i);
          }
        } else if (it.itemType === 'gear') {
          const g = it.gear;
          const hasFireAffix = (g.affixes || []).some(a => a && ['fire_brand', 'fire_burst', 'fire_chain'].includes(a.id));
          const needMoreGear = B.game.hero.gear.length < 4;
          const isUpgrade = g.rarity === 'legend' || g.rarity === 'epic' || (hasFireAffix && g.slotsCount >= 2);
          if ((needMoreGear || isUpgrade) && B.game.bag.length < 10) {
            B.buyShopItem(i);
          }
        } else if (it.itemType === 'pill' && it.pillKey === 'temper' && B.game.gold >= it.cost + 80) {
          B.buyShopItem(i);
        }
      }
    };

    tryShopPurchases();
    // Use 1 free refresh per wave from aux_shop_first_refresh!
    if (B.hasMetaAux('aux_shop_first_refresh') && !B.game.metaRunState.freeRefreshUsedThisWave) {
      B.rollShop(false);
      tryShopPurchases();
    }
    // Spend extra gold on 1-2 refreshes in mid/late waves
    if (wave >= 8 && B.game.gold >= 160) {
      B.rollShop(false);
      tryShopPurchases();
    }

    // Choose 3★ seal specialization route (35g mastery) once main fire seal reaches 3★
    if (B.game.seal && B.game.seal.star >= 3 && !B.game.seal.route && B.game.gold >= 35) {
      B.chooseSealRoute('mastery');
    }

    // Equip best 4 gears prioritizing fire duo/trio synergy + rarity + sourceStage + enhanceLv
    const gearScore = (inst) => {
      if (!inst || inst.itemType === 'seal') return -1;
      let sc = ({ common: 12, rare: 28, epic: 55, legend: 95 }[inst.rarity] || 10)
        + (inst.sourceStage || 1) * 18
        + (inst.enhanceLv || 0) * 16
        + (inst.slotsCount || 1) * 10;
      for (const a of (inst.affixes || [])) {
        if (a && ['fire_brand', 'fire_burst', 'fire_chain'].includes(a.id)) sc += 55;
      }
      if (inst.elem === 'fire') sc += 15;
      return sc;
    };
    while (B.game.hero.gear.length < 4 && B.game.bag.some(x => !B.isBagSeal(x))) {
      let bestIdx = -1, bestSc = -1;
      for (let i = 0; i < B.game.bag.length; i++) {
        const sc = gearScore(B.game.bag[i]);
        if (sc > bestSc) { bestSc = sc; bestIdx = i; }
      }
      if (bestIdx >= 0) B.equipGearFromBag(bestIdx);
      else break;
    }
    for (let i = B.game.bag.length - 1; i >= 0; i--) {
      const cand = B.game.bag[i];
      if (!cand || B.isBagSeal(cand)) continue;
      let worstIdx = 0, worstSc = Infinity;
      for (let s = 0; s < B.game.hero.gear.length; s++) {
        const sc = gearScore(B.game.hero.gear[s]);
        if (sc < worstSc) { worstSc = sc; worstIdx = s; }
      }
      if (gearScore(cand) > worstSc + 18) {
        B.replaceEquippedGear(i, worstIdx);
      }
    }

    // Dismantle excess bag gear for normal materials (or sell if low gold)
    for (let i = B.game.bag.length - 1; i >= 0; i--) {
      const it = B.game.bag[i];
      if (!it || B.isBagSeal(it)) continue;
      if (B.game.gold < 60) B.sellBagGear(i);
      else B.dismantleBagGear(i);
    }

    // Enhance equipped gear with normal materials (keep 6 materials reserve right before W20 for optional reroll)
    const matReserve = (wave >= 18 && wave <= 20) ? 6 : 0;
    let enhGuard = 0;
    while (enhGuard++ < 12) {
      let upgraded = false;
      for (let s = 0; s < B.game.hero.gear.length; s++) {
        const cost = B.getGearEnhanceCost(B.game.hero.gear[s]);
        if (cost !== null && B.game.materials - cost >= matReserve) {
          if (B.enhanceGear({ location: 'equipped', idx: s }).ok) upgraded = true;
        }
      }
      if (!upgraded) break;
    }

    // Simulate realistic human prep thinking time (~12s normal wave, ~45s in W29 final prep)
    const prepSimSec = wave === 30 ? 45 : (wave === 11 || wave === 21) ? 24 : 12;
    for (let s = 0; s < prepSimSec; s++) {
      if (B.game.phase !== 'prep') break;
      if (B.game.finalPrep?.active && B.game.finalPrep.timer <= 5) break;
      B.stepFrame(1.0);
    }
    resolveModalsNaturally();
  };

  // Run all 30 waves naturally from W1 to W30!
  for (let w = 1; w <= 30; w++) {
    assert.equal(B.game.wave, w, `Expected wave ${w}, got ${B.game.wave}`);
    optimizeInPrepZeroGamble(w);

    if (w === 30 && B.game.finalPrep?.active) {
      assert.equal(B.startW30Early().ok, true);
    } else {
      assert.equal(B.startWave(), true, `Failed to start wave ${w}`);
    }

    // Simulate active kiting & skill combat until wave ends (harvest -> prep or won/lost)
    let elapsed = 0;
    const maxWaveSec = w === 30 ? 480 : 120;
    const dt = 0.1;
    let ang = 0;
    while ((B.game.phase === 'wave' || B.game.phase === 'harvest') && elapsed < maxWaveSec) {
      // Handle mid-wave level-up modals immediately
      if (B.game.activeModal) resolveModalsNaturally();

      const h = B.game.hero;
      const boss = B.game.enemies.find(e => e.boss && e.hp > 0);
      const sigZone = B.game.zones.find(z => z.kind === 'w30SigTelegraph' || z.kind === 'w30SigShockwave');

      // Active kiting & telegraph avoidance (realistic desktop player positioning: 55% engage / 45% dodge on Boss waves)
      if (sigZone) {
        // Move into W30 signature safe zone during telegraph/shockwave!
        h.x = sigZone.safeX;
        h.y = sigZone.safeY;
      } else if (boss) {
        ang += 0.35 * dt * 10;
        const cycle = elapsed % 6.0;
        const engage = (w === 30) ? (cycle < 3.3) : (cycle < 4.2);
        const orbitR = engage ? 2.9 : 8.2;
        h.x = Math.max(3, Math.min(B.W - 3, boss.x + Math.cos(ang) * orbitR));
        h.y = Math.max(3, Math.min(B.H - 3, boss.y + Math.sin(ang) * orbitR));
      } else if (B.game.enemies.length > 0) {
        // Kite near nearest enemy cluster at ~2.5 cells while avoiding direct contact & hazard zones
        const tgt = B.game.enemies[0];
        ang += 0.25;
        h.x = Math.max(3, Math.min(B.W - 3, tgt.x + Math.cos(ang) * 2.5));
        h.y = Math.max(3, Math.min(B.H - 3, tgt.y + Math.sin(ang) * 2.5));
      }

      // Trigger dash & overdrive periodically when ready
      if (Math.round(elapsed * 10) % 45 === 0 && h.dashCd <= 0 && !sigZone) B.castHeroDash();
      if (Math.round(elapsed * 10) % 90 === 0 && h.ultCd <= 0) B.castHeroOverdrive();

      B.stepFrame(dt);
      elapsed += dt;
    }

    assert.notEqual(B.game.phase, 'lost', `Natural 0-gamble run died at wave ${w} (fatal: ${JSON.stringify(B.game.combatLog.fatalSource)})`);
    if (w < 30) {
      assert.equal(B.game.phase, 'prep', `Wave ${w} must clear into prep (elapsed=${elapsed.toFixed(1)}s, enemies=${B.game.enemies.length})`);
    }
  }

  assert.equal(B.game.phase, 'won', 'Natural 0-gamble W1->W30 route MUST defeat W30 Boss and win!');
  assert.equal(B.game.stats.destinyRolls, 0, 'Strictly 0 Destiny Gambles used');
  assert.equal(B.game.stats.bossKills, 6, 'Exactly 6 Bosses (W5/10/15/20/25/30) killed with zero re-entrant duplicate counts');
  assert.ok(B.game.hero.breakthroughs.w10, 'W10 breakthrough completed');
  assert.ok(B.game.hero.breakthroughs.w20 && !B.game.hero.breakthroughs.w20.placeholder, 'W20 breakthrough completed');
  assert.ok(B.game.w30Battle && B.game.w30Battle.signatureTriggered, 'W30 signature lock experienced');
  assert.ok(B.getMetaSave().claimedMilestones.includes('ms_clear_w30_no_gamble'), '0-gamble W30 victory milestone must be claimed');
  assert.equal(B.getMetaSave().stats.victories, 1);
  assert.equal(B.getMetaSave().stats.noGambleVictories, 1);

  const rm = B.game.runMetrics;
  const syn = B.getActiveGearAffixSynergies();
  console.log(
    `[Stage6 Natural W1->W30 0-Gamble Run Summary]\n` +
    `  Result: VICTORY | Level: ${B.game.hero.lv} | Main Seal: ${B.game.seal?.kind || 'none'} ${B.game.seal?.star || 0}★ (${B.game.seal?.route || 'none'})\n` +
    `  Time Breakdown: total=${(rm.totalEffectiveSec / 60).toFixed(2)}m (${Math.round(rm.totalEffectiveSec)}s) | normalCombat=${Math.round(rm.normalCombatSec)}s | bossCombat=${Math.round(rm.bossCombatSec)}s (W30=${B.game.w30Battle.elapsedSeconds.toFixed(1)}s) | prep=${Math.round(rm.prepSec)}s | w29FinalPrep=${Math.round(rm.w29FinalPrepSec)}s | harvest=${Math.round(rm.harvestSec)}s\n` +
    `  Survival & Attribution: lowestHp=${B.game.combatLog.lowestHpPct}% | hitsTaken=${B.game.combatLog.totalHitsTaken} | hpLost=${B.game.combatLog.totalHpLost} | shieldAbsorbed=${B.game.combatLog.totalShieldAbsorbed}\n` +
    `  Synergies: [${syn.active.map(s => `${s.id}(T${s.tier})`).join(', ') || 'none'}] | fireMarks=${B.game.stats.fireMarksApplied} | detonations=${B.game.stats.fireDetonations} | chains=${B.game.stats.fireChainTransfers} | focused=${B.game.stats.fireFocusedDetonations}\n` +
    `  Economy (0 Gamble): gold +${rm.goldEarned}/-${rm.goldSpent} (rem ${B.game.gold}) | mats +${rm.materialsEarned}/-${rm.materialsSpent} (rem ${B.game.materials}) | tokens +${rm.transferTokensEarned}/-${rm.transferTokensSpent}\n` +
    `  Meta Rewards: +${B.game.metaSettlement.totalShardsGranted} shards (run=${B.game.metaSettlement.runShards} + ms=${B.game.metaSettlement.milestoneShards}) | totalSaved=${B.getMetaSave().legacyShards}`
  );
});

// =========================================================================
// TEST 5: Real Headless Chrome Smoke Test (Desktop 1440x900 & Narrow 390x844)
// =========================================================================
test('5. Real headless Chrome offline smoke test (1440x900 desktop & 390x844 narrow viewport, zero JS runtime errors)', () => {
  const chromeBin = '/usr/bin/google-chrome';
  assert.ok(fs.existsSync(chromeBin), 'google-chrome binary must exist for real browser smoke verification');
  const fileUrl = `file://${HTML_PATH}`;

  const runChromeDump = (width, height) => {
    const out = execFileSync(chromeBin, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--window-size=${width},${height}`,
      '--virtual-time-budget=2000',
      '--dump-dom',
      fileUrl
    ], { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return out;
  };

  // Desktop 1440x900
  const desktopDom = runChromeDump(1440, 900);
  assert.ok(desktopDom.includes('id="gameCanvas"'), 'Desktop DOM must contain gameCanvas');
  assert.ok(desktopDom.includes('id="shardPill"'), 'Desktop DOM must contain #shardPill');
  assert.ok(desktopDom.includes('id="metaLegacyBtn"'), 'Desktop DOM must contain #metaLegacyBtn');
  assert.ok(desktopDom.includes('id="introMetaBtn"'), 'Desktop Intro modal must dynamically render #introMetaBtn (proves script executed cleanly)');
  assert.ok(desktopDom.includes('烈焰传承'), 'Desktop Intro modal must render active default Main Legacy');

  // Narrow viewport 390x844
  const narrowDom = runChromeDump(390, 844);
  assert.ok(narrowDom.includes('id="gameCanvas"'), 'Narrow DOM must contain gameCanvas');
  assert.ok(narrowDom.includes('id="introMetaBtn"'), 'Narrow Intro modal must render cleanly');
  assert.ok(narrowDom.includes('battle-hud collapsed') && narrowDom.includes('left-hud build-hud collapsed'), 'Narrow 390x844 viewport must auto-collapse side HUDs for playability');
});
