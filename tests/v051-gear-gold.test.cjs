/* v0.51 headless regression: Q-reroll hotkey, escalating reroll cost, gear auto-stacking, gold HUD.
   Run: node tests/v051-gear-gold.test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Border-Guard-v0.51.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
const src = m[1];

/* ---- minimal DOM / window stubs ---- */
const ctx2d = new Proxy({}, { get: () => () => {} });
function makeEl(id) {
  const el = {
    id, style: { setProperty() {} }, dataset: {}, hidden: false,
    innerHTML: '', disabled: false, title: '', className: '',
    offsetWidth: 0, children: [], _q: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, append(...c) { this.children.push(...c); },
    appendChild(c) { this.children.push(c); }, replaceChildren(...c) { this.children = c; },
    querySelector(sel) { return (this._q[sel] ||= makeEl('q:' + sel)); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { height: 52, bottom: 96, width: 800 }; },
    getContext() { return ctx2d; },
  };
  let _tc = '';
  Object.defineProperty(el, 'textContent', { get() { return _tc; }, set(v) { _tc = String(v); } });
  return el;
}
const elCache = {};
const documentStub = {
  getElementById: id => (elCache[id] ||= makeEl(id)),
  createElement: tag => makeEl(tag),
  documentElement: makeEl('html'),
  addEventListener() {},
};
const handlers = {};
const windowStub = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: (t, fn) => { handlers[t] = fn; },
};
const rafStub = () => {};

/* ---- load game script ---- */
new Function('window', 'document', 'requestAnimationFrame', src)(windowStub, documentStub, rafStub);
const BG = windowStub.BG51;
if (!BG) { console.error('FAIL: BG51 not exported'); process.exit(1); }

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* ---- 1. hotkey: D must NOT reroll, Q must ---- */
console.log('[1] reroll hotkey');
BG.startNewRun(7);
let g = BG.game;
const uidsBefore = g.shop.map(s => s.uid).join(',');
const goldBefore = g.gold;
handlers.keydown({ key: 'd', preventDefault() {} });
check('D no longer rerolls shop', g.shop.map(s => s.uid).join(',') === uidsBefore && g.gold === goldBefore);
handlers.keydown({ key: 'q', preventDefault() {} });
check('Q rerolls shop and charges gold', g.shop.map(s => s.uid).join(',') !== uidsBefore && g.gold === goldBefore - 5);

/* ---- 2. escalating reroll cost + wave reset ---- */
console.log('[2] reroll economy');
check('reroll cost escalated to 7', g.rerollCost === 7);
BG.rollShop(false);
check('reroll cost escalated to 9', g.rerollCost === 9);
g.phase = 'wave'; g.waveQueue = []; g.enemies = []; g.gems = []; g.chests = [];
BG.tick(0.016); // empty wave -> onWaveCleared
check('wave cleared advances wave', g.wave === 2 && g.phase === 'prep');
check('reroll cost reset to 5 on wave clear', g.rerollCost === 5);
check('reroll cost label updated', elCache.rerollCost.textContent === '5 金币');

/* ---- 3. gear auto-stacking in bag ---- */
console.log('[3] gear stacking (bag)');
BG.startNewRun(11); g = BG.game;
BG.pickGearReward('crit_axe');
check('first copy lands in bag as 1★', g.bag.length === 1 && g.bag[0] === 'crit_axe');
BG.pickGearReward('crit_axe');
check('second copy fuses to 2★', g.bag.length === 1 && g.bag[0] === 'crit_axe#2');
BG.pickGearReward('crit_axe');
check('third copy fuses to 3★', g.bag.length === 1 && g.bag[0] === 'crit_axe#3');
BG.pickGearReward('crit_axe');
check('fourth copy (all maxed) enters bag as new 1★', g.bag.length === 2 && g.bag[1] === 'crit_axe');

