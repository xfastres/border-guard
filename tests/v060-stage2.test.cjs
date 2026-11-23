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

test('1. Independent gear instances, rarity-independent 1/2/3 slot weights (50%/35%/15%), affix uniqueness, conflict-group rejection & zero legacy auto-fusion', () => {
  const { B } = bootBG60();
  B.startNewRun(202602, false);
  B.closeModal();

  // Verify slot count distribution is ~50% / 35% / 15% and independent of rarity (common vs legend)
  const sampleByRarity = (baseKey, rarity, n = 2000) => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < n; i++) {
      const inst = B.createGearInstance(baseKey, { rarity, wave: 12 });
      assert.equal(inst.rarity, rarity);
      assert.equal(inst.sourceStage, 2);
      assert.equal(inst.affixes.length, inst.slotsCount, 'Factory gear must fill all slots with affixes');
      assert.ok(inst.affixes.every(a => a && B.GEAR_AFFIXES[a.id]), 'All factory affixes must be non-null valid affixes');
      const v = B.validateGearAffixes(inst.affixes, inst.slotsCount);
      assert.equal(v.ok, true, `Generated affixes must be valid: ${v.reason}`);
      counts[inst.slotsCount]++;
    }
    return { p1: counts[1] / n, p2: counts[2] / n, p3: counts[3] / n };
  };

  const commonDist = sampleByRarity('bronze_tassel', 'common', 2000);
  const legendDist = sampleByRarity('titan_crown', 'legend', 2000);

  for (const [label, d] of [['common', commonDist], ['legend', legendDist]]) {
    assert.ok(Math.abs(d.p1 - 0.50) < 0.04, `${label} 1-slot ratio expected ~0.50, got ${d.p1}`);
    assert.ok(Math.abs(d.p2 - 0.35) < 0.04, `${label} 2-slot ratio expected ~0.35, got ${d.p2}`);
    assert.ok(Math.abs(d.p3 - 0.15) < 0.04, `${label} 3-slot ratio expected ~0.15, got ${d.p3}`);
  }

  // Verify duplicate affix & conflict-group rejection
  assert.equal(B.validateGearAffixes(['fire_brand', 'fire_brand'], 2).ok, false);
  assert.equal(B.validateGearAffixes(['thunder_spark', 'wind_tempest'], 2).ok, false, 'proc_style conflict group must be rejected');
  assert.equal(B.validateGearAffixes(['fury_crit', 'iron_bastion'], 2).ok, false, 'crit_stance conflict group must be rejected');
  assert.throws(() => B.createGearInstance('flame_fan', { slotsCount: 2, affixes: ['fire_brand', 'fire_brand'] }));
  assert.throws(() => B.createGearInstance('volt_crest', { slotsCount: 2, affixes: ['thunder_spark', 'wind_tempest'] }));

  // Verify NO legacy auto-fusion overwrites random slots/affixes on duplicate gear
  const g1 = B.createGearInstance('flame_fan', { wave: 5, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'fire_chain'] });
  const g2 = B.createGearInstance('flame_fan', { wave: 12, slotsCount: 1, affixes: ['vamp_siphon'] });
  B.grantGear(g1);
  B.equipGearFromBag(0);
  assert.equal(B.findGearStackTarget('flame_fan'), null, 'Legacy findGearStackTarget must be disabled');
  B.grantGear(g2);

  assert.equal(B.game.hero.gear.length, 1);
  assert.equal(B.game.bag.length, 1, 'Second identical baseKey must remain a separate bag instance');
  assert.notEqual(B.game.hero.gear[0].uid, B.game.bag[0].uid);
  assert.equal(B.game.hero.gear[0].slotsCount, 3, 'Equipped gear slots must NOT be overwritten');
  assert.deepEqual(B.game.hero.gear[0].affixes.map(a => a.id), ['fire_brand', 'fire_burst', 'fire_chain']);
  assert.equal(B.game.bag[0].slotsCount, 1);
  assert.equal(B.game.bag[0].sourceStage, 2);
});

