import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createNoopPorts, createRuntimeContext } from '../../src/core/runtime-context.js';
import { mulberry32 } from '../../src/core/rng.js';
import { createGameStateFactory, createRunState } from '../../src/core/state.js';
import { buildTerrainProps } from '../../src/core/terrain.js';
import BALANCE from '../../src/data/balance.js';
import { GEARS, MAX_ENEMIES, SHRINE_WAVES, W20_BOSS_AUX_POOL, W30_BOSS_AUX_POOL } from '../../src/data/index.js';
import { createEconomyCore, createShopConfirm } from '../../src/systems/economy/index.js';
import { createAffixTransfer, createEquipmentCore } from '../../src/systems/equipment/index.js';
import { createHeroStats, createHeroVitals } from '../../src/systems/hero/index.js';
import { createMetaSystem } from '../../src/systems/meta/index.js';
import { createDestinyGamble, createUnlockSystem, createW20Breakthrough } from '../../src/systems/progression/index.js';
import { createRunSystem, getW25To28Pool, getWavePhaseMeta, isCancelablePrepModal } from '../../src/systems/run/index.js';

const seed = 837;
const noop = () => {};

function fingerprint(value) {
  const json = JSON.stringify(value, (_, entry) => entry instanceof Map ? { map: [...entry] } : entry);
  return createHash('sha256').update(json).digest('hex');
}

test('run ports have callable defaults in a context with no browser', () => {
  const { vfx, ui, modals, viewport, clock } = createNoopPorts();
  assert.equal(vfx.update(0.1), undefined);
  assert.equal(ui.resetRunUI(), undefined);
  assert.equal(modals.hideBackdrop(), undefined);
  assert.equal(viewport.updateCamera(0, true), undefined);
  assert.equal(viewport.resetCamera(), undefined);
  assert.equal(clock.syncLoopTimestamp(1000), undefined);
});

function setup(wave = 1) {
  const calls = [];
  const record = name => (...args) => calls.push([name, ...args]);
  let nowMs = 1000;
  const ctx = createRuntimeContext({
    onGameChange: record('setGame'),
    onPausedChange: record('setPaused'),
    ports: {
      audio: { play: record('play'), unlock: record('unlock') },
      clock: { perfNow: () => nowMs, nowMs: () => nowMs, syncLoopTimestamp: record('syncLoopTimestamp') },
      modals: {
        queueModal(modal) {
          ctx.game.pendingModals.push(modal);
          record('queueModal')(modal);
        },
        closeModal() { ctx.game.activeModal = null; record('closeModal')(); },
        openNextModal() { ctx.game.activeModal = ctx.game.pendingModals.shift(); record('openNextModal')(); },
        hideBackdrop: record('hideBackdrop'),
        openDestinyGambleModal: record('openDestinyGambleModal'),
        openW20PreselectModal: record('openW20PreselectModal'),
        renderW30EarlyConfirmModal: record('renderW30EarlyConfirmModal'),
        showEndModal: record('showEndModal'),
      },
      ui: {
        resetRunUI: record('resetRunUI'), toast: record('toast'), showBanner: record('showBanner'),
        renderAllUI: record('renderAllUI'), flashScreen: record('flashScreen'),
        setDangerVignette: record('setDangerVignette'),
      },
      vfx: { update: record('updateVfx'), addFloat: record('addFloat'), addRing: record('addRing') },
      viewport: { resetCamera: record('resetCamera'), updateCamera: record('updateCamera') },
    },
  });
  const meta = createMetaSystem(ctx);
  const unlock = createUnlockSystem(ctx);
  const equipment = createEquipmentCore(ctx, meta);
  const economy = createEconomyCore(ctx, { meta, equipment });
  const hero = createHeroStats(ctx, { unlock, meta });
  const combat = {
    updateSeal: noop, updateProjectilesAndZones: noop, updateEnemies: noop,
    pickEliteAffixes: count => Array(count).fill('test_affix'),
    spawnEnemy(kind, side, scale, pos) {
      const enemy = { kind, side, scale, pos, spd: 2, dmg: 10 };
      ctx.game.enemies.push(enemy);
      return enemy;
    },
  };
  const vitals = createHeroVitals(ctx, {
    meta, unlock, equipment, hero, combat,
    run: { finishGame: victory => run.finishGame(victory) },
  });
  const destiny = createDestinyGamble(ctx, { meta, unlock, equipment, economy, hero: { ...hero, ...vitals }, combat });
  const run = createRunSystem(ctx, {
    meta: { ...meta, syncRunActivePools() { record('syncRunActivePools')(); meta.syncRunActivePools(); } },
    unlock,
    equipment: {
      ...createAffixTransfer(ctx, { equipment, economy, hero }),
      recomputeEquipmentSynergies() {
        record('recomputeEquipmentSynergies')(ctx.game.metaRunLocked);
        return equipment.recomputeEquipmentSynergies();
      },
    },
    economy: { ...economy, ...createShopConfirm(ctx, { buyShopItem: noop }), rollShop: record('rollShop') },
    hero: { ...hero, ...vitals, updateHero: record('updateHero') },
    progression: { ...createW20Breakthrough(ctx, { equipment, economy }), ...destiny },
    combat,
  });
  const game = run.makeGame(seed);
  game.wave = wave;
  ctx.setGame(game);
  calls.length = 0;
  return { ctx, game, run, meta, calls, setClock: value => { nowMs = value; } };
}

