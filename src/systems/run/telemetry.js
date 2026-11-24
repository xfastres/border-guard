export function createTelemetrySystem(ctx, deps) {
  function finalizeCurrentTelemetry(){
    if (!ctx.game?.curWaveTel) return;
    const tel = ctx.game.curWaveTel;
    tel.duration = Number(ctx.game.waveClock.toFixed(1));
    tel.dmgDealt = ctx.game.stats.dmgTotal - tel.dmgDealtStart;
    tel.dps = tel.duration > 0 ? Math.round(tel.dmgDealt / tel.duration) : 0;
    tel.goldEarned = Math.max(0, ctx.game.gold - tel.goldStart);
    tel.moveDist = Number(tel.moveDist.toFixed(1));
    ctx.game.telemetry.push(tel);
    ctx.game.curWaveTel = null;
  }

  function getTelemetryReport(){
    if (!ctx.game) return { waves: [], current: null, summary: {} };
    const waves = ctx.game.telemetry.slice();
    const avgDuration = waves.length ? Number((waves.reduce((s, w) => s + w.duration, 0) / waves.length).toFixed(1)) : 0;
    const minHp = waves.length ? Math.min(...waves.map(w => w.minHpPct)) : 100;
    const shrineClears = waves.filter(w => w.shrineCleared).length;
    return {
      waves,
      current: ctx.game.curWaveTel,
      summary: { wavesCleared: waves.length, avgDuration, lowestHpPct: minHp, shrineClears }
    };
  }

  function beginWaveHarvest(){
    // Clear combat leftovers immediately, then run 1.15s visual gem-vacuum harvest!
    ctx.game.projectiles = [];
    ctx.game.zones = [];
    ctx.game.beams = [];
    ctx.game.bolts = [];
    ctx.game.shrine = null;
    ctx.game.hero.bladeHitMap.clear();
    ctx.game.hero.shatterCdMap.clear();

    if (ctx.game.gems.length > 0) {
      ctx.game.phase = 'harvest';
      ctx.game.harvestTimer = 1.15;
      for (const g of ctx.game.gems) g.magnetized = true;
      ctx.ports.vfx.addFloat(ctx.game.hero.x, ctx.game.hero.y - 0.7, '✨ 灵气归体 · 收取修为！', '#8cf4ff', true);
    } else {
      deps.lifecycle.completeWaveClear();
    }
  }

  return {
    finalizeCurrentTelemetry,
    getTelemetryReport,
    beginWaveHarvest,
  };
}
