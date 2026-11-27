import { createRuntimeContext } from '../core/runtime-context.js';
import { createDebugPresets } from '../debug/presets.js';
import { attachPublicGameApi, createPublicGameApi } from '../debug/test-api.js';
import { createCombatSystem } from '../systems/combat/index.js';
import { createEconomyCore, createShopConfirm, createShopSystem } from '../systems/economy/index.js';
import { createAffixTransfer, createEquipmentCore, createEquipmentInventory } from '../systems/equipment/index.js';
import { createHeroSkills, createHeroStats, createHeroVitals } from '../systems/hero/index.js';
import { createMetaSystem } from '../systems/meta/index.js';
import { createDestinyGamble, createRewardsSystem, createUnlockSystem, createW10Breakthrough, createW20Breakthrough } from '../systems/progression/index.js';
import { createRunSystem } from '../systems/run/index.js';
import AudioKit from '../ui/audio/audio.js';
import { createCanvasRenderer } from '../ui/canvas/index.js';
import { createFeedbackUI } from '../ui/feedback/feedback.js';
import { createHudSystem } from '../ui/hud/index.js';
import { createInputController } from '../ui/input/input.js';
import { createModalsSystem } from '../ui/modals/index.js';
import { createUiFormatters } from '../ui/shared/formatters.js';
import { createVfxManager } from '../ui/vfx/vfx.js';
import { createBattleVfx } from '../ui/vfx/battle-vfx.js';
import { createGameLoop } from './game-loop.js';

export function createGameSystems(runtimeCtx) {
  const meta = createMetaSystem(runtimeCtx);
  const equipmentCore = createEquipmentCore(runtimeCtx, meta);
  const unlock = createUnlockSystem(runtimeCtx);
  const heroStats = createHeroStats(runtimeCtx, { unlock, meta });
  const economyCore = createEconomyCore(runtimeCtx, { meta, equipment: equipmentCore });
  // Combat and lifecycle callbacks run after their peers have been constructed.
  const combat = createCombatSystem(runtimeCtx, {
    meta,
    equipment: equipmentCore,
    hero: heroStats,
    economy: economyCore,
    heroVitals: { damageHero: (...args) => heroVitals.damageHero(...args) },
    run: { completeWaveClear: (...args) => run.completeWaveClear(...args) },
  });
  const heroVitals = createHeroVitals(runtimeCtx, {
    meta, unlock, equipment: equipmentCore, hero: heroStats, combat,
    run: { finishGame: (...args) => run.finishGame(...args) },
  });
  const heroSkills = createHeroSkills(runtimeCtx, { meta, equipment: equipmentCore, hero: heroStats, combat });
  const shop = createShopSystem(runtimeCtx, {
    meta, equipment: equipmentCore, economy: economyCore, unlock, hero: heroVitals, combat,
  });
  const shopConfirm = createShopConfirm(runtimeCtx, { buyShopItem: shop.buyShopItem });
  const equipmentInventory = createEquipmentInventory(runtimeCtx, {
    equipment: equipmentCore, economy: economyCore, unlock, hero: heroStats,
  });
  const affixTransfer = createAffixTransfer(runtimeCtx, { equipment: equipmentCore, economy: economyCore, hero: heroStats });
  const w10 = createW10Breakthrough(runtimeCtx, { meta, unlock, hero: heroStats });
  const w20 = createW20Breakthrough(runtimeCtx, { equipment: equipmentCore, economy: economyCore });
  const { createGearInstance, evaluateItemSynergies, getGearSynergyHints, describeGearEffect } = equipmentCore;
  const { grantGearSafely, grantSealSafely } = equipmentInventory;
  const rewards = createRewardsSystem(runtimeCtx, {
    meta, equipment: { createGearInstance, grantGearSafely }, economy: economyCore, hero: heroStats,
  });
  const destiny = createDestinyGamble(runtimeCtx, {
    meta,
    unlock,
    equipment: { createGearInstance, evaluateItemSynergies, getGearSynergyHints, describeGearEffect, grantGearSafely, grantSealSafely },
    economy: economyCore,
    hero: { syncHeroMaxHp: heroStats.syncHeroMaxHp, gainHeroXp: heroVitals.gainHeroXp },
    combat,
  });
  const run = createRunSystem(runtimeCtx, {
    meta,
    unlock,
    equipment: { ...equipmentCore, ...affixTransfer },
    economy: { ...economyCore, ...shop, ...shopConfirm },
    hero: { ...heroStats, ...heroVitals, ...heroSkills },
    progression: { ...w20, ...destiny },
    combat,
  });

  return {
    meta, equipmentCore, unlock, heroStats, economyCore, combat, heroVitals, heroSkills,
    shop, shopConfirm, equipmentInventory, affixTransfer, w10, w20, rewards, destiny, run,
  };
}