test('state factory preserves full legacy defaults and the first three seeded draws', () => {
  const deps = { generateRunId: value => `test-${value}` };
  const first = createRunState(seed, deps);
  const second = createRunState(seed, deps);
  // Captured from the pre-extraction makeGame with the same run ID and empty loadout.
  assert.equal(fingerprint(first), '87001d77d00c0991847c72d4808a41a30653a41f75860b4319c0e2ee5f641dd7');
  assert.equal(fingerprint(first), fingerprint(second));
  assert.equal(createRunState(seed).runId, createRunState(seed).runId);
  assert.deepEqual(first.metaLoadout, { main: null, aux: [] });
  assert.ok(first.hero.bladeHitMap instanceof Map && first.hero.shatterCdMap instanceof Map);
  first.hero.bladeHitMap.set('enemy', 1);
  assert.equal(second.hero.bladeHitMap.size, 0);

  const rng = mulberry32(seed);
  assert.equal(first.bossIntel.w20AuxKey, W20_BOSS_AUX_POOL[Math.floor(rng() * W20_BOSS_AUX_POOL.length)].key);
  assert.equal(first.bossIntel.w30AuxKey, W30_BOSS_AUX_POOL[Math.floor(rng() * W30_BOSS_AUX_POOL.length)].key);
  const themeKeys = Object.keys(BALANCE.wave.w22To24Themes);
  assert.equal(first.wavePlan.w22To24ThemeKey, themeKeys[Math.floor(rng() * themeKeys.length)]);
  assert.equal(first.rnd(), rng());
  assert.equal(second.rnd(), mulberry32AfterInit(seed));
});

function mulberry32AfterInit(value) {
  const rng = mulberry32(value);
  for (let i = 0; i < 3; i++) rng();
  return rng();
}

test('makeGame publishes terrain before Meta reads and copies the loadout snapshot', () => {
  const ctx = createRuntimeContext();
  const loadout = { main: 'main_holy', aux: ['aux_shrine_compass'] };
  const order = [];
  const { makeGame } = createGameStateFactory(ctx, {
    generateRunId(value) {
      order.push('id');
      assert.deepEqual(ctx.terrainProps, buildTerrainProps(value));
      return 'generated-id';
    },
    getMetaSave() { order.push('save'); return { loadout }; },
  });
  const game = makeGame(seed);
  assert.deepEqual(order, ['id', 'save']);
  assert.equal(ctx.game, null);
  assert.equal(game.runId, 'generated-id');
  loadout.aux.push('unlocked_after_start');
  loadout.main = null;
  assert.deepEqual(game.metaLoadout, { main: 'main_holy', aux: ['aux_shrine_compass'] });
  assert.equal(game.rnd(), mulberry32AfterInit(seed));
});

