// Shared 24px outline symbols. SVGs inherit the color of their UI role.
const paths = {
  shield: 'M12 2.5 20 6v6c0 4.8-3.2 7.9-8 10-4.8-2.1-8-5.2-8-10V6zM8 12l3 3 5-6',
  heart: 'M20.4 5.7a4.8 4.8 0 0 0-6.8 0L12 7.3l-1.6-1.6a4.8 4.8 0 0 0-6.8 6.8l8.4 8 8.4-8a4.8 4.8 0 0 0 0-6.8z',
  sword: 'm20.5 3.5-2 6L9 19l-4-4 9.5-9.5zM4 14l6 6m-2-2-4 4-2-2 4-4',
  blades: 'M3 5c3.5 0 7.5 1 9 4-3.5.3-6-1.5-9-4zm15-2c-1 4-2 6-5 8 0-3.5 2-6 5-8zm3 12c-4 0-7.5 0-9-3 3-.6 6.5.5 9 3zm-12 6c0-3.5 1-6 3-8 .8 3-1 6-3 8z',
  skull: 'M5 16.5V16a8 8 0 1 1 14 0v.5l-3 1.5v2h-8v-2zM8 12v2m8-2v2m-5 2 1-1 1 1',
  beast: 'm4 5 5 3 3-3 3 3 5-3-1 10-7 5-7-5zM8 12l2 1m6-1-2 1m-4 3h4',
  coin: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 3.3 6.2 6.2-6.2 6.2L5.8 12zM10.5 10.5h3v3h-3z',
  forge: 'M3 6h18l-4 5h-3v4l2 2v2H7v-2l2-2v-4H6zM3 6V4m17 2 1-2',
  gem: 'M7 3h10l5 6-10 12L2 9zM2 9h20M7 3l2 6 3 12 3-12 2-6',
  transfer: 'M4 8h15l-4-4m5 12H5l4 4M19 8l-4 4M5 16l4-4',
  fire: 'M13 2c1 5-4 6-4 10l2 2c1-3 4-4 4-7 4 4 6 6 5 10-1 4-5 5-8 5-5 0-8-3-8-7 0-4 3-6 4-8 0 3 1 4 2 4',
  frost: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 3 4-3M8 20l4-3 4 3M4 11l4-2V5m12 8-4 2v4M4 13l4 2v4m12-8-4-2V5',
  thunder: 'M14 2 5 13h6l-1 9 9-12h-6z',
  wind: 'M3 8h13a2.5 2.5 0 1 0-2.4-3M2 12h17a2.5 2.5 0 1 1-2.4 3M4 16h7a2.5 2.5 0 1 1-2.4 3',
  blood: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13zM9 16c0 1.5 1.5 3 3 3',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  hammer: 'm9 4 4-2 7 6-4 4-3-3-7 11-3-2 8-11zM6 4l3-2m10 15 3 2m-2-6h3',
  bag: 'M7 9V6a5 5 0 0 1 10 0v3m-9-3h8m-8 3h8l4 4v8H4v-8zM9 17h6m-5-4h4',
  store: 'M3 10 5 4h14l2 6-2 3-3-2-4 2-4-2-3 2zM5 13v8h14v-8m-8 8v-5h4v5',
  cycle: 'M20 7v5h-5M4 17v-5h5m10-1a7 7 0 0 0-12-4L4 9m1 4a7 7 0 0 0 12 4l3-2',
  dice: 'm12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10M8 7h.1m7 8h.1m3-2h.1m-11 1h.1m1.9 3h.1',
  sparkle: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5zM19 3v4m-2-2h4',
  iris: 'M2 12c5-8 15-8 20 0-5 8-15 8-20 0zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  chart: 'M3 3v18h18M7 17v-4m5 4V8m5 9V5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  sound: 'M3 10v4h4l5 4V6L7 10zm12-1a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  mute: 'M3 10v4h4l5 4V6L7 10zm12 0 5 5m0-5-5 5',
  warning: 'M12 3 2 20h20zM12 9v5m0 3h.1',
  crown: 'm3 7 5 4 4-6 4 6 5-4-3 10H6zM6 20h12',
  chest: 'M3 9c0-3 2-4 4-4h10c2 0 4 1 4 4v10H3zM3 11h18m-10 0v4h2v-4',
  pill: 'M6 18a5 5 0 0 1 0-7l5-5a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7 0zM8.5 8.5l7 7',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M4 11h16v10H4zM12 15v2',
  link: 'M9 15l6-6m-8 4-2 2a3 3 0 0 0 4 4l4-4m-2-6 4-4a3 3 0 0 1 4 4l-2 2',
  finish: 'M4 5v16M4 6h12l-2 4 2 4H4m0 7h6',
  focus: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m8-7v8m-4-4h8',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
  rune: 'm12 2 9 5v10l-9 5-9-5V7zM12 6l6 6-6 6-6-6zM12 10v4',
};

