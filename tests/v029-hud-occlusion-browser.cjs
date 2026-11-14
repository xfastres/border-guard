// v0.29 HUD 遮挡回归：旧版应失败，修复后通过。
// CHROME_BIN=<path> node tests/v029-hud-occlusion-browser.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.BORDER_ARTIFACTS || path.join(__dirname, 'artifacts', 'v029-hud-occlusion'));
fs.mkdirSync(artifacts, {recursive: true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'border-v029-hud-'));
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

function overlapPx(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

(async () => {
  let client;
  const evidence = {
    note: '选址/日间详情/三卡真实点击；地图点击与安全区不落在面板；截图写入本目录。',
    viewports: [],
    cards: [],
    mapClicks: [],
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
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(shot.data, 'base64'));
      evidence.screenshots.push(name + '.png');
    };
    const frames = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');

    const measureOcclusion = async phase => evaluate(`(()=>{
      const board=$('board').getBoundingClientRect();
      const els=[...document.querySelectorAll('.briefing,.legend-panel,.minimap-panel,#commandDeck,#playSide')]
        .filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.hidden);
      let blocked=0,total=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const px=board.left+(x+.5)*board.width/32, py=board.top+(y+.5)*board.height/32;
        if(els.some(e=>{const r=e.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom;})) blocked++;
        total++;
      }
      const px=camera.vx+camera.safeX, py=camera.vy+camera.safeY;
      const hit=document.elementFromPoint(px,py);
      const side=$('playSide'), deck=$('commandDeck');
      const sideR=side&&!side.hidden?side.getBoundingClientRect():null;
      const deckR=deck&&!deck.hidden?deck.getBoundingClientRect():null;
      const legendList=$('legendList');
      const mini=$('miniMap');
      const legendBtn=$('toggleLegend'), miniBtn=$('toggleMinimap');
      const legendTitle=document.querySelector('.legend-panel .rail-head h3');
      const miniTitle=document.querySelector('.minimap-panel .rail-head h3');
      const btnBox=b=>{ if(!b) return null; const r=b.getBoundingClientRect(); return {
        w:r.width,h:r.height,text:b.textContent,
        nowrap:getComputedStyle(b).whiteSpace==='nowrap',
        writing:getComputedStyle(b).writingMode
      };};
      const insets=camera.insets||{l:0,r:0,t:0,b:0};
      const expectX=insets.l+(camera.vw-insets.l-insets.r)/2;
      const expectY=insets.t+(camera.vh-insets.t-insets.b)/2;
      const deckOnlyB=deckR?Math.max(8,board.bottom-deckR.top+6):8;
      const focusScreen={x:px,y:py};
      const briefing=document.querySelector('.briefing');
      const briefingBottom=briefing&&!briefing.hidden?briefing.getBoundingClientRect().bottom:board.top;
      const inRemainGap=focusScreen.y>briefingBottom+4
        && (!deckR||focusScreen.y<deckR.top-4)
        && (!sideR||(insets.sideDock==='right'?focusScreen.x<sideR.left-4:focusScreen.y<sideR.top-4));
      return {
        phase:${JSON.stringify(phase)},
        width:innerWidth, height:innerHeight,
        free:1-blocked/total,
        target:hit&&(hit.id||hit.tagName),
        focusClear:hit===$('map')||hit===$('board')||hit===$('mapWorld'),
        focusCenter:Math.abs(camera.safeX-expectX)<1.5&&Math.abs(camera.safeY-expectY)<1.5,
        inRemainGap,
        safe:{x:camera.safeX,y:camera.safeY}, expect:{x:expectX,y:expectY},
        focusScreen,
        legendHidden:!!legendList?.hidden,
        minimapHidden:!!mini?.hidden,
        deckWidth:deckR?deckR.width:0,
        deckCompact:!!deck?.classList.contains('deck-compact'),
        sideRect:sideR&&{top:sideR.top,bottom:sideR.bottom,left:sideR.left,right:sideR.right,width:sideR.width},
        deckRect:deckR&&{top:deckR.top,bottom:deckR.bottom,left:deckR.left,right:deckR.right},
        boardBottom:board.bottom,
        deckOnlyB,
        legendH:document.querySelector('.legend-panel')?.getBoundingClientRect().height||0,
        miniH:document.querySelector('.minimap-panel')?.getBoundingClientRect().height||0,
        legendTitleDisplay:legendTitle?getComputedStyle(legendTitle).display:'none',
        miniTitleDisplay:miniTitle?getComputedStyle(miniTitle).display:'none',
        legendBtn:btnBox(legendBtn),
        miniBtn:btnBox(miniBtn),
        insets,
        pageErrors:__pageErrors.slice()
      };
    })()`);

    const siteFixture = async () => evaluate(`(()=>{
      $('dialog').close();
      game=makeGame(42);
      game.started=true; paused=false; keys.clear();
      game.settings.sound=false;
      for(const t of game.tiles) t.visible=true;
      closeInspector();
      sync();
      layoutHudChrome();
      measureCameraViewport();
      snapCameraToHero();
      return {phase:game.phase, castle:!!game.castle, actions:game.actions};
    })()`);

    const dayFixture = async () => evaluate(`(()=>{
      chooseSite(0);
      if(game.cardPending){game.cardPending=false;game.cardModal=false;hideCardOverlay();}
      closeInspector();
      game.actions=7;
      game.resources={material:28,gold:20,food:8,rare:0};
      sync();
      layoutHudChrome();
      measureCameraViewport();
      snapCameraToPoint(game.castle.x+.5, game.castle.y+.5);
      return {actions:game.actions, castle:!!game.castle};
    })()`);

    const viewports = [
      [1108, 1195, false],
      [886, 956, false],
      [1108, 720, false],
      [1440, 900, false],
      [932, 430, true],
      [390, 844, true]
    ];

    for (const [w, h, mobile] of viewports) {
      await size(w, h, mobile);
      await navigate();
      const siteFx = await siteFixture();
      await frames();
      const site = await measureOcclusion('site');
      await screenshot('site-' + w + 'x' + h);

      assert.equal(siteFx.castle, false);
      assert.equal(site.legendHidden, true, w + 'x' + h + ' 选址图例应默认折叠');
      assert.equal(site.minimapHidden, true, w + 'x' + h + ' 选址小地图应默认折叠');
      assert.ok(site.legendH <= 60, w + 'x' + h + ' 折叠图例应紧凑单按钮, got ' + site.legendH);
      assert.ok(site.miniH <= 60, w + 'x' + h + ' 折叠小地图应紧凑单按钮, got ' + site.miniH);
      assert.equal(site.legendTitleDisplay, 'none', w + 'x' + h + ' 折叠时应隐藏重复 h3');
      assert.equal(site.miniTitleDisplay, 'none', w + 'x' + h + ' 折叠小地图应隐藏重复 h3');
      assert.ok(site.legendBtn && site.legendBtn.nowrap, w + 'x' + h + ' 图例按钮不换行');
      assert.ok(site.miniBtn && site.miniBtn.nowrap, w + 'x' + h + ' 小地图按钮不换行');
      assert.ok(site.legendBtn.h >= 44 && site.legendBtn.w >= site.legendBtn.h * 0.9,
        w + 'x' + h + ' 图例按钮应横向可点且≥44, got ' + JSON.stringify(site.legendBtn));
      assert.ok(site.miniBtn.h >= 44 && site.miniBtn.w >= site.miniBtn.h * 0.9,
        w + 'x' + h + ' 小地图按钮应横向可点且≥44, got ' + JSON.stringify(site.miniBtn));
      assert.equal(site.deckCompact, true, w + 'x' + h + ' 选址底栏应标记 compact');
      assert.ok(site.deckWidth < 520, w + 'x' + h + ' 选址底栏应按内容收缩, got ' + site.deckWidth);
      assert.equal(site.focusClear, true, w + 'x' + h + ' 选址 safe 点应落在地图, hit=' + site.target);
      assert.equal(site.focusCenter, true, w + 'x' + h + ' 选址焦点应在剩余空间中心');
      assert.deepEqual(site.pageErrors, []);

      // 选址 A/B 两按钮完整可见，中心命中各自按钮（避免 fit-content 裁切 B）
      const siteButtons = await evaluate(`(()=>{
        const bar=$('commandBar');
        const barR=bar.getBoundingClientRect();
        const buttons=[...bar.querySelectorAll('button')];
        const pick=re=>{
          const b=buttons.find(el=>re.test(el.textContent));
          if(!b) return null;
          const r=b.getBoundingClientRect();
          const cx=r.x+r.width/2, cy=r.y+r.height/2;
          const top=document.elementFromPoint(cx,cy);
          const eps=1;
          return {
            text:b.textContent,
            point:{x:cx,y:cy},
            rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},
            fullyInBar:r.left>=barR.left-eps&&r.right<=barR.right+eps&&r.top>=barR.top-eps&&r.bottom<=barR.bottom+eps,
            hit:top===b||b.contains(top),
            top:top&&(top.id||top.tagName)
          };
        };
        return {
          bar:{left:barR.left,right:barR.right,top:barR.top,bottom:barR.bottom,width:barR.width},
          a:pick(/查看 A|前往 A/),
          b:pick(/查看 B|前往 B/),
          deckWidth:$('commandDeck').getBoundingClientRect().width
        };
      })()`);
      assert.ok(siteButtons.a, w + 'x' + h + ' 应有选址 A');
      assert.ok(siteButtons.b, w + 'x' + h + ' 应有选址 B');
      assert.equal(siteButtons.a.fullyInBar, true, w + 'x' + h + ' A 按钮完整 rect 应在 commandBar 内');
      assert.equal(siteButtons.b.fullyInBar, true, w + 'x' + h + ' B 按钮完整 rect 应在 commandBar 内');
      assert.equal(siteButtons.a.hit, true, w + 'x' + h + ' A 中心应命中按钮, hit=' + siteButtons.a.top);
      assert.equal(siteButtons.b.hit, true, w + 'x' + h + ' B 中心应命中按钮, hit=' + siteButtons.b.top);
      if (mobile) await touchPoint(siteButtons.a.point);
      else await clickPoint(siteButtons.a.point);
      await frames();
      assert.equal(await evaluate('!!game.panel'), true, w + 'x' + h + ' 真实点击 A 应打开详情');
      await evaluate('closeInspector(); sync();');
      await frames();
      if (mobile) await touchPoint(siteButtons.b.point);
      else await clickPoint(siteButtons.b.point);
      await frames();
      assert.equal(await evaluate('!!game.panel'), true, w + 'x' + h + ' 真实点击 B 应打开详情');

      await evaluate('closeInspector(); sync();');
      await dayFixture();
      await evaluate('openInspector(game.castle); sync(); layoutHudChrome(); measureCameraViewport(); snapCameraToPoint(game.castle.x+.5,game.castle.y+.5);');
      await frames();
      const day = await measureOcclusion('details');
      await screenshot('details-' + w + 'x' + h);

      const ov = overlapPx(day.sideRect, day.deckRect);
      assert.equal(ov, 0, w + 'x' + h + ' 详情与底栏不得重叠, overlap=' + ov);
      assert.equal(day.focusClear, true, w + 'x' + h + ' 详情 safe 点应落在地图, hit=' + day.target);
      assert.equal(day.focusCenter, true, w + 'x' + h + ' 详情焦点应在剩余空间中心');
      assert.equal(day.inRemainGap, true, w + 'x' + h + ' 焦点应落在真实剩余空隙, screen=' + JSON.stringify(day.focusScreen));
      // 横屏触屏（如 932x430）：详情是右侧栏，不得按 MOBILE 误判成底部 sheet
      if (w === 932 && h === 430) {
        assert.equal(day.insets.sideDock, 'right', '932x430 详情应按矩形判为右侧');
        assert.ok(day.insets.r > 100, '横屏详情应有右侧 inset, got ' + day.insets.r);
        assert.ok(day.insets.b <= day.deckOnlyB + 2,
          '横屏底部 inset 仅取底栏, b=' + day.insets.b + ' deckOnly=' + day.deckOnlyB);
        assert.ok(day.focusScreen.x < day.sideRect.left - 4, '横屏焦点应在右侧详情左侧');
      }
      if (w === 390 && h === 844) {
        assert.equal(day.insets.sideDock, 'bottom', '390 竖屏详情应为底部 sheet');
      }
      const minDayFree = h <= 430 ? 0.48 : 0.45;
      const minSiteFree = h <= 430 ? 0.68 : (mobile ? 0.80 : 0.85);
      assert.ok(day.free >= minDayFree, w + 'x' + h + ' 详情可见地图占比过低: ' + day.free);
      assert.ok(site.free >= minSiteFree, w + 'x' + h + ' 选址可见地图占比过低: ' + site.free);
      assert.deepEqual(day.pageErrors, []);

      // 透明底栏外空白应能命中地图（选址阶段重测）
      await evaluate('closeInspector(); sync(); layoutHudChrome(); measureCameraViewport();');
      await frames();
      const passthrough = await evaluate(`(()=>{
        const board=$('board').getBoundingClientRect();
        const deck=$('commandDeck').getBoundingClientRect();
        // 底栏右侧外侧一点（若底栏居中收缩，左右应露出地图）
        const x=Math.min(board.right-12, deck.right+24);
        const y=deck.top+deck.height/2;
        if(x>board.right-4||x<board.left+4) return {skipped:true};
        const hit=document.elementFromPoint(x,y);
        return {skipped:false,x,y,target:hit&&(hit.id||hit.tagName),
          map:hit===$('map')||hit===$('board')||hit===$('mapWorld')};
      })()`);
      if (!passthrough.skipped) {
        assert.equal(passthrough.map, true, w + 'x' + h + ' 底栏外透明区应穿透到地图, hit=' + passthrough.target);
      }

      evidence.viewports.push({w, h, mobile, site, day, overlap: ov, passthrough});
    }

    // 桌面展开/折叠真实点击
    await size(1440, 900, false);
    await navigate();
    await siteFixture();
    await frames();
    const expandLegend = await evaluate(`(()=>{
      const b=$('toggleLegend'); const r=b.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await clickPoint(expandLegend);
    await frames();
    assert.equal(await evaluate("!$('legendList').hidden"), true, '展开图例后列表可见');
    const expandMini = await evaluate(`(()=>{
      const b=$('toggleMinimap'); const r=b.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await clickPoint(expandMini);
    await frames();
    assert.equal(await evaluate("!$('miniMap').hidden"), true, '展开小地图后画布可见');
    const expandedDesktop = await evaluate(`(()=>{
      const title=document.querySelector('.legend-panel .rail-head h3');
      const list=$('legendList');
      return {
        titleDisplay:title?getComputedStyle(title).display:'',
        listH:list.getBoundingClientRect().height,
        panelW:document.querySelector('.legend-panel').getBoundingClientRect().width
      };
    })()`);
    assert.notEqual(expandedDesktop.titleDisplay, 'none', '展开后应显示标题');
    assert.ok(expandedDesktop.listH > 40, '展开后完整列表可用');
    assert.ok(expandedDesktop.panelW >= 160, '展开后面板宽度应够汉字横排');
    await screenshot('expanded-rail-1440x900');

    // 窄屏真实触控：折叠不竖排 → 展开 → 再折叠
    await size(390, 844, true);
    await navigate();
    await siteFixture();
    await frames();
    const railTouch = await evaluate(`(()=>{
      const b=$('toggleLegend'); const r=b.getBoundingClientRect();
      const title=document.querySelector('.legend-panel .rail-head h3');
      return {
        point:{x:r.x+r.width/2,y:r.y+r.height/2},
        btn:{w:r.width,h:r.height,text:b.textContent},
        titleDisplay:title?getComputedStyle(title).display:'none',
        panelH:document.querySelector('.legend-panel').getBoundingClientRect().height
      };
    })()`);
    assert.equal(railTouch.titleDisplay, 'none', '390 折叠不显示竖排 h3');
    assert.ok(railTouch.btn.w > railTouch.btn.h && railTouch.btn.h >= 44,
      '390 折叠按钮横向可点: ' + JSON.stringify(railTouch.btn));
    assert.ok(railTouch.panelH <= 60, '390 折叠面板高度应紧凑, got ' + railTouch.panelH);
    await touchPoint(railTouch.point);
    await frames();
    assert.equal(await evaluate("!$('legendList').hidden"), true, '390 触控展开图例');
    const afterExpand = await evaluate(`(()=>{
      const title=document.querySelector('.legend-panel .rail-head h3');
      const tr=title.getBoundingClientRect();
      return {
        titleDisplay:getComputedStyle(title).display,
        titleW:tr.width, titleH:tr.height,
        listHidden:!!$('legendList').hidden
      };
    })()`);
    assert.notEqual(afterExpand.titleDisplay, 'none');
    assert.ok(afterExpand.titleW > afterExpand.titleH, '390 展开后标题应横排不竖排');
    const collapsePt = await evaluate(`(()=>{
      const b=$('toggleLegend'); const r=b.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await touchPoint(collapsePt);
    await frames();
    assert.equal(await evaluate("!!$('legendList').hidden"), true, '390 触控再折叠图例');
    await screenshot('rail-touch-390x844');

    // 日间地图真实点击走路（回到桌面视口）
    await size(1440, 900, false);
    await navigate();
    await siteFixture();
    await dayFixture();
    await evaluate('closeInspector(); game.mode=null; game.hero.goal=null; sync(); layoutHudChrome(); measureCameraViewport();');
    await frames();
    const mapHit = await evaluate(`(()=>{
      const t=tileAt(game.hero.x+2|0, game.hero.y|0) || tileAt(Math.floor(game.hero.x)+1, Math.floor(game.hero.y));
      const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
      const top=document.elementFromPoint(p.x,p.y);
      return {
        point:{x:p.x,y:p.y},
        clear:top===$('map')||top===$('board')||top===$('mapWorld'),
        top:top&&(top.id||top.tagName),
        hx:game.hero.x, hy:game.hero.y
      };
    })()`);
    assert.equal(mapHit.clear, true, '地图点击点不得被面板挡住, hit=' + mapHit.top);
    await clickPoint(mapHit.point);
    await frames();
    const walked = await evaluate('!!game.hero.goal || (Math.abs(game.hero.x-' + mapHit.hx + ')+Math.abs(game.hero.y-' + mapHit.hy + '))>0.01');
    assert.equal(walked, true, '真实地图点击应产生移动目标');
    evidence.mapClicks.push(mapHit);
    await screenshot('map-click-1440x900');

    // 三卡真实点击（桌面 + 手机）
    for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
      await size(w, h, mobile);
      await navigate();
      await siteFixture();
      await dayFixture();
      await evaluate(`(()=>{
        game.cardPending=true;
        game.cardChoices=CARDS.slice(0,3).map(c=>({key:c.key,label:c.label,info:c.info}));
        showCards(); sync();
      })()`);
      await frames();
      const hit = await evaluate(`(()=>{
        const b=document.querySelector('#cardRow button');
        if(!b) return {exists:false};
        const r=b.getBoundingClientRect();
        const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {
          exists:true,
          clickable:top===b||b.contains(top),
          point:{x:r.x+r.width/2,y:r.y+r.height/2},
          cardModal:!!game.cardModal
        };
      })()`);
      assert.equal(hit.exists, true);
      assert.equal(hit.clickable, true, w + 'x' + h + ' 卡牌必须可命中');
      await screenshot('cards-' + w + 'x' + h);
      if (mobile) await touchPoint(hit.point);
      else await clickPoint(hit.point);
      await frames();
      const selected = await evaluate('({pending:game.cardPending,modal:game.cardModal})');
      assert.equal(selected.pending, false, w + 'x' + h + ' 真实点击后应选中卡牌');
      assert.equal(selected.modal, false);
      evidence.cards.push({w, h, mobile, ...hit, selected});
    }

    assert.deepEqual(await evaluate('__pageErrors'), []);
    fs.writeFileSync(path.join(artifacts, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('v029 hud-occlusion browser OK → ' + artifacts);
    console.log('viewports=', evidence.viewports.map(v => ({
      wh: v.w + 'x' + v.h,
      siteDeck: Math.round(v.site.deckWidth),
      siteFree: +v.site.free.toFixed(3),
      dayFree: +v.day.free.toFixed(3),
      focus: v.day.focusClear,
      overlap: v.overlap
    })));
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