test('wave queries expose the shared W22–24 threat and hide W25–28 rolls during prep', () => {
  const { run, game } = setup(25);
  assert.deepEqual(getWavePhaseMeta(1), { tag: '爬升·初探', kind: 'climb', mobMult: 1, hpMult: 1 });
  assert.equal(run.getWavePhaseMeta, getWavePhaseMeta);
  assert.equal(run.getW25To28Pool, getW25To28Pool);
  const theme = run.getW22To24Theme();
  assert.equal(theme.key, game.wavePlan.w22To24ThemeKey);
  assert.equal(run.getW22To24Theme('unknown'), BALANCE.wave.w22To24Themes.mobile_rush);
  for (const wave of [22, 23, 24]) {
    const info = run.getWaveEncounterInfo(wave);
    assert.equal(info.revealed, true);
    assert.equal(info.primaryThreat, theme.primaryThreat);
    assert.equal(info.comboLabel, theme.waves[wave].comboLabel);
  }
  assert.deepEqual(getW25To28Pool(24), []);
  assert.equal(run.rollW25To28Encounter(24), null);
  const pool = getW25To28Pool(25);
  assert.notEqual(pool, BALANCE.wave.w25To28Pools[25]);
  const uncommitted = run.rollW25To28Encounter(25, false);
  assert.ok(pool.some(entry => entry.id === uncommitted.id));
  assert.deepEqual(game.wavePlan.w25To28Rolled, {});
  const committed = run.rollW25To28Encounter(25);
  assert.equal(game.wavePlan.currentEncounter, committed);
  assert.deepEqual(run.getWaveEncounterInfo(), {
    wave: 25, type: 'w25_28_random', revealed: false, id: null, name: '开战后揭晓', primaryThreat: null,
  });
  game.phase = 'wave';
  assert.equal(run.getWaveEncounterInfo().id, committed.id);
  assert.equal(run.getWaveEncounterInfo(26).revealed, false);
  assert.equal(run.getWaveEncounterInfo(21), null);
});

test('fixed-seed wave queues match legacy spawn times, composition, scaling and next RNG draw', () => {
  const { run, ctx } = setup();
  for (const [wave, length, eliteCount, boss, hash, nextDraw] of [
    [1, 51, 0, [], '75800f3ba803dff667bf644c0e3be2293c8803bb0ae4065e281172c77d7d388e', 0.4458085505757481],
    [10, 93, 1, ['boss2'], '17036890e9d113ae7548cfd3a3e42676f46f091bbd109fabadfc61d764ab5a66', 0.613921316107735],
    [21, 191, 2, [], '1672f8e8cdd99bd6216224148509b738152f93659775baad45817731f65738ec', 0.8118562148883939],
    [22, 168, 3, [], 'f068434aec74d2eea880e7fb80f99c8ea3cec1e6bf2242a71974046cfca0d2ba', 0.14606466190889478],
    [25, 186, 3, ['boss5'], 'f88f64219c99611cba02dcb2ad37917af456cd809cd1fe49e21794df15b8d9a0', 0.3117202613502741],
    [29, 198, 3, [], '0fe288de0fc1200291c4dd194ef69a541c9f2a4ea92780d64823524674e2d900', 0.4442473645322025],
    [30, 17, 0, ['boss6'], '197b5a422987a1b91ac89f7ba28811a79a987738852db665ebe3cbaf95f958cc', 0.03457674151286483],
  ]) {
    ctx.setGame(run.makeGame(seed));
    const queue = run.buildWaveQueue(wave);
    assert.equal(queue.length, length, `W${wave}`);
    assert.equal(queue.filter(entry => entry.kind === 'elite').length, eliteCount, `W${wave}`);
    assert.deepEqual(queue.filter(entry => entry.kind.startsWith('boss')).map(entry => entry.kind), boss);
    assert.equal(fingerprint(queue), hash, `W${wave}`);
    assert.equal(ctx.game.rnd(), nextDraw, `W${wave}`);
  }
});

test('startWave collects ground chests before blocking for Destiny or other decisions', () => {
  const { run, game, calls } = setup(25);
  game.chests = [{ legend: true, shrineTier: 2 }];
  game.destiny.pendingOffer = { offerId: 'pending', claimed: false };
  assert.equal(run.startWave(), false);
  assert.deepEqual(game.chests, []);
  assert.deepEqual(game.pendingModals, [{ type: 'chest', legend: true, shrineTier: true }]);
  assert.ok(!calls.some(([name]) => name === 'openDestinyGambleModal'));
  assert.equal(run.startWave(), false);
  assert.ok(calls.some(([name]) => name === 'openDestinyGambleModal'));
  game.destiny.pendingOffer.claimed = true;
  assert.equal(run.startWave(), false);
  assert.equal(game.phase, 'prep');
  assert.deepEqual(game.wavePlan.w25To28Rolled, {});
  assert.equal(game.rnd(), mulberry32AfterInit(seed));
});

