// Runs the offline game in an isolated headless Chrome, using only Node's standard library.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const targetName=process.argv[2]||'Border-Guard-v0.17.html';
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
    const portFile=path.join(profile,'DevToolsActivePort');
    let port;
    for(let i=0;i<100&&!port;i++){
      if(spawnError)throw spawnError;
      try{const value=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(value))port=value;}
      catch(e){if(!['ENOENT','EBUSY'].includes(e.code))throw e;}
      if(!port)await delay(100);
    }
    if(!port)throw new Error('Chrome did not open its test connection');
    const tab=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
    client=await connect(tab.webSocketDebuggerUrl);
    const evaluate=async(expression)=>{
      const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    };
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const html=fs.readFileSync(targetPath,'utf8');
    assert.equal(/https?:\/\//.test(html),false,'页面包含外部地址');
    assert.equal(html.includes('下局敌军基数'),false);
    assert.equal(html.includes('迎来天亮获得收益'),false);
    await client.send('Page.navigate',{url:pathToFileURL(targetPath).href});
    for(let i=0;i<100;i++){if(await evaluate('typeof FW!=="undefined"'))break;await delay(100);}
    const gameplay=await evaluate('('+fs.readFileSync(path.join(__dirname,'gameplay-regression.js'),'utf8')+')()');
    assert.equal(gameplay.passed,gameplay.total,JSON.stringify(gameplay.results.filter(r=>!r.pass)));
    await evaluate(`(()=>{for(const t of game.tiles)t.visible=true;const c=createCamp(tileAt(15,5));openInspector(campTile(c));makeMobileDock();sync();centerOnHero();paused=true;$('pauseOverlay').hidden=true;clearTimeout(toastTimer);$('toast').hidden=true;})()`);
    const mobile=await evaluate('('+fs.readFileSync(path.join(__dirname,'mobile-layout.js'),'utf8')+')()');
    assert.equal(mobile.passed,mobile.total,JSON.stringify(mobile.checks));
    const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
    const shotOf=async name=>{
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(artifacts,name),Buffer.from(shot.data,'base64'));
    };
    const report={file:targetName,gameplay,mobile};
    if(targetName.includes('v0.18')){
      const victory=await evaluate('('+fs.readFileSync(path.join(__dirname,'victory-hud.js'),'utf8')+')()');
      assert.equal(victory.passed,victory.total,JSON.stringify(victory.results.filter(item=>!item.pass)));
      report.victory=victory;
      const showcase=`()=>{
        if($('dialog').open)$('dialog').close();
        game=makeGame(7);game.started=true;paused=true;keys.clear();
        const site=tileAt(game.sites[0].x,game.sites[0].y);site.visible=true;chooseSite(0);
        const clearNight=()=>{
          startNight();
          let guard=0;
          while(game.phase==='night'&&guard++<5000){
            for(const enemy of game.enemies)if(enemy.hp>0)damageEnemy(enemy,100000);
            advanceBattle(0.2);
          }
          if(guard>=5000)throw new Error('截图清场超时');
        };
        for(let night=0;night<4;night++)clearNight();
        clearNight();
        if(game.phase!=='won')throw new Error('截图局没有胜利');
        for(const t of game.tiles)if(Math.hypot(t.x-game.castle.x,t.y-game.castle.y)<8)t.visible=true;
        sync();
        const board=$('board'),scale=(canvas.offsetWidth||1680)/WIDTH;
        const gate=game.ledger[game.day]&&game.ledger[game.day].bossGate;
        board.scrollLeft=Math.max(0,Math.min(game.castle.x*scale,(gate?gate.x*scale:0))-20);
        board.scrollTop=Math.max(0,game.castle.y*scale-innerHeight*0.28);
        game.victoryUi.userMoved=false;game.victoryUi.placed=false;game.victoryUi.placeTries=0;
        placeVictoryCard();
        const text=$('victoryCore').innerText;
        if(!text.includes('第 '+game.day+' 夜通关')||!text.includes('金币'+game.resources.gold))throw new Error(text);
        if(text.includes('下局敌军基数')||text.includes('迎来天亮获得收益'))throw new Error(text);
        return {day:game.day,kills:game.kills,text};
      }`;
      const frame=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      await frame();
      report.desktop=await evaluate('('+showcase+')()');
      await frame();
      await shotOf('v018-desktop.png');
      await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await frame();
      report.mobileShot=await evaluate('('+showcase+')()');
      await frame();
      await shotOf('v018-mobile.png');
      fs.writeFileSync(path.join(artifacts,'v018-verification.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify({
        file:targetName,
        gameplay:gameplay.passed+'/'+gameplay.total,
        mobile:mobile.passed+'/'+mobile.total,
        victory:victory.passed+'/'+victory.total,
        screenshots:['tests/artifacts/v018-desktop.png','tests/artifacts/v018-mobile.png']
      }));
    }else{
      await shotOf('v017-mobile.png');
      fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify({file:targetName,gameplay:gameplay.passed+'/'+gameplay.total,mobile:mobile.passed+'/'+mobile.total,screenshot:'tests/artifacts/v017-mobile.png'}));
    }
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
