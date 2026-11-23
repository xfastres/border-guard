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
          if (this._innerHTML && !this._innerHTML.includes(`id="${targetId}"`) && !this._innerHTML.includes(`id='${targetId}'`)) {
            if (targetId === 'endlessGo') return null;
          }
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
      if (sel === '#endlessGo') {
        const box = cache['modalBox'];
        if (box && box.innerHTML.includes('endlessGo')) return makeEl('endlessGo');
        return null;
      }
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

test('1. v0.60 config & embedded BALANCE are synced and configure 30-wave controlled scaling', () => {
  const diskConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert.equal(diskConfig.wave.mainWaves, 30);

  const { B, html } = bootBG60();
  const embeddedMatch = html.match(/const BALANCE = ([\s\S]*?);\n\/\* BALANCE_CONFIG_END/);
  assert.ok(embeddedMatch, 'Embedded BALANCE block must exist in Border-Guard-v0.60.html');
  assert.deepEqual(JSON.parse(embeddedMatch[1]), diskConfig);

  assert.equal(B.MAIN_WAVES, 30);
  assert.equal(B.BALANCE.wave.mainWaves, 30);
  assert.equal(B.UNLOCK_NODES.length, 5);

  const q1 = B.buildWaveQueue(1);
  const q5 = B.buildWaveQueue(5);
  const q10 = B.buildWaveQueue(10);
  const q15 = B.buildWaveQueue(15);
  const q20 = B.buildWaveQueue(20);
  const q25 = B.buildWaveQueue(25);
  const q30 = B.buildWaveQueue(30);

  assert.equal(q5.find(x => x.kind.startsWith('boss'))?.kind, 'boss1');
  assert.equal(q10.find(x => x.kind.startsWith('boss'))?.kind, 'boss2');
  assert.equal(q15.find(x => x.kind.startsWith('boss'))?.kind, 'boss3');
  assert.equal(q20.find(x => x.kind.startsWith('boss'))?.kind, 'boss4');
  assert.equal(q25.find(x => x.kind.startsWith('boss'))?.kind, 'boss5');
  assert.equal(q30.find(x => x.kind.startsWith('boss'))?.kind, 'boss6');

  assert.ok(q10[0].scale > q1[0].scale);
  assert.ok(q20[0].scale > q10[0].scale);
  assert.ok(q30[0].scale > q20[0].scale);
  assert.ok(q30[0].scale < 150, `Expected controlled W30 scale (<150x), got ${q30[0].scale}`);
});

