() => {
  /* 正常预算战役模拟：只用游戏内真实动作，不注入资源 / 生命 / 不人工秒杀。
     三条策略：tower = 守家塔防、lord = 主动领主（只留 1 塔）、camp = 单营地扩张。
     暴露 window.__simulateV023(seed, strategy) 供 runner 逐组调用。 */
  window.__simulateV023 = function(seed, STRAT){
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;introDone=true;paused=false;keys.clear();
    for(const t of game.tiles)t.visible=true;
    chooseSite(0);
    game.autoAttack=true;
    const side=()=>entrances(game.day)[0].x===0?-1:1;
    const defend=()=>{
      const c=game.castle,s=side();
      return serviceTiles(c).filter(t=>canOccupy(game.hero,center(t).x,center(t).y))
        .sort((a,b)=>(s<0?a.x-b.x:b.x-a.x))[0]||c;
    };
    const towers=()=>{
      const c=game.castle,s=side();
      return game.tiles.filter(t=>t.owned&&canBuildAt(t)&&!t.node)
        .sort((a,b)=>(Math.abs(a.x-c.x)+Math.abs(a.y-c.y))-(Math.abs(b.x-c.x)+Math.abs(b.y-c.y))
          ||(s<0?a.x-b.x:b.x-a.x));
    };
    let heroSetDay=0,lastRepair=-99,lastRally=-99;
    const dayPlan=()=>{
      if(game.cardPending){
        showCards();
        const b=document.querySelector('#dialogContent .choices button');if(b)b.click();
      }
      if(heroSetDay!==game.day){
        heroSetDay=game.day;
        Object.assign(game.hero,center(defend()));game.hero.goal=null;
      }
      if(STRAT==='none')return;
      for(const t of game.tiles)if(t.owned&&t.node&&YIELD[t.node.kind]&&!t.node.developed&&game.actions>0)develop(t);
      for(const t of game.tiles){
        if(game.actions<=0)break;
        if(!t.visible||t.owned||!t.node||!['wood','stone'].includes(t.node.kind)||t.node.developed)continue;
        if(isAdjacent(t)&&game.resources.gold>=DEMO.claimGold&&game.resources.material>=2){claim(t);develop(t);}
      }
      if(game.castleHp<game.castleMax-30&&game.resources.material>=5&&game.actions>0)repair(game.castle);
      const towerLimit=STRAT==='lord'?1:STRAT==='camp'?2:8;
      let count=game.tiles.filter(t=>t.building?.type==='tower').length;
      for(const t of towers()){
        if(count>=towerLimit||game.actions<=0||!canPay(BUILDS.tower.cost))break;
        if(distance(center(t),game.hero)<.9)continue;
        build(t,'tower');if(t.building)count++;
      }
      if(game.militia<2&&game.resources.food>=3&&game.actions>0)enlist();
      if(STRAT==='camp'&&game.day===2&&!game.camps.length){
        const t=tileAt(15,5);if(canPlaceCamp(t))createCamp(t);
      }
      if(STRAT==='camp'&&game.camps.length){
        const c=game.camps[0],r=game.residents.find(r=>r.state==='home'&&!r.role);
        if(r&&game.actions>0)trainAndDispatch(r,'miner',c);
      }
      if(!game.earlyNightAt&&game.phaseElapsed>=6)requestEarlyNight();
    };
    const nightPlan=()=>{
      if(STRAT==='none')return;
      const now=game.clock;
      if(game.rallyCharges>0&&now-lastRally>1){
        const n=game.enemies.filter(e=>e.hp>0&&distance(e,game.hero)<=DEMO.rallyRange).length;
        if(n>=3){rally();lastRally=now;}
      }
      if(now-lastRepair>6&&game.castleHp<game.castleMax*.75&&game.resources.gold>=5){
        repair(game.castle);lastRepair=now;
      }
      if(game.hero.hp>0&&game.hero.hp<game.hero.max*.4&&game.resources.gold>=4)healHero();
    };
    const nights=[];let cur=null,firstDamage=null;
    for(let i=0;i<9000;i++){
      if(game.phase==='day'){
        dayPlan();
        if(!cur)cur={day:game.day,dayStart:+game.phaseElapsed.toFixed(1),
          gold:game.resources.gold,material:game.resources.material,food:game.resources.food,
          actions:game.actions};
      }
      if(game.phase==='night'){
        if(cur&&cur.nightStart==null){
          cur.nightStart=+game.clock.toFixed(1);
          cur.planned=game.fronts.reduce((n,f)=>n+f.schedule.length,0);
          cur.budget=game.fronts.reduce((n,f)=>n+f.budget.gold,0);
          cur.castleStart=game.castleHp;
        }
        nightPlan();
        if(cur&&cur.contact==null&&game.enemies.some(e=>distance(e,center(game.castle))<4))
          cur.contact=+game.clock.toFixed(1);
      }
      const before=game.phase,castleBefore=game.castleHp;
      tickCampaign(.2);
      if(before==='night'&&game.castleHp<castleBefore&&firstDamage==null)
        firstDamage=+(game.clock).toFixed(1);
      if(before==='night'&&game.phase!=='night'&&cur){
        cur.nightEnd=+game.clock.toFixed(1);
        cur.kills=game.waveKills;cur.castle=game.castleHp;
        cur.castleDamage=cur.castleStart-cur.castleHp;
        cur.reserve=reserveCount();cur.goldEnd=game.resources.gold;
        cur.matEnd=game.resources.material;cur.foodEnd=game.resources.food;
        cur.xp=game.xp;cur.towers=game.tiles.filter(t=>t.building?.type==='tower').length;
        const b=game.ledger[cur.day];
        if(b&&b.end){
          cur.ledgerClosed=(b.income.gold-b.expense.gold===b.end.gold-b.start.gold)&&
            (b.income.material-b.expense.material===b.end.material-b.start.material)&&
            (b.income.food-b.expense.food===b.end.food-b.start.food);
        }
        nights.push(cur);cur=null;firstDamage=null;
      }
      if(game.phase==='won'||game.phase==='lost')break;
    }
    return {
      seed,strategy:STRAT,
      final:{phase:game.phase,day:game.day,castle:game.castleHp,
        hero:Math.round(game.hero.hp),kills:game.kills,gold:game.resources.gold,
        material:game.resources.material,food:game.resources.food,
        reserve:reserveCount(),towers:game.tiles.filter(t=>t.building?.type==='tower').length,
        camps:game.camps.length,actions:game.actions,
        liveEnemies:game.enemies.length,clock:+game.clock.toFixed(1),
        errs:(window.__pageErrors||[]).slice()},
      nights,
      totalNightSeconds:+nights.reduce((n,x)=>n+(x.nightEnd||0),0).toFixed(1),
      totalDaySeconds:+nights.reduce((n,x)=>n+(x.dayStart||0),0).toFixed(1)
    };
  };
  return {total:1,passed:1,results:[{name:'正常预算模拟入口就绪',pass:typeof window.__simulateV023==='function'}]};
}
