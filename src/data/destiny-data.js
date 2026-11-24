/* ==================== STAGE 4: DESTINY GAMBLE EXCLUSIVE ENHANCEMENTS, BOONS & PILLS ====================
   - DESTINY_ENHANCEMENTS: Obtainable STRICTLY via Destiny Gamble (special category when bet >= destinyExclusive threshold).
     NEVER appear in regular shop, level-up skill pool, chests, or W20 enhancement pool!
   - Non-duplicate ownership + explicit conflictGroup mutual exclusion.
===================================================================================================== */
export const DESTINY_ENHANCEMENTS = {
  destiny_ember_echo: {
    key: 'destiny_ember_echo',
    name: '天命·余烬回响',
    icon: '🔥',
    rarity: 'epic',
    tag: '火标 / 引爆',
    conflictGroup: 'destiny_offense',
    exclusiveSource: 'destiny_gamble',
    desc: '每次触发【火标引爆】后，立即向主目标周围 2.8 格敌军补挂 1 层【火标】并使下一次火标引爆伤害 +18%（0.6s 冷却，与「破劫裁决」互斥）'
  },
  destiny_glacial_aegis: {
    key: 'destiny_glacial_aegis',
    name: '天命·寒穹天幕',
    icon: '❄️',
    rarity: 'epic',
    tag: '冰盾 / 反制',
    conflictGroup: 'destiny_defense',
    exclusiveSource: 'destiny_gamble',
    desc: '寒冰护盾上限 +40；触发任意【冰环反制】后立即回复 14 点寒冰护盾并获得 2.5s 移速 +12%（主动冲刺与受击均可触发，与「玄天金钟」互斥）'
  },
  destiny_phantom_stride: {
    key: 'destiny_phantom_stride',
    name: '天命·踏虚步法',
    icon: '💨',
    rarity: 'epic',
    tag: '走位 / 冲刺',
    conflictGroup: 'destiny_mobility',
    exclusiveSource: 'destiny_gamble',
    desc: '冲刺冷却 -18%，冲刺路径附近敌人同时施加【火标】与 40%【冰缓】，且冲刺后 2.2s 暴击率 +20%（与「星陨超载」互斥）'
  },
  destiny_fate_breaker: {
    key: 'destiny_fate_breaker',
    name: '天命·破劫裁决',
    icon: '⚔️',
    rarity: 'legend',
    tag: '爆发 / 破盾',
    conflictGroup: 'destiny_offense',
    exclusiveSource: 'destiny_gamble',
    desc: '对首领/精英或易伤目标全伤害 +22%；暴击命中首领/精英时施加 2.5s 易伤 (+20%) 并附加 35% 破劫额外爆发（1.2s 冷却，与「余烬回响」互斥）'
  },
  destiny_aegis_bulwark: {
    key: 'destiny_aegis_bulwark',
    name: '天命·玄天金钟',
    icon: '🛡️',
    rarity: 'legend',
    tag: '生存 / 护盾',
    conflictGroup: 'destiny_defense',
    exclusiveSource: 'destiny_gamble',
    desc: '最大生命 +90、受击减伤 +10%；每 8 秒自动凝结 32 点【寒冰护盾】（无需受击即可支撑冰盾联动，与「寒穹天幕」互斥）'
  },
  destiny_resonance_crown: {
    key: 'destiny_resonance_crown',
    name: '天命·天衍共鸣',
    icon: '👑',
    rarity: 'epic',
    tag: '灵印 / 神通',
    conflictGroup: null,
    exclusiveSource: 'destiny_gamble',
    desc: '全神通伤害 +16%、全暴击伤害 +25%，主灵印触发冷却 -14%'
  },
  destiny_overdrive_nova: {
    key: 'destiny_overdrive_nova',
    name: '天命·星陨超载',
    icon: '🌠',
    rarity: 'legend',
    tag: '爆发 / 超载',
    conflictGroup: 'destiny_mobility',
    exclusiveSource: 'destiny_gamble',
    desc: '「全军超载(R)」冷却 -22%，开启瞬间以领主为中心迸发星陨震爆（挂火标+冰缓+范围重击）并凝结 45 点寒冰护盾（与「踏虚步法」互斥）'
  },
  destiny_golden_temper: {
    key: 'destiny_golden_temper',
    name: '天命·天工淬炼',
    icon: '⚒️',
    rarity: 'epic',
    tag: '精修 / 属性',
    conflictGroup: null,
    exclusiveSource: 'destiny_gamble',
    desc: '每穿戴 1 件强化等级 ≥+2 的构装，全伤害 +7%、攻速 +5%；获得时立即附赠 ⚙️+4 锻材'
  }
};
export const DESTINY_ENHANCEMENT_KEYS = Object.keys(DESTINY_ENHANCEMENTS);

