import BALANCE from './balance.js';

/* ==================== CONSTANTS & GAME DATA ==================== */
export const W = 64, H = 48, CELL = 44;
export const MAIN_WAVES = BALANCE.mainWaves || 30;
export const MAX_ENEMIES = 145;
export const MAX_PROJECTILES = 220;
export const MAX_FLOATS = 60;
export const MAX_RINGS = 45;
export const HERO_GEAR_SLOTS = 4;
export const SHRINE_WAVES = [3, 7, 12, 17, 23, 27];

export const ELEMENTS = {
  wind:    { key:'wind',    name:'疾风', icon:'🌪️', color:'#72f2b4',
    t1:'风法宝与领主攻速 +25%', t2:'攻击 35% 触发额外分裂剑雨' },
  fire:    { key:'fire',    name:'烈焰', icon:'🔥', color:'#ff7b47',
    t1:'火焰/爆炸伤害 +35%', t2:'敌人死亡触发 18% 生命尸爆！' },
  frost:   { key:'frost',   name:'寒冰', icon:'❄️', color:'#6ce2ff',
    t1:'减速敌人受全伤 +25%', t2:'25% 几率冰冻 1.5s 并碎冰真伤' },
  thunder: { key:'thunder', name:'雷霆', icon:'⚡', color:'#c68cff',
    t1:'闪电链弹射目标 +2', t2:'每 3s 对怪群降下全场天罚落雷！' },
  holy:    { key:'holy',    name:'圣光', icon:'✨', color:'#ffe478',
    t1:'领主每秒回血 +5 + 全法宝与领主暴击 +15%', t2:'暴伤升至 220% 且触发圣光震爆！' }
};

/* Configurable Wave / Breakthrough Unlock Nodes (replaces old 4 manual tribulations!) */
export const UNLOCK_NODES = (BALANCE.progression.unlockNodes || [
  { idx:0, id:'w1_start',         name:'炼气', stageTag:'初探', minWave:1,  requireBreakthrough:null,  sealCap:2, subCap:0, comboTier:0, col:'#72f2b4', dmgBonus:0,    cdMult:1.00, skills:['blades','firewave','nova','berserk'] },
  { idx:1, id:'w6_node',          name:'筑基', stageTag:'成型', minWave:6,  requireBreakthrough:null,  sealCap:3, subCap:1, comboTier:1, col:'#5cc8ff', dmgBonus:0,    cdMult:1.00, skills:['blades','firewave','nova','berserk','thunder'] },
  { idx:2, id:'w10_breakthrough', name:'金丹', stageTag:'一破', minWave:10, requireBreakthrough:'w10', sealCap:4, subCap:2, comboTier:2, col:'#ffd666', dmgBonus:0.12, cdMult:1.00, skills:['blades','firewave','nova','berserk','thunder','stomp'] },
  { idx:3, id:'w16_node',         name:'元婴', stageTag:'预备', minWave:16, requireBreakthrough:'w10', sealCap:5, subCap:2, comboTier:2, col:'#c68cff', dmgBonus:0.25, cdMult:1.00, skills:['blades','firewave','nova','berserk','thunder','stomp'] },
  { idx:4, id:'w20_breakthrough', name:'化神', stageTag:'二破', minWave:20, requireBreakthrough:'w20', sealCap:5, subCap:2, comboTier:2, col:'#ff5c7a', dmgBonus:0.60, cdMult:0.85, skills:['blades','firewave','nova','berserk','thunder','stomp'] }
]).map(n => ({ ...n, id: n.id || n.key, key: n.key || n.id }));
export const REALMS = UNLOCK_NODES;
export const SEAL_TIER_NAMES = ['', '凡印', '灵印', '玄印', '天印', '仙印'];
export const SEAL_FUSE_NEED = [0, 1, 2, 3, 4, 0]; // pts needed to advance from star s -> s+1 (1★=1pt, 2★=2pt, 3★=4pt)

