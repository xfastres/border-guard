import BALANCE from './balance.js';

/* 6 Equipment Sets (2-piece & 3-piece bonuses) + 5 Dual-Element Resonances */
export const GEAR_SETS = {
  sword:   { key:'sword',   name:'剑影套', icon:'⚔️', col:'#72f2b4', d2:'暴击 +12%，移动每 1.6s 迸射 2 道穿云剑气', d3:'暴击 +20%，迸射 3 道穿云剑气且减速 25%' },
  flame:   { key:'flame',   name:'烈阳套', icon:'☀️', col:'#ff7b47', d2:'火/爆伤 +25%，暴击灼烧敌触发 1.6格 赤焰爆轰', d3:'火/爆伤 +40%，赤焰爆轰范围扩至 2.2格' },
  frost:   { key:'frost',   name:'玄冥套', icon:'❄️', col:'#6ce2ff', d2:'对减速敌伤 +20%，命中 22% 凝结 +10 护盾(上限60)', d3:'对减速敌伤 +35%，凝盾率 35% 且碎盾冰封周围 1s' },
  thunder: { key:'thunder', name:'紫雷套', icon:'⚡', col:'#c68cff', d2:'闪电链每跳增伤 +12%(不衰减)，冲刺终点劈 3连紫雷', d3:'闪电链弹射 +1，冲刺起终点各劈 4连紫雷' },
  blood:   { key:'blood',   name:'血煞套', icon:'🩸', col:'#ff5c7a', d2:'吸血上限 +45%，击杀精英/Boss永久 +12血上限与 +3%全伤(10层)', d3:'吸血上限 +80%，半血下受击减伤 22%' },
  greed:   { key:'greed',   name:'天财套', icon:'💰', col:'#ffe478', d2:'每持40金攻速+4%/移速+3%(上限+28%)，过波+12金', d3:'上限升至 +45%，构装叠星倍率额外 +15%' }
};

export const DUAL_RESONANCES = [
  { key:'wind_fire',     name:'风助火势', icons:'🌪️+🔥', req:['wind','fire'],    col:'#ff9a52', desc:'爆炸/焦土半径 +28%，风系弹道附加灼烧并 35% 爆 30% 火伤' },
  { key:'frost_thunder', name:'冰雷激荡', icons:'❄️+⚡', req:['frost','thunder'],col:'#9ce4ff', desc:'雷击减速/冰冻敌炸开 1.65格 冰雷新星并施加易伤' },
  { key:'fire_thunder',  name:'雷火天劫', icons:'🔥+⚡', req:['fire','thunder'], col:'#ff70c8', desc:'主印爆发时额外对最高血敌劈落 75% 伤赤雷并灼烧' },
  { key:'wind_frost',    name:'霜风凛冽', icons:'🌪️+❄️', req:['wind','frost'],   col:'#84ffd8', desc:'移速 +15%，身周 3.4格 内敌人受凛风压制减速 22%' },
  { key:'holy_omni',     name:'圣耀万法', icons:'✨+☯️', req:['holy','_any'],    col:'#ffe478', desc:'主印触发叠 +6 圣光盾(上限75)，全暴击伤害 +25%' }
];

