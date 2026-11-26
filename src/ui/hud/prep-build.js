import { getBuildRoute } from '../../core/state-queries.js';
import { GEARS, HERO_GEAR_SLOTS } from '../../data/index.js';
import { gearBase, gearLabel } from '../../systems/equipment/index.js';
import { gearIcon, icon, SKILL_ICON } from '../shared/icons.js';
import { gearListSig } from './build-hud.js';

const METRICS = [
  { label: '生命', field: 'hp', suffix: '', precision: 0 },
  { label: '神通伤害', field: 'dmg', suffix: '%', precision: 0 },
  { label: '攻速', field: 'speed', suffix: '%', precision: 0 },
  { label: '暴击', field: 'crit', suffix: '%', precision: 0 },
];

export function createPrepBuild(runtimeCtx, deps) {
  const { getEl, hero, equipment } = deps;
  let previousGame = null;
  let previousWave = 0;
  let lastSummary = '';
  let lastSlots = null;
  let previous = null;
  let delta = null;

  function renderPrepBuild() {
    const game = runtimeCtx.game;
    if (game.phase !== 'prep' || !hero.getHeroStats) {
      previous = null;
      return;
    }
    const h = game.hero;
    const route = getBuildRoute(game);
    const synergies = equipment.getActiveGearAffixSynergies();
    const active = synergies.active || [];
    const owned = synergies.affixIds || [];
    const n = route?.affixes.filter(a => owned.includes(a)).length;
    const gearSig = gearListSig(h.gear);
    const hs = hero.getHeroStats();
    const current = { hp: h.hp, dmg: (hs.skillDmgMult - 1) * 100, speed: hs.aspd * 100, crit: hs.crit * 100 };

    if (game !== previousGame || game.wave !== previousWave || !previous) {
      previousGame = game;
      previousWave = game.wave;
      lastSummary = '';
      lastSlots = null;
      delta = null;
    }
    const metricsKey = METRICS.map(({ field }) => Math.round(current[field])).join(':');
    const summaryKey = [metricsKey, route?.direction, n, h.maxHp, ...active.map(s => s.id)].join('|');
    if (summaryKey !== lastSummary) {
      lastSummary = summaryKey;
      if (previous) delta = Object.fromEntries(METRICS.map(({ field }) => [field, Math.round(current[field] - previous[field])]));
      else delta = null;
      const stats = getEl('prepStats');
      stats.innerHTML = METRICS.map(({ label, field, suffix, precision }) => {
        const change = delta?.[field];
        const value = current[field].toFixed(precision);
        const after = field === 'hp' ? `/${h.maxHp}` : suffix;
        return `<div class="prep-metric"><span>${label}</span><strong>${value}<small>${after}</small></strong>${change ? `<em class="stat-delta ${change > 0 ? 'gain' : 'loss'}">${change > 0 ? '+' : ''}${change}${suffix}</em>` : ''}</div>`;
      }).join('');
      getEl('prepBuildRoute').innerHTML = route
        ? `<div class="prep-route">${icon(SKILL_ICON[route.skill])}<strong>${route.name}</strong><span>${n}/${route.affixes.length} 词条</span></div>`
        : '<div class="prep-route">选择开局神通后显示路线</div>';
      const synergy = getEl('prepSynergy');
      synergy.textContent = active.length ? active.map(s => `${s.name} · ${s.tier === 3 ? '三' : '双'}联动`).join(' / ')
        : route && n > 0 ? '继续收集同系词条以激活联动' : '联动将在穿戴后激活';
    }
    previous = current;
    if (gearSig === lastSlots) return;
    lastSlots = gearSig;
    const slots = getEl('prepGearSlots');
    slots.replaceChildren();
    for (let i = 0; i < HERO_GEAR_SLOTS; i++) {
      const piece = h.gear[i];
      const spec = GEARS[gearBase(piece)];
      const box = document.createElement('div');
      box.className = 'loadout-slot' + (piece ? ` ${piece.rarity || spec?.rarity || 'common'}` : ' empty');
      box.title = piece ? equipment.describeGearEffect(piece) : `空槽 ${i + 1}`;
      box.innerHTML = `${icon(piece ? gearIcon(spec) : 'rune')}<span>${piece ? gearLabel(piece) : '空槽'}</span>`;
      slots.append(box);
    }
  }

  // Dirty resets also happen during ordinary UI refreshes, so preserve real stat deltas.
  return { renderPrepBuild };
}
