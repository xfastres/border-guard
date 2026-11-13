// v0.24 集中验收：无头 Chrome（CDP，仅 Node 标准库）+ 本机 Chrome。
// 用法：node tests/run-v024-checks.cjs [HTML文件名]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const targetName = process.argv[2] || 'Border-Guard-v0.24.html';
const targetPath = path.join(root, targetName);
if (!fs.existsSync(targetPath)) throw new Error('找不到 ' + targetName);
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v024-'));
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
    hooks.combat = await evaluate(source('combat-feedback-v024.js'));
    hooks.experience = await evaluate(source('experience-audit-v024.js'));
    hooks.collision = await evaluate(source('world-collision-v022.js'));
    hooks.residents = await evaluate(source('residents-v022.js'));
    hooks.simEntry = await evaluate(source('campaign-sim-v023.js'));
    hooks.gestures = await evaluate(gestureHook());

    // ---- 完整战役回归（正常预算，不注入资源 / 生命 / 不人工秒杀） ----
    const campaigns = [];
    for (const [seed, strategy] of [[7, 'tower'], [42, 'tower'], [99, 'tower'], [42, 'camp'], [42, 'lord']]) {
      campaigns.push(await evaluate(`__simulateV023(${seed},'${strategy}')`));
    }
    const noDefense = await evaluate(`__simulateV023(42,'none')`);
    fs.writeFileSync(path.join(artifacts, 'v024-campaigns.json'), JSON.stringify({ campaigns, noDefense }, null, 2));
    const campaignChecks = [
      { name: 'v0.24 至少一种正常预算策略五夜通关', pass: campaigns.some(c => c.final.phase === 'won' && c.final.day === 5) },
      { name: '不布防仍受到可辨认损失', pass: noDefense.final.phase === 'lost' && noDefense.final.castle === 0 },
      { name: '所有分夜账本闭合', pass: campaigns.every(c => c.nights.every(n => n.ledgerClosed !== false)) },
      { name: '无夜战死锁、无残留活敌', pass: campaigns.every(c => !(c.final.phase === 'night' && c.final.liveEnemies > 0)) },
      { name: '无页面运行时异常', pass: campaigns.every(c => c.final.errs.length === 0) }
    ];

    // ---- 「发出 — 命中 — 死亡」连续帧证据（静态截图不能单独证明打击感） ----
    // 取证统一用桌面视口并收起移动端抽屉，避免地图被面板盖住
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(()=>{
      paused=true;if($('dialog').open)$('dialog').close();
      game=makeGame(42);game.started=true;keys.clear();
      for(const t of game.tiles)t.visible=true;chooseSite(0);
      game.panel=false;manualSheetOpen=false;closeTouchSheet();toggleSettings(false);
      const c=game.castle,t=tileAt(c.x+2,c.y);
      t.ground='grass';t.node=null;t.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
      Object.assign(game.hero,center(serviceTiles(c)[0]));game.hero.goal=null;
      game.phase='night';game.isBoss=false;game.clock=0;game.spawnStopped=true;
      game.militiaCooldown=999;game.combatEvents=[];game.combatEventSeq=0;
      const f=makeFront('home',null,createWavePlan(1,'home',false),[]);
      f.gates=[tileAt(0,4)];game.fronts=[f];calculateRoutes(f,c);
      const e=spawnEnemy(f,{record:queueRecord('normal',1,1,1),gate:0});
      Object.assign(e,{x:t.x+1.1,y:t.y+.5,hp:9,max:9,speed:0,cooldown:99});
      game.enemies=[e];
      centerOnHero();sync();
    })()`);
    const frames = [];
    for (let step = 0; step < 12; step++) {
      const trace = await evaluate(`(()=>{
        advanceBattle(.025);updateSwing(.025);updateBattleHud();draw();
        const e=game.enemies[0];
        return {step:${step},projectiles:game.projectiles.length,
          enemyHp:e?+e.hp.toFixed(1):null,enemyX:e?+e.x.toFixed(2):null,
          effects:game.effects.length,floats:game.floats.length,corpses:game.corpses.length,
          lastEvents:game.combatEvents.slice(-4).map(x=>x.kind),phase:game.phase};
      })()`);
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(artifacts, 'v024-hit-' + String(step).padStart(2, '0') + '.png'), Buffer.from(shot.data, 'base64'));
      frames.push(trace);
    }
    fs.writeFileSync(path.join(artifacts, 'v024-hit-frames.json'), JSON.stringify(frames, null, 2));
    const frameCheck = {
      name: '连续帧记录覆盖 发出→飞行→命中→死亡',
      pass: frames.some(f => f.projectiles > 0) && frames.some(f => f.lastEvents.includes('hit')) &&
        frames.some(f => f.corpses > 0) && frames.some(f => f.enemyHp === null),
      detail: JSON.stringify(frames.map(f => [f.step, f.projectiles, f.enemyHp, f.corpses]))
    };

    // ---- 多视口 HUD / 相机 / 坐标 / DPR2 / 设置菜单与震屏不影响 HUD ----
    await evaluate(`(()=>{paused=true;game=makeGame(42);game.started=true;
      for(const t of game.tiles)t.visible=true;chooseSite(0);
      Object.assign(game.hero,center(serviceTiles(game.castle)[0]));
      keys.clear();cancelMapGesture();sync();})()`);
    const layouts = [], cameras = [];
    for (const [width, height, mobile] of [[1440, 900, false], [1920, 1080, false], [844, 390, true], [932, 430, true], [390, 844, true]]) {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await evaluate(`(()=>{paused=true;makeMobileDock();closeTouchSheet();toggleSettings(false);
        sync();centerOnHero();$('pauseOverlay').hidden=true;
        clearTimeout(toastTimer);$('toast').hidden=true;})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      layouts.push({ viewport: width + 'x' + height, ...(await evaluate(source('layout-v019.js'))) });
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(artifacts, 'v024-' + width + 'x' + height + '.png'), Buffer.from(shot.data, 'base64'));
      cameras.push({ viewport: width + 'x' + height, ...(await evaluate(cameraHook())) });
      if (width === 1440) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
        const dpr = await evaluate(`(()=>{measureCameraViewport();const t=tileAt(8,6);
          camera.mode='manual';camera.tx=-40;camera.ty=25;applyCamera();
          const p=worldToScreen(t.x*CELL+8,t.y*CELL+8),g=screenToGrid(p.x,p.y);
          return {dpr:devicePixelRatio,ok:!!(g&&g.x===8&&g.y===6)};})()`);
        cameras.push({ viewport: '1440x900@2x', passed: dpr.ok && dpr.dpr === 2 ? 1 : 0, total: 1,
          results: [{ name: 'DPR2 不影响 CSS 坐标往返', pass: !!(dpr.ok && dpr.dpr === 2) }] });
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      }
    }
    const hudAudits=[];
    for (const [width, height, mobile] of [[1050, 955, false], [1440, 900, false], [390, 844, true], [360, 800, true], [320, 568, true], [844, 390, true], [932, 430, true]]) {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      hudAudits.push(await evaluate('__auditHudBoxes()'));
    }
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const hudCheck = await evaluate(`(()=>{
      const pick=sel=>{const r=document.querySelector(sel).getBoundingClientRect();
        return [+r.x.toFixed(2),+r.y.toFixed(2),+r.width.toFixed(2),+r.height.toFixed(2)];};
      // 先跑一次绘制稳定触摸模式 / HUD 状态，再比较三种情形
      game.settings.effects='standard';game.shake={t:0,mag:0};draw();
      const base=['.top','.status','.command-bar','#questBar'].map(pick);
      toggleSettings(true);
      const open=['.top','.status','.command-bar','#questBar'].map(pick);
      triggerShake(6);draw();
      const shaken=['.top','.status','.command-bar','#questBar'].map(pick);
      toggleSettings(false);
      return {unchanged:JSON.stringify(base)===JSON.stringify(open)&&JSON.stringify(base)===JSON.stringify(shaken),
        menuHidden:$('settingsMenu').hidden,base,open,shaken};
    })()`);

    // ---- 密集阶段性能与表现预算 ----
    const perf = await evaluate(`(()=>{
      paused=true;game=makeGame(42);game.started=true;
      for(const t of game.tiles)t.visible=true;chooseSite(0);
      game.phase='night';game.day=5;game.isBoss=true;game.clock=60;game.spawnStopped=true;
      const c=game.castle,fronts=game.fronts=[makeFront('home',null,createWavePlan(5,'home',true),[])];
      fronts[0].gates=[tileAt(0,4)];calculateRoutes(fronts[0],c);
      for(let y=2;y<=8;y++)for(let x=2;x<=12;x++){
        const t=tileAt(x,y);if(t&&!t.building&&t.ground!=='water'){t.ground='grass';t.node=null;}
      }
      for(let i=0;i<40;i++){
        const e=spawnEnemy(fronts[0],{record:queueRecord('normal',5,1,1),gate:0});
        Object.assign(e,{x:2+(i%10)*.9,y:2+Math.floor(i/10)*1.1,speed:0,cooldown:99});
      }
      const times=[];
      for(let i=0;i<60;i++){
        const t0=performance.now();draw();times.push(performance.now()-t0);
      }
      times.sort((a,b)=>a-b);
      return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
        liveEnemies:game.enemies.length,projectiles:game.projectiles.length,
        effects:game.effects.length,floats:game.floats.length,
        drawMedianMs:+times[30].toFixed(2),drawP95Ms:+times[57].toFixed(2),drawMaxMs:+times[59].toFixed(2)};
    })()`);
    fs.writeFileSync(path.join(artifacts, 'v024-performance.json'), JSON.stringify({ perf, hardware: process.platform + ' / headless Chrome / --disable-gpu' }, null, 2));

    const summarize = obj => ({ total: obj.total, passed: obj.passed,
      failed: (obj.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '') + (r.detail ? ' :: ' + r.detail : '')) });
    const out = {
      file: targetName,
      hooks: Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, summarize(v)])),
      campaignChecks, frameCheck, hudCheck, perf,
      campaigns: campaigns.map(c => ({ seed: c.seed, strategy: c.strategy, phase: c.final.phase,
        day: c.final.day, castle: c.final.castle, kills: c.final.kills })),
      noDefense: { phase: noDefense.final.phase, day: noDefense.final.day, castle: noDefense.final.castle },
      hudAudits,
      layouts: layouts.map(l => ({ viewport: l.viewport, passed: l.passed, total: l.total })),
      cameras: cameras.map(c => ({ viewport: c.viewport, passed: c.passed, total: c.total,
        failed: (c.results || []).filter(r => !r.pass).map(r => r.name + (r.error ? ' :: ' + r.error : '')) })),
      pageErrors: await evaluate('window.__pageErrors||[]')
    };
    fs.writeFileSync(path.join(artifacts, 'v024-verification.json'),
      JSON.stringify({ out, hooks, layouts, cameras, frames }, null, 2));
    console.log(JSON.stringify(out, null, 2));

    for (const [k, v] of Object.entries(hooks)) assert.equal(v.passed, v.total, k + ' hook checks failed');
    for (const c of campaignChecks) assert.ok(c.pass, c.name);
    assert.ok(frameCheck.pass, frameCheck.name + ' :: ' + frameCheck.detail);
    assert.ok(hudCheck.unchanged && hudCheck.menuHidden, 'HUD 被设置菜单或震屏改变');
    for (const l of layouts) assert.equal(l.passed, l.total, 'layout ' + JSON.stringify(l.viewport));
    for (const h of hudAudits) {
      assert.equal(h.overlap, 0, 'battle/alert overlap ' + h.viewport + ' ' + JSON.stringify(h));
      assert.equal(h.questOverlap, 0, 'quest overlap ' + h.viewport);
      assert.ok(h.overflow, 'overflow ' + h.viewport);
      assert.ok(h.stocksOk, 'stocks ' + h.viewport);
      assert.ok(h.battleOn && h.alertOn, 'hud visible ' + h.viewport);
      assert.ok(h.loss && h.loss.commandHidden && /城堡|布防|入口/.test(h.loss.goal), 'loss summary ' + h.viewport);
      assert.ok(h.loss.resetVisible, 'restart visible ' + h.viewport);
      if (h.viewport.startsWith('320') || h.viewport.startsWith('360') || h.viewport.startsWith('390')) {
        assert.ok(h.buttonMin >= 44, 'button size ' + h.viewport + ' ' + h.buttonMin);
        assert.ok(h.loss.open && h.loss.closed && h.loss.reopened, 'touch loss sheet ' + h.viewport + ' ' + JSON.stringify(h.loss));
      } else if (Number(h.viewport.split('x')[0]) >= 1000) {
        assert.equal(h.loss.open, false, 'desktop loss keeps the side panel ' + h.viewport);
      }
    }
    for (const c of cameras) assert.equal(c.passed, c.total, 'camera ' + c.viewport + ' :: ' + JSON.stringify((c.results || []).filter(r => !r.pass)));
    assert.equal(out.pageErrors.length, 0, 'page errors: ' + out.pageErrors.join(' | '));
    await client.send('Browser.close');
  } finally { client?.close(); chrome.kill(); }
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
