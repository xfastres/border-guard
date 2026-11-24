const noop = () => {};

export function createNoopPorts() {
  return {
    storage: { getStorage: () => null },
    audio: { play: noop, unlock: noop },
    vfx: { addRing: noop, addFloat: noop },
    ui: {
      toast: noop,
      showBanner: noop,
      flashScreen: noop,
      renderAllUI: noop,
      setDangerVignette: noop,
      setPaused: () => false,
    },
    modals: {
      queueModal: noop,
      closeModal: noop,
      openNextModal: noop,
      showEndModal: noop,
      openW20PreselectModal: noop,
      openDestinyGambleModal: noop,
      openAffixTransferModal: noop,
      openMetaLegacyModal: noop,
      renderW10BreakthroughModal: noop,
      renderW20PreselectModal: noop,
      renderW20BreakthroughModal: noop,
      renderDestinyGambleModal: noop,
      renderAffixTransferModal: noop,
      renderShopConfirmModal: noop,
      renderW30EarlyConfirmModal: noop,
    },
    viewport: {
      screenToWorld: () => ({ x: 0, y: 0 }),
      worldToScreen: () => ({ x: 0, y: 0 }),
      getCamera: () => ({ x: 0, y: 0, zoom: 1, w: 1280, h: 720, dpr: 1 }),
    },
    input: {
      getKeys: () => new Set(),
      getPointerScreen: () => null,
      getPointerWorld: () => null,
      isPointerDown: () => false,
    },
    clock: {
      nowMs: () => Date.now(),
      perfNow: () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()),
    },
  };
}

export function createRuntimeContext({ game = null, ports: initialPorts = {}, onGameChange = null, onPausedChange = null } = {}) {
  let terrainProps = [];
  let paused = false;
  const ports = createNoopPorts();

  function bindPorts(partialPorts) {
    for (const group of Object.keys(ports)) {
      Object.assign(ports[group], partialPorts[group]);
    }
  }
  bindPorts(initialPorts);

  return {
    get game() { return game; },
    setGame(nextGame) {
      game = nextGame;
      onGameChange?.(nextGame);
    },
    get terrainProps() { return terrainProps; },
    setTerrainProps(props) { terrainProps = props; },
    get paused() { return paused; },
    setPaused(value) {
      paused = !!value;
      onPausedChange?.(paused);
    },
    meta: {
      memoryStore: new Map(),
      runIdSeq: 1,
      save: null,
      storageStatus: {
        mode: 'unknown',
        lastLoadState: 'init',
        lastSaveOk: true,
        lastError: null,
        pendingSave: false,
        hasCorruptedRaw: false,
        corruptedRawSnapshot: null,
        migratedFromVersion: null,
        lastMigratedAt: null,
        schemaVersion: 1,
      },
    },
    counters: {
      gearUidSeq: 1,
      modalOfferSeq: 1,
      inFireChainTransfer: false,
      monotonicClockOverride: null,
      inMainLoopFrame: false,
    },
    ports,
    bindPorts,
  };
}
