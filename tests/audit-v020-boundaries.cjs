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
    const resize=async(width,height,mobile)=>{await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});};
    const frame=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await client.send('Page.enable');await resize(844,390,true);
    await client.send('Page.navigate',{url:pathToFileURL(targetPath).href});
    for(let i=0;i<100;i++){if(await evaluate('typeof FW!=="undefined"'))break;await delay(100);}
    await evaluate(`(()=>{if($('dialog').open)$('dialog').close();game=makeGame(42);game.started=true;paused=true;keys.clear();const t=tileAt(5,4);t.visible=true;chooseSite(0);closeTouchSheet();Object.assign(game.hero,{x:.5,y:.5});sync();$('pauseOverlay').hidden=true;centerOnHero();})()`);
    const before=await evaluate(`({tx:camera.tx,ty:camera.ty,mode:camera.mode,target:document.elementFromPoint(100,180)?.id})`);
    const touch=async(type,p)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:p.x,y:p.y,id:1}]});
    await touch('touchStart',{x:100,y:180});await touch('touchMove',{x:200,y:180});await touch('touchEnd',{x:200,y:180});
    const after=await evaluate('({tx:camera.tx,ty:camera.ty,mode:camera.mode,goal:game.hero.goal})');
    const background={before,after,moved:Math.abs(after.tx-before.tx)>50};
    const modeBefore=await evaluate(`(()=>{game.mode='wall';return {mode:game.mode,selected:game.selected,gold:game.resources.gold};})()`);
    await touch('touchStart',{x:100,y:180});await touch('touchEnd',{x:100,y:180});
    const modeAfter=await evaluate('({mode:game.mode,selected:game.selected,gold:game.resources.gold})');
    const backgroundMode={before:modeBefore,after:modeAfter};
    await evaluate('game.mode=null');
    await resize(1440,900,false);await frame();
    await evaluate(`(()=>{Object.assign(game.hero,center(game.castle));centerOnHero();finish(true);})()`);await frame();
    const wide=await evaluate("$('victoryCard').getBoundingClientRect().toJSON()");
    await resize(390,844,true);await frame();
    const narrow=await evaluate("$('victoryCard').getBoundingClientRect().toJSON()");
    const naturalResize={wide,narrow,visible:narrow.left>=0&&narrow.top>=0&&narrow.right<=390&&narrow.bottom<=844};
    const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(__dirname,'artifacts','v020-audit-natural-resize.png'),Buffer.from(shot.data,'base64'));
    const fractional=await evaluate(`(()=>{
      game.phase='day';game.hero.x=20.5;game.hero.y=5.5;game.hero.goal=null;closeTouchSheet();sync();measureCameraViewport();camera.mode='manual';camera.tx=195-20.5*CELL*camera.sx;camera.ty=300-5.5*CELL*camera.sy;applyCamera();
      const r=canvas.getBoundingClientRect(),actualSx=r.width/canvas.width,actualSy=r.height/canvas.height;
      const p={x:r.left+21*CELL*actualSx-.05,y:r.top+5.5*CELL*actualSy};const g=screenToGrid(p.x,p.y);
      return {cssWidth:r.width,integerWidth:canvas.offsetWidth,point:p,expected:{x:20,y:5},actual:g&&{x:g.x,y:g.y}};
    })()`);
    const report={background,backgroundMode,naturalResize,fractional};fs.writeFileSync(path.join(__dirname,'artifacts','v020-independent-boundaries.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});


