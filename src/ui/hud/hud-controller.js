import { setIconText } from '../shared/icons.js';
import { clamp } from '../../core/math.js';
import { MAIN_WAVES, W20_DIRECTIONS } from '../../data/index.js';

export function createHudController(runtimeCtx, deps) {
  const { getEl: $, getViewportWidth = () => window.innerWidth, audio, perfStats, progression, run, unlock } = deps;
  let lastSynKey = '';
  let compactHudMode = null;
  let lastGold = null;
  let lastSeal = '';
  let lastShield = 0;
  let lastHp = 1;
  let lastGame = null;
  let prevDashCooling = false;
  let prevUltCooling = false;
  let maxDashCdSeen = 3.0;
  let maxUltCdSeen = 18.0;

  function syncOffsets(){
    const topEl = $('topbar');
    const topH = topEl?.getBoundingClientRect?.().height || 56;
    document.documentElement.style.setProperty('--top-h', `${Math.ceil(topH) + 14}px`);
    const subB = $('subbar')?.getBoundingClientRect?.().bottom || topH;
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
    const isWave = game.phase === 'wave' || game.phase === 'harvest';
    const fresh = lastGame !== game;
    lastGame = game;

    if (document.body?.dataset) {
      document.body.dataset.phase = isWave ? (game.phase === 'harvest' ? 'harvest' : 'wave') : 'prep';
      const leftHudEl = $('leftHud');
      const leftToggleBtn = $('leftHudToggle');
      if (leftHudEl && leftToggleBtn) {
        const effectivelyCollapsed = isWave
          ? !leftHudEl.classList.contains('wave-expanded')
          : leftHudEl.classList.contains('collapsed');
        const nextToggleText = effectivelyCollapsed ? '展开 [Tab]' : '折叠 [Tab]';
        if (leftToggleBtn.textContent !== nextToggleText) leftToggleBtn.textContent = nextToggleText;
      }
    }

    const overlay = $('uiPanelBackdrop');
    if (overlay && !overlay.hidden && overlay.dataset?.phase && (overlay.dataset.phase !== game.phase || overlay.dataset.wave !== String(game.wave) || game.activeModal)) {
      overlay.dispatchEvent(new Event('bg-close-panel'));
    }
    const panelTimer = $('uiPanelTimer');
    if (panelTimer) {
      panelTimer.hidden = !(game.finalPrep?.active && game.finalPrep?.started);
      if (!panelTimer.hidden) setIconText(panelTimer, `⏳ 终局整备 ${Math.ceil(game.finalPrep.timer)}s`);
    }
    const meta = getWavePhaseMeta(game.wave);

    const wp = $('wavePill');
    const pTxt = game.phase === 'harvest'
      ? '收菜中'
      : game.phase === 'wave'
        ? (game.wave === MAIN_WAVES && game.w30Battle?.active ? `决战 ${Math.floor(game.w30Battle.elapsedSeconds || 0)}s` : '激战')
        : (game.finalPrep?.active
          ? (game.finalPrep.awaitingWaveRewards ? '结清奖励' : `整备 ${Math.ceil(game.finalPrep.timer)}s`)
          : '备战');
    wp.textContent = `W${game.wave}/${MAIN_WAVES} · ${pTxt}`;
    wp.title = meta.tag;
    wp.className = 'pill ' + (isWave ? 'wave-live' : 'wave-prep');

    const goldTxt = `🪙 ${game.gold}`;
    if (fresh || lastGold !== game.gold) {
      lastGold = game.gold;
      const coin = $('goldPill');
      setIconText(coin, goldTxt);
      coin.classList.remove('gold-bump'); void coin.offsetWidth; coin.classList.add('gold-bump');
    }
    const matEl = $('matPill');
    if (matEl) {
      setIconText(matEl, `⚙️ ${game.materials || 0}`);
    }
    const tokEl = $('tokenPill');
    if (tokEl) {
      const tokCnt = game.transferTokens || 0;
      tokEl.hidden = tokCnt <= 0;
      setIconText(tokEl, `🔮 ${tokCnt}`);
    }
    const shardEl = $('shardPill');
    if (shardEl) {
      setIconText(shardEl, `💠 ${getMetaSave().legacyShards || 0}`);
    }

    const hpPill = $('heroHpPill');
    const hpRatio = clamp(h.hp / Math.max(1, h.maxHp), 0, 1);
    setIconText(hpPill, `❤️ ${Math.ceil(h.hp)}/${h.maxHp}`);
    hpPill.className = 'pill ' + (hpRatio < 0.35 ? 'warn' : 'hp');
    const hpFill = $('heroHpFill');
    if (hpFill?.style) {
      hpFill.style.width = `${hpRatio * 100}%`;
      hpFill.classList?.toggle('low', hpRatio < 0.35);
    }
    const hpTrail = $('heroHpTrail');
    if (hpTrail?.style && (fresh || Math.abs(lastHp - hpRatio) > 0.0001)) {
      hpTrail.style.transition = fresh || hpRatio >= lastHp ? 'none' : '';
      hpTrail.style.width = `${hpRatio * 100}%`;
    }
    lastHp = hpRatio;
    $('hpVignette')?.classList.toggle('danger', game.phase === 'wave' && h.hp > 0 && hpRatio < 0.35);

    const rp = $('heroPill');
    if (game.pendingBreakthrough === 'w10' && !h.breakthroughs.w10) {
      rp.className = 'hero-vitals-btn trib-ready';
      setIconText($('heroLvTxt'), `⚡ 待选 W10 大突破`);
      $('xpFill').style.width = `100%`;
    } else if (game.pendingBreakthrough === 'w20' && game.w20Draft) {
      rp.className = 'hero-vitals-btn trib-ready';
      setIconText($('heroLvTxt'), `⚡ 待选 W20 强化`);
      $('xpFill').style.width = `100%`;
    } else {
      rp.className = 'hero-vitals-btn';
      $('heroLvTxt').textContent = `${getRealmStageLabel()} Lv.${h.lv}`;
      $('xpFill').style.width = `${clamp((h.xp / Math.max(1, h.xpNext)) * 100, 0, 100)}%`;
    }

    const w20Btn = $('w20PrepBtn');
    if (w20Btn) {
      const showPre = isW20PreselectOpen();
      const showDraft = game.pendingBreakthrough === 'w20' && !!game.w20Draft;
      w20Btn.hidden = !(showPre || showDraft);
      if (showDraft) {
        setIconText(w20Btn, `⚡ W20强化 (⚙️${game.materials || 0})`);
      } else if (showPre) {
        const preSpec = game.w20State?.preselectedDirection ? W20_DIRECTIONS[game.w20State.preselectedDirection] : null;
        setIconText(w20Btn, preSpec ? `⚡ W20：${preSpec.icon}${preSpec.name}` : '⚡ W20 方向预选');
      }
    }

    const destinyBtn = $('destinyBtn');
    if (destinyBtn) {
      const pendingOffer = getPendingDestinyOffer();
      destinyBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
      const badge = $('fateCount');
      if (badge) { badge.hidden = !pendingOffer; badge.textContent = '1'; }
      destinyBtn.title = pendingOffer ? '天命赌局 · 有一组奖励待领' : '天命赌局 · 备战时可购买盲盒';
      destinyBtn.classList.toggle('active', !!pendingOffer);
    }
    const transferBtn = $('transferBtn');
    if (transferBtn) {
      const tokCnt = game.transferTokens || 0;
      transferBtn.disabled = isWave || ['won', 'lost'].includes(game.phase);
      const badge = $('transferCount');
      if (badge) { badge.textContent = String(tokCnt); badge.hidden = !tokCnt; }
    }
    const metaBtn = $('metaLegacyBtn');
    if (metaBtn) {
      const mainSpec = getActiveMetaMain();
      const budget = getMetaLoadoutBudget(getActiveMetaLoadout());
      const shards = getMetaSave().legacyShards || 0;
      setIconText(metaBtn, `💠 ${mainSpec ? mainSpec.icon + mainSpec.name.replace('传承', '') : '传承'}`);
      metaBtn.title = `局外传承（${isMetaLoadoutLocked() ? '本局已锁定只读' : '开局前可调整'}）\n主传承：${mainSpec ? mainSpec.name : '默认'} · 辅助 ${budget.auxPoints}/4 点\n持有传承碎片：${shards}`;
    }

    // Contextual Top-Center Wave & Boss Banner
    const aliveEnemies = (game.enemies || []).filter(e => e.hp > 0);
    const rem = game.enemies.length + game.waveQueue.filter(w => !w.spawned).length;
    const boss = aliveEnemies.find(e => String(e.kind || '').startsWith('boss'));
    const shieldPill = $('heroShield');
    if (shieldPill) {
      shieldPill.hidden = !(h.shield > 0);
      setIconText(shieldPill, `🛡️ ${Math.ceil(h.shield || 0)}`);
      if (!fresh && h.shield > lastShield) {
        shieldPill.classList.remove('shield-gain');
        void shieldPill.offsetWidth;
        shieldPill.classList.add('shield-gain');
      }
    }
    lastShield = h.shield || 0;
    const clock = $('finalPrepClock');
    if (clock) {
      const prep = game.finalPrep;
      clock.hidden = !prep?.active || !prep.started;
      if (!clock.hidden) {
        clock.textContent = `最终整备 · ${Math.ceil(prep.timer)} 秒`;
        clock.classList.toggle('urgent', prep.timer <= 20);
      }
    }
    const quality = deps.battleVfx;
    if (quality) {
      const qualityLabel = { high: '精致', low: '轻量', off: '精简' };
      const label = quality.mode === 'auto' ? `自动·${qualityLabel[quality.quality]}` : qualityLabel[quality.quality];
      const fxButton = $('fxQualityBtn');
      if (fxButton && fxButton.textContent !== label) fxButton.textContent = label;
      if (document.body?.dataset) document.body.dataset.fx = quality.quality;
    }
    const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}` : '';
    const sealPill = $('heroSealPill');
    if (sealPill && (fresh || sealSig !== lastSeal)) {
      sealPill.hidden = !game.seal;
      setIconText(sealPill, `✨ ${game.seal?.star || 0}星`);
      if (!fresh && sealSig) {
        sealPill.classList.remove('shield-gain');
        void sealPill.offsetWidth;
        sealPill.classList.add('shield-gain');
      }
    }
    lastSeal = sealSig;
    const bossBanner = $('waveBossBanner');
    if (bossBanner) {
      bossBanner.hidden = game.phase !== 'wave';
      if (!bossBanner.hidden) {
        const titleEl = $('waveBossTitle');
        const trackEl = $('waveBossTrack');
        const fillEl = $('waveBossFill');
        if (boss) {
          const pct = clamp((boss.hp / Math.max(1, boss.maxHp)) * 100, 0, 100);
          if (titleEl) titleEl.textContent = `${boss.name || '首领'} · ${boss.signatureLockActive ? '锁血 · 进入安全区' : boss.finalPhaseEntered ? '末段 · ' : ''}${Math.ceil(pct)}%`;
          if (trackEl) trackEl.hidden = false;
          if (fillEl?.style) fillEl.style.width = `${pct}%`;
        } else {
          if (titleEl) setIconText(titleEl, game.wave % 5 === 0 ? '⚠️ 首领波激战中' : `⚔️ 第 ${game.wave} 波敌潮`);
          if (trackEl) trackEl.hidden = true;
        }
      }
    }
    $('enemyPill').hidden = game.phase !== 'wave';
    if (game.phase === 'wave') setIconText($('enemyPill'), `👾 剩余 ${rem}`);
    $('fpsPill').textContent = `${perfStats.fps} FPS`;

    $('speedBtn').textContent = `${game.speed}×`;
    $('speedBtn').classList.toggle('active', game.speed === 2);
    $('pauseBtn').textContent = runtimeCtx.paused ? '继续' : '暂停';
    const soundButton = $('soundBtn');
    setIconText(soundButton, audio.enabled ? '🔊' : '🔇');
    soundButton.setAttribute?.('aria-pressed', String(audio.enabled));
    setIconText($('heroPanelBtn'), '👑 角色详情 [C]');
    $('heroPanelBtn').classList.toggle('active', game.inspTarget?.type === 'hero');
    const autoPaused = game.autoWave && game.phase === 'prep' && hasPendingDecision();
    $('autoWaveBtn').textContent = `自动下波：${game.autoWave ? (autoPaused ? '待选' : '开') : '关'}`;
    $('autoWaveBtn').classList.toggle('active', game.autoWave);

    const comboCnt = Object.keys(h.combos).length;
    const btCnt = (h.breakthroughs.w10 ? 1 : 0) + (h.breakthroughs.w20 ? 1 : 0);
    const w10Tag = h.breakthroughs.w10 ? ` · W10:${h.breakthroughs.w10.branchName}` : '';
    const w20Tag = h.breakthroughs.w20?.directionName ? ` · W20:${h.breakthroughs.w20.directionName}` : '';
    setIconText($('metaBadge'), `✨ 突破 ${btCnt}/2${w10Tag}${w20Tag} · 组合 ${comboCnt}/4`);

    // Clock-sweep Cooldown Visualization + Ready Flash (patterns.md Cooldown Indicator Design)
    const dc = $('dashCd');
    if (h.dashCd > 0) {
      maxDashCdSeen = Math.max(maxDashCdSeen, h.dashCd);
      const deg = clamp(h.dashCd / Math.max(0.1, maxDashCdSeen), 0, 1) * 360;
      dc.hidden = false;
      dc.textContent = `${h.dashCd.toFixed(1)}s`;
      if (dc.style) dc.style.background = `conic-gradient(rgba(6,12,16,0.84) ${deg}deg, rgba(6,12,16,0.22) 0deg)`;
      prevDashCooling = true;
    } else {
      dc.hidden = true;
      if (prevDashCooling) {
        prevDashCooling = false;
        const db = $('dashBtn');
        db?.classList?.remove('ready-flash');
        void db?.offsetWidth;
        db?.classList?.add('ready-flash');
      }
    }

    const uc = $('ultCd');
    if (h.ultTimer > 0) {
      uc.hidden = false;
      setIconText(uc, `🔥${h.ultTimer.toFixed(1)}s`);
      if (uc.style) uc.style.background = 'rgba(130, 56, 210, 0.52)';
      prevUltCooling = true;
    } else if (h.ultCd > 0) {
      maxUltCdSeen = Math.max(maxUltCdSeen, h.ultCd);
      const deg = clamp(h.ultCd / Math.max(0.1, maxUltCdSeen), 0, 1) * 360;
      uc.hidden = false;
      uc.textContent = `${h.ultCd.toFixed(1)}s`;
      if (uc.style) uc.style.background = `conic-gradient(rgba(6,12,16,0.84) ${deg}deg, rgba(6,12,16,0.22) 0deg)`;
      prevUltCooling = true;
    } else {
      uc.hidden = true;
      if (prevUltCooling) {
        prevUltCooling = false;
        const ub = $('ultBtn');
        ub?.classList?.remove('ready-flash');
        void ub?.offsetWidth;
        ub?.classList?.add('ready-flash');
      }
    }

    const wb = $('waveBtn');
    wb.disabled = isWave || ['won', 'lost'].includes(game.phase);
    if (game.phase === 'harvest') {
      $('waveBtnNm').textContent = '收菜中…';
      $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
    } else if (isWave) {
      $('waveBtnNm').textContent = `第 ${game.wave} 波激战`;
      $('waveBtnSb').textContent = `剩余 ${rem} 敌`;
    } else if (game.finalPrep?.active) {
      $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
      setIconText($('waveBtnSb'), game.finalPrep.awaitingWaveRewards
        ? '📦 先结清波末奖励'
        : `⏳ 终局整备 ${Math.ceil(game.finalPrep.timer)}s`);
    } else {
      $('waveBtnNm').textContent = `开始第 ${game.wave} 波`;
      setIconText($('waveBtnSb'), game.pendingBreakthrough
        ? '⚡ 请先完成突破'
        : (game.chests.length ? `📦 地面${game.chests.length}箱` : game.wave % 5 === 0 ? '⚠️ 首领波' : `${meta.tag}`));
    }

    const freeMetaRefreshReady = hasMetaAux('aux_shop_first_refresh') && game.metaRunState && !game.metaRunState.freeRefreshUsedThisWave;
    $('rerollBtn').disabled = !freeMetaRefreshReady && game.gold < game.rerollCost;
    $('rerollCost').textContent = freeMetaRefreshReady ? '免费' : `${game.rerollCost} 金`;

    deps.dockUI.renderSealStrip(force);
    deps.dockUI.renderSkillStrip(force);
    deps.battleHud.renderBattleHud(force);
    deps.buildHud.renderLeftHud(force);
    deps.dockUI.renderShop(force);
    deps.dockUI.renderBag(force);
    deps.prepBuild?.renderPrepBuild();
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
    const isWavePhase = typeof document !== 'undefined' && (document.body?.dataset?.phase === 'wave' || document.body?.dataset?.phase === 'harvest');
    if (isWavePhase) {
      const expanded = hud.classList.toggle('wave-expanded');
      hud.classList.toggle('collapsed', !expanded);
      const btn = $('leftHudToggle');
      if (btn) btn.textContent = expanded ? '折叠 [Tab]' : '展开 [Tab]';
      return;
    }
    const col = hud.classList.toggle('collapsed');
    const btn = $('leftHudToggle');
    if (btn) btn.textContent = col ? '展开 [Tab]' : '折叠 [Tab]';
  }

  function resetDirtyKeys() {
    const overlay = $('uiPanelBackdrop');
    if (overlay && !overlay.hidden && overlay.dataset?.phase) overlay.dispatchEvent(new Event('bg-close-panel'));
    lastSynKey = '';
    prevDashCooling = false;
    prevUltCooling = false;
    lastGame = null;
    const receipt = $('purchaseFeedback');
    if (receipt) receipt.hidden = true;
    deps.battleHud.resetDirty();
    deps.buildHud.resetDirty();
    deps.dockUI.resetDirty();
    deps.inspectorUI.resetDirty();
  }

  return { syncOffsets, renderAllUI, syncHudResponsiveMode, toggleBattleHud, toggleLeftHud, resetDirtyKeys };
}
