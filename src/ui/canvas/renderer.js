import { createCameraController } from './camera.js';
import { createArenaDrawer } from './draw-arena.js';
import { createEffectsDrawer } from './draw-effects.js';
import { createEntitiesDrawer } from './draw-entities.js';
import { createOverlaysDrawer } from './draw-overlays.js';

export function createCanvasRenderer(runtimeCtx, { canvas, ctx, getEl, getViewportSize, perfStats, hero, unlock, combat }) {
  const camera = createCameraController(runtimeCtx, { canvas, getEl, getViewportSize });
  const { cam, worldToScreen } = camera;
  const { drawArena } = createArenaDrawer(runtimeCtx, { ctx, cam, perfStats });
  const { drawArtifacts, drawHero, drawEnemies, drawPickups } = createEntitiesDrawer(runtimeCtx, { ctx, hero, unlock, combat });
  const { drawZones, drawProjectilesBeamsBolts, drawRingsAndFloats } = createEffectsDrawer(runtimeCtx, { ctx });
  const { drawTopTelegraphs, drawW30BossTopBar, drawEdgeIndicators } = createOverlaysDrawer(runtimeCtx, { ctx, cam, worldToScreen });

  function render(){
    const game = runtimeCtx.game;
    if (!game) return;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.fillStyle = '#091014';
    ctx.fillRect(0, 0, cam.w, cam.h);

    const sx = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    const sy = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;

    ctx.save();
    ctx.translate(cam.w / 2 + sx, cam.h / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    drawArena();
    drawZones();
    drawPickups();
    drawEnemies();
    drawHero();
    drawArtifacts();
    drawProjectilesBeamsBolts();
    drawTopTelegraphs();
    drawRingsAndFloats();

    ctx.restore();

    // Screen-space offscreen directional arrows (Boss / Elite / Chests) & W30 Boss Top Bar
    drawEdgeIndicators();
    drawW30BossTopBar();
  }

  return { ...camera, render };
}
