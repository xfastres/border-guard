async () => {
  const results=[];
  const evidence={};
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const emit=(type,p,id=71)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:id,isPrimary:true,clientX:p.x,clientY:p.y,button:0}));
  function domCenter(){
    const board=$('board').getBoundingClientRect();
    const cs=getComputedStyle($('board'));
    const originX=board.left+(parseFloat(cs.borderLeftWidth)||0);
    const originY=board.top+(parseFloat(cs.borderTopWidth)||0);
    let top=Math.max(originY,0),bottom=Math.min(board.bottom-(parseFloat(cs.borderBottomWidth)||0),innerHeight);
    let left=Math.max(originX,0),right=Math.min(board.right-(parseFloat(cs.borderRightWidth)||0),innerWidth);
    const band=el=>{
      if(!el||el.hidden)return null;
      const style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden')return null;
      const r=el.getBoundingClientRect();
      if(r.width<innerWidth*.5||r.height<8)return null;
      return r;
    };
    for(const el of [document.querySelector('.top'),document.querySelector('.status')]){
      const r=band(el);if(r&&r.bottom>top&&r.top<bottom)top=Math.max(top,r.bottom);
    }
    for(const id of ['commandBar','mobileDock']){
      const r=band($(id));if(r&&r.top<bottom&&r.bottom>top)bottom=Math.min(bottom,r.top);
    }
    if(bottom-top<40||right-left<40)return {x:(left+right)/2,y:(Math.max(originY,0)+Math.min(board.bottom,innerHeight))/2};
    return {x:(left+right)/2,y:(top+bottom)/2};
  }
  function anchorError(){
    const p=worldToScreen(game.hero.x*CELL,game.hero.y*CELL),c=domCenter();
    return {error:Math.hypot(p.x-c.x,p.y-c.y),anchor:{x:+p.x.toFixed(2),y:+p.y.toFixed(2)},center:{x:+c.x.toFixed(2),y:+c.y.toFixed(2)}};
  }
  function hud(){
    const pick=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)};};
    return {title:pick('.top'),status:pick('.status'),reports:pick('.reports'),objective:pick('.objective')};
  }
  function hudDelta(a,b){
    let max=0;const detail={};
    for(const key of Object.keys(a)){
      detail[key]={};
      for(const field of ['x','y','w','h']){const d=Math.abs(a[key][field]-b[key][field]);detail[key][field]=+d.toFixed(2);max=Math.max(max,d);}
    }
    return {max:+max.toFixed(2),detail};
  }
  function followStep(){const was=paused;paused=false;updateCamera();paused=was;}
  const test=async(name,run)=>{try{await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
  if($('dialog').open)$('dialog').close();
  cancelMapGesture();paused=true;keys.clear();game.hero.goal=null;
  if(!game.castle){const t=tileAt(5,4);t.visible=true;chooseSite(0);}
  Object.assign(game.hero,center(game.castle));
  closeTouchSheet();$('pauseOverlay').hidden=true;clearTimeout(toastTimer);$('toast').hidden=true;
  centerOnHero();
  const baseHud=hud();
  evidence.viewport={w:innerWidth,h:innerHeight,dpr:devicePixelRatio};
  evidence.css={w:canvas.offsetWidth,h:canvas.offsetHeight,internalW:canvas.width,internalH:canvas.height};
  await test('跟随锚点对准安全中心',async()=>{
    const sample=anchorError();evidence.rest=sample;
    check(sample.error<=2,'静止误差 '+sample.error);
  });
  await test('直线、对角线和点击寻路保持居中',async()=>{
    const samples=[];
    const was=paused;paused=false;
    keys.add('d');
    for(let i=0;i<6;i++){moveHero(.12);updateCamera();samples.push(anchorError());}
    keys.clear();keys.add('d');keys.add('s');
    for(let i=0;i<6;i++){moveHero(.12);updateCamera();samples.push(anchorError());}
    keys.clear();
    const home=tileOf(game.hero);
    const goal=tileAt(Math.min(WIDTH-1,home.x+4),home.y);
    setDestination(goal);
    for(let i=0;i<40&&game.hero.goal?.length;i++){moveHero(.12);updateCamera();samples.push(anchorError());}
    paused=was;keys.clear();
    const max=Math.max(...samples.map(s=>s.error));
    evidence.motion={max:+max.toFixed(3),samples:samples.filter((_,i)=>i%4===0).map(s=>({error:+s.error.toFixed(3),anchor:s.anchor,center:s.center}))};
    check(max<=2,'移动中最大误差 '+max);
  });
  await test('四边四角仍居中且地图外点击落空',async()=>{
    const spots=[[.5,.5],[31.5,.5],[.5,19.5],[31.5,19.5],[16,.5],[31.5,10],[.5,10],[16,19.5]];
    const rows=[];
    for(const [x,y] of spots){
      game.hero.x=x;game.hero.y=y;game.hero.goal=null;centerOnHero();
      const sample=anchorError();
      const outside=screenToGrid(camera.vx+2,sample.center.y);
      rows.push({x,y,error:+sample.error.toFixed(3),tx:+camera.tx.toFixed(1),outside:outside&&(outside.x+','+outside.y)});
      check(sample.error<=2,x+','+y+' 误差 '+sample.error);
    }
    game.hero.x=.5;game.hero.y=.5;centerOnHero();
    const sel=game.selected,gold=game.resources.gold;
    const miss=screenToGrid(camera.vx+2,domCenter().y);
    check(miss===null,'地图外背景被换成了边缘格');
    canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:camera.vx+2,clientY:domCenter().y}));
    check(game.selected===sel&&game.resources.gold===gold,'地图外点击改变了选中或资源');
    evidence.edges=rows;
  });
  await test('世界屏幕往返不偏格',async()=>{
    let seed=17,ok=0;const seen=[];
    for(let i=0;i<20;i++){
      seed=seed*1103515245+12345>>>0;
      const t=game.tiles[seed%game.tiles.length];
      camera.tx=((i%5)-2)*90;camera.ty=((i%4)-1)*70;camera.mode='manual';applyCamera();
      const spot=worldToScreen(t.x*CELL+CELL*.5,t.y*CELL+CELL*.5);
      const back=screenToGrid(spot.x,spot.y);
      const left=screenToGrid(worldToScreen(t.x*CELL+.25,t.y*CELL+1).x,worldToScreen(t.x*CELL+.25,t.y*CELL+1).y);
      const inner=screenToGrid(worldToScreen((t.x+1)*CELL-.25,t.y*CELL+1).x,worldToScreen((t.x+1)*CELL-.25,t.y*CELL+1).y);
      if(back&&back.x===t.x&&back.y===t.y&&left&&left.x===t.x&&left.y===t.y&&inner&&inner.x===t.x&&inner.y===t.y)ok++;
      if(i<3)seen.push({tile:t.x+','+t.y,back:back&&(back.x+','+back.y)});
    }
    evidence.roundtrip={ok,seen,sx:+camera.sx.toFixed(4),sy:+camera.sy.toFixed(4)};
    check(ok===20,'往返成功 '+ok+'/20');
  });
  await test('地图小于视口时仍居中',async()=>{
    const prevW=canvas.style.width,prevH=canvas.style.height;
    const w=Math.floor(innerWidth*.45),h=Math.floor(innerHeight*.45);
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    measureCameraViewport();centerOnHero();
    const sample=anchorError();
    evidence.small={error:+sample.error.toFixed(3),cssW:canvas.offsetWidth,cssH:canvas.offsetHeight,anchor:sample.anchor,center:sample.center};
    check(canvas.offsetWidth<=innerWidth-20&&canvas.offsetHeight<=innerHeight-20,'测试没有把地图缩进视口');
    check(sample.error<=2,'小地图误差 '+sample.error);
    canvas.style.width=prevW;canvas.style.height=prevH;measureCameraViewport();centerOnHero();
  });
  await test('按下不追、拖图保持手动、新移动恢复跟随',async()=>{
    Object.assign(game.hero,center(game.castle));centerOnHero();
    const tx=camera.tx,heroX=game.hero.x;
    const p={x:innerWidth*.5,y:innerHeight*.55};
    emit('pointerdown',p);
    game.hero.x+=2;followStep();
    check(Math.abs(camera.tx-tx)<.5,'手指按下时相机滑走了');
    emit('pointerup',p);followStep();
    check(Math.abs(worldToScreen(game.hero.x*CELL,game.hero.y*CELL).x-domCenter().x)<=2,'松手后没有恢复跟随');
    game.hero.x=heroX;centerOnHero();
    const before=camera.tx;
    emit('pointerdown',p);emit('pointermove',{x:p.x-140,y:p.y});emit('pointerup',{x:p.x-140,y:p.y});
    check(camera.mode==='manual'&&camera.tx<before-50,'拖图没有进入手动相机');
    followStep();
    check(camera.mode==='manual'&&camera.tx<before-50,'松手后手动浏览被弹回');
    const hudNow=hudDelta(baseHud,hud());
    keys.add('a');paused=false;moveHero(.08);updateCamera();paused=true;keys.clear();
    check(camera.mode==='follow'&&anchorError().error<=2,'新的移动没有恢复居中');
    evidence.hudAfterMove=hudNow;
    check(hudNow.max<=1,'HUD位移 '+hudNow.max);
  });
  await test('长按期间不追，关闭后面不强制改手动',async()=>{
    Object.assign(game.hero,center(game.castle));centerOnHero();setCameraMode('manual');panCameraBy(80,0);
    const mode=camera.mode,tx=camera.tx;
    const t=game.tiles.find(cell=>cell.visible&&(cell.node||cell.building));
    const r=screenRectOfTile(t),p={x:r.x+r.w/2,y:r.y+r.h/2};
    emit('pointerdown',p);await sleep(390);
    check(camera.sheetLock&&camera.mode==='manual','长按改掉了按下前的手动浏览');
    game.hero.x+=1;followStep();
    check(Math.abs(camera.tx-tx)<.5,'面板打开时相机追了领主');
    emit('pointerup',p);
    check(camera.mode==='manual','关闭前模式被改成跟随');
    closeInspector();followStep();
    check(camera.mode===mode,'关闭面板后手动浏览被重置');
  });
  await test('相机只写地图世界层',async()=>{
    const offenders=['body','main','.layout','.field','#board'].filter(sel=>{
      const value=getComputedStyle(document.querySelector(sel)).transform;
      return value&&value!=='none';
    });
    check(!offenders.length,'屏幕层被变换：'+offenders.join(','));
    check(getComputedStyle($('mapWorld')).transform!=='none','地图世界层没有相机变换');
    check($('board').scrollLeft===0&&$('board').scrollTop===0,'还在用滚动平移');
  });
  Object.assign(game.hero,center(game.castle));game.hero.goal=null;keys.clear();centerOnHero();
  return {total:results.length,passed:results.filter(item=>item.pass).length,results,evidence,hud:baseHud};
}
