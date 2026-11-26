import { getBuildRoute, getSourceStageSpec } from '../../core/state-queries.js';
import { ARTIFACTS, ELEMENTS, GEAR_AFFIXES, GEAR_RARITY_LABELS, GEARS, HERO_GEAR_SLOTS, PILLS, SUB_SEAL_RESONANCE } from '../../data/index.js';
import { ELEMENT_ICON, gearIcon, icon, withoutIcons } from '../shared/icons.js';
import { gearListSig } from './build-hud.js';

const SEAL_EFFECT = {
  wind: '穿透风刃', fire: '爆炸与灼烧', frost: '冰环减速', thunder: '连锁闪电', holy: '十字圣光',
};

const PILL_EFFECT = {
  xp: ['修为 +35%', '按当前升级经验计'], heal: ['生命 +65', '护盾 +25'], temper: ['锻材 +2', '生命 +25'],
};

const MECHANICS = {
  windFlow: '回锋', stormLoad: '蓄雷', bloodRite: '血契', holyOath: '裁决', fireMarkChance: '火标',
  fireDetonateBonus: '引爆', frostShieldCapBonus: '寒盾', shieldedDmgPct: '持盾', extraShot: '弹道',
  crit: '暴击', critDmg: '暴伤', splashBonus: '溅射', slowOnHit: '减速', chainProc: '连锁',
  lifesteal: '吸血', dmgReduce: '减伤', bonusGold: '金币', rangePct: '射程', aspd: '攻速',
};

function linkedUpgrade(gear, candidate, evaluate) {
  if (!evaluate) return null;
  const previous = evaluate(gear).active;
  const scenarios = gear.length < HERO_GEAR_SLOTS
    ? [[...gear, candidate]] : gear.map((_, i) => gear.map((item, j) => i === j ? candidate : item));
  let best = null;
  for (let i = 0; i < scenarios.length; i++) {
    const active = evaluate(scenarios[i]).active;
    const lost = previous.filter(before => !active.some(after => after.chain === before.chain && after.tier >= before.tier));
    for (const link of active) {
      if (previous.some(before => before.chain === link.chain && before.tier >= link.tier)) continue;
      if (!best || link.tier > best.link.tier || (link.tier === best.link.tier && lost.length < best.lost.length)) {
        best = { link, slot: gear.length >= HERO_GEAR_SLOTS ? i + 1 : null, lost };
      }
    }
  }
  return best;
}

export function getOfferBuildFit(game, gear, evaluateEquipmentSynergies) {
  const route = getBuildRoute(game);
  const routeMatch = route && (route.gear.includes(gear.baseKey)
    || route.affixes.some(id => gear.affixes?.some(a => a?.id === id))
    || (gear.elem === route.elem && route.skill !== 'berserk'));
  return { route: routeMatch ? route : null, upgrade: linkedUpgrade(game.hero.gear, gear, evaluateEquipmentSynergies) };
}

function gearCard(item, game, { describeGearEffect, evaluateEquipmentSynergies }) {
  const gear = item.gear;
  const spec = GEARS[gear.baseKey];
  const element = ELEMENTS[gear.elem];
  const affixes = (gear.affixes || []).filter(a => GEAR_AFFIXES[a?.id]).map(a => GEAR_AFFIXES[a.id].name);
  const { route, upgrade } = getOfferBuildFit(game, gear, evaluateEquipmentSynergies);
  const mod = spec?.mod || {};
  const mechanism = Object.keys(mod).map(k => MECHANICS[k]).find(Boolean);
  const tags = [element?.name, mechanism].filter(Boolean);
  const linkName = upgrade?.link.name.replace(/·圆满$/, '');
  const hint = upgrade
    ? `${upgrade.link.tier === 3 ? '可成三联动' : '可成双联动'} · ${linkName}`
    : route ? `契合${route.name}` : '';
  const effects = (describeGearEffect(gear) || spec?.desc || '').split(' · ');
  const line = [`${gear.slotsCount || 0} 槽`, ...affixes].join(' · ');
  const rarity = GEAR_RARITY_LABELS[gear.rarity] || '凡品';
  return {
    glyph: gearIcon(spec), name: gear.name, rarity, quality: gear.rarity, color: element?.color,
    effects, tags, line, hint, link: Boolean(upgrade), matched: Boolean(route),
    detail: [`${gear.name} · ${rarity} · ${getSourceStageSpec(gear.sourceStage).label}`, ...effects, line, hint,
      upgrade?.slot ? `替换第 ${upgrade.slot} 槽时可达成` : ''].filter(Boolean).join('\n'),
  };
}

