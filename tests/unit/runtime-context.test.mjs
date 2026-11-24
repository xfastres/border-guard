import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoopPorts, createRuntimeContext } from '../../src/core/runtime-context.js';
import {
  getSourceStageForWave,
  getSourceStageSpec,
  perkLv,
  hasCombo,
  getW20ActiveState,
  hasW20Direction,
  hasW20Enhancement,
  hasDestinyEnhancement,
  getOwnedDestinyEnhancements,
  isFinalPrepActionLocked,
  isW29WaveRewardModal,
  hasPendingW29WaveRewards,
  getFinalPrepState,
} from '../../src/core/state-queries.js';
import { DESTINY_ENHANCEMENTS, SOURCE_STAGES } from '../../src/data/index.js';

test('runtime context replaces game and terrain by reference and notifies after updating state', () => {
  const first = { wave: 1 };
  const second = { wave: 29 };
  const changes = [];
  const context = createRuntimeContext({
    game: first,
    onGameChange(nextGame) {
      assert.equal(context.game, nextGame);
      changes.push(nextGame);
    },
    onPausedChange(nextPaused) {
      assert.equal(context.paused, nextPaused);
      changes.push(nextPaused);
    },
  });

  assert.equal(context.game, first);
  assert.deepEqual(context.terrainProps, []);
  assert.equal(context.paused, false);
  assert.deepEqual(changes, []);

  const props = [{ x: 3, y: 7 }];
  context.setTerrainProps(props);
  assert.equal(context.terrainProps, props);
  context.setGame(second);
  assert.equal(context.game, second);
  context.setGame(null);
  context.setPaused('paused');
  context.setPaused(0);
  assert.deepEqual(changes, [second, null, true, false]);
});

test('runtime context owns independent default state and counters', () => {
  const context = createRuntimeContext();
  assert.equal(context.game, null);
  assert.deepEqual(context.meta, {
    memoryStore: new Map(),
    runIdSeq: 1,
    save: null,
    storageStatus: {
      state: 'ok',
      loadError: null,
      foundVersion: null,
      supportedVersion: 1,
      saveFailed: false,
      lastSaveError: null,
      rawCorruptedBackup: null,
      pendingUnsavedSettlement: null,
    },
  });
  assert.deepEqual(context.counters, {
    gearUidSeq: 1,
    modalOfferSeq: 1,
    inFireChainTransfer: false,
    monotonicClockOverride: null,
    inMainLoopFrame: false,
  });

  const other = createRuntimeContext();
  context.meta.memoryStore.set('save', 'stored');
  context.meta.storageStatus.saveFailed = true;
  context.terrainProps.push({ x: 1 });
  context.counters.gearUidSeq++;
  assert.equal(other.meta.memoryStore.size, 0);
  assert.equal(other.meta.storageStatus.saveFailed, false);
  assert.deepEqual(other.terrainProps, []);
  assert.equal(other.counters.gearUidSeq, 1);
});

test('default ports can run without a browser', () => {
  const ports = createNoopPorts();
  assert.equal(ports.storage.getStorage(), null);
  assert.equal(ports.audio.play('hit'), undefined);
  assert.equal(ports.audio.unlock(), undefined);
  assert.equal(ports.vfx.addRing(1, 2), undefined);
  assert.equal(ports.vfx.addFloat(1, 2), undefined);
  assert.equal(ports.ui.toast('test'), undefined);
  assert.equal(ports.ui.showBanner('test'), undefined);
  assert.equal(ports.ui.flashScreen('hit'), undefined);
  assert.equal(ports.ui.renderAllUI(), undefined);
  assert.equal(ports.ui.setDangerVignette(true), undefined);
  assert.equal(ports.ui.setPaused(true), false);
  for (const method of [
    'queueModal', 'closeModal', 'openNextModal', 'showEndModal', 'showIntroModal', 'openW20PreselectModal',
    'openDestinyGambleModal', 'openAffixTransferModal', 'openMetaLegacyModal',
    'renderW10BreakthroughModal', 'renderW20PreselectModal', 'renderW20BreakthroughModal',
    'renderDestinyGambleModal', 'renderAffixTransferModal', 'renderShopConfirmModal',
    'renderW30EarlyConfirmModal', 'renderMetaLegacyModal',
  ]) {
    assert.equal(ports.modals[method](), undefined, method);
  }
  assert.deepEqual(ports.viewport.screenToWorld(5, 5), { x: 0, y: 0 });
  assert.deepEqual(ports.viewport.worldToScreen(5, 5), { x: 0, y: 0 });
  assert.deepEqual(ports.viewport.getCamera(), { x: 0, y: 0, zoom: 1, w: 1280, h: 720, dpr: 1 });
  ports.input.getKeys().add('e');
  assert.deepEqual(ports.input.getKeys(), new Set());
  assert.equal(ports.input.getPointerScreen(), null);
  assert.equal(ports.input.getPointerWorld(), null);
  assert.equal(ports.input.isPointerDown(), false);
  assert.ok(Number.isFinite(ports.clock.nowMs()));
  assert.ok(Number.isFinite(ports.clock.perfNow()));
});