test('startWave discards uncommitted drafts, requires W20 selection and locks it on entry', () => {
  const { run, game, calls } = setup(20);
  game.transferDraft = { cost: 30 };
  game.shopConfirmDraft = { cost: 30 };
  const gold = game.gold;
  assert.equal(run.startWave(), false);
  assert.equal(game.transferDraft, null);
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.gold, gold);
  assert.ok(calls.some(([name, opts]) => name === 'openW20PreselectModal' && opts.requireConfirmStart));
  game.w20State.preselectedDirection = 'fire_chain_surge';
  assert.equal(run.startWave(), true);
  assert.deepEqual(game.w20State, {
    preselectedDirection: 'fire_chain_surge', lockedDirection: 'fire_chain_surge', locked: true, lockedAtWave: 20,
  });
  assert.equal(game.metaRunLocked, true);
  assert.equal(game.hero.breakthroughs.w20, null);
});

test('startWave commits late encounters, initializes the W28 omen and prepares the W30 clock', () => {
  for (const wave of [25, 26, 27, 28, 29, 30]) {
    const { run, game } = setup(wave);
    if (wave <= 28) assert.equal(run.getWaveEncounterInfo().revealed, false);
    assert.equal(run.startWave(), true);
    if (wave <= 28) {
      assert.equal(run.getWaveEncounterInfo().revealed, true);
      assert.equal(game.curWaveTel.encounterId, game.wavePlan.w25To28Rolled[wave].id);
    }
    assert.equal(game.shrine?.wave ?? null, SHRINE_WAVES.includes(wave) ? wave : null);
    if (wave === 28) {
      assert.equal(run.getEndgameOmenState().triggered, true);
      assert.equal(run.getEndgameOmenState().midWaveTriggered, false);
      assert.notEqual(run.getEndgameOmenState(), game.endgameOmen);
    }
    if (wave === 29) {
      assert.equal(game.curWaveTel.encounterId, 'w29_outpost');
      assert.equal(game.bossIntel.w30Revealed, true);
    }
    if (wave === 30) {
      assert.equal(game.curWaveTel.encounterId, 'w30_boss6');
      assert.equal(game.w30Battle.elapsedSeconds, 0);
      assert.deepEqual(game.w30Battle.phaseTimeline, [{ phase: 'opening', at: 0, bossHpPct: 100 }]);
    }
  }
  for (const wave of SHRINE_WAVES) {
    const { run, game } = setup(wave);
    run.startWave();
    assert.equal(game.shrine.wave, wave);
    assert.equal(game.shrine.charge, 0);
  }
});

test('telemetry finalizes once with rounded stats and returns a fresh wave list', () => {
  const { run, game, ctx } = setup();
  run.startWave();
  game.waveClock = 4.24;
  game.curWaveTel.moveDist = 9.36;
  game.curWaveTel.minHpPct = 31;
  game.curWaveTel.shrineCleared = true;
  game.stats.dmgTotal += 210;
  game.gold -= 1;
  run.finalizeCurrentTelemetry();
  run.finalizeCurrentTelemetry();
  const report = run.getTelemetryReport();
  assert.deepEqual(report.summary, { wavesCleared: 1, avgDuration: 4.2, lowestHpPct: 31, shrineClears: 1 });
  const [{ dps, dmgDealt, moveDist, goldEarned }] = report.waves;
  assert.deepEqual({ dps, dmgDealt, moveDist, goldEarned }, { dps: 50, dmgDealt: 210, moveDist: 9.4, goldEarned: 0 });
  assert.equal(report.current, null);
  report.waves.length = 0;
  assert.equal(game.telemetry.length, 1);
  ctx.setGame(null);
  assert.deepEqual(run.getTelemetryReport(), { waves: [], current: null, summary: {} });
});

test('beginWaveHarvest vacuums gems for 1.15 s, clears combat residue and skips empty harvests', () => {
  const { run, game, calls } = setup();
  run.startWave();
  game.gems = [{ x: 1, y: 1, xp: 1 }];
  for (const key of ['projectiles', 'zones', 'beams', 'bolts']) game[key].push({});
  game.shrine = {};
  game.hero.bladeHitMap.set(1, 1);
  game.hero.shatterCdMap.set(1, 1);
  run.beginWaveHarvest();
  assert.equal(game.phase, 'harvest');
  assert.equal(game.harvestTimer, 1.15);
  assert.equal(game.gems[0].magnetized, true);
  for (const key of ['projectiles', 'zones', 'beams', 'bolts']) assert.deepEqual(game[key], []);
  assert.equal(game.shrine, null);
  assert.equal(game.hero.bladeHitMap.size + game.hero.shatterCdMap.size, 0);
  assert.ok(calls.some(([name]) => name === 'addFloat'));
  game.gems = [];
  run.beginWaveHarvest();
  assert.equal(game.phase, 'prep');
  assert.equal(game.wave, 2);
});

