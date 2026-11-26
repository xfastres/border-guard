import BALANCE from '../../data/balance.js';
import { BASE_AFFIX_KEYS, BASE_GEAR_KEYS, GEARS, GEAR_AFFIXES } from '../../data/index.js';
import { getMetaAuxSpec, getMetaConfig, getMetaLoadoutBudget, getMetaMainSpec, getMetaPackSpec } from './config.js';

export function createMetaLoadout(ctx, persistence) {
  const { getMetaSave, saveMetaSave } = persistence;

  function isMetaLoadoutLocked(){
    if (!ctx.game) return false;
    if (ctx.game.debugRun) return true;
    if (ctx.game.phase === 'won' || ctx.game.phase === 'lost') return false;
    return !!ctx.game.metaRunLocked;
  }

  function setMetaMainLegacy(mainId){
    if (isMetaLoadoutLocked()) {
      ctx.ports.ui.toast('🔒 本局已开始，局外传承配置已锁定，禁止局内热切换！', true);
      return { ok: false, reason: 'run_locked' };
    }
    const save = getMetaSave();
    const spec = getMetaMainSpec(mainId);
    if (!spec) return { ok: false, reason: 'unknown_main' };
    if (!save.unlockedMain.includes(mainId)) {
      ctx.ports.ui.toast(`主传承【${spec.name}】尚未解锁，请先用传承碎片解锁！`, true);
      return { ok: false, reason: 'not_unlocked' };
    }
    save.loadout.main = mainId;
    saveMetaSave();
    if (ctx.game && !isMetaLoadoutLocked()) {
      ctx.game.metaLoadout = { main: save.loadout.main, aux: save.loadout.aux.slice() };
      syncRunActivePools();
    }
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, loadout: { main: save.loadout.main, aux: save.loadout.aux.slice() }, budget: getMetaLoadoutBudget(save.loadout) };
  }

  function toggleMetaAuxLegacy(auxId, forceState = null){
    if (isMetaLoadoutLocked()) {
      ctx.ports.ui.toast('🔒 本局已开始，局外传承配置已锁定，禁止局内热切换！', true);
      return { ok: false, reason: 'run_locked' };
    }
    const save = getMetaSave();
    const cfg = getMetaConfig();
    const spec = getMetaAuxSpec(auxId);
    if (!spec) return { ok: false, reason: 'unknown_aux' };
    if (!save.unlockedAux.includes(auxId)) {
      ctx.ports.ui.toast(`辅助传承【${spec.name}】尚未解锁！`, true);
      return { ok: false, reason: 'not_unlocked' };
    }
    const cur = save.loadout.aux.slice();
    const existsIdx = cur.indexOf(auxId);
    const wantEquip = forceState !== null ? !!forceState : (existsIdx === -1);

    if (!wantEquip) {
      if (existsIdx >= 0) cur.splice(existsIdx, 1);
    } else if (existsIdx === -1) {
      if (cur.length >= cfg.budget.maxAuxCount) {
        ctx.ports.ui.toast(`辅助传承上限固定为最多 ${cfg.budget.maxAuxCount} 个！`, true);
        return { ok: false, reason: 'aux_count_exceeded', budget: getMetaLoadoutBudget(save.loadout) };
      }
      const curPts = getMetaLoadoutBudget(save.loadout).auxPoints;
      if (curPts + spec.costPoints > cfg.budget.maxAuxPoints) {
        ctx.ports.ui.toast(`辅助传承总预算固定为 ${cfg.budget.maxAuxPoints} 点（当前 ${curPts}/${cfg.budget.maxAuxPoints}，【${spec.name}】需 ${spec.costPoints} 点）！`, true);
        return { ok: false, reason: 'aux_points_exceeded', budget: getMetaLoadoutBudget(save.loadout) };
      }
      cur.push(auxId);
    }
    save.loadout.aux = cur;
    saveMetaSave();
    if (ctx.game && !isMetaLoadoutLocked()) {
      ctx.game.metaLoadout = { main: save.loadout.main, aux: save.loadout.aux.slice() };
    }
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, loadout: { main: save.loadout.main, aux: save.loadout.aux.slice() }, budget: getMetaLoadoutBudget(save.loadout) };
  }

  function setMetaLoadout(main, aux){
    if (isMetaLoadoutLocked()) {
      return { ok: false, reason: 'run_locked' };
    }
    const save = getMetaSave();
    const nextMain = main ?? save.loadout.main;
    const nextAux = Array.isArray(aux) ? Array.from(new Set(aux)) : save.loadout.aux.slice();
    if (!getMetaMainSpec(nextMain)) return { ok: false, reason: 'unknown_main' };
    if (!save.unlockedMain.includes(nextMain)) return { ok: false, reason: 'not_unlocked_main' };
    for (const id of nextAux) {
      if (!getMetaAuxSpec(id)) return { ok: false, reason: `unknown_aux:${id}` };
      if (!save.unlockedAux.includes(id)) return { ok: false, reason: `not_unlocked_aux:${id}` };
    }
    const budget = getMetaLoadoutBudget({ main: nextMain, aux: nextAux });
    if (!budget.valid) return { ok: false, reason: budget.reason, budget };
    save.loadout = { main: nextMain, aux: nextAux };
    saveMetaSave();
    if (ctx.game && !isMetaLoadoutLocked()) {
      ctx.game.metaLoadout = { main: nextMain, aux: nextAux.slice() };
      syncRunActivePools();
    }
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, loadout: { main: nextMain, aux: nextAux.slice() }, budget };
  }

  function unlockMetaItem(kind, id){
    if (ctx.game?.debugRun) return { ok: false, reason: 'practice_run' };
    const save = getMetaSave();
    let spec = null;
    let list = null;
    if (kind === 'main') { spec = getMetaMainSpec(id); list = save.unlockedMain; }
    else if (kind === 'aux') { spec = getMetaAuxSpec(id); list = save.unlockedAux; }
    else if (kind === 'pack') { spec = getMetaPackSpec(id); list = save.unlockedPacks; }
    else return { ok: false, reason: 'invalid_kind' };

    if (!spec) return { ok: false, reason: 'unknown_item' };
    if (list.includes(id)) return { ok: false, reason: 'already_unlocked', shardsLeft: save.legacyShards };
    const cost = Math.max(0, Math.floor(Number(spec.unlockCost || 0)));
    if (save.legacyShards < cost) {
      ctx.ports.ui.toast(`传承碎片不足！解锁【${spec.name}】需要 💠${cost}（当前 💠${save.legacyShards}）`, true);
      return { ok: false, reason: 'insufficient_shards', need: cost, have: save.legacyShards };
    }
    save.legacyShards -= cost;
    list.push(id);
    saveMetaSave();
    // Active pool only updates on next run (or before current run locks) — NEVER hot-swaps mid-run!
    if (ctx.game && !isMetaLoadoutLocked()) {
      syncRunActivePools();
    }
    ctx.ports.audio.play('level', 1.15);
    ctx.ports.ui.toast(`💠 已解锁【${spec.name}】！${isMetaLoadoutLocked() ? '将在下一局开启时生效。' : '可在当前开局前配置中选用！'}`);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, kind, id, cost, shardsLeft: save.legacyShards, takesEffectNextRun: isMetaLoadoutLocked() };
  }

  function buildActiveRunPools(saveState = null, loadout = null){
    const cfg = getMetaConfig();
    const save = saveState || getMetaSave();
    const activeLoadout = loadout || ctx.game?.metaLoadout || save.loadout;
    const mainSpec = getMetaMainSpec(activeLoadout?.main);
    const mainElem = mainSpec?.elem || null;

    // 1. Unlocked items replace pieces of the same quality in the active gear pool.
    const targetGearSize = cfg.activePoolControl.targetActiveGearPoolSize;
    const unlockedGearExtras = [];
    for (const packId of (save.unlockedPacks || [])) {
      const pack = getMetaPackSpec(packId);
      if (pack?.type === 'gear_pack' && Array.isArray(pack.items)) {
        for (const gk of pack.items) {
          if (GEARS[gk] && !unlockedGearExtras.includes(gk)) unlockedGearExtras.push(gk);
        }
      }
    }
    let activeGearKeys = BASE_GEAR_KEYS.slice();
    for (const extraKey of unlockedGearExtras) {
      const extraSpec = GEARS[extraKey];
      if (!extraSpec || activeGearKeys.includes(extraKey)) continue;
      if (activeGearKeys.length >= targetGearSize) {
        // Rotate out 1 non-main-element base gear of matching rarity (preferring non-synergy-critical items) to keep pool size strictly constant!
        const dropIdx = activeGearKeys.findIndex(k =>
          !GEARS[k].unlockPack && GEARS[k].rarity === extraSpec.rarity && GEARS[k].elem !== mainElem && k !== 'flame_fan' && k !== 'frost_mirror'
        );
        if (dropIdx >= 0) activeGearKeys.splice(dropIdx, 1);
        else {
          const fallbackIdx = activeGearKeys.findIndex(k => !GEARS[k].unlockPack && GEARS[k].elem !== mainElem && k !== 'flame_fan' && k !== 'frost_mirror');
          if (fallbackIdx >= 0) activeGearKeys.splice(fallbackIdx, 1);
        }
      }
      activeGearKeys.push(extraKey);
    }

    // 2. Unlocks substitute general affixes and preserve all build chains.
    const targetAffixSize = cfg.activePoolControl.targetActiveAffixPoolSize;
    const unlockedAffixExtras = [];
    for (const packId of (save.unlockedPacks || [])) {
      const pack = getMetaPackSpec(packId);
      if (pack?.type === 'affix_pack' && Array.isArray(pack.items)) {
        for (const ak of pack.items) {
          if (GEAR_AFFIXES[ak] && !unlockedAffixExtras.includes(ak)) unlockedAffixExtras.push(ak);
        }
      }
    }
    let activeAffixKeys = BASE_AFFIX_KEYS.slice();
    for (const extraId of unlockedAffixExtras) {
      const extraSpec = GEAR_AFFIXES[extraId];
      if (!extraSpec || activeAffixKeys.includes(extraId)) continue;
      if (activeAffixKeys.length >= targetAffixSize) {
        const dropIdx = activeAffixKeys.findIndex(id =>
          !GEAR_AFFIXES[id].unlockPack && GEAR_AFFIXES[id].chain === 'general' && GEAR_AFFIXES[id].elem !== mainElem
        );
        if (dropIdx >= 0) activeAffixKeys.splice(dropIdx, 1);
        else {
          const fallbackIdx = activeAffixKeys.findIndex(id => !GEAR_AFFIXES[id].unlockPack && GEAR_AFFIXES[id].chain === 'general');
          if (fallbackIdx >= 0) activeAffixKeys.splice(fallbackIdx, 1);
        }
      }
      activeAffixKeys.push(extraId);
    }

    return {
      activeGearKeys,
      activeAffixKeys,
      unlockedGearExtras,
      unlockedAffixExtras,
      targetGearSize,
      targetAffixSize
    };
  }

  function syncRunActivePools(){
    if (!ctx.game) return null;
    const loadout = ctx.game.metaLoadout;
    const pools = buildActiveRunPools(getMetaSave(), loadout);
    ctx.game.metaRunState = {
      ...(ctx.game.metaRunState || {}),
      activeGearKeys: pools.activeGearKeys,
      activeAffixKeys: pools.activeAffixKeys,
      unlockedGearExtras: pools.unlockedGearExtras,
      unlockedAffixExtras: pools.unlockedAffixExtras,
      freeRefreshUsedThisWave: ctx.game.metaRunState?.freeRefreshUsedThisWave || false,
      deflectReady: ctx.game.metaRunState?.deflectReady ?? true
    };
    return pools;
  }

  function getActiveRunGearKeys(){
    if (ctx.game?.metaRunState?.activeGearKeys?.length) return ctx.game.metaRunState.activeGearKeys;
    return BASE_GEAR_KEYS;
  }

  function getActiveRunAffixKeys(){
    if (ctx.game?.metaRunState?.activeAffixKeys?.length) return ctx.game.metaRunState.activeAffixKeys;
    return BASE_AFFIX_KEYS;
  }

  function getActiveMetaLoadout(){
    if (ctx.game?.metaLoadout) return { main: ctx.game.metaLoadout.main, aux: (ctx.game.metaLoadout.aux || []).slice() };
    const save = getMetaSave();
    return { main: save.loadout.main, aux: save.loadout.aux.slice() };
  }

  function getActiveMetaMain(){
    const lo = getActiveMetaLoadout();
    return getMetaMainSpec(lo.main);
  }

  function hasMetaAux(auxId){
    const lo = getActiveMetaLoadout();
    return lo.aux.includes(auxId);
  }

  function lockMetaLoadoutForRun(){
    if (!ctx.game) return { ok: false, reason: 'no_game' };
    const save = getMetaSave();
    ctx.game.metaLoadout = { main: save.loadout.main, aux: save.loadout.aux.slice() };
    ctx.game.metaRunLocked = true;
    syncRunActivePools();
    return { ok: true, locked: true, loadout: getActiveMetaLoadout() };
  }

  // Renormalize after weighting matching elements, keeping the number of drops unchanged.
  function getMainLegacyWeightTable(items, getElemFn, focusElem = null){
    const cfg = getMetaConfig();
    const mainSpec = getActiveMetaMain();
    const mainElem = mainSpec?.elem || null;
    const tilt = mainElem ? cfg.mainRewardWeightMultiplier : 1.0;
    let total = 0;
    const entries = items.map(item => {
      const elem = getElemFn(item);
      const metaWeight = mainElem && elem === mainElem ? tilt : 1;
      const focusWeight = focusElem && elem === focusElem ? BALANCE.economy.gearFocusWeight : 1;
      const rawW = metaWeight * focusWeight;
      total += rawW;
      return { item, elem, rawW };
    });
    return entries.map(e => ({ ...e, prob: total > 0 ? e.rawW / total : 0 }));
  }

  function pickWeightedByMainLegacy(items, getElemFn, rndFn = ctx.game?.rnd || Math.random, focusElem = null){
    if (!items || !items.length) return null;
    const table = getMainLegacyWeightTable(items, getElemFn, focusElem);
    let r = rndFn();
    for (const e of table) {
      r -= e.prob;
      if (r <= 0) return e.item;
    }
    return table[table.length - 1].item;
  }

  return {
    isMetaLoadoutLocked,
    setMetaMainLegacy,
    toggleMetaAuxLegacy,
    setMetaLoadout,
    unlockMetaItem,
    buildActiveRunPools,
    syncRunActivePools,
    getActiveRunGearKeys,
    getActiveRunAffixKeys,
    getActiveMetaLoadout,
    getActiveMetaMain,
    hasMetaAux,
    lockMetaLoadoutForRun,
    getMainLegacyWeightTable,
    pickWeightedByMainLegacy,
  };
}
