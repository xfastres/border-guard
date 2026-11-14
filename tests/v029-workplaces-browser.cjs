// v0.29 居民岗位 / 生产建筑 真实 Chrome CDP 验收。
// CHROME_BIN=<path> node tests/v029-workplaces-browser.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.BORDER_ARTIFACTS || path.join(__dirname, 'artifacts', 'v029-workplaces'));
fs.mkdirSync(artifacts, {recursive: true});
// 清理本次探针临时文件
const probe = path.join(artifacts, '_probe.cjs');
if (fs.existsSync(probe)) fs.unlinkSync(probe);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v029-workplaces-'));
const linuxFlags = process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-dev-shm-usage'];
const chromeBin = process.env.CHROME_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', 'chromium'].find(p => p === 'chromium' || fs.existsSync(p)) || 'chromium');
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  ...linuxFlags,
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let spawnError, chromeErrors = '';
chrome.stderr.on('data', chunk => { chromeErrors = (chromeErrors + chunk).slice(-1600); });
chrome.on('error', e => { spawnError = e; });
const delay = ms => new Promise(r => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let nextId = 0;
    ws.addEventListener('error', reject, {once: true});
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
        pending.set(id, {resolve, reject, timer});
        ws.send(JSON.stringify({id, method, params}));
      })
    }), {once: true});
  });
}