/* Unique Elemental Seal Enchantments (1-slot unique; 1★->5★ ladder paced across 30 waves!) */
export const ARTIFACTS = {
  wind: {
    key:'wind', elem:'wind', name:'疾风灵印', icon:'🌪️', cost:22,
    desc:'【风附魔】命中点迸射穿刺风刃，孤立强敌受到一道集中风斩（3★与5★开启元素羁绊）',
    stars:[
      { dmg:14, cd:0.65, range:3.8, shots:2, pierce:1, splash:0 },
      { dmg:22, cd:0.56, range:4.3, shots:3, pierce:1, splash:0 },
      { dmg:34, cd:0.48, range:4.8, shots:4, pierce:2, splash:0 },
      { dmg:50, cd:0.42, range:5.3, shots:5, pierce:2, splash:0 },
      { dmg:74, cd:0.36, range:5.9, shots:6, pierce:3, splash:0 }
    ]
  },
  fire: {
    key:'fire', elem:'fire', name:'赤焰灵印', icon:'🔥', cost:25,
    desc:'【火附魔】命中点炸开烈焰爆环与焦土（3★激2层火伤，5★激4层18%尸爆）',
    stars:[
      { dmg:24, cd:1.25, range:4.0, shots:1, splash:1.70, burn:6 },
      { dmg:38, cd:1.12, range:4.4, shots:1, splash:2.05, burn:12 },
      { dmg:56, cd:1.00, range:4.8, shots:1, splash:2.40, burn:20 },
      { dmg:84, cd:0.88, range:5.2, shots:1, splash:2.75, burn:32 },
      { dmg:126,cd:0.76, range:5.8, shots:1, splash:3.15, burn:48 }
    ]
  },
  frost: {
    key:'frost', elem:'frost', name:'寒玉灵印', icon:'❄️', cost:23,
    desc:'【冰附魔】命中点扩散寒霜冰环减速（3★激2层易伤，5★激4层冰封碎冰）',
    stars:[
      { dmg:15, cd:1.05, range:4.0, shots:1, splash:1.85, slow:0.38, slowDur:2.4 },
      { dmg:24, cd:0.94, range:4.4, shots:1, splash:2.20, slow:0.46, slowDur:2.8 },
      { dmg:38, cd:0.84, range:4.8, shots:1, splash:2.55, slow:0.54, slowDur:3.2 },
      { dmg:58, cd:0.74, range:5.2, shots:1, splash:2.90, slow:0.60, slowDur:3.5 },
      { dmg:88, cd:0.64, range:5.8, shots:1, splash:3.30, slow:0.65, slowDur:4.0 }
    ]
  },
  thunder: {
    key:'thunder', elem:'thunder', name:'紫霄灵印', icon:'⚡', cost:26,
    desc:'【雷附魔】命中点弹射连锁闪电（3★激2层+2弹射，5★激4层全场天罚）',
    stars:[
      { dmg:20, cd:1.00, range:4.5, chains:3 },
      { dmg:34, cd:0.90, range:4.9, chains:4 },
      { dmg:52, cd:0.80, range:5.4, chains:6 },
      { dmg:78, cd:0.70, range:5.9, chains:8 },
      { dmg:118,cd:0.60, range:6.5, chains:10 }
    ]
  },
  holy: {
    key:'holy', elem:'holy', name:'圣光灵印', icon:'✨', cost:28,
    desc:'【光附魔】命中点炸开十字圣光冲击（3★激2层回血暴击，5★激4层圣光震爆）',
    stars:[
      { dmg:22, cd:0.96, range:2.6, beams:2, auraAspd:0.12 },
      { dmg:36, cd:0.86, range:3.1, beams:2, auraAspd:0.18 },
      { dmg:54, cd:0.76, range:3.6, beams:3, auraAspd:0.25 },
      { dmg:80, cd:0.68, range:4.2, beams:4, auraAspd:0.32 },
      { dmg:120,cd:0.58, range:4.9, beams:6, auraAspd:0.42 }
    ]
  }
};
export const ARTIFACT_KEYS = Object.keys(ARTIFACTS);

/* Sub-Seal Elemental Resonance (Direction B: 1 Main Seal + up to 2 Sub-Seal Slots!) */
export const SUB_SEAL_RESONANCE = {
  wind:    { key:'wind',    name:'御风阵眼', cdRed:[0.12, 0.20, 0.30], blades:[1, 2, 3],
    desc: s => `主印冷却 -${Math.round([0.12,0.20,0.30][s-1]*100)}%，主印爆发额外迸射 ${s} 道穿刺风刃` },
  fire:    { key:'fire',    name:'离火阵眼', dmgBonus:[0.12, 0.22, 0.35], burn:[10, 18, 30],
    desc: s => `主印伤害 +${Math.round([0.12,0.22,0.35][s-1]*100)}%，附加 ${[10,18,30][s-1]} 灼烧伤` },
  frost:   { key:'frost',   name:'玄冰阵眼', slow:[0.30, 0.42, 0.55], chillAmp:[0.12, 0.20, 0.32],
    desc: s => `主印减速 ${Math.round([0.30,0.42,0.55][s-1]*100)}%，对减速敌全伤 +${Math.round([0.12,0.20,0.32][s-1]*100)}%` },
  thunder: { key:'thunder', name:'惊雷阵眼', proc:[0.45, 0.65, 1.00], chains:[2, 3, 4],
    desc: s => `主印 ${Math.round([0.45,0.65,1.00][s-1]*100)}% 几率额外弹射 ${[2,3,4][s-1]} 目标共鸣雷链` },
  holy:    { key:'holy',    name:'乾坤阵眼', crit:[0.08, 0.14, 0.22], heal:[1.5, 2.5, 4.0],
    desc: s => `全暴击 +${Math.round([0.08,0.14,0.22][s-1]*100)}%，主印触发回血 ${[1.5,2.5,4.0][s-1]} 并绽放圣光` }
};

