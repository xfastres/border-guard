() => {
  if($('dialog').open)$('dialog').close();
  game=makeGame(42);game.started=true;paused=true;keys.clear();cancelMapGesture();
  const site=tileAt(5,4);site.visible=true;chooseSite(0);Object.assign(game.hero,center(site));game.autoAttack=true;
  const tower=side=>{const c=game.castle,ts=game.tiles.filter(t=>t.owned&&canBuildAt(t)).sort((a,b)=>distance(a,{x:c.x+(side==='west'?-2:2),y:c.y})-distance(b,{x:c.x+(side==='west'?-2:2),y:c.y}));if(ts[0])build(ts[0],'tower');};
  const nights=[];
  for(let n=1;n<=5&&game.phase==='day';n++){
    if(n===1){for(const t of game.tiles.filter(t=>t.owned&&t.node&&YIELD[t.node.kind]))develop(t);tower('west');tower('west');}
    else{
      if(game.cardPending){showCards();const b=[...document.querySelectorAll('#dialogContent button')].find(b=>b.textContent.includes('齐射'))||document.querySelector('#dialogContent button');b.click();}
      if(game.castleHp<game.castleMax)repair(game.castle);
      for(const t of game.tiles.filter(t=>t.building?.type==='tower'&&t.building.level===0))if(game.actions&&canPay({material:7,gold:4}))rework(t);
      if(game.actions&&canPay(BUILDS.tower.cost))tower('east');
      if(game.actions&&canPay({food:3})&&game.militia<2)enlist();
    }
    startNight();paused=false;let elapsed=0;
    while(game.phase==='night'&&elapsed<180){tickCampaign(.025);elapsed+=.025;}
    paused=true;nights.push({night:n,seconds:+elapsed.toFixed(2),phase:game.phase,hp:game.castleHp,kills:game.kills});
  }
  sync();$('pauseOverlay').hidden=true;
  const books=Object.values(game.ledger).filter(b=>b.closed);
  return {won:game.phase==='won',nights,resources:{...game.resources},kills:game.kills,balanced:books.length===5&&books.every(b=>['gold','material','food','rare'].every(k=>b.income[k]-b.expense[k]===b.end[k]-b.start[k]))};
}
