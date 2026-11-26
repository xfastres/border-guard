import { getMetaConfig, MAIN_WAVES } from './config.js';
import { normalizeMetaSave } from './persistence.js';

export function createMetaRewards(ctx, persistence, loadout) {
  const { meta } = ctx;
  const metaStorageStatus = meta.storageStatus;
  const { getMetaSave, loadMetaSave, saveMetaSave } = persistence;
  const { getActiveMetaLoadout } = loadout;

  function generateRunId(seed){
    const seq = meta.runIdSeq++;
    return `run_${ctx.ports.clock.nowMs().toString(36)}_${Number(seed || 0).toString(36)}_${seq}`;
  }

  function calculateRunShardRewards(victory, g = ctx.game){
    const cfg = getMetaConfig();
    const f = cfg.rewardFormula;
    const wave = Math.max(1, Math.floor(Number(g?.wave || 1)));
    const clearedWaves = victory ? MAIN_WAVES : Math.max(0, wave - 1);
    const bossKills = Math.max(0, Math.floor(Number(g?.stats?.bossKills || 0)));
    const w10Done = !!(g?.hero?.breakthroughs?.w10);
    const w20Done = !!(g?.hero?.vouchers?.w20 || (g?.hero?.breakthroughs?.w20 && !g?.hero?.breakthroughs?.w20?.placeholder));
    const minWaves = Math.max(1, Number(f.minClearedWaveForAnyReward ?? 3));

    // Strict anti-suicide-farming guard: dying on W1-W2 (or W3 before clearing W3 & 0 bosses killed) yields STRICTLY 0 shards!
    const eligible = !!victory || clearedWaves >= minWaves || bossKills > 0;
    if (!eligible) {
      return {
        eligible: false,
        clearedWaves,
        waveReached: wave,
        band1Shards: 0,
        band2Shards: 0,
        band3Shards: 0,
        bossBonus: 0,
        w10Bonus: 0,
        w20Bonus: 0,
        w30VictoryBonus: 0,
        runShards: 0,
        reason: 'early_defeat_zero_reward'
      };
    }

    const countInRange = (hi, range) => {
      const lo = Number(range?.[0] ?? 1);
      const up = Number(range?.[1] ?? lo);
      if (hi < lo) return 0;
      return Math.min(hi, up) - lo + 1;
    };
    const b1Waves = countInRange(clearedWaves, f.band1Range || [3, 10]);
    const b2Waves = countInRange(clearedWaves, f.band2Range || [11, 20]);
    const b3Waves = countInRange(clearedWaves, f.band3Range || [21, 29]);

    const band1Shards = Math.floor(b1Waves * Number(f.band1PerWave ?? 1.5));
    const band2Shards = Math.floor(b2Waves * Number(f.band2PerWave ?? 3.5));
    const band3Shards = Math.floor(b3Waves * Number(f.band3PerWave ?? 7.0));
    const bossBonus = bossKills * Math.max(0, Number(f.bossKillBonus ?? 4));
    const w10Bonus = w10Done ? Math.max(0, Number(f.w10BreakthroughBonus ?? 12)) : 0;
    const w20Bonus = w20Done ? Math.max(0, Number(f.w20VoucherBonus ?? 28)) : 0;
    const w30VictoryBonus = victory ? Math.max(0, Number(f.w30VictoryBonus ?? 140)) : 0;
    const runShards = band1Shards + band2Shards + band3Shards + bossBonus + w10Bonus + w20Bonus + w30VictoryBonus;

    return {
      eligible: true,
      clearedWaves,
      waveReached: wave,
      band1Shards,
      band2Shards,
      band3Shards,
      bossBonus,
      w10Bonus,
      w20Bonus,
      w30VictoryBonus,
      runShards,
      reason: victory ? 'victory' : 'effective_progress'
    };
  }

  function checkEligibleNewMilestones(victory, save = getMetaSave(), g = ctx.game){
    const cfg = getMetaConfig();
    const claimed = new Set(save.claimedMilestones || []);
    const wave = Math.max(1, Math.floor(Number(g?.wave || 1)));
    const clearedWaves = victory ? MAIN_WAVES : Math.max(0, wave - 1);
    const w10Done = !!(g?.hero?.breakthroughs?.w10);
    const w20Done = !!(g?.hero?.vouchers?.w20 || (g?.hero?.breakthroughs?.w20 && !g?.hero?.breakthroughs?.w20?.placeholder));
    const destinyRolls = Math.max(0, Number(g?.stats?.destinyRolls || g?.destiny?.totalRolls || 0));

    const newly = [];
    for (const ms of cfg.milestones) {
      if (claimed.has(ms.id)) continue;
      const c = ms.condition || {};
      let ok = true;
      if (c.minWave != null && wave < c.minWave) ok = false;
      if (c.minClearedWave != null && clearedWaves < c.minClearedWave) ok = false;
      if (c.w10Breakthrough && !w10Done) ok = false;
      if (c.w20Voucher && !w20Done) ok = false;
      if (c.victory && !victory) ok = false;
      if (c.zeroGamble && destinyRolls > 0) ok = false;
      if (ok) newly.push(ms);
    }
    return newly;
  }

  // Re-read persisted run IDs to block duplicate settlement even after a reload.
  function settleRunMetaRewards(victory){
    if (!ctx.game) return null;
    if (ctx.game.debugRun) {
      const preview = { practice: true, eligible: false, totalShardsGranted: 0, newlyClaimedMilestones: [] };
      ctx.game.metaSettlement = preview;
      return preview;
    }
    const runId = ctx.game.runId || (ctx.game.runId = generateRunId(ctx.game.seed));

    // If this exact runId already has a pending unsaved settlement (previous write failed), do NOT double-award!
    if (metaStorageStatus.pendingUnsavedSettlement?.runId === runId) {
      const pendingRec = {
        ...metaStorageStatus.pendingUnsavedSettlement.record,
        duplicateBlocked: false,
        saveStatus: 'failed',
        persisted: false
      };
      ctx.game.metaSettlement = pendingRec;
      return pendingRec;
    }

    // Always sync from storage first so even a page reload replay cannot double-claim!
    const save = loadMetaSave();
    if (save.settledRunIds.includes(runId)) {
      const prev = ctx.game.metaSettlement || (save.lastSettlement?.runId === runId ? save.lastSettlement : null);
      const blocked = {
        ...(prev || calculateRunShardRewards(victory, ctx.game)),
        runId,
        victory: !!victory,
        newlyClaimedMilestones: prev?.newlyClaimedMilestones || [],
        milestoneShards: prev?.milestoneShards || 0,
        totalShardsGrantedThisCall: 0,
        totalShardsGranted: prev?.totalShardsGranted ?? 0,
        duplicateBlocked: true,
        shardsAfter: save.legacyShards,
        saveStatus: 'saved',
        persisted: true,
        saveError: null
      };
      ctx.game.metaSettlement = blocked;
      return blocked;
    }

    const breakdown = calculateRunShardRewards(victory, ctx.game);
    const newMilestones = checkEligibleNewMilestones(victory, save, ctx.game);
    const milestoneShards = newMilestones.reduce((s, m) => s + Math.max(0, Number(m.shardReward || 0)), 0);
    const totalGranted = breakdown.runShards + milestoneShards;

    save.legacyShards += totalGranted;
    for (const ms of newMilestones) {
      if (!save.claimedMilestones.includes(ms.id)) save.claimedMilestones.push(ms.id);
    }
    save.settledRunIds.push(runId);
    if (save.settledRunIds.length > 250) save.settledRunIds = save.settledRunIds.slice(-250);

    save.stats.totalRuns++;
    if (victory) {
      save.stats.victories++;
      if ((ctx.game.stats?.destinyRolls || 0) === 0) save.stats.noGambleVictories++;
    }
    save.stats.bestWave = Math.max(save.stats.bestWave || 0, ctx.game.wave || 1);
    save.stats.totalLegacyShardsEarned = (save.stats.totalLegacyShardsEarned || 0) + totalGranted;
    const shrinesThisRun = (ctx.game.telemetry || []).filter(t => t.shrineCleared).length;
    save.stats.shrinesClearedTotal = (save.stats.shrinesClearedTotal || 0) + shrinesThisRun;

    const challengeMarks = [];
    if (save.unlockedPacks.includes('pack_challenge_marks')) {
      if (victory && (ctx.game.stats.destinyRolls || 0) === 0) challengeMarks.push('零赌清修');
      if (shrinesThisRun >= 3) challengeMarks.push('妖碑狩猎');
    }
    const record = {
      ...breakdown,
      challengeMarks,
      runId,
      victory: !!victory,
      newlyClaimedMilestones: newMilestones.map(m => ({ id: m.id, name: m.name, desc: m.desc, shardReward: m.shardReward })),
      milestoneShards,
      totalShardsGranted: totalGranted,
      totalShardsGrantedThisCall: totalGranted,
      duplicateBlocked: false,
      shardsAfter: save.legacyShards,
      settledAtWave: ctx.game.wave,
      loadoutSnapshot: getActiveMetaLoadout(),
      saveStatus: 'saved',
      persisted: true,
      saveError: null
    };
    save.lastSettlement = record;
    const saved = saveMetaSave();
    if (!saved) {
      record.saveStatus = 'failed';
      record.persisted = false;
      record.saveError = metaStorageStatus.lastSaveError || 'storage_write_failed';
      save.lastSettlement = { ...record };
      metaStorageStatus.pendingUnsavedSettlement = {
        runId,
        victory: !!victory,
        record: { ...record },
        saveSnapshot: JSON.parse(JSON.stringify(meta.save))
      };
      ctx.ports.ui.toast('⚠️ 本地存档写入失败，本局奖励尚未持久化！请在结算页点击【重试保存】或【导出备份 JSON】。', true);
    } else {
      metaStorageStatus.pendingUnsavedSettlement = null;
    }
    ctx.game.metaSettlement = record;
    return record;
  }

  function retryPendingMetaSave(){
    const pending = metaStorageStatus.pendingUnsavedSettlement;
    if (pending && pending.saveSnapshot) {
      meta.save = normalizeMetaSave(pending.saveSnapshot);
      if (meta.save.lastSettlement) {
        meta.save.lastSettlement.saveStatus = 'saved';
        meta.save.lastSettlement.persisted = true;
        meta.save.lastSettlement.saveError = null;
      }
    }
    const ok = saveMetaSave();
    if (ok) {
      if (pending) metaStorageStatus.pendingUnsavedSettlement = null;
      if (ctx.game?.metaSettlement) {
        ctx.game.metaSettlement.saveStatus = 'saved';
        ctx.game.metaSettlement.persisted = true;
        ctx.game.metaSettlement.saveError = null;
      }
      ctx.ports.ui.toast('✅ 重试保存成功！本局传承奖励已安全持久化至本地存档。');
    } else {
      const errReason = metaStorageStatus.lastSaveError || 'storage_write_failed';
      if (meta.save?.lastSettlement) {
        meta.save.lastSettlement.saveStatus = 'failed';
        meta.save.lastSettlement.persisted = false;
        meta.save.lastSettlement.saveError = errReason;
      }
      if (ctx.game?.metaSettlement) {
        ctx.game.metaSettlement.saveStatus = 'failed';
        ctx.game.metaSettlement.persisted = false;
        ctx.game.metaSettlement.saveError = errReason;
      }
      ctx.ports.ui.toast('⚠️ 重试保存仍然失败，请点击【导出备份 JSON】妥善保存！', true);
    }
    if (ctx.game?.activeModal?.type === 'end') ctx.ports.modals.showEndModal(ctx.game.phase === 'won');
    ctx.ports.ui.renderAllUI(true);
    return {
      ok,
      reason: ok ? null : (metaStorageStatus.lastSaveError || 'storage_write_failed'),
      record: ctx.game?.metaSettlement ? { ...ctx.game.metaSettlement } : null
    };
  }

  return {
    generateRunId,
    calculateRunShardRewards,
    checkEligibleNewMilestones,
    settleRunMetaRewards,
    retryPendingMetaSave,
  };
}