/* Stage 2: Same-Element Main Seal 3★ Specialization Routes (comparable free vs gold-cost tradeoff) */
export const SEAL_SPECIALIZATIONS = {
  fire: {
    standard: { key:'standard', name:'稳健火脉', cost:0, tag:'免费进阶', desc:'主灵印基础伤害 +18%，触发冷却 -8%，稳定提升赤焰输出' },
    mastery:  { key:'mastery',  name:'炽标连焰', cost:BALANCE.economy.sealMasteryRouteCost || 35, tag:'付费专精', desc:'赤焰主印爆发为命中敌人施加 1 层【火标】，焦土半径 +25% 并延长灼烧' }
  },
  frost: {
    standard: { key:'standard', name:'凝霜正统', cost:0, tag:'免费进阶', desc:'主灵印基础伤害 +18%，触发冷却 -8%，减速覆盖更稳健' },
    mastery:  { key:'mastery',  name:'寒镜凝甲', cost:BALANCE.economy.sealMasteryRouteCost || 35, tag:'付费专精', desc:'寒玉主印冰环命中已减速敌人时，额外为领主凝结 +10【寒冰护盾】' }
  },
  thunder: {
    standard: { key:'standard', name:'紫雷贯通', cost:0, tag:'免费进阶', desc:'主灵印基础伤害 +18%，触发冷却 -8%，稳步增强链雷频率' },
    mastery:  { key:'mastery',  name:'天罚追链', cost:BALANCE.economy.sealMasteryRouteCost || 35, tag:'付费专精', desc:'紫霄主印弹射目标 +2，且被链雷击中的敌人陷入 3s 易伤 (+20%)' }
  },
  wind: {
    standard: { key:'standard', name:'疾风破阵', cost:0, tag:'免费进阶', desc:'主灵印基础伤害 +18%，触发冷却 -8%，风刃压制更平滑' },
    mastery:  { key:'mastery',  name:'飓刃裂风', cost:BALANCE.economy.sealMasteryRouteCost || 35, tag:'付费专精', desc:'疾风主印风刃穿透 +2、额外 +1 弹道，并额外缩短主印冷却 10%' }
  },
  holy: {
    standard: { key:'standard', name:'圣光沐浴', cost:0, tag:'免费进阶', desc:'主灵印基础伤害 +18%，触发冷却 -8%，提供稳定圣光覆盖' },
    mastery:  { key:'mastery',  name:'圣辉炽界', cost:BALANCE.economy.sealMasteryRouteCost || 35, tag:'付费专精', desc:'圣光主印光束 +1 道，全暴伤 +20% 且主印触发回复 4 点生命' }
  }
};

/* 4 Recipe Combos (unlocked by wave/breakthrough comboTier: 1=W6节点, 2=W10突破节点; requires both skills >= Lv.1 AND combined level >= 3!) */
export const COMBOS = {
  wanjian: {
    key:'wanjian', name:'万剑诀', icon:'⚔️', realm:1, req:['blades','firewave'],
    desc:'【W6节点+两技总等级≥3觉醒】每 2.4s 环绕飞刃向周围齐射穿透剑气（60% 剑波伤）'
  },
  ice_blades: {
    key:'ice_blades', name:'冰刃风暴', icon:'❄️', realm:1, req:['nova','blades'],
    desc:'【W6节点+两技总等级≥3觉醒】飞刃附带 35% 减速（2s）；命中减速敌触发 8% 碎冰真伤（封顶140）'
  },
  thunder_fire: {
    key:'thunder_fire', name:'雷火劫', icon:'🌩️', realm:2, req:['thunder','firewave'],
    desc:'【W10突破+两技总等级≥3觉醒】烈焰剑波命中敌人有 45% 几率引落 3 目标连锁闪电'
  },
  quake_blood: {
    key:'quake_blood', name:'崩山血怒', icon:'🌋', realm:2, req:['stomp','berserk'],
    desc:'【W10突破+两技总等级≥3觉醒】重锤震地按已损血比例最高增伤 +100%，每次命中回血 3'
  }
};
export const COMBO_LIST = Object.values(COMBOS);

