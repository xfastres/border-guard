// Shared by reward weighting, the W20 recommendation and isolated practice builds.
export const BUILD_ROUTES = {
  fire: {
    name: '火标连爆', skill: 'firewave', elem: 'fire', branch: 'fw_brand_pierce',
    direction: 'fire_chain_surge', enhancement: 'w20_fire_isolated_exec',
    gear: ['flame_fan', 'smolder_edge', 'ember_focus'], affixes: ['fire_brand', 'fire_burst', 'fire_chain'],
    tactic: '先用剑波标记整列敌人，再穿透引爆。首领落单时，优先选择聚焦爆轰。',
  },
  frost: {
    name: '寒盾反制', skill: 'nova', elem: 'frost', branch: 'nv_seeking_vortex',
    direction: 'frost_bastion_counter', enhancement: 'w20_frost_aegis_thorns',
    gear: ['frost_mirror', 'ice_lantern', 'white_jade_guard'], affixes: ['frost_chill', 'frost_ward', 'frost_nova_counter'],
    tactic: '先减速叠盾，再用冲刺释放反制冰环。对远程首领保持冰涡能覆盖的距离。',
  },
  wind: {
    name: '御风贯刃', skill: 'swordlance', elem: 'wind', branch: 'sl_returning_lance',
    direction: 'wind_stride', enhancement: 'w20_wind_duel',
    gear: ['reed_sword', 'windcord', 'trailing_edge'], affixes: ['wind_edge', 'wind_relay', 'wind_pin'],
    tactic: '冲刺后用第一道剑气贯穿前排。单体战隔开随从，等待下一次冲刺再切入。',
  },
  thunder: {
    name: '叠雷回路', skill: 'thunder', elem: 'thunder', branch: 'th_storm_circuit',
    direction: 'storm_circuit', enhancement: 'w20_storm_focus',
    gear: ['copper_needle', 'lightning_rod', 'circuit_mirror'], affixes: ['storm_charge', 'storm_return', 'storm_fork'],
    tactic: '把落雷集中在同一个强敌上。电荷满后向近敌分流，孤立时返打原目标。',
  },
  blood: {
    name: '燃血回锋', skill: 'berserk', elem: 'fire', branch: 'bk_crimson_pact',
    direction: 'blood_requital', enhancement: 'w20_blood_hunter',
    gear: ['blood_cord', 'scarlet_bracer', 'bloodseal_disc'], affixes: ['blood_reserve', 'blood_leech', 'blood_debt'],
    tactic: '留出生命再开超载，贴近斩出血刃，用实际命中回收代价。失去输出窗口时拉开距离。',
  },
  holy: {
    name: '持盾裁决', skill: 'sunward', elem: 'holy', branch: 'su_verdict',
    direction: 'sanctum_verdict', enhancement: 'w20_sanctum_purify',
    gear: ['sunward_charm', 'dawn_mirror', 'litany_mail'], affixes: ['holy_oath', 'holy_light', 'holy_judgment'],
    tactic: '用圣符照击积累护盾，命中强敌时消耗少量盾换取裁决。遇到预警可先拉开保盾。',
  },
  breaker: {
    name: '震地破阵', skill: 'stomp', elem: 'thunder', branch: 'st_rupture',
    direction: 'breaker_momentum', enhancement: 'w20_brk_aftershock_dash',
    gear: ['copper_needle', 'shatter_maul', 'circuit_mirror'], affixes: ['storm_charge', 'iron_bastion', 'storm_fork'],
    tactic: '把重锤内圈落到精英身上，冲刺切入后用余震逼退敌群。远程怪需要主动接近。',
  },
};

export const SKILL_BUILD_KEYS = {
  firewave: 'fire', nova: 'frost', blades: 'wind', swordlance: 'wind',
  thunder: 'thunder', berserk: 'blood', sunward: 'holy', stomp: 'breaker',
};