test('2. W1 -> W10 normal progression, auto-wave decision pause, W10 breakthrough flow, and W11 observable combat state changes (Fire & Frost)', () => {
  const { B } = bootBG60();
  B.startNewRun(2026);
  B.closeModal();
  B.pickHeroSkill('firewave');

  // Verify level-up every other level without old Lv.4/9/14/19 cap block
  const levelEvents = [];
  for (let targetLv = 2; targetLv <= 6; targetLv++) {
    const need = B.game.hero.xpNext - B.game.hero.xp;
    B.gainHeroXp(need);
    const modalType = B.game.activeModal?.type || null;
    levelEvents.push({ lv: B.game.hero.lv, modalType });
    if (modalType === 'levelup') {
      B.pickHeroSkill('firewave');
    }
  }
  assert.deepEqual(levelEvents, [
    { lv: 2, modalType: 'levelup' },
    { lv: 3, modalType: null },
    { lv: 4, modalType: 'levelup' },
    { lv: 5, modalType: null },
    { lv: 6, modalType: 'levelup' }
  ]);

  // Verify autoWave truly pauses when a pending decision/modal exists
  B.game.autoWave = true;
  B.game.autoWaveTimer = 0.5;
  B.queueModal({ type: 'levelup' });
  for (let i = 0; i < 40; i++) B.tick(0.5); // 20s elapsed while modal is open
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.wave, 1);
  assert.equal(B.hasPendingDecision(), true);
  B.pickHeroSkill('blades');

  // Advance W1 through W9 via wave start & clear
  for (let w = 1; w <= 9; w++) {
    while (B.game.activeModal) {
      if (B.game.activeModal.type === 'levelup') B.pickHeroSkill('firewave');
      else if (B.game.activeModal.type === 'chest') B.pickGearReward('burn_core');
      else B.closeModal();
    }
    B.game.chests = [];
    const started = B.startWave();
    assert.equal(started, true, `Wave ${w} should start cleanly`);
    B.completeWaveClear();
  }

  // At W10 prep: verify W10 pre-breakthrough caps (sealCap=3, subCap=1)
  assert.equal(B.game.wave, 10);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.getSealStarCap(), 3);
  assert.equal(B.getSubSealSlotCap(), 1);
  assert.equal(B.game.hero.breakthroughs.w10, null);

  // Start W10, spawn & kill W10 Boss (boss2), then clear W10
  while (B.game.activeModal) B.closeModal();
  B.game.chests = [];
  B.startWave();
  const w10Boss = B.spawnEnemy('boss2', 'west', 1, { x: B.game.hero.x + 2.5, y: B.game.hero.y });
  B.dealDamage(w10Boss, w10Boss.hp + 9999, { fromHero: true, skillKey: 'firewave' });
  B.completeWaveClear();

  while (B.game.activeModal && B.game.activeModal.type !== 'w10_breakthrough') {
    if (B.game.activeModal.type === 'chest') B.pickGearReward('flame_fan');
    else if (B.game.activeModal.type === 'levelup') B.pickHeroSkill('firewave');
    else B.closeModal();
  }

  // Verify autoWave is paused while W10 breakthrough is pending
  B.game.autoWave = true;
  B.game.autoWaveTimer = 0.2;
  for (let i = 0; i < 30; i++) B.tick(0.5);
  assert.equal(B.startWave(), false);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.wave, 11);

  // Step 1: Select learned main skill 'firewave' -> draws 3 random branches
  const step1 = B.selectW10BreakthroughSkill('firewave');
  assert.equal(step1.ok, true);
  assert.equal(step1.choices.length, 3);
  const chosenBranchKey = step1.choices[0].key;

  // Step 2: Pick 1 of 3 random branches
  const step2 = B.pickW10BreakthroughBranch(chosenBranchKey);
  assert.equal(step2.ok, true);
  assert.equal(B.game.hero.breakthroughs.w10.completed, true);
  assert.equal(B.game.hero.w10Branch.firewave, chosenBranchKey);
  assert.equal(B.getSealStarCap(), 4);
  assert.equal(B.getSubSealSlotCap(), 2);

  // Start W11 and observe Fire W10 branch combat behavior
  while (B.game.activeModal) B.closeModal();
  B.game.chests = [];
  assert.equal(B.startWave(), true);
  assert.equal(B.game.wave, 11);
  assert.equal(B.game.phase, 'wave');
  B.game.waveQueue.forEach(q => { q.spawned = true; });
  B.game.enemies = [];
  const e1 = B.spawnEnemy('brute', 'east', 30, { x: B.game.hero.x + 2.2, y: B.game.hero.y });
  const e2 = B.spawnEnemy('brute', 'east', 30, { x: B.game.hero.x + 2.8, y: B.game.hero.y + 0.4 });
  B.game.hero.skillTimers.firewave = 0;
  let sawBranchedProjectileOrZone = false;
  for (let i = 0; i < 45; i++) {
    B.tick(0.1);
    if (B.game.projectiles.some(p => p.w10Branch === chosenBranchKey) || B.game.zones.some(z => z.w10Branch === chosenBranchKey)) {
      sawBranchedProjectileOrZone = true;
    }
  }
  assert.equal(sawBranchedProjectileOrZone, true);
  assert.ok(B.game.stats.fireMarksApplied > 0, 'Expected Fire W10 branch to apply fire marks');
  assert.ok(B.game.stats.fireDetonations > 0, 'Expected Fire W10 branch to trigger fire detonations');
  assert.ok(e1.fireMarkT > 0 || e2.fireMarkT > 0 || B.game.stats.fireMarksApplied > 0);

  // Also test Frost W10 breakthrough branch behavior in W11
  B.loadTestPreset({ wave: 10, tier: 'standard', build: 'frost', seed: 2026 });
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal && B.game.activeModal.type !== 'w10_breakthrough') B.closeModal();
  const frostStep1 = B.selectW10BreakthroughSkill('nova');
  assert.equal(frostStep1.ok, true);
  assert.equal(frostStep1.choices.length, 3);
  const frostBranchKey = frostStep1.choices[0].key;
  const frostStep2 = B.pickW10BreakthroughBranch(frostBranchKey);
  assert.equal(frostStep2.ok, true);
  while (B.game.activeModal) B.closeModal();
  B.game.chests = [];
  assert.equal(B.startWave(), true);
  B.game.waveQueue.forEach(q => { q.spawned = true; });
  B.game.enemies = [];
  const fe1 = B.spawnEnemy('brute', 'east', 30, { x: B.game.hero.x + 1.5, y: B.game.hero.y });
  B.game.hero.skillTimers.nova = 0;
  for (let i = 0; i < 30; i++) B.tick(0.1);
  assert.ok(B.game.stats.frostSlowsApplied > 0, 'Expected Frost W10 branch to apply frost slows');
  assert.ok(B.game.stats.frostShieldGained > 0, 'Expected Frost W10 branch to grant frost shield');
  assert.equal(fe1.slowT > 0, true);
});

