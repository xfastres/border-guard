# -*- coding: utf-8 -*-
"""v0.22 派生脚本：从 v0.21 复制并落地「实体地形 / 统一移动 / 居民呈现」。
   只做精确替换；所有 old 片段必须唯一命中，否则报错退出。"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Border-Guard-v0.21.html')
DST = os.path.join(ROOT, 'Border-Guard-v0.22.html')
s = io.open(SRC, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit('MISS (%d != %d): %r' % (n, count, old[:90]))
    s = s.replace(old, new)


def func_start(name):
    return s.index('function ' + name + '(')


def replace_func(name, new):
    """按花括号配对整段替换顶层函数。"""
    global s
    start = func_start(name)
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


# ---------------------------------------------------------------- 版本号
rep('全景地图 · 探索经营 · 昼夜守卫 · v0.21', '全景地图 · 探索经营 · 昼夜守卫 · v0.22')

# ---------------------------------------------------------------- 调参常量
rep("""  walkSpeed: 3.5,
};""", """  walkSpeed: 3.5,
  // v0.22 世界与碰撞：脚底圆半径（格）。圆只代表脚底占地，不含头顶、武器与阴影。
  radii:{hero:.22,resident:.22,normal:.20,heavy:.25,boss:.32},
  actorStepFactor:.5,   // 单个子步不超过半径的一半，避免大 dt 穿实体
  separation:.22,       // 温和分离强度，允许有限软重叠，不做互相堵死的硬墙
};""")

# ---------------------------------------------------------------- 世界 / 碰撞核心
replace_func('tileOf', r'''function tileOf(unit){
  return tileAt(Math.floor(unit.x),Math.floor(unit.y));
}''')

old_walk = s[s.index('function walkable(t){'):s.index('function scout(){')]
WORLD = r'''/* ===== v0.22 导航 / 移动 / 地形实体 =====
   规则一句话：水、成片林地、岩石 / 矿脉，以及城堡 / 塔 / 墙 / 营地核心都是整格实体；
   草地、道路、田地、农场与遗迹节点可通行。所有活体用脚底圆对实体格 AABB 判定。
   树石是整格实体，不是贴纸；草地上的草丛 / 碎石只是小装饰，不画成大物件。 */
function isSolidGround(t){
  return !!t&&(t.ground==='water'||t.ground==='trees'||t.ground==='rock');
}
function tileSolid(t){
  return !t||isSolidGround(t)||!!t.building||!!t.campSolid;
}
function walkable(t){
  return !!t&&!tileSolid(t);
}
// 敌军不能穿水 / 树 / 石 / 塔 / 城 / 营地核心，但墙是可拆障碍（走高代价路线）
function enemyPassable(t){
  if(!t||isSolidGround(t)||t.campSolid)return false;
  if(t.building&&t.building.type!=='wall')return false;
  return true;
}
function actorRadius(actor){
  return actor?.radius||DEMO.radii.hero;
}
function circleHitsTile(x,y,r,t){
  if(!t)return true;
  const cx=Math.max(t.x,Math.min(x,t.x+1)),cy=Math.max(t.y,Math.min(y,t.y+1));
  const dx=x-cx,dy=y-cy;
  return dx*dx+dy*dy<r*r-1e-9;
}
function canOccupy(actor,x,y){
  const r=actorRadius(actor);
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(x-r<0||y-r<0||x+r>WIDTH||y+r>HEIGHT)return false;
  const x0=Math.max(0,Math.floor(x-r)),x1=Math.min(WIDTH-1,Math.floor(x+r));
  const y0=Math.max(0,Math.floor(y-r)),y1=Math.min(HEIGHT-1,Math.floor(y+r));
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    const t=tileAt(tx,ty);
    if(tileSolid(t)&&circleHitsTile(x,y,r,t))return false;
  }
  return true;
}
// 统一运动入口：大步长拆成 <= 半径/2 的子步，受阻时沿障碍滑动，不穿角
function moveWithCollision(actor,dx,dy){
  const len=Math.hypot(dx,dy);
  if(!len)return 0;
  const r=actorRadius(actor);
  const steps=Math.max(1,Math.ceil(len/Math.max(.02,r*DEMO.actorStepFactor)));
  const sx=dx/steps,sy=dy/steps,ox=actor.x,oy=actor.y;
  for(let i=0;i<steps;i++){
    if(canOccupy(actor,actor.x+sx,actor.y+sy)){actor.x+=sx;actor.y+=sy;continue;}
    if(canOccupy(actor,actor.x+sx,actor.y))actor.x+=sx;
    if(canOccupy(actor,actor.x,actor.y+sy))actor.y+=sy;
  }
  return Math.hypot(actor.x-ox,actor.y-oy);
}
function stepToward(actor,goal,speed,dt){
  const dist=distance(actor,goal);
  if(dist<1e-6)return true;
  const step=Math.min(dist,Math.max(0,speed*dt));
  if(!step)return dist<.085;
  const dx=(goal.x-actor.x)/dist*step,dy=(goal.y-actor.y)/dist*step;
  const moved=moveWithCollision(actor,dx,dy);
  actor.moving=moved>step*.22;
  if(Math.abs(dx)>Math.abs(dy)*1.1)actor.face=dx<0?-1:1;
  return distance(actor,goal)<.085;
}
function takeStep(unit,goal,speed,dt){return stepToward(unit,goal,speed,dt);}
function findPath(from,to,pass=walkable){
  if(!from||!pass(to))return null;
  const start=at(from.x,from.y),end=at(to.x,to.y);
  const previous=new Map([[start,-1]]),queue=[start];
  for(let i=0;i<queue.length&&!previous.has(end);i++){
    const t=game.tiles[queue[i]];
    for(const [dx,dy] of dirs){
      const next=tileAt(t.x+dx,t.y+dy);
      if(!pass(next))continue;
      const key=at(next.x,next.y);
      if(previous.has(key))continue;
      previous.set(key,queue[i]);queue.push(key);
    }
  }
  if(!previous.has(end))return null;
  const route=[];
  for(let key=end;key!==start;key=previous.get(key))route.unshift(center(game.tiles[key]));
  return route.length?route:[center(to)];
}
// 建筑 / 营地是实体，交互一律取相邻可达服务位，不要求走进实体格中心
function serviceTiles(t){
  if(!t)return [];
  const out=[];
  if(walkable(t))out.push(t);
  for(const [dx,dy] of dirs){const n=tileAt(t.x+dx,t.y+dy);if(walkable(n))out.push(n);}
  return out;
}
function findApproachPath(actor,targetTile,purpose='move'){
  if(!targetTile||!actor)return null;
  let best=null,bestLen=Infinity;
  for(const s of serviceTiles(targetTile)){
    const p=findPath(tileOf(actor),s,walkable);
    if(!p)continue;
    const len=p.length+distance(actor,center(p[0]||s));
    if(len<bestLen){bestLen=len;best=p;}
  }
  return best;
}
function navigationRevision(){return game?.navigationRevision||0;}
function invalidateNavigation(){
  if(!game)return;
  game.navigationRevision=(game.navigationRevision||0)+1;
}
// 温和分离：避免同坐标重叠，允许有限软重叠，不做互相堵死的硬墙
function separateUnits(dt){
  const units=game.enemies.filter(e=>e.hp>0);
  if(units.length<2)return;
  const push=Math.min(1,dt*9)*DEMO.separation;
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],b=units[j],dx=b.x-a.x,dy=b.y-a.y;
    const min=(actorRadius(a)+actorRadius(b))*.9,d=Math.hypot(dx,dy);
    if(d>=min||d<1e-5)continue;
    const f=(min-d)/d*push*.5;
    const ax=a.x-dx*f,ay=a.y-dy*f,bx=b.x+dx*f,by=b.y+dy*f;
    if(canOccupy(a,ax,ay)){a.x=ax;a.y=ay;}
    if(canOccupy(b,bx,by)){b.x=bx;b.y=by;}
  }
}
/* 固定种子地图生成后，确定性地清出必要通道。
   只把「装饰性」树 / 石清成草地；保留资源与秘点坐标、水域、道路、城址；
   全程不调用 game.rnd()，因此强化卡顺序与强化卡候选完全不变。 */
function repairMapConnectivity(tiles){
  const key=(x,y)=>y*WIDTH+x;
  const plan=t=>!!t&&t.ground!=='water'&&!(t.node&&(t.ground==='trees'||t.ground==='rock'));
  const blocked=t=>!t||t.ground==='water'||t.ground==='trees'||t.ground==='rock'||!!t.building||!!t.campSolid;
  const start=key(8,5);
  const prev=new Map([[start,-1]]),q=[start];
  for(let i=0;i<q.length;i++){
    const t=tiles[q[i]];
    for(const [dx,dy] of dirs){
      const nx=t.x+dx,ny=t.y+dy;
      if(!inside(nx,ny))continue;
      const k=key(nx,ny);
      if(prev.has(k)||!plan(tiles[k]))continue;
      prev.set(k,q[i]);q.push(k);
    }
  }
  const compOf=()=>{
    const seen=new Set([start]),queue=[start];
    for(let i=0;i<queue.length;i++){
      const t=tiles[queue[i]];
      for(const [dx,dy] of dirs){
        const nx=t.x+dx,ny=t.y+dy;
        if(!inside(nx,ny))continue;
        const k=key(nx,ny);
        if(seen.has(k)||blocked(tiles[k]))continue;
        seen.add(k);queue.push(k);
      }
    }
    return seen;
  };
  const adjacent=t=>dirs.map(([dx,dy])=>[t.x+dx,t.y+dy]).filter(([x,y])=>inside(x,y)).map(([x,y])=>key(x,y));
  const groups=[[key(5,4)],[key(11,5)],[key(22,10)],[key(21,10)],[key(23,10)]];
  for(const t of tiles)if(t.node&&adjacent(t).length)groups.push(adjacent(t));
  groups.push(Array.from({length:HEIGHT},(_,y)=>key(0,y)));
  groups.push(Array.from({length:HEIGHT},(_,y)=>key(WIDTH-1,y)));
  let comp=compOf(),cleared=0;
  for(const group of groups){
    if(group.some(k=>comp.has(k)))continue;
    let best=-1,bestDepth=Infinity;
    for(const k of group){
      if(!prev.has(k))continue;
      let d=0,cur=k;
      while(prev.get(cur)!==-1&&d<3000){d++;cur=prev.get(cur);}
      if(d<bestDepth){bestDepth=d;best=k;}
    }
    if(best<0)continue;
    let cur=best,guard=0;
    while(prev.has(cur)&&guard++<3000){
      const t=tiles[cur];
      if(!t.node&&(t.ground==='trees'||t.ground==='rock')){t.ground='grass';cleared++;}
      if(comp.has(cur))break;
      cur=prev.get(cur);
      if(cur===-1)break;
    }
    comp=compOf();
  }
  return cleared;
}
'''
s = s.replace(old_walk, WORLD)

# ---------------------------------------------------------------- 建造前置校验
replace_func('canPlaceCamp', r'''function canPlaceCamp(t){
  if(!game.castle||!t?.visible||!walkable(t)||t.site!==undefined||t.node||t.building||t.campSolid)return false;
  return game.tiles.filter(cell=>Math.max(Math.abs(cell.x-t.x),Math.abs(cell.y-t.y))<=1)
    .every(cell=>!cell.owned&&!campAt(cell))&&
    findApproachPath(game.hero,t,'camp')!==null&&Boolean(campGate({tile:at(t.x,t.y)}));
}''')

replace_func('canBuildAt', r'''function canBuildAt(t){
  if(!walkable(t)||campCore(t)||t.campSolid||t.node)return false;
  if(t.owned)return true;
  const c=campAt(t);
  return Boolean(c?.controlled&&!c.lost)&&campDefenseCount(c)<DEMO.campDefenses;
}''')

replace_func('createCamp', r'''function createCamp(t){
  if(game.phase!=='day'||!canPlaceCamp(t)){toast('在已探明、远离现有领地的可通行陆地建立营地。');return null;}
  const reason=validateBuild(t);
  if(reason){toast('不能在这里建营地：'+reason);return null;}
  if(!spend(DEMO.campCost,true,'build','建立营地'))return null;
  const number=game.camps.length+1;
  const c={id:'camp-'+number,number,tile:at(t.x,t.y),hp:DEMO.campHealth,controlled:false,
    lost:false,running:false,financial:false,auto:false,paid:new Set(),damaged:false,guardTimer:0};
  game.camps.push(c);
  t.campSolid=true;
  invalidateNavigation();
  game.mode=null;game.selected=c.tile;openInspector(t);
  announce(campName(c)+'已建成。派一名培养过的居民前往驻守。');
  return c;
}
/* v0.22 建造前置校验：先验证，后扣费。
   不覆盖活体脚底圆；不围死领主；不切断在途居民任务的最后通路。
   敌军可以拆墙，所以「墙挡住敌人」不算永久封死，不参与校验。 */
function validateBuild(t){
  if(!t)return '地块无效';
  const actors=[game.hero,...game.residents.filter(x=>x.state!=='dead'),...game.enemies.filter(e=>e.hp>0)];
  for(const a of actors){
    if(circleHitsTile(a.x,a.y,actorRadius(a),t))return '有单位正站在这里，先让它离开';
  }
  const old=t.building,oldSolid=t.campSolid;
  t.building={type:'wall',hp:100,max:100};t.campSolid=true;
  let ok=true;
  if(game.castle&&!findApproachPath(game.hero,game.castle,'home'))ok=false;
  if(ok)for(const r of game.residents){
    if(!['outbound','returning','leaving','escorted'].includes(r.state))continue;
    const dest=r.targetTile||game.castle;
    if(dest&&!findApproachPath(r,dest,'home')){ok=false;break;}
  }
  t.building=old;t.campSolid=oldSolid;
  return ok?null:'会堵死领主或居民的必经道路';
}''')

# ---------------------------------------------------------------- 居民：站位与全状态
RESIDENT_HELPERS = r'''/* ===== v0.22 居民呈现 =====
   同一居民 ID 在地图只出现一次。getResidentPose 只产出表现状态，
   到岗 / 付费 / 停产 / 伤亡仍由 updateResidents + postResident 的业务状态决定，
   待机小动作不额外发资源、不提前触发到岗。 */
function residentAnchor(r){
  if(r.camp){
    const c=game.camps.find(item=>item.id===r.camp);
    if(c)return campTile(c);
  }
  return game.castle||tileOf(game.hero);
}
function slotCandidates(anchor){
  const out=[];
  const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],[2,0],[-2,0],[0,2],[0,-2]];
  for(const [dx,dy] of offsets){
    const t=tileAt(anchor.x+dx,anchor.y+dy);
    if(!walkable(t))continue;
    out.push({x:t.x+.5,y:t.y+.5});
    out.push({x:t.x+.32,y:t.y+.68});
  }
  return out;
}
function findResidentSlot(r,anchor){
  if(!anchor)return {x:game.hero.x,y:game.hero.y};
  const list=slotCandidates(anchor);
  if(!list.length)return {x:anchor.x+.5,y:anchor.y+.5};
  const used=new Set(game.residents.filter(o=>o!==r&&o.state!=='dead'&&
    ['home','posted','waiting','hurt'].includes(o.state)).map(o=>Math.round(o.x*10)+','+Math.round(o.y*10)));
  const start=(r.id*5+(r.state==='posted'?3:r.state==='waiting'?7:0))%list.length;
  for(let i=0;i<list.length;i++){
    const p=list[(start+i)%list.length],k=Math.round(p.x*10)+','+Math.round(p.y*10);
    if(!used.has(k)&&canOccupy(r,p.x,p.y))return p;
  }
  return list[start];
}
function getResidentPose(r,time){
  const state=r.state||'home';
  const activity=r.activity||(state==='posted'?(r.role==='guard'?'guard':'work'):
    state==='waiting'?'wait':state==='hurt'?'hurt':'idle');
  const phase=(time||0)/1000;
  const bob=r.moving?Math.sin(phase*11)*1.3:0;
  const work=activity==='work'?Math.sin(phase*4.4)*2.1:0;
  return {x:r.x,y:r.y,state,activity,role:r.role,face:r.face||1,bob,work,
    visible:state!=='dead',badge:state==='waiting'?'!':state==='hurt'?'休':
      ['outbound','returning','leaving','escorted'].includes(state)?'行':''};
}
'''
rep('function firstResidents(){', RESIDENT_HELPERS + 'function firstResidents(){')

replace_func('addResident', r'''function addResident(){
  const id=game.nextResident++;
  const anchor=game.castle||tileOf(game.hero);
  const r={id,role:null,state:'home',camp:null,hp:28,x:anchor.x+.5,y:anchor.y+.5,
    radius:DEMO.radii.resident,route:[],cooldown:0,face:1,moving:false,activity:'idle',
    hitCount:0,routeRevision:navigationRevision(),slot:null,slotAnchor:-1};
  game.residents.push(r);
  r.slot=findResidentSlot(r,anchor);r.slotAnchor=at(anchor.x,anchor.y);
  r.x=r.slot.x;r.y=r.slot.y;
  return r;
}''')

rep("""  const route=findPath(tileOf(r),campTile(c));
  if(!route){toast('营地和城堡之间没有可通行道路。');return false;}
  r.route=route;r.state='outbound';r.camp=c.id;""",
"""  const route=findApproachPath(r,campTile(c),'camp');
  if(!route){toast('营地和城堡之间没有可通行道路。');return false;}
  r.route=route;r.state='outbound';r.camp=c.id;r.targetTile=campTile(c);
  r.routeRevision=navigationRevision();r.blocked=false;r.stuck=0;r.slot=null;""")

rep("""  if(!findPath(tileOf(r),campTile(c))){toast('道路被挡住了，先保留培养费用。');return false;}""",
"""  if(!findApproachPath(r,campTile(c),'camp')){toast('道路被挡住了，先保留培养费用。');return false;}""")

rep("""  const route=escort?[]:findPath(tileOf(r),game.castle);
  if(!route)return false;
  r.route=route;""",
"""  const route=escort?[]:findApproachPath(r,game.castle,'home');
  if(!route)return false;
  r.route=route;r.targetTile=game.castle;
  r.routeRevision=navigationRevision();r.blocked=false;r.stuck=0;r.slot=null;
  if(escort)r.targetTile=game.castle;""")

rep("""  const ready=residents.filter(r=>game.castle&&findPath(tileOf(r),game.castle));""",
"""  const ready=residents.filter(r=>game.castle&&findApproachPath(r,game.castle,'home'));""")

replace_func('campGate', r'''function campGate(c){
  const target=campTile(c);
  // 敌人能够拆墙，出生路径允许穿过墙；入口必须在控制区之外、不能落在实体里。
  const enemyPass=t=>t===target||enemyPassable(t);
  const edge=game.tiles.filter(t=>walkable(t)&&(t.y===0||t.y===HEIGHT-1||t.x===0||t.x===WIDTH-1)&&
    Math.max(Math.abs(t.x-target.x),Math.abs(t.y-target.y))>=DEMO.campSpawnDistance);
  return edge.sort((a,b)=>distance(a,target)-distance(b,target)).find(t=>findPath(t,target,enemyPass))||null;
}''')

# ---------------------------------------------------------------- 居民主循环
replace_func('updateResidents', r'''function updateResidents(dt){
  let changed=false;
  const rev=navigationRevision();
  for(const r of game.residents){
    if(r.state==='dead'){r.moving=false;continue;}
    if(r.state==='hurt'&&game.day>=r.recoverDay){
      r.state='home';r.hp=28;r.slot=null;r.activity='idle';changed=true;continue;
    }
    if(['home','posted','waiting','hurt'].includes(r.state)){
      const anchor=residentAnchor(r),key=anchor?at(anchor.x,anchor.y):-1;
      if(!r.slot||r.slotAnchor!==key||!canOccupy(r,r.slot.x,r.slot.y)){
        r.slot=findResidentSlot(r,anchor);r.slotAnchor=key;
      }
      if(r.slot){
        const k=Math.min(1,dt*5);
        r.x+=(r.slot.x-r.x)*k;r.y+=(r.slot.y-r.y)*k;
      }
      r.moving=false;
      r.activity=r.state==='hurt'?'hurt':r.state==='waiting'?'wait':
        r.state==='posted'?(r.role==='guard'?'guard':'work'):'idle';
      continue;
    }
    // 在途：导航版本变化或受阻则重算。不能传送、穿墙、把寻路失败当到岗。
    r.retryCooldown=(r.retryCooldown||0)-dt;
    if(r.routeRevision!==rev||r.blocked){
      let replanned=false;
      if(r.retryCooldown<=0||r.routeRevision!==rev){
        r.retryCooldown=.8;
        const dest=r.targetTile||residentAnchor(r);
        const retry=dest?findApproachPath(r,dest,r.state==='outbound'?'camp':'home'):null;
        if(retry){
          r.route=retry;r.routeRevision=rev;replanned=true;
          if(r.blocked){r.blocked=false;report('道路恢复，居民 '+r.id+' 继续赶路。',true);changed=true;}
        }else if(!r.blocked){
          r.blocked=true;
          report('居民 '+r.id+' 道路受阻，原地等待；拆掉障碍后会自动重试。',true);changed=true;
        }
      }
      if(r.blocked){r.moving=false;r.activity='blocked';continue;}
      if(!replanned&&r.routeRevision!==rev)r.routeRevision=rev;
    }
    if(r.state==='escorted'){
      if(distance(r,center(game.castle))<.78){
        r.state='home';r.route=[];r.slot=null;r.activity='idle';changed=true;
        report('居民 '+r.id+' 已安全回城。');
      }else if(game.hero.hp>0&&distance(r,game.hero)>.55){
        stepToward(r,{x:game.hero.x,y:game.hero.y},DEMO.dispatchSpeed,dt);
        r.activity='walk';
      }
      continue;
    }
    const next=r.route?.[0];
    if(next){
      if(stepToward(r,next,DEMO.dispatchSpeed,dt))r.route.shift();
      r.activity='walk';
      if(!r.moving){r.stuck=(r.stuck||0)+dt;if(r.stuck>.9){r.stuck=0;r.blocked=true;}}
      else r.stuck=0;
    }
    if(r.state==='leaving'&&releaseEvacuee(r)){
      report('居民 '+r.id+' 已离开营地范围，不再受该营地失守影响。');changed=true;
    }
    if(r.route?.length)continue;
    if(r.state==='returning'){
      r.state='home';r.moving=false;r.slot=null;r.activity='idle';
      report('居民 '+r.id+' 已安全回城。');
    }else if(r.state==='outbound'){
      const c=game.camps.find(item=>item.id===r.camp);
      r.moving=false;
      if(c)postResident(r,c);
    }
    changed=true;
  }
  if(changed)sync();
}''')

# ---------------------------------------------------------------- 伤员口径 / 维修统计
rep("""    kills:0,castleDamage:0,castleRepair:0,buildingsLost:0,campsLost:[],hurt:0,dead:0,""",
"""    kills:0,castleDamage:0,castleRepair:0,buildingsLost:0,campsLost:[],hurt:0,dead:0,
    hurtIds:[],deadIds:[],repairs:0,""")

replace_func('hurtResident', r'''function hurtResident(r,defeated=false){
  if(!r||r.state==='dead'||r.hp<=0)return;
  r.hitCount=(r.hitCount||0)+1;
  const before=r.hp;
  r.hp=defeated?0:Math.max(0,r.hp-7);
  const book=nightBook();
  if(book){
    // 同一居民同夜只计一次受伤；死亡按 ID 单独记。受击次数另存 hitCount，不混用。
    if(book.hurtIds.includes(r.id)===false&&r.hp>0)book.hurtIds.push(r.id);
    book.hurt=book.hurtIds.length;
  }
  if(r.hp>0)return;
  r.camp=null;r.route=[];
  if(game.hard){
    r.state='dead';
    if(book){
      if(!book.deadIds.includes(r.id))book.deadIds.push(r.id);
      book.dead=book.deadIds.length;
    }
    report('居民 '+r.id+' 在战斗中阵亡。');
  }else{
    r.state='hurt';r.recoverDay=game.day+2;
    Object.assign(r,center(game.castle));r.slot=null;
    report('居民 '+r.id+' 受伤，已撤回城堡休养。');
  }
  sync();
}''')

rep("""    if(repairBook&&healed)repairBook.castleRepair+=healed;""",
"""    if(repairBook&&healed){repairBook.castleRepair+=healed;repairBook.repairs++;}""")
rep("""    t.node.damaged=false;
    announce(NODE_NAMES[t.node.kind]+'恢复生产。');""",
"""    t.node.damaged=false;
    const rb=nightBook();if(rb)rb.repairs++;
    announce(NODE_NAMES[t.node.kind]+'恢复生产。');""")
rep("""    b.hp=b.max;
    announce(BUILDS[b.type].label+'已修复。');""",
"""    b.hp=b.max;
    const rb=nightBook();if(rb)rb.repairs++;
    announce(BUILDS[b.type].label+'已修复。');""")
rep("""  c.hp=DEMO.campHealth;c.damaged=false;
  if(c.controlled&&!c.lost)retryCamp(c,true);""",
"""  c.hp=DEMO.campHealth;c.damaged=false;
  const rb=nightBook();if(rb)rb.repairs++;
  if(c.controlled&&!c.lost)retryCamp(c,true);""")

# ---------------------------------------------------------------- 建造 / 拆除 / 建城：导航失效
rep("""  if(!spend(spec.cost,true,'build',spec.label))return;
  t.building={type,hp:spec.hp,max:spec.hp,level:0,cooldown:0};""",
"""  const reason=validateBuild(t);
  if(reason){toast('不能在这里建造：'+reason);return;}
  if(!spend(spec.cost,true,'build',spec.label))return;
  t.building={type,hp:spec.hp,max:spec.hp,level:0,cooldown:0};
  invalidateNavigation();""")

rep("""  t.building=null;
  announce('拆除'+BUILDS[type].label+'，获得部分普通资源。');""",
"""  t.building=null;
  invalidateNavigation();
  announce('拆除'+BUILDS[type].label+'，获得部分普通资源。');""")

rep("""  game.castle=t;
  t.building={type:'castle'};""",
"""  game.castle=t;
  t.building={type:'castle'};
  invalidateNavigation();""")

# ---------------------------------------------------------------- 领主移动
replace_func('heroCanStep', r'''function heroCanStep(x,y){
  return canOccupy(game.hero,x,y);
}''')

replace_func('setDestination', r'''function setDestination(t){
  const route=findApproachPath(game.hero,t,'move');
  if(!route){toast('这里无法通行。');return;}
  game.hero.goal=route;
  game.heroGoalTile=t;game.heroGoalRevision=navigationRevision();
  game.hero.blocked=0;
  setCameraMode('follow');
}''')

_hero = s.index('function moveHero(dt){')
MOVE_HERO_OLD = s[s.index("  if(length){\n    setCameraMode('follow');", _hero):s.index('  }else h.moving=false;', _hero)]
MOVE_HERO_NEW = r'''  if(length){
    setCameraMode('follow');
    h.goal=null;game.heroGoalTile=null;
    if(dx)h.face=dx<0?-1:1;
    const before={x:h.x,y:h.y};
    moveWithCollision(h,dx/length*DEMO.walkSpeed*dt,dy/length*DEMO.walkSpeed*dt);
    h.moving=distance(before,h)>.001;
  }else if(h.goal?.length){
    if(game.heroGoalRevision!==navigationRevision()){
      const fresh=game.heroGoalTile?findApproachPath(h,game.heroGoalTile,'move'):null;
      if(fresh){h.goal=fresh;game.heroGoalRevision=navigationRevision();}
      else{h.goal=null;h.moving=false;toast('道路受阻，正在重新找路。');}
    }
    const next=h.goal?.[0];
    if(!next){h.goal=null;h.moving=false;}
    else{
      if(stepToward(h,next,DEMO.walkSpeed,dt))h.goal.shift();
      if(!h.moving){
        h.blocked=(h.blocked||0)+dt;
        if(h.blocked>.85){h.goal=null;h.blocked=0;toast('道路受阻，已停止移动。');}
      }else h.blocked=0;
    }
'''
s = s.replace(MOVE_HERO_OLD, MOVE_HERO_NEW)

# ---------------------------------------------------------------- 敌军流场
replace_func('calculateRoutes', r'''function calculateRoutes(front,target){
  const targetTile=target||(front.camp&&!front.camp.lost?campTile(front.camp):game.castle||tileOf(game.hero));
  const scores=Array(game.tiles.length).fill(Infinity);
  const seen=new Set();
  // 多源 Dijkstra：源是目标实体外侧的有效攻击位，不是实体格中心。
  let slots=serviceTiles(targetTile).filter(enemyPassable);
  if(!slots.length)slots=dirs.map(([dx,dy])=>tileAt(targetTile.x+dx,targetTile.y+dy)).filter(Boolean);
  for(const s of slots)scores[at(s.x,s.y)]=0;
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
      const cost=n.building?.type==='wall'?9.45:n.ground==='road'?.75:1.22;
      scores[index]=Math.min(scores[index],scores[chosen]+cost);
    }
  }
  front.route=scores;
  front.targetIndex=at(targetTile.x,targetTile.y);
  front.attackSlots=slots.map(center);
}''')

replace_func('moveEnemy', r'''function moveEnemy(e,dt){
  e.cooldown-=dt;e.flash=Math.max(0,(e.flash||0)-dt);
  const h=game.hero,front=e.front,camp=front.camp?.lost?null:front.camp;
  const targetTile=camp?campTile(camp):game.castle||tileOf(h);
  const targetPoint=center(targetTile);
  if(!camp&&!game.castle&&front.targetIndex!==at(targetTile.x,targetTile.y))calculateRoutes(front,targetTile);
  if(e.routeRevision!==navigationRevision()){e.next=null;e.routeRevision=navigationRevision();}
  if(e.cooldown<=0&&h.hp>0&&(h.invuln||0)<=0&&distance(e,h)<.82+e.radius){
    const impact=e.boss?16:e.heavy?8:4;
    h.hp=Math.max(0,h.hp-(game.artifact==='charm'?Math.ceil(impact*.75):impact));
    e.cooldown=.95;
    if(h.hp===0&&game.castle)report('领主受伤，城防继续坚守。');
  }else if(e.cooldown<=0){
    const resident=game.residents.find(r=>r.state!=='dead'&&
      ['outbound','returning','escorted','leaving'].includes(r.state)&&distance(e,r)<.82+e.radius);
    if(resident){hurtResident(resident);e.cooldown=1;}
  }
  // 贴到目标实体外侧的有效攻击位才打建筑，不能钻进实体格中心
  if(distance(e,targetPoint)<.82+e.radius){
    e.moving=false;
    if(e.cooldown<=0&&(camp||game.castle)){
      const impact=e.boss?19:e.heavy?9:5;
      if(camp){
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
      e.cooldown=1;
    }
    return;
  }
  if(!camp&&!game.castle&&tileOf(e)===targetTile){
    e.face=h.x<e.x?-1:1;
    stepToward(e,h,e.speed,dt);
    return;
  }
  // 墙是「停下来拆」的目标，不能按到达中心处理，否则每帧都会改选下一格
  const atGoal=()=>e.next&&e.next.building?.type!=='wall'&&distance(e,center(e.next))<.14;
  if(!e.next||atGoal()||(!enemyPassable(e.next)&&e.next.building?.type!=='wall')){
    const current=tileOf(e);
    const score=t=>front.route[at(t.x,t.y)]+(t.building?.type==='wall'?4.35:0);
    const options=dirs.map(([dx,dy])=>tileAt(current.x+dx,current.y+dy))
      .filter(t=>t&&enemyPassable(t)&&Number.isFinite(score(t)))
      .sort((a,b)=>score(a)-score(b));
    e.next=options[0]||null;
    if(!e.next){
      e.stuck=(e.stuck||0)+dt;
      if(!e.retried){e.retried=true;calculateRoutes(front);}
      if(e.stuck>2.5){
        e.stuck=0;e.retried=false;
        if(!e.pathWarned){e.pathWarned=true;report('敌军道路受阻，正在寻找进攻路线。',true);}
      }
      e.moving=false;
      return;
    }
    e.stuck=0;e.retried=false;
  }
  const goal=center(e.next),wall=e.next.building;
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
  }
  stepToward(e,goal,e.speed,dt);
}''')

# ---------------------------------------------------------------- 出生
rep("""  game.enemies.push({
    ...center(gate),front,hp,max:hp,boss:isBoss,heavy,
    speed:isBoss?.72:heavy?.86:1.38+(front.index%3)*.09,cooldown:0,flash:0,next:null
  });""",
"""  game.enemies.push({
    ...center(gate),front,hp,max:hp,boss:isBoss,heavy,
    radius:isBoss?DEMO.radii.boss:heavy?DEMO.radii.heavy:DEMO.radii.normal,
    speed:isBoss?.72:heavy?.86:1.38+(front.index%3)*.09,cooldown:0,flash:0,next:null,
    face:(gate.x>targetX(gate,front)?-1:1),moving:false,
    routeRevision:navigationRevision()
  });""")
rep("""function spawnEnemy(front){""",
"""function targetX(gate,front){
  const t=front.camp&&!front.camp.lost?campTile(front.camp):game.castle||tileOf(game.hero);
  return t?t.x:WIDTH/2;
}
function spawnEnemy(front){""")

# ---------------------------------------------------------------- 主循环：分离
rep("""  for(const e of game.enemies)if(e.hp>0)moveEnemy(e,dt);
  game.enemies=game.enemies.filter(e=>e.hp>0);""",
"""  for(const e of game.enemies)if(e.hp>0)moveEnemy(e,dt);
  separateUnits(dt);
  game.enemies=game.enemies.filter(e=>e.hp>0);""")

# ---------------------------------------------------------------- 地图生成与初始状态
rep("""  const state = {
    seed, rnd, sites, tiles, selected:at(8,5),""",
"""  const mapCleared=repairMapConnectivity(tiles);
  const state = {
    seed, rnd, sites, tiles, mapCleared, navigationRevision:0, selected:at(8,5),""")
rep("""    hero:{x:8.5,y:5.5,hp:100,max:100,cooldown:0,hit:0,goal:null,face:1,moving:false}, heroLevel:0,""",
"""    hero:{x:8.5,y:5.5,hp:100,max:100,cooldown:0,hit:0,goal:null,face:1,moving:false,
      radius:DEMO.radii.hero,invuln:0}, heroLevel:0,""")

# ---------------------------------------------------------------- 渲染：地形拆层
replace_func('terrain', r'''function terrain(t){
  inCell(t.x*CELL,t.y*CELL,()=>{
    const x=0,y=0,v=t.variation;
    if(t.ground==='water'){
      rect(x,y,60,60,v>.5?'#3d615c':'#3b5b58');
      line(x+6,y+13,x+26,y+12,'#65827a');line(x+36,y+42,x+51,y+40,'#68897b');
      line(x+11,y+48,x+26,y+47,'#4e766e');
      return;
    }
    const colors=t.owned?['#70805a','#78865c','#71815c','#79865c']:['#5d7457','#647859','#5c7354','#687b58'];
    rect(x,y,60,60,colors[Math.floor(v*colors.length)]);
    const speck='#7f95664c';
    for(let i=0;i<5;i++){
      const dx=(7+i*17+v*29)%57,dy=(11+i*11+v*47)%58;
      rect(x+dx,y+dy,1+i%3,1,speck);
    }
    if(t.ground==='road'){
      const east=tileAt(t.x+1,t.y)?.ground==='road', west=tileAt(t.x-1,t.y)?.ground==='road';
      const south=tileAt(t.x,t.y+1)?.ground==='road', north=tileAt(t.x,t.y-1)?.ground==='road';
      if(east||west||!(north||south)){
        path([[x,y+21],[x+21,y+18+v*3],[x+43,y+22],[x+60,y+20],[x+60,y+44],[x+35,y+43],[x+13,y+39],[x,y+43]],'#9d8e65');
        line(x+8,y+33,x+25,y+29,'#b7a47b');line(x+40,y+36,x+52,y+34,'#b7a47b');
      }
      if(north||south){
        path([[x+21,y],[x+18+v*3,y+21],[x+22,y+43],[x+20,y+60],[x+44,y+60],[x+43,y+35],[x+39,y+13],[x+43,y]],'#9d8e65');
        line(x+33,y+8,x+29,y+25,'#b7a47b');line(x+36,y+40,x+34,y+52,'#b7a47b');
      }
      if(t.x===8&&t.y===4)rect(x+18,y+33,21,27,'#9d8e65');
      if(t.x===8&&t.y===5)rect(x+18,y,21,30,'#9d8e65');
    }
    if(!t.visible&&t.field)wheatPatch(30,32);
    else if(!t.node&&v>.65&&t.ground==='grass'){
      // 草丛 / 碎石只是可穿行的小装饰，不能画成实体树石那种大物件
      line(x+16,y+42,x+14,y+37,'#a3a676');line(x+16,y+42,x+20,y+36,'#a3a676');
      oval(x+45,y+17,2,1,'#a6a46b');
    }
  });
}
function drawFoliage(t){
  inCell(t.x*CELL,t.y*CELL,()=>{
    const x=0,y=0;
    const revealedNode=t.visible&&t.node;
    if(t.ground==='trees'&&!revealedNode){
      oval(x+34,y+41,21,10,'#435c3f70');
      pine(x+22,y+40,30);pine(x+39,y+45,35,true);pine(x+48,y+29,20);
    }
    if(t.ground==='rock'&&!revealedNode){
      oval(x+34,y+43,19,8,'#414f3f60');
      rock(x+29,y+39,16);rock(x+43,y+43,9);
    }
  });
}''')

# ---------------------------------------------------------------- 人物绘制
replace_func('fighter', r'''function fighter(e,hero=false){
  const x=e.x*CELL+(e.shakeX||0),y=e.y*CELL+(e.shakeY||0);
  const s=(e.boss?1.65:1)*(CELL/60);
  const bob=e.moving?Math.sin(performance.now()/85)*1.15:0;
  ctx.save();ctx.translate(x,y);ctx.scale(s*(e.face<0?-1:1),s);ctx.translate(0,bob);
  oval(0,9,13,6,'#111e1bb0');
  if(hero){
    path([[-10,10],[-8,-7],[7,-8],[13,10]],'#437787','#233c47',2);
    rect(-6,-12,12,11,'#d3bd9b');rect(-7,-15,13,6,'#c0c5b4');
    line(5,3,14,-12,'#f0d39c',3);
    oval(-10,2,5,7,'#b79b5c');
    if(e.hit>0){
      ctx.strokeStyle='#ffe1a2';ctx.globalAlpha=Math.min(1,e.hit*5);ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,0,33,-1.4,1.5);ctx.stroke();ctx.globalAlpha=1;
    }
  }else{
    const armor=e.boss?'#aa6266':e.heavy?'#8f8588':'#a3745d';
    const fill=e.flash>0?'#ffe0ac':armor;
    path([[-11,7],[-9,-8],[-5,-11],[8,-10],[12,7],[5,12],[-6,12]],fill,'#513d3c',2);
    path([[-7,-6],[-12,-16],[-3,-12],[7,-12],[13,-18],[10,-4]],e.boss?'#e9a38a':'#7c6252');
    rect(-5,-5,3,3,'#ffdf95');rect(3,-5,3,3,'#ffdf95');
    if(e.cooldown<=0&&game.hero.hp>0&&distance(e,game.hero)<1.25){
      ctx.strokeStyle='#ed9a7c';ctx.globalAlpha=.55;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
  }
  bar(-14,-23,28,e.hp/e.max,hero?'#b0d7c8':'#e58b72');
  ctx.restore();
}
function drawResident(r){
  const pose=getResidentPose(r,performance.now());
  if(!pose.visible)return;
  const s=CELL/60;
  ctx.save();
  ctx.translate(pose.x*CELL,pose.y*CELL);
  ctx.scale(s*(pose.face<0?-1:1),s);
  const b=pose.bob;
  oval(0,8,8,4,'#111e1b9c');
  const colors={miner:'#c9a55e',wood:'#77a86b',guard:'#8fa9c4'};
  const cloak=colors[pose.role]||'#b8ae8e';
  path([[-6,7+b],[-5,-5+b],[5,-5+b],[7,7+b]],cloak,'#3b4639',1.6);
  rect(-4,-12+b,8,8,'#e2cba6');
  if(pose.role==='miner'){
    rect(-5,-15+b,10,3,'#8b7042');
    line(6,2+b,10,-6+b+pose.work,'#d8c28a',2);
  }else if(pose.role==='wood'){
    rect(-5,-15+b,10,3,'#4f6b46');
    line(6,1+b,11,-8+b+pose.work,'#a97b4e',2);
  }else if(pose.role==='guard'){
    path([[-6,-13+b],[0,-19+b],[6,-13+b]],'#7c8b9b','#3d4a52',1.2);
    line(7,3+b,7,-12+b,'#cfd6d2',2);
  }else rect(-5,-15+b,10,3,'#9a8f72');
  if(pose.activity==='hurt'){
    line(-5,-3+b,4,1+b,'#f3e3cf',2);rect(-2,-10+b,4,3,'#f3e3cf');
  }
  if(pose.badge){
    oval(8,-19,7,7,pose.state==='waiting'?'#8d4b3c':'#3b5c74');
    label(pose.badge,8,-19,9,'#ffe9bd');
  }
  ctx.restore();
}
function drawMilitia(){
  if(!game.castle||!game.militia)return;
  const anchor=game.castle;
  for(let i=0;i<game.militia;i++){
    const t=tileAt(anchor.x+(i?2:-2),anchor.y+1);
    if(!t||!walkable(t))continue;
    const x=(t.x+.5)*CELL,y=(t.y+.5)*CELL,s=CELL/60;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    oval(0,8,9,4,'#111e1b9c');
    path([[-7,7],[-6,-6],[6,-6],[8,7]],'#6c8a72','#2d4036',1.6);
    rect(-4,-13,8,8,'#dcc6a2');
    line(7,4,8,-14,'#cfd6cf',2);
    ctx.restore();
  }
}''')

# ---------------------------------------------------------------- draw() 按脚底 Y 排序
DRAW_START = s.index('function draw(){')
DRAW_END = s.index('/* v0.20：地图相机', DRAW_START)
DRAW = r'''function draw(){
  if(!game)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const isNight=game.phase==='night';
  for(const t of game.tiles){
    const x=t.x*CELL,y=t.y*CELL;
    terrain(t);
    rect(x,y,CELL,1,'#1b322824');rect(x,y,1,CELL,'#1b322824');
    if(!t.visible){
      inCell(x,y,()=>{
        rect(0,0,60,60,'#283b34a6');
        line(9,51,52,9,'#7984771f');
      });
    }
  }
  const shade=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  shade.addColorStop(0,isNight?'#141e3d59':'#efd99414');
  shade.addColorStop(1,isNight?'#1323346b':'#203a2f26');
  rect(0,0,canvas.width,canvas.height,shade);
  boundaries(!game.castle);
  if(!game.castle){
    game.sites.forEach((s,i)=>{
      inCell(s.x*CELL,s.y*CELL,()=>{
        oval(30,30,23,23,'#2b3526');oval(30,30,19,19,'#ecc37d');label(i?'B':'A',30,31,23,'#28251d');
        label(SITE_NAMES[i],30,68,17,'#fff0c6');
      });
    });
  }
  if(['day','night'].includes(game.phase)){
    const gates=game.phase==='night'?game.fronts.flatMap(front=>front.gates):entrances(game.day);
    for(const t of gates){
      inCell(t.x*CELL,t.y*CELL,()=>{
        oval(30,31,15,15,'#582e2d');path([[23,24],[37,31],[23,38]],'#ef9e81');
      });
    }
  }
  const sel=game.tiles[game.selected];
  if(sel&&game.panel){
    ctx.strokeStyle='#ffe1a0';ctx.lineWidth=3;ctx.strokeRect(sel.x*CELL+2*CELL/60,sel.y*CELL+2*CELL/60,(60-4)*CELL/60,(60-4)*CELL/60);
    if(sel.building?.type==='tower'){
      ctx.beginPath();ctx.arc((sel.x+.5)*CELL,(sel.y+.5)*CELL,towerRange(sel.building)*CELL,0,Math.PI*2);
      ctx.fillStyle='#edd39415';ctx.fill();ctx.strokeStyle='#ffe1a093';ctx.setLineDash([6,6]);ctx.stroke();ctx.setLineDash([]);
    }
  }
  const route=game.hero.goal;
  if(route?.length&&game.hero.hp>0&&['day','night'].includes(game.phase)){
    const last=route[route.length-1];
    ctx.save();ctx.strokeStyle='#ffe1a099';ctx.lineWidth=Math.max(2,CELL*.05);ctx.setLineDash([CELL*.16,CELL*.14]);
    ctx.beginPath();ctx.moveTo(game.hero.x*CELL,game.hero.y*CELL);
    for(const p of route)ctx.lineTo(p.x*CELL,p.y*CELL);
    ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(last.x*CELL,last.y*CELL,CELL*.24,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(last.x*CELL,last.y*CELL,CELL*.07,0,Math.PI*2);ctx.fillStyle='#ffe1a0';ctx.fill();
    ctx.restore();
  }
  /* v0.22 遮挡：建筑、树石、营地、居民、领主、敌军统一按脚底 Y 排序。
     树冠遮住领主时局部半透明；只在 Canvas 绘制层处理，不动相机与 HUD。 */
  const sprites=[];
  for(const t of game.tiles){
    if(t.ground==='trees'||t.ground==='rock'){
      const hiddenBehind=game.hero.hp>0&&Math.abs(game.hero.x-(t.x+.5))<.9&&
        game.hero.y<t.y+1&&game.hero.y>t.y-1.1;
      sprites.push({y:t.y+1,fn:()=>{
        if(hiddenBehind){ctx.save();ctx.globalAlpha=.78;drawFoliage(t);ctx.restore();}
        else drawFoliage(t);
      }});
    }
    if(t.visible&&t.node)sprites.push({y:t.y+1,fn:()=>nodeArt(t)});
    if(t.building)sprites.push({y:t.y+1,fn:()=>structure(t)});
  }
  for(const c of game.camps)sprites.push({y:campTile(c).y+1,fn:()=>drawCamp(c)});
  for(const r of game.residents)if(r.state!=='dead')sprites.push({y:r.y,fn:()=>drawResident(r)});
  if(game.militia)sprites.push({y:game.castle?game.castle.y+1.4:0,fn:drawMilitia});
  if(game.hero.hp>0&&['day','night'].includes(game.phase))sprites.push({y:game.hero.y,fn:()=>fighter(game.hero,true)});
  if(isNight)for(const e of game.enemies)sprites.push({y:e.y,fn:()=>fighter(e)});
  sprites.sort((a,b)=>a.y-b.y);
  for(const sp of sprites)sp.fn();
  if(isNight){
    for(const e of game.effects){
      const fade=e.time/e.max;
      if(e.type==='arrow')line(e.x*CELL,e.y*CELL-12*CELL/60,e.tx*CELL,e.ty*CELL-6*CELL/60,'rgba(255,217,132,'+fade+')',2);
      else oval(e.x*CELL,e.y*CELL,11*fade*CELL/60,11*fade*CELL/60,e.color);
    }
  }
  if(game.phase==='won')drawVictoryMarks();
  syncSheet();
  followHero();
}

'''
s = s[:DRAW_START] + DRAW + s[DRAW_END:]

# ---------------------------------------------------------------- 台词与导出
rep("""'白天走路探明地块，点亮的 A / B 可以建城；树、石堆、田垄是资源线索，占领并开发后每夜结束天亮才结算。天黑自动开始夜袭，箭塔和守卫会自动作战。'""",
"""'白天走路探明地块，点亮的 A / B 可以建城；成片树林、岩石、矿脉和建筑都是整格实体，人只能走到旁边的空地；田垄是资源线索，占领并开发后每夜结束天亮才结算。天黑自动开始夜袭，箭塔和守卫会自动作战。'""")
rep("""  '页面不滚动。电脑和手机都会把领主保持在可视区域中心；""",
"""  'v0.22：居民现在全部显示在地图上——城里待机、营地工作、缺钱粮会显示「!」、伤员在城边休养；人物和树石按脚底前后遮挡。建造前会检查有没有单位站在脚下、会不会堵死必经道路，失败不扣资源和行动。',
  '页面不滚动。电脑和手机都会把领主保持在可视区域中心；""")
rep("""  tickCampaign,makeGame,raidCamp,evacuateCamp,loseCamp,exploreNode,""",
"""  tickCampaign,makeGame,raidCamp,evacuateCamp,loseCamp,exploreNode,
  tileSolid,enemyPassable,walkable,isSolidGround,actorRadius,circleHitsTile,canOccupy,
  moveWithCollision,stepToward,serviceTiles,findApproachPath,findPath,navigationRevision,
  invalidateNavigation,separateUnits,repairMapConnectivity,
  residentAnchor,findResidentSlot,slotCandidates,getResidentPose,validateBuild,
  hurtResident,addResident,drawResident,drawMilitia,fighter,drawFoliage,""")

io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print('wrote', DST, len(s), 'chars')
