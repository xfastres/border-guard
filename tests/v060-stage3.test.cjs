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

test('1. W16-W20 preselection, W19 fair W20 Boss intel & combat execution, W20 lock-in, and W20 defeat immediate settlement', () => {
  const { B, doc } = bootBG60();
  assert.equal(B.version, '0.60.0-stage3');

  // W15 prep: preselection NOT open yet, W20 Boss intel NOT revealed yet
  B.loadTestPreset({ wave: 15, tier: 'standard', build: 'fire', seed: 2026 });
  assert.equal(B.isW20PreselectOpen(), false, 'Preselection must be closed at W15');
  assert.equal(B.selectW20PreselectDirection('fire_chain_surge').ok, false);
  assert.equal(B.getW20BossIntel().revealed, false, 'W20 Boss intel must not be revealed before W19');

  // Clear W15 -> W16 prep: preselection opens!
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  assert.equal(B.game.wave, 16);
  assert.equal(B.isW20PreselectOpen(), true, 'Preselection must open at W16 prep');
  assert.equal(B.getW20BossIntel().revealed, false, 'W20 Boss intel still hidden at W16');

  // Freely switch across all 3 directions during W16-W19; NO combat effect active before W20 victory
  assert.equal(Object.keys(B.W20_DIRECTIONS).length >= 3, true);
  for (const dirKey of ['fire_chain_surge', 'frost_bastion_counter', 'breaker_momentum']) {
    const sel = B.selectW20PreselectDirection(dirKey);
    assert.equal(sel.ok, true);
    assert.equal(sel.preselectedDirection, dirKey);
    assert.equal(sel.baseEffectActive, false);
    assert.equal(B.getW20ActiveState().active, false, 'Preselected direction must NOT activate before W20 Boss kill');
    assert.equal(B.hasW20Direction(dirKey), false);
  }

  // Open preselect modal & verify explicit UI notice that effect activates only after W20 Boss voucher
  assert.equal(B.openW20PreselectModal(), true);
  const modalHtml16 = doc.getElementById('modalBox').innerHTML;
  assert.ok(modalHtml16.includes('击败 W20 首领拿到突破凭证后'), 'Preselect UI must clarify activation timing');
  B.closeModal();

  // Advance W18 -> W19 prep: W20 Boss intel MUST reveal fixed core + rolled fair auxiliary mechanic
  B.loadTestPreset({ wave: 18, tier: 'standard', build: 'fire', seed: 2026 });
  assert.equal(B.getW20BossIntel().revealed, false);
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  assert.equal(B.game.wave, 19);

  const intel = B.getW20BossIntel();
  assert.equal(intel.revealed, true, 'W19 prep must reveal W20 Boss intel');
  assert.ok(intel.coreName && intel.coreName.length > 0);
  assert.ok(intel.auxKey && intel.auxName && intel.auxDesc);
  const battleHudHtml = doc.getElementById('battleHudBody').innerHTML;
  assert.ok(battleHudHtml.includes(intel.auxName), 'Battle HUD must display revealed W20 aux mechanic at W19');

  // Verify fairness of entire W20 Boss aux pool (no hit-reflect, no melee ban, no elemental immunity)
  assert.ok(B.W20_BOSS_AUX_POOL.length >= 4);
  for (const aux of B.W20_BOSS_AUX_POOL) {
    const txt = `${aux.name} ${aux.desc}`;
    assert.equal(/反伤|禁近战|元素免疫|免疫火|免疫冰/.test(txt), false, `Aux mechanic ${aux.key} must remain fair`);
  }

  // Verify ALL 4 fair auxiliary mechanics genuinely execute in W20 Boss (boss4) combat
  for (const aux of B.W20_BOSS_AUX_POOL) {
    B.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire', seed: 2026 });
    B.game.bossIntel.w20AuxKey = aux.key;
    B.game.bossIntel.w20Aux = aux.name;
    B.startWave();
    B.game.waveQueue.forEach(q => { q.spawned = true; });
    B.game.enemies = [];
    const boss4 = B.spawnEnemy('boss4', 'west', 1, { x: B.game.hero.x + 3.2, y: B.game.hero.y });
    boss4.bossAuxTimer = 0.05;
    boss4.bossTimer = 99;
    B.tick(0.1);
    assert.ok(B.game.stats.w20BossAuxTriggers >= 1, `W20 Boss aux mechanic ${aux.key} must execute in combat`);
    if (aux.key === 'oppression_ring') {
      assert.ok(B.game.zones.some(z => z.kind === 'bossWave' && z.w20Aux === 'oppression_ring'));
    } else if (aux.key === 'shield_totem') {
      const tot = B.game.enemies.find(e => e.totem);
      assert.ok(tot, 'shield_totem aux must spawn a destroyable shield totem');
      boss4.shield = 400;
      B.dealDamage(tot, tot.hp + 999, { fromHero: true, skillKey: 'firewave' });
      assert.equal(B.game.stats.w20TotemsDestroyed, 1);
      assert.equal(boss4.shield, 0, 'Destroying shield totem must shatter Boss shield');
      assert.ok(boss4.vulnT > 0, 'Destroying shield totem must apply vulnerability to Boss');
    } else if (aux.key === 'chase_barrage') {
      B.tick(0.1);
      assert.ok(B.game.projectiles.some(p => p.kind === 'enemyShot' && p.w20Aux === 'chase_barrage'));
    } else if (aux.key === 'charged_shockwave') {
      assert.ok(B.game.zones.filter(z => z.kind === 'bossSlam' && z.w20Aux === 'charged_shockwave').length >= 4);
    }
  }

  // W20 start without preselected direction must prompt & block start; once selected, startWave locks direction!
  B.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire', seed: 2026 });
  B.game.w20State.preselectedDirection = null;
  assert.equal(B.startWave(), false, 'Starting W20 without preselected direction must open selection prompt');
  assert.equal(B.game.activeModal?.type, 'w20_preselect');
  assert.equal(B.game.activeModal?.requireConfirmStart, true);
  B.selectW20PreselectDirection('frost_bastion_counter');
  B.closeModal();

  assert.equal(B.startWave(), true);
  assert.equal(B.game.w20State.locked, true, 'Starting W20 must lock the selected direction');
  assert.equal(B.game.w20State.lockedDirection, 'frost_bastion_counter');
  assert.equal(B.hasW20Direction('frost_bastion_counter'), false, 'Locked direction must remain INACTIVE during W20 Boss fight');
  assert.equal(B.selectW20PreselectDirection('fire_chain_surge').ok, false, 'Cannot change direction after W20 lock-in');

  // W20 defeat -> immediate settlement (no retry!)
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(B.game.hero.hp + 99999);
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, false);
});

