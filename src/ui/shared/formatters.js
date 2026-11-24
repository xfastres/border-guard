import { HERO_SKILLS } from '../../data/core-data.js';
import { GEAR_AFFIXES } from '../../data/equipment-data.js';

export function formatSkillBreakdown(key, lv, hs, branchSpec = null){
  const spec = HERO_SKILLS[key];
  const nextLv = lv < 5 ? lv + 1 : null;
  const sm = hs.skillDmgMult || hs.dmgMult;
  const rm = hs.skillRangeMult || hs.rangeMult;
  const cdM = hs.skillCdMult || 1;
  const br = branchSpec;
  const brNote = br ? ` · 【W10:${br.name}】` : '';
  if (key === 'blades') {
    const dmg = Math.round((15 + lv * 7) * sm);
    const cnt = lv + 1 + (br?.key === 'bl_twin_orbit' ? 2 : 0);
    const rad = ((1.65 + lv * 0.10) * rm).toFixed(2);
    const nDmg = nextLv ? Math.round((15 + nextLv * 7) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `${cnt} 把飞刃 · 单次 ${dmg} 伤（基础${15+lv*7}×${Math.round(sm*100)}%）· 半径 ${rad}格${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：飞刃 ${cnt}→${nextLv+1} 把，单次 ${dmg}→${nDmg} 伤，转速与半径提升` : '已满级 Lv.5'
    };
  }
  if (key === 'firewave') {
    const dmg = Math.round((26 + lv * 13) * sm);
    const cnt = Math.min(4, Math.ceil(lv / 2) + 1) + hs.gm.extraShot;
    const cd = (Math.max(0.75, 1.45 - lv * 0.14) * cdM / hs.aspd).toFixed(2);
    const nCnt = nextLv ? Math.min(4, Math.ceil(nextLv / 2) + 1) + hs.gm.extraShot : 0;
    const nDmg = nextLv ? Math.round((26 + nextLv * 13) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `${cnt} 道穿透剑气 · 单次 ${dmg} 伤 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：剑气 ${cnt}→${nCnt} 道，单次 ${dmg}→${nDmg} 伤，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'thunder') {
    const dmg = Math.round((30 + lv * 15) * sm);
    const strikes = lv + 1;
    const cd = (Math.max(0.75, 1.65 - lv * 0.18) * cdM / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((30 + nextLv * 15) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `召唤 ${strikes} 道 3连天雷 · 单次 ${dmg} 伤 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：落雷 ${strikes}→${nextLv+1} 道，单次 ${dmg}→${nDmg} 伤，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'nova') {
    const dmg = Math.round((25 + lv * 13) * sm);
    const rad = ((1.95 + lv * 0.24) * rm * (br?.key === 'nv_glacial_bastion' ? 1.25 : 1)).toFixed(2);
    const cd = (Math.max(1.45, 2.25 - lv * 0.16) * cdM * (br?.key === 'nv_trail_aegis' ? 0.75 : 1) / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((25 + nextLv * 13) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `冰环半径 ${rad}格 · 单次 ${dmg} 伤 + 减速 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：单次 ${dmg}→${nDmg} 伤，半径扩大，冷却缩短` : '已满级 Lv.5'
    };
  }
  if (key === 'stomp') {
    const dmg = Math.round((40 + lv * 20) * sm);
    const rad = ((2.00 + lv * 0.24) * rm * (br?.key === 'st_glacier_quake' ? 1.25 : 1)).toFixed(2);
    const cd = (Math.max(1.60, 2.45 - lv * 0.17) * cdM / hs.aspd).toFixed(2);
    const nDmg = nextLv ? Math.round((40 + nextLv * 20) * sm) : 0;
    return {
      name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
      cur: `震荡半径 ${rad}格 · 单次 ${dmg} 伤 + 0.75s 晕眩 · 间隔 ${cd}s${br ? ` · ${br.tag}` : ''}`,
      next: nextLv ? `升至 Lv.${nextLv}：单次 ${dmg}→${nDmg} 伤，范围更大，冷却缩短` : '已满级 Lv.5'
    };
  }
  return {
    name: `${spec.icon} ${spec.name}${brNote}`, lvText: `Lv.${lv}/5`,
    cur: `攻速 +${lv*18}% · 暴击 +${lv*8}% · 移速 +${(lv*0.35).toFixed(2)} · 吸血 +${lv*2} · 磁铁 +${(lv*0.85).toFixed(1)}格${br ? ` · ${br.tag}` : ''}`,
    next: nextLv ? `升至 Lv.${nextLv}：攻速 +${nextLv*18}%、暴击 +${nextLv*8}%、吸血 +${nextLv*2}、磁铁再扩` : '已满级 Lv.5'
  };
}

export function renderAffixChipsHtml(inst){
  return (inst.affixes || []).map((a, idx) => {
    if (!a) return `<span class="affix-chip">[空槽${idx + 1}]</span>`;
    const sp = GEAR_AFFIXES[a.id];
    if (!sp) return '';
    const cls = `${sp.elem === 'fire' ? 'fire' : sp.elem === 'frost' ? 'frost' : ''} ${sp.rarity}`;
    return `<span class="affix-chip ${cls}" title="${sp.desc(a.tier || 1)}">${sp.icon}${sp.name}${a.tier > 1 ? ` T${a.tier}` : ''}</span>`;
  }).join('');
}

export function formatDurationMMSS(sec){
  const s = Math.max(0, Math.round(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}分${String(r).padStart(2, '0')}秒`;
}

export function createUiFormatters({ getW10BranchSpec }) {
  function getSkillBreakdown(key, lv, hs){
    return formatSkillBreakdown(key, lv, hs, getW10BranchSpec(key));
  }

  return { getSkillBreakdown, renderAffixChipsHtml, formatDurationMMSS };
}
