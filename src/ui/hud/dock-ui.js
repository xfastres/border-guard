import { getSourceStageSpec } from '../../core/state-queries.js';
import {
  ARTIFACTS, DUAL_RESONANCES, ELEMENTS, GEAR_AFFIXES, GEAR_RARITY_LABELS, HERO_SKILLS,
  PILLS, SEAL_FUSE_NEED, SUB_SEAL_RESONANCE, W10_SKILL_BRANCHES,
} from '../../data/index.js';
import { gearListSig } from './build-hud.js';

export function createDockUI(runtimeCtx, deps) {
  const { getEl: $, audio, feedback: { toast } } = deps;
  const { getSealStarCap, getSubSealSlotCap } = deps.unlock;
  const { getShopElemBuyCount, isBagSeal, getGearSellGold, getGearDismantleMaterials, openShopPurchaseConfirm, buyShopItem } = deps.economy;
  const {
    getGearSynergyHints, evaluateItemSynergies, describeGearEffect, isGearInstance, normalizeGearInstance,
    describeGearInstance, equipGearFromBag, dismantleBagGear, sellBagGear,
  } = deps.equipment;
  let lastArtKey = '', lastSkillKey = '', lastShopKey = '', lastBagKey = '';
  let shopCardNodes = null;

  function renderSealStrip(force){
    const game = runtimeCtx.game;
    const s = game.seal;
    const cap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
    const key = `${s ? `${s.kind}:${s.star}:${s.prog}` : 'none'}:${cap}:${subCap}:${subSig}:${game.inspTarget?.type==='seal'?1:0}`;
    if (!force && key === lastArtKey) return;
    lastArtKey = key;
    const wrap = $('sealStrip');
    if (!wrap) return;
    wrap.replaceChildren();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seal-badge';
    if (!s) {
      btn.textContent = `✨ 未铭刻主灵印（上限 ${cap}★）`;
      btn.addEventListener('click', () => toast('点击底栏商店任意五行灵印即可铭刻附魔！'));
    } else {
      const spec = ARTIFACTS[s.kind], el = ELEMENTS[s.elem];
      btn.style.borderColor = el.color;
      const synTag = s.star >= 5 ? '4层终极羁绊' : s.star >= 3 ? '2层羁绊激活' : `3★激羁绊`;
      const progTxt = s.star >= 5 ? '满阶' : s.star >= cap ? `需节点升${cap+1}★` : `${s.prog}/${SEAL_FUSE_NEED[s.star]}`;
      btn.innerHTML = `<span>${spec.icon} <b>主:${spec.name}</b> ${'★'.repeat(s.star)}</span><span class="tier-tag">${progTxt}</span><span class="tier-tag" style="color:${el.color}">${synTag}</span>`;
      btn.title = `${spec.desc}\n[2层(3★)] ${el.t1}\n[4层(5★)] ${el.t2}\n点击查看主辅灵印阵盘或卸售`;
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = runtimeCtx.game.inspTarget?.type === 'seal' ? null : { type:'seal' };
        deps.hudController.renderAllUI(true);
      });
    }
    wrap.append(btn);

    // 2 Sub-Seal Resonance Slots (unlocked at W6 and W10 breakthrough)
    for (let i = 0; i < 2; i++) {
      const sub = game.subSeals[i];
      const unlocked = i < subCap;
      const chip = document.createElement('button');
      chip.type = 'button';
      if (sub) {
        const spec = ARTIFACTS[sub.kind], el = ELEMENTS[sub.elem], res = SUB_SEAL_RESONANCE[sub.elem];
        chip.className = 'sub-seal-chip';
        chip.style.borderColor = el.color;
        chip.innerHTML = `${spec.icon} <b>辅:${res.name}</b> ${sub.star}★`;
        chip.title = `${res.desc(sub.star)}\n点击打开灵印阵盘可卸售或查看详情`;
        chip.addEventListener('click', () => {
          runtimeCtx.game.inspTarget = { type:'seal' };
          deps.hudController.renderAllUI(true);
        });
      } else if (unlocked) {
        chip.className = 'sub-seal-chip empty';
        chip.textContent = `+ 辅印${i + 1} (空)`;
        chip.title = '商店购买异系灵印将自动铭刻入辅印槽触发五行共鸣！';
        chip.addEventListener('click', () => toast('在底栏商店购买异系灵印，即可自动装入辅灵印槽触发共鸣！'));
      } else {
        chip.className = 'sub-seal-chip locked';
        chip.textContent = `🔒 辅${i + 1}(${i === 0 ? 'W6' : 'W10突破'})`;
        chip.title = `达成【${i === 0 ? '第 6 波节点' : 'W10 大型突破'}】后解锁第 ${i + 1} 辅灵印共鸣槽`;
      }
      wrap.append(chip);
    }
  }

  function renderSkillStrip(force){
    const game = runtimeCtx.game;
    const entries = Object.entries(game.hero.skills).filter(([,lv]) => lv > 0);
    const key = entries.map(([k,v]) => `${k}:${v}:${game.hero.w10Branch?.[k] || ''}`).join('|');
    if (!force && key === lastSkillKey) return;
    lastSkillKey = key;
    const wrap = $('skillStrip');
    if (!wrap) return;
    wrap.replaceChildren();
    for (const [k, lv] of entries) {
      const spec = HERO_SKILLS[k];
      const bKey = game.hero.w10Branch?.[k];
      const bSpec = bKey ? (W10_SKILL_BRANCHES[k] || []).find(b => b.key === bKey) : null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sk-chip';
      btn.title = `${spec.name} Lv.${lv}/5${bSpec ? ` · W10突破【${bSpec.name}】` : ''}（点击查看详情）`;
      btn.innerHTML = `${spec.icon}<b>Lv.${lv}${bSpec ? '★' : ''}</b>`;
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = { type: 'hero' };
        deps.hudController.renderAllUI(true);
      });
      wrap.append(btn);
    }
  }

  function renderShop(force){
    const cap = getSealStarCap();
    const subCap = getSubSealSlotCap();
    const game = runtimeCtx.game;
    const sealSig = game.seal ? `${game.seal.kind}:${game.seal.star}:${game.seal.prog}:${game.seal.route || ''}` : 'none';
    const subSig = game.subSeals.map(x => `${x.kind}:${x.star}:${x.prog}`).join(',');
    const inW29TimedPrep = !!(game.finalPrep?.active && game.finalPrep?.started);
    const key = `${sealSig}:${cap}:${subCap}:${subSig}:${game.wave}:${inW29TimedPrep ? 1 : 0}|` + game.shop.map(s=>`${s.uid}:${s.itemType}:${s.bought?1:0}:${s.cost}:${s.star||0}:${s.pillKey||''}:${s.gear?.uid||''}:${game.gold>=s.cost?1:0}`).join('|');
    if (!force && key === lastShopKey) return;
    lastShopKey = key;

    const sec = $('shopSec');
    if (!shopCardNodes) {
      sec.replaceChildren();
      shopCardNodes = [];
      for (let idx = 0; idx < 4; idx++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-card';
        btn.dataset.shopIdx = String(idx);
        btn.innerHTML = `<span class="elem-dot"></span><span class="merge-tag" hidden></span><span class="ic"></span><span class="nm"></span><span class="cost"></span>`;
        btn.addEventListener('click', () => {
          audio.unlock();
          const game = runtimeCtx.game;
          if (game.shop[idx]?.bought) return;
          if (game.finalPrep?.active && game.finalPrep?.started) {
            openShopPurchaseConfirm(idx);
            return;
          }
          buyShopItem(idx);
        });
        sec.append(btn);
        shopCardNodes.push({
          btn,
          tag: btn.querySelector('.merge-tag'),
          ic: btn.querySelector('.ic'),
          nm: btn.querySelector('.nm'),
          cost: btn.querySelector('.cost')
        });
      }
    }
    game.shop.forEach((item, idx) => {
      const node = shopCardNodes[idx];
      if (!node) return;
      if (item.itemType === 'pill') {
        const p = PILLS[item.pillKey];
        node.btn.className = 'shop-card pill-card';
        node.btn.style.setProperty('--elem-c', '#7ce896');
        node.btn.disabled = item.bought || game.gold < item.cost;
        node.btn.title = `${p.name}：${p.desc}`;
        node.tag.hidden = item.bought;
        node.tag.textContent = '丹药';
        node.ic.textContent = p.icon;
        node.nm.textContent = item.bought ? '已购买' : p.name;
        node.cost.textContent = item.bought ? '—' : `${item.cost} 金`;
        return;
      }

      if (item.itemType === 'gear' && item.gear) {
        const g = item.gear;
        const el = ELEMENTS[g.elem] || { icon: '🧩', name: '无', color: '#8ad8ce' };
        const stSpec = getSourceStageSpec(g.sourceStage);
        const synHints = getGearSynergyHints(g);
        const itemSyns = evaluateItemSynergies(g);
        const afLines = (g.affixes || []).filter(Boolean).map(a => {
          const sp = GEAR_AFFIXES[a.id];
          return sp ? `• ${sp.icon}${sp.name}：${sp.desc(a.tier || 1)}` : '';
        }).join('\n');
        const buyCnt = getShopElemBuyCount(g.elem);
        node.btn.className = `shop-card gear-card ${g.rarity}` + (synHints.length || itemSyns.length ? ' mergeable' : '');
        node.btn.style.setProperty('--elem-c', el.color);
        node.btn.disabled = item.bought || game.gold < item.cost;
        node.btn.title = `${g.name} [${GEAR_RARITY_LABELS[g.rarity]} · ${stSpec.label} · ${g.slotsCount}槽]\n基础：${describeGearEffect(g)}\n词条：\n${afLines}${itemSyns.length ? `\n单件联动：${itemSyns.map(s => s.name).join('/')}` : ''}${synHints.length ? `\n提示：${synHints.join('；')}` : ''}\n定价：阶段${g.sourceStage} · ${el.name}系已购 ${buyCnt} 次`;
        node.tag.hidden = item.bought;
        node.tag.textContent = `${GEAR_RARITY_LABELS[g.rarity]}·${g.slotsCount}槽`;
        node.ic.textContent = g.icon;
        node.nm.textContent = item.bought ? '已购买' : g.name;
        node.cost.textContent = item.bought ? '—' : `${item.cost} 金`;
        return;
      }

      const spec = ARTIFACTS[item.kind];
      const el = ELEMENTS[spec.elem];
      const sameMain = game.seal && game.seal.kind === item.kind;
      const matchSub = game.subSeals.find(s => s.kind === item.kind);
      const mainAtCap = sameMain && game.seal.star >= cap;
      const subAtCap = !!matchSub && matchSub.star >= 3;
      const atCap = mainAtCap || subAtCap;
      const canFuseMain = sameMain && !mainAtCap && !item.bought;
      const canFuseSub = !!matchSub && !subAtCap && !item.bought;
      const canAddSub = game.seal && !sameMain && !matchSub && game.subSeals.length < subCap && !item.bought;
      const isSwitch = game.seal && !sameMain && !matchSub && game.subSeals.length >= subCap && !item.bought;

      node.btn.className = 'shop-card' + ((canFuseMain || canFuseSub || canAddSub) ? ' mergeable' : '') + (atCap ? ' locked-cap' : '');
      node.btn.style.setProperty('--elem-c', el.color);
      node.btn.disabled = item.bought || game.gold < item.cost || atCap;
      const resDesc = SUB_SEAL_RESONANCE[spec.elem].desc(Math.min(3, item.star));
      const dualHint = DUAL_RESONANCES.filter(d => d.req.includes(spec.elem) || d.req[1] === '_any').map(d => `${d.icons}${d.name}`).join(' / ');
      node.btn.title = `${spec.name} ${item.star}★（${el.icon}${el.name} · 计入+1~+2羁绊）\n[主印] ${spec.desc}\n[辅印] ${resDesc}\n[双系共鸣] ${dualHint}`;

      const pts = item.star === 3 ? 4 : item.star === 2 ? 2 : 1;
      if (canFuseMain) {
        node.tag.hidden = false; node.tag.textContent = `★ 主印+${pts}`;
      } else if (canFuseSub) {
        node.tag.hidden = false; node.tag.textContent = `★ 辅印+${pts}`;
      } else if (canAddSub) {
        node.tag.hidden = false; node.tag.textContent = `✨ 装辅印`;
      } else if (mainAtCap && !item.bought) {
        node.tag.hidden = false; node.tag.textContent = game.seal.star >= 5 ? '主已满5★' : `需节点破限`;
      } else if (subAtCap && !item.bought) {
        node.tag.hidden = false; node.tag.textContent = '辅已满3★';
      } else if (isSwitch) {
        node.tag.hidden = false; node.tag.textContent = `转修换主印`;
      } else {
        node.tag.hidden = true;
      }
      node.ic.textContent = spec.icon;
      node.nm.textContent = item.bought ? '已购买' : `${spec.name}${item.star > 1 ? ` ${item.star}★` : ''}`;
      node.cost.textContent = item.bought ? '—' : `${item.cost} 金${item.disc ? ' 折' : ''}`;
    });
  }

  function renderBag(force){
    const game = runtimeCtx.game;
    const key = gearListSig(game.bag) + '|' + game.hero.gear.length;
    if (!force && key === lastBagKey) return;
    lastBagKey = key;

    const tray = $('bagTray');
    tray.replaceChildren();
    if (!game.bag.length) {
      const sp = document.createElement('div');
      sp.className = 'bag-empty';
      sp.textContent = '构装背包空\n商店/精英获装';
      tray.append(sp);
      return;
    }
    game.bag.forEach((inst, idx) => {
      if (isBagSeal(inst)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bag-item ' + (inst.rarity || 'rare');
        btn.dataset.bagIdx = String(idx);
        btn.dataset.uid = inst.uid;
        btn.title = `未装备灵印【${inst.name} ${inst.star}★】（安全收纳，不覆盖主灵印）\n左键尝试吸收 · 右键出售换金 · Shift+右键拆解换锻材`;
        btn.innerHTML = `<span class="ic">${inst.icon || '✨'}</span><span class="nm">${inst.name}</span><span class="star-tag">${inst.star}★</span><span class="slot-tag">灵印</span>`;
        btn.addEventListener('click', () => equipGearFromBag(idx));
        btn.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          if (ev.shiftKey) dismantleBagGear(idx);
          else sellBagGear(idx);
        });
        tray.append(btn);
        return;
      }
      const g = isGearInstance(inst) ? inst : normalizeGearInstance(inst);
      const sellGold = getGearSellGold(g);
      const disMats = getGearDismantleMaterials(g);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bag-item ' + g.rarity;
      btn.dataset.bagIdx = String(idx);
      btn.dataset.uid = g.uid;
      btn.title = `${describeGearInstance(g)}\n左键穿戴 · 右键出售(+${sellGold}金) · Shift+右键拆解(+${disMats}锻材)`;
      btn.innerHTML = `<span class="ic">${g.icon}</span><span class="nm">${g.name}</span>${g.enhanceLv > 0 ? `<span class="star-tag">+${g.enhanceLv}</span>` : ''}<span class="slot-tag">${g.slotsCount}槽</span>`;
      btn.addEventListener('click', () => equipGearFromBag(idx));
      btn.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (ev.shiftKey) dismantleBagGear(idx);
        else sellBagGear(idx);
      });
      tray.append(btn);
    });
  }

  function resetDirty() {
    lastArtKey = lastSkillKey = lastShopKey = lastBagKey = '';
  }

  return { renderSealStrip, renderSkillStrip, renderShop, renderBag, resetDirty };
}
