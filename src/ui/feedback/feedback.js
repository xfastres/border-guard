import { setIconText } from '../shared/icons.js';
export function createFeedbackUI({ getEl = id => document.getElementById(id) } = {}) {
  let toastTimer = null;
  let bannerTimer = null;
  let flashTimer = null;

  function toast(msg, warn = false){
    const el = getEl('toast');
    setIconText(el, msg);
    el.className = 'toast' + (warn ? ' warn' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function showBanner(title, sub, tone = ''){
    setIconText(getEl('bannerTitle'), title);
    setIconText(getEl('bannerSub'), sub);
    const banner = getEl('banner');
    banner.className = 'banner' + (tone ? ' ' + tone : '');
    banner.hidden = false;
    if (banner.classList) {
      void banner.offsetWidth;
      banner.classList.add('flash-in');
    }
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
