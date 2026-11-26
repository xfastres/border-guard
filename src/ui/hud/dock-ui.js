import { getBagCapacity } from '../../systems/economy/pricing.js';
import {
  ARTIFACTS, ELEMENTS, GEAR_AFFIXES, GEAR_RARITY_LABELS, HERO_SKILLS, GEARS, HERO_GEAR_SLOTS,
  SEAL_FUSE_NEED, SUB_SEAL_RESONANCE, W10_SKILL_BRANCHES,
} from '../../data/index.js';
import { gearListSig } from './build-hud.js';
import { createShopCards } from './shop-cards.js';
import { gearLabel } from '../../systems/equipment/index.js';
import { ELEMENT_ICON, gearIcon, icon, setIconText, SKILL_ICON, withIcons } from '../shared/icons.js';

const RARITY_SYMBOLS = {
  common: '●',
  rare: '◆',
  epic: '★',
  legend: '✦',
};

export function createDockUI(runtimeCtx, deps) {
  const { getEl: $, feedback: { toast } } = deps;
  const { getSealStarCap, getSubSealSlotCap } = deps.unlock;
  const { isBagSeal, getGearSellGold, getGearDismantleMaterials } = deps.economy;
  const {
    isGearInstance, normalizeGearInstance, describeGearInstance, equipGearFromBag,
    replaceEquippedGear, dismantleBagGear, sellBagGear,
  } = deps.equipment;
  let lastArtKey = '', lastSkillKey = '', lastBagKey = '';
  const shopCards = createShopCards(runtimeCtx, deps);
  let selectedBagUid = null;

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
      setIconText(btn, `✨ 未铭刻主灵印（上限 ${cap}★）`);
      btn.addEventListener('click', () => toast('点击底栏商店任意五行灵印即可铭刻附魔！'));
    } else {
      const spec = ARTIFACTS[s.kind], el = ELEMENTS[s.elem];
      btn.style.borderColor = el.color;
      const synTag = s.star >= 5 ? '4层终极羁绊' : s.star >= 3 ? '2层羁绊激活' : `3★激羁绊`;
      const progTxt = s.star >= 5 ? '满阶' : s.star >= cap ? `需节点升${cap+1}★` : `${s.prog}/${SEAL_FUSE_NEED[s.star]}`;
      btn.innerHTML = `<span>${icon(ELEMENT_ICON[s.kind])} <b>主:${spec.name}</b> ${'★'.repeat(s.star)}</span><span class="tier-tag">${progTxt}</span><span class="tier-tag" style="color:${el.color}">${synTag}</span>`;
      btn.title = `${spec.desc}\n[2层(3★)] ${el.t1}\n[4层(5★)] ${el.t2}\n点击查看主辅灵印阵盘或卸售`;
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = runtimeCtx.game.inspTarget?.type === 'seal' ? null : { type:'seal' };
        deps.hudController.renderAllUI(true);
      });
    }
    wrap.append(btn);

    for (let i = 0; i < 2; i++) {
      const sub = game.subSeals[i];
      const unlocked = i < subCap;
      const chip = document.createElement('button');
      chip.type = 'button';
      if (sub) {
        const spec = ARTIFACTS[sub.kind], el = ELEMENTS[sub.elem], res = SUB_SEAL_RESONANCE[sub.elem];
        chip.className = 'sub-seal-chip';
        chip.style.borderColor = el.color;
        chip.innerHTML = `${icon(ELEMENT_ICON[sub.kind])} <b>辅:${res.name}</b> ${sub.star}★`;
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
        setIconText(chip, `🔒 辅${i + 1}(${i === 0 ? 'W6' : 'W10突破'})`);
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
      btn.innerHTML = `${icon(SKILL_ICON[k])}<b>Lv.${lv}${bSpec ? '★' : ''}</b>`;
      btn.addEventListener('click', () => {
        runtimeCtx.game.inspTarget = { type: 'hero' };
        deps.hudController.renderAllUI(true);
      });
      wrap.append(btn);
    }
  }

  function renderBag(force){
    const game = runtimeCtx.game;
    const cap = getBagCapacity();
    const capTxt = `${game.bag.length}/${cap}`;
    const count = $('bagCount');
    if (count) count.textContent = capTxt;
    const capNum = $('bagCapNum');
    if (capNum) capNum.textContent = capTxt;
    const matNum = $('bagMatNum');
    setIconText(matNum, `⚙️ ${game.materials || 0} 锻材`);

    const key = gearListSig(game.bag) + '|' + gearListSig(game.hero.gear) + '|' + (game.materials || 0);
    if (!force && key === lastBagKey) return;
    lastBagKey = key;

    const tray = $('bagTray');
    tray.replaceChildren();
    if (!game.bag.some(g => g?.uid === selectedBagUid)) selectedBagUid = null;
    renderBagSelection();
    if (!game.bag.length) {
      const sp = document.createElement('div');
      sp.className = 'bag-empty';
      sp.textContent = '背包空闲';
      tray.append(sp);
      return;
    }
    game.bag.forEach((inst, idx) => {
      if (isBagSeal(inst)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bag-item ' + (inst.rarity || 'rare') + (inst.uid === selectedBagUid ? ' active' : '');
        btn.dataset.bagIdx = String(idx);
        btn.dataset.uid = inst.uid;
        btn.title = `未装备灵印【${inst.name} ${inst.star}★】（安全收纳，不覆盖主灵印）\n点击选择 · 右键出售换金 · Shift+右键拆解换锻材`;
        btn.innerHTML = `<span class="star-tag">${inst.star}★</span><span class="ic">${icon(ELEMENT_ICON[inst.kind])}</span><span class="nm">${inst.name}</span><span class="slot-tag">◆ 灵印</span>`;
        btn.addEventListener('click', () => { selectedBagUid = game.bag[idx]?.uid; syncBagHighlight(); renderBagSelection(); });
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
      const sym = RARITY_SYMBOLS[g.rarity] || '●';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bag-item ' + g.rarity + (g.uid === selectedBagUid ? ' active' : '');
      btn.dataset.bagIdx = String(idx);
      btn.dataset.uid = g.uid;
      btn.title = `${g.name} [${sym} ${GEAR_RARITY_LABELS[g.rarity] || '凡品'}]\n${describeGearInstance(g)}\n${(g.affixes||[]).filter(Boolean).map(a=>GEAR_AFFIXES[a.id] ? GEAR_AFFIXES[a.id].name+'：'+GEAR_AFFIXES[a.id].desc(a.tier||1) : '').join('\n')}\n点击选择 · 右键出售(+${sellGold}金) · Shift+右键拆解(+${disMats}锻材)`;
      btn.innerHTML = withIcons(`${g.enhanceLv > 0 ? `<span class="star-tag">+${g.enhanceLv}</span>` : ''}<span class="ic">${icon(gearIcon(GEARS[g.baseKey]))}</span><span class="nm">${g.name}</span><span class="slot-tag">${sym} ${g.slotsCount}槽</span>`);
      btn.addEventListener('click', () => { selectedBagUid = game.bag[idx]?.uid; syncBagHighlight(); renderBagSelection(); });
      btn.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (ev.shiftKey) dismantleBagGear(idx);
        else sellBagGear(idx);
      });
      tray.append(btn);
    });
  }

  function syncBagHighlight(){
    const tray = $('bagTray');
    if (!tray?.querySelectorAll) return;
    tray.querySelectorAll('.bag-item').forEach(el => {
      el.classList.toggle('active', el.dataset.uid === selectedBagUid);
    });
  }

  function renderBagSelection(){
    const panel = $('bagSelection');
    const placeholder = $('bagSelectionEmpty');
    if (!panel) return;
    const game = runtimeCtx.game, idx = game.bag.findIndex(g => g?.uid === selectedBagUid);
    panel.hidden = idx < 0;
    if (placeholder) placeholder.hidden = idx >= 0;
    panel.replaceChildren();
    if (idx < 0) return;
    const inst = game.bag[idx], isSeal = isBagSeal(inst);
    const h = document.createElement('b');
    h.innerHTML = withIcons(`${icon(isSeal ? ELEMENT_ICON[inst.kind] : gearIcon(GEARS[inst.baseKey]))} ${inst.name || '构装'}`);
    const text = document.createElement('p');
    setIconText(text, isSeal
      ? ARTIFACTS[inst.kind]?.desc || '未装备灵印'
      : [describeGearInstance(inst), ...(inst.affixes || []).filter(Boolean).map(a => GEAR_AFFIXES[a.id] ? GEAR_AFFIXES[a.id].name + '：' + GEAR_AFFIXES[a.id].desc(a.tier || 1) : '')].join(' · '));
    const btnRow = document.createElement('div');
    btnRow.className = 'bag-act-btns';
    const sellLabel = isSeal ? '出售' : `卖+${getGearSellGold(inst)}金`;
    const dismantleLabel = isSeal ? '拆解' : `拆+${getGearDismantleMaterials(inst)}材`;
    const available = isSeal || game.hero.gear.length < HERO_GEAR_SLOTS;
    const choices = [
      ...(available ? [[isSeal ? '吸收' : '穿戴', equipGearFromBag, true]] : []),
      [sellLabel, sellBagGear, false], [dismantleLabel, dismantleBagGear, false],
    ];
    if (!isSeal && !available) {
      game.hero.gear.forEach((equipped, slot) => {
        choices.push([`替换 ${gearLabel(equipped)}`, index => replaceEquippedGear(slot, index), true]);
      });
    }
    for (const [label, action, isPrimary] of choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isPrimary ? 'btn equip-btn' : 'btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const current = runtimeCtx.game.bag.findIndex(g => g?.uid === selectedBagUid);
        if (current >= 0) action(current);
      });
      btnRow.append(btn);
    }
    panel.append(h, text, btnRow);
  }

  function resetDirty() {
    lastArtKey = lastSkillKey = lastBagKey = '';
    selectedBagUid = null;
    shopCards.reset();
  }

  return { renderSealStrip, renderSkillStrip, renderShop: shopCards.renderShop, renderBag, resetDirty };
}