// Non-precious ordinary special boons (used in 'special' category when bet is below precious thresholds, or fallback if all exclusives & tokens exhausted)
export const DESTINY_SPECIAL_BOONS = {
  boon_forge_bundle: {
    key: 'boon_forge_bundle',
    name: '灵炉锻材包',
    icon: '⚙️',
    desc: r => `提炼 +${r === 'rare' ? 4 : 2} 份普通材料（锻材），可直接用于装备强化精修`,
    materialsByRarity: { common: 2, rare: 4, epic: 6, legend: 9 }
  },
  boon_vital_temper: {
    key: 'boon_vital_temper',
    name: '玄脉淬体礼',
    icon: '❤️',
    desc: r => `永久最大生命 +${r === 'rare' ? 32 : 18} 并恢复 ${r === 'rare' ? 70 : 40} 生命`,
    hpByRarity: { common: 18, rare: 32, epic: 48, legend: 68 }
  },
  boon_battle_ward: {
    key: 'boon_battle_ward',
    name: '护身灵符礼',
    icon: '💠',
    desc: r => `获得 +${r === 'rare' ? 3 : 1} 份锻材并立即凝结 ${r === 'rare' ? 60 : 35} 点护盾与回复 35 生命`,
    materialsByRarity: { common: 1, rare: 3, epic: 5, legend: 7 },
    shieldByRarity: { common: 35, rare: 60, epic: 85, legend: 110 }
  }
};
export const DESTINY_SPECIAL_BOON_KEYS = Object.keys(DESTINY_SPECIAL_BOONS);

// Clean v0.60 Destiny Pills by rarity tier (ZERO old tribulation pills!)
export const DESTINY_PILLS = {
  common: [
    { key: 'xp',     name: '修为丹',   icon: '💊', rarity: 'common', desc: '立即注入当前等级 35% 修为' },
    { key: 'heal',   name: '回春丹',   icon: '🌿', rarity: 'common', desc: '立即恢复 65 生命并凝结 25 护盾' },
    { key: 'temper', name: '淬灵丹',   icon: '⚗️', rarity: 'common', desc: '普通材料 +2 并恢复 25 生命' }
  ],
  rare: [
    { key: 'rare_xp',     name: '聚灵丹',   icon: '💊', rarity: 'rare', desc: '立即注入当前等级 55% 修为' },
    { key: 'rare_heal',   name: '碧玉灵丹', icon: '🌿', rarity: 'rare', desc: '立即恢复 105 生命并凝结 45 护盾' },
    { key: 'rare_temper', name: '精锻灵丹', icon: '⚗️', rarity: 'rare', desc: '普通材料 +4 并恢复 40 生命' }
  ],
  epic: [
    { key: 'epic_xp',     name: '元婴秘丹', icon: '💊', rarity: 'epic', desc: '立即注入当前等级 85% 修为并恢复 50 生命' },
    { key: 'epic_vital',  name: '固本玄丹', icon: '🌿', rarity: 'epic', desc: '永久最大生命 +35 并立即回复 130 生命与 60 护盾' },
    { key: 'epic_temper', name: '天工玄丹', icon: '⚗️', rarity: 'epic', desc: '普通材料 +6 并恢复 55 生命' }
  ],
  legend: [
    { key: 'legend_ascend', name: '仙元圣丹', icon: '🌟', rarity: 'legend', desc: '立即直升 1 整级修为 + 永久最大生命 +45 + 全额回复生命' },
    { key: 'legend_temper', name: '造化圣丹', icon: '⚗️', rarity: 'legend', desc: '普通材料 +9 + 永久最大生命 +25 并恢复 80 生命' }
  ]
};

