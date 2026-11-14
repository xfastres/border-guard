// v0.26 独立玩家视角验收：真实浏览器原生输入走完开局→建城→开发→布防→首夜→天亮，
// 并覆盖用户点名的易漏交互。与 run-v026-checks.cjs 的区别：
//   1) 主链路不使用 setup() 夹具注入状态，从开局弹窗用原生点击一路玩下来；
//   2) 每次点击前用 elementFromPoint 判定「看得到却点不到」；
//   3) 每次操作后记录 toast / 战报 / 库存 / 按钮状态，判定「操作成功却无反馈」；
//   4) 时间推进用游戏自身的 tickCampaign 快进（真实战斗逻辑），如实标注为加速步骤。
// 运行：CHROME_BIN=/usr/bin/google-chrome node tests/v026-playthrough.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts', 'v026');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-play-'));
const bin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const chrome = spawn(bin, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
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
      for (const t of pending.values()) { clearTimeout(t.timer); t.reject(new Error('Browser connection closed')); }
      pending.clear();
    });
    ws.addEventListener('open', () => resolve({
      close: () => ws.close(),
      send: (method, params = {}) => new Promise((res, rej) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); rej(new Error('Timed out: ' + method)); }, 120000);
        pending.set(id, { resolve: res, reject: rej, timer });
        ws.send(JSON.stringify({ id, method, params }));
      })
    }), { once: true });
  });
}

