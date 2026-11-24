import { createDefaultMetaSave, getMetaAuxSpec, getMetaConfig } from './config.js';

export function normalizeMetaSave(raw){
  const cfg = getMetaConfig();
  const def = createDefaultMetaSave();
  if (!raw || typeof raw !== 'object') return def;

  const validMainIds = new Set(cfg.mains.map(m => m.id));
  const validAuxIds = new Set(cfg.auxiliaries.map(a => a.id));
  const validPackIds = new Set(cfg.unlockPacks.map(p => p.id));
  const validMsIds = new Set(cfg.milestones.map(m => m.id));

  const unlockedMain = Array.from(new Set([
    ...def.unlockedMain,
    ...(Array.isArray(raw.unlockedMain) ? raw.unlockedMain.filter(id => validMainIds.has(id)) : [])
  ]));
  const unlockedAux = Array.from(new Set([
    ...def.unlockedAux,
    ...(Array.isArray(raw.unlockedAux) ? raw.unlockedAux.filter(id => validAuxIds.has(id)) : [])
  ]));
  const unlockedPacks = Array.from(new Set(
    Array.isArray(raw.unlockedPacks) ? raw.unlockedPacks.filter(id => validPackIds.has(id)) : []
  ));
  const claimedMilestones = Array.from(new Set(
    Array.isArray(raw.claimedMilestones) ? raw.claimedMilestones.filter(id => validMsIds.has(id)) : []
  ));

  const mainPick = (raw.loadout?.main && unlockedMain.includes(raw.loadout.main))
    ? raw.loadout.main
    : unlockedMain[0];
  const rawAux = Array.isArray(raw.loadout?.aux) ? Array.from(new Set(raw.loadout.aux)) : def.loadout.aux;
  const cleanAux = [];
  let pts = 0;
  for (const id of rawAux) {
    if (!unlockedAux.includes(id)) continue;
    const sp = getMetaAuxSpec(id);
    if (!sp) continue;
    if (cleanAux.length < cfg.budget.maxAuxCount && pts + sp.costPoints <= cfg.budget.maxAuxPoints) {
      cleanAux.push(id);
      pts += sp.costPoints;
    }
  }

  const settledRunIds = Array.isArray(raw.settledRunIds)
    ? Array.from(new Set(raw.settledRunIds.map(x => String(x)).filter(Boolean))).slice(-250)
    : [];

  return {
    schemaVersion: cfg.schemaVersion,
    legacyShards: Math.max(0, Math.floor(Number(raw.legacyShards || 0))),
    unlockedMain,
    unlockedAux,
    unlockedPacks,
    claimedMilestones,
    loadout: { main: mainPick, aux: cleanAux },
    stats: {
      totalRuns: Math.max(0, Math.floor(Number(raw.stats?.totalRuns || 0))),
      victories: Math.max(0, Math.floor(Number(raw.stats?.victories || 0))),
      bestWave: Math.max(0, Math.floor(Number(raw.stats?.bestWave || 0))),
      totalLegacyShardsEarned: Math.max(0, Math.floor(Number(raw.stats?.totalLegacyShardsEarned || 0))),
      noGambleVictories: Math.max(0, Math.floor(Number(raw.stats?.noGambleVictories || 0))),
      shrinesClearedTotal: Math.max(0, Math.floor(Number(raw.stats?.shrinesClearedTotal || 0)))
    },
    settledRunIds,
    lastSettlement: raw.lastSettlement && typeof raw.lastSettlement === 'object' ? { ...raw.lastSettlement } : null
  };
}

export const META_SAVE_MIGRATORS = {
  // Reserved v0 -> v1 migration hook (upgrades explicit schemaVersion === 0 legacy payloads)
  0: (payload) => ({ ...payload, schemaVersion: 1 })
};