test('W29 clock waits for ground chest and upgrade rewards, then advances while paused', () => {
  const { run, game, ctx, setClock, calls } = setup(30);
  game.activeModal = { type: 'levelup' };
  game.chests = [{ legend: false, shrineTier: true }];
  run.enterW29FinalPrep();
  assert.deepEqual(game.chests, []);
  assert.equal(game.pendingModals[0].type, 'chest');
  assert.equal(game.subPhase, 'w29_final_prep');
  assert.equal(game.finalPrep.awaitingWaveRewards, true);
  assert.equal(game.finalPrep.deadlineMs, null);
  assert.equal(run.startW30Early().reason, 'awaiting_wave_rewards');
  ctx.setPaused(true);
  setClock(10000);
  run.tick(9);
  assert.equal(game.finalPrep.timer, 90);
  game.activeModal = null;
  assert.equal(run.syncW29FinalPrepStart(), false);
  game.pendingModals = [];
  assert.equal(run.syncW29FinalPrepStart(), true);
  assert.equal(run.syncW29FinalPrepStart(), false);
  assert.equal(game.finalPrep.deadlineMs, 100000);
  run.setMonotonicClockForTest(() => 12000);
  assert.ok(calls.some(([name, value]) => name === 'syncLoopTimestamp' && value === 12000));
  run.tick(0.01);
  assert.equal(game.finalPrep.timer, 88);
  assert.equal(game.runMetrics.w29FinalPrepSec, 2);
  assert.equal(game.runMetrics.totalEffectiveSec, 2);
  assert.ok(!calls.some(([name]) => name === 'updateHero'));
  run.setMonotonicClockForTest(() => NaN);
  assert.equal(run.getMonotonicNowMs(), 10000);
  run.setMonotonicClockForTest(null);
  assert.equal(ctx.counters.monotonicClockOverride, null);
});

test('W29 clock re-anchors direct timer edits, then starts W30 on expiry', () => {
  const { run, game, ctx } = setup(30);
  run.enterW29FinalPrep();
  assert.equal(game.finalPrep.started, true);
  assert.equal(game.finalPrep.deadlineMs, 91000);
  game.speed = 4;
  ctx.counters.inMainLoopFrame = true;
  run.tick(4);
  assert.equal(game.finalPrep.timer, 90);
  ctx.counters.inMainLoopFrame = false;
  run.tick(4);
  assert.equal(game.finalPrep.timer, 89);
  game.finalPrep.timer = 2;
  assert.equal(run.syncW29FinalPrepClock({ nowMs: 5000 }), false);
  assert.equal(game.finalPrep.deadlineMs, 7000);
  assert.equal(run.syncW29FinalPrepClock({ nowMs: 7000 }), true);
  assert.equal(game.finalPrep.timer, 0);
  assert.equal(game.finalPrep.lastResolution.trigger, 'timeout');
  assert.equal(game.w30Battle.active, true);
});

test('prep modal cleanup preserves both active and queued rewards', () => {
  const { run, game, calls } = setup(30);
  const rewards = ['levelup', 'chest', 'perk', 'w10_breakthrough', 'w20_breakthrough'].map(type => ({ type }));
  const cancelable = ['destiny_gamble', 'affix_transfer', 'shop_confirm', 'w30_early_confirm', 'meta_legacy'].map(type => ({ type }));
  assert.ok(rewards.every(modal => !isCancelablePrepModal(modal)));
  assert.ok(cancelable.every(isCancelablePrepModal));
  game.inspTarget = { type: 'hero' };
  game.mode = 'sell';
  game.activeModal = rewards[0];
  game.pendingModals = [...cancelable, ...rewards.slice(1)];
  run.closeCancelablePrepModals();
  assert.equal(game.activeModal, rewards[0]);
  assert.deepEqual(game.pendingModals, rewards.slice(1));
  assert.equal(game.inspTarget, null);
  assert.equal(game.mode, null);
  assert.deepEqual(calls, []);
  game.activeModal = cancelable[0];
  run.closeAllPrepModals();
  assert.deepEqual(calls, [['hideBackdrop'], ['openNextModal']]);
  assert.equal(game.activeModal, rewards[1]);
  assert.deepEqual(game.pendingModals, rewards.slice(2));
});

