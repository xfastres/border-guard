import { withIcons } from '../shared/icons.js';
import {
  ARTIFACTS, SEAL_SPECIALIZATIONS, SUB_SEAL_RESONANCE, SEAL_FUSE_NEED, ELEMENTS,
  GEAR_AFFIXES, GEAR_SETS, HERO_SKILLS, W10_SKILL_BRANCHES, COMBO_LIST, GEAR_SYNERGIES,
} from '../../data/index.js';
import { isBagSeal } from '../../systems/economy/pricing.js';

export function gearListSig(list){
  return (list || []).map(g => {
    if (!g || typeof g !== 'object') return String(g || '');
    if (isBagSeal(g)) return `seal:${g.uid}:${g.kind}:${g.star}`;
    const af = (g.affixes || []).map(a => a ? `${a.id}:${a.tier || 1}` : '_').join('+');
    return `${g.uid}:${g.enhanceLv || 0}:${g.slotsCount}:${af}`;
  }).join(',');
}

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = value => ' data-detail="' + esc(value) + '" aria-label="' + esc(String(value).split('\n')[0]) + '"';

function renderProgressCard(name, count, max, color, detail) {
  const done = count >= max;
  const bars = Array.from({ length: max }, (_, i) =>
    `<i style="background:${i < count ? color : 'rgba(255,255,255,0.14)'}"></i>`
  ).join('');
  return `<button type="button" class="glance-prog"${attr(detail)}>` +
    `<span class="glance-prog-head"><span>${esc(name)}</span><b class="${done ? 'done' : ''}">${count}/${max}${done ? ' ✓' : ''}</b></span>` +
    `<span class="glance-track">${bars}</span></button>`;
}

