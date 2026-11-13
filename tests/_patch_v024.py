# -*- coding: utf-8 -*-
"""v0.24 派生脚本：从 v0.23 复制并落地「唯一命中事件 / 弹体 / 打击反馈 / 音效 / 视觉收尾」。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Border-Guard-v0.23.html')
DST = os.path.join(ROOT, 'Border-Guard-v0.24.html')
s = io.open(SRC, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit('MISS (%d != %d): %r' % (n, count, old[:110]))
    s = s.replace(old, new)


def replace_func(name, new):
    global s
    start = s.index('function ' + name + '(')
    i = s.index('{', start)
    depth = 0
    for j in range(i, len(s)):
        if s[j] == '{':
            depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                s = s[:start] + new.rstrip('\n') + s[j + 1:]
                return
    raise SystemExit('unbalanced function ' + name)


rep('全景地图 · 探索经营 · 昼夜守卫 · v0.23', '全景地图 · 探索经营 · 昼夜守卫 · v0.24')

# ---------------------------------------------------------------- 设置菜单（最小增量，不动既有 HUD 几何）
rep("""</style>
</head>""",
"""/* v0.24 齿轮菜单：只做小下拉，不新增常驻面板、不覆盖地图 */
#settingsMenu{position:fixed;z-index:9;right:18px;top:88px;width:min(258px,calc(100vw - 24px));
  padding:10px;background:#1c2b22f5;border:1px solid #b39b63;border-radius:10px;
  box-shadow:0 8px 26px #07120a88;display:grid;gap:6px}