/* 4-Tier Equipment Pool (5 Common / 5 Rare / 9 Epic / 4 Legend-Curse = 23 Gears, each with elem & set!) */
export const GEARS = {
  smolder_edge: {"key": "smolder_edge", "name": "余烬短刃", "icon": "◈", "rarity": "common", "elem": "fire", "set": "flame", "desc": "火标触发率 32%。适合在早期先挂标。", "mod": {"fireMarkChance": 0.32, "dmgPct": 0.07}},
  ember_focus: {"key": "ember_focus", "name": "焚芯石", "icon": "◈", "rarity": "epic", "elem": "fire", "set": "flame", "desc": "提升引爆伤害，射程减小。适合在近处控制爆炸落点。", "mod": {"fireDetonateBonus": 0.25, "rangePct": -0.08}},
  ice_lantern: {"key": "ice_lantern", "name": "凝霜引灯", "icon": "❄", "rarity": "common", "elem": "frost", "set": "frost", "desc": "命中减速并扩大寒盾容量。", "mod": {"slowOnHit": 0.22, "frostShieldCapBonus": 15}},
  white_jade_guard: {"key": "white_jade_guard", "name": "白玉护心", "icon": "❄", "rarity": "epic", "elem": "frost", "set": "frost", "desc": "提高寒盾上限与持盾伤害，盾破时收益下降。", "mod": {"frostShieldCapBonus": 38, "shieldedDmgPct": 0.25}},
  reed_sword: {"key": "reed_sword", "name": "芦叶短剑", "icon": "◇", "rarity": "common", "elem": "wind", "set": "sword", "desc": "冲刺后首个风系命中可斩出穿透回锋。", "mod": {"windFlow": 0.2, "rangePct": 0.08}},
  windcord: {"key": "windcord", "name": "穿云束带", "icon": "◇", "rarity": "rare", "elem": "wind", "set": "sword", "desc": "强化回锋与移速，擅长绕到怪群侧面。", "mod": {"windFlow": 0.33, "movePct": 0.11}},
  trailing_edge: {"key": "trailing_edge", "name": "逐影古剑", "icon": "◇", "rarity": "epic", "elem": "wind", "set": "sword", "desc": "以少量生命换取更长的剑路与更重的回锋。", "mod": {"windFlow": 0.45, "hpPct": -0.09, "rangePct": 0.18}, "unlockPack": "pack_gear_duel"},
  copper_needle: {"key": "copper_needle", "name": "导雷铜针", "icon": "ϟ", "rarity": "common", "elem": "thunder", "set": "thunder", "desc": "雷击开始在同一目标积攒电荷，充满时释放过载。", "mod": {"stormLoad": 0.2, "aspd": 0.07}},
  lightning_rod: {"key": "lightning_rod", "name": "引霆杖", "icon": "ϟ", "rarity": "rare", "elem": "thunder", "set": "thunder", "desc": "强化电荷过载，延伸雷击搜索距离。", "mod": {"stormLoad": 0.34, "rangePct": 0.11}},
  circuit_mirror: {"key": "circuit_mirror", "name": "九转电镜", "icon": "ϟ", "rarity": "epic", "elem": "thunder", "set": "thunder", "desc": "提高过载爆发，代价是攻速略慢。", "mod": {"stormLoad": 0.43, "aspd": -0.07, "dmgPct": 0.24}},
  shatter_maul: {"key": "shatter_maul", "name": "锻骨槌", "icon": "ϟ", "rarity": "rare", "elem": "thunder", "set": "blood", "desc": "提高重击全伤与最大生命，移动略慢。", "mod": {"dmgPct": 0.29, "flatHp": 24, "movePct": -0.07}},
  blood_cord: {"key": "blood_cord", "name": "血纹束绳", "icon": "◈", "rarity": "common", "elem": "fire", "set": "blood", "desc": "开超载时少量耗血。贴近有效命中，以血刃回收消耗。", "mod": {"bloodRite": 0.17, "flatHp": 22}},
  scarlet_bracer: {"key": "scarlet_bracer", "name": "赤脉护臂", "icon": "◈", "rarity": "rare", "elem": "fire", "set": "blood", "desc": "提高血刃伤害与有效命中的少量吸血。", "mod": {"bloodRite": 0.25, "lifesteal": 1.7}},
  bloodseal_disc: {"key": "bloodseal_disc", "name": "还魂血璧", "icon": "◈", "rarity": "epic", "elem": "fire", "set": "blood", "desc": "提高血刃与吸血，牺牲一点最大生命。", "mod": {"bloodRite": 0.41, "lifesteal": 2.3, "hpPct": -0.08}},
  sunward_charm: {"key": "sunward_charm", "name": "日曜坠", "icon": "☼", "rarity": "common", "elem": "holy", "set": "greed", "desc": "护盾充足时，圣击可消耗护盾裁决。", "mod": {"holyOath": 0.16, "flatHp": 18}},
  dawn_mirror: {"key": "dawn_mirror", "name": "晨曦盘", "icon": "☼", "rarity": "rare", "elem": "holy", "set": "greed", "desc": "圣符更易维持护盾，提高裁决爆发。", "mod": {"holyOath": 0.31, "rangePct": 0.08}},
  litany_mail: {"key": "litany_mail", "name": "誓光甲", "icon": "☼", "rarity": "epic", "elem": "holy", "set": "greed", "desc": "强化护盾裁决并减伤，换位较慢。", "mod": {"holyOath": 0.45, "dmgReduce": 0.08, "movePct": -0.06}, "unlockPack": "pack_gear_duel"},
  // Tier 1: Common (凡品 · 绿)
  bronze_tassel:   { key:'bronze_tassel',   name:'青铜剑穗', icon:'🎐', rarity:'common', elem:'wind',    set:'sword',   desc:'【凡器】攻击速度 +14%，全伤害 +8%', mod:{ aspd:0.14, dmgPct:0.08 } },
  jade_pendant:    { key:'jade_pendant',    name:'引灵玉佩', icon:'📿', rarity:'common', elem:'frost',   set:'frost',   desc:'【凡器】神通范围与磁铁 +22%，移速 +8%', mod:{ rangePct:0.22, movePct:0.08 } },
  wood_talisman:   { key:'wood_talisman',   name:'辟邪木符', icon:'🪵', rarity:'common', elem:'holy',    set:'blood',   desc:'【凡器】最大生命 +45，全伤害 +8%', mod:{ flatHp:45, dmgPct:0.08 } },
  iron_whetstone:  { key:'iron_whetstone',  name:'玄铁磨石', icon:'🪨', rarity:'common', elem:'thunder', set:'thunder', desc:'【凡器】暴击率 +10%，全伤害 +10%', mod:{ crit:0.10, dmgPct:0.10 } },
  swift_boots:     { key:'swift_boots',     name:'踏风草靴', icon:'🥾', rarity:'common', elem:'wind',    set:'sword',   desc:'【凡器】移速 +14%，攻速 +10%', mod:{ movePct:0.14, aspd:0.10 } },
  // Tier 2: Rare (灵品 · 蓝)
  flame_fan:       { key:'flame_fan',       name:'离火羽扇', icon:'◇', rarity:'rare',   elem:'fire',    set:'flame',   desc:'【灵器】爆炸溅射 +0.65格，全伤害 +18%', mod:{ splashBonus:0.65, dmgPct:0.18 } },
  thunder_wood:    { key:'thunder_wood',    name:'雷击桃木', icon:'🌩️', rarity:'rare',   elem:'thunder', set:'thunder', desc:'【灵器】命中 22% 触发连锁雷，暴击率 +10%', mod:{ chainProc:0.22, crit:0.10 } },
  frost_mirror:    { key:'frost_mirror',    name:'寒冰护镜', icon:'🪞', rarity:'rare',   elem:'frost',   set:'frost',   desc:'【灵器】攻击减速敌人 25%，最大生命 +55', mod:{ slowOnHit:0.25, flatHp:55 } },
  blood_bead:      { key:'blood_bead',      name:'嗜血念珠', icon:'🧿', rarity:'rare',   elem:'fire',    set:'blood',   desc:'【灵器】攻击回血 +1.8，全伤害 +14%', mod:{ lifesteal:1.8, dmgPct:0.14 } },
  coin_pouch:      { key:'coin_pouch',      name:'聚宝钱袋', icon:'💰', rarity:'rare',   elem:'holy',    set:'greed',   desc:'【灵器】击杀额外 +1 金币，全伤害 +15%', mod:{ bonusGold:1, dmgPct:0.15 } },
  // Tier 3: Epic (史诗 · 紫)
  split_bow:       { key:'split_bow',       name:'分裂魔弓', icon:'🏹', rarity:'epic',   elem:'wind',    set:'sword',   desc:'【史诗】灵印与剑波额外 +1 弹道，全伤害 +10%', mod:{ extraShot:1, dmgPct:0.10 } },
  crit_axe:        { key:'crit_axe',        name:'狂暴战斧', icon:'🪓', rarity:'epic',   elem:'fire',    set:'flame',   desc:'【史诗】暴击率 +20%，暴击伤害 +45%', mod:{ crit:0.20, critDmg:0.45 } },
  haste_glass:     { key:'haste_glass',     name:'疾速沙漏', icon:'⏳', rarity:'epic',   elem:'thunder', set:'thunder', desc:'【史诗】攻击速度 +30%，冲刺冷却缩短', mod:{ aspd:0.30 } },
  burn_core:       { key:'burn_core',       name:'熔核魔石', icon:'🌋', rarity:'epic',   elem:'fire',    set:'flame',   desc:'【史诗】爆炸溅射 +0.95格，全伤害 +16%', mod:{ splashBonus:0.95, dmgPct:0.16 } },
  frost_orb:       { key:'frost_orb',       name:'极寒宝珠', icon:'🔮', rarity:'epic',   elem:'frost',   set:'frost',   desc:'【史诗】攻击减速敌人 35%，全伤害 +15%', mod:{ slowOnHit:0.35, dmgPct:0.15 } },
  volt_crest:      { key:'volt_crest',      name:'雷神徽章', icon:'⚡', rarity:'epic',   elem:'thunder', set:'thunder', desc:'【史诗】命中 32% 几率触发连锁闪电，全伤害 +12%', mod:{ chainProc:0.32, dmgPct:0.12 } },
  vamp_fang:       { key:'vamp_fang',       name:'嗜血魔刃', icon:'🩸', rarity:'epic',   elem:'fire',    set:'blood',   desc:'【史诗】攻击回血 +2.5，全伤害 +22%', mod:{ lifesteal:2.5, dmgPct:0.22 } },
  eagle_scope:     { key:'eagle_scope',     name:'鹰眼望远镜',icon:'🎯', rarity:'epic',  elem:'wind',    set:'sword',   desc:'【史诗】法宝射程与神通范围 +28%，全伤害 +18%', mod:{ rangePct:0.28, dmgPct:0.18 } },
  greed_cup:       { key:'greed_cup',       name:'贪婪圣杯', icon:'🏆', rarity:'epic',   elem:'holy',    set:'greed',   desc:'【史诗】击杀额外 +2 金币，全伤害 +18%', mod:{ bonusGold:2, dmgPct:0.18 } },
  // Tier 4: Legend & Cursed Relics (传说/凶器 · 橙)
  titan_crown:     { key:'titan_crown',     name:'泰坦王冠', icon:'👑', rarity:'legend', elem:'holy',    set:'greed',   desc:'【传说神器】全伤害 +65%、攻速 +25%、暴击 +18%、射程 +18%！', mod:{ dmgPct:0.65, aspd:0.25, crit:0.18, rangePct:0.18 } },
  asura_blood:     { key:'asura_blood',     name:'修罗血玉', icon:'🩸', rarity:'legend', elem:'thunder', set:'blood',   desc:'【传说凶器】全伤害 +90%、暴伤 +60%，但最大生命 -20%！', mod:{ dmgPct:0.90, critDmg:0.60, hpPct:-0.20 } },
  heavy_greatsword:{ key:'heavy_greatsword',name:'乾坤重剑', icon:'🗡️', rarity:'legend', elem:'fire',    set:'flame',   desc:'【传说凶器】全伤害 +75%、范围 +35%，但攻速 -15%！', mod:{ dmgPct:0.75, rangePct:0.35, aspd:-0.15 } },
  seal_astrolabe:  { key:'seal_astrolabe',  name:'万象星盘', icon:'🧭', rarity:'legend', elem:'frost',   set:'frost',   desc:'【传说仙器】额外弹道 +1、全伤害 +45%、攻速 +22%、范围 +25%！', mod:{ extraShot:1, dmgPct:0.45, aspd:0.22, rangePct:0.25 } },
  // Stage 6 Horizontal Unlock Pack [pack_gear_ember_frost] (enters active run pool via anti-dilution swap!)
  ember_censer:    { key:'ember_censer',    name:'赤焰熏炉', icon:'🏺', rarity:'rare',   elem:'fire',    set:'flame',   unlockPack:'pack_gear_ember_frost', desc:'【传承奇器】爆炸溅射 +0.55格，移速 +8%，全伤害 +12%', mod:{ splashBonus:0.55, movePct:0.08, dmgPct:0.12 } },
  glacier_bell:    { key:'glacier_bell',    name:'玄霜玉铃', icon:'🔔', rarity:'rare',   elem:'frost',   set:'frost',   unlockPack:'pack_gear_ember_frost', desc:'【传承奇器】攻击减速 28%，攻速 +12%，最大生命 +40', mod:{ slowOnHit:0.28, aspd:0.12, flatHp:40 } }
};
export const GEAR_KEYS = Object.keys(GEARS);
export const BASE_GEAR_KEYS = GEAR_KEYS.filter(k => !GEARS[k].unlockPack);
export const GEAR_RARITY_LABELS = { common:'凡品', rare:'灵品', epic:'史诗', legend:'传说' };
export const GEAR_RARITY_COLORS = { common:'#72f2b4', rare:'#5cc8ff', epic:'#c68cff', legend:'#ffbe4f' };
export const GEAR_SALVAGE_GOLD = BALANCE.equipment?.recycle?.sellGoldBase || { common:10, rare:16, epic:26, legend:42 };
export const SOURCE_STAGES = BALANCE.equipment?.sourceStages || [
  { stage: 1, minWave: 1,  maxWave: 10, label: '阶段1(W1-10)',  baseStatMult: 1.00, sellMult: 1.00, dismantleMult: 1.0 },
  { stage: 2, minWave: 11, maxWave: 20, label: '阶段2(W11-20)', baseStatMult: 1.18, sellMult: 1.40, dismantleMult: 1.5 },
  { stage: 3, minWave: 21, maxWave: 30, label: '阶段3(W21-30)', baseStatMult: 1.38, sellMult: 1.85, dismantleMult: 2.0 }
];
export const GEAR_MAX_STAR = 3;
export const GEAR_STAR_MULT = [1, 1.6, 2.3]; // Kept exported for backward compatibility; Stage 2 uses enhanceLv + sourceStage!


