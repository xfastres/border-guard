import { clamp } from '../../core/math.js';
import { CELL, H, W } from '../../data/index.js';

export function createCameraController(runtimeCtx, {
  canvas,
  getEl = id => document.getElementById(id),
  getViewportSize = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  }),
} = {}) {
  const cam = { x: (W / 2) * CELL, y: (H / 2) * CELL, zoom: 1, w: 1280, h: 720, dpr: 1 };

  function fitCamera(){
    const { width, height, dpr } = getViewportSize();
    cam.w = width;
    cam.h = height;
    cam.dpr = Math.min(2, dpr);
    canvas.width = Math.round(cam.w * cam.dpr);
    canvas.height = Math.round(cam.h * cam.dpr);
    const availH = Math.max(300, cam.h - 170);
    const availW = Math.max(300, cam.w - 24);
    // Fixed ~24x16 tactical viewport window moving across 64x48 open world
    cam.zoom = clamp(Math.min(availW / (24 * CELL), availH / (16 * CELL)), 0.72, 1.15);
    if (runtimeCtx.game) updateCamera(0, true);
  }

  function updateCamera(dt, snap = false){
    const game = runtimeCtx.game;
    if (!game) return;
    const worldW = W * CELL, worldH = H * CELL;
    // Reserve HUD safe margins so world borders & hero are NEVER occluded by topbar/subbar or bottom shop dock
    const subRect = getEl('subbar')?.getBoundingClientRect?.();
    const dockRect = getEl('dock')?.getBoundingClientRect?.();
    const topSafePx = clamp((subRect?.bottom || 104) + 14, 70, cam.h * 0.30);
    const botSafePx = clamp((dockRect?.height || 86) + 22, 70, cam.h * 0.30);
    const sideSafePx = 18;

    const minCamX = (cam.w / 2 - sideSafePx) / cam.zoom;
    const maxCamX = worldW - (cam.w / 2 - sideSafePx) / cam.zoom;
    const minCamY = (cam.h / 2 - topSafePx) / cam.zoom;
    const maxCamY = worldH - (cam.h / 2 - botSafePx) / cam.zoom;

    let tx = game.hero.x * CELL;
    let ty = game.hero.y * CELL;
    if (minCamX >= maxCamX) tx = worldW / 2;
    else tx = clamp(tx, minCamX, maxCamX);
    if (minCamY >= maxCamY) ty = worldH / 2;
    else ty = clamp(ty, minCamY, maxCamY);

    if (snap || dt <= 0) {
      cam.x = tx; cam.y = ty;
    } else {
      const k = 1 - Math.exp(-8.5 * dt);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
    }
  }

  function screenToWorld(sx, sy){
    return {
      x: ((sx - cam.w / 2) / cam.zoom + cam.x) / CELL,
      y: ((sy - cam.h / 2) / cam.zoom + cam.y) / CELL
    };
  }

  function worldToScreen(wx, wy){
    return {
      x: (wx * CELL - cam.x) * cam.zoom + cam.w / 2,
      y: (wy * CELL - cam.y) * cam.zoom + cam.h / 2
    };
  }

  function resetCamera() {
    fitCamera();
    updateCamera(0, true);
  }

  return { cam, fitCamera, updateCamera, resetCamera, screenToWorld, worldToScreen };
}
