import { MAX_FLOATS, MAX_RINGS } from '../../data/index.js';

export function createVfxManager(runtimeCtx) {
  function addRing(x, y, col, r){
    const game = runtimeCtx.game;
    game.rings.push({ x, y, col, r, t: 0.34, max: 0.34 });
    if (game.rings.length > MAX_RINGS) game.rings.shift();
  }

  function addFloat(x, y, txt, col='#fff', big=false){
    const game = runtimeCtx.game;
    game.floats.push({ x, y, txt, col, big, t: big ? 1.05 : 0.72, max: big ? 1.05 : 0.72 });
    if (game.floats.length > MAX_FLOATS) game.floats.shift();
  }

  function updateVfx(dt){
    const game = runtimeCtx.game;
    game.shake = Math.max(0, game.shake - dt * 18);
    for (const r of game.rings) r.t -= dt;
    game.rings = game.rings.filter(r => r.t > 0);
    for (const b of game.beams) b.t -= dt;
    game.beams = game.beams.filter(b => b.t > 0);
    for (const l of game.bolts) l.t -= dt;
    game.bolts = game.bolts.filter(l => l.t > 0);
    for (const f of game.floats) { f.t -= dt; f.y -= dt * (f.big ? 0.95 : 0.68); }
    game.floats = game.floats.filter(f => f.t > 0);
  }

  return { addRing, addFloat, updateVfx };
}
