// v0.26 易漏交互专项验收：原生输入 + 明确标注的预设状态夹具。
// 覆盖用户点名的 6 组优先项，以及 320x568 长详情+工具、844x390 夜战支援与结算。
// 运行：CHROME_BIN=/usr/bin/google-chrome node tests/v026-edge-cases.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts', 'v026');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-edge-'));
const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
const delay = ms => new Promise(r => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let nextId = 0;
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data), t = pending.get(m.id);
      if (!t) return;
      clearTimeout(t.timer); pending.delete(m.id);
      m.error ? t.reject(new Error(m.error.message)) : t.resolve(m.result);
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
  const report = { title: 'v0.26 易漏交互专项验收', cases: [], findings: [], screenshots: [], realUI: [], fixtures: [] };
  try {
    let port;
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 120 && !port; i++) {
      if (chrome.exitCode !== null || chrome.signalCode) throw new Error('Chrome 启动失败');
      try { const p = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]; if (/^\d+$/.test(p)) port = p; }
      catch (e) { if (!['ENOENT', 'EBUSY'].includes(e.code)) throw e; }
      if (!port) await delay(100);
    }
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
      "window.__pageErrors=[];addEventListener('error',e=>__pageErrors.push(e.message));addEventListener('unhandledrejection',e=>__pageErrors.push(String(e.reason)));" });
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
    // 夹具：固定种子 + 建城 + 全揭雾。注意 canUsePlayMap() 要求 !paused，
    // 手势用例必须保持时钟运行；只有纯布局测量才单独传 paused=true。
    const setup = extra => ev(`(()=>{
      $('dialog').close();game=makeGame(42);game.started=true;introDone=true;paused=false;keys.clear();
      game.settings.sound=false;for(const t of game.tiles)t.visible=true;
      chooseSite(0);closeInspector();centerOnHero();
      clearTimeout(toastTimer);$('toast').hidden=true;
      ${extra || ''}
      sync();
    })()`);
    const mouse = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
    };
    const clickSel = async sel => {
      const p = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
        if(!e||!e.getClientRects().length)throw Error('看不见 '+${JSON.stringify(sel)});
        e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();
        return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height,
          hit:(()=>{const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t===e||e.contains(t);})()};})()`);
      if (!p.hit) report.findings.push({ type: '看得到却点不到', where: sel, rect: [p.w, p.h] });
      await mouse(p.x, p.y); await frames();
      return p;
    };
    const clickText = async (text, scope) => {
      const p = await ev(`(()=>{const root=document.querySelector(${JSON.stringify(scope || '#commandBar')});
        if(!root)return null;
        const b=[...root.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(text)})&&x.getClientRects().length&&!x.disabled);
        if(!b)return null;b.scrollIntoView({block:'nearest',inline:'nearest'});
        const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),text:b.innerText.replace(/\\n/g,' · ')};})()`);
      if (!p) throw new Error('按钮不存在或已禁用: ' + text);
      await mouse(p.x, p.y); await frames();
      return p;
    };
    const touch = async (points, hold = 0, move) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      if (move) {
        for (const m of move) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: m }); await delay(16); }
      }
      if (hold) await delay(hold);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const key = async (k, code, text) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: code === 'Space' ? 32 : undefined, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
    };
    // 直接返回对象（Runtime.evaluate returnByValue），不要再包 JSON.stringify，否则调用方拿到的是字符串
    const state = () => ev(`({phase:game.phase,day:game.day,mode:game.mode,side:camera.sideView||null,
      actions:game.actions,stocks:[...$('stocks').querySelectorAll('strong')].map(x=>Number(x.textContent)),
      castleHp:game.castleHp,heroHp:Math.round(game.hero.hp),gold:game.resources.gold,
      paused:paused,dialog:$('dialog').open,toast:$('toast').hidden?'':$('toast').innerText,
      pageErrors:[...__pageErrors]})`);
    const advanceUntil = (cond, maxSeconds = 200) => ev(`(()=>{
      const max=Math.ceil(${maxSeconds}/0.045);let used=0;
      for(let i=0;i<max;i++){tickCampaign(0.045);used+=0.045;
        if(${cond})break;if(game.phase==='lost'||game.phase==='won')break;}
      draw();sync();
      return {ok:!!(${cond}),used:Math.round(used*10)/10,phase:game.phase,day:game.day,
        castleHp:game.castleHp,heroHp:Math.round(game.hero.hp),kills:game.kills,gold:game.resources.gold};})()`);
    const check = async (name, kind, fn) => {
      const c = { name, kind, status: 'PASS' };
      try { c.result = await fn(); }
      catch (e) { c.status = 'FAIL'; c.error = e.message; }
      report.cases.push(c);
      (kind === '夹具' ? report.fixtures : report.realUI).push(name);
      return c;
    };
    const assertNoErrors = async () => {
      const errs = await ev('[...__pageErrors]');
      assert.deepEqual(errs, [], '页面异常: ' + JSON.stringify(errs));
    };

    // ========== A. 夹具补跑：布防充分 → 打完首夜 → 天亮结果 ==========
    await size(1440, 900, false);
    await navigate();
    await check('预设状态夹具：同种子 42 充分布防', '夹具', async () => {
      return await ev(`(()=>{
        $('dialog').close();game=makeGame(42);game.started=true;introDone=true;paused=false;keys.clear();
        game.settings.sound=false;for(const t of game.tiles)t.visible=true;
        chooseSite(0);game.autoAttack=true;
        const c=game.castle;
        const spots=game.tiles.filter(t=>t.owned&&canBuildAt(t)&&!t.node)
          .sort((a,b)=>(Math.abs(a.x-c.x)+Math.abs(a.y-c.y))-(Math.abs(b.x-c.x)+Math.abs(b.y-c.y)));
        let built=0;for(const t of spots){if(built>=4||game.actions<=0||!canPay(BUILDS.tower.cost))break;
          if(distance(center(t),game.hero)<.9)continue;build(t,'tower');if(t.building)built++;}
        closeInspector();centerOnHero();sync();
        return JSON.stringify({seed:42,towers:game.tiles.filter(t=>t.building?.type==='tower').length,
          actions:game.actions,stocks:[...$('stocks').querySelectorAll('strong')].map(x=>Number(x.textContent))});
      })()`);
    });
    await check('原生点击「提前入夜」→ 加速到夜战', '真实界面+加速', async () => {
      await clickSel('#duskBtn');
      const early = await ev("JSON.stringify({text:$('duskBtn').innerText,early:!!game.earlyNightAt})");
      const r = await advanceUntil("game.phase==='night'", 8);
      return { early, night: r };
    });
    await check('布防充分 → 打完首夜 → 查看天亮结果（夹具）', '夹具', async () => {
      const r = await advanceUntil("game.phase==='day'&&game.day===2", 200);
      const s = await state();
      await shot('edge-01-dawn-day2');
      assert.equal(r.ok, true, '未能天亮: ' + JSON.stringify(r));
      assertNoErrors();
      return { run: r, state: s, report: await ev("($('reportPanel').innerText||'').slice(-260)") };
    });

    // ========== B. 手机建造手势：短按/长按/拖动/工具/多指/切工具/入夜 ==========
    await size(390, 844, true);
    await navigate();
    await check('触屏夹具：固定种子、建城、揭雾、暂停时钟', '夹具', async () => {
      await setup();
      return await state();
    });
    const boardCenter = async () => ev(`(()=>{const r=$('board').getBoundingClientRect();
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),left:r.left,top:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height};})()`);
    await check('普通短按：只移动，不扣费、不打开详情', '真实界面', async () => {
      const c = await boardCenter();
      const before = await state();
      await touch([{ x: c.x, y: c.y, id: 1 }]);
      await frames();
      const after = await state();
      assert.equal(after.side, null, '短按不应打开详情');
      assert.deepEqual(after.stocks, before.stocks, '短按不应扣费');
      return { before, after };
    });
    await check('长按：只查看地点，不扣费、不清除路线', '真实界面', async () => {
      const c = await boardCenter();
      const before = await state();
      await touch([{ x: c.x, y: c.y, id: 1 }], 420);
      await frames();
      const after = await state();
      assert.equal(after.side, 'inspect', '长按应打开详情');
      assert.deepEqual(after.stocks, before.stocks, '长按不应扣费');
      await clickSel('#closeInspector');
      return { before, after };
    });
    await check('拖动：只平移相机，不打开详情、不扣费', '真实界面', async () => {
      const c = await boardCenter();
      const before = await state();
      await touch([{ x: c.x, y: c.y, id: 1 }], 0, [
        [{ x: c.x + 30, y: c.y + 10, id: 1 }], [{ x: c.x + 60, y: c.y + 20, id: 1 }],
        [{ x: c.x + 90, y: c.y + 25, id: 1 }]
      ]);
      await frames();
      const after = await state();
      const cameraMode = await ev('camera.mode');
      assert.equal(after.side, null, '拖动不应打开详情');
      assert.deepEqual(after.stocks, before.stocks, '拖动不应扣费');
      assert.equal(cameraMode, 'manual', '拖动应切换为手动相机');
      return { before, after, cameraMode };
    });
    await check('选工具后点地：只执行一次、只扣一次费', '真实界面', async () => {
      await setup();
      await clickText('箭塔', '#commandBar');
      const tile = await ev(`(()=>{const r=$('board').getBoundingClientRect();
        const t=game.tiles.find(t=>{if(!canBuildAt(t)||validateBuild(t))return false;
          const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
          return p.x>r.left+8&&p.x<r.right-8&&p.y>r.top+8&&p.y<r.bottom-8;});
        if(!t)return null;const p=worldToScreen((t.x+.5)*CELL,(t.y+.5)*CELL);
        return {x:p.x,y:p.y,index:at(t.x,t.y)};})()`);
      if (!tile) throw new Error('无可建地块');
      const before = await state();
      await touch([{ x: tile.x, y: tile.y, id: 1 }]);
      await frames();
      const after = await state();
      const built = await ev('!!game.tiles[' + tile.index + '].building');
      assert.equal(built, true, '工具未放置');
      assert.equal(before.actions - after.actions, 1, '应只消耗 1 次行动');
      assert.equal(before.stocks[1] - after.stocks[1], 10, '应只扣 10 材料');
      assert.equal(before.stocks[0] - after.stocks[0], 4, '应只扣 4 金币');
      return { before, after, tile, built };
    });
    await check('拖动地图不会把旧手势变成一次工具扣费', '真实界面', async () => {
      const c = await boardCenter();
      const before = await state();
      await touch([{ x: c.x, y: c.y, id: 1 }], 0, [
        [{ x: c.x + 40, y: c.y, id: 1 }], [{ x: c.x + 80, y: c.y, id: 1 }]
      ]);
      await frames();
      const after = await state();
      assert.deepEqual(after.stocks, before.stocks, '拖动不应扣费');
      assert.equal(after.actions, before.actions, '拖动不应消耗行动');
      return { before, after };
    });
    await check('第二根手指（多指）不触发工具扣费', '真实界面', async () => {
      const c = await boardCenter();
      const before = await state();
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }, { x: c.x + 40, y: c.y + 20, id: 2 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frames();
      const after = await state();
      assert.deepEqual(after.stocks, before.stocks, '多指不应扣费');
      return { before, after };
    });
    await check('切换分组（切工具）清空待执行手势，不误扣费', '真实界面', async () => {
      const before = await state();
      await clickText('经营', '#mobileGroups');
      const after = await state();
      assert.equal(after.mode, null, '切分组应清空工具');
      assert.deepEqual(after.stocks, before.stocks, '切分组不应扣费');
      return { before, after, groups: await ev("JSON.stringify([...$('mobileGroups').querySelectorAll('button')].map(b=>b.innerText))") };
    });
    await check('入夜不会把旧手势变成一次扣费', '真实界面', async () => {
      const before = await state();
      const r = await ev(`(()=>{paused=false;startNight();sync();
        return JSON.stringify({phase:game.phase,mode:game.mode});})()`);
      const after = await state();
      assert.deepEqual(after.stocks, before.stocks, '入夜不应扣费');
      assert.equal(after.mode, null, '入夜应清空工具');
      return { before, after, night: r };
    });

    // ========== C. 夜战支援：可用性、余额、恢复量、快速连点 ==========
    await size(844, 390, true);
    await navigate();
    await check('横屏 844x390 夜战夹具（城堡/领主受伤、余额充足）', '夹具', async () => {
      // 冻结时钟：否则 tickCampaign 会推进夜次/结算，导致支援按钮被重建
      await setup(`game.phase='night';game.day=1;game.castleHp=game.castleMax-40;game.hero.hp=game.hero.max-30;
        game.resources.gold=30;game.mobileGroup='support';paused=true;`);
      return await state();
    });
    await check('受伤状态下急修/药剂自行变为可用', '真实界面', async () => {
      const b = await ev(`JSON.stringify({repair:$('quickRepair').disabled,potion:$('quickPotion').disabled,
        repairText:$('quickRepair').innerText.replace(/\\n/g,' · '),potionText:$('quickPotion').innerText.replace(/\\n/g,' · ')})`);
      await shot('edge-02-support-844x390');
      const o = JSON.parse(b);
      assert.equal(o.repair, false, '城堡受伤时急修应可用');
      assert.equal(o.potion, false, '领主受伤时药剂应可用');
      return o;
    });
    await check('满血/满耐久时按钮禁用且给出理由', '真实界面', async () => {
      await ev(`game.castleHp=game.castleMax;game.hero.hp=game.hero.max;sync();`);
      const b = await ev(`JSON.stringify({repair:$('quickRepair').disabled,potion:$('quickPotion').disabled,
        repairDetail:$('quickRepair').lastElementChild.textContent,potionDetail:$('quickPotion').lastElementChild.textContent})`);
      const o = JSON.parse(b);
      assert.equal(o.repair, true, '满耐久应禁用急修');
      assert.equal(o.potion, true, '满血应禁用药剂');
      assert.ok(o.repairDetail.includes('已满'), '急修应说明「耐久已满」');
      assert.ok(o.potionDetail.includes('已满'), '药剂应说明「生命已满」');
      return o;
    });
    await check('余额不足时禁用且提示原因', '真实界面', async () => {
      await ev(`game.castleHp=game.castleMax-40;game.hero.hp=game.hero.max-30;game.resources.gold=0;sync();`);
      return await ev(`JSON.stringify({repair:$('quickRepair').disabled,potion:$('quickPotion').disabled,
        repairTitle:$('quickRepair').title,potionTitle:$('quickPotion').title,gold:game.resources.gold})`);
    });
    await check('恢复量小于上限时提示实际恢复量', '真实界面', async () => {
      await ev(`game.resources.gold=30;game.castleHp=game.castleMax-3;game.hero.hp=game.hero.max-2;sync();`);
      const before = await state();
      await clickSel('#quickRepair');
      const after = await state();
      await clickSel('#quickPotion');
      const final = await state();
      return { before, afterRepair: after, afterPotion: final,
        repairToast: after.toast, potionToast: final.toast };
    });
    await check('快速连点：每次成功点击恰好扣 5 金、恢复 18 耐久，禁用后不再扣费', '真实界面', async () => {
      await ev(`game.castleHp=game.castleMax-80;game.hero.hp=game.hero.max-60;game.resources.gold=30;sync();`);
      const before = await state();
      const results = [];
      for (let i = 0; i < 4; i++) {
        const p = await ev(`(()=>{const e=$('quickRepair');if(!e||e.hidden||e.disabled)return null;
          const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
        const pre = { gold: (await state()).gold, hp: await ev('game.castleHp') };
        if (!p) { results.push({ i, skipped: '按钮已禁用/隐藏', pre }); continue; }
        await mouse(p.x, p.y);
        const post = { gold: (await state()).gold, hp: await ev('game.castleHp') };
        results.push({ i, pre, post, dGold: pre.gold - post.gold, dHp: post.hp - pre.hp });
      }
      const after = await state();
      const executed = results.filter(r => !r.skipped);
      for (const r of executed) {
        assert.equal(r.dGold, 5, '第 ' + r.i + ' 次应恰好扣 5 金');
        assert.equal(r.dHp, 18, '第 ' + r.i + ' 次应恰好恢复 18 耐久');
      }
      const spent = before.gold - after.gold;
      assert.equal(spent, executed.length * 5, '总扣费应等于成功执行次数 × 5');
      return { before: { gold: before.gold, castleHp: before.castleHp }, after: { gold: after.gold, castleHp: after.castleHp },
        spent, executions: executed.length, results };
    });

    // ========== D. 暂停与焦点 ==========
    await size(1440, 900, false);
    await navigate();
    await check('暂停：时钟停住，底层按钮不可聚焦，恢复后归还', '真实界面', async () => {
      await setup('paused=false;');
      const t0 = await ev('game.phaseElapsed');
      await clickSel('#pauseBtn');
      const t1 = await ev('game.phaseElapsed');
      await delay(220);
      const t2 = await ev('game.phaseElapsed');
      const inert = await ev(`JSON.stringify({overlay:!$('pauseOverlay').hidden,
        focusables:[...document.querySelectorAll('#commandBar button,#board')].filter(e=>!e.disabled&&e.tabIndex>=0).length})`);
      await shot('edge-03-paused');
      await clickSel('#resumeBtn');
      const t3 = await ev('game.phaseElapsed');
      assert.equal(t1, t2, '暂停期间时钟不应推进');
      return { t0, t1, t2, t3, inert };
    });
    await check('焦点在按钮上：空格激活按钮而非地图攻击', '真实界面', async () => {
      await setup('paused=false;game.phase="night";game.day=1;sync();');
      const before = await ev(`JSON.stringify({auto:game.autoAttack,active:document.activeElement?.id||document.activeElement?.tagName})`);
      await ev(`$('reportBtn').focus();`);
      await key(' ', 'Space', ' ');
      await frames();
      const after = await ev(`JSON.stringify({side:camera.sideView||null,auto:game.autoAttack})`);
      return { before, after };
    });
    await check('焦点在地图：空格用于攻击', '真实界面', async () => {
      await setup(`paused=false;game.phase='night';game.day=1;sync();`);
      await ev(`canvas.focus({preventScroll:true});`);
      const before = await ev(`JSON.stringify({active:document.activeElement?.id,cooldown:game.hero.cooldown})`);
      await key(' ', 'Space', ' ');
      await frames();
      const after = await ev(`JSON.stringify({cooldown:game.hero.cooldown,swing:!!game.hero.swingT,attacks:game.hero.attackCount||null})`);
      return { before, after };
    });
    await check('点地图关闭菜单：首击只关菜单，不执行地图命令', '真实界面', async () => {
      await setup('paused=false;');
      await clickSel('#settingsBtn');
      const opened = await ev(`JSON.stringify({menu:!$('settingsMenu').hidden})`);
      const c = await boardCenter();
      const before = await state();
      await mouse(c.x, c.y);
      await frames();
      const after = await state();
      const closed = await ev(`JSON.stringify({menu:!$('settingsMenu').hidden})`);
      assert.deepEqual(after.stocks, before.stocks, '首击不应扣费');
      return { opened, closed, before, after };
    });

    // ========== E. 战役信息：双线预警+待选强化、战报实时、滚动稳定 ==========
    await check('战役面板：夜袭预报与军令入口同时可见', '真实界面', async () => {
      await setup('paused=false;');
      await clickSel('#campaignBtn');
      const r = await ev(`JSON.stringify({side:camera.sideView||null,preview:$('questPreview').innerText,
        sections:[...$('inspectBody').querySelectorAll('h3,summary,button')].map(e=>e.innerText||e.textContent).slice(0,14),
        questButtons:[...$('questChoices').querySelectorAll('button')].map(b=>b.innerText.replace(/\\n/g,' · '))})`);
      await shot('edge-04-campaign');
      return r;
    });
    await check('打开战报后新事件及时出现', '真实界面', async () => {
      await clickSel('#reportBtn');
      const before = await ev(`JSON.stringify({count:$('reportPanel').querySelectorAll('li').length,text:$('reportPanel').innerText.slice(0,120)})`);
      await ev(`report('验收注入的新事件，用于验证战报实时刷新。',true);sync();`);
      const after = await ev(`JSON.stringify({count:$('reportPanel').querySelectorAll('li').length,text:$('reportPanel').innerText.slice(0,160)})`);
      const o1 = JSON.parse(before), o2 = JSON.parse(after);
      assert.ok(o2.text.includes('验收注入的新事件'), '新事件应出现在战报');
      return { before: o1, after: o2 };
    });
    await check('详情刷新时阅读内容与命令栏滚动位置保持稳定', '真实界面', async () => {
      await setup('paused=false;');
      await clickSel('#campaignBtn');
      const panel = await ev(`JSON.stringify({scroll:$('playSide').scrollTop,bar:$('commandBar').scrollLeft})`);
      await ev(`$('playSide').scrollTop=60;$('commandBar').scrollLeft=40;`);
      const set = await ev(`JSON.stringify({scroll:$('playSide').scrollTop,bar:$('commandBar').scrollLeft})`);
      await ev(`report('刷新压力事件 A',true);report('刷新压力事件 B',true);sync();`);
      const after = await ev(`JSON.stringify({scroll:$('playSide').scrollTop,bar:$('commandBar').scrollLeft})`);
      return { panel, set, after };
    });

    // ========== F. 胜败与重开 ==========
    await check('首领胜利演出期间旧命令不会误触发', '夹具', async () => {
      await setup(`paused=false;game.phase='night';game.day=5;game.isBoss=true;game.spawnStopped=true;sync();`);
      const before = await ev(`JSON.stringify({gold:game.resources.gold,phase:game.phase})`);
      const r = await ev(`(()=>{beginVictoryPresentation();sync();return JSON.stringify({presentation:!!game.presentation,phase:game.phase});})()`);
      // 演出期间点旧命令按钮（建造组此时应已隐藏/不可交互）
      const after = await ev(`JSON.stringify({gold:game.resources.gold,barHidden:$('commandBar').hidden,
        buttons:[...$('commandBar').querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.hidden).length})`);
      await shot('edge-05-victory-presentation');
      return { before, presentation: r, after };
    });
    await check('胜利卡可移动、复盘与重开可达', '夹具', async () => {
      const r = await ev(`(()=>{
        game.presentation=null;game.phase='won';game.day=5;sync();
        const card=$('victoryCard'),a=card.getBoundingClientRect();
        return JSON.stringify({visible:!!card.getClientRects().length,rect:[a.x,a.y,a.width,a.height],
          gears:['victoryNew','victoryReport','victoryNights','victoryHandle'].map(id=>[id,!!$(id)?.getClientRects().length])});
      })()`);
      await shot('edge-06-victory-1440x900');
      return r;
    });
    await check('重开后无残留工具/面板/旧手势', '真实界面', async () => {
      // 先退出胜利态回到可操作阶段，再制造残留状态
      await ev(`game.phase='day';game.day=1;game.mode='tower';openInspector(game.castle);sync();`);
      const before = await ev(`JSON.stringify({mode:game.mode,side:camera.sideView||null})`);
      await clickSel('#settingsBtn');            // 重开按钮在菜单内，先展开
      await clickSel('#resetBtn');
      await frames();
      const confirm = await ev(`JSON.stringify({dialog:$('dialog').open,choices:[...$('dialogContent').querySelectorAll('button')].map(b=>b.innerText)})`);
      if (JSON.parse(confirm).dialog) await clickSel('#dialogContent .choices button'); // 白天重开有二次确认
      await frames();
      const after = await ev(`JSON.stringify({mode:game.mode,side:camera.sideView||null,
        dialog:$('dialog').open,inspectHidden:$('inspectPanel').hidden,toolHidden:$('toolState').hidden,
        menuHidden:$('settingsMenu').hidden})`);
      const o = JSON.parse(after);
      assert.equal(o.mode, null, '重开应清空工具');
      assert.equal(o.side, null, '重开应关闭详情');
      return { before, confirm, after: o };
    });
    await check('失败原因与当局真实情况相符', '夹具', async () => {
      const r = await ev(`(()=>{
        game=makeGame(42);game.started=true;introDone=true;paused=true;for(const t of game.tiles)t.visible=true;
        chooseSite(0);game.phase='night';game.day=1;game.castleHp=0;sync();
        const d=failureDiagnosis();return JSON.stringify({diagnosis:d,castleHp:game.castleHp,castle:!!game.castle});
      })()`);
      await shot('edge-07-defeat');
      return r;
    });

    // ========== G. 320x568 长详情 + 选中工具（点名组合） ==========
    await size(320, 568, true);
    await navigate();
    await check('320x568 打开长详情并选中工具：按钮可点、地图仍可见', '真实界面', async () => {
      await setup();
      await clickSel('#campaignBtn');
      const detail = await ev(`JSON.stringify({side:camera.sideView||null,sideRect:(()=>{const r=$('playSide').getBoundingClientRect();return [r.y,r.height];})(),
        board:(()=>{const r=$('board').getBoundingClientRect();return [r.y,r.height];})(),
        panelScrollH:$('playSide').scrollHeight,panelClientH:$('playSide').clientHeight})`);
      await clickText('经营', '#mobileGroups');
      const tool = await ev(`JSON.stringify({mode:game.mode,groups:[...$('mobileGroups').querySelectorAll('button')].map(b=>b.innerText)})`);
      await shot('edge-08-320x568-detail-tool');
      // 关键按钮命中检测：区分「可见但被遮挡」(真缺陷) 与「在滚动区外需滑动」(可发现性问题)
      const hits = await ev(`JSON.stringify([...document.querySelectorAll('#playSide button,#closeInspector,#commandBar button,#mobileGroups button')]
        .filter(b=>b.getClientRects().length&&!b.hidden).map(b=>{const r=b.getBoundingClientRect();
          const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          const inView=r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;
          const scroller=b.closest('#commandBar,#campList,#playSide');
          return {text:(b.innerText||'').replace(/\\n/g,' ').slice(0,20),inView,
            hit:t===b||b.contains(t),scroller:scroller?.id||null,
            scrollable:scroller?scroller.scrollWidth>scroller.clientWidth+8||scroller.scrollHeight>scroller.clientHeight+8:false,
            hint:scroller?(scroller.classList.contains('can-scroll')||!!scroller.title):false};}))`);
      const all = JSON.parse(hits);
      const occluded = all.filter(x => x.inView && !x.hit);
      const offscreen = all.filter(x => !x.inView);
      if (occluded.length) report.findings.push({ type: '320x568 可见按钮被遮挡', buttons: occluded });
      if (offscreen.length) report.findings.push({ type: '320x568 需滑动才能看到的按钮', buttons: offscreen });
      return { detail, tool, buttons: all.length, occluded, offscreen,
        scrollHints: await ev(`JSON.stringify({commandBar:$('commandBar').title,canScroll:$('commandBar').classList.contains('can-scroll'),playSideScroll:$('playSide').scrollHeight>$('playSide').clientHeight})`) };
    });

    // ========== H. 844x390 夜战支援与结算（点名组合） ==========
    await size(844, 390, true);
    await navigate();
    await check('844x390 夜战支援栏：所有关键按钮可见可点', '真实界面', async () => {
      await setup(`game.phase='night';game.day=1;game.castleHp=game.castleMax-40;game.hero.hp=game.hero.max-30;
        game.resources.gold=30;game.mobileGroup='support';paused=true;`);
      const hits = await ev(`JSON.stringify([...document.querySelectorAll('button')]
        .filter(b=>b.getClientRects().length&&!b.hidden).map(b=>{const r=b.getBoundingClientRect();
          const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {id:b.id,text:(b.innerText||'').replace(/\\n/g,' ').slice(0,20),hit:t===b||b.contains(t),
            inView:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
            rect:[Math.round(r.width),Math.round(r.height)]};}))`);
      await shot('edge-09-844x390-support');
      const bad = JSON.parse(hits).filter(x => !x.hit || !x.inView);
      if (bad.length) report.findings.push({ type: '844x390 按钮可点性', bad });
      return { buttons: JSON.parse(hits).length, bad,
        support: await ev(`JSON.stringify({repair:$('quickRepair').disabled,potion:$('quickPotion').disabled})`) };
    });
    await check('844x390 结算画面可浏览', '夹具', async () => {
      const r = await ev(`(()=>{game.presentation=null;game.phase='won';game.day=5;sync();
        const c=$('victoryCard');const b=c.getBoundingClientRect();
        return JSON.stringify({rect:[b.x,b.y,b.width,b.height],inView:b.x>=0&&b.y>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1,
          actions:['victoryNew','victoryReport','victoryNights'].map(id=>[id,!!$(id)?.getClientRects().length])});})()`);
      await shot('edge-10-844x390-settlement');
      return r;
    });

    await assertNoErrors();
    report.summary = {
      cases: report.cases.length,
      pass: report.cases.filter(c => c.status === 'PASS').length,
      fail: report.cases.filter(c => c.status === 'FAIL').length,
      realUI: report.realUI.length, fixtures: report.fixtures.length,
      findings: report.findings.length, screenshots: report.screenshots.length,
    };
  } catch (e) {
    report.fatal = e.stack || e.message;
  } finally {
    fs.writeFileSync(path.join(artifacts, 'edge-cases.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.summary || { fatal: report.fatal }, null, 2));
    client?.close(); chrome.kill('SIGKILL');
  }
})();
