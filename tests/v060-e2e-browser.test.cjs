'use strict';
/**
 * Border-Guard v0.60 Real Headless Chrome Interactive E2E Test Suite
 *
 * Uses local /usr/bin/google-chrome + Node 22 native fetch & WebSocket over CDP
 * (ZERO external npm dependencies). Exercises real DOM clicks (Input.dispatchMouseEvent)
 * and real keyboard events (Input.dispatchKeyEvent) against Border-Guard-v0.60.html
 * and asserts 0 uncaught JS exceptions and 0 console.error entries across all 6 scenarios.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'Border-Guard-v0.60.html');
const FILE_URL = `file://${HTML_PATH}`;
const CHROME_BIN = '/usr/bin/google-chrome';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (err) => { clearTimeout(timer); reject(err); }, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP error (${msg.error.code}): ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.listeners.get(msg.method) || [];
        for (const fn of list) fn(msg.params);
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP method timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const txt = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime.evaluate exception';
      throw new Error(`Page eval error: ${txt}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async waitFor(expression, { timeoutMs = 6000, intervalMs = 40, label = expression } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await this.eval(expression);
      if (val) return val;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`waitFor timeout (${timeoutMs}ms): ${label}`);
  }

  async clickSelector(selector, { index = 0, clickCount = 1 } = {}) {
    const rect = await this.eval(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const el = els[${index}];
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        found: true,
        disabled: !!el.disabled,
        hidden: style.display === 'none' || style.visibility === 'hidden' || r.width <= 0 || r.height <= 0,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        text: (el.textContent || '').trim().slice(0, 60)
      };
    })()`);
    assert.ok(rect && rect.found, `Element not found for real click: ${selector}[${index}]`);
    assert.equal(rect.hidden, false, `Element is hidden/zero-size for real click: ${selector}[${index}] (${rect.text})`);
    assert.equal(rect.disabled, false, `Element is disabled for real click: ${selector}[${index}] (${rect.text})`);

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    for (let i = 0; i < clickCount; i++) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: i + 1
      });
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: i + 1
      });
    }
    await new Promise(r => setTimeout(r, 40));
    return rect;
  }

  async pressKey(key, code = null) {
    const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    const keySpec = { key, code: code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), windowsVirtualKeyCode: keyCode };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keySpec });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keySpec });
    await new Promise(r => setTimeout(r, 40));
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

async function launchChromeSession() {
  assert.ok(fs.existsSync(CHROME_BIN), `Chrome binary must exist at ${CHROME_BIN}`);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg60-chrome-e2e-'));
  const proc = spawn(CHROME_BIN, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let port = null;
  let stderrBuf = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome failed to emit DevTools port. stderr:\n${stderrBuf}`)), 15000);
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = stderrBuf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        port = Number(m[1]);
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early with code ${code}. stderr:\n${stderrBuf}`));
    });
  });

  const targetsResp = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await targetsResp.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  assert.ok(pageTarget, 'Chrome must expose a page CDP target');

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  const uncaughtExceptions = [];
  const consoleErrors = [];
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  cdp.on('Runtime.exceptionThrown', (params) => {
    const d = params.exceptionDetails || {};
    uncaughtExceptions.push(d.exception?.description || d.text || JSON.stringify(d));
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const txt = (params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      consoleErrors.push(txt);
    }
  });

  const loadPromise = new Promise((resolve) => {
    cdp.on('Page.loadEventFired', () => resolve());
  });
  await cdp.send('Page.navigate', { url: FILE_URL });
  await loadPromise;
  await cdp.waitFor('Boolean(window.BG60 && document.getElementById("introMetaBtn"))', { label: 'BG60 boot & intro modal' });

  const cleanup = async () => {
    cdp.close();
    try { proc.kill('SIGKILL'); } catch {}
    await new Promise(r => setTimeout(r, 150));
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };

  return { cdp, uncaughtExceptions, consoleErrors, cleanup };
}

test('Real Headless Chrome E2E: 6 interactive DOM scenarios with 0 uncaught JS errors', async () => {
  const session = await launchChromeSession();
  const { cdp, uncaughtExceptions, consoleErrors, cleanup } = session;

  try {
    // =========================================================================
    // SCENARIO 1: Pre-run Meta Legacy config (4-pt budget) & Starter Skill Pick
    // =========================================================================
    await cdp.clickSelector('#introMetaBtn');
    await cdp.waitFor('window.BG60.game.activeModal?.type === "meta_legacy"', { label: 'meta_legacy modal open' });

    const budgetBefore = await cdp.eval('window.BG60.getMetaLoadoutBudget()');
    assert.equal(budgetBefore.auxPoints, 4, 'Default 0-unlock loadout must start at 4/4 aux pts');
    assert.equal(budgetBefore.maxAuxPoints, 4);

    // Real click on an active 2-pt aux legacy (aux_shop_first_refresh) to toggle it OFF -> budget drops to 2/4
    await cdp.clickSelector('[data-meta-action="toggle_aux"][data-meta-id="aux_shop_first_refresh"]');
    const budgetAfterOff = await cdp.eval('window.BG60.getMetaLoadoutBudget()');
    assert.equal(budgetAfterOff.auxPoints, 2, 'Toggling off 2-pt aux must drop budget to 2/4');

    // Real click again to toggle it back ON -> budget returns to 4/4 and over-budget unlocked aux cannot exceed 4
    await cdp.clickSelector('[data-meta-action="toggle_aux"][data-meta-id="aux_shop_first_refresh"]');
    const budgetAfterOn = await cdp.eval('window.BG60.getMetaLoadoutBudget()');
    assert.equal(budgetAfterOn.auxPoints, 4, 'Toggling back on must restore 4/4 budget');

    // Verify 4-pt cap in UI: unlock a 1-pt aux (aux_salvage_craft) and verify its button is disabled while at 4/4 pts
    const auxCapCheck = await cdp.eval(`(() => {
      const sv = window.BG60.getMetaSave();
      sv.legacyShards = 500;
      window.BG60.saveMetaSave(sv);
      window.BG60.unlockMetaItem('aux', 'aux_salvage_craft');
      window.BG60.renderMetaLegacyModal(window.BG60.game.activeModal);
      const btn = document.querySelector('[data-meta-action="toggle_aux"][data-meta-id="aux_salvage_craft"]');
      return { exists: !!btn, disabled: !!btn?.disabled, pts: window.BG60.getMetaLoadoutBudget().auxPoints };
    })()`);
    assert.equal(auxCapCheck.exists, true);
    assert.equal(auxCapCheck.disabled, true, 'At 4/4 pts, additional unlocked aux button must be disabled by 4-pt budget');
    assert.equal(auxCapCheck.pts, 4);

    // Confirm pre-run config & enter game -> starter skill 3-choice modal opens!
    await cdp.clickSelector('#metaConfirmPreBtn');
    await cdp.waitFor('document.querySelectorAll("#modalChoices .choice-card").length > 0 && window.BG60.game.activeModal?.type === "starter"', { label: 'starter skill choices' });

    // Real click first starter skill card
    await cdp.clickSelector('#modalChoices .choice-card', { index: 0 });
    const afterStarter = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      backdropHidden: document.getElementById('modalBackdrop').hidden,
      locked: window.BG60.game.metaRunLocked,
      learnedCount: Object.values(window.BG60.game.hero.skills).filter(v => v > 0).length
    })`);
    assert.equal(afterStarter.modal, null, 'Starter modal must close after real click');
    assert.equal(afterStarter.backdropHidden, true);
    assert.equal(afterStarter.locked, true, 'Meta loadout must lock on run start');
    assert.equal(afterStarter.learnedCount, 1, 'Exactly 1 starter active skill must be learned');

    // =========================================================================
    // SCENARIO 2: Real Shop Direct Buy (W1), Bag Cap Reject (BUG-03),
    //             and W29 Timed Final Prep Confirmation Modal (BUG-08)
    // =========================================================================
    const w1ShopInfo = await cdp.eval(`(() => {
      window.BG60.loadTestPreset({ wave: 1, tier: 'standard', build: 'fire', gold: 600, seed: 9201 });
      const idx = window.BG60.game.shop.findIndex(it => it && !it.bought && (it.itemType === 'gear' || it.itemType === 'pill'));
      return { idx, cost: window.BG60.game.shop[idx].cost, goldBefore: window.BG60.game.gold };
    })()`);
    assert.ok(w1ShopInfo.idx >= 0, 'W1 shop must contain an affordable gear or pill card');

    // Real click on normal-wave shop button -> buys directly, NO confirmation modal!
    await cdp.clickSelector(`#shopSec .shop-card[data-shop-idx="${w1ShopInfo.idx}"]`);
    const afterDirectBuy = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      draft: window.BG60.game.shopConfirmDraft,
      gold: window.BG60.game.gold,
      bought: window.BG60.game.shop[${w1ShopInfo.idx}].bought
    })`);
    assert.equal(afterDirectBuy.modal, null, 'Normal W1 shop click must buy directly without confirm modal');
    assert.equal(afterDirectBuy.draft, null);
    assert.equal(afterDirectBuy.bought, true);
    assert.equal(afterDirectBuy.gold, w1ShopInfo.goldBefore - w1ShopInfo.cost);

    // Fill bag to capacity (12/12) and click a real shop gear button -> rejected, 0 gold deducted!
    const fullBagShop = await cdp.eval(`(() => {
      const cap = window.BG60.getBagCapacity();
      while (window.BG60.game.bag.length < cap) {
        window.BG60.game.bag.push(window.BG60.createGearInstance('flame_fan', { wave: 1, slotsCount: 1 }));
      }
      window.BG60.rollShop(true);
      const gearIdx = window.BG60.game.shop.findIndex(it => it && !it.bought && it.itemType === 'gear');
      return { cap, gearIdx, goldBefore: window.BG60.game.gold, bagLen: window.BG60.game.bag.length };
    })()`);
    assert.ok(fullBagShop.gearIdx >= 0);
    await cdp.clickSelector(`#shopSec .shop-card[data-shop-idx="${fullBagShop.gearIdx}"]`);
    const afterFullBagClick = await cdp.eval(`({
      bagLen: window.BG60.game.bag.length,
      gold: window.BG60.game.gold,
      bought: window.BG60.game.shop[${fullBagShop.gearIdx}].bought
    })`);
    assert.equal(afterFullBagClick.bagLen, fullBagShop.cap, 'Bag must stay strictly at cap');
    assert.equal(afterFullBagClick.gold, fullBagShop.goldBefore, 'Full bag gear buy must deduct 0 gold');
    assert.equal(afterFullBagClick.bought, false, 'Full bag gear item must remain unbought');

    // Enter W29 timed final prep (90s) with controlled monotonic clock
    const w29ShopSetup = await cdp.eval(`(() => {
      window.__e2eNowMs = 10000;
      window.BG60.setMonotonicClockForTest(() => window.__e2eNowMs);
      window.BG60.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 900, seed: 9202 });
      window.BG60.startWave();
      window.BG60.completeWaveClear();
      while (window.BG60.game.activeModal) window.BG60.closeModal();
      window.BG60.syncW29FinalPrepStart();
      const idxA = window.BG60.game.shop.findIndex(it => it && !it.bought && (it.itemType === 'gear' || it.itemType === 'pill'));
      return {
        active: window.BG60.game.finalPrep.active,
        started: window.BG60.game.finalPrep.started,
        idxA,
        costA: window.BG60.game.shop[idxA].cost,
        goldBefore: window.BG60.game.gold
      };
    })()`);
    assert.equal(w29ShopSetup.active, true);
    assert.equal(w29ShopSetup.started, true);
    assert.ok(w29ShopSetup.idxA >= 0);

    // Real click shop card in W29 -> opens confirmation modal (#shopConfirmBuyBtn / #shopConfirmCancelBtn), 0 gold deducted yet!
    await cdp.clickSelector(`#shopSec .shop-card[data-shop-idx="${w29ShopSetup.idxA}"]`);
    await cdp.waitFor('Boolean(document.getElementById("shopConfirmBuyBtn") && document.getElementById("shopConfirmCancelBtn"))', { label: 'W29 shop confirm buttons' });
    const midConfirm = await cdp.eval('({ gold: window.BG60.game.gold, draft: !!window.BG60.game.shopConfirmDraft, modal: window.BG60.game.activeModal?.type })');
    assert.equal(midConfirm.modal, 'shop_confirm');
    assert.equal(midConfirm.draft, true);
    assert.equal(midConfirm.gold, w29ShopSetup.goldBefore, 'Opening W29 shop confirm must not deduct gold yet');

    // Real click #shopConfirmCancelBtn -> cancels cleanly with 0 gold deducted
    await cdp.clickSelector('#shopConfirmCancelBtn');
    const afterCancel = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      draft: window.BG60.game.shopConfirmDraft,
      gold: window.BG60.game.gold,
      bought: window.BG60.game.shop[${w29ShopSetup.idxA}].bought
    })`);
    assert.equal(afterCancel.modal, null);
    assert.equal(afterCancel.draft, null);
    assert.equal(afterCancel.gold, w29ShopSetup.goldBefore);
    assert.equal(afterCancel.bought, false);

    // Real click shop card again -> real click #shopConfirmBuyBtn -> purchase succeeds!
    await cdp.clickSelector(`#shopSec .shop-card[data-shop-idx="${w29ShopSetup.idxA}"]`);
    await cdp.waitFor('Boolean(document.getElementById("shopConfirmBuyBtn"))', { label: 'W29 shop confirm buy btn' });
    await cdp.clickSelector('#shopConfirmBuyBtn');
    const afterConfirmBuy = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      draft: window.BG60.game.shopConfirmDraft,
      gold: window.BG60.game.gold,
      bought: window.BG60.game.shop[${w29ShopSetup.idxA}].bought
    })`);
    assert.equal(afterConfirmBuy.modal, null);
    assert.equal(afterConfirmBuy.draft, null);
    assert.equal(afterConfirmBuy.bought, true);
    assert.equal(afterConfirmBuy.gold, w29ShopSetup.goldBefore - w29ShopSetup.costA);

    // Leave another W29 shop confirm modal open and let real rAF loop expire the 90s timer -> 0 deduction & enters W30!
    const w29Second = await cdp.eval(`(() => {
      const idxB = window.BG60.game.shop.findIndex((it, i) => {
        const btn = document.querySelector('#shopSec .shop-card[data-shop-idx="' + i + '"]');
        return it && !it.bought && btn && !btn.disabled;
      });
      return { idxB, goldBefore: window.BG60.game.gold };
    })()`);
    assert.ok(w29Second.idxB >= 0, 'Must have a second affordable W29 shop item');
    await cdp.clickSelector(`#shopSec .shop-card[data-shop-idx="${w29Second.idxB}"]`);
    await cdp.waitFor('Boolean(document.getElementById("shopConfirmBuyBtn"))', { label: 'second W29 confirm modal' });

    await cdp.eval('window.__e2eNowMs += 91000;');
    await cdp.waitFor('window.BG60.game.wave === 30 && window.BG60.game.phase === "wave"', { label: 'W29 timeout transition to W30' });
    const afterW29Timeout = await cdp.eval(`(() => {
      const btn = document.getElementById('shopConfirmBuyBtn');
      const r = btn ? btn.getBoundingClientRect() : null;
      return {
        draft: window.BG60.game.shopConfirmDraft,
        activeModal: window.BG60.game.activeModal,
        backdropHidden: document.getElementById('modalBackdrop').hidden,
        gold: window.BG60.game.gold,
        buyBtnVisible: !!(r && r.width > 0 && r.height > 0)
      };
    })()`);
    assert.equal(afterW29Timeout.draft, null, 'W29 timeout must clear uncommitted shop draft');
    assert.equal(afterW29Timeout.activeModal, null, 'W29 timeout must clear activeModal');
    assert.equal(afterW29Timeout.backdropHidden, true, 'W29 timeout must hide modalBackdrop');
    assert.equal(afterW29Timeout.buyBtnVisible, false, 'W29 timeout must hide shop confirm button');
    assert.equal(afterW29Timeout.gold, w29Second.goldBefore, 'W29 timeout with open confirm modal must deduct 0 gold');

    // =========================================================================
    // SCENARIO 3: Real Equip/Unequip +HP Gear via Inspector DOM (BUG-02 & BUG-03)
    // =========================================================================
    const equipSetup = await cdp.eval(`(() => {
      window.BG60.setMonotonicClockForTest(null);
      window.BG60.loadTestPreset({ wave: 6, tier: 'standard', build: 'frost', gold: 200, seed: 9203 });
      window.BG60.game.bag = [];
      while (window.BG60.game.hero.gear.length > 0) window.BG60.unequipGear(0);
      window.BG60.game.bag = [];
      const hpKey = Object.keys(window.BG60.GEARS).find(k => (window.BG60.GEARS[k].mod?.flatHp || 0) > 0 || (window.BG60.GEARS[k].mod?.hpPct || 0) > 0);
      const hpGear = window.BG60.createGearInstance(hpKey, { sourceStage: 2, slotsCount: 1, affixes: ['frost_ward'] });
      window.BG60.game.bag.push(hpGear);
      window.BG60.game.hero.hp = 60;
      window.BG60.game.inspTarget = null;
      return { hpKey, baseMaxHp: window.BG60.game.hero.maxHp, hp: window.BG60.game.hero.hp };
    })()`);
    assert.ok(equipSetup.hpKey, 'Must find a +HP gear base key');

    // Open inspector via real keyboard press 'c'
    await cdp.pressKey('c', 'KeyC');
    await cdp.waitFor('document.getElementById("inspector") && !document.getElementById("inspector").hidden && document.querySelectorAll("#inspActions button").length > 0', { label: 'Inspector open via [C]' });

    // Real click "穿戴" button in #inspActions
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('#inspActions button'));
      const b = btns.find(x => x.textContent.trim() === '穿戴');
      if (b) b.dataset.e2eTarget = 'equip_hp';
    })()`);
    await cdp.clickSelector('[data-e2e-target="equip_hp"]');
    const afterEquip1 = await cdp.eval('({ hp: window.BG60.game.hero.hp, maxHp: window.BG60.game.hero.maxHp, gearLen: window.BG60.game.hero.gear.length })');
    assert.equal(afterEquip1.gearLen, 1);
    assert.ok(afterEquip1.maxHp > equipSetup.baseMaxHp, 'Equipping +HP gear must raise maxHp');
    assert.equal(afterEquip1.hp, 60, 'Real DOM equip of +HP gear must grant strictly 0 free HP');

    // Real click "卸回背包" button in #inspGearFx
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('#inspGearFx button'));
      const b = btns.find(x => x.textContent.includes('卸回背包'));
      if (b) b.dataset.e2eTarget = 'unequip_hp';
    })()`);
    await cdp.clickSelector('[data-e2e-target="unequip_hp"]');
    const afterUnequip1 = await cdp.eval('({ hp: window.BG60.game.hero.hp, maxHp: window.BG60.game.hero.maxHp, gearLen: window.BG60.game.hero.gear.length })');
    assert.equal(afterUnequip1.gearLen, 0);
    assert.equal(afterUnequip1.maxHp, equipSetup.baseMaxHp);
    assert.equal(afterUnequip1.hp, 60, 'Real DOM unequip must keep HP strictly at 60');

    // Equip again via real click, fill bag to 12/12, and click "卸回背包" -> must be rejected!
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('#inspActions button'));
      const b = btns.find(x => x.textContent.trim() === '穿戴');
      if (b) b.dataset.e2eTarget = 'equip_hp_2';
    })()`);
    await cdp.clickSelector('[data-e2e-target="equip_hp_2"]');
    const afterEquip2 = await cdp.eval(`(() => {
      const cap = window.BG60.getBagCapacity();
      while (window.BG60.game.bag.length < cap) {
        window.BG60.game.bag.push(window.BG60.createGearInstance('frost_mirror', { wave: 6, slotsCount: 1 }));
      }
      return { hp: window.BG60.game.hero.hp, cap };
    })()`);
    assert.equal(afterEquip2.hp, 60, 'Second real DOM equip must still grant strictly 0 free HP');

    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('#inspGearFx button'));
      const b = btns.find(x => x.textContent.includes('卸回背包'));
      if (b) b.dataset.e2eTarget = 'unequip_full_bag';
    })()`);
    await cdp.clickSelector('[data-e2e-target="unequip_full_bag"]');
    const afterFullUnequip = await cdp.eval('({ gearLen: window.BG60.game.hero.gear.length, bagLen: window.BG60.game.bag.length })');
    assert.equal(afterFullUnequip.gearLen, 1, 'Unequipping with full bag via real click must be rejected');
    assert.equal(afterFullUnequip.bagLen, afterEquip2.cap, 'Bag must stay at exact capacity');

    // =========================================================================
    // SCENARIO 4: Level-Up 3-Choice Real Click & Rapid Double-Click Idempotency (BUG-10)
    // =========================================================================
    const lvlSetup = await cdp.eval(`(() => {
      window.BG60.startNewRun(9204, false);
      window.BG60.game.hero.skills = { firewave: 1 };
      window.BG60.game.hero.lv = 1;
      window.BG60.game.hero.xp = 0;
      window.BG60.gainHeroXp(window.BG60.game.hero.xpNext);
      const m = window.BG60.game.activeModal;
      const firstKey = m?.choices?.[0] || null;
      const lvBefore = firstKey ? (window.BG60.game.hero.skills[firstKey] || 0) : -1;
      const totalBefore = Object.values(window.BG60.game.hero.skills).reduce((s, v) => s + v, 0);
      return { modalType: m?.type, choiceCount: m?.choices?.length || 0, firstKey, lvBefore, totalBefore };
    })()`);
    assert.equal(lvlSetup.modalType, 'levelup');
    assert.ok(lvlSetup.choiceCount >= 1 && lvlSetup.firstKey);

    // Real rapid double-click on first #modalChoices .choice-card
    await cdp.clickSelector('#modalChoices .choice-card', { index: 0, clickCount: 2 });
    const afterLvlPick = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      skillLv: window.BG60.game.hero.skills[${JSON.stringify(lvlSetup.firstKey)}] || 0,
      totalAfter: Object.values(window.BG60.game.hero.skills).reduce((s, v) => s + v, 0),
      secondCall: window.BG60.pickHeroSkill(${JSON.stringify(lvlSetup.firstKey)})
    })`);
    assert.equal(afterLvlPick.modal, null);
    assert.equal(afterLvlPick.skillLv, lvlSetup.lvBefore + 1, 'Clicked skill must upgrade by strictly +1 even on double-click');
    assert.equal(afterLvlPick.totalAfter, lvlSetup.totalBefore + 1, 'Total skill levels must increase by strictly +1');
    assert.equal(afterLvlPick.secondCall, false, 'Follow-up duplicate pickHeroSkill call must be rejected');

    // =========================================================================
    // SCENARIO 5: W29 Timeout Auto-Claims XP Pill -> Preserves Level-Up Modal in W30 (BUG-04 & BUG-01)
    // =========================================================================
    const w29XpSetup = await cdp.eval(`(() => {
      window.__e2eNowMs = 50000;
      window.BG60.setMonotonicClockForTest(() => window.__e2eNowMs);
      window.BG60.loadTestPreset({ wave: 29, tier: 'strong', build: 'fire', gold: 700, seed: 9205 });
      window.BG60.startWave();
      window.BG60.completeWaveClear();
      while (window.BG60.game.activeModal) window.BG60.closeModal();
      window.BG60.syncW29FinalPrepStart();
      // Place hero 1 XP away from even level 22 and create a pending Destiny offer with 3 XP pills
      window.BG60.game.hero.lv = 21;
      window.BG60.game.hero.xpNext = window.BG60.xpForLevel(21);
      window.BG60.game.hero.xp = window.BG60.game.hero.xpNext - 1;
      window.BG60.game.hero.skills = { firewave: 3, blades: 2, berserk: 1 };
      window.BG60.game.destiny.pendingOffer = {
        offerId: 'dg_e2e_xp_pill',
        bet: 120,
        wave: 30,
        claimed: false,
        claimedChoiceIndex: null,
        claimedAtWave: null,
        choices: [0, 1, 2].map(i => ({
          choiceIndex: i,
          category: 'pill',
          pillKey: 'legend_ascend',
          rarity: 'legend',
          name: '太虚飞升丹',
          icon: '💊',
          desc: '直升 1 级'
        }))
      };
      return { lvBefore: window.BG60.game.hero.lv, active: window.BG60.game.finalPrep.active };
    })()`);
    assert.equal(w29XpSetup.active, true);

    // Advance monotonic clock past 90s -> real rAF loop triggers W29 timeout -> enters W30 with levelup modal preserved!
    await cdp.eval('window.__e2eNowMs += 91000;');
    await cdp.waitFor('window.BG60.game.wave === 30 && window.BG60.game.phase === "wave" && window.BG60.game.activeModal?.type === "levelup"', { label: 'W30 preserved levelup modal' });

    const preservedDom = await cdp.eval(`({
      lvAfter: window.BG60.game.hero.lv,
      backdropHidden: document.getElementById('modalBackdrop').hidden,
      cardCount: document.querySelectorAll('#modalChoices .choice-card').length,
      firstChoice: window.BG60.game.activeModal.choices[0],
      firstLvBefore: window.BG60.game.hero.skills[window.BG60.game.activeModal.choices[0]] || 0
    })`);
    assert.ok(preservedDom.lvAfter >= 22, 'Auto-claimed XP pill must level hero up');
    assert.equal(preservedDom.backdropHidden, false, 'Preserved level-up modal must remain visible in real DOM');
    assert.ok(preservedDom.cardCount >= 1, 'Level-up #modalChoices .choice-card must be rendered in real DOM');

    // Real click the preserved level-up card in W30!
    await cdp.clickSelector('#modalChoices .choice-card', { index: 0 });
    const afterW30LevelPick = await cdp.eval(`({
      modal: window.BG60.game.activeModal,
      newLv: window.BG60.game.hero.skills[${JSON.stringify(preservedDom.firstChoice)}] || 0
    })`);
    assert.equal(afterW30LevelPick.modal, null);
    assert.equal(afterW30LevelPick.newLv, preservedDom.firstLvBefore + 1, 'Preserved W30 level-up card must work via real click');

    // =========================================================================
    // SCENARIO 6: Real Browser localStorage.setItem QuotaExceededError Settlement (BUG-05)
    // =========================================================================
    const quotaSetup = await cdp.eval(`(() => {
      window.BG60.setMonotonicClockForTest(null);
      window.localStorage.removeItem('border_guard_v060_meta_v1');
      window.BG60.resetMetaSave();
      window.BG60.loadTestPreset({ wave: 12, tier: 'standard', build: 'fire', seed: 9206 });
      window.BG60.game.stats.bossKills = 2;
      const runId = window.BG60.game.runId;
      // Patch real Storage.prototype.setItem to throw QuotaExceededError
      window.__origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function() {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      };
      window.BG60.finishGame(false);
      return {
        runId,
        modalHtml: document.getElementById('modalBox').innerHTML,
        hasRetryBtn: Boolean(document.getElementById('endRetrySaveBtn')),
        hasExportBtn: Boolean(document.getElementById('endExportBackupBtn')),
        settle: window.BG60.game.metaSettlement
      };
    })()`);
    assert.equal(quotaSetup.hasRetryBtn, true, 'Settlement DOM must display #endRetrySaveBtn on QuotaExceededError');
    assert.equal(quotaSetup.hasExportBtn, true, 'Settlement DOM must display #endExportBackupBtn on QuotaExceededError');
    assert.ok(quotaSetup.modalHtml.includes('本地存档写入失败'), 'Settlement DOM must show explicit storage failure warning');
    assert.equal(quotaSetup.settle.saveStatus, 'failed');

    // Restore Storage.prototype.setItem and REAL CLICK #endRetrySaveBtn!
    await cdp.eval('Storage.prototype.setItem = window.__origSetItem;');
    await cdp.clickSelector('#endRetrySaveBtn');

    const afterRetry = await cdp.eval(`(() => {
      const raw = window.localStorage.getItem('border_guard_v060_meta_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        persisted: !!parsed,
        shards: parsed?.legacyShards || 0,
        hasRunId: Array.isArray(parsed?.settledRunIds) && parsed.settledRunIds.includes(${JSON.stringify(quotaSetup.runId)}),
        hasRetryBtn: Boolean(document.getElementById('endRetrySaveBtn')),
        modalText: document.getElementById('modalBox').textContent
      };
    })()`);
    assert.equal(afterRetry.persisted, true, 'Retry save must persist JSON into real browser localStorage');
    assert.ok(afterRetry.shards > 0, `Persisted legacyShards must be > 0, got ${afterRetry.shards}`);
    assert.equal(afterRetry.hasRunId, true, 'Persisted save must contain settled runId');
    assert.equal(afterRetry.hasRetryBtn, false, '#endRetrySaveBtn must disappear after retry save succeeds');
    assert.equal(afterRetry.modalText.includes('本地存档写入失败'), false, 'Failure warning must disappear after retry save succeeds');

    // =========================================================================
    // ZERO RUNTIME JS ERRORS ACROSS ENTIRE E2E SESSION
    // =========================================================================
    assert.deepEqual(uncaughtExceptions, [], `Uncaught JS exceptions detected: ${JSON.stringify(uncaughtExceptions)}`);
    assert.deepEqual(consoleErrors, [], `console.error entries detected: ${JSON.stringify(consoleErrors)}`);
  } finally {
    await cleanup();
  }
});
