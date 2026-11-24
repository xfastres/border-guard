import { createBattleHud } from './battle-hud.js';
import { createBuildHud, gearListSig } from './build-hud.js';
import { createDockUI } from './dock-ui.js';
import { createHudController } from './hud-controller.js';
import { createInspectorUI } from './inspector.js';

export { createBattleHud, createBuildHud, createDockUI, createHudController, createInspectorUI, gearListSig };

export function createHudSystem(runtimeCtx, deps) {
  // Resolve peers at render time, after all factories are initialized.
  const hudDeps = {
    ...deps,
    get hudController() { return hudController; },
    get battleHud() { return battleHud; },
    get buildHud() { return buildHud; },
    get dockUI() { return dockUI; },
    get inspectorUI() { return inspectorUI; },
  };
  const hudController = createHudController(runtimeCtx, hudDeps);
  const battleHud = createBattleHud(runtimeCtx, hudDeps);
  const buildHud = createBuildHud(runtimeCtx, hudDeps);
  const dockUI = createDockUI(runtimeCtx, hudDeps);
  const inspectorUI = createInspectorUI(runtimeCtx, hudDeps);

  const { renderBattleHud } = battleHud;
  const { renderLeftHud } = buildHud;
  const { renderSealStrip, renderSkillStrip, renderShop, renderBag } = dockUI;
  const { renderInspector } = inspectorUI;
  return {
    ...hudController, gearListSig, renderBattleHud, renderLeftHud,
    renderSealStrip, renderSkillStrip, renderShop, renderBag, renderInspector,
  };
}
