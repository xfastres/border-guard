export function createMetaModal(runtimeCtx, deps) {
  const { getEl, audio } = deps;
  const { rollShop } = deps.economy;
  const { toast } = deps.feedback;
  const {
    getMetaConfig, getMetaSave, isMetaLoadoutLocked, getActiveMetaLoadout, getMetaLoadoutBudget,
    buildActiveRunPools, setMetaMainLegacy, toggleMetaAuxLegacy, unlockMetaItem, exportMetaSave,
    lockMetaLoadoutForRun,
  } = deps.meta;
  const { startNewRun } = deps.run;

  function openMetaLegacyModal(opts = {}){
    if (!runtimeCtx.game) return { ok: false, reason: 'no_game' };
    const context = opts.context || ((runtimeCtx.game.phase === 'won' || runtimeCtx.game.phase === 'lost') ? 'settlement' : (isMetaLoadoutLocked() ? 'in_run' : 'pre_run'));
    runtimeCtx.game.activeModal = { type: 'meta_legacy', context, returnTo: opts.returnTo || null };
    renderMetaLegacyModal(runtimeCtx.game.activeModal);
    return { ok: true, locked: isMetaLoadoutLocked(), context };
  }

  function renderMetaLegacyModal(modalState = {}){
    const cfg = getMetaConfig();
    const save = getMetaSave();
    const locked = isMetaLoadoutLocked();
    const activeLoadout = locked ? getActiveMetaLoadout() : save.loadout;
    const budget = getMetaLoadoutBudget(activeLoadout);
    const pools = buildActiveRunPools(save, activeLoadout);
    const box = getEl('modalBox');

    const mainCardsHtml = cfg.mains.map(m => {
      const unlocked = save.unlockedMain.includes(m.id);
      const selected = activeLoadout.main === m.id;
      const cls = `meta-card ${selected ? 'sel' : ''} ${!unlocked ? 'locked-item' : ''}`;
      const btnState = unlocked
        ? (locked ? 'disabled' : '')
        : (save.legacyShards < m.unlockCost ? 'disabled' : '');
      const badge = selected ? '✅ 已装备' : unlocked ? (locked ? '🔒 局内锁定' : '点击装备') : `💠 ${m.unlockCost} 解锁`;
      return `
      <button type="button" class="${cls}" data-meta-action="${unlocked ? 'equip_main' : 'unlock_main'}" data-meta-id="${m.id}" ${btnState}>
        <div class="meta-card-head"><span>${m.icon} ${m.name}</span><span class="meta-pts-pill">${badge}</span></div>
        <div class="meta-card-sub" style="color:#9ef2cf">${m.styleTag}</div>
        <div class="meta-card-sub">${m.desc}</div>
      </button>
    `;
    }).join('');

    const auxCardsHtml = cfg.auxiliaries.map(a => {
      const unlocked = save.unlockedAux.includes(a.id);
      const selected = activeLoadout.aux.includes(a.id);
      const wouldExceedCount = !selected && budget.auxCount >= budget.maxAuxCount;
      const wouldExceedPts = !selected && (budget.auxPoints + a.costPoints > budget.maxAuxPoints);
      const cls = `meta-card ${selected ? 'sel' : ''} ${!unlocked ? 'locked-item' : ''}`;
      let disabled = false;
      if (unlocked) {
        if (locked || (!selected && (wouldExceedCount || wouldExceedPts))) disabled = true;
      } else if (save.legacyShards < a.unlockCost) {
        disabled = true;
      }
      const badge = selected ? `✅ ${a.costPoints}点` : unlocked ? `${a.costPoints}点${wouldExceedPts ? '·超预算' : wouldExceedCount ? '·满3槽' : ''}` : `💠 ${a.unlockCost} 解锁`;
      return `
      <button type="button" class="${cls}" data-meta-action="${unlocked ? 'toggle_aux' : 'unlock_aux'}" data-meta-id="${a.id}" ${disabled ? 'disabled' : ''}>
        <div class="meta-card-head"><span>${a.icon} ${a.name}</span><span class="meta-pts-pill">${badge}</span></div>
        <div class="meta-card-sub">${a.desc}</div>
      </button>
    `;
    }).join('');

    const packCardsHtml = cfg.unlockPacks.map(p => {
      const unlocked = save.unlockedPacks.includes(p.id);
      const disabled = unlocked || save.legacyShards < p.unlockCost;
      return `
      <button type="button" class="meta-card ${unlocked ? 'sel' : 'locked-item'}" data-meta-action="unlock_pack" data-meta-id="${p.id}" ${disabled ? 'disabled' : ''}>
        <div class="meta-card-head"><span>${p.icon} ${p.name}</span><span class="meta-pts-pill">${unlocked ? '✅ 已解锁' : `💠 ${p.unlockCost} 解锁`}</span></div>
        <div class="meta-card-sub">${p.desc}</div>
      </button>
    `;
    }).join('');

    const msHtml = cfg.milestones.map(ms => {
      const done = save.claimedMilestones.includes(ms.id);
      return `<div class="meta-ms-item ${done ? 'done' : ''}"><b>${done ? '✅' : '⬜'} ${ms.name}</b>（💠 +${ms.shardReward}）<br>${ms.desc}</div>`;
    }).join('');

    const isSettlement = modalState.context === 'settlement' || runtimeCtx.game.phase === 'won' || runtimeCtx.game.phase === 'lost';
    const isPreRun = modalState.context === 'pre_run' || modalState.returnTo === 'intro';

    box.innerHTML = `
    <h2>💠 局外传承配置与横向解锁</h2>
    <p class="lead">每局锁定 <strong>1 个主传承</strong> + <strong>最多 ${budget.maxAuxCount} 个辅助传承（总预算固定 ${budget.maxAuxPoints} 点，全解锁容量永不增加）</strong>。主传承仅提高本系奖励出现权重 ×${cfg.mainRewardWeightMultiplier}（严格重新归一化），<strong>绝不堆叠永久攻血暴击</strong>！</p>
    <div class="meta-lock-banner ${locked ? 'locked' : ''}">
      <div>${locked ? '🔒 <strong>本局已锁定（只读展示）</strong>：局内禁止热切换传承配置；新解锁内容将在重开新局后生效。' : '🔓 <strong>开局前配置就绪</strong>：自由选择主传承、勾选辅助传承与消费传承碎片解锁新内容。'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="meta-pts-pill">💠 碎片：${save.legacyShards}</span>
        <span class="meta-pts-pill">主传承：${budget.mainCount}/1</span>
        <span class="meta-pts-pill">辅助：${budget.auxCount}/${budget.maxAuxCount}（${budget.auxPoints}/${budget.maxAuxPoints} 点）</span>
        <span class="meta-pts-pill">防稀释定容：装备 ${pools.activeGearKeys.length} / 词条 ${pools.activeAffixKeys.length}</span>
      </div>
    </div>

    <div class="meta-sec-title"><span>1. 主传承（5 选 1 · 免费 3 + 可解锁 2）</span><span style="font-size:11px;color:#a8cdc6">最高波次 W${save.stats.bestWave || 0} · 通关 ${save.stats.victories || 0} / 总场次 ${save.stats.totalRuns || 0}</span></div>
    <div class="meta-grid">${mainCardsHtml}</div>

    <div class="meta-sec-title"><span>2. 辅助传承（最多 ${budget.maxAuxCount} 个 · 固定 ${budget.maxAuxPoints} 点预算）</span><span style="font-size:11px;color:#a8cdc6">0 解锁即达 1+1+2=4 三辅助满配</span></div>
    <div class="meta-grid two">${auxCardsHtml}</div>

    <div class="meta-sec-title"><span>3. 横向扩展包（装备 / 词条 / 挑战）</span><span style="font-size:11px;color:#a8cdc6">解锁后保持活跃池定容，绝不稀释联动概率</span></div>
    <div class="meta-grid">${packCardsHtml}</div>

    <div class="meta-sec-title"><span>4. 一次性里程碑进度（${save.claimedMilestones.length}/${cfg.milestones.length}）</span><span style="font-size:11px;color:#a8cdc6">存档键：${cfg.storageKey} (v${cfg.schemaVersion})</span></div>
    <div class="meta-milestone-list">${msHtml}</div>

    <div class="modal-footer">
      <button class="btn" id="metaExportBtn" type="button" title="复制本地存档 JSON 备份">💾 备份存档</button>
      ${isSettlement ? `<button class="btn" id="metaBackEndBtn" type="button">返回结算摘要</button><button class="btn gold" id="metaStartNewBtn" type="button" style="padding:8px 16px">🔁 保存并开启新局</button>`
          : isPreRun ? `<button class="btn gold" id="metaConfirmPreBtn" type="button" style="padding:8px 18px">⚔️ 锁定配置 · 踏入秘境！</button>`
          : `<button class="btn" id="metaCloseBtn" type="button">关闭</button>`}
    </div>
  `;

    box.querySelectorAll('[data-meta-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.metaAction;
        const id = btn.dataset.metaId;
        if (act === 'equip_main') setMetaMainLegacy(id);
        else if (act === 'toggle_aux') toggleMetaAuxLegacy(id);
        else if (act === 'unlock_main') unlockMetaItem('main', id);
        else if (act === 'unlock_aux') unlockMetaItem('aux', id);
        else if (act === 'unlock_pack') unlockMetaItem('pack', id);
        renderMetaLegacyModal(modalState);
      });
    });

    box.querySelector('#metaExportBtn')?.addEventListener('click', () => {
      const json = exportMetaSave();
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(json).then(() => toast('💾 局外传承存档 JSON 已复制到剪贴板！')).catch(() => toast('💾 存档已就绪（可通过 BG60.exportMetaSave() 获取）'));
      } else {
        toast('💾 存档已导出（可在控制台调用 BG60.exportMetaSave() 查看）');
      }
    });
    box.querySelector('#metaBackEndBtn')?.addEventListener('click', () => deps.introEndModals.showEndModal(runtimeCtx.game.phase === 'won'));
    box.querySelector('#metaStartNewBtn')?.addEventListener('click', () => startNewRun());
    box.querySelector('#metaConfirmPreBtn')?.addEventListener('click', () => {
      audio.unlock();
      lockMetaLoadoutForRun();
      rollShop(true);
      deps.modalManager.closeModal();
    });
    box.querySelector('#metaCloseBtn')?.addEventListener('click', () => deps.modalManager.closeModal());
    getEl('modalBackdrop').hidden = false;
  }

  return { openMetaLegacyModal, renderMetaLegacyModal };
}
