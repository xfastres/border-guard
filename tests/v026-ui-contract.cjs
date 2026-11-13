const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const file = process.env.BORDER_HTML || 'Border-Guard-v0.26.html';
const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function gameContext(overrides = {}) {
  const state = {
    game: {started: true, phase: 'day', mode: null, hero: {hp: 100}},
    paused: false,
    document: {hidden: false},
    $: id => ({open: false, hidden: true}),
    ...overrides,
  };
  return vm.createContext(state);
}

function loadFunction(ctx, name) {
  const pattern = new RegExp('^function '+name+'\\([^\\n]*\\n[\\s\\S]*?^}', 'm');
  const source = scripts.map(script => script.match(pattern)?.[0]).find(Boolean);
  assert.ok(source, '缺少 '+name);
  vm.runInContext(source, ctx);
  return ctx[name];
}

test('地图输入服从开局、暂停和对话框状态', () => {
  const ctx = gameContext();
  const allowed = loadFunction(ctx, 'canUsePlayMap');
  assert.equal(allowed(), true);
  ctx.game.started = false;
  assert.equal(allowed(), false);
  ctx.game.started = true;
  ctx.paused = true;
  assert.equal(allowed(), false);
  ctx.paused = false;
  ctx.$ = () => ({open: true, hidden: true});
  assert.equal(allowed(), false);
  ctx.$ = () => ({open: false, hidden: true});
  ctx.game.phase = 'lost';
  assert.equal(allowed(), false);
});

test('普通短按移动，选中建造工具后短按执行当前工具', () => {
  const calls = [];
  const tile = {x: 3, y: 5};
  const ctx = gameContext({
    setDestination: t => calls.push(['move', t]),
    build: (t, type) => calls.push([type, t]),
    sync() {},
  });
  loadFunction(ctx, 'canUsePlayMap');
  loadFunction(ctx, 'mapAttackIntent');
  loadFunction(ctx, 'applyMapTool');
  loadFunction(ctx, 'moveFromMap');
  const tap = loadFunction(ctx, 'mapClick');
  tap(tile, undefined, true);
  ctx.game.mode = 'wall';
  tap(tile, undefined, true);
  ctx.game.mode = 'tower';
  tap(tile, undefined, true);
  assert.deepEqual(calls, [['move', tile], ['wall', tile], ['tower', tile]]);
  assert.equal(ctx.game.mode, 'tower');
});

test('夜战点敌按实际落点与领主距离判断，空地图标不触发攻击', () => {
  const enemy = {x: 2.95, y: 4.22, hp: 5};
  const ctx = gameContext({
    distance: (a, b) => Math.hypot(a.x-b.x, a.y-b.y),
    center: t => ({x: t.x+.5, y: t.y+.5}),
    meleeClear: () => true,
    toast() {},
  });
  Object.assign(ctx.game, {phase: 'night', enemies: [enemy]});
  Object.assign(ctx.game.hero, {x: 2.1, y: 4.2, cooldown: 0});
  const hit = loadFunction(ctx, 'mapAttackIntent');
  assert.equal(hit({x: 2, y: 4}, {x: 2.25, y: 4.65}), false);
  assert.equal(hit({x: 3, y: 4}, {x: 3.02, y: 4.25}), 'attack');
  ctx.meleeClear = () => false;
  assert.equal(hit({x: 3, y: 4}, {x: 3.02, y: 4.25}), 'blocked');
  ctx.game.hero.x = 0;
  assert.equal(hit({x: 3, y: 4}, {x: 3.02, y: 4.25}), false);
});

test('地图安全中心来自棋盘实际尺寸，世界坐标往返不偏移', () => {
  const canvas = {width: 1472, height: 920, getBoundingClientRect: () => ({width: 1280.5, height: 800.3125})};
  const board = {getBoundingClientRect: () => ({left: 20, top: 94, right: 690, bottom: 422})};
  const ctx = gameContext({
    canvas, camera: {tx: -13, ty: 17}, innerWidth: 932, innerHeight: 430,
    $: () => board, getComputedStyle: () => ({}),
  });
  const measure = loadFunction(ctx, 'measureCameraViewport');
  const toScreen = loadFunction(ctx, 'worldToScreen');
  const toWorld = loadFunction(ctx, 'screenToWorld');
  measure();
  assert.equal(ctx.camera.safeX + ctx.camera.vx, 355);
  assert.equal(ctx.camera.safeY + ctx.camera.vy, 258);
  const point = toScreen(220.5, 104.75);
  const world = toWorld(point.x, point.y);
  assert.ok(Math.abs(world.x - 220.5) < 1e-7);
  assert.ok(Math.abs(world.y - 104.75) < 1e-7);
});
