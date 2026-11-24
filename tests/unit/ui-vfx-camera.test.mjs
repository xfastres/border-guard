import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { CELL, H, MAX_FLOATS, MAX_RINGS, W } from '../../src/data/index.js';
import { createCameraController, createEffectsDrawer } from '../../src/ui/canvas/index.js';
import { createFeedbackUI } from '../../src/ui/feedback/feedback.js';
import { createVfxManager } from '../../src/ui/vfx/vfx.js';

test('VFX additions keep the newest rings and floats with their original lifetimes', () => {
  const game = { rings: [], floats: [] };
  const runtimeCtx = createRuntimeContext();
  const { addRing, addFloat } = createVfxManager(runtimeCtx);
  runtimeCtx.setGame(game);

  for (let i = 0; i <= MAX_RINGS; i++) addRing(i, 4, '#aaa', 2);
  for (let i = 0; i <= MAX_FLOATS; i++) addFloat(i, 5, `${i}`);
  addFloat(0, 6, 'critical', '#ffd166', true);

  assert.equal(game.rings.length, MAX_RINGS);
  assert.deepEqual(game.rings[0], { x: 1, y: 4, col: '#aaa', r: 2, t: 0.34, max: 0.34 });
  assert.equal(game.rings.at(-1).x, MAX_RINGS);
  assert.equal(game.floats.length, MAX_FLOATS);
  assert.deepEqual(game.floats[0], { x: 2, y: 5, txt: '2', col: '#fff', big: false, t: 0.72, max: 0.72 });
  assert.deepEqual(game.floats.at(-1), { x: 0, y: 6, txt: 'critical', col: '#ffd166', big: true, t: 1.05, max: 1.05 });
});

test('VFX update decays shake, ages timed effects, and removes expired entries', () => {
  const makeTimedEffects = () => [{ t: 0.25 }, { t: 0.5 }];
  const game = {
    shake: 6,
    rings: makeTimedEffects(),
    beams: makeTimedEffects(),
    bolts: makeTimedEffects(),
    floats: [{ t: 0.125, y: 2 }, { t: 0.5, y: 3, big: false }, { t: 1, y: 4, big: true }],
  };
  const { updateVfx } = createVfxManager(createRuntimeContext({ game }));

  updateVfx(0.25);

  assert.equal(game.shake, 1.5);
  assert.deepEqual(game.rings, [{ t: 0.25 }]);
  assert.deepEqual(game.beams, [{ t: 0.25 }]);
  assert.deepEqual(game.bolts, [{ t: 0.25 }]);
  assert.deepEqual(game.floats, [
    { t: 0.25, y: 3 - 0.25 * 0.68, big: false },
    { t: 0.75, y: 4 - 0.25 * 0.95, big: true },
  ]);
  updateVfx(0.75);
  assert.equal(game.shake, 0);
  assert.deepEqual([game.rings, game.beams, game.bolts, game.floats], [[], [], [], []]);
});

test('floating text keeps its regular and large font sizes', () => {
  const game = { rings: [], floats: [] };
  const runtimeCtx = createRuntimeContext({ game });
  const { addFloat } = createVfxManager(runtimeCtx);
  const textDraws = [];
  const ctx = { fillText(txt) { textDraws.push([txt, this.font, this.fillStyle]); } };
  addFloat(1, 2, 'hit');
  addFloat(2, 3, 'critical', '#ffd166', true);

  createEffectsDrawer(runtimeCtx, { ctx }).drawRingsAndFloats();

  assert.deepEqual(textDraws, [
    ['hit', '800 12px sans-serif', '#000'],
    ['hit', '800 12px sans-serif', '#fff'],
    ['critical', '900 15px sans-serif', '#000'],
    ['critical', '900 15px sans-serif', '#ffd166'],
  ]);
});

test('fitCamera rounds DPR-scaled dimensions and clamps DPR and zoom', () => {
  const canvas = {};
  let viewport = { width: 361, height: 641, dpr: 1.25 };
  const { cam, fitCamera } = createCameraController(createRuntimeContext(), {
    canvas, getViewportSize: () => viewport,
  });

  fitCamera();
  assert.deepEqual(canvas, { width: 451, height: 801 });
  assert.equal(cam.dpr, 1.25);
  assert.equal(cam.zoom, 0.72);

  viewport = { width: 3200, height: 1800, dpr: 3 };
  fitCamera();
  assert.deepEqual(canvas, { width: 6400, height: 3600 });
  assert.equal(cam.dpr, 2);
  assert.equal(cam.zoom, 1.15);
});

