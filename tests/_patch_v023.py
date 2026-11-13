# -*- coding: utf-8 -*-
"""v0.23 派生脚本：从 v0.22 复制并落地「昼夜节奏 / 显式波次 / 收益预算 / 主动入夜 / 回场」。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Border-Guard-v0.22.html')
DST = os.path.join(ROOT, 'Border-Guard-v0.23.html')
s = io.open(SRC, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit('MISS (%d != %d): %r' % (n, count, old[:100]))
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


rep('全景地图 · 探索经营 · 昼夜守卫 · v0.22', '全景地图 · 探索经营 · 昼夜守卫 · v0.23')

# ---------------------------------------------------------------- 阻塞级修复：塔不能被永久当墙
# 实测 seed99：在唯一通路上建塔后，16 名敌人卡在出生点 1618 秒，夜战永不结束。
# 塔与墙一样是「可被围攻拆除」的实体，敌人不穿过去，但也不会被判成不可达。
rep("""function enemyPassable(t){
  if(!t||isSolidGround(t)||t.campSolid)return false;
  if(t.building&&t.building.type!=='wall')return false;
  return true;
}""",
"""function enemyBreakable(t){
  return !!t?.building&&(t.building.type==='wall'||t.building.type==='tower');
}
function enemyPassable(t){
  if(!t||isSolidGround(t)||t.campSolid)return false;
  if(t.building&&!enemyBreakable(t))return false;
  return true;
}""")
rep("""      const cost=n.building?.type==='wall'?9.45:n.ground==='road'?.75:1.22;""",
"""      const cost=n.building?.type==='tower'?14:n.building?.type==='wall'?9.45:
        n.ground==='road'?.75:1.22;""")
rep("""    const score=t=>front.route[at(t.x,t.y)]+(t.building?.type==='wall'?4.35:0);""",
"""    const score=t=>front.route[at(t.x,t.y)]+
      (t.building?.type==='tower'?6:t.building?.type==='wall'?4.35:0);""")
rep("""  const atGoal=()=>e.next&&e.next.building?.type!=='wall'&&distance(e,center(e.next))<.14;""",
"""  const atGoal=()=>e.next&&!enemyBreakable(e.next)&&distance(e,center(e.next))<.14;""")
rep("""  if(!e.next||atGoal()||(!enemyPassable(e.next)&&e.next.building?.type!=='wall')){""",
"""  if(!e.next||atGoal()||!enemyPassable(e.next)){""")
rep("""  const goal=center(e.next),wall=e.next.building;
  if(wall?.type==='wall'&&distance(e,goal)<.62+e.radius){
    e.moving=false;
    if(e.cooldown<=0){
      wall.hp-=e.boss?35:e.heavy?22:12;
      e.cooldown=.85;
      if(wall.hp<=0){
        const rubble=nightBook();
        if(rubble)rubble.buildingsLost++;
        e.next.building=null;
        invalidateNavigation();
        for(const route of game.fronts)calculateRoutes(route);
        report('一段城墙被摧毁。');
      }
    }
    return;
  }""",
"""  const goal=center(e.next),block=e.next.building;
  if(enemyBreakable(e.next)&&distance(e,goal)<.62+e.radius){
    e.moving=false;
    if(e.cooldown<=0){
      block.hp-=e.boss?35:e.heavy?22:12;
      e.cooldown=.85;
      if(block.hp<=0){
        const rubble=nightBook();
        if(rubble)rubble.buildingsLost++;
        const wasTower=block.type==='tower';
        e.next.building=null;
        invalidateNavigation();
        for(const route of game.fronts)calculateRoutes(route);
        report(wasTower?'一座箭塔被摧毁。':'一段城墙被摧毁。');
      }
    }
    return;
  }""")
# 完全重合的单位不能被 d<1e-5 直接跳过，否则永远叠在同一点
replace_func('separateUnits', r'''function separateUnits(dt){
  const units=game.enemies.filter(e=>e.hp>0);
  if(units.length<2)return;
  const push=Math.min(1,dt*9)*DEMO.separation;
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],b=units[j];
    let dx=b.x-a.x,dy=b.y-a.y;
    const min=(actorRadius(a)+actorRadius(b))*.9;
    let d=Math.hypot(dx,dy);
    if(d>=min)continue;
    if(d<1e-5){
      // 同帧同点出生：用 ID 决定的确定性微方向拆开，不能 continue 让它们永远叠着
      const angle=(a.id||i)*2.399963+(b.id||j)*.7;
      dx=Math.cos(angle)*1e-3;dy=Math.sin(angle)*1e-3;d=1e-3;
    }
    const f=(min-d)/d*push*.5;
    const ax=a.x-dx*f,ay=a.y-dy*f,bx=b.x+dx*f,by=b.y+dy*f;
    if(canOccupy(a,ax,ay)){a.x=ax;a.y=ay;}
    if(canOccupy(b,bx,by)){b.x=bx;b.y=by;}
  }
}''')

# ---------------------------------------------------------------- 流场源：可拆建筑也要能当攻击位
# 实测：4 座塔围住城堡后，serviceTiles() 只剩一格且被地形隔断，
# 西侧走廊的 Dijkstra 分数全为 Infinity，敌人永远停在出生点。
replace_func('calculateRoutes', r'''function calculateRoutes(front,target){
  const targetTile=target||(front.camp&&!front.camp.lost?campTile(front.camp):game.castle||tileOf(game.hero));
  const run=seeds=>{
    const scores=Array(game.tiles.length).fill(Infinity);
    const seen=new Set();
    for(const s of seeds)scores[at(s.x,s.y)]=0;
    for(let j=0;j<game.tiles.length;j++){
      let chosen=-1;
      for(let i=0;i<scores.length;i++){
        if(!seen.has(i)&&scores[i]<(chosen<0?Infinity:scores[chosen]))chosen=i;
      }
      if(chosen<0)break;
      seen.add(chosen);
      const t=game.tiles[chosen];
      for(const [dx,dy] of dirs){
        const n=tileAt(t.x+dx,t.y+dy);
        if(!enemyPassable(n))continue;
        const index=at(n.x,n.y);
        const cost=n.building?.type==='tower'?14:n.building?.type==='wall'?9.45:
          n.ground==='road'?.75:1.22;
        scores[index]=Math.min(scores[index],scores[chosen]+cost);
      }
    }
    return scores;
  };
  // 源是目标实体外侧 4 个相邻有效攻击位（含可拆塔/墙），不是实体格中心。
  let slots=dirs.map(([dx,dy])=>tileAt(targetTile.x+dx,targetTile.y+dy))
    .filter(t=>t&&enemyPassable(t));
  if(!slots.length)slots=serviceTiles(targetTile).filter(enemyPassable);
  let scores=run(slots);
  // 兜底：入口仍不可达时，把所有可拆建筑也作为源，保证敌人不会永久卡在出生点。
  if(front.gates?.some(g=>!Number.isFinite(scores[at(g.x,g.y)]))){
    const extra=game.tiles.filter(enemyBreakable);
    if(extra.length)scores=run(slots.concat(extra));
  }
  front.route=scores;
  front.targetIndex=at(targetTile.x,targetTile.y);
  front.attackSlots=slots.map(center);
}''')

# ---------------------------------------------------------------- DEMO 与显式波次表
rep("""  daySeconds: 35, firstDaySeconds: 60, nightSeconds: 17, campSpawnDistance: 4,
  dispatchSpeed: 6, mainCap: 3, campCap: 2,
  spawnInterval: 1.1, carryFactor: 1.5, claimGold: 4, wage: 2, ration: 1,""",
"""  // v0.23 首轮节奏。白天：首日 120 秒，其余 90 秒；夜长由 NIGHT_PLAN 显式波次表决定。
  daySeconds: 90, firstDaySeconds: 120, campSpawnDistance: 4,
  dispatchSpeed: 6, campCap: 6, globalCap: 60,
  spawnInterval: .9, carryFactor: 1.0, claimGold: 4, wage: 2, ration: 1,
  earlyNightCountdown: 3, rallyRange: 4,
  heroDownDelay: 12, heroDownHp: .4, heroDownInvuln: 1,
  stagingMin: 10, stagingMax: 16, stagingLead: 3, stagingMinDistance: 4,
  reserveTakeRate: .25,""")

rep("""  separation:.22,       // 温和分离强度，允许有限软重叠，不做互相堵死的硬墙
};""",
"""  separation:.22,       // 温和分离强度，允许有限软重叠，不做互相堵死的硬墙
};
/* ===== v0.23 显式波次表 =====
   day/stop/lastWave 单位都是秒；normal 是本夜计划出场的普通兵总数；cap 是主城同屏上限。
   波次是硬表，不是「1.1 秒无限刷」：每组按 0.9 秒间隔持续出兵，组间留出可见喘息。
   各组 gate 对应 entrances(day) 的下标，双路夜错峰形成夹击。 */
