// 自然缩窗、棋盘背景原生拖图、DOM 格线边界。不调用 sync/placeVictoryCard 去掩盖结果。
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const targetPath=path.join(root,process.argv[2]||'Border-Guard-v0.20.html');
if(!fs.existsSync(targetPath))throw new Error('找不到游戏文件');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'border-v020-boundary-'));
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
      const message=JSON.parse(event.data),task=pending.get(message.id);
      if(!task)return;
      clearTimeout(task.timer);pending.delete(message.id);
      if(message.error)task.reject(new Error(message.error.message));else task.resolve(message.result);
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
function inside(rect,width,height){
  return rect.left>=-1&&rect.top>=-1&&rect.right<=width+1&&rect.bottom<=height+1&&rect.width>40;
}

(async()=>{
  let client;
  try{
    let port;const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!port;i++){if(spawnError)throw spawnError;try{const text=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(text))port=text;}catch(error){if(!['ENOENT','EBUSY'].includes(error.code))throw error;}if(!port)await delay(100);}
    if(!port)throw new Error('Chrome startup timed out');
    const tab=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'}).then(response=>response.json());
    client=await connect(tab.webSocketDebuggerUrl);
    const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const resize=async(width,height,mobile)=>{
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    };
    const frame=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const touch=async(type,p)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:p.x,y:p.y,id:1}]});
    await client.send('Page.enable');
    await resize(844,390,true);
    await client.send('Page.navigate',{url:pathToFileURL(targetPath).href});
    for(let i=0;i<100;i++){if(await evaluate('typeof FW!=="undefined"'))break;await delay(100);}
    await evaluate(`(()=>{if($('dialog').open)$('dialog').close();game=makeGame(42);game.started=true;paused=true;keys.clear();cancelMapGesture();const t=tileAt(5,4);t.visible=true;chooseSite(0);closeTouchSheet();Object.assign(game.hero,{x:.5,y:.5,goal:null});sync();$('pauseOverlay').hidden=true;centerOnHero();})()`);
    await frame();
    const hit=await evaluate(`document.elementFromPoint(100,180)?.id||''`);
    const before=await evaluate(`({tx:camera.tx,ty:camera.ty,mode:camera.mode,gold:game.resources.gold})`);
    await touch('touchStart',{x:100,y:180});await touch('touchMove',{x:200,y:180});await touch('touchEnd',{x:200,y:180});
    const dragged=await evaluate(`({tx:camera.tx,ty:camera.ty,mode:camera.mode,goal:!!game.hero.goal,gold:game.resources.gold,panel:!!game.panel})`);
    await evaluate(`(()=>{cancelMapGesture();Object.assign(game.hero,{x:.5,y:.5,goal:null});centerOnHero();closeTouchSheet();})()`);
    const tapBefore=await evaluate('camera.tx');
    await touch('touchStart',{x:100,y:180});await touch('touchEnd',{x:100,y:180});
    const tapped=await evaluate(`({tx:camera.tx,goal:!!game.hero.goal,panel:!!game.panel,gold:game.resources.gold,selected:game.selected})`);
    await resize(390,844,true);await frame();
    const grid=await evaluate(`(()=>{
      game.phase='day';paused=true;game.hero.goal=null;closeTouchSheet();
      const box=canvas.getBoundingClientRect();
      const point={x:box.left+21*CELL*(box.width/canvas.width)-.05,y:box.top+5.5*CELL*(box.height/canvas.height)};
      const tile=screenToGrid(point.x,point.y);
      return {cssWidth:box.width,offsetWidth:canvas.offsetWidth,point,tile:tile&&{x:tile.x,y:tile.y}};
    })()`);
    await resize(1440,900,false);await frame();
    await evaluate(`(()=>{game.phase='day';Object.assign(game.hero,center(game.castle));centerOnHero();finish(true);})()`);
    await frame();await frame();
    const wide=await evaluate(`$('victoryCard').getBoundingClientRect().toJSON()`);
    await resize(390,844,true);await frame();await frame();
    const natural=await evaluate(`$('victoryCard').getBoundingClientRect().toJSON()`);
    await resize(1440,900,false);await frame();
    await evaluate(`(()=>{const card=$('victoryCard');card.style.left='1022px';card.style.top='180px';game.victoryUi.userMoved=true;game.victoryUi.placed=true;})()`);
    await resize(390,844,true);await frame();await frame();
    const draggedCard=await evaluate(`$('victoryCard').getBoundingClientRect().toJSON()`);
    await resize(844,390,true);await frame();
    await evaluate(`(()=>{
      measureCameraViewport();camera.mode='manual';
      camera.tx=camera.safeX-.5*CELL*camera.sx;camera.ty=camera.safeY-.5*CELL*camera.sy;applyCamera();
      $('victoryInspect').hidden=true;
    })()`);
    await frame();
    const victorySpot=await evaluate(`(()=>{for(let y=24;y<innerHeight-24;y+=16){for(let x=24;x<innerWidth-24;x+=16){if(document.elementFromPoint(x,y)?.id==='board')return {x,y};}}return null;})()`);
    const victoryHit=victorySpot?await evaluate(`document.elementFromPoint(${victorySpot.x},${victorySpot.y})?.id||''`):'';
    const victoryBefore=await evaluate('camera.tx');
    if(victorySpot){await touch('touchStart',victorySpot);await touch('touchMove',{x:victorySpot.x+110,y:victorySpot.y});await touch('touchEnd',{x:victorySpot.x+110,y:victorySpot.y});}
    const victoryDrag=await evaluate(`({tx:camera.tx,goal:game.hero.goal,inspect:$('victoryInspect').hidden,gold:game.resources.gold})`);
    const report={
      hit,before,dragged,tapped,grid,wide,natural,draggedCard,victoryHit,victoryBefore,victoryDrag,
      backgroundDrag:hit==='board'&&dragged.mode==='manual'&&dragged.tx>before.tx+50&&!dragged.goal&&dragged.gold===before.gold,
      backgroundTap:!tapped.goal&&!tapped.panel&&Math.abs(tapped.tx-tapBefore)<1&&tapped.gold===before.gold,
      gridEdge:grid.tile&&grid.tile.x===20&&grid.tile.y===5&&grid.cssWidth!==grid.offsetWidth,
      naturalCard:inside(natural,390,844),
      draggedCardInside:inside(draggedCard,390,844),
      victoryBackground:victoryHit==='board'&&victoryDrag.tx>victoryBefore+50&&victoryDrag.inspect&&!victoryDrag.goal
    };
    fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'artifacts','v020-boundary-checks.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    assert.equal(report.backgroundDrag,true,'背景拖图');
    assert.equal(report.backgroundTap,true,'背景短按');
    assert.equal(report.gridEdge,true,'DOM格线 '+JSON.stringify(grid));
    assert.equal(report.naturalCard,true,'自然缩窗 '+JSON.stringify(natural));
    assert.equal(report.draggedCardInside,true,'拖过的结算卡 '+JSON.stringify(draggedCard));
    assert.equal(report.victoryBackground,true,'战后背景拖图');
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