export function createBuildHud(runtimeCtx, deps) {
  const { getEl: $ } = deps;
  const { getSynergyCounts, getActiveGearSets, getGearSetCounts, getActiveDualResonances, getSealStats } = deps.hero;
  const { getActiveGearAffixSynergies } = deps.equipment;
  let lastLeftHudKey = '';
  let activeTab = 'build'; // 'build' | 'syn'

  function setLeftTab(tab) {
    activeTab = tab === 'syn' ? 'syn' : 'build';
    $('leftTabBuild')?.classList.toggle('active', activeTab === 'build');
    $('leftTabSyn')?.classList.toggle('active', activeTab === 'syn');
    renderLeftHud(true);
  }

  function renderLeftHud(force){
    const body = $('leftHudBody'), game = runtimeCtx.game;
    const panel = $('leftHud');
    if (panel) panel.hidden = false;
    if (!body || !game) return;
    const h = game.hero;
    const syn = getSynergyCounts(), activeSets = getActiveGearSets(), setCounts = getGearSetCounts();
    const duals = getActiveDualResonances(), affix = getActiveGearAffixSynergies();
    const seal = game.seal;
    const sealStats = seal && getSealStats(seal);
    const key = JSON.stringify([
      activeTab, seal?.kind, seal?.star, seal?.prog, seal?.route, sealStats?.dmg, sealStats?.cd,
      game.subSeals.map(s => [s.kind, s.star]), h.skills, h.w10Branch, h.combos,
      syn, setCounts, affix.affixIds, duals.map(d => d.key || d.name),
    ]);
    if (!force && key === lastLeftHudKey) return;
    lastLeftHudKey = key;

    $('leftTabBuild')?.classList.toggle('active', activeTab === 'build');
    $('leftTabSyn')?.classList.toggle('active', activeTab === 'syn');

    if (activeTab === 'build') {
      // 1. Main + Sub Seals Compact Bar
      let sealHtml = '';
      const subSummary = [0, 1].map(i => {
        const sub = game.subSeals[i];
        if (!sub) return null;
        const sp = ARTIFACTS[sub.kind];
        return `${sp.icon}${sp.name.replace('灵印', '')} ${sub.star}★`;
      }).filter(Boolean).join(' · ');

      if (game.seal) {
        const s = game.seal, sp = ARTIFACTS[s.kind], el = ELEMENTS[s.elem], st = sealStats;
        const route = SEAL_SPECIALIZATIONS[s.elem]?.[s.route];
        const subDetails = game.subSeals.map(sub => {
          const res = SUB_SEAL_RESONANCE[sub.elem];
          return `辅印：${res.name} ${sub.star}★ — ${res.desc(sub.star)}`;
        });
        const detail = [
          `${sp.name} · 主灵印 ${s.star}★`,
          sp.desc,
          `${st.dmg} 伤害 / ${st.cd.toFixed(2)}s · 升阶 ${s.prog}/${SEAL_FUSE_NEED[s.star] || '满阶'}`,
          route ? `${route.name}：${route.desc}` : '',
          `3★：${el.t1}`,
          `5★：${el.t2}`,
          ...subDetails,
        ].filter(Boolean).join('\n');
        sealHtml = `<button type="button" class="glance-seal" data-open-seal style="--item-color:${esc(el.color)}"${attr(detail)}>` +
          `<span class="gs-ic">${esc(sp.icon)}</span>` +
          `<span class="gs-main"><span class="gs-name">${esc(sp.name)} · ${s.star}★</span>` +
          `<span class="gs-sub">${esc(subSummary ? `辅：${subSummary}` : `${st.dmg}伤 / ${st.cd.toFixed(2)}s`)}</span></span></button>`;
      } else {
        sealHtml = `<button type="button" class="glance-seal" data-open-shop style="--item-color:#8aa9a9"${attr('尚未铭刻主灵印 · 点击在商店购买任意五行灵印')}>` +
          `<span class="gs-ic">✨</span><span class="gs-main"><span class="gs-name">未铭刻主灵印</span>` +
          `<span class="gs-sub">点击前往商店购买</span></span></button>`;
      }

      body.innerHTML = withIcons(sealHtml);
    } else {
      // Tab 2: Full Synergies, Set Progress, Element Bonds & Learned Skills
      const progCards = [];
      for (const [k, n] of Object.entries(setCounts)) {
        if (n > 0 && GEAR_SETS[k]) {
          const s = GEAR_SETS[k], active = activeSets.find(a => a.key === k);
          progCards.push(renderProgressCard(
            `${s.icon} ${s.name}`, Math.min(n, 3), 3, s.col,
            [`${s.name} ${n}/3`, `当前：${active?.desc || '未激活'}`, `2件：${s.d2}`, `3件：${s.d3}`].join('\n')
          ));
        }
      }
      for (const ht of (affix.hints || [])) {
        const list = [...ht.present, ...ht.missing], active = affix.active.find(s => s.id === ht.activeId);
        const full = GEAR_SYNERGIES.find(s => s.chain === ht.chain && s.tier === 3);
        const duos = GEAR_SYNERGIES.filter(s => s.chain === ht.chain && s.tier === 2);
        progCards.push(renderProgressCard(
          full?.name || duos[0]?.name || '词条联动',
          ht.present.length, 3,
          ELEMENTS[GEAR_AFFIXES[list[0]]?.elem]?.color || '#9ecbb3',
          [ht.text, `当前：${active?.desc || '未激活'}`, ...list.map(id => (ht.present.includes(id) ? '✓ ' : '缺 ') + (GEAR_AFFIXES[id]?.name || id)), `双联动：${duos[0]?.desc || ''}`, `三联动：${full?.desc || ''}`].join('\n')
        ));
      }
      for (const [k, e] of Object.entries(ELEMENTS)) {
        if (syn[k] > 0) {
          progCards.push(renderProgressCard(
            `${e.icon} ${e.name}`, Math.min(syn[k], 4), 4, e.color,
            [`${e.name} ${syn[k]}/4`, `2层：${e.t1}`, `4层：${e.t2}`].join('\n')
          ));
        }
      }

      const skillChips = Object.entries(h.skills).filter(([, lv]) => lv > 0).map(([k, lv]) => {
        const sp = HERO_SKILLS[k], branch = (W10_SKILL_BRANCHES[k] || []).find(b => b.key === h.w10Branch?.[k]);
        const detail = [`${sp.name} Lv.${lv}/5`, sp.desc(lv), branch?.name, branch?.desc].filter(Boolean).join('\n');
        return `<button type="button" class="glance-skill" data-open-hero${attr(detail)}><span>${esc(sp.icon)} ${esc(sp.name.slice(0, 4))}</span><b>Lv.${lv}${branch ? '★' : ''}</b></button>`;
      }).join('');

      const comboChips = [
        ...COMBO_LIST.filter(c => h.combos[c.key]).map(c => `<span class="glance-chip"${attr(`${c.name}\n${c.desc}`)}>${esc(c.icon)} ${esc(c.name)}</span>`),
        ...duals.map(d => `<span class="glance-chip"${attr(`${d.name}\n${d.desc}`)}>${esc(d.icons)} ${esc(d.name)}</span>`),
      ].join('');

      body.innerHTML = withIcons(
        `<div class="glance-prog-list">${progCards.join('') || '<div class="ui-hint">穿戴构装与灵印后显示羁绊进度</div>'}</div>` +
        (comboChips ? `<div class="glance-syn-row" style="cursor:default">${comboChips}</div>` : '') +
        `<div class="glance-skill-grid">${skillChips || '<span class="ui-hint">尚未习得神通</span>'}</div>`);
    }

    body.querySelectorAll('[data-open-seal]').forEach(btn => btn.addEventListener('click', () => { game.inspTarget = { type: 'seal' }; deps.hudController.renderAllUI(true); }));
    body.querySelectorAll('[data-open-hero]').forEach(btn => btn.addEventListener('click', () => { game.inspTarget = { type: 'hero' }; deps.hudController.renderAllUI(true); }));
    body.querySelectorAll('[data-open-shop]').forEach(btn => btn.addEventListener('click', () => $('shopOpen')?.click()));
  }

  function resetDirty(){ lastLeftHudKey = ''; }
  return { renderLeftHud, resetDirty, setLeftTab };
}
