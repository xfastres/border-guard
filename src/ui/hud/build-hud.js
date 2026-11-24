import { getOwnedDestinyEnhancements, getSourceStageSpec } from '../../core/state-queries.js';
import {
  ARTIFACTS, SEAL_SPECIALIZATIONS, SUB_SEAL_RESONANCE, SEAL_FUSE_NEED, ELEMENTS, HERO_GEAR_SLOTS,
  GEARS, GEAR_AFFIXES, GEAR_RARITY_LABELS, W20_DIRECTIONS, GEAR_SETS, HERO_SKILLS, W10_SKILL_BRANCHES, COMBO_LIST,
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

export function createBuildHud(runtimeCtx, deps) {
  const { getEl: $ } = deps;
  const { getSynergyCounts, getActiveGearSets, getGearSetCounts, getActiveDualResonances, getSealStats } = deps.hero;
  const { getActiveGearAffixSynergies, gearBase, describeGearInstance, gearLabel, unequipGear } = deps.equipment;
  const { getPendingDestinyOffer, isW20PreselectOpen } = deps.progression;
  const { getRealmStageLabel } = deps.unlock;
  const { openW20PreselectModal } = deps.modals;
  let lastLeftHudKey = '';

  function renderLeftHud(force){
    const body = $('leftHudBody');
    const game = runtimeCtx.game;
    const panel = $('leftHud');
    if (panel) panel.hidden = !!game?.inspTarget;
    if (!body || !game) return;
    const h = game.hero;
    const syn = getSynergyCounts();
    const activeSets = getActiveGearSets();
    const setCounts = getGearSetCounts();
    const duals = getActiveDualResonances();
    const gearAffixSyn = getActiveGearAffixSynergies();
    const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}:${game.seal.route || ''}` : '0';
    const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
    const skSig = Object.entries(h.skills).map(([k,v]) => k + v + (h.w10Branch?.[k] || '')).join(',');
    const w20Sig = `${game.wave}:${game.w20State?.preselectedDirection || ''}:${game.w20State?.locked ? 1 : 0}:${h.breakthroughs.w20?.directionKey || ''}:${h.breakthroughs.w20?.enhancementKey || ''}`;
    const destSig = `${game.transferTokens || 0}:${(game.rewardStash || []).length}:${getPendingDestinyOffer()?.offerId || ''}:${Object.keys(h.destinyEnhancements || {}).join(',')}`;
    const key = [
      sealSig, subSig, gearListSig(h.gear), skSig, Object.keys(h.combos).join(','),
      Object.keys(h.perks).join(','), h.realm, h.lv, game.gold, game.materials, w20Sig, destSig
    ].join('|');
    if (!force && key === lastLeftHudKey) return;
    lastLeftHudKey = key;

    let sealHtml = '';
    if (game.seal) {
      const sp = ARTIFACTS[game.seal.kind], st = getSealStats(game.seal);
      const routeSpec = game.seal.route ? SEAL_SPECIALIZATIONS[game.seal.elem]?.[game.seal.route] : null;
      const routeTxt = routeSpec ? ` · ${routeSpec.name}` : (game.seal.star >= 3 ? ' · ⚡可选3★专精' : '');
      sealHtml += '<button type="button" class="bh-item" data-open-seal title="' + sp.desc + '">' +
        '<span class="bh-item-icon">' + sp.icon + '</span><span class="bh-item-main"><b>主灵印 · ' + sp.name + routeTxt + '</b>' +
        '<small>' + '★'.repeat(game.seal.star) + ' · ' + st.dmg + ' 伤害 / ' + st.cd.toFixed(2) + 's</small></span><span class="bh-item-tag">主</span></button>';
    } else {
      sealHtml += '<div class="bh-empty">尚未铭刻主灵印 · 在底部商店选择五行灵印</div>';
    }
    game.subSeals.forEach((sub, idx) => {
      const sp = ARTIFACTS[sub.kind], res = SUB_SEAL_RESONANCE[sub.elem];
      sealHtml += '<button type="button" class="bh-item" data-open-seal title="' + res.desc(sub.star) + '">' +
        '<span class="bh-item-icon">' + sp.icon + '</span><span class="bh-item-main"><b>辅印 ' + (idx + 1) + ' · ' + res.name + '</b>' +
        '<small>' + sub.star + '★ · ' + (sub.star >= 3 ? '已达辅印上限' : '升阶进度 ' + sub.prog + '/' + SEAL_FUSE_NEED[sub.star]) + '</small></span><span class="bh-item-tag">辅</span></button>';
    });

    let synergyHtml = '';
    for (const ek of Object.keys(ELEMENTS)) {
      const cnt = syn[ek] || 0;
      if (!cnt) continue;
      const el = ELEMENTS[ek];
      const state = cnt >= 4 ? '4层终极' : cnt >= 2 ? '2层激活' : cnt + '/2';
      const pct = Math.min(100, cnt / 4 * 100);
      synergyHtml += '<div class="bh-syn-row"><span class="bh-syn-name">' + el.icon + el.name + '</span>' +
        '<span class="bh-syn-track"><i style="width:' + pct + '%;background:' + el.color + '"></i></span>' +
        '<span class="bh-syn-state">' + state + '</span></div>';
    }
    if (!synergyHtml) synergyHtml = '<div class="bh-empty">尚未形成五行羁绊</div>';
    const dualHtml = duals.length
      ? duals.map(d => '<span class="bh-dual">' + d.icons + ' ' + d.name + '</span>').join('')
      : '<span class="bh-section-note">尚未激活双系共鸣</span>';

    const gearSlots = [];
    for (let idx = 0; idx < HERO_GEAR_SLOTS; idx++) {
      const inst = h.gear[idx];
      if (!inst) {
        gearSlots.push('<div class="bh-gear-slot empty">＋ 空槽</div>');
        continue;
      }
      const sp = GEARS[gearBase(inst)] || {};
      const stSpec = getSourceStageSpec(inst.sourceStage || 1);
      const fullDesc = describeGearInstance(inst);
      const safeTitle = String(fullDesc).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      const afShort = (inst.affixes || []).filter(Boolean).map(a => GEAR_AFFIXES[a.id]?.name || a.id).join('·') || '无词条';
      gearSlots.push(
        '<div class="bh-gear-slot">' +
          '<button type="button" class="bh-gear-open" data-open-hero title="' + safeTitle + '">' +
            '<span class="bh-gear-icon">' + (sp.icon || '🧩') + '</span>' +
            '<b>' + gearLabel(inst) + ' [' + (inst.slotsCount || 1) + '槽]</b>' +
            '<small>' + (GEAR_RARITY_LABELS[inst.rarity] || '凡品') + '·' + stSpec.label.slice(0, 3) + ' · ' + afShort + '</small>' +
          '</button>' +
          '<button type="button" class="bh-unequip" data-lh-unequip="' + idx + '" title="卸回背包">×</button>' +
        '</div>'
      );
    }

    let affixSynHtml = '';
    if (gearAffixSyn.active.length) {
      affixSynHtml += gearAffixSyn.active.map(s =>
        `<div class="syn-badge ${s.badgeClass}"><b>${s.icon} ${s.name}（${s.short}）</b><br>${s.desc}</div>`
      ).join('');
    }
    const nonTrioHints = (gearAffixSyn.hints || []).filter(ht => ht.state !== 'trio');
    if (nonTrioHints.length) {
      affixSynHtml += nonTrioHints.map(ht => `<div class="syn-badge hint">💡 ${ht.text}</div>`).join('');
    }
    if (!affixSynHtml) {
      affixSynHtml = '<div class="bh-section-note">尚未激活词条联动 · 凑齐火系(炽炎烙印/爆燃核心/余烬连环)或冰系(寒霜侵骨/凝冰护心/凛冬反震)激活双/三联动</div>';
    }

    // Stage 3 W20 Preselect / Active Breakthrough card in Left HUD
    let w20HudHtml = '';
    if (h.breakthroughs.w20 && !h.breakthroughs.w20.placeholder) {
      const w20 = h.breakthroughs.w20;
      w20HudHtml =
        '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ W20 第二次突破</span><span>已生效</span></div>' +
          '<div class="syn-badge ' + (w20.directionKey === 'frost_bastion_counter' ? 'frost' : 'fire') + '">' +
            '<b>' + (w20.directionIcon || '⚡') + ' ' + w20.directionName + (w20.enhancementName ? (' × ' + w20.enhancementName) : '') + '</b><br>' +
            (w20.enhancementDesc || w20.baseEffectDesc || '') +
          '</div>' +
        '</div>';
    } else if (isW20PreselectOpen()) {
      const preSpec = game.w20State?.preselectedDirection ? W20_DIRECTIONS[game.w20State.preselectedDirection] : null;
      w20HudHtml =
        '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ W20 方向预选</span><span>W16–W19可调</span></div>' +
          '<button type="button" class="bh-item" data-open-w20-preselect>' +
            '<span class="bh-item-icon">' + (preSpec ? preSpec.icon : '⚡') + '</span>' +
            '<span class="bh-item-main"><b>' + (preSpec ? ('已预选：' + preSpec.name) : '点击预选 W20 突破方向') + '</b>' +
            '<small>击败 W20 首领拿到突破凭证后，已锁定方向的基础效果才会生效</small></span>' +
            '<span class="bh-item-tag">预选</span>' +
          '</button>' +
        '</div>';
    }

    let setHtml = '';
    for (const [sk, n] of Object.entries(setCounts)) {
      if (!n || !GEAR_SETS[sk]) continue;
      const st = GEAR_SETS[sk];
      if (n >= 2) {
        const active = activeSets.find(x => x.key === sk);
        setHtml += '<div class="bh-set-row">✅ ' + st.icon + st.name + ' · ' + n + '/3' +
          '<small>' + (active ? active.desc : st.d2) + '</small></div>';
      } else {
        setHtml += '<div class="bh-set-row">' + st.icon + st.name + ' · 1/2' +
          '<small>再装备 1 件激活：' + st.d2 + '</small></div>';
      }
    }
    if (!setHtml) setHtml = '<div class="bh-section-note">尚未形成套装 · 同系列构装可激活 2/3 件效果</div>';

    const skillEntries = Object.entries(h.skills).filter(([,v]) => v > 0);
    const skillHtml = skillEntries.length
      ? skillEntries.map(([k, lv]) => {
          const spec = HERO_SKILLS[k];
          const bKey = h.w10Branch?.[k];
          const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
          return '<button type="button" class="bh-skill" data-open-hero title="点击查看详细属性与突破分支">' +
            '<span>' + spec.icon + ' ' + spec.name + (bSpec ? ' · ' + bSpec.name : '') + '</span><b>Lv.' + lv + '</b></button>';
        }).join('')
      : '<div class="bh-empty">尚未习得神通</div>';
    const comboHtml = COMBO_LIST.filter(c => !!h.combos[c.key]).map(c =>
      '<div class="bh-combo">✨ ' + c.icon + ' ' + c.name + ' <b>已觉醒</b></div>'
    ).join('') || '<div class="bh-section-note">组合技 ' + Object.keys(h.combos).length + '/4 · 满足阶段节点与等级条件后觉醒</div>';

    const ownedDestiny = getOwnedDestinyEnhancements(game);
    const destinyHudHtml = ownedDestiny.length
      ? '<div class="lh-sec"><div class="lh-sec-t"><span>🎲 天命专属强化</span><span>' + ownedDestiny.length + ' 项生效</span></div>' +
        ownedDestiny.map(d => '<div class="bh-set-row">' + d.icon + ' <b>' + d.name + '</b><small>' + d.desc + '</small></div>').join('') +
        '</div>'
      : '';

    const sealSlotsUsed = (game.seal ? 1 : 0) + game.subSeals.length;
    body.innerHTML =
      w20HudHtml +
      destinyHudHtml +
      '<div class="lh-sec"><div class="lh-sec-t"><span>✨ 灵印阵盘</span><span>' + sealSlotsUsed + ' 个已占用</span></div>' +
        sealHtml +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>⚡ 装备词条联动</span><span>' + gearAffixSyn.active.length + ' 项激活</span></div>' +
        affixSynHtml +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>🛡️ 构装与套装</span><span>' + h.gear.length + '/' + HERO_GEAR_SLOTS + '</span></div>' +
        '<div class="bh-gear-grid">' + gearSlots.join('') + '</div>' + setHtml +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>🌈 五行羁绊</span><span class="bh-section-note">2 / 4 层</span></div>' +
        synergyHtml + '<div class="bh-dual-list">' + dualHtml + '</div>' +
      '</div>' +
      '<div class="lh-sec"><div class="lh-sec-t"><span>⚔️ 神通与阶段突破</span><span>' + skillEntries.length + ' 项神通</span></div>' +
        '<div class="bh-skill-list">' + skillHtml + '</div>' + comboHtml +
        '<div class="bh-build-footer"><span>节点 ' + getRealmStageLabel() + '</span><span>⚙️' + (game.materials || 0) + ' · 🔮' + (game.transferTokens || 0) + ((game.rewardStash?.length || 0) ? ` · 📦暂存${game.rewardStash.length}` : '') + '</span></div>' +
      '</div>';

    body.querySelectorAll('[data-open-w20-preselect]').forEach(btn => {
      btn.addEventListener('click', () => openW20PreselectModal());
    });
    body.querySelectorAll('[data-open-seal]').forEach(btn => {
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = { type:'seal' };
        deps.hudController.renderAllUI(true);
      });
    });
    body.querySelectorAll('[data-open-hero]').forEach(btn => {
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = { type:'hero' };
        deps.hudController.renderAllUI(true);
      });
    });
    body.querySelectorAll('[data-lh-unequip]').forEach(btn => {
      btn.addEventListener('click', () => unequipGear(Number(btn.dataset.lhUnequip)));
    });
  }

  function resetDirty() {
    lastLeftHudKey = '';
  }

  return { renderLeftHud, resetDirty };
}
