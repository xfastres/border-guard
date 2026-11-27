import { ARTIFACTS, PILLS } from '../../data/index.js';
import { withoutIcons } from '../shared/icons.js';

// Market and inventory navigation, on-demand intel, and tooltips.
export function bindCompactPanels(runtimeCtx, { getEl: $, win, renderAllUI, clearInput, setLeftTab }) {
  const backdrop = $('uiPanelBackdrop');
  const tip = $('uiDetailTooltip');
  let ownedPause = false;
  let openingGame = null;
  let target = null;
  let currentText = '';

  const isOpen = () => Boolean(backdrop && backdrop.hidden === false);

  const hideTip = () => {
    if (tip) tip.hidden = true;
    target = null;
    currentText = '';
  };

  function setDockTab(tab) {
    if (runtimeCtx.game?.activeModal) return;
    if (runtimeCtx.game?.phase !== 'prep') { openPanel(tab); return; }
    const isBag = tab === 'bag';
    const selected = $(isBag ? 'uiBagPanel' : 'uiShopPanel');
    selected?.scrollIntoView?.({ block: 'nearest' });
    const shopBtn = $('shopOpen');
    const bagBtn = $('bagOpen');
    shopBtn?.classList.toggle('active', !isBag);
    shopBtn?.setAttribute?.('aria-pressed', String(!isBag));
    bagBtn?.classList.toggle('active', isBag);
    bagBtn?.setAttribute?.('aria-pressed', String(isBag));
    if (document.body?.dataset) document.body.dataset.prepFocus = isBag ? 'bag' : 'shop';
    hideTip();
    renderAllUI(true);
  }

  function closeIntel(render = true) {
    if (!isOpen()) return;
    backdrop.hidden = true;
    hideTip();
    if (ownedPause && openingGame === runtimeCtx.game) runtimeCtx.setPaused(false);
    ownedPause = false;
    openingGame = null;
    if (render) {
      document.activeElement?.blur?.();
      renderAllUI();
    }
  }

  function openPanel(view = 'intel') {
    const game = runtimeCtx.game;
    if (!game || game.activeModal || !backdrop) return;
    if (!isOpen()) {
      openingGame = game;
      ownedPause = !runtimeCtx.paused && !(game.finalPrep?.active && game.finalPrep?.started);
      if (ownedPause) runtimeCtx.setPaused(true);
    }
    clearInput();
    hideTip();
    backdrop.dataset.phase = game.phase;
    backdrop.dataset.wave = String(game.wave);
    const preview = $('utilityPreview');
    $('uiIntelPanel').hidden = view !== 'intel';
    const labels = { intel: '战场情报', bag: '背包', shop: '商店' };
    $('uiPanelTitle').textContent = labels[view];
    preview.hidden = view === 'intel';
    if (!preview.hidden) {
      const items = view === 'bag' ? game.bag.map(g => g.name || ARTIFACTS[g.kind]?.name)
        : game.shop.map(s => (s.gear?.name || PILLS[s.pillKey]?.name || ARTIFACTS[s.kind]?.name || '灵印')
          + (s.bought ? ' · 已购' : ' · ' + s.cost + ' 金'));
      preview.replaceChildren();
      const note = document.createElement('p');
      note.textContent = view === 'shop' ? '备战时可购买和刷新。' : '备战时可穿戴、出售或拆解。';
      preview.append(note);
      for (const name of items.length ? items : ['空']) {
        const row = document.createElement('div');
        row.className = 'utility-item'; row.textContent = name;
        preview.append(row);
      }
    }
    backdrop.hidden = false;
    $('uiPanelClose')?.focus?.();
    renderAllUI(true);
  }

  // Both sections stay visible and share a single scroll region.
  $('shopOpen')?.addEventListener('click', () => setDockTab('shop'));
  $('bagOpen')?.addEventListener('click', () => setDockTab('bag'));

  // Left Build Glance Tabs (stopPropagation so header click doesn't collapse panel!)
  $('leftTabBuild')?.addEventListener('click', e => {
    e.stopPropagation();
    setLeftTab?.('build');
  });
  $('leftTabSyn')?.addEventListener('click', e => {
    e.stopPropagation();
    setLeftTab?.('syn');
  });

  // On-demand Intel overlay & Wave Hero Peek
  $('intelOpen')?.addEventListener('click', () => openPanel());
  $('waveIntelBtn')?.addEventListener('click', () => openPanel());
  $('waveHeroBtn')?.addEventListener('click', () => {
    const game = runtimeCtx.game;
    if (!game) return;
    game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type: 'hero' };
    renderAllUI(true);
  });

  $('uiPanelClose')?.addEventListener('click', () => closeIntel());
  backdrop?.addEventListener('click', e => { if (e.target === backdrop) closeIntel(); });
  backdrop?.addEventListener('bg-close-panel', () => closeIntel(false));

  // Hover and keyboard focus share an immediate, viewport-clamped tooltip.
  const readTarget = el => el?.closest?.('[data-detail], [title]');
  function renderTipNow(el) {
    if (!tip || !el || !el.isConnected) { hideTip(); return; }
    const value = el.getAttribute('title') || el.dataset.detail;
    if (!value) { hideTip(); return; }
    if (el.hasAttribute('title')) { el.dataset.detail = value; el.removeAttribute('title'); }
    if (target === el && currentText === value && !tip.hidden) return;
    target = el;
    currentText = value;
    tip.textContent = withoutIcons(value);
    tip.hidden = false;
    tip.style.left = '0px';
    tip.style.top = '0px';
    const a = el.getBoundingClientRect();
    const b = tip.getBoundingClientRect();
    let left = a.left + (a.width - b.width) / 2;
    let top = a.top - b.height - 12;
    if (top < 12) {
      top = a.bottom + 12;
    }
    if (top + b.height > win.innerHeight - 12) {
      left = a.right + 12;
      if (left + b.width > win.innerWidth - 12) left = a.left - b.width - 12;
      top = Math.max(12, Math.min(a.top, win.innerHeight - b.height - 12));
    }
    left = Math.max(12, Math.min(left, win.innerWidth - b.width - 12));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerover', e => {
      const el = readTarget(e.target);
      if (!el) return;
      renderTipNow(el);
    });
    document.addEventListener('pointerout', e => {
      if (target && (!e.relatedTarget?.nodeType || !target.contains(e.relatedTarget))) hideTip();
    });
    document.addEventListener('focusin', e => renderTipNow(readTarget(e.target)));
    document.addEventListener('focusout', hideTip);
    document.addEventListener('pointerdown', hideTip);
    win.addEventListener('resize', hideTip);
    win.addEventListener('blur', hideTip);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      new MutationObserver(() => { if (target && !target.isConnected) hideTip(); }).observe(document.body, { childList: true, subtree: true });
    }
  }

  return { isOpen, close: closeIntel, setDockTab };
}
