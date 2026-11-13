() => {
  const results=[];
  const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
  const fresh=(seed=42)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    for(const t of game.tiles)t.visible=true;
    const site=tileAt(game.sites[0].x,game.sites[0].y);site.visible=true;chooseSite(0);
    Object.assign(game.hero,center(serviceTiles(site)[0]));game.hero.goal=null;
    return game;
  };
  const enemy=(x,y,hp=200)=>({id:9000+(game.nextEnemyId++),x,y,hp,max:hp,boss:false,heavy:false,
    radius:DEMO.radii.normal,speed:0,cooldown:99,flash:0,next:null,face:1,moving:false,
    rewardGold:0,rewardXp:0,settled:false});
  const events=kind=>game.combatEvents.filter(e=>e.kind===kind);
  const clearEvents=()=>{game.combatEvents=[];game.combatEventSeq=0;};
  // 受控平地：避开随机树石，保证近战测试测的是遮挡规则而不是地形运气
  const flat=()=>{
    for(let y=4;y<=8;y++)for(let x=6;x<=10;x++){
      const t=tileAt(x,y);
      if(!t)continue;
      t.ground='grass';t.node=null;t.building=null;t.campSolid=false;
    }
    invalidateNavigation();
  };

  // ---- A｜唯一命中事件与表现不倒灌业务 ----
  fresh();
  clearEvents();
  const e1=enemy(game.hero.x+.7,game.hero.y);
  game.enemies=[e1];
  const x0=e1.x,y0=e1.y,r0=e1.radius,hp0=e1.hp,resource0=JSON.stringify(game.resources);
  const evt=emitCombatEvent({kind:'hit',targetId:e1.id,amount:5,x:e1.x,y:e1.y});
  check('emitCombatEvent 只产出事件，不改血 / 不发奖励',
    e1.hp===hp0&&game.resources.gold===JSON.parse(resource0).gold&&evt.id===1);
  check('命中事件驱动飘字 / 火花，且 x/y 与半径不变',
    e1.x===x0&&e1.y===y0&&e1.radius===r0&&game.floats.length>0&&game.effects.length>0);
  clearEvents();game.floats=[];game.effects=[];
  damageEnemy(e1,17,'test',{dirX:1,dirY:0});
  check('单次命中只产生 1 个 hit 事件、闪白 0.08 秒',
    events('hit').length===1&&Math.abs(e1.flash-.08)<1e-6&&e1.hp===hp0-17);
  check('受击偏移只是视觉量，不改 x/y/半径，不改变碰撞结果',
    (e1.shakeX||0)!==0&&e1.x===x0&&e1.y===y0&&e1.radius===r0&&canOccupy(e1,e1.x,e1.y));
  damageEnemy(e1,3,'test');damageEnemy(e1,3,'test');
  check('普通多段同目标伤害飘字合并为一条且数值累加',
    game.floats.filter(f=>f.kind==='damage').length===1&&
    game.floats.find(f=>f.kind==='damage').amount===23);
  const gold0=game.resources.gold,kills0=game.kills;
  damageEnemy(e1,99999,'test');
  check('死亡只结算一次，重复伤害不再入账',
    e1.settled===true&&game.kills===kills0+1&&game.resources.gold===gold0);
  damageEnemy(e1,99999,'test');
  check('已结算对象再次受伤不重复结算',game.kills===kills0+1&&game.resources.gold===gold0);
  check('死亡立即退出存活判定，残影不挡路不吃伤害',
    game.corpses.length===1&&game.corpses[0].max>=.25&&game.corpses[0].max<=.4&&
    game.enemies.filter(e=>e.hp>0).length===0);

  fresh();
  clearEvents();
  const rich=enemy(game.hero.x+.6,game.hero.y,10);rich.rewardGold=3;rich.rewardXp=2;
  game.enemies=[rich];
  const bg=game.resources.gold,bx=game.xp;
  damageEnemy(rich,50,'rally');
  check('只有真正拿到奖励票据才发金 / 经验与对应飘字',
    game.resources.gold===bg+3&&game.xp===bx+2&&
    events('gold').length===1&&events('xp').length===1);
  check('没有票据的兵仍计真实击杀但不发资源',
    (()=>{const g=game.resources.gold,k=game.kills;const p=enemy(game.hero.x+.6,game.hero.y,1);
      game.enemies=[p];damageEnemy(p,50,'rally');
      return game.kills===k+1&&game.resources.gold===g;})());

  // ---- B｜领主挥击时序与近战遮挡 ----
  fresh();
  flat();
  game.phase='night';game.isBoss=false;
  Object.assign(game.hero,{x:8.5,y:6.5});
  const targetA=enemy(9.5,6.5,500);
  const targetB=enemy(7.5,6.5,500);
  game.enemies=[targetA,targetB];
  clearEvents();
  attack();
  check('attack 只起手：0.48 秒周期、蓄势阶段不造成伤害',
    Math.abs(game.hero.cooldown-.48)<1e-6&&game.hero.swing&&!game.hero.swing.fired&&
    targetA.hp===500&&targetB.hp===500);
  updateSwing(.06);
  check('0.06 秒蓄势结束时仍未出手',!game.hero.swing.fired&&targetA.hp===500);
  updateSwing(.11);
  check('0.16 秒挥击只触发一次伤害，最多 2 个目标，方向来自真实目标',
    game.hero.swing.fired&&events('swing').length===1&&
    targetA.hp<500&&targetB.hp<500&&game.hero.face===1);
  const hps=[targetA.hp,targetB.hp];
  updateSwing(.2);
  check('收招阶段不再重复伤害',targetA.hp===hps[0]&&targetB.hp===hps[1]);
  updateSwing(.2);
  check('0.48 秒后挥击结束',!game.hero.swing);
  // 移动不被整段锁死
  fresh();flat();game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5});
  game.enemies=[enemy(9.5,6.5,500)];
  attack();
  const hx=game.hero.x;
  keys.add('d');moveHero(.1);keys.clear();
  check('挥击期间仍可移动',game.hero.x>hx||game.hero.moving);
  // 墙 / 实体树石阻断近战
  fresh();flat();game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5});game.hero.cooldown=0;
  const wallTile=tileAt(9,6);
  wallTile.building={type:'wall',hp:100,max:100,cooldown:0};
  invalidateNavigation();
  const behind=enemy(9.5,6.5,500);
  game.enemies=[behind];
  clearEvents();
  attack();updateSwing(.2);
  check('隔墙目标不会被近战命中',behind.hp===500&&events('swing').length===1);
  wallTile.building=null;
  invalidateNavigation();
  check('手动 / 自动 / 移动端攻击共用同一入口',
    attack.toString().includes('h.swing=')&&moveHero.toString().includes('attack()')&&
    mapClick.toString().includes('attack()'));

  // ---- C｜弹体生命周期 ----
  fresh();
  game.phase='night';game.isBoss=false;game.clock=0;game.spawnStopped=true;
  const towerTile=game.tiles.find(t=>t.owned&&canBuildAt(t));
  towerTile.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
  const foe=enemy(towerTile.x+.9,towerTile.y+.5,300);
  game.enemies=[foe];
  game.fronts=[];game.militiaCooldown=999;
  clearEvents();
  fireTowers(.02);
  check('箭塔先发弹，不立即扣血',game.projectiles.length===1&&foe.hp===300&&
    events('launch').length===1&&game.projectiles[0].duration>=.1&&game.projectiles[0].duration<=.3);
  const proj=game.projectiles[0];
  check('弹体 ID 与目标单位 ID 稳定',!!proj.id&&proj.targetId===foe.id&&!!proj.sourceId);
  updateProjectiles(.05);
  check('弹体飞行中不结算伤害',foe.hp===300&&proj.t>0);
  // 目标提前死亡：消散、不转移伤害、不重复奖励
  foe.hp=0;foe.settled=true;game.enemies=[];
  updateProjectiles(.5);
  check('目标已死则弹体消散，不转移伤害、不发奖励',
    game.projectiles.length===0&&events('dissipate').length===1);
  // 源建筑被毁后已发射弹仍可命中
  fresh();game.phase='night';
  const t2=game.tiles.find(t=>t.owned&&canBuildAt(t));
  t2.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
  const foe2=enemy(t2.x+.8,t2.y+.5,300);game.enemies=[foe2];
  game.fronts=[];game.militiaCooldown=999;clearEvents();
  fireTowers(.02);
  t2.building=null;invalidateNavigation();
  updateProjectiles(.5);
  check('源建筑被毁后已发射弹继续飞行并正常命中',foe2.hp<300&&game.projectiles.length===0);
  check('resolveHit 每弹只结算一次',(p=>{
    const before=foe2.hp;
    const fake={id:999,targetId:foe2.id,sx:0,sy:0,x:foe2.x,y:foe2.y,damage:10,source:'test',settled:false};
    const a=resolveHit(fake),b=resolveHit(fake);
    return a===true&&b===false&&foe2.hp===before-10;
  })());

  // 最后一发弹在飞行时不天亮；死亡残影不阻止天亮
  fresh();game.phase='night';game.isBoss=false;game.spawnStopped=true;game.clock=200;
  game.fronts=[];game.enemies=[];game.projectiles=[];
  const last={id:1,targetId:1,sx:0,sy:0,x:1,y:1,tx:1,ty:1,t:0,duration:.3,
    damage:1,source:'test',settled:false,arc:true};
  game.projectiles.push(last);
  advanceBattle(.02);
  check('最后一发弹体飞行时不天亮',game.phase==='night'&&game.projectiles.length===1);
  game.projectiles=[];
  game.corpses.push({x:1,y:1,face:1,boss:false,t:0,max:.32});
  advanceBattle(.02);
  check('死亡残影不阻止天亮',game.phase==='day'&&game.day===2);
  // 暂停冻结弹体与特效
  fresh();game.phase='night';
  game.projectiles=[{id:2,targetId:1,sx:0,sy:0,x:1,y:1,tx:2,ty:2,t:0,duration:.3,
    damage:1,source:'test',settled:false,arc:true}];
  game.effects=[{type:'particle',x:1,y:1,vx:1,vy:0,time:.3,max:.3,color:'#fff'}];
  game.started=true;paused=true;
  tickCampaign(.2);
  check('暂停冻结弹体与特效',game.projectiles[0].t===0&&game.effects[0].time===.3);
  paused=false;
  // 重开清空旧弹体 / 挥击 / 死亡 / 演出
  fresh();game.phase='night';
  game.projectiles=[{id:3}],game.corpses=[{t:0,max:.3}],game.floats=[{time:.3}];
  game.hero.swing={t:0,fired:false};game.presentation={t:0,duration:.8};
  newRun();
  check('重新开局清空所有旧战斗表现',
    game.projectiles.length===0&&game.corpses.length===0&&game.floats.length===0&&
    game.effects.length===0&&!game.hero.swing&&!game.presentation);

  // ---- D｜首领胜利演出只结算一次 ----
  fresh(42);
  game.phase='night';game.day=5;game.isBoss=true;game.bossSpawned=true;
  game.fronts=[];game.enemies=[];game.projectiles=[];game.spawnStopped=true;
  game.clock=nightStopAt(5)+1;game.bossDefeated=true;game.finished=false;
  const goldBefore=game.resources.gold,xpBefore=game.xp,dayBefore=game.day;
  advanceBattle(.02);
  check('首领已死且清场后先进入 0.8 秒胜利表现，不立即结算',
    !!game.presentation&&game.phase==='night'&&!game.finished);
  for(let i=0;i<9;i++)advanceBattle(.1);
  check('演出结束只结算一次、无普通天亮生产与额外维护',
    game.phase==='won'&&game.finished===true&&game.day===dayBefore&&
    game.resources.gold===goldBefore&&game.xp===xpBefore);
  const book=game.ledger[5];
  check('胜利账本只关闭一次且未标记天亮',book.closed===true&&book.dawned===false);
  advanceBattle(1);
  check('重复推进不会二次结算',game.phase==='won'&&game.result.day===5);

  // ---- E｜音效降级、弱化效果、震屏不污染坐标 ----
  fresh();
  check('音频未解锁 / 不支持时 play 静默返回',(()=>{
    const saved=AudioKit.ctx,sup=AudioKit.supported;
    AudioKit.ctx=null;AudioKit.supported=false;
    let ok=true;try{AudioKit.play('swing');AudioKit.play('victory');}catch(e){ok=false;}
    AudioKit.ctx=saved;AudioKit.supported=sup;
    return ok;
  })());
  check('静音开关只影响表现',(()=>{
    game.settings.sound=false;
    const before=JSON.stringify(AudioKit.last);
    AudioKit.play('swing');
    const ok=JSON.stringify(AudioKit.last)===before;
    game.settings.sound=true;return ok;
  })());
  check('同类声音限流',(()=>{
    AudioKit.last={};AudioKit.ctx={state:'running',currentTime:0,createOscillator(){
      return {type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
        connect(){},start(){},stop(){}};},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};},destination:{}};
    const sup=AudioKit.supported;AudioKit.supported=true;
    AudioKit.play('death');const first=AudioKit.last.death;
    AudioKit.play('death');
    const ok=AudioKit.last.death===first;
    AudioKit.ctx=null;AudioKit.supported=sup;AudioKit.last={};
    return ok;
  })());
  check('unlockAudio 幂等且不抛异常',(()=>{
    let ok=true;try{unlockAudio();unlockAudio();}catch(e){ok=false;}return ok&&unlockAudio.done===true;
  })());
  game.settings.effects='standard';
  game.shake={t:0,mag:0};
  triggerShake(5);
  const camTx=camera.tx,camTy=camera.ty;
  const beforeTf=JSON.stringify([ctx.getTransform().e,ctx.getTransform().f]);
  draw();
  const afterTf=JSON.stringify([ctx.getTransform().e,ctx.getTransform().f]);
  const p=worldToScreen(8*CELL+8,6*CELL+8),g=screenToGrid(p.x,p.y);
  check('标准模式震屏只作用于 Canvas，恢复 ctx 且不改相机 / HUD / 坐标往返',
    game.shake.t>0&&camera.tx===camTx&&camera.ty===camTy&&beforeTf===afterTf&&
    !!(g&&g.x===8&&g.y===6)&&getComputedStyle($('mapWorld')).transform!=='none');
  game.settings.effects='weak';game.shake={t:0,mag:0};
  triggerShake(6);
  check('弱化模式关震屏并减少粒子',game.shake.t===0&&effectsWeak()===true);
  check('尊重 prefers-reduced-motion 接口',typeof reducedMotion()==='boolean');

  // 同种子业务结果在标准 / 弱化下完全一致
  const runMode=mode=>{
    fresh(7);
    game.settings.effects=mode;
    game.phase='night';game.isBoss=false;game.clock=0;game.spawnStopped=true;
    const t=game.tiles.find(c=>c.owned&&canBuildAt(c));
    t.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
    game.fronts=[];game.militiaCooldown=999;
    for(let i=0;i<3;i++)game.enemies.push(enemy(t.x+.6+i*.12,t.y+.5,60));
    for(let i=0;i<40;i++){fireTowers(.05);updateProjectiles(.05);updateEffects(.05);
      game.enemies=game.enemies.filter(e=>e.hp>0);}
    return {kills:game.kills,gold:game.resources.gold,xp:game.xp,
      enemies:game.enemies.length,castle:game.castleHp};
  };
  check('标准 / 弱化两种效果模式同种子业务结果完全一致',
    JSON.stringify(runMode('standard'))===JSON.stringify(runMode('weak')),
    JSON.stringify(runMode('standard'))+' vs '+JSON.stringify(runMode('weak')));

  // 效果预算：可丢弃次要特效，不能丢伤害 / 奖励事件
  fresh();
  clearEvents();
  for(let i=0;i<200;i++)emitCombatEvent({kind:'hit',targetId:i,amount:1,x:1,y:1,dirX:1,dirY:0});
  check('表现预算上限 150，超出只丢弃次要特效',
    game.effects.length+game.floats.length+game.corpses.length<=FX_CAP&&
    game.combatEvents.length>150);
  check('伤害 / 奖励事件一条不丢',events('hit').length===200);

  fresh();paused=true;sync();
  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
