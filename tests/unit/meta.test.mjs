import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import {
  META_SAVE_MIGRATORS,
  createDefaultMetaSave,
  createMetaSystem,
  getMetaAuxSpec,
  getMetaConfig,
  getMetaLoadoutBudget,
  getMetaMainSpec,
  getMetaPackSpec,
  migrateMetaSave,
  normalizeMetaSave,
} from '../../src/systems/meta/index.js';

const storageKey = 'border_guard_v060_meta_v1';

function createStorage(raw = null) {
  const entries = new Map(raw === null ? [] : [[storageKey, raw]]);
  const writes = [];
  const storage = {
    failWrite: false,
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) {
      if (storage.failWrite) throw new Error('disk full');
      writes.push(key);
      entries.set(key, value);
    },
    removeItem: key => entries.delete(key),
  };
  return { storage, writes };
}

test('Meta configuration, defaults, normalization and v0 migration preserve the save schema', () => {
  const cfg = getMetaConfig();
  assert.equal(cfg.storageKey, storageKey);
  assert.equal(cfg.schemaVersion, 1);
  assert.deepEqual(cfg.budget, { mainSlots: 1, maxAuxCount: 3, maxAuxPoints: 4 });
  assert.equal(getMetaMainSpec('main_flame').elem, 'fire');
  assert.equal(getMetaAuxSpec('aux_shop_first_refresh').costPoints, 2);
  assert.equal(getMetaPackSpec('pack_affix_tactics').type, 'affix_pack');
  assert.equal(getMetaMainSpec('missing'), null);

  const defaults = createDefaultMetaSave();
  assert.equal(defaults.legacyShards, 0);
  assert.deepEqual(defaults.loadout, {
    main: 'main_flame',
    aux: ['aux_scout_sense', 'aux_dash_cadence', 'aux_shop_first_refresh'],
  });
  const v0 = { schemaVersion: 0, legacyShards: 41.9, unlockedAux: ['missing'], settledRunIds: ['a', 'a'] };
  assert.deepEqual(META_SAVE_MIGRATORS[0](v0), { ...v0, schemaVersion: 1 });
  assert.deepEqual(migrateMetaSave(v0), {
    ok: true, reason: null, foundVersion: 0, supportedVersion: 1, migratedFrom: 0,
    save: { ...defaults, legacyShards: 41, settledRunIds: ['a'] },
  });
  assert.equal(v0.schemaVersion, 0);
  assert.deepEqual(normalizeMetaSave(null), defaults);

  const { storage, writes } = createStorage(JSON.stringify(v0));
  const meta = createMetaSystem(createRuntimeContext({ ports: { storage: { getStorage: () => storage } } }));
  assert.equal(meta.getMetaSave().schemaVersion, 1);
  assert.equal(meta.getMetaStorageStatus().foundVersion, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(JSON.parse(storage.getItem(storageKey)), v0);
});

test('corrupted and incompatible stored bytes are backed up and protected against ordinary saves', () => {
  for (const [raw, reason, foundVersion] of [
    ['{ broken', 'corrupted_json', null],
    ['null', 'invalid_payload', null],
    ['{}', 'incompatible_schema_version', null],
    ['{"schemaVersion":"1"}', 'incompatible_schema_version', '1'],
    ['{"schemaVersion":-1}', 'incompatible_schema_version', -1],
    ['{"schemaVersion":1.5}', 'incompatible_schema_version', 1.5],
    ['{"schemaVersion":2,"legacyShards":99}', 'incompatible_schema_version', 2],
    ['{"schemaVersion":1,"loadout":[]}', 'corrupted_structure', 1],
    ['{"schemaVersion":1,"stats":"invalid"}', 'corrupted_structure', 1],
  ]) {
    const { storage, writes } = createStorage(raw);
    const ctx = createRuntimeContext({ ports: { storage: { getStorage: () => storage } } });
    const meta = createMetaSystem(ctx);
    const fallback = meta.getMetaSave();

    assert.deepEqual(fallback, createDefaultMetaSave(), raw);
    assert.equal(meta.getMetaStorageStatus().state, 'load_error', raw);
    assert.equal(meta.getMetaStorageStatus().loadError, reason, raw);
    assert.equal(meta.getMetaStorageStatus().foundVersion, foundVersion, raw);
    assert.equal(meta.getMetaStorageStatus().rawCorruptedBackup, raw);
    assert.equal(meta.exportRawCorruptedMetaSave(), raw);
    assert.equal(meta.saveMetaSave({ ...fallback, legacyShards: 10 }), false, raw);
    assert.equal(meta.getMetaStorageStatus().lastSaveError, 'protected_corrupted_storage', raw);
    assert.equal(meta.getMetaStorageStatus().saveFailed, true, raw);
    assert.equal(storage.getItem(storageKey), raw);
    assert.deepEqual(writes, [], raw);
  }
});

test('import, export and reset round-trip through context-local fallback and refresh an unlocked run', () => {
  const game = { phase: 'intro' };
  let refreshes = 0;
  const ctx = createRuntimeContext({ game, ports: { ui: { renderAllUI: force => {
    assert.equal(force, true);
    refreshes++;
  } } } });
  const meta = createMetaSystem(ctx);
  const original = meta.getMetaSave();
  assert.equal(ctx.meta.memoryStore.size, 0);
  const changed = { ...original, legacyShards: 73, loadout: { main: 'main_frost', aux: [] } };
  assert.equal(meta.saveMetaSave(changed), true);
  const backup = meta.exportMetaSave();
  assert.deepEqual(JSON.parse(backup), changed);
  assert.equal(ctx.meta.memoryStore.get(storageKey), JSON.stringify(changed));
  assert.deepEqual(meta.resetMetaSave(), { ok: true, reason: null, save: createDefaultMetaSave() });
  assert.deepEqual(game.metaLoadout, original.loadout);
  assert.deepEqual(meta.importMetaSave(backup), { ok: true, migratedFrom: null, save: changed });
  assert.deepEqual(game.metaLoadout, changed.loadout);
  assert.equal(game.metaRunState.activeGearKeys.length, 23);
  assert.equal(meta.exportMetaSave(), backup);
  assert.equal(meta.importMetaSave('{bad').reason, 'parse_error');
  assert.equal(meta.exportMetaSave(), backup);
  assert.equal(refreshes, 2);
  assert.equal(createMetaSystem(createRuntimeContext()).getMetaSave().legacyShards, 0);
});

test('four points and three auxiliary slots apply before and after unlocks, and runs lock their loadout and pools', () => {
  const game = { phase: 'intro' };
  const sounds = [];
  const ctx = createRuntimeContext({ game, ports: { audio: { play: (...args) => sounds.push(args) } } });
  const meta = createMetaSystem(ctx);
  assert.equal(meta.getMetaLoadoutBudget().valid, false);
  assert.equal(getMetaLoadoutBudget().valid, false);
  assert.equal(meta.isMetaLoadoutLocked(), false);
  const defaults = meta.getMetaSave();
  assert.deepEqual(meta.getMetaLoadoutBudget(), {
    mainCount: 1, mainSlots: 1, auxCount: 3, maxAuxCount: 3, auxPoints: 4,
    maxAuxPoints: 4, remainingPoints: 0, valid: true, reason: null,
  });
  assert.equal(meta.getMetaLoadoutBudget(null).reason, 'invalid_main');
  assert.equal(meta.saveMetaSave({ ...defaults, legacyShards: 1000 }), true);
  for (const id of ['aux_salvage_craft', 'aux_telegraph_buffer', 'aux_tactical_reserve']) {
    assert.equal(meta.unlockMetaItem('aux', id).ok, true, id);
  }
  assert.deepEqual(sounds, Array.from({ length: 3 }, () => ['level', 1.15]));
  assert.equal(meta.toggleMetaAuxLegacy('aux_salvage_craft').reason, 'aux_count_exceeded');
  assert.equal(meta.setMetaLoadout('main_frost', [...defaults.loadout.aux, 'aux_salvage_craft']).reason, 'aux_count_exceeded');
  assert.equal(meta.setMetaLoadout('main_frost', ['aux_telegraph_buffer', 'aux_tactical_reserve']).reason, 'aux_points_exceeded');
  assert.equal(meta.setMetaLoadout('main_frost', ['aux_tactical_reserve', 'aux_salvage_craft']).ok, true);
  assert.equal(meta.hasMetaAux('aux_salvage_craft'), true);
  assert.equal(meta.lockMetaLoadoutForRun().locked, true);
  game.phase = 'combat';
  assert.equal(meta.isMetaLoadoutLocked(), true);
  assert.equal(meta.setMetaMainLegacy('main_flame').reason, 'run_locked');
  assert.equal(meta.toggleMetaAuxLegacy('aux_salvage_craft', false).reason, 'run_locked');
  const lockedPool = meta.getActiveRunGearKeys();
  assert.equal(meta.unlockMetaItem('pack', 'pack_gear_ember_frost').takesEffectNextRun, true);
  assert.equal(meta.unlockMetaItem('pack', 'pack_affix_tactics').takesEffectNextRun, true);
  assert.equal(meta.getActiveRunGearKeys(), lockedPool);
  assert.equal(lockedPool.includes('ember_censer'), false);
  assert.equal(meta.getActiveRunAffixKeys().includes('storm_conduit'), false);
  assert.equal(meta.getActiveMetaMain().id, 'main_frost');
  const pools = meta.buildActiveRunPools(meta.getMetaSave());
  assert.equal(new Set(pools.activeGearKeys).size, 23);
  assert.equal(new Set(pools.activeAffixKeys).size, 12);
  assert.equal(pools.activeGearKeys.length, 23);
  assert.equal(pools.activeAffixKeys.length, 12);
  for (const id of ['ember_censer', 'glacier_bell', 'flame_fan', 'frost_mirror']) {
    assert.ok(pools.activeGearKeys.includes(id), id);
  }
  for (const id of ['storm_conduit', 'aegis_pulse']) assert.ok(pools.activeAffixKeys.includes(id), id);
  game.phase = 'lost';
  assert.equal(meta.isMetaLoadoutLocked(), false);
});

test('main-legacy weight tilt renormalizes and consumes one roll after reading the candidate elements', () => {
  const calls = [];
  const ctx = createRuntimeContext({ game: { rnd: () => {
    calls.push('roll');
    return 0.5;
  } } });
  const meta = createMetaSystem(ctx);
  const items = ['fire', 'frost', 'wind'];
  const getElem = item => {
    calls.push(item);
    return item;
  };
  const table = meta.getMainLegacyWeightTable(items, getElem);
  assert.deepEqual(table.map(entry => entry.rawW), [1.35, 1, 1]);
  assert.deepEqual(table.map(entry => entry.prob), [1.35 / 3.35, 1 / 3.35, 1 / 3.35]);
  calls.length = 0;
  assert.equal(meta.pickWeightedByMainLegacy([], getElem), null);
  assert.deepEqual(calls, []);
  assert.equal(meta.pickWeightedByMainLegacy(items, getElem), 'frost');
  assert.deepEqual(calls, ['fire', 'frost', 'wind', 'roll']);
  assert.equal(meta.pickWeightedByMainLegacy(items, item => item, () => 0), 'fire');
  assert.equal(meta.pickWeightedByMainLegacy(items, item => item, () => 1), 'wind');
});

test('reward bands use cleared waves and preserve Boss, W10, W20 and W30 bonuses', () => {
  const meta = createMetaSystem(createRuntimeContext());
  for (const [cleared, band1, band2, band3] of [
    [0, 0, 0, 0], [1, 0, 0, 0], [2, 0, 0, 0], [3, 1, 0, 0],
    [9, 10, 0, 0], [10, 12, 0, 0], [11, 12, 3, 0], [19, 12, 31, 0],
    [20, 12, 35, 0], [21, 12, 35, 7], [29, 12, 35, 63],
  ]) {
    const reward = meta.calculateRunShardRewards(false, { wave: cleared + 1 });
    assert.deepEqual([
      reward.clearedWaves, reward.eligible, reward.band1Shards, reward.band2Shards, reward.band3Shards, reward.runShards,
    ], [cleared, cleared >= 3, band1, band2, band3, band1 + band2 + band3]);
  }
  assert.equal(meta.calculateRunShardRewards(false, { wave: 2, stats: { bossKills: 1 } }).runShards, 4);
  const game = {
    wave: 30, stats: { bossKills: 6 },
    hero: { breakthroughs: { w10: {}, w20: { placeholder: true } }, vouchers: { w20: true } },
  };
  const victory = meta.calculateRunShardRewards(true, game);
  assert.deepEqual([
    victory.clearedWaves, victory.bossBonus, victory.w10Bonus,
    victory.w20Bonus, victory.w30VictoryBonus, victory.runShards,
  ], [30, 24, 12, 28, 140, 314]);
  game.hero.vouchers.w20 = false;
  assert.equal(meta.calculateRunShardRewards(true, game).w20Bonus, 0);
});

test('settlement grants milestones once and blocks the same run ID even in a new context', () => {
  const { storage, writes } = createStorage();
  const game = { wave: 6, seed: 36 };
  const ports = { storage: { getStorage: () => storage }, clock: { nowMs: () => 36 } };
  const ctx = createRuntimeContext({ game, ports });
  const meta = createMetaSystem(ctx);
  assert.equal(meta.generateRunId(36), 'run_10_10_1');
  assert.deepEqual(meta.checkEligibleNewMilestones(false, createDefaultMetaSave(), game).map(ms => ms.id), ['ms_reach_w5']);

  const first = meta.settleRunMetaRewards(false);
  assert.equal(first.runId, 'run_10_10_2');
  assert.equal(first.runShards, 4);
  assert.equal(first.milestoneShards, 25);
  assert.equal(first.totalShardsGrantedThisCall, 29);
  assert.deepEqual(first.newlyClaimedMilestones.map(ms => ms.id), ['ms_reach_w5']);
  assert.deepEqual(meta.checkEligibleNewMilestones(false, meta.getMetaSave(), game), []);

  const replayGame = { ...game, metaSettlement: null };
  const replay = createMetaSystem(createRuntimeContext({ game: replayGame, ports }));
  for (const duplicate of [meta.settleRunMetaRewards(false), replay.settleRunMetaRewards(false)]) {
    assert.equal(duplicate.duplicateBlocked, true);
    assert.equal(duplicate.totalShardsGrantedThisCall, 0);
    assert.equal(duplicate.shardsAfter, 29);
  }
  assert.deepEqual(writes, [storageKey]);
  ctx.setGame({ wave: 6, runId: 'next-run' });
  assert.equal(meta.settleRunMetaRewards(false).totalShardsGrantedThisCall, 4);
  assert.equal(meta.getMetaSave().stats.totalRuns, 2);
  assert.deepEqual(meta.getMetaSave().claimedMilestones, ['ms_reach_w5']);
});

test('failed settlement is held for retry and persists exactly once when storage recovers', () => {
  const { storage, writes } = createStorage();
  storage.failWrite = true;
  const game = { wave: 6, runId: 'retry-run', phase: 'lost', activeModal: { type: 'end' } };
  const effects = [];
  const ctx = createRuntimeContext({
    game,
    ports: {
      storage: { getStorage: () => storage },
      ui: {
        toast: (...args) => effects.push(['toast', ...args]),
        renderAllUI: force => effects.push(['render', force]),
      },
      modals: { showEndModal: victory => effects.push(['end', victory]) },
    },
  });
  const meta = createMetaSystem(ctx);
  const failed = meta.settleRunMetaRewards(false);
  assert.equal(failed.saveStatus, 'failed');
  assert.equal(failed.persisted, false);
  assert.equal(failed.saveError, 'disk full');
  const status = meta.getMetaStorageStatus();
  assert.equal(status.state, 'save_error');
  assert.equal(status.saveFailed, true);
  assert.equal(status.pendingUnsavedSettlement.runId, game.runId);
  assert.equal(status.pendingUnsavedSettlement.saveSnapshot.legacyShards, 29);
  status.pendingUnsavedSettlement.saveSnapshot.legacyShards = 900;
  assert.deepEqual(meta.settleRunMetaRewards(false), failed);
  assert.deepEqual(writes, []);
  assert.deepEqual(effects[0], [
    'toast', '⚠️ 本地存档写入失败，本局奖励尚未持久化！请在结算页点击【重试保存】或【导出备份 JSON】。', true,
  ]);
  assert.equal(meta.retryPendingMetaSave().ok, false);
  assert.equal(meta.getMetaStorageStatus().pendingUnsavedSettlement.runId, game.runId);

  storage.failWrite = false;
  const result = meta.retryPendingMetaSave();
  assert.equal(result.ok, true);
  assert.equal(result.record.saveStatus, 'saved');
  assert.equal(result.record.persisted, true);
  assert.equal(result.record.saveError, null);
  assert.equal(meta.getMetaStorageStatus().state, 'ok');
  assert.equal(meta.getMetaStorageStatus().saveFailed, false);
  assert.equal(meta.getMetaStorageStatus().pendingUnsavedSettlement, null);
  assert.equal(JSON.parse(storage.getItem(storageKey)).legacyShards, 29);
  assert.equal(JSON.parse(storage.getItem(storageKey)).lastSettlement.persisted, true);
  assert.equal(meta.settleRunMetaRewards(false).totalShardsGrantedThisCall, 0);
  assert.deepEqual(writes, [storageKey]);
  assert.deepEqual(effects.slice(-2), [['end', false], ['render', true]]);
});