function getMetaStorage(win) {
  try {
    if (win && win.localStorage && typeof win.localStorage.getItem === 'function' && typeof win.localStorage.setItem === 'function') {
      return win.localStorage;
    }
  } catch (_) {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch (_) {}
  return null;
}

export function bootBrowserGame({ win = window, doc = win.document } = {}) {
  const runtimeCtx = createRuntimeContext();
  const systems = createGameSystems(runtimeCtx);
  const {
    meta, equipmentCore, unlock, heroStats, economyCore, combat, heroVitals, heroSkills,
    shop, shopConfirm, equipmentInventory, affixTransfer, w10, w20, rewards, destiny, run,
  } = systems;
  const getEl = id => doc.getElementById(id);
  const canvas = getEl('gameCanvas');
  const ctx = canvas.getContext('2d');
  const now = () => win.performance.now();
  const gameLoop = createGameLoop(runtimeCtx, {
    tick: run.tick,
    render: () => viewport.render(),
    renderAllUI: full => hud.renderAllUI(full),
    now,
    scheduleFrame: callback => win.requestAnimationFrame(callback),
  });
  const { perfStats } = gameLoop;
  const battleVfx = createBattleVfx(runtimeCtx, {
    preferReducedMotion: win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  });
  const vfx = createVfxManager(runtimeCtx, battleVfx);
  const feedback = createFeedbackUI({ getEl });
  const viewport = createCanvasRenderer(runtimeCtx, {
    canvas, ctx, getEl, perfStats, hero: heroStats, unlock, combat, battleVfx, now,
    makeSurface(width, height) {
      const surface = doc.createElement('canvas');
      surface.width = width;
      surface.height = height;
      return surface;
    },
    getViewportSize: () => ({ width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio || 1 }),
  });
  const formatters = createUiFormatters({ getW10BranchSpec: w10.getW10BranchSpec });
  const modals = createModalsSystem(runtimeCtx, {
    getEl,
    startPractice: options => presets.loadTestPreset(options),
    meta,
    equipment: { ...equipmentCore, ...affixTransfer },
    economy: { ...economyCore, ...shop, ...shopConfirm },
    progression: { ...unlock, ...w10, ...w20, ...rewards, ...destiny },
    hero: { ...heroStats, ...heroVitals },
    run,
    feedback,
    audio: AudioKit,
    formatters,
    ui: { renderAllUI: (...args) => hud.renderAllUI(...args) },
  });
  const hud = createHudSystem(runtimeCtx, {
    getEl,
    getViewportWidth: () => win.innerWidth,
    perfStats, battleVfx,
    meta,
    equipment: { ...equipmentCore, ...equipmentInventory },
    economy: { ...economyCore, ...shop, ...shopConfirm },
    progression: { ...w20, ...destiny },
    hero: heroStats,
    unlock,
    run,
    modals,
    feedback,
    audio: AudioKit,
    formatters,
  });
  const input = createInputController(runtimeCtx, {
    win, canvas, getEl, viewport, hud, modals, feedback, audio: AudioKit,
    heroSkills, shop, run, affixTransfer, destiny, unlock, w20, battleVfx,
  });
  const ui = { audio: AudioKit, vfx, feedback, viewport, formatters, modals, hud, input };

  runtimeCtx.bindPorts({
    storage: { getStorage: () => getMetaStorage(win) },
    audio: { play: AudioKit.play.bind(AudioKit), unlock: AudioKit.unlock.bind(AudioKit) },
    vfx: { addRing: vfx.addRing, addFloat: vfx.addFloat, update: vfx.updateVfx, sealCast: battleVfx.sealCast, impact: battleVfx.impact },
    ui: {
      toast: feedback.toast,
      showBanner: feedback.showBanner,
      flashScreen: feedback.flashScreen,
      renderAllUI: hud.renderAllUI,
      setDangerVignette: feedback.setDangerVignette,
      setPaused: input.setPaused,
      resetRunUI() {
        hud.resetDirtyKeys();
        feedback.hideTransientFeedback();
      },
    },
    modals,
    viewport: {
      screenToWorld: viewport.screenToWorld,
      worldToScreen: viewport.worldToScreen,
      getCamera: () => viewport.cam,
      updateCamera: viewport.updateCamera,
      resetCamera: viewport.resetCamera,
    },
    clock: { perfNow: now, syncLoopTimestamp: gameLoop.syncLoopTimestamp },
    input: input.inputPort,
  });
  meta.loadMetaSave();
  input.bindListeners();
  gameLoop.syncLoopTimestamp(now());

  const presets = createDebugPresets(runtimeCtx, { systems, ui });
  const api = createPublicGameApi(runtimeCtx, { systems, ui, presets, gameLoop });
  attachPublicGameApi(api, win);

  run.startNewRun(2026, false, { preRunSetup: true });
  modals.showIntroModal();
  // Queue starter active skill selection right after closing intro.
  runtimeCtx.game.pendingModals.push({ type: 'starter' });
  gameLoop.start();

  return { runtimeCtx, systems, ui, presets, gameLoop, api };
}
