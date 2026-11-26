import { withIcons, setIconText } from '../shared/icons.js';
import { getOwnedDestinyEnhancements } from '../../core/state-queries.js';
import { GEAR_AFFIXES } from '../../data/equipment-data.js';

export function createDestinyTransferModals(runtimeCtx, deps) {
  const { getEl } = deps;
  const { getBagCapacity, isBagSeal } = deps.economy;
  const { gearLabel, previewAffixTransfer, cancelAffixTransferPreview, commitAffixTransfer } = deps.equipment;
  const { toast } = deps.feedback;
  const { renderAffixChipsHtml } = deps.formatters;
  const {
    getDestinyConfig, getPendingDestinyOffer, claimDestinyReward, getDestinyBetBand, rollDestinyGamble,
  } = deps.progression;

  let _destinyBetInputVal = 120;
  let _transferUiState = { sourceUid: null, sourceSlot: 0, targetUid: null, targetSlot: 0 };

  function openDestinyGambleModal(){
    if (!runtimeCtx.game) return false;
    if (runtimeCtx.game.phase !== 'prep') {
      toast('战斗中不可开启天命赌局，请于备战期操作！', true);
      return false;
    }
    runtimeCtx.game.activeModal = { type: 'destiny_gamble' };
    renderDestinyGambleModal();
    return true;
  }

  function renderDestinyGambleModal(){
    const cfg = getDestinyConfig();
    const pending = getPendingDestinyOffer();
    const box = getEl('modalBox');
    const ownedExc = getOwnedDestinyEnhancements(runtimeCtx.game);
    const w29Note = runtimeCtx.game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备倒计时继续运行 (${Math.ceil(runtimeCtx.game.finalPrep.timer)}s)</span>` : '';

    if (pending) {
      box.innerHTML = withIcons(`
      <h2>🎲 天命赌局 · 开奖三选一（押注 💰${pending.bet}）</h2>
      <p class="lead">本次天命已开奖！请从以下 <strong>3 件随机候选</strong>中择一领取（<strong>单次结账、仅领一件</strong>，未领取前不可再次发起新押注）${w29Note}。</p>
      <div class="destiny-meta-row">
        <span class="destiny-chip gold">💰 余额 ${runtimeCtx.game.gold}</span>
        <span class="destiny-chip purple">🔮 转印符 ${runtimeCtx.game.transferTokens || 0}</span>
        <span class="destiny-chip">⚙️ 锻材 ${runtimeCtx.game.materials || 0}</span>
        <span class="destiny-chip">📦 背包 ${runtimeCtx.game.bag.length}/${getBagCapacity()}</span>
      </div>
      <div class="choices" id="modalChoices"></div>
    `);
      const grid = box.querySelector('#modalChoices');
      pending.choices.forEach((ch, idx) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'choice-card ' + (ch.rarity || 'common');
        card.dataset.choice = String(idx);
        const gearChips = ch.category === 'gear' && ch.gear ? `<div style="margin-top:3px">${renderAffixChipsHtml(ch.gear)}</div>` : '';
        const synBadge = ch.synNote ? `<span class="syn-badge hint">💡 ${ch.synNote}</span>` : '';
        card.innerHTML = withIcons(`
        <span class="tag">${ch.tag || ch.category}</span>
        <span class="ci">${ch.icon || '✨'}</span>
        <span class="cn">${ch.name}</span>
        <span class="cd">${ch.desc || ''}</span>
        ${gearChips}
        ${synBadge}
      `);
        card.addEventListener('click', () => claimDestinyReward(idx));
        grid.append(card);
      });
      getEl('modalBackdrop').hidden = false;
      return;
    }

    const curBet = Math.max(cfg.minBet, Math.min(Math.max(cfg.minBet, runtimeCtx.game.gold), Math.floor(Number(_destinyBetInputVal) || cfg.minBet)));
    const band = getDestinyBetBand(curBet);
    const t = cfg.preciousThresholds;
    const lastEmpty = runtimeCtx.game.destiny?.lastOutcome?.outcome === 'empty_tribulation';

    box.innerHTML = withIcons(`
    <h2>🎲 天命赌局 · 自由押注开奖</h2>
    <p class="lead">自由设定押注金币，确认后<strong>单次原子扣款并立即开奖</strong>（不可无痛撤回）。空劫概率 <strong>${Math.round(cfg.emptyTribulationChance * 100)}%</strong>（空劫押注归零）；中奖按<strong>灵印 / 构装 / 丹药 / 特殊强化各 25%</strong>生成 3 件候选三选一，纯按概率无稀有度保底${w29Note}。</p>
    <div class="destiny-meta-row">
      <span class="destiny-chip gold">💰 当前金币 ${runtimeCtx.game.gold}</span>
      <span class="destiny-chip purple">🔮 转印符 ${runtimeCtx.game.transferTokens || 0}</span>
      <span class="destiny-chip">⚙️ 锻材 ${runtimeCtx.game.materials || 0}</span>
      <span class="destiny-chip">最低押注 ${cfg.minBet}金</span>
      <span class="destiny-chip">珍贵门槛：稀有≥${t.rare} · 转印符≥${t.transferToken} · 史诗/天命专属≥${t.destinyExclusive} · 传说≥${t.legend}</span>
    </div>
    ${lastEmpty ? `<div class="destiny-empty-alert">🌩️ 上次押注 💰${runtimeCtx.game.destiny.lastOutcome.bet} 触发了<strong>天命空劫</strong>，押注已归零且无候选生成。</div>` : ''}
    <div class="destiny-bet-bar">
      <label style="font-size:12px;font-weight:800;color:#ffe484">押注金币：</label>
      <input type="number" class="destiny-bet-input" id="destinyBetInput" min="${cfg.minBet}" max="${Math.max(cfg.minBet, runtimeCtx.game.gold)}" step="10" value="${curBet}">
      <div id="destinyQuickBtns" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      <button class="btn gold" id="destinyRollBtn" type="button" ${runtimeCtx.game.gold < cfg.minBet ? 'disabled' : ''}>🎲 确认押注并开奖</button>
    </div>
    <div class="destiny-band-box" id="destinyBandPreview"></div>
    <div style="font-size:11.5px;color:#b8d6d0;margin-top:4px">
      <b>已持有天命专属强化 (${ownedExc.length})：</b>
      ${ownedExc.length ? ownedExc.map(e => `${e.icon}${e.name}`).join(' · ') : '尚未持有（押注 ≥' + t.destinyExclusive + ' 金有几率在特殊强化类抽出）'}
    </div>
    <div class="modal-footer">
      <button class="btn" id="destinyOpenTransferBtn" type="button">✨ 前往词条转移台 (🔮${runtimeCtx.game.transferTokens || 0})</button>
      <button class="btn" id="destinyCloseBtn" type="button">返回备战</button>
    </div>
  `);

    const updateBandPreview = val => {
      const bVal = Math.floor(Number(val) || 0);
      _destinyBetInputVal = bVal;
      const info = getDestinyBetBand(bVal);
      const pv = box.querySelector('#destinyBandPreview');
      const rollBtn = box.querySelector('#destinyRollBtn');
      const valid = bVal >= cfg.minBet && runtimeCtx.game.gold >= bVal;
      if (rollBtn) rollBtn.disabled = !valid;
      if (!pv) return;
      if (bVal < cfg.minBet) {
        pv.innerHTML = withIcons(`<span style="color:#ff9aa8">⚠️ 低于最低押注门槛（${cfg.minBet} 金），无法开奖。</span>`);
        return;
      }
      const unlocked = [
        '凡品池',
        info.allowRare ? '✅ 稀有池' : `🔒 稀有(需≥${t.rare}金)`,
        info.allowTransferToken ? '✅ 🔮天命转印符(特殊强化子池)' : `🔒 转印符(需≥${t.transferToken}金)`,
        info.allowDestinyExclusive ? '✅ 🌟史诗/天命专属强化' : `🔒 史诗/天命专属(需≥${t.destinyExclusive}金)`,
        info.allowLegend ? '✅ 👑传说珍贵池' : `🔒 传说池(需≥${t.legend}金)`
      ];
      pv.innerHTML = withIcons(`<b>押注 💰${bVal} 档位资格：</b>${unlocked.join(' · ')}<br><small style="opacity:0.85">四类顶层权重固定：灵印 25% / 构装 25% / 丹药 25% / 特殊强化 25%（无稀有度保底）</small>`);
    };

    const quickWrap = box.querySelector('#destinyQuickBtns');
    for (const p of cfg.betQuickPresets) {
      const qb = document.createElement('button');
      qb.type = 'button';
      qb.className = 'btn';
      qb.style.padding = '4px 8px';
      qb.style.fontSize = '11px';
      qb.textContent = `${p}金`;
      qb.disabled = runtimeCtx.game.gold < p;
      qb.addEventListener('click', () => {
        const inp = box.querySelector('#destinyBetInput');
        if (inp) inp.value = String(p);
        updateBandPreview(p);
      });
      quickWrap.append(qb);
    }
    const inp = box.querySelector('#destinyBetInput');
    inp?.addEventListener('input', () => updateBandPreview(inp.value));
    updateBandPreview(curBet);

    box.querySelector('#destinyRollBtn')?.addEventListener('click', () => {
      const v = Math.floor(Number(box.querySelector('#destinyBetInput')?.value || _destinyBetInputVal));
      rollDestinyGamble(v);
    });
    box.querySelector('#destinyOpenTransferBtn')?.addEventListener('click', () => openAffixTransferModal());
    box.querySelector('#destinyCloseBtn')?.addEventListener('click', () => deps.modalManager.closeModal());
    getEl('modalBackdrop').hidden = false;
  }

  function openAffixTransferModal(){
    if (!runtimeCtx.game) return false;
    if (runtimeCtx.game.phase !== 'prep') {
      toast('战斗中不可使用词条转移台，请于备战期操作！', true);
      return false;
    }
    runtimeCtx.game.activeModal = { type: 'affix_transfer' };
    renderAffixTransferModal();
    return true;
  }

  function renderAffixTransferModal(){
    const box = getEl('modalBox');
    const allGear = [
      ...runtimeCtx.game.hero.gear.map((g, idx) => ({ inst: g, location: 'equipped', idx, locTag: `已穿戴·槽${idx + 1}` })),
      ...runtimeCtx.game.bag.map((g, idx) => ({ inst: g, location: 'bag', idx, locTag: `背包#${idx + 1}` })).filter(x => !isBagSeal(x.inst))
    ];
    const w29Note = runtimeCtx.game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备倒计时继续运行 (${Math.ceil(runtimeCtx.game.finalPrep.timer)}s)</span>` : '';

    if (allGear.length < 2) {
      box.innerHTML = withIcons(`
      <h2>✨ 词条转移台</h2>
      <p class="lead">至少需要持有 <strong>2 件构装</strong>（已穿戴或背包合计）才可进行词条提取与转入${w29Note}。</p>
      <div class="destiny-meta-row">
        <span class="destiny-chip purple">🔮 天命转印符 ${runtimeCtx.game.transferTokens || 0}</span>
        <span class="destiny-chip gold">💰 金币 ${runtimeCtx.game.gold}</span>
      </div>
      <div class="modal-footer">
        <button class="btn gold" id="trGoDestiny" type="button">🎲 前往天命赌局</button>
        <button class="btn" id="trCancel" type="button">返回备战</button>
      </div>
    `);
      box.querySelector('#trGoDestiny')?.addEventListener('click', () => openDestinyGambleModal());
      box.querySelector('#trCancel')?.addEventListener('click', () => { cancelAffixTransferPreview(); deps.modalManager.closeModal(); });
      getEl('modalBackdrop').hidden = false;
      return;
    }

    // Ensure valid default selections
    if (!allGear.some(x => x.inst.uid === _transferUiState.sourceUid)) {
      const defSrc = allGear.find(x => (x.inst.affixes || []).some(Boolean)) || allGear[0];
      _transferUiState.sourceUid = defSrc.inst.uid;
      _transferUiState.sourceSlot = Math.max(0, (defSrc.inst.affixes || []).findIndex(Boolean));
    }
    if (!allGear.some(x => x.inst.uid === _transferUiState.targetUid) || _transferUiState.targetUid === _transferUiState.sourceUid) {
      const defTgt = allGear.find(x => x.inst.uid !== _transferUiState.sourceUid) || allGear[0];
      _transferUiState.targetUid = defTgt.inst.uid;
      const emptyIdx = (defTgt.inst.affixes || []).findIndex(a => !a);
      _transferUiState.targetSlot = emptyIdx >= 0 ? emptyIdx : 0;
    }

    const pv = previewAffixTransfer({
      source: _transferUiState.sourceUid,
      sourceSlot: _transferUiState.sourceSlot,
      target: _transferUiState.targetUid,
      targetSlot: _transferUiState.targetSlot
    });

    const fmtSyn = list => list.length ? list.map(s => `${s.name}(${s.tier === 3 ? '三联动' : '双联动'})`).join(' / ') : '无联动';

    box.innerHTML = withIcons(`
    <h2>✨ 词条转移台 · 原子预览与确认</h2>
    <p class="lead">支持<strong>已穿戴 4 槽装备与背包装备</strong>直接互转（无需卸下主力装）。提取后<strong>源装备保留、源槽变为空槽</strong>，目标可<strong>填空槽或覆盖已有词条</strong>；取消预览零副作用${w29Note}。</p>
    <div class="destiny-meta-row">
      <span class="destiny-chip purple">🔮 天命转印符 ${runtimeCtx.game.transferTokens || 0}</span>
      <span class="destiny-chip gold">💰 金币 ${runtimeCtx.game.gold}</span>
      <span class="destiny-chip">严禁同件重复词条与互斥组冲突</span>
    </div>
    <div class="transfer-grid">
      <div class="transfer-col" id="trSrcCol"><h4>① 选择源装备与待提取词条槽</h4></div>
      <div class="transfer-col" id="trTgtCol"><h4>② 选择目标装备与写入槽位（空槽/覆盖）</h4></div>
    </div>
    <div class="transfer-preview-box ${pv.canCommit ? '' : 'err'}">
      ${pv.movingAffix ? `
        <div><b>转移预览：</b>将【${pv.movingAffix.name}】从 <b>${pv.source?.name}</b>(槽${pv.sourceSlot + 1}→空槽) 移入 <b>${pv.target?.name}</b>(槽${pv.targetSlot + 1}${pv.isOverwrite ? ` · 覆盖【${pv.replacedAffix?.name}】` : ' · 填入空槽'})</div>
        <div><b>费用：</b>🔮 ${pv.costTokens} 转印符 + 💰 ${pv.costGold} 金币</div>
        <div><b>联动变化预测：</b>源装备 [${fmtSyn(pv.sourceBeforeSynergies)} → ${fmtSyn(pv.sourceAfterSynergies)}] · 目标装备 [${fmtSyn(pv.targetBeforeSynergies)} → ${fmtSyn(pv.targetAfterSynergies)}] · 领主全局 [<b>${fmtSyn(pv.globalBeforeSynergies)} → ${fmtSyn(pv.globalAfterSynergies)}</b>]</div>
      ` : '<div>请选择有效的源词条槽与目标槽位。</div>'}
      ${pv.canCommit ? '<div style="color:#72f2b4;margin-top:4px">✅ 校验通过：点击下方【确认转移】一次性原子扣费并生效！</div>' : `<div style="color:#ff9aa8;margin-top:4px">❌ ${pv.errorText}</div>`}
    </div>
    <div class="modal-footer">
      <button class="btn" id="trCancelBtn" type="button">取消预览 / 返回备战</button>
      <button class="btn gold" id="trCommitBtn" type="button" ${pv.canCommit ? '' : 'disabled'}>✨ 最终确认转移 (🔮${pv.costTokens} + 💰${pv.costGold})</button>
    </div>
  `);

    const srcCol = box.querySelector('#trSrcCol');
    const tgtCol = box.querySelector('#trTgtCol');

    allGear.forEach(entry => {
      const g = entry.inst;
      const isSrcSel = g.uid === _transferUiState.sourceUid;
      const sCard = document.createElement('div');
      sCard.className = 'transfer-gear-card' + (isSrcSel ? ' sel' : '');
      sCard.innerHTML = withIcons(`<div class="transfer-gear-head"><span>${g.icon} ${gearLabel(g)}</span><small>${entry.locTag} · ${g.slotsCount}槽</small></div><div class="transfer-slot-row"></div>`);
      const sRow = sCard.querySelector('.transfer-slot-row');
      for (let i = 0; i < g.slotsCount; i++) {
        const af = g.affixes?.[i] || null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'transfer-slot-btn' + (isSrcSel && _transferUiState.sourceSlot === i ? ' active' : '') + (!af ? ' empty-slot' : '');
        b.disabled = !af;
        setIconText(b, af ? `槽${i + 1}:${GEAR_AFFIXES[af.id]?.icon || ''}${GEAR_AFFIXES[af.id]?.name || af.id}` : `槽${i + 1}:[空槽]`);
        b.addEventListener('click', () => {
          _transferUiState.sourceUid = g.uid;
          _transferUiState.sourceSlot = i;
          renderAffixTransferModal();
        });
        sRow.append(b);
      }
      srcCol.append(sCard);

      const isTgtSel = g.uid === _transferUiState.targetUid;
      const tCard = document.createElement('div');
      tCard.className = 'transfer-gear-card' + (isTgtSel ? ' sel' : '');
      tCard.innerHTML = withIcons(`<div class="transfer-gear-head"><span>${g.icon} ${gearLabel(g)}</span><small>${entry.locTag} · ${g.slotsCount}槽</small></div><div class="transfer-slot-row"></div>`);
      const tRow = tCard.querySelector('.transfer-slot-row');
      for (let i = 0; i < g.slotsCount; i++) {
        const af = g.affixes?.[i] || null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'transfer-slot-btn' + (isTgtSel && _transferUiState.targetSlot === i ? ' active' : '') + (!af ? ' empty-slot' : '');
        b.disabled = g.uid === _transferUiState.sourceUid;
        b.textContent = af ? `覆盖槽${i + 1}:${GEAR_AFFIXES[af.id]?.name || af.id}` : `填入空槽${i + 1}`;
        b.addEventListener('click', () => {
          _transferUiState.targetUid = g.uid;
          _transferUiState.targetSlot = i;
          renderAffixTransferModal();
        });
        tRow.append(b);
      }
      tgtCol.append(tCard);
    });

    box.querySelector('#trCancelBtn')?.addEventListener('click', () => {
      cancelAffixTransferPreview();
      deps.modalManager.closeModal();
    });
    box.querySelector('#trCommitBtn')?.addEventListener('click', () => {
      commitAffixTransfer({
        source: _transferUiState.sourceUid,
        sourceSlot: _transferUiState.sourceSlot,
        target: _transferUiState.targetUid,
        targetSlot: _transferUiState.targetSlot
      });
    });
    getEl('modalBackdrop').hidden = false;
  }

  return { openDestinyGambleModal, renderDestinyGambleModal, openAffixTransferModal, renderAffixTransferModal };
}
