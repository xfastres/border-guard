'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveChromeBin, toFileUrl } = require('../helpers/chrome-bin.cjs');

const root = path.resolve(__dirname, '../..');
const originalHtml = path.join(root, 'Border-Guard-v0.60.html');
const modularHtml = path.resolve(root, process.env.BG_MODULAR_HTML || 'release/Border-Guard-v0.60-modular-preview.html');

async function withTimeout(promise, label, ms = 10000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function openGame(t, chromeBin, html, label) {
  const userDir = mkdtempSync(path.join(tmpdir(), `bg60-parity-${label}-`));
  const chrome = spawn(chromeBin, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=1440,900', '--remote-debugging-port=0',
    `--user-data-dir=${userDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise(resolve => {
    chrome.once('exit', (code, signal) => resolve(`exit code ${code}, signal ${signal}`));
    chrome.once('error', error => resolve(error.message));
  });

  let socket;
  t.after(async () => {
    try {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 0, method: 'Browser.close' }));
      } else {
        chrome.kill();
      }
      await withTimeout(exited, `${label} Chrome to close`, 5000);
    } finally {
      socket?.close();
      if (chrome.exitCode === null && chrome.signalCode === null && chrome.kill()) {
        await withTimeout(exited, `${label} Chrome to terminate`, 5000);
      }
      rmSync(userDir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  const ready = Promise.withResolvers();
  let stderr = '';
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', chunk => {
    stderr += chunk;
    const endpoint = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (endpoint) ready.resolve(endpoint[1]);
  });
  const port = await withTimeout(Promise.race([
    ready.promise,
    exited.then(reason => { throw new Error(`${label} Chrome exited during startup (${reason})\n${stderr}`); }),
  ]), `${label} Chrome DevTools port`);
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `${label} Chrome /json/list returned ${response.status}`);
  const target = (await response.json()).find(entry => entry.type === 'page' && entry.webSocketDebuggerUrl);
  assert.ok(target, `${label} Chrome has no CDP page target`);

  socket = new WebSocket(target.webSocketDebuggerUrl);
  const connected = Promise.withResolvers();
  const loaded = Promise.withResolvers();
  const pending = new Map();
  const exceptions = [];
  const consoleErrors = [];
  let nextId = 1;

  socket.addEventListener('open', connected.resolve, { once: true });
  const failConnection = event => {
    const error = new Error(`${label} CDP WebSocket ${event.type}: ${event.message || event.reason || event.code || target.webSocketDebuggerUrl}`);
    connected.reject(error);
    for (const command of pending.values()) command.reject(error);
  };
  socket.addEventListener('close', failConnection);
  socket.addEventListener('error', failConnection);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const command = pending.get(message.id);
    if (command) {
      if (message.error) command.reject(new Error(`${label} CDP error: ${message.error.message}`));
      else command.resolve(message.result);
    } else if (message.method === 'Page.loadEventFired') {
      loaded.resolve();
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      exceptions.push(details.exception?.description || details.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    }
  });

  async function send(method, params = {}) {
    const id = nextId++;
    const command = Promise.withResolvers();
    pending.set(id, command);
    try {
      socket.send(JSON.stringify({ id, method, params }));
      return await withTimeout(command.promise, `${label} CDP ${method}`);
    } finally {
      pending.delete(id);
    }
  }

  await withTimeout(connected.promise, `${label} CDP WebSocket connection`);
  await send('Runtime.enable');
  await send('Page.enable');
  const navigation = await send('Page.navigate', { url: toFileUrl(html) });
  assert.equal(navigation.errorText, undefined, `${label} could not load ${html}`);
  await withTimeout(loaded.promise, `${label} page to load`);

  return {
    exceptions,
    consoleErrors,
    async snapshot(seed) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression: `(${collectSnapshot.toString()})(${seed})`,
        returnByValue: true,
      });
      assert.equal(exceptionDetails, undefined,
        `${label} seed ${seed}: ${exceptionDetails?.exception?.description || exceptionDetails?.text || 'snapshot error'}`);
      assert.equal(typeof result.value, 'object', `${label} seed ${seed}: snapshot missing`);
      return result.value;
    },
  };
}

function collectSnapshot(seed) {
  const api = window.BG60;
  if (!api) throw new Error('BG60 did not boot');
  const apiKeys = Object.keys(api).sort();
  const aliasMatches = window.BG52 === api;

  api.startNewRun(seed, false);
  const { wave, gold, materials, transferTokens, hero, bossIntel, wavePlan, shop } = api.game;
  const { hp, maxHp, lv, xpNext } = hero;
  const initial = structuredClone({
    wave, gold, materials, transferTokens, hero: { hp, maxHp, lv, xpNext }, bossIntel, wavePlan, shop,
  });
  const queues = Object.fromEntries([1, 5, 10, 15, 20, 25, 30].map(wave => [wave, api.buildWaveQueue(wave)]));
  const equipment = api.BASE_GEAR_KEYS.slice(0, 10).map((baseKey, index) => {
    const gear = api.createGearInstance(baseKey, { wave: [1, 15, 29][index % 3] });
    const synergies = api.evaluateItemSynergies(gear);
    api.rollShop(true);
    return { gear, synergies, shop: api.game.shop };
  });

  let w20;
  let destiny;
  let affixTransfer;
  const presets = {};
  const rewards = [1, 2, 3, 4].map(wave => api.calculateRunShardRewards(false, { wave }));
  for (const [wave, build] of [[10, 'fire'], [20, 'frost'], [29, 'fire'], [30, 'frost']]) {
    const preset = api.loadTestPreset({ wave, tier: 'standard', build, seed });
    if (!preset.ok) throw new Error(`W${wave} preset failed`);
    const { xpNext } = api.game.hero;
    presets[wave] = structuredClone({
      preset, xpNext, shop: api.game.shop, wavePlan: api.game.wavePlan,
      stats: api.getHeroStats(), sets: api.getActiveGearSets(),
      synergies: api.recomputeEquipmentSynergies(), dualResonances: api.getActiveDualResonances(),
      omen: api.getEndgameOmenState(), finalPrep: api.getFinalPrepState(), w30Battle: api.getW30BattleState(),
    });
    rewards.push(api.calculateRunShardRewards(false));

    if (wave === 20) {
      const open = api.isW20PreselectOpen();
      const recommended = api.getRecommendedW20Direction();
      const preselect = api.selectW20PreselectDirection(recommended);
      if (!open || !preselect.ok || !api.startWave()) throw new Error('W20 preselection failed');
      const locked = { ...api.game.w20State };
      api.completeWaveClear();
      const firstDraft = structuredClone(api.game.w20Draft);
      if (!firstDraft?.candidates.length) throw new Error('W20 initial group missing');
      const rerolled = api.rerollW20Enhancements();
      if (!rerolled.ok) throw new Error(`W20 reroll failed: ${rerolled.reason}`);
      const firstGroup = firstDraft.candidates.map(key => api.W20_ENHANCEMENTS[key]);
      w20 = { preselect, recommended, locked, firstDraft, firstGroup, rerolled, draft: api.game.w20Draft };
    }

    if (wave === 29) {
      // Force the winning branch while using the seed's normal RNG for candidate generation.
      destiny = api.rollDestinyGamble(120, { forceOutcome: 'win', silent: true });
      if (!destiny.ok || destiny.pendingOffer?.choices.length !== 3) throw new Error('Destiny candidates missing');

      const source = { location: 'equipped', idx: 0 };
      const target = { location: 'equipped', idx: 1 };
      const params = { source, sourceSlot: 0, target, targetSlot: 0 };
      const validation = api.validateAffixTransfer(params);
      const preview = api.previewAffixTransfer(params);
      if (!validation.ok || !preview.canCommit) throw new Error(`Valid affix transfer rejected: ${validation.reason}`);
      const invalidParams = { ...params, target: source };
      const invalid = api.validateAffixTransfer(invalidParams);
      const invalidPreview = api.previewAffixTransfer(invalidParams);
      if (invalid.ok || invalidPreview.canCommit) throw new Error('Same-gear affix transfer accepted');
      affixTransfer = { validation, preview, invalid, invalidPreview };
    }
  }
  const victory = api.calculateRunShardRewards(true, { ...api.game, stats: { bossKills: 5 } });
  const { storageKey, schemaVersion, budget } = api.getMetaConfig();
  const meta = { storageKey, schemaVersion, budget, loadoutBudget: api.getMetaLoadoutBudget(), rewards, victory };

  const snapshot = { apiKeys, aliasMatches, initial, queues, equipment, presets, w20, destiny, affixTransfer, meta };
  // UID values identify instances within one session. Keep all other fields in order.
  return JSON.parse(JSON.stringify(snapshot, (key, value) => key === 'uid' && typeof value === 'string' ? undefined : value));
}

test('original and modular v0.60 match in Chrome for seeds 2026 and 1337', { timeout: 60000 }, async t => {
  assert.ok(statSync(originalHtml, { throwIfNoEntry: false })?.isFile(), `Original baseline missing: ${originalHtml}`);
  assert.ok(statSync(modularHtml, { throwIfNoEntry: false })?.isFile(), `Modular HTML missing: ${modularHtml}. Run npm run build.`);
  const chromeBin = resolveChromeBin();
  const original = await openGame(t, chromeBin, originalHtml, 'original');
  const modular = await openGame(t, chromeBin, modularHtml, 'modular');

  for (const seed of [2026, 1337]) {
    const expected = await original.snapshot(seed);
    const actual = await modular.snapshot(seed);
    for (const [label, session, snapshot] of [['original', original, expected], ['modular', modular, actual]]) {
      assert.deepEqual(session.exceptions, [], `${label} seed ${seed}: uncaught JS exceptions`);
      assert.deepEqual(session.consoleErrors, [], `${label} seed ${seed}: console.error entries`);
      assert.equal(snapshot.aliasMatches, true, `${label} seed ${seed}: BG52 must alias BG60`);
      assert.equal(snapshot.initial.wave, 1, `${label} seed ${seed}: startNewRun must start at W1`);
      assert.ok(snapshot.initial.shop.length > 0, `${label} seed ${seed}: initial shop is empty`);
      assert.equal(Object.values(snapshot.queues).filter(queue => Array.isArray(queue) && queue.length > 0).length, 7,
        `${label} seed ${seed}: expected seven nonempty wave queues`);
      assert.equal(snapshot.equipment.length, 10, `${label} seed ${seed}: expected 10 equipment rolls`);
      assert.ok(snapshot.meta.rewards.slice(0, 3).every(reward => reward.runShards === 0),
        `${label} seed ${seed}: early defeat must grant zero shards`);
    }
    assert.deepEqual(actual, expected, `Seed ${seed}: modular snapshot differs from the original`);
  }
});