/* 18 Rule-Bending Perks (保留供天命/调试与后续阶段复用) */
export const PERKS = {
  sword_echo:       { key:'sword_echo',       family:'剑风', name:'剑影分身', icon:'🗡️', rarity:'common', d1:'飞刃转速 +35%，每次冲刺向前射 1 道穿透剑波', d2:'飞刃转速 +65%，每次冲刺向四周齐射 4 道穿透剑波' },
  wind_gale:        { key:'wind_gale',        family:'剑风', name:'御风破空', icon:'💨', rarity:'rare',   d1:'移速 +20%，冲刺 CD -25%，冲刺后 2s 必暴击', d2:'移速 +30%，冲刺 CD -45%，冲刺后 2s 灵印与神通攻速 +60%' },
  sword_rain:       { key:'sword_rain',       family:'剑风', name:'剑心通明', icon:'🌠', rarity:'epic',   d1:'每 6 次攻击命中，对最近强敌降下 3 道穿刺天剑', d2:'每 4 次降下 5 道穿刺天剑，且暴击伤害 +60%' },
  fire_nova:        { key:'fire_nova',        family:'雷火', name:'焚天余烬', icon:'🔥', rarity:'common', d1:'灼烧敌人死亡时引发 15% 最大生命爆燃', d2:'爆燃升至 25% 最大生命并引燃周围敌军' },
  thunder_arc:      { key:'thunder_arc',      family:'雷火', name:'紫霄天引', icon:'⚡', rarity:'rare',   d1:'任意暴击 30% 几率额外引落 3 目标连锁天雷', d2:'几率升至 55%、弹射 5 目标并使受击敌易伤 +20%' },
  dual_cataclysm:   { key:'dual_cataclysm',   family:'雷火', name:'雷火劫印', icon:'☄️', rarity:'epic',   d1:'灼烧敌受雷伤 +60%；受雷劈立刻爆算剩余灼烧并刷新', d2:'增伤升至 +100%，每次触发回复领主 3 点生命' },
  frost_shatter:    { key:'frost_shatter',    family:'寒刃', name:'玄冰碎甲', icon:'🧊', rarity:'common', d1:'减速/冰冻敌死亡时向四周迸射 4 枚穿透冰刺', d2:'迸射 7 枚穿透冰刺，且冰冻持续时间 +50%' },
  frost_domain:     { key:'frost_domain',     family:'寒刃', name:'凛冬领域', icon:'❄️', rarity:'rare',   d1:'领主脚下常驻寒气光环（半径 3.2格）减速 35% + 寒伤', d2:'半径扩至 4.5格、减速 50%，领主受击减伤 20%' },
  zero_exec:        { key:'zero_exec',        family:'寒刃', name:'绝对零度', icon:'💠', rarity:'epic',   d1:'对冰冻或血量 <20% 普通/精英直接碎冰斩杀', d2:'斩杀线 30%（对 Boss 额外造成 6% 已损生命真伤）' },
  body_thorns:      { key:'body_thorns',      family:'体修', name:'金刚反震', icon:'🛡️', rarity:'common', d1:'受击触发反击震波并获 28 点护盾（CD 3s）', d2:'护盾升至 60 点，反击震波晕眩 1s 并回血 15' },
  blood_oath:       { key:'blood_oath',       family:'体修', name:'血煞魔躯', icon:'🩸', rarity:'rare',   d1:'最大生命 +80；每损 10% 血全伤 +12%、吸血 +2', d2:'最大生命 +160；每损 10% 血全伤 +18%，半血下攻速 +35%' },
  undying_will:     { key:'undying_will',     family:'体修', name:'不灭金身', icon:'👑', rarity:'epic',   d1:'每波 1 次免死：致命伤转无敌 2.5s + 回 50% 血 + 清屏震爆', d2:'免死回 80% 血 + 立刻触发 4s 全军超载狂暴' },
  mono_mastery:     { key:'mono_mastery',     family:'专精', name:'一法破万法',icon:'🎯', rarity:'rare',   d1:'【专精】拥有领主神通 ≤2 种时，神通伤害 ×1.30、范围 +8%', d2:'条件放宽至 ≤3 种，神通伤害 ×1.55、范围 +15%、冷却 -20%' },
  artifact_overclock:{ key:'artifact_overclock',family:'灵印',name:'灵印共鸣',icon:'🔮', rarity:'rare',   d1:'灵印 CD -25%，每 1★ 增全伤 +8%，且提前解锁 +1 辅灵印槽（上限2槽）', d2:'灵印触发额外 +1 弹道/范围 +30%，并提前破境 +1 主印星上限' },
  gold_power:       { key:'gold_power',       family:'经济', name:'点石成金', icon:'💰', rarity:'common', d1:'每持 50 金全伤 +6%（上限 +42%）；过波享 7% 利息（上限 12）', d2:'每 50 金 +9%（上限 +63%），商店刷新 25% 几率免费' },
  crit_surge:       { key:'crit_surge',       family:'通用', name:'破妄神瞳', icon:'👁️', rarity:'common', d1:'暴击 +15%；超出 100% 的溢出暴击率按 1:2 转暴伤', d2:'暴击 +25%；1:3 转暴伤，暴击缩减冲刺/超载 CD 0.15s' },
  ult_engine:       { key:'ult_engine',       family:'通用', name:'燃魂超载', icon:'⚡', rarity:'rare',   d1:'每击杀 25 敌缩减「全军超载(R)」CD 3s；超载移速 +30%', d2:'每击杀 15 敌减 4s，超载持续时间延至 8s' },
  dao_fortune:      { key:'dao_fortune',      family:'通用', name:'天命垂青', icon:'🌟', rarity:'epic',   d1:'立刻获 1 件灵品(蓝)构装 + 35 金；精英/Boss 必额外掉修为大球', d2:'再获 1 件史诗(紫)构装，所有构装叠星倍率额外 +25%' }
};
export const PERK_LIST = Object.values(PERKS);

