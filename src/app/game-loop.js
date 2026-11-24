export function createGameLoop(runtimeCtx, {
  tick,
  render,
  renderAllUI,
  now = () => performance.now(),
  scheduleFrame = callback => requestAnimationFrame(callback),
}) {
  const { counters } = runtimeCtx;
  const perfStats = { fps: 60, frameCount: 0, fpsTimer: 0, culledTiles: 0, culledProps: 0 };
  let lastTs;
  let uiAccum = 0;

  function stepFrame(rawDt){
    const game = runtimeCtx.game;
    if (!game) return;
    const steps = game.speed === 2 ? 2 : 1;
    for (let i = 0; i < steps; i++) tick(rawDt);
  }

  function loop(ts){
    const rawDt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    perfStats.frameCount++;
    perfStats.fpsTimer += rawDt;
    if (perfStats.fpsTimer >= 0.5) {
      perfStats.fps = Math.round(perfStats.frameCount / perfStats.fpsTimer);
      perfStats.frameCount = 0;
      perfStats.fpsTimer = 0;
    }
    if (runtimeCtx.game) {
      counters.inMainLoopFrame = true;
      try {
        stepFrame(rawDt);
      } finally {
        counters.inMainLoopFrame = false;
      }
      render();
      uiAccum += rawDt;
      if (uiAccum >= 0.14) {
        uiAccum = 0;
        renderAllUI(false);
      }
    }
    scheduleFrame(loop);
  }

  function syncLoopTimestamp(nowMs) {
    lastTs = nowMs;
  }

  function start() {
    lastTs ??= now();
    scheduleFrame(loop);
  }

  return { perfStats, stepFrame, syncLoopTimestamp, start };
}