export const ROUTE_DIRECTIONS = {
  wind_stride: {
    key: 'wind_stride', name: '御风回锋', icon: '◇', elem: 'wind', tag: '位移 · 首击贯穿',
    synergyNote: '适配飞刃、御剑贯虹和疾风灵印。用冲刺制造安全的放剑角度。',
    baseDesc: '冲刺后 3 秒内的首次飞刃、剑气或风印有效命中，斩中该目标并贯穿其身后敌人。孤立强敌承受集中剑伤。',
  },
  storm_circuit: {
    key: 'storm_circuit', name: '九霄雷枢', icon: 'ϟ', elem: 'thunder', tag: '高频 · 同目标蓄电',
    synergyNote: '适配天雷轰顶、紫霄灵印和雷系词条。命中不同敌人会分别蓄电。',
    baseDesc: '对同一敌人累计 5 次雷击后释放过载。过载向附近敌人分流，孤立时返回原目标。短时间内同一目标只能释放一次。',
  },
  blood_requital: {
    key: 'blood_requital', name: '血契逆锋', icon: '◈', elem: 'fire', tag: '超载 · 生命换攻势',
    synergyNote: '适配狂战血怒、近身神通与血煞装备。最好在有敌可打时再按 R。',
    baseDesc: '战斗中开超载会支付一小部分生命，至少保留 28% 生命。接下来 5 秒内，近身有效神通命中产生血刃，返还部分代价。低血时可用普通超载。',
  },
  sanctum_verdict: {
    key: 'sanctum_verdict', name: '日冕裁决', icon: '☼', elem: 'holy', tag: '持盾 · 拆解护盾换爆发',
    synergyNote: '适配日曜护符、圣光灵印与实战产盾的词条。持续受击会消耗裁决资源。',
    baseDesc: '至少有 18 点护盾时，圣光命中会消耗 18 点护盾，对当前敌人裁决并照亮附近敌人。冷却 1.3 秒。',
  },
};

const routeCards = {
  wind_stride: {
    w20_wind_crosscut: ['交错剑路', '贯穿人数增加，剑路加宽。'],
    w20_wind_duel: ['逐影单锋', '剑路上只有主目标时，追加一道回程剑锋。'],
    w20_wind_pin: ['定风停刃', '贯穿的普通敌人被减速，无法立即贴回领主。'],
    w20_wind_guard: ['护身返步', '回锋命中时获得护盾，可用下一次冲刺重新取位。'],
  },
  storm_circuit: {
    w20_storm_fork: ['雷网分流', '过载可额外传导到两名敌人。'],
    w20_storm_focus: ['孤雷复击', '孤立目标在过载后承受额外一次返雷。'],
    w20_storm_ground: ['引雷破甲', '过载使主目标短暂易伤，后续神通可利用这个窗口。'],
    w20_storm_refill: ['残电回流', '过载后保留两格电荷，提前进入下一轮过载。'],
  },
  blood_requital: {
    w20_blood_spread: ['血锋裂帛', '每道血刃可扩散至两名额外敌人。'],
    w20_blood_hunter: ['夺魁回生', '血刃命中首领或精英后，回收更多已支付生命。'],
    w20_blood_reserve: ['续命血符', '启动血契时获得短时护盾，保护支付生命后的窗口。'],
    w20_blood_feast: ['赤宴余时', '主动窗口延长两秒，争取更多命中和返还。'],
  },
  sanctum_verdict: {
    w20_sanctum_purify: ['净厄金光', '裁决解除自身破甲状态，能接住下一次危险攻击。'],
    w20_sanctum_reach: ['外环日耀', '裁决覆盖更多周围敌人，适合先处理护卫。'],
    w20_sanctum_patience: ['守誓明光', '冲刺后第一次裁决只消耗一半护盾。'],
    w20_sanctum_heal: ['护生光返', '裁决命中首领与精英时少量回血。'],
  },
};

function buildRouteCards() {
  const cards = {};
  for (const [direction, options] of Object.entries(routeCards)) {
    for (const [key, [name, desc]] of Object.entries(options)) {
      cards[key] = {
        key, name, desc, icon: ROUTE_DIRECTIONS[direction].icon, tag: ROUTE_DIRECTIONS[direction].name,
        behaviorTag: desc, directions: [direction], shared: false,
      };
    }
  }
  const directions = Object.keys(routeCards);
  cards.w20_route_ward = {
    key: 'w20_route_ward', name: '还守真诀', icon: '◇', tag: '共用 · 机制产盾',
    behaviorTag: '触发突破效果后生成护盾，间隔 2.5 秒。',
    desc: '触发突破效果后生成 22 护盾，间隔 2.5 秒。', directions, shared: true,
  };
  cards.w20_route_interrupt = {
    key: 'w20_route_interrupt', name: '破隙留痕', icon: '◇', tag: '共用 · 标定强敌',
    behaviorTag: '核心触发让强敌易伤。',
    desc: '突破伤害命中首领或精英时，施加 2.5 秒易伤。', directions, shared: true,
  };
  return cards;
}

export const ROUTE_ENHANCEMENTS = buildRouteCards();
