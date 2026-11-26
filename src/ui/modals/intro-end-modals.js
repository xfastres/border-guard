import { withIcons } from '../shared/icons.js';
import { BUILD_ROUTES } from '../../data/build-data.js';
import { MAIN_WAVES } from '../../data/core-data.js';

export function createIntroEndModals(runtimeCtx, deps) {
  const { getEl, audio } = deps;
  const { rollShop } = deps.economy;
  const { getActiveGearAffixSynergies } = deps.equipment;
  const { toast } = deps.feedback;
  const { formatDurationMMSS } = deps.formatters;
  const { getRecentThreatSummary } = deps.hero;
  const {
    getMetaConfig, getMetaSave, getActiveMetaLoadout, getMetaMainSpec, getMetaAuxSpec, getMetaLoadoutBudget,
    lockMetaLoadoutForRun, settleRunMetaRewards, retryPendingMetaSave, exportMetaSave,
  } = deps.meta;
  const { getRealmStageLabel } = deps.progression;
  const { getTelemetryReport, startNewRun } = deps.run;

  function showIntroModal(){
    runtimeCtx.game.activeModal = { type:'intro' };
    const save = getMetaSave();
    const mainSpec = getMetaMainSpec(save.loadout.main);
    const auxSpecs = (save.loadout.aux || []).map(id => getMetaAuxSpec(id)).filter(Boolean);
    const budget = getMetaLoadoutBudget(save.loadout);
    const box = getEl('modalBox');
    box.innerHTML = withIcons(`
    <h2>⚔️ 边境守卫 v0.60 · 秘境视觉试玩</h2>
    <p class="lead">64×48 修仙秘境自由游走！从 <strong>W1</strong> 迎战 6 大首领与 <strong>W10 / W20 双大型突破</strong>，激活双/三词条实战联动，完成 <strong>W29 实时 90 秒整备</strong>并决战 <strong>W30 深渊主宰</strong>！</p>
    <div class="meta-lock-banner" style="margin-bottom:10px">
      <div>💠 当前局外传承：<strong>${mainSpec ? `${mainSpec.icon}${mainSpec.name}` : '未选'}</strong> · 辅助（${budget.auxCount}/3 · ${budget.auxPoints}/4点）：<strong>${auxSpecs.map(a => `${a.icon}${a.name}`).join(' / ') || '无'}</strong></div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="meta-pts-pill">💠 ${save.legacyShards} 碎片</span>
        <button class="btn" id="introMetaBtn" type="button" style="padding:4px 10px;font-size:12px">⚙️ 局外传承与解锁</button>
      </div>
    </div>
    <div class="intro-grid">
      <div class="intro-box">
        <h4>🔥❄️ 跨阶段双/三词条实战联动</h4>
        <p>火标、寒盾、回锋、蓄雷、血契、裁决与重击各有打法。选择两条相合词条可以启动机制，再补第三条完成联动。</p>
      </div>
      <div class="intro-box">
        <h4>🏪 常规经济 · 天命赌局 · 词条转移台</h4>
        <p>多余装备自主<strong>出售换金</strong>或<strong>拆解得锻材</strong>（按品质与来源阶段计算）；常规商店稳健精修即可通关，也可参与天命赌局搏取转印符与天命专属强化！</p>
      </div>
      <div class="intro-box">
        <h4>⏳ W29 90秒实时整备 & W30 三段决战</h4>
        <p>W29 战后先结清波末奖励，再开启 <strong>90 秒实时终局整备</strong>（倍速不变）；W30 深渊主宰 80% 血线强制招牌锁血冲击波，末段打空即胜！</p>
      </div>
      <div class="intro-box">
        <h4>💠 固定预算局外传承与防刷结算</h4>
        <p>开局锁定 <strong>1 主传承 + 最多 3 辅助（固定 4 点）</strong>，主传承权重倾斜 ×1.35 并保持活跃池定容防稀释；三维结算提供真实伤害归因与单局防重复发奖。</p>
      </div>
    </div>
    <details class="practice-setup">
      <summary>阶段练习</summary>
      <div class="practice-controls">
        <label>波次 <select id="practiceWave">
          ${[1, 7, 10, 15, 20, 25, 29, 30].map(wave => `<option value="${wave}">W${wave}</option>`).join('')}
        </select></label>
        <label>构筑 <select id="practiceBuild">
          ${Object.entries(BUILD_ROUTES).map(([key, route]) => `<option value="${key}">${route.name}</option>`).join('')}
        </select></label>
        <label>配装 <select id="practiceTier"><option value="standard">标准</option><option value="weak">基础</option><option value="strong">优秀</option></select></label>
        <button type="button" class="btn" id="practiceGo">加载练习</button>
      </div>
      <p>加载该波备战。练习结算不计入正式传承。</p>
    </details>
    <div class="modal-footer">
      <button class="btn" id="introMetaBtnFoot" type="button" style="padding:9px 14px;font-size:13px">⚙️ 配置局外传承</button>
      <button class="btn gold" id="introGo" type="button" style="padding:9px 22px;font-size:14px">⚔️ 锁定传承 · 踏入秘境！</button>
    </div>
  `);
    const openMetaFromIntro = () => deps.metaModal.openMetaLegacyModal({ context: 'pre_run', returnTo: 'intro' });
    box.querySelector('#introMetaBtn')?.addEventListener('click', openMetaFromIntro);
    box.querySelector('#introMetaBtnFoot')?.addEventListener('click', openMetaFromIntro);
    box.querySelector('#practiceGo')?.addEventListener('click', () => {
      audio.unlock();
      deps.startPractice?.({
        wave: Number(box.querySelector('#practiceWave').value),
        build: box.querySelector('#practiceBuild').value,
        tier: box.querySelector('#practiceTier').value,
      });
    });
    box.querySelector('#introGo')?.addEventListener('click', () => {
      audio.unlock();
      if (!runtimeCtx.game.metaRunLocked) {
        lockMetaLoadoutForRun();
        rollShop(true);
      }
      deps.modalManager.closeModal();
    });
    getEl('modalBackdrop').hidden = false;
  }

  function showEndModal(victory){
    runtimeCtx.game.activeModal = { type:'end', victory: !!victory };
    const rep = getTelemetryReport();
    const settle = runtimeCtx.game.metaSettlement || settleRunMetaRewards(!!victory);
    const rm = runtimeCtx.game.runMetrics || {};
    const recentRows = rep.waves.slice(-8).map(w =>
      `<tr><td>W${w.wave} (${w.phaseTag})</td><td>${w.duration}s</td><td style="color:${w.minHpPct<35?'#ff7b6b':'#7ce896'}">${w.minHpPct}%</td><td>${w.hitsTaken}</td><td>${w.dps}</td><td>${w.shrineCleared?'✅':w.shrineTried?'❌':'—'}</td></tr>`
    ).join('');
    const w10Info = runtimeCtx.game.hero.breakthroughs.w10
      ? `${runtimeCtx.game.hero.breakthroughs.w10.skillName} · ${runtimeCtx.game.hero.breakthroughs.w10.branchName}`
      : '未完成';
    const w20 = runtimeCtx.game.hero.breakthroughs.w20;
    const w20Info = w20
      ? (w20.placeholder
        ? '已达成 W20 突破节点'
        : `${w20.directionIcon || '⚡'}${w20.directionName || w20.directionKey}${w20.enhancementName ? ` × ${w20.enhancementName}` : '（基础效果生效）'}`)
      : '未达成';
    const activeGearSyn = getActiveGearAffixSynergies();
    const synNames = activeGearSyn.active.length
      ? activeGearSyn.active.map(s => `${s.icon}${s.name}(${s.tier === 3 ? '三联动' : '双联动'})`).join('、')
      : '无词条联动';
    const w30B = runtimeCtx.game.w30Battle;
    const w30Line = w30B
      ? `<br>W30 深渊主宰：用时 <b>${Number(w30B.elapsedSeconds || 0).toFixed(1)}s</b> · 辅助 <b>${w30B.auxName || '—'}</b> · 招牌锁血 <b>${w30B.signatureTriggered ? '已完整经历' : '未触发'}</b>`
      : '';

    const lo = getActiveMetaLoadout();
    const mainSpec = getMetaMainSpec(lo.main);
    const auxSpecs = (lo.aux || []).map(id => getMetaAuxSpec(id)).filter(Boolean);
    const budget = getMetaLoadoutBudget(lo);
    const lowestHp = Math.min(rep.summary.lowestHpPct ?? 100, runtimeCtx.game.combatLog?.lowestHpPct ?? 100);
    const threat = getRecentThreatSummary(5.0);
    const fatal = runtimeCtx.game.combatLog?.fatalSource || null;
    const fatalHtml = fatal
      ? `<b>致命一击：</b>${fatal.attackerName} · <b>${fatal.skillName}</b>${fatal.isBossCore ? '【首领核心】' : fatal.isBossAux ? '【首领随机辅助】' : ''}（扣血 <b>-${fatal.hpLost}</b>${fatal.shieldAbsorbed > 0 ? `，盾抵 ${fatal.shieldAbsorbed}` : ''}，W${fatal.wave} ${fatal.waveClock}s）`
      : (victory ? '<b>存活通关：</b>未触发致命伤。' : '<b>致命记录：</b>无有效受击记录（非受击结束）。');
    const recentThreatHtml = threat.topThreats.length
      ? threat.topThreats.slice(0, 3).map(t => `${t.attackerName}·${t.skillName}(${t.hits}次/-${t.totalHpLost}血)`).join('；')
      : '近 5 秒无受击记录';

    const shardDetailText = settle?.practice ? '阶段练习 · 无传承结算' : settle?.eligible
      ? `波段推进 +${(settle.band1Shards || 0) + (settle.band2Shards || 0) + (settle.band3Shards || 0)}（W3-10:${settle.band1Shards} / W11-20:${settle.band2Shards} / W21-29:${settle.band3Shards}）· 首领 +${settle.bossBonus} · 突破 +${(settle.w10Bonus || 0) + (settle.w20Bonus || 0)}${settle.w30VictoryBonus ? ` · W30通关大奖 +${settle.w30VictoryBonus}` : ''}`
      : '未通过 W3 且未击败首领：防速死刷取规则生效，本局传承碎片收益为 0（有效推进后即可获得长期成长）';
    const newMsList = (settle?.newlyClaimedMilestones || []).map(m => `${m.name}(+💠${m.shardReward})`).join('、') || '无新增';
    const saveFailed = !!(settle && (settle.saveStatus === 'failed' || settle.persisted === false));
    const dupGuardText = settle?.practice ? '阶段练习记录仅在当前画面显示。' : settle?.duplicateBlocked
      ? '🛡️ 防重放已拦截（本 runId 奖励此前已发放，本次 +0）'
      : saveFailed
        ? `⚠️ 本地存档写入失败，本局奖励尚未持久化（原因：${settle.saveError || 'storage_write_failed'}）`
        : `✅ 单局首结已入账（runId: ${runtimeCtx.game.runId}）`;
    const saveWarningHtml = saveFailed ? `
        <div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,95,86,0.16);border:1px solid rgba(255,123,107,0.55);color:#ffd2cc;font-size:12px">
          ⚠️ <b>本地存档写入失败，本局奖励尚未持久化！</b>（${settle.saveError || '存储空间不足或受限'}）
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button class="btn gold" id="endRetrySaveBtn" type="button" style="padding:5px 10px;font-size:12px">🔄 重试保存</button>
            <button class="btn" id="endExportBackupBtn" type="button" style="padding:5px 10px;font-size:12px">💾 导出备份 JSON</button>
          </div>
        </div>` : '';

    const box = getEl('modalBox');
    box.innerHTML = withIcons(`
    <h2>${victory ? `🏆 30 波秘境守卫大成！你斩杀了第 ${MAIN_WAVES} 波深渊主宰！` : `💀 道消身陨 · 止步第 ${runtimeCtx.game.wave} / ${MAIN_WAVES} 波（${getRealmStageLabel()}）`}</h2>
    <p class="lead">${victory ? '你已完成全部 30 波边境守卫与终局决战！以下为本局三维度真实结算报告：' : '本局已在当前波次立即结算。以下为三维度真实战况归因与长期成长结算：'}</p>
    <div class="settle-grid">
      <div class="settle-card">
        <h4>① 通关结果与传承快照</h4>
        <p>结算状态：<b style="color:${victory?'#7ce896':'#ff7b6b'}">${victory ? '30 波通关胜利' : `第 ${runtimeCtx.game.wave} 波战败结算`}</b><br>
        到达波次：<b>W${runtimeCtx.game.wave} / W${MAIN_WAVES}</b> · 节点：<b>${getRealmStageLabel()}</b><br>
        总有效时长：<b>${formatDurationMMSS(rm.totalEffectiveSec)}</b>（普通战 ${Math.round(rm.normalCombatSec||0)}s / 首领战 ${Math.round(rm.bossCombatSec||0)}s / 整备 ${Math.round((rm.prepSec||0)+(rm.w29FinalPrepSec||0))}s）${w30Line}<br>
        锁定传承：<b>${mainSpec ? `${mainSpec.icon}${mainSpec.name}` : '无'}</b> · 辅助(${budget.auxPoints}/4点)：<b>${auxSpecs.map(a => a.name).join(' / ') || '无'}</b></p>
      </div>
      <div class="settle-card">
        <h4>② 本局表现与真实受击归因</h4>
        <p>击杀：<b>${runtimeCtx.game.stats.kills}</b>（首领 <b>${runtimeCtx.game.stats.bossKills || 0}</b> / 精英 <b>${runtimeCtx.game.stats.elites}</b>） · 总输出：<b>${Math.round(runtimeCtx.game.stats.dmgTotal).toLocaleString()}</b><br>
        最低血线：<b>${lowestHp}%</b> · 受击总计：<b>${runtimeCtx.game.combatLog?.totalHitsTaken || 0}</b> 次（失血 ${runtimeCtx.game.combatLog?.totalHpLost || 0} / 护盾吸收 ${runtimeCtx.game.combatLog?.totalShieldAbsorbed || 0}）<br>
        W10：<b>${w10Info}</b> · W20：<b>${w20Info}</b><br>
        装备联动：<b>${synNames}</b><br>
        资源收支：金币 +${rm.goldEarned||0}/-${rm.goldSpent||0}(余${runtimeCtx.game.gold}) · 锻材 +${rm.materialsEarned||0}/-${rm.materialsSpent||0}(余${runtimeCtx.game.materials||0}) · 转印符 +${rm.transferTokensEarned||0}/-${rm.transferTokensSpent||0}(余${runtimeCtx.game.transferTokens||0}) · 赌局 ${runtimeCtx.game.stats.destinyRolls||0}次</p>
        <div class="attr-log">${fatalHtml}<br><b>近 5 秒真实威胁：</b>${recentThreatHtml}</div>
      </div>
      <div class="settle-card full">
        <h4>③ 长期成长与资源结算 · 传承碎片与里程碑</h4>
        <p>本局实发传承碎片：<b style="color:#72f2b4;font-size:14px">💠 +${settle?.totalShardsGranted ?? 0}</b>（当前余额：<b>💠 ${getMetaSave().legacyShards}</b>） · ${dupGuardText}<br>
        收益明细：${shardDetailText}<br>
        新增一次性里程碑：<b>${newMsList}${settle?.challengeMarks?.length ? ` · 试炼徽记：${settle.challengeMarks.join("、")}` : ""}</b>（累计已完成 ${getMetaSave().claimedMilestones.length}/${getMetaConfig().milestones.length}）</p>${saveWarningHtml}
      </div>
    </div>
    ${recentRows ? `
    <div style="background:rgba(0,0,0,0.28);border:1px solid rgba(182,218,214,0.16);border-radius:10px;padding:8px 10px;margin-bottom:10px;overflow-x:auto">
      <div style="font-size:11px;font-weight:900;color:#ffe28a;margin-bottom:4px">📊 波次难度体检摘要（均耗时 ${rep.summary.avgDuration}s）</div>
      <table class="tel-table">
        <tr><th>波次·阶段</th><th>耗时</th><th>最低血</th><th>受击</th><th>DPS</th><th>妖碑</th></tr>
        ${recentRows}
      </table>
    </div>` : ''}
    <div class="modal-footer">
      ${settle?.practice ? '' : `<button class="btn" id="endMetaBtn" type="button" style="padding:9px 15px;font-size:13px">⚙️ 局外传承配置（💠${getMetaSave().legacyShards}）</button>`}
      <button class="btn gold" id="restartGo" type="button" style="padding:9px 18px;font-size:14px">${settle?.practice ? '返回开始页' : '🔁 快速重开'}</button>
    </div>
  `);
    box.querySelector('#endRetrySaveBtn')?.addEventListener('click', () => retryPendingMetaSave());
    box.querySelector('#endExportBackupBtn')?.addEventListener('click', () => {
      const json = exportMetaSave();
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(json).then(() => toast('💾 备份存档 JSON 已复制到剪贴板！')).catch(() => toast('💾 备份存档已就绪（可通过 BG60.exportMetaSave() 获取）'));
      } else {
        toast('💾 备份存档已就绪（可通过 BG60.exportMetaSave() 获取）');
      }
    });
    box.querySelector('#endMetaBtn')?.addEventListener('click', () => deps.metaModal.openMetaLegacyModal({ context: 'settlement', returnTo: 'end' }));
    box.querySelector('#restartGo')?.addEventListener('click', () => {
      if (!settle?.practice) return startNewRun();
      startNewRun(undefined, false, { preRunSetup: true });
      showIntroModal();
      runtimeCtx.game.pendingModals.push({ type: 'starter' });
    });
    getEl('modalBackdrop').hidden = false;
  }

  return { showIntroModal, showEndModal };
}
