() => {
  const results=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const reset=(site=0)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(42);game.started=true;paused=true;keys.clear();
    const t=tileAt(game.sites[site].x,game.sites[site].y);
    t.visible=true;chooseSite(site);Object.assign(game.hero,center(t));
  };
  const test=(name,run)=>{try{reset();run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
  const camp=()=>{
    for(const t of game.tiles)t.visible=true;
    const c=createCamp(tileAt(15,5));check(c,'测试营地应合法');return c;
  };
  const post=(c,index=0)=>{
    const r=game.residents[index];r.role='miner';r.camp=c.id;
    Object.assign(r,center(campTile(c)));postResident(r,c);return r;
  };
  const survivor=(boss=false)=>{
    game.phase='night';game.isBoss=boss;game.bossDefeated=false;game.clock=18;game.cleanup=0;game.spawnStopped=true;
    const f=makeFront('home',null,0,0);f.gates=[tileAt(31,19)];f.stopped=true;calculateRoutes(f);game.fronts=[f];
    const e={...center(tileAt(31,19)),front:f,hp:100,max:100,speed:0,cooldown:0,flash:0,boss,next:null};
    game.enemies=[e];return e;
  };
  test('普通残敌不因8秒清场超时消失',()=>{const e=survivor();advanceBattle(9);check(game.phase==='night'&&game.enemies.includes(e)&&e.hp>0,'超时删除残敌并进入白天');});
  test('首领未被击杀不判胜',()=>{survivor(true);advanceBattle(9);check(game.phase==='night','首领未死却结束战役');});
  test('卡路敌人不被当作死亡删除',()=>{const e=survivor(true);e.front.route.fill(Infinity);e.stuck=2.49;e.retried=true;moveEnemy(e,.1);check(e.hp>0,'卡路2.5秒直接清空生命');});
  test('真实击杀首领且清完场才胜利',()=>{const e=survivor(true);damageEnemy(e,1000);advanceBattle(.025);check(game.phase==='won'&&game.kills===1,'真实首领击杀未正确胜利');});
  test('合法边缘营地出生点位于控制区外',()=>{
    for(const t of game.tiles)t.visible=true;
    const c=createCamp(tileAt(31,19));check(c,'边缘营地应可建');
    const gate=campGate(c),core=campTile(c);
    check(gate&&Math.max(Math.abs(gate.x-core.x),Math.abs(gate.y-core.y))>=4,'敌人出生在营地核心附近');
  });
  test('围墙不会让出生点回退到核心',()=>{
    const c=camp(),core=campTile(c);
    for(const [dx,dy] of dirs)tileAt(core.x+dx,core.y+dy).building={type:'wall',hp:100,max:100};
    const gate=campGate(c);check(gate&&distance(gate,core)>=4,'墙围营地在核心刷怪');
  });
  test('重开保留难度与自动攻击并解除暂停',()=>{
    game.hard=true;game.autoAttack=true;introDone=true;setPaused(true);newRun();
    check(game.hard&&game.autoAttack&&!paused,'重开静默重置设置或仍暂停');
  });
  test('两城基础资源保留且特产不进免费起始圈',()=>{
    for(let seed=1;seed<=24;seed++){
      game=makeGame(seed);
      check(game.tiles.filter(t=>t.node?.kind==='rich').length===1&&game.tiles.filter(t=>t.node?.kind==='iron').length===1,'特产被普通资源覆盖或缺失');
      for(const s of game.sites){const nodes=game.tiles.filter(t=>Math.abs(t.x-s.x)<=2&&Math.abs(t.y-s.y)<=2&&t.node).map(t=>t.node.kind);
        check(['farm','wood','stone','mine'].every(k=>nodes.includes(k)),'缺少基础资源');
        check(!nodes.some(k=>['rich','iron'].includes(k)),'高产资源落进免费起始圈');}
    }
  });
  test('东侧富矿南侧铁矿均可步行抵达',()=>{
    const rich=game.tiles.find(t=>t.node?.kind==='rich'),iron=game.tiles.find(t=>t.node?.kind==='iron');
    check(rich.x>=18&&rich.y<10&&iron.y>10,'没有形成东侧与南侧两条探索方向');
    check(findPath(game.castle,rich)&&findPath(game.castle,iron),'特产不可达');
    const relic=game.tiles.find(t=>t.node?.kind==='relic');check(relic&&findPath(game.castle,relic),'近处稀缺保障不可达');
  });
  test('营地预算显示运行净收益、待缴和结算次数',()=>{
    check(typeof campBudget==='function','缺少营地预算');const c=camp();post(c);
    const t=tileAt(15,4);paintNode(t,'rich');t.node.developed=true;
    const b=campBudget(c);check(b.income.gold===10&&b.upkeep.gold===2&&b.upkeep.food===1,'营地收支计算不符');
    check(b.net.gold===8&&b.net.food===-1&&b.due.gold===0&&b.harvests===4,'净额/待缴/剩余机会错误');
    openInspector(campTile(c));sync();check($('inspectBody').innerText.includes('净变化'),'营地界面没有显示净收益');
  });
  test('新增待缴人员不提供产出加成',()=>{
    check(typeof campBudget==='function','缺少营地预算');const c=camp();post(c);game.resources.food=0;post(c,1);
    const t=tileAt(15,4);paintNode(t,'rich');t.node.developed=true;
    const b=campBudget(c);check(b.income.gold===10&&b.upkeep.gold===4&&b.due.gold===2&&b.due.food===1,'等待人员收益或待缴计算错误');
  });
  test('终局与提前召唤不再承诺经济收获',()=>{
    check(typeof remainingHarvests==='function','缺少剩余结算提示');game.day=4;check(remainingHarvests()===1,'第四天应只剩一次普通结算');
    game.day=5;check(remainingHarvests()===0,'终局仍承诺产出');game.day=3;game.scheduled=true;check(remainingHarvests()===0,'提前召唤仍承诺产出');
  });
  test('营地直接培养并派驻且费用不重复',()=>{
    check(typeof trainAndDispatch==='function','缺少快捷培养派驻');const c=camp(),r=game.residents[0];const gold=game.resources.gold;
    trainAndDispatch(r,'miner',c);check(r.role==='miner'&&r.state==='outbound'&&game.resources.gold===gold-2,'快捷培养派驻未正确执行');
    trainAndDispatch(r,'miner',c);check(game.resources.gold===gold-2,'重复点击重扣培养费');
  });
  test('无路时快捷派驻不会先扣培养费',()=>{
    check(typeof trainAndDispatch==='function','缺少快捷培养派驻');const c=camp(),r=game.residents[0],core=campTile(c);
    for(const [dx,dy] of dirs)tileAt(core.x+dx,core.y+dy).building={type:'wall',hp:100,max:100};
    const gold=game.resources.gold;trainAndDispatch(r,'wood',c);check(r.role===null&&game.resources.gold===gold,'无路仍扣费培养');
  });
  test('天亮先产出再按人维护',()=>{const c=camp();post(c);const t=tileAt(15,4);paintNode(t,'mine');t.node.developed=true;game.resources.gold=0;game.resources.food=1;dawn();check(game.resources.gold===3&&game.resources.food===0&&c.running,'先产后维护回归失败');});
  test('缺粮维护不扣金币，默认手动复产',()=>{const c=camp();post(c);game.resources.gold=20;game.resources.food=0;dawn();check(game.resources.gold===20&&!c.running,'欠费原子性回归');game.resources.food=10;dawn();check(game.resources.gold===20&&!c.running,'默认自动复产');});
  test('同周期重派驻不重复维护',()=>{const c=camp(),r=post(c);const before=JSON.stringify(game.resources);returnResident(r);r.camp=c.id;Object.assign(r,center(campTile(c)));postResident(r,c);check(JSON.stringify(game.resources)===before,'同周期维护重复扣费');});
  test('结转只在首次乘倍率且失守保留',()=>{const c=camp();let f=makeFront(c.id,c,3,4);stopFront(f);check(game.carry[c.id]===9,'首次倍率错误');f=makeFront(c.id,c,9,0);stopFront(f);loseCamp(c,f);check(game.carry[c.id]===9,'历史结转重复乘或失守清空');});
  test('入夜同帧到岗不突袭新营地',()=>{const c=camp(),r=game.residents[0];r.role='miner';r.camp=c.id;r.state='outbound';r.route=[];Object.assign(r,center(campTile(c)));game.day=2;game.phaseElapsed=phaseLimit()-.025;paused=false;tickCampaign(.025);check(game.phase==='night'&&c.raidSkipDay===2&&game.fronts.length===1,'同帧预警保护回归');});
  test('尚未实际离营仍承担营地失守',()=>{const c=camp(),r=post(c);evacuateCamp(c);loseCamp(c,null);check(r.state==='hurt','下令撤离瞬间免疫失守');});
  const summary={total:results.length,passed:results.filter(r=>r.pass).length,results};
  reset();paused=true;sync();return summary;
}