test('initial and late port overrides preserve sibling methods and other contexts', () => {
  const toast = msg => `toast: ${msg}`;
  const context = createRuntimeContext({ ports: { ui: { toast }, clock: { nowMs: () => 123 } } });
  assert.equal(context.ports.ui.toast('hello'), 'toast: hello');
  assert.equal(context.ports.ui.setPaused(true), false);
  assert.ok(Number.isFinite(context.ports.clock.perfNow()));

  const store = new Map();
  context.bindPorts({ ui: { setPaused: Boolean }, storage: { getStorage: () => store } });
  context.bindPorts({ ui: { showBanner: title => title }, clock: { perfNow: () => 456 } });
  assert.equal(context.ports.ui.setPaused(true), true);
  assert.equal(context.ports.ui.showBanner('banner'), 'banner');
  assert.equal(context.ports.ui.toast('again'), 'toast: again');
  assert.equal(context.ports.ui.renderAllUI(), undefined);
  assert.equal(context.ports.storage.getStorage(), store);
  assert.equal(context.ports.clock.nowMs(), 123);
  assert.equal(context.ports.clock.perfNow(), 456);
  assert.equal(createRuntimeContext().ports.ui.setPaused(true), false);
});

test('equipment source stages preserve wave boundaries, coercion, and spec fallback', () => {
  assert.equal(getSourceStageForWave(), 1);
  for (const [wave, expected] of [
    [null, 1], [-5, 1], ['bad', 1], [1, 1], [10, 1], [10.5, 2], ['11', 2],
    [20, 2], [21, 3], [30, 3], [31, 3],
  ]) {
    assert.equal(getSourceStageForWave(wave), expected, `wave ${wave}`);
  }
  assert.equal(getSourceStageSpec(), SOURCE_STAGES[0]);
  assert.equal(getSourceStageSpec(null), SOURCE_STAGES[0]);
  assert.equal(getSourceStageSpec(99), SOURCE_STAGES[0]);
  assert.equal(getSourceStageSpec('2'), SOURCE_STAGES[1]);
  assert.equal(getSourceStageSpec(3), SOURCE_STAGES[2]);
});

test('perk and combo queries handle absent heroes and preserve level and truthiness', () => {
  const game = { hero: { perks: { fire: 2, frost: 0 }, combos: { fire: 1, frost: false } } };
  assert.equal(perkLv(null, 'fire'), 0);
  assert.equal(perkLv({}, 'fire'), 0);
  assert.equal(perkLv(game, 'fire'), 2);
  assert.equal(perkLv(game, 'frost'), 0);
  assert.equal(hasCombo(null, 'fire'), false);
  assert.equal(hasCombo({}, 'fire'), false);
  assert.equal(hasCombo(game, 'fire'), true);
  assert.equal(hasCombo(game, 'frost'), false);
});

test('W20 requires completion, a non-placeholder record, an enabled effect, and a voucher', () => {
  const inactive = {
    active: false, baseEffectActive: false, directionKey: null, enhancementKey: null, voucher: false,
  };
  const completed = { completed: true, directionKey: 'fire', enhancementKey: 'ember' };
  const w20Game = (w20, voucher) => ({ hero: { breakthroughs: { w20 }, vouchers: { w20: voucher } } });
  assert.deepEqual(getW20ActiveState(null), inactive);
  assert.equal(hasW20Direction(null, 'fire'), false);
  assert.equal(hasW20Enhancement(null, 'ember'), false);
  for (const w20 of [undefined, { ...completed, completed: false }, { ...completed, placeholder: true },
    { ...completed, baseEffectActive: false }]) {
    const game = w20Game(w20, true);
    assert.deepEqual(getW20ActiveState(game), { ...inactive, voucher: true });
    assert.equal(hasW20Direction(game, 'fire'), false);
    assert.equal(hasW20Enhancement(game, 'ember'), false);
  }
  assert.deepEqual(getW20ActiveState(w20Game(completed)), inactive);

  const game = w20Game(completed, true);
  assert.deepEqual(getW20ActiveState(game), {
    active: true, baseEffectActive: true, directionKey: 'fire', enhancementKey: 'ember', voucher: true,
  });
  assert.equal(hasW20Direction(game, 'fire'), true);
  assert.equal(hasW20Direction(game, 'frost'), false);
  assert.equal(hasW20Enhancement(game, 'ember'), true);
  assert.equal(hasW20Enhancement(game, 'ice'), false);
  assert.deepEqual(getW20ActiveState(w20Game({ completed: true }, true)), {
    ...inactive, active: true, baseEffectActive: true, voucher: true,
  });
});

