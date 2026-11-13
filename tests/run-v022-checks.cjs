// v0.22 专项验证：无头 Chrome（CDP，仅 Node 标准库）+ 本机 Chrome。
// 用法：node tests/run-v022-checks.cjs [HTML文件名]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const targetName = process.argv[2] || 'Border-Guard-v0.22.html';
const targetPath = path.join(root, targetName);
if (!fs.existsSync(targetPath)) throw new Error('找不到 ' + targetName);
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v022-'));
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
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 90000);
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
    const pageErrors = [];
    const evaluate = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const source = name => '(' + fs.readFileSync(path.join(__dirname, name), 'utf8') + ')()';
    // 旧版坐标/手势/HUD 钩子按新规则适配：城堡中心现在是实体，领主站在服务位
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
    // 手势钩子与旧版一样在横屏触摸视口里跑（底部抽屉/手柄只在该模式存在）
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
    hooks.world = await evaluate(source('world-collision-v022.js'));
    hooks.residents = await evaluate(source('residents-v022.js'));
    hooks.gestures = await evaluate(gestureHook());

    // ---- 多视口：HUD 布局、相机跟随、坐标往返、DPR2、截图 ----
    const layouts = [], cameras = [], nativeGestures = [];
    const touch = (type, p) => client.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: p.x, y: p.y, id: 1 }]
    });
    const nativeSetup = async () => evaluate(`(()=>{
      if($('dialog').open)$('dialog').close();paused=true;game=makeGame(42);game.started=true;keys.clear();cancelMapGesture();
      const t=tileAt(5,4);t.visible=true;chooseSite(0);Object.assign(game.hero,center(serviceTiles(t)[0]));
      closeTouchSheet();makeMobileDock();sync();centerOnHero();$('pauseOverlay').hidden=true;
      clearTimeout(toastTimer);$('toast').hidden=true;
      const node=game.tiles.find(t=>t.owned&&t.node&&YIELD[t.node.kind]);
      const r=screenRectOfTile(node);return {x:r.x+r.w/2,y:r.y+r.h/2};
    })()`);
    for (const [width, height, mobile] of [[1440, 900, false], [1920, 1080, false], [844, 390, true], [932, 430, true], [390, 844, true]]) {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await evaluate(`(()=>{if($('dialog').open)$('dialog').close();paused=true;game.started=true;makeMobileDock();
        closeTouchSheet();sync();$('pauseOverlay').hidden=true;centerOnHero();
        clearTimeout(toastTimer);$('toast').hidden=true;})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      layouts.push({ viewport: width + 'x' + height, ...(await evaluate(source('layout-v019.js'))) });
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(artifacts, 'v022-' + width + 'x' + height + '.png'), Buffer.from(shot.data, 'base64'));
      cameras.push({ viewport: width + 'x' + height, ...(await evaluate(cameraHook())) });
      if (width === 844) {
        let p = await nativeSetup(); await touch('touchStart', p); await touch('touchEnd', p);
        nativeGestures.push({ name: '原生触屏短按移动', pass: await evaluate('!!game.hero.goal?.length&&!game.panel') });
        p = await nativeSetup(); await touch('touchStart', p); await delay(390); await touch('touchEnd', p);
        nativeGestures.push({ name: '原生长按350ms只打开面板', pass: await evaluate('game.panel&&!game.hero.goal') });
        p = await nativeSetup(); await touch('touchStart', p); await delay(390); await touch('touchEnd', p);
        const tx = await evaluate('camera.tx');
        await touch('touchStart', { x: 650, y: 115 });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 450, y: 115, id: 1 }] });
        await touch('touchEnd', { x: 450, y: 115 });
        nativeGestures.push({ name: '原生拖拽只平移地图且关闭抽屉', pass: await evaluate(`!game.panel&&!game.hero.goal&&camera.mode==='manual'&&camera.tx<${tx}-50&&$('board').scrollLeft===0`) });
      }
      if (width === 1440) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
        const dpr = await evaluate(`(()=>{measureCameraViewport();const t=tileAt(8,6);camera.mode='manual';
          camera.tx=-40;camera.ty=25;applyCamera();
          const p=worldToScreen(t.x*CELL+8,t.y*CELL+8),g=screenToGrid(p.x,p.y);
          return {dpr:devicePixelRatio,ok:!!(g&&g.x===8&&g.y===6)};})()`);
        cameras.push({ viewport: '1440x900@2x', passed: dpr.ok && dpr.dpr === 2 ? 1 : 0, total: 1,
          results: [{ name: 'DPR2 不影响 CSS 坐标往返', pass: !!(dpr.ok && dpr.dpr === 2) }] });
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      }
    }
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // ---- 遮挡 / 居民演示截图 ----
    await evaluate(`(()=>{
      paused=true;game=makeGame(42);game.started=true;
      for(const t of game.tiles)t.visible=true;
      const site=tileAt(5,4);chooseSite(0);Object.assign(game.hero,center(serviceTiles(site)[0]));
      game.hero.goal=null;game.residents[0].role='miner';game.residents[1].role='guard';
      game.residents[0].state='waiting';game.residents[1].state='hurt';
      updateResidents(.2);updateResidents(.2);
      game.militia=2;sync();centerOnHero();
    })()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const residentShot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, 'v022-residents.png'), Buffer.from(residentShot.data, 'base64'));

    const summarize = obj => ({ total: obj.total, passed: obj.passed, failed: (obj.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '')) });
    const out = {
      file: targetName,
      hooks: Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, summarize(v)])),
      nativeGestures,
      layouts: layouts.map(l => ({ viewport: l.viewport, passed: l.passed, total: l.total, failed: (l.checks || []).filter(c => !c.pass).map(c => c.name) })),
      cameras: cameras.map(c => ({ viewport: c.viewport, passed: c.passed, total: c.total,
        failed: (c.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '')) })),
      pageErrors: pageErrors.concat(await evaluate('window.__pageErrors||[]'))
    };
    fs.writeFileSync(path.join(artifacts, 'v022-verification.json'),
      JSON.stringify({ out, hooks, layouts, cameras }, null, 2));
    console.log(JSON.stringify(out, null, 2));

    for (const [k, v] of Object.entries(hooks)) assert.equal(v.passed, v.total, k + ' hook checks failed');
    for (const g of nativeGestures) assert.ok(g.pass, g.name);
    for (const l of layouts) assert.equal(l.passed, l.total, 'layout ' + l.viewport);
    for (const c of cameras) assert.equal(c.passed, c.total, 'camera ' + c.viewport + ' :: ' + JSON.stringify((c.results || []).filter(r => !r.pass)));
    assert.equal(out.pageErrors.length, 0, 'page errors: ' + out.pageErrors.join(' | '));
    await client.send('Browser.close');
  } finally { client?.close(); chrome.kill(); }
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