test('early start requires explicit random claim and preserves the granted level-up decision', () => {
  const { run, game, calls } = setup(30);
  run.enterW29FinalPrep();
  game.destiny.pendingOffer = {
    offerId: 'offer', choices: Array.from({ length: 3 }, () => ({ category: 'pill', pillKey: 'legend_ascend', name: 'Ascend' })),
  };
  assert.equal(run.startWave(), false);
  assert.equal(game.activeModal.type, 'w30_early_confirm');
  assert.ok(calls.some(([name]) => name === 'renderW30EarlyConfirmModal'));
  assert.equal(game.finalPrep.locked, false);
  assert.equal(game.hero.lv, 1);
  const result = run.startW30Early({ acceptRandomClaim: true });
  assert.equal(result.ok, true);
  assert.equal(result.startedW30, true);
  assert.equal(result.autoClaimed.offerId, 'offer');
  assert.equal(result.autoClaimed.choiceIndex, Math.floor(mulberry32AfterInit(seed) * 3));
  assert.equal(result.resolution.trigger, 'early_start_random_claim');
  assert.equal(game.finalPrep.locked, true);
  assert.equal(game.finalPrep.transitioning, false);
  assert.equal(game.destiny.pendingOffer, null);
  assert.equal(game.hero.lv, 2);
  assert.equal(game.pendingModals[0]?.type ?? game.activeModal?.type, 'levelup');
  assert.equal(run.startW30Early().reason, 'not_in_prep');
});

test('timeout locks re-entrant calls and clears transfer and purchase drafts without charging', () => {
  const { run, game, ctx } = setup(30);
  run.enterW29FinalPrep();
  game.transferDraft = { cost: 30 };
  game.shopConfirmDraft = { cost: 30 };
  game.activeModal = { type: 'shop_confirm' };
  const resources = [game.gold, game.materials, game.transferTokens];
  let nestedResult;
  ctx.bindPorts({ modals: { hideBackdrop: () => { nestedResult = run.resolveW29FinalPrepTimeout(); } } });
  const result = run.resolveW29FinalPrepTimeout();
  assert.deepEqual(nestedResult, { ok: false, reason: 'already_locked' });
  assert.deepEqual(result.resolution, {
    trigger: 'timeout', clearedTransferDraft: true, clearedShopDraft: true, autoClaimedOffer: null, resolvedAtWave: 30,
  });
  assert.equal(game.transferDraft, null);
  assert.equal(game.shopConfirmDraft, null);
  assert.equal(game.activeModal, null);
  assert.deepEqual([game.gold, game.materials, game.transferTokens], resources);
  assert.equal(game.phase, 'wave');
  assert.equal(run.resolveW29FinalPrepTimeout().reason, 'not_active');
});

test('startNewRun sets context, resets ports and opens the starter in legacy order', () => {
  const { run, ctx, calls, game: oldGame } = setup(8);
  ctx.setPaused(true);
  calls.length = 0;
  assert.equal(run.startNewRun(123), undefined);
  assert.notEqual(ctx.game, oldGame);
  assert.equal(ctx.game.seed, 123);
  assert.deepEqual(ctx.terrainProps, buildTerrainProps(123));
  assert.equal(ctx.paused, false);
  assert.deepEqual(calls.map(([name]) => name), [
    'setGame', 'syncRunActivePools', 'recomputeEquipmentSynergies', 'setPaused', 'resetRunUI',
    'closeModal', 'rollShop', 'resetCamera', 'queueModal', 'renderAllUI',
  ]);
  assert.deepEqual(calls[2], ['recomputeEquipmentSynergies', true]);
  assert.deepEqual(ctx.game.pendingModals, [{ type: 'starter' }]);
  run.startNewRun(124, false, { preRunSetup: true });
  assert.equal(ctx.game.metaRunLocked, false);
  assert.deepEqual(ctx.game.pendingModals, []);
});

