import BALANCE from '../../data/balance.js';
import { getSourceStageSpec } from '../../core/state-queries.js';
import { COMBO_LIST, ELEMENTS, HERO_SKILLS, W10_SKILL_BRANCHES } from '../../data/core-data.js';
import { GEAR_RARITY_LABELS, GEAR_SETS } from '../../data/equipment-data.js';
import { W20_DIRECTIONS, W20_DIRECTION_KEYS, W20_ENHANCEMENTS } from '../../data/progression-data.js';

export function createProgressionModals(runtimeCtx, deps) {
  const { getEl } = deps;
  const { counters } = runtimeCtx;
  const { changeGold } = deps.economy;
  const { normalizeGearInstance, evaluateItemSynergies, getGearSynergyHints, describeGearEffect } = deps.equipment;
  const { toast } = deps.feedback;
  const { getSkillBreakdown, renderAffixChipsHtml } = deps.formatters;
  const { getHeroStats, getGearSetCounts } = deps.hero;
  const {
    getActiveUnlockNode, getRealmStageLabel, getUnlockedSkillPool, getLearnedSkillKeys, pickHeroSkill,
    selectW10BreakthroughSkill, pickW10BreakthroughBranch, isW20PreselectOpen, getRecommendedW20Direction,
    getW20BossIntel, getValidW20EnhancementPool, selectW20PreselectDirection, getW20RerollCost,
    pickW20Enhancement, rerollW20Enhancements, rollPerkChoices, pickPerk, pickChestGearChoices, pickGearReward,
  } = deps.progression;
  const { startWave } = deps.run;

  function renderStarterModal(){
    const m = runtimeCtx.game?.activeModal;
    if (!m || m.type !== 'starter') return;
    const starters = ['blades', 'firewave', 'nova'];
    if (!m.offerId) m.offerId = `starter_${counters.modalOfferSeq++}`;
    if (!Array.isArray(m.choices) || !m.choices.length) m.choices = starters.slice();
    if (typeof m.claimed !== 'boolean') m.claimed = false;
    const hs = getHeroStats();
    const box = getEl('modalBox');
    box.innerHTML = `
    <h2>⚔️ 选择本命神通 · 开启 30 波秘境守卫</h2>
    <p class="lead">本命神通 + 御剑引子可随鼠标方向指向集火！击败 <strong>W10 首领</strong>后将触发<strong>首次大型突破</strong>，为你选定的主力神通解锁三选一形态质变分支！</p>
    <div class="choices" id="modalChoices"></div>
  `;
    const grid = box.querySelector('#modalChoices');
    for (const k of m.choices) {
      const s = HERO_SKILLS[k];
      if (!s) continue;
      const info = getSkillBreakdown(k, 1, hs);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card';
      card.dataset.choice = k;
      card.innerHTML = `
      <span class="tag">${s.tag} · 本命起手</span>
      <span class="ci">${s.icon}</span>
      <span class="cn">${s.name}</span>
      <span class="cd">${s.desc(1)}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">✨ ${info.cur}</span>
    `;
      card.addEventListener('click', () => pickHeroSkill(k));
      grid.append(card);
    }
    getEl('modalBackdrop').hidden = false;
  }

  function renderLevelUpModal(){
    const m = runtimeCtx.game?.activeModal;
    if (!m || m.type !== 'levelup') return;
    if (!m.offerId) m.offerId = `levelup_${counters.modalOfferSeq++}`;
    if (typeof m.claimed !== 'boolean') m.claimed = false;

    let choices = [];
    if (Array.isArray(m.choices) && m.choices.length) {
      choices = m.choices.map(k => HERO_SKILLS[k]).filter(s => s && (runtimeCtx.game.hero.skills[s.key] || 0) < 5);
    }
    if (!choices.length) {
      const unlockedKeys = getUnlockedSkillPool();
      const pool = unlockedKeys.map(k => HERO_SKILLS[k]).filter(s => s && (runtimeCtx.game.hero.skills[s.key] || 0) < 5);
      if (!pool.length) { changeGold(20, 'max_skill_pool_bonus'); toast('当前阶段神通池已全满级！额外奖励 +20 金币！'); deps.modalManager.closeModal(); return; }
      const copy = pool.slice();
      while (choices.length < 3 && copy.length) {
        choices.push(copy.splice(Math.floor(runtimeCtx.game.rnd() * copy.length), 1)[0]);
      }
      m.choices = choices.map(s => s.key);
    }

    const box = getEl('modalBox');
    box.innerHTML = `
    <h2>✨ ${getRealmStageLabel()} Lv.${runtimeCtx.game.hero.lv} · 选择领主神通</h2>
    <p class="lead">普通升级隔一级选一次神通卡，卡池随波次与大型突破分批开放（满级 Lv.5，组合技需两技总等级≥3觉醒）。</p>
    <div class="choices" id="modalChoices"></div>
  `;
    const grid = box.querySelector('#modalChoices');
    const hs = getHeroStats();
    const comboTier = getActiveUnlockNode().comboTier;
    for (const s of choices) {
      const curLv = runtimeCtx.game.hero.skills[s.key] || 0;
      const nextLv = curLv + 1;
      const nextInfo = getSkillBreakdown(s.key, nextLv, hs);
      const curInfo = curLv > 0 ? getSkillBreakdown(s.key, curLv, hs) : null;
      let comboTag = '';
      for (const c of COMBO_LIST) {
        if (runtimeCtx.game.hero.combos[c.key] || c.realm > comboTier) continue;
        if (c.req.includes(s.key)) {
          const other = c.req.find(r => r !== s.key);
          const otherLv = runtimeCtx.game.hero.skills[other] || 0;
          if (otherLv >= 1) {
            comboTag = (nextLv + otherLv >= 3)
              ? `<span class="combo-tag">✨ 选后立即觉醒【${c.name}】</span>`
              : `<span class="combo-tag">✨ 可凑【${c.name}】(${nextLv+otherLv}/3)</span>`;
            break;
          }
        }
      }
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card';
      card.dataset.choice = s.key;
      card.innerHTML = `
      <span class="tag">${s.tag} · ${curLv ? `Lv.${curLv} → Lv.${nextLv}` : '新习得 Lv.1'}</span>
      ${comboTag}
      <span class="ci">${s.icon}</span>
      <span class="cn">${s.name}</span>
      <span class="cd">${s.desc(nextLv)}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">✨ 选后效果：${nextInfo.cur}</span>
      ${curInfo ? `<span class="cd" style="color:#a9c4be;font-size:10.5px">当前：${curInfo.cur}</span>` : ''}
    `;
      card.addEventListener('click', () => pickHeroSkill(s.key));
      grid.append(card);
    }
    getEl('modalBackdrop').hidden = false;
  }

  function renderW10BreakthroughModal(){
    const h = runtimeCtx.game.hero;
    const box = getEl('modalBox');
    const learned = getLearnedSkillKeys();

    if (!runtimeCtx.game.w10Draft || !runtimeCtx.game.w10Draft.skillKey) {
      box.innerHTML = `
      <h2>⚡ W10 首次大型突破 · 第一步：指定主力神通</h2>
      <p class="lead">你已斩杀第 10 波首领并取得<strong>突破凭证</strong>！请从<strong>已学会的神通</strong>中指定 1 门主力神通，随后从其随机 3 个形态质变分支中择一突破（突破后同时解锁 <strong>主印 4★ 上限 + 第 2 辅印槽</strong>）！</p>
      <div class="choices" id="modalChoices"></div>
    `;
      const grid = box.querySelector('#modalChoices');
      const hs = getHeroStats();
      for (const k of learned) {
        const s = HERO_SKILLS[k];
        const lv = h.skills[k] || 1;
        const info = getSkillBreakdown(k, lv, hs);
        const branchPool = W10_SKILL_BRANCHES[k] || [];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'choice-card epic';
        card.dataset.skill = k;
        card.innerHTML = `
        <span class="tag">${s.tag} · 当前 Lv.${lv}</span>
        <span class="up-tag">⚡ 可突破 (${branchPool.length} 分支池)</span>
        <span class="ci">${s.icon}</span>
        <span class="cn">${s.name}</span>
        <span class="cd">${s.desc(lv)}</span>
        <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">当前数值：${info.cur}</span>
        <span class="cd" style="color:#ffd878;font-size:11px;margin-top:2px">点击指定该神通并抽取 3 个形态分支 →</span>
      `;
        card.addEventListener('click', () => selectW10BreakthroughSkill(k));
        grid.append(card);
      }
      getEl('modalBackdrop').hidden = false;
      return;
    }

    const skillKey = runtimeCtx.game.w10Draft.skillKey;
    const s = HERO_SKILLS[skillKey];
    const branches = runtimeCtx.game.w10Draft.branches || [];
    box.innerHTML = `
    <h2>⚡ W10 首次大型突破 · 第二步：【${s.name}】分支三选一</h2>
    <p class="lead">选择 1 条形态分支永久改变【${s.name}】的攻击形态与跨阶段战斗状态（<strong>火标/引爆</strong> 或 <strong>减速/冰盾</strong>），为后续构装与 W20 二次突破奠定联动基础！</p>
    <div class="choices" id="modalChoices"></div>
    <div class="modal-footer">
      <button class="btn" id="w10BackBtn" type="button">← 重新指定主力神通</button>
    </div>
  `;
    const grid = box.querySelector('#modalChoices');
    for (const b of branches) {
      const hookKind = b.hook || b.hookType;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card epic';
      card.dataset.branch = b.key;
      card.innerHTML = `
      <span class="tag">${b.tag}</span>
      <span class="up-tag">${hookKind === 'fire_mark_detonate' ? '🔥 火标/引爆联动' : '❄️ 减速/冰盾联动'}</span>
      <span class="ci">${b.icon}</span>
      <span class="cn">${b.name}</span>
      <span class="cd">${b.desc}</span>
    `;
      card.addEventListener('click', () => pickW10BreakthroughBranch(b.key));
      grid.append(card);
    }
    box.querySelector('#w10BackBtn')?.addEventListener('click', () => {
      runtimeCtx.game.w10Draft = null;
      renderW10BreakthroughModal();
    });
    getEl('modalBackdrop').hidden = false;
  }

  function openW20PreselectModal(opts = {}){
    if (!runtimeCtx.game) return false;
    if (!isW20PreselectOpen()) {
      toast('W20 二破方向预选在 W16–W20 开战前开放！', true);
      return false;
    }
    // Highlight recommended direction visually if player hasn't clicked any yet (without silently locking)
    runtimeCtx.game.activeModal = { type: 'w20_preselect', requireConfirmStart: !!opts.requireConfirmStart };
    renderW20PreselectModal(runtimeCtx.game.activeModal);
    return true;
  }

  function renderW20PreselectModal(modalState = {}){
    if (!runtimeCtx.game) return;
    const box = getEl('modalBox');
    const curPick = runtimeCtx.game.w20State?.preselectedDirection || null;
    const recKey = getRecommendedW20Direction();
    const intel = getW20BossIntel();
    const requireStart = !!modalState.requireConfirmStart;

    const intelHtml = intel?.revealed
      ? `<div class="intel-box">
        <div><b>🔎 W19 首领情报 · 第 20 波【${intel.bossName}】</b></div>
        <div>• <b>固定核心机制</b>：${intel.coreName} —— ${intel.coreDesc}</div>
        <div>• <b>本局随机辅助机制</b>：<b style="color:#ff9ec4">${intel.auxName}</b> —— ${intel.auxDesc}</div>
        <div style="font-size:11px;opacity:.85;margin-top:2px">✅ 公平性保障：${intel.auxFairness}</div>
      </div>`
      : `<div class="intel-box" style="background:rgba(40,60,72,0.38);border-color:rgba(140,210,220,0.35);color:#cbe4e0">
        <b>🔎 首领情报提示</b>：第 19 波备战时将提前揭晓 W20 首领【天劫魔尊】的固定核心机制与本局随机辅助机制。
      </div>`;

    box.innerHTML = `
    <h2>⚡ W20 第二次大型突破 · 方向预选（第 ${runtimeCtx.game.wave} 波备战）</h2>
    <div class="w20-notice">
      🔒 <b>生效时点说明：</b>W16–W19 期间可随时根据当前装备与词条自由调整预选方向；<b>击败 W20 首领拿到突破凭证后，已锁定方向的基础效果才会生效</b>（开战 W20 前均仅使用已有战力，零材料同样 100% 生效基础效果）！
    </div>
    ${intelHtml}
    <div class="choices" id="modalChoices"></div>
    <div class="modal-footer">
      ${requireStart
          ? `<button class="btn" id="w20CancelBtn" type="button">返回备战</button>
           <button class="btn gold" id="w20LockStartBtn" type="button" ${curPick ? '' : 'disabled'}>🔒 锁定【${curPick ? W20_DIRECTIONS[curPick].name : '请先选方向'}】并迎战 W20</button>`
          : `<button class="btn gold" id="w20DoneBtn" type="button">保存预选并返回备战</button>`}
    </div>
  `;

    const grid = box.querySelector('#modalChoices');
    for (const key of W20_DIRECTION_KEYS) {
      const d = W20_DIRECTIONS[key];
      const isSel = curPick === key;
      const isRec = !curPick && recKey === key;
      const poolCnt = getValidW20EnhancementPool(key).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card' + (isSel ? ' w20-selected' : '');
      card.dataset.w20Dir = key;
      card.innerHTML = `
      <span class="tag">${d.tag}</span>
      ${isSel ? '<span class="up-tag">✅ 当前预选方向</span>' : isRec ? '<span class="up-tag">💡 契合当前构筑</span>' : ''}
      <span class="ci">${d.icon}</span>
      <span class="cn">${d.name}</span>
      <span class="cd">${d.baseDesc}</span>
      <span class="cd" style="color:#9bf2d0;font-size:11px;margin-top:2px">🔗 ${d.synergyNote}（战后强化池 ${poolCnt} 张）</span>
    `;
      card.addEventListener('click', () => {
        selectW20PreselectDirection(key);
      });
      grid.append(card);
    }

    box.querySelector('#w20DoneBtn')?.addEventListener('click', () => deps.modalManager.closeModal());
    box.querySelector('#w20CancelBtn')?.addEventListener('click', () => deps.modalManager.closeModal());
    box.querySelector('#w20LockStartBtn')?.addEventListener('click', () => {
      if (!runtimeCtx.game.w20State?.preselectedDirection) {
        selectW20PreselectDirection(recKey);
      }
      deps.modalManager.closeModal();
      startWave();
    });
    getEl('modalBackdrop').hidden = false;
  }

  function openW20BreakthroughModal(){
    if (!runtimeCtx.game || !runtimeCtx.game.w20Draft) return false;
    runtimeCtx.game.activeModal = { type: 'w20_breakthrough' };
    renderW20BreakthroughModal();
    return true;
  }

  function renderW20BreakthroughModal(){
    if (!runtimeCtx.game || !runtimeCtx.game.w20Draft) return;
    const draft = runtimeCtx.game.w20Draft;
    const dir = W20_DIRECTIONS[draft.directionKey];
    const cards = draft.candidates.map(k => W20_ENHANCEMENTS[k]).filter(Boolean);
    const nextCost = getW20RerollCost(draft.rerollCount);
    const mats = runtimeCtx.game.materials || 0;
    const canReroll = mats >= nextCost;
    const validPoolSize = getValidW20EnhancementPool(draft.directionKey).length;
    const minPool = 2 * (draft.groupSize || 2) + (BALANCE.w20Breakthrough?.minPoolBuffer ?? 2);
    const box = getEl('modalBox');

    box.innerHTML = `
    <h2>⚡ W20 第二次大型突破 · 战后强化选择</h2>
    <div class="w20-notice">
      ✅ <b>突破凭证保底生效：</b>已斩杀天劫魔尊并激活【${dir.icon} ${dir.name}】基础效果 —— ${dir.baseDesc}（即使普通材料为 0 亦已 100% 生效！）
    </div>
    <p class="lead">请从下方 <strong>${cards.length} 张机制强化卡</strong>中免费择一进入 W21；或消耗普通材料（⚙️ 当前 <strong>${mats}</strong> 锻材）<strong>整组重抽</strong>（相邻两组严格 0 重复，当前方向有效池 ${validPoolSize} 张 / 下限 ${minPool} 张）。</p>
    <div class="choices ${cards.length === 2 ? 'two' : ''}" id="modalChoices"></div>
    <div class="reroll-bar">
      <div style="font-size:12px;color:#cde4df">
        ⚙️ 剩余锻材：<b>${mats}</b> · 已重抽 <b>${draft.rerollCount}</b> 次 · 下次整组重抽价格：<b style="color:#ffe27a">${nextCost} 锻材</b>
      </div>
      <button class="btn gold" id="w20RerollBtn" type="button" ${canReroll ? '' : 'disabled'}>
        🎲 付费整组重抽（消耗 ${nextCost} 锻材）
      </button>
    </div>
  `;

    const grid = box.querySelector('#modalChoices');
    for (const c of cards) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card legend';
      card.dataset.w20Enh = c.key;
      card.innerHTML = `
      <span class="tag">${c.tag}${c.shared ? ' · 通用相容' : ''}</span>
      <span class="up-tag">⚡ ${c.behaviorTag}</span>
      <span class="ci">${c.icon}</span>
      <span class="cn">${c.name}</span>
      <span class="cd">${c.desc}</span>
    `;
      card.addEventListener('click', () => pickW20Enhancement(c.key));
      grid.append(card);
    }
    box.querySelector('#w20RerollBtn')?.addEventListener('click', () => rerollW20Enhancements());
    getEl('modalBackdrop').hidden = false;
  }

  function renderPerkModal(quality = 'ren'){
    const choices = rollPerkChoices(quality);
    if (!choices.length) { deps.modalManager.closeModal(); return; }
    const qName = quality === 'tian' ? '👑 天道秘宝加持（六选一）' : quality === 'di' ? '💎 地道秘宝加持（四选一）' : '✨ 秘宝加持（三选一）';
    const gridCls = choices.length >= 5 ? 'choices six' : choices.length === 4 ? 'choices four' : 'choices';
    const box = getEl('modalBox');
    box.innerHTML = `
    <h2>${qName}</h2>
    <p class="lead">选择 <strong>1 条规则弯折词条</strong>塑造本局流派；已拥有的 Lv.1 词条可原地升阶为 <strong>Lv.2 精通</strong>！</p>
    <div class="${gridCls}" id="modalChoices"></div>
  `;
    const grid = box.querySelector('#modalChoices');
    for (const p of choices) {
      const curLv = runtimeCtx.game.hero.perks[p.key] || 0;
      const nextLv = curLv + 1;
      const rarityLabel = p.rarity === 'epic' ? '史诗' : p.rarity === 'rare' ? '稀有' : '普通';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card' + (p.rarity === 'epic' ? ' epic' : p.rarity === 'rare' ? ' rare' : '');
      card.dataset.choice = p.key;
      card.innerHTML = `
      <span class="tag">${p.family}系 · ${rarityLabel}</span>
      ${curLv === 1 ? '<span class="up-tag">⬆ 升阶精通 Lv.2</span>' : ''}
      <span class="ci">${p.icon}</span>
      <span class="cn">${p.name}</span>
      <span class="cd">${nextLv === 2 ? p.d2 : p.d1}</span>
    `;
      card.addEventListener('click', () => pickPerk(p.key));
      grid.append(card);
    }
    getEl('modalBackdrop').hidden = false;
  }

  function renderChestModal(legendBias = false, shrineTier = false){
    const m = runtimeCtx.game?.activeModal;
    if (!m || m.type !== 'chest') return;
    if (!m.offerId) m.offerId = `chest_${counters.modalOfferSeq++}`;
    if (typeof m.claimed !== 'boolean') m.claimed = false;
    const choices = (Array.isArray(m.choices) && m.choices.length)
      ? m.choices.map(c => normalizeGearInstance(c))
      : pickChestGearChoices(legendBias, shrineTier);
    m.choices = choices;
    const box = getEl('modalBox');
    const title = legendBias ? '👑 首领传说宝箱' : shrineTier ? '🩸 血煞妖碑高阶宝箱' : '📦 精英构装宝箱';
    box.innerHTML = `
    <h2>${title} · 三选一</h2>
    <p class="lead">每件装备为<strong>独立实例</strong>（品质与 <strong>1/2/3 槽</strong>独立随机，锁定当前来源阶段，不再同名合星覆盖词条）。多余装备可在属性面板选择<strong>出售换金</strong>或<strong>拆解获锻材</strong>！</p>
    <div class="choices" id="modalChoices"></div>
  `;
    const grid = box.querySelector('#modalChoices');
    const setCounts = getGearSetCounts();
    for (const inst of choices) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card ' + inst.rarity;
      card.dataset.choice = inst.baseKey;
      card.dataset.uid = inst.uid;
      const rTag = GEAR_RARITY_LABELS[inst.rarity] || '凡品';
      const stSpec = getSourceStageSpec(inst.sourceStage);
      const elSpec = ELEMENTS[inst.elem];
      const setSpec = GEAR_SETS[inst.set];
      const curSetCnt = setCounts[inst.set] || 0;
      const itemSyns = evaluateItemSynergies(inst);
      const synHints = getGearSynergyHints(inst);
      card.innerHTML = `
      <span class="tag">${rTag} · ${stSpec.label} · ${inst.slotsCount}槽${elSpec ? ` · ${elSpec.icon}${elSpec.name}` : ''}</span>
      <span class="ci">${inst.icon}</span>
      <span class="cn">${inst.name}</span>
      <span class="cd">${describeGearEffect(inst)}</span>
      <div style="margin-top:3px">${renderAffixChipsHtml(inst)}</div>
      ${itemSyns.length ? `<span class="syn-badge ${itemSyns[0].badgeClass}">✨ 单件联动：${itemSyns.map(s => `${s.icon}${s.name}(${s.short})`).join(' / ')}</span>` : ''}
      ${synHints.length ? `<span class="syn-badge hint">💡 ${synHints.join('；')}</span>` : ''}
      ${setSpec ? `<span class="cd" style="color:${setSpec.col};font-size:11px;margin-top:2px">${setSpec.icon} ${setSpec.name} (${curSetCnt}/3)</span>` : ''}
    `;
      card.addEventListener('click', () => pickGearReward(inst));
      grid.append(card);
    }
    getEl('modalBackdrop').hidden = false;
  }

  return {
    renderStarterModal,
    renderLevelUpModal,
    renderW10BreakthroughModal,
    openW20PreselectModal,
    renderW20PreselectModal,
    openW20BreakthroughModal,
    renderW20BreakthroughModal,
    renderPerkModal,
    renderChestModal,
  };
}
