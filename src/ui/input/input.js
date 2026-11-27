import { clamp } from '../../core/math.js';
import { H, W } from '../../data/index.js';
import { bindCompactPanels } from './compact-panels.js';

export function createInputController(runtimeCtx, deps) {
  const keys = new Set();
  let pointerDown = false;
  let pointerScreen = null;
  let pointerWorld = null;

  const inputPort = {
    getKeys: () => keys,
    getPointerScreen: () => pointerScreen,
    getPointerWorld: () => pointerWorld,
    setPointerWorld: pt => { pointerWorld = pt; },
    isPointerDown: () => pointerDown,
  };

  function handleCanvasClick(wx, wy){
    runtimeCtx.game.hero.goal = { x: clamp(wx, 1.2, W - 1.2), y: clamp(wy, 1.2, H - 1.2) };
  }

  function setPaused(val){
    runtimeCtx.setPaused(val);
    deps.hud.renderAllUI();
    return runtimeCtx.paused;
  }

  function bindListeners(){
    const { canvas, win, getEl: $, audio } = deps;
    const { screenToWorld, fitCamera } = deps.viewport;
    const { renderAllUI, toggleLeftHud, toggleBattleHud, syncOffsets, syncHudResponsiveMode, setLeftTab } = deps.hud;
    const {
      closeModal, showIntroModal, renderW10BreakthroughModal, openW20BreakthroughModal,
      openW20PreselectModal, openDestinyGambleModal, openAffixTransferModal, openMetaLegacyModal,
    } = deps.modals;
    const { castHeroDash, castHeroOverdrive } = deps.heroSkills;
    const keyButton = key => key === ' ' || key === 'e' ? $('dashBtn') : key === 'r' ? $('ultBtn') : null;
    const { rollShop } = deps.shop;
    const { startNewRun, startWave } = deps.run;
    const { toast } = deps.feedback;
    const { cancelAffixTransferPreview } = deps.affixTransfer;
    const { getPendingDestinyOffer } = deps.destiny;
    const { hasPendingDecision } = deps.unlock;
    const { isW20PreselectOpen } = deps.w20;

    const panels = bindCompactPanels(runtimeCtx, { getEl: $, win, renderAllUI, setLeftTab, clearInput: () => { keys.clear(); pointerDown = false; } });

    canvas.addEventListener('pointerdown', e => {
      if (panels.isOpen()) return;
      if (e.button !== 0) return;
      audio.unlock();
      pointerScreen = { x: e.clientX, y: e.clientY };
      const w = screenToWorld(e.clientX, e.clientY);
      pointerWorld = w;
      pointerDown = true;
      handleCanvasClick(w.x, w.y);
    });
    win.addEventListener('pointermove', e => {
      if (panels.isOpen() || (e.target && e.target !== canvas && e.target !== win)) { pointerDown = false; return; }
      pointerScreen = { x: e.clientX, y: e.clientY };
      pointerWorld = screenToWorld(e.clientX, e.clientY);
    });
    win.addEventListener('pointerup', () => { pointerDown = false; });
    function cancelMovement() {
      pointerDown = false;
      pointerScreen = null;
      pointerWorld = null;
      keys.clear();
      if (runtimeCtx.game?.hero) runtimeCtx.game.hero.goal = null;
    }
    win.addEventListener('pointercancel', cancelMovement);
    win.addEventListener('blur', cancelMovement);
    canvas.addEventListener('contextmenu', e => {
      const game = runtimeCtx.game;
      if (game?.inspTarget) { e.preventDefault(); game.inspTarget = null; renderAllUI(); }
    });

    win.addEventListener('keydown', e => {
      const game = runtimeCtx.game;
      if (!game) return;
      const k = e.key.toLowerCase();
      if (!game.activeModal && $('inspectorDialog')?.open) {
        if (k === 'escape' || k === 'c') { e.preventDefault(); $('inspClose').click(); }
        return;
      }
      if (!game.activeModal && panels.isOpen()) {
        if (k === 'escape') { e.preventDefault(); panels.close(); }
        return;
      }
      if (e.target?.closest?.('button, input, select, summary') && (k === ' ' || k === 'enter' || k === 'tab')) return;
      keys.add(k);
      if (k === 'escape') {
        if (game.activeModal?.type === 'shop_confirm') { $('shopConfirmCancelBtn')?.click(); return; }
        if (game.activeModal?.type === 'affix_transfer') { cancelAffixTransferPreview(); closeModal(); renderAllUI(); return; }
        if (game.activeModal?.type === 'destiny_gamble' && !getPendingDestinyOffer()) { closeModal(); renderAllUI(); return; }
        if (game.inspTarget) { game.inspTarget = null; renderAllUI(); }
        else if (runtimeCtx.paused) setPaused(false);
        return;
      }
      if (k === 'tab' && !game.activeModal) { e.preventDefault(); toggleLeftHud(); return; }
      if (game.activeModal) return;
      keyButton(k)?.classList.add('key-press');
      if (k === ' ' || k === 'e') { e.preventDefault(); castHeroDash(); return; }
      if (k === 'r') { castHeroOverdrive(); return; }
      if (k === 'q') { rollShop(false); return; }
      if (k === 'c') { game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' }; renderAllUI(true); return; }
      if (k === 'enter' && game.phase === 'prep') { startWave(); return; }
      if (k === 'f') { game.speed = game.speed === 2 ? 1 : 2; renderAllUI(); return; }
    });
    win.addEventListener('keyup', e => {
      const key = e.key.toLowerCase();
      keys.delete(key);
      keyButton(key)?.classList.remove('key-press');
    });
    win.addEventListener('blur', () => {
      $('dashBtn')?.classList.remove('key-press');
      $('ultBtn')?.classList.remove('key-press');
    });

    $('speedBtn').addEventListener('click', () => {
      const game = runtimeCtx.game;
      game.speed = game.speed === 2 ? 1 : 2;
      renderAllUI();
    });
    $('pauseBtn').addEventListener('click', () => {
      const { game, paused } = runtimeCtx;
      if (!paused && game?.phase === 'prep' && game?.finalPrep?.active && game.finalPrep.started) {
        toast('⏳ W29 终局整备倒计时按真实时间流逝，不可暂停！');
        renderAllUI();
        return;
      }
      setPaused(!paused);
    });
    $('soundBtn').addEventListener('click', () => { audio.enabled = !audio.enabled; renderAllUI(); });
    $('fxQualityBtn')?.addEventListener('click', () => { deps.battleVfx?.cycleMode(); renderAllUI(); });
    $('prepBuildOpen')?.addEventListener('click', () => {
      const game = runtimeCtx.game;
      if (!game || game.activeModal) return;
      game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type: 'hero' };
      renderAllUI(true);
    });
    $('helpBtn').addEventListener('click', showIntroModal);
    $('resetBtn').addEventListener('click', () => { panels.close(); startNewRun(); });
    $('dashBtn').addEventListener('click', castHeroDash);
    $('ultBtn').addEventListener('click', castHeroOverdrive);
    $('rerollBtn').addEventListener('click', () => rollShop(false));
    $('waveBtn').addEventListener('click', startWave);
    const dialog = $('inspectorDialog');
    dialog?.addEventListener('cancel', e => { e.preventDefault(); $('inspClose').click(); });
    dialog?.addEventListener('click', e => { if (e.target === dialog) $('inspClose').click(); });
    dialog?.addEventListener('focusin', () => { keys.clear(); pointerDown = false; });
    $('inspClose').addEventListener('click', () => { runtimeCtx.game.inspTarget = null; renderAllUI(); });
    $('leftHudHead')?.addEventListener('click', toggleLeftHud);
    $('battleHudHead')?.addEventListener('click', toggleBattleHud);
    $('heroPill').addEventListener('click', () => {
      const game = runtimeCtx.game;
      if (game.pendingBreakthrough === 'w10' && !game.hero.breakthroughs.w10) {
        game.activeModal = { type: 'w10_breakthrough', step: game.w10Draft?.skillKey ? 'pick_branch' : 'pick_skill' };
        renderW10BreakthroughModal();
      } else if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
        openW20BreakthroughModal();
      } else {
        game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' };
        renderAllUI(true);
      }
    });
    $('w20PrepBtn')?.addEventListener('click', () => {
      const game = runtimeCtx.game;
      if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
        openW20BreakthroughModal();
      } else if (isW20PreselectOpen()) {
        openW20PreselectModal();
      }
    });
    $('destinyBtn')?.addEventListener('click', () => openDestinyGambleModal());
    $('transferBtn')?.addEventListener('click', () => openAffixTransferModal());
    $('metaLegacyBtn')?.addEventListener('click', () => openMetaLegacyModal());
    $('metaBadge').addEventListener('click', () => {
      runtimeCtx.game.inspTarget = { type:'hero' }; renderAllUI(true);
    });
    $('heroPanelBtn').addEventListener('click', () => {
      const game = runtimeCtx.game;
      game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type:'hero' };
      renderAllUI(true);
    });
    $('autoWaveBtn').addEventListener('click', () => {
      const game = runtimeCtx.game;
      game.autoWave = !game.autoWave;
      if (game.autoWave && game.phase === 'prep') {
        if (hasPendingDecision()) {
          game.autoWavePausedForDecision = true;
          game.autoWaveTimer = 4.0;
        } else {
          game.autoWavePausedForDecision = false;
          game.autoWaveTimer = 2.0;
        }
      }
      renderAllUI();
    });
    syncHudResponsiveMode();
    win.addEventListener('resize', () => { fitCamera(); syncOffsets(); syncHudResponsiveMode(); });
  }

  return { inputPort, handleCanvasClick, setPaused, bindListeners };
}
