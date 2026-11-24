export const RESOURCE_LEDGER_MAX = 500;

export function createResourceLedger(ctx) {
  function recordResourceFlow(resourceType, delta, reason = 'unknown'){
    const game = ctx.game;
    if (!game) return 0;
    const amt = Math.round(Number(delta) || 0);
    if (amt === 0) return 0;
    const rm = game.runMetrics;
    let actualDelta = 0;
    let balanceAfter = 0;
    if (resourceType === 'gold') {
      const prev = Math.max(0, Number(game.gold || 0));
      game.gold = Math.max(0, prev + amt);
      actualDelta = game.gold - prev;
      balanceAfter = game.gold;
      if (rm) {
        if (actualDelta > 0) rm.goldEarned += actualDelta;
        else if (actualDelta < 0) rm.goldSpent += -actualDelta;
        rm._lastGold = game.gold;
      }
    } else if (resourceType === 'materials') {
      const prev = Math.max(0, Number(game.materials || 0));
      game.materials = Math.max(0, prev + amt);
      actualDelta = game.materials - prev;
      balanceAfter = game.materials;
      if (rm) {
        if (actualDelta > 0) rm.materialsEarned += actualDelta;
        else if (actualDelta < 0) rm.materialsSpent += -actualDelta;
        rm._lastMaterials = game.materials;
      }
    } else if (resourceType === 'transferTokens') {
      const prev = Math.max(0, Number(game.transferTokens || 0));
      game.transferTokens = Math.max(0, prev + amt);
      actualDelta = game.transferTokens - prev;
      balanceAfter = game.transferTokens;
      if (rm) {
        if (actualDelta > 0) rm.transferTokensEarned += actualDelta;
        else if (actualDelta < 0) rm.transferTokensSpent += -actualDelta;
        rm._lastTokens = game.transferTokens;
      }
    } else {
      return 0;
    }
    if (rm && actualDelta !== 0) {
      if (!Array.isArray(rm.ledger)) rm.ledger = [];
      const seq = rm._ledgerSeq || 1;
      rm._ledgerSeq = seq + 1;
      rm.ledger.push({
        seq,
        wave: game.wave || 1,
        type: resourceType,
        delta: actualDelta,
        reason: String(reason || 'unknown'),
        balanceAfter
      });
      if (rm.ledger.length > RESOURCE_LEDGER_MAX) {
        rm.ledger.splice(0, rm.ledger.length - RESOURCE_LEDGER_MAX);
      }
    }
    return actualDelta;
  }

  function changeGold(delta, reason = 'gold_change'){
    return recordResourceFlow('gold', delta, reason);
  }

  function changeMaterials(delta, reason = 'materials_change'){
    return recordResourceFlow('materials', delta, reason);
  }

  function changeTransferTokens(delta, reason = 'transfer_tokens_change'){
    return recordResourceFlow('transferTokens', delta, reason);
  }

  function getResourceLedger(limit = 0){
    const game = ctx.game;
    const list = Array.isArray(game?.runMetrics?.ledger) ? game.runMetrics.ledger : [];
    const sliced = limit > 0 ? list.slice(-limit) : list.slice();
    return sliced.map(e => ({ ...e }));
  }

  function resetRunMetricsResourceBaseline(){
    const game = ctx.game;
    if (!game?.runMetrics) return;
    const rm = game.runMetrics;
    const g = Math.max(0, Number(game.gold || 0));
    const m = Math.max(0, Number(game.materials || 0));
    const t = Math.max(0, Number(game.transferTokens || 0));
    rm.goldEarned = g;
    rm.goldSpent = 0;
    rm.materialsEarned = m;
    rm.materialsSpent = 0;
    rm.transferTokensEarned = t;
    rm.transferTokensSpent = 0;
    rm._lastGold = g;
    rm._lastMaterials = m;
    rm._lastTokens = t;
    rm.ledger = [];
    rm._ledgerSeq = 1;
  }

  function syncRunResourceAccounting(){
    const game = ctx.game;
    // BUG-06: Accounting is now driven strictly by changeGold/changeMaterials/changeTransferTokens ledger.
    // Keep this helper only to sync baseline snapshots without ever overriding/canceling ledger totals.
    if (!game?.runMetrics) return;
    const rm = game.runMetrics;
    rm._lastGold = Math.max(0, Number(game.gold || 0));
    rm._lastMaterials = Math.max(0, Number(game.materials || 0));
    rm._lastTokens = Math.max(0, Number(game.transferTokens || 0));
  }

  return {
    recordResourceFlow,
    changeGold,
    changeMaterials,
    changeTransferTokens,
    getResourceLedger,
    resetRunMetricsResourceBaseline,
    syncRunResourceAccounting,
  };
}
