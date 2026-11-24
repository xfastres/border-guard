import { GEARS, GEAR_STAR_MULT, GEAR_AFFIXES, GEAR_RARITY_LABELS } from '../../data/index.js';
import { getSourceStageSpec } from '../../core/state-queries.js';
import { gearBase, gearStar, getGearBaseMult } from './instance.js';
import { evaluateItemSynergies } from './synergy.js';

export function describeGearEffect(gk){
  const spec = GEARS[gearBase(gk)];
  if (!spec) return '';
  const isInst = gk && typeof gk === 'object';
  const mult = isInst ? getGearBaseMult(gk) : GEAR_STAR_MULT[gearStar(gk) - 1];
  const parts = [];
  for (const [k, v] of Object.entries(spec.mod)) {
    const val = v * mult;
    const sign = val >= 0 ? '+' : '';
    if (k === 'dmgPct') parts.push(`全伤 ${sign}${Math.round(val * 100)}%`);
    else if (k === 'aspd') parts.push(`攻速 ${sign}${Math.round((v < 0 ? v : val) * 100)}%`);
    else if (k === 'crit') parts.push(`暴击 ${sign}${Math.round(val * 100)}%`);
    else if (k === 'critDmg') parts.push(`暴伤 ${sign}${Math.round(val * 100)}%`);
    else if (k === 'rangePct') parts.push(`范围/射程 ${sign}${Math.round(val * 100)}%`);
    else if (k === 'movePct') parts.push(`移速 ${sign}${Math.round(val * 100)}%`);
    else if (k === 'flatHp') parts.push(`最大生命 ${sign}${Math.round(val)}`);
    else if (k === 'hpPct') parts.push(`最大生命 ${sign}${Math.round(v * 100)}%`);
    else if (k === 'extraShot') parts.push(`额外弹道 +${Math.round(v)}`);
    else if (k === 'splashBonus') parts.push(`溅射范围 +${val.toFixed(2)}格`);
    else if (k === 'slowOnHit') parts.push(`攻击减速 ${Math.round(Math.min(0.65, val) * 100)}%`);
    else if (k === 'chainProc') parts.push(`命中 ${Math.round(Math.min(0.8, val) * 100)}% 连锁雷`);
    else if (k === 'lifesteal') parts.push(`攻击回血 +${(val * 0.5).toFixed(1)}`);
    else if (k === 'bonusGold') parts.push(`击杀 +${Math.round(val)} 金`);
  }
  return parts.join(' · ');
}

export function describeGearInstance(inst){
  if (!inst || typeof inst !== 'object') return describeGearEffect(inst);
  const stSpec = getSourceStageSpec(inst.sourceStage);
  const baseTxt = describeGearEffect(inst);
  const afTxt = (inst.affixes || []).map((a, idx) => {
    if (!a) return `[空槽${idx + 1}]`;
    const sp = GEAR_AFFIXES[a.id];
    return sp ? `${sp.icon}${sp.name}(T${a.tier || 1})` : a.id;
  }).join(' + ');
  const itemSyns = evaluateItemSynergies(inst);
  const synTxt = itemSyns.length ? ` | 联动:${itemSyns.map(s => s.name).join('/')}` : '';
  return `[${GEAR_RARITY_LABELS[inst.rarity]}·${stSpec.label}·${inst.slotsCount}槽${inst.enhanceLv ? `·+${inst.enhanceLv}` : ''}] ${baseTxt} | 词条:${afTxt}${synTxt}`;
}