test('camera clamps to HUD margins, snaps and smooths, and converts coordinates both ways', () => {
  const game = { hero: { x: 0, y: 0 } };
  const hud = {
    subbar: { getBoundingClientRect: () => ({ bottom: 126 }) },
    dock: { getBoundingClientRect: () => ({ height: 118 }) },
  };
  let viewport = { width: 1000, height: 720, dpr: 1 };
  const { cam, resetCamera, updateCamera, screenToWorld, worldToScreen } = createCameraController(
    createRuntimeContext({ game }),
    { canvas: {}, getEl: id => hud[id], getViewportSize: () => viewport },
  );

  resetCamera();
  const minX = (500 - 18) / cam.zoom;
  const minY = (360 - 140) / cam.zoom;
  assert.deepEqual([cam.x, cam.y], [minX, minY]);

  Object.assign(game.hero, { x: W, y: H });
  const maxX = W * CELL - minX;
  const maxY = H * CELL - minY;
  const dt = 0.1;
  const k = 1 - Math.exp(-8.5 * dt);
  updateCamera(dt);
  assert.deepEqual([cam.x, cam.y], [minX + (maxX - minX) * k, minY + (maxY - minY) * k]);
  updateCamera(dt, true);
  assert.deepEqual([cam.x, cam.y], [maxX, maxY]);

  const screen = worldToScreen(13.25, 7.5);
  const world = screenToWorld(screen.x, screen.y);
  assert.ok(Math.abs(world.x - 13.25) < 1e-12);
  assert.ok(Math.abs(world.y - 7.5) < 1e-12);
  assert.deepEqual(worldToScreen(world.x, world.y), screen);

  viewport = { width: 10000, height: 10000, dpr: 1 };
  resetCamera();
  assert.deepEqual([cam.x, cam.y], [W * CELL / 2, H * CELL / 2]);
});

test('feedback preserves classes, content, timeout replacement, and reset visibility', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const danger = new Set();
  const elements = {
    toast: { hidden: true }, banner: { hidden: true }, bannerTitle: {}, bannerSub: {},
    hpVignette: { classList: { toggle: (name, on) => on ? danger.add(name) : danger.delete(name) } },
    tribFlash: {},
  };
  const { toast, showBanner, setDangerVignette, flashScreen, hideTransientFeedback } = createFeedbackUI({
    getEl: id => elements[id],
  });

  toast('Warning', true);
  showBanner('Wave 30', 'Boss arrives', 'danger');
  assert.deepEqual(elements.toast, { hidden: false, className: 'toast warn', textContent: 'Warning' });
  assert.deepEqual(elements.banner, { hidden: false, className: 'banner danger' });
  assert.equal(elements.bannerTitle.textContent, 'Wave 30');
  assert.equal(elements.bannerSub.textContent, 'Boss arrives');
  t.mock.timers.tick(2300);
  toast('Ready');
  showBanner('New wave', 'Get ready');
  t.mock.timers.tick(100);
  assert.deepEqual(elements.toast, { hidden: false, className: 'toast', textContent: 'Ready' });
  assert.deepEqual(elements.banner, { hidden: false, className: 'banner' });
  t.mock.timers.tick(2300);
  assert.equal(elements.toast.hidden, true);
  assert.equal(elements.banner.hidden, true);

  flashScreen('gold');
  assert.equal(elements.tribFlash.className, 'trib-flash show-gold');
  t.mock.timers.tick(300);
  flashScreen('dmg');
  assert.equal(elements.tribFlash.className, 'trib-flash show-dmg');
  t.mock.timers.tick(179);
  assert.equal(elements.tribFlash.className, 'trib-flash show-dmg');
  t.mock.timers.tick(1);
  assert.equal(elements.tribFlash.className, 'trib-flash');
  flashScreen('fail');
  assert.equal(elements.tribFlash.className, 'trib-flash show-fail');
  t.mock.timers.tick(419);
  assert.equal(elements.tribFlash.className, 'trib-flash show-fail');
  t.mock.timers.tick(1);
  assert.equal(elements.tribFlash.className, 'trib-flash');

  toast('Warning');
  showBanner('Wave 30', 'Boss arrives');
  setDangerVignette(true);
  assert.ok(danger.has('danger'));
  hideTransientFeedback();
  assert.equal(elements.toast.hidden, true);
  assert.equal(elements.banner.hidden, true);
  assert.equal(danger.has('danger'), false);
});