export function migrateMetaSave(raw){
  const cfg = getMetaConfig();
  const supportedVersion = Math.max(1, Number(cfg.schemaVersion || 1));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_payload', foundVersion: null, supportedVersion };
  }
  const foundVersion = raw.schemaVersion;
  const isInt = typeof foundVersion === 'number' && Number.isInteger(foundVersion);
  if (!isInt || foundVersion < 0 || foundVersion > supportedVersion) {
    return {
      ok: false,
      reason: 'incompatible_schema_version',
      foundVersion: foundVersion ?? null,
      supportedVersion
    };
  }
  if (foundVersion < supportedVersion && typeof META_SAVE_MIGRATORS[foundVersion] !== 'function') {
    return {
      ok: false,
      reason: 'incompatible_schema_version',
      foundVersion,
      supportedVersion
    };
  }
  if (raw.loadout != null && (typeof raw.loadout !== 'object' || Array.isArray(raw.loadout))) {
    return { ok: false, reason: 'corrupted_structure', foundVersion, supportedVersion };
  }
  if (raw.stats != null && (typeof raw.stats !== 'object' || Array.isArray(raw.stats))) {
    return { ok: false, reason: 'corrupted_structure', foundVersion, supportedVersion };
  }
  let cur = { ...raw };
  let v = foundVersion;
  let guard = 0;
  while (v < supportedVersion && guard++ < 16) {
    const fn = META_SAVE_MIGRATORS[v];
    if (typeof fn !== 'function') {
      return { ok: false, reason: 'incompatible_schema_version', foundVersion, supportedVersion };
    }
    cur = fn(cur);
    v = Number(cur?.schemaVersion);
    if (!Number.isInteger(v)) {
      return { ok: false, reason: 'migration_failed', foundVersion, supportedVersion };
    }
  }
  if (v !== supportedVersion) {
    return { ok: false, reason: 'incompatible_schema_version', foundVersion, supportedVersion };
  }
  return {
    ok: true,
    reason: null,
    foundVersion,
    supportedVersion,
    migratedFrom: foundVersion !== supportedVersion ? foundVersion : null,
    save: normalizeMetaSave(cur)
  };
}

