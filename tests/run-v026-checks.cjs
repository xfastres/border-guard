// v0.26 原生浏览器验收，Node 22+ 与 Chrome/Chromium。
// CHROME_BIN=<path> node tests/run-v026-checks.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.BORDER_ARTIFACTS || path.join(__dirname, 'artifacts', 'v026'));
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v026-'));
const chrome = spawn(process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'chromium'), [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let spawnError, chromeErrors='';
chrome.stderr.on('data',chunk=>{chromeErrors=(chromeErrors+chunk).slice(-1600);});
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
      if (chrome.exitCode!==null||chrome.signalCode)throw new Error('Chromium exited: '+chromeErrors);
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
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source:
      "window.__pageErrors=[]; addEventListener('error', e=>__pageErrors.push(e.message)); addEventListener('unhandledrejection', e=>__pageErrors.push(String(e.reason)));" });
    const send = client.send;
    const state = async () => evaluate("({phase:game.phase,day:game.day,actions:game.actions,castle:!!game.castle,side:camera.sideView||null,mode:game.mode,route:game.hero.goal?.length||0,resources:game.resources})");
    const until = async (check, message) => {
      for (let i=0; i<100; i++) {
        if(await check())return;
        await delay(50);
      }
      throw new Error(message);
    };
    const navigate = async version => {
      await evaluate("if(typeof game!=='undefined')game.started=false");
      await send('Page.navigate',{url:pathToFileURL(path.join(root,'Border-Guard-v'+version+'.html')).href});
      await until(()=>evaluate("typeof FW!=='undefined'&&$('dialog').open"),'开局弹窗未就绪');
    };
    const size = async (width,height,mobile) => {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1});
    };
    const point = selector => evaluate(`(()=>{
      const el=document.querySelector(${JSON.stringify(selector)});
      if(!el||!el.getClientRects().length)throw Error('看不见 ${selector}');
      el.scrollIntoView({block:'nearest',inline:'nearest'});
      const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    const clickPoint = async ({x,y}) => {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});
    };
    const click = async selector => clickPoint(await point(selector));
    const touch = async (p,hold=0) => {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
      if(hold)await delay(hold);
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const screenshot = async name => {
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));
    };
    const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const setup = () => evaluate(`(()=>{
      $('dialog').close();game=makeGame(42);game.started=true;paused=true;keys.clear();
      game.settings.sound=false;for(const t of game.tiles)t.visible=true;
      chooseSite(0);closeInspector();centerOnHero();
      clearTimeout(toastTimer);$('toast').hidden=true;
    })()`);
    const viewports = [
      [1920,1080,false],[1740,900,false],[1440,900,false],[1366,768,false],[1280,720,false],[1024,768,false],
      [430,932,true],[390,844,true],[375,812,true],[360,800,true],[320,568,true],[932,430,true],[844,390,true],
    ];
    const evidence={viewports:[],interactions:[],hooks:{},campaigns:[]};
    const layouts=async()=>{
      for(const [w,h,mobile] of viewports){
        const label=w+'x'+h;
        await size(w,h,mobile);
        await navigate('0.25');await setup();await frames();
        await screenshot('baseline-day-'+label);
        await evaluate('openInspector(game.castle);sync();');
        await frames();await screenshot('baseline-inspector-'+label);
        await navigate('0.26');await setup();await frames();
        await screenshot('day-'+label);
        await evaluate('openInspector(game.castle);sync();');
        await frames();await screenshot('inspector-'+label);
        const measure=await evaluate(`(()=>{
          const rect=id=>{const r=$(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
          const board=rect('board'),side=rect('playSide'),deck=rect('commandDeck'),hud=rect('stocks');
          const hero=worldToScreen(game.hero.x*CELL,game.hero.y*CELL);
          const bottom=r=>r.y+r.h,right=r=>r.x+r.w;
          const overlap=(a,b)=>Math.max(0,Math.min(right(a),right(b))-Math.max(a.x,b.x))*
            Math.max(0,Math.min(bottom(a),bottom(b))-Math.max(a.y,b.y));
          const buttons=[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length&&b.offsetWidth);
          return {board,side,deck,hud,hero,screen:[innerWidth,innerHeight],intersection:overlap(board,side),
            deckIntersection:overlap(board,deck),heroError:Math.hypot(hero.x-board.x-board.w/2,hero.y-board.y-board.h/2),
            minimumHit:Math.min(...buttons.map(b=>Math.min(b.offsetWidth,b.offsetHeight))),
            overflow:document.documentElement.scrollWidth>innerWidth,pageErrors:__pageErrors};
        })()`);
        evidence.viewports.push({label,...measure});
        assert.equal(measure.intersection,0,label+' 详情挡住地图');
        assert.equal(measure.deckIntersection,0,label+' 命令栏挡住地图');
        assert.ok(measure.board.h>=Math.min(145,h*.36)&&measure.board.w>=200,label+' 地图过窄或过矮');
        assert.ok(measure.heroError<=2,label+' 相机锚点偏移');
        assert.ok(!measure.overflow,label+' 文档横向溢出');
        assert.ok(measure.hud.x>=0&&measure.hud.x+measure.hud.w<=w+1,label+' 库存超出视口');
        if(mobile)assert.ok(measure.minimumHit>=44,label+' 触控按钮过小');
        assert.deepEqual(measure.pageErrors,[],label+' 页面错误');
        await evaluate('closeInspector();startNight();sync();centerOnHero()');
        await frames();await screenshot('night-'+label);
        if([320,844,1740].includes(w)){
          await evaluate(`game.castleHp=game.castleMax-10;game.hero.hp=game.hero.max-5;
            game.resources.gold=10;game.mobileGroup='support';sync();`);
          assert.equal(await evaluate("$('quickRepair').disabled||$('quickPotion').disabled"),false);
          await screenshot('support-'+label);
        }
      }
    };
    const interactions=async()=>{
      await size(1740,900,false);await navigate('0.26');
      await click('#dialogContent .choices button');
      await click('#commandBar button:first-child');
      await until(()=>evaluate('tileAt(game.sites[0].x,game.sites[0].y).visible'),'领主未到达 A 城址视野');
      await click('#commandBar button:first-child');
      await click('#inspectBody .tile-actions button');
      assert.ok((await state()).castle,'建城失败');
      await click('#closeInspector');
      await click('#mobileGroups button:nth-child(2)');
      await click('#commandBar button[data-group=lord]:not([hidden])');
      assert.equal((await state()).side,'inspect');
      await click('#reportBtn');
      assert.equal((await state()).side,'report');
      await click('#campaignBtn');
      assert.equal((await state()).side,'campaign');
      await click('#closeInspector');
      await click('#pauseBtn');
      const elapsed=await evaluate('game.phaseElapsed');
      await delay(180);
      assert.equal(await evaluate('game.phaseElapsed'),elapsed,'暂停时白天继续');
      await click('#resumeBtn');
      await click('#duskBtn');
      assert.equal(await evaluate('!!game.earlyNightAt'),true);
      await click('#duskBtn');
      assert.equal(await evaluate('!!game.earlyNightAt'),false);
      evidence.interactions.push('桌面原生点击：开局、前往城址、确认建城、居民/战报/战役、暂停、提前入夜取消');
      await size(390,844,true);await navigate('0.26');await setup();
      await evaluate('paused=false;centerOnHero();');
      await click('#commandBar button:not([hidden])');
      const tile=await evaluate(`(()=>{
        const r=$('board').getBoundingClientRect();
        const t=game.tiles.find(t=>{
          if(!canBuildAt(t)||validateBuild(t))return false;
          const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
          return p.x>r.left+8&&p.x<r.right-8&&p.y>r.top+8&&p.y<r.bottom-8;
        });
        if(!t)throw Error('无可点击建造格');
        return {p:worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL),index:at(t.x,t.y)};
      })()`);
      await touch(tile.p);
      assert.ok(await evaluate('!!game.tiles['+tile.index+'].building'),'触控工具未放置');
      await click('#cancelTool');
      const position=await evaluate(`centerOnHero();const target=game.tiles[${tile.index}];worldToScreen((target.x+.5)*CELL,(target.y+.5)*CELL)`);
      await touch(position,400);
      assert.equal((await state()).side,'inspect');
      await click('#closeInspector');
      const start=await evaluate("(()=>{const r=$('board').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+50,y:start.y,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await evaluate('camera.mode'),'manual');
      assert.equal((await state()).side,null);
      evidence.interactions.push('触屏原生事件：选工具放置、取消、长按查看、拖动地图');
      assert.deepEqual(await evaluate('__pageErrors'),[]);
    };
    const simulate=async()=>{
      await size(1440,900,false);await navigate('0.26');
      const run=name=>evaluate('('+fs.readFileSync(path.join(__dirname,name),'utf8')+')()');
      for(const name of ['combat-feedback-v024.js','experience-audit-v024.js','world-collision-v022.js','residents-v022.js','hero-spawn-v025.js','campaign-sim-v023.js']){
        const result=await run(name);evidence.hooks[name]=result;
        assert.equal(result.passed,result.total,name+' '+JSON.stringify(result.results.filter(r=>!r.pass)));
      }
      for(const [seed,plan] of [[7,'tower'],[42,'tower'],[99,'tower'],[42,'camp'],[42,'lord'],[42,'none']]){
        evidence.campaigns.push(await evaluate(`__simulateV023(${seed},'${plan}')`));
      }
      assert.ok(evidence.campaigns.some(c=>c.final.phase==='won'&&c.final.day===5));
      assert.equal(evidence.campaigns.at(-1).final.phase,'lost');
      for(const c of evidence.campaigns){
        for(const night of c.nights){
          if(c.final.phase==='lost'&&night.day===c.final.day)assert.equal(night.ledgerClosed,undefined);
          else assert.equal(night.ledgerClosed,true);
        }
      }
      for(const [plan, name] of [['tower','victory'],['none','defeat']]){
        await evaluate(`__simulateV023(42,'${plan}')`);
        await frames();await screenshot(name+'-1440x900');
      }
      assert.deepEqual(await evaluate('__pageErrors'),[]);
    };
    try {
      await layouts();await interactions();await simulate();
    } catch(error) {
      evidence.failure=error.message;
      throw error;
    } finally {
      fs.writeFileSync(path.join(artifacts,'browser.json'),JSON.stringify(evidence,null,2)+'\n');
    }
    console.log('13 个视口、两组原生输入和 6 局模拟已通过，证据目录 '+artifacts);
    await send('Browser.close');
  } finally { client?.close(); chrome.kill(); }
})().catch(e => { console.error(e.stack || e.message); process.exitCode=1; });
