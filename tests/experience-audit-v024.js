() => {
  const results=[];
  const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
  const fresh=(seed=42)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    for(const t of game.tiles)t.visible=true;
    chooseSite(0);
    Object.assign(game.hero,center(serviceTiles(game.castle)[0]));
    game.hero.goal=null;game.heroGoalTile=null;
    return game;
  };
  const flatten=(x0,y0,x1,y1)=>{
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=tileAt(x,y);
      if(!t||t===game.castle)continue;
      t.ground='grass';t.node=null;t.building=null;t.campSolid=false;
    }
    invalidateNavigation();
  };
  const enemy=(x,y,hp=30)=>({id:9000+(game.nextEnemyId++),x,y,hp,max:hp,boss:false,heavy:false,
    radius:DEMO.radii.normal,speed:0,cooldown:99,flash:0,next:null,face:1,moving:false,
    rewardGold:0,rewardXp:0,settled:false,front:{camp:null,route:[],targetIndex:-1},
    routeRevision:navigationRevision()});
  const events=kind=>game.combatEvents.filter(e=>e.kind===kind);
  const clearEvents=()=>{game.combatEvents=[];game.combatEventSeq=0;game.floats=[];game.effects=[];};
  const endpoint=()=>game.hero.goal?.[game.hero.goal.length-1];

  // ---- 点地：精确落格，建筑仍是服务位 ----
  fresh();flatten(4,5,12,9);
  Object.assign(game.hero,{x:8.5,y:6.5,goal:null});
  setDestination(tileAt(5,6));
  const end=endpoint();
  check('直线点地终点是目标格中心',!!end&&Math.abs(end.x-5.5)<1e-6&&Math.abs(end.y-6.5)<1e-6,
    end&&(end.x+','+end.y));
  check('目标格记录仍是被点中的格子',game.heroGoalTile&&game.heroGoalTile.x===5&&game.heroGoalTile.y===6);
  for(let i=0;i<80&&game.hero.goal?.length;i++)moveHero(.1);
  check('领主最终走进目标格',tileOf(game.hero).x===5&&tileOf(game.hero).y===6&&distance(game.hero,{x:5.5,y:6.5})<.12,
    game.hero.x.toFixed(2)+','+game.hero.y.toFixed(2));

  fresh();flatten(4,4,12,10);
  Object.assign(game.hero,{x:8.5,y:6.5,goal:null});
  setDestination(tileAt(5,8));
  const diag=endpoint();
  check('斜向点地终点仍是目标格中心',!!diag&&Math.abs(diag.x-5.5)<1e-6&&Math.abs(diag.y-8.5)<1e-6,
    diag&&(diag.x+','+diag.y));

  fresh();
  const far=game.tiles.find(t=>walkable(t)&&t.x>=WIDTH-2&&t.y>2&&t.y<HEIGHT-2);
  if(far){
    setDestination(far);
    const last=endpoint();
    check('远处可通行格的终点就是该格中心',!!last&&Math.abs(last.x-(far.x+.5))<1e-6&&Math.abs(last.y-(far.y+.5))<1e-6);
  }else check('存在远处可通行格',false);

  fresh();flatten(4,5,12,8);
  Object.assign(game.hero,{x:8.5,y:6.5,goal:null});
  setDestination(tileAt(5,6));
  invalidateNavigation();
  moveHero(.05);
  const again=endpoint();
  check('道路重算后终点仍不提前一格',!!again&&Math.abs(again.x-5.5)<1e-6&&Math.abs(again.y-6.5)<1e-6,
    again&&(again.x+','+again.y));

  fresh();
  setDestination(game.castle);
  const svc=endpoint();
  const svcTile=svc&&tileAt(Math.floor(svc.x),Math.floor(svc.y));
  check('回城停在城堡相邻服务位',!!svcTile&&svcTile!==game.castle&&walkable(svcTile)&&
    Math.max(Math.abs(svcTile.x-game.castle.x),Math.abs(svcTile.y-game.castle.y))===1);
  const tower=tileAt(game.castle.x+2,game.castle.y);
  tower.ground='grass';tower.node=null;tower.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
  invalidateNavigation();
  setDestination(tower);
  const towerEnd=endpoint();
  const towerTile=towerEnd&&tileAt(Math.floor(towerEnd.x),Math.floor(towerEnd.y));
  check('箭塔交互停在相邻服务位',!!towerTile&&towerTile!==tower&&walkable(towerTile));
  const hx=game.hero.x;
  keys.add('d');moveHero(.2);keys.clear();
  check('WASD 仍直接移动且取消点击路线',game.hero.x>=hx&&!game.hero.goal);

  // ---- 护送：绕墙、封路、拆障 ----
  fresh();flatten(6,4,11,8);
  const wall=tileAt(8,6);
  wall.building={type:'wall',hp:100,max:100,cooldown:0};
  invalidateNavigation();
  const r=game.residents[0];
  returnResident(r,true);
  r.x=7.78;r.y=6.7;r.route=[];r.routeRevision=-1;
  Object.assign(game.hero,{x:8.7,y:5.8,hp:100});
  for(let i=0;i<100;i++)updateResidents(.05);
  check('墙角护送能绕到跟随距离',r.state==='escorted'&&!r.blocked&&distance(r,game.hero)<.95,
    'd='+distance(r,game.hero).toFixed(3)+' blocked='+r.blocked+' state='+r.state+' xy='+r.x.toFixed(2)+','+r.y.toFixed(2));
  check('绕行没有误报安全回城',!game.reports.some(x=>x.includes('已安全回城')||x.includes('到岗')));

  fresh();flatten(6,4,11,8);
  const boxed=game.residents[0];
  Object.assign(boxed,{x:8.5,y:6.5});
  Object.assign(game.hero,{x:12.5,y:6.5,hp:100});
  for(const [dx,dy] of dirs){
    const t=tileAt(8+dx,6+dy);
    if(t){t.ground='grass';t.node=null;t.building={type:'wall',hp:80,max:80,cooldown:0};}
  }
  invalidateNavigation();
  returnResident(boxed,true);
  boxed.x=8.5;boxed.y=6.5;boxed.routeRevision=-1;
  for(let i=0;i<20;i++)updateResidents(.05);
  check('封死道路约 0.9 秒内进入受阻',boxed.blocked===true&&boxed.state==='escorted'&&
    game.reports.some(x=>x.includes('道路受阻')),'blocked='+boxed.blocked);
  tileAt(9,6).building=null;
  invalidateNavigation();
  let moved=false;
  for(let i=0;i<80;i++){
    const x0=boxed.x;
    updateResidents(.05);
    if(!boxed.blocked&&Math.hypot(boxed.x-x0,boxed.y-6.5)>.02){moved=true;break;}
  }
  check('拆障后护送继续且不误回城',moved&&boxed.state==='escorted'&&!game.reports.some(x=>x.includes('已安全回城')));

  // ---- 近战、自动攻击、受击、弹体、墙塔 ----
  fresh();flatten(6,4,11,8);game.phase='night';
  const dirsHit=[[1,0],[-1,0],[0,1],[0,-1]];
  const damages=[];
  for(const [dx,dy] of dirsHit){
    Object.assign(game.hero,{x:8.5,y:6.5,cooldown:0,swing:null,face:1});
    const foe=enemy(8.5+dx,6.5+dy,30);
    game.enemies=[foe];clearEvents();
    attack();updateSwing(.2);
    damages.push(30-foe.hp);
  }
  check('四方向近战伤害仍各为 18',damages.every(n=>n===18),damages.join(','));
  check('挥击只保留一套全向范围表现',drawCombatLayer.toString().includes('1.35*CELL')&&
    !fighter.toString().includes('ctx.arc(0,0,33'));
  fresh();flatten(6,4,11,8);game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5,cooldown:0});
  const a=enemy(9.4,6.5,40),b=enemy(8.5,7.4,40);
  game.enemies=[a,b];clearEvents();
  attack();updateSwing(.2);
  check('两个目标同时命中且都记在挥击状态里',a.hp<40&&b.hp<40&&game.hero.swing?.targets?.length===2);

  fresh();flatten(6,4,11,8);game.phase='night';game.autoAttack=true;
  Object.assign(game.hero,{x:8.5,y:6.5,cooldown:0,swing:null});
  const blockedWall=tileAt(9,6);
  blockedWall.building={type:'wall',hp:100,max:100,cooldown:0};
  const behind=enemy(9.6,6.5,30);
  game.enemies=[behind];clearEvents();
  moveHero(.05);
  check('隔墙自动攻击不进入冷却、不挥击',!game.hero.swing&&game.hero.cooldown===0&&behind.hp===30);
  blockedWall.building=null;invalidateNavigation();
  moveHero(.05);updateSwing(.2);
  check('通视恢复后自动攻击造成 18 伤害',behind.hp===12);
  fresh();flatten(6,4,11,8);game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5,cooldown:0});
  const manualWall=tileAt(9,6);
  manualWall.building={type:'wall',hp:100,max:100,cooldown:0};
  const manual=enemy(9.6,6.5,30);
  game.enemies=[manual];clearEvents();
  attack();updateSwing(.2);
  check('手动隔墙攻击规则保持可空挥且不命中',manual.hp===30&&events('swing').length===1);

  fresh();flatten(6,4,11,8);game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5,hp:100,max:100});
  const biter=enemy(9.1,6.5,30);biter.cooldown=0;
  game.enemies=[biter];clearEvents();
  const cd0=biter.cooldown;
  moveEnemy(biter,.05);
  check('玩家 100→96 只有一次受击反馈',game.hero.hp===96&&events('heroHit').length===1&&
    game.floats.some(f=>f.kind==='damage')&&game.hero.hurt>0&&biter.cooldown>.9,
    'hp='+game.hero.hp+' events='+events('heroHit').length+' cd0='+cd0);
  const floats=game.floats.length,ev=events('heroHit').length;
  moveEnemy(biter,.05);
  check('冷却未好时不重复扣血、不重复反馈',game.hero.hp===96&&events('heroHit').length===ev&&game.floats.length===floats);

  fresh();game.phase='night';game.fronts=[];game.militiaCooldown=999;
  const shotTile=tileAt(10,8);
  shotTile.ground='grass';shotTile.node=null;shotTile.building={type:'tower',hp:90,max:90,level:0,cooldown:0};
  shotTile.owned=true;
  const mover=enemy(shotTile.x+.5,shotTile.y+1.2,30);
  game.enemies=[mover];game.projectileImpacts=[];clearEvents();
  fireTowers(.02);
  check('弹体先飞出',game.projectiles.length===1&&mover.hp===30);
  updateProjectiles(.04);
  mover.x=shotTile.x+3;mover.y=shotTile.y+3;
  updateProjectiles(1);
  const impact=game.projectileImpacts[0];
  check('结算帧视觉终点跟着目标',!!impact&&Math.hypot(impact.x-mover.x,impact.y-mover.y)<.05&&mover.hp<30,
    impact&&('d='+Math.hypot(impact.x-mover.x,impact.y-mover.y).toFixed(3)));
  check('每弹只结算一次',game.projectiles.length===0&&events('hit').length===1);

  fresh();flatten(18,8,24,14);game.phase='night';
  const brick=tileAt(20,10);
  brick.building={type:'wall',hp:40,max:100,cooldown:0};
  const smasher=enemy(20.5,10.95,30);smasher.cooldown=0;smasher.next=brick;
  smasher.routeRevision=navigationRevision();
  game.enemies=[smasher];clearEvents();game.buildingFlash={};
  moveEnemy(smasher,.05);
  check('墙被扣血时有一次闪色和反馈',brick.building.hp<40&&game.buildingFlash[at(20,10)]>0&&events('structureHit').length===1,
    'hp='+brick.building.hp+' flash='+(game.buildingFlash[at(20,10)]||0)+' ev='+events('structureHit').length+' cd='+smasher.cooldown);
  const hpLeft=brick.building.hp,nEv=events('structureHit').length;
  moveEnemy(smasher,.05);
  check('冷却中的墙不重复闪',brick.building.hp===hpLeft&&events('structureHit').length===nEv);
  smasher.cooldown=0;brick.building.hp=8;
  const reports0=game.reports.filter(x=>x.includes('被摧毁')).length;
  moveEnemy(smasher,.05);
  check('墙被摧毁只报告一次',!brick.building&&game.reports.filter(x=>x.includes('被摧毁')).length===reports0+1,
    'building='+!!brick.building+' reports='+game.reports.filter(x=>x.includes('被摧毁')).length+' hp='+(brick.building&&brick.building.hp));

  // ---- 军令、按钮、文案 ----
  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='flawless'),goal:1};
  game.nightStartHp=game.castleHp;
  check('零伤害时不落一砖成立',contractMet(game.contract.chosen)===true);
  game.ledger[game.day].castleDamage=25;
  game.castleHp=game.nightStartHp;
  check('受伤后修满不能完成不落一砖',contractMet(game.contract.chosen)===false);
  game.castleHp=game.nightStartHp-10;
  check('部分维修仍然失败',contractMet(game.contract.chosen)===false);
  game.ledger[game.day].castleDamage=0;
  game.castleHp=game.nightStartHp-4;
  check('没有账本伤害但当前耐久更低也失败',contractMet(game.contract.chosen)===false);
  const saved=game.ledger;game.ledger=null;
  check('没有账本时不落一砖保守失败',contractMet(game.contract.chosen)===false);
  game.ledger=saved;
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='line'),goal:3};
  game.waveKills=3;
  check('其他军令仍按原进度',contractMet(game.contract.chosen)===true);

  fresh();game.phase='night';renderQuestBar();
  check('夜间未接军令不留下可点的空按钮',$('questChoices').children.length===0&&
    $('questContract').textContent.includes('白天可接'));
  game.phase='day';renderQuestBar();
  check('白天仍可选择或跳过军令',$('questChoices').children.length===3);

  fresh();game.phase='night';game.castleHp=game.castleMax;game.hero.hp=game.hero.max;game.resources.gold=20;
  renderCommands();
  const nightButtons=[...$('commandBar').children];
  const repairBtn=nightButtons.find(b=>b.textContent.includes('城堡急修'));
  const healBtn=nightButtons.find(b=>b.textContent.includes('使用药剂'));
  check('满血急修和药剂不可点并写明原因',!!repairBtn&&repairBtn.disabled&&repairBtn.textContent.includes('耐久已满')&&
    !!healBtn&&healBtn.disabled&&healBtn.textContent.includes('生命已满'));
  game.castleHp-=10;game.hero.hp-=10;game.resources.gold=0;renderCommands();
  const poor=[...$('commandBar').children];
  const repairPoor=poor.find(b=>b.textContent.includes('城堡急修'));
  const healPoor=poor.find(b=>b.textContent.includes('使用药剂'));
  check('资源不足时按钮不可点并说明金币不足',repairPoor.disabled&&repairPoor.textContent.includes('金币不足')&&
    healPoor.disabled&&healPoor.textContent.includes('金币不足'));
  game.resources.gold=20;game.castleHp=game.castleMax-10;renderCommands();
  const ready=[...$('commandBar').children].find(b=>b.textContent.includes('城堡急修'));
  const gold0=game.resources.gold,hp0=game.castleHp;
  ready.click();
  check('受伤且资源足够时急修只扣一次',game.resources.gold===gold0-5&&game.castleHp>hp0&&game.castleHp<=hp0+18);

  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='line'),goal:9};
  game.ledger[1].castleDamage=12;
  settleContract(1);
  check('有损失时不再声称没有任何损失',game.reports.some(x=>x.includes('未获得军令奖励')&&x.includes('城堡受损'))&&
    !game.reports.some(x=>x.includes('没有任何损失')));
  fresh();
  game.contract.chosen={...CONTRACTS.find(c=>c.id==='line'),goal:9};
  settleContract(1);
  check('没有损失时用中性说法且不发奖励',game.honor===0&&game.reports.some(x=>x.includes('未获得军令奖励'))&&
    !game.reports.some(x=>x.includes('没有任何损失')));

  fresh();game.phase='night';game.fronts=[{id:'a',camp:null,schedule:[]},{id:'b',camp:null,schedule:[]}];
  renderAlert();
  check('双线提示不再声称箭塔只守自己那一路',!$('alertBar').hidden&&!$('alertBar').textContent.includes('只守')&&
    $('alertBar').textContent.includes('射程'));
  check('箭塔选敌规则没有改成按路线过滤',!/front\s*===/.test(fireTowers.toString()));

  fresh();
  game.phase='lost';
  game.ledger[1].castleDamage=80;game.ledger[1].castleRepair=0;game.ledger[1].buildingsLost=0;
  const noDef=nextRunHint();
  check('无布防失败建议提到城堡和布防',/城堡/.test(noDef)&&/布防|入口/.test(noDef));
  check('失败建议在秘点之外还给出败因',/秘点|缺 /.test(noDef)&&/城堡/.test(noDef));
  check('秘点数量和示例口径一致',/列出 2 个，共缺 6 处/.test(noDef)||/还有 6 处/.test(noDef));
  game.ledger[1].buildingsLost=1;
  const towerDown=nextRunHint();
  check('塔被毁时给出不同建议',towerDown!==noDef&&/箭塔|城墙/.test(towerDown));
  fresh();
  check('未失败时秘点提示仍含方向且不剧透坐标',nextRunHint().includes('东侧山地')&&!/\d+[,，]\d+/.test(nextRunHint()));
  renderQuestBar();
  check('任务栏秘点用总数加示例',$('questCodex').textContent.includes('/6')&&$('questCodex').textContent.includes('缺 6 处'));

  fresh();game.phase='lost';renderCommands();
  check('失败页不留空命令条',$('commandBar').hidden===true&&$('commandBar').children.length===0);

  fresh();flatten(6,4,12,8);
  const walker=game.residents[0];
  walker.x=7.5;walker.y=6.5;walker.state='home';walker.role='guard';
  mapClick(tileAt(7,6));
  check('点击居民能看到职业和状态',game.panel&&game.focusResident===walker.id&&
    $('inspectBody').textContent.includes('居民')&&$('inspectBody').textContent.includes('守卫'));
  mapClick(tileAt(10,7));
  check('点击空地仍然移动',!game.panel&&!!game.hero.goal?.length);
  fresh();flatten(6,4,12,8);game.phase='night';
  Object.assign(game.hero,{x:8.5,y:6.5,cooldown:0});
  const foe=enemy(9.2,6.5,30);
  game.enemies=[foe];
  walker.x=9.5;walker.y=6.5;
  const hpBefore=foe.hp;
  mapClick(tileAt(9,6));
  check('夜间点敌人仍优先攻击',game.hero.swing&&foe.hp===hpBefore&&game.focusResident!==walker.id);

  window.__auditHudBoxes=function(){
    if($('dialog').open)$('dialog').close();
    paused=true;
    game=makeGame(42);game.started=true;
    for(const t of game.tiles)t.visible=true;
    chooseSite(0);
    game.phase='night';
    game.fronts=[
      {id:'home',camp:null,schedule:[],gates:[],waves:[]},
      {id:'camp',camp:null,schedule:[],gates:[],waves:[]}
    ];
    game.panel=false;manualSheetOpen=false;
    sync();
    const box=el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
    };
    const area=(a,b)=>{
      const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
      const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      return w*h;
    };
    const battle=box($('battleHud')),alert=box($('alertBar')),quest=box($('questBar'));
    const battleOn=!$('battleHud').hidden&&battle.height>8;
    const alertOn=!$('alertBar').hidden&&alert.height>8;
    const overlap=area(battle,alert);
    const questOverlap=Math.max(area(quest,alert),area(quest,battle));
    const overflowNight=document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollHeight<=innerHeight+1;
    const stocks=[...document.querySelectorAll('#stocks .stock')].map(el=>{
      const r=box(el);
      return {text:el.textContent.trim(),...r};
    });
    const buttons=[...document.querySelectorAll('.command-bar button,#mobileDock button,.header-actions button')]
      .filter(el=>!el.hidden&&el.getClientRects().length)
      .map(el=>el.getBoundingClientRect().height);
    const narrow=innerWidth<=400;
    game.finished=false;game.phase='night';game.ledger[1].castleDamage=40;
    finish(false);
    sync();
    const side=document.querySelector('.side');
    const reset=box($('resetBtn'));
    const loss={
      open:side.classList.contains('open'),
      goal:$('goalText').textContent,
      resetVisible:reset.width>=44&&reset.height>=44&&reset.top>=0&&reset.bottom<=innerHeight+1&&reset.right<=innerWidth+1,
      commandHidden:$('commandBar').hidden===true
    };
    if(narrow){
      manualSheetOpen=false;syncSheet();
      loss.closed=!side.classList.contains('open');
      manualSheetOpen=true;syncSheet();
      loss.reopened=side.classList.contains('open');
    }
    return {
      viewport:innerWidth+'x'+innerHeight,
      overlap,questOverlap,battleOn,alertOn,
      overflow:overflowNight&&document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollHeight<=innerHeight+1,
      stocksOk:stocks.length===4&&stocks.every(s=>s.width>8&&s.right<=innerWidth+1&&s.left>=-1&&s.text.length>0),
      buttonMin:buttons.length?Math.min(...buttons):0,
      loss
    };
  };

  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