test('3. Configurable unlock nodes (sealCap 2★->5★, subCap 0->2, skill pool) and removal of old tribulation/pills', () => {
  const { B } = bootBG60();
  B.startNewRun(2026);
  B.closeModal();

  const snapAt = (wave, w10Done, w20Done) => {
    B.game.wave = wave;
    B.game.hero.breakthroughs.w10 = w10Done ? { wave: 10, completed: true } : null;
    B.game.hero.breakthroughs.w20 = w20Done ? { wave: 20, completed: true, placeholder: true } : null;
    return {
      nodeKey: B.getActiveUnlockNode().key,
      sealCap: B.getSealStarCap(),
      subCap: B.getSubSealSlotCap(),
      skills: B.getUnlockedSkillPool()
    };
  };

  const w1 = snapAt(1, false, false);
  const w6 = snapAt(6, false, false);
  const w10Pre = snapAt(10, false, false);
  const w10Post = snapAt(11, true, false);
  const w16 = snapAt(16, true, false);
  const w20Pre = snapAt(20, true, false);
  const w20Post = snapAt(21, true, true);

  assert.equal(w1.sealCap, 2);
  assert.equal(w1.subCap, 0);
  assert.deepEqual(w1.skills, ['blades', 'firewave', 'nova', 'berserk']);

  assert.equal(w6.sealCap, 3);
  assert.equal(w6.subCap, 1);
  assert.ok(w6.skills.includes('thunder'));

  assert.equal(w10Pre.sealCap, 3);
  assert.equal(w10Pre.subCap, 1);

  assert.equal(w10Post.sealCap, 4);
  assert.equal(w10Post.subCap, 2);
  assert.ok(w10Post.skills.includes('stomp'));

  assert.equal(w16.sealCap, 5);
  assert.equal(w16.subCap, 2);
  assert.equal(w20Pre.sealCap, 5);
  assert.equal(w20Post.sealCap, 5);
  assert.equal(w20Post.nodeKey, 'w20_breakthrough');

  // Verify old tribulation pills (guard / mend) are completely removed from PILLS and shop rolls
  const pillKeys = Object.keys(B.PILLS);
  assert.equal(pillKeys.includes('guard'), false);
  assert.equal(pillKeys.includes('mend'), false);
  assert.equal(/渡劫|护法丹|补天丹/.test(B.PILLS.xp.desc), false);

  const shopPillKeys = new Set();
  for (const w of [1, 6, 10, 15, 20, 25, 30]) {
    B.game.wave = w;
    for (let r = 0; r < 30; r++) {
      B.rollShop(true);
      for (const item of B.game.shop) {
        if (item.itemType === 'pill') shopPillKeys.add(item.pillKey);
      }
    }
  }
  assert.equal(shopPillKeys.has('guard'), false);
  assert.equal(shopPillKeys.has('mend'), false);

  // Verify old tribulation and endless mode APIs are removed
  assert.equal(Boolean(B.openTribulationModal || B.executeTribulation || B.calcTribulationOdds || B.enterEndlessMode), false);

  // Verify all 6 skills have at least 3 W10 breakthrough branches
  for (const sk of Object.keys(B.HERO_SKILLS)) {
    const cnt = (B.W10_SKILL_BRANCHES[sk] || []).length;
    assert.ok(cnt >= 3, `Expected skill ${sk} to have >= 3 W10 branches, got ${cnt}`);
  }
});

