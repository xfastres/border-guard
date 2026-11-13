// Runs the offline game in an isolated headless Chrome, using only Node's standard library.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const targetName=process.argv[2]||'Border-Guard-v0.19.html';
const targetPath=path.join(root,targetName);
if(!fs.existsSync(targetPath))throw new Error('找不到 '+targetName);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'border-v017-'));
const chrome=spawn(process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{windowsHide:true,stdio:'ignore'});
let spawnError;
chrome.on('error',e=>{spawnError=e;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function connect(url){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url),pending=new Map();let nextId=0;
    ws.addEventListener('error',reject,{once:true});
    ws.addEventListener('message',event=>{
      const m=JSON.parse(event.data),task=pending.get(m.id);
      if(!task)return;
      clearTimeout(task.timer);pending.delete(m.id);
      if(m.error)task.reject(new Error(m.error.message));else task.resolve(m.result);
    });
    ws.addEventListener('close',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Browser connection closed'));}pending.clear();});
    ws.addEventListener('open',()=>resolve({
      close:()=>ws.close(),
      send:(method,params={})=>new Promise((resolve,reject)=>{
        const id=++nextId;
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timed out: '+method));},60000);
        pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
      })
    }),{once:true});
  });
}

(async()=>{
  let client;
  try{
    let port;const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!port;i++){if(spawnError)throw spawnError;try{const p=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(p))port=p;}catch(e){if(!['ENOENT','EBUSY'].includes(e.code))throw e;}if(!port)await delay(100);}
    if(!port)throw new Error('Chrome startup timed out');
    const tab=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
    client=await connect(tab.webSocketDebuggerUrl);
    const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const source=name=>'('+fs.readFileSync(path.join(__dirname,name),'utf8')+')()';
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await client.send('Page.navigate',{url:pathToFileURL(targetPath).href});
    for(let i=0;i<100;i++){if(await evaluate('typeof FW!=="undefined"'))break;await delay(100);}
    const gestures=await evaluate(source('layout-gestures-v019.js'));
    const gameplay=await evaluate(source('gameplay-regression.js'));
    const nativeGestures=[];
    const nativeSetup=async()=>evaluate(`(()=>{
      if($('dialog').open)$('dialog').close();game=makeGame(42);game.started=true;paused=true;keys.clear();cancelMapGesture();
      const t=tileAt(5,4);t.visible=true;chooseSite(0);Object.assign(game.hero,center(t));closeTouchSheet();makeMobileDock();sync();centerOnHero();$('pauseOverlay').hidden=true;clearTimeout(toastTimer);$('toast').hidden=true;
      const node=game.tiles.find(t=>t.owned&&t.node&&YIELD[t.node.kind]);const r=screenRectOfTile(node);return {x:r.x+r.w/2,y:r.y+r.h/2};
    })()`);
    const touch=async(type,p)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:p.x,y:p.y,id:1}]});
    let p=await nativeSetup();await touch('touchStart',p);await touch('touchEnd',p);
    nativeGestures.push({name:'原生触屏短按移动',pass:await evaluate('!!game.hero.goal?.length&&!game.panel')});
    p=await nativeSetup();await touch('touchStart',p);await delay(390);await touch('touchEnd',p);
    nativeGestures.push({name:'原生长按保持面板且不移动',pass:await evaluate('game.panel&&!game.hero.goal')});
    await touch('touchStart',{x:20,y:115});await touch('touchEnd',{x:20,y:115});
    nativeGestures.push({name:'实际遮罩点击关闭',pass:await evaluate('!game.panel')});
    p=await nativeSetup();await touch('touchStart',p);await delay(390);await touch('touchEnd',p);
    const initialScroll=await evaluate("$('board').scrollLeft");
    await touch('touchStart',{x:650,y:115});await touch('touchMove',{x:450,y:115});await touch('touchEnd',{x:450,y:115});
    nativeGestures.push({name:'实际遮罩拖图关闭抽屉且不移动',pass:await evaluate(`!game.panel&&!game.hero.goal&&$('board').scrollLeft>${initialScroll+50}`)});
    const layouts=[];const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
    for(const [width,height,mobile] of [[1440,900,false],[1920,1080,false],[844,390,true],[932,430,true],[390,844,true]]){
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await evaluate(`(()=>{if($('dialog').open)$('dialog').close();paused=true;game.started=true;makeMobileDock();closeTouchSheet();sync();$('pauseOverlay').hidden=true;centerOnHero();clearTimeout(toastTimer);$('toast').hidden=true;})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout=await evaluate(source('layout-v019.js'));layouts.push(layout);
      if(width===1440){
        const q=await evaluate(`(()=>{game.hero.goal=null;const t=game.tiles.find(t=>t.owned&&t.node&&t.y>=5);const r=screenRectOfTile(t);return {x:r.x+r.w/2,y:r.y+r.h/2};})()`);
        await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:'left',clickCount:1});
        await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:'left',clickCount:1});
        nativeGestures.push({name:'鼠标点击资源仍打开详情',pass:await evaluate('game.panel&&!game.hero.goal')});
        nativeGestures.push({name:'WASD移动业务保持可用',pass:await evaluate(`(()=>{const x=game.hero.x;keys.add('d');moveHero(.2);keys.clear();return game.hero.x>x;})()`)});
        await evaluate('closeTouchSheet()');
      }
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v019-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));
    }
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const campaign=await evaluate(source('campaign-v019.js'));
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const victoryChecks=[];
    victoryChecks.push({name:'参考布局保留顶部HUD和左下战报',pass:await evaluate(`getComputedStyle(document.querySelector('.top')).display!=='none'&&getComputedStyle(document.querySelector('.status')).display!=='none'&&getComputedStyle(document.querySelector('.reports')).display!=='none'`)});
    victoryChecks.push({name:'主卡右下，库存只在顶部展示',pass:await evaluate(`$('victoryCard').getBoundingClientRect().left>innerWidth/2&&!$('victoryCore').innerText.includes('战后库存')&&$('stocks').innerText.includes('39')`)});
    for(const [width,height,mobile] of [[1440,900,false],[844,390,true],[390,844,true]]){
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await evaluate(`(()=>{makeMobileDock();sync();$('victoryInspect').hidden=true;game.victoryUi.placed=false;game.victoryUi.userMoved=false;centerOnHero();placeVictoryCard();})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v019-victory-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));
      victoryChecks.push({name:'结算卡有界 '+width+'x'+height,pass:await evaluate(`(()=>{const r=$('victoryCard').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()`)});
      if(width===844){
        const q=await evaluate(`(()=>{$('victoryInspect').hidden=true;const r=screenRectOfTile(game.castle);return {x:r.x+r.w/2,y:r.y+r.h/2};})()`);
        await touch('touchStart',q);await touch('touchEnd',q);
        victoryChecks.push({name:'战后原生触屏点击据点能只读查看',pass:await evaluate(`!$('victoryInspect').hidden&&$('victoryPlaceTitle').innerText==='城堡'`)});
      }
    }
    const report={file:targetName,gameplay,gestures,nativeGestures,layouts,campaign,victoryChecks};fs.writeFileSync(path.join(artifacts,'v019-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({gameplay:gameplay.passed+'/'+gameplay.total,gestures:gestures.passed+'/'+gestures.total,nativeGestures,layouts:layouts.map(l=>({size:l.viewport,passed:l.passed,total:l.total})),campaign,victoryChecks}));
    assert.equal(gameplay.passed,gameplay.total,'Gameplay failed');assert.equal(gestures.passed,gestures.total,'Gestures failed');assert.ok(nativeGestures.every(c=>c.pass),'Native input failed');for(const l of layouts)assert.equal(l.passed,l.total,'Layout failed '+JSON.stringify(l));
    assert.ok(campaign.won&&campaign.balanced,'Normal campaign failed');assert.ok(victoryChecks.every(c=>c.pass),'Victory HUD failed');
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});


