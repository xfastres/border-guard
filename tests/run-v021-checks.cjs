// v0.21 专项验证：在隔离的无头 Chrome 里跑战役目标层断言，并做数值定义静态比对。
// 只用 Node 标准库与本机 Chrome；可通过 CHROME_BIN 指定 Chrome 路径。
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const targetName=process.argv[2]||'Border-Guard-v0.21.html';
const targetPath=path.join(root,targetName);
if(!fs.existsSync(targetPath))throw new Error('找不到 '+targetName);

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'border-v021-'));
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
    const evaluate=async expression=>{
      const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    };
    const source=name=>'('+fs.readFileSync(path.join(__dirname,name),'utf8')+')()';
    await client.send('Page.enable');
    await client.send('Page.navigate',{url:pathToFileURL(targetPath).href});
    for(let i=0;i<100;i++){if(await evaluate('typeof FW!=="undefined"'))break;await delay(100);}
    const hooks=await evaluate(source('check-v021.js'));

    // 静态比对：数值与规则定义一字未动
    const old=fs.readFileSync(path.join(root,'Border-Guard-v0.20.html'),'utf8');
    const cur=fs.readFileSync(targetPath,'utf8');
    const anchors=[
      'daySeconds: 35, firstDaySeconds: 60, nightSeconds: 17, campSpawnDistance: 4',
      'spawnInterval: 1.1, carryFactor: 1.5, claimGold: 4, wage: 2, ration: 1',
      "const YIELD = {farm:['food',3], wood:['material',3], stone:['material',3], mine:['gold',3], rich:['gold',8], iron:['material',8]}",
      'resources:{gold:14,material:30,food:4,rare:0}, castle:null, castleHp:160, castleMax:160',
      'const CARDS = [',
      'const BUILDS = {',
      'const main=makeFront(\'home\',null,game.carry.home,game.isBoss?6:4+game.day*2,game.isBoss)',
      'const hp=isBoss?Math.round(430*(game.fragments?.82:1)):heavy?45+game.day*7:20+game.day*4'
    ];
    const staticChecks=anchors.map(a=>({name:a.slice(0,52),pass:old.includes(a)&&cur.includes(a)}));
    const staticPassed=staticChecks.filter(c=>c.pass).length;

    const out={file:targetName,hooks:hooks.passed+'/'+hooks.total,
      failed:hooks.results.filter(r=>!r.pass).map(r=>r.name),
      staticChecks:staticPassed+'/'+staticChecks.length,
      staticFailed:staticChecks.filter(c=>!c.pass).map(c=>c.name)};
    fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'artifacts','v021-verification.json'),JSON.stringify({out,hooks},null,2));
    console.log(JSON.stringify(out,null,2));
    assert.equal(hooks.passed,hooks.total,'v0.21 hook checks failed');
    assert.equal(staticPassed,staticChecks.length,'Numerical/rule definitions changed');
    await client.send('Browser.close');
  }finally{client?.close();chrome.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
