import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { H, W } from '../../src/data/index.js';

test('stepFrame ticks once at normal speed and twice at double speed', async () => {
  const { createGameLoop } = await import('../../src/app/game-loop.js');
  const runtimeCtx = createRuntimeContext();
  const ticks = [];
  const loop = createGameLoop(runtimeCtx, { tick: dt => ticks.push(dt) });

  loop.stepFrame(0.01);
  runtimeCtx.setGame({ speed: 1 });
  loop.stepFrame(0.02);
  runtimeCtx.game.speed = 2;
  loop.stepFrame(0.03);
  assert.deepEqual(ticks, [0.02, 0.03, 0.03]);
});

test('loop clamps frame time, refreshes HUD and FPS on schedule, and honors timestamp sync', async () => {
  const { createGameLoop } = await import('../../src/app/game-loop.js');
  const runtimeCtx = createRuntimeContext({ game: { speed: 1 } });
  const scheduled = [];
  const ticks = [];
  const renders = [];
  const hudRefreshes = [];
  const gameLoop = createGameLoop(runtimeCtx, {
    now: () => 1000,
    scheduleFrame: callback => scheduled.push(callback),
    tick: dt => ticks.push([dt, runtimeCtx.counters.inMainLoopFrame]),
    render: () => renders.push(runtimeCtx.counters.inMainLoopFrame),
    renderAllUI: full => hudRefreshes.push(full),
  });
  const frame = ts => scheduled.shift()(ts);

  gameLoop.start();
  frame(1200);
  frame(1300);
  assert.deepEqual(hudRefreshes, []);
  frame(1400);
  assert.deepEqual(hudRefreshes, [false]);
  assert.deepEqual(ticks, [[0.05, true], [0.05, true], [0.05, true]]);
  assert.deepEqual(renders, [false, false, false]);

  for (let i = 1; i <= 6; i++) frame(1400 + i * 100);
  assert.equal(gameLoop.perfStats.fps, 60);
  // Nine capped frames total 0.45 s. The next 0.049 s is still below the threshold.
  frame(2049);
  assert.equal(gameLoop.perfStats.fps, 60);
  frame(2051);
  assert.equal(gameLoop.perfStats.fps, 22);
  assert.equal(gameLoop.perfStats.frameCount, 0);
  assert.equal(gameLoop.perfStats.fpsTimer, 0);

  gameLoop.syncLoopTimestamp(5000);
  frame(5010);
  frame(5000);
  assert.deepEqual(ticks.slice(-2), [[0.01, true], [0, true]]);
  assert.equal(scheduled.length, 1);
});

test('loop clears the main-loop flag if a tick throws', async () => {
  const { createGameLoop } = await import('../../src/app/game-loop.js');
  const runtimeCtx = createRuntimeContext({ game: { speed: 1 } });
  const error = new Error('tick failed');
  const scheduled = [];
  const loop = createGameLoop(runtimeCtx, {
    now: () => 0,
    scheduleFrame: callback => scheduled.push(callback),
    tick() {
      assert.equal(runtimeCtx.counters.inMainLoopFrame, true);
      throw error;
    },
  });

  loop.start();
  assert.throws(() => scheduled.shift()(50), error);
  assert.equal(runtimeCtx.counters.inMainLoopFrame, false);
  assert.equal(scheduled.length, 0);
});

test('input clamps click destinations and renders after updating pause state', async () => {
  const { createInputController } = await import('../../src/ui/input/input.js');
  const runtimeCtx = createRuntimeContext({ game: { hero: {} } });
  const renderedPause = [];
  const input = createInputController(runtimeCtx, {
    hud: { renderAllUI: () => renderedPause.push(runtimeCtx.paused) },
  });

  input.handleCanvasClick(-100, H + 100);
  assert.deepEqual(runtimeCtx.game.hero.goal, { x: 1.2, y: H - 1.2 });
  input.handleCanvasClick(W + 100, -100);
  assert.deepEqual(runtimeCtx.game.hero.goal, { x: W - 1.2, y: 1.2 });
  assert.equal(input.setPaused(true), true);
  assert.equal(input.setPaused(false), false);
  assert.deepEqual(renderedPause, [true, false]);
});