test('Destiny ownership uses truthy entries and listing filters unknown specs', () => {
  const game = { hero: { destinyEnhancements: {
    destiny_golden_temper: true,
    destiny_glacial_aegis: false,
    unknown: true,
    '': true,
    destiny_ember_echo: 2,
  } } };
  assert.equal(hasDestinyEnhancement(null, 'destiny_ember_echo'), false);
  assert.equal(hasDestinyEnhancement(game, ''), false);
  assert.equal(hasDestinyEnhancement(game, 'destiny_ember_echo'), true);
  assert.equal(hasDestinyEnhancement(game, 'destiny_glacial_aegis'), false);
  assert.equal(hasDestinyEnhancement(game, 'unknown'), true);
  assert.deepEqual(getOwnedDestinyEnhancements(null), []);
  assert.deepEqual(getOwnedDestinyEnhancements(game), [
    DESTINY_ENHANCEMENTS.destiny_golden_temper, DESTINY_ENHANCEMENTS.destiny_ember_echo,
  ]);
});

test('final prep locks immediately on lock or transition and at expiration only while active and started', () => {
  assert.equal(isFinalPrepActionLocked(null), false);
  assert.equal(isFinalPrepActionLocked({}), false);
  for (const [finalPrep, expected] of [
    [{ locked: true }, true],
    [{ transitioning: true }, true],
    [{ active: true, started: true, timer: 0.01 }, false],
    [{ active: true, started: true, timer: 0 }, true],
    [{ active: true, started: true, timer: -1 }, true],
    [{ active: false, started: true, timer: 0 }, false],
    [{ active: true, started: false, timer: 0 }, false],
  ]) {
    assert.equal(isFinalPrepActionLocked({ finalPrep }), expected, JSON.stringify(finalPrep));
  }
});

test('W29 rewards can be uncollected chests, active modals, or queued modals', () => {
  assert.equal(isW29WaveRewardModal(null), false);
  const shop = { type: 'shop_confirm' };
  assert.equal(isW29WaveRewardModal(shop), false);
  assert.equal(hasPendingW29WaveRewards(null), false);
  assert.equal(hasPendingW29WaveRewards({}), false);
  assert.equal(hasPendingW29WaveRewards({ chests: [], activeModal: shop, pendingModals: [shop, null] }), false);
  assert.equal(hasPendingW29WaveRewards({ chests: [{}], pendingModals: [] }), true);
  for (const type of ['levelup', 'chest', 'perk']) {
    const reward = { type };
    assert.equal(isW29WaveRewardModal(reward), true);
    assert.equal(hasPendingW29WaveRewards({ activeModal: reward }), true);
    assert.equal(hasPendingW29WaveRewards({ activeModal: shop, pendingModals: [null, shop, reward] }), true);
  }
});

test('final prep snapshot normalizes fields and isolates nested resolution data', () => {
  assert.equal(getFinalPrepState(null), null);
  assert.equal(getFinalPrepState({}), null);
  assert.deepEqual(getFinalPrepState({ finalPrep: {} }), {
    active: false, awaitingWaveRewards: false, started: false, locked: false, transitioning: false,
    timer: 0, duration: 90, w30IntelShown: false, lastResolution: null,
  });
  const finalPrep = {
    active: 1, awaitingWaveRewards: 'yes', started: true, locked: 0, transitioning: 1,
    timer: 1.23456, duration: 60, maxSeconds: 45, w30IntelShown: 1,
    lastResolution: { rewards: [{ type: 'perk' }] },
  };
  const snapshot = getFinalPrepState({ finalPrep });
  assert.deepEqual(snapshot, {
    active: true, awaitingWaveRewards: true, started: true, locked: false, transitioning: true,
    timer: 1.235, duration: 60, w30IntelShown: true, lastResolution: { rewards: [{ type: 'perk' }] },
  });
  snapshot.lastResolution.rewards[0].type = 'chest';
  assert.equal(finalPrep.lastResolution.rewards[0].type, 'perk');
  assert.equal(getFinalPrepState({ finalPrep: { duration: 0, maxSeconds: 45 } }).duration, 45);
});