test('4. BG60.loadTestPreset across W10/W11/W20/W21/W29/W30 (weak/standard/strong x fire/frost) and W20/W29/W30 settlement flows', () => {
  const { B, doc } = bootBG60();
  const waves = [10, 11, 20, 21, 29, 30];
  const tiers = ['weak', 'standard', 'strong'];
  const builds = ['fire', 'frost'];

  for (const wave of waves) {
    for (const tier of tiers) {
      for (const build of builds) {
        const res = B.loadTestPreset({ wave, tier, build, seed: 2026 });
        assert.equal(res.ok, true);
        assert.equal(res.wave, wave);
        assert.equal(res.phase, 'prep');
        assert.equal(res.tier, tier);
        assert.equal(res.build, build);
        assert.ok(res.unimplementedStageFeatures?.stage2_equipmentCraftingAndAffixes);

        if (wave === 10) {
          assert.equal(res.hero.breakthroughs.w10, null, 'W10 pre-battle preset must not have W10 breakthrough completed yet');
          assert.equal(res.hero.breakthroughs.w20, null);
          assert.equal(res.hero.sealCap, 3);
          assert.equal(res.hero.subCap, 1);
        } else if (wave === 11) {
          assert.equal(res.hero.breakthroughs.w10?.completed, true, 'W11 preset must include completed W10 breakthrough');
          assert.equal(res.hero.breakthroughs.w20, null);
          assert.equal(res.hero.sealCap, 4);
          assert.equal(res.hero.subCap, 2);
        } else if (wave === 20) {
          assert.equal(res.hero.breakthroughs.w10?.completed, true);
          assert.equal(res.hero.breakthroughs.w20, null, 'W20 pre-battle preset must not have W20 breakthrough completed yet');
          assert.equal(res.hero.sealCap, 5);
          assert.equal(res.hero.subCap, 2);
        } else if (wave >= 21) {
          assert.equal(res.hero.breakthroughs.w10?.completed, true);
          assert.equal(res.hero.breakthroughs.w20?.completed, true, `W${wave} preset must include completed W20 breakthrough`);
          assert.ok(
            res.hero.breakthroughs.w20?.placeholder === true ||
            (res.hero.breakthroughs.w20?.placeholder === false && res.hero.breakthroughs.w20?.directionKey && res.hero.breakthroughs.w20?.enhancementKey),
            'W20 breakthrough must be either Stage 1 placeholder or Stage 3 real direction + enhancement'
          );
          assert.equal(res.hero.sealCap, 5);
          assert.equal(res.hero.subCap, 2);
        }
      }
    }
  }

  // Custom gold & materials override check
  const custom = B.loadTestPreset({ wave: 11, tier: 'standard', build: 'fire', materials: 42, gold: 777, seed: 9999 });
  assert.equal(custom.gold, 777);
  assert.equal(custom.materials, 42);
  assert.equal(custom.seed, 9999);

  // Path A: W20 defeat immediate settlement
  B.loadTestPreset({ wave: 20, tier: 'weak', build: 'fire', seed: 2026 });
  B.startWave();
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(B.game.hero.hp + 5000);
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, false);

  // Path B: W20 victory does NOT end run early, advances to W21 with W20 breakthrough placeholder
  B.loadTestPreset({ wave: 20, tier: 'strong', build: 'fire', seed: 2026 });
  B.startWave();
  B.completeWaveClear();
  assert.equal(B.game.wave, 21);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.hero.breakthroughs.w20?.completed, true);

  // Path C: W29 clear enters 90-second standalone timed final prep and transitions to W30 on expiration
  B.loadTestPreset({ wave: 29, tier: 'standard', build: 'frost', seed: 2026 });
  B.startWave();
  B.completeWaveClear();
  while (B.game.activeModal) B.closeModal();
  assert.equal(B.game.wave, 30);
  assert.equal(B.game.phase, 'prep');
  assert.equal(B.game.subPhase, 'w29_final_prep');
  assert.equal(B.game.finalPrep?.active, true);
  assert.equal(B.game.finalPrep?.timer, 90);
  B.tick(30);
  assert.equal(B.game.finalPrep?.timer, 60);
  B.tick(61);
  assert.equal(B.game.wave, 30);
  assert.equal(B.game.phase, 'wave');
  assert.equal(B.game.finalPrep?.active, false);

  // Path D: W30 Boss kill triggers Victory settlement (and no endless button!)
  B.loadTestPreset({ wave: 30, tier: 'strong', build: 'fire', seed: 2026 });
  B.startWave();
  const w30BossInQueue = B.game.waveQueue.find(q => q.kind === 'boss6');
  assert.ok(w30BossInQueue, 'W30 must schedule boss6');
  const boss6 = B.spawnEnemy('boss6', 'west', 1, { x: B.game.hero.x + 2.5, y: B.game.hero.y });
  B.dealDamage(boss6, boss6.hp + 999999, { fromHero: true, skillKey: 'firewave' });
  B.completeWaveClear();
  assert.equal(B.game.phase, 'won');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, true);
  assert.equal(doc.querySelector('#endlessGo'), null);
  const modalHtml = doc.getElementById('modalBox').innerHTML;
  assert.ok(modalHtml.includes('① 通关结果'));
  assert.ok(modalHtml.includes('② 本局表现'));
  assert.ok(modalHtml.includes('③ 长期成长与资源结算'));

  // Path E: W30 Defeat triggers Defeat settlement
  B.loadTestPreset({ wave: 30, tier: 'weak', build: 'frost', seed: 2026 });
  B.startWave();
  B.game.hero.invuln = 0;
  B.game.hero.shield = 0;
  B.damageHero(B.game.hero.hp + 9999);
  assert.equal(B.game.phase, 'lost');
  assert.equal(B.game.activeModal?.type, 'end');
  assert.equal(B.game.activeModal?.victory, false);
});

