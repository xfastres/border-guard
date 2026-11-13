async () => {
  const results=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const reset=()=>{
    if($('dialog').open)$('dialog').close();
    game=makeGame(42);game.started=true;paused=true;keys.clear();
    const t=tileAt(5,4);t.visible=true;chooseSite(0);Object.assign(game.hero,center(t));closeInspector();
    if(typeof cancelMapGesture==='function')cancelMapGesture();
    sync();$('pauseOverlay').hidden=true;
  };
  const test=async(name,run)=>{try{reset();await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
  const target=()=>game.tiles.find(t=>t.owned&&t.node&&YIELD[t.node.kind]);
  const point=t=>{const r=canvas.getBoundingClientRect();return {x:r.left+(t.x+.5)/WIDTH*r.width,y:r.top+(t.y+.5)/HEIGHT*r.height};};
  const emit=(type,p,id=11)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:id,isPrimary:true,clientX:p.x,clientY:p.y,button:0}));
  const click=p=>canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:p.x,clientY:p.y}));
  await test('短按资源地只移动，不打开面板',async()=>{const t=target(),p=point(t);emit('pointerdown',p);emit('pointerup',p);click(p);check(game.hero.goal?.length&&!game.panel,'短按没有只执行移动');});
  await test('350ms长按只查看并高亮，无移动或重复click',async()=>{const t=target(),p=point(t);emit('pointerdown',p);await sleep(390);check(game.panel,'松手前没有达到350ms长按');emit('pointerup',p);click(p);check(game.panel&&game.selected===at(t.x,t.y)&&!game.hero.goal,'长按没有打开独立地点决策');});
  await test('拖动取消长按与移动，同时关闭抽屉',async()=>{openInspector(target());sync();const board=$('board');board.scrollLeft=100;const before=board.scrollLeft,p={x:400,y:220};emit('pointerdown',p);emit('pointermove',{x:250,y:220});await sleep(390);emit('pointerup',{x:250,y:220});click({x:250,y:220});check(!game.panel&&!game.hero.goal,'拖动触发了面板或移动');check(board.scrollLeft>before+50,'拖动未平移地图');});
  await test('pointercancel清除长按定时器',async()=>{const p=point(target());emit('pointerdown',p);emit('pointercancel',p);await sleep(390);check(!game.panel&&!game.hero.goal,'取消后仍触发长按或移动');});
  await test('建造模式短按也不扣资源，只移动',async()=>{game.mode='wall';const t=game.tiles.find(t=>t.owned&&canBuildAt(t)),p=point(t);const before=JSON.stringify(game.resources);emit('pointerdown',p);emit('pointerup',p);click(p);check(!t.building&&JSON.stringify(game.resources)===before&&game.hero.goal?.length,'短按直接建造/扣费');});
  await test('多指取消当前长按，不遗留定时器',async()=>{const p=point(target());emit('pointerdown',p,21);emit('pointerdown',{x:p.x+30,y:p.y},22);await sleep(390);emit('pointerup',p,21);emit('pointerup',p,22);check(!game.panel&&!game.hero.goal,'多指误触移动或长按');});
  await test('长按迷雾松手不会变短按移动',async()=>{const t=game.tiles.find(t=>!t.visible&&walkable(t)&&findPath(tileOf(game.hero),t)),p=point(t);emit('pointerdown',p);await sleep(390);emit('pointerup',p);click(p);check(!game.panel&&!game.hero.goal,'迷雾长按释放时误移动');});
  await test('第二指落在HUD也取消地图长按',async()=>{const p=point(target());emit('pointerdown',p,41);$('pauseBtn').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:42,button:0}));await sleep(390);emit('pointerup',p,41);window.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:42}));check(!game.panel&&!game.hero.goal,'HUD第二指未取消长按');});
  await test('战役结束后释放旧触摸不再移动',async()=>{const p=point(target());emit('pointerdown',p);game.phase='lost';emit('pointerup',p);check(!game.hero.goal,'战役结束仍设置移动路径');});
  await test('遮罩与下滑手柄都能关闭抽屉',async()=>{
    openInspector(target());sync();const shade=$('sheetShade'),handle=$('sheetHandle');check(shade&&handle,'缺少遮罩/下滑手柄');shade.click();check(!game.panel,'遮罩未关闭');
    openInspector(target());sync();handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:31,clientY:100,button:0}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:31,clientY:170,button:0}));check(!game.panel,'下滑未关闭');
  });
  reset();return {total:results.length,passed:results.filter(r=>r.pass).length,results};
}
