export function createModalManager(runtimeCtx, deps) {
  const { getEl } = deps;
  const { syncW29FinalPrepStart } = deps.run;

  function queueModal(m){
    runtimeCtx.game.pendingModals.push(m);
    if (runtimeCtx.game.autoWave && runtimeCtx.game.phase === 'prep') {
      runtimeCtx.game.autoWavePausedForDecision = true;
    }
    if (!runtimeCtx.game.activeModal) openNextModal();
  }

  function openNextModal(){
    if (!runtimeCtx.game.pendingModals.length) {
      // If W10 or W20 breakthrough is still pending and no modal is left in queue, ensure the breakthrough modal opens
      if (runtimeCtx.game && runtimeCtx.game.pendingBreakthrough === 'w10' && !runtimeCtx.game.hero.breakthroughs.w10) {
        runtimeCtx.game.activeModal = { type: 'w10_breakthrough', step: runtimeCtx.game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
        deps.progressionModals.renderW10BreakthroughModal();
        return;
      }
      if (runtimeCtx.game && runtimeCtx.game.pendingBreakthrough === 'w20' && runtimeCtx.game.w20Draft) {
        runtimeCtx.game.activeModal = { type: 'w20_breakthrough' };
        deps.progressionModals.renderW20BreakthroughModal();
        return;
      }
      closeModal();
      return;
    }
    const m = runtimeCtx.game.pendingModals.shift();
    runtimeCtx.game.activeModal = m;
    if (m.type === 'starter') deps.progressionModals.renderStarterModal();
    else if (m.type === 'levelup') deps.progressionModals.renderLevelUpModal();
    else if (m.type === 'w10_breakthrough') deps.progressionModals.renderW10BreakthroughModal();
    else if (m.type === 'w20_preselect') deps.progressionModals.renderW20PreselectModal(m);
    else if (m.type === 'w20_breakthrough') deps.progressionModals.renderW20BreakthroughModal();
    else if (m.type === 'chest') deps.progressionModals.renderChestModal(!!m.legend, !!m.shrineTier);
    else if (m.type === 'perk') deps.progressionModals.renderPerkModal(m.quality || 'ren');
    else if (m.type === 'destiny_gamble') deps.destinyTransferModals.renderDestinyGambleModal();
    else if (m.type === 'affix_transfer') deps.destinyTransferModals.renderAffixTransferModal();
    else if (m.type === 'shop_confirm') deps.shopConfirmModals.renderShopConfirmModal();
    else if (m.type === 'w30_early_confirm') deps.shopConfirmModals.renderW30EarlyConfirmModal();
    else if (m.type === 'meta_legacy') deps.metaModal.renderMetaLegacyModal(m);
  }

  function closeModal(){
    if (runtimeCtx.game) runtimeCtx.game.activeModal = null;
    hideBackdrop();
    if (runtimeCtx.game && runtimeCtx.game.pendingModals.length) {
      openNextModal();
    } else if (runtimeCtx.game && runtimeCtx.game.pendingBreakthrough === 'w10' && !runtimeCtx.game.hero.breakthroughs.w10) {
      runtimeCtx.game.activeModal = { type: 'w10_breakthrough', step: runtimeCtx.game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
      deps.progressionModals.renderW10BreakthroughModal();
    } else if (runtimeCtx.game && runtimeCtx.game.pendingBreakthrough === 'w20' && runtimeCtx.game.w20Draft) {
      runtimeCtx.game.activeModal = { type: 'w20_breakthrough' };
      deps.progressionModals.renderW20BreakthroughModal();
    } else if (runtimeCtx.game && runtimeCtx.game.finalPrep?.active && runtimeCtx.game.finalPrep.awaitingWaveRewards) {
      syncW29FinalPrepStart();
    }
  }

  function hideBackdrop(){
    getEl('modalBackdrop').hidden = true;
  }

  return { queueModal, openNextModal, closeModal, hideBackdrop };
}
