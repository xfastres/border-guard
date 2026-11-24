import { createModalManager } from './modal-manager.js';
import { createShopConfirmModals } from './shop-confirm-modals.js';
import { createProgressionModals } from './progression-modals.js';
import { createMetaModal } from './meta-modal.js';
import { createIntroEndModals } from './intro-end-modals.js';
import { createDestinyTransferModals } from './destiny-transfer-modals.js';

export {
  createModalManager,
  createShopConfirmModals,
  createProgressionModals,
  createMetaModal,
  createIntroEndModals,
  createDestinyTransferModals,
};

export function createModalsSystem(runtimeCtx, deps) {
  // Resolve peers when a modal opens or handles an event, after all factories are initialized.
  const modalDeps = {
    ...deps,
    get modalManager() { return modalManager; },
    get shopConfirmModals() { return shopConfirmModals; },
    get progressionModals() { return progressionModals; },
    get metaModal() { return metaModal; },
    get introEndModals() { return introEndModals; },
    get destinyTransferModals() { return destinyTransferModals; },
  };
  const modalManager = createModalManager(runtimeCtx, modalDeps);
  const shopConfirmModals = createShopConfirmModals(runtimeCtx, modalDeps);
  const progressionModals = createProgressionModals(runtimeCtx, modalDeps);
  const metaModal = createMetaModal(runtimeCtx, modalDeps);
  const introEndModals = createIntroEndModals(runtimeCtx, modalDeps);
  const destinyTransferModals = createDestinyTransferModals(runtimeCtx, modalDeps);

  return {
    ...modalManager,
    ...shopConfirmModals,
    ...progressionModals,
    ...metaModal,
    ...introEndModals,
    ...destinyTransferModals,
  };
}
