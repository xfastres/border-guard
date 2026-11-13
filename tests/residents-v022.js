() => {
  const results=[];
  const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
  const fresh=(seed=42)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    const t=tileAt(game.sites[0].x,game.sites[0].y);t.visible=true;chooseSite(0);
    Object.assign(game.hero,center(serviceTiles(t)[0]));game.hero.goal=null;
    return game;
  };
  const allVisible=()=>game.tiles.length&&game.residents.filter(r=>r.state!=='dead');
  const run=(dt=0.09,steps=600,until=null)=>{
    for(let i=0;i<steps;i++){
      updateResidents(dt);
      if(until&&until())return true;
    }
    return false;
  };

  // ---- A｜每 ID 恰好一个可见单位，所有静止状态都在合法站位 ----
  fresh();
  check('开局两名居民在城堡外侧的合法站位',game.residents.length===2&&
    game.residents.every(r=>r.state==='home'&&canOccupy(r,r.x,r.y)&&!tileSolid(tileAt(Math.floor(r.x),Math.floor(r.y)))));
  check('同一居民 ID 只出现一次',new Set(game.residents.map(r=>r.id)).size===game.residents.length);
  const states=['home','posted','waiting','hurt'];
  for(const st of states){
    const r=game.residents[0];r.state=st;r.slot=null;
    updateResidents(.1);
    const pose=getResidentPose(r,1000);
    check('状态 '+st+' 有独立可见表现',pose.visible&&pose.state===st&&
      (['home','posted'].includes(st)?['idle','work','guard'].includes(pose.activity):pose.badge!==''));
  }
  game.residents[0].state='dead';
  check('dead 不再出现在地图',!getResidentPose(game.residents[0],0).visible);
  fresh();
  const roleColors={miner:'#c9a55e',wood:'#77a86b',guard:'#8fa9c4'};
  check('三种职业有可辨识的绘制分支',['miner','wood','guard'].every(k=>drawResident.toString().includes(roleColors[k])));
  check('民兵只按真实数量绘制，不产生额外攻击单位',
    drawMilitia.toString().includes('i<game.militia')&&fireTowers.toString().includes('game.militia*'));

  // ---- B｜派驻 / 到岗付费 / 路线失效与重试 ----
  fresh();
  for(const t of game.tiles)t.visible=true;
  const c=createCamp(tileAt(15,5));
  check('合法营地建立成功且核心成为实体',!!c&&campTile(c).campSolid&&!walkable(campTile(c)));
  if(c){
    const r=game.residents[0];r.role='miner';
    const bag0=JSON.stringify(game.resources);
    const ok=dispatchResident(r,c);
    check('派驻从合法站位出发且路点全是可达服务位',ok&&r.state==='outbound'&&
      r.route.every(p=>walkable(tileAt(Math.floor(p.x),Math.floor(p.y))))&&canOccupy(r,r.x,r.y));
    check('派驻本身不提前支付维护',JSON.stringify(game.resources)===bag0);
    // 用墙把营地四邻全封住（绕过建造校验，纯粹构造「暂时不可达」）
    const ring=dirs.map(([dx,dy])=>tileAt(campTile(c).x+dx,campTile(c).y+dy)).filter(Boolean);
    const savedRing=ring.map(t=>[t,t.building,t.ground]);
    for(const t of ring){t.ground='grass';t.node=null;t.building={type:'wall',hp:100,max:100,cooldown:0};}
    invalidateNavigation();
    run(.09,40,()=>r.blocked);
    check('道路被封：原地等待、不瞬移、不提前到岗付费',
      r.blocked===true&&r.state==='outbound'&&!c.controlled&&!c.paid.has(r.id)&&
      canOccupy(r,r.x,r.y),'state='+r.state+' blocked='+r.blocked);
    check('受阻时有明确的道路受阻提示',game.reports.some(x=>x.includes('道路受阻')));
    // 拆掉一面墙后自动重试
    ring[0].building=null;
    invalidateNavigation();
    const arrived=run(.09,900,()=>r.state==='posted');
    check('拆障碍后重算路线并真实到岗',arrived&&r.state==='posted'&&c.controlled);
    const bag1=JSON.stringify(game.resources),paid=c.paid.has(r.id);
    returnResident(r);r.camp=c.id;Object.assign(r,center(campTile(c)));postResident(r,c);
    check('同周期同人不重复支付维护',JSON.stringify(game.resources)===bag1&&paid);
    for(const [t,b,g] of savedRing){t.building=b;t.ground=g;}
    invalidateNavigation();
  }

  // ---- C｜伤员按人计数、阵亡按 ID、真实维修事件 ----
  fresh();
  const book=nightBook();
  const r0=game.residents[0];r0.hp=28;r0.hitCount=0;
  for(let i=0;i<4;i++)hurtResident(r0);
  check('同一居民同夜受击4次只算1名伤员，受击次数另存',book.hurt===1&&r0.hitCount===4,'hurt='+book.hurt+' hits='+r0.hitCount);
  fresh();
  const b2=nightBook(),a=game.residents[0],b=game.residents[1];
  a.hp=28;b.hp=28;
  hurtResident(a);hurtResident(a);hurtResident(b);hurtResident(b);
  check('两名居民受伤计为2，不按受击次数膨胀',b2.hurt===2,'hurt='+b2.hurt);
  fresh();
  game.hard=true;
  const b3=nightBook(),d=game.residents[0];d.hp=7;
  hurtResident(d);hurtResident(d);
  check('阵亡按 ID 去重且不再继续受击',b3.dead===1&&d.state==='dead'&&d.hitCount===1,'dead='+b3.dead);
  fresh();
  const b4=nightBook();
  const bt=game.tiles.find(t=>t.owned&&t!==game.castle&&walkable(t));
  bt.building={type:'wall',hp:10,max:100,cooldown:0};
  const before=b4.repairs;
  repair(bt);
  check('维修统计来自真实修复事件',b4.repairs===before+1&&bt.building.hp===bt.building.max);

  // ---- D｜朝向与步态来自真实位移 ----
  fresh();
  const hero=game.hero;
  hero.x=8.5;hero.y=5.5;
  const x0=hero.x;
  keys.add('d');moveHero(.1);keys.clear();
  const right=hero.moving&&hero.face===1;
  hero.x=8.5;hero.y=5.5;
  keys.add('a');moveHero(.1);keys.clear();
  check('左右移动产生真实位移与 face 翻转',right&&hero.moving&&hero.face===-1&&hero.x<x0);
  check('人物绘制读取 face / moving / 真实位移',
    fighter.toString().includes('e.face<0?-1:1')&&fighter.toString().includes('e.moving'));
  check('渲染按脚底 Y 排序并支持树冠半透明',
    draw.toString().includes('sprites.sort((a,b)=>a.y-b.y)')&&draw.toString().includes('globalAlpha=.78'));

  // ---- E｜旧回归意图在新规则下仍成立（适配服务位半径） ----
  const survivor=(boss=false)=>{
    game.phase='night';game.isBoss=boss;game.bossDefeated=false;game.bossSpawned=!!boss;
    game.clock=18;game.cleanup=0;game.spawnStopped=true;
    const f=makeFront('home',null,createWavePlan(1,'home',false),[]);
    for(const entry of f.schedule)entry.dispatched=true;
    const edge=game.tiles.filter(t=>t.x===WIDTH-1&&walkable(t)).sort((a,b)=>b.y-a.y)[0]||tileAt(WIDTH-1,HEIGHT-1);
    f.gates=[edge];f.stopped=true;f.bossPending=false;calculateRoutes(f,game.castle);game.fronts=[f];
    const e={...center(edge),front:f,hp:100,max:100,speed:0,cooldown:0,flash:0,boss,
      radius:DEMO.radii.normal,next:null,routeRevision:navigationRevision()};
    game.enemies=[e];return e;
  };
  fresh();
  let e=survivor();
  advanceBattle(9);
  check('普通残敌不因清场超时消失',game.phase==='night'&&game.enemies.includes(e)&&e.hp>0);
  fresh();
  survivor(true);
  advanceBattle(9);
  check('首领未被击杀不判胜',game.phase==='night');
  fresh();
  e=survivor(true);e.front.route.fill(Infinity);e.stuck=2.49;e.retried=true;
  moveEnemy(e,.1);
  check('卡路敌人不被当作死亡删除',e.hp>0);
  fresh();
  e=survivor(true);
  damageEnemy(e,1000);
  for(let i=0;i<20&&game.phase!=='won';i++)advanceBattle(.1);
  check('真实击杀首领且清完场才胜利',game.phase==='won'&&game.kills===1);
  fresh();
  game.hard=true;game.autoAttack=true;introDone=true;setPaused(true);newRun();
  check('重开保留难度与自动攻击并解除暂停',game.hard&&game.autoAttack&&!paused);
  check('重开清空旧局居民与敌人',game.residents.length===0&&game.enemies.length===0);
  fresh();
  const rich=game.tiles.find(t=>t.node?.kind==='rich'),iron=game.tiles.find(t=>t.node?.kind==='iron');
  check('富矿 / 铁矿 / 遗迹都有可达服务位（不再要求走进实体格中心）',
    !!findApproachPath(game.hero,rich)&&!!findApproachPath(game.hero,iron)&&
    !!findApproachPath(game.hero,game.tiles.find(t=>t.node?.kind==='relic')));

  fresh();paused=true;sync();
  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