export function createMetaPersistence(ctx) {
  const { meta } = ctx;
  const metaStorageStatus = meta.storageStatus;
  const memoryStorage = {
    getItem: key => (meta.memoryStore.has(key) ? meta.memoryStore.get(key) : null),
    setItem: (key, value) => { meta.memoryStore.set(key, String(value)); },
    removeItem: key => { meta.memoryStore.delete(key); },
  };

  function getStorage() {
    return ctx.ports.storage.getStorage() ?? memoryStorage;
  }

  function getMetaStorageStatus(){
    return {
      ...metaStorageStatus,
      pendingUnsavedSettlement: metaStorageStatus.pendingUnsavedSettlement
        ? JSON.parse(JSON.stringify(metaStorageStatus.pendingUnsavedSettlement))
        : null
    };
  }

  function exportRawCorruptedMetaSave(){
    return metaStorageStatus.rawCorruptedBackup || null;
  }

  function loadMetaSave(){
    const cfg = getMetaConfig();
    const store = getStorage();
    metaStorageStatus.supportedVersion = Math.max(1, Number(cfg.schemaVersion || 1));
    let rawStr = null;
    try {
      rawStr = store.getItem(cfg.storageKey);
    } catch (err) {
      metaStorageStatus.state = 'load_error';
      metaStorageStatus.loadError = 'storage_read_error';
      metaStorageStatus.lastSaveError = String(err?.message || err || 'storage_read_error');
      meta.save = createDefaultMetaSave();
      return meta.save;
    }
    if (rawStr == null || rawStr === '') {
      meta.save = createDefaultMetaSave();
      metaStorageStatus.state = metaStorageStatus.saveFailed ? 'save_error' : 'ok';
      metaStorageStatus.loadError = null;
      metaStorageStatus.foundVersion = null;
      metaStorageStatus.rawCorruptedBackup = null;
      return meta.save;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(rawStr);
    } catch (_) {
      // NEVER silently overwrite corrupted stored data!
      metaStorageStatus.state = 'load_error';
      metaStorageStatus.loadError = 'corrupted_json';
      metaStorageStatus.foundVersion = null;
      metaStorageStatus.rawCorruptedBackup = rawStr;
      meta.save = createDefaultMetaSave();
      return meta.save;
    }
    const mig = migrateMetaSave(parsed);
    if (!mig.ok) {
      // NEVER silently overwrite incompatible/future schemaVersion or corrupted structure!
      metaStorageStatus.state = 'load_error';
      metaStorageStatus.loadError = mig.reason;
      metaStorageStatus.foundVersion = mig.foundVersion ?? null;
      metaStorageStatus.supportedVersion = mig.supportedVersion;
      metaStorageStatus.rawCorruptedBackup = rawStr;
      meta.save = createDefaultMetaSave();
      return meta.save;
    }
    meta.save = mig.save;
    metaStorageStatus.state = metaStorageStatus.saveFailed ? 'save_error' : 'ok';
    metaStorageStatus.loadError = null;
    metaStorageStatus.foundVersion = mig.foundVersion;
    metaStorageStatus.rawCorruptedBackup = null;
    return meta.save;
  }

  function saveMetaSave(saveObj, opts = {}){
    const cfg = getMetaConfig();
    const store = getStorage();
    if (metaStorageStatus.state === 'load_error' && !opts?.forceOverwriteCorrupted) {
      metaStorageStatus.saveFailed = true;
      metaStorageStatus.lastSaveError = 'protected_corrupted_storage';
      return false;
    }
    if (saveObj !== undefined) meta.save = saveObj;
    if (!meta.save) meta.save = createDefaultMetaSave();
    meta.save = normalizeMetaSave(meta.save);
    try {
      store.setItem(cfg.storageKey, JSON.stringify(meta.save));
      metaStorageStatus.saveFailed = false;
      metaStorageStatus.lastSaveError = null;
      if (opts?.forceOverwriteCorrupted) {
        metaStorageStatus.loadError = null;
        metaStorageStatus.rawCorruptedBackup = null;
      }
      metaStorageStatus.state = 'ok';
      return true;
    } catch (err) {
      metaStorageStatus.saveFailed = true;
      metaStorageStatus.lastSaveError = String(err?.message || err || 'storage_write_failed');
      if (metaStorageStatus.state !== 'load_error') metaStorageStatus.state = 'save_error';
      return false;
    }
  }

  function getMetaSave(){
    if (!meta.save) loadMetaSave();
    return meta.save;
  }

  function resetMetaSave(refreshRunLoadout){
    const cfg = getMetaConfig();
    const store = getStorage();
    try { store.removeItem(cfg.storageKey); } catch (_) {}
    metaStorageStatus.state = 'ok';
    metaStorageStatus.loadError = null;
    metaStorageStatus.foundVersion = null;
    metaStorageStatus.rawCorruptedBackup = null;
    metaStorageStatus.pendingUnsavedSettlement = null;
    meta.save = createDefaultMetaSave();
    const saved = saveMetaSave(undefined, { forceOverwriteCorrupted: true });
    refreshRunLoadout?.();
    ctx.ports.ui.renderAllUI(true);
    return { ok: saved, reason: saved ? null : 'storage_write_failed', save: JSON.parse(JSON.stringify(meta.save)) };
  }

  function exportMetaSave(){
    const cur = getMetaSave();
    return JSON.stringify(cur, null, 2);
  }

  function importMetaSave(jsonOrObj, refreshRunLoadout){
    try {
      const parsed = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
      const mig = migrateMetaSave(parsed);
      if (!mig.ok) {
        return {
          ok: false,
          reason: mig.reason,
          foundVersion: mig.foundVersion,
          supportedVersion: mig.supportedVersion
        };
      }
      const prevSave = meta.save ? JSON.parse(JSON.stringify(meta.save)) : null;
      meta.save = mig.save;
      const saved = saveMetaSave(undefined, { forceOverwriteCorrupted: true });
      if (!saved) {
        if (prevSave) meta.save = prevSave;
        return { ok: false, reason: 'storage_write_failed', error: metaStorageStatus.lastSaveError };
      }
      metaStorageStatus.pendingUnsavedSettlement = null;
      refreshRunLoadout?.();
      ctx.ports.ui.renderAllUI(true);
      return { ok: true, migratedFrom: mig.migratedFrom, save: JSON.parse(JSON.stringify(meta.save)) };
    } catch (err) {
      return { ok: false, reason: 'parse_error', error: String(err?.message || err) };
    }
  }

  return {
    getMetaStorageStatus,
    exportRawCorruptedMetaSave,
    loadMetaSave,
    saveMetaSave,
    getMetaSave,
    resetMetaSave,
    exportMetaSave,
    importMetaSave,
  };
}