const aliases = {
  '❤': 'heart', '💚': 'heart', '💗': 'heart', '🛡': 'shield', '⚔': 'sword', '🗡': 'sword', '🏹': 'sword',
  '👾': 'beast', '👹': 'beast', '👺': 'beast', '💀': 'skull', '☠': 'skull', '💰': 'coin', '🪙': 'coin',
  '⚙': 'forge', '🔧': 'forge', '🪨': 'forge', '🔨': 'hammer', '🪓': 'hammer', '💥': 'hammer', '🧱': 'forge',
  '💠': 'gem', '💎': 'gem', '📿': 'gem', '🔮': 'gem', '🌟': 'sparkle', '✨': 'sparkle', '⭐': 'sparkle', '🌠': 'sparkle',
  '🔥': 'fire', '🌋': 'fire', '❄': 'frost', '🧊': 'frost', '🌩': 'thunder', '⚡': 'thunder', 'ϟ': 'thunder',
  '🌪': 'wind', '🍃': 'wind', '💨': 'wind', '🩸': 'blood', '☀': 'sun', '☼': 'sun', '🌕': 'sun', '🌙': 'sun',
  '🛒': 'store', '🏪': 'store', '🎒': 'bag', '🔄': 'cycle', '🔁': 'cycle', '🎲': 'dice',
  '📊': 'chart', '📈': 'chart', '⏳': 'clock', '⌛': 'clock', '⏱': 'clock', '🔊': 'sound', '🔇': 'mute',
  '⚠': 'warning', '❗': 'warning', '👑': 'crown', '🏆': 'crown', '🏅': 'crown', '📦': 'chest', '🎁': 'chest',
  '💊': 'pill', '🔒': 'lock', '🔓': 'lock', '🔗': 'link', '🏁': 'finish', '🎯': 'focus', '👁': 'iris',
  '🧩': 'layers', '📜': 'rune', '☯': 'rune', '✅': 'shield', '❌': 'skull', '☄': 'thunder',
};

export const ELEMENT_ICON = { wind: 'wind', fire: 'fire', frost: 'frost', thunder: 'thunder', holy: 'sun' };
export const SKILL_ICON = {
  blades: 'blades', firewave: 'fire', thunder: 'thunder', nova: 'frost',
  stomp: 'hammer', berserk: 'blood', swordlance: 'sword', sunward: 'sun',
};

const gearIcons = {
  sword: 'sword', flame: 'fire', frost: 'frost', thunder: 'thunder', blood: 'blood', greed: 'gem',
};

export function gearIcon(spec) {
  const mod = spec?.mod;
  if (mod?.stormLoad) return 'thunder';
  if (mod?.bloodRite || mod?.lifesteal) return 'blood';
  if (mod?.holyOath) return 'sun';
  if (mod?.windFlow) return 'wind';
  return gearIcons[spec?.set] || ELEMENT_ICON[spec?.elem] || 'layers';
}

export function icon(name) {
  const key = Object.hasOwn(paths, name) ? name : 'rune';
  return `<svg class="ui-icon icon-${key}" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]}"/></svg>`;
}

const emoji = String.raw`(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?)*|[ϟ☼])`;
const pictographs = new RegExp(emoji, 'gu');
const markupOrEmoji = new RegExp(String.raw`<!--[^]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|` + emoji, 'gu');

export function withoutIcons(value) {
  return String(value ?? '').replace(pictographs, '').replace(/[\uFE0E\uFE0F]/g, '').trim();
}

// Preserve the markup structure. In attributes (including tooltips), keep plain text.
export function withIcons(markup) {
  return String(markup ?? '').replace(markupOrEmoji, part =>
    part.startsWith('<') ? withoutIcons(part) : icon(aliases[part.replace(/[\uFE0E\uFE0F]/g, '')] || 'rune')
  );
}

const iconTextCache = new WeakMap();
export function setIconText(el, value) {
  if (!el) return;
  const text = String(value ?? '');
  if (iconTextCache.get(el) === text) return;
  iconTextCache.set(el, text);
  if (text.replace(pictographs, '') === text) el.textContent = text;
  else el.innerHTML = withIcons(text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]));
}
