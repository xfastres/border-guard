const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const assert = require('node:assert/strict');
// Minimal DOM and Canvas interfaces for deterministic rules, independent of browser availability.
// Geometry, focus, painting, input event delivery and audio are outside this runner's scope.
const cwd = path.join(__dirname, '..');

function boot(file) {
  const html=fs.readFileSync(path.join(cwd,file),'utf8');
  const ids=new Map(), store=new Map();
  const css={setProperty(key,value){this[key]=value;}};
  const makeClass=()=>{const keys=new Set();return {add(...values){values.forEach(v=>keys.add(v));},remove(v){keys.delete(v);},contains(v){return keys.has(v);},toggle(v,on=!keys.has(v)){if(on)keys.add(v);else keys.delete(v);return on;}};};
  const inertCtx=new Proxy({}, {get(obj,key){return obj[key]??(key==='getTransform'?()=>({e:0,f:0}):key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{});}});
  let doc;
  class Element {
    constructor(tag,id,hidden=false){
      this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.classList=makeClass();this.style=Object.create(css);
      this.attrs={};this.dataset={};this.events={};this._text='';this.hidden=hidden;
      this.width=1472;this.height=920;this.offsetWidth=1280;this.offsetHeight=800;
      this.clientWidth=1280;this.scrollWidth=1280;this.isConnected=true;
    }
    get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    set textContent(text){this._text=String(text??'');this.children=[];}
    get firstChild(){return this._text?{textContent:this._text}:this.children[0];}
    get firstElementChild(){return this.children[0];}
    get lastElementChild(){return this.children.at(-1);}
    append(...els){for(const el of els){const next=typeof el==='string'?{textContent:el}:el;next.parentElement=this;this.children.push(next);}}
    replaceChildren(...els){for(const child of this.children)child.isConnected=false;this.children=[];this._text='';this.append(...els);}
    querySelectorAll(tag){return this.children.flatMap(x=>x.tagName?(x.tagName===tag.toUpperCase()?[x]:[]).concat(x.querySelectorAll(tag)):[]);}
    querySelector(tag){return this.querySelectorAll(tag)[0]??null;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]??null;}
    addEventListener(type,f){(this.events[type]??=[]).push(f);}
    dispatch(type,e){for(const f of this.events[type]??[])f(e);}
    click(){this.dispatch('click',{target:this,preventDefault(){}});}
    contains(el){return el===this||this.children.some(c=>c.contains?.(el));}
    closest(){return null;}
    focus(){doc.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close',{target:this});}
    getBoundingClientRect(){return {width:1280,height:800,left:0,right:1280,top:0,bottom:800};}
    getContext(){return inertCtx;}
  }
  for(const [,tag,attrs] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
    const id=attrs.match(/\sid="([^"]+)"/)?.[1];
    if(id)ids.set(id,new Element(tag,id,/\shidden(?:\s|$|=)/.test(attrs)));
  }
  const create=tag=>new Element(tag);
  const body=create('body');
  const syntheticClass=new Map(['.side','.status','.top','main'].map(key=>[key,create('section')]));
  doc={createElement:create,body,activeElement:body,hidden:false,
    addEventListener(){},getElementById:id=>ids.get(id)??[...(ids.get("commandBar")?.children||[])].find(e=>e.id===id)??null,
    querySelector(sel){
      if(sel==='#dialogContent .choices button')return ids.get('dialogContent').querySelector('button');
      return syntheticClass.get(sel)??null;
    }};
  const sandbox={document:doc,console,performance,innerWidth:1440,innerHeight:900,
    getComputedStyle:()=>({display:'block'}),requestAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},
    matchMedia:()=>({matches:false}),addEventListener(){},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
  sandbox.window=sandbox;
  const ctx=vm.createContext(sandbox);
  const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(js,ctx,{filename:file});
  const execute=(source)=>vm.runInContext(source,ctx);
  return execute;
}
const test=require('node:test');
const file=process.env.BORDER_HTML||'Border-Guard-v0.27.html';
const fixture=`
  game=makeGame(42);
  for(const t of game.tiles){t.ground='water';t.building=null;t.campSolid=false;t.owned=false;}
  const road=(x,y)=>{const t=tileAt(x,y);t.ground='road';t.owned=true;return t;};
  const fort=(x,y,type='wall')=>{const t=road(x,y);t.building={type,hp:100,max:100};return t;};
  for(let x=3;x<=12;x++)road(x,5);
  game.castle=fort(3,5,'castle');
  game.hero.x=3.5;game.hero.y=9.5;
  game.phase='night';game.day=2;game.started=true;
  const front={id:'home',gates:[tileAt(12,5)],schedule:[],cap:14,index:0};
  game.fronts=[front];
  const enemy=(x,y=5)=>{const e={id:game.enemies.length+1,x:x+.5,y:y+.5,hp:28,max:28,
    speed:1.5,radius:.2,cooldown:0,front,next:null,routeRevision:navigationRevision()};
    game.enemies.push(e);return e;};
  const simulate=(seconds)=>{for(let i=0;i<seconds*40;i++){
    assignAttackSlots();for(const e of game.enemies)moveEnemy(e,.025);
    separateUnits(.025);
  }};
`;
const run=body=>boot(file)('(()=>{'+fixture+body+'})()');
test('绕行优先，即使较短直路有墙',()=>{
  const result=run(`
    const wall=fort(6,5);
    for(let x=4;x<=7;x++) road(x,7);
    road(4,6);road(7,6);
    enemy(12);
    calculateRoutes(front);simulate(15);
    return [wall.building?.hp,game.castleHp];
  `);
  assert.equal(result[0],100);
  assert.ok(result[1]<160);
});
test('封死城堡近旁后，所有同点敌人能同时拆外墙，破墙后继续拆内墙',()=>{
  const result=run(`
    const outer=fort(5,5),inner=fort(4,5);
    for(let i=0;i<6;i++)enemy(6);
    calculateRoutes(front);simulate(.15);
    const initial=[outer.building?.hp,inner.building?.hp];
    simulate(6);
    return [...initial,!!outer.building,!!inner.building,game.castleHp];
  `);
  assert.equal(JSON.stringify(result.slice(0,4)),JSON.stringify([28,100,false,false]));
  assert.ok(result[4]<160);
});
test('不可达的地图边缘换到附近可进攻的入口',()=>{
  const result=run(`
    road(31,5);
    front.gates=[tileAt(31,5)];
    calculateRoutes(front);
    spawnEnemy(front);
    const e=game.enemies[0];
    return Number.isFinite(front.route[at(tileOf(e).x,tileOf(e).y)]);
  `);
  assert.equal(result,true);
});
test('夜里修墙和升级有独立成本，可用性和实际收益一致',()=>{
  const result=run(`
    const wall=fort(5,5),tower=fort(6,5,'tower');
    tower.building.level=0;
    wall.building.hp=22;
    game.resources={material:10,gold:5,food:4};
    game.actions=0;
    repair(wall);rework(tower);repair(wall);rework(tower);
    return [wall.building.hp,tower.building.level,tower.building.hp,game.resources.material,game.resources.gold,game.actions];
  `);
  assert.equal(JSON.stringify(result),JSON.stringify([67,1,115,0,0,0]));
});
test('首日建城至少留一分钟，开局选择不消耗时间',()=>{
  const result=boot(file)(`(()=>{
    const before=game.phaseElapsed;tickCampaign(5);
    const unchanged=game.phaseElapsed===before;
    $('dialog').close();
    game.phaseElapsed=115;
    const site=game.sites[0],tile=tileAt(site.x,site.y);
    tile.visible=true;chooseSite(0);
    return [unchanged,!!game.castle,phaseLimit()-game.phaseElapsed];
  })()`);
  assert.equal(result[0],true);assert.equal(result[1],true);assert.ok(result[2]>=60);
});
test('未建城时敌军会继续接近领主',()=>{
  const result=run(`
    game.castle=null;tileAt(3,5).building=null;
    Object.assign(game.hero,center(tileAt(3,5)));
    enemy(12);calculateRoutes(front);simulate(12);
    return game.hero.hp;
  `);
  assert.ok(result<100,`领主未被接敌: ${result}`);
});
test('拆墙有受击反馈并能正常天亮',()=>{
  const result=run(`
    const wall=fort(5,5);
    wall.building.hp=24;
    const enemyA=enemy(6),enemyB=enemy(6);
    calculateRoutes(front);
    game.clock=76;
    for(let i=0;i<12;i++)advanceBattle(.025);
    const events=game.combatEvents.filter(e=>e.kind==='structureHit').length;
    const destroyed=!wall.building;
    const reports=game.reports.filter(x=>x.includes('城墙被摧毁')).length;
    damageEnemy(enemyA,100);damageEnemy(enemyB,100);
    advanceBattle(.025);
    return [events,destroyed,reports,game.phase,game.day,game.ledger[2]?.closed];
  `);
  assert.equal(JSON.stringify(result),JSON.stringify([2,true,1,'day',3,true]));
});
test('资源贴边点击时打开详情，不改领主移动目标',()=>{
  const result=run(`
    game.phase='day';
    const n=tileAt(7,5),t=tileAt(8,5);
    n.node={kind:'wood'};n.visible=t.visible=true;
    const goal=[center(tileAt(9,5))];
    game.hero.goal=goal;
    mapClick(t,{x:8.05,y:5.5},true);
    return [game.selected===at(7,5),game.panel,game.hero.goal===goal];
  `);
  assert.equal(JSON.stringify(result),JSON.stringify([true,true,true]));
});
test('战役与战报居中，地点详情继续贴边',()=>{
  const result=boot(file)(`(()=>{
    $('dialog').close();
    showSide('campaign');
    const campaign=$('playSide').classList.contains('reading');
    showSide('report');
    const report=$('playSide').classList.contains('reading');
    openInspector(tileAt(8,5));
    return [campaign,report,!$('playSide').classList.contains('reading')];
  })()`);
  assert.equal(JSON.stringify(result),JSON.stringify([true,true,true]));
});
test('重开重新选择难度并不消耗开局时间',()=>{
  const result=boot(file)(`(()=>{
    $('dialog').close();game.started=true;game.hard=true;
    newRun();tickCampaign(5);
    const before=[game.started,game.phaseElapsed,$('dialog').open,$('clockReadout').textContent];
    document.querySelector('#dialogContent .choices button').click();
    return [before,game.started,game.hard];
  })()`);
  assert.equal(JSON.stringify(result),JSON.stringify([[false,0,true,'选择难度后开始'],true,false]));
});
