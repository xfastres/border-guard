() => {
  const results=[];
  const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
  const withGame=(g,fn)=>{const old=game;game=g;try{return fn();}finally{game=old;}};
  const fresh=(seed=42)=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(seed);game.started=true;paused=true;keys.clear();
    const t=tileAt(game.sites[0].x,game.sites[0].y);t.visible=true;chooseSite(0);
    Object.assign(game.hero,center(serviceTiles(t)[0]));game.hero.goal=null;
    return game;
  };
  // 以初始领主为源，在「真实可站」图上做可达性 BFS
  const reachable=(g)=>withGame(g,()=>{
    const seen=new Set([at(8,5)]),q=[at(8,5)];
    for(let i=0;i<q.length;i++){
      const t=g.tiles[q[i]];
      for(const [dx,dy] of dirs){
        const n=tileAt(t.x+dx,t.y+dy);
        if(!n||!walkable(n)||seen.has(at(n.x,n.y)))continue;
        seen.add(at(n.x,n.y));q.push(at(n.x,n.y));
      }
    }
    return seen;
  });

  // ---- A｜固定种子 1–100 的连通性（不能只跑 seed42） ----
  const bad=[];let minCleared=Infinity,maxCleared=0;
  for(let seed=1;seed<=100;seed++){
    const g=makeGame(seed);
    minCleared=Math.min(minCleared,g.mapCleared);maxCleared=Math.max(maxCleared,g.mapCleared);
    withGame(g,()=>{
      const seen=reachable(g),fail=[];
      for(const s of g.sites){
        const t=tileAt(s.x,s.y);
        if(!walkable(t)||!seen.has(at(s.x,s.y)))fail.push('site '+s.x+','+s.y);
      }
      for(const t of g.tiles)if(t.node){
        const adj=serviceTiles(t).filter(x=>seen.has(at(x.x,x.y)));
        if(!adj.length)fail.push('node '+t.node.kind+'@'+t.x+','+t.y);
      }
      if(!walkable(tileAt(22,10))||!seen.has(at(22,10)))fail.push('river');
      for(const x of [0,WIDTH-1]){
        let any=false;
        for(let y=0;y<HEIGHT;y++)if(walkable(tileAt(x,y))&&seen.has(at(x,y)))any=true;
        if(!any)fail.push('gate x='+x);
      }
      if(fail.length)bad.push({seed,fail:fail.slice(0,5)});
    });
  }
  check('种子1–100：城址/基础资源/秘点/河道/两侧入口全部可达',bad.length===0,JSON.stringify(bad.slice(0,3)));
  check('连通性修复确实按种子做过确定性清理',maxCleared>0,'cleared '+minCleared+'..'+maxCleared);

  const g1=makeGame(7),g2=makeGame(7);
  check('同种子地图逐格一致且强化卡随机序列不变',
    JSON.stringify(g1.tiles)===JSON.stringify(g2.tiles)&&g1.rnd()===g2.rnd());
  check('修复逻辑不引用随机序列',!/\brnd\s*\(/.test(repairMapConnectivity.toString()));
  const nodeSnapshot=JSON.stringify(g1.tiles.filter(t=>t.node).map(t=>[t.x,t.y,t.node.kind]));
  withGame(g1,()=>repairMapConnectivity(g1.tiles));
  check('修复不删除/不移动资源与秘点',JSON.stringify(g1.tiles.filter(t=>t.node).map(t=>[t.x,t.y,t.node.kind]))===nodeSnapshot);
  check('修复幂等（二次调用不再改动地图）',withGame(g1,()=>repairMapConnectivity(g1.tiles))===0);
  check('两处城址起始圈保留四类基础资源',[1,7,42,99].every(seed=>{
    const g=makeGame(seed);
    return g.sites.every(s=>['farm','wood','stone','mine'].every(k=>
      g.tiles.some(t=>t.node?.kind===k&&Math.abs(t.x-s.x)<=2&&Math.abs(t.y-s.y)<=2)));
  }));

  // ---- B｜实体占格与脚底圆 ----
  fresh();
  const tree=game.tiles.find(t=>t.ground==='trees'&&!t.node)||game.tiles.find(t=>isSolidGround(t));
  const water=game.tiles.find(t=>t.ground==='water');
  check('成片林地/岩石是整格实体',!!tree&&!walkable(tree)&&tileSolid(tree));
  check('水域是实体',!!water&&!walkable(water));
  check('实体树石格中心放不下领主脚底圆',!!tree&&!canOccupy(game.hero,tree.x+.5,tree.y+.5));
  check('城堡实体格中心放不下领主脚底圆',!canOccupy(game.hero,game.castle.x+.5,game.castle.y+.5));
  check('城堡/营地服务位在实体外侧且可站',serviceTiles(game.castle).every(t=>walkable(t))&&
    serviceTiles(game.castle).length>0&&canOccupy(game.hero,center(serviceTiles(game.castle)[0]).x,center(serviceTiles(game.castle)[0]).y));
  check('实体半径符合设计表',DEMO.radii.hero===.22&&DEMO.radii.normal===.2&&DEMO.radii.heavy===.25&&DEMO.radii.boss===.32);

  // 在受控空地里摆一堵墙，验证 dt=0.016/0.045/0.2 都不穿实体
  const saved=[];
  for(let y=2;y<=7;y++)for(let x=2;x<=9;x++){
    const t=tileAt(x,y);
    saved.push([t,t.ground,t.node,t.building,t.campSolid]);
    t.ground='grass';t.node=null;t.building=null;t.campSolid=false;
  }
  const wall=tileAt(6,5);wall.building={type:'wall',hp:100,max:100};
  invalidateNavigation();
  const h=game.hero;
  for(const dt of [.016,.045,.2]){
    h.x=4.5;h.y=5.5;
    for(let i=0;i<60;i++)moveWithCollision(h,DEMO.walkSpeed*dt,0);
    check('dt='+dt+' 连续冲刺不穿墙',canOccupy(h,h.x,h.y)&&h.x<=5.78+1e-6,'x='+h.x.toFixed(4));
  }
  // 对角速度不快于直线
  h.x=3.5;h.y=5.5;const straight=moveWithCollision(h,.3,0);
  h.x=3.5;h.y=5.5;const diag=moveWithCollision(h,.3/Math.SQRT2,.3/Math.SQRT2);
  check('对角位移不超过同长度直线',diag<=straight+1e-6&&diag>.29,'straight='+straight.toFixed(4)+' diag='+diag.toFixed(4));
  // 沿障碍滑动 + 不穿角
  for(let x=2;x<=9;x++){tileAt(x,4).ground='rock';tileAt(x,6).ground='rock';}
  h.x=3.5;h.y=5.5;
  for(let i=0;i<12;i++)moveWithCollision(h,.12,.12);
  check('窄走廊内对角移动不穿角、始终可站',canOccupy(h,h.x,h.y)&&h.y<5.8&&h.y>5.2,'y='+h.y.toFixed(4));
  for(let x=2;x<=9;x++){tileAt(x,4).ground='grass';tileAt(x,6).ground='grass';}
  // 地图四边：先在左边缘清出受控空地，避免把随机地形误判成边界失败
  const edgeSaved=[];
  for(let y=4;y<=6;y++)for(let x=0;x<=2;x++){
    const c=tileAt(x,y);edgeSaved.push([c,c.ground,c.node,c.building,c.campSolid]);
    c.ground='grass';c.node=null;c.building=null;c.campSolid=false;
  }
  h.x=.5;h.y=5.5;moveWithCollision(h,-5,0);
  check('地图左边界考虑半径',canOccupy(h,h.x,h.y)&&h.x>=DEMO.radii.hero-1e-6,'x='+h.x.toFixed(4));
  for(const [c,ground,node,building,campSolid] of edgeSaved){c.ground=ground;c.node=node;c.building=building;c.campSolid=campSolid;}
  h.x=3.5;h.y=5.5;
  let stalled=false;
  for(let i=0;i<30;i++)stepToward(h,{x:6.5,y:5.5},DEMO.walkSpeed,.05);
  stalled=!h.moving;
  check('顶住墙且无位移时 moving=false',stalled&&canOccupy(h,h.x,h.y));
  wall.building=null;
  for(const [t,ground,node,building,campSolid] of saved){
    t.ground=ground;t.node=node;t.building=building;t.campSolid=campSolid;
  }
  invalidateNavigation();

  // ---- C｜建造前置校验与导航版本 ----
  fresh();
  let t=game.tiles.find(c=>c.owned&&canBuildAt(c));
  Object.assign(game.hero,center(t));game.hero.goal=null;
  let bag=JSON.stringify(game.resources),actions=game.actions,rev=game.navigationRevision;
  build(t,'wall');
  check('建造不许覆盖活体脚底圆，失败不扣资源/行动',!t.building&&JSON.stringify(game.resources)===bag&&game.actions===actions);
  const legal=game.tiles.find(c=>c.owned&&canBuildAt(c)&&!circleHitsTile(game.hero.x,game.hero.y,actorRadius(game.hero),c));
  if(legal){
    build(legal,'wall');
    check('合法建造成功并使导航版本递增',!!legal.building&&game.navigationRevision===rev+1);
    salvage(legal);
    check('拆除同样使导航版本递增且不残留建筑',!legal.building&&game.navigationRevision===rev+2);
  }else{
    check('存在合法建造位',false);
  }
  // 围死领主：造在他唯一出口上，必须拒绝
  const saved2=[];
  for(let y=2;y<=8;y++)for(let x=2;x<=10;x++){
    const c=tileAt(x,y);saved2.push([c,c.ground,c.node,c.building,c.campSolid]);
    c.ground='grass';c.node=null;c.building=null;c.campSolid=false;
  }
  game.castle=tileAt(7,4);game.castle.building={type:'castle'};
  for(const r of game.residents){r.x=9.5;r.y=5.5;}
  // 领主在 (3,5)，唯一出口是 (4,5)
  tileAt(3,4).ground='rock';tileAt(3,6).ground='rock';tileAt(2,5).ground='rock';
  game.hero.x=3.5;game.hero.y=5.5;
  const exitTile=tileAt(4,5);
  const reason=validateBuild(exitTile);
  check('会围死领主的建造被拒绝',reason!==null&&reason.includes('堵死'),'reason='+reason);
  const bag2=JSON.stringify(game.resources),act2=game.actions;
  game.mode='wall';build(exitTile,'wall');
  check('围死情形不扣资源/行动、不写建筑',!exitTile.building&&JSON.stringify(game.resources)===bag2&&game.actions===act2);
  for(const [c,ground,node,building,campSolid] of saved2){c.ground=ground;c.node=node;c.building=building;c.campSolid=campSolid;}
  game.castle=tileAt(5,4);

  // ---- D｜点击与键盘共用同一实体规则、敌军流场与出生 ----
  fresh();
  const far=game.tiles.find(c=>c.visible===false&&walkable(c)&&c.x>15&&c.y>3);
  if(far){
    setDestination(far);
    check('点击寻路的每个路点都是可站格',!!game.hero.goal?.length&&game.hero.goal.every(p=>walkable(tileAt(Math.floor(p.x),Math.floor(p.y)))));
  }else check('存在可点击的远处空地',false);
  const startX=game.hero.x;
  keys.add('d');moveHero(.2);keys.clear();
  check('WASD 与点击都走统一碰撞入口',canOccupy(game.hero,game.hero.x,game.hero.y)&&game.hero.x>=startX);
  const main=makeFront('home',null,0,3);main.gates=entrances(1);game.fronts=[main];calculateRoutes(main,game.castle);
  check('敌军流场以目标实体外侧攻击位为源',(main.attackSlots||[]).length>0&&
    (main.attackSlots||[]).every(p=>canOccupy({radius:DEMO.radii.normal},p.x,p.y)));
  check('流场不会把不可拆实体当通路',(()=>{
    const treeSolid=game.tiles.find(c=>c.ground==='trees'&&!c.node);
    return !treeSolid||!Number.isFinite(main.route[at(treeSolid.x,treeSolid.y)])||main.route[at(treeSolid.x,treeSolid.y)]>1e6;
  })());
  spawnEnemy(main);
  const born=game.enemies[game.enemies.length-1];
  check('出生点有效且带脚底半径',canOccupy(born,born.x,born.y)&&born.radius===DEMO.radii.normal);
  // 营地入口仍在控制区之外、不落在实体格
  for(const t2 of game.tiles)t2.visible=true;
  const c=createCamp(tileAt(15,5));
  if(c){
    const gate=campGate(c),core=campTile(c);
    check('营地入口距核心>=4且可站',!!gate&&Math.max(Math.abs(gate.x-core.x),Math.abs(gate.y-core.y))>=DEMO.campSpawnDistance&&walkable(gate));
  }else check('合法营地可建',false);

  return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