test('2. Fixed-seed Fire Detonation comparison: Single Affix vs Duo Synergy vs Complete Trio (group chain transfer + isolated Boss focused detonation + no double-proc/recursion)', () => {
  const { B } = bootBG60();

  function setupFireScenario(affixes, mode) {
    B.loadTestPreset({ wave: 11, tier: 'weak', build: 'fire', seed: 2026 });
    // Strip W10 branch & seal so we strictly isolate the Stage 2 gear affix synergy behavior!
    B.game.hero.w10Branch = {};
    B.game.seal = null;
    B.game.subSeals = [];
    B.game.hero.perks = {};
    B.game.hero.skills = { firewave: 3, blades: 0, thunder: 0, nova: 0, stomp: 0, berserk: 0 };
    B.game.hero.gear = [
      B.createGearInstance('flame_fan', { sourceStage: 2, slotsCount: affixes.length, affixes, enhanceLv: 0 })
    ];
    B.syncHeroMaxHp?.();
    const syn = B.recomputeEquipmentSynergies();
    B.startWave();
    B.game.waveQueue.forEach(q => { q.spawned = true; });
    B.game.enemies = [];

    const hx = B.game.hero.x, hy = B.game.hero.y;
    const enemies = [];
    if (mode === 'group') {
      // 4 clustered marked brutes within chain transfer radius (3.2 tiles)
      for (let i = 0; i < 4; i++) {
        const e = B.spawnEnemy('brute', 'east', 60, { x: hx + 2.0 + i * 1.1, y: hy + (i % 2 ? 0.3 : -0.3) });
        B.applyFireMark(e, 1, 'setup', 6.0);
        enemies.push(e);
      }
    } else {
      // Single isolated Boss with no other enemies anywhere nearby
      const boss = B.spawnEnemy('boss2', 'east', 5, { x: hx + 2.2, y: hy });
      B.applyFireMark(boss, 1, 'setup', 6.0);
      enemies.push(boss);
    }

    // Trigger one clean fire hit on the primary target
    const startHpSum = enemies.reduce((s, e) => s + e.hp, 0);
    B.dealDamage(enemies[0], 45, { fromHero: true, skillKey: 'firewave', burn: 10 });
    const endHpSum = enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);

    return {
      syn,
      totalDamage: startHpSum - endHpSum,
      stats: { ...B.game.stats }
    };
  }

  // Group scenario: Single vs Duo vs Trio
  const gSingle = setupFireScenario(['fire_brand'], 'group');
  const gDuo    = setupFireScenario(['fire_brand', 'fire_burst'], 'group');
  const gTrio   = setupFireScenario(['fire_brand', 'fire_burst', 'fire_chain'], 'group');

  assert.equal(gSingle.syn.hasFireDuo, false);
  assert.equal(gSingle.syn.hasFireTrio, false);
  assert.equal(gSingle.stats.gearFireDuoProcs, 0);
  assert.equal(gSingle.stats.gearFireTrioProcs, 0);
  assert.equal(gSingle.stats.fireDetonations, 0, 'Single affix must NOT trigger gear detonation');

  assert.equal(gDuo.syn.hasFireDuo, true);
  assert.equal(gDuo.syn.hasFireTrio, false);
  assert.equal(gDuo.stats.gearFireDuoProcs, 1);
  assert.equal(gDuo.stats.gearFireTrioProcs, 0);
  assert.equal(gDuo.stats.fireDetonations, 1, 'Duo triggers exactly 1 detonation');
  assert.equal(gDuo.stats.fireChainTransfers, 0, 'Duo must NOT chain-transfer');
  assert.ok(gDuo.totalDamage > gSingle.totalDamage, 'Duo AoE detonation must outperform single affix on group');

  assert.equal(gTrio.syn.hasFireTrio, true);
  assert.equal(gTrio.syn.hasFireDuo, false, 'Complete Trio must STRICTLY replace Duo');
  assert.equal(gTrio.stats.gearFireTrioProcs, 1);
  assert.equal(gTrio.stats.gearFireDuoProcs, 0, 'Trio hit must NEVER also settle Duo');
  assert.equal(gTrio.stats.fireChainTransfers, 2, 'Trio group chain transfer must be capped at maxChains=2 (no infinite recursion)');
  assert.equal(gTrio.stats.fireDetonations, 3, '1 primary detonation + 2 chain transfers = 3 total detonations');
  assert.equal(gTrio.stats.fireFocusedDetonations, 0, 'When 2 marked neighbors exist, all chain charges go to transfers');
  assert.ok(gTrio.totalDamage > gDuo.totalDamage, 'Trio chain transfer must deal more group damage than Duo');

  // Isolated Boss scenario: Duo vs Trio (remaining chain charges convert to capped decaying focused detonation!)
  const bDuo  = setupFireScenario(['fire_brand', 'fire_burst'], 'isolated');
  const bTrio = setupFireScenario(['fire_brand', 'fire_burst', 'fire_chain'], 'isolated');

  assert.equal(bDuo.stats.fireFocusedDetonations, 0);
  assert.equal(bTrio.stats.fireChainTransfers, 0);
  assert.equal(bTrio.stats.fireFocusedDetonations, 1, 'Isolated Boss must trigger capped decaying focused detonation');
  assert.equal(bTrio.stats.gearFireDuoProcs, 0, 'Trio must not double-trigger Duo on isolated Boss');
  assert.ok(bTrio.totalDamage > bDuo.totalDamage, 'Isolated Boss focused detonation must deal more damage than Duo');
});