test('5. All 24 W10 branches across all 6 skills execute in combat and establish their cross-stage state hooks', () => {
  const { B } = bootBG60();
  const skills = Object.keys(B.W10_SKILL_BRANCHES);
  assert.equal(skills.length, 6);

  for (const sk of skills) {
    const branches = B.W10_SKILL_BRANCHES[sk];
    assert.ok(branches.length >= 3, `Skill ${sk} must have at least 3 branches`);
    for (const br of branches) {
      B.loadTestPreset({ wave: 10, tier: 'standard', build: 'fire', seed: 2026 });
      B.game.hero.skills = { blades: 0, firewave: 0, thunder: 0, nova: 0, stomp: 0, berserk: 0 };
      B.game.hero.skills[sk] = 4;
      B.startWave();
      B.completeWaveClear();
      while (B.game.activeModal && B.game.activeModal.type !== 'w10_breakthrough') B.closeModal();
      const s1 = B.selectW10BreakthroughSkill(sk);
      assert.equal(s1.ok, true);
      const s2 = B.pickW10BreakthroughBranch(br.key);
      assert.equal(s2.ok, true);

      while (B.game.activeModal) B.closeModal();
      B.game.chests = [];
      B.startWave();
      B.game.waveQueue.forEach(q => { q.spawned = true; });
      B.game.enemies = [];
      // Place enemies at close and medium range so orbit, melee AoE, and ranged skills all hit
      B.spawnEnemy('brute', 'east', 40, { x: B.game.hero.x + 1.4, y: B.game.hero.y });
      B.spawnEnemy('brute', 'east', 40, { x: B.game.hero.x + 1.9, y: B.game.hero.y + 0.3 });
      B.spawnEnemy('brute', 'east', 40, { x: B.game.hero.x - 1.4, y: B.game.hero.y });
      B.game.hero.skillTimers[sk] = 0;

      for (let i = 0; i < 40; i++) B.tick(0.1);

      const hookKind = br.hook || br.hookType;
      if (hookKind === 'fire_mark_detonate') {
        assert.ok(
          B.game.stats.fireMarksApplied > 0 && B.game.stats.fireDetonations > 0,
          `Expected branch ${sk}:${br.key} to apply fireMark (${B.game.stats.fireMarksApplied}) and trigger fireDetonation (${B.game.stats.fireDetonations})`
        );
      } else {
        assert.ok(
          B.game.stats.frostSlowsApplied > 0 && B.game.stats.frostShieldGained > 0,
          `Expected branch ${sk}:${br.key} to apply frostSlow (${B.game.stats.frostSlowsApplied}) and grant frostShield (${B.game.stats.frostShieldGained})`
        );
      }
    }
  }
});