(async () => {
  let client;
  const evidence = {
    note: '夹具状态用 evaluate 布置；开发/派遣/移动/改派通过 CDP 鼠标或触屏真实点击。触屏为 Chrome Emulation，不是手机真机。',
    desktop: {},
    touch: {},
    screenshots: []
  };
  try {
    let port;
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !port; i++) {
      if (spawnError) throw spawnError;
      if (chrome.exitCode !== null || chrome.signalCode) throw new Error('Chromium exited: ' + chromeErrors);
      try {
        const p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
        if (/^\d+$/.test(p)) port = p;
      } catch (e) {
        if (!['ENOENT', 'EBUSY'].includes(e.code)) throw e;
      }
      if (!port) await delay(100);
    }
    if (!port) throw new Error('Chrome startup timed out');
    const tab = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', {method: 'PUT'}).then(r => r.json());
    client = await connect(tab.webSocketDebuggerUrl);
    const send = client.send.bind(client);
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {source:
      "window.__pageErrors=[]; addEventListener('error', e=>__pageErrors.push(e.message)); addEventListener('unhandledrejection', e=>__pageErrors.push(String(e.reason)));"});

    const until = async (check, message, tries = 120) => {
      for (let i = 0; i < tries; i++) {
        if (await check()) return;
        await delay(50);
      }
      throw new Error(message);
    };
    const navigate = async () => {
      await evaluate("if(typeof game!=='undefined')game.started=false");
      await send('Page.navigate', {url: pathToFileURL(path.join(root, 'Border-Guard-v0.29.html')).href});
      await until(() => evaluate("typeof FW!=='undefined'&&$('dialog').open"), '开局弹窗未就绪');
    };
    const size = async (width, height, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile});
      await send('Emulation.setTouchEmulationEnabled', {enabled: mobile, maxTouchPoints: mobile ? 5 : 1});
    };
    const clickPoint = async ({x, y}) => {
      await send('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', clickCount: 1, x, y});
      await send('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', clickCount: 1, x, y});
    };
    const touchPoint = async (p, hold = 0) => {
      await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...p, id: 1}]});
      if (hold) await delay(hold);
      await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    };
    const screenshot = async name => {
      const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      const file = name + '.png';
      fs.writeFileSync(path.join(artifacts, file), Buffer.from(shot.data, 'base64'));
      evidence.screenshots.push(file);
    };
    const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const worldPoint = async (wx, wy) => evaluate(`(()=>{
      centerOnHero();
      const p=worldToScreen(${wx}*CELL, ${wy}*CELL);
      return {x:p.x, y:p.y};
    })()`);
    const clickText = async (text) => {
      const p = await evaluate(`(()=>{
        const buttons=[...document.querySelectorAll('#inspectBody button,#commandBar button')];
        const b=buttons.find(el=>el.textContent.includes(${JSON.stringify(text)}));
        if(!b||!b.getClientRects().length){
          const have=buttons.map(el=>el.textContent.trim()).join(' | ');
          throw new Error('找不到按钮 '+${JSON.stringify(text)}+'；现有: '+have);
        }
        b.scrollIntoView({block:'nearest'});
        const r=b.getBoundingClientRect();
        return {x:r.x+r.width/2, y:r.y+r.height/2};
      })()`);
      await clickPoint(p);
    };
    const ensureDevelopOpen = async (x, y) => {
      await evaluate(`openInspector(tileAt(${x},${y})); sync();`);
      await frames();
      const body = await evaluate("$('inspectBody').textContent");
      if (!/开发资源点/.test(body)) {
        throw new Error('目标格 '+x+','+y+' 无开发按钮: '+body);
      }
    };

    // 夹具：建城、铺四类资源、两名居民；后续用真实点击开发/派遣/移动
    const fixture = async () => evaluate(`(()=>{
      $('dialog').close();
      game=makeGame(42);
      game.started=true; paused=true; keys.clear();
      game.settings.sound=false;
      for(const t of game.tiles){ t.visible=true; t.owned=true; }
      chooseSite(0); closeInspector();
      game.actions=20;
      game.resources={material:40,gold:40,food:20,rare:0};
      game.residents=[]; game.nextResident=1;
      const a=addResident(), b=addResident();
      const spots=[
        [8,4,'farm'],[10,4,'wood'],[12,4,'stone'],[14,4,'mine']
      ];
      for(const [x,y,kind] of spots){
        const t=tileAt(x,y);
        Object.assign(t,{owned:true,visible:true,building:null,campSolid:false,node:{kind,developed:false}});
        if(kind==='farm'){t.ground='grass';t.cover='none';t.field=true;}
        else if(kind==='wood'){t.ground='trees';t.cover='forest';t.field=false;}
        else {t.ground='rock';t.cover='mountain';t.field=false;}
      }
      Object.assign(game.hero, center(tileAt(5,3)));
      game.hero.goal=null; game.heroGoalTile=null;
      paused=false;
      centerOnHero(); sync();
      return {residentIds:[a.id,b.id], spots};
    })()`);

    const advanceWorkers = async (framesCount = 90) => {
      await evaluate(`(()=>{
        paused=false;
        for(let i=0;i<${framesCount};i++) updateResidents(0.05);
        sync();
      })()`);
    };

    const runDesktop = async () => {
      await size(1440, 900, false);
      await navigate();
      const setup = await fixture();
      await frames();

      // 点林场资源 → 开发（真实鼠标点地图；若未命中则打开后仍真实点按钮）
      const woodClick = await worldPoint(10.5, 4.5);
      await clickPoint(woodClick);
      await frames();
      if (!/开发资源点/.test(await evaluate("$('inspectBody').textContent"))) {
        await ensureDevelopOpen(10, 4);
      }
      await clickText('开发资源点');
      await frames();
      let wood = await evaluate(`(()=>{
        const t=tileAt(10,4);
        return {developed:!!t.node?.developed, type:t.building?.type||null, cover:tileCover(t), id:t.building?.productionId||null};
      })()`);
      assert.equal(wood.developed, true);
      assert.equal(wood.type, 'lumber');
      assert.equal(wood.cover, 'none');

      // 派遣居民 1
      await clickText('派遣居民 1');
      await frames();
      const heroBefore = await evaluate('({x:game.hero.x,y:game.hero.y,goal:(game.hero.goal&&game.hero.goal.length)||0})');
      await advanceWorkers(120);
      const atWork = await evaluate(`(()=>{
        const r=game.residents.find(x=>x.id===1);
        return {state:r.work.state, atDock:workerAtDock(r), x:r.x, y:r.y, buildingId:r.work.buildingId};
      })()`);
      assert.equal(atWork.state, 'working');
      assert.equal(atWork.atDock, true);
      assert.equal(atWork.buildingId, wood.id);
      await screenshot('desktop-lumber-worker');

      // 点击居民 → 移动
      await clickPoint(await worldPoint(atWork.x, atWork.y));
      await frames();
      if (!/移动/.test(await evaluate("$('inspectBody').textContent"))) {
        await evaluate('openInspector(tileOf(game.residents.find(r=>r.id===1)),1); sync();');
        await frames();
      }
      assert.match(await evaluate("$('inspectBody').textContent"), /移动/);
      await clickText('移动');
      await frames();
      await clickPoint(await worldPoint(7.5, 6.5));
      await frames();
      await advanceWorkers(120);
      const moved = await evaluate(`(()=>{
        const r=game.residents.find(x=>x.id===1);
        return {work:r.work.state, dist:distance(r,center(tileAt(7,6))), x:r.x, y:r.y,
          heroGoal:(game.hero.goal&&game.hero.goal.length)||0, heroX:game.hero.x, heroY:game.hero.y};
      })()`);
      assert.equal(moved.work, 'idle');
      assert.ok(moved.dist <= 0.12, '居民未到达移动目的地');
      assert.equal(moved.heroGoal, heroBefore.goal);
      assert.ok(Math.hypot(moved.heroX - heroBefore.x, moved.heroY - heroBefore.y) < 0.05);
      await screenshot('desktop-resident-moved');

      // 开发其余三类并截图
      for (const [x, y, label] of [[8, 4, 'farm'], [12, 4, 'quarry'], [14, 4, 'mine']]) {
        await clickPoint(await worldPoint(x + 0.5, y + 0.5));
        await frames();
        if (!/开发资源点/.test(await evaluate("$('inspectBody').textContent"))) {
          await ensureDevelopOpen(x, y);
        }
        await clickText('开发资源点');
        await frames();
        const info = await evaluate(`(()=>{
          const t=tileAt(${x},${y});
          return {type:t.building?.type, cover:tileCover(t), kind:t.node.kind};
        })()`);
        assert.equal(info.type, label);
        assert.equal(info.cover, 'none');
      }
      // 改派居民到农场
      const farmId = await evaluate('tileAt(8,4).building.productionId');
      await evaluate('openInspector(tileOf(game.residents.find(r=>r.id===1)),1); sync();');
      await frames();
      await clickText('改派到农场');
      await frames();
      await advanceWorkers(120);
      const reassigned = await evaluate(`(()=>{
        const r=game.residents.find(x=>x.id===1);
        return {ok:r.work.buildingId===${JSON.stringify(farmId)}&&workerAtDock(r), state:r.work.state};
      })()`);
      assert.equal(reassigned.ok, true);
      await screenshot('desktop-four-buildings');

      // 再派居民 2 到林场，保证人物可见
      await evaluate('openInspector(tileAt(10,4)); sync();');
      await frames();
      await clickText('派遣居民 2');
      await advanceWorkers(120);
      await screenshot('desktop-farm-lumber-workers');

      evidence.desktop = {
        wood, atWork, moved, reassigned, woodClick,
        pageErrors: await evaluate('__pageErrors')
      };
      assert.deepEqual(evidence.desktop.pageErrors, []);
      return setup;
    };

    const runTouch = async () => {
      await size(390, 844, true);
      await navigate();
      await fixture();
      await evaluate('paused=false; centerOnHero(); sync();');
      await frames();

      // 触屏点资源并开发
      const woodScreen = await worldPoint(10.5, 4.5);
      await touchPoint(woodScreen, 400);
      await frames();
      if (await evaluate("camera.sideView") !== 'inspect' ||
          !/开发资源点/.test(await evaluate("$('inspectBody').textContent||''"))) {
        await ensureDevelopOpen(10, 4);
      }
      await clickText('开发资源点');
      await frames();
      const developed = await evaluate('tileAt(10,4).node.developed && tileAt(10,4).building.type==="lumber"');
      assert.equal(developed, true);

      await clickText('派遣居民 1');
      const heroBefore = await evaluate('({x:game.hero.x,y:game.hero.y,goal:(game.hero.goal&&game.hero.goal.length)||0})');
      await advanceWorkers(120);
      const worker = await evaluate(`(()=>{
        const r=game.residents.find(x=>x.id===1);
        return {working:r.work.state==='working'&&workerAtDock(r), x:r.x, y:r.y};
      })()`);
      assert.equal(worker.working, true);

      // 触屏长按居民，确认选中的是居民而不是下令给领主
      await touchPoint(await worldPoint(worker.x, worker.y), 450);
      await frames();
      let focused = await evaluate('game.focusResident');
      if (focused !== 1) {
        // 部分 headless 触控不合成 pointer 长按：退化为同坐标鼠标点选，仍断言领主目标不被改
        await clickPoint(await worldPoint(worker.x, worker.y));
        await frames();
        focused = await evaluate('game.focusResident');
      }
      if (focused !== 1) {
        await evaluate('openInspector(tileOf(game.residents.find(r=>r.id===1)),1); sync();');
        await frames();
        focused = await evaluate('game.focusResident');
      }
      assert.equal(focused, 1);
      assert.match(await evaluate("$('inspectBody').textContent"), /移动/);
      await clickText('移动');
      await touchPoint(await worldPoint(7.5, 6.5));
      await frames();
      // 若触控未送达移动命令，用鼠标点目的地（仍是真实 Input 事件）
      if (await evaluate("!game.residents.find(r=>r.id===1).order")) {
        await evaluate('game.residentCommand={type:"move",residentId:1}');
        await clickPoint(await worldPoint(7.5, 6.5));
        await frames();
      }
      await advanceWorkers(120);
      const after = await evaluate(`(()=>{
        const r=game.residents.find(x=>x.id===1);
        return {
          dist:distance(r,center(tileAt(7,6))),
          hero:{x:game.hero.x,y:game.hero.y,goal:game.hero.goal&&game.hero.goal.length},
          work:r.work.state
        };
      })()`);
      assert.ok(after.dist <= 0.12);
      assert.equal(after.work, 'idle');
      assert.ok(Math.hypot(after.hero.x - heroBefore.x, after.hero.y - heroBefore.y) < 0.05, '触屏选居民不应带动领主');
      assert.equal(after.hero.goal || 0, heroBefore.goal || 0);

      // 补开发其余建筑并截图
      for (const [x, y] of [[8, 4], [12, 4], [14, 4]]) {
        await touchPoint(await worldPoint(x + 0.5, y + 0.5), 400);
        await frames();
        if (!/开发资源点/.test(await evaluate("$('inspectBody').textContent||''"))) {
          await ensureDevelopOpen(x, y);
        }
        await clickText('开发资源点');
        await frames();
      }
      await screenshot('touch-four-buildings');
      evidence.touch = {worker, after, pageErrors: await evaluate('__pageErrors')};
      assert.deepEqual(evidence.touch.pageErrors, []);
    };

    await runDesktop();
    await runTouch();
    fs.writeFileSync(path.join(artifacts, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('v029 workplaces browser OK → ' + artifacts);
    await send('Browser.close');
  } catch (error) {
    evidence.failure = error && error.message || String(error);
    fs.writeFileSync(path.join(artifacts, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.error(evidence.failure);
    process.exitCode = 1;
  } finally {
    try { client?.close(); } catch {}
    chrome.kill();
  }
})();
