// Runs the offline game in an isolated headless Chrome, using only Node's standard library.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const targetName=process.argv[2]||'Border-Guard-v0.20.html';
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
    const gestures=await evaluate(source('layout-gestures-v020.js'));
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
    const initialCamera=await evaluate('camera.tx');
    await touch('touchStart',{x:650,y:115});await touch('touchMove',{x:450,y:115});await touch('touchEnd',{x:450,y:115});
    nativeGestures.push({name:'实际遮罩拖图关闭抽屉且不移动',pass:await evaluate(`!game.panel&&!game.hero.goal&&camera.mode==='manual'&&camera.tx<${initialCamera}-50&&$('board').scrollLeft===0`)});
    await evaluate(`(()=>{cancelMapGesture();Object.assign(game.hero,{x:.5,y:.5,goal:null});closeTouchSheet();centerOnHero();})()`);
    const backgroundHit=await evaluate(`document.elementFromPoint(100,180)?.id||''`);
    const backgroundBefore=await evaluate('camera.tx');
    const backgroundGold=await evaluate('game.resources.gold');
    await touch('touchStart',{x:100,y:180});await touch('touchMove',{x:200,y:180});await touch('touchEnd',{x:200,y:180});
    nativeGestures.push({name:'原生触摸命中棋盘背景可以拖图',pass:await evaluate(`document.elementFromPoint(100,180)?.id==='board'&&camera.mode==='manual'&&camera.tx>${backgroundBefore}+50&&!game.hero.goal&&game.resources.gold===${backgroundGold}`)&&backgroundHit==='board'});
    await evaluate(`(()=>{cancelMapGesture();Object.assign(game.hero,{x:.5,y:.5,goal:null});centerOnHero();})()`);
    const tapTx=await evaluate('camera.tx');
    await touch('touchStart',{x:100,y:180});await touch('touchEnd',{x:100,y:180});
    nativeGestures.push({name:'棋盘背景短按不移动不建造',pass:await evaluate(`!game.hero.goal&&!game.panel&&Math.abs(camera.tx-${tapTx})<1&&game.resources.gold===${backgroundGold}`)});
    const layouts=[];const cameras=[];const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
    for(const [width,height,mobile] of [[1440,900,false],[1920,1080,false],[844,390,true],[932,430,true],[390,844,true]]){
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await evaluate(`(()=>{if($('dialog').open)$('dialog').close();paused=true;game.started=true;makeMobileDock();closeTouchSheet();sync();$('pauseOverlay').hidden=true;centerOnHero();clearTimeout(toastTimer);$('toast').hidden=true;})()`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout=await evaluate(source('layout-v019.js'));layouts.push(layout);
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v020-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));
      const camera=await evaluate(source('camera-v020.js'));cameras.push({viewport:width+'x'+height,...camera});
      if(width===1440){
        const q=await evaluate(`(()=>{game.hero.goal=null;const t=game.tiles.find(t=>t.owned&&t.node&&t.y>=5);const r=screenRectOfTile(t);return {x:r.x+r.w/2,y:r.y+r.h/2};})()`);
        await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:'left',clickCount:1});
        await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:'left',clickCount:1});
        nativeGestures.push({name:'鼠标点击资源仍打开详情',pass:await evaluate('game.panel&&!game.hero.goal')});
        nativeGestures.push({name:'WASD移动业务保持可用',pass:await evaluate(`(()=>{const x=game.hero.x;keys.add('d');moveHero(.2);keys.clear();return game.hero.x>x;})()`)});
        await evaluate(`(()=>{closeTouchSheet();setCameraMode('manual');panCameraBy(220,-80);})()`);
        const panShot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v020-1440x900-pan.png'),Buffer.from(panShot.data,'base64'));
        await evaluate(`(()=>{game.hero.x=.5;game.hero.y=.5;game.hero.goal=null;centerOnHero();})()`);
        const edgeShot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v020-1440x900-corner.png'),Buffer.from(edgeShot.data,'base64'));
        await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:2,mobile:false});
        const dpr=await evaluate(`(()=>{measureCameraViewport();const t=tileAt(8,6);camera.mode='manual';camera.tx=-40;camera.ty=25;applyCamera();const p=worldToScreen(t.x*CELL+8,t.y*CELL+8);const g=screenToGrid(p.x,p.y);return {dpr:devicePixelRatio,ok:!!(g&&g.x===8&&g.y===6)};})()`);
        cameras.push({viewport:'1440x900@2x',passed:dpr.ok&&dpr.dpr===2?1:0,total:1,results:[{name:'DPR不进入CSS坐标',pass:!!(dpr.ok&&dpr.dpr===2),error:JSON.stringify(dpr)}]});
        await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
        await evaluate(`(()=>{if(game.castle)Object.assign(game.hero,center(game.castle));centerOnHero();})()`);
      }
      if(width===390){
        const edge=await evaluate(`(()=>{const box=canvas.getBoundingClientRect();const point={x:box.left+21*CELL*(box.width/canvas.width)-.05,y:box.top+5.5*CELL*(box.height/canvas.height)};const tile=screenToGrid(point.x,point.y);return {cssWidth:box.width,offsetWidth:canvas.offsetWidth,tile:tile&&{x:tile.x,y:tile.y}};})()`);
        nativeGestures.push({name:'DOM格线内0.05px仍是原格',pass:!!(edge.tile&&edge.tile.x===20&&edge.tile.y===5&&edge.cssWidth!==edge.offsetWidth)});
      }
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
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,'v020-victory-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));
      victoryChecks.push({name:'结算卡有界 '+width+'x'+height,pass:await evaluate(`(()=>{const r=$('victoryCard').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()`)});
      if(width===844){
        const q=await evaluate(`(()=>{
          $('victoryInspect').hidden=true;
          const r=screenRectOfTile(game.castle);
          const visible=r.x>8&&r.y>8&&r.x+r.w<innerWidth-8&&r.y+r.h<innerHeight-8;
          if(!visible){measureCameraViewport();camera.mode='manual';camera.tx=camera.safeX-(game.castle.x+.5)*CELL*camera.sx;camera.ty=camera.safeY-(game.castle.y+.5)*CELL*camera.sy;applyCamera();}
          const spot=screenRectOfTile(game.castle);return {x:spot.x+spot.w/2,y:spot.y+spot.h/2};
        })()`);
        await touch('touchStart',q);await touch('touchEnd',q);
        victoryChecks.push({name:'战后原生触屏点击据点能只读查看',pass:await evaluate(`!$('victoryInspect').hidden&&$('victoryPlaceTitle').innerText==='城堡'`)});
      }
    }
    const beforeTx=await evaluate('camera.tx');
    const cardBefore=await evaluate("$('victoryCard').getBoundingClientRect().left");
    await evaluate(`(()=>{canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:240,clientY:220,pointerId:7,button:0}));canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:70,clientY:220,pointerId:7,button:0}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:70,clientY:220,pointerId:7,button:0}));})()`);
    victoryChecks.push({name:'战后拖图移动世界层且结算卡不动',pass:await evaluate(`camera.tx<${beforeTx}-20&&Math.abs($('victoryCard').getBoundingClientRect().left-(${cardBefore}))<1`)});
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate(`(()=>{game.victoryUi.userMoved=false;game.victoryUi.placed=false;placeVictoryCard();})()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    victoryChecks.push({name:'自然缩窗不调用摆卡仍留在视口内',pass:await evaluate(`(()=>{const r=$('victoryCard').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&r.width>40;})()`)});
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await evaluate(`(()=>{const card=$('victoryCard');card.style.left='1022px';card.style.top='180px';game.victoryUi.userMoved=true;game.victoryUi.placed=true;})()`);
    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    victoryChecks.push({name:'手动拖过的结算卡缩窗后回到视口',pass:await evaluate(`(()=>{const r=$('victoryCard').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()`)});
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await evaluate(`(()=>{measureCameraViewport();camera.mode='manual';camera.tx=camera.safeX-.5*CELL*camera.sx;camera.ty=camera.safeY-.5*CELL*camera.sy;applyCamera();$('victoryInspect').hidden=true;victorySuppressClick=false;})()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const victorySpot=await evaluate(`(()=>{for(let y=24;y<innerHeight-24;y+=16){for(let x=24;x<innerWidth-24;x+=16){if(document.elementFromPoint(x,y)?.id==='board')return {x,y};}}return null;})()`);
    const victoryBackgroundBefore=await evaluate('camera.tx');
    if(victorySpot){await touch('touchStart',victorySpot);await touch('touchMove',{x:victorySpot.x+110,y:victorySpot.y});await touch('touchEnd',{x:victorySpot.x+110,y:victorySpot.y});}
    victoryChecks.push({name:'战后原生触摸命中背景可以拖图',pass:!!victorySpot&&await evaluate(`camera.tx>${victoryBackgroundBefore}+50&&$('victoryInspect').hidden&&!game.hero.goal`)});
    const sourceText=fs.readFileSync(targetPath,'utf8');
    const scrollWrites=[...sourceText.matchAll(/scroll(?:Left|Top)\s*(?:=|\+=)\s*[^;]+/g)].map(item=>item[0].replace(/\s+/g,'')).filter(item=>!/=\s*0(?:;|$)/.test(item));
    const report={file:targetName,baseline:'Border-Guard-v0.19.html',gameplay,gestures,nativeGestures,layouts,cameras,campaign,victoryChecks,scrollWrites};fs.writeFileSync(path.join(artifacts,'v020-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({gameplay:gameplay.passed+'/'+gameplay.total,gestures:gestures.passed+'/'+gestures.total,nativeGestures,layouts:layouts.map(l=>({size:l.viewport,passed:l.passed,total:l.total})),cameras:cameras.map(c=>({size:c.viewport,passed:c.passed,total:c.total,failed:c.results.filter(r=>!r.pass)})),campaign,victoryChecks,scrollWrites}));
    assert.equal(gameplay.passed,gameplay.total,'Gameplay failed');assert.equal(gestures.passed,gestures.total,'Gestures failed');assert.ok(nativeGestures.every(c=>c.pass),'Native input failed');for(const l of layouts)assert.equal(l.passed,l.total,'Layout failed '+JSON.stringify(l));
    for(const c of cameras)assert.equal(c.passed,c.total,'Camera failed '+JSON.stringify(c.results.filter(r=>!r.pass)));
    assert.deepEqual(scrollWrites,[],'旧滚动平移还在');
    assert.ok(campaign.won&&campaign.balanced,'Normal campaign failed');assert.ok(victoryChecks.every(c=>c.pass),'Victory HUD failed');
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});


