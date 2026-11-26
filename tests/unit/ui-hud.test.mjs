import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { ARTIFACTS, PILLS } from '../../src/data/index.js';
import { createHudController, createHudSystem, gearListSig } from '../../src/ui/hud/index.js';

function hudElement() {
  const classes = new Set();
  const attributes = new Map();
  return {
    classList: {
      add: name => classes.add(name),
      contains: name => classes.has(name),
      remove: name => classes.delete(name),
      toggle(name, enabled = !classes.has(name)) {
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
  };
}

function controllerFixture(initialWidth) {
  let width = initialWidth;
  const elements = {
    leftHud: hudElement(),
    leftHudToggle: hudElement(),
    battleHud: hudElement(),
    battleHudToggle: hudElement(),
  };
  const reset = [];
  const controller = createHudController(createRuntimeContext(), {
    getEl: id => elements[id],
    getViewportWidth: () => width,
    battleHud: { resetDirty: () => reset.push('battle') },
    buildHud: { resetDirty: () => reset.push('build') },
    dockUI: { resetDirty: () => reset.push('dock') },
    inspectorUI: { resetDirty: () => reset.push('inspector') },
  });
  return { controller, elements, setWidth: value => { width = value; }, reset };
}

function assertExpanded(elements, panel, expanded) {
  assert.equal(elements[panel].classList.contains('collapsed'), !expanded);
}

test('gear list signatures preserve empty lists and legacy starred gear strings', () => {
  assert.equal(gearListSig([]), '');
  assert.equal(gearListSig(undefined), '');
  assert.equal(gearListSig(['legacy#2', null, 'legacy#3']), 'legacy#2,,legacy#3');
});

test('gear list signatures track instance UIDs, enhancement levels, affixes and seal stars', () => {
  const gear = { uid: 'gear-1', baseKey: 'legacy', enhanceLv: 0, slotsCount: 2, affixes: [{ id: 'fire_brand' }, null] };
  const seal = { itemType: 'seal', uid: 'seal-1', kind: 'fire', star: 1 };
  assert.equal(gearListSig([gear, seal]), 'gear-1:0:2:fire_brand:1+_,seal:seal-1:fire:1');
  for (const change of [
    { uid: 'gear-2' },
    { enhanceLv: 1 },
    { affixes: [{ id: 'fire_brand', tier: 2 }, null] },
    { affixes: [null, { id: 'fire_brand' }] },
  ]) {
    assert.notEqual(gearListSig([{ ...gear, ...change }]), gearListSig([gear]));
  }
  assert.notEqual(gearListSig([{ ...seal, star: 2 }]), gearListSig([seal]));
});

test('responsive HUD applies changes at 980px and preserves manual choices within a mode', () => {
  const { controller, elements, setWidth } = controllerFixture(981);
  controller.syncHudResponsiveMode();
  assertExpanded(elements, 'leftHud', true);
  assertExpanded(elements, 'battleHud', true);

  controller.toggleBattleHud();
  setWidth(1200);
  controller.syncHudResponsiveMode();
  assertExpanded(elements, 'battleHud', false);

  setWidth(980);
  controller.syncHudResponsiveMode();
  assertExpanded(elements, 'leftHud', false);
  assertExpanded(elements, 'battleHud', false);

  controller.toggleLeftHud();
  setWidth(720);
  controller.syncHudResponsiveMode();
  assertExpanded(elements, 'leftHud', true);

  setWidth(981);
  controller.syncHudResponsiveMode();
  assertExpanded(elements, 'leftHud', true);
  assertExpanded(elements, 'battleHud', true);
});

test('manual HUD toggles update collapsed class and button copy, collapsing peer in compact mode', () => {
  const { controller, elements } = controllerFixture(720);
  controller.syncHudResponsiveMode();

  controller.toggleLeftHud();
  assertExpanded(elements, 'leftHud', true);
  assert.equal(elements.leftHudToggle.textContent, '折叠 [Tab]');

  controller.toggleBattleHud();
  assertExpanded(elements, 'leftHud', false);
  assertExpanded(elements, 'battleHud', true);
  assert.equal(elements.battleHudToggle.textContent, '折叠');

  controller.toggleBattleHud();
  assertExpanded(elements, 'battleHud', false);
  assert.equal(elements.battleHudToggle.textContent, '展开');

  controller.toggleLeftHud();
  controller.toggleLeftHud();
  assertExpanded(elements, 'leftHud', false);
  assert.equal(elements.leftHudToggle.textContent, '展开 [Tab]');
});

test('resetDirtyKeys resets each panel on every call', () => {
  const { controller, reset } = controllerFixture(1280);
  controller.resetDirtyKeys();
  assert.deepEqual(reset.sort(), ['battle', 'build', 'dock', 'inspector']);
  reset.length = 0;
  controller.resetDirtyKeys();
  assert.deepEqual(reset.sort(), ['battle', 'build', 'dock', 'inspector']);
});

test('HUD rendering skips clean panels and repaints them all after reset while reusing shop buttons', t => {
  function element() {
    const children = [];
    const selectors = new Map();
    const events = new Map();
    return {
      ...hudElement(), children, events, updates: 0, dataset: {}, style: { setProperty() {} },
      set innerHTML(value) { this.updates++; },
      set textContent(value) { this.text = value; this.updates++; },
      get textContent() { return this.text; },
      replaceChildren() { this.updates++; children.length = 0; },
      append: (...nodes) => children.push(...nodes),
      addEventListener: (name, handler) => events.set(name, handler),
      querySelectorAll: () => [],
      querySelector(selector) {
        if (!selectors.has(selector)) selectors.set(selector, element());
        return selectors.get(selector);
      },
      getBoundingClientRect: () => ({ height: 52, bottom: 96 }),
    };
  }

  const elements = new Map();
  const getEl = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  globalThis.document = { createElement: element, documentElement: element() };
  t.after(() => { delete globalThis.document; });

  const kind = Object.keys(ARTIFACTS)[0];
  const pillKey = Object.keys(PILLS)[0];
  const game = {
    wave: 1, phase: 'prep', speed: 1, gold: 100, rerollCost: 5,
    hero: { hp: 100, maxHp: 100, shield: 0, lv: 1, xp: 0, xpNext: 100, skills: { blades: 1 }, gear: [], combos: {}, perks: {}, breakthroughs: {} },
    stats: { kills: 0, elites: 0, dmgTotal: 0 }, enemies: [], waveQueue: [], chests: [], bag: [],
    subSeals: [{ kind, elem: ARTIFACTS[kind].elem, star: 1, prog: 0 }],
    shop: [{ uid: 'pill-1', itemType: 'pill', pillKey, cost: 50 }], inspTarget: { type: 'seal' },
  };
  const runtimeCtx = createRuntimeContext({ game });
  runtimeCtx.setPaused(true);
  const previews = [];
  const hud = createHudSystem(runtimeCtx, {
    getEl, perfStats: { fps: 60 }, audio: { enabled: false, unlock() {} },
    feedback: {}, formatters: {}, modals: {}, progression: { isW20PreselectOpen: () => false, getPendingDestinyOffer: () => null },
    meta: { getMetaSave: () => ({}), getActiveMetaMain: () => null, getActiveMetaLoadout: () => ({}), getMetaLoadoutBudget: () => ({ auxPoints: 0 }), isMetaLoadoutLocked: () => false, hasMetaAux: () => false },
    unlock: { getSealStarCap: () => 2, getSubSealSlotCap: () => 1, getRealmStageLabel: () => '炼气' },
    run: { getWavePhaseMeta: () => ({ tag: '初探' }), getWaveEncounterInfo: () => null, getEndgameOmenState: () => ({ triggered: false }) },
    hero: { getSynergyCounts: () => ({}), getActiveGearSets: () => [], getGearSetCounts: () => ({}), getActiveDualResonances: () => [] },
    equipment: { getActiveGearAffixSynergies: () => ({ active: [] }) },
    economy: { sealTotalPoints: () => 1, openShopPurchaseConfirm: idx => previews.push(idx) },
  });

  hud.renderAllUI();
  assert.equal(getEl('pauseBtn').textContent, '继续');
  assert.equal(getEl('soundBtn').textContent, '🔇');
  const shopButton = getEl('shopSec').children[0];
  const panels = [
    ...['battleHudBody', 'leftHudBody', 'sealStrip', 'skillStrip', 'bagTray', 'inspStats'].map(getEl),
    shopButton.querySelector('.cost'),
  ];
  const updates = () => panels.map(panel => panel.updates);
  assert.deepEqual(updates(), [1, 1, 1, 1, 1, 1, 1]);
  hud.renderAllUI();
  assert.deepEqual(updates(), [1, 1, 1, 1, 1, 1, 1]);

  hud.resetDirtyKeys();
  hud.renderAllUI();
  assert.deepEqual(updates(), [2, 2, 2, 2, 2, 2, 2]);
  assert.equal(getEl('shopSec').children[0], shopButton);

  runtimeCtx.setGame({ ...game, shop: [{ ...game.shop[0], bought: true }] });
  shopButton.events.get('click')();
  assert.deepEqual(previews, []);
  runtimeCtx.setGame(game);
  shopButton.events.get('click')();
  assert.deepEqual(previews, [0]);
});