/* ==================== STAGE 2: AFFIX POOL, CONFLICT GROUPS & DUO/TRIO SYNERGIES ==================== */
export const GEAR_AFFIXES = {
  wind_edge: {
    id: 'wind_edge', name: '风刃入鞘', icon: '◇', elem: 'wind', chain: 'wind_flow', rarity: 'common', conflictGroup: null,
    desc: (t = 1) => `冲刺后的首次风系命中可斩出回锋。 机制威力 +${Math.round((0.12 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ windFlow: 0.12 + (t - 1) * 0.025 })
  },
  wind_relay: {
    id: 'wind_relay', name: '借风串刃', icon: '◇', elem: 'wind', chain: 'wind_flow', rarity: 'rare', conflictGroup: null,
    desc: (t = 1) => `回锋强化，额外获得 5% 移速。 机制威力 +${Math.round((0.15 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ windFlow: 0.15 + (t - 1) * 0.025, movePct: 0.05 })
  },
  wind_pin: {
    id: 'wind_pin', name: '回锋罡护', icon: '◇', elem: 'wind', chain: 'wind_flow', rarity: 'epic', conflictGroup: null,
    desc: (t = 1) => `回锋强化，补齐三词条后回锋返还护盾。 机制威力 +${Math.round((0.19 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ windFlow: 0.19 + (t - 1) * 0.025 })
  },
  storm_charge: {
    id: 'storm_charge', name: '蓄电子母', icon: '◇', elem: 'thunder', chain: 'storm_circuit', rarity: 'common', conflictGroup: null,
    desc: (t = 1) => `雷击叠电荷。同一目标满荷时释放过载。 机制威力 +${Math.round((0.12 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ stormLoad: 0.12 + (t - 1) * 0.025 })
  },
  storm_return: {
    id: 'storm_return', name: '引雷折回', icon: '◇', elem: 'thunder', chain: 'storm_circuit', rarity: 'rare', conflictGroup: null,
    desc: (t = 1) => `提高过载爆发，并额外获得 6% 范围。 机制威力 +${Math.round((0.15 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ stormLoad: 0.15 + (t - 1) * 0.025, rangePct: 0.06 })
  },
  storm_fork: {
    id: 'storm_fork', name: '九节导体', icon: '◇', elem: 'thunder', chain: 'storm_circuit', rarity: 'epic', conflictGroup: null,
    desc: (t = 1) => `增强过载。完整联动需要的电荷减少一格。 机制威力 +${Math.round((0.19 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ stormLoad: 0.19 + (t - 1) * 0.025 })
  },
  blood_reserve: {
    id: 'blood_reserve', name: '赤契血刃', icon: '◇', elem: 'fire', chain: 'blood_rite', rarity: 'common', conflictGroup: null,
    desc: (t = 1) => `超载可以支付生命。贴近有效命中用血刃回收代价。 机制威力 +${Math.round((0.12 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ bloodRite: 0.12 + (t - 1) * 0.025 })
  },
  blood_leech: {
    id: 'blood_leech', name: '逆脉余锋', icon: '◇', elem: 'fire', chain: 'blood_rite', rarity: 'rare', conflictGroup: null,
    desc: (t = 1) => `增强血刃，有效攻击额外少量吸血。 机制威力 +${Math.round((0.15 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ bloodRite: 0.15 + (t - 1) * 0.025, lifesteal: 1.0 })
  },
  blood_debt: {
    id: 'blood_debt', name: '回元血符', icon: '◇', elem: 'fire', chain: 'blood_rite', rarity: 'epic', conflictGroup: null,
    desc: (t = 1) => `增强血刃。完整联动提高每次命中的生命回收上限。 机制威力 +${Math.round((0.19 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ bloodRite: 0.19 + (t - 1) * 0.025 })
  },
  holy_oath: {
    id: 'holy_oath', name: '启曜之誓', icon: '◇', elem: 'holy', chain: 'holy_oath', rarity: 'common', conflictGroup: null,
    desc: (t = 1) => `持盾时，圣击可消耗护盾施放裁决。 机制威力 +${Math.round((0.12 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ holyOath: 0.12 + (t - 1) * 0.025 })
  },
  holy_light: {
    id: 'holy_light', name: '晨光护印', icon: '◇', elem: 'holy', chain: 'holy_oath', rarity: 'rare', conflictGroup: null,
    desc: (t = 1) => `强化照击产生的护盾和裁决。 机制威力 +${Math.round((0.15 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ holyOath: 0.15 + (t - 1) * 0.025 })
  },
  holy_judgment: {
    id: 'holy_judgment', name: '断隙圣文', icon: '◇', elem: 'holy', chain: 'holy_oath', rarity: 'epic', conflictGroup: null,
    desc: (t = 1) => `增强裁决。完整联动打中多个目标时返还部分护盾。 机制威力 +${Math.round((0.19 + (t - 1) * 0.025) * 100)}%。`,
    mod: (t = 1) => ({ holyOath: 0.19 + (t - 1) * 0.025 })
  },
  // Fire Detonation Chain (火系引爆链路)
  fire_brand: {
    id:'fire_brand', name:'炽炎烙印', icon:'🔥', elem:'fire', chain:'fire_detonate', rarity:'common', conflictGroup:null,
    desc: (t = 1) => `攻击命中 ${Math.min(95, 50 + (t - 1) * 8)}% 施加【火标】，火/爆伤 +${8 + (t - 1) * 3}%`,
    mod: (t = 1) => ({ fireMarkChance: Math.min(0.95, 0.50 + (t - 1) * 0.08), fireDmgPct: 0.08 + (t - 1) * 0.03 })
  },
  fire_burst: {
    id:'fire_burst', name:'爆燃核心', icon:'💥', elem:'fire', chain:'fire_detonate', rarity:'rare', conflictGroup:null,
    desc: (t = 1) => `爆炸/溅射范围 +${(0.35 + (t - 1) * 0.08).toFixed(2)}格，引爆倍率 +${15 + (t - 1) * 5}%`,
    mod: (t = 1) => ({ splashBonus: 0.35 + (t - 1) * 0.08, fireDetonateBonus: 0.15 + (t - 1) * 0.05 })
  },
  fire_chain: {
    id:'fire_chain', name:'余烬连环', icon:'🌋', elem:'fire', chain:'fire_detonate', rarity:'epic', conflictGroup:null,
    desc: (t = 1) => `对【火标】或灼烧敌伤 +${12 + (t - 1) * 4}%，击杀灼烧敌回血 +${2 + (t - 1)}`,
    mod: (t = 1) => ({ markedDmgPct: 0.12 + (t - 1) * 0.04, burnKillHeal: 2 + (t - 1) })
  },

  // Frost Aegis Chain (冰系护体链路)
  frost_chill: {
    id:'frost_chill', name:'寒霜侵骨', icon:'❄️', elem:'frost', chain:'frost_aegis', rarity:'common', conflictGroup:null,
    desc: (t = 1) => `攻击附带 ${Math.min(60, 22 + (t - 1) * 4)}% 减速，对减速敌伤 +${8 + (t - 1) * 3}%`,
    mod: (t = 1) => ({ slowOnHit: Math.min(0.60, 0.22 + (t - 1) * 0.04), chilledDmgPct: 0.08 + (t - 1) * 0.03 })
  },
  frost_ward: {
    id:'frost_ward', name:'凝冰护心', icon:'🛡️', elem:'frost', chain:'frost_aegis', rarity:'rare', conflictGroup:null,
    desc: (t = 1) => `最大生命 +${28 + (t - 1) * 10}，寒冰护盾上限 +${25 + (t - 1) * 8}`,
    mod: (t = 1) => ({ flatHp: 28 + (t - 1) * 10, frostShieldCapBonus: 25 + (t - 1) * 8 })
  },
  frost_nova_counter: {
    id:'frost_nova_counter', name:'凛冬反震', icon:'💠', elem:'frost', chain:'frost_aegis', rarity:'epic', conflictGroup:null,
    desc: (t = 1) => `有盾时全伤 +${10 + (t - 1) * 4}%、移速 +${6 + (t - 1) * 2}%`,
    mod: (t = 1) => ({ shieldedDmgPct: 0.10 + (t - 1) * 0.04, shieldedMovePct: 0.06 + (t - 1) * 0.02 })
  },

  // General Thunder / Wind / Crit / Defense / Sustain (with explicit conflict groups!)
  thunder_spark: {
    id:'thunder_spark', name:'紫电弧光', icon:'⚡', elem:'thunder', chain:'general', rarity:'rare', conflictGroup:'proc_style',
    desc: (t = 1) => `命中 ${Math.min(45, 14 + (t - 1) * 3)}% 触发 2 目标连锁雷【与疾风迅影互斥】`,
    mod: (t = 1) => ({ chainProc: Math.min(0.45, 0.14 + (t - 1) * 0.03) })
  },
  wind_tempest: {
    id:'wind_tempest', name:'疾风迅影', icon:'🌪️', elem:'wind', chain:'general', rarity:'common', conflictGroup:'proc_style',
    desc: (t = 1) => `攻速 +${10 + (t - 1) * 3}%，移速 +${6 + (t - 1) * 2}%【与紫电弧光互斥】`,
    mod: (t = 1) => ({ aspd: 0.10 + (t - 1) * 0.03, movePct: 0.06 + (t - 1) * 0.02 })
  },
  fury_crit: {
    id:'fury_crit', name:'破军锐锋', icon:'🎯', elem:'holy', chain:'general', rarity:'rare', conflictGroup:'crit_stance',
    desc: (t = 1) => `暴击率 +${7 + (t - 1) * 2}%，暴击伤害 +${14 + (t - 1) * 5}%【与磐石守御互斥】`,
    mod: (t = 1) => ({ crit: 0.07 + (t - 1) * 0.02, critDmg: 0.14 + (t - 1) * 0.05 })
  },
  iron_bastion: {
    id:'iron_bastion', name:'磐石守御', icon:'🪨', elem:'holy', chain:'general', rarity:'common', conflictGroup:'crit_stance',
    desc: (t = 1) => `最大生命 +${36 + (t - 1) * 12}，受击减伤 +${5 + (t - 1) * 2}%【与破军锐锋互斥】`,
    mod: (t = 1) => ({ flatHp: 36 + (t - 1) * 12, dmgReduce: Math.min(0.22, 0.05 + (t - 1) * 0.02) })
  },
  vamp_siphon: {
    id:'vamp_siphon', name:'血脉汲取', icon:'🩸', elem:'fire', chain:'general', rarity:'common', conflictGroup:null,
    desc: (t = 1) => `攻击回血 +${(1.2 + (t - 1) * 0.4).toFixed(1)}，全伤害 +${6 + (t - 1) * 2}%`,
    mod: (t = 1) => ({ lifesteal: 1.2 + (t - 1) * 0.4, dmgPct: 0.06 + (t - 1) * 0.02 })
  },
  fortune_mint: {
    id:'fortune_mint', name:'聚财铭文', icon:'💰', elem:'holy', chain:'general', rarity:'rare', conflictGroup:null,
    desc: (t = 1) => `全伤害 +${7 + (t - 1) * 2.5}%，击杀额外 +${1 + Math.floor((t - 1) / 3)} 金币几率`,
    mod: (t = 1) => ({ dmgPct: 0.07 + (t - 1) * 0.025, bonusGoldChance: Math.min(0.6, 0.22 + (t - 1) * 0.06) })
  },
  // Stage 6 Horizontal Unlock Pack [pack_affix_tactics] (enters active affix pool with fixed 12-item anti-dilution cap!)
  storm_conduit: {
    id:'storm_conduit', name:'引雷导流', icon:'🌩️', elem:'thunder', chain:'general', rarity:'rare', conflictGroup:'proc_style', unlockPack:'pack_affix_tactics',
    desc: (t = 1) => `【传承词条】连锁雷触发 +${12 + (t - 1) * 3}%，全伤害 +${6 + (t - 1) * 2}%【同 proc_style 互斥】`,
    mod: (t = 1) => ({ chainProc: Math.min(0.42, 0.12 + (t - 1) * 0.03), dmgPct: 0.06 + (t - 1) * 0.02 })
  },
  aegis_pulse: {
    id:'aegis_pulse', name:'镇岳灵脉冲', icon:'💠', elem:'holy', chain:'general', rarity:'rare', conflictGroup:'crit_stance', unlockPack:'pack_affix_tactics',
    desc: (t = 1) => `【传承词条】寒盾上限 +${20 + (t - 1) * 6}，移速 +${5 + (t - 1) * 2}%，受击减伤 +${4 + (t - 1)}%【同 crit_stance 互斥】`,
    mod: (t = 1) => ({ frostShieldCapBonus: 20 + (t - 1) * 6, movePct: 0.05 + (t - 1) * 0.02, dmgReduce: Math.min(0.18, 0.04 + (t - 1) * 0.01) })
  }
};
export const GEAR_AFFIX_KEYS = Object.keys(GEAR_AFFIXES);
export const BASE_AFFIX_KEYS = GEAR_AFFIX_KEYS.filter(id => !GEAR_AFFIXES[id].unlockPack);

export const BUILD_AFFIX_CHAINS = [["wind_flow", "御风回锋", ["wind_edge", "wind_relay", "wind_pin"]], ["storm_circuit", "蓄雷回路", ["storm_charge", "storm_return", "storm_fork"]], ["blood_rite", "血契回锋", ["blood_reserve", "blood_leech", "blood_debt"]], ["holy_oath", "持盾裁决", ["holy_oath", "holy_light", "holy_judgment"]]];

const BUILD_GEAR_SYNERGIES = BUILD_AFFIX_CHAINS.flatMap(([chain, name, req]) => [
  {
    id: `${chain}_duo`, chain, tier: 2, priority: 20, req: req.slice(0, 2),
    name, icon: '◇', badgeClass: 'duo', short: '双词条联动',
    desc: '由对应的有效攻击或主动操作触发，详见各词条。',
  },
  {
    id: `${chain}_trio`, chain, tier: 3, priority: 100, req,
    name: `${name}·圆满`, icon: '◇', badgeClass: 'trio', short: '完整三联动',
    desc: '替代同系双联动，追加第三条词条描述的效果，机制伤害进一步提高。',
  },
]);

export const GEAR_SYNERGIES = [
  ...BUILD_GEAR_SYNERGIES,
  // Fire Detonation Chain: Trio strictly replaces all Fire Duos!
  {
    id:'fire_detonate_trio', chain:'fire_detonate', tier:3, priority:100, conflictGroup:'fire_chain_duo',
    req:['fire_brand', 'fire_burst', 'fire_chain'],
    name:'炽炎连环引爆', icon:'🔥💥', badgeClass:'trio',
    short:'完整三联动 · 替代双联动',
    desc:'命中【火标】目标触发首次爆燃后，最多向周围 2 名带标敌人有限传递引爆；若周围无其他带标目标（孤立精英/Boss），剩余传递转为有上限衰减聚焦引爆！'
  },
  {
    id:'fire_detonate_duo', chain:'fire_detonate', tier:2, priority:20, conflictGroup:'fire_chain_duo',
    req:['fire_brand', 'fire_burst'],
    name:'焚标引爆', icon:'🔥', badgeClass:'duo',
    short:'双词条联动',
    desc:'火系攻击/技能给敌人挂【火标】，命中已带【火标】目标时触发一次范围引爆！'
  },
  {
    id:'fire_ember_duo', chain:'fire_detonate', tier:2, priority:15, conflictGroup:'fire_chain_duo',
    req:['fire_brand', 'fire_chain'],
    name:'余烬焚标', icon:'🔥', badgeClass:'duo',
    short:'双词条联动',
    desc:'火系攻击/技能给敌人挂【火标】，命中已带【火标】目标时触发一次范围引爆！'
  },
  {
    id:'fire_blast_duo', chain:'fire_detonate', tier:2, priority:10, conflictGroup:'fire_chain_duo',
    req:['fire_burst', 'fire_chain'],
    name:'爆燃余烬', icon:'🔥', badgeClass:'duo',
    short:'双词条联动',
    desc:'攻击自动补挂【火标】，命中已带【火标】目标时触发一次范围引爆！'
  },

  // Frost Aegis Chain: Trio strictly replaces all Frost Duos!
  {
    id:'frost_aegis_trio', chain:'frost_aegis', tier:3, priority:100, conflictGroup:'frost_chain_duo',
    req:['frost_chill', 'frost_ward', 'frost_nova_counter'],
    name:'凛冬寒盾反制', icon:'❄️🛡️', badgeClass:'frost-trio',
    short:'完整三联动 · 替代双联动',
    desc:'命中减速敌凝结高额【寒冰护盾】；护盾受击触发冰环反制，走位避伤时可在有盾状态主动冲刺(Space)或满盾刷新主动释放冰环反制（带内置冷却）！'
  },
  {
    id:'frost_aegis_duo', chain:'frost_aegis', tier:2, priority:20, conflictGroup:'frost_chain_duo',
    req:['frost_chill', 'frost_ward'],
    name:'寒冰护体', icon:'❄️', badgeClass:'duo',
    short:'双词条联动',
    desc:'命中已减速/冰冻的敌人时，为领主凝结短时【寒冰护盾】吸收伤害！'
  },
  {
    id:'frost_counter_duo', chain:'frost_aegis', tier:2, priority:15, conflictGroup:'frost_chain_duo',
    req:['frost_chill', 'frost_nova_counter'],
    name:'霜华凝护', icon:'❄️', badgeClass:'duo',
    short:'双词条联动',
    desc:'命中已减速/冰冻的敌人时，为领主凝结短时【寒冰护盾】吸收伤害！'
  },
  {
    id:'frost_bulwark_duo', chain:'frost_aegis', tier:2, priority:10, conflictGroup:'frost_chain_duo',
    req:['frost_ward', 'frost_nova_counter'],
    name:'玄冰甲盾', icon:'❄️', badgeClass:'duo',
    short:'双词条联动',
    desc:'命中已减速/冰冻的敌人时，为领主凝结短时【寒冰护盾】吸收伤害！'
  }
];

