import { icon, withIcons, setIconText } from '../shared/icons.js';
import { mulberry32 } from '../../core/rng.js';
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

  let shelfGame;
  let shelfWave;
  let shelfPrices = [];
  let shelfRandom;
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
    const w29Note = runtimeCtx.game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备期间倒计时继续</span>` : '';

    if (pending) {
      box.innerHTML = withIcons(`
      <h2>🎲 天命赌局 · 挑选宝物（匣价 💰${pending.bet}）</h2>
      <p class="lead">宝匣已开启，任选一件收入行囊${w29Note}。</p>
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
        <span class="tag">${ch.tag || ({ gear: '构装', seal: '灵印', pill: '丹药', special: '奇珍' })[ch.category] || '宝物'}</span>
        <span class="ci">${ch.icon || '✨'}</span>
        <span class="cn">${ch.name}</span>
        <span class="cd">${ch.desc || ''}</span>
        ${gearChips}
        ${synBadge}
      `);
        card.addEventListener('click', () => claimDestinyReward(idx, { offerId: pending.offerId }));
        grid.append(card);
      });
      getEl('modalBackdrop').hidden = false;
      return;
    }

    const game = runtimeCtx.game;
    if (shelfGame !== game || shelfWave !== game.wave) {
      shelfGame = game;
      shelfWave = game.wave;
      shelfRandom = mulberry32((game.seed || 0) ^ Math.imul(game.wave, 7331));
      shelfPrices = [];
    }
    function restock() {
      const pool = [...new Set(cfg.betQuickPresets)].filter(p => p > cfg.minBet);
      const pick = list => list[Math.floor(shelfRandom() * list.length)];
      const first = pick(pool.filter(p => !shelfPrices.includes(p))) ?? pool[0];
      const second = pick(pool.filter(p => p !== first));
      shelfPrices = [cfg.minBet, first, second].filter(Number.isFinite).sort((a, b) => a - b);
    }
    if (!shelfPrices.length) restock();
    const last = game.destiny?.lastOutcome;
    const cards = shelfPrices.map((price, idx) => {
      const band = getDestinyBetBand(price);
      const name = band.allowLegend ? '天阶宝匣' : band.allowEpic ? '紫玉宝匣' : band.allowRare ? '青玉宝匣' : '行旅宝匣';
      const pool = band.allowLegend ? '可出传说珍宝' : band.allowEpic ? '可出史诗珍宝' : band.allowRare ? '可出稀有珍宝' : '基础奖池';
      return `<button class="fate-box" type="button" id="fateBuy${idx}" ${game.gold < price ? 'disabled' : ''}>
        ${icon(band.allowLegend ? 'crown' : band.allowEpic ? 'gem' : 'chest')}<strong>${name}</strong><span>${pool}</span><b>购买 · ${price} 金</b></button>`;
    }).join('');
    box.innerHTML = withIcons(`
      <h2>天命宝匣</h2>
      <p class="lead">购买即开匣。开出宝物时三选一，有 <strong>${Math.round(cfg.emptyTribulationChance * 100)}%</strong> 概率遇到空劫，损失匣价。天命观星可返还部分金币。${w29Note}</p>
      <div class="fate-tools"><strong>余额 ${game.gold} 金</strong><button type="button" class="btn" id="fateRefresh">免费换一批</button></div>
      <div class="fate-shelf">${cards}</div>
      ${last?.outcome === 'empty_tribulation' ? `<p role="status">上次遇到空劫 · 支出 ${last.bet} 金${last.stopLossRefund ? '，观星返还 ' + last.stopLossRefund + ' 金' : ''}</p>` : ''}
      <details class="fate-custom"><summary>自定匣价</summary><label>金币 <input id="fatePrice" type="number" min="${cfg.minBet}" max="${game.gold}" value="${cfg.minBet}"></label> <button class="btn" id="fateCustomBuy">按此价开匣</button></details>
      <div class="modal-footer"><button class="btn" id="destinyCloseBtn">返回备战</button></div>`);
    let consumed = false;
    const opening = game.activeModal;
    const refresh = box.querySelector('#fateRefresh');
    const current = () => runtimeCtx.game === game && game.phase === 'prep'
      && game.activeModal === opening && box.querySelector('#fateRefresh') === refresh && !getPendingDestinyOffer();
    function buy(price) {
      if (consumed || !current() || !Number.isInteger(price) || price < cfg.minBet || price > game.gold) return;
      consumed = true;
      if (!rollDestinyGamble(price)?.ok) consumed = false;
    }
    shelfPrices.forEach((price, i) => box.querySelector('#fateBuy' + i).addEventListener('click', () => buy(price)));
    refresh.addEventListener('click', () => {
      if (consumed || !current()) return;
      consumed = true;
      restock();
      renderDestinyGambleModal();
    });
    const input = box.querySelector('#fatePrice');
    const custom = box.querySelector('#fateCustomBuy');
    function validate() {
      const price = Number(input.value);
      custom.disabled = !Number.isInteger(price) || price < cfg.minBet || price > game.gold;
    }
    input.addEventListener('input', validate); validate();
    custom.addEventListener('click', () => buy(Number(input.value)));
    box.querySelector('#destinyCloseBtn').addEventListener('click', () => { consumed = true; deps.modalManager.closeModal(); });
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
    const w29Note = runtimeCtx.game.finalPrep?.active ? ` · <span style="color:#ff9090">⏳ W29 整备期间倒计时继续</span>` : '';

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
    <h2>✨ 词条转移台</h2>
    <p class="lead">支持<strong>已穿戴 4 槽装备与背包装备</strong>直接互转（无需卸下主力装）。提取后<strong>源装备保留、源槽变为空槽</strong>，目标可<strong>填空槽或覆盖已有词条</strong>；确认时消耗材料${w29Note}。</p>
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