test('3. Fixed-seed Frost Aegis comparison: Single Affix vs Duo Synergy vs Complete Trio (hit pulse + active dash pulse + full-shield refresh pulse) & synergy stacking boundaries', () => {
  const { B } = bootBG60();

  function setupFrostScenario(affixes) {
    B.loadTestPreset({ wave: 11, tier: 'weak', build: 'frost', seed: 2026 });
    B.game.hero.w10Branch = {};
    B.game.seal = null;
    B.game.subSeals = [];
    B.game.hero.perks = {};
    B.game.hero.skills = { nova: 3, blades: 0, thunder: 0, firewave: 0, stomp: 0, berserk: 0 };
    B.game.hero.gear = [
      B.createGearInstance('frost_mirror', { sourceStage: 2, slotsCount: affixes.length, affixes, enhanceLv: 0 })
    ];
    const syn = B.recomputeEquipmentSynergies();
    B.startWave();
    B.game.waveQueue.forEach(q => { q.spawned = true; });
    B.game.enemies = [];
    const e1 = B.spawnEnemy('brute', 'east', 60, { x: B.game.hero.x + 1.8, y: B.game.hero.y });
    B.applyFrostSlow(e1, 0.45, 5.0, 'setup');
    return { syn, e1 };
  }

  // 1) Single affix: no shield gain, no pulses
  const fSingle = setupFrostScenario(['frost_chill']);
  B.dealDamage(fSingle.e1, 30, { fromHero: true, skillKey: 'nova' });
  assert.equal(fSingle.syn.hasFrostDuo, false);
  assert.equal(fSingle.syn.hasFrostTrio, false);
  assert.equal(B.game.stats.gearFrostDuoProcs, 0);
  assert.equal(B.game.stats.frostShieldGained, 0);

  // 2) Duo synergy: hitting slowed enemy grants frost shield, but taking hit or dashing does NOT fire gear frost pulses
  const fDuo = setupFrostScenario(['frost_chill', 'frost_ward']);
  B.dealDamage(fDuo.e1, 30, { fromHero: true, skillKey: 'nova' });
  assert.equal(fDuo.syn.hasFrostDuo, true);
  assert.equal(fDuo.syn.hasFrostTrio, false);
  assert.equal(B.game.stats.gearFrostDuoProcs, 1);
  assert.equal(B.game.stats.gearFrostTrioProcs, 0);
  assert.ok(B.game.hero.shield > 0 && B.game.hero.frostShieldActive);
  B.game.hero.invuln = 0;
  B.damageHero(10);
  B.game.hero.dashCd = 0;
  B.castHeroDash();
  assert.equal(B.game.stats.frostHitPulses, 0, 'Duo must NOT fire Trio shield-hit frost pulse');
  assert.equal(B.game.stats.frostDashPulses, 0, 'Duo must NOT fire Trio active dash frost pulse');
  assert.equal(B.game.stats.frostFullShieldPulses, 0, 'Duo must NOT fire Trio full-shield refresh pulse');

  // 3) Complete Trio synergy: strictly replaces Duo + triggers hit pulse, active dash pulse, and full-shield refresh pulse (all CD-capped)
  const fTrio = setupFrostScenario(['frost_chill', 'frost_ward', 'frost_nova_counter']);
  assert.equal(fTrio.syn.hasFrostTrio, true);
  assert.equal(fTrio.syn.hasFrostDuo, false, 'Complete Frost Trio must STRICTLY replace Duo');

  // 3a) Hit slowed enemy -> grants Trio shield (not Duo)
  B.dealDamage(fTrio.e1, 30, { fromHero: true, skillKey: 'nova' });
  assert.equal(B.game.stats.gearFrostTrioProcs, 1);
  assert.equal(B.game.stats.gearFrostDuoProcs, 0, 'Frost Trio must NEVER double-proc Duo');
  assert.ok(B.game.hero.shield > 0 && B.game.hero.frostShieldActive);

  // 3b) Shield hit -> fires hit frost pulse
  B.game.hero.invuln = 0;
  B.game.hero.frostPulseCd = 0;
  B.damageHero(8);
  assert.equal(B.game.stats.frostHitPulses, 1, 'Trio frost shield hit must trigger shield_hit frost pulse');

  // 3c) Active dodge dash while frost shield is still up -> fires active dash frost pulse
  B.game.hero.dashCd = 0;
  B.game.hero.frostActivePulseCd = 0;
  B.game.hero.shield = 40;
  B.game.hero.frostShieldActive = true;
  // Place enemy near dash landing position
  B.spawnEnemy('brute', 'east', 60, { x: B.game.hero.x + 3.8, y: B.game.hero.y });
  B.castHeroDash();
  assert.equal(B.game.stats.frostDashPulses, 1, 'Active dash while holding frost shield must trigger dash_shield frost pulse');
  // Immediate second dash during activePulseCd must be cooldown-capped
  B.game.hero.dashCd = 0;
  B.castHeroDash();
  assert.equal(B.game.stats.frostDashPulses, 1, 'Active dash frost pulse must respect internal cooldown cap');

  // 3d) Full-shield refresh when cooldown ready -> fires full_shield_refresh frost pulse
  B.game.hero.frostActivePulseCd = 0;
  const maxS = B.getHeroMaxFrostShield();
  B.game.hero.shield = maxS;
  B.game.hero.frostShieldActive = true;
  B.gainFrostShield(20, { duration: 5.0, maxShield: maxS, source: 'refresh_test' });
  assert.equal(B.game.stats.frostFullShieldPulses, 1, 'Full-shield refresh must trigger full_shield_refresh frost pulse');

  // 4) Synergy stacking boundaries across 4 slots:
  // Two items with identical Fire Duo only activate Fire Duo ONCE globally; Fire Duo + Frost Duo coexist!
  const dup1 = B.createGearInstance('flame_fan', { slotsCount: 2, affixes: ['fire_brand', 'fire_burst'] });
  const dup2 = B.createGearInstance('burn_core', { slotsCount: 2, affixes: ['fire_brand', 'fire_burst'] });
  const fr1  = B.createGearInstance('frost_mirror', { slotsCount: 2, affixes: ['frost_chill', 'frost_ward'] });
  const evalBoth = B.evaluateEquipmentSynergies([dup1, dup2, fr1]);
  const fireDuos = evalBoth.active.filter(s => s.chain === 'fire_detonate');
  const frostDuos = evalBoth.active.filter(s => s.chain === 'frost_aegis');
  assert.equal(fireDuos.length, 1, 'Same-name synergy must only activate ONCE across multiple gear slots');
  assert.equal(frostDuos.length, 1, 'Different synergies (Fire + Frost) must coexist cleanly');
});

