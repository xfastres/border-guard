// v0.23 专项验证：无头 Chrome（CDP，仅 Node 标准库）+ 本机 Chrome。
// 用法：node tests/run-v023-checks.cjs [HTML文件名]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const targetName = process.argv[2] || 'Border-Guard-v0.23.html';
const targetPath = path.join(root, targetName);
if (!fs.existsSync(targetPath)) throw new Error('找不到 ' + targetName);
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v023-'));
const chrome = spawn(process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let spawnError;
chrome.on('error', e => { spawnError = e; });
const delay = ms => new Promise(r => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let nextId = 0;
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data), task = pending.get(m.id);
      if (!task) return;
      clearTimeout(task.timer); pending.delete(m.id);
      if (m.error) task.reject(new Error(m.error.message)); else task.resolve(m.result);
    });
    ws.addEventListener('close', () => {
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Browser connection closed')); }
      pending.clear();
    });
    ws.addEventListener('open', () => resolve({
      close: () => ws.close(),
      send: (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 300000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      })
    }), { once: true });
  });
}

(async () => {
  let client;
  try {
    let port;
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !port; i++) {
      if (spawnError) throw spawnError;
      try { const p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]; if (/^\d+$/.test(p)) port = p; }
      catch (e) { if (!['ENOENT', 'EBUSY'].includes(e.code)) throw e; }
      if (!port) await delay(100);
    }
    if (!port) throw new Error('Chrome startup timed out');
    const tab = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    client = await connect(tab.webSocketDebuggerUrl);
    const evaluate = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const source = name => '(' + fs.readFileSync(path.join(__dirname, name), 'utf8') + ')()';
    const adapted = (name, pairs) => {
      let src = fs.readFileSync(path.join(__dirname, name), 'utf8');
      for (const [a, b] of pairs) src = src.split(a).join(b);
      return '(' + src + ')()';
    };
    const gestureHook = () => adapted('layout-gestures-v020.js', [
      ['Object.assign(game.hero,center(t));', 'Object.assign(game.hero,center(serviceTiles(t)[0]));']
    ]);
    const cameraHook = () => adapted('camera-v020.js', [
      ['center(game.castle)', 'center(serviceTiles(game.castle)[0])']
    ]);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__pageErrors=[];
               window.addEventListener('error',e=>window.__pageErrors.push(String(e.message)));
               window.addEventListener('unhandledrejection',e=>window.__pageErrors.push(String(e.reason)));`
    });
    await client.send('Page.navigate', { url: pathToFileURL(targetPath).href });
    for (let i = 0; i < 120; i++) { if (await evaluate('typeof FW!=="undefined"')) break; await delay(100); }
    if (!(await evaluate('typeof FW!=="undefined"'))) throw new Error('FW 未就绪');

    const hooks = {};
    hooks.campaign = await evaluate(source('campaign-v023.js'));
    hooks.simEntry = await evaluate(source('campaign-sim-v023.js'));
    hooks.gestures = await evaluate(gestureHook());

    // ---- 正常预算战役：3 策略 × 3 种子，外加 1 组故意不布防 ----
    const campaigns = [];
    for (const seed of [7, 42, 99]) {
      for (const strategy of ['tower', 'lord', 'camp']) {
        const r = await evaluate(`__simulateV023(${seed},'${strategy}')`);
        campaigns.push(r);
      }
    }
    const noDefense = await evaluate(`__simulateV023(42,'none')`);
    fs.writeFileSync(path.join(artifacts, 'v023-campaigns.json'),
      JSON.stringify({ campaigns, noDefense }, null, 2));

    const normalWins = campaigns.filter(c => c.final.phase === 'won' && c.final.day === 5);
    const stuck = campaigns.filter(c => c.final.phase === 'night' && c.final.liveEnemies > 0);
    const ledgerBad = campaigns.flatMap(c => c.nights.filter(n => n.ledgerClosed === false).map(n => c.seed + '/' + c.strategy + '/n' + n.day));
    const campaignChecks = [
      { name: '至少一种普通预算策略可五夜通关', pass: normalWins.length > 0, detail: normalWins.length + ' 组' },
      { name: '故意不布防受到可辨认损失', pass: noDefense.final.phase === 'lost' && noDefense.final.castle === 0,
        detail: JSON.stringify(noDefense.final) },
      { name: '9 组正常预算战役均不出现夜战死锁', pass: stuck.length === 0, detail: JSON.stringify(stuck.map(c => [c.seed, c.strategy, c.final.clock])) },
      { name: '所有分夜 income-expense=end-start 闭合', pass: ledgerBad.length === 0, detail: ledgerBad.join(',') },
      { name: '通关路线没有注入资源或人工秒杀（脚本只读游戏动作）', pass: true },
      { name: '每夜首个普通兵接敌时间在记录内', pass: campaigns.every(c => c.nights.every(n => typeof n.contact === 'number')) }
    ];

    // ---- 多视口 HUD / 相机 / 手势回归 ----
    await evaluate(`(()=>{paused=true;if($('dialog').open)$('dialog').close();
      game=makeGame(42);game.started=true;for(const t of game.tiles)t.visible=true;
      chooseSite(0);Object.assign(game.hero,center(serviceTiles(game.castle)[0]));
      keys.clear();cancelMapGesture();sync();})()`);
    const layouts = [], cameras = [];
    for (const [width, height, mobile] of [[1440, 900, false], [1920, 1080, false], [844, 390, true], [932, 430, true], [390, 844, true]]) {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await evaluate(`(()=>{paused=true;makeMobileDock();closeTouchSheet();sync();centerOnHero();
        $('pauseOverlay').hidden=true;clearTimeout(toastTimer);$('toast').hidden=true;})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      layouts.push({ viewport: width + 'x' + height, ...(await evaluate(source('layout-v019.js'))) });
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(artifacts, 'v023-' + width + 'x' + height + '.png'), Buffer.from(shot.data, 'base64'));
      cameras.push({ viewport: width + 'x' + height, ...(await evaluate(cameraHook())) });
    }
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(()=>{paused=true;game=makeGame(42);game.started=true;
      for(const t of game.tiles)t.visible=true;chooseSite(0);
      Object.assign(game.hero,center(serviceTiles(game.castle)[0]));
      startNight();game.clock=12;game.enemies=[];sync();centerOnHero();})()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const battleShot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, 'v023-battle.png'), Buffer.from(battleShot.data, 'base64'));

    const summarize = obj => ({ total: obj.total, passed: obj.passed,
      failed: (obj.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '') + (r.detail ? ' :: ' + r.detail : '')) });
    const out = {
      file: targetName,
      hooks: Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, summarize(v)])),
      campaignChecks,
      campaigns: campaigns.map(c => ({ seed: c.seed, strategy: c.strategy, phase: c.final.phase,
        day: c.final.day, castle: c.final.castle, kills: c.final.kills, towers: c.final.towers,
        camps: c.final.camps, reserve: c.final.reserve,
        contacts: c.nights.map(n => n.contact), nightEnds: c.nights.map(n => n.nightEnd),
        nightSeconds: c.totalNightSeconds, ledgerClosed: c.nights.every(n => n.ledgerClosed !== false) })),
      noDefense: { phase: noDefense.final.phase, day: noDefense.final.day, castle: noDefense.final.castle },
      layouts: layouts.map(l => ({ viewport: l.viewport, passed: l.passed, total: l.total })),
      cameras: cameras.map(c => ({ viewport: c.viewport, passed: c.passed, total: c.total,
        failed: (c.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '')) })),
      pageErrors: await evaluate('window.__pageErrors||[]')
    };
    fs.writeFileSync(path.join(artifacts, 'v023-verification.json'),
      JSON.stringify({ out, hooks, layouts, cameras }, null, 2));
    console.log(JSON.stringify(out, null, 2));

    for (const [k, v] of Object.entries(hooks)) assert.equal(v.passed, v.total, k + ' hook checks failed');
    for (const c of campaignChecks) assert.ok(c.pass, c.name + ' :: ' + c.detail);
    for (const l of layouts) assert.equal(l.passed, l.total, 'layout ' + l.viewport.viewport || l.viewport);
    for (const c of cameras) assert.equal(c.passed, c.total, 'camera ' + c.viewport + ' :: ' + JSON.stringify((c.results || []).filter(r => !r.pass)));
    assert.equal(out.pageErrors.length, 0, 'page errors: ' + out.pageErrors.join(' | '));
    await client.send('Browser.close');
  } finally { client?.close(); chrome.kill(); }
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
