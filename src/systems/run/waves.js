import BALANCE from '../../data/balance.js';
import { W, H, MAIN_WAVES, SHRINE_WAVES, W20_DIRECTIONS } from '../../data/index.js';
import { clamp } from '../../core/math.js';

export function getWavePhaseMeta(w){
  const phase = BALANCE.wave.phases.find(p => w >= p.from && w <= p.to) || BALANCE.wave.phases[BALANCE.wave.phases.length - 1];
  return {
    tag: phase.tag,
    kind: phase.kind,
    mobMult: phase.mobMult,
    hpMult: phase.hpBase + (w - phase.offset) * phase.hpSlope
  };
}

export function getW25To28Pool(w){
  const pools = BALANCE.wave?.w25To28Pools || {};
  return (pools[String(w)] || []).slice();
}

export function createWavesSystem(ctx, deps) {
  function getW22To24Theme(themeKey = null){
    const themes = BALANCE.wave?.w22To24Themes || {};
    const key = themeKey || ctx.game?.wavePlan?.w22To24ThemeKey || 'mobile_rush';
    return themes[key] || themes.mobile_rush || Object.values(themes)[0] || null;
  }

  function rollW25To28Encounter(w, commitToGame = true){
    const pool = getW25To28Pool(w);
    if (!pool.length) return null;
    const pick = pool[Math.floor(ctx.game.rnd() * pool.length)];
    const enc = {
      wave: w,
      type: 'w25_28_random',
      id: pick.id,
      name: pick.name,
      primaryThreat: pick.primaryThreat,
      mobMultAdj: pick.mobMultAdj ?? 1,
      hpMultAdj: pick.hpMultAdj ?? 1,
      normal: pick.normal,
      heavy: pick.heavy
    };
    if (commitToGame && ctx.game?.wavePlan) {
      ctx.game.wavePlan.w25To28Rolled[String(w)] = enc;
      ctx.game.wavePlan.currentEncounter = enc;
    }
    return enc;
  }

  function getWaveEncounterInfo(w = ctx.game?.wave){
    if (!ctx.game) return null;
    const waveNum = Number(w || ctx.game.wave || 1);
    if (waveNum >= 22 && waveNum <= 24) {
      const theme = getW22To24Theme();
      const wSpec = theme?.waves?.[String(waveNum)] || null;
      if (!theme || !wSpec) return null;
      return {
        wave: waveNum,
        type: 'w22_24_shared_threat',
        revealed: true,
        themeKey: theme.key,
        themeName: theme.name,
        primaryThreat: theme.primaryThreat,
        threatLabel: theme.threatLabel,
        counterHint: theme.counterHint,
        comboLabel: wSpec.comboLabel,
        pressureLevel: wSpec.pressureLevel
      };
    }
    if (waveNum >= 25 && waveNum <= 28) {
      // STRICTLY NO pre-wave spoilers during prep phase!
      const isCurrentPrep = waveNum === ctx.game.wave && ctx.game.phase === 'prep';
      const rolled = ctx.game.wavePlan?.w25To28Rolled?.[String(waveNum)] || null;
      if (isCurrentPrep || !rolled) {
        return {
          wave: waveNum,
          type: 'w25_28_random',
          revealed: false,
          id: null,
          name: '开战后揭晓',
          primaryThreat: null
        };
      }
      return {
        wave: waveNum,
        type: 'w25_28_random',
        revealed: true,
        id: rolled.id,
        name: rolled.name,
        primaryThreat: rolled.primaryThreat
      };
    }
    return null;
  }

  function getEndgameOmenState(){
    return ctx.game?.endgameOmen ? { ...ctx.game.endgameOmen } : { triggered: false, wave: 28, midWaveTriggered: false, clearTriggered: false, label: '' };
  }

  function buildWaveQueue(w, customEncounter = null){
    const q = [];
    const meta = getWavePhaseMeta(w);
    const bw = BALANCE.wave;
    const lateScale = w >= bw.lateHpGrowthSecondStart
      ? Math.pow(bw.lateHpGrowthSecond, w - (bw.lateHpGrowthSecondStart - 1))
      : w >= bw.lateHpGrowthStart
        ? Math.pow(bw.lateHpGrowthFirst, w - (bw.lateHpGrowthStart - 1)) : 1;

    // Stage 3 & Stage 5 Wave-specific encounter mixes (W21 showcase, W22-24 shared-threat, W25-28 independent draws, W29 compact outpost)
    let encounterSpec = customEncounter;
    let packBonus = 0;
    let mobMultAdj = 1;
    let hpMultAdj = 1;
    let durationMult = 1;
    let packOffsetMult = 1;
    let spawnJitterMult = 1;
    let activeMix = bw.mobMix.find(m => w <= m.to) || bw.mobMix[bw.mobMix.length - 1];

    if (w === 21 && bw.w21ShowcaseMix) {
      activeMix = bw.w21ShowcaseMix;
      packBonus = 1;
    } else if (w >= 22 && w <= 24) {
      const theme = getW22To24Theme();
      const wSpec = theme?.waves?.[String(w)];
      if (wSpec) {
        activeMix = wSpec;
        packBonus = wSpec.packBonus || 0;
        mobMultAdj = wSpec.mobMultAdj ?? 1;
        hpMultAdj = wSpec.hpMultAdj ?? 1;
      }
    } else if (w >= 25 && w <= 28) {
      if (!encounterSpec) encounterSpec = rollW25To28Encounter(w, false);
      if (encounterSpec) {
        activeMix = encounterSpec;
        mobMultAdj = encounterSpec.mobMultAdj ?? 1;
        hpMultAdj = encounterSpec.hpMultAdj ?? 1;
      }
    } else if (w === 29 && bw.w29Outpost) {
      // Stage 5: W29 same-direction modest escalation over W28 — tighter spawn pacing/denser batches AND slightly tougher enemies!
      const w29 = bw.w29Outpost;
      activeMix = w29;
      packBonus = w29.packBonus || 2;
      mobMultAdj = w29.mobMultAdj ?? 1.04;
      hpMultAdj = w29.hpMultAdj ?? 1.06;
      durationMult = w29.durationMult ?? 0.84;
      packOffsetMult = w29.packOffsetMult ?? 0.72;
      spawnJitterMult = w29.spawnJitterMult ?? 0.75;
    }

    const scale = Math.pow(bw.normalHpGrowth, w - 1) * meta.hpMult * lateScale * hpMultAdj;
    const sides = w <= 2 ? ['west','east','north'] : ['west','east','north','south'];
    const baseMobs = Math.min(bw.mobsBaseCap, Math.round(bw.mobsBase + w * bw.mobsPerWave));
    const totalMobs = w === MAIN_WAVES
      ? Math.max(8, Number(bw.w30VanguardMobs || 16))
      : Math.min(bw.mobsFinalCap, Math.round(baseMobs * meta.mobMult * mobMultAdj));
    const baseDuration = Math.min(bw.durationCap, bw.durationBase + w * bw.durationPerWave);
    const duration = w === MAIN_WAVES ? 12.0 : Number((baseDuration * durationMult).toFixed(2));

    const pickMobKind = (forceHeavy = false) => {
      const r = ctx.game.rnd();
      const distribution = forceHeavy && activeMix.heavy ? activeMix.heavy : activeMix.normal;
      for (const [kind, upper] of distribution) if (r < upper) return kind;
      return distribution[distribution.length - 1][0];
    };

    // Arknights-style 3-stage waveform inside each wave (W30 uses a crisp opening vanguard for the Final Boss arena)
    const stage = bw.stages;
    const effJitter = stage.spawnJitter * spawnJitterMult;
    const effPackOffset = stage.packOffset * packOffsetMult;

    if (w === MAIN_WAVES) {
      // Focused W30 Boss Arena: small vanguard starting at 0.35s + Final Boss (boss6) arriving at 1.0s
      for (let i = 0; i < totalMobs; i++) {
        const at = Number((0.35 + (i / Math.max(1, totalMobs - 1)) * 10.5).toFixed(3));
        q.push({ at, side: sides[i % sides.length], kind: pickMobKind(i >= totalMobs / 2), scale, spawned: false });
      }
      const bossKind = bw.bossByWave?.[String(w)] || 'boss6';
      const w30SpawnAt = BALANCE.w30Boss?.bossSpawnAt ?? 1.0;
      q.push({ at: w30SpawnAt, side: 'west', kind: bossKind, scale: 1, spawned: false });
      q.sort((a, b) => a.at - b.at);
      return q;
    }

    const s1Count = Math.round(totalMobs * stage.fractionOne);
    const s2Count = Math.min(stage.quietMax, Math.max(stage.quietMin, Math.round(totalMobs * stage.fractionTwo)));
    const s3Count = Math.max(0, totalMobs - s1Count - s2Count);

    const pushPacks = (count, tStart, tEnd, packSz, heavy) => {
      const effPack = Math.max(1, packSz + packBonus);
      for (let i = 0; i < count; ) {
        const pack = Math.min(effPack, count - i);
        const frac = count <= effPack ? 0.5 : i / count;
        const t = tStart + frac * (tEnd - tStart) + ctx.game.rnd() * effJitter;
        const side = sides[Math.floor(ctx.game.rnd() * sides.length)];
        for (let k = 0; k < pack; k++) {
          q.push({ at: t + k * effPackOffset, side, kind: pickMobKind(heavy), scale, spawned: false });
        }
        i += pack;
      }
    };

    const [a1,b1,p1,h1] = stage.first;
    const [a2,b2,p2,h2] = stage.second;
    const [a3,b3,p3,h3] = stage.third;
    pushPacks(s1Count, a1, duration * b1, p1, h1);
    pushPacks(s2Count, duration * a2, duration * b2, p2, h2);
    pushPacks(s3Count, duration * a3, duration * b3, p3, h3);

    // Elites from Wave 2 onward: 1 elite W2-11, 2 elites W12-21, 3 elites W22+
    if (w >= bw.eliteFirstWave) {
      const eliteCount = (bw.eliteCountLateWave && w >= bw.eliteCountLateWave)
        ? (bw.eliteCountEndgame || bw.eliteCountLate)
        : (w >= bw.eliteCountIncreasedWave ? (bw.eliteCountMid || bw.eliteCountLate) : bw.eliteCountEarly);
      const eliteWaveScale = Math.pow(bw.eliteHpGrowth, w - bw.eliteFirstWave) * (w === 29 ? hpMultAdj : 1);
      for (let e = 0; e < eliteCount; e++) {
        q.push({
          at: duration * (0.24 + e * 0.24),
          side: sides[e % sides.length],
          kind: 'elite', scale: eliteWaveScale, spawned: false
        });
      }
    }

    // 6 Major Bosses on Wave 5, 10, 15, 20, 25, 30
    if (w % bw.bossPeriod === 0) {
      const bossKind = bw.bossByWave?.[String(w)] || (w === 5 ? 'boss1' : w === 10 ? 'boss2' : w === 15 ? 'boss3' : w === 20 ? 'boss4' : w === 25 ? 'boss5' : 'boss6');
      q.push({ at: bw.bossSpawnAt, side: 'west', kind: bossKind, scale: 1, spawned: false });
    }

    q.sort((a, b) => a.at - b.at);
    return q;
  }

  function startWave(opts = {}){
    if (ctx.game.phase !== 'prep') return false;
    const fromFinalPrep = !!(opts && (opts.fromFinalPrepTimeout || opts.fromFinalPrepEarly));

    // Stage 5: Active W29 90s final prep routes manual startWave clicks through startW30Early() for full boundary safety!
    if (ctx.game.finalPrep?.active && !fromFinalPrep) {
      const res = deps.finalPrep.startW30Early({ acceptRandomClaim: !!opts?.acceptRandomClaim });
      return !!res?.ok;
    }

    ctx.ports.audio.unlock();
    // Safety net: auto-collect any unpicked ground chests from prep before starting next wave!
    if (ctx.game.chests.length) {
      for (const c of ctx.game.chests) ctx.ports.modals.queueModal({ type:'chest', legend: c.legend, shrineTier: !!c.shrineTier });
      ctx.game.chests = [];
      ctx.ports.ui.toast('已自动收起地面遗留的构装宝箱！');
      ctx.ports.ui.renderAllUI();
      return false;
    }
    if (!fromFinalPrep && ctx.game.destiny?.pendingOffer && !ctx.game.destiny.pendingOffer.claimed) {
      ctx.ports.modals.openDestinyGambleModal();
      ctx.ports.ui.toast('🎲 天命赌局尚有未领取的三选一奖励，请先领取再开战！', true);
      ctx.ports.ui.renderAllUI(true);
      return false;
    }
    if (!fromFinalPrep && (ctx.game.pendingBreakthrough || ctx.game.activeModal || ctx.game.pendingModals.length > 0)) {
      ctx.ports.ui.toast('请先完成当前待选突破或奖励！', true);
      ctx.ports.ui.renderAllUI();
      return false;
    }
    if (ctx.game.transferDraft) {
      deps.equipment.cancelAffixTransferPreview();
    }
    if (ctx.game.shopConfirmDraft) {
      deps.economy.cancelShopPurchaseConfirm();
    }

    // Stage 3: W20 start requires a confirmed preselected direction and locks it immediately!
    if (ctx.game.wave === 20 && !ctx.game.hero.breakthroughs.w20) {
      if (!ctx.game.w20State?.preselectedDirection) {
        ctx.ports.modals.openW20PreselectModal({ requireConfirmStart: true });
        ctx.ports.ui.toast('请先选定并锁定 W20 第二次突破方向后再迎战天劫魔尊！', true);
        ctx.ports.ui.renderAllUI(true);
        return false;
      }
      deps.progression.lockW20DirectionForBattle();
    }

    if (ctx.game.finalPrep && ctx.game.finalPrep.active) {
      ctx.game.finalPrep.active = false;
      ctx.game.finalPrep.awaitingWaveRewards = false;
      ctx.game.finalPrep.transitioning = false;
      ctx.game.subPhase = null;
    }
    const meta = getWavePhaseMeta(ctx.game.wave);
    const w29DurMult = (ctx.game.wave === 29 && BALANCE.wave?.w29Outpost?.durationMult) ? BALANCE.wave.w29Outpost.durationMult : 1;
    const duration = Math.min(BALANCE.wave.durationCap, BALANCE.wave.durationBase + ctx.game.wave * BALANCE.wave.durationPerWave) * w29DurMult;
    if (!ctx.game.metaRunLocked) deps.meta.lockMetaLoadoutForRun();
    if (ctx.game.metaRunState) ctx.game.metaRunState.deflectReady = true;
    ctx.game.phase = 'wave';
    ctx.game.subPhase = null;
    ctx.game.waveClock = 0;
    ctx.game.stormWarnAt = ctx.game.wave === MAIN_WAVES ? 9999 : duration * 0.44;
    ctx.game.stormWarned = false;
    ctx.game.eliteChestDropped = false;
    ctx.game.healOrbs = [];
    ctx.game.inspTarget = null;
    ctx.game.mode = null;

    // Stage 3 & Stage 5: Reveal W20 Boss intel on W19+ and W30 Boss intel on W29+; roll W25-W28 encounter ONLY at wave start!
    if (ctx.game.wave >= (BALANCE.w20Breakthrough?.bossIntelRevealWave || 19)) {
      ctx.game.bossIntel.w20Revealed = true;
    }
    if (ctx.game.wave >= (BALANCE.w30Boss?.intelRevealWave || 29)) {
      ctx.game.bossIntel.w30Revealed = true;
    }
    let rolledEncounter = null;
    if (ctx.game.wave >= 25 && ctx.game.wave <= 28) {
      rolledEncounter = rollW25To28Encounter(ctx.game.wave, true);
    } else if (ctx.game.wave >= 22 && ctx.game.wave <= 24) {
      ctx.game.wavePlan.currentEncounter = getWaveEncounterInfo(ctx.game.wave);
    } else {
      ctx.game.wavePlan.currentEncounter = null;
    }

    ctx.game.waveQueue = buildWaveQueue(ctx.game.wave, rolledEncounter);
    ctx.game.autoWaveTimer = 0;
    ctx.game.autoWavePausedForDecision = false;

    // Stage 5: Start unified W30 Final Boss battle timer the exact moment player gains control in W30!
    if (ctx.game.wave === MAIN_WAVES) {
      const w30Cfg = BALANCE.w30Boss || {};
      const fixedMaxHp = BALANCE.enemies?.boss6?.hp || 320000;
      const sigPct = w30Cfg.signatureThresholdPct ?? 0.80;
      const finPct = w30Cfg.finalPhaseThresholdPct ?? 0.35;
      ctx.game.w30Battle = {
        active: true,
        startedAtWaveClock: 0,
        elapsedSeconds: 0,
        phase: 'opening',
        outcome: null,
        bossId: null,
        bossMaxHp: fixedMaxHp,
        signatureThresholdPct: sigPct,
        signatureThresholdHp: Math.round(fixedMaxHp * sigPct),
        finalThresholdPct: finPct,
        finalThresholdHp: Math.round(fixedMaxHp * finPct),
        signatureTriggered: false,
        signatureLockActive: false,
        signatureLockStartedAt: null,
        signatureLockEndedAt: null,
        signatureTruncatedDmg: 0,
        signatureHitsDuringLock: 0,
        signatureHpDamageDuringLock: 0,
        signatureLifestealDuringLock: 0,
        signatureStatusHitsDuringLock: {
          fireMarks: 0,
          fireDetonations: 0,
          frostSlows: 0,
          frostShieldGained: 0,
          frostPulses: 0
        },
        auxKey: ctx.game.bossIntel?.w30AuxKey || 'abyss_pillars',
        auxName: ctx.game.bossIntel?.w30Aux || '护界晶柱',
        auxTriggers: 0,
        healOrbsSpawned: 0,
        healOrbsCollected: 0,
        phaseTimeline: [
          { phase: 'opening', at: 0, bossHpPct: 100 }
        ]
      };
    } else {
      ctx.game.w30Battle = null;
    }

    // Spawn optional Black-Myth-style Blood Shrine (W3/W7/W12/W17/W22/W27)
    if (SHRINE_WAVES.includes(ctx.game.wave)) {
      const ang = ctx.game.rnd() * Math.PI * 2;
      const d = 10 + ctx.game.rnd() * 3.5;
      ctx.game.shrine = {
        x: clamp(ctx.game.hero.x + Math.cos(ang) * d, 3.2, W - 3.2),
        y: clamp(ctx.game.hero.y + Math.sin(ang) * d, 3.2, H - 3.2),
        r: 1.45, active: false, cleared: false, charge: 0, wave: ctx.game.wave
      };
    } else {
      ctx.game.shrine = null;
    }

    // Start Wave Telemetry sampler
    const h = ctx.game.hero;
    h.routeCombat = {};
    ctx.game.curWaveTel = {
      wave: ctx.game.wave, phaseTag: meta.tag, kind: meta.kind,
      encounterId: rolledEncounter?.id || ctx.game.wavePlan.currentEncounter?.themeKey || (ctx.game.wave === 29 ? 'w29_outpost' : ctx.game.wave === 30 ? 'w30_boss6' : null),
      duration: 0, minHpPct: Math.round(h.hp * 100 / Math.max(1, h.maxHp)),
      dmgTaken: 0, hitsTaken: 0, moveDist: 0, dashCount: 0, ultCount: 0,
      shrineTried: false, shrineCleared: false, ehpTotal: 0,
      dmgDealtStart: ctx.game.stats.dmgTotal, goldStart: ctx.game.gold, killGold: 0, greedGold: 0
    };

    // Stage 3: W28 Endgame Omen trigger at wave start
    const isBoss = ctx.game.wave % 5 === 0;
    if (ctx.game.wave === 28) {
      const om = BALANCE.wave?.w28Omen || {};
      ctx.game.endgameOmen = {
        triggered: true,
        wave: 28,
        midWaveTriggered: false,
        clearTriggered: false,
        label: om.startTitle || '🌑 第 28 波 · 终局预兆降临！',
        encounterName: rolledEncounter?.name || ''
      };
      ctx.ports.audio.play('boss', 0.92);
      ctx.ports.ui.flashScreen('fail');
      ctx.ports.ui.showBanner(
        om.startTitle || '🌑 第 28 波 · 终局预兆降临！',
        `${rolledEncounter ? `【${rolledEncounter.name}】来袭 · ` : ''}${om.startSub || 'W29 将公布 W30 情报并进入 90 秒最终整备！'}`,
        'boss'
      );
    } else {
      ctx.ports.audio.play(isBoss ? 'boss' : 'merge', isBoss ? 1 : 0.85);
      const lockedDir = ctx.game.w20State?.lockedDirection ? W20_DIRECTIONS[ctx.game.w20State.lockedDirection] : null;
      const w22Info = (ctx.game.wave >= 22 && ctx.game.wave <= 24) ? getWaveEncounterInfo(ctx.game.wave) : null;
      const subMsg = isBoss
        ? (ctx.game.wave === 10 ? '击败首领后触发【W10 首次大型突破】！'
          : ctx.game.wave === 20 ? `已锁定二破方向【${lockedDir?.name || '未定'}】！击败天劫魔尊（辅助：${ctx.game.bossIntel.w20Aux}）当场激活基础效果！`
          : ctx.game.wave === 25 ? `玄冥妖皇携【${rolledEncounter?.name || '成型敌群'}】降临！注意走位躲避寒潮与弹幕！`
          : ctx.game.wave === 30 ? `终局决战 · 深渊主宰（本局辅助：${ctx.game.bossIntel.w30Aux}）！80% 血线锁血冲击波请入安全区，末段打空即胜！`
          : '高能首领战！注意走位躲避破阵重击，斩首必爆高阶宝箱！')
        : ctx.game.wave === 21 ? `第二次大型突破【${lockedDir?.name || '已激活'}】生效。用这一波验证新招式与已有装备的配合。`
        : ctx.game.wave === 29 ? `前哨紧凑强敌来袭（W30 情报已揭晓 · 辅助：${ctx.game.bossIntel.w30Aux}）！通关后开启 90 秒独立最终整备！`
        : w22Info ? `同源威胁【${w22Info.themeName}】· ${w22Info.comboLabel}（${w22Info.counterHint}）`
        : rolledEncounter ? `本波独立抽中敌群【${rolledEncounter.name}】！检验成型构筑！`
        : (ctx.game.shrine ? '本章【🩸血煞妖碑】已现身远端！试炼赢金币、锻材与高阶构装宝箱！' : '注意走位切入外圈弓巫并避开重击破阵！');
      ctx.ports.ui.showBanner(
        isBoss ? `⚠️ 第 ${ctx.game.wave} / ${MAIN_WAVES} 波 [${meta.tag}] · 首领降临！`
               : `第 ${ctx.game.wave} / ${MAIN_WAVES} 波 · ${meta.tag}`,
        subMsg,
        isBoss ? 'boss' : (meta.kind === 'relief' ? 'good' : '')
      );
    }
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  return {
    getWavePhaseMeta,
    getW25To28Pool,
    getW22To24Theme,
    rollW25To28Encounter,
    getWaveEncounterInfo,
    getEndgameOmenState,
    buildWaveQueue,
    startWave,
  };
}