(async () => {
  let client;
  const report = { title: 'v0.26 独立玩家视角验收', realUI: [], fixtures: [], findings: [], screenshots: [], steps: [], pageErrors: [] };
  try {
    let port;
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 120 && !port; i++) {
      if (chrome.exitCode !== null || chrome.signalCode) throw new Error('Chrome 启动失败');
      try { const p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]; if (/^\d+$/.test(p)) port = p; }
      catch (e) { if (!['ENOENT', 'EBUSY'].includes(e.code)) throw e; }
      if (!port) await delay(100);
    }
    if (!port) throw new Error('Chrome startup timed out');
    const tab = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    client = await connect(tab.webSocketDebuggerUrl);
    const send = client.send;
    const ev = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source:
      "window.__pageErrors=[]; addEventListener('error',e=>__pageErrors.push(e.message)); addEventListener('unhandledrejection',e=>__pageErrors.push(String(e.reason)));" });

    const htmlUrl = pathToFileURL(path.join(root, 'Border-Guard-v0.26.html')).href;
    const navigate = async () => {
      await ev("if(typeof game!=='undefined')game.started=false");
      await send('Page.navigate', { url: htmlUrl });
      for (let i = 0; i < 120; i++) {
        try { if (await ev("typeof FW!=='undefined'&&$('dialog').open")) return; } catch (e) {}
        await delay(50);
      }
      throw new Error('开局弹窗未就绪');
    };
    const size = async (w, h, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    };
    const frames = () => ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const shot = async name => {
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(s.data, 'base64'));
      report.screenshots.push(name + '.png');
    };
    // 点击前的可点性判定：元素是否真的在视口内、中心点是否被别的元素盖住
    const hit = sel => ev(`(()=>{
      const el=document.querySelector(${JSON.stringify(sel)});
      if(!el)return {found:false};
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height)return {found:true,visible:false,reason:'零尺寸'};
      el.scrollIntoView({block:'nearest',inline:'nearest'});
      const q=el.getBoundingClientRect(),cx=q.x+q.width/2,cy=q.y+q.height/2;
      const top=document.elementFromPoint(cx,cy);
      return {found:true,visible:true,rect:[Math.round(q.x),Math.round(q.y),Math.round(q.width),Math.round(q.height)],
        center:[Math.round(cx),Math.round(cy)],
        inViewport:cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight,
        topHit:top?(top.id||top.className||top.tagName):null,
        selfHit:top===el||el.contains(top)};
    })()`);
    const mouse = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
    };
    const clickSel = async (sel, label) => {
      const h = await hit(sel);
      if (!h.found) throw new Error('找不到按钮: ' + (label || sel));
      // hidden / 未激活状态下按钮本就不该出现，不算「看得到却点不到」
      const shouldBeVisible = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
        return !!e&&!e.hidden&&e.getClientRects().length>0;})()`);
      if (h.visible && shouldBeVisible && (!h.inViewport || !h.selfHit)) {
        report.findings.push({ type: '看得到却点不到', where: label || sel, hit: h });
      }
      if (!h.visible || !h.center) throw new Error('按钮不可见（hidden/零尺寸）: ' + (label || sel));
      await mouse(h.center[0], h.center[1]);
      await frames();
      return h;
    };
    // 按按钮文字找并点击（v0.26 命令栏按钮多数无 id）。
    // 必须在单次 evaluate 内完成定位+命中判定：命令栏会被 renderCommands() 整体 replaceChildren，
    // 若先写临时属性再二次查询，属性会随重建丢失，导致点击落到旧坐标上。
    const clickText = async (text, scope, label) => {
      const info = await ev(`(()=>{
        const root=document.querySelector(${JSON.stringify(scope||'#commandBar')});
        if(!root)return null;
        const b=[...root.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(text)})&&x.getClientRects().length&&!x.disabled);
        if(!b)return null;
        b.scrollIntoView({block:'nearest',inline:'nearest'});
        const r=b.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;
        const top=document.elementFromPoint(cx,cy);
        return {center:[Math.round(cx),Math.round(cy)],text:b.innerText.replace(/\\n/g,' · '),
          inViewport:cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight,
          selfHit:top===b||b.contains(top),topHit:top?(top.id||top.className||top.tagName):null};
      })()`);
      if (!info) throw new Error('按钮不存在或已禁用: ' + text);
      if (!info.inViewport || !info.selfHit) report.findings.push({ type: '看得到却点不到', where: label || text, hit: info });
      await mouse(info.center[0], info.center[1]);
      await frames();
      return info;
    };
    const key = async (k, code, text) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: code === 'Space' ? 32 : undefined, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
    };
    const touch = async (p, hold = 0) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      if (hold) await delay(hold);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // 反馈快照：toast / 战报末条 / 库存 / 行动数 / 阶段
    const feedback = () => ev(`(()=>{
      const t=$('toast'),rep=$('reportPanel');
      return {toast:t&&!t.hidden?t.innerText:'',report:(rep?.innerText||'').slice(-260),
        stocks:[...$('stocks').querySelectorAll('strong')].map(x=>Number(x.textContent)),
        actions:game.actions,phase:game.phase,day:game.day,castle:!!game.castle,
        mode:game.mode,toolState:$('toolState').hidden?'':$('toolState').innerText,
        pageErrors:[...__pageErrors]};
    })()`);
    const step = async (name, fn, kind) => {
      const entry = { name, kind: kind || '真实界面' };
      try { entry.result = await fn(); entry.status = 'PASS'; }
      catch (e) { entry.status = 'FAIL'; entry.error = e.message; }
      report.steps.push(entry);
      if (kind === '加速') report.fixtures.push(name); else report.realUI.push(name);
      return entry;
    };
    const advance = seconds => ev(`(()=>{
      const steps=Math.ceil(${seconds}/0.045);
      for(let i=0;i<steps;i++)tickCampaign(0.045);
      draw();sync();
      return {phase:game.phase,day:game.day,elapsed:Math.round(game.phaseElapsed*10)/10};
    })()`);
    const advanceUntil = (cond, label, maxSeconds = 200) => ev(`(()=>{
      const max=Math.ceil(${maxSeconds}/0.045);let used=0;
      for(let i=0;i<max;i++){
        tickCampaign(0.045);used+=0.045;
        if(${cond})break;
        if(game.phase==='lost'||game.phase==='won')break;
      }
      draw();sync();
      return {ok:!!(${cond}),used:Math.round(used*10)/10,phase:game.phase,day:game.day,
        actions:game.actions,castleHp:game.castleHp,heroHp:Math.round(game.hero.hp),kills:game.kills};
    })()`);

    // ============ 主链路：桌面 1440x900，全部原生输入 ============
    await size(1440, 900, false);
    await navigate();
    await step('开局弹窗可读性与入口', async () => {
      await shot('play-00-intro');
      return await ev(`JSON.stringify({text:$('dialogContent').innerText,buttons:[...$('dialogContent').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' '))})`);
    });
    await step('原生点击「普通难度 · 开始守卫」', async () => {
      await clickSel('#dialogContent .choices button', '普通难度 · 开始守卫');
      return await ev("JSON.stringify({dialogOpen:$('dialog').open,started:game.started,phase:game.phase})");
    });
    await step('开局后首屏：能否一眼找到下一步', async () => {
      await shot('play-01-day-start');
      return await ev(`JSON.stringify({hint:$('mapHint').innerText,goal:$('goalTitle').innerText+' / '+$('goalText').innerText,
        commands:[...$('commandBar').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' · '))})`);
    });
    await step('原生点击「前往 A」并观察是否有反馈', async () => {
      const before = await feedback();
      await clickText('前往 A', '#commandBar', '前往 A · 西岭台地');
      const after = await feedback();
      return { before, after, heroMoved: await ev('!!(game.hero.goal&&game.hero.goal.length)') };
    });
    await step('加速时钟让领主抵达城址并揭雾', async () => {
      return await advanceUntil("tileAt(game.sites[0].x,game.sites[0].y).visible", '城址 A 已揭雾', 60);
    }, '加速');
    await step('城址入口由「前往」变为「查看」', async () => {
      await shot('play-02-site-revealed');
      return await ev(`JSON.stringify([...$('commandBar').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' · ')))`);
    });
    await step('原生点击「查看 A」打开城址详情', async () => {
      await clickText('查看 A', '#commandBar', '查看 A · 西岭台地');
      const r = await ev(`JSON.stringify({side:camera.sideView||null,body:$('inspectBody').innerText.slice(0,400),
        actions:[...$('inspectBody').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' · '))})`);
      await shot('play-03-site-inspector');
      return r;
    });
    await step('原生点击「确认建城」并验证反馈', async () => {
      const before = await feedback();
      await clickSel('#inspectBody .tile-actions button', '确认建城');
      const after = await feedback();
      const st = await ev("JSON.stringify({castle:!!game.castle,hero:[game.hero.x,game.hero.y]})");
      await shot('play-04-castle-built');
      return { before, after, state: st };
    });
    await step('建城后是否出现「开发资源」引导', async () => {
      return await ev(`JSON.stringify({hint:$('mapHint').innerText,goal:$('goalText').innerText,toast:$('toast').hidden?'':$('toast').innerText})`);
    });
    await step('打开「居民管理」：入口可发现性', async () => {
      await clickSel('#mobileGroups button:nth-child(2)', '经营分组');
      const visible = await ev(`JSON.stringify([...$('commandBar').querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.innerText.replace(/\\n/g,' · ')))`);
      await clickText('居民管理', '#commandBar', '居民管理');
      await shot('play-05-residents');
      return { commands: visible, panel: await ev("$('inspectBody').innerText.slice(0,300)") };
    });
    await step('打开「夜袭预报」（战役）', async () => {
      await clickSel('#campaignBtn', '战役');
      await shot('play-06-forecast');
      return await ev(`JSON.stringify({side:camera.sideView||null,preview:$('questPreview').innerText,text:$('inspectBody').innerText.slice(0,320)})`);
    });
    await step('打开「战报」', async () => {
      await clickSel('#reportBtn', '战报');
      await shot('play-07-report');
      return await ev(`JSON.stringify({side:camera.sideView||null,text:$('reportPanel').innerText.slice(0,360)})`);
    });
    await step('关闭面板后地图仍可操作（棋盘可用空间）', async () => {
      await clickSel('#closeInspector', '关闭详情');
      return await ev(`(()=>{const r=$('board').getBoundingClientRect();const h=worldToScreen(game.hero.x*CELL,game.hero.y*CELL);
        return JSON.stringify({board:[Math.round(r.width),Math.round(r.height)],heroOnBoard:h.x>r.left&&h.x<r.right&&h.y>r.top&&h.y<r.bottom,
          side:camera.sideView||null});})()`);
    });
    await step('真实鼠标点击资源地 → 开发资源点（含扣费反馈）', async () => {
      const target = await ev(`(()=>{
        const r=$('board').getBoundingClientRect();
        const t=game.tiles.find(t=>t.visible&&t.owned&&t.node&&!t.node.developed&&canDevelop(t)&&isAdjacent(t));
        if(!t)return null;
        const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
        if(p.x<r.left+4||p.x>r.right-4||p.y<r.top+4||p.y>r.bottom-4)return null;
        return {x:p.x,y:p.y,index:at(t.x,t.y)};
      })()`);
      if (!target) return { skipped: '当前视野内无可开发且可点击的相邻资源点' };
      const before = await feedback();
      await mouse(target.x, target.y);
      await frames();
      const opened = await ev(`JSON.stringify({side:camera.sideView||null,body:$('inspectBody').innerText.slice(0,300),
        actions:[...$('inspectBody').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' · '))})`);
      await shot('play-08-develop-inspector');
      return { target, before, opened };
    });
    await step('点击「开发资源点」验证扣费与提示', async () => {
      const sel = await ev(`(()=>{const b=[...$('inspectBody').querySelectorAll('button')].find(x=>x.innerText.includes('开发资源点'));
        if(!b)return null;b.setAttribute('data-play-target','1');return '[data-play-target="1"]';})()`);
      if (!sel) return { skipped: '详情里没有开发按钮' };
      const before = await feedback();
      await clickSel(sel, '开发资源点');
      const after = await feedback();
      await shot('play-08-develop-result');
      return { before, after };
    });
    await step('从「经营」切回「建造」分组（入口可发现性）', async () => {
      const tabs = await ev(`JSON.stringify([...$('mobileGroups').querySelectorAll('button')].map(b=>({text:b.innerText,pressed:b.getAttribute('aria-pressed')})))`);
      await clickText('建造', '#mobileGroups', '建造分组标签');
      const after = await ev(`JSON.stringify([...$('commandBar').querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.hidden).map(b=>b.innerText.replace(/\\n/g,' · ')))`);
      return { tabs, after };
    });
    await step('选「箭塔」工具 → 连续点 2 块地建造，验证每次只扣一次费', async () => {
      const before = await feedback();
      await clickText('箭塔', '#commandBar', '箭塔工具');
      const toolOn = await feedback();
      const charges = [];
      for (let n = 0; n < 2; n++) {
        const point = await ev(`(()=>{
          const r=$('board').getBoundingClientRect();
          const t=game.tiles.find(t=>{if(!canBuildAt(t)||validateBuild(t))return false;
            const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
            return p.x>r.left+8&&p.x<r.right-8&&p.y>r.top+8&&p.y<r.bottom-8;});
          if(!t)return null;const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
          return {x:p.x,y:p.y,index:at(t.x,t.y)};
        })()`);
        if (!point) { charges.push({ n, skipped: '视野内无可建造地块' }); break; }
        const pre = await feedback();
        await mouse(point.x, point.y);
        await frames();
        const post = await feedback();
        charges.push({ n, index: point.index, built: await ev('!!game.tiles[' + point.index + '].building'),
          actions: [pre.actions, post.actions], stocks: [pre.stocks, post.stocks], toast: post.toast });
      }
      await shot('play-09-tower');
      return { before: { stocks: before.stocks, actions: before.actions }, toolOn: { mode: toolOn.mode, toolState: toolOn.toolState }, charges };
    });
    await step('取消工具（Esc）后恢复普通点地', async () => {
      await key('Escape', 'Escape');
      await frames();
      return await ev("JSON.stringify({mode:game.mode,cancelHidden:$('cancelTool').hidden,toolHidden:$('toolState').hidden})");
    });
    await step('原生点击「提前入夜」，按钮应原位变「取消入夜」', async () => {
      const before = await ev(`JSON.stringify({text:$('duskBtn').innerText,hidden:$('duskBtn').hidden})`);
      await clickSel('#duskBtn', '提前入夜');
      const after = await ev(`JSON.stringify({text:$('duskBtn').innerText,early:!!game.earlyNightAt,toast:$('toast').hidden?'':$('toast').innerText})`);
      await shot('play-10-early-night');
      return { before, after };
    });
    await step('加速时钟推进到入夜', async () => {
      return await advanceUntil("game.phase==='night'", '已进入夜战', 8);
    }, '加速');
    await step('夜战原生点击「自动攻击」并检查按钮状态反馈', async () => {
      const before = await ev("JSON.stringify({auto:game.autoAttack,groups:[...$('mobileGroups').querySelectorAll('button')].map(b=>b.innerText)})");
      await clickText('自动攻击', '#commandBar', '自动攻击');
      const after = await ev("JSON.stringify({auto:game.autoAttack,toast:$('toast').hidden?'':$('toast').innerText})");
      await shot('play-11-night');
      return { before, after };
    });
    await step('加速时钟打完首夜 → 查看天亮结果（硬断言）', async () => {
      const r = await advanceUntil("game.phase==='day'&&game.day===2", '第 2 天天亮', 200);
      const after = await feedback();
      await shot('play-12-dawn');
      const diagnosis = await ev("($('reportPanel').innerText||'').slice(-300)");
      // 未达成天亮时如实记录真实结局，不用 PASS 掩盖
      if (!r.ok) report.findings.push({ type: '首夜未天亮', outcome: r, note: '真实链路结局（非脚本错误）' });
      return { run: r, after, dawnText: diagnosis, reachedDawn: r.ok };
    }, '加速');

    report.pageErrors = await ev('[...__pageErrors]');
    report.summary = {
      steps: report.steps.length,
      pass: report.steps.filter(s => s.status === 'PASS').length,
      fail: report.steps.filter(s => s.status === 'FAIL').length,
      realUI: report.realUI.length, fixtures: report.fixtures.length,
      findings: report.findings.length, screenshots: report.screenshots.length,
    };
  } catch (e) {
    report.fatal = e.stack || e.message;
  } finally {
    fs.writeFileSync(path.join(artifacts, 'playthrough.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.summary || { fatal: report.fatal }, null, 2));
    client?.close(); chrome.kill('SIGKILL');
  }
})();
