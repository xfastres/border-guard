() => {
 const results=[];
 const check=(name,cond,detail)=>results.push({name,pass:!!cond,detail:detail===undefined?'':String(detail)});
 const reset=()=>{
  if($('dialog').open)$('dialog').close();
  game=makeGame(42);game.started=true;paused=true;keys.clear();
  for(const t of game.tiles)t.visible=true;
 };
 const siteOf=i=>tileAt(game.sites[i].x,game.sites[i].y);
 const setupOnSite=i=>{
  reset();const t=siteOf(i);Object.assign(game.hero,center(t));
  game.hero.goal=[center(t)];game.heroGoalTile=t;chooseSite(i);return t;
 };
 const safe=t=>canOccupy(game.hero,game.hero.x,game.hero.y)&&
  !circleHitsTile(game.hero.x,game.hero.y,actorRadius(game.hero),t)&&tileOf(game.hero)!==t;
 for(let i=0;i<2;i++){
  const t=setupOnSite(i);
  check('城址 '+i+'：建城后领主位于合法相邻格',!!game.castle&&safe(t),'hero='+game.hero.x.toFixed(2)+','+game.hero.y.toFixed(2));
  check('城址 '+i+'：清除指向城堡内部的旧移动目标',!game.hero.goal&&!game.heroGoalTile);
  check('城址 '+i+'：建城详情面板仍正常打开',game.panel&&game.selected===at(t.x,t.y));
  const dirsTry=[['d',1,0],['a',-1,0],['s',0,1],['w',0,-1]];
  const d=dirsTry.map(([key,dx,dy])=>{
   let reach=0;for(const n of [.1,.2,.3,.4,.5,.6,.7,.8]){if(canOccupy(game.hero,game.hero.x+dx*n,game.hero.y+dy*n))reach=n;else break;}
   return {key,reach};
  }).sort((a,b)=>b.reach-a.reach)[0];
  const before={x:game.hero.x,y:game.hero.y};
  if(d?.reach>.1){keys.add(d.key);for(let n=0;n<12;n++)moveHero(.05);keys.delete(d.key);}
  check('城址 '+i+'：面板打开时 WASD 仍有实际位移',
   Math.hypot(game.hero.x-before.x,game.hero.y-before.y)>.08&&game.panel,
   d&&('key='+d.key+' moved='+Math.hypot(game.hero.x-before.x,game.hero.y-before.y).toFixed(3)));
 }
 reset();
 const t=siteOf(1);
 const adjacent=dirs.map(([dx,dy])=>tileAt(t.x+dx,t.y+dy)).find(n=>walkable(n)&&canOccupy(game.hero,center(n).x,center(n).y));
 if(!adjacent)throw new Error('测试地图没有合法相邻地块');
 Object.assign(game.hero,center(adjacent));game.hero.goal=[center(t)];game.heroGoalTile=t;chooseSite(1);
 const end=game.hero.goal?.[game.hero.goal.length-1];
 check('未抵达城址时确认建城会自动改道',!!game.castle&&!!end&&
  !(Math.abs(end.x-(t.x+.5))<1e-6&&Math.abs(end.y-(t.y+.5))<1e-6)&&
  walkable(tileAt(Math.floor(end.x),Math.floor(end.y))));
 const start={x:game.hero.x,y:game.hero.y};
 for(let n=0;n<50&&game.hero.goal?.length;n++)moveHero(.05);
 check('改道后的领主移动不会进入城堡实体',safe(t)&&Math.hypot(game.hero.x-start.x,game.hero.y-start.y)>.08);
 reset();
 const far=siteOf(0),before={x:game.hero.x,y:game.hero.y};chooseSite(0);
 check('远处建城不改变未受影响的领主位置',Math.abs(game.hero.x-before.x)<1e-9&&Math.abs(game.hero.y-before.y)<1e-9);
 return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}