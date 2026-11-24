import {
  createDefaultMetaSave,
  getMetaAuxSpec,
  getMetaConfig,
  getMetaLoadoutBudget,
  getMetaMainSpec,
  getMetaPackSpec,
} from './config.js';
import { createMetaLoadout } from './loadout.js';
import { createMetaPersistence, migrateMetaSave, normalizeMetaSave } from './persistence.js';
import { createMetaRewards } from './rewards.js';

export { createDefaultMetaSave, getMetaAuxSpec, getMetaConfig, getMetaLoadoutBudget, getMetaMainSpec, getMetaPackSpec };
export { META_SAVE_MIGRATORS, migrateMetaSave, normalizeMetaSave } from './persistence.js';

export function createMetaSystem(ctx) {
  const persistence = createMetaPersistence(ctx);
  const loadout = createMetaLoadout(ctx, persistence);
  const rewards = createMetaRewards(ctx, persistence, loadout);

  function refreshRunLoadout() {
    if (ctx.game && !loadout.isMetaLoadoutLocked()) {
      const { main, aux } = ctx.meta.save.loadout;
      ctx.game.metaLoadout = { main, aux: aux.slice() };
      loadout.syncRunActivePools();
    }
  }

  return {
    getMetaConfig,
    getMetaMainSpec,
    getMetaAuxSpec,
    getMetaPackSpec,
    createDefaultMetaSave,
    getMetaLoadoutBudget: (value = ctx.meta.save?.loadout) => getMetaLoadoutBudget(value),
    normalizeMetaSave,
    migrateMetaSave,
    ...persistence,
    ...loadout,
    ...rewards,
    resetMetaSave: () => persistence.resetMetaSave(refreshRunLoadout),
    importMetaSave: input => persistence.importMetaSave(input, refreshRunLoadout),
  };
}