/* v0.60 In-Run Pills: Basic cultivation, healing, and body-tempering elixirs */
export const PILLS = {
  xp:     { key:'xp',     name:'修为丹', icon:'💊', cost:26, desc:'立刻注入当前等级 35% 修为，加速领主升级与神通领悟' },
  heal:   { key:'heal',   name:'回春丹', icon:'🌿', cost:24, desc:'立刻恢复领主 65 点生命值，并凝结 25 点临时寒冰灵盾（持续 6 秒）' },
  temper: { key:'temper', name:'淬灵丹', icon:'⚗️', cost:30, desc:'提炼 2 份通用锻材（普通材料 +2），并恢复 25 点生命值' }
};
export const PILL_KEYS = Object.keys(PILLS);

export const HERO_SKILL_STARTERS = BALANCE.progression.starterSkills;

export const HERO_SKILLS = {
  swordlance: {
    key:'swordlance', name:'御剑贯虹', icon:'◇', tag:'瞄准 · 直线贯穿',
    desc: lv => `把剑气射向瞄准方向，可贯穿前方敌阵。第一击对首领与精英尤其有效（Lv.${lv}）。`
  },
  sunward: {
    key:'sunward', name:'日曜护符', icon:'☼', tag:'定向圣击 · 获得护盾',
    desc: lv => `优先照击精英与首领，同时灼照近旁敌群；命中后生成护盾（Lv.${lv}）。`
  },
  blades: {
    key:'blades', name:'旋风飞刃', icon:'🌀', tag:'割草核心',
    desc: lv => `召唤 ${lv + 1} 把发光飞刃环绕领主高速旋转，切碎贴身怪海（当前 Lv.${lv}）。`
  },
  firewave: {
    key:'firewave', name:'烈焰剑波', icon:'🔥', tag:'指向穿透',
    desc: lv => `优先朝鼠标方向发射 ${Math.min(4, Math.ceil(lv/2) + 1)} 道穿透烈焰剑气，清线极快（当前 Lv.${lv}）。`
  },
  thunder: {
    key:'thunder', name:'天雷轰顶', icon:'⚡', tag:'锁强清屏',
    desc: lv => `基础间隔 ${(Math.max(BALANCE.progression.skillBase.thunder.minCd, BALANCE.progression.skillBase.thunder.cd - lv * BALANCE.progression.skillBase.thunder.perLvCd)).toFixed(2)}s 召唤 ${lv + 1} 道天雷优先劈向首领/精英/祭司（当前 Lv.${lv}）。`
  },
  nova: {
    key:'nova', name:'冰霜新星', icon:'❄️', tag:'控场碎冰',
    desc: lv => `周期释放半径 ${(1.95 + lv*0.24).toFixed(2)} 格冰环，冻结减速周围大片敌军（当前 Lv.${lv}）。`
  },
  stomp: {
    key:'stomp', name:'重锤震地', icon:'💥', tag:'重击晕眩',
    desc: lv => `定时在领主脚下引爆巨型震荡波，造成重伤与击退晕眩（当前 Lv.${lv}）。`
  },
  berserk: {
    key:'berserk', name:'狂战血怒', icon:'🩸', tag:'吸血磁铁',
    desc: lv => `领主攻速 +${lv*18}%、暴击 +${lv*8}%、命中吸血系数 +${lv*2}（受每秒总量限制）、经验磁铁范围大幅扩大。`
  }
};

