import BALANCE from '../../data/balance.js';
import { W, H, MAIN_WAVES, MAX_ENEMIES } from '../../data/index.js';
import { dist, clamp } from '../../core/math.js';

export function createRunTick(ctx, deps) {
  function tick(dt){
    if (!ctx.game || !['prep','wave','harvest'].includes(ctx.game.phase)) return;

    const realDt = dt / Math.max(1, ctx.game.speed || 1);
    // BUG-01: W29 90s real-time countdown runs strictly on real monotonic time BEFORE paused guard!
    if (ctx.game.phase === 'prep' && ctx.game.finalPrep && ctx.game.finalPrep.active) {
      const expired = deps.finalPrep.syncW29FinalPrepClock({
        fallbackRealDt: ctx.counters.inMainLoopFrame ? 0 : realDt,
        allowFallbackDt: !ctx.counters.inMainLoopFrame
      });
      if (expired) return;
    }

    if (ctx.paused) return;

    deps.economy.syncRunResourceAccounting();

    // In prep phase, check auto-wave decision pause (non-W29 prep)
    if (ctx.game.phase === 'prep' && !(ctx.game.finalPrep && ctx.game.finalPrep.active) && ctx.game.autoWave) {
      if (deps.unlock.hasPendingDecision()) {
        ctx.game.autoWavePausedForDecision = true;
      } else {
        if (ctx.game.autoWavePausedForDecision) {
          ctx.game.autoWavePausedForDecision = false;
          ctx.game.autoWaveTimer = Math.max(ctx.game.autoWaveTimer || 0, 2.5);
        }
        ctx.game.autoWaveTimer -= dt;
        if (ctx.game.autoWaveTimer <= 0) {
          deps.waves.startWave();
          return;
        }
      }
    }

    if (ctx.game.activeModal) return;

    if (ctx.game.runMetrics) {
      if (ctx.game.phase === 'prep' && !ctx.game.finalPrep?.active) {
        ctx.game.runMetrics.prepSec += realDt;
        ctx.game.runMetrics.totalEffectiveSec += realDt;
      } else if (ctx.game.phase === 'harvest') {
        ctx.game.runMetrics.harvestSec += dt;
        ctx.game.runMetrics.totalEffectiveSec += dt;
      } else if (ctx.game.phase === 'wave') {
        const isBossWave = ctx.game.wave % (BALANCE.wave?.bossPeriod || 5) === 0;
        if (isBossWave) ctx.game.runMetrics.bossCombatSec += dt;
        else ctx.game.runMetrics.normalCombatSec += dt;
        ctx.game.runMetrics.totalEffectiveSec += dt;
      }
    }

    ctx.ports.vfx.update(dt);
    deps.hero.updateHero(dt);
    ctx.ports.viewport.updateCamera(dt, false);

    // Holy Tier-2 passive regen (+5/s)
    if (deps.hero.getSynergyTier('holy') >= 1) {
      ctx.game.holyRegenTimer -= dt;
      if (ctx.game.holyRegenTimer <= 0) {
        ctx.game.holyRegenTimer = 1.0;
        ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + 5);
      }
    }

    if (ctx.game.phase === 'harvest') {
      deps.hero.updatePickups(dt);
      ctx.game.harvestTimer -= dt;
      if (ctx.game.gems.length === 0 || ctx.game.harvestTimer <= 0) {
        deps.lifecycle.completeWaveClear();
      }
      return;
    }

    if (ctx.game.phase === 'prep') {
      deps.combat.updateSeal(dt);
      deps.hero.updatePickups(dt); // Allows walking over ground chests during prep!
      return;
    }

    // Wave Simulation with MAX_ENEMIES soft cap
    ctx.game.waveClock += dt;
    if (ctx.game.wave === MAIN_WAVES && ctx.game.w30Battle?.active) {
      ctx.game.w30Battle.elapsedSeconds = Number((ctx.game.w30Battle.elapsedSeconds + dt).toFixed(3));
    }
    if (ctx.game.curWaveTel) ctx.game.curWaveTel.duration = Number(ctx.game.waveClock.toFixed(1));

    // Arknights-style storm warning cue right before Stage 3 dense surge (and W28 Mid-Wave Endgame Omen!)
    if (!ctx.game.stormWarned && ctx.game.waveClock >= ctx.game.stormWarnAt) {
      ctx.game.stormWarned = true;
      ctx.ports.audio.play('boss', 0.85);
      if (ctx.game.wave === 28) {
        const om = BALANCE.wave?.w28Omen || {};
        if (ctx.game.endgameOmen) ctx.game.endgameOmen.midWaveTriggered = true;
        ctx.ports.ui.flashScreen('fail');
        ctx.ports.ui.showBanner(om.midTitle || '🌑 终局阴云压境 · 深渊低语回响！', om.midSub || '终局危机迫近！稳住阵脚准备迎接 W29 与 W30 终局决战！', 'boss');
      } else {
        ctx.ports.ui.showBanner('⚠️ 暴风雨将至 · 大波敌军即将合围！', '调整站位与冲刺冷却，迎战波内峰值怪潮！', 'boss');
      }
    }

    // Optional Black-Myth-style Blood Shrine activation!
    if (ctx.game.shrine && !ctx.game.shrine.active && !ctx.game.shrine.cleared) {
      const s = ctx.game.shrine;
      const shrineNeed = deps.meta.hasMetaAux('aux_shrine_compass') ? 0.15 : 0.30;
      if (dist(ctx.game.hero, s) <= s.r + 0.15) {
        s.charge += dt;
        if (s.charge >= shrineNeed) {
          s.active = true;
          if (ctx.game.curWaveTel) ctx.game.curWaveTel.shrineTried = true;
          const scale = Math.pow(BALANCE.wave.normalHpGrowth || 1.115, ctx.game.wave - 1);
          const boss = deps.combat.spawnEnemy('elite', 'west', scale * 2.10, { x: clamp(s.x + 1.2, 1, W-1), y: clamp(s.y, 1, H-1) });
          boss.isShrineBoss = true;
          boss.name = '🩸 血煞妖王';
          boss.col = '#ff3b5c';
          boss.spd = Number((boss.spd * 1.18).toFixed(2));
          boss.dmg = Math.round(boss.dmg * 1.30);
          boss.affixes = deps.combat.pickEliteAffixes(2);
          for (let k = 0; k < 3; k++) {
            if (ctx.game.enemies.length >= MAX_ENEMIES) break;
            const a = (Math.PI * 2 * k) / 3;
            deps.combat.spawnEnemy('wolf', 'west', scale, { x: clamp(s.x + Math.cos(a)*1.6, 0.8, W-0.8), y: clamp(s.y + Math.sin(a)*1.6, 0.8, H-0.8) });
          }
          ctx.ports.audio.play('boss', 1.1);
          ctx.game.shake = Math.max(ctx.game.shake, 7);
          ctx.ports.vfx.addRing(s.x, s.y, '#ff3b5c', 3.4);
          ctx.ports.ui.showBanner('🩸 血煞妖碑已觉醒！', '【血煞妖王】现身！斩杀赢章节构装宝箱 + 25 金 + 2 锻材！', 'boss');
        }
      } else {
        s.charge = Math.max(0, s.charge - dt * 0.5);
      }
    }

    for (const w of ctx.game.waveQueue) {
      if (!w.spawned && ctx.game.waveClock >= w.at) {
        if (ctx.game.enemies.length >= MAX_ENEMIES) break;
        w.spawned = true;
        deps.combat.spawnEnemy(w.kind, w.side, w.scale);
      }
    }

    deps.combat.updateSeal(dt);
    deps.combat.updateProjectilesAndZones(dt);
    deps.combat.updateEnemies(dt);
    deps.hero.updatePickups(dt);

    if (ctx.game.phase !== 'wave') return;
    const allSpawned = ctx.game.waveQueue.every(w => w.spawned);
    if (allSpawned && ctx.game.enemies.length === 0) {
      deps.telemetry.beginWaveHarvest();
    }
  }

  return {
    tick,
  };
}