function sealCard(item, game, cap, subCap) {
  const spec = ARTIFACTS[item.kind];
  const level = item.star || 1;
  const star = spec.stars[level - 1];
  const sameMain = game.seal?.kind === item.kind;
  const sub = game.subSeals.find(s => s.kind === item.kind);
  const atCap = (sameMain && game.seal.star >= cap) || (sub && sub.star >= 3);
  const points = level === 3 ? 4 : level === 2 ? 2 : 1;
  const line = atCap ? '当前星级已满' : sameMain ? `主印融合 +${points}`
    : sub ? `辅印融合 +${points}` : !game.seal ? '铭刻主灵印'
      : game.subSeals.length < subCap ? '可加入空辅印槽' : '可转修主印';
  const route = getBuildRoute(game);
  const matched = route?.elem === spec.elem;
  const hint = matched ? `契合${route.name}` : '';
  return {
    glyph: ELEMENT_ICON[spec.elem], name: spec.name, rarity: `${level} 星灵印`,
    quality: level >= 3 ? 'epic' : level === 2 ? 'rare' : 'common',
    effects: [SEAL_EFFECT[item.kind], `基础伤害 ${star.dmg}`], tags: [ELEMENTS[spec.elem].name], line,
    color: ELEMENTS[spec.elem].color, atCap, matched, hint,
    detail: `${spec.name} ${level} 星\n${spec.desc}\n辅印 ${SUB_SEAL_RESONANCE[item.kind].desc(level)}\n${line}`,
  };
}

function createCardNode(container, index, preview) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shop-card';
  button.dataset.shopIdx = String(index);
  button.innerHTML = '<span class="offer-flag"></span><span class="offer-top"><span class="ic"></span><span class="offer-heading"><span class="offer-grade"></span><span class="nm"></span></span></span><span class="offer-tags"></span><span class="offer-effects"></span><span class="offer-affixes"></span><span class="cost"></span>';
  button.addEventListener('click', () => preview(index));
  container.append(button);
  return {
    button, id: null, purchased: false,
    flag: button.querySelector('.offer-flag'), picture: button.querySelector('.ic'),
    grade: button.querySelector('.offer-grade'), name: button.querySelector('.nm'), tags: button.querySelector('.offer-tags'),
    effects: button.querySelector('.offer-effects'), affixes: button.querySelector('.offer-affixes'), cost: button.querySelector('.cost'),
  };
}

export function createShopCards(runtimeCtx, deps) {
  const { getEl, economy, equipment, unlock, audio } = deps;
  let lastKey = '';
  let nodes = null;

  function renderShop(force) {
    const game = runtimeCtx.game;
    const cap = unlock.getSealStarCap();
    const subCap = unlock.getSubSealSlotCap();
    const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}` : '';
    const route = getBuildRoute(game)?.direction;
    const key = [sealSig, cap, subCap, route, gearListSig(game.hero.gear),
      ...game.subSeals.map(s => `${s.kind}:${s.star}:${s.prog}`),
      ...game.shop.map(s => `${s.uid}:${s.bought}:${s.cost}:${game.gold >= s.cost}`)].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;

    const container = getEl('shopSec');
    if (!nodes) {
      nodes = Array.from({ length: 4 }, (_, i) => createCardNode(container, i, index => {
        audio.unlock();
        const item = runtimeCtx.game.shop[index];
        if (item && !item.bought) economy.openShopPurchaseConfirm(index);
      }));
    }

    nodes.forEach((node, i) => {
      const item = game.shop[i];
      node.button.hidden = !item;
      if (!item) return;
      const pill = PILLS[item.pillKey];
      const view = item.itemType === 'gear' && item.gear ? gearCard(item, game, equipment)
        : item.itemType === 'pill' ? {
          glyph: 'pill', name: pill.name, rarity: '丹药', quality: 'common',
          effects: PILL_EFFECT[item.pillKey] || [pill.desc], tags: [], line: '购买即使用', detail: pill.desc,
        } : sealCard(item, game, cap, subCap);
      const entering = node.id !== item.uid;
      const purchased = node.id === item.uid && !node.purchased && item.bought;
      const shine = entering && !item.bought && (view.link || view.quality === 'legend' || view.quality === 'epic');
      node.id = item.uid;
      node.purchased = item.bought;
      node.button.className = ['shop-card', view.quality, view.matched && 'route-match', view.link && 'link-match',
        item.bought && 'sold', item.cost > game.gold && 'unaffordable', shine && 'offer-arrived', purchased && 'offer-purchased']
        .filter(Boolean).join(' ');
      node.button.disabled = Boolean(item.bought || view.atCap);
      node.button.title = withoutIcons(view.detail);
      node.button.style.setProperty('--offer-element', view.color || '#92d5be');
      node.flag.textContent = item.bought ? '' : view.hint || '';
      node.flag.hidden = !node.flag.textContent;
      node.picture.innerHTML = icon(view.glyph);
      node.grade.textContent = view.rarity;
      node.name.textContent = view.name;
      node.tags.textContent = view.tags.join(' · ');
      node.effects.innerHTML = view.effects.slice(0, 2).map(effect =>
        `<span>${withoutIcons(effect).replace(/[+-]?\d+(?:\.\d+)?(?:%|格)?/g, value => `<b>${value}</b>`)}</span>`).join('');
      node.affixes.textContent = view.line;
      node.cost.innerHTML = item.bought ? '已收入' : `${icon('coin')} ${item.cost}${item.disc ? ' · 折扣' : ''}`;
    });
  }

  return { renderShop, reset: () => { lastKey = ''; } };
}
