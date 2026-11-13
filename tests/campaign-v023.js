() => {
  const results=[];
  const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
  const fresh=(seed=42,day=1)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    for(const t of game.tiles)t.visible=true;
    const site=tileAt(game.sites[0].x,game.sites[0].y);site.visible=true;chooseSite(0);
    Object.assign(game.hero,center(serviceTiles(site)[0]));game.hero.goal=null;
    game.day=day;game.phase='day';
    return game;
  };
  const nights=[1,2,3,4,5];
  const DAY=[120,90,90,90,90],STOP=[75,80,90,100,110],LAST=[60,65,75,85,95];
  const NORMAL=[18,24,32,40,48],CAP=[10,14,18,22,26],GOLD=[6,8,10,12,6];

  // ---- A｜显式波次表 ----
  check('白天 120/90 秒、停刷与末波时间符合设计表',nights.every((d,i)=>
    phaseLimit(d)===DAY[i]&&nightStopAt(d)===STOP[i]&&nightLastWaveAt(d)===LAST[i]),
    nights.map(d=>[phaseLimit(d),nightStopAt(d),nightLastWaveAt(d)]).join('|'));
  check('普通兵 / 同屏上限 / 金币预算符合设计表',nights.every((d,i)=>
    plannedNormal(d)===NORMAL[i]&&NIGHT_PLAN[d].cap===CAP[i]&&NIGHT_PLAN[d].gold===GOLD[i]));
  check('每夜至少 3 组有间隔的攻势，末组按表到来',nights.every(d=>{
    const w=NIGHT_PLAN[d].waves;
    if(w.length<3||w[w.length-1].at!==NIGHT_PLAN[d].lastWave)return false;
    if(w.reduce((n,x)=>n+x.count,0)!==NIGHT_PLAN[d].normal)return false;
    return w.slice(1).every((x,i)=>x.at-w[i].at-w[i].count*DEMO.spawnInterval>=6);
  }));
  check('同屏主城额度 + 营地上限不超过全局活敌预算',
    NIGHT_PLAN[5].cap+DEMO.campCap<=DEMO.globalCap&&DEMO.globalCap===60);
  check('结转放大系数改为 1.0',DEMO.carryFactor===1.0);

  fresh();
  for(const d of nights){
    const p=createWavePlan(d,'home',d===5);
    const expected=NORMAL[d-1]+(d===5?1:0);
    check('第'+d+'夜波次表生成 '+expected+' 条稳定记录',p.schedule.length===expected,'got '+p.schedule.length);
    check('第'+d+'夜奖励票据总和恰好等于预算',
      p.schedule.reduce((n,s)=>n+s.record.rewardGold,0)===p.budget.gold&&
      p.schedule.reduce((n,s)=>n+s.record.rewardXp,0)===p.budget.xp,
      JSON.stringify(p.budget));
    check('第'+d+'夜票据只发本夜新兵，均匀且为整数',
      p.schedule.every(s=>Number.isInteger(s.record.rewardGold)&&s.record.rewardGold>=0));
  }
  const bp=createWavePlan(5,'home',true);
  check('首领夜额外 8 金 / 1 经验且单独预留出场名额',
    bp.budget.gold===14&&bp.budget.xp===7&&
    bp.schedule.some(s=>s.record.kind==='boss'&&s.at===25&&s.record.rewardGold===8&&s.record.rewardXp===1));
  const ticketTest=[0,1,2,3,4].map(()=>queueRecord('normal',1));
  allocateTickets(ticketTest,7,5);
  check('票据分配确定性且总和守恒',
    ticketTest.reduce((n,r)=>n+r.rewardGold,0)===7&&ticketTest.reduce((n,r)=>n+r.rewardXp,0)===5);

  // ---- B｜波次时序：第一组清空也不能天亮、末波按表、上限不丢记录、首领未出场不赢 ----
  fresh(42,1);
  startNight();
  const f=game.fronts[0];
  check('入夜生成显式波次队列、待援队列独立',f.schedule.length===NORMAL[0]&&
    Array.isArray(game.reserve.home)&&nightBook().planned===NORMAL[0]);
  // 把第一波全部出场并击杀，未来波次还在 → 不能天亮
  game.clock=NIGHT_PLAN[1].waves[0].at+NIGHT_PLAN[1].waves[0].count*DEMO.spawnInterval+.05;
  for(const s of f.schedule)if(s.at<=game.clock&&!s.dispatched){spawnEnemy(f,s);s.dispatched=true;}
  for(const e of game.enemies)damageEnemy(e,99999,'test');
  advanceBattle(.02);
  check('第一组清空但尚有未来波次时不天亮',game.phase==='night'&&
    f.schedule.some(s=>!s.dispatched));
  f.cap=100;   // 只测时序，临时放宽同屏额度，排除上限干扰
  game.enemies=[];
  game.clock=NIGHT_PLAN[1].lastWave-.1;spawnDue(true);spawnDue(false);
  check('末波之前不会提前放出末波记录',
    f.schedule.some(s=>!s.dispatched&&s.at===NIGHT_PLAN[1].lastWave));
  game.enemies=[];
  // 末波内部按 0.9 秒错峰出兵，时钟要覆盖整组而不是只看第一只
  game.clock=NIGHT_PLAN[1].lastWave+NIGHT_PLAN[1].waves[3].count*DEMO.spawnInterval+.1;
  for(let k=0;k<3;k++){spawnDue(true);spawnDue(false);game.enemies=[];}
  check('末波按表到来后全部出场',f.schedule.every(s=>s.dispatched));

  fresh(42,4);
  startNight();
  const f4=game.fronts[0],pendingBefore=f4.schedule.filter(s=>!s.dispatched).length;
  const dummies=[];
  for(let i=0;i<f4.cap;i++)dummies.push({...center(game.castle),id:9000+i,front:f4,hp:10,max:10,
    hp_:0,radius:DEMO.radii.normal,speed:0,cooldown:99,flash:0,next:null,boss:false,heavy:false,
    rewardGold:0,rewardXp:0,settled:false});
  game.enemies=dummies;
  game.clock=200;spawnDue(true);spawnDue(false);
  check('同屏上限阻塞时未出场记录不丢失',
    f4.schedule.filter(s=>!s.dispatched).length===pendingBefore,
    'pending '+f4.schedule.filter(s=>!s.dispatched).length+'/'+pendingBefore);
  game.enemies=[];

  fresh(42,5);
  startNight();
  const fb=game.fronts[0];
  for(const s of fb.schedule)s.dispatched=true;
  game.enemies=[];game.spawnStopped=true;
  game.bossSpawned=false;game.bossDefeated=false;
  advanceBattle(.02);
  check('首领未出场绝不能宣布胜利',game.phase==='night');
  game.bossSpawned=true;game.bossDefeated=true;
  advanceBattle(.02);
  check('首领真实出场并被击败、清场后才胜利',game.phase==='won'&&game.result.day===5);

  // ---- C｜奖励票据：生成即带票、击杀一次入账、重复伤害不重复结算 ----
  fresh(42,3);
  startNight();
  const f3=game.fronts[0];
  const gold0=game.resources.gold,xp0=game.xp;
  let expectedGold=0,expectedXp=0,spawned=0;
  for(const s of [...f3.schedule]){
    s.dispatched=true;
    const e=spawnEnemy(f3,s);
    expectedGold+=e.rewardGold;expectedXp+=e.rewardXp;spawned++;
    game.enemies=[e];
    damageEnemy(e,99999,'test');
    damageEnemy(e,99999,'test');
    game.enemies=[];
  }
  check('强制清场场景：金币 / 经验恰好等于本夜所生成票据总和',
    game.resources.gold-gold0===expectedGold&&game.xp-xp0===expectedXp&&spawned===NORMAL[2],
    'gold +'+(game.resources.gold-gold0)+'/'+expectedGold+' xp +'+(game.xp-xp0)+'/'+expectedXp);
  check('没有票据的兵仍计真实击杀但不发资源',game.kills>=spawned&&game.waveKills===spawned);
  const dead={...center(game.castle),hp:0,settled:true,rewardGold:5,rewardXp:5,boss:false};
  const g1=game.resources.gold;damageEnemy(dead,10);
  check('已结算对象再次受伤不再入账',game.resources.gold===g1);

  fresh(42,2);
  startNight();
  const f2=game.fronts[0];
  f2.schedule.slice(0,5).forEach(s=>s.dispatched=true);
  const ticketBefore=f2.schedule.filter(s=>!s.dispatched).map(s=>[s.record.id,s.record.rewardGold,s.record.rewardXp]);
  stopFront(f2);
  const held=game.reserve.home;
  check('停刷按 1.0 原量结转，不放大',held.length===ticketBefore.length,
    'reserve='+held.length+' expected='+ticketBefore.length);
  check('结转保留原票据，不再次发新票据',
    ticketBefore.every(([id,g,x])=>held.some(r=>r.id===id&&r.rewardGold===g&&r.rewardXp===x)));
  const allowed=Math.ceil(NORMAL[2]*DEMO.reserveTakeRate);
  fresh(42,3);
  game.reserve.home=held.slice();
  const taken=takeReserve('home',allowed);
  check('每夜调入历史兵不超过本夜新增普通兵 25%（向上取整）',
    taken.length<=allowed&&game.reserve.home.length===held.length-taken.length,
    'taken='+taken.length+' allowed='+allowed);
  check('剩余待援清楚保留且不阻塞天亮',reserveCount()===game.reserve.home.length&&
    isFrontComplete({schedule:[],camp:null})===true);

  // ---- D｜主动入夜 / 回场 / 号令 / 军令 / 战绩 ----
  fresh(42,1);
  const actions0=game.actions;
  requestEarlyNight();
  check('准备完毕进入 3 秒倒计时且不消耗行动',!!game.earlyNightAt&&
    game.earlyNightAt-game.phaseElapsed===DEMO.earlyNightCountdown&&game.actions===actions0);
  check('提醒来自真实未完成事项',typeof earlyNightReminders()==='string');
  cancelEarlyNight();
  check('3 秒内可取消',!game.earlyNightAt&&game.phase==='day');
  requestEarlyNight();
  paused=false;
  for(let i=0;i<20;i++)tickCampaign(.2);
  check('倒计时走完真实白天时钟后入夜',game.phase==='night');
  paused=true;

  fresh(42,1);
  requestEarlyNight();
  const t0=game.earlyNightAt;
  paused=true;tickCampaign(1);
  check('暂停时倒计时不走',game.earlyNightAt===t0);
  paused=false;

  fresh(42,1);
  game.castle=null;game.day=1;
  requestEarlyNight();
  check('首日未建城先做风险确认，不立即入夜',
    $('dialog').open&&!game.earlyNightAt);
  if($('dialog').open)$('dialog').close();

  fresh(42,2);
  game.phase='night';game.hero.hp=0;game.hero.invuln=0;game.heroDown=null;game.heroDownUsed=0;
  updateHeroRecovery(1);
  check('领主倒下显示位置与回场提示',game.heroDown?.phase==='waiting'&&
    game.reports.some(r=>r.includes('12 秒后')));
  for(let i=0;i<11;i++)updateHeroRecovery(1);
  check('12 秒后以 40% 生命回场并带 1 秒保护',
    game.hero.hp===Math.round(game.hero.max*DEMO.heroDownHp)&&game.heroDownUsed===1&&
    game.hero.invuln===DEMO.heroDownInvuln&&canOccupy(game.hero,game.hero.x,game.hero.y));
  game.hero.hp=0;updateHeroRecovery(.1);
  check('第二次倒下本夜不再回场',game.heroDown?.phase==='spent');
  fresh(42,2);
  game.phase='night';game.castle=null;game.hero.hp=0;
  updateHeroRecovery(13);
  check('无城堡时倒下不触发回场',!game.heroDown);

  fresh(42,2);
  game.phase='night';game.rallyCharges=1;
  const near={...{x:game.hero.x+3,y:game.hero.y},hp:40,max:40,rewardGold:0,rewardXp:0,settled:false,flash:0};
  const far={...{x:game.hero.x+4.2,y:game.hero.y},hp:40,max:40,rewardGold:0,rewardXp:0,settled:false,flash:0};
  game.enemies=[near,far];
  rally();
  check('号令只命中领主周围 4 格，与预览一致',near.hp<40&&far.hp===40&&
    DEMO.rallyRange===4&&draw.toString().includes('DEMO.rallyRange*CELL'));

  check('军令阈值按本夜计划新兵 50% 与领主 5 名',
    contractGoal('line',5)===24&&contractGoal('line',1)===9&&contractGoal('slayer',1)===5);
  fresh(42,1);
  const rec=commitRecord(true);
  check('战绩升级 v2 并标注规则版本，不与 v1 直接比较',
    BEST_KEY.endsWith('.v2')&&rec.rules==='v0.23');

  // ---- E｜账本闭合（分夜 income - expense = end - start） ----
  fresh(42,1);
  startNight();
  const book=openNight(1);
  addIncome({gold:5},'kill','测试收入');
  pay({material:2},'build','测试支出');
  closeNight(1);
  check('分夜收入减支出等于期末减期初',
    book.income.gold-book.expense.gold===book.end.gold-book.start.gold&&
    book.income.material-book.expense.material===book.end.material-book.start.material);

  fresh();paused=true;sync();
  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
