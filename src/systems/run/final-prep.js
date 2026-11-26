import BALANCE from '../../data/balance.js';
import { hasPendingW29WaveRewards } from '../../core/state-queries.js';

export function isCancelablePrepModal(m){
  return !!(m && ['destiny_gamble', 'affix_transfer', 'shop_confirm', 'w30_early_confirm', 'meta_legacy', 'intro'].includes(m.type));
}

export function createFinalPrepSystem(ctx, deps) {
  const { getMonotonicNowMs } = ctx;

  function setMonotonicClockForTest(fn){
    ctx.counters.monotonicClockOverride = typeof fn === 'function' ? fn : null;
    ctx.ports.clock.syncLoopTimestamp(getMonotonicNowMs());
  }

  function syncW29FinalPrepStart(){
    const fp = ctx.game?.finalPrep;
    if (!fp || !fp.active || fp.started) return false;
    if (!hasPendingW29WaveRewards(ctx.game)) {
      const nowMs = getMonotonicNowMs();
      const remSec = Number.isFinite(fp.timer) && fp.timer > 0 ? fp.timer : (fp.duration || fp.maxSeconds || 90);
      fp.awaitingWaveRewards = false;
      fp.started = true;
      fp.startedAtMs = nowMs;
      fp.deadlineMs = nowMs + remSec * 1000;
      fp.lastClockMs = nowMs;
      fp.lastObservedTimer = remSec;
      fp.usesWallClock = false;
      ctx.ports.ui.showBanner(
        `⏳ W29 终局整备正式倒计时（${Math.round(fp.duration || 90)} 秒）！`,
        `波末奖励已结清！真实时间走表（不受倍速、面板或暂停影响），迎战 W30 深渊主宰（辅助：${ctx.game.bossIntel?.w30Aux || '未知'}）！`,
        'boss'
      );
      ctx.ports.ui.renderAllUI(true);
      return true;
    }
    return false;
  }

  function syncW29FinalPrepClock({ nowMs = null, fallbackRealDt = 0, allowFallbackDt = true } = {}){
    if (!ctx.game || ctx.game.phase !== 'prep') return false;
    const fp = ctx.game.finalPrep;
    if (!fp || !fp.active) return false;

    // Phase A: Settle W29 wave-end rewards (levelup / ground chests) FIRST; 90s timer stays frozen until last wave-end reward closes!
    if (!fp.started) {
      syncW29FinalPrepStart();
      if (!fp.started) return false;
    }
    if (fp.locked || fp.transitioning) return false;

    const curNowMs = Math.max(fp.lastClockMs ?? -Infinity, Number.isFinite(nowMs) ? nowMs : getMonotonicNowMs());
    if (!Number.isFinite(fp.deadlineMs)) {
      const remSec = Math.max(0, Number(fp.timer || 0));
      fp.startedAtMs = curNowMs;
      fp.deadlineMs = curNowMs + remSec * 1000;
      fp.lastClockMs = curNowMs;
      fp.lastObservedTimer = remSec;
    }

    // Compatibility: if a test directly mutates game.finalPrep.timer, re-anchor deadlineMs to that value before ticking.
    if (Number.isFinite(fp.lastObservedTimer) && Math.abs(fp.timer - fp.lastObservedTimer) > 1e-4) {
      fp.deadlineMs = curNowMs + Math.max(0, Number(fp.timer || 0)) * 1000;
      fp.lastClockMs = curNowMs;
      fp.lastObservedTimer = fp.timer;
    }

    const prevClockMs = Number.isFinite(fp.lastClockMs) ? fp.lastClockMs : curNowMs;
    const wallDeltaMs = Math.max(0, curNowMs - prevClockMs);
    const hasExplicitClock = typeof ctx.counters.monotonicClockOverride === 'function';
    let elapsedSec = 0;

    if (wallDeltaMs > 0) {
      // Real monotonic clock advanced: ALWAYS use exact wall-clock delta (NEVER clamped to 0.05s, NEVER frozen by paused!)
      fp.usesWallClock = true;
      fp.lastClockMs = curNowMs;
      const prevTimer = fp.timer;
      fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
      elapsedSec = Math.max(0, prevTimer - fp.timer);
    } else if (allowFallbackDt && !hasExplicitClock && !fp.usesWallClock && fallbackRealDt > 0) {
      // Node sandbox compatibility when performance.now() is static (0) and tests invoke tick(dt)/stepFrame(dt) directly
      const prevTimer = fp.timer;
      fp.deadlineMs -= fallbackRealDt * 1000;
      fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
      elapsedSec = Math.max(0, prevTimer - fp.timer);
    } else {
      fp.timer = Math.max(0, (fp.deadlineMs - curNowMs) / 1000);
    }

    fp.lastObservedTimer = fp.timer;
    if (elapsedSec > 0 && ctx.game.runMetrics) {
      ctx.game.runMetrics.w29FinalPrepSec += elapsedSec;
      ctx.game.runMetrics.totalEffectiveSec += elapsedSec;
    }
    if (fp.timer <= 0) {
      resolveW29FinalPrepTimeout();
      return true;
    }
    return false;
  }

  function closeCancelablePrepModals(){
    if (!ctx.game) return;
    ctx.game.inspTarget = null;
    ctx.game.mode = null;
    // Strictly preserve legal reward modals (levelup, chest, perk, w10_breakthrough, w20_breakthrough)!
    if (Array.isArray(ctx.game.pendingModals)) {
      ctx.game.pendingModals = ctx.game.pendingModals.filter(m => !isCancelablePrepModal(m));
    }
    if (isCancelablePrepModal(ctx.game.activeModal)) {
      ctx.game.activeModal = null;
      ctx.ports.modals.hideBackdrop();
      if (ctx.game.pendingModals && ctx.game.pendingModals.length > 0) {
        ctx.ports.modals.openNextModal();
      }
    } else if (!ctx.game.activeModal && ctx.game.pendingModals && ctx.game.pendingModals.length > 0) {
      ctx.ports.modals.openNextModal();
    } else if (!ctx.game.activeModal) {
      ctx.ports.modals.hideBackdrop();
    }
  }

  function closeAllPrepModals(){
    closeCancelablePrepModals();
  }

  function startW30Early({ acceptRandomClaim = false } = {}){
    if (!ctx.game || ctx.game.phase !== 'prep') return { ok: false, reason: 'not_in_prep' };
    const fp = ctx.game.finalPrep;
    if (!fp || !fp.active) {
      const started = deps.waves.startWave();
      return { ok: !!started, reason: started ? null : 'start_wave_blocked' };
    }
    if (fp.locked || fp.transitioning || syncW29FinalPrepClock({ allowFallbackDt: false })) {
      return { ok: false, reason: 'final_prep_locked' };
    }
    if (fp.awaitingWaveRewards || hasPendingW29WaveRewards(ctx.game)) {
      ctx.ports.ui.toast('⏳ 请先结清 W29 波末奖励（升级 / 遗留宝箱）后再进入 W30！', true);
      return { ok: false, reason: 'awaiting_wave_rewards' };
    }
    const pendingOffer = deps.progression.getPendingDestinyOffer();
    if (pendingOffer && !acceptRandomClaim) {
      ctx.game.activeModal = { type: 'w30_early_confirm', offerId: pendingOffer.offerId };
      ctx.ports.modals.renderW30EarlyConfirmModal();
      ctx.ports.ui.toast('🎲 天命赌局尚有未领取的三选一奖励：请先领取，或明确点击“接受随机领取并立即开战”！', true);
      ctx.ports.ui.renderAllUI(true);
      return { ok: false, reason: 'pending_destiny_offer_requires_choice', offerId: pendingOffer.offerId };
    }

    // ATOMIC SINGLE-FRAME TRANSITION MUTEX LOCK
    fp.locked = true;
    fp.transitioning = true;
    const clearedTransferDraft = !!ctx.game.transferDraft;
    const clearedShopDraft = !!ctx.game.shopConfirmDraft;
    if (ctx.game.transferDraft) deps.equipment.cancelAffixTransferPreview();
    if (ctx.game.shopConfirmDraft) ctx.game.shopConfirmDraft = null;
    // Close cancelable prep UI modals FIRST so any legal levelup reward triggered by auto-claim is preserved!
    closeCancelablePrepModals();

    let autoClaimedOffer = null;
    if (pendingOffer && acceptRandomClaim) {
      autoClaimedOffer = deps.progression.autoClaimPendingDestinyReward(ctx.game.rnd, { allowDuringFinalPrepResolve: true });
    }
    // Close only any residual cancelable prep UI while strictly keeping legal reward modals (e.g. newly triggered levelup)!
    closeCancelablePrepModals();
    fp.lastResolution = {
      trigger: pendingOffer ? 'early_start_random_claim' : 'early_start',
      clearedTransferDraft,
      clearedShopDraft,
      autoClaimedOffer,
      resolvedAtWave: ctx.game.wave
    };
    const started = deps.waves.startWave({ fromFinalPrepEarly: true });
    return { ok: !!started, startedW30: !!started, autoClaimed: autoClaimedOffer, resolution: fp.lastResolution };
  }

  function resolveW29FinalPrepTimeout(){
    const fp = ctx.game?.finalPrep;
    if (!fp || !fp.active) return { ok: false, reason: 'not_active' };
    if (fp.locked || fp.transitioning) return { ok: false, reason: 'already_locked' };

    // ATOMIC SINGLE-FRAME TRANSITION MUTEX LOCK (rejects all duplicate/post-expiry clicks with 0 deduction!)
    fp.locked = true;
    fp.transitioning = true;
    fp.timer = 0;

    const clearedTransferDraft = !!ctx.game.transferDraft;
    const clearedShopDraft = !!ctx.game.shopConfirmDraft;
    if (ctx.game.transferDraft) deps.equipment.cancelAffixTransferPreview();
    if (ctx.game.shopConfirmDraft) ctx.game.shopConfirmDraft = null;
    // Close cancelable prep UI modals FIRST so any legal levelup reward triggered by auto-claim is preserved!
    closeCancelablePrepModals();

    let autoClaimedOffer = null;
    if (ctx.game.destiny?.pendingOffer && !ctx.game.destiny.pendingOffer.claimed) {
      autoClaimedOffer = deps.progression.autoClaimPendingDestinyReward(ctx.game.rnd, { allowDuringFinalPrepResolve: true });
    }

    // Close only any residual cancelable prep UI while strictly keeping legal reward modals (e.g. newly triggered levelup)!
    closeCancelablePrepModals();
    fp.lastResolution = {
      trigger: 'timeout',
      clearedTransferDraft,
      clearedShopDraft,
      autoClaimedOffer,
      resolvedAtWave: ctx.game.wave
    };
    const started = deps.waves.startWave({ fromFinalPrepTimeout: true });
    return { ok: !!started, startedW30: !!started, autoClaimed: autoClaimedOffer, resolution: fp.lastResolution };
  }

  function enterW29FinalPrep(seconds = 90){
    const dur = Number(seconds) > 0 ? Number(seconds) : (BALANCE.progression.w29FinalPrepSeconds || 90);
    // Reveal W30 Boss intel if not already shown
    if (ctx.game.bossIntel) ctx.game.bossIntel.w30Revealed = true;
    // Auto-collect any remaining ground chests from W29 into reward modals so wave-end rewards settle BEFORE 90s timer starts!
    if (ctx.game.chests.length) {
      for (const c of ctx.game.chests) ctx.ports.modals.queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
      ctx.game.chests = [];
    }
    const awaiting = hasPendingW29WaveRewards(ctx.game);
    const nowMs = getMonotonicNowMs();
    ctx.game.subPhase = 'w29_final_prep';
    ctx.game.finalPrep = {
      active: true,
      awaitingWaveRewards: awaiting,
      started: !awaiting,
      locked: false,
      transitioning: false,
      timer: dur,
      duration: dur,
      maxSeconds: dur,
      startedAtMs: awaiting ? null : nowMs,
      deadlineMs: awaiting ? null : (nowMs + dur * 1000),
      lastClockMs: awaiting ? null : nowMs,
      lastObservedTimer: dur,
      usesWallClock: false,
      w30IntelShown: true,
      lastResolution: null
    };
    if (awaiting) {
      ctx.ports.ui.showBanner(
        '📦 W29 波末奖励结清中（90 秒倒计时暂未开始）',
        '请先完成 W29 升级选择与遗留宝箱领取；最后一个波末奖励关闭后将立即开启 90 秒终局整备倒计时！',
        'good'
      );
    } else {
      ctx.ports.ui.showBanner(
        `⏳ W29 终局整备开启（限时 ${Math.round(dur)} 秒）！`,
        `W30 深渊主宰情报（辅助：${ctx.game.bossIntel?.w30Aux || '未知'}）常驻右侧战况栏！真实时间走表（不可暂停），归零或提前开战将进入 W30 终局决战！`,
        'boss'
      );
    }
  }

  return {
    isCancelablePrepModal,
    getMonotonicNowMs,
    setMonotonicClockForTest,
    syncW29FinalPrepStart,
    syncW29FinalPrepClock,
    closeCancelablePrepModals,
    closeAllPrepModals,
    startW30Early,
    resolveW29FinalPrepTimeout,
    enterW29FinalPrep,
  };
}
