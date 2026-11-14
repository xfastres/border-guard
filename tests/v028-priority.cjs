const assert = require('node:assert/strict');
const test = require('node:test');
const {boot} = require('./border-guard-model.cjs');
const file=process.env.BORDER_HTML||'Border-Guard-v0.28.html';
const run=body=>boot(file)(`(()=>{
  $('dialog').close();
  game=makeGame(42);game.started=true;game.settings.sound=false;
  for(const t of game.tiles){t.ground='grass';t.node=null;t.building=null;t.campSolid=false;t.visible=true;t.owned=false;}
  const land=(x,y)=>{const t=tileAt(x,y);t.owned=true;return t;};
  const castle=land(5,5);castle.building={type:'castle'};game.castle=castle;
  for(let y=3;y<=7;y++)for(let x=3;x<=7;x++)land(x,y);
  Object.assign(game.hero,center(land(7,5)));game.hero.goal=null;
  const front={id:'home',gates:[tileAt(30,5)],schedule:[],cap:14,index:0};
  game.fronts=[front];
  const enemy=(x,y)=>{const e={id:game.enemies.length+1,x,y,hp:100,max:100,speed:1.5,radius:.2,cooldown:0,front};
    game.enemies.push(e);return e;};
  ${body}
})()`);
test('敌人遇见领主进入交战，冷却期间停步，领主退出后继续进攻',()=>{
  const r=run(`
    game.phase='night';
    const e=enemy(8.3,5.5);
    calculateRoutes(front);
    moveEnemy(e,.05);
    const hp=game.hero.hp,x=e.x;
    for(let i=0;i<10;i++)moveEnemy(e,.05);
    const stopped=e.x===x&&!e.moving;
    game.hero.y=8.5;moveEnemy(e,.05);
    return [hp<100,stopped,e.x<x];
  `);
  assert.deepEqual(Array.from(r),[true,true,true]);
});
test('领主可以沿点击路线穿过塔与营地，敌人和城墙的碰撞保持',()=>{
  const r=run(`
    for(let x=6;x<=11;x++){tileAt(x,4).ground='water';tileAt(x,6).ground='water';}
    land(8,5).building={type:'tower',hp:90,max:90,level:0,cooldown:0};
    const core=land(9,5);core.campSolid=true;
    game.camps=[{id:'camp:1',number:1,tile:at(9,5),controlled:true}];
    const pass=canOccupy(game.hero,8.5,5.5)&&canOccupy(game.hero,9.5,5.5);
    setDestination(tileAt(10,5));for(let i=0;i<50;i++)moveHero(.05);
    const crossed=game.hero.x>10;
    Object.assign(game.hero,{x:7.5,y:5.5});keys.add('d');for(let i=0;i<25;i++)moveHero(.05);keys.clear();
    land(11,5).building={type:'wall'};
    return [pass,crossed,game.hero.x>10,!canOccupy({radius:.2},8.5,5.5),!canOccupy(game.hero,11.5,5.5)];
  `);
  assert.deepEqual(Array.from(r),[true,true,true,true,true]);
});
test('民兵与守卫可下令移动，并从实际站位攻击，普通居民可调动',()=>{
  const r=run(`
    game.resources.food=10;enlist();
    const militia=militiaUnits()[0],guard=addResident(),worker=addResident();
    guard.role='guard';
    const workerOrder=orderDefender(worker,tileAt(6,7));
    const militiaOrder=orderDefender(militia,tileAt(7,3));
    const guardOrder=orderDefender(guard,tileAt(7,4));
    game.phase='night';
    for(let i=0;i<50;i++){updateResidents(.05);updateMilitia(.05);}
    const e=enemy(8,4);
    fireTowers(.05);
    const projectiles=game.projectiles.map(p=>[p.source,p.sx,p.sy]);
    updateProjectiles(.31);
    return [workerOrder&&distance(worker,center(tileAt(6,7)))<.12,militiaOrder,guardOrder,
      projectiles.some(p=>p[0]==='militia'&&p[1]>7),
      projectiles.some(p=>p[0]==='guard'&&p[1]>7),e.hp<100];
  `);
  assert.deepEqual(Array.from(r),[true,true,true,true,true,true]);
});
test('桌面占领空地后可直接点建造城墙，资源格仍提示用途',()=>{
  const r=run(`
    game.resources={gold:20,material:20,food:4};game.actions=7;
    const t=tileAt(8,5);claim(t);
    const button=$('inspectBody').querySelectorAll('button').find(b=>b.textContent.startsWith('建造城墙'));
    if(button&&!button.disabled)button.click();
    const resource=tileAt(8,6);resource.node={kind:'farm'};claim(resource);
    return [!!button,t.building?.type,game.resources.material,$('inspectBody').textContent.includes('旁边占一格空地')];
  `);
  assert.deepEqual(Array.from(r),[true,'wall',15,true]);
});
test('点民兵、选移动、再点地图可下令，领主目标不变',()=>{
  const r=run(`
    game.resources.food=10;enlist();enlist();
    const units=militiaUnits(),unit=units[0],target=tileAt(7,7);
    const heroGoal=[center(tileAt(7,6))];
    game.hero.goal=heroGoal;
    mapClick(tileOf(unit),{x:unit.x,y:unit.y},true);
    const move=$('inspectBody').querySelectorAll('button').find(b=>b.textContent==='移动到指定地块');
    if(move)move.click();
    mapClick(tileAt(10,10),null,true);
    const stillOrdering=game.unitOrder===unit;
    mapClick(target,null,true);
    for(let i=0;i<60;i++)updateMilitia(.05);
    const e=enemy(7.5,6.5);
    game.phase='night';fireTowers(.05);
    const shots=game.projectiles.filter(p=>p.source==='militia');
    return [!!move,stillOrdering,!game.unitOrder,distance(unit,center(target))<.12,
      game.hero.goal===heroGoal,units.length,shots.length,shots[0]?.damage];
  `);
  assert.deepEqual(Array.from(r),[true,true,true,true,true,2,1,6]);
});
test('普通居民只移动，营地守卫攻击且不能被下令远程撤出营地',()=>{
  const r=run(`
    game.phase='night';
    const core=tileAt(20,5);core.campSolid=true;
    const camp={id:'camp:1',number:1,tile:at(20,5),controlled:true, lost:false};
    game.camps=[camp];
    const guard=addResident(), worker=addResident();
    for(const unit of [guard,worker]){
      unit.state='posted';unit.camp=camp.id;Object.assign(unit,center(tileAt(21,5)));
    }
    guard.role='guard';worker.role='miner';
    const outside=orderDefender(guard,tileAt(7,5));
    const inside=orderDefender(guard,tileAt(21,6));
    for(let i=0;i<25;i++)updateResidents(.05);
    enemy(22.5,6.5);fireTowers(.05);
    const shots=game.projectiles.filter(p=>p.source==='guard');
    return [outside,inside,shots.length,shots[0]?.sourceId,guard.camp,guard.state];
  `);
  assert.deepEqual(Array.from(r),[false,true,1,'guard:1','camp:1','posted']);
});