test('2. W20 victory voucher guarantee (0 materials), paid full-group reroll (4->6->8->10), zero adjacent overlap & >= 2K+2 capacity redline', () => {
  const { B, doc } = bootBG60();
  const cfg = B.BALANCE.w20Breakthrough;
  const K = cfg.groupSize;
  const minRequired = 2 * K + 2;
  assert.equal(K, 2);
  assert.equal(cfg.rerollBaseCost, 4);
  assert.equal(cfg.rerollStep, 2);

  // Check >= 2K+2 valid candidate pool for EVERY locked direction
  for (const dirKey of Object.keys(B.W20_DIRECTIONS)) {
    const validPool = B.getValidW20EnhancementPool(dirKey);
    assert.ok(
      validPool.length >= minRequired,
      `Direction ${dirKey} valid enhancement pool (${validPool.length}) must be >= 2K+2 (${minRequired})`
    );
  }

  // Case A: Zero materials (materials = 0) -> voucher + base direction effect IMMEDIATELY active, can pick card for free!
  B.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire', materials: 0, gold: 350, seed: 2026 });
  B.selectW20PreselectDirection('fire_chain_surge');
  assert.equal(B.startWave(), true);
  B.completeWaveClear();

  assert.equal(B.game.wave, 21);
  assert.equal(B.game.hero.vouchers.w20, true, 'W20 victory must guarantee W20 Boss voucher');
  assert.equal(B.game.hero.breakthroughs.w20?.completed, true);
  assert.equal(B.game.hero.breakthroughs.w20?.placeholder, false);
  assert.equal(B.game.hero.breakthroughs.w20?.baseEffectActive, true, 'Base effect must activate IMMEDIATELY even at 0 materials');
  assert.equal(B.hasW20Direction('fire_chain_surge'), true);
  assert.equal(B.game.pendingBreakthrough, 'w20');
  assert.equal(B.game.w20Draft?.candidates.length, K);

  // Reroll attempt at 0 materials must fail without changing candidates
  const initCands0 = B.game.w20Draft.candidates.slice();
  const failReroll0 = B.rerollW20Enhancements();
  assert.equal(failReroll0.ok, false);
  assert.equal(failReroll0.reason, 'insufficient_materials');
  assert.equal(B.game.materials, 0);
  assert.deepEqual(B.game.w20Draft.candidates, initCands0);

  // Pick from first group at 0 materials -> completes W20 breakthrough cleanly & enters W21
  const pick0 = B.pickW20Enhancement(initCands0[0]);
  assert.equal(pick0.ok, true);
  assert.equal(B.game.pendingBreakthrough, null);
  assert.equal(B.hasW20Enhancement(initCands0[0]), true);

  // Case B: Materials enough for EXACTLY 1 reroll (materials = 4)
  B.loadTestPreset({ wave: 20, tier: 'standard', build: 'frost', materials: 4, gold: 350, seed: 2026 });
  B.selectW20PreselectDirection('frost_bastion_counter');
  B.startWave();
  B.completeWaveClear();
  const group0 = B.game.w20Draft.candidates.slice();
  const r1 = B.rerollW20Enhancements();
  assert.equal(r1.ok, true);
  assert.equal(r1.costPaid, 4);
  assert.equal(r1.materialsLeft, 0);
  assert.equal(r1.nextRerollCost, 6);
  const group1 = B.game.w20Draft.candidates.slice();
  assert.equal(group1.length, K);
  for (const id of group1) {
    assert.equal(group0.includes(id), false, `Adjacent reroll groups must share 0 cards (overlap: ${id})`);
  }
  assert.ok(doc.getElementById('modalBox').innerHTML.includes('消耗 6 锻材'), 'UI must clearly show next reroll price');
  const r2Fail = B.rerollW20Enhancements();
  assert.equal(r2Fail.ok, false);
  assert.equal(r2Fail.reason, 'insufficient_materials');

  // Case C: Materials enough for multiple consecutive rerolls (4 -> 6 -> 8 -> 10 -> 12 -> 14)
  // Verify exact price escalation, 0 overlap between every adjacent pair, AND >= 3 distinct card groups!
  B.loadTestPreset({ wave: 20, tier: 'strong', build: 'fire', materials: 60, gold: 400, seed: 202603 });
  B.selectW20PreselectDirection('fire_chain_surge');
  B.startWave();
  B.completeWaveClear();

  const expectedCosts = [4, 6, 8, 10, 12];
  const seenSignatures = new Set([B.game.w20Draft.candidates.slice().sort().join('+')]);
  let prevGroup = B.game.w20Draft.candidates.slice();
  let expectedMats = 60;

  for (const expCost of expectedCosts) {
    const res = B.rerollW20Enhancements();
    assert.equal(res.ok, true, `Reroll at cost ${expCost} must succeed`);
    assert.equal(res.costPaid, expCost);
    expectedMats -= expCost;
    assert.equal(B.game.materials, expectedMats);
    const curGroup = B.game.w20Draft.candidates.slice();
    assert.equal(curGroup.length, K);
    assert.equal(new Set(curGroup).size, K, 'Cards within same group must be distinct');
    for (const id of curGroup) {
      assert.equal(prevGroup.includes(id), false, `Adjacent groups must never repeat card ${id}`);
    }
    seenSignatures.add(curGroup.slice().sort().join('+'));
    prevGroup = curGroup;
  }
  assert.ok(seenSignatures.size >= 3, `Consecutive rerolls must yield >= 3 distinct card groups, got ${seenSignatures.size}`);

  // Case D: Pool capacity under-config safety guard (< 2K+2) refuses deduction and preserves candidates & balance
  const origGroupSize = B.BALANCE.w20Breakthrough.groupSize;
  const matsBeforeGuard = B.game.materials;
  const candsBeforeGuard = B.game.w20Draft.candidates.slice();
  try {
    B.game.w20Draft.groupSize = 4; // requires 2*4+2 = 10 > 8 valid cards
    const guardRes = B.rerollW20Enhancements();
    assert.equal(guardRes.ok, false);
    assert.equal(guardRes.reason, 'insufficient_pool');
    assert.equal(B.game.materials, matsBeforeGuard, 'Insufficient pool must NEVER deduct materials');
    assert.deepEqual(B.game.w20Draft.candidates, candsBeforeGuard, 'Insufficient pool must preserve existing candidates');
  } finally {
    B.BALANCE.w20Breakthrough.groupSize = origGroupSize;
    B.game.w20Draft.groupSize = K;
  }
});

