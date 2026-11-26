import { ARTIFACTS, PILLS } from '../../data/index.js';

export function createShopConfirm(ctx, { buyShopItem }) {

  function openShopPurchaseConfirm(shopIdx){
    const game = ctx.game;
    if (!game || game.phase !== 'prep') return { ok: false, reason: 'not_in_prep' };
    if (ctx.isFinalPrepActionLocked()) return { ok: false, reason: 'final_prep_locked' };
    const item = game.shop?.[shopIdx];
    if (!item || item.bought) return { ok: false, reason: 'invalid_shop_item' };
    const label = item.itemType === 'pill'
      ? (PILLS[item.pillKey]?.name || item.pillKey)
      : item.itemType === 'gear'
        ? (item.gear?.name || '构装')
        : `${ARTIFACTS[item.kind]?.name || item.kind} ${item.star || 1}★`;
    game.shopConfirmDraft = {
      shopIdx,
      itemUid: item.uid,
      itemType: item.itemType,
      cost: item.cost,
      label
    };
    game.activeModal = { type: 'shop_confirm', shopIdx, itemUid: item.uid };
    ctx.ports.modals.renderShopConfirmModal();
    return { ok: true, draft: { ...ctx.game.shopConfirmDraft } };
  }

  function cancelShopPurchaseConfirm(){
    const game = ctx.game;
    if (game) {
      game.shopConfirmDraft = null;
      if (game.activeModal?.type === 'shop_confirm') ctx.ports.modals.closeModal();
    }
    return { ok: true, cancelled: true };
  }

  function confirmShopPurchase(){
    const game = ctx.game;
    if (!game) return { ok: false, reason: 'no_game' };
    if (ctx.isFinalPrepActionLocked()) {
      game.shopConfirmDraft = null;
      return { ok: false, reason: 'final_prep_locked' };
    }
    const draft = game.shopConfirmDraft;
    if (!draft) return { ok: false, reason: 'no_shop_draft' };
    const item = game.shop?.[draft.shopIdx];
    if (!item || item.bought || item.uid !== draft.itemUid) {
      game.shopConfirmDraft = null;
      if (game.activeModal?.type === 'shop_confirm') ctx.ports.modals.closeModal();
      return { ok: false, reason: 'stale_shop_draft' };
    }
    game.shopConfirmDraft = null;
    if (game.activeModal?.type === 'shop_confirm') ctx.ports.modals.closeModal();
    const bought = buyShopItem(draft.shopIdx);
    if (bought && typeof bought === 'object' && bought.ok === false) {
      return { ok: false, reason: bought.reason || 'buy_failed', goldLeft: ctx.game.gold };
    }
    return { ok: !!bought, reason: bought ? null : 'buy_failed', goldLeft: ctx.game.gold };
  }

  return { openShopPurchaseConfirm, cancelShopPurchaseConfirm, confirmShopPurchase };
}
