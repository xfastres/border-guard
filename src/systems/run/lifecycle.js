import BALANCE from '../../data/balance.js';
import { MAIN_WAVES, W20_DIRECTIONS } from '../../data/index.js';
import { clamp } from '../../core/math.js';
import { perkLv } from '../../core/state-queries.js';

export function createRunLifecycle(ctx, deps) {
  function startNewRun(seed = Math.floor(Math.random() * 1e9), showStarter = true, opts = {}){
    ctx.setGame(deps.makeGame(seed));
    deps.meta.syncRunActivePools();
    if (!opts?.preRunSetup) {
      ctx.game.metaRunLocked = true;
    }
    deps.equipment.recomputeEquipmentSynergies();
    ctx.setPaused(false);
    ctx.ports.ui.resetRunUI();
    ctx.ports.modals.closeModal();
    deps.economy.rollShop(true);
    ctx.ports.viewport.resetCamera();
    if (showStarter) ctx.ports.modals.queueModal({ type: 'starter' });
    ctx.ports.ui.renderAllUI(true);
  }

  function completeWaveClear(){
    deps.telemetry.finalizeCurrentTelemetry();
    // Finish absorbing any final straggler gems; LEAVE chests on ground for manual prep pickup!
    for (const g of ctx.game.gems) deps.hero.gainHeroXp(g.xp);
    ctx.game.gems = [];
    ctx.game.shrine = null;
    ctx.game.healOrbs = [];

    const clearedWave = ctx.game.wave;
    const greedBonus = deps.hero.gearSetTier('greed') >= 2 ? 12 : 0;
    const clearBonus = BALANCE.economy.waveClearBase + clearedWave * BALANCE.economy.waveClearPerWave + greedBonus;
    const interest = perkLv(ctx.game, 'gold_power') >= 1 ? Math.min(25, Math.floor(ctx.game.gold * 0.10)) : 0;
    const clearMatBonus = deps.economy.getWaveClearMaterialBonus(clearedWave);
    if (clearBonus > 0) deps.economy.changeGold(clearBonus, 'wave_clear_bonus');
    if (interest > 0) deps.economy.changeGold(interest, 'wave_clear_interest');
    if (clearMatBonus > 0) deps.economy.changeMaterials(clearMatBonus, 'wave_clear_materials');
    ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + BALANCE.progression.waveClearHeal);
    ctx.ports.ui.setDangerVignette(ctx.game.hero.hp < ctx.game.hero.maxHp * 0.35);

    // W30 Final Boss cleared -> Run Victory!
    if (clearedWave >= MAIN_WAVES) {
      finishGame(true);
      return;
    }

    ctx.game.wave = clearedWave + 1;
    ctx.game.phase = 'prep';
    ctx.game.subPhase = null;
    ctx.game.rerollCost = BALANCE.economy.rerollStart;
    if (ctx.game.wavePlan) ctx.game.wavePlan.currentEncounter = null;
    if (ctx.game.metaRunState) {
      ctx.game.metaRunState.freeRefreshUsedThisWave = false;
      ctx.game.metaRunState.deflectReady = true;
    }
    deps.economy.syncRunResourceAccounting();

    // Stage progression & Major Breakthrough triggers (W5->W6, W10, W15->W16 preselect, W18->W19 intel, W20 breakthrough, W28 omen+W30 intel, W29->W30 final prep)
    if (clearedWave === 5) {
      ctx.game.shopTierBonus = Math.max(ctx.game.shopTierBonus, 1);
    } else if (clearedWave === 10) {
      ctx.game.hero.vouchers.w10 = true;
      ctx.game.shopTierBonus = Math.max(ctx.game.shopTierBonus, 2);
      if (!ctx.game.hero.breakthroughs.w10) {
        ctx.game.pendingBreakthrough = 'w10';
        if (ctx.game.chests.length) {
          for (const c of ctx.game.chests) ctx.ports.modals.queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
          ctx.game.chests = [];
        }
        ctx.ports.modals.queueModal({ type: 'w10_breakthrough', step: 'pick_skill' });
      }
    } else if (clearedWave === 15) {
      ctx.game.shopTierBonus = Math.max(ctx.game.shopTierBonus, 3);
    } else if (clearedWave === 18) {
      // W19 prep: reveal W20 Boss fixed core + rolled fair auxiliary mechanic!
      ctx.game.bossIntel.w20Revealed = true;
    } else if (clearedWave === 20) {
      // W20 Victory: 100% guaranteed Boss Voucher + IMMEDIATE activation of locked direction's base effect (even at 0 materials!)
      ctx.game.hero.vouchers.w20 = true;
      ctx.game.shopTierBonus = Math.max(ctx.game.shopTierBonus, 4);
      const dirKey = ctx.game.w20State?.lockedDirection || ctx.game.w20State?.preselectedDirection || deps.progression.getRecommendedW20Direction();
      const dirSpec = W20_DIRECTIONS[dirKey] || W20_DIRECTIONS.fire_chain_surge;
      if (ctx.game.w20State) {
        ctx.game.w20State.preselectedDirection = dirSpec.key;
        ctx.game.w20State.lockedDirection = dirSpec.key;
        ctx.game.w20State.locked = true;
        ctx.game.w20State.lockedAtWave = 20;
      }
      if (!ctx.game.hero.breakthroughs.w20 || ctx.game.hero.breakthroughs.w20.placeholder) {
        ctx.game.hero.breakthroughs.w20 = {
          wave: 20,
          completed: true,
          placeholder: false,
          directionKey: dirSpec.key,
          directionName: dirSpec.name,
          directionIcon: dirSpec.icon,
          baseEffectActive: true,
          baseEffectDesc: dirSpec.baseDesc,
          enhancementKey: null,
          enhancementName: null,
          enhancementDesc: null,
          rerollCount: 0
        };
        ctx.game.hero.baseMaxHp += 60;
        deps.hero.syncHeroMaxHp();
        ctx.game.hero.hp = Math.min(ctx.game.hero.maxHp, ctx.game.hero.hp + 100);
        ctx.game.stats.breakthroughsCompleted = (ctx.game.stats.breakthroughsCompleted || 0) + 1;
        // Auto-collect any unpicked ground chests from W20 Boss
        if (ctx.game.chests.length) {
          for (const c of ctx.game.chests) ctx.ports.modals.queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
          ctx.game.chests = [];
        }
        deps.progression.initW20EnhancementDraft(dirSpec.key);
        ctx.game.pendingBreakthrough = 'w20';
        ctx.ports.modals.queueModal({ type: 'w20_breakthrough' });
      }
    } else if (clearedWave === 28) {
      const om = BALANCE.wave?.w28Omen || {};
      ctx.game.endgameOmen = {
        ...(ctx.game.endgameOmen || { wave: 28 }),
        triggered: true,
        clearTriggered: true,
        label: om.clearTitle || '🌑 终局预兆已现 · W29 前哨与终局情报即将揭晓！'
      };
      // Stage 5: Reveal W30 Final Boss (boss6) intel in W29 prep (concise banner + persistent HUD card, zero blocking popup!)
      if (ctx.game.bossIntel) ctx.game.bossIntel.w30Revealed = true;
    } else if (clearedWave === 29) {
      deps.finalPrep.enterW29FinalPrep(BALANCE.progression.w29FinalPrepSeconds || 90);
    }

    ctx.game.hero.realm = deps.unlock.getActiveUnlockNode().idx;
    deps.economy.rollShop(true);
    deps.hero.refreshCombos(true);

    const chestNote = ctx.game.chests.length ? ` · 地面有 ${ctx.game.chests.length} 个宝箱待拾取` : '';
    const intNote = interest ? ` + 利息 ${interest}` : '';
    if (clearedWave === 10) {
      ctx.ports.ui.showBanner('⚡ 第 10 波首领伏诛 · 触发【W10 首次大型突破】！', '指定一个已学主力神通并从 3 个随机形态分支中择一突破！主印上限将升至 4★、解锁第 2 辅印槽！', 'good');
    } else if (clearedWave === 15) {
      ctx.ports.ui.showBanner('⚡ 第 16 波备战 · 开放【W20 二破方向预选】！', 'W16–W19 随时可在顶栏/构筑总览预选与调整突破方向（击败 W20 首领拿到凭证后基础效果才会生效）！', 'good');
    } else if (clearedWave === 18) {
      ctx.ports.ui.showBanner(`🔎 W19 首领情报揭晓 · 天劫魔尊（辅助：${ctx.game.bossIntel.w20Aux}）`, `核心：${ctx.game.bossIntel.w20Core} · 辅助：${ctx.game.bossIntel.w20AuxDesc}`, 'boss');
    } else if (clearedWave === 20) {
      const w20 = ctx.game.hero.breakthroughs.w20;
      ctx.ports.ui.showBanner(`⚡ 天劫魔尊伏诛 · 【${w20?.directionName || '二破'}】基础效果已当场生效！`, '已获得 W20 突破凭证（零材料同样 100% 生效）！请从战后强化的候选卡中择一或消耗锻材整组重抽！', 'good');
    } else if (clearedWave === 28) {
      const om = BALANCE.wave?.w28Omen || {};
      ctx.ports.ui.showBanner(
        `🔎 W30 终局情报揭晓 · 深渊主宰（本局辅助：${ctx.game.bossIntel?.w30Aux || '未知'}）`,
        `核心：${ctx.game.bossIntel?.w30Core || '80%锁血冲击波'} · 辅助：${ctx.game.bossIntel?.w30AuxDesc || om.clearSub || 'W29 战后开启 90 秒最终整备'}`,
        'boss'
      );
    } else if (clearedWave !== 29) {
      const matNote = clearMatBonus > 0 ? ` · 精修锻材 +${clearMatBonus}` : '';
      ctx.ports.ui.showBanner(`✅ 第 ${clearedWave} / ${MAIN_WAVES} 波通关！`, `赏金 +${clearBonus}${intNote} 金${matNote} · 回血 +${BALANCE.progression.waveClearHeal}${chestNote}`, 'good');
    }
    ctx.ports.audio.play('merge');

    if (ctx.game.autoWave && !ctx.game.finalPrep?.active) {
      if (deps.unlock.hasPendingDecision()) {
        ctx.game.autoWavePausedForDecision = true;
        ctx.game.autoWaveTimer = 4.0;
        ctx.ports.ui.toast('⏸️ 存在待选突破或奖励，自动开波已暂停！');
      } else {
        ctx.game.autoWavePausedForDecision = false;
        ctx.game.autoWaveTimer = 4.0;
      }
    }
    ctx.ports.ui.renderAllUI(true);
  }

  function finishGame(victory){
    if (ctx.game.curWaveTel) deps.telemetry.finalizeCurrentTelemetry();
    if (ctx.game.combatLog && !Number.isFinite(ctx.game.combatLog.settledAtRunClock)) {
      ctx.game.combatLog.settledAtRunClock = deps.hero.getCombatLogNowSec();
    }
    deps.economy.syncRunResourceAccounting();
    if (ctx.game.w30Battle && ctx.game.w30Battle.active) {
      const boss = ctx.game.enemies.find(e => e.kind === 'boss6');
      const hpPct = victory ? 0 : (boss ? Math.round(clamp(boss.hp, 0, boss.maxHp) * 100 / Math.max(1, boss.maxHp)) : 0);
      const at = Number((ctx.game.w30Battle.elapsedSeconds || 0).toFixed(2));
      ctx.game.w30Battle.active = false;
      ctx.game.w30Battle.signatureLockActive = false;
      ctx.game.w30Battle.outcome = victory ? 'victory' : 'defeat';
      ctx.game.w30Battle.phase = 'ended';
      ctx.game.w30Battle.phaseTimeline.push({ phase: 'ended', outcome: ctx.game.w30Battle.outcome, at, bossHpPct: hpPct });
    }
    ctx.game.phase = victory ? 'won' : 'lost';
    ctx.game.subPhase = null;
    if (ctx.game.finalPrep) {
      ctx.game.finalPrep.active = false;
      ctx.game.finalPrep.transitioning = false;
    }
    ctx.game.projectiles = [];
    ctx.game.zones = [];
    ctx.game.healOrbs = [];
    ctx.game.shrine = null;
    ctx.game.speed = 1;
    ctx.ports.ui.setDangerVignette(false);
    // Stage 6: Idempotent per-runId settlement of legacy shards & one-time milestones
    deps.meta.settleRunMetaRewards(!!victory);
    ctx.ports.modals.showEndModal(victory);
    ctx.ports.ui.renderAllUI(true);
  }

  return {
    startNewRun,
    completeWaveClear,
    finishGame,
  };
}