test('3. Cross-stage combat behavior comparison (W10 -> common 1-2 slot gear -> W20 0-mat Base -> W20 Enhancement) for Fire & Frost across W21 + W22-W28, isolated Boss & active dodge', () => {
  const { B } = bootBG60();

  // ---- FIRE CHAIN: W10 (fw_brand_pierce) + common 2-slot Fire Duo gear -> W20 Base vs W20 Enhancement ----
  function runFireComparison(stageMode, targetWave, encounterMode) {
    // stageMode: 'pre_w20' | 'w20_base_only' | 'w20_supernova' | 'w20_isolated_exec'
    B.loadTestPreset({ wave: targetWave, tier: 'standard', build: 'fire', materials: 0, gold: 320, seed: 2026 });
    // Common 2-slot Fire Duo gear ONLY (no 3-slot Trio gear!) to prove 1-2 slot players see W10 + Gear + W20 synergy!
    B.game.hero.gear = [
      B.createGearInstance('flame_fan', { sourceStage: 2, slotsCount: 2, affixes: ['fire_brand', 'fire_burst'], enhanceLv: 1 })
    ];
    B.game.seal = null;
    B.game.subSeals = [];
    B.game.hero.perks = {};
    B.game.hero.skills = { firewave: 4, blades: 0, thunder: 0, nova: 0, stomp: 0, berserk: 0 };
    B.game.hero.w10Branch = { firewave: 'fw_brand_pierce' };
    B.recomputeEquipmentSynergies();

    if (stageMode === 'pre_w20') {
      B.game.hero.vouchers.w20 = false;
      B.game.hero.breakthroughs.w20 = null;
      B.game.w20State = { preselectedDirection: 'fire_chain_surge', lockedDirection: null, locked: false, lockedAtWave: null };
    } else {
      B.game.hero.vouchers.w20 = true;
      B.game.w20State = { preselectedDirection: 'fire_chain_surge', lockedDirection: 'fire_chain_surge', locked: true, lockedAtWave: 20 };
      const enhKey = stageMode === 'w20_supernova' ? 'w20_fire_supernova_chain'
        : stageMode === 'w20_isolated_exec' ? 'w20_fire_isolated_exec' : null;
      B.game.hero.breakthroughs.w20 = {
        wave: 20, completed: true, placeholder: false,
        directionKey: 'fire_chain_surge', directionName: '聚焰连爆', baseEffectActive: true,
        enhancementKey: enhKey, enhancementName: enhKey ? B.W20_ENHANCEMENTS[enhKey].name : null
      };
    }

    B.startWave();
    B.game.waveQueue.forEach(q => { q.spawned = true; });
    B.game.enemies = [];

    const hx = B.game.hero.x, hy = B.game.hero.y;
    const spawned = [];
    if (encounterMode === 'group') {
      // 4 clustered marked brutes spaced 1.8 tiles apart (within W20 pull & chain range)
      for (let i = 0; i < 4; i++) {
        const e = B.spawnEnemy('brute', 'east', 120, { x: hx + 1.8 + i * 1.1, y: hy + (i % 2 ? 0.5 : -0.5) });
        B.applyFireMark(e, 1, 'w10_fw_brand_pierce', 6.0);
        spawned.push(e);
      }
    } else {
      // Single isolated Elite/Boss with NO neighbors anywhere nearby
      const boss = B.spawnEnemy('boss4', 'east', 1, { x: hx + 2.4, y: hy });
      B.applyFireMark(boss, 1, 'w10_fw_brand_pierce', 6.0);
      spawned.push(boss);
    }

    const startHp = spawned.reduce((s, e) => s + e.hp, 0);
    // Clean hero firewave hit to trigger Gear Duo detonation + W20 chain/focus hooks
    B.dealDamage(spawned[0], 55, { fromHero: true, skillKey: 'firewave', burn: 12 });
    const endHp = spawned.reduce((s, e) => s + Math.max(0, e.hp), 0);
    const lavaZones = B.game.zones.filter(z => z.kind === 'lava' && z.w20Source === 'w20_fire_supernova_chain').length;

    return {
      totalDmg: startHp - endHp,
      detonations: B.game.stats.fireDetonations,
      transfers: B.game.stats.fireChainTransfers,
      focused: B.game.stats.fireFocusedDetonations,
      pulls: B.game.stats.w20FirePulls,
      w20Base: B.game.stats.w20BaseProcs,
      w20Enh: B.game.stats.w20EnhancementProcs,
      lavaZones,
      targetVulnT: spawned[0].vulnT || 0
    };
  }

  // Test Fire on W21 + two representative W22-W28 waves (W23 & W26)
  for (const w of [21, 23, 26]) {
    const fPre  = runFireComparison('pre_w20', w, 'group');
    const fBase = runFireComparison('w20_base_only', w, 'group');
    const fEnh  = runFireComparison('w20_supernova', w, 'group');

    assert.equal(fPre.pulls, 0, `W${w} Pre-W20 Fire must have 0 W20 pulls`);
    assert.equal(fPre.transfers, 0, `W${w} Pre-W20 2-slot Fire Duo must have 0 chain transfers`);
    assert.ok(fBase.w20Base >= 1 && fBase.pulls >= 1 && fBase.transfers >= 1, `W${w} W20 0-mat Base must pull mobs and chain-transfer even with 2-slot gear`);
    assert.ok(fBase.totalDmg > fPre.totalDmg, `W${w} W20 Base must deal more group damage than Pre-W20`);
    assert.ok(fEnh.transfers > fBase.transfers, `W${w} W20 Supernova enhancement must increase chain transfers (${fEnh.transfers} > ${fBase.transfers})`);
    assert.ok(fEnh.lavaZones >= 1 && fEnh.w20Enh >= 1, `W${w} W20 Supernova must leave lava zones at transfer sites`);
    assert.ok(fEnh.totalDmg > fBase.totalDmg, `W${w} W20 Supernova must deal more total damage than Base`);
  }

  // Isolated Boss/Elite Fire comparison (no transferable neighbors)
  const isoPre  = runFireComparison('pre_w20', 21, 'isolated');
  const isoBase = runFireComparison('w20_base_only', 21, 'isolated');
  const isoEnh  = runFireComparison('w20_isolated_exec', 21, 'isolated');
  assert.equal(isoPre.focused, 0);
  assert.equal(isoBase.focused, 1, 'W20 Base must convert unused chain into isolated focused detonation');
  assert.ok(isoBase.totalDmg > isoPre.totalDmg);
  assert.equal(isoEnh.focused, 1);
  assert.ok(isoEnh.w20Enh >= 1 && isoEnh.targetVulnT >= 3.0, 'w20_fire_isolated_exec must apply vulnerability & double burst on isolated Boss');
  assert.ok(isoEnh.totalDmg > isoBase.totalDmg, 'w20_fire_isolated_exec must outperform Base on isolated Boss');

  // ---- FROST CHAIN: W10 (nv_seeking_vortex) + common 2-slot Frost Duo gear -> W20 Base vs W20 Enhancement ----
  function runFrostComparison(stageMode, targetWave) {
    // stageMode: 'pre_w20' | 'w20_base_only' | 'w20_dash_ring' | 'w20_overflow_nova'
    B.loadTestPreset({ wave: targetWave, tier: 'standard', build: 'frost', materials: 0, gold: 320, seed: 2026 });
    // Common 2-slot Frost Duo gear ONLY (no 3-slot Trio gear!)
    B.game.hero.gear = [
      B.createGearInstance('frost_mirror', { sourceStage: 2, slotsCount: 2, affixes: ['frost_chill', 'frost_ward'], enhanceLv: 1 })
    ];
    B.game.seal = null;
    B.game.subSeals = [];
    B.game.hero.perks = {};
    B.game.hero.skills = { nova: 4, blades: 0, thunder: 0, firewave: 0, stomp: 0, berserk: 0 };
    B.game.hero.w10Branch = { nova: 'nv_seeking_vortex' };
    B.recomputeEquipmentSynergies();

    if (stageMode === 'pre_w20') {
      B.game.hero.vouchers.w20 = false;
      B.game.hero.breakthroughs.w20 = null;
      B.game.w20State = { preselectedDirection: 'frost_bastion_counter', lockedDirection: null, locked: false, lockedAtWave: null };
    } else {
      B.game.hero.vouchers.w20 = true;
      B.game.w20State = { preselectedDirection: 'frost_bastion_counter', lockedDirection: 'frost_bastion_counter', locked: true, lockedAtWave: 20 };
      const enhKey = stageMode === 'w20_dash_ring' ? 'w20_frost_dash_ring'
        : stageMode === 'w20_overflow_nova' ? 'w20_frost_overflow_nova' : null;
      B.game.hero.breakthroughs.w20 = {
        wave: 20, completed: true, placeholder: false,
        directionKey: 'frost_bastion_counter', directionName: '凛冬反制', baseEffectActive: true,
        enhancementKey: enhKey, enhancementName: enhKey ? B.W20_ENHANCEMENTS[enhKey].name : null
      };
    }

    B.startWave();
    B.game.waveQueue.forEach(q => { q.spawned = true; });
    B.game.enemies = [];
    const e1 = B.spawnEnemy('brute', 'east', 120, { x: B.game.hero.x + 2.0, y: B.game.hero.y });
    const eLanding = B.spawnEnemy('brute', 'east', 120, { x: B.game.hero.x + 3.8, y: B.game.hero.y });
    B.applyFrostSlow(e1, 0.55, 5.0, 'w10_nv_seeking_vortex');
    B.applyFrostSlow(eLanding, 0.55, 5.0, 'w10_nv_seeking_vortex');

    const shieldCap = B.getHeroMaxFrostShield();
    // 1. Hit slowed enemy -> 2-slot Frost Duo grants Frost Shield
    B.dealDamage(e1, 35, { fromHero: true, skillKey: 'nova' });
    // 2. Active dodge (NO hit taken): Dash while holding Frost Shield!
    B.game.hero.dashCd = 0;
    B.game.hero.frostActivePulseCd = 0;
    B.castHeroDash();
    const dashActiveCdAfter = B.game.hero.frostActivePulseCd;
    const frostTrailZones = B.game.zones.filter(z => z.kind === 'frostTrail' && z.w20Source === 'w20_frost_dash_ring').length;

    // 3. Shield hit test
    B.game.hero.invuln = 0;
    B.game.hero.frostPulseCd = 0;
    B.game.hero.shield = 50;
    B.game.hero.frostShieldActive = true;
    B.damageHero(10);

    // 4. Full-shield refresh test (no hit taken)
    B.game.hero.frostActivePulseCd = 0;
    B.game.hero.shield = shieldCap;
    B.game.hero.frostShieldActive = true;
    const projBeforeFull = B.game.projectiles.length;
    B.gainFrostShield(25, { duration: 5.0, maxShield: shieldCap, source: 'refresh_check' });
    const overflowLances = B.game.projectiles.length - projBeforeFull;

    return {
      shieldCap,
      dashPulses: B.game.stats.frostDashPulses,
      hitPulses: B.game.stats.frostHitPulses,
      fullShieldPulses: B.game.stats.frostFullShieldPulses,
      dashActiveCdAfter,
      frostTrailZones,
      overflowLances,
      w20Base: B.game.stats.w20BaseProcs,
      w20Enh: B.game.stats.w20EnhancementProcs
    };
  }

  for (const w of [21, 24, 27]) {
    const frPre  = runFrostComparison('pre_w20', w);
    const frBase = runFrostComparison('w20_base_only', w);
    const frDash = runFrostComparison('w20_dash_ring', w);
    const frOver = runFrostComparison('w20_overflow_nova', w);

    assert.equal(frPre.dashPulses, 0, `W${w} Pre-W20 2-slot Frost Duo must have 0 dash frost pulses`);
    assert.equal(frPre.hitPulses, 0, `W${w} Pre-W20 2-slot Frost Duo must have 0 hit frost pulses`);
    assert.ok(frBase.shieldCap > frPre.shieldCap, `W${w} W20 Frost Base must raise shield cap (${frBase.shieldCap} > ${frPre.shieldCap})`);
    assert.equal(frBase.dashPulses, 1, `W${w} W20 Frost Base must unlock active dodge dash Frost Pulse even on 2-slot gear`);
    assert.equal(frBase.hitPulses, 1, `W${w} W20 Frost Base must unlock shield-hit Frost Pulse even on 2-slot gear`);
    assert.ok(frBase.w20Base >= 2);

    assert.equal(frDash.dashActiveCdAfter, 0.75, `W${w} w20_frost_dash_ring must lower active dash pulse CD to 0.75s`);
    assert.equal(frDash.frostTrailZones, 1, `W${w} w20_frost_dash_ring must leave a frostTrail zone at dash landing`);
    assert.ok(frDash.w20Enh >= 1);

    assert.equal(frOver.fullShieldPulses, 1, `W${w} w20_frost_overflow_nova must unlock full-shield refresh pulse on 2-slot gear`);
    assert.ok(frOver.overflowLances >= 6, `W${w} w20_frost_overflow_nova must fire 6 frost lances on full-shield refresh`);
  }
});

