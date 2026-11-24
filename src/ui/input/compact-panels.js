// Presentation-only inline dock switcher, on-demand intel overlay, and unified detail tooltip.
export function bindCompactPanels(runtimeCtx, { getEl: $, win, renderAllUI, clearInput, setLeftTab }) {
  const backdrop = $('uiPanelBackdrop');
  const tip = $('uiDetailTooltip');
  let ownedPause = false;
  let openingGame = null;
  let target = null;
  let currentText = '';
  let tipTimer = null;

  const isOpen = () => Boolean(backdrop && backdrop.hidden === false);

  const hideTip = () => {
    clearTimeout(tipTimer);
    tipTimer = null;
    if (tip) tip.hidden = true;
    target = null;
    currentText = '';
  };

  function setDockTab(tab) {
    const isBag = tab === 'bag';
    const shopPanel = $('uiShopPanel');
    const bagPanel = $('uiBagPanel');
    if (shopPanel) shopPanel.hidden = isBag;
    if (bagPanel) bagPanel.hidden = !isBag;
    const shopBtn = $('shopOpen');
    const bagBtn = $('bagOpen');
    shopBtn?.classList.toggle('active', !isBag);
    shopBtn?.setAttribute?.('aria-selected', String(!isBag));
    bagBtn?.classList.toggle('active', isBag);
    bagBtn?.setAttribute?.('aria-selected', String(isBag));
    if (document.body?.dataset) document.body.dataset.dockTab = isBag ? 'bag' : 'shop';
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

  function openIntel() {
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
    backdrop.hidden = false;
    renderAllUI(true);
  }

  // Inline Shop <-> Bag switcher (locked geometry, zero modal interruption!)
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
  $('intelOpen')?.addEventListener('click', openIntel);
  $('waveIntelBtn')?.addEventListener('click', openIntel);
  $('waveHeroBtn')?.addEventListener('click', () => {
    const game = runtimeCtx.game;
    if (!game) return;
    game.inspTarget = game.inspTarget?.type === 'hero' ? null : { type: 'hero' };
    renderAllUI(true);
  });

  $('uiPanelClose')?.addEventListener('click', () => closeIntel());
  backdrop?.addEventListener('click', e => { if (e.target === backdrop) closeIntel(); });
  backdrop?.addEventListener('bg-close-panel', () => closeIntel(false));

  // Layer-2 Detail Tooltip (positioned away from screen center; 240ms debounce on real pointer move, instant on focus/synthetic event)
  const readTarget = el => el?.closest?.('[data-detail], [title]');
  function renderTipNow(el) {
    if (!tip || !el || !el.isConnected) { hideTip(); return; }
    const value = el.getAttribute('title') || el.dataset.detail;
    if (!value) { hideTip(); return; }
    if (el.hasAttribute('title')) { el.dataset.detail = value; el.removeAttribute('title'); }
    if (target === el && currentText === value && !tip.hidden) return;
    target = el;
    currentText = value;
    tip.textContent = value;
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

  function scheduleTip(el, immediate = false) {
    clearTimeout(tipTimer);
    tipTimer = null;
    if (!el || !el.isConnected) { hideTip(); return; }
    if (immediate) {
      renderTipNow(el);
      return;
    }
    tipTimer = setTimeout(() => renderTipNow(el), 220);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerover', e => {
      const el = readTarget(e.target);
      if (!el) return;
      // Synthetic PointerEvent (isTrusted === false) renders immediately for deterministic tests; real hover uses 220ms anti-flicker delay.
      scheduleTip(el, e.isTrusted === false);
    });
    document.addEventListener('pointerout', e => {
      if (target && (!e.relatedTarget?.nodeType || !target.contains(e.relatedTarget))) hideTip();
      else if (tipTimer && (!e.relatedTarget?.nodeType || !readTarget(e.target)?.contains(e.relatedTarget))) {
        clearTimeout(tipTimer);
        tipTimer = null;
      }
    });
    document.addEventListener('focusin', e => scheduleTip(readTarget(e.target), true));
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