test('clear awards bounty, Greed, interest and refining materials before deciding auto-wave pause', () => {
  const { run, game, ctx, calls } = setup(27);
  const { waveClearBase, waveClearPerWave } = BALANCE.economy;
  game.hero.gear = Object.values(GEARS).filter(gear => gear.set === 'greed').slice(0, 2).map(gear => gear.key);
  const bonus = waveClearBase + 27 * waveClearPerWave + 12;
  game.gold = 500;
  game.hero.perks.gold_power = 1;
  game.hero.maxHp = 1000;
  game.hero.hp = 1;
  game.gems.push({ xp: 1 });
  game.chests.push({ legend: true });
  game.autoWave = true;
  const materials = game.materials;
  run.completeWaveClear();
  assert.equal(ctx.game.gold, 500 + 25 + bonus);
  assert.ok(game.materials > materials);
  assert.deepEqual(game.runMetrics.ledger.filter(e => e.reason.startsWith('wave_clear')).map(e => e.reason), [
    'wave_clear_bonus', 'wave_clear_interest', 'wave_clear_materials',
  ]);
  assert.equal(game.hero.xp, 1);
  assert.equal(game.hero.hp, 1 + BALANCE.progression.waveClearHeal);
  assert.ok(calls.some(([name, danger]) => name === 'setDangerVignette' && danger));
  assert.equal(game.chests.length, 1);
  assert.equal(game.autoWavePausedForDecision, true);
  assert.equal(game.autoWaveTimer, 4);
});

test('clear advances W5/10/15/18/20/28/29/30 progression at the same boundaries', () => {
  for (const wave of [5, 10, 15, 18, 20, 28, 29, 30]) {
    const { run, game } = setup(wave);
    if (wave === 20) game.w20State.preselectedDirection = 'fire_chain_surge';
    assert.equal(run.startWave(), true, `W${wave}`);
    game.waveClock = 7;
    if (wave === 10 || wave === 20 || wave === 29) game.chests = [{ legend: true }];
    run.completeWaveClear();
    assert.equal(game.phase, wave === 30 ? 'won' : 'prep');
    assert.equal(game.wave, Math.min(wave + 1, 30));
    assert.equal(game.telemetry[0].duration, 7);
    if ([5, 10, 15, 20].includes(wave)) assert.equal(game.shopTierBonus, [5, 10, 15, 20].indexOf(wave) + 1);
    if (wave === 10 || wave === 20) {
      const key = `w${wave}`;
      assert.equal(game.hero.vouchers[key], true);
      assert.equal(game.pendingBreakthrough, key);
      assert.deepEqual(game.pendingModals.map(modal => modal.type), ['chest', `${key}_breakthrough`]);
    }
    if (wave === 18) assert.equal(game.bossIntel.w20Revealed, true);
    if (wave === 20) {
      assert.equal(game.hero.breakthroughs.w20.baseEffectActive, true);
      assert.equal(game.w20Draft.directionKey, game.hero.breakthroughs.w20.directionKey);
    }
    if (wave === 28) {
      assert.equal(game.endgameOmen.clearTriggered, true);
      assert.equal(game.bossIntel.w30Revealed, true);
    }
    if (wave === 29) {
      assert.equal(game.finalPrep.awaitingWaveRewards, true);
      assert.equal(game.finalPrep.timer, 90);
    }
    if (wave === 30) assert.equal(game.w30Battle.outcome, 'victory');
  }
});

test('finishGame closes W30 telemetry and settles Meta only once per run on victory and defeat', () => {
  for (const victory of [true, false]) {
    const { run, game, meta, calls } = setup(30);
    run.startWave();
    game.waveClock = 14.5;
    game.w30Battle.elapsedSeconds = 14.567;
    game.w30Battle.signatureLockActive = true;
    game.enemies = [{ kind: 'boss6', hp: 250, maxHp: 1000 }];
    game.healOrbs = [{}];
    game.projectiles = [{}];
    game.zones = [{}];
    game.speed = 4;
    run.finishGame(victory);
    assert.equal(game.phase, victory ? 'won' : 'lost');
    assert.equal(game.w30Battle.active, false);
    assert.equal(game.w30Battle.signatureLockActive, false);
    assert.deepEqual(game.w30Battle.phaseTimeline.at(-1), {
      phase: 'ended', outcome: victory ? 'victory' : 'defeat', at: 14.57, bossHpPct: victory ? 0 : 25,
    });
    assert.equal(game.telemetry.length, 1);
    assert.equal(game.combatLog.settledAtRunClock, 14.5);
    assert.equal(game.speed, 1);
    assert.equal(game.healOrbs.length + game.projectiles.length + game.zones.length, 0);
    assert.ok(calls.some(([name, active]) => name === 'setDangerVignette' && active === false));
    assert.ok(calls.some(([name, outcome]) => name === 'showEndModal' && outcome === victory));
    const shards = meta.getMetaSave().legacyShards;
    run.finishGame(victory);
    assert.equal(game.metaSettlement.duplicateBlocked, true);
    assert.equal(meta.getMetaSave().legacyShards, shards);
    assert.equal(game.w30Battle.phaseTimeline.length, 2);
  }
});