#settingsMenu button{width:100%;text-align:left;font-size:13px}
body.touch-ui #settingsMenu{right:8px;top:50px}
@media(prefers-reduced-motion:reduce){#settingsMenu{box-shadow:none}}
</style>
</head>""")
rep("""    <button data-page-node-id="09mhJ30mCzR4ikOSzNg6td" class="quiet" id="resetBtn"><!--pnid:HdzF075AXqZC9P4dk6qSbm-->重新开局</button>
  </div>
</header>""",
"""    <button data-page-node-id="09mhJ30mCzR4ikOSzNg6td" class="quiet" id="resetBtn"><!--pnid:HdzF075AXqZC9P4dk6qSbm-->重新开局</button>
    <button class="quiet" id="settingsBtn" type="button" aria-label="设置" aria-expanded="false" aria-controls="settingsMenu">⚙</button>
  </div>
</header>
<div id="settingsMenu" hidden role="menu" aria-label="设置">
  <button id="soundToggle" type="button">音效：开（低音量）</button>
  <button id="effectsToggle" type="button">效果：标准</button>
  <button id="settingsHelp" type="button">操作指南</button>
  <button id="settingsClose" type="button">关闭</button>
</div>""")

# ---------------------------------------------------------------- 初始状态
rep("""    enemies:[], effects:[], scheduled:false, early:false, clock:0,
    kills:0, waveKills:0, waveGold:0, result:null, ledgerDay:null""",
"""    enemies:[], effects:[], scheduled:false, early:false, clock:0,
    // v0.24 战斗表现层：projectiles 可能影响天亮判定，effects/floats/corpses 只影响画面
    projectiles:[], floats:[], corpses:[], combatEvents:[], combatEventSeq:0, projectileSeq:0,
    presentation:null, shake:{t:0,mag:0}, buildingFlash:{},
    settings:{sound:true,effects:'standard'},
    kills:0, waveKills:0, waveGold:0, result:null, ledgerDay:null""")

# ---------------------------------------------------------------- 战斗事件 / 音效 / 弹体模块
FX_MODULE = r'''/* ===== v0.24 唯一命中事件 / 弹体 / 表现 / 音效 =====
   硬约束：攻击、实际命中、伤害记账、死亡各只发生一次。
   emitCombatEvent 只产出事件并驱动闪色、粒子、飘字、音效；它不改血、不发奖励。
   projectiles 与 visualEffects 分离：弹体会影响天亮判定，特效不会。 */
const FX_CAP=150;   // 临时粒子 / 飘字上限；可丢弃次要特效，绝不丢弃伤害或奖励事件
function reducedMotion(){
  return typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function effectsWeak(){
  return !game||game.settings?.effects==='weak'||reducedMotion();
}
function visualBudget(){
  return (game?.effects?.length||0)+(game?.floats?.length||0)+(game?.corpses?.length||0);
}
function unlockAudio(){
  if(unlockAudio.done)return;
  unlockAudio.done=true;
  AudioKit.unlock();
}
const AudioKit={
  ctx:null,supported:!!(window.AudioContext||window.webkitAudioContext),volume:.16,last:{},
  unlock(){
    if(!this.supported)return;
    try{
      if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }catch(e){this.ctx=null;this.supported=false;}
  },
  play(kind){
    // 音频不可用、被静音或尚未解锁都必须静默返回，不能中断战斗
    if(!this.supported||!this.ctx||this.ctx.state!=='running'||game?.settings?.sound===false)return;
    const now=performance.now();
    const gap={swing:70,arrow:55,heavy:110,death:90,warn:600,victory:900,launch:55,castle:220}[kind]||80;
    if(now-(this.last[kind]||0)<gap)return;
    this.last[kind]=now;
    try{
      const c=this.ctx,t=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
      const spec={swing:[430,170,'sawtooth',.09],arrow:[780,420,'triangle',.07],
        heavy:[150,70,'square',.12],death:[220,60,'sine',.18],warn:[520,300,'square',.13],
        victory:[520,990,'triangle',.42],launch:[600,300,'sine',.05],
        castle:[190,90,'triangle',.14]}[kind]||[400,200,'sine',.08];
      osc.type=spec[2];
      osc.frequency.setValueAtTime(spec[0],t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40,spec[1]),t+spec[3]);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(this.volume,t+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,t+spec[3]);
      osc.connect(gain);gain.connect(c.destination);
      osc.start(t);osc.stop(t+spec[3]+.02);
    }catch(e){/* 忽略音频设备异常 */}
  }
};
window.addEventListener('pointerdown',unlockAudio);
window.addEventListener('keydown',unlockAudio);
function emitCombatEvent(evt){
  if(!game)return null;
  const e={id:++game.combatEventSeq,...evt};
  game.combatEvents.push(e);
  if(game.combatEvents.length>240)game.combatEvents.shift();
  consumeCombatEvent(e);
  return e;
}
function floatText(kind,amount){
  if(kind==='gold')return '+'+amount+' 金';
  if(kind==='xp')return '+'+amount+' 经验';
  return '-'+amount;
}
function addFloat(key,kind,amount,x,y,color){
  if(!game.floats)return;
  const k=key+'|'+kind;
  const old=game.floats.find(f=>f.key===k&&f.time>0);
  if(old){old.amount+=amount;old.time=.5;old.max=.5;old.text=floatText(kind,old.amount);return;}
  if(visualBudget()>=FX_CAP)return;
  game.floats.push({key:k,kind,amount,x,y,color,time:.5,max:.5,text:floatText(kind,amount)});
}
function spawnSparks(x,y,dx,dy,n,color,seed){
  if(!game.effects)return;
  const ang0=Math.atan2(dy,dx);
  for(let i=0;i<n;i++){
    if(visualBudget()>=FX_CAP)return;
    const a=ang0+(i-(n-1)/2)*.42+((seed||1)%7)*.05;
    const sp=1.0+((seed||1)+i)%5*.2;
    game.effects.push({type:'particle',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-.45,
      time:.34,max:.34,color:color||'#ffe9c0'});
  }
}
function triggerShake(mag){
  if(effectsWeak()||!game.shake)return;
  game.shake={t:.22,mag:Math.min(6,mag)};
}
function markBuildingFlash(t,time=.2){
  if(t&&game.buildingFlash)game.buildingFlash[at(t.x,t.y)]=time;
}
function consumeCombatEvent(e){
  const weak=effectsWeak();
  switch(e.kind){
    case 'hit':
      spawnSparks(e.x,e.y,e.dirX||1,e.dirY||0,weak?2:3+(e.id%4),e.boss?'#ffd58a':'#ffe9c0',e.id);
      addFloat(e.targetId,'damage',e.amount,e.x,e.y,'#ffe6b0');
      AudioKit.play(e.heavy||e.boss?'heavy':'arrow');
      if(e.boss&&!weak)triggerShake(4);
      break;
    case 'swing': AudioKit.play('swing');break;
    case 'launch': AudioKit.play('launch');break;
    case 'death':
      AudioKit.play('death');
      if(!weak)spawnSparks(e.x,e.y,0,-1,4,'#f0b98a',e.id);
      break;
    case 'gold': addFloat(e.targetId,'gold',e.amount,e.x,e.y,'#f5d27a');break;
    case 'xp': addFloat(e.targetId,'xp',e.amount,e.x,e.y-.28,'#b7ddb0');break;
    case 'castleHit':
      AudioKit.play('castle');
      if(!weak)spawnSparks(e.x,e.y,0,-1,3,'#d9c49b',e.id);
      break;
    case 'campHit': AudioKit.play('warn');break;
    case 'victory': AudioKit.play('victory');break;
    case 'dissipate': break;
  }
}
function clearCombatVisuals(){
  if(!game)return;
  game.projectiles=[];game.floats=[];game.corpses=[];game.effects=[];
  game.combatEvents=[];game.combatEventSeq=0;game.projectileSeq=0;
  game.presentation=null;game.shake={t:0,mag:0};game.buildingFlash={};
  if(game.hero)game.hero.swing=null;
}
function updateEffects(dt){
  for(const e of game.effects){
    e.time-=dt;
    if(e.vx!==undefined){e.x+=e.vx*dt;e.y+=e.vy*dt;e.vy+=dt*2.2;}
  }
  game.effects=game.effects.filter(e=>e.time>0);
  for(const f of game.floats)f.time-=dt;
  game.floats=game.floats.filter(f=>f.time>0);
  for(const c of game.corpses)c.t+=dt;
  game.corpses=game.corpses.filter(c=>c.t<c.max);
  if(game.shake&&game.shake.t>0)game.shake.t=Math.max(0,game.shake.t-dt);
  for(const k of Object.keys(game.buildingFlash)){
    game.buildingFlash[k]-=dt;
    if(game.buildingFlash[k]<=0)delete game.buildingFlash[k];
  }
  for(const e of game.enemies){
    if(e.shakeX)e.shakeX*=.7;
    if(e.shakeY)e.shakeY*=.7;
    if(Math.abs(e.shakeX||0)<.1)e.shakeX=0;
    if(Math.abs(e.shakeY||0)<.1)e.shakeY=0;
  }
}
/* 弹体：先发射、再飞行、抵达后才结算一次伤害。目标已死则消散，不转移伤害、不重复奖励。 */
function launchProjectile(o){
  const duration=Math.max(.10,Math.min(.30,distance(o.from,o.to)/12));
  const p={id:++game.projectileSeq,kind:o.kind||'arrow',sourceId:o.sourceId||'',
    targetId:o.target?.id??o.targetId,x:o.from.x,y:o.from.y,
    sx:o.from.x,sy:o.from.y,tx:o.to.x,ty:o.to.y,t:0,duration,
    damage:o.damage,source:o.source||'other',arc:o.kind!=='bolt',settled:false};
  game.projectiles.push(p);
  emitCombatEvent({kind:'launch',sourceId:p.sourceId,targetId:p.targetId,x:p.x,y:p.y,projectileId:p.id});
  return p;
}
function resolveHit(p){
  if(p.settled)return false;
  p.settled=true;
  const target=game.enemies.find(e=>e.id===p.targetId&&e.hp>0&&!e.settled);
  if(!target){
    emitCombatEvent({kind:'dissipate',sourceId:p.sourceId,targetId:p.targetId,x:p.x,y:p.y,projectileId:p.id});
    return false;
  }
  damageEnemy(target,p.damage,p.source,{sourceId:p.sourceId,dirX:target.x-p.sx,dirY:target.y-p.sy});
  return true;
}
function updateProjectiles(dt){
  if(!game.projectiles.length)return;
  for(const p of game.projectiles){
    p.t+=dt;
    const u=Math.min(1,p.t/p.duration);
    p.x=p.sx+(p.tx-p.sx)*u;
    p.y=p.sy+(p.ty-p.sy)*u;
  }
  for(const p of game.projectiles)if(p.t>=p.duration)resolveHit(p);
  game.projectiles=game.projectiles.filter(p=>!p.settled);
}
/* 首领真正死亡且清场后先播 0.8 秒胜利表现，再结算一次。
   演出期间冻结战役业务（不产出、不扣费、不结算），只继续播放表现。 */
function beginVictoryPresentation(){
  if(game.presentation)return;
  game.presentation={t:0,duration:.8,settled:false};
  triggerShake(6);
  emitCombatEvent({kind:'victory',x:game.castle?game.castle.x+.5:game.hero.x,
    y:game.castle?game.castle.y+.5:game.hero.y});
}
function updatePresentation(dt){
  const p=game.presentation;
  if(!p)return;
  p.t+=dt;
  if(p.t>=p.duration&&!p.settled){p.settled=true;finish(true);}
}
function meleeClear(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  const n=Math.max(2,Math.ceil(d/.18));
  for(let i=1;i<n;i++){
    const t=tileAt(Math.floor(a.x+dx*i/n),Math.floor(a.y+dy*i/n));
    if(!t||tileSolid(t))return false;   // 墙、实体树石、塔都不能隔空砍到
  }
  return true;
}
/* 领主挥击：0.06 蓄势 + 0.10 挥击（0.16 秒处唯一一次伤害）+ 收招，合计 0.48 秒。
   移动不被整段锁死；手动 / 自动 / 移动端共用 attack() 这一入口。 */
function updateSwing(dt){
  const s=game.hero?.swing;
  if(!s)return;
  s.t+=dt;
  if(!s.fired&&s.t>=.16){
    s.fired=true;
    const h=game.hero;
    const targets=game.enemies.filter(e=>e.hp>0&&distance(e,h)<1.35&&meleeClear(h,e))
      .sort((a,b)=>distance(a,h)-distance(b,h)).slice(0,2);
    s.targets=targets;
    if(targets.length)h.face=targets[0].x<h.x?-1:1;
    emitCombatEvent({kind:'swing',sourceId:'hero',targetId:targets[0]?.id||null,
      x:h.x,y:h.y,dirX:h.face,dirY:0,count:targets.length});
    for(const e of targets)damageEnemy(e,18+game.heroLevel*6+game.ranks.hero*12+game.bonuses.blade*5,'hero');
  }
  if(s.t>=.48)game.hero.swing=null;
}
'''
rep("/* 唯一击杀结算入口：伤害只在命中处扣一次，票据只兑现一次。", FX_MODULE + "/* 唯一击杀结算入口：伤害只在命中处扣一次，票据只兑现一次。")

# ---------------------------------------------------------------- 击杀 / 命中 / 挥击
replace_func('settleKill', r'''function settleKill(enemy,source='other'){
  if(!enemy||enemy.settled)return false;
  enemy.settled=true;
  if(enemy.boss)game.bossDefeated=true;
  game.waveKills++;game.kills++;
  const gold=enemy.rewardGold||0,xp=enemy.rewardXp||0;
  if(gold){
    game.waveGold+=gold;
    addIncome({gold},'kill',enemy.boss?'击败首领':'击退敌军');
    emitCombatEvent({kind:'gold',targetId:enemy.id,amount:gold,x:enemy.x,y:enemy.y-.2});
  }
  if(xp){
    game.xp+=xp;
    emitCombatEvent({kind:'xp',targetId:enemy.id,amount:xp,x:enemy.x,y:enemy.y-.5});
  }
  const book=nightBook();
  if(book)book.kills++;
  if(source==='hero')bumpContract('slayer');
  game.corpses.push({x:enemy.x,y:enemy.y,face:enemy.face||1,boss:!!enemy.boss,
    heavy:!!enemy.heavy,t:0,max:enemy.boss?.4:.32});
  emitCombatEvent({kind:'death',targetId:enemy.id,x:enemy.x,y:enemy.y,
    boss:!!enemy.boss,sourceId:source});
  return true;
}''')
replace_func('damageEnemy', r'''function damageEnemy(enemy,amount,source='other',meta={}){
  if(!enemy||enemy.hp<=0||enemy.settled)return false;
  enemy.hp-=amount;
  enemy.flash=.08;
  let dx=meta.dirX,dy=meta.dirY;
  if(dx===undefined){dx=enemy.x-game.hero.x;dy=enemy.y-game.hero.y;}
  const len=Math.hypot(dx,dy)||1;
  // 受击偏移只是视觉量，绝不改 x / y 与碰撞半径
  const off=effectsWeak()?0:2.5;
  enemy.shakeX=dx/len*off;enemy.shakeY=dy/len*off*.6;
  emitCombatEvent({kind:'hit',sourceId:meta.sourceId||source,targetId:enemy.id,amount,
    x:enemy.x,y:enemy.y,dirX:dx/len,dirY:dy/len,
    heavy:!!enemy.heavy,boss:!!enemy.boss});
  if(enemy.hp<=0)settleKill(enemy,source);
  return true;
}''')
replace_func('attack', r'''function attack(){
  if(game.phase!=='night'||game.hero.hp<=0||game.hero.cooldown>0||$('dialog').open)return;
  const h=game.hero;
  h.cooldown=.48;h.hit=.48;
  h.swing={t:0,fired:false,targets:[]};
}''')

# ---------------------------------------------------------------- 塔 / 民兵 / 守卫改成先发弹
replace_func('fireTowers', r'''function fireTowers(dt){
  const castle=game.castle?center(game.castle):game.hero;
  const enemies=game.enemies.filter(e=>e.hp>0);
  for(const t of game.tiles){
    const b=t.building;
    if(b?.type!=='tower'||(!t.owned&&!campAt(t)?.controlled))continue;
    b.cooldown-=dt;
    if(b.cooldown>0)continue;
    const origin=center(t);
    const target=enemies.filter(e=>e.hp>0&&distance(origin,e)<towerRange(b))
      .sort((a,c)=>distance(a,castle)-distance(c,castle))[0];
    if(!target)continue;
    b.cooldown=.72;
    // 高弧抛射可越低矮障碍；伤害在弹体抵达时才结算
    launchProjectile({kind:'arrow',from:origin,to:{x:target.x,y:target.y},target,
      damage:11+b.level*5+game.ranks.tower*8+game.bonuses.bow*4,
      sourceId:'tower:'+at(t.x,t.y),source:'tower'});
  }
  game.militiaCooldown-=dt;
  if(game.castle&&game.militia&&game.militiaCooldown<=0){
    const target=enemies.find(e=>e.hp>0&&distance(e,castle)<1.7);
    if(target){
      game.militiaCooldown=.78;
      launchProjectile({kind:'bolt',from:castle,to:{x:target.x,y:target.y},target,
        damage:game.militia*(6+3*game.bonuses.militia+(game.artifact==='lantern'?3:0)),
        sourceId:'militia',source:'militia'});
    }
  }
  for(const camp of game.camps){
    if(!camp.controlled||camp.lost)continue;
    camp.guardTimer-=dt;
    const guards=campStaff(camp,['posted']).filter(r=>r.role==='guard').length;
    const target=enemies.find(e=>e.hp>0&&distance(e,center(campTile(camp)))<1.8);
    if(guards&&target&&camp.guardTimer<=0){
      camp.guardTimer=.8;
      launchProjectile({kind:'bolt',from:center(campTile(camp)),to:{x:target.x,y:target.y},target,
        damage:guards*9,sourceId:'guard:'+camp.id,source:'guard'});
    }
  }
}''')

# ---------------------------------------------------------------- 城防 / 营地受击反馈
rep("""      if(camp){
        camp.hp=Math.max(0,camp.hp-impact);
        if(!camp.hp)loseCamp(camp,front);
      }else{
        const beforeHp=game.castleHp;
        game.castleHp=Math.max(0,game.castleHp-impact);
        const hitBook=nightBook();
        if(hitBook&&beforeHp>game.castleHp)hitBook.castleDamage+=beforeHp-game.castleHp;
        if(game.castleHp<=game.castleMax/2&&!game.halfWarned){
          game.halfWarned=true;note('第 '+game.day+' 夜城堡耐久跌破一半');
        }
      }
      e.cooldown=1;""",
"""      if(camp){
        camp.hp=Math.max(0,camp.hp-impact);
        markBuildingFlash(campTile(camp));
        emitCombatEvent({kind:'campHit',sourceId:'enemy:'+e.id,targetId:camp.id,amount:impact,
          x:campTile(camp).x+.5,y:campTile(camp).y+.5});
        if(!camp.hp)loseCamp(camp,front);
      }else{
        const beforeHp=game.castleHp;
        game.castleHp=Math.max(0,game.castleHp-impact);
        const hitBook=nightBook();
        if(hitBook&&beforeHp>game.castleHp)hitBook.castleDamage+=beforeHp-game.castleHp;
        markBuildingFlash(game.castle);
        emitCombatEvent({kind:'castleHit',sourceId:'enemy:'+e.id,targetId:'castle',amount:impact,
          x:game.castle.x+.5,y:game.castle.y+.5});
        if(game.castleHp<=game.castleMax/2&&!game.halfWarned){
          game.halfWarned=true;note('第 '+game.day+' 夜城堡耐久跌破一半');
          emitCombatEvent({kind:'campHit',targetId:'castle',amount:0,x:game.castle.x+.5,y:game.castle.y+.5});
        }
      }
      e.cooldown=1;""")

# ---------------------------------------------------------------- 结算 / 主循环 / 演出
replace_func('finish', r'''function finish(victory){
  if(game.finished)return;
  game.finished=true;
  // 终局立即取消回场、提前入夜与胜利演出回调
  game.heroDown=null;game.earlyNightAt=null;game.presentation=null;
  settleContract(game.day);
  commitRecord(victory);
  if(victory){
    const book=openNight(game.day);
    book.boss=true;book.early=!!game.early;book.dawned=false;
    closeNight(game.day);
    if(paused)setPaused(false);
  }
  game.phase=victory?'won':'lost';
  game.result={day:game.day,early:victory&&game.early};
  game.enemies=[];game.panel=false;
  clearCombatVisuals();
  if(!victory)note(game.castle?'第 '+game.day+' 夜城堡耐久归零，本局结束':'第 '+game.day+' 夜领主倒下，本局结束');
  report(victory?(game.early?'首领败退，获得提前通关记录。':'首领败退，边境守卫战结束。'):game.castle?'城堡失守，本局结束。':'领主倒下，本局结束。');
  sync();
}''')
replace_func('advanceBattle', r'''function advanceBattle(dt){
  // 胜利演出：冻结业务，只推进弹体与表现，不能在演出中多产出 / 多扣费 / 多结算
  if(game.presentation){
    updatePresentation(dt);updateProjectiles(dt);updateEffects(dt);
    return;
  }
  game.clock+=dt;
  const stop=nightStopAt(game.day,game.isBoss);
  if(!game.spawnStopped&&game.clock>=stop){
    game.spawnStopped=true;game.cleanup=0;
    for(const front of game.fronts)stopFront(front);
    report('本夜停止刷新，清完场上残敌后天亮。',true);
    sync();
  }
  if(!game.spawnStopped){
    spawnDue(true);
    spawnDue(false);
  }
  fireTowers(dt);
  updateProjectiles(dt);
  assignAttackSlots();
  for(const e of game.enemies)if(e.hp>0)moveEnemy(e,dt);
  separateUnits(dt);
  updateEffects(dt);
  game.enemies=game.enemies.filter(e=>e.hp>0);
  if(game.castleHp<=0||(!game.castle&&game.hero.hp<=0)){finish(false);return;}
  if(game.spawnStopped)game.cleanup+=dt;
  // 最后一发弹体在飞行时不天亮；死亡残影（corpses）不阻止天亮
  if(game.enemies.length||game.projectiles.length||game.fronts.some(front=>!isFrontComplete(front)))return;
  if(game.isBoss){
    const bossPending=game.fronts.some(f=>f.schedule.some(s=>!s.dispatched&&s.record.kind==='boss'));
    if(bossPending||!game.bossSpawned||!game.bossDefeated)return;
    beginVictoryPresentation();return;
  }
  for(const front of game.fronts){
    const camp=front.camp;
    if(camp&&!camp.lost&&camp.hp<DEMO.campHealth*.55){
      camp.damaged=true;camp.running=false;
      note(campName(camp)+'严重受损，维修前停产');
      report(campName(camp)+'严重受损，维修前暂停生产。',true);
    }
  }
  dawn();
}''')
rep("""  moveHero(dt);
  updateHeroRecovery(dt);""",
"""  moveHero(dt);
  if(!game.presentation)updateSwing(dt);
  updateHeroRecovery(dt);""")

# 夜始 / 天亮 / 重开清理旧弹体、挥击、死亡与演出
rep("""  game.waveKills=0;game.waveGold=0;game.effects=[];game.militiaCooldown=0;""",
"""  game.waveKills=0;game.waveGold=0;game.militiaCooldown=0;
  clearCombatVisuals();""")
rep("""  game.phase='day';game.day++;game.phaseElapsed=0;game.actions=7;game.enemies=[];game.effects=[];game.mode=null;""",
"""  game.phase='day';game.day++;game.phaseElapsed=0;game.actions=7;game.enemies=[];game.mode=null;
  clearCombatVisuals();""")
rep("""  const settings={hard:game?.hard||false,autoAttack:game?.autoAttack??MOBILE()};
  keys.clear();
  game=makeGame();
  game.hard=settings.hard;game.autoAttack=settings.autoAttack;""",
"""  const settings={hard:game?.hard||false,autoAttack:game?.autoAttack??MOBILE(),
    sound:game?.settings?.sound!==false,effects:game?.settings?.effects||'standard'};
  keys.clear();
  game=makeGame();
  game.hard=settings.hard;game.autoAttack=settings.autoAttack;
  game.settings.sound=settings.sound;game.settings.effects=settings.effects;
  clearCombatVisuals();""")

# ---------------------------------------------------------------- 绘制：震动 + 战斗表现层
rep("""function draw(){
  if(!game)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const isNight=game.phase==='night';""",
"""function draw(){
  if(!game)return;
  /* v0.24 震屏只作用于 Canvas 绘制内容：不动 mapWorld 相机 transform，
     不改命中坐标，不影响固定 HUD 位置。 */
  ctx.save();
  const sh=game.shake&&game.shake.t>0?game.shake:null;
  if(sh){
    const k=sh.t/.22,now=performance.now();
    ctx.translate(Math.sin(now*.09)*sh.mag*k,Math.cos(now*.11)*sh.mag*k);
  }
  ctx.clearRect(-14,-14,canvas.width+28,canvas.height+28);
  const isNight=game.phase==='night';""")

COMBAT_DRAW = r'''function drawCombatLayer(){
  // 死亡残影：倒地淡出，立即退出存活判定，不挡路、不吃伤害、不留永久尸体
  for(const c of game.corpses){
    const a=Math.max(0,1-c.t/c.max);
    ctx.save();
    ctx.globalAlpha=a*.72;
    ctx.translate(c.x*CELL,c.y*CELL);
    ctx.rotate((c.face<0?-1:1)*Math.min(1,c.t/c.max)*1.05);
    ctx.scale((c.boss?1.65:1)*CELL/60,(c.boss?1.65:1)*CELL/60);
    oval(0,8,13,5,'#111e1b88');
    path([[-11,7],[-9,-8],[8,-10],[12,7]],c.boss?'#8f5457':'#7c6658','#3f3330',2);
    ctx.restore();
  }
  // 弹体：高弧抛物线可越低矮障碍，抵达前不伤害
  for(const p of game.projectiles){
    const u=Math.min(1,p.t/p.duration),back=Math.max(0,u-.09);
    const arc=(p.arc?18:6)*CELL/60;
    const x=p.x*CELL,y=p.y*CELL-Math.sin(u*Math.PI)*arc;
    const px=(p.sx+(p.tx-p.sx)*back)*CELL;
    const py=(p.sy+(p.ty-p.sy)*back)*CELL-Math.sin(back*Math.PI)*arc;
    line(px,py,x,y,p.kind==='bolt'?'#dbe9c8':'#ffdc96',2);
    oval(x,y,2.8,2.8,'#fff0c0');
  }
  for(const e of game.effects){
    const fade=Math.max(0,e.time/e.max);
    if(e.type==='particle')oval(e.x*CELL,e.y*CELL,(2+3*fade)*CELL/60,(2+3*fade)*CELL/60,e.color);
    else oval(e.x*CELL,e.y*CELL,11*fade*CELL/60,11*fade*CELL/60,e.color);
  }
  for(const f of game.floats){
    const u=f.time/f.max;
    ctx.save();ctx.globalAlpha=Math.min(1,u*2);
    label(f.text,f.x*CELL,(f.y-.35-(1-u)*.55)*CELL,13*CELL/46,f.color);
    ctx.restore();
  }
  // 受击建筑短闪
  for(const [k,time] of Object.entries(game.buildingFlash)){
    const t=game.tiles[Number(k)];
    if(!t)continue;
    ctx.save();ctx.globalAlpha=Math.min(.5,time*3);
    inCell(t.x*CELL,t.y*CELL,()=>rect(0,0,60,60,'#ffe7bd'));
    ctx.restore();
  }
  // 城堡低耐久预警与夜间灯火
  if(game.castle){
    const c=game.castle;
    if(game.castleHp<game.castleMax*.35){
      ctx.save();ctx.strokeStyle='#ef8c74';ctx.lineWidth=3;
      ctx.globalAlpha=.5+.35*Math.sin(performance.now()/240);
      ctx.strokeRect(c.x*CELL+2,c.y*CELL+2,CELL-4,CELL-4);ctx.restore();
    }
    ctx.save();ctx.globalAlpha=.5+.22*Math.sin(performance.now()/500);
    oval((c.x+.28)*CELL,(c.y+.38)*CELL,3,3,'#ffd98a');
    oval((c.x+.72)*CELL,(c.y+.38)*CELL,3,3,'#ffd98a');
    ctx.restore();
  }
  // 营地受损 / 失守在地图上直接给提示，不只写进战报
  for(const c of game.camps)if(c.damaged||c.lost){
    const t=campTile(c);
    inCell(t.x*CELL,t.y*CELL,()=>{oval(46,14,9,9,'#8d4b3c');label('!',46,14,12,'#ffe2ad');});
  }
  // 领主出手弧线：方向来自真实攻击目标
  const sw=game.hero.swing;
  if(sw&&game.hero.hp>0){
    const h=game.hero,u=Math.min(1,sw.t/.48);
    const a=Math.max(0,1-Math.abs(u-.34)/.34);
    if(a>0){
      ctx.save();ctx.globalAlpha=a*.9;
      ctx.strokeStyle='#ffe6ae';ctx.lineWidth=4*CELL/60;
      ctx.beginPath();
      const dir=h.face<0?-1:1;
      ctx.arc(h.x*CELL,h.y*CELL,34*CELL/60,dir>0?-1.1:-2.05,dir>0?1.1:2.05);
      ctx.stroke();ctx.restore();
    }
  }
}
'''
_D_OLD = """  if(isNight){
    for(const e of game.effects){
      const fade=e.time/e.max;
      if(e.type==='arrow')line(e.x*CELL,e.y*CELL-12*CELL/60,e.tx*CELL,e.ty*CELL-6*CELL/60,'rgba(255,217,132,'+fade+')',2);
      else oval(e.x*CELL,e.y*CELL,11*fade*CELL/60,11*fade*CELL/60,e.color);
    }
  }
  if(game.phase==='won')drawVictoryMarks();
  syncSheet();"""
_D_NEW = """  if(isNight||game.presentation)drawCombatLayer();
  if(game.phase==='won')drawVictoryMarks();
  ctx.restore();
  syncSheet();"""
rep(_D_OLD, _D_NEW)
# 把战斗表现层作为顶层函数放在 draw() 之前，供绘制与 FW 导出共同引用
_di = s.index('function draw(){')
s = s[:_di] + COMBAT_DRAW + s[_di:]

# ---------------------------------------------------------------- rAF 绘制（取消 30fps 节流）
rep("""  if(now-lastDraw>33){draw();lastDraw=now;}""", """  draw();""")

# ---------------------------------------------------------------- 设置菜单绑定
rep("""let lastHud=0, lastDraw=0, paused=false;""",
"""/* v0.24 齿轮菜单：音效开关与效果强度，只影响表现，不碰业务 */
function syncSettingsMenu(){
  $('soundToggle').textContent='音效：'+(game.settings.sound?'开（低音量）':'关');
  $('effectsToggle').textContent='效果：'+(game.settings.effects==='weak'?'弱化':'标准');
}
function toggleSettings(forceOpen){
  const box=$('settingsMenu');
  box.hidden=forceOpen===undefined?!box.hidden:!forceOpen;
  $('settingsBtn').setAttribute('aria-expanded',box.hidden?'false':'true');
  if(!box.hidden)syncSettingsMenu();
}
$('settingsBtn').addEventListener('click',()=>toggleSettings());
$('settingsClose').addEventListener('click',()=>toggleSettings(false));
$('soundToggle').addEventListener('click',()=>{
  game.settings.sound=!game.settings.sound;
  if(game.settings.sound)unlockAudio();
  syncSettingsMenu();
});
$('effectsToggle').addEventListener('click',()=>{
  game.settings.effects=game.settings.effects==='weak'?'standard':'weak';
  if(game.settings.effects==='weak'){game.shake={t:0,mag:0};}
  syncSettingsMenu();
});
$('settingsHelp').addEventListener('click',()=>{toggleSettings(false);$('helpBtn').click();});
let lastHud=0, lastDraw=0, paused=false;""")

# ---------------------------------------------------------------- 文案 / 导出
rep("""  'v0.23：白天首日 120 秒""",
"""  'v0.24：箭塔、民兵和守卫先发出可见弹体，飞到目标身上才结算一次伤害；领主攻击有蓄势与挥击过程，墙和实体树石会挡住近战。命中会闪白、蹦火花并飘出伤害数字，只有真正拿到奖励票据时才飘金币 / 经验。齿轮 ⚙ 可开关音效、切换「标准 / 弱化」效果；弱化会关震屏、减少粒子，系统降低动态效果也会自动生效。首领倒下后先播一小段胜利表现再结算。',
  'v0.23：白天首日 120 秒""")
rep("""  NIGHT_PLAN,planFor,nightStopAt,nightLastWaveAt,plannedNormal,campNormal,campWaves,""",
"""  FX_CAP,reducedMotion,effectsWeak,visualBudget,AudioKit,unlockAudio,
  emitCombatEvent,consumeCombatEvent,addFloat,floatText,spawnSparks,triggerShake,
  markBuildingFlash,clearCombatVisuals,updateEffects,
  launchProjectile,resolveHit,updateProjectiles,meleeClear,updateSwing,
  beginVictoryPresentation,updatePresentation,drawCombatLayer,
  syncSettingsMenu,toggleSettings,
  NIGHT_PLAN,planFor,nightStopAt,nightLastWaveAt,plannedNormal,campNormal,campWaves,""")

io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print('wrote', DST, len(s), 'chars')
