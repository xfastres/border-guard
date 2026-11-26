import { BUILD_ROUTES, SKILL_BUILD_KEYS, SOURCE_STAGES, DESTINY_ENHANCEMENTS } from '../data/index.js';

export function getSourceStageForWave(wave = 1){
  const w = Math.max(1, Math.round(Number(wave) || 1));
  const found = SOURCE_STAGES.find(s => w >= s.minWave && w <= s.maxWave);
  return found ? found.stage : SOURCE_STAGES[SOURCE_STAGES.length - 1].stage;
}

export function getSourceStageSpec(stage = 1){
  return SOURCE_STAGES.find(s => s.stage === Number(stage)) || SOURCE_STAGES[0];
}

export function getBuildRoute(game){
  const hero = game?.hero;
  const key = hero?.breakthroughs?.w10?.skillKey || hero?.starterSkill;
  return BUILD_ROUTES[SKILL_BUILD_KEYS[key]] ?? null;
}

export function perkLv(game, key){ return game?.hero?.perks?.[key] || 0; }

export function hasCombo(game, key){ return !!game?.hero?.combos?.[key]; }

export function getW20ActiveState(game){
  const w20 = game?.hero?.breakthroughs?.w20;
  if (!w20 || !w20.completed || w20.placeholder) {
    return { active: false, baseEffectActive: false, directionKey: null, enhancementKey: null, voucher: !!game?.hero?.vouchers?.w20 };
  }
  const baseActive = w20.baseEffectActive !== false && !!game?.hero?.vouchers?.w20;
  return {
    active: baseActive,
    baseEffectActive: baseActive,
    directionKey: baseActive ? (w20.directionKey || null) : null,
    enhancementKey: baseActive ? (w20.enhancementKey || null) : null,
    voucher: !!game?.hero?.vouchers?.w20
  };
}

export function hasW20Direction(game, dirKey){
  const st = getW20ActiveState(game);
  return st.baseEffectActive && st.directionKey === dirKey;
}

export function hasW20Enhancement(game, enhKey){
  const st = getW20ActiveState(game);
  return st.baseEffectActive && st.enhancementKey === enhKey;
}

export function hasDestinyEnhancement(game, key){
  return !!(key && game?.hero?.destinyEnhancements?.[key]);
}

export function getOwnedDestinyEnhancements(game){
  const map = game?.hero?.destinyEnhancements || {};
  return Object.keys(map).filter(k => map[k] && DESTINY_ENHANCEMENTS[k]).map(k => DESTINY_ENHANCEMENTS[k]);
}

export function isFinalPrepActionLocked(game, nowMs = null){
  const fp = game?.finalPrep;
  if (!fp) return false;
  if (fp.locked || fp.transitioning) return true;
  if (fp.active && fp.started && (fp.timer <= 0 || (Number.isFinite(nowMs) && Number.isFinite(fp.deadlineMs) && nowMs >= fp.deadlineMs))) return true;
  return false;
}

export function isW29WaveRewardModal(modal){
  return !!(modal && ['levelup', 'chest', 'perk'].includes(modal.type));
}

export function hasPendingW29WaveRewards(game){
  if (!game) return false;
  if (game.chests && game.chests.length > 0) return true;
  if (isW29WaveRewardModal(game.activeModal)) return true;
  if (game.pendingModals && game.pendingModals.some(isW29WaveRewardModal)) return true;
  return false;
}

export function getFinalPrepState(game){
  const fp = game?.finalPrep;
  if (!fp) return null;
  return {
    active: !!fp.active,
    awaitingWaveRewards: !!fp.awaitingWaveRewards,
    started: !!fp.started,
    locked: !!fp.locked,
    transitioning: !!fp.transitioning,
    timer: Number((fp.timer || 0).toFixed(3)),
    duration: fp.duration || fp.maxSeconds || 90,
    w30IntelShown: !!fp.w30IntelShown,
    lastResolution: fp.lastResolution ? JSON.parse(JSON.stringify(fp.lastResolution)) : null
  };
}