test('tick resumes auto-wave from a decision and accounts effective time by phase', () => {
  const { run, game, calls } = setup();
  game.autoWave = true;
  game.autoWaveTimer = 0.1;
  game.activeModal = { type: 'perk' };
  run.tick(1);
  assert.equal(game.autoWavePausedForDecision, true);
  assert.equal(game.autoWaveTimer, 0.1);
  assert.equal(game.runMetrics.totalEffectiveSec, 0);
  game.activeModal = null;
  game.speed = 2;
  run.tick(1);
  assert.equal(game.autoWaveTimer, 1.5);
  assert.equal(game.runMetrics.prepSec, 0.5);
  assert.deepEqual(calls.slice(-3), [['updateVfx', 1], ['updateHero', 1], ['updateCamera', 1, false]]);
  run.tick(1.5);
  assert.equal(game.phase, 'wave');
  run.tick(0.1);
  assert.equal(game.runMetrics.normalCombatSec, 0.1);
  game.wave = 5;
  run.tick(0.2);
  assert.equal(game.runMetrics.bossCombatSec, 0.2);
  game.phase = 'harvest';
  game.harvestTimer = 0.25;
  game.gems.push({ x: 0, y: 0, xp: 1, t: 0 });
  run.tick(0.25);
  assert.equal(game.runMetrics.harvestSec, 0.25);
  assert.equal(game.runMetrics.totalEffectiveSec, 1.05);
  assert.equal(game.wave, 6);
  assert.equal(game.phase, 'prep');
});

test('tick triggers W28 mid-wave omen and holy regeneration', () => {
  const { run, game, calls } = setup(28);
  run.startWave();
  game.seal = { elem: 'holy', star: 5 };
  game.hero.hp -= 20;
  const hp = game.hero.hp;
  game.waveClock = game.stormWarnAt - 1;
  run.tick(1);
  assert.equal(game.hero.hp, hp + 5);
  assert.equal(game.endgameOmen.midWaveTriggered, true);
  assert.ok(calls.some(([name, effect]) => name === 'flashScreen' && effect === 'fail'));
});

test('tick charges shrines in range at half duration with the compass', () => {
  for (const compass of [false, true]) {
    const { run, game } = setup(3);
    game.metaLoadout.aux = compass ? ['aux_shrine_compass'] : [];
    game.metaRunLocked = true;
    run.startWave();
    Object.assign(game.shrine, { x: game.hero.x, y: game.hero.y });
    run.tick(0.15);
    assert.equal(game.shrine.active, compass);
    if (!compass) run.tick(0.15);
    assert.equal(game.shrine.active, true);
    assert.equal(game.curWaveTel.shrineTried, true);
    const [boss, ...escorts] = game.enemies;
    assert.equal(boss.isShrineBoss, true);
    assert.equal(boss.affixes.length, 2);
    assert.deepEqual(escorts.map(enemy => enemy.kind), ['wolf', 'wolf', 'wolf']);
  }
});

test('tick respects the enemy soft cap and enters harvest only after all spawns are cleared', () => {
  const { run, game } = setup(30);
  run.startWave();
  game.enemies = Array.from({ length: MAX_ENEMIES - 1 }, () => ({}));
  game.waveQueue = [
    { at: 0, kind: 'boss6', side: 'west', scale: 1, spawned: false },
    { at: 0, kind: 'wolf', side: 'east', scale: 2, spawned: false },
  ];
  run.tick(0.1);
  assert.equal(game.enemies.length, MAX_ENEMIES);
  assert.deepEqual(game.waveQueue.map(entry => entry.spawned), [true, false]);
  assert.equal(game.w30Battle.elapsedSeconds, 0.1);
  game.enemies = [];
  run.tick(0.2);
  assert.equal(game.enemies[0].kind, 'wolf');
  assert.equal(game.phase, 'wave');
  game.enemies = [];
  game.gems = [{ xp: 1, x: 1, y: 1 }];
  run.tick(0.1);
  assert.equal(game.phase, 'harvest');
  assert.equal(game.gems[0].magnetized, true);
});
