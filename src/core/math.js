import BALANCE from '../data/balance.js';

export function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }
export function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

export function xpForLevel(lv){
  const p = BALANCE.progression;
  return Math.round(p.xpBase + Math.min(lv, p.xpKnee) * p.xpEarlyPerLevel + Math.max(0, lv - p.xpKnee) * p.xpLatePerLevel);
}