test('input port exposes key and pointer state from listeners', async () => {
  const { createInputController } = await import('../../src/ui/input/input.js');
  const runtimeCtx = createRuntimeContext({ game: { hero: {} } });
  const canvas = new EventTarget();
  const win = new EventTarget();
  const noop = () => {};
  const input = createInputController(runtimeCtx, {
    canvas, win, getEl: () => new EventTarget(),
    audio: { unlock: noop },
    viewport: { screenToWorld: (x, y) => ({ x: x / 10, y: y / 10 }) },
    hud: { syncHudResponsiveMode: noop, toggleLeftHud: noop, toggleBattleHud: noop },
    modals: { showIntroModal: noop },
    heroSkills: { castHeroDash: noop, castHeroOverdrive: noop },
    shop: {}, run: { startWave: noop }, feedback: {}, affixTransfer: {}, destiny: {}, unlock: {}, w20: {},
  });
  const { inputPort } = input;
  const dispatch = (target, type, props) => target.dispatchEvent(Object.assign(new Event(type), props));
  input.bindListeners();

  assert.deepEqual([...inputPort.getKeys()], []);
  assert.equal(inputPort.getPointerScreen(), null);
  assert.equal(inputPort.getPointerWorld(), null);
  assert.equal(inputPort.isPointerDown(), false);

  dispatch(canvas, 'pointerdown', { button: 2, clientX: 40, clientY: 50 });
  assert.equal(inputPort.isPointerDown(), false);
  dispatch(canvas, 'pointerdown', { button: 0, clientX: 40, clientY: 50 });
  assert.equal(inputPort.isPointerDown(), true);
  assert.deepEqual(inputPort.getPointerScreen(), { x: 40, y: 50 });
  assert.deepEqual(inputPort.getPointerWorld(), { x: 4, y: 5 });
  assert.deepEqual(runtimeCtx.game.hero.goal, { x: 4, y: 5 });
  dispatch(win, 'pointermove', { clientX: 80, clientY: 90 });
  assert.deepEqual(inputPort.getPointerScreen(), { x: 80, y: 90 });
  assert.deepEqual(inputPort.getPointerWorld(), { x: 8, y: 9 });
  const worldPoint = { x: 11, y: 12 };
  inputPort.setPointerWorld(worldPoint);
  assert.equal(inputPort.getPointerWorld(), worldPoint);
  dispatch(win, 'pointerup');
  assert.equal(inputPort.isPointerDown(), false);

  dispatch(win, 'keydown', { key: 'W' });
  assert.deepEqual([...inputPort.getKeys()], ['w']);
  dispatch(win, 'keyup', { key: 'W' });
  assert.equal(inputPort.getKeys().size, 0);
});

test('createGameSystems assembles a seeded game, shop, and wave with no DOM', async () => {
  const { createGameSystems } = await import('../../src/app/bootstrap.js');
  const runtimeCtx = createRuntimeContext();
  const systems = createGameSystems(runtimeCtx);
  assert.deepEqual(Object.keys(systems).sort(), [
    'affixTransfer', 'combat', 'destiny', 'economyCore', 'equipmentCore', 'equipmentInventory',
    'heroSkills', 'heroStats', 'heroVitals', 'meta', 'rewards', 'run', 'shop', 'shopConfirm',
    'unlock', 'w10', 'w20',
  ]);
  const game = systems.run.makeGame(2026);
  runtimeCtx.setGame(game);
  systems.shop.rollShop(true);
  assert.equal(game.seed, 2026);
  assert.ok(game.shop.length > 0);
  assert.ok(systems.run.buildWaveQueue(1).length > 0);
});