test('4. Equip/unequip/replace, cross-wave persistence, build preset export/reload consistency, clean restart, UI hints, and BG60.loadTestPreset tiers', () => {
  const { B, doc } = bootBG60();

  // Verify loadTestPreset equips real Stage 2 instances matching weak=single, standard=duo, strong=trio
  const fireWeak = B.loadTestPreset({ wave: 11, tier: 'weak', build: 'fire', seed: 2026 });
  assert.equal(fireWeak.hero.activeGearSynergies.length, 0);
  const fireStd = B.loadTestPreset({ wave: 11, tier: 'standard', build: 'fire', seed: 2026 });
  assert.equal(fireStd.hero.activeGearSynergies[0]?.id, 'fire_detonate_duo');
  const fireStrong = B.loadTestPreset({ wave: 11, tier: 'strong', build: 'fire', seed: 2026 });
  assert.equal(fireStrong.hero.activeGearSynergies[0]?.id, 'fire_detonate_trio');

  const frostStd = B.loadTestPreset({ wave: 11, tier: 'standard', build: 'frost', seed: 2026 });
  assert.equal(frostStd.hero.activeGearSynergies[0]?.id, 'frost_aegis_duo');
  const frostStrong = B.loadTestPreset({ wave: 11, tier: 'strong', build: 'frost', seed: 2026 });
  assert.equal(frostStrong.hero.activeGearSynergies[0]?.id, 'frost_aegis_trio');

  // Verify UI displays active synergy and "which affix upgrades to trio" hint on Duo build
  B.loadTestPreset({ wave: 11, tier: 'standard', build: 'fire', seed: 2026 });
  const leftHudHtml = doc.getElementById('leftHudBody').innerHTML;
  assert.ok(leftHudHtml.includes('焚标引爆'), 'Left HUD must show active Fire Duo synergy');
  assert.ok(leftHudHtml.includes('余烬连环'), 'Left HUD must show missing affix hint to upgrade to Fire Trio');

  // Verify unequip immediately clears synergy; re-equip restores it
  const uidBefore = B.game.hero.gear[0].uid;
  B.unequipGear(0);
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, false, 'Unequipping must immediately recalculate synergies');
  const bagIdx = B.game.bag.findIndex(g => g.uid === uidBefore);
  assert.ok(bagIdx >= 0);
  B.equipGearFromBag(bagIdx);
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, true, 'Re-equipping must immediately restore synergy');

  // Verify replaceEquippedGear swaps cleanly and updates synergy
  const trioItem = B.createGearInstance('burn_core', { sourceStage: 2, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'fire_chain'] });
  B.grantGear(trioItem);
  B.replaceEquippedGear(0, B.game.bag.length - 1);
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, true);
  assert.equal(B.getActiveGearAffixSynergies().hasFireDuo, false);

  // Verify cross-wave persistence (W11 -> W12)
  const gearUidSnap = B.game.hero.gear.map(g => `${g.uid}:${g.sourceStage}:${g.slotsCount}:${g.affixes.map(a => a.id).join('+')}`);
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  assert.equal(B.game.wave, 12);
  assert.deepEqual(
    B.game.hero.gear.map(g => `${g.uid}:${g.sourceStage}:${g.slotsCount}:${g.affixes.map(a => a.id).join('+')}`),
    gearUidSnap,
    'Gear instances, slots, sourceStage, and affixes must persist intact across waves'
  );
  assert.equal(B.getActiveGearAffixSynergies().hasFireTrio, true);

  // Export build preset -> startNewRun (must completely wipe old gear & synergies!) -> importBuildPreset (must restore exact state!)
  const exported = B.exportBuildPreset();
  B.startNewRun(999, false);
  assert.equal(B.game.hero.gear.length, 0, 'Fresh run must clear equipped gear');
  assert.equal(B.game.bag.length, 0, 'Fresh run must clear bag');
  assert.equal(B.getActiveGearAffixSynergies().active.length, 0, 'Fresh run must clear active synergies');

  const imp = B.importBuildPreset(exported);
  assert.equal(imp.ok, true);
  assert.equal(B.game.wave, exported.wave);
  assert.deepEqual(
    B.game.hero.gear.map(g => ({ uid: g.uid, baseKey: g.baseKey, slotsCount: g.slotsCount, sourceStage: g.sourceStage, affixes: g.affixes })),
    exported.hero.gear.map(g => ({ uid: g.uid, baseKey: g.baseKey, slotsCount: g.slotsCount, sourceStage: g.sourceStage, affixes: g.affixes }))
  );
  assert.deepEqual(imp.activeGearSynergies, exported.activeGearSynergies);
});

