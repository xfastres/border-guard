/* Border Guard v0.52 · Complete Headless Regression Suite
   Covers: 64x48 open map & HUD-safe camera, no-cleave starter draft, harvest gem vacuum + ground chests,
   unique 1★-5★ elemental seal ladder + on-hit impact eruption + auto-restock shop,
   5 Realms + overflow cap + Tribulation gamble (steady/force/bet/daoHeart/pills/mend pill),
   4 Recipe Combos + 18 Destiny Perks (3/4/6 choice + Lv1->Lv2 + Undying/MonoMastery/GoldPower/Overclock),
   20 Waves & Boss 4 (天劫魔尊) + MAX_ENEMIES soft cap.
   Run: node tests/v052-survivor-cultivation.test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Border-Guard-v0.52.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
const src = m[1];

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
    getBoundingClientRect() { return { height: 52, bottom: 96, width: 1280 }; },
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
  innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
  addEventListener: (t, fn) => { handlers[t] = fn; },
};
let rafCb = null;
const rafStub = cb => { rafCb = cb; };

new Function('window', 'document', 'requestAnimationFrame', src)(windowStub, documentStub, rafStub);
const BG = windowStub.BG52;
if (!BG) { console.error('FAIL: BG52 not exported'); process.exit(1); }

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

console.log('[1] Open 64x48 map, HUD-safe camera, culling & wide off-screen spawn');
BG.startNewRun(201, false);
let g = BG.game;
check('world 64x48, MAIN_WAVES=20, no castleHp/downTimer', BG.W === 64 && BG.H === 48 && BG.MAIN_WAVES === 20 && g.castleHp === undefined && g.hero.downTimer === undefined);
g.hero.y = 1.2;
for (let i = 0; i < 40; i++) BG.tick(0.05);
check('top edge stays below subbar (>=110px)', BG.worldToScreen(g.hero.x, g.hero.y).y >= 110);
g.hero.y = BG.H - 1.2;
for (let i = 0; i < 40; i++) BG.tick(0.05);
check('bottom edge stays above dock (<=cam.h-108)', BG.worldToScreen(g.hero.x, g.hero.y).y <= BG.cam.h - 108);
if (rafCb) rafCb(performance.now() + 16);
check('viewport culling draws << 3072 tiles', BG.perf.culledTiles > 100 && BG.perf.culledTiles < 1400);
BG.startNewRun(202, false); g = BG.game;
const viewHalfW = (BG.cam.w / (2 * BG.cam.zoom)) / 44;
const viewHalfH = (BG.cam.h / (2 * BG.cam.zoom)) / 44;
let allOff = true;
for (let i = 0; i < 40; i++) {
  const p = BG.spawnPosAroundHero(['west','east','north','south'][i % 4]);
  if (Math.abs(p.x - g.hero.x) < viewHalfW - 0.5 && Math.abs(p.y - g.hero.y) < viewHalfH - 0.5) allOff = false;
}
check('1920x1080 wide spawns 100% off-screen', allOff);

console.log('[2] No melee cleave + 3-choice starter active skill + realm-gated pool');
BG.startNewRun(203, true); g = BG.game;
check('starter modal opens on new run with empty skills', g.activeModal?.type === 'starter' && Object.keys(g.hero.skills).length === 0);
BG.pickHeroSkill('blades');
check('picking starter grants blades Lv.1 and closes modal', g.hero.skills.blades === 1 && !g.activeModal);
// Verify no melee cleave triggers without active skills
BG.startNewRun(204, false); g = BG.game;
g.phase = 'wave';
g.waveQueue = [{ at: 999, spawned: false, kind: 'slime', side: 'west', scale: 1 }];
const adj = BG.spawnEnemy('brute', 'east', 1, { x: g.hero.x + 1.0, y: g.hero.y });
const adjHp = adj.hp;
BG.tick(0.05);
check('no default melee cleave damages adjacent enemy when no skill picked', adj.hp === adjHp);

console.log('[3] Unique 1★-5★ Elemental Seal Ladder + impact-point eruption + auto-restock');
BG.startNewRun(205, false); g = BG.game;
g.gold = 900;
check('starts with no seal and 炼气 cap 2★', g.seal === null && BG.getSealStarCap() === 2);
g.shop = [
  { uid:1, itemType:'seal', kind:'wind', star:1, cost:22, bought:false, disc:0 },
  { uid:2, itemType:'seal', kind:'wind', star:1, cost:22, bought:false, disc:0 },
  { uid:3, itemType:'seal', kind:'wind', star:1, cost:22, bought:false, disc:0 },
  { uid:4, itemType:'seal', kind:'fire', star:1, cost:25, bought:false, disc:0 }
];
BG.buyShopItem(0);
check('buying first seal inscribes wind 1★', g.seal?.kind === 'wind' && g.seal.star === 1);
BG.buyShopItem(1);
check('buying second matching fuses wind to 2★ (炼气 cap)', g.seal.star === 2);
check('at 炼气 cap 2★, buying 3rd matching blocked until 筑基', BG.buyShopItem(2) === false && g.seal.star === 2);
// Advance realm to 元婴 (cap 5★, 2 sub-seal slots) and test 3★ (Tier-1 synergy) -> 5★ (Tier-2 ultimate synergy)
g.hero.realm = 3;
check('元婴 unlocks seal cap 5★ and 2 sub-seal slots', BG.getSealStarCap() === 5 && BG.getSubSealSlotCap() === 2);
g.shop[0] = { uid:5, itemType:'seal', kind:'wind', star:2, cost:44, bought:false, disc:0 };
BG.buyShopItem(0);
check('2★ card (+2pts) advances 2★->3★ and activates 2-tier synergy', g.seal.star === 3 && BG.getSynergyCounts().wind === 2);
g.shop[0] = { uid:6, itemType:'seal', kind:'wind', star:3, cost:84, bought:false, disc:0 };
g.shop[1] = { uid:7, itemType:'seal', kind:'wind', star:3, cost:84, bought:false, disc:0 };
BG.buyShopItem(0); BG.buyShopItem(1);
check('fuses to 5★仙印 and activates 4-tier ultimate synergy', g.seal.star === 5 && BG.getSynergyCounts().wind === 4);
// Buying heterogenous seal with open sub-seal slot inscribes Sub-Seal; when sub-seal slots full, switches Main Seal with 80% refund!
BG.buyShopItem(3); // fire 1★ -> goes into sub-seal slot 1!
check('buying fire 1★ with open sub-seal slot equips fire sub-seal instead of overwriting main seal', g.seal.kind === 'wind' && g.subSeals.length === 1 && g.subSeals[0].kind === 'fire');
g.shop[0] = { uid:8, itemType:'seal', kind:'frost', star:1, cost:23, bought:false, disc:0 };
g.shop[1] = { uid:9, itemType:'seal', kind:'thunder', star:1, cost:26, bought:false, disc:0 };
BG.buyShopItem(0); // frost 1★ -> sub-seal slot 2!
const beforeSwitchGold = g.gold;
BG.buyShopItem(1); // thunder 1★ -> sub-seal slots full -> switches main seal & refunds 80% of 5★ wind seal!
check('switching element when sub-seals full refunds 80% of 5★ wind seal and equips thunder 1★ main', g.seal.kind === 'thunder' && g.seal.star === 1 && g.subSeals.length === 2 && g.gold > beforeSwitchGold + 100);
// Auto-restock when all 4 bought
g.shop = [
  { uid:21, itemType:'pill', pillKey:'guard', cost:28, bought:false },
  { uid:22, itemType:'pill', pillKey:'guard', cost:28, bought:false },
  { uid:23, itemType:'pill', pillKey:'guard', cost:28, bought:false },
  { uid:24, itemType:'pill', pillKey:'guard', cost:28, bought:false }
];
BG.buyShopItem(0); BG.buyShopItem(1); BG.buyShopItem(2); BG.buyShopItem(3);
check('buying all 4 shop items auto-restocks fresh shop & stocks 4 guard pills', g.shop.every(s => !s.bought) && g.pills.guard === 4);
// Impact-point eruption ONLY on Hero hit
BG.startNewRun(206, false); g = BG.game;
BG.pickHeroSkill('blades');
g.seal = { kind:'wind', elem:'wind', star:1, prog:0, cd:0, dmgDealt:0, kills:0 };
g.phase = 'wave';
g.waveQueue = [{ at: 999, spawned: false, kind: 'slime', side: 'west', scale: 1 }];
const far = BG.spawnEnemy('slime', 'east', 1, { x: g.hero.x + 5.5, y: g.hero.y });
const farHp = far.hp;
BG.tick(0.05);
check('seal never auto-fires at distant mob without Hero hit', far.hp === farHp && g.projectiles.length === 0);
// Put enemy directly on tightened blade ring (r~1.75) so blades hit it and wind shards burst at impact point!
const ringMob = BG.spawnEnemy('brute', 'east', 1, { x: g.hero.x + 1.75, y: g.hero.y });
for (let i = 0; i < 30 && g.projectiles.length === 0; i++) BG.tick(0.04);
const shards = g.projectiles.filter(p => p.kind === 'arrow');
check('blade hit erupts wind shards directly from impact point', shards.length >= 2 && Math.hypot(shards[0].x - ringMob.x, shards[0].y - ringMob.y) < 1.2);

console.log('[4] Wave harvest gem vacuum + ground chests kept in prep + safety net on startWave');
BG.startNewRun(207, false); g = BG.game;
g.phase = 'wave'; g.waveQueue = []; g.enemies = [];
g.gems.push({ x: g.hero.x + 12, y: g.hero.y, xp: 10, big: false, vx: 0, vy: 0, t: 1 });
g.chests.push({ x: g.hero.x + 6, y: g.hero.y, legend: false, bob: 0 });
BG.tick(0.05);
check('wave end enters harvest phase and magnetizes gems (does NOT delete in 0ms)', g.phase === 'harvest' && g.gems.length === 1 && g.gems[0].magnetized === true);
for (let i = 0; i < 40 && g.phase === 'harvest'; i++) BG.tick(0.04);
check('harvest completes into prep, absorbs gems, and LEAVES chest on ground', g.phase === 'prep' && g.gems.length === 0 && g.chests.length === 1 && g.hero.xp >= 10);
// Calling startWave with uncollected ground chest triggers safety-net pickup!
BG.startWave();
check('startWave safety-net collects unpicked ground chest into modal', g.chests.length === 0 && g.activeModal?.type === 'chest');

console.log('[5] Realms, overflow cap, Tribulation gamble, Dao Heart, Mend Pill & Shop tier');
BG.startNewRun(208, false); g = BG.game;
// Level hero up to Lv.4 (炼气圆满) then fill threshold + overflow
g.hero.lv = 4; g.hero.xp = 0; g.hero.xpNext = BG.xpForLevel(4);
BG.gainHeroXp(g.hero.xpNext * 3);
check('threshold Lv.4 holds for tribulation & caps overflow at 2*xpNext', g.hero.lv === 4 && g.hero.tribulationReady === true && g.hero.xp === g.hero.xpNext * 2);
// Verify odds math & caps
g.hero.daoHeart = 5;
BG.grantGear('titan_crown'); BG.grantGear('titan_crown'); BG.grantGear('titan_crown'); // 3★ legend = 6 pts
const oddsSteady = BG.calcTribulationOdds({ mode: 'steady' });
check('steady mode is 100% (85/14/1)', oddsSteady.succ === 100 && oddsSteady.ren === 85 && oddsSteady.di === 14 && oddsSteady.tian === 1);
const oddsForce = BG.calcTribulationOdds({ mode: 'force', betGk: 'titan_crown#3', usePills: 5 });
check('force mode caps succ at 95% and tian at 50%', oddsForce.succ === 95 && oddsForce.tian === 50);
const oddsDao0 = BG.calcTribulationOdds({ mode: 'force', betGk: null, usePills: 0 });
g.hero.daoHeart = 0;
const oddsDaoNone = BG.calcTribulationOdds({ mode: 'force', betGk: null, usePills: 0 });
check('daoHeart boosts tian (+40%) and NEVER changes succ rate (75%)', oddsDao0.succ === 75 && oddsDaoNone.succ === 75 && oddsDao0.tian > oddsDaoNone.tian);
// Force a deterministic failure with bet gear -> verify destruction, daoHeart+1, 80% XP, and guaranteed Mend Pill within 2 waves!
g.rnd = () => 0.99; // roll=99 >= succ -> guaranteed fail
const failRes = BG.executeTribulation({ mode: 'force', betRef: { src: 'bag', idx: 0 }, usePills: 0 });
check('tribulation fail destroys bet gear, sets xp=80%, daoHeart+1', failRes.success === false && g.bag.length === 0 && g.lastDestroyedGear === 'titan_crown#3' && g.hero.daoHeart === 1 && g.hero.xp === Math.round(g.hero.xpNext * 0.8));
g.wave += 1; // Next wave -> guaranteed Mend Pill in slot 4!
BG.rollShop(true);
const mendSlot = g.shop.findIndex(s => s.itemType === 'pill' && s.pillKey === 'mend');
check('Mend Pill guaranteed in shop within 2 waves after destruction', mendSlot === 3);
g.gold = 500;
BG.buyShopItem(mendSlot);
check('buying Mend Pill restores 3★ titan_crown to bag & locks per-run limit', g.bag.includes('titan_crown#3') && g.mendPillBought === true);
// Steady breakthrough success -> advances realm, bumps shop tier, resets rerollCost=5, clears daoHeart, queues perk modal!
g.hero.tribulationReady = true; g.hero.xp = g.hero.xpNext; g.rerollCost = 11;
g.rnd = () => 0.001; // rolls TianDao even on steady (1%)!
const winRes = BG.executeTribulation({ mode: 'steady' });
check('tribulation success advances realm, bumps shopTier, resets rerollCost=5, clears daoHeart, opens perk modal',
  winRes.success === true && g.hero.realm === 1 && g.shopTierBonus === 1 && g.rerollCost === 5 && g.hero.daoHeart === 0 && g.activeModal?.type === 'perk');

console.log('[6] 4 Recipe Combos & 18 Destiny Perks (3/4/6 choice + Lv1->Lv2 + rule benders)');
BG.startNewRun(209, false); g = BG.game;
check('ren=3, di=4, tian=6 perk choices',
  BG.rollPerkChoices('ren').length === 3 && BG.rollPerkChoices('di').length === 4 && BG.rollPerkChoices('tian').length === 6);
const renNoEpic = BG.rollPerkChoices('ren').every(p => p.rarity !== 'epic');
const tianHasEpic = BG.rollPerkChoices('tian').filter(p => p.rarity === 'epic').length >= 2;
check('ren has no epics; tian guarantees >= 2 epics', renNoEpic && tianHasEpic);
// Combo discovery gated by Realm AND combined level >= 3
BG.pickHeroSkill('blades'); BG.pickHeroSkill('firewave');
check('万剑诀 stays locked at 炼气 (realm 0)', !BG.hasCombo('wanjian'));
g.hero.realm = 1; BG.refreshCombos(false);
check('万剑诀 stays locked at Lv.1+Lv.1 (sum<3) even at 筑基', !BG.hasCombo('wanjian'));
BG.pickHeroSkill('blades'); // blades Lv.2 + firewave Lv.1 = 3!
check('万剑诀 awakens automatically at 筑基 when combined level >= 3', BG.hasCombo('wanjian'));
// Perk Lv1 -> Lv2 in-place upgrade + Mono Mastery + Undying Will + Blood Oath + Gold Power
BG.pickPerk('mono_mastery');
const mmDmg1 = BG.getHeroStats().skillDmgMult;
BG.pickPerk('mono_mastery');
check('mono_mastery upgrades Lv.1->Lv.2 in-place and boosts skillDmgMult', BG.perkLv('mono_mastery') === 2 && Object.keys(g.hero.perks).length === 1 && BG.getHeroStats().skillDmgMult > mmDmg1);
BG.pickPerk('blood_oath');
check('blood_oath increases maxHp by +80', g.hero.maxHp === 300);
BG.pickPerk('undying_will');
g.phase = 'wave'; g.hero.invuln = 0;
BG.damageHero(9999);
check('undying_will saves Hero from fatal hit once per wave', g.phase === 'wave' && g.hero.hp > 0);
g.hero.invuln = 0;
BG.damageHero(9999);
check('second fatal hit in same wave triggers defeat', g.phase === 'lost' && g.hero.hp === 0);

console.log('[7] Soft cap MAX_ENEMIES + Boss 4 (天劫魔尊) triple thunder slam');
BG.startNewRun(210, false); g = BG.game;
g.phase = 'wave';
g.waveQueue = [];
for (let i = 0; i < 160; i++) g.waveQueue.push({ at: 0, side: 'west', kind: 'slime', scale: 1, spawned: false });
BG.tick(0.05);
check('soft cap pauses at MAX_ENEMIES (145)', g.enemies.length === BG.MAX_ENEMIES);
g.enemies = [];
BG.tick(0.05);
check('remaining 15 dequeue cleanly', g.enemies.length === 15);
// Boss 4 spawns 3 thunder slam zones
g.enemies = []; g.zones = []; g.wave = 20;
const b4 = BG.spawnEnemy('boss4', 'west', 1, { x: g.hero.x + 5, y: g.hero.y });
b4.bossTimer = 0.01;
BG.tick(0.05);
check('Boss 4 (天劫魔尊) spawns 3 telegraphed thunder slam zones', g.zones.filter(z => z.kind === 'bossSlam').length === 3);

console.log('[8] Sub-Seal Slot Unlocks, Synergy Sum, Resonance & Sell');
BG.startNewRun(211, false); g = BG.game;
g.gold = 800;
check('炼气 has 0 sub-seal slots', BG.getSubSealSlotCap() === 0);
BG.pickPerk('artifact_overclock');
check('artifact_overclock Lv.1 unlocks +1 sub-seal slot early', BG.getSubSealSlotCap() === 1);
g.hero.realm = 2; // 金丹 -> 2 sub-seal slots
check('金丹 caps sub-seal slots at 2', BG.getSubSealSlotCap() === 2);
g.shop = [
  { uid:101, itemType:'seal', kind:'fire', star:1, cost:25, bought:false, disc:0 },
  { uid:102, itemType:'seal', kind:'wind', star:3, cost:60, bought:false, disc:0 },
  { uid:103, itemType:'seal', kind:'holy', star:2, cost:50, bought:false, disc:0 },
  { uid:104, itemType:'seal', kind:'wind', star:1, cost:22, bought:false, disc:0 }
];
BG.buyShopItem(0); // Main fire 1★
BG.buyShopItem(1); // Sub wind 3★ (+2 wind synergy!)
BG.buyShopItem(2); // Sub holy 2★ (+1 holy synergy!)
check('sub-seals fuse up to 3★, sum synergy (wind=2), and block >3★',
  g.subSeals[0].star === 3 && BG.getSynergyCounts().wind === 2 && BG.buyShopItem(3) === false);
const preSellGold = g.gold;
BG.sellSubSeal(0);
check('sellSubSeal refunds 80% gold and frees slot', g.subSeals.length === 1 && g.gold > preSellGold + 40);

console.log('[9] 4-Tier Gears, Chapter-Locked Chests, No Auto-Inspector, Salvage, Lifesteal Cap');
BG.startNewRun(212, false); g = BG.game;
const rarities = new Set(Object.values(BG.GEARS).map(x => x.rarity));
check('GEARS has >=20 items across all 4 rarities', Object.keys(BG.GEARS).length >= 20 && ['common','rare','epic','legend'].every(r => rarities.has(r)));
g.wave = 2;
const earlyChoices = BG.pickChestGearChoices(false, false);
check('W2 normal elite chest only rolls common/rare (0% epic/legend)', earlyChoices.every(c => c.rarity === 'common' || c.rarity === 'rare'));
g.wave = 3;
const w3ShrineChoices = BG.pickChestGearChoices(false, true);
check('W3 Blood Shrine chest locks to common/rare (0% epic/legend)', w3ShrineChoices.every(c => c.rarity === 'common' || c.rarity === 'rare'));
g.wave = 5;
const w5BossChoices = BG.pickChestGearChoices(true, false);
check('W5 Boss1 chest guarantees >=1 epic and 0% legend', w5BossChoices.some(c => c.rarity === 'epic') && w5BossChoices.every(c => c.rarity !== 'legend'));
g.wave = 10;
const w10BossChoices = BG.pickChestGearChoices(true, false);
check('W10+ boss chest guarantees at least 1 legend', w10BossChoices.some(c => c.rarity === 'legend'));
BG.grantGear('wood_talisman');
g.inspTarget = null;
BG.equipGearFromBag(0);
check('wood_talisman increases maxHp by +45 and does NOT force-open inspector', g.hero.maxHp === 265 && g.inspTarget === null);
BG.unequipGear(0);
BG.salvageBagGear(0);
check('salvageBagGear melts common gear for +15 gold', g.bag.length === 0 && g.gold === 70);
// Lifesteal per-second pool cap
BG.grantGear('asura_blood');
BG.equipGearFromBag(0);
check('asura_blood reduces maxHp by 20%', g.hero.maxHp === Math.round(220 * 0.80));
g.hero.hp = 50; g.hero.leechUsed = 0;
g.phase = 'wave'; g.waveQueue = [{ at: 999, spawned: false, kind: 'slime', side: 'west', scale: 1 }];
BG.pickHeroSkill('blades');
const mob1 = BG.spawnEnemy('brute', 'east', 10, { x: g.hero.x + 1.75, y: g.hero.y });
mob1.hp = 99999;
for (let k = 0; k < 5; k++) BG.spawnEnemy('slime', 'east', 10, { x: g.hero.x + 1.75, y: g.hero.y });
BG.grantGear('vamp_fang'); BG.grantGear('vamp_fang'); BG.grantGear('vamp_fang'); BG.equipGearFromBag(0);
for (let i = 0; i < 15; i++) BG.tick(0.05);
check('lifesteal respects per-second recovery pool cap (cannot insta-full-heal)', g.hero.hp <= 50 + Math.max(10, Math.round(g.hero.maxHp * 0.055)) + 2);

console.log('[10] Sawtooth 3-Stage Wave, Chapter Blood Shrine, Crowd Slowdown & Telemetry');
BG.startNewRun(213, false); g = BG.game;
check('W5 is peak, W6 is relief (hpMult 0.78, mobMult 1.20)',
  BG.getWavePhaseMeta(5).kind === 'peak' && BG.getWavePhaseMeta(6).kind === 'relief' && BG.getWavePhaseMeta(6).hpMult === 0.78);
const q4 = BG.buildWaveQueue(4);
const dur4 = Math.min(24, 14 + 4 * 0.55);
const s1 = q4.filter(x => x.kind !== 'elite' && x.at <= dur4 * 0.41).length;
const s2 = q4.filter(x => x.kind !== 'elite' && x.at > dur4 * 0.41 && x.at < dur4 * 0.53).length;
const s3 = q4.filter(x => x.kind !== 'elite' && x.at >= dur4 * 0.53).length;
check('wave queue has 3-stage storm buffer waveform (dense s1 -> quiet s2 -> dense s3)', s1 >= 20 && s2 <= 4 && s3 >= 35);
g.wave = 2;
BG.startWave();
check('startWave W2 has NO Blood Shrine (once per chapter)', g.shrine === null && !!g.curWaveTel);
// Complete W2 then start W3 (in SHRINE_WAVES)
g.phase = 'prep'; g.wave = 3;
BG.startWave();
check('startWave W3 spawns optional Blood Shrine and initializes telemetry', !!g.shrine && !!g.curWaveTel);
// Trigger shrine by standing on it
g.hero.x = g.shrine.x; g.hero.y = g.shrine.y;
for (let i = 0; i < 10 && !g.shrine.active; i++) BG.tick(0.05);
const shrineBoss = g.enemies.find(e => e.isShrineBoss);
check('standing on Blood Shrine spawns 2-affix Shrine Boss', !!g.shrine.active && !!shrineBoss && shrineBoss.affixes.length === 2);
// Kill Shrine Boss -> drops shrineTier chest + 25 gold + permanent +4% TianDao, NO giant XP orb!
const preTian = BG.calcTribulationOdds({ mode:'force' }).tian;
const preGems = g.gems.length;
const preGold = g.gold;
shrineBoss.hp = 1;
g.hero.x = shrineBoss.x; g.hero.y = shrineBoss.y;
BG.castHeroDash();
const giantOrb = g.gems.slice(preGems).find(gm => gm.xp >= 30);
check('killing Shrine Boss grants +4% TianDao, +25 gold, chest, and NO giant XP orb',
  g.hero.shrineBonusTian === 4 && BG.calcTribulationOdds({ mode:'force' }).tian >= preTian + 4 && g.gold >= preGold + 25 && !giantOrb);
// Crowd slowdown test
g.enemies = []; g.hero.invuln = 0; g.hero.ultTimer = 0; g.hero.goal = null;
const baseX = g.hero.x;
keysDownSim: {
  // Spawn 4 mobs hugging hero -> movement slows vs unobstructed
  for (let i = 0; i < 4; i++) BG.spawnEnemy('slime', 'east', 1, { x: g.hero.x + 0.4, y: g.hero.y });
  const preMove = g.hero.x;
  g.hero.goal = { x: g.hero.x + 3, y: g.hero.y };
  BG.tick(0.1);
  const crowdedStep = g.hero.x - preMove;
  g.enemies = [];
  const preFree = g.hero.x;
  g.hero.goal = { x: g.hero.x + 3, y: g.hero.y };
  BG.tick(0.1);
  const freeStep = g.hero.x - preFree;
  check('surrounded Hero walks significantly slower than unobstructed Hero', crowdedStep > 0 && crowdedStep < freeStep * 0.72);
}
// Complete wave -> telemetry recorded
g.waveQueue.forEach(w => w.spawned = true);
g.enemies = []; g.gems = [];
BG.tick(0.05);
check('completing wave records entry in getTelemetryReport()', BG.getTelemetryReport().waves.length === 1);

console.log('[11] Breakthrough Enemies (bomber/shaman/wolf/brute) & 4 Boss Mechanics');
BG.startNewRun(214, false); g = BG.game;
g.phase = 'wave'; g.wave = 8; g.waveQueue = [{ at:999, kind:'slime', side:'west', scale:1, spawned:false }];
const bmb = BG.spawnEnemy('bomber', 'east', 1, { x: g.hero.x + 2, y: g.hero.y });
bmb.burnT = 1; bmb.burnDps = 9999; // dies on burn tick
BG.tick(0.05);
check('bomber death spawns telegraphed poisonBomb zone', g.zones.some(z => z.kind === 'poisonBomb'));
const sha = BG.spawnEnemy('shaman', 'east', 1, { x: g.hero.x + 3, y: g.hero.y });
const ally = BG.spawnEnemy('slime', 'east', 1, { x: sha.x + 1, y: sha.y });
ally.hp = 1; sha.shamanTimer = 0.01;
BG.tick(0.05);
check('shaman heals nearby ally and applies frenzy', ally.hp > 1 && ally.frenzyT > 0);
const wlf = BG.spawnEnemy('wolf', 'east', 1, { x: g.hero.x + 3.0, y: g.hero.y });
wlf.aiCd = 0;
BG.tick(0.05);
check('wolf initiates windup leap telegraph within 2.0-4.4 cells', wlf.aiState === 'windup' && wlf.aiKind === 'leap');
const brt = BG.spawnEnemy('brute', 'east', 1, { x: g.hero.x + 3.5, y: g.hero.y });
brt.aiCd = 0;
BG.tick(0.05);
check('brute initiates windup charge telegraph', brt.aiState === 'windup' && brt.aiKind === 'charge');
// Boss 2 volley & Boss 3 shockwave
g.enemies = []; g.projectiles = []; g.zones = [];
const b2 = BG.spawnEnemy('boss2', 'west', 1, { x: g.hero.x + 5, y: g.hero.y });
b2.bossTimer = 0.01;
BG.tick(0.05);
check('Boss 2 fires 10-orb radial enemyShot volley', g.projectiles.filter(p => p.kind === 'enemyShot').length >= 10);
g.enemies = []; g.zones = [];
const b3 = BG.spawnEnemy('boss3', 'west', 1, { x: g.hero.x + 5, y: g.hero.y });
b3.bossTimer = 0.01;
BG.tick(0.05);
check('Boss 3 spawns expanding bossWave shockwave + bossSlam', g.zones.some(z => z.kind === 'bossWave') && g.zones.some(z => z.kind === 'bossSlam'));

console.log('[12] Alternating Level-Up Skill Draft & Tightened Combat Range Guard');
BG.startNewRun(215, false); g = BG.game;
BG.gainHeroXp(g.hero.xpNext); // Lv.1 -> Lv.2 (even: opens levelup modal)
check('Lv.1 -> Lv.2 (even) queues levelup modal', g.hero.lv === 2 && g.activeModal?.type === 'levelup');
BG.pickHeroSkill('blades'); // closes modal
const hpBeforeLv3 = g.hero.maxHp;
BG.gainHeroXp(g.hero.xpNext); // Lv.2 -> Lv.3 (odd: auto-temper, NO levelup modal!)
check('Lv.2 -> Lv.3 (odd) grants +24 maxHp auto-temper with NO levelup modal',
  g.hero.lv === 3 && g.hero.maxHp === hpBeforeLv3 + 24 && !g.activeModal && g.pendingModals.length === 0);
// Tightened Seal trigger distance: hit beyond 4.8 cells must NOT trigger seal explosion!
g.phase = 'wave'; g.waveQueue = [{ at:999, kind:'slime', side:'west', scale:1, spawned:false }];
g.seal = { kind:'wind', elem:'wind', star:1, prog:0, cd:0, dmgDealt:0, kills:0 };
g.projectiles = [];
g.enemies = [];
const distMob = BG.spawnEnemy('brute', 'east', 10, { x: g.hero.x + 6.5, y: g.hero.y });
// Force firewave cast or dash? Actually firewave is cast in updateHero, let's check dealDamage directly via projectile crossing distMob at 6.5 cells
g.projectiles.push({ kind:'firewave', x: distMob.x - 0.1, y: distMob.y, vx: 10, vy: 0, life: 0.5, r: 0.52, pierce: 2, hitSet: new Set(), dmg: 20, critChance: 0, critDmg: 1.5, lifesteal: 0, bonusGold: 0 });
BG.tick(0.05);
check('distant hero hit (>4.8 cells) does NOT trigger seal burst', g.seal.cd === 0 && g.projectiles.filter(p => p.kind === 'arrow').length === 0);

console.log('[13] No-Whiff Skills, Unstoppable Charge/Leap, Sets/DualRes & Left Build HUD');
// 13a. No-whiff guard: spirit, firewave, nova, stomp MUST NOT fire when all enemies are 7.5 cells away, then MUST fire when enemy steps to 3.2 cells!
BG.startNewRun(216, false); g = BG.game;
BG.pickHeroSkill('firewave'); BG.pickHeroSkill('nova'); BG.pickHeroSkill('stomp');
g.phase = 'wave'; g.waveQueue = [{ at:999, kind:'slime', side:'west', scale:1, spawned:false }];
g.hero.skillTimers = { spirit: 0, firewave: 0, nova: 0, stomp: 0, thunder: 0 };
g.projectiles = []; g.rings = [];
const farEnemy = BG.spawnEnemy('brute', 'east', 10, { x: g.hero.x + 7.5, y: g.hero.y });
for (let i = 0; i < 4; i++) BG.tick(0.05);
check('spirit/firewave/nova/stomp do NOT whiff when enemy is 7.5 cells out',
  g.projectiles.length === 0 && g.rings.length === 0 && g.hero.skillTimers.spirit === 0 && g.hero.skillTimers.firewave === 0);
farEnemy.x = g.hero.x + 1.8;
BG.tick(0.05);
check('ready skills fire immediately when enemy enters range (1.8 cells)',
  g.projectiles.length >= 2 && g.rings.length >= 2);

// 13b. Unstoppable windup/charge/leap immunity to slow & freeze + Shaman anti-AFK meteor zone
BG.startNewRun(217, false); g = BG.game;
BG.pickHeroSkill('nova'); BG.pickHeroSkill('stomp');
g.phase = 'wave'; g.wave = 7; g.waveQueue = [{ at:999, kind:'slime', side:'west', scale:1, spawned:false }];
const chBrute = BG.spawnEnemy('brute', 'east', 5, { x: g.hero.x + 2.0, y: g.hero.y });
chBrute.aiCd = 0; chBrute.slow = 0.5; chBrute.slowT = 2.0;
BG.tick(0.05); // triggers windup -> unstoppable clears existing slow!
check('brute entering windup becomes unstoppable and clears slow',
  BG.isEnemyUnstoppable(chBrute) && chBrute.slow === 0 && chBrute.slowT === 0 && chBrute.freezeT === 0);
g.hero.skillTimers.nova = 0; g.hero.skillTimers.stomp = 0;
BG.tick(0.05); // nova/stomp hit windup brute -> still immune to slow & freeze!
check('unstoppable windup/charge enemy ignores nova slow & stomp freeze',
  chBrute.slow === 0 && chBrute.slowT === 0 && chBrute.freezeT === 0);
const shaMob = BG.spawnEnemy('shaman', 'east', 5, { x: g.hero.x + 4.5, y: g.hero.y });
shaMob.shamanTimer = 0.01; g.zones = [];
BG.tick(0.05);
check('shaman spawns anti-AFK bossSlam meteor zone on Hero', g.zones.some(z => z.kind === 'bossSlam' && z.leaveLava));

// 13c. Gear element points + 6 Gear Sets + 5 Dual-Element Resonances + Left HUD rendering
BG.startNewRun(218, false); g = BG.game;
BG.pickHeroSkill('blades'); BG.pickHeroSkill('blades'); BG.pickHeroSkill('firewave');
g.hero.realm = 1; BG.refreshCombos(false); // awakens 万剑诀!
g.seal = { kind:'fire', elem:'fire', star:3, prog:0, cd:0, dmgDealt:0, kills:0 }; // 2 fire synergy!
BG.grantGear('bronze_tassel'); BG.equipGearFromBag(0); // +1 wind, sword set (1/2)
BG.grantGear('swift_boots'); BG.equipGearFromBag(0);   // +1 wind -> 2 wind! sword set (2/2)!
check('equipping 2 sword-set wind gears activates sword 2pc set, counts wind=2, and activates wind_fire dual resonance',
  BG.gearSetTier('sword') === 2 && BG.getSynergyCounts().wind === 2 && BG.hasDualRes('wind_fire'));
const leftHtml = elCache['leftHudBody']?.innerHTML || '';
check('leftHud displays active seal, gear set (剑影套), dual resonance (风助火势) & combo (万剑诀)',
  leftHtml.includes('赤焰灵印') && leftHtml.includes('剑影套') && leftHtml.includes('风助火势') && leftHtml.includes('万剑诀'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
