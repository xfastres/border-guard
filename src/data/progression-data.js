import BALANCE from './balance.js';

export const ELITE_AFFIXES = [
  { key:'sprint', name:'疾奔', col:'#ffaa44' },
  { key:'volley', name:'弹幕', col:'#d86cff' },
  { key:'shield', name:'灵盾', col:'#6ce2ff' },
  { key:'vortex', name:'引力', col:'#a46bff' }
];

/* ==================== STAGE 3: W20 SECOND MAJOR BREAKTHROUGH (DIRECTIONS, ENHANCEMENTS & BOSS AUX POOL) ==================== */
export const W20_BOSS_AUX_POOL = (BALANCE.w20Breakthrough?.bossAuxPool || []).slice();
export const W30_BOSS_AUX_POOL = (BALANCE.w30Boss?.auxPool || []).slice();

export const W20_DIRECTIONS = {
  fire_chain_surge: {
    key: 'fire_chain_surge',
    name: '聚焰连爆',
    icon: '🔥',
    elem: 'fire',
    tag: '火系 · 聚怪牵引 / 余烬传导',
    synergyNote: '与 W10 火标分支 + 1-2 槽火系词条装备共用火标与引爆链路',
    baseDesc: '每次触发【火标引爆】时先将周围 3.4 格非首领敌人向中心聚拢并补挂火标；即使仅有 1-2 槽普通火装也能获得 +1 次基础传递引爆（孤立精英/首领则转为 42% 衰减聚焦爆轰），三词条装传递上限再 +1！'
  },
  frost_bastion_counter: {
    key: 'frost_bastion_counter',
    name: '凛冬反制',
    icon: '❄️',
    elem: 'frost',
    tag: '冰系 · 冰盾蓄压 / 主动与受击冰环',
    synergyNote: '与 W10 冰缓分支 + 1-2 槽冰系词条装备共用减速与寒冰护盾链路',
    baseDesc: '寒冰护盾上限 +35，持盾期间每 1.6s 散发寒潮维持减速；即使仅有 1-2 槽普通冰装，持盾受击或主动冲刺（Space）即可释放【凛冬反制冰环】，三词条装主动冷却再减 0.35s 且冰环命中返还 +10 护盾！'
  },
  breaker_momentum: {
    key: 'breaker_momentum',
    name: '破阵蓄势',
    icon: '⚡',
    elem: 'thunder',
    tag: '通玄机动 · 冲刺破阵 / 跨系引动',
    synergyNote: '兼容任意流派，冲刺落点直接引动火标引爆或对减速目标凝结寒冰护盾',
    baseDesc: '冲刺冷却缩短 20%，每次冲刺落地释放 2.9 格【破阵震荡波】造成范围伤害并施加 3 秒易伤，同步引爆范围内已有火标或对减速目标凝结 +22 寒冰护盾！'
  }
};
export const W20_DIRECTION_KEYS = Object.keys(W20_DIRECTIONS);

