const assert = require('node:assert/strict');
const test = require('node:test');
const {boot} = require('./border-guard-model.cjs');
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
