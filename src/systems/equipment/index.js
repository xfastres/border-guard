import {
  createGearInstances,
  isGearInstance,
  gearBase,
  gearStar,
  gearLabel,
  findGearStackTarget,
  validateGearAffixes,
  getGearBaseMult,
} from './instance.js';
import {
  createGearSynergies,
  evaluateSynergySetFromAffixIds,
  evaluateItemSynergies,
  buildChainHint,
} from './synergy.js';
import { describeGearEffect, describeGearInstance } from './describe.js';

export { createEquipmentInventory } from './inventory.js';
export { createAffixTransfer, getAffixTransferCost, describeTransferError } from './transfer.js';

export {
  isGearInstance,
  gearBase,
  gearStar,
  gearLabel,
  findGearStackTarget,
  validateGearAffixes,
  getGearBaseMult,
  evaluateSynergySetFromAffixIds,
  evaluateItemSynergies,
  buildChainHint,
  describeGearEffect,
  describeGearInstance,
};

export function createEquipmentCore(ctx, meta) {
  return {
    isGearInstance,
    gearBase,
    gearStar,
    gearLabel,
    findGearStackTarget,
    validateGearAffixes,
    getGearBaseMult,
    ...createGearInstances(ctx, meta),
    evaluateSynergySetFromAffixIds,
    evaluateItemSynergies,
    buildChainHint,
    ...createGearSynergies(ctx),
    describeGearEffect,
    describeGearInstance,
  };
}
