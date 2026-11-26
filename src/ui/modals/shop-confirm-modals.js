import { gearIcon, icon, setIconText, withIcons } from '../shared/icons.js';
import { getOfferBuildFit } from '../hud/shop-cards.js';
import { getSourceStageSpec } from '../../core/state-queries.js';
import { ARTIFACTS, PILLS } from '../../data/core-data.js';
import { GEAR_AFFIXES, GEAR_RARITY_LABELS, GEARS } from '../../data/equipment-data.js';

export function createShopConfirmModals(runtimeCtx, deps) {
  const { getEl } = deps;
  const { describeGearEffect, evaluateEquipmentSynergies, gearLabel } = deps.equipment;
  const { cancelShopPurchaseConfirm, confirmShopPurchase } = deps.economy;
  const { getPendingDestinyOffer } = deps.progression;
  const { startW30Early } = deps.run;
  const { renderAllUI } = deps.ui;
  let receiptTimer;

  function renderShopConfirmModal(){
    const draft = runtimeCtx.game?.shopConfirmDraft;
    const item = draft ? runtimeCtx.game.shop?.[draft.shopIdx] : null;
    if (!draft || !item || item.bought) { cancelShopPurchaseConfirm(); return; }
    const box = getEl('modalBox');
    const w29Note = runtimeCtx.game.finalPrep?.active ? ' · <span style="color:#ff9090">W29 整备倒计时继续运行</span>' : '';
    let detailLine = '';
    let gearComparison = '';
    if (item.itemType === 'pill') {
      const p = PILLS[item.pillKey];
      detailLine = p ? `${p.icon} ${p.name}：${p.desc}` : draft.label;
    } else if (item.itemType === 'gear' && item.gear) {
      const g = item.gear;
      const stSpec = getSourceStageSpec(g.sourceStage);
      const afTxt = (g.affixes || []).filter(Boolean).map(a => GEAR_AFFIXES[a.id]?.name || a.id).join(' / ') || '无词条';
      detailLine = `${icon(gearIcon(GEARS[g.baseKey]))} ${g.name} [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽] · 词条：${afTxt}`;
      const equipped = runtimeCtx.game.hero.gear;
      const { upgrade } = getOfferBuildFit(runtimeCtx.game, g, evaluateEquipmentSynergies);
      const link = upgrade ? `穿戴后可${upgrade.link.tier === 3 ? '升级至三' : '激活双'}联动【${upgrade.link.name}】${upgrade.slot ? ` · 替换第 ${upgrade.slot} 槽` : ''}` : '';
      const affixDetails = (g.affixes || []).map(a => {
        const spec = GEAR_AFFIXES[a?.id];
        return spec ? `<li><b>${spec.name} T${a.tier || 1}</b> · ${spec.desc(a.tier || 1)}</li>` : '';
      }).join('');
      const lostLinks = upgrade?.lost.map(s => s.name).join('、');
      const current = equipped.map(item => `<li>${item.name || gearLabel(item)} · ${describeGearEffect(item)}</li>`).join('');
      gearComparison = `<div class="shop-compare"><div><strong>商品属性</strong><p>${describeGearEffect?.(g) || ''}</p>${affixDetails ? `<ul>${affixDetails}</ul>` : ''}${link ? `<p class="link-preview">${link}</p>` : ''}${lostLinks ? `<p>联动可能降阶或消失 · ${lostLinks}</p>` : ''}</div>
        <div><strong>当前穿戴</strong>${current ? `<ul>${current}</ul>` : '<p>构装槽空闲</p>'}</div></div>`;
    } else {
      const spec = ARTIFACTS[item.kind];
      detailLine = spec ? `${spec.name} ${item.star || 1}★：${spec.desc}` : draft.label;
    }
    box.innerHTML = withIcons(`
    <h2>🛒 确认购买【${draft.label}】</h2>
    <p class="lead">${detailLine}<br>花费 <strong>${item.cost} 金币</strong>（持有 ${runtimeCtx.game.gold}）${w29Note}。</p>
    ${gearComparison}
    <div class="modal-footer">
      <button class="btn" id="shopConfirmCancelBtn" type="button">取消（零扣款）</button>
      <button class="btn gold" id="shopConfirmBuyBtn" type="button" ${runtimeCtx.game.gold < item.cost ? 'disabled' : ''}>确认购买（💰${item.cost}）</button>
    </div>
  `);
    box.querySelector('#shopConfirmCancelBtn')?.addEventListener('click', () => { cancelShopPurchaseConfirm(); renderAllUI(true); });
    box.querySelector('#shopConfirmBuyBtn')?.addEventListener('click', () => {
      const result = confirmShopPurchase();
      if (!result?.ok) return;
      const receipt = getEl('purchaseFeedback');
      if (!receipt) return;
      const note = item.itemType === 'gear' ? '已入背包 · 穿戴后生效' : item.itemType === 'pill' ? '已使用' : '灵印已获得';
      setIconText(receipt, `✨ ${draft.label} · ${note}`);
      receipt.hidden = false;
      clearTimeout(receiptTimer);
      receiptTimer = setTimeout(() => { receipt.hidden = true; }, 2400);
    });
    getEl('modalBackdrop').hidden = false;
  }

  function renderW30EarlyConfirmModal(){
    const offer = getPendingDestinyOffer();
    if (!offer) {
      deps.modalManager.closeModal();
      return;
    }
    const box = getEl('modalBox');
    const remSec = Math.ceil(runtimeCtx.game.finalPrep?.timer || 0);
    const choiceNames = offer.choices.map((c, i) => `${i + 1}. ${c.icon || '✨'}${c.name}`).join(' · ');
    box.innerHTML = withIcons(`
    <h2>⚠️ 尚有未领取的天命赌局奖励</h2>
    <p class="lead">你已赢得天命三选一候选（<strong>${choiceNames}</strong>），尚未领取！<br>
    ⏳ W29 整备倒计时继续运行（剩余 <strong>${remSec}s</strong>）。你可以先完成三选一领取，或明确接受从这 3 件中<strong>随机安全领取 1 件</strong>并立即迎战 W30 深渊主宰！</p>
    <div class="modal-footer" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn" id="w30EarlyBackBtn" type="button">返回整备</button>
      <button class="btn gold" id="w30EarlyClaimBtn" type="button">🎲 先去三选一领取</button>
      <button class="btn danger" id="w30EarlyRandomBtn" type="button">⚡ 接受随机领取并立即开战 W30</button>
    </div>
  `);
    box.querySelector('#w30EarlyBackBtn')?.addEventListener('click', () => { deps.modalManager.closeModal(); renderAllUI(true); });
    box.querySelector('#w30EarlyClaimBtn')?.addEventListener('click', () => { deps.destinyTransferModals.openDestinyGambleModal(); });
    box.querySelector('#w30EarlyRandomBtn')?.addEventListener('click', () => { startW30Early({ acceptRandomClaim: true }); });
    getEl('modalBackdrop').hidden = false;
  }

  return { renderShopConfirmModal, renderW30EarlyConfirmModal };
}
