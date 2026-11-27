import { setIconText, withIcons } from '../shared/icons.js';
import { clamp } from '../../core/math.js';
import { getSourceStageSpec } from '../../core/state-queries.js';
import BALANCE from '../../data/balance.js';
import {
  ARTIFACTS, COMBO_LIST, ELEMENTS, GEAR_RARITY_LABELS, HERO_GEAR_SLOTS, HERO_SKILLS,
  SEAL_FUSE_NEED, SEAL_SPECIALIZATIONS, SEAL_TIER_NAMES, SUB_SEAL_RESONANCE, W10_SKILL_BRANCHES,
} from '../../data/index.js';
import { gearListSig } from './build-hud.js';

export function createInspectorUI(runtimeCtx, deps) {
  const { getEl: $, feedback: { toast } } = deps;
  const { getSealStarCap, getSubSealSlotCap, getActiveUnlockNode, getRealmStageLabel } = deps.unlock;
  const { getSealStats, getSynergyCounts, getHeroStats } = deps.hero;
  const { chooseSealRoute, sealTotalPoints, sellSeal, sellSubSeal, isBagSeal, getGearEnhanceCost, getGearEnhanceGoldCost, getGearSellGold, getGearDismantleMaterials, getBagCapacity } = deps.economy;
  const {
    getActiveGearAffixSynergies, gearLabel, describeGearEffect, isGearInstance, normalizeGearInstance,
    unequipGear, equipGearFromBag, enhanceGear, sellBagGear, dismantleBagGear, replaceEquippedGear, claimRewardStashItem,
  } = deps.equipment;
  const { renderAffixChipsHtml, getSkillBreakdown } = deps.formatters;
  const { getTelemetryReport } = deps.run;
  let lastInspKey = '';

  function renderInspector(force){
    const panel = $('inspector');
    const game = runtimeCtx.game;
    const dialog = $('inspectorDialog');
    if (!game.inspTarget || game.activeModal) {
      if (dialog?.open) dialog.close();

      if (!panel.hidden) { panel.hidden = true; lastInspKey = ''; }
      return;
    }
    const clock = $('inspectClock');
    if (clock) {
      clock.hidden = !game.finalPrep?.started || !game.finalPrep.active;
      if (!clock.hidden) clock.textContent = '终局整备 ' + Math.ceil(game.finalPrep.timer) + ' 秒';
    }
    if (dialog && !dialog.open) dialog.showModal?.();
    if (game.inspTarget.type === 'seal') {
      const a = game.seal;
      if (!a && !game.subSeals.length) { game.inspTarget = null; if (dialog?.open) dialog.close(); panel.hidden = true; lastInspKey = ''; return; }
      const cap = getSealStarCap();
      const subCap = getSubSealSlotCap();
      const subSig = game.subSeals.map(s => `${s.kind}:${s.star}:${s.prog}`).join(',');
      const key = ['S', a?.kind || 'none', a?.star || 0, a?.prog || 0, a?.route || '', game.gold, cap, subCap, subSig, gearListSig(game.hero.gear), Math.floor((a?.dmgDealt || 0) / 50)].join('|');
      if (!force && key === lastInspKey && !panel.hidden) return;
      lastInspKey = key;
      panel.hidden = false;

      if (a) {
        const spec = ARTIFACTS[a.kind], st = getSealStats(a);
        const routeSpec = a.route ? SEAL_SPECIALIZATIONS[a.elem]?.[a.route] : null;
        setIconText($('inspTitle'), `${spec.icon} 主:${spec.name} ${'★'.repeat(a.star)} ${SEAL_TIER_NAMES[a.star]}${routeSpec ? ` · ${routeSpec.name}` : ''}`);
        $('inspSub').textContent = `[唯一主灵印 + ${subCap} 辅灵印共鸣阵盘] ${spec.desc}`;
        $('inspStats').innerHTML = `
        <div class="stat-box">爆发伤害 <b>${st.dmg}</b><span class="sub">含辅印与领主全局加成</span></div>
        <div class="stat-box">触发内置CD <b>${st.cd.toFixed(2)}s</b><span class="sub">命中即从受击点扩散</span></div>
        <div class="stat-box">主印星阶 <b>${a.star}★ / 上限${cap}★</b><span class="sub">${a.star>=5?'已达巅峰仙印':`下星进度 ${a.prog}/${SEAL_FUSE_NEED[a.star]}`}</span></div>
        <div class="stat-box">3★ 专精路线 <b>${routeSpec ? routeSpec.name : (a.star >= 3 ? '待选择' : '3★解锁')}</b><span class="sub">${routeSpec ? routeSpec.tag : '免费稳健 vs 35金专精'}</span></div>
      `;
      } else {
        setIconText($('inspTitle'), `✨ 灵印阵盘`);
        $('inspSub').textContent = `主灵印未铭刻 · 辅印槽 ${game.subSeals.length}/${subCap}`;
        $('inspStats').innerHTML = '';
      }
      $('inspSlotLbl').hidden = true;
      $('inspSlots').replaceChildren();
      const fxWrap = $('inspGearFx');
      fxWrap.replaceChildren();
      if (a) {
        const el = ELEMENTS[a.elem];
        const r1 = document.createElement('div');
        r1.className = 'gear-fx-row';
        r1.innerHTML = withIcons(`<b>[2层羁绊 · 3★激活]</b> ${el.t1} ${getSynergyCounts()[a.elem] >= 2 ? '✅' : '🔒'}`);
        const r2 = document.createElement('div');
        r2.className = 'gear-fx-row';
        r2.innerHTML = withIcons(`<b>[4层终极 · 5★激活]</b> ${el.t2} ${getSynergyCounts()[a.elem] >= 4 ? '✅' : '🔒'}`);
        fxWrap.append(r1, r2);

        // Stage 2: 3★ Same-Element Seal Specialization Route comparison & choice
        const routes = SEAL_SPECIALIZATIONS[a.elem];
        if (routes) {
          const routeRow = document.createElement('div');
          routeRow.className = 'gear-fx-row';
          if (a.route && routes[a.route]) {
            routeRow.innerHTML = withIcons(`<b>✨ 已选 3★ 专精【${routes[a.route].name}】</b>（${routes[a.route].tag}）：${routes[a.route].desc}`);
          } else if (a.star >= 3) {
            routeRow.innerHTML = withIcons(`<b>⚡ 3★ 专精节点二选一（金币取舍）：</b><br>• <b>${routes.standard.name}</b>（免费）：${routes.standard.desc}<br>• <b>${routes.mastery.name}</b>（${routes.mastery.cost} 金）：${routes.mastery.desc}`);
          } else {
            routeRow.innerHTML = withIcons(`<b>🔒 3★ 专精节点预览</b>：主印升至 3★ 后可在【${routes.standard.name}(免费)】与【${routes.mastery.name}(${routes.mastery.cost}金)】间择一！`);
          }
          fxWrap.append(routeRow);
        }
      }
      for (let i = 0; i < game.subSeals.length; i++) {
        const sub = game.subSeals[i];
        const sp = ARTIFACTS[sub.kind], res = SUB_SEAL_RESONANCE[sub.elem];
        const row = document.createElement('div');
        row.className = 'gear-fx-row';
        row.innerHTML = withIcons(`<b>${sp.icon} 辅印 ${i+1} · ${res.name} ${sub.star}★</b>（进度 ${sub.star>=3?'满3★':`${sub.prog}/${SEAL_FUSE_NEED[sub.star]}`}）：${res.desc(sub.star)}`);
        fxWrap.append(row);
      }

      $('inspSkillLbl').hidden = true;
      $('inspSkills').replaceChildren();
      const acts = $('inspActions');
      acts.replaceChildren();
      if (a && a.star >= 3 && !a.route && SEAL_SPECIALIZATIONS[a.elem]) {
        const routes = SEAL_SPECIALIZATIONS[a.elem];
        const bStd = document.createElement('button');
        bStd.type = 'button'; bStd.className = 'btn';
        bStd.innerHTML = withIcons(`<span>✨ 选 ${routes.standard.name}</span><small>免费 (0 金)</small>`);
        bStd.addEventListener('click', () => chooseSealRoute('standard'));
        const bMas = document.createElement('button');
        bMas.type = 'button'; bMas.className = 'btn gold';
        bMas.disabled = game.gold < routes.mastery.cost;
        bMas.innerHTML = withIcons(`<span>🔥 选 ${routes.mastery.name}</span><small>消耗 ${routes.mastery.cost} 金</small>`);
        bMas.addEventListener('click', () => chooseSealRoute('mastery'));
        acts.append(bStd, bMas);
      }
      if (a) {
        const spec = ARTIFACTS[a.kind];
        const sell = document.createElement('button');
        sell.type = 'button'; sell.className = 'btn danger full'; sell.dataset.act = 'sell';
        const refund = Math.round(spec.cost * sealTotalPoints(a) * BALANCE.economy.sealRefundRatio);
        sell.innerHTML = `<span>卸售主灵印</span><small>返还 +${refund} 金</small>`;
        sell.addEventListener('click', sellSeal);
        acts.append(sell);
      }
      game.subSeals.forEach((sub, idx) => {
        const sp = ARTIFACTS[sub.kind];
        const refund = Math.round(sp.cost * sealTotalPoints(sub) * BALANCE.economy.sealRefundRatio);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn danger';
        b.innerHTML = `<span>卸售辅印${idx+1} (${sp.name})</span><small>返还 +${refund} 金</small>`;
        b.addEventListener('click', () => sellSubSeal(idx));
        acts.append(b);
      });
      return;
    }

    // Hero Inspector (Complete Stats + Independent Gear Instances + Affix Synergies + Enhance/Sell/Dismantle + Telemetry!)
    const h = game.hero, hs = getHeroStats();
    const gearSyn = getActiveGearAffixSynergies();
    const skSig = Object.entries(h.skills).map(([k,v])=>`${k}${v}${h.w10Branch?.[k]||''}`).join(',');
    const pkSig = Object.entries(h.perks).map(([k,v])=>`${k}${v}`).join(',');
    const cbSig = Object.keys(h.combos).join(',');
    const dmgBucket = Math.floor(game.stats.dmgTotal / 120);
    const key = ['H', h.realm, h.lv, Math.ceil(h.hp), h.maxHp, game.gold, game.materials, game.transferTokens || 0, (game.rewardStash || []).length, gearListSig(h.gear), skSig, pkSig, cbSig, gearListSig(game.bag), game.telemetry.length, dmgBucket].join('|');
    if (!force && key === lastInspKey && !panel.hidden) return;
    lastInspKey = key;
    panel.hidden = false;

    const activeNode = getActiveUnlockNode();
    const baseDmgPct = 100 + (h.lv - 1) * 8;
    const gearDmgPct = Math.round(hs.gm.dmgPct * 100);
    const leechCap = Math.max(10, Math.round(h.maxHp * 0.055));
    const maxEnhLv = BALANCE.equipment?.materialEnhance?.maxEnhanceLv || 6;
    setIconText($('inspTitle'), `👑 ${getRealmStageLabel()} · Lv.${h.lv}`);
    setIconText($('inspSub'), `按 [C] 开关 · 主印上限 ${getSealStarCap()}★ · 辅印 ${game.subSeals.length}/${getSubSealSlotCap()} · 锻材 ⚙️${game.materials || 0} · 转印符 🔮${game.transferTokens || 0}${hs.mmActive ? ' · 🎯一法破万法!' : ''}`);
    $('inspStats').innerHTML = withIcons(`
    <div class="stat-box">生命 / 护盾 <b>${Math.ceil(h.hp)}/${h.maxHp}</b><span class="sub">护盾 ${Math.ceil(h.shield)} · 移速 ${hs.moveSpd.toFixed(1)}</span></div>
    <div class="stat-box">伤害倍率 <b>${Math.round(hs.dmgMult * 100)}%</b><span class="sub">级${baseDmgPct}% 构+${gearDmgPct}% 节点+${Math.round((activeNode.dmgBonus||0)*100)}%</span></div>
    <div class="stat-box">攻速倍率 <b>${Math.round(hs.aspd * 100)}%</b><span class="sub">神通倍率 ${Math.round(hs.skillDmgMult*100)}%</span></div>
    <div class="stat-box">暴击 / 暴伤 <b>${Math.round(hs.crit*100)}% / ${Math.round(hs.critDmg*100)}%</b><span class="sub">构装暴击 +${Math.round(hs.gm.crit*100)}%</span></div>
    <div class="stat-box">🔥火系引爆 <b>${game.stats.fireDetonations||0}次</b><span class="sub">传递 ${game.stats.fireChainTransfers||0} · 孤立聚焦 ${game.stats.fireFocusedDetonations||0}</span></div>
    <div class="stat-box">❄️冰盾反制 <b>+${game.stats.frostShieldGained||0}盾</b><span class="sub">受击${game.stats.frostHitPulses||0} 冲刺${game.stats.frostDashPulses||0} 满盾${game.stats.frostFullShieldPulses||0}</span></div>
  `);
    $('inspSlotLbl').hidden = false;
    const slots = $('inspSlots');
    slots.replaceChildren();
    for (let s = 0; s < HERO_GEAR_SLOTS; s++) {
      const inst = h.gear[s];
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'gear-slot' + (inst ? ' filled' : '');
      sb.innerHTML = withIcons(inst
        ? `<span style="font-size:16px">${inst.icon}</span><span>${gearLabel(inst)}</span><span style="font-size:9px;opacity:.85">${GEAR_RARITY_LABELS[inst.rarity]}·${inst.slotsCount}槽</span>`
        : '<span>+ 空槽</span><span style="font-size:9.5px">点此穿戴</span>');
      sb.addEventListener('click', () => {
        if (inst) unequipGear(s);
        else {
          const firstGearIdx = runtimeCtx.game.bag.findIndex(x => !isBagSeal(x));
          if (firstGearIdx >= 0) equipGearFromBag(firstGearIdx);
          else toast('构装背包为空，可在底部商店购买或击败精英爆箱获得！', true);
        }
      });
      slots.append(sb);
    }

    const fxWrap = $('inspGearFx');
    fxWrap.replaceChildren();

    // Active Affix Synergies & Missing Affix Upgrade Hints
    if (gearSyn.active.length || gearSyn.hints.length) {
      const synBox = document.createElement('div');
      synBox.className = 'gear-fx-row';
      let html = '<b>⚡ 装备词条联动状态</b>';
      for (const s of gearSyn.active) {
        html += `<span class="syn-badge ${s.badgeClass}"><b>${s.icon} ${s.name}（${s.short}）</b>：${s.desc}</span>`;
      }
      for (const ht of gearSyn.hints) {
        if (ht.state !== 'trio') html += `<span class="syn-badge hint">💡 ${ht.text}</span>`;
      }
      synBox.innerHTML = withIcons(html);
      fxWrap.append(synBox);
    }

    if (h.gear.length) {
      h.gear.forEach((inst, sIdx) => {
        const stSpec = getSourceStageSpec(inst.sourceStage);
        const enhCost = getGearEnhanceCost(inst);
        const enhGold = getGearEnhanceGoldCost?.(inst) ?? 0;
        const row = document.createElement('div');
        row.className = 'gear-fx-row';
        row.innerHTML = withIcons(`
        <div><b>${inst.icon} ${gearLabel(inst)}</b> [${GEAR_RARITY_LABELS[inst.rarity]} · ${stSpec.label} · ${inst.slotsCount}槽]</div>
        <div style="font-size:11px;opacity:.9;margin-top:2px">基础：${describeGearEffect(inst)}</div>
        <div style="margin-top:3px">${renderAffixChipsHtml(inst)}</div>
      `);
        const actRow = document.createElement('div');
        actRow.className = 'gear-act-row';
        const enhBtn = document.createElement('button');
        enhBtn.type = 'button';
        enhBtn.className = 'btn';
        enhBtn.disabled = enhCost === null || (game.materials || 0) < enhCost || game.gold < enhGold;
        setIconText(enhBtn, enhCost === null ? `已满强化 (+${maxEnhLv})` : `⚙️ 锻材强化 (${enhCost}锻材${enhGold ? ` + ${enhGold}金` : ''} → +${inst.enhanceLv + 1})`);
        enhBtn.addEventListener('click', () => enhanceGear({ location: 'equipped', idx: sIdx }));
        const uneqBtn = document.createElement('button');
        uneqBtn.type = 'button';
        uneqBtn.className = 'btn';
        uneqBtn.textContent = '卸回背包';
        uneqBtn.addEventListener('click', () => unequipGear(sIdx));
        actRow.append(enhBtn, uneqBtn);
        row.append(actRow);
        fxWrap.append(row);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'gear-fx-row';
      empty.style.opacity = '0.68';
      empty.textContent = '尚未穿戴构装：可在底部商店购买带词条构装，或击败精英/妖碑爆箱后点击背包穿戴。';
      fxWrap.append(empty);
    }

    // Bag Management: Equip/Replace, Enhance, Sell (Gold), Dismantle (Materials) + Safe Bag Seals + Stash
    const acts = $('inspActions');
    acts.replaceChildren();
    if (game.bag.length) {
      game.bag.forEach((inst, idx) => {
        if (isBagSeal(inst)) {
          const spec = ARTIFACTS[inst.kind] || { cost: 22, name: inst.name || '灵印' };
          const pts = inst.star === 3 ? 4 : inst.star === 2 ? 2 : 1;
          const sellVal = Math.max(8, Math.round(spec.cost * pts * 0.65));
          const disMats = Math.max(1, (inst.star || 1) * 2);
          const card = document.createElement('div');
          card.className = 'gear-fx-row';
          card.style.width = '100%';
          card.innerHTML = withIcons(`<div><b>🎒 ${inst.icon || '✨'} ${inst.name} ${inst.star}★</b> [未装备灵印 · 安全收纳不覆盖主印]</div>`);
          const rowBtns = document.createElement('div');
          rowBtns.className = 'gear-act-row';
          const sellBtn = document.createElement('button');
          sellBtn.type = 'button'; sellBtn.className = 'btn';
          setIconText(sellBtn, `💰出售(+${sellVal}金)`);
          sellBtn.addEventListener('click', () => sellBagGear(idx));
          const disBtn = document.createElement('button');
          disBtn.type = 'button'; disBtn.className = 'btn';
          setIconText(disBtn, `🔧拆解(+${disMats}锻材)`);
          disBtn.addEventListener('click', () => dismantleBagGear(idx));
          rowBtns.append(sellBtn, disBtn);
          card.append(rowBtns);
          acts.append(card);
          return;
        }
        const g = isGearInstance(inst) ? inst : normalizeGearInstance(inst);
        const stSpec = getSourceStageSpec(g.sourceStage);
        const sellVal = getGearSellGold(g);
        const disMats = getGearDismantleMaterials(g);
        const enhCost = getGearEnhanceCost(g);
        const enhGold = getGearEnhanceGoldCost?.(g) ?? 0;
        const card = document.createElement('div');
        card.className = 'gear-fx-row';
        card.style.width = '100%';
        card.innerHTML = withIcons(`
        <div><b>🎒 ${g.icon} ${gearLabel(g)}</b> [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽]</div>
        <div style="margin-top:2px">${renderAffixChipsHtml(g)}</div>
      `);
        const rowBtns = document.createElement('div');
        rowBtns.className = 'gear-act-row';
        const eqBtn = document.createElement('button');
        eqBtn.type = 'button'; eqBtn.className = 'btn';
        if (h.gear.length < HERO_GEAR_SLOTS) {
          eqBtn.textContent = '穿戴';
          eqBtn.addEventListener('click', () => equipGearFromBag(idx));
        } else {
          eqBtn.textContent = '替换槽1';
          eqBtn.addEventListener('click', () => replaceEquippedGear(0, idx));
        }
        const enhBtn = document.createElement('button');
        enhBtn.type = 'button'; enhBtn.className = 'btn';
        enhBtn.disabled = enhCost === null || (game.materials || 0) < enhCost || game.gold < enhGold;
        setIconText(enhBtn, enhCost === null ? '满强化' : `⚙️强化(${enhCost}材${enhGold ? ` + ${enhGold}金` : ''})`);
        enhBtn.addEventListener('click', () => enhanceGear({ location: 'bag', idx }));
        const sellBtn = document.createElement('button');
        sellBtn.type = 'button'; sellBtn.className = 'btn';
        setIconText(sellBtn, `💰出售(+${sellVal}金)`);
        sellBtn.addEventListener('click', () => sellBagGear(idx));
        const disBtn = document.createElement('button');
        disBtn.type = 'button'; disBtn.className = 'btn';
        setIconText(disBtn, `🔧拆解(+${disMats}锻材)`);
        disBtn.addEventListener('click', () => dismantleBagGear(idx));
        rowBtns.append(eqBtn, enhBtn, sellBtn, disBtn);
        card.append(rowBtns);
        acts.append(card);
      });
    }
    if (game.rewardStash && game.rewardStash.length) {
      game.rewardStash.forEach((entry, sIdx) => {
        const it = entry.item;
        const card = document.createElement('div');
        card.className = 'gear-fx-row';
        card.style.width = '100%';
        card.innerHTML = withIcons(`<div><b>📦 暂存箱 #${sIdx + 1} · ${it.icon || '✨'} ${it.name}</b> [背包满溢安全暂存]</div>`);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn gold';
        btn.disabled = game.bag.length >= getBagCapacity();
        btn.textContent = game.bag.length >= getBagCapacity() ? '背包满（清理后取出）' : '取出放入背包';
        btn.addEventListener('click', () => claimRewardStashItem(sIdx));
        card.append(btn);
        acts.append(card);
      });
    }

    $('inspSkillLbl').hidden = false;
    const sl = $('inspSkills');
    sl.replaceChildren();

    const totalDmg = Math.max(1, game.stats.dmgTotal);
    const skillKeys = Object.keys(h.skills).filter(k => h.skills[k] > 0);
    for (const k of skillKeys) {
      const lv = h.skills[k];
      const info = getSkillBreakdown(k, lv, hs);
      const dealt = game.stats.skillDmg?.[k] || 0;
      const pct = game.stats.dmgTotal ? Math.round(dealt * 100 / totalDmg) : 0;
      const bKey = h.w10Branch?.[k];
      const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
      const card = document.createElement('div');
      card.className = 'skill-card';
      card.innerHTML = withIcons(`
      <div class="sh"><span>${info.name}${bSpec ? ` · <b style="color:#ffd878">[W10:${bSpec.name}]</b>` : ''}</span><span class="lv">${info.lvText}${k !== 'berserk' ? ` · 输出 ${dealt.toLocaleString()} (${pct}%)` : ''}</span></div>
      <div class="dmg">${info.cur}</div>
      ${bSpec ? `<div class="dmg" style="color:#9ef6ff">${bSpec.icon} ${bSpec.tag}：${bSpec.desc}</div>` : ''}
      <div class="next">⬆ ${info.next}</div>
    `);
      sl.append(card);
    }

    // Combo Recipes section
    const cbHead = document.createElement('div');
    cbHead.className = 'insp-sec-lbl';
    cbHead.textContent = `配方组合技（${Object.keys(h.combos).length}/4 · 需两技总等级≥3）`;
    sl.append(cbHead);
    for (const c of COMBO_LIST) {
      const unlocked = activeNode.comboTier >= c.realm;
      const active = !!h.combos[c.key];
      const sumLv = c.req.reduce((s, rk) => s + (h.skills[rk] || 0), 0);
      const row = document.createElement('div');
      row.className = 'skill-card';
      row.style.opacity = unlocked ? '1' : '0.55';
      const reqTxt = c.req.map(rk => `${HERO_SKILLS[rk].name}(Lv.${h.skills[rk]||0})`).join(' + ');
      row.innerHTML = withIcons(unlocked
        ? `<div class="sh"><span>${c.icon} ${c.name}</span><span class="lv" style="color:${active?'#7ce896':'#95b3ae'}">${active?'已觉醒':`进度 ${sumLv}/3`}</span></div><div class="dmg">${reqTxt} · ${c.desc}</div>`
        : `<div class="sh"><span>🔒 ${c.name}</span><span class="lv">需【${c.realm === 1 ? 'W6 筑基节点' : 'W10 突破节点'}】解锁</span></div>`);
      sl.append(row);
    }

    // Wave Telemetry Report section
    const rep = getTelemetryReport();
    const telHead = document.createElement('div');
    telHead.className = 'insp-sec-lbl';
    setIconText(telHead, `📊 近期战况（已过 ${rep.summary.wavesCleared} 波 · 最低血 ${rep.summary.lowestHpPct}%）`);
    sl.append(telHead);
    const telBox = document.createElement('div');
    telBox.className = 'skill-card';
    if (!rep.waves.length) {
      telBox.innerHTML = `<div class="dmg" style="opacity:.75">完成第 1 波后自动生成各波耗时、受击、最低血量、跑动与秒伤波形。</div>`;
    } else {
      const rows = rep.waves.slice(-6).map(w => {
        const stress = clamp(100 - w.minHpPct + w.hitsTaken * 5, 10, 100);
        const barCol = w.kind === 'peak' ? '#ff5c42' : w.kind === 'relief' ? '#7ce896' : '#5cc8ff';
        return `<tr><td>W${w.wave}</td><td><span class="tel-bar" style="width:${Math.round(stress*0.35)}px;background:${barCol}"></span>${w.phaseTag.slice(0,2)}</td><td>${w.duration}s</td><td style="color:${w.minHpPct<35?'#ff7b6b':'#9bf2d0'}">${w.minHpPct}%</td><td>${w.hitsTaken}</td><td>${w.moveDist}</td></tr>`;
      }).join('');
      telBox.innerHTML = `<table class="tel-table"><tr><th>波</th><th>波形</th><th>耗时</th><th>低血</th><th>受击</th><th>走位</th></tr>${rows}</table>`;
    }
    sl.append(telBox);
  }

  function resetDirty() {
    lastInspKey = '';
  }

  return { renderInspector, resetDirty };
}
