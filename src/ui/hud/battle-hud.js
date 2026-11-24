import { clamp } from '../../core/math.js';
import { MAIN_WAVES } from '../../data/index.js';

export function createBattleHud(runtimeCtx, deps) {
  const { getEl: $ } = deps;
  const { getWavePhaseMeta, getWaveEncounterInfo, getEndgameOmenState } = deps.run;
  const { getW20BossIntel, getW30BossIntel } = deps.progression;
  const { getRealmStageLabel } = deps.unlock;
  let lastBattleHudKey = '';

  function renderBattleHud(force){
    const body = $('battleHudBody');
    const game = runtimeCtx.game;
    if (!body || !game) return;
    const h = game.hero;
    const alive = game.enemies.filter(e => e.hp > 0);
    const queued = game.waveQueue.filter(w => !w.spawned).length;
    const remaining = alive.length + queued;
    const bosses = alive.filter(e => String(e.kind || '').indexOf('boss') === 0).length;
    const elites = alive.filter(e => e.kind === 'elite').length;
    const hpPct = clamp((h.hp / Math.max(1, h.maxHp)) * 100, 0, 100);
    const shieldPct = clamp((h.shield / Math.max(1, h.maxHp)) * 100, 0, 100);
    const meta = getWavePhaseMeta(game.wave);
    const phaseLabels = {
      prep: game.finalPrep?.active
        ? (game.finalPrep.awaitingWaveRewards ? '波末奖励结清中' : `终局整备 (${Math.ceil(game.finalPrep.timer)}s)`)
        : '备战中',
      wave: (game.wave === MAIN_WAVES && game.w30Battle?.active) ? `终局决战 (${Math.floor(game.w30Battle.elapsedSeconds || 0)}s)` : '激战中',
      harvest: '战利品结算',
      won: '已通关',
      lost: '已陨落'
    };
    const phaseLabel = phaseLabels[game.phase] || game.phase;
    const phaseClass = game.phase === 'wave' ? 'live' : (game.phase === 'won' ? 'done' : '');
    const threatText = bosses > 0
      ? '👑 首领正在场上 · ' + bosses + ' 只'
      : elites > 0
        ? '🟣 精英正在场上 · ' + elites + ' 只'
        : game.phase === 'wave' && game.wave % 5 === 0
          ? '⚠️ 首领波进行中 · 首领尚未入场'
          : game.phase === 'wave'
            ? '普通敌潮 · ' + alive.length + ' 只在场'
            : (game.wave % 5 === 0 ? '⚠️ 下一场是首领波' : '暂未发现高危单位');
    const threatClass = bosses > 0 ? 'danger' : (elites > 0 ? 'elite' : '');

    // Stage 3 & Stage 5 Wave Intel / Encounter Info (NO pre-wave spoilers for W25-W28 regular enemies!)
    const w20Intel = (game.wave === 19 || game.wave === 20) ? getW20BossIntel() : null;
    const w30Intel = (game.wave >= 29 || game.finalPrep?.active) ? getW30BossIntel() : null;
    const w30Battle = game.wave === MAIN_WAVES ? game.w30Battle : null;
    const encInfo = getWaveEncounterInfo(game.wave);
    const omen = getEndgameOmenState();

    const key = [
      game.wave, game.phase, game.finalPrep?.active ? `${game.finalPrep.awaitingWaveRewards?1:0}:${Math.ceil(game.finalPrep.timer)}` : 0,
      remaining, alive.length, queued, bosses, elites,
      Math.ceil(h.hp), h.maxHp, Math.ceil(h.shield), game.stats.kills,
      game.stats.elites, Math.floor(game.stats.dmgTotal / 50),
      w20Intel?.revealed ? w20Intel.auxKey : '',
      w30Intel?.revealed ? w30Intel.auxKey : '',
      w30Battle ? `${w30Battle.phase}:${Math.floor(w30Battle.elapsedSeconds || 0)}:${w30Battle.signatureLockActive ? 1 : 0}` : '',
      encInfo ? `${encInfo.type}:${encInfo.revealed}:${encInfo.id || encInfo.themeKey || ''}` : '',
      omen.triggered ? `${omen.midWaveTriggered}:${omen.clearTriggered}` : ''
    ].join('|');
    if (!force && key === lastBattleHudKey) return;
    lastBattleHudKey = key;

    let stage3IntelHtml = '';
    if (w20Intel?.revealed) {
      stage3IntelHtml +=
        '<div class="lh-sec"><div class="lh-sec-t"><span>🔎 W20 首领情报</span><span>天劫魔尊</span></div>' +
          '<div class="bh-meta-line" style="color:#ffdce6"><b>核心：</b>' + w20Intel.coreName + '</div>' +
          '<div class="bh-meta-line" style="color:#ff9ec4"><b>辅助：</b>' + w20Intel.auxName + '</div>' +
          '<div class="bh-meta-line">' + w20Intel.auxDesc + '</div>' +
        '</div>';
    }
    if (w30Intel?.revealed) {
      const w30PhaseLabelMap = {
        opening: '开场交锋 (100%→80%)',
        signature_telegraph: '🛡️ 招牌锁血预警 (0扣血)',
        signature_shockwave: '🛡️ 招牌锁血冲击波 (0扣血)',
        mid_skirmish: '中段周旋 (80%→35%)',
        final_combo: '🔥 末段组合 (35%→0%)',
        ended: '已结束'
      };
      const w30LiveLine = w30Battle
        ? '<div class="bh-meta-line" style="color:#ffe28a"><b>阶段：</b>' + (w30PhaseLabelMap[w30Battle.phase] || w30Battle.phase) + ' · <b>' + Number(w30Battle.elapsedSeconds || 0).toFixed(1) + 's</b></div>'
        : '';
      stage3IntelHtml +=
        '<div class="lh-sec"><div class="lh-sec-t"><span>👑 W30 深渊主宰情报</span><span>' + (game.finalPrep?.active ? (game.finalPrep.awaitingWaveRewards ? '结清波末奖励' : `整备 ${Math.ceil(game.finalPrep.timer)}s`) : '已揭晓') + '</span></div>' +
          '<div class="bh-meta-line" style="color:#ffdce6"><b>固定核心：</b>' + w30Intel.coreName + '</div>' +
          '<div class="bh-meta-line" style="color:#ff9ec4"><b>本局辅助：</b>' + w30Intel.auxName + '</div>' +
          '<div class="bh-meta-line">' + w30Intel.auxDesc + '</div>' +
          w30LiveLine +
        '</div>';
    }
    if (encInfo && encInfo.type === 'w22_24_shared_threat') {
      stage3IntelHtml +=
        '<div class="lh-sec"><div class="lh-sec-t"><span>🔥 W22–W24 同源威胁</span><span>强度 ' + encInfo.pressureLevel + '/3</span></div>' +
          '<div class="bh-meta-line" style="color:#ffe48a"><b>主题：</b>' + encInfo.themeName + '</div>' +
          '<div class="bh-meta-line">' + encInfo.comboLabel + '</div>' +
        '</div>';
    } else if (encInfo && encInfo.type === 'w25_28_random') {
      stage3IntelHtml +=
        '<div class="lh-sec"><div class="lh-sec-t"><span>🎲 W25–W28 独立敌群</span><span>' + (encInfo.revealed ? '已揭晓' : '未揭晓') + '</span></div>' +
          '<div class="bh-meta-line">' + (encInfo.revealed ? ('本波敌群：<b>' + encInfo.name + '</b>') : '普通敌群组合将在开战后独立抽取揭晓（无战前剧透）') + '</div>' +
        '</div>';
    }
    if (omen.triggered && (game.wave === 28 || game.wave === 29)) {
      stage3IntelHtml += '<div class="omen-badge">🌑 <b>终局预兆：</b>深渊危机逼近，W29 战后开启 90s 最终整备迎战 W30！</div>';
    }

    body.innerHTML =
      '<div class="lh-sec">' +
        '<div class="bh-wave-row"><div><span class="bh-wave-kicker">当前战局</span><div class="bh-wave-name">第 ' + game.wave + ' / ' + MAIN_WAVES + ' 波</div></div>' +
        '<span class="bh-phase ' + phaseClass + '">' + phaseLabel + '</span></div>' +
        '<div class="bh-meta-line">' + meta.tag + ' · ' + getRealmStageLabel() + '</div>' +
        '<div class="bh-remain"><strong>' + remaining + '</strong><span>剩余敌人</span><small>场上 ' + alive.length + ' · 待刷新 ' + queued + '</small></div>' +
      '</div>' +
      stage3IntelHtml +
      '<div class="lh-sec"><div class="lh-sec-t"><span>❤️ 领主状态</span><span>' + (hpPct < 35 ? '危险' : '生命线') + '</span></div>' +
        '<div class="bh-vital-line"><span>生命值</span><b>' + Math.ceil(h.hp) + ' / ' + h.maxHp + '</b></div>' +
        '<div class="bh-track ' + (hpPct < 35 ? 'hp-low' : '') + '"><i style="width:' + hpPct + '%"></i></div>' +
        '<div class="bh-vital-meta">护盾 ' + Math.ceil(h.shield) + (h.shield > 0 ? ' · 吸收伤害' : ' · 暂无护盾') + '</div>' +
        (h.shield > 0 ? '<div class="bh-track"><i style="width:' + shieldPct + '%;background:linear-gradient(90deg,#58bfff,#b4e9ff)"></i></div>' : '') +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>🚨 威胁监测</span><span>' + (bosses + elites) + ' 高危单位</span></div>' +
        '<div class="bh-threat ' + threatClass + '">' + threatText + '</div>' +
        '<div class="bh-meta-line">敌潮剩余 ' + remaining + ' · 当前场上 ' + alive.length + '</div>' +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>📊 本局战绩</span><span>实时</span></div>' +
        '<div class="bh-metrics">' +
          '<div class="bh-metric"><b>' + game.stats.kills.toLocaleString() + '</b><small>累计击杀</small></div>' +
          '<div class="bh-metric"><b>' + game.stats.elites.toLocaleString() + '</b><small>精英击杀</small></div>' +
          '<div class="bh-metric"><b>' + Math.round(game.stats.dmgTotal).toLocaleString() + '</b><small>累计伤害</small></div>' +
        '</div>' +
      '</div>';
  }

  function resetDirty() {
    lastBattleHudKey = '';
  }

  return { renderBattleHud, resetDirty };
}
