import { UNLOCK_NODES } from '../../data/index.js';
import { clamp } from '../../core/math.js';
import { perkLv } from '../../core/state-queries.js';

export function createUnlockSystem(ctx) {
  function getActiveUnlockNode(){
    if (!ctx.game?.hero) return UNLOCK_NODES[0];
    const w = ctx.game.wave || 1;
    const br = ctx.game.hero.breakthroughs || {};
    let active = UNLOCK_NODES[0];
    for (const node of UNLOCK_NODES) {
      const waveOk = w >= (node.minWave || 1);
      const brOk = !node.requireBreakthrough || !!br[node.requireBreakthrough];
      if (waveOk && brOk) active = node;
    }
    ctx.game.hero.realm = active.idx;
    return active;
  }

  function getRealm(idx = null){
    if (idx === null || idx === undefined) return getActiveUnlockNode();
    return UNLOCK_NODES[clamp(idx, 0, UNLOCK_NODES.length - 1)];
  }

  function getRealmStageLabel(){
    const node = getActiveUnlockNode();
    return `${node.name}·${node.stageTag || '进阶'}`;
  }

  function getUnlockedSkillPool(){
    return getActiveUnlockNode().skills.slice();
  }

  function getSealStarCap(){
    const node = getActiveUnlockNode();
    const bonus = perkLv(ctx.game, 'artifact_overclock') >= 2 ? 1 : 0;
    return Math.min(5, node.sealCap + bonus);
  }

  function getSubSealSlotCap(){
    const node = getActiveUnlockNode();
    const bonus = perkLv(ctx.game, 'artifact_overclock') >= 1 ? 1 : 0;
    return Math.min(2, node.subCap + bonus);
  }

  function getShopTier(){
    const node = getActiveUnlockNode();
    const base = (ctx.game.wave >= 16 || node.idx >= 2) ? 3 : (ctx.game.wave >= 6 || node.idx >= 1) ? 2 : 1;
    return Math.min(3, base + (ctx.game.shopTierBonus || 0));
  }

  function hasPendingDecision(){
    if (!ctx.game) return false;
    if (ctx.game.activeModal && ctx.game.activeModal.type !== 'intro') return true;
    if (ctx.game.pendingModals && ctx.game.pendingModals.length > 0) return true;
    if (ctx.game.pendingBreakthrough) return true;
    if (ctx.game.destiny?.pendingOffer && !ctx.game.destiny.pendingOffer.claimed) return true;
    if (ctx.game.chests && ctx.game.chests.length > 0) return true;
    return false;
  }

  return {
    getActiveUnlockNode,
    getRealm,
    getRealmStageLabel,
    getUnlockedSkillPool,
    getSealStarCap,
    getSubSealSlotCap,
    getShopTier,
    hasPendingDecision,
  };
}
