import { createCameraController } from './camera.js';
import { createArenaDrawer } from './draw-arena.js';
import { createEffectsDrawer } from './draw-effects.js';
import { createEntitiesDrawer } from './draw-entities.js';
import { createOverlaysDrawer } from './draw-overlays.js';
import { drawAfterimages, drawSpellParticles, drawSpellSurface } from './spell-effects.js';

export function createCanvasRenderer(runtimeCtx, {
  canvas, ctx, getEl, getViewportSize, perfStats, hero, unlock, combat, battleVfx, makeSurface, now = () => performance.now(),
}) {
  const camera = createCameraController(runtimeCtx, { canvas, getEl, getViewportSize });
  const { cam, worldToScreen } = camera;
  let halfW = 0, halfH = 0;
  const visible = (x, y, radius = 0) => Math.abs(x - cam.x) <= halfW + radius && Math.abs(y - cam.y) <= halfH + radius;
  const { drawArena, drawLighting } = createArenaDrawer(runtimeCtx, { ctx, cam, perfStats, makeSurface });
  const { drawArtifacts, drawHero, drawEnemies, drawPickups } = createEntitiesDrawer(runtimeCtx, {
    ctx, hero, unlock, combat, visible, scene: battleVfx,
  });
  const { drawZones, drawProjectilesBeamsBolts, drawRingsAndFloats } = createEffectsDrawer(runtimeCtx, { ctx, visible, scene: battleVfx, now });
  const { drawTopTelegraphs, drawW30BossTopBar, drawEdgeIndicators } = createOverlaysDrawer(runtimeCtx, { ctx, cam, worldToScreen });

  function render(){
    const game = runtimeCtx.game;
    if (!game) return;
    const time = now();
    battleVfx.sample(time, perfStats.fps);
    halfW = cam.w / (2 * cam.zoom) + 18;
    halfH = cam.h / (2 * cam.zoom) + 18;

    // Render quality changes affect pixel density alone. Camera and input keep CSS coordinates.
    const quality = battleVfx.quality;
    const pixelRatio = quality === 'high' ? cam.dpr : Math.min(quality === 'low' ? .78 : .70, cam.dpr);
    const width = Math.round(cam.w * pixelRatio), height = Math.round(cam.h * pixelRatio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = '#080f15';
    ctx.fillRect(0, 0, cam.w, cam.h);
    const jitter = battleVfx.quality === 'off' ? 0 : Math.min(6, game.shake * .32 + battleVfx.shake * 28);
    const sx = Math.sin(time * .16) * jitter;
    const sy = Math.cos(time * .137) * jitter * .68;

    ctx.save();
    ctx.translate(cam.w / 2 + sx, cam.h / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawArena(quality);
    drawLighting(quality, pixelRatio);
    drawZones();
    drawSpellSurface(ctx, battleVfx, visible);
    drawPickups();
    drawAfterimages(ctx, battleVfx);
    drawArtifacts();
    drawEnemies();
    drawHero();
    drawProjectilesBeamsBolts();
    drawSpellParticles(ctx, battleVfx, visible);
    drawTopTelegraphs();
    drawRingsAndFloats();
    ctx.restore();

    drawEdgeIndicators();
    drawW30BossTopBar();
  }

  return { ...camera, render };
}