/* ---- 4. equipped copies upgrade first (hero priority) ---- */
console.log('[4] gear stacking (equipped priority)');
BG.startNewRun(12); g = BG.game;
BG.pickGearReward('vamp_fang');
BG.equipGearFromBag(0, { type: 'hero' });
check('equipped on hero', g.hero.gear[0] === 'vamp_fang' && g.bag.length === 0);
BG.pickGearReward('vamp_fang');
check('duplicate upgrades equipped hero copy', g.hero.gear[0] === 'vamp_fang#2' && g.bag.length === 0);
check('2★ lifesteal scaled x1.6', approx(BG.getHeroStats().gm.lifesteal, 3 * 1.6));

/* ---- 5. star stat math ---- */
console.log('[5] star stat math');
BG.startNewRun(13); g = BG.game;
BG.grantGear('crit_axe'); BG.grantGear('crit_axe'); BG.grantGear('crit_axe');
BG.equipGearFromBag(0, { type: 'hero' });
check('3★ crit = 0.25 x 2.3', approx(BG.getHeroStats().gm.crit, 0.25 * 2.3));

BG.startNewRun(14); g = BG.game;
g.gold = 200;
g.shop[0] = { uid: 1, kind: 'frost', cost: 16, bought: false, disc: 0 };
BG.buyAndPlaceTower(0, 9, 5);
const frost = g.towers[0];
BG.grantGear('frost_orb');
BG.equipGearFromBag(0, { type: 'tower', id: frost.id });
BG.grantGear('frost_orb'); BG.grantGear('frost_orb');
check('tower copy stacked to 3★', frost.gear[0] === 'frost_orb#3');
check('slowOnHit capped at 0.65', approx(BG.getTowerStats(frost).slow, 0.65));

BG.startNewRun(17); g = BG.game;
g.gold = 200;
g.shop[0] = { uid: 1, kind: 'wind', cost: 15, bought: false, disc: 0 };
BG.buyAndPlaceTower(0, 9, 5);
const wind = g.towers[0];
BG.grantGear('split_bow'); BG.grantGear('split_bow');
BG.equipGearFromBag(0, { type: 'tower', id: wind.id });
check('2★ extraShot is integer 2', BG.getTowerStats(wind).shots === 1 + 2);

/* ---- 6. tower merge keeps starred gear ---- */
console.log('[6] merge regression with starred gear');
BG.startNewRun(16); g = BG.game;
g.gold = 200;
g.shop[0] = { uid: 1, kind: 'wind', cost: 15, bought: false, disc: 0 };
g.shop[1] = { uid: 2, kind: 'wind', cost: 15, bought: false, disc: 0 };
BG.buyAndPlaceTower(0, 9, 5);
BG.buyAndPlaceTower(1, 13, 5);
BG.grantGear('split_bow'); BG.grantGear('split_bow');
BG.equipGearFromBag(0, { type: 'tower', id: g.towers[0].id });
BG.mergeTowerAction(g.towers[0].id);
check('merged to 2★ and kept 2★ gear', g.towers.length === 1 && g.towers[0].star === 2 && g.towers[0].gear[0] === 'split_bow#2');

/* ---- 7. gold HUD sync ---- */
console.log('[7] gold HUD');
BG.startNewRun(18); g = BG.game;
g.gold = 123;
BG.rollShop(true); // triggers renderAllUI
check('top gold pill synced', elCache.goldPill.textContent === '💰 123');
check('dock gold counter synced', elCache.dockGoldNum.textContent === '123');

/* ---- 8. chest modal shows stack hint ---- */
console.log('[8] chest draft stack hint');
BG.startNewRun(15); g = BG.game;
for (const k of Object.keys(BG.GEARS)) BG.grantGear(k); // own every gear at 1★
g.phase = 'wave';
g.waveQueue = [{ at: 999, spawned: false, kind: 'slime', side: 'west', scale: 1 }];
g.chests.push({ x: g.hero.x, y: g.hero.y, legend: false, bob: 0 });
BG.tick(0.016);
check('chest modal opened', !!g.activeModal && g.activeModal.type === 'chest');
const grid = elCache.modalBox.querySelector('#modalChoices');
check('draft cards show stack hint', grid.children.some(c => String(c.innerHTML).includes('选它叠 2★')));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);