// Each locked direction has 5 exclusive cards + 3 compatible shared cards = 8 valid candidates (strictly >= 2K+2 = 6 for K=2, even >= 8 for K=3)
export const W20_ENHANCEMENTS = {
  // ---- Fire Chain Surge (5 exclusive) ----
  w20_fire_supernova_chain: {
    key: 'w20_fire_supernova_chain',
    name: '炽链裂变',
    icon: '🌋',
    tag: '聚焰连爆 · 传递质变',
    behaviorTag: '传递 +2 次 + 落点留熔岩叠标',
    directions: ['fire_chain_surge'],
    shared: false,
    desc: '火标引爆最大传递次数再 +2、传递半径 +0.9 格，且每次传递引爆在落点留下 2.6 秒熔岩火池持续叠挂火标。'
  },
  w20_fire_isolated_exec: {
    key: 'w20_fire_isolated_exec',
    name: '孤星焚核',
    icon: '💥',
    tag: '聚焰连爆 · 单体破甲',
    behaviorTag: '孤立目标双段破甲聚焦炎爆',
    directions: ['fire_chain_surge'],
    shared: false,
    desc: '当引爆周围无可传递目标（孤立精英/首领）时，聚焦引爆升级为双段破甲炎爆（聚焦上限提至 145% 并施加 3.5 秒易伤）。'
  },
  w20_fire_dash_detonator: {
    key: 'w20_fire_dash_detonator',
    name: '焰径引信',
    icon: '☄️',
    tag: '聚焰连爆 · 主动走位引爆',
    behaviorTag: '冲刺挂 2 层火标 + 落点瞬爆',
    directions: ['fire_chain_surge'],
    shared: false,
    desc: '烈焰冲刺沿途对敌人直接施加 2 层火标，并在冲刺落点立即引爆 3.2 格内所有带火标目标。'
  },
  w20_fire_mark_vortex: {
    key: 'w20_fire_mark_vortex',
    name: '聚焰焚涡',
    icon: '🌪️',
    tag: '聚焰连爆 · 持续聚怪',
    behaviorTag: '引爆生成 2.2s 聚焰旋涡持续聚怪叠标',
    directions: ['fire_chain_surge'],
    shared: false,
    desc: '每次火标引爆后在爆点生成 2.2 秒【聚焰焚涡】，持续向中心牵引周围敌人并自动补充火标。'
  },
  w20_fire_ember_barrage: {
    key: 'w20_fire_ember_barrage',
    name: '余烬齐射',
    icon: '🎇',
    tag: '聚焰连爆 · 弹幕扩散',
    behaviorTag: '引爆发射 4 枚寻敌余烬弹续标',
    directions: ['fire_chain_surge'],
    shared: false,
    desc: '每次火标引爆时向外齐射 4 枚余烬火弹，命中敌人造成灼烧并立即补挂 1 层火标衔接下次连爆。'
  },

  // ---- Frost Bastion Counter (5 exclusive) ----
  w20_frost_dash_ring: {
    key: 'w20_frost_dash_ring',
    name: '踏霜主动环',
    icon: '❄️',
    tag: '凛冬反制 · 走位主动放环',
    behaviorTag: '主动冰环 CD→0.75s + 落点霜阵 +24 盾',
    directions: ['frost_bastion_counter'],
    shared: false,
    desc: '持盾冲刺触发的主动冰环冷却大幅缩至 0.75 秒，落点留下 2.8 秒霜冻法阵并立即补充 +24 寒冰护盾，走位避伤也能高频反制！'
  },
  w20_frost_overflow_nova: {
    key: 'w20_frost_overflow_nova',
    name: '满盾超载震',
    icon: '💠',
    tag: '凛冬反制 · 满盾主动爆发',
    behaviorTag: '满盾刷新放环 + 6 冰棱齐射 + 溢盾转伤',
    directions: ['frost_bastion_counter'],
    shared: false,
    desc: '护盾达到上限或刷新满盾时（无需三词条装）即可触发超载冰环，追加 6 枚穿透冰棱并将溢出护盾转化为额外爆发伤害。'
  },
  w20_frost_aegis_thorns: {
    key: 'w20_frost_aegis_thorns',
    name: '寒甲反噬',
    icon: '🛡️',
    tag: '凛冬反制 · 护盾反击',
    behaviorTag: '受击冰环 +35% 范围 + 3 穿透冰矛 +14 返盾',
    directions: ['frost_bastion_counter'],
    shared: false,
    desc: '寒冰护盾受击触发的反制冰环半径 +35%、冻结 +0.5 秒，同时齐射 3 根穿透冰矛并返还 +14 寒冰护盾。'
  },
  w20_frost_shatter_echo: {
    key: 'w20_frost_shatter_echo',
    name: '碎冰共振',
    icon: '🧊',
    tag: '凛冬反制 · 群体共振',
    behaviorTag: '冰环命中减速敌触发二次碎冰溅射',
    directions: ['frost_bastion_counter'],
    shared: false,
    desc: '反制冰环命中已减速/冰冻敌人时引发二次【碎冰共振】范围溅射，并刷新 65% 深度减速。'
  },
  w20_frost_pillar_ward: {
    key: 'w20_frost_pillar_ward',
    name: '玄冰护阵',
    icon: '🏛️',
    tag: '凛冬反制 · 控场回盾循环',
    behaviorTag: '每累计 40 盾展开 3.2s 玄冰法阵持续回盾',
    directions: ['frost_bastion_counter'],
    shared: false,
    desc: '每累计获得 40 点寒冰护盾，自动在脚下展开 3.2 秒【玄冰护阵】减速群敌并持续补盾，游走也能稳步叠满护盾。'
  },

  // ---- Breaker Momentum (5 exclusive) ----
  w20_brk_aftershock_dash: {
    key: 'w20_brk_aftershock_dash',
    name: '破阵二段震',
    icon: '⚡',
    tag: '破阵蓄势 · 延迟二段震荡',
    behaviorTag: '0.45s 后触发 3.8 格牵引二段余震',
    directions: ['breaker_momentum'],
    shared: false,
    desc: '冲刺破阵震荡波落地 0.45 秒后在原处引爆 3.8 格二段余震，向中心牵引非首领敌人并再次结算破甲伤害。'
  },
  w20_brk_state_resonance: {
    key: 'w20_brk_state_resonance',
    name: '万象共鸣破',
    icon: '🌀',
    tag: '破阵蓄势 · 双态挂标引动',
    behaviorTag: '破阵同时施加火标+减速并立即结算双联动',
    directions: ['breaker_momentum'],
    shared: false,
    desc: '破阵震荡波直接给范围内敌人同时施加【火标】与【寒霜减速】，随后立即触发火标引爆并凝结寒冰护盾。'
  },
  w20_brk_elite_hunter: {
    key: 'w20_brk_elite_hunter',
    name: '破甲斩首令',
    icon: '🎯',
    tag: '破阵蓄势 · 高危斩首',
    behaviorTag: '破阵命中精英/首领降天雷重劈并减冲刺 CD 1s',
    directions: ['breaker_momentum'],
    shared: false,
    desc: '破阵震荡波命中精英/首领或易伤目标时，额外降下一道破甲天雷重劈，并立即缩短 1.0 秒冲刺冷却。'
  },
  w20_brk_tempest_step: {
    key: 'w20_brk_tempest_step',
    name: '御风疾步',
    icon: '💨',
    tag: '破阵蓄势 · 频闪循环',
    behaviorTag: '引爆/冰环缩冲刺 CD 0.35s + 冲刺后齐射剑气',
    directions: ['breaker_momentum'],
    shared: false,
    desc: '每次触发火标引爆或冰环反制缩短冲刺冷却 0.35 秒，冲刺落地额外向最近敌人齐射 3 道穿透风刃。'
  },
  w20_brk_vanguard_aegis: {
    key: 'w20_brk_vanguard_aegis',
    name: '陷阵罡盾',
    icon: '🔰',
    tag: '破阵蓄势 · 护盾扩张',
    behaviorTag: '破阵按命中数凝结罡盾，持盾时震荡波范围 +30%',
    directions: ['breaker_momentum'],
    shared: false,
    desc: '破阵震荡波每命中 1 名敌人立即凝结 +12 寒冰罡盾；持盾状态下破阵震荡波范围扩大 30% 并释放微型寒环。'
  },

  // ---- Compatible Shared Enhancements (3 cards across all directions) ----
  w20_shared_tactical_surge: {
    key: 'w20_shared_tactical_surge',
    name: '迅捷身法·战技连携',
    icon: '⚡',
    tag: '通用机制 · 冲刺连携',
    behaviorTag: '冲刺 CD -25%，冲刺后首击必挂火标+减速并触发联动',
    directions: ['fire_chain_surge', 'frost_bastion_counter', 'breaker_momentum'],
    shared: true,
    desc: '冲刺冷却降低 25%；冲刺后 2.5 秒内的下一次领主命中必同时施加【火标 + 减速】，并立即触发对应引爆或寒冰护盾！'
  },
  w20_shared_boss_breaker: {
    key: 'w20_shared_boss_breaker',
    name: '孤影破壁',
    icon: '⚔️',
    tag: '通用机制 · 孤立强敌特化',
    behaviorTag: '孤立精英/首领吃引爆/冰环/破阵追加破甲真伤',
    directions: ['fire_chain_surge', 'frost_bastion_counter', 'breaker_momentum'],
    shared: true,
    desc: '当精英/首领周围 3.2 格内无其他敌人时，对其触发的火标引爆、冰环反制或破阵震荡额外追加破甲重击（3.5 秒易伤 + 额外爆发）。'
  },
  w20_shared_elemental_echo: {
    key: 'w20_shared_elemental_echo',
    name: '灵韵回响',
    icon: '✨',
    tag: '通用机制 · 周期全向回响',
    behaviorTag: '每 3 次引爆或 2 次冰环/破阵释放全向灵韵波',
    directions: ['fire_chain_surge', 'frost_bastion_counter', 'breaker_momentum'],
    shared: true,
    desc: '每累计触发 3 次火标引爆或 2 次冰环/破阵，自动在领主周围释放 3.6 格【灵韵回响波】，同时挂火标、减速并回复 +18 寒冰护盾。'
  }
};

