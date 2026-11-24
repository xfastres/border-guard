import { clamp } from '../../core/math.js';
import { HERO_GEAR_SLOTS, MAIN_WAVES, W20_DIRECTIONS } from '../../data/index.js';

export function createHudController(runtimeCtx, deps) {
  const { getEl: $, getViewportWidth = () => window.innerWidth, audio, perfStats, progression, run, unlock } = deps;
  // The legacy reset includes this reserved key even though no panel reads it.
  let lastSynKey = '';
  let compactHudMode = null;

  function syncOffsets(){
    const topH = $('topbar').getBoundingClientRect().height || 52;
    document.documentElement.style.setProperty('--top-h', `${Math.ceil(topH)}px`);
    const subB = $('subbar').getBoundingClientRect().bottom || topH;
    document.documentElement.style.setProperty('--sub-bottom', `${Math.ceil(subB)}px`);
  }

  function renderAllUI(force = false){
    const game = runtimeCtx.game;
    if (!game) return;
    const { getWavePhaseMeta } = run;
    const { getMetaSave, getActiveMetaMain, getMetaLoadoutBudget, getActiveMetaLoadout, isMetaLoadoutLocked, hasMetaAux } = deps.meta;
    const { isW20PreselectOpen, getPendingDestinyOffer } = progression;
    const { getRealmStageLabel, hasPendingDecision } = unlock;
    const h = game.hero;
    const overlay = $('uiPanelBackdrop');
    if (overlay && !overlay.hidden && overlay.dataset?.phase && (overlay.dataset.phase !== game.phase || overlay.dataset.wave !== String(game.wave) || game.activeModal)) {
      overlay.dispatchEvent(new Event('bg-close-panel'));
    }
    const panelTimer = $('uiPanelTimer');
    if (panelTimer) {
      panelTimer.hidden = !(game.finalPrep?.active && game.finalPrep?.started);
      if (!panelTimer.hidden) panelTimer.textContent = `终局整备 ${Math.ceil(game.finalPrep.timer)}s`;
    }
    const isWave = game.phase === 'wave' || game.phase === 'harvest';
    const meta = getWavePhaseMeta(game.wave);

    const wp = $('wavePill');
    const pTxt = game.phase === 'harvest'
      ? '收菜中'
      : game.phase === 'wave'
        ? (game.wave === MAIN_WAVES && game.w30Battle?.active ? `决战 ${Math.floor(game.w30Battle.elapsedSeconds || 0)}s` : '激战中')
        : (game.finalPrep?.active
          ? (game.finalPrep.awaitingWaveRewards ? '波末奖励结清中' : `终局整备 ${Math.ceil(game.finalPrep.timer)}s`)
          : '备战');
    wp.textContent = `第 ${game.wave}/${MAIN_WAVES} 波 · ${pTxt}`;
    wp.title = meta.tag;
    wp.className = 'pill ' + (isWave ? 'wave-live' : 'wave-prep');

    const goldTxt = `💰 ${game.gold}`;
    if ($('goldPill').textContent !== goldTxt) {
      $('goldPill').textContent = goldTxt;
      $('dockGoldNum').textContent = game.gold;
      for (const el of [$('goldPill'), $('dockGoldNum')]) {
        el.classList.remove('gold-bump'); void el.offsetWidth; el.classList.add('gold-bump');
      }
    }
    const matEl = $('matPill');
    if (matEl) {
      matEl.textContent = `⚙️ ${game.materials || 0} 锻材`;
    }
    const tokEl = $('tokenPill');
    if (tokEl) {
      tokEl.textContent = `🔮 ${game.transferTokens || 0} 转印符`;
    }
    const shardEl = $('shardPill');
    if (shardEl) {
      shardEl.textContent = `💠 ${getMetaSave().legacyShards || 0} 碎片`;
    }

    const hpPill = $('heroHpPill');
    const hpRatio = h.hp / Math.max(1, h.maxHp);
    hpPill.textContent = `❤️ ${Math.ceil(h.hp)}/${h.maxHp}${h.shield > 0 ? ` (+${Math.ceil(h.shield)})` : ''}`;
    hpPill.className = 'pill ' + (hpRatio < 0.35 ? 'warn' : 'hp');
    $('hpVignette')?.classList.toggle('danger', game.phase === 'wave' && h.hp > 0 && hpRatio < 0.35);

    const rp = $('heroPill');
    if (game.pendingBreakthrough === 'w10' && !h.breakthroughs.w10) {
      rp.className = 'pill realm-btn trib-ready';
      $('heroLvTxt').textContent = `⚡ 待完成 W10 大型突破（点击打开）`;
      $('xpFill').style.width = `100%`;
    } else if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
      rp.className = 'pill realm-btn trib-ready';
      $('heroLvTxt').textContent = `⚡ 待选 W20 战后强化（点击打开）`;
      $('xpFill').style.width = `100%`;
    } else {
      rp.className = 'pill realm-btn';
      $('heroLvTxt').textContent = `${getRealmStageLabel()} Lv.${h.lv}`;
      $('xpFill').style.width = `${clamp((h.xp / Math.max(1, h.xpNext)) * 100, 0, 100)}%`;
    }

    const w20Btn = $('w20PrepBtn');
    if (w20Btn) {
      const showPre = isW20PreselectOpen();
      const showDraft = game.pendingBreakthrough === 'w20' && !!game.w20Draft;
      w20Btn.hidden = !(showPre || showDraft);
      if (showDraft) {
        w20Btn.textContent = `⚡ 选 W20 强化（⚙️${game.materials || 0}）`;
      } else if (showPre) {
        const preSpec = game.w20State?.preselectedDirection ? W20_DIRECTIONS[game.w20State.preselectedDirection] : null;
        w20Btn.textContent = preSpec ? `⚡ W20预选：${preSpec.icon}${preSpec.name}` : '⚡ W20 方向预选';
      }
    }

    const destinyBtn = $('destinyBtn');
    if (destinyBtn) {
      const pendingOffer = getPendingDestinyOffer();
      const notice = $('toolsNotice');
      if (notice) notice.hidden = !pendingOffer;
      destinyBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
      destinyBtn.textContent = pendingOffer ? '🎲 天命待领 (3选1)!' : '🎲 天命赌局';
      destinyBtn.classList.toggle('active', !!pendingOffer);
    }
    const transferBtn = $('transferBtn');
    if (transferBtn) {
      transferBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
      transferBtn.textContent = `✨ 词条转移台 (🔮${game.transferTokens || 0})`;
    }
    const metaBtn = $('metaLegacyBtn');
    if (metaBtn) {
      const mainSpec = getActiveMetaMain();
      const budget = getMetaLoadoutBudget(getActiveMetaLoadout());
      metaBtn.textContent = `${isMetaLoadoutLocked() ? '🔒' : '⚙️'} ${mainSpec ? mainSpec.icon + mainSpec.name : '传承'} (${budget.auxPoints}/4)`;
    }

    const rem = game.enemies.length + game.waveQueue.filter(w => !w.spawned).length;
    $('enemyPill').hidden = game.phase !== 'wave';
    if (game.phase === 'wave') $('enemyPill').textContent = `👾 剩余 ${rem}`;
    $('fpsPill').textContent = `${perfStats.fps} FPS`;

    $('speedBtn').textContent = `${game.speed}×`;
    $('speedBtn').classList.toggle('active', game.speed === 2);
    $('pauseBtn').textContent = runtimeCtx.paused ? '继续' : '暂停';
    $('soundBtn').textContent = audio.enabled ? '🔊' : '🔇';
    $('heroPanelBtn').textContent = `👑 属性/体检 (${h.gear.length}/${HERO_GEAR_SLOTS}) [C]`;
    $('heroPanelBtn').classList.toggle('active', game.inspTarget?.type === 'hero');
    const autoPaused = game.autoWave && game.phase === 'prep' && hasPendingDecision();
    $('autoWaveBtn').textContent = `自动下波：${game.autoWave ? (autoPaused ? '暂停(待选)' : '开') : '关'}`;
    $('autoWaveBtn').classList.toggle('active', game.autoWave);

    const comboCnt = Object.keys(h.combos).length;
    const btCnt = (h.breakthroughs.w10 ? 1 : 0) + (h.breakthroughs.w20 ? 1 : 0);
    const w10Tag = h.breakthroughs.w10 ? ` · W10:${h.breakthroughs.w10.branchName}` : '';
    const w20Tag = h.breakthroughs.w20?.directionName ? ` · W20:${h.breakthroughs.w20.directionName}` : '';
    $('metaBadge').textContent = `✨ 突破 ${btCnt}/2${w10Tag}${w20Tag} · 组合 ${comboCnt}/4`;

    const dc = $('dashCd');
    if (h.dashCd > 0) { dc.hidden = false; dc.textContent = `${h.dashCd.toFixed(1)}s`; } else dc.hidden = true;
    const uc = $('ultCd');
    if (h.ultTimer > 0) { uc.hidden = false; uc.textContent = `🔥${h.ultTimer.toFixed(1)}s`; }
    else if (h.ultCd > 0) { uc.hidden = false; uc.textContent = `${h.ultCd.toFixed(1)}s`; }
    else uc.hidden = true;

    const wb = $('waveBtn');
    wb.disabled = isWave || ['won','lost'].includes(game.phase);
    if (game.phase === 'harvest') {
      $('waveBtnNm').textContent = '收菜中…';
      $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
    } else if (isWave) {
      $('waveBtnNm').textContent = `第 ${game.wave} 波激战`;
      $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
    } else if (game.finalPrep?.active) {
      $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
      $('waveBtnSb').textContent = game.finalPrep.awaitingWaveRewards
        ? '📦 先结清波末奖励'
        : `⏳ 终局整备 ${Math.ceil(game.finalPrep.timer)}s`;
    } else {
      $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
      $('waveBtnSb').textContent = game.pendingBreakthrough
        ? '⚡ 请先完成突破'
        : (game.chests.length ? `📦 地面${game.chests.length}箱` : game.wave % 5 === 0 ? '⚠️ 首领波' : `${meta.tag}`);
    }

    const freeMetaRefreshReady = hasMetaAux('aux_shop_first_refresh') && game.metaRunState && !game.metaRunState.freeRefreshUsedThisWave;
    $('rerollBtn').disabled = !freeMetaRefreshReady && game.gold < game.rerollCost;
    $('rerollCost').textContent = freeMetaRefreshReady ? '免费(商路先机)' : `${game.rerollCost} 金币`;

    deps.dockUI.renderSealStrip(force);
    deps.dockUI.renderSkillStrip(force);
    deps.battleHud.renderBattleHud(force);
    deps.buildHud.renderLeftHud(force);
    deps.dockUI.renderShop(force);
    deps.dockUI.renderBag(force);
    deps.inspectorUI.renderInspector(force);
    syncOffsets();
  }

  function syncHudResponsiveMode(){
    const compact = (getViewportWidth() || 1280) <= 980;
    if (compactHudMode === compact) return;
    compactHudMode = compact;
    const build = $('leftHud'), battle = $('battleHud');
    if (build) build.classList.toggle('collapsed', compact);
    if (battle) battle.classList.toggle('collapsed', compact);
    $('progressHud')?.classList.toggle('collapsed', compact);
    const progressBtn = $('progressToggle');
    if (progressBtn) progressBtn.textContent = compact ? '展开' : '折叠';
    const buildBtn = $('leftHudToggle'), battleBtn = $('battleHudToggle');
    if (buildBtn) buildBtn.textContent = compact ? '展开 [Tab]' : '折叠 [Tab]';
    if (battleBtn) battleBtn.textContent = compact ? '展开' : '折叠';
  }

  function toggleBattleHud(){
    const hud = $('battleHud');
    if (!hud) return;
    if (compactHudMode) $('leftHud')?.classList.add('collapsed');
    const col = hud.classList.toggle('collapsed');
    const btn = $('battleHudToggle');
    if (btn) btn.textContent = col ? '展开' : '折叠';
  }

  function toggleLeftHud(){
    const hud = $('leftHud');
    if (!hud) return;
    if (compactHudMode) $('battleHud')?.classList.add('collapsed');
    const col = hud.classList.toggle('collapsed');
    const btn = $('leftHudToggle');
    if (btn) btn.textContent = col ? '展开 [Tab]' : '折叠 [Tab]';
  }

  function resetDirtyKeys() {
    const overlay = $('uiPanelBackdrop');
    if (overlay && !overlay.hidden && overlay.dataset?.phase) overlay.dispatchEvent(new Event('bg-close-panel'));
    lastSynKey = '';
    deps.battleHud.resetDirty();
    deps.buildHud.resetDirty();
    deps.dockUI.resetDirty();
    deps.inspectorUI.resetDirty();
  }

  return { syncOffsets, renderAllUI, syncHudResponsiveMode, toggleBattleHud, toggleLeftHud, resetDirtyKeys };
}