test('4. W22-W24 shared-threat combination escalation, W25-W28 independent spoiler-free draws & multi-seed variance, and W28 endgame omen', () => {
  const { B, doc } = bootBG60();

  // W22-W24: same primaryThreat across all 3 waves, escalating combo pressure 1 -> 2 -> 3
  B.loadTestPreset({ wave: 22, tier: 'standard', build: 'fire', seed: 202604 });
  const info22 = B.getWaveEncounterInfo(22);
  const info23 = B.getWaveEncounterInfo(23);
  const info24 = B.getWaveEncounterInfo(24);
  assert.equal(info22.type, 'w22_24_shared_threat');
  assert.equal(info22.primaryThreat, info23.primaryThreat, 'W22 and W23 must share the same primaryThreat');
  assert.equal(info23.primaryThreat, info24.primaryThreat, 'W23 and W24 must share the same primaryThreat');
  assert.equal(info22.pressureLevel, 1);
  assert.equal(info23.pressureLevel, 2);
  assert.equal(info24.pressureLevel, 3);
  assert.notEqual(info22.comboLabel, info23.comboLabel);
  assert.notEqual(info23.comboLabel, info24.comboLabel);

  // Verify W22->W24 actual spawned queues differ in enemy composition (combination escalation!)
  const q22 = B.buildWaveQueue(22);
  const q24 = B.buildWaveQueue(24);
  const ratioOf = (q, kind) => q.filter(x => x.kind === kind).length / Math.max(1, q.length);
  const theme = B.getW22To24Theme();
  assert.ok(theme && Object.keys(theme.waves).length === 3);
  assert.ok(q22.length > 40 && q24.length > 40);
  // W24 introduces/elevates higher-tier pressure units (shaman/bomber/wolf/brute) compared to W22 slimes
  assert.ok(ratioOf(q22, 'slime') > ratioOf(q24, 'slime'), 'W24 combination must replace W22 slime fodder with higher-pressure combos');

  // W25-W28: Each wave pool has >= 3 distinct rosters; ZERO pre-wave spoilers in prep UI!
  const allW25To28Names = [];
  for (const w of [25, 26, 27, 28]) {
    const pool = B.getW25To28Pool(w);
    assert.ok(pool.length >= 3, `W${w} must have >= 3 candidate enemy groups, got ${pool.length}`);
    for (const item of pool) allW25To28Names.push(item.name);
  }

  for (const w of [25, 26, 27, 28]) {
    B.loadTestPreset({ wave: w, tier: 'standard', build: 'frost', seed: 2026 + w });
    const prepInfo = B.getWaveEncounterInfo(w);
    assert.equal(prepInfo.revealed, false, `W${w} prep must NOT reveal random normal enemy group`);
    const prepUiText = [
      doc.getElementById('battleHudBody').innerHTML,
      doc.getElementById('leftHudBody').innerHTML,
      doc.getElementById('wavePill').textContent,
      doc.getElementById('waveBtnSb').textContent
    ].join(' ');
    for (const secretName of allW25To28Names) {
      assert.equal(prepUiText.includes(secretName), false, `W${w} prep UI must NOT spoil secret roster "${secretName}"`);
    }

    // Start wave -> independently draws and reveals AFTER wave starts!
    assert.equal(B.startWave(), true);
    const liveInfo = B.getWaveEncounterInfo(w);
    assert.equal(liveInfo.revealed, true, `W${w} must reveal drawn encounter once battle starts`);
    assert.ok(liveInfo.id && liveInfo.name);
    if (w === 25) {
      assert.ok(B.game.waveQueue.some(q => q.kind === 'boss5'), 'W25 must still spawn boss5 alongside random normal group');
    }
  }

  // Multi-seed variance check: across 24 seeds, every wave W25-W28 draws multiple distinct rosters AND adjacent waves can share primaryThreat
  let sawAdjacentSameThreat = false;
  const seenByWave = { 25: new Set(), 26: new Set(), 27: new Set(), 28: new Set() };
  for (let s = 1; s <= 24; s++) {
    B.loadTestPreset({ wave: 25, tier: 'standard', build: 'fire', seed: 9000 + s * 37 });
    const threats = [];
    for (const w of [25, 26, 27, 28]) {
      B.game.wave = w;
      B.game.phase = 'prep';
      B.startWave();
      const info = B.getWaveEncounterInfo(w);
      seenByWave[w].add(info.id);
      threats.push(info.primaryThreat);
      B.game.phase = 'prep';
    }
    for (let i = 0; i < threats.length - 1; i++) {
      if (threats[i] === threats[i + 1]) sawAdjacentSameThreat = true;
    }
  }
  for (const w of [25, 26, 27, 28]) {
    assert.ok(seenByWave[w].size >= 2, `W${w} must sample multiple distinct enemy groups across seeds, got ${seenByWave[w].size}`);
  }
  assert.equal(sawAdjacentSameThreat, true, 'Adjacent waves in W25-W28 must be allowed to repeat primaryThreat');

  // W28 Endgame Omen check (start -> mid-wave -> clear into W29 prep)
  B.loadTestPreset({ wave: 28, tier: 'strong', build: 'fire', seed: 2026 });
  assert.equal(B.getEndgameOmenState().triggered, false);
  B.startWave();
  assert.equal(B.getEndgameOmenState().triggered, true, 'W28 start must trigger endgame omen');
  assert.ok(doc.getElementById('bannerTitle').textContent.includes('终局预兆'), 'W28 start banner must present endgame omen');

  // Advance clock past stormWarnAt -> mid-wave omen trigger
  B.game.waveClock = B.game.stormWarnAt;
  B.tick(0.1);
  assert.equal(B.getEndgameOmenState().midWaveTriggered, true, 'W28 mid-wave must trigger omen escalation');

  // Clear W28 -> omen clear trigger + W29 prep HUD badge
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  assert.equal(B.game.wave, 29);
  assert.equal(B.getEndgameOmenState().clearTriggered, true, 'W28 clear must mark omen clearTriggered');
  assert.ok(doc.getElementById('battleHudBody').innerHTML.includes('终局预兆'), 'W29 prep HUD must retain endgame omen cue');
});

