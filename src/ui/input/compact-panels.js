// Presentation-only panels. The existing reward/transaction modal remains authoritative.
export function bindCompactPanels(runtimeCtx, { getEl: $, win, renderAllUI, clearInput }) {
  const backdrop=$('uiPanelBackdrop');
  if (!backdrop) return {isOpen:()=>false,close:()=>{}};
  const tip=$('uiDetailTooltip');
  const sections={bag:$('uiBagPanel'),shop:$('uiShopPanel'),intel:$('uiIntelPanel'),tools:$('uiToolsPanel')};
  const titles={bag:'背包',shop:'商店',intel:'战场情报',tools:'更多功能'};
  let ownedPause=false, openingGame=null, previousFocus=null, target=null, currentText='';
  const isOpen=()=>!backdrop.hidden;
  const hideTip=()=>{tip.hidden=true;target=null;currentText='';};
  function close(render=true){
    if (!isOpen()) return;
    backdrop.hidden=true;
    hideTip();
    if (ownedPause && openingGame===runtimeCtx.game) runtimeCtx.setPaused(false);
    ownedPause=false;openingGame=null;
    if (render) {document.activeElement?.blur?.();renderAllUI();}
    previousFocus=null;
  }
  function open(kind){
    const game=runtimeCtx.game;
    if (!game || game.activeModal) return;
    if (!isOpen()) {
      previousFocus=document.activeElement;
      openingGame=game;
      ownedPause=!runtimeCtx.paused && !(game.finalPrep?.active && game.finalPrep?.started);
      if (ownedPause) runtimeCtx.setPaused(true);
    }
    clearInput();hideTip();
    for(const [key,el] of Object.entries(sections))el.hidden=key!==kind;
    $('uiPanelTitle').textContent=titles[kind];
    backdrop.dataset.phase=game.phase;backdrop.dataset.wave=String(game.wave);
    backdrop.hidden=false;
    renderAllUI(true);
    $('uiPanelClose').focus({preventScroll:true});
  }
  // Reparent existing, bound controls (no duplicate IDs or transaction handlers).
  const intel=$('battleHud');
  if (intel) {sections.intel.append(intel);intel.hidden=false;intel.classList.remove('collapsed');}
  const actions=$('secondaryActions');
  if (actions) sections.tools.append(actions);
  for(const id of ['tokenPill','shardPill','fpsPill']){const el=$(id);if(el)sections.tools.append(el);}
  for(const [id,kind] of Object.entries({bagOpen:'bag',shopOpen:'shop',intelOpen:'intel',toolsOpen:'tools'})) $(id)?.addEventListener('click',()=>open(kind));
  $('uiPanelClose')?.addEventListener('click',()=>close());
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  backdrop.addEventListener('bg-close-panel',()=>close(false));
  $('progressToggle')?.addEventListener('click',()=>{const collapsed=$('progressHud').classList.toggle('collapsed');$('progressToggle').textContent=collapsed?'展开':'折叠';});
  const readTarget=el=>el?.closest?.('[data-detail], [title]');
  function showTip(el){
    if(!el || !el.isConnected) {hideTip();return;}
    const value=el.getAttribute('title') || el.dataset.detail;
    if(!value){hideTip();return;}
    if(el.hasAttribute('title')){el.dataset.detail=value;el.removeAttribute('title');}
    if(target===el && currentText===value && !tip.hidden)return;
    target=el;currentText=value;tip.textContent=value;tip.hidden=false;
    tip.style.left='0px';tip.style.top='0px';
    const a=el.getBoundingClientRect(), b=tip.getBoundingClientRect();
    let left=a.right+10;
    if(left+b.width>win.innerWidth-8)left=a.left-b.width-10;
    left=Math.max(8,Math.min(left,win.innerWidth-b.width-8));
    const top=Math.max(8,Math.min(a.top,win.innerHeight-b.height-8));
    tip.style.left=left+'px';tip.style.top=top+'px';
  }
  document.addEventListener('pointerover',e=>showTip(readTarget(e.target)));
  document.addEventListener('pointerout',e=>{if(target&&(!e.relatedTarget?.nodeType || !target.contains(e.relatedTarget)))hideTip();});
  document.addEventListener('focusin',e=>showTip(readTarget(e.target)));
  document.addEventListener('focusout',hideTip);
  document.addEventListener('pointerdown',hideTip);
  win.addEventListener('resize',hideTip);
  win.addEventListener('blur',hideTip);
  // Dirty-rendered HUD nodes can be replaced while hovered; never leave an orphan tooltip.
  new MutationObserver(()=>{if(target&&!target.isConnected)hideTip();}).observe(document.body,{childList:true,subtree:true});
  backdrop.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = [...backdrop.querySelectorAll('button:not(:disabled)')].filter(el => el.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length-1];
    if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
  });
  return {isOpen,close};
}
