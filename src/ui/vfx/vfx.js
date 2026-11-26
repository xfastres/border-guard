import { MAX_FLOATS, MAX_RINGS } from '../../data/index.js';

export function createVfxManager(runtimeCtx, battleVfx) {
  const freeRings = [];
  const freeFloats = [];

  function addRing(x, y, col, r){
    const { rings } = runtimeCtx.game;
    const record = (rings.length >= MAX_RINGS ? rings.shift() : freeRings.pop()) || {};
    record.x = x; record.y = y; record.col = col; record.r = r;
    record.t = record.max = 0.34;
    rings.push(record);
    battleVfx?.onRing(x, y, col, r);
  }

  function addFloat(x, y, txt, col = '#fff', big = false){
    const { floats } = runtimeCtx.game;
    const record = (floats.length >= MAX_FLOATS ? floats.shift() : freeFloats.pop()) || {};
    record.x = x; record.y = y; record.txt = txt; record.col = col; record.big = big;
    record.t = record.max = big ? 1.05 : 0.72;
    floats.push(record);
    battleVfx?.onFloat(x, y, txt);
  }

  function age(list, dt, free, limit, moving = false) {
    let next = 0;
    for (const record of list) {
      record.t -= dt;
      if (moving) record.y -= dt * (record.big ? .95 : .68);
      if (record.t > 0) list[next++] = record;
      else if (free && free.length < limit) free.push(record);
    }
    list.length = next;
  }

  function updateVfx(dt){
    const game = runtimeCtx.game;
    game.shake = Math.max(0, game.shake - dt * 18);
    age(game.rings, dt, freeRings, MAX_RINGS);
    age(game.floats, dt, freeFloats, MAX_FLOATS, true);
    age(game.beams, dt);
    age(game.bolts, dt);
    battleVfx?.advance(dt);
  }

  return { addRing, addFloat, updateVfx };
}
