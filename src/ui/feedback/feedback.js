export function createFeedbackUI({ getEl = id => document.getElementById(id) } = {}) {
  let toastTimer = null;
  let bannerTimer = null;
  let flashTimer = null;

  function toast(msg, warn = false){
    const el = getEl('toast');
    el.textContent = msg;
    el.className = 'toast' + (warn ? ' warn' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function showBanner(title, sub, tone = ''){
    getEl('bannerTitle').textContent = title;
    getEl('bannerSub').textContent = sub;
    getEl('banner').className = 'banner' + (tone ? ' ' + tone : '');
    getEl('banner').hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { getEl('banner').hidden = true; }, 2400);
  }

  function setDangerVignette(active){ getEl('hpVignette')?.classList.toggle('danger', active); }

  function flashScreen(kind){
    const el = getEl('tribFlash');
    if (!el) return;
    el.className = 'trib-flash ' + (kind === 'gold' ? 'show-gold' : kind === 'dmg' ? 'show-dmg' : 'show-fail');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.className = 'trib-flash'; }, kind === 'dmg' ? 180 : 420);
  }

  function hideTransientFeedback() {
    getEl('banner').hidden = true;
    getEl('toast').hidden = true;
    setDangerVignette(false);
  }

  return { toast, showBanner, setDangerVignette, flashScreen, hideTransientFeedback };
}