const NIGHT_PLAN={
  1:{day:120,stop:75,lastWave:60,normal:18,cap:10,gold:6,xp:6,
     waves:[{at:3,count:5,gate:0},{at:22,count:5,gate:0},{at:42,count:4,gate:0},{at:60,count:4,gate:0}]},
  2:{day:90,stop:80,lastWave:65,normal:24,cap:14,gold:8,xp:8,
     waves:[{at:3,count:6,gate:0},{at:28,count:6,gate:0},{at:48,count:6,gate:0},{at:65,count:6,gate:0}]},
  3:{day:90,stop:90,lastWave:75,normal:32,cap:18,gold:10,xp:10,
     waves:[{at:3,count:8,gate:0},{at:32,count:8,gate:1},{at:55,count:8,gate:0},{at:75,count:8,gate:1}]},
  4:{day:90,stop:100,lastWave:85,normal:40,cap:22,gold:12,xp:12,
     waves:[{at:3,count:10,gate:1},{at:32,count:10,gate:0},{at:58,count:10,gate:1},{at:85,count:10,gate:0}]},
  5:{day:90,stop:110,lastWave:95,normal:48,cap:26,gold:6,xp:6,
     waves:[{at:3,count:12,gate:0},{at:25,count:12,gate:1},{at:55,count:12,gate:0},{at:95,count:12,gate:1}]}
};
function planFor(day,boss=false){
  return NIGHT_PLAN[Math.min(LAST_NIGHT,Math.max(1,boss?LAST_NIGHT:day))];
}
function nightStopAt(day,boss=false){return planFor(day,boss).stop;}
function nightLastWaveAt(day,boss=false){return planFor(day,boss).lastWave;}
function plannedNormal(day,boss=false){return planFor(day,boss).normal;}
function campNormal(day){return 6+Math.min(2,Math.max(0,Math.floor(day/2)-1))*2;}
function campWaves(day){
  const n=campNormal(day),a=Math.ceil(n/2);
  return [{at:4,count:a,gate:0},{at:42,count:n-a,gate:0}];
}""")

# ---------------------------------------------------------------- 队列记录 / 波次计划 / 待援
_FRONT_START = s.index('function makeFront(id,camp,oldCount,newCount,boss=false){')
_FRONT_END = s.index('function campName(c){', _FRONT_START)
FRONT = r'''/* ===== v0.23 波次 / 收益预算 / 待援队列 =====
   队列是稳定记录 {id,originDay,kind,rewardGold,rewardXp,carried}，不再是字符串。
   本夜新增普通兵的金币 / 经验是固定预算，均匀分配到这些记录；
   结转记录保留原票据，不再次发新票据或重复支付。 */
function queueRecord(kind,originDay,gold=0,xp=0,carried=false){
  const seq=game&&game.nextQueueId?game.nextQueueId++:Math.floor(performance.now()*1000);
  return {id:'q'+seq,originDay,kind,rewardGold:gold,rewardXp:xp,carried};
}
function allocateTickets(records,gold,xp){
  const n=records.length;
  for(let i=0;i<n;i++){
    records[i].rewardGold=Math.floor(gold*(i+1)/n)-Math.floor(gold*i/n);
    records[i].rewardXp=Math.floor(xp*(i+1)/n)-Math.floor(xp*i/n);
  }
}
function createWavePlan(day,frontKind,boss=false){
  const plan=planFor(day,boss),main=frontKind==='home';
  const waves=main?plan.waves:campWaves(day);
  const total=main?plan.normal:campNormal(day);
  const gold=main?plan.gold:3+Math.floor(day/2);
  const xp=gold;
  const records=[];
  for(let i=0;i<total;i++)records.push(queueRecord('normal',day));
  allocateTickets(records,gold,xp);
  const schedule=[];
  let idx=0;
  for(const w of waves){
    for(let k=0;k<w.count&&idx<records.length;k++){
      schedule.push({at:w.at+k*DEMO.spawnInterval,record:records[idx++],gate:w.gate||0,wave:w.at});
    }
  }
  while(idx<records.length)schedule.push({at:plan.lastWave,record:records[idx++],gate:0,wave:plan.lastWave});
  let bossGold=0,bossXp=0;
  if(main&&boss){
    bossGold=8;bossXp=1;
    // 首领约 25 秒、第二组攻势时加入，预留出场名额
    schedule.push({at:25,record:queueRecord('boss',day,8,1),gate:0,wave:'boss'});
  }
  schedule.sort((a,b)=>a.at-b.at||String(a.record.id).localeCompare(String(b.record.id)));
  return {waves,schedule,total,cap:main?plan.cap:DEMO.campCap,stop:plan.stop,
    lastWave:plan.lastWave,budget:{gold:gold+bossGold,xp:xp+bossXp},day,boss:main&&boss};
}
function makeFront(id,camp,plan,carried){
  const schedule=plan.schedule.map(entry=>({...entry}));
  for(const rec of carried||[])schedule.push({at:4,record:rec,gate:0,wave:'reserve',carried:true});
  return {id,camp,waves:plan.waves,schedule,cap:plan.cap,stop:plan.stop,lastWave:plan.lastWave,
    budget:plan.budget,stopped:false,route:null,gates:[],index:0,staging:null,
    bossPending:schedule.some(entry=>entry.record.kind==='boss'),
    firstWaveAt:schedule.length?Math.min(...schedule.map(entry=>entry.at)):3};
}
function frontHasRoom(front,isBoss=false){
  const live=game.enemies.filter(e=>e.front===front&&e.hp>0).length;
  const reserved=!isBoss&&front.bossPending?1:0;
  return live<front.cap-reserved&&game.enemies.filter(e=>e.hp>0).length<DEMO.globalCap;
}
function isFrontComplete(front){
  return !front.schedule.some(entry=>!entry.dispatched)&&
    !game.enemies.some(e=>e.hp>0&&e.front===front);
}
function takeReserve(id,limit){
  const list=game.reserve?.[id]||[];
  const taken=list.splice(0,Math.max(0,limit));
  game.carry[id]=list.length;
  return taken;
}
function reserveCount(){
  return Object.values(game.reserve||{}).reduce((n,list)=>n+(list?.length||0),0);
}
function stopFront(front){
  if(!front||front.stopped)return;
  const list=game.reserve[front.id]=game.reserve[front.id]||[];
  let held=0;
  for(const entry of front.schedule){
    if(entry.dispatched)continue;
    entry.record.carried=true;
    list.push(entry.record);held++;
  }
  front.schedule=front.schedule.filter(entry=>entry.dispatched);
  front.stopped=true;front.bossPending=false;
  game.carry[front.id]=list.length;
  report((front.camp?campName(front.camp):'主城战场')+'停刷：'+held+
    ' 名未出场敌军进入待援队列（本局累计 '+list.length+' 名），不重复发奖励票据。');
}
function spawnDue(bossOnly){
  for(const front of game.fronts){
    if(front.stopped)continue;
    if(game.enemies.filter(e=>e.hp>0).length>=DEMO.globalCap)break;
    for(const entry of front.schedule){
      if(entry.dispatched||entry.at>game.clock)continue;
      const isBoss=entry.record.kind==='boss';
      if(isBoss!==bossOnly)continue;
      if(!frontHasRoom(front,isBoss))break;
      spawnEnemy(front,entry);
      entry.dispatched=true;
    }
  }
}
'''
s = s[:_FRONT_START] + FRONT + s[_FRONT_END:]

# ---------------------------------------------------------------- 时长 / 战绩 / 军令 / 预告
replace_func('phaseLimit', r'''function phaseLimit(day=game.day){return planFor(day,false).day;}''')
rep("const BEST_KEY='borderGuard.best.v1';", "const BEST_KEY='borderGuard.best.v2';")
rep("""  const rec={
    runs:(old.runs||0)+1,wins:(old.wins||0)+(victory?1:0),""",
"""  const rec={
    rules:'v0.23',   // 兵量 / 奖励口径已改变，旧 v1 击杀纪录不直接比较
    runs:(old.runs||0)+1,wins:(old.wins||0)+(victory?1:0),""")
replace_func('contractGoal', r'''function contractGoal(id,day){
  // 守住阵线按「本夜计划新普通兵 50%（向上取整）」，领主亲征固定 5 名
  if(id==='line')return Math.ceil(plannedNormal(day)*.5);
  if(id==='slayer')return 5;
  if(id==='economist')return 2;
  return 1;
}''')
replace_func('nightPreview', r'''function nightPreview(day){
  if(!game||!['day','night'].includes(game.phase))return '';
  const d=day||game.day;
  const boss=d>=LAST_NIGHT||game.scheduled;
  const plan=planFor(d,boss);
  const gates=entrances(d);
  const names=gates.map(t=>t.x===0?'西门':t.x===WIDTH-1?'东门':'北境');
  const bits=[(boss?'首领夜':d===1?'试探夜':'第 '+d+' 夜'),
    names.join('＋')+(names.length>1?' 双路':' 单路'),
    '计划 '+plan.normal+' 名普通兵'+(boss?' + 首领':''),plan.waves.length+' 波'];
  if(d>1)bits.push('可能出现重甲');
  if(typeof raidCamp==='function'&&raidCamp())bits.push('营地同时遇袭 '+campNormal(d)+' 名');
  if(reserveCount())bits.push('待援 '+reserveCount()+' 名');
  return bits.join(' · ');
}''')

# ---------------------------------------------------------------- 号令 4 格
replace_func('rally', r'''function rally(){
  if(!game||game.phase!=='night'||game.rallyCharges<=0||$('dialog').open)return;
  const list=game.enemies.filter(e=>e.hp>0&&distance(e,game.hero)<=DEMO.rallyRange);
  if(!list.length){toast('领主周围 4 格内没有敌人，号令留到接敌时。');return;}
  const towers=game.tiles.filter(t=>t.building?.type==='tower').length;
  const dmg=8+towers*4+game.militia*3;
  game.rallyCharges--;
  for(const e of list)damageEnemy(e,dmg,'rally');
  report('号令齐射：领主周围 4 格内 '+list.length+' 名敌军受到 '+dmg+' 点伤害。',true);
  sync();
}''')

# ---------------------------------------------------------------- 入夜 / 出生 / 结算
replace_func('startNight', r'''function startNight(){
  if(game.phase!=='day')return;
  const raid=raidCamp();
  game.phase='night';game.mode=null;game.clock=0;game.spawnStopped=false;
  game.earlyNightAt=null;
  game.isBoss=Boolean(game.castle&&(game.day>=LAST_NIGHT||game.scheduled));
  game.bossDefeated=false;game.bossSpawned=false;
  game.heroDown=null;game.heroDownUsed=0;
  game.nightStartHp=game.castleHp;
  game.rallyCharges=1+(game.rallyBonus||0);
  game.rallyBonus=0;
  const plan=createWavePlan(game.day,'home',game.isBoss);
  const carried=takeReserve('home',Math.ceil(plan.total*DEMO.reserveTakeRate));
  const main=makeFront('home',null,plan,carried);
  main.gates=entrances(game.day);game.fronts=[main];
  const nightRecord=nightBook();
  if(nightRecord){
    nightRecord.boss=game.isBoss;
    nightRecord.early=!!game.early;
    nightRecord.gates=main.gates.map(t=>({x:t.x,y:t.y}));
    nightRecord.planned=plan.total;
    nightRecord.budget={...plan.budget};
  }
  if(raid){
    const cp=createWavePlan(game.day,raid.id,false);
    const cc=takeReserve(raid.id,Math.ceil(cp.total*DEMO.reserveTakeRate));
    const front=makeFront(raid.id,raid,cp,cc);
    front.gates=[campGate(raid)||entrances(game.day)[0]];
    game.fronts.push(front);
  }
  game.waveKills=0;game.waveGold=0;game.effects=[];game.militiaCooldown=0;
  for(const front of game.fronts){
    calculateRoutes(front);
    front.staging=chooseStagingPoint(front);
    if(front.staging)report('斥候标记：敌军将在 '+(front.staging.x)+','+(front.staging.y)+
      ' 集结，'+DEMO.stagingLead+' 秒后进军（入口方向不变）。',true);
  }
  const target=game.castle?'敌军开始进攻城堡。':'尚未建城，敌军正在追击领主。';
  const panelNote=game.panel?' 面板仍开着，点空地即可移动，攻击照常。':'';
  announce((game.isBoss?'首领现身。':'第 '+game.day+' 夜。')+target+(raid?campName(raid)+'也在遇袭。':'')+panelNote,true);
}
/* 远侧入口到城堡可能要 20 秒以上。按流场在同一入口方向找一处距目标 10–16 格、
   距领主与居民至少 4 格、不在领地 / 营地控制区的合法集结位；没有就继续用原边缘。 */
function chooseStagingPoint(front){
  const gate=front.gates[0];
  const target=front.camp&&!front.camp.lost?campTile(front.camp):game.castle||tileOf(game.hero);
  if(!gate||!target||!front.route)return null;
  if(distance(gate,target)/1.38<=15)return null;
  const side=gate.x<=1?-1:gate.x>=WIDTH-2?1:0;
  let best=null,bestScore=Infinity;
  for(const t of game.tiles){
    if(!walkable(t)||t.owned)continue;
    const d=distance(center(t),center(target));
    if(d<DEMO.stagingMin||d>DEMO.stagingMax)continue;
    if(side<0&&t.x>target.x)continue;
    if(side>0&&t.x<target.x)continue;
    if(!Number.isFinite(front.route[at(t.x,t.y)]))continue;
    if(game.camps.some(c=>Math.max(Math.abs(campTile(c).x-t.x),Math.abs(campTile(c).y-t.y))<=1))continue;
    const p=center(t);
    if(!canOccupy({radius:DEMO.radii.normal},p.x,p.y))continue;
    if(distance(p,game.hero)<DEMO.stagingMinDistance)continue;
    if(game.residents.some(r=>r.state!=='dead'&&distance(p,r)<DEMO.stagingMinDistance))continue;
    const score=Math.abs(d-13)+front.route[at(t.x,t.y)]*.01;
    if(score<bestScore){bestScore=score;best=t;}
  }
  return best;
}''')

_SPAWN_START = s.index('function targetX(gate,front){')
_SPAWN_END = s.index('function damageEnemy(enemy,amount){', _SPAWN_START)
SPAWN = r'''function spawnEnemy(front,entry){
  const rec=entry?.record||queueRecord('normal',game.day);
  const isBoss=rec.kind==='boss';
  const gate=front.gates[(entry?.gate||0)%front.gates.length]||front.gates[0]||tileAt(0,5);
  const from=!isBoss&&front.staging?front.staging:gate;
  const heavy=!isBoss&&game.day>1&&((front.index+game.seed)%5===0);
  const hp=isBoss?Math.round(430*(game.fragments?.82:1)):heavy?45+game.day*7:20+game.day*4;
  const e={
    ...center(from),id:game.nextEnemyId++,front,hp,max:hp,boss:isBoss,heavy,
    rewardGold:rec.rewardGold||0,rewardXp:rec.rewardXp||0,
    ticketId:rec.id,originDay:rec.originDay,carried:!!rec.carried,
    radius:isBoss?DEMO.radii.boss:heavy?DEMO.radii.heavy:DEMO.radii.normal,
    speed:isBoss?.72:heavy?.86:1.38+(front.index%3)*.09,cooldown:0,flash:0,next:null,
    face:(from.x>(game.castle?.x??WIDTH/2)?-1:1),moving:false,
    routeRevision:navigationRevision(),settled:false
  };
  game.enemies.push(e);
  if(isBoss){
    game.bossSpawned=true;front.bossPending=false;
    const book=nightBook();
    if(book)book.bossGate={x:from.x,y:from.y};
  }
  front.index++;
  return e;
}
'''
s = s[:_SPAWN_START] + SPAWN + s[_SPAWN_END:]

_DAMAGE_START = s.index('function damageEnemy(enemy,amount){')
_DAMAGE_END = s.index('function attack(){', _DAMAGE_START)
DAMAGE = r'''/* 唯一击杀结算入口：伤害只在命中处扣一次，票据只兑现一次。
   没有票据的兵（含待援队列里已经领过票据的）仍计真实击杀，但不重复发资源。 */
function settleKill(enemy,source='other'){
  if(!enemy||enemy.settled)return false;
  enemy.settled=true;
  if(enemy.boss)game.bossDefeated=true;
  game.waveKills++;game.kills++;
  const gold=enemy.rewardGold||0,xp=enemy.rewardXp||0;
  if(gold){
    game.waveGold+=gold;
    addIncome({gold},'kill',enemy.boss?'击败首领':'击退敌军');
  }
  if(xp)game.xp+=xp;
  const book=nightBook();
  if(book)book.kills++;
  if(source==='hero')bumpContract('slayer');
  game.effects.push({type:'spark',x:enemy.x,y:enemy.y,time:.32,max:.32,color:'#ffda84'});
  return true;
}
function damageEnemy(enemy,amount,source='other'){
  if(!enemy||enemy.hp<=0||enemy.settled)return;
  enemy.hp-=amount;enemy.flash=.12;
  if(enemy.hp<=0)settleKill(enemy,source);
}
'''
s = s[:_DAMAGE_START] + DAMAGE + s[_DAMAGE_END:]

rep("""  for(const enemy of nearby){
    const before=enemy.hp;
    damageEnemy(enemy,18+game.heroLevel*6+game.ranks.hero*12+game.bonuses.blade*5);
    // v0.21：只有领主亲手打出的最后一击计入「领主亲征」
    if(before>0&&enemy.hp<=0)bumpContract('slayer');
  }""",
"""  // v0.23：亲手最后一击由 settleKill(source='hero') 统一计入「领主亲征」
  for(const enemy of nearby)damageEnemy(enemy,18+game.heroLevel*6+game.ranks.hero*12+game.bonuses.blade*5,'hero');""")

# ---------------------------------------------------------------- 有效攻击站位
rep("""  // 贴到目标实体外侧的有效攻击位才打建筑，不能钻进实体格中心
  if(distance(e,targetPoint)<.82+e.radius){
    e.moving=false;
    if(e.cooldown<=0&&(camp||game.castle)){""",
"""  // v0.23 有效攻击站位：目标周围只有 8 个位置能同时出手，其余后排排队，
  // 不允许几十名敌人叠在一点同时伤害城堡。
  const distTarget=distance(e,targetPoint);
  if(distTarget<2.3){
    if(e.slot===null){e.moving=false;return;}
    if(distTarget>=1.45&&e.slot){stepToward(e,e.slot,e.speed,dt);return;}
    e.moving=false;
    if(e.cooldown<=0&&(camp||game.castle)){""")
rep("""function moveEnemy(e,dt){""",
"""/* 每帧给每个目标分配最多 8 个真实攻击站位：4 个邻格 × 每格 2 个错位。
   按「离敌人最近的空位」贪心分配，保证从西侧来的敌人拿到西侧站位，
   不会绕到城堡背面才接敌；其余敌人排在外圈，不叠在一点同时伤害城堡。 */
function attackSlotPoint(targetTile,k){
  const dir=dirs[k>>1],off=(k%2?.22:-.22);
  const a={x:targetTile.x+.5+dir[0]+(dir[0]?0:off),y:targetTile.y+.5+dir[1]+(dir[1]?0:off)};
  const b={x:targetTile.x+.5+dir[0],y:targetTile.y+.5+dir[1]};
  if(canOccupy({radius:DEMO.radii.normal},a.x,a.y))return a;
  if(canOccupy({radius:DEMO.radii.normal},b.x,b.y))return b;
  return null;
}
function attackSlotPoints(targetTile){
  const out=[];
  for(let k=0;k<8;k++){const p=attackSlotPoint(targetTile,k);if(p)out.push(p);}
  return out;
}
function assignAttackSlots(){
  for(const front of game.fronts){
    const target=front.camp&&!front.camp.lost?campTile(front.camp):game.castle||tileOf(game.hero);
    const c=center(target),slots=attackSlotPoints(target);
    const near=game.enemies.filter(e=>e.hp>0&&e.front===front&&distance(e,c)<3.6)
      .sort((a,b)=>distance(a,c)-distance(b,c)||(a.id||0)-(b.id||0));
    const used=new Set();
    near.forEach(e=>{
      let best=-1,bestD=Infinity;
      for(let k=0;k<slots.length;k++){
        if(used.has(k))continue;
        const d=distance(e,slots[k]);
        if(d<bestD){bestD=d;best=k;}
      }
      if(best>=0&&used.size<slots.length&&bestD<3.2){used.add(best);e.slot=slots[best];}
      else e.slot=null;
    });
  }
}
function moveEnemy(e,dt){""")

# ---------------------------------------------------------------- 主循环
replace_func('advanceBattle', r'''function advanceBattle(dt){
  game.clock+=dt;
  const stop=nightStopAt(game.day,game.isBoss);
  if(!game.spawnStopped&&game.clock>=stop){
    game.spawnStopped=true;game.cleanup=0;
    for(const front of game.fronts)stopFront(front);
    report('本夜停止刷新，清完场上残敌后天亮。',true);
    sync();
  }
  if(!game.spawnStopped){
    // 先放首领（预留名额），再放普通兵；上限不足时未出场记录留在 schedule，不丢失
    spawnDue(true);
    spawnDue(false);
  }
  fireTowers(dt);
  assignAttackSlots();
  for(const e of game.enemies)if(e.hp>0)moveEnemy(e,dt);
  separateUnits(dt);
  game.enemies=game.enemies.filter(e=>e.hp>0);
  for(const effect of game.effects)effect.time-=dt;
  game.effects=game.effects.filter(e=>e.time>0);
  if(game.castleHp<=0||(!game.castle&&game.hero.hp<=0)){finish(false);return;}
  if(game.spawnStopped)game.cleanup+=dt;
  if(game.enemies.length||game.fronts.some(front=>!isFrontComplete(front)))return;
  // 未出场首领绝不能胜利；历史待援队列独立，不阻塞天亮
  if(game.isBoss){
    const bossPending=game.fronts.some(f=>f.schedule.some(s=>!s.dispatched&&s.record.kind==='boss'));
    if(bossPending||!game.bossSpawned||!game.bossDefeated)return;
    finish(true);return;
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

replace_func('tickCampaign', r'''function tickCampaign(dt){
  // 开局对话框、暂停、任何弹窗都不推进时钟与战斗（回场倒计时同样停住）
  if(!['day','night'].includes(game.phase)||!game.started||paused||$('dialog').open)return;
  moveHero(dt);
  updateHeroRecovery(dt);
  game.nightDue=game.phase==='day'&&game.phaseElapsed+dt>=phaseLimit();
  updateResidents(dt);
  if(game.phase==='day'){
    if(scoutAroundHero())sync();
    game.phaseElapsed+=dt;
    const raid=raidCamp();
    if(raid&&game.announcedRaid!==raid.id){
      if(game.phaseElapsed>=phaseLimit()){
        raid.raidSkipDay=game.day;
        report(campName(raid)+'直到入夜这一刻才成为目标，今夜不打，留到之后的夜袭再预告。',true);
      }else{
        game.announcedRaid=raid.id;
        report('侦察预告：'+campName(raid)+'今夜将遭袭。还可以撤离、布防，或亲自赶过去。',true);
      }
      sync();
    }
    if(game.earlyNightAt&&game.phaseElapsed>=game.earlyNightAt){
      game.earlyNightAt=null;startNight();game.nightDue=false;return;
    }
    if(game.phaseElapsed>=phaseLimit())startNight();
  }else advanceBattle(dt);
  game.nightDue=false;
}''')

# ---------------------------------------------------------------- 主动入夜 / 回场
rep("""function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}""",
"""/* ===== v0.23 主动入夜与领主回场 ===== */
function earlyNightReminders(){
  const bits=[];
  const idle=game.residents.filter(r=>r.state==='home'&&r.role).length;
  const waiting=game.residents.filter(r=>r.state==='waiting').length;
  const dev=game.tiles.filter(t=>t.visible&&t.owned&&t.node&&YIELD[t.node.kind]&&!t.node.developed).length;
  if(idle)bits.push(idle+' 名已培养居民未派驻');
  if(waiting)bits.push(waiting+' 名驻员待缴维护');
  if(dev)bits.push(dev+' 处领地资源未开发');
  if(!game.castle)bits.push('尚未建城');
  return bits.length?'提醒（不强制阻止）：'+bits.join('、')+'。':'提醒：暂无明显未完成事项。';
}
function requestEarlyNight(){
  if(game.phase!=='day'||game.earlyNightAt)return;
  const arm=()=>{
    if(game.phase!=='day')return;
    game.earlyNightAt=game.phaseElapsed+DEMO.earlyNightCountdown;
    report('准备完毕：'+DEMO.earlyNightCountdown+' 秒后入夜，再点一次按钮可取消。'+earlyNightReminders(),true);
    sync();
  };
  if(game.day===1&&!game.castle){
    dialog('首日尚未建城',[
      '现在入夜，敌军会直接追击领主；领主倒下而城堡不存在时本局立即结束。',
      earlyNightReminders()
    ],[
      {label:'确认提前入夜',gold:true,click:arm},
      {label:'继续准备',click:()=>{}}
    ]);
  }else arm();
}
function cancelEarlyNight(){
  if(!game.earlyNightAt)return;
  game.earlyNightAt=null;
  report('已取消提前入夜，按原时钟继续准备。',true);
  sync();
}
function updateHeroRecovery(dt){
  if(game.phase!=='night'||!game.hero)return;
  const h=game.hero;
  if(h.invuln>0)h.invuln=Math.max(0,h.invuln-dt);
  if(h.hp>0){if(game.heroDown)game.heroDown=null;return;}
  if(!game.castle)return;
  if(!game.heroDown||game.heroDown.phase==='done'){
    if((game.heroDownUsed||0)>=1){
      game.heroDown={phase:'spent',elapsed:0};
      report('领主再次倒下，本夜无法再回场；城防继续坚守。',true);
      return;
    }
    game.heroDown={phase:'waiting',elapsed:0};
    report('领主倒下：'+DEMO.heroDownDelay+' 秒后从城门回场（本夜仅一次）。',true);
  }
  const d=game.heroDown;
  if(d.phase!=='waiting')return;
  d.elapsed+=dt;
  if(d.elapsed>=DEMO.heroDownDelay){
    d.phase='done';
    game.heroDownUsed=(game.heroDownUsed||0)+1;
    const slot=serviceTiles(game.castle).find(t=>canOccupy(h,center(t).x,center(t).y));
    Object.assign(h,center(slot||game.castle));
    h.hp=Math.round(h.max*DEMO.heroDownHp);
    h.invuln=DEMO.heroDownInvuln;
    h.cooldown=0;h.goal=null;h.moving=false;
    report('领主回场：恢复 40% 生命，入场保护 '+DEMO.heroDownInvuln+' 秒。',true);
    sync();
  }
}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}""")

# ---------------------------------------------------------------- 天亮 / 终局
rep("""  game.phase='day';game.day++;game.phaseElapsed=0;game.actions=7;game.enemies=[];game.effects=[];game.mode=null;
  game.hero.hp=Math.max(Math.min(game.hero.max,game.hero.hp+13),35);
  report('第 '+finished+' 夜结束：击退 '+game.waveKills+' 只怪物，获得 '+game.waveGold+' 击杀金币。',true);""",
"""  game.phase='day';game.day++;game.phaseElapsed=0;game.actions=7;game.enemies=[];game.effects=[];game.mode=null;
  game.heroDown=null;game.heroDownUsed=0;game.earlyNightAt=null;game.bossSpawned=false;
  game.hero.hp=Math.max(Math.min(game.hero.max,game.hero.hp+13),35);
  report('第 '+finished+' 夜结束：击退 '+game.waveKills+' 只怪物，获得 '+game.waveGold+
    ' 击杀金币'+(reserveCount()?'，待援队列 '+reserveCount()+' 名留到后续夜次':'')+'。',true);""")
replace_func('finish', r'''function finish(victory){
  if(game.finished)return;
  game.finished=true;
  // 终局立即取消回场与提前入夜回调
  game.heroDown=null;game.earlyNightAt=null;
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
  game.enemies=[];game.effects=[];game.panel=false;
  if(!victory)note(game.castle?'第 '+game.day+' 夜城堡耐久归零，本局结束':'第 '+game.day+' 夜领主倒下，本局结束');
  report(victory?(game.early?'首领败退，获得提前通关记录。':'首领败退，边境守卫战结束。'):game.castle?'城堡失守，本局结束。':'领主倒下，本局结束。');
  sync();
}''')

# ---------------------------------------------------------------- 初始状态
rep("""    carry:{home:0}, fronts:[], spawnStopped:false, announcedRaid:null, nightDue:false,""",
"""    carry:{home:0}, reserve:{home:[]}, nextQueueId:1, nextEnemyId:1,
    heroDown:null, heroDownUsed:0, earlyNightAt:null, bossSpawned:false, finished:false,
    fronts:[], spawnStopped:false, announcedRaid:null, nightDue:false,""")

# ---------------------------------------------------------------- 命令栏
rep("""    bar.append(button('回到城堡',()=>{game.mode=null;setDestination(game.castle);sync();},{detail:'领主自动寻路回城'}));""",
"""    bar.append(button('回到城堡',()=>{game.mode=null;setDestination(game.castle);sync();},{detail:'领主自动寻路回城'}));
    bar.append(button(game.earlyNightAt?'取消提前入夜':'准备完毕 · 立即入夜',()=>{
      if(game.earlyNightAt)cancelEarlyNight();else requestEarlyNight();
    },{detail:game.earlyNightAt?'3 秒倒计时中，可取消':'跳过剩余白天 · 3 秒内可取消',
       active:!!game.earlyNightAt}));""")
rep("""      gold:true,detail:game.rallyCharges>0?'本夜可用 '+game.rallyCharges+' 次 · 全屏齐射':'本夜已用尽',""",
"""      gold:true,detail:game.rallyCharges>0?'本夜可用 '+game.rallyCharges+' 次 · 领主周围 4 格':'本夜已用尽',""")

# ---------------------------------------------------------------- HUD 时钟
replace_func('updateBattleHud', r'''function updateBattleHud(){
  updateStocks();
  const clock=$('clockReadout'), night=game.phase==='night', limit=phaseLimit();
  const nightLimit=nightStopAt(game.day,game.isBoss);
  const total=game.phase==='day'?limit:night?nightLimit:1;
  const early=game.phase==='day'&&game.earlyNightAt;
  const left=game.phase==='day'?(early?game.earlyNightAt-game.phaseElapsed:limit-game.phaseElapsed):
    night?(game.spawnStopped?0:nightLimit-game.clock):0;
  clock.textContent=game.phase==='day'?(early?'提前入夜 '+timeLabel(left)+' · 再点一次取消':'距离入夜 '+timeLabel(left)):
    night?(game.spawnStopped?'清场中 · 残敌 '+game.enemies.length+' · 已用 '+timeLabel(game.cleanup):
      '第 '+(game.fronts[0]?.waves?.length||0)+' 波战役 · 距停止刷新 '+timeLabel(Math.max(0,left))):'';
  const fill=$('timeFill');
  if(fill){
    fill.style.width=Math.max(0,Math.min(100,left/total*100))+'%';
    fill.style.background=game.phase==='day'?'#e8b76c':game.spawnStopped?'#a1bd77':'#ed9a7c';
  }
  if(!night)return;
  const count=game.fronts.map(f=>(f.camp?campName(f.camp):game.castle?'主城':'追击')+' '+
    (f.schedule.filter(s=>!s.dispatched).length+game.enemies.filter(e=>e.front===f).length)).join(' · ');
  const boss=game.enemies.find(e=>e.boss);
  const down=game.hero.hp<=0&&game.castle?
    (game.heroDown?.phase==='waiting'?' · 领主 '+Math.max(0,Math.ceil(DEMO.heroDownDelay-game.heroDown.elapsed))+' 秒后回场':' · 本夜回场已用尽'):'';
  $('battleText').textContent=(game.castle?'城堡 '+Math.ceil(game.castleHp)+'/'+game.castleMax+' · ':'')+
    '领主 '+Math.ceil(game.hero.hp)+'/'+game.hero.max+down+' · '+count+
    (reserveCount()?' · 待援 '+reserveCount():'')+
    (boss?' · 首领生命 '+Math.ceil(boss.hp)+'/'+boss.max:'');
  const vitals=$('vitals');
  if(vitals)vitals.textContent=(game.castle?'城堡 '+Math.ceil(game.castleHp)+'/'+game.castleMax+' 耐久 · ':'')+
    '领主 '+Math.ceil(game.hero.hp)+'/'+game.hero.max+' 生命'+down;
}''')

# ---------------------------------------------------------------- 绘制：号令范围 + 集结预告
rep("""  const sel=game.tiles[game.selected];""",
"""  if(game.phase==='night'&&game.rallyCharges>0&&game.hero.hp>0){
    ctx.save();ctx.strokeStyle='#f3d39255';ctx.lineWidth=2;ctx.setLineDash([7,7]);
    ctx.beginPath();ctx.arc(game.hero.x*CELL,game.hero.y*CELL,DEMO.rallyRange*CELL,0,Math.PI*2);
    ctx.stroke();ctx.setLineDash([]);ctx.restore();
  }
  if(game.phase==='night')for(const f of game.fronts){
    if(!f.staging||game.clock>=f.firstWaveAt)continue;
    inCell(f.staging.x*CELL,f.staging.y*CELL,()=>{
      ctx.save();ctx.globalAlpha=.55+.3*Math.sin(performance.now()/180);
      oval(30,30,20,20,'#7a3a2f');ctx.restore();
      label('进军',30,30,15,'#ffe0a8');
    });
  }
  const sel=game.tiles[game.selected];""")

# ---------------------------------------------------------------- 文案
rep("""'粮食：粮田 +3/夜。金币：低产金矿 +3/夜、北境富金矿 +8/夜，另有夜战每击杀一只 +1、首领 +8。""",
"""'粮食：粮田 +3/夜。金币：低产金矿 +3/夜、北境富金矿 +8/夜；夜战击杀按本夜奖励票据结算（普通兵总预算 6/8/10/12/6 金，首领额外 8 金），不是每只固定 +1。""")
rep("""可对全场敌人打一次齐射，每夜 1 次，不使用也不会输。""",
"""可对领主周围 4 格内的敌人打一次齐射，每夜 1 次，不使用也不会输；地图上会画出一圈范围预览。""")
rep("""'页面不滚动。电脑和手机都会把领主保持在可视区域中心；""",
"""'v0.23：白天首日 120 秒、之后 90 秒，行动仍是 7 次；行动用完后可点「准备完毕 · 立即入夜」，3 秒内可取消，首日未建城会先做风险确认。夜战改成每夜 4 组显式波次，停刷后必须真实清完残敌才天亮。领主倒下时城堡还在，每夜最多一次 12 秒后以 40% 生命回场，期间不能动也不能承伤。',
  '页面不滚动。电脑和手机都会把领主保持在可视区域中心；""")

# ---------------------------------------------------------------- 导出
rep("""  tileSolid,enemyPassable,walkable,isSolidGround,actorRadius,circleHitsTile,canOccupy,""",
"""  NIGHT_PLAN,planFor,nightStopAt,nightLastWaveAt,plannedNormal,campNormal,campWaves,
  queueRecord,allocateTickets,createWavePlan,makeFront,frontHasRoom,isFrontComplete,
  takeReserve,reserveCount,stopFront,spawnDue,chooseStagingPoint,spawnEnemy,settleKill,
  damageEnemy,assignAttackSlots,attackSlotPoint,attackSlotPoints,requestEarlyNight,cancelEarlyNight,
  earlyNightReminders,updateHeroRecovery,
  tileSolid,enemyPassable,enemyBreakable,walkable,isSolidGround,actorRadius,circleHitsTile,canOccupy,""")

io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print('wrote', DST, len(s), 'chars')