test('5. Continuous W16->W28 run persistence, real W20 BG60.loadTestPreset data (no placeholder), and export/importBuildPreset roundtrip', () => {
  const { B } = bootBG60();

  // Verify loadTestPreset for W20 vs W21/W28/W29/W30
  const p20 = B.loadTestPreset({ wave: 20, tier: 'standard', build: 'fire', seed: 2026 });
  assert.equal(p20.hero.breakthroughs.w20, null);
  assert.equal(p20.w20State.preselectedDirection, 'fire_chain_surge');
  assert.equal(p20.w20State.locked, false);
  assert.equal(p20.bossIntel.revealed, true);

  for (const build of ['fire', 'frost']) {
    for (const w of [21, 25, 28, 29, 30]) {
      const p = B.loadTestPreset({ wave: w, tier: 'standard', build, seed: 2026 });
      assert.equal(p.hero.breakthroughs.w20.completed, true);
      assert.equal(p.hero.breakthroughs.w20.placeholder, false, `W${w} ${build} preset must replace Stage 1 placeholder with real W20 data`);
      assert.equal(p.hero.breakthroughs.w20.baseEffectActive, true);
      assert.ok(B.W20_DIRECTIONS[p.hero.breakthroughs.w20.directionKey]);
      assert.ok(B.W20_ENHANCEMENTS[p.hero.breakthroughs.w20.enhancementKey]);
      assert.equal(p.hero.vouchers.w20, true);
    }
  }

  // Continuous W16 -> W28 walkthrough with same 2-slot Fire build + reroll + persistence check
  B.loadTestPreset({ wave: 16, tier: 'standard', build: 'fire', materials: 14, gold: 300, seed: 202605 });
  const initialGearUid = B.game.hero.gear[0].uid;
  const initialW10Branch = B.game.hero.breakthroughs.w10.branchKey;
  B.selectW20PreselectDirection('fire_chain_surge');

  for (let w = 16; w <= 28; w++) {
    assert.equal(B.game.wave, w);
    assert.equal(B.startWave(), true, `Must be able to start W${w}`);
    B.completeWaveClear();
    // Handle W20 breakthrough modal after W20 victory
    if (w === 20) {
      assert.equal(B.game.hero.vouchers.w20, true);
      assert.equal(B.hasW20Direction('fire_chain_surge'), true);
      const rr = B.rerollW20Enhancements();
      assert.equal(rr.ok, true);
      const chosen = B.game.w20Draft.candidates[0];
      assert.equal(B.pickW20Enhancement(chosen).ok, true);
    }
    while (B.game.activeModal) B.closeModal();
  }

  assert.equal(B.game.wave, 29, 'After clearing W28, run must stand cleanly at W29 prep');
  assert.equal(B.game.hero.gear[0].uid, initialGearUid, 'Gear instance must persist continuously W16->W28');
  assert.equal(B.game.hero.breakthroughs.w10.branchKey, initialW10Branch, 'W10 branch must persist continuously W16->W28');
  assert.equal(B.hasW20Direction('fire_chain_surge'), true, 'W20 direction must persist continuously W21->W28');
  assert.ok(B.game.hero.breakthroughs.w20.enhancementKey, 'W20 enhancement must persist continuously W21->W28');
  assert.equal(B.getEndgameOmenState().clearTriggered, true);

  // Export at W29 prep (post-W28 state) -> clean startNewRun -> importBuildPreset exact roundtrip
  const snap = B.exportBuildPreset();
  B.startNewRun(1234, false);
  assert.equal(B.game.hero.breakthroughs.w20, null);
  assert.equal(B.game.w20State.locked, false);

  const imp = B.importBuildPreset(snap);
  assert.equal(imp.ok, true);
  assert.equal(B.game.wave, 29);
  assert.equal(B.game.hero.breakthroughs.w20.directionKey, snap.hero.breakthroughs.w20.directionKey);
  assert.equal(B.game.hero.breakthroughs.w20.enhancementKey, snap.hero.breakthroughs.w20.enhancementKey);
  assert.equal(B.hasW20Direction('fire_chain_surge'), true);
  assert.equal(B.game.gold, snap.gold);
  assert.equal(B.game.materials, snap.materials);
});
