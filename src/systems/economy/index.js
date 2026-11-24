import { createResourceLedger } from './ledger.js';
import { createEconomyPricing } from './pricing.js';

export { RESOURCE_LEDGER_MAX } from './ledger.js';
export {
  getGearSellGold,
  getGearEnhanceCost,
  getBagCapacity,
  isBagSeal,
  getEndgameRefinementConfig,
  getWaveClearMaterialBonus,
} from './pricing.js';

export function createEconomyCore(ctx, deps) {
  return {
    ...createResourceLedger(ctx),
    ...createEconomyPricing(ctx, deps),
  };
}