/* ==================== W10 FIRST MAJOR BREAKTHROUGH BRANCH POOL ====================
   Each skill has 4 distinct branches (drawn 3-of-4 at random after player designates a learned main skill).
   Covers the cross-stage combat state hooks:
   - Fire: fireMarkT / fireMarkStacks -> triggerFireDetonation (火标/引爆)
   - Frost: slowT / applyFrostSlow -> gainFrostShield / triggerFrostPulse (减速/冰盾)
==================================================================================== */
export const W10_SKILL_BRANCHES = {
  swordlance: [
    { key:'sl_returning_lance', skillKey:'swordlance', name:'回锋定阵', icon:'◇', tag:'折返直刺', hookType:'wind_echo', desc:'每次剑气带回一击，能集中打击正前方强敌。冲刺重置御剑贯虹，使回锋更快接上。' },
    { key:'sl_cross_lanes', skillKey:'swordlance', name:'交锋三路', icon:'◇', tag:'三向清群', hookType:'wind_echo', desc:'向左右另两条轨道发出较弱剑气，适合清理多路围攻。' },
    { key:'sl_sever_guard', skillKey:'swordlance', name:'断甲长锋', icon:'◇', tag:'前锋易伤', hookType:'wind_echo', desc:'剑气略窄且贯穿更少，但命中首领或精英可施加易伤。' },
    { key:'sl_stillpoint', skillKey:'swordlance', name:'轻身御锋', icon:'◇', tag:'站位机动', hookType:'wind_echo', desc:'走动中射出快速长剑。冲刺后首轮贯虹获得额外射程与护盾。' },
  ],
  sunward: [
    { key:'su_verdict', skillKey:'sunward', name:'金轮审判', icon:'☼', tag:'持盾锁强', hookType:'holy_verdict', desc:'有盾时，用两道连续圣击打向首领或精英。' },
    { key:'su_shelter', skillKey:'sunward', name:'拂晓护壳', icon:'☼', tag:'稳守回盾', hookType:'holy_verdict', desc:'照击改为更近的周身环，命中后额外产盾。' },
    { key:'su_dawning', skillKey:'sunward', name:'追曦明焰', icon:'☼', tag:'圣击转火', hookType:'holy_verdict', desc:'在目标周围多照射两名敌人，加强分散敌群的处理能力。' },
    { key:'su_cleansing', skillKey:'sunward', name:'洗锋净印', icon:'☼', tag:'破甲净化', hookType:'holy_verdict', desc:'有效命中可以解除自身破甲，并打出一次额外圣光。' },
  ],
  firewave: [
    {
      key: 'fw_brand_pierce', skillKey: 'firewave', name: '烙印穿云 · 贯列挂标', icon: '🏹',
      tag: '高速聚能枪 · 穿透连爆', hookType: 'fire_mark_detonate',
      desc: '剑波收束为高速远程穿云火枪（射程+45%、穿透+3），命中必挂4.5s【火标】；穿透第2个起或命中已带【火标】敌人时立即触发1.75格【火标引爆】！'
    },
    {
      key: 'fw_ring_detonate', skillKey: 'firewave', name: '焚环爆裂 · 环斩引爆', icon: '🌋',
      tag: '周身火环挂标 · 焦土引爆', hookType: 'fire_mark_detonate',
      desc: '挥剑时同步向四周扩散6道环形火浪为近身敌群集体挂【火标】；剑波命中带【火标】目标时引爆2.1格烈焰轰击并留下2.2s灼烧焦土！'
    },
    {
      key: 'fw_homing_ember', skillKey: 'firewave', name: '追魂火鸦 · 锁标弹射', icon: '🦅',
      tag: '锁强追踪 · 弹射引爆', hookType: 'fire_mark_detonate',
      desc: '剑波化为优先锁定高危目标的追踪火鸦，命中挂【火标】并向邻近敌人弹射次级火鸦；命中已带【火标】敌人直接触发1.9格【火标引爆】！'
    },
    {
      key: 'fw_mortar_cluster', skillKey: 'firewave', name: '陨火重炮 · 聚团轰印', icon: '☄️',
      tag: '抛射轰炸 · 双层火标', hookType: 'fire_mark_detonate',
      desc: '改直线剑波为朝怪群密集处轰击重型火陨（半径2.35格），落点全员挂2层【火标】并留下焦土，中心已带【火标】敌人直接触发强力引爆！'
    }
  ],
  nova: [
    {
      key: 'nv_glacial_bastion', skillKey: 'nova', name: '玄冰护体 · 减速凝盾', icon: '🛡️',
      tag: '广域深寒 · 命中凝盾', hookType: 'frost_slow_shield',
      desc: '冰环范围+25%并施加65%深度【减速】；每命中1名敌人为领主凝结+12【寒冰护盾】（上限90），持盾释放时额外激起内圈碎冰冲击！'
    },
    {
      key: 'nv_seeking_vortex', skillKey: 'nova', name: '凛冬寒涡 · 远距聚控', icon: '🌀',
      tag: '脱手冰涡 · 聚怪回盾', hookType: 'frost_slow_shield',
      desc: '改为向远端敌群投掷持续2.6s的【寒霜冰涡】（半径2.4格），持续牵引【减速】敌群；冰涡每次脉动命中减速敌人都为领主回传+8【寒冰护盾】！'
    },
    {
      key: 'nv_prism_lance', skillKey: 'nova', name: '冰棱齐射 · 破冰反制', icon: '❄️',
      tag: '八方冰棱 · 受击冰环', hookType: 'frost_slow_shield',
      desc: '冰环爆发时向四周齐射8枚穿透冰棱施加【减速】并凝结+10【寒冰护盾】；领主寒冰护盾受击时自动反震一圈2.8格冰环冻结周围敌军！'
    },
    {
      key: 'nv_trail_aegis', skillKey: 'nova', name: '霜径巡弋 · 走位叠盾', icon: '🧊',
      tag: '高频冰径 · 移动凝盾', hookType: 'frost_slow_shield',
      desc: '冷却缩短25%，释放后在脚下铺开持续2.5s的【寒霜冰径】使踏入敌人【减速】，并立即为领主凝结+18【寒冰护盾】！'
    }
  ],
  blades: [
    { key:'bl_crosswinds', skillKey:'blades', name:'切阵御风', icon:'◇', tag:'冲刺放剑', hookType:'wind_echo', desc:'冲刺落点沿前方射出一道贯穿风刃。飞刃保留周身转圈，冲刺后可先打远处威胁。' },
    {
      key: 'bl_twin_orbit', skillKey: 'blades', name: '双环错刃 · 内守外割', icon: '💠',
      tag: '内外双轨 · 斩慢凝盾', hookType: 'frost_slow_shield',
      desc: '飞刃化为内外双环反向旋转（内环护身减速、外环广域割草，飞刃+2），命中已【减速】敌人时自动为领主凝结+6【寒冰护盾】！'
    },
    {
      key: 'bl_crimson_wheel', skillKey: 'blades', name: '赤炎火轮 · 旋刃燃标', icon: '🔥',
      tag: '旋火挂标 · 飞轮引爆', hookType: 'fire_mark_detonate',
      desc: '飞刃化作赤炎火轮，切割敌人时挂上3.5s【火标】；命中已带【火标】敌人时立刻触发【火标引爆】并向外甩出穿透火刃！'
    },
    {
      key: 'bl_frost_shuriken', skillKey: 'blades', name: '寒霜飞镰 · 割裂霜盾', icon: '❄️',
      tag: '寒刃迸射 · 减速叠盾', hookType: 'frost_slow_shield',
      desc: '飞刃命中附加45%【减速】并向切线方向迸射穿透寒霜刃芒，命中减速敌人时为领主补充+8【寒冰护盾】！'
    },
    {
      key: 'bl_expanding_storm', skillKey: 'blades', name: '裂空剑阵 · 呼吸扩缩', icon: '🌪️',
      tag: '轨道扩缩 · 剑气震退', hookType: 'frost_slow_shield',
      desc: '飞刃轨道在1.2格至2.7格间周期呼吸扩张，扩张极点向四周迸发剑气环使敌人【减速】并为领主凝结+10【寒冰护盾】！'
    }
  ],
  thunder: [
    { key:'th_storm_circuit', skillKey:'thunder', name:'留电回路', icon:'ϟ', tag:'同一目标复击', hookType:'storm_circuit', desc:'首道天雷优先劈强敌，第二道复击该目标。孤立目标承受返击，成群时优先把后续雷击分给别的目标。' },
    {
      key: 'th_judgment_pillar', skillKey: 'thunder', name: '天罚雷柱 · 落雷驻场', icon: '🌩️',
      tag: '驻场雷阵 · 雷火烙印', hookType: 'fire_mark_detonate',
      desc: '主落雷劈中目标后在原地留下持续2.4s的【雷暴法阵】（半径1.9格），持续电击阵内敌人并挂【火标】，满层触发雷火引爆！'
    },
    {
      key: 'th_arc_web', skillKey: 'thunder', name: '千鸟雷网 · 广域跳链', icon: '⚡',
      tag: '超长弹射 · 状态震爆', hookType: 'fire_mark_detonate',
      desc: '弹射目标+3且跳距扩大40%，雷链命中带【火标】或【减速】敌人时直接触发1.8格【火标引爆】！'
    },
    {
      key: 'th_storm_orb', skillKey: 'thunder', name: '雷球巡猎 · 寒雷凝盾', icon: '🔮',
      tag: '穿透电球 · 麻痹凝盾', hookType: 'frost_slow_shield',
      desc: '落雷同时向目标方向发射穿透【紫霄雷球】，沿途麻痹【减速】45%敌人并为领主回传+10【寒冰护盾】！'
    },
    {
      key: 'th_heaven_brand', skillKey: 'thunder', name: '九霄雷印 · 锁强连劈', icon: '☄️',
      tag: '定向集火 · 烙印爆轰', hookType: 'fire_mark_detonate',
      desc: '所有落雷集中轰击场上血量最高目标周围，每次落雷必挂【火标】并在第2道落雷起触发连环【火标引爆】！'
    }
  ],
  stomp: [
    { key:'st_rupture', skillKey:'stomp', name:'裂甲陷阵', icon:'◇', tag:'内圈破甲', hookType:'breaker', desc:'震击内圈的精英与首领追加一道重击并短暂易伤。外圈仍可扫开普通怪。' },
    {
      key: 'st_fissure_wave', skillKey: 'stomp', name: '裂地三震 · 指向熔爆', icon: '🌋',
      tag: '前推三震 · 挂标引爆', hookType: 'fire_mark_detonate',
      desc: '由原地圆环改为朝目标方向连续前推3道递增裂地火震，沿途挂【火标】并对已带【火标】敌人触发1.9格【火标引爆】！'
    },
    {
      key: 'st_glacier_quake', skillKey: 'stomp', name: '冰川崩裂 · 震地凝盾', icon: '🧊',
      tag: '广域冰震 · 按敌叠盾', hookType: 'frost_slow_shield',
      desc: '震地范围+25%并迸发极寒冰刺，令全员55%【减速】3s，每命中1名敌人为领主凝结+10【寒冰护盾】！'
    },
    {
      key: 'st_aftershock_ring', skillKey: 'stomp', name: '余震重岳 · 内外双爆', icon: '💥',
      tag: '外圈余震 · 双态引爆', hookType: 'fire_mark_detonate',
      desc: '震地后立即在1.45倍半径处激起第二道外圈余震波，为全员挂【火标】并引爆所有已带【火标】敌人！'
    },
    {
      key: 'st_molten_crater', skillKey: 'stomp', name: '熔岩陷坑 · 驻场焚印', icon: '🔥',
      tag: '脚下火坑 · 持续烙印', hookType: 'fire_mark_detonate',
      desc: '震地在领主脚下炸开持续2.8s的巨型【熔岩陷坑】，持续灼烧踏入敌人、挂【火标】并周期触发引爆！'
    }
  ],
  berserk: [
    { key:'bk_crimson_pact', skillKey:'berserk', name:'燃血回锋', icon:'◈', tag:'超载血斩', hookType:'blood_requital', desc:'超载期间朝最近强敌挥出血刃，命中可回血。超载外体力越低，血刃越难启动。' },
    {
      key: 'bk_flame_aura', skillKey: 'berserk', name: '焚血战意 · 走位烙印', icon: '🔥',
      tag: '常驻火环 · 自动挂标', hookType: 'fire_mark_detonate',
      desc: '开启半径2.8格【焚血光环】，每0.6s自动为周围敌人挂【火标】并对已带【火标】敌人触发一次燃血引爆！'
    },
    {
      key: 'bk_frost_armor', skillKey: 'berserk', name: '寒血战甲 · 凛冬凝盾', icon: '🛡️',
      tag: '常驻霜环 · 减速叠盾', hookType: 'frost_slow_shield',
      desc: '开启半径2.8格【寒血霜环】，每0.6s自动【减速】周围敌人并为领主凝结+10【寒冰护盾】！'
    },
    {
      key: 'bk_blood_crescent', skillKey: 'berserk', name: '血月斩浪 · 狂攻剑芒', icon: '🌙',
      tag: '周期血斩 · 穿透挂标', hookType: 'fire_mark_detonate',
      desc: '狂怒状态下每0.9s自动朝最近强敌劈出一道巨型穿透【血月斩】，命中挂【火标】并引爆已标记目标！'
    },
    {
      key: 'bk_war_tempest', skillKey: 'berserk', name: '血怒冰暴 · 旋风护体', icon: '❄️',
      tag: '霜刃护体 · 走位反制', hookType: 'frost_slow_shield',
      desc: '每0.9s向四周迸射4枚寒血冰刺使敌人【减速】，命中后为领主叠加+12【寒冰护盾】！'
    }
  ]
};

