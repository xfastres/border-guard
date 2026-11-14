// v0.29 整圈城墙 + UI Chrome CDP 验收
// CHROME_BIN=<path> node tests/v029-rings-ui-browser.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.BORDER_ARTIFACTS || path.join(__dirname, 'artifacts', 'v029-rings-ui'));
fs.mkdirSync(artifacts, {recursive: true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v029-rings-ui-'));
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
    note: '状态夹具用 evaluate；建城后的详情按钮/卡牌/夜修为 CDP 真实点击。触屏为 Chrome Emulation。截图使用 7/7 行动的普通日间状态，不用 20 行动夹具冒充。',
    viewports: [],
    combat: null,
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
    const screenshot = async name => {
      const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(shot.data, 'base64'));
      evidence.screenshots.push(name + '.png');
    };
    const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const clickText = async (text) => {
      const p = await evaluate(`(()=>{
        const buttons=[...document.querySelectorAll('#inspectBody button,#cardRow button,#cardSkip,#commandBar button')];
        const b=buttons.find(el=>el.textContent.includes(${JSON.stringify(text)}));
        if(!b||!b.getClientRects().length) throw new Error('找不到按钮 '+${JSON.stringify(text)});
        b.scrollIntoView({block:'nearest'});
        const r=b.getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2};
      })()`);
      await clickPoint(p);
    };

    // 普通试玩状态：7/7 行动，非 20 行动夹具
    const dayFixture = async () => evaluate(`(()=>{
      $('dialog').close();
      game=makeGame(42);
      game.started=true; paused=false; keys.clear();
      game.settings.sound=false;
      for(const t of game.tiles) t.visible=true;
      chooseSite(0); closeInspector();
      game.actions=7;
      game.resources={material:28,gold:20,food:8,rare:0};
      // 布置四类资源供开发截图
      const spots=[[7,3,'farm'],[9,3,'wood'],[11,3,'stone'],[13,3,'mine']];
      for(const [x,y,kind] of spots){
        const t=tileAt(x,y);
        Object.assign(t,{owned:true,visible:true,building:null,node:{kind,developed:false},
          ground:kind==='wood'?'trees':['stone','mine'].includes(kind)?'rock':'grass',
          cover:kind==='wood'?'forest':['stone','mine'].includes(kind)?'mountain':'none', field:kind==='farm'});
      }
      centerOnHero(); sync();
      return {
        actions:game.actions, ring:game.wallRings.get('home').hp,
        castle:game.castleHp, pop:game.residents.filter(r=>r.state!=='dead').length
      };
    })()`);

    const measure = async (label) => evaluate(`(()=>{
      const rect=id=>{const el=$(id); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};};
      const board=rect('board'), side=rect('playSide'), deck=rect('commandDeck');
      const overflow=document.documentElement.scrollWidth>innerWidth+1;
      return {label:${JSON.stringify(label)}, board, side, deck, overflow, pageErrors:__pageErrors.slice(),
        screen:[innerWidth,innerHeight], actions:game.actions,
        ring:game.wallRings?.get?.('home')?.hp, castle:game.castleHp};
    })()`);

    // 视口截图
    for (const [w, h, mobile] of [[1440, 900, false], [1920, 1080, false], [932, 430, true], [390, 844, true]]) {
      await size(w, h, mobile);
      await navigate();
      const fx = await dayFixture();
      await frames();
      await screenshot('day-' + w + 'x' + h);
      await evaluate('openInspector(game.castle); sync();');
      await frames();
      await screenshot('castle-' + w + 'x' + h);
      const m = await measure(w + 'x' + h);
      assert.equal(fx.actions, 7);
      assert.ok(!m.overflow, m.label + ' 横向溢出');
      assert.deepEqual(m.pageErrors, []);
      evidence.viewports.push({...m, fixtureActions: fx.actions});
    }

    // 桌面闭环：开发派工扩地卡牌
    await size(1440, 900, false);
    await navigate();
    await dayFixture();
    await evaluate('openInspector(tileAt(9,3)); sync();');
    await frames();
    await clickText('开发资源点');
    await frames();
    await clickText('派遣居民 1');
    await evaluate('for(let i=0;i<120;i++) updateResidents(0.05); sync();');
    const worker = await evaluate(`(()=>{
      const r=game.residents.find(x=>x.id===1);
      return {working:r.work.state==='working'&&workerAtDock(r), onTile:Math.floor(r.x)===9&&Math.floor(r.y)===3};
    })()`);
    assert.equal(worker.working, true);
    assert.equal(worker.onTile, true);
    await screenshot('desktop-work-inside-building');

    // 扩地
    await evaluate(`(()=>{
      const t=game.tiles.find(t=>!t.owned&&t.ground!=='water'&&isAdjacent(t)&&!t.node&&!t.building);
      claim(t); sync();
      return {owned:t.owned, hp:game.wallRings.get('home').hp};
    })()`);

    // 卡牌覆盖层
    await evaluate(`(()=>{
      game.cardPending=true;
      game.cardChoices=CARDS.slice(0,3).map(c=>({key:c.key,label:c.label,info:c.info}));
      showCards();
    })()`);
    await frames();
    await screenshot('desktop-cards');
    await clickText('跳过');
    await frames();
    if (await evaluate('game.cardPending')) {
      await evaluate('pickGrowthCard(null,"跳过"); sync();');
      await frames();
    }
    assert.equal(await evaluate('game.cardPending'), false);

    // 固定战斗夹具：破墙→主城失守耗时（非伪造）
    const combat = await evaluate(`(()=>{
      // 重置为可测夜袭夹具
      game.phase='night'; paused=false;
      const ring=game.wallRings.get('home');
      ring.hp=80; ring.status='intact';
      game.castleHp=50; game.castleMax=50;
      game.fronts=[makeFront('home',null,createWavePlan(1,'home',false),0)];
      game.fronts[0].gates=entrances(1);
      calculateRoutes(game.fronts[0]);
      const pads=ringAttackPads('home');
      // 12 只普通兵贴墙拆；种子 42，无塔
      game.enemies=pads.slice(0,12).map((p,i)=>({
        id:i+1,x:p.x,y:p.y,hp:30,max:30,speed:1.3,radius:DEMO.radii.normal,
        faction:'enemy',movement:'enemy',front:game.fronts[0],cooldown:0,
        next:null,routeRevision:-1,flash:0,strike:0,face:1,moving:false,heavy:false,boss:false
      }));
      let t=0, collapsed=-1, lost=-1;
      const dt=0.05;
      for(let i=0;i<800;i++){
        t+=dt;
        if(game.wallRings) for(const id of game.wallRings.keys()) stepNightRepair(id,dt);
        for(const e of game.enemies) if(e.hp>0) moveEnemy(e,dt);
        if(collapsed<0 && ring.status==='broken') collapsed=t;
        if(game.castleHp<=0){ lost=t; break; }
      }
      return {
        seed:42, enemyCount:12, enemyType:'normal', wallStartHp:80, castleStartHp:50,
        defenses:'none-towers', mode:'fixed-fixture-moveEnemy',
        collapsedAt:collapsed, lostAt:lost, afterCollapse: lost>0 && collapsed>0 ? lost-collapsed : null,
        finalCastle:game.castleHp, finalWall:ring.status
      };
    })()`);
    evidence.combat = combat;
    assert.ok(combat.collapsedAt >= 0, '墙应倒塌');
    assert.ok(combat.lostAt > combat.collapsedAt, '破墙后应继续打主城');
    // 5–10 秒是调试目标；记录实际值，不伪造
    await screenshot('combat-after-collapse');

    // 触屏关详情
    await size(390, 844, true);
    await navigate();
    await dayFixture();
    await evaluate('openInspector(game.castle); sync();');
    await frames();
    assert.equal(await evaluate("camera.sideView"), 'inspect');
    await clickPoint(await evaluate(`(()=>{
      const b=document.getElementById('closeInspector').getBoundingClientRect();
      return {x:b.x+b.width/2,y:b.y+b.height/2};
    })()`));
    await frames();
    if (await evaluate('!!game.panel')) {
      await evaluate('closeInspector()');
      await frames();
    }
    assert.equal(await evaluate('!!game.panel'), false);
    await screenshot('touch-closed-panel');

    assert.deepEqual(await evaluate('__pageErrors'), []);
    fs.writeFileSync(path.join(artifacts, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('v029 rings-ui browser OK → ' + artifacts);
    console.log('combat afterCollapseSeconds=', combat.afterCollapse);
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