test('5. Economy, shop stage+same-element pricing with cap, slot-independent & anti-arbitrage sell/dismantle, normal material enhancement & 3★ seal specialization route', () => {
  const { B } = bootBG60();
  B.startNewRun(202605, false);
  B.closeModal();

  // 5a) Shop regularly offers real independent gear instances
  B.rollShop(true);
  const gearOffer = B.game.shop.find(x => x.itemType === 'gear');
  assert.ok(gearOffer && B.isGearInstance(gearOffer.gear), 'Shop must offer independent gear instances');
  assert.equal(gearOffer.gear.affixes.length, gearOffer.gear.slotsCount);

  // 5b) Shop pricing escalates by stage AND same-element purchase count, and respects price cap
  const pStage1 = B.calcShopGearPrice('rare', 'fire', 5);
  const pStage2 = B.calcShopGearPrice('rare', 'fire', 15);
  const pStage3 = B.calcShopGearPrice('rare', 'fire', 25);
  assert.ok(pStage2 > pStage1 && pStage3 > pStage2, `Expected stage price escalation: ${pStage1} < ${pStage2} < ${pStage3}`);

  B.game.shopElemBuyCounts.fire = 0;
  const pBuy0 = B.calcShopGearPrice('rare', 'fire', 5);
  B.game.shopElemBuyCounts.fire = 2;
  const pBuy2 = B.calcShopGearPrice('rare', 'fire', 5);
  B.game.shopElemBuyCounts.fire = 50;
  const pBuy50 = B.calcShopGearPrice('rare', 'fire', 5);
  const rareCap = B.BALANCE.equipment.shopPricing.priceCapByRarity.rare;
  assert.ok(pBuy2 > pBuy0, 'Same-element repeat purchases must escalate price');
  assert.equal(pBuy50, rareCap, 'Escalating price must be bounded by configured cap');

  // Verify sameElemResetByStage configurable parameter
  const origReset = B.BALANCE.equipment.shopPricing.sameElemResetByStage;
  try {
    B.BALANCE.equipment.shopPricing.sameElemResetByStage = true;
    B.game.shopElemBuyStage = 1;
    B.game.shopElemBuyCounts.fire = 4;
    B.game.wave = 12; // Stage 2
    assert.equal(B.getShopElemBuyCount('fire'), 0, 'When sameElemResetByStage=true, stage change resets element count');
  } finally {
    B.BALANCE.equipment.shopPricing.sameElemResetByStage = origReset;
  }

  // 5c) Sell gold & dismantle materials depend STRICTLY on rarity + sourceStage, COMPLETELY independent of 1/2/3 slots
  const s1 = B.createGearInstance('flame_fan', { rarity: 'epic', sourceStage: 1, slotsCount: 1, affixes: ['fire_brand'] });
  const s2 = B.createGearInstance('flame_fan', { rarity: 'epic', sourceStage: 1, slotsCount: 2, affixes: ['fire_brand', 'fire_burst'] });
  const s3 = B.createGearInstance('flame_fan', { rarity: 'epic', sourceStage: 1, slotsCount: 3, affixes: ['fire_brand', 'fire_burst', 'fire_chain'] });
  assert.equal(B.getGearSellGold(s1), B.getGearSellGold(s2));
  assert.equal(B.getGearSellGold(s2), B.getGearSellGold(s3), 'Sell gold must be 100% independent of 1/2/3 slots');
  assert.equal(B.getGearDismantleMaterials(s1), B.getGearDismantleMaterials(s2));
  assert.equal(B.getGearDismantleMaterials(s2), B.getGearDismantleMaterials(s3), 'Dismantle materials must be 100% independent of 1/2/3 slots');

  // Higher sourceStage yields higher recycle value than lower sourceStage
  const stage3Epic = B.createGearInstance('flame_fan', { rarity: 'epic', sourceStage: 3, slotsCount: 1, affixes: ['fire_brand'] });
  assert.ok(B.getGearSellGold(stage3Epic) > B.getGearSellGold(s1));
  assert.ok(B.getGearDismantleMaterials(stage3Epic) > B.getGearDismantleMaterials(s1));

  // 5d) Anti-arbitrage #1: Low-wave gear hoarded into high wave NEVER appreciates in recycle value!
  B.game.wave = 2;
  const hoarded = B.createGearInstance('flame_fan', { wave: 2, rarity: 'rare', slotsCount: 2 });
  const sellAtW2 = B.getGearSellGold(hoarded);
  const disAtW2 = B.getGearDismantleMaterials(hoarded);
  B.game.wave = 28; // Advance to Stage 3 wave
  assert.equal(B.getGearSellGold(hoarded), sellAtW2, 'Hoarded Stage 1 gear must NOT appreciate in sell gold at W28');
  assert.equal(B.getGearDismantleMaterials(hoarded), disAtW2, 'Hoarded Stage 1 gear must NOT appreciate in dismantle materials at W28');

  // 5e) Anti-arbitrage #2: Buying from shop and immediately selling NEVER profits!
  B.game.wave = 5;
  B.game.gold = 500;
  B.rollShop(true);
  const offerIdx = B.game.shop.findIndex(x => x.itemType === 'gear');
  assert.ok(offerIdx >= 0);
  const buyCost = B.game.shop[offerIdx].cost;
  const goldBeforeBuy = B.game.gold;
  assert.equal(B.buyShopItem(offerIdx), true);
  const boughtIdx = B.game.bag.length - 1;
  const boughtInst = B.game.bag[boughtIdx];
  assert.equal(boughtInst.paidGold, buyCost);
  const sellPrice = B.getGearSellGold(boughtInst);
  assert.ok(sellPrice < buyCost, `Shop gear sell price (${sellPrice}) must be strictly < paidGold (${buyCost})`);
  B.sellBagGear(boughtIdx);
  assert.ok(B.game.gold < goldBeforeBuy, 'Buy -> immediate sell loop must strictly lose gold');

  // Dismantle bag gear grants normal materials
  const matGear = B.createGearInstance('frost_mirror', { rarity: 'rare', sourceStage: 2, slotsCount: 1 });
  B.grantGear(matGear);
  const matsBefore = B.game.materials;
  const expectedMats = B.getGearDismantleMaterials(matGear);
  assert.equal(B.dismantleBagGear(B.game.bag.length - 1), true);
  assert.equal(B.game.materials, matsBefore + expectedMats);

  // 5f) Normal material enhancement: raises enhanceLv (base stat + affix numeric tier) while STRICTLY preserving rarity, sourceStage, slotsCount, and affix IDs!
  const enhItem = B.createGearInstance('burn_core', { rarity: 'epic', sourceStage: 1, slotsCount: 2, affixes: ['fire_brand', 'fire_burst'] });
  B.game.hero.gear = [enhItem];
  B.recomputeEquipmentSynergies();
  const statsBefore = B.getHeroStats();
  const snapBefore = {
    rarity: enhItem.rarity,
    sourceStage: enhItem.sourceStage,
    slotsCount: enhItem.slotsCount,
    affixIds: enhItem.affixes.map(a => a.id),
    tier0: enhItem.affixes[0].tier
  };
  B.game.materials = 20;
  const enhCost = B.getGearEnhanceCost(enhItem);
  const enhRes = B.enhanceGear({ location: 'equipped', idx: 0 });
  assert.equal(enhRes.ok, true);
  assert.equal(enhItem.enhanceLv, 1);
  assert.equal(B.game.materials, 20 - enhCost);
  assert.equal(enhItem.rarity, snapBefore.rarity, 'Material enhance must NOT change rarity');
  assert.equal(enhItem.sourceStage, snapBefore.sourceStage, 'Material enhance must NOT change sourceStage');
  assert.equal(enhItem.slotsCount, snapBefore.slotsCount, 'Material enhance must NOT change slotsCount');
  assert.deepEqual(enhItem.affixes.map(a => a.id), snapBefore.affixIds, 'Material enhance must NOT reroll or change affix IDs');
  assert.ok(enhItem.affixes[0].tier > snapBefore.tier0, 'Material enhance must raise existing affix numeric tier');
  const statsAfter = B.getHeroStats();
  assert.ok(statsAfter.dmgMult > statsBefore.dmgMult, 'Material enhance must increase base gear stats');
  assert.ok(statsAfter.gm.fireDetonateBonus > statsBefore.gm.fireDetonateBonus, 'Material enhance must increase affix numeric values');

  // 5g) Same-element 3★ Main Seal specialization route choice (free standard vs 35g mastery tradeoff)
  B.game.wave = 11;
  B.game.seal = { kind: 'fire', elem: 'fire', star: 3, prog: 0, route: null, cd: 0, dmgDealt: 0, kills: 0 };
  B.game.gold = 10; // Not enough for 35g mastery route
  const failMastery = B.chooseSealRoute('mastery');
  assert.equal(failMastery.ok, false);
  assert.equal(failMastery.reason, 'insufficient_gold');

  B.game.gold = 100;
  const stBeforeRoute = B.getSealStats(B.game.seal);
  const okMastery = B.chooseSealRoute('mastery');
  assert.equal(okMastery.ok, true);
  assert.equal(B.game.seal.route, 'mastery');
  assert.equal(B.game.gold, 100 - B.SEAL_SPECIALIZATIONS.fire.mastery.cost);
  const stAfterMastery = B.getSealStats(B.game.seal);
  assert.ok(stAfterMastery.splash > stBeforeRoute.splash, 'Fire 3★ mastery route must enlarge blast/lava radius');
  // Cannot choose twice
  assert.equal(B.chooseSealRoute('standard').ok, false);
});