export const ENEMY_SPECS = {
  slime:  { name:'荒野哥布林', ...BALANCE.enemies.slime, r:0.22, col:'#67cf5e', rim:'#2b6b28' },
  wolf:   { name:'疾风魔狼',   ...BALANCE.enemies.wolf, r:0.22, col:'#e89645', rim:'#784010', leaper:true },
  bomber: { name:'煞灵毒虫',   ...BALANCE.enemies.bomber, r:0.21, col:'#52ff9a', rim:'#146b3a', bomber:true },
  mage:   { name:'暗影弓巫',   ...BALANCE.enemies.mage, r:0.22, col:'#d466b8', rim:'#661b52', ranged:true, range:5.8 },
  shaman: { name:'妖火祭司',   ...BALANCE.enemies.shaman, r:0.26, col:'#ff9f43', rim:'#6e2c00', shaman:true, range:4.8 },
  brute:  { name:'铁甲兽人',   ...BALANCE.enemies.brute, r:0.29, col:'#7e94a8', rim:'#2d3c4a', charger:true },
  elite:  { name:'紫炎统领(精英)', ...BALANCE.enemies.elite, r:0.36, col:'#b966ff', rim:'#fff0a8', elite:true },
  totem:  { name:'天劫护盾图腾', ...(BALANCE.enemies.totem || { hp: 920, spd: 0.01, dmg: 0, xp: 10, gold: 6 }), r:0.42, col:'#6ce2ff', rim:'#ffe678', totem:true },
  pillar: { name:'深渊护界晶柱', ...(BALANCE.enemies.pillar || { hp: 2600, spd: 0.01, dmg: 0, xp: 12, gold: 8 }), r:0.46, col:'#ff78d4', rim:'#ffe88a', pillar:true },
  void_guard: { name:'暗潮近卫', ...(BALANCE.enemies.void_guard || { hp: 2400, spd: 2.05, dmg: 26, xp: 14, gold: 8 }), r:0.32, col:'#9c6dff', rim:'#ff98cc', voidGuard:true },
  boss1:  { name:'熔岩巨魔(W5首领)', ...BALANCE.enemies.boss1, r:0.52, col:'#ff5638', rim:'#ffe074', boss:true },
  boss2:  { name:'暗影死灵王(W10一破首领)',...BALANCE.enemies.boss2, r:0.54, col:'#a855ff', rim:'#ffe074', boss:true },
  boss3:  { name:'毁灭泰坦(W15首领)', ...BALANCE.enemies.boss3, r:0.60, col:'#ff334b', rim:'#fff3a0', boss:true },
  boss4:  { name:'天劫魔尊(W20二破首领)',...BALANCE.enemies.boss4, r:0.62, col:'#ff2e7a', rim:'#ffe678', boss:true },
  boss5:  { name:'玄冥妖皇(W25首领)',...(BALANCE.enemies.boss5 || BALANCE.enemies.boss4), r:0.64, col:'#d84cff', rim:'#ffe678', boss:true },
  boss6:  { name:'深渊主宰(W30终局首领)',...(BALANCE.enemies.boss6 || BALANCE.enemies.boss4), r:0.70, col:'#ff1e42', rim:'#fff09c', boss:true }
};

